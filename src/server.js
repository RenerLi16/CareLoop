import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  compilePlan,
  generateTasks,
  mergeTasks,
  reconcilePlan,
  logWarnings,
  toICS,
} from "./domain.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(root, "data");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(path.join(dataDir, "careloop.sqlite"));
chmodSync(path.join(dataDir, "careloop.sqlite"), 0o600);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,salt TEXT,hash TEXT);
CREATE TABLE IF NOT EXISTS families(id TEXT PRIMARY KEY,name TEXT,state TEXT,version INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS members(user_id TEXT,family_id TEXT,role TEXT,PRIMARY KEY(user_id,family_id));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);
CREATE TABLE IF NOT EXISTS invites(token TEXT PRIMARY KEY,family_id TEXT,role TEXT,expires INTEGER);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, family_id TEXT, actor TEXT, action TEXT, at TEXT, details TEXT);`);
if (
  !db
    .prepare("PRAGMA table_info(audit)")
    .all()
    .some((c) => c.name === "details")
)
  db.exec("ALTER TABLE audit ADD COLUMN details TEXT");
const id = () => randomBytes(18).toString("hex"),
  hash = (s) => createHash("sha256").update(s).digest("hex");
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const empty = () => ({ plan: null, tasks: [], revision: 0 });
const limits = new Map();
function rate(req) {
  const k = req.socket.remoteAddress,
    now = Date.now(),
    r = limits.get(k) || { n: 0, until: now + 60000 };
  if (now > r.until) {
    r.n = 0;
    r.until = now + 60000;
  }
  if (++r.n > 30)
    fail(429, "Too many sign-in attempts. Try again in a minute.");
  limits.set(k, r);
}
function audit(family, actor, action, details = null) {
  db.prepare(
    "INSERT INTO audit(family_id,actor,action,at,details) VALUES(?,?,?,?,?)",
  ).run(
    family,
    actor,
    action,
    new Date().toISOString(),
    details ? JSON.stringify(details) : null,
  );
}
async function body(req) {
  let b = "";
  for await (const chunk of req) {
    b += chunk;
    if (Buffer.byteLength(b) > 2000000)
      fail(413, "This file is too large (maximum 2 MB).");
  }
  try {
    return JSON.parse(b || "{}");
  } catch {
    fail(400, "Invalid request data.");
  }
}
function userFor(req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("careloop_session="))
    ?.slice(17);
  if (!token) return null;
  return db
    .prepare(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
    )
    .get(hash(token), Date.now());
}
function memberFor(u) {
  return db
    .prepare(
      "SELECT m.*,f.state,f.version,f.name as family_name FROM members m JOIN families f ON f.id=m.family_id WHERE m.user_id=?",
    )
    .get(u.id);
}
function session(res, user) {
  const token = id();
  db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    hash(token),
    user.id,
    Date.now() + 7 * 86400000,
  );
  res.setHeader(
    "Set-Cookie",
    `careloop_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.SECURE_COOKIES === "true" ? "; Secure" : ""}`,
  );
}
function reply(res, status, value, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(value) : value);
}
function snapshot(user, m) {
  return {
    user: { id: user.id, name: user.name, email: user.email },
    role: m.role,
    familyName: m.family_name,
    version: m.version,
    ...JSON.parse(m.state),
    team: db
      .prepare(
        "SELECT u.id,u.name,u.email,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE family_id=?",
      )
      .all(m.family_id),
    audit: db
      .prepare(
        "SELECT a.action,a.at,a.details,u.name FROM audit a LEFT JOIN users u ON u.id=a.actor WHERE family_id=? ORDER BY a.id DESC LIMIT 50",
      )
      .all(m.family_id),
  };
}
function checkPlanInput(plan) {
  if (
    !plan ||
    !Array.isArray(plan.meds) ||
    !Array.isArray(plan.followups) ||
    plan.followups.length > 50 ||
    !Array.isArray(plan.flags) ||
    plan.flags.length > 100
  )
    fail(400, "Invalid plan format.");
  if (
    typeof plan.patient !== "string" ||
    typeof plan.startDate !== "string" ||
    typeof plan.timeZone !== "string" ||
    !plan.prefs ||
    typeof plan.prefs !== "object" ||
    plan.meds.some(
      (m) =>
        !m ||
        ["id", "drug", "dose", "freq", "meal"].some(
          (k) => typeof m[k] !== "string",
        ) ||
        (m.gapTarget != null && typeof m.gapTarget !== "string"),
    ) ||
    plan.followups.some(
      (f) => !f || typeof f.id !== "string" || typeof f.provider !== "string",
    ) ||
    plan.flags.some((f) => typeof f !== "string") ||
    (plan.unresolved && !Array.isArray(plan.unresolved))
  )
    fail(400, "Invalid plan fields.");
  if (JSON.stringify(plan).length > 200000) fail(400, "Plan is too large.");
}
function cleanTaskPatch(t, b, m) {
  if (b.who !== undefined) {
    if (
      b.who &&
      !db
        .prepare("SELECT 1 FROM members WHERE user_id=? AND family_id=?")
        .get(b.who, m.family_id)
    )
      fail(400, "Choose a member of this care team.");
    t.who = b.who;
  }
  if (b.status !== undefined) {
    if (!["todo", "done", "skipped"].includes(b.status))
      fail(400, "Invalid task status.");
    t.status = b.status;
    if (b.status === "todo") {
      t.actualAt = null;
      t.value = null;
    } else {
      const dt = new Date(b.actualAt);
      if (isNaN(dt) || dt.getTime() > Date.now() + 60000)
        fail(400, "Enter the actual time, no later than now.");
      t.actualAt = dt.toISOString();
    }
  }
  if (b.note !== undefined) t.note = String(b.note).slice(0, 2000);
  if (t.status === "done" && t.kind === "weight") {
    const n = Number(b.value ?? t.value?.amount),
      unit = b.unit ?? t.value?.unit;
    if (!Number.isFinite(n) || n <= 0 || !["kg", "lb"].includes(unit))
      fail(400, "Record a positive weight and its unit.");
    t.value = { amount: n, unit };
  }
  if (t.status === "done" && t.kind === "symptoms") {
    const text = String(b.value ?? t.value ?? "").trim();
    if (!text) fail(400, "Record the symptoms, or write “none”.");
    t.value = text.slice(0, 2000);
  }
}
export const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  try {
    const url = new URL(req.url, "http://localhost");
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !==
        `${process.env.SECURE_COOKIES === "true" ? "https" : "http"}://${req.headers.host}`
    )
      fail(403, "This request came from a different website.");
    if (url.pathname.startsWith("/api/")) {
      if (
        req.method === "POST" &&
        ["/api/register", "/api/login"].includes(url.pathname)
      ) {
        rate(req);
        const b = await body(req),
          email = String(b.email || "")
            .trim()
            .toLowerCase(),
          password = String(b.password || "");
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          password.length < 12 ||
          password.length > 256
        )
          fail(400, "Use a valid email and a password of 12–256 characters.");
        if (url.pathname === "/api/register") {
          const name = String(b.name || "").trim();
          if (!name || name.length > 100)
            fail(400, "Enter your name (up to 100 characters).");
          if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email))
            fail(409, "An account with that email already exists.");
          const salt = id(),
            userId = id();
          let invite = null;
          if (b.invite) {
            invite = db
              .prepare("SELECT * FROM invites WHERE token=? AND expires>?")
              .get(hash(b.invite), Date.now());
            if (!invite)
              fail(400, "This invitation expired or has already been used.");
          }
          db.exec("BEGIN IMMEDIATE");
          try {
            db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
              userId,
              email,
              name,
              salt,
              scryptSync(password, salt, 64).toString("hex"),
            );
            let familyId = invite?.family_id;
            if (!familyId) {
              familyId = id();
              db.prepare(
                "INSERT INTO families(id,name,state) VALUES(?,?,?)",
              ).run(
                familyId,
                String(b.familyName || `${name}'s care team`).slice(0, 100),
                JSON.stringify(empty()),
              );
            }
            db.prepare("INSERT INTO members VALUES(?,?,?)").run(
              userId,
              familyId,
              invite?.role || "owner",
            );
            if (invite)
              db.prepare("DELETE FROM invites WHERE token=?").run(invite.token);
            if (invite)
              db.prepare(
                "UPDATE families SET version=version+1 WHERE id=?",
              ).run(familyId);
            audit(familyId, userId, "Joined care team");
            db.exec("COMMIT");
          } catch (e) {
            db.exec("ROLLBACK");
            throw e;
          }
          session(res, { id: userId });
          reply(res, 201, { ok: true });
          return;
        }
        const u = db.prepare("SELECT * FROM users WHERE email=?").get(email);
        const computed = scryptSync(
          password,
          u?.salt || "dummy-salt-for-timing",
          64,
        );
        if (!u || !timingSafeEqual(computed, Buffer.from(u.hash, "hex")))
          fail(401, "Email or password is incorrect.");
        session(res, u);
        reply(res, 200, { ok: true });
        return;
      }
      const user = userFor(req);
      if (!user) fail(401, "Please sign in.");
      const m = memberFor(user);
      if (!m) fail(403, "No care team was found.");
      if (req.method === "POST" && url.pathname === "/api/logout") {
        const token = (req.headers.cookie || "")
          .split(";")
          .map((x) => x.trim())
          .find((x) => x.startsWith("careloop_session="))
          ?.slice(17);
        if (token)
          db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
        res.setHeader(
          "Set-Cookie",
          "careloop_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        );
        reply(res, 200, { ok: true });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/password") {
        rate(req);
        const b = await body(req),
          next = String(b.newPassword || "");
        if (next.length < 12 || next.length > 256)
          fail(400, "Use a new password of 12–256 characters.");
        if (
          !timingSafeEqual(
            scryptSync(String(b.currentPassword || ""), user.salt, 64),
            Buffer.from(user.hash, "hex"),
          )
        )
          fail(403, "Your current password is incorrect.");
        const salt = id();
        db.prepare("UPDATE users SET salt=?,hash=? WHERE id=?").run(
          salt,
          scryptSync(next, salt, 64).toString("hex"),
          user.id,
        );
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
        session(res, user);
        reply(res, 200, { ok: true });
        return;
      }
      if (req.method === "GET") {
        if (url.pathname === "/api/state") {
          reply(res, 200, snapshot(user, m));
          return;
        }
        if (url.pathname === "/api/calendar") {
          res.setHeader(
            "Content-Disposition",
            'attachment; filename="careloop.ics"',
          );
          reply(
            res,
            200,
            toICS(JSON.parse(m.state).tasks),
            "text/calendar; charset=utf-8",
          );
          return;
        }
        if (url.pathname === "/api/backup") {
          if (m.role !== "owner")
            fail(403, "Only the team owner can export a backup.");
          res.setHeader(
            "Content-Disposition",
            'attachment; filename="careloop-backup.json"',
          );
          reply(res, 200, {
            format: "careloop-1",
            exportedAt: new Date().toISOString(),
            ...JSON.parse(m.state),
          });
          return;
        }
      }
      if (req.method === "POST") {
        const b = await body(req);
        if (m.role === "viewer") fail(403, "Your access is view only.");
        if (url.pathname === "/api/invite") {
          if (m.role !== "owner")
            fail(403, "Only the team owner can invite people.");
          if (!["editor", "viewer"].includes(b.role))
            fail(400, "Choose editor or viewer.");
          const token = id();
          db.prepare("INSERT INTO invites VALUES(?,?,?,?)").run(
            hash(token),
            m.family_id,
            b.role,
            Date.now() + 48 * 3600000,
          );
          audit(m.family_id, user.id, "Created an invitation");
          reply(res, 201, { token });
          return;
        }
        if (url.pathname === "/api/member") {
          if (m.role !== "owner" || b.userId === user.id)
            fail(403, "The owner can change other team members.");
          if (!["editor", "viewer", "remove"].includes(b.role))
            fail(400, "Invalid role.");
          if (b.role === "remove")
            db.prepare(
              "DELETE FROM members WHERE user_id=? AND family_id=?",
            ).run(b.userId, m.family_id);
          else
            db.prepare(
              "UPDATE members SET role=? WHERE user_id=? AND family_id=?",
            ).run(b.role, b.userId, m.family_id);
          const state = JSON.parse(m.state);
          if (b.role === "remove")
            for (const t of state.tasks) if (t.who === b.userId) t.who = "";
          db.prepare(
            "UPDATE families SET version=version+1,state=? WHERE id=?",
          ).run(JSON.stringify(state), m.family_id);
          audit(m.family_id, user.id, "Updated team access");
          reply(res, 200, { ok: true });
          return;
        }
        db.exec("BEGIN IMMEDIATE");
        try {
          const fresh = db
            .prepare("SELECT * FROM families WHERE id=?")
            .get(m.family_id);
          if (b.version !== fresh.version)
            fail(
              409,
              "Someone changed the care record. Refresh, review their changes, and try again.",
            );
          let state = JSON.parse(fresh.state),
            action = "",
            auditDetails = null;
          if (url.pathname === "/api/plan") {
            checkPlanInput(b.plan);
            b.plan = reconcilePlan(state.plan, b.plan);
            const compiled = compilePlan(b.plan);
            if (!compiled.ok) fail(422, compiled.errors.join("\n"));
            let newTasks;
            try {
              newTasks = generateTasks(b.plan, compiled);
            } catch (e) {
              fail(422, e.message);
            }
            state = {
              ...state,
              plan: { ...b.plan, compiled },
              tasks: mergeTasks(state.tasks, newTasks),
              revision: state.revision + 1,
            };
            action = "Published care plan revision " + state.revision;
          } else if (url.pathname === "/api/task") {
            const t = state.tasks.find((t) => t.id === b.id);
            if (!t || t.archived) fail(404, "This task is no longer active.");
            const before = structuredClone(t);
            cleanTaskPatch(t, b, m);
            auditDetails = { before, after: structuredClone(t) };
            t.updatedBy = user.id;
            t.updatedAt = new Date().toISOString();
            action = `Updated task: ${t.label} (${t.status})`;
          } else if (url.pathname === "/api/restore") {
            if (m.role !== "owner")
              fail(403, "Only the team owner can restore a backup.");
            const saved = b.backup;
            if (
              saved?.format !== "careloop-1" ||
              !Array.isArray(saved.tasks) ||
              saved.tasks.length > 10000
            )
              fail(400, "Invalid CareLoop backup.");
            if (saved.plan) {
              checkPlanInput(saved.plan);
              const compiled = compilePlan(saved.plan);
              if (!compiled.ok)
                fail(400, "Backup plan did not pass validation.");
              try {
                generateTasks(saved.plan, compiled);
              } catch (e) {
                fail(400, e.message);
              }
              saved.plan.compiled = compiled;
            }
            const taskIds = new Set();
            for (const t of saved.tasks) {
              if (
                typeof t.id !== "string" ||
                taskIds.has(t.id) ||
                !["med", "visit", "weight", "symptoms"].includes(t.kind) ||
                !["todo", "done", "skipped"].includes(t.status) ||
                typeof t.label !== "string" ||
                !Number.isFinite(Date.parse(t.dueAt)) ||
                (t.actualAt && !Number.isFinite(Date.parse(t.actualAt)))
              )
                fail(400, "Backup contains an invalid task.");
              taskIds.add(t.id);
              if (
                !db
                  .prepare(
                    "SELECT 1 FROM members WHERE family_id=? AND user_id=?",
                  )
                  .get(m.family_id, t.who || "")
              )
                t.who = "";
            }
            state = {
              plan: saved.plan || null,
              tasks: saved.tasks,
              revision: state.revision + 1,
            };
            action = "Restored a backup";
          } else if (url.pathname === "/api/reset") {
            if (m.role !== "owner" || b.confirm !== "DELETE")
              fail(403, "The owner must confirm deletion.");
            state = empty();
            db.prepare("DELETE FROM invites WHERE family_id=?").run(
              m.family_id,
            );
            db.prepare("DELETE FROM audit WHERE family_id=?").run(m.family_id);
            action = "Deleted the care plan and records";
          } else fail(404, "Unknown action.");
          db.prepare(
            "UPDATE families SET state=?,version=version+1 WHERE id=?",
          ).run(JSON.stringify(state), m.family_id);
          audit(m.family_id, user.id, action, auditDetails);
          db.exec("COMMIT");
          reply(res, 200, {
            ok: true,
            warnings: logWarnings(state.tasks, state.plan),
          });
          return;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      }
      fail(404, "Unknown API endpoint.");
    }
    if (!["GET", "HEAD"].includes(req.method)) fail(405, "Method not allowed.");
    const files = {
      "/": "public/index.html",
      "/app.js": "public/app.js",
      "/style.css": "public/style.css",
      "/domain.js": "src/domain.js",
      "/sample.txt": "public/sample.txt",
    };
    const file = files[url.pathname];
    if (!file || !existsSync(path.join(root, file)))
      fail(404, "Page not found.");
    const ext = path.extname(file),
      types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".txt": "text/plain; charset=utf-8",
      };
    res.writeHead(200, {
      "Content-Type": types[ext],
      "Cache-Control": "no-cache",
    });
    res.end(req.method === "HEAD" ? "" : readFileSync(path.join(root, file)));
  } catch (e) {
    if (!e.status) console.error(e);
    reply(res, e.status || 500, {
      error: e.status
        ? e.message
        : "The server could not save this change. Please try again.",
    });
  }
});
const port = Number(process.env.PORT || 3000),
  host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () =>
  console.log(`CareLoop is running at http://${host}:${server.address().port}`),
);

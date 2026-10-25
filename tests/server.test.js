import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { DEFAULT_PREFS } from "../src/domain.js";
const dir = mkdtempSync(path.join(os.tmpdir(), "careloop-test-"));
let child, base;
before(async () => {
  child = spawn(process.execPath, ["src/server.js"], {
    env: { ...process.env, PORT: "0", DATA_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  base = await new Promise((resolve, reject) => {
    child.stdout.on("data", (b) => {
      output += b;
      const m = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) resolve(m[0]);
    });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error("Server exited " + code)));
  });
});
after(async () => {
  if (child) {
    child.kill();
    await once(child, "exit");
  }
  rmSync(dir, { recursive: true, force: true });
});
async function call(route, data, cookie = "") {
  const res = await fetch(base + route, {
    method: data ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: data ? JSON.stringify(data) : undefined,
  });
  return {
    status: res.status,
    cookie: res.headers.get("set-cookie")?.split(";")[0],
    data: await res.json(),
  };
}
const account = (email, extra = {}) => ({
  email,
  password: "a-long-test-password",
  name: "Test Caregiver",
  ...extra,
});
test("full shared care lifecycle, permissions, concurrency, history, backup and deletion", async () => {
  assert.equal((await call("/api/state")).status, 401);
  const owner = await call("/api/register", account("owner@example.com"));
  assert.equal(owner.status, 201);
  const cookie = owner.cookie;
  let s = (await call("/api/state", null, cookie)).data;
  assert.equal(s.role, "owner");
  assert.equal(s.tasks.length, 0);
  const p = {
    patient: "Fictional Patient",
    startDate: "2026-10-24",
    timeZone: "America/Los_Angeles",
    meds: [
      {
        id: "a",
        drug: "Example",
        dose: "10 mg",
        freq: "once daily",
        meal: "any",
        gapTarget: "",
        gapHours: "",
        reviewed: true,
      },
    ],
    prefs: DEFAULT_PREFS,
    followups: [],
    flags: [],
    monitoring: { weight: true, symptoms: true },
    unresolved: [],
  };
  assert.equal(
    (
      await call(
        "/api/plan",
        {
          version: s.version,
          plan: { ...p, meds: [{ ...p.meds[0], reviewed: false }] },
        },
        cookie,
      )
    ).status,
    422,
  );
  assert.equal(
    (await call("/api/plan", { version: s.version, plan: p }, cookie)).status,
    200,
  );
  s = (await call("/api/state", null, cookie)).data;
  assert.equal(s.tasks.length, 90);
  const invitation = await call("/api/invite", { role: "editor" }, cookie);
  const editor = await call(
    "/api/register",
    account("editor@example.com", { invite: invitation.data.token }),
  );
  assert.equal(editor.status, 201);
  assert.equal(
    (
      await call(
        "/api/register",
        account("reuse@example.com", { invite: invitation.data.token }),
      )
    ).status,
    400,
  );
  s = (await call("/api/state", null, editor.cookie)).data;
  assert.equal(s.team.length, 2);
  assert.equal(s.role, "editor");
  const med = s.tasks.find((t) => t.kind === "med"),
    actual = "2026-10-24T15:05:00.000Z";
  const saved = await call(
    "/api/task",
    {
      id: med.id,
      status: "done",
      actualAt: actual,
      who: s.user.id,
      version: s.version,
    },
    editor.cookie,
  );
  assert.equal(saved.status, 200);
  assert.equal(
    (
      await call(
        "/api/task",
        { id: med.id, status: "todo", version: s.version },
        cookie,
      )
    ).status,
    409,
  );
  s = (await call("/api/state", null, cookie)).data;
  assert.equal(s.tasks.find((t) => t.id === med.id).actualAt, actual);
  const weight = s.tasks.find((t) => t.kind === "weight");
  assert.equal(
    (
      await call(
        "/api/task",
        { id: weight.id, status: "done", actualAt: actual, version: s.version },
        cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/api/task",
        {
          id: weight.id,
          status: "done",
          actualAt: actual,
          value: "65.5",
          unit: "kg",
          version: s.version,
        },
        cookie,
      )
    ).status,
    200,
  );
  s = (await call("/api/state", null, cookie)).data;
  assert.equal(
    (
      await call(
        "/api/plan",
        {
          version: s.version,
          plan: { ...p, meds: [{ ...p.meds[0], freq: "at bedtime" }] },
        },
        cookie,
      )
    ).status,
    200,
  );
  s = (await call("/api/state", null, cookie)).data;
  assert.equal(s.tasks.find((t) => t.id === med.id).actualAt, actual);
  assert.equal(s.tasks.find((t) => t.id === med.id).time, "08:00");
  assert.equal(s.tasks.filter((t) => t.kind === "med").length, 30);
  const viewerInvite = await call("/api/invite", { role: "viewer" }, cookie);
  const viewer = await call(
    "/api/register",
    account("viewer@example.com", { invite: viewerInvite.data.token }),
  );
  const vs = (await call("/api/state", null, viewer.cookie)).data;
  assert.equal(vs.role, "viewer");
  assert.equal(
    (
      await call(
        "/api/task",
        { id: med.id, status: "todo", version: vs.version },
        viewer.cookie,
      )
    ).status,
    403,
  );
  assert.equal((await call("/api/backup", null, viewer.cookie)).status, 403);
  assert.equal(
    (await call("/api/invite", { role: "editor" }, editor.cookie)).status,
    403,
  );
  const backup = (await call("/api/backup", null, cookie)).data;
  assert.equal(backup.format, "careloop-1");
  assert.equal(backup.tasks.length, 90);
  const calendar = await fetch(base + "/api/calendar", {
    headers: { Cookie: cookie },
  });
  assert.match(await calendar.text(), /BEGIN:VALARM/);
  s = (await call("/api/state", null, cookie)).data;
  assert.equal(
    (
      await call(
        "/api/reset",
        { version: s.version, confirm: "DELETE" },
        cookie,
      )
    ).status,
    200,
  );
  s = (await call("/api/state", null, cookie)).data;
  assert.equal(s.plan, null);
  assert.equal(s.tasks.length, 0);
  assert.equal(
    (await call("/api/restore", { version: s.version, backup }, cookie)).status,
    200,
  );
  s = (await call("/api/state", null, cookie)).data;
  assert.equal(s.tasks.find((t) => t.id === med.id).actualAt, actual);
  const editorId = s.team.find((m) => m.email === "editor@example.com").id;
  assert.equal(
    (await call("/api/member", { userId: editorId, role: "remove" }, cookie))
      .status,
    200,
  );
  assert.equal((await call("/api/state", null, editor.cookie)).status, 403);
  assert.equal((await call("/api/logout", {}, cookie)).status, 200);
  assert.equal((await call("/api/state", null, cookie)).status, 401);
});
test("rejects cross-origin mutations and serves modules under a restrictive policy", async () => {
  const r = await fetch(base + "/api/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://other.example",
    },
    body: JSON.stringify(account("csrf@example.com")),
  });
  assert.equal(r.status, 403);
  const page = await fetch(base);
  assert.match(
    page.headers.get("content-security-policy"),
    /script-src 'self'/,
  );
  assert.equal((await fetch(base + "/domain.js")).status, 200);
  assert.equal((await fetch(base + "/../package.json")).status, 404);
});
test("password changes revoke other sessions and reject the old password", async () => {
  const credentials = account("password@example.com");
  const first = await call("/api/register", credentials),
    second = await call("/api/login", credentials);
  assert.equal(second.status, 200);
  assert.equal(
    (
      await call(
        "/api/password",
        { currentPassword: "incorrect", newPassword: "another-long-password" },
        first.cookie,
      )
    ).status,
    403,
  );
  const changed = await call(
    "/api/password",
    {
      currentPassword: credentials.password,
      newPassword: "another-long-password",
    },
    first.cookie,
  );
  assert.equal(changed.status, 200);
  assert.equal((await call("/api/state", null, second.cookie)).status, 401);
  assert.equal((await call("/api/state", null, changed.cookie)).status, 200);
  assert.equal((await call("/api/login", credentials)).status, 401);
  assert.equal(
    (
      await call("/api/login", {
        ...credentials,
        password: "another-long-password",
      })
    ).status,
    200,
  );
});

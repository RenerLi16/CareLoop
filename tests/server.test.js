import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
let child, base;
before(async () => {
  child = spawn(process.execPath, ["src/server.js"], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  base = await new Promise((resolve, reject) => {
    child.stdout.on("data", (bytes) => {
      const match = String(bytes).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) resolve(match[0]);
    });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`Server exited ${code}`)));
  });
});
after(async () => {
  if (child && child.exitCode === null) {
    const closed = once(child, "exit");
    child.kill();
    await closed;
  }
});
test("serves the local app and modules with a restrictive policy and no cookies", async () => {
  for (const file of [
    "/",
    "/app.js",
    "/storage.js",
    "/domain.js",
    "/care-record.js",
    "/sample.txt",
  ]) {
    const response = await fetch(base + file);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.match(
      response.headers.get("content-security-policy"),
      /form-action 'none'/,
    );
  }
});
test("no care-data, login, or export API remains accessible", async () => {
  for (const route of [
    "/api/state",
    "/api/backup",
    "/api/calendar",
    "/data/careloop.sqlite",
    "/package.json",
  ])
    assert.equal((await fetch(base + route)).status, 404);
  for (const route of [
    "/api/register",
    "/api/login",
    "/api/task",
    "/api/plan",
    "/api/restore",
    "/",
  ]) {
    const response = await fetch(base + route, {
      method: "POST",
      body: JSON.stringify({ patient: "Fictional test" }),
    });
    assert.equal(response.status, 405);
  }
});
test("static serving does not expose arbitrary repository files", async () => {
  for (const route of [
    "/../.env",
    "/.git/config",
    "/README.md",
    "/src/server.js",
  ])
    assert.equal((await fetch(base + route)).status, 404);
  const response = await fetch(base + "/app.js", { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

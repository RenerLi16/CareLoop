import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const source = fileURLToPath(new URL("../", import.meta.url));
test("release build removes old files, includes the full website, and versions offline assets", () => {
  const root = mkdtempSync(path.join(tmpdir(), "careloop-build-"));
  try {
    for (const file of [
      "scripts/build.mjs",
      "src/assets.js",
      "src/scheduler.js",
      "src/care-plan.js",
      "src/instructions.js",
      "src/record.js",
      "src/record-store.js",
      "src/file-protection.js",
      "public/recovery.js",
      "public/i18n.js",
      "public/timeline.js",
      "public/app.js",
      "public/index.html",
      "public/style.css",
      "public/manrope-latin.woff2",
      "public/manrope-vietnamese.woff2",
      "public/Manrope-OFL.txt",
      "public/sw.js",
    ]) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      copyFileSync(path.join(source, file), path.join(root, file));
    }
    writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
    mkdirSync(path.join(root, "dist"));
    writeFileSync(path.join(root, "dist/obsolete.js"), "old");
    let result = spawnSync(process.execPath, ["scripts/build.mjs"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const files = readdirSync(path.join(root, "dist"));
    for (const name of [
      "index.html",
      "app.js",
      "scheduler.js",
      "care-plan.js",
      "instructions.js",
      "style.css",
      "sw.js",
      "careloop.html",
    ])
      assert.ok(files.includes(name));
    assert.ok(!files.includes("obsolete.js"));
    const worker = readFileSync(path.join(root, "dist/sw.js"), "utf8");
    assert.ok(!worker.includes("VERSION"));
    assert.ok(worker.includes("/care-plan.js"));
    const standalone = readFileSync(
      path.join(root, "dist/careloop.html"),
      "utf8",
    );
    assert.ok(!standalone.includes('src="/app.js"'));
    assert.ok(!/^import /m.test(standalone));
    assert.ok(standalone.includes("function parseInstructions"));
    assert.ok(standalone.includes("data:font/woff2;base64,"));
    assert.ok(!standalone.includes('url("/manrope-'));
    assert.deepEqual(
      readFileSync(path.join(root, "dist/manrope-latin.woff2")),
      readFileSync(path.join(source, "public/manrope-latin.woff2")),
    );
    writeFileSync(path.join(root, "public/style.css"), "body{color:black}");
    result = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: root });
    assert.equal(result.status, 0);
    assert.notEqual(
      worker,
      readFileSync(path.join(root, "dist/sw.js"), "utf8"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

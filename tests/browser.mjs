import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const dir = mkdtempSync(path.join(os.tmpdir(), "careloop-ui-"));
const server = spawn(process.execPath, ["src/server.js"], {
  env: { ...process.env, PORT: "0", DATA_DIR: dir },
  stdio: ["ignore", "pipe", "inherit"],
});
let browser;
try {
  const url = await new Promise((resolve) =>
    server.stdout.on("data", (b) => {
      const m = String(b).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) resolve(m[0]);
    }),
  );
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page
    .getByRole("button", { name: "New here? Create a care team" })
    .click();
  await page.getByLabel("Your name").fill("Jamie");
  await page.getByLabel("Care team name").fill("Rivera family");
  await page.getByLabel("Email", { exact: true }).fill("jamie@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("fictional-demo-passphrase");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("button", { name: "Create a care plan" }).click();
  await page.getByRole("button", { name: "Load fictional example" }).click();
  await page
    .getByRole("button", { name: "Read instructions", exact: true })
    .click();
  assert.equal(await page.locator("[data-med]").count(), 4);
  await page
    .getByLabel("Patient name", { exact: true })
    .fill("Fictional Rivera");
  await page.locator('[name="startDate"]').fill("2026-10-24");
  // Imported values remain unconfirmed until every row is explicitly reviewed.
  await page
    .getByRole("button", { name: "Check schedule", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Review before publishing" })
    .waitFor();
  for (const checkbox of await page
    .locator("#plan-form input[type=checkbox]")
    .all())
    await checkbox.check();
  await page
    .getByRole("button", { name: "Check schedule", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Supported timing rules fit" })
    .waitFor();
  await page.getByRole("button", { name: "Publish 30-day plan" }).click();
  await page.getByRole("heading", { name: "A rhythm for each day." }).waitFor();
  assert.equal(await page.locator(".schedule-row").count(), 4);
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.locator("#day-filter").fill("2026-10-24");
  await page.getByRole("button", { name: "Record / assign" }).first().click();
  await page.getByLabel("Status", { exact: true }).selectOption("done");
  await page
    .getByLabel("Actual completion / skip time")
    .fill("2026-10-24T08:05");
  await page.getByRole("button", { name: "Save record" }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await page.locator(".task.completed").first().waitFor();
  await page.getByRole("button", { name: "Care team", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Invite a caregiver" }).click();
  const link = await page.getByLabel("Invitation link").inputValue();
  const second = await browser.newContext(),
    caregiver = await second.newPage();
  await caregiver.goto(link);
  await caregiver.getByLabel("Your name").fill("Alex");
  await caregiver.getByLabel("Email", { exact: true }).fill("alex@example.com");
  await caregiver
    .getByLabel("Password", { exact: true })
    .fill("another-test-passphrase");
  await caregiver
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await caregiver
    .getByRole("heading", { name: "A clearer day ahead." })
    .waitFor();
  await caregiver.locator("#day-filter").fill("2026-10-24");
  await caregiver.locator(".task.completed").first().waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.getByRole("button", { name: "Records", exact: true }).click();
  await page.locator("#record-search").fill("Example B");
  assert.ok(await page.locator("#record-list .task").count());
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: import, review, publish, logging, invitation, shared record, search, desktop and mobile.",
  );
} catch (e) {
  if (e.message.includes("Timeout"))
    console.error("Browser timeout:", e.message);
  throw e;
} finally {
  await browser?.close();
  server.kill();
  await once(server, "exit");
  rmSync(dir, { recursive: true, force: true });
}

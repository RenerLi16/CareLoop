import { finishFirstVisit } from "./setup-helper.mjs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const server = spawn(process.execPath, ["src/server.js"], {
  env: {
    ...process.env,
    PORT: "0",
    STATIC_DIR: fileURLToPath(new URL("../dist/", import.meta.url)),
  },
  stdio: ["ignore", "pipe", "inherit"],
});
let browser;
try {
  const url = await new Promise((resolve, reject) => {
    server.stdout.on("data", (data) => {
      const m = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) resolve(m[0]);
    });
    server.once("error", reject);
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const context = await browser.newContext({
      timezoneId: "America/Los_Angeles",
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-10-26T06:59:45Z") });
  await page.goto(url);
  await finishFirstVisit(page, "Fictional Audit");
  assert.equal(await page.locator("nav button").count(), 6);
  await page.locator('nav [data-t="import"]').click();
  await page
    .locator("#rawText")
    .fill(
      "Patient: Fictional Audit Age: 50 Discharged: 2026-10-25\nMEDICATIONS\nAlpha 10 mg once daily at bedtime\nFOLLOW UP\nOncology in 0 days\nCALL THE DOCTOR IF\nFICTIONAL CUSTOM INSTRUCTION",
    );
  await page.locator("#btnParse").click();
  assert.equal(await page.locator(".mFreq").inputValue(), "at bedtime");
  assert.equal(await page.locator(".fWho").inputValue(), "Oncology");
  await page.locator("#fWeigh").uncheck();
  await page.locator("#fSymptoms").uncheck();
  await page.locator("#btnGenerate").click();
  await page.locator("#p-schedule.on").waitFor();
  let record = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("careloop_instructor_resolver_v1")),
  );
  assert.equal(record.schedule.ok, true);
  assert.deepEqual(Object.values(record.schedule.times), [["22:00"]]);
  assert.equal(record.tasks.find((t) => t.kind === "visit").date, "2026-10-25");
  await page.locator('nav [data-t="home"]').click();
  assert.match(
    await page.locator("#patientWarnings").innerText(),
    /FICTIONAL CUSTOM INSTRUCTION/,
  );
  assert.doesNotMatch(await page.locator("#p-home").innerText(), /2–3 lb/);
  await page.clock.fastForward(60000);
  assert.match(await page.locator("#homeSub").innerText(), /2026-10-26/);
  // Exact schedules use real elapsed hours across the forthcoming clock change.
  await page.locator('nav [data-t="import"]').click();
  await page.locator("#btnManual").click();
  await page.locator("#fName").fill("Fictional Interval");
  await page.locator("#fDate").fill("2026-10-25");
  await page.locator(".mDrug").fill("Alpha");
  await page.locator(".mDose").fill("10 mg");
  await page.locator(".mFreq").selectOption("every 12 hours");
  await page.locator("#fWeigh").uncheck();
  await page.locator("#fSymptoms").uncheck();
  await page.locator("#btnGenerate").click();
  await page.locator("#p-schedule.on").waitFor();
  record = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("careloop_instructor_resolver_v1")),
  );
  const doses = record.tasks.filter((t) => t.kind === "med");
  assert.equal(doses.length, 60);
  for (let i = 1; i < doses.length; i++)
    assert.equal(doses[i].dueAt - doses[i - 1].dueAt, 12 * 3600000);
  await page.locator('nav [data-t="tasks"]').click();
  await page.locator("#dayFilter").selectOption("2026-11-01");
  assert.match(await page.locator("#taskList").innerText(), /07:00/);
  assert.match(await page.locator("#taskList").innerText(), /19:00/);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  assert.equal(await page.locator("nav button").count(), 6);
  await page.locator('nav [data-t="home"]').click();
  assert.equal(await page.locator("#patientWarnings").isHidden(), true);
  assert.deepEqual(errors, []);
  console.log(
    "Release browser checks passed: clean built website, preserved bedtime, generic followups, patient warnings, midnight refresh, elapsed-hour DST schedule, and offline reopening.",
  );
} finally {
  if (browser) await browser.close();
  server.kill();
  if (server.exitCode === null) await once(server, "exit");
}

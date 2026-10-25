import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const server = spawn(process.execPath, ["src/server.js"], {
  env: { ...process.env, PORT: "0" },
  stdio: ["ignore", "pipe", "inherit"],
});
async function finishRecord(page) {
  await page.locator("#task-dialog").waitFor();
  await page
    .locator('#record-form [name="recordedBy"]')
    .selectOption({ index: 1 });
  await page.locator('#record-form button[type="submit"]').click();
  await page.locator("#task-dialog").waitFor({ state: "detached" });
  if (await page.locator("#resolution-dialog").count())
    await page.locator("[data-dismiss-resolution]").click();
}
let browser;
try {
  const url = await new Promise((resolve, reject) => {
    server.stdout.on("data", (b) => {
      const m = String(b).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) resolve(m[0]);
    });
    server.once("error", reject);
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      /Content Security Policy|Refused/.test(m.text())
    )
      errors.push(m.text());
  });
  await page.clock.install({ time: new Date("2026-10-25T12:00:00") });
  await page.goto(url);
  assert.ok(
    await page.evaluate(
      async () => (await document.fonts.load('600 15px "Manrope"')).length > 0,
    ),
    "Bundled interface font loads",
  );
  assert.doesNotMatch(
    await page.locator("#p-team").textContent(),
    /923 surveyed|Burden stays invisible/,
  );
  assert.equal(
    (await page.request.post(url, { data: "fictional test" })).status(),
    405,
  );
  assert.equal((await page.request.get(url + "/package.json")).status(), 404);
  assert.equal(await page.locator("nav button").count(), 6);
  await page
    .getByRole("button", { name: "Read Discharge", exact: true })
    .click();
  await page
    .locator("#rawText")
    .fill("MEDICATIONS\nCannot recognize this tablet");
  await page.locator("#btnParse").click();
  assert.equal(await page.locator(".mDrug").first().inputValue(), "");
  assert.match(
    await page.locator("#readWarnings").innerText(),
    /Cannot recognize/,
  );
  await page.locator("#btnDemo").click();
  await page.locator("#btnParse").click();
  assert.equal(await page.locator(".mDrug").count(), 4);
  assert.equal(
    await page.locator(".mDrug").nth(1).inputValue(),
    "Metoprolol succinate",
  );
  assert.equal(
    await page.locator(".mTarget").nth(2).inputValue(),
    "Furosemide",
  );
  if (await page.locator("#ackUnread").count())
    await page.locator("#ackUnread").check();
  await page.locator("#btnGenerate").click();
  await page.locator("#p-schedule.on").waitFor();
  const state = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("careloop_instructor_resolver_v1")),
    );
  let saved = await state();
  assert.ok(saved?.schedule.ok, await page.locator("#genStatus").innerText());
  assert.ok(saved.tasks.filter((t) => t.kind === "med").length > 140);
  assert.ok(saved.tasks.every((t) => t.dueAt >= saved.planStartAt));
  assert.match(
    await page.locator("#scheduleBody").innerText(),
    /medicines.*doses/s,
  );
  assert.match(
    await page.locator("#scheduleBody").innerText(),
    /Lisinopril|Metoprolol/,
  );
  const firstTimes = structuredClone(saved.schedule.times);
  await page.locator("#btnRecompile").click();
  await page.locator("#resolution-dialog").waitFor();
  assert.deepEqual((await state()).schedule.times, firstTimes);
  await page.locator("[data-dismiss-resolution]").click();
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/restart-daily.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "30-Day Plan", exact: true }).click();
  const dates = await page
    .locator("#dayFilter option")
    .evaluateAll((options) => options.map((o) => o.value));
  await page.locator("#dayFilter").selectOption(dates[0]);
  assert.ok(await page.locator("#taskList [data-done]").count());
  const doneId = await page
    .locator("#taskList [data-done]")
    .first()
    .getAttribute("data-done");
  await page.locator("#taskList [data-done]").first().click();
  await finishRecord(page);
  const completed = (await state()).tasks.find((t) => t.id === doneId);
  assert.equal(completed.status, "done");
  await page
    .getByRole("button", { name: "Daily Schedule", exact: true })
    .click();
  await page.locator("#btnRecompile").click();
  assert.deepEqual(
    (await state()).tasks.find((t) => t.id === doneId),
    completed,
  );
  await page.locator("[data-dismiss-resolution]").click();
  // Impossible fixed-time rule set: no draft data can replace the saved plan.
  await page
    .getByRole("button", { name: "Read Discharge", exact: true })
    .click();
  await page.locator("#btnManual").click();
  await page.locator("#fName").fill("Fictional conflict test");
  await page.locator(".mDrug").first().fill("A");
  await page.locator(".mDose").first().fill("10 mg");
  await page.locator(".mFreq").first().selectOption("in the morning");
  await page.locator("#btnAddMed").click();
  await page.locator(".mDrug").nth(1).fill("B");
  await page.locator(".mDose").nth(1).fill("5 mg");
  await page.locator(".mFreq").nth(1).selectOption("in the morning");
  await page.locator(".mTarget").nth(1).fill("A");
  await page.locator(".mGap").nth(1).fill("2");
  const before = await state();
  await page.locator("#btnGenerate").click();
  assert.match(
    await page.locator("#genStatus").innerText(),
    /Not saved|No schedule/,
  );
  assert.deepEqual(await state(), before);
  // A revised timetable cannot move around a dose already recorded today.

  await page.locator(".mFreq").nth(1).selectOption("once daily");
  await page.locator("#btnGenerate").click();
  assert.match(
    await page.locator("#genStatus").innerText(),
    /already recorded today/,
  );
  assert.deepEqual(await state(), before);
  // Changes can be reviewed before the following day's first recorded dose.
  await page.clock.setFixedTime(new Date("2026-10-26T07:00:00"));
  await page.locator("#btnGenerate").click();
  await page.locator("#p-schedule.on").waitFor();
  saved = await state();
  assert.equal(saved.patient.name, "Fictional conflict test");
  assert.equal(saved.schedule.ok, true);
  assert.ok(saved.history.some((t) => t.id === doneId));
  // Malicious input remains text in both editable fields and table cells.
  await page
    .getByRole("button", { name: "Read Discharge", exact: true })
    .click();
  await page.locator("#btnManual").click();
  await page.locator("#fName").fill("Fictional escape test");
  await page.locator(".mDrug").fill('<img src=x onerror="window.injected=1">');
  await page.locator(".mDose").fill("10 mg");
  await page.locator(".mFreq").selectOption("once daily");
  await page.locator("#btnGenerate").click();
  await page.locator("#p-schedule.on").waitFor();
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.equal(await page.locator("#scheduleBody img").count(), 0);
  await page.reload();
  assert.equal((await state()).patient.name, "Fictional escape test");
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of ["home", "import", "schedule", "tasks", "team", "about"]) {
      await page.locator(`nav [data-t="${id}"]`).click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${id} at ${width}`,
      );
    }
  }
  await page.screenshot({
    path: "test-results/restart-phone.png",
    fullPage: true,
  });
  // A failed write is visible and cannot replace the last saved record.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('nav [data-t="home"]').click();
  const beforeFailure = await state();
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await page.locator("#btnNextDone").click();
  await page
    .locator('#record-form [name="recordedBy"]')
    .selectOption({ index: 1 });
  await page.locator('#record-form button[type="submit"]').click();
  await page
    .locator("#record-error")
    .filter({ hasText: /full|unavailable/ })
    .waitFor();
  assert.match(
    await page.locator("#saveStatus").innerText(),
    /could not be saved/,
  );
  assert.deepEqual(await state(), beforeFailure);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.originalSetItem;
  });
  await page.locator("#task-dialog [data-cancel]").click();
  // Cached app files can reopen offline; care records remain in localStorage.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.context().setOffline(true);
  await page.reload();
  assert.equal((await state()).patient.name, "Fictional escape test");
  await page.context().setOffline(false);
  // Standalone HTML has no external code or stylesheet dependency.
  const standalone = await browser.newPage();
  standalone.on("pageerror", (error) =>
    errors.push("standalone: " + error.message),
  );
  await standalone.goto(new URL("../dist/careloop.html", import.meta.url).href);
  assert.equal(await standalone.locator("nav button").count(), 6);
  assert.ok(
    await standalone.evaluate(
      async () => (await document.fonts.load('600 15px "Manrope"')).length > 0,
    ),
    "Standalone font loads without a network request",
  );
  assert.equal(
    await standalone.locator('link[rel="stylesheet"], script[src]').count(),
    0,
  );
  await standalone.locator('nav [data-t="import"]').click();
  await standalone.locator("#btnDemo").click();
  await standalone.locator("#btnParse").click();
  if (await standalone.locator("#ackUnread").count())
    await standalone.locator("#ackUnread").check();
  await standalone.locator("#btnGenerate").click();
  await standalone.locator("#p-schedule.on").waitFor();
  assert.match(
    await standalone.locator("#scheduleBody").innerText(),
    /medicines.*doses/s,
  );
  await standalone.close();
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: original six-tab UI, parser review, automatic resolution previews, preserved completed records, working date filter, preserved records, blocked impossible plan, escaped input, reload and responsive layouts.",
  );
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  if (server.exitCode === null) await once(server, "exit");
}

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
let browser;
const key = "careloop_instructor_resolver_v1";
try {
  const url = await new Promise((resolve, reject) => {
    server.stdout.on("data", (data) => {
      const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) resolve(match[0]);
    });
    server.once("error", reject);
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const context = await browser.newContext({
    timezoneId: "America/Los_Angeles",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-25T16:29:55Z") });
  await page.clock.pauseAt(new Date("2026-10-25T16:30:00Z")); // 09:30
  await page.goto(url);
  await page.evaluate(async (key) => {
    const { emptyRecord } = await import("/record.js");
    const { autoResolve } = await import("/scheduler.js");
    const { generatePlanTasks } = await import("/care-plan.js");
    const state = emptyRecord();
    state.patient = {
      name: "Fictional live schedule",
      age: 50,
      dischargeDate: "2026-10-25",
    };
    state.team = [{ id: "me", name: "Me", rel: "self" }];
    state.weigh = true;
    state.symptoms = false;
    state.meds = [
      {
        id: "A",
        drug: "Alpha",
        dose: "10 mg",
        freq: "once daily",
        meal: "any",
        gapH: 2,
        gapTarget: "Beta",
      },
      {
        id: "B",
        drug: "Beta",
        dose: "5 mg",
        freq: "once daily",
        meal: "any",
        gapH: 0,
        gapTarget: "",
      },
      {
        id: "C",
        drug: "Gamma",
        dose: "20 mg",
        freq: "twice daily",
        meal: "any",
        gapH: 0,
        gapTarget: "",
      },
    ];
    state.schedule = autoResolve(state.meds);
    state.tasks = generatePlanTasks(state);
    localStorage.setItem(key, JSON.stringify(state));
  }, key);
  await page.reload();
  const snapshot = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  assert.equal(await page.locator(".overdue-card").count(), 3);
  assert.match(await page.locator("#nextTitle").innerText(), /10:00.*Beta/);
  assert.equal(
    await page.locator("#overdueTasks [data-overdue-done]").count(),
    3,
  );
  const state = await snapshot();
  const alpha = state.tasks.find((task) => task.medId === "A");
  await page.locator(`[data-overdue-done="${alpha.id}"]`).click();
  await page.locator('[name="recordedBy"]').selectOption("me");
  await page.locator('#record-form button[type="submit"]').click();
  await page.locator("#resolution-dialog").waitFor();
  assert.match(
    await page.locator("#resolution-title").innerText(),
    /Schedule conflict/,
  );
  assert.match(await page.locator(".resolution-changes").innerText(), /Beta/);
  assert.match(await page.locator(".resolution-changes").innerText(), /11:30/);
  assert.equal(
    (await snapshot()).tasks.find((task) => task.id === alpha.id).status,
    "done",
  );
  await page.locator("[data-dismiss-resolution]").click();
  assert.equal(
    (await snapshot()).tasks.find((task) => task.medId === "B").time,
    "10:00",
    "Declining keeps pending schedule",
  );
  await page.locator('nav [data-t="schedule"]').click();
  await page.locator(".medicine-box").first().waitFor();
  assert.equal(await page.locator(".medicine-box").count(), 4);
  const actualBox = page.locator(`[data-chart-task="${alpha.id}"]`);
  assert.match(await actualBox.innerText(), /09:30.*Done/);
  assert.match(await actualBox.innerText(), /Target 08:00/);
  assert.equal(await page.locator(".current-time-line").isVisible(), true);
  const color = await actualBox.evaluate((box) =>
    box.style.getPropertyValue("--medicine-color"),
  );
  assert.notEqual(
    color,
    await page
      .locator('.medicine-box[data-lane="1"]')
      .evaluate((box) => box.style.getPropertyValue("--medicine-color")),
  );
  await page.locator("#btnRecompile").click();
  await page.locator("[data-apply-resolution]").click();
  await page.locator("#resolution-dialog").waitFor({ state: "detached" });
  const revised = await snapshot();
  assert.equal(revised.tasks.find((task) => task.medId === "B").time, "11:30");
  assert.equal(
    revised.tasks.find((task) => task.id === alpha.id).doneAt,
    new Date("2026-10-25T16:30:00Z").getTime(),
  );
  await page.reload();
  await page.locator('nav [data-t="schedule"]').click();
  assert.match(
    await page.locator('.medicine-box[data-lane="1"]').innerText(),
    /11:30/,
  );
  const lineBefore = await page
    .locator(".current-time-line")
    .evaluate((line) => line.style.left);
  await page.clock.fastForward(60000);
  assert.notEqual(
    await page
      .locator(".current-time-line")
      .evaluate((line) => line.style.left),
    lineBefore,
  );
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/live-schedule-desktop.png",
    fullPage: true,
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const boxes = await page.locator(".medicine-box").evaluateAll((boxes) =>
      boxes.map((box) => {
        const r = box.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }),
    );
    for (let i = 0; i < boxes.length; i++)
      for (let j = 0; j < i; j++)
        assert.ok(
          !(
            boxes[i].left < boxes[j].right &&
            boxes[i].right > boxes[j].left &&
            boxes[i].top < boxes[j].bottom &&
            boxes[i].bottom > boxes[j].top
          ),
          "Medication boxes must not overlap",
        );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('nav [data-t="home"]').click();
  await page.screenshot({
    path: "test-results/live-queue-phone.png",
    fullPage: true,
  });
  // A pending task joins the yellow list as its scheduled time passes; next up advances.
  await page.clock.fastForward(2 * 3600000);
  assert.ok((await page.locator(".overdue-card").count()) > 0);
  const queueNow = await page.evaluate(() => Date.now());
  const firstFuture = (await snapshot()).tasks
    .filter((task) => task.status === "todo" && task.dueAt >= queueNow)
    .sort((a, b) => a.dueAt - b.dueAt)[0];
  assert.match(
    await page.locator("#nextTitle").innerText(),
    new RegExp(firstFuture.time),
  );
  // Stale preview cannot overwrite another tab's changes.
  await page.locator('nav [data-t="schedule"]').click();
  await page.locator("#btnRecompile").click();
  if (await page.locator("[data-apply-resolution]").count()) {
    const other = await context.newPage();
    await other.goto(url);
    await other.evaluate(async () => {
      const { createRecordStore } = await import("/record-store.js");
      const key = "careloop_instructor_resolver_v1";
      const token = localStorage.getItem(key),
        state = JSON.parse(token);
      state.flags.push("Changed in another tab");
      await createRecordStore().replace(state, token);
    });
    await page.waitForFunction(() =>
      document
        .querySelector("#patientWarnings")
        .textContent.includes("Changed in another tab"),
    );
    await page.locator("[data-apply-resolution]").click();
    assert.match(
      await page.locator("#resolution-error").innerText(),
      /Another tab/,
    );
    await page.locator("[data-dismiss-resolution]").click();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Live workflow passed: future-only next up, overdue cards, saved actual times, conflict preview/decline/apply, anchored schedule updates, reload, live clock, stale preview and mobile boxes.",
  );
} finally {
  if (browser) await browser.close();
  server.kill();
  if (server.exitCode === null) await once(server, "exit");
}

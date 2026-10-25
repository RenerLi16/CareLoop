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
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "America/Los_Angeles",
    }),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-25T19:00:00Z") });
  await page.goto(url);
  await page.locator("#setup-dialog").waitFor({ state: "visible" });
  assert.equal(await page.locator("header .tag").count(), 0);
  assert.match(await page.locator("#setup-title").innerText(), /CareLoop/);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#setup-dialog").isVisible(), true);
  mkdirSync("test-results", { recursive: true });
  await page.waitForFunction(() =>
    document
      .querySelector("#setup-stage")
      .getAnimations({ subtree: true })
      .every((animation) => animation.playState !== "running"),
  );
  await page.screenshot({ path: "test-results/setup-welcome-desktop.png" });
  await page.locator('[data-setup-action="next"]').click();
  const name = page.locator("#setup-patient-name"),
    next = page.locator(".setup-name-next");
  await name.waitFor();
  assert.equal(await next.isDisabled(), true);
  await name.fill("   ");
  assert.equal(await next.isDisabled(), true);
  await name.fill("Alice Chen");
  await page.waitForFunction(
    () => !document.querySelector(".setup-name-next").disabled,
  );
  assert.equal(await next.isEnabled(), true);
  await page.waitForFunction(() =>
    document
      .querySelector("#setup-stage")
      .getAnimations({ subtree: true })
      .every((animation) => animation.playState !== "running"),
  );
  await page.screenshot({ path: "test-results/setup-name-desktop.png" });
  await name.press("Enter");
  await page.locator("#setup-team-host").waitFor();
  await page.locator('#caregiverAdd [name="name"]').fill("Jamie Chen");
  await page.locator('#caregiverAdd [name="rel"]').fill("Daughter");
  await page.locator('#caregiverAdd button[type="submit"]').click();
  await page.waitForFunction(
    (key) =>
      JSON.parse(localStorage.getItem(key)).team.some(
        (person) => person.name === "Jamie Chen",
      ),
    key,
  );
  assert.equal(
    await page.locator("#setup-team-host #caregiverEditor").count(),
    1,
  );
  assert.equal(
    await page.locator("#caregiverAdd").count(),
    1,
    "Same editor, not a duplicate form",
  );
  await page.reload();
  await page.locator("#setup-team-host").waitFor();
  assert.equal(
    await page.locator("#caregiverList [data-name]").inputValue(),
    "Jamie Chen",
  );
  assert.equal(
    await page.locator("#setup-title").innerText(),
    "Add your care team.",
  );
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.querySelector("#setup-dialog").scrollWidth > innerWidth,
      ),
      false,
      `Care editor fits ${width}`,
    );
  }
  await page.waitForFunction(() =>
    document
      .querySelector("#setup-stage")
      .getAnimations({ subtree: true })
      .every((animation) => animation.playState !== "running"),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/setup-team-phone.png" });
  await page.locator('[data-setup-action="next"]').click();
  await page.locator("#setup-discharge-host").waitFor();
  assert.equal(
    await page.locator("#setup-discharge-host #p-import").count(),
    1,
  );
  await page.locator('[data-setup-action="skip"]').click();
  await page.locator("#setup-dialog").waitFor({ state: "hidden" });
  assert.match(await page.locator("#homeSub").innerText(), /Alice Chen/);
  await page.locator('nav [data-t="team"]').click();
  assert.equal(await page.locator("#p-team #caregiverEditor").count(), 1);
  await page
    .locator("#caregiverEditor")
    .locator("..")
    .locator("summary")
    .click();
  assert.equal(
    await page.locator("#caregiverList [data-name]").inputValue(),
    "Jamie Chen",
  );
  await page.reload();
  await page.locator("#homeStats").waitFor();
  assert.equal(
    await page.locator("#setup-dialog").isVisible(),
    false,
    "Setup is shown only once",
  );
  await page.locator('nav [data-t="import"]').click();
  await page
    .locator("#rawText")
    .fill(
      "Patient: Different Name Age: 50 Discharged: 2026-10-23\nMEDICATIONS\nAlpha 10 mg every 8 hours",
    );
  await page.locator("#btnParse").click();
  assert.equal(await page.locator("#fName").inputValue(), "Alice Chen");
  await page.locator("#btnGenerate").click();
  await page.locator("#p-schedule.on").waitFor();
  const snapshot = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    key,
  );
  assert.equal(snapshot.patient.name, "Alice Chen");
  assert.equal(snapshot.team[0].name, "Jamie Chen");
  assert.ok(snapshot.tasks.every((task) => task.dueAt >= snapshot.planStartAt));
  // A fresh user can skip team setup and finish by compiling inside the wizard.
  const fresh = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  fresh.on("pageerror", (error) => errors.push(error.message));
  await fresh.goto(url);
  await fresh.locator('[data-setup-action="next"]').click();
  await fresh.locator("#setup-patient-name").fill("Taylor");
  await fresh.locator(".setup-name-next").click();
  await fresh.locator("#setup-team-host").waitFor();
  await fresh.locator('[data-setup-action="skip"]').click();
  await fresh.locator("#rawText").fill("MEDICATIONS\nBeta 5 mg every 8 hours");
  await fresh.locator("#btnParse").click();
  assert.equal(await fresh.locator("#fName").inputValue(), "Taylor");
  await fresh.screenshot({
    path: "test-results/setup-discharge-phone.png",
    fullPage: true,
  });
  assert.equal(
    await fresh.evaluate(
      () => document.querySelector("#setup-dialog").scrollWidth > innerWidth,
    ),
    false,
  );
  await fresh.locator("#btnGenerate").click();
  await fresh.locator("#setup-dialog").waitFor({ state: "hidden" });
  await fresh.locator("#p-schedule.on").waitFor();
  assert.equal(
    await fresh
      .locator("#p-import")
      .locator("..")
      .evaluate((element) => element.tagName),
    "MAIN",
  );
  assert.equal(
    await fresh.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).setup.completed,
      key,
    ),
    true,
  );
  // Existing care plans bypass setup, including records saved before setup existed.
  await fresh.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    delete state.setup;
    localStorage.setItem(key, JSON.stringify(state));
  }, key);
  await fresh.reload();
  await fresh.locator("#homeStats").waitFor();
  assert.equal(await fresh.locator("#setup-dialog").isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(
    "Setup passed: welcome, name validation/keyboard arrow, shared care editor, reload recovery, skips, later discharge setup, in-wizard compile, mobile containment, reduced motion, existing records and removed badge.",
  );
} finally {
  if (browser) await browser.close();
  server.kill();
  if (server.exitCode === null) await once(server, "exit");
}

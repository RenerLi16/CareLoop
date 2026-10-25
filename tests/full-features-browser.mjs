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
try {
  const url = await new Promise((resolve, reject) => {
    server.stdout.on("data", (b) => {
      const match = String(b).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) resolve(match[0]);
    });
    server.once("error", reject);
    server.once("exit", (code) => reject(new Error("Server exited " + code)));
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1050 },
      timezoneId: "America/Los_Angeles",
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Content Security Policy|Refused to apply inline style/.test(
        message.text(),
      )
    )
      errors.push(message.text());
  });
  await page.clock.install({ time: new Date("2026-10-25T15:10:00Z") });
  await page.goto(url);
  await page
    .getByLabel("Patient name or nickname")
    .fill("Fictional Full Feature Patient");
  await page.getByLabel("Plan start date", { exact: true }).fill("2026-10-25");
  await page.getByLabel("Caregiver names").fill("Lan\nMinh");
  await page.getByRole("button", { name: "Set up this device" }).click();
  await page.getByRole("navigation", { name: "Main navigation" }).waitFor();
  for (const name of [
    "Today",
    "Read discharge",
    "Daily schedule",
    "30-day plan",
    "Care team",
    "Calendar",
    "Records",
    "Settings",
  ])
    assert.equal(
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("button", { name, exact: true })
        .count(),
      1,
    );
  const navBoxes = await page.locator("nav .nav-item").evaluateAll((buttons) =>
    buttons.map((button) => ({
      top: button.getBoundingClientRect().top,
      height: button.getBoundingClientRect().height,
    })),
  );
  assert.ok(
    navBoxes.every((box) => Math.abs(box.top - navBoxes[0].top) < 2),
    "Desktop tabs must share one compact row",
  );
  assert.ok(navBoxes[0].height <= 60, "Navigation must not consume the page");
  await page
    .getByRole("button", { name: "Read discharge", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enter manually", exact: true })
    .click();
  assert.equal(await page.locator("[data-med]").count(), 1);
  await page
    .getByRole("button", { name: "Load fictional example", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Read instructions", exact: true })
    .click();
  assert.equal(await page.locator("[data-med]").count(), 4);
  for (const checkbox of await page
    .locator("#plan-form input[type=checkbox]")
    .all())
    await checkbox.check();
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/full-instructions.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save 30-day plan", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Daily schedule", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  assert.equal(await page.locator(".overview-stats > div").count(), 4);
  await page.screenshot({
    path: "test-results/instructor-today.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Daily schedule", exact: true })
    .click();
  assert.equal(await page.locator(".diagram-row").count(), 6);
  assert.equal(await page.locator(".diagram-pin").count(), 7);
  const morningDot = await page
    .locator(".diagram-row")
    .filter({ hasText: "Example A · 10 mg" })
    .locator("circle")
    .boundingBox();
  const laterDot = await page
    .locator(".diagram-row")
    .filter({ hasText: "Example C · 5 mg" })
    .locator("circle")
    .boundingBox();
  assert.ok(
    laterDot.x > morningDot.x + 20,
    "Later times must actually plot farther right",
  );

  await page.screenshot({
    path: "test-results/full-daily-timeline.png",
    fullPage: true,
  });
  const before = await page.evaluate(async () =>
    (await import("/storage.js")).loadRecord(),
  );
  await page.getByText("Try a timing conflict", { exact: true }).click();
  await page
    .getByRole("button", { name: "Show timing conflict", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Timing conflict" })
    .waitFor();
  assert.match(
    await page.locator(".rule-example").innerText(),
    /0 hours apart/,
  );
  const after = await page.evaluate(async () =>
    (await import("/storage.js")).loadRecord(),
  );
  assert.equal(after.version, before.version);
  assert.deepEqual(after.plan, before.plan);
  await page
    .getByRole("button", { name: "Clear example", exact: true })
    .click();
  await page.getByRole("button", { name: "30-day plan", exact: true }).click();
  assert.equal(await page.locator(".plan-day").count(), 30);
  const firstSelect = page.locator("[data-assign-task]").first();
  await firstSelect.selectOption({ label: "Lan" });
  await page
    .getByRole("button", { name: "Show all 30 days", exact: true })
    .click();
  assert.equal(await page.locator(".plan-date-group").count(), 30);
  const snapshot = await page.evaluate(async () =>
    (await import("/storage.js")).loadRecord(),
  );
  assert.equal(await page.locator(".plan-task").count(), snapshot.tasks.length);
  await page.screenshot({
    path: "test-results/full-30-day-plan.png",
    fullPage: false,
  });
  await page.locator("#plan-day").selectOption("2026-10-25");
  await page
    .getByRole("button", { name: /^Record as skipped:/ })
    .first()
    .click();
  assert.equal(
    await page.getByRole("radio", { name: "Skipped", exact: true }).isChecked(),
    true,
  );
  await page
    .getByLabel("Recorded by", { exact: true })
    .selectOption({ label: "Lan" });
  await page
    .getByRole("button", { name: "Save skipped record", exact: true })
    .click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await page
    .locator("[data-assign-task]")
    .first()
    .selectOption({ label: "Lan" });
  await page
    .locator(".plan-task")
    .filter({ hasText: "Example B · 20 mg" })
    .first()
    .getByRole("button", { name: /Record task:/ })
    .click();
  await page
    .getByLabel("Recorded by", { exact: true })
    .selectOption({ label: "Lan" });
  await page
    .getByRole("button", { name: "Save completed record", exact: true })
    .click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Care team", exact: true }).click();
  const lan = page.locator(".load-row").filter({ hasText: "Lan" });
  assert.equal(await lan.locator("td").nth(2).innerText(), "2");
  assert.equal(await lan.locator("td").nth(3).innerText(), "1");
  assert.equal(await lan.locator("td").nth(4).innerText(), "50%");
  assert.equal(await lan.locator("td").nth(5).innerText(), "1");
  const lanTrack = await lan.locator(".load-track").boundingBox();
  const lanFill = await lan.locator("rect").boundingBox();
  assert.ok(
    lanFill.width > 0 && lanFill.width < lanTrack.width / 2,
    "Load bar must scale with actual assignments",
  );

  await page.screenshot({
    path: "test-results/full-caregivers.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Daily schedule", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Medicine timing rules", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Rebuild schedule", exact: true })
    .click();
  const rebuilt = await page.evaluate(async () =>
    (await import("/storage.js")).loadRecord(),
  );
  assert.equal(rebuilt.tasks.filter((t) => t.status === "done").length, 1);
  assert.equal(rebuilt.tasks.filter((t) => t.status === "skipped").length, 1);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  assert.equal(await page.locator(".calendar-day").count(), 31);
  page.once("dialog", (dialog) => dialog.accept());
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download calendar (.ics)", exact: true })
    .click();
  const chunks = [];
  for await (const chunk of await (await downloading).createReadStream())
    chunks.push(chunk);
  const calendar = Buffer.concat(chunks).toString();
  assert.match(calendar, /BEGIN:VCALENDAR/);
  assert.match(calendar, /TRIGGER:-PT15M/);
  assert.equal(
    (calendar.match(/BEGIN:VEVENT/g) || []).length,
    rebuilt.tasks.filter((t) => !t.archived && t.status === "todo").length,
  );
  await page.screenshot({
    path: "test-results/full-calendar.png",
    fullPage: true,
  });
  await page.locator("#calendar-month").fill("2026-11");
  assert.equal(await page.locator(".calendar-day").count(), 30);
  await page.getByRole("button", { name: "30-day plan", exact: true }).click();
  await page.getByLabel("Task status", { exact: true }).selectOption("done");
  assert.equal(await page.locator(".plan-task").count(), 1);
  await page.getByLabel("Task status", { exact: true }).selectOption("all");
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of [
      "Today",
      "Read discharge",
      "Daily schedule",
      "30-day plan",
      "Care team",
      "Calendar",
      "Records",
      "Settings",
    ]) {
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("button", { name, exact: true })
        .click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${name} at ${width}`,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Daily schedule", exact: true })
    .click();
  assert.equal(await page.locator(".mobile-day-diagram").isVisible(), true);
  await page.screenshot({
    path: "test-results/full-daily-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Full-feature checks passed: direct navigation, manual/pasted import, timeline, all 30 days, assignment, skip/completion, caregiver load, safe conflict example, schedule rebuild, calendar export and tablet/phone layouts.",
  );
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
}

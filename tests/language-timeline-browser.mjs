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
async function checkLabels(page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".medicine-timeline .medicine-box")].every(
      (e) => e.style.top,
    ),
  );
  const labels = await page
    .locator(".medicine-timeline .medicine-box")
    .evaluateAll((pins) =>
      pins.map((pin) => {
        const box = pin.getBoundingClientRect();
        return {
          name: pin.querySelector("b").textContent,
          lane: pin.dataset.lane,
          x: box.x,
          y: box.y,
          right: box.right,
          bottom: box.bottom,
        };
      }),
    );
  for (let i = 0; i < labels.length; i++) {
    assert.ok(labels[i].lane != null);
    for (let j = 0; j < i; j++)
      assert.ok(
        !(
          labels[i].x < labels[j].right &&
          labels[i].right > labels[j].x &&
          labels[i].y < labels[j].bottom &&
          labels[i].bottom > labels[j].y
        ),
        "Medicine labels must not overlap",
      );
  }
  assert.ok(labels.every((label) => label.name));
  return labels;
}
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
  await page.clock.install({ time: new Date("2026-10-25T12:00:00") });
  await page.goto(url);
  await page.locator("#btnEmptySample").click();
  await page.locator("#nextCard").waitFor({ state: "visible" });
  const snapshot = () =>
    page.evaluate(() =>
      localStorage.getItem("careloop_instructor_resolver_v1"),
    );
  const before = await snapshot();
  for (const [lang, title] of [
    ["vi", "Hôm nay"],
    ["es", "Hoy"],
    ["zh", "今天"],
    ["ko", "오늘"],
    ["en", "Today"],
  ]) {
    await page.locator("#languageSelect").selectOption(lang);
    await page.waitForFunction(
      ({ lang, title }) =>
        document.documentElement.lang === lang &&
        document.querySelector("#p-home h2").textContent === title,
      { lang, title },
    );
    assert.equal(
      await snapshot(),
      before,
      "Language does not modify care data",
    );
    assert.match(
      await page.locator("#nextTitle").innerText(),
      /Furosemide|Metoprolol|Lisinopril|Atorvastatin|weight|symptom/,
    );
  }
  await page.locator('nav [data-t="import"]').click();
  await page.locator("#fName").fill("Unsaved name");
  const freq = await page.locator(".mFreq").first().inputValue();
  await page.locator("#languageSelect").selectOption("vi");
  await page.waitForFunction(() => document.documentElement.lang === "vi");
  assert.equal(await page.locator("#fName").inputValue(), "Unsaved name");
  assert.equal(
    await page.locator(".mFreq").first().inputValue(),
    freq,
    "Translated options preserve original parsed values",
  );
  assert.ok(await page.locator("#languageNote").isVisible());
  await page.reload();
  assert.equal(await page.locator("#languageSelect").inputValue(), "vi");
  assert.equal(
    await page.locator('nav [data-t="home"]').innerText(),
    "Hôm nay",
  );
  await page.locator('nav [data-t="schedule"]').click();
  const labels = await checkLabels(page);
  assert.equal(
    labels.length,
    5,
    "Each medicine at each time has its own name label",
  );
  assert.equal(
    labels.filter((l) => l.name === "Metoprolol succinate").length,
    2,
  );
  mkdirSync("test-results", { recursive: true });
  await page.locator("#languageSelect").selectOption("en");
  await page.waitForFunction(() => document.documentElement.lang === "en");
  await page.screenshot({
    path: "test-results/schedule-labeled-desktop.png",
    fullPage: true,
  });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const lang of ["vi", "es", "zh", "ko", "en"]) {
      await page.locator("#languageSelect").selectOption(lang);
      await page.waitForFunction(
        (lang) => document.documentElement.lang === lang,
        lang,
      );
      await checkLabels(page);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `No page overflow for ${lang} at ${width}`,
      );
      const header = await page.locator("header").boundingBox(),
        selector = await page.locator("#languageSelect").boundingBox();
      assert.ok(
        selector.x + selector.width <= width &&
          selector.y < header.y + header.height,
        "Language selector stays in the upper right",
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#languageSelect").selectOption("vi");
  await page.waitForFunction(() => document.documentElement.lang === "vi");
  await page.screenshot({ path: "test-results/schedule-labeled-phone.png" });
  // Multiple simultaneous long names, including untrusted markup, stay visible and separate.
  await page.locator("#languageSelect").selectOption("en");
  await page.locator('nav [data-t="import"]').click();
  await page.locator("#btnManual").click();
  await page.locator("#fName").fill("Fictional crowded labels");
  for (let i = 0; i < 6; i++) {
    if (i) await page.locator("#btnAddMed").click();
    await page
      .locator(".mDrug")
      .nth(i)
      .fill(
        i === 5
          ? '<img src=x onerror="window.injected=1">'
          : `Long fictional medicine name for layout ${i + 1}`,
      );
    await page.locator(".mDose").nth(i).fill("10 mg");
    await page.locator(".mFreq").nth(i).selectOption("in the morning");
  }
  await page.locator("#btnGenerate").click();
  await page.locator("#p-schedule.on").waitFor();
  assert.equal((await checkLabels(page)).length, 6);
  assert.equal(await page.locator(".medicine-timeline img").count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  const standalone = await browser.newPage();
  standalone.on("pageerror", (e) => errors.push(e.message));
  await standalone.goto(new URL("../dist/careloop.html", import.meta.url).href);
  await standalone.locator("#languageSelect").selectOption("ko");
  await standalone.waitForFunction(
    () => document.documentElement.lang === "ko",
  );
  assert.equal(
    await standalone.locator('nav [data-t="home"]').innerText(),
    "오늘",
  );
  await standalone.close();
  assert.deepEqual(errors, []);
  console.log(
    "Language/timeline checks passed: five languages, persistence, unchanged records/drafts/option values, offline standalone, non-overlapping medicine boxes, crowded names and responsive layout.",
  );
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  if (server.exitCode === null) await once(server, "exit");
}

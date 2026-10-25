import { finishFirstVisit } from "./setup-helper.mjs";
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
      const m = String(b).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) resolve(m[0]);
    });
    server.once("error", reject);
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-10-25T12:00:00") });
  await page.goto(url);
  await finishFirstVisit(page);
  await page.locator("#btnEmptySample").click();
  await page.locator("#nextCard").waitFor({ state: "visible" });
  mkdirSync("test-results", { recursive: true });
  for (const width of [320, 390, 768, 900, 1440]) {
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
      const nav = await page.locator("nav").boundingBox();
      if (width <= 900) {
        assert.ok(
          Math.abs(nav.y + nav.height - 900) < 2,
          "Tabs stay at the bottom",
        );
        for (const button of await page.locator("nav button").all()) {
          const box = await button.boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
        }
      } else assert.ok(nav.y < 150, "Original desktop tabs stay at top");
    }
    await page.locator('nav [data-t="tasks"]').click();
    const region = page.locator("#taskList .table-scroll");
    if (width <= 900) {
      await region.waitFor({ state: "visible" });
      if (await region.evaluate((e) => e.scrollWidth > e.clientWidth)) {
        await page.waitForFunction(
          () =>
            document
              .querySelector("#taskList .table-scroll")
              ?.getAttribute("tabindex") === "0",
        );
        assert.equal(await region.getAttribute("tabindex"), "0");
        const first = region.locator("tbody td").first();
        const left = (await first.boundingBox()).x;
        await region.evaluate((e) => (e.scrollLeft = 180));
        assert.ok(
          Math.abs((await first.boundingBox()).x - left) < 2,
          "First column stays pinned",
        );
        assert.ok(await region.evaluate((e) => e.scrollLeft > 0));
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ["home", "schedule", "tasks", "import", "team"]) {
    await page.locator(`nav [data-t="${id}"]`).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/mobile-original-${id}.png`,
      fullPage: false,
    });
  }
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.locator('nav [data-t="tasks"]').click();
  await page.screenshot({ path: "test-results/tablet-original-tasks.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Mobile checks passed: six bottom tabs, phone/tablet layouts, contained table scrolling, pinned first column, keyboard access, unchanged desktop navigation.",
  );
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  if (server.exitCode === null) await once(server, "exit");
}

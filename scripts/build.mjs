import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { ASSETS, sourceAsset, serviceWorker } from "../src/assets.js";
const read = (file) =>
  readFileSync(new URL("../" + file, import.meta.url), "utf8");
const output = new URL("../dist/", import.meta.url);
// dist is generated output: remove obsolete versions before producing a release.
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const route of Object.keys(ASSETS))
  writeFileSync(
    new URL(route === "/" ? "index.html" : route.slice(1), output),
    sourceAsset(route),
  );
writeFileSync(new URL("sw.js", output), serviceWorker());
const withoutImports = (code) =>
  code
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\s*/gm, "")
    .replace(/^export /gm, "");
const bundled = [
  "src/scheduler.js",
  "src/instructions.js",
  "src/care-plan.js",
  "src/live-schedule.js",
  "src/record.js",
  "src/record-store.js",
  "src/file-protection.js",
  "public/recovery.js",
  "public/i18n.js",
  "public/timeline.js",
  "public/setup.js",
  "public/app.js",
]
  .map((file) => withoutImports(read(file)))
  .join("\n");
const inlineStyles = read("public/style.css").replace(
  /url\("(\/manrope-[a-z]+\.woff2)"\)/g,
  (_, route) =>
    `url("data:font/woff2;base64,${sourceAsset(route).toString("base64")}")`,
);
const standalone = read("public/index.html")
  .replace(
    /<link rel="stylesheet" href="\/style\.css"\s*\/?>/,
    () => `<style>${inlineStyles}</style>`,
  )
  .replace(
    '<script type="module" src="/app.js"></script>',
    () => `<script type="module">\n${bundled}\n</script>`,
  )
  .replaceAll(
    "/careloop-logo.png",
    `data:image/png;base64,${sourceAsset("/careloop-logo.png").toString("base64")}`,
  );
writeFileSync(new URL("careloop.html", output), standalone);
console.log(
  "Clean website: dist/index.html · Standalone file: dist/careloop.html",
);

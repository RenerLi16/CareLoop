import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const read = (file) =>
  readFileSync(new URL("../" + file, import.meta.url), "utf8");
mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });
const scheduler = read("src/scheduler.js").replace(/^export /gm, "");
const app = read("public/app.js").replace(
  /^import[\s\S]*?from ['"]\/scheduler\.js['"];?\s*/,
  "",
);
const html = read("public/index.html")
  .replace(
    /<link rel="stylesheet" href="\/style\.css"\s*\/?>/,
    () => `<style>${read("public/style.css")}</style>`,
  )
  .replace(
    '<script type="module" src="/app.js"></script>',
    () => `<script type="module">\n${scheduler}\n${app}\n</script>`,
  );
writeFileSync(new URL("../dist/careloop.html", import.meta.url), html);
console.log("Standalone app: dist/careloop.html (opens directly from disk).");

import { chromium } from '/Users/renerli/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const items = JSON.parse(await fs.readFile(path.join(root, 'concepts.json'), 'utf8'));
const cards = items.map(({id, name}) => `<article id="option-${id}"><div class="label">${id}<span>${name}</span></div><div class="lockup"><img src="symbol-${id}.png" alt="${name} symbol"><div class="wordmark">CareLoop</div></div><div class="footer">GEORGIA · NAVY</div></article>`).join('');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>CareLoop — nine logo options</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f8fb;color:#0f2a4a;font-family:Arial,sans-serif}main{width:1440px;padding:58px 60px 50px;margin:auto}header{display:flex;align-items:end;justify-content:space-between;margin-bottom:34px}h1{font:40px Georgia,serif;margin:0 0 10px}p{margin:0;color:#5a6b7d;font-size:17px}.meta{font-size:12px;letter-spacing:2px;color:#5a6b7d;padding-bottom:4px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}article{background:white;border:1px solid #d5dde6;border-radius:16px;height:340px;position:relative;overflow:hidden}.label{position:absolute;top:22px;left:24px;font-size:15px;font-weight:700;display:flex;gap:14px;align-items:center}.label span{font-size:13px;font-weight:400;color:#5a6b7d}.lockup{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-top:10px;gap:0}.lockup img{width:190px;height:190px;object-fit:contain}.wordmark{font-family:Georgia,serif;font-size:43px;line-height:1.15;letter-spacing:-1.4px;font-weight:400}.footer{position:absolute;bottom:18px;left:0;right:0;text-align:center;font-size:9px;letter-spacing:2px;color:#8593a2}@media(max-width:800px){main{width:100%;padding:24px}.grid{grid-template-columns:1fr}header{display:block}.meta{margin-top:20px}}
</style><main><header><div><h1>CareLoop</h1><p>Nine symbols. One Georgia wordmark.</p></div><div class="meta">LOGO EXPLORATION / 01–09</div></header><section class="grid">${cards}</section></main></html>`;
await fs.writeFile(path.join(root, 'index.html'), html);
const browser = await chromium.launch({headless:true, executablePath:'/Users/renerli/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
const page = await browser.newPage({viewport:{width:1440,height:1300},deviceScaleFactor:1.5});
await page.goto(`file://${root}/index.html`);
await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});
console.log('Wordmark font:', await page.locator('.wordmark').first().evaluate(e=>getComputedStyle(e).fontFamily));
await page.locator('main').screenshot({path:path.join(root,'careloop-nine-options.png')});
for(const {id} of items) await page.locator(`#option-${id} .lockup`).screenshot({path:path.join(root,`logo-${id}-georgia.png`)});
await browser.close();

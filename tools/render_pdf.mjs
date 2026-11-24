// Rend dist/programme.html en dist/programme.pdf avec Chromium (Playwright).
// Usage : node tools/render_pdf.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

// Playwright installé localement (npm ci) ou globalement (environnement Claude Code)
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"))); }

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = pathToFileURL(path.join(racine, "dist", "programme.html")).href;
const out = path.join(racine, "dist", "programme.pdf");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(src, { waitUntil: "networkidle" }).catch(() => page.goto(src, { waitUntil: "load" }));
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: out, format: "A4", printBackground: true, preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: '<div style="font:8px system-ui;color:#888;width:100%;text-align:center">New York · Noël 2026 — <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
});
await browser.close();
console.log("PDF :", out);

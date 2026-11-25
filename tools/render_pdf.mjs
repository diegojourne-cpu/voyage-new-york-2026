// 1) photographie les vraies cartes (MapLibre + tuiles OpenStreetMap) de chaque jour → dist/cartes/*.png
// 2) imprime dist/programme.html → dist/programme.pdf, copié dans dist/site/fichiers/
// Usage : node tools/render_pdf.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { demarrer } from "./serve.mjs";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"))); }

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(racine, "dist");
const data = JSON.parse(fs.readFileSync(path.join(dist, "site", "data.json"), "utf8"));
fs.mkdirSync(path.join(dist, "cartes"), { recursive: true });

const { srv, port } = await demarrer(path.join(dist, "site"));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1.5 });
  page.on("pageerror", e => console.error("carte :", e.message));
  const cibles = [...data.jours.map(j => j.iso), "ensemble"];
  for (const c of cibles) {
    const url = `http://127.0.0.1:${port}/impression.html${c === "ensemble" ? "" : "?jour=" + c}`;
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.carteprete === true, null, { timeout: 60000 });
    await page.locator("#m").screenshot({ path: path.join(dist, "cartes", `${c}.jpg`), type: "jpeg", quality: 84 });
    console.log("carte", c);
  }
  const pdf = await browser.newPage();
  await pdf.goto(pathToFileURL(path.join(dist, "programme.html")).href, { waitUntil: "load" });
  await pdf.evaluate(() => document.fonts.ready);
  const out = path.join(dist, "programme.pdf");
  await pdf.pdf({
    path: out, format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: '<div style="font:8px Arial,sans-serif;color:#888;width:100%;text-align:center">New York · Noël 2026 — <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
  });
  fs.mkdirSync(path.join(dist, "site", "fichiers"), { recursive: true });
  fs.copyFileSync(out, path.join(dist, "site", "fichiers", "programme.pdf"));
  console.log("PDF :", out);
} finally {
  await browser.close();
  srv.close();
}

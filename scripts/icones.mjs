// Gera os ícones do app (favicon, apple-touch, PWA) a partir de scripts/icones.html: a tecla CONFIRMA com um "v".
// Uso: node scripts/icones.mjs [url-base do servidor local]   (precisa servir public/ e scripts/icones.html em /icones.html)
import { chromium } from "playwright-core";
import { copyFileSync } from "node:fs";
const BASE = process.argv[2] || "http://127.0.0.1:4198";
copyFileSync("scripts/icones.html", "public/icones.html");
const b = await chromium.launch();
for (const t of [512, 192, 180, 32]) {
  const p = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: t / 512 });
  await p.goto(`${BASE}/icones.html`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `public/icone-${t}.png`, omitBackground: true });
  await p.close();
}
await b.close();

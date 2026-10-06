// Smoke: capa e uma seção em Chromium real (mobile e desktop), checa erros e rolagem horizontal, tira screenshots.
// Uso: node tests/smoke.mjs [url-base] [caminho]   (servidor de pé: npx wrangler pages dev public)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:4198";
const ROTA = process.argv[3] || "/s/71072/1/1";
const OUT = process.env.SHOTS || "tests/shots";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
let falhas = 0;
for (const [nome, vp] of [["mobile", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 900 }]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.waitForTimeout(3600);
  await p.screenshot({ path: `${OUT}/capa-${nome}.png`, fullPage: true });
  await p.goto(BASE + ROTA, { waitUntil: "networkidle" });
  await p.waitForSelector("#extras:not([hidden])", { timeout: 8000 }).catch(() => erros.push("resultado não apareceu"));
  await p.waitForTimeout(3400);
  await p.screenshot({ path: `${OUT}/secao-${nome}.png`, fullPage: true });
  const larg = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (larg > 0) erros.push(`rolagem horizontal de ${larg}px`);
  console.log(nome, erros.length ? erros : "ok");
  if (erros.length) falhas++;
  await ctx.close();
}
await b.close();
process.exit(falhas ? 1 : 0);

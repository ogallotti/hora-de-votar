// Smoke: abre a capa e uma seção em Chromium real (mobile e desktop, claro e escuro), checa erros e tira screenshots.
// Uso: node tests/smoke.mjs [url-base] [rota]   (servidor de pé: pnpm serve)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:4195";
const ROTA = process.argv[3] || "#/7072/49/64";
const OUT = process.env.SHOTS || "tests/shots";
mkdirSync(OUT, { recursive: true });
const navegador = await chromium.launch();
let falhas = 0;
for (const [nome, vp] of [["mobile", { width: 390, height: 844 }], ["desktop", { width: 1366, height: 900 }]]) {
  for (const tema of ["light", "dark"]) {
    const ctx = await navegador.newContext({ viewport: vp, colorScheme: tema, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    const erros = [];
    p.on("pageerror", (e) => erros.push(String(e)));
    p.on("console", (m) => m.type() === "error" && erros.push(m.text()));
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    await p.screenshot({ path: `${OUT}/capa-${nome}-${tema}.png`, fullPage: true });
    await p.goto(BASE + "/" + ROTA, { waitUntil: "networkidle" });
    await p.waitForSelector("#resultado:not([hidden]) .r2-linha", { timeout: 8000 }).catch(() => erros.push("resultado não apareceu"));
    await p.screenshot({ path: `${OUT}/secao-${nome}-${tema}.png`, fullPage: true });
    const larg = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (larg > 0) erros.push(`rolagem horizontal de ${larg}px`);
    if (erros.length) { falhas++; console.log(nome, tema, erros); } else console.log(nome, tema, "ok");
    await ctx.close();
  }
}
await navegador.close();
process.exit(falhas ? 1 : 0);

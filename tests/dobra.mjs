// Tudo do anúncio para cima precisa caber na primeira tela (sem rolar), na capa e na página da seção,
// nos tamanhos de tela mais comuns. Uso: node tests/dobra.mjs [url-base] [caminho da seção]
import { chromium } from "playwright-core";
const BASE = process.argv[2] || "http://127.0.0.1:4198";
const SECAO = process.argv[3] || "/s/9210/3/410";
const TELAS = [
  ["iPhone SE", 375, 667], ["Android 360", 360, 740], ["iPhone 14", 390, 844], ["iPhone Plus", 430, 932],
  ["notebook 1280", 1280, 720], ["notebook 1366", 1366, 768], ["desktop 1440", 1440, 900], ["full HD", 1920, 1080],
];
const b = await chromium.launch();
let falhas = 0;
for (const [nome, w, h] of TELAS) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const linha = [];
  for (const [pag, url] of [["capa", "/"], ["seção", SECAO]]) {
    await p.goto(BASE + url, { waitUntil: "networkidle" });
    await p.waitForTimeout(600);
    const fim = await p.evaluate(() => Math.round(document.querySelector("#anuncios").getBoundingClientRect().bottom));
    const ok = fim <= h;
    if (!ok) falhas++;
    linha.push(`${pag} ${ok ? "ok" : "NÃO"} (${fim}/${h})`);
  }
  console.log(nome.padEnd(14), linha.join("   "));
  await p.close();
}
await b.close();
process.exit(falhas ? 1 : 0);

// Busca universal como um usuário: vários jeitos de achar a seção.
import { chromium } from "playwright-core";
const BASE = process.argv[2] || "http://127.0.0.1:4195";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await p.goto(BASE + "/", { waitUntil: "networkidle" });
async function busca(q, foto) {
  await p.fill("#q", "");
  await p.type("#q", q, { delay: 15 });
  await p.waitForTimeout(700);
  const grupos = await p.$$eval("#resultados .grupo", (gs) => gs.map((g) => `${g.querySelector(".grupo-rot").textContent}: ${[...g.querySelectorAll(".item .t")].slice(0, 3).map((t) => t.textContent).join(" | ")}`));
  console.log(`"${q}" →`, grupos.length ? grupos : await p.textContent("#resultados"));
  if (foto) await p.screenshot({ path: `tests/shots/${foto}.png` });
}
await busca("102 sul brasília", "busca-1");
await busca("pinheiros são paulo");
await busca("recife zona 1 seção 40");
await busca("recife zona 1 seção 20");
await busca("campinas");
await busca("agnelo rossi");
await busca("agnelo rossi são paulo");
await busca("2/120 porto alegre");
await busca("rua augusta são paulo", "busca-2");
await busca("102 sul brasília");
await p.keyboard.press("Enter");
await p.waitForSelector("#extras:not([hidden])");
await p.waitForTimeout(2600);
console.log("abriu:", await p.textContent("#titulo"), "|", p.url());
await p.screenshot({ path: "tests/shots/resultado-local.png" });
await p.click(".chip >> nth=2");
await p.waitForTimeout(2200);
console.log("chip:", await p.textContent("#titulo"), "|", p.url());
await p.screenshot({ path: "tests/shots/resultado-chip.png" });
// régua por teclado
await p.focus("#grafico");
for (let k = 0; k < 6; k++) await p.keyboard.press("ArrowLeft");
console.log("régua:", await p.textContent("#l-hora"), "1º", await p.textContent("#w1"), "2º", await p.textContent("#w2"));
const dl = p.waitForEvent("download", { timeout: 8000 }).catch(() => null);
await p.click("#baixar");
const d = await dl;
if (d) { await d.saveAs("tests/shots/stories.png"); console.log("stories ok"); } else erros.push("stories não baixou");
console.log(erros.length ? erros : "sem erros");
await b.close();

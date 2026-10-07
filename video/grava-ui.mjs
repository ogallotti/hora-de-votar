// Grava a interface real do site, quadro a quadro, com o relógio da página controlado (animações determinísticas).
// Uso: node video/grava-ui.mjs <clipe> [base]   (clipes: busca, nerd; base padrão http://127.0.0.1:4199)
// Saída: video/clipes/<clipe>/%04d.png (30 quadros por segundo) e video/clipes/<clipe>.mp4
import { chromium, devices } from "playwright-core";
import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const [clipe = "busca", BASE = "http://127.0.0.1:4199"] = process.argv.slice(2);
const FPS = 30, DT = 1000 / FPS;
const pasta = new URL(`./clipes/${clipe}/`, import.meta.url).pathname;
rmSync(pasta, { recursive: true, force: true });
mkdirSync(pasta, { recursive: true });

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--hide-scrollbars"] });
const c = await b.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 3 });
const p = await c.newPage();
p.on("pageerror", (e) => console.error("pageerror:", e.message));
await p.clock.install({ time: new Date("2026-10-07T10:00:00-03:00") });
// no vídeo a página não rola sozinha ao abrir a seção: a manchete fica à vista junto com o gráfico
if (clipe === "busca") await p.addInitScript(() => { Element.prototype.scrollIntoView = () => {}; window.scrollTo = () => {}; window.scrollBy = () => {}; });

let f = 0;
const quadro = async () => { await p.screenshot({ path: `${pasta}${String(f).padStart(4, "0")}.png` }); f++; await p.clock.runFor(DT); };
const espera = async (n) => { for (let i = 0; i < n; i++) await quadro(); };
// segue gravando até uma condição valer (rede real chega entre um quadro e outro)
const ate = async (cond, max = 120) => { for (let i = 0; i < max && !(await p.evaluate(cond).catch(() => false)); i++) await quadro(); };

if (clipe === "busca") {
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.clock.runFor(3000); // capa pronta: o gráfico do Brasil já entrou
  await espera(12);
  await p.tap("#q");
  await espera(6);
  for (const ch of "410 undb") { await p.keyboard.type(ch); await espera(3); }
  await ate(() => document.querySelectorAll("#resultados .item").length > 0);
  await espera(14);
  await p.keyboard.press("Enter");
  await ate(() => /Vá entre/.test(document.querySelector("#titulo")?.textContent || ""));
  await espera(150); // entrada do gráfico e a régua indo até o melhor horário
} else if (clipe === "nerd") {
  await p.goto(`${BASE}/nerd`, { waitUntil: "networkidle" });
  for (let i = 0; i < 60 && !(await p.evaluate(() => document.getElementById("loading")?.classList.contains("done") || !document.getElementById("loading"))); i++) { await p.clock.runFor(100); await p.waitForTimeout(50); }
  await p.clock.runFor(1500);
  await espera(10);
  await p.evaluate(() => window.__ctl.entrar("ma"));
  await espera(36);
  await p.evaluate(() => window.__ctl.select("municipio", 9210));
  await espera(40);
  await p.evaluate(() => window.__ctl.setMode("secao"));
  await espera(50);
}
await b.close();
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", `${pasta}%04d.png`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow", `${pasta.replace(/\/$/, "")}.mp4`]);
console.log(`${clipe}: ${f} quadros (${(f / FPS).toFixed(1)} s)`);

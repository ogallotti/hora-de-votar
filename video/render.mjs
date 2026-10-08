// Renderiza video/cena.html em MP4 1080×1920 (ou 1920×1080 com --16x9) a 30 fps, com a trilha e os efeitos sonoros.
// Uso: node video/render.mjs [base] [--previa]   (base padrão http://127.0.0.1:4188, servindo a raiz do repositório)
//   --previa: só uma folha de contato (1 quadro a cada 0,5 s), sem áudio
// Saída: video/saida/hora-de-votar-lancamento.mp4 (ou hora-de-votar-lancamento-16x9.mp4)
import { chromium } from "playwright-core";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const previa = args.includes("--previa");
const largo = args.includes("--16x9");
const narrado = args.includes("--narrado");
const [VW, VH] = largo ? [1920, 1080] : [1080, 1920];
const NOME = `hora-de-votar-lancamento${largo ? "-16x9" : ""}${narrado ? "-narrado" : ""}`;
const BASE = args.find((a) => a.startsWith("http")) || "http://127.0.0.1:4188";
const FPS = 30;
const raiz = new URL("./", import.meta.url).pathname;
const pasta = `${raiz}saida/quadros/`;
rmSync(pasta, { recursive: true, force: true });
mkdirSync(pasta, { recursive: true });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
p.on("pageerror", (e) => console.error("pageerror:", e.message));
await p.goto(`${BASE}/video/cena.html${largo ? "?f=16x9" : ""}`, { waitUntil: "networkidle" });
await p.evaluate(() => window.pronto);
const { DURACAO, SONS, FIM_TRILHA } = await p.evaluate(() => ({ DURACAO: window.DURACAO, SONS: window.SONS, FIM_TRILHA: window.FIM_TRILHA }));
// narrado: a voz conduz (video/narracao.mjs); a cena congela nas pausas e tudo o que vem depois anda junto
const P = narrado ? (await import("./narracao.mjs")).plano(DURACAO) : null;
if (P) await p.evaluate((x) => { window.PAUSAS = x; }, P.pausas);
const warp = P ? P.warp : (t) => t;
const DUR = P ? P.duracao : DURACAO;
const total = Math.round(DUR * FPS);
const passo = previa ? FPS / 2 : 1;
let n = 0;
for (let f = 0; f < total; f += passo) {
  await p.evaluate((t) => window.quadro(t), f / FPS);
  await p.screenshot({ path: `${pasta}${String(n++).padStart(4, "0")}.${previa ? "png" : "jpg"}`, ...(previa ? {} : { type: "jpeg", quality: 92 }) });
}
await b.close();

const saida = `${raiz}saida/`;
if (previa) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", `${pasta}%04d.png`, "-vf", largo ? "scale=320:-1,tile=8x8" : "scale=216:-1,tile=10x6", "-frames:v", "1", `${saida}previa${largo ? "-16x9" : ""}.png`]);
  console.log(`prévia: ${n} quadros → ${saida}previa.png`);
  process.exit(0);
}

// áudio: trilha até o fecho (corte seco, 30 ms de fade para não estalar) + efeitos nos tempos da linha do tempo
const a = `${raiz}audio/`;
const entradas = ["-i", `${a}trilha.mp3`];
// trilha: até o fecho; numa pausa, repete o trecho de mesmo tamanho logo antes dela (múltiplo da batida: segue no tempo)
const pedacos = [];
let cursor = 0;
for (const [pp, e] of (P?.pausas || []).filter(([pp]) => pp < FIM_TRILHA)) { pedacos.push([cursor, pp], [pp - e, pp]); cursor = pp; }
pedacos.push([cursor, FIM_TRILHA]);
const fimTrilha = warp(FIM_TRILHA - 1e-3);
const filtros = [`[0:a]asplit=${pedacos.length}${pedacos.map((_, i) => `[t${i}]`).join("")}`,
  ...pedacos.map(([x, y], i) => `[t${i}]atrim=${x}:${y},asetpts=PTS-STARTPTS,afade=t=in:d=0.004,afade=t=out:st=${Math.max(0, y - x - 0.004).toFixed(3)}:d=0.004[p${i}]`),
  `${pedacos.map((_, i) => `[p${i}]`).join("")}concat=n=${pedacos.length}:v=0:a=1,afade=t=out:st=${(fimTrilha - 0.03).toFixed(3)}:d=0.03,volume=0.9,apad=whole_dur=${DUR},aformat=sample_rates=48000:channel_layouts=stereo[m]`];
let n0 = 1;
SONS.forEach(([arq, t, vol, dur], i) => {
  if (!existsSync(`${a}${arq}`)) throw new Error(`falta ${arq}`);
  entradas.push("-i", `${a}${arq}`);
  const ms = Math.max(0, Math.round(warp(t) * 1000));
  // com duração: corta junto com o movimento, com 60 ms de fade para não estalar
  const corte = dur ? `atrim=0:${dur},afade=t=out:st=${Math.max(0, dur - 0.06).toFixed(3)}:d=0.06,` : "";
  filtros.push(`[${n0 + i}:a]aformat=sample_rates=48000:channel_layouts=stereo,${corte}volume=${vol * (P ? 0.8 : 1)},adelay=${ms}|${ms}[s${i}]`);
});
n0 += SONS.length;
const vozes = P?.falas || [];
vozes.forEach(([arq, t], i) => {
  entradas.push("-i", `${a}${arq}`);
  const ms = Math.round(t * 1000);
  filtros.push(`[${n0 + i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.6,adelay=${ms}|${ms},apad=whole_dur=${DUR}[v${i}]`);
});
let musica = "[m]";
if (vozes.length) {
  filtros.push(`${vozes.map((_, i) => `[v${i}]`).join("")}amix=inputs=${vozes.length}:duration=longest:normalize=0,asplit=2[voz][chave]`);
  // ducking: a trilha abaixa quando a voz entra e volta quando ela para
  filtros.push(`[m][chave]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350:makeup=1[md]`);
  musica = "[md]";
}
filtros.push(`${musica}${SONS.map((_, i) => `[s${i}]`).join("")}${vozes.length ? "[voz]" : ""}amix=inputs=${SONS.length + 1 + (vozes.length ? 1 : 0)}:duration=first:normalize=0,atrim=0:${DUR}[out]`);
execFileSync("ffmpeg", ["-v", "error", "-y", ...entradas, "-filter_complex", filtros.join(";"), "-map", "[out]", "-c:a", "pcm_s16le", `${saida}mix.wav`]);
// loudness das redes (−14 LUFS, pico verdadeiro −1,5 dB), em duas passadas para não "bombear" o som
const med = spawnSync("ffmpeg", ["-hide_banner", "-i", `${saida}mix.wav`, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { encoding: "utf8" }).stderr; // o JSON sai no stderr
const ini = med.lastIndexOf("{"), m = JSON.parse(med.slice(ini, med.indexOf("}", ini) + 1));
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", `${saida}mix.wav`, "-af",
  `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`,
  "-c:a", "pcm_s16le", `${saida}audio.wav`]);
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", `${pasta}%04d.jpg`, "-i", `${saida}audio.wav`,
  "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "192k", "-shortest", `${saida}${NOME}.mp4`]);
console.log(`vídeo: ${n} quadros, ${SONS.length} efeitos → ${saida}${NOME}.mp4`);

// Planeja a versão narrada: a voz conduz e a imagem espera por ela.
// Lê video/narracao.json (falas com âncoras "palavra ↔ momento da cena") e devolve:
//   pausas: [[momento original, segundos]]: a cena congela nesse momento por esse tempo (a trilha repete o mesmo trecho)
//   falas:  [[arquivo, segundo no vídeo final]]
//   duracao: segundos do vídeo final
// As pausas têm sempre um número inteiro de batidas (0,5 s), para os cortes continuarem caindo na batida.
// Uma pausa nunca entra antes de uma âncora já alinhada (senão a desalinharia).
import { readFileSync } from "node:fs";

const BATIDA = 0.5, FASE = 0.034;
const b = (k) => FASE + BATIDA * k;
const CONF = b(60) + 0.25 + 4 * 0.32 + 0.2; // tecla confirma da urna (ver cena.html, fecho)

export function momento(expr) {
  const [base, mais = "0"] = String(expr).split("+");
  const t = base.startsWith("b:") ? b(+base.slice(2)) : base === "conf" ? CONF : +base;
  return t + +mais;
}

// ADIANTA: a imagem chega um pouco antes da palavra (a entrada de cada elemento leva ~0,3 s para ficar legível)
const ADIANTA = 0.3;

export function plano(duracaoOriginal, folga = 0.15) {
  const { falas } = JSON.parse(readFileSync(new URL("./narracao.json", import.meta.url)));
  const pausas = [];
  const warp = (t) => t + pausas.reduce((s, [p, e]) => s + (p <= t ? e : 0), 0);
  const arredonda = (x) => Math.round(x / BATIDA) * BATIDA; // batida mais próxima: erro de no máximo ±0,25 s
  let ultimaAncora = -1, fimAnterior = -Infinity;
  const segura = (onde, quanto) => {
    const e = arredonda(quanto);
    if (e <= 0) return;
    // o ponto da batida mais próximo antes da âncora, mas depois da última âncora alinhada
    const grade = FASE + Math.floor((onde - FASE) / BATIDA + 1e-6) * BATIDA;
    const p = grade > ultimaAncora + 1e-6 ? grade : onde;
    pausas.push([+p.toFixed(3), e]);
    pausas.sort((x, y) => x[0] - y[0]);
  };
  const saida = [];
  for (const f of falas) {
    const [[w0, e0], ...resto] = f.ancoras;
    const o0 = momento(e0);
    // a fala não começa antes de a anterior acabar: se for preciso, a cena espera
    segura(o0, fimAnterior + folga + w0 - ADIANTA - warp(o0));
    ultimaAncora = o0;
    const inicio = Math.max(warp(o0) - w0 + ADIANTA, fimAnterior + folga);
    for (const [w, e] of resto) {
      const o = momento(e);
      segura(o, inicio + w - ADIANTA - warp(o));
      ultimaAncora = o;
    }
    fimAnterior = inicio + f.fim;
    // "segura": a cena desse ponto só segue depois de a fala acabar
    if (f.segura) { const o = momento(f.segura); segura(o, fimAnterior + 0.2 - warp(o)); ultimaAncora = o; }
    saida.push([f.arq, +inicio.toFixed(3)]);
  }
  const duracao = Math.max(warp(duracaoOriginal), fimAnterior + 0.7);
  return { pausas, falas: saida, duracao: +duracao.toFixed(3), warp };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = plano(33.5);
  console.log("pausas:", r.pausas.map(([p, e]) => `${p.toFixed(2)}s +${e}s`).join(", "));
  console.log("falas:", r.falas.map(([a, t]) => `${a.split("/").pop()} @${t}`).join(", "));
  console.log("duração:", r.duracao, "s");
}

// Gráfico do dia na urna: 1º turno (área, medido) e 2º turno (linha, estimativa), faixas de 15 min.
import { hora, OFICIAIS } from "./modelo.js";

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, pai) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (pai) pai.appendChild(e);
  return e;
}

// Curva monotônica (Fritsch-Carlson): suave sem inventar picos entre os pontos.
function caminho(pts) {
  const n = pts.length;
  if (n < 2) return "";
  const dx = [], dy = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); dy.push(pts[i + 1][1] - pts[i][1]); m.push(dy[i] / dx[i]); }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

/**
 * @param {HTMLElement} alvo
 * @param {{h0:number, o1:number[], o2?:number[], melhor?:number, pico?:number, mini?:boolean, anima?:boolean}} op
 */
export function desenha(alvo, op) {
  const { h0 = 8, o2, melhor, mini = false } = op;
  // depois do encerramento só aparece quem ainda estava na fila; a vitrine corta em 1 h
  const o1 = mini ? op.o1.slice(0, OFICIAIS + 4) : op.o1;
  alvo.innerHTML = "";
  alvo.classList.toggle("anima", op.anima !== false);
  const W = Math.max(280, alvo.clientWidth), H = alvo.clientHeight || 300;
  const estreito = W < 520;
  const m = { t: 26, r: 10, b: 28, l: 38 };
  const ultimo = (xs) => { let k = xs.length - 1; while (k >= OFICIAIS && !xs[k]) k--; return k; };
  const N = Math.max(OFICIAIS, ultimo(o1) + 1, o2 && !mini ? ultimo(o2) + 1 : 0);
  const x = (i) => m.l + ((i + 0.5) / N) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - v / 100) * (H - m.t - m.b);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true" }, alvo);

  // grade e eixo y
  const g = el("g", { class: "eixo" }, svg);
  for (const v of [0, 50, 100]) {
    el("line", { class: v ? "grade" : "base", x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, g);
    const t = el("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, g);
    t.textContent = v ? `${v}%` : "0";
  }
  // eixo x: horas cheias
  const passo = estreito ? 8 : 4;
  for (let i = 0; i <= N; i += passo) {
    const px = m.l + (i / N) * (W - m.l - m.r);
    const t = el("text", { x: px, y: H - 8, "text-anchor": i === 0 ? "start" : "middle" }, g);
    t.textContent = hora(i, h0);
  }
  // depois do encerramento: só quem já estava na fila
  if (N > OFICIAIS) {
    const x0 = m.l + (OFICIAIS / N) * (W - m.l - m.r);
    el("rect", { class: "encerrado", x: x0, y: m.t, width: W - m.r - x0, height: H - m.t - m.b }, svg);
    el("line", { class: "base", x1: x0, x2: x0, y1: m.t - 6, y2: H - m.b }, svg);
    if (!mini && W - m.r - x0 > 56) {
      const t = el("text", { class: "eixo-nota", x: x0 + 6, y: m.t - 10, fill: "currentColor" }, g);
      t.textContent = "encerrou";
    }
  }

  // melhor hora (2º turno)
  if (melhor != null) {
    const x0 = m.l + (melhor / N) * (W - m.l - m.r), x1 = m.l + ((melhor + 4) / N) * (W - m.l - m.r);
    const gm = el("g", { class: "surge" }, svg);
    el("rect", { class: "faixa-melhor", x: x0, y: m.t - 4, width: x1 - x0, height: H - m.t - m.b + 4, rx: 6 }, gm);
    const t = el("text", { class: "rot-melhor", x: (x0 + x1) / 2, y: m.t - 10, "text-anchor": "middle" }, gm);
    t.textContent = "melhor horário";
  }

  // 1º turno: área
  const p1 = o1.slice(0, N).map((v, i) => [x(i), y(v)]);
  const linha1 = caminho(p1);
  const g1 = el("g", { class: "revela" }, svg);
  el("path", { class: "r1-area", d: `${linha1}L${p1[p1.length - 1][0]},${y(0)}L${p1[0][0]},${y(0)}Z` }, g1);
  el("path", { class: "r1-linha", d: linha1 }, g1);

  // 2º turno: linha
  if (o2) {
    const p2 = o2.slice(0, Math.min(N, ultimo(o2) + 1)).map((v, i) => [x(i), y(v)]);
    const l2 = el("path", { class: "r2-linha", d: caminho(p2) }, svg);
    try { l2.style.setProperty("--comp", Math.ceil(l2.getTotalLength())); } catch { /* sem layout */ }
  }

  // pico do 1º turno
  let pico = 0;
  for (let i = 0; i < OFICIAIS; i++) if (o1[i] > o1[pico]) pico = i;
  if (o1[pico] > 0) {
    const gp = el("g", { class: "surge" }, svg);
    el("circle", { class: "pico", cx: x(pico), cy: y(o1[pico]), r: 5 }, gp);
    const perto = melhor != null && Math.abs(pico - (melhor + 2)) < 6;
    if (!perto) {
      const ancora = pico < 4 ? "start" : pico > N - 5 ? "end" : "middle";
      const t = el("text", { class: "rot-pico", x: x(pico), y: y(o1[pico]) - 12, "text-anchor": ancora }, gp);
      t.textContent = "pico";
    }
  }

  // hover / toque
  const mira = el("line", { class: "mira", y1: m.t, y2: H - m.b, visibility: "hidden" }, svg);
  const pt1 = el("circle", { class: "ponto-1", r: 4.5, visibility: "hidden" }, svg);
  const pt2 = o2 ? el("circle", { class: "ponto-2", r: 4.5, visibility: "hidden" }, svg) : null;
  const dica = document.createElement("div");
  dica.className = "dica";
  dica.hidden = true;
  alvo.appendChild(dica);
  const area = el("rect", { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: "transparent" }, svg);
  const mostra = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(N - 1, Math.floor(((px - m.l) / (W - m.l - m.r)) * N)));
    const cx = x(i);
    for (const e of [mira]) { e.setAttribute("x1", cx); e.setAttribute("x2", cx); e.setAttribute("visibility", "visible"); }
    pt1.setAttribute("cx", cx); pt1.setAttribute("cy", y(o1[i] || 0)); pt1.setAttribute("visibility", "visible");
    if (pt2) { pt2.setAttribute("cx", cx); pt2.setAttribute("cy", y(o2[i] || 0)); pt2.setAttribute("visibility", "visible"); }
    const depois = i >= OFICIAIS ? " (após o encerramento)" : "";
    dica.innerHTML = `<b>${hora(i, h0)} às ${hora(i + 1, h0)}${depois}</b>` +
      `<span>1º turno: ${o1[i] || 0}% pegaram fila</span>` +
      (o2 ? `<span>2º turno: cerca de ${o2[i] || 0}%</span>` : "");
    dica.hidden = false;
    const left = Math.max(90, Math.min(r.width - 90, (cx / W) * r.width));
    dica.style.left = `${left}px`;
    dica.style.top = `${Math.max(0, (y(Math.max(o1[i] || 0, o2 ? o2[i] || 0 : 0)) / H) * r.height - 86)}px`;
  };
  const esconde = () => {
    for (const e of [mira, pt1, pt2]) e?.setAttribute("visibility", "hidden");
    dica.hidden = true;
  };
  area.addEventListener("pointermove", mostra);
  area.addEventListener("pointerdown", mostra);
  area.addEventListener("pointerleave", esconde);
}

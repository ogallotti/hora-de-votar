// Gráfico do dia na urna: 1º turno (área, medido) × 2º turno (linha, estimativa), em faixas de 15 min.
// Um só gráfico na página: os dados mudam (Brasil → local → seção) e a curva se transforma.
// Régua: arraste, toque ou setas do teclado; avisa quem está ouvindo (aoMover) a cada faixa.
import { hora, OFICIAIS } from "./modelo.js";
import { caminho } from "./curva.js";

const NS = "http://www.w3.org/2000/svg";
const N = OFICIAIS + 4; // até 1 h depois do encerramento (quem ainda estava na fila)
const reduz = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;

function el(tag, attrs = {}, pai) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  pai?.appendChild(e);
  return e;
}
const ajusta = (xs) => Array.from({ length: N }, (_, i) => xs?.[i] ?? 0);

export class Grafico {
  constructor(alvo, { aoMover, aoEntrarMelhor } = {}) {
    this.alvo = alvo;
    this.aoMover = aoMover;
    this.aoEntrarMelhor = aoEntrarMelhor;
    this.h0 = 8;
    this.cur = { o1: ajusta(), o2: ajusta(), melhor: 0, segundo: null };
    this.alvoDados = null;
    this.i = null;
    this.mexeu = false;
    this.monta();
    new ResizeObserver(() => this.desenha()).observe(alvo);
  }

  monta() {
    const a = this.alvo;
    a.innerHTML = "";
    a.tabIndex = 0;
    a.setAttribute("role", "slider");
    a.setAttribute("aria-valuemin", "0");
    a.setAttribute("aria-valuemax", String(N - 1));
    a.setAttribute("aria-label", "Horário do dia");
    const svg = (this.svg = el("svg", { "aria-hidden": "true" }, a));
    const defs = el("defs", {}, svg);
    const g1 = el("linearGradient", { id: "grad-r1", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: 0, "stop-color": "#e6e9e6" }, g1);
    el("stop", { offset: 1, "stop-color": "#f3f4f3" }, g1);
    const g2 = el("linearGradient", { id: "grad-r2", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: 0, "stop-color": "#0e7a45", "stop-opacity": 0.2 }, g2);
    el("stop", { offset: 1, "stop-color": "#0e7a45", "stop-opacity": 0 }, g2);
    const pat = el("pattern", { id: "hachura", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 6, height: 6, fill: "#fafbfa" }, pat);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "#eceeec", "stroke-width": 2 }, pat);
    this.n = {
      grade: el("g", {}, svg),
      encerrado: el("rect", { class: "g-encerrado" }, svg),
      encRot: el("text", { class: "g-encerrado-rot", "text-anchor": "middle" }, svg),
      melhor: el("rect", { class: "g-melhor", rx: 12 }, svg),
      segundo: el("rect", { class: "g-segundo", rx: 12 }, svg),
      r1a: el("path", { class: "g-r1-area" }, svg),
      r1l: el("path", { class: "g-r1-linha" }, svg),
      r2a: el("path", { class: "g-r2-area" }, svg),
      r2l: el("path", { class: "g-r2-linha" }, svg),
      eixo: el("g", {}, svg),
      pico: el("circle", { class: "g-pico", r: 5.5 }, svg),
      mira: el("line", { class: "g-mira" }, svg),
      k1: el("circle", { class: "g-k1", r: 5.5 }, svg),
      k2: el("circle", { class: "g-k2", r: 7 }, svg),
    };
    const etq = (cls, txt = "") => { const d = document.createElement("div"); d.className = `etiqueta ${cls}`; d.textContent = txt; a.appendChild(d); return d; };
    this.e = { melhor: etq("etiqueta-melhor", "melhor horário"), segundo: etq("etiqueta-segundo", "também bom"), pico: etq("etiqueta-pico", "pico"), hora: etq("etiqueta-hora") };

    const pos = (ev) => {
      const r = svg.getBoundingClientRect();
      const fr = (ev.clientX - r.left - this.m.l) / (r.width - this.m.l - this.m.r);
      return Math.max(0, Math.min(N - 1, Math.floor(fr * N)));
    };
    let arrastando = false;
    a.addEventListener("pointerdown", (ev) => { arrastando = true; this.usuario(); this.vai(pos(ev)); a.setPointerCapture?.(ev.pointerId); });
    a.addEventListener("pointermove", (ev) => { if (arrastando || ev.pointerType === "mouse") { this.usuario(); this.vai(pos(ev)); } });
    const solta = () => { arrastando = false; };
    a.addEventListener("pointerup", solta);
    a.addEventListener("pointercancel", solta);
    a.addEventListener("keydown", (ev) => {
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: 1, ArrowDown: -1, PageUp: 4, PageDown: -4 }[ev.key];
      if (d == null && ev.key !== "Home" && ev.key !== "End") return;
      ev.preventDefault();
      this.usuario();
      const i = this.i ?? 0;
      this.vai(ev.key === "Home" ? 0 : ev.key === "End" ? N - 1 : Math.max(0, Math.min(N - 1, i + d)));
    });
  }

  usuario() { this.mexeu = true; cancelAnimationFrame(this.passeio); }

  /** dados: {h0, o1, o2, melhor, segundo}; modo: "entrada" (onda), "transforma" ou "direto". */
  define(dados, modo = "transforma") {
    this.h0 = dados.h0 ?? 8;
    const alvo = { o1: ajusta(dados.o1), o2: ajusta(dados.o2), melhor: dados.melhor ?? 0, segundo: dados.segundo ?? null };
    cancelAnimationFrame(this.anim);
    if (reduz() || modo === "direto") { this.cur = alvo; this.desenha(); return; }
    const de = modo === "entrada" ? { o1: ajusta(), o2: ajusta(), melhor: alvo.melhor, segundo: alvo.segundo } : structuredClone(this.cur);
    const t0 = performance.now(), dur = modo === "entrada" ? 1500 : 900;
    const passo = (agora) => {
      const t = Math.min(1, (agora - t0) / dur);
      const lerp = (a, b, k) => a + (b - a) * k;
      const onda = (i, atraso) => (modo === "entrada" ? easeOut(Math.max(0, Math.min(1, (t - atraso - (i / N) * 0.35) / 0.55))) : easeIO(t));
      this.cur = {
        o1: alvo.o1.map((v, i) => lerp(de.o1[i], v, onda(i, 0))),
        o2: alvo.o2.map((v, i) => lerp(de.o2[i], v, onda(i, 0.12))),
        melhor: lerp(de.melhor, alvo.melhor, easeIO(t)),
        segundo: alvo.segundo == null ? null : lerp(de.segundo ?? alvo.segundo, alvo.segundo, easeIO(t)),
      };
      this.alvo.style.setProperty("--prog", t);
      this.desenha();
      if (t < 1) this.anim = requestAnimationFrame(passo);
      else { this.cur = alvo; this.desenha(); }
    };
    this.anim = requestAnimationFrame(passo);
  }

  /** Passeio automático da régua até a faixa i (mostra que dá para arrastar). Para no primeiro toque. */
  passeia(i, atraso = 0) {
    if (this.mexeu || reduz()) { this.vai(i, false); return; }
    const t0 = performance.now() + atraso, dur = 1600, de = 0;
    const passo = (agora) => {
      const t = Math.max(0, Math.min(1, (agora - t0) / dur));
      this.vai(Math.round(de + (i - de) * easeIO(t)), false);
      if (t < 1 && !this.mexeu) this.passeio = requestAnimationFrame(passo);
    };
    this.passeio = requestAnimationFrame(passo);
  }

  vai(i, avisa = true) {
    const antes = this.i;
    this.i = i;
    this.desenhaMira();
    if (i !== antes) {
      this.aoMover?.(i, this.cur);
      const m = Math.round(this.cur.melhor);
      const dentro = (k) => k != null && k >= m && k < m + 4;
      if (avisa && dentro(i) && !dentro(antes)) this.aoEntrarMelhor?.();
    }
  }

  series({ r1 = true, r2 = true }) {
    this.alvo.classList.toggle("esconde-1", !r1);
    this.alvo.classList.toggle("esconde-2", !r2);
  }

  desenha() {
    const a = this.alvo, W = Math.max(300, a.clientWidth), H = a.clientHeight || 360;
    const estreito = W < 560;
    const m = (this.m = { t: 40, r: 6, b: 32, l: estreito ? 30 : 38 });
    const x = (this.x = (i) => m.l + ((i + 0.5) / N) * (W - m.l - m.r));
    const xb = (i) => m.l + (i / N) * (W - m.l - m.r);
    const y = (this.y = (v) => m.t + (1 - v / 100) * (H - m.t - m.b));
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const n = this.n, c = this.cur;

    if (this.W !== W || this.H !== H || this.h0Desenhado !== this.h0) {
      this.W = W; this.H = H; this.h0Desenhado = this.h0;
      n.grade.innerHTML = ""; n.eixo.innerHTML = "";
      for (const v of [0, 25, 50, 75, 100]) {
        el("line", { class: v ? "g-grade" : "g-base", x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, n.grade);
        if (v % 50 === 0) el("text", { class: "g-eixo", x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, n.eixo).textContent = v ? `${v}%` : "0";
      }
      const passo = estreito ? 8 : 4;
      for (let i = 0; i <= OFICIAIS; i += passo) {
        el("text", { class: "g-eixo", x: xb(i), y: H - 8, "text-anchor": i === 0 ? "start" : "middle" }, n.eixo).textContent = hora(i, this.h0);
      }
      const x0 = xb(OFICIAIS);
      Object.entries({ x: x0, y: m.t, width: W - m.r - x0, height: H - m.t - m.b }).forEach(([k, v]) => n.encerrado.setAttribute(k, v));
      n.encRot.setAttribute("x", (x0 + W - m.r) / 2);
      n.encRot.setAttribute("y", m.t - 8);
      n.encRot.textContent = W - m.r - x0 > 50 ? "encerrou" : "";
    }

    const p1 = c.o1.map((v, i) => [x(i), y(v)]);
    const p2 = c.o2.slice(0, OFICIAIS).map((v, i) => [x(i), y(v)]);
    const l1 = caminho(p1), l2 = caminho(p2);
    const fecha = (p) => `L${p[p.length - 1][0].toFixed(1)},${y(0)}L${p[0][0].toFixed(1)},${y(0)}Z`;
    n.r1l.setAttribute("d", l1); n.r1a.setAttribute("d", l1 + fecha(p1));
    n.r2l.setAttribute("d", l2); n.r2a.setAttribute("d", l2 + fecha(p2));

    const banda = (r, ini) => {
      if (ini == null) { r.setAttribute("width", 0); return null; }
      const b0 = xb(ini), b1 = xb(ini + 4);
      Object.entries({ x: b0 + 1, y: m.t - 6, width: Math.max(0, b1 - b0 - 2), height: H - m.t - m.b + 6 }).forEach(([k, v]) => r.setAttribute(k, v));
      return (b0 + b1) / 2;
    };
    const cm = banda(n.melhor, c.melhor), cs = banda(n.segundo, c.segundo);
    this.e.melhor.style.left = `${cm}px`; this.e.melhor.style.top = `${m.t - 6}px`;
    this.e.segundo.style.opacity = cs == null || Math.abs(cs - cm) < 132 ? 0 : 1; // não encosta na do melhor
    if (cs != null) { this.e.segundo.style.left = `${cs}px`; this.e.segundo.style.top = `${m.t - 6}px`; }

    let pk = 0;
    for (let i = 0; i < OFICIAIS; i++) if (c.o1[i] > c.o1[pk]) pk = i;
    const px = x(pk);
    const longe = Math.abs(px - cm) > 80 && (cs == null || Math.abs(px - cs) > 80 || this.e.segundo.style.opacity === "0");
    n.pico.setAttribute("cx", x(pk)); n.pico.setAttribute("cy", y(c.o1[pk]));
    this.e.pico.style.left = `${x(pk)}px`; this.e.pico.style.top = `${y(c.o1[pk])}px`;
    this.e.pico.style.opacity = longe && c.o1[pk] > 0 ? 1 : 0;
    this.desenhaMira();
  }

  desenhaMira() {
    const { n, m } = this;
    if (this.i == null || !m) { [n.mira, n.k1, n.k2].forEach((e) => e.setAttribute("visibility", "hidden")); this.e.hora.style.opacity = 0; return; }
    const i = this.i, cx = this.x(i), c = this.cur;
    Object.entries({ x1: cx, x2: cx, y1: m.t - 6, y2: this.H - m.b }).forEach(([k, v]) => n.mira.setAttribute(k, v));
    n.k1.setAttribute("cx", cx); n.k1.setAttribute("cy", this.y(c.o1[i]));
    n.k2.setAttribute("cx", cx); n.k2.setAttribute("cy", this.y(c.o2[i] || 0));
    n.k2.setAttribute("visibility", i < OFICIAIS ? "visible" : "hidden");
    [n.mira, n.k1].forEach((e) => e.setAttribute("visibility", "visible"));
    const e = this.e.hora;
    e.textContent = hora(i, this.h0);
    e.style.left = `${Math.max(28, Math.min(this.W - 28, cx))}px`;
    e.style.opacity = 1;
    const o1 = Math.round(c.o1[i]), o2 = Math.round(c.o2[i] || 0);
    this.alvo.setAttribute("aria-valuenow", String(i));
    this.alvo.setAttribute("aria-valuetext", `${hora(i, this.h0)}: no 1º turno ${o1}% pegaram fila${i < OFICIAIS ? `; no 2º, cerca de ${o2}%` : ", após o encerramento"}`);
  }
}

export { N as FAIXAS_GRAFICO };

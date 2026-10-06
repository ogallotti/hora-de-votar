// Gráfico do dia na urna: as duas curvas (fila no 1º turno, medida; estimativa para o 2º) desenhadas por pontos,
// e cada ponto é um eleitor de verdade, no minuto em que foi votar (no Brasil, cada ponto vale um lote de eleitores).
// Na entrada o dia é revivido: os eleitores acendem na ordem em que votaram; depois alguns piscam, como gente votando.
// Um só gráfico na página: os dados mudam (Brasil → local → seção), as curvas se transformam e o dia recomeça.
// Régua: arraste, toque ou setas do teclado; avisa quem está ouvindo (aoMover) a cada faixa.
import { hora, OFICIAIS } from "./modelo.js";
import { caminho, tangentes, avalia } from "./curva.js";

const NS = "http://www.w3.org/2000/svg";
const N = OFICIAIS + 4; // até 1 h depois do encerramento (quem ainda estava na fila)
const MIN = N * 15;
const COR = { r1: "#9aa29e", r1Forte: "#4b524e", verde: "#0e7a45", brilho: "#3fd283" };
const reduz = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

function el(tag, attrs = {}, pai) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  pai?.appendChild(e);
  return e;
}
const ajusta = (xs) => Array.from({ length: N }, (_, i) => xs?.[i] ?? 0);
// pseudoaleatório estável (o mesmo eleitor fica sempre no mesmo lugar)
const acaso = (k, s = 1) => { const x = Math.sin(k * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };

function sprite(raio, cor, halo, dpr, forca = "55") {
  const t = Math.ceil((raio + halo) * 2 * dpr) + 2, c = document.createElement("canvas");
  c.width = c.height = t;
  const x = c.getContext("2d"), m = t / 2;
  if (halo) {
    const g = x.createRadialGradient(m, m, raio * dpr * 0.5, m, m, m);
    g.addColorStop(0, `${cor}${forca}`); g.addColorStop(1, `${cor}00`);
    x.fillStyle = g; x.fillRect(0, 0, t, t);
  }
  x.fillStyle = cor; x.beginPath(); x.arc(m, m, raio * dpr, 0, Math.PI * 2); x.fill();
  return c;
}

/** Pontos a desenhar: minuto (com fração estável) de cada eleitor; sem lista, distribui o total de cada faixa. */
function pontosDe(eleitores, v, escala) {
  if (eleitores?.length) return eleitores.map((m, k) => ({ m: Math.min(MIN - 0.01, m + acaso(k, 3)), j: acaso(k, 7) * 2 - 1, k }));
  const out = [];
  v.forEach((n, i) => {
    const q = Math.round(n / escala);
    for (let a = 0; a < q; a++) { const k = out.length; out.push({ m: i * 15 + ((a + acaso(k, 3)) / q) * 15, j: acaso(k, 7) * 2 - 1, k }); }
  });
  return out;
}

export class Grafico {
  constructor(alvo, { aoMover, aoEntrarMelhor } = {}) {
    this.alvo = alvo;
    this.aoMover = aoMover;
    this.aoEntrarMelhor = aoEntrarMelhor;
    this.h0 = 8;
    this.cur = { o1: ajusta(), o2: ajusta(), melhor: 0, segundo: null };
    this.pts = [];
    this.i = null;
    this.mexeu = false;
    this.mostra = { r1: true, r2: true };
    this.piscas = [];
    this.relogio = MIN; // até que minuto do dia os eleitores já apareceram (revivendo o dia)
    this.visivel = true;
    this.monta();
    new ResizeObserver(() => { this.W = null; this.desenha(); }).observe(alvo);
    new IntersectionObserver(([e]) => { this.visivel = e.isIntersecting; this.liga(); }).observe(alvo);
    document.addEventListener("visibilitychange", () => this.liga());
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
    el("stop", { offset: 0, "stop-color": "#eef0ee" }, g1);
    el("stop", { offset: 1, "stop-color": "#f8f9f8" }, g1);
    const g2 = el("linearGradient", { id: "grad-r2", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: 0, "stop-color": "#0e7a45", "stop-opacity": 0.1 }, g2);
    el("stop", { offset: 1, "stop-color": "#0e7a45", "stop-opacity": 0 }, g2);
    this.n = {
      grade: el("g", {}, svg),
      encerrado: el("rect", { class: "g-encerrado" }, svg),
      encRot: el("text", { class: "g-encerrado-rot", "text-anchor": "middle" }, svg),
      melhor: el("rect", { class: "g-melhor", rx: 12 }, svg),
      segundo: el("rect", { class: "g-segundo", rx: 12 }, svg),
      r1a: el("path", { class: "g-r1-area" }, svg),
      r2a: el("path", { class: "g-r2-area" }, svg),
      eixo: el("g", {}, svg),
      mira: el("line", { class: "g-mira" }, svg),
      pico: el("circle", { class: "g-pico", r: 4.5 }, svg),
    };
    this.cv = document.createElement("canvas");
    this.cv.className = "g-pontos";
    a.appendChild(this.cv);
    this.ctx = this.cv.getContext("2d");
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

  /**
   * dados: {h0, o1, o2, melhor, segundo, eleitores (minuto de cada eleitor desde a abertura) | v + escala (eleitores por ponto)}
   * modo: "entrada" (o dia é revivido), "transforma" (curvas mudam e o dia recomeça) ou "direto".
   */
  define(dados, modo = "transforma") {
    this.h0 = dados.h0 ?? 8;
    const alvo = { o1: ajusta(dados.o1), o2: ajusta(dados.o2), melhor: dados.melhor ?? 0, segundo: dados.segundo ?? null };
    this.pts = pontosDe(dados.eleitores, ajusta(dados.v), dados.escala || 1);
    this.densidade = this.pts.length / (OFICIAIS * 15); // pontos por minuto
    this.W = null; // tamanho dos pontos depende da densidade
    this.piscas = [];
    if (reduz() || modo === "direto") { this.cur = alvo; this.tween = null; this.dia = null; this.relogio = MIN; this.desenha(); this.liga(); return; }
    const de = modo === "entrada" ? { ...alvo, o1: alvo.o1.map(() => 0), o2: alvo.o2.map(() => 0) } : structuredClone(this.cur);
    const agora = performance.now();
    this.tween = { de, alvo, t0: agora, dur: modo === "entrada" ? 1100 : 800 };
    this.dia = { t0: agora + (modo === "entrada" ? 250 : 150), dur: modo === "entrada" ? 2600 : 1900 };
    this.relogio = 0;
    this.liga();
  }

  passo(agora) {
    let mexeu = false;
    const tw = this.tween;
    if (tw) {
      const t = Math.min(1, (agora - tw.t0) / tw.dur), k = easeIO(t);
      const lerp = (a, b) => a + (b - a) * k;
      this.cur = {
        o1: tw.alvo.o1.map((v, i) => lerp(tw.de.o1[i], v)),
        o2: tw.alvo.o2.map((v, i) => lerp(tw.de.o2[i], v)),
        melhor: lerp(tw.de.melhor, tw.alvo.melhor),
        segundo: tw.alvo.segundo == null ? null : lerp(tw.de.segundo ?? tw.alvo.segundo, tw.alvo.segundo),
      };
      if (t >= 1) { this.cur = tw.alvo; this.tween = null; }
      mexeu = true;
    }
    if (this.dia) {
      const t = Math.max(0, Math.min(1, (agora - this.dia.t0) / this.dia.dur));
      this.relogio = easeInOutSine(t) * MIN;
      if (t >= 1) { this.dia = null; this.relogio = MIN; }
      mexeu = true;
    }
    return mexeu;
  }

  /** Liga o laço de animação enquanto houver o que animar (curvas, dia sendo revivido ou pontos piscando). */
  liga() {
    if (this.rodando) return;
    const pisca = () => !reduz() && this.visivel && document.visibilityState === "visible" && this.pts.length;
    if (!this.tween && !this.dia && !pisca()) { this.desenha(); return; }
    this.rodando = true;
    let ultimo = performance.now();
    const laco = (agora) => {
      const dt = Math.min(0.1, (agora - ultimo) / 1000);
      ultimo = agora;
      const curvas = this.passo(agora);
      if (pisca() && !this.dia) this.semeia(dt, agora);
      if (curvas) this.desenha(agora); else this.pontos(agora);
      if (this.tween || this.dia || pisca()) this.raf = requestAnimationFrame(laco);
      else { this.rodando = false; this.desenha(); }
    };
    this.raf = requestAnimationFrame(laco);
  }

  /** Eleitores que piscam ao acaso: o dia continua vivo depois de revivido. */
  semeia(dt, agora) {
    const n = this.pts.length;
    if (Math.random() < dt * 7) this.piscas.push({ p: this.pts[Math.floor(Math.random() * n)], t0: agora });
    this.piscas = this.piscas.filter((p) => agora - p.t0 < 1100).slice(-30);
  }

  vai(i, avisa = true) {
    const antes = this.i;
    this.i = i;
    this.desenhaMira();
    if (!this.rodando) this.pontos();
    if (i !== antes) {
      this.aoMover?.(i, this.cur);
      const m = Math.round(this.cur.melhor);
      const dentro = (k) => k != null && k >= m && k < m + 4;
      if (avisa && dentro(i) && !dentro(antes)) this.aoEntrarMelhor?.();
    }
  }

  /** Passeio automático da régua até a faixa i (mostra que dá para arrastar). Para no primeiro toque. */
  passeia(i, atraso = 0) {
    if (this.mexeu || reduz()) { this.vai(i, false); return; }
    const t0 = performance.now() + atraso, dur = 1600;
    const passo = (agora) => {
      const t = Math.max(0, Math.min(1, (agora - t0) / dur));
      if (agora >= t0) this.vai(Math.round(i * easeIO(t)), false);
      if (t < 1 && !this.mexeu) this.passeio = requestAnimationFrame(passo);
    };
    this.passeio = requestAnimationFrame(passo);
  }

  series({ r1 = true, r2 = true }) {
    this.mostra = { r1, r2 };
    this.alvo.classList.toggle("esconde-1", !r1);
    this.alvo.classList.toggle("esconde-2", !r2);
    this.desenha();
  }

  geometria() {
    const a = this.alvo, W = Math.max(300, a.clientWidth), H = a.clientHeight || 360;
    if (this.W === W && this.H === H && this.h0Desenhado === this.h0) return;
    this.W = W; this.H = H; this.h0Desenhado = this.h0;
    const estreito = W < 560;
    const m = (this.m = { t: 40, r: 6, b: 32, l: estreito ? 30 : 38 });
    this.x = (i) => m.l + ((i + 0.5) / N) * (W - m.l - m.r);
    this.xb = (i) => m.l + (i / N) * (W - m.l - m.r);
    this.xm = (min) => m.l + (min / MIN) * (W - m.l - m.r);
    this.y = (v) => m.t + (1 - v / 100) * (H - m.t - m.b);
    const dpr = (this.dpr = Math.min(2, devicePixelRatio || 1));
    this.cv.width = W * dpr; this.cv.height = H * dpr;
    this.cv.style.width = `${W}px`; this.cv.style.height = `${H}px`;
    // pontos menores e faixa mais larga quando há muitos eleitores por minuto
    const porPx = (this.densidade || 0.4) * MIN / (W - m.l - m.r);
    this.raio = Math.max(1.3, Math.min(2.6, 2.7 - porPx * 0.9));
    this.espalha = Math.max(2.5, Math.min(16, 1.5 + porPx * 6));
    const r = this.raio;
    this.sp = {
      r1: sprite(r, COR.r1, 0, dpr),
      r1Forte: sprite(r * 1.25, COR.r1Forte, 0, dpr),
      verde: sprite(r, COR.verde, r * 1.6, dpr, "38"),
      verdeForte: sprite(r * 1.25, COR.verde, r * 2, dpr, "55"),
      brilho: sprite(r * 1.2, COR.brilho, r * 4, dpr, "88"),
      brilhoCinza: sprite(r * 1.2, "#7d8580", r * 3, dpr, "55"),
    };
    const svg = this.svg, n = this.n;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    n.grade.innerHTML = ""; n.eixo.innerHTML = "";
    for (const v of [0, 50, 100]) {
      el("line", { class: v ? "g-grade" : "g-base", x1: m.l, x2: W - m.r, y1: this.y(v), y2: this.y(v) }, n.grade);
      el("text", { class: "g-eixo", x: m.l - 8, y: this.y(v) + 4, "text-anchor": "end" }, n.eixo).textContent = v ? `${v}%` : "0";
    }
    const passo = estreito ? 8 : 4;
    for (let i = 0; i <= OFICIAIS; i += passo) {
      el("text", { class: "g-eixo", x: this.xb(i), y: H - 8, "text-anchor": i === 0 ? "start" : "middle" }, n.eixo).textContent = hora(i, this.h0);
    }
    const x0 = this.xb(OFICIAIS);
    Object.entries({ x: x0, y: m.t - 6, width: W - m.r - x0, height: H - m.t - m.b + 8 }).forEach(([k, v]) => n.encerrado.setAttribute(k, v));
    n.encRot.setAttribute("x", (x0 + W - m.r) / 2);
    n.encRot.setAttribute("y", m.t - 12);
    n.encRot.textContent = W - m.r - x0 > 50 ? "encerrou" : "";
  }

  desenha(agora = performance.now()) {
    this.geometria();
    const { n, m, H } = this, c = this.cur;
    // áreas bem leves: a curva em si são os eleitores
    const p1 = c.o1.map((v, i) => [this.x(i), this.y(v)]);
    const p2 = c.o2.slice(0, OFICIAIS).map((v, i) => [this.x(i), this.y(v)]);
    const fecha = (p) => `L${p[p.length - 1][0].toFixed(1)},${this.y(0)}L${p[0][0].toFixed(1)},${this.y(0)}Z`;
    n.r1a.setAttribute("d", caminho(p1) + fecha(p1));
    n.r2a.setAttribute("d", caminho(p2) + fecha(p2));
    this.t1 = tangentes(c.o1); this.t2 = tangentes(c.o2.slice(0, OFICIAIS));
    const banda = (r, ini) => {
      if (ini == null) { r.setAttribute("width", 0); return null; }
      const b0 = this.xb(ini), b1 = this.xb(ini + 4);
      Object.entries({ x: b0 + 1, y: m.t - 8, width: Math.max(0, b1 - b0 - 2), height: H - m.t - m.b + 10 }).forEach(([k, v]) => r.setAttribute(k, v));
      return (b0 + b1) / 2;
    };
    const cm = banda(n.melhor, c.melhor), cs = banda(n.segundo, c.segundo);
    this.e.melhor.style.left = `${cm}px`; this.e.melhor.style.top = `${m.t - 8}px`;
    this.e.segundo.style.opacity = cs == null || Math.abs(cs - cm) < 132 ? 0 : 1;
    if (cs != null) { this.e.segundo.style.left = `${cs}px`; this.e.segundo.style.top = `${m.t - 8}px`; }
    let pk = 0;
    for (let i = 0; i < OFICIAIS; i++) if (c.o1[i] > c.o1[pk]) pk = i;
    const px = this.x(pk), topo = this.y(c.o1[pk]) - this.espalha - 9;
    n.pico.setAttribute("cx", px); n.pico.setAttribute("cy", topo);
    n.pico.style.opacity = this.mostra.r1 && c.o1[pk] > 0 ? 1 : 0;
    const longe = Math.abs(px - cm) > 80 && (cs == null || Math.abs(px - cs) > 80 || this.e.segundo.style.opacity === "0");
    this.e.pico.style.left = `${px}px`; this.e.pico.style.top = `${topo + 6}px`;
    this.e.pico.style.opacity = longe && this.mostra.r1 && c.o1[pk] > 0 ? 1 : 0;
    this.pontos(agora);
    this.desenhaMira();
  }

  pontos(agora = performance.now()) {
    const { ctx, sp, dpr } = this, c = this.cur;
    if (!sp || !this.t1) return;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    const poe = (img, x, y, alfa = 1, esc = 1) => {
      if (alfa <= 0.02) return;
      ctx.globalAlpha = Math.min(1, alfa);
      const w = img.width * esc, h = img.height * esc;
      ctx.drawImage(img, x * dpr - w / 2, y * dpr - h / 2, w, h);
    };
    const fimOficial = OFICIAIS * 15, rel = this.relogio, foco = this.i;
    const o2 = c.o2.slice(0, OFICIAIS);
    const lugar = (p, segundo) => {
      const u = p.m / 15 - 0.5;
      const v = segundo ? avalia(o2, this.t2, Math.min(u, OFICIAIS - 1)) : avalia(c.o1, this.t1, u);
      return [this.xm(p.m), this.y(Math.max(0, Math.min(100, v))) + p.j * this.espalha];
    };
    for (const p of this.pts) {
      if (p.m > rel) break;
      const idade = rel - p.m; // minutos desde que o eleitor "chegou" (revivendo o dia)
      const nasce = this.dia ? Math.max(0, 1 - idade / 40) : 0;
      const realce = foco != null && Math.floor(p.m / 15) === foco;
      if (this.mostra.r1) {
        const [x, y] = lugar(p, false);
        poe(realce ? sp.r1Forte : sp.r1, x, y, 0.55 + 0.45 * (1 - nasce) * (realce ? 1 : 0.8));
        if (nasce) poe(sp.brilhoCinza, x, y, nasce * 0.8, 1 + nasce * 0.6);
      }
      if (this.mostra.r2 && p.m < fimOficial) {
        const [x, y] = lugar(p, true);
        poe(realce ? sp.verdeForte : sp.verde, x, y, 1);
        if (nasce) poe(sp.brilho, x, y, nasce, 1 + nasce * 0.8);
      }
    }
    for (const q of this.piscas) {
      const t = (agora - q.t0) / 1100, k = Math.sin(Math.PI * Math.min(1, t));
      if (this.mostra.r2 && q.p.m < fimOficial) { const [x, y] = lugar(q.p, true); poe(sp.brilho, x, y, k, 1 + 0.5 * k); }
      else if (this.mostra.r1) { const [x, y] = lugar(q.p, false); poe(sp.brilhoCinza, x, y, k * 0.8, 1 + 0.4 * k); }
    }
    ctx.globalAlpha = 1;
  }

  desenhaMira() {
    const { n, m } = this;
    if (this.i == null || !m) { n.mira.setAttribute("visibility", "hidden"); this.e.hora.style.opacity = 0; return; }
    const i = this.i, cx = this.x(i), c = this.cur;
    Object.entries({ x1: cx, x2: cx, y1: m.t - 8, y2: this.H - m.b + 2 }).forEach(([k, v]) => n.mira.setAttribute(k, v));
    n.mira.setAttribute("visibility", "visible");
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

// Gráfico do dia na urna, em pontos: cada coluna é uma faixa de FAIXA_MIN minutos e cada ponto vale 1 em cada 20 eleitores.
// Cinza = esperou na fila no 1º turno (medido); verde = deve esperar no 2º (estimativa).
// Os pontos acendem em onda na entrada e piscam no ritmo em que as pessoas votaram naquela faixa.
// Um só gráfico na página: os dados mudam (Brasil → local → seção) e os pontos se rearrumam.
// Régua: arraste, toque ou setas do teclado; avisa quem está ouvindo (aoMover) a cada faixa.
import { hora, OFICIAIS, FAIXA_MIN, JANELA } from "./modelo.js";
import { cor, notas } from "./cores.js";

const NS = "http://www.w3.org/2000/svg";
const N = OFICIAIS + 60 / FAIXA_MIN; // até 1 h depois do encerramento (quem ainda estava na fila)
const LINHAS = 20;      // 20 pontos por coluna: cada um = 5%
const COR = { r1: "#a9c6ee", r1Forte: "#4f86d9", r1Solo: "#1f6feb", r1Brilho: "#5aa2ff", verde: "#0e7a45", aceso: "#12a95a", brilho: "#3fd283", evite: "#d9483b" };
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

function sprite(raio, cor, halo, dpr) {
  const t = Math.ceil((raio + halo) * 2 * dpr), c = document.createElement("canvas");
  c.width = c.height = t;
  const x = c.getContext("2d"), m = t / 2;
  if (halo) {
    const g = x.createRadialGradient(m, m, raio * dpr * 0.6, m, m, m);
    g.addColorStop(0, `${cor}40`); g.addColorStop(1, `${cor}00`);
    x.fillStyle = g; x.fillRect(0, 0, t, t);
  }
  x.fillStyle = cor; x.beginPath(); x.arc(m, m, raio * dpr, 0, Math.PI * 2); x.fill();
  return c;
}

export class Grafico {
  constructor(alvo, { aoMover, aoEntrarMelhor } = {}) {
    this.alvo = alvo;
    this.aoMover = aoMover;
    this.aoEntrarMelhor = aoEntrarMelhor;
    this.h0 = 8;
    this.cur = { o1: ajusta(), o2: ajusta(), v: ajusta(), melhor: 0, pior: null, pior2: null };
    this.i = null;
    this.mexeu = false;
    this.mostra = { r1: true, r2: true };
    this.piscas = [];
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
    this.cv = document.createElement("canvas");
    this.cv.className = "g-pontos";
    a.appendChild(this.cv);
    this.ctx = this.cv.getContext("2d");
    const svg = (this.svg = el("svg", { "aria-hidden": "true" }, a));
    // faixas: gradiente horizontal, transparente nas laterais e forte no centro
    const defs = el("defs", {}, svg);
    for (const [id, cor, forca] of [["grad-melhor", "#0e7a45", 0.2], ["grad-pior", "#d9483b", 0.15]]) {
      const g = el("linearGradient", { id, x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
      el("stop", { offset: 0, "stop-color": cor, "stop-opacity": 0 }, g);
      el("stop", { offset: 0.5, "stop-color": cor, "stop-opacity": forca }, g);
      el("stop", { offset: 1, "stop-color": cor, "stop-opacity": 0 }, g);
    }
    this.n = {
      grade: el("g", {}, svg),
      encerrado: el("rect", { class: "g-encerrado" }, svg),
      encRot: el("text", { class: "g-encerrado-rot", "text-anchor": "middle" }, svg),
      pior: el("rect", { class: "g-pior", rx: 12 }, svg),
      pior2: el("rect", { class: "g-pior", rx: 12 }, svg),
      melhor: el("rect", { class: "g-melhor", rx: 12 }, svg),
      eixo: el("g", {}, svg),
      mira: el("line", { class: "g-mira" }, svg),
    };
    const etq = (cls, txt = "") => { const d = document.createElement("div"); d.className = `etiqueta ${cls}`; d.textContent = txt; a.appendChild(d); return d; };
    this.e = { melhor: etq("etiqueta-melhor", "melhor horário"), pior: etq("etiqueta-pior", "evite"), pior2: etq("etiqueta-pior", "evite"), hora: etq("etiqueta-hora") };

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
    a.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse" && !arrastando) this.volta(); });
    document.addEventListener("pointerdown", (ev) => { if (!a.contains(ev.target)) this.volta(); });
    a.addEventListener("keydown", (ev) => {
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: 1, ArrowDown: -1, PageUp: JANELA, PageDown: -JANELA }[ev.key];
      if (d == null && ev.key !== "Home" && ev.key !== "End") return;
      ev.preventDefault();
      this.usuario();
      const i = this.i ?? 0;
      this.vai(ev.key === "Home" ? 0 : ev.key === "End" ? N - 1 : Math.max(0, Math.min(N - 1, i + d)));
    });
  }

  usuario() { this.mexeu = true; cancelAnimationFrame(this.passeio); }

  /** dados: {h0, o1, o2, v (eleitores por urna em cada faixa), melhor, pior, pior2}; modo: "entrada", "transforma", "direto". */
  define(dados, modo = "transforma") {
    this.h0 = dados.h0 ?? 8;
    const alvo = { o1: ajusta(dados.o1), o2: ajusta(dados.o2), v: ajusta(dados.v), melhor: dados.melhor ?? 0, pior: dados.pior ?? null, pior2: dados.pior2 ?? null };
    this.notas = dados.notas || notas(alvo.o2);
    this.spCol = null; // as cores das colunas mudam com os dados
    this.piscas = [];
    if (reduz() || modo === "direto") { this.cur = alvo; this.tween = null; this.desenha(); this.liga(); return; }
    const de = modo === "entrada" ? { ...alvo, o1: ajusta(), o2: ajusta() } : structuredClone(this.cur);
    this.tween = { de, alvo, t0: performance.now(), dur: modo === "entrada" ? 1900 : 950, modo };
    this.liga();
  }

  passo(agora) {
    const tw = this.tween;
    if (!tw) return false;
    const t = Math.min(1, (agora - tw.t0) / tw.dur);
    const lerp = (a, b, k) => a + (b - a) * k;
    const onda = (i, atraso) => (tw.modo === "entrada" ? easeOut(Math.max(0, Math.min(1, (t - atraso - (i / N) * 0.4) / 0.5))) : easeIO(Math.max(0, Math.min(1, (t - (i / N) * 0.15) / 0.85))));
    this.cur = {
      o1: tw.alvo.o1.map((v, i) => lerp(tw.de.o1[i], v, onda(i, 0))),
      o2: tw.alvo.o2.map((v, i) => lerp(tw.de.o2[i], v, onda(i, 0.1))),
      v: tw.alvo.v,
      melhor: lerp(tw.de.melhor, tw.alvo.melhor, easeIO(t)),
      pior: tw.alvo.pior == null ? null : lerp(tw.de.pior ?? tw.alvo.pior, tw.alvo.pior, easeIO(t)),
      pior2: tw.alvo.pior2 == null ? null : lerp(tw.de.pior2 ?? tw.alvo.pior2, tw.alvo.pior2, easeIO(t)),
    };
    if (t >= 1) { this.cur = tw.alvo; this.tween = null; }
    return true;
  }

  /** Liga o laço de animação enquanto houver o que animar (onda, transformação ou pontos piscando na tela). */
  liga() {
    if (this.rodando) return;
    const pisca = () => !reduz() && this.visivel && document.visibilityState === "visible";
    if (!this.tween && !pisca()) { this.desenha(); return; }
    this.rodando = true;
    let ultimo = performance.now();
    const laco = (agora) => {
      const dt = Math.min(0.1, (agora - ultimo) / 1000);
      ultimo = agora;
      const mexeu = this.passo(agora);
      if (pisca()) this.semeia(dt, agora);
      this.desenha(mexeu, agora);
      if (this.tween || pisca()) this.raf = requestAnimationFrame(laco);
      else { this.rodando = false; this.desenha(); }
    };
    this.raf = requestAnimationFrame(laco);
  }

  /** Novos "votos": pontos que piscam, mais onde mais gente votou naquela faixa. */
  semeia(dt, agora) {
    const v = this.cur.v, tot = v.reduce((a, b) => a + b, 0);
    if (!tot) return;
    let n = dt * 5; // ~5 piscadas por segundo no gráfico todo
    while (n > 0) {
      if (Math.random() < Math.min(1, n)) {
        let r = Math.random() * tot, i = 0;
        while (i < N - 1 && (r -= v[i]) > 0) i++;
        const topo = Math.max(this.cur.o1[i], i < OFICIAIS ? this.cur.o2[i] : 0) / 100 * LINHAS;
        if (topo >= 1) this.piscas.push({ i, j: Math.floor(Math.random() * Math.floor(topo)), t0: agora });
      }
      n -= 1;
    }
    this.piscas = this.piscas.filter((p) => agora - p.t0 < 900).slice(-40);
  }

  /** Régua de volta ao melhor horário (o que importa), deslizando a partir de onde está. */
  volta() {
    const alvo = Math.round(this.cur.melhor) + JANELA / 2;
    if (this.i == null || this.i === alvo) return;
    cancelAnimationFrame(this.passeio);
    if (reduz()) { this.vai(alvo, false); return; }
    const de = this.i, t0 = performance.now(), dur = 650;
    const passo = (agora) => {
      const t = Math.min(1, (agora - t0) / dur);
      this.vai(Math.round(de + (alvo - de) * easeIO(t)), false);
      if (t < 1) this.passeio = requestAnimationFrame(passo);
    };
    this.passeio = requestAnimationFrame(passo);
  }

  vai(i, avisa = true) {
    const antes = this.i;
    this.i = i;
    this.desenhaMira();
    if (!this.rodando) this.pontos();
    if (i !== antes) {
      this.aoMover?.(i, this.cur);
      const m = Math.round(this.cur.melhor);
      const dentro = (k) => k != null && k >= m && k < m + JANELA;
      if (avisa && dentro(i) && !dentro(antes)) this.aoEntrarMelhor?.();
    }
  }

  /** Passeio automático da régua até a faixa i (mostra que dá para arrastar). Para no primeiro toque. */
  passeia(i, atraso = 0) {
    if (this.mexeu || reduz()) { this.vai(i, false); return; }
    const t0 = performance.now() + atraso, dur = 1600;
    const passo = (agora) => {
      const t = Math.max(0, Math.min(1, (agora - t0) / dur));
      this.vai(Math.round(i * easeIO(t)), false);
      if (t < 1 && !this.mexeu) this.passeio = requestAnimationFrame(passo);
    };
    this.passeio = requestAnimationFrame(passo);
  }

  series({ r1 = true, r2 = true }) {
    this.mostra = { r1, r2 };
    this.alvo.classList.toggle("esconde-1", !r1);
    this.desenha();
  }

  geometria() {
    const a = this.alvo, W = Math.max(300, a.clientWidth), H = a.clientHeight || 360;
    if (this.W === W && this.H === H && this.h0Desenhado === this.h0) return;
    this.W = W; this.H = H; this.h0Desenhado = this.h0;
    const estreito = W < 560;
    const m = (this.m = { t: 48, r: 6, b: 32, l: 8 }); // em cima: faixa própria para os rótulos (melhor horário, evite)
    this.x = (i) => m.l + ((i + 0.5) / N) * (W - m.l - m.r);
    this.xb = (i) => m.l + (i / N) * (W - m.l - m.r);
    this.y = (v) => m.t + (1 - v / 100) * (H - m.t - m.b);
    const dpr = (this.dpr = Math.min(2, devicePixelRatio || 1));
    this.cv.width = W * dpr; this.cv.height = H * dpr;
    this.cv.style.width = `${W}px`; this.cv.style.height = `${H}px`;
    const passoX = (W - m.l - m.r) / N, passoY = (H - m.t - m.b) / LINHAS;
    const raio = (this.raio = Math.max(1.6, Math.min(passoX, passoY) * 0.3));
    this.sp = {
      r1: sprite(raio * 0.7, COR.r1, 0, dpr),         // 1º turno: azul claro e menor, para o 2º turno se destacar
      r1Forte: sprite(raio * 0.85, COR.r1Forte, 0, dpr),
      // só o 1º turno ligado: azul brilhante, no tamanho cheio
      r1Solo: sprite(raio, COR.r1Solo, raio * 1.6, dpr, "40"),
      r1SoloForte: sprite(raio * 1.2, COR.r1Solo, raio * 2, dpr, "55"),
      r1Brilho: sprite(raio * 1.1, COR.r1Brilho, raio * 3.2, dpr, "88"),
      verde: sprite(raio, COR.verde, raio * 1.4, dpr),
      verdeForte: sprite(raio * 1.2, COR.verde, raio * 1.8, dpr),
      brilho: sprite(raio * 1.05, COR.brilho, raio * 3, dpr),
    };
    const svg = this.svg, n = this.n;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    n.grade.innerHTML = ""; n.eixo.innerHTML = "";
    el("line", { class: "g-base", x1: m.l, x2: W - m.r, y1: this.y(0) + 2, y2: this.y(0) + 2 }, n.grade); // só a base: a altura é a fila, sem escala
    const passo = (estreito ? 120 : 60) / FAIXA_MIN; // rótulo a cada 1 h (2 h no celular)
    for (let i = 0; i <= OFICIAIS; i += passo) {
      el("text", { class: "g-eixo", x: this.xb(i), y: H - 8, "text-anchor": i === 0 ? "start" : "middle" }, n.eixo).textContent = hora(i, this.h0);
    }
    const x0 = this.xb(OFICIAIS);
    Object.entries({ x: x0, y: m.t - 6, width: W - m.r - x0, height: H - m.t - m.b + 8 }).forEach(([k, v]) => n.encerrado.setAttribute(k, v));
    n.encRot.setAttribute("x", (x0 + W - m.r) / 2);
    n.encRot.setAttribute("y", m.t - 12);
    n.encRot.textContent = W - m.r - x0 > 56 ? "encerrada" : "";
  }

  desenha(_mexeu, agora = performance.now()) {
    this.geometria();
    const { n, m, H } = this, c = this.cur;
    const banda = (r, ini, fim = ini + JANELA) => {
      if (ini == null) { r.setAttribute("width", 0); return null; }
      const b0 = this.xb(ini), b1 = this.xb(fim);
      Object.entries({ x: b0 + 2, y: H - m.b + 5, width: Math.max(0, b1 - b0 - 4), height: 4, rx: 2 }).forEach(([k, v]) => r.setAttribute(k, v));
      return (b0 + b1) / 2;
    };
    // faixas: melhor (verde) e evite (avermelhada; as duas piores horas encostadas viram uma só); rótulos que colidem somem
    const juntas = c.pior != null && c.pior2 != null && Math.abs(c.pior2 - c.pior) <= JANELA + 1;
    const pIni = juntas ? Math.min(c.pior, c.pior2) : c.pior, pFim = juntas ? Math.max(c.pior, c.pior2) + JANELA : c.pior + JANELA;
    const faixas = [["melhor", banda(n.melhor, c.melhor)], ["pior", banda(n.pior, pIni, pFim)], ["pior2", juntas ? banda(n.pior2, null) : banda(n.pior2, c.pior2)]];

    const postos = [];
    for (const [k, x] of faixas) {
      const e = this.e[k];
      const cabe = x != null && postos.every((p) => Math.abs(p - x) > 118);
      e.style.opacity = cabe ? 1 : 0;
      if (x != null) { e.style.left = `${x}px`; e.style.top = `${m.t - 12}px`; }
      if (cabe) postos.push(x);
    }
    this.pontos(agora);
    this.desenhaMira();
  }

  /** Um sprite por coluna do 2º turno, na cor da sua nota: extremos com brilho, meio sem. */
  spritesColunas() {
    if (this.spCol && this.spColRaio === this.raio) return this.spCol;
    const r = this.raio, dpr = this.dpr;
    this.spCol = (this.notas || []).map((t) => {
      const c = cor(t), extremo = Math.abs(t - 0.5) * 2; // 0 no meio, 1 nos extremos
      return {
        n: sprite(r * (1 + 0.12 * extremo), c, r * 2.6 * extremo, dpr, extremo > 0.6 ? "55" : "30"),
        f: sprite(r * (1.25 + 0.1 * extremo), c, r * (1.2 + 2 * extremo), dpr, "55"),
        b: sprite(r * 1.2, c, r * 4, dpr, "88"),
      };
    });
    this.spColRaio = r;
    return this.spCol;
  }

  pontos(agora = performance.now()) {
    const { ctx, sp, dpr, m, H } = this, c = this.cur;
    if (!sp) return;
    const col = this.spritesColunas();
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    const passoY = (H - m.t - m.b) / LINHAS;
    const yRow = (j) => (H - m.b - (j + 0.5) * passoY) * dpr;
    const poe = (img, x, y, alfa = 1, esc = 1) => {
      if (alfa <= 0.01) return;
      ctx.globalAlpha = Math.min(1, alfa);
      const w = img.width * esc, h = img.height * esc;
      ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
    };
    for (let i = 0; i < N; i++) {
      const x = this.x(i) * dpr, foco = i === this.i;
      const v = col[i] ? (foco ? col[i].f : col[i].n) : foco ? sp.verdeForte : sp.verde;
      const k1 = this.mostra.r1 ? (c.o1[i] / 100) * LINHAS : 0;
      const k2 = this.mostra.r2 && i < OFICIAIS ? (c.o2[i] / 100) * LINHAS : 0;
      for (let j = 0; j < LINHAS; j++) {
        const y = yRow(j);
        const a2 = Math.max(0, Math.min(1, k2 - j)), a1 = Math.max(0, Math.min(1, k1 - j));
        const solo = !this.mostra.r2;
        if (a1 > 0 && a2 < 1) poe(solo ? (foco ? sp.r1SoloForte : sp.r1Solo) : foco ? sp.r1Forte : sp.r1, x, y, a1 * (1 - a2));
        if (a2 > 0) poe(v, x, y, a2);
      }
    }
    for (const p of this.piscas) {
      const t = (agora - p.t0) / 900, k = Math.sin(Math.PI * t);
      const verde = this.mostra.r2 && p.i < OFICIAIS && p.j < (c.o2[p.i] / 100) * LINHAS;
      poe(verde ? (col[p.i]?.b || sp.brilho) : !this.mostra.r2 ? sp.r1Brilho : sp.r1Forte, this.x(p.i) * dpr, yRow(p.j), verde || !this.mostra.r2 ? k : k * 0.8, 1 + 0.35 * k);
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

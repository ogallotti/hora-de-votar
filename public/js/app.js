import { analisa, hora, duracao, minutos, OFICIAIS } from "./modelo.js";
import { Grafico, FAIXAS_GRAFICO } from "./grafico.js";
import { resolve, resumo, caminhoDe } from "./dados.js";
import { criaBusca } from "./busca.js";

const $ = (s) => document.querySelector(s);
const SEGUNDO_TURNO = new Date(2026, 9, 25);
const SITE = "horadevotar.com";
const fmt = (n, d = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduz = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const cache = new Map();
function json(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); })
      .catch((e) => { cache.delete(url); throw e; }));
  }
  return cache.get(url);
}

// ------------------------------------------------------------ topo
(function contagem() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((SEGUNDO_TURNO - hoje) / 864e5);
  const el = $("#contagem");
  if (dias > 1) el.innerHTML = `faltam <strong>${dias} dias</strong> · 25/10`;
  else if (dias === 1) el.innerHTML = "2º turno é <strong>amanhã</strong>";
  else if (dias === 0) el.innerHTML = "<strong>Hoje é dia de votar</strong>";
  else el.textContent = "Eleições 2026";
})();

// entrada em sequência
["#cabeca", "#busca", "#palco-grafico"].forEach((s, i) => { $(s).classList.add("entra"); $(s).style.setProperty("--i", i); });

// ------------------------------------------------------------ leitura da régua: espera e tempo na urna
let h0 = 8, analise = null, contagem = null;
const milhoes = (n) => (n >= 1e6 ? `${fmt(n / 1e6)} milhões de` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(Math.round(n)));
function leitura(i) {
  if (!analise) return;
  const a = analise, dentro = i < OFICIAIS;
  $("#l-hora").textContent = hora(i, h0);
  const n = contagem?.[i] ?? 0;
  const quem = n ? ` · ${milhoes(n)} ${n === 1 ? "eleitor votou" : "eleitores votaram"}` : "";
  $("#l-faixa").textContent = (dentro ? `às ${hora(i + 1, h0)}` : "após o encerramento") + quem;
  $("#w1").textContent = minutos(a.w1[i] || 0);
  $("#w2").textContent = dentro ? minutos(a.w2[i] || 0) : "urna fechada";
  $("#u1").textContent = duracao(a.t1);
  $("#u2").textContent = duracao(a.t2 ?? (a.t1 ? a.t1 * 0.45 : null));
}

const grafico = new Grafico($("#grafico"), {
  aoMover: (i) => leitura(i),
  aoEntrarMelhor: () => { try { navigator.vibrate?.(8); } catch { /* sem vibração */ } },
});
$(".legenda").addEventListener("click", (e) => {
  const b = e.target.closest(".leg");
  if (!b) return;
  const outro = $(`.leg[data-serie="${b.dataset.serie === "1" ? 2 : 1}"]`);
  const liga = b.getAttribute("aria-pressed") !== "true";
  if (!liga && outro.getAttribute("aria-pressed") !== "true") return; // sempre sobra uma
  b.setAttribute("aria-pressed", String(liga));
  grafico.series({ r1: $('.leg[data-serie="1"]').getAttribute("aria-pressed") === "true", r2: $('.leg[data-serie="2"]').getAttribute("aria-pressed") === "true" });
});

// ------------------------------------------------------------ Brasil (capa)
let br = null, primeira = true;
async function mostraBrasil(modo) {
  br ??= await json("/data/br.json");
  const a = (analise = analisa(br, 8, br.perfil));
  h0 = 8;
  contagem = br.v;
  const total = br.v.reduce((x, y) => x + y, 0);
  const escala = Math.max(1, Math.round(total / 1400 / 10000) * 10000); // ~1.400 pontos, valor redondo
  grafico.define({ h0, o1: a.o1, o2: a.o2, v: br.v, escala, melhor: a.r2.melhor, segundo: a.r2.segundo }, modo);
  $("#arraste").textContent = `Cada ponto representa cerca de ${milhoes(escala).replace(/ de$/, "")} eleitores, no horário em que votaram. Arraste pelo gráfico para ver cada horário.`;
  $("#rotulo-grafico").textContent = `Brasil · ${br.ns.toLocaleString("pt-BR")} urnas no horário de Brasília`;
  return a;
}
function capa(modo = "transforma") {
  document.body.classList.remove("resultado");
  document.title = "Hora de votar · a melhor hora para votar no 2º turno";
  $("#onde").hidden = true;
  $("#titulo").innerHTML = 'Qual a melhor hora para votar no <span class="nw">2º turno?</span>';
  $("#sub").hidden = true;
  $("#dica-busca").hidden = false;
  $("#secoes").hidden = true;
  $("#extras").hidden = true;
  mostraBrasil(modo).then((a) => grafico.passeia(a.r2.melhor + 2, modo === "entrada" ? 1500 : 300)).catch(() => {});
}

// ------------------------------------------------------------ seção / local
const RECENTES = "recentes";
function recentes() { try { return JSON.parse(localStorage.getItem(RECENTES) || "[]"); } catch { return []; } }
function guardaRecente(ctx) {
  try {
    const it = ctx.secao
      ? { tipo: "s", cd: ctx.mun.cd, z: ctx.z, s: ctx.secao, t: `Zona ${ctx.z}, seção ${ctx.secao}`, d: `${ctx.local?.n || ""} · ${ctx.mun.nome}, ${ctx.mun.uf}` }
      : { tipo: "l", cd: ctx.mun.cd, lid: ctx.local.id, t: ctx.local.n, d: `${ctx.mun.nome}, ${ctx.mun.uf}` };
    const chave = (r) => `${r.tipo}${r.cd}${r.z ?? ""}${r.s ?? ""}${r.lid ?? ""}`;
    localStorage.setItem(RECENTES, JSON.stringify([it, ...recentes().filter((r) => chave(r) !== chave(it))].slice(0, 4)));
  } catch { /* sem armazenamento */ }
}

let atual = null;
async function abre(rota, { gesto = false, empurra = true } = {}) {
  if (gesto) { const f = $("#fim"); f.classList.remove("mostra"); void f.offsetWidth; f.classList.add("mostra"); }
  let ctx;
  try { ctx = await resolve(json, rota); } catch {
    $("#sub").innerHTML = "Não encontramos essa seção. Confira a zona e a seção no título de eleitor ou no app e-Título.";
    return;
  }
  const r = resumo(ctx);
  atual = { ctx, r };
  document.body.classList.add("resultado");
  const caminho = caminhoDe(ctx);
  if (empurra && location.pathname !== caminho) history.pushState({ rota }, "", caminho);
  document.title = `${r.titulo} · Hora de votar`;
  guardaRecente(ctx);
  busca?.defineCidade(municipios.find((m) => m.cd === ctx.mun.cd) || null);
  $("#q").value = "";

  const { a } = r;
  h0 = a.h0;
  analise = a;
  const onde = $("#onde");
  onde.hidden = false;
  onde.innerHTML = r.lugar.map((t, i) => (i === 0 && ctx.local ? `<b>${esc(t)}</b>` : esc(t))).join('<span class="sep">/</span>');
  $("#titulo").innerHTML = `Vá entre <em>${r.ini} e ${r.fim}</em>`;
  const quem = ctx.secao ? "da sua seção" : "desse local";
  let sub = r.seg ? `Também tranquilo: <span class="tb">${r.seg[0]} às ${r.seg[1]}</span>. ` : "";
  sub += a.filaODia
    ? `No 1º turno, ${quem} teve fila quase o dia todo: <strong>${r.dez} em cada 10</strong> esperaram.`
    : `No 1º turno, <strong>${r.dez} em cada 10</strong> eleitores ${quem} pegaram fila.`;
  if (a.fator) sub += ` No 2º, com ${r.dois ? "dois votos" : "um voto só"}, a fila deve andar <strong>${fmt(a.fator)}× mais rápido</strong>.`;
  if (a.h0 !== 8) sub += ` Horário local: a votação vai das ${a.h0}h às ${a.h0 + 9}h.`;
  if (ctx.nota) sub += `<span class="nota">${esc(ctx.nota)}</span>`;
  $("#sub").innerHTML = sub;
  $("#sub").hidden = false;
  for (const s of ["#onde", "#titulo", "#sub"]) { const e = $(s); e.classList.remove("troca"); void e.offsetWidth; e.classList.add("troca"); }
  $("#dica-busca").hidden = true;

  // seções do local
  const l = ctx.local;
  const sec = $("#secoes");
  if (l && l.s.length > 1) {
    sec.hidden = false;
    $("#chips").innerHTML = l.s.map((s) => `<button type="button" class="chip" data-s="${s}" aria-pressed="${s === ctx.secao}">${s}</button>`).join("") +
      `<button type="button" class="chip chip-todas" data-s="" aria-pressed="${!ctx.secao}">Todas</button>`;
    $("#secoes-rot").textContent = ctx.secao ? "Outras seções deste local" : "Qual a sua seção?";
  } else sec.hidden = true;

  $("#rotulo-grafico").textContent = ctx.secao ? `Zona ${ctx.z}, seção ${ctx.secao} · ${ctx.d.n} eleitores` : `${l.n} · ${ctx.d.ns} seções`;
  contagem = ctx.d.v;
  grafico.define({ h0, o1: a.o1, o2: a.o2, eleitores: ctx.eleitores, v: ctx.d.v, escala: 1, melhor: a.r2.melhor, segundo: a.r2.segundo }, primeira ? "entrada" : "transforma");
  $("#arraste").textContent = `Cada ponto é um eleitor ${ctx.secao ? "desta urna" : "deste local"}, no minuto em que foi votar (${(ctx.eleitores?.length || ctx.d.n || 0).toLocaleString("pt-BR")} no 1º turno). Arraste pelo gráfico para ver cada horário.`;
  grafico.passeia(a.r2.melhor + 2, primeira ? 1600 : 900);
  primeira = false;

  // números
  const media = (w, ini) => w.slice(ini, ini + 4).reduce((x, y) => x + y, 0) / 4;
  const pico1 = Math.max(...a.w1.slice(0, OFICIAIS));
  const nums = [];
  if (a.t1 && a.t2) nums.push(["Tempo de cada eleitor na urna", `<span>${duracao(a.t1)}</span><span class="seta">→</span><span class="bom">${duracao(a.t2)}</span>`]);
  nums.push([`Espera estimada no pico do 1º turno`, `<span>${minutos(pico1)}</span>`]);
  nums.push([`Espera estimada entre ${r.ini} e ${r.fim} no 2º turno`, `<span class="bom">${minutos(media(a.w2, a.r2.melhor))}</span>`]);
  $("#numeros").innerHTML = nums.map(([t, v]) => `<div><dt>${t}</dt><dd>${v}</dd></div>`).join("");
  $("#extras").hidden = false;
  contaNumeros();

  // tabela
  const linhas = [];
  for (let i = 0; i < FAIXAS_GRAFICO; i++) {
    if (i >= OFICIAIS && !a.o1[i] && !ctx.d.v[i]) continue;
    linhas.push(`<tr><td>${hora(i, h0)} às ${hora(i + 1, h0)}</td><td>${Math.round((ctx.d.v[i] ?? 0) / (ctx.d.ns || 1))}</td><td>${a.o1[i] ?? 0}%</td><td>${i < OFICIAIS ? `${a.o2[i] ?? 0}%` : ""}</td></tr>`);
  }
  $("#tabela").innerHTML = `<thead><tr><th>Horário</th><th>Eleitores por urna</th><th>Pegaram fila</th><th>2º turno (estim.)</th></tr></thead><tbody>${linhas.join("")}</tbody>`;

  // compartilhar
  const url = `${location.origin}${caminho}`;
  $("#zap").href = `https://wa.me/?text=${encodeURIComponent(`${r.texto} ${url}`)}`;
  $("#xis").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(r.texto)}&url=${encodeURIComponent(url)}`;
  $("#tg").href = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(r.texto)}`;
  if (gesto) $("#palco-grafico").scrollIntoView({ behavior: reduz() ? "auto" : "smooth", block: "center" });
}

function contaNumeros() {
  for (const e of document.querySelectorAll("[data-conta]")) {
    const alvo = +e.dataset.conta, casas = +e.dataset.casas;
    if (reduz()) continue;
    const t0 = performance.now();
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / 900), v = alvo * (1 - (1 - k) ** 3);
      e.textContent = casas ? fmt(v, casas) : Math.round(v).toLocaleString("pt-BR");
      if (k < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }
}

$("#chips").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b || !atual) return;
  const { ctx } = atual;
  abre(b.dataset.s ? { tipo: "s", cd: ctx.mun.cd, z: ctx.local.z, s: +b.dataset.s } : { tipo: "l", cd: ctx.mun.cd, lid: ctx.local.id }, { gesto: true });
});

// ------------------------------------------------------------ compartilhar
function aviso(t) { const a = $("#aviso"); a.textContent = t; clearTimeout(aviso.t); aviso.t = setTimeout(() => { a.textContent = ""; }, 2600); }
async function copia(url) {
  try { await navigator.clipboard.writeText(url); aviso("Link copiado. É só colar."); } catch { aviso(url); }
}
$("#copiar").addEventListener("click", () => copia(location.href));
$("#compartilhar").addEventListener("click", async () => {
  if (!atual) return;
  const dados = { title: atual.r.titulo, text: atual.r.texto, url: location.href };
  if (navigator.share) { try { await navigator.share(dados); return; } catch (e) { if (e?.name === "AbortError") return; } }
  copia(location.href);
});

// imagem para os stories (1080×1920), no tema do site
$("#baixar").addEventListener("click", async () => {
  if (!atual) return;
  await document.fonts.ready;
  const c = $("#tela"), x = c.getContext("2d"), { a } = atual.r, r = atual.r;
  const W = 1080, H = 1920;
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
  x.textBaseline = "alphabetic";
  const marca = (X, Y, s) => {
    x.font = `650 ${s}px Geist, sans-serif`; x.fillStyle = "#0a0c0b"; x.fillText("hora", X, Y);
    let w = x.measureText("hora").width; x.font = `500 ${s}px Geist, sans-serif`; x.fillStyle = "#9aa29e"; x.fillText("de", X + w, Y);
    w += x.measureText("de").width; x.font = `650 ${s}px Geist, sans-serif`; x.fillStyle = "#0a0c0b"; x.fillText("votar", X + w, Y);
  };
  marca(90, 180, 54);
  x.fillStyle = "#474e4a"; x.font = "500 46px Geist, sans-serif";
  x.fillText("No 2º turno, vou votar entre", 90, 470);
  const faixa = `${r.ini} e ${r.fim}`;
  let tam = 200;
  do { x.font = `700 ${tam}px Geist, sans-serif`; tam -= 6; } while (x.measureText(faixa).width > W - 180 && tam > 80);
  x.fillStyle = "#0e7a45"; x.fillText(faixa, 84, 680);
  x.fillStyle = "#474e4a"; x.font = "500 40px Geist, sans-serif";
  r.lugar.forEach((t, i) => { let s = t; while (x.measureText(s).width > W - 180 && s.length > 4) s = s.slice(0, -2); x.fillText(s === t ? s : `${s.trim()}…`, 90, 790 + i * 56); });
  const gx = 90, gy = 1060, gw = W - 180, gh = 460, N = OFICIAIS, L = 20;
  const px = (i) => gx + ((i + 0.5) / N) * gw, py = (j) => gy + gh - (j + 0.5) * (gh / L);
  const b0 = gx + (a.r2.melhor / N) * gw, b1 = gx + ((a.r2.melhor + 4) / N) * gw;
  x.fillStyle = "rgba(14,122,69,.08)"; x.beginPath(); x.roundRect(b0, gy - 14, b1 - b0, gh + 22, 18); x.fill();
  const rr = Math.min(gw / N, gh / L) * 0.3;
  for (let i = 0; i < N; i++) {
    const k1 = Math.round(a.o1[i] / 5), k2 = Math.round((a.o2[i] || 0) / 5);
    for (let j = 0; j < L; j++) {
      const verde = j < k2, cinza = j < k1;
      if (verde) { x.fillStyle = "rgba(63,210,131,.25)"; x.beginPath(); x.arc(px(i), py(j), rr * 2, 0, 7); x.fill(); }
      x.fillStyle = verde ? "#0e7a45" : cinza ? "#a7aeaa" : "#eceeec";
      x.beginPath(); x.arc(px(i), py(j), verde || cinza ? rr : rr * 0.62, 0, 7); x.fill();
    }
  }
  x.fillStyle = "#6b726e"; x.font = "500 32px Geist, sans-serif";
  for (let i = 0; i <= N; i += 8) { x.textAlign = i ? "center" : "left"; x.fillText(hora(i, a.h0), gx + (i / N) * gw, gy + gh + 54); }
  x.textAlign = "left";
  x.fillStyle = "#a7aeaa"; x.beginPath(); x.arc(110, 1624, 12, 0, 7); x.fill();
  x.fillStyle = "#474e4a"; x.font = "500 32px Geist, sans-serif"; x.fillText(`${r.dez} de 10 pegaram fila no 1º turno`, 146, 1634);
  x.fillStyle = "#0e7a45"; x.beginPath(); x.arc(110, 1676, 12, 0, 7); x.fill();
  x.fillStyle = "#474e4a"; x.fillText(a.fator ? `2º turno: fila ${fmt(a.fator)}× mais rápida` : "2º turno, estimativa", 146, 1688);
  x.fillStyle = "#0a0c0b"; x.font = "600 44px Geist, sans-serif"; x.fillText("Veja o da sua seção em", 90, 1792);
  x.fillStyle = "#0e7a45"; x.font = "700 62px Geist, sans-serif"; x.fillText(SITE, 90, 1862);
  const nome = `hora-de-votar-${atual.ctx.secao ? `${atual.ctx.z}-${atual.ctx.secao}` : "local"}.png`;
  c.toBlob(async (blob) => {
    const arq = new File([blob], nome, { type: "image/png" });
    if (navigator.canShare?.({ files: [arq] })) { try { await navigator.share({ files: [arq], text: `Veja o da sua seção em ${SITE}` }); return; } catch { /* baixa */ } }
    const u = URL.createObjectURL(blob), l = document.createElement("a");
    l.href = u; l.download = nome; l.click(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  }, "image/png");
});

// ------------------------------------------------------------ rotas
function rotaDaUrl() {
  if (window.__ROTA__) return window.__ROTA__;
  const p = location.pathname.split("/").filter(Boolean);
  if (p[0] === "s" && p.length === 4) return { tipo: "s", cd: p[1], z: p[2], s: p[3] };
  if (p[0] === "l" && p.length === 3) return { tipo: "l", cd: p[1], lid: p[2] };
  const h = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean); // links antigos (#/cd/z/s ou #/cd/local)
  if (h.length === 3) return { tipo: "s", cd: h[0], z: h[1], s: h[2] };
  if (h.length === 2) return { tipo: "l", cd: h[0], lid: h[1] };
  return null;
}
window.addEventListener("popstate", () => { window.__ROTA__ = null; const r = rotaDaUrl(); r ? abre(r, { empurra: false }) : capa(); });

// ------------------------------------------------------------ início
let busca = null, municipios = [];
const ufGeo = { uf: null };
fetch("/api/onde").then((r) => (r.ok ? r.json() : {})).then((d) => { ufGeo.uf = d.uf || null; }).catch(() => {});
json("/data/municipios.json").then((ms) => {
  municipios = ms.map(([uf, cd, nome, h, ns, g]) => ({ uf, cd, nome, h0: h, ns, g }));
  busca = criaBusca({
    json, municipios, ufGeo: () => ufGeo.uf,
    input: $("#q"), lista: $("#resultados"), contexto: $("#contexto"), perto: $("#perto"), confirma: $("#confirma"),
    aoEscolher: (rota) => abre(rota, { gesto: true }), recentes,
  });
  if (atual) busca.defineCidade(municipios.find((m) => m.cd === atual.ctx.mun.cd) || null);
});
$("#dica-busca").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-q]");
  if (!b) return;
  const q = $("#q"); q.value = b.dataset.q; q.focus(); q.dispatchEvent(new Event("input"));
});

const inicial = rotaDaUrl();
if (inicial) {
  if (location.hash) history.replaceState(null, "", location.pathname.replace(/\/$/, "") || "/");
  abre(inicial, { empurra: !window.__ROTA__ && !location.pathname.startsWith(`/${inicial.tipo}/`) });
} else capa("entrada");

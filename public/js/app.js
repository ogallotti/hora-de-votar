import { analisa, hora, duracao, minutos, OFICIAIS, JANELA, FAIXA_MIN } from "./modelo.js";
import { Grafico, FAIXAS_GRAFICO } from "./grafico.js";
import { resolve, resumo, caminhoDe } from "./dados.js";
import { criaBusca } from "./busca.js";

const $ = (s) => document.querySelector(s);
const SEGUNDO_TURNO = new Date(2026, 9, 25);
const SITE = "horadevotar.com";
const fmt = (n, d = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduz = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Versão do formato dos dados: mudar sempre que public/data/ mudar de formato (ex.: faixas de 15 → 5 min).
// Vai na URL para o navegador não misturar arquivo antigo em cache com código novo.
const VERSAO_DADOS = "10min-2";
const cache = new Map();
function json(url) {
  if (!cache.has(url)) {
    const com = url.startsWith("/data/") ? `${url}?v=${VERSAO_DADOS}` : url;
    cache.set(url, fetch(com).then((r) => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); })
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
// tempo total arredondado como as pessoas falam: "1 min", "3 min", "mais de 30 min"
const cerca = (s) => (s < 90 ? "cerca de 1 min" : s > 1800 ? "mais de 30 min" : `cerca de ${Math.round(s / 60)} min`);
const milhoes = (n) => (n >= 1e6 ? `${fmt(n / 1e6)} milhões de` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(Math.round(n)));
function leitura(i) {
  if (!analise) return;
  const a = analise, dentro = i < OFICIAIS;
  $("#l-hora").textContent = hora(i, h0);
  const n = contagem?.[i] ?? 0;
  const quem = n ? ` · ${milhoes(n)} ${n === 1 ? "eleitor votou" : "eleitores votaram"}` : "";
  $("#l-faixa").textContent = (dentro ? `às ${hora(i + 1, h0)}` : "após o encerramento") + quem;
  // número grande = tempo da chegada à saída (espera + mesa + urna); abaixo, a espera e quantos na frente
  $("#w1").textContent = cerca(a.total1[i] || 0);
  const e1 = a.w1[i] || 0;
  $("#s1").innerHTML = e1 > 1800 ? "da chegada à saída · fila muito longa" : `da chegada à saída · <b>${minutos(e1)}</b> de espera estimada`;
  $("#w2").textContent = dentro ? cerca(a.total2[i] || 0) : "urna fechada";
  const atendimento = (a.t2 || 0) + (a.me2 || 0);
  const naFrente = dentro && atendimento ? Math.max(1, Math.round((a.seFila2[i] || 0) / atendimento)) : 0;
  $("#e2").textContent = !dentro ? "votação encerrada" : (a.o2[i] || 0) < 15 ? "quase sem fila" : `se pegar fila, ~${naFrente} ${naFrente === 1 ? "pessoa" : "pessoas"} na sua frente`;
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
  const a = (analise = analisa(br, 8, br.perfil, br.cal));
  h0 = 8;
  contagem = br.v;
  const total = br.v.reduce((x, y) => x + y, 0);
  const escala = Math.max(1, Math.round(total / 1400 / 10000) * 10000); // ~1.400 pontos, valor redondo
  grafico.define({ h0, o1: a.o1, o2: a.o2, v: br.v, escala, melhor: a.r2.melhor, pior: a.r2.pior, pior2: a.r2.pior2 }, modo);
  $("#arraste").textContent = "Cada ponto é 1 em cada 20 eleitores. Arraste pelo gráfico para ver cada horário.";
  $("#rotulo-grafico").innerHTML = `${bandeira("BR", "Brasil")}Brasil · ${br.ns.toLocaleString("pt-BR")} urnas no horário de Brasília`;
  return a;
}
function capa(modo = "transforma") {
  document.body.classList.remove("resultado");
  document.title = "Hora de votar · a melhor hora para votar no 2º turno";
  $("#titulo").innerHTML = 'Qual a melhor hora para votar no <span class="nw">2º turno?</span>';
  $("#sub").hidden = true;
  $("#dica-busca").hidden = false;
  $("#extras").hidden = true;
  mostraBrasil(modo).then((a) => grafico.passeia(a.r2.melhor + JANELA / 2, modo === "entrada" ? 1500 : 300)).catch(() => {});
}

// bandeira do Brasil ou do estado (PNG pequeno em /bandeiras, domínio público via Wikimedia Commons)
const bandeira = (uf, nome = `Bandeira de ${uf}`) => `<img class="bandeira" src="/bandeiras/${uf.toLowerCase()}.png" alt="${uf === "BR" ? "Bandeira do Brasil" : nome}" width="21" height="15">`;

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
  $("#titulo").innerHTML = `Vá entre <em>${r.ini} e ${r.fim}</em>`;
  const quem = ctx.secao ? "da sua seção" : "desse local";
  let sub = "";
  const juntas = a.r2.pior2 != null && Math.abs(a.r2.pior2 - a.r2.pior) <= JANELA + 1;
  const ev0 = juntas ? Math.min(a.r2.pior, a.r2.pior2) : a.r2.pior, ev1 = juntas ? Math.max(a.r2.pior, a.r2.pior2) + JANELA : a.r2.pior + JANELA;
  sub += `<span class="linha">Evite ${juntas ? "das " : ""}<span class="tr">${hora(ev0, a.h0)} às ${hora(ev1, a.h0)}</span>.</span>`;
  sub += `<span class="linha">${a.filaODia
    ? `No 1º turno, ${ctx.secao ? "sua seção" : "esse local"} teve fila quase o dia todo: <strong>${r.dez} em cada 10</strong> esperaram.`
    : `No 1º turno, <strong>${r.dez} em cada 10</strong> eleitores ${quem} pegaram fila.`}</span>`;
  if (a.fator) sub += `<span class="linha">No 2º, com ${r.dois ? "dois votos" : "um voto só"}, a fila deve andar <strong>${fmt(a.fator)}× mais rápido</strong>.</span>`;
  if (a.h0 !== 8) sub += `<span class="linha">Horário local: a votação vai das ${a.h0}h às ${a.h0 + 9}h.</span>`;
  if (ctx.nota) sub += `<span class="nota">${esc(ctx.nota)}</span>`;
  $("#sub").innerHTML = sub;
  $("#sub").hidden = false;
  for (const s of ["#titulo", "#sub"]) { const e = $(s); e.classList.remove("troca"); void e.offsetWidth; e.classList.add("troca"); }
  $("#dica-busca").hidden = true;

  // onde: uma vez só, em cima do gráfico (escola, seção, cidade), com a bandeira do estado
  $("#rotulo-grafico").innerHTML = bandeira(ctx.mun.uf) + `<span>${r.lugar.map((t, i) => (i === 0 && ctx.local ? `<b>${esc(t)}</b>` : esc(t))).join(" · ")}</span>`;
  contagem = ctx.d.v;
  grafico.define({ h0, o1: a.o1, o2: a.o2, eleitores: ctx.eleitores, v: ctx.d.v, escala: 1, melhor: a.r2.melhor, pior: a.r2.pior, pior2: a.r2.pior2 }, primeira ? "entrada" : "transforma");
  $("#arraste").textContent = "Cada ponto é 1 em cada 20 eleitores. Arraste pelo gráfico para ver cada horário.";
  grafico.passeia(a.r2.melhor + JANELA / 2, primeira ? 1600 : 900);
  primeira = false;

  // comparação: do momento em que chega até sair da seção, pior hora do 1º turno × melhor hora do 2º
  const media = (w, ini) => w.slice(ini, ini + JANELA).reduce((x, y) => x + y, 0) / JANELA;
  const urna = a.t1 && a.t2 ? `<p class="compara-nota">Cada eleitor levou <b>${duracao(a.t1)}</b> na urna no 1º turno. No 2º, com ${r.dois ? "dois votos" : "um voto só"}, deve levar <b>${duracao(a.t2)}</b>.</p>` : "";
  $("#compara").innerHTML = `<p class="compara-rot">Do momento em que você chega até sair da seção</p>
    <div class="compara-grade">
      <div><span class="c-rot">1º turno, das ${hora(a.r1.pior, a.h0)} às ${hora(a.r1.pior + JANELA, a.h0)} (pior horário)</span><strong>${cerca(media(a.total1, a.r1.pior))}</strong></div>
      <div class="c-2"><span class="c-rot">2º turno, das ${r.ini} às ${r.fim} (melhor horário)</span><strong>${cerca(media(a.total2, a.r2.melhor))}</strong></div>
    </div>${urna}`;
  $("#extras").hidden = false;

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
    x.font = `800 ${s}px Archivo, sans-serif`; x.fillStyle = "#0a0c0b"; x.fillText("HORA DE", X, Y);
    const w = x.measureText("HORA DE ").width, ts = s * 0.9;
    x.font = `800 ${ts}px Archivo, sans-serif`;
    const tw = x.measureText("VOTAR").width + ts * 1.1, th = ts * 1.75, tx = X + w, ty = Y - s * 0.95;
    x.fillStyle = "#24924f"; x.beginPath(); x.roundRect(tx, ty + 5, tw, th, 14); x.fill();
    x.fillStyle = "#2fb36a"; x.beginPath(); x.roundRect(tx, ty, tw, th - 4, 14); x.fill();
    x.fillStyle = "#07120b"; x.fillText("VOTAR", tx + ts * 0.55, ty + th * 0.68);
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
  const px = (i) => gx + ((i + 0.5) / N) * gw, py = (j) => gy + gh - (j + 0.5) * (gh / L), xb = (i) => gx + (i / N) * gw;
  const pintaFaixa = (ini, fim, rgb, forca) => { // gradiente horizontal: transparente nas laterais, forte no centro
    const g = x.createLinearGradient(xb(ini), 0, xb(fim), 0);
    g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.5, `rgba(${rgb},${forca})`); g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g; x.fillRect(xb(ini), gy - 14, xb(fim) - xb(ini), gh + 22);
  };
  const juntas = a.r2.pior2 != null && Math.abs(a.r2.pior2 - a.r2.pior) <= JANELA + 1;
  pintaFaixa(juntas ? Math.min(a.r2.pior, a.r2.pior2) : a.r2.pior, juntas ? Math.max(a.r2.pior, a.r2.pior2) + JANELA : a.r2.pior + JANELA, "217,72,59", 0.15);
  pintaFaixa(a.r2.melhor, a.r2.melhor + JANELA, "14,122,69", 0.2);
  const rr = Math.min(gw / N, gh / L) * 0.3;
  for (let i = 0; i < N; i++) {
    const k1 = Math.round(a.o1[i] / 5), k2 = Math.round((a.o2[i] || 0) / 5);
    for (let j = 0; j < L; j++) {
      const verde = j < k2, cinza = j < k1;
      if (verde) { x.fillStyle = "rgba(63,210,131,.25)"; x.beginPath(); x.arc(px(i), py(j), rr * 2, 0, 7); x.fill(); }
      if (!verde && !cinza) continue; // sem ponto onde ninguém esperou
      x.fillStyle = verde ? "#0e7a45" : "#cdd2cf";
      x.beginPath(); x.arc(px(i), py(j), verde ? rr : rr * 0.7, 0, 7); x.fill();
    }
  }
  x.fillStyle = "#6b726e"; x.font = "500 32px Geist, sans-serif";
  for (let i = 0; i <= N; i += 120 / FAIXA_MIN) { x.textAlign = i ? "center" : "left"; x.fillText(hora(i, a.h0), gx + (i / N) * gw, gy + gh + 54); }
  x.textAlign = "left";
  x.fillStyle = "#cdd2cf"; x.beginPath(); x.arc(110, 1624, 9, 0, 7); x.fill();
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

// ------------------------------------------------------------ pessoas no site agora
// Sinal de presença a cada 30 s enquanto a aba está visível; o código da aba é aleatório e não identifica ninguém.
(function aoVivo() {
  let id;
  try { id = sessionStorage.getItem("aba"); } catch { /* sem armazenamento */ }
  if (!id) { id = (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`); try { sessionStorage.setItem("aba", id); } catch { /* ignora */ } }
  let mostrado = 0, t;
  const mostra = (n) => {
    const el = $("#contador");
    if (n == null) { el.hidden = true; return; }
    el.hidden = false;
    $("#n-rot").textContent = n === 1 ? "pessoa no site agora" : "pessoas no site agora";
    const de = mostrado, t0 = performance.now();
    mostrado = n;
    const passo = (agora) => {
      const k = reduz() ? 1 : Math.min(1, (agora - t0) / 700);
      $("#n-agora").textContent = Math.round(de + (n - de) * (1 - (1 - k) ** 3)).toLocaleString("pt-BR");
      if (k < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  };
  const bate = () => {
    if (document.visibilityState !== "visible") return;
    fetch("/api/ao-vivo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      .then((r) => (r.ok ? r.json() : { agora: null })).then((d) => mostra(d.agora)).catch(() => mostra(null));
  };
  bate();
  t = setInterval(bate, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") bate(); });
})();

// ------------------------------------------------------------ início
let busca = null, municipios = [];
const ufGeo = { uf: null };
fetch("/api/onde").then((r) => (r.ok ? r.json() : {})).then((d) => { ufGeo.uf = d.uf || null; }).catch(() => {});
json("/data/municipios.json").then((ms) => {
  municipios = ms.map(([uf, cd, nome, h, ns, g]) => ({ uf, cd, nome, h0: h, ns, g }));
  busca = criaBusca({
    json, municipios, ufGeo: () => ufGeo.uf,
    input: $("#q"), lista: $("#resultados"), contexto: $("#contexto"), confirma: $("#confirma"),
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

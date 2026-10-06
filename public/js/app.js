import { analisa, hora, duracao, OFICIAIS } from "./modelo.js";
import { desenha } from "./grafico.js";

const $ = (s) => document.querySelector(s);
const SEGUNDO_TURNO = new Date(2026, 9, 25);
const SITE = "horadevotar.com";

const cache = new Map();
async function json(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.json();
    }).catch((e) => { cache.delete(url); throw e; }));
  }
  return cache.get(url);
}

const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const fmt = (n, d = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ------------------------------------------------------------ contagem
(function contagem() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((SEGUNDO_TURNO - hoje) / 864e5);
  const el = $("#contagem");
  if (dias > 1) el.innerHTML = `2º turno em <strong>${dias} dias</strong>, 25/10`;
  else if (dias === 1) el.innerHTML = `2º turno é <strong>amanhã</strong>`;
  else if (dias === 0) el.innerHTML = `<strong>Hoje é dia de votar</strong>, até 17h de Brasília`;
  else el.textContent = "Eleições 2026";
})();

// ------------------------------------------------------------ combobox simples
function combobox(input, lista, buscar, escolher) {
  let itens = [], ativo = -1;
  const pinta = () => {
    lista.innerHTML = itens.length
      ? itens.map((it, i) => `<li role="option" id="${lista.id}-${i}" aria-selected="${i === ativo}"><span class="t">${esc(it.t)}</span>${it.d ? `<span class="d">${esc(it.d)}</span>` : ""}</li>`).join("")
      : `<li class="vazio" role="option" aria-disabled="true">Nada encontrado</li>`;
    lista.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (ativo >= 0) { input.setAttribute("aria-activedescendant", `${lista.id}-${ativo}`); lista.children[ativo]?.scrollIntoView({ block: "nearest" }); }
  };
  const fecha = () => { lista.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); };
  const atualiza = () => {
    const q = input.value;
    itens = buscar(q);
    ativo = itens.length ? 0 : -1;
    if (!q.trim() && !itens.length) return fecha();
    pinta();
  };
  input.addEventListener("input", atualiza);
  input.addEventListener("focus", () => { if (input.value.trim() || buscar("").length) atualiza(); });
  input.addEventListener("keydown", (e) => {
    if (lista.hidden && e.key === "ArrowDown") return atualiza();
    if (e.key === "ArrowDown") { ativo = Math.min(itens.length - 1, ativo + 1); pinta(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { ativo = Math.max(0, ativo - 1); pinta(); e.preventDefault(); }
    else if (e.key === "Enter") { if (!lista.hidden && itens[ativo]) { e.preventDefault(); escolher(itens[ativo]); fecha(); } }
    else if (e.key === "Escape") fecha();
  });
  lista.addEventListener("pointerdown", (e) => {
    const li = e.target.closest("li[id]");
    if (!li) return;
    e.preventDefault();
    escolher(itens[+li.id.split("-").pop()]);
    fecha();
  });
  input.addEventListener("blur", () => setTimeout(fecha, 120));
  return { fecha };
}

// ------------------------------------------------------------ estado da busca
const estado = { mun: null, dados: null, local: null, secao: null, modoNumero: false };

let municipios = [];
const carregaMunicipios = json("/data/municipios.json").then((m) => {
  municipios = m.map(([uf, cd, nome, h0, ns]) => ({ uf, cd, nome, h0, ns, k: norm(nome) }));
  return municipios;
}).catch(() => []);

function buscaCidade(q) {
  const n = norm(q);
  if (!n) return [];
  const out = [];
  for (const m of municipios) {
    let s = -1;
    if (m.k.startsWith(n)) s = 0;
    else if (m.k.includes(" " + n)) s = 1;
    else if (m.k.includes(n)) s = 2;
    if (s >= 0) out.push([s, m]);
  }
  out.sort((a, b) => a[0] - b[0] || b[1].ns - a[1].ns);
  return out.slice(0, 8).map(([, m]) => ({ t: m.nome, d: m.uf, v: m }));
}

function buscaLocal(q) {
  const d = estado.dados;
  if (!d) return [];
  const toks = norm(q).split(" ").filter(Boolean);
  const res = [];
  for (const l of d.locais) {
    l._k ??= norm(`${l.n} ${l.b} ${l.e} ${l.a || ""}`);
    l._n ??= norm(l.n);
    if (toks.every((t) => l._k.includes(t))) res.push(l);
  }
  if (!toks.length && res.length > 12) return []; // cidade grande: pede para digitar
  const t0 = toks[0] || "";
  res.sort((a, b) => (b._n.startsWith(t0) - a._n.startsWith(t0)) || a._n.localeCompare(b._n));
  return res.slice(0, 40).map((l) => ({ t: l.n, d: [l.b, l.e].filter(Boolean).join(", "), v: l }));
}

const inCidade = $("#cidade"), inLocal = $("#local");
combobox(inCidade, $("#lista-cidade"), buscaCidade, (it) => escolheCidade(it.v));
combobox(inLocal, $("#lista-local"), buscaLocal, (it) => escolheLocal(it.v));
inCidade.addEventListener("focus", () => carregaMunicipios, { once: true });

async function escolheCidade(m) {
  estado.mun = m; estado.local = null; estado.secao = null;
  inCidade.value = `${m.nome}, ${m.uf}`;
  erro("");
  try {
    estado.dados = await json(`/data/m/${m.cd}.json`);
  } catch {
    estado.dados = null;
    return erro("Ainda não temos os dados dessa cidade. Os logs estão sendo processados: tente de novo mais tarde.");
  }
  $("#campo-local").hidden = false;
  $("#campo-secao").hidden = true;
  inLocal.value = "";
  atualizaConfirma();
  if (!estado.modoNumero) inLocal.focus();
}

function escolheLocal(l) {
  estado.local = l; estado.secao = null;
  inLocal.value = l.n;
  const chips = $("#chips");
  chips.innerHTML = l.s.map((s) => `<button type="button" class="chip" aria-pressed="false" data-s="${s}">${s}</button>`).join("") +
    (l.s.length > 1 ? `<button type="button" class="chip chip-todas" aria-pressed="true" data-s="">Não sei</button>` : "");
  if (l.s.length === 1) { estado.secao = l.s[0]; chips.firstElementChild.setAttribute("aria-pressed", "true"); }
  $("#campo-secao").hidden = false;
  atualizaConfirma();
}

$("#chips").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  for (const c of $("#chips").children) c.setAttribute("aria-pressed", String(c === b));
  estado.secao = b.dataset.s ? +b.dataset.s : null;
});

$("#sei-secao").addEventListener("click", () => {
  estado.modoNumero = !estado.modoNumero;
  $("#zona-secao").hidden = !estado.modoNumero;
  $("#sei-secao").textContent = estado.modoNumero ? "Prefiro buscar pelo local" : "Sei minha zona e seção";
  $("#local").closest(".entrada").hidden = estado.modoNumero;
  $("#campo-secao").hidden = estado.modoNumero || !estado.local;
  if (estado.modoNumero) $("#zona").focus();
  atualizaConfirma();
});
for (const id of ["#zona", "#secao"]) {
  $(id).addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, ""); atualizaConfirma(); });
}

function atualizaConfirma() {
  const ok = estado.dados && (estado.modoNumero ? $("#zona").value && $("#secao").value : estado.local);
  $("#confirma").disabled = !ok;
}

function erro(msg) {
  const e = $("#erro");
  e.textContent = msg;
  e.hidden = !msg;
}

$("#corrige").addEventListener("click", () => {
  Object.assign(estado, { mun: null, dados: null, local: null, secao: null });
  for (const i of [inCidade, inLocal, $("#zona"), $("#secao")]) i.value = "";
  $("#campo-local").hidden = true;
  $("#campo-secao").hidden = true;
  erro("");
  atualizaConfirma();
  inCidade.focus();
});

$("#busca").addEventListener("submit", (e) => {
  e.preventDefault();
  if ($("#confirma").disabled) return;
  const cd = estado.mun.cd;
  if (estado.modoNumero) location.hash = `#/${cd}/${+$("#zona").value}/${+$("#secao").value}`;
  else if (estado.secao) location.hash = `#/${cd}/${estado.local.z}/${estado.secao}`;
  else location.hash = `#/${cd}/${estado.local.id}`;
});

// ------------------------------------------------------------ rotas
async function rota() {
  const partes = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (partes.length < 2) return mostraCapa();
  const cd = +partes[0];
  let mun;
  try { mun = await json(`/data/m/${cd}.json`); } catch { return mostraCapa("Não encontramos essa cidade."); }
  if (partes.length === 2) {
    const l = mun.locais.find((x) => x.id === partes[1]);
    if (!l || !l.v) return mostraCapa("Não encontramos esse local de votação.");
    return mostraResultado({ mun, local: l, d: l, rotulo: `média das ${l.ns} seções do local` });
  }
  const z = +partes[1], s = +partes[2];
  const local = mun.locais.find((x) => x.z === z && x.s.includes(s));
  let secoes;
  try { secoes = await json(`/data/z/${cd}-${z}.json`); } catch { secoes = {}; }
  let d = secoes[s], nota = "";
  if (d?.p) { nota = `A seção ${s} vota na mesma urna da seção ${d.p}.`; d = secoes[d.p]; }
  if (!d && local?.v) {
    return mostraResultado({ mun, local, d: local, secao: s, z, rotulo: `média das ${local.ns} seções do local`,
      nota: "Não há log publicado para a sua seção (urna substituída ou voto em cédula). Mostramos a média do local." });
  }
  if (!d) return mostraCapa(`Não encontramos a seção ${s} da zona ${z} em ${mun.nome}. Confira os números no título de eleitor ou no app e-Título.`);
  mostraResultado({ mun, local, d, secao: s, z, nota });
}
window.addEventListener("hashchange", rota);

function mostraCapa(msg) {
  $("#resultado").hidden = true;
  $("#capa").hidden = false;
  if (msg) erro(msg);
  document.title = "Hora de votar · a melhor hora para votar no 2º turno";
}

let ultimo = null;
const carregaBr = json("/data/br.json").catch(() => null);
const perfilDe = (uf) => (br?.uf?.[uf]?.perfil) || (mun8(uf) ? br?.perfil : null);
const mun8 = (uf) => (br?.uf?.[uf]?.h0 ?? 8) === 8;
async function mostraResultado(ctx) {
  await carregaBr;
  const { mun, local, d, secao, z } = ctx;
  const a = analisa(d, mun.h0, perfilDe(mun.uf));
  ultimo = { ...ctx, a };
  $("#capa").hidden = true;
  const r = $("#resultado");
  r.hidden = false;
  [...r.children].forEach((c, i) => c.style.setProperty("--i", i));
  window.scrollTo({ top: 0 });

  const ini = hora(a.r2.melhor, a.h0), fim = hora(a.r2.melhor + 4, a.h0);
  const onde = [local ? `<strong>${esc(local.n)}</strong>` : "", secao ? `Zona ${z}, seção ${secao}` : ctx.rotulo, `${esc(mun.nome)}, ${mun.uf}`].filter(Boolean);
  $("#onde").innerHTML = onde.join(" · ");
  $("#manchete").innerHTML = `No 2º turno, vá entre <em>${ini} e ${fim}</em>.`;

  const p1i = hora(a.r1.pior, a.h0), p1f = hora(a.r1.pior + 4, a.h0);
  const m1i = hora(a.r1.melhor, a.h0), m1f = hora(a.r1.melhor + 4, a.h0);
  const fx = a.fator ? `a fila deve andar <strong>${fmt(a.fator)}× mais rápido</strong>, porque são só ${["AC", "AM", "DF", "ES", "RJ", "RN", "TO"].includes(mun.uf) ? "dois votos" : "um voto"}` : "";
  let txt;
  if (a.filaODia) {
    txt = `No 1º turno, ${secao ? "sua seção" : "esse local"} teve fila praticamente o dia todo: mesmo no horário mais calmo, ${Math.round(a.r1.mMelhor)}% dos eleitores esperaram.`;
  } else {
    txt = `No 1º turno, o pior momento foi das ${p1i} às ${p1f}, quando ${Math.round(a.r1.mPior)}% dos eleitores pegaram fila. Das ${m1i} às ${m1f}, foram ${Math.round(a.r1.mMelhor)}%.`;
  }
  if (fx) txt += ` No 2º turno, ${fx}.`;
  if (Math.max(...a.o2.slice(0, OFICIAIS)) < 30) txt += " A estimativa é de pouca fila o dia todo.";
  if (a.h0 !== 8) txt += ` Na sua cidade a votação vai das ${a.h0}h às ${a.h0 + 9}h, no horário local.`;
  if (ctx.nota) txt += ` <span class="nota">${esc(ctx.nota)}</span>`;
  $("#explica").innerHTML = txt;

  const nums = [];
  if (a.t1 && a.t2) nums.push(["Tempo de cada eleitor na urna", `${duracao(a.t1)}<span class="seta">→</span><span class="bom">${duracao(a.t2)}</span>`]);
  if (a.fator) nums.push(["A fila deve andar", `${fmt(a.fator)}× <small>mais rápido</small>`]);
  nums.push(secao ? ["Votaram na sua urna no 1º turno", `${d.n ?? ""} <small>eleitores</small>`] : ["Urnas neste local", `${d.ns}`]);
  $("#numeros").innerHTML = nums.map(([t, v]) => `<div><dt>${t}</dt><dd>${v}</dd></div>`).join("");

  const g = $("#grafico");
  g.setAttribute("aria-label", `Gráfico: no 1º turno, o pico de fila foi das ${p1i} às ${p1f}. No 2º turno, a estimativa indica o melhor horário das ${ini} às ${fim}.`);
  desenha(g, { h0: a.h0, o1: a.o1, o2: a.o2, melhor: a.r2.melhor });

  // tabela
  const linhas = [];
  for (let i = 0; i < Math.max(a.o1.length, OFICIAIS); i++) {
    if (i >= OFICIAIS && !a.o1[i] && !d.v[i]) continue;
    linhas.push(`<tr><td>${hora(i, a.h0)} às ${hora(i + 1, a.h0)}</td><td>${d.v[i] ?? 0}</td><td>${a.o1[i] ?? 0}%</td><td>${i < OFICIAIS ? `${a.o2[i] ?? 0}%` : ""}</td></tr>`);
  }
  $("#tabela").innerHTML = `<thead><tr><th>Horário</th><th>Eleitores</th><th>Pegaram fila</th><th>2º turno (estim.)</th></tr></thead><tbody>${linhas.join("")}</tbody>`;

  const texto = `No 2º turno, o melhor horário para votar ${secao ? "na minha seção" : `no ${local?.n || "meu local"}`} é entre ${ini} e ${fim}. Veja o da sua:`;
  $("#zap").href = `https://wa.me/?text=${encodeURIComponent(`${texto} ${location.href}`)}`;
  document.title = `Vá entre ${ini} e ${fim} · Hora de votar`;
}

let redim;
new ResizeObserver(() => {
  clearTimeout(redim);
  redim = setTimeout(() => {
    if (ultimo && !$("#resultado").hidden) desenha($("#grafico"), { h0: ultimo.a.h0, o1: ultimo.a.o1, o2: ultimo.a.o2, melhor: ultimo.a.r2.melhor, anima: false });
    if (br) desenhaBr(false);
  }, 150);
}).observe(document.body);

$("#voltar").addEventListener("click", () => { history.pushState("", "", location.pathname); mostraCapa(); });

$("#copiar").addEventListener("click", async () => {
  const sp = $("#copiar span");
  try { await navigator.clipboard.writeText(location.href); sp.textContent = "Link copiado"; }
  catch { sp.textContent = "Copie da barra de endereço"; }
  setTimeout(() => { sp.textContent = "Copiar link"; }, 2200);
});

// ------------------------------------------------------------ imagem para os stories (1080×1920)
$("#baixar").addEventListener("click", async () => {
  if (!ultimo) return;
  await document.fonts.ready;
  const c = $("#tela"), x = c.getContext("2d");
  const { a, local, secao, z, mun } = ultimo;
  const W = 1080, H = 1920;
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0f1311"); bg.addColorStop(1, "#14201a");
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.fillStyle = "#edf1ee";
  x.font = "700 56px Bricolage, sans-serif";
  x.fillText("hora", 90, 170);
  let w = x.measureText("hora").width;
  x.fillStyle = "#939c96"; x.font = "500 56px Bricolage, sans-serif"; x.fillText("de", 90 + w, 170);
  w += x.measureText("de").width;
  x.fillStyle = "#edf1ee"; x.font = "700 56px Bricolage, sans-serif"; x.fillText("votar", 90 + w, 170);

  x.fillStyle = "#bac3bd"; x.font = "500 52px Geist, sans-serif";
  x.fillText("No 2º turno, vou votar entre", 90, 470);
  const faixa = `${hora(a.r2.melhor, a.h0)} e ${hora(a.r2.melhor + 4, a.h0)}`;
  let tam = 210;
  do { x.font = `700 ${tam}px Bricolage, sans-serif`; tam -= 6; } while (x.measureText(faixa).width > W - 170 && tam > 80);
  x.fillStyle = "#5ad394";
  x.fillText(faixa, 82, 690);
  x.fillStyle = "#bac3bd"; x.font = "500 44px Geist, sans-serif";
  const lugar = [local?.n, secao ? `Zona ${z}, seção ${secao}` : null, `${mun.nome}, ${mun.uf}`].filter(Boolean);
  lugar.forEach((t, i) => quebra(x, t, 90, 800 + i * 60, W - 180, 1));

  // gráfico
  const gx = 90, gy = 1080, gw = W - 180, gh = 420, N = OFICIAIS;
  const px = (i) => gx + ((i + 0.5) / N) * gw, py = (v) => gy + (1 - v / 100) * gh;
  x.strokeStyle = "#2a332e"; x.lineWidth = 2;
  for (const v of [0, 50, 100]) { x.beginPath(); x.moveTo(gx, py(v)); x.lineTo(gx + gw, py(v)); x.stroke(); }
  const b0 = gx + (a.r2.melhor / N) * gw, b1 = gx + ((a.r2.melhor + 4) / N) * gw;
  x.fillStyle = "rgba(90,211,148,.12)"; roundRect(x, b0, gy - 10, b1 - b0, gh + 10, 14); x.fill();
  x.beginPath(); x.moveTo(px(0), py(0));
  for (let i = 0; i < N; i++) x.lineTo(px(i), py(a.o1[i] || 0));
  x.lineTo(px(N - 1), py(0)); x.closePath();
  x.fillStyle = "rgba(140,152,145,.28)"; x.fill();
  x.beginPath();
  for (let i = 0; i < N; i++) (i ? x.lineTo : x.moveTo).call(x, px(i), py(a.o2[i] || 0));
  x.strokeStyle = "#5ad394"; x.lineWidth = 7; x.lineJoin = "round"; x.lineCap = "round"; x.stroke();
  x.fillStyle = "#939c96"; x.font = "500 34px Geist, sans-serif";
  for (let i = 0; i <= N; i += 8) { x.textAlign = i ? "center" : "left"; x.fillText(hora(i, a.h0), gx + (i / N) * gw, gy + gh + 56); }
  x.textAlign = "left";
  x.fillStyle = "rgba(140,152,145,.6)"; roundRect(x, 90, 1600, 44, 26, 6); x.fill();
  x.fillStyle = "#bac3bd"; x.font = "500 34px Geist, sans-serif"; x.fillText("fila no 1º turno", 152, 1624);
  x.fillStyle = "#5ad394"; roundRect(x, 480, 1609, 44, 8, 4); x.fill();
  x.fillStyle = "#bac3bd"; x.fillText("2º turno, estimativa", 542, 1624);

  x.fillStyle = "#edf1ee"; x.font = "650 46px Geist, sans-serif";
  x.fillText("Veja o da sua seção em", 90, 1770);
  x.fillStyle = "#5ad394"; x.font = "700 64px Bricolage, sans-serif";
  x.fillText(SITE, 90, 1846);

  const nome = `hora-de-votar-${secao ? `${z}-${secao}` : "local"}.png`;
  c.toBlob(async (blob) => {
    const arq = new File([blob], nome, { type: "image/png" });
    if (navigator.canShare?.({ files: [arq] })) {
      try { await navigator.share({ files: [arq], text: `Veja o da sua seção em ${SITE}` }); return; } catch { /* cancelado: baixa */ }
    }
    const u = URL.createObjectURL(blob);
    const l = document.createElement("a");
    l.href = u; l.download = nome; l.click();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }, "image/png");
});

function roundRect(x, X, Y, w, h, r) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}
function quebra(x, t, X, Y, max) {
  let s = t;
  while (x.measureText(s).width > max && s.length > 4) s = s.slice(0, -2);
  x.fillText(s === t ? s : `${s.trim()}…`, X, Y);
}

// ------------------------------------------------------------ vitrine: Brasil
let br = null;
function desenhaBr(anima = true) {
  const a = analisa(br, 8, br.perfil);
  desenha($("#grafico-br"), { h0: 8, o1: a.o1, o2: a.o2, mini: true, anima });
}
carregaBr.then((d) => { if (!d) { $("#vitrine").hidden = true; return; } br = d; desenhaBr(); });

carregaMunicipios.then(rota);

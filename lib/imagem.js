// Imagem de prévia (1200×630) de uma seção ou local, gerada na borda e guardada em cache.
import { ImageResponse, cache } from "@cf-wasm/og/workerd";
import { resolve, resumo } from "../public/js/dados.js";
import { OFICIAIS, FAIXA_MIN, JANELA, hora, analisa } from "../public/js/modelo.js";
import { tangentes, avalia } from "../public/js/curva.js";
import { carregador } from "./pagina.js";

const h = (type, style, ...children) => ({ type, props: { style: { display: "flex", ...style }, children: children.flat() } });
const corta = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

// As duas curvas desenhadas por pontos, como no site: cada ponto é um eleitor (no Brasil, um lote), no minuto em que
// votou, sobre a curva de fila do 1º turno (cinza) e a estimativa do 2º (verde). Faixas: melhor (verde) e evite.
function grafico(a, W, H, eleitores, v) {
  const N = OFICIAIS, MIN = N * FAIXA_MIN;
  const xm = (m) => (m / MIN) * W, y = (val) => 6 + (1 - val / 100) * (H - 12);
  const o1 = a.o1.slice(0, N), o2 = a.o2.slice(0, N), t1 = tangentes(o1), t2 = tangentes(o2);
  let ms = eleitores?.length ? eleitores.filter((m) => m < MIN) : [];
  if (!ms.length && v) { // lotes: ~900 pontos espalhados em cada faixa
    const tot = v.slice(0, N).reduce((x, z) => x + z, 0), esc = tot / 900;
    v.slice(0, N).forEach((n, i) => { const q = Math.round(n / esc); for (let k = 0; k < q; k++) ms.push(i * FAIXA_MIN + ((k + 0.5) / q) * FAIXA_MIN); });
  }
  if (ms.length > 1600) ms = ms.filter((_, k) => k % Math.ceil(ms.length / 1600) === 0);
  const acaso = (k, s) => { const x = Math.sin(k * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
  const esp = Math.max(2.5, Math.min(12, 1.5 + (ms.length / W) * 5)), r = Math.max(1.4, Math.min(2.6, 2.8 - (ms.length / W) * 0.8));
  const banda = (ini, cor, op, borda, fim = ini + JANELA) => (ini == null ? "" : `<rect x="${xm(ini * FAIXA_MIN)}" y="0" width="${xm((fim - ini) * FAIXA_MIN)}" height="${H}" rx="14" fill="${cor}" fill-opacity="${op}" stroke="${cor}" stroke-opacity="${borda}" stroke-width="2"/>`);
  const juntas = a.r2.pior2 != null && Math.abs(a.r2.pior2 - a.r2.pior) <= JANELA + 1;
  const pIni = juntas ? Math.min(a.r2.pior, a.r2.pior2) : a.r2.pior, pFim = juntas ? Math.max(a.r2.pior, a.r2.pior2) + JANELA : a.r2.pior + JANELA;
  let cinza = "", verde = "";
  ms.forEach((m0, k) => {
    const m = m0 + acaso(k, 3), u = m / FAIXA_MIN - 0.5, j = (acaso(k, 7) * 2 - 1) * esp, x = xm(m).toFixed(1);
    cinza += `<circle cx="${x}" cy="${(y(avalia(o1, t1, u)) + j).toFixed(1)}" r="${r.toFixed(1)}"/>`;
    verde += `<circle cx="${x}" cy="${(y(avalia(o2, t2, u)) + j).toFixed(1)}" r="${r.toFixed(1)}"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${banda(pIni, "#d9483b", 0.08, 0.35, pFim)}${banda(a.r2.melhor, "#0e7a45", 0.13, 0.55)}
<line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="#dfe2df" stroke-width="2"/>
<g fill="#c4c9c6">${cinza}</g><g fill="#45c07f">${verde}</g></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

let fontes;
async function carregaFontes(env, origem) {
  const fonte = async (name, w, arq) => ({ name, weight: w, style: "normal", data: await (await env.ASSETS.fetch(new URL(`/fonts/og/${arq}`, origem))).arrayBuffer() });
  fontes ??= Promise.all([fonte("Geist", 400, "geist-400.woff"), fonte("Geist", 600, "geist-600.woff"), fonte("Geist", 700, "geist-700.woff"), fonte("Unbounded", 800, "unbounded-800.woff")]);
  return fontes;
}

export async function imagem(ctx, rota) {
  const { request, env, waitUntil } = ctx;
  const chave = new Request(request.url, { method: "GET" });
  const guardada = await caches.default.match(chave);
  if (guardada) return guardada;
  cache.setExecutionContext({ waitUntil, passThroughOnException: () => {} });
  const origem = new URL(request.url).origin;
  let r;
  try {
    if (rota.tipo === "br") {
      const br = await carregador(env, origem)("/data/br.json");
      const a = analisa(br, 8, br.perfil);
      r = { a, v: br.v, ini: hora(a.r2.melhor, 8), fim: hora(a.r2.melhor + JANELA, 8), dez: Math.round(a.media1 / 10),
        lugar: [`Brasil, 1º turno de 2026`, `${br.ns.toLocaleString("pt-BR")} urnas`], titulo: "Qual a melhor hora para votar no 2º turno?" };
    } else { const ctx = await resolve(carregador(env, origem), rota); r = { ...resumo(ctx), eleitores: ctx.eleitores, v: ctx.d.v }; }
  } catch {
    return new Response("sem dados", { status: 404 });
  }
  const W = 1072, H = 236;
  const manchete = `${r.ini} e ${r.fim}`;
  const porHora = 60 / FAIXA_MIN;
  const horas = [0, 2, 4, 6, 8].map((k) => h("div", { position: "absolute", left: ((k * porHora) / OFICIAIS) * W - 4, fontSize: 22, color: "#6b726e" }, hora(k * porHora, r.a.h0)));
  const arvore = h("div", { flexDirection: "column", width: 1200, height: 630, background: "#ffffff", padding: "52px 64px 40px", fontFamily: "Geist", color: "#0a0c0b" },
    h("div", { justifyContent: "space-between", alignItems: "center" },
      h("div", { fontFamily: "Unbounded", fontSize: 30, fontWeight: 800, letterSpacing: "-0.035em", alignItems: "center" }, "hora de",
        h("span", { marginLeft: 10, background: "#2fb36a", color: "#07120b", fontSize: 23, letterSpacing: "0.04em", padding: "9px 13px 11px",
          borderRadius: 9, borderBottom: "4px solid #24924f" }, "VOTAR")),
      h("div", { fontSize: 22, color: "#4b524e", background: "#f2f4f2", borderRadius: 999, padding: "8px 18px" }, "2º turno · 25 de outubro")),
    h("div", { fontSize: 26, color: "#4b524e", marginTop: 34 }, corta(r.lugar.join(" · "), 78)),
    rota.tipo === "br"
      ? h("div", { fontSize: 58, fontWeight: 700, letterSpacing: "-0.045em", marginTop: 6, lineHeight: 1.05 }, "A melhor hora para votar no 2º turno")
      : h("div", { fontSize: 76, fontWeight: 700, letterSpacing: "-0.045em", marginTop: 6, lineHeight: 1.05 },
        "Vá entre ", h("span", { color: "#0e7a45", marginLeft: 18 }, manchete)),
    h("div", { fontSize: 24, color: "#4b524e", marginTop: 12, alignItems: "center" },
      h("div", { width: 14, height: 14, borderRadius: 999, background: "#c4c9c6", marginRight: 10 }),
      rota.tipo === "br" ? "Fila no 1º turno, pelos logs das urnas" : `${r.dez} em cada 10 pegaram fila no 1º turno`,
      h("div", { width: 14, height: 14, borderRadius: 999, background: "#45c07f", marginLeft: 28, marginRight: 10 }),
      r.a.fator ? `2º turno: fila ${r.a.fator.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}× mais rápida` : "2º turno, estimativa"),
    h("div", { flexDirection: "column", marginTop: "auto" },
      h("img", { width: W, height: H }, []),
      h("div", { position: "relative", height: 28, marginTop: 6 }, horas)));
  arvore.props.children[4].props.children[0].props.src = grafico(r.a, W, H, r.eleitores, r.v);
  const res = await ImageResponse.async(arvore, { width: 1200, height: 630, fonts: await carregaFontes(env, origem) });
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
  waitUntil(caches.default.put(chave, out.clone()));
  return out;
}

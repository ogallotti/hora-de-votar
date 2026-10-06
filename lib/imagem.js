// Imagem de prévia (1200×630) de uma seção ou local, gerada na borda e guardada em cache.
import { ImageResponse, cache } from "@cf-wasm/og/workerd";
import { resolve, resumo } from "../public/js/dados.js";
import { caminho } from "../public/js/curva.js";
import { OFICIAIS, hora, analisa } from "../public/js/modelo.js";
import { carregador } from "./pagina.js";

const h = (type, style, ...children) => ({ type, props: { style: { display: "flex", ...style }, children: children.flat() } });
const corta = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

function grafico(a, W, H) {
  const N = OFICIAIS, x = (i) => ((i + 0.5) / N) * W, y = (v) => 8 + (1 - v / 100) * (H - 16);
  const p1 = a.o1.slice(0, N).map((v, i) => [x(i), y(v)]);
  const p2 = a.o2.slice(0, N).map((v, i) => [x(i), y(v)]);
  const l1 = caminho(p1), l2 = caminho(p2);
  const b0 = (a.r2.melhor / N) * W, b1 = ((a.r2.melhor + 4) / N) * W;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e7a45" stop-opacity=".22"/><stop offset="1" stop-color="#0e7a45" stop-opacity="0"/></linearGradient></defs>
<line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="#dfe2df" stroke-width="2"/>
<line x1="0" x2="${W}" y1="${y(50)}" y2="${y(50)}" stroke="#eef0ee" stroke-width="2"/>
<path d="${l1}L${p1[p1.length - 1][0]},${y(0)}L${p1[0][0]},${y(0)}Z" fill="#eceeec"/>
<path d="${l1}" fill="none" stroke="#a3aaa6" stroke-width="3"/>
<rect x="${b0}" y="0" width="${b1 - b0}" height="${H}" rx="14" fill="#0e7a45" fill-opacity=".1"/>
<path d="${l2}L${p2[p2.length - 1][0]},${y(0)}L${p2[0][0]},${y(0)}Z" fill="url(#g)"/>
<path d="${l2}" fill="none" stroke="#0e7a45" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

let fontes;
async function carregaFontes(env, origem) {
  fontes ??= Promise.all([400, 600, 700].map(async (w) => ({
    name: "Geist", weight: w, style: "normal",
    data: await (await env.ASSETS.fetch(new URL(`/fonts/og/geist-${w}.woff`, origem))).arrayBuffer(),
  })));
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
      r = { a, ini: hora(a.r2.melhor, 8), fim: hora(a.r2.melhor + 4, 8), dez: Math.round(a.media1 / 10),
        lugar: [`Brasil, 1º turno de 2026`, `${br.ns.toLocaleString("pt-BR")} urnas`], titulo: "Qual a melhor hora para votar no 2º turno?" };
    } else r = resumo(await resolve(carregador(env, origem), rota));
  } catch {
    return new Response("sem dados", { status: 404 });
  }
  const W = 1072, H = 236;
  const manchete = `${r.ini} e ${r.fim}`;
  const horas = [0, 8, 16, 24, 32].map((i) => h("div", { position: "absolute", left: (i / OFICIAIS) * W - 4, fontSize: 22, color: "#6b726e" }, hora(i, r.a.h0)));
  const arvore = h("div", { flexDirection: "column", width: 1200, height: 630, background: "#ffffff", padding: "52px 64px 40px", fontFamily: "Geist", color: "#0a0c0b" },
    h("div", { justifyContent: "space-between", alignItems: "center" },
      h("div", { fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em" }, "hora", h("span", { color: "#a3aaa6" }, "de"), "votar"),
      h("div", { fontSize: 22, color: "#4b524e", background: "#f2f4f2", borderRadius: 999, padding: "8px 18px" }, "2º turno · 25 de outubro")),
    h("div", { fontSize: 26, color: "#4b524e", marginTop: 34 }, corta(r.lugar.join(" · "), 78)),
    rota.tipo === "br"
      ? h("div", { fontSize: 58, fontWeight: 700, letterSpacing: "-0.045em", marginTop: 6, lineHeight: 1.05 }, "A melhor hora para votar no 2º turno")
      : h("div", { fontSize: 76, fontWeight: 700, letterSpacing: "-0.045em", marginTop: 6, lineHeight: 1.05 },
        "Vá entre ", h("span", { color: "#0e7a45", marginLeft: 18 }, manchete)),
    h("div", { fontSize: 24, color: "#4b524e", marginTop: 12, alignItems: "center" },
      h("div", { width: 26, height: 14, borderRadius: 4, background: "#e3e6e3", borderTop: "3px solid #a3aaa6", marginRight: 10 }),
      rota.tipo === "br" ? "Fila no 1º turno, pelos logs das urnas" : `${r.dez} em cada 10 pegaram fila no 1º turno`,
      h("div", { width: 26, height: 5, borderRadius: 3, background: "#0e7a45", marginLeft: 28, marginRight: 10 }),
      r.a.fator ? `2º turno: fila ${r.a.fator.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}× mais rápida` : "2º turno, estimativa"),
    h("div", { flexDirection: "column", marginTop: "auto" },
      h("img", { width: W, height: H }, []),
      h("div", { position: "relative", height: 28, marginTop: 6 }, horas)));
  arvore.props.children[4].props.children[0].props.src = grafico(r.a, W, H);
  const res = await ImageResponse.async(arvore, { width: 1200, height: 630, fonts: await carregaFontes(env, origem) });
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
  waitUntil(caches.default.put(chave, out.clone()));
  return out;
}

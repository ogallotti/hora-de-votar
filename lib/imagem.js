// Imagem de prévia (1200×630) de uma seção ou local, gerada na borda e guardada em cache.
import { ImageResponse, cache } from "@cf-wasm/og/workerd";
import { resolve, resumo } from "../public/js/dados.js";
import { OFICIAIS, hora, analisa } from "../public/js/modelo.js";
import { carregador } from "./pagina.js";

const h = (type, style, ...children) => ({ type, props: { style: { display: "flex", ...style }, children: children.flat() } });
const corta = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

// Pontos: cada coluna é uma faixa de 15 min; cada ponto, 1 em cada 20 eleitores (cinza = esperou no 1º turno,
// verde = deve esperar no 2º), como no site.
function grafico(a, W, H) {
  const N = OFICIAIS, L = 20, px = (i) => ((i + 0.5) / N) * W, py = (j) => H - (j + 0.5) * (H / L);
  const r = Math.min(W / N, H / L) * 0.3;
  const b0 = (a.r2.melhor / N) * W, b1 = ((a.r2.melhor + 4) / N) * W;
  let pts = "";
  for (let i = 0; i < N; i++) {
    const k1 = Math.round(a.o1[i] / 5), k2 = Math.round((a.o2[i] || 0) / 5);
    for (let j = 0; j < L; j++) {
      const x = px(i).toFixed(1), y = py(j).toFixed(1);
      if (j < k2) pts += `<circle cx="${x}" cy="${y}" r="${(r * 2).toFixed(1)}" fill="#3fd283" fill-opacity=".18"/><circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="#0e7a45"/>`;
      else if (j < k1) pts += `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="#a7aeaa"/>`;
      else pts += `<circle cx="${x}" cy="${y}" r="${(r * 0.62).toFixed(1)}" fill="#eceeec"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect x="${b0}" y="0" width="${b1 - b0}" height="${H}" rx="14" fill="#0e7a45" fill-opacity=".08"/>${pts}</svg>`;
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
      h("div", { width: 14, height: 14, borderRadius: 999, background: "#a7aeaa", marginRight: 10 }),
      rota.tipo === "br" ? "Fila no 1º turno, pelos logs das urnas" : `${r.dez} em cada 10 pegaram fila no 1º turno`,
      h("div", { width: 14, height: 14, borderRadius: 999, background: "#0e7a45", marginLeft: 28, marginRight: 10 }),
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

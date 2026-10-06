// Página de uma seção ou local: o index.html com título, descrição e imagem próprios (prévia no WhatsApp, X etc.).
// Robôs de prévia não rodam JavaScript nem veem o "#" da URL; por isso cada seção tem um caminho real.
import { resolve, resumo } from "../public/js/dados.js";

export function carregador(env, origem) {
  return async (p) => {
    const r = await env.ASSETS.fetch(new URL(p, origem));
    if (!r.ok) throw new Error(`${r.status} ${p}`);
    return r.json();
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function pagina({ request, env }, rota, imagem) {
  const url = new URL(request.url);
  const base = await env.ASSETS.fetch(new URL("/", url.origin));
  let r;
  try { r = resumo(await resolve(carregador(env, url.origin), rota)); } catch { return base; }
  const canon = `${url.origin}${url.pathname}`;
  const img = `${url.origin}${imagem}`;
  const attr = (v) => ({ element: (e) => e.setAttribute("content", v) });
  const res = new HTMLRewriter()
    .on("title", { element: (e) => e.setInnerContent(`${r.titulo} · Hora de votar`) })
    .on('meta[name="description"]', attr(r.descricao))
    .on('meta[property="og:title"]', attr(r.titulo))
    .on('meta[property="og:description"]', attr(r.descricao))
    .on('meta[property="og:url"]', attr(canon))
    .on('meta[property="og:image"]', attr(img))
    .on('meta[property="og:image:alt"]', attr(`Gráfico da fila em ${r.nome} no 1º turno e estimativa para o 2º`))
    .on('meta[name="twitter:title"]', attr(r.titulo))
    .on('meta[name="twitter:description"]', attr(r.descricao))
    .on('meta[name="twitter:image"]', attr(img))
    .on('link[rel="canonical"]', { element: (e) => e.setAttribute("href", canon) })
    .on("head", { element: (e) => e.append(`<script>window.__ROTA__=${JSON.stringify(rota).replace(/</g, "\\u003c")}</script>`, { html: true }) })
    .transform(base);
  const h = new Headers(res.headers);
  h.set("Content-Type", "text/html; charset=utf-8");
  h.set("Cache-Control", "public, max-age=300, s-maxage=3600");
  return new Response(res.body, { status: 200, headers: h });
}
export { esc };

// Página de uma seção ou local: o index.html com título, descrição e imagem próprios (prévia no WhatsApp, X etc.).
// Robôs de prévia não rodam JavaScript nem veem o "#" da URL; por isso cada seção tem um caminho real.
import { VERSAO_IMG } from "./imagem.js";
import { resolve, resumo } from "../public/js/dados.js";

export function carregador(env, origem) {
  return async (p) => {
    const r = await env.ASSETS.fetch(new URL(p, origem));
    if (!r.ok) throw new Error(`${r.status} ${p}`);
    return r.json();
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// os mesmos de public/_headers (a resposta da função não passa por ele)
export const SEGURANCA = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export async function pagina({ request, env }, rota, imagem) {
  const url = new URL(request.url);
  const base = await env.ASSETS.fetch(new URL("/", url.origin));
  let r;
  try { r = resumo(await resolve(carregador(env, url.origin), rota)); } catch { return base; }
  const canon = `${url.origin}${url.pathname}`;
  const img = `${url.origin}${imagem}?v=${VERSAO_IMG}`;
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
    .transform(base);
  const h = new Headers(res.headers);
  h.set("Content-Type", "text/html; charset=utf-8");
  h.set("Cache-Control", "public, max-age=300, s-maxage=3600, no-transform"); // no-transform: a borda não injeta scripts
  for (const [k, v] of Object.entries(SEGURANCA)) h.set(k, v); // a função responde a página: mesmos cabeçalhos do _headers
  return new Response(res.body, { status: 200, headers: h });
}
export { esc };

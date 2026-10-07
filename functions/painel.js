// /painel: métricas de uso, só com senha. Ver lib/painel.js.
import { SEGURANCA_PAINEL, autorizado, painel } from "../lib/painel.js";

export async function onRequestGet({ request, env }) {
  if (!autorizado(request, env.PAINEL_SENHA)) {
    return new Response("Acesso restrito.", { status: 401, headers: { ...SEGURANCA_PAINEL, "WWW-Authenticate": 'Basic realm="Painel Hora de votar", charset="UTF-8"' } });
  }
  const dias = [1, 7, 30, 90].includes(+new URL(request.url).searchParams.get("d")) ? +new URL(request.url).searchParams.get("d") : 7;
  let nomes = new Map();
  try {
    const ms = await (await env.ASSETS.fetch(new URL("/data/municipios.json", request.url))).json();
    nomes = new Map(ms.map(([uf, cd, nome]) => [String(cd), `${nome}, ${uf}`]));
  } catch { /* sem nomes: mostra o código */ }
  try {
    const html = await painel(env, dias, (cd) => nomes.get(String(cd)) || cd);
    return new Response(html, { headers: { ...SEGURANCA_PAINEL, "Content-Type": "text/html; charset=utf-8" } });
  } catch (e) {
    return new Response(`Não deu para consultar as métricas: ${String(e.message || e).slice(0, 300)}`, { status: 500, headers: { ...SEGURANCA_PAINEL, "Content-Type": "text/plain; charset=utf-8" } });
  }
}

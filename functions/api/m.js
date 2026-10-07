// Recebe o pacote de métricas do navegador (public/js/metricas.js) e grava no Analytics Engine. Sempre responde 204:
// o navegador não espera nada, e um pacote inválido simplesmente não vira ponto.
import { grava, pontos } from "../../lib/metricas.js";

export async function onRequestPost({ request, env }) {
  const tam = +(request.headers.get("content-length") || 0);
  if (tam <= 8192) {
    const texto = await request.text();
    grava(env, pontos(texto, { pais: request.cf?.country, estado: request.cf?.regionCode, ua: request.headers.get("user-agent") || "" }));
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
export const onRequest = () => new Response(null, { status: 405, headers: { Allow: "POST" } });

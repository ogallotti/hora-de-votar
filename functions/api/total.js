// Total de visitas (contador do topo): as visitas registradas nas métricas (Analytics Engine) + as da versão anterior
// do site, e o ritmo real da última hora (visitas por segundo), para o navegador projetar a subida entre atualizações.
// Fica 5 min no cache da borda (regra de cache da zona para /api/total): a função roda poucas vezes por hora.
// O Analytics Engine guarda 90 dias: antes de 5/1/2027, somar as visitas antigas em BASE_ANTERIOR.
const BASE_ANTERIOR = 153000; // visualizações da versão anterior do site (outra implementação), até 6/10/2026
const DATASET = "hora_de_votar";

async function sql(env, q) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_CONTA}/analytics_engine/sql`, {
    method: "POST", headers: { Authorization: `Bearer ${env.CF_METRICAS_TOKEN}` }, body: q,
  });
  if (!r.ok) throw new Error(`SQL ${r.status}`);
  return (await r.json()).data || [];
}

export async function onRequestGet({ env }) {
  const cab = { "Content-Type": "application/json", "Cache-Control": "public, max-age=120, s-maxage=300" };
  try {
    const [[todas], [hora]] = await Promise.all([
      sql(env, `SELECT SUM(_sample_interval) AS v FROM ${DATASET} WHERE blob1 = 'visita'`),
      sql(env, `SELECT SUM(_sample_interval) AS v FROM ${DATASET} WHERE blob1 = 'visita' AND timestamp > NOW() - INTERVAL '1' HOUR`),
    ]);
    const total = BASE_ANTERIOR + Math.round(+todas?.v || 0);
    const ritmo = Math.round(((+hora?.v || 0) / 3600) * 1000) / 1000; // visitas por segundo
    return new Response(JSON.stringify({ total, ritmo, em: Date.now() }), { headers: cab });
  } catch {
    // sem métricas: mostra pelo menos a base, sem projetar subida (e por pouco tempo no cache)
    return new Response(JSON.stringify({ total: BASE_ANTERIOR, ritmo: 0, em: Date.now() }), { headers: { ...cab, "Cache-Control": "public, max-age=30, s-maxage=60" } });
  }
}

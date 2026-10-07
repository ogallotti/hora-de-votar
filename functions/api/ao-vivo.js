// Sinal de presença de uma aba e total de pessoas no site agora (Durable Objects do worker hora-de-votar-ao-vivo).
// Mesma origem: o navegador não fala com serviço externo. Sem binding (ex.: dev sem o worker), responde null.
const PARTES = 32;
const parteDe = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % PARTES; };

export const onRequestPost = async ({ request, env }) => {
  const sem = (status = 200) => new Response(JSON.stringify({ agora: null }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (!env.PRESENCA) return sem();
  let id = "";
  try { ({ id } = await request.json()); } catch { return sem(400); }
  if (!/^[a-z0-9-]{8,40}$/i.test(id || "")) return sem(400);
  const parte = parteDe(id);
  try {
    const agora = await env.PRESENCA.get(env.PRESENCA.idFromName(`p${parte}`)).bate(id, parte);
    return new Response(JSON.stringify({ agora }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return sem();
  }
};

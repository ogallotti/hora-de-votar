// Região aproximada de quem acessa (pelo IP, dado da própria Cloudflare): só para a busca começar no estado certo.
// Nada é guardado. Mesma origem: o navegador não fala com serviço externo.
export const onRequestGet = ({ request }) => {
  const cf = request.cf || {};
  const uf = cf.country === "BR" && /^[A-Z]{2}$/.test(cf.regionCode || "") ? cf.regionCode : null;
  return new Response(JSON.stringify({ uf, cidade: uf ? cf.city || null : null }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
};

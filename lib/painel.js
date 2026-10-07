// Painel de métricas (/painel): HTML montado no servidor, sem JavaScript, com as consultas SQL ao Analytics Engine.
// Acesso por senha (HTTP Basic; segredo PAINEL_SENHA). A leitura usa um token só de leitura (segredo CF_METRICAS_TOKEN)
// e o id da conta (variável CF_CONTA). Nada disso chega ao navegador.
const DATASET = "hora_de_votar";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = new Intl.NumberFormat("pt-BR");
const n = (x) => nf.format(Math.round(+x || 0));

export const SEGURANCA_PAINEL = {
  "Content-Security-Policy": "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

/** Senha conferida em tempo constante (não vaza, pelo tempo de resposta, quantos caracteres acertou). */
export function autorizado(request, senha) {
  if (!senha) return false;
  const h = request.headers.get("authorization") || "";
  if (!h.startsWith("Basic ")) return false;
  let dada = "";
  try { dada = atob(h.slice(6)).split(":").slice(1).join(":"); } catch { return false; }
  const a = new TextEncoder().encode(dada), b = new TextEncoder().encode(senha);
  let dif = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) dif |= (a[i] || 0) ^ (b[i] || 0);
  return dif === 0;
}

async function sql(env, q) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_CONTA}/analytics_engine/sql`, {
    method: "POST", headers: { Authorization: `Bearer ${env.CF_METRICAS_TOKEN}` }, body: q,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t).data || [];
}

const tabela = (titulo, linhas, cols, nota = "") => `<section class="bloco"><h2>${esc(titulo)}</h2>${linhas.length
  ? `<table><thead><tr>${cols.map(([, rot, num]) => `<th${num ? ' class="n"' : ""}>${esc(rot)}</th>`).join("")}</tr></thead><tbody>${linhas.map((l) => `<tr>${cols.map(([k, , num, f]) => `<td${num ? ' class="n"' : ""}>${esc(f ? f(l[k], l) : l[k])}</td>`).join("")}</tr>`).join("")}</tbody></table>`
  : '<p class="vazio">Sem dados no período.</p>'}${nota ? `<p class="nota">${esc(nota)}</p>` : ""}</section>`;

function barras(serie, dias) {
  if (!serie.length) return '<p class="vazio">Sem dados no período.</p>';
  const W = 960, H = 200, max = Math.max(...serie.map((x) => +x.v)) || 1, bw = W / serie.length;
  const rot = (t) => { const d = new Date(`${t.replace(" ", "T")}Z`); return dias > 2 ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : d.toLocaleTimeString("pt-BR", { hour: "2-digit", timeZone: "America/Sao_Paulo" }); };
  const passo = Math.ceil(serie.length / 12);
  return `<svg viewBox="0 0 ${W} ${H + 24}" class="graf" role="img" aria-label="Visitas no tempo">${serie.map((x, i) => {
    const h = (x.v / max) * H;
    return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2"><title>${esc(rot(x.t))}: ${n(x.v)}</title></rect>${i % passo === 0 ? `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H + 18}" text-anchor="middle">${esc(rot(x.t))}</text>` : ""}`;
  }).join("")}</svg>`;
}

export async function painel(env, dias, nomeMun) {
  const per = `timestamp > NOW() - INTERVAL '${dias}' DAY`;
  const conta = "SUM(_sample_interval)";
  const q = (where, extra = "") => sql(env, `SELECT ${extra} FROM ${DATASET} WHERE ${per} AND ${where}`);
  const grupo = (ev, col, rot, lim = 15, onde = "") => sql(env, `SELECT ${col} AS k, ${conta} AS v FROM ${DATASET} WHERE ${per} AND blob1 = '${ev}' ${onde} GROUP BY k ORDER BY v DESC LIMIT ${lim}`).then((r) => r.map((x) => ({ ...x, rot })));
  const unidade = dias > 2 ? "DAY" : "HOUR";
  const [tot, serie, paginas, refs, utms, telas, aps, ufsVis, abreTipo, abreUf, abreMun, abreComo, comp, stories, anuncios, previas, erros, vit, tempo, nerd, grafico] = await Promise.all([
    sql(env, `SELECT blob1 AS ev, ${conta} AS v, COUNT(DISTINCT blob10) AS s FROM ${DATASET} WHERE ${per} GROUP BY ev`)
      .catch(() => sql(env, `SELECT blob1 AS ev, ${conta} AS v FROM ${DATASET} WHERE ${per} GROUP BY ev`)),
    sql(env, `SELECT toStartOf${unidade === "DAY" ? "Day" : "Hour"}(timestamp) AS t, ${conta} AS v FROM ${DATASET} WHERE ${per} AND blob1 = 'visita' GROUP BY t ORDER BY t`),
    grupo("visita", "blob2"), grupo("visita", "blob6", "", 20, "AND blob6 != ''"), grupo("visita", "blob7", "", 15, "AND blob7 != ''"),
    grupo("visita", "blob8"), grupo("visita", "blob5"), grupo("visita", "blob4", "", 30, "AND blob3 = 'BR'"),
    grupo("abre", "blob6"), grupo("abre", "blob7", "", 27), grupo("abre", "blob8", "", 20), grupo("abre", "blob9"),
    grupo("compartilha", "blob6"), q("blob1 = 'stories'", `${conta} AS v`),
    sql(env, `SELECT blob6 AS qual, blob7 AS acao, ${conta} AS v FROM ${DATASET} WHERE ${per} AND blob1 = 'anuncio' GROUP BY qual, acao ORDER BY qual`),
    grupo("previa", "blob6"),
    sql(env, `SELECT blob6 AS msg, blob7 AS onde, blob2 AS pag, ${conta} AS v FROM ${DATASET} WHERE ${per} AND blob1 = 'erro' GROUP BY msg, onde, pag ORDER BY v DESC LIMIT 15`),
    q("blob1 = 'vitals' AND double1 > 0", "quantileExactWeighted(0.75)(double1, _sample_interval) AS lcp, quantileExactWeighted(0.75)(double2, _sample_interval) AS inp, quantileExactWeighted(0.75)(double3, _sample_interval) AS cls, quantileExactWeighted(0.75)(double4, _sample_interval) AS ttfb, " + conta + " AS v")
      .catch(() => q("blob1 = 'vitals' AND double1 > 0", `AVG(double1) AS lcp, AVG(double2) AS inp, AVG(double3) AS cls, AVG(double4) AS ttfb, ${conta} AS v`)),
    q("blob1 = 'saiu'", "quantileExactWeighted(0.5)(double1, _sample_interval) AS med, AVG(double1) AS media").catch(() => q("blob1 = 'saiu'", "AVG(double1) AS media")),
    sql(env, `SELECT blob6 AS acao, blob7 AS valor, ${conta} AS v FROM ${DATASET} WHERE ${per} AND blob1 = 'nerd' GROUP BY acao, valor ORDER BY v DESC LIMIT 20`),
    grupo("grafico", "blob6"),
  ]);
  const ev = Object.fromEntries(tot.map((x) => [x.ev, x]));
  const visitas = +(ev.visita?.v || 0), sessoes = +(ev.visita?.s || 0) || null;
  const comps = comp.reduce((t, x) => t + +x.v, 0), prev = previas.filter((x) => !["robo", "navegador"].includes(x.k)).reduce((t, x) => t + +x.v, 0);
  const pct = (x, de) => (de ? `${((100 * x) / de).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
  const v = vit[0] || {}, tp = tempo[0] || {};
  const card = (rot, valor, sub = "") => `<div class="card"><span>${esc(rot)}</span><strong>${esc(valor)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;
  const ms = (x) => (x ? `${(x / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} s` : "—");
  const anunc = {};
  for (const a of anuncios) (anunc[a.qual] ??= { viu: 0, clique: 0 })[a.acao] = +a.v;
  const linhasAnuncio = Object.entries(anunc).map(([qual, x]) => ({ qual, viu: x.viu, clique: x.clique, ctr: pct(x.clique, x.viu) }));
  const per2 = (rotulo) => [[1, "24 h"], [7, "7 dias"], [30, "30 dias"], [90, "90 dias"]].map(([d, t]) => `<a href="?d=${d}"${d === dias ? ' aria-current="page"' : ""}>${t}</a>`).join("") + rotulo;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Painel · Hora de votar</title><link rel="stylesheet" href="/css/painel.css"></head><body>
<header><p class="marca">HORA DE <span>VOTAR</span> · painel</p><nav>${per2("")}</nav></header>
<main>
<section class="cards">
${card("Visitas", n(visitas), sessoes ? `${n(sessoes)} sessões` : "")}
${card("Seções e locais abertos", n(ev.abre?.v), pct(+(ev.abre?.v || 0), visitas) + " das visitas")}
${card("Compartilhamentos", n(comps), `+ ${n(+(stories[0]?.v || 0))} imagens para stories`)}
${card("Prévias de link geradas", n(prev), "WhatsApp, X, Telegram… (cada uma é um link colado)")}
${card("Tempo na página", tp.med != null ? `${Math.round(tp.med)} s` : tp.media != null ? `${Math.round(tp.media)} s` : "—", tp.med != null ? "mediana" : "média")}
${card("Erros de JavaScript", n(ev.erro?.v), pct(+(ev.erro?.v || 0), visitas) + " das visitas")}
</section>
<section class="bloco"><h2>Visitas ${dias > 2 ? "por dia" : "por hora"} (horário de Brasília)</h2>${barras(serie, dias)}</section>
<div class="grade">
${tabela("Páginas", paginas, [["k", "Página"], ["v", "Visitas", 1, n]])}
${tabela("De onde vieram", refs, [["k", "Site de origem"], ["v", "Visitas", 1, n]], "Sem origem = link direto, app (WhatsApp, Instagram) ou digitado.")}
${tabela("Campanhas (utm_source)", utms, [["k", "utm_source"], ["v", "Visitas", 1, n]])}
${tabela("Aparelho", aps.map((x) => ({ ...x })), [["k", "Sistema"], ["v", "Visitas", 1, n]])}
${tabela("Tela", telas, [["k", "Tamanho"], ["v", "Visitas", 1, n]])}
${tabela("Estados (pela conexão)", ufsVis, [["k", "UF"], ["v", "Visitas", 1, n]])}
${tabela("Aberturas por tipo", abreTipo.map((x) => ({ ...x, k: x.k === "s" ? "seção" : x.k === "l" ? "local" : x.k })), [["k", "Tipo"], ["v", "Vezes", 1, n]])}
${tabela("Como abriram", abreComo, [["k", "Origem"], ["v", "Vezes", 1, n]], "busca = pela barra; link = chegou pelo link da seção; voltar = histórico.")}
${tabela("Estados mais buscados", abreUf, [["k", "UF"], ["v", "Aberturas", 1, n]])}
${tabela("Cidades mais buscadas", abreMun.map((x) => ({ ...x, nome: nomeMun(x.k) })), [["nome", "Cidade"], ["v", "Aberturas", 1, n]])}
${tabela("Compartilhamentos", comp, [["k", "Canal"], ["v", "Vezes", 1, n]])}
${tabela("Prévias de link", previas, [["k", "Quem buscou"], ["v", "Vezes", 1, n]], "Cada prévia gerada pelo WhatsApp, X ou Telegram corresponde a alguém colando o link numa conversa.")}
${tabela("Anúncios", linhasAnuncio, [["qual", "Anúncio"], ["viu", "Viram", 1, n], ["clique", "Cliques", 1, n], ["ctr", "Taxa", 1]])}
${tabela("Interação com o gráfico", grafico, [["k", "Ação"], ["v", "Vezes", 1, n]])}
${tabela("Página dos nerds", nerd, [["acao", "Ação"], ["valor", "Valor"], ["v", "Vezes", 1, n]])}
<section class="bloco"><h2>Desempenho no aparelho (p75)</h2><div class="cards cards-4">
${card("LCP", ms(+v.lcp), "bom: até 2,5 s")}${card("INP", v.inp ? `${Math.round(v.inp)} ms` : "—", "bom: até 200 ms")}${card("CLS", v.cls != null ? (+v.cls).toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : "—", "bom: até 0,1")}${card("TTFB", ms(+v.ttfb), "bom: até 0,8 s")}
</div><p class="nota">${n(v.v)} medições. LCP = maior conteúdo na tela; INP = resposta ao toque; CLS = quanto a página pula.</p></section>
</div>
${tabela("Erros de JavaScript", erros, [["msg", "Mensagem"], ["onde", "Onde"], ["pag", "Página"], ["v", "Vezes", 1, n]])}
<p class="rodape">Dados do Workers Analytics Engine (amostrados quando o volume é alto; os números já vêm corrigidos pela amostragem). Guardados por 90 dias. Sem cookie, sem IP, sem texto digitado.</p>
</main></body></html>`;
}

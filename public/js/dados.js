// Monta o que uma página de seção ou de local precisa, e os textos de compartilhamento.
// Puro (recebe a função que carrega JSON): roda no navegador e nas funções da Cloudflare (prévia de links).
import { analisa, hora, GOV2, JANELA } from "./modelo.js";

const fmt = (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** rota: {tipo: "s", cd, z, s} (seção) ou {tipo: "l", cd, lid} (local). Lança erro se não existir. */
export async function resolve(carrega, rota) {
  const [mun, br] = await Promise.all([carrega(`/data/m/${+rota.cd}.json`), carrega("/data/br.json").catch(() => null)]);
  const doUf = br?.uf?.[mun.uf];
  const perfil = doUf?.perfil || ((doUf?.h0 ?? 8) === 8 ? br?.perfil : null);
  const cal = doUf?.cal || null; // calibração do 2º turno medida em 2022 (comparecimento, tempos, horário de chegada)
  if (rota.tipo === "l") {
    const local = mun.locais.find((x) => x.id === rota.lid);
    if (!local?.ns) throw new Error("local não encontrado");
    const secoes = await carrega(`/data/z/${+rota.cd}-${local.z}.json`).catch(() => ({}));
    return { mun, local, d: somaLocal(local, secoes), perfil, cal };
  }
  const z = +rota.z, s = +rota.s;
  const local = mun.locais.find((x) => x.z === z && x.s.includes(s));
  const secoes = await carrega(`/data/z/${+rota.cd}-${z}.json`).catch(() => ({}));
  let d = secoes[s], nota = "";
  if (d?.p) { nota = `A seção ${s} vota na mesma urna da seção ${d.p}.`; d = secoes[d.p]; }
  if (!d && local?.ns) {
    return { mun, local, d: somaLocal(local, secoes), secao: s, z, perfil, cal,
      nota: "Não há log publicado para a sua seção (urna substituída ou voto em cédula). Mostramos a média do local." };
  }
  if (!d) throw new Error("seção não encontrada");
  return { mun, local, d, secao: s, z, perfil, cal, nota };
}

/** Curva do local: soma das urnas das suas seções (agregadas contam na principal); tempos medianos vêm do local. */
function somaLocal(local, secoes) {
  const urnas = [...new Set(local.s.map((s) => (secoes[s]?.p ?? s)))].map((s) => secoes[s]).filter((d) => d?.v);
  const n = Math.max(0, ...urnas.map((d) => d.v.length));
  const v = Array(n).fill(0), q = Array(n).fill(0);
  for (const d of urnas) d.v.forEach((x, i) => { v[i] += x; q[i] += d.q[i] || 0; });
  return { ...local, v, q, ns: urnas.length || local.ns, n: urnas.reduce((a, d) => a + (d.n || 0), 0) };
}


export const caminhoDe = (ctx) => (ctx.secao ? `/s/${ctx.mun.cd}/${ctx.z}/${ctx.secao}` : `/l/${ctx.mun.cd}/${ctx.local.id}`);

/** Análise + textos prontos (manchete, prévia de link, compartilhamento). */
export function resumo(ctx) {
  const a = analisa(ctx.d, ctx.mun.h0, ctx.perfil, ctx.cal);
  const ini = hora(a.r2.melhor, a.h0), fim = hora(a.r2.melhor + JANELA, a.h0);
  const dois = GOV2.includes(ctx.mun.uf);
  const nome = ctx.local?.n || ctx.mun.nome;
  const lugar = [ctx.local?.n, ctx.secao ? `Zona ${ctx.z}, seção ${ctx.secao}` : `todas as ${ctx.d.ns} seções`, `${ctx.mun.nome}, ${ctx.mun.uf}`].filter(Boolean);
  const dez = Math.round(a.media1 / 10);
  const titulo = `Vá entre ${ini} e ${fim} · ${nome}${ctx.secao ? `, seção ${ctx.secao}` : ""}`;
  const fila = `No 1º turno, ${dez} em cada 10 eleitores ${ctx.secao ? "dessa seção" : "desse local"} pegaram fila.`;
  const rapido = a.fator ? ` No 2º turno, a fila deve andar ${fmt(a.fator)}× mais rápido.` : "";
  const descricao = `${fila}${rapido} Veja o melhor horário da sua seção.`;
  const texto = `No 2º turno, o melhor horário para votar ${ctx.secao ? "na minha seção" : `no ${nome}`} é entre ${ini} e ${fim}. Veja o da sua:`;
  return { a, ini, fim, dois, nome, lugar, dez, titulo, descricao, texto };
}

// Calibra e testa a previsão do 2º turno com a amostra de 2022 (1º turno 02/10, 2º turno 30/10/2022).
// Uso: node scripts/calibra_2022.mjs   (depois de scripts/coleta_2022.py e scripts/calibra_2022.py)
// Saída: tabela no terminal e scripts/calibracao_2022.json (versionado), que o build embute em br.json (uf[UF].cal).
//
// Para não medir em cima dos próprios dados, cada seção cai em A (calibra) ou B (testa) por sorteio fixo.
// Com o 1º turno de 2022, prevê o 2º turno de 2022 e compara com a fila real do 2º turno, nas versões:
//   atual     = o algoritmo de hoje (perfil de chegada das seções sem fila do 1º turno, tempo de urna estimado)
//   +medidas  = mais comparecimento, tempo de urna e tempo de mesa do 2º turno medidos em 2022
//   +chegada  = mais o horário de chegada do 2º turno de 2022 onde a urna ficou no limite
//   +sempre   = horário de chegada do 2º turno de 2022 para toda a procura
//   repete    = sem modelo: "o 2º turno vai ser igual ao 1º"
import { readFileSync, writeFileSync } from "node:fs";
import { analisa, chanceFila, horarios, OFICIAIS, JANELA, FAIXA_MIN } from "../public/js/modelo.js";

const PASTA = new URL("../.cache/2022/", import.meta.url);
const { faixa, secoes, ufs } = JSON.parse(readFileSync(new URL("calibra.json", PASTA)));
if (faixa !== FAIXA_MIN * 60) throw new Error(`calibra.json em faixas de ${faixa / 60} min; o modelo usa ${FAIXA_MIN}: rode calibra_2022.py de novo`);

const grupo = (s) => ((s.m * 7919 + s.z * 104729 + s.s * 1299709) % 2 ? "A" : "B");
const mediana = (xs) => { const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const soma = (xs) => xs.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- parâmetros (só com o grupo A)
// Por UF: comparecimento do 2º turno / 1º e horário de chegada do 2º turno. Nacionais: tempo de urna real / estimado,
// separado por quantos votos o 2º turno teve (1 = só presidente, 2 = presidente e governador), e tempo de mesa.
// Quais UFs têm governador no 2º turno muda de eleição para eleição: em 2026 vale o GOV2 de hoje, não o de 2022.
const A = secoes.filter((s) => grupo(s) === "A");
const kt2 = {};
for (const [k, gov] of [["um", false], ["dois", true]]) {
  kt2[k] = +(mediana(A.filter((s) => ufs[s.uf].gov2 === gov && s.t2est && s.t2real).map((s) => s.t2real / s.t2est)) ?? 1).toFixed(3);
}
const kme = +(mediana(A.filter((s) => s.me1 && s.me2).map((s) => s.me2 / s.me1)) ?? 1).toFixed(3);
const params = {};
for (const uf of Object.keys(ufs)) {
  const a = A.filter((s) => s.uf === uf);
  params[uf] = { comp: +(soma(a.map((s) => s.n2)) / soma(a.map((s) => s.n1))).toFixed(3), perfil2: ufs[uf].perfil2, gov2: ufs[uf].gov2 };
}
const calDe = (uf) => ({ comp: params[uf].comp, perfil2: params[uf].perfil2, kt2: kt2[ufs[uf].gov2 ? "dois" : "um"], kme });

// nível da fila do 2º turno (krho): o que zera o viés da versão "+sempre" no grupo A
const realDe = (s) => { const r = chanceFila(s.v2, s.q2, Math.max(1, Math.round(30 / FAIXA_MIN))).slice(0, OFICIAIS); while (r.length < OFICIAIS) r.push(0); return r; };
const viesCom = (k) => {
  let tot = 0, n = 0;
  for (const s of A.filter((x) => x.v1.length && x.v2.length)) {
    const p = analisa({ v: s.v1, q: s.q1, t1: s.t1, t2: s.t2est, me: s.me1, n: s.n1 }, s.h0, ufs[s.uf].perfil1, { ...calDe(s.uf), sempre: true, krho: k }).o2;
    const r = realDe(s);
    for (let i = 0; i < OFICIAIS; i++) { tot += (p[i] || 0) - r[i]; n++; }
  }
  return tot / n;
};
let lo = 0.8, hi = 3;
for (let it = 0; it < 18; it++) { const mid = (lo + hi) / 2; if (viesCom(mid) < 0) lo = mid; else hi = mid; }
const krho = +((lo + hi) / 2).toFixed(3);
console.log(`nível da fila do 2º turno (krho, grupo A): ${krho}`);

// ---------------------------------------------------------------- teste (grupo B)
const versoes = {
  atual: (s) => analisa(d1(s), s.h0, ufs[s.uf].perfil1),
  "+medidas": (s) => analisa(d1(s), s.h0, ufs[s.uf].perfil1, { ...calDe(s.uf), perfil2: null }),
  "+chegada": (s) => analisa(d1(s), s.h0, ufs[s.uf].perfil1, calDe(s.uf)),
  "+sempre": (s) => analisa(d1(s), s.h0, ufs[s.uf].perfil1, { ...calDe(s.uf), sempre: true }),
  "+nível": (s) => analisa(d1(s), s.h0, ufs[s.uf].perfil1, { ...calDe(s.uf), sempre: true, krho }),
  repete: (s) => ({ o2: analisa(d1(s), s.h0).o1 }),
};
function d1(s) { return { v: s.v1, q: s.q1, t1: s.t1, t2: s.t2est, me: s.me1, n: s.n1 }; }
const real = (s) => chanceFila(s.v2, s.q2, Math.max(1, Math.round(30 / FAIXA_MIN))).slice(0, OFICIAIS);

const res = Object.fromEntries(Object.keys(versoes).map((k) => [k, { erro: [], vies: [], perda: [], acerto: [] }]));
const teste = secoes.filter((s) => grupo(s) === "B" && s.v2.length && s.v1.length);
for (const s of teste) {
  const r = real(s);
  while (r.length < OFICIAIS) r.push(0);
  const ideal = horarios(r);
  const media = (ini) => soma(r.slice(ini, ini + JANELA)) / JANELA;
  for (const [k, f] of Object.entries(versoes)) {
    const p = f(s).o2.slice(0, OFICIAIS);
    while (p.length < OFICIAIS) p.push(0);
    res[k].erro.push(soma(p.map((x, i) => Math.abs(x - r[i]))) / OFICIAIS);
    res[k].vies.push(soma(p.map((x, i) => x - r[i])) / OFICIAIS);
    const prev = horarios(p).melhor;
    res[k].perda.push(media(prev) - media(ideal.melhor)); // quanto pior que o melhor horário real foi o recomendado
    res[k].acerto.push(Math.abs(prev - ideal.melhor) <= JANELA ? 1 : 0); // recomendado a até 1 h do melhor real
  }
}
const m = (xs) => soma(xs) / xs.length;
console.log(`\nTeste com ${teste.length} seções (calibração com ${secoes.length - teste.length}), 2º turno de 2022`);
console.log("versão       erro médio  viés    perda no horário  acerto ±1h");
for (const [k, r] of Object.entries(res)) {
  console.log(`${k.padEnd(12)} ${m(r.erro).toFixed(1).padStart(6)} pp ${m(r.vies).toFixed(1).padStart(6)} pp ${m(r.perda).toFixed(1).padStart(10)} pp ${(100 * m(r.acerto)).toFixed(0).padStart(10)}%`);
}
console.log(`\nTempo de urna no 2º turno, real / estimado pelo 1º: ${kt2.um} (só presidente), ${kt2.dois} (presidente e governador); mesa 2º/1º: ${kme}`);
console.log("UF   comparecimento 2º/1º   governador no 2º (2022)");
for (const [uf, p] of Object.entries(params)) console.log(`${uf}   ${p.comp.toFixed(3)}                  ${p.gov2 ? "sim" : "não"}`);
const resultado = Object.fromEntries(Object.entries(res).map(([k, r]) => [k, { erro: +m(r.erro).toFixed(2), vies: +m(r.vies).toFixed(2), perda: +m(r.perda).toFixed(2), acerto: +m(r.acerto).toFixed(3) }]));
// versionado (o build lê daqui; o cache local pode sumir)
writeFileSync(new URL("calibracao_2022.json", import.meta.url), JSON.stringify({ fonte: "amostra dos dois turnos de 2022", kt2, kme, krho, ufs: params, resultado }));

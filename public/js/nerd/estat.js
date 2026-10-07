// Métricas do 1º turno e agregação por nível. Município e estado: números de scripts/nerd.py (medianas dos eleitores).
// Região, zona, bairro e local: das seções, medianas ponderadas pelos eleitores (tempos e horários), média ponderada
// (fila), soma (eleitores, aptos) e máximo (último voto). Seção: o próprio número.
import { BR, D } from './dados.js';
import { duracao, fInt, fPct, hora, relogio } from './fmt.js';

// Rampas sequenciais de um tom só (claro = pouco, escuro = muito), testadas sobre o fundo escuro do mapa.
export const RAMPA = {
  azul: ['#e3edf9', '#c4d8f1', '#9ebfe7', '#6f9fd8', '#4a7fc0', '#33609a', '#234573'],
  laranja: ['#fde8d7', '#f9c9a2', '#f3a46d', '#e97c42', '#cf5a23', '#a43f15', '#732b0d'],
  verde: ['#e1f3e6', '#bde2c6', '#91cda1', '#62b47a', '#3f955b', '#2b7345', '#1c5232'],
  ouro: ['#fbf5d8', '#f5e9a8', '#eedb72', '#e7c94a', '#c9a92c', '#9a8020', '#6b5915'],
  petroleo: ['#dff2f0', '#b4e0da', '#80c7be', '#4ea99f', '#2f8a80', '#1f6a62', '#134a45'],
};
export const SEM_DADO = '#4a4741';

// quebras fixas (horários) ou quantis do eleitorado no recorte; `frase` = manchete do cartão
export const METRICAS = [
  { k: 't', rot: 'Tempo para votar', curto: 'Tempo', tom: 'azul', fmt: duracao, desc: 'Tempo típico de cada eleitor, do título digitado pela mesa ao voto computado (5 cargos).',
    frase: (v, em) => [`${cap(em)}, votar levou `, b(duracao(v)), '.'], menor: 'mais rápidos', maior: 'mais lentos' },
  { k: 'fila', rot: 'Pegaram fila', curto: 'Fila', tom: 'laranja', fmt: (v) => fPct(v), desc: 'Eleitores chamados logo depois de o anterior sair: a urna não ficou esperando ninguém chegar.',
    frase: (v, em) => [b(`${Math.round(v / 10)} em cada 10`), ` eleitores pegaram fila ${em}.`], menor: 'menos fila', maior: 'mais fila' },
  { k: 'pico', rot: 'Horário de pico', curto: 'Pico', tom: 'ouro', fmt: (v) => hora(v), quebras: [6, 12, 18, 24, 30, 36], rotulos: ['8h', '9h', '10h', '11h', '12h', '13h', '14h ou mais'],
    desc: 'Os 10 minutos em que mais gente começou a votar (horário de Brasília).', frase: (v, em) => [`O pico ${em} foi às `, b(hora(v)), '.'], menor: 'mais cedo', maior: 'mais tarde' },
  { k: 'bio', rot: 'Biometria', curto: 'Biometria', tom: 'azul', fmt: duracao, desc: 'Tempo típico do título digitado até a urna liberar o eleitor (digital ou documento).',
    frase: (v, em) => [`A identificação levou `, b(duracao(v)), ` ${em}.`], menor: 'mais rápidos', maior: 'mais lentos' },
  { k: 'comp', rot: 'Comparecimento', curto: 'Comparecimento', tom: 'verde', fmt: (v) => fPct(v), desc: 'Eleitores que votaram sobre os aptos, nas seções com log.',
    frase: (v, em) => [b(fPct(v)), ` dos eleitores aptos votaram ${em}.`], menor: 'menor comparecimento', maior: 'maior comparecimento' },
  { k: 'ult', rot: 'Último voto', curto: 'Último voto', tom: 'petroleo', fmt: relogio, quebras: [17 * 3600 + 600, 17.5 * 3600, 18 * 3600, 18.5 * 3600, 19 * 3600, 20 * 3600], rotulos: ['até 17h10', '17h30', '18h', '18h30', '19h', '20h', 'depois'],
    desc: 'Hora do último voto computado (horário de Brasília). Depois das 17h, só vota quem já estava na fila.', frase: (v, em) => [`O último voto ${em} saiu às `, b(relogio(v)), '.'], menor: 'acabou mais cedo', maior: 'acabou mais tarde' },
  { k: 'epu', rot: 'Eleitores por urna', curto: 'Por urna', tom: 'petroleo', fmt: (v) => fInt(v), desc: 'Quantos eleitores votaram em cada urna, em média.',
    frase: (v, em) => [b(fInt(v)), ` eleitores por urna ${em}.`], menor: 'urnas mais vazias', maior: 'urnas mais cheias' },
];
export const METRICA = Object.fromEntries(METRICAS.map((m) => [m.k, m]));
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
function b(t) { const e = document.createElement('b'); e.textContent = t; return e; }

// ---------------------------------------------------------------- valores por unidade
const cache = new Map();
/** Estatística de uma unidade: {el, ns, ap, t, bio, fila, pico, ult, comp, epu}. */
export function valorDe(level, id) {
  if (level === 'uf') { const p = [...BR.ufs.values()].find((x) => x.id === id); return p ? completa({ ...p }) : null; }
  if (level === 'br') return completa({ ...BR.st.br });
  if (level === 'brmun' || level === 'municipio') { const x = BR.munStat.get(id); return x ? completa({ ...x }) : null; }
  if (level === 'estado') return completa({ ...(BR.st.ufs[D.meta.uf.toUpperCase()] || {}) });
  if (level === 'secao') {
    const s = D.sec;
    const el = s.el[id];
    if (el == null) return null;
    return completa({ el, ns: 1, ap: s.ap[id], t: s.t[id], bio: s.bio[id], fila: s.fila[id], pico: s.pico[id], ult: s.ult[id], comp: s.ap[id] ? (100 * el) / s.ap[id] : null });
  }
  const tab = porNivel(level);
  const g = D.un[level]?.pos.get(id);
  return g == null ? null : tab[g];
}
function completa(x) {
  if (x.comp == null && x.ap) x.comp = (100 * x.el) / x.ap;
  if (x.epu == null && x.ns) x.epu = x.el / x.ns;
  return x;
}

function medianaPond(pares) {
  if (!pares.length) return null;
  pares.sort((a, c) => a[0] - c[0]);
  const tot = pares.reduce((t, p) => t + p[1], 0);
  let acc = 0;
  for (const [v, w] of pares) { acc += w; if (acc >= tot / 2) return v; }
  return pares[pares.length - 1][0];
}

/** Agrega as seções em cada unidade do nível (uma vez por estado e nível). */
function porNivel(level) {
  const k = `${D.ver}|${level}`;
  if (cache.has(k)) return cache.get(k);
  const u = D.un[level], s = D.sec, n = u.ids.length;
  const acc = Array.from({ length: n }, () => ({ el: 0, ns: 0, ap: 0, elc: 0, t: [], bio: [], pico: [], fq: 0, fw: 0, ult: null }));
  for (let i = 0; i < D.n; i++) {
    const g = u.idx[i], el = s.el[i];
    if (g < 0 || el == null) continue;
    const a = acc[g];
    a.el += el; a.ns++;
    if (s.ap[i]) { a.ap += s.ap[i]; a.elc += el; }
    if (s.t[i] != null) a.t.push([s.t[i], el]);
    if (s.bio[i] != null) a.bio.push([s.bio[i], el]);
    if (s.pico[i] != null) a.pico.push([s.pico[i], el]);
    if (s.fila[i] != null) { a.fq += s.fila[i] * el; a.fw += el; }
    if (s.ult[i] != null) a.ult = a.ult == null ? s.ult[i] : Math.max(a.ult, s.ult[i]);
  }
  const out = acc.map((a) => (a.ns ? {
    el: a.el, ns: a.ns, ap: a.ap, comp: a.ap ? (100 * a.elc) / a.ap : null, epu: a.el / a.ns,
    t: medianaPond(a.t), bio: medianaPond(a.bio), pico: medianaPond(a.pico), fila: a.fw ? a.fq / a.fw : null, ult: a.ult,
  } : null));
  cache.set(k, out);
  return out;
}

// ---------------------------------------------------------------- classes
/** Cortes que dividem os valores em k faixas com o mesmo peso (eleitores). */
export function quantisPonderados(valores, pesos, k) {
  const idx = valores.map((_, i) => i).filter((i) => pesos[i] > 0 && Number.isFinite(valores[i])).sort((a, c) => valores[a] - valores[c]);
  const tot = idx.reduce((t, i) => t + pesos[i], 0);
  const out = [];
  let acc = 0, j = 1;
  for (const i of idx) {
    acc += pesos[i];
    while (j < k && acc >= (tot * j) / k) { if (!out.length || valores[i] > out[out.length - 1]) out.push(valores[i]); j++; }
  }
  return out;
}

/** Classes de uma métrica para um conjunto de unidades: {cortes, cores, rotulos, k(v) = faixa, kr(v) = cor na rampa}. */
export function classes(m, unidades) {
  let cortes = m.quebras, rotulos = m.rotulos;
  if (!cortes) {
    const vs = [], ps = [];
    for (const v of unidades) if (v && v[m.k] != null) { vs.push(v[m.k]); ps.push(v.el || 1); }
    cortes = quantisPonderados(vs, ps, 7);
    const f = m.fmt;
    rotulos = cortes.length ? [`até ${f(cortes[0])}`, ...cortes.slice(1).map((c, i) => `${f(cortes[i])} a ${f(c)}`), `${f(cortes[cortes.length - 1])} ou mais`] : ['—'];
  }
  const rampa = RAMPA[m.tom];
  const n = cortes.length + 1;
  const cores = Array.from({ length: n }, (_, i) => rampa[Math.round((i * (rampa.length - 1)) / Math.max(1, n - 1))]);
  const k = (v) => { if (v == null || !Number.isFinite(v)) return -1; let c = 0; while (c < cortes.length && v >= cortes[c]) c++; return c; };
  // índice na rampa inteira (o mapa usa uma paleta só, e cada nível pode ter menos faixas)
  const kr = (v) => { const c = k(v); return c < 0 ? -1 : Math.round((c * (rampa.length - 1)) / Math.max(1, n - 1)); };
  return { cortes, cores, rotulos, k, kr };
}

/** Rótulo curto do valor no mapa. */
export function rotuloMapa(m, v) {
  if (v == null) return '';
  if (m.k === 'fila' || m.k === 'comp') return `${Math.round(v)}%`;
  return m.fmt(v);
}

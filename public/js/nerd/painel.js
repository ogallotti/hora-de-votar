// Cartões da página /nerd: a área escolhida (esquerda), ranking / recordes / Brasil (direita), legenda, trilha e dica do
// mapa. Estrutura e estilo do quem-vota-em-quem (js/panel.js). Texto dos dados entra sempre por textContent (h()).
import { BR, D, LEVEL_INFO, childrenOf, entityName, getProps, munOf, parentChain, secsOf } from './dados.js';
import { METRICA, METRICAS, RAMPA, SEM_DADO, valorDe } from './estat.js';
import { clear, duracao, fCompact, fInt, fPct, h, hora, horasMin, relogio, svg } from './fmt.js';
import { evento } from '../metricas.js';

const decimos = (x) => `${Math.round(x / 10)} em cada 10`;
const LINHAS = [
  ['t', 'Tempo para votar', (v) => duracao(v)],
  ['bio', 'Biometria', (v) => duracao(v)],
  ['fila', 'Pegaram fila', (v) => decimos(v)],
  ['pico', 'Pico', (v) => hora(v)],
  ['comp', 'Comparecimento', (v) => fPct(v)],
  ['ult', 'Último voto', (v) => relogio(v)],
  ['epu', 'Eleitores por urna', (v) => fInt(v)],
];

// ------------------------------------------------------------------ dica do mapa
export class Tooltip {
  constructor(el) { this.el = el; this.last = ''; }
  _place(point) {
    this.el.hidden = false;
    const r = this.el.getBoundingClientRect(), k = window.__uiK || 1;
    let x = point.x + 16, y = point.y + 16;
    if (x * k + r.width > innerWidth - 10) x = point.x - r.width / k - 16;
    if (y * k + r.height > innerHeight - 10) y = point.y - r.height / k - 16;
    this.el.style.transform = `translate(${Math.max(6, x)}px, ${Math.max(6, y)}px)`;
  }
  linha(k, v, cls) { return h('div', { class: 'tip-r' }, h('span', { class: cls }, k), h('b', null, v)); }
  show(level, id, point, m) {
    const p = getProps(level, id), v = valorDe(level, id);
    if (!p) return this.hide();
    const key = `${level}:${id}:${m.k}:${D.ver}`;
    if (key !== this.last) {
      this.last = key;
      const nome = level === 'uf' || level === 'brmun' ? `${p.n}${level === 'brmun' ? ` · ${p.uf}` : ''}` : entityName(level, p);
      clear(this.el).append(
        h('div', { class: 'tip-h' }, LEVEL_INFO[level]?.label || ''),
        h('div', { class: 'tip-n' }, nome),
        ...(v ? [this.linha(m.rot, v[m.k] != null ? m.fmt(v[m.k]) : '—', 'x'),
          ...LINHAS.filter(([k]) => k !== m.k).map(([k, rot, f]) => this.linha(rot, v[k] != null ? f(v[k]) : '—')),
          this.linha('Eleitores', `${fInt(v.el)}${v.ns > 1 ? ` em ${fInt(v.ns)} urnas` : ''}`)] : [h('div', { class: 'tip-f' }, 'Sem log de urna publicado')]),
        level === 'uf' ? h('div', { class: 'tip-f' }, 'Clique para abrir o estado') : null,
      );
    }
    this._place(point);
  }
  hide() { this.el.hidden = true; this.last = ''; }
}

// ------------------------------------------------------------------ legenda
export function renderLegend(el, { m, cls, escopo }) {
  clear(el);
  el.hidden = false;
  el.append(h('div', { class: 'lg-t' }, h('b', null, m.rot), escopo ? ` · ${escopo}` : ''),
    h('div', { class: 'lg-ramp' }, ...cls.cores.map((c) => h('i', { style: { background: c } }))),
    h('div', { class: 'lg-ends' }, h('span', null, cls.rotulos[0] || ''), h('span', null, cls.rotulos[cls.rotulos.length - 1] || '')));
}

export function renderCrumbs(el, level, id, onGo) {
  clear(el);
  if (!D.meta || level === 'br') return;
  const chain = parentChain(level, id);
  if (level !== 'estado' && chain[chain.length - 1]?.level !== level) chain.push({ level, id, name: entityName(level, getProps(level, id)) });
  const lean = chain.filter((c, i) => !(i < chain.length - 1 && chain[i + 1].name === c.name && c.level !== 'estado'));
  lean.forEach((c, i) => {
    const last = i === lean.length - 1;
    if (i) el.append(h('span', { class: 'sep', 'aria-hidden': 'true' }, '›'));
    el.append(h('button', { class: 'crumb' + (last ? ' cur' : ''), type: 'button', 'aria-current': last ? 'true' : null, onclick: () => onGo(c.level, c.id) }, c.name));
  });
}

const camada = (rot, cls, ...filhos) => h('section', { class: `camada ${cls}` }, h('div', { class: 'camada-t' }, rot), ...filhos);
const stat = (l, v, s, on) => h('div', { class: 'stat' + (on ? ' on' : '') }, h('div', { class: 'stat-l' }, l), h('div', { class: 'stat-v tn' }, v), h('div', { class: 'stat-s' }, s));

/** Seletor de métrica (o que o mapa pinta). */
function seletor(ctx) {
  const lista = h('div', { class: 'met', role: 'radiogroup', 'aria-label': 'O que o mapa mostra' });
  METRICAS.forEach((m, i) => lista.append(h('button', { type: 'button', role: 'radio', class: 'met-b' + (m.k === ctx.m.k ? ' on' : ''), 'aria-checked': String(m.k === ctx.m.k), onclick: () => ctx.onMetrica(m.k), title: `${m.desc} (tecla ${i + 1})` },
    h('i', { class: 'met-sw', style: { background: `linear-gradient(90deg, ${RAMPA[m.tom][1]}, ${RAMPA[m.tom][5]})` } }), h('span', null, m.rot))));
  return lista;
}

/** Comparação com o pai (estado ou Brasil) no rodapé de cada número. */
function referencia(k, f, nivel) {
  const ref = nivel === 'br' ? null : nivel === 'estado' || nivel === 'uf' ? valorDe('br', 0) : valorDe('estado', 0);
  const v = ref?.[k];
  if (v == null) return '';
  return `${nivel === 'estado' || nivel === 'uf' ? 'Brasil' : D.meta?.uf_nome || 'Brasil'}: ${f(v)}`;
}

// ------------------------------------------------------------------ anúncio (os mesmos dois da página principal)
// Um elemento só, criado uma vez e reaproveitado a cada desenho do cartão: o carrossel não reinicia a cada clique no
// mapa e a mesma impressão não conta duas vezes. Métricas: evento "anuncio" (viu/clique), página "nerd".
const IG = 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077';
let anuncio = null;
function anuncioEl() {
  if (anuncio) return anuncio;
  const slides = [
    h('a', { class: 'an-slide', href: 'mailto:anuncie@horadevotar.com?subject=Quero%20anunciar%20no%20Hora%20de%20votar', 'data-qual': 'anuncie' },
      h('span', { class: 'an-rot' }, 'Anúncio'), h('span', { class: 'an-txt' }, h('b', null, 'Anuncie aqui.'), ' Fale com milhões de eleitores às vésperas do 2º turno.'), h('span', { class: 'an-cta' }, 'Quero anunciar')),
    h('a', { class: 'an-slide', href: 'https://www.instagram.com/ogallotti/', target: '_blank', rel: 'noopener', 'data-qual': 'instagram' },
      svg('svg', { class: 'an-ig', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, svg('path', { d: IG, fill: 'currentColor' })),
      h('span', { class: 'an-txt' }, 'Siga ', h('b', null, '@ogallotti'), ' no Instagram para aprender mais sobre IA.'), h('span', { class: 'an-cta' }, 'Seguir')),
  ];
  const trilho = h('div', { class: 'an-trilho' }, ...slides);
  const pontos = slides.map((_, j) => h('button', { type: 'button', 'aria-label': `Anúncio ${j + 1} de ${slides.length}`, onclick: () => vai(j) }));
  anuncio = h('aside', { class: 'an', 'aria-label': 'Anúncios', 'aria-roledescription': 'carrossel' }, trilho, h('div', { class: 'an-pontos' }, ...pontos));
  let i = 0, pausa = false;
  const vistos = new Set();
  const vai = (k) => {
    i = (k + slides.length) % slides.length;
    trilho.style.transform = `translateX(${-100 * i}%)`;
    pontos.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    slides.forEach((a, j) => { a.tabIndex = j === i ? 0 : -1; a.setAttribute('aria-hidden', String(j !== i)); });
    if (anuncio.isConnected && !vistos.has(i) && document.visibilityState === 'visible') { vistos.add(i); evento('anuncio', { qual: slides[i].dataset.qual, acao: 'viu' }); }
  };
  slides.forEach((a) => a.addEventListener('click', () => evento('anuncio', { qual: a.dataset.qual, acao: 'clique' })));
  for (const [ev, v] of [['pointerenter', true], ['pointerleave', false], ['focusin', true], ['focusout', false]]) anuncio.addEventListener(ev, () => { pausa = v; });
  setInterval(() => { if (!pausa && anuncio.isConnected && document.visibilityState === 'visible') vai(i + 1); }, 7000);
  setTimeout(() => vai(0), 0);
  return anuncio;
}

// ------------------------------------------------------------------ cartão principal
export function renderMain(el, level, id, ctx) {
  const m = ctx.m;
  const v = valorDe(level, id);
  const p = level === 'br' ? null : getProps(level, id);
  const nome = level === 'br' ? 'Brasil' : level === 'estado' ? D.meta.uf_nome : level === 'uf' || level === 'brmun' ? p?.n : entityName(level, p || {});
  const em = level === 'br' ? 'em todo o Brasil' : level === 'secao' ? `na seção ${p?.nr}` : `em ${nome}`;
  const frag = [];
  frag.push(h('div', { class: 'eyebrow' }, h('b', null, 'Para nerds'), h('span', null, '·'), h('span', null, '1º turno, 4/10/2026'),
    level !== 'br' ? [h('span', null, '·'), h('b', null, level === 'estado' ? D.meta.uf_nome : nome)] : null));
  if (level === 'br') {
    frag.push(h('h1', { class: 'hero' }, 'O 1º turno, ', h('em', null, 'urna por urna')),
      h('p', { class: 'lede' }, `Cada urna grava a hora de cada eleitor, e o TSE publica esses registros. Lemos os de ${fInt(BR.st.br.ns)} seções: quanto tempo cada um levou, quem pegou fila, a que horas cada lugar votou. Clique num estado e desça até a sua seção.`));
  } else {
    frag.push(h('p', { class: 'nivel' }, LEVEL_INFO[level]?.label || ''));
  }
  frag.push(h('div', { class: 'q q-met' }, h('p', { class: 'q-l' }, 'O que o mapa mostra'), seletor(ctx)));
  if (v && v[m.k] != null) frag.push(h('div', { class: 'answer' }, h('h2', { class: 'verdict' }, ...m.frase(v[m.k], em)), h('p', { class: 'verdict-s' }, m.desc)));
  else frag.push(h('div', { class: 'answer' }, h('h2', { class: 'verdict' }, `Sem log de urna para ${nome}.`)));
  frag.push(anuncioEl());
  if (ctx.modo === 'uf') {
    // só no celular (no desktop os níveis ficam na barra do mapa)
    const niv = h('div', { class: 'chips niveis-m', role: 'radiogroup', 'aria-label': 'Nível do mapa' });
    for (const [k, t] of [['auto', 'Auto'], ['municipio', 'Municípios'], ['bairro', 'Bairros'], ['local', 'Locais'], ['secao', 'Seções']])
      niv.append(h('button', { type: 'button', role: 'radio', class: 'chip' + (ctx.nivel === k ? ' on' : ''), 'aria-checked': String(ctx.nivel === k), onclick: () => ctx.onNivel(k) }, t));
    frag.push(h('div', { class: 'niveis-m-caixa' }, h('p', { class: 'q-l' }, 'Ver o mapa por'), niv));
  }
  if (v) {
    frag.push(h('div', { class: 'stats stats-7' }, ...LINHAS.map(([k, rot, f]) => stat(rot, v[k] != null ? f(v[k]) : '—', referencia(k, f, level), k === m.k)),
      stat('Eleitores', fCompact(v.el), v.ns > 1 ? `em ${fInt(v.ns)} urnas` : 'numa urna só')));
  }
  if (level === 'br') {
    const b = BR.st.br;
    frag.push(camada('Números do Brasil', 'c1',
      h('p', null, h('b', null, `${b.cabine_anos.toLocaleString('pt-BR')} anos`), ' dentro da cabine, somando o tempo de todo mundo.'),
      h('p', null, `Metade votou em até ${duracao(b.t)}. 1 em cada 10, em menos de ${duracao(b.p10)}; 1 em cada 100 levou mais de ${duracao(b.p99)}.`),
      h('p', null, `Presidente: ${duracao(b.pr)} para digitar e confirmar. Governador: ${duracao(b.gv)}.`),
      h('p', null, `O minuto mais cheio foi às ${relogio(b.pico_min)}: ${fInt(b.pico_min_n)} votos computados no Brasil.`),
      h('p', null, `${fInt(b.fila_dia)} urnas tiveram fila por 8 horas ou mais, sem parar.`)));
  }
  frag.push(h('details', { class: 'more' }, h('summary', null, 'Como medimos'),
    h('div', { class: 'more-b' },
      h('p', null, 'Lemos o log de cada urna do 1º turno (4 de outubro de 2026), publicado pelo TSE.'),
      h('p', null, h('b', null, 'Tempo para votar: '), 'do título digitado pela mesa até o voto computado, os 5 cargos. ', h('b', null, 'Biometria: '), 'do título digitado até a urna liberar o eleitor.'),
      h('p', null, h('b', null, 'Pegou fila: '), 'o eleitor foi chamado logo depois de o anterior sair (a urna não ficou esperando ninguém chegar).'),
      h('p', null, h('b', null, 'Comparecimento: '), 'eleitores no log sobre os aptos da seção, só nas seções com log e cadastro coerente.'),
      h('p', null, h('b', null, 'Municípios e estados: '), 'medianas de todos os eleitores. ', h('b', null, 'Regiões, zonas, bairros e locais: '), 'medianas das seções, pesadas pelos eleitores. Horários em hora de Brasília.'),
      h('p', { class: 'muted' }, 'Zonas, bairros, locais e seções são áreas aproximadas em volta dos locais de votação (malhas do IBGE e coordenadas do TSE).'),
      h('p', { class: 'muted' }, h('a', { href: '/privacidade' }, 'Privacidade'), ' · ', h('a', { href: '/termos' }, 'Termos de Uso'), ' · sem cookies e sem rastreadores.'))));
  clear(el).append(...frag);
}

// ------------------------------------------------------------------ cartão lateral
export function renderSide(el, level, id, ctx) {
  const abas = [['ranking', 'Ranking'], ['recordes', 'Recordes'], ['brasil', 'Horários']];
  const tab = abas.some(([k]) => k === ctx.tab) ? ctx.tab : 'ranking';
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  for (const [k, t] of abas) tabs.append(h('button', { type: 'button', role: 'tab', class: 'tab' + (k === tab ? ' on' : ''), 'aria-selected': String(k === tab), onclick: () => ctx.onTab(k) }, t));
  const b = h('div', { class: 'side-b' });
  if (tab === 'ranking') ranking(b, level, id, ctx);
  else if (tab === 'recordes') (level === 'br' ? recordesBR(b, ctx) : recordesUF(b, level, id, ctx));
  else horarios(b);
  clear(el).append(tabs, b);
}

/** Subunidades ordenadas pela métrica; no Brasil, estados ou municípios. */
function ranking(b, level, id, ctx) {
  const m = ctx.m;
  let cl, itens;
  if (level === 'br') {
    cl = ctx.rankBR === 'mun' ? 'brmun' : 'uf';
    itens = cl === 'uf' ? [...BR.ufs.values()] : (BR.mun?.features || []).map((f) => f.properties).filter((p) => (p.ns || 0) >= 5);
  } else ({ level: cl, items: itens } = childrenOf(level, id));
  if (!cl || !itens?.length) { b.append(h('div', { class: 'side-note' }, 'Sem subdivisões neste recorte.')); return; }
  const linhas = itens.map((p) => ({ p, v: valorDe(cl, p.id) })).filter((x) => x.v && x.v[m.k] != null);
  const desc = ctx.ordem !== 'menor';
  linhas.sort((a, c) => (desc ? c.v[m.k] - a.v[m.k] : a.v[m.k] - c.v[m.k]) || c.v.el - a.v.el);
  const chips = h('div', { class: 'chips' });
  if (level === 'br') for (const [k, t] of [['uf', 'Estados'], ['mun', 'Municípios']]) chips.append(h('button', { type: 'button', class: 'chip' + ((ctx.rankBR || 'uf') === k ? ' on' : ''), onclick: () => ctx.onRankBR(k) }, t));
  for (const [k, t] of [['maior', m.maior], ['menor', m.menor]]) chips.append(h('button', { type: 'button', class: 'chip' + ((desc ? 'maior' : 'menor') === k ? ' on' : ''), onclick: () => ctx.onOrdem(k) }, t));
  b.append(h('div', { class: 'sec-t' }, h('b', null, `${LEVEL_INFO[cl].plural} (${fInt(linhas.length)})`), m.rot.toLowerCase()), chips);
  const vals = linhas.map((x) => x.v[m.k]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const lim = ctx.mais ? linhas.length : 30;
  const cor = RAMPA[m.tom][4];
  linhas.slice(0, lim).forEach(({ p, v }, i) => {
    const nome = cl === 'secao' ? `Seção ${p.nr}` : cl === 'local' ? (D.nomes ? p.n : `Local ${p.id + 1}`) : p.n;
    const sub = cl === 'brmun' ? p.uf : cl === 'uf' ? `${fCompact(v.el)} eleitores` : `${fCompact(v.el)} eleitores${v.ns > 1 ? ` · ${fInt(v.ns)} urnas` : ''}`;
    const w = hi > lo ? 6 + (94 * (v[m.k] - lo)) / (hi - lo) : 100;
    b.append(h('button', { type: 'button', class: 'row rk', onclick: () => ctx.onSelect(cl, p.id) },
      h('span', { class: 'rk-i tn' }, String(i + 1)),
      h('span', { class: 'row-n' }, h('b', null, nome), h('span', null, sub)),
      h('span', { class: 'row-v tn' }, h('b', null, m.fmt(v[m.k])), h('span', { class: 'meter' }, h('i', { style: { width: `${w}%`, background: cor } })))));
  });
  if (linhas.length > lim) b.append(h('button', { type: 'button', class: 'more-btn', onclick: ctx.onMais }, `Mostrar todos (${fInt(linhas.length)})`));
  if (level === 'br' && ctx.rankBR === 'mun') b.append(h('div', { class: 'side-note' }, 'Municípios com 5 urnas ou mais.'));
}

// ------------------------------------------------------------------ recordes
const RECORDES = [
  { k: 'rapida', rot: 'Votação mais rápida', fmt: (v) => duracao(v), sub: 'tempo típico por eleitor' },
  { k: 'lenta', rot: 'Votação mais lenta', fmt: (v) => duracao(v), sub: 'tempo típico por eleitor' },
  { k: 'fila', rot: 'Fila que não acabou', fmt: (v) => horasMin(v), sub: 'seguidas com quase todos esperando' },
  { k: 'ultimo', rot: 'Último voto', fmt: (v) => relogio(v), sub: 'horário de Brasília' },
  { k: 'cheia', rot: 'Urna mais cheia', fmt: (v) => `${fInt(v)} eleitores`, sub: 'numa urna só' },
  { k: 'vazia', rot: 'A urna mais solitária', fmt: (v) => horasMin(v), sub: 'sem ninguém, no meio do dia' },
  { k: 'biometria', rot: 'Biometria mais demorada', fmt: (v) => duracao(v), sub: 'tempo típico por eleitor' },
  { k: 'todos', rot: 'Todo mundo votou', fmt: (v) => `${fInt(v)} de ${fInt(v)}`, sub: '100% de comparecimento' },
];

function cartaoRecorde(c, lista, onPick) {
  const [p, ...resto] = lista;
  return h('section', { class: 'camada rec' }, h('div', { class: 'camada-t' }, c.rot),
    h('div', { class: 'rec-v tn' }, c.fmt(p.v), h('span', null, c.sub)),
    h('button', { type: 'button', class: 'rec-onde', onclick: () => onPick(p) }, h('b', null, p.local || `Seção ${p.s}`), h('span', null, `${p.mun}, ${p.uf} · zona ${p.z}, seção ${p.s}`)),
    resto.length ? h('ol', { class: 'rec-resto', start: 2 }, ...resto.map((r) => h('li', null, h('button', { type: 'button', onclick: () => onPick(r) }, h('span', null, `${r.mun}, ${r.uf}`), h('b', { class: 'tn' }, c.fmt(r.v)))))) : null);
}

function recordesBR(b, ctx) {
  const R = BR.st.recordes;
  b.append(h('div', { class: 'sec-t' }, h('b', null, 'Recordes do Brasil'), 'urnas com 50 eleitores ou mais'));
  for (const c of RECORDES) if (R[c.k]?.length) b.append(cartaoRecorde(c, R[c.k], ctx.onRecorde));
  b.append(h('div', { class: 'side-note' }, 'Um por local de votação. Clique para ir até a urna no mapa.'));
}

/** Recordes do recorte, calculados das seções que já estão no navegador. */
function recordesUF(b, level, id, ctx) {
  // numa seção ou num local, os recordes são do município (uma urna só não tem pódio)
  if (level === 'secao' || level === 'local') { id = munOf(level, id); level = 'municipio'; }
  const s = D.sec, secs = [...secsOf(level, id)].filter((i) => s.el[i] >= 50);
  const nome = level === 'estado' ? D.meta.uf_nome : entityName(level, getProps(level, id) || {});
  b.append(h('div', { class: 'sec-t' }, h('b', null, `Recordes · ${nome}`), 'urnas com 50 eleitores ou mais'));
  if (!secs.length) { b.append(h('div', { class: 'side-note' }, 'Nenhuma urna com 50 eleitores ou mais neste recorte.')); return; }
  const onde = (i) => {
    const li = s.li[i], mi = D.loc.mi[li];
    return { i, local: D.nomes?.[li]?.[0] || '', mun: BR.munNome.get(mi) || '', uf: D.meta.uf.toUpperCase(), z: D.loc.z[li], s: s.nr[i] };
  };
  const top = (k, maior, n = 5, filtro = () => true) => {
    const vistos = new Set(), out = [];
    const xs = secs.filter((i) => s[k][i] != null && filtro(i)).sort((a, c) => (maior ? s[k][c] - s[k][a] : s[k][a] - s[k][c]) || s.el[c] - s.el[a]);
    for (const i of xs) { if (vistos.has(s.li[i])) continue; vistos.add(s.li[i]); out.push({ ...onde(i), v: s[k][i] }); if (out.length === n) break; }
    return out;
  };
  const cfg = [
    [RECORDES[0], top('t', false)], [RECORDES[1], top('t', true)], [RECORDES[3], top('ult', true)], [RECORDES[4], top('el', true)],
    [RECORDES[6], top('bio', true)], [RECORDES[7], top('el', true, 5, (i) => s.ap[i] && s.el[i] === s.ap[i])],
  ];
  for (const [c, lista] of cfg) if (lista.length) b.append(cartaoRecorde(c, lista, (r) => ctx.onSelect('secao', r.i)));
  b.append(h('div', { class: 'side-note' }, `Calculados nas ${fInt(secs.length)} urnas do recorte. Um por local de votação.`));
}

// ------------------------------------------------------------------ horários e tempos (Brasil)
function dicaGraf(alvo) {
  const d = h('div', { class: 'g-dica' });
  alvo.append(d);
  return {
    mostra(x, y, t) { d.textContent = t; d.classList.add('on'); d.style.left = `${Math.min(Math.max(x, 60), alvo.clientWidth - 60)}px`; d.style.top = `${y}px`; },
    some() { d.classList.remove('on'); },
  };
}

function graficoMinutos() {
  const ys = BR.st.minutos, W = 340, H = 170, m = { l: 4, r: 4, t: 22, b: 20 };
  const max = Math.max(...ys);
  const X = (i) => m.l + (i / (ys.length - 1)) * (W - m.l - m.r);
  const Y = (v) => H - m.b - (v / max) * (H - m.t - m.b);
  let d = `M${X(0)},${Y(ys[0])}`;
  ys.forEach((v, i) => { d += `L${X(i).toFixed(1)},${Y(v).toFixed(1)}`; });
  const pico = ys.indexOf(max);
  const caixa = h('div', { class: 'graf' });
  const mira = svg('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, class: 'g-mira' });
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'g-svg', role: 'img', 'aria-label': `Votos por minuto no Brasil. Pico às ${relogio((8 * 60 + pico) * 60)}.` },
    svg('path', { d: `${d}L${X(ys.length - 1)},${H - m.b}L${X(0)},${H - m.b}Z`, class: 'g-area' }), svg('path', { d, class: 'g-linha' }),
    svg('line', { x1: X(540), x2: X(540), y1: m.t - 6, y2: H - m.b, class: 'g-marco' }), svg('text', { x: X(540) + 4, y: m.t - 8, class: 'g-rot' }, '17h'),
    svg('circle', { cx: X(pico), cy: Y(max), r: 3, class: 'g-ponto' }),
    ...[0, 2, 4, 6, 8, 10, 12].map((hh) => svg('text', { x: X(hh * 60), y: H - 5, class: 'g-eixo', 'text-anchor': hh === 0 ? 'start' : hh === 12 ? 'end' : 'middle' }, `${8 + hh}h`)), mira);
  caixa.append(s);
  const tip = dicaGraf(caixa);
  s.addEventListener('pointermove', (e) => {
    const r = s.getBoundingClientRect();
    const i = Math.round(((((e.clientX - r.left) / r.width) * W - m.l) / (W - m.l - m.r)) * (ys.length - 1));
    if (i < 0 || i >= ys.length) return;
    mira.setAttribute('x1', X(i)); mira.setAttribute('x2', X(i)); mira.classList.add('on');
    tip.mostra((X(i) / W) * r.width, (Y(ys[i]) / H) * r.height - 10, `${relogio((8 * 60 + i) * 60)} · ${fInt(ys[i])} votos`);
  });
  s.addEventListener('pointerleave', () => { mira.classList.remove('on'); tip.some(); });
  return caixa;
}

function histograma(hist, passo, marca) {
  const W = 340, H = 150, m = { l: 2, r: 2, t: 20, b: 20 };
  const tot = hist.reduce((a, c) => a + c, 0), max = Math.max(...hist), n = hist.length, bw = (W - m.l - m.r) / n;
  const caixa = h('div', { class: 'graf' });
  const barras = hist.map((v, i) => { const hh = (v / max) * (H - m.t - m.b); return svg('rect', { x: m.l + i * bw + 0.5, y: H - m.b - hh, width: Math.max(1, bw - 1), height: hh, rx: 1.5, class: 'g-barra' }); });
  const xm = m.l + (marca / passo) * bw;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'g-svg', role: 'img', 'aria-label': 'Histograma' }, ...barras,
    svg('line', { x1: xm, x2: xm, y1: m.t - 4, y2: H - m.b, class: 'g-marco' }), svg('text', { x: xm, y: m.t - 8, class: 'g-rot', 'text-anchor': 'middle' }, `metade: ${duracao(marca)}`),
    ...[0, Math.round(n / 2), n - 1].map((i) => svg('text', { x: m.l + i * bw + bw / 2, y: H - 5, class: 'g-eixo', 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, i === n - 1 ? `${duracao(i * passo)}+` : duracao(i * passo))));
  caixa.append(s);
  const tip = dicaGraf(caixa);
  let ativa = null;
  s.addEventListener('pointermove', (e) => {
    const r = s.getBoundingClientRect(), i = Math.floor(((((e.clientX - r.left) / r.width) * W) - m.l) / bw);
    if (i < 0 || i >= n) return;
    ativa?.classList.remove('on'); ativa = barras[i]; ativa.classList.add('on');
    const faixa = i === n - 1 ? `${duracao(i * passo)} ou mais` : `${duracao(i * passo)} a ${duracao((i + 1) * passo)}`;
    tip.mostra(((m.l + i * bw + bw / 2) / W) * r.width, ((H - m.b - (hist[i] / max) * (H - m.t - m.b)) / H) * r.height - 10, `${faixa}: ${fPct(Math.round((1000 * hist[i]) / tot) / 10)}`);
  });
  s.addEventListener('pointerleave', () => { ativa?.classList.remove('on'); tip.some(); });
  return caixa;
}

function horarios(b) {
  const st = BR.st, br = st.br;
  const depois = st.minutos.slice(9 * 60).reduce((a, c) => a + c, 0) / st.minutos.reduce((a, c) => a + c, 0);
  b.append(h('div', { class: 'sec-t' }, h('b', null, 'A que horas o Brasil votou'), 'votos por minuto'), graficoMinutos(),
    h('div', { class: 'side-note' }, `Horário de Brasília. ${fPct(Math.round(depois * 1000) / 10)} dos votos saíram depois das 17h, de quem já estava na fila.`),
    h('div', { class: 'sec-t' }, h('b', null, 'Quanto tempo leva para votar'), 'eleitores'), histograma(st.hist_t, 15, br.t),
    h('div', { class: 'side-note' }, `Do título digitado ao voto computado. 1 em cada 10 levou mais de ${duracao(br.p90)}.`),
    h('div', { class: 'sec-t' }, h('b', null, 'A biometria'), 'eleitores'), histograma(st.hist_bio, 5, br.bio),
    h('div', { class: 'side-note' }, `Do título digitado até a urna liberar o eleitor. ${fPct(br.bio60)} levaram mais de 1 minuto.`));
}

export { SEM_DADO, METRICA };

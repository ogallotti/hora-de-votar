// Controlador da página /nerd: Brasil ↔ estado, métrica, nível, recorte, carga sob demanda, endereço compartilhável,
// teclado e gaveta do celular. Adaptado de quem-vota-em-quem (js/main.js). Zero backend: só arquivos estáticos.
import { abrirBusca, buscaAberta, fecharBusca, iconeBusca } from './busca.js';
import { evento } from '../metricas.js';
import { BR, D, focusGeometry, getProps, loadBR, loadBRMun, loadMunPolys, loadNomes, loadUF, loadZB, munOf, parentChain, unidadesNoRecorte } from './dados.js';
import { METRICA, METRICAS, RAMPA, SEM_DADO, classes, rotuloMapa, valorDe } from './estat.js';
import { clear, h } from './fmt.js';
import { BRASIL, MapView } from './mapa.js';
import { Tooltip, renderCrumbs, renderLegend, renderMain, renderSide } from './painel.js';

const $ = (id) => document.getElementById(id);
const CRUMBS = $('crumbs');
const state = { modo: 'br', uf: null, m: 't', mode: 'auto', sel: { level: 'br', id: 0 }, tab: 'ranking', ordem: 'maior', rankBR: 'uf', mais: false };
const touch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches);
let view, tooltip;
window.__state = state;

// ------------------------------------------------------------------ layout pelo aparelho (não pela largura do iframe)
const UI = { k: 1, m: false, ml: false };
function computeLayout() {
  const sw = screen.width || innerWidth;
  const k = touch && sw < 1000 && innerWidth > sw * 1.15 ? innerWidth / sw : 1;
  const W = innerWidth / k, H = innerHeight / k;
  const m = W <= 820 || (touch && H <= 520 && W <= 1100), ml = m && H <= 520;
  const app = $('app');
  if (k !== 1) Object.assign(app.style, { width: `${W}px`, height: `${H}px`, transform: `scale(${k})` });
  else Object.assign(app.style, { width: '', height: '', transform: '' });
  document.documentElement.classList.toggle('m', m);
  document.documentElement.classList.toggle('ml', ml);
  Object.assign(UI, { k, m, ml });
  window.__uiK = k;
}
const mobile = () => UI.m;
computeLayout();

function padding() {
  if (mobile()) {
    const H = $('app').offsetHeight, sh = UI.ml ? 0 : $('sheet').offsetHeight;
    const topo = $('mapbar').hidden ? 70 : $('mapbar').getBoundingClientRect().bottom / UI.k + 12;
    return UI.ml ? { top: topo, left: 12, right: $('sheet').offsetWidth + 12, bottom: 20 } : { top: topo, left: 16, right: 16, bottom: Math.min(H * 0.6, sh) + 16 };
  }
  const focus = document.body.classList.contains('focus');
  const W = $('app').offsetWidth;
  return { top: 110, left: focus ? 40 : 420 + 40, right: focus || W <= 1100 ? 40 : 360 + 40, bottom: 40 };
}

let toastT = 0;
function toast(msg, ms = 2200) {
  const el = $('toast');
  el.textContent = msg; el.hidden = !msg;
  clearTimeout(toastT);
  if (ms && msg) toastT = setTimeout(() => { el.hidden = true; }, ms);
}

// ------------------------------------------------------------------ endereço compartilhável
const parseHash = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
let hashT = 0, aplicandoHash = false;
function writeHash() {
  clearTimeout(hashT);
  hashT = setTimeout(() => {
    if (aplicandoHash) return;
    const q = new URLSearchParams();
    if (state.m !== 't') q.set('m', state.m);
    if (state.modo === 'uf') {
      q.set('uf', state.uf);
      if (!['estado', 'br'].includes(state.sel.level)) q.set('s', `${state.sel.level}:${state.sel.id}`);
    }
    const s = q.toString().replace(/%3A/g, ':');
    if (location.hash.slice(1) !== s) history.replaceState(null, '', s ? `#${s}` : location.pathname);
  }, 250);
}

// ------------------------------------------------------------------ pintura
const metrica = () => METRICA[state.m];
let clsCache = new Map();
/** Classes da métrica num nível, calculadas sobre as unidades do recorte (cada nível com a sua régua). */
function clsDe(lv) {
  if (clsCache.has(lv)) return clsCache.get(lv);
  const m = metrica();
  let vs;
  if (lv === 'uf') vs = BR.states.features.map((f) => valorDe('uf', f.properties.id));
  else if (lv === 'brmun') vs = (BR.mun?.features || []).map((f) => valorDe('brmun', f.properties.id));
  else {
    const u = D.un[lv], set = unidadesNoRecorte(lv, state.sel.level, state.sel.id);
    vs = (u?.ids || []).filter((id) => !set || set.has(id)).map((id) => valorDe(lv, id));
  }
  const c = classes(m, vs);
  clsCache.set(lv, c);
  return c;
}

function pintar() {
  if (!view) return;
  clsCache = new Map();
  const m = metrica();
  const { level: sl, id: si } = state.sel;
  const fora = (lv, id) => { if (state.modo !== 'uf') return false; const set = unidadesNoRecorte(lv, sl, si); return set && !set.has(id); };
  // uma paleta só (a rampa da métrica); cada nível usa os seus cortes
  view.setPaint({
    palette: RAMPA[m.tom], none: SEM_DADO,
    k: (lv, id) => { if (fora(lv, id)) return -2; const v = valorDe(lv, id); return v ? clsDe(lv).kr(v[m.k]) : -1; },
    label: (lv, p) => rotuloMapa(m, valorDe(lv, p.id)?.[m.k]),
    peso: (lv, p) => valorDe(lv, p.id)?.el || 0,
  });
  legenda();
}

function legenda() {
  const lv = view?.view?.poly || (state.modo === 'uf' ? 'municipio' : 'uf');
  const { level: sl, id: si } = state.sel;
  const escopo = state.modo === 'br' ? (lv === 'uf' ? 'estados' : 'municípios') : sl === 'estado' ? `${D.meta.uf_nome}` : getProps(sl, si)?.n || '';
  renderLegend($('legend'), { m: metrica(), cls: clsDe(lv), escopo });
}

// ------------------------------------------------------------------ cartões
const ctx = () => ({
  m: metrica(), tab: state.tab, ordem: state.ordem, rankBR: state.rankBR, mais: state.mais, modo: state.modo, nivel: state.mode,
  onNivel: (md) => { ctl.setMode(md); renderCards(); },
  onMetrica: (k) => ctl.setMetrica(k),
  onTab: (t) => { state.tab = t; state.mais = false; renderCards(); },
  onOrdem: (o) => { state.ordem = o; renderCards(); },
  onRankBR: (r) => { state.rankBR = r; state.mais = false; if (r === 'mun') loadBRMun().then(renderCards); renderCards(); },
  onMais: () => { state.mais = true; renderCards(); },
  onSelect: (l, i) => escolher(l, i),
  onRecorde: (r) => irParaSecao(r),
});
function renderCards() {
  const { level, id } = state.sel;
  renderMain($('main-card'), level, id, ctx());
  renderSide($('side-card'), level, id, ctx());
  alturaPeek();
}

function renderTop() {
  $('uf-pill').textContent = state.modo === 'uf' ? D.meta.uf_nome : 'Brasil';
  const mb = $('mapbar');
  clear(mb);
  const met = h('div', { class: 'seg seg-met', role: 'radiogroup', 'aria-label': 'O que o mapa mostra' });
  for (const m of METRICAS) met.append(h('button', { type: 'button', role: 'radio', 'aria-checked': String(state.m === m.k), class: state.m === m.k ? 'on' : '', title: m.desc, onclick: () => ctl.setMetrica(m.k) }, m.curto));
  mb.hidden = false;
  if (state.modo !== 'uf') { mb.append(met); clear(CRUMBS); return; }
  mb.append(met);
  const niv = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Nível do mapa' });
  for (const [id, t] of [['auto', 'Auto'], ['municipio', 'Municípios'], ['bairro', 'Bairros'], ['local', 'Locais'], ['secao', 'Seções']]) niv.append(h('button', { type: 'button', role: 'radio', 'aria-checked': String(state.mode === id), class: state.mode === id ? 'on' : '', onclick: () => ctl.setMode(id) }, t));
  mb.append(niv, CRUMBS);
  met.scrollLeft = 0;
  met.querySelector('.on')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
}

// ------------------------------------------------------------------ controle
function escolher(level, id) {
  if (level === 'uf') { const p = getProps('uf', id); if (p) ctl.entrar(p.uf); return; }
  if (level === 'brmun') { const uf = BR.munUf.get(id); if (uf) ctl.entrar(uf.toLowerCase(), { sel: { level: 'municipio', id } }); return; }
  if (level === 'br') { ctl.irBrasil(); return; }
  if (level === 'secaoBR') { irParaSecaoBuscada(id); return; }
  ctl.select(level, id, { fit: true });
}

/** Seção buscada pelo número numa cidade: abre o estado e escolhe a urna (com mais de uma zona, a primeira). */
async function irParaSecaoBuscada(id) {
  const [cd, z, nr] = id.split('|');
  const uf = BR.munUf.get(+cd);
  if (!uf) return;
  await ctl.entrar(uf.toLowerCase());
  const achadas = [];
  for (let i = 0; i < D.n; i++) {
    const li = D.sec.li[i];
    if (D.sec.nr[i] === +nr && D.loc.mi[li] === +cd && (z === '' || D.loc.z[li] === +z)) achadas.push(i);
  }
  if (!achadas.length) { toast(`Não achamos a seção ${nr} em ${BR.munNome.get(+cd)}`); return; }
  await ctl.select('secao', achadas[0]);
  if (achadas.length > 1) toast(`Há ${achadas.length} seções ${nr} em ${BR.munNome.get(+cd)}; esta é a da zona ${D.loc.z[D.sec.li[achadas[0]]]}. Digite a zona para escolher outra.`, 5000);
}

/** Recorde do Brasil → abre o estado e vai até a urna. */
async function irParaSecao(r) {
  await ctl.entrar(r.uf.toLowerCase());
  const s = D.sec;
  for (let i = 0; i < D.n; i++) {
    const li = s.li[i];
    if (s.nr[i] === r.s && D.loc.z[li] === r.z && D.loc.mi[li] === r.cd) { await ctl.select('secao', i); return; }
  }
  toast('Esta urna não tem área no mapa');
}

const irPara = (l, i) => (l === 'br' ? ctl.irBrasil() : ctl.select(l, i));
const ctl = {
  async entrar(uf, { sel = null } = {}) {
    if (!BR.ufs.get(uf.toUpperCase())) return;
    fecharBusca();
    const trocou = state.uf !== uf;
    if (trocou) evento('nerd', { acao: 'estado', valor: uf });
    if (trocou) {
      toast(`Abrindo ${BR.ufs.get(uf.toUpperCase()).n}…`, 0);
      await loadUF(uf);
      view.clearUF();
      state.uf = uf;
      state.mode = 'auto'; view.setMode('auto');
    }
    Object.assign(state, { modo: 'uf', mais: false });
    view.setModo('uf');
    for (const l of ['macro', 'municipio']) view.addLevel(l);
    toast('');
    document.body.classList.add('uf');
    if (sel && getProps(sel.level, sel.id)) await ctl.select(sel.level, sel.id);
    else ctl.select('estado', 0, { fit: trocou || state.sel.level === 'br' });
    loadZB().then(() => { if (state.uf === uf) { view.addLevel('zona'); view.addLevel('bairro'); pintar(); renderCards(); } }).catch(() => {});
    loadNomes().then(() => { if (state.uf === uf && state.modo === 'uf') { renderCards(); view.refreshFine(); renderCrumbs(CRUMBS, state.sel.level, state.sel.id, irPara); } }).catch(() => {});
  },
  irBrasil() {
    fecharBusca();
    Object.assign(state, { modo: 'br', sel: { level: 'br', id: 0 }, mais: false });
    document.body.classList.remove('uf');
    view.setFocus(null); view.setSelection(null); view.setModo('br');
    loadBRMun().then(() => { view.addLevel('brmun'); pintar(); }).catch(() => {});
    if (mobile()) setSnap('peek');
    pintar(); renderTop(); renderCards(); view.fit('br', 0);
    writeHash();
  },
  async select(level, id, { fit = true } = {}) {
    if (state.modo !== 'uf' || (level !== 'estado' && !getProps(level, id))) return;
    state.sel = { level, id };
    state.mais = false;
    const min = { estado: 'municipio', macro: 'municipio', municipio: getProps('municipio', id)?.bb ? 'bairro' : 'local', zona: 'local', bairro: 'local', local: 'secao', secao: 'secao' }[level];
    view.setMinLevel(min);
    const mi = munOf(level, id);
    if (mi != null && (min === 'local' || min === 'secao')) carregarPolys([mi]);
    if (level === 'estado') filaPolys.length = 0;
    view.setSelection(level, id);
    view.setFocus(focusGeometry(level, id));
    pintar(); renderCards(); renderTop();
    renderCrumbs(CRUMBS, level, id, irPara);
    if (fit) view.fit(level, id);
    if (mobile()) setSnap('peek');
    writeHash();
  },
  setMetrica(k) { if (!METRICA[k]) return; if (k !== state.m) evento('nerd', { acao: 'metrica', valor: k }); state.m = k; pintar(); renderTop(); renderCards(); writeHash(); },
  setMode(md) { evento('nerd', { acao: 'nivel', valor: md }); state.mode = md; view.setMode(md); if (md === 'local' || md === 'secao') carregarPolys(view.municipiosVisiveis()); renderTop(); },
};
window.__ctl = ctl;

/** Polígonos de locais e seções: por pacote de municípios, os da tela primeiro (do centro para fora). */
let carregando = 0;
const filaPolys = [];
function carregarPolys(cds) {
  const centro = view.map.getCenter();
  const dist = (i) => { const f = D.lv.municipio.byId.get(i); return f ? (f.properties.lx - centro.lng) ** 2 + (f.properties.ly - centro.lat) ** 2 : 1e9; };
  for (const i of cds) if (!D.munPolys.has(i) && !filaPolys.includes(i)) filaPolys.push(i);
  filaPolys.sort((a, b) => dist(a) - dist(b));
  puxar();
}
function puxar() {
  const uf = state.uf;
  while (carregando < 4 && filaPolys.length) {
    const i = filaPolys.shift();
    if (D.munPolys.has(i)) continue;
    carregando++;
    loadMunPolys(i).catch(() => false).then((novo) => {
      carregando--;
      if (novo && state.modo === 'uf' && state.uf === uf) { view.addLevel('local'); view.addLevel('secao'); agendarRefresh(); }
      puxar();
    });
  }
}
let refreshT = 0;
function agendarRefresh() { clearTimeout(refreshT); refreshT = setTimeout(() => view.refreshFine(), 120); }

// ------------------------------------------------------------------ gaveta do celular
const SNAPS = ['peek', 'half', 'full'];
function setSnap(s) {
  const sh = $('sheet');
  if (sh.dataset.snap === s) return;
  sh.dataset.snap = s;
  if (s !== 'full') sh.scrollTop = 0;
  setTimeout(() => { medir(); if (s !== 'full' && view) state.modo === 'uf' ? view.fit(state.sel.level, state.sel.id, { duration: 400 }) : view.fit('br', 0, { duration: 400 }); }, 280);
}
function alturaPeek() {
  if (!mobile() || UI.ml) return;
  const sh = $('sheet'), alvo = $('main-card').querySelector('.answer, .hero');
  if (!alvo) return;
  const fim = alvo.offsetTop + alvo.offsetHeight + 14;
  sh.style.setProperty('--peek-h', `${Math.round(Math.max(170, Math.min(fim, $('app').offsetHeight * 0.5)))}px`);
}
function medir() { document.documentElement.style.setProperty('--sheet-h', `${mobile() && !UI.ml ? $('sheet').offsetHeight : 0}px`); }
function setupSheet() {
  const sh = $('sheet'), handle = $('sheet-handle');
  let y0 = null;
  handle.addEventListener('pointerdown', (e) => { y0 = e.clientY; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointerup', (e) => {
    if (y0 == null) return;
    const dy = (e.clientY - y0) / UI.k; y0 = null;
    const i = SNAPS.indexOf(sh.dataset.snap);
    if (Math.abs(dy) < 8) setSnap(SNAPS[(i + 1) % SNAPS.length]);
    else setSnap(SNAPS[Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1)))]);
  });
  new ResizeObserver(medir).observe(sh);
  sh.addEventListener('click', (e) => { if (sh.dataset.snap === 'peek' && !e.target.closest('button, a, input, summary')) setSnap('half'); });
}

// ------------------------------------------------------------------ boot
async function aplicarHash() {
  const q = parseHash();
  aplicandoHash = true;
  try {
    if (q.m && METRICA[q.m]) state.m = q.m;
    if (q.uf && BR.ufs.get(q.uf.toUpperCase())) {
      const [lv, idS] = (q.s || '').split(':');
      await ctl.entrar(q.uf);
      if (lv) {
        if (['zona', 'bairro'].includes(lv)) await loadZB().catch(() => {});
        await ctl.select(lv, Number(idS));
      }
    } else ctl.irBrasil();
  } finally { aplicandoHash = false; writeHash(); }
}

async function boot() {
  $('sb-i').append(iconeBusca());
  setupSheet();
  try {
    await loadBR();
    for (let t = 0; !window.maplibregl && t < 200; t++) await new Promise((r) => setTimeout(r, 25));
    if (!window.maplibregl) throw new Error('o mapa não carregou');
    tooltip = new Tooltip($('tip'));
    view = new MapView({
      container: 'map', pixelRatio: Math.min(2.5, (window.devicePixelRatio || 1) * UI.k), getPadding: padding,
      onHover: (hit, pt) => { if (!hit || !pt || touch) { tooltip.hide(); return; } tooltip.show(hit.level, hit.id, pt, metrica()); },
      onPick: (hit) => {
        if (hit.level === 'uf' || hit.level === 'brmun') { escolher(hit.level, hit.id); return; }
        ctl.select(hit.level, hit.id, { fit: !(hit.level === 'local' || hit.level === 'secao') });
      },
      onEmpty: () => {
        if (state.modo !== 'uf' || state.sel.level === 'estado') return;
        const pais = parentChain(state.sel.level, state.sel.id);
        const pai = pais[pais.length - 1] || { level: 'estado', id: 0 };
        ctl.select(pai.level, pai.id);
      },
      onView: () => { clsCache = new Map(); legenda(); },
      onMoveEnd: () => {
        const fino = ['local', 'secao'].includes(view.view?.want) || ['local', 'secao'].includes(state.mode);
        if (state.modo === 'uf' && (view.map.getZoom() >= 11 || fino)) carregarPolys(view.municipiosVisiveis());
      },
    });
    await view.init();
    await aplicarHash();
    $('loading').classList.add('done');
    setTimeout(() => $('loading')?.remove(), 500);
  } catch (err) {
    console.error(err);
    $('loading-t').textContent = `Não deu para carregar: ${err.message || err}`;
  }
}

// ------------------------------------------------------------------ topo, atalhos e redimensionamento
const busca = () => abrirBusca({ onLugar: (p) => escolher(p.level, p.id) });
$('brand-nerd').addEventListener('click', (e) => { e.preventDefault(); ctl.irBrasil(); });
$('uf-pill').addEventListener('click', () => { if (state.modo === 'uf') ctl.irBrasil(); else busca(); });
$('search-btn').addEventListener('click', busca);
$('btn-share').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); toast('Link copiado'); } catch { toast('Copie o endereço da barra do navegador'); }
});
addEventListener('hashchange', () => { if (!aplicandoHash) aplicarHash(); });
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); busca(); return; }
  if (e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey || buscaAberta()) return;
  const k = e.key.toLowerCase();
  if (k === '/') { e.preventDefault(); busca(); return; }
  if (/^[1-9]$/.test(k) && METRICAS[Number(k) - 1]) { ctl.setMetrica(METRICAS[Number(k) - 1].k); return; }
  if (k === 'f') { document.body.classList.toggle('focus'); setTimeout(() => view?.resize(), 30); return; }
  if (k === 'escape' && state.modo === 'uf') { if (state.sel.level !== 'estado') ctl.select('estado', 0); else ctl.irBrasil(); }
});
addEventListener('resize', () => { computeLayout(); medir(); view?.resize(); });
void BRASIL;
boot();

// Dados da página /nerd: carga sob demanda (Brasil → UF → pacote de municípios), geometria quantizada, hierarquia
// geográfica e índices seção → unidade. Adaptado de quem-vota-em-quem (js/data.js); formato em scripts/nerd_mapa.py.
// Tudo estático, do próprio site: nenhum pedido sai para fora.
import { norm } from './fmt.js';

export const VERSAO = 'nerd-2'; // mudar junto com o formato de /data/nerd/ (e o preload em nerd.html)
export const LEVELS = ['macro', 'municipio', 'zona', 'bairro', 'local', 'secao'];
export const LEVEL_INFO = {
  br: { label: 'Brasil', plural: 'Brasil' },
  estado: { label: 'Estado', plural: 'Estados' },
  uf: { label: 'Estado', plural: 'Estados' },
  brmun: { label: 'Município', plural: 'Municípios' },
  macro: { label: 'Região', plural: 'Regiões' },
  municipio: { label: 'Município', plural: 'Municípios' },
  zona: { label: 'Zona eleitoral', plural: 'Zonas' },
  bairro: { label: 'Bairro', plural: 'Bairros' },
  local: { label: 'Local de votação', plural: 'Locais' },
  secao: { label: 'Seção', plural: 'Seções' },
};
export const COLS = ['el', 'ap', 't', 'bio', 'fila', 'pico', 'ult'];

const get = (url) => fetch(`/data/nerd/${url}?v=${VERSAO}`).then((r) => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); });
const once = new Map();
/** fetch com memória: o mesmo arquivo nunca é pedido duas vezes. */
export const getOnce = (url) => { if (!once.has(url)) { const p = get(url); once.set(url, p); p.catch(() => once.delete(url)); } return once.get(url); };

/** Geometria quantizada → GeoJSON. Anéis: [x0, y0, dx1, dy1, ...] em inteiros na escala q. */
export function dq(g, q) {
  const polys = g.map((poly) => poly.map((ring) => {
    const out = [];
    let x = 0, y = 0;
    for (let i = 0; i < ring.length; i += 2) { x += ring[i]; y += ring[i + 1]; out.push([x / q, y / q]); }
    if (out.length) out.push(out[0]);
    return out;
  }));
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}
const fc = (features) => ({ type: 'FeatureCollection', features });
const feat = (geometry, properties) => ({ type: 'Feature', geometry, properties });

// ---------------------------------------------------------------- Brasil
// BR.st = números do Brasil (br.json); BR.mun = municípios (geo-mun.json + mun.json); BR.munStat: código → estatística
export const BR = { st: null, ufs: new Map(), states: null, mun: null, munStat: new Map(), munNome: new Map(), munUf: new Map() };

export async function loadBR() {
  const [st, g] = await Promise.all([getOnce('br.json'), getOnce('geo-uf.json')]);
  BR.st = st;
  BR.states = fc(g.uf.map(([uf, n, geo, lx, ly], i) => feat(dq(geo, g.q), { id: i + 1, uf, n, lx, ly, ...st.ufs[uf], ok: !!st.ufs[uf] })));
  for (const f of BR.states.features) BR.ufs.set(f.properties.uf, f.properties);
  return st;
}

/** Municípios do Brasil inteiro (mapa nacional e busca): depois do primeiro desenho. */
export async function loadBRMun() {
  if (BR.mun) return BR.mun;
  const [g, m] = await Promise.all([getOnce('geo-mun.json'), getOnce('mun.json')]);
  m.cd.forEach((cd, i) => {
    const x = {};
    for (const k of Object.keys(m)) x[k] = m[k][i];
    BR.munStat.set(cd, x);
    BR.munNome.set(cd, m.nome[i]);
    BR.munUf.set(cd, m.uf[i]);
  });
  BR.mun = fc(g.mun.map(([cd, uf, geo, lx, ly]) => feat(dq(geo, g.q), { id: cd, uf, n: BR.munNome.get(cd) || '', lx, ly, ...BR.munStat.get(cd) })));
  return BR.mun;
}

// ---------------------------------------------------------------- UF
export const D = {
  uf: null, base: null, meta: null, sec: null, n: 0, loc: null, nl: 0,
  lv: Object.fromEntries(LEVELS.map((l) => [l, { fc: null, byId: new Map(), ready: false }])),
  un: {}, secByLocal: null, munPolys: new Set(), nomes: null, ver: 0,
};

function resetUF() {
  D.munPolys = new Set(); D.nomes = null; D.un = {}; D.ver++;
  for (const l of LEVELS) D.lv[l] = { fc: null, byId: new Map(), ready: false };
  scopeCache.clear(); bboxCache.clear();
}

export async function loadUF(uf) {
  const b = await getOnce(`uf/${uf}/base.json`);
  await loadBRMun();
  resetUF();
  D.uf = uf; D.base = b;
  const est = BR.ufs.get(b.uf.toUpperCase()) || {};
  D.meta = { uf: b.uf, uf_nome: b.uf_nome, bounds: b.bounds, estado: est };
  const s = b.sec, n = s.li.length;
  D.n = n;
  D.sec = { li: Int32Array.from(s.li), nr: s.nr };
  for (const k of COLS) D.sec[k] = s[k];
  const L = b.loc;
  D.nl = L.mi.length;
  D.loc = { mi: L.mi, z: L.z, bi: L.bi, x: L.x.map((v) => v / 1e5), y: L.y.map((v) => v / 1e5), ns: L.ns };
  D.secByLocal = Array.from({ length: D.nl }, () => []);
  for (let i = 0; i < n; i++) D.secByLocal[D.sec.li[i]].push(i);
  D.pac = b.pac;
  setLevel('macro', b.macro.map(([id, nome, g, lx, ly]) => feat(dq(g, b.q), { id, n: nome, lx, ly })));
  setLevel('municipio', b.mun.map(([id, nome, rm, bb, g, lx, ly]) => feat(dq(g, b.q), { id, n: nome, rm, bb, lx, ly })));
  setLevel('local', Array.from({ length: D.nl }, (_, i) => feat(null, { id: i, i, mi: L.mi[i], z: L.z[i], bi: L.bi[i], ns: L.ns[i], n: `Local ${i + 1}` })));
  setLevel('secao', Array.from({ length: n }, (_, i) => feat(null, { id: i, i, li: D.sec.li[i], nr: s.nr[i], n: `Seção ${s.nr[i]}` })));
  buildUnits();
  return b;
}
function setLevel(level, features) {
  const L = D.lv[level];
  L.fc = fc(features);
  L.byId = new Map(features.map((f) => [f.properties.id, f]));
  L.ready = true;
}
/** Índices seção → unidade em cada nível (base de toda agregação e de todo recorte). */
function buildUnits() {
  const n = D.n, li = D.sec.li, L = D.loc;
  const rm = new Map(D.lv.municipio.fc.features.map((f) => [f.properties.id, f.properties.rm]));
  const de = {
    secao: (s) => s, local: (s) => li[s], municipio: (s) => L.mi[li[s]], macro: (s) => rm.get(L.mi[li[s]]),
    zona: (s) => L.z[li[s]], bairro: (s) => (L.bi[li[s]] >= 0 ? L.bi[li[s]] : null), estado: () => 0,
  };
  for (const [level, f] of Object.entries(de)) {
    const idx = new Int32Array(n), ids = [], pos = new Map();
    for (let s = 0; s < n; s++) {
      const id = f(s);
      if (id == null) { idx[s] = -1; continue; }
      let u = pos.get(id);
      if (u == null) { u = ids.length; ids.push(id); pos.set(id, u); }
      idx[s] = u;
    }
    D.un[level] = { idx, ids, pos };
  }
}
/** Zonas e bairros: em segundo plano, depois do primeiro desenho. */
export async function loadZB() {
  if (D.lv.zona.ready) return;
  const uf = D.uf, b = await getOnce(`uf/${uf}/zb.json`);
  if (uf !== D.uf) return;
  const q = D.base.q;
  setLevel('zona', b.zona.map(([id, nome, mn, g, lx, ly]) => feat(dq(g, q), { id, n: nome, mn, lx, ly })));
  const mn = new Map(D.lv.municipio.fc.features.map((f) => [f.properties.id, f.properties.n]));
  setLevel('bairro', b.bairro.map(([id, nome, mi, g, lx, ly]) => feat(dq(g, q), { id, n: nome, mi, mn: mn.get(mi) || '', lx, ly })));
  D.ver++;
}
/** Nomes, endereços e bairros dos locais (rótulos, dicas, busca, recordes). */
export async function loadNomes() {
  if (D.nomes) return D.nomes;
  const uf = D.uf, b = await getOnce(`uf/${uf}/nomes.json`);
  if (uf !== D.uf) return null;
  D.nomes = b.loc;
  for (const f of D.lv.local.fc.features) { const [n, e, bairro] = b.loc[f.properties.i] || []; Object.assign(f.properties, { n: n || f.properties.n, e: e || '', b: bairro || '' }); }
  return D.nomes;
}
/** Polígonos de locais e seções de um município (só ao aproximar), num pacote com vizinhos. True se chegou algo novo. */
export async function loadMunPolys(cd) {
  if (D.munPolys.has(cd)) return false;
  const k = D.pac[cd];
  if (k == null) { D.munPolys.add(cd); return false; }
  const uf = D.uf;
  const pk = await getOnce(`uf/${uf}/p${k}.json`);
  if (uf !== D.uf) return false;
  let novo = false;
  for (const [m, b] of Object.entries(pk.m)) {
    if (D.munPolys.has(+m)) continue;
    D.munPolys.add(+m);
    novo = true;
    b.li.forEach((i, j) => { const f = D.lv.local.byId.get(i); if (f) { f.geometry = dq(b.lg[j], pk.q); [f.properties.lx, f.properties.ly] = b.ll[j]; } });
    b.si.forEach((i, j) => { const f = D.lv.secao.byId.get(i); if (f) { f.geometry = dq(b.sg[j], pk.q); [f.properties.lx, f.properties.ly] = b.sl[j]; } });
  }
  return novo;
}
/** Só as feições com geometria (as dos municípios já carregados) vão para o mapa. */
export const comGeometria = (level) => fc(D.lv[level].fc.features.filter((f) => f.geometry));

// ---------------------------------------------------------------- entidades e recortes
export function getProps(level, id) {
  if (level === 'estado') return { id: 0, n: D.meta.uf_nome };
  if (level === 'uf') return BR.states?.features.find((f) => f.properties.id === id)?.properties || null;
  if (level === 'brmun') return BR.mun?.features.find((f) => f.properties.id === id)?.properties || null;
  return D.lv[level]?.byId.get(id)?.properties || null;
}
export const getFeature = (level, id) => D.lv[level]?.byId.get(id) || null;
export function entityName(level, p) {
  if (level === 'estado') return D.meta.uf_nome;
  if (level === 'secao') return `Seção ${p.nr}`;
  if (level === 'bairro') return `${p.n} · ${p.mn}`;
  if (level === 'local') return D.nomes ? p.n : `Local de votação`;
  return p.n;
}

const scopeCache = new Map();
export function secsOf(level, id) {
  const k = `${level}:${id}`;
  if (scopeCache.has(k)) return scopeCache.get(k);
  let out;
  if (level === 'estado') out = Int32Array.from({ length: D.n }, (_, i) => i);
  else if (level === 'local') out = Int32Array.from(D.secByLocal[id] || []);
  else if (level === 'secao') out = Int32Array.of(id);
  else {
    const u = D.un[level], g = u.pos.get(id), arr = [];
    for (let s = 0; s < D.n; s++) if (u.idx[s] === g) arr.push(s);
    out = Int32Array.from(arr);
  }
  scopeCache.set(k, out);
  return out;
}

/** Unidades de um nível dentro do recorte (null = todas). */
const recCache = new Map();
export function unidadesNoRecorte(level, sl, si) {
  if (sl === 'estado' || sl === 'br') return null;
  const k = `${D.ver}|${level}|${sl}:${si}`;
  if (recCache.has(k)) return recCache.get(k);
  const u = D.un[level];
  if (!u) return null;
  const set = new Set();
  for (const s of secsOf(sl, si)) { const g = u.idx[s]; if (g >= 0) set.add(u.ids[g]); }
  recCache.set(k, set);
  return set;
}

/** Município de uma entidade (para foco e para carregar polígonos). */
export function munOf(level, id) {
  if (level === 'municipio') return id;
  if (level === 'local') return D.loc.mi[id];
  if (level === 'secao') return D.loc.mi[D.sec.li[id]];
  if (level === 'bairro') return getProps('bairro', id)?.mi ?? null;
  return null;
}

export function focusGeometry(level, id) {
  if (level === 'estado') return null;
  if (level === 'local' || level === 'secao') return getFeature('municipio', munOf(level, id))?.geometry || null;
  return getFeature(level, id)?.geometry || null;
}

export function pointInGeometry(lng, lat, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    let inside = false;
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

export function bboxGeom(g) {
  let w = 181, s = 91, e = -181, n = -91;
  const walk = (c) => { if (typeof c[0] === 'number') { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; } else for (const x of c) walk(x); };
  walk(g.coordinates);
  return [[w, s], [e, n]];
}

const bboxCache = new Map();
export function bboxOf(level, id) {
  if (level === 'estado') return D.meta.bounds;
  if (level === 'uf' || level === 'brmun') { const f = (level === 'uf' ? BR.states : BR.mun)?.features.find((x) => x.properties.id === id); return f ? bboxGeom(f.geometry) : null; }
  const k = `${level}:${id}`;
  if (bboxCache.has(k)) return bboxCache.get(k);
  const f = getFeature(level, id);
  let b = null;
  if (f?.geometry) b = bboxGeom(f.geometry);
  else if (level === 'local') { const x = D.loc.x[id], y = D.loc.y[id]; b = [[x - 0.004, y - 0.004], [x + 0.004, y + 0.004]]; }
  else if (level === 'secao') return bboxOf('local', D.sec.li[id]);
  if (b && f?.geometry) bboxCache.set(k, b);
  return b;
}

export function parentChain(level, id) {
  const chain = [{ level: 'br', id: 0, name: 'Brasil' }, { level: 'estado', id: 0, name: D.meta.uf_nome }];
  const p = getProps(level, id);
  if (!p || level === 'estado') return chain;
  const add = (lv, i) => { const q = getProps(lv, i); if (q) chain.push({ level: lv, id: i, name: entityName(lv, q) }); };
  const mun = (mi) => { const m = getProps('municipio', mi); if (!m) return; add('macro', m.rm); add('municipio', mi); };
  switch (level) {
    case 'municipio': add('macro', p.rm); break;
    case 'bairro': mun(p.mi); break;
    case 'local': mun(p.mi); if (p.bi >= 0) add('bairro', p.bi); break;
    case 'secao': { const l = getProps('local', p.li); if (l) { mun(l.mi); if (l.bi >= 0) add('bairro', l.bi); add('local', l.i); } break; }
    default: break;
  }
  return chain;
}

/** Subunidades de um recorte (ranking). */
export function childrenOf(level, id) {
  const all = (lv) => (D.lv[lv].ready ? D.lv[lv].fc.features.map((f) => f.properties) : []);
  switch (level) {
    case 'estado': return { level: 'municipio', items: all('municipio') };
    case 'macro': return { level: 'municipio', items: all('municipio').filter((p) => p.rm === id) };
    case 'municipio': {
      const m = getProps('municipio', id);
      if (m.bb && D.lv.bairro.ready) return { level: 'bairro', items: all('bairro').filter((p) => p.mi === id) };
      return { level: 'local', items: all('local').filter((p) => p.mi === id) };
    }
    case 'zona': return { level: 'local', items: all('local').filter((p) => p.z === id) };
    case 'bairro': return { level: 'local', items: all('local').filter((p) => p.bi === id) };
    case 'local': return { level: 'secao', items: (D.secByLocal[id] || []).map((s) => D.lv.secao.byId.get(s).properties) };
    default: return { level: null, items: [] };
  }
}

// ---------------------------------------------------------------- busca de lugares
/** Estados e municípios do Brasil (qualquer tela) e, dentro de um estado, regiões, bairros, zonas e locais. */
export function searchPlaces(q, limit = 10) {
  const s = norm(q);
  if (!s) return [];
  const hits = [];
  const casa = (texto) => { const k = norm(texto), i = k.indexOf(s); return i < 0 ? -1 : i === 0 ? 0 : k[i - 1] === ' ' ? 1 : 2; };
  for (const [uf, p] of BR.ufs) { const sc = casa(`${p.n} ${uf}`); if (sc >= 0) hits.push({ level: 'uf', id: p.id, uf, name: p.n, sub: 'Estado', peso: 1e9, sc }); }
  for (const [cd, nome] of BR.munNome) {
    const sc = casa(nome);
    if (sc >= 0) hits.push({ level: 'brmun', id: cd, uf: BR.munUf.get(cd), name: nome, sub: `Município · ${BR.munUf.get(cd)}`, peso: BR.munStat.get(cd)?.el || 0, sc: sc * 10 + (D.uf && BR.munUf.get(cd) === D.uf.toUpperCase() ? 0 : 1) });
  }
  if (D.uf) {
    for (const lv of ['bairro', 'zona', 'local']) {
      if (!D.lv[lv].ready || (lv === 'local' && !D.nomes)) continue;
      for (const f of D.lv[lv].fc.features) {
        const p = f.properties;
        const sub = lv === 'bairro' ? p.mn : lv === 'local' ? `${getProps('municipio', p.mi)?.n || ''}${p.b ? ` · ${p.b}` : ''}` : p.mn || '';
        const sc = casa(`${p.n} ${sub}`);
        if (sc >= 0) hits.push({ level: lv, id: p.id, name: p.n, sub: `${LEVEL_INFO[lv].label} · ${sub}`, peso: p.ns || 0, sc: sc * 10 + 5 });
      }
    }
  }
  hits.sort((a, b) => a.sc - b.sc || b.peso - a.peso);
  return hits.slice(0, limit);
}

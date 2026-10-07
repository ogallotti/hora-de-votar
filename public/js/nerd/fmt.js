// Formatação pt-BR e helper de DOM (de quem-vota-em-quem). Todo texto vindo dos dados entra via textContent (nunca innerHTML).
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fInt = (n) => (n == null || !isFinite(n) ? '—' : nf0.format(Math.round(n)));
export const fSigned = (n) => (n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + nf0.format(Math.abs(Math.round(n))));

export function fPct(x) {
  if (x == null || !isFinite(x)) return '—';
  if (x === 0) return '0%';
  if (x < 0.01) return '<0,01%';
  return (x < 1 ? nf2.format(x) : nf1.format(x)) + '%';
}

export function fMult(x) {
  if (x == null || !isFinite(x)) return '—';
  return (x >= 10 ? nf0.format(x) : nf1.format(x)) + '×';
}

export function fCompact(n) {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  const trim = (x) => x.replace(/,0$/, '');
  if (a >= 1e6) return trim(nf1.format(n / 1e6)) + ' mi';
  if (a >= 1e4) return trim(nf1.format(n / 1e3)) + ' mil';
  return nf0.format(Math.round(n));
}

export const ord = (n) => (n > 0 ? n + 'º' : '—');

export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** h('div', {class:'x', onclick}, 'texto', outroNo) — cria elementos sem innerHTML. */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const svg = (tag, attrs, ...kids) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

/** Segundos → "1min16" / "45 s". */
export function duracao(s) {
  if (s == null || !isFinite(s)) return '—';
  s = Math.round(s);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m}min${String(r).padStart(2, '0')}` : `${m} min`;
}
/** Faixa de 10 min desde as 8h de Brasília → "11h20". */
export function hora(i) {
  if (i == null) return '—';
  const min = 8 * 60 + Math.round(i) * 10, h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}
/** Segundos desde 0h → "17h42". */
export function relogio(s) {
  if (s == null) return '—';
  const m = Math.round(s / 60), h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}
/** Duração longa → "8h30" / "40 min". */
export function horasMin(s) {
  const m = Math.round(s / 60), h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`) : `${r} min`;
}
export function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

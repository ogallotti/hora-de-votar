// Busca de lugares (paleta): estados e municípios do Brasil e, dentro de um estado, bairros, zonas e locais.
// Teclado: ↑ ↓ para andar, Enter escolhe, Esc fecha. Estrutura da paleta do quem-vota-em-quem (js/busca.js).
import { searchPlaces } from './dados.js';
import { clear, h, svg } from './fmt.js';

let aberto = null;
export const buscaAberta = () => !!aberto;
export function fecharBusca() {
  if (!aberto) return;
  aberto.el.remove();
  aberto.foco?.focus?.();
  aberto = null;
}
const lupa = () => svg('svg', { viewBox: '0 0 20 20', width: 16, height: 16, 'aria-hidden': 'true' }, svg('circle', { cx: 8.5, cy: 8.5, r: 5.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }), svg('path', { d: 'M13 13l4 4', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
const xis = () => svg('svg', { viewBox: '0 0 20 20', width: 16, height: 16, 'aria-hidden': 'true' }, svg('path', { d: 'M5 5l10 10M15 5L5 15', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
export const iconeBusca = lupa;

export function abrirBusca({ onLugar, texto = '' }) {
  fecharBusca();
  const foco = document.activeElement;
  let sel = 0, itens = [];
  const input = h('input', { class: 'pal-q', type: 'search', placeholder: 'Cidade, escola, bairro ou seção (ex.: 410 são luís)', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Buscar lugar', value: texto });
  const lista = h('div', { class: 'pal-list', role: 'listbox' });
  const pal = h('div', { class: 'pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Buscar lugar' },
    h('div', { class: 'pal-h' }, lupa(), input, h('button', { class: 'pal-x', type: 'button', onclick: fecharBusca, 'aria-label': 'Fechar' }, xis())),
    lista,
    h('div', { class: 'pal-foot' }, h('span', null, h('kbd', null, '↑↓'), 'andar'), h('span', null, h('kbd', null, 'Enter'), 'escolher'), h('span', null, h('kbd', null, 'Esc'), 'fechar')));
  const el = h('div', { class: 'pal-bg', onclick: (e) => { if (e.target === el) fecharBusca(); } }, pal);
  document.getElementById('app').append(el);
  aberto = { el, foco };

  const escolher = (it) => { if (!it) return; fecharBusca(); onLugar?.(it); };
  function mover(i) {
    if (i === sel || !itens[i]) return;
    itens[sel]?.el.setAttribute('aria-selected', 'false');
    sel = i;
    itens[sel].el.setAttribute('aria-selected', 'true');
  }
  function draw() {
    const q = input.value.trim();
    clear(lista);
    itens = []; sel = 0;
    if (!q) { lista.append(h('div', { class: 'pal-vazio' }, 'Digite um estado, cidade, bairro, escola ou o número da seção (ex.: zona 3 seção 410 são luís).')); return; }
    for (const p of searchPlaces(q, 14)) {
      const i = itens.length;
      const it = { ...p, el: h('button', { type: 'button', role: 'option', class: 'row', 'aria-selected': String(i === sel), onclick: () => escolher(itens[i]), onmousemove: () => mover(i) },
        h('span', { class: 'sw sw-lugar' }), h('span', { class: 'row-n' }, h('b', null, p.name), h('span', null, p.sub)), h('span')) };
      itens.push(it);
      lista.append(it.el);
    }
    if (!itens.length) lista.append(h('div', { class: 'pal-vazio' }, 'Nada encontrado. Locais de votação aparecem depois de abrir o estado.'));
    else itens[0].el.setAttribute('aria-selected', 'true');
  }
  input.addEventListener('input', draw);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!itens.length) return;
      mover((sel + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length);
      itens[sel].el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); escolher(itens[sel]); }
    else if (e.key === 'Escape') fecharBusca();
  });
  draw();
  setTimeout(() => input.focus(), 0);
}

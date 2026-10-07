// Cor de cada coluna do 2º turno: vermelho 100% saturado na pior hora, verde 100% saturado na melhor e um cinza
// neutro no meio (escala divergente). Mistura em OKLab para a transição ficar uniforme aos olhos.
// Pura: usada no gráfico, nos stories e na imagem de prévia (borda).
import { suaviza, OFICIAIS } from "./modelo.js";

export const VERDE = "#0fa84f", NEUTRO = "#a3aba6", VERMELHO = "#e23a2e";

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const gam = (c) => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
function paraLab(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function deLab([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return `#${[r, g, b].map((c) => gam(c).toString(16).padStart(2, "0")).join("")}`;
}
const LAB = { v: paraLab(VERDE), n: paraLab(NEUTRO), r: paraLab(VERMELHO) };
const mistura = (a, b, k) => deLab(a.map((x, i) => x + (b[i] - x) * k));

/** t de 0 (melhor) a 1 (pior) → cor. */
export function cor(t) {
  const k = Math.max(0, Math.min(1, t));
  return k < 0.5 ? mistura(LAB.v, LAB.n, k / 0.5) : mistura(LAB.n, LAB.r, (k - 0.5) / 0.5);
}

/** Quão ruim é cada faixa oficial, de 0 (melhor) a 1 (pior), pela chance de fila suavizada do 2º turno.
 *  Os extremos são a média da melhor e da pior janela de 1 h (r2 de horarios()), para a cor bater com a recomendação:
 *  o melhor horário fica no verde cheio e a faixa "evite" no vermelho cheio.
 *  Dia sem diferença real (menos de 8 pontos entre a melhor e a pior janela): tudo neutro (0,5). */
export function notas(o2, r2) {
  const so = suaviza(o2.slice(0, OFICIAIS));
  const min = r2?.mMelhor ?? Math.min(...so), max = r2?.mPior ?? Math.max(...so);
  if (max - min < 8) return so.map(() => 0.5);
  return so.map((x) => Math.max(0, Math.min(1, (x - min) / (max - min))));
}

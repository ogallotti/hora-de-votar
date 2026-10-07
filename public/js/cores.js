// Cor de cada coluna do 2º turno, como um semáforo: verde na melhor hora, amarelo e laranja no caminho, vermelho na
// pior. Mistura em OKLab entre cores vizinhas, para a transição ficar natural aos olhos.
// Pura: usada no gráfico, nos stories e na imagem de prévia (borda).
import { suaviza, OFICIAIS, JANELA } from "./modelo.js";

export const ESCALA = ["#0fa84f", "#eab308", "#f28a1f", "#e23a2e"]; // verde, amarelo, laranja, vermelho (0 → 1)
export const GRADIENTE = `linear-gradient(90deg, ${[...ESCALA].reverse().join(", ")})`; // da legenda: pior → melhor

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
const LAB = ESCALA.map(paraLab);
const mistura = (a, b, k) => deLab(a.map((x, i) => x + (b[i] - x) * k));

/** t de 0 (melhor) a 1 (pior) → cor. */
export function cor(t) {
  const k = Math.max(0, Math.min(1, t)) * (LAB.length - 1), i = Math.min(LAB.length - 2, Math.floor(k));
  return mistura(LAB[i], LAB[i + 1], k - i);
}

/** Quão ruim é cada faixa oficial, de 0 (melhor) a 1 (pior), pela chance de fila suavizada do 2º turno, entre a faixa
 *  mais calma e a mais cheia do dia: o vermelho cheio fica só no pico. O verde cheio fica só no melhor horário
 *  (r2.melhor, a janela recomendada); fora dele, nada passa de VERDE_FORA, para a cor nunca contradizer a recomendação.
 *  Dia sem diferença real (menos de 8 pontos entre a faixa mais calma e a mais cheia): verde claro, com o melhor cheio. */
const VERDE_FORA = 0.14;
export function notas(o2, r2) {
  const so = suaviza(o2.slice(0, OFICIAIS));
  const min = Math.min(...so), max = Math.max(...so);
  const noMelhor = (i) => r2?.melhor != null && i >= r2.melhor && i < r2.melhor + JANELA;
  return so.map((x, i) => {
    if (noMelhor(i)) return 0;
    if (max - min < 8) return VERDE_FORA;
    return Math.max(VERDE_FORA, (x - min) / (max - min));
  });
}

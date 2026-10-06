// Modelo do site: curvas por faixa de 15 min, simulação do 2º turno e recomendação de horário.
// Funções puras (sem DOM): rodam no navegador e nos testes (node --test).

export const FAIXA_MIN = 15;
export const OFICIAIS = 36; // 9 h de votação (8h às 17h de Brasília, na hora local da urna)
const MESA_PADRAO = 20;     // s entre um eleitor sair e o próximo ser identificado, quando há fila
const JANELA = 4;           // 4 faixas = 1 h

/**
 * Simula o 2º turno numa urna.
 * Hipótese simples: a procura de cada faixa é a mesma do 1º turno. Ela é o maior de dois números:
 *   (a) quantos começaram a votar na faixa (quem votou depois do encerramento já estava na fila: volta à última hora);
 *   (b) a % que pegou fila vezes a capacidade da urna no 1º turno. Com fila, (a) fica preso à capacidade e subestima
 *       a procura; numa fila simples, a chance de esperar é a ocupação, então (b) recupera essa pressão.
 * A fila é simulada minuto a minuto com o tempo de urna do 2º turno (t2, medido na seção) mais o tempo de mesa (me).
 *
 * @param {number[]} v   eleitores que começaram a votar em cada faixa no 1º turno (por urna)
 * @param {number} t2    segundos de urna por eleitor no 2º turno (estimativa medida)
 * @param {number} [me]  segundos de mesa entre eleitores
 * @param {number[]} [f1] % de eleitores que pegaram fila em cada faixa no 1º turno
 * @param {number} [t1]  segundos de urna por eleitor no 1º turno
 * @returns {{o: number[], espera: number[]}} ocupação (% do tempo da faixa) e espera média (min) por faixa.
 *   Numa fila simples, a chance de quem chega encontrar a urna ocupada é a ocupação: por isso o comparamos com a
 *   % de eleitores que pegaram fila no 1º turno.
 */
export function simula2(v, t2, me = MESA_PADRAO, f1 = null, t1 = null) {
  const s = Math.max(10, t2 + (me ?? MESA_PADRAO));
  const chegadas = demanda(v);
  if (f1 && t1) {
    const cap1 = (FAIXA_MIN * 60) / (t1 + (me ?? MESA_PADRAO)); // eleitores por faixa no 1º turno
    for (let k = 0; k < chegadas.length; k++) chegadas[k] = Math.max(chegadas[k], ((f1[k] || 0) / 100) * cap1);
  }
  const cap = 60 / s; // eleitores por minuto
  const o = [], espera = [];
  let fila = 0;
  for (let k = 0; k < chegadas.length || fila > 0.01; k++) {
    const porMin = (chegadas[k] || 0) / FAIXA_MIN;
    let ocupado = 0, esp = 0;
    for (let m = 0; m < FAIXA_MIN; m++) {
      fila += porMin;
      const atendidos = Math.min(fila, cap);
      fila -= atendidos;
      ocupado += atendidos * s;
      esp += fila / cap; // minutos que quem chega agora espera
    }
    o.push(Math.min(100, Math.round((100 * ocupado) / (FAIXA_MIN * 60))));
    espera.push(esp / FAIXA_MIN);
    if (k > OFICIAIS + 24) break; // segurança
  }
  return { o, espera };
}

/** Chegadas por faixa oficial: o 1º turno, com quem votou depois do encerramento devolvido à última hora. */
export function demanda(v) {
  const d = v.slice(0, OFICIAIS);
  while (d.length < OFICIAIS) d.push(0);
  const depois = v.slice(OFICIAIS).reduce((a, b) => a + b, 0);
  if (depois > 0) {
    const ult = d.slice(OFICIAIS - JANELA);
    const tot = ult.reduce((a, b) => a + b, 0);
    for (let i = 0; i < JANELA; i++) {
      d[OFICIAIS - JANELA + i] += tot > 0 ? (depois * ult[i]) / tot : depois / JANELA;
    }
  }
  return d;
}

/**
 * % de eleitores que pegaram fila em cada faixa (1º turno, medido): soma q e v das faixas vizinhas antes de dividir,
 * porque numa urna cada faixa de 15 min tem poucos eleitores. Faixa sem ninguém votando = urna livre (0%).
 */
export function chanceFila(v, q, r = 1) {
  return v.map((_, i) => {
    let sq = 0, sv = 0;
    for (let j = i - r; j <= i + r; j++) if (j >= 0 && j < v.length) { sq += q[j] || 0; sv += v[j] || 0; }
    return sv ? Math.round((100 * sq) / sv) : 0;
  });
}

/** Média móvel centrada (3 faixas), para a recomendação não depender de uma faixa isolada. */
export function suaviza(xs, r = 1) {
  return xs.map((_, i) => {
    let s = 0, n = 0;
    for (let j = i - r; j <= i + r; j++) if (j >= 0 && j < xs.length) { s += xs[j]; n++; }
    return s / n;
  });
}

/**
 * Melhor e pior hora cheia dentro do horário oficial (janela de 1 h que começa em qualquer faixa).
 * Termina no máximo 15 min antes do encerramento: chegar em cima da hora é arriscado.
 */
export function horarios(o) {
  const so = suaviza(o.slice(0, OFICIAIS).concat(Array(Math.max(0, OFICIAIS - o.length)).fill(0)));
  const ultimaIni = OFICIAIS - JANELA - 1;
  let melhor = 0, pior = 0, mMelhor = Infinity, mPior = -Infinity;
  for (let i = 0; i <= ultimaIni; i++) {
    const m = so.slice(i, i + JANELA).reduce((a, b) => a + b, 0) / JANELA;
    if (m < mMelhor - 0.5) { mMelhor = m; melhor = i; } // empate: o mais cedo
    if (m > mPior + 0.5) { mPior = m; pior = i; }
  }
  return { melhor, pior, mMelhor, mPior };
}

/** Faixa i → "13h15" na hora local, a partir da hora de abertura h0. */
export function hora(i, h0 = 8) {
  const min = h0 * 60 + i * FAIXA_MIN;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** Segundos → "1min54" / "45 s". */
export function duracao(s) {
  if (s == null) return "";
  s = Math.round(s);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m}min${String(r).padStart(2, "0")}` : `${m} min`;
}

/** Quantas vezes mais rápido a fila anda no 2º turno (eleitor + mesa). */
export function fator(t1, t2, me = MESA_PADRAO) {
  if (!t1 || !t2) return null;
  const m = me ?? MESA_PADRAO;
  return (t1 + m) / (t2 + m);
}

/** Tudo o que a tela de resultado precisa para uma urna (seção) ou média de urnas (local/município). */
export function analisa(d, h0 = 8) {
  const ns = d.ns || 1;
  const v = d.v.map((x) => x / ns); // por urna
  const o1 = chanceFila(d.v, d.q, ns > 1 ? 1 : 2);
  const t2 = d.t2 ?? (d.t1 ? d.t1 * 0.4 : 40);
  const { o: sim, espera } = simula2(v, t2, d.me, o1, d.t1);
  const o2 = suaviza(sim).map(Math.round);
  const r1 = horarios(o1), r2 = horarios(o2);
  const cheio1 = o1.slice(0, OFICIAIS).filter((x) => x >= 75).length; // faixas em que 3 de 4 pegaram fila
  return {
    h0, o1, o2, espera, r1, r2,
    t1: d.t1, t2: d.t2, me: d.me, n: d.n,
    fator: fator(d.t1, t2, d.me),
    horasFila1: (cheio1 * FAIXA_MIN) / 60,
    filaODia: r1.mMelhor >= 70,
  };
}

// Modelo do site: curvas por faixa de 15 min, simulação do 2º turno e recomendação de horário.
// Funções puras (sem DOM): rodam no navegador e nos testes (node --test).

export const FAIXA_MIN = 15;
/** UFs com 2º turno para governador em 2026 (resultado oficial do 1º turno); nas demais, só presidente. */
export const GOV2 = ["AC", "AM", "DF", "ES", "RJ", "RN", "TO"];
export const OFICIAIS = 36; // 9 h de votação (8h às 17h de Brasília, na hora local da urna)
const MESA_PADRAO = 20;     // s entre um eleitor sair e o próximo ser identificado, quando há fila
const JANELA = 4;           // 4 faixas = 1 h

/**
 * Procura (chegadas) de cada faixa oficial numa urna, a mesma do 1º turno. Simples:
 *   - Urna sem fila: chegar = começar a votar. Usa quantos começaram em cada faixa (quem votou depois do
 *     encerramento já estava na fila: volta às 2 últimas horas).
 *   - Urna no limite: começar a votar fica preso à capacidade e não diz quando as pessoas chegaram. Aí os eleitores
 *     da urna são distribuídos pelo perfil de chegada das seções sem fila do mesmo estado (perfil, soma 1).
 *   Na proporção w das faixas em que a urna ficou no limite (% com fila ≥ 90: quase todos esperaram).
 * Sem perfil, cai para o maior entre quem começou e a % com fila vezes a capacidade do 1º turno.
 */
export function procura(v, f1, perfil, t1, me = MESA_PADRAO) {
  const base = demanda(v);
  const w = f1.slice(0, OFICIAIS).filter((x) => x >= 90).length / OFICIAIS;
  if (perfil && w > 0) {
    const n = base.reduce((a, b) => a + b, 0);
    return base.map((x, k) => (1 - w) * x + w * n * (perfil[k] || 0));
  }
  if (t1) {
    const cap1 = (FAIXA_MIN * 60) / (t1 + (me ?? MESA_PADRAO));
    return base.map((x, k) => Math.max(x, ((f1[k] || 0) / 100) * cap1));
  }
  return base;
}

/**
 * Simula o 2º turno numa urna: fila minuto a minuto com as chegadas de cada faixa e o tempo de urna do 2º turno
 * (t2, medido na seção) mais o tempo de mesa (me).
 * @returns {{o: number[], espera: number[]}} ocupação (% do tempo da faixa) e espera média (min) por faixa.
 *   Numa fila simples, a chance de quem chega encontrar a urna ocupada é a ocupação: por isso a comparamos com a
 *   % de eleitores que pegaram fila no 1º turno.
 */
export function simula2(chegadas, t2, me = MESA_PADRAO) {
  const s = Math.max(10, t2 + (me ?? MESA_PADRAO));
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

const FIM = 8; // 2 h finais, onde entra quem já estava na fila no encerramento

/** Chegadas por faixa oficial: o 1º turno, com quem votou depois do encerramento devolvido às 2 últimas horas. */
export function demanda(v) {
  const d = v.slice(0, OFICIAIS);
  while (d.length < OFICIAIS) d.push(0);
  const depois = v.slice(OFICIAIS).reduce((a, b) => a + b, 0);
  if (depois > 0) {
    const ult = d.slice(OFICIAIS - FIM);
    const tot = ult.reduce((a, b) => a + b, 0);
    for (let i = 0; i < FIM; i++) {
      d[OFICIAIS - FIM + i] += tot > 0 ? (depois * ult[i]) / tot : depois / FIM;
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
 * Melhor e pior hora cheia dentro do horário oficial (janela de 1 h que começa em qualquer faixa), e a segunda
 * melhor sem sobrepor a primeira (para não mandar todo mundo para o mesmo horário).
 * Termina no máximo 15 min antes do encerramento: chegar em cima da hora é arriscado.
 */
export function horarios(o) {
  const so = suaviza(o.slice(0, OFICIAIS).concat(Array(Math.max(0, OFICIAIS - o.length)).fill(0)));
  const ultimaIni = OFICIAIS - JANELA - 1;
  const media = (i) => so.slice(i, i + JANELA).reduce((a, b) => a + b, 0) / JANELA;
  let melhor = 0, pior = 0, mMelhor = Infinity, mPior = -Infinity;
  for (let i = 0; i <= ultimaIni; i++) {
    const m = media(i);
    if (m < mMelhor - 0.5) { mMelhor = m; melhor = i; } // empate: o mais cedo
    if (m > mPior + 0.5) { mPior = m; pior = i; }
  }
  let segundo = null, mSegundo = Infinity;
  for (let i = 0; i <= ultimaIni; i++) {
    if (Math.abs(i - melhor) < JANELA) continue;
    const m = media(i);
    if (m < mSegundo - 0.5) { mSegundo = m; segundo = i; }
  }
  return { melhor, pior, mMelhor, mPior, segundo, mSegundo };
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
export function analisa(d, h0 = 8, perfil = null) {
  const ns = d.ns || 1;
  const v = d.v.map((x) => x / ns); // por urna
  const o1 = chanceFila(d.v, d.q, ns > 1 ? 1 : 2);
  const t2 = d.t2 ?? (d.t1 ? d.t1 * 0.4 : 40);
  const { o: sim, espera } = simula2(procura(v, o1, perfil, d.t1, d.me), t2, d.me);
  const o2 = suaviza(sim).map(Math.round);
  const r1 = horarios(o1), r2 = horarios(o2);
  const cheio1 = o1.slice(0, OFICIAIS).filter((x) => x >= 75).length; // faixas em que 3 de 4 pegaram fila
  return {
    h0, o1, o2, espera, r1, r2,
    t1: d.t1, t2: d.t2, me: d.me, n: d.n,
    fator: fator(d.t1, t2, d.me),
    horasFila1: (cheio1 * FAIXA_MIN) / 60,
    media1: o1.slice(0, OFICIAIS).reduce((x, y) => x + y, 0) / OFICIAIS, // % média com fila no 1º turno
    filaODia: r1.mMelhor >= 70,
  };
}

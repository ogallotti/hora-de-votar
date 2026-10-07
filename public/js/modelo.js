// Modelo do site: curvas por faixa de FAIXA_MIN minutos, simulação do 2º turno e recomendação de horário.
// Funções puras (sem DOM): rodam no navegador e nos testes (node --test).

export const FAIXA_MIN = 10; // mudar junto com FAIXA no build (scripts/build_data.py) e VERSAO_DADOS em app.js
/** UFs com 2º turno para governador em 2026 (resultado oficial do 1º turno); nas demais, só presidente. */
export const GOV2 = ["AC", "AM", "DF", "ES", "RJ", "RN", "TO"];
export const OFICIAIS = 540 / FAIXA_MIN; // 9 h de votação (8h às 17h de Brasília, na hora local da urna)
const MESA_PADRAO = 20;     // s entre um eleitor sair e o próximo ser identificado, quando há fila
export const JANELA = 60 / FAIXA_MIN; // 1 h

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
    if (k > OFICIAIS + 360 / FAIXA_MIN) break; // segurança
  }
  return { o, espera };
}

const FIM = 120 / FAIXA_MIN; // 2 h finais, onde entra quem já estava na fila no encerramento

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
 * porque numa urna cada faixa tem poucos eleitores. Faixa sem ninguém votando = urna livre (0%).
 */
export function chanceFila(v, q, r = Math.max(1, Math.round(15 / FAIXA_MIN))) {
  return v.map((_, i) => {
    let sq = 0, sv = 0;
    for (let j = i - r; j <= i + r; j++) if (j >= 0 && j < v.length) { sq += q[j] || 0; sv += v[j] || 0; }
    return sv ? Math.round((100 * sq) / sv) : 0;
  });
}

/** Média móvel centrada (±15 min), para a recomendação não depender de uma faixa isolada. */
export function suaviza(xs, r = Math.max(1, Math.round(15 / FAIXA_MIN))) {
  return xs.map((_, i) => {
    let s = 0, n = 0;
    for (let j = i - r; j <= i + r; j++) if (j >= 0 && j < xs.length) { s += xs[j]; n++; }
    return s / n;
  });
}

/**
 * Melhor e pior hora cheia dentro do horário oficial (janela de 1 h que começa em qualquer faixa), e a segunda pior
 * sem sobrepor a primeira (as duas formam a faixa "evite").
 * Termina no máximo 15 min antes do encerramento: chegar em cima da hora é arriscado.
 */
export function horarios(o) {
  const so = suaviza(o.slice(0, OFICIAIS).concat(Array(Math.max(0, OFICIAIS - o.length)).fill(0)));
  const ultimaIni = OFICIAIS - JANELA - Math.ceil(15 / FAIXA_MIN); // termina pelo menos 15 min antes do encerramento
  const media = (i) => so.slice(i, i + JANELA).reduce((a, b) => a + b, 0) / JANELA;
  let melhor = 0, pior = 0, mMelhor = Infinity, mPior = -Infinity;
  for (let i = 0; i <= ultimaIni; i++) {
    const m = media(i);
    if (m < mMelhor - 0.5) { mMelhor = m; melhor = i; } // empate: o mais cedo
    if (m > mPior + 0.5) { mPior = m; pior = i; }
  }
  let pior2 = null, mPior2 = -Infinity;
  for (let i = 0; i <= ultimaIni; i++) {
    if (Math.abs(i - pior) < JANELA) continue;
    const m = media(i);
    if (m > mPior2 + 0.5) { mPior2 = m; pior2 = i; }
  }
  return { melhor, pior, mMelhor, mPior, pior2, mPior2 };
}

/**
 * Espera média estimada (s) numa fila com uma urna, pela fórmula de Pollaczek-Khinchine (chegadas ao acaso):
 *   espera = ρ / (1 − ρ) × (1 + cs²) / 2 × S
 * ρ = ocupação da urna (no 1º turno, a % que pegou fila: numa fila simples, a chance de esperar é a ocupação),
 * S = tempo de cada eleitor (urna + mesa), cs² = variabilidade desse tempo (0,3: uns rápidos, outros lentos).
 * ρ fica limitado a 0,97: perto de 1 a fórmula explode e o site diz só "mais de 30 min".
 */
export function espera(rho, S, cs2 = 0.3) {
  const r = Math.min(0.97, Math.max(0, rho));
  return r <= 0 || !S ? 0 : (r / (1 - r)) * ((1 + cs2) / 2) * S;
}

/** Segundos de espera → "quase nada", "40 s", "8 min", "mais de 30 min". */
export function minutos(s) {
  if (s < 10) return "quase nada";
  if (s < 55) return `${Math.round(s / 10) * 10} s`;
  if (s > 1800) return "mais de 30 min";
  return `${Math.round(s / 60)} min`;
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

/**
 * Tudo o que a tela de resultado precisa para uma urna (seção) ou média de urnas (local/município).
 * cal (opcional, por UF, medido no 1º × 2º turno de 2022): comp = eleitores do 2º turno / do 1º; kt2 = tempo real de
 * urna no 2º turno / o estimado pelo 1º; kme = tempo de mesa do 2º / do 1º; perfil2 = horário de chegada no 2º turno;
 * sempre = usar perfil2 para toda a procura (não só onde a urna ficou no limite); krho = fator de nível da fila do 2º.
 */
export function analisa(d, h0 = 8, perfil = null, cal = null) {
  const ns = d.ns || 1;
  const comp = cal?.comp ?? 1;
  const v = d.v.map((x) => (x / ns) * comp); // por urna, já com a variação de comparecimento do 2º turno
  const o1 = chanceFila(d.v, d.q, Math.max(1, Math.round((ns > 1 ? 15 : 30) / FAIXA_MIN))); // ±15 min num local, ±30 min numa urna só
  const t2 = (d.t2 ?? (d.t1 ? d.t1 * 0.4 : 40)) * (cal?.kt2 ?? 1);
  const me2 = (d.me ?? MESA_PADRAO) * (cal?.kme ?? 1);
  const perfilChegada = cal?.perfil2 || perfil;
  const chegadas = cal?.sempre && perfilChegada
    ? (() => { const n = demanda(v).reduce((a, b) => a + b, 0); return perfilChegada.map((p) => n * p); })()
    : procura(v, o1, perfilChegada, d.t1, d.me);
  const { o: sim } = simula2(chegadas, t2, me2);
  // nível: a fila simulada supõe chegadas ao acaso; as pessoas chegam mais em grupo. krho (medido em 2022) corrige.
  const o2 = suaviza(sim).map((x) => Math.min(100, Math.round(x * (cal?.krho ?? 1))));
  const r1 = horarios(o1), r2 = horarios(o2);
  const me = d.me ?? MESA_PADRAO;
  const w1 = o1.map((x) => espera(x / 100, (d.t1 || 0) + me));
  const w2 = o2.map((x) => espera(x / 100, t2 + me2));
  const cheio1 = o1.slice(0, OFICIAIS).filter((x) => x >= 75).length; // faixas em que 3 de 4 pegaram fila
  return {
    h0, o1, o2, w1, w2, r1, r2,
    t1: d.t1, t2: Math.round(t2), me: d.me, me2: Math.round(me2), n: d.n,
    // tempo total na seção, da chegada à saída: espera média + mesa + urna (o que a pessoa sente)
    total1: w1.map((w) => w + (d.t1 || 0) + me),
    total2: w2.map((w) => w + t2 + me2),
    // espera de quem pega fila (a média acima inclui quem chega e é chamado na hora)
    seFila2: w2.map((w, i) => (o2[i] > 0 ? w / (o2[i] / 100) : 0)),
    fator: d.t1 ? (d.t1 + me) / (t2 + me2) : null,
    horasFila1: (cheio1 * FAIXA_MIN) / 60,
    media1: o1.slice(0, OFICIAIS).reduce((x, y) => x + y, 0) / OFICIAIS, // % média com fila no 1º turno
    filaODia: r1.mMelhor >= 70,
  };
}

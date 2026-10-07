import test from "node:test";
import assert from "node:assert/strict";
import { espera, minutos, simula2, procura, demanda, horarios, hora, duracao, fator, chanceFila, analisa, OFICIAIS, JANELA, FAIXA_MIN } from "../public/js/modelo.js";

const H = 60 / FAIXA_MIN; // faixas por hora
const faixa = (h) => Math.round(h * H); // h horas depois da abertura → índice da faixa

test("demanda devolve quem votou depois do encerramento às 2 últimas horas", () => {
  const v = Array(OFICIAIS).fill(2).concat([4, 4]);
  const d = demanda(v);
  assert.equal(d.length, OFICIAIS);
  assert.equal(Math.round(d.reduce((a, b) => a + b, 0)), 2 * OFICIAIS + 8);
  assert.ok(d[OFICIAIS - 1] > 2 && d[0] === 2);
  assert.equal(d[OFICIAIS - 2 * H - 1], 2); // antes das 2 últimas horas, nada muda
});

test("simulação: urna folgada não forma fila; urna rápida esvazia a fila", () => {
  const { o, espera: e } = simula2(demanda(Array(OFICIAIS).fill(FAIXA_MIN / 5)), 30, 20); // 1 a cada 5 min, 50 s cada = 17%
  assert.ok(o.every((x) => x <= 20));
  assert.ok(e.every((x) => x < 0.01));
  const pico = Array(OFICIAIS).fill(0); pico[0] = 20; // 20 chegam na abertura
  const r = simula2(demanda(pico), 40, 20); // 60 s cada: 20 min de fila
  assert.equal(r.o[0], 100);
  assert.equal(r.o[Math.floor(20 / FAIXA_MIN) - 1], 100);
  assert.ok(r.o[faixa(1)] < 30);
});

test("chance de fila soma vizinhas e trata faixa vazia como livre", () => {
  assert.deepEqual(chanceFila([2, 2, 0, 0], [2, 0, 0, 0], 0), [100, 0, 0, 0]);
  assert.deepEqual(chanceFila([2, 2, 0, 0], [2, 0, 0, 0], 1), [50, 50, 0, 0]);
});

test("horários: acha a hora mais vazia e a mais cheia, sem passar do encerramento", () => {
  const o = Array(OFICIAIS).fill(50);
  for (let i = faixa(1); i < faixa(2); i++) o[i] = 95;
  for (let i = faixa(5); i < faixa(6); i++) o[i] = 5;
  const r = horarios(o);
  assert.ok(Math.abs(r.pior - faixa(1)) <= 1);
  assert.ok(Math.abs(r.melhor - faixa(5)) <= 2);
  assert.ok(horarios(Array(OFICIAIS).fill(0)).melhor + JANELA < OFICIAIS);
});

test("segunda pior hora não sobrepõe a primeira", () => {
  const o = Array(OFICIAIS).fill(80);
  for (let i = faixa(2); i < faixa(3); i++) o[i] = 10;
  for (let i = faixa(6); i < faixa(7); i++) o[i] = 20;
  const r = horarios(o);
  assert.ok(Math.abs(r.melhor - faixa(2)) <= 2);
  assert.ok(Math.abs(r.pior2 - r.pior) >= JANELA);
});

test("formatos", () => {
  assert.equal(hora(0, 8), "8h");
  assert.equal(hora(faixa(1.5), 8), "9h30");
  assert.equal(hora(1, 8), `8h${String(FAIXA_MIN).padStart(2, "0")}`);
  assert.equal(hora(0, 6), "6h");
  assert.equal(duracao(114), "1min54");
  assert.equal(duracao(45), "45 s");
  assert.equal(fator(114, 45, 20).toFixed(2), "2.06");
});


test("analisa uma seção (urna no limite boa parte do dia)", () => {
  const v = Array(OFICIAIS).fill(0).map((_, i) => 1 + (i % 3 === 0 ? 1 : 0));
  const q = v.map((x, i) => (i < faixa(6) ? x : Math.max(0, x - 1)));
  const a = analisa({ v, q, t1: 114, t2: 45, me: 20, n: v.reduce((x, y) => x + y) }, 8);
  assert.ok(a.fator > 2);
  assert.ok(Math.max(...a.o2) < Math.max(...a.o1));
  assert.ok(a.r2.melhor >= 0 && a.r2.melhor < OFICIAIS);
  assert.equal(a.w1.length, a.o1.length);
});

test("sem perfil, a procura com fila não fica presa à capacidade", () => {
  const v = Array(OFICIAIS).fill(2); // urna no limite o dia todo
  const f = Array(OFICIAIS).fill(40); for (let i = faixa(1); i < faixa(2); i++) f[i] = 100;
  const { o } = simula2(procura(v, f, null, 110, 20), 40, 20);
  assert.ok(o[faixa(1.5)] > o[faixa(6)]); // o pico do 1º turno continua sendo o pico no 2º
});

test("urna no limite usa o perfil de chegada das seções sem fila", () => {
  const v = Array(OFICIAIS).fill(2), f = Array(OFICIAIS).fill(95);
  const perfil = Array(OFICIAIS).fill(0.5 / (OFICIAIS - H));
  for (let i = faixa(1); i < faixa(2); i++) perfil[i] = 0.5 / H; // metade das 9h às 10h
  const c = procura(v, f, perfil, 110, 20);
  assert.equal(Math.round(c.reduce((a, b) => a + b, 0)), 2 * OFICIAIS); // mesmos eleitores
  assert.ok(c[faixa(1.5)] > 5 * c[faixa(6)]);
  const sem = procura(v, Array(OFICIAIS).fill(10), perfil, 110, 20); // urna folgada: fica com o que viu
  assert.deepEqual(sem.map(Math.round), v);
});

test("espera pela fórmula de filas: cresce com a ocupação e tem teto", () => {
  assert.equal(espera(0, 80), 0);
  assert.ok(espera(0.5, 60) < espera(0.9, 60));
  assert.ok(Math.abs(espera(0.5, 60) - 39) < 1); // 0,5/0,5 × 1,3/2 × 60
  assert.equal(espera(1, 60), espera(0.97, 60));
  assert.equal(minutos(30), "30 s");
  assert.equal(minutos(8 * 60), "8 min");
  assert.equal(minutos(3600), "mais de 30 min");
});

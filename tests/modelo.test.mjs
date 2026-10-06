import test from "node:test";
import assert from "node:assert/strict";
import { simula2, demanda, horarios, hora, duracao, fator, chanceFila, analisa, OFICIAIS } from "../public/js/modelo.js";

test("demanda devolve quem votou depois do encerramento à última hora", () => {
  const v = Array(OFICIAIS).fill(2).concat([4, 4]);
  const d = demanda(v);
  assert.equal(d.length, OFICIAIS);
  assert.equal(Math.round(d.reduce((a, b) => a + b, 0)), 2 * OFICIAIS + 8);
  assert.equal(d[OFICIAIS - 1], 4);
  assert.equal(d[0], 2);
});

test("simulação: urna folgada não forma fila; urna rápida esvazia a fila", () => {
  const { o, espera } = simula2(Array(OFICIAIS).fill(3), 30, 20); // 3 por 15 min, 50 s cada = 17%
  assert.ok(o.every((x) => x <= 20));
  assert.ok(espera.every((x) => x < 0.01));
  const pico = Array(OFICIAIS).fill(2); pico[0] = 40; // 40 chegam na abertura
  const r = simula2(pico, 40, 20); // 60 s cada: 15 por faixa
  assert.equal(r.o[0], 100);
  assert.equal(r.o[1], 100);
  assert.ok(r.o[3] < 30);
});

test("chance de fila soma vizinhas e trata faixa vazia como livre", () => {
  assert.deepEqual(chanceFila([2, 2, 0, 0], [2, 0, 0, 0], 0), [100, 0, 0, 0]);
  assert.deepEqual(chanceFila([2, 2, 0, 0], [2, 0, 0, 0], 1), [50, 50, 0, 0]);
});

test("horários: acha a hora mais vazia e a mais cheia, sem passar do encerramento", () => {
  const o = Array(OFICIAIS).fill(50);
  for (let i = 4; i < 8; i++) o[i] = 95;
  for (let i = 20; i < 24; i++) o[i] = 5;
  const r = horarios(o);
  assert.equal(r.pior, 4);
  assert.ok(r.melhor >= 19 && r.melhor <= 21);
  assert.ok(horarios(Array(OFICIAIS).fill(0)).melhor + 4 < OFICIAIS);
});

test("formatos", () => {
  assert.equal(hora(0, 8), "8h");
  assert.equal(hora(5, 8), "9h15");
  assert.equal(hora(0, 6), "6h");
  assert.equal(duracao(114), "1min54");
  assert.equal(duracao(45), "45 s");
  assert.equal(fator(114, 45, 20).toFixed(2), "2.06");
});

test("analisa uma seção real (MA, 07072/0049/0064)", () => {
  const d = { v: [5,2,5,3,4,5,5,5,6,5,5,5,6,4,6,6,6,6,5,3,6,6,7,7,6,7,4,7,7,3,5,9,4,6,2,0],
              q: [3,0,3,3,3,3,4,5,6,4,4,4,5,2,5,6,6,6,3,2,3,6,7,6,5,5,3,7,7,2,4,9,1,4,0,0], t1: 114, t2: 45, me: 20, n: 183 };
  const a = analisa(d, 8);
  assert.ok(a.fator > 2);
  assert.ok(Math.max(...a.o2) < Math.max(...a.o1));
  assert.ok(a.r2.melhor >= 0 && a.r2.melhor < OFICIAIS);
});

test("com fila no 1º turno, a procura não fica presa à capacidade", () => {
  const v = Array(OFICIAIS).fill(6); // urna no limite o dia todo
  const f = Array(OFICIAIS).fill(40); for (let i = 4; i < 8; i++) f[i] = 100;
  const { o } = simula2(v, 40, 20, f, 110);
  assert.ok(o[5] > o[20]); // o pico do 1º turno continua sendo o pico no 2º
});

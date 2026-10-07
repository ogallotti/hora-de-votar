import test from "node:test";
import assert from "node:assert/strict";
import { pontos, pontoPrevia, aparelho } from "../lib/metricas.js";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

test("pacote válido vira pontos, sem IP nem user agent", () => {
  const ps = pontos(JSON.stringify({ s: "abc123", p: "s", e: [{ n: "visita", ref: "instagram.com", utm: "story", tela: "celular", volta: 1 }, { n: "abre", tipo: "s", uf: "MA", cd: "9210", como: "busca" }] }), { pais: "BR", estado: "MA", ua: UA });
  assert.equal(ps.length, 2);
  assert.deepEqual(ps[0].blobs, ["visita", "s", "BR", "MA", "ios", "instagram.com", "story", "celular", "", "abc123"]);
  assert.deepEqual(ps[0].doubles, [1, 0, 0, 0]);
  assert.equal(ps[1].blobs[7], "9210");
  assert.ok(!JSON.stringify(ps).includes("iPhone"));
});

test("descarta lixo: evento desconhecido, robô, corpo grande, JSON quebrado", () => {
  assert.equal(pontos(JSON.stringify({ s: "x", e: [{ n: "hack", a: 1 }] })).length, 0);
  assert.equal(pontos(JSON.stringify({ s: "x", e: [{ n: "visita" }] }), { ua: "Googlebot/2.1" }).length, 0);
  assert.equal(pontos("x".repeat(9000)).length, 0);
  assert.equal(pontos("{quebrado").length, 0);
  assert.equal(pontos(JSON.stringify({ s: "x", e: Array(100).fill({ n: "saiu", seg: 3 }) })).length, 40);
});

test("textos são cortados e números limitados", () => {
  const [p] = pontos(JSON.stringify({ s: "<script>", e: [{ n: "erro", msg: "a".repeat(500), onde: "x\u0000y" }] }));
  assert.equal(p.blobs[5].length, 120);
  assert.equal(p.blobs[6], "xy");
  assert.equal(p.blobs[9], "script");
  const [q] = pontos(JSON.stringify({ s: "x", e: [{ n: "vitals", lcp: "1e99", inp: "abc" }] }));
  assert.deepEqual(q.doubles, [1e9, 0, 0, 0]);
});

test("prévias: reconhece o aplicativo", () => {
  assert.equal(pontoPrevia({ tipo: "s", cd: 9210 }, "WhatsApp/2.24.1 A").blobs[5], "whatsapp");
  assert.equal(pontoPrevia({ tipo: "br" }, "Twitterbot/1.0").blobs[5], "x");
  assert.equal(pontoPrevia({ tipo: "br" }, "TelegramBot (like TwitterBot)").blobs[5], "telegram");
  assert.equal(aparelho("Mozilla/5.0 (Linux; Android 14)"), "android");
});

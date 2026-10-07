// Quantas pessoas estão com o site aberto agora. Cada aba manda um sinal a cada 30 s com um código aleatório
// (gerado no navegador, sem dado pessoal); conta quem deu sinal no último minuto e pouco.
// Para aguentar muita gente: 32 partes (Presenca), cada uma com suas abas; a cada 10 s cada parte manda sua
// contagem para a central (Total), que soma e devolve o total. Nada é gravado em disco: é só memória.
import { DurableObject } from "cloudflare:workers";

const VALIDADE = 75_000; // ms sem sinal para a aba deixar de contar
const RELATO = 10_000;   // ms entre relatos de cada parte para a central

export class Presenca extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.abas = new Map();
    this.total = 0;
    this.relatado = 0;
  }

  async bate(id, parte) {
    const agora = Date.now();
    this.abas.set(id, agora);
    if (agora - this.relatado > RELATO) {
      this.relatado = agora;
      for (const [k, t] of this.abas) if (agora - t > VALIDADE) this.abas.delete(k);
      const central = this.env.TOTAL.get(this.env.TOTAL.idFromName("total"));
      this.total = await central.relata(parte, this.abas.size);
    }
    return Math.max(this.total, this.abas.size);
  }
}

export class Total extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.partes = new Map();
  }

  async relata(parte, n) {
    const agora = Date.now();
    this.partes.set(parte, [n, agora]);
    let soma = 0;
    for (const [k, [c, t]] of this.partes) {
      if (agora - t > 3 * RELATO + VALIDADE) this.partes.delete(k); // parte sem movimento: suas abas já expiraram
      else soma += c;
    }
    return soma;
  }
}

export default {
  fetch() {
    return new Response("hora-de-votar-ao-vivo: usado pela função /api/ao-vivo do site", { status: 404 });
  },
};

import { imagem } from "../../lib/imagem.js";

export const onRequestGet = (ctx) => imagem(ctx, { tipo: "br" });

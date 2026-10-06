import { imagem } from "../../../../lib/imagem.js";

export const onRequestGet = (ctx) => {
  const { cd, lid } = ctx.params;
  return imagem(ctx, { tipo: "l", cd, lid: String(lid).replace(/\.png$/, "") });
};

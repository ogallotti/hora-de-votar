import { imagem } from "../../../../../lib/imagem.js";

export const onRequestGet = (ctx) => {
  const { cd, z, s } = ctx.params;
  return imagem(ctx, { tipo: "s", cd, z, s: String(s).replace(/\.png$/, "") });
};

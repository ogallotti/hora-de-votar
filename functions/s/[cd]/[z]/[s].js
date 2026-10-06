import { pagina } from "../../../../lib/pagina.js";

export const onRequestGet = (ctx) => {
  const { cd, z, s } = ctx.params;
  return pagina(ctx, { tipo: "s", cd, z, s }, `/og/s/${cd}/${z}/${s}.png`);
};

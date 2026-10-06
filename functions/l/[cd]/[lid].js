import { pagina } from "../../../lib/pagina.js";

export const onRequestGet = (ctx) => {
  const { cd, lid } = ctx.params;
  return pagina(ctx, { tipo: "l", cd, lid }, `/og/l/${cd}/${lid}.png`);
};

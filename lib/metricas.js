// Métricas de uso: validação do pacote do navegador e gravação no Workers Analytics Engine (binding METRICAS).
// Nunca guarda IP nem user agent: só o país e o estado aproximados (da Cloudflare), a família do aparelho e os eventos.
// Formato de cada ponto: blobs = [evento, página, país, estado, aparelho, a, b, c, d, sessão], doubles = [x, y, z, w],
// indexes = [evento]. a…d e x…w dependem do evento (ver CAMPOS).
export const CAMPOS = {
  visita: { txt: ["ref", "utm", "tela"], num: ["volta"] },
  abre: { txt: ["tipo", "uf", "cd", "como"], num: [] },
  compartilha: { txt: ["canal", "tipo"], num: [] },
  stories: { txt: ["tipo"], num: [] },
  anuncio: { txt: ["qual", "acao"], num: [] },
  grafico: { txt: ["acao"], num: ["hora"] },
  nerd: { txt: ["acao", "valor"], num: [] },
  erro: { txt: ["msg", "onde"], num: [] },
  vitals: { txt: [], num: ["lcp", "inp", "cls", "ttfb"] },
  saiu: { txt: [], num: ["seg"] },
};
const MAX_CORPO = 8192, MAX_EVENTOS = 40;
const ROBO = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|pingdom|uptime/i;
const limpa = (v, n = 80) => String(v ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, n);
const numero = (v) => (Number.isFinite(+v) ? Math.max(-1e9, Math.min(1e9, +v)) : 0);

export function aparelho(ua = "") {
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/windows/i.test(ua)) return "windows";
  if (/mac os/i.test(ua)) return "mac";
  if (/linux|cros/i.test(ua)) return "linux";
  return "outro";
}

/** Pacote do navegador → pontos para o Analytics Engine (ou [] se inválido). */
export function pontos(texto, { pais = "", estado = "", ua = "" } = {}) {
  if (!texto || texto.length > MAX_CORPO || ROBO.test(ua)) return [];
  let d;
  try { d = JSON.parse(texto); } catch { return []; }
  if (!d || !Array.isArray(d.e)) return [];
  const sessao = limpa(d.s, 16).replace(/[^a-z0-9]/gi, "");
  const pagina = limpa(d.p, 12).replace(/[^a-z]/gi, "") || "capa";
  const ap = aparelho(ua);
  const out = [];
  for (const e of d.e.slice(0, MAX_EVENTOS)) {
    const c = CAMPOS[e?.n];
    if (!c) continue;
    const txt = [0, 1, 2, 3].map((i) => (c.txt[i] ? limpa(e[c.txt[i]], c.txt[i] === "msg" ? 120 : 40) : ""));
    const num = [0, 1, 2, 3].map((i) => (c.num[i] ? numero(e[c.num[i]]) : 0));
    out.push({ blobs: [e.n, pagina, limpa(pais, 2), limpa(estado, 8), ap, ...txt, sessao], doubles: num, indexes: [e.n] });
  }
  return out;
}

/** Ponto do servidor (prévias buscadas por WhatsApp, X, Telegram etc.: cada uma é um compartilhamento). */
export function pontoPrevia(rota, ua = "", pais = "") {
  // ordem importa: o robô do Telegram se apresenta como "TelegramBot (like TwitterBot)"
  const quem = /whatsapp/i.test(ua) ? "whatsapp" : /telegram/i.test(ua) ? "telegram" : /facebookexternalhit|facebot/i.test(ua) ? "facebook"
    : /twitterbot/i.test(ua) ? "x" : /slack/i.test(ua) ? "slack"
    : /discord/i.test(ua) ? "discord" : /linkedin/i.test(ua) ? "linkedin" : /bot|crawl|spider/i.test(ua) ? "robo" : "navegador";
  return { blobs: ["previa", rota.tipo, limpa(pais, 2), "", "", quem, rota.tipo === "br" ? "" : limpa(rota.cd, 8), "", "", ""], doubles: [0, 0, 0, 0], indexes: ["previa"] };
}

/** Grava sem nunca derrubar a resposta (métrica é secundária). */
export function grava(env, ps) {
  try { for (const p of ps) env.METRICAS?.writeDataPoint(p); } catch { /* sem binding (dev) ou limite: segue */ }
}

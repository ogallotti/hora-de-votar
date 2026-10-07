// Métricas de uso próprias, sem cookie e sem terceiros: os eventos ficam numa fila e saem num pacote só, para o próprio
// site (/api/m), quando a pessoa sai da página (ou a cada 40 eventos). Nada de texto digitado na busca, nada que
// identifique alguém: o código de sessão é aleatório, mora no sessionStorage e some quando a aba fecha.
// Também mede erros de JavaScript e os Web Vitals (LCP, INP, CLS, TTFB), para saber se o site está bom no celular.
const fila = [];
let sessao;
try {
  sessao = sessionStorage.getItem("s") || Math.random().toString(36).slice(2, 12);
  sessionStorage.setItem("s", sessao);
} catch { sessao = Math.random().toString(36).slice(2, 12); }
const t0 = performance.now();

/** Registra um evento: nome curto e até 4 propriedades simples (texto curto ou número). */
export function evento(n, props = {}) {
  if (fila.length > 200) return;
  fila.push({ n, t: Math.round(performance.now() - t0), ...props });
  if (fila.length >= 40) envia();
}

function envia() {
  if (!fila.length) return;
  const corpo = JSON.stringify({ s: sessao, p: location.pathname.split("/")[1] || "capa", e: fila.splice(0, 40) });
  const ok = navigator.sendBeacon?.("/api/m", new Blob([corpo], { type: "application/json" }));
  if (!ok) fetch("/api/m", { method: "POST", body: corpo, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}
addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { vitals(); envia(); } });
addEventListener("pagehide", () => { vitals(); envia(); });

// ---------------------------------------------------------------- visita
const ref = (() => { try { const r = new URL(document.referrer); return r.host === location.host ? "" : r.host.replace(/^www\./, ""); } catch { return ""; } })();
const q = new URLSearchParams(location.search);
evento("visita", {
  ref, utm: (q.get("utm_source") || "").slice(0, 30),
  tela: innerWidth < 640 ? "celular" : innerWidth < 1100 ? "tablet" : "desktop",
  volta: (() => { try { const v = localStorage.getItem("v"); localStorage.setItem("v", "1"); return v ? 1 : 0; } catch { return 0; } })(),
});

// ---------------------------------------------------------------- erros
let erros = 0;
const erro = (msg, onde) => { if (erros++ < 5) evento("erro", { msg: String(msg || "").slice(0, 120), onde: String(onde || "").slice(0, 80) }); };
addEventListener("error", (e) => erro(e.message, `${(e.filename || "").split("/").pop()}:${e.lineno}`));
addEventListener("unhandledrejection", (e) => erro(e.reason?.message || e.reason, "promise"));

// ---------------------------------------------------------------- Web Vitals (sem biblioteca)
const v = { lcp: 0, cls: 0, inp: 0, ttfb: 0 };
try {
  new PerformanceObserver((l) => { const x = l.getEntries().at(-1); if (x) v.lcp = x.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => { for (const x of l.getEntries()) if (!x.hadRecentInput) v.cls += x.value; }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => { for (const x of l.getEntries()) v.inp = Math.max(v.inp, x.duration); }).observe({ type: "event", buffered: true, durationThreshold: 40 });
  v.ttfb = performance.getEntriesByType("navigation")[0]?.responseStart || 0;
} catch { /* navegador sem PerformanceObserver */ }
let mediu = false;
function vitals() {
  if (mediu) return;
  mediu = true;
  evento("vitals", { lcp: Math.round(v.lcp), inp: Math.round(v.inp), cls: Math.round(v.cls * 1000) / 1000, ttfb: Math.round(v.ttfb) });
  evento("saiu", { seg: Math.round((performance.now() - t0) / 1000) });
}

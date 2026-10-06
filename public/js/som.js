// O "pi-pi-pi-pi-piii" do fim do voto na urna eletrônica, sintetizado (sem arquivo de áudio).
// Só toca depois de um gesto da pessoa (clique/Enter) e pode ser desligado; a escolha fica neste navegador.
let ctx = null;
let ligado = true;
try { ligado = localStorage.getItem("som") !== "0"; } catch { /* sem armazenamento: fica ligado */ }

export const somLigado = () => ligado;
export function alternaSom() {
  ligado = !ligado;
  try { localStorage.setItem("som", ligado ? "1" : "0"); } catch { /* ignora */ }
  return ligado;
}

export function fimDaUrna() {
  if (!ligado) return;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    const bips = [0.07, 0.07, 0.07, 0.07, 0.07, 0.42]; // cinco curtos e um longo
    let t = t0;
    for (const d of bips) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 1760;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.005);
      g.gain.setValueAtTime(0.045, t + d - 0.01);
      g.gain.linearRampToValueAtTime(0, t + d);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + d + 0.02);
      t += d + 0.045;
    }
  } catch { /* sem áudio: segue em silêncio */ }
}

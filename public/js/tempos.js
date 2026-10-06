// Minuto (desde a abertura oficial) em que cada eleitor começou a votar, como vem em z/<cidade>-<zona>.json ("t"):
// diferença para o anterior em base 62 (0-9a-zA-Z), ou "~" + base 36 + "." quando a diferença passa de 61.
const ALF = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const VAL = Object.fromEntries([...ALF].map((c, i) => [c, i]));

export function minutosDe(t) {
  const out = [];
  let m = 0;
  for (let k = 0; k < (t || "").length; k++) {
    const c = t[k];
    if (c === "~") {
      const fim = t.indexOf(".", k);
      m += parseInt(t.slice(k + 1, fim), 36);
      k = fim;
    } else m += VAL[c];
    out.push(m);
  }
  return out;
}

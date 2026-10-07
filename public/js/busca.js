// Busca universal: uma barra que entende cidade, local de votação, bairro, endereço e zona/seção, juntos ou não.
// "102 sul brasília", "pinheiros sp", "recife zona 1 seção 40", "z5 s120", "5/120", "410 undb".
const UFS = new Set("ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to".split(" "));
const MAX = { cidade: 4, local: 7, bairro: 3, secao: 6 };

export const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const palavras = (s) => norm(s).split(" ").filter(Boolean);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Separa zona/seção e UF do resto do texto. */
export function interpreta(q) {
  let zona = null, secao = null;
  let t = String(q || "");
  const barra = t.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  if (barra) { zona = +barra[1]; secao = +barra[2]; t = t.replace(barra[0], " "); }
  t = norm(t);
  const z = t.match(/(?:^| )(?:zona|zn|z) ?(\d{1,4})(?= |$)/);
  if (z) { zona = +z[1]; t = t.replace(z[0], " "); }
  const s = t.match(/(?:^| )(?:secao|sec|s) ?(\d{1,4})(?= |$)/);
  if (s) { secao = +s[1]; t = t.replace(s[0], " "); }
  const toks = t.split(" ").filter(Boolean);
  let uf = null;
  if (toks.length > 1 && UFS.has(toks[toks.length - 1])) uf = toks.pop().toUpperCase();
  return { toks, zona, secao, uf };
}

const ehNumero = (t) => /^\d{1,4}$/.test(t);
const itemSecao = (mun, l, s) => ({ tipo: "secao", cd: mun.cd, z: l.z, s, t: `Zona ${l.z}, seção ${s}`, d: `${l.n} · ${mun.nome}, ${mun.uf}`, ic: "secao", toks: [] });

// distância de edição com troca de vizinhas (Damerau), parando cedo quando passa do limite
function distancia(a, b, lim) {
  if (Math.abs(a.length - b.length) > lim) return lim + 1;
  let ant2 = null, ant = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + c);
      if (ant2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, ant2[j - 2] + 1);
      cur.push(v);
      menor = Math.min(menor, v);
    }
    if (menor > lim) return lim + 1;
    ant2 = ant; ant = cur;
  }
  return ant[b.length];
}
// erro de digitação tolerado: 1 letra em palavras de 4 a 7 letras, 2 a partir de 8 (curtas e números: exato)
const folga = (t) => (/^\d+$/.test(t) || t.length < 4 ? 0 : t.length < 8 ? 1 : 2);
function parecida(t, w) {
  const k = folga(t);
  if (!k) return false;
  // compara com a palavra inteira e com o começo dela (quem ainda está digitando)
  return distancia(t, w, k) <= k || (w.length > t.length && distancia(t, w.slice(0, t.length), k) <= k);
}

// cada palavra da busca precisa começar alguma palavra do texto; com flex, vale também parecida (erro de digitação)
let flex = false;
function casa(toks, alvoPalavras) {
  return toks.every((t) => alvoPalavras.some((w) => w.startsWith(t) || (flex && parecida(t, w))));
}

/** Destaca, em HTML, o começo das palavras que casam com a busca. */
export function destaca(texto, toks) {
  if (!toks.length) return esc(texto);
  return String(texto).split(/(\s+)/).map((w) => {
    const n = norm(w);
    const t = toks.find((k) => n.startsWith(k));
    if (!t) return esc(w);
    let corte = 0, acc = "";
    for (const ch of w) { corte += ch.length; acc = norm(w.slice(0, corte)); if (acc.length >= t.length) break; }
    return `<mark>${esc(w.slice(0, corte))}</mark>${esc(w.slice(corte))}`;
  }).join("");
}


export function criaBusca({ json, municipios, input, lista, contexto, confirma, aoEscolher, recentes }) {
  const porCodigo = new Map(municipios.map((m) => [m.cd, m]));
  const porPrimeira = new Map();
  for (const m of municipios) {
    m.p ??= palavras(m.nome);
    const k = m.p[0];
    if (!porPrimeira.has(k)) porPrimeira.set(k, []);
    porPrimeira.get(k).push(m);
  }
  let cidade = null;      // contexto escolhido (chip)
  let itens = [], ativo = -1, seq = 0;

  // ------------------------------------------------------------ fontes
  const locaisDaCidade = async (cd) => {
    const d = await json(`/data/m/${cd}.json`);
    for (const l of d.locais) { l._p ??= palavras(`${l.n} ${l.b} ${l.e} ${l.a || ""}`); l._n ??= palavras(l.n); }
    return d;
  };
  // índice nacional estático (data/busca/, sem função no servidor): baixa só o pedaço do prefixo da palavra mais
  // longa da busca. Palavras muito comuns ("escola", "rua") não escolhem pedaço, mas ainda filtram o resultado.
  let manifesto = null;
  const indice = async (toks) => {
    manifesto ??= json("/data/busca/_.json").then((m) => ({ pare: new Set(m.pare), div: new Set(m.div) }));
    const { pare, div } = await manifesto;
    const chaveDe = (t) => {
      let k = 2;
      while (k < 5 && t.length > k && div.has(t.slice(0, k))) k++;
      return t.length >= 2 && !div.has(t.slice(0, k)) ? t.slice(0, k) : null; // prefixo dividido e palavra curta: não dá
    };
    const ordem = (xs) => xs.filter((t) => !pare.has(t)).sort((a, b) => b.length - a.length);
    const chave = [...ordem(toks.filter((t) => !ehNumero(t))), ...ordem(toks.filter(ehNumero))].map(chaveDe).find(Boolean);
    if (!chave) return null;
    const rows = await json(`/data/busca/${chave}.json`);
    rows._pronto ??= rows.map(([cd, id, n, b, e, a]) => {
      const mun = porCodigo.get(cd);
      return { cd, id, n, b, e, mun, _n: palavras(n), _p: palavras(`${n} ${b} ${e} ${a || ""} ${mun?.nome || ""}`) };
    });
    return rows._pronto;
  };
  // cidade e estado da última consulta: desempate para quem busca sem dizer a cidade
  const ultimo = () => { const r = recentes()[0]; const m = r && porCodigo.get(r.cd); return m ? { cd: m.cd, uf: m.uf } : {}; };

  function achaCidade(toks, uf) {
    let melhor = null;
    for (let j = 0; j < toks.length; j++) {
      for (const m of porPrimeira.get(toks[j]) || []) {
        if (m.p.length > toks.length - j || !m.p.every((w, k) => toks[j + k] === w)) continue;
        if (uf && m.uf !== uf) continue;
        const nota = m.p.length * 1e7 + (m.uf === ultimo().uf ? 5e6 : 0) + m.ns;
        if (!melhor || nota > melhor.nota) melhor = { m, j, nota };
      }
    }
    return melhor;
  }

  // ------------------------------------------------------------ busca
  // primeiro exata; sem nada, de novo tolerando erro de digitação (só no que já foi baixado: instantâneo)
  async function busca(q) {
    flex = false;
    const exata = await buscaUma(q);
    if (exata.grupos.length || !q.trim()) return exata;
    flex = true;
    try {
      const solta = await buscaUma(q);
      if (solta.grupos.length) solta.grupos[0].rot = `Talvez: ${solta.grupos[0].rot.toLowerCase()}`;
      return solta.grupos.length ? solta : exata;
    } finally { flex = false; }
  }
  async function buscaUma(q) {
    const { toks: todos, zona, secao, uf } = interpreta(q);
    let toks = todos, mun = cidade;
    const grupos = [];
    let aviso = "";
    const frase = todos.join(" ");
    const bonusFrase = (palavrasAlvo) => (frase.length > 4 && ` ${palavrasAlvo.join(" ")} `.includes(` ${toks.join(" ")}`) ? 6 : 0);
    let cidadeExata = false;
    if (!mun) {
      const c = achaCidade(todos, uf);
      if (c && (c.m.p.length < todos.length || zona || secao)) { mun = c.m; toks = todos.filter((_, k) => k < c.j || k >= c.j + c.m.p.length); }
      // cidades
      if (todos.length && !zona && !secao) {
        const qn = todos.join(" ");
        const cs = municipios
          .filter((m) => (!uf || m.uf === uf) && casa(todos, m.p))
          .map((m) => [norm(m.nome).startsWith(qn) ? 0 : 1, m])
          .sort((a, b) => a[0] - b[0] || (b[1].uf === ultimo().uf) - (a[1].uf === ultimo().uf) || b[1].ns - a[1].ns)
          .slice(0, MAX.cidade);
        cidadeExata = cs.some(([, m]) => norm(m.nome) === qn);
        if (cs.length) grupos.push({ rot: "Cidades", itens: cs.map(([, m]) => ({ tipo: "cidade", mun: m, t: m.nome, d: m.uf, x: `${m.ns.toLocaleString("pt-BR")} seções`, ic: "cidade", toks: todos })) });
      }
    }
    if (mun) {
      const d = await locaisDaCidade(mun.cd);
      const locais = d.locais.filter((l) => l.ns);
      // seções por número
      const numeroSo = !zona && !secao && toks.length === 1 && /^\d+$/.test(toks[0]) ? +toks[0] : null;
      const sAlvo = secao ?? numeroSo;
      if (sAlvo != null || zona != null) {
        const cands = [];
        const nomeSec = toks.filter((t) => !ehNumero(t));
        for (const l of d.locais) {
          if (zona != null && l.z !== zona) continue;
          if (secao != null && nomeSec.length && !casa(nomeSec, l._p)) continue; // "seção 410 undb": só no local que casa
          const ss = sAlvo != null ? l.s.filter((s) => s === sAlvo) : [];
          for (const s of ss) cands.push({ tipo: "secao", cd: mun.cd, z: l.z, s, t: `Zona ${l.z}, seção ${s}`, d: `${l.n} · ${mun.nome}, ${mun.uf}`, ic: "secao", toks: [] });
        }
        if (cands.length) grupos.push({ rot: "Seções", itens: cands.slice(0, MAX.secao) });
        else if (sAlvo != null) {
          const daZona = d.locais.filter((l) => zona == null || l.z === zona).flatMap((l) => l.s).sort((a, b) => a - b);
          aviso = daZona.length
            ? `A seção <b>${sAlvo}</b> não existe ${zona != null ? `na zona ${zona} de` : "em"} ${esc(mun.nome)}. ${zona != null ? `As seções dessa zona vão de ${daZona[0]} a ${daZona[daZona.length - 1]}.` : ""}`
            : `${esc(mun.nome)} não tem zona <b>${zona}</b>. Zonas da cidade: ${[...new Set(d.locais.map((l) => l.z))].sort((a, b) => a - b).join(", ")}.`;
        }
      }
      const texto = numeroSo != null ? [] : toks;
      // "410 undb": o número pode ser a seção, e o resto, o nome do local
      const nums = texto.filter(ehNumero).map(Number), pal = texto.filter((t) => !ehNumero(t));
      const peloNome = (l) => nums.length && pal.length && casa(pal, l._p);
      if (nums.length && pal.length) {
        // número que está no nome do local é nome ("102 sul"); o que sobra é seção ("escola classe 102 sul 4")
        const algumTudo = locais.some((l) => (zona == null || l.z === zona) && casa(texto, l._p));
        const cands = [];
        for (const l of locais) {
          if ((zona != null && l.z !== zona) || !peloNome(l)) continue;
          const noNome = nums.filter((n) => l._p.includes(String(n)));
          if (algumTudo && !noNome.length) continue;
          for (const n of nums) if (!noNome.includes(n) && l.s.includes(n)) cands.push({ it: itemSecao(mun, l, n), nota: noNome.length });
        }
        cands.sort((a, b) => b.nota - a.nota);
        if (cands.length) grupos.unshift({ rot: "Seções", itens: cands.slice(0, MAX.secao).map((c) => c.it) });
      }
      if (texto.length || (zona != null && sAlvo == null)) {
        const achados = locais
          .filter((l) => (zona == null || l.z === zona) && (casa(texto, l._p) || peloNome(l)))
          .map((l) => ({ l, nota: texto.reduce((s, t) => s + (l._n.some((w) => w.startsWith(t)) ? 3 : 1), 0) + (l._n[0]?.startsWith(texto[0] || "~") ? 1 : 0) + bonusFrase(l._p) }))
          .sort((a, b) => b.nota - a.nota || a.l.n.localeCompare(b.l.n))
          .slice(0, MAX.local);
        if (achados.length) grupos.push({ rot: `Locais de votação em ${mun.nome}`, itens: achados.map(({ l }) => ({ tipo: "local", cd: mun.cd, lid: l.id, t: l.n, d: [l.b, l.e].filter(Boolean).join(" · "), x: `${l.s.length} ${l.s.length > 1 ? "seções" : "seção"}`, ic: "pin", toks: texto })) });
        if (texto.length) {
          const bairros = new Map();
          for (const l of locais) {
            if (!l.b) continue;
            const pb = palavras(l.b);
            if (casa(texto, pb)) bairros.set(l.b, (bairros.get(l.b) || 0) + 1);
          }
          const bs = [...bairros].sort((a, b) => b[1] - a[1]).slice(0, MAX.bairro);
          if (bs.length) grupos.push({ rot: "Bairros", itens: bs.map(([b, n]) => ({ tipo: "bairro", mun, bairro: b, t: b, d: `${mun.nome}, ${mun.uf}`, x: `${n} ${n > 1 ? "locais" : "local"}`, ic: "bairro", toks: texto })) });
        }
      } else if (!todos.length && cidade) {
        // cidade escolhida e nada digitado: bairros com mais locais, para começar
        const bairros = new Map();
        for (const l of locais) if (l.b) bairros.set(l.b, (bairros.get(l.b) || 0) + 1);
        const bs = [...bairros].sort((a, b) => b[1] - a[1]).slice(0, 6);
        if (bs.length > 1) grupos.push({ rot: "Bairros com mais locais", itens: bs.map(([b, n]) => ({ tipo: "bairro", mun, bairro: b, t: b, d: `${mun.nome}, ${mun.uf}`, x: `${n} locais`, ic: "bairro", toks: [] })) });
      }
    } else if ((toks.join("").length >= 3 || (secao != null && toks.length)) && !cidadeExata) {
      // sem cidade: índice nacional estático (UF digitada no fim filtra: "pinheiros sp")
      const nums = toks.filter(ehNumero).map(Number), pal = toks.filter((t) => !ehNumero(t));
      if (secao != null && zona == null) nums.push(secao); // "seção 410 undb"
      const comNumero = nums.length && pal.join("").length >= 2;
      const achados = [];
      const linhas = await indice(toks).catch(() => []);
      const ult = ultimo();
      for (const r of linhas || []) {
        if (uf && r.mun?.uf !== uf) continue;
        const tudo = casa(toks, r._p), nome = comNumero && casa(pal, r._p);
        if (tudo || nome) achados.push({ r, nome: !tudo, nota: (tudo ? toks : pal).reduce((s, t) => s + (r._n.some((w) => w.startsWith(t)) ? 3 : 1), 0) + bonusFrase(r._p) + (r.cd === ult.cd ? 1 : r.mun?.uf === ult.uf ? 0.5 : 0) + Math.log10((r.mun?.ns || 1)) / 10 });
      }
      achados.sort((a, b) => b.nota - a.nota);
      // "410 undb" sem cidade: confere a seção nos locais que casaram pelo nome (abre o arquivo da cidade deles)
      if (comNumero && achados.length) {
        const algumTudo = achados.some((a) => !a.nome) && secao == null;
        const cands = [];
        for (const { r } of achados.slice(0, 8)) {
          const noNome = nums.filter((n) => r._p.includes(String(n)));
          if (algumTudo && !noNome.length) continue;
          const d = await locaisDaCidade(r.cd).catch(() => null);
          const l = d?.locais.find((x) => x.id === r.id);
          if (l && r.mun) for (const n of nums) if (!noNome.includes(n) && l.s.includes(n)) cands.push({ it: itemSecao(r.mun, l, n), nota: noNome.length });
        }
        cands.sort((a, b) => b.nota - a.nota);
        if (cands.length) grupos.unshift({ rot: "Seções", itens: cands.slice(0, MAX.secao).map((c) => c.it) });
      }
      if (linhas === null) aviso = "Digite um pedaço maior do nome da escola, do bairro ou da rua (ou a cidade).";
      else if (!achados.length) aviso = `Não achamos. Tente o nome da escola com a cidade (ex.: <b>${esc(frase)} são luís</b>).`;
      if (achados.length) grupos.push({ rot: uf ? `Locais de votação · ${uf}` : "Locais de votação", itens: achados.slice(0, MAX.local).map(({ r }) => ({ tipo: "local", cd: r.cd, lid: r.id, t: r.n, d: [r.b, r.mun ? `${r.mun.nome}, ${r.mun.uf}` : ""].filter(Boolean).join(" · "), x: "", ic: "pin", toks })) });
    }
    return { grupos, aviso };
  }

  // ------------------------------------------------------------ tela
  function pinta(grupos, vazio = "") {
    itens = grupos.flatMap((g) => g.itens);
    ativo = itens.length ? 0 : -1;
    if (!grupos.length) {
      lista.innerHTML = vazio ? `<div class="vazio">${vazio}</div>` : "";
    } else {
      let k = 0;
      lista.innerHTML = grupos.map((g) => `<div class="grupo" role="group" aria-label="${esc(g.rot)}"><div class="grupo-rot">${esc(g.rot)}</div>${g.itens.map((it) => {
        const id = k++;
        return `<div class="item" role="option" id="op-${id}" data-k="${id}" aria-selected="${id === 0}"><span class="ic-box"><svg class="ic" aria-hidden="true"><use href="#i-${it.ic}"/></svg></span><span><span class="t">${destaca(it.t, it.toks || [])}</span>${it.d ? `<span class="d">${destaca(it.d, it.toks || [])}</span>` : ""}</span><span class="x">${esc(it.x || "")}</span></div>`;
      }).join("")}</div>`).join("");
    }
    abre(Boolean(grupos.length || vazio));
    marca();
  }
  function abre(sim) {
    lista.hidden = !sim;
    input.setAttribute("aria-expanded", String(sim));
    confirma.disabled = !(sim && ativo >= 0);
  }
  function marca() {
    lista.querySelectorAll(".item").forEach((e) => e.setAttribute("aria-selected", String(+e.dataset.k === ativo)));
    const e = lista.querySelector(`#op-${ativo}`);
    if (e) { input.setAttribute("aria-activedescendant", e.id); e.scrollIntoView({ block: "nearest" }); } else input.removeAttribute("aria-activedescendant");
    confirma.disabled = ativo < 0;
  }

  async function atualiza() {
    const q = input.value, n = ++seq;
    if (!q.trim()) {
      if (cidade) { pinta((await busca("")).grupos); return; }
      const rec = recentes();
      pinta(rec.length ? [{ rot: "Vistos por último", itens: rec.map((r) => ({ ...r, ic: r.tipo === "s" ? "secao" : "pin", toks: [] })) }] : []);
      return;
    }
    lista.hidden = false;
    if (!itens.length) lista.innerHTML = `<div class="esqueleto"></div><div class="esqueleto"></div>`;
    try {
      const { grupos: gs, aviso } = await busca(q);
      if (n !== seq) return;
      const { toks } = interpreta(q);
      pinta(gs, aviso || (cidade || toks.length > 1
        ? `Nada encontrado. Tente o nome da escola, o bairro ou <b>zona e seção</b> (ex.: zona 5 seção 120).`
        : `Digite também a cidade.`));
    } catch {
      if (n === seq) pinta([], "Não conseguimos carregar os dados agora. Tente de novo em instantes.");
    }
  }

  function defineCidade(m) {
    cidade = m;
    contexto.hidden = !m;
    contexto.innerHTML = m ? `<span>${esc(m.nome)}, ${m.uf}</span><button type="button" aria-label="Tirar a cidade da busca"><svg class="ic" aria-hidden="true"><use href="#i-fechar"/></svg></button>` : "";
    input.placeholder = m ? "Escola, bairro, rua ou zona e seção" : "Cidade, escola, bairro ou zona e seção";
  }
  contexto.addEventListener("click", (e) => { if (e.target.closest("button")) { defineCidade(null); input.focus(); atualiza(); } });

  function escolhe(it) {
    if (!it) return;
    if (it.tipo === "cidade") { defineCidade(it.mun); input.value = ""; input.focus(); atualiza(); return; }
    if (it.tipo === "bairro") { defineCidade(it.mun); input.value = it.bairro; input.focus(); atualiza(); return; }
    abre(false);
    input.blur();
    if (it.tipo === "local") aoEscolher({ tipo: "l", cd: it.cd, lid: it.lid });
    else if (it.tipo === "secao" || it.tipo === "s") aoEscolher({ tipo: "s", cd: it.cd, z: it.z, s: it.s });
    else if (it.tipo === "l") aoEscolher({ tipo: "l", cd: it.cd, lid: it.lid });
  }

  let t;
  input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(atualiza, 70); });
  input.addEventListener("focus", () => atualiza());
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (lista.hidden) atualiza(); else { ativo = Math.min(itens.length - 1, ativo + 1); marca(); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); ativo = Math.max(0, ativo - 1); marca(); }
    else if (e.key === "Enter") { e.preventDefault(); escolhe(itens[ativo]); }
    else if (e.key === "Escape") abre(false);
    else if (e.key === "Backspace" && !input.value && cidade) { defineCidade(null); atualiza(); }
  });
  lista.addEventListener("pointerdown", (e) => { const it = e.target.closest(".item"); if (!it) return; e.preventDefault(); ativo = +it.dataset.k; escolhe(itens[ativo]); });
  lista.addEventListener("pointermove", (e) => { const it = e.target.closest(".item"); if (it && +it.dataset.k !== ativo) { ativo = +it.dataset.k; marca(); } });
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".busca")) abre(false); });
  confirma.addEventListener("click", () => escolhe(itens[ativo]));

  return { defineCidade, foca: () => input.focus(), busca };
}

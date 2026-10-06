// Busca universal: uma barra que entende cidade, local de votação, bairro, endereço e zona/seção, juntos ou não.
// "102 sul brasília", "pinheiros sp", "recife zona 1 seção 20", "z5 s120", "5/120", "rua augusta".
const UFS = new Set("ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to".split(" "));
const MAX = { cidade: 4, local: 7, bairro: 3, secao: 6, perto: 6 };

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

// cada palavra da busca precisa começar alguma palavra do texto
function casa(toks, alvoPalavras) {
  return toks.every((t) => alvoPalavras.some((w) => w.startsWith(t)));
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

function distancia([a1, b1], [a2, b2]) {
  const r = Math.PI / 180, dA = (a2 - a1) * r, dB = (b2 - b1) * r;
  const h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dB / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h)); // km
}
const km = (d) => (d < 1 ? `${Math.round(d * 100) * 10} m` : `${d.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);

export function criaBusca({ json, municipios, ufGeo, input, lista, contexto, perto, confirma, aoEscolher, recentes }) {
  const porCodigo = new Map(municipios.map((m) => [m.cd, m]));
  const porPrimeira = new Map();
  for (const m of municipios) {
    m.p ??= palavras(m.nome);
    const k = m.p[0];
    if (!porPrimeira.has(k)) porPrimeira.set(k, []);
    porPrimeira.get(k).push(m);
  }
  let cidade = null;      // contexto escolhido (chip)
  let itens = [], ativo = -1, seq = 0, pertoDe = null;

  // ------------------------------------------------------------ fontes
  const locaisDaCidade = async (cd) => {
    const d = await json(`/data/m/${cd}.json`);
    for (const l of d.locais) { l._p ??= palavras(`${l.n} ${l.b} ${l.e} ${l.a || ""}`); l._n ??= palavras(l.n); }
    return d;
  };
  const indiceUf = async (uf) => {
    const rows = await json(`/data/idx/${uf}.json`);
    if (!rows._pronto) {
      rows._pronto = rows.map(([cd, id, n, b, e, a]) => {
        const mun = porCodigo.get(cd);
        return { cd, id, n, b, e, mun, _n: palavras(n), _p: palavras(`${n} ${b} ${e} ${a} ${mun?.nome || ""}`) };
      });
    }
    return rows._pronto;
  };

  function achaCidade(toks, uf) {
    let melhor = null;
    for (let j = 0; j < toks.length; j++) {
      for (const m of porPrimeira.get(toks[j]) || []) {
        if (m.p.length > toks.length - j || !m.p.every((w, k) => toks[j + k] === w)) continue;
        if (uf && m.uf !== uf) continue;
        const nota = m.p.length * 1e7 + (m.uf === ufGeo() ? 5e6 : 0) + m.ns;
        if (!melhor || nota > melhor.nota) melhor = { m, j, nota };
      }
    }
    return melhor;
  }

  // ------------------------------------------------------------ busca
  async function busca(q) {
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
          .sort((a, b) => a[0] - b[0] || (b[1].uf === ufGeo()) - (a[1].uf === ufGeo()) || b[1].ns - a[1].ns)
          .slice(0, MAX.cidade);
        cidadeExata = cs.some(([, m]) => norm(m.nome) === qn);
        if (cs.length) grupos.push({ rot: "Cidades", itens: cs.map(([, m]) => ({ tipo: "cidade", mun: m, t: m.nome, d: m.uf, x: `${m.ns.toLocaleString("pt-BR")} seções`, ic: "cidade", toks: todos })) });
      }
    }
    if (mun) {
      const d = await locaisDaCidade(mun.cd);
      const locais = d.locais.filter((l) => l.v);
      // seções por número
      const numeroSo = !zona && !secao && toks.length === 1 && /^\d+$/.test(toks[0]) ? +toks[0] : null;
      const sAlvo = secao ?? numeroSo;
      if (sAlvo != null || zona != null) {
        const cands = [];
        for (const l of d.locais) {
          if (zona != null && l.z !== zona) continue;
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
      if (texto.length || (zona != null && sAlvo == null)) {
        const achados = locais
          .filter((l) => (zona == null || l.z === zona) && casa(texto, l._p))
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
    } else if (toks.join("").length >= 3 && !cidadeExata) {
      // sem cidade: locais do estado (UF digitada ou a da conexão)
      const ufs = [...new Set([uf, ufGeo()].filter(Boolean))];
      const achados = [];
      for (const u of ufs) {
        for (const r of await indiceUf(u).catch(() => [])) {
          if (casa(toks, r._p)) achados.push({ r, nota: toks.reduce((s, t) => s + (r._n.some((w) => w.startsWith(t)) ? 3 : 1), 0) + bonusFrase(r._p) + (r.mun?.uf === ufGeo() ? 0.5 : 0) + Math.log10((r.mun?.ns || 1)) / 10 });
        }
      }
      achados.sort((a, b) => b.nota - a.nota);
      if (!achados.length && ufs.length) aviso = `Não achamos em ${ufs.join(", ")}. Inclua a cidade (ex.: <b>${esc(frase)} são paulo</b>).`;
      if (achados.length) grupos.push({ rot: ufs.length ? `Locais de votação · ${ufs.join(", ")}` : "Locais de votação", itens: achados.slice(0, MAX.local).map(({ r }) => ({ tipo: "local", cd: r.cd, lid: r.id, t: r.n, d: [r.b, r.mun ? `${r.mun.nome}, ${r.mun.uf}` : ""].filter(Boolean).join(" · "), x: "", ic: "pin", toks })) });
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
        : `Digite também a cidade, ou toque em <b>Perto de mim</b>.`));
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

  perto.addEventListener("click", () => {
    if (!navigator.geolocation) return pinta([], "Seu navegador não informa a localização. Digite a cidade.");
    perto.classList.add("carregando");
    navigator.geolocation.getCurrentPosition(async (p) => {
      const eu = [p.coords.latitude, p.coords.longitude];
      const muns = municipios.filter((m) => m.g).map((m) => [distancia(eu, m.g), m]).sort((a, b) => a[0] - b[0]).slice(0, 4).map(([, m]) => m);
      const cands = [];
      for (const m of muns) {
        const d = await locaisDaCidade(m.cd).catch(() => null);
        for (const l of d?.locais || []) if (l.g && l.v) cands.push([distancia(eu, l.g), l, m]);
      }
      cands.sort((a, b) => a[0] - b[0]);
      perto.classList.remove("carregando");
      pertoDe = eu;
      pinta(cands.length ? [{ rot: "Perto de você", itens: cands.slice(0, MAX.perto).map(([dk, l, m]) => ({ tipo: "local", cd: m.cd, lid: l.id, t: l.n, d: [l.b, `${m.nome}, ${m.uf}`].filter(Boolean).join(" · "), x: km(dk), ic: "pin", toks: [] })) }] : [], "Não achamos locais de votação perto de você.");
    }, () => { perto.classList.remove("carregando"); pinta([], "Sem acesso à localização. Digite a cidade ou o nome da escola."); }, { enableHighAccuracy: false, timeout: 9000, maximumAge: 600000 });
  });

  return { defineCidade, foca: () => input.focus(), busca, get pertoDe() { return pertoDe; } };
}

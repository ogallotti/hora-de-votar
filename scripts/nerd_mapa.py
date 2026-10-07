#!/usr/bin/env python3
"""Mapa da página /nerd: geometria do projeto quem-vota-em-quem (malhas do IBGE e áreas em volta dos locais de votação),
recodificada para os códigos do TSE e somada às estatísticas de cada seção (scripts/nerd.py).

Uso: python3 scripts/nerd.py && python3 scripts/nerd_mapa.py [pasta public/data do quem-vota-em-quem]
     (padrão ~/dev/quem-vota-em-quem/public/data)
Saídas em public/data/nerd/ (versionadas):
    geo-uf.json            estados: {"q", "uf": [[UF, nome, anéis, lx, ly], ...]}
    geo-mun.json           municípios do Brasil: {"q", "mun": [[código TSE, UF, anéis, lx, ly], ...]}
    uf/<uf>/base.json      regiões, municípios, locais e seções do estado, com as estatísticas de cada seção (colunas)
    uf/<uf>/zb.json        zonas e bairros
    uf/<uf>/nomes.json     nome, endereço e bairro de cada local
    uf/<uf>/p<k>.json      polígonos de locais e seções, em pacotes de municípios (o Cloudflare Pages aceita
                           20 mil arquivos por deploy: um arquivo por município não caberia)
Seções do quem-vota (uma por urna com boletim) casam com as nossas por (município, zona, número).
"""
import difflib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "dev/quem-vota-em-quem/public/data"
OUT = ROOT / "public/data/nerd"
SECOES = ROOT / ".cache/nerd-secoes.jsonl"
PACOTE = 700_000           # bytes (sem compressão) por pacote de polígonos
APELIDOS = {"BOA SAUDE": "JANUARIO CICCO"}  # o TSE e o IBGE grafam de jeitos sem semelhança
COLS = ("el", "ap", "t", "bio", "fila", "pico", "ult")  # mesma ordem de nerd-secoes.jsonl, depois de m, z, s


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def chave(s):
    s = "".join(c for c in unicodedata.normalize("NFD", s.upper()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^A-Z0-9]+", " ", s).strip()


def grava(p, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
    return p.stat().st_size


def requant(g, f):
    """Anéis em deltas numa escala → outra escala (os estados do quem-vota vêm em q = 1000)."""
    out = []
    for poly in g:
        ps = []
        for ring in poly:
            x = y = px = py = 0
            d = []
            for i in range(0, len(ring), 2):
                x += ring[i]; y += ring[i + 1]
                ax, ay = round(x * f), round(y * f)
                d += [ax - px, ay - py]; px, py = ax, ay
            ps.append(d)
        out.append(ps)
    return out


def pareia(bm):
    """{código IBGE: código TSE} pelo nome dentro da UF (depois por semelhança)."""
    tse = json.loads((ROOT / "public/data/municipios.json").read_text())  # [uf, cd, nome, h0, ns, centro]
    por_uf = {}
    for m in bm["mun"]:
        por_uf.setdefault(m[1].upper(), []).append(m)
    out = {}
    for uf, lista in por_uf.items():
        livres = {chave(m[2]): m for m in lista}
        faltam = []
        for u, cd, nome, *_ in (x for x in tse if x[0] == uf):
            k = APELIDOS.get(chave(nome), chave(nome))
            if k in livres:
                out[livres.pop(k)[0]] = cd
            else:
                faltam.append((cd, nome))
        for cd, nome in faltam:
            k = chave(nome)
            c = difflib.get_close_matches(k, list(livres), n=1, cutoff=0.6)
            c = c or [x for x in livres if x.startswith(k + " ") or k.startswith(x + " ")][:1]
            if not c:
                raise SystemExit(f"sem contorno no IBGE: {uf} {cd} {nome}")
            out[livres.pop(c[0])[0]] = cd
    return out


def main():
    br = json.loads((FONTE / "br.json").read_text())
    bm = json.loads((FONTE / "br-mun.json").read_text())
    q = bm["q"]
    ibge_tse = pareia(bm)
    f = q / br["q"]
    grava(OUT / "geo-uf.json", {"q": q, "uf": [[u["uf"].upper(), u["nome"], requant(u["g"], f), u["lx"], u["ly"]] for u in br["ufs"]]})
    grava(OUT / "geo-mun.json", {"q": q, "mun": [[ibge_tse[m[0]], m[1].upper(), m[3], m[4], m[5]] for m in bm["mun"]]})
    for velho in ("geo.json",):
        (OUT / velho).unlink(missing_ok=True)

    stats = {}
    for ln in open(SECOES):
        r = json.loads(ln)
        stats[(r[0], r[1], r[2])] = r[3:]
    log(f"{len(stats)} seções com estatística")

    total_pac = casadas = sem = 0
    for pasta in sorted(p for p in FONTE.iterdir() if p.is_dir() and (p / "base.json").exists()):
        uf = pasta.name
        b = json.loads((pasta / "base.json").read_text())
        tse = lambda i: ibge_tse[i]  # noqa: E731
        L, S = b["loc"], b["sec"]
        loc = {"mi": [tse(i) for i in L["mi"]], "z": L["z"], "bi": L["bi"], "x": L["x"], "y": L["y"], "ns": L["ns"]}
        cols = {k: [] for k in COLS}
        for li, nr in zip(S["li"], S["nr"]):
            st = stats.get((loc["mi"][li], L["z"][li], nr))
            if st:
                casadas += 1
            else:
                sem += 1
            for k, v in zip(COLS, st or [None] * len(COLS)):
                cols[k].append(v)
        # polígonos de locais e seções em pacotes de municípios (na ordem do arquivo: vizinhos tendem a ficar juntos)
        pacotes, atual, tam, pac_de = [], {}, 0, {}
        for m in b["mun"]:
            arq = pasta / "m" / f"{m[0]}.json"
            if not arq.exists():
                continue
            txt = arq.read_text()
            if atual and tam + len(txt) > PACOTE:
                pacotes.append(atual); atual, tam = {}, 0
            atual[tse(m[0])] = json.loads(txt)
            tam += len(txt)
        if atual:
            pacotes.append(atual)
        for k, pk in enumerate(pacotes):
            qs = {x["q"] for x in pk.values()}
            assert len(qs) == 1
            grava(OUT / "uf" / uf / f"p{k}.json", {"q": qs.pop(), "m": pk})
            for cd in pk:
                pac_de[cd] = k
        total_pac += len(pacotes)
        base = {
            "uf": b["uf"], "uf_nome": b["uf_nome"], "bounds": b["bounds"], "q": b["q"],
            "macro": b["macro"],
            "mun": [[tse(m[0]), m[1], m[2], m[3], m[4], m[5], m[6]] for m in b["mun"]],
            "loc": loc, "sec": {"li": S["li"], "nr": S["nr"], **cols}, "pac": pac_de,
        }
        grava(OUT / "uf" / uf / "base.json", base)
        zb = json.loads((pasta / "zb.json").read_text())
        zb["bairro"] = [[x[0], x[1], tse(x[2]), *x[3:]] for x in zb["bairro"]]
        grava(OUT / "uf" / uf / "zb.json", zb)
        (OUT / "uf" / uf / "nomes.json").write_text((pasta / "nomes.json").read_text())
        log(f"{uf}: {len(S['li'])} seções, {len(pacotes)} pacotes")
    log(f"seções casadas: {casadas}, sem estatística: {sem}; {total_pac} pacotes de polígonos")


if __name__ == "__main__":
    main()

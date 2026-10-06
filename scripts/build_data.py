#!/usr/bin/env python3
"""Gera public/data/ a partir dos logs coletados (scripts/coleta_log.py) e do cadastro de locais de votação.

Uso: python3 scripts/build_data.py [--ufs ma,ac]
Entradas: .cache/artefatos/log-<uf>-<k>de<n>/log.p<k>.jsonl.gz (coleta nacional) ou .cache/<uf>/log*.jsonl (local)
          .cache/locais/eleitorado_local_votacao_2026_<UF>.csv (baixado se faltar)
Saídas (formato no README):
    public/data/municipios.json         [[uf, código, nome, abertura, seções], ...] para a busca
    public/data/m/<código>.json         locais do município, curva de cada local e do município
    public/data/z/<código>-<zona>.json  curva de cada seção da zona
    public/data/br.json                 curva do Brasil e de cada UF

Métrica: faixas de 15 min contadas a partir da abertura oficial (8h de Brasília = hora local da urna).
  v[i] = eleitores que começaram a votar na faixa i;
  q[i] = desses, quantos pegaram fila: o intervalo desde o eleitor anterior ficou dentro do tempo de mesa típico
         da seção (até 2×, de 30 a 75 s). Intervalo bem maior = a urna ficou esperando alguém chegar.
  Os arquivos de local, município e UF somam v e q de todas as urnas (ns = número de urnas com log).
"""
import argparse
import csv
import gzip
import io
import json
import re
import statistics
import sys
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
OUT = ROOT / "public" / "data"
URL_LOCAIS = "https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip"
UFS = "ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to".split()

FAIXA = 900          # 15 min
FAIXAS = 36          # 9 h de votação
EXTRA = 12           # até 3 h depois do horário oficial (fila no encerramento)
# UFs com 2º turno para governador em 2026 (resultado oficial do 1º turno); nas demais o 2º turno é só presidente
GOV2 = {"ac", "am", "df", "es", "rj", "rn", "to"}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- nomes
MINUSC = {"de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "a", "o", "à", "ao", "com", "para"}
SIGLAS = {"EE", "EMEF", "EMEI", "EMEB", "EMEIEF", "CEU", "CEI", "CIEP", "CEFET", "IFMA", "IFSP", "IEMA", "SESI", "SENAI",
          "SESC", "UFRJ", "UFMG", "USP", "UNIP", "PUC", "CE", "EM", "EEF", "EEEFM", "EEEF", "EEM", "EMEFM", "CAIC", "CEM",
          "CED", "CEF", "EC", "CAPS", "UBS", "CMEI", "CEMEI", "EMEIF", "UE", "UEB", "CEMA", "CRAS", "CETI", "ETE", "ETEC",
          "FATEC", "UNEB", "UFBA", "UFPE", "UFC", "UFPR", "UFSC", "UFRGS", "UNB", "IFBA", "IFCE", "IFPE", "II", "III", "IV",
          "VI", "VII", "VIII", "IX", "XI", "XII", "SME", "APAE", "CIAC", "CSU", "EEB", "EEBA", "COHAB", "CDHU", "BNH", "SN"}


def bonito(s):
    """'ESCOLA ESTADUAL JOÃO DE BARROS - EEF' → 'Escola Estadual João de Barros - EEF'."""
    s = re.sub(r"\s+", " ", (s or "").strip())
    out = []
    for i, w in enumerate(s.split(" ")):
        core = re.sub(r"[^\wÀ-ú]", "", w)
        up = core.upper()
        if up in SIGLAS or (len(core) > 1 and not re.search(r"[AEIOUÁÉÍÓÚÂÊÔÃÕÀaeiouáéíóúâêôãõà]", core) and core.isalpha()):
            out.append(w.upper())
        elif i and w.lower() in MINUSC:
            out.append(w.lower())
        else:
            out.append("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")))
    return " ".join(out)


def sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


# ---------------------------------------------------------------- cadastro
def cadastro(uf):
    arq = CACHE / "locais" / f"eleitorado_local_votacao_2026_{uf.upper()}.csv"
    if not arq.exists():
        log("baixando cadastro de locais (zip nacional)")
        z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(URL_LOCAIS, timeout=600).read()))
        arq.parent.mkdir(parents=True, exist_ok=True)
        for n in z.namelist():
            if n.endswith(".csv"):
                (arq.parent / Path(n).name).write_bytes(z.read(n))
    with open(arq, encoding="latin-1") as f:
        yield from csv.DictReader(f, delimiter=";")


# ---------------------------------------------------------------- logs
def registros(uf):
    """Logs da coleta nacional, com as seções recoletadas (urna trocada, scripts/coleta_log.py --refaz) por cima."""
    arqs = sorted(CACHE.glob(f"artefatos/log-{uf}-*/log.p*.jsonl.gz"))
    if arqs:
        ref = CACHE / uf / "log.refeitas.jsonl"
        novos = {}
        if ref.exists():
            for ln in open(ref):
                r = json.loads(ln)
                novos[(r["m"], r["z"], r["s"])] = r
        for a in arqs:
            with gzip.open(a, "rt") as f:
                for ln in f:
                    r = json.loads(ln)
                    yield novos.get((r["m"], r["z"], r["s"]), r)
        return
    for a in sorted((CACHE / uf).glob("log*.jsonl")):
        with open(a) as f:
            yield from map(json.loads, f)


def intervalos(r):
    """[(início, fim, intervalo desde o eleitor anterior ou None)] de cada eleitor, em segundos desde 0h."""
    out, fim, ant = [], 0, None
    for df, d in zip(r["f"], r["d"]):
        fim += df
        ini = fim - d if d >= 0 else fim - 60
        out.append((ini, fim, ini - ant if ant is not None else None))
        ant = fim
    return out


def mesa(ivs):
    """Tempo típico de mesa quando há fila: mediana dos intervalos curtos (até 90 s) entre um eleitor sair e o
    próximo ser identificado. Com poucos intervalos curtos (seção sem fila), usa 20 s."""
    curtos = sorted(g for _, _, g in ivs if g is not None and 0 <= g <= 90)
    return statistics.median(curtos) if len(curtos) >= 10 else 20


def curva(r, h0):
    """Faixas de 15 min a partir de h0 (hora local da abertura oficial):
    v = eleitores que começaram a votar na faixa; q = desses, quantos pegaram fila.
    Pegou fila: o intervalo desde o eleitor anterior ficou dentro do tempo de mesa (até 2× o típico, de 30 a 75 s),
    ou seja, o próximo foi chamado logo; intervalo bem maior = a urna ficou esperando alguém chegar.
    O primeiro eleitor do dia pegou fila se começou nos 2 primeiros minutos da abertura."""
    n = FAIXAS + EXTRA
    v, q = [0] * n, [0] * n
    t0 = h0 * 3600
    ivs = intervalos(r)
    lim = min(75, max(30, 2 * mesa(ivs)))
    for ini, _, g in ivs:
        k = int((ini - t0) // FAIXA)
        if 0 <= k < n:
            v[k] += 1
            if (g is not None and g <= lim) or (g is None and ini - (r.get("ab") or t0) <= 120):
                q[k] += 1
    return v, q, lim


def mediana(xs):
    xs = [x for x in xs if x is not None and x >= 0]
    return statistics.median(xs) if xs else None


def tempos(r, gov2):
    """t1: mediana do tempo de cada eleitor na urna no 1º turno (identificação + 5 cargos), em s;
    t2: estimativa para o 2º turno, medida na seção = identificação + primeiro passo (ir até a cabine e votar no
        1º cargo) + presidente onde também há governador. Conservadora: o 1º cargo do 1º turno (deputado federal)
        tem 4 dígitos, o do 2º turno tem 2;
    me: mediana do intervalo entre um eleitor sair e o próximo ser identificado, quando havia gente esperando (mesa)."""
    t1 = mediana([d for d in r["d"] if d > 0])
    h, pr, p1 = mediana(r.get("h", [])), mediana(r.get("pr", [])), mediana(r.get("p1", []))
    t2 = h + p1 + ((pr or 0) if gov2 else 0) if h is not None and p1 is not None else None
    me = mesa(intervalos(r))
    return {"t1": round(t1) if t1 else None, "t2": round(t2) if t2 else None, "me": round(me) if me is not None else None}


def junta_tempos(ts):
    return {k: (round(mediana([t[k] for t in ts])) if mediana([t[k] for t in ts]) is not None else None)
            for k in ("t1", "t2", "me")} if ts else {}


def abertura(rs):
    """Hora local da abertura oficial: a urna abre às 8h de Brasília (6h no Acre, 7h no MT etc.)."""
    hs = [round(r["ab"] / 3600) for r in rs if r.get("ab")]
    return statistics.mode(hs) if hs else 8


def corta(v, n=None):
    """Tira zeros do fim, sem cortar as 36 faixas oficiais (ou corta no tamanho n, para q acompanhar v)."""
    if n is None:
        n = len(v)
        while n > FAIXAS and not v[n - 1]:
            n -= 1
    return v[:n]


def soma(curvas):
    v = [0] * (FAIXAS + EXTRA)
    o = [0] * (FAIXAS + EXTRA)
    for cv, co in curvas:
        for i in range(len(v)):
            v[i] += cv[i]
            o[i] += co[i]
    return v, o


def grava(p, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ufs", default="")
    a = ap.parse_args()
    ufs = a.ufs.split(",") if a.ufs else UFS
    muns_out, br_uf = [], {}
    br_v, br_o, br_n = [0] * (FAIXAS + EXTRA), [0] * (FAIXAS + EXTRA), 0
    for uf in ufs:
        rs = list(registros(uf))
        if not rs:
            log(f"{uf}: sem logs, pulando")
            continue
        por_sec = {(r["m"], r["z"], r["s"]): r for r in rs if r.get("f")}
        # abertura por município (o fuso muda dentro do AM e do MT, por exemplo)
        h0_mun = {m: abertura([r for r in rs if r["m"] == m]) for m in {r["m"] for r in rs}}
        secoes = defaultdict(dict)   # (m, z) → s → dados
        locais = defaultdict(dict)   # m → id local → dados
        nomes = {}
        sem_log = 0
        linhas = list(cadastro(uf))
        principal_de = {}
        for row in linhas:
            m, z, s = int(row["CD_MUNICIPIO"]), int(row["NR_ZONA"]), int(row["NR_SECAO"])
            if row["CD_TIPO_SECAO_AGREGADA"] == "2":
                principal_de[(m, z, s)] = int(row["NR_SECAO_PRINCIPAL"])
        for row in linhas:
            m, z, s = int(row["CD_MUNICIPIO"]), int(row["NR_ZONA"]), int(row["NR_SECAO"])
            nomes[m] = bonito(row["NM_MUNICIPIO"])
            h0 = h0_mun.get(m, 8)
            lid = f"{z}-{row['NR_LOCAL_VOTACAO']}"
            loc = locais[m].setdefault(lid, {
                "n": bonito(row["NM_LOCAL_VOTACAO"]), "e": bonito(row["DS_ENDERECO"]), "b": bonito(row["NM_BAIRRO"]),
                "z": z, "s": [], "_c": []})
            orig = bonito(row["NM_LOCAL_VOTACAO_ORIGINAL"])
            if orig and orig != loc["n"]:
                loc.setdefault("a", orig)  # nome antigo, para a busca achar quem procura pelo local de sempre
            loc["s"].append(s)
            if (m, z, s) in principal_de:
                secoes[(m, z)][s] = {"p": principal_de[(m, z, s)]}
                continue
            r = por_sec.get((m, z, s))
            if not r:
                sem_log += 1
                continue
            v, q, _ = curva(r, h0)
            loc["_c"].append((v, q))
            t = tempos(r, uf in GOV2)
            loc["_t"] = loc.get("_t", []) + [t]
            secoes[(m, z)][s] = {"v": corta(v), "q": corta(q, len(v)), "n": len(r["f"]), **t}
        uf_v, uf_o, uf_n = [0] * (FAIXAS + EXTRA), [0] * (FAIXAS + EXTRA), 0
        for m, ls in locais.items():
            mv, mo = soma(c for l in ls.values() for c in l["_c"])
            nm = sum(len(l["_c"]) for l in ls.values())
            out_locais = []
            for lid, l in sorted(ls.items(), key=lambda kv: kv[1]["n"]):
                c = l.pop("_c")
                l.update(junta_tempos(l.pop("_t", [])))
                l["s"] = sorted(set(l["s"]))
                if c:
                    lv, lo = soma(c)
                    l["v"], l["q"], l["ns"] = corta(lv), corta(lo, len(corta(lv))), len(c)
                l["id"] = lid
                out_locais.append(l)
            mt = junta_tempos([{k: l.get(k) for k in ("t1", "t2", "me")} for l in out_locais if l.get("t1")])
            grava(OUT / "m" / f"{m}.json", {"uf": uf.upper(), "cd": m, "nome": nomes[m], "h0": h0_mun.get(m, 8), **mt,
                                           "v": corta(mv), "q": corta(mo, len(corta(mv))), "ns": nm,
                                           "locais": out_locais})
            muns_out.append([uf.upper(), m, nomes[m], h0_mun.get(m, 8), sum(len(l["s"]) for l in out_locais)])
            for i in range(FAIXAS + EXTRA):
                uf_v[i] += mv[i]
                uf_o[i] += mo[i]
            uf_n += nm
        for (m, z), ss in secoes.items():
            grava(OUT / "z" / f"{m}-{z}.json", {str(s): d for s, d in sorted(ss.items())})
        br_uf[uf.upper()] = {"v": corta(uf_v), "q": corta(uf_o, len(corta(uf_v))), "ns": uf_n,
                             "h0": statistics.mode(h0_mun.values()) if h0_mun else 8}
        if br_uf[uf.upper()]["h0"] == 8:  # Brasil no horário de Brasília: só soma quem abre às 8h locais
            for i in range(FAIXAS + EXTRA):
                br_v[i] += uf_v[i]
                br_o[i] += uf_o[i]
            br_n += uf_n
        log(f"{uf}: {len(por_sec)} seções com log, {sem_log} sem log, {len(locais)} municípios")
    grava(OUT / "br.json", {"v": corta(br_v), "q": corta(br_o, len(corta(br_v))), "ns": br_n, "uf": br_uf})
    # municipios.json acumula entre execuções parciais (--ufs)
    idx = OUT / "municipios.json"
    antigos = [x for x in json.loads(idx.read_text())] if idx.exists() else []
    feitos = {u.upper() for u in ufs}
    todos = [x for x in antigos if x[0] not in feitos] + muns_out
    todos.sort(key=lambda x: (sem_acento(x[2]), x[0]))
    grava(idx, todos)
    log(f"ok: {len(todos)} municípios no índice")


if __name__ == "__main__":
    main()

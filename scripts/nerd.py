#!/usr/bin/env python3
"""Estatísticas para nerds (página /nerd): tudo o que os logs das urnas contam sobre o 1º turno.

Uso: python3 scripts/nerd.py            (depois de scripts/build_data.py; lê os mesmos logs e o cadastro)
     python3 scripts/nerd_mapa.py       (o mapa: geometria do quem-vota-em-quem com estas estatísticas)
Saídas:
    public/data/nerd/br.json   números do Brasil, recordes, distribuições (horário, tempo para votar) e tabela por UF
    public/data/nerd/mun.json  métricas por município em colunas ({"cd": [...], "t": [...], ...}), para o mapa
Também grava .cache/nerd-secoes.jsonl (cada seção), que scripts/nerd_mapa.py junta à geometria.

Horários em hora de Brasília (a urna marca a hora local; a abertura oficial é às 8h de Brasília).
Medianas de município e UF: dos eleitores (contagem por segundo); recordes só com seções de 50 eleitores ou mais.
"""
import heapq
import sys
import json
import statistics
from collections import Counter, defaultdict

from build_data import (EXTRA, FAIXA, FAIXAS, OUT, UFS, abertura, bonito, cadastro, curva, intervalos, log,
                        registros, GOV2)

PASTA = OUT / "nerd"
CACHE_SEC = OUT.parent.parent / ".cache" / "nerd-secoes.jsonl"  # [m, z, s, eleitores, aptos, t, bio, fila, pico, último]
MIN_REC = 50          # eleitores mínimos para uma seção entrar nos recordes
TETO = 1800           # s: contagens por segundo vão até 30 min (o resto cai no último)
N_REC = 5             # quantos de cada recorde


def mediana_cont(c, n=None):
    """Mediana (ou quantil n ∈ [0,1]) de um Counter {segundos: eleitores}."""
    tot = sum(c.values())
    if not tot:
        return None
    alvo, acc = tot * (0.5 if n is None else n), 0
    for k in sorted(c):
        acc += c[k]
        if acc >= alvo:
            return k
    return None


def faixa_hist(c, passo, teto):
    """Histograma de um Counter em faixas de `passo` s até `teto` (a última junta o resto)."""
    n = teto // passo
    h = [0] * (n + 1)
    for k, x in c.items():
        h[min(n, k // passo)] += x
    return h


class Grupo:
    """Acumula um recorte (Brasil, UF, município)."""

    def __init__(self):
        self.ns = self.el = self.aptos = self.el_c = 0
        self.d, self.h, self.pr, self.gv = Counter(), Counter(), Counter(), Counter()
        self.v, self.q = 0, 0
        self.horas = [0] * ((FAIXAS + EXTRA))   # eleitores por faixa de 10 min, em hora de Brasília a partir das 8h
        self.ult = None      # último voto (s desde 0h, Brasília)
        self.cabine = 0      # s somados dentro da cabine

    def soma(self, r, h0, aptos, cv):
        n = len(r["f"])
        self.ns += 1
        self.el += n
        if aptos and n <= aptos:  # cadastro desencontrado (mais votos que aptos) fica fora do comparecimento
            self.aptos += aptos
            self.el_c += n
        for chave, cont in (("d", self.d), ("h", self.h), ("pr", self.pr), ("gv", self.gv)):
            for x in r.get(chave, []):
                if x is not None and x > 0:
                    cont[min(TETO, int(x))] += 1
        self.cabine += sum(x for x in r["d"] if x > 0)
        v, q, _ = cv
        self.v += sum(v[:FAIXAS])
        self.q += sum(q[:FAIXAS])
        for i, x in enumerate(v):
            self.horas[i] += x
        fim = sum(r["f"]) - (h0 - 8) * 3600
        self.ult = fim if self.ult is None else max(self.ult, fim)

    def resumo(self):
        return {
            "ns": self.ns, "el": self.el,
            "comp": round(100 * self.el_c / self.aptos, 1) if self.aptos else None,
            "t": mediana_cont(self.d), "bio": mediana_cont(self.h), "pr": mediana_cont(self.pr), "gv": mediana_cont(self.gv),
            "fila": round(100 * self.q / self.v, 1) if self.v else None,
            "pico": max(range(FAIXAS), key=lambda i: self.horas[i]) if self.el else None,
            "ult": self.ult,
        }


def maior_fila(v, q, lim=0.8):
    """Maior sequência de faixas oficiais com quase todos (≥ 80%) pegando fila, em faixas."""
    melhor = atual = 0
    for i in range(FAIXAS):
        if v[i] >= 2 and q[i] >= lim * v[i]:
            atual += 1
            melhor = max(melhor, atual)
        else:
            atual = 0
    return melhor


def maior_vazio(r, h0):
    """Maior intervalo (s) sem ninguém votando dentro do horário oficial (entre dois eleitores)."""
    a, b = h0 * 3600, h0 * 3600 + FAIXAS * FAIXA
    ivs = intervalos(r)
    m = 0
    for (ini, _, g) in ivs:
        if g is not None and a <= ini - g and ini <= b:
            m = max(m, g)
    return m


class Recordes:
    """Os N maiores (ou menores) de cada recorde, com onde aconteceu."""

    def __init__(self):
        self.h = defaultdict(list)

    def poe(self, nome, valor, onde, maior=True, desempate=0):
        if valor is None:
            return
        k = (valor if maior else -valor, desempate)
        lst = self.h[nome]
        item = (k, onde["m"], onde["z"], onde["s"], valor)
        if len(lst) < N_REC * 4:
            heapq.heappush(lst, item)
        elif item > lst[0]:
            heapq.heapreplace(lst, item)

    def lista(self, nome, onde_de):
        out, vistos = [], set()
        for k, m, z, s, valor in sorted(self.h[nome], reverse=True):
            o = onde_de(m, z, s)
            chave = (m, o.get("l"))
            if chave in vistos:  # um por local: senão o pódio vira 5 seções da mesma escola
                continue
            vistos.add(chave)
            out.append({"v": valor, **o})
            if len(out) == N_REC:
                break
        return out


def main():
    br, por_uf, por_mun = Grupo(), {}, {}
    rec = Recordes()
    fila_dia = 0                 # seções com fila contínua por 8 h ou mais
    todos = 0                    # seções (50+ eleitores) com 100% de comparecimento
    secoes = open(CACHE_SEC, "w")  # estatística de cada seção, para o mapa detalhado (scripts/nerd_mapa.py)
    minuto = [0] * (24 * 60)     # votos computados por minuto no Brasil, hora de Brasília
    nomes, uf_de, onde = {}, {}, {}
    agregadas = []               # [m, z, seção agregada, principal]: no mapa, a agregada mostra a urna da principal
    for uf in (sys.argv[1].split(",") if len(sys.argv) > 1 else UFS):  # UFs para teste: nerd.py ac,rr
        rs = [r for r in registros(uf) if r.get("f")]
        if not rs:
            continue
        h0_mun = {m: abertura([r for r in rs if r["m"] == m]) for m in {r["m"] for r in rs}}
        aptos, principal = Counter(), {}
        for row in cadastro(uf):
            m, z, s = int(row["CD_MUNICIPIO"]), int(row["NR_ZONA"]), int(row["NR_SECAO"])
            nomes[m] = bonito(row["NM_MUNICIPIO"])
            uf_de[m] = uf.upper()
            p = int(row["NR_SECAO_PRINCIPAL"]) if row["CD_TIPO_SECAO_AGREGADA"] == "2" else s
            try:
                aptos[(m, z, p)] += int(row["QT_ELEITOR_SECAO"] or 0)
            except ValueError:
                pass
            if p == s:
                onde[(m, z, s)] = (bonito(row["NM_LOCAL_VOTACAO"]), f"{z}-{row['NR_LOCAL_VOTACAO']}")
            else:
                agregadas.append([m, z, s, p])
        gu = por_uf.setdefault(uf.upper(), Grupo())
        for r in rs:
            m, z, s = r["m"], r["z"], r["s"]
            h0 = h0_mun.get(m, 8)
            cv = curva(r, h0)
            ap = aptos.get((m, z, s))
            for g in (br, gu, por_mun.setdefault(m, Grupo())):
                g.soma(r, h0, ap, cv)
            fim = 0
            for df in r["f"]:
                fim += df
                t = fim - (h0 - 8) * 3600
                if 0 <= t < 24 * 3600:
                    minuto[t // 60] += 1
            n = len(r["f"])
            v, q, _ = cv
            ds = [x for x in r["d"] if x > 0]
            hs = [x for x in r.get("h", []) if x and x > 0]
            sv = sum(v[:FAIXAS])
            secoes.write(json.dumps([m, z, s, n, ap if ap and n <= ap else None,
                                     round(statistics.median(ds)) if ds else None, round(statistics.median(hs)) if hs else None,
                                     round(100 * sum(q[:FAIXAS]) / sv, 1) if sv else None,
                                     max(range(FAIXAS), key=lambda i: v[i]) if sv else None, fim - (h0 - 8) * 3600], separators=(",", ":")) + "\n")
            if n < MIN_REC:
                continue
            o = {"m": m, "z": z, "s": s}
            if ds:
                med = statistics.median(ds)
                rec.poe("rapida", round(med), o, maior=False)
                rec.poe("lenta", round(med), o)
            if len(hs) >= MIN_REC // 2:
                rec.poe("biometria", round(statistics.median(hs)), o)
            rec.poe("ultimo", fim - (h0 - 8) * 3600, o)
            rec.poe("cheia", n, o)
            mf = maior_fila(cv[0], cv[1])
            rec.poe("fila", mf * FAIXA, o, desempate=n)  # empate (fila o dia todo): a mais cheia
            if mf * FAIXA >= 8 * 3600:
                fila_dia += 1
            rec.poe("vazia", maior_vazio(r, h0), o)
            if ap and n == ap:
                rec.poe("todos", n, o)  # todo mundo votou: a maior seção assim primeiro
                todos += 1
        log(f"{uf}: {len(rs)} seções")

    def onde_de(m, z, s):
        nome, lid = onde.get((m, z, s), ("", None))
        return {"cd": m, "mun": nomes.get(m, ""), "uf": uf_de.get(m, ""), "z": z, "s": s, "local": nome, "l": lid}

    secoes.close()
    recordes = {k: rec.lista(k, onde_de) for k in ("rapida", "lenta", "biometria", "ultimo", "cheia", "fila", "vazia", "todos")}
    pico_min = max(range(len(minuto)), key=lambda i: minuto[i])
    res_br = br.resumo()
    ufs = {u: g.resumo() for u, g in sorted(por_uf.items())}
    saida = {
        "gerado": "1º turno, 4/10/2026",
        "br": {**res_br, "cabine_anos": round(br.cabine / (3600 * 24 * 365), 1),
               "p10": mediana_cont(br.d, 0.1), "p90": mediana_cont(br.d, 0.9), "p99": mediana_cont(br.d, 0.99),
               "bio60": round(100 * sum(x for k, x in br.h.items() if k > 60) / max(1, sum(br.h.values())), 1),
               "pico_min": pico_min * 60, "pico_min_n": minuto[pico_min],
               "municipios": len(por_mun), "fila_dia": fila_dia, "todos": todos},
        "horas": br.horas,                                   # eleitores por faixa de 10 min (a partir das 8h de Brasília)
        "minutos": minuto[8 * 60: 20 * 60],                  # votos por minuto, das 8h às 20h de Brasília
        "hist_t": faixa_hist(br.d, 15, 600),                 # tempo para votar, faixas de 15 s até 10 min
        "hist_bio": faixa_hist(br.h, 5, 120),                # identificação na mesa, faixas de 5 s até 2 min
        "ufs": ufs,
        "gov2": sorted(u.upper() for u in GOV2),
        "recordes": recordes,
    }
    PASTA.mkdir(parents=True, exist_ok=True)
    CACHE_SEC.with_name("nerd-agregadas.json").write_text(json.dumps(agregadas))
    (PASTA / "br.json").write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")))
    cols = defaultdict(list)
    for m in sorted(por_mun):
        x = por_mun[m].resumo()
        cols["cd"].append(m)
        cols["nome"].append(nomes.get(m, ""))
        cols["uf"].append(uf_de.get(m, ""))
        for k in ("ns", "el", "comp", "t", "bio", "pr", "gv", "fila", "pico", "ult"):
            cols[k].append(x[k])
    (PASTA / "mun.json").write_text(json.dumps(cols, ensure_ascii=False, separators=(",", ":")))
    log(f"nerd: {res_br['el']} eleitores, {res_br['ns']} seções, {len(por_mun)} municípios; "
        f"{saida['br']['cabine_anos']} anos na cabine; pico {pico_min // 60}h{pico_min % 60:02d} ({minuto[pico_min]} votos)")


if __name__ == "__main__":
    main()

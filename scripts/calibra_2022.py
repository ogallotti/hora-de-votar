#!/usr/bin/env python3
"""Prepara a amostra de 2022 (scripts/coleta_2022.py) para calibrar e testar a previsão do 2º turno.

Uso: python3 scripts/calibra_2022.py   → .cache/2022/calibra.json (entrada de scripts/calibra_2022.mjs)
Para cada seção da amostra, nos dois turnos de 2022: curva (v, q) em faixas do build, tempos medidos (t1, me) e a
estimativa de tempo do 2º turno feita só com o 1º (t2 de build_data.tempos), mais o tempo real no 2º turno.
Para cada UF: perfil de chegada das seções sem fila no 1º e no 2º turno, e se houve 2º turno para governador.
"""
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_data as b  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PASTA = ROOT / ".cache" / "2022"


def h0(rs):
    hs = [round(r["ab"] / 3600) for r in rs if r.get("ab")]
    return statistics.mode(hs) if hs else 8


def main():
    secoes, ufs = [], {}
    for arq in sorted(PASTA.glob("??.jsonl")):
        uf = arq.stem.upper()
        regs = [json.loads(l) for l in open(arq)]
        if not regs:
            continue
        gov2 = sum(1 for r in regs if any(x >= 0 for x in r["t2"].get("gv", []))) > len(regs) / 2
        a1, a2 = h0([r["t1"] for r in regs]), h0([r["t2"] for r in regs])
        c1, c2 = [], []
        for r in regs:
            v1, q1, _ = b.curva(r["t1"], a1)
            v2, q2, _ = b.curva(r["t2"], a2)
            e1 = b.tempos(r["t1"], gov2)          # t1, t2 estimado (só com o 1º turno), me
            real = b.mediana([d for d in r["t2"]["d"] if d > 0])
            me2 = b.mesa(b.intervalos(r["t2"]))
            c1.append((v1, q1)); c2.append((v2, q2))
            secoes.append({"uf": uf, "m": r["m"], "z": r["z"], "s": r["s"], "h0": a1,
                           "v1": b.corta(v1), "q1": b.corta(q1, len(b.corta(v1))), "n1": len(r["t1"]["f"]),
                           "v2": b.corta(v2), "q2": b.corta(q2, len(b.corta(v2))), "n2": len(r["t2"]["f"]),
                           "t1": e1["t1"], "t2est": e1["t2"], "me1": e1["me"], "t2real": round(real) if real else None, "me2": round(me2)})
        ufs[uf] = {"gov2": gov2, "h0": a1, "perfil1": b.perfil(c1), "perfil2": b.perfil(c2),
                   "livres1": sum(1 for v, q in c1 if b.saturada(v, q) == 0), "livres2": sum(1 for v, q in c2 if b.saturada(v, q) == 0)}
        print(f"{uf}: {len(regs)} seções, 2º turno para governador: {'sim' if gov2 else 'não'}, "
              f"sem fila no 1º/2º: {ufs[uf]['livres1']}/{ufs[uf]['livres2']}", file=sys.stderr)
    (PASTA / "calibra.json").write_text(json.dumps({"faixa": b.FAIXA, "secoes": secoes, "ufs": ufs}, separators=(",", ":")))
    print(f"ok: {len(secoes)} seções → {PASTA / 'calibra.json'}", file=sys.stderr)


if __name__ == "__main__":
    main()

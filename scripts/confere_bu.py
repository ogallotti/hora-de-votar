#!/usr/bin/env python3
"""Confere o total de eleitores de cada log com o comparecimento do boletim de urna (BU).

Uso: python3 scripts/confere_bu.py [--ufs df,es] [--bu ~/dev/quem-vota-em-quem/.cache]
O BU vem do resumo do projeto quem-vota-em-quem (secoes.p*.jsonl.gz, campo c.1.cp = comparecimento para presidente,
que inclui voto em trânsito). Imprime, por UF, quantas seções batem exatamente, quantas diferem e as maiores diferenças.
"""
import argparse
import gzip
import json
from pathlib import Path

import build_data as b

ap = argparse.ArgumentParser()
ap.add_argument("--ufs", default="")
ap.add_argument("--bu", default=str(Path.home() / "dev/quem-vota-em-quem/.cache"))
a = ap.parse_args()
for uf in (a.ufs.split(",") if a.ufs else b.UFS):
    bu = {}
    for arq in Path(a.bu, uf).glob("secoes.p*.jsonl.gz"):
        for ln in gzip.open(arq, "rt"):
            r = json.loads(ln)
            if "1" in r["c"]:
                bu[(r["m"], r["z"], r["s"])] = r["c"]["1"]["cp"]
    if not bu:
        continue
    igual = dif = sem = 0
    piores = []
    for r in b.registros(uf):
        k = (r["m"], r["z"], r["s"])
        if k not in bu:
            sem += 1
            continue
        n = len(r.get("f", []))
        if n == bu[k]:
            igual += 1
        else:
            dif += 1
            piores.append((abs(n - bu[k]), k, n, bu[k], r.get("q")))
    piores.sort(reverse=True)
    tot = igual + dif
    print(f"{uf}: {igual}/{tot} iguais ({100 * igual / max(tot, 1):.2f}%), {dif} diferentes, {sem} sem BU no resumo")
    for p in piores[:3]:
        print("   ", p)

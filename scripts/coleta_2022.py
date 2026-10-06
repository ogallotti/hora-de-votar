#!/usr/bin/env python3
"""Amostra de seções de 2022 nos dois turnos, para calibrar e testar a previsão do 2º turno.

Uso: python3 scripts/coleta_2022.py --uf ma [--amostra 300] [--trabalhadores 8]
Saída: .cache/2022/<uf>.jsonl, uma linha por seção: {"m", "z", "s", "t1": registro do 1º turno, "t2": registro do 2º}
       (cada registro no formato de scripts/coleta_log.py: ab, f, d, h, pr, gv, p1).

Fonte: os arquivos de urna de 2022 já não estão no servidor de resultados; o TSE os publica num zip por UF e turno
(cdn.tse.jus.br/.../arqurnatot/bu_imgbu_logjez_rdv_vscmr_2022_<1t|2t>_<UF>.zip, alguns GB cada). Lemos o zip pela
rede, aos pedaços (HTTP Range): só o índice e os logs da amostra. O log de 2022 é 7z (precisa de 7z ou 7zz).
O log do 2º turno traz também o 1º turno (mesma urna): a data de cada linha separa.
"""
import argparse
import io
import json
import random
import sys
import threading
import time
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from coleta_log import arquivos_jez, extrai  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
URL = "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/arqurnatot/bu_imgbu_logjez_rdv_vscmr_2022_{t}_{uf}.zip"
TURNOS = {"t1": ("1t", "406", b"02/10/2022"), "t2": ("2t", "407", b"30/10/2022")}


class Remoto(io.RawIOBase):
    """Arquivo remoto só-leitura por HTTP Range, para o zipfile ler o índice e alguns membros sem baixar o resto."""

    def __init__(self, url, bloco=1 << 18):
        self.url, self.pos, self.bloco, self.cache = url, 0, bloco, {}
        for t in range(6):
            try:
                r = urllib.request.urlopen(urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"}), timeout=60)
                break
            except Exception:  # noqa: BLE001 - o CDN corta conexões sob carga: espera e tenta de novo
                if t == 5:
                    raise
                time.sleep(3 * (t + 1))
        self.tam = int(r.headers["Content-Length"])

    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.tam + off
        return self.pos

    def _bloco(self, i):
        if i not in self.cache:
            a, b = i * self.bloco, min(self.tam, (i + 1) * self.bloco) - 1
            for t in range(6):
                try:
                    req = urllib.request.Request(self.url, headers={"User-Agent": "Mozilla/5.0", "Range": f"bytes={a}-{b}"})
                    self.cache[i] = urllib.request.urlopen(req, timeout=90).read()
                    break
                except Exception:  # noqa: BLE001
                    if t == 5:
                        raise
                    time.sleep(2 * (t + 1))
            if len(self.cache) > 32:
                self.cache.pop(next(iter(self.cache)))
        return self.cache[i]

    def read(self, n=-1):
        if n < 0:
            n = self.tam - self.pos
        out = bytearray()
        while n > 0 and self.pos < self.tam:
            i, o = divmod(self.pos, self.bloco)
            pedaco = self._bloco(i)[o:o + n]
            out += pedaco
            self.pos += len(pedaco)
            n -= len(pedaco)
        return bytes(out)

    def readinto(self, b):
        d = self.read(len(b))
        b[:len(d)] = d
        return len(d)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--uf", required=True)
    ap.add_argument("--amostra", type=int, default=300)
    ap.add_argument("--trabalhadores", type=int, default=8)
    a = ap.parse_args()
    uf = a.uf.upper()
    zips, locais = {}, threading.local()
    for k, (t, p, _) in TURNOS.items():
        zips[k] = (URL.format(t=t, uf=uf), p)
    # índice: seções com log nos dois turnos
    secoes = {}
    for k, (url, p) in zips.items():
        nomes = zipfile.ZipFile(Remoto(url)).namelist()
        secoes[k] = {n[7:20] for n in nomes if n.endswith(".logjez") and n.startswith(f"o00{p}-")}
    comuns = sorted(secoes["t1"] & secoes["t2"])
    random.Random(2022).shuffle(comuns)
    alvo = comuns[: a.amostra]
    print(f"{uf}: {len(comuns)} seções nos dois turnos; amostra {len(alvo)}", file=sys.stderr, flush=True)

    def zip_da_thread(k):
        if not hasattr(locais, k):  # um leitor por thread (o zipfile não é seguro entre threads)
            setattr(locais, k, zipfile.ZipFile(Remoto(zips[k][0])))
        return getattr(locais, k)

    def uma(cod):
        reg = {"m": int(cod[:5]), "z": int(cod[5:9]), "s": int(cod[9:13])}
        for k, (_, p, dia) in TURNOS.items():
            dados = zip_da_thread(k).read(f"o00{p}-{cod}.logjez")
            reg[k] = extrai(arquivos_jez(dados), dia)
        return reg

    out, t0 = [], time.time()
    with ThreadPoolExecutor(a.trabalhadores) as ex:
        for i, r in enumerate(ex.map(uma, alvo), 1):
            if r["t1"]["f"] and r["t2"]["f"]:
                out.append(r)
            if i % 100 == 0:
                print(f"  {i}/{len(alvo)} em {time.time() - t0:.0f}s", file=sys.stderr, flush=True)
    dest = ROOT / ".cache" / "2022" / f"{uf.lower()}.jsonl"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text("".join(json.dumps(r, separators=(",", ":")) + "\n" for r in out))
    print(f"ok: {len(out)} seções com os dois turnos em {time.time() - t0:.0f}s → {dest}", file=sys.stderr)


if __name__ == "__main__":
    main()

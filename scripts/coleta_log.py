#!/usr/bin/env python3
"""Coleta o log de urna de todas as seções de uma UF e extrai o horário de cada eleitor no 1º turno de 2026.

Uso:   python3 scripts/coleta_log.py --uf ma [--trabalhadores 10] [--parte 2/6] [--limite N]
       --parte k/n   só a k-ésima de n fatias contíguas das seções (para rodar em paralelo no GitHub Actions)
Saída: .cache/<uf>/log.jsonl (ou log.p<k>.jsonl com --parte), uma linha por seção:
    {"m": município TSE, "z": zona, "s": seção,
     "ab": "Urna pronta para receber votos" (segundos desde 0h, hora local da urna),
     "f": fim de cada eleitor ("O voto do eleitor foi computado"), em deltas de segundos (o 1º é absoluto),
     "d": duração de cada eleitor, do identificador digitado pelo mesário até o voto computado (-1 se não achou),
     "h": identificação de cada eleitor, do identificador digitado até "Eleitor foi habilitado" (biometria; -1 se não achou),
     "pr": tempo de cada eleitor no voto para presidente (da confirmação anterior até a de presidente; -1 se não votou),
     "gv": idem para governador (base para estimar o 2º turno, que só tem esses dois cargos),
     "q": arquivos de log dentro do .jez}
O log bruto (~85 KB por seção) é lido em memória e descartado.

Por que log: o boletim de urna só tem totais; o log (log.jez, zip com logd.dat) registra cada evento com hora.
Por eleitor:  Aguardando digitação do identificador → Identificador do eleitor digitado pelo mesário → (biometria)
              → Eleitor foi habilitado → Voto confirmado para [cargo] ×N → O voto do eleitor foi computado.
O total de "computado" bate com o comparecimento do BU (conferido em MA, seção 07072/0049/0064: 183 = 183).

O TSE responde HTTP 429 por IP sob carga: por isso a coleta nacional roda em fatias no GitHub Actions.
Seções agregadas não têm arquivos próprios (404 no aux.json): os eleitores delas votam na urna da seção principal.
"""
import argparse
import io
import json
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLEITO = 3220  # 1º turno de 2026
DIA = b"04/10/2026"
BASE = f"https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/{PLEITO}"

FIM = b"O voto do eleitor foi computado"
INICIO = b"Identificador do eleitor digitado pelo mes"  # "mesário" vem em latin-1
HABILITADO = b"Eleitor foi habilitado"
PRONTA = b"Urna pronta para receber votos"
CONFIRMADO = b"Voto confirmado para ["


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url, tentativas=8):
    for t in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (pesquisa eleitoral)"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404 or t == tentativas - 1:  # 404: não existe (seção agregada), não adianta repetir
                raise
            time.sleep((5 * 2 ** t) if e.code == 429 else 1.5 * (t + 1))  # 429 = limite por IP
        except Exception:  # noqa: BLE001 - falha de rede vira nova tentativa
            if t == tentativas - 1:
                raise
            time.sleep(1.5 * (t + 1))


def arquivos_jez(dados):
    """Devolve [(nome, bytes)] dos logs dentro do .jez (zip em 2026; 7z em eleições anteriores)."""
    if dados[:4] == b"PK\x03\x04":
        with zipfile.ZipFile(io.BytesIO(dados)) as z:
            return [(n, z.read(n)) for n in z.namelist() if not n.endswith("/")]
    if dados[:6] == b"7z\xbc\xaf\x27\x1c":
        exe = shutil.which("7zz") or shutil.which("7z")
        if not exe:
            raise RuntimeError("log em 7z e não há 7z/7zz instalado")
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "a.7z").write_bytes(dados)
            subprocess.run([exe, "x", "-y", f"-o{d}/x", f"{d}/a.7z"], check=True, capture_output=True)
            return [(p.name, p.read_bytes()) for p in sorted((Path(d) / "x").rglob("*")) if p.is_file()]
    raise RuntimeError(f"formato de log desconhecido: {dados[:8]!r}")


def segundos(linha):
    # "04/10/2026 08:05:20\t..." → segundos desde 0h
    return int(linha[11:13]) * 3600 + int(linha[14:16]) * 60 + int(linha[17:19])


def extrai(arquivos):
    """Eventos do dia da eleição, sem repetir linhas (o .jez pode trazer o log de mais de uma urna da seção)."""
    linhas = set()
    for _, b in arquivos:
        for ln in b.split(b"\n"):
            if ln.startswith(DIA) and (FIM in ln or INICIO in ln or HABILITADO in ln or PRONTA in ln or CONFIRMADO in ln):
                linhas.add(ln.rstrip(b"\r"))
    ab, fins, durs, idents, pres, govs = None, [], [], [], [], []
    inicio = habil = ultimo = None
    passos = {}
    for ln in sorted(linhas):  # mesma data: ordem lexicográfica = ordem temporal (o hash final desempata)
        t = segundos(ln)
        if PRONTA in ln:
            ab = t if ab is None else min(ab, t)
        elif INICIO in ln:
            if inicio is None:
                inicio = t
        elif HABILITADO in ln:
            if habil is None:
                habil = ultimo = t
        elif CONFIRMADO in ln:
            cargo = ln.split(CONFIRMADO, 1)[1].split(b"]", 1)[0].decode("latin-1")
            if ultimo is not None:
                passos[cargo] = passos.get(cargo, 0) + (t - ultimo)
            ultimo = t
        elif FIM in ln:
            ini = inicio if inicio is not None else habil
            fins.append(t)
            durs.append(t - ini if ini is not None and t >= ini else -1)
            idents.append(habil - inicio if habil is not None and inicio is not None and habil >= inicio else -1)
            pres.append(passos.get("Presidente", -1))
            govs.append(passos.get("Governador", -1))
            inicio = habil = ultimo = None
            passos = {}
    deltas = [b - a for a, b in zip([0] + fins, fins)]
    return {"ab": ab, "f": deltas, "d": durs, "h": idents, "pr": pres, "gv": govs}


def processa(uf, m, z, s):
    """Baixa o aux e o log de uma seção e devolve o registro (ou a chave, se é seção agregada sem arquivos)."""
    base = f"{BASE}/dados/{uf}/{m}/{z}/{s}"
    try:
        aux = json.loads(get(f"{base}/p00{PLEITO}-{uf}-m{m}-z{z}-s{s}-aux.json"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return f"{m}/{z}/{s}"
        raise
    com_log = [h for h in aux.get("hashes", []) if any(a["tp"] == "log" for a in h["arq"])]
    if not com_log:
        return {"m": int(m), "z": int(z), "s": int(s), "sem": aux.get("st") or "sem log"}
    h = com_log[-1]  # o mais recente
    nome = next(a["nm"] for a in h["arq"] if a["tp"] == "log")
    arqs = arquivos_jez(get(f"{base}/{h['hash']}/{nome}"))
    r = {"m": int(m), "z": int(z), "s": int(s), **extrai(arqs), "q": [n for n, _ in arqs]}
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--uf", required=True)
    ap.add_argument("--limite", type=int, default=0)
    ap.add_argument("--trabalhadores", type=int, default=10)
    ap.add_argument("--parte", default="")
    a = ap.parse_args()
    uf = a.uf.lower()
    cache = ROOT / ".cache" / uf
    cache.mkdir(parents=True, exist_ok=True)
    cfg = cache / f"{uf}-p00{PLEITO}-cs.json"
    if not cfg.exists():
        cfg.write_bytes(get(f"{BASE}/config/{uf}/{uf}-p00{PLEITO}-cs.json"))
    conf = json.loads(cfg.read_text())
    lista = [(mu["cd"], z["cd"], sc["ns"]) for mu in conf["abr"][0]["mu"] for z in mu["zon"] for sc in z["sec"]]
    if a.limite:
        lista = lista[: a.limite]
    sufixo = ""
    if a.parte:
        k, n = (int(x) for x in a.parte.split("/"))
        lista = lista[(k - 1) * len(lista) // n: k * len(lista) // n]
        sufixo = f".p{k}"
    log(f"{uf.upper()}{sufixo}: {len(lista)} seções")
    out, agregadas, t0 = [], [], time.time()
    pendentes, erros = lista, []
    for rodada in range(4):  # seções que falharam (429, rede) voltam para a fila, com pausa crescente
        if rodada:
            log(f"  rodada {rodada + 1}: {len(pendentes)} seções com erro; esperando {60 * rodada}s")
            time.sleep(60 * rodada)
        erros = []
        with ThreadPoolExecutor(a.trabalhadores) as ex:
            fut = {ex.submit(processa, uf, *x): x for x in pendentes}
            for i, f in enumerate(as_completed(fut), 1):
                try:
                    r = f.result()
                    (agregadas if isinstance(r, str) else out).append(r)
                except Exception as e:  # noqa: BLE001
                    erros.append((fut[f], repr(e)[:160]))
                if i % 1000 == 0:
                    log(f"  {i}/{len(pendentes)} em {time.time() - t0:.0f}s ({len(erros)} erros)")
        if not erros:
            break
        pendentes = [e[0] for e in erros]
    out.sort(key=lambda r: (r["m"], r["z"], r["s"]))
    with open(cache / f"log{sufixo}.jsonl", "w") as f:
        for r in out:
            f.write(json.dumps(r, separators=(",", ":")) + "\n")
    (cache / f"agregadas{sufixo}.txt").write_text("\n".join(sorted(agregadas)) + "\n")
    votos = sum(len(r.get("f", [])) for r in out)
    log(f"ok: {len(out)} seções com log ({votos} eleitores), {len(agregadas)} agregadas, {len(erros)} erros, "
        f"{time.time() - t0:.0f}s")
    for e in erros[:10]:
        log("  erro", e)
    if erros:
        sys.exit("há seções com erro")


if __name__ == "__main__":
    main()

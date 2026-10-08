#!/usr/bin/env python3
"""Tira as pausas longas das falas da narração (deixa no máximo RESPIRO s de cada silêncio) e acelera TEMPO×.

Uso: python3 video/apara_voz.py   (lê e atualiza video/narracao.json)
Para cada fala: grava voz/<nome>-curta.mp3 e guarda em "cortes" os trechos removidos (no tempo da fala original), que
video/narracao.mjs usa para recalcular o tempo de cada palavra. Rodar de novo refaz a partir do arquivo original.
"""
import json, re, subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
LIMIAR, MINIMO, RESPIRO, BORDA = "-38dB", 0.12, 0.08, 0.03
TEMPO = 1.10  # aceleração leve, com o tom preservado (atempo): tira o arrastado das palavras esticadas

def silencios(arq):
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", arq, "-af", f"silencedetect=noise={LIMIAR}:d={MINIMO}", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    ini = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)]
    fim = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    dur = float(re.search(r"Duration: (\d+):(\d+):([\d.]+)", err).groups()[2]) + 60 * int(re.search(r"Duration: (\d+):(\d+)", err).group(2))
    if len(fim) < len(ini):
        fim.append(dur)
    return list(zip(ini, fim)), dur

def main():
    cfg = json.loads((RAIZ / "narracao.json").read_text())
    for f in cfg["falas"]:
        orig = f.get("original") or f["arq"]
        f["original"] = orig
        sil, dur = silencios(str(RAIZ / "audio" / orig))
        cortes = []
        for a, b in sil:
            if a <= 0.01:                      # silêncio do começo: fica só a borda
                cortes.append([0.0, max(0.0, b - BORDA)])
            elif b >= dur - 0.01:              # do fim
                cortes.append([a + BORDA, dur])
            elif b - a > RESPIRO:              # do meio: fica um respiro curto
                meio = (a + b) / 2
                cortes.append([meio - (b - a - RESPIRO) / 2, meio + (b - a - RESPIRO) / 2])
        cortes = [[round(x, 3), round(y, 3)] for x, y in cortes if y - x > 0.005]
        # mantém os trechos entre os cortes
        manter, t = [], 0.0
        for x, y in cortes:
            if x > t: manter.append((t, x))
            t = y
        if t < dur: manter.append((t, dur))
        filtro = "".join(f"[0:a]atrim={x}:{y},asetpts=PTS-STARTPTS,afade=t=in:d=0.006,afade=t=out:st={max(0, y - x - 0.006):.3f}:d=0.006[p{i}];" for i, (x, y) in enumerate(manter))
        filtro += "".join(f"[p{i}]" for i in range(len(manter))) + f"concat=n={len(manter)}:v=0:a=1,atempo={TEMPO}[o]"
        saida = orig.replace(".mp3", "-curta.mp3")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(RAIZ / "audio" / orig), "-filter_complex", filtro, "-map", "[o]", "-b:a", "192k", str(RAIZ / "audio" / saida)], check=True)
        f["arq"], f["cortes"], f["tempo"] = saida, cortes, TEMPO
        tirado = sum(y - x for x, y in cortes)
        print(f"{orig}: {dur:.2f}s → {(dur - tirado) / TEMPO:.2f}s ({len(cortes)} cortes, {TEMPO}×)")
    (RAIZ / "narracao.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n")

if __name__ == "__main__":
    main()

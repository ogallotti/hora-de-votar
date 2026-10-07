# Vídeo de lançamento (33,5 s, 1080×1920)

Fonte do vídeo de lançamento do Hora de votar. Não vai ao ar com o site (fica fora de `public/`).

1. `npx wrangler pages dev public --port 4199` (via `portly temp`) e `node video/grava-ui.mjs busca`: grava o site real no celular, quadro a quadro, com o relógio da página controlado → `video/clipes/busca/`.
2. `python3 -m http.server 4188` na raiz do repositório (via `portly temp`) e `node video/render.mjs` → `video/saida/hora-de-votar-lancamento.mp4`. `--previa` gera só uma folha de contato.

`video/cena.html` é a composição: linha do tempo GSAP pausada, cortes presos à grade de batidas da trilha (`b(k) = 0,034 + 0,5·k` s, 120 BPM) e a lista de efeitos (`SONS`) que o render mistura. Áudio em `video/audio/`: trilha e efeitos gerados no Magnific; `tecla.wav` e `confirma.wav` recortados do som da urna eletrônica. Loudness final −14 LUFS, pico −1,5 dB.

Ritmo: cada frase fica pelo menos 1 s na tela (cartões e notificações entram um por batida). Sons com duração (`som(arq, t, vol, dur)`) acabam junto com o movimento: contador para quando o número para, digitação dura o tempo das letras (no clipe do celular, pelo tempo do próprio clipe, `noVideo()`).

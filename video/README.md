# Vídeo de lançamento (33,5 s, 1080×1920 e 1920×1080)

Fonte do vídeo de lançamento do Hora de votar. Não vai ao ar com o site (fica fora de `public/`).

1. `npx wrangler pages dev public --port 4199` (via `portly temp`) e `node video/grava-ui.mjs busca`: grava o site real no celular, quadro a quadro, com o relógio da página controlado → `video/clipes/busca/`.
2. `python3 -m http.server 4188` na raiz do repositório (via `portly temp`) e `node video/render.mjs` → `video/saida/hora-de-votar-lancamento.mp4`. `--previa` gera só uma folha de contato. `--narrado` gera a versão com narração (sufixo `-narrado`, combinável com `--16x9`) e `--16x9` gera a versão 1920×1080 (X, YouTube): mesma linha do tempo e mesmos sons, layout de `html.largo` em `cena.html` (`cena.html?f=16x9`).

`video/cena.html` é a composição: linha do tempo GSAP pausada, cortes presos à grade de batidas da trilha (`b(k) = 0,034 + 0,5·k` s, 120 BPM) e a lista de efeitos (`SONS`) que o render mistura. Áudio em `video/audio/`: trilha e efeitos gerados no Magnific; `tecla.wav` e `confirma.wav` recortados do som da urna eletrônica. Loudness final −14 LUFS, pico −1,5 dB.

Ritmo: cada frase fica pelo menos 1 s na tela (cartões e notificações entram um por batida). Sons com duração (`som(arq, t, vol, dur)`) acabam junto com o movimento: contador para quando o número para, digitação dura o tempo das letras (no clipe do celular, pelo tempo do próprio clipe, `noVideo()`).

Narração: falas em `video/audio/voz/` (ElevenLabs v3 pelo Magnific, voz Catarina Cordeiro, estabilidade 0,4; o v4 não está liberado na conta), com o texto e as âncoras em `video/narracao.json` ([segundo da palavra na fala, momento da cena]). `python3 video/apara_voz.py` corta as pausas das falas (no máximo 0,08 s por respiro) e acelera 1,1× com o tom preservado, guardando os cortes em `narracao.json`. Na versão narrada (`cena.html?narrado=1`) o texto na tela é o que a narradora diz, e as legendas do celular trocam no tempo da palavra (`legendas`). `video/narracao.mjs` planeja: nenhuma palavra-chave chega antes do seu evento na tela (a imagem chega 0,05 a 0,5 s antes) e, onde a voz ainda está falando, a cena congela em batidas inteiras (a trilha repete o mesmo trecho, então os cortes seguem na batida); a trilha abaixa sob a voz (sidechain). Trocou uma fala: atualize as âncoras com os tempos de palavra do Magnific (`audio_timing_get`).

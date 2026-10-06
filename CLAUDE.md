# Hora de votar · horadevotar.com

**O que é**: site viral e mega simples. A pessoa informa a seção eleitoral (ou o local de votação) e vê, num gráfico, como foi o movimento da urna dela hora a hora no 1º turno de 2026 (04/10), para escolher o melhor horário de votar no 2º turno (25/10). Site estático, zero build (HTML/CSS/JS puro).

**STATUS**: teste (só lê dados públicos do TSE; não manda mensagem a ninguém). Projeto geral, sem vínculo com campanha.

**Onde roda / deploy**: Cloudflare Pages (`public/` estático + `functions/`), **somente via CI** (`.github/workflows/deploy.yml`, wrangler, projeto `hora-de-votar`). Domínio `horadevotar.com` (zona na Cloudflare; registro na Namecheap). Dev local com as funções: `npx wrangler pages dev public --port 4196` (via `portly temp`).

**Rotas** (links compartilháveis, com prévia própria no WhatsApp/X): `/s/<município>/<zona>/<seção>` e `/l/<município>/<zona>-<local>` são servidas por `functions/` (`lib/pagina.js`), que injeta título, descrição e `og:image` no `index.html` via HTMLRewriter; `/og/s/...png`, `/og/l/...png` e `/og/brasil.png` geram a imagem 1200×630 na borda (`lib/imagem.js`, @cf-wasm/og = satori + resvg; fontes estáticas em `public/fonts/og/`; cache na borda). `/api/onde` devolve só a UF aproximada (cf.regionCode) para a busca começar no estado certo. Links antigos com `#/` são convertidos no navegador. `public/js/dados.js`, `modelo.js` e `curva.js` são puros e compartilhados entre navegador e funções.

**Marca**: "hora de" + tecla verde "VOTAR" (a tecla CONFIRMA da urna), fonte Unbounded 800 (`public/fonts/unbounded-800.woff2`). Ícones do app gerados por `node scripts/icones.mjs` a partir de `scripts/icones.html` (servidor de pé). Ícones de marca (WhatsApp, X, Telegram) vêm da Simple Icons; os demais, da Phosphor.

**Front** (tema claro único): `app.js` (orquestra, rotas, compartilhar, stories), `grafico.js` (as duas curvas desenhadas por pontos em canvas: cada ponto é um eleitor real, no minuto em que votou, sobre a curva de fila do 1º turno (cinza) e a estimativa do 2º (verde); no Brasil cada ponto é um lote; a entrada revive o dia; faixas "melhor horário", "também bom" e "evite" (as 2 piores horas do 2º turno); régua de 5 em 5 min com teclado e vibração no melhor horário), `busca.js` (barra única: cidade, local, bairro, endereço, zona/seção, "perto de mim" por geolocalização, recentes no localStorage). Sem som (removido a pedido).

**Dados**
- Fonte: log de cada urna (`log.jez`, zip com `logd.dat`), listado no `aux.json` de cada seção em `resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220/`. Cada eleitor gera "Identificador do eleitor digitado pelo mesário" → … → "O voto do eleitor foi computado". O total de "computado" bate com o comparecimento do BU (78/78 seções conferidas em MA).
- Coleta nacional: `gh workflow run coleta.yml` (fatias em paralelo, um IP por job; o TSE responde 429 por IP). Artefatos `log-<uf>-<k>de<n>` → `.cache/artefatos/`. Local: `python3 scripts/coleta_log.py --uf ma --limite 50`.
- Urna trocada no meio do dia: o log da urna antiga vem num `.jez` dentro do `.jez`. A coleta abre os aninhados; para corrigir uma coleta antiga sem refazer tudo: `python3 scripts/coleta_log.py --uf <uf> --refaz` (grava `.cache/<uf>/log.refeitas.jsonl`, que o build usa por cima).
- Conferência: `cd scripts && python3 confere_bu.py` compara o total de eleitores de cada log com o comparecimento do BU (resumo do quem-vota-em-quem). Esperado: ~100% iguais.
- Build: `python3 scripts/build_data.py` lê os artefatos e o cadastro de locais e gera `public/data/` (versionado: é o que vai ao ar). OG: `node scripts/og.mjs` (servidor de pé).
- **Mudou o formato de `public/data/`? Suba `VERSAO_DADOS` em `public/js/app.js`.** Ela vai na URL dos JSON; sem isso, quem já visitou mistura arquivo antigo em cache (1 h) com código novo (já aconteceu na troca de 15 para 5 min: a curva "acabava" às 11h).
- Formato: `municipios.json` = `[[UF, código, nome, hora local de abertura, seções, [lat, lon] do centro]]`; `idx/<UF>.json` = `[[município, id do local, nome, bairro, endereço, nome antigo]]` (busca sem cidade); locais têm `g` = [lat, lon]; `m/<código>.json` = município com `locais` (`id` = `<zona>-<local>`, `n` nome, `e` endereço, `b` bairro, `a` nome antigo, `z`, `s` seções, `v`/`q` por faixa, `ns` urnas, `t1`/`t2`/`me`); `z/<código>-<zona>.json` = `{seção: {v, q, n, t1, t2, me, t} | {p: seção principal}}`, onde `t` é o minuto de cada eleitor desde a abertura (diferenças em base 62, `~<base36>.` acima de 61; `public/js/tempos.js`); `br.json` = Brasil e `uf`, com `perfil` de chegada.

**Modelo (não negociável: é o que o site afirma)**
- Faixas de 5 min desde a abertura oficial (`FAIXA_MIN`/`OFICIAIS`/`JANELA` em `modelo.js`, `FAIXA`/`FAIXAS` no build; mudar os dois juntos). `v` = eleitores que começaram a votar; `q` = desses, quantos pegaram fila (intervalo desde o eleitor anterior até 2× o tempo típico de mesa da seção, de 30 a 75 s). Curva do 1º turno = % com fila, somando faixas vizinhas (`chanceFila` em `public/js/modelo.js`).
- 2º turno (`procura` + `simula2`): tempo de urna `t2` = identificação + primeiro passo (ir à cabine e 1º voto) + presidente onde há 2º turno para governador (`GOV2` no build: AC, AM, DF, ES, RJ, RN, TO). Procura: urna folgada = quem começou a votar (quem votou após o encerramento volta às 2 últimas horas); urna no limite (% com fila ≥ 90) = eleitores da urna pelo `perfil` de chegada das seções sem fila do estado. Fila simulada minuto a minuto; a curva é a ocupação (= chance de esperar numa fila simples).
- Espera em minutos (`espera` em `modelo.js`): fórmula de Pollaczek-Khinchine, ρ/(1−ρ) × (1+cs²)/2 × S, com ρ = % com fila no 1º turno (medido) ou ocupação simulada no 2º, S = tempo de urna + mesa da seção, cs² = 0,3; ρ limitado a 0,97 ("mais de 30 min"). A simulação fluida sozinha dá espera zero (chegadas regulares), por isso não é usada para minutos.
- Texto sempre "no 1º turno foi assim" (medido) e "estimativa" para o 2º turno e para minutos de espera. Nunca prometer ausência de fila.

**Gotchas**
- Hora do log = hora local da urna. Desde 2022 a votação é no horário de Brasília em todo o país: no Acre a urna abre às 6h locais, no MT/MS/AM/RO/RR às 7h, em Noronha às 9h. O site mostra sempre a hora local (é a do relógio de quem vai votar).
- Seções agregadas não têm arquivos próprios (404 no `aux.json`): os eleitores votam na urna da seção principal (`NR_SECAO_PRINCIPAL` no cadastro).
- O cadastro de locais identifica o local pelo `NR_LOCAL_VOTACAO_ORIGINAL`; 2026 usa vírgula decimal nas coordenadas.
- O 2º turno tem só presidente (e governador em alguns estados): cada eleitor fica menos tempo na cabine. O site diz "no 1º turno foi assim", não promete fila.

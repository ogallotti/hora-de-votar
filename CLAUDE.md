# Hora de votar · horadevotar.com

**O que é**: site viral e mega simples. A pessoa informa a seção eleitoral (ou o local de votação) e vê, num gráfico, como foi o movimento da urna dela hora a hora no 1º turno de 2026 (04/10), para escolher o melhor horário de votar no 2º turno (25/10). Site estático, zero build (HTML/CSS/JS puro).

**STATUS**: teste (só lê dados públicos do TSE; não manda mensagem a ninguém). Projeto geral, sem vínculo com campanha.

**Onde roda / deploy**: Cloudflare Pages, pasta `public/`, **somente via CI** (`.github/workflows/deploy.yml`, wrangler, projeto `hora-de-votar`). Domínio `horadevotar.com`.

**Dados**
- Fonte: log de cada urna (`log.jez`, zip com `logd.dat`), listado no `aux.json` de cada seção em `resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220/`. Cada eleitor gera "Identificador do eleitor digitado pelo mesário" → … → "O voto do eleitor foi computado". O total de "computado" bate com o comparecimento do BU (78/78 seções conferidas em MA).
- Coleta nacional: `gh workflow run coleta.yml` (fatias em paralelo, um IP por job; o TSE responde 429 por IP). Artefatos `log-<uf>-<k>de<n>` → `.cache/artefatos/`. Local: `python3 scripts/coleta_log.py --uf ma --limite 50`.
- Build: `python3 scripts/build_data.py` lê os artefatos e o cadastro de locais e gera `public/data/` (versionado: é o que vai ao ar).

**Gotchas**
- Hora do log = hora local da urna. Desde 2022 a votação é no horário de Brasília em todo o país: no Acre a urna abre às 6h locais, no MT/MS/AM/RO/RR às 7h, em Noronha às 9h. O site mostra sempre a hora local (é a do relógio de quem vai votar).
- Seções agregadas não têm arquivos próprios (404 no `aux.json`): os eleitores votam na urna da seção principal (`NR_SECAO_PRINCIPAL` no cadastro).
- O cadastro de locais identifica o local pelo `NR_LOCAL_VOTACAO_ORIGINAL`; 2026 usa vírgula decimal nas coordenadas.
- O 2º turno tem só presidente (e governador em alguns estados): cada eleitor fica menos tempo na cabine. O site diz "no 1º turno foi assim", não promete fila.

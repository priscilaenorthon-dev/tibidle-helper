# Resultado do teste ao vivo — 2.14.7 (04/10, roteiro da 2.13.7)

Conta u2tag, **nível 83** (era 77 em 02/10), Playwright com a 2.14.7 injetada no início da página (Tampermonkey desligado).
A conta estava na cidade, logo depois de um treino (o jogo mostrou "Parabéns, você concluiu seu treinamento" ao entrar).
Presets dos 4 anotados em `.playwright-mcp/backup-presets-2026-10-04.json` antes de qualquer teste.

## O que o jogo mudou desde a 2.13.7
- **Os assets já não são v170: a página usa `/assets/v185/`** (42 recursos: items.json, items-by-name.json, imbuements.json,
  codex.json, outfits…). O v170 ainda responde para `items-by-name.json` (9.074 itens, contra 9.168 no v185) e para
  `spell-areas.json`, mas **`/assets/v170/imbuements.json` já dá 404**. v167 e v180 dão 404 em tudo.
- A versão muda com frequência (v167 → v170 → v185 em poucos dias) e as versões velhas continuam no ar por um tempo.

## 0. O conserto do patch
- [x] Boot: "catálogos ok — **109 hunts**, 235 magias" (> 70 ✓). Sem a linha "jogo atualizado" na 1ª vez — esperado, nunca
      havia `assets_ver` guardado neste perfil.
- [x] Diagnóstico: 0 erros (`ERROS.total = 0`) durante todo o teste. Console só com ruído do Cloudflare e do PixiJS.
- [x] Equip → ATUALIZAR: "127 peças lidas · 2 trocas sugeridas · 59 dispensáveis", depósito 73/300, sem erro de
      `items-by-name`. "Tools" na ficha: só crowbar e heavy machete (ferramentas de verdade); 6 itens sem `primarytype`.
- [x] Progresso → Forja → Imbuement: a calculadora abriu com os **14 imbuements** (Vampirism, Void, Strike, Lich Shroud,
      Snake Skin, Dragon Hide, Quara Scale, Cloud Fabric, Demon Presence, Swiftness, Slash, Precision, Blockade, Epiphany).
- [ ] Venda rápida com material de imbuement: **não feito** — a mochila só tinha itens do dono (cape, 26 simple dress,
      11 crystal ring raros) e nenhum material. Não vendi nada.
- **Defeito 1 (buscarAsset escolhe versão velha no 1º boot)**: no boot o `carregarCatalogos` baixa hunts e o
  `spell-areas.json` no mesmo `Promise.all`; nessa hora `performance` ainda não tem recurso nenhum do jogo e `CAT.bosses`
  ainda está vazio, então a lista de candidatas é só [guardada, **v170**, v167] e o v170 responde → `assets_ver = v170`.
  Quando o Equip pediu `items-by-name.json` (18:54), a página já tinha o v185 carregado, o v185 respondeu e o helper
  lançou "**jogo atualizado (assets v170 → v185)**: catálogos, ficha dos itens e tabelas de loot serão relidos" —
  um rebaixamento falso (`cat_ts = 0`, `equip_base` limpo, `loot_tab_*` apagadas) por causa da escolha errada no boot,
  não por patch. Converge sozinho no boot seguinte (a guardada v185 vem antes da conhecida), mas custa um download
  dos catálogos e as tabelas de loot do Radar. Conserto sugerido: baixar `spell-areas.json` DEPOIS de `/bosses/select`
  (a cena do boss traz a versão: `bv = ["v185"]`), ou observar o `fetch` do próprio jogo para `/assets/vN/`.
  As hunts do `/hunts/select` não têm `atlas` (campos: id, title, levelMin, levelMax, recommendedLevel, lureTiers,
  maxLure, bestiary, band, premium, monsters, loot, island) — só os bosses dão a versão pelo catálogo.

## 1. Conteúdo novo do patch
- [x] Hunts novas no catálogo (todas aparecem no Scan, na Magia e no Radar): Tibidle Island ganhou Upper/Middle/Lower
      Spikes, Petrified Hollow, Inquisition Warlocks e Inquisition Entrance; Pits of Inferno tem Entrance + 7 Thrones;
      **Forgotten Knowledge** (6 Portals), **Otherworld** (5), **The Inquisition** (7 Seals + Shadow Nexus) e
      **Warzone** (9). Yalahar ganhou Quara's Domain (rec 130). Total 109.
- [x] Acesso às ilhas: o shell do jogo tem `unlockedIslands` e **esta conta só tem `["yalahar"]`**. Zao, Gray Island,
      Pits of Inferno e as 4 ilhas novas estão fechadas para ela. **Defeito 2: o helper não lê isso** — o Radar lista
      Hive Entrance (139k xp/h), Zao Entrance, Souleater's Canyon etc. como "risco médio, nunca testado" em vez de
      "bloqueado: ilha não destravada", e o Scan rápido tentaria entrar. Regra sugerida: `island !== 'tibidle_island'`
      e fora de `unlockedIslands` → bloqueado (como o nível mínimo).
- [x] Bestiário de Quara's Domain Yalahar no catálogo: maxHealth, marcos 3.000 / 6.000 / 12.000 (+4 / +8 / +12).
      Não comparei com a janela do jogo (a conta não tem Yalahar completo? tem — mas não entrei na hunt).
- [x] Thunderscar Peak: loot sem Energy Ring (lightning legs, shockwave amulet, lightning pendant, scale of corruption,
      small amethyst, silver amulet, trousers of the ancients, fragmentos, Balerion Key).
- [x] Equip: nada que antes vinha como "Tools" apareceu de novo nesta conta (ver item 0).

## 2. Radar e Scan
- CALCULAR: **109 mapas em ~14 s**, "calculado agora, nível 83 · kit enxuto, degrau 2". Linha de cima:
  "fator de loot 0,35 (padrão, sem Scan: estimado) · abates ×1 (sem calibração)" — os 6 Scans de 01–02/10 foram
  medidos no nível 76–77 e a calibração só aceita nível ±2 (`tpCalibrar`): no 83 todos saíram. Não é defeito, mas o
  cabeçalho não diz por quê (sugestão: "6 Scans fora do ranking: medidos no nível 77").
- Top 5 por **⚡ 1 combo** (nível 83): Vampire hell 62,2k xp/h · +25,3k ouro/h · baixo; Djinns Marid Territory 47,0k ·
  +9,7k; Orc Fortress 43,5k · +4,7k; Coryms Lair 40,1k · +16,4k; Cyclops Mistrock 39,6k · +16,1k. **Nenhum mapa novo**
  entrou no 1 combo: as ilhas novas saem todas com 5–49 combos e risco alto (5–8 pontos), e Hero Fortress Entrance
  (2 combos, 93,5k) / Giant Spiders POH (2 combos, 87,2k) ficam em "médio, nunca testado". O envelope da party é
  Dragon Lair (vida 1.282, nível 60, n = 7).
- Scan 5 min **Em área** em Vampire hell (lure 6, o único tier) para recalibrar no nível 83: ver abaixo.
- **Scan Vampire hell, Em área, 5 min, lure 6** (18:59–19:04): **74,7k xp/h (raw 69,1k) · +24.740 ouro/h (estável +8.175,
  sorte +1.390) · 2.074 abates/h · tomou 1.180/h · poção 1.144/h · Cav 10 %/m51 · Pal 14 %/m11 · Fei 42 %/m80 · Dru 34 %/m97 ·
  onda 6 morta em 0,7 s + espera 10,1 s (spawn limita)**. Drop raro no meio: spike sword. Kit Em área aplicado nos 4 com
  13 slots (Knight Berserk ≥2 · Front Sweep ≥1; Paladino Divine Caldera ≥2 · avalanche ≥2 · thunderstorm ≥1; Feiticeiro
  Energy Wave ≥2 · Rage of the Skies ≥2 · avalanche ≥2 · thunderstorm ≥1; Druida Strong Ice Wave ≥2 · Eternal Winter ≥2 ·
  avalanche ≥2 · thunderstorm ≥1). Em 02/10 (nível 77, Inteligente, 3 min) o mesmo mapa deu 65,1k raw.
- Fim do Scan: "party de volta à cidade, como estava antes do Scan" e "kits de 4 personagem(ns) devolvidos" — conferi os
  4 perfis no servidor contra o backup: **idênticos** (Berserk ≥1 · Divine Caldera ≥1 + avalanche ≥1 · Energy Wave ≥1 ·
  Strong Ice Wave ≥1, poções e mana potion 0 % como estavam).
- Radar depois do Scan, sem CALCULAR: a linha virou "**Vampire hell medido ⚡ 1 combo · 69,1k · +8,2k · baixo**"
  (`radarAtualizarLinha` da 2.14.4 ✓). O cabeçalho continua "sem Scan: estimado" até o próximo CALCULAR (só a linha é refeita).
- Magia → Inteligente → Vampire hell → CALCULAR O KIT: "**✓ Inteligente calibrado neste mapa**" · "mantém o kit aplicado
  (novo +0 %)" · previsto 70,2k xp/h · 2.107 abates/h · **onda limpa em 0,3 s (⚡ 1 combo)** · lucro +25,6k/h · regeneração
  medida Cav 11,1 · Pal 10,1 · Fei 17,2 · Dru 19,1 · 3.363 triagens + 95 parties em 41 ms. O kit escolhido é exatamente o
  preset do dono (1 magia por personagem, Paladino + avalanche), sem poção de mana.
- Scan A/B: não feito (nenhum mapa novo elegível; Vampire hell já tinha A/B de 01/10).

## 3. Inteligente
- Knight recebe **1 magia de ataque** (Berserk ≥1) em Vampire hell no nível 83.
- Linha "cura X/h pelo tempo que os bichos ficam vivos": **não apareceu** neste mapa, embora o Scan tenha registrado
  "poção 1.144/h" (o Druida ficou em 34 % de vida mínima). Ver se `curaH` entrou no resultado do Scan ou se a linha só
  aparece quando a poção de VIDA é separada da de mana.

## 4. Pendentes antigos
- Não testados (Alertas com item só seu, Dia cruzando meia-noite, Dia do Chrome do dono).

## 5. Fim
- [x] Presets devolvidos pelo próprio Scan (conferido contra o backup). Conta na cidade, como estava.
- Aviso: entrar com o Playwright derrubou a sessão que estivesse aberta no Chrome do dono (uma conexão por conta).

## Defeitos e sugestões (ordem de importância)
1. **Ilhas não destravadas não são "bloqueado"** — Radar e Scan rápido consideram mapas que a conta não pode entrar
   (`unlockedIslands = ["yalahar"]`). Regra: ilha fora de `unlockedIslands` (exceto `tibidle_island`) = bloqueado.
2. **`buscarAsset` no boot escolhe a versão conhecida (v170) antes da do jogo (v185)** e dispara um "jogo atualizado" falso
   no 1º pedido seguinte. Subir `ASSETS_CONHECIDA` para v185 só adia; o certo é ler a versão do próprio jogo (baixar
   `spell-areas.json` depois do `/bosses/select`, cuja cena traz `/assets/vN/`, ou observar o `fetch` do jogo).
3. Cabeçalho do Radar: dizer que os Scans antigos saíram por nível ("6 Scans fora: nível 76–77, você está no 83").
4. A linha "cura X/h" do Inteligente não apareceu com o Scan que gastou poção (item 3).

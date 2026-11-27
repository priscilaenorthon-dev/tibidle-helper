# Protocolo das ações do treinador (aba Progresso)

Levantado em 27/11/2026 no bundle público do jogo (`/_next/static/chunks/*`, baixado sem logar para
`.playwright-mcp/bundle-27-11/`, fora do git) e numa captura só de leitura do `resume` da conta (Playwright).
Nenhuma mensagem de ação foi enviada ao jogo neste levantamento.

**Fonte principal:** o chunk `4218-*.js` traz os esquemas zod de TODAS as mensagens do socket
(`n.re({type:n.eu("<type>"),data:<esquema>})`, 498 tipos) — é dali que saem os formatos de `data` abaixo.
Os textos/regras vêm das traduções pt-BR (chunk `8177-*.js`) e das telas (chunk `page-*.js`).

Convenções que valem para todas:
- Mensagem = `{type, data}` JSON; `requestId` é um texto qualquer não vazio (o jogo usa `crypto.randomUUID()`), e a
  resposta traz o mesmo `requestId`.
- Erro do servidor = `{type:"error", data:{code, key, params}}` (`key` é a tradução `server.*`). Códigos que importam aqui:
  `not_in_city`, `too_far`, `insufficient_gold`, `insufficient_coins`, `invalid_blessing`, `invalid_prey`,
  `prey_replay_em_curso`, `no_attempts`, `boss_no_attempts`, `boss_locked`, `boss_week_lock`, `boss_cooldown`,
  `boss_key_required`, `unknown_boss`, `island_locked`, `already_unlocked`, `unknown_island`, `invasion_unavailable`,
  `selo_off`, `selo_indisponivel`, `selo_cheio`, `selo_incompleto`, `selo_vazio`, `selo_perigo`, `feature_disabled`,
  `already_hunting`, `level_too_low`.
- `meta_result` = `{requestId?, action, applied, gold, goldLocked, coins?, premiumUntil?, notice?:{key,params}, meta?, bag?, …}`.
  É a resposta das ações de prey e bênção (a tela casa por `action` = o `type` enviado e mostra `notice`).
- Classificação do próprio cliente (tabela `vR` no 4218): todas as ações abaixo são `manual_mutation`;
  `ampulheta_get`, `island_shop_quote` e `key_buff_quote` são `external_query` (só leitura).

## Tabela das ações

| ação | type | data | resposta | precisa estar na cidade? | custo |
|---|---|---|---|---|---|
| Sortear a caçada da prey (grátis/ouro) | `prey_hunt_roll` | `{requestId}` | `meta_result` (`action:"prey_hunt_roll"`, `meta.preyHunt` nova) | Não indicado: o menu Prey (UTILIDADES) abre na caçada, sem selo "só na cidade". Servidor não testado. | 1ª troca do dia grátis (`meta.preyHuntRollFreeDay`); depois `meta.rules.listGold` de ouro (50.000 na captura). Descarta a caçada atual e o tempo dela. |
| Sortear bônus da prey de uma vocação | `prey_buff_roll` | `{vocation:"KNIGHT"\|"PALADIN"\|"SORCERER"\|"DRUID", requestId}` | `meta_result` (`action:"prey_buff_roll"`) | Idem acima (não indicado). | 1º sorteio do dia por personagem grátis (`meta.preyBuffs[voc].rollFreeDay`); depois 1 wildcard. O bônus (xp/loot/damage/defense) vem sorteado e o tier sempre sobe (até 10); renova o tempo (2 h). |
| Trancar prey (renovação automática) | `prey_lock_set` | `{target:"hunt"\|<vocação>, on:true\|false, requestId}` | `meta_result` (`action:"prey_lock_set"`; notice "Trava ligada/desligada") | Idem (não indicado). | Ligar não cobra na hora; cada renovação de 2 h consome 1 wildcard. Sem wildcard desliga sozinha (`preyAvisos` kind `expirado_sem_saldo`). |
| Escolher a caçada da prey | `prey_hunt_pick` | `{huntId, requestId}` | `meta_result` (`action:"prey_hunt_pick"`) | Idem (não indicado). | 5 wildcards, sem cortesia diária. Opções em `meta.preyHuntOpcoes[]` (`podeEntrar`, `acimaDoTeto`). |
| Comprar uma bênção | `buy_blessing` | `{id: 2..8, requestId}` | `meta_result` (`action:"buy_blessing"`, notice `server.blessing.recebida`) | Não indicado no cliente (menu UTILIDADES › BLESSING, sem selo de cidade). Texto do jogo: "reative no templo antes da próxima caçada". **Confirmar ao vivo.** | Ouro, preço por nível: nível ≤ 30 → 2.000; 31–119 → 200 × (nível − 20) (enhanced 260 ×); ≥ 120 → 20.000 + 75 × (nível − 120) (enhanced 26.000 + 100 ×). Ids 2–6 normais, 7–8 enhanced. Cada uma corta 8 % da perda de XP; somem na morte. |
| Comprar todas as que faltam | `buy_all_blessings` | `{requestId}` | `meta_result` (`action:"buy_all_blessings"`) | Idem. | Soma das que faltam. |
| Usar ampulheta de treino | `use_item` | `{itemId, qty:1, requestId}` | `use_item_result {requestId, itemId, qty, bag, …}` e depois `ampulheta_state` | Não indicado (botão "Usar" na janela Ampulhetas). | A ampulheta sai da mochila. Itens: Knight 100784/85/86, Paladin 100787/88/89, Druid 100790/91/92, Sorcerer 100793/94/95 = 1 h / 4 h / 8 h. Limite 8 h por vocação por dia; o tempo só corre caçando. |
| Ler as horas de ampulheta (só leitura) | `ampulheta_get` | `{}` | `ampulheta_state {vocacoes:{KNIGHT:{temPersonagem, ms, hojeMs, treinando},…}, resetEm}` | Não. | — |
| Comprar ampulheta | `store_buy` (provável) | `{item:"brief_knight_hourglass_1_gold", requestId, qty?}` | `meta_result` (provável) | Não indicado. | Ouro: brief (1 h) 525.000, steady (4 h) 2.100.000, enduring (8 h) 4.200.000 (`meta.rules.cash[]`). **O botão chama uma função `eP.Xb(id, requestId, undefined, qty)` com a mesma assinatura do `store_buy` do chunk 7335 — confirmar.** |
| Abrir ilha no Silas | `island_deliver` | `{islandId:"zao"\|…(regex ^[a-z0-9_]+$), requestId}` | `island_deliver_result {requestId, bag, bagInstances, unlockedIslands[], gold?, goldLocked?}` | **Provavelmente sim**: o Silas é NPC da cidade (menu NAVEGAÇÃO › SILAS fica "só na cidade" fora dela). Servidor não testado. | Itens + ouro do catálogo público `GET /islands` (`access:{items:[{itemId,quantity}], gold?}`). |
| Trocar itens por tentativas de boss (Silas) | `boss_deliver` | `{bossName, quantity, requestId}` (`quantity` = nº de tentativas) | `boss_deliver_result {requestId, bag, bagInstances, bossAttempts:{<boss>:n}, unlockedBosses?}` | **Provavelmente sim** (Silas, aba BOSSES). Não testado. | Itens de `access.items` do boss × `quantity`. Lista e `attemptsLeft` vêm de `GET /bosses/select` (HTTP com o token de autorização da sessão). |
| Ligar/desligar o boss automático | `boss_auto_set` | `{enabled:true\|false}` | `boss_auto {enabled}` | Não indicado. | — |
| Entrar no boss | `start_hunt` | `{huntId, lure, bossId:"<nome>", autoBoss?:bool}` (o helper já usa: huntId 800) | `hunt_started` / `error` (`boss_no_attempts`, `boss_locked`, `boss_week_lock`, `boss_cooldown`, `boss_key_required`, `level_too_low`) | Sim na prática: trocar de caçada passa pela cidade (pular direto dá erro — visto em 02/11). | 1 tentativa (`attemptsLeft`); alguns bosses pedem chave. |
| Inscrever na Invasão | `invasion_join` | `{requestId}` | `invasion_update {invasao:{…, inscrito:true}, …}` (provável) | Não indicado (botão no ícone da Invasão, `invasao-icone`). | Inscrição sem custo no esquema. Buffs à parte: `invasion_buff_buy {buffId, requestId}` (ouro). |
| Sair da Invasão | `invasion_leave` | `{requestId, confirmar?:true}` | `invasion_leave_data {requestId, apagou, buffsEmRisco[{id,nome,precoGold}]}`; com `confirmar:true` sai | Não indicado. | Buffs comprados para a janela se perdem. |
| Selo: adicionar pacto | `selo_adicionar` | `{huntId, requestId}` | `selo_state` | Não indicado (aba "Selo da Caçada" na tela da caçada). | Ouro: Rolar da faixa × [1, 3, 5] para o 1º/2º/3º pacto. |
| Selo: rolar (Selo cheio) | `selo_rolar` | `{huntId, requestId}` | `selo_state` | Idem. | Rolar da faixa. Faixa = 10 × ⌊nível recomendado da hunt / 10⌋ (mín. 20); Rolar = arredonda(600 × ((faixa + 5)/25)^1,8) para 100 (ou 1.000 se ≥ 10 mil). |
| Selo: limpar | `selo_limpar` | `{huntId, requestId}` | `selo_state` | Idem. | Grátis. |
| Selo: ligar | `selo_ligar` | `{huntId, perigoAceito?:true}` (sem requestId) | `selo_state` | Idem. | Por hora caçada nesta hunt: 100 × arredonda(Rolar × Σ arredonda(10 × peso do tier) / 1000); pesos por tier T1..T5 = 4,3 / 5,8 / 7,6 / 11,9 / 27,5. Perigo (Σ 1,1,2,2,3 por tier) > 5 exige `perigoAceito:true`. Sem ouro, pausa. |
| Selo: desligar | `selo_desligar` | `{huntId}` | `selo_state` | Idem. | — |
| Premium 30 dias / Wildcards / XP Boost (loja) | `store_buy` | `{item:"premium_30d"\|"wildcards"\|"xp_boost"\|…, requestId, vocation?, qty?}` | `meta_result` (provável) | Não indicado (menu Loja). | Coins (`meta.rules.store[]`): premium_30d 290, sessao_24h_30d 190, xp_boost 45 (4/dia), wildcards 10. |
| Usar item de premium/wildcard/xp boost | `use_item` | `{itemId, qty, requestId}` | `use_item_result {…, premiumUntil?, wildcards?, xpBoost?}` | Não indicado. | Itens: 100601 = +30 dias de premium; 100602 = +2 wildcards; 100736 = XP boost 50 % por 90 min; 100734 = recuperar a última morte. |

### Mensagens de estado que o treinador precisa ouvir
- `selo_state {ativo, selos:[{huntId, pactos:[{tier, buff, debuff}], ligado, pausa:"gold"|"perigo"|null, restoMs, correndo, gasto, hoje:{horas, gold}}], evento?:{tipo:"hora"|"pausa_gold", huntId, custo}}`
  — **não vem no welcome/resume**; o servidor empurra à parte (não há `selo_get`). O helper precisa guardar a última.
- `ampulheta_state` — só depois de `ampulheta_get` (consulta, não é ação).
- `invasion_update` / `invasion_notice` — mudanças da Invasão em tempo real.

### Onde fica cada tela (quando o helper só puder abrir a tela do jogo)
Todas as ações acima têm formato limpo no esquema; nenhuma ficou como "abrir a tela do jogo". Mesmo assim, os
`data-testid` das telas (para o botão "abrir no jogo" e para o teste ao vivo):

| tela | abrir | botões dentro |
|---|---|---|
| Prey | `prey-open` (menu UTILIDADES) | `prey-panel`, `prey-hunt-sortear`, `prey-hunt-escolher`, `prey-opcao-<huntId>`, `prey-wildcards` |
| Bênçãos | `blessing-open` (menu UTILIDADES) | `blessings-panel`, `bless-buy-<id>`, `bless-buy-all`, `bless-owned-<id>` |
| Ampulhetas | `ampulheta-placa` | `ampulhetas-modal`, `ampulheta-<itemId>-usar`, `ampulheta-<itemId>-comprar`, `ampulheta-compra-ok` |
| Silas (ilhas e bosses) | `nav-quests-ilhas` (menu NAVEGAÇÃO; só na cidade) ou `explore-falar-silas` | `quests-ilhas-tab-ilhas`, `quests-ilhas-ilha-<id>`, `quests-ilhas-entregar`, `quests-ilhas-tab-bosses`, `quests-ilhas-boss-<nome>`, `quests-ilhas-boss-qty-input` |
| Invasão | `invasao-icone` | `invasao-inscrever`, `invasao-preset-inscrever`, `invasao-cancelar`, `invasao-confirmar-saida`, `invasao-buff-<id>` |
| Selo da Caçada | `hunt-aba-selo` / `selo-aba` (tela da caçada) | `selo-adicionar`, `selo-rolar`, `selo-limpar`, `selo-ligar`, `selo-confirmar-aceitar` |
| Premium | `premium-panel`, `premium-cta` | — |
| Loja (coins) | `hud-store` (botão dourado da barra de cima; `onClick` abre a loja — conferido no bundle de 27/11, chunk do shell) | `store-card-<id>`, `store-buy-<id>` |
| Elites | `actionbar-explore` (CAÇADAS, na caçada) ou `actionbar-hunt` (JOGAR, na cidade) → aba `explore-tab-minibosses` (abas `explore-tab-<hunts\|minibosses\|bosses\|tower\|tokens>`, bundle 27/11) | `explore-elite-main` |

### O que falta confirmar ao vivo
1. Se `buy_blessing`, as ações de prey e `selo_*` respondem `not_in_city` durante a caçada (o cliente não bloqueia).
2. Se `island_deliver` e `boss_deliver` exigem estar perto do Silas (`too_far`, como na Forja/Uzgod).
3. A compra de ampulheta (`store_buy` com o id da oferta de `rules.cash`).
4. A resposta exata do `invasion_join` (esperado `invasion_update` com `inscrito:true`).

## Campos do welcome/resume

A captura (`testes/fixtures/treinador-welcome-u2tag.json`) é um **`resume`**: a party estava caçando (Shadow Nexus,
huntId 222), e nesse caso o servidor manda `resume` em vez de `welcome`. Os dois carregam `meta`, `account`, `roster`
(esquemas `me`/`u7` do chunk 4218). Nome, ouro, coins, `worldToken`, `windowId` e a guilda foram trocados por
`"Conta"`, `0`, `"x"`.

### `data.account`
| campo | exemplo | significado |
|---|---|---|
| `level`, `xp` | `250`, `"257118582"` | nível/XP da conta (xp vem como texto) |
| `gold`, `goldLocked`, `coins` | `0` (neutralizado) | saldo de ouro, ouro travado, coins |
| `premiumUntil` | `"2026-12-26T13:48:55.909Z"` | fim do Premium (null = sem Premium) |
| `longSessionUntil` | `"2026-12-24T23:48:11.872Z"` | fim da "Sessão 24h" (sem ela, sessão contínua de 12 h) |
| `mainVocation`, `unlocked` | `"KNIGHT"`, as 4 | vocação principal e vocações liberadas |

### `data.meta` (estado da conta)
| campo | exemplo | significado |
|---|---|---|
| `blessings` | `[2,3,4,5,6,7,8]` | ids das bênçãos ativas (7 = todas; 2–6 normais, 7–8 enhanced) |
| `wildcards` | `0` | wildcards da prey |
| `preyHunt` | `null` ou `{huntId, title, levelMin, monsters[], msLeft, locked}` | caçada da prey da conta (vale para os quatro) |
| `preyHuntOpcoes` | `[{huntId:176, title:"Wasps Dungeons", levelMin:1, podeEntrar:true}, …]` | caçadas que dá para escolher por 5 wildcards |
| `preyHuntRollFreeDay` | `true` | a troca grátis do dia ainda está disponível |
| `preyHuntRollBloqueio` | (ausente) / `"replay"` / `"pool_vazio"` | por que não dá para trocar |
| `preyBuffs` | `{KNIGHT:{bonus:{type:"xp", tier:9, percent:9, …}, huntId:null, msLeft:174, locked:false, tierFloor:9, rollFreeDay:true}, …}` | bônus de prey por vocação; `msLeft` = tempo restante; `rollFreeDay` = sorteio grátis do dia disponível |
| `preyAvisos` | `[{target:"hunt", kind:"renovado", vezes:50}, …]` | renovações/expirações desde a última visita |
| `rules.durationMs` / `rules.listGold` | — / `50000` | duração da prey / preço da troca paga de caçada |
| `rules.store[]` | `{id:"premium_30d", price:290, currency:"coins"}` | loja em coins (premium, sessão 24 h, xp boost com `stage:{bought,cap}`, wildcards) |
| `rules.cash[]` | `{id:"brief_knight_hourglass_1_gold", itemId:100784, price:525000, currency:"gold"}` | loja de itens (ampulhetas, armas de treino, death redemption) |
| `ampulhetaOn` | `true` | ampulhetas ligadas no servidor (as horas usadas NÃO vêm aqui: pedir `ampulheta_get`) |
| `training.charges` | `{}` | cargas de arma de treino por vocação |
| `xpBoost` | `null` ou `{percent, msLeft}` | XP boost ativo |
| `invasao` | `{date, invasionId, invasionNome, bossName, janelas:[{idx, windowId, startAtMs, durNominalMs, estado?}], inscrito:true, proximaIdx:1, encerrada:false, proxima:{startAtMs, bossName}}` | Invasão de hoje e se a conta está inscrita |
| `invasaoReabre` | `{reabreAtMs}` | quando abre a próxima inscrição |
| `invasaoFechamento` | (ausente) / `{date, position, bossDamage, tokens, saldo, …}` | resultado do dia anterior |
| `raidTokens` | `3440` | tokens da Invasão |
| `bossCooldowns` | `{}` | `{<boss>: ms}` de espera por boss |
| `ultimaHunt`, `lureTierByHunt` | `222`, `{"222":3,…}` | última caçada e lure por caçada |
| `huntBestiary`, `eliteBestiary` | `{<nome>: kills}` | bestiário |
| `serverDay` | `"2026-11-27"` | dia do servidor (vira à meia-noite do servidor) |
| `presetsContaOn`, `nopingOn`, `casaOff`, `invasaoOff`, `lojaDeIlhasOff` | flags | recursos ligados/desligados no servidor |

### `data` (raiz do resume)
| campo | exemplo | significado |
|---|---|---|
| `huntId` | `222` | caçada atual (resume = caçando) |
| `offline` | `{elapsedMs:0, xp:"0", killsTotal:0, lootGold:0}` | ganho offline desde a última conexão |
| `unlockedIslands` | `["yalahar","pits_of_inferno",…,"warzone"]` | ilhas já abertas no Silas |
| `unlockedBosses` | `[]` | bosses liberados (as tentativas NÃO vêm aqui: `GET /bosses/select` traz `attemptsLeft`) |
| `serverWeek`, `nextWeeklyResetAt` | `"2026-W48"`, ms | semana do servidor e próximo reset semanal (boss "derrotado nesta semana") |
| `keyBagTierId`, `keyBagUsed`, `keyBagMax`, `keyBagBuffsMs`, `keyBagAutoBuy` | `"keybag_t3"`, 1, 22, … | mochila de chaves |
| `roster[]` | `{name, vocation, level, hp, maxHp, mana, maxMana, xp, gold, skills, equipment, cap, levelProgress, skillsProgress, outfit}` | os quatro personagens (sem campo de prey/bênção/ampulheta por personagem) |

### O que NÃO existe no welcome/resume
- **Selo ativo**: só pela mensagem `selo_state` (empurrada pelo servidor).
- **Horas de ampulheta usadas hoje**: só por `ampulheta_get` → `ampulheta_state.vocacoes[voc].hojeMs` (limite 8 h).
- **Tentativas de boss**: só por `GET /bosses/select` (`attemptsLeft`) ou `boss_deliver_result.bossAttempts`.
- **`legado`**: vem em `legacy_state {ativo, personagens?:[{vocation, visto}], avisar?, lancamento?}` (não estava na captura).

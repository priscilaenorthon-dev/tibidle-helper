# Tibidle — Base de Conhecimento

> Documento vivo. Atualizado conforme aprendemos coisas novas sobre o jogo.
> Última atualização: **2026-09-29** (helper 2.11). ⚠ As §1–9 descrevem o jogo de ANTES do lançamento
> e do wipe (18–19/09). Os scripts Python citados nelas (`analyze_hunts.py`, `analyze_build.py`,
> `melhor_zona.py`, `modelo_v2.py`) foram apagados na 2.11 — estavam presos ao catálogo velho e a
> `data/` (fora do git); ficam no histórico do git. Regras atuais: **§15** (wiki, 29/09) e §10 em diante.

---

## 1. O jogo

**Tibidle** (`https://play.tibidle.com`) — idle MMORPG PT-BR inspirado em Tibia.

Você comanda uma **party fixa de 4 personagens**: Cavaleiro (Knight), Paladino
(Paladin), Feiticeiro (Sorcerer) e Druida (Druid). Eles lutam sozinhos 24/7. O
jogador é o estrategista: escolhe a zona de caça, o nível de *lure*, as táticas
de atalho (vida/mana/ataque/defesa/suporte), o filtro de loot e as prioridades
de progressão.

**Nível é da party** (compartilhado), não por personagem. Cada personagem tem
HP/mana e equipamento próprios (9 slots), e skills próprias.

### Conta atual

| Campo | Valor |
|---|---|
| Nome | (retirado do repositório público) |
| accountId | (retirado do repositório público) |
| Mundo | `alfa` |
| Provedor | Google OAuth |
| Criada em | 2026-08-24 |
| Premium | não-founder (`founderTier: null`) |

### Estado observado (2026-08-29, 00:23)

- **Nível 36**, EXP 705.784 / 717.600 (80%)
- Skills do Cavaleiro: Corpo a Corpo 54, Distância 10, Escudo 47, Nível Mágico 6
- Recursos: 23.424 coins (moeda premium) / ~3.400 ouro
- Mochila: 1.170 oz de capacidade
- HP/Mana por personagem: Knight 605/175 · Paladin 465/455 · Sorc 325/875 · Druid 325/875
- **DPS medido da party: 33,2/s** — Knight 10,4 · Paladin 13,6 · Sorc 4,9 · Druid 4,3
  (72% do dano é físico)
- Boost de EXP +50% ativo — **o cronômetro só corre enquanto você caça**
- Caçando em Terramites Ankrahmun (hunt 138)

---

## 2. Arquitetura técnica

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 15 (App Router) + PWA, atrás de Cloudflare |
| Render | Canvas/WebGPU, atlas de sprites, tiles 32px, cena 25×19 |
| Catálogos | REST em `play.tibidle.com` |
| Jogo | **1 WebSocket único** (WebSocket nativo, não socket.io) |
| Auth | Cookie de sessão + ticket efêmero por conexão |
| Validação | Zod no cliente (schemas espelham o servidor) |

### Fluxo de conexão

1. `GET /auth/me` → sessão. 401 se deslogado.
2. `POST /auth/world-ticket` → `{ok, ticket, wsUrl}`
   - Falhas possíveis: `queued` (fila), `not_allowed`, `channel_unavailable`, `unavailable`
   - Se `queued`: pollar `/auth/queue` até `admitted`
3. Abrir WS em `wsUrl`
4. **Primeira mensagem obrigatória**: `{"type":"auth","data":{"ticket":"<ticket>"}}`
5. Servidor responde `welcome` (sessão nova) ou `resume` (retomada), contendo
   roster, estado completo e `worldToken`
6. A partir daí o servidor empurra `frame` com um array de eventos

### ⚠️ Sessão única por conta

O servidor permite **uma conexão por conta**. Códigos de fechamento do WS:

| Código | Constante | Significado |
|---|---|---|
| 4401 | `unauthorized` | ticket inválido/expirado |
| 4403 | `session_replaced` | sessão substituída |
| 4409 | `takeover` | outra conexão assumiu |
| 4503 | `server_full` | servidor lotado (reconecta em 15s) |
| 4504 | `idle_reclaimed` | derrubado por inatividade |

**Consequência para automação:** um bot que abra o próprio WebSocket derruba o
navegador, e vice-versa. Por isso a abordagem recomendada é **injeção in-page**,
reaproveitando o socket que o jogo já abriu.

Reconexão do cliente: backoff exponencial `500ms * 2^tentativa`, teto de 15s.

---

## 3. API REST

### Autenticação (`/auth/*`)
`me` · `providers` · `google/start` · `password/login` · `magic/login` ·
`register` · `logout` · `world-ticket` · `queue` · `channel` · `party` ·
`account/worlds` · `identities/` · `email/change` · `password` ·
`accept-terms` · `name-available?name=` · `dev/login` · `dev/allow`

### Dados de jogo — **a biblioteca completa** (~1,1 MB)

| Endpoint | Conteúdo | Tamanho |
|---|---|---|
| `/hunts/select` | **84 hunts** com `levelMin`, monstros (HP/exp/elementos) e loot completo | 90 KB |
| `/hunts` | metadados de cena/atlas + 6 torres + 52 bosses + `unlockLevels` | 56 KB |
| `/hunt/lootTable?huntId=N` | loot por hunt: chance, valor, **peso**, maxCount, monstro | ~1 KB |
| `/bestiary/list` | **328 criaturas** — classe, estrelas, HP, exp, loot | 69 KB |
| `/bestiary/creature?name=X` | ficha completa: speed, armor, defense, charms, elementos, imunidades | ~1,5 KB |
| `/bosses/select` | **52 bosses** — keyItem, cooldown, HP, elementos, loot | 46 KB |
| `/spells` | **235 magias** com fórmulas Lua reais, cooldown, vocação, área | 141 KB |
| `/potions` | poções de vida/mana por nível e vocação | 2 KB |
| `/ammo` | 15 munições com attack, custo, área de efeito | 2 KB |
| `/prices` | **8.928 itens** — preço de VENDA | 188 KB |
| `/buy-prices` | 876 itens — preço de COMPRA (NPC) | 18 KB |
| `/assets/v100/imbuements.json` | bases (Basic/Intricate/Powerful), categorias, imbuements | 13 KB |
| `/assets/v100/imbuables.json` | 524 itens imbuíveis com slots e tipos | 68 KB |
| `/assets/v100/spell-areas.json` | 48 matrizes de área de efeito | 26 KB |
| `/assets/v100/creature-meta.json` | metadados de sprite (bbox/shift), **não tem stats** | 285 KB |
| `/assets/v100/codex.json` | `dropNerf: {factor:4, minChance:5000}` + entries | — |

Outros: `/billing/*`, `/guild/*`, `/dev/wiki`, `/dev/store/*` (rotas de dev).

**Cache local:** `data/lib-hunts-select.json`, `data/lib-loot-tables.json`
(84 tabelas), `data/lib-misc.json` (todo o resto).

---

## 4. Protocolo WebSocket

### Comandos cliente → servidor (~110)

Quase todo comando de mutação carrega um **`requestId`**, e o servidor confirma
com o `*_result` correspondente. Isso permite correlacionar pedido/resposta de
forma confiável — essencial para automação.

**Combate e rotina**
`start_hunt {huntId, lure, bossId?, speed?}` · `start_train {perMember:[{vocation, mode, item?}]}` ·
`stop` · `update_battle_config` · `set_lure` · `set_formation {vocation, pos}` ·
`profiles_set` · `tower_mode` · `tower_advance` · `set_main_char`

**Economia e inventário**
`sell_loot {items, requestId}` · `depot_store_all {requestId}` · `depot_store` ·
`depot_withdraw` · `depot_get` · `auto_sell_set {enabled, included[]}` ·
`loot_filter {excluded[]}` · `discard_item` · `protect_item` ·
`box_sweep {itemId, count, requestId}` · `key_sweep {boss, count, requestId}` ·
`open_box` · `equip` · `unequip`

**Mercado**
`market_create` · `market_execute` · `market_cancel` · `market_claim` ·
`market_list` · `market_my_orders` · `market_stats` · `market_statement` · `market_inbox`

**Progressão**
`buy_blessing` · `buy_all_blessings {requestId}` · `imbue` · `imbue_quote` ·
`unimbue` · `prey_hunt_roll {requestId}` · `prey_hunt_pick` · `prey_buff_roll` ·
`prey_lock_set` · `codex_deposit` · `codex_get`

**Social**
`chat_send` · `guild_*` (found, invite, request, decide_request, donate, leave,
role, list, view, set_announcement, set_min_level) · `trade_request` ·
`trade_respond` · `trade_offer_set` · `trade_accept` · `trade_finalize` ·
`trade_cancel` · `parcel_send` · `parcel_collect` · `gold_send` ·
`player_lookup` · `party_get_snapshot` · `mailbox_get` · `system_mail_get/collect`

**Loja**
`store_buy {item, requestId, vocation?}` · `buy_premium` · `buy_outfit` ·
`set_outfit` · `change_sex`

**Outros**
`analyzer_reset` · `auto_leave_set` · `tutorial_set` · `summary_closed`

### Eventos servidor → cliente

De sessão: `welcome` · `resume` · `session_takeover` · `session_replaced` ·
`idle_warning` · `idle_reclaimed` · `logged_out` · `queue` · `not_allowed` · `server_reset`

De combate (dentro de `frame.data.events[]`): `attack` · `hit` · `mhit` ·
`heal` · `mheal` · `cast` · `mcast` · `damage` · `death` · `kill` · `loot` ·
`levelup` · `skillup` · `move` · `supplies_out` · `victory` · `train_done` ·
`hunt_started` · `ended`

De resultado: todo `*_result` correspondente aos comandos acima.

---

## 5. Mecânicas

### Elementos — convenção de sinal ⚠️

Nos campos `elements[].percent`:
- **positivo = RESISTÊNCIA** (dano reduzido). `100` = imunidade total.
- **negativo = FRAQUEZA** (dano extra).

Confirmado por: Wasp tem `COMBAT_EARTHDAMAGE: 100` (vespas são imunes a earth
em Tibia). Terramite tem `EARTH: 20` (resiste) e `FIRE: -10` (fraco a fogo).

Tipos: `PHYSICAL` · `ENERGY` · `FIRE` · `ICE` · `EARTH` · `HOLY` · `DEATH` ·
`LIFEDRAIN` · `MANADRAIN` · `DROWN`

### Lure

Cada hunt tem `maxLure` e `lureTiers: [{min, max}]` — quantos monstros são
puxados por vez. Mais lure = mais throughput (especialmente com magias de área)
mas mais dano recebido. Hunts de nível alto chegam a lure 8.

### Loot, peso e mochila

- **Moeda** (`currency: true` — gold/platinum/crystal coin) vai direto pro
  contador de OURO e **não compete pela mochila na prática**.
- **Itens** precisam ser carregados até a cidade e vendidos (`sell_loot`),
  competindo pelos 1.170 oz.
- Por isso o que importa num item **não é o valor bruto, é a densidade
  (ouro/oz)**. Um `crossbow` a 12 ouro/oz é marginal; `terramite eggs` a
  250 ouro/oz é excelente.
- `chance` é sobre **100.000** (gold coin em Wolves Den = `100000` = 100%).
- `maxCount` → quantidade uniforme de 1 a maxCount (média `(1+max)/2`).
- `dropNerf: {factor: 4, minChance: 5000}` — efeito exato ainda **não confirmado**.
  Hipótese: reduz chance de itens comuns. As tabelas de `/hunt/lootTable`
  batem com as do bestiário, então o nerf provavelmente se aplica em outro ponto.

### Progressão

- `unlockLevels`: as 4 vocações liberam no nível 8.
- `levelMin` por hunt vai de 1 a 60+. **`levelMax` é 0 em todas as hunts** —
  ou seja, *não há penalidade por caçar em área de nível baixo*.
- Boost de EXP: multiplicador temporizado que **só consome tempo caçando**.
- Imbuements: bases Basic (5k) / Intricate (30k) / Powerful (200k), duração
  72.000 (≈20h), com preço de proteção e custo de remoção.

### Treino

`start_train` com `perMember: [{vocation, mode, item?}]` — cada personagem
treina uma skill separadamente. Centros de Treinamento são o atalho para
maestria (o combate ensina o básico, o treino entrega o resultado).
Cada vocação tem **afinidade de classe**: evolui mais rápido em skills
específicas.

---

### Auto Selling — a mecânica mais importante do jogo ⭐

Vende o loot **durante a caçada**, sem voltar para a cidade. A mochila não
enche e o ouro entra na hora. Isso invalida qualquer análise de "quantas horas
até encher a mochila": com auto-sell ligado, o peso deixa de ser restrição.

- **Grátis: 6h por dia.** Na Loja, 190 coins compram *Auto Selling 18h/dia por
  30 dias*.
- Configurado por `auto_sell_set {enabled, included[]}` — lista do que vender.
- O **Filtro de Loot** (`loot_filter {excluded[]}`) decide o que o personagem
  pega do chão. Nada marcado = pega tudo.
- O **depot** não pesa, não é vendido pelo SELLING, e é compartilhado por todos
  os personagens da conta.

### Sistema de atalhos — como o combate é decidido

| Trilha | Regra |
|---|---|
| **ATAQUE** | slots 1→4 em rotação. Dispara o primeiro cujo **mínimo de criaturas ao alcance** for atingido; os demais esperam o próximo tick |
| **VIDA** | slots 1→5 verificados em ordem a cada tick. Usa o primeiro cujo gatilho de % de vida for atingido |
| **MANA** | poção usada quando a mana cai abaixo do gatilho. **0% desliga** (vive de regeneração) |
| **SUPORTE** | buffs são **recastados sozinhos** quando expiram |
| **DEFESA** | — |

Há 4 perfis numerados, trocáveis por `profiles_set`. Pelo menos uma forma
precisa ficar ativa.

### Como cada skill sobe ⚠️

| Skill | Sobe quando | Efeito |
|---|---|---|
| Corpo a Corpo | a cada ataque desferido | dano com espada, machado e clava |
| Distância | a cada tiro desferido | dano de arco e besta |
| **Nível Mágico** | **pela mana que você gasta** | força das magias e curas; libera runas mais altas |
| Escudo | só quando apanha de perto com escudo em punho | reduz dano recebido |

**Consequência crítica:** um mago que não lança magia não sobe nível mágico.
Cada vocação tem afinidade de classe e evolui mais rápido em skills próprias.

### Blessings

Não fazem nada enquanto você vive. **Na morte, cada uma reduz a perda de EXP.**
São consumidas na morte e precisam ser reativadas no templo antes da próxima
caçada. O preço acompanha o seu nível.

### Prey — detalhado

- 3 slots por personagem, **2 horas** de duração por sorteio
- O primeiro sorteio do dia é **grátis**; os seguintes custam **1 wildcard**
  e renovam o tempo
- O bônus vem sorteado entre os quatro tipos; **o tier sempre sobe, até 10**
- **TRAVAR** renova sozinho ao acabar o tempo, consumindo 1 wildcard por
  renovação. Se as wildcards acabarem, a trava desliga
- Trocar a criatura: a primeira troca do dia é grátis, mas **descarta a caçada
  atual e o tempo dela**
- Wildcards (as "CARTAS") vêm de **bosses de Tier 3 (Cultos)** e da Loja
  (5 por 50 coins)

### Elite / Bosses

- Cada mapa tem uma porta trancada; a chave cai na própria hunt
- A chave é consumida **ao atravessar a porta**, não ao abrir a caixa
- A luta é a party contra o boss: **sem leva, sem lure, sem segundo monstro**
- O espólio vem numa caixa que fica na mochila pelo tempo que você quiser e
  **abre sem custo**
- `box_sweep` e `key_sweep` abrem/usam várias de uma vez

### Torre

Subida solo infinita, **classificação semanal por vocação**, e loja própria
paga em **Tower Coin** (terceira moeda). Comandos `tower_mode` / `tower_advance`,
endpoint `/tower/leaderboard`.

### Imbuements

- Encantados no **altar do oráculo**: custo do saldo, materiais da mochila
- Bases: Basic (5k) · Intricate (30k) · Powerful (200k), duração ~20h
- A tentativa **pode falhar**; na falha, material e ouro são consumidos.
  A **proteção** garante sucesso pagando a mais
- Remover libera o encaixe mas perde o imbuement
- Materiais caem caçando

### Codex

Itens de codex **dropam 4× menos** — é o que o `dropNerf: factor 4` significa.
Dá para comprar no mercado. O que foi entregue não volta, e o bônus fica com o
personagem para sempre.

### Premium

- **Chance de drop aumentada** em todas as caçadas iniciadas com premium ativo
- **Mercado exclusivo de premium** (criar/aceitar ordens, comprar/vender coins)
- **Enviar e receber pacotes e ouro** também é exclusivo de premium

### Treino

Sessão separada: sem bônus de grupo e sem barra de batalha. Golpes comprados na
Loja (Durable 140 coins, Lasting 790 coins, nas variantes Sword/Bow/Rod/Wand).
**Para sozinho após 12h contínuas.**

### Mercado

Livro por item, sem feed global. A **taxa de criação é paga na hora e nunca
devolvida** — nem no cancelamento, nem na expiração. Os itens saem da mochila
ao anunciar e só voltam se você cancelar. O valor pode subir até 10% acima do
exibido. Agregado de 30 dias.

### Munição

Consumida a cada auto-attack, custo saindo do ouro da conta. Sem escolha
explícita, usa a munição gratuita compatível com a arma.

### Auto-leave

`auto_leave_set {enabled, floor, onCap}` — encerra a sessão quando o ouro cai
abaixo da margem, ou quando a mochila enche. Vale para caçada e torre, não para
o treino.

---

## 5b. Mecânicas confirmadas pela wiki oficial

Fonte: `https://tibidle.com/wiki` (23 páginas). O jogo entrou em Open Beta em
**2026-08-24** — a mesma data de criação da conta. É conteúdo muito novo, o que
explica a ausência de guias de terceiros.

### Pipeline de dano — a ordem importa ⭐

São 5 degraus, e **cada um age sobre o saldo do anterior**, não sobre o dano
original:

1. **Sorteio** entre o dano mínimo e máximo da arma/magia
2. **Bloqueio de escudo** — subtrai parte da defesa. Regenera com o tempo, e
   por isso **se esgota em lutas longas**. *Magia nunca passa pelo bloqueio.*
3. **Armadura** — desconto **fixo** por golpe. *Só afeta dano físico.*
4. **Mitigação** — redução **percentual** sobre o que sobrou
5. **Resistência elemental** — só aqui o elemento entra na conta

**Implicações práticas:**
- Armadura alta rende pouco contra **muitos golpes fracos** (o desconto é fixo
  por ataque) e muito contra **poucos golpes fortes**
- Mitigação é o oposto: rende mais quanto maior o golpe
- Contra magia, escudo e armadura não servem — só mitigação e resistência

### Formação — os magos são intocáveis ⭐

- O **Knight fica sozinho no centro**; Paladin, Sorcerer e Druid ocupam **duas
  caixas de 3×3** que flanqueiam o centro (18 casas), com um corredor livre
- **O cerco nunca invade as caixas de formação.** Os monstros cercam só o
  Knight — os outros três não sofrem dano corpo a corpo, por mais inimigos que
  apareçam

Isso confirma a leitura ao vivo (só o Cavaleiro apanhava) e significa que
**subir o lure não põe os magos em risco** — o limite é o quanto o Knight aguenta.

### Dano em área

O servidor calcula a área da magia pela **forma geométrica real**, não pela
contagem de inimigos. Puxar mais monstros **não** garante mais dano: se eles
caírem fora da forma da magia, você só controla mais inimigos sem ganhar dano.
Casar a `AREA_*` da magia com o lure é o que importa.

### Economia — a taxa de venda é o ralo de ouro ⭐

| Conta | Você recebe ao vender ao NPC |
|---|---|
| Free | **70%** (a casa fica com 30%) |
| Premium | **95%** (a casa fica com 5%) |

**Premium é comprado com ouro do jogo, não com dinheiro real.** Cada compra
credita 30 dias e o tempo acumula se renovar antes de vencer. Benefícios:

1. Taxa de venda 30% → 5% (**economiza 25% de tudo que passa pelo NPC**)
2. Chance de loot **+~30%** em cada entrada
3. Acesso a **4 hunts exclusivas**

⚠️ **Correção ao modelo de ouro:** os números de `ouro/h` de itens em
`analyze_hunts.py` são brutos. Numa conta free o valor realizado é **×0,70**.
O ouro de moeda (gold/platinum/crystal coin) não passa pelo NPC e não é taxado.

### Silver tokens — a terceira economia

Moeda separada, **obtida só jogando** (não se compra com dinheiro real, por
decisão de design anti-pay-to-win). Compra:
- Consumíveis de boost de EXP
- O **3º slot de prey** (permanente) ← prioridade recomendada, por ser o único
  permanente. *A conta já tem (`preySlot3: true`).*
- **Wildcards**

### Prey — correção

A rolagem é **grátis a cada 20 horas** (não "uma por dia civil"). Fora dessa
janela custa ouro, e o custo sobe com o nível. As wildcards permitem três
coisas: escolher a criatura diretamente, trocar só o bônus mantendo a criatura,
e travar a criatura através dos rerolls.

**Regra de ouro da wiki:** marque criaturas que você **realmente mata muito** na
hunt atual. Escolher criatura rara desperdiça o slot, mesmo com bônus melhor.

> A própria wiki avisa que o custo em wildcards e o reroll de bônus **estão em
> revisão** — reconferir antes de gastar em massa.

### Poções

São **8 de vida e 4 de mana**, com requisitos de nível e vocação que barram de
verdade. Duas exclusividades: **Great Health Potion** é só de Knight e pede
**nível 80**; **Spirit Potion** é só de Paladin.

Poções costumam ser o maior gasto de uma caçada longa. Gatilho alto demais
desperdiça; baixo demais mata entre os golpes. É o gatilho que decide se a
caçada é lucrativa.

### Bosses — 21 em 5 tiers

| Tier | Nome | Bosses |
|---|---|---|
| 1 | Iniciação | 4 (começar por **Munster**) |
| 2 | Profundezas | 3 |
| 3 | **Cultos** | 6 ← fonte de wildcards |
| 4 | Conhecimento Proibido | 7 |
| 5 | **World Boss** | 1 (Gaz'Haragoth) |

Cooldown de **20 horas** com sistema de passes. Subir de tier significa mais
vida, mais dano e mecânicas mais exigentes. **Nenhum boss é obrigatório** para
progredir — são conteúdo opcional de recompensa.

### Identidade das vocações (wiki)

- **Knight** — corpo a corpo, o único que tanka
- **Paladin** — dano à distância com segurança posicional
- **Sorcerer** — **o maior potencial de dano do jogo**
- **Druid** — cura, controle e o repertório mágico mais extenso

---

## 6. Modelo de análise de hunts

Implementado em `analyze_hunts.py`.

**Métrica central:** como o recurso escasso num idle é *dano causado por
segundo*, o que ranqueia uma hunt é `exp/HP` e `ouro/HP` — quanto retorno você
extrai por unidade de dano.

```
DPS_efetivo = DPS_base × fator_resistência
kills/h     = DPS_efetivo × 3600 / HP_médio
XP/h        = kills/h × exp_médio
ouro/h      = kills/h × (moeda_por_kill + itens_por_kill_filtrados)
```

`fator_resistência` = 72% físico + 28% do melhor elemento mágico disponível,
ponderado pelo `weight` de spawn de cada monstro.

**Validação do modelo** (hunt 138, Terramites):

| | previsto | observado | erro |
|---|---|---|---|
| kills/h | 551 | 503 | +9% |
| XP/h (raw) | 1.654 | ~1.500 | +10% |

Precisão suficiente para decisão. Recalibrar `DPS_*` sempre que o equipamento
ou as skills mudarem significativamente.

---

## 6b. Como ler o estado completo da conta

**Sim, dá para ver todos os seus itens.** O estado inteiro vive na árvore de
fibers do React e é acessível sem tocar no WebSocket.

Procedimento (implementado no bloco de extração usado em `data/estado-party.json`):
1. Pegar a chave `__reactFiber$*` de um nó do DOM (ex.: `.s-ui-root`)
2. Subir até a raiz via `.return`
3. Percorrer a árvore (`child` / `sibling`), inspecionando `memoizedProps` e a
   lista encadeada de hooks em `memoizedState`
4. Identificar os 3 objetos-chave pelas suas chaves:

| Objeto | Assinatura | Conteúdo |
|---|---|---|
| `shell` | tem `equipSlots` + `roster` + `bag` | roster dos 4 com equipamento, **preySlots**, wallet, outfits |
| `combat` | tem `skills` + `inventory` + `cap` | party ao vivo, **inventory (mochila item a item)**, cap, lureTier, monstros ativos |
| `painel` | tem `backpack` + `itemsKit` + `roster` | dados do painel lateral |

O que vem: nome, id, `iid` (id único da instância), peso, valor, `protected`,
`stackable`, e para equipamento todos os `attrs` (armor, attack, defense,
weight, `imbuementslot`, life leech, critical hit, etc).

### Sistema de atalhos

Cinco trilhas — **VIDA**, **MANA**, **ATAQUE**, **DEFESA**, **SUPORTE** — cada
uma aceitando magias/poções com uma condição de gatilho (ex.: VIDA `≤70%`,
ATAQUE `≥1` monstro). Há 4 perfis numerados, trocáveis por `profiles_set`.
O campo `kit` de cada membro lista o que está de fato equipado.

### Prey

3 slots por personagem (12 no total). Cada slot sorteia uma lista de 9
criaturas. Bônus possíveis:

| Tipo | Efeito | Escopo |
|---|---|---|
| `xp` | EXP melhorada | **Todo o grupo** |
| `loot` | Loot melhorado | **Todo o grupo** |
| `damage` | Dano | Só este personagem |
| `defense` | Defesa | Só este personagem |

`prey_hunt_roll` custa `rollGold`; `prey_buff_roll` custa 1 wildcard (ou é
grátis uma vez por dia, campo `rollFreeDay`). O sorteio entrega o bônus; o tier
vem separado. `prey_lock_set` trava o slot para não expirar.

O bônus só vale para a criatura sorteada — **tem que bater com o monstro da
hunt em que você está**.

---

## 6c. Progressão e posição competitiva

### Curva de EXP — fórmula confirmada

É a fórmula clássica do Tibia, validada contra o valor real do jogo
(nível 37 = 717.600 exato):

```
xp_total(n) = (50/3) · (n³ − 6n² + 17n − 12)
```

| Nível | EXP total |
|---|---|
| 37 | 717.600 |
| 39 | 847.400 |
| 45 | 1.328.800 |
| 50 | 1.847.300 |
| 60 | 3.256.800 |
| 72 | 5.722.600 |

### O ranking (`/leaderboard`, 200 contas, abas `xp` e `tower`)

Instantâneo de 2026-08-29: topo no nível 72 (5,9M de EXP), mediana 45,
corte de entrada no nível 39. 57 contas acima de 50, 12 acima de 60.

**Descoberta central:** as skills da conta (melee 54 · dist 59 · mágico
42/42) estão no **percentil ~40 do top 200** — ou seja, no mesmo patamar de
contas 25 a 35 níveis acima. O #1 do servidor tem melee 51 e mágico 40/40,
*abaixo* das nossas.

O atraso **não é de build nem de equipamento — é puramente de taxa de EXP.**
A conta ficou parada numa hunt de 3 exp por monstro com dois personagens sem
magia nenhuma equipada.

O `/tower/leaderboard` estava praticamente vazio (uma única entrada na semana
2026-W35) — é a classificação mais fácil do jogo para entrar agora.

---

## 7. Descobertas / decisões

- **2026-08-29** — Terramites Ankrahmun (hunt atual) dá **exp 3 por monstro com
  215 HP**. É uma hunt puramente de ouro: ~14,7k ouro/h mas só ~1,6k XP/h.
  Existem hunts com ouro equivalente e **15x mais XP**.
- **2026-08-29** — Melhor equilíbrio XP+ouro no nível 36: **Dwarf Bridge (119)**,
  ~24,2k XP/h + ~15,6k ouro/h. Alternativa de XP puro: Wasps Dungeons (176),
  43k XP/h mas só 6,1k ouro/h.
- **2026-08-29** — Como não há `levelMax`, hunts de `levelMin` baixo continuam
  ótimas em nível alto. As melhores para o nível 36 são de levelMin 15–25.
- **2026-08-29** — Gargalo real do Dwarf Bridge: mochila enche em **2,4h**
  (contra 35,7h nos Terramites).

### Auditoria da build (2026-08-29) — 5 problemas graves

1. **Feiticeiro e Druida estão com o kit de magias VAZIO.** Ambos com nível
   mágico 42 e 875 de mana, atacando só com o cajado (13–25 de dano). Fazem
   4,9 e 4,3 DPS quando poderiam fazer ~46,7 cada com uma magia Strike.
2. **Os 12 slots de prey estão vazios** nos 4 personagens, com roll grátis
   disponível (`rollFreeDay: 2026-08-27`).
3. **0/5 blessings** em todos os 4.
4. **Nenhum imbuement encaixado**, apesar de **11 encaixes livres**:
   Cavaleiro 3 · Paladino 4 · Feiticeiro 3 · Druida 1.
   A `elvish bow` do Paladino sozinha tem 3 slots (life leech, mana leech,
   critical hit, skillboost distance).
5. **Falta de mana trava as magias que existem.** Leitura ao vivo: Cavaleiro
   19/175, Paladino 5/455. A trilha MANA dos atalhos está vazia — só o
   Cavaleiro consome poção (Health Potion ×17 = 850 ouro por sessão).

**Consequência:** a party rende 33,2 DPS quando o teto realista com o
equipamento atual é ~120 DPS. Não é problema de nível nem de item — é
configuração.

### Fórmulas de dano (nível 36, mágico 42, melee 54, distância 59)

| Vocação | Melhor magia (só mana) | Dano | CD | DPS |
|---|---|---|---|---|
| Feiticeiro | Death/Energy/Flame/Ice/Terra Strike | 93 | 2,0s | **46,7** |
| Feiticeiro (área) | Great Energy Beam `exevo gran vis` | 238 | 6,0s | 39,7 |
| Druida | Energy/Flame/Ice/Physical/Terra Strike | 93 | 2,0s | **46,7** |
| Paladino | Ethereal Spear `exori con` | 63 | 2,0s | 31,6 |
| Cavaleiro | Berserk `exori` (área) | 94 | 4,0s | 23,4 |

Curas: Druida tem **Heal Friend** `exura sio` (120 mana, **515 de cura em
aliado**) — é a peça de sustentação que falta. Feiticeiro tem Ultimate Healing
(487). Cavaleiro tem Wound Cleansing (81, 40 mana).

Runas rendem mais que magias (fireball/icicle rune = 122 de dano, 61 DPS) mas
custam ouro por uso (3 a 32 cada, ver `/buy-prices`). Só compensam se o
ouro/hora da hunt cobrir.

---

## 7b. Fontes externas

| Fonte | Valor |
|---|---|
| `https://tibidle.com/wiki` (23 páginas) | **a melhor fonte externa** — mecânicas oficiais |
| `https://discord.gg/tibidle` | comunidade — não consultado ainda |
| `https://www.youtube.com/@Tibidle` | canal oficial — vídeos de lançamento |
| Instagram `@tibidleonline` | divulgação |

⚠️ **Não confundir com `tibiaidle.com`** — é outro jogo (servidor privado de
Tibia com hunt idle, lançado em fev/2026). Buscas por "tibia idle" retornam os
dois misturados, com mecânicas e números incompatíveis.

Não existem guias sérios de terceiros: o Open Beta é de **2026-08-24**, poucos
dias atrás. O que há no YouTube são vídeos de lançamento/primeiras impressões.
**Na prática, a análise dos dados brutos deste projeto já é mais profunda do que
qualquer material público sobre o jogo.**

### Configuração aplicada em 2026-08-29 (sessão de execução)

**Atalhos** — os slots têm `data-testid` previsíveis: `scene-slot-{hpPot|attack|support|mana|heal}-{i}`.
O diálogo usa `slot-config-opt-<Nome>`, `slot-config-threshold-preset-{30|50|70|85}`,
`slot-config-stepper-inc/dec` (mínimo de criaturas é **stepper, não slider**),
`slot-config-save`, `slot-config-empty`.
⚠️ Cliques via JS **não funcionam** na lista de prey — exigem evento de mouse nativo.

| Personagem | Ataque | Mana | Vida |
|---|---|---|---|
| Cavaleiro | Berserk ≥3 | **removida** (era o maior ralo) | Health Potion ≤50% |
| Paladino | Ethereal Spear | Mana Potion ≤50% | — |
| Feiticeiro | Fire Wave ≥3 · Death Strike ≥1 | Mana Potion ≤50% | — |
| Druida | Ice Wave ≥3 · Terra Strike ≥1 | Mana Potion ≤50% | Heal Friend ≤70% |

Elementos escolhidos para orcs: fogo/gelo (neutros) na área, morte/terra (−10 = fraqueza)
no alvo único. **Energia evitada** — orcs resistem 20–30%.

**Hunt:** Terramites (138) → **Orcs Edron Cave (124)**, lure nível 2 (4 criaturas fixas).
**Prey:** caçada Orcs Edron Cave escolhida por 5 wildcards (119 → 114), travada.
Buffs já estavam em TIER 10/10 (LOOT +10% ×3, +4% ×1, todos para o grupo).
**Auto Selling:** já estava ligado (16h49/dia disponíveis).

### Resultado medido

| | antes | depois |
|---|---|---|
| EXP/h | 2,1k | **31,9k** |
| EXP raw/h | 1,5k | 21,4k |
| Lucro/h | +11,2k | +872 |
| Tempo p/ nível 37 | 5h29 | **12 min** |
| DPS da party | 33,2/s | 43,3/s (Feiticeiro sozinho: 29,2/s) |

**Lição de economia:** o custo de mana domina o resultado. Medido em Orcs Edron,
cada ponto de dano custa ~0,036 ouro em poção e rende ~0,064 ouro em loot —
margem positiva, mas apertada. A poção de mana do Cavaleiro era prejuízo puro
(pool de 175 com gatilho a 70% desperdiça 44% da dose, e Berserk custa
0,68 ouro por dano, 6× pior que o Strike dos magos).

**Ouro por abate é a variável da hunt:** Terramites 26,7 · Orcs Edron 7,5.
Orcs troca ouro por EXP (3 → 16 exp por monstro). Hunts de meio-termo para
o nível 36, se o ouro apertar: Chakoyas Svargrond (135, loot 100% moeda,
sem taxa de venda) e Dwarf Bridge (119).

### Bênçãos e imbuements — adiados de propósito

7 bênçãos custam **24.320 ouro** (saldo era 10.630). Elas só valem na morte, e
o Cavaleiro está levando 0,1 dano/s em Orcs Edron — risco de morte ~zero.
Gastar o caixa em seguro agora quebraria a compra de poções de mana, que é o
que sustenta o dano. Comprar quando o caixa passar de ~35k.

### Economia de combate — a regra que decide tudo ⭐

Toda magia tem um **custo em ouro por ponto de dano**, porque a mana vem de
poção. Mana Potion = 56 ouro por ~100 de mana → **0,56 ouro por mana**.

```
custo_por_dano = 0,56 / (dano / mana)          # dividir por nº de alvos se for área
```

O que o dano **rende** é `ouro_por_abate / HP_do_monstro`.
Em Orcs Edron Cave: 7,5 ouro por abate ÷ 78 HP = **0,096 ouro por dano**.

**Uma magia só dá lucro se custar menos que isso.** Medições em nível 36:

| Vocação | Magia | dano/mana | ouro/dano | veredito |
|---|---|---|---|---|
| Cavaleiro | **Lesser Front Sweep** | 10,4 | 0,054 · **0,013** em área | melhor da party |
| Cavaleiro | Berserk | 0,81 | 0,687 · 0,172 em área | prejuízo |
| Paladino | **Lesser Ethereal Spear** | 8,76 | **0,064** | lucro |
| Paladino | Ethereal Spear | 2,53 | 0,222 | prejuízo |
| Feiticeiro | **Fire Wave** (×4 alvos) | 3,34 | **0,042** | lucro |
| Feiticeiro | Death Strike | 4,67 | 0,120 | compra XP no prejuízo |
| Druida | **Ice Wave** (×4 alvos) | 2,97 | **0,047** | lucro |
| Druida | Terra Strike | 4,67 | 0,120 | compra XP no prejuízo |

**Contra-intuitivo e importante:** as magias *Lesser* (nível 1, 6 de mana)
ganham das versões grandes em ouro por dano, com perda pequena de DPS. As
magias caras de mana só compensam em área com 3+ alvos.

Os Strikes de alvo único (0,120) ficam **acima** do equilíbrio: cada um compra
XP pagando ~2,3 ouro por 19 de EXP. É uma troca deliberada, não um erro — mas é
o primeiro lugar a cortar se o ouro apertar.

### Munição — o Paladino tinha slot vazio

Slot `scene-slot-ammo-0`. Sem escolha, o disparo usa a flecha grátis (ataque 25).
No nível 36 estão liberadas:

| Munição | Ataque | Custo | Área |
|---|---|---|---|
| Arrow | 25 | grátis | não |
| Sniper Arrow (nv 25) | 28 | 3 | não |
| **Burst Arrow (nv 30)** | 27 | 9 | **3×3 ao redor do alvo** |

Com lure 4, a Burst Arrow sai a ~0,045 ouro/dano — lucrativa, e transforma o
auto-ataque do Paladino em dano de área.

### Prey — como ler e decidir

O tipo ativo **não** dá para ler pelo texto do card (os quatro tipos aparecem
sempre como legenda). Ler pela classe: `[data-testid="prey-buff-<voc>-tipo-<t>"]`
com `s-preyc-tipo--on`. Tipos: `xp` · `loot` · `damage` · `defense`.

Regras de decisão:
- **DEFESA é lixo** nesta composição: a formação impede que Paladino, Feiticeiro
  e Druida sejam atingidos, e o Cavaleiro leva ~0,1 dano/s.
- **DANO é individual** — só rende no Feiticeiro, que faz 2/3 do dano da party.
- **EXP e LOOT valem para o grupo** — sempre bons.
- Rerrolar um slot já em **TIER 10/10 com bônus de grupo é EV negativo**
  (50% de chance de cair em DANO/DEFESA). Só rerrole tier baixo.
- O tier **sempre sobe** no reroll; o tipo é re-sorteado. Com wildcards
  sobrando, dá para insistir até sair EXP ou LOOT.

### Filtro de loot — a conta que decide o que pegar ⭐

O gargalo real de uma caçada longa **não é a mochila, é a velocidade com que ela
enche em relação ao ciclo do auto-sell** (que roda a cada ~10 min). Se o lixo
enche em menos de 10 minutos, a equipe volta para a cidade antes da venda
acontecer, e você perde tempo de caçada em looping.

Métrica: `ouro/oz` de cada item, e `oz/h = chance × qtd × peso × kills/h`.

Medido em Orcs Edron Cave (hunt 124, ~1.350 abates/h):

| Item | ouro/oz | oz/h | ouro/h | decisão |
|---|---|---|---|---|
| orc tooth | **150** | 9 | 1.418 | pegar |
| orc leather | **60** | 4 | 239 | pegar |
| belted cape | 14 | 28 | 405 | pegar |
| orcish axe | 8 | 61 | 473 | pegar |
| gold coin | — | (moeda) | 10.800 | pegar |
| studded armor | **0,35** | 7.534 | 2.653 | **ignorar** |
| axe | **0,18** | 2.678 | 469 | **ignorar** |
| meat | **0,15** | 2.632 | 405 | **ignorar** |
| machete | **0,36** | 668 | 243 | **ignorar** |

Resultado do filtro: peso de **13.615 oz/h → ~102 oz/h**. A mochila passou de
encher em **5 minutos** para **11,5 horas**. Custo: 3.770 ouro/h bruto de lixo
abandonado — barato perto de não voltar mais para a cidade.

Controles: `loot-config-lootfilter` / `loot-config-autosell`, células
`loot-cell-<nome>` e `auto-sell-cell-<nome>`. A célula ignorada ganha a classe
`s-loot-cell--ignorado`.

### Modelo de sessão longa (offline / dormindo)

O jogo roda com o navegador fechado, então a pergunta certa é: *o que pode
quebrar sem ninguém olhando?* São quatro coisas, nesta ordem:

1. **Mochila enchendo** → resolvido pelo filtro de densidade acima
2. **Ouro zerando** → sem ouro não há poção, sem poção não há dano.
   Checar que `receita/h − custo de mana/h > 0` **antes** de dormir
3. **Prey expirando** → travar os buffs (renovam por 1 wildcard cada, 2 em 2h).
   Orçamento: `(nº de buffs + 1) × (horas / 2)` wildcards
4. **Morte** → calcular `dano recebido/s × 3600 × horas` contra o HP do tanque
   e as camadas de cura

O `auto_leave_set {enabled, floor, onCap}` existe como comando e serve de rede
de segurança por margem de ouro, mas **não achei o controle na UI durante a
caçada** — deve aparecer só na cidade. Pendência.

### Estado em 2026-08-29 (fim da sessão de execução)

- **Nível 37**, EXP 720.284 / 780.700 · ouro 12.238 · 104 wildcards
- Prey: **4× LOOT +10%, todos TIER 10/10**, caçada Orcs Edron Cave, travados
- Lucro medido: **+3,2k/h** (era +872) · EXP **32,3k/h** (era 2,1k)
- DPS: Cavaleiro 3,5 · Paladino 4,6 · Feiticeiro 28,7 · Druida 7,1 = ~44/s
- Cavaleiro com **consumo zero** (Lesser Front Sweep roda só com regeneração)

Projeção para 8h offline: ~221k de EXP (boost cobre 4h31 das 8h) → **nível 40**;
ouro para ~44k. Dano recebido no tanque: 2.880 de 605 HP com duas camadas de
cura — risco de morte desprezível.

### Ordem de prioridade de gasto (a lição da sessão)

1. **Poções de mana** — é o que sustenta o dano, que sustenta XP e ouro
2. **Bênçãos** — só quando o caixa passar de ~35k, e antes de subir de zona
3. **Imbuements** — dependem de material que cai caçando
4. Munição melhor / consumíveis de loja

Comprar bênção com o caixa curto troca uma proteção que você não vai usar por
um risco real: ficar sem poção no meio da noite.

### ⭐ A conta TEM premium (25 dias em 2026-08-29)

Aparece como `★ PREMIUM · 25 dias` no cabeçalho, mas **`/auth/me` não expõe o
status** — só dá para ver na UI. Consequências que corrigem análises anteriores:

- Taxa de venda é **5%**, não 30%. Todo cálculo de ouro de itens usa ×0,95.
- O **+30% de chance de loot** já está embutido em qualquer medição feita.
- `/hunts/select` retorna `premium: false` em todas as 84 hunts **porque a conta
  tem premium** — as 4 exclusivas já vêm na lista, sem marcação.

### O que só existe na cidade

A loja **recusa escrita durante a caçada**. Fora da hunt aparecem:
`actionbar-train` · `actionbar-selling` · `actionbar-depot`, e a loja passa a
aceitar compra (`store-buy-<id>`, com `confirm-ok` no diálogo).

Itens da loja e ids: `xp_boost` · `wildcards` (5 por 50 coins) ·
`auto_selling` (18h/dia por 30 dias, **190 coins**) ·
`durable_exercise_<arma>_1_coins` (140) · `lasting_exercise_*` (790).

O **depot** (`depot-cell-<nome>`, 100 lugares, mochila própria de 1.195oz,
10 lugares de chave) não pesa, não é vendido pelo auto-sell e é compartilhado
por todos os personagens.

### Modelo de zona calibrado — `melhor_zona.py`

Duas correções que o modelo antigo errava feio:

1. **Eficiência de 61%.** O modelo previa 2.207 abates/h em Orcs Edron; o
   medido foi 1.356. A party não ataca 100% do tempo (intervalo entre levas,
   deslocamento). Aplicar `× 0,61`.
2. **Custo de mana é um piso fixo**, não proporcional ao ouro da zona:
   ~8.512 ouro/h com 44 de DPS (152 poções/h × 56).

Esse piso **inviabiliza zonas de XP alto e ouro baixo**. Com nível 37 e 44 de
DPS, Wasps Dungeons, Wolves Den, Dwarven Mines, Carlin Raids e Salamander Cave
todas dão **ouro negativo** — o custo de mana afunda a receita. Só Orcs Edron
Cave e Dwarf Bridge passam com folga.

Ranking no nível 37 (ouro já líquido de mana e taxa):

| # | hunt | XP/h | ouro líq/h | mochila |
|---|---|---|---|---|
| 1 | **Orcs Edron Cave (124)** | 21.207 | **4.213** | 28,1h |
| 2 | Dwarf Bridge (119) | 20.098 | 4.170 | 2,9h |
| 3 | Tortoise Meriana (110) | 10.067 | 1.353 | 8,6h |

Validação: previsto 1.347 abates/h vs 1.356 medidos; 21.207 XP/h vs 21,2k
medidos (o valor de 32,3k na tela inclui o boost de +50%).

### Ativos parados descobertos no depot (2026-08-29)

- **4 armas Lasting Exercise** (bow, rod, sword, wand) — 790 coins cada na loja
- **~39 chaves de Troll Warlord** e **5 de Minotaur Idol**
- Minotaur Idol: 9.200 HP, **868 de ouro esperado por kill**, com 24,5% de
  elvish bow (2.000) e 2% de hailstorm rod (3.000 — upgrade real para o Druida,
  que usa moonlight rod de 200). As 5 chaves valem ~4.300 de ouro.
- Troll Warlord não consta em `/bosses/select` — provavelmente fica na aba Elite

Boss é conteúdo de quando dá para acompanhar: interrompe a caçada e a luta é
solo contra ele, sem leva e sem lure.

### Elite / boss — a economia medida (2026-08-29)

Teste real com 1 chave de Minotaur Idol, party de nível 37 com ~44 de DPS:

| | valor |
|---|---|
| Ouro antes / depois | 12.369 → 10.341 |
| **Gasto na luta** | **2.028** (poções, majoritariamente de VIDA) |
| Loot esperado da caixa | 868 |
| **Resultado médio** | **−1.160 por chave** |

**Por que dá prejuízo:** o boss bate **3,6 a 5 de dano/s** no tanque, contra
0,1/s de uma hunt normal — 50× mais. Isso dispara Health Potion (50 ouro cada)
durante toda a luta. O custo dominante é **cura, não mana**, e escala com a
*duração* da luta.

**Consequência: o custo cai quando o DPS sobe.** Com 9.200 de HP e 44 de DPS a
luta dura ~2-3,5 min. Dobrando o DPS, a luta e o dano recebido caem pela metade,
e a chave vira lucro. **Chaves não expiram e o Minotaur Idol não tem cooldown**
— guardar é gratuito e cada nível as torna mais rentáveis.

Validação positiva do teste: o Cavaleiro caiu a 463/620 e **voltou a 601 durante
a luta** — o Heal Friend do Druida sustenta o tanque sozinho. Nunca chegou perto
de morrer.

**Mecânica da caixa:** o espólio vem numa `<Hunt> Box` que fica na mochila sem
prazo. `lootbox-open` só funciona **na cidade**; `lootbox-sweep` exige
**mínimo de 2 caixas**. Abrir não consome chave (ela foi gasta na entrada).

Elites com chave ficam em `explore-tab-minibosses`, cards
`explore-boss-<Nome>` com `-action` (Enfrentar / SEM CHAVE) e `-key`.
As ~39 chaves de **Troll Warlord** não têm Elite correspondente nessa aba —
verificar a aba BOSSES (tiers) numa próxima sessão.

### ⚠️ REGRA DE BOSS — usar um preset dedicado

**No Elite/boss existe UM único alvo.** A wiki é explícita: *"Aqui não há leva,
não há lure e não há um segundo monstro para dividir o dano."*

Consequência que custou caro em 2026-08-29: qualquer slot de ataque com
**mínimo ≥ 2 criaturas NUNCA dispara** contra um boss. Na luta do Minotaur Idol,
Fire Wave, Ice Wave e Lesser Front Sweep (todos em min 3) ficaram parados —
**o Cavaleiro passou a luta inteira sem atacar**. Isso alongou o combate e foi a
causa real dos 2.028 de ouro em poção, não o boss em si.

**Os atalhos têm 4 presets** (`Preset 1..4`). Manter:
- **Preset 1 = HUNT** — área com mínimo 3, Strike de reserva com mínimo 1
- **Preset 2 = BOSS** — **tudo com mínimo 1**, elemento escolhido pela fraqueza

Antes de entrar num Elite: trocar para o Preset 2 **e** ajustar o elemento das
magias de alvo único para o que o boss menos resiste.

### Resistências dos Elites (de `/bosses/select`, campo `elements`)

positivo = resiste · negativo = fraco

| Boss | HP | FÍS | ENER | FOGO | GELO | TERRA | SAGR | MORTE | usar |
|---|---|---|---|---|---|---|---|---|---|
| Worgen | 250 | 0 | +15 | −5 | −5 | 0 | −5 | 0 | fogo/gelo |
| Giant Wasp | 300 | −2 | +25 | **−10** | 0 | +100 | −7 | +5 | **fogo** |
| The Red Warrior | 450 | 0 | +10 | +15 | **−20** | 0 | 0 | 0 | **gelo** |
| Gordzila | 350 | 0 | 0 | +30 | +30 | 0 | +1 | +100 | físico/energia |
| Dwarf Guard Elite | 3100 | +20 | 0 | −5 | 0 | +20 | 0 | −5 | fogo/morte |
| **Minotaur Idol** | 9200 | **0** | +30 | +25 | **0** | +40 | +50 | +50 | **gelo/físico** |

**Erro cometido no teste:** contra o Minotaur Idol foram usados Death Strike
(resistido **50%**) e Terra Strike (resistido **40%**) — as duas piores escolhas
da lista. O correto seria **Ice Strike** (`exori frigo`) no Feiticeiro e
**Physical Strike** (`exori moe ico`) ou Ice Strike no Druida, ambos a 0%.

Somando as duas falhas (área que não dispara + elemento resistido), a party
lutou com perto de **um terço** do dano que podia entregar. A economia de boss
medida naquele teste é, portanto, um **piso pessimista** — com o preset certo a
mesma chave provavelmente já se paga.

### Auditoria de equipamento (2026-08-29, nível 37)

| Slot | Cavaleiro | Paladino | Feiticeiro | Druida |
|---|---|---|---|---|
| head | viking helmet (4) | viking helmet (4) | brass helmet (3) | brass helmet (3) |
| armor | scale armor (9) | **belted cape (10)** | scale armor (9) | scale armor (9) |
| legs | brass legs (5) | brass legs (5) | leather legs (1) | leather legs (1) |
| boots | leather boots (1) | leather boots (1) | leather boots (1) | leather boots (1) |
| shield | **tortoise shield (26 def)** | — (arco 2 mãos) | copper shield (19) | copper shield (19) |
| weapon | spike sword (24 atk) | elvish bow | wand of dragonbreath | **hailstorm rod** |
| necklace | scarf (1) | wolf tooth chain | **VAZIO** | **VAZIO** |
| ring | **VAZIO** | **VAZIO** | **VAZIO** | **VAZIO** |
| **armadura total** | **20** | **20** | **14** | **14** |

O **hailstorm rod** do Druida veio do drop de 2% da caixa do Minotaur Idol —
aquela chave se pagou. Atenção: ele **não tem encaixe de imbuement** (o
moonlight rod também não tinha, então não houve perda).

**Slots vazios = ganho grátis quando houver item:** os 4 sem anel, e os 2 magos
sem amuleto. Seis slots de status parados.

**Encaixes de imbuement livres: 11**
Cavaleiro 3 (botas 1 + spike sword 2) · Paladino 4 (botas 1 + elvish bow 3) ·
Feiticeiro 3 (botas 1 + wand 2) · Druida 1 (só as botas).

Armadura de 14–20 é baixa para o nível 37, mas pouco importa em Orcs Edron
(o tanque leva 0,1 dano/s). Vira gargalo só em zonas mais pesadas e em boss.

### Mercado — como funciona e por que hoje não serve

**Estrutura:** duas abas (ITENS / COIN MARKET) e 12 categorias. Cada categoria
lista um **catálogo de itens possíveis**, não anúncios — Equipamento tem 675,
Despojos 543. Para ver oferta real é preciso **entrar no item** e ler o livro.
`market-cat-<categoria>` · `market-item-<nome>` · `market-search` ·
`market-side-buy` / `market-side-sell` · `market-back-home`.

⚠️ Os cards do mercado **não respondem a clique programático** — precisam de
evento de mouse nativo, igual à lista de prey.

**Por item o livro mostra:** ordens abertas, preço médio/máx/mín de 30 dias,
negócios de 30 dias e últimos negócios. Sem feed global de ordens nem de
negócios. Formação de preço atualiza a cada 60 s.

**Taxa de criação de 5%, paga na hora e nunca devolvida** — nem no cancelamento,
nem na expiração. Os itens saem da mochila ao anunciar.

**Estado real em 2026-08-29: o mercado está vazio.** `axe ring` tinha
**0 ordens abertas e nenhum histórico de 30 dias**; `protective charm` (material
do imbuement de Strike) **nem aparece na busca**. Esperado: o Open Beta é de
**2026-08-24**, cinco dias antes — a economia entre jogadores ainda não se
formou.

**Conclusão: comprar upgrade no mercado não é caminho por enquanto.** As fontes
de equipamento hoje são o **loot de hunt** e, principalmente, as **caixas de
Elite** (que já entregaram o hailstorm rod).

### Imbuements — custo real

| Base | Preço | Proteção | Chance | Duração |
|---|---|---|---|---|
| Basic | 5.000 | +10.000 | 90% | 20h |
| Intricate | 30.000 | +30.000 | 70% | 20h |
| Powerful | 200.000 | +50.000 | 50% | 20h |

Materiais (exemplos): 20x protective charm + 25x sabretooth + 5x vexclaw talon
para Strike; 25x vampire teeth para Vampirism; 25x rope belt para Void.
**Caem caçando** — e como o mercado está vazio, não dá para comprar atalho.

Um Basic custa 5.000 de ouro **mais** os materiais, e dura 20h. Só vale quando
o caixa estiver confortável e houver material acumulado.

### Ordem de compra recomendada (quando houver ouro)

1. **Bênçãos** (24.320) — destravam boss e zonas pesadas com segurança
2. **Anéis e amuletos** — 6 slots vazios, mas dependem do mercado encher
3. **Imbuement Basic** no elvish bow do Paladino (3 encaixes, o maior potencial)
4. Armadura/elmo melhores — só necessário ao subir de zona

### ⭐ Formação e posicionamento — o MOVER

**Como acessar:** é preciso **selecionar o personagem primeiro** (aba lateral,
`aria-label` = Cavaleiro/Paladino/Feiticeiro/Druida). Só então o botão MOVER
(`formation-toggle`) sai de desabilitado. **O Cavaleiro não se move** — ele é o
tanque e fica fixo no centro `[0,0]`.

⚠️ As casas válidas são desenhadas **no canvas**, não no DOM — não dá para lê-las
nem clicá-las por código. Use o comando direto: `set_formation {vocation, pos}`,
com `pos` no formato `[x, y]`. O servidor valida a posição.

**Geometria confirmada (visualmente + estado):** duas caixas de 3×3 flanqueiam o
centro, com um corredor livre entre elas e o Cavaleiro.

```
x:  -4  -3  -2  -1   0  +1  +2  +3  +4
    [ caixa esq ]   ( corredor )   [ caixa dir ]
y de -1 a +1 em cada caixa
```

**A posição mais próxima possível do centro é distância 2.** Os monstros cercam
apenas o Cavaleiro e nunca entram nas caixas — então **chegar perto não aumenta
o risco**, só melhora o alcance e a cobertura das magias.

### Alcance das armas × distância — o erro que estava ativo

| Arma | Alcance |
|---|---|
| wand of dragonbreath / hailstorm rod | **3** |
| elvish bow | 6 |
| spike sword | corpo a corpo |

**AREA_WAVE4** (Fire Wave, Ice Wave) alcança **4 casas à frente** do lançador,
alargando de 3 para 5 casas. A onda sai *do* personagem numa direção — logo a
posição dele decide o que a magia pega.

Estado encontrado em 2026-08-29 e corrigido:

| | antes | dist | problema | depois |
|---|---|---|---|---|
| Feiticeiro | [3,0] | 3,00 | no limite exato do alcance 3 | **[2,0]** |
| Druida | [-3,1] | **3,16** | **fora do alcance 3 do cajado** | **[-2,0]** |
| Paladino | [-4,0] | 4,00 | ok (arco alcança 6) | mantido |

O Druida estava a 3,16 casas com um cajado de alcance 3 — o auto-ataque dele
não alcançava. O desvio diagonal (`y=1`) custava alcance sem dar nada em troca.

**Regra geral:** alinhar os lançadores de onda no mesmo eixo do Cavaleiro
(`y = 0`) e na distância 3 (ver a correção na seção de geometria). Assim a onda sai reta contra o aglomerado de
monstros e o auto-ataque fica dentro do alcance. Quem usa arco pode ficar no
fundo, porque a área da Burst Arrow é centrada **no alvo**, não no lançador —
a distância dele não muda a cobertura.

### Geometria de área — simular ANTES de mover ⭐

Erro cometido em 2026-08-29: afirmei que a onda alcançava 4 casas e que era
larga. A matriz diz outra coisa. **Sempre desenhar a matriz de `spellAreas` e
contar as casas antes de decidir posição.**

**AREA_WAVE4** (Fire Wave, Ice Wave) — 12 casas, cone que sai do lançador:

| Distância à frente | Largura coberta |
|---|---|
| 1 | y −1 a +1 (3 casas) |
| 2 | y −1 a +1 (3 casas) |
| **3** | **y −2 a +2 (5 casas)** — e é o alcance máximo |

**O cone é estreito perto e só abre na última casa.** O campo `range` das ondas
é `null` — quem define o alcance é a matriz (3 casas), não o cajado. O alcance
da arma (cajado 3, arco 6) limita só o **auto-ataque**.

**AREA_WAVE6** (Lesser Front Sweep, do Cavaleiro) — só **3 casas**:
atinge as duas casas ao lado do lançador. Não é área de verdade.

**AREA_CIRCLE3X3** (runas: avalanche, great fireball, stone shower,
thunderstorm) — **37 casas radiais, centradas no ALVO**, não no lançador.

### Simulação de cobertura (monstros sempre em volta do Cavaleiro)

Confirmado pelo usuário: o spawn é aleatório mas os mobs **sempre se concentram
em volta do Cavaleiro no centro**. Modelando o anel 1 (8 casas coladas nele) e
o anel 2 (16 casas uma casa além):

⚠️ **Avaliar o PAR, nunca um lançador isolado.** Sozinho, um cone na distância 2
pega 8/8 do anel colado contra 5/8 na distância 3 — e foi disso que tirei a
conclusão errada de que 2 era o ótimo. Com **dois magos em lados opostos** a
conta inverte: na distância 3 a ponta larga de cada cone cobre o centro *e* a
metade oposta, e eles se complementam. Na distância 2 os dois cones caem no
mesmo miolo e desperdiçam sobreposição.

Comparação dos dois magos juntos (correção de 2026-08-29, apontada pelo usuário):

| Arranjo | 8 colados | 4 colados | 4 colados + 4 chegando | 8 espalhados |
|---|---|---|---|---|
| magos em **d2** | 8/8 | 4/4 | 4/8 | 6/10 |
| magos em **d3** ✅ | 8/8 | 4/4 | **7/8** | **9/10** |

**Distância 3 é o ótimo**, um mago de cada lado, alinhados em `y = 0`. Empata no
anel colado e quase dobra a cobertura assim que há mob a caminho ou espalhado.
O teto de mobs por hunt é **8**, então o anel colado é o estado de regime e o
excedente vem de fora — exatamente onde a d3 ganha.

**Conclusão:** o cone cobre 100% dos monstros colados no tanque, mas quase nada
do anel de fora. Os "tiros que não acertam" são monstros ainda a caminho — e é
um limite da geometria do cone, não da posição. Como o lure é 4, os 4 monstros
acabam colados e todos são atingidos; a perda é só transitória.

**Só um formato radial resolve o anel externo:** runa AREA_CIRCLE3X3 (37 casas,
8/8 e 16/16) ou, por mana, **Rage of the Skies** (`exevo gran mas vis`,
nível 55) e **Hell's Core** (nível 60) — nenhuma disponível no nível 37.

**Regra registrada:** lançador de onda no mesmo eixo do Cavaleiro (`y = 0`),
distância **3**, um de cada lado. Quem usa arco fica no fundo — a área da Burst
Arrow é centrada no alvo, então a distância dele não muda nada.

### ⚠️ CORREÇÃO — o dano tem que ser lido da UI, não da fórmula

`analyze_build.py::dano_magia()` avalia as fórmulas Lua de `/spells` e
**infla o dano em ~3,4×**. Os valores reais aparecem no painel EFEITO do
diálogo de slot (`Dano: X-Y`). Toda a tabela de "ouro por dano" registrada
antes desta seção usava os números inflados e está **errada**.

| | fórmula (errado) | **UI do jogo (real)** |
|---|---|---|
| Fire Wave | 83 | **18-31** (méd 24,5) |
| Death Strike | 93 | **23-33** (méd 28) |
| Energy Beam | 123 | **29-44** |

**As runas têm dano fixo** — não escalam com nível mágico. Ler sempre da UI.

### Economia de dano — números REAIS (nível 37, Orcs Edron)

Referência: cada ponto de dano rende **0,096 ouro** de loot.
Mana Potion = 0,56 ouro por ponto de mana.

| Fonte | Dano méd | Custo | ouro/dano | veredito |
|---|---|---|---|---|
| **fireball rune** | 35,5 | **3 ouro** | **0,085** | ✅ único lucrativo |
| icicle rune | 35,5 | 12 ouro | 0,338 | ❌ |
| Fire Wave (4 alvos) | 24,5 | 25 mana = 14 | 0,143 | ❌ |
| avalanche / great fireball / stone shower / thunderstorm (4 alvos) | 31 | 32 ouro | 0,258 | ❌ |
| Death Strike | 28 | 20 mana = 11,2 | 0,400 | ❌ |
| explosion rune (4 alvos) | 18 | 31 ouro | 0,430 | ❌ |

**A runa de fireball a 3 de ouro é a única fonte de dano que dá lucro** —
4,7× mais barata que o Death Strike. Todo o resto compra XP no prejuízo, o que
é uma escolha legítima, mas deve ser consciente.

### Overkill — dano em monstro que já morreu é ouro perdido ⭐

Insight do usuário, confirmado pelos números. Em Orcs Edron
(Orc 70 · Orc Spearman 80 · Orc Warrior 90 de HP):

- **Fire Wave (83 no cálculo antigo)** parecia matar quase tudo. Com o dano
  real de 24,5 isso não acontece — mas o princípio vale e é geral:
- **Antes de somar uma segunda fonte de dano em área, verificar se a primeira
  já derruba a leva.** Duas ondas na mesma leva = a segunda cai em cadáver.

Aplicado em 2026-08-29: **Ice Wave removida do Druida** — ela cobria a mesma
leva que o Fire Wave do Feiticeiro e custava 25 de mana por lançamento sem
acrescentar abate. O Druida virou suporte + finalizador:
Heal Friend (70%) + fireball rune (min 1) + auto-ataque grátis do hailstorm rod.

**Regra:** contar HP do monstro ÷ dano da magia. Se a primeira fonte já mata,
a segunda é desperdício — vale mais barata (runa) ou nenhuma.

### Poções — já estão no ótimo (verificado)

| Poção | Recupera | Custo | ouro/ponto | Disponível |
|---|---|---|---|---|
| **Health Potion** | 125-175 (150) | 50 | **0,333** | ✅ em uso |
| Strong Health Potion | 250-350 | 115 | 0,383 | nível 50 |
| Great Health Potion | 425-575 | 225 | 0,450 | nível 80, só Knight |
| **Mana Potion** | 75-125 (100) | 56 | **0,560** | ✅ em uso |
| Strong Mana Potion | 115-185 | 108 | 0,720 | nível 50 |
| Great Mana Potion | 150-250 | 158 | 0,790 | nível 80 |

As poções em uso são **as mais eficientes por ponto** entre as disponíveis, e
as maiores só pioram a eficiência. Nada a mudar até o nível 50 — e mesmo lá,
Strong é *pior* por ponto: só vale se a sustentação exigir doses maiores.

### Suporte — uma bênção de grupo por vocação (nível 32)

Cada vocação tem **exatamente uma** magia de grupo (`mas sio`), todas liberadas
no nível 32. São recastadas sozinhas quando expiram, e duram **120s**.

| Vocação | Magia | Efeito real (lido da UI) | Mana | Custo/h se recastada |
|---|---|---|---|---|
| Cavaleiro | **Train Party** `utito mas sio` | **Corpo a Corpo +3 · Distância +3** | 60 | ~1.000 |
| Paladino | Protect Party `utamo mas sio` | Escudo +3 | 90 | ~1.500 |
| Druida | Heal Party `utura mas sio` | +20 de vida a cada 2s | 120 | ~2.000 |
| Feiticeiro | Enchant Party `utori mas sio` | Magia +1 | 120 | ~2.000 |

Buffs próprios: **Magic Shield** (`utamo vita`, magos) manda o dano para a mana —
**inútil nesta composição**, porque a formação impede que os magos sejam
atingidos. **Charge** (Cavaleiro) diz literalmente *"Sem efeito implementado"*.

**Decisão em Orcs Edron:** só **Train Party no Cavaleiro**. Motivos:
- É a mais barata (60 de mana) e o Cavaleiro **não usa poção de mana** —
  roda na regeneração, custo zero
- Dá +3 em duas skills de dano, para o grupo
- As outras três custam 1.500–2.000 de ouro/h por benefício que a hunt não usa:
  Escudo +3 num tanque que leva 0,1 dano/s, +20 de vida/2s que a Heal Friend já
  cobre, e Magia +1 (~2,4% de dano) por 2.000/h

**Em boss a conta inverte:** com o tanque levando 3,6–5 dano/s, **Heal Party**
(+10 de vida/s no grupo) e **Protect Party** passam a valer. Colocar as duas no
Preset 2 de boss.

### Trilha DEFESA — não está implementada

A coluna "Defesa" aparece na interface com 4 espaços, mas:
- **não existe nenhum `data-testid`** para ela (só `hpPot`, `attack-0..3`,
  `support-0..1`, `mana-0`, `heal-1..4`)
- o schema de `update_battle_config` **não tem campo de defesa**
  (só `heals`, `manaPotion`, `skills`, `minCreatures`, `supports`, `who`, `ammo`)

É placeholder de UI. Não há nada a configurar ali — reconferir em versões futuras.

### Mapa completo dos slots (o que existe de verdade)

| Trilha visível | testid real | Qtd | Situação |
|---|---|---|---|
| Vida | `scene-slot-hpPot-0` + `heal-1..4` | 5 | hpPot em uso; heal-1 = Heal Friend no Druida |
| Ataque | `scene-slot-attack-0..3` | 4 | rotação 1→4 por mínimo de criaturas |
| Suporte | `scene-slot-support-0..1` | 2 | Train Party no Cavaleiro |
| Mana | `scene-slot-mana-0` | 1 | Mana Potion (Cavaleiro sem, de propósito) |
| Munição | `scene-slot-ammo-0` | 1 | só no Paladino (Burst Arrow) |
| Defesa | — | — | **não implementada** |

### Custos VERIFICADOS por medição (2026-08-29, nível 37)

Teste: zerar o analisador (botão RESET) e comparar duas amostras.
⚠️ O RESET zera as estatísticas da caçada mas **NÃO zera o painel "O QUE USOU"**,
que é cumulativo da sessão. Medir sempre a **diferença entre duas amostras**.

**Cobrança por uso confirmada:**
- `fireball rune` — Feiticeiro ×7 = −21 · Druida ×33 = −99 → **3 ouro cada** ✅
- `burst arrow` — Paladino ×23 = −207 → **9 ouro cada** ✅

O preço do catálogo (`/buy-prices`) **é** o custo por uso. Não há carga múltipla.

**Consumo real medido (janela de 2m20s, 68 abates na sessão):**

| Personagem | Consumo | Custo/h | Dano/s | **ouro/dano** |
|---|---|---|---|---|
| **Cavaleiro** | **nada** | **0** | 6,6 | **0,000** |
| **Druida** | 0 mana + 10 runas | 771 | 7,1 | **0,030** |
| Feiticeiro | 2 mana + 1 runa | 2.957 | 22,6 | 0,036 |
| Paladino | 2 mana + 1 flecha | 3.111 | 6,6 | **0,131** ⚠️ |

Total de consumíveis: **~6.840 ouro/h**. Lucro líquido **+4,5k/h**, EXP 31,3k/h.

**Resultados que confirmam as decisões:**
- Remover a Ice Wave do Druida zerou o consumo de mana dele — de ~1.500/h para
  771/h, e ele virou **o mais eficiente da party** em ouro por dano
- O Cavaleiro entrega 6,6 dano/s **de graça**: Lesser Front Sweep (6 de mana) e
  Train Party rodam só na regeneração, sem poção
- A troca de Strike por runa nos magos saiu como esperado

**Pendência aberta — o Paladino ficou o mais caro.** 0,131 ouro/dano, acima do
equilíbrio de 0,096, entregando os mesmos 6,6 dano/s que o Cavaleiro entrega
sem custo. Investigar: quais runas o Paladino tem acesso, e se vale trocar o
Lesser Ethereal Spear (mana) por runa, ou baixar o gatilho de mana dele.

---

## 7c. Patch 0.0.5 (2026-08-29) — o que mudou de verdade

### ⭐ Os catálogos REST respondem SEM autenticação

Descoberta metodológica que vale mais que o patch: `GET /hunts/select`,
`/bosses/select`, `/spells`, `/buy-prices`, `/potions`, `/ammo` e `/hunts`
retornam **200 sem cookie de sessão**. Dá para auditar balanceamento, preços e
fórmulas **sem abrir o jogo** — sem gastar a única conexão de WebSocket da conta.

Validação: os flags `premium` das 84 hunts são idênticos aos da cópia autenticada,
então o diff de níveis e stats é confiável.
⚠ **Exceção:** em `/bosses/select` os campos `levelMin` e `cooldownHours` voltam
zerados (1 e 0) para todos — antes e depois. Esses dois campos **só servem
logado**; o tier real do boss vem de `/hunts` (`unlockLevels`) ou da UI.

### As notas oficiais omitem a maior parte

**24 hunts subiram de 80/90/95 para o nível 130** — nada disso está no changelog:

Wyverns Hills (44) · Foreign Quarter (45) · Dragon Lord Den (49) · Frozen Hell (53)
· Hero Fortress Underground (60) · The hive Surface (61) · Hellspawns Yalahar (111)
· Exotic Cave (113) · Yielothax Dimension (115) · Demon Helmet (150) · Bog Raiders
Yalahar (151) · Nightmare Krailos (153) · Feyrist Nightmare (154) · Souleater (156)
· Glooth Bandits Oramond (158) · Vampires Edron Crypt (159) · Frost Dragons Okolnir
(160) · Yalahar Worker Golem (161) · Werebadgers (162) · Sea Serpent Depths (164)
· Brimstone Bug Caves (165) · Cults Carlin (166) · Barkless (167) · Warlocks Demona (168)

**Nerfs de EXP com HP maior** nos monstros dessas faixas:

| Monstro | HP | EXP |
|---|---|---|
| Crystal Spider | 1.250 → 1.950 | 900 → **60** (−93%) |
| Crawler | 1.450 → 2.450 | 1.000 → **120** (−88%) |
| Waspoid | 1.100 → 3.100 | 830 → **150** (−82%) |
| Giant Spider | 1.300 → 1.800 | 260 → **60** (−77%) |
| Insectoid Scout | — | 150 → **30** (−80%) |
| Bonebeast | 515 → 415 | 45 → 20 |
| **Dragon** (46) | — | 38 → **98** (único buff) |

**Os dois itens que o changelog cita, conferidos no catálogo:**

- *Cult* — o "leve ajuste" é literal em **Cults Goroma** (43, nível 50): exp 48→44 e
  46→42, ~8%. Mas **Cults Carlin** (166) foi de 80 → 130, o que é outra coisa.
- *Killer Caiman* — ⚠ **o catálogo ainda diz nível 60**, não 80. O que mudou foi o
  roster: entrou o **Corcodile** (1.500 HP, 20 exp), que dilui a hunt por baixo.
  Ou o gate não foi aplicado, ou vive fora de `/hunts/select`.

### Bosses — o aviso era real

| Boss | HP antes | HP agora |
|---|---|---|
| Beru | 230 | **20.030** (87×) |
| Black widow | 7.300 | **27.300** |
| Rhaegal | 13.000 | **23.000** |

Novo boss: **Bonehead the Cursed** (30.000 HP, chave própria) — 53 no total.
⭐ **Minotaur Idol continua em 9.200 HP.** O alvo do nosso teste de chave saiu
intacto, e a tese de guardar chave para quando o DPS subir continua válida
**só para ele** — Beru, Black widow e Rhaegal saíram do alcance por muito tempo.

### Preços: nada mudou

Diff de `/buy-prices`: **0 de 876 itens alterados**. Poções, runas e munição
mantiveram o preço. O patch mexeu em conteúdo, não em economia.

### Impacto prático no nível 41: nenhum

Orcs Edron Cave (124) não foi tocada. O estrago é todo no roteiro de médio prazo:
a faixa 80–130 virou um deserto de EXP.

---

## 7d. ⭐ Paladino — pendência RESOLVIDA: o problema é a flecha, não a magia

Fechada com `/spells` + `/buy-prices` pós-patch, sem precisar do jogo.
Base: nível 41, Paladino com **nível mágico 16** e **distância 59**.
Mana Potion restaura 75–125 (média 100) por 56 ouro → **0,56 ouro por mana**.

**O slot de magia já estava quase ótimo.** As magias elegíveis, por ouro/dano:

| Magia | Nível | Mana | Dano ~ | ouro/dano |
|---|---|---|---|---|
| **Lesser Ethereal Spear** (atual) | 1 | 6 | 53,5 | **0,063** |
| Divine Missile (novo no nível 40) | 40 | 20 | 61,0 | 0,184 |
| Ethereal Spear | 23 | 25 | 64,2 | 0,218 |

Divine Missile destravou agora e **não vale a troca**: 14% mais dano por 3× o custo.

**As 10 runas que o Paladino pode usar**, por ouro/dano (todas com cooldown 2.000ms):

| Runa | Dano ~ | Custo | ouro/dano | Área |
|---|---|---|---|---|
| **fireball rune** | 60,7 | 3 | **0,049** | alvo único |
| icicle rune | 60,7 | 12 | 0,198 | alvo único |
| holy missile rune | 70,0 | 16 | 0,229 | alvo único |
| heavy magic missile / stalagmite | 30,1 | 12 | 0,398 | alvo único |
| avalanche / great fireball / stone shower / thunderstorm | 52,2 | 32 | 0,613 | 3×3 |
| explosion rune | 42,5 | 31 | 0,729 | 1×1 |

A **fireball rune** é a mesma escolha que já venceu nos magos, e pelo mesmo motivo:
custa 3. Trocar a Lesser Ethereal Spear por ela dá **0,049 contra 0,063** — real,
mas só 22%. **Não explica** o Paladino ter medido 0,131 ouro/dano.

### ⚠ A munição é que está cara — e o nível 40 destravou a correção

O Paladino usa **burst arrow**. Comparando com o que o arco aceita:

| Flecha | Nível | Attack | Custo | Área |
|---|---|---|---|---|
| **burst arrow** (atual) | 30 | **27** | **15** | 3×3 |
| **tarsal arrow** | **40** | **33** | **6** | — |
| sniper arrow | 25 | 28 | 5 | — |
| onyx arrow | 50 | 38 | 7 | — |
| arrow | 0 | 25 | 2 | — |

A **tarsal arrow destravou no nível 40** — ou seja, ficou disponível agora:
**+22% de attack por 40% do preço**. O que se perde é a área 3×3 da burst arrow.
Como o Feiticeiro já entrega o dano em área (28,7 dps) e overkill é ouro perdido,
a troca deve ganhar — mas **precisa ser medida com o RESET, comparando duas
amostras**, como todo custo daqui.

Próxima flecha depois dessa: **onyx arrow no nível 50** (attack 38 por 7).

### ⚠ CORREÇÃO — o catálogo NÃO é o custo por uso da munição

A regra anotada antes ("o preço do catálogo é o custo por uso") vale para runa,
**não para flecha**:

| Item | Catálogo | Medido | Bate? |
|---|---|---|---|
| fireball rune | 3 | 3 (21/7 e 99/33) | ✅ |
| burst arrow | **15** | **9** (207/23) | ❌ — 60% do catálogo |

E `/buy-prices` não mudou no patch, então não é alteração de preço. A hipótese é
**recuperação de flecha**: ~40% dos tiros voltam para a aljava. Se valer para toda
flecha, a tarsal sai por ~3,6 efetivos. **Confirmar medindo.**

---

## 7d-bis. ⚠ CORREÇÃO da 7d — lido na UI com o jogo aberto (nível 41)

A seção 7d foi calculada com as fórmulas Lua de `/spells`. Com o jogo aberto,
a UI desmentiu duas coisas. Vale a regra que já estava no documento:
**o dano se lê na UI, não na fórmula.**

### ⭐ Dano de RUNA é FIXO — não escala com nível mágico

`fireball rune` mostra **Dano: 29–44** para o **Paladino (ML 16)** e
**exatamente o mesmo 29–44** para o **Feiticeiro (ML 42)**.

A fórmula `((level/5) + (maglevel*1.81) + 10)` previa ~60 para o Paladino e
~123 para o Feiticeiro. **Ambas erradas.** Cai por terra a conclusão de que a
runa do mago “mata um Orc de 70–90 HP em um tiro” — ela faz ~36,5 de média e
precisa de dois tiros.

Consequência para o modelo: qualquer cálculo de ouro/dano feito a partir de
`formula` em `/spells` **vale só para magia**, nunca para runa.

### A ordem do Paladino inverteu

Com os números da UI, e mana potion a 0,56 ouro/mana:

| Opção | Dano (UI) | Custo | ouro/dano |
|---|---|---|---|
| **Lesser Ethereal Spear** (6 mana) | **29–71** (méd 50) | 3,36 | **0,067** |
| fireball rune | 29–44 (méd 36,5) | 3,00 | 0,082 |
| Ethereal Spear (25 mana) | 34–87 (méd 60,5) | 14,00 | 0,231 |

A Lesser Ethereal Spear **ganha da runa** — mais dano e mais barata por ponto.
Configuração aplicada: **slot 1 = Lesser Ethereal Spear (≥1)**,
**slot 2 = fireball rune (≥1)** como reserva de cooldown.
A troca que valeu mesmo foi a Ethereal Spear (0,231) sair da rotação.

### ✅ Munição — confirmada na UI e já trocada

A UI dá o custo por disparo direto, o que **encerra a hipótese de recuperação
de flecha** da 7d: não há recuperação, o preço de uso simplesmente **não é** o
preço de `/buy-prices`.

| Flecha | Ataque | Catálogo | **Custo por disparo (UI)** | Área |
|---|---|---|---|---|
| burst arrow (antes) | 27 | 15 | **9 ouro** | 3×3 |
| **tarsal arrow** (agora) | **33** | 6 | **6 ouro** | alvo único |

Medido em jogo após a troca: `tarsal arrow ×1 −6 Ouro`. ✅

### Feiticeiro e Druida — mantidos como estavam, de propósito

Com o dano de runa desmentido, **não mexi na configuração medida da sessão
anterior**. Fire Wave do Feiticeiro (25 mana, 19–32 por alvo, 12 SQMs, ≥3) rende
0,137 ouro/dano com 4 alvos, contra 0,082 da runa — mas a runa é alvo único e
cortar a área derrubaria o DPS de 42 para perto do piso de spawn. Trocar isso
exige **medição**, não fórmula.

---

## 7e. Pendências fechadas em 2026-08-29 (sessão de catálogo)

### ⛔ TERMOS DE USO — automação é explicitamente proibida

`https://tibidle.com/termos`, seção **4. Regras de Conduta**, texto literal:

> É proibido: **Usar bots, scripts, exploits, macros ou qualquer forma de
> automação não prevista pelo próprio jogo**; Explorar bugs ou falhas em
> benefício próprio (bugs devem ser reportados à equipe) [...]
>
> A violação destas regras pode resultar em advertência, suspensão temporária ou
> **banimento definitivo**, a critério da equipe.

**Consequência para este projeto.** A ideia anotada na seção 2 — injeção in-page
reaproveitando o WebSocket do jogo — cai direto nessa proibição, e o risco é a
conta. Fica registrada como **inviabilizada por termo de uso**, não por técnica.

O que **não** é automação e segue liberado, que é onde este documento vive:
ler os catálogos REST públicos, calcular economia de hunt/runa/flecha, e decidir
a configuração — com o jogador aplicando as escolhas à mão no jogo.

### ✅ Lure — o “multiplicador” é literalmente o número de monstros

`lureTiers` em `/hunts/select` dá a resposta exata, sem precisar medir:
cada tier declara `{min, max}` de **monstros simultâneos**, e `maxLure` diz
quantos tiers a hunt tem.

**Orcs Edron Cave (124):** `maxLure 2` → tier 1 = **3 monstros**, tier 2 = **4**.

Distribuição nas 84 hunts: `maxLure` 1 (17 hunts) · 2 (31) · 3 (6) · 4 (30).

Padrão que muda o planejamento:

- Hunts de nível **35 a 45** quase todas têm **`maxLure 1`** — contagem fixa,
  sem escolha de lure (Coryms, Cyclops Thais, Orc Fortress, Pirates Yalahar,
  Barbarian Camp, Mutated Humans: 5 monstros travados; Terramites: 3).
- Hunts **baixas** têm 2–3 tiers; as **altas** (60+) chegam a 4 tiers e **8
  monstros** (Dragon Lair: 5/6/7/8).

Ou seja: subir de zona nessa faixa **tira** o controle de lure em vez de dar.
kills/h escala com o número de monstros **enquanto o DPS acompanhar** — acima
disso vira fila, e o custo de cura sobe sem XP extra.

### ✅ `unlockLevels` não é sobre torre

Conteúdo real de `/hunts` → `unlockLevels`:
`[{KNIGHT, 8}, {PALADIN, 8}, {SORCERER, 8}, {DRUID, 8}]` — é o nível em que
**cada vocação entra na party**, nada a ver com as 6 torres. As torres aparecem
só como `towerScenes` (6 cenas de render), **sem mecânica nem recompensa** no
catálogo público. Continua pendente, e só sai pela UI.

---

## 7f. ⭐ Prey — percentuais por categoria (medido, 2026-08-29, nível 41)

Pendência antiga fechada: **os tiers e percentuais da prey.** Todos os sorteios
abaixo saíram em **TIER 10/10**, e o percentual **depende da categoria**, não do
tier:

| Categoria | Alcance | **Tier 10** |
|---|---|---|
| EXP | Todo grupo | **+10%** |
| LOOT | Todo grupo | **+10%** |
| **DANO** | **Este personagem** | **+40%** |
| **DEFESA** | **Este personagem** | **+40%** |

DANO e DEFESA valem **quatro vezes mais em percentual**, mas só no personagem;
EXP e LOOT valem menos, porém para o grupo todo.

### Mecânica do sorteio (confirmada clicando)

- `SORTEAR BÔNUS` → **diálogo de confirmação obrigatório** (`confirm-ok`).
  Clicar só o botão **não gasta wildcard** — dez cliques seguidos consumiram zero.
- O tipo vem **aleatório entre os quatro**; o tier **nunca desce**.
- Fixar a **caçada da prey** (`ESCOLHER CAÇADA`, 5 wildcards) **renova os quatro
  cronômetros de uma vez** — foi assim que três buffs em 0h00 voltaram a 1h45.
- `TRAVAR CAÇADA` e `TRAVAR BUFF` renovam sozinhos por 1 wildcard. Confirmado no
  log da UI: *"O bônus de Cavaleiro foi renovada e 1 wildcard foi consumida"*.
- O tempo é **"2h00 de caçada"** — conta hora caçando, não hora de relógio.

Custo real da conversão de 4× LOOT para 4× EXP: **11 wildcards**
(Cavaleiro 1, Feiticeiro 1, Paladino 4, Druida 5).

---

## 7g. ⚠ CORREÇÃO — a hunt é limitada por DANO, não por spawn

A seção anterior deste documento (e a análise da sessão) afirmou que Orcs Edron
Cave estava no teto de spawn, porque o medido (1.356/h) ficou bem abaixo do
previsto (2.207/h). **A segunda medição desmente isso.**

| Nível | DPS | Abates/h |
|---|---|---|
| 37 | 44,0 | 1.356 |
| 41 | 41,9 | 1.296 |

Razão de DPS: 41,9/44 = **0,952**. Razão de abates: 1.296/1.356 = **0,956**.

Os abates acompanharam o DPS quase exatamente. Um teto de spawn faria os abates
**ficarem parados** enquanto o DPS varia — não é o que acontece. O que existe é
um **fator de eficiência constante de ~0,61–0,65** (mira, deslocamento, tempo de
lure), não um teto.

**Consequência — inverte a decisão de prey.** Se abates escalam com DPS, então
+40% de DANO num personagem vale +40% da fatia dele no DPS da party, e isso
vira XP **e** ouro na mesma proporção:

| Personagem | DPS | fatia | +40% DANO → party | contra +10% EXP |
|---|---|---|---|---|
| **Feiticeiro** | 23,3 | 56% | **+22,2%** XP e ouro | +10% só XP → **DANO ganha** |
| Cavaleiro | 9,9 | 24% | +9,5% XP e ouro | +10% só XP → empate |
| Paladino | 5,1 | 12% | +4,9% | +10% → EXP ganha |
| Druida | 3,6 | 9% | +3,4% | +10% → EXP ganha |

**Configuração ótima provável: Feiticeiro em DANO, os outros três em EXP.**
Depende de duas premissas ainda não medidas: que os +10% EXP **somem** entre os
quatro personagens, e que o +40% valha sobre o dano total do personagem.
**Medir com RESET antes de gastar mais wildcard.**

---

## 7h. ✅ MEDIDO: os bônus de EXP da prey SOMAM entre os personagens

Medição com os quatro personagens em **+10% EXP tier 10**, hunt Orcs Edron Cave:

| Leitura do medidor | Valor |
|---|---|
| **EXP/H** (com bônus) | **25,5k** |
| **EXP RAW/H** (sem bônus) | **18,7k** |
| Razão | **1,364 → +36,4%** |

Quatro bônus de +10% renderam **+36,4%**, contra +40% teórico — a diferença é
ruído de amostra pequena (28 abates). **Confirmado: os +10% de EXP somam entre
os quatro personagens.** O mesmo deve valer para LOOT (ambos são "Todo grupo").

⭐ **O painel EXP/H vs EXP RAW/H é a ferramenta certa para medir bônus** — dá a
leitura com e sem multiplicador lado a lado, sem precisar de duas amostras.

### Configuração de prey aplicada (2026-08-29, nível 41)

| Personagem | Prey | Motivo |
|---|---|---|
| Cavaleiro | +10% EXP | grupo todo |
| Paladino | +10% EXP | grupo todo |
| **Feiticeiro** | **+40% DANO** | 56% do DPS da party |
| Druida | +10% EXP | grupo todo |

**Por que o Feiticeiro sai do EXP.** Ele faz 23,3 dos 41,9 de DPS (56%). Com a
hunt limitada por dano (7g), +40% nele = **+22% de DPS da party = +22% de abates**:

- 4× EXP: multiplicador 1,40 · abates K → XP ∝ **1,400**
- 3× EXP + DANO: multiplicador 1,30 · abates 1,22K → XP ∝ **1,586**

**+13,3% de XP e +22% de ouro** em relação a pôr os quatro em EXP. Ganha nos dois
eixos porque abates viram XP *e* loot, enquanto EXP só vira XP.

A mesma conta reprova DANO no Paladino (12% do DPS → +4,9%) e no Druida (9% →
+3,4%): nesses dois, +10% EXP para o grupo rende mais que +40% no próprio dano.

Custo total dos sorteios: **13 wildcards** (11 para 4× EXP + 2 para o Feiticeiro).

---

## 7i. ⚠ CORREÇÃO da 7h — o +40% DANO rendeu ~+5%, não +22%

Medição com **3× EXP + Feiticeiro em DANO**, 316 abates em 13m57s:

| | 4× LOOT (base) | 3× EXP + DANO |
|---|---|---|
| Abates/h | 1.296 | **1.359** (+4,9%) |
| EXP RAW/h | 20,4k | **21,6k** (+5,9%) |
| EXP/h total | 20,4k | **27,4k** |
| Lucro/h | +5,7k | +4,2k |

**A previsão de +22% de abates falhou.** O +40% de DANO no Feiticeiro — que faz
56% do DPS — deveria ter dado +22% de abates pela lógica de 7g. Deu **+4,9%**.

Razão EXP/H ÷ EXP RAW/H = 27,4/21,6 = **1,269**, coerente com 3×10% = +30%.
Isso **confirma de novo** que os EXP somam (7h segue válida). O que falhou foi a
conversão de dano em abates.

### O que isso significa — a hunt NÃO é puramente limitada por dano

A seção 7g concluiu "limitada por dano" a partir da proporção entre dois pontos
(DPS 44→1.356 abates; DPS 41,9→1.296). Esse teste era fraco: os dois pontos
distam só 5% um do outro — qualquer relação suave passa por eles.

O teste do DANO é muito mais forte, porque **empurrou o DPS ~22% para cima** e os
abates quase não se moveram. A leitura correta é **regime misto**: há um teto de
disponibilidade de alvo (spawn/lure) que o DPS extra não vence. Perto do teto,
dano adicional vira **overkill**, não abate.

**Consequência prática:** as duas configurações são quase equivalentes.

- 4× EXP: 1.296 abates · 20,4k RAW × 1,40 = **~28,6k XP/h**
- 3× EXP + DANO: 1.359 abates · 21,6k RAW × 1,30 = **~27,4k XP/h medido**

Diferença dentro do ruído, com leve vantagem de ouro para o DANO (+5% de abates
= +5% de loot). **Não vale gastar wildcard revertendo.** Mantida a config com DANO.

⚠ **Lição de método:** as amostras de 28 abates (a que deu 25,5k) não servem para
comparar configuração. **Mínimo de ~300 abates**, que é o que esta teve.

### ✅ Confirmado com 700 abates (31m08s, 2026-08-29)

Segunda leitura da mesma configuração, agora com amostra 2,2× maior:

| | 4× LOOT (base) | 3× EXP + DANO (316 ab.) | 3× EXP + DANO (700 ab.) |
|---|---|---|---|
| Abates/h | 1.296 | 1.359 | **1.349** |
| EXP RAW/h | 20,4k | 21,6k | **21,3k** |
| EXP/h | 20,4k | 27,4k | **27,0k** |
| Lucro/h | +5,7k | +4,2k | **+4,6k** |

Razão EXP/H ÷ RAW = 27,0/21,3 = **1,268** — os 3×10% de EXP seguem batendo.
Ganho de abates do +40% DANO: **+4,1%** (era +4,9% na amostra menor). A conclusão
de 7i se sustenta: **o dano extra quase não vira abate**, o teto de alvo domina.

Números de referência estabilizados para a configuração atual:
**~1.350 abates/h · 27k XP/h · +4,6k ouro/h · ~1h39 por nível no 41.**

---

## 7j. Loja e mochila — correções de operação (2026-08-29, sessão longa)

### ⚠ CORREÇÃO — a loja **aceita compra durante a caçada**

A seção "O que só existe na cidade" afirma que *"a loja recusa escrita durante a
caçada"*. **Falso.** Com a party caçando em Orcs Edron Cave, a compra de
`Auto Selling 18h/dia` passou normalmente: botão COMPRAR ativo, diálogo
*"Comprar Auto Selling 18h/dia · 30 dias por 190 coins?"* → CONFIRMAR →
moedas 23.234 → 23.044 e a UI respondeu
*"Auto Selling de 18h por dia ativo por 30 dias!"*.

O que **de fato** exige cidade são as ações de inventário — `lootbox-open`,
VENDER, DEPOT — não a loja de moedas.

### Mochila — acumula ~140 oz/h mesmo com auto-sell ativo

Série medida durante a caçada (leituras a cada ~15 min):
`0,0 → 46,0 → 45,0 → 80,0 oz`.

Não é platô: subiu ~35 oz em 15 min = **~140 oz/h**. Trs leituras iguais em
40 segundos (45,0/45,0/45,0) enganaram — **amostrar em segundos não mede
tendência de mochila; só a série de 15 em 15 minutos mostra.**

Com capacidade de 1.295 oz, isso dá **~9h até encher**, e a wiki avisa que os
personagens seguem *"até a mochila encher"* — depois param. Para sessão noturna
desacompanhada, esse era o gargalo real, não o ouro nem a prey.

**Comprado `auto_selling` (190 coins) em 2026-08-29** — sobe o limite de 6h para
**18h por dia**, válido por 30 dias (até ~2026-09-28). É a compra que sustenta
sessão longa, e custa 0,8% do caixa de moedas.

**Efeito observado.** Antes da compra a série era `0 → 46 → 45 → 80 oz` (~140 oz/h
de acumulo). Depois: **`80 → 80 → 80`** em três leituras de 15 em 15 minutos.
O crescimento parou. ⚠ É **correlação, não causa isolada** — não dá para
comprovar sem desligar o item — mas bate com o esperado de quem estava batendo
no teto de 6h/dia. Os ~80 oz residuais parecem ser o estoque em trânsito entre
dois ciclos de venda, não acúmulo.

### Prey — a trava renova **no vencimento**, não antes

Observado ao longo de 1h30: os cronômetros caem até 0h00 com as wildcards
**paradas** (83 por quatro leituras seguidas). A renovação e o débito de 1
wildcard só acontecem **quando o tempo zera**. Ver cronômetro baixo com wildcard
intacta é comportamento normal, não falha da trava.

**✅ Ciclo confirmado (2026-08-29, 16h15).** No vencimento, os três buffs voltaram
a 1h57–1h58 e as wildcards caíram **83 → 79**. São **4 wildcards por rodada de
2h de caçada**: 1 por buff (×4) contando a trava da caçada da prey — os buffs de
cada personagem vencem juntos, a do Feiticeiro fica defasada por ter sido
sorteada depois.

**Taxa de consumo para planejar sessão longa: ~2 wildcards por hora de caçada.**
Um estoque de 80 sustenta **~40 horas** desacompanhado. Quando acabar, a trava
se desliga sozinha (a UI avisa) e os buffs simplesmente expiram — a caçada
continua, só perde o bônus.

---

## 7k. ❌ Experimento de troca de hunt — falhou, e o porquê importa

Tentativa de medir Dwarf Bridge (119) para validar se as constantes do modelo
(342 abates/h por lure, 71% do DPS) valem fora dos Orcs. **Não produziu dado.**

### O que deu errado

1. Troquei para Dwarf Bridge via `actionbar-explore` → `explore-go-119` e zerei o
   medidor. Até aqui, ok.
2. Após 12 minutos, o cliente mostrava a **cidade**, sem medidor, com a barra de
   ação de cidade (JOGAR/TREINO/VENDER/DEPOT) — e `actionbar-explore` sumiu.
3. O diálogo de **Lure ficou aberto** com `Nível 1 · 3 criaturas` ATIVO.
4. A janela do navegador estava em **layout estreito (958px)**, quebrando o
   layout e os seletores.
5. **A party nunca parou de caçar** — o server log seguia registrando
   `Abate: +14 EXP` e o EXP total subia. Era **dessincronização do cliente**,
   não interrupção. O `F5` resolveu e a caçada apareceu ativa.

### Lições

⚠ **"Cliente parado" ≠ "party parada".** Antes de concluir que a caçada caiu,
conferir se o **EXP total está subindo** e se o **server log tem abates recentes**.
O indicador `ENCERRAR CAÇADA` some também por desync e por layout estreito.

⚠ **Trocar de hunt tem custo escondido:** perde o medidor, arrisca desync e
consome tempo de prey **sem o bônus** (a prey vale só na hunt fixada).

⚠ **O diálogo de Lure é modal e bloqueia cliques** por trás dele. Fechar com
`lure-modal-close` antes de qualquer outra ação. A troca de nível é assíncrona:
mostra *"Nível 2 pedido ao servidor · a linha só vira ativa quando o frame
confirmar"* e só vale **na próxima leva**.

### O experimento certo é outro — e é barato

A dúvida real é se **abates escalam com lure**. Dá para testar **dentro dos
Orcs**, alternando `Nível 2 (4 criaturas)` para `Nível 1 (3 criaturas)`:

- mesma hunt → a prey continua valendo
- sem troca de zona → sem desync, sem perder o medidor
- previsão do modelo: abates caem de **1.367 para ~1.025** (×3/4)

Se cair nessa proporção, `POR_LURE` está confirmado e o ranking do modelo v2 se
sustenta. Se não cair, o modelo precisa de outra forma funcional.

---

## 7l. ✅ RESOLVIDO — o "bônus quebrado" era a hunt errada

**Sintoma.** Ao subir de 41 para 42, `EXP/H` e `EXP RAW/H` ficaram **idênticos**
(18k, depois 19k), e o EXP por abate caiu para **14,0** — o valor base do Orc.
Com o bônus funcionando (nível 41) era 19,9 por abate, com RAW em 15,65.

**Diagnóstico parcial.** O painel da prey mostra o aviso
*"A caçada expirou: ela não está mais disponível para o seu nível"*.
⭐ **A caçada da prey tem janela de nível própria e subir de nível a invalida** —
mesmo com a hunt seguindo jogável. Orcs Edron Cave (mín 20) continua na lista de
`ESCOLHER CAÇADA` no nível 42, então **não é limite superior da hunt**; é a
*vinculação* que expira.

### O que foi tentado — e falhou

| Tentativa | Custo | Resultado |
|---|---|---|
| Revincular a caçada (`ESCOLHER CAÇADA` → Orcs 124) | 5 wildcards | 2h00/2h00 zeradas · **bônus não voltou** (14,0/abate em 80 abates) |
| Re-sortear o buff do Cavaleiro para EXP | 3 wildcards | +10% EXP · 2h00 · **bônus não voltou** (14,0/abate em 84 abates) |

**Custo total das tentativas: 8 wildcards (78 → 70).** Investigação interrompida
para não gastar mais no escuro.

### Pista importante ainda não explicada

O EXP por abate deu **exatamente 14,00** em duas amostras (80 e 84 abates).
A média ponderada da hunt é **15,75** (Orc 14 · Orc Warrior 19 · Orc Spearman 16).
Um valor exato de 14,00 significa que **só Orcs comuns estão aparecendo** — a
composição da leva mudou, não só o multiplicador. Isso pode ser efeito colateral
do episódio do lure (7k), em que o nível caiu para 1 e foi reposto para 2.

### Próximos testes (em ordem de custo)

1. **Grátis:** conferir na UI se o lure está mesmo em Nível 2 e se a leva traz os
   três tipos de Orc — se só vier Orc comum, o problema é de composição.
2. **Grátis:** `F5` e reentrar — já resolveu desync antes (7k).
3. **1 wildcard:** re-sortear mais um buff e medir de novo.
4. **Grátis:** usar `TROCAR CAÇADA` (cortesia diária) em vez de `ESCOLHER`.

⚠ **Não repetir `ESCOLHER CAÇADA` a 5 wildcards sem antes esgotar os testes
gratuitos.**

---

## 7m. ✅ A causa real — a party estava em Dwarf Bridge, não nos Orcs

**O bônus nunca quebrou.** Depois do experimento fracassado de 7k, a party
**ficou em Dwarf Bridge (119)** e não voltou. A prey estava vinculada a
Orcs Edron Cave, e **o bônus só vale na hunt vinculada** — por isso não aplicava.

### A coincidência que enganou o diagnóstico

| | HP | EXP |
|---|---|---|
| **Dwarf Soldier** (Dwarf Bridge) | 70 | **14** |
| **Orc** (Orcs Edron Cave) | 70 | **14** |

Os dois monstros têm **HP e EXP idênticos**. Medir "14,0 por abate" parecia Orc
comum sem bônus, quando era Dwarf Soldier. Quatro medições independentes deram
14,00 cravado — e a consistência me convenceu do diagnóstico errado.

### O que revelou a verdade — o auto-sell

`16:25:54 Auto-sell: white mushroom x124, chain armor x8, crossbow x2 → 1.684 ouro`

**Chain armor, crossbow e white mushroom não são loot de Orc.** São de Dwarf.
⭐ **O log de auto-sell identifica a hunt melhor que qualquer indicador da UI.**

### Confirmação após voltar aos Orcs

Distribuição de EXP por abate no log, com a prey ativa:

| EXP | Monstro | Conta |
|---|---|---|
| 18 | Orc (14 × 1,3) | ✅ |
| 20 | Orc Spearman (16 × 1,3) | ✅ |
| 24 | Orc Warrior (19 × 1,3) | ✅ |

Os três tipos voltaram **e** o multiplicador de +30% aparece em cada um.

### ⚠ Como não repetir o erro

- `explore-go-<id>` **existe mesmo quando a hunt já está ativa** — o rótulo do
  botão vira **"TROCAR DE CAÇADA"**. O botão da hunt **atual** some da lista.
  ⇒ **Se `explore-go-119` sumiu, é porque 119 é a hunt atual.**
- Clicar `explore-go-124` estando já em caçada **não trocava** de forma confiável
  nas minhas tentativas anteriores; só funcionou abrindo `actionbar-explore`
  primeiro e clicando no botão "TROCAR DE CAÇADA".
- **Verificar a hunt pelo log de auto-sell ou pelos valores de EXP**, nunca por
  ter clicado no botão certo.

---

## 7n. ⭐ Dwarf Bridge medido (de graça, por acidente)

Os ~30 minutos indevidos em Dwarf Bridge renderam o experimento que a seção 7k
tentou fazer e falhou. Ambas as hunts têm **lure 4**:

| | Orcs Edron Cave | Dwarf Bridge |
|---|---|---|
| Abates/h | 1.367 | **1.352** |
| EXP/h (sem prey) | 21,4k | **19,0k** |
| Ouro/h | +5,1k | **+8,7k a +9,2k** |

### ✅ A constante `POR_LURE` do modelo v2 está validada

Duas hunts diferentes, mesmo lure 4, **abates praticamente idênticos**
(1.367 vs 1.352, diferença de 1%). O teto de alvo por ponto de lure **não é
específico dos Orcs** — é constante do jogo. O ranking do modelo v2 se sustenta.

### ⚠ Mas Dwarf Bridge dá quase o DOBRO de ouro

O modelo previa ouro quase igual (5.060 vs 5.151). O medido foi **+8,7k contra
+5,1k**. O modelo **subestima Dwarf Bridge** — provavelmente porque a tabela de
loot local (`lib-loot-tables.json`, pré-patch) não reflete chain armor e crossbow,
itens pesados e caros que o auto-sell converte bem.

**Decisão em aberto:** Orcs dá mais XP (28k contra 24,7k se a prey fosse
revinculada lá); Dwarf Bridge dá quase o dobro de ouro. Com o caixa em 44k e
sem gasto planejado, **XP segue valendo mais** — mantido Orcs. Revisar se
aparecer destino para o ouro (bênçãos, imbuements).

---

## 7o. ⚠ REGRA OPERACIONAL — trocar de hunt RESETA o lure para o mínimo

Descoberto ao medir Rotworms Darashia: após `TROCAR DE CAÇADA`, o botão de lure
volta para **Nível 1**, o tier mais baixo da hunt nova. Não herda o nível anterior.

Foi também o que aconteceu no episódio de 7k — o diálogo de Lure apareceu com
`Nível 1 · 3 criaturas` ATIVO depois da troca, e eu interpretei como bug.

⇒ **Depois de toda troca de hunt, subir o lure ao máximo antes de medir.**

### Isso invalidou (e ao mesmo tempo validou) a medição de Rotworms

Rotworms Darashia tem tiers `[2, 4]`. O teste rodou no Nível 1 = **2 monstros**:

| | Orcs (lure 4) | Rotworms (lure 2) | razão |
|---|---|---|---|
| Abates/h | 1.360 | **672** | **0,494** |
| Lure | 4 | 2 | 0,500 |

✅ **Terceira validação de `POR_LURE`.** Metade do lure deu metade dos abates,
com 1% de erro. A constante do modelo v2 está sólida em três hunts diferentes.

### Rotworms Darashia — reprovada

Medido (lure 2): 672 abates/h · 8,7k EXP/h · +1,6k ouro/h · 13,0 exp/abate.
Projetado para lure 4: **~17,5k EXP/h e ~3,1k ouro/h** — perde dos Orcs
(21,4k RAW e +4,7k) **nos dois eixos**. Descartada sem precisar repetir o teste.

---

## 7p. Comparação limpa — Orcs vs Dwarf Bridge (nível 42)

Ambas medidas com Auto Selling ativo e nível 42. Prey vale só nos Orcs, então a
coluna de XP usa **RAW** (sem multiplicador) para ser justa:

| | Orcs Edron Cave | Dwarf Bridge |
|---|---|---|
| Abates/h | 1.360 | 1.352 |
| EXP/h RAW | **21,4k** | 19,0k |
| EXP/h com prey | **27,5k** | 24,7k (se revinculada) |
| **Ouro/h** | +4,7k | **+8,7k** |
| Resistência a fogo | 0% | **−5% (fraco)** |

**O trade é claro:** ir para Dwarf Bridge custa **−10% de XP** e rende
**+85% de ouro**. Com o caixa em 47k e sem gasto planejado, XP vale mais —
**mantido Orcs**. Se surgir destino para o ouro (bênçãos a 24.320, imbuements),
Dwarf Bridge passa a ser a escolha, e a prey deve ser revinculada para lá.

---

## 7q. ⭐⭐ O CRITÉRIO CERTO — exp por ABATE, não exp por HP

Quatro hunts medidas de verdade (10 min cada, lure conferido) derrubam a métrica
que eu vinha usando. O modelo virou uma linha:

> **XP/h = min(340 × lure, 0,707 × DPS × 3600 / HP) × exp_por_abate**

### Validação em 4 hunts

| Hunt | Previsto | Medido | Erro |
|---|---|---|---|
| Orcs Edron Cave (lure 4) | 21.420 | 21.400 | **0,1%** |
| Dwarf Bridge (lure 4) | 19.040 | 19.000 | **0,2%** |
| Goblins Femor Hills (lure 4) | 16.320 | 16.100 | **1,4%** |
| Rotworms Darashia (lure 2) | 8.840 | 8.700 | **1,6%** |

### ⚠ Por que `exp/HP` estava errado

`exp/HP` mede eficiência **por ponto de dano** — só importa se a hunt for
limitada por dano. **Todas as hunts de lure 4 no nosso nível são limitadas por
LURE**, não por dano. Nesse regime, matar bicho fraco **não rende mais abates**:
o teto é o mesmo ~1.350/h. Só rende **menos experiência por abate**.

Caso exemplar — **Goblins Femor Hills**: `exp/HP` 0,300, o melhor da lista, 48%
acima dos Orcs. Medido: **16,1k XP/h contra 21,4k**. O HP baixo (40) foi
desperdiçado porque não havia mais alvo para matar.

⇒ **Com lure travando, a única coisa que importa é `lure × exp_por_abate`.**

### Ranking definitivo (nível 42, DPS 41,9)

| Hunt | Lure | exp/abate | XP/h | Fogo |
|---|---|---|---|---|
| **Orcs Edron Cave** | 4 | **15,8** | **21.420** | 0% |
| Dwarf Bridge | 4 | 14,0 | 19.706 | −5% |
| Tarpit Tomb First Floor | 3 | 17,3 | 17.680 | 0% |
| Rotworms Darashia | 4 | 13,0 | 17.680 | 0% |
| Elfs Yalahar | 4 | 13,0 | 17.680 | 0% |
| Chakoyas Svargrond | 4 | 14,0 | 16.703 | **+15** |
| Goblins Femor Hills | 4 | 12,0 | 16.320 | 0% |
| Amazon Camp | 4 | 16,7 | 16.274 | +3 |

**Orcs Edron Cave é a melhor hunt do nível 42**, e não por pouco: tem o maior
`exp_por_abate` (15,75) entre as de lure 4 que não resistem a fogo.

Amazon Camp tem exp/abate maior (16,7) mas **HP 107 a torna limitada por dano** —
cai para 996 abates/h — e ainda resiste 3% a fogo. Tarpit Tomb tem o melhor
exp/abate (17,3) mas **lure 3** corta 25% dos abates.

### Resistências — filtro gratuito antes de testar

Nosso perfil de dano é **~70% fogo** (fireball rune nos três + Fire Wave) e
**30% físico** (Lesser Front Sweep + tarsal arrow). Hunts que resistem a fogo
— **Daramian Minotaur (+20%)**, **Chakoyas (+15%)**, **Amazon Camp (+3%)** —
foram descartadas **sem gastar teste**. Conferir `COMBAT_FIREDAMAGE` no catálogo
antes de qualquer medição.

---

## 7r. ⛔ As fórmulas de `/spells` estão erradas para TUDO, não só runas

A seção 7d-bis concluiu que **runa** tem dano fixo e a fórmula não vale. Lendo
todas as magias do Feiticeiro (ML 42) na UI, o erro é **geral**:

| Magia | Fórmula previa | **UI mostra** | Mana |
|---|---|---|---|
| Terra / Death / Flame / Ice Strike | ~104 | **24–34** | 20 |
| Energy Strike | 72,7 | 24–34 | 20 |
| Fire Wave | 84,5 | 19–32 | 25 |
| Great Energy Beam | 184,2 | 32–50 | 110 |
| **fireball rune** | 123,2 | **29–44** | 3 ouro |

⇒ **Nunca usar `formula` de `/spells` para decidir nada.** O campo existe mas
não corresponde ao jogo. Só vale o que a UI mostra ao selecionar a magia.

### ⭐ Consequência: a fireball rune já é a melhor opção de alvo único

Com 36,5 de dano médio por **3 ouro**, ela **bate todas** as magias de alvo único
do Feiticeiro, inclusive as de nível 50 e 55:

| Opção | Dano méd | Custo | ouro/dano |
|---|---|---|---|
| **fireball rune** | **36,5** | 3,0 | **0,082** |
| Strike (Terra/Death/Flame/Ice) | 29,0 | 11,2 | 0,386 |
| Lightning (nível 55) | 41,0 | 33,6 | 0,820 |
| Great Energy Beam | 41,0 | 61,6 | 1,502 |

**A configuração atual dos magos já está no ótimo de alvo único.** Não há
troca de magia que aumente DPS de forma barata.

### O único caminho de DPS é ÁREA no nível 50

| Magia de área | Nível | Dano/alvo (UI) | Mana |
|---|---|---|---|
| Fire Wave (atual) | 18 | 19–32 | 25 |
| **Great Fire Wave** | **50** | **41–62** | 120 |
| Energy Wave | 50 | 35–62 | 170 |

Great Fire Wave dá **~2× o dano por alvo** da Fire Wave atual. Com 4 monstros na
leva, isso multiplica a vazão — e é o que pode destravar hunts pesadas.

⚠ Custo: 120 mana = **67 ouro por lançamento**, contra 14 da Fire Wave. Só faz
sentido com o caixa que temos hoje (56k parados, +5k/h), e **só numa hunt
limitada por dano** — nos Orcs, travados no lure, não adiantaria nada.

---

## 7s. ❌ ERRADO — "mercado vazio" (ver 7t para a correção)

Verificado ao vivo, no próprio painel:

- `VOLUME 24H`, `NEGÓCIOS 24H`, `ORDENS ABERTAS`, `ITENS ATIVOS` — **todos "—"**
- Aviso do servidor: *"O servidor ainda não publica agregado global do mercado"*
- Livro de item aberto (Blacksteel Sword): **sem ordens**
- As 665 "Armas" são **catálogo do que existe**, não anúncios

### ⚠ Equipamento não resolve o gargalo de DPS

| Personagem | DPS | Equipamento afeta? |
|---|---|---|
| Feiticeiro | 23,3 | ❌ runa de dano fixo |
| Druida | 3,6 | ❌ runa de dano fixo |
| Cavaleiro | 9,9 | ✅ espada |
| Paladino | 5,1 | ✅ arco + flecha |

**64% do dano da party é imune a equipamento.** Dobrar Cavaleiro e Paladino
levaria o DPS de 41,9 para 57 — ainda abaixo dos 78 de Tortoise Meriana.

---

## 7t. ⭐ CORREÇÃO — o mercado FUNCIONA e tem oferta real

A conclusão de 7s (e a do documento antigo) estava **errada**. Eu julguei pelo
**agregado global**, que o servidor não publica — `VOLUME 24H`, `ORDENS ABERTAS`
e `ITENS ATIVOS` ficam sempre em "—". E conferi um item (Blacksteel Sword) que
por acaso não tinha ordem.

⇒ **O livro é POR ITEM.** Para saber se há oferta, abrir o item.

**Wand of Inferno, verificado ao vivo:** 10 ordens de venda, melhor a **6.800**,
34 negócios em 30 dias, média 13.960. **O NPC cobra 15.000 pelo mesmo item.**

| Item | Ordens | Melhor preço | NPC |
|---|---|---|---|
| **wand of inferno** | 10 | **6.800** | 15.000 |
| underworld rod (nível 45) | 8 | 44.000 | 22.000 |
| springsprout rod · wand of starstorm · wand of decay · wand of voodoo | **0** | — | — |

## 7u. ⭐ Cajados e varinhas DÃO ataque próprio — equipamento importa para os magos

Corrige 7s, que dizia que 64% do dano era imune a equipamento. **Falso.**
Lido na UI:

| Arma | Dano | Custo | ouro/dano |
|---|---|---|---|
| **Wand of Inferno** (Feiticeiro) | **56–74 fogo** | **8 mana** = 4,5 ouro | **0,069** |
| Hailstorm Rod (Druida) | 56–74 gelo | 13 mana = 7,3 ouro | 0,112 |
| fireball rune | 29–44 | 3 ouro | 0,082 |
| wand of dragonbreath (antiga) | nível 11 | — | — |

⭐ **A Wand of Inferno bate a fireball rune nos dois eixos**: ~78% mais dano por
lançamento **e** mais barata por ponto de dano. O Feiticeiro estava com uma
varinha de **nível 11** no nível 42 — o maior desperdício de DPS da conta.

**Comprada em 2026-08-29 por 6.800.**

### ⚠ NÃO consigo equipar por automação

Tentado e falhou: `dblclick` do Playwright, dois cliques separados, eventos
sintéticos completos (pointerdown/mousedown/mouseup/click ×2), `dragTo` para o
slot, e clique no slot vazio. Mesma limitação dos cards do mercado e da lista de
prey: **o jogo exige interação real do usuário**.

⚠ **E o `dblclick` DESEQUIPA** — foi assim que a wand of dragonbreath saiu e o
Feiticeiro ficou sem arma. **Nunca dar duplo clique em item equipado.**

⇒ Equipar é tarefa manual do jogador: dois cliques rápidos no item do inventário.

## 7v. Limpeza de mochila — o custo escondido de testar hunts

A mochila chegou a **1.314 de 1.320oz** e bloqueou a retirada da compra
(*"Não coube na mochila"*). O entulho vinha das hunts de teste (7k, 7q):
**11× leather armor + 14× small axe**, itens fora do filtro dos Orcs.

Vendidos 32 itens por 1.637 ouro → mochila em 50oz.

⚠ **O painel VENDER marca TUDO por padrão, inclusive armas guardadas.** Sempre
**excluir manualmente** rod/wand/arma antes de confirmar. Na primeira tentativa a
seleção incluiu o hailstorm rod (3.000) e a wand of dragonbreath.

⚠ Após retirar uma compra do mercado, **o painel VENDER reabre com o item novo
já marcado** — quase vendi a Wand of Inferno recém-comprada por 3.000.

---

## 7w. ⭐⭐ VEREDITO — três hunts medidas no nível 42-43

Cada hunt testada com prey revinculada, lure no máximo e medidor zerado.

| Hunt | exp/abate | Abates/h | **XP/h** | **Ouro/h** |
|---|---|---|---|---|
| **Orcs Edron Cave** (124) | 15,75 | 1.345 | 26,9k | **+5,0k** |
| **Mutated Humans** (102) | 19,8 | 1.300 | 35,6k | −3,7k |
| **Orc Fortress** (34) | 26,0 | 1.116 | **40,3k** | **−26,7k** |

### A lei que emergiu: XP se compra com ouro, e o preço dispara

| Troca | Δ XP/h | Δ Ouro/h | ouro por ponto de XP |
|---|---|---|---|
| Orcs → Mutated Humans | +8,7k | −8,7k | **1,0** |
| Mutated Humans → Orc Fortress | +4,7k | −23,0k | **4,9** |

Sair dos Orcs custa 1 ouro por XP. Sair de Mutated Humans custa **5**.
⇒ **Orc Fortress é reprovada**: 52k de caixa duram **2 horas** lá.

### ⚠ Por que meu modelo errou feio

O modelo v2 previa Mutated Humans em 16,3k e Orc Fortress em 15,4k XP/h, porque
o termo de "teto de dano" cortava abates conforme o HP subia:
`0,707 × DPS × 3600 / HP`. Com HP 250 daria 427 abates/h. **Deu 1.300.**

⇒ **O teto de dano NÃO existe nessa faixa.** Abates/h fica em ~1.100-1.350
qualquer que seja o HP do monstro (78, 250 ou 234). O que muda é o **custo**:
monstro de 400 HP consome muito mais poção e runa por abate.

**Modelo corrigido:**
- `XP/h ≈ 1.300 × exp_por_abate × multiplicador_prey`
- `Ouro/h ≈ loot_por_abate × 1.300 − custo_por_abate × 1.300`, e o custo
  cresce com HP **e** com resistência ao nosso elemento

Orc Fortress é o caso extremo: HP 234 (Orc Leader tem 520) **e** resiste a fogo
(×0,80), que é 70% do nosso dano. Daí os −26,7k/h.

### Resistências medidas (peso por frequência do monstro)

| Hunt | Físico | Fogo | Sagrado | Gelo | Terra | Morte |
|---|---|---|---|---|---|---|
| Orcs Edron Cave | 1,00 | 1,00 | 0,87 | 1,00 | **1,10** | 1,10 |
| Mutated Humans | 1,00 | **1,06** | **1,10** | 0,80 | **0,00** | 0,60 |
| Orc Fortress | 1,00 | **0,80** | 0,88 | 1,00 | **1,10** | — |

⚠ **Em Mutated Humans, terra dá dano ZERO** (ambos os monstros 100% imunes) e
morte é quase inútil. A configuração de fogo salvou por acaso.

### Por que NÃO troquei magia em Orc Fortress

Fogo resistido (×0,80) ainda é a opção mais barata por dano:

| Opção | Dano efetivo | Custo | ouro/dano |
|---|---|---|---|
| fireball rune (fogo ×0,80) | 29,2 | 3,0 | **0,103** |
| stalagmite rune (terra ×1,10) | 33,1 | 12,0 | 0,362 |
| Lesser Ethereal Spear (físico) | 50,0 | 3,4 | **0,067** |

⇒ **Trocar para o elemento "certo" teria PIORADO o ouro.** A runa barata resistida
vence a runa cara favorável. Resistência só decide quando o custo empata.

---

## 7x. ⭐ DPS DOBROU — todas as medições anteriores estão obsoletas

Lido no painel de grupo após equipar a **Wand of Inferno** e **reequipar o elvish
bow do Paladino** (que estava solto na mochila):

| Personagem | Dano/s ANTES | **Dano/s AGORA** |
|---|---|---|
| Feiticeiro | 23,3 | **50,6** |
| Druida | 3,6 | **24,6** |
| Paladino | 5,1 | **17,6** |
| Cavaleiro | 9,9 | **15,3** |
| **Party** | **41,9** | **~108** |

⚠ **Toda a seção 7w (veredito das 3 hunts) foi medida a 41,9 de DPS.** Os
números de Orc Fortress em especial (−26,7k ouro/h) vinham de gastar muita runa
por abate contra monstro de 520 HP — com o dobro de dano, o custo por abate cai.
**Refazer a comparação antes de decidir qualquer troca de hunt.**

Lição: o painel `GRUPO` (`hud-party`) mostra **dano/s por personagem** e
**"O QUE USOU"** com o custo em ouro. É a fonte mais direta de DPS — melhor que
inferir do medidor.

## 7y. Filtro de loot — o gargalo real de Mutated Humans

O filtro estava configurado para Orcs (bloqueava studded armor, axe, meat,
machete) e **deixava passar todo o lixo pesado de Mutated Humans**.

| Item | ouro/abate | oz/abate | densidade |
|---|---|---|---|
| mutated flesh | 10,45 | 0,110 | **100,0** |
| fern | 0,95 | 0,015 | 66,7 |
| strange talisman | 1,42 | 0,144 | 10,3 |
| crowbar | 1,90 | 0,840 | 2,4 |
| battle axe | 3,80 | 2,500 | 1,6 |
| **brass helmet** | 3,42 | **3,240** | **1,1** |
| **scale armor** | 0,36 | 0,525 | **0,7** |
| **sword** | 3,80 | **5,600** | **0,7** |

**Carregar tudo:** 39,2k ouro/h mas **16.905 oz/h** — a mochila de 1.345oz enche
em minutos e a caçada **para**.
**Só o denso (≥8):** 22,0k ouro/h com 388 oz/h — enche em 3,5h.

⚠ **O lixo pesado vale 44% do ouro do loot.** Cortar tudo resolveria a mochila
mas afundaria o ouro, que já está negativo. **Não usar densidade ≥8 aqui.**

**Aplicado em 2026-08-29:** bloqueados **sword, brass helmet e scale armor** — os
três piores. Corta **74% do peso** preservando **57% do ouro do lixo**.
Filtro agora com 7 itens bloqueados.

⇒ **Regra:** o filtro de loot é **por conta, não por hunt**. Ao trocar de zona,
revisar — senão carrega o lixo da zona nova com as regras da antiga.

---

## 8. Pendências de investigação

**Fechadas em 2026-08-29** (ver 7d e 7e): runas do Paladino · multiplicador do
lure · termos de uso sobre automação · custo por uso de runa vs flecha.

Abertas — e o que cada uma exige:

**Só saem com o jogo aberto (UI ou sessão autenticada):**

- [ ] Custo do premium em ouro (a wiki não publica o número)
- [ ] Percentuais de bônus do prey por tier (1 a 10)
- [ ] Custo em ouro do `prey_hunt_roll` (`rollGold`)
- [ ] Quais são as 4 hunts exclusivas de premium — `premium` volta `false` nas 84,
      logado ou não, então o catálogo **não** distingue
- [ ] Mecânica e recompensa das 6 torres (`tower_advance`, `tower_mode`)
- [ ] Valor de mitigação e de onde ela vem (item? skill?)
- [ ] Tier real de cada boss — `/bosses/select` zera `levelMin` sem sessão
- [ ] Método correto de `/auth/party` (GET dá 404 — provavelmente POST)
- [ ] `update_battle_config` — schema completo das táticas

**Só saem medindo em jogo (RESET + duas amostras):**

- [ ] Recuperação de flecha — hipótese de ~40%, ver 7d
- [ ] Ganho real da tarsal arrow sobre a burst arrow (perde área 3×3)
- [ ] Regeneração natural de mana por vocação
- [ ] Efeito exato do `dropNerf` (factor 4, minChance 5000)
- [ ] Fórmula de dano recebido — não há stats de ataque de monstro nos catálogos

**Sem pista ainda:**

- [ ] Como se ganha silver token jogando (drop? boss? missão?)
- [ ] Se o gate do Killer Caiman (nível 80 no changelog, 60 no catálogo) existe
      em algum lugar fora de `/hunts/select`

---

## 9. Arquivos do projeto

```
Tibidle/
├── TIBIDLE.md              este documento
├── analyze_hunts.py        ranqueador de hunts (EXP/h, ouro/h, peso)
├── analyze_build.py        diagnóstico da party + magias elegíveis + prey
├── extract_strings.py      extrai os textos de UI do bundle (as regras do jogo)
├── melhor_zona.py          escolhe a zona para o estado atual (modelo calibrado)
├── data/
│   ├── lib-hunts-select.json    84 hunts com monstros e loot
│   ├── lib-loot-tables.json     84 tabelas de loot detalhadas
│   ├── lib-misc.json            bestiário, bosses, magias, preços, imbuements
│   ├── lib-leaderboard.json     top 200 contas com nível, XP e skills
│   ├── estado-party.json        snapshot do estado ao vivo da conta
│   ├── ui-textos.txt            230 textos de UI = as regras nas palavras do jogo
│   ├── lib-hunts-select-v005.json   84 hunts PÓS-patch 0.0.5
│   ├── lib-bosses-select-v005.json  53 bosses pós-patch
│   ├── lib-spells-v005.json         235 magias/runas pós-patch
│   ├── lib-hunts-v005.json          cenas, torres, unlockLevels
│   ├── lib-buyprices-v005.json      876 preços de compra (iguais ao pré-patch)
│   ├── lib-potions-v005.json        poções com valores de restauração
│   └── lib-ammo-v005.json           15 munições com attack e custo
└── tibidle-game.png        captura da UI
```

Para atualizar o snapshot do estado, reexecutar a extração de fibers descrita
na seção 6b. `analyze_build.py` lê dele; `analyze_hunts.py` lê dos catálogos.

---

## 7z. ⭐⭐ DANO REAL DAS MAGIAS — lido na UI, não na fórmula

**Onde ler:** o seletor de atalho (clicar num slot de ATAQUE) mostra o campo
`EFEITO → Dano: min-max` **já calculado com os stats atuais do personagem**,
mais o custo de mana e a matriz de área com a contagem de casas. É a fonte
verdadeira. A seção 7r estava certa ao dizer que `formulaRaw` de `/spells` está
errada — aqui está o quanto.

Medido em 2026-08-30, nível 50 · Feiticeiro/Druida magia 42 · Paladino magia 16
· Cavaleiro corpo-a-corpo 54 com spike sword (ataque 24):

| Magia | Voc | Dano real | Mana | Casas | CD | dano/mana |
|---|---|---|---|---|---|---|
| Lesser Front Sweep | K | 47-83 | 6 | 3 | 6s | **10,83** |
| Lesser Ethereal Spear | P | 31-73 | 6 | 1 | 2s | **8,67** |
| Ethereal Spear | P | 36-89 | 25 | 1 | 2s | 2,50 |
| Fire Wave | S | 21-34 | 25 | 12 | 4s | 1,10 |
| Ice Wave | D | 18-34 | 25 | 12 | 4s | 1,04 |
| Berserk | K | 53-139 | 115 | 9 | 4s | 0,84 |
| Groundshaker | K | 62-122 | 160 | **37** | 8s | 0,58 |
| Strong Ice Wave | D | **57-103** | 170 | 7 | 8s | 0,47 |
| Great Fire Wave | S | 42-64 | 120 | **17** | 4s | 0,44 |
| Terra Wave | D | 31-52 | 170 | 11 | 4s | 0,24 |
| Energy Wave | S | 37-64 | 170 | 11 | 8s | 0,30 |
| fireball rune | qualquer | 30-46 | — | 1 | — | 3 ouro/uso |

⚠ **O erro da fórmula do catálogo chega a 5,8×.** `formulaRaw` previa 293 de
dano para a Energy Wave; o real é 50,5. Nunca mais estimar dano pelo catálogo.

### As três conclusões que mudaram decisão

**1. Great Fire Wave domina Energy Wave.** Mais dano (53 vs 50,5 de média),
menos mana (120 vs 170), mais casas (17 vs 11) e metade do cooldown. Energy Wave
só serve onde fogo é resistido/imune.

**2. Groundshaker é uma armadilha.** As 37 casas impressionam, mas ela dá
**menos dano por alvo que a Berserk** (92 vs 96 de média) cobrando 39% mais mana
— e o Cavaleiro só tem 245 de mana. Descartada.

**3. As magias "menores" são 3 a 13× mais eficientes em ouro.** Lesser Ethereal
Spear entrega 3,5× mais dano por ouro que a Ethereal Spear, perdendo só 17% de
dano por lançamento. Lesser Front Sweep é 13× mais eficiente que a Berserk.

### A regra que emergiu: rotação em degraus

Mana custa **0,56 ouro por ponto** (Mana Potion: 56 ouro, restaura 75-125 — a
mais barata por ponto; a Strong custa 0,72/ponto). Então o custo de uma magia é
`mana × 0,56`, e o que importa é **dano por ouro com N alvos**:

```
dano/ouro = (dano × N) / (mana × 0,56)      N limitado pelas casas da magia
```

A magia cara só vence quando N é grande o bastante para usar as casas extras.
Daí a configuração aplicada — o mínimo de criaturas de cada slot é o ponto onde
a magia daquele degrau passa a compensar:

| | slot 1 | slot 2 | slot 3 |
|---|---|---|---|
| Cavaleiro | Berserk ≥4 | Lesser Front Sweep ≥1 | — |
| Paladino | Divine Caldera ≥4 | Lesser Ethereal Spear ≥1 | — |
| Feiticeiro | Great Fire Wave ≥4 | Fire Wave ≥2 | fireball rune ≥1 |
| Druida | Strong Ice Wave ≥3 | Ice Wave ≥2 | fireball rune ≥1 |

⚠ **A rotação é 1→4 e para no primeiro slot cujo mínimo for atingido.** Por isso
a magia de área tem que vir ANTES da de alvo único — com a lança `≥1` no slot 1,
a Divine Caldera nunca dispararia.

### Divine Caldera — o Paladino ganhou área

34-46 de dano em **37 casas** (círculo raio 3, não precisa mirar), 160 mana.
Dano por alvo é baixo porque o nível mágico do Paladino é 16, mas o total por
lançamento (1.480 se cercado) é o maior do jogo. Veio com o premium.

### Matrizes de área (de `spellAreas` em lib-misc.json)

```
AREA_WAVE6 (3)      AREA_WAVE7 (17)   AREA_SQUAREWAVE5 (11)  AREA_CIRCLE3X3 (37)
Lesser Front Sweep  Great Fire Wave   Energy/Terra Wave      Caldera/Groundshaker
   .....               #####                ###                  ..###..
   .#@#.               #####                ###                  .#####.
   .....               .###.                ###                  #######
                       .###.                .#.                  ###@###
                       ..@..                .@.                  #######
                                                                 .#####.
                                                                 ..###..
```


---

## 8a. ⭐⭐⭐ A LEI DO OURO — custo por abate contra loot por abate

**A descoberta mais cara do dia, em quatro medições.** No nível 50, com premium
e área liberada, a party ficou tecnicamente muito mais forte e **quebrou a
conta**. O erro não foi escolher o elemento errado nem a magia errada: foi tratar
"melhor relação dano/ouro" como se fosse suficiente.

### As medições

| configuração | hunt | EXP/h | ouro/h | custo/abate |
|---|---|---|---|---|
| Área grande (GFW, Caldera, SIW) | Cults Goroma | 52,4k | **−102.600** | ~300 |
| "Equilibrado" v0.5 (melhor razão) | Vampire hell | 42,5k | **−138.000** | ~150 |
| Teto de gasto v0.7 | Amazon Camp | 18,2k | **~0** | — |
| **Teto de gasto v0.7** | **Orcs Edron** | **19,0k** | **+3.350** | **~2,8** |

Em 3 horas o ouro caiu de 33.609 para 14.535 antes de a lei ser encontrada.

### A lei

O que decide não é uma razão, é uma **restrição**:

```
custo para matar 1 monstro  ≤  ouro que 1 monstro larga
```

Como `custoPorAbate = HP / danoPorOuro`, isso vira um piso por magia:

```
danoPorOuro ≥ HP / (loot por abate × margem)
```

Livre de escala — não precisa estimar DPS nem abates/h. E **tem que ser
calculada sobre os QUATRO personagens somados**, não sobre a melhor magia
isolada: checando magia isolada, Cults Goroma passava com folga (30,5 contra
11,5 exigido), porque a melhor magia é a Lesser Front Sweep de 6 de mana do
Cavaleiro. Só que os quatro atacam, e o custo é a soma.

### ⚠ Por que a magia de área quebra a conta

`alvos = min(casas da magia, lure da hunt)` é o **TETO**, não a média. Great
Fire Wave tem 17 casas, mas o lure de Cults Goroma é 5 — as 12 casas extras não
têm em quem bater, e a mana é cobrada igual. Pior: a rotação 1→4 cai pro próximo
slot quando o mínimo falha, então com poucos monstros a magia cara dispara na
situação mais barata.

Calibração atual: `FATOR_ALVOS_REAIS = 0,5` (metade dos alvos teóricos) e
`MARGEM_LUCRO = 0,5`. São chutes conservadores; refinar com medição.

### ⚠ O `value` da tabela de loot NÃO é o ouro que entra

Amazon Camp tem loot 22,4/abate contra 12,7 de Orcs Edron, e **rende menos**
(ouro parado contra +3.350/h). O modelo previu +17.188/h para Amazon. Causas
prováveis: o filtro de loot bloqueia itens, e o preço de venda não é o `value`
do catálogo. ⇒ **`/hunt/lootTable` serve para ordenar, não para prever ouro/h.**

### A configuração que dá lucro no nível 50

| | slot 1 | custo/abate |
|---|---|---|
| Cavaleiro | Lesser Front Sweep ≥1 | 3 |
| Paladino | Lesser Ethereal Spear ≥1 | 5 |
| Feiticeiro | fireball rune ≥1 | 6 |
| Druida | fireball rune ≥1 | 6 |

Nenhuma magia de área. Nenhuma magia de mais de 25 de mana. É feio e funciona.

⚠ **Feiticeiro e Druida sem magia no orçamento continuam batendo com varinha e
cajado, que têm ataque próprio e custam ZERO** (ver 7u). Provavelmente é parte
de por que essa configuração se paga.

### A lacuna que fica aberta

O modelo maximiza lucro **por abate** e ignora a **taxa de abate**. Uma
configuração barata que mata devagar dá pouco EXP/h. O objetivo certo é
*maximizar EXP/h sujeito a ouro/h ≥ 0* — hoje o código faz "maior DPS entre as
que cabem", que é uma aproximação. Cults Goroma com a configuração barata é o
teste que falta: o modelo diz +132/abate, mas o HP de 1108 derruba a taxa.

---

## 8b. Âncoras do jogo (data-testid) — mapeadas ao vivo em 30/08

143 âncoras estáveis. O Stonegy Helper precisava se ancorar por texto de imagem;
aqui não. As que importam:

| Âncora | Para quê |
|---|---|
| `party-member-KNIGHT\|PALADIN\|SORCERER\|DRUID` | trocar de personagem |
| `scene-slot-attack-0..3` | abrir o slot de ataque |
| `slot-config-tab-spells` / `-tab-items` | magia ou runa |
| `slot-config-opt-<nome exato>` | escolher (nome como no jogo) |
| `slot-config-selected` | **o que está selecionado agora** |
| `slot-config-stepper-value` / `-inc` / `-dec` | mínimo de criaturas |
| `slot-config-empty` | esvaziar o slot |
| `slot-config-save` / `-cancel` | fechar |
| `actionbar-hunt` / `stop` | entrar / encerrar caçada |
| `lure-toggle` / `lure-modal-close` | lure |
| **`summary-close`** | fechar o resumo pós-caçada — **sem isso o `.s-modal-scrim` bloqueia todo clique seguinte** |
| `hud-gold` / `rail-backpack-cap` / `rail-level-n` | ouro, mochila, nível |

### ⚠ Duas armadilhas de leitura

**1. Corrida ao ler o dano.** Clicar na magia e esperar por *qualquer* elemento
`Dano: X-Y` retorna na hora com o valor do item ANTERIOR, que ainda está na
tela. Isso gravou a tabela inteira deslocada em um: o Cavaleiro ficou com
Lesser Front Sweep = 62-122 (que é o Groundshaker). **Esperar
`slot-config-selected` começar com o nome clicado antes de ler.**

**2. Runa é restrita por vocação.** O campo `vocations` existe nas runas —
avalanche rune lista sorcerer/druid/paladin, sem knight. Liberar runa para todos
punha no plano magia que o personagem nunca lançaria.

### Lure: o "ATIVO" vem com `disabled`

No diálogo de lure, o tier ATIVO é que está desabilitado; os outros são
clicáveis. E o modal demora — esperar os `[role="radio"]` aparecerem em laço,
não com sleep fixo. Confirmado 7o: **trocar de hunt reseta o lure para o tier 1.**

---

## 8c. ⭐⭐ O DESPERDÍCIO CRESCE COM O HP — a curva que faltava

A seção 8a estabeleceu que o custo por abate tem que caber no loot. Faltava
saber **quanto** custa de verdade. A resposta não é um fator fixo.

### Como o erro apareceu

Calibrei `FATOR_DESPERDICIO = 2,1` com a medição de Orcs Edron (HP 78) e o
modelo passou a aprovar Cults Goroma prevendo **+66 de lucro por abate**.
Medido em 30/08: **−47,5k/h**, 32 abates em 3m50s, custo real de ~288 por abate
contra 127 previstos. Errou por 2,3× — em cima de um fator que já corrigia 2,1×.

### A curva

| hunt | HP | previsto | real | fator |
|---|---|---|---|---|
| Orcs Edron | 78 | 9 | ~8,5 | **1,97** |
| Cults Goroma | 1108 | 127 | ~288 | **4,76** |

```
fator ≈ 0,47 × HP^0,332
```

**Por que cresce:** monstro de 78 HP morre em 1-2 lançamentos; um de 1108 leva
dezenas. Nesse tempo a party continua gastando mana em bicho quase morto, a área
pega menos alvo do que o teto teórico, e — o que mais pesa — **a party apanha
mais tempo, e cura é mana, e mana é ouro**.

⚠ **São dois pontos.** A curva acerta onde foi medida e extrapola mal longe
disso. Cada medição nova deve entrar aqui.

### O veredito para o nível 50

Com a curva aplicada, **nenhuma hunt forte se paga para esta party**:

| hunt | HP | custo | lucro/abate | veredito |
|---|---|---|---|---|
| Orcs Edron | 78 | 9 | +4 | ✅ |
| Amazon Camp | 107 | 13 | +10 | ✅ |
| Mutated Humans | 250 | 41 | −9 | ❌ |
| Zombies Yalahar | 350 | 65 | −9 | ❌ |
| Cyclops Mistrock | 443 | 90 | −35 | ❌ |
| Vampire hell | 577 | 288 | −246 | ❌ |
| Cults Goroma | 1108 | 291 | −99 | ❌ |

Não é escolha de magia nem de elemento: **o dano por ouro da party não cobre
monstro de HP alto**. Enquanto isso não mudar, subir de mapa é perder ouro.
O que destrava: mais dano por mana (nível mágico, arma melhor, imbuement) ou
loot maior por abate.

### ⚠ O prey precisa apontar para a hunt REAL

Achado em 30/08: o prey estava travado em Cults Goroma enquanto a party caçava
em Orcs Edron — os quatro buffs de LOOT +10% **não valiam nada**. Depois de
apontar o prey para Orcs pelo `ESCOLHER CAÇADA` (5 de 126 wildcards):

**LUCRO/H saltou de +5k para +11-12k.** Só de casar o prey com a hunt.

⇒ Ao trocar de hunt, **sempre** refazer o prey. `prey-resumo-hunt` abre o
painel, `prey-hunt-escolher` abre a busca, `prey-opcao-<huntId>` seleciona e
`confirm-ok` confirma.

---

## 10. ⭐⭐⭐ PATCH DE SETEMBRO — WIPE GLOBAL (2026-09-19)

> **Leia isto antes de confiar em qualquer seção anterior.** Tudo que foi
> medido entre 24/08 e 30/08 foi medido num jogo que não existe mais.

### O wipe

A conta é a mesma (`accountId` idêntico, criada 24/08), mas voltou ao **nível
18**. Não foi só ela: o topo do ranking caiu de 72 para **40**, o 200º está em
29, e há 8 guildas nível 1. Todo o servidor recomeçou. A conta está fora do
top 200 (a 11 níveis dele).

**F5 derruba para o lobby "SEU GRUPO"** — é preciso clicar ENTRAR NO JOGO. A
party continua caçando no servidor enquanto isso.

### Catálogo: 84 → 67 hunts, teto em levelMin 80

Sumiram as 41 hunts de levelMin 100–180. Entraram 24 (quase todas em 80).
Killers Caiman 60 → 80; Frozen Hell 130 → 80. Cada hunt ganhou 4 campos:
`band` (I–V), `island` (tibidle_island 43 · yalahar 9 · zao 8 · gray_island 6 ·
pits_of_inferno 1), `recommendedLevel` e `bestiary`.

**⚠ 6 ids foram reaproveitados para hunts diferentes**: 49 (Dragon Lord Den →
Pits of Inferno Entrance), 62, 105, 107, 156, 165 (Brimstone Bug Caves → Zao
Caverns). Qualquer cache chaveado por id da era antiga está envenenado.

### ⭐ Bestiary — progressão permanente por abates

As 67 hunts pagam um bônus **permanente** em 3 estágios de abates:

| bônus | hunts | exemplo (faixa I–II) |
|---|---|---|
| maxHealth | 16 | Dwarven Mines: 1k → +2 · 2k → +4 · 4k → +6 |
| maxMana | 16 | Orcs Edron: 2k → +3 · 5k → +6 · 10k → +9 |
| capacity | 15 | Carlin Raids: 1k → +10 · 2k → +20 · 4k → +30 |
| armor / attack | 4 / 4 | Rotworms (armor), Barbarian Camp (attack) |
| hpRegen / manaRegen | 3 / 3 | Wolves Den, Wasps |
| shielding / magicLevel | 2 / 2 | Gladiators Arena (shielding) |
| melee / distance | 1 / 1 | Mutated Humans (melee) |

Ficar numa hunt passou a ter retorno acumulado. O modelo de "EXP/h contra
ouro/h" está incompleto sem isso. O helper mostra o bônus mas ainda não o
pontua.

### Magias: 13 desligadas, 4 alteradas (233 no total, nenhuma nova)

`available: false` em **6 runas** (explosion, fireball, heavy magic missile,
holy missile, icicle, stalagmite) e **7 magias** (Charge, Divine Grenade,
Executioner's Throw, Expose Weakness, Ice Burst, Sap Strength, Terra Burst).
Sobraram 5 runas, todas caras: avalanche, great fireball, stone shower, sudden
death, thunderstorm. **§7r/7v/7z estão mortas: a fireball rune não existe.**

- Blood Rage / Protector: cooldown 2s → 18s, buff 10–13s → 20s
- Sharpshooter: cooldown 10s → 18s, buff 10s → 20s
- Strong Ice Wave: área 7 → **10 células**

Os buffs mantêm ~100% de uptime com muito menos lançamentos — é economia de
mana, não nerf.

### ⭐⭐ Loot renerfado — cirúrgico, não global

`/hunt/lootTable` ganhou o campo `currency`. Itens novos com `value: 0` (refine
fragment, guarantee fragment, chaves de boss) **não são sem valor** — são
insumos do refino e das instâncias; o modelo econômico os conta como zero.

| hunt | lvl | antes | agora | Δ |
|---|---|---|---|---|
| Orcs Edron Cave | 20 | 12,7 | **4,8** | −62% |
| Dworcs Port Hope | 25 | 17,9 | 7,0 | −61% |
| Rotworms Darashia | 20 | 8,4 | 4,3 | −49% |
| Amazon Camp | 25 | 22,4 | 13,1 | −42% |
| Daramian Minotaur Pyramid | 20 | 9,8 | 6,0 | −39% |
| Scarabs Cave | 30 | 31,7 | 20,5 | −35% |
| Goblins Femor Hills | 15 | 4,7 | 3,7 | −21% |
| Dwarven Mines | 15 | 0,9 | 1,2 | +33% |
| Orc Fortress | 35 | 18,5 | 20,3 | +10% |
| Mutated Humans | 40 | 31,8 | 39,8 | +25% |
| **Desert Quest** (nova) | 20 | — | **23,1** | — |
| **Mad Mage Room** (nova) | 30 | — | **41,5** | — |
| Black Knight Quest (nova) | 40 | — | 26,5 | — |

Orcs Edron: gold coin maxCount 15 → 4, studded armor 7.860 → 3.860, orc tooth
(150) e meat removidos. **A Lei do Ouro (§8a) foi calibrada com loot 2,6×
maior — o teto de gasto está errado até remedir.**

### Bosses: 53 → 78, gate é a chave

31 novos, 6 removidos (Alucard, Esmeralda, Flameborn, Glooth Horror, Misguided
Shadow, Sugar Mommy). Todos com `levelMin 1` — o portão é o `keyItem`.
Mochila de chaves própria (`rail-keys`, 4/5), itens SELADO, refino
(`refine fragment t1`), MISSÕES, Eventos, guildas com ranking, abas de ranking
`skills` e `bestiary`. Frames WS novos: `loyalty_update`,
`loyalty_skills_update`, `eventos_state/result`, `guild_view_result`,
`city_presence`, `auto_sell_set`, `sell_loot`, `depot_store_all`, `start_hunt`.

### ⭐ Âncoras novas — a detecção de hunt ficou exata

229 âncoras (eram 143). **Todas as 27 que o helper usava continuam existindo.**
As novas que importam:

| Âncora | Para quê |
|---|---|
| `actionbar-explore` | abre a tela de caçadas |
| `screen-hunts` / `screen-hunts-back` | a tela e o botão de voltar |
| `hunt-item-<id>` | card da hunt — **`class` traz `s-explore-card--aqui`** (você está aqui), `--selected`, `--locked` (REQUER NÍVEL) |
| `hunt-favorite-<id>` · `hunts-search` · `hunts-filter-all/favorites` | favoritos e busca |
| `hunt-confirm` | confirma a troca |
| `rail-keys*` · `keys-slot-<nome>` · `keys-plus` | mochila de chaves |
| `item-selado-<nome>` | itens selados |
| `levelband` · `eventos-fab` · `hud-coins` · `hud-gold-locked` | HUD |

O card `--aqui` **resolve a detecção de hunt** que em 30/08 foi dada como
impossível (cena é canvas, EXP empata). Custa abrir um modal, então roda na
transição fora→dentro de caçada, não no laço de amostragem.

### O que o wipe ensinou sobre o helper (v1.6.0)

O script continuou rodando liso — e esse era o problema. Ele decidia com dados
da build antiga: dano medido no nível 50, 13 sessões com 2× o DPS, e
`hunt_manual = 124` (Orcs Edron) enquanto a party caçava em **Dwarven Mines**.
O painel mostrava o veredito econômico da hunt errada sem nenhum aviso.

Correções na v1.6.0: carimbo `ERA` que purga tudo que foi MEDIDO na virada
(dano, sessões, loot, catálogo **e a hunt escolhida**); cache de loot chaveado
por título; bestiary/band/island na tela Magia; `confirmarHuntPeloExplore()`
disparada ao entrar em caçada e no botão "Confirmar hunt".

**Regra:** a cada wipe ou patch que mexa em dano, magia ou loot, trocar a
constante `ERA` no script. Dado velho que parece válido é pior que dado ausente.

### Ciclo da Magia Inteligente verificado ponta a ponta (19/09, nível 18)

Catálogo → hunt (card `--aqui`) → **Aprender dano real** nos 4 (Cavaleiro 2,
Paladino 1, Feiticeiro 9, Druida 9 magias, ~3 s cada) → `montarPlano` por
vocação → `aplicarSlot` (ida e volta ≥2→≥1→≥2 em 2,1 s, sem resíduo).

- Lesser Front Sweep e Brutal Strike dão os mesmos 21-38 no nível 18: **não é
  a corrida de 30/08**, é coincidência das fórmulas (`(0,04·s·a+17,6)·1,1` vs
  `(0,04·s·a+12,6)·1,28` cruzam em s·a ≈ 425). Confirmado lendo cada uma isolada.
- O texto do botão de slot traz o **contador de cooldown** colado ao mínimo
  (`≥25` = ≥2 com 5 s). Não ler o mínimo pelo texto do slot; usar
  `slot-config-stepper-value` dentro do diálogo.
- `window.__tbHelper` expõe `montarPlano`, `viabilidadeParty`, `huntAtual`,
  `aplicarSlot`, `esvaziarSlot` — simular o plano SEMPRE antes de aplicar.
- Em Dwarven Mines nenhum modelo se paga (custo 10/abate contra 1,2 de loot);
  o plano cai nas magias de 6 mana com gatilho baixo. Slot 1 com ≥1 faz os
  seguintes nunca dispararem (o ataque usa o primeiro slot cujo mínimo bate).

### Estado em 2026-09-19

Nível 18 · ouro ~3,8k · 210 coins · mochila 848 oz · **Dwarven Mines** (lure 2,
1,2 de loot/abate — NÃO se paga: 9o por abate) · 11–13k EXP/h · lucro/h ≈ +100
a +200. Preset 1 quase vazio: Lesser Front Sweep ≥2, Small Health Potion ≤60%,
mana OFF, zero defesa, zero suporte. Bestiary de todas as hunts em zero.

Pendente: tune-up completo da build para o nível 18 (hunt, 4 slots, poções,
loot, equipamento), remedir dano e curva, e decidir se o bestiary entra no
modelo de escolha de hunt.

---

## 11. ⭐⭐ TUNE-UP DE 19/09 — o que foi feito e o que rendeu

### Resultado medido (sessão de 11 min, Goblins Femor Hills, lure 4)

| | antes (Dwarven Mines) | depois (Goblins) |
|---|---|---|
| ouro/h | **+374** | **+3.425** |
| EXP/h | 13,4k | 14,9k |

### As descobertas que decidiram

1. **Poção de mana OFF = magia grátis.** Todo o modelo econômico cobrava 0,56
   ouro por ponto de mana. Com o atalho de mana em "off", a party lança só com
   regeneração — custo zero. O veredito "NÃO se paga" era falso nesse regime.
   O helper 1.7.0 detecta o regime pelo texto do slot `scene-slot-mana-0` e
   passa a ordenar por **dano/mana** (a mana é o orçamento, não o ouro).
   Sessões em regeneração ficam **fora** da calibração da curva (o custo
   medido ali é só poção de vida).
2. **Auto Selling estava ligado com zero itens marcados.** O ciclo de 10 min
   rodava e vendia nada; o loot ia todo para a mochila. Marcar é por hunt.
3. **Dwarven Mines tem o pior loot da faixa** (1,2/abate). Goblins tem o mesmo
   HP (40) com 3,7/abate e o melhor EXP/HP até o nível 18.
4. **Small Health Potion cura 3–5 HP** (custa 0). Inútil no Cavaleiro de 339.
   Wound Cleansing (40 mana, 36–70) em ≤70% dispara antes dela e sai da
   regeneração.
5. **Lure: a linha desabilitada do modal é a ATIVA.** Clicar "no único
   habilitado" trocou para o tier 1 sem querer. Trocar de hunt reseta o lure.
6. **Trocar de hunt não passa por "fora da caçada"** de forma visível: o botão
   de encerrar some por ~500 ms. O sinal confiável é o contador de abates
   voltar a zero.

### Configuração aplicada

- Hunt: **Goblins Femor Hills** (id 125), lure Nível 2 (4 criaturas)
- Modelo **Econômica** nos 4 (7 s pelo botão APLICAR NOS 4):
  Cavaleiro LFS ≥1 · Paladino Lesser Ethereal Spear ≥1 + Arrow ·
  Feiticeiro Apprentice's Strike ≥1 · Druida Mud Attack ≥2 (terra, goblin
  toma 110%) + Apprentice's Strike ≥1
- Defesa do Cavaleiro: Wound Cleansing ≤70% (poção ≤60% fica de reserva)
- Auto-sell: leather armor, small axe, goblin ear (elvish bow guardado — vende
  por 2.000, e é arma de Paladino)
- Filtro de loot: **ignorar** leather armor (60 oz por 12 ouro) e small axe —
  sem isso a mochila enche em ~20 min fora das 6 h/dia de auto-sell grátis

### Âncoras novas mapeadas

| Âncora | Para quê |
|---|---|
| `window-loot` / `window-close-loot` / `loot-config-lootfilter` / `loot-config-autosell` | janela de loot e suas abas |
| `loot-cell-<item>` (classe `--ignorado`) · `auto-sell-cell-<item>` (✓ no texto = vende) | células |
| `loot-filter-all` · `loot-reset` · `auto-sell-all` · `loot-autosell-countdown` | ações |
| `slot-config-threshold-range` · `slot-config-threshold-preset-30/50/70/85` · `slot-config-trig-value` | gatilho de vida (cura/poção) |
| `scene-slot-hpPot-0` · `scene-slot-mana-0` · `scene-slot-heal-1..4` · `scene-slot-support-0..1` · `scene-slot-ammo-0` | os outros slots |
| `analyzer-session` · `hud-analyzer` | janela "Estatísticas da caça" (o contador de abates só existe com ela aberta) |
| `invasao-modal` · `eventos-fab` | **Invasão** — raid diária às 14:00, 3 janelas, raid tokens (o botão "Encerrada por hoje" é isso, não limite de caça) |
| `actionbar-hunt` · `actionbar-selling` · `actionbar-depot` · `actionbar-train` | só na cidade |
| `depot-cell-<item>` · `depot-keys-cell-<chave>` · `depot-guardar-tudo` · `depot-busca` | depot |
| `sell-panel` · `sell-confirm` · `sell-cancel` · `sell-total` · `item-cell-<item>` | venda no NPC |

Os cards da tela de caçadas dizem "Trocar de caçada" dentro da hunt e
"Jogar aqui" na cidade — o `hunt-confirm` é o mesmo.

### Itens selados

Drop de equipamento vem **SELADO**: raridade e potência só são sorteadas na
purificação (NPC Uzgot, na cidade). Até lá não equipa, não vai ao mercado nem
ao correio — mas vende no NPC (axe 7). O depot tem 11 jagged swords, 10 de
cada training weapon, 3 Dwarf Guard Elite Key, 1 Centopeia Key, 1 Goblin
Assassin Key (as chaves vão para o depot sozinhas).

### Helper 1.7.0 — verificado botão a botão

Estado: Rebaixar catálogos ✓ · Aprender dano real (os 4) ✓ (~3 s/vocação) ·
Confirmar hunt ✓. Magia: 4 modelos ✓ · seleção de hunt ✓ · APLICAR NOS 4 ✓
(ida e volta sem resíduo). Analisador: sessão ao vivo ✓ · histórico ✓ ·
Copiar dados (clipboard pode falhar sem foco → caixa de texto) ✓ · Limpar
histórico (código trivial, não exercitado). Log ✓ (57 linhas). Gancho
`window.__tbHelper` para simular antes de aplicar.

Mudanças: dano guardado por vocação com o nível dentro (sem semente do nível
50); reaprende os 4 sozinho quando o nível muda; troca de hunt detectada pelo
reset de abates; janela de estatísticas reaberta sozinha; modo regeneração.

### v1.7.1 — trocar de mapa troca a magia sozinho (testado 19/09)

Ao detectar hunt nova (contador de abates zerou → card `--aqui` confirmado),
o helper sobe o lure ao máximo (`lureNoMaximo`: a linha desabilitada do modal
é a ativa; clica no maior "Nível N" habilitado) e roda APLICAR NOS 4 com o
modelo salvo. Só na troca, nunca no boot. Duas chaves na aba Magia desligam
(`auto_aplicar`, `auto_lure`, ambas ligadas por padrão).

Medido: Goblins → Dwarven Mines, **13 s** da confirmação da troca até
"terminado" — Feiticeiro Apprentice's Strike → Scorch, Druida Mud Attack →
Chill Out com slot 2 esvaziado, lure Nível 2, nenhum modal pendurado.

### Pendente (decisões do jogador)

- **Coins (210):** wildcards (5 por 50) para prey EXP/LOOT, ou Auto Selling
  18h/dia (190). Com o filtro de loot, as 6 h grátis bastam para o peso.
- **Equipamento:** Cavaleiro sem elmo/pernas/botas, Paladino de leather armor.
  Leather set custa ~22 por personagem no NPC; studded ~200 para o tanque.
  Equipar é manual (dois cliques) — automação não consegue (§7u).
- **Nível 20:** Desert Quest (loot 23,1 — Fire Devil 200 HP imune a fogo,
  gelo −20%) ou Tarpit Tomb (12,8, esqueleto imune a morte). Gelo é o
  elemento certo em Desert Quest; o helper veta fogo sozinho.

---

## 12. ⭐⭐ SESSÃO DE 22/09 — nível 39, tune-up ao vivo e helper 1.8.0

> Estado: **nível 39** (3% → 40 em ~3 h), ouro 133k, 165 coins, 6 wildcards,
> caçando **Tortoise Meriana** (id 110, lure 4 "Difícil"). Tudo abaixo foi
> lido com o jogo aberto às 21:30–22:10.

### O que o jogo mediu (13 min, 244 abates)

| | valor |
|---|---|
| EXP/h | 21,7k (raw 20,4k) |
| Loot/h | 6,3k = **5,8 ouro/abate** |
| Gastos/h | −4,3k (100% runas do Druida) |
| Lucro/h | +2,0k |
| Dano | Druida 45% (27/s) · Feiticeiro 34% (21/s) · Cavaleiro 15% (9/s) · Paladino 6% (4/s) |
| Kills/h | ~1.090 · 205 de dano por abate (HP médio 189) |

### ⚠ O catálogo de loot superestima 4×

`/hunt/lootTable` prevê **23,6/abate** em Tortoise; o jogo mediu **5,8**. O
thorn aparece com chance 15.980/100.000 (16%) e caiu em **1,3%** dos abates.
Provavelmente o `dropNerf` (§8). ⇒ Ranking de hunts por catálogo é só
ordinal; o número absoluto **só vale medido** no analisador do jogo. Mad Mage
Room (41,5 previsto) fica como teste pendente de 15 min.

### Runas custam ouro por carga — e são o gasto inteiro

Runa (great fireball, thunderstorm, avalanche, stone shower) custa **32 por
4 cargas = 8 ouro/lançamento**, cooldown 2 s, 3×3. O Druida gastou 120
cargas em 13 min (960 ouro) e fez 23k de dano: **24 dano/ouro**. Sem runas o
lucro sobe para ~+5k/h e a EXP cai ~20%. Decisão: **manter as runas** — a
prioridade é EXP e há 133k em caixa.

### Prey — só vale dentro da "caçada da conta"

- Os buffs (um por vocação) só se aplicam **na hunt sorteada**; o relógio de
  2 h corre em qualquer hunt. Sem hunt selecionada, **nenhum buff vale**.
- `TROCAR CAÇADA` (aleatória) é grátis 1×/dia; `ESCOLHER CAÇADA` custa **5
  wildcards**; travas custam 1 wildcard por renovação. Tudo dura 2 h de caça.
- `SORTEAR BÔNUS` grátis 1×/dia por personagem; **tier nunca desce**.
- 22/09: rolado grátis Cavaleiro (DEF → **LOOT +10%**) e Feiticeiro (DEF →
  **DANO +40%**). Paladino EXP +9% e Druida LOOT +10% não rolados (rolar
  zera para tipo aleatório). Wildcards guardados para `ESCOLHER CAÇADA` no
  nível 40.

### Loja — o que rende EXP por coin

| item | coins | efeito | EXP por coin (a 22k/h) |
|---|---|---|---|
| **Premium 30 d** | 290 | +10% EXP + mercado + correio | **~5.000** (24 h/dia) |
| XP Boost | 45 | +50% por 1h30, 4/dia | ~370 |
| Wildcard | 10 | 1 renovação de prey | ~40 (buff EXP +9%) |

Bônus **somam** (premium +10 + boost +50 + prey +10 = +70%), wiki
`/wiki/experiencia-e-nivel`. Não há bônus de party. ⇒ **Guardar coins para o
premium** (faltam 125). Boost só com sobra.

### Bestiário da conta (permanente, 4 personagens)

+4 HP · +18 MP · **+3 HP/s · +6 MP/s**. Fechadas: Wolves Den, Goblins,
Chakoyas (e mais 2). Dwarven Mines 3.284/4.000 para o marco III. O +6 MP/s
explica os magos em 98–100% de mana o tempo todo: **regeneração é o
orçamento e ela sobra** — magia cara não é problema, magia fraca é.

### Correções aplicadas no jogo

- **Auto Selling estava com 0 itens marcados** (de novo). Marcado tudo: 11
  itens, 949 ouro na fila. **Causa achada: o F5 zera a marcação** (o ciclo de
  venda não zera — testado: vendeu, o timer voltou a 10 min e os 11 ✓ ficaram).
  Depois de todo reload, remarcar (botão "Auto-sell: marcar tudo" no helper 1.8.0).
- **Cavaleiro**: Berserk ≥4 / Groundshaker ≥2 nos slots 1–2 deixavam a mana
  em 28%. Agora LFS ≥1 · Berserk ≥3 · Whirlwind ≥1 · Brutal ≥1.
- **Paladino sem arma** (`equip-slot-weapon` vazio; só bow/crossbow
  equipam). Ethereal Spear sai normalmente (cooldown cicla, mana oscila
  92→100%); o dano baixo é tartaruga resistindo físico. **Elvish bow está no
  depot** — equipar é manual (§7u) e exige ir à cidade.

### Elementos em Tortoise (convenção confirmada)

`percent` positivo = resistência, negativo = fraqueza (wiki "como o dano é
calculado"). Tortoise: físico +20/+30, terra +20, gelo +20, **fogo −10**.
Fogo é o elemento certo; o Fire Wave do Feiticeiro (72% do dano dele) e a
great fireball do Druida estão corretos.

### Nível 40 — próximo passo

**Black Knight Quest** (id 217): 22,5 EXP por 155 HP = **0,145 EXP/HP**, o
melhor da faixa (Tortoise 0,101). Bonelord toma fogo −10 (fraqueza), terra
imune, gelo +20. Build de fogo continua. Ao trocar: lure no máximo (reseta),
`ESCOLHER CAÇADA` na prey (5 wildcards), remedir loot no analisador.
Alternativa para ouro: Mutated Humans (40,2 previsto, HP 250).

### Helper 1.8.0 (22/09)

- **Nada automático nos slots**: removida a aplicação automática de magias e
  o lure automático na troca de hunt, e o reaprendizado de dano por nível
  (abria 30 s de diálogos). Só botões.
- **Dano escalado pelo nível**: toda fórmula soma nível÷5; a medição de um
  nível vale nos próximos somando (Δnível)/5. Verificado com Energy Strike
  (22–31 no 39 ⇔ ML ≈ 4,4). Vira "velha" só depois de 20 níveis.
- **Regime de mana por vocação**: `manaPotionLigada(voc)` guarda a leitura de
  cada personagem (`mana_pot`). Bug real: Druida com Mana Potion ≤50% e o
  helper dizia "regeneração" para todos. "Slot vazio" agora conta como
  regeneração.
- Painel mostra "poção de mana: Cav off · Pal off · Fei off · Dru ligada".
- **Runa custa por CARGA**: `precoRuna` divide o preço do catálogo (32) por
  `charges` (4) = 8/uso, como o painel do grupo mostra. Antes cobrava 32.
- **Runa tem semente de dano** (36–60 por alvo, 4 runas 3×3): o diálogo não
  mostra dano de runa, então nenhuma entrava em plano. Agora o Equilibrado do
  Druida reproduz exatamente a build de runas que estava no jogo.
- **Mana sobrando** (`MANA_SOBRANDO = 80`): em regeneração, se a barra do
  personagem está ≥ 80%, o Equilibrado ordena por DPS e não por eficiência.
  Feiticeiro passa de "Scorch ≥4 / Apprentice / Buzz / Fire Wave" para
  "Energy Beam ≥4 / Fire Wave ≥2 / Great Energy Beam / Flame Strike" — a
  build que já rendia 20,6/s com a mana em 98%.
- Os 4 modelos conferidos em 22/09 dão planos distintos e coerentes
  (Econômica 2 slots baratos · Equilibrado DPS dentro do orçamento · Área
  runas/ondas com gatilho alto · Boss só alvo único ≥1).

### Pendências

- [ ] Equipar elvish bow no Paladino (manual, na cidade) e comprar set de
      equipamento (Cavaleiro sem elmo/pernas/botas).
- [ ] Testar Mad Mage Room 15 min para medir o loot real.
- [ ] Nível 40 → Black Knight Quest + prey na hunt.
- [ ] Scripts Python ainda leem os catálogos v005/pré-wipe.

### 23/09 — nível 45, Orc Fortress, e os modelos redefinidos (helper 1.8.1)

Estado lido às 22:05: **nível 45** (69%), Orc Fortress, 34,8k EXP/h e
**−5,7k ouro/h**. O que estava aplicado: Feiticeiro e Druida com 3 runas
(stone shower ≥4, avalanche ≥2, **thunderstorm** ≥1 — orc resiste energia
15–50%), Cavaleiro com Groundshaker ≥1 e Berserk ≥2 e **6% de mana**. Os
modelos antigos geravam isso; o dono redefiniu os quatro:

| modelo | regra (v1.8.1) |
|---|---|
| Econômica | 2 magias, sem runa: as 2 de melhor dano/mana |
| Equilibrado | 2 magias (a mais eficiente + a mais forte) + a runa mais forte |
| Em área | 2 magias de área mais fortes + 2 runas de área mais fortes |
| Boss | escolhe o boss (lista de `/bosses/select`, 78) e põe só as 3 magias que mais dão dano nele, tudo ≥1 |

"Mais forte" = dano efetivo no elemento × alvos por lançamento. O mais forte
vai no slot 1 (a rotação 1→4 dispara o primeiro pronto). Gatilho: área ≥2,
alvo único ≥1; se nada ficou ≥1, o último cai para ≥1. Contagem exata de
slots, sem fecho extra. Vocação sem runa (Cavaleiro) fica só com as magias.

`/bosses/select` devolve `{bosses:[…]}`, não a lista — normalizado. O boss
vira uma hunt de 1 monstro com lure 1; o seletor aparece na aba Magia quando
o modelo Boss está escolhido, com as resistências do boss em texto.

Planos em Orc Fortress (orc: terra −10 fraqueza, energia resiste, Orc Leader
imune a fogo): Equilibrado Feiticeiro = stone shower ≥2 · Great Energy Beam
≥2 · Energy Beam ≥1; Druida = stone shower ≥2 · Ice Wave ≥2 · Chill Out ≥1;
Cavaleiro = Berserk ≥2 · LFS ≥1. Em área Feiticeiro = stone shower · avalanche
· Great Energy Beam · Energy Beam ≥1.

⚠ O jogador roda o helper no **Chrome dele**; o navegador do Playwright é
outro perfil. O log do helper que eu leio aqui não é o dele — só os slots
(estado do servidor) são compartilhados.

### Teste dos modelos em 3 mapas (23/09, nível 45)

Aplicado pelo botão APLICAR NOS 4 e conferido slot a slot nos 4 personagens:

| mapa | Econômica | Equilibrado | Em área |
|---|---|---|---|
| Orc Fortress | OK (9 s) | OK (9 s) | OK (10 s) |
| Black Knight Quest | OK (10 s) | OK (9 s) | OK (10 s) |
| Barbarian Camp | divergiu (prévia ≠ aplicado) → corrigido | OK (9 s) | OK (10 s) |

O elemento muda com o mapa sozinho: stone shower/terra em Orc Fortress,
great fireball/fogo em Black Knight (Bonelord), stone shower + great fireball
em Barbarian Camp (gelo resiste 50%).

Divergência de Barbarian Camp: o ranking de eficiência usava danoPorOuroReal
quando existia e danoPorOuro quando não — e danoPorOuroReal só existe depois
que o loot da hunt baixa (1 s depois da troca). Agora só danoPorOuro.

Cyclops Mistrock e Mutated Humans não aparecem na tela de caçadas: ficam
em ilha ainda não desbloqueada (só 43 cards, 15 travados por nível).

Lure: o botão lure-toggle fica disabled o tempo todo em Black Knight Quest
(status "Lurando Monstros" cicla a cada ~12 s). O helper agora espera até
40 s pelo botão e avisa em vez de dizer "modal não abriu". Pendente entender
quando o jogo libera o lure nessa hunt.

Estado deixado: Black Knight Quest, Equilibrado nos 4, auto-sell marcado (21).

### Helper 1.8.2 — uma gaveta por conta (23/09)

Pergunta do dono: "quando abro em outro navegador com o script, ele não vai
com outra conta?" O script roda em qualquer login; o que era compartilhado
era o localStorage do NAVEGADOR (hunt, dano medido, modelo, poção, log). Duas
contas no mesmo navegador dividiam tudo; em navegadores diferentes cada um
começa do zero (esperado: precisa clicar Aprender dano real e confirmar hunt).

Agora o boot lê /auth/me (accountId, name, worldId). A primeira conta que
usou o helper fica dona do prefixo tb_helper_ (chave tb_helper_dono); qualquer
outra conta usa tb_helper_<accountId>_. Testado simulando outra dona: a conta
foi para a gaveta nova vazia, rebaixou catálogos, confirmou a hunt, log
próprio; a gaveta da dona ficou intacta. O log de boot mostra a conta.


## 13. ⭐ SESSÃO DE 27/09 — nível 61, Mintwallin, helper 1.8.2 conferido

### Estado lido às 20:35 (conta do dono, mundo alfa)

| item | valor |
|---|---|
| Nível | **61** (85%, ~45 min para o 62) — era 45 em 23/09 |
| Hunt | **Mintwallin** (id 99, nível 30, lure 6, bestiary maxMana) |
| Sessão do jogo | 4h16 · 8.184 abates (≈1.910/h) · **35,1k EXP/h** · raw 32,6k · **+9,8k ouro/h** |
| Ouro / coins / wildcards | 152k · 150 · 3 cartas |
| Poção de mana | slot **vazio** nos 4 → regime de regeneração (magia grátis, só runa e poção de vida custam) |
| Mana no momento | Cav 60% · Pal 23% · **Fei 16% · Dru 5%** |
| Prey | travado em **Killers Caiman Caverns (nível 80)** — não é a hunt atual; buffs EXP +10% do Pal e do Dru com 0h00 |

Slots aplicados (estado do servidor, lidos pelas âncoras `scene-slot-attack-N`):

| voc | slot 1 | slot 2 | slot 3 |
|---|---|---|---|
| Cavaleiro | Berserk ≥2 | Lesser Front Sweep ≥1 | — |
| Paladino | Divine Caldera ≥2 | great fireball rune ≥3 | Lesser Ethereal Spear ≥1 |
| Feiticeiro | **Hell's Core ≥2** | great fireball rune ≥3 | Scorch ≥1 |
| Druida | Strong Ice Wave ≥2 | great fireball rune ≥3 | Chill Out ≥1 |

### O perfil do Playwright rodava a 1.7.1

O Tampermonkey do navegador do Playwright já tinha a 1.8.2 (atualiza sozinho
do arquivo), mas a aba do jogo estava aberta desde antes e rodava a **1.7.1**
com "aplicar sozinho ao trocar de hunt" e "lure no máximo" ligados. No boot ela
abriu os diálogos e mediu o dano dos 4 no nível 61 (só leitura; não aplicou
nada — o log confirma). Desliguei as duas caixas e dei F5: 1.8.2 no ar. O
efeito colateral foi útil: a tabela de dano do nível 61 ficou medida.

### Dano medido no nível 61 (diálogo EFEITO, min-max)

| voc | magia | dano | mana | cd | casas |
|---|---|---|---|---|---|
| Cav | Berserk | 42-99 | 115 | 4 s | 8 |
| Cav | Lesser Front Sweep | 35-58 | 6 | 6 s | 3 |
| Cav | Groundshaker | 48-88 | 160 | — | 36 |
| Pal | Divine Caldera | 40-54 | 160 | 4 s | 36 |
| Pal | Divine Missile / Ethereal Spear | 35-51 / 29-64 | 20 / 25 | 2 s | 1 |
| Fei | Fire Wave / Scorch | 24-38 / 14-17 | 25 / 8 | 4 s | 12 |
| Fei | Energy Beam / Great Energy Beam | 35-52 / 40-61 | 40 / 110 | 4 / 6 s | 5 / 8 |
| Fei | Energy Wave / Great Fire Wave | 43-75 / 47-71 | 170 / 120 | 8 s | 11 / 17 |
| Fei | Lightning | 39-57 | 60 | — | 1 |
| Fei | **Hell's Core** / **Rage of the Skies** | 82-110 / 61-110 | **1100 / 600** | **40 s** | 60 / 84 |
| Dru | Ice Wave / Chill Out | 21-38 / 14-17 | 25 / 8 | 4 s | 12 |
| Dru | **Strong Ice Wave** | 63-113 | 170 | 8 s | 10 |
| Dru | Terra Wave | 36-61 | 170 | 4 s | 11 |
| Dru | Eternal Winter / Wrath of Nature | 54-96 / 47-82 | 1050 / 700 | 40 s | 60 / 84 |
| Fei/Dru | Strikes (Energy/Flame/Ice/Terra/Death) | 30-40 | 20 | 2 s | 1 |
| Fei/Dru | Apprentice's Strike / Buzz / Mud Attack | 18-22 | 6 | 2 s | 1 |

Runas 3×3 (avalanche, great fireball, stone shower, thunderstorm): 8 ouro por
lançamento, cd 2 s, semente 36-60 escalada pelo nível.

### O modelo da 7q bate no nível 61

`abates/h = min(340 × lure, 0,707 × DPS × 3600 / HP)`, com DPS = soma do slot 1
dos 4 no plano Econômica (214). Mintwallin: teto de lure 2.040/h × 17,0 exp =
**34,7k previsto contra 35,1k medido** (1,1% de erro). A hunt é **limitada por
lure**: mais dano não rende nada ali.

Ranking das candidatas até o nível 61 (plano Econômica; custo/lucro por abate
do helper com poção LIGADA, que não é o regime atual):

| hunt | lv | HP | exp/ab | lure | loot | DPS | ab/h | EXP/h | limite |
|---|---|---|---|---|---|---|---|---|---|
| Vampire hell | 50 | 577 | 33,3 | 6 | 40,6 | 271 | 1.195 | **39,8k** | dano |
| **Mintwallin** (atual) | 30 | 237 | 17,0 | 6 | 16,1 | 214 | 2.040 | **34,7k** | lure |
| Djinns Marid | 50 | 430 | 21,0 | 7 | 19,1 | 273 | 1.617 | 34,0k | dano |
| Black Knight Quest | 40 | 155 | 22,5 | 4? | 26,5 | 151 | 1.360 | 30,6k | lure |
| Cyclops Mistrock | 45 | 390 | 23,0 | 5 | 26,7 | 181 | 1.184 | 27,2k | dano |
| Dragon Lair | 60 | 1.282 | 38,0 | 8 | 78,9 | 360 | 716 | 27,2k | dano |
| Return of the Beholder | 60 | 975 | 29,0 | 8 | 90,1 | 348 | 907 | 26,3k | dano |
| Ice Witch Tower | 60 | 1.450 | 51,0 | 8 | 15 | 274 | 481 | 24,6k | dano |
| Quara Yalahar | 60 | 783 | 38,0 | 6 | 74 | 196 | 637 | 24,2k | dano |
| Cults Goroma | 50 | 1.108 | 48,8 | 5 | 124,3 | 185 | 425 | 20,8k | dano |
| Banshee Quest | 60 | 1.200 | 50,0 | 5 | 62,8 | 194 | 411 | 20,6k | dano |

Leitura: **nenhuma hunt de nível 60 supera Mintwallin em EXP/h com o DPS de
hoje** — todas são limitadas por dano (HP 780-1.450). Vampire hell (+15%) é a
única acima, e com HP 2,4× maior (custo por abate sobe pela curva da 8c; a
+9,8k/h de Mintwallin é dinheiro certo). Djinns Marid só passa Mintwallin no
Equilibrado (50k) porque põe avalanche nos 3 magos — 8 ouro por lançamento a
cada 2 s. Não foi medido; é projeção.

Nível 70 libera Bog Raiders Yalahar, Hellspawns Yalahar e Yalahar Worker
Golem (ids 151, 111, 161).

### ⚠ Achado: os "ultimates" de 40 s entram como "mais forte"

O Equilibrado define "mais forte" = dano × alvos **por lançamento** (regra do
dono, 23/09). No nível 55-60 apareceram Hell's Core (1.100 mana), Rage of the
Skies (600), Wrath of Nature (700) e Eternal Winter (1.050), todos com
**cooldown de 40 s**. Por lançamento eles ganham de tudo (84 × 6 = 504), então
vão para o **slot 1** — e é o que está aplicado no Feiticeiro agora.

O custo em mana é o problema no regime de regeneração (a mana É o orçamento):

| magia | dano por lançamento (Mintwallin, 6 alvos) | mana | dano/mana |
|---|---|---|---|
| Hell's Core | 504 | 1.100 | **0,46** |
| Great Fire Wave | ~280 | 120 | 2,3 |
| Fire Wave | 162 | 25 | **6,5** |
| Strong Ice Wave (Dru) | 582 | 170 | 3,4 |
| Ice Wave (Dru) | 192 | 25 | 7,7 |

Hell's Core gasta 14× mais mana por ponto de dano que a Fire Wave. Um
lançamento a cada 40 s (o cd) drena 1.100 de mana que sustentariam 44 Fire
Waves — e o Feiticeiro está em 16% de mana, o Druida em 5%. Em Mintwallin
(limitada por lure) isso não custa EXP, mas custa mana que seria cura, e numa
hunt limitada por dano custa DPS. Decisão pendente do dono (ver pendências).

### Catálogo vivo salvo

`data/lib-live-2026-09-27.json` (1,1 MB): 70 hunts, 70 loot tables, 235
magias, 81 bosses, poções, munição, 875 preços de compra, `/hunts` (metadados,
`unlockLevels`). Os scripts Python continuam apontando para os v005; este é o
arquivo a usar daqui em diante.

### Pendências desta sessão

- [ ] **Decisão do dono**: nos modelos, tratar magia de cd ≥ 20 s como
      "ultimate" e (a) excluir, (b) ranquear "mais forte" por DPS (dano × alvos
      ÷ cd) ou (c) manter como está. Hoje ela vai para o slot 1.
- [ ] Prey aponta para Killers Caiman (nível 80); apontar para a hunt real
      custa 5 wildcards e há 3. Sortear bônus é grátis 1×/dia (Pal e Dru
      estão com 0h00).
- [ ] Medir Vampire hell 15 min (única candidata acima de Mintwallin no
      modelo; HP 577, fogo −10%, físico +25%, terra/morte imunes).
- [ ] Apontar `analyze_hunts.py` / `analyze_build.py` para `lib-live-*.json`.
- [ ] No navegador do Playwright, `viabilidadeParty` disse `regen: false` com
      os 4 slots de mana vazios: o cache `mana_pot` só enche quando a aba de
      cada personagem é visitada. No Chrome do dono isso acontece naturalmente;
      no boot frio o veredito sai como "poção ligada".


### Helper 1.9.x — Auto Hunt e Status (27/09, teste ao vivo)

Pedido do dono com os prints do Stonegy: abas **Status** (LEVEL · OURO · CAP
LIVRE · TAXA XP · hunt · Venda rápida · Finalizar hunt) e **Auto Hunt**
(chave, Memorizar/Esquecer hunt, limite por % ou oz livre, Voltar após
venda). Ciclo: finalizar → purificar todos → vender NPC → depot → voltar.
Decisões dele: vende tudo que o painel marcar; lure não é restaurado;
"Purificar todos" é grátis. Desenho em `docs/plans/2026-09-27-auto-hunt-design.md`.

⚠ O Tampermonkey do perfil do Playwright só relê o arquivo quando o
`@version` sobe (1.9.0 → 1.9.1 → 1.9.2 → 1.9.3 hoje). Editar sem subir a
versão = F5 carrega o código velho.

Âncoras novas, mapeadas na cidade em 27/09:

| Âncora | Para quê |
|---|---|
| `actionbar-hunt` (JOGAR) · `actionbar-train` · `actionbar-selling` · `actionbar-depot` | barra da **cidade**; `actionbar-explore` (CAÇADAS) só existe dentro da caçada |
| `backpack-slot-<nome>` > `item-cell-<nome>` > `item-selado-<nome>` (span `.s-item-cell-selado`) | item selado na mochila |
| botão direito → `item-ctx` (`.s-ctx-menu`): `ctx-linkar-chat` · `ctx-purificar` · `ctx-purificar-todos` · `ctx-protect` · `ctx-discard` | menu do item — **só abre na cidade**; dentro da caçada nada acontece |
| `sell-panel` · `sell-list` · `sell-row-<item>` · `sell-check-<item>` · `sell-total` · `sell-confirm` ("VENDER N ouro") · `sell-cancel` · `panel-close` | venda no NPC; tudo nasce marcado, clicar no item tira; item **protegido** (cadeado, `ctx-protect`) nunca entra |
| `depot-panel` (modal com `.s-modal-scrim`) · `depot-guardar-tudo` · `depot-guardar-tudo-nota` · `depot-lugares` ("113 de 300") · `depot-grid` · `depot-busca` · `depot-familia-<x>` · `panel-close` | depot; GUARDAR TUDO manda o que couber |

Resultados do teste (navegador do Playwright, 1.9.2/1.9.3):

| passo | resultado |
|---|---|
| Finalizar | party já estava na cidade → "stop não está na tela", registrado sem desligar nada (correto) |
| Purificar todos | ✅ 4 selados (brass shield, 2 dragon hammer, viking helmet) purificados em 0,4 s pela âncora `ctx-purificar-todos` |
| Vender | ❌ na 1.9.2: `.click()` em `sell-confirm` não vendeu (painel aberto, ouro 158.863 igual); os 10 itens (4.567 ouro) foram parar no depot no passo seguinte. 1.9.3: clique com sequência completa de ponteiro, `confirm-ok` se aparecer, sucesso medido pelo OURO. **Ainda não confirmado** |
| Depot | ✅ mochila 497,6 → 0,0 oz, 113 de 300 lugares; fechar é `panel-close` dentro de `depot-panel` |
| Voltar | ✅ `actionbar-hunt` → `hunt-item-99` → `hunt-confirm`; 1,5 s; o amostrador reconfirmou Mintwallin |

Bug pego pelo mapeamento antes de morder: procurar "purificar todos" por
TEXTO casaria com a frase de ajuda da própria aba Auto Hunt — o clique
cairia no painel. Por isso só âncora.

Resultado final do teste (1.9.3 e 1.9.4, ciclo pelo gatilho automático):

| teste | resultado |
|---|---|
| Ciclo completo (limite forçado, chave ligada) | ✅ **23 s**: encerrou (resumo fechado) → purificar pulou → **vendeu 662 ouro (158.978 → 159.640)** → depot → de volta a Mintwallin; amostrador reconfirmou a hunt |
| Trava de 5 min entre ciclos | ✅ segundo gatilho logo em seguida não disparou (esperado) |
| Falha proposital (hunt memorizada 999999) | ✅ 27 s: encerrou → vendeu 60 → depot → "card da hunt 999999 não apareceu" → **automação DESLIGADA**, sem modal pendurado; `voltarParaHunt(99)` trouxe a party de volta |
| Purificar após o resumo | ⚠ na primeira rodada uma crossbow SELADA não foi vista logo após o resumo fechar (repintura). 1.9.4 espera até 2,5 s pelo selo e dá 0,8 s de respiro depois de encerrar. Não exercitado de novo (não havia selado) |

Estado deixado: party em Mintwallin, chave desligada, limite 20 % livre,
hunt memorizada 99. Versão para o dono aplicar: **1.9.4**.

**1.9.5 (27/09, opção 2 do dono):** Venda rápida passou a funcionar de dentro
da caçada: encerra → purifica → vende → depot e **fica na cidade** (voltar só
no ciclo automático). Testado pelo próprio botão: 23 s, 207 ouro
(160.188 → 160.395), party na cidade, sem modal; `voltarParaHunt(99)` trouxe
de volta. Finalizar hunt continua só encerrando. Versão para o dono: **1.9.5**.

**1.9.6–1.9.8 (27/09, noite):** limite de % livre aceita até 99 (o dono queria
97 para testar). Ao ligar a chave com 97 % o gatilho não disparou por causa da
**trava de 5 min** (a Venda rápida de instantes antes contou como ciclo); a
aba Auto Hunt passou a mostrar o motivo ("não dispara agora: trava… libera em
N s" / "vigiando"). Depois, o Log provou que o gatilho disparou sozinho às
21:29:07 (94 % livre) e **a página recarregou 4 s depois**, deixando a party
na cidade com a chave ligada.

Descoberta importante: a aba do dono e a aba do Playwright rodavam **no mesmo
perfil** (mesmo localStorage: a configuração que ele muda aparece na minha e
vice-versa), e as duas executavam o gatilho. A 1.9.8 tem trava entre abas
(`ciclo_lock` no localStorage, 2 min) e **retoma o ciclo no boot** quando a
chave está ligada, há hunt memorizada e a party está na cidade (purificar →
vender → depot → voltar). O ciclo 'auto' já na cidade pula o encerrar em vez
de falhar. ⚠ Recarregar o jogo pelo Playwright pode derrubar a aba do dono
(sessão única por conta): evitar enquanto ele joga.

**1.9.9–1.9.10 (27/09, fim da noite):** bloco avançado da aba Status escondido
atrás de "▸ Avançado" (pedido do dono). Testes finais com o dono ("vai"):
- Purificar dentro do ciclo ✅ — bow selada purificada logo após o resumo
  fechar (espera de 2,5 s da 1.9.4 funcionou), venda 950 ouro.
- Retomada após F5 ❌ na 1.9.8: a checagem de 6 s caía no LOBBY (todo F5 cai
  no "SEU GRUPO"). 1.9.10: com a chave ligada o helper **clica em ENTRAR NO
  JOGO sozinho**, espera cidade/caçada montar (até 60 s) e retoma. Testado:
  lobby → cidade → purificar (pulou) → vender (0) → depot → **de volta a Elfs
  Shadowthorn em 12 s**.
- Trava entre abas: não exercitada.
Estado deixado: Auto Hunt LIGADO, hunt memorizada Elfs Shadowthorn (id 32),
limite 20 % livre. Versão para o dono: **1.9.10**.


### ⭐⭐ Protocolo WebSocket mapeado de verdade (27/09, noite)

Lido de três fontes: `WS.enviados/amostras` do helper (export do Analisador),
captura de um `frame` inteiro (17 KB) e grep dos 20 chunks `_next` do cliente.

**Enviados pelo cliente (`{type, data}`):**

| type | data | uso |
|---|---|---|
| `start_hunt` | `{huntId, lure, bossId?, autoBoss?, speed?, battleConfig?, tower?, floor?, towerMode?}` | entrar na caçada. **Boss = `{huntId:1, lure:1, bossId:"<nome>"}`**. Torre = `{huntId:1, lure:1, tower:true, floor}` |
| `stop` / `request_stop` / `stop_cancel` | `{}` | encerrar (o resumo vem em `ended`) |
| `summary_closed` | `{}` | fechar o resumo |
| `set_lure` | `{tier}` | lure sem modal |
| `update_battle_config` | `x` (schema zod; `ee(config, who)`) | **trocar slots sem abrir diálogo** — schema ainda não capturado (nenhuma troca de slot desde o boot) |
| `purify_all` | `{requestId}` | purificar todos |
| `sell_loot` | `{items:[{name,count,iid?}], requestId}` | vender no NPC |
| `depot_store_all` / `depot_store` / `depot_withdraw` / `depot_get` | | depot |
| `protect_item`, `discard_item`, `auto_sell_set`, `loot_filter`, `prey_hunt_pick`, `prey_hunt_roll`, `prey_buff_roll`, `prey_lock_set`, `boss_auto_set`, `boss_deliver`, `equip`, `unequip`, `set_formation`, `store_buy`, `tower_advance`, `tower_mode`, `analyzer_reset` | | o resto |

**Recebidos:** `welcome` (conta, roster, premiumUntil), `hunt_started {huntId,
lure, autoBoss?, state}`, **`frame` a cada ~1 s** com `data.state {character,
active[monstros vivos], nextWaveMs, party[{kit[{name, mana, cooldownMs,
cdLeft}], cds, potions, equipment}], inventory[{name,count,weight,value,
protected}], cap{used,total}, balance, lureTier, keyBag}`, `data.events`
(`kill`, `wave`, `boss` fase entrou/saiu, `cast`, `update_battle_config`,
`auto_sell`, `scene_change`), `data.analyzer`, `data.bestiaryKills`; `ended
{summary:{huntId, title, reason, elapsedSec, xpPerHour, lootGold,
suppliesGold, balance, kills, drops}}`; `purify_all_result`, `sell_result
{goldCredited, gold, cap}`, `depot_state`, `meta_result {meta:{wildcards,
huntBestiary}}`, `exit_pending`, `boss_auto`, `boss_deliver_result`.

**Consequências:** a hunt pode ser reconhecida na hora por `hunt_started`
(sem abrir CAÇADAS); o boss pelo `bossId` do `start_hunt` enviado; mochila,
ouro, lure e cooldowns saem do `frame` sem ler DOM. Âncoras de boss:
`explore-boss-<nome>` / `-action` / `-auto`, `auto-boss-hud`,
`victory-boss-name`, `boss-victory-fita`, `bosses-grid`.

⚠ O `sell_loot` do ciclo de 21:3x incluiu **elvish bow** (iid) e **leather
boots** — a regra "vende tudo que o painel marcar" vende arma solta na
mochila. `protect_item` (cadeado) é a proteção do jogo.

**2.0.0 (27/09, ~22h):** estado pelo WebSocket, só leitura. `hunt_started`
/ `resume` gravam `hunt_id` na hora (a tela CAÇADAS virou reserva, só se o
socket ficar 10 s calado); `start_hunt` enviado com `bossId` marca "boss em
andamento" (aba Magia e Status mostram; modelo Boss usa sem escolher na
lista); `frame` alimenta mochila, ouro, lure e "em caçada" (DOM como
reserva se o frame tiver > 5 s). Testado com F5 dentro da caçada: o servidor
mandou a hunt na reconexão, **nenhum modal abriu**, Status mostra "Elfs
Shadowthorn id 32 · socket", cap 119,96/1.922 igual ao DOM, ouro igual.
Boss ainda não exercitado (depende de o dono entrar num boss). Nível 62.

**Boss pelo socket confirmado (27/09, 21:58 e 22:00):** o dono entrou em
Gul'Dhan e Diseased Fred; o Log mostrou "boss em andamento (socket): <nome>"
na hora e APLICAR NOS 4 no modelo Boss usou o boss sem escolher na lista.
Boss vem como `hunt_started {huntId: 800, lure: 1}` — o id 800 é o "slot"
de boss; o nome só existe no `start_hunt` enviado (`bossId`).

**2.1.0 (27/09, ~22h30) — slots pelo socket, sem janela. Lido do bundle
`_next/static/chunks/app/page-*.js`:**

- `welcome` e `resume` trazem `worldToken` (Bearer das rotas REST
  autenticadas), `profiles` (por vocação: `{active, list[4]:{name, config}}`)
  e `battleConfigs`. `config = {heals[{name,percent}], manaPotion{name?,
  percent}, skills[4], minCreatures{nome:n}, supports[2], ammo?}` — é o que
  a janela de atalhos edita.
- Ao salvar um slot o cliente manda **dois** frames: `update_battle_config`
  (só caçando; `who` = índice do personagem em `frame.state.party`) e
  `profiles_set {vocation, profiles}` (sempre, persiste). O servidor ecoa em
  `frame.events[{kind:'update_battle_config', who, config}]`. Payload real
  capturado (Druida, who 3): `{"who":3,"heals":[{"name":"Health Potion",
  "percent":60},null,null,null],"manaPotion":{"percent":0},"skills":["Strong
  Ice Wave","Eternal Winter","Energy Strike",null],"supports":[null,null],
  "minCreatures":{...}}`. O helper reproduz `ee()`/`e3()` do cliente —
  teste offline bate byte a byte com o frame capturado.
- **`GET /spell-numbers`** com `Authorization: Bearer <worldToken>` devolve
  o "Dano: X-Y" de TODAS as magias e runas de uma vez, chaveado por
  `file` (`attack/hells_core.lua`, `rune/avalanche.lua`…). Conferido: igual
  ao que a janela mostra (Berserk 42-99, Eternal Winter 54-96 no 61/62).
  Runas 3×3 reais: 27-49 (a semente de 36-60 estava 30 % otimista); sudden
  death 72-110. Sem o token responde 401.
- `set_lure {tier}`: tier é o ÍNDICE (1..lureTiers.length), não a contagem.
- Mudanças no helper: APLICAR NOS 4 vai pelo socket (sem trocar de aba,
  sem 12 janelas; poções/suportes/munição preservados); Aprender dano vira
  uma chamada REST (e roda sozinha ao subir de nível e a cada welcome —
  só leitura); lure máximo tenta `set_lure` antes da janela. Diálogos
  continuam como reserva se os perfis do socket não chegaram.

**2.1.0 testada ao vivo (27/09, 22:14):** o dono deu F5, o `welcome` trouxe
token e perfis, e três APLICAR NOS 4 (Tortoise Meriana e Orc Fortress,
Equilibrado) foram pelo socket com "✓ servidor confirmou" nos 4
personagens, ~1 s cada, sem janela. Poções (Strong Health 60 %, Wound
Cleansing 60 % no Cavaleiro), mana OFF e `ammo: arrow` do Paladino
preservados. Dano real relido de `/spell-numbers` no nível 62 (fonte
`rest`), runas incluídas — a Equilibrado passou a colocar stone shower /
great fireball rune com dano medido. Achado: dois cliques em 1 s rodaram
duas aplicações intercaladas (sem estrago, mesmo resultado) → 2.1.1 trava
o botão enquanto aplica.

**Testes de 27/09 ~22:30 (dono: "faça os testes"):**
- **Aplicar na cidade funciona.** Da cidade mandei só `profiles_set` com o
  plano Econômica do Feiticeiro (Fire Wave ≥2, Scorch ≥1); ao entrar em
  Pirates Yalahar o `hunt_started.state.party[2].kit` já veio com Fire Wave
  e Scorch. O servidor honra o perfil ativo na próxima caçada.
- **Dentro da hunt** restaurei Equilibrado no Feiticeiro pelo socket
  (`who` 2): eco do servidor em < 1,5 s e o frame seguinte com Hell's Core,
  great fireball rune, Scorch. `party[].kit` é a prova viva dos slots.
- **Defeito achado:** a tela de caçadas na cidade abre em Tibidle Island e
  só renderiza os cards da ilha selecionada (`explore-ilha-tibidle_island`,
  `-yalahar`, `-gray_island`, `-pits_of_inferno`, `-zao`; catálogo `island`
  usa o mesmo nome). `voltarParaHunt(101)` falhou com "card não apareceu"
  → o Auto Hunt não voltaria para hunt de outra ilha. 2.1.2 clica na aba
  da ilha do catálogo (ou varre todas) antes de desistir.
- **Lure pelo socket ainda sem teste:** Orc Fortress e Pirates Yalahar têm
  1 tier só (sem botão de lure). Precisa de hunt com 2+ tiers: Elfs
  Shadowthorn 3/4/5, Nargor 6/7/8, Dragon Lair 5/6/7/8.
- `hunt_id` manual (dropdown da Magia) pode divergir de `ESTADO_WS.huntId`
  — vi hunt_id 101 (escolhido) com socket 43 (Cults Goroma, última caçada).
  Não é defeito: escolha manual é para planejar.
- **Lure pelo socket confirmado (22:40, Elfs Shadowthorn):** o jogo lembra
  o lure por hunt (entrou já em 3). Mandei `set_lure {tier:1}` → frame
  `lureTier` 1 em < 1 s; `lureNoMaximo()` mandou `set_lure {tier:3}` →
  frame 3 em 252 ms, nenhuma janela. `tier` é índice, confirmado. Party
  devolvida a Pirates Yalahar (id 101, ilha yalahar, 1 tier).
- **Boss Elite pelo socket (22:33, Renegade Orc, chave do dono):** aba
  ELITE = `explore-tab-minibosses`, cards `explore-boss-<nome>` com
  `-action` (ENFRENTAR / SEM CHAVE) e `-key`; bolsa de chaves em
  `frame.state.keyBag {nome: n}`, `keyBagUsed/Max/TierId`, rail
  `rail-keys`, `keys-slot-<chave>`. Aba BOSSES (`explore-tab-bosses`) são
  os grandes, "TROCAR NO SILAS". ENFRENTAR não pede confirmação.
  `hunt_started {huntId: 800, lure: 1}` chegou 1 s depois; o helper logou
  "boss em andamento (socket): Renegade Orc" e o APLICAR (modelo Boss)
  pelo painel mandou 12 slots com eco nos 4 — kit do frame seguinte
  confirmou (Knight Berserk/Groundshaker/Whirlwind, Druida Strong Ice
  Wave/Eternal Winter/Wrath of Nature). `ended {reason:'victory',
  elapsedSec:118, xp:0, drops:{'Orc Fortress Box':1}, suppliesGold:460}`;
  `frame.events` traz `{kind:'victory'}`; DOM `victory-boss-name`.
  **O jogo devolve a party sozinho para a hunt anterior** (Orc Fortress,
  `hunt_started 34`) — e os slots ficam com o plano de Boss. Pendência de
  produto: oferecer "restaurar o plano da hunt ao sair do boss" (o helper
  foi quem trocou, então não é automação por conta própria).

**2.2.0 (27/09, ~23h) — aba SCAN (pedido do dono):** "seleciono mapas, ele
entra, põe Equilibrado, fica 5 min em cada com o maior lure e mede pra eu
saber qual vale pra upar, pra ouro ou os dois; sem modal; só eu ligo".
Analisador continua (o dono pediu para não apagar). Como funciona:
- troca de mapa pelo socket: `start_hunt {huntId, lure: lureTiers.length}`
  (o cliente faz o mesmo no JOGAR AQUI; funciona de dentro da caçada, sem
  `stop`). O resumo da caçada anterior abre e o Scan clica `summary-close`.
- plano: `aplicarEmTodos('equilibrado', hunt)` pelo socket (2.1.0).
- medição: delta do `frame.analyzer` do jogo entre a entrada (depois de
  aplicar) e o fim dos N minutos — `xp`, `killsTotal`, `lootGold`,
  `suppliesGold`, `xpRaw`. ouro/h = (loot − poção) / tempo. Formato visto
  em 27/09: `{elapsedMs, sessionElapsedMs, xp:"4254", xpPerHour, kills{},
  killsTotal, damageDealt, damageTaken, healingDone, lootGold, suppliesGold,
  drops{}, xpRaw}`.
- veredito relativo: ≥ 90 % do melhor XP → "XP"; ≥ 90 % do melhor ouro e
  positivo → "Ouro"; os dois → "Os dois"; ouro negativo → "dá prejuízo".
- estado próprio (`scan_cfg`, `scan_resultados`); Auto Hunt fica quieto
  ("Scan em andamento" em motivoNaoDispara); aborta se boss começar, se a
  party sair do mapa por fora ou se o ciclo de venda rodar. Ao terminar:
  ficar / ir pro melhor XP / ir pro melhor ouro. Botão "ir" por linha.
- ⚠ não testado ao vivo ainda (precisa de F5 do dono para carregar 2.2.0).
- **2.2.1 (23h):** primeiro Scan do dono (Orc Fortress, onde já estava)
  mostrou número da caçada antiga e depois negativo: ele clicou "zerar" na
  janela Estatísticas (`analyzer_reset {}` enviado às 22:47:27), o
  analisador zerou e o delta ficou negativo; o contador de abates zerado
  fez o helper reabrir CAÇADAS (modal). Correções: o Scan manda
  `analyzer_reset` antes de medir cada mapa (medição sempre limpa, mesmo
  no mapa atual); detecta reset no meio e recomeça a base; "aquecendo"
  nos 30 s iniciais; e o contador zerar NÃO reabre CAÇADAS quando o socket
  já sabe a hunt (só loga "analisador reiniciado").
- **2.2.2 (23h) — Scan validado ao vivo, 2 mapas × 1 min:** o primeiro
  Scan pulou o Cyclops: `start_hunt` de DENTRO de uma caçada devolve
  `error {code:'already_hunting', key:'server.hunt.jaCacando'}`. O cliente
  troca assim: `stop {}` → `exit_pending` → `ended` (abre o resumo) →
  `start_hunt {huntId, lure}`. O Scan agora faz igual e fecha o resumo
  (`summary_closed` sai ao clicar `summary-close`). `error` do servidor
  vira linha de Log. Boot: `nivelAtual()` lê `frame.state.character.level`
  quando a tela ainda não tem o rail (antes gravou "nível 1" na tabela de
  dano). Resultado da rodada (nível 62, lure 5, Equilibrado, 1 min cada):
  Cyclops Mistrock 38,1k xp/h · +6.085 ouro/h · 1.449 abates/h ("Os dois");
  Mutated Humans 33,0k xp/h · +3.241 ouro/h ("—"). Mutated deu +16k na
  rodada anterior e +3k nesta: variância de drop em 1 min, como previsto —
  5 min é o mínimo para comparar ouro. Sem modal além do resumo que ele
  mesmo fecha. Party deixada em Cyclops Mistrock.
- **Scan com lure máximo validado (23:01–23:05, 3 mapas × 1 min):**
  `start_hunt {huntId, lure: lureTiers.length}` entrou no último tier nos
  três — Djinns Marid 2/2 (7), Gargoyles Meriana 2/2 (7), Barbarian Camp
  3/3 (7) — e `frame.state.lureTier` confirmou 2, 2 e 3. Plano por mapa
  mudou (avalanche rune nos Djinns, great fireball nos Gargoyles, stone
  shower no Barbarian). Resultado (nível 62, Equilibrado): Djinns 47,2k
  xp/h · −18.062 ouro/h (poção 33,5k/h!) → "XP"; Gargoyles 28,4k xp/h ·
  +15.365 → "Ouro"; Barbarian 18,1k xp/h · +10.763 (poção 0). Djinns em
  lure 7 queima poção: 33k/h de suprimento contra 15k/h de loot — é o
  caso clássico do teto de gasto. 2.2.3: lure exibido em monstros
  ("7 (tier 3/3)") em vez do índice.
- **2.3.0/2.3.1 — Scan: ouro estável, tempo de nível, rolagem (28/09 ~02:20):**
  Dono pediu "algo melhor na tela" e aprovou ouro esperado + tempo até o
  nível. Antes de usar o catálogo, conferido ao vivo: `/hunt/lootTable`
  NÃO tem fator constante (Vampire hell mediu 25% do previsto, Gargoyles
  48%), então "esperado pelo catálogo" seria mentira. Achado que salvou:
  `frame.analyzer.drops` é `{item: contagem}` e Σ contagem × `value` da
  lootTable = `lootGold` ao centavo (Stonerefiners 625 = 625, Gargoyles
  740 = 740). Daí o **estável**: moedas + itens que o catálogo espera cair
  ≥ 3 vezes nos abates da janela (`abates × chance/100000 ≥ 3`); o resto é
  loteria, sai da conta e aparece como "sorte +X (item ×n)". A 2.3.0 usava
  "chance ≥ 1%" fixo e deixou passar uma shiny stone de 500 (1,56%) com 28
  abates — esperada 0,4; a 2.3.1 escala o limiar com a janela. O veredito
  de ouro e o "ir pro melhor ouro" usam o estável. Tempo de nível =
  (próximo − atual do `rail-level-xp-pair`) ÷ xp/h do mapa, na tabela e na
  caixa viva. Rolagem: `innerHTML` zerava o scroll a cada clique na lista;
  `_renderizar` guarda e devolve o scroll do corpo e de `#tb-scan-lista`
  quando a aba é a mesma (testado: 150→150, 80→80). Tabela da lootTable
  fica em `LOOT_TABELA[huntId]` (memória), baixada ao entrar no mapa.
  ⚠ Às 02:20 recarreguei a aba do Playwright duas vezes para o Tampermonkey
  reler e um Scan de 8 mapas × 2 min começou NESSA aba logo depois: o dono
  opera a janela do Playwright. Não recarregar sem avisar.

---

## 14. ⭐ SESSÃO DE 28/09 — aba Equip (helper 2.4.0): melhor item por vocação

Pedido do dono: "muitos itens no depósito; quero saber os melhores para cada
personagem e não descartar errado". Decisão dele: **só recomendar** — a aba
não equipa nem descarta nada.

### Fontes de dados (confirmadas ao vivo)
- `roster[i].equipment` (welcome/resume e `shell.roster` na fibra React) traz
  cada peça com `attrs` base **e `forja`** `{fonte, refino, raridade,
  atributos[{id,valor}], potenciaBase}`. Slots: head, armor, legs, boots,
  shield, weapon, necklace, ring (8 — o Paladino não tem shield: arco é 2 mãos).
  `attrs.slot` usa `feet`/`hand`; o depósito usa `boots`/`weapon`.
- `depot_get {}` → `depot_state {entries:[{itemName, count, iid?, forja?,
  slot?}], used, total}`. Só entradas com `forja`+`slot` são equipamento
  purificado (selado não tem forja lida). O cliente guarda o mesmo objeto em
  `shell.depot` (fallback quando o socket não está à mão).
- `GET /item/info?ids=1,2,3` **sem login** → `{id, name, attrs, imbuements,
  sell, buy, equipPreview?}`. Id por nome: `/assets/v167/items-by-name.json`
  (9.073 nomes). Catálogo completo salvo em `data/lib-items-2026-09-28.json`.
  Chaves de `attrs` que importam: armor, defense, extradef, attack,
  magiclevelpoints, skillsword/axe/club/dist/shield, absorbpercent<elem>,
  fromDamage/toDamage/mana (wand), slotType 'two-handed', vocation
  ("Knight;true, Elite Knight"), weaponType. `skillboost *`, `life leech`,
  `critical hit`, `elemental protection *` são **encaixes de imbuement**, não
  bônus. Anéis com duração (life ring, ring of healing, axe ring…) trazem os
  atributos reais em `equipPreview.attrs` (managain/manaticks etc.).
- Wiki: /equipamentos (sem requisito de nível; só vocação; efeitos que não
  funcionam), /forja (20 atributos, faixas por potência I–VI, raridade =
  nº de atributos), /como-o-dano-e-calculado (fórmulas do básico),
  /lure-levas-e-formacao (corpo a corpo SEMPRE no Knight; os outros só levam
  magia de área e armadura não segura magia).
- YouTube: procurado 8× — só 5 vídeos do Tibidle existem (lançamento), nenhum
  sobre atributos. Os guias de "melhor set" são do Tibia normal.

### Modelo (`PESOS_EQUIP`, bloco `@@EQUIP-PURO`)
`pontos = Σ base × peso + Σ forja × peso`, em "% de ganho" aproximado.
Raridade **não** pontua. Resumo do que conta por vocação:

| | arma | peças | colar | morto |
|---|---|---|---|---|
| Knight | attack 0,9/pt · corpo_a_corpo 2,8 · dano_fisico 1 · elem 0,6 · crítico · roubo de vida | armor 1,5 · defesa 0,5 · escudo 2 · max_hp 0,1 · resist 0,5 · protecao_magica 0,5 · regen_vida 0,5 | dano_fisico, crítico, roubo | dano_magico, capacidade, distancia |
| Paladino | distancia 3 · dano_fisico 1 · elem 0,6 (attack do arco = 0) | regen_mana 1,5 · resist 0,4 · protecao 0,4 · armor 0,2 | distancia, dano_fisico, elem | dano_magico, armor quase, escudo |
| Feiticeiro/Druida | dano_magico 1 · nivel_magico 4 (4,5 Druida) · wand: 0,8×dano médio − 3,2×mana do tiro | **regen_mana 3** · max_mana 0,02 · protecao 0,4 · resist 0,4 · cura_propria (Druida 0,5) | dano_magico, nivel_magico | dano_fisico, elem, crítico, armor quase |

Distribuição: cada peça vai para UM personagem; por slot, ótimo da **soma**
dos 4 (força bruta sobre os 6 melhores de cada vocação). O guloso por ganho
individual foi descartado: deixava o Knight ganhar +0,7 pegando o anel de
regen do Feiticeiro, que perdia 3,3. Duas mãos: candidato virtual no slot de
escudo que vale (melhor 2 mãos − arma de 1 mão escolhida). `GANHO_MIN = 0,5`.
Reserva = melhor não usada por (voc, slot); dispensável = nem melhor nem
reserva, listada com preço de venda e "superada por X".

### Resultado no estado de 28/09 (165/300 no depósito)
Trocas sugeridas: Feiticeiro wand of vortex → **wand of inferno** (+15,2, no
depósito desde sempre), blue robe → fur armor (+4, resist gelo/terra base);
Druida snakebite rod → **underworld rod** (+1,9), mammoth fur cape → fur armor
(+3,1); Knight bone shield → bonelord shield (+2), calça (+2,1); Paladino elmo,
armadura e anel (+1,7/+0,8/+1,9). 132 peças dispensáveis ≈ 22k de ouro no NPC.

### Testes e pendências
`node testes/equip.test.js` — 10 casos com `data/estado-equip-2026-09-28.json`
+ `data/lib-items-2026-09-28.json`. Fora do escopo: mochila (`frame.inventory`
e `shell.bagInstances` estavam vazios; formato não visto), botão equipar
(precisa capturar `equip`/`depot_withdraw`), unidade real do regen de mana
(a Wiki não publica; medição na cidade deu mana parada nos 4).

### 2.5.x — botão EQUIPAR (28/09, à noite)
Pedido do dono logo depois da 2.4.0: "coloca um botão para equipar se eu
quiser". Protocolo capturado arrastando na tela do jogo (`WS.enviados`):
- **Retirar do baú** = duplo clique na célula `depot-cell-<nome>` →
  `depot_withdraw {items:[{name, count, iid}], requestId}` → `depot_result
  {requestId, entries, used, total}`. Precisa de capacidade na mochila.
- **Equipar** = arrastar `backpack-slot-<nome>` para `equip-slot-<slot>`
  (slots: head, armor, legs, boots, shield, weapon, necklace, ring, ammo) →
  `equip {name, slot, vocation, iid}` → `meta_result {action:'equip',
  applied:true, notice:{key:'server.equip.equipado'}, meta:{…}}`. **A peça
  que estava no slot cai na mochila**; não existe `unequip` para trocar
  (arrastar do slot para a mochila não manda nada; duplo clique na mochila
  também não equipa). Equipar de novo o que já está equipado não responde.
- Mochila com forja: `shell.bagInstances [{iid, name, forja}]` na fibra.
- Testado ida-e-volta pelo socket (bone ↔ bonelord shield no Knight) e o
  botão inteiro no Knight (2 trocas em 7 s: withdraw → equip → guardar tudo).
- O helper: `equiparTrocas(vocs)` faz passadas (peça em outro personagem só
  depois que ele trocar), `retirarDoDepot`, `equiparPeca`, `ondeEsta(iid)`
  pela fibra; ao final `guardarNoDepot()` (DOM) se a caixa "guardar no
  depósito" estiver marcada. Só na cidade; nunca sem o botão.
- `GANHO_MIN` subiu para 1: com 0,5 ele trocava um bonelord shield por outro
  quase igual (+0,55). Lembrete: o Tampermonkey do perfil só relê o arquivo
  com `@version` novo — a 2.5.0 rodou uma cópia velha até virar 2.5.1.
- **2.5.2**: "só Feiticeiro" não pegava a fur armor do Paladino — a troca do
  Paladino (+0,8) ficava abaixo do `GANHO_MIN` e ele nunca liberava a peça.
  `slotsTrocas` agora puxa a troca de quem doa (marcada `dependencia`),
  recursivamente, mesmo com ganho pequeno.

### Logbook da comunidade (Discord "guias-da-comunidade", um jogador da comunidade, 26–27/09) — prints do dono em 28/09
Skills dele: ML 31–32, EK 39, RP 43 (acima dos nossos: ML 20–21, melee 30, distance 33).
Poção de mana 30 % em todos (Knight 40 % às vezes), Sio (Heal Friend) 65 %, Knight com **Utamo Tempo (Protector)**.
Padrão dos slots: mago = onda (≥2) + runa de área (≥2) + strike de alvo único no elemento certo (≥1);
Paladino = runa (≥2) + Exori Con (≥1); Knight = Exori (≥2) + Exori Infir Min (≥1), Groundshaker (≥2) em Quara.
**Nunca usa os ultimates** (Rage of the Skies / Wrath of Nature / Hell's Core) — é o que o nosso
Equilibrado põe no slot 1 dos magos (pendência de 27/09).

| hunt | lure | resultado dele | nota | comentário |
|---|---|---|---|---|
| Bog Raiders Yalahar (70) | 4 = 8 | 56k xp/h · **+20,8k ouro/h** (4h50, 8.215 abates) | 3,3/5 · key 5 · xp 2 · gold 3 | "mediocre para os dois, mas ótima para farmar Legs/Boots para purificar e gold bruto" |
| Hellspawns yalahar (70) | 4 = 8 | ~67k xp/h (1h05, 1.624 abates) | 3/5 · key 5 · xp 3 · gold 1 | "ruim para gold, mediocre para exp; voltaria? nem fudendo" |
| Quara's entrance Yalahar (60) | 3 = 6 | 2h, 2.976 abates | 2,6/5 · key 5 · xp 2 · gold 1 | "ruim para exp e gold; key de Yalahar sempre boa" |
| Gargoyles Meriana (50) | 2 = 7 | — | 2,6/5 · key 2 · xp 1 · **gold 5** | "ótima para gold, péssima para exp; farmar Legs/Ring/Helmet/Necklace" |

Elementos dele: Hellspawns = gelo (Frigo Hur, Avalanche, Exori Frigo); Bog Raiders e Quara = energia
(Vis Hur, Thunderstorm, Exori Vis) + Terra Wave no Druida em Quara; Gargoyles = só uma onda por mago.
Nosso `montarPlano('equilibrado')` nas mesmas hunts (28/09, nível 61): Knight idêntico (Berserk ≥2 +
Lesser Front Sweep ≥1); Druida igual (Strong Ice Wave + runa) exceto o strike (Chill Out 8 mana em vez de
Ice/Energy Strike 20 mana); **Feiticeiro diferente**: Rage of the Skies (600 mana, cd 40 s) no slot 1 em
vez de Energy Wave (170 mana, cd 8 s); em Gargoyles Hell's Core (1.100 mana) + Scorch. Paladino: nós
pomos Divine Caldera ≥2 na frente da runa; ele só runa + spear.
Wiki /configurando-o-combate: os slots de ataque são FILA DE PREFERÊNCIA (o primeiro pronto dispara;
magia de cd curto domina) → cd longo no slot 1 (já fazemos); ordem de gasto de mana = ataque → suporte →
cura (**a cura fica com o resto**); cura forte ~40 % e fraca ~70 %; poções nascem desligadas.
Protector (utamo tempo): Knight nv 55, 200 mana, cd 18 s, buff próprio — reduz 35 % do dano recebido
(wiki /como-o-dano-e-calculado). Nosso Knight tem Train Party + slot 2 vazio.

### 2.6.x — modelo INTELIGENTE (28/09, noite)
Pedido do dono: "a mais inteligente de todas, para matar o mob mais rápido —
combinações de poções, magias, runas, defesa e suporte para cada personagem;
força total no dano, poucos recursos no resto". Regras (código em
`planoExtras` + ramo `inteligente` de `montarPlano`):
- **Ataque (4 slots)**: 2 ondas/feixes mais fortes por lançamento + 1 runa de
  área + 1 golpe de alvo único (≥1, magia de 20 mana, não runa). Ultimates
  (cd > 12 s) fora. Ordem: mais forte primeiro (a fila dispara o primeiro
  pronto; só uma magia por ciclo de 2 s — wiki). Duas armadilhas achadas no
  teste: ordenar por DPS enchia os 3 slots com runas de 2 s (a do slot 1
  dispararia sempre); ordenar por cd deixava o Berserk (4 s) atrás do Lesser
  Front Sweep (6 s). O golpe ≥1 entra direto de `avaliadas`: o corte de
  "<10 % do melhor" o mataria sempre.
- **Poções**: vida ≤30 % e mana ≤30 % (Knight 40 %), a melhor do nível e da
  vocação (tabela `POCOES` de /potions: Strong Health/Mana no 50; Great no 80).
- **Cura** (`CURAS`, forte com gatilho baixo primeiro): Knight Wound Cleansing
  ≤65; Paladino Divine Healing ≤45 + Intense ≤70; Feiticeiro Ultimate Healing
  ≤45 + Intense ≤70; Druida Heal Friend ≤65 (Knight) + Ultimate ≤45 + Intense ≤70.
- **Suporte** (`SUPORTES`): Knight Protector + Train Party; Paladino Protect
  Party; Feiticeiro Magic Shield + Enchant Party; Druida Magic Shield + Heal Party.
- **Munição** (`MUNICAO` de /ammo): área vale metade dos alvos → burst arrow
  com lure ≥ 3, onyx arrow senão; bolts se a arma for crossbow.
- `aplicarPlanoSocket` manda heals/manaPotion/supports/ammo junto quando o
  resultado tem `extras`. O Scan ganhou `modelo` (Equilibrado | Inteligente) e
  grava `modelo` no resultado.

### 2.6.4 → 2.7.2 — o que a medição ao vivo e a wiki mudaram (28/09, madrugada)
As regras da 2.6.x acima foram TODAS revistas depois de medir Quara, Stonerefiners,
Dragon Lair e Djinns com o livro-razão (`RAZAO`, eventos do frame: cast/hit/
mhit/mcast/spawn/kill/wave/wave_timer). O que vale hoje:
- **Livro-razão (2.6.4)**: dano por lançamento e por mana de cada magia NESTE
  mapa, mana média e vida mínima por personagem, ritmo das ondas (matar ×
  espera), dano tomado/h. Scan grava `razao` no resultado. Aba Magia mostra
  "grupo ao vivo".
- **Dano medido manda (2.6.6/2.6.7)**: ≥3 lançamentos no mapa substituem o
  modelo; feixe conta metade dos alvos (Great Energy Beam: 364 no papel, 189
  medido).
- **Ordem = mais forte por lançamento (2.6.7/2.6.8)**: a 2.6.6 pôs Divine
  Missile (cd 2 s) no slot 1 e a Caldera nunca saiu — dono: "não funcionou de
  jeito algum". Runa no lugar do dano dela, exceto quando a mana sobra.
- **Mana medida decide o regime (2.6.9/2.7.0)**: ≥70 % → ultimates entram,
  magias antes da runa; se além disso o spawn limita (onda morre em <½ da
  espera), sem runa. Djinns: Paladino 78 %/Feiticeiro 96 % parados atrás da
  runa de 2 s → 2.7.0 igualou os 1.820 abates/h gastando 312→48 de runa/3 min.
- **Cura/suporte como o dono deixou à mão (2.6.9)**: Knight Wound Cleansing
  ≤50 + Protector; Paladino Light ≤60 + Divine ≤40 + Protect Party; Feiticeiro
  Light ≤60 + Ultimate ≤40 + Magic Shield; Druida Heal Friend ≤60 + Ultimate ≤40
  + Heal Party. Poção de vida 45/45/35/60 %. Mana potion só no Druida (30 %).
  ⚠ Aplicar sobrescreveu a DEFESA/SUPORTE manual do dono duas vezes — avisar.
- **Munição (2.7.1/2.7.2)**: wiki /como-o-dano-e-calculado — tiro do Paladino
  = nível/5 … 0,09 × atk × Distância + nível/5; golpe físico perde 0,75 ×
  (armadura + defesa) do bicho (bestiário: Dragon 25+30, Hatchling 15+10).
  Dragon Lair: burst arrow (FOGO, dragão imune) 24/tiro por 9 de ouro; flecha
  comum 15–20/tiro de graça; onyx +17/tiro por 7 = 2,4 dano/ouro contra 50 da
  runa. Regra: munição paga só se der ≥25 de dano extra por ouro — no nível 61
  nunca dá; o dano do Paladino é runa (404/cast) + Caldera (728). Burst acerta
  1,4 alvos, não 4.
- **Wiki, o que ainda não estava no helper (2.7.2)**: buffs de grupo de 120 s
  — Train Party (Knight, 60 mana, +3 CaC/Dist nos 4), Enchant Party (Feiticeiro,
  120 mana, +1 ML nos 4 ≈ +10–15 % em magia e runa), Magic Shield no Druida.
  Entram como 2º suporte só onde a mana MEDIDA ≥70 % (Djinns), porque a mana
  vai ataque → suporte → cura e em Dragon Lair (4–23 %) roubariam a cura.
  Sharpshooter (Paladino, 450 mana, bloqueia cura 10 s) fica fora.
- **Números de referência**: Quara ondas de 6 / espera 9–11 s / 1.200–1.243
  abates/h com qualquer kit (spawn limita); Djinns ondas de 7 mortas em 2,5 s
  (1.820/h); Dragon Lair ondas de 8 mortas em 5–15 s, 224–300k tomado/h, dano
  limita, Paladino morreu no "seco". Dano/mana: Lesser Front Sweep 17–22,
  Ice Wave 17, Strong Ice Wave 8, Energy Wave 5–6, Caldera 4,6, Berserk 3–5.
  Runa 50–61 dano/ouro; poção de mana ≈ 12.

### 2.7.3 → 2.8.1 — Equip na escala certa e o painel virou trilho (29/09)
- **Equip 2.7.3**: dono — "wand com +1 ML é melhor que wand mais forte, porque
  o dano das magias é em área". Estava errado na escala: 1 pt ≈ 1 % do dano;
  tiro de wand a cada ~4 s num mago de ~100 dano/s ⇒ 0,25 pt por ponto de dano
  (era 0,8); mana do tiro = 1,4 pt/mana no Feiticeiro (regeneração, Energy
  Wave 5,5 dano/mana) e 2 pt/mana no Druida (poção, Strong Ice Wave 8/mana);
  ELEMENTO da wand contra o mapa (`ctx.notas`); +1 ML = 7 pt (Fei), 7,5 (Dru),
  5 (Pal — runa + Caldera são 90 % do dano dele). Resultado ao vivo: wand of
  vortex forjada +1 ML fica (8,5) sobre wand of inferno (5 neutro, −11 em
  Dragon Lair, fogo); snakebite +1 ML fica sobre underworld rod (13 de mana
  por tiro, Druida paga poção). Teste novo em testes/equip.test.js (12 ok).
- **Painel 2.8.0/2.8.1** (dono: "menus com ícone na vertical, poupa tela"):
  trilho de 44 px na borda direita (⌂ ✦ ↻ ◎ ⛨ ▤ ≡), gaveta de 300 px ao clicar,
  máx. 62 vh, ponto de estado por ícone (verde ligado, âmbar pulsando
  trabalhando, vermelho erro no Log). Estado em `ui` (aba, aberta, top,
  oculto). Telas: botão principal no topo, explicação atrás de "?" (details
  com data-k, aberto/fechado preservado ao repintar), kit por personagem em
  fichas, Equip só as trocas por padrão ("8 slots" alterna), Scan com lista de
  mapas fechada e filtro, tabela `table-layout:fixed`. Medido: largura total
  344 px (era 430), Equip 237 px de altura (era 3.937 de rolagem). Ids dos
  handlers mantidos; lógica intocada.
- **Publicar sem o dono no PC**: bump de versão não bastou (4 recargas); o
  caminho que funciona é ponte `window.__TB_SRC` → dashboard do Tampermonkey →
  `cm.setValue` → Ctrl+S → recarregar. Ver memória.

### 2.8.2 → 2.8.4 — GitHub, aviso de versão nova e painel solto (29/09)

- **2.8.2** — repositório público `github.com/priscilaenorthon-dev/tibidle-helper`;
  o cabeçalho ganhou `@homepageURL`, `@updateURL` e `@downloadURL` apontando
  para o raw do `main`. Instalar em qualquer navegador com Tampermonkey =
  abrir o link raw uma vez e confirmar. O Tampermonkey confere o `@updateURL`
  no intervalo dele (não a cada F5).
- **2.8.3** — o helper mesmo lê o cabeçalho do raw (15 s após carregar e a
  cada 30 min); se o `@version` de lá for maior, acende ↑ no trilho e um
  botão na aba Status. Clicar abre o raw → o Tampermonkey mostra
  "Atualização de Userscript" com o diff → Sobrescrever → F5. Conferido ao
  vivo 2.8.2 → 2.8.3. ⚠ O raw fica em cache no navegador por ~5 min: logo
  depois do push o Tampermonkey ainda vê a versão velha ("Reinstalação").
- **2.8.4** — dono: "tira o programa da barra lateral, quero ele livre na
  tela". Trilho + gaveta viraram uma caixa solta (`#tb-caixa`), arrastável
  pela alça do trilho ou pelo cabeçalho da gaveta, travada dentro da tela;
  posição (`right`/`top`) guardada por conta e sobrevive ao F5.

### 2.9.0 — revisão do Inteligente e do Equip (29/09)

Revisão do código com os catálogos públicos (`/spells`, `/item/info`, `/ammo`,
`/potions`) e a wiki (`/configurando-o-combate`, `/equipamentos`, `/forja`,
`/como-o-dano-e-calculado`, `/magias-e-runas`). Cada defeito tem teste em
`testes/` (rodam em qualquer clone: `node testes/equip.test.js` e
`node testes/magia.test.js`; os casos com o estado da conta só rodam com `data/`).

**Inteligente (aba Magia)**
- **Recarga ≤ 2 s vai por último, em todos os modelos.** Wiki: o jogo "confere os
  slots de 1 a 4 e lança o primeiro que estiver pronto". Runa/strike/Divine
  Missile estão prontos em todo ciclo; na frente, travavam o resto. Na 2.8.5,
  sem mana medida, a runa de 36 casas ia para o slot 1 do Feiticeiro (dava mais
  dano por lançamento que as ondas baratas) → ondas paradas, runa a 8 ouro/2 s.
  Ordem nova: recarga longa (mais forte primeiro), depois runa ≥2, depois golpe ≥1.
- **Nunca mais de 4 slots.** Mana sobrando + lure baixo montava 5 (3 ondas +
  golpe + runa); o socket mandava 4 e a runa sumia calada. Agora a runa sai.
- **Histerese no regime de mana**: entra em "sobrando" com ≥ 70 %, sai < 40 %; a
  mana medida zera quando o kit do personagem muda (profiles_set /
  update_battle_config). Antes o kit alternava a cada medição.
- **Protector** (wiki: dano causado −35 %) só se o Knight apanha: sai se a vida
  mínima medida no mapa ficou ≥ 60 %; sem medida fica.
- **Poção de mana = a mais barata por ponto** (Mana Potion 0,56); a 2.8.5 dava
  Strong Mana (0,72) ao Druida no 50+ e a conta usava 0,56. Poções vêm de
  `/potions` (reserva embutida).
- Sem socket (aplicação pelos diálogos) o Log avisa que poção/cura/suporte/munição
  NÃO foram aplicados. Dica da tela atualizada.

**Equip**
- **Lança não é arma de ninguém** (wiki: Paladino usa arco ou besta). Uma royal
  spear +1 distância tirava o arco (0 pt) e mandava bow e crossbow para a venda.
- **Besta pontua pela munição**: bolt grátis 30 contra arrow grátis 25. Ao trocar
  arco ↔ besta, o EQUIPAR põe a munição grátis do tipo novo no perfil do Paladino.
- **Carga/tempo = temporária**: stone skin (5 cargas) saía com 160 pt para o
  Knight, might ring (20) com 90, ring of healing (7,5 min) com 18. Temporárias
  não entram nas trocas nem na venda; ficam numa lista própria.
- **Dispensável não depende do mapa**: em mapa imune a fogo a wand of inferno ia
  para a venda. Só é dispensável o que também sobra na conta neutra.
- **Pesos pela fórmula e pelas skills do momento** (`pesosDaVoc`): Knight ataque
  0,9 → ≈ skill (golpe e Berserk são simétricos); nível mágico 7 → ~3,9 no ML 20
  (7 era a conta do ML≈4); Paladino ganha Dano Mágico (runa/Caldera/Missile),
  dividido com Dano Físico pela fração medida no livro-razão (padrão metade).
  Skills vêm do frame (`distance` confirmado; `melee`/`magicLevel` pelos nomes do
  bestiário — se não baterem, cai na referência de 28/09).
- A opção "guardar" diz a verdade: o jogo só tem "guardar tudo" (loot vai junto).

---

## 15. Regras atuais do jogo (wiki oficial, 29/09) — o que mudou desde as §1–9

Fonte: `https://tibidle.com/wiki/*` e patch notes 1.0.1–1.0.12 (`tibidle.com/novidades`), lidos em 29/09.
Lançamento oficial em **18/09/2026**; o progresso do beta não passou para o lançamento.

- **Combate**: o jogo "confere os slots de ataque de 1 a 4 e lança o primeiro que estiver pronto"
  (recarga livre, mana suficiente, mínimo de criaturas vivas — conta as vivas na luta, não as da área).
  Recarga de grupo: ataque 2 s, cura 1 s, suporte 2 s; poção de vida, poção de mana e runa dividem 1 s.
  Travas secundárias (`secondaryGroup` em `/spells`): focus 40 s (ultimates), ultimatestrikes 30 s,
  special 8 s (Lightning, Strong Strikes), greatbeams 6 s — duas do mesmo grupo no kit se bloqueiam.
  Mana gasta na ordem ataque → suporte → cura; cura dispara "na ordem, o primeiro cujo gatilho foi atingido".
- **Suportes**: Protector 200 de mana, escudo ×2,2, dano recebido −15 % e **dano causado −35 %**; Blood Rage e
  Protector não convivem; buffs de grupo custam ~3× com 4 personagens (Enchant Party 120 → 350, Heal Party
  120 → 350, Protect Party 90 → 263, Train Party 60 → 175). Magic Shield: dano vai para a mana.
- **Dano**: golpe do Knight máx. `0,085 × ataque × Corpo a Corpo + nível/5` (mín. nível/5); tiro do Paladino
  máx. `0,09 × ataque da munição × Distância + nível/5`; o ataque do arco/besta é 0 (o dano vem da munição);
  wand/rod dano fixo. Defesa da criatura: bloqueio tira entre metade da defesa e a defesa, armadura entre metade
  e quase toda — só na parte física; magia ignora armadura.
- **Equipamento**: 8 slots (sem slot de munição — ela fica na barra de combate); sem requisito de nível, só
  vocação; Paladino usa arco ou besta; durabilidade por cargas (cada golpe reduzido gasta 1) ou por tempo
  (o relógio só corre na caçada). Item que cai vem **selado** (não veste, não vende); purificar é grátis.
- **Forja**: raridade = nº de atributos (comum 0 … mítico 5); ofensivos só em arma e colar (Dano Mágico "vale para
  qualquer magia de ataque, runa e wand"); defensivos em escudo/elmo/armadura/calça/bota/anel; teto por personagem.
- **Poções**: cobradas em ouro por gole, sem estoque; Mana Potion 56 por ~100 (0,56/ponto) é a mais barata por ponto.
- **Munição**: arrow 25 e **bolt 30** grátis; as pagas custam o que `/buy-prices` diz (mudou: sniper 5, burst 15,
  crystalline 20, diamond 130).
- **Auto Selling** sem limite diário; **Auto Exit** nativo; caçada com o jogo fechado até 12 h.
- **Prey (reformulada 29/09)**: 1 caçada por conta, 4 colunas (uma por vocação); EXP/LOOT +1–10 % (conta),
  DANO/DEFESA +4–40 % (só o personagem); 2 h de caçada (não corre em treino nem Elite/Boss); cada seção
  travada gasta 1 wildcard por renovação — se as wildcards zeram, todas as travas desligam.
- **Elites/Bosses**: 78 Elites sem cooldown (a chave é o limite) + 3 bosses de ilha; chave cai a 0,047–0,105 %
  por abate; a mochila de chaves T1 guarda 5 — chave que cai com ela cheia é **perdida**.
- **Bestiário**: bônus fixo e permanente para os 4, por estágios de abates por hunt; abates offline contam.
- **Premium hoje**: +10 % de EXP; loot igual para todos; nenhuma hunt exclusiva. Guilda não dá bônus. Torre "em breve".
- **Termos (15/09, seção 4)**: proíbe "bots, scripts, exploits, macros ou qualquer forma de automação não
  prevista pelo próprio jogo", com possível banimento. Decisão do dono (29/09): manter o Auto Hunt.

### 2.11.0 — auditoria completa, correções e três abas novas (29/09)

Auditoria com 6 revisores (Auto Hunt/Scan, socket, layout, Magia, código, produto) e implementação por
agentes em paralelo, cada um numa área, juntados com testes. **Testes: 161 em 9 arquivos** (`testes/*.test.js`,
rodam em qualquer clone; o CI em `.github/workflows/testes.yml` roda tudo a cada push). Roteiro de teste com a
conta logada: `docs/teste-ao-vivo-2.11.md`.

- **Auto Hunt / Scan**: lista "nunca vender" (equipamento, material de imbuement e lista do dono são
  desmarcados antes de confirmar; se não conseguir desmarcar, não vende); Scan para em morte/`ended` e devolve
  mapa, lure e presets; trava comum entre ciclo, Scan e Mercado; depot cheio desliga em vez de ciclar; F5 só
  retoma ciclo pendente recente; não encerra boss; veredito por xp sem boost, sujas e outro nível fora do
  ranking; histórico de ciclos; telas refeitas.
- **Socket e robustez**: `profiles_set` só com perfil real do servidor (antes podia apagar presets e cura);
  boss/torre (huntId 800) reconhecidos; ticket/token redigidos em tudo que se copia; grampo do WebSocket com
  `Reflect.construct` e adoção só do socket do welcome; `falhou()` central (Auto Hunt desliga após 5 falhas);
  catálogos numa gaveta comum, timeout de 10 s, cache velho quando a rede cai; render agendado; abates/xp do
  analisador do próprio jogo (não clica mais em `hud-analyzer`); reconexão limpa o estado.
- **Magia**: simulador puro da fila (`simularFila`) para o veredito do kit inteiro (poção só de quem bebe +
  runa por carga); uma magia por grupo secundário; Boss com runa e ML; "mana sobrando" só para quem não bebe;
  curas por gatilho crescente; veto de imunidade ponderado em área; slots mortos cortados; munição por `/ammo`;
  cache do plano; releitura do dano depois de EQUIPAR.
- **Painel**: não cobre barra de atalhos, mochila nem barra de ação (lugar padrão à esquerda da cena, altura
  limitada); arrasto por toque; folha inferior no celular; fonte ≥ 10,5 px, alvos ≥ 28 px, contraste 5:1;
  botões acessíveis e Esc; faixa de retorno por aba (`avisar`); contador de erros no Log.
- **Telas**: escape de todo texto externo; repinte só quando o HTML muda (fim do botão reabilitado e do foco
  perdido); Magia segmentada com selo de veredito; Equip em português; "OURO —" sem leitura.
- **Progresso (nova, só leitura)**: mochila de chaves (aviso de chave perdida), chave → Elite, bestiário com
  horas até o próximo marco (também nos cartões do Scan), plano offline, Prey, calculadoras de refino e imbuement.
- **Mercado (nova)**: lista o baú negociável com preço = menor anúncio de outro vendedor − 1 (mesmo item;
  forjado = mesma raridade e refino), sem concorrente = média de 30 dias, nunca abaixo do NPC após a taxa de 5 %;
  anunciar por 2 toques em fila (retirar → `market_create`), 1 pedido a cada 3,5 s; revisar meus anúncios e
  resgatar a caixa de entrada por botão; nada re-anuncia sozinho.
- **Diagnóstico (Status)**: relatório só de leitura com a FORMA das mensagens (sem valores) e o que falta.
- **Repositório**: dados da conta fora; scripts Python pré-wipe apagados; §15 com as regras atuais da wiki.

### 2.11.1 — primeiro teste ao vivo (29/09, noite)
Diagnóstico com a conta logada: todos os formatos novos confirmados (skills `melee/distance/magic`,
`keyBag {nome:n}`, `meta.huntBestiary`, prey, `frame.analyzer`, `inventory[].protected`, `ended.summary.reason/deaths`).
Dois ajustes: (1) o "próximo marco" do bestiário pula marcos que valem 0 no catálogo (Vampire hell só dá +1 ML
em 10k); (2) `ended.summary.title` é `{key, params}` — "Última caçada" mostrava `[object Object]`, agora usa o
nome do catálogo pelo huntId.
Painel de venda confirmado ao vivo: `sell-row-<nome>` / `sell-check-<nome>` com o nome do item (espaços
incluídos), e a caixa é `<span class="s-sellp-check">✓</span>` — marcada = tem ✓. Na 2.11.1 essa classe sem ✓
conta como desmarcada (antes caía em "não sei" e a decisão ia para o total).

### 2.11.2 — segundo teste ao vivo (29/09, noite)
- **Travamento na Magia (não reproduzido)**: o navegador do dono congelou duas vezes trocando mapa/modelo na
  aba Magia. Offline, 70 mapas × 5 modelos × 4 vocações com o dano real do nível 67 respondem em < 50 ms; ao
  vivo, com um vigia do DevTools pingando a página a cada 2 s, cliques em todos os modelos, lista de mapas
  aberta e cliques cruzados não travaram (máx. 8 ms). A detecção de hunt (1 ms), a varredura da fibra (2 ms)
  e o repinte (a gaveta não repinta sozinha) foram medidos ao vivo. Agora todo desenho > 250 ms vai para o
  Log com aba, mapa e modelo — se voltar, a linha do Log aponta o culpado.
- **Veredito medido**: com ≥ 10 min no mapa mostrado, o selo "se paga" usa o analisador do jogo (gasto e
  loot por abate reais). Banshee Quest: estimativa 143 o/abate × medido 28,6; loot do catálogo 62,8 ×
  medido 45,5. A estimativa continua embaixo, sem selo, para comparar kits. A curva de desperdício da poção
  (30/08, os quatro bebendo) superestima ×4–5 quando só o Druida bebe — recalibrar com mais medidas.
- **Mochila de chaves**: tier e limite do jogo (`keyBagTierId: "keybag_t2"`, `keyBagMax: 10`); saía
  "Key Backpack T1 · T1 guarda 5".
- **Achados sem código**: Banshee é limitada pelo spawn (Inteligente: mesmos 936 abates/h e ~52k xp/h do kit
  antigo, com +5,6k/h de suprimento); o Auto Hunt da conta volta para Dragon Lair (hunt 46), não para o mapa atual.

### 2.11.3 — Equip e Mercado conferidos ao vivo (29/09, noite)
- **Equip: troca tem custo (1 pt).** O otimizador dava o anel r4 do Feiticeiro (5,1 pt) ao Paladino (+1,4) e
  um r1 do depósito ao Feiticeiro (−1,2, sem aparecer na tela): 3 trocas por +0,2 pt. Ficar com a peça atual
  vale +1 pt (≈ 10 de vida máx.); a troca do Knight (anel do depósito, +1,4 pt) continua. Teste com os anéis
  reais em `testes/equip.test.js` — falha no solver antigo.
- **Mercado: "×0" virou "N no depósito".** Caçando, a quantidade anunciável é só a da mochila; a linha dizia
  ×0 e parecia que o item não existia. Preços lidos ao vivo: chaves valem 25–74k (The weeping matriarch key
  74.000, Quara Fishman 48.000, Rhaegal 39.999, Genio 30.000, Cerebro 25.000) e Yalahar gear wheel 114.999.

### 2.11.4 — venda do Auto Hunt e pesos de encaixe (29/09, noite)
- **Venda: cliques espaçados.** Cada caixa do painel de venda manda um `city_sell_off` com a lista inteira do
  que não vender. O ciclo desmarcou ~24 equipamentos em 5 s (48 envios) e o servidor respondeu `rate_limited`:
  nada foi vendido e o Auto Hunt desligou (a proteção certa, mas o ciclo nunca completava). Agora 400 ms entre
  cliques; com `rate_limited`, pausa de 12 s e segue a 3,2 s por clique, até 3 tentativas por caixa.
- **Equip: regen. de vida e capacidade.** Dono: "o melhor anel é o roxo épico" (capacidade +65, regen. vida
  +1,2, sagrado +1 %) contra um incomum de max HP +21 que o helper preferia. Knight regen_vida 0,5 → 3,5
  (tanque toma ~27 de dano/s: +1 vida/s ≈ 3,7 %); capacidade 0 → 0,01/oz nos quatro. Na auditoria com as
  peças reais, três itens com regen. de vida saíram da lista de "dispensáveis". Raridade e potência NÃO
  pontuam — só os encaixes, com o peso de cada vocação (PESOS_EQUIP).

### 2.11.5 — encaixes certos por vocação (29/09, noite)
Respostas do dono à tabela de pesos do Equip:
- **Dano elemental só no elemento do mago.** Feiticeiro: energia e fogo; Druida: gelo e terra (0,6 por %,
  a mesma escala do Knight). Os outros elementos seguem 0 nos magos. Antes valiam 0 em todos.
- **Crítico conta nos magos** (magia e runa também dão crítico): chance 0,25 e dano 0,03, como Knight e Paladino.
- **Roubo de vida é bom no Knight**: chance e quantia 1 pt por % (eram 0,2/0,3). O roll típico visto ao
  vivo (2,4 % + 1,7 %) ≈ 4 pt, perto de +1,2 de regen. vida.
Teste novo em `testes/equip.test.js`.

### 2.11.6 — Equip refeito com a wiki e a party medida (29/09, noite)
Dono: "analisa toda sua tabela de comparação, tá calculando tudo errado" / "tô perdendo itens excelentes".
Lidos: /forja, /como-o-dano-e-calculado, /lure-levas-e-formacao, /equipamentos, /imbuements, /magias-e-runas,
/bestiario e os 4 guias de vocação. Os guias NÃO trazem "melhor atributo por vocação" — as regras sim.
Medido ao vivo (hunt 50, 90 s + 2 min) e nos Scans de Banshee/Quara:

| | dano/s | % da party | vida mín | mana média |
|---|---|---|---|---|
| Knight | 23–25 | 9–13 % | 55 % (toma 25–30/s, 65–78 % corpo a corpo) | 16–22 % |
| Paladino | 67–73 | 24–27 % | 56–100 % | 7–10 % |
| Feiticeiro | 68–80 | 20–29 % | 92–100 % | 5–12 % |
| Druida | 96–105 | 33–43 % | 36–100 % | 35–40 % (bebe poção) |

Regras da wiki que mudaram a conta:
- Crítico e roubo de vida são "chance de somar/devolver uma porcentagem": valem em PAR (chance × quantia); base 0.
- Runa usa o Nível Mágico treinado, sem bônus de item: ML de item só mexe nas magias.
- Regeneração é por segundo (HP/s, MP/s). Chance de loot vale o MAIOR da party. Capacidade soma na conta.
- Armadura e defesa do escudo só seguram corpo a corpo (só o Knight leva). Cura própria só no que ele cura em si.
- Peça Incomum ou melhor (ou refinada) não vende em lugar nenhum: usa ou desmancha (única fonte de fragmento).
Modelo novo: **1 pt = +1 % do dano da party (≈ 450 de ouro+xp/h)**. Ofensivo = % do dano do personagem × fatia
dele; mana para quem não bebe = dano/mana medido; mana do Druida = poção economizada (0,6 o/mana); defesa do
Knight = vida/s a menos × 3,6 pt; laterais com defesa baixa (×4 no cenário de mapa mágico). Pesos lidos do
livro-razão (≥ 2 min) ou do último Scan; sem medida, PARTY_REF. Sobras: só o que sobra também no cenário de
mapa mágico; 2 reservas por espaço; Épico ou melhor nunca sobra (base de forja, lista própria).
Resultado ao vivo: única troca = Paladino, anel max mana +93 (0,09 pt) → regen mana +1,3 do depósito (2,1 pt).
Wand do Feiticeiro: vortex +1 ML empata com a inferno (tiro ~0,14/s, mana curta). Rod do Druida: underworld rod
dá prejuízo (13 de mana/tiro pagos em poção); snakebite +1 ML é a certa.

### 2.11.7 — venda do Auto Hunt: nome em outra caixa, caixa que some e NPC que paga 0 (29/09, noite)
Teste ao vivo do ciclo completo (Vampire hell) parou no passo "vender": "não consegui desmarcar wild honey".
Três defeitos juntos, vistos no painel real:
- `items-by-name` tem "wild honey" e o `/item/info` devolve "Wild Honey": o `basePorNome` guardava só pelo nome
  devolvido e a venda não achava o item ("sem dados — guardado por segurança"). Agora guarda também pelo nome
  pedido, e `escolherDesmarcar` procura sem diferenciar maiúsculas.
- Desmarcar no painel REMOVE o `<span class="s-sellp-check">✓</span>` e a linha `sell-row-<nome>` ganha
  `s-sellp-cell--dim`. O helper esperava a caixa continuar lá; com o NPC pagando 0 o total também não mudava.
  Agora `linhaDesmarcada()` reconhece a linha apagada.
- Wild Honey vale 0 no NPC (~40 no Mercado): "vender" era jogar fora. Item com `sell === 0` fica guardado.
Depois: ciclo inteiro ok — encerrou, purificou, vendeu (+100), depot, **voltou para a hunt 50**; mel no depósito.
Mercado: REVISAR ok ("você é o menor", outro a 41); cancelar ok (os itens voltam direto para a mochila, não
pela Caixa). RESGATAR não testado: a Caixa só recebe algo quando um anúncio vende.

## 2.11.8 (29/09) — editor do Tampermonkey sem "!"

- O "!" amarelo na margem do editor do Tampermonkey era o ESLint embutido dele: 143 avisos de estilo, nenhum erro —
  106 `no-multi-spaces` (comentário alinhado com vários espaços), 28 `curly` (if/for de várias linhas sem chaves),
  8 `no-return-assign` (`forEach(x => x.onclick = …)`) e 1 `no-loop-func` (o findIndex do simulador da fila).
  Corrigidos no código; o comportamento não muda (os 164 testes passam iguais).
- `eslint.config.mjs` passou a exigir as 4 regras (`curly: multi-line`, `no-multi-spaces`, `no-return-assign`,
  `no-loop-func`) como erro: o CI barra se voltarem.
- O triângulo ao lado de "Última atualização" no painel do Tampermonkey ("modificado localmente") aparecia porque o
  script era colado no editor. Instalar pelo link raw do GitHub (Reinstalar) limpa o aviso e mantém a atualização
  automática funcionando.

## 2.11.9 (29/09) — Mercado: cópia sem concorrente do mesmo corte não usa a média

- Visto ao vivo no ATUALIZAR do Mercado: o simple dress **comum** saía sugerido a 104.790 e o crystal ring comum a
  83.778 (o incomum estava a 399 no mercado). A "média de 30 dias" (`market_stats`) é do item inteiro e mistura todas
  as raridades e refinos. Anunciado assim, não vende, e a taxa de 5 % (~5.200) não volta.
- Agora: cópia forjada sem cópia do **mesmo corte** à venda fica sem sugestão ("digite o preço") e nem pede a média.
  Item empilhável continua usando a média de 30 dias quando não há concorrente (ali não há raridade).
- "NPC 0" com o item só no depósito (quantidade 0 caçando) virou o preço por unidade ("NPC 250/un").

## 2.11.10 (29/09) — Progresso → Bestiário: "Completar marcos"

- Pedido do dono: um botão para completar o bestiário, trocando de caçada sozinho a cada marco fechado; e o que fazer
  com a mochila cheia e depois do fim.
- **Quais marcos compensam** (`pgPlanoBestiario`, puro, testado): o bônus vale para os 4 e para sempre (wiki
  /bestiario). Na moeda do Equip (1 pt = 1 % do dano da party), um marco entra se rende ≥ 0,5 pt por hora de caçada
  gasta nele. Abates/h: o medido; sem medida, 280 × lure (spawn limitando). Nível 67, 29/09:
  Goblins Femor Hills (regen. de mana +3, ~4.000 abates, ~3h30, ≈ 28 pt) e Tarpit Tomb (regen. de vida até +3)
  compensam; mana/vida máx., capacidade, armadura e skill +1 em 10.000 abates não. Os que não compensam ficam atrás de
  "não compensam", e dá para marcar à mão (aí vai até o último marco).
- **O modo** (só liga por botão, 2 toques; F5 continua de onde parou): entra na caçada-alvo pelo socket com o lure
  máximo, aplica o kit escolhido (Econômica por padrão), espera o contador do frame passar do alvo e vai para a próxima.
- **Mochila cheia:** com o Auto Hunt ligado, a venda dele volta para a caçada do bestiário (não para a memorizada);
  com ele desligado, o próprio modo faz o ciclo de venda (origem `bestiario`) no limite do Auto Hunt.
- **No fim:** vai para a caçada escolhida em "no fim, upar em" (ou volta para onde estava), devolve os kits de antes
  e passa esse mapa ao Auto Hunt. Morte ou Auto Exit por ouro param o modo e devolvem os kits.
- Scan não liga com o modo ligado; o modo espera Scan, ciclo de venda, boss e aplicar magia.
- `_scanRestaurar`/`scanVoltarMapa`/`scanRestaurarPerfis` ganharam o parâmetro `quem` (o Log diz "Bestiário:").

## 2.11.11 (30/09)
- **Equip: nada passa de um personagem para outro.** Dono: "você está tirando item de um personagem e colocando no outro,
  não é isso que preciso" (a chain armor épica do Druida ia para o Paladino, +14 pt). Peça vestida só é candidata para quem
  a veste; as trocas vêm só do depósito e da mochila. Teste em `testes/equip.test.js`.
- **Bestiário "Completar marcos": ganho mínimo de 1 pt** (`PG_BEST_MIN_PT`). Marco rápido de ganho irrisório (Dwarf Bridge
  +9 vida máx, Cyclops) passava no limiar de pt/h; agora cai em "não compensam".
- Teste ao vivo da 2.11.10: marco da Dwarf Bridge fechado (10.000 → +9 vida máx), volta automática a Vampire hell (lure 1),
  kits de antes devolvidos, Auto Hunt intacto (hunt 50).

## 2.11.12 (30/09) — o travamento da Magia, achado
- **Causa:** `simularFila` pulava para a próxima onda com `t − t%ciclo + ciclo`. Com o ritmo MEDIDO ao vivo (Vampire hell:
  onda morta em 4,019 s + espera 9,524 s → ciclo 13.542,83… ms), em t = 40.628,5 o `%` deu `ciclo − 2e-12` e a conta
  devolveu o próprio t: laço infinito, página congelada. Só acontecia com a caçada em andamento (ritmo medido no
  livro-razão) — offline, com o ritmo padrão (números redondos), nunca reproduzia. Foi o congelamento de 29/09 (trocar
  mapa/modelo na Magia) e o de 30/09 (Scan aplicando Em área).
- **Correção:** próximo ciclo por índice (`(floor(t/ciclo)+1)·ciclo`, e se não andar, +250 ms) e teto de 200.000 voltas.
  Reproduzido em node com o livro-razão copiado da conta (16 planos travavam; agora 2–4 ms). Teste em `testes/magia.test.js`.

## 2.11.13 (30/09) — o Inteligente sai do menu
- Scan comparando Em área × Inteligente, 7 min cada, lure máximo, nível ~67 (analisador zerado a cada medição):

  | mapa | modelo | xp raw/h | ouro/h estável | abates/h | poção/h |
  |---|---|---|---|---|---|
  | Vampire hell | Em área | 55,4k | +3,5k | 1.635 | 16,2k |
  | Vampire hell | Inteligente | 52,0k | +1,1k | 1.584 | 14,4k |
  | The Banshee Quest | Em área | 46,9k | +7,8k | 938 | 21,1k |
  | The Banshee Quest | Inteligente | 44,9k | −10,2k | 898 | 27,8k |

- Além de perder, ele trocava de kit a cada APLICAR: as magias do kit entravam com o dano MEDIDO e as de fora com o
  TEÓRICO (todos os alvos do lure), mais alto — e cada `profiles_set` zerava a mana medida do personagem.
- Dono: "pode retirar". Saiu da Magia, do Scan (modelo e estudo de variantes) e do kit do bestiário. A escolha guardada
  vira Em área (`migrarModelos`, no boot e na troca de gaveta). O planejador continua no código (os testes o exercitam),
  em `MODELOS_FORA`, sem botão.

## 2.11.14 (30/09) — Mercado não trava mais depois de um F5
- A leitura do Equip (o melhor e a reserva de cada personagem, que o Mercado nunca anuncia) vive só na memória. Depois
  de um F5 toda peça forjada aparecia travada com "rode ATUALIZAR no Equip antes" e o dono não conseguia marcar nada.
  Agora o ATUALIZAR do Mercado lê o Equip junto quando ele ainda não foi lido (só leitura: depot_get + /item/info).

## 2.11.15 (30/09) — revisão do "Completar marcos"
- Venda do modo "completar" falhou → o modo desliga **e devolve os kits de antes** (`bestEncerrar(..., 'perfis')`, que
  espera o ciclo terminar). Antes a foto era descartada e o kit do bestiário ficava nos 4.
- Mochila cheia com o Auto Hunt desligado e a venda ainda travada (5 min desde o último ciclo, ou janela aberta): o modo
  **espera na cidade**. Antes caía no "entrar" e reentrava com a mochila cheia — o Auto Exit tirava a party de novo, em laço.

## 2.11.16 (30/09) — Equip: encaixe nobre nunca sobra (regra da comunidade + wiki /forja)
- Dono: "todos os itens com regen de mana são bons para todos; no Knight regen de mana + regen de vida. Arma e colar:
  corpo a corpo, distância, nível mágico, ou dano físico/mágico (a cada ~2 % vale 1 nível mágico)".
- Wiki /forja: encaixes de defesa (escudo, elmo, armadura, calça, bota, anel) e de ataque (arma, colar) são grupos
  separados. Faixas por potência I–VI: regen. de vida/mana +1,1 a +5,2; nível mágico/skill +1 a +3; dano 1,2 % a 9,8 %.
- Conferência da tabela (potência III, uma peça de 1 encaixe): na defesa, regen. de mana já era o 1º de Paladino,
  Feiticeiro e Druida, e no Knight regen. de vida (9 pt) > regen. de mana (3,2 pt). Na arma/colar dos magos, nível
  mágico > dano mágico (≈ 1 ML ≈ 2,8 % de dano: bate com a regra dos 2 %).
- Corrigido: com a mana do mago medida ≥ 60 % a regen. de mana valia ×0,2 e caía para trás de chance de loot e
  capacidade. O corte saiu.
- Novo grupo **"guardar: encaixe bom"**: peça que nenhum personagem usa hoje nem é reserva, mas tem regen. de mana/vida
  (defesa) ou corpo a corpo/distância/nível mágico/dano físico/dano mágico (arma e colar), não entra nas sobras nem no
  Mercado. Só vale para peça que alguma vocação veste (lança continua saindo).
- Divergência que ficou: no Paladino a distância vale quase nada (0,03 pt por +1) porque o dano medido dele é 95 %
  runa + magia. A peça com distância é guardada pela regra acima, mas não ganha troca.

## 2.11.17 (30/09) — Knight: regen. de mana em 1º
- Dono: "o Knight tem que ter regen. de mana como principal, depois regen. de vida". Peso da regen. de mana do Knight =
  máx(conta da mana, 1,25 × o da regen. de vida) = 4,5 pt por 1 de mana/s (era 1,26). Potência III: regen. de mana
  11,3 pt > regen. de vida 9 > cura própria 2,1 > escudo 1,4.

## 2.11.18 (30/09) — troca por ganho pequeno volta a aparecer
- Dono: "avalia se o regen de mana 2 é maior que 1,9?". A nota já era maior (é linear: valor × peso), mas o custo de
  troca de 1 pt (2.11.2) escondia a sugestão: +0,1 de regen. de mana dá +0,14 a +0,48 pt, e no Paladino nem 1,9 → 2,5
  (+0,8) aparecia. O custo existia contra a cadeia de trocas entre personagens, que a 2.11.11 já proibiu. Agora é
  0,1 pt (só desempate): 2,0 tira a 1,9 nos 4; empate fica com a vestida. A peça que sai continua reserva/"guardar".

## 2.11.19 (30/09) — encaixe bom volta a ser vendável quando todos já vestem igual ou melhor
- Dono: "caso todos já estejam equipados com itens bons quero ter a opção de vender eles".
- "Guardar: encaixe bom" agora só segura a peça cujo encaixe nobre (em pt) supera o da peça que alguma vocação que a
  veste vai usar naquele espaço. Se todos já vestem igual ou melhor, ela volta para "sobrando" com o motivo
  "encaixe bom, mas todos que a vestem já usam igual ou melhor" — e vende como antes.
- Nobre por vocação: defesa = regen. de mana (4) + regen. de vida (só Knight); arma/colar = Knight corpo a corpo e
  dano físico; Paladino distância, nível mágico, dano mágico e físico; magos nível mágico e dano mágico.

## 2.11.20 (30/09) — "não errar": auditoria da venda + conferência das regras na wiki
- Dois agentes: um conferiu as regras da comunidade nas 52 páginas da wiki, outro auditou todo caminho que vende.
- **Wiki** (/forja, /vender-e-auto-selling, /mercado): peça **Incomum ou melhor, ou com refino, não vende na cidade, no
  Auto Selling nem no Mercado** — só usa ou desmancha. O que vende é a Comum sem refino (sem encaixe nenhum).
  Regen. de vida/mana da forja é **por segundo** (/bestiario). Arma/colar sorteiam do grupo ofensivo; skill tem peso 1
  (rara), dano peso 10. Nível 67, ML 25: 1 ML ≈ 2,6 % de dano mágico (Energy Strike) — a regra "2 % ≈ 1 ML" é boa.
  A wiki não diz que regen. de mana é "o melhor" nem que distância é o melhor no Paladino: é regra da comunidade.
  Runa: o dano sobe com o ML TREINADO e o nível (o "dano de runa é fixo" das seções antigas está desatualizado).
- **Auditoria**: Auto Hunt e Venda rápida já eram seguros (protegem todo equipamento pelo nome e não vendem nada se
  não conseguem desmarcar). As brechas eram no Mercado, que só barrava o que o Equip conhecia:
  - **lista branca**: cópia de equipamento só pode ser marcada se a última leitura do Equip a pôs nas sobras (fecha:
    peça que o Auto Hunt guardou depois da leitura, depósito não lido, base desconhecida, base de forja épica+);
  - o ATUALIZAR do Mercado **sempre** relê o Equip (antes só quando não havia leitura);
  - encaixe da forja normalizado (id em minúsculas com `_`, valor "1,9" → 1.9) — antes um formato diferente zerava o
    encaixe em silêncio e a peça podia cair nas sobras.

## 2.12.0 (30/09) — Inteligente v3: a party inteira no simulador
- **Por que o antigo saiu (2.11.13)**: réguas diferentes dentro e fora do kit (a magia do kit com o dano MEDIDO, a
  de fora com o teórico × todos os alvos do lure — 5 kits em 5 APLICAR), regras fixas (`pega(…, 2)`, "sobrando ? 3 : 2"),
  poção cobrada sem descontar a regeneração (previsto 95k/h, medido 16,2k/h) e o APLICAR apagando as vitais.
- **O que mudou** (tudo em `@@MAGIA`; os modelos Econômica, Equilibrado, Em área e Boss continuam como estavam):
  - **Régua única** (`reguaInt`): `porLanc = danoAlvo · nota · armadura · alvos(classe, L)`, dentro e fora do kit. A
    medição NÃO substitui o número: corrige a CLASSE de forma inteira (`fatoresForma`: fForma = clamp((n·r + 15)/(n + 15),
    0,3, 1,5), n em degraus {0, 30, 100, 300}, fator em degraus de 0,05). Frações da wiki: cerco 1 (Berserk, Groundshaker,
    runas, Scorch, ultimates), Lesser Front Sweep 0,375, onda lateral 0,6, feixe 0,3, Caldera 0,25. Dano da fórmula
    (`fonte: 'formula'`) leva ×0,40/0,60/0,75 por classe; sem cartão nem medição, ×0,85 ("estimado").
  - **`simularParty`**: os 4 contra a onda como um pool de HP (1ª criatura quando a espera acaba, as outras a cada 0,5 s;
    overkill se perde), passo de 250 ms, 360 s, regeneração sempre, reserva de mana para a cura (medida no livro-razão;
    sem medida Druida 6/s e Knight 4/s), poção a 30 % com 1 s de descanso compartilhado com a runa, golpe do Knight e
    tiro do Paladino (fórmula da wiki, com armadura), Protector ×0,65, Blood Rage ×1,35 no físico, Train Party +3 skill.
  - **`buscarParty`**: A candidatas (≤ 8, fora imune/vetada/runa sem ML/runa no Knight/Sharpshooter/dominada no mesmo
    grupo secundário) → B barras de 1 a 4 (recarga longa em todas as ordens, preenchimento no fim, área antes de alvo
    único) × poção {não, 30 %} → C mínimos {1, 2, 3} e a runa de área na frente quando o mínimo dela é maior → D descida
    por coordenadas (2 rodadas D → S → P → K, suportes permitidos) → E regen ×0,7/×1/×1,6 sem regeneração medida. Tetos
    N_MAX_SIM 6000 e N_MAX_PARTY 400, memória por assinatura. Escolha GLOBAL entre todas as parties simuladas: seguro →
    LCB ≥ piso → xp ≥ (1 − ε)·xpMax (ε 3 %; "XP absoluto" 0,5 %) → lucro, ouro, poção ligada, slots, nome.
  - **Histerese** (`decidirTroca`): troca só com o novo 3 % (tudo medido) ou 5 % melhor, ou vigente inviável; nada nos
    10 min depois de um APLICAR; "replanejar do zero" esquece o kit do mapa (`kit_int`, `int_aplicado`).
  - **Escada defensiva** (`escadaDefesa`): sem medida degrau 1 (curas +10); Druida com mana mín. < 2× Heal Friend (ou
    Knight < 40 % já no 1) → poção de segurança a 20 %; Knight < 30 % ou morte → Protector; de novo < 30 % → aviso "mapa
    acima da party". Magic Shield só no mago que toma área com vida < 80 %; Blood Rage só com Knight ≥ 70 % em ≥ 30
    amostras.
  - **Livro-razão**: `regenMedida` (janelas de 3–10 s sem lançar, sem cura e sem gole → Δmana/Δt; mediana das últimas
    200, vale com ≥ 30, chave `regen_<VOC>`; o simulador dos modelos antigos também usa), mana mínima por personagem, e
    as vitais ficam guardadas **por kit** (`vitaisPorKit`) em vez de apagadas a cada APLICAR.
  - **Só no clique**: a Magia mostra "CALCULAR O KIT"; APLICAR e o Scan (quando o dono liga) calculam. O desenho da tela
    e o handler de frame só leem o que já foi calculado. O Inteligente voltou ao menu da Magia, ao Scan (modelo e
    variante) e ao kit do bestiário; `inteligente_mana/_semruna/_seco` guardados viram `inteligente`.
- **Calibração** (`K_VIVO`, um ponto): dano ao vivo ÷ cartão × alvos, com o Em área de Vampire hell no ritmo medido
  (onda 4,0 s + espera 9,5 s), dano/s por personagem 25/73/80/105 → Knight 5,8 · Paladino 5,0 · Feiticeiro 4,7 ·
  Druida 7,35 (o auto-ataque dos magos fica dentro). Previsto com esses fatores: Vampire hell Em área 1.571 abates/h e
  52,4k xp/h (medido 1.635 e 55,4k); Banshee 1.108 e 55,4k com a espera padrão de 10 s (medido 938 e 46,9k: a Banshee é
  limitada pelo spawn e a espera dela nunca foi medida — com 13,2 s (espera em degraus de 0,5 s: 13) dá 935 e 46,8k); gasto da party no Em área de Vampire hell
  8,7k/h (medido 16,2k: o modelo não põe o Druida bebendo nem conta poção de vida).
- **Busca em node** (nível 67, 15 mapas): 50–153 ms por mapa, média ~85 ms (2.100–5.000 triagens + 180–270 parties).
  Previsto Em área → Inteligente (xp/h / lucro/h): Vampire hell 52,4k/55,1k → 52,9k/64,2k; Dragon Lair 54,6k/97,1k →
  59,4k/113,3k; Quara 50,8k/79,1k → 57,6k/94,4k; Banshee 55,4k/57,7k → 55,4k/66,1k; Water Elementals 61,5k/15,6k →
  60,5k/22,6k (−1,6 % de xp dentro da faixa de 3 %, +7k de lucro). Sem loot conhecido (Wolves, Daramian, Cults,
  Thunderscar) fica o de maior lucro garantido, com o aviso "não se paga".
- **Testes**: `testes/inteligente.test.js` (15 casos da ESPEC). Desvios da ESPEC, com o porquê no próprio teste:
  caso 4 sem "Berserk no slot 1" (Berserk > LFS e LFS > Berserk a < 0,5 % de xp) e dano/s na escala do Scan; caso 5 em
  Dragon Lair (Vampire hell é limitado pelo spawn); caso 6 — a poção do Knight em Dragon Lair rende ~4 % de xp por
  ~22k/h, então com ε 3 % ela pode ficar (o teste confere a regra); caso 10 em Quara com XP absoluto e runa ≥2; caso 13
  Banshee ±20 % com a espera padrão (±12 % com a espera que fecha o medido); caso 15 em 9 de 10 mapas (Quara, com poção
  no Knight, fica a 1,5 % / 9k da exaustiva). Nova fixture pública `testes/fixtures/bestiario.json` (armadura/defesa).
- **Fica como estava**: `melhorKitBoss` (o Boss não virou `buscarParty` com L = 1 — mudaria o modelo Boss);
  `FATOR_ALVOS_REAIS` só nos modelos antigos; `simularFila` intocada (a flag `regenSempre` nasce desligada).
- **Falta medir ao vivo** (ESPEC §6): regeneração de mana por personagem (a busca usa a tabela 8/12/16/16 até ter 30
  janelas); alvos por lançamento de Caldera, ondas, LFS e runas (fForma); a espera entre ondas da Banshee e de cada mapa;
  loot/h e poção por personagem no Scan (c_voc, k_calib); vida mín. do Knight, área nos magos e mana mín. do Druida
  (escada); buffMs de Protector/Blood Rage/Sharpshooter e Magic Shield (API × wiki); aceite: Scan A/B Em área ×
  Inteligente em Vampire hell e Banshee, 7 min cada (xp ≥ Em área −2 %, lucro ≥ Em área, mesmo kit em 2 APLICAR).
  A barra do Knight com 4 ataques segue sem confirmação (o logbook mostra 2).

## 2.13.0 (30/09) — aba nova "Radar" (só leitura): ranking de mapas, loot ao vivo, alertas de preço e o dia
- Dono: "coloque em novas telas, para não misturar com as que já utilizo: ranking de todos os mapas sem precisar caçar
  (levando em consideração meus status com o do monstro), valor do loot em tempo real, alerta de preço no Mercado e
  relatório diário". Ícone ⌖ antes do Log, 4 sub-abas: **Mapas | Loot | Alertas | Dia**. Rodapé fixo: "Só leitura".
  (O Inteligente v3 = 2.12.0 está sendo feito em paralelo; a numeração se acerta no merge.)
- **Nada envia comando de ação.** Leituras extras só por botão: `CALCULAR` (GET público `/hunt/lootTable` e
  `/bestiary/creature`, 1 a cada 0,3 s, guardados na gaveta comum `loot_tab_<título>`), `ler preços do mercado` e
  `CONFERIR AGORA` (`market_catalog` + até 5 `market_stats`, pela fila do Mercado: 3,5 s entre pedidos). O **vigiar**
  vem desligado; ligado, lê no máximo 1× a cada 15 min (o campo não aceita menos), só com socket aberto, Mercado livre,
  sem Scan/ciclo e com Premium. Testado no vm: 2 h de relógio com vigiar desligado = 0 `market_*`; ligado = só
  `market_catalog`/`market_stats`, intervalos ≥ 15 min.
- **Mapas (estimado, calibrado pelo medido)**: por mapa até nível+5, T = lure × HP médio ÷ dano/s da party (o mesmo
  planejador da aba Magia, com o dano medido dos 4 — `viabilidadeParty`), abates/h = kAbates × lure × 3600 ÷
  (T + espera + 0,5 × lure), xp/h = abates × xp médio (ponderado por weight), loot/h = abates × loot do catálogo × fator
  de loot, gasto/h = abates × custo por abate do planejador. **Calibração pelos Scans limpos do nível (±2)**: kAbates =
  mediana medido/estimado (0,5–1,5), fator de loot = mediana loot medido ÷ (abates × catálogo) (0,15–1; **padrão 0,35
  sem Scan**, TIBIDLE §12). Com Scan limpo o **medido manda** (xp raw, ouro) e a estimativa fica ao lado. Risco por
  pontos: nível mínimo perto do seu (+1), dano tomado estimado > 1,5× o maior já aguentado com o Knight ≥ 50 % (+2),
  onda > 25 s (+1), nota do elemento da party < 60 (+1), Knight já a < 40 % ali (+2), morte nos últimos 7 dias (+3);
  0–1 baixo, 2–3 médio, ≥ 4 alto; nível abaixo do mínimo = bloqueado. **A API não dá o dano que o monstro causa**: o
  "dano tomado estimado" é aTomado × lure × xp por abate, com aTomado calibrado nos Scans (sem Scan esse ponto não entra).
  `dropNerf` do codex: `/assets/v100/codex.json` saiu do ar (a versão corrente é v167) e `entries` veio **vazio** —
  sem lista de itens de codex o nerf por item não é aplicado; o fator de loot calibrado faz esse papel.
  Ponto de plugar outro motor: `registrarMotorRanking(nome, fn)` (o v3 devolve `{abH, custoH, danoS, porVoc}` e a
  fórmula é pulada). Resultado em `radar_rank` (~20 KB), com "recalcule" quando o nível muda.
- **Loot ao vivo (medido)**: delta do `frame.analyzer` frame a frame (reset quando a caçada troca ou o analisador zera;
  a base fica guardada 12 h, então o F5 não conta duas vezes nem perde o que rodou no meio). Valor NPC = `value` da
  tabela do mapa; mercado líquido da taxa quando lido; etiqueta "mercado +X %" com ≥ 10 % e negócio em 30 d. Raro =
  chance < 1 % ou valor ≥ 20× o loot médio por abate: dourado e 1 linha no Log por drop.
- **Alertas**: lista de itens (vender/comprar; gatilho % sobre a média de 30 d e/ou preço). Mensagens: "vale anunciar",
  "COMPRA aberta a Y — aceitar no jogo é na hora e sem taxa", "barato: Y". Mesmo alerta não repete em 6 h. Contador no
  ícone até abrir a sub-aba. Sugestões: itens do baú e da mochila com negócio em 30 d.
- **Dia**: xp, ouro líquido, loot, abates, mortes, horas, por mapa, ciclos do Auto Hunt, venda ao NPC (`sell_result`),
  vendas no mercado (`market_inbox_result` trade_proceeds, id sem repetir), raros; hoje × média dos 7 dias anteriores e
  7 barrinhas; "copiar texto". Frame que cruza a meia-noite é dividido. Caçada que terminou com a página fechada entra
  pelo `ended.summary` (menos o que os frames já contaram). `radar_dias` fica com 30 dias (PODAR).
- Testes: `testes/telas-api.test.js` (19 puras + 8 no vm), `casca` (10 ícones em 1366×768), `fumaca` (PODAR isolado).

## 2.13.0 — junção (Inteligente v3 + Radar) e correções da verificação
- As duas frentes (Inteligente v3, feito como 2.12.0, e a aba Radar, 2.13.0) foram juntadas numa versão só: 2.13.0.
- A verificação adversarial foi interrompida para economizar o crédito dos agentes: a do Radar achou 7 problemas
  (2 altos), a do Inteligente não chegou a relatar. Corrigidos à mão:
  - **ranking de mapas (alto)**: o motor padrão passou a ser o Inteligente v3 (`MOTORES_RANK.inteligente` →
    `partyInt`), que devolve abates/h e gasto/h da própria simulação da party. O motor antigo derivava o tempo da
    onda de um dano médio diluído pela espera e multiplicava o gasto pela curva de desperdício (gasto/h maior que o
    possível). O motor antigo continua no seletor.
  - **drop raro**: chance < 1 % só conta se o item valer ≥ 5× o loot médio por abate (antes metade da tabela, de 1 a
    30 de ouro, virava "raro" e enchia o Log).
  - **recomeço no mesmo mapa**: o analisador do jogo não zera; a base do loot ao vivo só vira zero se o 1º frame for
    de caçada nova (< 5 s).
- Pendentes da verificação (médios, não corrigidos): validade/purga da cópia da tabela de loot na gaveta comum;
  caçada offline que cruza meia-noite entra toda no dia do resumo; alerta "vale anunciar" não desconta os anúncios
  do próprio dono nem compara com o NPC.
- Teste ao vivo pendente: Scan A/B Em área × Inteligente (Vampire hell e Banshee, 7 min cada) e conferir o ranking
  do Radar contra os Scans já medidos.

## 2.13.1 (30/09) — Inteligente recalibrado pelos Scans ao vivo + 3 correções do Radar
Teste ao vivo da 2.13.0 (`docs/resultado-2.13.md`): no Scan A/B de 7 min o Inteligente perdeu 44 % de xp nos dois
mapas (Vampire hell 32,5k × 58,0k do Em área; Banshee 27,7k × 49,6k) e ainda tirou os suportes e as curas do dono.
- **Por quê (medido magia a magia, 4 Scans, ~1.700 lançamentos)**: o simulador previa +80 % e +92 % de abates/h para
  os kits do Inteligente. Três erros que se compensavam no Em área (−12 %/−2 %):
  1. `K_VIVO` (5,8/5,0/4,7/7,35) inflava o dano **por alvo**: medido (dano ÷ alvos atingidos ÷ cartão) é Druida 2,0–2,3,
     Feiticeiro 2,0 (Energy Wave e Rage 3,0), Paladino 1,4–1,8, Knight 0,55–1,0. Alvo único previsto 285–320 por
     lançamento, medido 31–88.
  2. As frações de alvos estavam pela metade (onda 0,42, Caldera 0,25 depois da "correção da classe"): na 1ª rajada
     Strong Ice Wave, Energy Wave e Berserk acertaram 6 de 6 e a Caldera 5,7 de 6.
  3. O golpe do Knight e o tiro do Paladino levavam ×K_VIVO (~160 e ~120 de dano/s); medido ~15 por golpe. Era o que
     fazia 2 magias baratas "bastarem".
  E o simulador matava a onda como um pool (uma criatura por vez): a 3ª magia da 1ª rajada já saía com metade da onda
  "morta" e a última criatura ficava 6 s apanhando de runa de alvo único.
- **Agora** (`@@MAGIA`): `K_VIVO` = dano por alvo (0,9/1,5/2,2/2,2) e `K_BASICO` 0,3 no golpe; `FRACAO_FORMA` cerco,
  onda e Caldera 1, frente 0,33, feixe 0,25 (a média medida por lançamento não entra: ela cai com o kit — 6 alvos no Em
  área, 4,3 no kit lento — e o simulador já desconta os vivos). `calibracaoInt` troca o `fatoresForma`: dano por alvo
  medido por vocação (kVoc) e por magia (kMagia), encolhidos com N0 = 30 e em degraus. `simularParty` com **vida por
  criatura** (área acerta as vivas, alvo único foca a de menos vida, overkill se perde) e `CHEGADA_MS` 0 (a leva chega
  inteira). `indiceMedicoes` guarda os acertos (`hits`).
- **Validação** (`testes/int-calibracao.test.js` com `data/scans-30-09.json` — o dano real da conta, fora do git; sem o arquivo o teste é pulado): abates/h
  previstos × medidos — Vampire hell Em área 1.880 × 1.745 (+8 %), Inteligente 922 × 966 (−5 %); Banshee Em área
  966 × 992 (−3 %), Inteligente 591 × 554 (+7 %). A busca passa a escolher kits só de área que matam a onda na 1ª
  rajada (Vampire hell: 1.873 abates/h previstos, contra 1.880 do Em área, com menos runa).
- **Suportes e curas do dono** (`configDono`/`suportesDono`): com o perfil lido do servidor a busca usa os suportes
  dele (Train Party conta no dano; os de grupo gastam mana) e o APLICAR manda as curas e os suportes dele como estão. A
  escada só põe Protector num slot de suporte livre; o "+10 nas curas" só vale sem o perfil do dono.
- Aba Magia: linha "regeneração de mana/s" (medida ou * da tabela); "ouro X/h" virou "gasto em poção/runa X/h".
- **Radar**: (1) o ranking usa o **melhor** Scan limpo do mapa (mais xp) e mostra de que modelo ele é — antes o último
  medido (o Inteligente ruim) derrubava Vampire hell para 32,5k; (2) a sessão do Loot zera a cada `hunt_started`, como
  a janela do jogo (o F5/`resume` não zera); (3) Dia: `ended.summary.title` é `{key, params:{name}}` e `kills` é
  objeto (total em `killsTotal`) — saía "[object Object]"; e o resumo do fim não soma nada quando os frames
  acompanharam a caçada até o fim (base com < 90 s): o Scan zera o analisador no meio e resumo − base contava de novo
  (30/09: +15 min e +14,1k xp, XP do dia +40 %).
- Testes: 229 (224 no CI: os 5 de calibração precisam do `data/`; inteligente 3, 4, 6 e 13 reescritos com o porquê; +2 do Radar).

## 2.13.2 (01/10) — a busca do Inteligente sempre compara com o Em área
- Defeito aberto no roteiro 2.13.1 (item 0): com um kit guardado em `kit_int`, `buscarParty` partia dele e a party do
  Em área só entrava na escolha global quando não havia kit guardado (ao vivo: 57,6k × 59,4k xp/h em Vampire hell).
- Agora `contextoInt` monta sempre `ctx.area` e `buscarParty` avalia essa party: ela entra em `todas` (a busca nunca
  sai pior que o Em área) e vira o ponto de partida da descida quando é melhor que o vigente.
- Teste novo em `inteligente.test.js` com o kit fraco da 2.13.0 guardado. Nas fixtures a busca já achava um kit bom
  mesmo partindo do fraco (o teste passa com e sem a correção) — o defeito ao vivo depende das medições da conta;
  conferir no item 1 do roteiro 2.13.1.
- **Aviso "⏳ CALIBRANDO o Inteligente neste mapa"** na aba Magia (dono: "tenho que ficar 10 min no Em área e
  depois trocar? bota um aviso"). Mostra o que falta e como fazer: regeneração de mana dos 4 (x/30, mede sozinha
  caçando em qualquer mapa), Scan ≥ 2 min do mapa com Em área (calibra abates/h e gasto), loot medido (Scan com
  ≥ 100 abates) e dano das magias no mapa. Com tudo medido: "✓ Inteligente calibrado neste mapa".
- **Radar, pendentes da verificação da 2.13.0 (fechados):**
  - alerta "vale anunciar" não dispara quando o menor anúncio é o seu (só você vende) nem quando o líquido depois
    da taxa não passa do NPC;
  - a cópia da tabela de loot na gaveta comum agora tem data e era: vale 7 dias e morre na virada de era;
  - caçada fechada com a página fechada (offline) é repartida entre os dias que cruza (antes entrava toda no dia do
    resumo).
- Revisão geral: os 66 avisos do ESLint são todos `catch (e)` sem uso (inofensivos).

## 2.13.3 (01/10) — "1 combo": em que mapa a party limpa a onda na 1ª rajada
- Dono: "toda hunt tem tempo de volta fixo; a ideia é matar o bicho num hit só — o pessoal acha o mapa em que mata
  com um combo". abates/h = lure × 3600 ÷ (T + espera): com a espera fixa do mapa, o que dá para ganhar é T → 0 e,
  quando T já é ~0, subir para o mapa de mais xp por monstro em que ainda se limpa na 1ª rajada.
- `tpCombos(T)` = floor(T / 2) + 1 (a fila dispara a cada 2 s). O motor Inteligente do Radar passa o T da simulação
  da party; mapa medido usa a onda medida no Scan (`razao.ondas.matar`).
- Radar → Mapas: etiqueta "⚡ 1 combo" / "N combos", detalhe "onda limpa em X s", e ordem nova **⚡ 1 combo**
  (menos rajadas primeiro; empate, mais xp). Aba Magia (Inteligente): o previsto mostra o mesmo.
- Ex. medido 30/09: Vampire hell Em área limpa em 2,3 s = 2 combos (e espera 10,2 s).

## 2.13.4 (01/10) — a cura entra na conta: bicho vivo bate e custa poção
- Dono: "quanto mais o bicho fica vivo, mais ele bate e gasta tudo — por isso tem que ser insta kill; é por isso que o
  pessoal usa tantas magias". O simulador cobrava a mana dos ataques, mas não a cura do dano tomado.
- `simularParty` soma **monstro·s vivo por onda** (`vivosOnda`). `calibrarPorScan` separa a poção de VIDA medida no
  Scan do mapa (`supVoc.itens` × preço do catálogo, `ouroVidaItens`) do custo de ataque (`cVoc` agora só com o
  resto) e calcula `curaPorVivo` = ouro de cura/h ÷ (vivos por onda da party do Scan × ondas/h).
- `metricasInt` cobra `curaH = curaPorVivo × vivosOnda × ondas/h` no gasto e no lucro: um kit que mata mais rápido
  (menos vivos) paga menos cura — inclusive o Knight com mais magias, se ele encurtar a onda. Na party do Scan o
  total fica igual ao medido. Sem Scan do mapa, 0 (comportamento antigo).
- Aba Magia: "gasto em poção/runa X/h (cura Y/h pelo tempo que os bichos ficam vivos)".

## 2.13.5 (01/10) — correções do teste ao vivo da 2.13.4 (`docs/resultado-2.13.1.md`)
- **Dia sem a caçada anterior à página** (01/10: 3h32 com a página fechada, o dono encerrou 4 min depois de abrir; o
  Dia ficou com 4 min). `tpTrechoAntes(base, an, huntId, agora)`: no 1º frame de uma caçada que a página não viu
  começar, o que o analisador já tinha entra como "offline". Mesma caçada = mesma hora de início (`t − elapsedMs`,
  ±5 min) ou base de < 2 min no mesmo mapa; `hunt_started` visto (base `novo`) nunca conta.
- **Inteligente trocava de kit a cada clique** (3 cliques em 3 s → 56,8k → 58,4k → 58,4k, kits diferentes). No node:
  espera 9,5–10,2 s e regen do Knight 7–7,5 alternam kits com xp e lucro IGUAIS (só a ordem de 2 magias muda). Agora
  o kit **mostrado** também tem histerese (`_intMostrado`, decisão `MOSTRADO`): o novo só tira o anterior com > 1 % de
  xp, ou xp igual (−0,5 %) e lucro > 1k/h e 3 % maior. Reavaliado sempre com os suportes do dono de agora;
  "replanejar do zero" esquece.
- **Suportes do dono fora do carimbo**: trocar os suportes no jogo não invalidava a conta guardada do Inteligente
  (a tela seguia com o kit antigo). O carimbo agora inclui `suportesDono` dos 4.
- **Mercado: "suas ordens" em páginas de 50** (`market_my_orders {page}`): o dono tinha 55 abertas e o helper via 50
  (Meus anúncios, REVISAR). `mkLerMinhas` lê até a página vir incompleta.
- **Alertas do Radar sem as suas ordens**: a regra "o menor anúncio é o seu" (2.13.2) só valia se a aba Mercado
  tivesse sido lida na sessão (`MK.minhas` era `null` no teste). O CONFERIR lê as suas ordens (todas as páginas,
  só leitura) quando não lidas ou com > 30 min.
- **Radar, mapa medido**: o ouro/h é o **estável** do Scan (o bruto de 4 min virava +18,8k/h com uma black pearl e
  uma spike sword; estável −1,4k/h). A sorte aparece no detalhe ("sorte no Scan … fora do ouro").
- **Loot depois do F5 sem valor**: a tabela de loot baixada pelo Scan/Magia/ouro por abate não ia para a gaveta
  comum (69 de 70 guardadas — faltava justo Vampire hell). `radarGuardarTab` guarda de qualquer caminho.
- Não eram defeitos (ver o resultado): "raro em dobro" (2 spike swords de verdade — o jogo vende o loot sozinho,
  `autoSellInMs`, e a mochila não prova nada), APLICAR em dobro (o bloqueio funciona; o 2º toque veio depois de
  terminar), Radar × Magia nos combos (a mesma conta em momentos diferentes; no mesmo instante batem).

## 2.13.6 (01/10) — F5 no meio da caçada virava "offline" (regressão da 2.13.5)
- Ao vivo, logo depois de instalar a 2.13.5: F5 em Vampire hell → Dia com `offline` 0 → 2 e xp 77k → 139k (a caçada
  em andamento contada 2× a mais). Depois do F5 o jogo manda `frame` ANTES do `resume`: com `huntId` ainda `null`, a
  base guardada (mapa 50) parecia de outra caçada, `tpTrechoAntes` lançava o analisador inteiro como offline, e o
  frame seguinte (já com 50) lançava de novo.
- O Radar ignora o analisador enquanto a caçada não é conhecida (`huntId == null`), e `tpTrechoAntes` nunca conta
  sem `huntId`. Teste no `vm` com o frame antes do `resume`. O Dia de 01/10 do dono foi consertado à mão (os 2
  lançamentos falsos tirados).

## 2.14.0 (02/10) — kit enxuto e kits da comunidade no Inteligente
- **Origem**: dois setups do Discord testados ao vivo pelo dono no nível 76 ("tá perfeito, muito bom"). Bog Raiders
  lure 4: Druida Strong Ice Wave ≥2 · thunderstorm ≥2 · Energy Strike ≥1 + Heal Friend 70 %; Paladino thunderstorm ≥2
  · Ethereal Spear ≥1; Feiticeiro Energy Wave ≥2 · thunderstorm ≥2 · Energy Strike ≥1; Knight Groundshaker ≥2 ·
  Berserk ≥2 · Lesser Front Sweep ≥1. Vampire hell: Strong Ice Wave / Divine Caldera / Energy Wave ≥2 + avalanche ≥2
  nos magos, Knight Berserk ≥2 · Lesser Front Sweep ≥1 — **67k xp/h e +13k/h** (3,5 min; em 29/09 o mapa dava −12k/h).
  Nos dois: **nenhum suporte, nenhuma cura por magia** (só o Sio no Bog) e Mana Potion 30 % nos 4.
- **Por que o Inteligente não chegava nisso**: (1) ele nunca mexe nos suportes/curas do dono (regra) e Train/Protect/
  Enchant Party drenam mana ×3 no simulador; (2) o desempate prefere menos poção; (3) `barraValida` exige uma magia ≥1
  por personagem — no kit de Vampire hell três personagens não têm; (4) sem Scan do mapa o loot é o do catálogo.
- **Kit enxuto** (checkbox na aba Magia, `int_enxuto`, desligado por padrão — desligado nada muda): tira os suportes e
  as curas por magia do dono e devolve a cura por uma **escada** (`escadaEnxuta`): 0 só poções · 1 + Heal Friend 70 % no
  Druida · 2 + Wound Cleansing 50 % no Knight e Divine Healing 40 % no Paladino · 3 o kit completo do dono. Cada
  degrau reserva a mana da cura no simulador (`RESERVA_ENX`). As poções de vida do dono ficam (sem nenhuma: a melhor a
  45 %). Mapa sem medida e sem kit da comunidade começa no 3. Sobe um degrau com alguém < 30 % ou morte; desce um com
  todos ≥ 60 %, só com degrau aplicado pelo helper há ≥ 5 min (a medida é do próprio kit enxuto), ≥ 120 amostras.
  Nada muda sozinho: o degrau novo vale no próximo APLICAR; a aba Magia avisa ao vivo (< 35 %).
- **Kits da comunidade** (`KITS_COMUNIDADE`: 151 Bog Raiders degrau 1, 50 Vampire hell degrau 0) entram na busca como
  party candidata inteira, como o Em área, e a escolha é global — o Inteligente nunca sai pior que eles pela conta
  dele. Fora de `barraValida`; magia que não existe no nível ou slot morto: fica o Em área daquele personagem.
- `kitHashConfig` inclui as curas por magia (degraus 0–2 só mudam as curas: a vida medida tem que ser por degrau).
  A calibração pelo Scan e o A/B (`escolhaDoModelo(…, comoJogou)`) reproduzem a party com os suportes do dono.
  A poção de segurança do Druida (escada antiga, degrau ≥ 2) não vale no enxuto.
- **No node** (nível 67, catálogo): Vampire hell enxuto — o Inteligente empata em xp com o kit do Discord (58,8k; o
  spawn limita) e fica com um mais barato. Bog Raiders — o kit do Discord prevê −33k/h com o loot do catálogo (8,4 o
  por abate) e perde para um de 29k xp/h; ao vivo o mapa rendeu bem mais: **falta um Scan de 5 min com ≥ 100 abates**
  para o loot medido entrar. 7 testes novos em `testes/inteligente.test.js` (251 no total).

## 2.14.1 (02/10) — o pacote inteiro dos kits da comunidade (conta principal, nível 81)
- Dono: "na minha outra conta principal já estou no nível 81 — são essas combinações que estou falando: nossa automação ter
  xp e ouro". Entram em `KITS_COMUNIDADE` três posts de nível 80: **105 Giant Spiders POH**, **49 Pits of Inferno Entrance**
  e **199 Hive Queen Chamber** (degrau 2). Pits de Inferno sem Exori Flam e sem burst arrow (Dragon Lord é imune a fogo).
- Campos novos por kit: `pocao` (número ou {VOC: fração}), `curas`, `vida`, `sups` (os buffs do post — Train Party,
  Sharpshooter, Enchant Party: só o kit da comunidade leva suporte no modo enxuto) e `ammo`. `extrasInt` aplica o pacote
  do post quando o personagem fica com o kit da comunidade (`esc.com`): curas em ordem crescente de gatilho, poção de vida
  do post (se o nível e a vocação permitem), buffs e munição (só se o tipo da arma combina). A marca `com` vai para
  `kit_int` e volta no vigente com os buffs (`supsGuardado`); entra na assinatura (`escSig`).
- Magia que o nível ainda não libera sai do kit (Fierce Berserk é nível 90) e o resto fica.
- Degrau 2 da escada enxuta ganha a Intense Healing 70 % no Feiticeiro (os três posts põem cura nos quatro).
- Simulado no node com o dano medido (nível 80, lure 8): o Inteligente empata ou passa em xp nos três (Giant Spiders
  75,8k = 75,8k; Pits 86,8k × 82,8k; Hive 94,6k × 85,9k). 5 testes novos.

## 2.14.2 (02/10) — ranking do Radar sem os suportes do perfil
- Print do dono (Radar, conta principal): todos os mapas com ouro/h de −167k a −247k e 9–11 combos. Causa, reproduzida no
  node: o motor Inteligente do ranking usava o perfil do dono — o Protector do Knight (200 de mana a cada 20 s) e os buffs de
  grupo (×3) deixam a regeneração útil dele em −4,5 mana/s, então ele bebe 1.000 a 1.400 Mana Potions/h em TODO mapa
  (−57k a −77k/h por mapa só dele). Com o kit enxuto o Yalahar Worker Golem cai para 0/h de gasto.
- O ranking agora roda o Inteligente com `{ enxuto: true, degrauEnx: 2 }` (`RADAR_OPC_INT`): `contextoInt` aceita
  `degrauEnx` para fixar o degrau (mapa nunca caçado não tem medida e a escada cairia no 3 = kit do dono). O cabeçalho do
  ranking diz "kit enxuto, degrau 2"; ranking antigo calculado com os suportes pede recálculo. Sem nada novo enviado ao jogo.
- Lembrete: o ranking simula a lure MÁXIMA de cada mapa; sem Scan o loot é o do catálogo × 0,35 (estimado). Para aplicar o
  mesmo kit no mapa, ligar "kit enxuto" na aba Magia. 1 teste novo (257).

## 2.14.3 (02/10) — Radar: pacote inteiro por mapa e Scan rápido com o kit do ranking
- Dono: "simula todas as melhores combinações de magias e runas, ataque, defesa, suporte, mana e poção … onde eu desse play
  ele fazia um scan bem rápido". O ranking já simulava a party inteira com a lure MÁXIMA de cada mapa; agora cada mapa mostra
  o pacote todo por personagem: magias com o mínimo de criaturas, curas e poção de vida, Mana Potion (%), suportes e munição
  (`extrasInt` → `extrasTxtCru`, guardado em `radar_rank`).
- "▶ medir 3 min" em cada mapa e "▶ Scan rápido dos 10 primeiros" (na ordem e no filtro da tela), 2 toques: é o Scan de
  sempre (devolve mapa, lure e kits no fim), com `scanIniciar(over)` — minutos, lure máximo e o kit do ranking por cima da
  configuração guardada do Scan, que não muda (`scanCfgRodada`). O kit aplicado é o MESMO que o ranking simulou: as opções
  da busca (`RADAR_OPC_INT`) passam por `aplicarEmTodos(modelo, hunt, opcInt)` → `montarPlano(…, { opcInt })` →
  `planejarInteligente(…, opc)` → `partyInt(…, opc)`. O resultado volta ao Radar como "medido · Inteligente".
- 3 min dão o xp/h e os abates/h; para o loot medido entrar na calibração do Inteligente o Scan precisa de ≥ 100 abates
  (Scan normal de 5 min com Em área). 1 teste novo (258).

## 2.14.4 (02/10) — teste ao vivo do Scan rápido do Radar
- Conta u2tag, nível 77 (Playwright, 2.14.3 injetada no início da página com o Tampermonkey desligado): CALCULAR do Radar em
  8 s para 70 mapas, ouro estimado positivo (+10k a +39k/h; antes −700 a −900 com os suportes do perfil). "▶ medir 3 min" em
  Djinns Marid Territory: aplicou nos 4 exatamente o kit mostrado, mediu 46,4k xp/h raw e +13,0k/h estável (estimado 51,6k e
  +17,1k; depois do recálculo, com o Scan novo na calibração, 47,0k e +11,8k), onda de 7 morta em 0,6 s (1 combo), e voltou
  para Dragon Lair (lure 8) com os 4 kits devolvidos.
- Defeito achado: a linha só virava "medido" no próximo CALCULAR. Agora `scanGravar` chama `radarAtualizarLinha` (refaz só a
  linha daquele mapa com a calibração guardada, sem rede).
- 2º Scan rápido (Orc Fortress, 2.14.4 numa aba nova): a linha virou "medido" sozinha (40,0k xp/h, +8,0k/h; estimado
  43,5k e +6,1k). Mas o Feiticeiro e o Druida saíram com "plano vazio" e mediram com o kit de Dragon Lair.

## 2.14.5 (02/10) — o APLICAR do Inteligente não perde a conta no meio
- Causa (reproduzida com o gancho de depuração): o catálogo /ammo é baixado na 1ª vez que alguém escolhe munição
  (`extrasInt` do Paladino, dentro do próprio APLICAR); quando ele chegava, `montarPlano` via "catálogo novo" e limpava
  `_intParty`; o Feiticeiro e o Druida pediam o kit sem poder calcular (`buscar` falso) e recebiam nada.
- Correções: (1) `_aplicarEmTodos` passa a party já calculada (`resInt`) para os 4 — eles saem da mesma conta que vai para
  `registrarAplicacaoInt`; (2) só magias, preços, poções e bosses derrubam a conta do Inteligente; munição só limpa o cache
  dos modelos antigos. 1 teste novo (259).

## 2.14.6 (02/10) — Radar: risco pelo que a party já aguentou
- Dono, 02/10: "acabei de morrer … a simulação me jogou para mapas muito difíceis" (conta principal, nível 81, escolheu um
  mapa do topo do Radar). Conferido na u2tag (nível 77): os 70 mapas saíam "risco baixo, 0 pontos" — Hellspawns e Yalahar
  Worker Golem (nível 70) inclusive. O dano tomado era estimado pelo xp por abate, que quase não muda (Orc 26, Vampire 33,
  Dragon 38, Hellspawn 41,5); a vida do monstro separa (234 · 577 · 1.282 · 1.520).
- `tpEnvelope`: o mapa mais forte em que a party já caçou sem morrer (Scans sem erro com o Knight ≥ 40 %, sessões do
  Analisador de ≥ 10 min, a caçada de agora com ≥ 10 min; mapa com morte registrada fica fora). `tpRisco`: vida do monstro
  > 1,15× a do envelope +2, > 1,5× +4; nível mínimo acima do maior já caçado +2; sem nada caçado +2 ("força desconhecida").
  Mapa medido limpo conta como testado. Etiqueta "⚠ nunca testado" na linha.
- Scan rápido e "▶ medir" nunca entram em mapa de risco alto; ranking calculado antes da 2.14.6 (risco antigo) pede
  recalcular e não deixa o Scan rápido rodar. "Esconder risco alto" vem ligado por padrão. 1 teste novo (260).

## 2.13.7 (04/10) — update 1.1.0 do jogo: assets em versão nova
- Patch 1.1.0 (4 ilhas novas no NPC Silas, hunts novas em Tibidle Island e Pits of Inferno, marcos do bestiário de
  Quara's Domain Yalahar, Energy Ring fora da Thunderscar Peak, equipamentos que vinham como "Tools").
- **Quebrava o helper**: os assets foram de `/assets/v167/` para `/assets/v170/` e o código pedia v167 fixo —
  `imbuements.json` e `items-by-name.json` davam 404. Efeitos: o "nunca vender" do Auto Hunt não montava (o ciclo
  parava sem vender e desligava), o Equip não achava os ids dos itens, a calculadora de imbuement e o
  `spell-areas.json` (v100, já 404) ficavam sem dado.
- Agora `buscarAsset(arquivo)` tenta as versões em ordem: a que a página do jogo está usando (recursos já carregados),
  a dos catálogos (cena dos bosses, atlas das hunts), a última que funcionou e `v170`; guarda a que responder.
- Versão nova detectada → `novaVersaoDoJogo`: catálogos rebaixados no próximo boot (hunts novas), ficha dos itens
  (`equip_base`) e tabelas de loot do Radar recomeçam. Só leitura.
- Hunts e marcos do bestiário vêm da API (`/hunts/select`), nada fixo no código; o catálogo também se renova a cada 24 h
  e no botão de rebaixar do Status.

## 2.14.7 (04/10) — merge: 2.13.7 (assets em versão dinâmica) + 2.14.0–2.14.6 (kit enxuto, kits da comunidade, Radar)
- A 2.13.7 foi feita no GitHub (sessão web) a partir da 2.13.6, em paralelo às 2.14.x locais. O merge só conflitou nas
  duas linhas de versão e nesta seção do histórico; `buscarAsset` / `novaVersaoDoJogo` entraram inteiros e nenhum
  código da 2.14 ainda pedia `/assets/v167/` fixo (o único "v167" restante é o comentário que explica o 404).
- Conferido depois do merge: `node --check`, 260 testes em node, ESLint com 0 erros. Nada de comportamento novo além da
  soma das duas linhas.

## Teste ao vivo 04/10 (2.14.7, conta u2tag nível 83) — roteiro da 2.13.7
- Resultado completo em `docs/resultado-2.13.7.md`. Passou: catálogos 109 hunts, Equip (127 peças, items-by-name), calculadora
  de imbuement (14), Thunderscar sem Energy Ring, Radar 109 mapas em 14 s, Scan 5 min Em área em Vampire hell
  (**74,7k xp/h raw 69,1k · +24,7k ouro/h · 2.074 abates/h**), presets devolvidos iguais ao backup, Inteligente "✓ calibrado"
  com onda limpa em 0,3 s (1 combo). Não feito: Venda rápida com material (mochila sem material), Scan A/B.
- **O jogo já está em `/assets/v185/`** (não v170). v170 ainda serve items-by-name (9.074 itens; v185 tem 9.168) e
  spell-areas, mas `v170/imbuements.json` já é 404. A versão muda a cada poucos dias e as velhas ficam no ar um tempo.
- **Defeito**: no boot `buscarAsset` não tem como saber a versão (performance vazia, `CAT.bosses` ainda não baixado) e
  pega a conhecida v170; o Equip depois acha v185 e `novaVersaoDoJogo` dispara um rebaixamento falso. Só os bosses
  (`scene`) trazem `/assets/vN/`; as hunts do `/hunts/select` não têm `atlas`.
- **Defeito**: o shell do jogo tem `unlockedIslands` (u2tag: só `yalahar`); o helper ignora, e o Radar mostra mapas de
  Zao, Gray Island, Pits of Inferno e das ilhas novas (Forgotten Knowledge, Otherworld, The Inquisition, Warzone) como
  "risco médio/alto" em vez de bloqueado.
- Calibração do Radar/Inteligente só aceita Scans no nível ±2 (`tpCalibrar`): subir de 77 para 83 zerou os 6 Scans.
- Itens do jogo trazem `forja: {fonte, raridade, potenciaBase, refino, atributos[{id, valor}]}` (ex.: crystal ring raro,
  potência 152, resist_energia 1,1). O helper lê `forja` mas **não usa `potenciaBase` em nada** (0 ocorrências).

## Vídeos 04/10 — o que dá para aproveitar (Storming "Como a galera tem farmado" 13 min · TV de Souza "Guia de itens e forja" 46 min)
- **Potência** (criador do jogo): drop de caçada vem com 0–350, elite 50–420, boss 250+. Cada refino +1 = **+50 de
  potência**. Faixas a cada 200 (1–199, 200–399, 400–599, 600–799, 800+ "colossal", 1.000 "godlike") e cada faixa
  sobe o teto das linhas (ML/distância/corpo a corpo: faixa 1 → +1, faixa 2 → +1–2, faixa 3 → +1–3). Itens de 800+
  valem muito no mercado (Hive Bow +8 lendário, Magic Sword +6). **Ideia 1 (Equip)**: mostrar a potência e a faixa nas
  "bases de forja" e nunca mandar para venda/desmanche peça com potência ≥ 300 e linha útil (ML, distância, melee).
- **Ordem na forja** (os dois): refino primeiro (arma ganha ataque, armadura ganha defesa, varinha/rod só ganha
  potência), raridade depois (só dá linhas), atributos por último; Garantia a partir do +4 (erro cai um nível).
  Gema de limpeza T1 apaga todas as linhas; "refazer T1" rerrola os valores de todas; outra rerrola só a última.
  Gema = 100 fragmentos + ouro **lastreado no preço médio da coin nas últimas 6 h**. **Ideia 2 (Progresso → Forja)**:
  a calculadora de refino já existe; faltam a potência-alvo (quantos refinos até a próxima faixa) e o preço da gema
  pela coin.
- **Desmanche** (criador): item selado deixado no auto-sell perde a chance de purificar e **desmanchar em fragmentos**
  (12 fragmentos de um lote). O Auto Hunt já purifica tudo; **Ideia 3**: no ciclo de venda, oferecer "desmanchar o que
  é Comum sem linha boa" em vez de vender no NPC — depende de achar o comando de desmanche no socket (ainda não mapeado).
- **Invasão (NPC Ravena)**: inscrever todo dia dá raid tokens mesmo em posição ruim; tokens → fragmentos (100 por
  troca) vendidos a ~2k no mercado = ~200k "de graça". **Ideia 4 (Alertas/Dia)**: lembrete só leitura "ainda não se
  inscreveu na invasão de hoje" (o helper já conhece `invasao-modal`, §13).
- **Prey/Wild cards** (TV de Souza): rerrolar os grátis todo dia até os 4 terem buff de dano, travar os 4 e aí caçar
  por horas o mapa do item (Water Elementals nível 50 → Heroic Axe). **Ideia 5 (Progresso → Prey)**: marcar quando
  os 4 estão com dano e sugerir travar; avisar quando o buff expira.
- **Itemização por fase**: Knight = armadura e arma de maior dano (Spike Sword 10k → Knight Axe 2k → Heroic Axe
  (Water Elementals) → Onyx Flail (boss Worker Golem) → Magic Sword (boss Hero Fortress) → **Stonecutter 50 base**);
  Paladino = Paladin Armor (Bog Raiders, Gear Wheel vende 100k) → Hive Bow (boss GS) → Mycological Bow (boss Zao);
  magos = mana regen cedo, depois **tudo que der ML** (Hat of the Mad, colar de Gargoyles Meriana, Snakebite Rod de
  Djinns com ML+1 e potência ≥ 300 → +3 de refino → rerrolar para ML+2). Itens de plasma (+3 skill, temporários).
  Guardar Stone Skin Amulet (PvP futuro) e itens de movement speed. **Ideia 6**: conferir se `PESOS_EQUIP` dá peso a
  mana regen nos magos/Paladino e a ML acima de tudo nos magos.
- **Setup do TV de Souza em Dragon Lords (POI, 100k xp/h, +45k/h)**: Knight Berserk ≥3 · Front Sweep ≥1, sem mana pot;
  Paladino Divine Caldera ≥3 · avalanche ≥2 · burst arrow, poção 50 %; Feiticeiro Energy Wave ≥3 · avalanche ≥1 ·
  Enchant Party, curas 50/70/85; Druida Strong Ice Wave ≥3 · avalanche ≥1, mana pot 34 % ("a cura do Druida segura o
  Knight de beber poção"). Candidato a `KITS_COMUNIDADE` para a conta principal (hunt 49, nível 100).
- **Boss (invasão)**: mago na borda do alcance da SD, Ultimate Strike + Energy Wave, Thunderstorm na runa; buffs pagos
  de slow e do elemento do boss. Coin tende a subir no fim de semana; o TV de Souza compra coins com 30 % do lucro de
  cada caçada.
- Eventos mensais (50 % de skill no treino; double treino sexta–domingo). Venda de itens por coin dentro do jogo "em breve".

## 2.14.8 (04/10) — versão dos assets pelo jogo, ilha fechada é "bloqueado", potência vale como base de forja
- **Assets**: `ASSETS_CONHECIDA` = v185. Só uma versão **mais nova** que a guardada conta como patch (`numAssets`); uma
  velha que ainda responde não rebaixa nada nem dispara "jogo atualizado". No `carregarCatalogos` os bosses vêm antes do
  `spell-areas.json` (a cena deles é a única pista de versão do catálogo; no boot a página ainda não carregou recurso
  nenhum). Último recurso: a versão anterior ao patch (`assets_ver_antes`) e a v170 — um arquivo que some da versão nova
  pode seguir na velha. 3 testes no `fumaca.test.js` (boot com a velha no ar; velha não rebaixa; patch de verdade avisa).
- **Radar**: `tpEstimar` recebe `ilhas` (shell `unlockedIslands`, via `ilhasDestravadas()`); hunt de ilha fora da lista
  (menos `tibidle_island`) sai `bloqueio = 'ilha fechada'`, risco bloqueado com o motivo "ilha X não destravada nesta
  conta (as ilhas abrem no NPC Silas)", etiqueta na linha, fora do Scan rápido e do "esconder". Lista desconhecida (shell
  não lido) não bloqueia, como o premium desconhecido. Nível mínimo vem antes da ilha. 1 teste em `telas-api`.
- **Equip**: `baseDeForja` também aceita potência ≥ 300 (`POTENCIA_BASE_FORJA`) com encaixe de ML, distância ou corpo
  a corpo (`SKILL_FORJA`) — a peça "ruim" que a forja transforma (TV de Souza: Snakebite Rod ML+1 300+ → +3 → ML+2/+3).
  As listas de bases e de sobras mostram a potência. 1 teste em `equip.test.js`. Total 265.

## 2.14.9 (04/10) — desmanche por botão no Equip, lembrete da invasão e aviso do prey (as três ideias dos vídeos)
- **Desmanche** (Equip, botão "DESMANCHAR (N)", 2 toques, só na cidade): manda para a Forja as sobras que o NPC não
  compra — Incomum ou melhor, ou refinada (`vendivelNpc` falso), da mochila ou do depósito, nunca do corpo
  (`pecasDesmanche(res)` → `[{iid, origem:'bag'|'depot', nome}]`). Comando mapeado no cliente do jogo:
  `forge_salvage_batch {requestId, alvos:[{iid, origem}]}` → `forge_salvage_batch_result {requestId, iids, …}` (o jogo
  também tem `forge_salvage {iid, origem}` unitário, `forge_quote`, `forge_refine`, `forge_rarity`, `forge_attr`,
  `forge_craft`, `forge_lastro`, `forge_simulate`; erros `invalid_forge`, `insufficient_item`). Lotes de 10 pelo
  `mkPedir` (casa a resposta pelo requestId e respeita o ritmo do Mercado); erro num lote para tudo; depois relê o Equip.
  Nada automático: o Auto Hunt continua vendendo só Comum sem refino no NPC.
- **Invasão** (Progresso, só leitura): o ícone da cidade diz tudo — `[data-testid=invasao-icone][data-estado]`
  (sem_invasao · abertas · inscrito · preparando · rodando · rodando_assistir · encerrada), `invasao-icone-topo`
  `[data-topo]` (nao · inscrito · convite) e `invasao-icone-contagem`. `pgAvisoInvasao` → aviso "você ainda não se
  inscreveu" (abertas, ou preparando sem inscrição) em todas as sub-abas e no Log 1× por dia; "inscrito · janela em X"
  só na sub-aba Chaves. Comandos do jogo (não usados): `invasion_today {}` → `invasion_today_data`, `invasion_join
  {requestId}`, `invasion_leave`, `invasion_windows`, `invasion_ranking`, `invasion_watch {windowId, sinceMs}`,
  `invasion_buff_buy {buffId}`, `raid_shop_buy`.
- **Prey** (`pgAlertaPrey`): os 4 com DANO → "trave X, Y (🔒) e cace o mapa do item por horas"; buff vencendo em < 30 min
  sem trava → aviso com o custo em wildcard. Na sub-aba Prey e, se for aviso, em todas; no Log 1× por estado.
- Ao vivo (u2tag): "✓ Invasão: inscrito · janela em 02:23", prey "os 4 com DANO — trave Cavaleiro, Paladino, Feiticeiro,
  Druida", DESMANCHAR (58). 3 testes novos (268).
- **Desmanche exige o personagem ao lado da Forja**: o 1º envio voltou `too_far` (erro tratado: nada destruído, Log e
  aviso na aba). Depois de NAVEGAÇÃO › UZGOD (Forja) no jogo (ele anda até lá e abre `window-forja`; posição 34,33 →
  27,35), o mesmo botão desmanchou 1 leather boots Incomum (potência 1): "1 de 1 peça(s) viraram fragmento", peça
  sumiu do depósito. O helper não anda pelo personagem (`city_move` existe no jogo, não usado): o aviso diz para
  abrir a Forja e tocar de novo. Outros erros do jogo: `not_in_city`, `insufficient_item`, `invalid_forge`.

## 2.14.10 (04/10) — plano de forja por peça nas "bases de forja" do Equip
- Dono: "não sei usar a forja — me indica o que devo fazer, quais atributos encontrar, detalhadamente". Cada base de
  forja ganhou um `<details>` "plano de forja · vocação · faixa N → N+1 em K refinos" com: para quem (e o que essa
  vocação veste hoje, em pt), potência atual (= base + 50 × refino) e faixa, refinos até a próxima faixa com o custo
  esperado em gemas e ouro (`pgRefino`), as 4 linhas que mais valem naquele espaço para aquela vocação (peso do Equip ×
  valor típico da faixa-alvo), as linhas de hoje marcadas ✓/✗ e os passos em ordem: refino → raridade → linhas
  (Atributo T1; Limpeza T2 apaga só a última; Limpeza T1 tudo) → valores (Refazer T1/T2) → Bancada de Testes.
  Glossário "? como a Forja funciona" com as 11 gemas do cliente (04/10): Refino T1/T2, Garantia T1, Raridade T1/T2,
  Atributo T1, Limpeza T1/T2, Refazer T1/T2, Ordem T2.
- `planoForja(peca, vocs, ctx, porVoc)` e `faixaPotencia(pot)` no bloco EQUIP-PURO. Regras usadas: faixas I–VI a cada
  200 (1–199 … 1000+); encaixes = raridade (Comum 0 … Lendário 4, Mítico 5); grupos de ataque (arma, colar) e defesa
  (o resto); valores típicos por faixa regen 1,1→5,2 · skill +1→+3 · dano 1,2→9,8 % (wiki), o resto nominal só para
  ordenar; a vocação escolhida é a que mais ganha com a melhor linha possível. 1 teste (269).

## 04/10, fechamento — tudo que faltava testado (ver `docs/resultado-2.13.7.md`, seção "Fechamento")
- Patch v170 → v185 forçado: aviso certo no 1º asset pedido. Invasão "não inscrito" simulada no DOM: aviso + Log 1×/dia.
  Desmanche de 2 peças num lote ok. Linha "cura X/h" não é defeito (Scan sem poção de vida). Venda rápida com material
  impossível: a conta não tem material de imbuement. Scan A/B: Em área 65,9k xp/h raw (real 71,2k) · +19,7k ouro/h estável (3 raros em 4 min: sorte +23,8k) · 1.964 abates/h × Inteligente 62,0k raw (real 66,9k) · +5,2k estável · 1.870 abates/h · tomou 1.410/h. **Inteligente perdeu por 6 % em xp (critério: ≥ Em área −3 %) e muito em ouro.** Ele previu 70,2k para o próprio kit (o preset do dono, 1 magia por personagem) e mediu 62,0k; depois do A/B continuou em "mantém (menos de 10 min desde o APLICAR)" com os mesmos 70,2k. DEFEITO a tratar: no nível 83 em Vampire hell o modelo superestima o kit mínimo (~13 %) e a histerese segura a troca. Kits devolvidos e party na cidade no fim. Alertas: CONFERIR só roda fora de Scan ("alertas não conferidos — Scan em andamento", correto). Depois: "Wild Honey: vale anunciar — menor anúncio 951 (267 % acima da média 30 d)" — o anúncio de 951 não é da u2tag (REVISAR: 55 ordens abertas, nenhuma de Wild Honey), então o pendente "item que só você anuncia" segue sem caso para testar. Achado colateral: a u2tag tem ordens abertas de leather boots INCOMUM a 2.299 — Incomum anuncia no Mercado, ao contrário do que a nota das sobras diz; antes de DESMANCHAR, vale olhar o Mercado.
- Teste de fumaça novo (lembretes de prey e invasão no vm): 270 testes.

## 2.14.11 (04/10) — a medida vale mais que a simulação; desmanche respeita o Mercado
- **Inteligente**: Scan A/B em Vampire hell (nível 83) — o modelo previu 70,2k xp/h para o kit mínimo (o preset do dono, 1
  magia por personagem), mediu 62,0k; o Em área mediu 65,9k; e o Inteligente seguia no kit mínimo porque a calibração só
  lê Scans de OUTROS modelos. Agora `medidasPorKitInt(hunt)` lê todo Scan Inteligente limpo do mapa (nível ±2, ≥ 2 min)
  e identifica o kit pelas magias e runas lançadas (`sigNomesScan` ↔ `sigNomesInt`); em `avaliarPartyInt`, kit medido
  ABAIXO do previsto sai com xp, abates e receita × f (custo fica; `met.medido = {xpRawH, previsto, f}`), só para baixo.
  A busca passa a preferir outro kit e a histerese compara contra o medido. Entra no carimbo do contexto. Na tela:
  "este kit foi MEDIDO aqui: X (previsto Y)" ou "o kit aplicado foi medido a X: por isso a troca". 1 teste.
- **Desmanche × Mercado**: Incomum anuncia no Mercado (u2tag: leather boots Incomum a 2.299 em ordem aberta). `pecasDesmanche
  (res, temNegocio, incluir)`: peça cujo nome teve negócio em 30 dias no catálogo do Mercado (`MK.catalogo[].trades30d`) fica
  fora, a não ser pela checkbox "incluir as que têm negócio no Mercado" (`desm_incluir_mercado`). Sem o Mercado lido, a aba
  avisa. Nota das sobras corrigida. 1 teste (272).
- Ao vivo: Vampire hell, nível 83: antes "mantém o kit aplicado" prevendo 70,2k; agora "TROCAR: o novo é melhor (+11,5 %)" para o kit medido a 69,1k (Berserk · Divine Caldera · Energy Wave + Rage of the Skies · Strong Ice Wave — o que o Em área de 5 min de fato lançou), com a linha "este kit foi MEDIDO aqui: 69,1k (previsto 70,2k)"; o aplicado aparece medido a 62,0k. Três brechas fechadas no caminho: (1) o modelo contornava a medida exata trocando uma magia (Ice Wave) — kit não medido herda a medida do kit medido que a simulação põe logo acima dele (`tetoDe`), ou 99 % do melhor medido se a simulação o põe acima de todos; (2) o previsto de cada kit medido vem do kit REAL (vigente, Em área ou outro modelo), não da reconstrução pelos nomes; (3) a assinatura ignora runas e casa por inclusão com até 1 magia por personagem sem lançamento (Front Sweep ≥2 e Eternal Winter ≥2 não saíram em 5 min). Equip: DESMANCHAR (0) com 49 peças com negócio no Mercado fora, checkbox para incluir.
- Venda rápida com material (20:48, 84 metal spike na mochila): "nunca vender: metal spike (material de imbuement) — total 51.375 → 24.495", vendido 24.495, depot 111/300, cidade. O último item do roteiro da 2.13.7 fechou.

## 2.14.12 (06/10) — o encaixe faz o preço; vendidos em "Meus anúncios"
- **Defeito (dono, 06/10: "vc tá vendendo meus itens muito abaixo do mercado… itens com status têm mais valor")**: a regra
  "mesmo corte" do Mercado comparava só raridade e refino. Ao vivo, dark armor Incomum +0: cópias com regen. de mana de
  250 a 500 mil (Netonesz 250k pot 306, Lordtui 280k pot 59, Oteug 300k, goblog kapeta 450k pot 46, Sangria 500k); com
  resistência, de 8.999 (RexNFTYT, regen vida 1,7) a 94 mil. O helper tinha posto 32 cópias da u2tag a 9.999 — regen vida
  2,0 pot 338 e tudo o mais no mesmo preço; a Dark Armor regen mana 1,3 da mochila ia sair a 8.998.
- `mkMesmoCorte(minha, outra)` agora exige também os MESMOS atributos (ids normalizados como no `normForja`, em qualquer
  ordem; o valor não entra). Anúncio sem a lista de atributos só casa com peça sem atributos. `mkMesmoCorteSemEncaixe` é a
  regra antiga e só serve à nota: sem cópia igual à venda, "nenhuma cópia incomum +0 com regen mana 1,3 à venda — digite o
  preço (outros encaixes incomum +0: de 8.999 a 450.000)". A linha ganha `encaixe` ("regen mana 1,3") e a tela mostra o
  encaixe e a potência ao lado do corte; a origem diz "menor −1 (outro com o mesmo encaixe a 250.000)".
- Revisão: `menor` só conta cópias com o mesmo encaixe; `folga` = quanto a SUA ordem está abaixo dele (tela: "o seu está
  85.001 ABAIXO — cancele e anuncie de novo se quiser"). Nada é refeito sozinho.
- **Vendidos** (dono: "para eu saber quais itens foram vendidos que eu anunciei"): `market_my_orders` só traz OPEN; a ordem
  vendida some. Lido do cliente em 06/10: `market_history {page, type?: created|buy|sell|cancelled|expired, period?:
  all|24h|7d|30d, item?}` → `{query, entries:[{id, type, side, asset, itemName, quantity, unitPrice, total, fee, at}],
  pageSize, total}` (há também `market_statement {page?}` → `{entries, page}`, não usado). REVISAR lê `type:'sell',
  period:'30d'` página a página (`mkLerVendas`, ≤ 10 páginas) e `mkVendas(entries, agora, periodoMs?)` agrupa por item e
  preço, o mais recente primeiro; seção "Vendidos nos últimos 30 dias" em Meus anúncios (sem a forja: o histórico só traz o
  nome). 3 testes novos (275).

## 2.14.13 (06/10) — o relógio do livro-razão para quando a caçada para
- Pedido do dono: "vê a análise do inventário com o corpo do personagem, tá tudo certo?". Conferido ao vivo (nível 91,
  Petrified Hollow): nenhuma troca sugerida nos 4 e a lista bate com o corpo (tudo que veste tem regen. de mana maior que
  o do depósito/mochila; a dark armor regen. de mana 1,3 da mochila é reserva; 4 bases de forja; 17 sobras).
- Defeito achado: `razaoResumo` media `seg = agora − t0` mesmo depois do `ended`. Na cidade, 9 min após o fim, o dano/s
  da party saía 18,5 (real 727) e `partyMedida` ("caçada atual") alimentava o Equip com esse número: regen. de mana 2,3
  valia 175 pt no Feiticeiro (= 175 % do dano da party), o "−42,7 pt" das sobras e os pesos do bestiário (pesosBestiario)
  inflavam ~40×. O ranking entre peças não mudou (regen. de mana × regen. de mana), mas a nota, as conversões em ouro/h e o
  valor dos marcos de regen. de mana no "Completar marcos" estavam errados.
- Correção: `razaoNovo` ganha `tFim` (gravado no `ended`) e `tUlt` (último frame, em `razaoVitais`); `razaoFim(L)` = tFim,
  ou tUlt se o frame parou há > 5 s (queda de conexão), ou agora. `partyMedida` diz "última caçada" fora da caçada.

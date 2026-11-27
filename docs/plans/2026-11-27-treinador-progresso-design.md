# Aba Progresso — o treinador (2.67) · desenho

Data: 27/11/2026 · pedido do dono: "uma aba que me ajude mesmo, estou estagnado; a ideia de um jogador profissional de Tibidle".

## Decisões do dono (27/11)

| Pergunta | Escolha |
|---|---|
| Como os "agentes" funcionam | **Especialistas embutidos**: regras de jogador profissional compiladas agora (wiki, comunidade, o que o projeto mediu) + dados ao vivo da conta. Nada sai do navegador. |
| O que acontece com as abas | O ícone ▤ **Analisador vira "Progresso" (o treinador)**. O ⚑ Progresso antigo (Bestiário, Invasão, Offline, Prey) continua, renomeado **"Rotina"**. A tela do Analisador sai (a coleta de sessões continua: Radar e Bestiário usam). |
| O que o treinador otimiza | **Subir de nível rápido.** Ouro só precisa pagar a caçada e financiar equipamento/forja. |
| Só aconselha ou executa | **Executa por botão** (2 toques no que custa ouro). "O treinador pode fazer tudo": não herda as travas de "só leitura" das outras abas. |
| Abordagem | **A**: especialistas por regras + roteiro por faixa de nível como base de conhecimento; reaproveita os cálculos que o helper já tem. |

## O que o jogo mostrou (27/11)

- Ranking de nível (`/leaderboard`, público, 200 contas): u2tag **178º** (nível 250; melee 64, dist 68, ML 56/62). Top: 484 (SDNunoh).
- Dos 80 primeiros, 9 mostram o equipamento (`player_profile`): nível 297–386 usam quase o mesmo set (Zaoan helmet, exotic legs,
  guardian boots, magma nos magos, crystal ring/Royal Signet, stonecutter/axe of destruction no Knight). **A diferença é nível e skill
  (melee 66–79), não item raro.** Retrato em `data/top-perfis-27-11.json`.
- Wiki (79 páginas em `data/wiki-27-11/`): bônus de XP somam (party +100 %, Premium +10 %, Boost +50 %, Prey EXP até +10 %/coluna,
  Selo "Abundante" até +20 %); **Legado** (+2/+5/+9/+14/+20… % de dano a cada 5 de skill TREINADA; ampulhetas treinam durante a caçada,
  até 8 h/dia por vocação); ilhas Issavi 10 M, Marapur 10 M + 10 Spectral Conch, Dream Courts 15 M + 10 Haunted Sigil; Hunts Dinâmicas
  (280+); boss/loja de tokens = base de forja 400+; bênçãos 20.000 + 75×(nível−120) cada; morte custa ~1,3 % da XP total com bênção.

## Arquitetura

```
┌──────────── @@TREINADOR (DOM, rede, botões) ───────────┐
│ trFoto()  ← ESTADO_WS, CAT, sessoes, scan_resultados,  │
│             radar_rank, PROG, EQUIP.res, FJ.rank, MK,  │
│             /leaderboard (6 h), player_profile (24 h), │
│             /islands (24 h)                            │
│      │ foto (objeto simples, sem DOM)                  │
│      ▼                                                 │
│ ┌──── @@TREINADOR-PURO (testável no node) ─────────┐   │
│ │ TR_BASE (conhecimento compilado, com fonte/data) │   │
│ │ especialistas: f(foto, TR_BASE) → conselhos[]    │   │
│ │ chefe: trOrdenar(conselhos) → 3 próximos passos  │   │
│ └──────────────────────────────────────────────────┘   │
│      ▼                                                 │
│ telaTreinador() + ligarTreinador() → botões "Fazer"    │
│   que chamam as ações que já existem (ou novas)        │
└────────────────────────────────────────────────────────┘
```

- **Conselho** = `{ id, agente, titulo, porque, numeros, impacto, confianca, custo, acao }`.
  - `impacto` em uma moeda só: **% de XP/h ganho** (ou horas de upar poupadas por semana para o que não é XP/h, ex.: morte evitada).
  - `confianca`: `medido` (dado da conta) > `comunidade` (post com número) > `wiki` > `estimado`.
  - `acao`: `{ tipo, rotulo, custoOuro, doisToques }` ou nulo (só texto).
- O **chefe** ordena por `impacto × peso(confiança)`, corta o que a conta não pode pagar e mostra os **3 próximos passos** no topo.
  Abaixo, um cartão por especialista (✓ em dia · ⚠ atenção · ✗ errando), cada um com no máximo 3 conselhos curtos.

## Os especialistas

| # | Agente | Pergunta que responde | Fontes principais |
|---|---|---|---|
| 1 | **Onde upar** | Estou no mapa certo para o meu nível? Qual sobe mais rápido (medido > comunidade > estimado)? Lure certa? Vale abrir ilha? | `radar_rank`, `scan_resultados`, `sessoes`, `tpOrdenar`, SETUPS_DISCORD, TR_BASE.faixas/ilhas |
| 2 | **Multiplicadores** | Premium, Boost, Prey EXP nas 4 colunas (tier, trava), Selo Abundante, bênçãos compradas | ESTADO_WS (premium, prey via PROG.prey), TR_BASE.xp |
| 3 | **Treino e Legado** | Quanto falta para o próximo marco de Legado de cada vocação; ampulhetas do dia usadas; custo × ganho de dano | `ESTADO_WS.sk`, `legadoDaConta`, TR_BASE.legado |
| 4 | **Set × topo do rank** | O que os jogadores 30–150 níveis acima vestem por vocação/slot e eu não; skills × topo | `/leaderboard`, `player_profile`, `EQUIP.res`, `mlChecklist` |
| 5 | **Onde estou errando** | Mortes recentes e causa, mapa com prejuízo, slot vazio, imbuement livre, checklist "ficar forte" falhando, munição/elemento errado, prey parada, mochila de chaves cheia | `ESTADO_WS.ultimoEnded`, `sessoes`, `mlChecklist`, `pgAlertaPrey`, `pgAvisoChaves` |
| 6 | **Boss e Elite** | Tenho chaves/tentativas paradas? A party aguenta o boss (Rec × nível, DPS medido)? O drop me serve (base 400+, peça do topo)? Invasão inscrita hoje? | `PROG.chaves`, depósito, `CAT.bosses`, TR_BASE.bosses, `INV` |
| 7 | **Bestiário** | Marcos abertos de ML/Ataque/skill/regen em mapas com XP parecida ao atual; horas para fechar | `pgLinhasBestiario`, `pgPlanoBestiario`, TR_BASE.bestiario |
| 8 | **Caçar itens** | O que falta para o próximo passo (Conch, Sigil, Spark, Voucher, tokens de boss): onde cai, chance, preço no Mercado → comprar ou caçar | TR_BASE.materiais, `MK` (preço) |
| 9 | **Forja e refino** | Peças vestidas abaixo de +4 (barato e seguro), bases 400+ paradas, próximo passo da Forja | `EQUIP.res`, `pgRefino`, último `FJ.rank`, `fjProximoPasso` |
| 10 | **Dinheiro** | Quanto posso gastar sem parar de caçar (reserva = 1 h de supply + bênçãos) e onde cada milhão rende mais XP | ouro normal, `sessoes` (gasto/h), conselhos dos outros com `custo` |

Os 10 rodam em < 50 ms juntos (funções puras sobre a foto). Nada de simulação pesada: o treinador **lê** o último resultado do
Radar, da Forja e do Equip; se estiver velho (> 24 h), o conselho diz "recalcular" e o botão chama a função da outra aba.

## Ações ("Fazer")

| Ação | Como | Já existe? |
|---|---|---|
| Ir para o mapa + aplicar setup | `scanIrPara(id)` (trava, boss, socket) | sim |
| Comprar peça do Mercado | `mlComprar(o)` (Premium, 2 toques) | sim |
| Refinar / forjar | `fjForjar` (cidade, orçamento) | sim |
| Equipar a melhor | `equiparTrocas` (cidade) | sim |
| Completar bestiário | `bestIniciar` | sim |
| Medir mapas | `radarScanRapido(ids)` | sim |
| Sortear/trancar prey, comprar bênçãos, usar ampulheta, abrir ilha, comprar tentativa de boss | protocolo a descobrir no bundle do jogo (sem logar) | **não** — se o protocolo não sair limpo, o botão abre a tela do jogo no lugar certo |

Toda ação: confere o estado na hora (cidade/caçada, ouro), pede 2 toques quando custa ouro, escreve no Log o que fez.

## Desempenho e 3 contas

- Calcula só com a aba aberta: ao abrir, ao tocar "Atualizar" e a cada 60 s (não a cada frame). Repinta pelo `renderizar` existente.
- Rede: `/leaderboard` 1×/6 h; `player_profile` 1×/24 h, até 25 perfis, 1 por segundo, só quando o especialista 4 pede; Mercado
  pela fila `mkPedir` (já espaça 3,5 s). Nada de rede no carregamento da página.
- Tudo por conta (`ler`/`guardar` já separam pela `/auth/me`); TR_BASE e o retrato do topo ficam no armazenamento comum (`guardarComum`).
- Orçamento de armazenamento: foto do topo ≤ 40 KB comprimida em campos curtos.

## Tela

- Topo: **3 próximos passos** (título curto, ganho em XP/h ou horas, custo, botão Fazer).
- Linha de situação: nível, posição no rank, XP/h atual × faixa do topo no mesmo nível, ouro livre.
- 10 cartões recolhíveis (estado ✓/⚠/✗ no título), conselho em 1 linha, "por quê" atrás de `?` (o dono rejeita texto grande).
- Rodapé: idade dos dados (Radar, Forja, topo) com "Atualizar".

## Testes

- `testes/treinador.test.js` (node puro): fixtures `testes/fixtures/treinador-*.json` com fotos das 3 contas (u2tag 250, ShamanBr ~216,
  XundaBr ~121) + casos de borda (sem welcome, dados velhos, sem ouro). Cada especialista: liga/desliga certo, números, ordem do chefe.
- Ao vivo (Playwright, aba limpa no fim): abrir a aba nas 3 situações (cidade, caçando, sem socket), medir tempo de desenho (< 100 ms),
  apertar 1 ação barata de cada tipo, conferir o Log. As outras 2 contas: fixtures + o dono abre no Chrome dele.

## Fora do escopo (YAGNI)

IA externa/API; executar sozinho sem botão; mexer nas regras das outras abas; repor a tela do Analisador.

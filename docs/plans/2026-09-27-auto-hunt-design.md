# Auto Hunt + Status — desenho aprovado (2026-09-27)

Helper 1.9.0. Duas telas novas no `tibidle-helper.user.js`, no estilo do
Stonegy Helper v2.41 (prints do dono): **Status** e **Auto Hunt**.
Objetivo: quando a mochila chega no limite, encerrar a caçada, purificar,
vender no NPC, guardar o resto no depot e voltar para a hunt memorizada.

Contexto que motiva: o Auto Selling 18h/dia (190 coins, 29/08) vence por
volta de 28/09. Depois disso volta a 6h/dia e a mochila enche de novo
(~140 oz/h medido no nível 42; mais no 61).

## Decisões do dono (perguntas de 27/09)

| pergunta | resposta |
|---|---|
| O que fazer ao bater no limite | ciclo completo: **Finalizar → Purificar todos (botão direito no selado) → Vender no NPC o que der → Depot guardar tudo → Voltar para a hunt memorizada** |
| "Purificar todos" custa? | grátis, sem confirmação |
| Venda no NPC | **vender tudo que o painel marcar** (sem lista de exclusão) |
| Lure ao voltar | **não** restaurar; fica como o jogo põe |
| Modelo de magia ao voltar | nada (regra de 22/09: slots só por botão) |

## Abordagem escolhida

**B — função assíncrona sequencial `cicloDeVenda()`**, no mesmo estilo de
`aplicarEmTodos`. Passos são funções separadas, cada uma com espera em laço
(`esperarQue`) e timeout. Um flag `_cicloEmCurso` impede reentrada. O
amostrador de 3 s só checa o gatilho e chama a função.

Descartadas: (A) máquina de estados no amostrador — só compensaria se o ciclo
precisasse sobreviver a F5, e não precisa (F5 cai no lobby, nada roda até
ENTRAR); (C) frames de WebSocket — schema é pendência aberta.

## Telas

### Status (substitui a aba Estado)

- Linha "Monitorando (caçando · hunt X)" ou "Monitorando (cidade)".
- Cartões: **LEVEL**, **OURO**, **CAP LIVRE** (oz e %), **TAXA XP**
  (EXP/h ÷ EXP raw/h da janela "Estatísticas da caça"; "—" fora da caçada).
- Linha "hunt: X (id)" ou "hunt: — (fora de hunt)".
- Botões grandes: **Venda rápida** (passos 2–4; só na cidade, senão avisa) e
  **Finalizar hunt** (passo 1).
- Abaixo, os botões que já existem: Rebaixar catálogos · Aprender dano real ·
  Confirmar hunt · Auto-sell: marcar tudo.

### Auto Hunt (aba nova)

- Chave **Ativar automação** — desligada por padrão, guardada por conta
  (`auto_hunt_on`), sobrevive a F5; o boot registra "Auto Hunt LIGADO" no log.
- Linha "hunt: X" (memorizada) ou "hunt: — (ative dentro de uma hunt)".
- **Memorizar hunt atual**: usa `confirmarHuntPeloExplore()` (card `--aqui`)
  e guarda `auto_hunt_id` + título. **Esquecer** apaga.
- "Finalizar quando:" rádio **% livre ≤ N** (padrão 20) ou **oz livre ≤ N**.
- Checkbox **Voltar para hunt após venda** (padrão ligado).

## Ciclo

Gatilho (checado em `amostrar()` a cada 3 s): automação ligada · hunt
memorizada · `emHunt()` · cap livre ≤ limite · nenhum modal aberto
(`slot-config-modal`, `.s-modal-scrim`) · `!_aprendendo` · `!_cicloEmCurso` ·
≥ 5 min desde o último ciclo.

| passo | âncoras | falha |
|---|---|---|
| 1 Finalizar | `stop` → esperar resumo → `summary-close` | sem `stop`: aborta |
| 2 Purificar | item da mochila com "SELADO" (`item-selado-*` ou `backpack-slot-*` com o texto) → `contextmenu` → item de menu "Purificar todos" | sem selado ou sem menu: **pula** e registra (não aborta) |
| 3 Vender | `actionbar-selling` → `sell-panel` → ler `sell-total` → `sell-confirm` | aborta |
| 4 Depot | `actionbar-depot` → `depot-guardar-tudo` → fechar | aborta |
| 5 Voltar | se marcado: `actionbar-explore` → `hunt-item-<id>` → `hunt-confirm` | aborta |

Qualquer aborto: para o ciclo, registra o motivo no log com o passo, e
**desliga a automação** (`auto_hunt_on = false`). Nunca fica em loop na cidade.

Leituras: `rail-backpack-cap` ("80,5 / 1.897oz") via `lerMochilaOz()` já
existente; `hud-gold`; `rail-level-n`; janela `analyzer-session` para EXP/h e
raw.

## O que falta mapear ao vivo

Só o menu do botão direito do item selado: texto exato de "Purificar todos" e
sua âncora. Em 27/09 a mochila foi esvaziada pelo dono antes de eu conseguir
ler. O passo 2 procura por texto (`/purificar todos/i`) até ter âncora.

## Teste

- Cada passo exposto em `window.__tbHelper` (`finalizarHunt`, `purificarTodos`,
  `venderNoNpc`, `guardarNoDepot`, `voltarParaHunt`, `cicloDeVenda`) para rodar
  isolado no navegador do Playwright.
- O ciclo inteiro encerra a caçada da party (compartilhada com o Chrome do
  dono): rodar só em hora combinada.
- Sem framework de teste no projeto (userscript de arquivo único); a
  verificação é ida-e-volta no jogo, passo a passo, com o log como evidência.

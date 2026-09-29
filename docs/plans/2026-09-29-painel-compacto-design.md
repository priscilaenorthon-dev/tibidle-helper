# Painel compacto — trilho vertical de ícones (design)

Data: 2026-09-29 · helper 2.7.3 → 2.8.0

## Problema

O painel de 430 px cobre a barra de atalhos, o chat e o botão ENCERRAR do jogo.
Medido em 29/09 (Dragon Lair): Equip rola 3.937 px (7.000 caracteres), Scan
1.447 px com 61 controles, Magia 935 px. Virou relatório, não controle.
Pedido do dono: "menus com ícone na vertical, poupa tela; faça seu melhor".

## Decisões

1. **Trilho vertical** de 44 px na borda direita, abaixo da barra do jogo
   (`top: 84px`), 7 ícones: Status ⌂, Magia ✦, Auto Hunt ↻, Scan ◎, Equip ⛨,
   Analisador ▤, Log ≡. Tooltip nativo (`title`). Ponto de estado por ícone:
   verde (Auto Hunt ligado / Scan rodando, pulsando), vermelho (último log de
   erro nos 60 s), âmbar (ciclo de venda em curso).
2. **Gaveta** de 300 px que abre à esquerda do trilho ao clicar; clicar no
   mesmo ícone fecha. Só uma aberta. `max-height: 62vh`, rola por dentro.
   Estado (`aba`, `aberta`, `top`) em `ui` no localStorage por conta.
3. **Trilho recolhível**: alça de 10 px na borda esconde tudo; clique traz de
   volta. Arrastável na vertical pela alça superior.
4. **Telas enxutas** — regra: botão principal no topo, uma linha por dado,
   texto explicativo só atrás de um "?" (`details`). Concretamente:
   - Status: 4 azulejos pequenos (nível, ouro, cap, taxa xp) + Venda rápida +
     Finalizar; avançado em `details`.
   - Magia: modelos como pílulas em uma linha; hunt em `select`; APLICAR NOS 4
     logo abaixo; kit por personagem em 4 linhas (sigla + fichas das magias),
     poções/suporte numa sublinha de 10 px; grupo ao vivo em `details`.
   - Auto Hunt: chave + hunt + limite, três linhas; ciclo em `details`.
   - Scan: chave + minutos + modelo em uma linha; mapas em `details` com
     filtro de texto; resultados em tabela de 4 colunas; legenda em `details`.
   - Equip: ATUALIZAR + EQUIPAR na mesma linha; só as trocas por padrão;
     "ver os 8 slots" alterna; dispensáveis e reservas em `details`.
   - Analisador: sessão viva + histórico; WebSocket em `details`.
   - Log: igual, fonte 10 px.
5. **Nada de lógica muda.** Ids de botões e inputs continuam os mesmos, para
   os handlers em `_renderizar` seguirem valendo. Só CSS, `montarPainel`,
   `renderizar` e o HTML das 7 funções `tela*`.

## Alternativas descartadas

- Barra horizontal fina sobre os atalhos: briga com a barra de atalhos do
  jogo, que já ocupa a largura toda.
- Botões flutuantes sem painel: perde o kit por personagem e os vereditos.

## Testes

- `node --check` + `node testes/equip.test.js` (bloco puro intocado).
- Playwright: abrir cada ícone, conferir que a gaveta tem o botão principal,
  nenhum erro de console, largura total ≤ 350 px, altura ≤ 62 vh; screenshot.
- Handlers: clicar em APLICAR NOS 4 (preview) e em ATUALIZAR do Equip.

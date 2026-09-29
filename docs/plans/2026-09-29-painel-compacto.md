# Painel compacto — plano de implementação

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** trocar o painel de 430 px por um trilho vertical de ícones com gaveta de 300 px, telas enxutas, sem mudar lógica nem ids de handlers.

**Architecture:** um único userscript (`tibidle-helper.user.js`). O bloco `CSS`, `montarPainel`, `_renderizar` (cabeçalho) e as funções `telaEstado/telaAutoHunt/telaScan/telaMagia/telaAnalise/telaEquip` são reescritos; todo o resto fica. Estado de UI em `ler('ui')`.

**Tech Stack:** JS puro, CSS inline no script, Playwright para conferir, node para `--check` e testes.

---

### Task 1: trilho + gaveta (estrutura)
**Files:** Modify `tibidle-helper.user.js` (CSS, `montarPainel`, `_renderizar`, `iniciar` intervalo)
1. Novo CSS: `#tb-trilho` (44 px, fixed right, top 84px), `.tb-ico` (40×40, badge `.tb-dot`), `#tb-gaveta` (300 px, fixed, right 58px, max-height 62vh), `#tb-alca`.
2. `montarPainel` monta trilho + gaveta vazia; ícone clicado → `ABA = x; UI.aberta = (ABA===x ? !UI.aberta : true)`; alça esconde/mostra; arraste vertical pela alça.
3. `_renderizar` pinta badges + gaveta só quando `UI.aberta`.
4. Subir `@version`/`VERSAO` para 2.8.0. `node --check`.

### Task 2: telas enxutas
**Files:** Modify as 7 funções `tela*`
1. Reescrever cada tela conforme o design (mesmos ids). Texto explicativo em `<details class="tb-aj"><summary>?</summary>…</details>`.
2. `node --check` + `node testes/equip.test.js`.

### Task 3: conferir ao vivo
1. Publicar no Tampermonkey (ponte + dashboard) e recarregar.
2. Playwright: para cada ícone, abrir, medir largura/altura, contar erros de console, screenshot.
3. Clicar ATUALIZAR (Equip) e conferir que a tabela aparece; abrir Magia e conferir APLICAR NOS 4 presente.
4. Registrar em TIBIDLE.md §14 e na memória.

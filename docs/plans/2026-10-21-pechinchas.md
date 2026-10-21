# Pechinchas do Mercado — plano de implementação

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** sub-aba Radar → Pechinchas: vigia keys de Elite e itens de quest (ilhas e bosses) e aponta ofertas abaixo da média com lucro de revenda; compra e revende por botão.

**Architecture:** funções puras entre `@@PECHINCHAS-INICIO/FIM` (lista vigiada, leitura do livro, avaliação); estado `PCH` + leitura pela fila do Mercado (`mkPedir`); tela `rdTelaPechinchas` dentro do Radar; vigia por `setInterval` de 1 min que só age com a chave ligada e 5 min desde a última leitura.

**Tech Stack:** userscript único, testes em node puro (`testes/pechinchas.test.js`).

---

### Task 1: funções puras + testes
- `pchItensVigiaveis(bosses, ilhas, nomeDeId)`, `pchVigiados(itens, catalogo, cfg)`, `pchCandidato(c, media, cfg)`,
  `pchLivro(orders, meusIds)`, `pchAvaliar(x)`.
- Teste: key de Elite e item de ilha/boss com os usos; filtro de negócios; extras e fora; revenda = min(média, 2.º − 1);
  lucro com taxa de 5 %; corte por teto e ouro; arbitragem abaixo da compra aberta; o meu anúncio não conta.
- Rodar `node testes/pechinchas.test.js` (falha), implementar, rodar (passa), commit.

### Task 2: leitura e vigia
- `pchCarregarListas` (`CAT.bosses`, `/islands`, `items-by-name.json` invertido), `pchLer(origem)`: catálogo → minhas
  ordens → até 5 médias novas (`pch_medias`, 24 h) → até 6 livros de candidatos → ofertas. Nova oferta: contador no
  ícone, Log e bipe. `pchVigia()` no `setInterval` de 1 min.

### Task 3: tela
- Sub-aba "Pechinchas": VERIFICAR AGORA, chave vigiar, limites editáveis, cartões das ofertas (média 30 d, mín–máx,
  negócios, maior compra, % abaixo, revenda, lucro), compras para revender, lista vigiada atrás de "?".

### Task 4: comprar e revender (2 toques)
- `pchComprar`: relê o livro, confere preço/quantidade/ouro, `market_execute`. `pchRevender`: `mkAnunciarUm` no preço
  de revenda (piso do NPC incluído) ou `market_execute` na compra aberta (arbitragem).

### Task 5: versão, TIBIDLE.md, lint, testes, commit, push; teste ao vivo de leitura no Playwright.

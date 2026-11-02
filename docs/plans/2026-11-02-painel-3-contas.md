# Painel das 3 contas — plano de implementação

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** uma página no claude.ai onde o dono carrega os relatórios `tibidle-equip-<conta>.json` das 3 contas e vê os
personagens com figura das peças, o baú das 3 contas, o que vale passar de conta, quem aguenta cada mapa e o que limpar.

**Architecture:** página HTML única, sem biblioteca, JS puro. Dados embutidos: nome→id dos itens (items-by-name.json),
catálogo de mapas (hunts-discord.json compactado), avisos da comunidade por mapa. Os JSONs do dono ficam no localStorage.
Figura do item pela URL do jogo (`/assets/v<ver>/items/<id/1000>/<id>.webp`); a versão é descoberta por uma sonda de
imagem e guardada. Funções puras (notas, aguentar, passar) ficam num bloco separável para teste em node.

**Tech Stack:** HTML/CSS/JS puro; node para testar as funções puras (`testes/painel.test.js`, sem dependências).

---

### Task 1: funções puras (painel-core.js) + teste em node
**Files:** Create `docs/painel/painel-core.js` (IIFE que exporta em `globalThis.PainelCore` e em `module.exports`), Test `testes/painel.test.js`.
- `normConta(json)` → `{nome, mundo, nivel, fase, geradoEm, skills, personagens, itens}` aceitando formato 1 e 2.
- `idDoItem(nome, mapa)` → id (minúsculas, sem acento) ou null.
- `urlFigura(id, ver)`.
- `elementosDoMapa(hunt)` → `{fisico:true, fogo:…}` pela regra "imune (≥100 %) = bate com isso"; peso pela vida×peso.
- `protecaoDe(peca, elem)` → % (ficha absorbpercent*, elemental protection *, atributos resist_*).
- `aguentar(conta, hunt)` → por vocação `{armor, fisico, porElem, descobertos[], sugestoes[]}` (sugestão = peça do depósito de
  qualquer conta, mesmo espaço, vocação pode, maior ganho de proteção no elemento descoberto).
- `valePassar(contas)` → lista `{peca, de, para:{conta, voc, slot}, ganho, atual}` com ganho ≥ 3 pt usando `porVoc`
  contra `personagens[voc][slot].veste.pontos`.
- `limpeza(conta)` → sobras e épicos sem linha útil pelo veredito.
Teste: fixtures mínimas inventadas (2 contas, 6 peças). `node testes/painel.test.js` passa.

### Task 2: página (docs/painel/index.html) com carga, personagens e baú
- `<title>Painel das 3 contas</title>`, tokens de cor claro/escuro, fonte Google (Alegreya Sans + JetBrains Mono).
- Carga: drop zone + `<input type=file multiple>` + textarea de colar; valida `relatorio === 'tibidle-helper equipamento'`;
  guarda em localStorage (`painel_contas`); chips das contas com nível, fase, data; aviso > 7 dias; botão remover.
- Sonda da versão dos assets: `<img>` de 3288 nas versões [guardada, 242, 243…270, 241…230]; guarda em `painel_assets_ver`.
- Personagens: 12 cartões (conta × vocação) com as 8 peças (figura 32→48 px, nome, raridade em cor, +refino, linhas dos
  encaixes, imbuements, nota); skills da vocação.
- Baú: tabela/cartões de todas as peças; filtros (conta, vocação que veste, espaço, veredito), busca; totais por conta.

### Task 3: seções Vale a pena passar, Aguentar mapa, Limpeza
- Vale a pena: lista ordenada por ganho; mostra peça (figura), de onde, para quem, nota atual × nova, NPC; nota "troca pelo
  Mercado: taxa 5 %"; aviso quando a diferença de nível entre as contas > 40.
- Aguentar: select de conta + select de mapa (rec ≥ 60, ordenado por recomendado) + bosses; por vocação: armadura, físico %,
  cada elemento do mapa %; destaque em quem está descoberto (< 10 % no elemento principal); sugestões; avisos da comunidade.
- Limpeza: agrupado por conta e tipo (sobra / épico sem linha útil / encaixe nobre), com NPC somado.

### Task 4: publicar e registrar
- Publicar pelo Artifact (ícone `shield`); abrir; testar com os 3 JSONs reais (carregar pelo Playwright na página e tirar
  print); registrar no TIBIDLE.md (2.39.0 nota "Painel das 3 contas") e commit `docs/painel/`.

### Task 5 (depois, helper 2.39.1): formato 2 do relatório
- `relatorioEquip`: `formato: 2`, `itemId` por peça (de `idsPorNome`), `assetsVer`, `deposito: {usado, total}`, `ouro`, `mapa`.
- Teste em `testes/equip.test.js`; subir versão; TIBIDLE.md.

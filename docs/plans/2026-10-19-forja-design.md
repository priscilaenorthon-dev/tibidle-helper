# Aba Forja — desenho (19/10/2026)

Pedido do dono: "Vc vai ser agora um especialista de Forja nesse jogo. Nunca fiz então quero que nossa automação tire de letra."
Uma tela nova com (1) relatório e ranking das peças que vale a pena forjar, com análise completa; (2) simulação que
acha a melhor combinação de gemas e o custo; (3) um botão que forja de verdade, sozinho, com o melhor aproveitamento;
(4) link da peça para a mochila/Forja do jogo; (5) a aba Forja sai do Progresso e vira aba própria.

## 1. O que foi estudado

**Wiki /forja (lida em 19/10)** — regras completas: raridade = encaixes (Comum 0 … Mítico 5); potência = base + 50 × refino;
faixas I–VI a cada 200; refino +1..+4 (80/70/60/50 %, falha não cai) e +5..+10 (35/25/20/15/10/5 %, falha cai 1 sem
Garantia; a Garantia é gasta em toda tentativa e não muda a chance); Raridade T1 55/35/20/10 %, T2 3 % (falhar não
rebaixa); Atributo T1 escreve no 1.º encaixe vazio (pesos: ofensivo soma 89, defensivo 132 — ML/distância/corpo a corpo
caem 1 em 89); Limpeza T1 apaga todas, T2 a última; Refazer T1 re-sorteia todos os valores, T2 o último; Ordem T2
embaralha. Valores por faixa (tabela já em `FAIXA_VALORES`). **Tetos somados entre as peças vestidas**: cura própria
40 %, roubo de vida chance 35 % / quantia 25 %, chance de loot 10 %, escudo +15 (novo; não estava no helper).
Gemas = 100 fragmentos do MESMO tipo + ouro base + parcela em coins convertida pela cotação média de 6 h (Refino T1
10 k + 5 coins … Raridade T2 50 k + 10 coins). Desmanche = única fonte de fragmentos (tabela por faixa × raridade; T2 a
partir da faixa IV). Bancada de testes: simula de graça numa cópia.

**Cliente do jogo (chunks lidos em 19/10)** — protocolo da Forja, pelo socket:
- `forge_quote {iid?, origem: bag|depot|equipped(+vocation), aba: refino|raridade|atributos|desmanche}` → `forge_quote_result`
  (refino: alvo, gema, estoque, chance, statDelta, statAlvo, potenciaDelta, podeCair, estoqueGarantia; raridade: gema, estoque,
  chance, raridadeAtual, raridadeAlvo; atributos: acoes[{acao, gema, estoque, disponivel, motivo}]; desmanche: totalFragmentos,
  pBase, pMaior). É consulta ("external_query"): não gasta nada.
- `forge_simulate {iid, origem, vocation?, aba, acao?, garantia?}` → `forge_simulate_result {ok, instancia, garantiaConsumida,
  afetados}` — a **Bancada de testes roda no servidor**, de graça, com o sorteio real do jogo.
- `forge_refine {iid, origem, vocation?, garantia?, requestId}` → `{ok, refino, garantiaConsumida, instancia, bag, gold…}`;
  `forge_rarity {…}` → `{ok, raridade, instancia, bag}`; `forge_attr {…, acao: atributo|refazer|refazer_maior|ordem|limpeza|
  limpeza_maior}` → `{acao, afetados, instancia, bag}`; `forge_craft {gema, qty, requestId}` → `{gema, qty, gold, bag}`;
  `forge_lastro {}` → `{disponivel, ouroPorGema{…}, proximaAtualizacaoEm}` (já usado na 2.22.0).
- Gema de refino: `refino` até o +4, `refino_maior` do +5; raridade: `raridade` até Lendário, `raridade_maior` para Mítico;
  Garantia só vale com a peça entre +4 e +9. Erros: not_in_city, too_far, insufficient_item, trade_reserved, item_protected,
  insufficient_gold, bag_capacity_exceeded, invalid_forge.
- Itens: gemas `refine gem t1`, `guarantee gem t1`, `cleansing gem t1/t2`, `attribute gem t1`, `reroll gem t1/t2`,
  `rarity gem t1/t2`, `order gem t2`, `refine gem t2`; fragmentos = o mesmo nome com `fragment`. Todos negociáveis no
  Mercado.
- Tela do jogo: `window-forja` (abas desmanche / equipamentos / gemas / bancada), `forja-cartao-<iid>`, modal
  `forja-modal` com `forja-gema-<id>`, `forja-bloco-valores`, `forja-acao-botao`, `forja-bancada`.

**Vídeos (transcrições lidas em 19/10)** — TV de Souza "Guia definitivo da forja" (22 min) e "Guia completo de itens e
forja" (46 min), Osfurg "Como fazer Tier rápido":
- Só se forja **item BiS** (o melhor que o personagem pode vestir hoje); gema em item de entrada é dinheiro jogado fora —
  "não gasta gema no item level baixo", "daqui a pouco vem arma melhor e você fica de cara de bobo".
- Refino: **até o +4, no máximo +5**; "depois disso fica muito caro e as chances despencam". Cada refino = +1 ataque ou
  +1 armadura e +50 de potência. Magic Sword +2 = base da Stonecutter: não vale.
- A jogada de ouro da comunidade: peça que JÁ caiu com linha de skill (ML/distância/corpo a corpo) e **potência ≥ 300**:
  refinar até cruzar a faixa (400 → ML até +2; 600 → até +3) e usar **Refazer** para o valor subir. Snakebite ML+1 → +2/+3.
  Primeiro no colar/peça barata (até 400), e só depois arriscar o +3.
- Rolar skill com Atributo T1 é 1 em 89: "não role essa linha; procure a peça que já caiu com ela".
- Crítico: base 0 %, qualquer 1 % já acerta; Kina = dano físico (elemental é "passar vergonha"); dano mágico vale em tudo.
- Fragmentos vêm do desmanche, das caixas de boss e dos raid tokens da invasão (NPC Ravena); no Mercado "o fragmento
  está 2 k". Gema = 100 fragmentos + ouro.
- Bancada de testes: "brinque nela antes, não gasta nada".

**Estado da conta (19/10, lido ao vivo)** — ouro 4.133.623, 100 coins, cotação 34.328 ouro/coin. Fragmentos no depósito:
refine 14, rarity 60, attribute 21, cleansing 1, order T2 5. Nenhuma gema. Logo **nenhuma gema dá para criar hoje**: tudo
passa por comprar fragmento (ou gema) no Mercado. Preços de hoje (menor anúncio): refine fragment t1 180 · cleansing 100 ·
guarantee 599 · reroll 1.954 · attribute 2.800 · rarity 5.150; gemas prontas: refine 210 k · cleansing 187 k · guarantee
319 k · reroll 465 k · attribute 449 k · rarity 943 k. Custo de criar = ouro base + coins × cotação + 100 fragmentos:
Refino ≈ 10 k + 172 k + 18 k = **200 k** (comprar: 210 k); Atributo ≈ 20 k + 206 k + 280 k = 506 k (**comprar a 449 k sai mais
barato**); Raridade ≈ 30 k + 240 k + 515 k = 785 k (comprar: 943 k); Garantia ≈ 247 k (comprar 319 k). Ou seja: **uma gema
custa 200–800 mil**, e o ouro de hoje paga 5 a 20 ações. O ranking tem que pesar isso.

## 2. Decisões de desenho

### Tela nova: aba **Forja** (ícone ⚒ no trilho), 4 blocos

**A. Estoque e preços** (só leitura): ouro normal, cotação (forge_lastro), fragmentos e gemas por tipo (mochila +
depósito), preço do fragmento e da gema no Mercado (catálogo lido pelo Mercado), e o **custo real de cada gema hoje =
mín(criar com o que tem + comprar o que falta, comprar a gema pronta)**. Uma linha por gema.

**B. Ranking "vale forjar"**: para cada peça que a party usa ou guarda (vestidas, reservas e bases de forja do Equip — a
peça é avaliada para o personagem que a usa/usaria, pela mesma régua do Equip, 1 pt = 1 % do dano da party), o helper
calcula o **melhor plano** entre as estratégias abaixo, por Monte Carlo com as regras exatas do jogo (`forjaSimular`, já
existente, estendido), e ordena por **pt ganhos por milhão de ouro esperado**, mostrando ganho (pt), custo esperado e
de 90 %, chance de sucesso, e um selo: ✓ vale (ganho ≥ 1 pt e custo esperado ≤ ouro disponível) / ⏳ só com mais ouro /
✗ não vale (item de entrada; a regra dos vídeos: só BiS). Estratégias:
1. **Refino** até +N (N ≤ 4 por padrão; +5 só com Garantia e se cruzar faixa): ganho = +N armadura/ataque na régua.
2. **Cruzar faixa + Refazer** (a jogada da comunidade): peça com linha de skill (ML/distância/corpo a corpo) e potência
   ≥ 300 → refinos até a faixa III (400) ou IV (600) + Refazer T1/T2 até a linha chegar ao teto da faixa.
3. **Encaixe novo**: Raridade T1 (se precisa abrir encaixe) + Atributo T1, Limpeza T2 quando vier linha ruim, até cair
   uma linha que vale (≥ 0,3 pt), com o valor esperado da faixa.
4. **Subir valor**: Refazer T1 (todas) ou T2 (última) numa peça cujas linhas boas estão abaixo da mediana da faixa.
Cada plano lista os passos em ordem (como o `planoForja` já faz), e o detalhe fica atrás de "+".

**C. Simulação da peça escolhida**: tabela das 4 estratégias para a peça (ganho, custo médio, custo 90 %, tentativas,
chance), a melhor marcada. Botão **"conferir na Bancada do jogo"** (opcional, só leitura): roda N vezes o
`forge_simulate` do servidor para o 1.º passo do plano e mostra a taxa real contra a prevista. O Monte Carlo local é
o que decide; a Bancada do jogo serve de prova.

**D. FORJAR DE VERDADE** (2 toques, uma peça por vez, orçamento obrigatório): executa o plano escolhido pelo socket,
passo a passo, com confirmação do servidor a cada passo e releitura da peça (`instancia`) antes do próximo:
- compra o que falta (fragmentos ou a gema pronta, o que sair mais barato) no Mercado — só se o dono marcar
  "pode comprar no Mercado", com o custo escrito no botão;
- `forge_craft` das gemas que faltam; `forge_refine` (Garantia do +5 em diante), `forge_rarity`, `forge_attr` conforme o
  plano; decide a cada resultado (linha ruim → Limpeza T2 e repete; valor abaixo do alvo → Refazer T2);
- para quando: alcançou o alvo; estourou o orçamento (ouro ou nº de tentativas = 90 % × 1,5); qualquer erro do servidor
  (not_in_city, too_far, item_protected…); o dono clicou PARAR; a peça saiu do lugar. Um relatório ao fim (gasto, passos,
  antes → depois). A peça pode estar vestida, na mochila ou no depósito (o protocolo aceita as três origens).
- Nunca forja peça selada, imbuída, usada ou travada; nunca vende nem desmancha nada (o desmanche continua no Equip).

**E. Link para a mochila/Forja do jogo**: cada linha tem "abrir na Forja" (abre a janela Forja do jogo e o cartão da
peça, `forja-cartao-<iid>`, para o dono ver a mesma peça lá) e, se a peça está no depósito, "puxar p/ mochila" (já
existe). O iid curto aparece na linha para não confundir cópias iguais.

**Progresso → Forja**: a sub-aba Forja do Progresso (calculadora de refino esperado + proteção de imbuement) sai de
lá; a calculadora de refino vira parte do bloco C; a de imbuement vai para um "?" no fim da aba Forja ("Imbuement:
proteção vale a pena?"), porque é o mesmo balcão no jogo. O código puro (`pgRefino`, `pgProtecao`) é reaproveitado.

### O que NÃO muda
- Nada dispara sozinho: ler e simular são botões; forjar e comprar pedem 2 toques e orçamento.
- A régua do valor é a do Equip (pesos por vocação, fase 2 no nível ≥ 110). O ranking é "mais forte", não "mais caro
  no Mercado".
- O desmanche fica no Equip (lista de sobras); a aba Forja só mostra quantos fragmentos ele renderia.

### Regras de bom senso embutidas (dos vídeos), todas desligáveis por opção
- Refino padrão até +4; +5 e acima só com Garantia e só se a peça cruzar de faixa com isso.
- Nunca rolar Atributo atrás de linha de skill (1 em 89): a estratégia 3 mira só linhas de peso 10.
- Só peças BiS: a peça precisa ser a melhor do personagem naquele espaço (ou a base de forja que viraria a melhor).
- Gema mais barata entre criar e comprar, sempre com o preço de hoje.

## 3. Arquitetura

- Bloco puro `@@FORJA-INICIO … @@FORJA-FIM` (testes/forja.test.js roda só com EQUIP-PURO): `fjCustoGemas(lastro,
  catalogo, estoque)`, `fjEstrategias(peca, voc, ctx, custos, opc)` → planos com `forjaSimular` (que ganha: Refazer T1 para
  todas as linhas, alvo "cruzar faixa + skill ≥ v", orçamento máximo de gemas por tipo, custo com o preço real de cada
  gema), `fjRanking(pecas, equipRes, ctx, custos, ouro)`, `fjProximoPasso(plano, instancia)` (a máquina de decisão que o
  botão real segue, pura: dado o estado atual da peça devolve a próxima ação ou "parar"), `fjPassosTexto(plano)`.
- Estado/socket `FJ` (fora do bloco puro): leituras (`forge_lastro`, `forge_quote`, estoque pela mochila/depósito,
  catálogo via MK), `fjSimularNoJogo(peca, passo, n)` (forge_simulate × n), `fjForjar(plano)` (laço real pelo `mkPedir`,
  que já casa requestId, respeita o ritmo e trata erros), compras pelo `market_execute` (já existe nas Melhorias).
- Tela `telaForja`/`ligarForja`, ícone no trilho, `aba: 'forja'`; a sub-aba sai de `telaProgresso`.
- Testes: ranking (BiS só; refino +4; skill não é rolada; custo = mínimo criar/comprar), `fjProximoPasso` em todos os
  ramos (sucesso, falha com queda, linha ruim, orçamento), `forjaSimular` com as regras novas.
- Versão 2.25.0; registro no TIBIDLE.md.

## 4. Riscos e limites (ditos ao dono)
- Forjar é sorteio: o custo mostrado é média e 90 %; o azar pode custar o dobro. O orçamento é o freio.
- O Mercado muda de preço: o botão relê o catálogo antes de comprar e para se o preço subiu mais de 10 %.
- A conta hoje não cria gema nenhuma sem comprar fragmento; com 4,1 M dá para 5–20 ações. O ranking vai dizer, em
  geral, que a única coisa que vale é refinar o BiS do Cavaleiro até +3/+4 e trabalhar a linha de ML dos magos.
- Teste real: uma ação de verdade (≈ 200 k) numa peça que o dono escolher, depois da aprovação.

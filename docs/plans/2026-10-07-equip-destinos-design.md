# Equip 2.15.0 — cada caixinha do baú vira um destino com botão (desenho)

Data: 07/10/2026. Aprovado pelo dono na mesma conversa.

## Problema

O dono olhou a aba Equip e não entendeu as quatro caixinhas ("sobrando", "bases de forja",
"guardar: encaixe bom", "reservas"). Elas descrevem o modelo, não dizem o que fazer, e nenhuma tem
botão. Ele quer esvaziar o depósito do que nunca vai usar e pediu: "quero que nossa automação tenha a
capacidade de fazer o que eu quero, e me indicar o que precisa", com links para facilitar.

Hoje (conta u2tag, 65/300 lugares): 22 sobrando (10 comuns ≈ 51,5 mil no NPC), 5 bases de forja,
9 encaixe bom, 16 reservas.

## Decisões do dono (07/10)

- **sobrando**: botão **VENDER NO NPC** para as comuns + botão **ANUNCIAR NO MERCADO** para incomuns/raras.
- **bases de forja** e **encaixe bom**: botão **ANUNCIAR NO MERCADO** com preço de referência; forja vira só um link.
- **reservas**: 2 → **1 por slot** (`EQUIP_RESERVAS = 1`). A 3.ª melhor cai em "sobrando".
- Nada é vendido nem anunciado sem 2 toques (regra do dono, mantida).

## Desenho

### Aba Equip

1. **sobrando** divide-se em duas listas, cada uma com botão:
   - **VENDER NO NPC (N · X ouro)** — só peças `vendivelNpc` (comum, sem refino). 2 toques. Fluxo
     `venderSobrasNpc(pecas)`: `depot_withdraw` pelo socket com `[{name, count:1, iid}]` das peças no
     depósito → abre VENDER (`actionbar-selling`) → desmarca toda linha que não está na lista
     (reaproveita `linhasDaVenda`/`desmarcarNaVenda`) → confirma (`cliqueCompleto` em `sell-confirm`,
     `confirm-ok` se houver) → sucesso medido pelo OURO → `equipAtualizar()`. Se a desmarcação falhar,
     fecha o painel e NADA é vendido (mesma garantia da venda do Auto Hunt).
   - **ANUNCIAR NO MERCADO (N)** — incomum ou melhor. Marca as peças (`MK.marcados.add('i:'+iid)`),
     adiciona os iids em `MK.liberadas` e abre a aba Mercado. A confirmação (2 toques, taxa escrita)
     continua na aba Mercado.
2. **bases de forja (N)** — texto de 1 linha: "raras de 3 encaixes: só valem guardar se você for forjar;
   sem forjar, anuncie". Botão ANUNCIAR NO MERCADO. Link "como forjar" → `tibidle.com/wiki/forja`.
   O plano de forja por peça continua, atrás de `<details>`.
3. **guardar: encaixe bom** passa a chamar-se **"encaixe que o Mercado paga (N)"**. Cada peça mostra o
   preço de referência e o botão ANUNCIAR NO MERCADO. Continua fora de "sobrando" (não vai ao NPC).
4. **reservas (N)** — `EQUIP_RESERVAS = 1`. Cada linha: "reserva de <Vocação> · <slot> · <pt> pt
   (a do corpo tem <pt>)".
5. **Links** — todo nome de peça em todas as caixinhas é `<a target="_blank" rel="noopener">` para
   `https://tibidle.com/wiki/database/equipamentos/<slug>`; `slug` = minúsculas, apóstrofo removido,
   espaços → `-` (ex.: "Dragha's Spellbook" → `draghas-spellbook`). Função pura `wikiSlug(nome)`.

### Preço de referência na aba Equip

Função pura `precoReferencia(peca, copias, catalogo)` no bloco MERCADO:
- cópia de **outro vendedor** com o mesmo corte (raridade, refino, mesmos ids de atributo) → menor − 1,
  origem `igual`;
- senão, mesma raridade e refino e ao menos um atributo em comum → menor − 1, origem `parecida`;
- senão, mesma raridade e refino → faixa mín–máx, origem `faixa`, sem preço;
- sem cópias carregadas → `null` e a linha diz "aba Mercado → ATUALIZAR".
Nunca abaixo do piso do NPC após a taxa (regra existente `mkAbaixoDoNpc`).
A aba Equip mostra: "ref. Mercado: 449.999 (raro igual a 450.000)" ou "faixa 65.000–70.000 — você digita".

### Aba Mercado

- `MK.liberadas: Set<iid>` — iids liberados pelos botões do Equip. Em `mkMontar(e)`, `e.liberadas` tira
  a barreira "melhor ou reserva no Equip" **só para esses iids** e **nunca** para `usadas` (o que está no
  corpo). A lista branca (`sobras`) passa a aceitar `sobras ∪ liberadas`.
- O preço sugerido das peças liberadas usa `precoReferencia` quando não há cópia igual (hoje a linha
  fica "digite"): origem `parecida` preenche o campo; origem `faixa` deixa vazio com a faixa escrita.
- Ao abrir a aba vinda do Equip, as peças já estão marcadas; o rodapé mostra `ANUNCIAR (N) · taxa`.

### O que não muda

- Nada dispara sozinho. Equipar, vender e anunciar continuam por botão com 2 toques.
- O que está no corpo dos 4 nunca entra em venda nem anúncio.
- Auto Hunt e Scan intactos.

## Erros e limites

- Fora da cidade: botões desligados com título "só na cidade".
- Socket não capturado: VENDER NO NPC desligado ("F5 com o helper instalado"); ANUNCIAR funciona
  (a aba Mercado já exige o socket na hora de criar a ordem).
- `depot_withdraw` falha (`insufficient_item`, mochila sem peso): Log diz quais saíram; a venda segue só
  com o que chegou na mochila; a peça que não saiu continua no baú.
- Mercado não lido: linhas sem referência; o botão ANUNCIAR ainda funciona (a aba Mercado faz ATUALIZAR
  ao abrir se `MK.t` for nulo).

## Testes (node puro, `testes/`)

- `equip.test.js`: `EQUIP_RESERVAS = 1` (fixtures: a 3.ª melhor vai para `dispensaveis`); divisão
  `sobrasNpc`/`sobrasMercado` por `vendivelNpc`; `wikiSlug`.
- `mercado.test.js`: `mkMontar` com `liberadas` (libera reserva/nobre/base por iid, nunca `usadas`);
  `precoReferencia` nos 4 casos (igual, parecida, faixa, vazio) e piso do NPC; cópias do próprio dono
  não contam.
- `telas.test.js`: a aba Equip renderiza os 3 botões com os contadores certos e os links com o slug.
- CI: `node --check`, todos os testes, eslint 0 erros, `@version` = `VERSAO` = 2.15.0.

## Teste ao vivo (carta branca)

1. ATUALIZAR no Equip: conferir contadores (10 NPC / 22 Mercado / 8 reservas) e links.
2. VENDER NO NPC (2 toques): ouro sobe ≈ 51,5 mil; depósito cai 10 lugares; Log lista as peças.
3. ANUNCIAR NO MERCADO a partir de "encaixe que o Mercado paga": a aba Mercado abre com as peças
   marcadas e preços; conferir 1 anúncio barato com 2 toques; a ordem aparece em "Meus anúncios".
4. Registrar no fim do `TIBIDLE.md` (seção 2.15.0).

# Aba Equip — desenho (2026-09-28)

## Objetivo
Nova aba no helper que ranqueia toda peça de equipamento da conta (corpo dos 4,
depósito e mochila) por vocação e slot, mostra o item atual contra o melhor
disponível com o ganho e os motivos, e lista o que é dispensável (venda/desmonte)
sem risco de jogar fora peça boa. **Só recomenda** — nada equipa nem descarta.

## Fontes de dados (todas já confirmadas ao vivo em 28/09)
| Dado | Fonte | Formato |
|---|---|---|
| Equipamento dos 4 | `welcome`/`resume` → `data.roster[].equipment{slot:{id,iid,name,attrs,forja,value}}`; fallback fibra React (`shell.roster`) | attrs base + forja |
| Depósito | `depot_get {}` → `depot_state {entries:[{itemName,count,iid?,forja?,slot?}], used, total}` | só forja, sem attrs base |
| Mochila | `frame.data.state.inventory[]` (na hunt); `shell.bagInstances` (cidade) | nome, iid, forja? |
| Atributos base + preço | `GET /item/info?ids=a,b,c` (sem login; cache por nome); id por `/assets/v167/items-by-name.json` | `{id,name,attrs,imbuements,sell,buy}` |
| Catálogo offline | `data/lib-items-2026-09-28.json` (9.073 itens) | para testes |

Slots reais: head, armor, legs, boots(feet), shield, weapon(hand), necklace, ring.
Duas mãos (`slotType:'two-handed'`, arcos) ocupa weapon+shield.
Vocação: `attrs.vocation` ("Knight;true, Elite Knight"); ausente = qualquer uma.
Nível não é requisito (wiki /equipamentos).

## Regras da wiki que definem os pesos
- Corpo a corpo de criatura vai sempre no Knight; os outros três só levam magia
  de área, e armadura/escudo não seguram magia (/lure-levas-e-formacao,
  /como-o-dano-e-calculado).
- Dano básico: Knight `0,085 × atk × melee + nível/5`; Paladino
  `0,09 × atk_munição × distance + nível/5` (arco não conta attack); magos dano
  fixo da wand/rod com custo de mana por tiro.
- Poção de mana OFF nos 4 (regime regen) ⇒ regen de mana vira magia de graça;
  mana do tiro da wand compete com a magia.
- Forja: raridade = nº de atributos (0..5); potência define a faixa (I 0–199,
  II 200–399, III 400–599 …). Atributos ofensivos (arma, colar): dano_elem_*,
  dano_fisico, dano_magico, roubo_vida_chance/quantia, critico_chance/dano,
  corpo_a_corpo, distancia, nivel_magico. Defensivos (demais slots): resist_*,
  protecao_magica, resist_fisica, escudo, max_hp, max_mana, capacidade,
  regen_vida, regen_mana, cura_propria, roubo_vida_*, chance_de_loot.

## Modelo de pontuação
`pontos(peça, voc) = Σ base_i × peso_voc_i + Σ forja_j × peso_voc_j`, tudo em
"% de ganho" aproximado. Uma tabela `PESOS_EQUIP[voc][atributo]` no código.

Referências de conversão (nível 61, skills atuais):
- Knight: +1 attack ≈ +0,9 % de dano (dano ≈ 0,085·33·30+12 = 96); +1 corpo a
  corpo ≈ +2,8 %; dano_fisico 1:1; dano_elem 0,6:1; crítico chance×dano/100;
  armor +1 ≈ 1,5 pt; defesa do escudo +1 ≈ 0,5 pt; escudo +1 ≈ 2 pt; max_hp
  +10 ≈ 1 pt; resist/protecao_magica 0,5:1; regen_vida 0,5:1; cura_propria 0,3:1.
- Paladino: distancia +1 ≈ +3 %; dano_fisico 1:1; dano_elem 0,6:1; crítico
  idem; regen_mana 1,5:1; resist/protecao 0,4:1; max_hp +10 ≈ 0,5; armor 0,2:1.
- Feiticeiro/Druida: regen_mana 3:1; dano_magico 1:1; nivel_magico +1 ≈ +4 %;
  `magiclevelpoints` da base idem; max_mana +50 ≈ 1 pt; protecao_magica/resist
  0,4:1; max_hp +10 ≈ 0,4; cura_propria (Druida) 0,5:1; armor 0,1:1.
  Wand/rod: `(from+to)/2 × 1 − mana × 4` (4 ≈ dano por mana das magias do
  Equilibrado; usa `danosConhecidos` quando houver).
- Atributos mortos (peso 0) ficam listados como "não conta" na tela.
- Anéis/amuletos com carga ou duração (`equipPreview.durationS`, `charges`):
  pontuam com os atributos do `equipPreview.attrs` × 0,5 e ganham a etiqueta
  "temporário".

## Distribuição
Cada peça vai para um único personagem. Candidatos = corpo + depósito + mochila
(excluindo selados, que não têm forja lida). Ganho = pontos(peça) − pontos(atual
no slot). Guloso: ordena todos os (peça, voc, slot) por ganho desc; aceita se
peça e slot ainda livres; empate → Knight primeiro (wiki: "invista primeiro no
Knight"). Duas mãos: compara `pontos(arma2m)` com `pontos(arma1m)+pontos(escudo)`.
Reserva = segunda melhor por (voc, slot). Dispensável = peça que não é melhor
nem reserva de ninguém; mostra `sell` e "superada por X".

## Tela (`ABA = 'equip'`)
- Cabeçalho: lugares do depósito (`used/total`), botão ATUALIZAR (depot_get +
  recalcular), hora da última leitura.
- 4 sub-abas (Knight · Paladino · Feiticeiro · Druida). Por slot, uma linha:
  atual (nome · raridade · pontos) → melhor (nome · origem corpo/depósito/mochila
  · pontos · **+ganho**) · 2 motivos principais. Verde quando há troca, cinza
  quando o atual já é o melhor. Clique expande os atributos, marcando
  "conta"/"não conta" para a vocação.
- Seção "Dispensáveis": lista ordenada por preço de venda, com motivo. Soma do
  ouro. Seção "Reservas" recolhida.
- Sem ação automática de equipar/descartar.

## Erros
- Sem socket ou sem `depot_state` em 5 s: mostra o que tem (corpo) e avisa.
- Nome sem id no catálogo ou `/item/info` falhando: peça entra com attrs base
  vazios e etiqueta "base desconhecida".
- Fora da cidade o depósito é só leitura — não afeta a aba (só lê).

## Testes
Funções puras (`pontuarPeca`, `distribuir`, `dispensaveis`, `lerCandidatos`)
extraídas do userscript e rodadas no node com as fixtures
`data/estado-equip-2026-09-28.json` (roster + depósito) e
`data/lib-items-2026-09-28.json`. Casos: épico com atributos mortos perde para
incomum certo; duas mãos vs par; item único não vai para dois; wand com mana alta
perde para wand barata no regime regen; peça temporária etiquetada.

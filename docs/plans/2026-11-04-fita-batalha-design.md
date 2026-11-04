# Fita de batalha: autópsia de morte, disparos desperdiçados e curas que não compensam — desenho (04/11)

Dono: "será que nossa automação poderia analisar o log de batalha que tem no jogo e melhorar alguma coisa?" e, depois do
desenho apresentado, "pode abrir o jogo aí e fazer sua análise".

## O que o jogo manda (conferido ao vivo em 04/11, ShamanBr em Shadow Nexus, 3 min gravados em `data/frames-shadow-04-11.json`)

Cada `frame` traz `state` e `events[]`. O que as três análises precisam já vem:

- `state.party[i]`: `hp, maxHp, mana, maxMana`, **`cds`** (`groups{attack, healing, support}`, `potionMs`, `heals[{name, cdLeft,
  cooldownMs}]`, `supports[]`), **`kit[{name, mana, cooldownMs, cdLeft}]`**, `supplyUsed`, `pos`.
- `state.active[{id, name, hp, maxHp, pos}]`, `nextWaveMs`.
- `events`: `cast {who, name, rune, hits[{id, amount, hp}]}` (cura vem com `hits: []`), **`heal {who, amount, hp, spell}`**
  (a cura que entrou e a vida depois; sem `spell` = poção), `heal_tick {who, amount, hp, spell}` (Intense Recovery),
  `manapotion {who, amount, mana}`, `mhit {id, amount, hp}` (corpo a corpo no Cavaleiro; `hp` = vida dele depois),
  `mcast {id, atk, type, amount, hp, hits[{who, amount, mana, hp}]}`, `kill`, `spawn {id, name, maxHp}`, `death {who}`,
  `wave {count}`, `wave_timer {ms}`.

Na gravação: Druida chegou a 22 % e Cavaleiro a 32 % sem morrer — a autópsia também serve para "quase morreu".

## Base comum: a fita (`RAZAO.fita`)

Buffer circular no livro-razão (`@@RAZAO`): a cada frame, um registro `{t, vit:[{hp, maxHp, mana, maxMana, cds}×4], ativos:n,
ev:[eventos compactados]}`. Teto: 40 s ou 400 registros. Nada novo chega do jogo; é só guardar o que hoje é somado e jogado
fora. Por evento guarda-se só `kind, who, id, name/spell, amount, hp, type, hits[{who|id, amount, hp}]` (sem `cells`, `fx`,
`words`). Entra em `razaoVitais` (vitais + ativos) e em `razaoEvento` (eventos). Funções puras, testáveis em node com frames
sintéticos e, opcionalmente, com a gravação real (pula se `data/` não existir, como os testes de `int-calibracao`).

Alternativas descartadas: só somas (não dá autópsia); mandar para fora (Log na nuvem foi retirado a pedido do dono).

## 1. Autópsia de morte (`razaoAutopsia`)

Disparo: evento `death {who}` (e, para "quase morreu", quando a vida de alguém cruza ≤ 25 % para baixo, no máximo 1 laudo por
minuto por personagem). Entrada: a fita e a config de batalha do personagem (`ESTADO_WS` já tem `heals` com os percentuais).
Saída (objeto, depois texto):

- `quem`: dano tomado nos últimos 10 s por criatura e elemento (dos `mhit`/`mcast` com `hits[].who`), em ordem.
- `vida`: a curva (hp a cada frame) dos últimos 10 s; o maior golpe único; se houve rajada (≥ 3 golpes no mesmo segundo).
- `curas`: para cada cura configurada: percentual, se disparou nos 10 s (eventos `heal`/`cast`), e **por que não disparou** no
  frame em que a vida ficou abaixo do percentual dela: em recarga (`cds.heals[].cdLeft` ou `cds.groups.healing` > 0), sem mana
  (`mana < custo` do catálogo) ou vida ainda acima do gatilho. Poção: `cds.potionMs`.
- `veredito`: uma frase: "morreu por rajada física de 3 Angry Demons em 1,2 s (1.410 de dano); a Ultimate Healing só dispara em
  ≤ 30 % e a Mass Healing estava em recarga por 1,4 s" — ou "o dano chegou com cura disponível: faltou vida máxima".

Onde aparece: gaveta `radar_mortes[huntId].laudos` (as 3 últimas), aba Radar (ao lado de "N mortes registradas") e uma linha
no Log. Só leitura.

## 2. Disparos desperdiçados (`razaoDisparos`)

Por magia de ataque de cada personagem, a partir da fita e dos `cast`:

- `curtos`: lançamentos que acertaram menos alvos que o mínimo configurado (`hits.length < minCreatures[nome]`).
- `parado`: segundos em que (a) havia monstro vivo, (b) a magia estava pronta (`kit[].cdLeft === 0` e grupo de ataque livre),
  (c) ele tinha mana para ela, e (d) `ativos < mínimo` — ou seja, o slot só não saiu por causa do mínimo. Soma por magia e por
  mínimo alternativo (quantos desses segundos teriam mínimo ≥ k, k = 1..mínimo−1).
- Saída: "Strong Ice Wave ≥3: 41 % do tempo com monstro vivo ficou parada; com ≥2 sairia +9/min". Aparece na aba Magia, na
  dica de cada slot (ao lado do "dano medido por lançamento"), só quando a caçada tem ≥ 5 min. Nunca altera o slot.

## 3. Curas que não compensam (`razaoCuras`)

Por cura (magia ou poção) de cada personagem: no `heal {who, amount, hp, spell}`, a vida antes = `hp − amount` (ou a do frame
anterior), o desperdício = `max(0, (antes + amount) − maxHp)`... o jogo já entrega `hp` depois (capado no máximo), então
desperdício = `amount − (hp − antes)`. Guarda n, desperdício médio em % do `amount`, e quantas vezes a vida estava abaixo de
30 % quando a cura saiu (cura atrasada). Sugestão: o maior percentual em que o desperdício esperado fica ≤ 10 % (varre a
distribuição de "vida antes" registrada). Aparece na aba Magia, na dica dos slots de defesa: "≤70 % desperdiça 28 %; ≤55 %
desperdiçaria 8 %". Só mostra.

## Testes

`testes/razao.test.js` ganha: fita (teto, compactação), autópsia sintética (rajada + cura em recarga + cura abaixo do gatilho),
disparos (curto, parado com mínimo alternativo), curas (desperdício, atrasada, sugestão). Mais um teste opcional sobre
`data/frames-shadow-04-11.json` (pula sem o arquivo): nenhuma morte, Druida mínimo 22 %, as curas dele por nome, e o laudo de
"quase morreu" cita o Angry Demon.

## Fora do desenho (YAGNI)

Nada que envie comando; nada automático nos slots; sem envio para fora; sem tela nova — tudo entra onde já existe (Radar, Magia, Log).

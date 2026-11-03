# Forja: a potência manda (02/11/2026)

Pergunta do dono: "A aba Forja da nossa automação, tá correto?" e "O certo da forja não é pegar equipamentos fortes
com potência maior e melhorar eles? Verifica no Discord e no YouTube. Faça um plano e, se tiver que implementar
melhorias, implemente."

## 1. O que a comunidade diz (lido em 02/11)

**Discord oficial, fórum guias-da-comunidade › "Equipes e Refinos" (Aranha, 28–31/10, 26 mensagens):**
- "O que você pegar com 400+ de potência primeiro você refina"; "400 base". Só drop de Elite/boss chega a 400+
  (caçada comum: 0–350; Elite 50–420; boss 250–500 — wiki /forja).
- Psyger-0 guarda toda peça de 400 para a forja. A Magic Plate Armor dele: +6, Rara, potência 601 (faixa IV),
  regen. de mana +4 e regen. de vida +4,1. Do +5 para o +6 foram 8 tentativas com Garantia.
- Refazer T2 só mexe na última linha; "cada tier é 5 de potência" (sistema de tiers do Thorgal).

**TV de Souza, "Como aumentar o seu dano – forja 2" (EZmUHmDpTFE):**
- "A base do item é potência alta. Não dá para trabalhar item de potência baixa." Peça chega na mão com 300–350 no
  mínimo; 250 e 200 dá, "mas você gasta mais". Meta: 600 (faixa IV), onde os valores das linhas ficam bons.
- Demonstração: arma de 186 precisou de 13 tentativas de T2 + Garantia (≈ 440 k cada) para chegar ao +9 e 600;
  "uma arma de 300–350 chega lá com +5/+6, muito mais barato".
- Ordem: refino (+1..+4 barato) → cruzar a faixa (600) → só então Refazer/Atributo/Limpeza nas linhas, porque o
  valor da linha é sorteado pela faixa da potência. Leilão é para item trabalhado; item de 400 cru vale preço de base.
- Alvos por vocação: Cavaleiro = proteção mágica + resistência a fogo no corpo, corpo a corpo + dano físico + crítico
  na arma; magos = dano mágico + dano do elemento + ML; Paladino = distância, dano físico + sagrado + crítico.

**TV de Souza, "Todas as mecânicas" (lS1PcddJuEA, 6:40–13:16 e 30:27–37:30):**
- A potência define o valor que os encaixes podem ter (regen. de mana 1,1–2,5 na faixa II, 1,7–3,4 na III, até 4,4
  na IV). "Uma varinha que veio com potência boa e ML+3 bate a de ML+1 com potência ruim."
- Filtro do depósito por potência 400 para achar as bases.
- **Thorgal (tiers)**: cópia igual + ouro (250 k no T1) = +1 tier; duas cópias = 100 % de chance; +1 ataque/armadura,
  +% das linhas e **+5 de potência por tier** — "falta 10 de potência para a faixa? Thorgal, sem arriscar o +6/+7".

**New Be, "10kk na forja" (FYUCWoV4vW0):** refino até +4 ≈ 1 kk, barato e seguro; a potência (290 → 440 no +3)
cruza a faixa e muda o intervalo dos atributos; o dinheiro vai nas linhas (só dano elemental/mágico; dano físico ≈ 10 %);
truque Ordem T2 + Limpeza T2 para tirar uma linha ruim do meio.

**Wiki /forja e /tiers (confirmadas em 02/11):** refino 80/70/60/50/35/25/20/15/10/5 %; +1..+4 não cai; +5..+10 cai 1
sem Garantia; refino = +1 ataque (arma) ou **+1 armadura em qualquer outra peça** (escudo, anel e colar incluídos) e
+50 de potência; potência total = base + 50 × refino + 5 × tier, teto 1000; tier não conta no desmanche.

## 2. O que o helper 2.42.0 já fazia certo

- Regras do jogo (chances, gemas, faixas, valores por faixa, desmanche) batem com a wiki; FORJAR testado ao vivo em
  19/10 (MPA +0 → +4).
- Refino padrão até +4; +5/+6 só cruzando faixa, com Garantia. "Faixa + Refazer" na linha de skill. Nunca rola Atributo
  atrás de skill (1 em 89). Ganho de cada linha já é calculado pela faixa (`valorTipico`), então uma linha numa peça
  de faixa I vale pouco por si.
- Equip (2.34.0) já guarda peça de potência base ≥ 400 que é boa para o espaço como "base de forja".

## 3. O que divergia

1. **Ranking marcava base de 400+ como "item de entrada"**: `fjRanking` só aceitava BiS vestida, Épico+ ou linha de
   skill. Guardian halberd 403, giant sword 401 e twin hooks 400 da ShamanBr (que o Equip manda guardar como base)
   saíam com "não vale". A comunidade diz o contrário: são exatamente as peças para forjar.
2. **Plano de linha em peça de potência baixa entrava como "melhor"**: uma Linha nova numa bota de 186 competia em
   pt/milhão com o refino. Os vídeos: linha só depois de a potência chegar (mínimo da fase: 350; meta 600).
3. **Tier do Thorgal desconhecido**: potência total ignorava os +5 por tier; a ajuda não falava do Thorgal.
4. **Escudo**: `efeitoOficial` somava o refino na DEFESA do escudo; a wiki (e `attrsComRefino`, que pontua) diz armadura.
5. **Texto da ajuda** da aba citava só os vídeos de 19/10 e "potência ≥ 300".

## 4. Mudanças (2.43.0)

### Task 1 — `potenciaTotal` com tier (EQUIP-PURO)
- `tierDe(p)` = `forja.tier` (0–5; campo ainda não visto ao vivo: sem ele, 0). `potenciaTotal` soma 5 × tier.
- `fragmentosDesmanche` desconta o tier (wiki /tiers: não conta no desmanche).
- Teste (equip.test.js): base 395 + tier 1 → 400 (faixa III); desmanche continua na faixa II (11 fragmentos no Épico).

### Task 2 — `fjEstrategias`: `potFinal` e `baixa`
- Cada estratégia ganha `potFinal` = potência no fim do plano (base + 50 × refino-alvo + tier) e `baixa` = plano de
  linha (`faixa`, `encaixe`, `encaixes`, `valor`, `completo`) com `potFinal` < `potenciaBaseForja(ctx)` (350 na fase 2,
  300 na fase 1). Refino nunca é `baixa`.
- Teste: bota 186 Incomum do Cavaleiro → Linha nova `baixa` (186), Completo +4 não (386); Snakebite 271 → faixa 421 não.

### Task 3 — `fjRanking`: base por potência e "melhor" sem linha baixa
- `bis` também quando `potenciaTotal ≥ POTENCIA_BASE_ALTA` (400) — a mesma régua do Equip 2.34.0 e do Discord.
- O "melhor" plano sai só entre os não-`baixa`; se nada sobra e a potência está abaixo do mínimo, o motivo diz
  "potência X abaixo de 350: as linhas valem pouco nesta faixa — refine ou forje numa base ≥ 350".
- Cada linha do ranking traz `pot`, `potMin`, `potBaixa`.
- Testes: halberd 403 Comum sem linha → `vale`; a mesma a 320 → `nao` (motivo cita 400); wand 186 só com linha → `nao`
  com o motivo da potência.

### Task 4 — tela e ajuda
- Selo "pot. baixa" na linha da peça; plano `baixa` marcado nos "+ planos".
- Texto de abertura e "? regras da Forja" reescritos: potência manda (400+ base; mínimo 350; meta 600), ordem refino →
  faixa → linhas, Thorgal (+5 por tier, cópia igual + ouro), fontes de 02/11.

### Task 5 — `efeitoOficial`: refino do escudo é armadura
- Bloqueio usa a defesa de fábrica; o refino do escudo entra na linha "armadura N → M" como nas outras peças.

### Task 6 — versão, TIBIDLE.md, memória, commit + push
- `@version` e `VERSAO` 2.43.0; nota "2.43.0" no fim do TIBIDLE.md (com o resumo da pesquisa); memória
  `tibidle-forja-potencia-2-43`.

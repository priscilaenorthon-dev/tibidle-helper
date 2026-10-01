# Roteiro de teste ao vivo — 2.13.1 + 2.13.2 (para 01/10)

> **Rodado em 01/10 com a 2.13.4** — resultado em `docs/resultado-2.13.1.md` (Inteligente aprovado no Scan A/B nos
> dois mapas; 2 defeitos novos no Radar).

> **Atualizado para a 2.13.2**: o item 0 já foi corrigido (a busca sempre avalia o Em área). Instale a **v2.13.2**
> e comece pelo item 1. Itens novos da 2.13.2 marcados com **(2.13.2)**.

A 2.13.1 já está no GitHub e instalada no Playwright. Ela recalibrou o Inteligente (dano por alvo, alvos por forma,
golpe básico, vida por criatura), mantém os suportes e as curas do dono e corrigiu 3 defeitos do Radar
(ver `TIBIDLE.md` → "2.13.1" e `docs/resultado-2.13.md`). Uma coisa por vez; marque `[x]`.
Testes curtos: nada de esperar 30 min à toa.

**Antes de começar**
- [ ] Anote os presets dos 4 (Status → DIAGNÓSTICO, ou a foto em `.playwright-mcp/presets-antes-2.13.json`).

## 0. Defeito achado no fim do dia 30/09 — ✅ CORRIGIDO na 2.13.2 (só conferir no item 1)
- [ ] **A busca não compara com o Em área quando existe um kit do Inteligente guardado para o mapa** (`kit_int`).
      Ao vivo em Vampire hell: o Inteligente escolheu 57,6k xp/h e +21,8k de lucro previstos, e o Em área, no mesmo
      simulador, dava 59,4k e +38,5k. Causa provável: `buscarParty` parte de `ctx.inicial` = o vigente (o kit fraco da
      2.13.0) e a party do Em área só entra em `todas` quando não há vigente. Correção: avaliar sempre a party do Em
      área na busca (entra na escolha global) e um teste com vigente guardado.
- [ ] Conferir também: com o Protector no slot livre do Knight (degrau 3 guardado para Vampire hell), o dreno dele
      (~10 de mana/s) deixa o Knight só com Lesser Front Sweep + poção. Ver se o degrau 3 ainda faz sentido (a vida
      mínima do Knight medida agora é 56 %) — ele desce sozinho só depois de 30 min.

## 1. Inteligente (aba Magia)
- [ ] **(2.13.2)** Com o Inteligente escolhido, aparece "⏳ CALIBRANDO o Inteligente neste mapa" (com a lista do que falta)
      ou "✓ Inteligente calibrado neste mapa". Em Vampire hell (já tem Scan) deveria estar calibrado ou quase.
- [ ] "replanejar do zero" em Vampire hell → CALCULAR: o previsto tem que ser ≥ ao do Em área (xp −3 % no máximo).
- [ ] Os suportes e as curas do dono continuam iguais depois do APLICAR (Train Party, Protect Party, Enchant Party,
      Heal Party; curas com os % do dono). Protector só se houver slot livre.
- [ ] A linha "regeneração de mana/s" mostra os valores medidos (Cav ~7, Pal ~8, Fei ~13, Dru ~17).
- [ ] APLICAR duas vezes com 1 min: o mesmo kit.

## 2. Scan A/B curto (o que decide)
- [ ] Scan → estudo de variantes: **Em área** e **Inteligente**; só **Vampire hell**; **4 min**; lure máximo; fim "voltar".
- [ ] Passa se o Inteligente tiver xp ≥ Em área −3 % e ouro estável ≥ o do Em área. Anote os 4 números.
- [ ] Compare o previsto da aba Magia com o medido (o simulador agora erra −5 %…+8 % nos Scans de 30/09).
- [ ] Se passar, repetir na Banshee. Se não passar, anotar e voltar para o Em área.

## 3. Radar
- [ ] Mapas → CALCULAR: Vampire hell e Banshee aparecem "medido · Em área" (o melhor Scan), não o do Inteligente.
- [ ] Loot: encerrar e recomeçar no mesmo mapa → "loot da sessão" volta a zero e bate com a janela do jogo.
- [ ] F5 no meio de uma caçada: a sessão do Loot NÃO zera.
- [ ] Dia: depois de um Scan, nenhuma linha "[object Object]" e "caçando" ≈ tempo real (sem "caçadas fechadas fora da
      página" com a página aberta). XP do dia ≈ diferença de xp do personagem.

- [ ] **(2.13.2)** Alertas: com um item que só você anuncia, NÃO aparece "vale anunciar"; nem quando o líquido fica
      abaixo do NPC.
- [ ] **(2.13.2)** Dia: uma caçada que cruzou a meia-noite com a página fechada aparece dividida entre os dois dias.

## 4. Pendentes antigos
- [x] Auto Hunt "nunca vender": PULAR — o dono confirmou (01/10) que vende equipamento de propósito (`nvEquip: false`).
- [ ] Mercado: um anúncio barato (precisa estar na cidade: os itens estão no depósito). O jogo aceita peça Incomum.

## 5. Fim
- [ ] Devolver os presets anotados, se algo ficou diferente.
- [ ] Resultado em `docs/resultado-2.13.1.md`.
- [ ] Se o Inteligente passar no Scan A/B: avisar — próximas melhorias combinadas: calcular ao escolher o mapa,
      calibrar caçando (sem Scan) e mostrar o kit no ranking do Radar.

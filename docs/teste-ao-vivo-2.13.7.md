# Roteiro de teste ao vivo — 2.13.7 (depois do update 1.1.0 do jogo)

O update 1.1.0 trocou a versão dos arquivos do jogo (`/assets/v167/` → `/assets/v170/`) e isso quebrava o helper
(o "nunca vender" do Auto Hunt e o Equip). A 2.13.7 acha a versão sozinha. Este roteiro confere isso e o conteúdo novo
do patch. Carta branca do CLAUDE.md; uma coisa por vez; marque `[x]`. Resultado em `docs/resultado-2.13.7.md`.

**Antes de começar**
- [ ] `git pull`; Tampermonkey na **v2.13.7** (título da gaveta); F5 no jogo.
- [ ] Anote os presets dos 4 (foto/Diagnóstico) — é o "desfazer".

## 0. O conserto do patch (o mais importante) 🟢
- [ ] Log: aparece **"jogo atualizado (assets v167 → v170): catálogos, ficha dos itens e tabelas de loot serão relidos"**
      (só na 1ª vez) e depois **"catálogos ok — N hunts"** com N **maior que 70** (hunts novas). Se não rebaixou,
      Status → botão de rebaixar catálogos.
- [ ] Status → **DIAGNÓSTICO**: sem erro novo.
- [ ] Equip → **ATUALIZAR**: lê sem erro de `items-by-name` (lista as peças dos 4, depósito e mochila).
- [ ] Progresso → **Imbuement**: a calculadora abre com os dados (não "sem catálogo").
- [ ] Na cidade, **Venda rápida** com um material de imbuement na mochila: o Log NÃO pode dizer "não consegui montar
      a lista nunca vender"; o material fica desmarcado (o equipamento vende, porque `nvEquip` está desligado de propósito).

## 1. Conteúdo novo do patch 🟢
- [ ] As **hunts novas** (Tibidle Island e Pits of Inferno) aparecem na aba Magia (lista de caçadas), no Scan e no Radar.
- [ ] As **4 ilhas novas** do NPC Silas (Forgotten Knowledge, Otherworld, The Inquisition, Warzone): as hunts delas
      aparecem? (anotar se precisam de acesso/item e se o helper mostra isso).
- [ ] Progresso → Bestiário: os marcos de **Quara's Domain Yalahar** batem com a janela BESTIÁRIO do jogo.
- [ ] Radar → Loot / tabela de **Thunderscar Peak**: o Energy Ring não aparece mais.
- [ ] Equip: algum equipamento que antes não aparecia (vinha como "Tools") aparece agora? Anotar.

## 2. Mapas novos e "⚡ 1 combo" 🟢 → 🔴
- [ ] Radar → Mapas → **CALCULAR** → ordem **⚡ 1 combo**: anote o top 5 (mapa, combos, xp/h, ouro/h, risco) — algum
      mapa novo entrou?
- [ ] 🔴 Scan de **5 min com Em área** no melhor mapa novo do top 5 (calibra o Inteligente lá). Depois aba Magia →
      Inteligente nesse mapa → CALCULAR: aparece "✓ calibrado" e "onda limpa em X s (N combos)".
- [ ] 🔴 Se valer: Scan A/B (Em área × Inteligente, 4 min cada) nesse mapa novo. Passa se o Inteligente tiver
      xp ≥ Em área −3 % e ouro estável ≥.

## 3. Inteligente (o que ainda não apareceu ao vivo) 🟢
- [ ] Anote quantas magias de ataque o Knight recebe nos mapas testados.
- [ ] Linha "cura X/h pelo tempo que os bichos ficam vivos": só aparece em mapa cujo Scan gastou **poção de vida**.
      Se algum Scan do item 2 gastou, conferir que a linha aparece.

## 4. Pendentes antigos (se der) 🟢
- [ ] Alertas do Radar: com um item que **só você** anuncia, CONFERIR não diz "vale anunciar".
- [ ] Dia: se houver uma caçada que cruzou a meia-noite com a página fechada, ela aparece dividida entre os dias.
- [ ] Chrome do dono: se a 2.13.5 rodou lá com um F5 no meio de uma caçada, o Dia de 01/10 dele pode estar com xp
      a mais (só conferir; o Playwright já foi consertado).

## 5. Fim
- [ ] Presets do começo devolvidos, se algo mudou.
- [ ] `docs/resultado-2.13.7.md`: o que passou, o que falhou (print/Log), top 5 do "1 combo", números dos Scans.
- [ ] Próximo combinado (depois deste roteiro): Inteligente calcula ao escolher o mapa, calibra caçando (sem Scan) e
      mostra o kit no ranking do Radar.

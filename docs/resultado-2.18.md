# Resultado do teste ao vivo — 2.18.0 a 2.19.0 (15/10/2026, 22:10–23:00)

Conta u2tag, nível 126, Premium (11 dias). Navegador do Playwright; Tampermonkey reinstalado pelo raw (2.17.6 → 2.19.0).
Jogo em assets **v198** (o helper avisou "v196 → v198: catálogos relidos"). Roteiro: `docs/teste-ao-vivo-2.18.md`.
Backup dos presets dos 4 antes de mexer: `.playwright-mcp/backup-presets-2026-10-15.json` (fora do git).

## 0. Básico — ✅
- Log: "catálogos ok — 113 hunts, 235 magias"; depois "dano real de 65 magias/runas lido de /spell-numbers".
- DIAGNÓSTICO: 22 ok · 0 faltando · 10 a conferir (os de sempre: skills da ficha e analisador só aparecem dentro da caçada).
- Trilho: 11 ícones (Status, Magia, Auto Hunt, Scan, Equip, Analisador, Progresso, Mercado, **Melhorias**, Radar, Log), 452 px
  de altura numa janela de 1003 px.
- O "2 erros não lidos" no ícone do Log ao subir a 2.19.0 era resto da sessão 2.17.6 (ERROS.total = 0; nada no Log).

## 1. Equip: arco/besta e defesa do Knight — ✅ (com observação)
- Paladino, arma: **hive bow comum, 0,28 pt** = attack +2 (0,152) + acerto +5 (0,125) + "munição grátis (arrow 25)"; "já é o
  melhor", sem outra arma de distância no estoque. A chance de acerto entra na conta (2.18.1). O valor é pequeno porque
  90 % do dano do Paladino é mágico (fracMagica 0,90).
- Knight: a linha aparece — **"vida mínima medida 43 % → armadura, defesa e resistências dele valem ¾ (ele não está
  passando aperto)"**. A medida veio do Scan de Petrified Hollow (hpMinK 43, golpesS 1,22 → bloqueios/s travados em 1).
- Escudo: o Knight já veste um **vampire shield incomum (regen. de mana 2,4) = 79,7 pt** (defesa 34 → 68,85 pt + regen 10,8);
  2º é um medusa shield (67,1). O escudo "armadura 18 + regen. mana 2,3 + regen. vida 2" do roteiro não existe mais no
  corpo/depósito. Os ~28,5 × ~20,7 do roteiro saem da fórmula com golpesS 0,45 (padrão sem medida) e folga ½; aqui, com
  1 bloqueio/s e folga ¾, 1 ponto de defesa = 1 × 0,75 × 3,6 × 0,75 = **2,025 pt** — a defesa do próprio heroic axe vale 48,6
  dos 55,6 pt dele. A régua segue coerente com o código, mas continua generosa com defesa (a Melhorias já avisa isso).

## 2. Melhorias — ✅ compra feita
- PROCURAR: **29 s**, "3125 peças à venda conferidas — 179 melhoria(s)" (Cav 45 · Pal 25 · Fei 90 · Dru 19); nada comprado.
- Recomendadas (2): leather boots raro 20.000 (cura própria 2,3 + regen. mana 1,5, **+1,3 pt**, 15.152 ouro/pt, ~33,7 h) e
  leather boots raro 65.000 (regen. mana 1,7 + regen. vida 1,4, +3,8 pt, 16.971 ouro/pt). Conferidas **no Mercado do jogo**
  (Botas → Leather Boots → +0 → Raro): Shalbux 20.000, potência 53, "Cura própria +2,3 % · Regen. de mana +1,5"; BrunxRibas
  65.000, potência 87 — iguais. As vizinhas da lista que perdem regen. de mana ou se pagam em > 48 h não foram recomendadas.
- "mostrar também as que perdem encaixe": 20 cartões com "⚠ perde regen mana/vida …" e **0 com botão COMPRAR**.
- Anúncio próprio: a conta está com **0 ordens abertas** (os 45 anúncios venceram) — o teste "o meu não aparece" ficou vazio.
- ⚒ Forjar a sua: 18 blocos. Ex.: heroic axe → "primeiro Raridade T1 (55 %), depois Atributo T1 11,2 % … ≈ 8,9 tentativas
  (90 % até 20) · 548.545 de ouro + 1.862 fragmentos ≈ 4,27 M por ~+0,3 pt → 13,35 M por ponto". Compra do dark armor:
  546.075 ouro/pt. Nenhum caso "mais em conta" apareceu.
- 🔴 **Compra**: 1º toque → "CONFIRMAR: comprar por 20.000?" (nada enviado); 2º toque → Log "comprando leather boots por
  20.000 (Cavaleiro, bota, +1,3 pt)…" → **"COMPRADO leather boots por 20.000 — está na mochila"**. Ouro **1.730.953 →
  1.710.953** (sem taxa), item na mochila, Equip relido sozinho (22:20:22, "1 trocas sugeridas"), a oferta sumiu e a de
  65.000 deixou de ser recomendada (contra a bota nova só rende +2,5 pt → 57 h). Equipada pela aba Equip ("só Cav (1)"):
  Log "Cavaleiro boots ← leather boots (mochila)", bota agora **12,7 pt** (era 11,0).
- Cosmético: o Log grava duas linhas quase iguais ("COMPRADO … está na mochila" e "comprado … equipe pela aba Equip").
- "Alguém compra antes": não provocado.

## 3. Ajuste fino da Magia — ✅ (com 2 achados)
- Magia → Inteligente → Yalahar Worker Golem (sem clicar em nada): **"sua barra hoje, prevista: 97,5k xp/h · lucro −42,1k/h ·
  onda limpa em 4,2 s"**. A última sessão do dono nesse mapa (02:03, lure 4) deu **96.904 exp/h**: XP batido em 0,6 %.
  O lucro não bate: medido +44.753 ouro/h contra −42,1k previsto (o simulador cobra poções/runas que o Analisador não vê
  assim, ou o loot entra baixo — fica para investigar).
- Caçada iniciada (22:24:54, lure Extremo = tier 4). Aos **3:54** a linha ganhou **"abates calibrados por esta caçada
  (×0,96)"** e a previsão passou a 89,5k xp/h — o Analisador marcava **EXP RAW/H 88,5k** (140k com o boost de +50 %).
- Sugestões: só slots de ataque; cura, suporte e poção intactos; mana mínima de quem muda nunca cai (sobe: Fei 12 → 82 %).
  "Montar a party do zero" ficou embaixo e só calcula no clique.
- **Achado 1 (corrigido na 2.19.1)**: antes da caçada apareceu "Cavaleiro: trocar Berserk por Brutal Strike · +0,1 % xp ·
  lucro −1,5k/h" com botão próprio — abaixo do corte (+2 % ou +3k/h). A flag `sozinhaValida` existia e a tela não a usava.
  Depois da calibração apareceu "Druida: … −1,7 % xp · +13,3k/h", mesmo caso.
- **Achado 2 (aberto)**: as sugestões mudam de cara a cada recálculo (minuto/calibração): 22:25 Fei Hell's Core → Great Fire
  Wave; 22:28 Cav Berserk → Lesser Front Sweep (+4,2 %); 22:28:48 (×0,96) Cav → Brutal Strike (+2,4 %), Fei → Rage of the
  Skies, Dru → Terra Wave. Vizinhos quase empatados trocam de lugar; o "Tudo junto" oscilou entre +2,7 % e +8,7 %.

## 4. Aplicar um ajuste e medir
(preenchido abaixo)

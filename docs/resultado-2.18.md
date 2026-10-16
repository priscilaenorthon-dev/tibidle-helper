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

## 4. Aplicar um ajuste e medir — ✅ passou
- Base (barra do dono, 22:24:54 → 22:32:35, 7:41 de sessão, 240 abates): Analisador **EXP RAW/H 89,9k** (142,4k com o boost
  de +50 %) · **LUCRO/H −58,4k** · ouro 1.710.421 → 1.703.475.
- 22:33: a única sugestão do recálculo era "Feiticeiro: trocar Hell's Core por Rage of the Skies · +0,2 % xp · lucro
  +15,3k/h · mana mínima 8 → 46 %". APLICAR ESTE AJUSTE: 1º toque → "CONFIRMAR: aplicar no Feiticeiro"; 2º toque → Log
  **"ajuste fino: Feiticeiro — trocar Hell's Core por Rage of the Skies (servidor confirmou)"**. Conferido no preset ativo
  (configAtiva dos 4): só `skills` e `minCreatures` do Feiticeiro mudaram; heals, supports e manaPotion iguais nos 4.
- Depois (Analisador zerado às 22:33:07, 8:00 de sessão, 264 abates): **EXP RAW/H 95,0k** (150,3k com boost) · **LUCRO/H −27k**.
  → XP **+5,7 %** e lucro **+31k/h** (previsto: +0,2 % e +15,3k). Ninguém morreu; a mana do Feiticeiro parou de zerar
  (1.162 → 1.296/3.607 no mesmo ponto da onda). Vida do Knight entre 1.255 e 1.998/2.004.
- Item 3 de novo com a barra nova: a sugestão aplicada não voltou. Às 22:41 vieram "Cavaleiro: pôr Brutal Strike na frente
  (+2,8 %)" e "Druida: Eternal Winter → Terra Wave (−1,4 % xp · +11,7k/h)" — a segunda é o caso `sozinhaValida = false`.
  Às 22:44 (já na 2.19.1): "Feiticeiro: trocar Rage of the Skies por Great Fire Wave (+2,3 %)" e "Druida: Strong Ice Wave
  antes de Eternal Winter (+1,7 % · +3,7k)" — as duas valem sozinhas, então sem nota (achado 2 de novo: a simulação troca
  de opinião entre Rage e Great Fire Wave).

## 5. Fim
- Presets: **não devolvidos** — o ajuste do Feiticeiro melhorou XP e lucro, fica. Backup em
  `.playwright-mcp/backup-presets-2026-10-15.json` se o dono quiser voltar (Hell's Core ≥2 no slot 1).
- Compra: leather boots raro (cura própria 2,3 + regen. mana 1,5) por 20.000, Knight, +1,3 pt (Melhorias) / 11,0 → 12,7 pt (Equip).
- 2.19.1 publicada (commit + push; raw entregando 2.19.1; Tampermonkey do Playwright reinstalado pelo raw e o jogo
  recarregado em caçada: huntId 161, lure 4, 1 painel). A nota "só compensa junto" não pôde ser vista ao vivo porque,
  no momento da recarga, as duas sugestões valiam sozinhas — coberta pelo teste novo em `inteligente.test.js`.
- Jogo deixado aberto, logado e caçando Yalahar Worker Golem (lure Extremo) na janela do Playwright.

## Pendências que saíram deste teste
(1 e 2 atendidas na 2.19.2, mesma noite — ver TIBIDLE.md.)
1. Lucro previsto × medido: −42,1k/h previsto contra +44,7k/h da sessão do dono (02:03) e −58,4k → −27k/h do Analisador
   hoje. O Analisador do jogo e o simulador não contam a mesma coisa (loot na mochila sem vender? poções?). Investigar.
2. Instabilidade das sugestões entre recálculos (achado 2): vizinhos quase empatados; talvez exigir margem (histerese)
   ou só trocar a sugestão quando a nova ganha da anterior por > 1 %.
3. Régua da defesa do Knight: com 1 bloqueio/s e folga ¾, defesa 34 = 68,9 pt (≈ 69 % do dano da party). Coerente com a
   2.18.2, mas generosa; rever quando houver medida de dano bloqueado no frame.

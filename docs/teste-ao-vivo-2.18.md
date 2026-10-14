# Roteiro de teste ao vivo — 2.18.0 a 2.19.0 (Melhorias, arco/besta, defesa do Knight, ajuste fino da Magia)

O que mudou: aba **Melhorias** (2.18.0: compra segura no Mercado; 2.19.0: comprar × forjar), arco e besta contando
no Paladino (2.18.1), defesa do Knight pela vida mínima medida (2.18.2) e o **Ajuste fino da sua barra** na aba Magia
(2.19.0). Carta branca do CLAUDE.md; uma coisa por vez; marque `[x]`. Resultado em `docs/resultado-2.18.md`.
🟢 = só lê · 🟡 = muda configuração (dá para desfazer) · 🔴 = gasta ouro ou troca de mapa.

**Antes de começar**
- [ ] `git pull`; Tampermonkey na **v2.19.0** (título da gaveta); F5 no jogo.
- [ ] Anote os presets dos 4 (foto ou Status → DIAGNÓSTICO): é o "desfazer" do item 4.
- [ ] Anote o ouro normal (carteira) — o item 2 pode gastar.

## 0. Básico 🟢
- [ ] Log: **"catálogos ok — N hunts"**, sem erro novo. Status → **DIAGNÓSTICO**: sem erro novo.
- [ ] O trilho tem **11 ícones** (Melhorias "⇧" antes do Radar) e cabe inteiro na tela.

## 1. Equip: arco/besta e defesa do Knight 🟢
- [ ] Equip → **ATUALIZAR** → Paladino → arma: a pontuação do arco/besta vestido mudou um pouco em relação à 2.18.0
      (ataque e acerto da arma contam agora). Anote: arma vestida, pt, e o que o Equip sugere no lugar.
- [ ] Equip → Knight: aparece a linha **"Knight: vida mínima medida X % → armadura, defesa e resistências dele valem …"**.
      Com vida mínima ≥ 60 % tem que dizer "metade". Sem Scan/medida recente: não aparece (vale cheio) — anotar.
- [ ] Knight → escudo: o seu escudo (armadura 18, regen. de mana 2,3, regen. de vida 2) continua **na frente** do
      Vampire Shield (esperado ~28,5 × ~20,7 com vida mínima 70 %). Anote os dois números.

## 2. Melhorias (a aba nova) 🟢 → 🔴
- [ ] **PROCURAR MELHORIAS NO MERCADO** (~40 s, só lê): o progresso passa pelas 8 categorias e termina com
      "N peças à venda conferidas". Nada é comprado.
- [ ] Em **Compras recomendadas**, abra 1–2 ofertas e confira **no jogo** (Mercado): mesmo item, mesmos encaixes, mesmo
      preço. Confira que "de onde vem" faz sentido (ex.: regen. de mana 2,0 → 3,4).
- [ ] Nenhuma recomendada **perde** regen. de mana (todos), regen. de vida (Knight) nem ML/skill/dano na arma e no colar.
      Marque "mostrar também as que perdem encaixe": essas aparecem com "⚠ perde …" e **sem** botão de compra.
- [ ] O seu próprio anúncio (se tiver um à venda) **não** aparece.
- [ ] **Comprar × forjar** (2.19.0): embaixo de um espaço com oferta aparece **"⚒ Forjar a sua (…)"** com a chance por
      gema, a média de tentativas, "90 % das vezes até N" e o ouro por ponto. Peça Lendária cheia: "os encaixes já estão
      todos ocupados". Anote um exemplo (espaço, compra X/pt, forja Y/pt).
- [ ] 🔴 **Primeira compra, barata**: escolha a recomendada mais barata (de preferência < 50 mil). 1º toque: o botão vira
      "CONFIRMAR: comprar por …" e nada acontece. 2º toque: o Log mostra "comprando …" e depois
      **"COMPRADO … — está na mochila"**. Confira no jogo: item na mochila, ouro debitado = preço (Premium, sem taxa).
- [ ] Depois da compra: a mesma oferta some da lista e o Equip foi relido sozinho. Equipe pela aba **Equip**
      (ATUALIZAR → EQUIPAR) — a Melhorias não equipa.
- [ ] Se der: com outra aba do Mercado, alguém compra o anúncio antes de você → o helper diz "não está mais à venda —
      nada comprado" (difícil de provocar; pule se não acontecer).

## 3. Ajuste fino da Magia (o pedido do dono) 🟢
- [ ] Aba Magia → modelo **Inteligente** → escolha o mapa onde está caçando. **Sem clicar em nada**, aparece
      **"Ajuste fino da sua barra"** com "sua barra hoje, prevista: X xp/h · lucro … · onda limpa em … s".
      Compare com o Analisador do jogo (xp/h real) — anote os dois.
- [ ] Depois de **3 min caçando** no mesmo mapa, a linha ganha **"abates calibrados por esta caçada (×k)"**. Anote k.
- [ ] Resposta possível 1: **"✓ A sua barra já está no melhor…"** — anote o mapa (é bom sinal: a barra é boa ali).
- [ ] Resposta possível 2: sugestões por personagem com "hoje: … / depois: …", +% xp, lucro e mana mínima. Confira:
      **nenhuma sugestão mexe em cura, suporte nem poção**; a mana mínima de quem muda não cai mais que 10 pontos.
- [ ] "Montar a party do zero (experimental)" ficou embaixo e só calcula no clique (CALCULAR O KIT).

## 4. Aplicar um ajuste e medir 🟡 → 🔴
- [ ] 🟡 Se houver sugestão: **APLICAR ESTE AJUSTE** (2 toques) no personagem com o maior +% xp. Log:
      "ajuste fino: <personagem> — … (servidor confirmou)". No jogo, o preset ativo dele mudou **só** nos slots de
      ataque/mínimos; cura, suporte e poção iguais.
- [ ] 🔴 Medir: 10 min caçando com a barra nova contra os 10 min de antes (Analisador: xp/h e lucro/h) — ou um Scan A/B
      curto (barra de antes × ajustada, 4 min cada) no mesmo mapa. Passa se o XP subir (ou o lucro, no caso de
      sugestão "mesmo XP, +lucro") e ninguém morrer nem ficar sem mana.
- [ ] Se piorou: devolva o preset anotado no começo e anote mapa, sugestão e números (vira teste).
- [ ] Repita o item 3 com a barra nova: a conta parte dela (a sugestão aplicada não aparece de novo).

## 5. Fim
- [ ] Presets do começo devolvidos, se algo piorou.
- [ ] `docs/resultado-2.18.md`: o que passou, o que falhou (print/Log), a compra feita (item, preço, ganho em pt) e os
      números do ajuste fino (previsto × medido, antes × depois).

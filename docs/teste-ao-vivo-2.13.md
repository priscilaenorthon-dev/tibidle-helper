# Roteiro de teste ao vivo — 2.13.0 (Inteligente v3 + aba Radar)

Para o Claude do VS Code rodar sozinho com a conta logada (carta branca do CLAUDE.md). Uma coisa por vez; marque
`[x]` o que passou, anote o que não passou com print do Log. No fim, escreva um relatório em `docs/resultado-2.13.md`.

**Antes de começar**
- [ ] `git pull` no main; Tampermonkey com a v2.13.0 (título da gaveta). F5 no jogo.
- [ ] Anote os presets de magia atuais dos 4 (print da barra de combate) — é o "desfazer".
- [ ] Status → DIAGNÓSTICO na cidade: sem erro novo.

## 1. Inteligente v3 (aba Magia)
- [ ] Escolha **Vampire hell**. Modelo **Inteligente** → o kit aparece em < 1 s, sem travar a página.
- [ ] Confira nos 4: no máximo 4 magias; nenhuma runa no Knight; nenhum Sharpshooter; nada de elemento imune ao mapa;
      curas presentes. Anote quantas magias de ataque o Knight recebeu e se alguém ficou com poção de mana.
- [ ] Clique APLICAR **duas vezes seguidas** (com 1 min entre elas): o kit **não pode mudar** da 1ª para a 2ª.
- [ ] Log diz "servidor confirmou"; os outros presets (2, 3, 4) continuam com nome.
- [ ] Deixe caçar ~5 min e veja se a aba mostra a regeneração de mana medida de cada um.

## 2. Comparação que decide (Scan A/B)
- [ ] Scan → estudo de variantes: marque **Em área** e **Inteligente**; mapas **Vampire hell** e **The Banshee Quest**;
      **7 min**; lure máximo; fim "voltar".
- [ ] No fim, compare nos cartões: xp/h sem boost e ouro/h. **Passa** se o Inteligente tiver xp ≥ Em área −2 % e
      ouro/h ≥ o do Em área nos dois mapas. Anote os 4 números.
- [ ] Confira que a party voltou ao mapa/lure/presets de antes.
- [ ] Se o Inteligente perder: volte o modelo para Em área e registre os números no relatório.

## 3. Aba Radar
**Ranking**
- [ ] CALCULAR: termina sem travar; mapas acima do seu nível aparecem marcados; nenhum erro no Log.
- [ ] Os mapas medidos no Scan do item 2 aparecem como "medido"; compare o estimado com o medido (anote a diferença %).
- [ ] O Top 5 faz sentido (nenhum mapa imune ao elemento dos magos no topo).

**Loot ao vivo**
- [ ] Numa caçada, os valores sobem a cada poucos segundos; "loot da sessão" bate (±5 %) com o loot da janela
      Estatísticas da caça do jogo.
- [ ] Encerre e recomece a caçada no **mesmo mapa**: o loot da sessão não pode herdar o valor da caçada anterior.
- [ ] Drop raro: só aparece item caro (não corncob/orc leather).

**Alertas**
- [ ] Adicione 2 itens do baú à lista; ATUALIZAR lê o mercado; nenhum anúncio/compra é criado (Log sem market_create).
- [ ] Ligue "vigiar" por 20 min: no máximo 2 leituras no Log; desligue depois.

**Relatório do dia**
- [ ] Mostra xp, ouro líquido, loot, mortes e tempo por mapa de hoje; "copiar" gera o texto.
- [ ] F5 no meio: os números do dia continuam.

## 4. Itens antigos que faltavam (roteiro 2.11)
- [ ] Item 6 — Auto Hunt com um equipamento e um material na mochila: o Log mostra "nunca vender: desmarquei".
- [ ] Item 8 — Mercado: anunciar 1 item barato. Anote se o jogo aceita peça Incomum+ (a wiki diz que não).

## 5. Fim
- [ ] Devolva os presets anotados no começo se algo ficou diferente do esperado.
- [ ] Relatório em `docs/resultado-2.13.md`: o que passou, o que falhou (com print/Log), os números do Scan A/B.

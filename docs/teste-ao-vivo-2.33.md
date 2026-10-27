# Roteiro de teste ao vivo — 2.32.1 a 2.33.0 (27/10)

Conta fraca (XundaBr, nível 29) primeiro; conta forte (ShamanBr) no fim, porque entrar numa derruba a outra.
Antes de começar: helper **2.33.0** na aba (Status mostra a versão; o console não pode dizer "outra cópia … não vai subir").

## A. Caçada do Halloween (caçada 1, faixa baixa) — na caçada

| # | O que fazer | O que tem que acontecer |
|---|---|---|
| 1 | Magia › **Discord** › escolher "Caçada da Estação (Halloween)" | Mostra "Northon - Caçada da Estação (Halloween, faixa baixa)" com a barra dos 4; no nível 29 nenhum aviso de magia faltando |
| 2 | **APLICAR O SETUP NOS 4** | Log: os 4 com "servidor confirmou"; a tela de atalhos do jogo mostra a barra nova; vida, mana, cura e suporte continuam os que configurei (Health Potion, Wound Cleansing, Magic Shield…) |
| 3 | Deixar caçar **5 min** e abrir Magia › detalhes | Ninguém morre; mana média de nenhum personagem cai abaixo de ~25 %; vida mínima do Cavaleiro acima de 40 %; abates/h igual ou maior que antes |
| 4 | Aguardar a chave cair | Log: "🎃 caiu a Pumpkin King Key"; aba Evento › passo 2 mostra a chave na mochila |

## B. Boss Pumpkin King — quando tiver a chave

| # | O que fazer | O que tem que acontecer |
|---|---|---|
| 5 | Magia › **Boss** › Pumpkin King › **APLICAR NOS 4** | Cav Brutal Strike/Lesser Front Sweep/Whirlwind Throw · Pal Ethereal Spear · Fei Great Energy Beam/Energy Beam/Energy Strike · Dru Energy Strike; só o ataque muda |
| 6 | Entrar no boss pela tela do jogo (gasta a chave) | Status mostra "boss em andamento"; o Auto Hunt e o Scan não disparam |
| 7 | Durante a luta: Magia › Formação › **APLICAR FORMAÇÃO** (2 toques) | Os 3 que mudam de casa se movem na cena; o Cavaleiro fica no centro |
| 8 | Fim da luta | Anotar: tempo para matar, se alguém morreu, se a Formação passou a mostrar as casas que o boss acertou |
| 9 | De volta à caçada: Magia › **Discord** › Caçada da Estação › APLICAR | A barra de área volta (as ondas dos magos) |

## C. Equip e ouro da conta nova — na cidade

| # | O que fazer | O que tem que acontecer |
|---|---|---|
| 10 | Equip › **ATUALIZAR** | Paladino, Feiticeiro e Druida com troca de colar do depósito; Paladino bow → icicle bow; wand/rod de nível 65 sem "dano da wand" (diz "pede nível 65") |
| 11 | Equip › **EQUIPAR** (se as trocas fizerem sentido para você) | Peças trocadas pelo socket; o depósito volta a ser lido |
| 12 | Melhorias e Forja: ler o ouro | Mostram o ouro **normal** (gold − travado), não o total |

## D. Depois do evento — mapa de nível baixo

| # | O que fazer | O que tem que acontecer |
|---|---|---|
| 13 | Entrar num mapa de recomendado ≤ 25 (ex.: Orcs Edron Cave, Rotworms, Dwarven Mines) | — |
| 14 | Magia › Discord › "Northon - <mapa>" › APLICAR | Barra completa, sem aviso de nível |
| 15 | Caçar **10 min** e conferir | Sem morte; mana não seca; lucro e xp/h no Analisador. Se algo não ficou bom, apago o "Northon - <mapa>" daquele mapa |
| 16 | (opcional) Scan do mapa: estudo de variantes **Discord + Em área**, 5 min cada | Diz qual dos dois rende mais xp e ouro nesse mapa |

## E. Conta forte (ShamanBr) — por último

| # | O que fazer | O que tem que acontecer |
|---|---|---|
| 17 | Magia › Discord › Caçada da Estação | Mostra o setup do nível 167 (caçada 263), **não** o da faixa baixa |
| 18 | Magia › Boss | The Lantern Reaper na lista |

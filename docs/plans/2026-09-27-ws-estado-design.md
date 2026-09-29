# Helper 2.0.0 — estado pelo WebSocket (desenho aprovado 27/09)

**Pedido do dono:** "reconhecimento de mapa e boss mais rápido; testa no jogo,
a DOM deve ter tudo". Investigação em `TIBIDLE.md §13` ("Protocolo WebSocket
mapeado de verdade"). Aprovado: itens 1 e 2 agora; o 3 (enviar comandos:
`update_battle_config`, `set_lure`) só depois de capturar um frame real.

## O que muda

1. **Hunt na hora.** `hunt_started` / `resume` (recebidos) trazem `huntId`;
   `ended` traz `summary.huntId`. O helper grava `hunt_id` no instante em que
   a mensagem chega. `confirmarHuntPeloExplore` (abre CAÇADAS, 1–2 s, modal)
   vira reserva: só roda se 10 s depois de entrar na caçada o socket não
   disse nada.
2. **Boss na hora.** O cliente envia `start_hunt {huntId:1, lure:1,
   bossId}`; o helper já intercepta `send`. Ao ver `bossId`, marca sessão de
   boss (`ESTADO.boss = nome`) e grava `boss_nome`; `ended` limpa. A aba
   Magia mostra "boss em andamento: X" e, no modelo Boss, usa esse boss sem
   precisar escolher na lista (a lista continua para planejar).
3. **Mochila, ouro, lure e "em caçada" pelo `frame`.** `frame.data.state`
   traz `cap{used,total}`, `balance`, `lureTier`, `active`. `lerMochilaOz`,
   `ouroAtual` e `emHunt` preferem o socket quando o último frame tem menos de
   5 s; senão caem no DOM como hoje. Nada de comportamento novo no ciclo.

## O que NÃO muda
- Nenhum frame é enviado pelo helper. Só leitura.
- Regras dos modelos, botões e Auto Hunt continuam iguais.

## Verificação
- F5 dentro da caçada: Log deve mostrar "hunt pelo socket: <título>" sem
  abrir CAÇADAS (se o servidor mandar `resume`); se não mandar, a reserva
  abre o modal como antes, 10 s depois.
- Status: CAP LIVRE e OURO batem com a tela; `__tbHelper.estadoWS()` mostra
  `{huntId, boss, cap, balance, lureTier, idadeMs}`.
- Boss: só quando o dono entrar num boss — o Log deve dizer "boss em
  andamento: <nome>".

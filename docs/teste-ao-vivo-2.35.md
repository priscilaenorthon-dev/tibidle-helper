# Roteiro de teste ao vivo — Tibidle Helper 2.35 (Log na nuvem)

Para o Claude rodar quando o dono chegar em casa (dono, 29/10: "anota isso no código para a gente testar quando eu chegar em
casa, para você fazer esses testes"). O dono só atualiza o helper nos 3 navegadores e abre o jogo; o resto é o Claude, lendo
o banco (Supabase, projeto `ysuiabhylwafhdsjqdjd`, schema `tibidle`) direto da sessão — sem precisar da tela do dono.

**Regras do teste**
- Tudo aqui é 🟢 (só leitura): o Log na nuvem nunca manda comando ao jogo.
- O dono pode ficar caçando normalmente; não tirar ninguém da caçada por causa do teste.
- Mortes do Druida em Hellgorak Seal e Shadow Nexus (28/10) são o primeiro alvo da análise — item 5.

---

## 0. Do lado do dono (uma vez por navegador) 🟢
- [ ] Tampermonkey → atualizar o helper para a **2.35.1** (ou mais nova) nos 3 navegadores e dar F5 no jogo.
- [ ] Aba **Status → avançado → "Log na nuvem"**: interruptor ligado por padrão, "conta: <nome>" preenchido pelo jogo.
      Em até 1 min aparece **"último envio HH:MM"**. Se aparecer "conta: ?", digitar um nome no campo "nome da conta" (avançado).
- [ ] Se aparecer **"erro: …"**: print para a conversa. (HTTP 403 = token diferente do banco; HTTP 404 = URL errada; "Failed to
      fetch" = rede/CSP do jogo bloqueando o fetch cruzado — nesse caso o plano B é `GM_xmlhttpRequest` com `@connect`.)

## 1. Chegada dos dados (Claude, no banco) 🟢
Consultas de partida (`execute_sql` no projeto):
```sql
select conta, count(*) n, min(t) de, max(t) ate from tibidle.log group by conta order by conta;
select conta, tipo, count(*) from tibidle.log group by 1, 2 order by 1, 2;
select conta, t, versao, dados->'nivel' nivel, dados->'hunt' hunt, dados->'cacando' cacando from tibidle.estado order by conta;
```
- [ ] As **3 contas** aparecem com nomes diferentes (o nome vem de `/auth/me`; "?" não pode aparecer).
- [ ] `versao` = 2.35.1 nas três.
- [ ] Tipos presentes por conta: `log`, `carga`, `estado` (tabela `estado`), e — se caçou — `batalha`, `razao`, `resumo`, `sessao`.
- [ ] `t` dos itens em horário coerente (o `t` é do navegador, `recebido` é do servidor; diferença de minutos é a fila, não erro).

## 2. Carga (primeiro envio de cada navegador) 🟢
```sql
select conta, msg, nivel, length(dados::text) tam from tibidle.log where tipo = 'carga' order by conta, msg;
```
- [ ] `personagens` presente nas 3: `dados.roster[]` com `equipment` por espaço e `forja` de cada peça; `skills`; `legado`;
      `depot` se o depósito já foi lido na cidade.
- [ ] `log`, `danos_<VOC>`, `radar_dias`, `radar_mortes`, `dano_mapa`, `sessoes` presentes onde a gaveta tinha conteúdo.
- [ ] Nenhum bloco acima de 200 mil chars (`nuvemCapar`); os cortados vêm com nível `av` e "(cortado…)" na msg.
- [ ] **Segredos**: `grep` no JSON de `personagens` e de `log` por `token`, `ticket`, `worldToken`, `cookie` — não pode ter nenhum.

## 3. Batalha ao vivo (com uma conta caçando ≥ 5 min) 🟢
```sql
select conta, t, msg, dados->'huntId' hunt, jsonb_array_length(dados->'eventos') ev, dados->'vitais'->'KNIGHT' kn
  from tibidle.log where tipo = 'batalha' order by t desc limit 10;
select conta, t, msg, dados->'danoTotal' dano, dados->'tomadoH' tomado_h, dados->'mortes' mortes from tibidle.log where tipo = 'razao' order by t desc limit 5;
```
- [ ] Um pacote `batalha` por minuto por conta caçando; `eventos[]` com `k` em {cast, hit, mhit, mcast, kill, spawn, wave…},
      `cast` com `hits[].amount`, `mcast` com `type` (elemento) e `hits[].who`.
- [ ] `vitais.<VOC>`: `hpMin ≤ hpFim ≤ maxHp`, `supplyUsed` muda quando bebe poção (comparar 2 pacotes seguidos).
- [ ] `razao` a cada 5 min: `danoTotal` cresce, `porVoc` soma ~100 %, `magias[]` com `danoPorMana`.
- [ ] Cruzar 1 minuto: soma dos `amount` de `cast`+`hit` no pacote ≈ crescimento de `danoTotal` entre dois `razao`.
- [ ] Ao encerrar a caçada (ou morrer): chega `resumo` com `dados.reason` (e `deathCause[]` na morte) **depois** do último `batalha`
      daquele minuto (o `ended` fecha o pacote antes).

## 4. Robustez 🟢
- [ ] Desligar a rede 2 min com o jogo aberto: a tela mostra "erro: Failed to fetch", a fila cresce (contador "fila N"); ao voltar,
      um envio só com tudo (fila ≤ 600; linhas mais velhas saem primeiro).
- [ ] Interruptor desligado: para de enfileirar na hora (fila não cresce) e nada chega no banco daquela conta.
- [ ] Nada do log na nuvem aparece na aba **Log** do helper (falha de envio fica só na tela do bloco).
- [ ] F5 no jogo: nova carga (`tCarga` zera por página); sem F5, a carga seguinte só depois de 6 h.

## 5. Análise (a razão de tudo isso) 🟢
- [ ] Mortes do Druida (Hellgorak Seal, Shadow Nexus): em `carga/radar_mortes` e `carga/dano_mapa` (histórico) e, nas caçadas
      novas, em `batalha`/`razao`/`resumo` — qual elemento, qual criatura, vida mínima dele antes, poção e mana no minuto.
- [ ] Por conta: equipamento de cada um (`personagens`) × o que a régua sugere (Equip/Melhorias/Sobreviver) — o que está fora.
- [ ] Devolver ao dono: 1 página por conta com dano por personagem, mana, mortes, trocas de equipamento e as melhorias propostas.

## Resultado
Anotar em `docs/resultado-2.35.md` (o que passou, o que não, prints do dono) e a nota de versão no fim do `TIBIDLE.md`.

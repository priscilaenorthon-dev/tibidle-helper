> **29/10, depois deste teste: o Log na nuvem saiu do helper na 2.35.3 (pedido do dono). Este arquivo fica só como registro.**

# Resultado do teste ao vivo — Log na nuvem 2.35.2 (29/10, ShamanBr, nível 172, Fire Portal)

Rodado pelo Claude no navegador do Playwright (Tampermonkey atualizado pelo link raw: 2.33.7 → 2.35.2), lendo o banco
direto (`ysuiabhylwafhdsjqdjd`, schema `tibidle`). Só 1 das 3 contas: as outras duas não estavam abertas.

| Item | Resultado |
|---|---|
| 0. ligado por padrão, conta pelo `/auth/me` | ✅ `on: true`, conta "ShamanBr", primeiro envio 21:14 |
| 1. chegada | ✅ `log`, `carga`, `mercado`, `razao`, `batalha` e a foto em `tibidle.estado` (versão 2.35.2, nível 172, Fire Portal 226) |
| 2. carga | ✅ 20 blocos; maior `dano_mapa` 177 mil chars (< 200 mil); `personagens` com roster dos 4, skills, perfis, battleConfigs, eco, bossCooldowns. Sem `legado` (não veio do jogo) e sem `depot` (depósito não lido nesta página) |
| 2. segredos | ✅ 0 linhas com ticket/token/worldToken/senha fora de `***` |
| 3. batalha | ✅ 1 pacote por minuto, 400–480 eventos (`mcast`, `mhit`, `cast` com `hits[].amount`, `heal`, `manapotion`, `kill`, `spawn`, `wave`…); `vitais.<VOC>` com hpMin ≤ hpFim ≤ maxHp e `supplyUsed` crescendo (Druida: 2.496 → 2.503 Great Mana) |
| 3. razão | ✅ a cada 5 min; `porVoc` soma 100 % (Fei 36, Dru 35, Pal 26, Cav 3). ⚠ sai em dobro quando o envio é forçado (dois `razao` iguais a 21 ms) |
| 3b. mercado | ✅ 53 linhas em 8 min — é a vigia das Pechinchas (market_list/stats/catalog/my_orders); ~7 KB/min |
| 4. sem rede | ✅ Supabase bloqueado 2 min: "Failed to fetch", fila 1 → 2 → 5; ao liberar, um envio só, fila 0 |
| 4. interruptor | ✅ desligado: fila parada (2 → 2 em 65 s), nada enviado |
| 4b. tamanho | ⚠ ver abaixo |
| 5. mortes do Druida | ⏳ nesta conta não há dado: Shadow Nexus com 3 sessões sem morte, Hellgorak ausente. Falta rodar com as outras contas |

## ⚠ O banco não tem a limpeza que o TIBIDLE.md descreve
`public.tb_log_enviar` no banco ainda é a primeira: apaga só o que tem mais de **45 dias**; não existe `tibidle.limpar()`,
nem o limite de 3 cargas, nem o freio de 250 MB, nem o corte de 300 mil chars. E o projeto é compartilhado com outro sistema
do dono (funções de aluno/academia/desafio): lotar os 500 MB do plano free afeta os dois.

Volume medido: batalha ~14,5 KB/min no disco (comprimido) + mercado ~7 KB/min ≈ **30 MB/dia por conta caçando 24 h**
(a conta do TIBIDLE.md supunha 2 h/dia). Três contas ≈ 90 MB/dia → os 500 MB acabam em ~5 dias.

O SQL da correção está em `docs/supabase-tibidle.sql` (10 dias, 3 cargas por bloco, freio de 250 MB medido pelo dado vivo —
o arquivo da tabela não encolhe com delete —, item > 300 mil chars descartado, `limpar()` em ~1 de cada 20 envios).
Não foi aplicado: a permissão foi recusada no teste. Aplicar pelo SQL Editor do Supabase ou liberar o `apply_migration`.

# Resultado do teste ao vivo — 2.13.4 (01/10, 18:44–19:20)

Roteiro `docs/teste-ao-vivo-2.13.1.md` a partir do item 1 + itens novos da 2.13.3/2.13.4. Playwright, conta do dono,
nível 76. Helper atualizado pelo raw (2.13.1 → **2.13.4**), `tb_helper_debug` ligado para ler o estado.
Presets dos 4 fotografados antes (`.playwright-mcp/presets-antes-2.13.4.json`) e **devolvidos exatamente** no fim.
Prints em `docs/prints-2.13.1/` (só local: o `.gitignore` não deixa `*.png` ir para o repositório público).

> Às 18:47:58 a caçada parou e a party vendeu na cidade — foi o **dono** (confirmado na conversa), não o helper.
> O 1º APLICAR caiu nesse momento e saiu "na cidade: vale na próxima caçada".

## Resumo
| Item | Resultado |
|---|---|
| Antes: v2.13.4 pelo raw, presets fotografados | ✅ |
| 0. Degrau 3 / Protector em Vampire hell | ✅ degrau 1 (vida mín. do Knight 70–75 %), sem Protector |
| 1. "✓ Inteligente calibrado neste mapa" (Vampire hell) | ✅ |
| 1. replanejar do zero ≥ Em área −3 % | ✅ 58,4k × 57,6k (+1,5 %) no mesmo simulador |
| 1. Cálculos seguidos dão o mesmo kit | ⚠️ 3 cliques: 56,8k (2 magias em todos) → 58,4k → 58,4k (1 magia no Knight/Fei/Dru) |
| 1. Suportes e curas do dono mantidos | ✅ Train/Protect/Enchant/Heal Party, curas com os % do dono, poção de mana Knight 30 % e Druida 20 % |
| 1. Regeneração medida na aba | ✅ Cav 7,1 · Pal 8,1 · Fei 13,1 · Dru 17,1 (medida) |
| 1. APLICAR 2× com 1 min: mesmo kit | ✅ "mantém (menos de 10 min desde o APLICAR)" |
| **(2.13.3)** "onda limpa em X s (N combos)" | ✅ "onda limpa em 1,1 s (⚡ 1 combo)" |
| **(2.13.4)** "cura X/h pelo tempo que os bichos ficam vivos" | ➖ não aparece — e não é defeito: nenhum Scan de Vampire hell/Banshee gastou poção de vida (`curaPorVivo = 0`) |
| **(2.13.3)** Knight: magias de ataque | **1** (Berserk 1+) no replanejar do zero; 2 (Berserk + Groundshaker) no cálculo instável |
| 2. Scan A/B Vampire hell | ✅ **Inteligente passa**: xp +5,5 %, ouro estável −1,4k × −7,3k |
| 2. Scan A/B Banshee | ✅ **Inteligente passa**: xp +8,6 %, ouro estável −2,7k × −8,8k |
| 2. Volta ao mapa/lure/presets | ✅ Vampire hell lure 6, "kits de 4 personagem(ns) devolvidos" |
| 3. Radar: Vampire hell e Banshee "medido" pelo melhor Scan | ✅ (agora o melhor é o Inteligente nos dois) · ⚠️ ouro/h do medido é o bruto com sorte |
| **(2.13.3)** Radar ordem "⚡ 1 combo" | ✅ ver top 5 abaixo · ⚠️ estimado de Vampire hell dizia 2 combos; a aba Magia e o Scan dizem 1 |
| 3. Loot: recomeçar no mesmo mapa zera a sessão | ✅ 1 min ↔ 0:54 do jogo; líquido/h −15,7k ↔ −15,2k |
| 3. Loot: F5 no meio não zera | ✅ início 19:07:55 mantido (290 → 306 s) · ⚠️ depois do F5 os itens mostram NPC 0 até rodar CALCULAR |
| 3. **Drop raro em dobro** | ❌ spike sword registrada 2× (só 1 na mochila) — Loot "Últimos raros" e Dia |
| 3. Dia: sem "[object Object]", "caçando" ≈ real, XP ≈ personagem | ✅ 26 min; 27,9k × 28.073 de xp do personagem desde 18:44 |
| 3. **Dia: caçada que já rodava com a página fechada** | ❌ as 3h32 antes de abrir a página (≈ 220k de xp) não entraram no dia |
| **(2.13.2)** Alertas: item que só você anuncia | ➖ não exercitado: o Wild Honey tem 17 anúncios de outros (menor a 1). "2 itens conferidos — nenhum alerta novo" |
| 3. Alertas durante o Scan | ✅ bloqueado: "radar: alertas não conferidos — Scan em andamento" |
| **(2.13.2)** Dia: caçada que cruzou a meia-noite | ➖ não testável hoje |
| 4. Auto Hunt "nunca vender" | ➖ pulado (decisão do dono, `nvEquip: false`) |
| 4. Mercado: um anúncio barato | ✅ crowbar incomum ×1 a **1.443** (menor de outro 1.444; líq. 1.371 > NPC 50; taxa 72), 2 toques |
| 5. Presets do começo devolvidos | ✅ `profiles_set` com a foto; o servidor confirmou ao recomeçar Vampire hell (lure 6) |

## 2. Scan A/B (4 min cada, lure máximo, nível 76)
| Mapa | Modelo | xp/h sem boost | xp/h real | abates/h | ouro/h estável | bruto | gasto poção/runa | **poção de vida** | **onda: matar + espera** |
|---|---|---|---|---|---|---|---|---|---|
| Vampire hell | Em área | 61,7k | 66,6k | 1.873 | −7.343 | −6.897 | 16,5k/h | **0** | **1,6 s** + 9,9 s (spawn limita) |
| Vampire hell | Inteligente | **65,1k (+5,5 %)** | 70,3k | 1.967 | **−1.445** | +18.819 | 12,5k/h | **0** | **1,3 s** + 9,8 s (spawn limita) |
| Banshee | Em área | 55,0k | 60,5k | 1.099 | −8.793 | −4.337 | 54,5k/h | **0** | **5,5 s** + 10,1 s |
| Banshee | Inteligente | **59,7k (+8,6 %)** | 65,7k | 1.194 | **−2.731** | −1.985 | 53,6k/h | **0** | **6,0 s** + 9,4 s |

Critério (xp ≥ Em área −3 % e ouro estável ≥ o do Em área): **aprovado nos dois mapas**.

- Poção de vida: nenhuma nas 4 medições (só poção de mana e runas). Vida mínima do Knight: 67 %/61 % (Vampire Em
  área/Int), 61 %/71 % (Banshee Em área/Int) — nunca chegou aos 45 % da poção. Por isso a 2.13.4 fica com
  `curaPorVivo = 0` e não mostra a linha "cura X/h" nestes mapas.
- Vida curada/h (`curaH` do Scan, magias de cura): Vampire 0 × 6.616; Banshee 6.075 × 0.
- O bruto de +18,8k do Inteligente em Vampire hell é sorte (black pearl, spike sword, demonic skeletal hand: +20,3k/h).
- Kits medidos (Inteligente): Vampire hell = Knight Berserk · Pal Divine Caldera + avalanche · Fei Energy Wave · Dru
  Strong Ice Wave (5 slots, todos 1+). Banshee = Knight Groundshaker + Berserk · Pal Caldera + avalanche · Fei Energy Wave +
  Rage of the Skies + thunderstorm · Dru Strong Ice Wave + Eternal Winter + avalanche (10 slots; Log: "não se paga: nenhum
  kit passou no piso de lucro — ficou o de maior lucro garantido").

### Previsto (aba Magia) × medido
| | previsto xp/h | medido (sem boost) | erro | previsto onda | medido onda |
|---|---|---|---|---|---|
| Vampire hell Em área | 57,6k · 1.727 abates/h | 61,7k · 1.873 | −7 % | 1,0 s | 1,6 s |
| Vampire hell Inteligente | 58,4k · 1.752 abates/h | 65,1k · 1.967 | −10 % | 1,1 s | 1,3 s |
| Banshee Em área | 50,7k · 1.015 abates/h | 55,0k · 1.099 | −8 % | 5,2 s | 5,5 s |
| Banshee Inteligente | 50,7k · 1.015 abates/h | 59,7k · 1.194 | −15 % | 5,2 s | 6,0 s |

O simulador agora erra **para baixo** (−7…−15 %), e a ordem Inteligente ≥ Em área bateu no medido. Na Banshee ele previa
empate de xp; o medido deu +8,6 % para o Inteligente.

## Radar — top 5 do "⚡ 1 combo" (motor inteligente, nível 76)
Depois dos Scans de hoje (fator de loot 0,54, n = 4 Scans · abates ×1,01):

| # | Mapa | combos | xp/h | ouro/h | risco |
|---|---|---|---|---|---|
| 1 | Vampire hell (medido) | 1 | 65,1k | +18,8k | baixo |
| 2 | Djinns Marid Territory | 1 | 51,6k | −724 | baixo |
| 3 | Orc Fortress | 1 | 45,7k | −778 | baixo |
| 4 | Cyclops Mistrock | 1 | 40,4k | −963 | baixo |
| 5 | Coryms Lair | 1 | 40,1k | +6,4k | baixo |

Antes dos Scans (sem calibração: os Scans de 30/09 eram do nível 71, fora do ±2 → fator 0,35 padrão, todos "estimado"):
Djinns Marid 51,6k/−9,7k · Orc Fortress 45,7k/−7,2k · Coryms Lair 40,1k/−2,5k · Cyclops Mistrock 39,0k/+14,6k ·
Mutated Humans 36,9k/+6,8k (todos 1 combo, risco baixo). Vampire hell aparecia "2 combos", 52,4k.
Pela ordem de xp, o 1º é Yalahar Worker Golem (69,4k, 5 combos, estimado).

## Defeitos
### ❌ 1. Drop raro registrado em dobro (Radar → Loot e Dia)
```
18:57:40 radar: drop raro — spike sword ×1 (1.000 de ouro no NPC) em Vampire hell     ← durante o Scan (Inteligente)
18:58:31 Scan: Vampire hell [Inteligente] — … raros: spike sword ×1 …
18:58:34 Scan: de volta a Vampire hell (lure 6), como antes do Scan
18:58:50 radar: drop raro — spike sword ×1 (1.000 de ouro no NPC) em Vampire hell     ← 16 s depois do recomeço
```
Na mochila há **uma** spike sword (`mochilaEquip()`; nada foi vendido entre 18:48 e o fim). O Dia mostra
"raros: spike sword ×1, spike sword ×1" (print `dia-raros-duplicados.png`), e as entradas de 24 h do Loot também vêm em
pares (spike sword ×2, blood preservation ×2), então acontece sempre que se recomeça no mesmo mapa.
A trava `huntId|nome|contagem do analisador` (`radarObservar`, ~linha 10266) não segurou: a contagem do item no
analisador mudou entre os dois frames. Provável: no recomeço do mesmo mapa o 1º frame (elapsedMs < 5 s → base zerada)
ainda traz os drops da caçada anterior. Correção sugerida: chave sem a contagem (`huntId|nome|t0 da caçada` + janela de
tempo), ou não contar drops no frame que zerou a base.

### ❌ 2. Dia perde a caçada que já rodava com a página fechada
A party caçava em Vampire hell havia 3h32 (≈ 63k xp/h) quando a página abriu às 18:44; o dono encerrou às 18:48.
O Dia contou só os 4 min vistos pelos frames ("caçando 5min", 5,8k de xp). Causa: sem base guardada (> 12 h), o 1º
frame vira base com delta 0; no `ended` a base é recente (< 90 s) e `tpDeltaResumo` devolve `null`, então o resumo da
caçada não soma o que veio antes da página. Correção sugerida: quando o 1º frame de uma caçada chega sem base e com
`elapsedMs` grande, lançar esse trecho como "offline" (como já é feito com a caçada fechada fora da página).

### ⚠️ 3. Inteligente: cálculos seguidos dão kits diferentes
```
18:47:14 Inteligente: Vampire hell — 4064 triagens + 165 parties em 125 ms (NOVO)   → 56,8k, 2 magias em todos
18:47:16 Inteligente: Vampire hell — 3956 triagens + 165 parties em 134 ms (NOVO)   → 58,4k, Knight/Fei/Dru com 1 magia
18:47:17 Inteligente: Vampire hell — 3956 triagens + 165 parties em 133 ms (NOVO)   → 58,4k (igual)
```
A escolha global de `buscarParty` olha `ctx.memo`, que acumula parties de cliques anteriores; a busca parte do vigente.
O resultado depende do caminho e converge depois de 2 cliques. Todos ficaram dentro de −3 % do Em área, então não
reprova, mas o dono pode ver kits diferentes ao clicar de novo.

### ⚠️ 4. Menores
- Radar: o ouro/h de mapa **medido** é o bruto do Scan, com sorte (Vampire hell +18,8k; o estável foi −1,4k).
- Radar estimado × Magia: Vampire hell "2 combos" no Radar estimado e "1 combo" (1,1 s) na aba Magia; o Scan mediu
  1,3 s (1 combo). Os dois motores calculam T de jeitos diferentes.
- Loot depois do F5: "sem a tabela de loot deste mapa" — os itens ficam com NPC 0 até rodar CALCULAR em Mapas.
- Mercado: "Meus anúncios" mostrou 50 antes e 50 depois do anúncio do crowbar (o crowbar aparece na lista).
- APLICAR NOS 4 aplica no 1º toque (meu 2º toque aplicou de novo o mesmo kit).

## O que mudou na conta
- Presets: aplicados Em área/Inteligente pelo Scan e o Inteligente pelo APLICAR; **devolvidos** à foto do começo
  (Knight Berserk + Groundshaker · Pal Divine Caldera · Fei Energy Wave + Great Fire Wave · Dru Strong Ice Wave + Ice Wave,
  curas/suportes/poções do dono). O servidor confirmou ao recomeçar.
- Caçada: 2 Scans (Vampire hell e Banshee, ~18 min), uma parada às 19:14 para anunciar; party de volta em Vampire hell
  lure 6 às 19:17.
- Mercado: 1 anúncio novo (crowbar incomum a 1.443, taxa 72). Nada mais anunciado nem cancelado.
- Auto Hunt continuou ligado como estava (hunt 155, 50 % livre); não disparou.

## Próximo
O Inteligente passou no Scan A/B — seguir com o combinado: calcular ao escolher o mapa, calibrar caçando (sem Scan) e
mostrar o kit no ranking do Radar. Antes, corrigir os defeitos 1 e 2 (Radar) e firmar o kit da busca (3).

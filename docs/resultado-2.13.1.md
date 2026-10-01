# Resultado do teste ao vivo — 2.13.4 (01/10, 18:44–19:20)

Roteiro `docs/teste-ao-vivo-2.13.1.md` a partir do item 1 + itens novos da 2.13.3/2.13.4. Playwright, conta do dono,
nível 76. Helper atualizado pelo raw (2.13.1 → **2.13.4**), `tb_helper_debug` ligado para ler o estado.
Presets dos 4 fotografados antes (`.playwright-mcp/presets-antes-2.13.4.json`) e **devolvidos exatamente** no fim.
Prints em `docs/prints-2.13.1/` (só local: o `.gitignore` não deixa `*.png` ir para o repositório público).

> Às 18:47:58 a caçada parou e a party vendeu na cidade — foi o **dono** (confirmado na conversa), não o helper.
> O 1º APLICAR caiu nesse momento e saiu "na cidade: vale na próxima caçada".

> **Atualizado depois das correções (2.13.5, mesmo dia):** o "raro em dobro" **não era defeito** (eram 2 spike swords
> de verdade — ver "Defeitos" 1). Os demais ⚠️/❌ foram corrigidos na 2.13.5, e o reteste achou mais dois (ordens do
> Mercado paginadas e Alertas sem as suas ordens), também corrigidos.

## Resumo
| Item | Resultado |
|---|---|
| Antes: v2.13.4 pelo raw, presets fotografados | ✅ |
| 0. Degrau 3 / Protector em Vampire hell | ✅ degrau 1 (vida mín. do Knight 70–75 %), sem Protector |
| 1. "✓ Inteligente calibrado neste mapa" (Vampire hell) | ✅ |
| 1. replanejar do zero ≥ Em área −3 % | ✅ 58,4k × 57,6k (+1,5 %) no mesmo simulador |
| 1. Cálculos seguidos dão o mesmo kit | ⚠️ 3 cliques: 56,8k (2 magias em todos) → 58,4k → 58,4k (1 magia no Knight/Fei/Dru) → **2.13.5: histerese do kit mostrado** |
| 1. Suportes e curas do dono mantidos | ✅ Train/Protect/Enchant/Heal Party, curas com os % do dono, poção de mana Knight 30 % e Druida 20 % |
| 1. Regeneração medida na aba | ✅ Cav 7,1 · Pal 8,1 · Fei 13,1 · Dru 17,1 (medida) |
| 1. APLICAR 2× com 1 min: mesmo kit | ✅ "mantém (menos de 10 min desde o APLICAR)" |
| **(2.13.3)** "onda limpa em X s (N combos)" | ✅ "onda limpa em 1,1 s (⚡ 1 combo)" |
| **(2.13.4)** "cura X/h pelo tempo que os bichos ficam vivos" | ➖ não aparece — e não é defeito: nenhum Scan de Vampire hell/Banshee gastou poção de vida (`curaPorVivo = 0`) |
| **(2.13.3)** Knight: magias de ataque | **1** (Berserk 1+) no replanejar do zero; 2 (Berserk + Groundshaker) no cálculo instável |
| 2. Scan A/B Vampire hell | ✅ **Inteligente passa**: xp +5,5 %, ouro estável −1,4k × −7,3k |
| 2. Scan A/B Banshee | ✅ **Inteligente passa**: xp +8,6 %, ouro estável −2,7k × −8,8k |
| 2. Volta ao mapa/lure/presets | ✅ Vampire hell lure 6, "kits de 4 personagem(ns) devolvidos" |
| 3. Radar: Vampire hell e Banshee "medido" pelo melhor Scan | ✅ (agora o melhor é o Inteligente nos dois) · ⚠️ ouro/h do medido era o bruto com sorte → **2.13.5: estável** |
| **(2.13.3)** Radar ordem "⚡ 1 combo" | ✅ ver top 5 abaixo · ➖ o "2 combos" do Radar foi a mesma conta em outro momento (ver Defeitos 4) |
| 3. Loot: recomeçar no mesmo mapa zera a sessão | ✅ 1 min ↔ 0:54 do jogo; líquido/h −15,7k ↔ −15,2k |
| 3. Loot: F5 no meio não zera | ✅ início 19:07:55 mantido (290 → 306 s) · ⚠️ depois do F5 os itens mostravam NPC 0 → **2.13.5: tabela guardada** |
| 3. Drop raro em dobro | ✅ **não era defeito**: 2 spike swords de verdade (o jogo vende o loot sozinho; a mochila não prova nada) |
| 3. Dia: sem "[object Object]", "caçando" ≈ real, XP ≈ personagem | ✅ 26 min; 27,9k × 28.073 de xp do personagem desde 18:44 |
| 3. **Dia: caçada que já rodava com a página fechada** | ❌ as 3h32 antes de abrir a página (≈ 220k de xp) não entraram no dia → **2.13.5: corrigido** |
| **(2.13.2)** Alertas: item que só você anuncia | ➖ não exercitado (Wild Honey tem 17 anúncios de outros) · ❌ e a regra estava desligada: as suas ordens não eram lidas → **2.13.5: o CONFERIR lê** |
| Mercado: "Meus anúncios" | ❌ 50 antes e depois do crowbar: o servidor manda em **páginas de 50** e o dono tem 55 → **2.13.5: lê todas** |
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

## Defeitos (e o que a 2.13.5 fez)
### ✅ 1. "Drop raro em dobro" — NÃO era defeito
```
18:57:40 radar: drop raro — spike sword ×1 em Vampire hell     ← durante o Scan (Inteligente)
18:58:34 Scan: de volta a Vampire hell (lure 6)
18:58:50 radar: drop raro — spike sword ×1 em Vampire hell     ← 16 s depois do recomeço
18:59:25 sessão fechada: Vampire hell · +25052 ouro/h · 68289 exp/h   ← sessão de 51 s: a espada de 1.000 explica o +25k/h
```
A prova pela mochila estava errada: o jogo **vende o loot sozinho** (`frame.state.autoSellInMs`), e a espada de
antes (`iid` muq2fsg5…) já tinha sumido quando outra (muq3i89h…) caiu. No reteste, gravando os frames de 19:17 a
19:31, o resumo do servidor deu `"spike sword": 2` nessa caçada e o Radar registrou exatamente 2 (19:27:34 e
19:31:14). A spike sword cai ~8×/h em Vampire hell com lure 6 — é "rara" pela regra (chance < 1 % e ≥ 5× o loot por
abate).

### ❌→✅ 2. Dia perdia a caçada que já rodava com a página fechada
O 1º frame sem base virava base com delta 0, e no `ended` a base era recente (< 90 s): `tpDeltaResumo` devolvia
`null`. **2.13.5:** `tpTrechoAntes` lança como "offline" o que o analisador já tinha no 1º frame de uma caçada que a
página não viu começar (mesma caçada = mesma hora de início ±5 min, ou base de < 2 min no mesmo mapa). Teste no
`vm`: página aberta numa caçada de 3h32 → o dia fica com o xp da caçada inteira, e o fim com a página aberta não soma
de novo.

### ⚠️→✅ 3. Inteligente: cálculos seguidos davam kits diferentes
```
18:47:14 Inteligente: Vampire hell — 4064 triagens + 165 parties em 125 ms (NOVO)   → 56,8k, 2 magias em todos
18:47:16 Inteligente: Vampire hell — 3956 triagens + 165 parties em 134 ms (NOVO)   → 58,4k, Knight/Fei/Dru com 1 magia
```
Causa (reproduzida no node): as medidas ao vivo mexem um pouco a cada frame e a busca cai em kits **empatados** (xp
e lucro iguais; espera 9,8 s com regen do Knight 7 ou 7,5 só troca a ordem Energy Wave/Fire Wave). **2.13.5:** o kit
mostrado tem histerese — o novo só tira o anterior com > 1 % de xp ou lucro claramente maior ("mantém o kit
calculado antes"). Na mesma correção: os suportes do dono não entravam no carimbo da conta (trocar o suporte no jogo
não invalidava o kit mostrado) — agora entram, e o kit guardado volta sempre com os suportes do dono de agora.

### ✅ 4. Radar "2 combos" × Magia "1 combo" — mesma conta, momentos diferentes
O motor Inteligente do Radar chama o mesmo `partyInt` da aba Magia. No mesmo instante os dois batem (19:33: T 0,25 ×
0,3 s, xp 63.220 × 63.220). As 3 leituras de hoje foram em estados diferentes da party: caçando (1,1 s), na cidade
(1,7 s) e durante o Scan do Em área (≥ 2 s). Fica a observação: o T previsto oscila com a calibração ao vivo, mas o
mapa medido usa o T do Scan (1,3 s).

### ❌→✅ 5. Menores
- Radar, mapa medido: o ouro/h era o bruto com sorte (+18,8k; estável −1,4k). **2.13.5:** estável; a sorte vai para
  o detalhe.
- Loot depois do F5 com NPC 0: a tabela de Vampire hell veio pelo Scan e nunca foi para a gaveta comum (69 de 70
  guardadas). **2.13.5:** toda tabela baixada é guardada.
- APLICAR em dobro: **não era defeito** — o bloqueio (`_aplicando`) funciona; o meu 2º toque chegou depois de a 1ª
  aplicação terminar (< 1 s).

### ❌→✅ 6. Achados no reteste
- **Mercado — suas ordens em páginas de 50**: `market_my_orders` responde `{orders, page}`; o dono tem **55**
  abertas (página 0: 50, da mais nova; página 1: 5, entre elas o refine fragment t1). O helper lia só a página 0:
  "Meus anúncios" e o REVISAR não viam as 5 mais antigas. **2.13.5:** lê até a página vir incompleta.
- **Alertas sem as suas ordens**: a regra "o menor anúncio é o seu" (2.13.2) usa `MK.minhas`, que só a aba Mercado
  preenchia — no teste estava `null`, então a regra estava desligada. **2.13.5:** o CONFERIR lê as suas ordens (só
  leitura, todas as páginas) quando não lidas ou com > 30 min.

## O que mudou na conta
- Presets: aplicados Em área/Inteligente pelo Scan e o Inteligente pelo APLICAR; **devolvidos** à foto do começo
  (Knight Berserk + Groundshaker · Pal Divine Caldera · Fei Energy Wave + Great Fire Wave · Dru Strong Ice Wave + Ice Wave,
  curas/suportes/poções do dono). O servidor confirmou ao recomeçar.
- Caçada: 2 Scans (Vampire hell e Banshee, ~18 min), uma parada às 19:14 para anunciar; party de volta em Vampire hell
  lure 6 às 19:17.
- Mercado: 1 anúncio novo (crowbar incomum a 1.443, taxa 72). Nada mais anunciado nem cancelado.
- Reteste (19:17–19:31): uma parada e um recomeço em Vampire hell (~15 s) para gravar os frames; leituras de
  `market_my_orders` (páginas 0 e 1). Party de volta em Vampire hell lure 6 com os presets do começo.
- Auto Hunt continuou ligado como estava (hunt 155, 50 % livre); não disparou.

## Próximo
O Inteligente passou no Scan A/B e os achados foram corrigidos na 2.13.5 (244 testes, ESLint 0 erros). Seguir com
o combinado: calcular ao escolher o mapa, calibrar caçando (sem Scan) e mostrar o kit no ranking do Radar.

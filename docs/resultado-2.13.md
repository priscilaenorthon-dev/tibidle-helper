# Resultado do teste ao vivo — 2.13.0 (30/09, 18:17–19:20)

Playwright, conta do dono, nível 70 → 71. Helper atualizado pelo raw (2.11.14 → 2.13.0), `tb_helper_debug` ligado para ler o estado.
Presets dos 4 fotografados antes (`.playwright-mcp/presets-antes-2.13.json`) e **devolvidos exatamente** no fim (item 5).

## Resumo
| Item | Resultado |
|---|---|
| Antes: v2.13.0, Diagnóstico | ✅ 28 ok, 0 erros, âncoras visíveis |
| 1. Inteligente: kit < 1 s, regras do kit | ✅ 542–585 ms; ≤ 4 magias, sem runa no Knight, sem Sharpshooter, nenhum elemento vetado, curas presentes |
| 1. 2 APLICAR seguidos, mesmo kit | ⚠️ ataques iguais, mas a escada subiu para o degrau 3 entre os dois (Knight a 26 %) |
| 1. "servidor confirmou", presets 2–4 com nome | ✅ |
| 1. Regeneração medida na aba | ⚠️ medida e gravada, **não aparece na tela** |
| 2. Scan A/B | ❌ **Inteligente perde feio nos dois mapas** |
| 2. Volta ao mapa/lure/presets | ✅ Vampire hell lure 6, kits devolvidos |
| 3. Radar CALCULAR | ✅ ~45 s, sem travar, sem erro |
| 3. Medido × estimado | ❌ o "medido" usa o Scan mais recente, mesmo sendo a variante ruim |
| 3. Top 5 sem elemento imune | ✅ |
| 3. Loot ao vivo sobe / bate com o jogo | ✅ delta exato (1.418 = 1.418 do analisador) |
| 3. Recomeçar no mesmo mapa não herda | ❌ a sessão não zera sozinha em nenhuma troca de caçada |
| 3. Drop raro só caro | ✅ spike sword, fur boots, blood preservation |
| 3. Alertas: ler sem anunciar | ✅ só `market_catalog` + 2 `market_stats` |
| 3. Vigiar | ✅ parcial: ~7 min ligado, 0 leituras extras (encurtado a pedido do dono) |
| 3. Dia: copiar / F5 | ⚠️ copiar e F5 ok, mas **"[object Object]"** e XP contado em dobro |
| 4. Auto Hunt "nunca vender" | ⚠️ não exercitado: `nvEquip` está **desligado** na conta |
| 4. Mercado: Incomum+ | ✅ o jogo **aceita** (crystal ring incomum anunciado a 1.799); anúncio novo não criado |

## 2. Scan A/B (7 min cada, lure máximo)
| Mapa | Modelo | xp/h sem boost | xp/h real | ouro/h estável | bruto | onda |
|---|---|---|---|---|---|---|
| Vampire hell | Em área | **58,0k** | 62,7k | **+795** | +25,8k | 2,3 s + 10,2 s |
| Vampire hell | Inteligente | 32,5k (−44 %) | 35,1k | −43.068 | −21,2k | 11,4 s + 9,8 s |
| Banshee | Em área | **49,6k** | 54,5k | **+20.331** | +26,7k | 7,8 s + 9,5 s |
| Banshee | Inteligente | 27,7k (−44 %) | 30,5k | −22.162 | −19,6k | 22,9 s + 10,1 s |

Critério (xp ≥ Em área −2 % e ouro ≥ Em área nos dois): **reprovado**. O modelo voltou para Em área e o Em área foi aplicado
em Stonerefiners (onde o Auto Hunt deixou a party).

Por quê (o que se viu):
- Os kits do Inteligente são fracos: no Scan de Vampire hell ele mandou Knight = Lesser Front Sweep + Brutal Strike,
  Paladino = só Divine Missile, Feiticeiro = Energy Beam + Great Energy Beam, Druida = Strong Ice Wave + Energy Strike
  (7 slots contra 13 do Em área). O previsto era 55,9k xp/h; o medido, 32,5k.
- **Instável**: 4 cálculos em ~30 min deram 4 kits diferentes para Vampire hell. A busca bate no teto (6.000 triagens)
  e muda com pequenas mudanças de medida. A histerese segura só nos 10 min após o APLICAR ("mantém"), mas o "novo" já
  era outro (Knight só com Brutal Strike).
- **Apaga suportes e curas do dono**: todos saem "sem suporte" (sumiram Train Party, Protect Party, Enchant Party e
  Heal Party), as curas mudam de %, e o Em área aplicado depois **não devolve** nada disso (só troca os ataques). Contraria a
  regra "nunca sobrescrever DEFESA/SUPORTE do dono".
- O 1º kit (sem Train Party) deixou o Knight a 26 % de vida em 2 min em Vampire hell; no 2º APLICAR a escada foi para o
  degrau 3 (Protector, curas +10, poção de segurança do Druida a 20 %) e ficou gravada por 30 min.

## 1. Detalhes
- Regeneração medida (mana/s, janelas): Knight 7,1 (50) · Paladino 8,2 (40) · Feiticeiro 13,2 (40) · Druida 17,2 (40).
  Fica em `regen_<VOC>`; a aba Magia não mostra em lugar nenhum (nem em "detalhes").
- "detalhes" → "dano/mana" lista "great fireball rune" 3× sem dizer de quem é.
- A tela mostra "ouro 0,0k/h" com lucro +27,5k/h, e "✗ não se paga" com custo 0 o/abate (degrau 3).
- `vitaisPorKit["?"]` do Knight misturou Nargor e Vampire hell (o livro-razão não zera ao trocar de mapa).

## 3. Radar — defeitos
1. **Medido errado no ranking**: com Em área e Inteligente medidos no mesmo mapa, o ranking usa o último Scan (o
   Inteligente): Vampire hell aparece com 32,5k/−21,2k, e não com 58,0k/+25,8k. Deveria usar a variante do motor
   escolhido, ou a melhor. Estimado × medido: Vampire hell est. 58,1k/+29,2k (0 % contra o Em área; −44 % contra o
   Inteligente); Banshee est. 55,1k/+26,4k (+11 % contra o Em área).
2. **Sessão do Loot não zera** (`radarObservar`): só `lv.base` é refeita no `hunt_started`/`ended`; `lv.sessao` acumula desde
   18:18 (Nargor + Vampire hell + Scans + Stonerefiners = 23.643) até alguém clicar "zerar sessão". Os itens de outros mapas
   aparecem com NPC 0 (só a tabela do mapa atual é usada).
3. **Dia com "[object Object]" e XP em dobro**: no jogo, `ended.summary.title` é `{key, params:{name}}` (objeto) e
   `summary.kills` é `{criatura:n}` (o total vem em `killsTotal`). Dois `ended` do Scan entraram como "offline" (> 60 s que
   os frames não mostraram) com a página aberta: +15 min e +14,1k xp. XP real ganho 18:18–19:13 = 34,9k
   (5.461.879 → 5.496.736); o Dia mostrou 48,9k (+40 %). Texto do "copiar": "(2 caçadas fechadas fora da página…)".
4. Nenhum mapa acima do nível apareceu marcado porque o corte é nível+5 e os mapas de 80 ficam fora; não deu para ver a
   marcação.

## 4. Itens antigos
- **Auto Hunt**: disparou sozinho logo depois do Scan (mochila 49 % livre; durante o Scan esperou — ✅) e vendeu 72.775
  ouro, incluindo spike sword, fur boots, crystal ring, leather boots, bandana e simple dress. Não é defeito: a conta está
  com `nvEquip: false` (só materiais de imbuement protegidos) e não havia material na mochila, então não saiu linha
  "nunca vender". Para o teste do roteiro seria preciso ligar a proteção de equipamento — não mexi na configuração do dono.
  O ciclo volta para a hunt memorizada (155, Stonerefiners), não para a caçada em que a party estava.
- **Mercado**: 50 anúncios abertos, vários "crystal ring (incomum) ×1 @ 1.799" → o jogo aceita peça Incomum (a wiki está
  errada). Anúncio novo não criado: caçando, o depósito só é lido e não havia item marcável na mochila.

## Estado deixado
- Party caçando em Stonerefiners Cavern (Auto Hunt ligado, hunt 155).
- Presets dos 4 = exatamente os do começo (ataques, suportes, curas, poção, presets 2–4).
- Magia no modelo Em área. Radar: 2 itens na lista de alertas (Wild Honey, refine fragment t1), vigiar desligado.
- `tb_helper_debug` continua ligado no perfil do Playwright.

## Correções (2.13.1, mesmo dia)
- Inteligente recalibrado com os lançamentos medidos nesses Scans (dano por alvo, alvos por forma, golpe básico, vida
  por criatura no simulador): os 4 kits medidos passam a ser previstos a −5 %…+8 % de abates/h (eram +80 %/+92 % nos
  kits do Inteligente). Suportes e curas do dono não são mais trocados.
- Radar: ranking usa o melhor Scan do mapa; sessão do Loot zera a cada caçada; Dia sem "[object Object]" e sem contar o
  resumo do fim duas vezes. Regeneração medida aparece na aba Magia.
- Detalhes em `TIBIDLE.md`, seção "2.13.1".

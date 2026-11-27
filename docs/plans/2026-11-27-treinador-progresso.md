# Aba Progresso (treinador) — plano de implementação

> **Para o Claude:** SUB-SKILL OBRIGATÓRIA: usar superpowers:executing-plans (ou subagent-driven-development) tarefa por tarefa.
> Desenho aprovado em `docs/plans/2026-11-27-treinador-progresso-design.md`. Ler antes.

**Objetivo:** trocar o ícone ▤ Analisador por "Progresso", um treinador com 10 especialistas embutidos que leem a conta ao vivo e
mostram os 3 próximos passos para subir de nível mais rápido, cada um com botão "Fazer".

**Arquitetura:** `trFoto()` (DOM/rede, seção `@@TREINADOR`) junta o que o helper já sabe numa foto simples →
especialistas puros (seção `@@TREINADOR-PURO`, testável no node) devolvem conselhos `{id, agente, titulo, porque, impacto,
confianca, custo, acao}` → o chefe `trOrdenar` escolhe os 3 próximos passos → `telaTreinador`/`ligarTreinador` desenham e
executam pelas ações que já existem. Conhecimento de jogador profissional em `TR_BASE` (constante com fonte e data).

**Base técnica:** userscript de arquivo único `tibidle-helper.user.js` (Tampermonkey), testes em node puro (`testes/*.test.js`,
sem dependências), eslint 10, Playwright para o teste ao vivo.

**Regras do projeto que valem aqui (CLAUDE.md + memória):**
- Responder e comentar em português. Subir `@version` e `const VERSAO` juntos (2.67.0) e registrar no fim do `TIBIDLE.md`.
- Comandos: `node --check tibidle-helper.user.js`; `for f in testes/*.test.js; do node "$f" || exit 1; done`;
  `npx --yes eslint@10 --no-config-lookup -c eslint.config.mjs tibidle-helper.user.js` (0 erros).
- Editar o `.user.js` com heredoc de Python (o bash come `$`); conferir com `node --check` depois de cada edição.
- Nada envia comando ao jogo sozinho: o treinador só age por botão; 2 toques (`ligarDoisToques`) em tudo que gasta ouro/coins.
- Nunca passar peça de um personagem para outro. Nada de dados para fora do navegador.
- Textos curtos (o dono rejeita texto gigante): título ≤ 70 caracteres; o porquê vai atrás de `?`.
- Teste ao vivo no Playwright: aba nova + `addInitScript` com guarda em `__tbHelper` (memória `tibidle-testar-versao-nova-aba-limpa`);
  devolver aba limpa no fim; avisar o dono que a sessão do Chrome dele cai.


> **Atualização 27/11 (após a revisão das Tasks 2–3, commit c5ee110) — vale para as Tasks 4–17:**
> - `trRodar(foto, base)` chama `rodar(foto, base, todos)`: agentes de fase 1 recebem `[]`; agentes registrados com `fase: 2`
>   rodam depois e recebem os conselhos da fase 1. O retorno pode ser array/objeto/null (é normalizado).
> - `foto.ouroLivre` é calculado pela FOTO (Task 14), não pelo agente Dinheiro. `trFotoVazia()` é o formato canônico.
> - Unidades: número sem sufixo = pontos de %; fração tem sufixo `Frac` (`bencaos.corteFrac`, `morte.perdaFracSemBencao`, …).
> - Skills na foto e no TR_BASE: `melee`, `dist`, `ml`, `escudo`. `legado.skillInicio` (60, melee e distância), `legado.mlInicio` (40).
> - `bosses[].tentativa` é SEMPRE lista `[{ item, qtd }]`. `cacadasTopo[titulo] = { rec, ilha }`; helper `trCacada(titulo, base)`.
> - `trConselho(agente, id, o)`: `o` não sobrescreve `id`/`agente`.

> **Atualização 27/11 (após a revisão do lote A, Tasks 4–6) — contrato para a foto (Task 14), a UI (Task 15) e os próximos agentes:**
> - [contrato] **Prey** é da CONTA (`meta.preyHunt`). Foto: `prey = { huntId, huntLocked, huntMsLeft, buffs: { VOC: { tipo, tier, locked, msLeft } }, wildcards }`
>   (+ `semCacada: true` só quando `meta.preyHunt === null` foi lido de verdade). `tipo` pode vir do jogo (`xp|loot|damage|defense`) ou do helper
>   (`exp|dano|defesa`): comparar sempre por `trTipoPrey`. `huntId` ausente = não sei → nenhum agente opina sobre "outro mapa".
>   Ações: `prey-escolher {huntId}`, `prey-trocar {voc}`, `prey-trancar {alvo: 'hunt' | VOC, voc?}` (= `prey_lock_set {target}`).
> - [contrato] **Ids**: todo id da foto é Number; ainda assim, comparar SEMPRE com `trMesmoId(a, b)` (texto, null nunca casa).
> - [contrato] **Custo**: `custo` = desembolso ÚNICO em ouro (o que sai ao tocar "Fazer"); custo recorrente vai em `numeros.custoH` (ouro/h).
>   Ex.: Selo → `custo` = 1 Rolar, `numeros.custoH` = Rolar × peso do tier. Bênçãos → 1 compra das que faltam.
> - Ação `medir`: `{ tipo: 'medir', alvos: [{ title, huntId | null }] }` (a UI resolve o `huntId` null pelo título).
> - Ajudantes puros para reusar (não copiar): `trNum`, `trMesmoId`, `trQtd`, `trPct`, `trVocPt`, `trPeso`, `trConf`, `trXpAtual`, `trRecDe`,
>   `trMortesRecentes`, `trLimitadoPorDano` (exige `medidoAtual.min ≥ 5` e abates > 0), `trDanoParaXp` (teto de spawn; `TR_BASE.xp.xpPorDanoFrac`).

---

## Task 1: Descobrir o protocolo e os campos que faltam (pesquisa, sem código)

**Por quê:** 5 ações e 4 especialistas dependem de mensagens que o helper ainda não conhece (prey, bênçãos, ampulhetas, ilha,
tentativa de boss, inscrição na Invasão, Selo) e de campos do `welcome` (bênçãos compradas, horas de ampulheta usadas, Selo ativo).

**Files:**
- Create: `docs/protocolo-treinador.md`
- Create: `testes/fixtures/treinador-welcome-u2tag.json` (welcome real, com ouro/nome trocados por valores neutros)

**Step 1:** Baixar o bundle do jogo SEM logar (memória `tibidle-jogo-1-1-7-discord-oficial`: "ler o bundle sem logar"):
`curl -s https://play.tibidle.com/ | grep -o '/_next/static/chunks/[^"]*\.js'` → baixar cada chunk para uma pasta nova e vazia
em `.playwright-mcp/bundle-27-11/` e procurar, com `grep -o '"[a-z_]*\(prey\|bless\|hourglass\|ampulh\|island\|silas\|boss_attempt\|attempt\|invasion\|seal\|selo\|unlock\)[a-z_]*"'`,
os `type` das mensagens enviadas ao socket e o formato de `data` de cada uma (ler 300 caracteres em volta de cada achado).

**Step 2:** No Playwright (conta u2tag), com o grampo de `MessageEvent.prototype.data` (receita da memória, guardando o descritor
original), recarregar e salvar o `welcome`/`resume` inteiro. Listar os campos de `meta` e de cada personagem: premium, bênçãos,
prey (`preyHunt`, `preyBuffs`, `wildcards`), ampulhetas (horas usadas/dia), Selo, `legado`, `offline`. Apagar nome/ouro reais e
gravar em `testes/fixtures/treinador-welcome-u2tag.json`.

**Step 3:** Escrever `docs/protocolo-treinador.md`: uma tabela `ação | type | data | resposta | precisa estar na cidade? | custo`
para: sortear prey (grátis/wildcard), trancar prey, escolher caçada da prey, comprar bênçãos, usar ampulheta, abrir ilha no Silas,
trocar/comprar tentativa de boss, entrar no boss, inscrever na Invasão, Selo (rolar/ligar). O que não aparecer limpo fica marcado
"abrir a tela do jogo" (o botão vai só abrir o painel certo pelo `data-testid`, sem enviar nada).

**Step 4:** Commit.
```bash
git add docs/protocolo-treinador.md testes/fixtures/treinador-welcome-u2tag.json
git commit -m "treinador: protocolo das ações novas e welcome de exemplo"
```

---

## Task 2: Esqueleto puro + teste vazio

**Files:**
- Modify: `tibidle-helper.user.js` (nova seção logo antes de `/* @@ARENA-PURO-INICIO`)
- Create: `testes/treinador.test.js`

**Step 1: teste que falha**

```js
// Roda: node testes/treinador.test.js
// 2.67.0 — treinador (aba Progresso): especialistas puros e o chefe.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const i = src.indexOf('/* @@TREINADOR-PURO-INICIO'), f = src.indexOf('/* @@TREINADOR-PURO-FIM');
assert(i > 0 && f > i, 'trecho @@TREINADOR-PURO não encontrado');
const T = new Function(src.slice(i, f) + '\nreturn { TR_BASE, TR_AGENTES, trConselho, trOrdenar, trRodar, trFotoVazia };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
const fx = (nome) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', nome), 'utf8'));

t('foto vazia não quebra nenhum especialista e não gera passo', () => {
    const r = T.trRodar(T.trFotoVazia(), T.TR_BASE);
    assert.deepStrictEqual(r.passos, []);
    assert.strictEqual(r.cartoes.length, T.TR_AGENTES.length);
});
t('trConselho preenche os padrões', () => {
    const c = T.trConselho('upar', 'x', { titulo: 'a', impacto: 5 });
    assert.strictEqual(c.confianca, 'estimado'); assert.strictEqual(c.custo, 0); assert.strictEqual(c.acao, null);
});
process.on('exit', () => { if (!process.exitCode) console.log(`\n${n} testes ok`); });
```

**Step 2:** `node testes/treinador.test.js` → FAIL "trecho @@TREINADOR-PURO não encontrado".

**Step 3: implementação mínima** (inserir com heredoc de Python antes de `/* @@ARENA-PURO-INICIO`):

```js
    /* @@TREINADOR-PURO-INICIO — aba Progresso (2.67.0): o treinador. Especialistas puros: f(foto, base) → conselhos.
     * Conselho = { id, agente, titulo, porque, numeros, impacto (% de XP/h, ou equivalente), confianca, custo (ouro), acao }.
     * confianca: medido (da conta) > comunidade (post com número) > wiki > estimado. Sem DOM, sem rede, sem Date.now (foto.t). */
    const TR_PESO_CONF = { medido: 1, comunidade: 0.8, wiki: 0.6, estimado: 0.4 };
    const TR_BASE = { versao: '2026-11-27' }; // preenchido na Task 3
    function trConselho(agente, id, o) {
        return Object.assign({ id: agente + ':' + id, agente, titulo: '', porque: '', numeros: null, impacto: 0, confianca: 'estimado', custo: 0, acao: null, estado: 'aviso' }, o || {});
    }
    function trFotoVazia() {
        return { t: 0, nivel: null, xpTotal: null, ouro: null, premium: null, emHunt: false, naCidade: false, hunt: null, medidoAtual: null,
                 mapas: [], party: [], legado: null, prey: null, mortes: [], sessoes: [], checklist: null, bestiario: [], chaves: null,
                 deposito: {}, invasao: null, forja: null, topo: null, precos: {}, ilhas: [], skillsTreino: null };
    }
    const TR_AGENTES = []; // [{ id, nome, icone, rodar(foto, base) → conselhos[] }] — Tasks 4–13
    function trOrdenar(conselhos, foto) {
        const livre = foto && foto.ouroLivre != null ? foto.ouroLivre : Infinity;
        return conselhos.filter(c => c.impacto > 0 && c.estado !== 'ok')
            .map(c => Object.assign({}, c, { nota: c.impacto * (TR_PESO_CONF[c.confianca] || 0.4) * (c.custo > livre ? 0.3 : 1), semOuro: c.custo > livre }))
            .sort((a, b) => b.nota - a.nota);
    }
    function trRodar(foto, base) {
        const cartoes = [], todos = [];
        for (const a of TR_AGENTES) {
            let lista = [];
            try { lista = a.rodar(foto, base) || []; } catch (e) { lista = [trConselho(a.id, 'erro', { titulo: 'não consegui analisar', porque: String(e && e.message || e), estado: 'erro' })]; }
            const pior = lista.some(c => c.estado === 'erro') ? 'erro' : lista.some(c => c.estado === 'aviso') ? 'aviso' : 'ok';
            cartoes.push({ id: a.id, nome: a.nome, icone: a.icone, estado: pior, conselhos: lista.slice(0, 3) });
            todos.push(...lista);
        }
        return { cartoes, passos: trOrdenar(todos, foto).slice(0, 3), todos };
    }
    /* @@TREINADOR-PURO-FIM */
```

**Step 4:** `node testes/treinador.test.js` → 2 testes ok. `node --check tibidle-helper.user.js`.

**Step 5:** Commit `git commit -am "treinador: esqueleto puro (conselho, chefe, rodar)"` (inclua o teste novo com `git add`).

---

## Task 3: `TR_BASE` — o conhecimento de jogador profissional

**Files:** Modify `tibidle-helper.user.js` (dentro de `@@TREINADOR-PURO`, trocar `const TR_BASE = { versao }`); Test `testes/treinador.test.js`.

**Fontes (já coletadas em 27/11):** relatório da wiki (páginas em `data/wiki-27-11/*.txt`), relatório do TIBIDLE.md/memória,
relatório da comunidade (YouTube/site/Discord público — anexar o que chegar), retrato do topo em `data/top-perfis-27-11.json`.
Cada número com comentário `// wiki/<página>` ou `// medido dd/mm` ou `// comunidade <quem>`.

**Step 1: testes que falham** (acrescentar):
```js
t('TR_BASE: faixas cobrem 1..999 sem buraco e citam caçadas da wiki', () => {
    const fx = T.TR_BASE.faixas; assert(fx.length >= 4);
    for (let k = 1; k < fx.length; k++) assert.strictEqual(fx[k].de, fx[k - 1].ate, 'faixa contínua');
    assert(fx.some(x => x.hunts.includes('Shadow Nexus')));
});
t('TR_BASE: bênção no 250 = 29.750 cada; Legado tem marcos crescentes', () => {
    assert.strictEqual(T.TR_BASE.bencaos.preco(250), 29750);
    const b = T.TR_BASE.legado.bonus; for (let k = 1; k < b.length; k++) assert(b[k] > b[k - 1]);
});
t('TR_BASE: ilhas com custo e material', () => {
    const m = T.TR_BASE.ilhas.find(x => x.nome === 'Marapur');
    assert.strictEqual(m.ouro, 10e6); assert.strictEqual(m.materiais[0].nome, 'Spectral Conch'); assert.strictEqual(m.materiais[0].qtd, 10);
});
```

**Step 2:** rodar → FAIL.

**Step 3:** escrever o `TR_BASE` com, no mínimo:
```js
    const TR_BASE = {
        versao: '2026-11-27',
        xp: { party: 100, premium: 10, boost: 50, preyColunaMax: 10, seloAbundante: [4, 7, 10, 14, 20] }, // wiki/premium…, prey, selo-da-cacada
        legado: { meleeInicio: 60, mlInicio: 40, passo: 5, bonus: [2, 5, 9, 14, 20, 27, 35, 44, 54, 65, 77, 90, 104] }, // wiki/legado (% de dano)
        ampulheta: { horasDia: 8, fator: 8 },                                         // wiki/ampulhetas-de-treino, skills-e-treino
        bencaos: { n: 7, corte: 0.56, preco: (nv) => nv < 120 ? null : 20000 + 75 * (nv - 120) }, // wiki/bencaos
        morte: { perdaPctSemBencao: 0.0227 },                                         // wiki/durante-a-cacada (nível 100; usar como ordem de grandeza)
        faixas: [
            { de: 1, ate: 200, hunts: [] },                                            // (rota da comunidade até 110 já está no Radar)
            { de: 200, ate: 250, hunts: ['Hellgorak Seal', 'Winter Court', 'Ice Portal', 'Warzone II Magma', 'Parasite Nest', 'Kilmaresh Catacombs', 'Temple of the Moon Goddess'] },
            { de: 250, ate: 300, hunts: ['Shadow Nexus', 'Summer Court', 'Otherworld Zao', 'Warzone III Crystal Caves', 'Salt Caves', 'Seacrest Grounds'] },
            { de: 300, ate: 350, hunts: ['Buried Cathedral', 'Ruins of Nuur', 'Emerald Gardens'] },
            { de: 350, ate: 999, hunts: ['Dream Talisman'] } ],                       // wiki/cacadas (Rec)
        dinamicas: ['Salt Caves', 'Ruins of Nuur', 'Seacrest Grounds', 'Emerald Gardens', 'Buried Cathedral', 'Dream Talisman'], // wiki/cacadas
        ilhas: [
            { nome: 'Issavi', ouro: 10e6, materiais: [] },
            { nome: 'Marapur', ouro: 10e6, materiais: [{ nome: 'Spectral Conch', qtd: 10, onde: 'Elite Entombed Wraithlord (Haunted Nexus Tomb, Rec 150): 20,83 % ×2' }] },
            { nome: 'Dream Courts', ouro: 15e6, materiais: [{ nome: 'Haunted Sigil', qtd: 10, onde: 'Hollow High Priest (Rec 170) 10,42 % ×2; Wailing Matron (Rec 190) 20,83 % ×2' }] },
            { nome: 'Otherworld', ouro: 3e6, materiais: [{ nome: 'Thunderscar Spark', qtd: 20, onde: 'Balerion 23 %' }] },
            { nome: 'Warzone', ouro: 3e6, materiais: [{ nome: 'Warzone Voucher', qtd: 40, onde: 'Elite de Warzone' }] },
            { nome: 'Forgotten Knowledge', ouro: 3e6, materiais: [] } ],               // wiki/acesso-as-ilhas, dream-courts
        bosses: [ /* {nome, vida, rec, tentativa:{item,qtd}, drops:'…', vale:'…'} — tabela do relatório da wiki (Inquisitor, Last Lore Keeper,
                    Eradicator, Urmahlullu, Timira, Izcandar, Shen-long, Azerus, Jaul) */ ],
        purificacao: { hunt: { epico: 0.45, base: [0, 350] }, elite: { epico: 0.85, base: [50, 420] }, boss: { epico: 2.6, base: [250, 500] } }, // wiki/forja
        forja: { refinoSeguroAte: 4, chT1: [80, 70, 60, 50], chT2: [35, 25, 20, 15, 10, 5], potMin: 350, potBase: 400, potMeta: 600 },
        bestiarioPrioridade: ['magicLevel', 'attack', 'melee', 'distance', 'manaRegen', 'maxHealth', 'armor', 'shielding'], // comunidade + wiki/bestiario
        topoSkills: null,  // preenchido em tempo de execução pelo /leaderboard
    };
```
(Completar `bosses` com a tabela da seção 3 do relatório da wiki e os achados da comunidade quando chegarem; manter cada item com fonte.)

**Step 4:** rodar → ok. **Step 5:** commit "treinador: TR_BASE (wiki + comunidade + medido)".

---

## Tasks 4–13: os 10 especialistas (um por tarefa, mesmo molde)

Molde de cada tarefa:
1. Acrescentar ao teste os casos abaixo (usam fotos sintéticas montadas a partir de `trFotoVazia()`; nada de rede).
2. Rodar → FAIL.
3. Implementar `trAgenteX(foto, base)` dentro de `@@TREINADOR-PURO` e registrar com `TR_AGENTES.push({ id, nome, icone, rodar })`.
4. Rodar → ok; `node --check`.
5. Commit `treinador: agente <nome>`.

Formato da foto usado pelos agentes (definido de verdade na Task 14; os testes montam à mão):
```js
foto = {
  t, nivel, xpTotal, ouro, ouroLivre, premium: { ativo, ate }, emHunt, naCidade,
  hunt: { id, title, lure, maxLure, rec, levelMin, ilha } | null,
  medidoAtual: { xpH, xpRawH, ouroH, gastoH, abatesH, min } | null,          // analisador do jogo, caçada atual
  mapas: [{ id, title, rec, levelMin, ilha, aberta, xpH, ouroH, fonte: 'medido'|'comunidade'|'estimado', mortes, idadeH }],
  party: [{ voc, skills: { melee, dist, ml, escudo }, treinada, eq: { slot: { nome, refino, raridade, potencia, atributos: [{id, valor}], imbuSlots, imbu: [] } } }],
  legado: { VOC: { skill, marcoAtual, proxMarco, falta, bonusAtual, bonusProx } } | null,
  prey: { buffs: { VOC: { tipo, tier, locked, msLeft, huntId } }, wildcards } | null,
  bencaos: { tem, total } | null, ampulhetas: { VOC: { usadasH } } | null, selo: { ativo, abundante } | null,
  mortes: [{ t, hunt, voc }], sessoes: [{ hunt, huntId, dur, xpH, ouroH, morte }],
  checklist: { VOC: [{ chave, ok, titulo, texto }] } | null,
  bestiario: [{ huntId, title, bonus, ganho, falta, horas, xpH }], chaves: { usadas, max, elites: [{ nome, qtd }] } | null,
  deposito: { nomeItem: qtd }, invasao: { inscrito, janela } | null,
  forja: { abaixo4: [{ voc, slot, nome, refino, custo }], idadeH, proximo } | null,
  topo: { pos, total, top1, perto: [{ nivel, skills }], perfis: [{ nivel, voc: { VOC: { slot: nome } } }], idadeH } | null,
  precos: { nomeItem: preço }, ilhas: [{ nome, aberta }]
}
```

### Task 4: agente "Onde upar" (`upar`, ícone ⤴)
Regras:
- Candidatos = `foto.mapas` com `levelMin ≤ nivel`, `aberta`, `xpH` conhecido, sem morte nas últimas medições (`mortes === 0`).
- Melhor = maior `xpH × peso(fonte)`; se `melhor.xpH ≥ 1,10 × atual.xpH` (atual = `medidoAtual` ou o mapa da caçada) → conselho
  `titulo: "Upar em <mapa>: +X % de XP/h"`, `impacto = (melhor/atual − 1)×100`, `confianca` = fonte, `acao: { tipo: 'ir-mapa', huntId }`.
- Se o melhor da faixa (`base.faixas`) é de ilha fechada → conselho "Abrir <ilha>" apontando para o agente 8 (sem ação aqui).
- Lure: se a caçada atual está abaixo de `maxLure` e não houve morte nas últimas 2 sessões dela → "Subir a lure para N" (`acao: lure`),
  `impacto` = 8 % por degrau (estimado) — nunca sugerir baixar (regra do dono).
- Caçada atual já é a melhor → um conselho `estado: 'ok'`.
Testes: (a) atual 540k, Summer Court medido 650k → passo com impacto ≈ 20 %; (b) melhor com morte é ignorado; (c) lure abaixo do
máximo sem morte → conselho de lure; com morte → nenhum; (d) mapa de ilha fechada não vira "ir-mapa".

### Task 5: agente "Multiplicadores" (`mult`, ✕)
- Premium inativo → "Ativar Premium (+10 % XP)", `impacto = 10 / (100 + somaAtual) × 100`, confiança `wiki`, ação `abrir-loja`.
- Prey: por vocação, se `huntId` da prey ≠ caçada atual → "Prey do <voc> está em outro mapa"; se tipo ≠ ideal → trocar.
  Ideal: **dano** quando a caçada é limitada por dano (abates/h < 85 % do teto de spawn `340 × lure` — fórmula medida 27/09),
  **exp** quando limitada por spawn. Tier < 10 e destravada com msLeft > 0 → "Trancar no tier N" (1 wildcard).
- Bênçãos ausentes com nível ≥ 120 → "Comprar as 7 bênçãos (≈ X ouro)" com `custo = 7 × base.bencaos.preco(nivel)`,
  `impacto` = perda evitada (ver agente 5) — só se houve morte em 7 dias ou o mapa tem `risco`.
- Selo Abundante desligado em caçada de XP → texto com custo/h (wiki) e sem ação se o protocolo não sair na Task 1.
Testes: premium off; prey em outro mapa; caçada limitada por spawn → sugere EXP; limitada por dano → DANO; bênçãos com morte recente.

### Task 6: agente "Treino e Legado" (`legado`, ⚔)
- Para cada vocação em `foto.legado`: `falta` de skill até `proxMarco`; ganho de dano = `bonusProx − bonusAtual` pontos %.
- Conselho "Ampulheta no <voc>: falta N de skill para +Y % de dano" com `impacto = ganhoDano × 0,7` (XP ~ dano quando a caçada é
  limitada por dano; 0,7 = fração estimada; confiança `wiki`), `acao: { tipo: 'ampulheta', voc }`; se `ampulhetas[voc].usadasH < 8` →
  estado aviso ("X h de ampulheta livres hoje").
- Ordena pela vocação com menor `falta` relativa.
Testes: Knight melee treinada 64 → próximo marco 65 com bonus 2→5; ampulheta usada 8 h → sem aviso de horas.

### Task 7: agente "Set × topo do rank" (`topo`, ♛)
- Sem `foto.topo` ou `idadeH > 24` → conselho `acao: { tipo: 'ler-topo' }` ("Comparar com o topo") e nada mais.
- Para cada vocação/slot: item que aparece em ≥ 50 % dos perfis visíveis com nível entre `nivel` e `nivel + 150` e que eu não visto
  → "<voc>: o topo usa <item> em <slot> (k de n)" com preço do Mercado se `precos[item]`; `confianca: 'comunidade'`, `impacto` 3
  (estimado; o agente 9/Melhorias diz o ganho exato), `acao: { tipo: 'abrir-melhorias' }`.
- Skills: mediana do topo na mesma faixa vs as minhas → "Melee 64 × 72 no topo: treinar" (aponta para o agente 6).
Testes: com `data/top-perfis-27-11.json` resumido numa fixture `testes/fixtures/treinador-topo.json` (só níveis e nomes de itens),
Knight sem Royal Signet vs 3/9 → não sugere (abaixo de 50 %); magos sem magma legs (8/9) → sugere.

### Task 8: agente "Onde estou errando" (`erros`, ⚠)
Regras (cada uma um conselho, estado `erro` quando custa XP agora):
- Mortes em 24 h (`foto.mortes`) → "N mortes (quem) em <mapa>": `impacto = horas de XP perdidas por semana` convertido em % da semana;
  ação `abrir-aguentar`.
- Caçada atual com `ouroH < 0` e `ouroLivre < 3 × |ouroH|` → "o ouro acaba em X h".
- Slot vazio em qualquer personagem (exceto escudo com arma de 2 mãos) → erro, ação `abrir-equip`.
- Imbuement livre (`imbuSlots > imbu.length`) em peça vestida → aviso.
- Itens `ok: false` do `checklist` (régua "ficar forte" 2.52) → até 3 avisos, ação `abrir-melhorias`.
- XP/h atual < 70 % da melhor sessão do MESMO mapa (`sessoes`) → "XP caiu X % neste mapa (setup/lure?)".
- Chaves: `pgAvisoChaves` cheia → erro.
Testes: um caso por regra + foto limpa sem nenhum erro.

### Task 9: agente "Boss e Elite" (`boss`, ☗)
- Chaves de Elite no depósito/mochila (`chaves.elites`) → "Usar N chaves de <elite> (sweep)" — caixa + base 50–420; `impacto` 2
  (estimado; ajuda a forja), ação `abrir-elite`.
- Para cada boss de `base.bosses` com `rec ≤ nivel + 20`: itens de tentativa no depósito ≥ `qtd` → "Pode lutar <boss> k vezes";
  senão, se o drop interessa (peça do topo, base 400+) → "Juntar <item>: cai em <onde>" (aponta para o agente 8).
- Invasão não inscrita hoje → "Inscrever na Invasão" (fragmento T2 grátis), ação `invasao`.
Testes: 12 chaves → sweep; tentativa suficiente → lutar; invasão já inscrita → nada.

### Task 10: agente "Bestiário" (`best`, ☰)
- De `foto.bestiario` (vem de `pgLinhasBestiario` + `pgPlanoBestiario`): marcos abertos com bônus na ordem `base.bestiarioPrioridade`
  em mapas com `xpH ≥ 80 %` da caçada atual → "Fechar <bônus +g> em <mapa> (~h h)", `impacto` = para ML/ataque/skill: 3 %
  (estimado), regen/vida: 1 %; dividido pelas horas (preferir o que fecha logo). Ação `ir-mapa`.
- Marco do próprio mapa atual a menos de 10 h → estado ok "já fechando aqui".
Testes: Shadow Nexus faltando 8k de 50k com ML+1 → aviso "já fechando"; mapa com XP 50 % da atual → ignorado.

### Task 11: agente "Caçar itens" (`itens`, ⌕)
- Próxima ilha de `base.ilhas` que a conta não abriu e cuja faixa traz caçada melhor que a atual (agente 4) → para cada material:
  faltam = qtd − depósito; preço no Mercado × faltam vs horas de farm (chance × 1 chave/h no Extremo) → "Comprar 6 Spectral Conch
  (~X ouro)" ou "Caçar Haunted Nexus Tomb ~h h"; ouro da ilha incluso no `custo`. Ação `abrir-silas` / `comprar-mercado`.
Testes: Marapur com 4 Conch no depósito e preço 300k → custo 10 M + 6 × 300k; sem preço → sugere caçar.

### Task 12: agente "Forja e refino" (`forja`, ⚒)
- `forja.abaixo4`: peças vestidas com refino < 4 → "Refinar <peça> +r → +4 (~X ouro, sem risco)", `custo` de `pgRefino`, `impacto`:
  arma do Knight = Δataque/ataque × 100 × 0,7; armadura/escudo = 0,5; ação `abrir-forja`.
- `forja.idadeH > 24` → "Recalcular a Forja" (ação `forja-ler`).
- Base de boss/elite com potência ≥ 400 parada no depósito → "Base boa parada: <peça>".
Testes: stonecutter +0 → conselho com custo; tudo +4 → ok.

### Task 13: agente "Dinheiro" e o chefe com orçamento (`ouro`, $)
- `ouroLivre = ouro − 3 × gastoH(caçada atual) − (bênçãos se faltam)`.
- Pega todos os conselhos dos outros agentes com `custo > 0`, ordena por `impacto / custo` e escolhe guloso dentro de `ouroLivre`
  → um conselho-resumo "Com X livres: A, B, C"; os que não cabem → "Juntar para: D (falta Y)".
- Precisa rodar DEPOIS dos outros: `trRodar` chama os agentes com `fase: 2` por último, passando `todos` já calculados.
Testes: orçamento 1 M com custos 400k/500k/900k e impactos 5/4/9 (impacto por milhão 12,5 / 8 / 10) → guloso pega 400k (12,5),
o de 900k não cabe nos 600k que sobram, pega 500k → "400k + 500k"; ouroLivre negativo → "não gaste: o ouro mal paga a caçada".

---

## Task 14: `trFoto()` — juntar os dados reais (DOM/estado, sem simulação)

**Files:** Modify `tibidle-helper.user.js` — nova seção `/* @@TREINADOR-INICIO */ … /* @@TREINADOR-FIM */` logo antes de `/* @@ARENA-INICIO` (DOM).

**Step 1:** Escrever `trFoto()` lendo SÓ o que é barato (mapa do código em 27/11):
- `nivelAtual()` (741), `ouroAtual()` (752)/`mlOuroNormal()` (18471), `emHunt()` (758), `huntAtual()` (981), `ESTADO_WS.lureTierByHunt`,
  `mkPremiumAgora()` (16417), `frameFresco()` + `ESTADO_WS.frame.an` → `medidoAtual`.
- `mapas`: `ler('radar_rank')` (Radar) + `scanResultados()` + `resumoPorHunt()` + `SETUPS_DISCORD`/`dcSetupsDaHunt` (comunidade) +
  `CAT.hunts` (levelMin, island) + `ilhasDestravadas()` (aberta). Nunca chamar `rankingRodar`/`estimarMapa`.
- `party`: `rosterEquip()` (7019) + `ESTADO_WS.sk`; `legado`: `legadoDaConta()` (13227) convertido para `{skill, marcoAtual, proxMarco…}`.
- `prey`: `PROG.prey` (`pgLerPrey`); `chaves`: `PROG.chaves`; `bestiario`: `pgLinhasBestiario(CAT.hunts, PROG.best, pgMedidos(), nivel)`
  com xpH de `mapas`; `checklist`: `EQUIP.res && mlChecklist(EQUIP.res.porVoc, EQUIP.ctx)` (só se já calculado; senão null).
- `forja`: peças vestidas com `forja.refino < 4` + `pgRefino`; `idadeH` do último `FJ.rank`.
- `mortes`/`sessoes`: `ler('sessoes')` (campos de morte; se não houver, `ESTADO_WS.ultimoEnded`).
- `topo`: `lerComum('tr_topo')` (Task 15). `precos`: `MK.catalogo` (sem pedir nada). `deposito`: `ESTADO_WS.depotReal` contado por nome.
- Campos da Task 1 (bênçãos, ampulhetas, Selo, Invasão) a partir do welcome/meta.
Tudo dentro de try/catch por bloco: um campo quebrado vira `null`, nunca derruba a tela.

**Step 2:** Teste ao vivo rápido (Playwright, aba com a versão nova): `__tbHelper.trFoto()` exposto pela API de debug → conferir
cada campo com a conta u2tag; salvar a foto (sem nome/ouro reais) em `testes/fixtures/treinador-u2tag.json`.

**Step 3:** Teste de integração em `testes/treinador.test.js`: `trRodar(fixture u2tag)` → 10 cartões, 1–3 passos, nenhum `erro`,
tempo < 50 ms (medir com `process.hrtime`). Fazer o mesmo para fixtures montadas de ShamanBr (~216) e XundaBr (~121) a partir dos
dados que o projeto já tem (TIBIDLE.md / data) — níveis diferentes exercitam as faixas.

**Step 4:** commit "treinador: foto real da conta + fixtures das 3 contas".

---

## Task 15: leitura do topo do rank (rede, com freio)

**Files:** Modify `@@TREINADOR`.
- `trLerTopo()`: `fetch('/leaderboard')` (público) → minha posição, top1, skills da faixa `[nivel, nivel+150]`; depois `player_profile`
  pelo socket (`enviarWS`, resposta `player_profile_result`) dos até 25 nomes dessa faixa, **1 por segundo**, parando no 1º erro;
  guarda só `{nivel, voc:{VOC:{slot:nome}}}` dos visíveis em `guardarComum('tr_topo', …)` com `t`. Uma leitura por 24 h (6 h para o
  leaderboard). Só dispara pelo botão "Comparar com o topo" (ação `ler-topo`).
- Teste: função pura `trResumirTopo(leaderboard, perfis, nivel)` no `@@TREINADOR-PURO` com a fixture do topo → posição 178, faixa certa.
- Commit "treinador: leitura do topo do rank (leaderboard + perfis visíveis)".

---

## Task 16: tela, abas e botões

**Files:** Modify `tibidle-helper.user.js`: `ICONES` (11597), `ROTULO_CURTO` (12104), `_renderizar` (~19651), `pintarTrilho` (~19601),
`telaAnalise`/`ligarAnalise` (13072/13114), `telaProgresso` (15345).

**Step 1:** `ICONES`: trocar `['analise', '▤', 'Analisador']` por `['treinador', '▤', 'Progresso']`; renomear `['progresso', '⚑', 'Progresso']`
para `['progresso', '⚑', 'Rotina']` (a chave fica `progresso` para não perder `prog_sub`). `ROTULO_CURTO.treinador = 'Progr'`.
Quem tinha `ABA === 'analise'` salvo abre `treinador`.

**Step 2:** `_renderizar`: `ABA === 'treinador' ? telaTreinador()` e `if (ABA === 'treinador') ligarTreinador()`. Tirar `telaAnalise` do
despacho; manter `amostrar`/`fecharSessao`/`sessoes` (Radar e Bestiário usam). Apagar `telaAnalise`/`ligarAnalise` só se nada mais chamar
(grep antes).

**Step 3:** `telaTreinador()`:
- Calcula `trRodar(trFoto(), TR_BASE)` no máximo 1×/60 s (cache `TR.ultimo`), ou ao tocar "Atualizar".
- Topo: "Próximos passos" (até 3): título, `+X % XP/h` (ou "−Y h perdidas/sem"), custo, selo de confiança, botão `Fazer`.
- Linha de situação: nível · posição no rank (se lida) · XP/h agora · ouro livre.
- 10 cartões `<details>` (`data-k` preserva aberto) com ícone, nome, estado ✓/⚠/✗, até 3 conselhos (1 linha) e `?` com o porquê.
- Rodapé: idade de Radar/Forja/Topo + botões "Atualizar" e "Comparar com o topo".
- `garantirCssTelas()` e classes existentes (`tb-cx`, `tb-ok`, `tb-av`, `tb-ruim`, `tb-tag`); CSS novo mínimo com prefixo `tr-`.

**Step 4:** `ligarTreinador()` — despacho de `acao.tipo`:
| tipo | faz |
|---|---|
| `ir-mapa` | `scanIrPara(huntId)` (2 toques; confere `travaJogo`) |
| `lure` | `start_hunt` com a lure nova via `voltarParaHuntSocket` adaptado (ou abre a tela de caçada) |
| `abrir-equip` / `abrir-melhorias` / `abrir-forja` / `abrir-aguentar` | `ABA = …; renderizar()` |
| `forja-ler` | `fjLer()` |
| `ler-topo` | `trLerTopo()` |
| `comprar-mercado` | `mlComprar` quando houver anúncio recomendado; senão abre Mercado |
| `invasao`, `prey-*`, `bencaos`, `ampulheta`, `abrir-silas`, `abrir-elite`, `abrir-loja` | mensagens da Task 1; se não houver protocolo limpo, clica o `data-testid` do painel do jogo |
Todos com `ligarDoisToques` quando `custo > 0`; log `treinador: <ação>` no Log.

**Step 5:** `node --check`, suíte, eslint. Commit "2.67.0 — aba Progresso: o treinador (10 especialistas)" com versão subida.

---

## Task 17: teste ao vivo e entrega

1. Playwright, aba nova com a 2.67.0 (receita da memória). Abrir ▤ Progresso: na cidade, caçando e logo após F5 (sem welcome).
2. Medir: `renderizar` da aba < 100 ms (o helper loga > 250 ms); nenhum erro no Log; console limpo.
3. Apertar uma ação barata de cada tipo que exista na conta (abrir-*, forja-ler, ler-topo, ir-mapa num mapa seguro e voltar ao
   Shadow Nexus). Nenhuma compra sem o dono pedir.
4. Conferir os 3 passos com o bom senso (eles batem com o que os relatórios dizem? ex.: ampulhetas/Legado, prey, Issavi).
5. Rotina (⚑) continua funcionando (Bestiário/Invasão/Offline/Prey).
6. Devolver aba limpa (Tampermonkey) depois de publicar: commit + push, abrir o raw SEM `?t=` e Atualizar.
7. `TIBIDLE.md`: seção "2.67.0" (o que cada agente faz, fontes, limites). Memória: nota nova `tibidle-treinador-2-67`.
8. Relatar ao dono: os 3 passos da u2tag, o que ele precisa abrir nas outras 2 contas (Chrome dele), o que ficou "abrir a tela do jogo".

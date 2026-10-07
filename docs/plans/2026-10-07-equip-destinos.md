# Equip 2.15.0 — destinos com botão (plano de implementação)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** As quatro caixinhas da aba Equip ("sobrando", "bases de forja", "guardar: encaixe bom", "reservas") passam a
dizer o que fazer e a ter o botão que faz: VENDER NO NPC (comuns, 2 toques), ANUNCIAR NO MERCADO (incomuns+, abre a aba
Mercado já marcada com preço de referência), reservas = 1 por slot, e todo nome de peça com link para a ficha da wiki.

**Architecture:** Tudo num arquivo (`tibidle-helper.user.js`). Funções puras novas vão para os blocos marcados que os
testes extraem (`@@EQUIP-PURO`, `@@MERCADO-INICIO…@@MERCADO-PURO-FIM`). A venda no NPC reaproveita `venderNoNpc` (venda do
Auto Hunt) com uma lista "apenas estes"; o anúncio reaproveita a aba Mercado inteira (marcar + 2 toques), com um novo
conjunto `MK.liberadas` que tira a barreira "melhor ou reserva" só para os iids que o dono mandou do Equip.

**Tech Stack:** userscript Tampermonkey (JS 2023, sem módulos), testes em node puro (`testes/*.test.js`, `new Function` sobre
o trecho entre marcadores, `vm` para o script inteiro), ESLint 10 (`eslint.config.mjs`). Desenho em
`docs/plans/2026-10-07-equip-destinos-design.md`.

**Comandos de verificação (rodar depois de cada tarefa):**
```sh
node --check tibidle-helper.user.js
node testes/equip.test.js && node testes/mercado.test.js && node testes/telas.test.js
for f in testes/*.test.js; do node "$f" || exit 1; done          # antes de cada commit
npx --yes eslint@10 --no-config-lookup -c eslint.config.mjs tibidle-helper.user.js   # 0 erros
```
Comentários no código em **português**. Mensagens de commit em português, terminadas com
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: `wikiSlug` / `wikiUrlPeca` (puro, EQUIP-PURO)

**Files:**
- Modify: `tibidle-helper.user.js` — logo após `const vendivelNpc = …` (≈ linha 6214, dentro de `@@EQUIP-PURO`)
- Test: `testes/equip.test.js`

**Step 1: Teste que falha** — em `testes/equip.test.js`, acrescente `wikiSlug, wikiUrlPeca` à lista do `return { … }` do
`new Function` (linha 10) e, no fim do arquivo (antes do resumo final de contagem), o teste:
```js
t('wikiSlug: minúsculas, sem apóstrofo, espaços viram hífen (link da wiki)', () => {
    assert.strictEqual(M.wikiSlug("Dragha's Spellbook"), 'draghas-spellbook');
    assert.strictEqual(M.wikiSlug('dark armor'), 'dark-armor');
    assert.strictEqual(M.wikiSlug('  Wand of Vortex  '), 'wand-of-vortex');
    assert.strictEqual(M.wikiUrlPeca('plate armor'), 'https://tibidle.com/wiki/database/equipamentos/plate-armor');
});
```
**Step 2:** `node testes/equip.test.js` → FAIL ("wikiSlug is not defined").

**Step 3: Implementação** (após `vendivelNpc`):
```js
    /* v2.15.0 — link da ficha na wiki oficial: /wiki/database/equipamentos/<slug>; slug = minúsculas, apóstrofo
     * removido, qualquer outra coisa que não seja letra/dígito vira um hífen ("Dragha's Spellbook" → draghas-spellbook). */
    const wikiSlug = (nome) => String(nome == null ? '' : nome).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const wikiUrlPeca = (nome) => 'https://tibidle.com/wiki/database/equipamentos/' + wikiSlug(nome);
```
**Step 4:** `node testes/equip.test.js` → todos `ok`.

**Step 5: Commit**
```sh
git add tibidle-helper.user.js testes/equip.test.js
git commit -m "2.15.0 (1/8) — wikiSlug/wikiUrlPeca: link da ficha da peça na wiki"
```

---

### Task 2: reservas = 1 por slot

**Files:**
- Modify: `tibidle-helper.user.js:6206` (`EQUIP_RESERVAS = 2` → `1`) e o comentário `/* reservas: os 2 melhores … */`
  (≈ 6392) e o texto da tela "não são a melhor nem uma das 2 reservas" (≈ 8047, será reescrito na Task 6)
- Test: `testes/equip.test.js`

**Step 1: Teste que falha** — acrescente `EQUIP_RESERVAS` ao `return` do `new Function` e o teste:
```js
t('reservas: só a 2.ª melhor de cada slot fica; a 3.ª vai para as sobras (dono, 07/10)', () => {
    assert.strictEqual(M.EQUIP_RESERVAS, 1);
    const anel = (iid, regen) => ({ iid, nome: 'crystal ring', slot: 'ring', attrs: base['crystal ring'].attrs, equipPreview: null, sell: 250,
        origem: iid === 'a' ? 'corpo' : 'depósito', dono: iid === 'a' ? 'SORCERER' : null, forja: F(1, ['regen_mana', regen]) });
    const R = M.distribuirEquip([anel('a', 2.3), anel('b', 1.5), anel('c', 1.1)], ['SORCERER'], null);
    assert(R.usadas.has('a'), 'a melhor (2,3) no corpo');
    assert.deepStrictEqual([...R.reservas], ['b'], 'só a 2.ª melhor é reserva');
    assert(R.dispensaveis.some(p => p.iid === 'c'), 'a 3.ª cai nas sobras');
});
```
Observação: `F` e `base` já existem no arquivo de teste. Se `distribuirEquip` exigir `ctx` não nulo, passe `{}`.

**Step 2:** `node testes/equip.test.js` → FAIL (`EQUIP_RESERVAS` é 2 e `reservas` tem 2 iids).

**Step 3:** mude `EQUIP_RESERVAS = 2` para `EQUIP_RESERVAS = 1` e o comentário:
```js
        /* reservas: a 2.ª melhor de cada (voc, slot) com pontos > 0. v2.11.6 eram 2; v2.15.0 — dono (07/10): "não posso
         * ficar guardando item que nunca vou usar" → 1 por slot; a 3.ª melhor vai para as sobras. */
```
**Step 4:** `node testes/equip.test.js` → ok. Se algum teste antigo contava 2 reservas, ajuste a expectativa dele para 1
(e diga no commit qual).

**Step 5: Commit** — `2.15.0 (2/8) — reservas: 1 por slot (a 3.ª melhor vai para as sobras)`.

---

### Task 3: `destinosSobras` (puro, EQUIP-PURO)

**Files:**
- Modify: `tibidle-helper.user.js` — após `wikiUrlPeca` (Task 1)
- Test: `testes/equip.test.js`

**Step 1: Teste que falha** — acrescente `destinosSobras` ao `return` e:
```js
t('destinosSobras: comum vai ao NPC, incomum+ ao Mercado, peça no corpo fica à parte', () => {
    const d = M.destinosSobras({ dispensaveis: [
        { iid: '1', nome: 'lightning robe', origem: 'depósito', sell: 11000, forja: F(0) },
        { iid: '2', nome: 'blue robe', origem: 'mochila', sell: 3000, forja: F(0) },
        { iid: '3', nome: 'plate armor', origem: 'depósito', sell: 400, forja: F(2, ['resist_sagrado', 1.4]) },
        { iid: '4', nome: 'crowbar', origem: 'depósito', sell: 50, forja: { raridade: 0, refino: 2, atributos: [] } },
        { iid: '5', nome: 'glacial rod', origem: 'corpo', dono: 'DRUID', sell: 6500, forja: F(0) }] });
    assert.deepStrictEqual(d.npc.map(p => p.iid), ['1', '2'], 'comuns sem refino, fora do corpo');
    assert.strictEqual(d.npcOuro, 14000);
    assert.deepStrictEqual(d.mercado.map(p => p.iid), ['3', '4'], 'incomum ou refinada: o NPC não compra');
    assert.deepStrictEqual(d.corpo.map(p => p.iid), ['5']);
    assert.deepStrictEqual(M.destinosSobras(null), { npc: [], mercado: [], corpo: [], npcOuro: 0 });
});
```
**Step 2:** FAIL. **Step 3:**
```js
    /* v2.15.0 — as sobras por destino: comum sem refino → NPC (o NPC não compra Incomum+ nem refinada, visto em 04/10);
     * o resto → Mercado; peça ainda no corpo de alguém fica à parte (tirar à mão antes). */
    function destinosSobras(res) {
        const disp = (res && res.dispensaveis) || [];
        const corpo = disp.filter(p => p.origem === 'corpo');
        const fora = disp.filter(p => p.origem !== 'corpo');
        const npc = fora.filter(vendivelNpc), mercado = fora.filter(p => !vendivelNpc(p));
        return { npc, mercado, corpo, npcOuro: npc.reduce((s, p) => s + (Number(p.sell) || 0), 0) };
    }
```
**Step 4:** ok. **Step 5: Commit** — `2.15.0 (3/8) — destinosSobras: comum → NPC, incomum+ → Mercado`.

---

### Task 4: `precoReferencia` (puro, MERCADO) e a origem "parecida" na linha do Mercado

**Files:**
- Modify: `tibidle-helper.user.js` — após `mkFmt` (≈ 9376); `mkRefCopia` (≈ 9434); `mkLinha` (≈ 9464); `MK_ORIGEM` (9678)
- Test: `testes/mercado.test.js`

**Step 1: Teste que falha** — em `testes/mercado.test.js`, acrescente `precoReferencia` ao `return` da `new Function P`
(linha ≈ 45) e os testes (parte 1, puras):
```js
const cp = (item, preco, rar, atrs, orderId) => ({ orderId: orderId || 'o' + preco, itemName: item, unitPrice: preco, sellerName: 'x',
    instance: { iid: 'i' + preco, name: item, forja: { raridade: rar, refino: 0, atributos: atrs.map(([id, valor]) => ({ id, valor })) } } });
const F1 = (rar, ...atrs) => ({ raridade: rar, refino: 0, atributos: atrs.map(([id, valor]) => ({ id, valor })) });
t('precoReferencia: igual (mesmo corte) → menor −1; o meu anúncio não conta', () => {
    const copias = { 'cat:armaduras': { copies: [cp('dark armor', 300000, 1, [['regen_mana', 1.1]]), cp('dark armor', 450000, 1, [['regen_mana', 1.2]]), cp('dark armor', 9999, 1, [['resist_gelo', 1]]), cp('dark armor', 100, 1, [['regen_mana', 2]], 'meu')] } };
    igual(P.precoReferencia({ nome: 'dark armor', forja: F1(1, ['regen_mana', 1.4]) }, copias, new Set(['meu'])), { preco: 299999, origem: 'igual', ref: 300000 });
});
t('precoReferencia: parecida só com o encaixe nobre em comum (regen. de mana não casa com resistência)', () => {
    const copias = { 'cat:armaduras': { copies: [cp('dark armor', 450000, 2, [['resist_sagrado', 0.8], ['regen_mana', 1.2]]), cp('dark armor', 14999, 2, [['resist_morte', 1.2], ['resist_gelo', 1]])] } };
    igual(P.precoReferencia({ nome: 'dark armor', forja: F1(2, ['regen_mana', 1.4], ['resist_morte', 2.1]) }, copias, new Set()), { preco: 449999, origem: 'parecida', ref: 450000 });
});
t('precoReferencia: sem nobre, parecida = qualquer atributo em comum; senão faixa; senão vazio', () => {
    const copias = { 'cat:armaduras': { copies: [cp('plate armor', 65000, 2, [['resist_gelo', 2.1], ['resist_energia', 1.6]]), cp('plate armor', 70000, 2, [['max_mana', 55], ['protecao_magica', 0.4]])] } };
    igual(P.precoReferencia({ nome: 'plate armor', forja: F1(2, ['resist_sagrado', 1.4], ['resist_energia', 1.9]) }, copias, new Set()), { preco: 64999, origem: 'parecida', ref: 65000 });
    igual(P.precoReferencia({ nome: 'plate armor', forja: F1(2, ['max_hp', 20], ['cura_propria', 1]) }, copias, new Set()), { preco: null, origem: 'faixa', ref: null, min: 65000, max: 70000 });
    igual(P.precoReferencia({ nome: 'plate armor', forja: F1(3, ['max_hp', 20]) }, copias, new Set()), { preco: null, origem: 'vazio', ref: null });
    igual(P.precoReferencia({ nome: 'plate armor', forja: F1(0) }, null, null), { preco: null, origem: 'vazio', ref: null });
});
t('mkMontar: cópia sem igual mas com parecida recebe o preço (origem "parecida"); sem parecida continua "digite"', () => {
    const copias = { 'cat:armaduras': { copies: [cp('plate armor', 65000, 2, [['resist_gelo', 2.1], ['resist_energia', 1.6]])] } };
    const e = base({ depot: [{ itemName: 'plate armor', count: 1, iid: 'pa1', forja: F1(2, ['resist_sagrado', 1.4], ['resist_energia', 1.9]) }],
        catalogo: { 'plate armor': { name: 'plate armor', sellOrders: 1, minSell: 65000, trades30d: 5, copyOrders: 1 } }, copias, equip: { usadas: [], reservas: [], sobras: ['pa1'] } });
    const l = linha(P.mkMontar(e), 'i:pa1');
    assert.strictEqual(l.preco, 64999); assert.strictEqual(l.origem, 'parecida'); assert.strictEqual(l.bloqueio, null);
});
```
**Step 2:** `node testes/mercado.test.js` → FAIL.

**Step 3: Implementação.** Após `mkFmt`:
```js
    /* v2.15.0 — PREÇO DE REFERÊNCIA de uma peça forjada, para a aba Equip e para a linha do Mercado sem cópia igual.
     * 1) igual: outro vendedor com o mesmo corte (raridade, refino, mesmos ids de atributo) → menor −1;
     * 2) parecida: mesma raridade e refino e encaixe do mesmo tipo — se a peça tem encaixe NOBRE (regen, skill, dano,
     *    loot) a cópia tem de ter TODOS os nobres dela (regen. de mana vale 30× uma resistência: 450k × 15k ao vivo
     *    em 07/10); sem nobre, basta um atributo em comum → menor −1;
     * 3) faixa: mesma raridade e refino, outros encaixes → só mín–máx, sem preço (o dono digita);
     * 4) vazio. As minhas ordens (meusIds) nunca contam. */
    const MK_ATR_NOBRES = ['regen_mana', 'regen_vida', 'nivel_magico', 'distancia', 'corpo_a_corpo', 'dano_fisico', 'dano_magico', 'chance_de_loot'];
    function precoReferencia(x, copias, meusIds) {
        const vazio = { preco: null, origem: 'vazio', ref: null };
        if (!x || !copias) return vazio;
        const n = mkMin(x.nome), meus = meusIds || new Set(), doItem = [];
        for (const cp of Object.values(copias)) for (const y of ((cp && cp.copies) || [])) {
            if (!y || meus.has(y.orderId)) continue;
            if (mkMin(y.itemName || (y.instance && y.instance.name)) !== n) continue;
            const p = Number(y.unitPrice); if (!(p > 0)) continue;
            doItem.push({ p, f: y.instance && y.instance.forja });
        }
        if (!doItem.length) return vazio;
        const menos1 = (lista, origem) => { const m = Math.min(...lista); return { preco: Math.max(1, m - 1), origem, ref: m }; };
        const iguais = doItem.filter(y => mkMesmoCorte(x.forja, y.f)).map(y => y.p);
        if (iguais.length) return menos1(iguais, 'igual');
        const ids = mkAtrIds(x.forja), nobres = ids.filter(id => MK_ATR_NOBRES.includes(id));
        const casa = (f) => { const o = mkAtrIds(f); return nobres.length ? nobres.every(id => o.includes(id)) : ids.some(id => o.includes(id)); };
        const mesmoCorte = doItem.filter(y => mkMesmoCorteSemEncaixe(x.forja, y.f));
        const parecidas = mesmoCorte.filter(y => casa(y.f)).map(y => y.p);
        if (parecidas.length) return menos1(parecidas, 'parecida');
        const faixa = mesmoCorte.map(y => y.p);
        if (faixa.length) return { preco: null, origem: 'faixa', ref: null, min: Math.min(...faixa), max: Math.max(...faixa) };
        return vazio;
    }
```
Em `mkRefCopia`, depois de calcular `outros`/`parecidas` (dentro do `if (cp && !cp.erro)`), guarde a referência parecida:
```js
                parecida = !outros.length ? precoReferencia(x, { [k]: cp }, meusIds) : null;
```
(declare `let parecida = null;` junto de `let outros = [], parecidas = [], pendente = null;`) e devolva-a:
`return { ref: { outros, meus, media: null }, pendente, nota, encaixe: encaixe || null, parecida: parecida && parecida.origem === 'parecida' ? parecida : null };`.
A `nota` só vale quando não há parecida: troque a condição para `!pendente && !outros.length && !meus.length && !(parecida && parecida.origem === 'parecida')`.

Em `mkLinha`, troque a linha do `sug`:
```js
        let sug = r.pendente ? { preco: null, origem: 'pendente', ref: null } : mkSugerir(r.ref);
        if (sug.origem === 'vazio' && r.parecida && r.parecida.preco) sug = { preco: r.parecida.preco, origem: 'parecida', ref: r.parecida.ref };
```
Em `MK_ORIGEM` acrescente `parecida: 'parecida −1 (mesma raridade, encaixe do mesmo tipo)'`. Em `mkTelaAnunciar`, a variável
`org` já usa `MK_ORIGEM[l.origem]`; acrescente o valor de referência: `l.origem === 'parecida' ? MK_ORIGEM.parecida + ' a ' + mkFmt(l.sug.ref) : …`.

**Step 4:** `node testes/mercado.test.js` → ok (parte 1 e parte 2). **Step 5: Commit** —
`2.15.0 (4/8) — precoReferencia: igual / parecida (nobre casa só com nobre) / faixa; linha do Mercado usa a parecida`.

---

### Task 5: `MK.liberadas` — peças que o Equip mandou anunciar passam pela barreira "melhor ou reserva"

**Files:**
- Modify: `tibidle-helper.user.js` — `MK = { … }` (9680: `liberadas: new Set()`), `mkEntrada` (≈ 9808: `liberadas: [...MK.liberadas]`),
  `mkMontar` (≈ 9499 e ≈ 9552)
- Test: `testes/mercado.test.js`

**Step 1: Teste que falha**:
```js
t('mkMontar: liberadas tira a barreira "melhor ou reserva" só para o iid liberado; peça no corpo nunca', () => {
    const dep = [{ itemName: 'plate armor', count: 1, iid: 'res1', forja: F1(1, ['regen_mana', 1.3]) }, { itemName: 'plate armor', count: 1, iid: 'res2', forja: F1(1, ['regen_vida', 1.3]) }];
    const e = (lib) => base({ depot: dep, catalogo: { 'plate armor': { name: 'plate armor', sellOrders: 0, trades30d: 5 } },
        equip: { usadas: ['usa1'], reservas: ['res1', 'res2'], sobras: [] }, liberadas: lib });
    const sem = P.mkMontar(e([]));
    assert(sem.fora.some(f => f.iid === 'res1' && /melhor ou reserva/.test(f.motivo)), 'sem liberar: fora');
    const com = P.mkMontar(e(['res1']));
    assert(linha(com, 'i:res1'), 'liberada entra na lista'); assert(com.fora.some(f => f.iid === 'res2'), 'a outra reserva continua fora');
    const corpo = P.mkMontar(base({ bagInst: [{ iid: 'usa1', name: 'plate armor', forja: F1(0) }], catalogo: {}, equip: { usadas: ['usa1'], reservas: [], sobras: [] }, liberadas: ['usa1'] }));
    assert(corpo.fora.some(f => f.iid === 'usa1' && /corpo/.test(f.motivo)), 'o que está no corpo nunca é liberado');
});
```
**Step 2:** FAIL. **Step 3:** em `mkMontar`, logo após `const eq = …`:
```js
        /* v2.15.0 — liberadas: iids que o dono mandou do Equip (botões ANUNCIAR das caixinhas). Tiram a barreira
         * "melhor ou reserva" e a lista branca das sobras SÓ para esses iids; o que está no corpo nunca entra. */
        const usadas = new Set((e.equip && e.equip.usadas) || []), lib = new Set(e.liberadas || []);
```
em `motivoPeca`, troque a última cláusula por:
```js
            : usadas.has(x.iid) ? 'no corpo de alguém (tire antes)'
            : eq && x.iid && eq.has(x.iid) && !lib.has(x.iid) ? 'melhor ou reserva no Equip' : null);
```
e na lista branca: `if (sobras && !sobras.has(x.iid) && !lib.has(x.iid)) { barrar(…) }`.
Em `MK` acrescente `liberadas: new Set(),` e em `mkEntrada` o campo `liberadas: [...MK.liberadas]`.

**Step 4:** ok. **Step 5: Commit** — `2.15.0 (5/8) — MK.liberadas: o Equip libera iids para o Mercado; corpo nunca`.

---

### Task 6: tela Equip — 4 caixinhas com texto de ação, preço de referência, links e botões

**Files:**
- Modify: `tibidle-helper.user.js` — `telaEquip` (`nomePeca` ≈ 8008; bloco das caixinhas ≈ 8036–8075), `ligarEquip` (8084),
  CSS do Equip (procure `garantirCssTelas` / `.tb-eq-nota`)
- Test: `testes/telas.test.js` (teste "Equip: escape de itens…" ≈ linha 401)

**Step 1: Teste que falha** — no teste da linha 401, depois de `semXss(h, 'Equip')`, acrescente:
```js
    assert(/id="tb-eq-vender-npc"/.test(h), 'botão VENDER NO NPC');
    assert(/id="tb-eq-anunciar-sobras"/.test(h) && /id="tb-eq-anunciar-nobres"/.test(h) && /id="tb-eq-anunciar-bases"/.test(h), 'botões ANUNCIAR');
    assert(/href="https:\/\/tibidle\.com\/wiki\/database\/equipamentos\/[a-z0-9-]+"/.test(h), 'link da wiki nas peças');
    assert(/encaixe que o Mercado paga/.test(h) && /vender no NPC \(/.test(h) && /anunciar no Mercado \(/.test(h), 'títulos das caixinhas');
```
(Se o `h` desse teste não tiver sobras, use um `depot` com uma `lightning robe` comum e uma `plate armor` rara para ter
as duas listas.)
**Step 2:** `node testes/telas.test.js` → FAIL.

**Step 3: Implementação.** Em `telaEquip`:
1. `nomeLink`: `const nomeLink = (p) => `<a class="tb-lk" href="${wikiUrlPeca(p.nome)}" target="_blank" rel="noopener" title="ficha na wiki">${escHtml(p.nome)}</a>`;`
   e use `nomeLink(p)` no lugar de `escHtml(p.nome)` em `nomePeca` e nas 4 listas. CSS: `.tb-lk{color:inherit;text-decoration:none;border-bottom:1px dotted currentColor}`.
2. Preço de referência: `const meusIds = new Set((MK.minhas || []).map(o => o.id));`
```js
        const refTxt = (p) => {
            if (!MK.copias || !Object.keys(MK.copias).length) return '<span class="tb-mut">ref. Mercado: aba Mercado → ATUALIZAR</span>';
            const r = precoReferencia({ nome: p.nome, forja: p.forja }, MK.copias, meusIds);
            if (r.origem === 'igual') return `ref. Mercado <b>${mkFmt(r.preco)}</b> <span class="tb-mut">(igual a ${mkFmt(r.ref)})</span>`;
            if (r.origem === 'parecida') return `ref. Mercado <b>${mkFmt(r.preco)}</b> <span class="tb-mut">(parecida a ${mkFmt(r.ref)})</span>`;
            if (r.origem === 'faixa') return `<span class="tb-mut">faixa ${mkFmt(r.min)}–${mkFmt(r.max)} — você digita</span>`;
            return '<span class="tb-mut">sem cópia à venda — você digita</span>';
        };
```
3. Substitua o bloco `aj('eq-disp', …)` por duas caixinhas a partir de `const D = destinosSobras(R);`:
   - **vender no NPC**: botão `tb-eq-vender-npc` (2 toques, `EQUIP.vendaConf` como `desmConf`; desligado fora da cidade,
     sem socket, ou com `EQUIP.vendendo`), nota "comuns sem encaixe: o NPC paga mais que o Mercado líquido; o botão retira
     do baú só estas, abre VENDER, desmarca o resto e confirma", linhas `nomeLink · motivo · NPC X`. Título:
     `vender no NPC (${D.npc.length} · ${numBR(D.npcOuro)} o)`. Peças de `D.corpo`: linha "no corpo do <voc> — ninguém usa; tire à mão se quiser".
   - **anunciar no Mercado**: botão `tb-eq-anunciar-sobras`, nota "incomum ou melhor: o NPC não compra; a aba Mercado abre com
     estas marcadas e o preço de referência — você confirma lá, com a taxa escrita", linhas `nomeLink rarTag · encaixe · refTxt`.
     Título `anunciar no Mercado (${D.mercado.length})`.
4. **bases de forja**: título mantido; nota nova de 1 linha: "raras de 3 encaixes: só valem guardar se você for forjar —
   <a href="https://tibidle.com/wiki/forja" target="_blank" rel="noopener">como forjar</a>. Sem forjar, anuncie." +
   botão `tb-eq-anunciar-bases` + linhas com `refTxt`; o `planoForjaHtml` fica dentro do `<details>` existente.
5. **nobres**: título `encaixe que o Mercado paga (${nobres.length})`; nota: "regen. de mana/vida nos encaixes é o que o
   Mercado paga caro (dark armor com regen. de mana 1,1: 300 mil). Você só tem 4 corpos: anuncie o que sobra." + botão
   `tb-eq-anunciar-nobres` + linhas com `refTxt`.
6. **reservas**: cada linha `reserva de ${VOC_ROTULO[v]} · ${slotPt(s)} · ${pt(c.r.pontos)} (a do corpo tem ${pt(melhorPt)})`,
   via `reservaInfo(iid)` (percorre `R.porVoc[v][s].candidatos`, devolve a primeira ocorrência com `c.peca.iid === iid`,
   `melhorPt = R.porVoc[v][s].melhorPt ?? atualPt`). Nota: "a 2.ª melhor de cada slot: seguro contra vender sem querer a única
   peça boa. 1 lugar por slot."
7. Em `ligarEquip`:
```js
        const vn = $('#tb-eq-vender-npc'); if (vn) vn.onclick = () => { const agora = Date.now(); if (EQUIP.vendaConf && agora < EQUIP.vendaConf) { EQUIP.vendaConf = null; venderSobrasNpc(destinosSobras(EQUIP.res).npc); } else { EQUIP.vendaConf = agora + 8000; renderizar(); } };
        const lib = (id, pecas) => { const b = $('#' + id); if (b) b.onclick = () => liberarParaMercado(pecas()); };
        lib('tb-eq-anunciar-sobras', () => destinosSobras(EQUIP.res).mercado);
        lib('tb-eq-anunciar-bases', () => EQUIP.res.bases || []);
        lib('tb-eq-anunciar-nobres', () => EQUIP.res.nobres || []);
```
8. Stubs provisórios (Task 7 e 8 implementam): `function liberarParaMercado() {}` e `async function venderSobrasNpc() {}` — ou
   implemente as Tasks 7/8 antes de rodar o lint (o `no-undef` acusa).

**Step 4:** `node testes/telas.test.js` → ok; `node --check`; eslint 0 erros. **Step 5: Commit** —
`2.15.0 (6/8) — aba Equip: caixinhas viram destinos (NPC / Mercado / encaixe que o Mercado paga / reservas) com links da wiki`.

---

### Task 7: `liberarParaMercado(pecas)` — marca no Mercado e abre a aba

**Files:**
- Modify: `tibidle-helper.user.js` — perto de `desmancharSobras` (≈ 7821)
- Test: `testes/mercado.test.js` (parte 2, vm) — opcional: se a parte 2 já expõe `H`/`W` do script inteiro, acrescente
  um teste que chama o handler do botão e confere `MK.marcados`/`MK.liberadas`; se for caro, cubra na Task 9 (ao vivo) e diga isso no commit.

**Step 3: Implementação:**
```js
    /* v2.15.0 — botões ANUNCIAR das caixinhas do Equip: libera as peças para a aba Mercado (MK.liberadas), marca cada uma
     * ('i:'+iid) e abre a aba. A confirmação continua lá: 2 toques, taxa escrita. Nada é anunciado aqui. */
    function liberarParaMercado(pecas) {
        const lista = (pecas || []).filter(p => p && p.iid && p.origem !== 'corpo');
        if (!lista.length) { EQUIP.aviso = 'nada para anunciar nesta lista'; renderizar(); return; }
        for (const p of lista) { MK.liberadas.add(p.iid); MK.marcados.add('i:' + p.iid); }
        MK.conf = null;
        guardar('mercado_sub', 'anunciar');
        ABA = 'mercado'; guardarUI({ aba: 'mercado', aberta: true });
        log(`equip: ${lista.length} peça(s) marcada(s) para anunciar — confirme na aba Mercado (2 toques)`, 'info');
        renderizar();
        if (!MK.t && !MK.ocupado && socketAberto()) mkAtualizar();
    }
```
Confira que `ABA`, `guardarUI`, `guardar` e `socketAberto` estão no escopo (todos são do mesmo IIFE; `ABA` é `let` em ≈ 6800).

**Step 4:** `node --check`, eslint, todos os testes. **Step 5: Commit** — `2.15.0 (7/8) — liberarParaMercado: ANUNCIAR do Equip abre o Mercado já marcado`.

---

### Task 8: `venderSobrasNpc(pecas)` + `venderNoNpc({ apenas })`

**Files:**
- Modify: `tibidle-helper.user.js` — `venderNoNpc` (4881) ganha `opts`; nova `venderSobrasNpc` perto de `desmancharSobras`
- Test: `testes/autohunt.test.js` — o painel de venda falso já existe ali (≈ linhas 160–220: `idDe`, `sell-confirm` com
  `disabled` ligado ao total, e a fábrica devolve `{ venderNoNpc }`). Acrescente um caso: com `apenas = new Set(['lightning robe'])`
  e painel com `lightning robe` e `dragon ham`, só a `dragon ham` é desmarcada e `sell-confirm` é clicado.

**Step 1: Teste que falha** (no arquivo que já simula o painel de venda):
```js
t('venderNoNpc({apenas}): desmarca tudo que não está na lista e vende o resto', async () => {
    // monte o painel falso com sell-check-lightning robe e sell-check-dragon ham, ambos marcados, total 11001
    // chame H.venderNoNpc({ apenas: new Set(['lightning robe']) }) (exponha no __tbHelper de teste se preciso)
    // espere: dragon ham desmarcada (click registrado), lightning robe intacta, sell-confirm clicado, retorno { ok: true }
});
```
Preencha com os utilitários que o arquivo já tem (o mundo falso de `fumaca.test.js`).

**Step 3: Implementação.** Assinatura `async function venderNoNpc(opts)`; `opts = opts || {}`. Logo após `const lv = linhasDaVenda();`
(dentro de `if (totalAntes > 0)`), troque o trecho `if (prot.equip) { … } const sel = escolherDesmarcar(lv.linhas, prot); guardados = sel.guardar;` por:
```js
            if (opts.apenas) {
                /* v2.15.0 — venda das SOBRAS do Equip: só o que está em `apenas` (nomes normalizados) fica marcado */
                guardados = lv.linhas.filter(l => !opts.apenas.has(normNomeItem(l.nome))).map(l => Object.assign({}, l, { motivo: 'não é sobra do Equip' }));
            } else {
                if (prot.equip) { const reais = …; try { prot.base = await basePorNome(reais); } catch (e) { prot.base = {}; } }
                guardados = escolherDesmarcar(lv.linhas, prot).guardar;
            }
```
e pule `protecaoVenda()` quando `opts.apenas` (`prot = opts.apenas ? { equip: false } : await protecaoVenda()`).

Nova função:
```js
    /* v2.15.0 — VENDER NO NPC as sobras comuns (botão da aba Equip, 2 toques): retira do depósito só estas (depot_withdraw
     * pelo socket), confere que não há outra peça de mesmo nome na mochila que NÃO seja sobra, abre VENDER, desmarca
     * tudo que não é da lista e confirma. Sucesso medido pelo ouro (venderNoNpc). */
    async function venderSobrasNpc(pecas) {
        const lista = (pecas || []).filter(p => p && p.origem !== 'corpo');
        if (!lista.length || EQUIP.equipando || EQUIP.lendo) return;
        if (emHunt()) { EQUIP.aviso = 'vender só na cidade'; renderizar(); return; }
        if (!socketAberto()) { EQUIP.aviso = 'o socket do jogo não foi capturado — F5 com o helper instalado'; renderizar(); return; }
        EQUIP.equipando = true; EQUIP.vendendo = true; EQUIP.erro = null; EQUIP.aviso = null; _travaJogo = 'Equip'; renderizar();
        try {
            const doDep = lista.filter(p => p.origem === 'depósito' && p.iid);
            if (doDep.length) {
                const r = await mkPedir('depot_withdraw', { items: doDep.map(p => ({ name: p.nome, count: 1, iid: p.iid })), requestId: mkRid() });
                if (r.erro) throw new Error('retirar do depósito falhou — ' + mkErroTexto(r.erro));
                await dorme(600);
            }
            const nomes = new Set(lista.map(p => normNomeItem(p.nome))), iids = new Set(lista.map(p => p.iid));
            const b = mkBagAtual(), intrusa = ((b && b.inst) || []).find(x => x && nomes.has(normNomeItem(x.name)) && !iids.has(x.iid));
            if (intrusa) throw new Error(`há outra ${intrusa.name} na mochila que não é sobra — guarde-a no depósito antes (nada vendido)`);
            const r = await venderNoNpc({ apenas: nomes });
            if (r.erro) throw new Error(r.erro);
            log(`sobras: ${lista.length} peça(s) → NPC` + (r.total ? ` · ${numBR(r.total)} ouro` : ' · nada vendido (painel vazio)'), r.vazio ? 'erro' : 'ok');
        } catch (e) { EQUIP.aviso = 'venda no NPC: ' + e.message; log('sobras: ' + e.message, 'erro'); }
        finally { EQUIP.equipando = false; EQUIP.vendendo = false; EQUIP.vendaConf = null; _travaJogo = null; }
        const aviso = EQUIP.aviso;
        try { await equipAtualizar(); } catch (e) { renderizar(); }
        if (aviso) { EQUIP.aviso = aviso; renderizar(); }
    }
```
Confira `mkErroTexto`, `dorme`, `mkBagAtual`, `_travaJogo` no escopo. Se a mochila retirada ainda não aparece em
`mkBagAtual()` 600 ms depois (o `depot_result` traz `bag`/`bagInstances`), use `r.data.bagInstances` da resposta do
`depot_withdraw` para a checagem da intrusa.

**Step 4:** todos os testes, lint. **Step 5: Commit** — `2.15.0 (8/8) — VENDER NO NPC das sobras: retira do baú só estas, desmarca o resto e confirma`.

---

### Task 9: versão, docs e teste ao vivo

**Files:**
- Modify: `tibidle-helper.user.js:4` (`@version 2.15.0`) e `:29` (`VERSAO = '2.15.0'`)
- Modify: `TIBIDLE.md` (fim) — seção `## 2.15.0 (07/10) — caixinhas do Equip viram destinos com botão`
- Modify: `CLAUDE.md` — na lista de arquivos, atualizar a contagem de testes se mudou; nas "Regras do dono" nada muda.

**Step 1:** suba as duas versões; `node --check`; todos os testes; eslint.
**Step 2:** escreva no `TIBIDLE.md` o que mudou (as 4 caixinhas, reservas 1, `precoReferencia` com a regra do nobre,
`MK.liberadas`, `venderNoNpc({apenas})`) e os números do dia (65/300; 10 NPC ≈ 51,5 mil; 22 Mercado; 8 reservas).
**Step 3: Commit** — `2.15.0 — caixinhas do Equip viram destinos com botão: VENDER NO NPC, ANUNCIAR NO MERCADO, reservas = 1, links da wiki`.
**Step 4: Teste ao vivo (carta branca; Playwright, perfil `.playwright-mcp`)**, na ordem do desenho:
1. injete o script (`page.addScriptTag({ path })` depois de remover `#tb-painel`) ou suba pelo Tampermonkey com o `@version` novo;
   Equip → ATUALIZAR: contadores e links.
2. VENDER NO NPC (2 toques): ouro antes/depois no Log, depósito cai; se a checagem da intrusa barrar, o Log diz qual.
3. ANUNCIAR NO MERCADO em "encaixe que o Mercado paga": aba Mercado abre marcada com preços; confirme **um** anúncio barato
   (2 toques) e veja em "Meus anúncios".
4. Deixe o jogo aberto e logado. Relate ao dono o que vendeu/anunciou e o que faltou.

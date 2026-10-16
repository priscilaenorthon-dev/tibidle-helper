// Roda: node testes/melhorias.test.js
// Aba Melhorias (2.18.0): extrai EQUIP-PURO + MELHORIAS do userscript e testa a comparação com o mercado.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const M = new Function(trecho('/* @@EQUIP-PURO-INICIO */', '/* @@EQUIP-PURO-FIM */') + trecho('/* @@MELHORIAS-INICIO', '/* @@MELHORIAS-FIM */') +
    '\nreturn { mlCandidatosMercado, mlAvaliar, mlPerdas, distribuirEquip, ML_GANHO_MIN, mlForjar, mlForjaMaisBarata };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
const F = (r, ...at) => ({ raridade: r, atributos: at.map(([id, valor]) => ({ id, valor })) });
const BASE = {
    'leather boots': { attrs: { slot: 'feet', armor: 1 } },
    'steel boots': { attrs: { slot: 'feet', armor: 3 } }, // 2.19.6: nível acima da leather (armadura base maior)
    'hat of the mad': { attrs: { slot: 'head', armor: 1, magiclevelpoints: 1, vocation: 'sorcerer, druid' } },
    'vampire shield': { attrs: { weaponType: 'shield', defense: 34 } },
    'dwarven shield': { attrs: { weaponType: 'shield', defense: 26 } },
    'crystal ring': { attrs: { slot: 'ring' } },
    'steel helmet': { attrs: { slot: 'head', armor: 6 } },
    'wand of vortex': { attrs: { weaponType: 'wand', wandType: 'energy', level: 6, fromDamage: 8, toDamage: 18, mana: 1, vocation: 'sorcerer' } },
    'two handed sword': { attrs: { weaponType: 'sword', slotType: 'two-handed', attack: 30 } },
    'stone skin amulet': { attrs: { slot: 'necklace', charges: 5, armor: 3 } },
    /* fichas reais (/item/info, testes/fixtures/itens.json) */
    'wand of inferno': { attrs: { weaponType: 'wand', level: 33, mana: 8, fromDamage: 56, toDamage: 74, wandType: 'fire', vocation: 'Sorcerer;true, Master Sorcerer', slot: 'hand' } },
    'snakebite rod': { attrs: { primarytype: 'rods', weaponType: 'wand', level: 6, mana: 2, fromDamage: 8, toDamage: 18, wandType: 'earth', vocation: 'Druid;true, Elder Druid', slot: 'hand' } },
    'terra rod': { attrs: { primarytype: 'rods', weaponType: 'wand', level: 26, mana: 8, fromDamage: 37, toDamage: 53, wandType: 'earth', vocation: 'Druid;true, Elder Druid', slot: 'hand' } },
    'underworld rod': { attrs: { primarytype: 'rods', weaponType: 'wand', level: 42, mana: 13, fromDamage: 56, toDamage: 74, wandType: 'death', vocation: 'Druid;true, Elder Druid', slot: 'hand' } }
};
const corpo = (iid, nome, slot, dono, forja) => ({ iid, nome, slot, attrs: BASE[nome].attrs, forja: forja || F(0), origem: 'corpo', dono });
const copia = (orderId, nome, preco, forja, extra) => Object.assign({ orderId, unitPrice: preco, sellerName: 'Outro', instance: { iid: 'i' + orderId, name: nome, forja: forja || F(0) } }, extra || {});
function cenario(pecas) { return M.distribuirEquip(pecas).porVoc; }
const vestidos = () => ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'].flatMap(v => [
    corpo(v + 'b', 'leather boots', 'boots', v, F(1, ['regen_mana', 2.0])),
    corpo(v + 'r', 'crystal ring', 'ring', v, F(1, ['regen_mana', 1.5]))]);

t('candidatos: cópias viram peças com slot, preço e ordem; ignora a sua, a sem ficha e a temporária', () => {
    const c = M.mlCandidatosMercado({ botas: [copia(1, 'leather boots', 900, F(1, ['regen_mana', 3])), copia(2, 'leather boots', 500)],
                                       amuletos: [copia(3, 'stone skin amulet', 50)], aneis: [copia(4, 'item que nao existe', 10)] }, BASE, new Set([2]));
    assert.deepStrictEqual(c.map(x => [x.orderId, x.slot, x.preco]), [[1, 'boots', 900]]);
    assert.strictEqual(c[0].forja.atributos[0].id, 'regen_mana');
});
t('regen. de mana maior à venda (bota de nível acima) vira melhoria; regen. menor não aparece', () => {
    const porVoc = cenario(vestidos());
    const c = M.mlCandidatosMercado({ botas: [copia(10, 'steel boots', 2000, F(1, ['regen_mana', 3.4])), copia(11, 'steel boots', 100, F(1, ['regen_mana', 1.9]))] }, BASE);
    const r = M.mlAvaliar(porVoc, c, null, { ouro: 5000 });
    for (const v of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) {
        const of = r.porVoc[v].boots.ofertas;
        assert.deepStrictEqual(of.map(o => o.orderId), [10], v + ': ' + JSON.stringify(of.map(o => [o.orderId, o.ganho])));
        assert(of[0].seguro && of[0].cabe === true && of[0].ganho > 0 && of[0].pagaH > 0);
    }
    assert.strictEqual(r.top.length, 1, 'a mesma cópia aparece uma vez só nas melhores compras');
});
t('SEGURANÇA: oferta com mais pontos mas que PERDE a regen. de mana fica fora (e aparece só pedindo)', () => {
    const porVoc = cenario(vestidos());
    /* anel com chance de loot alta + max HP: ganha pontos no Knight? — perde a regen. de mana 1,5 de qualquer jeito */
    const c = M.mlCandidatosMercado({ aneis: [copia(20, 'crystal ring', 300, F(3, ['chance_de_loot', 3], ['max_hp', 100], ['capacidade', 530]))] }, BASE);
    const seguro = M.mlAvaliar(porVoc, c, null, {});
    for (const v of Object.keys(seguro.porVoc)) assert.strictEqual(seguro.porVoc[v].ring.ofertas.length, 0, v + ' viu oferta que perde regen.');
    const tudo = M.mlAvaliar(porVoc, c, null, { verPerdas: true });
    const algum = Object.values(tudo.porVoc).flatMap(x => x.ring.ofertas);
    if (algum.length) assert(algum.every(o => !o.seguro && o.perdas.some(p => p.id === 'regen_mana' && p.de === 1.5)), JSON.stringify(algum[0]));
    assert.strictEqual(tudo.top.length, 0, 'oferta insegura nunca entra nas melhores compras');
});
t('compara com a MELHOR peça que já é sua (depósito), não só com a vestida', () => {
    const pecas = vestidos().concat([{ iid: 'dep1', nome: 'leather boots', slot: 'boots', attrs: BASE['leather boots'].attrs, forja: F(1, ['regen_mana', 3.4]), origem: 'depósito', dono: null }]);
    const porVoc = cenario(pecas);
    const c = M.mlCandidatosMercado({ botas: [copia(30, 'steel boots', 800, F(1, ['regen_mana', 3.0]))] }, BASE);
    const r = M.mlAvaliar(porVoc, c, null, {});
    const quem = Object.keys(r.porVoc).find(v => r.porVoc[v].boots.temMelhorGuardada);
    assert(quem, 'alguém tem bota melhor guardada');
    assert.strictEqual(r.porVoc[quem].boots.ofertas.length, 0, 'a 3,0 do mercado perde para a 3,4 do depósito');
});
t('Knight: arma de 2 mãos compete com arma + escudo', () => {
    const pecas = vestidos().concat([corpo('Kw', 'two handed sword', 'weapon', 'KNIGHT', F(0)), { iid: 'Ks', nome: 'steel helmet', slot: 'shield', attrs: { weaponType: 'shield', defense: 20 }, forja: F(0), origem: 'corpo', dono: 'KNIGHT' }]);
    const porVoc = cenario(pecas);
    const c = M.mlCandidatosMercado({ armas: [copia(40, 'two handed sword', 1000, F(1, ['corpo_a_corpo', 1]))] }, BASE);
    const r = M.mlAvaliar(porVoc, c, null, {});
    const of = r.porVoc.KNIGHT.weapon.ofertas;
    /* +1 corpo a corpo não paga os 20 de defesa do escudo que sairia */
    assert.strictEqual(of.length, 0, JSON.stringify(of.map(o => o.ganho)));
});
t('ouro: "cabe" diz se dá para pagar; sem ouro lido fica null', () => {
    const porVoc = cenario(vestidos());
    const c = M.mlCandidatosMercado({ botas: [copia(50, 'steel boots', 9000, F(1, ['regen_mana', 4]))] }, BASE);
    assert.strictEqual(M.mlAvaliar(porVoc, c, null, { ouro: 1000 }).porVoc.DRUID.boots.ofertas[0].cabe, false);
    assert.strictEqual(M.mlAvaliar(porVoc, c, null, {}).porVoc.DRUID.boots.ofertas[0].cabe, null);
});
t('recomendada: cara demais (paga-se em > 48 h) não entra nas compras recomendadas nem tem botão', () => {
    const porVoc = cenario(vestidos());
    const c = M.mlCandidatosMercado({ botas: [copia(60, 'steel boots', 5000000, F(1, ['regen_mana', 2.3]))] }, BASE);
    const r = M.mlAvaliar(porVoc, c, null, {});
    const o = r.porVoc.DRUID.boots.ofertas[0];
    assert(o && o.caro && !o.recomendada, JSON.stringify(o && [o.ganho, o.pagaH]));
    assert.strictEqual(r.top.length, 0);
});
t('2.19.6 set: no Knight, elmo de armadura maior (6 → 9) é recomendado — subir o nível do set é o que o dono pediu', () => {
    const pecas = vestidos().concat([{ iid: 'Kh', nome: 'steel helmet', slot: 'head', attrs: BASE['steel helmet'].attrs, forja: F(0), origem: 'corpo', dono: 'KNIGHT' }]);
    const porVoc = cenario(pecas);
    const c = M.mlCandidatosMercado({ elmos: [copia(70, 'soldier helmet', 300, F(1, ['resist_fisica', 1.7]))] }, Object.assign({}, BASE, { 'soldier helmet': { attrs: { slot: 'head', armor: 9 } } }));
    const r = M.mlAvaliar(porVoc, c, null, {});
    const o = r.porVoc.KNIGHT.head.ofertas[0];
    assert(o && o.recomendada && !o.soDefesa, JSON.stringify(o));
    assert.deepStrictEqual([o.nivelSet.de, o.nivelSet.valor], [6, 9]);
    assert(r.top.some(x => x.orderId === 70));
    assert(o.fontes[0].id === 'armor', 'de onde vem o ganho: ' + JSON.stringify(o.fontes));
});
t('refino conta nas duas pontas: elmo +5 vestido no Knight não perde para o mesmo elmo +0 com um encaixe fraco', () => {
    const vest = { iid: 'Kh', nome: 'steel helmet', slot: 'head', attrs: BASE['steel helmet'].attrs, forja: { raridade: 1, refino: 5, atributos: [{ id: 'regen_mana', valor: 1.1 }] }, origem: 'corpo', dono: 'KNIGHT' };
    const porVoc = cenario(vestidos().concat([vest]));
    const c = M.mlCandidatosMercado({ elmos: [copia(80, 'steel helmet', 200, F(1, ['regen_mana', 1.3]))] }, BASE);
    const r = M.mlAvaliar(porVoc, c, null, {});
    assert.strictEqual(r.porVoc.KNIGHT.head.ofertas.length, 0, '+0,2 de regen. não paga os 5 de armadura do refino: ' + JSON.stringify(r.porVoc.KNIGHT.head.ofertas.map(o => o.ganho)));
});
t('peça atual imbuída: a oferta aparece com aviso, mas não é recomendada (o imbuement ficaria na velha)', () => {
    const pecas = vestidos().map(p => p.iid === 'DRUIDb' ? Object.assign({}, p, { imbuements: [{ type: 'mana leech' }] }) : p);
    const porVoc = cenario(pecas);
    const c = M.mlCandidatosMercado({ botas: [copia(90, 'steel boots', 500, F(1, ['regen_mana', 3.4]))] }, BASE);
    const r = M.mlAvaliar(porVoc, c, null, {});
    const o = r.porVoc.DRUID.boots.ofertas[0];
    assert(o && o.refImbuida && !o.recomendada, JSON.stringify(o));
    assert(r.porVoc.SORCERER.boots.ofertas[0].recomendada, 'o Feiticeiro (sem imbuement) continua recomendado');
});
t('2.19.0 comprar × forjar: bota Incomum com o encaixe ocupado precisa de Raridade (35 %) antes da linha; nunca sorteia a que já tem', () => {
    const porVoc = cenario(vestidos());
    const c = M.mlCandidatosMercado({ botas: [copia(100, 'steel boots', 2000, F(1, ['regen_mana', 3.4]))] }, BASE);
    const r = M.mlAvaliar(porVoc, c, null, {});
    const fj = r.porVoc.KNIGHT.boots.forja;
    assert(fj && fj.tipo === 'linha', JSON.stringify(fj));
    assert.strictEqual(fj.precisaRaridade.chance, 0.35);
    assert(!fj.linhas.some(x => x.id === 'regen_mana'), 'regen. de mana já está na peça: não cai de novo');
    assert(fj.linhas.some(x => x.id === 'regen_vida'), 'Knight: regen. de vida é linha boa: ' + JSON.stringify(fj.linhas));
    /* custo = Raridade 30k/0,35 + Atributo 20k + (t − 1) × (Atributo + Limpeza T2) */
    const t1 = 1 / fj.chance;
    assert(Math.abs(fj.ouro - (30000 / 0.35 + 20000 + (t1 - 1) * 60000)) < 0.02 * fj.ouro, fj.ouro + ' vs ' + Math.round(30000 / 0.35 + 20000 + (t1 - 1) * 60000));
    assert(Math.abs(fj.custo - (fj.ouro + fj.fragmentos * 2000)) <= 2000, 'fragmento sem leitura do Mercado = estimativa de 2 mil');
    assert(fj.ate90 >= Math.ceil(t1), '90 % precisa de mais tentativas que a média');
    assert(r.porVoc.KNIGHT.ring.forja === null, 'sem oferta no espaço, não calcula forja');
});
t('2.19.0 comprar × forjar: encaixe vazio vai direto ao Atributo; Lendário cheio = "cheia"; preço do fragmento lido entra na conta', () => {
    const vest = (forja) => vestidos().map(p => p.iid === 'SORCERERb' ? Object.assign({}, p, { forja }) : p);
    const c = M.mlCandidatosMercado({ botas: [copia(110, 'steel boots', 900000, F(1, ['regen_mana', 4.4]))] }, BASE);
    const r = M.mlAvaliar(cenario(vest(F(2, ['regen_mana', 2.0]))), c, null, { precoFrag: 500 });
    const fj = r.porVoc.SORCERER.boots.forja;
    assert(fj && fj.tipo === 'linha' && fj.livres === 1 && fj.precisaRaridade === null, JSON.stringify(fj));
    assert.strictEqual(fj.precoFrag, 500);
    assert(Math.abs(fj.custo - (fj.ouro + fj.fragmentos * 500)) <= 500);
    const cheia = M.mlAvaliar(cenario(vest(F(4, ['regen_mana', 2.0], ['max_hp', 50], ['capacidade', 300], ['resist_fogo', 2]))), c, null, {}).porVoc.SORCERER.boots.forja;
    assert.strictEqual(cheia && cheia.tipo, 'cheia');
    /* forjar só "ganha" com folga de 1/3 no ouro por ponto (comprar é certo, forja é sorteio) */
    assert.strictEqual(M.mlForjaMaisBarata({ tipo: 'linha', ouroPorPt: 1000 }, { ouroPorPt: 1400 }), true);
    assert.strictEqual(M.mlForjaMaisBarata({ tipo: 'linha', ouroPorPt: 1000 }, { ouroPorPt: 1300 }), false);
    assert.strictEqual(M.mlForjaMaisBarata({ tipo: 'cheia' }, { ouroPorPt: 1e9 }), false);
    const o = r.porVoc.SORCERER.boots.ofertas[0];
    assert(o && typeof o.forjaMaisBarata === 'boolean' && o.forjaMaisBarata === M.mlForjaMaisBarata(fj, o), JSON.stringify(o && [o.ouroPorPt, fj.ouroPorPt]));
});
/* 2.19.5 — dono, 16/10: "tá recomendando sempre a primeira rod e wand; eu tô com uma rod e uma wand boas e ele sugere regredir" */
const magos = (extra) => vestidos().concat([corpo('Sw', 'wand of inferno', 'weapon', 'SORCERER', F(0)), corpo('Dw', 'terra rod', 'weapon', 'DRUID', F(0))], extra || []);
t('2.19.5 wand/rod nunca regride: vortex e snakebite forjadas com +1 ML ficam de fora (contadas como escondidas)', () => {
    const porVoc = cenario(magos());
    const c = M.mlCandidatosMercado({ armas: [copia(200, 'wand of vortex', 900, F(1, ['nivel_magico', 1])), copia(201, 'snakebite rod', 800, F(1, ['nivel_magico', 1]))] }, BASE);
    /* sem o piso, a régua dava a vortex +1 ML na frente da inferno: o caso do dono */
    const semPiso = M.mlAvaliar({ SORCERER: { weapon: { atual: null, melhor: { nome: 'x', slot: 'weapon', attrs: BASE['wand of inferno'].attrs, forja: F(0) } } } }, c, null, {});
    assert(semPiso.porVoc.SORCERER.weapon.ofertas.length === 0, 'a referência sem "atual" também é piso');
    const r = M.mlAvaliar(porVoc, c, null, {});
    for (const v of ['SORCERER', 'DRUID']) {
        const x = r.porVoc[v].weapon;
        assert.strictEqual(x.ofertas.length, 0, v + ': ' + JSON.stringify(x.ofertas.map(o => [o.nome, o.ganho])));
        assert.strictEqual(x.escondidas.regride, 1, v);
    }
    assert(!r.top.some(o => o.slot === 'weapon'), 'nenhuma wand/rod menor nas compras recomendadas');
    assert.strictEqual(r.porVoc.SORCERER.weapon.piso.nome, 'wand of inferno');
    assert.strictEqual(r.porVoc.SORCERER.weapon.piso.nivel, 33);
});
t('2.19.5 wand/rod do mesmo nível ou acima continua: underworld rod +1 ML (nível 42) aparece para o Druida da terra rod', () => {
    const porVoc = cenario(magos());
    const c = M.mlCandidatosMercado({ armas: [copia(210, 'underworld rod', 50000, F(1, ['nivel_magico', 1])), copia(211, 'terra rod', 9000, F(1, ['nivel_magico', 1]))] }, BASE);
    const r = M.mlAvaliar(porVoc, c, null, {});
    const of = r.porVoc.DRUID.weapon.ofertas;
    assert.deepStrictEqual(JSON.stringify(of.map(o => o.orderId).sort()), JSON.stringify([210, 211]), JSON.stringify(of.map(o => [o.nome, o.ganho])));
    const u = of.find(o => o.orderId === 210);
    assert.strictEqual(u.ficha.nivel, 42);
    assert.strictEqual(r.porVoc.DRUID.weapon.escondidas.regride, 0);
});
t('2.19.5 vortex +1 ML guardada no depósito não vira "melhor guardada" de quem veste a inferno', () => {
    const porVoc = cenario(magos([{ iid: 'dv', nome: 'wand of vortex', slot: 'weapon', attrs: BASE['wand of vortex'].attrs, forja: F(1, ['nivel_magico', 1]), origem: 'depósito', dono: null }]));
    const x0 = porVoc.SORCERER.weapon;
    assert.strictEqual(x0.melhor && x0.melhor.nome, 'wand of vortex', 'o Equip (régua) ainda acha a vortex +1 ML melhor — é o que a Melhorias não pode repetir');
    const c = M.mlCandidatosMercado({ armas: [copia(220, 'wand of inferno', 30000, F(1, ['regen_mana', 3]))] }, BASE);
    const r = M.mlAvaliar(porVoc, c, null, {});
    const x = r.porVoc.SORCERER.weapon;
    assert.strictEqual(x.temMelhorGuardada, false);
    assert.strictEqual(x.ref.nome, 'wand of inferno', 'a referência é a inferno vestida');
});
t('2.19.5 elemento neutro na compra e nível exigido acima do da conta fica de fora', () => {
    const porVoc = cenario(magos());
    const c = M.mlCandidatosMercado({ armas: [copia(230, 'underworld rod', 50000, F(1, ['nivel_magico', 1]))] }, BASE);
    const neutro = M.mlAvaliar(porVoc, c, null, {}), imune = M.mlAvaliar(porVoc, c, { notas: { COMBAT_FIREDAMAGE: 0, COMBAT_DEATHDAMAGE: 0 } }, {});
    assert.strictEqual(imune.porVoc.SORCERER.weapon.refPt, neutro.porVoc.SORCERER.weapon.refPt, 'mapa imune a fogo não derruba a inferno na compra');
    assert.strictEqual(imune.porVoc.DRUID.weapon.ofertas.length, neutro.porVoc.DRUID.weapon.ofertas.length);
    const baixo = M.mlAvaliar(porVoc, c, { nivel: 40 }, {});
    assert.strictEqual(baixo.porVoc.DRUID.weapon.ofertas.length, 0);
    assert.strictEqual(baixo.porVoc.DRUID.weapon.escondidas.semNivel, 1);
});
/* 2.19.6 — dono, 16/10: "faz isso para o set também; você pega a mesma linha de equipamento e só vê se tem regen. melhor;
 * tem que ter armadura melhor; bloquear o nível que já tenho e recomendar nível superior" */
t('2.19.6 set: a MESMA peça (leather boots) com regen. maior fica de fora — contada como do mesmo nível', () => {
    const porVoc = cenario(vestidos());
    const c = M.mlCandidatosMercado({ botas: [copia(300, 'leather boots', 2000, F(1, ['regen_mana', 3.4])), copia(301, 'leather boots', 900, F(2, ['regen_mana', 2.5], ['regen_vida', 2]))] }, BASE);
    const r = M.mlAvaliar(porVoc, c, null, { verPerdas: true });
    for (const v of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) {
        const x = r.porVoc[v].boots;
        assert.strictEqual(x.ofertas.length, 0, v + ': ' + JSON.stringify(x.ofertas.map(o => [o.nome, o.ganho])));
        assert.strictEqual(x.escondidas.mesmoNivel, 2, v);
        assert.strictEqual(x.pisoSet.valor, 1);
    }
    assert.strictEqual(r.top.length, 0);
});
t('2.19.6 set: nível acima com a mesma regen. — no Knight a armadura conta e é recomendada; no mago aparece sem botão', () => {
    const porVoc = cenario(vestidos());
    const c = M.mlCandidatosMercado({ botas: [copia(310, 'steel boots', 5000, F(1, ['regen_mana', 2.0]))] }, BASE);
    const r = M.mlAvaliar(porVoc, c, null, {});
    const k = r.porVoc.KNIGHT.boots.ofertas[0], f = r.porVoc.SORCERER.boots.ofertas[0];
    assert(k && k.recomendada && k.ganho >= 0.3 && !k.soArmadura, 'Knight: ' + JSON.stringify(k && [k.ganho, k.soArmadura]));
    assert(f && f.soArmadura && !f.recomendada && f.ouroPorPt === null && f.pagaH === null, 'Feiticeiro: ' + JSON.stringify(f && [f.ganho, f.soArmadura]));
    assert.deepStrictEqual([f.nivelSet.de, f.nivelSet.valor], [1, 3]);
    assert(r.top.every(o => o.voc === 'KNIGHT'), 'mago sem ganho não entra nas recomendadas');
});
t('2.19.6 set: precisa subir sobre TODAS as que ele tem (vestida e guardada); nível mágico de fábrica também sobe (Hat of the Mad)', () => {
    const pecas = vestidos().concat([corpo('Sh', 'steel helmet', 'head', 'SORCERER', F(0))]);
    const porVoc = cenario(pecas);
    const base = Object.assign({}, BASE, { 'chain helmet': { attrs: { slot: 'head', armor: 2 } } });
    const c = M.mlCandidatosMercado({ elmos: [copia(320, 'chain helmet', 100, F(1, ['regen_mana', 3])), copia(321, 'hat of the mad', 30000, F(0))] }, base);
    const r = M.mlAvaliar(porVoc, c, null, {});
    const x = r.porVoc.SORCERER.head;
    assert(!x.ofertas.some(o => o.orderId === 320), 'chain helmet (2) é abaixo do steel helmet (6)');
    assert.strictEqual(x.escondidas.mesmoNivel, 1);
    const hat = x.ofertas.find(o => o.orderId === 321);
    assert(hat && hat.ganho > 0.3 && hat.recomendada, 'Hat of the Mad (+1 ML de fábrica) sobe de nível: ' + JSON.stringify(hat && [hat.ganho, hat.recomendada]));
});
t('2.19.6 set: escudo do Knight só sobe com defesa maior; o spellbook dos magos não entra na regra', () => {
    const pecas = vestidos().concat([{ iid: 'Ks', nome: 'vampire shield', slot: 'shield', attrs: BASE['vampire shield'].attrs, forja: F(1, ['regen_mana', 2.4]), origem: 'corpo', dono: 'KNIGHT' }]);
    const porVoc = cenario(pecas);
    const c = M.mlCandidatosMercado({ escudos: [copia(330, 'dwarven shield', 900, F(2, ['regen_mana', 3.4], ['regen_vida', 3]))] }, BASE);
    const r = M.mlAvaliar(porVoc, c, null, { verPerdas: true });
    assert.strictEqual(r.porVoc.KNIGHT.shield.ofertas.length, 0, JSON.stringify(r.porVoc.KNIGHT.shield.ofertas.map(o => o.ganho)));
    assert.strictEqual(r.porVoc.KNIGHT.shield.escondidas.mesmoNivel, 1);
    assert.strictEqual(r.porVoc.KNIGHT.shield.pisoSet.k, 'defense');
});
console.log(`\n${n} testes ok`);

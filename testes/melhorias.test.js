// Roda: node testes/melhorias.test.js
// Aba Melhorias (2.18.0): extrai EQUIP-PURO + MELHORIAS do userscript e testa a comparação com o mercado.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const M = new Function(trecho('/* @@EQUIP-PURO-INICIO */', '/* @@EQUIP-PURO-FIM */') + trecho('/* @@MELHORIAS-INICIO', '/* @@MELHORIAS-FIM */') +
    '\nreturn { mlCandidatosMercado, mlAvaliar, mlPerdas, distribuirEquip, ML_GANHO_MIN };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
const F = (r, ...at) => ({ raridade: r, atributos: at.map(([id, valor]) => ({ id, valor })) });
const BASE = {
    'leather boots': { attrs: { slot: 'feet', armor: 1 } },
    'crystal ring': { attrs: { slot: 'ring' } },
    'steel helmet': { attrs: { slot: 'head', armor: 6 } },
    'wand of vortex': { attrs: { weaponType: 'wand', wandType: 'energy', fromDamage: 8, toDamage: 18, mana: 1, vocation: 'sorcerer' } },
    'two handed sword': { attrs: { weaponType: 'sword', slotType: 'two-handed', attack: 30 } },
    'stone skin amulet': { attrs: { slot: 'necklace', charges: 5, armor: 3 } }
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
t('regen. de mana maior à venda vira melhoria; menor ou igual não aparece', () => {
    const porVoc = cenario(vestidos());
    const c = M.mlCandidatosMercado({ botas: [copia(10, 'leather boots', 2000, F(1, ['regen_mana', 3.4])), copia(11, 'leather boots', 100, F(1, ['regen_mana', 1.9]))] }, BASE);
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
    const c = M.mlCandidatosMercado({ botas: [copia(30, 'leather boots', 800, F(1, ['regen_mana', 3.0]))] }, BASE);
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
    const c = M.mlCandidatosMercado({ botas: [copia(50, 'leather boots', 9000, F(1, ['regen_mana', 4]))] }, BASE);
    assert.strictEqual(M.mlAvaliar(porVoc, c, null, { ouro: 1000 }).porVoc.DRUID.boots.ofertas[0].cabe, false);
    assert.strictEqual(M.mlAvaliar(porVoc, c, null, {}).porVoc.DRUID.boots.ofertas[0].cabe, null);
});
t('recomendada: cara demais (paga-se em > 48 h) não entra nas compras recomendadas nem tem botão', () => {
    const porVoc = cenario(vestidos());
    const c = M.mlCandidatosMercado({ botas: [copia(60, 'leather boots', 5000000, F(1, ['regen_mana', 2.3]))] }, BASE);
    const r = M.mlAvaliar(porVoc, c, null, {});
    const o = r.porVoc.DRUID.boots.ofertas[0];
    assert(o && o.caro && !o.recomendada, JSON.stringify(o && [o.ganho, o.pagaH]));
    assert.strictEqual(r.top.length, 0);
});
t('recomendada: no Knight, ganho quase só de armadura/defesa fica marcado e fora do topo', () => {
    const pecas = vestidos().concat([{ iid: 'Kh', nome: 'steel helmet', slot: 'head', attrs: BASE['steel helmet'].attrs, forja: F(0), origem: 'corpo', dono: 'KNIGHT' }]);
    const porVoc = cenario(pecas);
    const c = M.mlCandidatosMercado({ elmos: [copia(70, 'steel helmet', 300, F(1, ['resist_fisica', 1.7]))] }, Object.assign({}, BASE, { 'steel helmet': { attrs: { slot: 'head', armor: 9 } } }));
    const r = M.mlAvaliar(porVoc, c, null, {});
    const o = r.porVoc.KNIGHT.head.ofertas[0];
    assert(o && o.soDefesa && !o.recomendada, JSON.stringify(o));
    assert(!r.top.some(x => x.orderId === 70));
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
    const c = M.mlCandidatosMercado({ botas: [copia(90, 'leather boots', 500, F(1, ['regen_mana', 3.4]))] }, BASE);
    const r = M.mlAvaliar(porVoc, c, null, {});
    const o = r.porVoc.DRUID.boots.ofertas[0];
    assert(o && o.refImbuida && !o.recomendada, JSON.stringify(o));
    assert(r.porVoc.SORCERER.boots.ofertas[0].recomendada, 'o Feiticeiro (sem imbuement) continua recomendado');
});
console.log(`\n${n} testes ok`);

/* Painel das 3 contas — funções puras (docs/painel/painel-core.js). node puro, sem dependências. */
'use strict';
const assert = require('assert');
const path = require('path');
const P = require(path.join(__dirname, '..', 'docs', 'painel', 'painel-core.js'));
let ok = 0, falhas = 0;
function t(nome, fn) { try { fn(); ok++; console.log('ok   ' + nome); } catch (e) { falhas++; console.log('FAIL ' + nome + '\n    ' + (e && e.message)); } }

const peca = (o) => Object.assign({ iid: 'x', nome: 'peça', slot: 'armor', origem: 'depósito', dono: null, npc: 100, ficha: {}, raridade: 0, refino: 0, atributos: [], imbuements: [], veredito: 'reserva', porVoc: {} }, o);
const rel = (nome, nivel, itens, personagens) => ({ relatorio: 'tibidle-helper equipamento', formato: 1, conta: { nome, mundo: 'alfa' }, nivel, fase: 2, geradoEm: '2026-10-30T21:50:33.842Z', skills: {}, personagens: personagens || {}, itens });

const A = P.normConta(rel('A', 175, [
    peca({ iid: 'a1', nome: 'magma coat', slot: 'armor', origem: 'depósito', ficha: { armor: 10, 'elemental protection fire': 8 }, atributos: [{ id: 'resist_fogo', valor: 4 }], porVoc: { SORCERER: { pontos: 30 }, DRUID: { pontos: 30 } }, npc: 5000 }),
    peca({ iid: 'a2', nome: 'dragon scale mail', slot: 'armor', origem: 'corpo', dono: 'KNIGHT', ficha: { armor: 16, 'elemental protection fire': 3 }, porVoc: { KNIGHT: { pontos: 100 } }, veredito: 'vestida (é a melhor): KNIGHT armor' }),
    peca({ iid: 'a3', nome: 'blue robe', slot: 'armor', origem: 'corpo', dono: 'SORCERER', ficha: { armor: 11 }, porVoc: { SORCERER: { pontos: 40 } }, veredito: 'vestida (é a melhor): SORCERER armor' }),
    peca({ iid: 'a4', nome: 'old sword', slot: 'weapon', origem: 'depósito', ficha: { attack: 8 }, veredito: 'sobra: superada por magic sword (knight, −12 pt)', npc: 300, porVoc: { KNIGHT: { pontos: 10 } } }),
    peca({ iid: 'a5', nome: 'epic hat', slot: 'head', origem: 'depósito', raridade: 3, veredito: 'sobra: Épico sem linha útil: resist fogo — anuncie ou desmanche', npc: 800, porVoc: { SORCERER: { pontos: 2 } } })
], { KNIGHT: { armor: { veste: { iid: 'a2', nome: 'dragon scale mail', pontos: 100 } } }, SORCERER: { armor: { veste: { iid: 'a3', nome: 'blue robe', pontos: 40 } } } }));
const B = P.normConta(rel('B', 81, [
    peca({ iid: 'b1', nome: 'leather armor', slot: 'armor', origem: 'corpo', dono: 'SORCERER', ficha: { armor: 4 }, porVoc: { SORCERER: { pontos: 8 } }, veredito: 'vestida (é a melhor): SORCERER armor' })
], { SORCERER: { armor: { veste: { iid: 'b1', nome: 'leather armor', pontos: 8 } } }, DRUID: { armor: { veste: null } } }));

const DRAKEN = { id: 192, title: 'Draken Walls', levelMin: 80, recommendedLevel: 150, monsters: [
    { name: 'Draken Spellweaver', health: 3000, weight: 1, elements: [['PHYSICAL', -10], ['EARTH', 100], ['FIRE', 100], ['ICE', -10]] },
    { name: 'Draken Warmaster', health: 4000, weight: 1, elements: [{ type: 'COMBAT_PHYSICALDAMAGE', percent: 30 }, { type: 'COMBAT_FIREDAMAGE', percent: 100 }, { type: 'COMBAT_EARTHDAMAGE', percent: 100 }] }] };

t('normConta aceita o relatório do helper e recusa outro JSON', () => {
    assert.strictEqual(A.nome, 'A'); assert.strictEqual(A.nivel, 175); assert.strictEqual(A.itens.length, 5);
    assert.throws(() => P.normConta({ foo: 1 }), /relatório/);
});
t('idDoItem: pelo nome em minúsculas sem acento; itemId do formato 2 vence; urlFigura pelo id/1000', () => {
    const mapa = { 'magic sword': 3288, 'zaoan legs': 10387 };
    assert.strictEqual(P.idDoItem('Magic Sword', mapa), 3288);
    assert.strictEqual(P.idDoItem({ nome: 'Zaoan legs' }, mapa), 10387);
    assert.strictEqual(P.idDoItem({ nome: 'nada', itemId: 5 }, mapa), 5);
    assert.strictEqual(P.idDoItem('nada', mapa), null);
    assert.strictEqual(P.urlFigura(3288, 242), 'https://play.tibidle.com/assets/v242/items/3/3288.webp');
});
t('elementosDoMapa: imune (≥100 %) = bate com isso; peso pela vida; físico sempre; os dois formatos do catálogo', () => {
    const m = P.elementosDoMapa(DRAKEN);
    assert.strictEqual(m.fisico, true); assert.strictEqual(m.estimativa, true);
    assert.deepStrictEqual(m.elementos.map(e => e.elem).sort(), ['fogo', 'terra']);
    assert.strictEqual(m.elementos[0].peso, 1); // os dois monstros são imunes aos dois
    assert.deepStrictEqual(m.elementos[0].monstros, ['Draken Spellweaver', 'Draken Warmaster']);
});
t('protecaoDe soma ficha (absorb + elemental protection), encaixe resist_* e proteção mágica; imbuement de proteção', () => {
    const p = peca({ ficha: { absorbpercentfire: 5, 'elemental protection fire': 8 }, atributos: [{ id: 'resist_fogo', valor: 4 }, { id: 'protecao_magica', valor: 2 }], imbuements: [{ nome: 'Dragon Hide', valor: 10 }] });
    assert.strictEqual(P.protecaoDe(p, 'fogo'), 29);
    assert.strictEqual(P.protecaoDe(p, 'fisico'), 0); // proteção mágica não vale para físico
    assert.strictEqual(P.protecaoDe(p, 'gelo'), 2);
});
t('aguentar: Feiticeiro da conta A está descoberto a fogo na Draken; a sugestão é a magma coat do depósito (ganho 12 %, custa 10 pt)', () => {
    const r = P.aguentar([A, B], 'A', DRAKEN);
    assert.deepStrictEqual(r.elems.slice().sort(), ['fisico', 'fogo', 'terra']);
    const s = r.vocs.SORCERER;
    assert.strictEqual(s.porElem.fogo, 0); assert(s.descobertos.includes('fogo'));
    const sug = s.sugestoes.find(x => x.elem === 'fogo');
    assert(sug && sug.peca.nome === 'magma coat' && sug.ganho === 12 && sug.custoPt === 10, JSON.stringify(sug));
    const k = r.vocs.KNIGHT; assert.strictEqual(k.armor, 16); assert.strictEqual(k.porElem.fogo, 3);
});
t('valePassar: contas distantes (175 × 81) comparam pela ficha (armadura 10 × 4 = +6), marcadas como aproximado; nada da A para a A; peça acima do nível fica fora', () => {
    const r = P.valePassar([A, B]);
    const fe = r.find(x => x.peca.iid === 'a1' && x.voc === 'SORCERER'), dr = r.find(x => x.peca.iid === 'a1' && x.voc === 'DRUID');
    assert(fe && fe.para === 'B' && fe.ganho === 22 && fe.atualNome === 'leather armor' && fe.aproximado === true && fe.ganhoBase === 6 && fe.medida === 'armadura', JSON.stringify(fe));
    assert(dr && dr.ganho === 30 && dr.atual === 0 && dr.ganhoBase === 10);
    assert(!r.some(x => x.de === x.para));
    const os = r.find(x => x.peca.iid === 'a4'); assert(os && os.ganhoBase === 8 && os.medida === 'ataque' && os.baseAtual === 0, 'old sword: B não tem arma no Cavaleiro → +8 de ataque, aproximado');
    assert.strictEqual(r[0].ganhoBase, 10, 'ordenado pelo ganho de ficha quando é aproximado');
    const C = P.normConta(rel('C', 170, [peca({ iid: 'c1', nome: 'high armor', slot: 'armor', origem: 'depósito', ficha: { armor: 20, level: 180 }, porVoc: { KNIGHT: { pontos: 200 } } })]));
    assert(!P.valePassar([A, C]).some(x => x.peca.iid === 'c1'), 'exige nível 180: A tem 175');
});
t('valePassar: contas próximas comparam pela nota; peças iguais viram uma linha com a contagem; no máximo 3 por espaço', () => {
    const itens = []; for (let i = 0; i < 5; i++) itens.push(peca({ iid: 'h' + i, nome: 'Zaoan halberd', slot: 'weapon', origem: 'depósito', ficha: { attack: 48 }, porVoc: { KNIGHT: { pontos: 60 } } }));
    for (let i = 0; i < 4; i++) itens.push(peca({ iid: 'w' + i, nome: 'sword ' + i, slot: 'weapon', origem: 'depósito', ficha: { attack: 30 + i }, porVoc: { KNIGHT: { pontos: 50 + i } } }));
    const X = P.normConta(rel('X', 170, itens)), Y = P.normConta(rel('Y', 160, [], { KNIGHT: { weapon: { veste: { iid: 'y1', nome: 'old axe', pontos: 20 } } } }));
    const r = P.valePassar([X, Y]);
    assert.strictEqual(r.length, 3, 'só 3 por espaço: ' + r.length);
    assert(r[0].peca.nome === 'Zaoan halberd' && r[0].iguais === 5 && r[0].ganho === 40 && r[0].aproximado === false, JSON.stringify(r[0]));
});
t('valePassar: arma de 2 mãos compara com arma + escudo; a mesma peça já vestida não entra', () => {
    const X = P.normConta(rel('X', 170, [
        peca({ iid: 'g1', nome: 'giant sword', slot: 'weapon', origem: 'depósito', duasMaos: true, ficha: { attack: 46 }, porVoc: { KNIGHT: { pontos: 150 } } }),
        peca({ iid: 'w1', nome: 'wand of everblazing', slot: 'weapon', origem: 'depósito', ficha: { toDamage: 40 }, porVoc: { SORCERER: { pontos: 7.4 } } })]));
    const Y = P.normConta(rel('Y', 160, [
        peca({ iid: 'y1', nome: 'stonecutter axe', slot: 'weapon', origem: 'corpo', dono: 'KNIGHT', ficha: { attack: 50 }, porVoc: { KNIGHT: { pontos: 27 } } }),
        peca({ iid: 'y2', nome: 'necromancer shield', slot: 'shield', origem: 'corpo', dono: 'KNIGHT', ficha: { defense: 37 }, porVoc: { KNIGHT: { pontos: 250 } } }),
        peca({ iid: 'y3', nome: 'wand of everblazing', slot: 'weapon', origem: 'corpo', dono: 'SORCERER', ficha: { toDamage: 40 }, porVoc: { SORCERER: { pontos: 1.1 } } })],
        { KNIGHT: { weapon: { veste: { iid: 'y1', nome: 'stonecutter axe', pontos: 27 } }, shield: { veste: { iid: 'y2', nome: 'necromancer shield', pontos: 250 } } }, SORCERER: { weapon: { veste: { iid: 'y3', nome: 'wand of everblazing', pontos: 1.1 } } } }));
    const r = P.valePassar([X, Y]);
    assert(!r.some(x => x.peca.iid === 'g1'), 'giant sword: 150 < 27 + 250 (perde o escudo)');
    assert(!r.some(x => x.peca.iid === 'w1'), 'a mesma varinha já vestida: fora');
});
t('limpeza: sobra, épico sem linha útil e NPC somado; tipoVeredito', () => {
    const l = P.limpeza(A);
    assert.strictEqual(l.grupos.sobra.length, 1); assert.strictEqual(l.grupos.epico.length, 1);
    assert.strictEqual(l.npc.sobra, 300); assert.strictEqual(l.npc.epico, 800);
    assert.strictEqual(P.tipoVeredito('vestida (é a melhor): KNIGHT armor'), 'vestida');
    assert.strictEqual(P.tipoVeredito('sobra: Épico sem linha útil: x'), 'épico sem linha');
    assert.strictEqual(P.tipoVeredito('encaixe nobre (vale no Mercado)'), 'encaixe nobre');
});
t('diasDesde', () => { assert.strictEqual(P.diasDesde('2026-10-30T00:00:00Z', Date.parse('2026-11-02T12:00:00Z')), 3); assert.strictEqual(P.diasDesde(null), null); });

console.log(`${ok} testes ok${falhas ? ' (com falhas)' : ''}`);
if (falhas) process.exit(1);

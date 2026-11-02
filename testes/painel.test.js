/* Painel das 3 contas — funções puras (docs/painel/painel-core.js). node puro, sem dependências. */
'use strict';
const assert = require('assert');
const path = require('path');
const P = require(path.join(__dirname, '..', 'docs', 'painel', 'painel-core.js'));
let ok = 0, falhas = 0;
function t(nome, fn) { try { fn(); ok++; console.log('ok   ' + nome); } catch (e) { falhas++; console.log('FAIL ' + nome + '\n    ' + (e && e.message)); } }

const peca = (o) => Object.assign({ iid: 'x', nome: 'peça', slot: 'armor', origem: 'depósito', dono: null, npc: 100, ficha: {}, raridade: 0, refino: 0, atributos: [], imbuements: [], veredito: 'reserva', porVoc: {} }, o);
const rel = (nome, nivel, itens, personagens) => ({ relatorio: 'tibidle-helper equipamento', formato: 1, conta: { nome, mundo: 'alfa' }, nivel, fase: 2, geradoEm: '2026-10-30T21:50:33.842Z', skills: {}, personagens: personagens || {}, itens });

/* réguas das contas de teste (pt por unidade): A KNIGHT armor 2,5 · regen_mana 4 · SORCERER armor 3 ; B KNIGHT armor 0,4 · SORCERER armor 0,4 · resist_fogo 0,5 */
const A = P.normConta(rel('A', 175, [
    peca({ iid: 'a1', nome: 'magma coat', slot: 'armor', origem: 'depósito', ficha: { armor: 10, 'elemental protection fire': 8 }, atributos: [{ id: 'resist_fogo', valor: 4 }], porVoc: { SORCERER: { pontos: 30, linhas: [{ id: 'armor', valor: 10, pt: 30 }] }, DRUID: { pontos: 30, linhas: [{ id: 'armor', valor: 10, pt: 30 }] } }, npc: 5000 }),
    peca({ iid: 'a2', nome: 'dragon scale mail', slot: 'armor', origem: 'corpo', dono: 'KNIGHT', ficha: { armor: 16, 'elemental protection fire': 3 }, porVoc: { KNIGHT: { pontos: 40, linhas: [{ id: 'armor', valor: 16, pt: 40 }] } }, veredito: 'vestida (é a melhor): KNIGHT armor' }),
    peca({ iid: 'a3', nome: 'blue robe', slot: 'armor', origem: 'corpo', dono: 'SORCERER', ficha: { armor: 11 }, porVoc: { SORCERER: { pontos: 33, linhas: [{ id: 'armor', valor: 11, pt: 33 }] } }, veredito: 'vestida (é a melhor): SORCERER armor' }),
    peca({ iid: 'a4', nome: 'old sword', slot: 'weapon', origem: 'depósito', ficha: { attack: 8 }, veredito: 'sobra: superada por magic sword (knight, −12 pt)', npc: 300, porVoc: { KNIGHT: { pontos: 10, linhas: [{ id: 'attack', valor: 8, pt: 10 }] } } }),
    peca({ iid: 'a5', nome: 'epic hat', slot: 'head', origem: 'depósito', raridade: 3, veredito: 'sobra: Épico sem linha útil: resist fogo — anuncie ou desmanche', npc: 800, porVoc: { SORCERER: { pontos: 2, linhas: [{ id: 'armor', valor: 1, pt: 3 }, { id: 'mana por tiro', valor: 1, pt: -1 }] } } }),
    peca({ iid: 'a6', nome: 'mana ring', slot: 'ring', origem: 'depósito', atributos: [{ id: 'regen_mana', valor: 1 }], porVoc: { KNIGHT: { pontos: 4, linhas: [{ id: 'regen_mana', valor: 1, pt: 4 }] } } })
], { KNIGHT: { armor: { veste: { iid: 'a2', nome: 'dragon scale mail', pontos: 40 } } }, SORCERER: { armor: { veste: { iid: 'a3', nome: 'blue robe', pontos: 33 } } } }));
const B = P.normConta(rel('B', 81, [
    peca({ iid: 'b1', nome: 'leather armor', slot: 'armor', origem: 'corpo', dono: 'SORCERER', ficha: { armor: 4 }, porVoc: { SORCERER: { pontos: 1.6, linhas: [{ id: 'armor', valor: 4, pt: 1.6 }] } }, veredito: 'vestida (é a melhor): SORCERER armor' }),
    peca({ iid: 'b2', nome: 'plate armor', slot: 'armor', origem: 'depósito', ficha: { armor: 20 }, porVoc: { KNIGHT: { pontos: 8, linhas: [{ id: 'armor', valor: 20, pt: 8 }] } } }),
    peca({ iid: 'b3', nome: 'chain armor', slot: 'armor', origem: 'depósito', ficha: { armor: 16 }, porVoc: { KNIGHT: { pontos: 6.4, linhas: [{ id: 'armor', valor: 16, pt: 6.4 }] } } }),
    peca({ iid: 'b4', nome: 'magma coat', slot: 'armor', origem: 'depósito', ficha: { armor: 12 }, atributos: [{ id: 'resist_fogo', valor: 4 }], porVoc: { SORCERER: { pontos: 6, linhas: [{ id: 'armor', valor: 12, pt: 4 }, { id: 'resist_fogo', valor: 4, pt: 2 }] } } }),
    peca({ iid: 'b5', nome: 'regen ring', slot: 'armor', origem: 'depósito', ficha: { armor: 10 }, atributos: [{ id: 'regen_mana', valor: 2 }], porVoc: { KNIGHT: { pontos: 4, linhas: [{ id: 'armor', valor: 10, pt: 4 }] } } }),
    peca({ iid: 'b6', nome: 'high armor', slot: 'armor', origem: 'depósito', ficha: { armor: 40, level: 180 }, porVoc: { KNIGHT: { pontos: 16, linhas: [{ id: 'armor', valor: 40, pt: 16 }] } } }),
    peca({ iid: 'b7', nome: 'charged armor', slot: 'armor', origem: 'depósito', ficha: { armor: 40, charges: 50 }, porVoc: { KNIGHT: { pontos: 16, linhas: [{ id: 'armor', valor: 40, pt: 16 }] } } })
], { SORCERER: { armor: { veste: { iid: 'b1', nome: 'leather armor', pontos: 1.6 } } }, DRUID: { armor: { veste: null } } }));

const DRAKEN = { id: 192, title: 'Draken Walls', levelMin: 80, recommendedLevel: 150, monsters: [
    { name: 'Draken Spellweaver', health: 3000, weight: 1, elements: [['PHYSICAL', -10], ['EARTH', 100], ['FIRE', 100], ['ICE', -10]] },
    { name: 'Draken Warmaster', health: 4000, weight: 1, elements: [{ type: 'COMBAT_PHYSICALDAMAGE', percent: 30 }, { type: 'COMBAT_FIREDAMAGE', percent: 100 }, { type: 'COMBAT_EARTHDAMAGE', percent: 100 }] }] };

t('normConta aceita o relatório do helper e recusa outro JSON', () => {
    assert.strictEqual(A.nome, 'A'); assert.strictEqual(A.nivel, 175); assert.strictEqual(A.itens.length, 6);
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
t('aguentar: Feiticeiro da conta A está descoberto a fogo na Draken; a sugestão é a magma coat do depósito (ganho 12 %, custa 3 pt)', () => {
    const r = P.aguentar([A, B], 'A', DRAKEN);
    assert.deepStrictEqual(r.elems.slice().sort(), ['fisico', 'fogo', 'terra']);
    const s = r.vocs.SORCERER;
    assert.strictEqual(s.porElem.fogo, 0); assert(s.descobertos.includes('fogo'));
    const sug = s.sugestoes.find(x => x.elem === 'fogo');
    assert(sug && sug.peca.nome === 'magma coat' && sug.ganho === 12 && sug.custoPt === 3, JSON.stringify(sug));
    const k = r.vocs.KNIGHT; assert.strictEqual(k.armor, 16); assert.strictEqual(k.porElem.fogo, 3);
});
t('reguaDe: pt ÷ valor por (conta, vocação, id), mediana entre os itens; notaNoDestino pontua a peça da origem com os pesos do destino', () => {
    const R = P.reguaDe(A, 'KNIGHT');
    assert.strictEqual(R.pesos.armor, 2.5); assert.strictEqual(R.n.armor, 1);
    const S = P.reguaDe(A, 'SORCERER'); assert.strictEqual(S.pesos.armor, 3);
    assert.strictEqual(P.reguaDe(B, 'KNIGHT').pesos.armor, 0.4);
    /* plate armor da B (armor 20 = 8 pt na régua da B) vale 50 na régua da A */
    const pl = B.itens.find(i => i.iid === 'b2'), nd = P.notaNoDestino(pl, 'KNIGHT', A);
    assert.strictEqual(nd.nota, 50); assert.strictEqual(nd.notaOrigem, 8); assert.strictEqual(nd.preciso, true); assert.deepStrictEqual(nd.semRegua, []);
    /* linha que o destino nunca viu (resist_fogo) fica com o pt da origem e marca */
    const mc = B.itens.find(i => i.iid === 'b4'), nd2 = P.notaNoDestino(mc, 'SORCERER', A);
    assert.strictEqual(nd2.nota, 38); assert.strictEqual(nd2.preciso, false); assert.deepStrictEqual(nd2.semRegua, ['resist_fogo']);
    /* encaixe da forja que valia 0 na origem (fora das linhas) mas pesa no destino entra */
    const rg = B.itens.find(i => i.iid === 'b5'), nd3 = P.notaNoDestino(rg, 'KNIGHT', A);
    assert.strictEqual(nd3.nota, 10 * 2.5 + 2 * 4, JSON.stringify(nd3)); assert(nd3.linhas.some(l => l.id === 'regen_mana' && l.ptOrigem === 0 && l.pt === 8));
});
t('valePassar segue a regra do Equip: nota na régua do destino, troca a partir de 1 pt sobre a melhor peça que o destino já tem (vestida ou guardada); nível, carga e mesma conta ficam fora', () => {
    const r = P.valePassar([A, B]);
    const pl = r.find(x => x.peca.iid === 'b2');
    assert(pl && pl.para === 'A' && pl.voc === 'KNIGHT' && pl.nova === 50 && pl.atual === 40 && pl.ganho === 10 && pl.atualNome === 'dragon scale mail' && pl.firme === true && pl.preciso === true && pl.guardada === false, JSON.stringify(pl));
    assert(!r.some(x => x.peca.iid === 'b3'), 'chain armor: 16 × 2,5 = 40 = o que a A já veste → ganho 0 < 1, o Equip não trocaria');
    const mc = r.find(x => x.peca.iid === 'b4');
    assert(mc && mc.voc === 'SORCERER' && mc.nova === 38 && mc.atual === 33 && mc.ganho === 5 && mc.preciso === false && mc.notaOrigem === 6, JSON.stringify(mc));
    assert(!r.some(x => x.peca.iid === 'b6'), 'exige nível 180: A tem 175');
    assert(!r.some(x => x.peca.iid === 'b7'), 'peça de carga (charges) fica fora, como no Equip');
    assert(!r.some(x => x.de === x.para));
    const mcS = r.find(x => x.peca.iid === 'a1' && x.voc === 'SORCERER'); assert(mcS && mcS.nova === 6 && mcS.atual === 1.6 && mcS.ganho === 4.4 && mcS.preciso === true, 'magma coat da A no Feiticeiro da B: armor 10 × 0,4 + resist 4 × 0,5 = 6 contra leather 1,6: ' + JSON.stringify(mcS));
    const mcB = r.find(x => x.peca.iid === 'a1' && x.voc === 'DRUID'); assert(mcB && mcB.atual === 0 && mcB.nova === 30 && mcB.preciso === false && mcB.semRegua.join() === 'armor', 'magma coat no Druida da B: espaço vazio, qualquer ganho vale; a B não tem régua de Druida → fica o pt da origem, marcado: ' + JSON.stringify(mcB));
    const rg = r.find(x => x.peca.iid === 'b5'); assert(!rg, 'regen ring: 33 < 40');
    /* a A guarda uma peça melhor que a vestida: o Equip compara com ela */
    const A2 = P.normConta(rel('A2', 175, A.itens.filter(i => i.origem === 'corpo').concat([peca({ iid: 'g1', nome: 'guard armor', slot: 'armor', origem: 'depósito', ficha: { armor: 19 }, porVoc: { KNIGHT: { pontos: 47.5, linhas: [{ id: 'armor', valor: 19, pt: 47.5 }] } } })]),
        { KNIGHT: { armor: { veste: { iid: 'a2', nome: 'dragon scale mail', pontos: 40 }, melhor: { iid: 'g1', nome: 'guard armor', pontos: 47.5 }, troca: true, ganho: 7.5 } } }));
    const r2 = P.valePassar([A2, B]), pl2 = r2.find(x => x.peca.iid === 'b2');
    assert(pl2 && pl2.atual === 47.5 && pl2.atualNome === 'guard armor' && pl2.guardada === true && pl2.ganho === 2.5 && pl2.firme === false, JSON.stringify(pl2));
});
t('valePassar: peças iguais viram uma linha com a contagem; no máximo 3 por espaço; ordenado pelo ganho', () => {
    const itens = []; for (let i = 0; i < 5; i++) itens.push(peca({ iid: 'h' + i, nome: 'Zaoan halberd', slot: 'weapon', origem: 'depósito', ficha: { attack: 48 }, porVoc: { KNIGHT: { pontos: 60, linhas: [{ id: 'attack', valor: 48, pt: 60 }] } } }));
    for (let i = 0; i < 4; i++) itens.push(peca({ iid: 'w' + i, nome: 'sword ' + i, slot: 'weapon', origem: 'depósito', ficha: { attack: 30 + i }, porVoc: { KNIGHT: { pontos: 50 + i, linhas: [{ id: 'attack', valor: 30 + i, pt: 50 + i }] } } }));
    const X = P.normConta(rel('X', 170, itens));
    const Y = P.normConta(rel('Y', 160, [peca({ iid: 'y1', nome: 'old axe', slot: 'weapon', origem: 'corpo', dono: 'KNIGHT', ficha: { attack: 20 }, porVoc: { KNIGHT: { pontos: 20, linhas: [{ id: 'attack', valor: 20, pt: 20 }] } } })],
        { KNIGHT: { weapon: { veste: { iid: 'y1', nome: 'old axe', pontos: 20 } } } }));
    const r = P.valePassar([X, Y]);
    assert.strictEqual(r.length, 3, 'só 3 por espaço: ' + r.length);
    assert(r[0].peca.nome === 'Zaoan halberd' && r[0].iguais === 5 && r[0].nova === 48 && r[0].ganho === 28, JSON.stringify(r[0]));
    assert(r[1].peca.nome === 'sword 3' && r[1].ganho === 13 && r[2].ganho === 12);
});
t('valePassar: arma de 2 mãos compara com arma + escudo; a mesma peça já vestida não entra', () => {
    const X = P.normConta(rel('X', 170, [
        peca({ iid: 'g1', nome: 'giant sword', slot: 'weapon', origem: 'depósito', duasMaos: true, ficha: { attack: 46 }, porVoc: { KNIGHT: { pontos: 150, linhas: [{ id: 'attack', valor: 46, pt: 150 }] } } }),
        peca({ iid: 'w1', nome: 'wand of everblazing', slot: 'weapon', origem: 'depósito', ficha: { toDamage: 40 }, porVoc: { SORCERER: { pontos: 7.4, linhas: [{ id: 'dano da wand', valor: 40, pt: 7.4 }] } } })]));
    const Y = P.normConta(rel('Y', 160, [
        peca({ iid: 'y1', nome: 'stonecutter axe', slot: 'weapon', origem: 'corpo', dono: 'KNIGHT', ficha: { attack: 50 }, porVoc: { KNIGHT: { pontos: 27, linhas: [{ id: 'attack', valor: 50, pt: 27 }] } } }),
        peca({ iid: 'y2', nome: 'necromancer shield', slot: 'shield', origem: 'corpo', dono: 'KNIGHT', ficha: { defense: 37 }, porVoc: { KNIGHT: { pontos: 250, linhas: [{ id: 'defense', valor: 37, pt: 250 }] } } }),
        peca({ iid: 'y3', nome: 'wand of everblazing', slot: 'weapon', origem: 'corpo', dono: 'SORCERER', ficha: { toDamage: 40 }, porVoc: { SORCERER: { pontos: 1.1, linhas: [{ id: 'dano da wand', valor: 40, pt: 1.1 }] } } })],
        { KNIGHT: { weapon: { veste: { iid: 'y1', nome: 'stonecutter axe', pontos: 27 } }, shield: { veste: { iid: 'y2', nome: 'necromancer shield', pontos: 250 } } }, SORCERER: { weapon: { veste: { iid: 'y3', nome: 'wand of everblazing', pontos: 1.1 } } } }));
    const r = P.valePassar([X, Y]);
    assert(!r.some(x => x.peca.iid === 'g1'), 'giant sword: 46 × 0,54 = 24,8 < 27 + 250 (perde o escudo)');
    assert(!r.some(x => x.peca.iid === 'w1'), 'a mesma varinha já vestida: fora');
    assert(P.trocaValeEquip(5, 0) && !P.trocaValeEquip(0, 0) && P.trocaValeEquip(41, 40) && !P.trocaValeEquip(40.9, 40));
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

// Roda: node testes/relatorio.test.js
// Relatório de equipamento (2.36.0): extrai EQUIP-PURO + RELATORIO-PURO e testa o JSON que o botão RELATÓRIO do Equip gera.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const M = new Function(trecho('/* @@EQUIP-PURO-INICIO */', '/* @@EQUIP-PURO-FIM */') + trecho('/* @@RELATORIO-PURO-INICIO', '/* @@RELATORIO-PURO-FIM */') +
    '\nreturn { relatorioEquip, distribuirEquip, REL_VERSAO };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
const F = (r, ...at) => ({ raridade: r, atributos: at.map(([id, valor]) => ({ id, valor })) });
const BASE = { 'leather boots': { attrs: { slot: 'feet', armor: 1 }, sell: 2 }, 'steel boots': { attrs: { slot: 'feet', armor: 3 }, sell: 30 }, 'crystal ring': { attrs: { slot: 'ring' }, sell: 50 },
               'wand of vortex': { attrs: { weaponType: 'wand', wandType: 'energy', level: 6, fromDamage: 8, toDamage: 18, mana: 1, vocation: 'sorcerer' }, sell: 100 }, 'orc tooth': { attrs: {}, sell: 0 } };
const peca = (iid, nome, slot, origem, dono, forja, extra) => Object.assign({ iid, nome, slot, attrs: BASE[nome].attrs, forja: forja || F(0), origem, dono: dono || null, sell: BASE[nome].sell }, extra || {});
const pecas = [
    peca('Kb', 'leather boots', 'boots', 'corpo', 'KNIGHT', F(1, ['regen_mana', 2.0])),
    peca('Pb', 'leather boots', 'boots', 'corpo', 'PALADIN', F(0)),
    peca('d1', 'steel boots', 'boots', 'depósito', null, Object.assign(F(2, ['regen_mana', 3.4], ['resist_fogo', 2]), { refino: 2, potenciaBase: 420 }), { imbuements: [{ name: 'Dragon Hide', category: 6, base: 2, remainingMs: 3600000 }, null] }),
    peca('m1', 'crystal ring', 'ring', 'mochila', null, F(1, ['chance_de_loot', 3]), { protegida: true }),
    peca('w1', 'wand of vortex', 'weapon', 'depósito', null, F(0))
];
const ordens = [{ id: 'o1', side: 'SELL', status: 'OPEN', itemName: 'steel boots', unitPrice: 9000, quantityTotal: 1, quantityRemaining: 1, expiresAt: 1790000000000, instance: { iid: 'mk1', name: 'steel boots', forja: F(1, ['regen_vida', 1.5]) } },
                { id: 'o2', side: 'SELL', status: 'OPEN', itemName: 'orc tooth', unitPrice: 12, quantityTotal: 40, quantityRemaining: 25 },
                { id: 'o3', side: 'BUY', status: 'OPEN', itemName: 'steel boots', unitPrice: 1 }, { id: 'o4', side: 'SELL', status: 'FILLED', itemName: 'crystal ring', unitPrice: 1 }];

t('monta o JSON: cabeçalho da conta, personagens por espaço, todos os itens com ficha, forja, potência/faixa, imbuements, veredito do Equip e a nota por vocação', () => {
    const res = M.distribuirEquip(pecas, undefined, { nivel: 160 });
    const r = M.relatorioEquip({ pecas, res, ctx: { nivel: 160, mapa: 'Shadow Nexus', sk: { KNIGHT: { melee: 90 } } }, base: BASE, ordens, conta: { nome: 'Conta Um', mundo: 'w1', token: 'NAO' }, nivel: 160, versao: '2.36.0', agora: 1761800000000 });
    assert.strictEqual(r.relatorio, 'tibidle-helper equipamento'); assert.strictEqual(r.formato, M.REL_VERSAO); assert.strictEqual(r.versao, '2.36.0');
    assert.deepStrictEqual(r.conta, { nome: 'Conta Um', mundo: 'w1' }, 'só nome e mundo da conta');
    assert(r.nivel === 160 && r.mapa === 'Shadow Nexus' && r.skills.KNIGHT.melee === 90 && r.fase === 2 && /^\d{4}-\d{2}-\d{2}T/.test(r.geradoEm));
    assert.strictEqual(r.itens.length, 5); assert.deepStrictEqual(r.resumo.porOrigem, { corpo: 2, 'depósito': 2, mochila: 1 });
    const por = Object.fromEntries(r.itens.map(i => [i.iid, i]));
    assert(por.d1.raridade === 2 && por.d1.refino === 2 && por.d1.potenciaBase === 420 && por.d1.potencia === 520 && por.d1.faixa === 'III Superior', JSON.stringify([por.d1.raridade, por.d1.refino, por.d1.potencia, por.d1.faixa]));
    assert.deepStrictEqual(por.d1.atributos, [{ id: 'regen_mana', valor: 3.4 }, { id: 'resist_fogo', valor: 2 }]);
    assert.deepStrictEqual(por.d1.imbuements, [{ nome: 'Dragon Hide', categoria: 6, tier: 2, valor: 8, restaMs: 3600000 }], 'imbuement com o valor da tabela; o [null] não entra');
    assert(por.d1.ficha.armor === 3 && por.d1.npc === 30 && por.d1.origem === 'depósito');
    assert(por.m1.protegida === true && por.m1.origem === 'mochila');
    for (const v of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) assert(por.d1.porVoc[v] && typeof por.d1.porVoc[v].pontos === 'number' && por.d1.porVoc[v].linhas.some(l => l.id === 'regen_mana' && l.pt > 0), v + ': nota e linhas');
    assert(Object.keys(por.w1.porVoc).join() === 'SORCERER', 'a wand só tem nota para quem pode vesti-la: ' + Object.keys(por.w1.porVoc));
    assert(/vai vestir|vestida/.test(por.d1.veredito) && /KNIGHT boots|PALADIN boots|SORCERER boots|DRUID boots/.test(por.d1.veredito), 'a steel boots de regen. 3,4 vai para alguém: ' + por.d1.veredito);
    assert(/vestida/.test(por.Kb.veredito), por.Kb.veredito);
    assert(r.personagens.KNIGHT.boots.veste.iid === 'Kb' && r.personagens.KNIGHT.boots.melhor && typeof r.personagens.KNIGHT.boots.melhor.pontos === 'number', JSON.stringify(r.personagens.KNIGHT.boots));
});
t('Mercado: só as suas ordens de VENDA abertas; cópia anunciada vem com a peça inteira (ficha + forja + nota); empilhável vem sem peça; sem segredos no JSON', () => {
    const res = M.distribuirEquip(pecas, undefined, null);
    const r = M.relatorioEquip({ pecas, res, ctx: null, base: BASE, ordens, conta: { nome: 'C', ticket: 'x' } });
    assert.deepStrictEqual(r.mercado.map(m => m.ordem), ['o1', 'o2'], 'BUY e FILLED ficam de fora');
    const o1 = r.mercado[0];
    assert(o1.preco === 9000 && o1.qtd === 1 && o1.iid === 'mk1' && o1.equipavel === true && o1.peca && o1.peca.origem === 'mercado' && o1.peca.slot === 'boots' && o1.peca.ficha.armor === 3 && o1.peca.atributos[0].id === 'regen_vida' && o1.peca.porVoc.KNIGHT.pontos > 0, JSON.stringify(o1).slice(0, 300));
    const o2 = r.mercado[1];
    assert(o2.qtd === 25 && o2.equipavel === false && o2.peca === null, JSON.stringify(o2));
    assert.strictEqual(r.resumo.mercadoEquipavel, 1);
    const txt = JSON.stringify(r);
    assert(!/token|ticket|senha|password/i.test(txt), 'segredo no relatório');
    assert.deepStrictEqual(JSON.parse(txt).itens.length, 5, 'JSON válido de ida e volta');
    const vazio = M.relatorioEquip({});
    assert(vazio.itens.length === 0 && vazio.mercado.length === 0 && vazio.conta === null && vazio.fase === null, 'sem nada: relatório vazio, sem erro');
});
console.log(`\n${n} testes ok`);

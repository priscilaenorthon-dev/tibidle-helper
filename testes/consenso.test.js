// Roda: node testes/consenso.test.js
// 2.28.4 — Equip e Melhorias em consenso: medida da party consolidada (não depende do mapa), prioridade da peça escolhida
// pelo dono e o refino contado num lugar só.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const M = new Function(trecho('/* @@EQUIP-PURO-INICIO */', '/* @@EQUIP-PURO-FIM */') + trecho('/* @@MELHORIAS-INICIO', '/* @@MELHORIAS-FIM */') +
    '\nreturn { partyConsolidada, bebeConsolidado, distribuirEquip, pontuarPeca, mlAvaliar, mlCandidatosMercado, EQUIP_ESCOLHA_PT, ML_RECOMENDA_MIN };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
const rz = (seg, pv, magias, extra) => Object.assign({ seg, danoTotal: Object.values(pv).reduce((s, x) => s + x.dano, 0), porVoc: pv, magias: magias || [] }, extra || {});
const A = rz(600, { KNIGHT: { dano: 100, hpMin: 50 }, PALADIN: { dano: 300 }, SORCERER: { dano: 300 }, DRUID: { dano: 300 } }, [{ voc: 'SORCERER', nome: 'Energy Wave', dano: 300, mana: 60 }]);
const B = rz(300, { KNIGHT: { dano: 400, hpMin: 80 }, PALADIN: { dano: 200 }, SORCERER: { dano: 200 }, DRUID: { dano: 200 } }, [{ voc: 'SORCERER', nome: 'Energy Wave', dano: 200, mana: 20 }]);
t('a medida consolidada é a mesma em qualquer ordem (não importa qual mapa foi o último)', () => {
    const p1 = M.partyConsolidada([A, B], [], { DRUID: true }), p2 = M.partyConsolidada([B, A], [], { DRUID: true });
    assert.deepStrictEqual(p1, p2);
    assert.strictEqual(Math.round(p1.share.KNIGHT * 1000), Math.round(500 / 2000 * 1000)); // somado pelo dano, não pela última medida
    assert.strictEqual(p1.dpm.SORCERER, 500 / 80);
    assert.strictEqual(Math.round(p1.hpMinK), 60); // vida mínima pesada pelo tempo
});
t('dano tomado vem do dano guardado de TODOS os mapas, pesado pelo tempo', () => {
    const dm = (seg, tomadoH, fis) => ({ seg, tomadoH, elemPorVoc: { KNIGHT: { tomadoH, golpesH: 3600, frac: { fisico: fis, fogo: 1 - fis } } } });
    const p = M.partyConsolidada([], [dm(3600, 36000, 1), dm(1800, 72000, 0.5)], {});
    assert.strictEqual(p.tomadoS, (36000 * 3600 + 72000 * 1800) / 5400 / 3600);
    assert.ok(Math.abs(p.fisico - (36000 * 3600 + 36000 * 1800) / (36000 * 3600 + 72000 * 1800)) < 1e-9);
});
t('quem bebe poção é a maioria das caçadas normais; sem registro, o setup de agora', () => {
    const h = [{ t: 1, b: { SORCERER: false } }, { t: 2, b: { SORCERER: false } }, { t: 3, b: { SORCERER: true } }];
    assert.strictEqual(M.bebeConsolidado(h, { SORCERER: true }).SORCERER, false); // o Scan com o Discord aplicado não muda isto
    assert.strictEqual(M.bebeConsolidado([], { SORCERER: true }).SORCERER, true);
});
const F = (r, ...at) => ({ raridade: r, atributos: at.map(([id, valor]) => ({ id, valor })) });
const anel = (iid, origem, dono, forja) => ({ iid, nome: 'crystal ring', slot: 'ring', attrs: { slot: 'ring' }, forja, origem, dono });
t('peça escolhida pelo dono (comprada/equipada) não sai por uma diferença pequena; por uma bem maior, sai', () => {
    const vestido = anel('v', 'corpo', 'SORCERER', F(1, ['regen_mana', 2.0])), guardado = anel('g', 'depósito', null, F(1, ['regen_mana', 2.5]));
    const ctx = { nivel: 141 };
    const sem = M.distribuirEquip([vestido, guardado], ['SORCERER'], ctx).porVoc.SORCERER.ring;
    assert.strictEqual(sem.melhor.iid, 'g'); // sem escolha: troca
    const com = M.distribuirEquip([vestido, guardado], ['SORCERER'], Object.assign({ escolhas: ['v'] }, ctx)).porVoc.SORCERER.ring;
    assert.strictEqual(com.melhor.iid, 'v'); // escolhida: fica
    const muito = anel('m', 'depósito', null, F(2, ['regen_mana', 2.5], ['nivel_magico', 1]));
    assert.strictEqual(M.distribuirEquip([vestido, muito], ['SORCERER'], Object.assign({ escolhas: ['v'] }, ctx)).porVoc.SORCERER.ring.melhor.iid, 'm');
});
t('refino conta no Equip (antes só a Melhorias contava)', () => {
    const p0 = { iid: 'a', nome: 'plate armor', slot: 'armor', attrs: { slot: 'armor', armor: 10 }, forja: F(0) };
    const p4 = Object.assign({}, p0, { forja: Object.assign(F(0), { refino: 4 }) });
    const ctx = { nivel: 141 };
    assert.ok(M.pontuarPeca(p4, 'KNIGHT', ctx).pontos > M.pontuarPeca(p0, 'KNIGHT', ctx).pontos);
    const d = M.pontuarPeca(p4, 'KNIGHT', ctx).detalhe.find(x => x.id === 'armor');
    assert.strictEqual(d.valor, 14);
});
t('Melhorias só RECOMENDA com o ganho que o Equip também troca (e mais a prioridade da escolhida)', () => {
    const BASE = { 'crystal ring': { attrs: { slot: 'ring' } } };
    const vestido = anel('v', 'corpo', 'SORCERER', F(1, ['regen_mana', 2.0]));
    const porVoc = { SORCERER: { ring: { atual: vestido, atualPt: 0, melhor: vestido, melhorPt: 0, candidatos: [] } } };
    const copias = { aneis: [{ orderId: 1, unitPrice: 100, instance: { iid: 'x', name: 'crystal ring', forja: F(1, ['regen_mana', 2.1]) } },
                             { orderId: 2, unitPrice: 100, instance: { iid: 'y', name: 'crystal ring', forja: F(2, ['regen_mana', 2.0], ['nivel_magico', 1]) } }] };
    const cands = M.mlCandidatosMercado(copias, BASE, new Set());
    const of = (ctx) => M.mlAvaliar(porVoc, cands, ctx, {}).porVoc.SORCERER.ring.ofertas;
    const livre = of({ nivel: 141 });
    const peq = livre.find(x => x.orderId === 1), grande = livre.find(x => x.orderId === 2);
    if (peq) assert.strictEqual(peq.recomendada, peq.ganho >= M.ML_RECOMENDA_MIN);
    assert.strictEqual(grande.recomendada, true);
    const escolhida = of({ nivel: 141, escolhas: ['v'] }).find(x => x.orderId === 2);
    assert.strictEqual(escolhida.recomendada, escolhida.ganho >= M.ML_RECOMENDA_MIN + M.EQUIP_ESCOLHA_PT);
});
console.log(n + ' testes ok');

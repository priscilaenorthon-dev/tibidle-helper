// Roda: node testes/razao.test.js
// Livro-razão de combate (@@RAZAO, 2.21.0): quem bate, de que elemento, em quem — e o dano guardado por mapa.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const ORDEM = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'];
const stubs = `const vocDoIndice = (i) => ${JSON.stringify(ORDEM)}[i] || null; const CAT = { magias: [] }; const precoRuna = () => 0; const FRAME_FRESCO_MS = 5000;
const guardar = () => {}; const _hash = (s) => s; const amostraRegen = () => null; const medianaRegen = () => 0;`;
const M = new Function(stubs + trecho('/* @@RAZAO-INICIO', '/* @@RAZAO-FIM */') + '\nreturn { razaoNovo, razaoEvento, razaoResumo, danoMapaJuntar, elemDoJogo, danoTomadoDe };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };

function cacada() {
    const L = M.razaoNovo(); L.t0 = 1000000; let agora = L.t0;
    const ev = (e) => { agora += 500; M.razaoEvento(L, e, agora); };
    ev({ kind: 'spawn', id: 1, name: 'Dragon', maxHp: 1550 });
    ev({ kind: 'spawn', id: 2, name: 'Dragon Lord', maxHp: 2000 });
    for (let i = 0; i < 10; i++) ev({ kind: 'mhit', id: 1, amount: 40 + i * 8, hp: 100 }); // 40..112 no Knight
    ev({ kind: 'mcast', id: 1, atk: 'fireball', type: 'COMBAT_FIREDAMAGE', amount: 90, mana: 0, hp: 100 }); // sem hits: membro 0
    ev({ kind: 'mcast', id: 2, atk: 'fire wave', type: 'fire', amount: 0, mana: 0, hp: 100, hits: [{ who: 0, amount: 120, mana: 0, hp: 1 }, { who: 2, amount: 60, mana: 0, hp: 1 }, { who: 3, amount: 0, mana: 0, hp: 1 }] });
    ev({ kind: 'mcast', id: 2, atk: 'energy beam', type: 'COMBAT_ENERGYDAMAGE', amount: 0, mana: 0, hp: 100, hits: [{ who: 2, amount: 40, mana: 0, hp: 1 }] });
    ev({ kind: 'death', who: 2 });
    ev({ kind: 'kill', id: 1, xp: 60 });
    L.tFim = L.t0 + 120000; // 2 min
    return L;
}
t('elemento do jogo → nome do helper', () => {
    assert.strictEqual(M.elemDoJogo('COMBAT_FIREDAMAGE'), 'fogo');
    assert.strictEqual(M.elemDoJogo('physical'), 'fisico');
    assert.strictEqual(M.elemDoJogo(null), 'fisico');
    assert.strictEqual(M.elemDoJogo('COMBAT_MANADRAIN'), 'drenomana');
});
t('por criatura: golpes (média, máximo) e magias por elemento; a sem hits vai no membro 0 (Knight)', () => {
    const rz = M.razaoResumo(cacada());
    const d = rz.crias.find(c => c.nome === 'Dragon'), dl = rz.crias.find(c => c.nome === 'Dragon Lord');
    assert(d && d.golpes.n === 10 && d.golpes.medio === 76 && d.golpes.max === 112, JSON.stringify(d));
    assert.deepStrictEqual(JSON.stringify(d.magias.map(m => [m.atk, m.el, m.medio, m.max])), JSON.stringify([['fireball', 'fogo', 90, 90]]));
    assert(dl && dl.magias.length === 2 && dl.magias[0].atk === 'fire wave' && dl.magias[0].medio === 90 && dl.magias[0].max === 120, JSON.stringify(dl));
    assert(rz.crias[0].nome === 'Dragon', 'quem mais machuca primeiro');
    assert.strictEqual(rz.mortes, 1);
    assert.strictEqual(rz.tomado, 760 + 90 + 120 + 60 + 40);
    assert.strictEqual(rz.tomadoCorpoH, Math.round(760 / 120 * 3600));
});
t('por personagem e elemento: Knight 760 físico + 210 fogo; Feiticeiro 60 fogo + 40 energia; Druida nada', () => {
    const rz = M.razaoResumo(cacada());
    const k = rz.elemPorVoc.KNIGHT, f = rz.elemPorVoc.SORCERER;
    assert(k && Math.abs(k.frac.fisico - 760 / 970) < 0.002 && Math.abs(k.frac.fogo - 210 / 970) < 0.002, JSON.stringify(k));
    assert.strictEqual(k.tomadoH, Math.round(970 / 120 * 3600));
    assert(f && f.frac.fogo === 0.6 && f.frac.energia === 0.4, JSON.stringify(f));
    assert.strictEqual(rz.elemPorVoc.DRUID, undefined, 'quem não tomou nada não aparece');
});
t('dano guardado por mapa: junta sessões pelo tempo (frações ponderadas, máximo = o maior, médias ponderadas)', () => {
    const a = M.razaoResumo(cacada());
    const b = JSON.parse(JSON.stringify(a)); b.seg = 240; b.elemPorVoc.KNIGHT.frac = { fisico: 1 }; b.elemPorVoc.KNIGHT.tomadoH = 3600; b.crias[0].golpes.max = 200; b.crias[0].golpes.n = 20; b.crias[0].golpes.medio = 100; b.t = 5;
    const j = M.danoMapaJuntar([Object.assign({ t0: 1, t: 2 }, a), Object.assign({ t0: 3 }, b)]);
    assert.strictEqual(j.seg, 360); assert.strictEqual(j.sessoes, 2); assert.strictEqual(j.t, 5);
    const k = j.elemPorVoc.KNIGHT;
    const esperado = (a.elemPorVoc.KNIGHT.frac.fisico * a.elemPorVoc.KNIGHT.tomadoH * (120 / 360) + 1 * 3600 * (240 / 360)) / (a.elemPorVoc.KNIGHT.tomadoH * (120 / 360) + 3600 * (240 / 360));
    assert(Math.abs(k.frac.fisico - esperado) < 0.002, k.frac.fisico + ' vs ' + esperado);
    const d = j.crias.find(c => c.nome === 'Dragon');
    assert.strictEqual(d.golpes.max, 200);
    assert.strictEqual(d.golpes.medio, Math.round((76 * 10 + 100 * 20) / 30));
    assert.strictEqual(M.danoMapaJuntar([]), null);
    assert.strictEqual(j.mortes, 2);
});
console.log(`\n${n} testes ok`);

t('2.24.2 dano tomado: a medida mais LONGA do mapa manda (dano guardado de 11 min sobre o Scan de 4 min); sem guardado, fica a do livro', () => {
    const dm = { seg: 686, sessoes: 3, tomadoH: 1463177, elemPorVoc: { KNIGHT: { tomadoH: 1374928, golpesH: 11518, frac: { fisico: 0.675, terra: 0.28 } }, PALADIN: { tomadoH: 80000, golpesH: 700, frac: { terra: 0.6, drenovida: 0.4 } } } };
    const rzScan = { seg: 240, tomadoH: 291000, tomadoCorpoH: 190000, golpesCorpoH: 4034, elemPorVoc: { KNIGHT: { tomadoH: 280000, golpesH: 4000, frac: { fisico: 0.89, terra: 0.1 } } } };
    const a = M.danoTomadoDe(rzScan, dm);
    assert(a && a.deGuardado === true, 'o guardado (686 s) tem que vencer o Scan (240 s)');
    assert(Math.abs(a.tomadoS - 1463177 / 3600) < 0.01 && Math.abs(a.fisico - 0.675) < 1e-9, 'tomadoS e físico vêm do guardado: ' + JSON.stringify(a));
    assert(Math.abs(a.golpesS - 11518 / 3600 * 0.675) < 1e-6, 'golpes/s corpo a corpo = golpes/h do Knight × fração física');
    assert(a.elemVoc.KNIGHT.frac.terra === 0.28 && Math.abs(a.elemVoc.KNIGHT.tomadoS - 1374928 / 3600) < 0.01, 'elemVoc do guardado');
    const rzVivo = Object.assign({}, rzScan, { seg: 900 });
    const b = M.danoTomadoDe(rzVivo, dm);
    assert(b && b.deGuardado === false && Math.abs(b.tomadoS - 291000 / 3600) < 0.01 && Math.abs(b.golpesS - 4034 / 3600) < 1e-6, 'livro de 15 min vence o guardado de 11: ' + JSON.stringify(b));
    assert.strictEqual(M.danoTomadoDe(null, null), null);
    const c = M.danoTomadoDe(null, dm);
    assert(c && c.deGuardado === true && Math.abs(c.tomadoS - 1463177 / 3600) < 0.01, 'sem livro, o guardado');
});

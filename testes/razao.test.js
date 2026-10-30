// Roda: node testes/razao.test.js
// Livro-razão de combate (@@RAZAO, 2.21.0): quem bate, de que elemento, em quem — e o dano guardado por mapa.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const ORDEM = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'];
const stubs = `const vocDoIndice = (i) => ${JSON.stringify(ORDEM)}[i] || null; const CAT = { magias: [] }; const precoRuna = () => 0; const FRAME_FRESCO_MS = 5000;
const guardar = () => {}; const _hash = (s) => s; const amostraRegen = () => null; const medianaRegen = () => 0;`;
const M = new Function(stubs + trecho('/* @@RAZAO-INICIO', '/* @@RAZAO-FIM */') + '\nreturn { razaoNovo, razaoEvento, razaoResumo, danoMapaJuntar, elemDoJogo, razaoPosicoes };')();
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
t('2.31.0 casas das magias do boss (mcast.cells, relativas ao Cavaleiro), posições do frame e alcance medido por casa; o juntar soma', () => {
    const L = M.razaoNovo(); L.t0 = 1000000; let agora = L.t0;
    const ev = (e) => { agora += 500; M.razaoEvento(L, e, agora); };
    M.razaoPosicoes(L, { party: [{ vocation: 'KNIGHT', pos: [0, 0] }, { vocation: 'PALADIN', pos: [-4, 0] }, { vocation: 'SORCERER', pos: [2, 0] }, { vocation: 'DRUID', pos: { x: -2, y: 1 } }], active: [{ id: 1, name: 'Dragon Lord', pos: [1, 0] }] });
    M.razaoPosicoes(L, { party: [], active: [{ id: 1, name: 'Dragon Lord', pos: [1, 0] }, { id: 2, name: 'Dragon', pos: [0, -1] }] });
    assert.deepStrictEqual(L.posParty, { KNIGHT: '0,0', PALADIN: '-4,0', SORCERER: '2,0', DRUID: '-2,1' });
    ev({ kind: 'spawn', id: 1, name: 'Dragon Lord', maxHp: 2000 });
    ev({ kind: 'mcast', id: 1, atk: 'fire beam', type: 'COMBAT_FIREDAMAGE', amount: 0, cells: [[1, 0], [2, 0], [3, 0]], hits: [{ who: 2, amount: 300, mana: 0, hp: 1 }] });
    ev({ kind: 'mcast', id: 1, atk: 'fire beam', type: 'COMBAT_FIREDAMAGE', amount: 0, cells: [[1, 0], [2, 0], [3, 0]], hits: [] }); // ninguém na linha: casas contam, dano não
    ev({ kind: 'cast', who: 2, name: 'Energy Wave', hits: [{ id: 1, amount: 200, hp: 1500 }] });
    ev({ kind: 'cast', who: 3, name: 'Strong Ice Wave', hits: [] });
    ev({ kind: 'cast', who: 3, name: 'Strong Ice Wave', hits: [] });
    ev({ kind: 'cast', who: 3, name: 'Heal Friend' }); // sem lista de acertos: não conta como ataque
    L.tFim = L.t0 + 60000;
    const rz = M.razaoResumo(L);
    const dl = rz.crias.find(c => c.nome === 'Dragon Lord'), fb = dl.magias.find(m => m.atk === 'fire beam');
    assert(fb && fb.n === 2 && fb.medio === 300, JSON.stringify(fb));
    assert.deepStrictEqual(fb.celulas.map(c => [c.k, c.n, c.medio]), [['1,0', 2, 300], ['2,0', 2, 300], ['3,0', 2, 300]]);
    assert.deepStrictEqual(rz.posMob, { 'Dragon Lord': '1,0', 'Dragon': '0,-1' });
    assert.deepStrictEqual(rz.alcance, { SORCERER: { '2,0': { casts: 1, hits: 1 } }, DRUID: { '-2,1': { casts: 2, hits: 0 } } });
    const a = Object.assign({ t0: 1, t: 2 }, rz), b = JSON.parse(JSON.stringify(a)); b.t0 = 3; b.t = 4; b.posMob = { 'Dragon Lord': '0,1' };
    const j = M.danoMapaJuntar([a, b]);
    const jf = j.crias.find(c => c.nome === 'Dragon Lord').magias.find(m => m.atk === 'fire beam');
    assert.deepStrictEqual(jf.celulas.map(c => [c.k, c.n, c.medio]), [['1,0', 4, 300], ['2,0', 4, 300], ['3,0', 4, 300]], JSON.stringify(jf.celulas));
    assert.deepStrictEqual(j.posMob, { 'Dragon Lord': '0,1' }, 'a posição da sessão mais recente');
    assert.deepStrictEqual(j.alcance.DRUID, { '-2,1': { casts: 4, hits: 0 } });
});

t('2.36.6 dano de condição: veneno → terra, sangramento → físico (na leitura e no dano já guardado)', () => {
    assert.strictEqual(M.elemDoJogo('CONDITION_POISON'), 'terra');
    assert.strictEqual(M.elemDoJogo('CONDITION_BLEEDING'), 'fisico');
    const j = M.danoMapaJuntar([{ t0: 1, t: 2, seg: 100, tomadoH: 1000, elemPorVoc: { PALADIN: { tomadoH: 1000, golpesH: 0, frac: { condition_poison: 0.5, gelo: 0.3, terra: 0.2 } } }, crias: [] }]);
    assert.strictEqual(j.elemPorVoc.PALADIN.frac.terra, 0.7);
    assert(!('condition_poison' in j.elemPorVoc.PALADIN.frac));
});
console.log(`\n${n} testes ok`);

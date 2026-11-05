// Roda: node testes/razao.test.js
// Livro-razão de combate (@@RAZAO, 2.21.0): quem bate, de que elemento, em quem — e o dano guardado por mapa.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const ORDEM = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'];
const stubs = `const vocDoIndice = (i) => ${JSON.stringify(ORDEM)}[i] || null; const CAT = { magias: [{ name: 'Ultimate Healing', group: 'healing', mana: 160 }, { name: 'Mass Healing', group: 'healing', mana: 150 }, { name: 'Strong Ice Wave', group: 'attack', mana: 170, cooldownMs: 8000 }, { name: 'Ice Strike', group: 'attack', mana: 20, cooldownMs: 2000 }] }; const precoRuna = () => 0; const FRAME_FRESCO_MS = 5000;
const guardar = () => {}; const _hash = (s) => s; const amostraRegen = () => null; const medianaRegen = () => 0;`;
const M = new Function(stubs + trecho('/* @@RAZAO-INICIO', '/* @@RAZAO-FIM */') + '\nreturn { razaoNovo, razaoEvento, razaoResumo, danoMapaJuntar, elemDoJogo, razaoPosicoes, razaoVitais, razaoAutopsia, razaoDisparos, razaoCuras, razaoFecharPendente, razaoLaudoTexto };')();
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
/* 2.45.0 — FITA DE BATALHA: autópsia, disparos desperdiçados e curas que não compensam (docs/plans/2026-11-04-fita-batalha-design.md) */
const comRelogio = (t, fn) => { const o = Date.now; Date.now = () => t; try { return fn(); } finally { Date.now = o; } };
const cds = (heals, grupoCura, atk) => ({ groups: { attack: atk || 0, healing: grupoCura || 0, support: 0 }, potionMs: 0, heals: [null].concat(heals.map(([name, cdLeft]) => ({ name, cdLeft, cooldownMs: 1000 }))), supports: [] });
const membro = (voc, hp, maxHp, mana, extra) => Object.assign({ vocation: voc, hp, maxHp, mana, maxMana: 5000, cds: cds([]), kit: [] }, extra || {});
const CFG = { DRUID: { heals: [{ name: 'Ultimate Healing', percent: 30 }, { name: 'Mass Healing', percent: 70 }, { name: 'Intense Healing', percent: 70 }], minCreatures: { 'Strong Ice Wave': 3, 'Ice Strike': 1 }, skills: ['Strong Ice Wave', 'Ice Strike'] } };
function partyDru(hpDru, cdsDru, kitDru) {
    return [membro('KNIGHT', 3000, 3000, 500), membro('PALADIN', 2000, 2000, 400), membro('SORCERER', 1200, 1200, 600), membro('DRUID', hpDru, 1200, 1364, { cds: cdsDru || cds([['Ultimate Healing', 0], ['Mass Healing', 0]]), kit: kitDru || [] })];
}
t('fita: guarda vitais, monstros vivos e os eventos compactados do frame; teto de 40 s', () => {
    const L = M.razaoNovo(); let t0 = 1000000;
    for (let i = 0; i < 60; i++) comRelogio(t0 + i * 1000, () => { M.razaoVitais(L, partyDru(1200), [], [{ id: 1 }, { id: 2 }], CFG); M.razaoEvento(L, { kind: 'mcast', id: 1, type: 'COMBAT_FIREDAMAGE', words: 'x', cells: [[0, 0]], hits: [{ who: 3, amount: 10, hp: 1190, mana: 0, fx: {} }] }, t0 + i * 1000); });
    assert(L.fita.length <= 41 && L.fita.length >= 40, 'fita ' + L.fita.length);
    const r = L.fita[L.fita.length - 1];
    assert.strictEqual(r.ativos, 2); assert.strictEqual(r.vit[3].hp, 1200);
    assert.deepStrictEqual(r.ev, [{ kind: 'mcast', id: 1, type: 'COMBAT_FIREDAMAGE', hits: [{ who: 3, amount: 10, hp: 1190 }] }], JSON.stringify(r.ev));
});
t('autópsia de morte: rajada de golpes em 2 s, quem bateu, e por que cada cura não saiu (gatilho, recarga)', () => {
    const L = M.razaoNovo(); const t0 = 2000000;
    M.razaoEvento(L, { kind: 'spawn', id: 7, name: 'Angry Demon', maxHp: 8200 }, t0);
    const quadro = (dt, hp, cdMass, evs) => comRelogio(t0 + dt, () => { M.razaoVitais(L, partyDru(hp, cds([['Ultimate Healing', 0], ['Mass Healing', cdMass]])), [], [{ id: 7 }], CFG); for (const e of evs) M.razaoEvento(L, e, t0 + dt); });
    quadro(0, 1200, 0, []);
    quadro(500, 900, 1900, [{ kind: 'mcast', id: 7, type: 'COMBAT_PHYSICALDAMAGE', hits: [{ who: 3, amount: 300, hp: 900 }] }]);
    quadro(1000, 600, 1400, [{ kind: 'mcast', id: 7, type: 'COMBAT_LIFEDRAIN', hits: [{ who: 3, amount: 300, hp: 600 }] }]);
    quadro(1500, 400, 900, [{ kind: 'mcast', id: 7, type: 'COMBAT_PHYSICALDAMAGE', hits: [{ who: 3, amount: 200, hp: 400 }] }]);
    quadro(2000, 0, 400, [{ kind: 'mcast', id: 7, type: 'COMBAT_PHYSICALDAMAGE', hits: [{ who: 3, amount: 500, hp: 0 }] }, { kind: 'death', who: 3 }]);
    assert.strictEqual(L.laudos.length, 1);
    const la = L.laudos[0];
    assert.strictEqual(la.tipo, 'morte'); assert.strictEqual(la.voc, 'DRUID');
    assert(la.rajada && la.rajada.golpes === 4 && la.rajada.dano === 1300, JSON.stringify(la.rajada));
    assert.deepStrictEqual(la.tomado.map(q => [q.nome, q.el, q.dano]), [['Angry Demon', 'fisico', 1000], ['Angry Demon', 'drenovida', 300]]);
    const m = Object.fromEntries(la.curas.map(c => [c.nome, c.motivo]));
    assert.strictEqual(m['Mass Healing'], 'em recarga (0.4 s)', m['Mass Healing']);
    assert.strictEqual(m['Ultimate Healing'], 'pronta: o dano chegou antes', m['Ultimate Healing']);
    assert.match(la.texto, /Druida morreu: rajada de 4 golpes em 1\.5 s \(1300: 108 % da vida\) — Angry Demon fisico 1000, Angry Demon drenovida 300\. Não saiu — Ultimate Healing: pronta/);
});
t('autópsia "quase morreu": fecha 1 s depois e vê a cura que saiu em seguida; uma por minuto por personagem', () => {
    const L = M.razaoNovo(); const t0 = 3000000;
    M.razaoEvento(L, { kind: 'spawn', id: 7, name: 'Angry Demon', maxHp: 8200 }, t0);
    const quadro = (dt, hp, evs) => comRelogio(t0 + dt, () => { M.razaoVitais(L, partyDru(hp), [], [{ id: 7 }], CFG); for (const e of evs) M.razaoEvento(L, e, t0 + dt); });
    quadro(0, 1200, []);
    quadro(500, 266, [{ kind: 'mcast', id: 7, type: 'COMBAT_PHYSICALDAMAGE', hits: [{ who: 3, amount: 934, hp: 266 }] }]);
    assert(L.pendente && L.pendente.who === 3 && L.laudos.length === 0, 'pendente');
    quadro(800, 1200, [{ kind: 'heal', who: 3, amount: 934, hp: 1200, spell: 'Ultimate Healing' }]);
    assert.strictEqual(L.laudos.length, 0, 'ainda não fechou');
    quadro(1600, 1200, []);
    assert.strictEqual(L.laudos.length, 1); assert(!L.pendente);
    const la = L.laudos[0];
    assert.strictEqual(la.tipo, 'quase'); assert.strictEqual(la.hpFinal, 266);
    const m = Object.fromEntries(la.curas.map(c => [c.nome, c.motivo]));
    assert.strictEqual(m['Ultimate Healing'], 'saiu');
    assert.strictEqual(m['Mass Healing'], 'pronta: o dano chegou antes', m['Mass Healing']);
    assert.match(la.texto, /^Druida chegou a 22 %: golpe de 934 \(fisico\) do Angry Demon/);
    quadro(2000, 200, []); quadro(3100, 1200, []);
    assert.strictEqual(L.laudos.length, 1, 'segunda queda no mesmo minuto não gera laudo');
});
t('disparos desperdiçados: segundos parado por causa do mínimo (pronta, com mana, monstro vivo) e lançamento curto', () => {
    const L = M.razaoNovo(); const t0 = 4000000;
    const kit = [{ name: 'Strong Ice Wave', mana: 170, cooldownMs: 8000, cdLeft: 0 }, { name: 'Ice Strike', mana: 20, cooldownMs: 2000, cdLeft: 0 }];
    const quadro = (dt, ativos, kitDru, evs) => comRelogio(t0 + dt, () => { M.razaoVitais(L, partyDru(1200, null, kitDru), [], ativos, CFG); for (const e of (evs || [])) M.razaoEvento(L, e, t0 + dt); });
    quadro(0, 2, kit);
    for (let i = 1; i <= 10; i++) quadro(i * 1000, 2, kit);
    for (let i = 11; i <= 15; i++) quadro(i * 1000, 1, kit);
    for (let i = 16; i <= 20; i++) quadro(i * 1000, 2, [{ name: 'Strong Ice Wave', mana: 170, cooldownMs: 8000, cdLeft: 3000 }, kit[1]]);
    for (let i = 21; i <= 25; i++) quadro(i * 1000, 0, kit);
    quadro(26000, 4, kit, [{ kind: 'cast', who: 3, name: 'Strong Ice Wave', hits: [{ id: 1, amount: 100, hp: 10 }, { id: 2, amount: 100, hp: 10 }] }, { kind: 'cast', who: 3, name: 'Ultimate Healing', hits: [] }]);
    const d = M.razaoDisparos(L).find(x => x.nome === 'Strong Ice Wave');
    assert(d, 'sem disparos'); assert.strictEqual(d.min, 3); assert.strictEqual(d.casts, 1); assert.strictEqual(d.curtos, 1);
    /* vivo: 10 s (2) + 5 s (1) + 5 s (2, recarga) + 1 s (4 vivos) = 21 s; parada por causa do mínimo: 15 s */
    assert.strictEqual(d.paradoPct, Math.round(15000 / 21000 * 100), JSON.stringify(d));
    assert.deepStrictEqual(d.alternativas.map(a => [a.min, a.pct]), [[1, 71], [2, 48]]);
    assert(!M.razaoDisparos(L).some(x => x.nome === 'Ultimate Healing'), 'cura não é disparo');
    assert(!M.razaoDisparos(L).some(x => x.nome === 'Ice Strike'), 'mínimo 1 sem lançamento curto não aparece');
});
t('curas: desperdício acima da vida máxima, cura atrasada (< 30 %) e sugestão de gatilho', () => {
    const L = M.razaoNovo(); const t0 = 5000000;
    const quadro = (dt, hp, evs) => comRelogio(t0 + dt, () => { M.razaoVitais(L, partyDru(hp), [], [{ id: 1 }], CFG); for (const e of (evs || [])) M.razaoEvento(L, e, t0 + dt); });
    quadro(0, 1200);
    for (let i = 1; i <= 6; i++) { quadro(i * 2000, 700); quadro(i * 2000 + 1000, 1200, [{ kind: 'heal', who: 3, amount: 900, hp: 1200, spell: 'Intense Healing' }, { kind: 'heal', who: 3, amount: 1234, hp: 1200, spell: 'Mass Healing' }]); }
    quadro(20000, 250); quadro(21000, 1150, [{ kind: 'heal', who: 3, amount: 900, hp: 1150, spell: 'Ultimate Healing' }]);
    const cs = M.razaoCuras(L), mass = cs.find(c => c.nome === 'Intense Healing'), uh = cs.find(c => c.nome === 'Ultimate Healing'), grupo = cs.find(c => c.nome === 'Mass Healing');
    assert(grupo && grupo.grupo === true && grupo.desperdicioPct === null && grupo.sugestao === null, 'cura de grupo não mede desperdício: ' + JSON.stringify(grupo));
    assert(mass && mass.n === 6 && mass.desperdicioPct === Math.round(400 / 900 * 100) && mass.atrasadas === 0, JSON.stringify(mass));
    assert.strictEqual(mass.gatilho, 70);
    /* cura de 75 % da vida, a vida estava 12 pontos abaixo do gatilho (70 → 58): 100 − 75 − 12 + 10 = 23 → 25 */
    assert.strictEqual(mass.sugestao, 25, JSON.stringify(mass));
    assert(uh && uh.n === 1 && uh.atrasadas === 1 && uh.desperdicioPct === 0 && uh.sugestao === null, JSON.stringify(uh));
    /* 2.45.1 — sugestão só para baixo: cura que cabe na vida (gatilho 30, cura 75 %) não sugere subir */
});
t('gravação real (data/frames-shadow-04-11.json, fora do git — pula sem o arquivo): sem morte, Druida a 22 %, laudo cita o demônio', () => {
    const f = path.join(__dirname, '..', 'data', 'frames-shadow-04-11.json');
    if (!fs.existsSync(f)) { console.log('     (sem data/frames-shadow-04-11.json: pulado)'); return; }
    const fx = JSON.parse(fs.readFileSync(f, 'utf8')), L = M.razaoNovo(), t0 = 6000000;
    const cfg = { DRUID: { heals: [{ name: 'Ultimate Healing', percent: 30 }, { name: 'Mass Healing', percent: 70 }, { name: 'Heal Friend', percent: 70 }], minCreatures: { 'Strong Ice Wave': 3 }, skills: ['Strong Ice Wave', 'avalanche rune', 'Strong Ice Strike', 'Ice Strike'] } };
    for (const fr of fx.frames) comRelogio(t0 + fr.t, () => { M.razaoVitais(L, fr.party.map(p => Object.assign({ vocation: p.voc }, p)), fr.events, fr.ativos, cfg); for (const e of fr.events) M.razaoEvento(L, e, t0 + fr.t); });
    assert(!L.laudos.some(l => l.tipo === 'morte'));
    const q = L.laudos.filter(l => l.tipo === 'quase' && l.voc === 'DRUID');
    assert(q.length >= 1, 'quase do Druida: ' + L.laudos.map(l => l.texto).join(' | '));
    assert(q.some(l => /Angry Demon|Undead Dragon|Demon/.test(l.texto)), q.map(l => l.texto).join(' | '));
    const uh = M.razaoCuras(L).find(c => c.voc === 'DRUID' && c.nome === 'Ultimate Healing');
    assert(uh && uh.n >= 15 && uh.sugestao === null, 'UH ≤30 % não desperdiça: sem sugestão — ' + JSON.stringify(uh));
    const d = M.razaoDisparos(L).find(x => x.voc === 'DRUID' && x.nome === 'Strong Ice Wave');
    assert(d && d.casts >= 5, JSON.stringify(d));
    console.log('     ' + q[0].texto); console.log('     UH: ' + JSON.stringify(uh)); console.log('     SIW: ' + JSON.stringify(d));
});
console.log(`\n${n} testes ok`);

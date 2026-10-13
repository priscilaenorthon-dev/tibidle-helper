// Roda: node testes/invasao.test.js
// Invasão (2.17.0): o trecho puro (@@INVASAO) com a definição real de 12/10 ("A maré vermelha", Edward Teach) lida do socket.
const fs = require('fs'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'tibidle-helper.user.js'), 'utf8');
const ini = src.indexOf('/* @@INVASAO-INICIO'), fim = src.indexOf('/* @@INVASAO-FIM */');
assert(ini > 0 && fim > ini, 'marcadores @@INVASAO não encontrados');
const M = new Function(src.slice(ini, fim) + ' return { INV_VOCS, invHuntDoBoss, invCobertura, invPosicoes, invMontarPreset, invResumoReplay, invTemplateDoReplay, invAplicarTemplate, invHuntGenerica, INV_BOSSES };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
/* o caminho e os tiles de party de "A maré vermelha" (invasion_today_data.def, 13/10) */
const path6 = []; for (let x = 0; x <= 20; x++) path6.push({ x, y: 6 });
const path8 = [{ x: 20, y: 7 }, { x: 20, y: 8 }]; for (let x = 19; x >= 4; x--) path8.push({ x, y: 8 });
const path10 = [{ x: 4, y: 9 }, { x: 4, y: 10 }]; for (let x = 5; x <= 24; x++) path10.push({ x, y: 10 });
const PATH = path6.concat(path8, path10);
const PP = [];
for (const [x, y] of [[0, 4], [0, 5], [1, 4], [1, 5], [1, 7], [2, 7], [2, 8], [2, 9], [2, 10], [3, 7], [3, 8], [3, 9], [3, 10], [4, 7], [4, 11], [4, 12], [5, 7], [5, 9], [5, 11], [5, 12], [6, 7], [6, 9], [6, 11], [6, 12], [7, 5], [7, 7], [7, 9], [7, 11], [7, 12], [8, 4], [8, 5], [8, 7], [8, 9], [8, 11], [8, 12]]) PP.push({ x, y });
for (let x = 9; x <= 19; x++) for (const y of [4, 5, 7, 9, 11, 12]) PP.push({ x, y });
for (const [x, y] of [[20, 5], [20, 9], [20, 11], [21, 5], [21, 6], [21, 7], [21, 8], [21, 9], [21, 11], [22, 6], [22, 7], [22, 8], [22, 9], [22, 11], [23, 6], [23, 9], [23, 11], [24, 6], [24, 9], [24, 11]]) PP.push({ x, y });
const DEF = { invasionId: 'a_mare_vermelha', boss: { name: 'Edward Teach', health: 250, elements: [{ type: 'COMBAT_EARTHDAMAGE', percent: 20 }, { type: 'COMBAT_FIREDAMAGE', percent: -10 }, { type: 'COMBAT_DEATHDAMAGE', percent: -5 }] }, path: PATH, partyPositions: PP, durNominalMs: 347491, bossEntraMs: 313575 };

t('invHuntDoBoss: a invasão vira uma hunt de um monstro (lure 1) com os elementos do boss', () => {
    const h = M.invHuntDoBoss(DEF);
    assert.strictEqual(h.monsters.length, 1); assert.strictEqual(h.monsters[0].name, 'Edward Teach'); assert.strictEqual(h.maxLure, 1); assert(h.boss);
    assert.strictEqual(M.invHuntDoBoss({}), null);
});
t('invCobertura: tiles entre as linhas 6 e 8 do caminho têm 7 células adjacentes; a 7 de alcance o miolo cobre mais', () => {
    const c1 = M.invCobertura(DEF, 1, 741);
    const t197 = c1.find(c => c.x === 19 && c.y === 7);
    assert.strictEqual(t197.celulas, 7, '19,7: (18..20,6) + (20,7) + (18..20,8)'); assert.strictEqual(t197.ms, 7 * 741);
    const c7 = M.invCobertura(DEF, 7, 741);
    const meio = c7.find(c => c.x === 12 && c.y === 9), canto = c7.find(c => c.x === 0 && c.y === 4);
    assert(meio.celulas > canto.celulas * 2, 'miolo (12,9) cobre bem mais que o canto (0,4): ' + meio.celulas + ' × ' + canto.celulas);
});
t('invPosicoes: Knight no tile de mais caminho adjacente; os outros três no miolo, sem repetir e a ≥ 2 tiles um do outro; fixa respeitada', () => {
    const p = M.invPosicoes(DEF, { msPorCelula: 741 });
    for (const v of M.INV_VOCS) assert(p[v] && Number.isFinite(p[v].x), v + ' sem posição');
    assert.strictEqual(p.KNIGHT.celulas, 7, 'Knight no tile com 7 células adjacentes: ' + JSON.stringify(p.KNIGHT));
    const todos = M.INV_VOCS.map(v => p[v]);
    for (let i = 0; i < todos.length; i++) for (let j = i + 1; j < todos.length; j++) assert(!(todos[i].x === todos[j].x && todos[i].y === todos[j].y), 'tile repetido');
    const longe = ['PALADIN', 'SORCERER', 'DRUID'].map(v => p[v]);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert(Math.max(Math.abs(longe[i].x - longe[j].x), Math.abs(longe[i].y - longe[j].y)) >= 2, 'os três de alcance colados');
    for (const v of ['PALADIN', 'SORCERER', 'DRUID']) assert(p[v].x >= 8 && p[v].x <= 20 && p[v].y >= 5 && p[v].y <= 11, v + ' fora do miolo: ' + JSON.stringify(p[v]));
    const f = M.invPosicoes(DEF, { fixas: { DRUID: { x: 5, y: 9 } } });
    assert.strictEqual(f.DRUID.x, 5); assert.strictEqual(f.DRUID.y, 9);
});
t('invMontarPreset: plano por cima do preset atual; pinos dos equipamentos pinados; munição e o que não foi calculado ficam', () => {
    const atual = { invasionId: 'a_mare_vermelha', membros: [
        { vocation: 'KNIGHT', equipamento: { weapon: { name: 'heroic axe', pinado: true, iid: 'w1' }, armor: { name: 'dark armor', pinado: false, iid: 'a1' } }, ataques: [{ skill: 'Berserk', minCreatures: 1 }], suporte: 'Blood Rage', pocao: 'Strong Mana Potion', pocaoLimiar: 70, pos: { x: 19, y: 7 }, ammo: null },
        { vocation: 'PALADIN', equipamento: {}, ataques: [{ skill: 'Divine Missile' }, null, null, null], suporte: 'Sharpshooter', pocao: 'Strong Mana Potion', pos: { x: 14, y: 7 }, ammo: 'bolt' } ] }; // 2.17.2: o servidor devolve os slots vazios como null
    const plano = { KNIGHT: { ataques: [{ skill: 'Annihilation' }, { skill: 'Fierce Berserk', minCreatures: 1 }], suporte: 'Blood Rage', pocao: 'Strong Mana Potion', pocaoLimiar: 70, pos: { x: 19, y: 7, ms: 5000 } },
                    SORCERER: { ataques: [{ skill: 'sudden death rune' }], suporte: 'Enchant Party', pocao: 'Great Mana Potion', pocaoLimiar: 70, pos: { x: 13, y: 7 } } };
    const p = M.invMontarPreset(atual, plano);
    assert.strictEqual(p.invasionId, 'a_mare_vermelha'); assert.strictEqual(p.membros.length, 4);
    const k = p.membros.find(m => m.vocation === 'KNIGHT');
    assert.deepStrictEqual(k.pinos, { weapon: 'w1' }, 'só o pinado vira pino'); assert.deepStrictEqual(k.ataques, [{ skill: 'Annihilation' }, { skill: 'Fierce Berserk', minCreatures: 1 }]);
    assert.deepStrictEqual(k.pos, { x: 19, y: 7 }, 'pos sem o ms');
    const pa = p.membros.find(m => m.vocation === 'PALADIN');
    assert.deepStrictEqual(pa.ataques, [{ skill: 'Divine Missile' }], 'sem plano: fica o de hoje'); assert.strictEqual(pa.ammo, 'bolt'); assert.strictEqual(pa.pocaoLimiar, 70, 'limiar padrão quando o atual não tem');
    const so = p.membros.find(m => m.vocation === 'SORCERER');
    assert.strictEqual(so.suporte, 'Enchant Party'); assert.deepStrictEqual(so.pos, { x: 13, y: 7 }); assert.deepStrictEqual(so.pinos, {});
    const dr = p.membros.find(m => m.vocation === 'DRUID');
    assert.deepStrictEqual(dr.ataques, []); assert.strictEqual(dr.pos, null);
});
t('invResumoReplay: dano no boss por personagem e por magia (noBoss), mobs à parte, janela do boss e posições', () => {
    const d = { jogador: 'X', duracaoMs: 160701, elenco: [{ vocation: 'DRUID', pos: { x: 11, y: 9 } }], eventos: [
        { kind: 'cast', t: 100, ator: 'DRUID', skill: 'sudden death rune' }, { kind: 'dano', t: 100, ator: 'DRUID', valor: 785, noBoss: false },
        { kind: 'boss', t: 115500, fase: 'entrou', msPorCelula: 741 },
        { kind: 'cast', t: 118500, ator: 'DRUID', skill: 'sudden death rune' }, { kind: 'dano', t: 118500, ator: 'DRUID', valor: 873, noBoss: true },
        { kind: 'cast', t: 120000, ator: 'PALADIN', skill: 'Ataque' }, { kind: 'dano', t: 120000, ator: 'PALADIN', valor: 589, noBoss: true },
        { kind: 'pocao', t: 120000, ator: 'KNIGHT', valor: 150 }, { kind: 'dano', t: 158600, ator: 'DRUID', valor: 700, noBoss: true } ] };
    const r = M.invResumoReplay(d);
    assert.strictEqual(r.boss.DRUID, 1573); assert.strictEqual(r.boss.PALADIN, 589); assert.strictEqual(r.totalBoss, 2162); assert.strictEqual(r.mob.DRUID, 785);
    assert.strictEqual(r.porSkill['DRUID|sudden death rune'], 1573); assert.strictEqual(r.casts['DRUID|sudden death rune'], 2);
    assert.strictEqual(r.msBoss, 741); assert.strictEqual(r.bossIni, 115500); assert.strictEqual(r.bossFim, 158600); assert.deepStrictEqual(r.pos.DRUID, { x: 11, y: 9 }); assert.strictEqual(r.pocoes.KNIGHT, 1);
    assert.strictEqual(M.invResumoReplay(null).totalBoss, 0);
});
t('2.17.4 — invTemplateDoReplay: posições e magias do 1º NO BOSS (sem Ataque e sem suporte), suporte lançado', () => {
    const r = { nome: 'SDNunoh', totalBoss: 57773, boss: { DRUID: 15402, PALADIN: 20584, SORCERER: 16403, KNIGHT: 5384 },
        pos: { KNIGHT: { x: 19, y: 7 }, PALADIN: { x: 13, y: 9 }, SORCERER: { x: 13, y: 7 }, DRUID: { x: 11, y: 9 } },
        porSkill: { 'KNIGHT|Annihilation': 1834, 'KNIGHT|Ataque': 1319, 'KNIGHT|Whirlwind Throw': 964, 'KNIGHT|Fierce Berserk': 692, 'KNIGHT|Front Sweep': 635,
                    'PALADIN|Ataque': 13648, 'PALADIN|Strong Ethereal Spear': 4491, 'PALADIN|Ethereal Spear': 2445, 'SORCERER|sudden death rune': 14244, 'SORCERER|Ataque': 2159, 'DRUID|sudden death rune': 13323, 'DRUID|Ataque': 2079 },
        casts: { 'KNIGHT|Blood Rage': 9, 'PALADIN|Sharpshooter': 9, 'SORCERER|Enchant Party': 2, 'DRUID|sudden death rune': 63 } };
    const t = M.invTemplateDoReplay(r);
    assert.strictEqual(t.de, 'SDNunoh'); assert.deepStrictEqual(t.pos.KNIGHT, { x: 19, y: 7 });
    assert.deepStrictEqual(t.skills.KNIGHT, ['Annihilation', 'Whirlwind Throw', 'Fierce Berserk', 'Front Sweep']);
    assert.deepStrictEqual(t.skills.PALADIN, ['Strong Ethereal Spear', 'Ethereal Spear']); assert.deepStrictEqual(t.skills.SORCERER, ['sudden death rune']);
    assert.deepStrictEqual(t.sups, { KNIGHT: 'Blood Rage', PALADIN: 'Sharpshooter', SORCERER: 'Enchant Party' });
    assert.strictEqual(M.invTemplateDoReplay(null), null);
});
t('2.17.4 — invAplicarTemplate: posições do 1º; magias dele que o personagem tem primeiro, completadas com o plano, na ordem do jogo', () => {
    const plano = { KNIGHT: { ataques: [{ skill: 'Annihilation' }, { skill: 'Fierce Berserk', minCreatures: 1 }, { skill: 'Front Sweep', minCreatures: 1 }, { skill: 'Berserk', minCreatures: 1 }], suporte: 'Blood Rage', pos: { x: 5, y: 9, ms: 5187 } },
                    PALADIN: { ataques: [{ skill: 'Strong Ethereal Spear' }, { skill: 'sudden death rune' }], suporte: 'Sharpshooter', pos: { x: 11, y: 7 } },
                    SORCERER: { ataques: [{ skill: 'sudden death rune' }], suporte: 'Enchant Party', pos: { x: 11, y: 9 } }, DRUID: { ataques: [{ skill: 'sudden death rune' }], suporte: 'Heal Party', pos: { x: 13, y: 7 } } };
    const tpl = { de: 'X', pos: { KNIGHT: { x: 19, y: 7 }, PALADIN: { x: 13, y: 9 }, SORCERER: { x: 13, y: 7 }, DRUID: { x: 11, y: 9 } },
                  skills: { KNIGHT: ['Annihilation', 'Whirlwind Throw', 'Fierce Berserk', 'Front Sweep'], PALADIN: ['Strong Ethereal Spear', 'Ethereal Spear'], SORCERER: ['sudden death rune'], DRUID: ['Exotic Spell'] }, sups: { KNIGHT: 'Blood Rage', DRUID: 'Exotic Buff' } };
    const info = { Annihilation: { cd: 30, casas: 1, porLanc: 612 }, 'Whirlwind Throw': { cd: 6, casas: 1, porLanc: 112 }, 'Fierce Berserk': { cd: 6, casas: 8, porLanc: 343 }, 'Front Sweep': { cd: 6, casas: 3, porLanc: 221 }, Berserk: { cd: 4, casas: 8, porLanc: 132 },
                   'Strong Ethereal Spear': { cd: 8, casas: 1, porLanc: 386 }, 'Ethereal Spear': { cd: 2, casas: 1, porLanc: 82 }, 'sudden death rune': { cd: 2, casas: 1, porLanc: 180 } };
    const pode = (v, n) => !!info[n]; const infoSkill = (v, n) => info[n] || null;
    const r = M.invAplicarTemplate(plano, tpl, pode, infoSkill);
    assert.deepStrictEqual(r.KNIGHT.pos, { x: 19, y: 7, ms: 5187, modelo: true });
    assert.deepStrictEqual(r.KNIGHT.ataques.map(a => a.skill), ['Annihilation', 'Fierce Berserk', 'Front Sweep', 'Whirlwind Throw'], 'as 4 do 1º, recarga longa por dano; Berserk do plano fica de fora');
    assert.deepStrictEqual(r.KNIGHT.ataques[1], { skill: 'Fierce Berserk', minCreatures: 1 }, 'área leva mínimo 1');
    assert.deepStrictEqual(r.PALADIN.ataques.map(a => a.skill), ['Strong Ethereal Spear', 'sudden death rune', 'Ethereal Spear'], 'as dele + a do plano; as de 2 s por último, por dano');
    assert.deepStrictEqual(r.SORCERER.ataques.map(a => a.skill), ['sudden death rune']);
    assert.deepStrictEqual(r.DRUID.ataques.map(a => a.skill), ['sudden death rune'], 'magia que o Druida não tem é ignorada; fica o plano'); assert.strictEqual(r.DRUID.suporte, 'Heal Party', 'suporte desconhecido ignorado');
    assert.strictEqual(r.KNIGHT.suporte, 'Blood Rage'); assert.deepStrictEqual(r.DRUID.pos, { x: 11, y: 9, ms: undefined, modelo: true }.ms === undefined ? r.DRUID.pos : null);
    assert.strictEqual(M.invAplicarTemplate(plano, null, pode, infoSkill), plano);
});
t('2.17.6 — invHuntGenerica: os 7 bosses da rotação com peso igual (+ o do dia se for outro); Arachir imune a morte está lá', () => {
    const h = M.invHuntGenerica(DEF);
    assert.strictEqual(h.monsters.length, 7, 'Edward já está na rotação'); assert(h.boss && h.maxLure === 1);
    const ar = h.monsters.find(m => /Arachir/.test(m.name)); assert(ar.elements.some(e => e.type === 'COMBAT_DEATHDAMAGE' && e.percent === 100));
    const h2 = M.invHuntGenerica({ boss: { name: 'Boss Novo', elements: [{ type: 'COMBAT_FIREDAMAGE', percent: 50 }] } });
    assert.strictEqual(h2.monsters.length, 8); assert.strictEqual(h2.monsters[7].name, 'Boss Novo');
});
console.log(`${n} testes ok` + (process.exitCode ? ' · FALHARAM' : ''));

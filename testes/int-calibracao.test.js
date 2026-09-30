// Roda: node testes/int-calibracao.test.js
// v2.13.1 — o simulador do Inteligente contra os 4 Scans de 7 min medidos ao vivo em 30/09 (nível 71, Em área ×
// Inteligente em Vampire hell e Banshee). A 2.13.0 previa +80 % e +92 % de abates/h nos kits do Inteligente (e eles
// perderam 44 % de xp para o Em área); aqui cada kit tem que ficar a ±15 %.
// Os dados são DA CONTA (dano real, skills, Scans): ficam em data/scans-30-09.json, fora do git (.gitignore: "dados
// da conta — nunca publicar"). Sem o arquivo (CI, outra máquina) o teste é pulado.
const fs = require('fs'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const ARQ = path.join(raiz, 'data/scans-30-09.json');
if (!fs.existsSync(ARQ)) { console.log('pulado: sem data/scans-30-09.json (dados da conta, fora do git)'); process.exit(0); }
const D = JSON.parse(fs.readFileSync(ARQ, 'utf8'));

const M = new Function('D', `
    const OURO_POR_MANA = 0.56;
    const MEM = {}; const ler = (k, p) => (k in MEM ? MEM[k] : p); const guardar = (k, v) => { MEM[k] = v; };
    const tid = () => null, $$ = () => [], $ = () => null, log = () => {};
    const CAT = { hunts: D.hunts, magias: D.magias, areas: D.areas, pocoes: D.pocoes, bosses: null, precos: D.precos };
    const LOOT_CACHE = {}; const ESTADO_WS = { huntId: null, frame: { party: Object.entries(D.manaMax).map(([voc, maxMana]) => ({ voc, maxMana })) }, party: [], roster: [], sk: D.skills };
    const RAZAO = { magias: {}, vitais: {}, ondas: { n: 0 }, tomado: { total: 0, corpo: 0 } };
    const E = { nivel: D.nivel, voc: 'SORCERER', pot: { DRUID: true }, scan: D.scan, dono: null };
    const nivelAtual = () => E.nivel, vocacaoAtual = () => E.voc;
    const manaPotionLigada = (v) => !!E.pot[v], partyEmRegen = () => false;
    const scanResultados = () => E.scan, rosterEquip = () => null, huntAtual = () => null, buscarJSON = async () => { throw new Error('offline'); };
    const aprenderDanosPorRest = async () => ({ ok: true, n: 0 });
    const configAtiva = (v) => E.dono ? E.dono[v] || null : null;
    const setTimeout = () => 0, clearTimeout = () => {};
    ${trecho('/* @@MODELOS-INICIO */', '/* @@MODELOS-FIM */')}
    ${trecho('/* @@MAGIA-INICIO', '/* @@MAGIA-FIM */')}
    for (const v of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) { MEM['danos_' + v] = D.danos[v]; if (D.regen[v]) MEM['regen_' + v] = D.regen[v]; }
    Object.assign(BESTIARIO, D.bestiario);
    return { partyInt, contextoInt, avaliarPartyInt, invalidarPlanos, preverModeloInt, planejarInteligente, _intParty, MEM, E };
`)(D);

let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };
const H = (id) => D.hunts.find(x => x.id === id);
/* os kits que rodaram em cada Scan (Log de 30/09) e a poção/suporte que cada um tinha (supVoc e lançamentos) */
const KITS = {
    '50|area': { KNIGHT: [['Berserk', 2], ['Front Sweep', 1]], PALADIN: [['Divine Caldera', 2], ['avalanche rune', 2], ['great fireball rune', 1]], SORCERER: [['Energy Wave', 2], ['Rage of the Skies', 2], ['avalanche rune', 2], ['great fireball rune', 1]], DRUID: [['Strong Ice Wave', 2], ['Eternal Winter', 2], ['thunderstorm rune', 2], ['great fireball rune', 1]] },
    '50|inteligente': { KNIGHT: [['Lesser Front Sweep', 1], ['Brutal Strike', 1]], PALADIN: [['Divine Missile', 1]], SORCERER: [['Energy Beam', 1], ['Great Energy Beam', 1]], DRUID: [['Strong Ice Wave', 2], ['Energy Strike', 1]] },
    '187|area': { KNIGHT: [['Berserk', 2], ['Front Sweep', 1]], PALADIN: [['Divine Caldera', 2], ['avalanche rune', 2], ['Divine Missile', 1]], SORCERER: [['Energy Wave', 2], ['Rage of the Skies', 2], ['avalanche rune', 2], ['thunderstorm rune', 1]], DRUID: [['Strong Ice Wave', 2], ['Eternal Winter', 2], ['avalanche rune', 1]] },
    '187|inteligente': { KNIGHT: [['Front Sweep', 3], ['Berserk', 2], ['Lesser Front Sweep', 1]], PALADIN: [['Divine Caldera', 1], ['Divine Missile', 1]], SORCERER: [['Energy Beam', 1], ['Energy Wave', 1], ['Lightning', 1]], DRUID: [['Strong Ice Wave', 2], ['Energy Strike', 1]] }
};
const POC = { '50|area': { KNIGHT: 0.3 }, '50|inteligente': { KNIGHT: 0.3, DRUID: 0.3 }, '187|area': { DRUID: 0.2 }, '187|inteligente': { KNIGHT: 0.3 } };
const SUP = { '50|area': { KNIGHT: ['Train Party'] }, '50|inteligente': { KNIGHT: ['Protector', 'Train Party'] }, '187|area': {}, '187|inteligente': { KNIGHT: ['Train Party'] } };
const zerar = () => { M.invalidarPlanos(); M._intParty.clear(); for (const k of ['kit_int', 'int_aplicado', 'escada']) delete M.MEM[k]; M.E.dono = null; };
function prever(k) {
    const id = +k.split('|')[0], ctx = M.contextoInt(H(id)), esc = {};
    for (const [v, pl] of Object.entries(KITS[k])) {
        esc[v] = { plano: pl.map(([nome, minimo]) => { const av = ctx.porNome[v][nome]; assert(av, v + ' sem ' + nome); return { av, minimo }; }), pocao: (POC[k] || {})[v] || 0, sups: (SUP[k] || {})[v] || [] };
    }
    return M.avaliarPartyInt(ctx, esc, null).met;
}

t('1 — os 4 kits medidos: abates/h previstos a ±15 % do Scan (2.13.0: Inteligente +80 % e +92 %)', () => {
    zerar();
    const linhas = [];
    for (const k of Object.keys(KITS)) {
        const p = prever(k), m = D.scan[k].abatesH, e = p.abH / m - 1;
        linhas.push(`${k}: ${Math.round(p.abH)} previsto × ${m} medido (${e >= 0 ? '+' : ''}${Math.round(e * 100)} %) · onda ${p.T.toFixed(1)} s × ${D.scan[k].razao.ondas.matar} s`);
        assert(Math.abs(e) <= 0.15, linhas[linhas.length - 1]);
    }
    console.log('      ' + linhas.join('\n      '));
});

t('2 — o simulador ordena como o medido: Em área > kit do Inteligente em ≥ 30 % de abates nos dois mapas', () => {
    zerar();
    for (const id of [50, 187]) {
        const a = prever(id + '|area').abH, i = prever(id + '|inteligente').abH;
        assert(a >= 1.3 * i, `hunt ${id}: Em área ${Math.round(a)} × Inteligente ${Math.round(i)}`);
    }
});

t('3 — dano por alvo calibrado magia a magia: Strong Ice Wave, Energy Wave, Caldera e Berserk a ±15 % por lançamento', () => {
    zerar();
    const ctx = M.contextoInt(H(50)), med = D.scan['50|area'].razao.magias;
    for (const [v, nome] of [['DRUID', 'Strong Ice Wave'], ['SORCERER', 'Energy Wave'], ['PALADIN', 'Divine Caldera'], ['KNIGHT', 'Berserk']]) {
        const a = ctx.porNome[v][nome], m = med.find(x => x.voc === v && x.nome === nome);
        assert(Math.abs(a.porLancInt / m.porCast - 1) <= 0.15, `${nome}: ${Math.round(a.porLancInt)} previsto × ${m.porCast} medido`);
    }
    /* alvo único: a 2.13.0 dava 285–320 por lançamento (medido 31–88) */
    const ctx2 = M.contextoInt(H(50)), mi = D.scan['50|inteligente'].razao.magias;
    for (const [v, nome] of [['PALADIN', 'Divine Missile'], ['DRUID', 'Energy Strike']]) {
        const a = ctx2.porNome[v][nome], m = mi.find(x => x.voc === v && x.nome === nome);
        assert(Math.abs(a.porLancInt / m.porCast - 1) <= 0.25, `${nome}: ${Math.round(a.porLancInt)} previsto × ${m.porCast} medido`);
    }
});

t('4 — a busca nunca sai pior que o Em área (previsto) e fica com magia de área nos magos', () => {
    zerar();
    for (const id of [50, 187]) {
        M.invalidarPlanos(); M._intParty.clear();
        const r = M.partyInt(H(id), true), area = M.preverModeloInt('area', H(id));
        assert(r.final.met.xpH >= 0.97 * area.met.xpH, `hunt ${id}: xp ${Math.round(r.final.met.xpH)} × Em área ${Math.round(area.met.xpH)}`);
        for (const v of ['SORCERER', 'DRUID']) {
            const e = r.final.esc[v];
            assert(e && e.plano.some(p => p.av.classe !== 'unico'), `hunt ${id}: ${v} sem magia de área (${e ? e.plano.map(p => p.av.m.name).join(', ') : '—'})`);
        }
    }
});

t('5 — suportes e curas do dono ficam: a busca usa os dele e o APLICAR manda os mesmos (Protector só em slot livre)', () => {
    zerar();
    const cura = (n, p) => ({ name: n, percent: p });
    M.E.dono = {
        KNIGHT: { heals: [cura('Strong Health Potion', 45), cura('Wound Cleansing', 50), null, null, null], supports: ['Train Party', null], skills: ['Berserk', 'Groundshaker', null, null], manaPotion: { percent: 0 }, minCreatures: {} },
        PALADIN: { heals: [cura('Divine Healing', 40), cura('Strong Health Potion', 45), cura('Light Healing', 60), null, null], supports: ['Protect Party', null], skills: [], manaPotion: { percent: 0 }, minCreatures: {} },
        SORCERER: { heals: [cura('Health Potion', 35), cura('Ultimate Healing', 40), cura('Light Healing', 60), null, null], supports: ['Enchant Party', null], skills: [], manaPotion: { percent: 0 }, minCreatures: {} },
        DRUID: { heals: [cura('Ultimate Healing', 40), cura('Health Potion', 60), cura('Heal Friend', 60), null, null], supports: ['Heal Party', null], skills: [], manaPotion: { name: 'Mana Potion', percent: 30 }, minCreatures: {} }
    };
    M.MEM.escada = { 50: { d: 3, t: Date.now() } }; // degrau 3 → Protector no Knight
    const r = M.partyInt(H(50), true);
    for (const v of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) {
        const p = M.planejarInteligente(H(50), v, false), sups = p.extras.supports.filter(Boolean);
        assert(sups[0] === M.E.dono[v].supports[0], `${v}: suporte do dono saiu (${sups.join(', ')})`);
        assert.deepStrictEqual(p.extras.heals, M.E.dono[v].heals, v + ': curas mudaram');
        assert.deepStrictEqual(r.final.esc[v].sups, [M.E.dono[v].supports[0]], v + ': a busca simulou outros suportes');
    }
    const k = M.planejarInteligente(H(50), 'KNIGHT', false).extras.supports;
    assert.deepStrictEqual(k, ['Train Party', 'Protector'], 'Protector no slot livre do Knight: ' + JSON.stringify(k));
    zerar();
});

console.log(`\n${n} testes ok`);

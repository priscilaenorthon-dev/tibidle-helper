// Roda: node testes/magia.test.js
// Extrai o planejador de magias do userscript (@@MODELOS e @@MAGIA) e roda no node com
// stubs para o DOM e o estado. Catálogos reais em testes/fixtures (GET /spells e /potions,
// públicos). O DANO de cada magia é inventado (a rota /spell-numbers exige login) — os
// testes checam FORMA do plano (quantos slots, ordem, gatilhos), não números.
const fs = require('fs'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const le = (p) => JSON.parse(fs.readFileSync(path.join(raiz, p), 'utf8'));
const SPELLS = le('testes/fixtures/spells.json').magias, POTIONS = le('testes/fixtures/potions.json').pocoes;

const M = new Function('SPELLS', 'POTIONS', `
    const OURO_POR_MANA = 0.56;
    const MEM = {}; const ler = (k, p) => (k in MEM ? MEM[k] : p); const guardar = (k, v) => { MEM[k] = v; };
    const tid = () => null, $$ = () => [], $ = () => null, log = () => {};
    const CAT = { hunts: [], magias: SPELLS, areas: null, pocoes: POTIONS,
                  precos: { 'avalanche rune': 32, 'great fireball rune': 32, 'thunderstorm rune': 32, 'stone shower rune': 32, 'sudden death rune': 162 } };
    const LOOT_CACHE = {}; const ESTADO_WS = { huntId: null, frame: null, party: [], roster: [] };
    const RAZAO = { magias: {}, vitais: {}, ondas: { n: 0 } };
    const E = { nivel: 62, voc: 'SORCERER' };
    const nivelAtual = () => E.nivel, vocacaoAtual = () => E.voc;
    const manaPotionLigada = (v) => v === 'DRUID', partyEmRegen = () => false;
    const scanResultados = () => ({}), rosterEquip = () => null, huntAtual = () => null, buscarJSON = async () => { throw new Error('offline'); };
    ${trecho('/* @@MODELOS-INICIO */', '/* @@MODELOS-FIM */')}
    ${trecho('/* @@MAGIA-INICIO', '/* @@MAGIA-FIM */')}
    return { montarPlano, melhorPocao, regimeSobrando, CAT, MEM, RAZAO, ESTADO_WS, E };
`)(SPELLS, POTIONS);

let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
const d = (min, max) => ({ min, max, nivel: 62 });
const RUNAS = { 'great fireball rune': d(36, 60), 'thunderstorm rune': d(36, 60), 'avalanche rune': d(36, 60), 'stone shower rune': d(36, 60), 'sudden death rune': d(80, 120) };
const DANOS = {
    KNIGHT: { 'Lesser Front Sweep': d(40, 70), 'Brutal Strike': d(60, 110), 'Whirlwind Throw': d(50, 90), 'Groundshaker': d(50, 90), 'Berserk': d(60, 110) },
    PALADIN: Object.assign({ 'Lesser Ethereal Spear': d(10, 25), 'Ethereal Spear': d(40, 70), 'Divine Missile': d(50, 80), 'Divine Caldera': d(45, 75) }, RUNAS),
    SORCERER: Object.assign({ 'Energy Wave': d(70, 110), 'Great Fire Wave': d(55, 85), 'Fire Wave': d(28, 42), 'Energy Beam': d(35, 55), 'Great Energy Beam': d(50, 70),
        'Rage of the Skies': d(120, 180), "Hell's Core": d(130, 190), 'Scorch': d(10, 20), 'Energy Strike': d(50, 70), 'Flame Strike': d(50, 70),
        'Death Strike': d(50, 70), 'Buzz': d(8, 16), 'Lightning': d(75, 105) }, RUNAS),
    DRUID: Object.assign({ 'Chill Out': d(10, 20), 'Mud Attack': d(8, 16), 'Ice Wave': d(28, 42), 'Strong Ice Wave': d(70, 110), 'Terra Wave': d(60, 90),
        'Wrath of Nature': d(110, 170), 'Eternal Winter': d(120, 180), 'Ice Strike': d(50, 70), 'Terra Strike': d(50, 70), 'Energy Strike': d(50, 70),
        'Flame Strike': d(50, 70), 'Physical Strike': d(40, 60) }, RUNAS)
};
for (const [v, x] of Object.entries(DANOS)) M.MEM['danos_' + v] = x;
let hid = 900;
const mapa = (lure) => ({ id: ++hid, title: 'teste lure ' + lure, lureTiers: Array.from({ length: lure }, (_, i) => ({ min: i + 1, max: i + 1 })),
                          monsters: [{ name: 'Bicho', health: 400, experience: 100, weight: 1, elements: [] }] });
/* mana (e vida) medida no livro-razão: 60 amostras */
const medir = (h, voc, manaPct, hpMinPct) => { M.ESTADO_WS.huntId = h.id; M.RAZAO.vitais[voc] = { n: 60, mana: 60 * manaPct / 100, hp: 60 * 0.9, hpMin: (hpMinPct == null ? 90 : hpMinPct) / 100 }; };
const limpar = () => { M.ESTADO_WS.huntId = null; for (const k of Object.keys(M.RAZAO.vitais)) delete M.RAZAO.vitais[k]; };
const plano = (modelo, h, voc) => { M.E.voc = voc; const r = M.montarPlano(modelo, h, voc); assert(!r.erro, r.erro); return r; };
const txt = (r) => r.plano.map(p => `${p.av.m.name}≥${p.minimo}`).join(', ');
const enchimento = (p) => (p.av.m.cooldownMs || 2000) <= (p.av.m.groupCooldownMs || 2000);

t('Inteligente nunca passa de 4 slots (mana sobrando + lure baixo dava 5)', () => {
    const h = mapa(2); medir(h, 'SORCERER', 96);
    const r = plano('inteligente', h, 'SORCERER');
    assert(r.plano.length <= 4, `${r.plano.length} slots: ${txt(r)}`);
    assert(!r.plano.some(p => p.av.m.isRune), 'com mana sobrando a runa é a que sai: ' + txt(r));
    limpar();
});
t('recarga de 2 s (runa, strike, Missile) vai sempre depois das magias de recarga longa', () => {
    for (const voc of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) for (const lure of [2, 4, 6]) for (const mana of [null, 20, 90]) for (const modelo of ['inteligente', 'equilibrado', 'area', 'economica']) {
        const h = mapa(lure); if (mana != null) medir(h, voc, mana);
        const r = plano(modelo, h, voc);
        const i = r.plano.findIndex(enchimento);
        assert(i < 0 || r.plano.slice(i).every(enchimento), `${modelo} ${voc} lure ${lure} mana ${mana}: ${txt(r)}`);
        assert(r.plano.length <= 4, `${modelo} ${voc}: ${r.plano.length} slots`);
        if (r.plano.length) assert(r.plano.some(p => p.minimo === 1), `${modelo} ${voc}: nenhum slot ≥1 — com 1 monstro nada dispara: ${txt(r)}`);
        limpar();
    }
});
t('Feiticeiro sem mana medida: a runa não fica no slot 1 (era o caso da 2.8.5)', () => {
    for (const lure of [2, 4]) {
        const r = plano('inteligente', mapa(lure), 'SORCERER');
        assert(!r.plano[0].av.m.isRune, `lure ${lure}: ${txt(r)}`);
        const runa = r.plano.find(p => p.av.m.isRune), golpe = r.plano.find(p => p.minimo === 1 && !p.av.m.isRune);
        if (runa && golpe) assert(r.plano.indexOf(runa) < r.plano.indexOf(golpe), 'runa ≥2 antes do golpe ≥1: ' + txt(r));
    }
});
t('Paladino: Caldera, runa ≥2, Missile ≥1 (padrão da comunidade)', () => {
    const r = plano('inteligente', mapa(4), 'PALADIN');
    assert(/^Divine Caldera≥2, \S.* rune≥2, Divine Missile≥1$/.test(txt(r)), txt(r));
});
t('Knight: Berserk (4 s, o mais forte) no slot 1', () => {
    const r = plano('inteligente', mapa(4), 'KNIGHT');
    assert(r.plano[0].av.m.name === 'Berserk', txt(r));
});
t('Protector: fica sem medida; sai se o Knight nunca desceu de 60 % de vida', () => {
    const h = mapa(4);
    assert(plano('inteligente', h, 'KNIGHT').extras.supports.includes('Protector'), 'sem medida deveria manter o Protector');
    medir(h, 'KNIGHT', 30, 80);
    assert(!plano('inteligente', h, 'KNIGHT').extras.supports.includes('Protector'), 'Knight seguro (vida mín. 80 %) não precisa cortar 35 % do próprio dano');
    medir(h, 'KNIGHT', 30, 35);
    assert(plano('inteligente', h, 'KNIGHT').extras.supports.includes('Protector'), 'Knight apanhando (35 %) precisa do Protector');
    limpar();
});
t('poção de mana: a mais barata por ponto (Mana Potion 0,56), com e sem o catálogo', () => {
    assert(M.melhorPocao('mana', 'DRUID', 62) === 'Mana Potion', M.melhorPocao('mana', 'DRUID', 62));
    assert(M.melhorPocao('vida', 'KNIGHT', 62) === 'Strong Health Potion', 'vida continua a mais forte: ' + M.melhorPocao('vida', 'KNIGHT', 62));
    const cat = M.CAT.pocoes; M.CAT.pocoes = null;
    try { assert(M.melhorPocao('mana', 'DRUID', 90) === 'Mana Potion' && M.melhorPocao('vida', 'SORCERER', 90) === 'Health Potion'); } finally { M.CAT.pocoes = cat; }
    assert(plano('inteligente', mapa(4), 'DRUID').extras.manaPotion.name === 'Mana Potion');
});
t('regime de mana com histerese: entra com 70 %, só sai abaixo de 40 %', () => {
    const h = mapa(3), v = 'SORCERER';
    assert(M.regimeSobrando(h, v, null) === false);
    assert(M.regimeSobrando(h, v, 75) === true, 'entra com 75');
    assert(M.regimeSobrando(h, v, 55) === true, 'continua com 55 (antes saía com < 70)');
    assert(M.regimeSobrando(h, v, null) === true, 'sem medida (kit acabou de mudar) mantém o regime');
    assert(M.regimeSobrando(h, v, 35) === false, 'sai com 35');
    assert(M.regimeSobrando(h, v, 60) === false, 'fora, 60 não basta para voltar');
});
console.log(`\n${n} testes ok`);

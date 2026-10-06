// Roda: node testes/magia.test.js
// Extrai o planejador de magias do userscript (@@MODELOS e @@MAGIA) e roda no node com
// stubs para o DOM e o estado. Catálogos reais em testes/fixtures (GET /spells, /potions,
// recortes de /hunts/select e /bosses/select — todos públicos).
// Parte 1: DANO inventado (a rota /spell-numbers exige login) — checa FORMA do plano.
// Parte 2 (v2.10): dano CALIBRADO pelas fórmulas de /spells (nível 62, ML efetivo 7 — bate
// com /spell-numbers do nível 61/62: runa 27–49, sudden death 72–110, Energy Wave 43–75,
// Berserk 42–99, Caldera 40–54) nos mapas e bosses reais. Um teste por item da área C do
// plano 2.11.
const fs = require('fs'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const le = (p) => JSON.parse(fs.readFileSync(path.join(raiz, p), 'utf8'));
const SPELLS = le('testes/fixtures/spells.json').magias, POTIONS = le('testes/fixtures/potions.json').pocoes;
const HX = le('testes/fixtures/hunts.json'), HUNTS = HX.hunts, LOOT = HX.lootPorAbate, BOSSES = le('testes/fixtures/bosses.json');

const M = new Function('SPELLS', 'POTIONS', 'BOSSES', `
    const OURO_POR_MANA = 0.56;
    const MEM = {}; const ler = (k, p) => (k in MEM ? MEM[k] : p); const guardar = (k, v) => { MEM[k] = v; };
    const tid = () => null, $$ = () => [], $ = () => null, log = () => {};
    const CAT = { hunts: [], magias: SPELLS, areas: null, pocoes: POTIONS, bosses: null,
                  precos: { 'avalanche rune': 32, 'great fireball rune': 32, 'thunderstorm rune': 32, 'stone shower rune': 32, 'sudden death rune': 162,
                            'burst arrow': 15, 'sniper arrow': 5, 'crystalline arrow': 20, 'diamond arrow': 130, 'arrow': 2, 'earth arrow': 5 } };
    const LOOT_CACHE = {}; const ESTADO_WS = { huntId: null, frame: null, party: [], roster: [] };
    const RAZAO = { magias: {}, vitais: {}, ondas: { n: 0 } };
    const E = { nivel: 62, voc: 'SORCERER', pot: { DRUID: true }, rest: 0 };
    const nivelAtual = () => E.nivel, vocacaoAtual = () => E.voc;
    const manaPotionLigada = (v) => !!E.pot[v], partyEmRegen = () => false;
    const scanResultados = () => ({}), rosterEquip = () => null, huntAtual = () => null, buscarJSON = async () => { throw new Error('offline'); };
    const aprenderDanosPorRest = async () => { E.rest++; return { ok: true, n: 0 }; };
    const TIMERS = []; const setTimeout = (fn, ms) => { TIMERS.push({ fn, ms }); return TIMERS.length; }, clearTimeout = (id) => { if (id) TIMERS[id - 1] = null; };
    ${trecho('/* @@MODELOS-INICIO */', '/* @@MODELOS-FIM */')}
    ${trecho('/* @@MAGIA-INICIO', '/* @@MAGIA-FIM */')}
    CAT.bosses = normalizarBosses(BOSSES);
    return { montarPlano, melhorPocao, viabilidadeParty, simularFila, slotMorto, notasElementos, planoExtras, melhorMunicao, custoMunicao,
             danosConhecidos, valorFormula, mlDaMedida, cartaoDaVocacao, skillsDaVoc, huntDeBoss, magiasDaVocacao, invalidarPlanos, pedirReleituraDeDanos, avaliar, lureMax, slotsParaSimular, manaDoPersonagem,
             RUNA_SEMENTE, BESTIARIO, TIMERS, CAT, MEM, RAZAO, ESTADO_WS, E, LOOT_CACHE };
`)(SPELLS, POTIONS, BOSSES);

let n = 0;
const pendentes = [];
const falhou = (nome, e) => { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; };
const t = (nome, fn) => {
    try {
        const r = fn();
        if (r && typeof r.then === 'function') { pendentes.push(r.then(() => { n++; console.log('ok  ', nome); }, e => falhou(nome, e))); return; }
        n++; console.log('ok  ', nome);
    } catch (e) { falhou(nome, e); }
};

/* ============================== PARTE 1 — dano inventado (2.9.0) ============================== */
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

t('recarga de 2 s (runa, strike, Missile) vai sempre depois das magias de recarga longa', () => {
    for (const voc of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) for (const lure of [2, 4, 6]) for (const mana of [null, 20, 90]) for (const modelo of ['equilibrado', 'area', 'economica']) {
        const h = mapa(lure); if (mana != null) medir(h, voc, mana);
        const r = plano(modelo, h, voc);
        const i = r.plano.findIndex(enchimento);
        assert(i < 0 || r.plano.slice(i).every(enchimento), `${modelo} ${voc} lure ${lure} mana ${mana}: ${txt(r)}`);
        assert(r.plano.length <= 4, `${modelo} ${voc}: ${r.plano.length} slots`);
        if (r.plano.length) assert(r.plano.some(p => p.minimo === 1), `${modelo} ${voc}: nenhum slot ≥1 — com 1 monstro nada dispara: ${txt(r)}`);
        limpar();
    }
});
t('poção de mana: a mais barata por ponto (Mana Potion 0,56), com e sem o catálogo', () => {
    assert(M.melhorPocao('mana', 'DRUID', 62) === 'Mana Potion', M.melhorPocao('mana', 'DRUID', 62));
    assert(M.melhorPocao('vida', 'KNIGHT', 62) === 'Strong Health Potion', 'vida continua a mais forte: ' + M.melhorPocao('vida', 'KNIGHT', 62));
    const cat = M.CAT.pocoes; M.CAT.pocoes = null;
    try { assert(M.melhorPocao('mana', 'DRUID', 90) === 'Mana Potion' && M.melhorPocao('vida', 'SORCERER', 90) === 'Health Potion'); } finally { M.CAT.pocoes = cat; }
});
/* ============================ PARTE 2 — dano calibrado (v2.10) ============================ */
const STATS = {
    KNIGHT: { ml: 3, skill: 21, attack: 31 },     // skill+attack=52 (Berserk 42-99)
    PALADIN: { ml: 7, skill: 27, attack: 30 },    // Ethereal Spear 29-64 → distância 27
    SORCERER: { ml: 7, skill: 10, attack: 0 },
    DRUID: { ml: 7, skill: 10, attack: 0 }
};
const VOCS = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'];
const ev = (e, L, st) => Function('level', 'maglevel', 'skill', 'attack', 'return ' + e)(L, st.ml, st.skill, st.attack);
function semear(L) {
    M.E.nivel = L;
    for (const voc of VOCS) {
        const tab = {};
        for (const m of M.magiasDaVocacao(voc)) if (m.formula) tab[m.name] = { min: Math.max(1, Math.floor(ev(m.formula.min, L, STATS[voc]))), max: Math.max(1, Math.floor(ev(m.formula.max, L, STATS[voc]))), nivel: L, fonte: 'formula' };
        M.MEM['danos_' + voc] = tab;
    }
    M.invalidarPlanos();
}
const H = (id) => { const h = HUNTS.find(x => x.id === id); assert(h, 'hunt ' + id + ' fora da fixture'); return h; };
/* v2.12.0 — o Inteligente (v3) tem os testes dele em testes/inteligente.test.js (a busca da party) */
const MODELOS = ['economica', 'equilibrado', 'area'];
const txt2 = (r) => r.plano.map(p => `${p.av.m.name}≥${p.minimo}`).join(' | ');
const BOSS_NOMES = BOSSES.bosses.map(b => b.name);
semear(62);

t('fórmula de /spells sem eval: o parser dá o mesmo número que o JS para todas as fórmulas do catálogo', () => {
    const vars = { level: 62, maglevel: 7, skill: 21, attack: 31 };
    let k = 0;
    for (const m of SPELLS) if (m.formula) for (const e of [m.formula.min, m.formula.max]) {
        const a = M.valorFormula(e, vars), b = Function('level', 'maglevel', 'skill', 'attack', 'return ' + e)(vars.level, vars.maglevel, vars.skill, vars.attack);
        assert(Math.abs(a - b) < 1e-9, `${m.name}: ${e} → ${a} ≠ ${b}`); k++;
    }
    assert(k > 80, 'poucas fórmulas na fixture: ' + k);
    assert(Number.isNaN(M.valorFormula('alert(1)', vars)) && Number.isNaN(M.valorFormula('level; x', vars)) && Number.isNaN(M.valorFormula('(level', vars)), 'lixo tem de dar NaN');
});

t('item 1 — simulador: a runa ≥2 só sai com 2+ vivos, o Missile ≥1 pega o resto; grupo de 4 s e grupo secundário respeitados', () => {
    const runa = { nome: 'runa', minimo: 2, runa: true, ouro: 8, cd: 2000, grupo: 2000, porAlvo: 30, alvos: 4 };
    const missil = { nome: 'missile', minimo: 1, mana: 20, cd: 2000, grupo: 2000, porAlvo: 40, alvos: 1 };
    const s = M.simularFila([runa, missil], { lure: 4, matarS: 8, esperaS: 10, seg: 180, manaMax: 900, regen: 12 });
    assert(s.disparos[0] > 0 && s.disparos[1] > 0, JSON.stringify(s.disparos));
    assert(s.disparos[0] > 2 * s.disparos[1], 'com lure 4, 3/4 do tempo é de runa: ' + JSON.stringify(s.disparos));
    assert(Math.abs(s.ouroS - s.runasS * 8) < 1e-9 && s.ouroPocaoS === 0, 'sem poção só a runa custa ouro');
    const cp = M.simularFila([runa, missil], { lure: 4, matarS: 8, esperaS: 10, seg: 180, pocao: true });
    assert(Math.abs(cp.ouroPocaoS - cp.manaS * 0.56) < 1e-9, 'com poção a mana vira ouro a 0,56');
    // Rage (grupo 4 s, focus 40 s) + Hell's Core (focus): a segunda espera os 40 s do grupo secundário
    const rage = { nome: 'rage', minimo: 1, mana: 600, cd: 40000, grupo: 4000, sec: 'focus', secMs: 40000, porAlvo: 100, alvos: 1 };
    const core = { nome: 'core', minimo: 1, mana: 1100, cd: 40000, grupo: 4000, sec: 'focus', secMs: 40000, porAlvo: 100, alvos: 1 };
    const s2 = M.simularFila([rage, core], { lure: 1, matarS: 1e6, esperaS: 0, seg: 120, pocao: true });
    assert(s2.disparos[0] + s2.disparos[1] === 3, 'uma magia focus a cada 40 s em 120 s: ' + JSON.stringify(s2.disparos));
    const s3 = M.simularFila([Object.assign({}, rage, { sec: null, cd: 4000 })], { lure: 1, matarS: 1e6, esperaS: 0, seg: 40, pocao: true });
    assert(s3.disparos[0] === 10, 'recarga própria 4 s e grupo 4 s: 10 em 40 s, não 20: ' + s3.disparos[0]);
});

t('2.11.12 — simulador não trava com o ritmo medido ao vivo (ciclo com casas decimais: 4,019 s + 9,524 s em Vampire hell)', () => {
    /* 30/09: t − t%ciclo + ciclo dava o próprio t em t = 40.628,5 e a página congelava ao aplicar Em área */
    const onda = { nome: 'onda', minimo: 2, mana: 80, cd: 4000, grupo: 2000, porAlvo: 60, alvos: 6 };
    const t0 = Date.now();
    for (const [m, e] of [[24113 / 6 / 1000, 57144 / 6 / 1000], [4.0188333, 9.524], [1 / 3, 7 / 3], [Math.PI, Math.E]]) {
        const s = M.simularFila([onda], { lure: 6, matarS: m, esperaS: e, seg: 180, pocao: true });
        assert(s.disparos[0] > 0, 'disparou: ' + JSON.stringify(s.disparos));
    }
    assert(Date.now() - t0 < 2000, 'demorou ' + (Date.now() - t0) + ' ms');
});

t('item 1 — veredito do grupo: kit inteiro, runa cobrada, mana só de quem bebe', () => {
    const h = H(46); M.LOOT_CACHE[h.id] = LOOT[h.id];
    const pot = M.E.pot;
    try {
        M.E.pot = {};   // ninguém bebe: 2.9.0 dizia "se paga" sempre, e o ouro da runa sumia (a runa nunca é slot 1)
        M.invalidarPlanos();
        const vp = M.viabilidadeParty('equilibrado', h);
        assert(vp.regen === true, 'party toda em regeneração');
        const runasH = VOCS.reduce((s, v) => s + (vp.porVoc[v] ? vp.porVoc[v].runasH : 0), 0);
        assert(runasH > 0 && vp.ouroH > 0, 'runa tem de custar: ' + JSON.stringify(vp.porVoc));
        assert(Math.abs(vp.ouroH - runasH * 8) <= 4 * 2, `ouro/h (${vp.ouroH}) = runas/h × 8 (${runasH * 8}) — mana de regeneração não custa`);
        assert(vp.custoPorAbate > 0, 'custo por abate > 0 com runa no kit');
        for (const v of VOCS) if (vp.porVoc[v]) assert(vp.porVoc[v].kit.split(' · ').length === M.montarPlano('equilibrado', h, v).plano.length, 'o veredito conta todos os slots: ' + vp.porVoc[v].kit);
        M.E.pot = { DRUID: true };
        const vp2 = M.viabilidadeParty('equilibrado', h);
        assert(vp2.regen === false && vp2.porVoc.DRUID.ouroH > vp.porVoc.DRUID.ouroH, 'Druida bebendo paga a mana: ' + vp2.porVoc.DRUID.ouroH + ' contra ' + vp.porVoc.DRUID.ouroH);
        assert(vp2.custoPorAbate > vp.custoPorAbate, 'poção ligada encarece o abate');
        // Em área com Eternal Winter (1050 de mana) e poção: não se paga; o mesmo grupo em regeneração no Equilibrado se paga
        const vp3 = M.viabilidadeParty('area', h);
        assert(vp3.cabe === false, 'Em área com Druida bebendo não se paga: ' + vp3.custoPorAbate + ' contra ' + vp3.loot);
        assert(vp.cabe === true, 'Equilibrado em regeneração em Dragon Lair se paga: ' + vp.custoPorAbate + ' contra ' + vp.loot);
    } finally { M.E.pot = pot; M.invalidarPlanos(); }
});

t('item 2 — uma magia por grupo secundário (focus, special, ultimatestrikes, greatbeams) em todo modelo, mapa, boss e nível', () => {
    let kits = 0;
    for (const L of [55, 62, 80, 100]) {
        semear(L);
        for (const h of HUNTS) for (const modelo of MODELOS.concat(['boss'])) for (const voc of VOCS) {
            const alvo = modelo === 'boss' ? M.huntDeBoss(BOSS_NOMES[(h.id * 7) % BOSS_NOMES.length]) : h;
            const r = M.montarPlano(modelo, alvo, voc); if (r.erro) continue; kits++;
            const g = r.plano.map(p => p.av.m.secondaryGroup).filter(Boolean);
            assert(new Set(g).size === g.length, `L${L} ${alvo.title} ${modelo} ${voc}: ${txt2(r)}`);
        }
    }
    assert(kits > 900, 'poucos kits: ' + kits);
    semear(62);
    const r = M.montarPlano('area', H(26), 'SORCERER');   // Daramian: Hell's Core + Rage juntas na 2.9.0
    assert(r.plano.filter(p => p.av.m.secondaryGroup === 'focus').length === 1, txt2(r));
});

t('item 3 — Boss: sudden death entra quando o ML alcança (ou é desconhecido), sai com ML 7; nada de ultimate na frente de golpe melhor', () => {
    const b = M.huntDeBoss('Renegade Orc');
    M.ESTADO_WS.sk = {};
    for (const voc of ['PALADIN', 'SORCERER', 'DRUID']) assert(M.montarPlano('boss', b, voc).plano.some(p => p.av.m.name === 'sudden death rune'), voc + ' sem ML lido: a sudden death (91 de dano) tem de entrar');
    M.ESTADO_WS.sk = { SORCERER: { ml: 7 }, DRUID: { ml: 20 } };
    const s = M.montarPlano('boss', b, 'SORCERER'), dr = M.montarPlano('boss', b, 'DRUID');
    assert(!s.plano.some(p => p.av.m.name === 'sudden death rune'), 'ML 7 < 15: sem sudden death: ' + txt2(s));
    assert(s.ranking.find(a => a.m.name === 'sudden death rune').semML, 'marcada semML');
    assert(dr.plano.some(p => p.av.m.name === 'sudden death rune'), 'ML 20 ≥ 15: com sudden death: ' + txt2(dr));
    M.ESTADO_WS.sk = {};
    // quem bebe (Druida): toda magia de recarga longa no kit dá mais por lançamento que o preenchimento que ela tira do ciclo
    for (const nome of BOSS_NOMES) for (const L of [62, 100]) {
        semear(L);
        const r = M.montarPlano('boss', M.huntDeBoss(nome), 'DRUID');
        const ench = r.plano.filter(enchimento);
        if (!ench.length) continue;
        const melhorEnch = Math.max(...ench.map(p => p.av.porLancamento));
        for (const p of r.plano.filter(p => !enchimento(p))) assert(p.av.porLancamento >= melhorEnch, `L${L} ${nome}: ${p.av.m.name} (${p.av.porLancamento}) na frente de ${ench[0].av.m.name} (${melhorEnch}): ${txt2(r)}`);
    }
    // dano/s do kit novo ≥ o do jeito 2.9.0 (as 3 magias de maior dano por lançamento, sem runa), na mesma fila simulada
    semear(62);
    for (const nome of BOSS_NOMES) for (const voc of VOCS) {
        const alvo = M.huntDeBoss(nome), r = M.montarPlano('boss', alvo, voc);
        const kitV = r.ranking.filter(a => !a.morta && a.confiavel && !a.m.isRune).sort((a, b) => b.porLancamento - a.porLancamento).slice(0, 3);
        if (!kitV.length || !r.sim) continue;
        const o = Object.assign({ lure: 1, matarS: 1e6, esperaS: 0, seg: 90, pocao: !!M.E.pot[voc] }, M.manaDoPersonagem(voc));
        const plV = kitV.sort((a, b) => ((a.m.cooldownMs || 2000) <= 2000) - ((b.m.cooldownMs || 2000) <= 2000) || b.porLancamento - a.porLancamento).map(a => ({ av: a, minimo: 1 }));
        const sv = M.simularFila(M.slotsParaSimular(plV), o), sn = M.simularFila(M.slotsParaSimular(r.plano), o);
        assert(sn.danoS >= sv.danoS * 0.995, `${nome} ${voc}: novo ${sn.danoS.toFixed(1)}/s (${txt2(r)}) < 2.9.0 ${sv.danoS.toFixed(1)}/s (${plV.map(p => p.av.m.name).join(' | ')})`);
    }
});

t('item 5 — curas por gatilho crescente (a de 40 % antes da de 60 %), poção no lugar certo', () => {
    for (const voc of VOCS) {
        const x = M.planoExtras(voc, H(46)), hs = x.heals.filter(Boolean);
        for (let i = 1; i < hs.length; i++) assert(hs[i - 1].percent <= hs[i].percent, voc + ': ' + JSON.stringify(hs));
    }
    const pal = M.planoExtras('PALADIN', H(46)).heals.filter(Boolean).map(c => c.name + '≤' + c.percent).join(', ');
    assert(pal === 'Divine Healing≤40, Strong Health Potion≤45, Light Healing≤60', pal);
    const dru = M.planoExtras('DRUID', H(46)).heals.filter(Boolean).map(c => c.name + '≤' + c.percent).join(', ');
    assert(dru === 'Ultimate Healing≤40, Strong Health Potion≤60, Heal Friend≤60' || dru === 'Ultimate Healing≤40, Health Potion≤60, Heal Friend≤60', dru);
});

t('item 6 — veto de imunidade: área só se os imunes pesam ≥ 50 %; alvo único continua estrito', () => {
    const mon = (nome, fogo) => ({ name: nome, health: 500, experience: 50, weight: 1, elements: fogo == null ? [] : [{ type: 'COMBAT_FIREDAMAGE', percent: fogo }] });
    const h1 = { id: 'v1', title: '1 imune em 4', lureTiers: [{ min: 4, max: 4 }], monsters: [mon('a'), mon('b'), mon('c'), mon('d', 100)] };
    const h2 = { id: 'v2', title: '2 imunes em 4', lureTiers: [{ min: 4, max: 4 }], monsters: [mon('a'), mon('b'), mon('c', 100), mon('d', 100)] };
    const n1 = M.notasElementos(h1), n2 = M.notasElementos(h2);
    assert(n1.vetos.COMBAT_FIREDAMAGE != null && n1.vetosArea.COMBAT_FIREDAMAGE == null && n1.notasArea.COMBAT_FIREDAMAGE === 75, JSON.stringify(n1));
    assert(n2.vetosArea.COMBAT_FIREDAMAGE != null, '50 % imune veta a área: ' + JSON.stringify(n2));
    const r = M.montarPlano('area', h1, 'SORCERER');
    const gfw = r.ranking.find(a => a.m.name === 'Great Fire Wave'), fs = r.ranking.find(a => a.m.name === 'Flame Strike');
    assert(!gfw.morta && gfw.nota === 75, 'Great Fire Wave vale 75 % no mapa: ' + gfw.nota);
    assert(fs.morta, 'Flame Strike (alvo único) cai no bicho imune: vetada');
    assert(M.montarPlano('area', h2, 'SORCERER').ranking.find(a => a.m.name === 'Great Fire Wave').morta, 'metade imune: área vetada');
});

t('item 7 — nenhum slot morto: runa atrás de runa, strike atrás de strike com mana ≥, mínimo acima do lure', () => {
    let kits = 0;
    for (const L of [55, 62, 80, 100]) {
        semear(L);
        for (const h of HUNTS) for (const modelo of MODELOS.concat(['boss'])) for (const voc of VOCS) {
            const alvo = modelo === 'boss' ? M.huntDeBoss(BOSS_NOMES[(h.id * 3) % BOSS_NOMES.length]) : h;
            const r = M.montarPlano(modelo, alvo, voc); if (r.erro) continue; kits++;
            const lure = alvo.boss ? 1 : M.lureMax(alvo);
            r.plano.forEach((p, j) => assert(!M.slotMorto(r.plano, j, lure), `L${L} ${alvo.title} ${modelo} ${voc} slot ${j + 1} ${M.slotMorto(r.plano, j, lure)}: ${txt2(r)}`));
            // o que vem atrás de um preenchimento só se o mínimo for menor (a regra da 2.9.0 refinada)
            r.plano.forEach((p, j) => { for (let i = 0; i < j; i++) if (enchimento(r.plano[i]) && r.plano[i].av.m.isRune) assert(p.minimo < r.plano[i].minimo, `L${L} ${alvo.title} ${modelo} ${voc}: ${txt2(r)}`); });
            if (r.plano.length && !alvo.boss) assert(r.plano.some(p => p.minimo === 1), `${modelo} ${voc}: nenhum ≥1: ${txt2(r)}`);
            assert(r.plano.length <= 4);
        }
    }
    assert(kits > 900, 'poucos kits: ' + kits);
    // casos da auditoria (os do Inteligente antigo — Zombies e Quara — viraram invariantes em testes/inteligente.test.js)
    semear(62);
    const a = M.montarPlano('area', H(46), 'PALADIN');
    assert(a.plano.filter(p => p.av.m.isRune).length === 1, 'Em área do Paladino: a segunda runa ≥2 sai: ' + txt2(a));
});

t('item 8 — armadura: golpe físico desconta 0,75 × (armadura + defesa), como a munição', () => {
    const h = { id: 'arm', title: 'armadura', lureTiers: [{ min: 1, max: 1 }], monsters: [{ name: 'Tanque', health: 900, experience: 50, weight: 1, elements: [] }] };
    M.BESTIARIO.Tanque = { armor: 20, defense: 20 };
    const r = M.montarPlano('economica', h, 'KNIGHT');
    const b = r.ranking.find(a => a.m.name === 'Brutal Strike');
    const esperado = Math.max(0.2, (b.danoMedio - 30) / b.danoMedio);
    assert(Math.abs(b.fatorArm - esperado) < 1e-9, `fatorArm ${b.fatorArm} ≠ ${esperado} (0,75 × 40 = 30)`);
    const ondaMagica = r.ranking.find(a => a.m.combatType !== 'COMBAT_PHYSICALDAMAGE');
    if (ondaMagica) assert(ondaMagica.fatorArm === 1, 'magia não física não desconta armadura');
    delete M.BESTIARIO.Tanque;
});

t('item 9 — semente da runa 3×3 = 27–49 no nível 62; com ML efetivo medido, escala pela fórmula', () => {
    assert(M.RUNA_SEMENTE.min === 27 && M.RUNA_SEMENTE.max === 49 && M.RUNA_SEMENTE.nivel === 62, JSON.stringify(M.RUNA_SEMENTE));
    const salva = M.MEM.danos_SORCERER;
    try {
        M.E.nivel = 62; M.MEM.danos_SORCERER = {};
        let dd = M.danosConhecidos('SORCERER', null, true)['avalanche rune'];
        assert(dd.min === 27 && dd.max === 49 && dd.semente, 'sem medida nenhuma, no 62: ' + JSON.stringify(dd));
        assert(!M.danosConhecidos('SORCERER')['avalanche rune'], 'fora do planejador a semente não aparece (o APLICAR precisa saber que a tabela está vazia)');
        // nível 72 com Energy Wave medida neste nível no ML 9 → a runa sai da fórmula com ML 9: 72/5 + 1,2×9 + 7 = 32,2 · 72/5 + 2,8×9 + 17 = 56,6
        M.E.nivel = 72;
        const ew = SPELLS.find(m => m.name === 'Energy Wave');
        M.MEM.danos_SORCERER = { 'Energy Wave': { min: Math.floor(ev(ew.formula.min, 72, { ml: 9 })), max: Math.floor(ev(ew.formula.max, 72, { ml: 9 })), nivel: 72 } };
        assert(Math.abs(M.mlDaMedida(ew, M.MEM.danos_SORCERER['Energy Wave'], 72) - 9) < 0.3, 'ML efetivo tirado da medida');
        dd = M.danosConhecidos('SORCERER', null, true)['avalanche rune'];
        assert(dd.porML && Math.abs(dd.min - 32.2) <= 1.3 && Math.abs(dd.max - 56.6) <= 1, 'semente escalada pelo ML efetivo: ' + JSON.stringify(dd));
        // medida velha (nível 52, ML 5) de uma magia com fórmula de ML → escala pelo ML de agora, não só nível÷5
        const gfw = SPELLS.find(m => m.name === 'Great Fire Wave');
        M.MEM.danos_SORCERER['Great Fire Wave'] = { min: Math.floor(ev(gfw.formula.min, 52, { ml: 5 })), max: Math.floor(ev(gfw.formula.max, 52, { ml: 5 })), nivel: 52 };
        dd = M.danosConhecidos('SORCERER')['Great Fire Wave'];
        const alvo = { min: ev(gfw.formula.min, 72, { ml: 9 }), max: ev(gfw.formula.max, 72, { ml: 9 }) };
        assert(dd.porML && Math.abs(dd.min - alvo.min) <= 1.5 && Math.abs(dd.max - alvo.max) <= 1.5, `GFW 52→72 pelo ML: ${JSON.stringify(dd)} ~ ${JSON.stringify(alvo)}`);
        // sem medida neste nível: continua nível÷5 (o que a 2.9.0 fazia)
        delete M.MEM.danos_SORCERER['Energy Wave'];
        dd = M.danosConhecidos('SORCERER')['Great Fire Wave'];
        assert(!dd.porML && dd.min === Math.round(M.MEM.danos_SORCERER['Great Fire Wave'].min + 4), 'sem ML medido, nível÷5: ' + JSON.stringify(dd));
    } finally { M.MEM.danos_SORCERER = salva; M.E.nivel = 62; M.invalidarPlanos(); }
});

t('item 10 — munição: custo por disparo do /ammo (burst 9, crystalline 100), não o /buy-prices (15 / 20)', () => {
    assert(M.custoMunicao('burst arrow') === 9 && M.custoMunicao('crystalline arrow') === 100 && M.custoMunicao('arrow') === 0, 'tabela de reserva = /ammo');
    assert(M.custoMunicao('earth arrow') === 5, 'munição que a tabela não conhece cai no /buy-prices');
    M.CAT.municao = [{ name: 'burst arrow', cost: 11 }, { name: 'arrow', cost: 0 }];
    try { assert(M.custoMunicao('burst arrow') === 11, 'catálogo /ammo vivo manda'); } finally { delete M.CAT.municao; M.invalidarPlanos(); }
    // no nível 90 a crystalline (65 de ataque) a 20 viraria "barata"; a 100 não paga o ganho
    assert(M.melhorMunicao('arrow', 90, 4, 20, 40, {}) !== 'crystalline arrow', M.melhorMunicao('arrow', 90, 4, 20, 40, {}));
    assert(M.melhorMunicao('arrow', 62, 8, 30, 33, M.notasElementos(H(46)).notasArea) === 'arrow', 'Dragon Lair: flecha grátis');
});

t('item 11 — plano em cache: mesma entrada devolve o mesmo cálculo; dano, mana ou regime novo refazem', () => {
    const h = H(190);
    const a = M.montarPlano('area', h, 'SORCERER'), b = M.montarPlano('area', h, 'SORCERER');
    assert(a.ranking === b.ranking, 'segunda chamada tem de vir do cache');
    b.plano[0].minimo = 99;
    const c = M.montarPlano('area', h, 'SORCERER');
    assert(c.plano[0].minimo !== 99, 'quem mexe no resultado não suja o cache');
    const tab = M.MEM.danos_SORCERER; M.MEM.danos_SORCERER = Object.assign({}, tab, { 'Energy Wave': Object.assign({}, tab['Energy Wave'], { min: tab['Energy Wave'].min + 50 }) });
    const d2 = M.montarPlano('area', h, 'SORCERER');
    assert(d2.ranking !== a.ranking, 'dano novo invalida');
    M.MEM.danos_SORCERER = tab;
    M.ESTADO_WS.huntId = h.id; M.RAZAO.vitais.SORCERER = { n: 60, mana: 57, hp: 54, hpMin: 0.9 };
    const e = M.montarPlano('area', h, 'SORCERER');
    assert(e.ranking !== a.ranking, 'mana medida nova invalida');
    M.ESTADO_WS.huntId = null; delete M.RAZAO.vitais.SORCERER;
    // o veredito (4 vocações) + as 4 fichas da aba = 1 cálculo por vocação
    M.LOOT_CACHE[h.id] = LOOT[h.id]; M.invalidarPlanos();
    const r1 = VOCS.map(v => M.montarPlano('area', h, v).ranking); M.viabilidadeParty('area', h);
    const r2 = VOCS.map(v => M.montarPlano('area', h, v).ranking);
    assert(r1.every((x, i) => x === r2[i]), 'veredito e fichas reusam o mesmo plano');
});

t('item 12 — sem flags globais; v2.12.0: as variantes do Inteligente (_mana, _semruna, _seco) saíram', () => {
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '');
    assert(!/(?<!\w)(_manaTodos|_semRuna|_seco)\b|\bordemI\b|\bviavel\b|\bVARIANTES\b|\bMODELOS_FORA\b|\bregimeSobrando\b/.test(codigo), 'resto das flags/variáveis mortas no código');
    const r = M.montarPlano('inteligente', H(46), 'SORCERER');
    assert(r.pendente && !r.plano.length, 'o Inteligente não calcula no desenho da tela (só no clique): ' + JSON.stringify(Object.keys(r)));
});

t('item 13 — pedirReleituraDeDanos: invalida o cache e relê /spell-numbers UMA vez depois de equipar (várias trocas seguidas)', () => {
    const h = H(46), a = M.montarPlano('area', h, 'PALADIN');
    M.TIMERS.length = 0; M.E.rest = 0;
    M.pedirReleituraDeDanos('equipar'); M.pedirReleituraDeDanos('equipar'); M.pedirReleituraDeDanos('equipar');
    assert(M.montarPlano('area', h, 'PALADIN').ranking !== a.ranking, 'cache limpo na hora');
    const vivos = M.TIMERS.filter(Boolean);
    assert(vivos.length === 1 && vivos[0].ms >= 1000, 'uma leitura só, com espera para o servidor aplicar: ' + JSON.stringify(vivos.map(x => x.ms)));
    vivos[0].fn();
    return Promise.resolve().then(() => Promise.resolve()).then(() => assert(M.E.rest === 1, 'aprenderDanosPorRest chamado ' + M.E.rest + '×'));
});

t('2.14.15 — cartaoDaVocacao: o cartão de /spell-numbers é de um personagem só; magos e Paladino saem pela fórmula com o ML/distância deles', () => {
    const por = (nome) => SPELLS.find(m => m.name === nome);
    // Great Fire Wave, Feiticeiro ML 46 no nível 91: ((91/5) + 46×2,8 + 16) = 163 · ((91/5) + 46×4,4 + 28) = 249 — o cartão do servidor dizia 62–90 (ML ≈ 10)
    const gfw = M.cartaoDaVocacao(por('Great Fire Wave'), 'SORCERER', 91, { ml: 46 });
    assert(gfw && gfw.min === 163 && gfw.max === 249 && gfw.ml === 46, 'Great Fire Wave ML 46: ' + JSON.stringify(gfw));
    // runa 3×3 com o ML do Druida (50): 18,2 + 60 + 7 = 85 · 18,2 + 140 + 17 = 175
    const gfb = M.cartaoDaVocacao(por('great fireball rune'), 'DRUID', 91, { ml: 50 });
    assert(gfb && gfb.min === 85 && gfb.max === 175, 'great fireball ML 50: ' + JSON.stringify(gfb));
    // Paladino: Caldera por ML (20) e Strong Ethereal Spear pela distância (62; o ataque entra como ÷2500 e é desprezado)
    const cal = M.cartaoDaVocacao(por('Divine Caldera'), 'PALADIN', 91, { ml: 20, dist: 62 });
    assert(cal && cal.min === 98 && cal.max === 138, 'Caldera ML 20: ' + JSON.stringify(cal));
    const spear = M.cartaoDaVocacao(por('Strong Ethereal Spear'), 'PALADIN', 91, { ml: 20, dist: 62 });
    assert(spear && spear.min === 310 && spear.max === 440 && spear.skill === 62, 'Strong Ethereal Spear dist 62: ' + JSON.stringify(spear));
    // Knight: skill × ataque da arma — o cartão do servidor é dele, fica como veio
    assert(M.cartaoDaVocacao(por('Berserk'), 'KNIGHT', 91, { ml: 11, melee: 57 }) === null, 'Berserk fica com o cartão');
    // sem skill lida, fica o cartão
    assert(M.cartaoDaVocacao(por('Great Fire Wave'), 'SORCERER', 91, null) === null && M.cartaoDaVocacao(por('Great Fire Wave'), 'SORCERER', 91, { dist: 13 }) === null, 'sem ML fica o cartão');
    // skillsDaVoc: do frame, senão do guardado
    M.ESTADO_WS.sk = { SORCERER: { ml: 46 } }; M.MEM.skills_vistas = { DRUID: { ml: 50 } };
    assert(M.skillsDaVoc('SORCERER').ml === 46 && M.skillsDaVoc('DRUID').ml === 50 && M.skillsDaVoc('KNIGHT') === null, 'skillsDaVoc');
    M.ESTADO_WS.sk = {}; delete M.MEM.skills_vistas;
});

t('2.14.15 — Equilibrado: a "forte" é de rotação (recarga < 30 s); a ultimate de 40 s não toma a vaga da onda', () => {
    // dano com o cartão certo: Hell's Core (40 s) muito acima da Great Fire Wave por lançamento
    const antes = M.MEM.danos_SORCERER;
    M.MEM.danos_SORCERER = Object.assign({}, antes, { "Hell's Core": d(478, 662), 'Great Fire Wave': d(163, 249), 'Scorch': d(28, 39), 'Fire Wave': d(75, 114) });
    M.invalidarPlanos();
    const h = mapa(8); // monstro neutro (Dragon Lair é imune a fogo)
    const r = M.montarPlano('equilibrado', h, 'SORCERER');
    const nomes = r.plano.map(p => p.av.m.name);
    assert(!nomes.includes("Hell's Core"), 'Hell\'s Core fora do Equilibrado: ' + nomes.join(', '));
    assert(nomes.includes('Great Fire Wave'), 'a onda forte de rotação fica: ' + nomes.join(', '));
    const a = M.montarPlano('area', h, 'SORCERER').plano.map(p => p.av.m.name);
    assert(a.includes("Hell's Core"), 'no Em área a ultimate continua: ' + a.join(', '));
    M.MEM.danos_SORCERER = antes; M.invalidarPlanos();
});

Promise.all(pendentes).then(() => console.log(`\n${n} testes ok`));

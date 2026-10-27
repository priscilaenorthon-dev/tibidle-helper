// Simulador de preset atual (2.32.0): cenários offline com fixtures públicas.
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
    const escHtml = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");
    const CAT = { hunts: [], magias: SPELLS, areas: null, pocoes: POTIONS, bosses: null,
                  precos: { 'avalanche rune': 32, 'great fireball rune': 32, 'thunderstorm rune': 32, 'stone shower rune': 32, 'sudden death rune': 162 } };
    const LOOT_CACHE = {}; const ESTADO_WS = { huntId: null, frame: null, party: [], roster: [], sk: {} };
    const RAZAO = { magias: {}, vitais: {}, ondas: { n: 0 }, tomado: { total: 0, corpo: 0 } };
    const E = { nivel: 67, voc: 'SORCERER', pot: { DRUID: true }, scan: {}, dono: null };
    const nivelAtual = () => E.nivel, vocacaoAtual = () => E.voc;
    const manaPotionLigada = (v) => !!E.pot[v], partyEmRegen = () => false;
    const scanResultados = () => E.scan, rosterEquip = () => null, huntAtual = () => null, buscarJSON = async () => { throw new Error('offline'); };
    const aprenderDanosPorRest = async () => ({ ok: true, n: 0 });
    const configAtiva = (v) => E.dono ? E.dono[v] || null : null;
    const setTimeout = () => 0, clearTimeout = () => {};
    ${trecho('/* @@MODELOS-INICIO */', '/* @@MODELOS-FIM */')}
    ${trecho('/* @@MAGIA-INICIO', '/* @@MAGIA-FIM */')}
    CAT.bosses = normalizarBosses(BOSSES);
    return { preverPerfilInt, ajusteFinoInt, escolhaDoModelo, calibracaoStatusInt, calibracaoHtmlInt, montarPlano, partyInt, contextoInt, simularParty, decidirTroca, preverModeloInt, registrarAplicacaoInt, zerarInt, avaliarPartyInt, ordenarInt, okInt,
             slotMorto, lureMax, magiasDaVocacao, invalidarPlanos, suportesPermitidos, membroInt, danoBaseInt, alvosForma, barraValida, escSig,
             FRACAO_FORMA, N_MAX_SIM, N_MAX_PARTY, _intParty, _intMostrado, CAT, MEM, RAZAO, ESTADO_WS, E, LOOT_CACHE, BESTIARIO,
             escadaEnxuta, KITS_COMUNIDADE, extrasInt, seguroInt, sigNomesScan, medidaDoKitInt };
`)(SPELLS, POTIONS, BOSSES);


// Regressões do simulador de preset atual: sem DOM, rede, Scan ou comandos de jogo.
const VOCS = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'];
const H = HUNTS.find(h => h.id === 46);
Object.assign(M.LOOT_CACHE, LOOT);
Object.assign(M.BESTIARIO, le('testes/fixtures/bestiario.json').criaturas);
M.ESTADO_WS.sk = Object.fromEntries(VOCS.map(v => [v, { ml: 40, melee: 55, dist: 60 }]));
let n = 0;
const t = (nome, f) => { try { f(); n++; console.log('ok  ', nome); } catch(e) { console.error('FAIL', nome, e.stack); process.exitCode = 1; } };
const base = () => Object.fromEntries(VOCS.map(v => [v, {
    skills: [v === 'KNIGHT' ? 'Berserk' : v === 'PALADIN' ? 'Divine Caldera' : v === 'SORCERER' ? 'Energy Wave' : 'Strong Ice Wave'],
    minCreatures: {}, supports: [], heals: [], manaPotion: { name: 'Mana Potion', percent: 30 }
}]));
function reset() { M.invalidarPlanos(); M.E.scan = {}; M.E.dono = base(); }
const prever = () => M.preverPerfilInt(H);
t('sem os quatro perfis não inventa um kit', () => {
    M.E.dono = null; assert(/preset/.test(prever().erro));
    reset(); delete M.E.dono.DRUID; assert(/DRUID/.test(prever().erro));
});
t('mapa nunca visitado produz previsão com os ataques exatos e sem mudar os perfis', () => {
    reset(); const antes = JSON.stringify(M.E.dono);
    const r = prever(); assert(!r.erro, r.erro); assert(r.met.xpH > 0 && Number.isFinite(r.met.custoH));
    for (const v of VOCS) assert.deepStrictEqual(r.esc[v].plano.map(p => p.av.m.name), M.E.dono[v].skills);
    assert.strictEqual(JSON.stringify(M.E.dono), antes);
    assert(r.notas.some(x => /sobrevivência não validada/.test(x)));
    assert(r.faixaXpH[0] > 0 && r.faixaXpH[1] >= r.faixaXpH[0]);
});
t('mínimo acima do lure permanece acima do lure e o ataque não dispara', () => {
    reset(); M.E.dono.KNIGHT.minCreatures.Berserk = 99;
    const r = prever(); assert.strictEqual(r.esc.KNIGHT.plano[0].minimo, 99);
    assert.strictEqual(r.sim.por.KNIGHT.disparos[0], 0);
});
t('poção desligada do Druida não é ligada pela escada defensiva', () => {
    reset(); M.E.dono.DRUID.manaPotion.percent = 0;
    const r = prever(); assert.strictEqual(r.esc.DRUID.pocao, 0);
    assert.strictEqual(r.membros.find(x => x.voc === 'DRUID').pocao, 0);
    assert.strictEqual(r.sim.por.DRUID.pocoesH, 0);
});
t('usa o preço e a recuperação da poção de cada personagem', () => {
    reset(); const pot = M.CAT.pocoes.mana.find(p => p.name !== 'Mana Potion' && p.min > 0);
    assert(pot); M.E.dono.DRUID.manaPotion = { name: pot.name, percent: 60 };
    const r = prever(), d = r.membros.find(x => x.voc === 'DRUID');
    assert.strictEqual(d.pocaoMana, (pot.min + pot.max) / 2);
    assert.strictEqual(d.pocaoOuro, pot.cost);
    assert.strictEqual(d.pocao, 0.6);
});
t('slot vazio é preservado como ausência de ataque, nunca preenchido por outro modelo', () => {
    reset(); M.E.dono.SORCERER.skills = [null, null, null, null];
    const r = prever(); assert(!r.erro, r.erro); assert.strictEqual(r.esc.SORCERER.plano.length, 0);
    assert.deepStrictEqual(r.sim.por.SORCERER.disparos, []);
});
t('magia ou poção desconhecida impede previsão parcial enganosa', () => {
    reset(); M.E.dono.KNIGHT.skills = ['Magia que não existe']; assert(/não foi possível/.test(prever().erro));
    reset(); M.E.dono.DRUID.manaPotion.name = 'Poção que não existe'; assert(/poção/.test(prever().erro));
});
t('suportes do dono são preservados e contexto em cache não é alterado', () => {
    reset(); M.E.dono.KNIGHT.supports = ['Protector'];
    const ctx = M.contextoInt(H, { enxuto: false }), antes = JSON.stringify({defesa:ctx.defesa, cVoc:ctx.cVoc, k:ctx.kCalib});
    const r = prever(); assert.deepStrictEqual(r.esc.KNIGHT.sups, ['Protector']);
    assert.deepStrictEqual(r.ctx.defesa.KNIGHT, []);
    assert.strictEqual(JSON.stringify({defesa:ctx.defesa, cVoc:ctx.cVoc, k:ctx.kCalib}), antes);
});
t('cada mapa do ranking pode usar a mesma foto dos presets', () => {
    reset(); const perfis = JSON.parse(JSON.stringify(M.E.dono)); M.E.dono.KNIGHT.skills = [];
    const r = M.preverPerfilInt(H, { perfis }); assert.strictEqual(r.esc.KNIGHT.plano[0].av.m.name, 'Berserk');
});
t('HP individual preserva o efeito de um inimigo resistente ao lado de um fraco', () => {
    const membros = [{ voc: 'SORCERER', slots: [{ minimo: 1, d: 100, casas: 2, fr: 1, mana: 0, cd: 2000 }], manaMax: 100, regen: 0, pocao: 0 }];
    const o = { L: 2, hp: 100, E: 10, seg: 360 };
    const media = M.simularParty(membros, o);
    const misto = M.simularParty(membros, Object.assign({}, o, { monstros: [{ health: 20 }, { health: 180 }] }));
    assert(misto.T > media.T, 'a média escondia a criatura que exige uma segunda rajada');
    assert.deepStrictEqual(misto, M.simularParty(membros, Object.assign({}, o, { monstros: [{ health: 20 }, { health: 180 }] })), 'determinístico');
    assert.deepStrictEqual(media, M.simularParty(membros, Object.assign({}, o, { monstros: [{ health: 100 }] })), 'espécie única mantém o motor anterior');
});
console.log(n + ' testes ok');

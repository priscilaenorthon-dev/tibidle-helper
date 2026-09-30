// Roda: node testes/telas-api.test.js
// Aba Radar (2.13.0) — ranking de mapas sem caçar, loot ao vivo, alertas de preço e relatório do dia.
// Parte 1: extrai o trecho puro (@@TELAS-API) e confere cada conta com hunts públicas
// (testes/fixtures/hunts.json) e tabelas de loot SINTÉTICAS (sem dado pessoal).
// Parte 2: carrega o userscript INTEIRO num vm (DOM/WebSocket/relógio falsos, como o telas.test.js)
// e confere que a aba é SÓ LEITURA: abrir tudo e rodar o ranking não manda nada pelo socket; o
// "vigiar" desligado não lê o mercado; ligado, lê no máximo 1× a cada 15 min e só market_catalog/stats.
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(raiz, 'tibidle-helper.user.js'), 'utf8');
const le = (p) => JSON.parse(fs.readFileSync(path.join(raiz, p), 'utf8'));
const trecho = (a, b) => { const i = SRC.indexOf(a), f = SRC.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return SRC.slice(i, f); };
const P = new Function(`${trecho('/* @@TELAS-API-INICIO', '/* @@TELAS-API-FIM */')}
    return { tpHpXpMedio, tpLootAbate, tpValorItem, tpCalibrar, tpRisco, tpEstimar, tpNotaParty, tpOrdenar, tpDeltaAnalisador, tpRaro,
             tpAvaliarAlerta, tpAlertaDevido, tpDiaChave, tpAcumularDia, tpPodarDias, tpResumoDia, tpCompararDias, tpTextoRelatorio, tpDeltaResumo, tpTituloResumo, tpAbatesResumo,
             TP_FATOR_LOOT_PADRAO, TP_DIAS_MAX };`)();
const MKP = new Function(`${trecho('/* @@MERCADO-INICIO', '/* @@MERCADO-PURO-FIM */')}\n return { mkTaxa };`)();
const FXH = le('testes/fixtures/hunts.json');
const hunt = (t) => FXH.hunts.find(h => h.title === t);
const perto = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg || ''} esperado ~${b}, veio ${a}`);

let n = 0, falhas = 0;
const testes = [];
const t = (nome, fn) => testes.push([nome, fn]);
async function rodar() {
    for (const [nome, fn] of testes) {
        try { await fn(); n++; console.log('ok  ', nome); }
        catch (e) { falhas++; console.log('FAIL', nome, '\n   ', (e && e.stack || String(e)).split('\n').slice(0, 4).join('\n    ')); }
    }
    console.log(`\n${n} testes ok` + (falhas ? ` · ${falhas} FALHARAM` : ''));
    if (falhas) process.exitCode = 1;
}

/* tabela de loot sintética (formato de /hunt/lootTable) */
const TAB = [
    { name: 'gold coin', currency: true, chance: 100000, maxCount: 12, value: 1 },
    { name: 'orcish gear', chance: 4778, maxCount: 1, value: 85 },
    { name: 'orc tooth', chance: 1030, maxCount: 1, value: 150 },
    { name: 'broken helmet', chance: 500, maxCount: 1, value: 2000 }
];
const CAT_TAB = 6.5 + 0.04778 * 85 + 0.0103 * 150 + 0.005 * 2000;

/* ============================================================ PARTE 1 — puras */
t('tpHpXpMedio: Orc Fortress pondera pelo weight (xp 26, hp 234)', () => {
    const r = P.tpHpXpMedio(hunt('Orc Fortress'));
    perto(r.xp, 26, 1e-9); perto(r.hp, 234, 1e-9);
    assert.deepStrictEqual(P.tpHpXpMedio(null), { hp: 0, xp: 0 });
});
t('tpLootAbate: igual à conta de ouroPorAbate; fator de loot, prey e dropNerf', () => {
    const r = P.tpLootAbate(TAB, null, {});
    perto(r.cat, CAT_TAB, 1e-9, 'cat'); perto(r.npc, CAT_TAB, 1e-9);
    const f = P.tpLootAbate(TAB, null, { fatorLoot: 0.5, fatorPrey: 1.2 });
    perto(f.npc, CAT_TAB * 0.6, 1e-9, 'fatores'); perto(f.cat, CAT_TAB, 1e-9, 'cat continua cru');
    const nf = P.tpLootAbate(TAB, null, { dropNerf: { factor: 4, minChance: 1000, nomes: ['Orcish Gear'] } });
    perto(nf.cat, CAT_TAB - 0.04778 * 85 + 0.011945 * 85, 1e-9, 'codex conhecido cai 4×');
    const nf2 = P.tpLootAbate(TAB, null, { dropNerf: { factor: 4, minChance: 1000, nomes: ['orc tooth'] } });
    perto(nf2.cat, CAT_TAB - 0.0103 * 150 + 0.01 * 150, 1e-9, 'nunca abaixo de minChance');
    const merc = P.tpLootAbate(TAB, (nome) => nome === 'orcish gear' ? { npc: 85, mercado: 120 } : nome === 'orc tooth' ? { npc: 150, mercado: 50 } : {}, {});
    perto(merc.catMerc, CAT_TAB + 0.04778 * 35, 1e-9, 'mercado só vale quando passa do NPC');
    assert.strictEqual(merc.porItem.find(x => x.nome === 'orc tooth').mercado, null);
});
t('tpValorItem: taxa de 5 % com floor e mínimo 1 bate com mkTaxa; sem negócio em 30 d não há mercado', () => {
    const cat = { x: { trades30d: 3, sellOrders: 2, minSell: 1000 }, y: { trades30d: 1, sellOrders: 1, minSell: 10 }, z: { trades30d: 0, sellOrders: 4, minSell: 999 }, w: { trades30d: 5, sellOrders: 0 } };
    const a = P.tpValorItem('X', { npcTabela: 800, cat, taxa: 0.05 });
    assert.strictEqual(a.mercado, 1000 - MKP.mkTaxa(1000, 1, 0.05)); assert.strictEqual(a.mercado, 950);
    assert.strictEqual(a.melhor, 'mercado'); assert.strictEqual(a.ganhoPct, 19); assert.strictEqual(a.fonte, 'minSell');
    assert.strictEqual(P.tpValorItem('y', { cat, taxa: 0.05 }).mercado, 10 - MKP.mkTaxa(10, 1, 0.05), 'mínimo 1');
    assert.strictEqual(P.tpValorItem('z', { npc: { z: 5 }, cat }).mercado, null, 'sem negócio em 30 dias');
    assert.strictEqual(P.tpValorItem('z', { npc: { z: 5 }, cat }).npc, 5, 'NPC pelo /prices');
    const w = P.tpValorItem('w', { cat, stats: { w: { avg: 500 } } });
    assert.strictEqual(w.fonte, 'media'); assert.strictEqual(w.mercado, 475);
    assert.strictEqual(P.tpValorItem('w', { cat }).mercado, null, 'sem anúncio e sem média');
});
t('tpCalibrar: medianas dos Scans limpos, limites, ignora sujos/outro nível, padrões com n = 0', () => {
    const scans = [
        { id: 1, abatesH: 1000, lootH: 7000, tomadoH: 50000, nivel: 62, razao: { porVoc: { KNIGHT: { hpMin: 70 } } } },
        { id: 2, abatesH: 1200, lootH: 4000, tomadoH: 80000, nivel: 63, razao: { porVoc: { KNIGHT: { hpMin: 30 } } } },
        { id: 1, abatesH: 9000, lootH: 90000, suja: true, nivel: 62 },
        { id: 2, abatesH: 9000, lootH: 90000, nivel: 50 },
        { id: 1, abatesH: 9000, erro: 'morte', nivel: 62 }
    ];
    const est = { 1: { abH: 800, cat: 20, L: 5, xpAbate: 100 }, 2: { abH: 1500, cat: 10, L: 4, xpAbate: 200 } };
    const c = P.tpCalibrar(scans, est, 62);
    assert.strictEqual(c.n, 2);
    perto(c.kAbates, (1.25 + 0.8) / 2, 1e-9, 'kAbates'); perto(c.fatorLoot, (0.35 + 4000 / 12000) / 2, 1e-9, 'fatorLoot');
    perto(c.aTomado, 100, 1e-9); assert.strictEqual(c.tetoTomadoSeguro, 50000, 'teto só com o Knight ≥ 50 %');
    const z = P.tpCalibrar([], est, 62);
    assert.deepStrictEqual([z.kAbates, z.fatorLoot, z.aTomado, z.tetoTomadoSeguro, z.n], [1, P.TP_FATOR_LOOT_PADRAO, null, null, 0]);
    const lim = P.tpCalibrar([{ id: 1, abatesH: 5000, lootH: 5000 * 20 * 3, nivel: 62 }], est, 62);
    assert.strictEqual(lim.kAbates, 1.5); assert.strictEqual(lim.fatorLoot, 1);
    const lim2 = P.tpCalibrar([{ id: 1, abatesH: 100, lootH: 1, nivel: 62 }], est, 62);
    assert.strictEqual(lim2.kAbates, 0.5); assert.strictEqual(lim2.fatorLoot, 0.15);
});
const ORC = hunt('Orc Fortress');
const entBase = (extra) => Object.assign({ hunt: ORC, nivel: 62, premium: true, motor: { danoS: 1000, custoPorAbate: 3, porVoc: {} }, loot: P.tpLootAbate([{ name: 'gold coin', currency: true, chance: 100000, maxCount: 37.2, value: 1 }], null, {}),
    ritmo: { E: 10 }, calib: { kAbates: 1, fatorLoot: 0.35, n: 0 }, medido: null, extras: {} }, extra || {});
t('tpEstimar: conta à mão (Orc Fortress, dano 1000/s, espera 10 s)', () => {
    const r = P.tpEstimar(entBase());
    const T = 5 * 234 / 1000, ab = 5 * 3600 / (T + 10 + 2.5);
    assert.strictEqual(r.L, 5); perto(r.T, T, 0.05); perto(r.abH, ab, 0.5, 'abH'); perto(r.xpH, ab * 26, 1, 'xpH');
    perto(r.lootH, ab * 19.1 * 0.35, 1, 'lootH'); perto(r.custoH, ab * 3, 1, 'custoH'); perto(r.ouroH, ab * 19.1 * 0.35 - ab * 3, 2, 'ouroH');
    assert.strictEqual(r.fonte, 'estimado'); assert.strictEqual(r.confianca, 'baixa'); assert(r.notas.includes('cura não medida'));
    const k = P.tpEstimar(entBase({ calib: { kAbates: 0.9, fatorLoot: 0.5, n: 3 } }));
    perto(k.abH, ab * 0.9, 0.5, 'kAbates'); perto(k.lootH, ab * 0.9 * 19.1 * 0.5, 1); assert.strictEqual(k.confianca, 'calibrado');
    const b = P.tpEstimar(entBase({ taxaXp: 150 }));
    perto(b.xpHBonus, b.xpH * 1.5, 1, 'xp com bônus = xp raw × taxa');
});
t('tpEstimar: nível abaixo do mínimo bloqueia; premium sem Premium bloqueia', () => {
    const r = P.tpEstimar(entBase({ nivel: 30 }));
    assert.strictEqual(r.bloqueio, 'nível 35'); assert.strictEqual(r.risco.nivel, 'bloqueado');
    const p = P.tpEstimar(entBase({ hunt: Object.assign({}, ORC, { premium: true }), premium: false }));
    assert.strictEqual(p.bloqueio, 'premium'); assert.strictEqual(p.risco.nivel, 'bloqueado');
    assert.strictEqual(P.tpEstimar(entBase({ hunt: Object.assign({}, ORC, { premium: true }), premium: null })).bloqueio, null, 'premium desconhecido não bloqueia');
});
t('tpEstimar: Scan limpo manda (fonte medido, estimativa ao lado); sujo ou de outro nível não', () => {
    const m = { abatesH: 1500, xpH: 60000, xpRawH: 45000, lootH: 12000, supH: 4000, ouroH: 8000, nivel: 62, t: 1, razao: { porVoc: { KNIGHT: { hpMin: 35 } } } };
    const r = P.tpEstimar(entBase({ medido: m }));
    assert.strictEqual(r.fonte, 'medido'); assert.strictEqual(r.xpH, 45000, 'compara pelo xp raw'); assert.strictEqual(r.ouroH, 8000); assert.strictEqual(r.abH, 1500);
    assert(r.est && r.est.xpH > 0 && r.est.xpH !== 45000, 'estimativa guardada ao lado');
    assert(r.risco.motivos.some(x => /Knight já desceu a 35/.test(x)), 'hp mínimo medido entra no risco');
    assert.strictEqual(P.tpEstimar(entBase({ medido: Object.assign({}, m, { suja: true }) })).fonte, 'estimado');
    assert.strictEqual(P.tpEstimar(entBase({ medido: Object.assign({}, m, { nivel: 50 }) })).fonte, 'estimado');
});
t('tpEstimar: motor null dá "sem dano"; motor v3 falso com abH e custoH é usado sem a fórmula', () => {
    const r = P.tpEstimar(entBase({ motor: null }));
    assert.strictEqual(r.xpH, null); assert.strictEqual(r.ouroH, null); assert(r.notas.some(x => /sem dano/.test(x)));
    const v3 = P.tpEstimar(entBase({ motor: { abH: 1234, custoH: 5000, danoS: 800, porVoc: {} } }));
    assert.strictEqual(v3.abH, 1234); assert.strictEqual(v3.xpH, 1234 * 26); assert.strictEqual(v3.custoH, 5000);
    perto(v3.ouroH, 1234 * 19.1 * 0.35 - 5000, 1);
    const extras = P.tpEstimar(entBase({ extras: { municaoH: 100, vidaH: 200 } }));
    perto(extras.custoH - P.tpEstimar(entBase()).custoH, 300, 1, 'munição e cura medidas entram no gasto');
});
t('tpRisco: cada motivo e cada faixa', () => {
    const base = { nivel: 62, levelMin: 30, L: 5, xpAbate: 100, T: 5, notaParty: 90 };
    assert.deepStrictEqual([P.tpRisco(base).nivel, P.tpRisco(base).pts], ['baixo', 0]);
    assert.strictEqual(P.tpRisco(Object.assign({}, base, { levelMin: 70 })).nivel, 'bloqueado');
    assert.strictEqual(P.tpRisco(Object.assign({}, base, { levelMin: 57 })).pts, 1, 'nível mínimo ≥ nível − 5');
    assert.strictEqual(P.tpRisco(Object.assign({}, base, { aTomado: 100, tetoTomado: 30000 })).pts, 2, 'tomado 50k > 1,5 × 30k');
    assert.strictEqual(P.tpRisco(Object.assign({}, base, { aTomado: 100, tetoTomado: 40000 })).pts, 0, '50k ≤ 60k');
    assert.strictEqual(P.tpRisco(Object.assign({}, base, { T: 30 })).pts, 1);
    assert.strictEqual(P.tpRisco(Object.assign({}, base, { notaParty: 50 })).pts, 1);
    assert.strictEqual(P.tpRisco(Object.assign({}, base, { hpMinK: 20 })).pts, 2);
    const m = P.tpRisco(Object.assign({}, base, { mortes: 1 }));
    assert.deepStrictEqual([m.pts, m.nivel], [3, 'médio']);
    assert.strictEqual(P.tpRisco(Object.assign({}, base, { mortes: 1, T: 30 })).nivel, 'alto');
    assert(P.tpRisco(Object.assign({}, base, { imunes: ['fogo'] })).motivos.some(x => /imunes: fogo/.test(x)));
});
t('tpOrdenar: xp, ouro, os dois; filtro e desempate pelo título', () => {
    const L = [{ title: 'B', xpH: 50, ouroH: 100, risco: { nivel: 'baixo', pts: 0 } }, { title: 'Aa', xpH: 100, ouroH: 10, risco: { nivel: 'baixo', pts: 0 } },
               { title: 'A', xpH: 100, ouroH: 10, risco: { nivel: 'baixo', pts: 0 } }, { title: 'C', xpH: 500, ouroH: 500, bloqueio: 'nível 80', risco: { nivel: 'bloqueado', pts: 99 } },
               { title: 'D', xpH: 90, ouroH: 90, risco: { nivel: 'alto', pts: 5 } }, { title: 'E', xpH: null, ouroH: null, risco: { nivel: 'baixo', pts: 0 } }];
    assert.deepStrictEqual(P.tpOrdenar(L, 'xp').map(x => x.title), ['A', 'Aa', 'D', 'B', 'C', 'E'], 'bloqueado vai para o fim');
    assert.deepStrictEqual(P.tpOrdenar(L, 'ouro').map(x => x.title), ['B', 'D', 'A', 'Aa', 'C', 'E']);
    assert.deepStrictEqual(P.tpOrdenar(L, 'dois').map(x => x.title).slice(0, 3), ['B', 'A', 'Aa'], 'D perde 0,75 pelo risco');
    assert.deepStrictEqual(P.tpOrdenar(L, 'xp', { esconder: true }).map(x => x.title), ['A', 'Aa', 'B', 'E']);
});
t('tpNotaParty: elemento da magia principal × nota do mapa, ponderado pelo dano', () => {
    const ne = { notas: { COMBAT_FIREDAMAGE: 30, COMBAT_ICEDAMAGE: 100 }, notasArea: { COMBAT_FIREDAMAGE: 60, COMBAT_ICEDAMAGE: 100 } };
    const mag = { 'Fire Wave': { combatType: 'COMBAT_FIREDAMAGE', area: true }, 'Ice Strike': { combatType: 'COMBAT_ICEDAMAGE', area: false } };
    const r = P.tpNotaParty({ SORCERER: { magia: 'Fire Wave', dano: 300 }, DRUID: { magia: 'Ice Strike', dano: 100 }, KNIGHT: null }, ne, (x) => mag[x]);
    assert.strictEqual(r.nota, Math.round((60 * 300 + 100 * 100) / 400)); assert.strictEqual(r.porVoc.SORCERER.nota, 60, 'área usa notasArea');
});
t('tpDeltaAnalisador: delta normal; reset por outra hunt, relógio/xp caindo e drop diminuindo; 1º frame é só base', () => {
    const an = (ms, xp, k, loot, drops) => ({ elapsedMs: ms, xp, xpRaw: xp, kills: k, lootGold: loot, suppliesGold: 5, drops: drops || {} });
    const a = P.tpDeltaAnalisador(null, an(1000, 10, 1, 5, { 'orc tooth': 1 }), 34);
    assert.strictEqual(a.delta.seg, 0); assert.strictEqual(a.delta.xp, 0); assert.strictEqual(a.base.huntId, 34);
    const b = P.tpDeltaAnalisador(a.base, an(3000, 30, 3, 25, { 'orc tooth': 2, 'scimitar': 1 }), 34);
    assert.deepStrictEqual([b.delta.seg, b.delta.xp, b.delta.kills, b.delta.loot], [2, 20, 2, 20]);
    assert.deepStrictEqual(b.delta.drops, { 'orc tooth': 1, scimitar: 1 });
    assert.strictEqual(P.tpDeltaAnalisador(b.base, an(4000, 40, 4, 30, { 'orc tooth': 2, 'scimitar': 1 }), 35).delta.xp, 0, 'outra hunt');
    assert(P.tpDeltaAnalisador(b.base, an(500, 40, 4, 30, {}), 34).reset, 'relógio voltou');
    assert(P.tpDeltaAnalisador(b.base, an(5000, 10, 4, 30, { 'orc tooth': 2, 'scimitar': 1 }), 34).reset, 'xp caiu');
    const d = P.tpDeltaAnalisador(b.base, an(5000, 50, 4, 30, { 'orc tooth': 1, 'scimitar': 1 }), 34);
    assert(d.reset && d.delta.xp === 0, 'drop diminuiu = analisador zerado');
});
t('tpDeltaAnalisador: hunt_started no mesmo mapa — analisador que não zerou vira base (1º frame com > 5 s)', () => {
    const r = P.tpDeltaAnalisador({ huntId: 34, an: null, novo: true }, { elapsedMs: 900000, xp: 40000, kills: 700, lootGold: 9000 }, 34);
    assert.strictEqual(r.delta.xp, 0, 'não pode contar a caçada antiga');
    const r2 = P.tpDeltaAnalisador({ huntId: 34, an: null, novo: true }, { elapsedMs: 1000, xp: 100, kills: 3, lootGold: 50 }, 34);
    assert.strictEqual(r2.delta.xp, 100, 'caçada nova conta desde o zero');
});
t('tpRaro: item de chance baixa mas barato não é raro', () => {
    assert.strictEqual(P.tpRaro({ chance: 500 }, 15, 20), false, 'corncob');
});
t('tpRaro: chance < 1 % ou valor ≥ 20× o loot por abate; moeda nunca', () => {
    assert.strictEqual(P.tpRaro(TAB[3], 2000, 20), true);
    assert.strictEqual(P.tpRaro(TAB[1], 85, 20), false);
    assert.strictEqual(P.tpRaro(TAB[1], 400, 20), true, '≥ 20×');
    assert.strictEqual(P.tpRaro(TAB[0], 1, 0.01), false, 'moeda');
    assert.strictEqual(P.tpRaro(null, 500, 20), true, 'sem tabela: só pelo valor');
    assert.strictEqual(P.tpRaro(TAB[3], 0, 20), false, 'sem valor');
});
t('tpAvaliarAlerta: acima da média em X %, anúncio ≤ Y, compra aberta, sem média dá null', () => {
    const cat = { 'dragon ham': { sellOrders: 3, minSell: 130, maxBuy: 0, trades30d: 9 }, 'giant shimmering pearl': { sellOrders: 1, minSell: 900, maxBuy: 1300, trades30d: 4 }, 'mana potion': { sellOrders: 10, minSell: 40, trades30d: 50 } };
    const v = P.tpAvaliarAlerta({ nome: 'Dragon Ham', modo: 'vender', pct: 20 }, cat, { avg: 100 }, 0.05);
    assert.strictEqual(v.tipo, 'vender'); assert(/vale anunciar/.test(v.msg) && /30 % acima/.test(v.msg), v.msg);
    assert.strictEqual(P.tpAvaliarAlerta({ nome: 'dragon ham', modo: 'vender', pct: 40 }, cat, { avg: 100 }), null, '30 % < 40 %');
    assert.strictEqual(P.tpAvaliarAlerta({ nome: 'dragon ham', modo: 'vender', pct: 20 }, cat, null), null, 'sem média e sem preço: null');
    const c = P.tpAvaliarAlerta({ nome: 'giant shimmering pearl', modo: 'vender', pct: 20 }, cat, { avg: 1000 });
    assert.strictEqual(c.tipo, 'compra'); assert(/COMPRA aberta a 1\.300 .*na hora e sem taxa/.test(c.msg), c.msg);
    const b = P.tpAvaliarAlerta({ nome: 'mana potion', modo: 'comprar', preco: 45 }, cat, null);
    assert.strictEqual(b.tipo, 'barato'); assert(/barato: 40/.test(b.msg)); assert.strictEqual(b.chave, 'mana potion|barato');
    assert.strictEqual(P.tpAvaliarAlerta({ nome: 'mana potion', modo: 'comprar', preco: 30 }, cat, null), null);
    assert.strictEqual(P.tpAvaliarAlerta({ nome: 'nada', modo: 'comprar', preco: 30 }, cat, null), null);
});
t('tpAlertaDevido: desligado por padrão; menos de 15 min dá false mesmo com min 5', () => {
    assert.strictEqual(P.tpAlertaDevido({}, { ult: 0 }, 1e12), false);
    assert.strictEqual(P.tpAlertaDevido({ vigiar: true, min: 5 }, { ult: 1e12 }, 1e12 + 14 * 60000), false);
    assert.strictEqual(P.tpAlertaDevido({ vigiar: true, min: 5 }, { ult: 1e12 }, 1e12 + 15 * 60000), true);
    assert.strictEqual(P.tpAlertaDevido({ vigiar: true, min: 30 }, { ult: 1e12 }, 1e12 + 20 * 60000), false);
});
t('tpAcumularDia: meia-noite divide; tempo por mapa; mortes; ids do mercado sem repetir; corte em 30 dias', () => {
    const t0 = new Date(2026, 8, 30, 0, 0, 30).getTime();
    const d = P.tpAcumularDia({}, t0, { tipo: 'delta', huntId: 34, title: 'Orc Fortress', delta: { seg: 60, xp: 600, xpRaw: 500, kills: 6, loot: 120, sup: 60, drops: {} } });
    assert.deepStrictEqual(Object.keys(d).sort(), ['2026-09-29', '2026-09-30']);
    perto(d['2026-09-30'].xp, 300, 1e-6); perto(d['2026-09-29'].xp, 300, 1e-6); perto(d['2026-09-30'].mapas['Orc Fortress'].seg, 30, 1e-6);
    P.tpAcumularDia(d, t0, { tipo: 'morte' }); P.tpAcumularDia(d, t0, { tipo: 'morte' });
    P.tpAcumularDia(d, t0, { tipo: 'mercado', id: 'a', ouro: 500 }); P.tpAcumularDia(d, t0, { tipo: 'mercado', id: 'a', ouro: 500 });
    P.tpAcumularDia(d, t0, { tipo: 'ciclo', reg: { ouro: 3000, erro: null } }); P.tpAcumularDia(d, t0, { tipo: 'ciclo', reg: { ouro: 0, erro: 'venda' } });
    P.tpAcumularDia(d, t0, { tipo: 'npc', ouro: 1200 });
    const h = d['2026-09-30'];
    assert.deepStrictEqual([h.mortes, h.mercado, h.ciclos.n, h.ciclos.ouro, h.ciclos.falhas, h.npc], [2, 500, 2, 3000, 1, 1200]);
    P.tpAcumularDia(d, t0, { tipo: 'offline', summary: { huntId: 50, title: 'Vampire hell', elapsedSec: 3600, xpPerHour: 40000, lootGold: 9000, suppliesGold: 1000, kills: 900 } });
    assert.strictEqual(h.offline, 1); perto(h.mapas['Vampire hell'].xp, 40000, 1e-6);
    const muitos = {}; for (let i = 1; i <= 40; i++) muitos['2026-08-' + String(i > 31 ? 31 : i).padStart(2, '0')] = { i };
    for (let i = 1; i <= 9; i++) muitos['2026-09-0' + i] = { i };
    const p = P.tpPodarDias(muitos, 30);
    assert.strictEqual(Object.keys(p).length, 30); assert(p['2026-09-09'] && !p['2026-08-01'], 'ficam os mais novos');
});
t('tpDeltaResumo: resumo sem base = caçada inteira; com base conta só o que faltou', () => {
    const sm = { huntId: 34, elapsedSec: 7200, xpPerHour: 30000, lootGold: 8000, suppliesGold: 2000, kills: 1000 };
    assert.deepStrictEqual(P.tpDeltaResumo(null, sm), { seg: 7200, xp: 60000, loot: 8000, sup: 2000, kills: 1000 });
    const base = { huntId: 34, an: { elapsedMs: 3600000, xp: 30000, loot: 5000, sup: 1500, kills: 600 } };
    assert.deepStrictEqual(P.tpDeltaResumo(base, sm), { seg: 3600, xp: 30000, loot: 3000, sup: 500, kills: 400 });
    assert.strictEqual(P.tpDeltaResumo({ huntId: 34, an: { elapsedMs: 7200000, xp: 60000, loot: 8000, sup: 2000, kills: 1000 } }, sm), null, 'tudo já contado');
});
t('tpDeltaResumo (2.13.1): frames até o fim = nada a somar; título {key, params}; abates em killsTotal', () => {
    /* formato real do ended.summary (30/09) */
    const sm = { huntId: 103, title: { key: 'server.hunt.title.data', params: { name: 'Nargor Pirate island' } }, elapsedSec: 7335, xpPerHour: 41588,
                 lootGold: 87056, suppliesGold: 42266, kills: { 'Pirate Buccaneer': 3065, 'Pirate Corsair': 1559 }, killsTotal: 4624 };
    assert.strictEqual(P.tpTituloResumo(sm), 'Nargor Pirate island');
    assert.strictEqual(P.tpTituloResumo({ title: 'Vampire hell' }), 'Vampire hell');
    assert.strictEqual(P.tpAbatesResumo(sm), 4624);
    assert.strictEqual(P.tpAbatesResumo({ kills: { a: 2, b: 3 } }), 5);
    const agora = 1790800000000;
    /* base de 20 s atrás no mesmo mapa (o Scan zerou o analisador no meio: resumo − base daria a caçada de novo) */
    const fresca = { huntId: 103, t: agora - 20000, an: { elapsedMs: 400000, xp: 5000, loot: 900, sup: 400, kills: 250 } };
    assert.strictEqual(P.tpDeltaResumo(fresca, sm, agora), null, 'os frames acompanharam até o fim');
    /* base velha (página fechada 10 min antes do fim): conta o que faltou */
    const velha = { huntId: 103, t: agora - 600000, an: { elapsedMs: 6735000, xp: 76000, loot: 80000, sup: 39000, kills: 4200 } };
    const d = P.tpDeltaResumo(velha, sm, agora);
    assert(d && Math.abs(d.seg - 600) < 1e-6 && d.kills === 424, JSON.stringify(d));
    /* sem base: a caçada inteira, com os abates certos */
    assert.strictEqual(P.tpDeltaResumo(null, sm, agora).kills, 4624);
});
t('tpCompararDias e tpTextoRelatorio: médias de 7 dias, porcentagens e números em pt-BR', () => {
    const dias = {};
    for (let i = 1; i <= 7; i++) dias[P.tpDiaChave(new Date(2026, 8, 30 - i, 12).getTime())] = { seg: 3600, xp: 100000, loot: 20000, sup: 10000, kills: 1000, mortes: 0, mapas: {} };
    const hoje = P.tpAcumularDia(dias, new Date(2026, 8, 30, 12).getTime(), { tipo: 'delta', huntId: 50, title: 'Vampire hell', delta: { seg: 7200, xp: 150000, xpRaw: 1, kills: 1500, loot: 25000, sup: 10000, drops: {} } });
    const c = P.tpCompararDias(hoje, '2026-09-30', 7);
    assert.strictEqual(c.n, 7); assert.deepStrictEqual(c.pct, { xp: 50, liquido: 50, loot: 25, horas: 100 });
    assert.strictEqual(c.serie.length, 7); assert.strictEqual(c.serie[6].chave, '2026-09-30');
    const txt = P.tpTextoRelatorio(hoje['2026-09-30'], c, '2026-09-30');
    assert(/relatório de 30\/09\/2026/.test(txt), txt); assert(/XP: 150\.000 \(75\.000\/h\) \(\+50 % vs\. média de 7 dias\)/.test(txt), txt);
    assert(/Ouro líquido: 15\.000 \(loot 25\.000 − gasto 10\.000\)/.test(txt), txt); assert(/Vampire hell: 2h00/.test(txt), txt);
    assert.strictEqual(P.tpCompararDias({}, '2026-09-30').pct.xp, null, 'sem histórico, sem %');
});
t('desempenho: tpEstimar em 75 mapas abaixo de 50 ms', () => {
    const ents = []; for (let i = 0; i < 5; i++) for (const h of FXH.hunts) ents.push(entBase({ hunt: h, loot: P.tpLootAbate(TAB, null, {}) }));
    const t0 = process.hrtime.bigint();
    for (const e of ents) P.tpEstimar(e);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert(ms < 50, ms + ' ms');
});

/* ============================================================ PARTE 2 — vm */
const XSS = (k) => `<img src=x onerror="window.__xss=${k}">`;
const HUNT_MAL = 'Orc ' + XSS(1) + ' Pits';
const ITEM_MAL = 'gem ' + XSS(2);
const HUNTS = FXH.hunts.concat([Object.assign({}, FXH.hunts[0], { id: 901, title: HUNT_MAL, levelMin: 20 })]);
const lootDe = (url) => {
    const id = Number((/huntId=(\d+)/.exec(url) || [])[1]);
    return id === 34 ? TAB.concat([{ name: ITEM_MAL, chance: 200, maxCount: 1, value: 700 }]) : TAB.map(x => Object.assign({}, x, { value: x.currency ? 1 : x.value + id }));
};
const ROTAS = { '/hunts/select': HUNTS, '/spells': le('testes/fixtures/spells.json').magias, '/potions': le('testes/fixtures/potions.json').pocoes,
    '/buy-prices': { 'great fireball rune': 32 }, '/bosses/select': [], '/hunt/lootTable': lootDe, '/bestiary/creature': { armor: 10, defense: 10 } };
const d62 = (min, max) => ({ min, max, nivel: 62 });
const DANOS = {
    KNIGHT: { 'Lesser Front Sweep': d62(40, 70), 'Brutal Strike': d62(60, 110) },
    PALADIN: { 'Ethereal Spear': d62(40, 70), 'Divine Missile': d62(50, 80), 'Divine Caldera': d62(45, 75), 'great fireball rune': d62(27, 49) },
    SORCERER: { 'Energy Wave': d62(70, 110), 'Great Fire Wave': d62(55, 85), 'Energy Strike': d62(50, 70), 'Flame Strike': d62(50, 70) },
    DRUID: { 'Ice Wave': d62(28, 42), 'Strong Ice Wave': d62(70, 110), 'Terra Wave': d62(60, 90), 'Ice Strike': d62(50, 70) }
};
function criarMundo(opts) {
    opts = opts || {};
    let AGORA = 1759150000000;
    const porId = new Map(), porTestid = new Map(), fila = [], errosTimer = [], avisos = [];
    let seq = 0;
    const doc = {};
    class El {
        constructor(tag) {
            this.tagName = String(tag || 'div').toUpperCase(); this._id = ''; this.style = {}; this.dataset = {}; this.attrs = {};
            this._filhos = []; this.pai = null; this._html = ''; this.sets = 0; this.textContent = ''; this.isConnected = true;
            this.disabled = false; this.value = ''; this.className = ''; this.scrollTop = 0; this.open = false; this.hidden = false; this.title = '';
            this.ouvintes = {}; this.cliques = 0; this.selecionou = 0;
            const cls = new Set();
            this.classList = { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)),
                toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : !!f; if (on) cls.add(c); else cls.delete(c); return on; }, contains: (c) => cls.has(c) };
        }
        get id() { return this._id; }
        set id(v) { this._id = v; porId.set(v, this); }
        get innerHTML() { return this._html; }
        set innerHTML(v) {
            this._html = String(v); this.sets++;
            const tirar = (e) => { e.isConnected = false; if (doc.activeElement === e) doc.activeElement = doc.body; e._filhos.forEach(tirar); };
            this._filhos.forEach(tirar); this._filhos = [];
            for (const m of this._html.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*?)\bid="([^"]+)"([^>]*)>/g)) {
                const e = new El(m[1]); e._id = m[3]; porId.set(m[3], e); e.pai = this; this._filhos.push(e);
                const at = (m[2] + ' ' + m[4]).replace(/"[^"]*"/g, '""');
                e.disabled = /(^|\s)disabled(\s|=|$)/.test(at);
                const val = /\bvalue="([^"]*)"/.exec(m[2] + ' ' + m[4]); if (val) e.value = val[1];
            }
        }
        get offsetWidth() { return 44; } get offsetHeight() { return 60; } get innerText() { return this.textContent; }
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } setAttribute(k, v) { this.attrs[k] = String(v); } hasAttribute(k) { return k in this.attrs; }
        append(...k) { k.forEach(x => { if (x && typeof x === 'object') x.pai = this; }); } appendChild(c) { if (c && typeof c === 'object') c.pai = this; return c; }
        replaceChildren(...k) { this._filhos = k; this.textContent = k.map(x => x.textContent || '').join(''); }
        insertAdjacentElement() { } remove() { this.isConnected = false; }
        focus() { doc.activeElement = this; }
        blur() { if (doc.activeElement === this) doc.activeElement = doc.body; this.disparar('blur', {}); }
        select() { this.selecionou++; }
        contains(x) { for (let e = x; e; e = e.pai) if (e === this) return true; return false; }
        addEventListener(t, f, o) { (this.ouvintes[t] = this.ouvintes[t] || []).push({ f, once: !!(o && o.once) }); }
        removeEventListener() { } dispatchEvent() { return true; }
        disparar(t, ev) { const l = this.ouvintes[t] || []; this.ouvintes[t] = l.filter(x => !x.once); for (const x of l) x.f(Object.assign({ target: this, preventDefault() { }, stopPropagation() { } }, ev)); }
        click() { this.cliques++; if (typeof this.onclick === 'function') return this.onclick({ target: this }); }
        closest() { return null; } matches() { return false; } querySelector(s) { return consulta(s); } querySelectorAll() { return []; }
        getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10 }; }
    }
    const consulta = (sel) => {
        let m = /^#([\w-]+)$/.exec(sel); if (m) { const e = porId.get(m[1]); return e && e.isConnected ? e : null; }
        m = /^\[data-testid="([^"]+)"\]$/.exec(sel); if (m) return porTestid.get(m[1]) || null;
        return null;
    };
    const extrasQSA = { button: [] };
    const plantar = (testid, texto) => { const e = new El('div'); e.attrs['data-testid'] = testid; e.textContent = texto || ''; porTestid.set(testid, e); return e; };
    Object.assign(doc, { readyState: 'complete', head: new El('head'), body: new El('body'), documentElement: new El('html'),
        createElement: (t) => new El(t), querySelector: consulta, querySelectorAll: (s) => extrasQSA[s] || [], addEventListener() { },
        getElementById: (id) => porId.get(id) || null });
    doc.activeElement = doc.body;

    const store = new Map(Object.entries(opts.ls || {}));
    const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); },
        key: (i) => [...store.keys()][i] || null, clear: () => store.clear(), get length() { return store.size; } };
    const localStorage = new Proxy(ls, { ownKeys: () => [...store.keys()],
        getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : undefined) });

    class FakeWS {
        constructor(url) { this.url = url; this.readyState = 1; this.ouvintes = {}; this.saida = []; }
        addEventListener(t, f) { (this.ouvintes[t] = this.ouvintes[t] || []).push(f); }
        send(d) { this.saida.push(d); if (FakeWS.responder) FakeWS.responder(this, JSON.parse(d)); }
        emitir(o) { const data = JSON.stringify(o); for (const f of (this.ouvintes.message || [])) f({ data }); }
    }
    FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;

    class FDate extends Date { constructor(...a) { if (a.length) super(...a); else super(AGORA); } static now() { return AGORA; } }
    const setTimeout_ = (f, ms) => { const id = ++seq; fila.push({ id, t: AGORA + Math.max(0, Number(ms) || 0), f }); return id; };
    const setInterval_ = (f, ms) => { const id = ++seq; fila.push({ id, t: AGORA + Math.max(1, Number(ms) || 0), f, rep: true, ms: Math.max(1, Number(ms) || 0) }); return id; };
    const limpar = (id) => { const i = fila.findIndex(x => x.id === id); if (i >= 0) fila.splice(i, 1); };
    const drenar = async (n) => { for (let i = 0; i < (n || 4); i++) await new Promise(r => setImmediate(r)); };
    async function avancar(ms) {
        const alvo = AGORA + (ms || 0);
        await drenar();
        for (let guarda = 0; guarda < 200000; guarda++) {
            fila.sort((a, b) => a.t - b.t || a.id - b.id);
            const x = fila[0];
            if (!x || x.t > alvo) break;
            fila.shift();
            if (x.t > AGORA) AGORA = x.t;
            if (x.rep) { x.t = AGORA + x.ms; fila.push(x); }
            try { x.f(); } catch (e) { errosTimer.push(e); }
            await drenar(2);
        }
        AGORA = alvo;
        await drenar();
    }
    const rotas = Object.assign({}, ROTAS, opts.rotas || {});
    const gets = [];
    const fetch = async (url) => {
        gets.push(String(url));
        const cheio = String(url).replace('https://play.tibidle.com', '');
        const caminho = String(url).includes('raw.githubusercontent') ? 'raw' : cheio.split('?')[0];
        let r = rotas[caminho];
        if (typeof r === 'function') r = r(cheio);
        if (r === undefined) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
        return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(r)), text: async () => JSON.stringify(r) };
    };
    const clip = { escritos: [], bloqueado: opts.clipboardBloqueado !== false };
    const navigator = { clipboard: { writeText: (t) => { clip.escritos.push(t); return clip.bloqueado ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); } } };
    const window = { WebSocket: FakeWS, addEventListener() { }, innerWidth: 1400, innerHeight: 900, open() { }, document: doc, localStorage };
    const console_ = { log() { }, info() { }, warn: (...a) => avisos.push(a.map(String).join(' ')), error: (...a) => avisos.push('ERRO ' + a.map(x => (x && x.stack) || String(x)).join(' ')) };
    const ctx = { window, document: doc, localStorage, WebSocket: FakeWS, console: console_, fetch, Date: FDate,
        setTimeout: setTimeout_, setInterval: setInterval_, clearTimeout: limpar, clearInterval: limpar,
        requestAnimationFrame: (f) => setTimeout_(f, 16), getComputedStyle: () => ({}), navigator, location: { href: 'https://play.tibidle.com/' }, crypto: {},
        MouseEvent: class { }, PointerEvent: class { }, KeyboardEvent: class { }, Event: class { }, MutationObserver: class { observe() { } disconnect() { } } };
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'tibidle-helper.user.js' });
    const lsGet = (k) => { const v = store.get(k); return v == null ? undefined : JSON.parse(v); };
    const corpo = () => porId.get('tb-corpo');
    const el = (id) => { const e = porId.get(id); return e && e.isConnected ? e : null; };
    return { ctx, window, doc, porId, el, corpo, plantar, store, lsGet, avancar, errosTimer, avisos, extrasQSA, clip, El, gets, FakeWS, setTimeout_,
             get agora() { return AGORA; }, get H() { return window.__tbHelper; }, html: () => corpo()._html };
}


const BASE = { tb_helper_debug: 'true', tb_helper_nivel_manual: '62', tb_helper_era: '"2026-09-wipe"' };
const comAba = (sub, extra) => {
    const ls = Object.assign({}, BASE, { tb_helper_ui: JSON.stringify({ aba: 'radar', aberta: true, livre: false, oculto: false, logLido: 1 }), tb_helper_radar_sub: JSON.stringify(sub || 'mapas') }, extra || {});
    for (const [v, x] of Object.entries(DANOS)) ls['tb_helper_danos_' + v] = JSON.stringify(x);
    return ls;
};
const party4 = () => ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'].map(v => ({ vocation: v, hp: 500, maxHp: 500, mana: 200, maxMana: 300 }));
const frame = (an) => ({ type: 'frame', data: { state: { cap: { used: 100, total: 1000 }, balance: 5000, lureTier: 1, character: { level: 62 }, party: party4() },
    analyzer: Object.assign({ elapsedMs: 1000, xp: 0, xpRaw: 0, killsTotal: 0, lootGold: 0, suppliesGold: 0, drops: {} }, an) } });
const logTxt = (W) => (W.lsGet('tb_helper_log') || []).map(l => l.msg).join('\n');
const semXss = (html, onde) => {
    assert(!/<img\b/i.test(html), `${onde}: <img> cru no HTML`);
    assert(!/<[^>]+\son\w+=/i.test(html.replace(/"[^"]*"/g, '""')), `${onde}: atributo on…= numa tag`);
};
const enviados = (ws) => ws.saida.map(s => JSON.parse(s));
const conectar = async (W) => {
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: { account: { name: 'Teste', premiumUntil: '2099-01-01T00:00:00Z' } } });
    await W.avancar(0);
    return ws;
};
const hojeDe = (W) => P.tpDiaChave(W.agora);
const GETS_OK = /^(\/hunts\/select|\/spells|\/assets\/v\d+\/spell-areas\.json|\/buy-prices|\/bosses\/select|\/potions|\/hunt\/lootTable\?huntId=\d+|\/bestiary\/creature\?name=[^&]+|\/auth\/me|\/spell-numbers.*|raw)$/;
const caminhoGet = (u) => u.includes('raw.githubusercontent') ? 'raw' : u.replace('https://play.tibidle.com', '');

t('Radar: ícone antes do Log, as 4 sub-abas desenham com o rodapé "só leitura"', async () => {
    assert(/\['radar', '⌖', 'Radar'\], \['log', '≡', 'Log'\]\]/.test(SRC), 'Radar fora de ICONES ou depois do Log');
    for (const sub of ['mapas', 'loot', 'alertas', 'dia']) {
        const W = criarMundo({ ls: comAba(sub) });
        await W.avancar(0);
        const h = W.html();
        assert(/id="tb-radar"/.test(h) && /Só leitura: nada aqui envia comando de ação ao jogo\./.test(h), sub + ': tela não desenhou');
        assert(new RegExp(`class="rd-aba on" data-rd-sub="${sub}"`).test(h), sub + ': sub-aba não marcada');
        assert.strictEqual(W.errosTimer.length, 0, sub + ': ' + W.errosTimer.map(String).join(' | '));
        assert(!/falha em radar/.test(logTxt(W)), sub + ': ' + logTxt(W));
    }
    assert(/function anotarCiclo\(reg\) \{[\s\S]{0,300}radarCiclo\(reg\)/.test(SRC), 'anotarCiclo não alimenta o Dia');
    assert(/try \{ radarObservar\(o\); \}/.test(SRC), 'radarObservar fora de observarRecebido');
});

t('Radar/Mapas: ranking completo é SÓ LEITURA (nada no socket, GETs públicos), fatiado, escapado e persistido', async () => {
    const W = criarMundo({ ls: comAba('mapas') });
    await W.avancar(0);
    const ws = await conectar(W);
    const antesGets = W.gets.length, antesSets = W.corpo().sets;
    W.el('rd-calc').click();
    await W.avancar(1000);
    assert(/calculando…|tabelas de loot/.test(W.html()), 'o progresso não aparece');
    await W.avancar(300000);
    assert.deepStrictEqual(enviados(ws), [], 'o ranking mandou algo pelo socket');
    const novos = W.gets.slice(antesGets).map(caminhoGet);
    const fora = novos.filter(u => !GETS_OK.test(u));
    assert.deepStrictEqual(fora, [], 'GET fora da lista');
    const nLoot = novos.filter(u => /lootTable/.test(u)).length;
    const elegiveis = HUNTS.filter(h => h.levelMin <= 67).length;
    assert.strictEqual(nLoot, elegiveis, 'uma tabela por mapa elegível');
    const rank = W.lsGet('tb_helper_radar_rank');
    assert(rank && rank.linhas.length === elegiveis && !rank.parcial, 'radar_rank: ' + JSON.stringify(rank && { n: rank.linhas.length, parcial: rank.parcial }));
    assert(rank.linhas.filter(l => l.xpH > 0).length >= elegiveis - 2, 'o motor não deu dano: ' + JSON.stringify(rank.linhas.map(l => [l.title, l.xpH, l.notas])));
    assert.strictEqual(rank.calib.fatorLoot, P.TP_FATOR_LOOT_PADRAO, 'sem Scan: fator padrão');
    assert(JSON.stringify(rank).length < 40000, 'radar_rank grande demais: ' + JSON.stringify(rank).length);
    assert(W.corpo().sets - antesSets >= elegiveis, `não repintou entre os mapas (${W.corpo().sets - antesSets} repinturas)`);
    const h = W.html();
    semXss(h, 'Mapas');
    assert(/Orc &lt;img/.test(h), 'título malicioso não apareceu escapado');
    assert(/calculado agora, nível 62/.test(h) && /fator de loot 0,35/.test(h), 'cabeçalho do ranking');
    assert(/<span class="tb-tag">estimado<\/span>/.test(h));
    // de novo: tabelas vêm da gaveta comum, sem rede
    const g2 = W.gets.length;
    W.el('rd-calc').click();
    await W.avancar(300000);
    assert.strictEqual(W.gets.slice(g2).filter(u => /lootTable|bestiary/.test(u)).length, 0, 'baixou de novo o que já estava guardado');
    // F5: o ranking volta do disco
    const W2 = criarMundo({ ls: Object.fromEntries(W.store) });
    await W2.avancar(0);
    assert(/Vampire hell/.test(W2.html()) && /nível 62/.test(W2.html()), 'o ranking não voltou depois do F5');
    assert.deepStrictEqual(W.errosTimer, []);
});

t('Radar/Mapas: "parar" interrompe no meio e grava o parcial', async () => {
    const W = criarMundo({ ls: comAba('mapas') });
    await W.avancar(0);
    W.el('rd-calc').click();
    await W.avancar(1500);
    assert(W.el('rd-parar'), 'sem botão parar durante o cálculo');
    W.el('rd-parar').click();
    await W.avancar(300000);
    const rank = W.lsGet('tb_helper_radar_rank');
    assert(rank && rank.parcial && rank.linhas.length < HUNTS.filter(h => h.levelMin <= 67).length, 'não parou: ' + JSON.stringify(rank && { p: rank.parcial, n: rank.linhas.length }));
    assert(/interrompido/.test(W.html()));
});

const ALERTAS = (vigiar) => ({ tb_helper_radar_alertas: JSON.stringify({ itens: [{ nome: 'dragon ham', modo: 'vender', pct: 20, on: true }, { nome: 'mana potion', modo: 'comprar', preco: 45, on: true }], vigiar, min: 5 }) });
const responderMercado = (W, reg) => {
    W.FakeWS.responder = (ws, o) => {
        reg.push({ t: W.agora, tipo: o.type });
        const d = o.type === 'market_catalog' ? { type: 'market_catalog_result', data: { items: [{ name: 'dragon ham', sellOrders: 3, minSell: 130, maxBuy: 0, trades30d: 9 }, { name: 'mana potion', sellOrders: 9, minSell: 40, trades30d: 90 }, { name: ITEM_MAL, sellOrders: 1, minSell: 5, trades30d: 1 }] } }
            : o.type === 'market_stats' ? { type: 'market_stats_result', data: { itemName: o.data.itemName, stats: { avg: 100, min: 90, max: 140, samples: 20 } } } : null;
        if (d) W.setTimeout_(() => ws.emitir(d), 150);
    };
};
t('Radar/Alertas: vigiar DESLIGADO — 2 h de relógio, nenhum market_*', async () => {
    const W = criarMundo({ ls: comAba('alertas', ALERTAS(false)) });
    await W.avancar(0);
    const reg = []; responderMercado(W, reg);
    const ws = await conectar(W);
    await W.avancar(2 * 3600000);
    assert.deepStrictEqual(enviados(ws).filter(o => /^market_/.test(o.type)), []);
    assert(/CONFERIR AGORA/.test(W.html()));
});
t('Radar/Alertas: vigiar LIGADO — 1 leitura a cada ≥ 15 min (mesmo com min 5), só market_catalog/stats, alerta 1×', async () => {
    const W = criarMundo({ ls: comAba('alertas', ALERTAS(true)) });
    await W.avancar(0);
    const reg = []; responderMercado(W, reg);
    const ws = await conectar(W);
    await W.avancar(2 * 3600000);
    const tipos = new Set(enviados(ws).map(o => o.type));
    assert([...tipos].every(x => x === 'market_catalog' || x === 'market_stats'), 'tipos: ' + [...tipos]);
    const cats = reg.filter(x => x.tipo === 'market_catalog').map(x => x.t);
    assert(cats.length >= 6 && cats.length <= 8, cats.length + ' leituras em 2 h');
    for (let i = 1; i < cats.length; i++) assert(cats[i] - cats[i - 1] >= 15 * 60000, 'intervalo de ' + (cats[i] - cats[i - 1]) / 60000 + ' min');
    assert.strictEqual(reg.filter(x => x.tipo === 'market_stats').length, 1, 'média de 30 d pedida 1× (guardada por 24 h; mana potion só tem preço)');
    const L = logTxt(W);
    assert.strictEqual((L.match(/vale anunciar/g) || []).length, 1, 'alerta repetido: ' + L);
    assert.strictEqual((L.match(/mana potion: barato: 40/g) || []).length, 1, L);
    assert.strictEqual(W.H.RADAR.alertas.naoVistos, 0, 'aba Alertas aberta: o contador zera');
    semXss(W.html(), 'Alertas');
});
t('Radar/Alertas: sem Premium o CONFERIR não lê nada e diz por quê', async () => {
    const W = criarMundo({ ls: comAba('alertas', ALERTAS(false)) });
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: { account: { name: 'T', premiumUntil: null } } });
    await W.avancar(0);
    W.el('rd-al-conferir').click();
    await W.avancar(30000);
    assert.deepStrictEqual(enviados(ws), []);
    assert(/sem Premium/.test(logTxt(W)));
});

t('Radar/Loot e Dia: frames com drops — valor, valor/h, raro dourado 1× no Log, dia acumulado e mantido no F5', async () => {
    const tabComum = TAB.concat([{ name: ITEM_MAL, chance: 200, maxCount: 1, value: 700 }]).map(x => [x.name, x.chance, x.maxCount, x.value, x.currency ? 1 : 0]);
    const W = criarMundo({ ls: comAba('loot', { tb_helper_comum_loot_tab_orc_fortress: JSON.stringify(tabComum) }) });
    await W.avancar(0);
    const ws = await conectar(W);
    ws.emitir({ type: 'hunt_started', data: { huntId: 34, state: { party: party4() } } });
    ws.emitir(frame({ elapsedMs: 1000, xp: 100, xpRaw: 80, killsTotal: 3, lootGold: 50, drops: { 'gold coin': 50 } }));
    ws.emitir(frame({ elapsedMs: 1800000, xp: 50000, xpRaw: 40000, killsTotal: 900, lootGold: 12000, suppliesGold: 3000, drops: { 'gold coin': 9300, 'broken helmet': 1, [ITEM_MAL]: 1 } }));
    ws.emitir(frame({ elapsedMs: 1801000, xp: 50010, xpRaw: 40008, killsTotal: 901, lootGold: 12000, suppliesGold: 3000, drops: { 'gold coin': 9300, 'broken helmet': 1, [ITEM_MAL]: 1 } }));
    await W.avancar(4000);
    const h = W.html();
    semXss(h, 'Loot');
    assert(/loot da sessão \(NPC\)<\/small><b>12\.000</.test(h), 'loot da sessão: ' + (h.match(/loot da sessão.{0,80}/) || [''])[0]);
    assert(/líquido\/h<\/small><b>\+18,0k</.test(h), 'líquido/h: ' + (h.match(/líquido\/h.{0,60}/) || [''])[0]);
    assert(/<span class="rd-raro">broken helmet ×1<\/span>/.test(h), 'raro sem destaque');
    assert(/<span class="rd-raro">gem &lt;img/.test(h), 'raro malicioso não escapado');
    const L = logTxt(W);
    assert.strictEqual((L.match(/drop raro — broken helmet/g) || []).length, 1, L);
    await W.avancar(61000);
    ws.emitir(frame({ elapsedMs: 1900000, xp: 52000, xpRaw: 41000, killsTotal: 950, lootGold: 12600, suppliesGold: 3100, drops: { 'gold coin': 9900, 'broken helmet': 1, [ITEM_MAL]: 1 } }));
    ws.emitir({ type: 'sell_result', data: { goldCredited: 1234, gold: 1, cap: 1 } });
    ws.emitir({ type: 'market_inbox_result', data: { entries: [{ id: 'x1', reason: 'trade_proceeds', currency: 'gold', amount: 900 }, { id: 'x2', reason: 'order_expired', currency: 'gold', amount: 5 }] } });
    ws.emitir({ type: 'market_inbox_result', data: { entries: [{ id: 'x1', reason: 'trade_proceeds', currency: 'gold', amount: 900 }] } });
    ws.emitir({ type: 'ended', data: { summary: { huntId: 34, title: 'Orc Fortress', reason: 'party_death', elapsedSec: 1900, xpPerHour: 1, lootGold: 12600, suppliesGold: 3100, kills: 950 } } });
    await W.avancar(1000);
    const dia = W.H.RADAR.dias[hojeDe(W)];
    assert.deepStrictEqual([dia.xp, dia.loot, dia.sup, dia.kills, dia.mortes, dia.npc, dia.mercado, dia.offline], [52000, 12600, 3100, 950, 1, 1234, 900, 0], JSON.stringify(dia));
    assert.strictEqual(dia.raros.length, 2);
    const W2 = criarMundo({ ls: Object.assign(Object.fromEntries(W.store), { tb_helper_radar_sub: '"dia"' }) });
    await W2.avancar(0);
    const h2 = W2.html();
    semXss(h2, 'Dia');
    assert(/<small>xp<\/small><b>52,0k/.test(h2), 'o dia não voltou do disco: ' + (h2.match(/<small>xp.{0,60}/) || [''])[0]);
    assert(/<small>mortes<\/small><b><span class="tb-ruim">1</.test(h2));
    assert(/Orc Fortress<\/td>/.test(h2) && /vendas no mercado<\/span><span>900/.test(h2));
});
t('Radar/Loot e Dia (2.13.1): recomeçar no mesmo mapa zera a sessão; resumo com a página aberta (analisador zerado no meio) não soma de novo', async () => {
    const W = criarMundo({ ls: comAba('loot') });
    await W.avancar(0);
    const ws = await conectar(W);
    ws.emitir({ type: 'hunt_started', data: { huntId: 34, state: { party: party4() } } });
    ws.emitir(frame({ elapsedMs: 1000, xp: 100, xpRaw: 80, killsTotal: 3, lootGold: 50, drops: { 'gold coin': 50 } }));
    ws.emitir(frame({ elapsedMs: 300000, xp: 9000, xpRaw: 8000, killsTotal: 200, lootGold: 2000, suppliesGold: 500, drops: { 'gold coin': 2000 } }));
    /* o Scan zera o analisador no meio: o resumo do fim é da caçada INTEIRA */
    ws.emitir(frame({ elapsedMs: 1000, xp: 50, xpRaw: 40, killsTotal: 1, lootGold: 10, drops: { 'gold coin': 10 } }));
    ws.emitir(frame({ elapsedMs: 120000, xp: 3000, xpRaw: 2500, killsTotal: 60, lootGold: 700, suppliesGold: 100, drops: { 'gold coin': 700 } }));
    await W.avancar(2000);
    const s1 = W.H.RADAR.lv.sessao;
    assert.strictEqual(s1.loot, 2000 + 690, 'sessão antes: ' + s1.loot); // o 1º frame depois do zerar vira base (os 10 dele ficam fora)
    ws.emitir({ type: 'ended', data: { summary: { huntId: 34, title: { key: 'server.hunt.title.data', params: { name: 'Orc Fortress' } }, reason: 'stop', elapsedSec: 430, xpPerHour: 100000, lootGold: 2700, suppliesGold: 600, kills: { Orc: 260 }, killsTotal: 260 } } });
    await W.avancar(1000);
    const dia = W.H.RADAR.dias[hojeDe(W)];
    assert.strictEqual(dia.offline, 0, 'resumo com a página aberta virou "offline"');
    assert.strictEqual(dia.loot, 2690, 'loot do dia contado duas vezes: ' + dia.loot);
    assert(!Object.keys(dia.mapas).some(k => /object/.test(k)), 'mapa "[object Object]": ' + Object.keys(dia.mapas));
    /* recomeço no MESMO mapa: o analisador do jogo zera e a sessão também */
    ws.emitir({ type: 'hunt_started', data: { huntId: 34, state: { party: party4() } } });
    ws.emitir(frame({ elapsedMs: 1000, xp: 60, xpRaw: 50, killsTotal: 2, lootGold: 30, drops: { 'gold coin': 30 } }));
    await W.avancar(2000);
    assert.strictEqual(W.H.RADAR.lv.sessao.loot, 30, 'sessão herdou a caçada anterior: ' + W.H.RADAR.lv.sessao.loot);
    /* F5 no meio (resume) não zera */
    ws.emitir({ type: 'resume', data: { huntId: 34, state: { party: party4() } } });
    ws.emitir(frame({ elapsedMs: 5000, xp: 200, xpRaw: 160, killsTotal: 6, lootGold: 90, drops: { 'gold coin': 90 } }));
    await W.avancar(2000);
    assert.strictEqual(W.H.RADAR.lv.sessao.loot, 90, 'resume zerou a sessão: ' + W.H.RADAR.lv.sessao.loot);
});
t('Radar/Dia: caçada fechada com a página fechada entra pelo resumo (offline); a mesma caçada não conta duas vezes', async () => {
    const W = criarMundo({ ls: comAba('dia') });
    await W.avancar(0);
    const ws = await conectar(W);
    ws.emitir({ type: 'ended', data: { summary: { huntId: 50, title: 'Vampire hell', reason: 'stopped', elapsedSec: 3600, xpPerHour: 40000, lootGold: 9000, suppliesGold: 1000, kills: 800 } } });
    await W.avancar(0);
    const d = W.H.RADAR.dias[hojeDe(W)];
    assert.deepStrictEqual([Math.round(d.xp), d.loot, d.offline, d.mortes], [40000, 9000, 1, 0]);
});

rodar();

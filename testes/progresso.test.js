// Roda: node testes/progresso.test.js
// Aba Progresso (2.11). Parte 1: extrai o trecho puro (@@PROGRESSO) e testa cada cálculo
// com fixtures sintéticas + recortes dos catálogos públicos (testes/fixtures/progresso.json,
// GET sem login em 29/09/2026). Parte 2: carrega o userscript INTEIRO num vm com stubs de
// DOM/WebSocket, manda frames falsos pelo socket e confere a aba desenhada e o aviso no Log.
const fs = require('fs'), path = require('path'), assert = require('assert'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'tibidle-helper.user.js'), 'utf8');
const ini = src.indexOf('/* @@PROGRESSO-INICIO'), fim = src.indexOf('/* @@PROGRESSO-FIM */');
assert(ini > 0 && fim > ini, 'marcadores @@PROGRESSO não encontrados');
const M = new Function(src.slice(ini, fim) + `
    return { PG_WIKI, PG_REFINO, PG_IMBU_BASES, pgNum, pgHoras, pgLerChaves, pgTierDaMochila, pgAvisoChaves, pgChaveDaHunt, pgInfoChave,
             pgResumoElite, pgFatorLootPrey, pgChavesHora, pgLinhasChaves, pgAbatesPorHunt, pgMesclarBestiario, pgEstagio, pgBonusConta,
             pgLinhasBestiario, pgTaxas, pgPlanoOffline, pgXpFalta, pgTipoPrey, pgLerPrey, pgTravasPrey, pgSugestaoPrey, pgRefino,
             pgBasesImbu, pgNomesImbu, pgMateriaisImbu, pgProtecao, pgPlanoBestiario, pgFilaBestiario, PG_ABATES_POR_LURE, pgAlertaPrey, pgAvisoInvasao };`)();

const FX = JSON.parse(fs.readFileSync(path.join(raiz, 'testes/fixtures/progresso.json'), 'utf8'));
const hunt = (t) => FX.hunts.find(h => h.title === t);

let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };

t('pgAlertaPrey: os 4 com DANO → travar; buff vencendo sem trava avisa; nada a dizer = null', () => {
    /* TV de Souza (04/10): rerrolar os grátis até os 4 terem DANO, travar os 4 e caçar o mapa do item por horas */
    const b = (tipo, locked, msLeft) => ({ tipo, tier: 8, pct: 32, locked, msLeft });
    const quatro = { buffs: { KNIGHT: b('dano', true, 7e6), PALADIN: b('dano', true, 7e6), SORCERER: b('dano', false, 7e6), DRUID: b('dano', true, 7e6) }, wildcards: 12 };
    const a = M.pgAlertaPrey(quatro);
    assert(a && a.nivel === 'ok' && /4 com DANO/.test(a.texto) && /Feiticeiro/.test(a.texto), 'os 4 com dano e um sem trava: ' + JSON.stringify(a));
    const vencendo = { buffs: { KNIGHT: b('xp', false, 20 * 60000), PALADIN: b('loot', true, 7e6), SORCERER: null, DRUID: b('xp', true, 7e6) }, wildcards: 3 };
    const v = M.pgAlertaPrey(vencendo);
    assert(v && v.nivel === 'aviso' && /Cavaleiro/.test(v.texto) && /20 min/.test(v.texto), 'buff vencendo sem trava: ' + JSON.stringify(v));
    assert.strictEqual(M.pgAlertaPrey({ buffs: { KNIGHT: b('xp', true, 7e6) }, wildcards: 3 }), null, 'sem motivo → null');
    assert.strictEqual(M.pgAlertaPrey(null), null);
});
t('pgAvisoInvasao: estado do ícone do jogo → lembrete só leitura', () => {
    /* ícone da cidade: [data-testid=invasao-icone][data-estado] + invasao-icone-topo (data-topo: nao | inscrito | convite) + contagem */
    const nao = M.pgAvisoInvasao({ estado: 'abertas', tom: 'nao', contagem: '02:31:05' });
    assert(nao && nao.nivel === 'aviso' && /não se inscreveu/.test(nao.texto) && /02:31:05/.test(nao.texto), JSON.stringify(nao));
    assert.strictEqual(M.pgAvisoInvasao({ estado: 'preparando', tom: 'nao', contagem: '' }).nivel, 'aviso', 'preparando sem inscrição ainda dá para entrar');
    const sim = M.pgAvisoInvasao({ estado: 'inscrito', tom: 'inscrito', contagem: '02:31:05' });
    assert(sim && sim.nivel === 'ok' && /inscrito/i.test(sim.texto), JSON.stringify(sim));
    assert.strictEqual(M.pgAvisoInvasao({ estado: 'encerrada', tom: 'convite', contagem: '14h 31m' }).nivel, 'info');
    assert.strictEqual(M.pgAvisoInvasao({ estado: 'sem_invasao' }).nivel, 'info');
    assert.strictEqual(M.pgAvisoInvasao(null), null, 'ícone não lido (fora da cidade) → null');
});
const perto = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg || ''} esperado ~${b}, veio ${a}`);
const H = 3600000;

// ---- 6. completar o bestiário (2.11.10) -------------------------------------
const hb = (id, titulo, lv, bonus, stages, lure, extra) => Object.assign({ id, title: titulo, levelMin: lv, levelMax: 0, lureTiers: [{ min: lure, max: lure }],
    bestiary: { bonus, stages: stages.map(([kills, value]) => ({ kills, value })) } }, extra || {});
const PESOS_BEST = { manaRegen: 9.3, hpRegen: 5.1, maxHealth: 0.07, maxMana: 0.004, capacity: 0.004, magicLevel: 2.6, armor: 1.2, shielding: 0.9 };
t('bestiário/completar: regen. de mana (Goblins, 0 abates, lure 4) vale até o +3; mana máx. não vale', () => {
    const hs = [hb(125, 'Goblins Femor Hills', 15, 'manaRegen', [[1000, 1], [2000, 2], [4000, 3]], 4),
                hb(140, 'Scarabs Cave', 30, 'maxMana', [[2000, 3], [5000, 6], [10000, 9]], 4)];
    const r = M.pgPlanoBestiario(hs, { 140: 68 }, {}, 67, PESOS_BEST);
    assert.strictEqual(r[0].id, 125, 'o que vale vem primeiro');
    const g = r[0];
    assert(g.vale && g.alvo.kills === 4000 && g.alvo.value === 3, JSON.stringify(g.alvo));
    perto(g.alvo.horas, 4000 / (M.PG_ABATES_POR_LURE * 4), 0.01, 'horas pela estimativa 280 × lure');
    perto(g.alvo.ganhoPt, 27.9, 0.01); assert(g.estimado && !g.conhecido, 'contador não lido = 0 e marcado como não lido');
    assert(!r[1].vale && r[1].alvo === null && r[1].ultimo.kills === 10000, 'mana máxima não compensa');
});
t('bestiário/completar: Tarpit (regen. de vida) vai até o III; abates medidos mandam no tempo', () => {
    const tar = hb(28, 'Tarpit Tomb First Floor', 20, 'hpRegen', [[2000, 1], [5000, 2], [10000, 3]], 3);
    const r = M.pgPlanoBestiario([tar], { 28: 337 }, {}, 67, PESOS_BEST)[0];
    assert(r.vale && r.alvo.kills === 10000 && r.alvo.falta === 9663, JSON.stringify(r.alvo));
    const m = M.pgPlanoBestiario([tar], { 28: 337 }, { 28: { abatesH: 400 } }, 67, PESOS_BEST)[0];
    assert(m.alvo.kills === 5000 && !m.estimado, 'com 400 abates/h medidos para no II (o III rende 0,41 pt/h): ' + JSON.stringify(m.alvo));
});
t('bestiário/completar: marco +0 não é passo; completo, nível, levelMax e premium ficam de fora', () => {
    const vamp = hb(50, 'Vampire hell', 50, 'magicLevel', [[2000, 0], [5000, 0], [10000, 1]], 6);
    const r = M.pgPlanoBestiario([vamp], { 50: 1915 }, { 50: { abatesH: 1480 } }, 67, PESOS_BEST)[0];
    assert(r.ultimo.kills === 10000 && r.ultimo.falta === 8085, 'o próximo passo é o +1 dos 10.000');
    const fora = [hb(1, 'Completa', 1, 'hpRegen', [[1000, 1]], 4), hb(2, 'Alta', 80, 'hpRegen', [[1000, 1]], 4),
                  hb(3, 'Teto', 1, 'hpRegen', [[1000, 1]], 4, { levelMax: 50 }), hb(4, 'Premium', 1, 'hpRegen', [[1000, 1]], 4, { premium: true })];
    const ids = M.pgPlanoBestiario(fora, { 1: 1000 }, {}, 67, PESOS_BEST, { premium: false }).map(x => x.id);
    assert.deepStrictEqual(ids, [], 'completa, acima do nível, acima do levelMax e premium sem Premium: ' + ids);
});
t('bestiário/completar: fila respeita a ordem e leva a caçada marcada que "não compensa" até o fim', () => {
    const hs = [hb(125, 'Goblins', 15, 'manaRegen', [[1000, 1], [2000, 2], [4000, 3]], 4), hb(140, 'Scarabs', 30, 'maxMana', [[2000, 3], [5000, 6], [10000, 9]], 4)];
    const l = M.pgPlanoBestiario(hs, {}, {}, 67, PESOS_BEST);
    assert.deepStrictEqual(M.pgFilaBestiario(l, new Set([140, 125])).map(f => [f.id, f.kills, f.value]), [[125, 4000, 3], [140, 10000, 9]]);
});

t('2.11.11 bestiário: marco rápido com ganho < 1 pt não compensa (Dwarf Bridge +9 vida máx ≈ 0,6 pt)', () => {
    const dw = hb(119, 'Dwarf Bridge', 20, 'maxHealth', [[2000, 3], [5000, 6], [10000, 9]], 5);
    const r = M.pgPlanoBestiario([dw], { 119: 9784 }, { 119: { abatesH: 1500 } }, 67, PESOS_BEST)[0];
    assert(r.ptH >= 0.5, 'rápido: passaria só pelo limiar de pt/h (' + r.ptH + ')');
    assert(!r.vale && r.alvo === null, 'ganho de ' + (3 * 0.07) + ' pt não compensa');
});

// ---- 1. chaves ------------------------------------------------------------
t('bestiário: marco que dá +0 não é "próximo" (Vampire hell ao vivo: 2k→0, 5k→0, 10k→+1 ML)', () => {
    const vamp = { bonus: 'magicLevel', stages: [{ kills: 2000, value: 0 }, { kills: 5000, value: 0 }, { kills: 10000, value: 1 }] };
    const e = M.pgEstagio(vamp, 1291);
    assert(e.prox && e.prox.kills === 10000 && e.ganho === 1 && e.falta === 8709, JSON.stringify(e));
    const cyc = { bonus: 'maxHealth', stages: [{ kills: 2000, value: 4 }, { kills: 5000, value: 8 }] };
    assert(M.pgEstagio(cyc, 1326).prox.kills === 2000, 'marco com ganho real continua sendo o próximo');
});
t('keyBag {nome:n} + keyBagUsed/Max (formato do cliente)', () => {
    const kb = M.pgLerChaves({ keyBag: { 'Worgen Key': 2, 'Renegade Orc Key': 3, 'Vazia Key': 0 }, keyBagUsed: 5, keyBagMax: 5, keyBagTierId: 'kb1' });
    assert.deepStrictEqual(kb.chaves, { 'Worgen Key': 2, 'Renegade Orc Key': 3 });
    assert.strictEqual(kb.usadas, 5); assert.strictEqual(kb.max, 5); assert.strictEqual(kb.tierId, 'kb1');
});
t('keyBag defensivo: lista de {name,count}, pares, nomes soltos e número em texto', () => {
    const a = M.pgLerChaves({ keyBag: [{ name: 'A Key', count: '2' }, ['B Key', 1], 'C Key', 'C Key', { nome: 'D Key', qty: 0 }] });
    assert.deepStrictEqual(a.chaves, { 'A Key': 2, 'B Key': 1, 'C Key': 2 });
    assert.strictEqual(a.usadas, 5, 'sem keyBagUsed, usadas = soma');
    assert.strictEqual(a.max, null, 'sem keyBagMax e sem regra, limite desconhecido');
});
t('mensagem sem chave → null; só keyBagMax (comprou a T2) mantém as chaves e troca o limite', () => {
    assert.strictEqual(M.pgLerChaves({ state: {}, analyzer: {} }), null);
    assert.strictEqual(M.pgLerChaves(null), null);
    const antes = M.pgLerChaves({ keyBag: { 'Worgen Key': 5 }, keyBagUsed: 5, keyBagMax: 5 });
    const depois = M.pgLerChaves({ keyBagMax: 10, keyBagTierId: 'kb2' }, antes);
    assert.deepStrictEqual(depois.chaves, { 'Worgen Key': 5 }); assert.strictEqual(depois.usadas, 5); assert.strictEqual(depois.max, 10);
});
t('limite pelo tier de meta.rules.keyBags quando keyBagMax não vem', () => {
    const regras = [{ id: 'kb1', name: 'Key Backpack T1', maxKeys: 5 }, { id: 'kb2', name: 'Key Backpack T2', maxKeys: 10 }];
    const kb = M.pgLerChaves({ keyBag: { 'Worgen Key': 1 }, keyBagTierId: 'kb2' }, null, regras);
    assert.strictEqual(kb.max, 10); assert.strictEqual(kb.tierNome, 'Key Backpack T2');
});
t('chaves cheias → aviso de chave PERDIDA (e oferta da T2 só na T1)', () => {
    const a = M.pgAvisoChaves({ usadas: 5, max: 5 });
    assert.strictEqual(a.nivel, 'cheia'); assert(/PERDIDA/.test(a.texto) && /T2/.test(a.texto), a.texto);
    const b = M.pgAvisoChaves({ usadas: 10, max: 10 });
    assert.strictEqual(b.nivel, 'cheia'); assert(!/compre/.test(b.texto), 'na T2 não oferece a T2');
    assert.strictEqual(M.pgAvisoChaves({ usadas: 4, max: 5 }).nivel, 'quase');
    assert.strictEqual(M.pgAvisoChaves({ usadas: 2, max: 10 }).nivel, 'ok');
    assert.strictEqual(M.pgAvisoChaves({ usadas: 5, max: null }).nivel, 'talvez', 'sem limite: 5 chaves = talvez cheia (T1)');
    assert.strictEqual(M.pgAvisoChaves(null), null);
});
t('chave → Elite e caçada pelo catálogo (sem diferenciar maiúscula: "gordzila key")', () => {
    const i = M.pgInfoChave('Gordzila Key', FX.bosses, FX.hunts);
    assert.strictEqual(i.elite.name, 'Gordzila'); assert.strictEqual(i.hunt.title, 'Salamander Cave'); perto(i.chance, 0.0015, 1e-9);
    const c = M.pgChaveDaHunt(hunt('Orc Fortress'), FX.bosses);
    assert.strictEqual(c.nome, 'Renegade Orc Key'); assert.strictEqual(c.elite.name, 'Renegade Orc'); perto(c.chance, 0.00092, 1e-9);
    assert.strictEqual(M.pgInfoChave('Chave Inexistente', FX.bosses, FX.hunts).elite, null);
});
t('resumo do Elite: fraco/resiste/imune pelo `percent` do catálogo e materiais de imbuement no loot', () => {
    const mats = new Set(FX.imbuements.imbuements.flatMap(x => x.items.map(i => i.name.toLowerCase())));
    const e = M.pgResumoElite(FX.bosses.find(b => b.name === 'Renegade Orc'), mats);
    assert.strictEqual(e.hp, 8500);
    assert.deepStrictEqual(e.imune, ['fogo']);
    assert(e.fraco.some(x => x.el === 'terra' && x.pct === -10), JSON.stringify(e.fraco));
    assert(e.resiste.some(x => x.el === 'energia'), JSON.stringify(e.resiste));
    assert.strictEqual(e.top[0].nome, 'spellbook of warding');
    assert(e.materiais.includes('gloom wolf fur'), 'gloom wolf fur é material do Lich Shroud');
    assert(e.fragmentos.includes('refine fragment t1'));
});
t('chaves/h = abates/h × chance × LOOT da prey; a caçada atual vem primeiro', () => {
    perto(M.pgChavesHora(1450, 0.00092), 1.334, 0.001);
    const prey = M.pgLerPrey({ wildcards: 3, preyBuffs: { KNIGHT: { bonus: { type: 'loot', tier: 10, percent: 10 }, msLeft: H, locked: false }, PALADIN: { bonus: { type: 'loot', tier: 5 }, msLeft: H } } });
    perto(M.pgFatorLootPrey(prey), 1.15, 1e-9, 'LOOT ★10 + ★5 = +15%');
    const med = M.pgAbatesPorHunt({ huntId: 34, abatesH: 1450 }, [{ id: 46, abatesH: 900, t: 1 }], []);
    const l = M.pgLinhasChaves(FX.hunts, FX.bosses, med, 1.1, 34);
    assert.strictEqual(l[0].hunt.title, 'Orc Fortress'); assert(l[0].atual);
    perto(l[0].chavesH, 1450 * 0.00092 * 1.1, 1e-9); perto(l[0].cadaH, 1 / (1450 * 0.00092 * 1.1), 1e-9);
    assert.strictEqual(l[1].chave, 'Rhaegal Key');
});
t('abates/h: ao vivo > Scan mais recente > sessões (média ponderada pelo tempo)', () => {
    const r = M.pgAbatesPorHunt({ huntId: 34, abatesH: 1500 },
        [{ id: 34, abatesH: 1000, t: 5 }, { id: 46, abatesH: 800, t: 1 }, { id: 46, abatesH: 900, t: 9 }, { id: 62, abatesH: 700, erro: 'x' }],
        [{ huntId: 62, abatesH: 600, dur: 600 }, { huntId: 62, abatesH: 1200, dur: 1800 }, { huntId: 'boss:X', abatesH: 5, dur: 60 }]);
    assert.deepStrictEqual(r[34], { abatesH: 1500, fonte: 'agora' });
    assert.deepStrictEqual(r[46], { abatesH: 900, fonte: 'Scan' });
    assert.strictEqual(r[62].fonte, 'sessões'); perto(r[62].abatesH, 1050, 1e-9);
});

// ---- 2. bestiário ---------------------------------------------------------
t('marco do bestiário: vale o maior, falta e horas até o próximo com abates/h medidos', () => {
    const of = hunt('Orc Fortress');   // 2.000 → +3 · 5.000 → +6 · 10.000 → +9 (vida máx)
    const e = M.pgEstagio(of.bestiary, 3412);
    assert.strictEqual(e.n, 1); assert.strictEqual(e.valor, 3); assert.strictEqual(e.prox.kills, 5000); assert.strictEqual(e.falta, 1588); assert.strictEqual(e.ganho, 3);
    const rows = M.pgLinhasBestiario(FX.hunts, { 34: 3412, 170: 3900, 46: 10000 }, { 34: { abatesH: 1450, fonte: 'agora' } }, 60);
    const r34 = rows.find(r => r.hunt.id === 34);
    perto(r34.horas, 1588 / 1450, 1e-9, 'horas até o marco II');
    assert.strictEqual(rows[0].hunt.id, 34, 'com horas medidas vem primeiro');
    assert(!rows.some(r => r.hunt.id === 46), 'Dragon Lair com 10.000 = completo, fora da lista');
    assert(!rows.some(r => r.hunt.id === 62), 'Lizard City sem contador conhecido fica fora');
    assert(!M.pgLinhasBestiario(FX.hunts, { 62: 1 }, {}, 60).length, 'nível 60 não vê caçada de nível 80');
    assert.strictEqual(M.pgEstagio(of.bestiary, 12000).completo, true);
});
t('bônus da conta soma caçadas diferentes, não os marcos da mesma', () => {
    const b = M.pgBonusConta(FX.hunts, { 34: 10000, 46: 5000, 170: 1500 });
    assert.strictEqual(b.maxHealth, 9, 'Orc Fortress III = +9 (não 3+6+9)');
    assert.strictEqual(b.capacity, 40, 'Dragon Lair II = +40');
    assert.strictEqual(b.hpRegen, 1, 'Wolves Den I = +1');
});
t('contadores do bestiário: o maior vence (meta + frame), aceita objeto ou lista', () => {
    let c = M.pgMesclarBestiario({}, { 34: 100, 46: '50' });
    c = M.pgMesclarBestiario(c, { 34: 90 });
    c = M.pgMesclarBestiario(c, [{ huntId: 46, kills: 70 }, { id: 62, count: 5 }, null]);
    assert.deepStrictEqual(c, { 34: 100, 46: 70, 62: 5 });
});

// ---- 3. plano offline -----------------------------------------------------
const amostras = (n, passoMin, ouro0, ouroH, oz0, ozH) => Array.from({ length: n }, (_, i) => ({ t: 1e12 + i * passoMin * 60000, ouro: ouro0 + ouroH * i * passoMin / 60, oz: oz0 + ozH * i * passoMin / 60, tot: 2000 }));
t('taxas das amostras: saldo por hora e só as subidas da mochila', () => {
    const a = amostras(41, 0.5, 30000, -20000, 1000, 100);
    const tx = M.pgTaxas(a, H);
    perto(tx.horas, 20 / 60, 1e-9); perto(tx.ouroH, -20000, 1e-6); perto(tx.ozH, 100, 1e-6);
    const venda = [{ t: 1e12, ouro: 0, oz: 100 }, { t: 1e12 + 600000, ouro: 0, oz: 150 }, { t: 1e12 + 1200000, ouro: 0, oz: 20 }, { t: 1e12 + 1800000, ouro: 0, oz: 70 }];
    const v = M.pgTaxas(venda, H);
    perto(v.ozH, 200, 1e-6, 'subidas 50+50 em 0,5 h'); perto(v.ozLiqH, -60, 1e-6);
    assert.strictEqual(M.pgTaxas([{ t: 1, ouro: 1 }], H), null);
});
t('ouro dura / mochila enche / teto de 12 h — com Auto Exit o ouro encerra a caçada', () => {
    const tx = M.pgTaxas(amostras(41, 0.5, 30000, -20000, 1000, 100), H);
    const p = M.pgPlanoOffline({ ouro: 30000, margem: 5000, autoExit: true, autoExitCap: false, taxas: tx, ozLivre: 300, autoSell: false, sessaoMs: 10 * H, xpH: 40000, xpFalta: 100000 });
    perto(p.horasOuro, 25000 / 20000, 1e-6, 'ouro até a margem'); perto(p.horasMochila, 3, 1e-6); perto(p.tetoH, 2, 1e-9);
    assert.strictEqual(p.ouroFonte, 'medido');
    assert.strictEqual(p.primeiro.k, 'ouro'); assert.strictEqual(p.fim.k, 'ouro', 'Auto Exit por ouro encerra');
    perto(p.xpAteFim, 40000 * 1.25, 1e-6); perto(p.horasNivel, 2.5, 1e-9);
});
t('sem Auto Exit: ouro acaba e mochila enche NÃO encerram — quem encerra é o teto de 12 h', () => {
    const tx = M.pgTaxas(amostras(41, 0.5, 30000, -20000, 1000, 100), H);
    const p = M.pgPlanoOffline({ ouro: 30000, margem: 5000, autoExit: false, taxas: tx, ozLivre: 300, sessaoMs: 8 * H });
    perto(p.horasOuro, 1.5, 1e-6, 'sem Auto Exit a margem não conta');
    assert.strictEqual(p.primeiro.k, 'ouro'); assert(/PAUSAM/.test(p.primeiro.texto), p.primeiro.texto);
    assert.strictEqual(p.fim.k, 'teto'); perto(p.fim.h, 4, 1e-9);
    const cap = M.pgPlanoOffline({ ouro: 30000, autoExit: true, autoExitCap: true, taxas: tx, ozLivre: 50, sessaoMs: 0 });
    assert.strictEqual(cap.fim.k, 'mochila', 'Auto Exit com mochila cheia encerra');
});
t('saldo subindo → ouro "não acaba"; janela < 10 min → pior caso pelo suprimento do analisador', () => {
    const sobe = M.pgPlanoOffline({ ouro: 1000, taxas: M.pgTaxas(amostras(41, 0.5, 1000, 5000, 0, 0), H), ozLivre: 100 });
    assert.strictEqual(sobe.horasOuro, Infinity); assert.strictEqual(sobe.horasMochila, Infinity);
    const curto = M.pgPlanoOffline({ ouro: 12000, supH: 6000, taxas: M.pgTaxas(amostras(5, 0.5, 12000, -1000, 0, 0), H) });
    assert.strictEqual(curto.ouroFonte, 'suprimento'); perto(curto.horasOuro, 2, 1e-9);
    const autoSell = M.pgPlanoOffline({ ouro: 1, autoSell: true, taxas: M.pgTaxas(amostras(11, 0.5, 1, 0, 0, 500), H), ozLivre: 100 });
    assert.strictEqual(autoSell.horasMochila, null, 'com Auto Selling e < 15 min de janela a mochila fica "medindo"');
    assert.strictEqual(M.pgXpFalta({ xp: 1868791, xpNext: 1965000 }), 96209);
    assert.strictEqual(M.pgXpFalta({ xp: 10 }), null);
});

// ---- 4. prey --------------------------------------------------------------
const META_PREY = {
    wildcards: 10, preyHuntRollFreeDay: true,
    preyHunt: { huntId: 34, title: 'Orc Fortress', levelMin: 35, monsters: ['Orc'], msLeft: H, locked: true },
    preyBuffs: {
        KNIGHT: { bonus: { type: 'defense', bonusType: 'defense', label: 'Defesa', tier: 10, percent: 40 }, huntId: 34, msLeft: H, locked: true, tierFloor: 10, rollFreeDay: false },
        PALADIN: { bonus: { type: 'xp', bonusType: 'xp', label: 'EXP', tier: 7, percent: 7 }, huntId: 34, msLeft: H, locked: true, tierFloor: 7, rollFreeDay: true },
        SORCERER: { bonus: { type: 'damage', tier: 9, percent: 0.36 }, huntId: 34, msLeft: H, locked: true, tierFloor: 9, rollFreeDay: false },
        DRUID: { bonus: null, huntId: null, msLeft: 0, locked: false, tierFloor: 4, rollFreeDay: true }
    },
    preyAvisos: [{ target: 'hunt', kind: 'renovado', vezes: 2 }]
};
t('prey: lê caçada, colunas, tipo e % pela tabela da wiki (DANO ★9 = +36%)', () => {
    const p = M.pgLerPrey(META_PREY);
    assert.strictEqual(p.wildcards, 10); assert.strictEqual(p.cacada.titulo, 'Orc Fortress'); assert(p.cacada.locked);
    assert.deepStrictEqual([p.buffs.KNIGHT.tipo, p.buffs.KNIGHT.pct], ['defesa', 40]);
    assert.deepStrictEqual([p.buffs.PALADIN.tipo, p.buffs.PALADIN.pct], ['xp', 7]);
    assert.deepStrictEqual([p.buffs.SORCERER.tipo, p.buffs.SORCERER.pct], ['dano', 36]);
    assert.strictEqual(p.buffs.DRUID.tipo, null); assert.strictEqual(p.buffs.DRUID.piso, 4);
    assert.strictEqual(M.pgLerPrey({ blessings: [] }), null, 'meta sem prey → null');
    assert.strictEqual(M.pgTipoPrey({ label: 'Experiência' }), 'xp');
    const lista = M.pgLerPrey({ preyBuffs: [{ vocation: 'DRUID', bonus: { type: 'LOOT', tier: 3 }, msLeft: 1 }] });
    assert.strictEqual(lista.buffs.DRUID.pct, 3, 'aceita lista com vocation');
});
t('travas da prey: 4 seções × 1 wildcard a cada 2 h; zerou → todas desligam', () => {
    const tv = M.pgTravasPrey(M.pgLerPrey(META_PREY));   // caçada + 3 colunas travadas, 1 h cada, 10 wildcards
    assert.strictEqual(tv.travadas, 4);
    // 1 h: 4 renovações (6 sobram) · 3 h: 4 (2 sobram) · 5 h: caçada e Cavaleiro renovam → zerou
    assert.strictEqual(tv.renovacoes, 10); perto(tv.horasTravas, 5, 1e-9); perto(tv.horasBonus, 7, 1e-9);
    const pouco = M.pgTravasPrey(M.pgLerPrey(Object.assign({}, META_PREY, { wildcards: 1 })));
    perto(pouco.horasTravas, 1, 1e-9, 'com 1 wildcard a primeira renovação já zera');
    const sem = M.pgTravasPrey(M.pgLerPrey({ wildcards: 5, preyBuffs: { KNIGHT: { bonus: { type: 'xp', tier: 1 }, msLeft: H, locked: false } } }));
    assert.strictEqual(sem.travadas, 0); assert.strictEqual(sem.horasTravas, null);
});
t('sugestão de prey: DEFESA no Cavaleiro, DANO no maior dano; spawn limita → EXP', () => {
    const rz = { porVoc: { KNIGHT: { pct: 30, hpMin: 55 }, PALADIN: { pct: 15 }, SORCERER: { pct: 40 }, DRUID: { pct: 15 } }, ondas: { spawnLimita: false } };
    const s = M.pgSugestaoPrey(rz);
    assert.deepStrictEqual([s.KNIGHT.tipo, s.SORCERER.tipo, s.PALADIN.tipo, s.DRUID.tipo], ['defesa', 'dano', 'xp', 'xp']);
    const sp = M.pgSugestaoPrey(Object.assign({}, rz, { ondas: { spawnLimita: true } }));
    assert.strictEqual(sp.SORCERER.tipo, 'xp'); assert(/spawn/.test(sp.SORCERER.motivo));
    const k = M.pgSugestaoPrey({ porVoc: { KNIGHT: { pct: 50, hpMin: 96 }, DRUID: { pct: 50 } } });
    assert.strictEqual(k.KNIGHT.tipo, 'xp', 'Cavaleiro que quase não apanha'); assert.strictEqual(k.DRUID.tipo, 'dano');
    const nada = M.pgSugestaoPrey(null);
    assert.deepStrictEqual(PGV(nada), ['defesa', 'xp', 'xp', 'xp'], 'sem livro-razão: DEFESA no Cavaleiro e EXP no resto');
});
function PGV(s) { return ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'].map(v => s[v].tipo); }

// ---- 5. forja e imbuement -------------------------------------------------
t('refino +0 → +4: 6,35 gemas T1 esperadas (falha não cai)', () => {
    const r = M.pgRefino(0, 4, 'melhor');
    perto(r.total.T1, 1 / 0.8 + 1 / 0.7 + 1 / 0.6 + 1 / 0.5, 1e-9); assert.strictEqual(r.total.T2, 0); assert.strictEqual(r.total.G, 0);
    perto(r.total.ouro, r.total.T1 * 10000, 1e-6);
});
t('refino +4 → +10 COM Garantia: 48,5 tentativas e ~2,43 M de ouro', () => {
    const r = M.pgRefino(4, 10, 'com');
    const esp = [0.35, 0.25, 0.2, 0.15, 0.1, 0.05].reduce((s, p) => s + 1 / p, 0);
    perto(r.total.T2, esp, 1e-9); perto(r.total.G, esp, 1e-9); perto(r.total.ouro, esp * 50000, 1e-3);
    assert.strictEqual(r.garantiaDesde, 5);
});
t('refino +4 → +10 SEM Garantia: a queda explode (dezenas de milhares de tentativas)', () => {
    const r = M.pgRefino(4, 10, 'sem');
    assert(r.total.tentativas > 50000, 'tentativas ' + r.total.tentativas);
    // +4 → +5 sem Garantia: (1 T2 + 0,65 × 2 T1) / 0,35
    const p5 = r.passos[0];
    perto(p5.c.T2, 1 / 0.35, 1e-9); perto(p5.c.T1, 0.65 * 2 / 0.35, 1e-9); perto(p5.ouro, 137142.857, 0.01);
});
t('refino "onde compensa": sem Garantia no +5 (137k < 143k) e com Garantia do +6 em diante', () => {
    const r = M.pgRefino(4, 10, 'melhor');
    assert.deepStrictEqual(r.passos.map(p => p.usaG), [false, true, true, true, true, true]);
    assert.strictEqual(r.garantiaDesde, 6);
    assert(r.total.ouro <= M.pgRefino(4, 10, 'com').total.ouro && r.total.ouro < M.pgRefino(4, 10, 'sem').total.ouro);
    assert.strictEqual(M.pgRefino(7, 3, 'com').passos.length, 0, 'alvo abaixo do atual = nada');
});
t('imbuement: proteção NÃO vale no Basic/Intricate do Vampirism, VALE no Powerful (materiais a preço de NPC)', () => {
    const bases = M.pgBasesImbu(FX.imbuements);
    assert.deepStrictEqual(bases.map(b => [b.nome, b.taxa, b.protecao, b.chance]), [['Basic', 5000, 10000, 0.9], ['Intricate', 30000, 30000, 0.7], ['Powerful', 200000, 50000, 0.5]]);
    const m1 = M.pgMateriaisImbu(FX.imbuements, 'Vampirism', 1, FX.precos), m2 = M.pgMateriaisImbu(FX.imbuements, 'Vampirism', 2, FX.precos), m3 = M.pgMateriaisImbu(FX.imbuements, 'Vampirism', 3, FX.precos);
    assert.deepStrictEqual([m1.total, m2.total, m3.total], [6875, 8375, 10475], 'o catálogo já traz os materiais do tier anterior');
    const b = M.pgProtecao(bases[0], m1.total), i = M.pgProtecao(bases[1], m2.total), p = M.pgProtecao(bases[2], m3.total);
    perto(b.sem, 13194.44, 0.01); assert.strictEqual(b.com, 21875); assert.strictEqual(b.vale, false);
    perto(i.sem, 54821.43, 0.01); assert.strictEqual(i.com, 68375); assert.strictEqual(i.vale, false);
    perto(p.sem, 420950, 0.01); assert.strictEqual(p.com, 260475); assert.strictEqual(p.vale, true);
});
t('imbuement: limite em que a proteção passa a valer (Basic 85k, Intricate 40k, Powerful sempre)', () => {
    const [b, i, p] = M.PG_IMBU_BASES.map(x => M.pgProtecao(x, 0));
    perto(b.limite, 85000, 1e-6); perto(i.limite, 40000, 1e-6); assert(p.limite < 0 && p.vale);
    assert.strictEqual(M.pgProtecao(M.PG_IMBU_BASES[0], 90000).vale, true, 'Basic com materiais de 90k vale proteger');
    assert.strictEqual(M.pgBasesImbu(null).length, 3, 'sem catálogo usa a wiki');
    assert.deepStrictEqual(M.pgNomesImbu(FX.imbuements), ['Vampirism', 'Strike', 'Lich Shroud']);
    assert.deepStrictEqual(M.pgMateriaisImbu(FX.imbuements, 'Strike', 1, {}).semPreco, ['protective charm']);
});
t('formato de horas', () => {
    assert.deepStrictEqual([0.5, 1, 1.999, 2.5, 50, Infinity, null, 0].map(M.pgHoras), ['30 min', '1h00', '2h00', '2h30', '2,1 dias', 'não acaba', '—', 'agora']);
});

// ---- parte 2: o script inteiro no vm, frames falsos pelo socket -----------
(async () => {
    const store = new Map();
    const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => store.delete(k), key: i => [...store.keys()][i], get length() { return store.size; } };
    const lsProxy = new Proxy(ls, { ownKeys: () => [...store.keys()], getOwnPropertyDescriptor: (o, k) => store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : undefined });
    const html = {};
    const el = (id) => ({ id, style: {}, dataset: {}, scrollTop: 0, classList: { toggle() {}, add() {}, remove() {}, contains: () => true }, children: [],
        set innerHTML(v) { html[id] = v; }, get innerHTML() { return html[id] || ''; }, set textContent(v) { html[id] = v; }, get textContent() { return html[id] || ''; },
        append() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getAttribute: () => null, setAttribute() {}, insertAdjacentElement() {} });
    const gaveta = el('tb-gaveta'), corpo = el('tb-corpo');
    const document = { readyState: 'complete', head: el('head'), body: el('body'), documentElement: el('html'), createElement: (t) => el(t + Math.random()),
        querySelector: (s) => (s === '#tb-gaveta' ? gaveta : s === '#tb-corpo' ? corpo : null), querySelectorAll: () => [], addEventListener() {}, getElementById: () => null };
    class FakeWS { constructor(u) { this.url = u; this.readyState = 1; this.l = {}; } addEventListener(tp, f) { (this.l[tp] = this.l[tp] || []).push(f); } send() { } emit(o) { (this.l.message || []).forEach(f => f({ data: JSON.stringify(o) })); } }
    const cedo = (f, ms) => { if (!(ms > 16)) setImmediate(f); return 0; };        // render agendado (setTimeout 0/rAF) roda; esperas longas não
    const ctx = { window: { WebSocket: FakeWS, addEventListener() {}, innerWidth: 1400, innerHeight: 900, open() {} }, document, localStorage: lsProxy, WebSocket: FakeWS,
        console: { log() {}, warn() {}, error() {} }, fetch: async () => ({ ok: false, status: 599, json: async () => ({}), text: async () => '' }),
        setTimeout: cedo, setInterval: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: (f) => cedo(f, 0),
        navigator: {}, location: { href: 'https://play.tibidle.com/' }, Date, Math, JSON, Promise, Object, Array, Set, Map, RegExp, String, Number, Uint8Array, Error, Proxy, Reflect, Symbol, crypto: {} };
    ctx.globalThis = ctx;
    store.set('tb_helper_era', JSON.stringify('2026-09-wipe'));
    store.set('tb_helper_ui', JSON.stringify({ aba: 'progresso', aberta: true, top: 84, right: 8, oculto: false }));
    vm.createContext(ctx);
    vm.runInContext(src, ctx, { filename: 'tibidle-helper.user.js' });
    const tick = async (k) => { for (let i = 0; i < (k || 20); i++) await new Promise(r => setImmediate(r)); };
    await tick(40);
    const ws = new ctx.window.WebSocket('wss://teste');
    const aba = async (sub, msgs) => { store.set('tb_helper_prog_sub', JSON.stringify(sub)); for (const m of msgs) ws.emit(m); ws.emit({ type: 'welcome', data: { roster: [{ vocation: 'KNIGHT' }] } }); await tick(); return html['tb-corpo'] || ''; };
    const tA = async (nome, fn) => { try { await fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };

    await tA('vm: keyBag cheio pelo socket → aba Chaves avisa e o Log registra UMA vez', async () => {
        const meta = { meta: { wildcards: 4, blessings: [], rules: { keyBags: [{ id: 'kb1', name: 'Key Backpack T1', maxKeys: 5 }] } } };
        const h = await aba('chaves', [{ type: 'meta_state', data: meta }, { type: 'welcome', data: { keyBag: { 'Worgen Key': 3, 'Renegade Orc Key': 2 }, keyBagUsed: 5, keyBagTierId: 'kb1' } }]);
        assert(/id="tb-prog"/.test(h), 'a aba Progresso não desenhou: ' + h.slice(0, 200));
        assert(/mochila de chaves cheia \(5\/5\)/.test(h) && /PERDIDA/.test(h), 'sem o aviso de cheia');
        assert(/Worgen Key/.test(h) && /×3/.test(h), 'lista de chaves ausente');
        ws.emit({ type: 'frame', data: { state: { keyBag: { 'Worgen Key': 3, 'Renegade Orc Key': 2 }, keyBagUsed: 5, keyBagMax: 5 } } });
        const log = JSON.parse(store.get('tb_helper_log') || '[]').filter(l => /chaves cheia/.test(l.msg));
        assert.strictEqual(log.length, 1, 'aviso no Log deveria sair uma vez só, saiu ' + log.length);
        const outra = await aba('offline', []);
        assert(/mochila de chaves cheia \(5\/5\): chave nova será PERDIDA/.test(outra), 'nas outras sub-abas o aviso vem numa linha');
    });
    await tA('vm: nome de chave com HTML é escapado', async () => {
        const h = await aba('chaves', [{ type: 'meta_result', data: { action: 'x', applied: true, gold: 0, goldLocked: 0, keyBag: { '<img src=x onerror=alert(1)> Key': 1 }, keyBagUsed: 1, keyBagMax: 5 } }]);
        assert(!/<img src=x/.test(h) && /&lt;img src=x/.test(h), 'nome de chave não escapado');
    });
    await tA('vm: Prey mostra estado, travas e sugestão; Forja calcula; Offline sem caçada diz "sem dado ainda"', async () => {
        const p = await aba('prey', [{ type: 'meta_result', data: { action: 'prey_lock_set', applied: true, gold: 0, goldLocked: 0, meta: Object.assign({ blessings: [] }, META_PREY) } }]);
        assert(/Wildcards/.test(p) && /Orc Fortress/.test(p) && /DEFESA ★10 \+40%/.test(p), 'estado da prey ausente');
        assert(/as travas desligam em ~5h00/.test(p), 'simulação das travas ausente');
        assert(/Sugestão por coluna/.test(p));
        const f = await aba('forja', []);
        assert(/Refino esperado/.test(f) && /Total esperado/.test(f) && /proteção (VALE|NÃO vale)/.test(f), 'calculadoras ausentes');
        const o = await aba('offline', []);
        assert(/sem dado ainda/.test(o), 'offline sem caçada deveria dizer sem dado');
        const b = await aba('bestiario', []);
        assert(/catálogo de caçadas ainda não carregou|sem dado ainda/.test(b), 'bestiário sem catálogo');
    });
    await tA('vm: frame com dados estranhos não derruba o grampo', async () => {
        for (const d of [null, 5, 'x', { state: 7 }, { state: { keyBag: 'lixo', cap: 3, character: 1 } }, { bestiaryKills: { a: 'b' } }, { meta: { preyBuffs: 'x', huntBestiary: [1, 2] } }])
            ws.emit({ type: 'frame', data: d });
        ws.emit({ type: 'hunt_started', data: { huntId: 34, lure: 1, state: { balance: 'abc', cap: { used: 'x', total: null } } } });
        ws.emit({ type: 'ended', data: { summary: { reason: 'cap_full', title: 'Orc Fortress', elapsedSec: 3600 } } });
        const o = await aba('offline', []);
        assert(/mochila cheia \(Auto Exit\)/.test(o), 'último motivo de fim ausente');
    });
    console.log(`\n${n} testes ok`);
})().catch(e => { console.log('FAIL vm', e && e.stack || e); process.exitCode = 1; });

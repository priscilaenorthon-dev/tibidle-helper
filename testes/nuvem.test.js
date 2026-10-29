// Roda: node testes/nuvem.test.js
// Log na nuvem (2.35.0): extrai @@NUVEM-PURO do userscript e testa fila, montagem do pedido, configuração e a foto do boneco.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const M = new Function(trecho('/* @@NUVEM-PURO-INICIO', '/* @@NUVEM-PURO-FIM */') +
    '\nreturn { nuvemConfigOk, nuvemEnfileirar, nuvemMontar, nuvemFoto, nuvemCapar, nuvemPersonagens, nuvemBatalhaNovo, nuvemBatalhaEvento, nuvemBatalhaVitais, nuvemBatalhaFechar, NUVEM_BAT_MAX_EV, nuvemProto, nuvemResumoCopias, NUVEM_PROTO_GRANDE_CADA_MS, NUVEM_CARGA_CHAVES, NUVEM_MAX_FILA, NUVEM_LOTE, NUVEM_URL_PADRAO, NUVEM_KEY_PADRAO, NUVEM_MSG_MAX };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
const CFG = { on: true, url: M.NUVEM_URL_PADRAO, key: M.NUVEM_KEY_PADRAO, token: 'tok-de-teste-123456', conta: 'Conta Um' };

t('configuração: só vale ligada, com URL do Supabase, chave, token (≥ 16) e conta; URL com barra no fim passa', () => {
    assert(M.nuvemConfigOk(CFG));
    assert(M.nuvemConfigOk(Object.assign({}, CFG, { url: CFG.url + '/' })));
    for (const ruim of [{ on: false }, { token: '' }, { token: 'curto' }, { conta: '  ' }, { url: 'http://x.supabase.co' }, { url: 'https://evil.com' }, { key: 'k' }]) assert(!M.nuvemConfigOk(Object.assign({}, CFG, ruim)), JSON.stringify(ruim));
    assert(!M.nuvemConfigOk(null));
});
t('fila: item sem tipo é ignorado; msg cortada em 2000; teto 600 (o mais velho sai); dados ausentes viram null', () => {
    const f = [];
    M.nuvemEnfileirar(f, { msg: 'sem tipo' }); assert.strictEqual(f.length, 0);
    M.nuvemEnfileirar(f, { t: 5, tipo: 'log', nivel: 'erro', msg: 'x'.repeat(5000) });
    assert.strictEqual(f[0].msg.length, M.NUVEM_MSG_MAX); assert.strictEqual(f[0].t, 5); assert.strictEqual(f[0].dados, null); assert.strictEqual(f[0].nivel, 'erro');
    for (let i = 0; i < 700; i++) M.nuvemEnfileirar(f, { tipo: 'log', msg: 'm' + i });
    assert.strictEqual(f.length, M.NUVEM_MAX_FILA); assert.strictEqual(f[0].msg, 'm' + (700 - M.NUVEM_MAX_FILA));
    const g = M.nuvemEnfileirar([], { tipo: 'resumo', dados: { reason: 'death' } }, 10); assert.deepStrictEqual(g[0].dados, { reason: 'death' }); assert(g[0].t > 0);
});
t('montar: URL da função, cabeçalhos com a chave, corpo com token/conta/versão, lote de 200 e a foto', () => {
    const fila = []; for (let i = 0; i < 350; i++) M.nuvemEnfileirar(fila, { tipo: 'log', msg: 'm' + i });
    const m = M.nuvemMontar(Object.assign({}, CFG, { url: CFG.url + '//' , conta: '  Conta Um  ' }), fila, { nivel: 160 }, '2.35.0');
    assert.strictEqual(m.url, M.NUVEM_URL_PADRAO + '/rest/v1/rpc/tb_log_enviar');
    assert.strictEqual(m.headers.apikey, CFG.key); assert.strictEqual(m.headers.Authorization, 'Bearer ' + CFG.key); assert.strictEqual(m.headers['Content-Type'], 'application/json');
    assert.deepStrictEqual([m.corpo.p_token, m.corpo.p_conta, m.corpo.p_versao, m.n, m.corpo.p_itens.length, m.corpo.p_estado], ['tok-de-teste-123456', 'Conta Um', '2.35.0', M.NUVEM_LOTE, M.NUVEM_LOTE, { nivel: 160 }]);
    assert.strictEqual(fila.length, 350, 'montar não mexe na fila (quem esvazia é o envio que deu certo)');
    assert.strictEqual(M.nuvemMontar(CFG, [], null, '1').corpo.p_estado, null);
});
t('foto do boneco: nível, ouro, caçando, mapa, lure, criaturas, vida/mana dos 4 e o analisador do jogo; sem frame, listas vazias', () => {
    const frame = { lureTier: 3, cap: { pct: 40 }, active: ['Demon', 'Hellhound'], party: [{ voc: 'KNIGHT', hp: 2000, maxHp: 2870, mana: 500, maxMana: 930, supplyUsed: { x: 1 } }, { voc: 'DRUID', hp: 100, maxHp: 1080, mana: 5000, maxMana: 5405, dist: null }],
                    an: { xpPerHour: 1e6, kills: 50, lootGold: 1000, suppliesGold: 300, damageDealt: 9, damageTaken: 8, healingDone: 7, elapsedMs: 60000, drops: {} } };
    const f = M.nuvemFoto({ nivel: 187, ouro: 23800497, emHunt: true, hunt: 'Shadow Nexus', huntId: 222, boss: null, frame, autoHunt: true, scan: false, aba: 'estado', ultimoEnded: { reason: 'death' } });
    assert.deepStrictEqual([f.nivel, f.ouro, f.cacando, f.hunt, f.huntId, f.lure, f.criaturas, f.autoHunt, f.scan, f.aba], [187, 23800497, true, 'Shadow Nexus', 222, 3, ['Demon', 'Hellhound'], true, false, 'estado']);
    assert.deepStrictEqual(f.party[1], { voc: 'DRUID', hp: 100, maxHp: 1080, mana: 5000, maxMana: 5405, dist: null });
    assert(!('supplyUsed' in f.party[0]) && f.analisador.xpH === 1e6 && f.analisador.kills === 50 && !('drops' in f.analisador), 'só o que importa');
    assert.deepStrictEqual(f.ultimoEnded, { reason: 'death' });
    const vazio = M.nuvemFoto({});
    assert.deepStrictEqual([vazio.nivel, vazio.ouro, vazio.cacando, vazio.party, vazio.criaturas, vazio.analisador, vazio.lure], [null, null, false, [], [], null, null]);
});
t('carga: bloco que cabe passa inteiro; lista grande fica com a cauda; objeto grande com as últimas chaves; as chaves da carga incluem sessões, Radar, mortes, dano por mapa, magias, Auto Hunt e Log', () => {
    assert.deepStrictEqual(M.nuvemCapar([1, 2, 3], 100), { dados: [1, 2, 3], cortado: false });
    const lista = Array.from({ length: 1000 }, (_, i) => ({ i, x: 'y'.repeat(50) }));
    const c = M.nuvemCapar(lista, 5000);
    assert(c.cortado && c.dados.length < 100 && c.dados[c.dados.length - 1].i === 999 && JSON.stringify(c.dados).length <= 5000, 'cauda: ' + c.dados.length);
    const obj = {}; for (let d = 1; d <= 60; d++) obj['2026-09-' + String(d).padStart(2, '0')] = { xp: 'z'.repeat(200) };
    const o = M.nuvemCapar(obj, 3000);
    const ks = Object.keys(o.dados);
    assert(o.cortado && ks.length < 15 && ks[ks.length - 1] === '2026-09-60' && JSON.stringify(o.dados).length <= 3000, 'últimas chaves: ' + ks.join(','));
    assert.deepStrictEqual(M.nuvemCapar('x'.repeat(50), 10), { dados: 'x'.repeat(10), cortado: true });
    for (const k of ['sessoes', 'radar_dias', 'radar_mortes', 'dano_mapa', 'danos_DRUID', 'auto_hunt', 'skills_vistas', 'equip_depot', 'scan_resultados', 'ciclos_hist', 'prog_bestiario', 'pch_compras', 'log']) assert(M.NUVEM_CARGA_CHAVES.includes(k), k);
    const pj = M.nuvemPersonagens({ conta: { id: 1, nome: 'A' }, nivel: 187, rosterFull: [{ vocation: 'knight', equipment: { legs: { name: 'zaoan legs', forja: { raridade: 2 } } } }], sk: { KNIGHT: { melee: 90 } }, legado: { KNIGHT: 3 }, depot: null });
    assert.deepStrictEqual(Object.keys(pj).sort(), ['conta', 'legado', 'nivel', 'roster', 'skills', 't'].sort(), 'só o que existe: ' + Object.keys(pj));
    assert.strictEqual(pj.roster[0].equipment.legs.forja.raridade, 2, 'a forja de cada peça vai junto');
    assert.strictEqual(M.nuvemPersonagens({ roster: [1] }).roster[0], 1, 'sem rosterFull cai no roster');
});
t('batalha: eventos crus compactados (kind, who, amount, hits, casas contadas), vitais com mínimo e fim por personagem e poções bebidas; teto de 3000 eventos; pacote fecha com tipo "batalha"', () => {
    const B = M.nuvemBatalhaNovo(1000, 222);
    M.nuvemBatalhaEvento(B, { kind: 'cast', who: 2, name: 'Energy Wave', rune: false, hits: [{ id: 1, amount: 200, hp: 1500, extra: 'x' }], cells: [[0, 1], [0, 2]], config: { grande: 1 } }, 1500);
    M.nuvemBatalhaEvento(B, { kind: 'mhit', id: 1, amount: 80, hp: 100 }, 2000);
    M.nuvemBatalhaEvento(B, { kind: 'mcast', id: 1, type: 'COMBAT_FIREDAMAGE', atk: 'fireball', hits: [{ who: 2, amount: 300 }], cells: [[1, 0]] }, 2500);
    M.nuvemBatalhaEvento(B, { kind: 'death', who: 3, reason: 'x' }, 3000);
    M.nuvemBatalhaEvento(B, { kind: 'spawn', id: 9, name: 'Angry Demon', maxHp: 8200 }, 3100);
    M.nuvemBatalhaEvento(B, null, 3000); M.nuvemBatalhaEvento(B, { sem: 'kind' }, 3000);
    assert.strictEqual(B.n, 5); assert.deepStrictEqual(B.nomes, { 9: 'Angry Demon' }, 'id → nome');
    assert.deepStrictEqual(B.eventos[0], { k: 'cast', dt: 500, who: 2, name: 'Energy Wave', rune: false, hits: [{ id: 1, amount: 200, hp: 1500 }], cells: 2 });
    assert.deepStrictEqual(B.eventos[2], { k: 'mcast', dt: 1500, id: 1, type: 'COMBAT_FIREDAMAGE', atk: 'fireball', hits: [{ who: 2, amount: 300 }], cells: 1 });
    assert.deepStrictEqual(B.eventos[3], { k: 'death', dt: 2000, who: 3, reason: 'x' });
    M.nuvemBatalhaVitais(B, [{ vocation: 'knight', hp: 2000, maxHp: 2870, mana: 500, maxMana: 930, supplyUsed: { 'ultimate health potion': 2 }, suppliesGold: 900 }, { vocation: 'druid', hp: 100, maxHp: 1080, mana: 5000 }]);
    M.nuvemBatalhaVitais(B, [{ vocation: 'knight', hp: 1200, mana: 700, supplyUsed: { 'ultimate health potion': 3 } }, { vocation: 'druid', hp: 900, mana: 4000 }]);
    assert.deepStrictEqual(B.vitais.KNIGHT, { hpMin: 1200, hpFim: 1200, maxHp: 2870, manaMin: 500, manaFim: 700, maxMana: 930, supplyUsed: { 'ultimate health potion': 3 }, suppliesGold: 900 });
    assert.deepStrictEqual([B.vitais.DRUID.hpMin, B.vitais.DRUID.hpFim, B.vitais.DRUID.manaMin], [100, 900, 4000]);
    const it = M.nuvemBatalhaFechar(B, 61000);
    assert(it.tipo === 'batalha' && it.t === 1000 && it.nivel === 'info' && /5 eventos em 60 s/.test(it.msg) && it.dados.huntId === 222 && it.dados.eventos.length === 5 && it.dados.vitais.KNIGHT.hpMin === 1200 && it.dados.nEventos === 5 && it.dados.nomes[9] === 'Angry Demon', JSON.stringify(it).slice(0, 300));
    assert.strictEqual(M.nuvemBatalhaFechar(M.nuvemBatalhaNovo(1, null), 2), null, 'pacote vazio não vira item');
    const G = M.nuvemBatalhaNovo(0, 1); for (let i = 0; i < NUVEM_BAT_MAX_EV_MAIS(M); i++) M.nuvemBatalhaEvento(G, { kind: 'hit', amount: 1 }, i);
    const g = M.nuvemBatalhaFechar(G, 60000);
    assert(G.cortado && G.eventos.length === M.NUVEM_BAT_MAX_EV && g.nivel === 'av' && /cortado/.test(g.msg), 'teto: ' + G.eventos.length);
});
t('mercado/comandos (2.35.2): mensagens de mercado e venda que chegam e comandos que saem viram itens; frame e pong não; leitura grande crua 1× por 30 min e depois resumo por item; erro vira nível av', () => {
    const V = {};
    const cria = M.nuvemProto({ type: 'market_create_result', data: { entry: { id: 9, itemName: 'crystal ring', unitPrice: 1200 } } }, 'in', 1000, V);
    assert(cria && cria.tipo === 'mercado' && cria.msg === '← market_create_result' && cria.dados.entry.unitPrice === 1200 && cria.nivel === 'info', JSON.stringify(cria));
    const venda = M.nuvemProto({ type: 'sell_result', data: { goldCredited: 5400, entries: [{ name: 'gold ingot', count: 2 }] } }, 'in', 1000, V);
    assert(venda && venda.tipo === 'mercado' && venda.dados.goldCredited === 5400, JSON.stringify(venda));
    const exec = M.nuvemProto({ type: 'market_execute', data: { orderId: 'c1', quantity: 1, requestId: 'r' } }, 'out', 1000, V);
    assert(exec && exec.tipo === 'mercado' && exec.msg === '→ market_execute' && exec.dados.orderId === 'c1', JSON.stringify(exec));
    const start = M.nuvemProto({ type: 'start_hunt', data: { huntId: 222, lure: 3 } }, 'out', 1000, V);
    assert(start && start.tipo === 'comando' && start.msg === '→ start_hunt' && start.dados.huntId === 222, JSON.stringify(start));
    assert.strictEqual(M.nuvemProto({ type: 'frame', data: { events: [] } }, 'in', 1000, V), null);
    assert.strictEqual(M.nuvemProto({ type: 'pong' }, 'in', 1000, V), null);
    assert.strictEqual(M.nuvemProto({ type: 'start_hunt', data: {} }, 'in', 1000, V), null, 'start_hunt só faz sentido saindo');
    assert.strictEqual(M.nuvemProto({ type: 'ping' }, 'out', 1000, V), null);
    const copias = Array.from({ length: 30 }, (_, i) => ({ orderId: i, unitPrice: 100 + i * 10, sellerName: 'x', instance: { name: i % 2 ? 'crystal ring' : 'steel boots', forja: { raridade: 1 } } }));
    const r1 = M.nuvemProto({ type: 'market_copies_result', data: { category: 'aneis', copies: copias } }, 'in', 5000, V);
    assert(r1.msg === '← market_copies_result aneis' && Array.isArray(r1.dados.copies) && r1.dados.copies.length === 30, 'a primeira leitura vai crua');
    const r2 = M.nuvemProto({ type: 'market_copies_result', data: { category: 'aneis', copies: copias } }, 'in', 5000 + 60000, V);
    assert(r2.msg === '← market_copies_result aneis (resumo)' && r2.dados.resumido && r2.dados.n === 30 && r2.dados.porItem['crystal ring'].n === 15 && r2.dados.porItem['crystal ring'].min === 110 && r2.dados.porItem['steel boots'].max === 380, JSON.stringify(r2.dados.porItem));
    const r3 = M.nuvemProto({ type: 'market_copies_result', data: { category: 'botas', copies: copias } }, 'in', 5000 + 60000, V);
    assert(Array.isArray(r3.dados.copies), 'outra categoria: crua');
    const r4 = M.nuvemProto({ type: 'market_copies_result', data: { category: 'aneis', copies: copias } }, 'in', 5000 + M.NUVEM_PROTO_GRANDE_CADA_MS + 1, V);
    assert(Array.isArray(r4.dados.copies), 'passados 30 min: crua de novo');
    const err = M.nuvemProto({ type: 'market_cancel_result', data: { ok: false, error: 'not_found' } }, 'in', 1, V);
    assert(err.nivel === 'av' && err.dados.error === 'not_found');
    assert.deepStrictEqual(M.nuvemResumoCopias([{ itemName: 'a', unitPrice: 5 }, { itemName: 'a', price: 7 }, { name: 'b' }]), { a: { n: 2, min: 5, max: 7, media: 6 }, b: { n: 1, min: null, max: null, media: null } });
});
function NUVEM_BAT_MAX_EV_MAIS(M) { return M.NUVEM_BAT_MAX_EV + 10; }
console.log(`\n${n} testes ok`);

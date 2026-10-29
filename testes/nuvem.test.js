// Roda: node testes/nuvem.test.js
// Log na nuvem (2.35.0): extrai @@NUVEM-PURO do userscript e testa fila, montagem do pedido, configuração e a foto do boneco.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const M = new Function(trecho('/* @@NUVEM-PURO-INICIO', '/* @@NUVEM-PURO-FIM */') +
    '\nreturn { nuvemConfigOk, nuvemEnfileirar, nuvemMontar, nuvemFoto, nuvemCapar, NUVEM_CARGA_CHAVES, NUVEM_MAX_FILA, NUVEM_LOTE, NUVEM_URL_PADRAO, NUVEM_KEY_PADRAO, NUVEM_MSG_MAX };')();
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
    for (const k of ['sessoes', 'radar_dias', 'radar_mortes', 'dano_mapa', 'danos_DRUID', 'ah', 'log']) assert(M.NUVEM_CARGA_CHAVES.includes(k), k);
});
console.log(`\n${n} testes ok`);

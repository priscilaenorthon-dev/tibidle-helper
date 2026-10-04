// Roda: node testes/fumaca.test.js
// Teste de FUMAÇA: carrega o userscript INTEIRO num vm (node) com um DOM falso
// mínimo, um WebSocket falso, localStorage com cota e um relógio falso
// (setTimeout/setInterval/Date controlados). Nada de rede: fetch responde de
// uma tabela de rotas (catálogos das fixtures). Confere o que a ÁREA B da 2.11
// mudou: grampo do socket, estado pelo welcome/frame, perfis, segredos, log
// escapado, boss 800, analisador sem clique, sessão com a0, gaveta, catálogos.
// Dois trechos também rodam sozinhos pelos marcadores @@ARMAZEM e @@PERFIS.
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');
const SRC = fs.readFileSync(process.argv[2] || path.join(raiz, 'tibidle-helper.user.js'), 'utf8');
const le = (p) => JSON.parse(fs.readFileSync(path.join(raiz, p), 'utf8'));
const SPELLS = le('testes/fixtures/spells.json').magias, POTIONS = le('testes/fixtures/potions.json').pocoes;
// objetos do vm vêm de outro "realm": compara pelo JSON
const igual = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
const trecho = (a, b) => { const i = SRC.indexOf(a), f = SRC.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return SRC.slice(i, f); };

const HUNTS = [
    { id: 34, title: 'Orc Fortress', levelMin: 40, island: 'tibidle_island', lureTiers: [{ min: 1, max: 5 }, { min: 6, max: 7 }],
      monsters: [{ name: 'Orc Berserker', health: 210, experience: 195, weight: 1, elements: [] }, { name: 'Orc Leader', health: 450, experience: 240, weight: 1, elements: [] }] },
    { id: 32, title: 'Elfs Shadowthorn', levelMin: 30, island: 'tibidle_island', lureTiers: [{ min: 1, max: 3 }, { min: 4, max: 4 }, { min: 5, max: 5 }],
      monsters: [{ name: 'Elf Arcanist', health: 220, experience: 175, weight: 1, elements: [] }] }
];
const ROTAS_OK = { '/hunts/select': HUNTS, '/spells': SPELLS, '/potions': POTIONS, '/buy-prices': { 'great fireball rune': 32 }, '/bosses/select': [{ name: 'Renegade Orc', health: 3000 }] };
const d62 = (min, max) => ({ min, max, nivel: 62 });
const DANOS = {
    KNIGHT: { 'Lesser Front Sweep': d62(40, 70), 'Brutal Strike': d62(60, 110), 'Whirlwind Throw': d62(50, 90), 'Groundshaker': d62(50, 90), 'Berserk': d62(60, 110) },
    PALADIN: { 'Ethereal Spear': d62(40, 70), 'Divine Missile': d62(50, 80), 'Divine Caldera': d62(45, 75), 'great fireball rune': d62(27, 49) },
    SORCERER: { 'Energy Wave': d62(70, 110), 'Great Fire Wave': d62(55, 85), 'Fire Wave': d62(28, 42), 'Energy Strike': d62(50, 70), 'Flame Strike': d62(50, 70) },
    DRUID: { 'Ice Wave': d62(28, 42), 'Strong Ice Wave': d62(70, 110), 'Terra Wave': d62(60, 90), 'Ice Strike': d62(50, 70), 'Terra Strike': d62(50, 70) }
};

/* ------------------------------------------------------------------ mundo */
function criarMundo(opts) {
    opts = opts || {};
    let AGORA = 1759150000000;
    const porId = new Map(), porTestid = new Map(), fila = [], errosTimer = [], chamadas = [], avisos = [];
    let seq = 0;
    class El {
        constructor(tag) {
            this.tagName = String(tag || 'div').toUpperCase(); this._id = ''; this.style = {}; this.dataset = {}; this.attrs = {};
            this.children = []; this.cliques = 0; this._html = ''; this.sets = 0; this.textContent = ''; this.isConnected = true;
            this.disabled = false; this.value = ''; this.className = ''; this.scrollTop = 0; this.open = false;
            const cls = new Set();
            this.classList = { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)),
                toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : !!f; if (on) cls.add(c); else cls.delete(c); return on; }, contains: (c) => cls.has(c) };
        }
        get id() { return this._id; }
        set id(v) { this._id = v; porId.set(v, this); }
        get innerHTML() { return this._html; }
        set innerHTML(v) {
            this._html = String(v); this.sets++;
            for (const m of this._html.matchAll(/\bid="([^"]+)"/g)) { const e = new El('div'); e._id = m[1]; porId.set(m[1], e); }
        }
        get offsetWidth() { return 44; } get offsetHeight() { return 60; } get innerText() { return this.textContent; }
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } setAttribute(k, v) { this.attrs[k] = String(v); }
        append() { } appendChild(c) { return c; } insertAdjacentElement() { } remove() { } focus() { } select() { }
        addEventListener() { } removeEventListener() { } dispatchEvent() { return true; }
        click() { this.cliques++; if (typeof this.onclick === 'function') this.onclick({ target: this }); }
        closest() { return null; } querySelector(s) { return consulta(s); } querySelectorAll() { return []; }
        getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10 }; }
    }
    const consulta = (sel) => {
        let m = /^#([\w-]+)$/.exec(sel); if (m) return porId.get(m[1]) || null;
        m = /^\[data-testid="([^"]+)"\]$/.exec(sel); if (m) return porTestid.get(m[1]) || null;
        return null;
    };
    const plantar = (testid, texto) => { const e = new El('div'); e.attrs['data-testid'] = testid; e.textContent = texto || ''; porTestid.set(testid, e); return e; };
    const document = { readyState: 'complete', head: new El('head'), body: new El('body'), documentElement: new El('html'),
        createElement: (t) => new El(t), querySelector: consulta, querySelectorAll: () => [], addEventListener() { }, getElementById: (id) => porId.get(id) || null };

    // localStorage com cota (para o "sem espaço")
    const store = new Map(Object.entries(opts.ls || {}));
    const cota = { max: opts.cota || Infinity };
    const tamanho = () => { let n = 0; for (const [k, v] of store) n += k.length + v.length; return n; };
    const ls = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => {
            v = String(v);
            const novo = tamanho() - (store.has(k) ? k.length + store.get(k).length : 0) + k.length + v.length;
            if (novo > cota.max) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
            store.set(k, v);
        },
        removeItem: (k) => { store.delete(k); }, key: (i) => [...store.keys()][i] || null, clear: () => store.clear(), get length() { return store.size; }
    };
    const localStorage = new Proxy(ls, { ownKeys: () => [...store.keys()],
        getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : undefined) });

    // WebSocket falso — uma CLASSE, como o nativo (exige new)
    class FakeWS {
        constructor(url) { this.url = url; this.readyState = 1; this.ouvintes = {}; this.saida = []; FakeWS.criados.push(this); }
        addEventListener(t, f) { (this.ouvintes[t] = this.ouvintes[t] || []).push(f); }
        send(d) { this.saida.push(d); }
        emitir(o) { const data = typeof o === 'string' ? o : JSON.stringify(o); for (const f of (this.ouvintes.message || [])) f({ data }); }
        emitirCru(ev) { for (const f of (this.ouvintes.message || [])) f(ev); }
        enviados(tipo) { return this.saida.filter(s => typeof s === 'string').map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(o => o && o.type === tipo); }
    }
    FakeWS.criados = []; FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;

    // relógio falso
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

    const rotas = Object.assign({}, opts.rotas || ROTAS_OK);
    const fetch = async (url, o) => {
        const u = String(url);
        const caminho = u.includes('raw.githubusercontent') ? 'raw' : u.replace('https://play.tibidle.com', '').split('?')[0];
        chamadas.push({ caminho, o });
        let r = rotas[caminho];
        if (typeof r === 'function') r = r(u, o);
        if (r && typeof r.then === 'function') return r;          // resposta que não chega nunca
        if (r instanceof Error) throw r;
        if (r === undefined) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
        return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(r)), text: async () => (typeof r === 'string' ? r : JSON.stringify(r)) };
    };
    const window = { WebSocket: FakeWS, addEventListener() { }, innerWidth: 1400, innerHeight: 900, open() { }, document, localStorage };
    const console_ = { log() { }, info() { }, warn: (...a) => avisos.push(a.map(String).join(' ')), error: (...a) => avisos.push('ERRO ' + a.map(x => (x && x.stack) || String(x)).join(' ')) };
    const ctx = { window, document, localStorage, WebSocket: FakeWS, console: console_, fetch, Date: FDate,
        setTimeout: setTimeout_, setInterval: setInterval_, clearTimeout: limpar, clearInterval: limpar,
        requestAnimationFrame: (f) => setTimeout_(f, 16), getComputedStyle: () => ({}), navigator: {}, location: { href: 'https://play.tibidle.com/' }, crypto: {},
        MouseEvent: class { }, PointerEvent: class { }, KeyboardEvent: class { }, Event: class { }, MutationObserver: class { observe() { } disconnect() { } } };
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'tibidle-helper.user.js' });
    const lsGet = (k) => { const v = store.get(k); return v == null ? undefined : JSON.parse(v); };
    return { ctx, window, document, porId, porTestid, plantar, store, lsGet, cota, FakeWS, avancar, drenar, errosTimer, chamadas, avisos, rotas,
             get agora() { return AGORA; }, get H() { return window.__tbHelper; } };
}

/* ------------------------------------------------------------------ runner */
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
const DEBUG = { tb_helper_debug: 'true', tb_helper_nivel_manual: '62', tb_helper_era: '"2026-09-wipe"' };
const party4 = (extra) => ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'].map((v, i) => Object.assign({ vocation: v, hp: 500, maxHp: 500, mana: 200, maxMana: 300 }, extra ? extra(v, i) : {}));
const frame = (an, st) => ({ type: 'frame', data: { state: Object.assign({ cap: { used: 100, total: 1000 }, balance: 5000, lureTier: 2, character: { level: 62 }, party: party4() }, st || {}),
    analyzer: an === null ? undefined : Object.assign({ elapsedMs: 1000, xp: 100, xpRaw: 80, killsTotal: 3, lootGold: 50, suppliesGold: 10 }, an || {}) } });
const logTxt = (W) => (W.lsGet(Object.keys(Object.fromEntries(W.store)).find(k => /_log$/.test(k)) || 'tb_helper_log') || []).map(l => l.msg).join('\n');

/* ================================================================ testes */
t('sobe sem exceção; __tbHelper só com debug e só leitura', async () => {
    const W = criarMundo({ ls: DEBUG });
    await W.avancar(0);
    assert(W.porId.has('tb-trilho') && W.porId.has('tb-corpo'), 'o painel não montou');
    assert(!W.avisos.some(a => /ERRO/.test(a)), 'console.error no boot: ' + W.avisos.filter(a => /ERRO/.test(a)).join(' | '));
    assert(W.H && W.H.versao, '__tbHelper não exposto com tb_helper_debug');
    for (const k of ['enviarWS', 'cicloDeVenda', 'aplicarPlanoSocket', 'equiparTrocas', 'scanIniciar', 'venderNoNpc', 'guardarAutoHunt', 'aplicarSlot', 'lerDepot'])
        assert(!(k in W.H), '__tbHelper expõe função que ESCREVE: ' + k);
    assert(!('send' in W.H.WS) && W.H.WS.socket === false, 'WS exposto deve ser cópia sem o socket');
    const S = criarMundo({ ls: { tb_helper_nivel_manual: '62' } });
    await S.avancar(0);
    assert.strictEqual(S.window.__tbHelper, undefined, 'sem debug o __tbHelper não pode existir');
    assert(!W.errosTimer.length && !S.errosTimer.length, 'timer estourou: ' + W.errosTimer.concat(S.errosTimer).join(' | '));
});

t('catálogos na gaveta COMUM; cópias por gaveta e equip_ids somem', async () => {
    const W = criarMundo({ ls: Object.assign({}, DEBUG, { tb_helper_cat_hunts: '[]', tb_helper_abc123_cat_magias: '[]', tb_helper_equip_ids: '{"t":1,"m":{}}', tb_helper_abc123_equip_ids: '{}' }) });
    await W.avancar(0);
    assert.strictEqual(W.H.CAT.hunts.length, 2);
    assert(W.store.has('tb_helper_comum_cat_hunts') && W.store.has('tb_helper_comum_cat_magias') && W.lsGet('tb_helper_comum_cat_era') === '2026-09-wipe');
    for (const k of ['tb_helper_cat_hunts', 'tb_helper_abc123_cat_magias', 'tb_helper_equip_ids', 'tb_helper_abc123_equip_ids']) assert(!W.store.has(k), 'sobrou ' + k);
});

t('assets: a versão vem do catálogo de bosses (v185), não da conhecida, mesmo com a velha ainda no ar', async () => {
    /* 04/10: no boot a performance está vazia e os bosses ainda não tinham chegado; o helper pegava a v170 conhecida
     * (que ainda respondia) e, quando o Equip achou a v185, disparava um "jogo atualizado" falso. */
    const rotas = Object.assign({}, ROTAS_OK, { '/bosses/select': [{ name: 'Renegade Orc', health: 3000, scene: '/assets/v185/bosses/orc.png' }],
        '/assets/v185/spell-areas.json': { marco: 'v185' }, '/assets/v170/spell-areas.json': { marco: 'v170' } });
    const W = criarMundo({ ls: Object.assign({}, DEBUG), rotas });
    await W.avancar(0);
    assert.strictEqual(W.lsGet('tb_helper_comum_assets_ver'), 'v185');
    assert.strictEqual(W.H.CAT.areas && W.H.CAT.areas.marco, 'v185');
    assert(!/jogo atualizado/.test(logTxt(W)), 'rebaixamento falso no 1º boot');
});
t('assets: versão velha que ainda responde não rebaixa a guardada nem dispara "jogo atualizado"', async () => {
    const rotas = Object.assign({}, ROTAS_OK, { '/assets/v170/spell-areas.json': { marco: 'v170' } }); // a v185 some (404) e os bosses não têm cena
    const W = criarMundo({ ls: Object.assign({}, DEBUG, { tb_helper_comum_assets_ver: '"v185"' }), rotas });
    await W.avancar(0);
    assert.strictEqual(W.lsGet('tb_helper_comum_assets_ver'), 'v185', 'guardada rebaixada');
    assert.strictEqual(W.H.CAT.areas && W.H.CAT.areas.marco, 'v170', 'a velha ainda vale como dado');
    assert(!/jogo atualizado/.test(logTxt(W)), '"jogo atualizado" para trás');
});
t('assets: patch de verdade (guardada v170, jogo em v185) avisa e relê', async () => {
    const rotas = Object.assign({}, ROTAS_OK, { '/bosses/select': [{ name: 'Renegade Orc', health: 3000, scene: '/assets/v185/bosses/orc.png' }], '/assets/v185/spell-areas.json': { marco: 'v185' } });
    const W = criarMundo({ ls: Object.assign({}, DEBUG, { tb_helper_comum_assets_ver: '"v170"' }), rotas });
    await W.avancar(0);
    assert.strictEqual(W.lsGet('tb_helper_comum_assets_ver'), 'v185');
    assert(/jogo atualizado \(assets v170 → v185\)/.test(logTxt(W)), 'sem o aviso: ' + logTxt(W).split('\n').slice(0, 6).join(' | '));
});

t('lembretes 2.14.9: prey com os 4 em DANO vai para o Log uma vez; buff vencendo sem trava avisa; invasão lida do ícone da cidade', async () => {
    const W = criarMundo({ ls: Object.assign({}, DEBUG) });
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    const buff = (tipo, locked, msLeft) => ({ bonus: { type: tipo, tier: 5 }, locked, msLeft });
    const meta = { wildcards: 10, preyBuffs: { KNIGHT: buff('damage', false, 7e6), PALADIN: buff('damage', false, 7e6), SORCERER: buff('damage', false, 7e6), DRUID: buff('damage', false, 7e6) } };
    ws.emitir({ type: 'welcome', data: { account: { name: 'T' }, meta } });
    await W.avancar(70000);
    ws.emitir({ type: 'frame', data: { state: {} } });
    await W.avancar(0);
    const l1 = logTxt(W);
    assert(/prey: os 4 com DANO/.test(l1), 'prey não foi para o Log: ' + l1.split('\n').slice(0, 5).join(' | '));
    assert.strictEqual((l1.match(/prey: os 4 com DANO/g) || []).length, 1, 'prey logado mais de uma vez');
    /* buff vencendo sem trava (20 min) → aviso, uma vez */
    ws.emitir({ type: 'meta_result', data: { meta: Object.assign({}, meta, { preyBuffs: Object.assign({}, meta.preyBuffs, { KNIGHT: buff('xp', false, 20 * 60000) }) }) } });
    await W.avancar(70000);
    ws.emitir({ type: 'frame', data: { state: {} } });
    await W.avancar(0);
    assert(/prey: Cavaleiro: EXP acaba em 20 min sem trava/.test(logTxt(W)), 'aviso de buff vencendo ausente: ' + logTxt(W).split('\n').slice(0, 3).join(' | '));
    /* invasão: o ícone da cidade com inscrições abertas e sem inscrição → Log 1× por dia */
    const ic = W.plantar('invasao-icone', ''); ic.setAttribute('data-estado', 'abertas');
    const topo = W.plantar('invasao-icone-topo', 'Inscreva-se'); topo.setAttribute('data-topo', 'nao');
    W.plantar('invasao-icone-contagem', '01:30:00');
    await W.avancar(70000);
    ws.emitir({ type: 'frame', data: { state: {} } });
    await W.avancar(0);
    const l2 = logTxt(W);
    assert(/invasão: Invasão de hoje: você ainda não se inscreveu — janela em 01:30:00/.test(l2), 'invasão ausente: ' + l2.split('\n').slice(0, 3).join(' | '));
    await W.avancar(70000);
    ws.emitir({ type: 'frame', data: { state: {} } });
    await W.avancar(0);
    assert.strictEqual((logTxt(W).match(/invasão: Invasão de hoje/g) || []).length, 1, 'invasão logada mais de uma vez no dia');
});
t('rede fora: catálogo velho (vencido) vale em vez de CAT null', async () => {
    const ls = Object.assign({}, DEBUG, { tb_helper_comum_cat_era: '"2026-09-wipe"', tb_helper_comum_cat_ts: String(1759150000000 - 3 * 864e5),
        tb_helper_comum_cat_hunts: JSON.stringify(HUNTS), tb_helper_comum_cat_magias: JSON.stringify(SPELLS) });
    const W = criarMundo({ ls, rotas: { '/hunts/select': new Error('rede caiu'), '/spells': new Error('rede caiu') } });
    await W.avancar(0);
    assert(W.H.CAT.hunts && W.H.CAT.hunts.length === 2, 'CAT.hunts ficou null');
    assert(/usando a cópia local/.test(logTxt(W)), 'log não avisou do cache velho');
});

t('buscarJSON tem prazo de 10 s (fetch pendurado não trava o boot)', async () => {
    const W = criarMundo({ ls: DEBUG, rotas: Object.assign({}, ROTAS_OK, { '/auth/me': () => new Promise(() => { }) }) });
    await W.avancar(0);
    assert(!/iniciado/.test(logTxt(W)), 'subiu antes do /auth/me responder?');
    await W.avancar(10500);
    assert(/Tibidle Helper v[\d.]+ iniciado/.test(logTxt(W)), 'o boot não seguiu depois do prazo');
    assert.strictEqual(W.H.CAT.hunts.length, 2);
});

t('welcome/frame falsos → estado; ticket e worldToken redigidos', async () => {
    const W = criarMundo({ ls: DEBUG });
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    ws.send(JSON.stringify({ type: 'auth', data: { ticket: 'SEGREDO-TICKET' } }));
    ws.emitir({ type: 'welcome', data: { worldToken: 'SEGREDO-TOKEN', account: { name: 'Northon', mainVocation: 'KNIGHT' },
        roster: [{ vocation: 'KNIGHT' }, { vocation: 'PALADIN' }, { vocation: 'SORCERER' }, { vocation: 'DRUID' }] } });
    let e = W.H.estadoWS();
    assert.strictEqual(e.temToken, true, 'welcome não chegou no ESTADO_WS');
    assert.strictEqual(e.socketAberto, true);
    igual(e.roster, ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']);
    assert.strictEqual(e.conta.nome, 'Northon');
    ws.emitir({ type: 'hunt_started', data: { huntId: 34, lure: 2, autoBoss: false, state: { party: [{ vocation: 'KNIGHT' }, null, { vocation: 'SORCERER' }, { vocation: 'DRUID' }] } } });
    e = W.H.estadoWS();
    assert.strictEqual(e.huntId, 34);
    assert.strictEqual(e.boss, null, 'autoBoss:false numa hunt comum virou boss');
    igual(e.party, ['KNIGHT', null, 'SORCERER', 'DRUID'], 'buraco na party deslocou os índices (who)');
    ws.emitir(frame({ killsTotal: 7, xp: 300, xpRaw: 240 }));
    e = W.H.estadoWS();
    assert.strictEqual(e.balance, 5000); assert.strictEqual(e.cap.total, 1000);
    assert.strictEqual(W.H.lerAbates(), 7, 'lerAbates não veio do frame.analyzer');
    assert.strictEqual(W.H.lerTaxaXp(), 125, 'taxa xp não veio do frame.analyzer');
    await W.avancar(0);
    assert.strictEqual(W.lsGet('tb_helper_hunt_id'), 34);
    const vaz = JSON.stringify(W.H.WS);
    assert(!vaz.includes('SEGREDO-TICKET'), 'ticket vaza em WS.enviados (sai no "copiar JSON")');
    assert(!vaz.includes('SEGREDO-TOKEN'), 'worldToken vaza em WS.amostras (sai no "copiar JSON")');
    assert(vaz.includes('***'), 'segredo deveria virar ***');
    assert.strictEqual(ws.saida.length, 1, 'o auth tem que chegar ao socket de verdade');
    assert(ws.saida[0].includes('SEGREDO-TICKET'), 'o grampo não pode alterar o que o JOGO manda');
});

t('grampo nunca lança: mensagens malformadas e envio estranho', async () => {
    const W = criarMundo({ ls: DEBUG });
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: { roster: [{ vocation: 'KNIGHT' }] } });
    const crus = ['não é json', '{"type":', 'null', '123', '"texto"', '[]', '{"type":5}', '{"type":"frame","data":null}',
        '{"type":"frame","data":{"state":"x","events":"y","analyzer":7}}', '{"type":"welcome","data":{"roster":"x","profiles":5,"state":{"party":{}}}}',
        '{"type":"hunt_started","data":null}', '{"type":"resume","data":{"huntId":null}}', '{"type":"ended","data":{"summary":"x"}}',
        '{"type":"frame","data":{"events":[{"kind":"cast","who":0,"name":"X","hits":5}]}}',
        '{"type":"frame","data":{"state":{"balance":{"toString":1,"valueOf":1}}}}',
        '{"type":"depot_state","data":{"entries":[null,1]}}', '{"type":"error","data":{"code":{"a":1}}}'];
    for (const c of crus) assert.doesNotThrow(() => ws.emitir(c), 'recebido lançou: ' + c);
    assert.doesNotThrow(() => ws.emitirCru(undefined));
    assert.doesNotThrow(() => ws.emitirCru({ data: undefined }));
    assert.doesNotThrow(() => ws.emitirCru({ data: new Uint8Array([1, 2, 3, 4, 5]).buffer }));
    const envios = [undefined, {}, '{ruim', JSON.stringify({ type: 5 }), 'x'.repeat(30000), JSON.stringify({ type: 'update_battle_config', data: { who: 0, heals: 5 } })];
    for (const s of envios) assert.doesNotThrow(() => ws.send(s), 'send lançou: ' + String(s).slice(0, 40));
    assert.strictEqual(ws.saida.length, envios.length, 'algum envio do jogo não chegou ao socket de verdade');
    const E = W.H.ERROS.porLugar;
    assert(E.observarRecebido && E.observarRecebido.n >= 1, 'erro dentro de observarRecebido deveria ir para falhou()');
    assert(E['livro-razão (eventos)'], 'erro do livro-razão deveria ir para falhou()');
    assert(E.observarEnviado, 'erro dentro de observarEnviado deveria ir para falhou()');
    assert(W.H.ERROS.naoLidos >= 1, 'ERROS.naoLidos não contou');
    await W.avancar(0);
    const falhasNoLog = logTxt(W).split('\n').filter(l => /falha em observarRecebido/.test(l)).length;
    assert.strictEqual(falhasNoLog, 1, 'falha repetida no mesmo minuto deve ir ao Log 1× só');
});

t('subclasse de WebSocket funciona e o grampo ouve; estáticos herdados', async () => {
    const W = criarMundo({ ls: DEBUG });
    await W.avancar(0);
    const WSg = W.window.WebSocket;
    class Reconectavel extends WSg { constructor(u) { super(u); this.tentativas = 0; } reconectar() { return 'ok'; } }
    const r = new Reconectavel('wss://y');
    assert(r instanceof Reconectavel, 'instanceof da subclasse');
    assert(r instanceof WSg, 'instanceof do WebSocket embrulhado');
    assert.strictEqual(r.reconectar(), 'ok');
    assert.strictEqual(r.tentativas, 0);
    assert.strictEqual(WSg.OPEN, 1); assert.strictEqual(WSg.CLOSED, 3);
    const antes = W.H.WS.frames;
    r.emitir({ type: 'frame', data: {} });
    assert.strictEqual(W.H.WS.frames, antes + 1, 'o grampo não ouviu a subclasse');
});

t('WS.socket é o que recebeu welcome — não o último criado', async () => {
    const W = criarMundo({ ls: DEBUG });
    await W.avancar(0);
    const a = new W.window.WebSocket('wss://jogo');
    a.emitir({ type: 'welcome', data: {} });
    const b = new W.window.WebSocket('wss://outro');           // criado depois, sem welcome
    assert.strictEqual(W.H.socketAberto(), true);
    a.readyState = 3;
    assert.strictEqual(W.H.socketAberto(), false, 'adotou o último criado em vez do socket do jogo');
    b.emitir({ type: 'resume', data: { huntId: null } });
    assert.strictEqual(W.H.socketAberto(), true, 'o socket com resume deveria ser adotado');
});

t('reconexão: welcome zera boss/hunt/party; resume sem huntId não cria frame', async () => {
    const W = criarMundo({ ls: DEBUG });
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: {} });
    ws.send(JSON.stringify({ type: 'start_hunt', data: { huntId: 1, lure: 1, bossId: 'Renegade Orc' } }));
    ws.emitir({ type: 'hunt_started', data: { huntId: 800, lure: 1, state: { party: party4() } } });
    assert.strictEqual(W.H.estadoWS().boss, 'Renegade Orc');
    const ws2 = new W.window.WebSocket('wss://jogo');
    ws2.emitir({ type: 'welcome', data: { worldToken: 't2' } });
    let e = W.H.estadoWS();
    assert.strictEqual(e.boss, null); assert.strictEqual(e.huntId, null); igual(e.party, []); assert.strictEqual(e.ultimoStart, null);
    ws2.emitir({ type: 'resume', data: { state: {} } });
    e = W.H.estadoWS();
    assert.strictEqual(e.idadeMs, null, 'resume sem huntId criou frame (emHunt mentiria por 5 s)');
    assert.strictEqual(e.huntId, null);
    ws2.emitir({ type: 'hunt_started', data: { huntId: 34, state: { party: party4() } } });
    ws2.emitir({ type: 'ended', data: { summary: { huntId: 34, reason: 'death' } } });
    e = W.H.estadoWS();
    assert.strictEqual(e.huntId, null, '`ended` tem que zerar o huntId');
    assert.strictEqual(e.ultimoEnded.reason, 'death');
});

t('boss (huntId 800) não apaga hunt_id nem abre a tela CAÇADAS; sem sessão', async () => {
    const W = criarMundo({ ls: Object.assign({}, DEBUG, { tb_helper_hunt_id: '34' }) });
    const explore = W.plantar('actionbar-explore');
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: {} });
    ws.send(JSON.stringify({ type: 'start_hunt', data: { huntId: 1, lure: 1, bossId: 'Renegade Orc' } }));
    ws.emitir({ type: 'hunt_started', data: { huntId: 800, lure: 1, state: { party: party4() } } });
    for (let s = 0; s < 25; s++) { ws.emitir(frame({ killsTotal: s, elapsedMs: s * 1000 })); await W.avancar(1000); }
    assert.strictEqual(W.H.estadoWS().boss, 'Renegade Orc');
    assert.strictEqual(W.lsGet('tb_helper_hunt_id'), 34, 'hunt_id foi apagado durante o boss');
    assert.strictEqual(explore.cliques, 0, 'abriu a tela CAÇADAS no meio do boss');
    assert.strictEqual(W.H.SESSAO, null, 'abriu sessão do Analisador durante o boss');
    // sem o start_hunt (ou velho): 800 continua sendo boss
    await W.avancar(61000);
    ws.emitir({ type: 'hunt_started', data: { huntId: 800, lure: 1 } });
    assert.strictEqual(W.H.estadoWS().boss, '?');
    // id fora do catálogo = boss também; o jogo devolve a party à hunt: boss acaba
    ws.emitir({ type: 'hunt_started', data: { huntId: 9999, lure: 1 } });
    assert.strictEqual(W.H.estadoWS().boss, '?');
    ws.emitir({ type: 'hunt_started', data: { huntId: 34, lure: 2, autoBoss: true } });
    assert.strictEqual(W.H.estadoWS().boss, null, 'hunt do catálogo com autoBoss virou boss');
    for (let s = 0; s < 6; s++) { ws.emitir(frame({ killsTotal: s })); await W.avancar(1000); }
    assert(W.H.SESSAO && W.H.SESSAO.huntId === 34, 'depois do boss a sessão da hunt deveria abrir');
    assert.strictEqual(explore.cliques, 0);
});

t('lerAbates nunca clica em hud-analyzer (com ou sem frame)', async () => {
    const W = criarMundo({ ls: Object.assign({}, DEBUG, { tb_helper_hunt_id: '34' }) });
    const hud = W.plantar('hud-analyzer');
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: {} });
    ws.emitir({ type: 'hunt_started', data: { huntId: 34, state: { party: party4() } } });
    for (let s = 0; s < 200; s++) { ws.emitir(frame(s % 2 ? null : { killsTotal: s })); await W.avancar(1000); }
    for (let i = 0; i < 5; i++) { W.H.lerAbates(); await W.avancar(61000); }
    assert.strictEqual(hud.cliques, 0, 'clicou em hud-analyzer (reabre a janela do jogador)');
});

t('SESSAO guarda a0: sessão longa (>400 amostras) fecha medindo desde o começo', async () => {
    const W = criarMundo({ ls: Object.assign({}, DEBUG, { tb_helper_hunt_id: '34' }) });
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: {} });
    ws.emitir({ type: 'hunt_started', data: { huntId: 34, state: { party: party4() } } });
    let t0 = null;
    for (let s = 0; s < 1500; s++) {
        ws.emitir(frame({ killsTotal: s, xp: 1000 + 10 * s, elapsedMs: s * 1000, lootGold: 5 * s, suppliesGold: s }, { balance: 5000 + 2 * s }));
        await W.avancar(1000);
        if (t0 == null && W.H.SESSAO && W.H.SESSAO.a0) t0 = W.H.SESSAO.a0.t;
    }
    const S = W.H.SESSAO;
    assert(S && S.a0, 'sessão sem a0');
    assert(S.amostras.length <= 400, 'amostras sem limite');
    assert.strictEqual(S.amostras[0], S.a0, 'o corte apagou a amostra inicial');
    assert.strictEqual(S.a0.t, t0);
    ws.emitir({ type: 'ended', data: { summary: { huntId: 34, reason: 'stopped' } } });
    await W.avancar(4000);
    const ses = W.lsGet('tb_helper_sessoes');
    assert(ses && ses.length === 1, 'sessão não foi guardada');
    assert.strictEqual(ses[0].inicio, t0, 'a sessão fechou contando de depois do começo');
    assert(ses[0].dur > 1400, 'duração ' + ses[0].dur);
    assert(Math.abs(ses[0].expH - 36000) < 800, 'xp/h pelo analisador: ' + ses[0].expH);
});

t('analyzer_reset fecha a sessão', async () => {
    const W = criarMundo({ ls: Object.assign({}, DEBUG, { tb_helper_hunt_id: '34' }) });
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: {} });
    ws.emitir({ type: 'hunt_started', data: { huntId: 34, state: { party: party4() } } });
    for (let s = 0; s < 90; s++) { ws.emitir(frame({ killsTotal: s, xp: 10 * s, elapsedMs: s * 1000 })); await W.avancar(1000); }
    assert(W.H.SESSAO);
    ws.send(JSON.stringify({ type: 'analyzer_reset', data: {} }));
    assert.strictEqual(W.H.SESSAO, null, 'analyzer_reset não fechou a sessão');
    assert.strictEqual((W.lsGet('tb_helper_sessoes') || []).length, 1);
});

t('log escapado (erro do servidor com HTML) e versão do GitHub validada', async () => {
    const W = criarMundo({ ls: Object.assign({}, DEBUG, { tb_helper_ui: JSON.stringify({ aba: 'log', aberta: true, top: 84, right: 8, oculto: false }) }) });
    W.rotas.raw = '// ==UserScript==\n// @version      9.<img/src=x/onerror=alert(1)>\n// ==/UserScript==\n';
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'error', data: { code: '<img src=x onerror=alert(1)>' } });
    await W.avancar(0);
    const html = W.porId.get('tb-log').innerHTML;
    assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'mensagem não apareceu escapada');
    assert(!/<img/i.test(html), 'HTML cru no Log (XSS)');
    const v = await W.H.verificarAtualizacao();
    assert.strictEqual(v, null, 'versão inválida aceita: ' + v);
    assert(!/versão nova/.test(logTxt(W)));
    W.rotas.raw = '// ==UserScript==\n// @version      9.9.9\n// ==/UserScript==\n' + 'x'.repeat(50);
    assert.strictEqual(await W.H.verificarAtualizacao(), '9.9.9');
    assert(/versão nova no GitHub: 9\.9\.9/.test(logTxt(W)));
    const pedido = W.chamadas.filter(c => c.caminho === 'raw').pop();
    assert(pedido.o && pedido.o.headers && /bytes=0-4095/.test(pedido.o.headers.Range), 'sem Range: baixa o arquivo inteiro');
});

t('render agendado: rajada de eventos = um desenho só', async () => {
    /* v2.11 (D2) — o corpo só é redesenhado quando o HTML da aba MUDA; o Log
     * não muda com estes eventos (0 desenhos), então a rajada vai no Status,
     * que muda (○ cidade/OURO — → ● caçando/OURO 5.000) — exatamente 1. */
    const W = criarMundo({ ls: Object.assign({}, DEBUG, { tb_helper_ui: JSON.stringify({ aba: 'estado', aberta: true, top: 84, right: 8, oculto: false }) }) });
    await W.avancar(0);
    const corpo = W.porId.get('tb-corpo');
    const antes = corpo.sets;
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: {} });
    ws.emitir({ type: 'hunt_started', data: { huntId: 34 } });
    ws.emitir({ type: 'hunt_started', data: { huntId: 32 } });
    ws.emitir({ type: 'depot_state', data: { entries: [] } });
    ws.emitir(frame());
    assert.strictEqual(corpo.sets, antes, 'desenhou dentro do evento do socket');
    await W.avancar(0);
    assert.strictEqual(corpo.sets, antes + 1, 'rajada virou ' + (corpo.sets - antes) + ' desenhos');
    await W.avancar(0);
    assert.strictEqual(corpo.sets, antes + 1, 'repintou sem mudança');
});

t('perfis incompletos → nenhum profiles_set (APLICAR NOS 4 de ponta a ponta)', async () => {
    const ls = Object.assign({}, DEBUG, { tb_helper_hunt_id: '34', tb_helper_modelo: '"equilibrado"',
        tb_helper_ui: JSON.stringify({ aba: 'magia', aberta: true, top: 84, right: 8, oculto: false }) });
    for (const [v, x] of Object.entries(DANOS)) ls['tb_helper_danos_' + v] = JSON.stringify(x);
    const W = criarMundo({ ls });
    await W.avancar(0);
    const aplicar = async (seg, ws, emFrame) => {
        await W.avancar(0);
        const b = W.porId.get('tb-aplicar-todos');
        assert(b && typeof b.onclick === 'function', 'botão APLICAR NOS 4 não montou');
        b.onclick();
        for (let s = 0; s < seg; s++) { if (emFrame) ws.emitir(frame()); await W.avancar(1000); }
    };
    // 1) helper "instalado com o jogo aberto": sem welcome; o CLIENTE salva UM perfil (Knight)
    const ws = new W.window.WebSocket('wss://jogo');
    ws.send(JSON.stringify({ type: 'auth', data: { ticket: 'x' } }));
    const perfilK = { active: 2, list: [{ name: 'Hunt', config: { skills: ['Berserk'], heals: [{ name: 'Health Potion', percent: 50 }] } },
        { name: 'Boss', config: null }, { name: 'Treino', config: { skills: ['Brutal Strike'], heals: [{ name: 'Strong Health Potion', percent: 55 }] } }, { name: 'X', config: null }] };
    ws.send(JSON.stringify({ type: 'profiles_set', data: { vocation: 'KNIGHT', profiles: perfilK } }));
    await aplicar(20, ws, false);
    assert.strictEqual(ws.enviados('profiles_set').length, 1, 'mandou profiles_set montado em cima de perfil parcial');
    assert.strictEqual(ws.enviados('update_battle_config').length, 0);
    // 2) welcome com perfis só de KNIGHT e DRUID; PALADIN só em battleConfigs; SORCERER em lugar nenhum
    const perfilD = { active: 0, list: [{ name: 'Hunt', extra: 'fica', config: { skills: ['Ice Wave'], heals: [{ name: 'Health Potion', percent: 60 }], manaPotion: { name: 'Mana Potion', percent: 50 } } }] };
    ws.emitir({ type: 'welcome', data: { roster: party4(), profiles: { KNIGHT: perfilK, DRUID: perfilD },
        battleConfigs: { PALADIN: { skills: ['Ethereal Spear'], heals: [{ name: 'Health Potion', percent: 45 }] } } } });
    await aplicar(20, ws, false);
    const ps = ws.enviados('profiles_set').slice(1);
    igual(ps.map(p => p.data.vocation).sort(), ['DRUID', 'KNIGHT'], 'profiles_set para vocação sem perfil real: ' + ps.map(p => p.data.vocation));
    const k = ps.find(p => p.data.vocation === 'KNIGHT').data.profiles;
    assert.strictEqual(k.list.length, 4); assert.strictEqual(k.active, 2);
    igual(k.list[0], perfilK.list[0], 'preset que não é o ativo foi alterado');
    assert.strictEqual(k.list[2].name, 'Treino');
    igual(k.list[2].config.heals, [{ name: 'Strong Health Potion', percent: 55 }], 'cura do preset ativo perdida');
    assert.notDeepStrictEqual(k.list[2].config.skills, ['Brutal Strike'], 'as magias do plano não entraram');
    const dr = ps.find(p => p.data.vocation === 'DRUID').data.profiles;
    assert.strictEqual(dr.list[0].extra, 'fica', 'campo do preset que o helper não conhece sumiu');
    igual(dr.list[0].config.manaPotion, { name: 'Mana Potion', percent: 50 });
    assert.strictEqual(ws.enviados('update_battle_config').length, 0, 'na cidade não sai update_battle_config');
    assert(/PALADIN: .*o perfil de PALADIN não veio do servidor/.test(logTxt(W)), 'pular o Paladino tem que ir para o Log:\n' + logTxt(W));
    assert(/SORCERER: .*sem a configuração atual/.test(logTxt(W)), 'Feiticeiro sem config tem que abortar com log');
    // 3) caçando: Paladino (sem perfil real) recebe só update_battle_config; o eco não cria esqueleto
    ws.emitir({ type: 'hunt_started', data: { huntId: 34, state: { party: party4() } } });
    ws.emitir(frame());
    const antesPs = ws.enviados('profiles_set').length;
    await aplicar(30, ws, true);
    const novos = ws.enviados('profiles_set').slice(antesPs).map(p => p.data.vocation).sort();
    igual(novos, ['DRUID', 'KNIGHT']);
    const ubc = ws.enviados('update_battle_config').map(p => p.data.who).sort();
    igual(ubc, [0, 1, 3], 'update_battle_config esperado para K, P e D (who 0,1,3): ' + ubc);
    ws.emitir(frame(undefined, { }));
    ws.emitir({ type: 'frame', data: { state: { party: party4() }, events: [{ kind: 'update_battle_config', who: 1, config: { skills: ['Divine Missile'] } }] } });
    assert(!W.H.estadoWS().perfisReais.includes('PALADIN'), 'o eco criou um perfil-esqueleto do Paladino');
    igual(W.H.configAtiva('PALADIN').skills, ['Divine Missile'], 'o eco deveria atualizar a config de batalha');
});

t('gaveta pela conta do welcome quando /auth/me falha', async () => {
    const ls = Object.assign({}, DEBUG, { tb_helper_dono: '"idDono"', tb_helper_contas: JSON.stringify({ Dono: 'idDono', Outra: 'idOutra' }) });
    const W = criarMundo({ ls });
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: { account: { name: 'Outra', mainVocation: 'DRUID' } } });
    await W.avancar(0);
    assert(W.store.has('tb_helper_idOutra_log'), 'não trocou para a gaveta da conta Outra');
    const X = criarMundo({ ls });
    await X.avancar(0);
    const ws2 = new X.window.WebSocket('wss://jogo');
    ws2.emitir({ type: 'welcome', data: { account: { name: 'Nova Conta', mainVocation: 'DRUID' } } });
    await X.avancar(0);
    assert(X.store.has('tb_helper_nNovaConta_log'), 'conta desconhecida deveria ganhar gaveta própria');
    const Y = criarMundo({ ls });
    await Y.avancar(0);
    const ws3 = new Y.window.WebSocket('wss://jogo');
    ws3.emitir({ type: 'welcome', data: { account: { name: 'Dono' } } });
    await Y.avancar(0);
    assert(!Object.keys(Object.fromEntries(Y.store)).some(k => /^tb_helper_(idDono|n)\w*_log$/.test(k)), 'o dono fica na gaveta comum');
});

t('localStorage cheio: avisa 1× no Log ("sem espaço") e o helper segue', async () => {
    const W = criarMundo({ ls: Object.assign({}, DEBUG, { tb_helper_ui: JSON.stringify({ aba: 'log', aberta: true, top: 84, right: 8, oculto: false }) }) });
    await W.avancar(0);
    W.cota.max = [...W.store].reduce((s, [k, v]) => s + k.length + v.length, 0) + 5000;
    const ws = new W.window.WebSocket('wss://jogo');
    for (let i = 0; i < 30; i++) ws.emitir({ type: 'error', data: { code: 'e' + i + 'x'.repeat(400) } });
    await W.avancar(0);
    // o Log da tela mostra a memória (o disco já não cabe)
    const html = W.porId.get('tb-log').innerHTML;
    assert.strictEqual((html.match(/sem espaço/g) || []).length, 1, 'avisos de "sem espaço": ' + (html.match(/sem espaço/g) || []).length);
    assert(html.includes('e29x'), 'o log em memória parou de andar');
    assert(!W.H.ERROS.porLugar['guardar log'], 'cota cheia não é "falha" de código');
});

/* --------------------------------------------- trechos pelos marcadores */
t('@@ARMAZEM: scan_resultados fica com os 60 mais recentes e é lido 1× do disco', async () => {
    const lidos = [];
    const disco = new Map();
    const LSfake = { getItem: (k) => { lidos.push(k); return disco.has(k) ? disco.get(k) : null; }, setItem: (k, v) => disco.set(k, String(v)), removeItem: (k) => disco.delete(k) };
    const A = new Function('localStorage', 'window', `
        const console = { log() { }, warn() { }, error() { } };
        let LS = 'tb_helper_'; const autoHunt = () => ({ on: false }), guardarAutoHunt = () => {}, renderizar = () => {}, pintarLog = () => {};
        ${trecho('/* @@ARMAZEM-INICIO', '/* @@ARMAZEM-FIM */')}
        return { guardar, ler, ERROS, falhou, deuCerto, MEMO, get LOG() { return LOG; } };
    `)(LSfake, { addEventListener() { } });
    const r = {}; for (let i = 0; i < 100; i++) r['h' + i] = { t: 1000 + i, xpH: i };
    assert.strictEqual(A.guardar('scan_resultados', r), true);
    const salvo = JSON.parse(disco.get('tb_helper_scan_resultados'));
    assert.strictEqual(Object.keys(salvo).length, 60);
    assert(salvo.h99 && salvo.h40 && !salvo.h39, 'podou os errados');
    lidos.length = 0;
    for (let i = 0; i < 10; i++) A.ler('scan_resultados', {});
    assert.strictEqual(lidos.length, 0, 'scan_resultados relido do disco ' + lidos.length + '×');
    // falhou(): conta por lugar e zera as seguidas
    A.falhou('x', new Error('a')); A.falhou('x', new Error('b'));
    assert.strictEqual(A.ERROS.porLugar.x.n, 2); assert.strictEqual(A.ERROS.porLugar.x.seguidas, 2);
    A.deuCerto('x'); assert.strictEqual(A.ERROS.porLugar.x.seguidas, 0);
    assert.strictEqual(A.LOG.filter(l => /falha em x/.test(l.msg)).length, 1, 'mesmo lugar no mesmo minuto: 1 linha no Log');
});

t('@@ARMAZEM: radar_dias fica com os 30 dias mais novos (2.13.0), sem função de fora', async () => {
    const disco = new Map();
    const A = new Function('localStorage', 'window', `
        const console = { log() { }, warn() { }, error() { } };
        let LS = 'tb_helper_'; const autoHunt = () => ({ on: false }), guardarAutoHunt = () => {}, renderizar = () => {}, pintarLog = () => {};
        ${trecho('/* @@ARMAZEM-INICIO', '/* @@ARMAZEM-FIM */')}
        return { guardar, ler };
    `)({ getItem: (k) => (disco.has(k) ? disco.get(k) : null), setItem: (k, v) => disco.set(k, String(v)), removeItem: (k) => disco.delete(k) }, { addEventListener() { } });
    const dias = {};
    for (let i = 1; i <= 45; i++) { const d = new Date(2026, 7, i, 12); dias[d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')] = { xp: i }; }
    assert.strictEqual(A.guardar('radar_dias', dias), true);
    const salvo = JSON.parse(disco.get('tb_helper_radar_dias'));
    const k = Object.keys(salvo).sort();
    assert.strictEqual(k.length, 30);
    assert.strictEqual(k[0], '2026-08-16'); assert.strictEqual(k[29], '2026-09-14');
    assert.strictEqual(A.guardar('radar_dias', { '2026-09-30': { xp: 1 } }), true);
    assert.deepStrictEqual(JSON.parse(disco.get('tb_helper_radar_dias')), { '2026-09-30': { xp: 1 } }, 'poucos dias ficam como estão');
});

t('@@ARMAZEM: 5 falhas seguidas no gatilho desligam o Auto Hunt', async () => {
    const estado = { on: true };
    const A = new Function('localStorage', 'window', 'estado', `
        const console = { log() { }, warn() { }, error() { } };
        let LS = 'tb_helper_'; const autoHunt = () => ({ on: estado.on }), guardarAutoHunt = (p) => Object.assign(estado, p), renderizar = () => {}, pintarLog = () => {};
        ${trecho('/* @@ARMAZEM-INICIO', '/* @@ARMAZEM-FIM */')}
        return { falhou, deuCerto, get LOG() { return LOG; } };
    `)({ getItem: () => null, setItem() { }, removeItem() { } }, { addEventListener() { } }, estado);
    for (let i = 0; i < 4; i++) A.falhou('gatilhoAutoHunt', new Error('x'));
    A.deuCerto('gatilhoAutoHunt');
    for (let i = 0; i < 4; i++) A.falhou('gatilhoAutoHunt', new Error('x'));
    assert.strictEqual(estado.on, true, 'desligou sem 5 falhas SEGUIDAS');
    A.falhou('gatilhoAutoHunt', new Error('x'));
    assert.strictEqual(estado.on, false, '5 falhas seguidas e o Auto Hunt continuou ligado');
    assert(A.LOG.some(l => /Auto Hunt DESLIGADO/.test(l.msg)));
});

t('@@PERFIS: aplicarConfigLocal não cria esqueleto; configAtiva null aborta sem enviar', async () => {
    const enviados = [];
    const P = new Function('enviados', `
        const ESTADO_WS = { profiles: null, battleConfigs: null, party: [], roster: ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'], eco: {} };
        const WS = { socket: { readyState: 1, send: (s) => enviados.push(JSON.parse(s)) } };
        const emHunt = () => false, esperarQue = async () => null, log = () => {};
        ${trecho('/* @@PERFIS-INICIO', '/* @@PERFIS-FIM */')}
        return { ESTADO_WS, aplicarConfigLocal, aplicarPlanoSocket, configAtiva, perfilReal };
    `)(enviados);
    P.aplicarConfigLocal('DRUID', { skills: ['Ice Wave'] });
    assert.strictEqual(P.ESTADO_WS.profiles, null, 'criou ESTADO_WS.profiles de esqueleto');
    igual(P.configAtiva('DRUID').skills, ['Ice Wave']);
    const plano = { plano: [{ av: { m: { name: 'Strong Ice Wave' } }, minimo: 2 }] };
    await assert.rejects(() => P.aplicarPlanoSocket(plano, 'SORCERER'), /sem a configuração atual/);
    await assert.rejects(() => P.aplicarPlanoSocket(plano, 'DRUID'), /não veio do servidor/);
    assert.strictEqual(enviados.length, 0, 'enviou algo sem perfil real/config');
    igual(await P.aplicarPlanoSocket(null, 'DRUID'), { n: 0, who: null, eco: false, cacando: false });
});

rodar();

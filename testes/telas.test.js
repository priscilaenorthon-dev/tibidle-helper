// Roda: node testes/telas.test.js
// Onda 2 (D2) da 2.11 — CONTEÚDO DAS TELAS Status, Magia, Equip, Analisador e Log.
// Carrega o userscript INTEIRO num vm (mesmo padrão de testes/fumaca.test.js) com um
// DOM falso um pouco mais rico: o innerHTML cria um elemento por id="…" com a tag, o
// `disabled` e o pai (contains), há document.activeElement, focus/blur e ouvintes.
// Confere: escHtml em cada tela com nomes maliciosos (<img src=x onerror=…>), o
// repinte não reabilita botão ocupado, o select mantém o foco, "mana Mana" sumiu,
// "OURO —" sem saldo, a caixa do "copiar JSON" sobrevive ao repinte, Equip em
// português, Magia com controle segmentado e perfisDoServidor.
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');
const SRC = fs.readFileSync(process.argv[2] || path.join(raiz, 'tibidle-helper.user.js'), 'utf8');
const le = (p) => JSON.parse(fs.readFileSync(path.join(raiz, p), 'utf8'));
const ITENS = le('testes/fixtures/itens.json').itens;

const XSS = (n) => `<img src=x onerror="window.__xss=${n}">`;
const HUNT_MAL = 'Orc ' + XSS(1) + ' Fortress';
const BOSS_MAL = 'Pesso&Vesso"><img src=x onerror=alert(2)>';
const MAGIA_MAL = 'Berserk' + XSS(3);
const SPELLS = le('testes/fixtures/spells.json').magias.map(m => m.name === 'Berserk' ? Object.assign({}, m, { name: MAGIA_MAL }) : m);
const HUNTS = [
    { id: 34, title: HUNT_MAL, levelMin: 40, island: 'tibidle_island', lureTiers: [{ min: 1, max: 5 }, { min: 6, max: 7 }],
      bestiary: { bonus: 'dano ' + XSS(4), stages: [{ kills: 1500, value: 1 }] },
      monsters: [{ name: 'Orc Berserker', health: 210, experience: 195, weight: 1, elements: [] }, { name: 'Orc Leader', health: 450, experience: 240, weight: 1, elements: [] }] },
    { id: 32, title: 'Elfs Shadowthorn', levelMin: 30, island: 'tibidle_island', lureTiers: [{ min: 1, max: 3 }, { min: 4, max: 4 }, { min: 5, max: 5 }],
      monsters: [{ name: 'Elf Arcanist', health: 220, experience: 175, weight: 1, elements: [] }] }
];
const ROTAS = { '/hunts/select': HUNTS, '/spells': SPELLS, '/potions': le('testes/fixtures/potions.json').pocoes, '/buy-prices': { 'great fireball rune': 32 },
    '/bosses/select': [{ name: 'Renegade Orc', health: 3000, elements: [] }, { name: BOSS_MAL, health: 5000, elements: [{ type: 'COMBAT_FIREDAMAGE', percent: 20 }] }],
    '/hunt/lootTable': [{ chance: 50000, value: 40, maxCount: 1 }], '/bestiary/creature': { armor: 10, defense: 10 } };
const d62 = (min, max) => ({ min, max, nivel: 62 });
const DANOS = {
    KNIGHT: { 'Lesser Front Sweep': d62(40, 70), 'Brutal Strike': d62(60, 110), [MAGIA_MAL]: d62(60, 110) },
    PALADIN: { 'Ethereal Spear': d62(40, 70), 'Divine Missile': d62(50, 80), 'Divine Caldera': d62(45, 75), 'great fireball rune': d62(27, 49) },
    SORCERER: { 'Energy Wave': d62(70, 110), 'Great Fire Wave': d62(55, 85), 'Energy Strike': d62(50, 70), 'Flame Strike': d62(50, 70) },
    DRUID: { 'Ice Wave': d62(28, 42), 'Strong Ice Wave': d62(70, 110), 'Terra Wave': d62(60, 90), 'Ice Strike': d62(50, 70) }
};

/* ------------------------------------------------------------------ mundo */
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
        send(d) { this.saida.push(d); }
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
    const fetch = async (url) => {
        const caminho = String(url).includes('raw.githubusercontent') ? 'raw' : String(url).replace('https://play.tibidle.com', '').split('?')[0];
        const r = rotas[caminho];
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
    return { ctx, window, doc, porId, el, corpo, plantar, store, lsGet, avancar, errosTimer, avisos, extrasQSA, clip, El,
             get agora() { return AGORA; }, get H() { return window.__tbHelper; }, html: () => corpo()._html };
}

/* ------------------------------------------------------------------ apoio */
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
const BASE = { tb_helper_debug: 'true', tb_helper_nivel_manual: '62', tb_helper_era: '"2026-09-wipe"' };
const comAba = (aba, extra) => {
    const ls = Object.assign({}, BASE, { tb_helper_ui: JSON.stringify({ aba, aberta: true, livre: false, oculto: false, logLido: 1 }) }, extra || {});
    for (const [v, x] of Object.entries(DANOS)) ls['tb_helper_danos_' + v] = JSON.stringify(x);
    return ls;
};
const party4 = () => ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'].map(v => ({ vocation: v, hp: 500, maxHp: 500, mana: 200, maxMana: 300 }));
const frame = (st, an) => ({ type: 'frame', data: { state: Object.assign({ cap: { used: 100, total: 1000 }, balance: 5000, lureTier: 2, character: { level: 62 }, party: party4() }, st || {}),
    analyzer: Object.assign({ elapsedMs: 1000, xp: 100, xpRaw: 80, killsTotal: 3, lootGold: 50, suppliesGold: 10 }, an || {}) } });
const logTxt = (W) => (W.lsGet('tb_helper_log') || []).map(l => l.msg).join('\n');
/* HTML "seguro": nenhuma tag <img> nem atributo on…= fora de texto escapado */
const semXss = (html, onde) => {
    assert(!/<img\b/i.test(html), `${onde}: <img> cru no HTML: …${(html.match(/.{0,60}<img\b.{0,40}/i) || [''])[0]}…`);
    /* valor de atributo entre aspas é texto (a aspa de dentro vira &quot;): tira antes de procurar on…= solto */
    const tags = html.replace(/"[^"]*"/g, '""');
    assert(!/<[^>]+\son\w+=/i.test(tags), `${onde}: atributo on…= numa tag: ${(tags.match(/<[^>]+\son\w+=.{0,30}/i) || [''])[0]}`);
};
const botao = (html, id) => { const m = new RegExp(`<button\\b[^>]*\\bid="${id}"[^>]*>([^<]*)`).exec(html); return m ? { tag: m[0], texto: m[1], disabled: /\sdisabled(\s|>|=|$)/.test(m[0].replace(/"[^"]*"/g, '""')) } : null; };

/* ================================================================ testes */
t('marcadores do DIAGNÓSTICO: um bloco só, antes de telaEstado; o botão chama rodarDiagnostico', async () => {
    const i = SRC.indexOf('/* @@DIAGNOSTICO-INICIO */'), f = SRC.indexOf('/* @@DIAGNOSTICO-FIM */'), te = SRC.indexOf('function telaEstado()');
    assert(i > 0 && f > i && te > f, 'bloco @@DIAGNOSTICO fora do lugar');
    assert.strictEqual(SRC.indexOf('/* @@DIAGNOSTICO-INICIO */', i + 1), -1, 'bloco repetido');
    assert(/function rodarDiagnostico\(/.test(SRC.slice(i, f)), 'rodarDiagnostico fora do bloco');
    const W = criarMundo({ ls: comAba('estado') });
    await W.avancar(0);
    const b = botao(W.html(), 'tb-diagnostico');
    assert(b && /DIAGNÓSTICO/.test(b.texto) && !b.disabled, 'botão DIAGNÓSTICO ausente no Status');
    await W.el('tb-diagnostico').click();
    await W.avancar(0);
    assert(/diagnóstico ainda não disponível/.test(logTxt(W)), 'o stub não foi chamado');
});

t('Status: "OURO —" sem saldo lido; HUD e frame dão o número em pt-BR', async () => {
    const W = criarMundo({ ls: comAba('estado') });
    await W.avancar(0);
    assert(/<small>OURO<\/small><b class="tb-vazio">—<\/b>/.test(W.html()), 'sem leitura o card deveria dizer —: ' + (W.html().match(/OURO.{0,60}/) || [''])[0]);
    W.plantar('hud-gold', '1.234.567');
    await W.avancar(4000);                                   // repinte de 4 s do Status
    assert(/<small>OURO<\/small><b>1\.234\.567<\/b>/.test(W.html()), 'HUD não virou número: ' + (W.html().match(/OURO.{0,60}/) || [''])[0]);
    const W2 = criarMundo({ ls: comAba('estado') });
    await W2.avancar(0);
    const ws = new W2.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: {} });
    ws.emitir({ type: 'hunt_started', data: { huntId: 32, state: { party: party4() } } });
    ws.emitir(frame({ balance: 0 }));
    await W2.avancar(0);
    assert(/<small>OURO<\/small><b>0<\/b>/.test(W2.html()), 'saldo 0 do frame é número, não —');
    assert(/● caçando/.test(W2.html()));
});

t('Status: Auto-sell ocupado — o repinte não reabilita o botão e o 2º clique é recusado', async () => {
    const W = criarMundo({ ls: comAba('estado') });
    await W.avancar(0);
    const loot = new W.El('button'); loot.textContent = 'LOOT';
    W.extrasQSA.button = [loot];
    assert(!botao(W.html(), 'tb-autosell').disabled);
    W.el('tb-autosell').click();                             // 1º clique: abre LOOT e espera a janela (3 s)
    await W.avancar(0);
    assert.strictEqual(loot.cliques, 1);
    let b = botao(W.html(), 'tb-autosell');
    assert(b.disabled && /marcando/.test(b.texto), 'ocupado não aparece no HTML: ' + b.tag);
    /* força uma RECONSTRUÇÃO no meio (saldo muda → o Status muda) e o repinte de 4 s */
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: {} });
    ws.emitir({ type: 'hunt_started', data: { huntId: 32, state: { party: party4() } } });
    ws.emitir(frame({ balance: 777 }));
    const antes = W.corpo().sets;
    await W.avancar(1500);
    assert(W.corpo().sets > antes && /777/.test(W.html()), 'o Status não foi reconstruído no meio (teste inválido)');
    b = botao(W.html(), 'tb-autosell');
    assert(b.disabled, 'o repinte reabilitou #tb-autosell no meio da operação (bug da 2.9)');
    W.el('tb-autosell').click();                             // 2º clique, com o HTML ainda "ocupado" (clique programático passa pelo disabled)
    await W.avancar(0);
    assert.strictEqual(loot.cliques, 1, 'o 2º clique abriu a janela de loot de novo');
    await W.avancar(4000);                                   // esperarQue(3 s) esgota
    b = botao(W.html(), 'tb-autosell');
    assert(!b.disabled && /Auto-sell/.test(b.texto), 'não voltou ao normal depois de terminar');
    assert(/auto-sell falhou: janela de loot não abriu/.test(logTxt(W)));
    assert(/auto-sell falhou/.test(W.el('tb-faixa') ? W.porId.get('tb-faixa').title : ''), 'o resultado não foi para a faixa da aba (avisar)');
});

t('Status: boss com nome malicioso na linha de cima sai escapado', async () => {
    const W = criarMundo({ ls: comAba('estado') });
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: {} });
    ws.send(JSON.stringify({ type: 'start_hunt', data: { huntId: 1, lure: 1, bossId: BOSS_MAL } }));
    ws.emitir({ type: 'hunt_started', data: { huntId: 800, state: { party: party4() } } });
    await W.avancar(0);
    assert(/boss Pesso&amp;Vesso&quot;&gt;&lt;img/.test(W.html()), 'boss não apareceu escapado: ' + (W.html().match(/tb-st-hunt.{0,120}/) || [''])[0]);
    semXss(W.html(), 'Status');
});

t('Magia: controle segmentado (Eco · Equil · Área · Boss · Intel) com aria-pressed', async () => {
    const W = criarMundo({ ls: comAba('magia', { tb_helper_hunt_id: '34', tb_helper_modelo: '"area"' }) });
    await W.avancar(0);
    const seg = (W.html().match(/<div class="tb-seg"[\s\S]*?<\/div>/) || [''])[0];
    const bts = [...seg.matchAll(/<button[^>]*data-modelo="(\w+)"[^>]*aria-pressed="(true|false)"[^>]*>([^<]*)<\/button>/g)].map(m => [m[1], m[2], m[3]]);
    assert.deepStrictEqual(bts.map(b => b[2]), ['Eco', 'Equil', 'Área', 'Boss', 'Intel']);
    assert.deepStrictEqual(bts.filter(b => b[1] === 'true').map(b => b[0]), ['area']);
});

t('Magia: escape de hunt, boss, magia e bestiário; "2+ alvos"; "poção de mana ≤30%" (sem "mana Mana")', async () => {
    const W = criarMundo({ ls: comAba('magia', { tb_helper_hunt_id: '34', tb_helper_modelo: '"inteligente"' }) });
    await W.avancar(0);
    await W.avancar(200);                                    // loot e bestiário chegam → repinte com o selo
    const h = W.html();
    semXss(h, 'Magia');
    assert(/Orc &lt;img src=x onerror=&quot;window.__xss=1&quot;&gt; Fortress/.test(h), 'título da hunt não escapado no <option>');
    assert(/Berserk&lt;img/.test(h), 'nome da magia não escapado na ficha');
    assert(/dano &lt;img/.test(h), 'bônus do bestiário não escapado');
    assert(!/mana Mana/.test(h), '"mana Mana" voltou');
    assert(/poção de mana ≤30%/.test(h), 'Druida do Inteligente deveria mostrar "poção de mana ≤30%"');
    assert(/\d\+ alvos?/.test(h) && !/≥\d/.test(h.replace(/≤\d+/g, '')), 'fichas ainda com "≥": ' + (h.match(/.{20}≥\d.{10}/) || [''])[0]);
    assert(/tb-vsel (ok|ruim)">(✓ se paga|✗ não se paga)</.test(h), 'selo do veredito ausente');
    assert(/teto [\d.,]+ o/.test(h) && /\(80 % do loot de 20 o\)/.test(h), 'veredito sem teto/loot em pt-BR: ' + (h.match(/tb-ver.{0,300}/) || [''])[0]);
    // o boss malicioso no <option value="…">
    const W2 = criarMundo({ ls: comAba('magia', { tb_helper_hunt_id: '34', tb_helper_modelo: '"boss"', tb_helper_boss_nome: JSON.stringify(BOSS_MAL) }) });
    await W2.avancar(0); await W2.avancar(200);
    const h2 = W2.html();
    semXss(h2, 'Magia/boss');
    assert(h2.includes('<option value="Pesso&amp;Vesso&quot;&gt;&lt;img src=x onerror=alert(2)&gt;" selected>'), 'option do boss não escapada/selecionada');
    assert(!/\bvalue="[^"]*"[^ >]/.test(h2.replace(/<option value="[^"]*"( selected)?>/g, '')), 'aspas soltas num value');
});

t('Magia: loot que não veio aparece como tal e é pedido de novo 1 min depois (a busca saiu do desenho)', async () => {
    const pedidos = [];
    const rotaLoot = { falha: true };
    const W = criarMundo({ ls: comAba('magia', { tb_helper_hunt_id: '32', tb_helper_modelo: '"equilibrado"' }),
        rotas: { '/hunt/lootTable': undefined } });
    W.ctx.fetch = ((orig) => async (url) => { if (/lootTable/.test(url)) { pedidos.push(url); if (rotaLoot.falha) throw new Error('rede'); return { ok: true, status: 200, json: async () => [{ chance: 50000, value: 40, maxCount: 1 }] }; } return orig(url); })(W.ctx.fetch);
    await W.avancar(0); await W.avancar(200);
    assert(/a tabela de loot desta hunt não veio/.test(W.html()), 'falha do loot não aparece: ' + (W.html().match(/veredito.{0,80}/) || [''])[0]);
    const n1 = pedidos.length;
    assert(n1 >= 1);
    const ws = new W.window.WebSocket('wss://jogo');
    for (let i = 0; i < 5; i++) { ws.emitir({ type: 'welcome', data: {} }); await W.avancar(1000); }
    assert.strictEqual(pedidos.length, n1, 'repinte refez a busca antes de 1 min');
    rotaLoot.falha = false;
    await W.avancar(60000);
    assert(pedidos.length > n1, 'não tentou de novo depois de 1 min');
    assert(/tb-vsel/.test(W.html()), 'o veredito não apareceu depois do loot chegar');
});

t('Magia: "aplica pelo socket" só com perfis vindos do servidor (perfisDoServidor)', async () => {
    const W = criarMundo({ ls: comAba('magia', { tb_helper_hunt_id: '32', tb_helper_modelo: '"equilibrado"' }) });
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    // o CLIENTE salvou um perfil (ESTADO_WS.profiles existe, mas não veio do servidor)
    ws.send(JSON.stringify({ type: 'profiles_set', data: { vocation: 'KNIGHT', profiles: { active: 0, list: [{ config: {} }] } } }));
    ws.emitir({ type: 'hunt_started', data: { huntId: 32 } });
    await W.avancar(0);
    assert(/Aplica pelos diálogos do jogo/.test(W.html()), 'com perfil só do cliente não pode dizer "pelo socket"');
    const perfil = { active: 0, list: [{ config: { heals: [], manaPotion: { percent: 0 }, skills: [null, null, null, null], supports: [null, null], minCreatures: {} } }] };
    ws.emitir({ type: 'welcome', data: { profiles: { KNIGHT: perfil, PALADIN: perfil, SORCERER: perfil, DRUID: perfil } } });
    await W.avancar(0);
    assert(/Aplica pelo socket, sem abrir janela/.test(W.html()), 'perfis do welcome deveriam liberar o socket');
});

t('Magia: o select da hunt mantém o foco — repinte de fundo espera o blur; a mudança do dono repinta', async () => {
    const W = criarMundo({ ls: comAba('magia', { tb_helper_hunt_id: '34', tb_helper_modelo: '"equilibrado"' }) });
    await W.avancar(0); await W.avancar(200);
    const c = W.corpo(), s0 = c.sets;
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: {} });                // renderizar() sem mudança nenhuma
    await W.avancar(0);
    assert.strictEqual(c.sets, s0, 'HTML igual foi reescrito (o select fecharia na mão do dono)');
    const sel = W.el('tb-hunt');
    sel.focus();
    ws.send(JSON.stringify({ type: 'start_hunt', data: { huntId: 1, lure: 1, bossId: 'Renegade Orc' } }));
    ws.emitir({ type: 'hunt_started', data: { huntId: 800 } });   // "boss em andamento" muda o HTML
    await W.avancar(0);
    assert.strictEqual(c.sets, s0, 'repintou com o select em uso');
    assert.strictEqual(W.doc.activeElement, sel, 'o select perdeu o foco');
    assert(sel.isConnected, 'o select saiu da página');
    sel.blur();                                              // saiu do select: o repinte adiado sai
    await W.avancar(0);
    assert.strictEqual(c.sets, s0 + 1, 'o repinte adiado não saiu no blur');
    assert(/boss em andamento/.test(W.html()));
    // mudança feita PELO DONO no select: repinta na hora, mesmo com o foco nele
    const sel2 = W.el('tb-hunt'); sel2.focus();
    c.disparar('change', { target: sel2 });                  // a casca marca a ação do dono (captura)
    sel2.value = '32'; sel2.onchange();
    await W.avancar(0);                                      // (+ o repinte de quando o loot da hunt 32 chega)
    assert(c.sets >= s0 + 2, 'a troca de hunt do dono não repintou');
    assert.strictEqual(W.lsGet('tb_helper_hunt_id'), 32);
    assert(/<option value="32" selected>/.test(W.html()), 'a hunt escolhida não ficou selecionada');
});

t('Equip: escape de itens, slots e vocações em português, "8 slots" como interruptor, slot vazio', async () => {
    const W = criarMundo({ ls: comAba('equip') });
    await W.avancar(0);
    const H = W.H, base = {};
    for (const [nome, it] of Object.entries(ITENS)) base[nome] = { id: it.id, attrs: it.attrs || {}, sell: it.sell || 0, equipPreview: it.equipPreview || null };
    const MAL = 'knight axe' + XSS(7);
    base[MAL] = base['knight axe'];
    const F = { raridade: 0, atributos: [] };
    const roster = [{ vocation: 'KNIGHT', equipment: { weapon: { name: 'mace', iid: 'c1', forja: F } } }, { vocation: 'PALADIN', equipment: {} }, { vocation: 'SORCERER', equipment: {} }, { vocation: 'DRUID', equipment: {} }];
    const depot = { entries: [{ itemName: MAL, iid: 'd1', slot: 'weapon', forja: F }, { itemName: 'plate armor', iid: 'd2', slot: 'armor', forja: F }] };
    const E = H.EQUIP; E.base = base; E.ctx = { nivel: 62, sk: {}, fracMagica: {}, notas: null, mapa: 'Mapa ' + XSS(8) };
    E.res = H.distribuirEquip(H.candidatosEquip(roster, depot, base, []), undefined, E.ctx); E.t = W.agora; E.voc = 'KNIGHT';
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'depot_state', data: { entries: [] } });     // a aba Equip repinta com depot_state
    await W.avancar(0);
    let h = W.html();
    semXss(h, 'Equip');
    assert(/knight axe&lt;img/.test(h), 'item malicioso não escapado');
    assert(/Mapa &lt;img/.test(h), 'mapa não escapado');
    assert(/<span class="s">arma<\/span>/.test(h) && !/<span class="s">weapon<\/span>/.test(h), 'slot não traduzido');
    const b1 = botao(h, 'tb-eq-equipar1');
    assert(b1 && /^só Cav \(\d+\)$/.test(b1.texto) && /Cavaleiro/.test(b1.tag), 'botão "só Cav (n)" errado: ' + (b1 && b1.tag));
    assert(!/Knight/.test(h), 'sobrou "Knight" na tela');
    assert(/<div class="tb-eq-bts">/.test(h) && botao(h, 'tb-eq-atualizar') && botao(h, 'tb-eq-equipar4'), 'botões fora da linha única');
    assert(/data-voc="KNIGHT" aria-pressed="true"/.test(h), 'aba de vocação sem aria-pressed');
    const sw = /<button[^>]*id="tb-eq-tudo"[^>]*>/.exec(h);
    assert(sw && /role="switch"/.test(sw[0]) && /aria-checked="false"/.test(sw[0]), '"8 slots" não é interruptor');
    assert(!/<div class="tb-sub[^"]*"[^>]*>(?:(?!<\/div>)[\s\S])*tb-eq-tudo/.test(h), '"8 slots" ainda dentro das abas de vocação');
    W.el('tb-eq-tudo').click();
    await W.avancar(0);
    h = W.html();
    assert(/aria-checked="true"/.test(/<button[^>]*id="tb-eq-tudo"[^>]*>/.exec(h)[0]));
    assert(/<span class="s">anel<\/span>[\s\S]*?nada melhor no estoque/.test(h), 'slot vazio sem nada melhor deveria dizer "nada melhor no estoque"');
    assert(/<span class="s">(elmo|calça|bota|colar|anel|escudo|armadura)<\/span>/.test(h));
});

t('Analisador: escape (sessões, sessão viva, tipos do socket), tabela com colunas fixas', async () => {
    const sess = [{ hunt: 'Barbarian Camp', dur: 900, ouroH: 4000, expH: 30000, abates: 300, regen: true },
                  { hunt: 'Djinn ' + XSS(9), dur: 1800, ouroH: -12000, expH: 58000, abates: 400, hp: 330, loot: 40, fatorReal: 1.3 }];
    const W = criarMundo({ ls: comAba('analise', { tb_helper_hunt_id: '34', tb_helper_sessoes: JSON.stringify(sess) }) });
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: {} });
    ws.emitir({ type: XSS(10), data: {} });
    ws.emitir({ type: 'hunt_started', data: { huntId: 34, state: { party: party4() } } });
    for (let s = 0; s < 12; s++) { ws.emitir(frame({ balance: 5000 + 10 * s }, { killsTotal: s, elapsedMs: s * 1000 })); await W.avancar(1000); }
    await W.avancar(4000);
    const h = W.html();
    semXss(h, 'Analisador');
    assert(/medindo — Orc &lt;img/.test(h), 'título da sessão viva não escapado: ' + (h.match(/medindo.{0,80}/) || [''])[0]);
    assert(/Djinn &lt;img/.test(h), 'hunt do histórico não escapada');
    assert(/&lt;img src=x onerror=&quot;window.__xss=10&quot;&gt; ×1/.test(h), 'tipo do socket não escapado');
    assert(/<table class="tb-an"><colgroup><col><col class="c5">/.test(h), 'tabela sem colunas de largura fixa');
    assert(/-12,0k/.test(h) && /\+4,0k/.test(h) && /15min/.test(h), 'números fora do pt-BR');
});

t('Analisador: "copiar JSON" com a área de transferência bloqueada — a caixa fica no repinte', async () => {
    const W = criarMundo({ ls: comAba('analise') });
    await W.avancar(0);
    W.el('tb-exportar').click();
    await W.avancar(0);
    assert.strictEqual(W.clip.escritos.length, 1, 'não tentou a área de transferência');
    let cx = W.el('tb-exportar-caixa');
    assert(cx, 'a caixa não apareceu');
    assert(/"sessoes"/.test(cx.value), 'a caixa não tem o JSON');
    assert(/área de transferência bloqueada/.test(W.html()), 'o aviso de bloqueio não aparece');
    assert(/área de transferência bloqueada/.test(logTxt(W)), 'resultado não registrado');
    W.doc.activeElement = W.doc.body;
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: {} });                // frames mudam o HTML do Analisador
    await W.avancar(4000);
    cx = W.el('tb-exportar-caixa');
    assert(cx && /"sessoes"/.test(cx.value), 'a caixa sumiu (ou ficou vazia) no repinte');
    W.el('tb-exportar-fechar').click();
    await W.avancar(0);
    assert(!W.el('tb-exportar-caixa'), '"fechar" não fechou');
});

t('Log: mensagem maliciosa escapada; sem mudança o Log não é reescrito', async () => {
    const W = criarMundo({ ls: comAba('log', { tb_helper_log: JSON.stringify([{ t: 1759149000000, msg: 'hunt memorizada: ' + XSS(11), tipo: 'ok' }]) }) });
    await W.avancar(0);
    const lg = W.el('tb-log');
    assert(lg, 'Log não montou');
    semXss(lg._html, 'Log');
    assert(/&lt;img src=x/.test(lg._html));
    const s0 = lg.sets;
    await W.avancar(8000);
    const ws = new W.window.WebSocket('wss://jogo');
    ws.emitir({ type: 'welcome', data: {} });
    await W.avancar(0);
    assert(lg.isConnected, 'o #tb-log foi recriado sem mudança');
});

t('sobe sem exceção e sem erro de timer em nenhuma aba', async () => {
    for (const aba of ['estado', 'magia', 'equip', 'analise', 'log']) {
        const W = criarMundo({ ls: comAba(aba, { tb_helper_hunt_id: '34' }) });
        await W.avancar(0); await W.avancar(5000);
        assert(!W.errosTimer.length, aba + ': timer estourou: ' + W.errosTimer.join(' | '));
        assert(!W.avisos.some(a => /ERRO|falhou em desenhar/.test(a)), aba + ': ' + W.avisos.filter(a => /ERRO|falhou/.test(a)).join(' | '));
        assert(!/falha em desenhar a tela/.test(logTxt(W)), aba + ': ' + logTxt(W));
    }
});

rodar();

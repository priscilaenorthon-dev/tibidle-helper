// Roda: node testes/autohunt.test.js
// v2.11 — Auto Hunt + Scan. Três partes:
//  1. funções puras (@@AUTOHUNT-PURO): o que desmarcar na venda, por que o gatilho não
//     dispara, retomada do F5, veredito do Scan, `ended` no Scan;
//  2. a venda no NPC (@@AUTOHUNT-VENDA) contra um painel de venda FALSO (o formato real de
//     sell-check-<item> nunca foi visto logado — o painel falso segue o TIBIDLE.md §13);
//  3. o script INTEIRO num vm com um servidor de socket falso: morte no meio do Scan
//     (para, grava a parcial sem apagar o resultado bom, devolve os kits, não reentra)
//     e parar pelo botão (volta para o mapa e o lure de antes).
// Catálogos públicos em testes/fixtures (imbuements.json, venda-itens.json, itens.json).
const fs = require('fs'), path = require('path'), assert = require('assert'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const ARQ = path.join(raiz, 'tibidle-helper.user.js');
const src = fs.readFileSync(ARQ, 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const le = (p) => JSON.parse(fs.readFileSync(path.join(raiz, p), 'utf8'));
const IMBU = le('testes/fixtures/imbuements.json');
const VENDA = le('testes/fixtures/venda-itens.json').itens;
const ITENS = le('testes/fixtures/itens.json').itens;
const BASE = {}; for (const [n, it] of Object.entries(Object.assign({}, ITENS, VENDA))) BASE[n] = { id: it.id, attrs: it.attrs || {}, sell: it.sell || 0 };
const IDS = {}; for (const [n, b] of Object.entries(BASE)) IDS[n] = b.id;

const PURO = trecho('/* @@AUTOHUNT-PURO-INICIO */', '/* @@AUTOHUNT-PURO-FIM */');
const P = new Function(PURO + '\nreturn { normNomeItem, ehEquipamento, materiaisDoCatalogo, escolherDesmarcar, estadoMarcado, motivoNaoDisparaPuro, deveRetomarCiclo, CICLO_PENDENTE_MS, ciclosNaUltimaHora, encerramentoNoScan, mesclarResultadoScan, segundosDaJanela, ouroBase, xpBase, vereditosScan, fimDoScan };')();

let n = 0;
const falhas = [];
const t = async (nome, fn) => { try { await fn(); n++; console.log('ok  ', nome); } catch (e) { falhas.push(nome); console.log('FAIL', nome, '\n   ', e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e); process.exitCode = 1; } };

(async () => {
/* ------------------------------------------------------------------ 1. puras */
const MATS = P.materiaisDoCatalogo(IMBU);
const nomesNorm = {}; for (const k of Object.keys(IDS)) { nomesNorm[P.normNomeItem(k)] = k; nomesNorm[String(IDS[k])] = k; }
const prot = (x) => Object.assign({ equip: true, imbu: true, lista: [], materiais: MATS, nomes: nomesNorm, base: BASE }, x);

await t('equipamento = tem lugar no corpo (/item/info); munição e produto de criatura não', () => {
    for (const nome of ['elvish bow', 'leather boots', 'chain armor', 'life ring', 'wolf tooth chain', 'spellbook', 'crossbow']) assert(P.ehEquipamento(BASE[nome]), nome + ' devia ser equipamento');
    for (const nome of ['arrow', 'sniper arrow', 'goblin ear', 'vampire teeth', 'small axe', 'white mushroom', 'gold coin']) assert(!P.ehEquipamento(BASE[nome]), nome + ' não é equipamento');
});
await t('materiais de imbuement saem do imbuements.json real', () => {
    assert(MATS.length >= 20, 'poucos materiais: ' + MATS.length);
    for (const m of ['vampire teeth', 'bloody pincers', 'rope belt', 'piece of dead brain']) assert(MATS.includes(m), m + ' devia ser material');
    assert(!MATS.includes('gold coin') && !MATS.includes('goblin ear'), 'gold coin/goblin ear não são material');
});
await t('venda do ciclo de 21:3x: elvish bow e leather boots ficam; lixo vende', () => {
    const linhas = ['elvish bow', 'leather boots', 'goblin ear', 'orc tooth', 'vampire teeth', 'white mushroom', 'chain armor', 'arrow', 'small_axe', 'cenoura mágica'].map(nome => ({ nome }));
    const r = P.escolherDesmarcar(linhas, prot({ lista: ['White Mushroom'] }));
    const g = Object.fromEntries(r.guardar.map(x => [x.nome, x.motivo]));
    assert(/equipamento/.test(g['elvish bow']) && /equipamento \(feet\)/.test(g['leather boots']) && /equipamento/.test(g['chain armor']), 'equipamento não guardado: ' + JSON.stringify(g));
    assert.strictEqual(g['vampire teeth'], 'material de imbuement');
    assert.strictEqual(g['white mushroom'], 'sua lista', 'lista do dono ignora maiúscula');
    assert(/não reconhecido/.test(g['cenoura mágica']), 'item desconhecido fica guardado por segurança');
    assert.deepStrictEqual(r.vender.sort(), ['arrow', 'goblin ear', 'orc tooth', 'small axe'], 'vende só o lixo (slug small_axe resolvido): ' + r.vender);
});
await t('venda: sell-check-<id> numérico também resolve; proteções desligadas vendem', () => {
    const r = P.escolherDesmarcar([{ nome: '7438' }, { nome: '11539' }], prot());
    assert.deepStrictEqual(r.guardar.map(x => x.nome), ['elvish bow']);
    assert.deepStrictEqual(r.vender, ['goblin ear']);
    const r2 = P.escolherDesmarcar([{ nome: 'elvish bow' }, { nome: 'vampire teeth' }, { nome: 'cenoura' }], prot({ equip: false, imbu: false }));
    assert.strictEqual(r2.guardar.length, 0, 'tudo desligado → nada guardado');
    const r3 = P.escolherDesmarcar([{ nome: 'elvish bow' }], prot({ base: {} }));
    assert(/sem dados/.test(r3.guardar[0].motivo), '/item/info falhou → guarda');
});
await t('estado da caixa de marcar do painel', () => {
    const el = (o) => Object.assign({ tagName: 'DIV', className: '', textContent: '', getAttribute: () => null, querySelector: () => null }, o);
    assert.strictEqual(P.estadoMarcado(el({ tagName: 'INPUT', checked: false })), false);
    assert.strictEqual(P.estadoMarcado(el({ querySelector: () => ({ checked: true }) })), true);
    assert.strictEqual(P.estadoMarcado(el({ getAttribute: k => k === 'aria-checked' ? 'false' : null })), false);
    assert.strictEqual(P.estadoMarcado(el({ className: 's-sell-check s-sell-check--on' })), true);
    assert.strictEqual(P.estadoMarcado(el({ className: 's-sell-check s-sell-check--off' })), false);
    assert.strictEqual(P.estadoMarcado(el({ textContent: '✓' })), true);
    assert.strictEqual(P.estadoMarcado(el({ className: 's-sell-check' })), null, 'sem pista → null (quem decide é o total)');
});
const pronto = { on: true, huntId: 5, boss: false, scan: null, ciclo: false, trava: null, aprendendo: false, outraAba: false, emHunt: true, modal: false, resta: 0, noLimite: true };
await t('motivoNaoDispara: pronto dispara; boss, Scan ocupado, ciclo e trava seguram', () => {
    assert.strictEqual(P.motivoNaoDisparaPuro(pronto), '');
    assert.strictEqual(P.motivoNaoDisparaPuro(Object.assign({}, pronto, { noLimite: false })), null);
    assert.strictEqual(P.motivoNaoDisparaPuro(Object.assign({}, pronto, { boss: true })), 'boss em andamento');
    assert.strictEqual(P.motivoNaoDisparaPuro(Object.assign({}, pronto, { scan: 'Scan terminando/restaurando' })), 'Scan terminando/restaurando', 'Scan desligado mas ainda indo para o melhor mapa');
    assert.strictEqual(P.motivoNaoDisparaPuro(Object.assign({}, pronto, { ciclo: true })), 'ciclo em andamento');
    assert.strictEqual(P.motivoNaoDisparaPuro(Object.assign({}, pronto, { trava: 'troca de mapa' })), 'troca de mapa em andamento');
    assert(/trava de 5 min/.test(P.motivoNaoDisparaPuro(Object.assign({}, pronto, { resta: 42000 }))));
    assert.strictEqual(P.motivoNaoDisparaPuro(Object.assign({}, pronto, { on: false, boss: true })), 'chave desligada');
});
await t('F5: retoma só com ciclo_pendente recente (< 10 min) e chave ligada', () => {
    const a = { on: true, huntId: 5 }, agora = 1e12;
    assert.strictEqual(P.deveRetomarCiclo(a, null, agora), false, 'sem marca = o dono ficou na cidade');
    assert.strictEqual(P.deveRetomarCiclo(a, { t: agora - 60000 }, agora), true);
    assert.strictEqual(P.deveRetomarCiclo(a, { t: agora - P.CICLO_PENDENTE_MS - 1 }, agora), false, 'marca velha');
    assert.strictEqual(P.deveRetomarCiclo(a, { t: agora + 60000 }, agora), false, 'relógio torto');
    assert.strictEqual(P.deveRetomarCiclo({ on: false, huntId: 5 }, { t: agora }, agora), false);
    assert.strictEqual(P.deveRetomarCiclo({ on: true, huntId: null }, { t: agora }, agora), false);
});
await t('alarme: conta só ciclos automáticos da última hora', () => {
    const agora = 1e12, h = [{ origem: 'auto', t: agora - 5 * 60000 }, { origem: 'auto', t: agora - 20 * 60000 }, { origem: 'venda', t: agora - 10 * 60000 }, { origem: 'auto', t: agora - 61 * 60000 }];
    assert.strictEqual(P.ciclosNaUltimaHora(h, agora), 2);
});
await t('veredito do Scan: xp raw decide, suja e outro nível ficam fora, erro some', () => {
    const r = (o) => Object.assign({ id: o.id, title: 'M' + o.id, nivel: 62, suja: false, erro: null, ouroH: 1000, estavelH: 800 }, o);
    const todos = [
        r({ id: 1, xpH: 120000, xpRawH: 80000 }),            // boost/prey inflou o xp
        r({ id: 2, xpH: 100000, xpRawH: 95000 }),
        r({ id: 3, xpH: 200000, xpRawH: 190000, suja: true }),
        r({ id: 4, xpH: 150000, xpRawH: 150000, nivel: 50 }),
        r({ id: 5, xpH: 90000, xpRawH: 88000, nivel: 61 }),  // ±2: compete
        r({ id: 6, xpH: 91000 }),                             // resultado antigo sem raw: usa xp
        r({ id: 7, xpH: 300000, erro: 'morreu (death)' })
    ];
    const v = P.vereditosScan(todos, 62);
    assert.strictEqual(v.topXp.id, 2, 'melhor XP pelo raw, não pelo xp com boost');
    assert(!v.lista.some(x => x.id === 7), 'resultado com erro não entra na lista');
    const por = Object.fromEntries(v.lista.map(x => [x.id, x]));
    assert.strictEqual(por[3].fora, 'suja'); assert.strictEqual(por[3].veredito, 'suja (mochila)');
    assert.strictEqual(por[4].fora, 'nivel'); assert(/outro nível \(50\)/.test(por[4].veredito));
    assert.strictEqual(por[5].fora, null, 'nível 61 com referência 62 compete');
    assert(por[1].pXp < 90 && !/XP|Os dois/.test(por[1].veredito), '80k raw é < 90% de 95k: ' + por[1].veredito);
    assert.strictEqual(por[2].veredito, 'Os dois', 'melhor raw e ouro igual aos outros');
    assert.deepStrictEqual(v.rank.map(x => x.id).sort(), [1, 2, 5, 6]);
    assert.strictEqual(v.lista[v.lista.length - 1].fora != null, true, 'fora do ranking vai para o fim');
    const semRef = P.vereditosScan(todos, null);
    assert.strictEqual(semRef.nivelRef, 62, 'sem nível conhecido usa o maior medido');
});
await t('ended no Scan: stop do próprio Scan é esperado; morte e fim por fora são falha', () => {
    assert.strictEqual(P.encerramentoNoScan({ ativo: true, esperado: true, reason: 'stopped' }), null);
    assert.strictEqual(P.encerramentoNoScan({ ativo: false, esperado: false, reason: 'death' }), null);
    const m = P.encerramentoNoScan({ ativo: true, esperado: false, reason: 'party_dead' });
    assert(m.falha && m.morte && m.motivo === 'morreu (party_dead)', JSON.stringify(m));
    const e = P.encerramentoNoScan({ ativo: true, esperado: false, reason: 'auto_exit' });
    assert(e.falha && !e.morte && e.motivo === 'encerrou (auto_exit)');
    assert.strictEqual(P.encerramentoNoScan({ ativo: true, esperado: false }).motivo, 'encerrou');
});
await t('falha não apaga resultado bom anterior', () => {
    const bom = { id: 5, xpH: 50000, erro: null, t: 1 }, ruim = { id: 5, xpH: 1200, erro: 'morreu (death) — parcial de 1 min', t: 2, seg: 70 };
    const x = P.mesclarResultadoScan(bom, ruim);
    assert.strictEqual(x.xpH, 50000); assert.strictEqual(x.erro, null); assert(/morreu/.test(x.ultimaFalha.erro)); assert.strictEqual(x.ultimaFalha.seg, 70);
    assert.strictEqual(P.mesclarResultadoScan(undefined, ruim), ruim, 'sem anterior, a falha aparece');
    assert.strictEqual(P.mesclarResultadoScan(bom, { id: 5, xpH: 60000, erro: null }).xpH, 60000, 'medida boa nova substitui');
});
await t('janela pelo elapsedMs do analisador; relógio da página só de reserva', () => {
    assert.strictEqual(P.segundosDaJanela(305000, 5000, 999), 300);
    assert.strictEqual(P.segundosDaJanela(5000, 5000, 42), 42, 'analisador parado → página');
    assert.strictEqual(P.segundosDaJanela(undefined, undefined, 0), 1);
});
await t('ao terminar: "ficar" só vale se escolhido; padrão volta como estava', () => {
    assert.strictEqual(P.fimDoScan({}), 'voltar');
    assert.strictEqual(P.fimDoScan({ fim: 'ficar' }), 'voltar', 'config antiga com o padrão ficar');
    assert.strictEqual(P.fimDoScan({ fim: 'ficar', fimEscolhido: true }), 'ficar');
    assert.strictEqual(P.fimDoScan({ fim: 'xp' }), 'xp');
});

/* ------------------------------------------------------- 2. venda contra painel falso */
const VENDA_SRC = trecho('/* @@AUTOHUNT-VENDA-INICIO */', '/* @@AUTOHUNT-VENDA-FIM */');
function montarVenda(itens, opc) {
    opc = opc || {};
    const J = { itens: itens.map(i => Object.assign({ marcado: true }, i)), ouro: 1000, aberto: false, confirmou: false, vendidos: null, logs: [] };
    const total = () => J.itens.filter(i => i.marcado).reduce((s, i) => s + i.valor, 0);
    const el = (testid, o) => Object.assign({ isConnected: true, tagName: 'DIV', className: '', textContent: '', getAttribute: k => (k === 'data-testid' ? testid : null),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }), dispatchEvent() { }, click() { }, querySelector: () => null }, o);
    const idDe = opc.testid || (nome => 'sell-check-' + nome);
    const checks = J.itens.map(i => {
        const e = el(idDe(i.nome));
        e.getAttribute = k => k === 'data-testid' ? idDe(i.nome) : (k === 'aria-checked' && !opc.semEstado ? String(i.marcado) : null);
        e.click = () => { if (!(opc.ignora || []).includes(i.nome)) i.marcado = !i.marcado; };
        return e;
    });
    const totalEl = el('sell-total'); Object.defineProperty(totalEl, 'textContent', { get: () => (opc.totalTravado != null ? opc.totalTravado : total()).toLocaleString('pt-BR') });
    const confirm = el('sell-confirm'); Object.defineProperty(confirm, 'disabled', { get: () => total() === 0 });
    confirm.click = () => { J.confirmou = true; J.vendidos = J.itens.filter(i => i.marcado).map(i => i.nome); J.ouro += total(); J.aberto = false; };
    const doc = {
        'actionbar-selling': el('actionbar-selling', { click: () => { J.aberto = true; } }),
        'sell-cancel': el('sell-cancel', { click: () => { J.aberto = false; } })
    };
    const tid = (k) => {
        if (k === 'sell-panel') return J.aberto ? el('sell-panel') : null;
        if (k === 'sell-total') return J.aberto ? totalEl : null;
        if (k === 'sell-confirm') return J.aberto ? confirm : null;
        if (k === 'hud-gold') return { textContent: String(J.ouro) };
        if (k === 'confirm-ok') return null;
        return doc[k] || null;
    };
    const $$ = (sel) => {
        if (!J.aberto) return [];
        return sel.split(',').flatMap(s => {
            const pre = s.match(/\[data-testid\^="([^"]+)"\]/), eq = s.match(/\[data-testid="([^"]+)"\]/);
            const lista = opc.semLinhas ? [] : checks;
            if (pre) return lista.filter(c => c.getAttribute('data-testid').startsWith(pre[1]));
            if (eq) return lista.filter(c => c.getAttribute('data-testid') === eq[1]);
            return [];
        });
    };
    const autoHunt = () => Object.assign({ nvEquip: true, nvImbu: true, nuncaVender: [] }, opc.ah || {});
    const MEM = {};
    const esperarQue = async (fn, timeoutMs) => { const fim = Date.now() + Math.min(timeoutMs, 400); while (Date.now() < fim) { try { const v = fn(); if (v) return v; } catch (e) { } await new Promise(r => setTimeout(r, 3)); } return null; };
    const F = new Function('ctx', `
        const { tid, $$, autoHunt, esperarQue, J, IDS, BASE, IMBU, MEM, opc } = ctx;
        const dorme = async () => {}; const log = (m, tipo) => J.logs.push((tipo || 'info') + ': ' + m);
        const ler = (k, p) => (k in MEM ? MEM[k] : p), guardar = (k, v) => { MEM[k] = v; };
        const buscarJSON = async (c) => { if (opc.semRede) throw new Error('offline'); if (/imbuements/.test(c)) return IMBU; throw new Error('404 ' + c); };
        const idsPorNome = async () => { if (opc.semRede) throw new Error('offline'); return IDS; };
        const basePorNome = async (nomes) => BASE;
        const cliqueCompleto = (e) => e.click();
        const lerOuroNum = () => J.ouro;
        class MouseEvent { constructor(t) { this.type = t; } } class PointerEvent extends MouseEvent { }
        ${PURO}
        ${VENDA_SRC}
        return { venderNoNpc };
    `);
    return { J, venderNoNpc: F({ tid, $$, autoHunt, esperarQue, J, IDS, BASE, IMBU, MEM, opc }).venderNoNpc };
}
const loteIncidente = () => [{ nome: 'elvish bow', valor: 200 }, { nome: 'leather boots', valor: 2 }, { nome: 'goblin ear', valor: 20 * 7 }, { nome: 'orc tooth', valor: 150 * 3 }, { nome: 'vampire teeth', valor: 275 * 4 }, { nome: 'white mushroom', valor: 12 }];

await t('venda: desmarca equipamento, material e a lista do dono; vende o resto', async () => {
    const V = montarVenda(loteIncidente(), { ah: { nuncaVender: ['white mushroom'] } });
    const r = await V.venderNoNpc();
    assert(r.ok && !r.erro, JSON.stringify(r));
    assert.deepStrictEqual(V.J.vendidos.sort(), ['goblin ear', 'orc tooth']);
    assert.strictEqual(r.total, 140 + 450, 'o total vendido é só o do lixo');
    assert.deepStrictEqual(r.guardados.map(g => g.nome).sort(), ['elvish bow', 'leather boots', 'vampire teeth', 'white mushroom']);
});
await t('venda: caixa que não desmarca = NADA vendido, painel fechado', async () => {
    const V = montarVenda(loteIncidente(), { ignora: ['elvish bow'] });
    const r = await V.venderNoNpc();
    assert(r.erro && /elvish bow/.test(r.erro) && /NADA vendido/.test(r.erro), JSON.stringify(r));
    assert.strictEqual(V.J.confirmou, false, 'não pode ter confirmado'); assert.strictEqual(V.J.aberto, false, 'painel fechado');
    assert.strictEqual(V.J.ouro, 1000);
});
await t('venda: sem pista de estado na caixa, o total baixando basta; total travado = não vende', async () => {
    const V = montarVenda(loteIncidente(), { semEstado: true });
    const r = await V.venderNoNpc();
    assert(r.ok && V.J.confirmou && V.J.vendidos.sort().join() === 'goblin ear,orc tooth,white mushroom', JSON.stringify(r) + ' ' + V.J.vendidos);
    const V2 = montarVenda(loteIncidente(), { semEstado: true, totalTravado: 1904 });
    const r2 = await V2.venderNoNpc();
    assert(r2.erro && !V2.J.confirmou, 'total que não baixa não prova nada — não vende: ' + JSON.stringify(r2));
});
await t('venda: painel sem linhas, ou sem rede para a lista, não vende', async () => {
    const V = montarVenda(loteIncidente(), { semLinhas: true });
    const r = await V.venderNoNpc();
    assert(r.erro && /sem linhas/.test(r.erro) && !V.J.confirmou, JSON.stringify(r));
    const V2 = montarVenda(loteIncidente(), { semRede: true });
    const r2 = await V2.venderNoNpc();
    assert(r2.erro && /nunca vender/.test(r2.erro) && !V2.J.aberto && !V2.J.confirmou, JSON.stringify(r2));
});
await t('venda: só itens protegidos → nada para vender, ok', async () => {
    const V = montarVenda([{ nome: 'elvish bow', valor: 200 }, { nome: 'vampire teeth', valor: 275 }]);
    const r = await V.venderNoNpc();
    assert(r.ok && r.vazio && !V.J.confirmou && r.guardados.length === 2, JSON.stringify(r));
});

/* --------------------------------- 3. script inteiro no vm: morte no Scan e restauração */
await (async () => {
    const store = new Map();
    const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); }, key: i => [...store.keys()][i], get length() { return store.size; } };
    const lsProxy = new Proxy(ls, { ownKeys: () => [...store.keys()], getOwnPropertyDescriptor: (o, k) => store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : undefined });
    const G = (k, v) => store.set('tb_helper_' + k, JSON.stringify(v)), L = (k) => JSON.parse(store.get('tb_helper_' + k) || 'null');
    G('era', (src.match(/const ERA = '([^']+)'/) || [])[1]);
    const HUNTS = [{ id: 5, title: 'Mapa A', levelMin: 1, lureTiers: [{ max: 3 }, { max: 5 }, { max: 7 }], monsters: [] },
                   { id: 7, title: 'Mapa B', levelMin: 1, lureTiers: [{ max: 3 }, { max: 6 }], monsters: [] }];
    /* servidor falso */
    const S = { sock: null, huntId: null, lure: 1, elapsed: 0, xp: 0, jogando: false, resumo: false, enviados: [] };
    const emitir = (o) => { if (S.sock) (S.sock.l.message || []).forEach(f => f({ data: JSON.stringify(o) })); };
    const servidor = (o) => {
        S.enviados.push(o);
        const d = o.data || {};
        if (o.type === 'start_hunt') { Object.assign(S, { huntId: d.huntId, lure: d.lure, elapsed: 0, xp: 0, jogando: true }); setTimeout(() => emitir({ type: 'hunt_started', data: { huntId: d.huntId, lure: d.lure } }), 10); }
        else if (o.type === 'stop') { S.jogando = false; setTimeout(() => { S.resumo = true; emitir({ type: 'ended', data: { summary: { huntId: S.huntId, reason: 'stopped' } } }); }, 10); }
        else if (o.type === 'analyzer_reset') { S.elapsed = 0; S.xp = 0; }
        else if (o.type === 'set_lure') S.lure = d.tier;
    };
    const PARTY = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'].map(v => ({ vocation: v, hp: 100, maxHp: 100, mana: 50, maxMana: 100, suppliesGold: 0, supplyUsed: {} }));
    const relogio = setInterval(() => {
        if (!S.jogando) return;
        S.elapsed += 3000; S.xp += 500;
        emitir({ type: 'frame', data: { state: { cap: { used: 300, total: 1000 }, balance: 5000, lureTier: S.lure, character: { level: 62 }, party: PARTY, active: [] },
            analyzer: { elapsedMs: S.elapsed, xp: S.xp, xpRaw: S.xp * 0.8, xpPerHour: 0, killsTotal: S.xp / 100, lootGold: S.xp, suppliesGold: S.xp / 10, drops: {} } } });
    }, 20);
    class FakeWS { constructor(u) { this.url = u; this.readyState = 1; this.l = {}; } addEventListener(tp, f) { (this.l[tp] = this.l[tp] || []).push(f); } send(d) { servidor(JSON.parse(d)); } }
    const fakeEl = () => ({ style: {}, dataset: {}, classList: { toggle() { }, add() { }, remove() { }, contains: () => false }, children: [], innerHTML: '', textContent: '',
        append() { }, appendChild() { }, addEventListener() { }, removeEventListener() { }, querySelector: () => null, querySelectorAll: () => [], getAttribute: () => null, setAttribute() { }, insertAdjacentElement() { }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }) });
    const document = { readyState: 'complete', head: fakeEl(), body: fakeEl(), documentElement: fakeEl(), createElement: () => fakeEl(), getElementById: () => null, addEventListener() { }, removeEventListener() { },
        querySelector: (sel) => (sel === '[data-testid="summary-close"]' && S.resumo) ? { click: () => { S.resumo = false; } } : null, querySelectorAll: () => [] };
    const intervalos = [], erros = [];
    const resp = (j) => ({ ok: true, status: 200, json: async () => j, text: async () => JSON.stringify(j) });
    const fetch = async (u) => { const c = String(u).replace(/^https?:\/\/[^/]+/, '').split('?')[0]; if (c === '/hunts/select') return resp(HUNTS); if (c === '/spells') return resp([]); return { ok: false, status: 404, json: async () => ({}), text: async () => '' }; };
    const window = { WebSocket: FakeWS, addEventListener() { }, removeEventListener() { }, innerWidth: 1400, innerHeight: 900, open() { }, matchMedia: () => ({ matches: false, addEventListener() { } }) };
    const ctx = { window, document, localStorage: lsProxy, WebSocket: FakeWS, fetch, navigator: {}, location: { href: 'https://play.tibidle.com/' },
        console: { log() { }, warn() { }, info() { }, error: (...a) => erros.push(a.map(String).join(' ')) },
        setTimeout, clearTimeout, setInterval: (f, ms) => { intervalos.push({ f, ms }); return intervalos.length; }, clearInterval() { },
        requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame() { }, performance: { now: () => Date.now() },
        MouseEvent: class { }, PointerEvent: class { }, KeyboardEvent: class { }, Event: class { }, MutationObserver: class { observe() { } disconnect() { } },
        getComputedStyle: () => ({}), structuredClone: (x) => JSON.parse(JSON.stringify(x)), crypto: {}, Uint8Array, TextDecoder };
    ctx.globalThis = ctx; window.localStorage = lsProxy; window.document = document;
    /* gancho só do teste: expõe o que o teste dirige, sem depender do window.__tbHelper */
    const ancora = "\n    if (document.readyState === 'loading')";
    assert(src.includes(ancora), 'âncora do gancho de teste sumiu do script');
    const codigo = src.replace(ancora, "\n    window.__tbTeste = { scanIniciar, scanParar, amostrar, get SCAN() { return SCAN; }, get ESTADO_WS() { return ESTADO_WS; } };" + ancora);
    vm.createContext(ctx);
    vm.runInContext(codigo, ctx, { filename: 'tibidle-helper.user.js' });
    const T = window.__tbTeste;
    const espera = async (fn, ms, passo) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (fn()) return true; } catch (e) { } await new Promise(r => setTimeout(r, passo || 30)); } return false; };
    const amostrar = () => { const a = intervalos.find(x => x.ms === 3000); if (a) a.f(); else T.amostrar(); };
    const girar = async (fn, ms) => espera(() => { amostrar(); return fn(); }, ms, 60);
    try {
        await espera(() => intervalos.some(x => x.ms === 3000), 5000);
        S.sock = new window.WebSocket('wss://x');
        const perfil = (voc, skill) => ({ active: 0, list: [{ name: '1', config: { heals: [{ name: 'Light Healing', percent: 60 }], manaPotion: null, skills: [skill, null, null, null], minCreatures: {}, supports: [] } }, { name: '2', config: null }] });
        const PERFIS = { KNIGHT: perfil('KNIGHT', 'Brutal Strike'), PALADIN: perfil('PALADIN', 'Divine Missile'), SORCERER: perfil('SORCERER', 'Energy Strike'), DRUID: perfil('DRUID', 'Ice Strike') };
        emitir({ type: 'welcome', data: { worldToken: 'tok', profiles: PERFIS, roster: PARTY.map(p => ({ vocation: p.vocation })) } });
        await espera(() => T.ESTADO_WS.profiles, 2000);

        await t('vm: morte no meio do Scan para, grava a parcial sem apagar o bom, devolve os kits e não reentra', async () => {
            G('scan_cfg', { mapas: [5], minutos: 1, lureMax: true, fim: 'voltar' });
            G('scan_resultados', { 5: { id: 5, title: 'Mapa A', xpH: 99999, xpRawH: 88888, ouroH: 1000, nivel: 62, erro: null, t: 1 } });
            assert.strictEqual(T.scanIniciar(), true, 'Scan não ligou');
            assert(await girar(() => T.SCAN.fase === 'medindo' && T.SCAN.vivo && T.SCAN.vivo.seg >= 6, 20000), 'não chegou a medir: fase ' + T.SCAN.fase);
            /* o "Scan" mexeu no kit do Knight (como o aplicarEmTodos faria) */
            S.sock.send(JSON.stringify({ type: 'profiles_set', data: { vocation: 'KNIGHT', profiles: perfil('KNIGHT', 'Groundshaker') } }));
            const k = S.enviados.length;
            S.jogando = false;
            emitir({ type: 'ended', data: { summary: { huntId: 5, reason: 'party_dead' } } });
            assert(await girar(() => !T.SCAN.ativo && !T.SCAN.restaurando && !T.SCAN.ocupado, 10000), 'Scan não parou depois da morte');
            const r = L('scan_resultados')[5];
            assert.strictEqual(r.xpH, 99999, 'o resultado bom anterior foi apagado');
            assert(r.ultimaFalha && /morreu \(party_dead\)/.test(r.ultimaFalha.erro) && /parcial/.test(r.ultimaFalha.erro), 'falha não registrada: ' + JSON.stringify(r.ultimaFalha));
            const depois = S.enviados.slice(k);
            assert(!depois.some(o => o.type === 'start_hunt'), 'reentrou em caçada depois da morte: ' + JSON.stringify(depois.map(o => o.type)));
            const ps = depois.filter(o => o.type === 'profiles_set');
            assert(ps.length === 1 && ps[0].data.vocation === 'KNIGHT' && ps[0].data.profiles.list[0].config.skills[0] === 'Brutal Strike', 'kit do Knight não devolvido: ' + JSON.stringify(ps));
            assert(/MORTE/.test(JSON.stringify(L('log'))), 'log não fala da morte');
        });

        await t('vm: parar pelo botão volta para o mapa e o lure de antes (o ended do próprio Scan não é falha)', async () => {
            S.resumo = false;
            Object.assign(S, { huntId: 7, lure: 2, elapsed: 0, xp: 0, jogando: true });
            emitir({ type: 'hunt_started', data: { huntId: 7, lure: 2 } });
            assert(await espera(() => T.ESTADO_WS.huntId === 7 && T.ESTADO_WS.frame && T.ESTADO_WS.frame.lureTier === 2, 3000), 'party não está no Mapa B');
            G('scan_cfg', { mapas: [5], minutos: 1, lureMax: true, fim: 'voltar' });
            assert.strictEqual(T.scanIniciar(), true, 'Scan não ligou');
            assert.strictEqual(T.SCAN.foto.huntId, 7); assert.strictEqual(T.SCAN.foto.lureTier, 2);
            assert(await girar(() => T.SCAN.fase === 'medindo', 20000), 'não chegou a medir: fase ' + T.SCAN.fase);
            assert.strictEqual(T.SCAN.ativo, true, 'o ended do stop do próprio Scan derrubou o Scan');
            const st = S.enviados.filter(o => o.type === 'start_hunt').pop();
            assert.deepStrictEqual(st.data, { huntId: 5, lure: 3 }, 'Scan entrou sem o lure máximo');
            const k = S.enviados.length;
            T.scanParar('pelo botão');
            assert(await espera(() => !T.SCAN.restaurando && !T.SCAN.ocupado, 20000), 'restauração não terminou');
            const volta = S.enviados.slice(k).filter(o => o.type === 'start_hunt');
            assert(volta.length === 1 && volta[0].data.huntId === 7 && volta[0].data.lure === 2, 'não voltou para o Mapa B no lure 2: ' + JSON.stringify(volta));
            assert.strictEqual(S.huntId, 7);
        });
    } finally {
        clearInterval(relogio);
        const graves = erros.filter(e => !/painel/.test(e));
        if (graves.length) console.log('   (console.error do script no vm: ' + graves.slice(0, 3).join(' | ') + ')');
    }
})();

console.log(`\n${n} testes ok` + (falhas.length ? ` · ${falhas.length} FALHARAM: ${falhas.join(' · ')}` : ''));
process.exit(process.exitCode || 0);
})();

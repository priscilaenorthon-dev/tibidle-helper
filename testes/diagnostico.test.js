// Roda: node testes/diagnostico.test.js
// O Diagnóstico (v2.11) só lê: guarda a FORMA das mensagens (campos e tipos) e monta um relatório.
// Aqui: extrai o trecho @@DIAGNOSTICO e confere que o relatório nunca carrega valores (token, ticket, nome).
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const i = src.indexOf('/* @@DIAGNOSTICO-INICIO */'), f = src.indexOf('/* @@DIAGNOSTICO-FIM */');
assert(i > 0 && f > i, 'marcadores @@DIAGNOSTICO não encontrados');
const M = new Function(`
    const VERSAO = 'teste', VOCS = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'];
    const window = { innerWidth: 1400, innerHeight: 900 }, localStorage = { length: 0, key: () => null, getItem: () => null };
    let CONTA = null; const ESTADO_WS = { perfisDoServidor: false, frame: null, sk: {} }, CAT = {}, PROG = { best: {} }, ERROS = { porLugar: {} };
    const tid = () => null, socketAberto = () => false, perfilReal = () => false, frameFresco = () => false, danosMedidosNesteNivel = () => 0;
    const log = () => {}, falhou = (o, e) => { throw e; };
    ${src.slice(i, f)}
    return { DIAG, diagObservar, montarDiagnostico, ESTADO_WS };
`)();
let n = 0; const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
t('guarda só a forma: nenhum valor (token, ticket, nome de conta) vai para o relatório', () => {
    M.diagObservar({ type: 'welcome', data: { worldToken: 'SEGREDO-TOKEN-123', account: { name: 'ContaSecreta', id: 'cmt-id-xyz' }, meta: { wildcards: 7 } } });
    M.diagObservar({ type: 'frame', data: { state: { keyBag: { 'chave x': 2 }, party: [{ vocation: 'KNIGHT', skills: { melee: { value: 30, bonus: 2 } } }], inventory: [{ name: 'gold', count: 3 }] },
                                           analyzer: { elapsedMs: 1000 }, bestiaryKills: 55, events: [{ kind: 'kill', id: 9, xp: 100 }] } });
    const txt = M.montarDiagnostico();
    for (const segredo of ['SEGREDO-TOKEN-123', 'ContaSecreta', 'cmt-id-xyz']) assert(!txt.includes(segredo), 'vazou ' + segredo);
    assert(/frame.state.keyBag .*\{chave x:number\}/.test(txt), 'forma do keyBag ausente');
    assert(/party\[\]\.skills .*melee:\{value:number, bonus:number\}/.test(txt), 'forma das skills ausente');
    assert(/welcome\.meta .*wildcards:number/.test(txt), 'forma do meta ausente');
});
t('sem conexão: aponta o que falta em vez de quebrar', () => {
    const txt = M.montarDiagnostico();
    assert(/^FALTA\s+socket do jogo aberto/m.test(txt) && /^FALTA\s+perfis vieram do servidor/m.test(txt));
});
console.log(`\n${n} testes ok`);

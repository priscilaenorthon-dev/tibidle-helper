// Roda: node testes/treinador.test.js
// 2.67.0 — treinador (aba Progresso): especialistas puros e o chefe.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const i = src.indexOf('/* @@TREINADOR-PURO-INICIO'), f = src.indexOf('/* @@TREINADOR-PURO-FIM');
assert(i > 0 && f > i, 'trecho @@TREINADOR-PURO não encontrado');
const T = new Function(src.slice(i, f) + '\nreturn { TR_BASE, TR_AGENTES, trConselho, trOrdenar, trRodar, trFotoVazia, trCacada };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
// agentes falsos: empurra em TR_AGENTES, roda e limpa sempre
const comAgentes = (agentes, fn) => { T.TR_AGENTES.push(...agentes); try { return fn(); } finally { T.TR_AGENTES.length = 0; } };
const ag = (id, rodar, extra) => Object.assign({ id, nome: id, icone: '·', rodar }, extra || {});

t('foto vazia não quebra nenhum especialista e não gera passo', () => {
    const r = T.trRodar(T.trFotoVazia(), T.TR_BASE);
    assert.deepStrictEqual(r.passos, []);
    assert.strictEqual(r.cartoes.length, T.TR_AGENTES.length);
});
t('foto vazia tem o formato canônico', () => {
    const fv = T.trFotoVazia();
    for (const k of ['ouroLivre', 'bencaos', 'ampulhetas', 'selo']) assert(k in fv, k);
    assert(!('skillsTreino' in fv));
});
t('trConselho preenche os padrões', () => {
    const c = T.trConselho('upar', 'x', { titulo: 'a', impacto: 5 });
    assert.strictEqual(c.confianca, 'estimado'); assert.strictEqual(c.custo, 0); assert.strictEqual(c.acao, null);
});
t('trConselho não deixa o objeto trocar id nem agente', () => {
    const c = T.trConselho('upar', 'x', { id: 'outro', agente: 'falso', impacto: 1 });
    assert.strictEqual(c.id, 'upar:x'); assert.strictEqual(c.agente, 'upar');
});
t('trOrdenar descarta impacto ≤ 0, NaN, texto e estado ok', () => {
    const r = T.trOrdenar([
        { id: 'a', impacto: 0 }, { id: 'b', impacto: -3 }, { id: 'c', impacto: NaN }, { id: 'd', impacto: 'xyz' },
        { id: 'e', impacto: 5, estado: 'ok' }, null, { id: 'f', impacto: '4' }], {});
    assert.deepStrictEqual(r.map(c => c.id), ['f']);
});
t('trOrdenar pesa pela confiança (maiúsculas também; desconhecida = 0,4)', () => {
    const r = T.trOrdenar([
        { id: 'est', impacto: 10, confianca: 'estimado' }, { id: 'med', impacto: 5, confianca: 'MEDIDO' },
        { id: 'wik', impacto: 8, confianca: 'wiki' }, { id: 'xx', impacto: 9, confianca: 'chute' }], {});
    assert.deepStrictEqual(r.map(c => c.id), ['med', 'wik', 'est', 'xx']); // 5 · 4,8 · 4 · 3,6
    assert.strictEqual(r[0].nota, 5);
});
t('trOrdenar: sem ouro → semOuro e nota × 0,3; ouroLivre não numérico = sem limite', () => {
    const cs = [{ id: 'caro', impacto: 10, confianca: 'medido', custo: 2e6 }, { id: 'barato', impacto: 5, confianca: 'medido', custo: '1000' }];
    const r = T.trOrdenar(cs, { ouroLivre: 1e6 });
    assert.deepStrictEqual(r.map(c => c.id), ['barato', 'caro']);
    assert.strictEqual(r[1].semOuro, true); assert.strictEqual(r[1].nota, 3); assert.strictEqual(r[0].semOuro, false);
    for (const livre of [null, undefined, NaN, '5']) {
        const s = T.trOrdenar(cs, { ouroLivre: livre });
        assert(s.every(c => !c.semOuro), String(livre));
    }
});
t('agente que lança erro → cartão "erro" e fora dos passos', () => comAgentes([
    ag('quebra', () => { throw new Error('bum'); }),
    ag('bom', () => [T.trConselho('bom', 'x', { impacto: 3, confianca: 'wiki' })])], () => {
    const r = T.trRodar(T.trFotoVazia(), T.TR_BASE);
    assert.strictEqual(r.cartoes[0].estado, 'erro'); assert(/bum/.test(r.cartoes[0].conselhos[0].porque));
    assert.deepStrictEqual(r.passos.map(c => c.id), ['bom:x']);
}));
t('retorno não-array e itens null são normalizados', () => comAgentes([
    ag('um', () => T.trConselho('um', 'x', { impacto: 2 })),
    ag('nada', () => null),
    ag('sujo', () => [null, undefined, 7, 'texto', T.trConselho('sujo', 'y', { impacto: 1 })])], () => {
    const r = T.trRodar(T.trFotoVazia(), T.TR_BASE);
    assert.strictEqual(r.cartoes.length, 3);
    assert.strictEqual(r.cartoes[0].conselhos.length, 1); assert.strictEqual(r.cartoes[1].conselhos.length, 0);
    assert.strictEqual(r.cartoes[1].estado, 'ok');
    assert.deepStrictEqual(r.todos.map(c => c.id), ['um:x', 'sujo:y']);
}));
t('passos: só os 3 melhores; cartão mostra o erro primeiro', () => comAgentes([
    ag('muitos', () => [1, 2, 3, 4, 5].map(k => T.trConselho('muitos', 'k' + k, { impacto: k, confianca: 'medido' }))
        .concat([T.trConselho('muitos', 'grave', { impacto: 0.1, estado: 'erro' })]))], () => {
    const r = T.trRodar(T.trFotoVazia(), T.TR_BASE);
    assert.deepStrictEqual(r.passos.map(c => c.id), ['muitos:k5', 'muitos:k4', 'muitos:k3']);
    assert.strictEqual(r.cartoes[0].estado, 'erro');
    assert.deepStrictEqual(r.cartoes[0].conselhos.map(c => c.id), ['muitos:grave', 'muitos:k5', 'muitos:k4']);
}));
t('fase 2 roda por último e recebe os conselhos da fase 1; fase 1 recebe []', () => {
    const vistos = {};
    comAgentes([
        ag('chefe', (fo, b, todos) => { vistos.chefe = todos.map(c => c.id); return []; }, { fase: 2 }),
        ag('a', (fo, b, todos) => { vistos.a = todos; return [T.trConselho('a', 'x', { impacto: 1 })]; }),
        ag('b', () => [T.trConselho('b', 'y', { impacto: 2 })])], () => {
        const r = T.trRodar(T.trFotoVazia(), T.TR_BASE);
        assert.deepStrictEqual(vistos.a, []);
        assert.deepStrictEqual(vistos.chefe, ['a:x', 'b:y']);
        assert.deepStrictEqual(r.cartoes.map(c => c.id), ['chefe', 'a', 'b']); // ordem de TR_AGENTES
    });
});
t('TR_BASE: faixas cobrem 1..999 sem buraco e citam caçadas da wiki', () => {
    const fx = T.TR_BASE.faixas; assert(fx.length >= 4);
    assert.strictEqual(fx[0].de, 1); assert.strictEqual(fx[fx.length - 1].ate, 999);
    for (let k = 1; k < fx.length; k++) assert.strictEqual(fx[k].de, fx[k - 1].ate, 'faixa contínua');
    assert(fx.some(x => x.hunts.includes('Shadow Nexus')));
});
t('TR_BASE: bênção no 250 = 29.750 cada; as 7 no 200 = 198.000; Legado tem marcos crescentes', () => {
    assert.strictEqual(T.TR_BASE.bencaos.preco(250), 29750);
    assert.strictEqual(T.TR_BASE.bencaos.total(200), 198000);
    const b = T.TR_BASE.legado.bonus; for (let k = 1; k < b.length; k++) assert(b[k] > b[k - 1]);
});
t('TR_BASE: skills do Legado no vocabulário do helper (melee/dist/ml)', () => {
    assert.deepStrictEqual(T.TR_BASE.legado.skill, { KNIGHT: 'melee', PALADIN: 'dist', SORCERER: 'ml', DRUID: 'ml' });
    assert.strictEqual(T.TR_BASE.legado.skillInicio, 60); assert.strictEqual(T.TR_BASE.legado.mlInicio, 40);
});
t('TR_BASE: frações com sufixo Frac', () => {
    assert.strictEqual(T.TR_BASE.bencaos.corteFrac, 0.56); assert.strictEqual(T.TR_BASE.morte.perdaFracSemBencao, 0.0227);
    assert.strictEqual(T.TR_BASE.premium.autoSellFrac, 0.9); assert.strictEqual(T.TR_BASE.mercado.taxaCriacaoFrac, 0.05);
    assert.strictEqual(T.TR_BASE.spawn.fatorDanoFrac, 0.707);
});
t('TR_BASE: Selo — Rolar da faixa 70 = 4.300', () => {
    assert.strictEqual(T.TR_BASE.selo.rolar(70), 4300); assert.strictEqual(T.TR_BASE.selo.rolar(79), 4300);
});
t('TR_BASE: ilhas com custo e material', () => {
    const m = T.TR_BASE.ilhas.find(x => x.nome === 'Marapur');
    assert.strictEqual(m.ouro, 10e6); assert.strictEqual(m.materiais[0].nome, 'Spectral Conch'); assert.strictEqual(m.materiais[0].qtd, 10);
});
t('TR_BASE: bosses com tentativa (sempre lista) e drops; ampulheta com preços', () => {
    const tim = T.TR_BASE.bosses.find(b => b.nome === 'Timira');
    assert.strictEqual(tim.rec, 340); assert.strictEqual(tim.tentativa[0].qtd, 5); assert(/naga/i.test(tim.drops));
    for (const b of T.TR_BASE.bosses) assert(Array.isArray(b.tentativa) && b.tentativa.every(x => x.item && x.qtd > 0), b.nome);
    assert.strictEqual(T.TR_BASE.bosses.find(b => b.nome === 'Jaul').tentativa.length, 2);
    assert.strictEqual(T.TR_BASE.ampulheta.horasDia, 8); assert(T.TR_BASE.ampulheta.preco8h > 0);
});
t('TR_BASE: tokens da Invasão sem Infinity; melee do topo fora do objeto por vocação', () => {
    assert(T.TR_BASE.invasao.tokens.every(([pos]) => Number.isFinite(pos)));
    assert(!('meleeTopo' in T.TR_BASE.topoVisto)); assert.deepStrictEqual(T.TR_BASE.topoMelee, [66, 79]);
});
t('trCacada: Shadow Nexus → Rec 250 na Inquisition; caçada de Rec < 200 só traz a faixa; desconhecida → null', () => {
    const sn = T.trCacada('Shadow Nexus');
    assert.strictEqual(sn.rec, 250); assert.strictEqual(sn.ilha, 'the_inquisition'); assert.strictEqual(sn.faixa.de, 250);
    assert.strictEqual(T.trCacada('shadow nexus', T.TR_BASE).rec, 250);
    const dw = T.trCacada('Draken Walls');
    assert.strictEqual(dw.rec, null); assert.strictEqual(dw.faixa.de, 130);
    assert.strictEqual(T.trCacada('Não Existe'), null); assert.strictEqual(T.trCacada(''), null);
});
process.on('exit', () => { if (!process.exitCode) console.log(`\n${n} testes ok`); });

// Roda: node testes/formacao.test.js
// Formação por boss (2.31.0): extrai o bloco @@FORMACAO-PURO — perigo por casa (das casas que cada magia do boss cobriu),
// alcance por vocação (regra + o medido) e a escolha da casa de Paladino/Feiticeiro/Druida.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const M = new Function(trecho('/* @@FORMACAO-PURO-INICIO', '/* @@FORMACAO-PURO-FIM */') + '\nreturn { FORMACAO_CELULAS, FORMACAO_ALCANCE, fmKey, fmPos, fmDist, formacaoPerigo, formacaoAlcanca, formacaoSugerir };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
/* boss à direita do Cavaleiro [1,0]; feixe (linha) para a direita cobrindo x 1..4 em y 0, 10 lançamentos em 10 min de 300; e uma
 * área 3×3 em volta do Cavaleiro (x −1..1, y −1..1) de 120, 20 lançamentos */
const cel = (x, y, n, medio) => ({ k: x + ',' + y, n, medio });
const DM = { seg: 600, sessoes: 1, posMob: { 'Dragon Lord': '1,0' }, alcance: {},
             crias: [{ nome: 'Dragon Lord', porH: 0, golpes: null, magias: [
                 { atk: 'fire beam', el: 'fogo', n: 10, medio: 300, max: 400, porH: 18000, celulas: [cel(1, 0, 10, 300), cel(2, 0, 10, 300), cel(3, 0, 10, 300), cel(4, 0, 10, 300)] },
                 { atk: 'explosion', el: 'fisico', n: 20, medio: 120, max: 150, porH: 14400, celulas: [cel(-1, 0, 20, 120), cel(0, 0, 20, 120), cel(1, 0, 20, 120), cel(0, 1, 20, 120), cel(0, -1, 20, 120), cel(-1, -1, 20, 120), cel(1, 1, 20, 120), cel(-1, 1, 20, 120), cel(1, -1, 20, 120)] } ] }] };

t('as 18 casas da formação: duas caixas 3×3 em x −4..−2 e 2..4, y −1..1; distância em casas (Chebyshev)', () => {
    assert.strictEqual(M.FORMACAO_CELULAS.length, 18);
    assert(M.FORMACAO_CELULAS.every(([x, y]) => Math.abs(x) >= 2 && Math.abs(x) <= 4 && Math.abs(y) <= 1));
    assert.strictEqual(M.fmDist([-3, 1], [1, 0]), 4); assert.strictEqual(M.fmDist([2, -1], [1, 0]), 1);
    assert.deepStrictEqual(M.fmPos('-2,1'), [-2, 1]); assert.strictEqual(M.fmKey([3, -1]), '3,-1');
});
t('perigo por casa: dano médio × lançamentos/h, só nas casas que a magia cobriu (feixe: 18 mil/h em [2,0]..[4,0]; nada em [−2,0])', () => {
    const { perigo, porMagia, medido } = M.formacaoPerigo(DM);
    assert(medido);
    assert.strictEqual(perigo['2,0'], 18000); assert.strictEqual(perigo['4,0'], 18000);
    assert.strictEqual(perigo['-2,0'], undefined);
    assert.strictEqual(perigo['1,0'], 18000 + 14400, 'a casa [1,0] leva o feixe e a explosão');
    assert.strictEqual(porMagia['3,0'][0].atk, 'fire beam');
    assert.deepStrictEqual(M.formacaoPerigo(null), { perigo: {}, porMagia: {}, medido: false });
});
t('alcance: magos até 3 casas do boss, Paladino até 6; sem a posição do boss vale o pior caso (1 além da distância ao Cavaleiro)', () => {
    assert.strictEqual(M.formacaoAlcanca('SORCERER', [-2, 0], [1, 0], DM), true, '3 casas');
    assert.strictEqual(M.formacaoAlcanca('SORCERER', [-3, 0], [1, 0], DM), false, '4 casas: a varinha não pega');
    assert.strictEqual(M.formacaoAlcanca('PALADIN', [-4, 1], [1, 0], DM), true, 'arco 6');
    assert.strictEqual(M.formacaoAlcanca('DRUID', [-2, 1], null, null), true, 'sem boss: dist 2 + 1 = 3');
    assert.strictEqual(M.formacaoAlcanca('DRUID', [-3, 0], null, null), false, 'sem boss: dist 3 + 1 = 4');
});
t('alcance MEDIDO manda: ≥ 3 lançamentos de ataque sem acerto numa casa = não pega dali, mesmo que a regra diga que sim', () => {
    const dm = Object.assign({}, DM, { alcance: { DRUID: { '-2,0': { casts: 5, hits: 0 }, '2,-1': { casts: 4, hits: 4 } } } });
    assert.strictEqual(M.formacaoAlcanca('DRUID', [-2, 0], [1, 0], dm), false);
    assert.strictEqual(M.formacaoAlcanca('DRUID', [2, -1], [1, 0], dm), true);
    assert.strictEqual(M.formacaoAlcanca('DRUID', [-2, 0], [1, 0], Object.assign({}, DM, { alcance: { DRUID: { '-2,0': { casts: 2, hits: 0 } } } })), true, 'menos de 3: ainda não decide');
});
t('sugestão: ninguém na linha do feixe; magos a ≤ 3 casas do boss; casas distintas; Paladino pode ir longe', () => {
    const r = M.formacaoSugerir(DM, { atual: { SORCERER: '2,0', DRUID: '-2,0', PALADIN: '-4,0' } });
    assert.deepStrictEqual(r.posBoss, [1, 0]);
    for (const v of ['SORCERER', 'DRUID', 'PALADIN']) {
        const p = r.pos[v]; assert(p, v + ' sem casa');
        assert(!(p[1] === 0 && p[0] >= 2), v + ' ficou na linha do feixe: ' + JSON.stringify(p));
        assert.strictEqual(r.perigo[M.fmKey(p)] || 0, 0, v + ' em casa com perigo');
    }
    assert(M.fmDist(r.pos.SORCERER, [1, 0]) <= 3 && M.fmDist(r.pos.DRUID, [1, 0]) <= 3, 'magos fora do alcance');
    assert.strictEqual(new Set(Object.values(r.pos).map(M.fmKey)).size, 3, 'casas repetidas');
    assert.strictEqual(r.detalhe.SORCERER.muda, true, 'o Feiticeiro estava em [2,0] (18 mil/h) e tem de sair');
    assert.strictEqual(r.detalhe.SORCERER.perigoAtual, 18000);
    assert.strictEqual(r.detalhe.PALADIN.muda, false, 'o Paladino em [−4,0] já está seguro e ao alcance (5 casas)');
    assert.strictEqual(r.pior[0].k, '1,0');
});
t('sem medição: medido=false, magos a 2 casas do Cavaleiro (pior caso 3 do boss), em y 0, e o Paladino numa casa diferente', () => {
    const r = M.formacaoSugerir(null, {});
    assert.strictEqual(r.medido, false); assert.strictEqual(r.posBoss, null);
    assert.strictEqual(Math.abs(r.pos.SORCERER[0]), 2); assert.strictEqual(r.pos.SORCERER[1], 0);
    assert.strictEqual(Math.abs(r.pos.DRUID[0]), 2); assert.strictEqual(r.pos.DRUID[1], 0);
    assert.notStrictEqual(M.fmKey(r.pos.SORCERER), M.fmKey(r.pos.DRUID));
    assert.strictEqual(new Set(Object.values(r.pos).map(M.fmKey)).size, 3);
});
console.log(`\n${n} testes ok`);

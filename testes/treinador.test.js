// Roda: node testes/treinador.test.js
// 2.67.0 — treinador (aba Progresso): especialistas puros e o chefe.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const i = src.indexOf('/* @@TREINADOR-PURO-INICIO'), f = src.indexOf('/* @@TREINADOR-PURO-FIM');
assert(i > 0 && f > i, 'trecho @@TREINADOR-PURO não encontrado');
const T = new Function(src.slice(i, f) + '\nreturn { TR_BASE, TR_AGENTES, trConselho, trOrdenar, trRodar, trFotoVazia };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
const fx = (nome) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', nome), 'utf8'));

t('foto vazia não quebra nenhum especialista e não gera passo', () => {
    const r = T.trRodar(T.trFotoVazia(), T.TR_BASE);
    assert.deepStrictEqual(r.passos, []);
    assert.strictEqual(r.cartoes.length, T.TR_AGENTES.length);
});
t('trConselho preenche os padrões', () => {
    const c = T.trConselho('upar', 'x', { titulo: 'a', impacto: 5 });
    assert.strictEqual(c.confianca, 'estimado'); assert.strictEqual(c.custo, 0); assert.strictEqual(c.acao, null);
});
t('TR_BASE: faixas cobrem 1..999 sem buraco e citam caçadas da wiki', () => {
    const fx = T.TR_BASE.faixas; assert(fx.length >= 4);
    for (let k = 1; k < fx.length; k++) assert.strictEqual(fx[k].de, fx[k - 1].ate, 'faixa contínua');
    assert(fx.some(x => x.hunts.includes('Shadow Nexus')));
});
t('TR_BASE: bênção no 250 = 29.750 cada; Legado tem marcos crescentes', () => {
    assert.strictEqual(T.TR_BASE.bencaos.preco(250), 29750);
    const b = T.TR_BASE.legado.bonus; for (let k = 1; k < b.length; k++) assert(b[k] > b[k - 1]);
});
t('TR_BASE: ilhas com custo e material', () => {
    const m = T.TR_BASE.ilhas.find(x => x.nome === 'Marapur');
    assert.strictEqual(m.ouro, 10e6); assert.strictEqual(m.materiais[0].nome, 'Spectral Conch'); assert.strictEqual(m.materiais[0].qtd, 10);
});
t('TR_BASE: bosses com tentativa e drops; ampulheta com preços', () => {
    const tim = T.TR_BASE.bosses.find(b => b.nome === 'Timira');
    assert.strictEqual(tim.rec, 340); assert.strictEqual(tim.tentativa.qtd, 5); assert(/naga/i.test(tim.drops));
    assert.strictEqual(T.TR_BASE.ampulheta.horasDia, 8); assert(T.TR_BASE.ampulheta.preco8h > 0);
});
process.on('exit', () => { if (!process.exitCode) console.log(`\n${n} testes ok`); });

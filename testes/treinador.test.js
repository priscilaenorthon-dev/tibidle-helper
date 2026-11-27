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
process.on('exit', () => { if (!process.exitCode) console.log(`\n${n} testes ok`); });

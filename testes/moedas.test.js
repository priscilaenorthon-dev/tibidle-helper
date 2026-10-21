// Roda: node testes/moedas.test.js
// 2.28.5 — /hunt/lootTable traz platinum coin com value 1; o analisador do jogo conta 100. corrigirMoedas acerta na entrada.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const i = src.indexOf('const VALOR_MOEDA'), f = src.indexOf('async function lootTabela');
assert(i > 0 && f > i, 'corrigirMoedas não encontrada');
const { corrigirMoedas } = new Function(src.slice(i, f) + '\nreturn { corrigirMoedas };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
t('platinum coin vale 100 e crystal coin 10.000; o resto fica igual', () => {
    const tab = [{ name: 'platinum coin', currency: true, value: 1, chance: 100000, maxCount: 25 }, { name: 'gold coin', currency: true, value: 1 },
                 { name: 'Crystal Coin', value: 1 }, { name: 'demonic essence', value: 1000 }];
    const r = corrigirMoedas(tab);
    assert.deepStrictEqual(r.map(x => x.value), [100, 1, 10000, 1000]);
    assert.strictEqual(tab[0].value, 1, 'não muda a tabela original');
    assert.strictEqual(r[3], tab[3], 'item comum é o mesmo objeto');
});
t('tabela inválida vira lista vazia', () => {
    assert.deepStrictEqual(corrigirMoedas(null), []);
    assert.deepStrictEqual(corrigirMoedas({ erro: 1 }), []);
});
console.log(n + ' testes');

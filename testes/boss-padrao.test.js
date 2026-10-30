// Roda: node testes/boss-padrao.test.js
// 2.37.0 — padrão forte de boss: vida, mana, defesa e suporte por vocação e nível.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const i = src.indexOf('/* @@BOSS-PADRAO-INICIO'), f = src.indexOf('/* @@BOSS-PADRAO-FIM');
assert(i > 0 && f > i, 'trecho @@BOSS-PADRAO não encontrado');
const B = new Function(src.slice(i, f) + '\nreturn { BOSS_PADRAO, bossPocaoForte, padraoBoss };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };

/* a lista de reserva do helper (POCOES), no formato de listaPocoes */
const POC = {
    vida: [{ n: 'Health Potion', lvl: 1, custo: 50, media: 150 }, { n: 'Strong Health Potion', lvl: 50, voc: ['KNIGHT', 'PALADIN'], custo: 115, media: 300 },
           { n: 'Great Health Potion', lvl: 80, voc: ['KNIGHT'], custo: 225, media: 500 }, { n: 'Great Spirit Potion', lvl: 80, voc: ['PALADIN'], custo: 254, media: 300 },
           { n: 'Ultimate Health Potion', lvl: 130, voc: ['KNIGHT'], custo: 379, media: 750 }, { n: 'Ultimate Spirit Potion', lvl: 130, voc: ['paladin'], custo: 488, media: 500 }],
    mana: [{ n: 'Mana Potion', lvl: 1, custo: 56, media: 100 }, { n: 'Strong Mana Potion', lvl: 50, custo: 108, media: 150 },
           { n: 'Great Mana Potion', lvl: 80, voc: ['SORCERER', 'DRUID', 'PALADIN'], custo: 158, media: 200 }, { n: 'Ultimate Mana Potion', lvl: 130, voc: ['SORCERER', 'DRUID'], custo: 488, media: 500 }]
};
const todas = () => true;

t('nível alto: a poção mais forte da vocação (Knight Ultimate Health, Paladino Ultimate Spirit, mago Ultimate Mana)', () => {
    assert.strictEqual(B.padraoBoss('KNIGHT', 170, todas, POC).heals.find(h => h && /Potion/.test(h.name)).name, 'Ultimate Health Potion');
    assert.strictEqual(B.padraoBoss('PALADIN', 170, todas, POC).heals.find(h => h && /Potion/.test(h.name)).name, 'Ultimate Spirit Potion', 'vocação em minúsculas no catálogo');
    assert.strictEqual(B.padraoBoss('SORCERER', 170, todas, POC).manaPotion.name, 'Ultimate Mana Potion');
    assert.strictEqual(B.padraoBoss('KNIGHT', 170, todas, POC).manaPotion.name, 'Strong Mana Potion', 'o Knight não bebe Great/Ultimate Mana');
});

t('nível baixo (conta de nível 26): Health Potion e Mana Potion, e só as magias que ele já tem', () => {
    const tem = n => ['Wound Cleansing', 'Light Healing', 'Intense Healing', 'Heal Friend'].includes(n);
    const k = B.padraoBoss('KNIGHT', 26, tem, POC);
    assert.deepStrictEqual(k.heals.filter(Boolean).map(h => h.name), ['Health Potion', 'Wound Cleansing']);
    assert.strictEqual(k.manaPotion.name, 'Mana Potion');
    const d = B.padraoBoss('DRUID', 26, tem, POC);
    assert.deepStrictEqual(d.heals.filter(Boolean).map(h => h.name), ['Health Potion', 'Heal Friend', 'Intense Healing'], 'sem Light Healing quando há Intense');
    assert.deepStrictEqual(d.supports, [null, null], 'suporte que não tem fica vazio');
});

t('curas da forte (gatilho baixo) para a leve; a poção no meio; no máximo 5 e 2 suportes', () => {
    const d = B.padraoBoss('DRUID', 170, todas, POC);
    const ps = d.heals.filter(Boolean).map(h => h.percent);
    assert.deepStrictEqual(ps, ps.slice().sort((a, b) => a - b));
    assert.strictEqual(d.heals.length, 5); assert.strictEqual(d.supports.length, 2);
    assert.deepStrictEqual(d.heals.filter(Boolean).map(h => h.name), ['Health Potion', 'Ultimate Healing', 'Mass Healing', 'Heal Friend']);
    assert.deepStrictEqual(B.padraoBoss('KNIGHT', 170, todas, POC).supports, ['Protector', 'Train Party']);
});

t('nomes do padrão existem nos setups do Discord (mesma grafia do catálogo)', () => {
    for (const v of Object.keys(B.BOSS_PADRAO)) for (const [nome] of B.BOSS_PADRAO[v].curas.concat(B.BOSS_PADRAO[v].sups.map(s => [s]))) assert(src.includes("'" + nome + "'"), nome);
});

console.log(n + ' testes ' + (process.exitCode ? '(com falhas)' : 'ok'));

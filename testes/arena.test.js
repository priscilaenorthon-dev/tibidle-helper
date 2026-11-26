// Roda: node testes/arena.test.js
// 2.57.0 — Sobrevivência: decisões puras do robô (alvo, fuga do aviso, moer, boss, cartas com par de ultimate).
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const i = src.indexOf('/* @@ARENA-PURO-INICIO'), f = src.indexOf('/* @@ARENA-PURO-FIM');
assert(i > 0 && f > i, 'trecho @@ARENA-PURO não encontrado');
const A = new Function(src.slice(i, f) + '\nreturn { SV_PAR, SV_CFG, svDecidir, svEscolherAlvo, svEscolherCarta, svNotaCarta, svPerigo };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };

const estado = (o = {}) => Object.assign({ tempoMs: 60000, fase: 'mapa', knight: { x: 0, y: 0, hp: 1000, maxHp: 1000 }, bichos: [], itens: [], avisos: [], fogueiras: [], reaper: null,
    baralho: { magias: [], passivas: [], oferta: [] } }, o);
const bicho = (id, x, y, extra) => Object.assign({ id, x, y, hp: 100, maxHp: 100, ehBoss: false, ehConjurador: false }, extra || {});

t('dentro do aviso: sai pela casa segura mais perto, mesmo com cristal do outro lado', () => {
    const tiles = []; for (let x = -1; x <= 3; x++) for (let y = -2; y <= 2; y++) tiles.push({ x, y });
    const st = estado({ avisos: [{ id: 1, tiles }], itens: [{ id: 9, tipo: 'orbe', x: 6, y: 0 }] });
    const d = A.svDecidir(st, {}, A.SV_CFG);
    assert.strictEqual(d[0], -1, 'sai pela esquerda (1 casa) e não pela direita (4 casas)');
});
t('nunca entra numa casa avisada', () => {
    const st = estado({ avisos: [{ id: 1, tiles: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: -1 }] }], itens: [{ id: 9, tipo: 'bau', x: 5, y: 0 }] });
    const d = A.svDecidir(st, {}, A.SV_CFG);
    assert.notStrictEqual(d[0], 1, 'a coluna x=1 está avisada');
});
t('alvo: baú e orbe na frente de cristal; comida só vale com vida baixa', () => {
    const st = estado({ itens: [{ id: 1, tipo: 'cristal', x: 2, y: 0, xp: 50 }, { id: 2, tipo: 'bau', x: 6, y: 0 }] });
    assert.strictEqual(A.svEscolherAlvo(st, A.SV_CFG).tipo, 'bau');
    const cheio = estado({ itens: [{ id: 1, tipo: 'comida', x: 3, y: 0 }, { id: 2, tipo: 'cristal', x: 3, y: 3, xp: 200 }] });
    assert.strictEqual(A.svEscolherAlvo(cheio, A.SV_CFG).tipo, 'cristal');
    const ferido = estado({ knight: { x: 0, y: 0, hp: 300, maxHp: 1000 }, itens: [{ id: 1, tipo: 'comida', x: 3, y: 0 }, { id: 2, tipo: 'cristal', x: 3, y: 3, xp: 200 }] });
    assert.strictEqual(A.svEscolherAlvo(ferido, A.SV_CFG).tipo, 'comida');
});
t('boss: vai no de menos vida primeiro (dono, 26/11: do mais fácil ao mais difícil)', () => {
    const st = estado({ bichos: [bicho(1, 10, 0, { ehBoss: true, hp: 9000 }), bicho(2, -10, 0, { ehBoss: true, hp: 3000 })] });
    const a = A.svEscolherAlvo(st, A.SV_CFG);
    assert.strictEqual(a.tipo, 'boss'); assert.strictEqual(a.id, 2);
    const ferido = estado({ knight: { x: 0, y: 0, hp: 200, maxHp: 1000 }, bichos: st.bichos });
    assert.notStrictEqual((A.svEscolherAlvo(ferido, A.SV_CFG) || {}).tipo, 'boss', 'com vida baixa não caça');
});
t('moer: com vida boa vai para o lado com mais bicho comum; com vida baixa foge', () => {
    const bs = []; let id = 1; for (let x = 3; x <= 5; x++) for (let y = -1; y <= 1; y++) bs.push(bicho(id++, x, y));
    const cheio = estado({ bichos: bs });
    assert.strictEqual(A.svDecidir(cheio, {}, A.SV_CFG)[0], 1);
    const ferido = estado({ bichos: bs, knight: { x: 0, y: 0, hp: 150, maxHp: 1000 } });
    assert.strictEqual(A.svDecidir(ferido, {}, A.SV_CFG)[0], -1);
});
t('cartas: passiva de par da magia que tenho vem antes de passiva solta', () => {
    const st = estado({ baralho: { magias: [{ nome: 'Brutal Strike', nivel: 3 }], passivas: [], oferta: [
        { especie: 'passiva-nova', passiva: 'Vida máxima' }, { especie: 'passiva-nova', passiva: 'Recarga' }, { especie: 'nivel-de-passiva', passiva: 'Protector' }] } });
    assert.strictEqual(A.svEscolherCarta(st, A.SV_CFG), 1);
});
t('cartas: sem vaga sobrando, passiva que não é par fica de fora', () => {
    const st = estado({ baralho: { magias: [{ nome: 'Berserk', nivel: 2 }, { nome: 'Groundshaker', nivel: 2 }, { nome: 'Inflict Wound', nivel: 2 }, { nome: 'Annihilation', nivel: 2 }],
        passivas: [{ nome: 'Blood Rage', nivel: 1 }, { nome: 'Área', nivel: 1 }], oferta: [{ especie: 'passiva-nova', passiva: 'Sabedoria' }, { especie: 'nivel-de-magia', magia: 'Berserk' }] } });
    assert.strictEqual(A.svEscolherCarta(st, A.SV_CFG), 1);
    assert(A.svNotaCarta(st, st.baralho.oferta[0], A.SV_CFG) < 0);
});
t('cartas: os nomes do motor (magia-nova / passiva-nova) — erro de 26/11, quando nova-* nunca casava', () => {
    const st = estado({ baralho: { magias: [], passivas: [], oferta: [{ especie: 'magia-nova', magia: 'Berserk' }] } });
    assert(A.svNotaCarta(st, st.baralho.oferta[0], A.SV_CFG) >= 90);
});
t('Reaper: foge dele mesmo com baú perto', () => {
    const st = estado({ reaper: { x: 3, y: 0 }, itens: [{ id: 1, tipo: 'bau', x: 4, y: 0 }] });
    assert.strictEqual(A.svDecidir(st, {}, A.SV_CFG)[0], -1);
});
console.log(`\n${n} testes ok`);

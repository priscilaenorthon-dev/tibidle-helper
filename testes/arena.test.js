// Roda: node testes/arena.test.js
// 2.57.0 — Sobrevivência: decisões puras do robô (alvo, fuga do aviso, moer, boss, cartas com par de ultimate).
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const i = src.indexOf('/* @@ARENA-PURO-INICIO'), f = src.indexOf('/* @@ARENA-PURO-FIM');
assert(i > 0 && f > i, 'trecho @@ARENA-PURO não encontrado');
const A = new Function(src.slice(i, f) + '\nreturn { SV_PAR, SV_CFG, svDecidir, svEscolherAlvo, svEscolherCarta, svNotaCarta, svPerigo, SV_BUFFS, svBuffsParaClicar, svParede };')();
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
    assert(A.svNotaCarta(st, st.baralho.oferta[0], Object.assign({}, A.SV_CFG, { magiasPreferidas: [] })) >= 90);
});
t('2.58.1: build preferida (a do 115) ganha de magia de fora, e a de fora ainda entra se não vier outra', () => {
    const st = estado({ baralho: { magias: [], passivas: [], oferta: [{ especie: 'magia-nova', magia: 'Berserk' }, { especie: 'magia-nova', magia: 'Front Sweep' }] } });
    assert.strictEqual(A.svEscolherCarta(st, A.SV_CFG), 1);
    const so = estado({ baralho: { magias: [], passivas: [], oferta: [{ especie: 'magia-nova', magia: 'Berserk' }, { especie: 'nivel-de-passiva', passiva: 'Protector' }] } });
    assert.strictEqual(A.svEscolherCarta(so, A.SV_CFG), 0);
});
t('Reaper: foge dele mesmo com baú perto', () => {
    const st = estado({ reaper: { x: 3, y: 0 }, itens: [{ id: 1, tipo: 'bau', x: 4, y: 0 }] });
    assert.strictEqual(A.svDecidir(st, {}, A.SV_CFG)[0], -1);
});
t('2.57.1: o minimapa e a caixinha "minimapa" da aba não dividem o id (o quadro nunca nascia)', () => {
    const ids = [...src.matchAll(/id="(tb-sv-[\w-]+)"/g)].map(m => m[1]);
    assert(!ids.includes('tb-sv-minimapa'), 'a tela não pode usar o id do quadro');
    assert(/cv\.id = 'tb-sv-minimapa'/.test(src) && /getElementById\('tb-sv-minimapa'\)/.test(src));
});
t('2.58.0: buffs — clica só o que difere da escolha (marca os pedidos, desmarca os que sobram, nada se já igual)', () => {
    const tela = { roubo_de_vida: false, protecao_elemental: true, velocidade: false, dano: false, critico: true };
    assert.deepStrictEqual(A.svBuffsParaClicar(tela, ['velocidade', 'critico']).sort(), ['protecao_elemental', 'velocidade']);
    assert.deepStrictEqual(A.svBuffsParaClicar(tela, ['protecao_elemental', 'critico']), []);
    assert.deepStrictEqual(A.svBuffsParaClicar(tela, []).sort(), ['critico', 'protecao_elemental'], 'sem escolha = nenhum buff (sem gasto)');
    assert.deepStrictEqual(A.SV_BUFFS.map(b => b.id).sort(), Object.keys(tela).sort(), 'os 5 ids da loja do jogo');
});
t('2.59.0: carta de cura do motor é "pocao" — entra com vida baixa, e depois dos 9:00 já abaixo de 80 %', () => {
    const of = [{ especie: 'limite', magia: 'Front Sweep' }, { especie: 'limite', magia: 'Annihilation' }, { especie: 'pocao' }];
    const cedo = estado({ tempoMs: 300000, knight: { x: 0, y: 0, hp: 700, maxHp: 1000 }, baralho: { magias: [], passivas: [], oferta: of } });
    assert.notStrictEqual(A.svEscolherCarta(cedo, A.SV_CFG), 2, 'aos 5:00 com 70 % fica com o limite');
    const tarde = estado({ tempoMs: 600000, knight: { x: 0, y: 0, hp: 700, maxHp: 1000 }, baralho: { magias: [], passivas: [], oferta: of } });
    assert.strictEqual(A.svEscolherCarta(tarde, A.SV_CFG), 2, 'aos 10:00 com 70 % pega a cura');
    const ferido = estado({ tempoMs: 300000, knight: { x: 0, y: 0, hp: 400, maxHp: 1000 }, baralho: { magias: [], passivas: [], oferta: of } });
    assert.strictEqual(A.svEscolherCarta(ferido, A.SV_CFG), 2);
});
t('2.59.0: limite vai para a magia que já virou U', () => {
    const st = estado({ baralho: { magias: [{ nome: 'Front Sweep', nivel: 8 }, { nome: 'Annihilation', nivel: 8, evoluiu: true }], passivas: [],
        oferta: [{ especie: 'limite', magia: 'Front Sweep' }, { especie: 'limite', magia: 'Annihilation' }] } });
    assert.strictEqual(A.svEscolherCarta(st, A.SV_CFG), 1);
});
t('2.59.0: passiva de par de magia fora da build não toma a vaga (Sorte no lugar do Haste, 26/11)', () => {
    const st = estado({ baralho: { magias: [{ nome: 'Whirlwind Throw', nivel: 5 }, { nome: 'Annihilation', nivel: 5 }, { nome: 'Inflict Wound', nivel: 5 }],
        passivas: [{ nome: 'Ímã', nivel: 1 }, { nome: 'Crítico', nivel: 1 }, { nome: 'Recovery', nivel: 1 }], oferta: [{ especie: 'passiva-nova', passiva: 'Sorte' }] } });
    assert(A.svNotaCarta(st, st.baralho.oferta[0], A.SV_CFG) < 0, 'a última vaga é do Haste (Front Sweep)');
});
t('2.59.0: não anda para dentro de árvore/pedra do chão', () => {
    let px = null, py = null;
    for (let x = 2; x < 60 && px === null; x++) for (let y = -30; y < 30; y++) if (A.svParede(x, y) && !A.svParede(x - 1, y)) { px = x; py = y; break; }
    assert(px !== null, 'achou uma parede');
    assert(!A.svParede(0, 0) && !A.svParede(1, 1), 'o centro é livre');
    const st = estado({ knight: { x: px - 1, y: py, hp: 1000, maxHp: 1000 }, itens: [{ id: 1, tipo: 'bau', x: px + 3, y: py }] });
    const d = A.svDecidir(st, {}, A.SV_CFG);
    assert(!A.svParede(px - 1 + d[0], py + d[1]), 'o passo não cai na parede');
});
t('2.60.0: Haste entra assim que aparece e sobe antes de nível de magia sem par (dono, 26/11: "para correr")', () => {
    const of = [{ especie: 'nivel-de-magia', magia: 'Annihilation' }, { especie: 'passiva-nova', passiva: 'Haste' }];
    const st = estado({ baralho: { magias: [{ nome: 'Whirlwind Throw', nivel: 3 }, { nome: 'Annihilation', nivel: 2 }], passivas: [{ nome: 'Ímã', nivel: 1 }], oferta: of } });
    assert.strictEqual(A.svEscolherCarta(st, A.SV_CFG), 1, 'Haste novo vence nível de magia');
    const of2 = [{ especie: 'nivel-de-passiva', passiva: 'Ímã' }, { especie: 'nivel-de-passiva', passiva: 'Haste' }, { especie: 'nivel-de-magia', magia: 'Inflict Wound' }];
    const st2 = estado({ baralho: { magias: [{ nome: 'Whirlwind Throw', nivel: 3 }, { nome: 'Inflict Wound', nivel: 2 }], passivas: [{ nome: 'Ímã', nivel: 1 }, { nome: 'Haste', nivel: 1 }], oferta: of2 } });
    assert.strictEqual(A.svEscolherCarta(st2, A.SV_CFG), 1, 'nível de Haste vence nível de magia sem par');
});
t('2.60.1: oferta só com passivas sem par — vida/defesa antes de Sabedoria (26/11 ao vivo)', () => {
    const st = estado({ baralho: { magias: [{ nome: 'Front Sweep', nivel: 3 }, { nome: 'Inflict Wound', nivel: 3 }, { nome: 'Whirlwind Throw', nivel: 2 }, { nome: 'Berserk', nivel: 2 }],
        passivas: [{ nome: 'Ímã', nivel: 1 }], oferta: [{ especie: 'passiva-nova', passiva: 'Sabedoria' }, { especie: 'passiva-nova', passiva: 'Área' }, { especie: 'passiva-nova', passiva: 'Vida máxima' }] } });
    assert.strictEqual(A.svEscolherCarta(st, A.SV_CFG), 2);
});
t('2.61.0: baú longe, no meio da multidão e com boss vivo — o alvo é o baú (dono, 26/11: "nem que ande e volte")', () => {
    const bichos = [bicho(1, 5, 5, { ehBoss: true, hp: 10 })]; for (let k = 0; k < 20; k++) bichos.push(bicho(10 + k, 28 + (k % 5), -2 + Math.floor(k / 5)));
    const st = estado({ bichos, itens: [{ id: 2, tipo: 'bau', x: 30, y: 0 }, { id: 3, tipo: 'cristal', x: 2, y: 0, xp: 5000 }] });
    const a = A.svEscolherAlvo(st, A.SV_CFG);
    assert.strictEqual(a.tipo, 'bau'); assert.strictEqual(a.x, 30);
    const d = A.svDecidir(st, {}, A.SV_CFG);
    assert.strictEqual(d[0], 1, 'anda em direção ao baú');
});
t('2.61.0: com as 4 magias em U, não caça boss e se afasta dele', () => {
    const mags = ['Front Sweep', 'Inflict Wound', 'Brutal Strike', 'Whirlwind Throw'].map(nome => ({ nome, nivel: 8, evoluiu: true }));
    const pass = ['Haste', 'Recovery', 'Recarga', 'Ímã'].map(nome => ({ nome, nivel: 3 }));
    const st = estado({ bichos: [bicho(1, 2, 0, { ehBoss: true })], baralho: { magias: mags, passivas: pass, oferta: [] } });
    const a = A.svEscolherAlvo(st, A.SV_CFG);
    assert.ok(!a || a.tipo !== 'boss', 'sem ultimate a ganhar, boss não é alvo');
    const d = A.svDecidir(st, {}, A.SV_CFG);
    assert.ok(d[0] <= 0, 'não anda para o lado do boss');
    const falta = estado({ bichos: [bicho(1, 2, 0, { ehBoss: true })], baralho: { magias: mags.map((m, i) => i ? m : Object.assign({}, m, { evoluiu: false })), passivas: pass, oferta: [] } });
    assert.strictEqual(A.svEscolherAlvo(falta, A.SV_CFG).tipo, 'boss', 'ainda falta U: caça');
});
console.log(`\n${n} testes ok`);

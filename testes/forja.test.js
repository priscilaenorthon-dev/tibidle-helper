// Roda: node testes/forja.test.js
// Aba Forja (2.25.0): extrai EQUIP-PURO + MELHORIAS + FORJA do userscript e testa o bloco puro
// (estoque, custo das gemas, estratégias por peça, ranking e a máquina de decisão do botão FORJAR).
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const M = new Function(trecho('/* @@EQUIP-PURO-INICIO */', '/* @@EQUIP-PURO-FIM */') + trecho('/* @@MELHORIAS-INICIO', '/* @@MELHORIAS-FIM */') + trecho('/* @@FORJA-INICIO', '/* @@FORJA-FIM */') +
    '\nreturn { fjEstoque, fjCustoGemas, fjEstrategias, fjRanking, fjProximoPasso, forjaSimular, FJ_ITEM_GEMA, fjItemFragmento, FJ_GEMAS, FJ_GANHO_MIN, FJ_VALE_MIN, pontuarPeca, pesosDaVoc };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
const F = (r, refino, pot, ...at) => ({ raridade: r, refino, potenciaBase: pot, atributos: at.map(([id, valor]) => ({ id, valor })) });
const MPA = { iid: 'mpa', nome: 'magic plate armor', slot: 'armor', attrs: { slot: 'armor', armor: 17, vocation: 'Knight;true, Paladin;true, Elite Knight, Royal Paladin' }, forja: F(0, 0, 271) };
const SNAKE = { iid: 'snk', nome: 'snakebite rod', slot: 'weapon', attrs: { weaponType: 'wand', wandType: 'earth', level: 6, fromDamage: 8, toDamage: 18, mana: 2, vocation: 'Druid;true, Elder Druid' }, forja: F(1, 0, 271, ['nivel_magico', 1]) };
const ENTRADA = { iid: 'ent', nome: 'leather armor', slot: 'armor', attrs: { slot: 'armor', armor: 4 }, forja: F(0, 0, 50) };
const CTX = { nivel: 133 };
const LASTRO = { disponivel: true, ouroPorGema: { refino: 181640, garantia: 186640, limpeza: 186640, atributo: 225968, refazer: 225968, raridade: 270296, refino_maior: 309624, limpeza_maior: 314624, refazer_maior: 314624, ordem: 353952, raridade_maior: 393280 } };
const CAT = { 'refine fragment t1': { minSell: 180, sellOrders: 30, trades30d: 7934 }, 'rarity fragment t1': { minSell: 5150, sellOrders: 20, trades30d: 5086 }, 'attribute fragment t1': { minSell: 2800, sellOrders: 41, trades30d: 5267 }, 'guarantee fragment t1': { minSell: 599, sellOrders: 51, trades30d: 3371 } };

/* ===== Task 1: estoque e custo ===== */
t('fjEstoque: soma gemas e fragmentos da mochila e do depósito pelo nome do item; o resto é ignorado', () => {
    const e = M.fjEstoque({ 'refine gem t1': 2, 'attribute fragment t1': 30, bread: 5, 'Rarity Fragment T1': 1 }, [{ itemName: 'rarity fragment t1', count: 60 }, { itemName: 'refine fragment t1', count: 14 }, { itemName: 'yellow gem', count: 1 }]);
    assert.deepStrictEqual(e.gemas.refino, 2); assert.strictEqual(e.gemas.atributo, 0);
    assert.deepStrictEqual([e.fragmentos.atributo, e.fragmentos.raridade, e.fragmentos.refino], [30, 61, 14]);
    assert.strictEqual(M.fjItemFragmento('refino_maior'), 'refine fragment t2');
    assert.strictEqual(M.FJ_GEMAS.length, 11);
});
t('fjCustoGemas: com o lastro o ouro de criar é o do jogo; o fragmento vale o menor anúncio; custo da tentativa = criar + 100 fragmentos; disponíveis = prontas + floor(frag/100)', () => {
    const est = M.fjEstoque({ 'refine gem t1': 2 }, [{ itemName: 'refine fragment t1', count: 114 }]);
    const c = M.fjCustoGemas(LASTRO, CAT, est);
    assert.strictEqual(c.refino.ouroCriar, 181640);
    assert.strictEqual(c.refino.precoFrag, 180);
    assert.strictEqual(c.refino.custo, 181640 + 18000);
    assert.deepStrictEqual([c.refino.prontas, c.refino.fragmentos, c.refino.criaveis, c.refino.disponiveis], [2, 114, 1, 3]);
    assert.strictEqual(c.cotacao, 34328);
    assert.strictEqual(c.atributo.precoFrag, 2800);
    assert.strictEqual(c.ordem.precoFrag, 2000, 'sem anúncio: a estimativa dos vídeos (2 mil)');
});
t('fjCustoGemas: sem lastro usa a wiki (ouro base + coins × cotação dada); sem cotação, só o ouro base', () => {
    const c = M.fjCustoGemas(null, null, M.fjEstoque({}, []), { cotacao: 34328 });
    assert.strictEqual(c.refino.ouroCriar, 10000 + 5 * 34328);
    assert.strictEqual(c.raridade_maior.ouroCriar, 50000 + 10 * 34328);
    assert.strictEqual(M.fjCustoGemas(null, null, M.fjEstoque({}, [])).refino.ouroCriar, 10000);
});

/* ===== Task 2: forjaSimular estendido ===== */
t('forjaSimular: linha-alvo que NÃO é a última é re-sorteada com Refazer T1 (todas), não com Refazer T2', () => {
    const peca = { slot: 'armor', forja: F(2, 0, 300, ['regen_mana', 1.1], ['capacidade', 50]) };
    const r = M.forjaSimular(peca, { linhas: ['regen_mana'], valorMin: 2.0 }, { n: 300, seed: 5 });
    assert(r.sucesso > 0.9, 'faixa II vai até 2,5: dá para chegar a 2,0: ' + r.sucesso);
    assert(r.porGema.refazer > 0 && !(r.porGema.refazer_maior > 0), JSON.stringify(r.porGema));
    const r2 = M.forjaSimular({ slot: 'armor', forja: F(2, 0, 300, ['capacidade', 50], ['regen_mana', 1.1]) }, { linhas: ['regen_mana'], valorMin: 2.0 }, { n: 300, seed: 5 });
    assert(r2.porGema.refazer_maior > 0 && !(r2.porGema.refazer > 0), 'última linha: Refazer T2: ' + JSON.stringify(r2.porGema));
});
t('forjaSimular: opc.limite (o estoque) corta as tentativas por gema e a rodada que parou conta como falha; opc.custos dá o ouro por gema', () => {
    const peca = { slot: 'armor', forja: F(0, 0, 271) };
    const sem = M.forjaSimular(peca, { refino: 2 }, { n: 500, seed: 2 });
    assert.strictEqual(sem.sucesso, 1);
    const com = M.forjaSimular(peca, { refino: 2 }, { n: 500, seed: 2, limite: { refino: 2 } });
    assert(com.sucesso > 0.45 && com.sucesso < 0.67, '2 gemas para +2: 0,8 × 0,7 = 0,56: ' + com.sucesso);
    const c = M.forjaSimular(peca, { refino: 1 }, { n: 200, seed: 2, custos: { refino: 200000 } });
    assert(Math.abs(c.ouro / 200000 - c.porGema.refino) < 0.02, 'ouro = gemas × custo: ' + c.ouro + ' / ' + c.porGema.refino);
    assert(c.porGema90 && c.porGema90.refino >= 1, 'p90 por gema: ' + JSON.stringify(c.porGema90));
});

/* ===== Task 3: estratégias ===== */
const custos = () => M.fjCustoGemas(LASTRO, CAT, M.fjEstoque({}, []));
t('fjEstrategias: magic plate armor +0 do Cavaleiro (fase 2) → refino até +4 com ganho na régua e ≈ 6,35 gemas; +5 só com garantia; nada de linha (sem encaixe, Comum)', () => {
    const es = M.fjEstrategias(MPA, 'KNIGHT', CTX, custos(), { seed: 3, n: 300 });
    const r4 = es.find(e => e.id === 'refino' && e.alvo.refino === 4);
    assert(r4, 'refino +4: ' + es.map(e => e.id + (e.alvo.refino || '')).join(','));
    assert(r4.ganhoPt > 10 && r4.gemasMedio > 5.5 && r4.gemasMedio < 7.5, JSON.stringify([r4.ganhoPt, r4.gemasMedio]));
    assert(r4.custoMedio > 1000000 && r4.custoMedio < 1600000, 'custo ≈ 6,35 × 200 k: ' + r4.custoMedio);
    assert(r4.passos.length >= 1 && /refin/i.test(r4.passos[0]));
    assert(!es.some(e => e.id === 'faixa' || e.id === 'valor'), 'sem linha de skill: nem faixa nem valor');
    const en = es.find(e => e.id === 'encaixe');
    assert(en && en.alvo.raridade === 1, 'Comum: a linha nova passa por Raridade T1 para abrir o encaixe: ' + JSON.stringify(en && en.alvo));
    const r5 = es.find(e => e.id === 'refino' && e.alvo.refino === 5);
    assert(!r5 || r5.alvo.garantia === true, '+5 só com garantia');
});
t('fjEstrategias: snakebite ML+1 potência 271 do Druida → "faixa + refazer": 3 refinos (421, faixa III) e ML até 2', () => {
    const es = M.fjEstrategias(SNAKE, 'DRUID', CTX, custos(), { seed: 3, n: 300 });
    const fx = es.find(e => e.id === 'faixa');
    assert(fx, 'estratégia faixa: ' + es.map(e => e.id).join(','));
    assert.deepStrictEqual([fx.alvo.refino, fx.alvo.linhas, fx.alvo.valorMin], [3, ['nivel_magico'], 2]);
    assert(fx.ganhoPt > 0 && fx.chance > 0.5, JSON.stringify([fx.ganhoPt, fx.chance]));
});
t('fjEstrategias: encaixe novo mira só linhas de peso 10 que valem (nunca skill) e abre encaixe com Raridade quando não há vazio', () => {
    const bota = { iid: 'b', nome: 'fur boots', slot: 'boots', attrs: { slot: 'feet', armor: 2 }, forja: F(1, 0, 349, ['capacidade', 60]) };
    const es = M.fjEstrategias(bota, 'DRUID', CTX, custos(), { seed: 3, n: 300 });
    const en = es.find(e => e.id === 'encaixe');
    assert(en, 'encaixe: ' + es.map(e => e.id).join(','));
    assert.strictEqual(en.alvo.raridade, 2, 'Incomum cheio: sobe para Raro para abrir o encaixe');
    assert(en.alvo.linhas.includes('regen_mana') && !en.alvo.linhas.some(id => /nivel_magico|distancia|corpo_a_corpo/.test(id)), JSON.stringify(en.alvo.linhas));
});
t('fjEstrategias: peça de entrada (potência 50, Comum) não tem estratégia que valha o mínimo; estoque vazio marca cabe:false com o que falta', () => {
    const es = M.fjEstrategias(ENTRADA, 'KNIGHT', CTX, custos(), { seed: 3, n: 200 });
    assert(es.some(e => e.id === 'refino') && !es.some(e => e.id === 'faixa' || e.id === 'valor'), es.map(e => e.id + ' ' + e.ganhoPt).join(',')); // o refino rende (armadura é armadura); quem barra a peça de entrada é o ranking (não é BiS)
    const est = M.fjEstoque({}, []);
    const es2 = M.fjEstrategias(MPA, 'KNIGHT', CTX, M.fjCustoGemas(LASTRO, CAT, est), { seed: 3, n: 200, estoque: est });
    const r = es2.find(e => e.id === 'refino' && e.alvo.refino === 1);
    assert(r && r.cabe === false && /Refino T1/.test(r.falta), JSON.stringify([r && r.cabe, r && r.falta]));
    const est3 = M.fjEstoque({ 'refine gem t1': 3 }, []);
    const es3 = M.fjEstrategias(MPA, 'KNIGHT', CTX, M.fjCustoGemas(LASTRO, CAT, est3), { seed: 3, n: 200, estoque: est3 });
    assert(es3.find(e => e.id === 'refino' && e.alvo.refino === 1).cabe === true);
});

/* ===== Task 4: ranking ===== */
t('fjRanking: a BiS com ganho fica na frente com selo "vale"; sem estoque vira "estoque"; sem ouro "ouro"; item de entrada "nao"', () => {
    const porVoc = { KNIGHT: [{ peca: MPA, origem: 'bis', slot: 'armor' }, { peca: ENTRADA, origem: 'base', slot: 'armor' }], DRUID: [{ peca: SNAKE, origem: 'bis', slot: 'weapon' }] };
    const estCheio = M.fjEstoque({ 'refine gem t1': 10, 'reroll gem t1': 5, 'guarantee gem t1': 3 }, []);
    const r = M.fjRanking(porVoc, CTX, M.fjCustoGemas(LASTRO, CAT, estCheio), 4000000, estCheio, { seed: 3, n: 200 });
    assert(r.length === 3 && r[0].selo === 'vale' && r[0].peca.iid !== 'ent', r.map(x => x.peca.iid + ':' + x.selo).join(','));
    assert.strictEqual(r.find(x => x.peca.iid === 'ent').selo, 'nao');
    const vazio = M.fjEstoque({}, []);
    const r2 = M.fjRanking(porVoc, CTX, M.fjCustoGemas(LASTRO, CAT, vazio), 4000000, vazio, { seed: 3, n: 200 });
    assert.strictEqual(r2.find(x => x.peca.iid === 'mpa').selo, 'estoque');
    const r3 = M.fjRanking(porVoc, CTX, M.fjCustoGemas(LASTRO, CAT, estCheio), 100000, estCheio, { seed: 3, n: 200 });
    assert.strictEqual(r3.find(x => x.peca.iid === 'mpa').selo, 'ouro');
});

/* ===== Task 5: máquina de decisão ===== */
const E = (gemas, frags, extra) => Object.assign({ estoque: { gemas: Object.assign({}, gemas), fragmentos: Object.assign({}, frags || {}) }, gasto: 0, orcamento: 2000000, tentativas: 0, maxTentativas: 30, ouro: 4000000, ouroCriar: LASTRO.ouroPorGema }, extra || {});
t('fjProximoPasso: refino +0→+1 pede Refino T1 sem garantia; +4→+5 pede Refino T2 com garantia; alvo atingido → fim', () => {
    const plano = { alvo: { refino: 5 } };
    assert.deepStrictEqual(M.fjProximoPasso(plano, F(0, 0, 271), E({ refino: 1, refino_maior: 1, garantia: 1 })).acao, 'refino');
    const a = M.fjProximoPasso(plano, F(0, 0, 271), E({ refino: 1, refino_maior: 1, garantia: 1 }));
    assert.deepStrictEqual([a.gema, a.garantia], ['refino', false]);
    const b = M.fjProximoPasso(plano, F(0, 4, 271), E({ refino: 1, refino_maior: 1, garantia: 1 }));
    assert.deepStrictEqual([b.acao, b.gema, b.garantia], ['refino', 'refino_maior', true]);
    assert.strictEqual(M.fjProximoPasso(plano, F(0, 5, 271), E({})).acao, 'fim');
});
t('fjProximoPasso: sem a gema → craft se há 100 fragmentos e ouro; senão parar com o que falta; orçamento/tentativas estourados → parar', () => {
    const plano = { alvo: { refino: 1 } };
    assert.deepStrictEqual(M.fjProximoPasso(plano, F(0, 0, 271), E({}, { refino: 100 })).acao, 'craft');
    const p = M.fjProximoPasso(plano, F(0, 0, 271), E({}, { refino: 99 }));
    assert(p.acao === 'parar' && /Refino T1/.test(p.motivo), JSON.stringify(p));
    assert.strictEqual(M.fjProximoPasso(plano, F(0, 0, 271), E({ refino: 1 }, {}, { gasto: 2000001 })).acao, 'parar');
    assert.strictEqual(M.fjProximoPasso(plano, F(0, 0, 271), E({ refino: 1 }, {}, { tentativas: 30 })).acao, 'parar');
    const semOuro = M.fjProximoPasso(plano, F(0, 0, 271), E({}, { refino: 100 }, { ouro: 1000 }));
    assert(semOuro.acao === 'parar' && /ouro/i.test(semOuro.motivo), JSON.stringify(semOuro));
});
t('fjProximoPasso: linhas — encaixe livre pede Atributo; cheio com linha errada no fim pede Limpeza T2; linha-alvo abaixo do valor pede Refazer T2 (última) ou T1; alvo com valor → fim', () => {
    const plano = { alvo: { linhas: ['regen_mana'], valorMin: 2.0 } };
    const g = { atributo: 1, limpeza_maior: 1, refazer: 1, refazer_maior: 1, raridade: 1 };
    assert.strictEqual(M.fjProximoPasso(plano, F(1, 0, 300), E(g)).acao, 'atributo');
    assert.strictEqual(M.fjProximoPasso(plano, F(1, 0, 300, ['capacidade', 50]), E(g)).acao, 'limpeza_maior');
    assert.strictEqual(M.fjProximoPasso(plano, F(1, 0, 300, ['regen_mana', 1.2]), E(g)).acao, 'refazer_maior');
    assert.strictEqual(M.fjProximoPasso(plano, F(2, 0, 300, ['regen_mana', 1.2], ['capacidade', 50]), E(g)).acao, 'refazer');
    assert.strictEqual(M.fjProximoPasso(plano, F(1, 0, 300, ['regen_mana', 2.3]), E(g)).acao, 'fim');
    /* precisa abrir encaixe: raridade primeiro */
    assert.strictEqual(M.fjProximoPasso({ alvo: { raridade: 2, linhas: ['regen_mana'] } }, F(1, 0, 300, ['capacidade', 50]), E(g)).acao, 'raridade');
    /* Comum sem encaixe nenhum e sem raridade no alvo: parar */
    assert.strictEqual(M.fjProximoPasso(plano, F(0, 0, 300), E(g)).acao, 'parar');
});

console.log(n + ' testes ok' + (process.exitCode ? ' (com falhas)' : ''));

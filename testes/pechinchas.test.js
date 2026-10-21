// Roda: node testes/pechinchas.test.js
// 2.29.0 — Radar → Pechinchas: keys de Elite e itens de quest abaixo da média, com lucro de revenda.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const i = src.indexOf('/* @@PECHINCHAS-INICIO'), f = src.indexOf('/* @@PECHINCHAS-FIM');
assert(i > 0 && f > i, 'trecho @@PECHINCHAS não encontrado');
const P = new Function(src.slice(i, f) + '\nreturn { PCH_PADRAO, pchItensVigiaveis, pchVigiados, pchCandidato, pchLivro, pchAvaliar };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
const cfg = Object.assign({}, P.PCH_PADRAO);

const bosses = [
    { name: 'Genio', kind: 'mini', keyItem: 'Genio Key' },
    { name: 'Shen-long', kind: 'boss', access: { items: [{ itemId: 21805, quantity: 7 }] } },
    { name: 'Sem key', kind: 'mini' }
];
const ilhas = [{ name: 'Gray Island', access: { items: [{ itemId: 100391, quantity: 70 }] } },
               { name: 'Zao', access: { items: [{ itemId: 100391, quantity: 70 }] } }];
const nomes = { 21805: 'the orb of light undying', 100391: 'yalahar gear wheel' };

t('lista vigiada: key do Elite, item de boss e de ilha, com os usos juntos', () => {
    const l = P.pchItensVigiaveis(bosses, ilhas, id => nomes[id]);
    const por = Object.fromEntries(l.map(x => [x.n, x]));
    assert.deepStrictEqual(Object.keys(por).sort(), ['genio key', 'the orb of light undying', 'yalahar gear wheel']);
    assert.match(por['genio key'].usos[0], /Elite Genio/);
    assert.match(por['the orb of light undying'].usos[0], /7× .*Shen-long/);
    assert.strictEqual(por['yalahar gear wheel'].usos.length, 2);
});
t('vigiados: só com negócios suficientes; extras entram e fora sai', () => {
    const itens = P.pchItensVigiaveis(bosses, ilhas, id => nomes[id]);
    const cat = { 'genio key': { trades30d: 1416 }, 'yalahar gear wheel': { trades30d: 3758 }, 'the orb of light undying': { trades30d: 1 }, 'gul\'dan key': { trades30d: 346 } };
    let v = P.pchVigiados(itens, cat, cfg).map(x => x.n).sort();
    assert.deepStrictEqual(v, ['genio key', 'yalahar gear wheel']);
    v = P.pchVigiados(itens, cat, Object.assign({}, cfg, { extras: ["Gul'dan Key"], fora: ['genio key'] })).map(x => x.n).sort();
    assert.deepStrictEqual(v, ["gul'dan key", 'yalahar gear wheel']);
});
t('candidato: menor venda 15 % abaixo da média, ou abaixo da maior compra', () => {
    assert.strictEqual(P.pchCandidato({ minSell: 80, sellOrders: 1 }, { avg: 100 }, cfg), true);
    assert.strictEqual(P.pchCandidato({ minSell: 90, sellOrders: 1 }, { avg: 100 }, cfg), false);
    assert.strictEqual(P.pchCandidato({ minSell: 90, sellOrders: 1, maxBuy: 95 }, null, cfg), true);
    assert.strictEqual(P.pchCandidato({ minSell: null, sellOrders: 0 }, { avg: 100 }, cfg), false);
});
t('livro: menor e 2.º menor de OUTROS vendedores; maior compra de outros', () => {
    const o = [{ id: 'a', side: 'SELL', unitPrice: 100, quantityRemaining: 3 }, { id: 'b', side: 'SELL', unitPrice: 90, quantityRemaining: 1 },
               { id: 'meu', side: 'SELL', unitPrice: 50, quantityRemaining: 5 }, { id: 'c', side: 'BUY', unitPrice: 70, quantityRemaining: 2 },
               { id: 'd', side: 'BUY', unitPrice: 95, quantityRemaining: 1 }, { id: 'e', side: 'SELL', unitPrice: 120, quantityRemaining: 1 }];
    const l = P.pchLivro(o, new Set(['meu']));
    assert.deepStrictEqual(l.menor, { id: 'b', preco: 90, qtd: 1 });
    assert.strictEqual(l.segundo, 100);
    assert.deepStrictEqual(l.compra, { id: 'd', preco: 95, qtd: 1 });
});
t('avaliar: revenda = min(média, 2.º − 1), lucro com 5 % de taxa, corte no teto', () => {
    const a = P.pchAvaliar({ preco: 20000, qtd: 100, media: { avg: 40000 }, segundo: 35000, compra: null, cfg, ouro: 9e6 });
    assert.strictEqual(a.tipo, 'revenda');
    assert.strictEqual(a.revenda, 34999);
    assert.strictEqual(a.lucroUn, Math.floor(34999 * 0.95) - 20000);
    assert.strictEqual(a.qtd, 50, 'teto de 1 milhão / 20 mil');
    assert.strictEqual(a.ok, true);
    assert.strictEqual(Math.round(a.desconto * 100), 50);
});
t('avaliar: lucro pequeno não é oferta; ouro curto corta a quantidade', () => {
    const p = P.pchAvaliar({ preco: 85000, qtd: 1, media: { avg: 100000 }, segundo: null, compra: null, cfg, ouro: 9e6 });
    assert.strictEqual(p.ok, false, '100k × 0,95 − 85k = 10k: abaixo de 15 % por unidade');
    const q = P.pchAvaliar({ preco: 10000, qtd: 50, media: { avg: 30000 }, segundo: null, compra: null, cfg, ouro: 55000 });
    assert.strictEqual(q.qtd, 5);
});
t('avaliar: UMA key de Elite barata entra (média 15,9 mil, anúncio a 10 mil → ~5 mil de lucro)', () => {
    const a = P.pchAvaliar({ preco: 10000, qtd: 1, media: { avg: 15900 }, segundo: 18000, compra: null, cfg, ouro: 9e6 });
    assert.strictEqual(a.revenda, 15900);
    assert.strictEqual(a.lucroUn, Math.floor(15900 * 0.95) - 10000);
    assert.strictEqual(a.ok, true, a.motivo);
});
t('avaliar: abaixo de uma compra aberta é arbitragem (sem taxa, limitada pela compra)', () => {
    const a = P.pchAvaliar({ preco: 40000, qtd: 5, media: { avg: 45000 }, segundo: 48000, compra: { id: 'x', preco: 60000, qtd: 2 }, cfg, ouro: 9e6 });
    assert.strictEqual(a.tipo, 'arbitragem');
    assert.strictEqual(a.qtd, 2);
    assert.strictEqual(a.lucroUn, 20000);
    assert.strictEqual(a.ok, true);
});
t('avaliar: sem média e sem compra aberta não há oferta', () => {
    const a = P.pchAvaliar({ preco: 1000, qtd: 1, media: null, segundo: 50000, compra: null, cfg, ouro: 9e6 });
    assert.strictEqual(a.ok, false);
});
console.log(n + ' testes');

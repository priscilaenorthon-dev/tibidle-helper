// Roda: node testes/mercado.test.js
// ABA MERCADO (2.11). Duas partes:
//  1) funções PURAS do trecho @@MERCADO-INICIO … @@MERCADO-PURO-FIM: regra de
//     preço (menor −1 sem contar as minhas ordens, empate, média 30 d), cópia
//     forjada (mesma raridade e mesmo refino), taxa, piso do NPC, exclusões
//     (selado, imbuído, protegido, usado, Equip, "nunca vender"), ritmo.
//  2) o userscript INTEIRO num vm com um servidor falso no WebSocket (mesmo
//     mundo de testes/fumaca.test.js): ATUALIZAR só lê; nada sai sem os 2
//     toques; fila depot_withdraw → market_create com o payload exato; erro
//     sem requestId (rate_limited, insufficient_item) casado pela janela de
//     tempo; conta sem Premium não anuncia.
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');
const SRC = fs.readFileSync(process.argv[2] || path.join(raiz, 'tibidle-helper.user.js'), 'utf8');
const le = (p) => JSON.parse(fs.readFileSync(path.join(raiz, p), 'utf8'));
const igual = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
const trecho = (a, b) => { const i = SRC.indexOf(a), f = SRC.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return SRC.slice(i, f); };

let n = 0, falhas = 0;
const testes = [];
const t = (nome, fn) => testes.push([nome, fn]);
async function rodar() {
    for (const [nome, fn] of testes) {
        try { await fn(); n++; console.log('ok  ', nome); }
        catch (e) { falhas++; console.log('FAIL', nome, '\n   ', (e && e.stack || String(e)).split('\n').slice(0, 5).join('\n    ')); }
    }
    console.log(`\n${n} testes ok` + (falhas ? ` · ${falhas} FALHARAM` : ''));
    if (falhas) process.exitCode = 1;
}

/* catálogos (recorte de /tradeable e /prices reais de 29/09) */
const TRAD = {
    'dragon ham': { cat: 'comida' }, 'small ruby': { cat: 'valiosos' }, 'orc tooth': { cat: 'despojos' }, 'wolf paw': { cat: 'despojos' },
    'elvish bow': { cat: 'armas', sub: 'distancia', hands: 2, forjavel: true }, 'plate armor': { cat: 'armaduras', forjavel: true }, 'might ring': { cat: 'aneis' }
};
const NPC = { 'dragon ham': 1, 'small ruby': 250, 'orc tooth': 150, 'wolf paw': 70, 'elvish bow': 200, 'plate armor': 400, 'might ring': 250, 'gold coin': 1 };
const ordem = (id, item, preco, x) => Object.assign({ id, side: 'SELL', asset: 'ITEM', itemName: item, unitPrice: preco, quantityTotal: 1, quantityRemaining: 1,
    escrowGold: 0, creationFeePaid: Math.max(1, Math.floor(preco * 0.05)), status: 'OPEN', expiresAt: 1759150000000 + 2 * 864e5 }, x || {});

/* ======================================================= 1) funções puras */
const P = new Function(`${trecho('/* @@MERCADO-INICIO', '/* @@MERCADO-PURO-FIM */')}
    return { mkTaxa, mkSugerir, mkMontar, mkRevisao, mkAbaixoDoNpc, mkEsperaNecessaria, mkMesmoCorte, mkPremium, mkAcoesNoMinuto, mkVendas, MK_ESPACO_MS, precoReferencia };`)();
const base = (x) => Object.assign({ tradeable: TRAD, npc: NPC, taxa: 0.05, catalogo: {}, minhas: [], livros: {}, copias: {}, stats: {},
    prot: { nomes: [], iids: [] }, nunca: [], equip: { usadas: [], reservas: [] }, naCidade: true, digitados: {}, marcados: [] }, x || {});
const linha = (r, chave) => r.linhas.find(l => l.chave === chave);

t('taxa = max(1, floor(preço × qtd × 5 %)) — igual ao cliente', () => {
    assert.strictEqual(P.mkTaxa(100, 1, 0.05), 5);
    assert.strictEqual(P.mkTaxa(10, 1, 0.05), 1, 'mínimo de 1');
    assert.strictEqual(P.mkTaxa(99, 5, 0.05), 24, '495 × 5 % = 24,75 → 24');
    assert.strictEqual(P.mkTaxa(1000, 3), 150, 'sem alíquota: 5 % da wiki');
    assert.strictEqual(P.mkTaxa(0, 1, 0.05), null);
    assert.strictEqual(P.mkTaxa(1000, 1, 0.1), 100);
});

t('preço sugerido: menor de OUTRO −1; o meu não conta; empate vai −1; média 30 d; vazio', () => {
    igual(P.mkSugerir({ outros: [500, 480] }), { preco: 479, origem: 'menor', ref: 480 });
    igual(P.mkSugerir({ outros: [500], meus: [450] }), { preco: 450, origem: 'meu', ref: 450 }, 'o menor já é meu: fica o meu');
    igual(P.mkSugerir({ outros: [500], meus: [500] }), { preco: 499, origem: 'menor', ref: 500 }, 'empate não é "o menor é meu"');
    igual(P.mkSugerir({ outros: [500], meus: [620] }), { preco: 499, origem: 'menor', ref: 500 });
    igual(P.mkSugerir({ outros: [], meus: [], media: 333.6 }), { preco: 334, origem: 'media', ref: 333.6 });
    igual(P.mkSugerir({ meus: [700], media: 100 }), { preco: 700, origem: 'meu', ref: 700 }, 'sem outro vendedor e com anúncio meu: fica o meu');
    igual(P.mkSugerir({}), { preco: null, origem: 'vazio', ref: null });
    igual(P.mkSugerir({ outros: [1] }), { preco: 1, origem: 'menor', ref: 1 }, 'nunca abaixo de 1');
});

t('empilhável: mochila + depósito, menor −1 do catálogo, retirar do depósito, líquido e NPC', () => {
    const r = P.mkMontar(base({ bag: { 'small ruby': 3 }, depot: [{ itemName: 'small ruby', count: 2 }],
        catalogo: { 'small ruby': { name: 'small ruby', sellOrders: 4, minSell: 900, trades30d: 10 } }, marcados: ['n:small ruby'] }));
    const l = linha(r, 'n:small ruby');
    assert(l, 'linha do small ruby não montou');
    assert.strictEqual(l.qtd, 5); assert.strictEqual(l.preco, 899); assert.strictEqual(l.origem, 'menor');
    igual(l.retirar, [{ name: 'small ruby', count: 2 }]);
    assert.strictEqual(l.taxa, 224); assert.strictEqual(l.liquido, 899 * 5 - 224); assert.strictEqual(l.npcTotal, 1250);
    assert.strictEqual(l.bloqueio, null); assert.strictEqual(l.marcado, true);
    assert.strictEqual(r.plano.n, 1); assert.strictEqual(r.plano.taxa, 224);
    assert.strictEqual(r.pendencias.length, 0, 'catálogo bastou — nenhum pedido extra');
});

t('minhas ordens não contam: livro só quando o menor pode ser meu; o menor já é meu = mantém', () => {
    const cat = (minSell, sellOrders) => ({ 'small ruby': { name: 'small ruby', sellOrders, minSell, trades30d: 10 } });
    const minhas = [ordem('m1', 'small ruby', 900)];
    // catálogo diz 900 (o meu) e há outras 3 ordens: precisa do livro
    let r = P.mkMontar(base({ bag: { 'small ruby': 2 }, catalogo: cat(900, 4), minhas }));
    igual(r.pendencias.map(p => [p.tipo, p.data]), [['market_list', { asset: 'ITEM', itemName: 'small ruby' }]]);
    assert(/falta ler o preço/.test(linha(r, 'n:small ruby').bloqueio));
    // livro: a minha a 900 (ignorada), outro a 950, uma compra a 800 (ignorada) → o menor é o meu: fica 900
    const livro = (outro) => ({ 'small ruby': { orders: [{ id: 'm1', side: 'SELL', unitPrice: 900, quantityRemaining: 1 }, { id: 'x2', side: 'SELL', unitPrice: outro, quantityRemaining: 3 }, { id: 'x3', side: 'BUY', unitPrice: 800, quantityRemaining: 1 }] } });
    r = P.mkMontar(base({ bag: { 'small ruby': 2 }, catalogo: cat(900, 4), minhas, livros: livro(950) }));
    let l = linha(r, 'n:small ruby'); assert.strictEqual(l.preco, 900); assert.strictEqual(l.origem, 'meu');
    // outro vendedor mais barato que eu no livro: −1 dele
    r = P.mkMontar(base({ bag: { 'small ruby': 2 }, catalogo: cat(900, 4), minhas, livros: livro(880) }));
    l = linha(r, 'n:small ruby'); assert.strictEqual(l.preco, 879); assert.strictEqual(l.origem, 'menor');
    // catálogo já mostra alguém abaixo do meu: sem livro
    r = P.mkMontar(base({ bag: { 'small ruby': 2 }, catalogo: cat(850, 4), minhas }));
    assert.strictEqual(r.pendencias.length, 0); assert.strictEqual(linha(r, 'n:small ruby').preco, 849);
    // todas as ordens do livro são minhas: sem livro, fica o meu
    r = P.mkMontar(base({ bag: { 'small ruby': 2 }, catalogo: cat(900, 1), minhas }));
    assert.strictEqual(r.pendencias.length, 0); assert.strictEqual(linha(r, 'n:small ruby').preco, 900);
});

t('sem concorrente: média de 30 dias (arredondada); sem histórico: vazio, sem pedido; digitado vale', () => {
    const cat = (tr) => ({ 'orc tooth': { name: 'orc tooth', sellOrders: 0, minSell: null, trades30d: tr } });
    let r = P.mkMontar(base({ bag: { 'orc tooth': 4 }, catalogo: cat(5) }));
    igual(r.pendencias.map(p => [p.tipo, p.data]), [['market_stats', { itemName: 'orc tooth' }]]);
    r = P.mkMontar(base({ bag: { 'orc tooth': 4 }, catalogo: cat(5), stats: { 'orc tooth': { stats: { avg: 412.4, min: 300, max: 500, samples: 9 } } } }));
    let l = linha(r, 'n:orc tooth'); assert.strictEqual(l.preco, 412); assert.strictEqual(l.origem, 'media');
    r = P.mkMontar(base({ bag: { 'orc tooth': 4 }, catalogo: cat(0) }));
    l = linha(r, 'n:orc tooth');
    assert.strictEqual(r.pendencias.length, 0, 'sem negócio em 30 d não pede média');
    assert.strictEqual(l.preco, null); assert.strictEqual(l.origem, 'vazio'); assert(/digite/.test(l.bloqueio));
    r = P.mkMontar(base({ bag: { 'orc tooth': 4 }, catalogo: cat(0), digitados: { 'n:orc tooth': '300' }, marcados: ['n:orc tooth'] }));
    l = linha(r, 'n:orc tooth'); assert.strictEqual(l.preco, 300); assert.strictEqual(l.origem, 'digitado'); assert.strictEqual(l.bloqueio, null);
    assert.strictEqual(r.plano.n, 1);
    // item nunca listado nem negociado (fora do catálogo do mercado): vazio, sem pedido
    r = P.mkMontar(base({ bag: { 'wolf paw': 2 }, catalogo: {} }));
    assert.strictEqual(r.pendencias.length, 0); assert.strictEqual(linha(r, 'n:wolf paw').origem, 'vazio');
});

t('cópia forjada: só mesma raridade E mesmo refino; minha cópia não conta; 1 pedido por categoria', () => {
    const catalogo = { 'elvish bow': { name: 'elvish bow', sellOrders: 0, minSell: null, copyOrders: 5, trades30d: 3 } };
    const e = { bagInst: [{ iid: 'b1', name: 'elvish bow', forja: { raridade: 2, refino: 3 } }],
                depot: [{ itemName: 'elvish bow', count: 1, iid: 'b2', forja: { raridade: 1, refino: 0 }, slot: 'weapon' }], bag: { 'elvish bow': 1 }, catalogo };
    let r = P.mkMontar(base(e));
    igual(r.pendencias.map(p => [p.tipo, p.data]), [['market_copies', { category: 'armas' }]], 'duas peças da mesma categoria = um pedido');
    const cp = (orderId, preco, rar, ref) => ({ orderId, itemName: 'elvish bow', unitPrice: preco, sellerName: 'x', instance: { iid: 'i' + orderId, name: 'elvish bow', forja: { raridade: rar, refino: ref } }, expiresAt: 1 });
    const copias = { 'cat:armas': { copies: [cp('m9', 5000, 2, 3), cp('o1', 5200, 2, 3), cp('o2', 3000, 2, 2), cp('o3', 2500, 1, 0), cp('o4', 900, 3, 3)] } };
    r = P.mkMontar(base(Object.assign({}, e, { copias, minhas: [ordem('m9', 'elvish bow', 5000, { forja: { raridade: 2, refino: 3 } })] })));
    const b1 = linha(r, 'i:b1'), b2 = linha(r, 'i:b2');
    assert.strictEqual(b1.preco, 5000, 'minha cópia (m9) é a menor do corte raro +3: fica a minha'); assert.strictEqual(b1.origem, 'meu');
    assert.strictEqual(b2.preco, 2499, 'incomum +0: só a o3 (2500) é do mesmo corte'); assert.strictEqual(b2.origem, 'menor');
    assert.strictEqual(b2.tipo, 'copia'); assert.strictEqual(b2.qtd, 1);
    igual(b2.retirar, [{ name: 'elvish bow', count: 1, iid: 'b2' }]);
    // sem a minha: o menor do corte raro +3 é o o1 (5200), não o o2 (+2) nem o o4 (épico)
    r = P.mkMontar(base(Object.assign({}, e, { copias: { 'cat:armas': { copies: copias['cat:armas'].copies.filter(c => c.orderId !== 'm9') } } })));
    assert.strictEqual(linha(r, 'i:b1').preco, 5199);
    // 2.11.8 — sem cópia do mesmo corte: SEM sugestão (a média de 30 d mistura raridades: dress comum a 104.790 ao vivo)
    r = P.mkMontar(base(Object.assign({}, e, { copias: { 'cat:armas': { copies: [cp('o4', 900, 3, 3)] } }, stats: { 'elvish bow': { stats: { avg: 4100.2 } } } })));
    const l = linha(r, 'i:b1'); assert.strictEqual(l.preco, null); assert.strictEqual(l.origem, 'vazio'); assert(/digite/.test(l.bloqueio)); assert(/todas as raridades/.test(l.nota));
    assert(!r.pendencias.some(p => p.tipo === 'market_stats'), 'cópia não pede a média de 30 d');
    // 2.11.20 — lista branca: com a leitura do Equip, só a cópia que ele pôs nas SOBRAS pode ser marcada
    r = P.mkMontar(base(Object.assign({}, e, { copias, equip: { usadas: [], reservas: [], sobras: ['b2'] } })));
    assert(r.fora.some(f => f.iid === 'b1' && /não pôs nas sobras/.test(f.motivo)), 'b1 fora das sobras tem que ser barrada: ' + JSON.stringify(r.fora));
    assert(linha(r, 'i:b2'), 'b2 está nas sobras: pode ser anunciada');
    // Equip não calculado: cópia não pode ser marcada
    r = P.mkMontar(base(Object.assign({}, e, { copias, equip: null })));
    assert(/ATUALIZAR no Equip/.test(linha(r, 'i:b1').bloqueio));
    assert(P.mkMesmoCorte({ raridade: 0 }, { raridade: 0, refino: 0 }) && !P.mkMesmoCorte({ raridade: 0 }, { refino: 0 }), 'corte ausente do anúncio = −1 (como o cliente)');
});

t('2.14.12 — cópia forjada: o ENCAIXE faz o preço — só cópias com os mesmos atributos contam (06/10: dark armor regen mana 250k × resist 9k)', () => {
    const catalogo = { 'plate armor': { name: 'plate armor', sellOrders: 0, minSell: null, copyOrders: 9, trades30d: 85 } };
    const fj = (rar, atrs, pot) => ({ fonte: 'drop', raridade: rar, refino: 0, potenciaBase: pot || 100, atributos: atrs.map(([id, valor]) => ({ id, valor })) });
    const cp = (orderId, preco, forja) => ({ orderId, itemName: 'plate armor', unitPrice: preco, sellerName: 'x', instance: { iid: 'i' + orderId, name: 'plate armor', forja }, expiresAt: 1 });
    const copias = { 'cat:armaduras': { copies: [
        cp('c1', 850, fj(0, [], 292)), cp('c2', 8999, fj(1, [['regen_vida', 1.7]], 194)), cp('c3', 9999, fj(1, [['resist_gelo', 0.9]], 9)),
        cp('c4', 250000, fj(1, [['regen_mana', 1.2]], 306)), cp('c5', 280000, fj(1, [['regen_mana', 1.2]], 59)), cp('c6', 450000, fj(1, [['Regen-Mana', '1,2']], 46)),
        cp('c7', 14999, fj(2, [['resist_gelo', 0.6], ['max_mana', 36]], 186)), cp('c8', 450000, fj(2, [['resist_sagrado', 0.8], ['regen_mana', 1.2]], 62)),
        cp('c9', 94000, fj(1, [['resist_morte', 1]], 193)) ] } };
    const e = { bagInst: [
        { iid: 'a1', name: 'plate armor', forja: fj(1, [['regen_mana', 1.3]], 34) },
        { iid: 'a2', name: 'plate armor', forja: fj(1, [['resist_gelo', 1.2]], 220) },
        { iid: 'a3', name: 'plate armor', forja: fj(1, [['max_hp', 17]], 171) },
        { iid: 'a4', name: 'plate armor', forja: fj(2, [['regen_mana', 1.1], ['resist_sagrado', 0.9]], 80) },
        { iid: 'a5', name: 'plate armor', forja: fj(0, [], 292) } ], bag: { 'plate armor': 5 }, catalogo, copias };
    const r = P.mkMontar(base(e));
    const a1 = linha(r, 'i:a1');
    assert.strictEqual(a1.preco, 249999, 'regen mana: menor regen mana de outro (250.000) −1 — não o resist a 8.999: ' + JSON.stringify(a1.sug));
    assert.strictEqual(a1.sug.ref, 250000); assert.strictEqual(a1.origem, 'menor');
    assert(/regen mana/.test(a1.encaixe || ''), 'a linha diz qual encaixe serviu de referência: ' + a1.encaixe);
    assert.strictEqual(linha(r, 'i:a2').preco, 9998, 'resist gelo: só a c3 (resist gelo) conta');
    const a3 = linha(r, 'i:a3');
    assert.strictEqual(a3.preco, null); assert.strictEqual(a3.origem, 'vazio'); assert(/digite/.test(a3.bloqueio));
    assert(/max hp/.test(a3.nota) && /8\.999|8999/.test(a3.nota) && /450\.000|450000/.test(a3.nota), 'sem igual: a nota diz o encaixe e a faixa dos outros encaixes incomum +0: ' + a3.nota);
    assert.strictEqual(linha(r, 'i:a4').preco, 449999, 'raro: os mesmos 2 atributos em qualquer ordem (c8), nunca a c7');
    assert.strictEqual(linha(r, 'i:a5').preco, 849, 'comum: sem atributos, como antes');
    // a minha ordem só conta como "meu" se tiver o mesmo encaixe
    let r2 = P.mkMontar(base(Object.assign({}, e, { minhas: [ordem('m1', 'plate armor', 240000, { forja: fj(1, [['regen_mana', 2]], 300) })] })));
    assert.strictEqual(linha(r2, 'i:a1').preco, 240000); assert.strictEqual(linha(r2, 'i:a1').origem, 'meu');
    r2 = P.mkMontar(base(Object.assign({}, e, { minhas: [ordem('m1', 'plate armor', 9999, { forja: fj(1, [['regen_vida', 2]], 300) })] })));
    assert.strictEqual(linha(r2, 'i:a1').preco, 249999, 'minha ordem de OUTRO encaixe (regen vida) não é "meu" para a regen mana');
    // mkMesmoCorte
    assert(P.mkMesmoCorte(fj(1, [['regen_mana', 1.3]]), fj(1, [['Regen Mana', '1,2']])), 'mesmo id normalizado, valor diferente = mesmo encaixe');
    assert(!P.mkMesmoCorte(fj(1, [['regen_mana', 1.3]]), fj(1, [['regen_vida', 1.3]])));
    assert(!P.mkMesmoCorte(fj(1, [['regen_mana', 1.3]]), { raridade: 1, refino: 0 }), 'anúncio incomum SEM a lista de atributos não serve de referência');
    assert(P.mkMesmoCorte({ raridade: 2, refino: 3 }, { raridade: 2, refino: 3 }), 'sem lista dos dois lados: raridade e refino bastam');
    assert(!P.mkMesmoCorte(fj(2, [['a', 1], ['b', 1]]), fj(2, [['a', 1], ['c', 1]])));
});

t('2.14.12 — revisão: menor de outro só com o MESMO encaixe; ordem minha abaixo dele mostra a folga', () => {
    const fj = (rar, atrs, pot) => ({ raridade: rar, refino: 0, potenciaBase: pot || 100, atributos: atrs.map(([id, valor]) => ({ id, valor })) });
    const cp = (orderId, preco, forja) => ({ orderId, itemName: 'plate armor', unitPrice: preco, instance: { name: 'plate armor', forja } });
    const copias = { 'cat:armaduras': { copies: [cp('d1', 9999, fj(1, [['regen_vida', 2]], 338)), cp('x1', 8999, fj(1, [['resist_gelo', 0.9]], 9)), cp('x2', 95000, fj(1, [['regen_vida', 2.4]], 239))] } };
    const r = P.mkRevisao(base({ catalogo: { 'plate armor': { name: 'plate armor', copyOrders: 3, sellOrders: 0 } }, copias,
        minhas: [ordem('d1', 'plate armor', 9999, { forja: fj(1, [['regen_vida', 2]], 338) })] }));
    const l = r.linhas[0];
    assert.strictEqual(l.menor, 95000, 'o resist a 8.999 não é concorrente da regen vida: ' + JSON.stringify(l));
    assert.strictEqual(l.situacao, 'menor'); assert.strictEqual(l.folga, 85001, 'quanto a minha está ABAIXO do menor de outro com o mesmo encaixe');
    assert(/regen vida/.test(l.encaixe || ''));
});

t('2.14.12 — vendidos: market_history type sell agrupado por item e preço, o mais recente primeiro; compra e criação ficam de fora', () => {
    const e = (id, type, itemName, quantity, unitPrice, at, extra) => Object.assign({ id, type, side: 'SELL', asset: 'ITEM', itemName, quantity, unitPrice, total: quantity * unitPrice, fee: Math.floor(quantity * unitPrice * 0.05), at }, extra || {});
    const hist = [e('1', 'sell', 'dark armor', 1, 9999, 1000), e('2', 'sell', 'dark armor', 1, 9999, 3000), e('3', 'sell', 'Wild Honey', 8, 799, 2000),
                  e('4', 'created', 'dark armor', 1, 9999, 4000), e('5', 'buy', 'small ruby', 3, 250, 5000, { side: 'BUY' }), e('6', 'cancelled', 'crowbar', 1, 999, 6000),
                  e('7', 'sell', 'dark armor', 1, 14999, 500)];
    const v = P.mkVendas(hist, 10000);
    assert.strictEqual(v.n, 4); assert.strictEqual(v.unidades, 11);
    assert.strictEqual(v.total, 9999 * 2 + 8 * 799 + 14999); assert.strictEqual(v.taxa, 499 * 2 + Math.floor(8 * 799 * 0.05) + 749);
    igual(v.linhas.map(l => [l.nome, l.qtd, l.preco, l.vezes, l.ultimo]), [['dark armor', 2, 9999, 2, 3000], ['Wild Honey', 8, 799, 1, 2000], ['dark armor', 1, 14999, 1, 500]]);
    // período: só o que cabe na janela
    assert.strictEqual(P.mkVendas(hist, 10000, 8000).n, 2, 'as vendas de at=500 e at=1000 (há 9.500 e 9.000) ficam fora de uma janela de 8.000; at=2000 (há 8.000) fica');
    igual(P.mkVendas([], 1), { linhas: [], n: 0, unidades: 0, total: 0, taxa: 0 });
    igual(P.mkVendas(null, 1).linhas, []);
});

t('piso do NPC: líquido ≤ NPC × qtd vira "vender no NPC" e não entra no plano', () => {
    // orc tooth: NPC paga 150. 157 − taxa 7 = 150 (empate → NPC); 158 − 7 = 151 → mercado
    let r = P.mkMontar(base({ bag: { 'orc tooth': 1 }, catalogo: { 'orc tooth': { sellOrders: 1, minSell: 158, trades30d: 1 } }, marcados: ['n:orc tooth'] }));
    let l = linha(r, 'n:orc tooth'); assert.strictEqual(l.preco, 157); assert.strictEqual(l.bloqueio, 'vender no NPC'); assert.strictEqual(l.marcado, false);
    assert.strictEqual(r.plano.n, 0, 'item abaixo do NPC entrou no plano');
    r = P.mkMontar(base({ bag: { 'orc tooth': 1 }, catalogo: { 'orc tooth': { sellOrders: 1, minSell: 159, trades30d: 1 } }, marcados: ['n:orc tooth'] }));
    l = linha(r, 'n:orc tooth'); assert.strictEqual(l.preco, 158); assert.strictEqual(l.bloqueio, null); assert.strictEqual(r.plano.n, 1);
    assert.strictEqual(P.mkAbaixoDoNpc(157, 1, 150, 0.05), true); assert.strictEqual(P.mkAbaixoDoNpc(158, 1, 150, 0.05), false);
    assert.strictEqual(P.mkAbaixoDoNpc(158, 1, null, 0.05), null, 'sem tabela do NPC: não sei');
    // compra aberta ≥ o preço: aviso (aceitar é sem taxa) — o mercado não cruza ordens
    r = P.mkMontar(base({ bag: { 'orc tooth': 1 }, catalogo: { 'orc tooth': { sellOrders: 1, minSell: 400, maxBuy: 420, trades30d: 1 } } }));
    assert(/COMPRA aberta a 420/.test(linha(r, 'n:orc tooth').nota), 'sem aviso da compra aberta acima do preço');
    r = P.mkMontar(base({ bag: { 'orc tooth': 1 }, catalogo: { 'orc tooth': { sellOrders: 1, minSell: 400, maxBuy: 300, trades30d: 1 } } }));
    assert.strictEqual(linha(r, 'n:orc tooth').nota, null);
    // sem /prices a lista inteira fica travada
    r = P.mkMontar(base({ npc: null, bag: { 'orc tooth': 1 }, catalogo: { 'orc tooth': { sellOrders: 1, minSell: 900, trades30d: 1 } }, marcados: ['n:orc tooth'] }));
    assert(/prices/.test(linha(r, 'n:orc tooth').bloqueio)); assert.strictEqual(r.plano.n, 0);
});

t('exclusões: selado, imbuído, usado, protegido (nome e iid), Equip, "nunca vender", não negociável', () => {
    const r = P.mkMontar(base({
        bag: { 'wolf paw': 3, 'dragon ham': 5, 'gold coin': 40, 'might ring': 2, 'plate armor': 3, 'elvish bow': 2 },
        bagInst: [
            { iid: 'p1', name: 'plate armor', forja: { selado: true } },
            { iid: 'p2', name: 'plate armor', forja: { raridade: 1 }, imbuements: [{ id: 'vampirism' }] },
            { iid: 'p3', name: 'plate armor', forja: { raridade: 1 } },
            { iid: 'r1', name: 'might ring', wear: { chargesLeft: 12 } },
            { iid: 'e1', name: 'elvish bow', forja: { raridade: 2 } },
            { iid: 'e2', name: 'elvish bow', forja: { raridade: 0 } }
        ],
        prot: { nomes: ['dragon ham'], iids: ['e2'] }, nunca: ['Wolf-Paw'], equip: { usadas: ['e1'], reservas: ['p3'] },
        catalogo: {}
    }));
    const motivo = (nome, iid) => (r.fora.find(f => f.nome === nome && (!iid || f.iid === iid)) || {}).motivo;
    assert(/selado/.test(motivo('plate armor', 'p1')));
    assert.strictEqual(motivo('plate armor', 'p2'), 'imbuído');
    assert(/Equip/.test(motivo('plate armor', 'p3')), 'reserva do Equip entrou na lista');
    assert(/corpo/.test(motivo('elvish bow', 'e1')), 'melhor do Equip (no corpo) entrou na lista'); // 2.15.0 — peça no corpo tem motivo próprio
    assert(/protegido/.test(motivo('elvish bow', 'e2')));
    assert(/protegido/.test(motivo('dragon ham')));
    assert(/nunca vender/.test(motivo('wolf paw')), 'lista pessoal "nunca vender" (com hífen e maiúscula) não valeu');
    assert(/não é negociável/.test(motivo('gold coin')));
    assert(/usado/.test(motivo('might ring', 'r1')));
    // o might ring solto (sem iid) continua vendável por nome, e só 1 (o usado saiu)
    const ring = linha(r, 'n:might ring');
    assert(ring && ring.qtd === 1, 'might ring solto: ' + JSON.stringify(ring && ring.qtd));
    for (const l of r.linhas) assert(!['plate armor', 'elvish bow', 'wolf paw', 'dragon ham', 'gold coin'].includes(l.nome), 'excluído virou linha: ' + l.nome);
    // "plate armor" ×3 na mochila = as 3 peças (sem sobra solta) — nenhuma linha fantasma
    assert(!r.fora.some(f => f.nome === 'plate armor' && /sem iid/.test(f.motivo)));
});

t('caçando: depósito só é lido — linha só do depósito fica travada, a mista anuncia só a mochila', () => {
    const r = P.mkMontar(base({ naCidade: false, bag: { 'small ruby': 2 }, depot: [{ itemName: 'small ruby', count: 3 }, { itemName: 'wolf paw', count: 9 }],
        catalogo: { 'small ruby': { sellOrders: 1, minSell: 900, trades30d: 1 }, 'wolf paw': { sellOrders: 1, minSell: 200, trades30d: 1 } } }));
    const rb = linha(r, 'n:small ruby'), wp = linha(r, 'n:wolf paw');
    assert.strictEqual(rb.qtd, 2); igual(rb.retirar, []);
    assert.strictEqual(wp.qtd, 0); assert(/só na cidade/.test(wp.bloqueio));
});

t('ritmo: 3,5 s entre pedidos, pausa do rate_limited, no máximo 16 ações por minuto', () => {
    const E = P.mkEsperaNecessaria;
    assert.strictEqual(P.MK_ESPACO_MS, 3500);
    assert.strictEqual(E({ agora: 10000, ultimo: 9000, envios: [] }), 2500);
    assert.strictEqual(E({ agora: 10000, ultimo: 1000, envios: [] }), 0);
    assert.strictEqual(E({ agora: 10000, ultimo: 1000, pausaAte: 30000, envios: [] }), 20000);
    const envios = Array.from({ length: 16 }, (_, i) => ({ t: 100000 + i * 3500, acao: true }));
    const agora = 100000 + 16 * 3500;
    assert.strictEqual(E({ agora, ultimo: agora - 3500, envios, acao: true }), 100000 + 60000 - agora, '16 ações no minuto: espera a mais antiga sair');
    assert.strictEqual(E({ agora, ultimo: agora - 3500, envios, acao: false }), 0, 'leitura não conta no limite de ações');
    assert.strictEqual(P.mkAcoesNoMinuto(envios, agora), 16);
});

t('revisão: você é o menor / alguém mais barato / sem concorrente / cópia do mesmo corte; custo de refazer', () => {
    const minhas = [ordem('a', 'small ruby', 900, { quantityRemaining: 4 }), ordem('b', 'orc tooth', 500), ordem('c', 'wolf paw', 300),
                    ordem('d', 'elvish bow', 5000, { forja: { raridade: 1, refino: 0 } }), ordem('e', 'dragon ham', 20, { side: 'BUY' })];
    const catalogo = { 'small ruby': { sellOrders: 3, minSell: 850 }, 'orc tooth': { sellOrders: 2, minSell: 500 }, 'wolf paw': { sellOrders: 1, minSell: 300 },
                       'elvish bow': { sellOrders: 0, minSell: null, copyOrders: 3 } };
    let rv = P.mkRevisao({ minhas, catalogo, tradeable: TRAD, taxa: 0.05, livros: {}, copias: {} });
    const por = (id) => rv.linhas.find(l => l.id === id);
    assert.strictEqual(por('a').situacao, 'barato'); assert.strictEqual(por('a').menor, 850); assert.strictEqual(por('a').novo, 849);
    assert.strictEqual(por('a').taxaNova, Math.floor(849 * 4 * 0.05)); assert.strictEqual(por('a').taxaPaga, 45);
    assert.strictEqual(por('b').situacao, 'pendente', 'menor pode ser o meu: precisa do livro');
    assert.strictEqual(por('c').situacao, 'sozinho');
    assert.strictEqual(por('d').situacao, 'pendente');
    assert.strictEqual(por('e').situacao, 'compra');
    igual(rv.pendencias.map(p => [p.tipo, p.data]).sort(), [['market_copies', { category: 'armas' }], ['market_list', { asset: 'ITEM', itemName: 'orc tooth' }]]);
    const cp = (orderId, preco, rar, ref) => ({ orderId, itemName: 'elvish bow', unitPrice: preco, instance: { name: 'elvish bow', forja: { raridade: rar, refino: ref } } });
    rv = P.mkRevisao({ minhas, catalogo, tradeable: TRAD, taxa: 0.05,
        livros: { 'orc tooth': { orders: [{ id: 'b', side: 'SELL', unitPrice: 500 }, { id: 'z', side: 'SELL', unitPrice: 520 }] } },
        copias: { 'cat:armas': { copies: [cp('d', 5000, 1, 0), cp('q', 4800, 1, 0), cp('w', 100, 2, 0)] } } });
    assert.strictEqual(por('b').situacao, 'menor'); assert.strictEqual(por('b').novo, null);
    assert.strictEqual(por('d').situacao, 'barato'); assert.strictEqual(por('d').menor, 4800, 'cópia de outra raridade (w) contou');
});

t('premium: welcome sem o campo = não sei; null = sem; data futura = sim', () => {
    const agora = Date.parse('2026-09-29T12:00:00Z');
    assert.strictEqual(P.mkPremium(undefined, agora), null);
    assert.strictEqual(P.mkPremium(null, agora), false);
    assert.strictEqual(P.mkPremium('2026-10-20T00:00:00Z', agora), true);
    assert.strictEqual(P.mkPremium('2026-09-01T00:00:00Z', agora), false);
});

/* 2.15.0 — preço de referência de uma peça forjada (igual / parecida / faixa / vazio) */
const cp = (item, preco, rar, atrs, orderId) => ({ orderId: orderId || 'o' + preco, itemName: item, unitPrice: preco, sellerName: 'x',
    instance: { iid: 'i' + preco, name: item, forja: { raridade: rar, refino: 0, atributos: atrs.map(([id, valor]) => ({ id, valor })) } } });
const F1 = (rar, ...atrs) => ({ raridade: rar, refino: 0, atributos: atrs.map(([id, valor]) => ({ id, valor })) });
t('precoReferencia: igual (mesmo corte) → menor −1; o meu anúncio não conta', () => {
    const copias = { 'cat:armaduras': { copies: [cp('dark armor', 300000, 1, [['regen_mana', 1.1]]), cp('dark armor', 450000, 1, [['regen_mana', 1.2]]), cp('dark armor', 9999, 1, [['resist_gelo', 1]]), cp('dark armor', 100, 1, [['regen_mana', 2]], 'meu')] } };
    igual(P.precoReferencia({ nome: 'dark armor', forja: F1(1, ['regen_mana', 1.4]) }, copias, new Set(['meu'])), { preco: 299999, origem: 'igual', ref: 300000 });
});
t('precoReferencia: parecida só com o encaixe nobre em comum (regen. de mana não casa com resistência)', () => {
    const copias = { 'cat:armaduras': { copies: [cp('dark armor', 450000, 2, [['resist_sagrado', 0.8], ['regen_mana', 1.2]]), cp('dark armor', 14999, 2, [['resist_morte', 1.2], ['resist_gelo', 1]])] } };
    igual(P.precoReferencia({ nome: 'dark armor', forja: F1(2, ['regen_mana', 1.4], ['resist_morte', 2.1]) }, copias, new Set()), { preco: 449999, origem: 'parecida', ref: 450000 });
});
t('precoReferencia: sem nobre, parecida = qualquer atributo em comum; senão faixa; senão vazio', () => {
    const copias = { 'cat:armaduras': { copies: [cp('plate armor', 65000, 2, [['resist_gelo', 2.1], ['resist_energia', 1.6]]), cp('plate armor', 70000, 2, [['max_mana', 55], ['protecao_magica', 0.4]])] } };
    igual(P.precoReferencia({ nome: 'plate armor', forja: F1(2, ['resist_sagrado', 1.4], ['resist_energia', 1.9]) }, copias, new Set()), { preco: 64999, origem: 'parecida', ref: 65000 });
    igual(P.precoReferencia({ nome: 'plate armor', forja: F1(2, ['max_hp', 20], ['cura_propria', 1]) }, copias, new Set()), { preco: null, origem: 'faixa', ref: null, min: 65000, max: 70000 });
    igual(P.precoReferencia({ nome: 'plate armor', forja: F1(3, ['max_hp', 20]) }, copias, new Set()), { preco: null, origem: 'vazio', ref: null });
    igual(P.precoReferencia({ nome: 'plate armor', forja: F1(0) }, null, null), { preco: null, origem: 'vazio', ref: null });
});
t('precoReferencia: nobre casa só com o MESMO conjunto de nobres (5b) — peça sem nobre × cópia com nobre = faixa; 1 nobre × 2 nobres = não casa', () => {
    /* peça só com resistências × cópia com regen. de mana + a mesma resistência (450k): a resistência em comum não a
     * torna parecida — a cópia vale pelo nobre que a peça não tem → faixa */
    const semNobre = { 'cat:armaduras': { copies: [cp('dark armor', 450000, 1, [['regen_mana', 1.2], ['resist_gelo', 1]])] } };
    igual(P.precoReferencia({ nome: 'dark armor', forja: F1(1, ['resist_gelo', 1.1], ['resist_energia', 0.9]) }, semNobre, new Set()), { preco: null, origem: 'faixa', ref: null, min: 450000, max: 450000 });
    /* peça com 1 nobre × cópia com 2 nobres (900k): não casa → faixa; com uma cópia de nobre igual, essa é a parecida */
    const doisNobres = { 'cat:armaduras': { copies: [cp('dark armor', 900000, 1, [['regen_mana', 1.2], ['regen_vida', 1.5]])] } };
    igual(P.precoReferencia({ nome: 'dark armor', forja: F1(1, ['regen_mana', 1.4]) }, doisNobres, new Set()), { preco: null, origem: 'faixa', ref: null, min: 900000, max: 900000 });
    const mista = { 'cat:armaduras': { copies: [...doisNobres['cat:armaduras'].copies, cp('dark armor', 300000, 1, [['regen_mana', 1.0], ['resist_morte', 1]])] } };
    igual(P.precoReferencia({ nome: 'dark armor', forja: F1(1, ['regen_mana', 1.4]) }, mista, new Set()), { preco: 299999, origem: 'parecida', ref: 300000 });
    /* sem cópia da mesma raridade: vazio (não faixa) */
    igual(P.precoReferencia({ nome: 'dark armor', forja: F1(2, ['regen_mana', 1.4]) }, doisNobres, new Set()), { preco: null, origem: 'vazio', ref: null });
});
t('mkMontar: cópia sem igual mas com parecida recebe o preço (origem "parecida"); sem parecida continua "digite"', () => {
    const copias = { 'cat:armaduras': { copies: [cp('plate armor', 65000, 2, [['resist_gelo', 2.1], ['resist_energia', 1.6]])] } };
    const e = base({ depot: [{ itemName: 'plate armor', count: 1, iid: 'pa1', forja: F1(2, ['resist_sagrado', 1.4], ['resist_energia', 1.9]) }],
        catalogo: { 'plate armor': { name: 'plate armor', sellOrders: 1, minSell: 65000, trades30d: 5, copyOrders: 1 } }, copias, equip: { usadas: [], reservas: [], sobras: ['pa1'] } });
    const l = linha(P.mkMontar(e), 'i:pa1');
    assert.strictEqual(l.preco, 64999); assert.strictEqual(l.origem, 'parecida'); assert.strictEqual(l.bloqueio, null);
    assert(/faixa dos outros encaixes raro \+0: de 65\.000 a 65\.000/.test(l.nota) && !/digite/.test(l.nota), 'com parecida a nota traz a faixa, sem "digite": ' + l.nota);
    const e2 = base({ depot: [{ itemName: 'plate armor', count: 1, iid: 'pa2', forja: F1(2, ['max_hp', 20], ['cura_propria', 1]) }],
        catalogo: { 'plate armor': { name: 'plate armor', sellOrders: 1, minSell: 65000, trades30d: 5, copyOrders: 1 } }, copias, equip: { usadas: [], reservas: [], sobras: ['pa2'] } });
    const l2 = linha(P.mkMontar(e2), 'i:pa2');
    assert.strictEqual(l2.preco, null); assert(/digite/.test(l2.bloqueio), 'sem parecida: digite');
});
t('mkMontar: liberadas tira a barreira "melhor ou reserva" só para o iid liberado; peça no corpo nunca', () => {
    const dep = [{ itemName: 'plate armor', count: 1, iid: 'res1', forja: F1(1, ['regen_mana', 1.3]) }, { itemName: 'plate armor', count: 1, iid: 'res2', forja: F1(1, ['regen_vida', 1.3]) }];
    const e = (lib) => base({ depot: dep, catalogo: { 'plate armor': { name: 'plate armor', sellOrders: 0, trades30d: 5 } },
        equip: { usadas: ['usa1'], reservas: ['res1', 'res2'], sobras: [] }, liberadas: lib });
    const sem = P.mkMontar(e([]));
    assert(sem.fora.some(f => f.iid === 'res1' && /melhor ou reserva/.test(f.motivo)), 'sem liberar: fora');
    const com = P.mkMontar(e(['res1']));
    assert(linha(com, 'i:res1'), 'liberada entra na lista'); assert(com.fora.some(f => f.iid === 'res2'), 'a outra reserva continua fora');
    const corpo = P.mkMontar(base({ bagInst: [{ iid: 'usa1', name: 'plate armor', forja: F1(0) }], catalogo: {}, equip: { usadas: ['usa1'], reservas: [], sobras: [] }, liberadas: ['usa1'] }));
    assert(corpo.fora.some(f => f.iid === 'usa1' && /corpo/.test(f.motivo)), 'o que está no corpo nunca é liberado');
});

/* ============================================ 2) o script inteiro num vm */
const SPELLS = le('testes/fixtures/spells.json').magias, POTIONS = le('testes/fixtures/potions.json').pocoes;
const HUNTS = [{ id: 34, title: 'Orc Fortress', levelMin: 40, island: 'tibidle_island', lureTiers: [{ min: 1, max: 5 }], monsters: [{ name: 'Orc Berserker', health: 210, experience: 195, weight: 1, elements: [] }] }];
const ROTAS = { '/hunts/select': HUNTS, '/spells': SPELLS, '/potions': POTIONS, '/buy-prices': {}, '/bosses/select': [],
                '/tradeable': TRAD, '/market/fees': { creationFeeRate: 0.05 }, '/prices': NPC };

/* mundo do testes/fumaca.test.js (DOM falso mínimo, relógio falso, localStorage),
 * com o WebSocket falso avisando cada envio (aoEnviar) e crypto.randomUUID */
function criarMundo(opts) {
    opts = opts || {};
    let AGORA = 1759150000000, seq = 0, rid = 0;
    const porId = new Map(), fila = [], errosTimer = [];
    class El {
        constructor(tag) {
            this.tagName = String(tag || 'div').toUpperCase(); this._id = ''; this.style = {}; this.dataset = {}; this.attrs = {};
            this.children = []; this._html = ''; this.textContent = ''; this.isConnected = true; this.disabled = false; this.value = ''; this.className = ''; this.scrollTop = 0;
            const cls = new Set();
            this.classList = { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)),
                toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : !!f; if (on) cls.add(c); else cls.delete(c); return on; }, contains: (c) => cls.has(c) };
        }
        get id() { return this._id; }
        set id(v) { this._id = v; porId.set(v, this); }
        get innerHTML() { return this._html; }
        set innerHTML(v) {
            this._html = String(v);
            for (const m of this._html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)) {
                const e = new El(m[1]); e._id = m[2]; porId.set(m[2], e);
                if (/\bchecked\b/.test(m[0])) e.checked = true;
                if (/\bdisabled\b/.test(m[0])) e.disabled = true;
                const val = /\bvalue="([^"]*)"/.exec(m[0]); if (val) e.value = val[1];
                const txt = new RegExp(`id="${m[2]}"[^>]*>([^<]*)`).exec(this._html); if (txt) e.textContent = txt[1];
            }
        }
        get offsetWidth() { return 44; } get offsetHeight() { return 60; } get innerText() { return this.textContent; }
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } setAttribute(k, v) { this.attrs[k] = String(v); }
        append() { } appendChild(c) { return c; } insertAdjacentElement() { } remove() { } focus() { } select() { } replaceChildren() { }
        addEventListener() { } removeEventListener() { } dispatchEvent() { return true; }
        closest() { return null; } querySelector(s) { return consulta(s); } querySelectorAll() { return []; }
        getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10 }; }
    }
    const consulta = (sel) => { const m = /^#([\w-]+)$/.exec(sel); return m ? porId.get(m[1]) || null : null; };
    const document = { readyState: 'complete', head: new El('head'), body: new El('body'), documentElement: new El('html'),
        createElement: (tg) => new El(tg), querySelector: consulta, querySelectorAll: () => [], addEventListener() { }, getElementById: (id) => porId.get(id) || null };
    const store = new Map(Object.entries(opts.ls || {}));
    const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); },
                 key: (i) => [...store.keys()][i] || null, clear: () => store.clear(), get length() { return store.size; } };
    const localStorage = new Proxy(ls, { ownKeys: () => [...store.keys()],
        getOwnPropertyDescriptor: (tg, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : undefined) });
    class FakeWS {
        constructor(url) { this.url = url; this.readyState = 1; this.ouvintes = {}; this.saida = []; }
        addEventListener(tp, f) { (this.ouvintes[tp] = this.ouvintes[tp] || []).push(f); }
        send(d) { this.saida.push({ t: AGORA, d }); if (typeof this.aoEnviar === 'function') this.aoEnviar(d); }
        emitir(o) { const data = typeof o === 'string' ? o : JSON.stringify(o); for (const f of (this.ouvintes.message || [])) f({ data }); }
    }
    FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
    class FDate extends Date { constructor(...a) { if (a.length) super(...a); else super(AGORA); } static now() { return AGORA; } }
    const setTimeout_ = (f, ms) => { const id = ++seq; fila.push({ id, t: AGORA + Math.max(0, Number(ms) || 0), f }); return id; };
    const setInterval_ = (f, ms) => { const id = ++seq; fila.push({ id, t: AGORA + Math.max(1, Number(ms) || 0), f, rep: true, ms: Math.max(1, Number(ms) || 0) }); return id; };
    const limpar = (id) => { const i = fila.findIndex(x => x.id === id); if (i >= 0) fila.splice(i, 1); };
    const drenar = async (k) => { for (let i = 0; i < (k || 4); i++) await new Promise(r => setImmediate(r)); };
    async function avancar(ms) {
        const alvo = AGORA + (ms || 0);
        await drenar();
        for (let guarda = 0; guarda < 200000; guarda++) {
            fila.sort((a, b) => a.t - b.t || a.id - b.id);
            const x = fila[0];
            if (!x || x.t > alvo) break;
            fila.shift();
            if (x.t > AGORA) AGORA = x.t;
            if (x.rep) { x.t = AGORA + x.ms; fila.push(x); }
            try { x.f(); } catch (e) { errosTimer.push(e); }
            await drenar(2);
        }
        AGORA = alvo;
        await drenar();
    }
    const rotas = Object.assign({}, ROTAS, opts.rotas || {});
    const fetch = async (url) => {
        const u = String(url);
        const caminho = u.includes('raw.githubusercontent') ? 'raw' : u.replace('https://play.tibidle.com', '').split('?')[0];
        const r = rotas[caminho];
        if (r instanceof Error) throw r;
        if (r === undefined) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
        return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(r)), text: async () => JSON.stringify(r) };
    };
    const crypto = { randomUUID: () => 'rid-' + (++rid) };
    const window = { WebSocket: FakeWS, addEventListener() { }, innerWidth: 1400, innerHeight: 900, open() { }, document, localStorage, crypto };
    const console_ = { log() { }, info() { }, warn() { }, error() { } };
    const ctx = { window, document, localStorage, WebSocket: FakeWS, console: console_, fetch, Date: FDate, crypto,
        setTimeout: setTimeout_, setInterval: setInterval_, clearTimeout: limpar, clearInterval: limpar,
        requestAnimationFrame: (f) => setTimeout_(f, 16), getComputedStyle: () => ({}), navigator: {}, location: { href: 'https://play.tibidle.com/' },
        MouseEvent: class { }, PointerEvent: class { }, KeyboardEvent: class { }, Event: class { }, MutationObserver: class { observe() { } disconnect() { } } };
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'tibidle-helper.user.js' });
    const lsGet = (k) => { const v = store.get(k); return v == null ? undefined : JSON.parse(v); };
    return { ctx, window, porId, store, lsGet, avancar, errosTimer, get agora() { return AGORA; }, get H() { return window.__tbHelper; } };
}

/* servidor falso: responde cada pedido do helper como o jogo (estado de
 * mochila e depósito de verdade); `interceptar(o, n)` troca a resposta do
 * n-ésimo pedido daquele tipo (lista = várias mensagens em sequência;
 * null = não responde) */
function servidor(W, ws, cfg) {
    const S = { bag: Object.assign({}, cfg.bag), inst: (cfg.inst || []).slice(), depot: (cfg.depot || []).map(x => Object.assign({}, x)), minhas: (cfg.minhas || []).slice(),
                recebidos: [], contagem: {}, idOrdem: 0 };
    const dep = () => ({ entries: S.depot.filter(x => x.count > 0).map(x => Object.assign({}, x)), used: S.depot.length, total: 100 });
    const padrao = (o) => {
        const d = o.data || {};
        switch (o.type) {
            case 'depot_get': return { type: 'depot_state', data: dep() };
            case 'market_catalog': return { type: 'market_catalog_result', data: { asOf: W.agora, items: cfg.catalogo || [], recentTrades: [], recentListed: [], kpis: { volume24h: 0, trades24h: 0, openOrders: 0 } } };
            case 'market_my_orders': return { type: 'market_my_orders_result', data: { orders: S.minhas, page: 0 } };
            case 'market_inbox': return { type: 'market_inbox_result', data: { entries: cfg.caixa || [], page: 0 } };
            case 'market_stats': return { type: 'market_stats_result', data: { itemName: d.itemName, stats: (cfg.stats || {})[d.itemName] || null, recentTrades: [], daily: [] } };
            case 'market_list': return { type: 'market_list_result', data: { asset: 'ITEM', itemName: d.itemName, orders: (cfg.livros || {})[d.itemName] || [], page: 0 } };
            case 'market_copies': return { type: 'market_copies_result', data: { copies: (cfg.copias || {})[d.category || d.itemName] || [] } };
            case 'depot_withdraw': {
                for (const it of d.items) {
                    const e = S.depot.find(x => x.itemName === it.name && (it.iid ? x.iid === it.iid : !x.iid));
                    if (!e || e.count < it.count) return { type: 'error', data: { code: 'insufficient_item', key: 'server.depot.x' } };
                    e.count -= it.count; S.bag[it.name] = (S.bag[it.name] || 0) + it.count;
                    if (it.iid) S.inst.push({ iid: it.iid, name: it.name, forja: e.forja });
                }
                return { type: 'depot_result', data: Object.assign({ requestId: d.requestId, bag: Object.assign({}, S.bag), bagInstances: S.inst.slice(), cap: { used: 10, total: 1000 } }, dep()) };
            }
            case 'market_create': {
                if ((S.bag[d.itemName] || 0) < d.quantity) return { type: 'error', data: { code: 'insufficient_item', key: 'server.mercado.semItemParaOrdem' } };
                S.bag[d.itemName] -= d.quantity; if (d.iid) S.inst = S.inst.filter(x => x.iid !== d.iid);
                const order = { id: 'novo' + (++S.idOrdem), side: 'SELL', asset: 'ITEM', itemName: d.itemName, unitPrice: d.unitPrice, quantityTotal: d.quantity, quantityRemaining: d.quantity,
                                escrowGold: 0, creationFeePaid: Math.max(1, Math.floor(d.unitPrice * d.quantity * 0.05)), status: 'OPEN', expiresAt: W.agora + 3 * 864e5 };
                S.minhas.push(order);
                return { type: 'market_create_result', data: { requestId: d.requestId, order, gold: 100000, goldLocked: 0, bag: Object.assign({}, S.bag), bagInstances: S.inst.slice(), coins: 0 } };
            }
            case 'market_cancel': {
                const o2 = S.minhas.find(x => x.id === d.orderId); S.minhas = S.minhas.filter(x => x.id !== d.orderId);
                return { type: 'market_cancel_result', data: { requestId: d.requestId, order: Object.assign({}, o2, { status: 'CANCELLED' }), gold: 1, goldLocked: 0, bag: S.bag, coins: 0 } };
            }
            case 'market_claim': {
                const en = (cfg.caixa || []).find(x => x.id === d.entryId); cfg.caixa = (cfg.caixa || []).filter(x => x.id !== d.entryId);
                return { type: 'market_claim_result', data: { requestId: d.requestId, entry: en, gold: 1, goldLocked: 0, bag: S.bag, coins: 0 } };
            }
            default: return undefined;
        }
    };
    ws.aoEnviar = (s) => {
        let o; try { o = JSON.parse(s); } catch (e) { return; }
        if (!o || o.type === 'auth') return;
        S.contagem[o.type] = (S.contagem[o.type] || 0) + 1;
        S.recebidos.push({ t: W.agora, o });
        let r = cfg.interceptar ? cfg.interceptar(o, S.contagem[o.type]) : undefined;
        if (r === undefined) r = padrao(o);
        if (r === null || r === undefined) return;
        const lista = Array.isArray(r) ? r : [r];
        Promise.resolve().then(() => { for (const m of lista) ws.emitir(m); });
    };
    S.tipos = (...tp) => S.recebidos.filter(x => tp.includes(x.o.type));
    return S;
}
const ESCRITA = ['depot_withdraw', 'market_create', 'market_cancel', 'market_claim', 'market_execute'];
const logTxt = (W) => (W.lsGet('tb_helper_log') || []).map(l => l.msg).join('\n');

async function mundoMercado(cfg) {
    cfg = cfg || {};
    const W = criarMundo({ rotas: cfg.rotas, ls: Object.assign({ tb_helper_debug: 'true', tb_helper_nivel_manual: '62', tb_helper_era: '"2026-09-wipe"',
        tb_helper_ui: JSON.stringify({ aba: 'mercado', aberta: true, oculto: false }) }, cfg.ls || {}) });
    await W.avancar(0);
    const ws = new W.window.WebSocket('wss://jogo');
    const S = servidor(W, ws, cfg);
    ws.emitir({ type: 'welcome', data: { account: { name: 'Northon', mainVocation: 'KNIGHT', premiumUntil: 'premium' in cfg ? cfg.premium : '2026-12-31T00:00:00Z' },
        bag: Object.assign({}, S.bag), bagInstances: S.inst.slice(), meta: { protected: cfg.protegidos || [], protectedIids: [] } } });
    if (cfg.equip) W.H.EQUIP.res = { porVoc: {}, usadas: new Set(cfg.equip.usadas || []), reservas: new Set(cfg.equip.reservas || []), dispensaveis: (cfg.equip.sobras || []).map(iid => ({ iid })), temporarios: [] };
    await W.avancar(0);
    const clicar = async (id) => { await W.avancar(0); const b = W.porId.get(id); assert(b && typeof b.onclick === 'function', 'botão ausente: ' + id); b.onclick(); await W.avancar(0); };
    const indice = (chave) => { const i = W.H.MERCADO.pintadas.findIndex(l => l.chave === chave); assert(i >= 0, 'linha ausente: ' + chave + ' — tem: ' + W.H.MERCADO.pintadas.map(l => l.chave)); return i; };
    const marcar = async (chave) => { await W.avancar(0); const c = W.porId.get('tb-mk-c-' + indice(chave)); assert(!c.disabled, 'caixa travada: ' + chave + ' (' + W.H.MERCADO.pintadas[indice(chave)].bloqueio + ')'); c.checked = true; c.onchange(); await W.avancar(0); };
    const atualizar = async () => { await clicar('tb-mk-atualizar'); await W.avancar(60000); assert.strictEqual(W.H.MERCADO.ocupado, null, 'ATUALIZAR não terminou'); };
    return { W, ws, S, clicar, marcar, atualizar, indice };
}
const CAT_BASE = [{ name: 'small ruby', sellOrders: 4, sellUnits: 9, minSell: 900, maxBuy: null, trades30d: 10 },
                  { name: 'orc tooth', sellOrders: 0, sellUnits: 0, minSell: null, maxBuy: null, trades30d: 6 },
                  { name: 'elvish bow', sellOrders: 0, sellUnits: 0, minSell: null, maxBuy: null, trades30d: 2, copyOrders: 2, minCopySell: 2000 }];
const semRid = (d) => { const x = Object.assign({}, d); delete x.requestId; return x; };

t('vm: ATUALIZAR só LÊ (catálogo, ordens, caixa, média) e monta a lista com o preço certo', async () => {
    const M = await mundoMercado({ bag: { 'small ruby': 3, 'orc tooth': 2 }, depot: [{ itemName: 'small ruby', count: 2 }], catalogo: CAT_BASE,
        stats: { 'orc tooth': { avg: 412.4, min: 300, max: 500, samples: 9 } } });
    await M.atualizar();
    assert.strictEqual(M.S.tipos(...ESCRITA).length, 0, 'ATUALIZAR mandou escrita: ' + M.S.tipos(...ESCRITA).map(x => x.o.type));
    igual(M.S.recebidos.map(x => x.o.type), ['depot_get', 'market_catalog', 'market_my_orders', 'market_inbox', 'market_stats']);
    igual(M.S.tipos('market_stats')[0].o.data, { itemName: 'orc tooth' });
    const mk = M.S.recebidos.filter(x => /^market_/.test(x.o.type));
    for (let i = 1; i < mk.length; i++) assert(mk[i].t - mk[i - 1].t >= 3500, 'pedidos ao mercado a menos de 3,5 s: ' + (mk[i].t - mk[i - 1].t));
    const L = M.W.H.MERCADO.pintadas;
    const rb = L.find(l => l.chave === 'n:small ruby'), ot = L.find(l => l.chave === 'n:orc tooth');
    assert.strictEqual(rb.preco, 899); assert.strictEqual(rb.qtd, 5); assert.strictEqual(ot.preco, 412); assert.strictEqual(ot.origem, 'media');
    const html = M.W.porId.get('tb-corpo').innerHTML;
    assert(/ANUNCIAR \(0\)/.test(html) && /Premium ✓/.test(html) && /taxa 5%/.test(html), 'topo/rodapé da aba não pintou');
    assert(!M.W.errosTimer.length, 'timer estourou: ' + M.W.errosTimer.join(' | '));
});

t('vm (2.13.5): "suas ordens" vêm em páginas de 50 — o ATUALIZAR lê todas (01/10: 55 abertas, o helper via 50)', async () => {
    const minhas = Array.from({ length: 55 }, (_, i) => ({ id: 'o' + i, side: 'SELL', asset: 'ITEM', itemName: i === 54 ? 'refine fragment t1' : 'item ' + i, unitPrice: 100 + i,
        quantityTotal: 1, quantityRemaining: 1, escrowGold: 0, creationFeePaid: 5, status: 'OPEN', expiresAt: 1790000000000 + i }));
    const M = await mundoMercado({ bag: { 'small ruby': 3 }, catalogo: CAT_BASE, minhas,
        interceptar: (o) => {
            if (o.type !== 'market_my_orders') return undefined;
            const p = Number(o.data && o.data.page) || 0;
            return { type: 'market_my_orders_result', data: { orders: minhas.slice(p * 50, p * 50 + 50), page: p } };
        } });
    await M.atualizar();
    const pedidos = M.S.tipos('market_my_orders').map(x => Number(x.o.data && x.o.data.page) || 0);
    igual(pedidos, [0, 1]);
    assert.strictEqual(M.W.H.MERCADO.minhas.length, 55, 'ordens lidas: ' + M.W.H.MERCADO.minhas.length);
    assert(M.W.H.MERCADO.minhas.some(x => x.itemName === 'refine fragment t1'), 'a ordem da página 2 ficou de fora');
    assert(/id="tb-mk-sub-meus"[^>]*>Meus anúncios <b>55<\/b>/.test(M.W.porId.get('tb-corpo').innerHTML), 'contador de Meus anúncios');
    assert.strictEqual(M.S.tipos(...ESCRITA).length, 0);
});
t('vm: nada é enviado sem o 2º toque (e o 1º toque expira em 4 s)', async () => {
    const M = await mundoMercado({ bag: { 'small ruby': 3 }, catalogo: CAT_BASE });
    await M.atualizar();
    await M.marcar('n:small ruby');
    await M.clicar('tb-mk-anunciar');
    assert(/CONFIRMAR: anunciar 1/.test(M.W.porId.get('tb-mk-anunciar').textContent), 'o 1º toque não armou a confirmação');
    await M.W.avancar(10000);
    assert.strictEqual(M.S.tipos(...ESCRITA).length, 0, 'enviou com UM toque');
    await M.clicar('tb-mk-anunciar');                  // confirmação expirou: este é um novo 1º toque
    await M.W.avancar(1000);
    assert.strictEqual(M.S.tipos(...ESCRITA).length, 0, 'toque depois de expirar valeu como confirmação');
    await M.clicar('tb-mk-anunciar');                  // 2º toque dentro dos 4 s
    await M.W.avancar(20000);
    assert.strictEqual(M.S.tipos('market_create').length, 1, 'o 2º toque não anunciou');
});

t('vm: fila depósito → mochila → market_create com o payload exato; cópia vai com iid e qtd 1', async () => {
    const copias = { armas: [{ orderId: 'o1', itemName: 'elvish bow', unitPrice: 2500, sellerName: 'Outro', instance: { iid: 'z1', name: 'elvish bow', forja: { raridade: 1, refino: 0 } }, expiresAt: 1 }] };
    const M = await mundoMercado({ bag: { 'small ruby': 3, 'elvish bow': 1 }, inst: [{ iid: 'b1', name: 'elvish bow', forja: { raridade: 1, refino: 0 } }],
        depot: [{ itemName: 'small ruby', count: 2 }], catalogo: CAT_BASE, copias, equip: { usadas: [], reservas: [], sobras: ['b1'] } });
    await M.atualizar();
    igual(M.S.tipos('market_copies').map(x => x.o.data), [{ category: 'armas' }]);
    await M.marcar('n:small ruby');
    await M.marcar('i:b1');
    await M.clicar('tb-mk-anunciar'); await M.clicar('tb-mk-anunciar');
    await M.W.avancar(60000);
    const esc = M.S.tipos(...ESCRITA);
    /* a fila segue a ordem da lista (Armas antes de Valiosos); a cópia já está na mochila: não retira */
    igual(esc.map(x => x.o.type), ['market_create', 'depot_withdraw', 'market_create'], 'ordem da fila');
    igual(semRid(esc[0].o.data), { side: 'SELL', asset: 'ITEM', itemName: 'elvish bow', unitPrice: 2499, quantity: 1, iid: 'b1' });
    igual(semRid(esc[1].o.data), { items: [{ name: 'small ruby', count: 2 }] });
    igual(semRid(esc[2].o.data), { side: 'SELL', asset: 'ITEM', itemName: 'small ruby', unitPrice: 899, quantity: 5 });
    for (const x of esc) assert(typeof x.o.data.requestId === 'string' && x.o.data.requestId.length > 3, 'sem requestId');
    assert.strictEqual(new Set(esc.map(x => x.o.data.requestId)).size, 3, 'requestId repetido entre pedidos diferentes');
    assert(esc[1].t - esc[0].t >= 3500 && esc[2].t - esc[1].t >= 3500, 'fila fora do ritmo de 3,5 s');
    const log = logTxt(M.W);
    assert(/anunciado 5× small ruby a 899/.test(log) && /anunciado 1× elvish bow a 2\.499/.test(log), 'log sem o resultado de cada anúncio:\n' + log.slice(-600));
    assert.strictEqual(M.W.H.MERCADO.ocupado, null);
    assert.strictEqual(M.W.H.motivoNaoDispara(), 'chave desligada', 'a trava comum ficou presa depois da fila');
    assert.strictEqual(M.W.H.MERCADO.marcados.size, 0, 'os anunciados continuaram marcados');
});

t('vm: rate_limited sem requestId → pausa de 20 s e repete o MESMO pedido; depois anuncia', async () => {
    const M = await mundoMercado({ bag: { 'small ruby': 3 }, catalogo: CAT_BASE,
        interceptar: (o, n) => (o.type === 'market_create' && n === 1 ? { type: 'error', data: { code: 'rate_limited', key: 'server.mercado.rateLimited' } } : undefined) });
    await M.atualizar();
    await M.marcar('n:small ruby');
    await M.clicar('tb-mk-anunciar'); await M.clicar('tb-mk-anunciar');
    await M.W.avancar(60000);
    const cr = M.S.tipos('market_create');
    assert.strictEqual(cr.length, 2, 'não repetiu depois do rate_limited');
    igual(cr[1].o.data, cr[0].o.data, 'a repetição mudou o payload (requestId tem que ser o mesmo)');
    assert(cr[1].t - cr[0].t >= 20000, 'repetiu antes da pausa de 20 s: ' + (cr[1].t - cr[0].t));
    const log = logTxt(M.W);
    assert(/rate_limited\) — pausa de 20 s/.test(log) && /anunciado 3× small ruby/.test(log), log.slice(-500));
});

t('vm: insufficient_item casado pela janela de tempo — o item falha, a fila segue; erro alheio com resultado não derruba', async () => {
    const M = await mundoMercado({ bag: { 'small ruby': 3, 'orc tooth': 2, 'wolf paw': 4 }, catalogo: CAT_BASE.concat([{ name: 'wolf paw', sellOrders: 1, minSell: 400, trades30d: 1 }]),
        stats: { 'orc tooth': { avg: 412, min: 1, max: 1, samples: 1 } },
        interceptar: (o, n) => {
            if (o.type !== 'market_create') return undefined;
            if (o.data.itemName === 'orc tooth') return { type: 'error', data: { code: 'insufficient_item', key: 'server.mercado.semItemParaOrdem' } };
            /* erro de OUTRA coisa chega junto, mas o resultado de verdade vem logo depois: vale o resultado */
            if (o.data.itemName === 'wolf paw') return [{ type: 'error', data: { code: 'not_hunting', key: 'x' } }, { type: 'market_create_result', data: { requestId: o.data.requestId,
                order: { id: 'w1', side: 'SELL', asset: 'ITEM', itemName: 'wolf paw', unitPrice: o.data.unitPrice, quantityTotal: 4, quantityRemaining: 4, escrowGold: 0, creationFeePaid: 79, status: 'OPEN', expiresAt: 1 },
                gold: 1, goldLocked: 0, bag: {}, coins: 0 } }];
            return undefined;
        } });
    await M.atualizar();
    for (const k of ['n:orc tooth', 'n:small ruby', 'n:wolf paw']) await M.marcar(k);
    await M.clicar('tb-mk-anunciar'); await M.clicar('tb-mk-anunciar');
    await M.W.avancar(90000);
    igual(M.S.tipos('market_create').map(x => x.o.data.itemName), ['small ruby', 'orc tooth', 'wolf paw'], 'a fila parou no erro de um item');
    const log = logTxt(M.W);
    assert(/2× orc tooth NÃO anunciado — o item não está na mochila nessa quantidade \(insufficient_item\)/.test(log), log.slice(-800));
    assert(/anunciado 3× small ruby/.test(log) && /anunciado 4× wolf paw/.test(log), 'erro alheio derrubou o anúncio que deu certo:\n' + log.slice(-800));
    assert(/2 anunciado\(s\).*1 não anunciado/.test(log));
});

t('vm: conta sem Premium não anuncia (nem com os 2 toques)', async () => {
    const M = await mundoMercado({ premium: null, bag: { 'small ruby': 3 }, catalogo: CAT_BASE });
    await M.atualizar();
    assert(/sem Premium/.test(M.W.porId.get('tb-corpo').innerHTML));
    await M.marcar('n:small ruby');
    await M.clicar('tb-mk-anunciar'); await M.clicar('tb-mk-anunciar');
    await M.W.avancar(20000);
    assert.strictEqual(M.S.tipos(...ESCRITA).length, 0, 'anunciou sem Premium');
    assert(/sem Premium/.test(logTxt(M.W)));
});

t('vm: revisar mostra quem está mais barato; cancelar pede 2 toques e manda market_cancel', async () => {
    const minhas = [ordem('m1', 'small ruby', 950, { quantityRemaining: 2 })];
    const M = await mundoMercado({ bag: {}, catalogo: CAT_BASE, minhas });
    await M.clicar('tb-mk-sub-meus');
    await M.clicar('tb-mk-revisar');
    await M.W.avancar(30000);
    assert.strictEqual(M.S.tipos(...ESCRITA).length, 0, 'revisar mandou escrita');
    const html = M.W.porId.get('tb-corpo').innerHTML;
    assert(/alguém está mais barato/.test(html) && /menor de outro: 900/.test(html) && /refazer a 899: taxa nova 89/.test(html), html.slice(0, 1500));
    await M.clicar('tb-mk-x-0');
    await M.W.avancar(1000);
    assert.strictEqual(M.S.tipos('market_cancel').length, 0, 'cancelou com UM toque');
    await M.clicar('tb-mk-x-0');
    await M.W.avancar(10000);
    const c = M.S.tipos('market_cancel');
    assert.strictEqual(c.length, 1); igual(semRid(c[0].o.data), { orderId: 'm1' });
    assert(/cancelada/.test(logTxt(M.W)));
});

t('vm: caixa de entrada — LER só lê; RESGATAR TUDO manda um market_claim por entrega, no ritmo', async () => {
    const caixa = [{ id: 'c1', currency: 'gold', itemName: 'small ruby', amount: 4495, reason: 'trade_proceeds', at: 1 },
                   { id: 'c2', currency: 'item', itemName: 'orc tooth', amount: 2, reason: 'order_expired', at: 2 }];
    const M = await mundoMercado({ bag: {}, catalogo: CAT_BASE, caixa });
    await M.clicar('tb-mk-sub-caixa');
    await M.clicar('tb-mk-caixa');
    await M.W.avancar(10000);
    assert.strictEqual(M.S.tipos(...ESCRITA).length, 0, 'LER CAIXA mandou escrita');
    assert(/RESGATAR TUDO \(2\)/.test(M.W.porId.get('tb-corpo').innerHTML));
    await M.clicar('tb-mk-resgatar');
    await M.W.avancar(30000);
    const cl = M.S.tipos('market_claim');
    igual(cl.map(x => semRid(x.o.data)), [{ entryId: 'c1' }, { entryId: 'c2' }]);
    assert(cl[1].t - cl[0].t >= 3500, 'resgates fora do ritmo');
    assert(/2 entrega\(s\) resgatada\(s\) · \+4\.495 ouro/.test(logTxt(M.W)), logTxt(M.W).slice(-400));
});

t('vm (2.15.0): MK.liberadas sobrevive ao ATUALIZAR do Mercado e cai ao desmarcar a peça, no "desmarcar" e depois de anunciar', async () => {
    const copias = { armas: [{ orderId: 'o1', itemName: 'elvish bow', unitPrice: 2500, sellerName: 'Outro', instance: { iid: 'z1', name: 'elvish bow', forja: { raridade: 1, refino: 0 } }, expiresAt: 1 }] };
    const mundo = () => mundoMercado({ bag: { 'elvish bow': 1 }, inst: [{ iid: 'b1', name: 'elvish bow', forja: { raridade: 1, refino: 0 } }],
        catalogo: CAT_BASE, copias, equip: { usadas: [], reservas: ['b1'], sobras: [] } });
    /* reserva do Equip liberada antes do ATUALIZAR (é o que o botão da caixinha do Equip faz na Task 7) */
    const M = await mundo(); const MK = M.W.H.MERCADO;
    MK.liberadas.add('b1'); MK.marcados.add('i:b1');
    await M.atualizar();
    assert(MK.liberadas.has('b1'), 'o ATUALIZAR do Mercado (que relê o Equip por tabela) apagou a liberação');
    const l = MK.pintadas.find(x => x.chave === 'i:b1');
    assert(l && l.bloqueio === null && l.marcado, 'a reserva liberada não entrou marcada: ' + JSON.stringify(l && l.bloqueio));
    /* 1) desmarcar a caixa da peça desfaz a liberação */
    const c = M.W.porId.get('tb-mk-c-' + M.indice('i:b1')); c.checked = false; c.onchange(); await M.W.avancar(0);
    assert(!MK.liberadas.has('b1') && !MK.marcados.has('i:b1'), 'desmarcar não desfez a liberação');
    assert(!MK.pintadas.some(x => x.chave === 'i:b1'), 'sem liberação a reserva voltou a entrar na lista');
    /* 2) "desmarcar" (todos) limpa as liberações */
    MK.liberadas.add('b1'); MK.marcados.add('i:b1'); await M.clicar('tb-mk-sub-anunciar');
    assert(M.indice('i:b1') >= 0); await M.clicar('tb-mk-nenhum');
    assert.strictEqual(MK.liberadas.size, 0, '"desmarcar" não limpou as liberações');
    /* 3) anunciada: a liberação sai junto com a marca */
    MK.liberadas.add('b1'); MK.marcados.add('i:b1'); await M.clicar('tb-mk-sub-anunciar');
    await M.clicar('tb-mk-anunciar'); await M.clicar('tb-mk-anunciar'); await M.W.avancar(30000);
    const esc = M.S.tipos(...ESCRITA);
    igual(esc.map(x => semRid(x.o.data)), [{ side: 'SELL', asset: 'ITEM', itemName: 'elvish bow', unitPrice: 2499, quantity: 1, iid: 'b1' }]);
    assert.strictEqual(MK.liberadas.size, 0, 'anunciou e a liberação ficou'); assert.strictEqual(MK.marcados.size, 0);
});
t('vm (2.15.0): uma leitura do Equip pedida pelo dono (não a do ATUALIZAR do Mercado) derruba a liberação e a marca', async () => {
    /* sem EQUIP.res a linha da cópia fica travada e aparece o botão "ATUALIZAR o Equip agora" (equipAtualizar sem opções) */
    const M = await mundoMercado({ bag: { 'elvish bow': 1 }, inst: [{ iid: 'b1', name: 'elvish bow', forja: { raridade: 1, refino: 0 } }], catalogo: CAT_BASE, copias: { armas: [] } });
    const MK = M.W.H.MERCADO;
    MK.liberadas.add('b1'); MK.marcados.add('i:b1');
    await M.atualizar();
    assert(MK.liberadas.has('b1') && MK.marcados.has('i:b1'), 'o ATUALIZAR do Mercado apagou a liberação');
    await M.clicar('tb-mk-equip'); await M.W.avancar(1000);
    assert(!MK.liberadas.has('b1') && !MK.marcados.has('i:b1'), 'a leitura do Equip pedida pelo dono manteve a liberação');
});
t('vm (2.15.1): VENDER NO NPC das sobras — outra peça de mesmo nome na mochila que não é sobra aborta antes do painel', async () => {
    /* o painel de venda só conhece o NOME: a plate armor x9 (boa, na mochila) iria junto com a sobra p1 do depósito */
    const F0 = { raridade: 0, refino: 0, atributos: [] };
    const M = await mundoMercado({ ls: { tb_helper_ui: JSON.stringify({ aba: 'equip', aberta: true, oculto: false }) },
        bag: { 'plate armor': 1 }, inst: [{ iid: 'x9', name: 'plate armor', forja: F0 }],
        depot: [{ itemName: 'plate armor', iid: 'p1', count: 1, slot: 'armor', forja: F0 }] });
    const E = M.W.H.EQUIP, vazio = { KNIGHT: {}, PALADIN: {}, SORCERER: {}, DRUID: {} };
    E.res = { porVoc: vazio, usadas: new Set(), reservas: new Set(), temporarios: [], bases: [], nobres: [],
              dispensaveis: [{ iid: 'p1', nome: 'plate armor', slot: 'armor', origem: 'depósito', sell: 400, forja: F0, attrs: {}, motivo: 'nenhuma vocação usa' }] };
    E.t = M.W.agora;
    M.ws.emitir({ type: 'depot_state', data: { entries: [] } });   // repinta a aba Equip com o EQUIP.res plantado
    await M.W.avancar(0);
    assert(/vender no NPC \(1 · 400 o\)/.test(M.W.porId.get('tb-corpo').innerHTML), 'a sobra não apareceu na caixinha do NPC');
    await M.clicar('tb-eq-vender-npc');
    assert(/confirmar: vender 1/.test(M.W.porId.get('tb-eq-vender-npc').textContent), 'o 1º toque não armou a confirmação');
    assert.strictEqual(M.S.tipos('depot_withdraw').length, 0, 'retirou do depósito com UM toque');
    await M.clicar('tb-eq-vender-npc'); await M.W.avancar(30000);
    igual(M.S.tipos('depot_withdraw').map(x => x.o.data.items), [[{ name: 'plate armor', count: 1, iid: 'p1' }]], 'retirou mais (ou menos) que a sobra');
    const log = logTxt(M.W);
    assert(/há outra plate armor na mochila que não é sobra/.test(log), 'o Log não acusou a intrusa: ' + log.split('\n').slice(-4).join(' | '));
    assert(!/vendido no NPC|actionbar-selling|nada para vender/.test(log), 'tentou o painel de venda mesmo com a intrusa');
    assert(/há outra plate armor/.test(E.aviso || ''), 'o aviso da aba Equip não ficou depois da releitura: ' + E.aviso);
    assert(!E.vendendo && !E.equipando && E.vendaConf == null, 'a aba Equip ficou travada');
});

rodar();

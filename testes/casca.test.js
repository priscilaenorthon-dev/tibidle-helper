// Roda: node testes/casca.test.js
// Extrai a geometria pura da casca do painel (@@CASCA) e confere, sem navegador, o que a
// auditoria de UI de 29/09 mediu numa maquete com o CSS real do jogo: o lugar padrão não
// cobre barra de atalhos / mochila / equipamento / barra de ação, o trilho arrastado ao
// fundo fica inteiro na tela, a posição da 2.9 migra, e o contador/faixa do Log.
// Layout do jogo (CSS real): topbar 38 px, colunas laterais 250 px, barra de ação 50 px,
// chat 200 px; a barra de atalhos fica colada à DIREITA da cena (right:0; top:12px).
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const C = new Function(`${trecho('/* @@CASCA-INICIO', '/* @@CASCA-FIM */')}
    return { migrarUI, lugarDoTrilho, alturaDoTrilhoCel, lugarDaGaveta, contarErrosNaoLidos, escolherAviso, FAIXA_MS, CEL_MAX };`)();

let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
const ret = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
/* shell do jogo numa janela W×H, como o CSS real monta */
const jogo = (W, H) => {
    const acaoTopo = H - 200 - 50;
    return {
        J: { esq: ret(0, 38, 250, H), topo: ret(0, 0, W, 38), acao: ret(250, acaoTopo, W - 250, acaoTopo + 50), chat: ret(250, acaoTopo + 50, W - 250, H) },
        atalhos: ret(W - 250 - 98, 38 + 12, W - 250, 38 + 12 + 190), dir: ret(W - 250, 38, W, H)
    };
};
const PADRAO = { aba: 'magia', aberta: false, oculto: false, livre: false, ancora: 'esq', dx: 8, y: 84, yCel: null, logLido: 0 };
const TW = 46, TH = 312, GW = 300;
const cobre = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const caixas = (W, H, u, arrasto, J) => {
    const p = C.lugarDoTrilho(W, H, TW, TH, u, arrasto, J);
    const g = C.lugarDaGaveta(W, H, p, TW, TH, GW, !u.livre && !arrasto, J);
    const top = g.top != null ? g.top : H - g.bottom - g.maxH;
    return { p, g, trilho: ret(p.x, p.y, p.x + TW, p.y + TH), gaveta: ret(g.gx, top, g.gx + GW, top + g.maxH) };
};

for (const [W, H] of [[1366, 768], [1400, 900], [1920, 1080]]) {
    t(`${W}×${H}: lugar padrão na borda esquerda da cena, sem cobrir atalhos/mochila/equipamento/barra de ação`, () => {
        const { J, atalhos, dir } = jogo(W, H);
        const c = caixas(W, H, PADRAO, null, J);
        assert.deepStrictEqual(c.p, { x: 258, y: 50 });
        assert.strictEqual(c.g.gx, 258 + TW + 4, 'gaveta abre para dentro da cena');
        for (const [nome, r] of [['atalhos', atalhos], ['coluna direita', dir], ['barra de ação', J.acao], ['chat', J.chat]])
            for (const [q, k] of [['trilho', c.trilho], ['gaveta', c.gaveta]]) assert.strictEqual(cobre(k, r), 0, `${q} cobre ${nome}`);
        assert.strictEqual(c.g.maxH, Math.min(Math.round(H * 0.62), J.acao.top - 8 - 50), 'altura = min(62vh, topo da barra de ação − top − 8)');
    });
    t(`${W}×${H}: arrastado até o fundo, o trilho inteiro fica na tela e a gaveta não desce na barra de ação`, () => {
        const { J } = jogo(W, H);
        const c = caixas(W, H, PADRAO, { x: 258, y: H + 300 }, J);
        assert(c.trilho.bottom <= H && c.trilho.top >= 0, 'trilho fora da tela: ' + JSON.stringify(c.trilho));
        assert(c.gaveta.bottom <= J.acao.top - 8 + 0.5, 'gaveta passa do chão: ' + c.gaveta.bottom + ' > ' + (J.acao.top - 8));
        assert(c.gaveta.top >= 38, 'gaveta sobe além da topbar');
        assert(c.g.maxH >= 200, 'gaveta ficou minúscula: ' + c.g.maxH);
    });
}
t('arrastado para a direita: gaveta abre para a esquerda e fica na tela', () => {
    const { J } = jogo(1400, 900);
    const u = Object.assign({}, PADRAO, { livre: true, ancora: 'dir', dx: 20, y: 300 });
    const c = caixas(1400, 900, u, null, J);
    assert.strictEqual(c.p.x, 1400 - 20 - TW);
    assert.strictEqual(c.g.gx, c.p.x - 4 - GW);
    assert(c.gaveta.left >= 0 && c.gaveta.right <= 1400);
});
t('ancorado à direita sobrevive a janela menor (não sai da tela)', () => {
    const u = Object.assign({}, PADRAO, { livre: true, ancora: 'dir', dx: 20, y: 700 });
    const p = C.lugarDoTrilho(1000, 600, TW, TH, u, null, {});
    assert.strictEqual(p.x, 1000 - 20 - TW); assert(p.y + TH <= 600);
});
t('sem shell do jogo (login/lobby): 8/84', () => {
    assert.deepStrictEqual(C.lugarDoTrilho(1400, 900, TW, TH, PADRAO, null, {}), { x: 8, y: 84 });
});
t('migração 2.9: right 8/top 84 (padrão antigo) vira lugar automático; arrasto antigo continua valendo', () => {
    const a = C.migrarUI({ aba: 'scan', aberta: true, top: 84, right: 8, oculto: false }, PADRAO, 123);
    assert.strictEqual(a.livre, false); assert.strictEqual(a.aba, 'scan'); assert.strictEqual(a.right, undefined); assert.strictEqual(a.logLido, 123);
    const b = C.migrarUI({ aba: 'estado', top: 300, right: 120 }, PADRAO, 5);
    assert.deepStrictEqual([b.livre, b.ancora, b.dx, b.y], [true, 'dir', 120, 300]);
    const c = C.migrarUI({ livre: true, ancora: 'esq', dx: 40, y: 200, logLido: 9 }, PADRAO, 99);
    assert.deepStrictEqual([c.livre, c.dx, c.logLido], [true, 40, 9], 'estado 2.10 não é remexido');
    assert.strictEqual(C.migrarUI(null, PADRAO, 1).livre, false);
});
t('celular: trilho acima da folha por padrão, arrasto limitado à tela', () => {
    assert.strictEqual(C.alturaDoTrilhoCel(844, 58, PADRAO, null), 422 - 58 - 4);
    assert.strictEqual(C.alturaDoTrilhoCel(844, 58, PADRAO, { x: 0, y: 5000 }), 844 - 58);
    assert.strictEqual(C.alturaDoTrilhoCel(844, 58, PADRAO, { x: 0, y: -50 }), 0);
    assert.strictEqual(C.alturaDoTrilhoCel(844, 58, Object.assign({}, PADRAO, { yCel: 100 }), null), 100);
    assert.strictEqual(C.CEL_MAX, 640);
});
t('contador de erros não lidos: só erros depois da última leitura', () => {
    const L = [{ t: 1, tipo: 'erro' }, { t: 5, tipo: 'erro' }, { t: 6, tipo: 'info' }, { t: 8, tipo: 'erro' }, { t: 9, tipo: 'ok' }];
    assert.strictEqual(C.contarErrosNaoLidos(L, 0), 3);
    assert.strictEqual(C.contarErrosNaoLidos(L, 5), 1, 'erro seguido de info continua contando (o ponto vermelho antigo sumia)');
    assert.strictEqual(C.contarErrosNaoLidos(L, 9), 0);
    assert.strictEqual(C.contarErrosNaoLidos([], 0), 0);
});
t('faixa de retorno: aviso da aba, linha do Log depois do clique, 10 s, outra aba não vê', () => {
    const av = { t: 1000, msg: 'aplicado', tipo: 'ok' };
    assert.strictEqual(C.escolherAviso(av, null, null, 'magia', 5000), av);
    assert.strictEqual(C.escolherAviso(av, null, null, 'magia', 1000 + C.FAIXA_MS), null, 'some depois de 10 s');
    const clique = { aba: 'estado', t: 2000 }, linha = { t: 2500, msg: 'botão VENDER não está na tela', tipo: 'erro' };
    assert.strictEqual(C.escolherAviso(null, clique, linha, 'estado', 3000), linha);
    assert.strictEqual(C.escolherAviso(null, clique, linha, 'magia', 3000), null, 'a faixa é da aba que agiu');
    assert.strictEqual(C.escolherAviso(null, clique, { t: 1500, msg: 'antes do clique' }, 'estado', 3000), null);
    assert.strictEqual(C.escolherAviso(null, clique, { t: 2000 + 61000, msg: 'muito depois' }, 'estado', 2000 + 62000), null);
    assert.strictEqual(C.escolherAviso({ t: 2600, msg: 'avisar', tipo: 'ok' }, clique, linha, 'estado', 3000).msg, 'avisar', 'o mais novo vence');
});
console.log(`\n${n} testes ok`);

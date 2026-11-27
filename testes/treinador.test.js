// Roda: node testes/treinador.test.js
// 2.67.0 — treinador (aba Progresso): especialistas puros e o chefe.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const i = src.indexOf('/* @@TREINADOR-PURO-INICIO'), f = src.indexOf('/* @@TREINADOR-PURO-FIM');
assert(i > 0 && f > i, 'trecho @@TREINADOR-PURO não encontrado');
const T = new Function(src.slice(i, f) + '\nreturn { TR_BASE, TR_AGENTES, trConselho, trOrdenar, trRodar, trFotoVazia, trCacada, trAgenteUpar, trAgenteMult, trAgenteLegado, '
    + 'trMesmoId, trQtd, trLimitadoPorDano, trDanoParaXp, trTipoPrey, trXpAtual, trRecDe, trMortesRecentes, trAgenteTopo };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
// agentes falsos: troca os de verdade pelos falsos, roda e devolve os de verdade sempre
const comAgentes = (agentes, fn) => {
    const reais = T.TR_AGENTES.splice(0); T.TR_AGENTES.push(...agentes);
    try { return fn(); } finally { T.TR_AGENTES.length = 0; T.TR_AGENTES.push(...reais); }
};
const ag = (id, rodar, extra) => Object.assign({ id, nome: id, icone: '·', rodar }, extra || {});
// fotos sintéticas para os especialistas
const foto = (o) => Object.assign(T.trFotoVazia(), { t: 1.8e12 }, o || {});
const mapa = (id, title, xpH, extra) => Object.assign({ id, title, rec: 250, levelMin: 200, ilha: null, aberta: true, xpH, ouroH: 0, fonte: 'medido', mortes: 0, idadeH: 1 }, extra || {});
const huntSN = (extra) => Object.assign({ id: 1, title: 'Shadow Nexus', lure: 4, maxLure: 4, rec: 250, levelMin: 200, ilha: 'the_inquisition' }, extra || {});
const acoes = (cs, tipo) => cs.filter(c => c.acao && c.acao.tipo === tipo);

t('foto vazia não quebra nenhum especialista e não gera passo', () => {
    const r = T.trRodar(T.trFotoVazia(), T.TR_BASE);
    assert.deepStrictEqual(r.passos, []);
    assert.strictEqual(r.cartoes.length, T.TR_AGENTES.length);
});
t('foto vazia tem o formato canônico', () => {
    const fv = T.trFotoVazia();
    for (const k of ['ouroLivre', 'bencaos', 'ampulhetas', 'selo']) assert(k in fv, k);
    assert(!('skillsTreino' in fv));
});
t('trConselho preenche os padrões', () => {
    const c = T.trConselho('upar', 'x', { titulo: 'a', impacto: 5 });
    assert.strictEqual(c.confianca, 'estimado'); assert.strictEqual(c.custo, 0); assert.strictEqual(c.acao, null);
});
t('trConselho não deixa o objeto trocar id nem agente', () => {
    const c = T.trConselho('upar', 'x', { id: 'outro', agente: 'falso', impacto: 1 });
    assert.strictEqual(c.id, 'upar:x'); assert.strictEqual(c.agente, 'upar');
});
t('trOrdenar descarta impacto ≤ 0, NaN, texto e estado ok', () => {
    const r = T.trOrdenar([
        { id: 'a', impacto: 0 }, { id: 'b', impacto: -3 }, { id: 'c', impacto: NaN }, { id: 'd', impacto: 'xyz' },
        { id: 'e', impacto: 5, estado: 'ok' }, null, { id: 'f', impacto: '4' }], {});
    assert.deepStrictEqual(r.map(c => c.id), ['f']);
});
t('trOrdenar pesa pela confiança (maiúsculas também; desconhecida = 0,4)', () => {
    const r = T.trOrdenar([
        { id: 'est', impacto: 10, confianca: 'estimado' }, { id: 'med', impacto: 5, confianca: 'MEDIDO' },
        { id: 'wik', impacto: 8, confianca: 'wiki' }, { id: 'xx', impacto: 9, confianca: 'chute' }], {});
    assert.deepStrictEqual(r.map(c => c.id), ['med', 'wik', 'est', 'xx']); // 5 · 4,8 · 4 · 3,6
    assert.strictEqual(r[0].nota, 5);
});
t('trOrdenar: sem ouro → semOuro e nota × 0,3; ouroLivre não numérico = sem limite', () => {
    const cs = [{ id: 'caro', impacto: 10, confianca: 'medido', custo: 2e6 }, { id: 'barato', impacto: 5, confianca: 'medido', custo: '1000' }];
    const r = T.trOrdenar(cs, { ouroLivre: 1e6 });
    assert.deepStrictEqual(r.map(c => c.id), ['barato', 'caro']);
    assert.strictEqual(r[1].semOuro, true); assert.strictEqual(r[1].nota, 3); assert.strictEqual(r[0].semOuro, false);
    for (const livre of [null, undefined, NaN, '5']) {
        const s = T.trOrdenar(cs, { ouroLivre: livre });
        assert(s.every(c => !c.semOuro), String(livre));
    }
});
t('agente que lança erro → cartão "erro" e fora dos passos', () => comAgentes([
    ag('quebra', () => { throw new Error('bum'); }),
    ag('bom', () => [T.trConselho('bom', 'x', { impacto: 3, confianca: 'wiki' })])], () => {
    const r = T.trRodar(T.trFotoVazia(), T.TR_BASE);
    assert.strictEqual(r.cartoes[0].estado, 'erro'); assert(/bum/.test(r.cartoes[0].conselhos[0].porque));
    assert.deepStrictEqual(r.passos.map(c => c.id), ['bom:x']);
}));
t('retorno não-array e itens null são normalizados', () => comAgentes([
    ag('um', () => T.trConselho('um', 'x', { impacto: 2 })),
    ag('nada', () => null),
    ag('sujo', () => [null, undefined, 7, 'texto', T.trConselho('sujo', 'y', { impacto: 1 })])], () => {
    const r = T.trRodar(T.trFotoVazia(), T.TR_BASE);
    assert.strictEqual(r.cartoes.length, 3);
    assert.strictEqual(r.cartoes[0].conselhos.length, 1); assert.strictEqual(r.cartoes[1].conselhos.length, 0);
    assert.strictEqual(r.cartoes[1].estado, 'ok');
    assert.deepStrictEqual(r.todos.map(c => c.id), ['um:x', 'sujo:y']);
}));
t('passos: só os 3 melhores; cartão mostra o erro primeiro', () => comAgentes([
    ag('muitos', () => [1, 2, 3, 4, 5].map(k => T.trConselho('muitos', 'k' + k, { impacto: k, confianca: 'medido' }))
        .concat([T.trConselho('muitos', 'grave', { impacto: 0.1, estado: 'erro' })]))], () => {
    const r = T.trRodar(T.trFotoVazia(), T.TR_BASE);
    assert.deepStrictEqual(r.passos.map(c => c.id), ['muitos:k5', 'muitos:k4', 'muitos:k3']);
    assert.strictEqual(r.cartoes[0].estado, 'erro');
    assert.deepStrictEqual(r.cartoes[0].conselhos.map(c => c.id), ['muitos:grave', 'muitos:k5', 'muitos:k4']);
}));
t('fase 2 roda por último e recebe os conselhos da fase 1; fase 1 recebe []', () => {
    const vistos = {};
    comAgentes([
        ag('chefe', (fo, b, todos) => { vistos.chefe = todos.map(c => c.id); return []; }, { fase: 2 }),
        ag('a', (fo, b, todos) => { vistos.a = todos; return [T.trConselho('a', 'x', { impacto: 1 })]; }),
        ag('b', () => [T.trConselho('b', 'y', { impacto: 2 })])], () => {
        const r = T.trRodar(T.trFotoVazia(), T.TR_BASE);
        assert.deepStrictEqual(vistos.a, []);
        assert.deepStrictEqual(vistos.chefe, ['a:x', 'b:y']);
        assert.deepStrictEqual(r.cartoes.map(c => c.id), ['chefe', 'a', 'b']); // ordem de TR_AGENTES
    });
});
t('TR_BASE: faixas cobrem 1..999 sem buraco e citam caçadas da wiki', () => {
    const fx = T.TR_BASE.faixas; assert(fx.length >= 4);
    assert.strictEqual(fx[0].de, 1); assert.strictEqual(fx[fx.length - 1].ate, 999);
    for (let k = 1; k < fx.length; k++) assert.strictEqual(fx[k].de, fx[k - 1].ate, 'faixa contínua');
    assert(fx.some(x => x.hunts.includes('Shadow Nexus')));
});
t('TR_BASE: bênção no 250 = 29.750 cada; as 7 no 200 = 198.000; Legado tem marcos crescentes', () => {
    assert.strictEqual(T.TR_BASE.bencaos.preco(250), 29750);
    assert.strictEqual(T.TR_BASE.bencaos.total(200), 198000);
    const b = T.TR_BASE.legado.bonus; for (let k = 1; k < b.length; k++) assert(b[k] > b[k - 1]);
});
t('TR_BASE: skills do Legado no vocabulário do helper (melee/dist/ml)', () => {
    assert.deepStrictEqual(T.TR_BASE.legado.skill, { KNIGHT: 'melee', PALADIN: 'dist', SORCERER: 'ml', DRUID: 'ml' });
    assert.strictEqual(T.TR_BASE.legado.skillInicio, 60); assert.strictEqual(T.TR_BASE.legado.mlInicio, 40);
});
t('TR_BASE: frações com sufixo Frac', () => {
    assert.strictEqual(T.TR_BASE.bencaos.corteFrac, 0.56); assert.strictEqual(T.TR_BASE.morte.perdaFracSemBencao, 0.0227);
    assert.strictEqual(T.TR_BASE.premium.autoSellFrac, 0.9); assert.strictEqual(T.TR_BASE.mercado.taxaCriacaoFrac, 0.05);
    assert.strictEqual(T.TR_BASE.spawn.fatorDanoFrac, 0.707);
});
t('TR_BASE: Selo — Rolar da faixa 70 = 4.300', () => {
    assert.strictEqual(T.TR_BASE.selo.rolar(70), 4300); assert.strictEqual(T.TR_BASE.selo.rolar(79), 4300);
});
t('TR_BASE: ilhas com custo e material', () => {
    const m = T.TR_BASE.ilhas.find(x => x.nome === 'Marapur');
    assert.strictEqual(m.ouro, 10e6); assert.strictEqual(m.materiais[0].nome, 'Spectral Conch'); assert.strictEqual(m.materiais[0].qtd, 10);
});
t('TR_BASE: bosses com tentativa (sempre lista) e drops; ampulheta com preços', () => {
    const tim = T.TR_BASE.bosses.find(b => b.nome === 'Timira');
    assert.strictEqual(tim.rec, 340); assert.strictEqual(tim.tentativa[0].qtd, 5); assert(/naga/i.test(tim.drops));
    for (const b of T.TR_BASE.bosses) assert(Array.isArray(b.tentativa) && b.tentativa.every(x => x.item && x.qtd > 0), b.nome);
    assert.strictEqual(T.TR_BASE.bosses.find(b => b.nome === 'Jaul').tentativa.length, 2);
    assert.strictEqual(T.TR_BASE.ampulheta.horasDia, 8); assert(T.TR_BASE.ampulheta.preco8h > 0);
});
t('TR_BASE: tokens da Invasão sem Infinity; melee do topo fora do objeto por vocação', () => {
    assert(T.TR_BASE.invasao.tokens.every(([pos]) => Number.isFinite(pos)));
    assert(!('meleeTopo' in T.TR_BASE.topoVisto)); assert.deepStrictEqual(T.TR_BASE.topoMelee, [66, 79]);
});
t('trCacada: Shadow Nexus → Rec 250 na Inquisition; caçada de Rec < 200 só traz a faixa; desconhecida → null', () => {
    const sn = T.trCacada('Shadow Nexus');
    assert.strictEqual(sn.rec, 250); assert.strictEqual(sn.ilha, 'the_inquisition'); assert.strictEqual(sn.faixa.de, 250);
    assert.strictEqual(T.trCacada('shadow nexus', T.TR_BASE).rec, 250);
    const dw = T.trCacada('Draken Walls');
    assert.strictEqual(dw.rec, null); assert.strictEqual(dw.faixa.de, 130);
    assert.strictEqual(T.trCacada('Não Existe'), null); assert.strictEqual(T.trCacada(''), null);
});
t('trRodar: conselho sem estado conta como aviso no cartão', () => comAgentes([
    ag('cru', () => [{ id: 'cru:x', impacto: 1 }]), ag('estranho', () => [{ id: 'estranho:x', impacto: 1, estado: 'xyz' }])], () => {
    const r = T.trRodar(T.trFotoVazia(), T.TR_BASE);
    assert.deepStrictEqual(r.cartoes.map(c => c.estado), ['aviso', 'aviso']);
}));
t('TR_BASE: boost sem o pct duplicado (o +50 fica só em xp.boost)', () => {
    assert(!('pct' in T.TR_BASE.boost)); assert.strictEqual(T.TR_BASE.xp.boost, 50);
});

// ── Ajudantes dos especialistas
const DIA = 864e5;
t('trMesmoId: compara como texto e nunca casa null/undefined', () => {
    assert.strictEqual(T.trMesmoId('1', 1), true); assert.strictEqual(T.trMesmoId(2, 1), false);
    assert.strictEqual(T.trMesmoId(null, null), false); assert.strictEqual(T.trMesmoId(undefined, 'undefined'), false);
});
t('trQtd: formatador neutro (540 mil, 1,2 M)', () => {
    assert.strictEqual(T.trQtd(540000), '540 mil'); assert.strictEqual(T.trQtd(1.2e6), '1,2 M'); assert.strictEqual(T.trQtd(950), '950');
    assert.strictEqual(T.trQtd(999700), '1 M'); assert.strictEqual(T.trQtd('abc'), '?');
});
t('trLimitadoPorDano: exige min ≥ 5 e abates > 0; senão null', () => {
    const h = huntSN();
    assert.strictEqual(T.trLimitadoPorDano(foto({ hunt: h, medidoAtual: { min: 10, abatesH: 500 } }), T.TR_BASE), true);
    assert.strictEqual(T.trLimitadoPorDano(foto({ hunt: h, medidoAtual: { min: 10, abatesH: 1300 } }), T.TR_BASE), false);
    assert.strictEqual(T.trLimitadoPorDano(foto({ hunt: h, medidoAtual: { min: 4, abatesH: 500 } }), T.TR_BASE), null);
    assert.strictEqual(T.trLimitadoPorDano(foto({ hunt: h, medidoAtual: { min: 10, abatesH: 0 } }), T.TR_BASE), null);
    assert.strictEqual(T.trLimitadoPorDano(foto({ hunt: h, medidoAtual: { abatesH: 500 } }), T.TR_BASE), null);
});
t('trDanoParaXp: spawn → 0; desconhecido → × xpPorDanoFrac; dano → até a folga do teto', () => {
    assert.strictEqual(T.TR_BASE.xp.xpPorDanoFrac, 0.7); assert(!('xpPorDanoFrac' in T.TR_BASE.legado));
    const h = huntSN(); // lure 4 → teto 1360 abates/h
    assert.strictEqual(T.trDanoParaXp(10, foto({ hunt: h, medidoAtual: { min: 10, abatesH: 1300 } }), T.TR_BASE), 0);
    assert(Math.abs(T.trDanoParaXp(10, foto({ hunt: h }), T.TR_BASE) - 7) < 1e-9);
    assert.strictEqual(T.trDanoParaXp(10, foto({ hunt: h, medidoAtual: { min: 10, abatesH: 500 } }), T.TR_BASE), 10);
    const folga = (1360 / 1150 - 1) * 100; // a folga limita: 30 pontos de dano, só ≈ 18 até o teto
    assert(Math.abs(T.trDanoParaXp(30, foto({ hunt: h, medidoAtual: { min: 10, abatesH: 1150 } }), T.TR_BASE) - folga) < 1e-9);
});
t('trXpAtual / trRecDe / trMortesRecentes', () => {
    assert.strictEqual(T.trXpAtual(foto({ hunt: huntSN(), medidoAtual: { xpH: '540000' } })), 540000);
    assert.strictEqual(T.trXpAtual(foto({ hunt: huntSN({ id: '1' }), mapas: [mapa(1, 'Shadow Nexus', 500000)] })), 500000);
    assert.strictEqual(T.trXpAtual(foto({ hunt: huntSN() })), null);
    assert.strictEqual(T.trRecDe(huntSN(), T.TR_BASE), 250);
    assert.strictEqual(T.trRecDe({ title: 'Shadow Nexus' }, T.TR_BASE), 250);
    assert.strictEqual(T.trRecDe({ title: 'Lugar Novo', levelMin: 120 }, T.TR_BASE), 120);
    assert.strictEqual(T.trRecDe({ title: 'Lugar Novo' }, T.TR_BASE), null); assert.strictEqual(T.trRecDe(null, T.TR_BASE), null);
    const f = foto({ mortes: [{ t: 1.8e12 - DIA, hunt: 'Shadow Nexus' }, { t: 1.8e12 - DIA, huntId: 5 }, { t: 1.8e12 - 9 * DIA, hunt: 'Shadow Nexus' }, null] });
    assert.strictEqual(T.trMortesRecentes(f, T.TR_BASE, 7).length, 2);
    assert.strictEqual(T.trMortesRecentes(f, T.TR_BASE, 7, huntSN()).length, 1);
    assert.strictEqual(T.trMortesRecentes(f, T.TR_BASE, 7, '5').length, 1);
    assert.strictEqual(T.trMortesRecentes(f, T.TR_BASE, 10, 'shadow nexus').length, 2);
    assert.strictEqual(T.trMortesRecentes(foto({ t: 0, mortes: f.mortes }), T.TR_BASE, 7).length, 0, 'sem foto.t não há "recente"');
});

// ── Task 4: Onde upar
t('upar: atual 540k × Summer Court medido 650k → ir-mapa com +20,4 %', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { xpH: 540000 },
        mapas: [mapa(1, 'Shadow Nexus', 540000), mapa(2, 'Summer Court', 650000), mapa(3, 'Ice Portal', 300000)] });
    const ir = acoes(T.trAgenteUpar(f, T.TR_BASE), 'ir-mapa');
    assert.strictEqual(ir.length, 1); const c = ir[0];
    assert(Math.abs(c.impacto - 20.37) < 0.1, String(c.impacto));
    assert.strictEqual(c.acao.huntId, 2); assert(c.acao.rotulo); assert.strictEqual(c.confianca, 'medido'); assert.strictEqual(c.estado, 'aviso');
    assert.strictEqual(c.numeros.xpH, 650000); assert.strictEqual(c.numeros.xpAtual, 540000);
    assert(/Summer Court/.test(c.titulo) && c.titulo.length <= 70, c.titulo);
});
t('upar: números em texto na foto e xpH NaN não quebram', () => {
    const f = foto({ nivel: '238', hunt: huntSN(), medidoAtual: { xpH: '540000' },
        mapas: [mapa(1, 'Shadow Nexus', '540000'), mapa(2, 'Summer Court', '650000'), mapa(3, 'Ice Portal', 'abc'), mapa(4, 'Otherworld Zao', NaN)] });
    const ir = acoes(T.trAgenteUpar(f, T.TR_BASE), 'ir-mapa');
    assert.deepStrictEqual(ir.map(c => c.acao.huntId), [2]); assert(Math.abs(ir[0].impacto - 20.37) < 0.1);
});
t("upar: ids '1' × 1 — a caçada atual é reconhecida no meio dos mapas", () => {
    const f = foto({ nivel: 238, hunt: huntSN({ id: 1 }), mapas: [mapa('1', 'Shadow Nexus', 650000), mapa(2, 'Summer Court', 600000)] });
    const cs = T.trAgenteUpar(f, T.TR_BASE);
    assert.strictEqual(acoes(cs, 'ir-mapa').length, 0); assert(cs.some(c => c.estado === 'ok'));
});
t('upar: sem medidoAtual, o atual é o xpH do mapa da caçada; confiança segue a fonte', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), mapas: [mapa(1, 'Shadow Nexus', 500000), mapa(2, 'Summer Court', 700000, { fonte: 'comunidade' })] });
    const c = acoes(T.trAgenteUpar(f, T.TR_BASE), 'ir-mapa')[0];
    assert(Math.abs(c.impacto - 40) < 1e-9); assert.strictEqual(c.confianca, 'comunidade');
});
t('upar: comunidade 600k × medido 500k: o peso da confiança decide (fica no medido)', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), mapas: [mapa(1, 'Shadow Nexus', 500000), mapa(2, 'Summer Court', 600000, { fonte: 'comunidade' })] });
    const cs = T.trAgenteUpar(f, T.TR_BASE);
    assert.strictEqual(acoes(cs, 'ir-mapa').length, 0); assert(cs.some(c => c.estado === 'ok'));
});
t('upar: o melhor com morte é ignorado (vai no 2º sem morte)', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { xpH: 540000 },
        mapas: [mapa(1, 'Shadow Nexus', 540000), mapa(2, 'Summer Court', 650000, { mortes: 2 }), mapa(4, 'Otherworld Zao', 600000)] });
    assert.deepStrictEqual(acoes(T.trAgenteUpar(f, T.TR_BASE), 'ir-mapa').map(c => c.acao.huntId), [4]);
});
t('upar: mapa acima do nível não entra', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { xpH: 540000 },
        mapas: [mapa(1, 'Shadow Nexus', 540000), mapa(5, 'Ruins of Nuur', 900000, { levelMin: 300 })] });
    assert.strictEqual(acoes(T.trAgenteUpar(f, T.TR_BASE), 'ir-mapa').length, 0);
});
t('upar: mapa melhor mas < 10 % (560k × 540k) → ok, sem ir-mapa', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { xpH: 540000 }, mapas: [mapa(1, 'Shadow Nexus', 540000), mapa(2, 'Summer Court', 560000)] });
    const cs = T.trAgenteUpar(f, T.TR_BASE);
    assert.strictEqual(acoes(cs, 'ir-mapa').length, 0);
    const ok = cs.find(c => c.estado === 'ok'); assert(ok); assert.strictEqual(ok.numeros.melhorOutro, 'Summer Court');
});
t('upar: sem XP/h atual (fora de caçada) → ir-mapa no melhor medido com impacto 5', () => {
    const f = foto({ nivel: 238, mapas: [mapa(2, 'Summer Court', 650000), mapa(3, 'Ice Portal', 300000)] });
    const ir = acoes(T.trAgenteUpar(f, T.TR_BASE), 'ir-mapa');
    assert.strictEqual(ir.length, 1); assert.strictEqual(ir[0].acao.huntId, 2); assert.strictEqual(ir[0].impacto, 5);
    assert.strictEqual(ir[0].numeros.xpAtual, null); assert(/650 mil XP\/h/.test(ir[0].titulo), ir[0].titulo);
});
t('upar: caçada atual fora de mapas e sem medidoAtual → ir-mapa de impacto 5 e nada de lure', () => {
    const f = foto({ nivel: 238, hunt: huntSN({ lure: 2 }), mapas: [mapa(2, 'Summer Court', 650000)] });
    const cs = T.trAgenteUpar(f, T.TR_BASE);
    assert.deepStrictEqual(acoes(cs, 'ir-mapa').map(c => [c.acao.huntId, c.impacto]), [[2, 5]]);
    assert.strictEqual(acoes(cs, 'lure').length, 0);
});
t('upar: já no melhor mapa medido → estado ok e sem ir-mapa', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { xpH: 650000 },
        mapas: [mapa(1, 'Shadow Nexus', 650000), mapa(2, 'Summer Court', 600000)] });
    const cs = T.trAgenteUpar(f, T.TR_BASE);
    assert.strictEqual(acoes(cs, 'ir-mapa').length, 0);
    assert(cs.some(c => c.estado === 'ok' && /melhor mapa/.test(c.titulo)));
});
// lure: evidência + modelo do teto de spawn
const ses = (morte, extra) => Object.assign({ hunt: 'Shadow Nexus', huntId: 1, dur: 60, xpH: 500000, ouroH: 0, morte }, extra || {});
t('upar: lure com sessões sem morte e limitação desconhecida → subir 1 degrau, impacto 8', () => {
    const base = { nivel: 238, hunt: huntSN({ lure: 2 }), mapas: [mapa(1, 'Shadow Nexus', 540000)] };
    let l = acoes(T.trAgenteUpar(foto(Object.assign({ sessoes: [ses(true), ses(false), ses(false)] }, base)), T.TR_BASE), 'lure');
    assert.strictEqual(l.length, 1); assert.strictEqual(l[0].acao.lure, 3); assert.strictEqual(l[0].acao.huntId, 1);
    assert.strictEqual(l[0].impacto, 8); assert.strictEqual(l[0].confianca, 'estimado'); assert.strictEqual(l[0].numeros.limite, null);
    l = acoes(T.trAgenteUpar(foto(Object.assign({ sessoes: [ses(false), ses(true), ses(false)] }, base)), T.TR_BASE), 'lure');
    assert.strictEqual(l.length, 0, 'morte numa das 2 últimas');
    l = acoes(T.trAgenteUpar(foto(Object.assign({ sessoes: [ses(false)] }, base, { hunt: huntSN({ lure: 4 }) })), T.TR_BASE), 'lure');
    assert.strictEqual(l.length, 0, 'já no máximo: nunca baixar');
});
t('upar: lure sem evidência (sem sessão e sem 5 min medidos) → nada', () => {
    const base = { nivel: 238, hunt: huntSN({ lure: 2 }), mapas: [mapa(1, 'Shadow Nexus', 540000)] };
    assert.strictEqual(acoes(T.trAgenteUpar(foto(base), T.TR_BASE), 'lure').length, 0);
    assert.strictEqual(acoes(T.trAgenteUpar(foto(Object.assign({ medidoAtual: { xpH: 540000, min: 3 } }, base)), T.TR_BASE), 'lure').length, 0);
    assert.strictEqual(acoes(T.trAgenteUpar(foto(Object.assign({ sessoes: [ses(false, { huntId: '1' })] }, base)), T.TR_BASE), 'lure').length, 1, "id '1' conta");
});
t('upar: lure — morte nesta caçada em 7 dias bloqueia; morte em outra caçada não', () => {
    const base = { nivel: 238, hunt: huntSN({ lure: 2 }), sessoes: [ses(false)], mapas: [mapa(1, 'Shadow Nexus', 540000)] };
    assert.strictEqual(acoes(T.trAgenteUpar(foto(Object.assign({ mortes: [{ t: 1.8e12 - 2 * DIA, hunt: 'Shadow Nexus', voc: 'DRUID' }] }, base)), T.TR_BASE), 'lure').length, 0);
    assert.strictEqual(acoes(T.trAgenteUpar(foto(Object.assign({ mortes: [{ t: 1.8e12 - 2 * DIA, hunt: 'Ice Portal', voc: 'DRUID' }] }, base)), T.TR_BASE), 'lure').length, 1);
});
t('upar: lure limitada por SPAWN → impacto min(100/lure, 25); por DANO → nada', () => {
    const base = { nivel: 238, mapas: [mapa(1, 'Shadow Nexus', 540000)] };
    let l = acoes(T.trAgenteUpar(foto(Object.assign({ hunt: huntSN({ lure: 2 }), medidoAtual: { xpH: 540000, min: 10, abatesH: 650 } }, base)), T.TR_BASE), 'lure');
    assert.strictEqual(l.length, 1); assert.strictEqual(l[0].impacto, 25); assert.strictEqual(l[0].numeros.limite, 'spawn');
    l = acoes(T.trAgenteUpar(foto(Object.assign({ hunt: huntSN({ lure: 5, maxLure: 6 }), medidoAtual: { xpH: 540000, min: 10, abatesH: 1700 } }, base)), T.TR_BASE), 'lure');
    assert.strictEqual(l[0].impacto, 20); // teto sobe 1/5
    l = acoes(T.trAgenteUpar(foto(Object.assign({ hunt: huntSN({ lure: 2 }), medidoAtual: { xpH: 540000, min: 10, abatesH: 300 } }, base)), T.TR_BASE), 'lure');
    assert.strictEqual(l.length, 0);
});
t('upar: mapa de ilha fechada não vira ir-mapa; vira "Abrir <ilha>" sem ação', () => {
    for (const extra of [{ ilhas: [], fechado: { aberta: false } }, { ilhas: [{ nome: 'Dream Courts', aberta: false }], fechado: { aberta: undefined } }]) {
        const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { xpH: 540000 }, ilhas: extra.ilhas,
            mapas: [mapa(1, 'Shadow Nexus', 540000), mapa(2, 'Summer Court', 650000, extra.fechado)] });
        const cs = T.trAgenteUpar(f, T.TR_BASE);
        assert.strictEqual(acoes(cs, 'ir-mapa').length, 0);
        const ab = cs.find(c => c.id === 'upar:abrir-ilha');
        assert(ab, cs.map(c => c.titulo).join(' | ')); assert.strictEqual(ab.numeros.ilha, 'dream_courts'); assert.strictEqual(ab.acao, null);
        assert(ab.impacto > 0 && ab.impacto <= 5);
    }
});
t('upar: foto.ilhas que não é lista não quebra', () => {
    const f = foto({ nivel: 238, ilhas: { issavi: false } });
    assert(Array.isArray(T.trAgenteUpar(f, T.TR_BASE)));
});
t('upar: sem medida, o melhor da faixa (maior Rec ≤ nível) em ilha fechada → "Abrir Issavi"', () => {
    const f = foto({ nivel: 238, ilhas: [{ id: 'issavi', aberta: false }] });
    const ab = T.trAgenteUpar(f, T.TR_BASE).find(c => c.id === 'upar:abrir-ilha');
    assert(ab); assert.strictEqual(ab.numeros.ilha, 'issavi'); assert.strictEqual(ab.numeros.mapa, 'Kilmaresh Catacombs');
});
t('upar: Shadow Nexus (Rec 250) no 238 com Issavi fechada → nenhum "Abrir Issavi"', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { xpH: 540000 }, ilhas: [{ id: 'issavi', aberta: false }], mapas: [mapa(1, 'Shadow Nexus', 540000)] });
    assert(!T.trAgenteUpar(f, T.TR_BASE).some(c => c.id === 'upar:abrir-ilha'));
    // e com um mapa aberto medido melhor que o de agora, também não
    const g = foto({ nivel: 238, hunt: huntSN({ id: 3, title: 'Ice Portal', rec: 200 }), medidoAtual: { xpH: 300000 }, ilhas: [{ id: 'issavi', aberta: false }],
        mapas: [mapa(3, 'Ice Portal', 300000), mapa(1, 'Shadow Nexus', 540000)] });
    assert(!T.trAgenteUpar(g, T.TR_BASE).some(c => c.id === 'upar:abrir-ilha'));
});
t('upar: sem nenhum mapa medido → "Medir" com alvos [{ title, huntId }] alinhados e ordenados por Rec', () => {
    const cs = T.trAgenteUpar(foto({ nivel: 238, mapas: [{ id: 77, title: 'Kilmaresh Catacombs', levelMin: 200, aberta: true }] }), T.TR_BASE);
    const m = acoes(cs, 'medir')[0];
    assert(m, cs.map(c => c.titulo).join(' | ')); assert(!('huntIds' in m.acao) && !('titulos' in m.acao));
    assert.deepStrictEqual(m.acao.alvos, [{ title: 'Warzone II - Magma Dungeon', huntId: null }, { title: 'Warzone II - Parasite Nest', huntId: null },
        { title: 'Kilmaresh Catacombs', huntId: 77 }]);
    assert(m.impacto > 0);
});
t('upar: foto vazia → só o "Medir" sem impacto (nada de passo)', () => {
    const cs = T.trAgenteUpar(T.trFotoVazia(), T.TR_BASE);
    assert(cs.every(c => !(c.impacto > 0)));
});
t('upar: registrado em TR_AGENTES', () => {
    assert(T.TR_AGENTES.some(a => a.id === 'upar' && a.rodar === T.trAgenteUpar && a.icone === '⤴'));
});

// ── Task 5: Multiplicadores
const preyDe = (buffs, extra) => Object.assign({ huntId: 1, huntLocked: true, huntMsLeft: 3600e3, wildcards: 10, buffs }, extra || {});
const buff = (tipo, tier, extra) => Object.assign({ tipo, tier, locked: true, msLeft: 3600e3 }, extra || {});
const SPAWN = { xpH: 540000, min: 10, abatesH: 1300 }, DANO = { xpH: 540000, min: 10, abatesH: 500 }; // teto 340 × 4 = 1360; corte 85 % = 1156
const CHANCE = 1 / (T.TR_BASE.prey.tiposBuff.length - 1); // o sorteio sai num tipo diferente do atual
t('trTipoPrey: aceita o vocabulário do jogo e o do helper', () => {
    assert.deepStrictEqual(['exp', 'XP', 'dano', 'damage', 'defesa', 'defense', 'loot', 'x', null].map(T.trTipoPrey),
        ['xp', 'xp', 'damage', 'damage', 'defense', 'defense', 'loot', null, null]);
});
t('mult: Premium desligado → abrir-loja, impacto = premium ÷ (100 + party), wiki, custo 0', () => {
    const c = acoes(T.trAgenteMult(foto({ nivel: 238, premium: { ativo: false } }), T.TR_BASE), 'abrir-loja')[0];
    assert(c); assert.strictEqual(c.confianca, 'wiki'); assert.strictEqual(c.custo, 0);
    assert(Math.abs(c.impacto - T.TR_BASE.xp.premium / (100 + T.TR_BASE.xp.party) * 100) < 1e-9);
    assert.strictEqual(acoes(T.trAgenteMult(foto({ nivel: 238, premium: { ativo: true } }), T.TR_BASE), 'abrir-loja').length, 0);
});
t('mult: prey em outro mapa → prey-escolher com a caçada atual; soma o que se perde', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), prey: preyDe({ KNIGHT: buff('xp', 5), DRUID: buff('exp', 3) }, { huntId: 9 }) });
    const c = acoes(T.trAgenteMult(f, T.TR_BASE), 'prey-escolher')[0];
    assert(c); assert.strictEqual(c.acao.huntId, 1); assert.strictEqual(c.numeros.wildcards, T.TR_BASE.prey.escolherWildcards);
    assert(Math.abs(c.impacto - 4) < 1e-9, String(c.impacto)); // (5 + 3) ÷ 200 × 100
});
t("mult: prey — huntId '1' × 1 é o mesmo mapa; huntId desconhecido não opina", () => {
    const um = (p) => acoes(T.trAgenteMult(foto({ nivel: 238, hunt: huntSN(), prey: p }), T.TR_BASE), 'prey-escolher');
    assert.strictEqual(um(preyDe({ KNIGHT: buff('xp', 5) }, { huntId: '1' })).length, 0);
    assert.strictEqual(um(preyDe({ KNIGHT: buff('xp', 5) }, { huntId: undefined })).length, 0);
    assert.strictEqual(um(preyDe({ KNIGHT: buff('xp', 5) }, { huntId: null })).length, 0, 'null sem a fonte dizer: na dúvida, não opina');
    const sem = um(preyDe({ KNIGHT: buff('xp', 5) }, { huntId: null, semCacada: true }));
    assert.strictEqual(sem.length, 1); assert(/não tem caçada/.test(sem[0].titulo));
});
t('mult: limitada por spawn → DANO vira EXP (× chance do sorteio, estimado); EXP fica', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: SPAWN, prey: preyDe({ KNIGHT: buff('dano', 5), DRUID: buff('exp', 5), PALADIN: buff('XP', 5) }) });
    const tr = acoes(T.trAgenteMult(f, T.TR_BASE), 'prey-trocar');
    assert.deepStrictEqual(tr.map(c => c.acao.voc), ['KNIGHT']); assert.strictEqual(tr[0].numeros.ideal, 'xp');
    assert(Math.abs(tr[0].impacto - 2.5 * CHANCE) < 1e-9, String(tr[0].impacto)); assert.strictEqual(tr[0].confianca, 'estimado');
});
t('mult: limitada por dano → EXP vira DANO; defense de quem morreu fica', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: DANO, mortes: [{ t: 1.8e12 - DIA, voc: 'DRUID' }],
        prey: preyDe({ KNIGHT: buff('xp', 5), PALADIN: buff('damage', 5), DRUID: buff('defense', 5) }) });
    const tr = acoes(T.trAgenteMult(f, T.TR_BASE), 'prey-trocar');
    assert.deepStrictEqual(tr.map(c => c.acao.voc), ['KNIGHT']); assert.strictEqual(tr[0].numeros.ideal, 'damage');
    assert(Math.abs(tr[0].impacto - (5 - 2.5) * CHANCE) < 1e-9); // DANO ★5 = 20 % de 1 dos 4 = 5 pontos; menos EXP ★5 (2,5)
});
t('mult: sem 5 min medidos não opina no tipo', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { abatesH: 1300, min: 2 }, prey: preyDe({ KNIGHT: buff('loot', 5) }) });
    assert.strictEqual(acoes(T.trAgenteMult(f, T.TR_BASE), 'prey-trocar').length, 0);
});
t('mult: trava da vocação — tier 6 e 10 (2 + 0,2 × tier); nada se travada, sem tempo, tipo errado, sem abates ou prey em outro mapa', () => {
    const base = { nivel: 238, hunt: huntSN(), medidoAtual: SPAWN };
    const trava = (p, b) => acoes(T.trAgenteMult(foto(Object.assign({ prey: p }, b || base)), T.TR_BASE), 'prey-trancar').filter(c => c.acao.alvo !== 'hunt');
    let tc = trava(preyDe({ SORCERER: buff('exp', 6, { locked: false }) }));
    assert.strictEqual(tc.length, 1); assert.strictEqual(tc[0].acao.voc, 'SORCERER'); assert.strictEqual(tc[0].acao.alvo, 'SORCERER');
    assert.strictEqual(tc[0].numeros.tier, 6); assert(Math.abs(tc[0].impacto - 3.2) < 1e-9); assert.strictEqual(tc[0].confianca, 'estimado');
    tc = trava(preyDe({ DRUID: buff('xp', 10, { locked: false }) }));
    assert.strictEqual(tc.length, 1); assert(Math.abs(tc[0].impacto - 4) < 1e-9);
    assert.strictEqual(trava(preyDe({ DRUID: buff('xp', 6, { locked: false }) }), { nivel: 238, hunt: huntSN() }).length, 0, 'sem abates');
    assert.strictEqual(trava(preyDe({ DRUID: buff('xp', 6, { locked: false }) }, { huntId: 9 })).length, 0, 'prey em outro mapa');
    for (const b of [buff('exp', 6), buff('exp', 6, { locked: false, msLeft: 0 }), buff('loot', 6, { locked: false })]) {
        assert.strictEqual(trava(preyDe({ SORCERER: b })).length, 0, JSON.stringify(b));
    }
});
t('mult: trava da CAÇADA da prey quando ela está aqui e destravada', () => {
    const cacada = (p) => acoes(T.trAgenteMult(foto({ nivel: 238, hunt: huntSN(), prey: p }), T.TR_BASE), 'prey-trancar').filter(c => c.acao.alvo === 'hunt');
    const c = cacada(preyDe({}, { huntLocked: false }));
    assert.strictEqual(c.length, 1); assert.strictEqual(c[0].confianca, 'estimado'); assert(c[0].impacto > 0);
    assert.strictEqual(cacada(preyDe({}, { huntLocked: true })).length, 0);
    assert.strictEqual(cacada(preyDe({}, { huntLocked: false, huntId: 9 })).length, 0);
    assert.strictEqual(cacada(preyDe({}, { huntLocked: false, huntMsLeft: 0 })).length, 0);
});
const fBencao = (o) => foto(Object.assign({ nivel: 250, xpTotal: 254e6, hunt: huntSN(), medidoAtual: { xpH: 540000 }, bencaos: { tem: 0, total: 7 } }, o || {}));
t('mult: bênçãos — impacto = XP salva em UMA morte ÷ XP da semana; custo = uma compra das que faltam', () => {
    const salvo = 0.0227 * 254e6 * 7 * 0.08, esperado = salvo / (540000 * 24 * 7) * 100;
    for (const mortes of [[{ t: 1.8e12 - 2 * DIA, hunt: 'Shadow Nexus', voc: 'DRUID' }], [{ t: 1.8e12 - DIA }, { t: 1.8e12 - 2 * DIA }]]) {
        const c = acoes(T.trAgenteMult(fBencao({ mortes }), T.TR_BASE), 'bencaos')[0];
        assert(c); assert(Math.abs(c.impacto - esperado) < 1e-9, String(c.impacto)); // 2 mortes não dobram
        assert.strictEqual(c.custo, T.TR_BASE.bencaos.total(250)); assert.strictEqual(c.confianca, 'wiki'); assert(c.titulo.length <= 70);
    }
    const c = acoes(T.trAgenteMult(fBencao({ bencaos: { tem: '3', total: 7 }, mortes: [{ t: 1.8e12 - DIA }] }), T.TR_BASE), 'bencaos')[0];
    assert.strictEqual(c.numeros.faltam, 4); assert.strictEqual(c.custo, Math.round(T.TR_BASE.bencaos.total(250) * 4 / 7));
});
t('mult: bênçãos — sem morte em 7 dias, já com as 7, abaixo do 120 ou "tem" desconhecido → nada', () => {
    for (const o of [{}, { mortes: [{ t: 1.8e12 - 10 * DIA }] }, { bencaos: { tem: 7, total: 7 }, mortes: [{ t: 1.8e12 - DIA }] },
        { nivel: 100, mortes: [{ t: 1.8e12 - DIA }] }, { bencaos: { total: 7 }, mortes: [{ t: 1.8e12 - DIA }] }, { bencaos: { tem: 'x' }, mortes: [{ t: 1.8e12 - DIA }] }]) {
        assert.strictEqual(acoes(T.trAgenteMult(fBencao(o), T.TR_BASE), 'bencaos').length, 0, JSON.stringify(o));
    }
    assert.strictEqual(acoes(T.trAgenteMult(fBencao({ mapas: [mapa(1, 'Shadow Nexus', 540000, { mortes: 1 })] }), T.TR_BASE), 'bencaos').length, 1, 'morte na medida do mapa atual');
});
t('mult: Selo T3 conhecido → custo único = 1 Rolar, custoH no numeros, wiki', () => {
    const c = acoes(T.trAgenteMult(foto({ nivel: 238, hunt: huntSN(), selo: { ativo: false, abundante: 3 } }), T.TR_BASE), 'selo')[0];
    assert(c); assert.strictEqual(c.acao.huntId, 1); assert.strictEqual(c.confianca, 'wiki');
    assert.strictEqual(c.custo, T.TR_BASE.selo.rolar(250)); assert.strictEqual(c.numeros.custoH, 100 * Math.round(T.TR_BASE.selo.rolar(250) * 76 / 1000));
    assert(Math.abs(c.impacto - 10 / 200 * 100) < 1e-9); assert(c.titulo.length <= 70, c.titulo);
});
t('mult: Selo de tier desconhecido → Abundante T1 × 0,25, estimado; ligado → nada', () => {
    const c = acoes(T.trAgenteMult(foto({ nivel: 238, hunt: huntSN(), selo: { ativo: false, abundante: null } }), T.TR_BASE), 'selo')[0];
    assert(Math.abs(c.impacto - 4 / 200 * 100 * 0.25) < 1e-9); assert.strictEqual(c.confianca, 'estimado');
    assert.strictEqual(c.numeros.custoH, 100 * Math.round(T.TR_BASE.selo.rolar(250) * 43 / 1000));
    assert.strictEqual(acoes(T.trAgenteMult(foto({ nivel: 238, hunt: huntSN(), selo: { ativo: true } }), T.TR_BASE), 'selo').length, 0);
});
t('mult: foto vazia → nenhum conselho; registrado em TR_AGENTES', () => {
    assert.deepStrictEqual(T.trAgenteMult(T.trFotoVazia(), T.TR_BASE), []);
    assert(T.TR_AGENTES.some(a => a.id === 'mult' && a.rodar === T.trAgenteMult && a.icone === '✕'));
});

// ── Task 6: Treino e Legado
const leg = (o) => Object.assign({ skill: 64, marcoAtual: 1, proxMarco: 65, falta: 1, bonusAtual: 2, bonusProx: 5 }, o || {});
t('legado: Cavaleiro 64 → 65 (+2 → +5): impacto = trDanoParaXp(3 ÷ 4), ação ampulheta, horas livres em numeros', () => {
    const f = foto({ nivel: 238, legado: { KNIGHT: leg() }, ampulhetas: { KNIGHT: { usadasH: 2 } } });
    const cs = T.trAgenteLegado(f, T.TR_BASE); assert.strictEqual(cs.length, 1); const c = cs[0];
    assert(Math.abs(c.impacto - 3 / 4 * T.TR_BASE.xp.xpPorDanoFrac) < 1e-9, String(c.impacto));
    assert.strictEqual(c.estado, 'aviso'); assert.strictEqual(c.confianca, 'wiki');
    assert.deepStrictEqual(c.acao && { tipo: c.acao.tipo, voc: c.acao.voc }, { tipo: 'ampulheta', voc: 'KNIGHT' });
    assert.strictEqual(c.custo, 6 * T.TR_BASE.ampulheta.preco1h); assert.strictEqual(c.numeros.livres, 6); assert.strictEqual(c.numeros.ganho, 3);
    assert(/Cavaleiro/.test(c.titulo) && /de skill/.test(c.titulo) && c.titulo.length <= 70, c.titulo);
    assert(/vários dias/.test(c.porque));
});
t('legado: magos falam "de ML" no título', () => {
    const c = T.trAgenteLegado(foto({ legado: { SORCERER: leg({ skill: 54, proxMarco: 55 }) } }), T.TR_BASE)[0];
    assert(/de ML/.test(c.titulo) && /Feiticeiro/.test(c.titulo), c.titulo);
});
t('legado: caçada limitada por spawn → mais dano não vira XP (impacto 0)', () => {
    const c = T.trAgenteLegado(foto({ hunt: huntSN(), medidoAtual: { xpH: 540000, min: 10, abatesH: 1300 }, legado: { KNIGHT: leg() } }), T.TR_BASE)[0];
    assert.strictEqual(c.impacto, 0);
});
t('legado: ampulheta do dia usada (8 h) → estado ok "treino do dia feito"', () => {
    const c = T.trAgenteLegado(foto({ legado: { KNIGHT: leg() }, ampulhetas: { KNIGHT: { usadasH: 8 } } }), T.TR_BASE)[0];
    assert.strictEqual(c.estado, 'ok'); assert.strictEqual(c.numeros.livres, 0); assert.strictEqual(c.acao, null);
});
t('legado: custo = horas livres (para cima) × preço da hora; sem dado de horas = a de 8 h', () => {
    let c = T.trAgenteLegado(foto({ legado: { KNIGHT: leg() }, ampulhetas: { KNIGHT: { usadasH: 7 } } }), T.TR_BASE)[0];
    assert.strictEqual(c.custo, T.TR_BASE.ampulheta.preco1h); assert.strictEqual(c.numeros.horas, 1);
    c = T.trAgenteLegado(foto({ legado: { KNIGHT: leg() }, ampulhetas: { KNIGHT: { usadasH: 4.5 } } }), T.TR_BASE)[0];
    assert.strictEqual(c.custo, 4 * T.TR_BASE.ampulheta.preco1h);
    c = T.trAgenteLegado(foto({ legado: { KNIGHT: leg() } }), T.TR_BASE)[0];
    assert.strictEqual(c.custo, T.TR_BASE.ampulheta.preco8h); assert.strictEqual(c.numeros.livres, null);
});
t('legado: ordena pelo impacto (empate: menor falta relativa)', () => {
    const f = foto({ legado: { KNIGHT: leg({ skill: 61, falta: 4 }), SORCERER: leg({ skill: 54, proxMarco: 55, falta: 1, bonusAtual: 9, bonusProx: 14 }),
        PALADIN: leg({ skill: 62, falta: 3 }) } });
    assert.deepStrictEqual(T.trAgenteLegado(f, T.TR_BASE).map(c => c.acao.voc), ['SORCERER', 'PALADIN', 'KNIGHT']);
});
t('legado: sem legado → aviso "Legado não lido ainda", sem ação e sem impacto; registrado', () => {
    const cs = T.trAgenteLegado(T.trFotoVazia(), T.TR_BASE);
    assert.strictEqual(cs.length, 1); assert.strictEqual(cs[0].estado, 'aviso'); assert.strictEqual(cs[0].impacto, 0); assert.strictEqual(cs[0].acao, null);
    assert.strictEqual(cs[0].id, 'legado:sem-dado');
    assert(T.TR_AGENTES.some(a => a.id === 'legado' && a.rodar === T.trAgenteLegado && a.icone === '⚔'));
});

// ── Lote B: lure pelo número real de criaturas por degrau (hunt.lureTiers)
t('upar: lure com lureTiers (Shadow Nexus 3/5/7/8) limitada por spawn → 2 → 3 = +40 % (teto 40); 3 → 4 = +14,3 %', () => {
    const tiers = [3, 5, 7, 8].map(m => ({ min: m, max: m }));
    const base = { nivel: 238, mapas: [mapa(1, 'Shadow Nexus', 540000)] };
    let l = acoes(T.trAgenteUpar(foto(Object.assign({ hunt: huntSN({ lure: 2, lureTiers: tiers }), medidoAtual: { xpH: 540000, min: 10, abatesH: 650 } }, base)), T.TR_BASE), 'lure');
    assert.strictEqual(l.length, 1); assert.strictEqual(l[0].impacto, 40); assert(/40 %/.test(l[0].porque) && /5 → 7/.test(l[0].porque), l[0].porque);
    l = acoes(T.trAgenteUpar(foto(Object.assign({ hunt: huntSN({ lure: 3, lureTiers: tiers }), medidoAtual: { xpH: 540000, min: 10, abatesH: 1000 } }, base)), T.TR_BASE), 'lure');
    assert(Math.abs(l[0].impacto - (8 / 7 - 1) * 100) < 1e-9, String(l[0].impacto)); assert(/14 %/.test(l[0].porque), l[0].porque);
    // degrau que mais que dobra as criaturas fica no teto de 40
    l = acoes(T.trAgenteUpar(foto(Object.assign({ hunt: huntSN({ lure: 1, lureTiers: [{ min: 1, max: 2 }, { min: 4, max: 5 }] }), medidoAtual: { xpH: 540000, min: 10, abatesH: 330 } }, base)), T.TR_BASE), 'lure');
    assert.strictEqual(l[0].impacto, 40);
    // lureTiers incompleto → volta ao modelo antigo (min(100/lure, 25))
    l = acoes(T.trAgenteUpar(foto(Object.assign({ hunt: huntSN({ lure: 2, lureTiers: [{ min: 3 }] }), medidoAtual: { xpH: 540000, min: 10, abatesH: 650 } }, base)), T.TR_BASE), 'lure');
    assert.strictEqual(l[0].impacto, 25);
});

// ── Task 7: Set × topo do rank
const TOPO = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'treinador-topo.json'), 'utf8'));
const topoDe = (o) => Object.assign({}, TOPO, o || {});
const pecas = (nomes) => Object.fromEntries(Object.entries(nomes).filter(([, n]) => n)
    .map(([s, n]) => [s, { nome: n, refino: 0, raridade: 'comum', potencia: 400, atributos: [], imbuSlots: 0, imbu: [] }]));
const SET_KN = { head: 'Zaoan helmet', necklace: 'onyx pendant', armor: 'dwarven armor', weapon: 'stonecutter axe', shield: 'prismatic shield', ring: 'crystal ring', legs: 'exotic legs', boots: 'guardian boots' };
const SET_PA = { head: 'wood cape', necklace: 'scarf', armor: 'paladin armor', weapon: 'living vine bow', ammo: 'arrow', ring: 'crystal ring', legs: 'bast legs', boots: 'leather boots' };
const SET_MA = { head: 'jade hat', necklace: 'onyx pendant', armor: 'magma coat', weapon: 'jungle wand', shield: 'spellbook of mind control', ring: 'crystal ring', legs: 'magma legs', boots: 'makeshift boots' };
// no topo: Druida veste firemind raiment (5 de 9) e magma boots (5 de 9); Feiticeiro, makeshift boots (5 de 9)
const SET_DR = Object.assign({}, SET_MA, { armor: 'firemind raiment', weapon: 'jungle rod', boots: 'magma boots' });
const partyTopo = (o) => {
    o = o || {};
    return [{ voc: 'KNIGHT', skills: { melee: 72, dist: 30, ml: 12, escudo: 70 }, eq: pecas(Object.assign({}, SET_KN, o.KNIGHT)) },
        { voc: 'PALADIN', skills: { melee: 30, dist: 75, ml: 20, escudo: 40 }, eq: pecas(Object.assign({}, SET_PA, o.PALADIN)) },
        { voc: 'SORCERER', skills: { melee: 10, dist: 10, ml: 62, escudo: 20 }, eq: pecas(Object.assign({}, SET_MA, o.SORCERER)) },
        { voc: 'DRUID', skills: { melee: 10, dist: 10, ml: 66, escudo: 20 }, eq: pecas(Object.assign({}, SET_DR, o.DRUID)) }];
};
t('topo: fixture anônima (9 perfis visíveis, 80 no "perto", sem nome de jogador)', () => {
    assert.strictEqual(TOPO.perfis.length, 9); assert.strictEqual(TOPO.perto.length, 80);
    assert(TOPO.perto.every(p => /^P\d+$/.test(p.nome))); assert(TOPO.perfis.every(p => !('nome' in p)));
});
t('topo: magos sem magma legs (7 de 9 no topo) → sugere, comunidade, impacto 3, preço do Mercado (sem maiúsculas)', () => {
    const f = foto({ nivel: 250, topo: topoDe(), precos: { 'Magma Legs': 900000 },
        party: partyTopo({ SORCERER: { legs: 'blue legs' }, DRUID: { legs: 'MAGMA LEGS' } }) });
    const cs = T.trAgenteTopo(f, T.TR_BASE), m = acoes(cs, 'abrir-melhorias');
    assert.strictEqual(m.length, 1, cs.map(c => c.titulo).join(' | '));
    const c = m[0];
    assert.deepStrictEqual([c.acao.voc, c.acao.slot, c.acao.item], ['SORCERER', 'legs', 'magma legs']);
    assert.strictEqual(c.confianca, 'comunidade'); assert.strictEqual(c.impacto, 3); assert.strictEqual(c.estado, 'aviso');
    assert.strictEqual(c.numeros.k, 7); assert.strictEqual(c.numeros.n, 9); assert.strictEqual(c.numeros.preco, 900000); assert.strictEqual(c.custo, 900000);
    assert(/Feiticeiro/.test(c.titulo) && /magma legs/.test(c.titulo) && c.titulo.length <= 70, c.titulo);
    assert(/7 de 9/.test(c.porque), c.porque);
});
t('topo: 1 conselho por vocação (o item mais usado); sem preço → custo 0 e preco null', () => {
    const f = foto({ nivel: 250, topo: topoDe(), party: partyTopo({ SORCERER: { legs: 'blue legs', ring: 'gold ring' } }) });
    const m = acoes(T.trAgenteTopo(f, T.TR_BASE), 'abrir-melhorias');
    assert.deepStrictEqual(m.map(c => [c.acao.voc, c.acao.item]), [['SORCERER', 'magma legs']]); // magma legs 7/9 > crystal ring 6/9
    assert.strictEqual(m[0].custo, 0); assert.strictEqual(m[0].numeros.preco, null);
});
t('topo: Royal Signet no Cavaleiro (2 de 9, < 50 %) → não sugere', () => {
    const cs = T.trAgenteTopo(foto({ nivel: 250, topo: topoDe(), party: partyTopo() }), T.TR_BASE);
    assert(!cs.some(c => c.acao && /royal signet/i.test(c.acao.item || '')));
    assert.strictEqual(acoes(cs, 'abrir-melhorias').length, 0);
});
t('topo: tudo igual ou melhor → ok "Seu set bate com o do topo"', () => {
    const cs = T.trAgenteTopo(foto({ nivel: 250, topo: topoDe(), party: partyTopo() }), T.TR_BASE);
    assert.deepStrictEqual(cs.map(c => c.estado), ['ok']); assert(/bate com o do topo/.test(cs[0].titulo));
});
t('topo: skill principal < mediana − 3 → aviso sem ação e impacto 0 (Cavaleiro melee 64 × 69; Druida 62 × 65 não)', () => {
    const party = partyTopo(); party[0].skills.melee = 64; party[3].skills.ml = 62;
    const cs = T.trAgenteTopo(foto({ nivel: 250, topo: topoDe(), party }), T.TR_BASE);
    const sk = cs.filter(c => c.id.startsWith('topo:skill-'));
    assert.deepStrictEqual(sk.map(c => c.numeros.voc), ['KNIGHT']);
    const c = sk[0]; assert.strictEqual(c.impacto, 0); assert.strictEqual(c.acao, null); assert.strictEqual(c.estado, 'aviso');
    assert.strictEqual(c.numeros.minha, 64); assert.strictEqual(c.numeros.mediana, 69);
    assert(/64 × 69/.test(c.titulo) && c.titulo.length <= 70, c.titulo); assert(/Treino e Legado/.test(c.porque));
    assert(!cs.some(x => x.estado === 'ok'));
});
t('topo: ml do topo por vocação (Feiticeiro 57 × 60 não avisa; 56 avisa)', () => {
    const party = partyTopo(); party[2].skills.ml = 57;
    const sk = () => T.trAgenteTopo(foto({ nivel: 250, topo: topoDe(), party }), T.TR_BASE).filter(c => c.id.startsWith('topo:skill-')).map(c => c.numeros.voc);
    assert.deepStrictEqual(sk(), []);
    party[2].skills.ml = 56;
    assert.deepStrictEqual(sk(), ['SORCERER']);
});
t('topo: sem topo ou topo velho (idadeH 30) → só "Comparar com o topo do rank" (ler-topo, impacto 1)', () => {
    for (const topo of [null, topoDe({ idadeH: 30 })]) {
        const cs = T.trAgenteTopo(foto({ nivel: 250, topo, party: partyTopo({ SORCERER: { legs: 'blue legs' } }) }), T.TR_BASE);
        assert.strictEqual(cs.length, 1); assert.strictEqual(cs[0].acao && cs[0].acao.tipo, 'ler-topo');
        assert.strictEqual(cs[0].impacto, 1); assert.strictEqual(cs[0].confianca, 'estimado');
    }
});
t('topo: < 3 perfis na faixa (nível..nível+150) → "Poucos perfis visíveis", impacto 0, sem sugestão de item', () => {
    const party = partyTopo({ SORCERER: { legs: 'blue legs' } });
    for (const f of [foto({ nivel: 250, topo: topoDe({ perfis: TOPO.perfis.slice(0, 2) }), party }), foto({ nivel: 100, topo: topoDe(), party })]) {
        const cs = T.trAgenteTopo(f, T.TR_BASE);
        const p = cs.find(c => c.id === 'topo:poucos');
        assert(p, cs.map(c => c.titulo).join(' | ')); assert.strictEqual(p.impacto, 0); assert.strictEqual(acoes(cs, 'abrir-melhorias').length, 0);
    }
});
t('topo: foto vazia → ler-topo; registrado em TR_AGENTES', () => {
    assert.deepStrictEqual(T.trAgenteTopo(T.trFotoVazia(), T.TR_BASE).map(c => c.acao && c.acao.tipo), ['ler-topo']);
    assert(T.TR_AGENTES.some(a => a.id === 'topo' && a.rodar === T.trAgenteTopo && a.icone === '♛'));
});

process.on('exit', () => { if (!process.exitCode) console.log(`\n${n} testes ok`); });

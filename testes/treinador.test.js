// Roda: node testes/treinador.test.js
// 2.67.0 — treinador (aba Progresso): especialistas puros e o chefe.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const i = src.indexOf('/* @@TREINADOR-PURO-INICIO'), f = src.indexOf('/* @@TREINADOR-PURO-FIM');
assert(i > 0 && f > i, 'trecho @@TREINADOR-PURO não encontrado');
const T = new Function(src.slice(i, f) + '\nreturn { TR_BASE, TR_AGENTES, trConselho, trOrdenar, trRodar, trFotoVazia, trCacada, trAgenteUpar, trAgenteMult, trAgenteLegado, '
    + 'trMesmoId, trQtd, trLimitadoPorDano, trDanoParaXp, trTipoPrey, trXpAtual, trRecDe, trMortesRecentes, trAgenteTopo, trAgenteErros, trXpPerdidaMorte, trAgenteBoss, trEventosMorte, trImpactoMorte, '
    + 'trAgenteBestiario, trAgenteItens, trAgenteForja, trAgenteDinheiro, trCortaSufixo, trParty, trVelho, trEhMago, trDanoDeUm, trCustoEfetivo, trResumirTopo, trOuroLivre, trMesclarMapas, trAnotar, trFreioTopo, trPerfisDepois, trAcaoInfo, trCasaResposta, trPlanoCompra, trIdadePt, TR_ACAO_ROTULO, TR_ERRO_PT, trDecidirClique, trRespostaConfirma, trK, trInscreveuDepois, trExecutarCompra, trCacheVelho };')();
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
t('trOrdenar: estado erro tem nota mínima 4 (piso)', () => {
    const r = T.trOrdenar([{ id: 'e', impacto: 0.5, estado: 'erro' }, { id: 'a', impacto: 4.5, confianca: 'medido' }, { id: 'e2', impacto: 20, estado: 'erro', confianca: 'medido' }], {});
    assert.deepStrictEqual(r.map(c => [c.id, c.nota]), [['e2', 20], ['a', 4.5], ['e', 4]]);
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
    assert.deepStrictEqual(r.passos.map(c => c.id), ['muitos:k5', 'muitos:k4', 'muitos:grave']); // erro com impacto 0,1 sobe para o piso 4
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

// teste ao vivo 27/11: logo depois de trocar de mapa o analisador tinha 0,4 min (35 mil XP/h) e virou "a XP/h de agora"
t('trXpAtual: medida de agora com menos de 5 min não vale (cai na medida do mapa)', () => {
    const h = huntSN({ id: 222 });
    assert.strictEqual(T.trXpAtual(foto({ hunt: h, medidoAtual: { xpH: 34667, min: 0.4 }, mapas: [mapa(222, 'Shadow Nexus', 520000)] })), 520000);
    assert.strictEqual(T.trXpAtual(foto({ hunt: h, medidoAtual: { xpH: 34667, min: 0.4 } })), null);
    assert.strictEqual(T.trXpAtual(foto({ hunt: h, medidoAtual: { xpH: 540000, min: 5 } })), 540000);
});
t('upar: sessão recém-aberta (0,4 min) não manda trocar de mapa nem diz "rende 35 mil"', () => {
    const f = foto({ nivel: 251, hunt: huntSN({ id: 222 }), medidoAtual: { xpH: 34667, min: 0.4 },
        mapas: [mapa(222, 'Shadow Nexus', 520000), mapa(2, 'Summer Court', 500000)] });
    const cs = T.trAgenteUpar(f, T.TR_BASE);
    assert.strictEqual(acoes(cs, 'ir-mapa').length, 0);
    assert(!cs.some(c => /35 mil/.test(c.porque || '')), cs.map(c => c.porque).join(' | '));
    const f2 = foto({ nivel: 251, hunt: huntSN({ id: 222 }), medidoAtual: { xpH: 34667, min: 0.4 },
        mapas: [mapa(222, 'Shadow Nexus', 520000), mapa(2, 'Summer Court', 540000)] });
    assert.strictEqual(acoes(T.trAgenteUpar(f2, T.TR_BASE), 'ir-mapa').length, 0, '+4 % não passa os 10 %');
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
const ses = (morte, extra) => Object.assign({ hunt: 'Shadow Nexus', huntId: 1, durMin: 60, xpH: 500000, ouroH: 0, morte }, extra || {});
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
        assert(Math.abs(ab.impacto - (650 / 540 - 1) * 100) < 1e-9, String(ab.impacto)); // medido: o ganho real
        assert.strictEqual(ab.numeros.dedupe, 'ilha:dream_courts');
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
t('mult: bênçãos — impacto = ritmo de EVENTOS (7 dias) × XP salva ÷ XP de um dia; custo = uma compra das que faltam', () => {
    const salvo = 0.0227 * 254e6 * 7 * 0.08, esperado = salvo / (540000 * 24 * 7) * 100; // 1 evento na semana
    const party = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'].map(voc => ({ t: 1.8e12 - DIA, hunt: 'Shadow Nexus', huntId: 1, voc }));
    for (const mortes of [[{ t: 1.8e12 - 2 * DIA, hunt: 'Shadow Nexus', voc: 'DRUID' }], party]) { // a party inteira no mesmo instante = 1 evento
        const c = acoes(T.trAgenteMult(fBencao({ mortes }), T.TR_BASE), 'bencaos')[0];
        assert(c); assert(Math.abs(c.impacto - esperado) < 1e-6, String(c.impacto)); assert.strictEqual(c.numeros.nMortes, 1);
        assert.strictEqual(c.custo, T.TR_BASE.bencaos.total(250)); assert.strictEqual(c.confianca, 'wiki'); assert(c.titulo.length <= 70);
    }
    const dois = acoes(T.trAgenteMult(fBencao({ mortes: [{ t: 1.8e12 - DIA }, { t: 1.8e12 - 2 * DIA }] }), T.TR_BASE), 'bencaos')[0];
    assert(Math.abs(dois.impacto - 2 * esperado) < 1e-6, '2 eventos = ritmo dobrado');
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
    assert(!/teto/.test(l[0].porque), '40 exato não foi cortado: ' + l[0].porque);
    l = acoes(T.trAgenteUpar(foto(Object.assign({ hunt: huntSN({ lure: 3, lureTiers: tiers }), medidoAtual: { xpH: 540000, min: 10, abatesH: 1000 } }, base)), T.TR_BASE), 'lure');
    assert(Math.abs(l[0].impacto - (8 / 7 - 1) * 100) < 1e-9, String(l[0].impacto)); assert(/14 %/.test(l[0].porque), l[0].porque);
    assert(!/teto/.test(l[0].porque), l[0].porque);
    // degrau que mais que dobra as criaturas (bruto 300) fica no teto de 40, e o porquê diz que cortou
    l = acoes(T.trAgenteUpar(foto(Object.assign({ hunt: huntSN({ lure: 1, lureTiers: [{ min: 1, max: 2 }, { min: 4, max: 5 }] }), medidoAtual: { xpH: 540000, min: 10, abatesH: 330 } }, base)), T.TR_BASE), 'lure');
    assert.strictEqual(l[0].impacto, 40); assert(/teto do modelo/.test(l[0].porque), l[0].porque);
    // degrau com faixa [min, max] → usa a média: [4–6] → [5–7] = 5 → 6 criaturas = +20 %
    l = acoes(T.trAgenteUpar(foto(Object.assign({ hunt: huntSN({ lure: 1, lureTiers: [{ min: 4, max: 6 }, { min: 5, max: 7 }] }), medidoAtual: { xpH: 540000, min: 10, abatesH: 330 } }, base)), T.TR_BASE), 'lure');
    assert(Math.abs(l[0].impacto - 20) < 1e-9, String(l[0].impacto)); assert(/5 → 6/.test(l[0].porque), l[0].porque);
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
    assert(!('eu' in TOPO), 'sem o bloco "eu" (dado da conta)');
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
t('topo: sem nenhum eq lido na party → nada de "Seu set bate" (não comparou set nenhum)', () => {
    const semEq = partyTopo().map(m => ({ voc: m.voc, skills: m.skills }));
    for (const party of [semEq, partyTopo().map(m => Object.assign({}, m, { eq: {} })), []]) {
        const cs = T.trAgenteTopo(foto({ nivel: 250, topo: topoDe(), party }), T.TR_BASE);
        assert(!cs.some(c => c.estado === 'ok'), cs.map(c => c.titulo).join(' | '));
    }
});
t('topo: título com nome de item longo fica em ≤ 70', () => {
    const longo = 'extraordinarily long legendary trousers of the ancient forgotten dream courts';
    const perfis = [1, 2, 3].map(k => ({ nivel: 260 + k, voc: { SORCERER: { legs: longo } } }));
    const c = acoes(T.trAgenteTopo(foto({ nivel: 250, topo: topoDe({ perfis }), party: partyTopo() }), T.TR_BASE), 'abrir-melhorias')[0];
    assert(c); assert(c.titulo.length <= 70, c.titulo); assert.strictEqual(c.acao.item, longo);
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
    for (const topo of [null, topoDe({ idadeH: 30 }), topoDe({ idadeH: undefined })]) { // sem idadeH = não sei a idade = velho
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
t('topo: sem skills comparadas, o "ok" não fala de skill', () => {
    const party = partyTopo().map(m => Object.assign({}, m, { skills: {} }));
    const cs = T.trAgenteTopo(foto({ nivel: 250, topo: topoDe(), party }), T.TR_BASE);
    assert.deepStrictEqual(cs.map(c => c.estado), ['ok']); assert(!/skill/i.test(cs[0].porque), cs[0].porque);
    const comSkill = T.trAgenteTopo(foto({ nivel: 250, topo: topoDe(), party: partyTopo() }), T.TR_BASE)[0];
    assert(/skill/i.test(comSkill.porque), comSkill.porque);
});

// ── Task 8: Onde estou errando
const H = 3600e3;
const fErros = (o) => foto(Object.assign({ nivel: 250, xpTotal: 254e6, hunt: huntSN(), medidoAtual: { xpH: 540000, min: 10, ouroH: 50000 }, ouroLivre: 5e6, party: partyTopo() }, o || {}));
const erro = (f, id) => T.trAgenteErros(f, T.TR_BASE).find(c => c.id === 'erros:' + id);
t('trXpPerdidaMorte: 2,27 % da XP total sem bênção (100+); cada bênção corta 8 %; sem xpTotal → null', () => {
    assert(Math.abs(T.trXpPerdidaMorte(foto({ xpTotal: 254e6 }), T.TR_BASE, 0) - 0.0227 * 254e6) < 1e-6);
    assert(Math.abs(T.trXpPerdidaMorte(foto({ xpTotal: 254e6, nivel: 250 }), T.TR_BASE, 7) - 0.0227 * 254e6 * 0.44) < 1e-6);
    assert(Math.abs(T.trXpPerdidaMorte(foto({ xpTotal: 254e6 }), T.TR_BASE, 99) - 0.0227 * 254e6 * 0.44) < 1e-6, 'no máximo 7');
    assert.strictEqual(T.trXpPerdidaMorte(foto(), T.TR_BASE, 0), null);
});
t('trXpPerdidaMorte: nível baixo perde mais (interpola morte.perdaFracPorNivel)', () => {
    const fr = (nivel) => T.trXpPerdidaMorte(foto({ xpTotal: 1e6, nivel }), T.TR_BASE, 0) / 1e6;
    assert(Math.abs(fr(10) - 0.0478) < 1e-12); assert(Math.abs(fr(24) - 0.0478) < 1e-12); assert(Math.abs(fr(50) - 0.0306) < 1e-12);
    assert(Math.abs(fr(75) - (0.0306 + 0.0227) / 2) < 1e-12); assert(Math.abs(fr(37) - (0.0478 + 0.0306) / 2) < 1e-12);
    assert(Math.abs(fr(250) - 0.0227) < 1e-12);
});
t('trEventosMorte: 1 entrada por vocação; mesma caçada e |Δt| ≤ 60 s = 1 evento', () => {
    const m = (voc, dt, extra) => Object.assign({ t: 1.8e12 - H + dt, hunt: 'Shadow Nexus', huntId: 1, voc }, extra || {});
    let ev = T.trEventosMorte(foto({ mortes: [m('KNIGHT', 0), m('PALADIN', 0), m('SORCERER', 0), m('DRUID', 0)] }), T.TR_BASE, 1);
    assert.strictEqual(ev.length, 1); assert.deepStrictEqual(ev[0].vocs, ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']);
    ev = T.trEventosMorte(foto({ mortes: [m('KNIGHT', 0), m('DRUID', 30e3, { huntId: '1' }), m('PALADIN', 61e3)] }), T.TR_BASE, 1);
    assert.deepStrictEqual(ev.map(e => e.vocs), [['KNIGHT', 'DRUID'], ['PALADIN']], "'1' × 1 casa; 61 s depois é outro evento");
    ev = T.trEventosMorte(foto({ mortes: [m('KNIGHT', 0), m('DRUID', 0, { huntId: 2, hunt: 'Ice Portal' })] }), T.TR_BASE, 1);
    assert.strictEqual(ev.length, 2, 'caçadas diferentes');
    assert.strictEqual(T.trEventosMorte(foto({ mortes: [m('KNIGHT', -2 * DIA)] }), T.TR_BASE, 1).length, 0, 'fora da janela');
});
t('mortes: 1 evento → razão Erros ÷ Bênçãos ≈ 1 ÷ 0,56 (mesma régua)', () => {
    const f = fErros({ bencaos: { tem: 0, total: 7 }, mortes: [{ t: 1.8e12 - H, hunt: 'Shadow Nexus', huntId: 1, voc: 'DRUID' }] });
    const e = erro(f, 'mortes'), bc = acoes(T.trAgenteMult(f, T.TR_BASE), 'bencaos')[0];
    assert(e && bc); assert(Math.abs(e.impacto / bc.impacto - 1 / 0.56) < 0.1, e.impacto + ' / ' + bc.impacto);
});
t('erros: foto limpa → só "Nenhum erro visível" (ok); foto vazia → "Nada a apontar com os dados lidos"', () => {
    const limpa = T.trAgenteErros(fErros(), T.TR_BASE);
    assert.deepStrictEqual(limpa.map(c => [c.id, c.estado, c.titulo]), [['erros:ok', 'ok', 'Nenhum erro visível']]);
    const vazia = T.trAgenteErros(T.trFotoVazia(), T.TR_BASE);
    assert.deepStrictEqual(vazia.map(c => [c.id, c.estado, c.titulo]), [['erros:ok', 'ok', 'Nada a apontar com os dados lidos']]);
    // o ok só afirma o que foi conferido: sem sessões nem checklist na foto limpa, não fala delas
    assert(!/sessões|régua/.test(limpa[0].porque), limpa[0].porque);
});
t('erros: 2 mortes do Druida em 24 h → erro, abrir-aguentar, impacto = ritmo de 7 dias × XP perdida ÷ XP de um dia', () => {
    const mortes = [{ t: 1.8e12 - 2 * H, hunt: 'Shadow Nexus', huntId: 1, voc: 'DRUID' }, { t: 1.8e12 - 5 * H, hunt: 'Shadow Nexus', huntId: 1, voc: 'DRUID' },
        { t: 1.8e12 - 30 * H, hunt: 'Ice Portal', voc: 'KNIGHT' }];
    // 3 eventos em 7 dias (2 nas 24 h); com as 7 bênçãos a perda é 44 % da sem bênção
    const c = erro(fErros({ bencaos: { tem: 7 }, mortes }), 'mortes');
    assert(c); assert.strictEqual(c.estado, 'erro'); assert.strictEqual(c.acao.tipo, 'abrir-aguentar'); assert.strictEqual(c.numeros.n, 2);
    assert(Math.abs(c.numeros.ritmo - 3 / 7) < 1e-12);
    assert(Math.abs(c.impacto - 3 / 7 * 0.0227 * 254e6 * 0.44 / (540000 * 24) * 100) < 1e-6, String(c.impacto));
    assert.strictEqual(c.numeros.impactoBruto, c.impacto); assert.strictEqual(c.titulo, '2 mortes (Druida) em Shadow Nexus');
    // sem xpTotal: impacto 3 estimado
    const ce = erro(fErros({ xpTotal: null, mortes }), 'mortes');
    assert.strictEqual(ce.impacto, 3); assert.strictEqual(ce.confianca, 'estimado');
    assert.strictEqual(erro(fErros({ mortes: mortes.slice(2) }), 'mortes'), undefined, 'morte de 30 h atrás não conta');
});
t('erros: morte com xpTotal mas sem XP/h → impacto 3 estimado e a perda no porquê', () => {
    const c = erro(fErros({ medidoAtual: null, mortes: [{ t: 1.8e12 - H, hunt: 'Shadow Nexus', huntId: 1, voc: 'DRUID' }] }), 'mortes');
    assert.strictEqual(c.impacto, 3); assert.strictEqual(c.confianca, 'estimado'); assert.strictEqual(c.numeros.impactoBruto, null);
    assert(c.numeros.perda > 0); assert(/5,8 M de XP/.test(c.porque), c.porque);
});
t('erros: a party inteira no mesmo instante = 1 evento ("1 morte (party inteira)")', () => {
    const mortes = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'].map(voc => ({ t: 1.8e12 - H, hunt: 'Shadow Nexus', huntId: 1, voc }));
    const c = erro(fErros({ bencaos: { tem: 0 }, mortes }), 'mortes');
    assert.strictEqual(c.numeros.n, 1); assert.strictEqual(c.titulo, '1 morte (party inteira) em Shadow Nexus');
    assert(Math.abs(c.impacto - 1 / 7 * 0.0227 * 254e6 / (540000 * 24) * 100) < 1e-6, String(c.impacto));
});
t('erros: "party inteira" só quando UM evento tem as 4 vocações (K+P e S+D separados não)', () => {
    const mortes = [['KNIGHT', 0], ['PALADIN', 0], ['SORCERER', 2 * H], ['DRUID', 2 * H]].map(([voc, dt]) => ({ t: 1.8e12 - 3 * H + dt, hunt: 'Shadow Nexus', huntId: 1, voc }));
    const c = erro(fErros({ bencaos: { tem: 0 }, mortes }), 'mortes');
    assert.strictEqual(c.numeros.n, 2); assert(!/party inteira/.test(c.titulo), c.titulo);
    assert.strictEqual(c.titulo, '2 mortes (Cavaleiro, Paladino, Feiticeiro, Druida) em Shadow Nexus');
});
t('erros: sessão com só "dur" (segundos, formato antigo) não conta: a foto usa durMin', () => {
    const sessoes = [ses(false, { xpH: 800000, durMin: undefined, dur: 3600 }), ses(false, { xpH: 800000, durMin: undefined, dur: 3600 })];
    assert.strictEqual(erro(fErros({ sessoes, medidoAtual: { xpH: 400000, min: 10, ouroH: 0 } }), 'xp-caiu'), undefined);
});
t('erros: muitas mortes → teto de 50 no ranking; o porquê mostra o bruto e o teto', () => {
    const mortes = Array.from({ length: 10 }, (_, k) => ({ t: 1.8e12 - (k * 12 + 1) * H, hunt: 'Shadow Nexus', huntId: 1, voc: 'DRUID' }));
    const c = erro(fErros({ bencaos: { tem: 0 }, mortes }), 'mortes');
    const bruto = 10 / 7 * 0.0227 * 254e6 / (540000 * 24) * 100; // ≈ 63,6
    assert.strictEqual(c.impacto, 50); assert(Math.abs(c.numeros.impactoBruto - bruto) < 1e-6);
    assert(/teto 50 no ranking/.test(c.porque) && c.porque.includes(String(Math.round(bruto * 10) / 10).replace('.', ',')), c.porque);
    assert.strictEqual(c.numeros.n, 2, 'só 2 nas últimas 24 h');
});
t('erros: ouro/h negativo e ouro livre < 3 h dele → "O ouro acaba em 2 h nesta caçada" (erro, abrir-magia)', () => {
    const ma = { xpH: 540000, min: 10, ouroH: -100000 };
    const c = erro(fErros({ medidoAtual: ma, ouroLivre: 200000 }), 'ouro');
    assert(c); assert.strictEqual(c.estado, 'erro'); assert.strictEqual(c.impacto, 10); assert.strictEqual(c.confianca, 'medido'); assert.strictEqual(c.acao.tipo, 'abrir-magia');
    assert.strictEqual(c.numeros.horas, 2); assert.strictEqual(c.titulo, 'O ouro acaba em 2 h nesta caçada');
    assert.strictEqual(erro(fErros({ medidoAtual: ma, ouroLivre: 300000 }), 'ouro'), undefined, '3 h ou mais');
    assert.strictEqual(erro(fErros({ medidoAtual: Object.assign({}, ma, { min: 3 }), ouroLivre: 200000 }), 'ouro'), undefined, '< 5 min');
    assert.strictEqual(erro(fErros({ medidoAtual: ma, ouroLivre: null }), 'ouro'), undefined, 'ouro livre desconhecido');
});
t('erros: slot vazio → "<Voc> sem <slot>" (erro, abrir-equip, impacto 5, medido); vários slots num conselho só', () => {
    let c = erro(fErros({ party: partyTopo({ KNIGHT: { boots: null } }) }), 'slot-KNIGHT');
    assert(c); assert.strictEqual(c.titulo, 'Cavaleiro sem bota'); assert.strictEqual(c.estado, 'erro'); assert.strictEqual(c.impacto, 5);
    assert.strictEqual(c.confianca, 'medido');
    assert.deepStrictEqual(c.acao && [c.acao.tipo, c.acao.voc], ['abrir-equip', 'KNIGHT']); assert.deepStrictEqual(c.numeros.slots, ['boots']);
    c = erro(fErros({ party: partyTopo({ KNIGHT: { boots: null, ring: null, head: null } }) }), 'slot-KNIGHT');
    assert.strictEqual(c.titulo, 'Cavaleiro sem elmo, anel e bota'); assert.deepStrictEqual(c.numeros.slots, ['head', 'ring', 'boots']);
    c = erro(fErros({ party: partyTopo({ PALADIN: { ammo: null } }) }), 'slot-PALADIN');
    assert.deepStrictEqual(c.numeros.slots, ['ammo'], 'Paladino sem munição');
    c = erro(fErros({ party: partyTopo({ SORCERER: { shield: null } }) }), 'slot-SORCERER');
    assert.deepStrictEqual(c.numeros.slots, ['shield'], 'varinha é de 1 mão');
});
t('erros: escudo vazio só é erro com arma de 1 mão (duasMaos da foto; sem a dica, arco/besta = 2 mãos)', () => {
    const p2 = partyTopo({ KNIGHT: { shield: null } });
    assert.deepStrictEqual(erro(fErros({ party: p2 }), 'slot-KNIGHT').numeros.slots, ['shield'], 'sem a dica: stonecutter axe conta como 1 mão');
    p2[0].eq.weapon.duasMaos = true;
    assert.strictEqual(erro(fErros({ party: p2 }), 'slot-KNIGHT'), undefined);
    const pa = partyTopo(); pa[1].eq.weapon.duasMaos = false; // Paladino de lança: escudo conta
    assert.deepStrictEqual(erro(fErros({ party: pa }), 'slot-PALADIN').numeros.slots, ['shield']);
    assert.strictEqual(erro(fErros({ party: partyTopo() }), 'slot-PALADIN'), undefined, 'arco sem escudo é normal');
});
t('erros: munição só é exigida se a arma usa munição (Paladino de lança sem munição → nada)', () => {
    assert.strictEqual(erro(fErros({ party: partyTopo({ PALADIN: { weapon: 'royal spear', shield: 'great shield', ammo: null } }) }), 'slot-PALADIN'), undefined);
    assert.deepStrictEqual(erro(fErros({ party: partyTopo({ PALADIN: { weapon: 'arbalest', ammo: null } }) }), 'slot-PALADIN').numeros.slots, ['ammo']);
});
t('erros: equipamento não lido (eq vazio ou ausente) não vira "sem slot"', () => {
    const p = partyTopo(); p[0].eq = {}; delete p[1].eq;
    assert.deepStrictEqual(T.trAgenteErros(fErros({ party: p }), T.TR_BASE).map(c => c.id), ['erros:ok']);
});
t('erros: encaixes de imbuement livres somados → 1 aviso (abrir-aguentar, impacto 2)', () => {
    const p = partyTopo();
    p[0].eq.weapon.imbuSlots = 2; p[0].eq.weapon.imbu = [{ nome: 'Void' }];
    p[2].eq.armor.imbuSlots = 1; p[2].eq.armor.imbu = [null];
    const c = erro(fErros({ party: p }), 'imbu');
    assert(c); assert.strictEqual(c.numeros.n, 2); assert.strictEqual(c.estado, 'aviso'); assert.strictEqual(c.impacto, 2);
    assert.strictEqual(c.acao.tipo, 'abrir-aguentar'); assert(/^2 encaixes/.test(c.titulo), c.titulo);
    p[0].eq.weapon.imbu.push({ nome: 'Strike' }); p[2].eq.armor.imbu = [{ nome: 'Void' }];
    assert.strictEqual(erro(fErros({ party: p }), 'imbu'), undefined);
});
t('erros: checklist "ficar forte" → até 3 avisos, o 1º item falho de cada vocação (abrir-melhorias)', () => {
    const it = (chave, ok, titulo) => ({ chave, ok, titulo, texto: 'texto ' + chave });
    const checklist = { KNIGHT: [it('regen', true, 'Regen. de mana 18 de 18'), it('prot-fisica', false, 'Proteção física 8 % de 16 %'), it('imbu', false, 'Imbuement: falta Void')],
        PALADIN: [it('regen', false, 'Regen. de mana 10 de 18')], SORCERER: [it('arma-dano', false, 'Arma sem linha de dano %')], DRUID: [it('regen', false, 'Regen. de mana 5 de 21')] };
    const cs = T.trAgenteErros(fErros({ checklist }), T.TR_BASE).filter(c => c.id.startsWith('erros:check-'));
    assert.deepStrictEqual(cs.map(c => c.acao.voc), ['KNIGHT', 'PALADIN', 'SORCERER']);
    assert.strictEqual(cs[0].titulo, 'Cavaleiro: Proteção física 8 % de 16 %'); assert(/texto prot-fisica/.test(cs[0].porque));
    assert(cs.every(c => c.impacto === 2 && c.estado === 'aviso' && c.acao.tipo === 'abrir-melhorias'));
    assert.strictEqual(T.trAgenteErros(fErros({ checklist: { KNIGHT: [it('regen', true, 'ok')] } }), T.TR_BASE).filter(c => c.id.startsWith('erros:check-')).length, 0);
});
t('erros: checklist sem título nem chave → texto genérico; item "imbu" não repete o aviso de encaixe livre', () => {
    let c = erro(fErros({ checklist: { DRUID: [{ ok: false }] } }), 'check-DRUID');
    assert(c && !/undefined/.test(c.titulo + c.porque), c && c.titulo); assert.strictEqual(c.titulo, 'Druida: item da régua da comunidade');
    const p = partyTopo(); p[0].eq.weapon.imbuSlots = 1;
    const checklist = { KNIGHT: [{ chave: 'imbu', ok: false, titulo: 'Imbuement: falta Void', texto: 'x' }, { chave: 'regen', ok: false, titulo: 'Regen. de mana 5 de 18', texto: 'y' }] };
    c = erro(fErros({ party: p, checklist }), 'check-KNIGHT');
    assert.strictEqual(c.numeros.chave, 'regen', 'com encaixe livre já avisado, pula o item imbu');
    assert.strictEqual(erro(fErros({ checklist }), 'check-KNIGHT').numeros.chave, 'imbu', 'sem o aviso de encaixe, o imbu conta');
});
t('erros: XP/h < 70 % da melhor sessão do mesmo mapa (≥ 2 sessões) → aviso, impacto = queda × 0,5', () => {
    const sessoes = [ses(false, { xpH: 800000 }), ses(false, { xpH: 600000, huntId: '1' }), ses(false, { huntId: 9, hunt: 'Ice Portal', xpH: 2e6 })];
    const c = erro(fErros({ sessoes, medidoAtual: { xpH: 400000, min: 10, ouroH: 0 } }), 'xp-caiu');
    assert(c); assert.strictEqual(c.numeros.queda, 50); assert.strictEqual(c.impacto, 25); assert.strictEqual(c.acao.tipo, 'abrir-magia');
    assert.strictEqual(c.estado, 'aviso'); assert.strictEqual(c.titulo, 'XP caiu 50 % neste mapa (setup/lure?)');
    assert.strictEqual(erro(fErros({ sessoes, medidoAtual: { xpH: 600000, min: 10, ouroH: 0 } }), 'xp-caiu'), undefined, '75 % da melhor');
    assert.strictEqual(erro(fErros({ sessoes: [sessoes[0], sessoes[2]], medidoAtual: { xpH: 400000, min: 10, ouroH: 0 } }), 'xp-caiu'), undefined, '1 sessão daqui');
    assert.strictEqual(erro(fErros({ sessoes, medidoAtual: { xpH: 400000, min: 3, ouroH: 0 } }), 'xp-caiu'), undefined, 'medida curta');
});
t('erros: sessão curta (< 5 min) não vale como "melhor" nem conta para as 2 sessões', () => {
    const sessoes = [ses(false, { xpH: 2e6, durMin: 3 }), ses(false, { xpH: 600000 }), ses(false, { xpH: 550000 })];
    assert.strictEqual(erro(fErros({ sessoes, medidoAtual: { xpH: 500000, min: 10, ouroH: 0 } }), 'xp-caiu'), undefined);
    assert.strictEqual(erro(fErros({ sessoes: sessoes.slice(0, 2), medidoAtual: { xpH: 100000, min: 10, ouroH: 0 } }), 'xp-caiu'), undefined, 'só 1 sessão longa');
});
t('erros: mochila de chaves cheia → erro abrir-elite; 4/5 ou sem limite → nada', () => {
    const c = erro(fErros({ chaves: { usadas: 5, max: 5, elites: [] } }), 'chaves');
    assert(c); assert.strictEqual(c.estado, 'erro'); assert.strictEqual(c.impacto, 2); assert.strictEqual(c.acao.tipo, 'abrir-elite');
    assert.strictEqual(c.titulo, 'Mochila de chaves cheia: a próxima chave se perde'); assert.strictEqual(c.confianca, 'medido');
    for (const chaves of [{ usadas: 4, max: 5 }, { usadas: 9, max: 0 }, { usadas: 9 }]) assert.strictEqual(erro(fErros({ chaves }), 'chaves'), undefined, JSON.stringify(chaves));
});
t('erros: títulos ≤ 70 e registrado em TR_AGENTES', () => {
    const p = partyTopo({ KNIGHT: { boots: null, ring: null, head: null, legs: null, necklace: null } });
    const mortes = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'].map(v => ({ t: 1.8e12 - H, hunt: 'Warzone II - Parasite Nest', voc: v }));
    const cs = T.trAgenteErros(fErros({ party: p, mortes, chaves: { usadas: 5, max: 5 } }), T.TR_BASE);
    assert(cs.every(c => c.titulo.length <= 70), cs.map(c => c.titulo).join(' | '));
    assert(T.TR_AGENTES.some(a => a.id === 'erros' && a.rodar === T.trAgenteErros && a.icone === '⚠'));
});
t('escala: "Cavaleiro sem bota" e "ouro acaba" ficam acima de "o topo usa magma legs" e de um item da régua', () => {
    const f = fErros({ party: partyTopo({ KNIGHT: { boots: null }, SORCERER: { legs: 'blue legs' } }), topo: topoDe(),
        medidoAtual: { xpH: 540000, min: 10, ouroH: -100000 }, ouroLivre: 200000,
        checklist: { DRUID: [{ chave: 'regen', ok: false, titulo: 'Regen. de mana 5 de 21', texto: 'x' }] } });
    const ord = T.trOrdenar(T.trRodar(f, T.TR_BASE).todos, f).map(c => c.id);
    const pos = (id) => { const k = ord.indexOf(id); assert(k >= 0, id + ' ausente: ' + ord.join(', ')); return k; };
    for (const alto of ['erros:slot-KNIGHT', 'erros:ouro']) for (const baixo of ['topo:item-SORCERER', 'erros:check-DRUID']) assert(pos(alto) < pos(baixo), alto + ' × ' + baixo);
});

// ── Task 9: Boss e Elite
const fBoss = (o) => foto(Object.assign({ nivel: 250 }, o || {}));
const boss = (f) => T.trAgenteBoss(f, T.TR_BASE);
t('boss: 12 chaves de Elite → "Usar 12 chaves de Viscous (sweep)" (abrir-elite com a elite); qtd 0 não conta', () => {
    const e = acoes(boss(fBoss({ chaves: { usadas: 2, max: 10, elites: [{ nome: 'Viscous', qtd: 12 }, { nome: 'Jaws', qtd: 0 }] } })), 'abrir-elite');
    assert.strictEqual(e.length, 1); assert.strictEqual(e[0].acao.elite, 'Viscous'); assert.strictEqual(e[0].impacto, 2);
    assert.strictEqual(e[0].titulo, 'Usar 12 chaves de Viscous (sweep)'); assert.strictEqual(e[0].numeros.qtd, 12); assert.strictEqual(e[0].estado, 'aviso');
});
t('boss: chaves de várias Elites → no máximo 3, as de mais chaves primeiro', () => {
    const elites = [['A', 1], ['B', 5], ['C', 3], ['D', 9]].map(([nome, qtd]) => ({ nome, qtd }));
    assert.deepStrictEqual(acoes(boss(fBoss({ chaves: { usadas: 0, max: 30, elites } })), 'abrir-elite').map(c => c.acao.elite), ['D', 'B', 'C']);
});
t("boss: Timira (Rec 340) no 330 — 5 escamas = 1 luta; 10 = 2 (nomes sem maiúsculas, grafias somadas)", () => {
    let c = acoes(boss(fBoss({ nivel: 330, deposito: { "timira's scale": 5 } })), 'boss-trocar');
    assert.deepStrictEqual(c.map(x => [x.acao.boss, x.acao.qtd]), [['Timira', 1]]); assert.strictEqual(c[0].titulo, 'Pode lutar Timira 1 vez');
    c = acoes(boss(fBoss({ nivel: 330, deposito: { "Timira's Scale": 7, "TIMIRA'S SCALE": 3 } })), 'boss-trocar');
    assert.deepStrictEqual(c.map(x => [x.acao.boss, x.acao.qtd]), [['Timira', 2]]); assert.strictEqual(c[0].titulo, 'Pode lutar Timira 2 vezes');
    assert.strictEqual(c[0].impacto, 2); assert.strictEqual(c[0].estado, 'aviso');
    assert.strictEqual(c[0].acao.nomeJogo, 'Timira the Many-Headed', 'nome do jogo na ação');
    assert(/Auto-boss/.test(c[0].porque) && /^Dica|Dica:/.test(c[0].porque), c[0].porque);
});
t('TR_BASE: bossDicas com chaves nomeadas', () => {
    const d = T.TR_BASE.bossDicas;
    assert(!Array.isArray(d)); for (const k of ['manaAntes', 'boost', 'autoBoss']) assert(typeof d[k] === 'string' && d[k], k);
});
t('boss: "Pode lutar" com nome longo fica em ≤ 70', () => {
    const nome = 'The Extraordinarily Ancient And Forgotten Dream Courts Guardian Of Nightmares';
    const base = Object.assign({}, T.TR_BASE, { bosses: [{ nome, ilha: 'x', rec: null, vida: 1, tentativa: [{ item: 'coisa', qtd: 1 }], onde: 'aqui', drops: 'nada', vale: 'teste' }] });
    const c = acoes(T.trAgenteBoss(fBoss({ deposito: { coisa: 3 } }), base), 'boss-trocar')[0];
    assert(c); assert(c.titulo.length <= 70, c.titulo); assert.strictEqual(c.acao.boss, nome); assert.strictEqual(c.acao.qtd, 3);
});
t('boss: item de tentativa com qtd 0 é ignorado', () => {
    const base = Object.assign({}, T.TR_BASE, { bosses: [{ nome: 'Teste', ilha: 'x', rec: null, vida: 1, tentativa: [{ item: 'a', qtd: 0 }, { item: 'b', qtd: 1 }], onde: 'aqui', drops: 'nada', vale: 'teste' }] });
    assert.deepStrictEqual(acoes(T.trAgenteBoss(fBoss({ deposito: { b: 2 } }), base), 'boss-trocar').map(c => c.acao.qtd), [2]);
});
t('boss: Jaul pede os 2 troféus', () => {
    assert.strictEqual(acoes(boss(fBoss({ deposito: { 'trophy of Tanjis': 10 } })), 'boss-trocar').length, 0);
    const c = acoes(boss(fBoss({ deposito: { 'trophy of Tanjis': 10, 'trophy of Obujos': 5 } })), 'boss-trocar');
    assert.deepStrictEqual(c.map(x => [x.acao.boss, x.acao.qtd]), [['Jaul', 1]]);
    assert(!('nomeJogo' in c[0].acao), 'sem nomeJogo no TR_BASE → a ação não inventa');
});
t('boss: Izcandar (Rec 350) no 250 não entra, mesmo com tentativa; no 330 entra', () => {
    assert.strictEqual(acoes(boss(fBoss({ deposito: { "izcandar's shard": 10 } })), 'boss-trocar').length, 0);
    assert.deepStrictEqual(acoes(boss(fBoss({ nivel: 330, deposito: { "izcandar's shard": 10 } })), 'boss-trocar').map(x => x.acao.boss), ['Izcandar']);
});
t('boss: ilha do boss fechada → não sugere lutar', () => {
    assert.strictEqual(acoes(boss(fBoss({ nivel: 330, deposito: { "timira's scale": 5 }, ilhas: [{ id: 'marapur', aberta: false }] })), 'boss-trocar').length, 0);
});
t('boss: tentativa pela metade → 1 conselho "Juntar" (sem ação, impacto 1), o boss mais perto de fechar', () => {
    const cs = boss(fBoss({ deposito: { 'trophy of Tanjis': 5, 'trophy of Obujos': 2, 'yalahari figurine': 4 } }));
    const j = cs.filter(c => c.id.startsWith('boss:juntar'));
    assert.strictEqual(j.length, 1); assert.strictEqual(j[0].acao, null); assert.strictEqual(j[0].impacto, 1);
    assert.strictEqual(j[0].numeros.boss, 'Azerus'); // 4/5 > Jaul (o troféu de Obujos está em 2/5)
    assert(/yalahari figurine/.test(j[0].titulo) && /Azerus/.test(j[0].titulo) && j[0].titulo.length <= 70, j[0].titulo);
    assert(/Quara/.test(j[0].porque), j[0].porque);
    assert.strictEqual(boss(fBoss({ deposito: {} })).filter(c => c.id.startsWith('boss:juntar')).length, 0, 'sem nenhum item: não sugere juntar');
});
t('boss: Invasão — inscrito false → aviso (invasao); inscrito true ou desconhecido → nada', () => {
    const c = acoes(boss(fBoss({ invasao: { inscrito: false, proxima: 14 } })), 'invasao');
    assert.strictEqual(c.length, 1); assert.strictEqual(c[0].impacto, 1); assert.strictEqual(c[0].titulo, 'Inscrever na Invasão (fragmento T2 grátis)');
    assert.strictEqual(acoes(boss(fBoss({ invasao: { inscrito: true } })), 'invasao').length, 0);
    assert.strictEqual(acoes(boss(fBoss({ invasao: {} })), 'invasao').length, 0);
});
t('boss: nada a fazer → ok; foto vazia → ok; registrado', () => {
    for (const f of [fBoss({ invasao: { inscrito: true }, chaves: { usadas: 0, max: 5, elites: [] } }), T.trFotoVazia()]) {
        assert.deepStrictEqual(boss(f).map(c => [c.id, c.estado]), [['boss:ok', 'ok']]);
    }
    assert(T.TR_AGENTES.some(a => a.id === 'boss' && a.rodar === T.trAgenteBoss && a.icone === '☗'));
});

// ── Bestiário (☰)
const fBest = (o) => foto(Object.assign({ nivel: 238, hunt: huntSN(), medidoAtual: { xpH: 540000, min: 10, abatesH: 1000 } }, o || {}));
const lb = (huntId, title, bonus, horas, xpH, extra) => Object.assign({ huntId, title, bonus, ganho: 1, falta: Number.isFinite(horas) ? horas * 1000 : 5000, horas, xpH }, extra || {});
const best = (f) => T.trAgenteBestiario(f, T.TR_BASE);
t('bestiário: marco do mapa atual a ≤ 10 h → ok "Já fechando ML +1 aqui (~8 h)"', () => {
    const cs = best(fBest({ bestiario: [lb(1, 'Shadow Nexus', 'magicLevel', 8, 540000, { falta: 8000 })] }));
    assert.deepStrictEqual(cs.map(c => [c.estado, c.titulo]), [['ok', 'Já fechando ML +1 aqui (~8 h)']]);
    assert.strictEqual(cs[0].acao, null);
});
t('bestiário: mapa atual a mais de 10 h → aviso de impacto 0, sem ação ("é só continuar")', () => {
    const cs = best(fBest({ bestiario: [lb('1', 'Shadow Nexus', 'magicLevel', 20, 540000)] }));
    assert.strictEqual(cs.length, 1); assert.strictEqual(cs[0].estado, 'aviso'); assert.strictEqual(cs[0].acao, null);
    assert.strictEqual(cs[0].impacto, 0); assert.strictEqual(cs[0].titulo, 'Fechar ML +1 em Shadow Nexus (~20 h)');
    assert(/é só continuar/.test(cs[0].porque));
});
t('bestiário: outro mapa com XP/h a 50 % da atual → ignorado', () => {
    const cs = best(fBest({ bestiario: [lb(5, 'Ice Portal', 'magicLevel', 2, 270000)] }));
    assert.deepStrictEqual(cs.map(c => [c.estado, c.titulo]), [['ok', 'Sem marco de bestiário que valha agora']]);
});
t('bestiário: ML em outro mapa (XP ≥ 80 %) em 6 h → impacto 3, ir-mapa', () => {
    const c = best(fBest({ bestiario: [lb(7, 'Otherworld Zao', 'magicLevel', 6, 450000)] }))[0];
    assert.strictEqual(c.impacto, 3); assert.strictEqual(c.estado, 'aviso'); assert.strictEqual(c.confianca, 'wiki');
    assert.deepStrictEqual([c.acao.tipo, c.acao.huntId], ['ir-mapa', 7]);
    assert.strictEqual(c.titulo, 'Fechar ML +1 em Otherworld Zao (~6 h)');
    assert.deepStrictEqual([c.numeros.bonus, c.numeros.horas, c.numeros.xpH], ['magicLevel', 6, 450000]);
});
t('bestiário: regen. de mana +3 a 30 h → impacto 1/3; armadura → 0,5', () => {
    let c = best(fBest({ bestiario: [lb(8, 'Warzone I - Fungus', 'manaRegen', 30, 500000, { ganho: 3 })] }))[0];
    assert(Math.abs(c.impacto - 1 / 3) < 1e-12, String(c.impacto)); assert.strictEqual(c.titulo, 'Fechar regen. de mana +3 em Warzone I - Fungus (~30 h)');
    c = best(fBest({ bestiario: [lb(9, 'Ice Portal', 'armor', 4, 500000)] }))[0];
    assert.strictEqual(c.impacto, 0.5);
});
t('bestiário: bônus de dano passa pelo teto de spawn — limitada por spawn → ML some; ganho 2 → dobra; regen +3 = 1', () => {
    const r = [lb(7, 'Otherworld Zao', 'magicLevel', 6, 500000)];
    assert.deepStrictEqual(best(fBest({ bestiario: r, medidoAtual: { xpH: 540000, min: 10, abatesH: 1300 } })).map(c => c.id), ['best:ok']); // 1300 ≥ 0,85 × 1360
    assert.strictEqual(best(fBest({ bestiario: [lb(7, 'Otherworld Zao', 'magicLevel', 6, 500000, { ganho: 2 })] }))[0].impacto, 6);
    assert.strictEqual(best(fBest({ bestiario: [lb(8, 'Warzone I - Fungus', 'manaRegen', 5, 500000, { ganho: 3 })] }))[0].impacto, 1);
    // sem medida da limitação: 3 × 0,7
    // (a XP/h de agora vem do mapa: a medida de 2 min não vale desde o teste ao vivo de 27/11)
    assert(Math.abs(best(fBest({ bestiario: r, medidoAtual: { xpH: 540000, min: 2 }, mapas: [mapa(1, 'Shadow Nexus', 540000)] }))[0].impacto - 2.1) < 1e-12);
});
t('bestiário: horas desconhecidas ou bônus fora da prioridade → ignorado', () => {
    for (const r of [lb(7, 'Otherworld Zao', 'magicLevel', null, 500000), lb(7, 'Otherworld Zao', 'capacity', 2, 500000)]) {
        assert.deepStrictEqual(best(fBest({ bestiario: [r] })).map(c => c.estado), ['ok'], JSON.stringify(r));
    }
});
t('bestiário: XP/h do mapa desconhecida → entra como estimado e com metade do impacto', () => {
    const c = best(fBest({ bestiario: [lb(7, 'Otherworld Zao', 'magicLevel', 6, null)] }))[0];
    assert.strictEqual(c.impacto, 1.5); assert.strictEqual(c.confianca, 'estimado');
});
t('bestiário: no máximo 2 conselhos (os de maior impacto) + o ok do mapa atual', () => {
    const cs = best(fBest({ bestiario: [lb(8, 'Warzone I - Fungus', 'manaRegen', 3, 500000), lb(7, 'Otherworld Zao', 'magicLevel', 6, 500000),
        lb(9, 'Fire Portal', 'attack', 25, 500000), lb(1, 'Shadow Nexus', 'magicLevel', 5, 540000)] }));
    assert.deepStrictEqual(cs.filter(c => c.estado !== 'ok').map(c => c.numeros.huntId), [7, 9]); // 3 · 1,2 · (regen 1)
    assert.strictEqual(cs.filter(c => c.estado === 'ok').length, 1);
    assert(cs.every(c => c.titulo.length <= 70));
});
t('bestiário: foto vazia → ok; registrado', () => {
    assert.deepStrictEqual(best(T.trFotoVazia()).map(c => c.estado), ['ok']);
    assert(T.TR_AGENTES.some(a => a.id === 'best' && a.rodar === T.trAgenteBestiario && a.icone === '☰'));
});

// ── Caçar itens (⌕)
const fItens = (o) => foto(Object.assign({ nivel: 275, hunt: huntSN(), ilhas: [{ id: 'issavi', aberta: true }, { nome: 'Marapur', aberta: false }] }, o || {}));
const itens = (f) => T.trAgenteItens(f, T.TR_BASE);
t('itens: Marapur com 4 Conch no depósito e preço 300 mil → custo 10 M + 6 × 300 mil, comprar-mercado', () => {
    const cs = itens(fItens({ deposito: { 'spectral conch': 4 }, precos: { 'Spectral Conch': 300000 } }));
    assert.strictEqual(cs.length, 1); const c = cs[0];
    assert.strictEqual(c.id, 'itens:ilha-marapur'); assert.strictEqual(c.custo, 10e6 + 6 * 300000); assert.strictEqual(c.impacto, 5); assert.strictEqual(c.confianca, 'estimado');
    assert.strictEqual(c.titulo, 'Abrir Marapur: faltam 10 M de ouro + 6 Spectral Conch');
    assert.deepStrictEqual(c.numeros.materiais.map(m => [m.nome, m.falta, m.preco]), [['Spectral Conch', 6, 300000]]);
    assert.strictEqual(c.numeros.ouro, 10e6);
    assert.strictEqual(c.acao.tipo, 'comprar-mercado'); assert.deepStrictEqual(c.acao.itens, [{ nome: 'Spectral Conch', qtd: 6, preco: 300000 }]);
    assert(/Comprar 6 Spectral Conch/.test(c.porque) && /Seacrest Grounds/.test(c.porque), c.porque);
});
t('itens: sem preço → "Caçar <material>: onde", custo só o ouro, sem ação', () => {
    const c = itens(fItens({ deposito: { 'Spectral Conch': 4 } }))[0];
    assert.strictEqual(c.custo, 10e6); assert.strictEqual(c.acao, null); assert.strictEqual(c.numeros.materiais[0].preco, null);
    assert(/Caçar Spectral Conch: Elite Entombed Wraithlord/.test(c.porque), c.porque);
});
t('itens: material já no depósito → abrir-silas', () => {
    const c = itens(fItens({ deposito: { 'Spectral Conch': 12 } }))[0];
    assert.deepStrictEqual(c.acao && [c.acao.tipo, c.acao.ilha], ['abrir-silas', 'marapur']); assert.deepStrictEqual(c.numeros.materiais, []);
    assert.strictEqual(c.titulo, 'Abrir Marapur: 10 M de ouro no Silas');
});
t('itens: escolhe a ilha fechada de menor custo (Issavi 10 M × Marapur 11,8 M)', () => {
    const cs = itens(fItens({ ilhas: [{ id: 'issavi', aberta: false }, { id: 'marapur', aberta: false }], deposito: { 'spectral conch': 4 }, precos: { 'spectral conch': 300000 } }));
    assert.deepStrictEqual(cs.map(c => c.id), ['itens:ilha-issavi']); assert.strictEqual(cs[0].acao.tipo, 'abrir-silas');
});
t('itens: ilha cujas caçadas passam o nível + 20 (ou não passam a de agora) → ignorada', () => {
    const cs = itens(fItens({ nivel: 238 })); // Seacrest 290 > 258; Temple of the Moon Goddess 240 ≤ Rec 250 de agora
    assert.deepStrictEqual(cs.map(c => [c.estado, c.titulo]), [['ok', 'Nenhuma ilha a abrir no seu nível agora']]);
});
t('itens: tudo aberto → ok; foto vazia → ok sem afirmar; registrado', () => {
    assert.deepStrictEqual(itens(fItens({ ilhas: [{ id: 'marapur', aberta: true }] })).map(c => c.estado), ['ok']);
    assert.deepStrictEqual(itens(T.trFotoVazia()).map(c => [c.estado, c.titulo]), [['ok', 'Nada a apontar com os dados lidos']]);
    assert(T.TR_AGENTES.some(a => a.id === 'itens' && a.rodar === T.trAgenteItens && a.icone === '⌕'));
});

// ── Forja e refino (⚒)
const pc = (nome, refino, extra) => Object.assign({ nome, refino, potencia: 300 + 50 * refino, atributos: [] }, extra || {});
const partyForja = () => [
    { voc: 'KNIGHT', eq: { weapon: pc('stonecutter axe', 0, { ataque: 50 }), armor: pc('magic plate armor', 4), legs: pc('Zaoan legs', 4) } },
    { voc: 'SORCERER', eq: { weapon: pc('wand of cosmic energy', 0), armor: pc('magma coat', 4) } }];
const fForja = (o) => foto(Object.assign({ nivel: 250, party: partyForja(), forja: { abaixo4: [
    { voc: 'KNIGHT', slot: 'weapon', nome: 'stonecutter axe', refino: 0, custo: 1200000 },
    { voc: 'SORCERER', slot: 'weapon', nome: 'wand of cosmic energy', refino: 0, custo: 900000 }], idadeH: 2, basesParadas: [] } }, o || {}));
const forja = (f) => T.trAgenteForja(f, T.TR_BASE);
const refinos = (cs) => cs.filter(c => c.id.startsWith('forja:refino-'));
t('forja: stonecutter axe +0 (ataque 50) → refinar com custo, impacto = (4/50 × 100 ÷ 4) × 0,7, abrir-forja', () => {
    const r = refinos(forja(fForja()));
    assert.strictEqual(r.length, 1, 'a wand do Feiticeiro fica de fora'); const c = r[0];
    assert.strictEqual(c.custo, 1200000); assert.strictEqual(c.confianca, 'wiki'); assert(Math.abs(c.impacto - 1.4) < 1e-12, String(c.impacto));
    assert.strictEqual(c.titulo, 'Refinar stonecutter axe +0 → +4 (~1,2 M, sem risco)');
    assert.deepStrictEqual([c.acao.tipo, c.acao.voc, c.acao.slot], ['abrir-forja', 'KNIGHT', 'weapon']);
});
t('forja: ataque ausente → 50; ataque 100 → metade do ganho', () => {
    const p = partyForja(); p[0].eq.weapon.ataque = 100;
    assert(Math.abs(refinos(forja(fForja({ party: p })))[0].impacto - 0.7) < 1e-12);
    delete p[0].eq.weapon.ataque;
    assert(Math.abs(refinos(forja(fForja({ party: p })))[0].impacto - 1.4) < 1e-12);
});
t('forja: sem forja.abaixo4 → deriva do equipamento (custo não calculado); +4 não entra; wand +0 pulada', () => {
    const p = partyForja(); p[0].eq.armor = pc('magic plate armor', 2);
    const cs = forja(fForja({ party: p, forja: null }));
    const r = refinos(cs);
    assert.deepStrictEqual(r.map(c => c.numeros.nome), ['stonecutter axe', 'magic plate armor']); // 1,4 × 0,5 (sem custo: pelo impacto)
    assert(r.every(c => c.custo === 0 && /custo não calculado/.test(c.porque)), r[1].porque);
    assert.strictEqual(r[1].impacto, 0.5); assert.strictEqual(r[1].titulo, 'Refinar magic plate armor +2 → +4 (sem risco)');
    assert(!r.some(c => /wand|Zaoan/.test(c.numeros.nome)));
});
t('forja: no máximo 3, por impacto ÷ custo', () => {
    const abaixo4 = [['armor', 3e6], ['legs', 1e6], ['boots', 2e6], ['head', 4e6]].map(([slot, custo]) => ({ voc: 'KNIGHT', slot, nome: 'peça ' + slot, refino: 1, custo }));
    const r = refinos(forja(fForja({ forja: { abaixo4, idadeH: 1 } })));
    assert.deepStrictEqual(r.map(c => c.acao.slot), ['legs', 'boots', 'armor']);
});
t('forja: cálculo velho (> 24 h) ou ausente → "Recalcular a Forja" (forja-ler, 0,5); fresco → nada', () => {
    for (const fj of [{ abaixo4: [], idadeH: 30 }, null, { abaixo4: [] }]) {
        const c = forja(fForja({ forja: fj })).find(x => x.id === 'forja:ler');
        assert(c, JSON.stringify(fj)); assert.strictEqual(c.impacto, 0.5); assert.strictEqual(c.acao.tipo, 'forja-ler'); assert.strictEqual(c.titulo, 'Recalcular a Forja');
    }
    assert(!forja(fForja()).some(x => x.id === 'forja:ler'));
});
t('forja: base de potência ≥ 400 parada → 1 aviso "Base boa parada" (a maior); 380 → nada', () => {
    const fj = { abaixo4: [], idadeH: 1, basesParadas: [{ nome: 'avenger', potencia: 450 }, { nome: 'arbalest', potencia: 420 }, { nome: 'soft boots', potencia: 380 }] };
    const b = forja(fForja({ forja: fj })).filter(c => c.id === 'forja:base');
    assert.strictEqual(b.length, 1); assert.strictEqual(b[0].titulo, 'Base boa parada: avenger (pot. 450)'); assert.strictEqual(b[0].impacto, 1);
    assert.strictEqual(b[0].acao.tipo, 'abrir-forja');
    fj.basesParadas = [{ nome: 'soft boots', potencia: 380 }];
    assert(!forja(fForja({ forja: fj })).some(c => c.id === 'forja:base'));
});
t('forja: tudo em +4 e cálculo fresco → só ok; foto vazia → sem passo; registrado', () => {
    const p = partyForja(); p[0].eq.weapon.refino = 4;
    assert.deepStrictEqual(forja(fForja({ party: p, forja: { abaixo4: [{ voc: 'SORCERER', slot: 'weapon', nome: 'wand of cosmic energy', refino: 0, custo: 1 }], idadeH: 1 } }))
        .map(c => [c.id, c.estado]), [['forja:ok', 'ok']]);
    assert(forja(T.trFotoVazia()).every(c => !(c.impacto > 0)));
    assert(T.TR_AGENTES.some(a => a.id === 'forja' && a.rodar === T.trAgenteForja && a.icone === '⚒'));
});

// ── Dinheiro ($), fase 2
const comCusto = () => [T.trConselho('a', 'c400', { titulo: 'Passo de 400 mil', custo: 400000, impacto: 5, confianca: 'wiki' }),
    T.trConselho('a', 'c500', { titulo: 'Passo de 500 mil', custo: 500000, impacto: 4, confianca: 'wiki' }),
    T.trConselho('a', 'c900', { titulo: 'Passo de 900 mil', custo: 900000, impacto: 9, confianca: 'wiki' })];
const din = (f, todos) => T.trAgenteDinheiro(f, T.TR_BASE, todos);
t('dinheiro: 1 M livres, custos 400/500/900 mil e impactos 5/4/9 → guloso por impacto/milhão: 400 + 500 mil; "Juntar para" o de 900 mil', () => {
    const cs = din(foto({ ouroLivre: 1e6 }), comCusto());
    const p = cs.find(c => c.id === 'ouro:plano'), j = cs.find(c => c.id === 'ouro:juntar');
    assert(p && j);
    assert.deepStrictEqual(p.numeros.escolhidos, ['a:c400', 'a:c500']); assert.strictEqual(p.numeros.total, 900000);
    assert.strictEqual(p.titulo, 'Com 1 M livres: Passo de 400 mil, Passo de 500 mil');
    assert(Math.abs(p.impacto - 0.9) < 1e-12); assert.strictEqual(p.estado, 'aviso'); assert.strictEqual(p.acao, null); assert.strictEqual(p.custo, 0);
    // depois dos dois sobram 100 mil; o de 900 mil precisa de mais 800 mil
    assert.strictEqual(j.impacto, 0); assert.strictEqual(j.numeros.id, 'a:c900'); assert.strictEqual(j.numeros.sobra, 100000); assert.strictEqual(j.numeros.falta, 800000);
    assert.strictEqual(j.titulo, 'Juntar para: Passo de 900 mil (falta 800 mil)');
});
t('dinheiro: a confiança pesa na ordem (impacto × peso ÷ custo)', () => {
    const todos = comCusto(); todos[0].confianca = 'estimado'; // 5 × 0,4 ÷ 0,4 M = 5/M < 900 mil: 9 × 0,6 ÷ 0,9 = 6/M
    const p = din(foto({ ouroLivre: 1e6 }), todos).find(c => c.id === 'ouro:plano');
    assert.deepStrictEqual(p.numeros.escolhidos, ['a:c900']);
});
t('dinheiro: ignora ok, impacto ≤ 0 e sem custo; nada com custo → ok', () => {
    const todos = [T.trConselho('a', 'ok', { custo: 1000, impacto: 3, estado: 'ok' }), T.trConselho('a', 'zero', { custo: 1000, impacto: 0 }),
        T.trConselho('a', 'gratis', { custo: 0, impacto: 5 })];
    assert.deepStrictEqual(din(foto({ ouroLivre: 1e6 }), todos).map(c => [c.id, c.estado, c.titulo]), [['ouro:ok', 'ok', 'Nada com custo para planejar']]);
});
t('dinheiro: nada cabe → só "Juntar para" o melhor', () => {
    const cs = din(foto({ ouroLivre: 300000 }), comCusto());
    assert.deepStrictEqual(cs.map(c => c.id), ['ouro:juntar']); // o melhor por ouro é o de 400 mil
    assert.strictEqual(cs[0].numeros.id, 'a:c400'); assert.strictEqual(cs[0].numeros.falta, 100000); // 400 mil − 300 mil
    assert(/o ouro livre é 300 mil/.test(cs[0].porque), cs[0].porque);
});
t('dinheiro: ouroLivre ≤ 0 com prejuízo medido → erro "Não gaste"; sem prejuízo → aviso 0; erros:ouro presente → nada; desconhecido → aviso 0', () => {
    const prej = { xpH: 540000, ouroH: -20000, min: 10 };
    const c = din(foto({ ouroLivre: -50000, medidoAtual: prej }), comCusto());
    assert.deepStrictEqual(c.map(x => [x.id, x.estado, x.titulo, x.impacto, x.confianca, x.acao]), [['ouro:nao-gaste', 'erro', 'Não gaste: o ouro mal paga a caçada', 3, 'medido', null]]);
    for (const ma of [null, { xpH: 540000, ouroH: 117000, min: 30 }, { ouroH: -20000, min: 3 }]) {
        const b = din(foto({ ouroLivre: -50000, medidoAtual: ma }), comCusto());
        assert.deepStrictEqual(b.map(x => [x.id, x.estado, x.titulo, x.impacto]), [['ouro:baixo', 'aviso', 'Ouro baixo para comprar agora', 0]], JSON.stringify(ma));
    }
    assert.deepStrictEqual(din(foto({ ouroLivre: -50000, medidoAtual: prej }), comCusto().concat(T.trConselho('erros', 'ouro', { impacto: 10, estado: 'erro' }))), []);
    const d = din(foto({ ouroLivre: null }), comCusto());
    assert.deepStrictEqual(d.map(x => [x.id, x.titulo, x.impacto]), [['ouro:livre', 'Ouro livre desconhecido', 0]]);
});
t('dinheiro: fase 2 recebe os conselhos da fase 1 pelo trRodar e não passa à frente dos passos', () => comAgentes([
    ag('a', () => comCusto()), ag('ouro', T.trAgenteDinheiro, { fase: 2 })], () => {
    const r = T.trRodar(foto({ ouroLivre: 1e6 }), T.TR_BASE);
    const cartao = r.cartoes.find(c => c.id === 'ouro');
    assert(cartao.conselhos.some(c => c.id === 'ouro:plano' && c.numeros.escolhidos.length === 2));
    // o de 900 mil ficou fora do plano: semOuro (nota × 0,3) e cai para o fim
    assert.deepStrictEqual(r.passos.map(c => [c.id, c.semOuro]), [['a:c400', false], ['a:c500', false], ['a:c900', true]]);
}));
t('dinheiro: custo efetivo (custo + 3 × custoH); com prejuízo, custo por hora fica fora; custo Infinity/NaN fora', () => {
    const selo = T.trConselho('mult', 'selo', { titulo: 'Ligar o Selo', curto: 'Selo', custo: 10000, impacto: 9, confianca: 'wiki', numeros: { custoH: 100000 } });
    let p = din(foto({ ouroLivre: 1e6 }), [selo]).find(c => c.id === 'ouro:plano');
    assert.strictEqual(p.numeros.total, 310000); assert.strictEqual(p.titulo, 'Com 1 M livres: Selo');
    const lista = [selo, T.trConselho('a', 'inf', { custo: Infinity, impacto: 5 }), T.trConselho('a', 'nan', { custo: NaN, impacto: 5 })];
    const r = din(foto({ ouroLivre: 1e6, medidoAtual: { xpH: 1, ouroH: -300000, min: 30 } }), lista);
    assert.deepStrictEqual(r.map(c => [c.id, c.estado]), [['ouro:ok', 'ok']]);
    assert.deepStrictEqual(din(foto({ ouroLivre: 1e6 }), lista.slice(1)).map(c => c.id), ['ouro:ok']);
});
t('dinheiro: título do plano usa o rótulo curto dos conselhos', () => {
    const p = din(foto({ ouroLivre: 5e6 }), [T.trConselho('forja', 'r', { titulo: 'Refinar stonecutter axe +0 → +4 (~1,5 M, sem risco)', curto: 'refino stonecutter axe', custo: 1.5e6, impacto: 1, confianca: 'wiki' }),
        T.trConselho('mult', 'bencaos', { titulo: 'Comprar as bênçãos (≈ 200 mil de ouro)', curto: 'bênçãos', custo: 2e5, impacto: 3, confianca: 'wiki' })]).find(c => c.id === 'ouro:plano');
    assert.strictEqual(p.titulo, 'Com 5 M livres: bênçãos, refino stonecutter axe');
});
t('dinheiro: registrado como fase 2', () => {
    assert(T.TR_AGENTES.some(a => a.id === 'ouro' && a.rodar === T.trAgenteDinheiro && a.icone === '$' && a.fase === 2));
});

// ── Lote C ajustado: corte que preserva o sufixo, ok honesto da Forja, materiais com nome próprio
const LONGO = 'Nome de Mapa Muito Comprido Que Não Cabe Na Tela Do Celular De Jeito Nenhum';
t('trCortaSufixo: corta só a base e mantém o sufixo inteiro em 70', () => {
    assert.strictEqual(T.trCortaSufixo('curto', ' (fim)'), 'curto (fim)');
    const s = T.trCortaSufixo(LONGO, ' (~6 h)');
    assert.strictEqual(s.length, 70); assert(s.endsWith('… (~6 h)'), s);
});
t('títulos longos guardam o sufixo: Bestiário "(~h h)", Forja "(~X, sem risco)", Dinheiro "(falta Y)"', () => {
    const b = best(fBest({ bestiario: [lb(7, LONGO, 'magicLevel', 6, 500000), lb(1, LONGO, 'magicLevel', 8, 540000)] }));
    assert(b.length === 2 && b.every(c => c.titulo.length <= 70 && c.titulo.endsWith(c.estado === 'ok' ? 'aqui (~8 h)' : '(~6 h)')), b.map(c => c.titulo).join(' | '));
    const fj = { abaixo4: [{ voc: 'KNIGHT', slot: 'shield', nome: 'spellbook of the very ancient and extremely long lost order', refino: 0, custo: 1200000 }], idadeH: 1 };
    const r = refinos(forja(fForja({ forja: fj })))[0];
    assert(r.titulo.length <= 70 && r.titulo.startsWith('Refinar spellbook') && r.titulo.endsWith('… (~1,2 M, sem risco)'), r.titulo);
    const j = din(foto({ ouroLivre: 1000 }), [T.trConselho('a', 'x', { titulo: LONGO, custo: 5000, impacto: 1 })]).find(c => c.id === 'ouro:juntar');
    assert(j.titulo.length <= 70 && j.titulo.startsWith('Juntar para: ') && j.titulo.endsWith('(falta 4 mil)'), j.titulo);
});
t('itens: The Inquisition pede as 7 relíquias por nome; muitos materiais → "faltam 5 M de ouro + N itens"', () => {
    const f = (dep) => itens(foto({ nivel: 240, hunt: { id: 3, title: 'Fire Portal', rec: 175 }, ilhas: [{ id: 'the_inquisition', aberta: false }], deposito: dep }))[0];
    let c = f({});
    assert.strictEqual(c.id, 'itens:ilha-the_inquisition'); assert.strictEqual(c.numeros.materiais.length, 8);
    assert.strictEqual(c.titulo, 'Abrir The Inquisition: faltam 5 M de ouro + 8 itens');
    assert(/Caçar Verminor's Relic: .*Plasmother/.test(c.porque), c.porque);
    const quase = { 'inquisition badge': 20 };
    for (const r of ['Bazir', 'Infernatil', 'Tafariel', 'Apocalypse', 'Ashfalor', 'Pumin']) quase[r + "'s Relic"] = 8;
    c = f(Object.assign(quase, { "Verminor's Relic": 3 }));
    assert.strictEqual(c.titulo, "Abrir The Inquisition: faltam 5 M de ouro + 5 Verminor's Relic");
    c = f({ 'inquisition badge': 4 });
    assert(c.titulo.startsWith('Abrir The Inquisition: faltam 5 M de ouro + ') && c.titulo.length <= 70, c.titulo);
});
t('base: todo material de ilha tem nome próprio e "onde" (sem TR_BASE.materiais duplicado)', () => {
    assert(!('materiais' in T.TR_BASE));
    for (const il of T.TR_BASE.ilhas) for (const m of il.materiais) assert(m.nome && m.qtd > 0 && m.onde && !/relíquias/.test(m.nome), il.id + ': ' + m.nome);
});
t('forja: anel +2 (slot fora da conta) com o resto em +4 → o ok não diz "Peças vestidas já em +4"', () => {
    const p = partyForja(); p[0].eq.weapon.refino = 4; p[0].eq.ring = pc('Royal Signet', 2);
    const p2 = partyForja(); p2[0].eq.weapon.refino = 4; p2[1].eq.weapon.refino = 4;
    const cs = forja(fForja({ party: p, forja: null })).filter(c => c.id !== 'forja:ler');
    // a wand do Feiticeiro (+0) e o anel ficam de fora: o ok não pode afirmar "todas em +4"
    assert.deepStrictEqual(cs.map(c => c.estado), ['ok']); assert(!/Peças vestidas já em/.test(cs[0].titulo), cs[0].titulo);
    assert(/anel/.test(cs[0].porque) && /arma de mago/.test(cs[0].porque), cs[0].porque);
    p2[0].eq.ring = pc('Royal Signet', 2);
    const so = forja(fForja({ party: p2, forja: null })).filter(c => c.id !== 'forja:ler');
    assert(!/Peças vestidas já em/.test(so[0].titulo) && /anel/.test(so[0].porque), so[0].titulo + ' | ' + so[0].porque);
    delete p2[0].eq.ring;
    assert.strictEqual(forja(fForja({ party: p2, forja: null })).find(c => c.id === 'forja:ok').titulo, 'Peças vestidas já em +4');
});

t('ajudantes: trCortaSufixo com sufixo ≥ 70 não quebra; trParty, trVelho, trEhMago, trDanoDeUm', () => {
    const suf = ' ' + 'x'.repeat(75);
    assert(T.trCortaSufixo('abc', suf).endsWith(suf));
    assert.deepStrictEqual(T.trParty({ party: [null, { voc: 'KNIGHT' }, {}] }).map(m => m.voc), ['KNIGHT']); assert.deepStrictEqual(T.trParty({}), []);
    assert(T.trVelho(undefined) && T.trVelho(25) && !T.trVelho(24) && !T.trVelho('3') && T.trVelho(7, 6));
    assert(T.trEhMago('DRUID') && T.trEhMago('SORCERER') && !T.trEhMago('KNIGHT'));
    assert(Math.abs(T.trDanoDeUm(8, foto(), T.TR_BASE) - 8 / 4 * 0.7) < 1e-12); // sem medida: ÷ 4 colunas × 0,7
});
// ── Chefe: custo efetivo (custo + 3 × custoH), dedupe e quem não coube no plano do Dinheiro
t('trCustoEfetivo = custo + 3 × numeros.custoH; NaN vira 0', () => {
    assert.strictEqual(T.trCustoEfetivo({ custo: 1000, numeros: { custoH: 500 } }), 2500);
    assert.strictEqual(T.trCustoEfetivo({ custo: NaN, numeros: null }), 0); assert.strictEqual(T.trCustoEfetivo({ custo: Infinity }), Infinity);
});
t('trOrdenar: ouro livre negativo não penaliza conselho grátis; custoH conta no horizonte de 3 h', () => {
    const r = T.trOrdenar([{ id: 'gratis', impacto: 5, confianca: 'medido', custo: 0 }, { id: 'h', impacto: 5, confianca: 'medido', custo: 100, numeros: { custoH: 400 } }], { ouroLivre: -100000 });
    assert.deepStrictEqual(r.map(c => [c.id, c.semOuro, c.nota]), [['gratis', false, 5], ['h', true, 1.5]]);
    const s = T.trOrdenar([{ id: 'h', impacto: 5, confianca: 'medido', custo: 100, numeros: { custoH: 400 } }], { ouroLivre: 1200 }); // 100 + 1200 > 1200
    assert.strictEqual(s[0].semOuro, true);
});
t('trOrdenar: numeros.dedupe junta os dois; fica o de maior nota e herda ação/custo do outro', () => {
    const r = T.trOrdenar([
        T.trConselho('upar', 'abrir-ilha', { titulo: 'Abrir Issavi para Salt Caves', impacto: 20, confianca: 'comunidade', numeros: { dedupe: 'ilha:issavi' } }),
        T.trConselho('itens', 'ilha-issavi', { titulo: 'Abrir Issavi: 10 M de ouro no Silas', impacto: 5, custo: 10e6, numeros: { dedupe: 'ilha:issavi' }, acao: { tipo: 'abrir-silas', ilha: 'issavi' } }),
        T.trConselho('x', 'y', { impacto: 1 })], { ouroLivre: 20e6 });
    assert.deepStrictEqual(r.map(c => c.id), ['upar:abrir-ilha', 'x:y']);
    assert.strictEqual(r[0].impacto, 20); assert.strictEqual(r[0].custo, 10e6); assert.strictEqual(r[0].acao.tipo, 'abrir-silas');
});
t('trOrdenar: com ouro:plano, quem tem custo e ficou fora dos escolhidos ganha semOuro', () => {
    const cs = [T.trConselho('a', 'dentro', { impacto: 5, custo: 100, confianca: 'medido' }), T.trConselho('a', 'fora', { impacto: 5, custo: 200, confianca: 'medido' }),
        T.trConselho('ouro', 'plano', { impacto: 0.5, numeros: { escolhidos: ['a:dentro'] } })];
    const r = T.trOrdenar(cs, { ouroLivre: 250 });
    assert.deepStrictEqual(r.map(c => [c.id, c.semOuro]), [['a:dentro', false], ['a:fora', true], ['ouro:plano', false]]);
});

// ── Ilha alvo única (Upar × Caçar itens) e o dedupe do chefe
const fIlha = (o) => foto(Object.assign({ nivel: 275, hunt: huntSN(), medidoAtual: { xpH: 540000, min: 10 }, ouroLivre: 20e6, ilhas: [{ id: 'issavi', aberta: false }, { id: 'marapur', aberta: false }],
    mapas: [mapa(1, 'Shadow Nexus', 540000), mapa(14, 'Salt Caves', 700000, { rec: 280, aberta: false, ilha: 'issavi' })] }, o || {}));
t('ilha alvo: Upar e Itens apontam a mesma ilha (a do mapa medido), não a mais barata', () => {
    const f = fIlha({ mapas: [mapa(1, 'Shadow Nexus', 540000), mapa(15, 'Seacrest Grounds', 900000, { rec: 290, aberta: false, ilha: 'marapur', fonte: 'comunidade' })] });
    const up = T.trAgenteUpar(f, T.TR_BASE).find(c => c.id === 'upar:abrir-ilha'), it = T.trAgenteItens(f, T.TR_BASE)[0];
    assert.strictEqual(up.numeros.ilha, 'marapur'); assert.strictEqual(it.id, 'itens:ilha-marapur'); assert.strictEqual(it.numeros.dedupe, up.numeros.dedupe);
    assert.strictEqual(up.confianca, 'comunidade');
});
t('ilha alvo: mapa medido de ilha fechada abaixo de 110 % do de agora não vira alvo medido', () => {
    const f = fIlha({ mapas: [mapa(1, 'Shadow Nexus', 540000), mapa(14, 'Salt Caves', 580000, { rec: 280, aberta: false, ilha: 'issavi' })] });
    const up = T.trAgenteUpar(f, T.TR_BASE).find(c => c.id === 'upar:abrir-ilha');
    assert(up && up.impacto === 5 && up.confianca === 'estimado', up && up.porque); // cai na régua do Rec (Salt Caves 280 ≤ 295)
});
t('chefe: Upar e Itens na mesma ilha → um passo só, com o impacto do Upar e a ação/custo do Itens', () => {
    const r = T.trRodar(fIlha(), T.TR_BASE);
    const ilha = r.passos.filter(p => p.numeros && p.numeros.dedupe === 'ilha:issavi');
    assert.strictEqual(ilha.length, 1, r.passos.map(p => p.id).join(' | '));
    assert.strictEqual(ilha[0].id, 'upar:abrir-ilha'); assert(Math.abs(ilha[0].impacto - (700 / 540 - 1) * 100) < 1e-9);
    assert.strictEqual(ilha[0].acao.tipo, 'abrir-silas'); assert.strictEqual(ilha[0].custo, 10e6);
    assert.deepStrictEqual(ilha[0].ids, ['upar:abrir-ilha', 'itens:ilha-issavi']);
});
t('itens: Inquisition (8 materiais sem preço) × Issavi pronta → Issavi, mesmo mais cara', () => {
    const c = itens(foto({ nivel: 240, hunt: { id: 3, title: 'Fire Portal', rec: 175 }, ilhas: [{ id: 'the_inquisition', aberta: false }, { id: 'issavi', aberta: false }] }))[0];
    assert.strictEqual(c.id, 'itens:ilha-issavi'); assert.strictEqual(c.acao.tipo, 'abrir-silas');
});

t('base: Rec e ilha das caçadas abaixo de 200 (wiki/cacadas) — trCacada e trRecDe em nível baixo', () => {
    assert.deepStrictEqual([T.trCacada('Lizard City', T.TR_BASE).rec, T.trCacada('Lizard City', T.TR_BASE).ilha], [130, 'zao']);
    assert.deepStrictEqual([T.trCacada('Haunted Nexus Tomb', T.TR_BASE).rec, T.trCacada('Haunted Nexus Tomb', T.TR_BASE).ilha], [150, null]);
    assert.strictEqual(T.trRecDe({ title: "Souleater's Canyon" }, T.TR_BASE), 100);
    assert.strictEqual(T.trCacada('Shadow Nexus', T.TR_BASE).rec, 250);
    const ilhas = new Set(T.TR_BASE.ilhas.map(i => i.id));
    for (const [t2, c] of Object.entries(T.TR_BASE.cacadasTopo)) assert(c.rec >= 80 && (c.ilha === null || ilhas.has(c.ilha)), t2);
});
t('itens: nível 150 em Lizard City com Warzone/Otherworld/Inquisition fechadas → a de menor custo que cabe (Warzone)', () => {
    const f = foto({ nivel: 150, hunt: { id: 5, title: 'Lizard City' }, ilhas: ['warzone', 'otherworld', 'the_inquisition'].map(id => ({ id, aberta: false })),
        precos: { 'Warzone Voucher': 10000, 'Thunderscar Spark': 200000 } });
    const c = itens(f)[0];
    assert.strictEqual(c.id, 'itens:ilha-warzone'); assert.strictEqual(c.custo, 3e6 + 40 * 10000); // Otherworld 3 M + 4 M; Inquisition sem caçada entre 131 e 170
    assert.strictEqual(c.acao.tipo, 'comprar-mercado');
    assert(/Warzone I - Fungus/.test(c.porque), c.porque);
});

t('erros/régua: pula arma-refino (Forja), arma com slot vazio já apontado e potencia com base parada; pega o próximo item', () => {
    const ck = (itens2) => ({ KNIGHT: itens2.map(([chave, titulo]) => ({ chave, ok: false, titulo })) });
    let c = erro(fErros({ checklist: ck([['arma-refino', 'Arma +0 (meta +4)'], ['regen', 'Regen. de mana 5 de 18']]) }), 'check-KNIGHT');
    assert.strictEqual(c.numeros.chave, 'regen');
    const p = partyTopo(); delete p[0].eq.weapon;
    c = erro(fErros({ party: p, checklist: ck([['arma', 'Sem arma'], ['regen', 'Regen']]) }), 'check-KNIGHT');
    assert.strictEqual(c.numeros.chave, 'regen'); assert(erro(fErros({ party: p }), 'slot-KNIGHT'));
    assert.strictEqual(erro(fErros({ checklist: ck([['arma', 'Sem arma']]) }), 'check-KNIGHT').numeros.chave, 'arma', 'sem o slot apontado, conta');
    const fj = { abaixo4: [], idadeH: 1, basesParadas: [{ nome: 'avenger', potencia: 450 }] };
    assert.strictEqual(erro(fErros({ forja: fj, checklist: ck([['potencia', '2 peças < 350'], ['vida', 'Vida']]) }), 'check-KNIGHT').numeros.chave, 'vida');
    assert.strictEqual(erro(fErros({ checklist: ck([['arma-refino', 'x']]) }), 'check-KNIGHT'), undefined);
});
t('mult: prey em outro mapa → só "trazer a prey", sem sugerir trocar o tipo', () => {
    const f = foto({ nivel: 250, hunt: huntSN(), medidoAtual: { xpH: 540000, min: 10, abatesH: 600 },
        prey: { huntId: 99, buffs: { KNIGHT: { tipo: 'xp', tier: 5 }, SORCERER: { tipo: 'loot', tier: 2 } }, wildcards: 3 } });
    const cs = T.trAgenteMult(f, T.TR_BASE);
    assert(cs.some(c => c.id === 'mult:prey-mapa')); assert(!cs.some(c => /prey-tipo/.test(c.id)), cs.map(c => c.id).join(' | '));
    f.prey.huntId = 1; // aqui: agora sim, trocar tipo
    assert(T.trAgenteMult(f, T.TR_BASE).some(c => /prey-tipo/.test(c.id)));
});

// ── Integração: os 10 agentes reais em cenários da revisão (nível 262, Shadow Nexus) — o top-3 tem de fazer sentido
const pcI = (nome, refino, extra) => Object.assign({ nome, refino, potencia: 300 + 50 * refino, atributos: [], imbuSlots: 2, imbu: ['a', 'b'] }, extra || {});
const anel = (nome) => pcI(nome, 0, { imbuSlots: 0, imbu: [] });
function cenario(o) {
    const t0 = 1.8e12, partyI = [
        { voc: 'KNIGHT', skills: { melee: 64, escudo: 70 }, eq: { head: pcI('Zaoan helmet', 4), necklace: pcI('onyx pendant', 4), armor: pcI('magic plate armor', 4), weapon: pcI('stonecutter axe', 0, { ataque: 50 }),
            shield: pcI('tower shield', 4), ring: anel('crystal ring'), legs: pcI('Zaoan legs', 4), boots: pcI('guardian boots', 4) } },
        { voc: 'PALADIN', skills: { dist: 68 }, eq: { head: pcI('jade hat', 4), necklace: pcI('onyx pendant', 4), armor: pcI('paladin armor', 4), weapon: pcI('living vine bow', 4, { ataque: 40 }),
            ring: anel('crystal ring'), legs: pcI('Zaoan legs', 4), ammo: anel('diamond arrow') } },
        { voc: 'SORCERER', skills: { ml: 70 }, eq: { head: pcI('jade hat', 4), necklace: pcI('magma amulet', 4), armor: pcI('magma coat', 4), weapon: pcI('wand', 0), shield: pcI('spellbook of mind control', 4),
            ring: anel('ring'), legs: pcI('magma legs', 4), boots: pcI('magma boots', 4) } },
        { voc: 'DRUID', skills: { ml: 72 }, eq: { head: pcI('jade hat', 4), necklace: pcI('magma amulet', 4), armor: pcI('magma coat', 4), weapon: pcI('rod', 0), shield: pcI('spellbook of enlightenment', 4),
            ring: anel('ring'), legs: pcI('magma legs', 4), boots: pcI('magma boots', 4) } }];
    if (o && o.botas) { partyI[1].eq.boots = pcI('guardian boots', 4); delete o.botas; }
    return Object.assign(T.trFotoVazia(), {
        t: t0, nivel: 262, xpTotal: 262 ** 3 * 16.7, ouro: 6e6, ouroLivre: 3e6, premium: { ativo: true }, emHunt: true,
        hunt: { id: 11, title: 'Shadow Nexus', lure: 3, maxLure: 4, rec: 250, levelMin: 200, ilha: 'the_inquisition', lureTiers: [{ min: 2, max: 3 }, { min: 3, max: 4 }, { min: 4, max: 5 }, { min: 5, max: 6 }] },
        medidoAtual: { xpH: 540000, xpRawH: 200000, ouroH: 117000, gastoH: 400000, abatesH: 600, min: 30 },
        mapas: [mapa(11, 'Shadow Nexus', 540000, { ouroH: 117000 }), mapa(12, 'Summer Court', 600000, { levelMin: 220, fonte: 'comunidade', idadeH: 50 }),
            mapa(13, 'Otherworld Zao', 500000, { levelMin: 220, idadeH: 30 }), mapa(14, 'Salt Caves', 700000, { rec: 280, levelMin: 250, fonte: 'comunidade', aberta: false, ilha: 'issavi', idadeH: undefined })],
        party: partyI,
        legado: { KNIGHT: { skill: 64, marcoAtual: 60, proxMarco: 65, falta: 1, bonusAtual: 2, bonusProx: 5 }, DRUID: { skill: 72, marcoAtual: 70, proxMarco: 75, falta: 3, bonusAtual: 9, bonusProx: 14 } },
        prey: { huntId: 99, huntLocked: false, huntMsLeft: 0, buffs: { KNIGHT: { tipo: 'xp', tier: 5 }, PALADIN: { tipo: 'damage', tier: 3 }, SORCERER: { tipo: 'loot', tier: 2 }, DRUID: { tipo: 'defense', tier: 4 } }, wildcards: 12 },
        bencaos: { tem: 7, total: 7 }, ampulhetas: { KNIGHT: { usadasH: 0 }, DRUID: { usadasH: 8 } }, selo: { ativo: false, abundante: null },
        mortes: [{ t: t0 - 3 * H, hunt: 'Shadow Nexus', huntId: 11, voc: 'DRUID' }, { t: t0 - 3 * DIA, hunt: 'Shadow Nexus', huntId: 11, voc: 'DRUID' }, { t: t0 - 3 * DIA + 20e3, hunt: 'Shadow Nexus', huntId: 11, voc: 'SORCERER' }],
        sessoes: [{ hunt: 'Shadow Nexus', huntId: 11, durMin: 600, xpH: 560000, ouroH: 100000, morte: false }, { hunt: 'Shadow Nexus', huntId: 11, durMin: 180, xpH: 520000, ouroH: 120000, morte: true }],
        checklist: { KNIGHT: [{ chave: 'protFis', ok: false, titulo: '16 % de proteção física', texto: 'tem 9 %' }], DRUID: [{ chave: 'vida', ok: false, titulo: 'vida 1100+', texto: 'tem 980' }] },
        bestiario: [{ huntId: 11, title: 'Shadow Nexus', bonus: 'magicLevel', ganho: 1, falta: 30000, horas: 40, xpH: 540000 }, { huntId: 13, title: 'Otherworld Zao', bonus: 'magicLevel', ganho: 1, falta: 12000, horas: 15, xpH: 500000 }],
        chaves: { usadas: 10, max: 20, elites: [{ nome: 'Viscous', qtd: 6 }] }, deposito: { 'spectral conch': 2 }, invasao: { inscrito: false },
        forja: { abaixo4: [{ voc: 'KNIGHT', slot: 'weapon', nome: 'stonecutter axe', refino: 0, custo: 1450000 }, { voc: 'KNIGHT', slot: 'ring', nome: 'crystal ring', refino: 0, custo: 300000 }], idadeH: 3, basesParadas: [{ nome: 'avenger', potencia: 450 }] },
        topo: null, precos: { 'stonecutter axe': 3e6 },
        ilhas: [{ id: 'issavi', aberta: false }, { id: 'marapur', aberta: false }, { id: 'dream_courts', aberta: true }, { id: 'the_inquisition', aberta: true }] }, o || {});
}
const trCustoZero = (c) => T.trCustoEfetivo(c) === 0;
const top3 = (f) => T.trRodar(f, T.TR_BASE).passos.map(p => p.id);
t('integração A (limitada por dano, morte, bota faltando, prey fora): top-3 = bota, morte, prey', () => {
    assert.deepStrictEqual(top3(cenario()).sort(), ['erros:mortes', 'erros:slot-PALADIN', 'mult:prey-mapa']);
});
t('integração B (limitada por spawn): lure no topo; sem refino nem Legado no top-3', () => {
    const p = top3(cenario({ botas: true, mortes: [], sessoes: [{ hunt: 'Shadow Nexus', huntId: 11, durMin: 600, xpH: 560000, morte: false }],
        medidoAtual: { xpH: 540000, ouroH: 117000, gastoH: 400000, abatesH: 950, min: 30 } }));
    assert.strictEqual(p[0], 'upar:lure'); assert(!p.some(id => /^forja:refino|^legado:/.test(id)), p.join(' | '));
});
t('integração D (saldo −300 mil/h, 400 mil livres): "ouro acaba" no topo e o Selo fora do plano do Dinheiro', () => {
    const r = T.trRodar(cenario({ botas: true, mortes: [], ouroLivre: 400000, medidoAtual: { xpH: 540000, ouroH: -300000, abatesH: 600, min: 30 } }), T.TR_BASE);
    assert.strictEqual(r.passos[0].id, 'erros:ouro');
    const plano = r.todos.find(c => c.id === 'ouro:plano');
    assert(!plano || !plano.numeros.escolhidos.includes('mult:selo'), plano && plano.titulo);
});
t('integração E (ouro livre −100 mil e prejuízo): o aviso de ouro sai uma vez só', () => {
    const r = T.trRodar(cenario({ botas: true, mortes: [], ouroLivre: -100000, medidoAtual: { xpH: 540000, ouroH: -300000, abatesH: 600, min: 30 } }), T.TR_BASE);
    assert.strictEqual(r.passos[0].id, 'erros:ouro'); assert(!r.todos.some(c => c.agente === 'ouro'), r.todos.filter(c => c.agente === 'ouro').map(c => c.id).join());
});
t('integração G (lucro +117 mil/h, ouro livre −200 mil): nada de "Não gaste" como erro; grátis não é penalizado', () => {
    const r = T.trRodar(cenario({ botas: true, mortes: [], ouroLivre: -200000 }), T.TR_BASE);
    assert(!r.todos.some(c => c.id === 'ouro:nao-gaste')); assert(r.todos.some(c => c.id === 'ouro:baixo' && c.estado === 'aviso'));
    assert(r.passos.length === 3 && r.passos.every(p => !p.semOuro || trCustoZero(p) === false), r.passos.map(p => p.id).join(' | '));
    assert.strictEqual(r.passos[0].id, 'mult:prey-mapa'); assert.strictEqual(r.passos[0].semOuro, false);
});
// ── Task 15: topo do rank (trResumirTopo, puro)
// leaderboard sintético de 200 contas em ordem de XP (nível caindo); 'Eu' (250) na posição 178, como na leitura de 27/11
function lbSintetico() {
    const players = [];
    for (let k = 0; k < 200; k++) {
        const level = k < 177 ? 484 - k : 250 - (k - 177);
        players.push({ name: k === 177 ? 'Eu' : 'P' + (k + 1), level, skills: { melee: 60 + (k % 20), distance: 62 + (k % 20), magicSorcerer: 50 + (k % 15), magicDruid: 52 + (k % 15) } });
    }
    return { players, me: null };
}
// os perfis resumidos da fixture no formato cru do player_profile_result (equipment {slot: {name, id}}; bota como 'feet' = nome do jogo)
const perfilCru = (p, k) => ({ name: 'Perfil' + k, level: p.nivel, equipmentVisible: true,
    characters: Object.entries(p.voc).map(([vocation, eq]) => ({ vocation, equipment: Object.fromEntries(Object.entries(eq).map(([sl, nome]) => [sl === 'boots' ? 'feet' : sl, { name: nome, id: 1 }])) })) });
t('trResumirTopo: posição 178 de 200, top 1 e a faixa [nível, nível + 150]', () => {
    const lb = lbSintetico(), r = T.trResumirTopo(lb, [], 250, 1.8e12, 'eu');
    assert.strictEqual(r.pos, 178); assert.strictEqual(r.total, 200); assert.deepStrictEqual(r.top1, { nivel: 484 }); assert.strictEqual(r.t, 1.8e12);
    const naFaixa = lb.players.filter(p => p.name !== 'Eu' && p.level >= 250 && p.level <= 400);
    assert.strictEqual(r.perto.length, naFaixa.length);
    assert(r.perto.every(p => p.nivel >= 250 && p.nivel <= 400) && !r.perto.some(p => p.nome === 'Eu'));
    const p0 = r.perto[0];
    assert(typeof p0.skills.melee === 'number' && typeof p0.skills.dist === 'number' && typeof p0.skills.ml.SORCERER === 'number' && typeof p0.skills.ml.DRUID === 'number');
});
t('trResumirTopo: perfis crus viram { nivel, voc } (feet → boots); escondidos e fora da faixa saem', () => {
    const crus = TOPO.perfis.map(perfilCru);
    crus.push({ name: 'Escondido', level: 300, equipmentVisible: false, characters: [{ vocation: 'KNIGHT', equipment: { head: { name: 'x' } } }] });
    crus.push({ name: 'Alto', level: 480, equipmentVisible: true, characters: [{ vocation: 'KNIGHT', equipment: { head: { name: 'y' } } }] });
    const r = T.trResumirTopo(lbSintetico(), crus, 250, 1, 'Eu');
    assert.deepStrictEqual(r.perfis, TOPO.perfis.filter(p => p.nivel >= 250 && p.nivel <= 400));
});
t('trResumirTopo: o resumo alimenta o especialista do topo (com idadeH) sem pedir leitura', () => {
    const tp = Object.assign(T.trResumirTopo(lbSintetico(), TOPO.perfis.map(perfilCru), 250, 1.8e12, 'Eu'), { idadeH: 1 });
    const cs = T.trAgenteTopo(foto({ nivel: 250, topo: tp, party: [{ voc: 'KNIGHT', skills: { melee: 64 }, eq: { head: { nome: 'steel helmet' } } }] }), T.TR_BASE);
    assert(!cs.some(c => c.id === 'topo:ler'), cs.map(c => c.id).join());
});
t('trResumirTopo: nome fora da lista → pos null; lista crua, vazia ou nula não quebram', () => {
    assert.strictEqual(T.trResumirTopo(lbSintetico(), [], 250, 1, 'Ninguém').pos, null);
    assert.strictEqual(T.trResumirTopo(lbSintetico().players, [], 250, 1).pos, null);
    const v = T.trResumirTopo(null, null, null, null, null);
    assert.deepStrictEqual([v.pos, v.total, v.top1, v.perto.length, v.perfis.length], [null, 0, null, 0, 0]);
});
// ── Task 14: fotos das 3 contas (u2tag = trFoto() ao vivo em 27/11; ShamanBr e XundaBr montadas no mesmo formato)
const fx = (nome) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', nome), 'utf8'));
const FOTOS = { u2tag: fx('treinador-u2tag.json'), shamanbr: fx('treinador-shamanbr.json'), xundabr: fx('treinador-xundabr.json') };
for (const [conta, ft] of Object.entries(FOTOS)) {
    t(`foto ${conta}: 10 cartões, 1–3 passos, nenhum especialista quebrado, títulos ≤ 70, < 50 ms`, () => {
        const t0 = process.hrtime.bigint();
        const r = T.trRodar(ft, T.TR_BASE);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        assert.strictEqual(r.cartoes.length, 10);
        assert(r.passos.length >= 1 && r.passos.length <= 3, `${r.passos.length} passos`);
        const quebrados = r.todos.filter(c => /não consegui analisar/.test(c.titulo));
        assert(!quebrados.length, quebrados.map(c => c.agente + ': ' + c.porque).join(' | '));
        const longos = r.todos.filter(c => String(c.titulo).length > 70);
        assert(!longos.length, longos.map(c => c.titulo).join(' | '));
        assert(ms < 50, `${ms.toFixed(1)} ms`);
    });
}
t('foto u2tag (ao vivo): o formato que a trFoto entrega', () => {
    const f = FOTOS.u2tag;
    for (const k of Object.keys(T.trFotoVazia())) assert(k in f, k);
    assert.strictEqual(f.hunt.id, 222); assert.strictEqual(f.hunt.lure, 3); assert.strictEqual(f.hunt.lureTiers.length, f.hunt.maxLure);
    assert(f.medidoAtual.xpH > 0 && f.medidoAtual.xpH < f.medidoAtual.xpBonusH, 'XP raw abaixo da XP com bônus');
    assert(Number.isFinite(f.ouroLivre)); assert.strictEqual(f.party.length, 4);
    assert(f.mapas.every(m => typeof m.id === 'number' && m.xpH > 0 && m.fonte in { medido: 1, comunidade: 1, estimado: 1 }));
    assert(f.sessoes.every(s => s.durMin > 0)); assert(f.party.find(m => m.voc === 'PALADIN').eq.ammo, 'munição do battle config');
});
t('foto ShamanBr: mortes do Druida e o prejuízo aparecem; o Druida sai como evento', () => {
    const r = T.trRodar(FOTOS.shamanbr, T.TR_BASE), ids = r.todos.map(c => c.id);
    assert(ids.includes('erros:mortes'), ids.join()); assert(ids.includes('mult:bencaos'), ids.join());
    const m = r.todos.find(c => c.id === 'erros:mortes');
    assert(/Druida/.test(m.titulo), m.titulo);
});
t('foto XundaBr: mochila de chaves cheia, Premium e ilha fechada medida', () => {
    const r = T.trRodar(FOTOS.xundabr, T.TR_BASE), ids = r.todos.map(c => c.id);
    for (const id of ['erros:chaves', 'mult:premium', 'upar:abrir-ilha']) assert(ids.includes(id), id + ' ∉ ' + ids.join());
});
// ── observarRecebido: legacy_state, loyalty_update e party_snapshot são mensagens RECEBIDAS (a 2.22.0 as tratava em observarEnviado
//    e ESTADO_WS.legado/loyalty/snap nunca enchiam — visto ao vivo em 27/11). Recorte da função com stubs: tudo antes do despacho por
//    tipo está em try, então os observadores que não existem aqui só caem no falhou (stub).
function observarRecebidoIsolado() {
    const iR = src.indexOf('/* @@OBSERVAR-RECEBIDO-INICIO'), fR = src.indexOf('/* @@OBSERVAR-RECEBIDO-FIM');
    assert(iR > 0 && fR > iR, 'observarRecebido não encontrado');
    const E = { huntId: 222, legado: null, loyalty: null, snap: null };
    const fn = new Function('ESTADO_WS', 'clonar', 'falhou', src.slice(iR, fR) + '\nreturn observarRecebido;')(E, (x) => JSON.parse(JSON.stringify(x)), () => null);
    return { E, fn };
}
t('observarRecebido: legacy_state enche ESTADO_WS.legado (ativo e personagens)', () => {
    const { E, fn } = observarRecebidoIsolado();
    fn({ type: 'legacy_state', data: { ativo: true, personagens: [{ vocation: 'KNIGHT', visto: 1 }, { vocation: 'DRUID', visto: 5 }] } });
    assert.deepStrictEqual(E.legado, { ativo: true, personagens: [{ vocation: 'KNIGHT', visto: 1 }, { vocation: 'DRUID', visto: 5 }] });
});
t('observarRecebido: loyalty_update enche ESTADO_WS.loyalty no formato do painel (points, level, bonus, t)', () => {
    const { E, fn } = observarRecebidoIsolado();
    fn({ type: 'loyalty_update', data: { points: 3, level: 2, bonus: 2 } });
    assert.deepStrictEqual([E.loyalty.points, E.loyalty.level, E.loyalty.bonus], [3, 2, 2]); assert(E.loyalty.t > 0);
});
t('observarRecebido: party_snapshot enche ESTADO_WS.snap com a caçada de agora (o formato de snapElemPorVoc)', () => {
    const { E, fn } = observarRecebidoIsolado();
    fn({ type: 'party_snapshot', data: { elapsedSec: 600, members: [{ vocation: 'DRUID', stats: { taken: { COMBAT_FIREDAMAGE: 10 } } }] } });
    assert.strictEqual(E.snap.huntId, 222); assert.strictEqual(E.snap.elapsedSec, 600); assert.strictEqual(E.snap.members[0].vocation, 'DRUID'); assert(E.snap.t > 0);
    fn({ type: 'party_snapshot', data: { elapsedSec: 1 } }); // sem members: ignora
    assert.strictEqual(E.snap.elapsedSec, 600);
});
// ── Partes puras da foto (revisão de qualidade das Tasks 14–15)
t('trOuroLivre: normal − 3 h de gasto que o travado não cobre − bênçãos; sem ouro → null', () => {
    assert.strictEqual(T.trOuroLivre(6582197, 0, 328636, 0), 6582197 - 3 * 328636); // ao vivo 27/11 (u2tag)
    assert.strictEqual(T.trOuroLivre(1000000, 300000, 200000, 50000), 1000000 - 300000 - 300000 - 50000); // travado cobre 300 de 600 mil
    assert.strictEqual(T.trOuroLivre(1000000, 900000, 200000, 0), 100000); // travado cobre todo o gasto: sobra só o normal
    assert.strictEqual(T.trOuroLivre(500000, null, 0, 0), 500000); // na cidade, sem gasto
    assert.strictEqual(T.trOuroLivre(100000, 0, 300000, 0), -800000); // negativo é número (o Dinheiro trata)
    assert.strictEqual(T.trOuroLivre(null, 0, 0, 0), null); assert.strictEqual(T.trOuroLivre('abc', 0, 0, 0), null);
});
t('trMesclarMapas: medido > comunidade > estimado; empate = a mais nova; medida > 14 dias sai; comunidade velha fica', () => {
    const agora = 1.8e12, h = 36e5, dia = 864e5;
    const r = T.trMesclarMapas([
        { id: 1, xpH: 500000, fonte: 'estimado', origem: 'radar', t: agora - h, title: 'A' },
        { id: 1, xpH: 400000, fonte: 'comunidade', origem: 'discord', t: agora - 30 * dia },
        { id: 1, xpH: 380000.4, fonte: 'medido', origem: 'scan', t: agora - 2 * h },
        { id: '1', xpH: 300000, fonte: 'medido', origem: 'sessões', t: agora - 5 * h },
        { id: 2, xpH: 900000, fonte: 'medido', origem: 'scan', t: agora - 20 * dia }, // velha: sai
        { id: 2, xpH: 200000, fonte: 'comunidade', origem: 'discord', t: agora - 40 * dia },
        { id: 3, xpH: 0, fonte: 'medido', t: agora }, { id: 'x', xpH: 1, fonte: 'medido' }, null,
        { id: 4, xpH: 100000, fonte: 'qualquer', t: null }], agora);
    const por = Object.fromEntries(r.map(m => [m.id, m]));
    assert.deepStrictEqual(Object.keys(por).sort(), ['1', '2', '4']);
    assert.deepStrictEqual([por[1].xpH, por[1].fonte, por[1].origem, por[1].idadeH, por[1].title], [380000, 'medido', 'scan', 2, undefined]);
    assert(!('t' in por[1]));
    assert.deepStrictEqual([por[2].fonte, por[2].xpH, por[2].idadeH], ['comunidade', 200000, 960]);
    assert.deepStrictEqual([por[4].fonte, por[4].idadeH], ['estimado', null]);
});
const RESUME = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'treinador-welcome-u2tag.json'), 'utf8'));
t('trAnotar: resume real → conta, bênçãos, ilhas e Invasão', () => {
    const x = T.trAnotar({}, RESUME, 1000);
    assert.deepStrictEqual([x.conta.nome, x.conta.nivel, x.conta.xp, x.conta.ouro, x.conta.trav, x.conta.premiumAte], ['Conta', 250, 257118582, 0, 0, '2026-12-26T13:48:55.909Z']);
    assert.deepStrictEqual(x.bencaos.ids, [2, 3, 4, 5, 6, 7, 8]);
    assert(x.ilhas.lista.includes('the_inquisition') && !x.ilhas.lista.includes('marapur'));
    assert.deepStrictEqual([x.invasao.inscrito, x.invasao.proxima, x.invasao.encerrada], [true, RESUME.data.meta.invasao.proxima.startAtMs, false]);
});
t('trAnotar: ouro de qualquer mensagem com gold/goldLocked no 1º nível; frame só mexe em xp/nível', () => {
    const x = T.trAnotar({}, RESUME, 1000);
    T.trAnotar(x, { type: 'market_execute_result', data: { requestId: 'r', gold: 5000000, goldLocked: 120000 } }, 2000);
    assert.deepStrictEqual([x.conta.ouro, x.conta.trav, x.conta.tOuro, x.conta.nome], [5000000, 120000, 2000, 'Conta']);
    T.trAnotar(x, { type: 'depot_result', data: { entries: [], gold: 4900000 } }, 3000);
    assert.deepStrictEqual([x.conta.ouro, x.conta.trav], [4900000, 120000]);
    T.trAnotar(x, { type: 'frame', data: { gold: 1, state: { character: { xp: '257200000', level: 251 } } } }, 4000);
    assert.deepStrictEqual([x.conta.ouro, x.conta.xp, x.conta.nivel], [4900000, 257200000, 251]);
    T.trAnotar(x, { type: 'invasion_update', data: { invasao: { inscrito: false, encerrada: false } } }, 5000);
    assert.strictEqual(x.invasao.inscrito, false);
    T.trAnotar(x, { type: 'selo_state', data: { ativo: true, selos: [{ huntId: 222, pactos: [], ligado: false }] } }, 6000);
    T.trAnotar(x, { type: 'ampulheta_state', data: { vocacoes: { KNIGHT: { hojeMs: 36e5 } }, resetEm: 9e12 } }, 7000);
    assert.strictEqual(x.selo.selos[0].huntId, 222); assert.strictEqual(x.ampulheta.vocacoes.KNIGHT.hojeMs, 36e5);
});
t('trAnotar: welcome de OUTRA conta zera o que era da anterior; mensagem estranha não quebra', () => {
    const x = T.trAnotar({}, RESUME, 1000);
    T.trAnotar(x, { type: 'selo_state', data: { ativo: true, selos: [] } }, 1500);
    T.trAnotar(x, { type: 'welcome', data: { account: { name: 'Outra', level: 121, gold: 7 } } }, 2000);
    assert.deepStrictEqual([x.conta.nome, x.conta.nivel, x.conta.ouro], ['Outra', 121, 7]);
    assert(!x.bencaos && !x.ilhas && !x.invasao && !x.selo, Object.keys(x).join());
    for (const o of [null, {}, { type: 'x' }, { type: 'x', data: 3 }]) assert.strictEqual(T.trAnotar(x, o, 1), x);
    assert.strictEqual(T.trAnotar(null, RESUME, 1), null);
});
t('trFotoVazia: ouroTravado e depositoLido no formato canônico', () => {
    const fv = T.trFotoVazia();
    assert.strictEqual(fv.ouroTravado, null); assert.strictEqual(fv.depositoLido, false);
});
// ── Freio e perfis do topo (puros)
t('trFreioTopo: sem leitura ou outra conta → tudo; < 6 h nada; 6–24 h só o leaderboard; > 24 h tudo', () => {
    const h = 36e5, agora = 1.8e12;
    assert.deepStrictEqual(T.trFreioTopo(null, agora, true), { lerLb: true, lerPerfis: true });
    assert.deepStrictEqual(T.trFreioTopo({ t: agora - h, tPerfis: agora - h }, agora, false), { lerLb: true, lerPerfis: true });
    assert.deepStrictEqual(T.trFreioTopo({ t: agora - h, tPerfis: agora - h }, agora, true), { lerLb: false, lerPerfis: false });
    assert.deepStrictEqual(T.trFreioTopo({ t: agora - 7 * h, tPerfis: agora - 7 * h }, agora, true), { lerLb: true, lerPerfis: false });
    assert.deepStrictEqual(T.trFreioTopo({ t: agora - 25 * h, tPerfis: agora - 25 * h }, agora, true), { lerLb: true, lerPerfis: true });
});
t('trFreioTopo: leitura sem perfil visível (tPerfisParcial) espera só 1 h — e reler perfis relê o leaderboard', () => {
    const h = 36e5, agora = 1.8e12;
    assert.deepStrictEqual(T.trFreioTopo({ t: agora - 0.5 * h, tPerfisParcial: agora - 0.5 * h }, agora, true), { lerLb: false, lerPerfis: false });
    assert.deepStrictEqual(T.trFreioTopo({ t: agora - 2 * h, tPerfisParcial: agora - 2 * h }, agora, true), { lerLb: true, lerPerfis: true });
    // perfis bons de 3 h + tentativa parcial depois: os bons valem 24 h
    assert.deepStrictEqual(T.trFreioTopo({ t: agora - 2 * h, tPerfis: agora - 3 * h, tPerfisParcial: agora - 2 * h }, agora, true), { lerLb: false, lerPerfis: false });
});
t('trPerfisDepois: nada lido → ficam os de antes (mesma conta), parcial; completa → valem os novos (resumidos), tPerfis = agora', () => {
    const salvo = { perfis: [{ nivel: 300, voc: { KNIGHT: { head: 'Zaoan helmet' } } }], tPerfis: 100 };
    const novo = { name: 'A', level: 320, equipmentVisible: true, characters: [{ vocation: 'KNIGHT', equipment: { feet: { name: 'guardian boots', id: 1 } } }] };
    assert.deepStrictEqual(T.trPerfisDepois(salvo, true, { lidos: 0, visiveis: 0, parou: null, novos: [] }, 999), { perfis: salvo.perfis, tPerfis: 100, tPerfisParcial: 999 });
    assert.deepStrictEqual(T.trPerfisDepois(salvo, false, { lidos: 0, visiveis: 0, parou: null, novos: [] }, 999), { perfis: [], tPerfis: null, tPerfisParcial: 999 });
    assert.deepStrictEqual(T.trPerfisDepois(salvo, true, { lidos: 25, visiveis: 1, parou: null, novos: [novo] }, 999),
        { perfis: [{ nivel: 320, voc: { KNIGHT: { boots: 'guardian boots' } } }], tPerfis: 999, tPerfisParcial: null });
    assert.deepStrictEqual(T.trPerfisDepois(salvo, true, { lidos: 25, visiveis: 0, parou: null, novos: [] }, 999), { perfis: [], tPerfis: 999, tPerfisParcial: null });
});
t('trPerfisDepois: leitura que parou (cancelada/erro) JUNTA os novos com os antigos, sem repetir; tPerfis fica, parcial = agora', () => {
    const a1 = { nivel: 300, voc: { KNIGHT: { head: 'Zaoan helmet' } } }, a2 = { nivel: 350, voc: { DRUID: { armor: 'magma coat' } } };
    const salvo = { perfis: [a1, a2], tPerfis: 100 };
    const novo = { name: 'B', level: 387, equipmentVisible: true, characters: [{ vocation: 'PALADIN', equipment: { weapon: { name: 'living vine bow' } } }] };
    const r = T.trPerfisDepois(salvo, true, { lidos: 2, visiveis: 1, parou: 'cancelado', novos: [novo] }, 999);
    assert.strictEqual(r.perfis.length, 3); assert.deepStrictEqual([r.tPerfis, r.tPerfisParcial], [100, 999]);
    assert.deepStrictEqual(r.perfis[0], { nivel: 387, voc: { PALADIN: { weapon: 'living vine bow' } } });
    // o mesmo perfil (nível + itens) relido não duplica; outra conta não herda os antigos
    const igual = { name: 'C', level: 300, characters: [{ vocation: 'KNIGHT', equipment: { head: { name: 'Zaoan helmet' } } }] };
    assert.strictEqual(T.trPerfisDepois(salvo, true, { lidos: 1, visiveis: 1, parou: 'sem resposta', novos: [igual] }, 999).perfis.length, 2);
    assert.deepStrictEqual(T.trPerfisDepois(salvo, false, { lidos: 1, visiveis: 1, parou: 'cancelado', novos: [novo] }, 999).perfis.length, 1);
    // parou sem nenhum visível: ficam os antigos
    assert.deepStrictEqual(T.trPerfisDepois(salvo, true, { lidos: 3, visiveis: 0, parou: 'sem resposta', novos: [] }, 999), { perfis: [a1, a2], tPerfis: 100, tPerfisParcial: 999 });
    // limite de 25
    const muitos = { perfis: Array.from({ length: 30 }, (_, k) => ({ nivel: 260 + k, voc: { KNIGHT: { head: 'h' + k } } })), tPerfis: 100 };
    assert.strictEqual(T.trPerfisDepois(muitos, true, { lidos: 1, visiveis: 1, parou: 'cancelado', novos: [novo] }, 999).perfis.length, 25);
});
// ── Task 16: tela e botões (partes puras: trAcaoInfo, trCasaResposta, trPlanoCompra, trIdadePt)
const TIPOS_DO_CODIGO = (() => { // todo `tipo: '…'` literal que os especialistas emitem (o trecho puro inteiro)
    const trecho = src.slice(i, f), tipos = new Set();
    for (const m of trecho.matchAll(/tipo: '([a-z-]+)'/g)) tipos.add(m[1]);
    return tipos;
})();
t('trAcaoInfo: conhece TODO tipo de ação do código dos especialistas, e só eles', () => {
    assert(TIPOS_DO_CODIGO.size >= 20, [...TIPOS_DO_CODIGO].join());
    for (const tp of TIPOS_DO_CODIGO) assert(T.trAcaoInfo({ tipo: tp }, T.trFotoVazia()), 'sem trAcaoInfo: ' + tp);
    assert.deepStrictEqual(Object.keys(T.TR_ACAO_ROTULO).sort(), [...TIPOS_DO_CODIGO].sort(), 'rótulo de tipo que ninguém emite (ou faltando)');
    assert.strictEqual(T.trAcaoInfo({ tipo: 'qualquer' }, null), null); assert.strictEqual(T.trAcaoInfo(null, null), null);
});
t('trAcaoInfo: os tipos que saem do trRodar nas 3 fotos e em fotos sintéticas são todos conhecidos', () => {
    const vistos = new Set();
    const anota = (r) => { for (const c of r.todos.concat(r.passos)) if (c && c.acao) { vistos.add(c.acao.tipo); assert(T.trAcaoInfo(c.acao, null), 'desconhecido: ' + c.acao.tipo + ' (' + c.id + ')'); } };
    for (const ft of Object.values(FOTOS)) anota(T.trRodar(ft, T.TR_BASE));
    const sinteticas = [
        foto({ nivel: 262, premium: { ativo: false }, hunt: huntSN({ lure: 2 }), medidoAtual: { xpH: 540000, min: 10, ouroH: -100000, abatesH: 900 }, ouroLivre: 200000,
               sessoes: [{ huntId: 1, durMin: 30, xpH: 540000, morte: false }], prey: { huntId: 99, buffs: {}, wildcards: 9 },
               invasao: { inscrito: false }, chaves: { usadas: 10, max: 10, elites: [{ nome: 'Viscous', qtd: 3 }] } }),
        foto({ nivel: 330, deposito: { "timira's scale": 5 }, forja: { abaixo4: [{ voc: 'KNIGHT', slot: 'armor', nome: 'magma coat', refino: 1, custo: 300000 }], idadeH: 40, basesParadas: [{ nome: 'x', potencia: 450 }] } }),
        fItens({ deposito: { 'spectral conch': 4 }, precos: { 'Spectral Conch': 300000 } }),
        fItens({ deposito: { 'Spectral Conch': 12 } }),
        foto({ nivel: 250, hunt: huntSN(), selo: { ativo: false, abundante: 3 }, legado: { KNIGHT: { skill: 64, marcoAtual: 1, proxMarco: 65, falta: 1, bonusAtual: 2, bonusProx: 5 } } }),
        T.trFotoVazia()
    ];
    for (const ft of sinteticas) anota(T.trRodar(ft, T.TR_BASE));
    for (const tp of ['ir-mapa', 'abrir-loja', 'ler-topo', 'abrir-elite', 'invasao', 'boss-trocar', 'comprar-mercado', 'abrir-silas', 'abrir-forja', 'forja-ler', 'ampulheta', 'selo'])
        assert(vistos.has(tp), tp + ' não saiu de nenhuma foto: ' + [...vistos].join());
});
t('trAcaoInfo: abas do helper, telas do jogo e rótulo curto', () => {
    const fv = T.trFotoVazia();
    assert.deepStrictEqual(['abrir-melhorias', 'abrir-equip', 'abrir-aguentar', 'abrir-magia', 'abrir-forja'].map(tp => T.trAcaoInfo({ tipo: tp }, fv)).map(x => [x.modo, x.aba, x.dois]),
        [['aba', 'melhorias', false], ['aba', 'equip', false], ['aba', 'sobreviver', false], ['aba', 'magia', false], ['aba', 'forja', false]]);
    assert.deepStrictEqual(['abrir-loja', 'abrir-elite', 'ampulheta'].map(tp => [T.trAcaoInfo({ tipo: tp }, fv).modo, T.trAcaoInfo({ tipo: tp }, fv).tela]), [['tela', 'loja'], ['tela', 'elite'], ['tela', 'ampulheta']]);
    assert.deepStrictEqual(['ler-topo', 'forja-ler'].map(tp => T.trAcaoInfo({ tipo: tp }, fv).modo), ['helper', 'helper']);
    assert.strictEqual(T.trAcaoInfo({ tipo: 'ir-mapa', huntId: 9, rotulo: 'Ir para Warzone III Crystal Caves' }, fv).rotulo, 'Ir', 'rótulo longo vira o curto');
    assert.strictEqual(T.trAcaoInfo({ tipo: 'lure', huntId: 1, lure: 3, rotulo: 'Lure 3' }, fv).rotulo, 'Lure 3');
});
t('trAcaoInfo: 2 toques no que gasta ou tira da caçada; motivo com a foto de agora', () => {
    const caca = foto({ emHunt: true, hunt: huntSN(), ouro: 1000000, ouroTravado: 400000 });
    assert.strictEqual(T.trAcaoInfo({ tipo: 'ir-mapa', huntId: 5 }, caca).dois, true);
    assert.strictEqual(T.trAcaoInfo({ tipo: 'ir-mapa', huntId: 5 }, foto({ emHunt: false })).dois, false);
    assert.strictEqual(T.trAcaoInfo({ tipo: 'ir-mapa' }, caca).motivo, 'sem mapa');
    // lure: só dentro da MESMA caçada
    assert.strictEqual(T.trAcaoInfo({ tipo: 'lure', huntId: 1, lure: 4 }, caca).motivo, null);
    assert.strictEqual(T.trAcaoInfo({ tipo: 'lure', huntId: 2, lure: 4 }, caca).motivo, 'só dentro da caçada');
    assert.strictEqual(T.trAcaoInfo({ tipo: 'lure', huntId: 1, lure: 4 }, foto({ hunt: huntSN() })).motivo, 'só dentro da caçada');
    // medir: Scan troca de mapa
    assert.deepStrictEqual([T.trAcaoInfo({ tipo: 'medir', alvos: [{ title: 'a', huntId: 1 }] }, caca).dois, T.trAcaoInfo({ tipo: 'medir', alvos: [] }, caca).motivo], [true, 'sem mapa para medir']);
    // prey: wildcards
    const pr = (wc, gratis) => foto({ prey: { wildcards: wc, buffs: { KNIGHT: { tipo: 'xp', tier: 3, gratis } } } });
    assert.strictEqual(T.trAcaoInfo({ tipo: 'prey-escolher', huntId: 1 }, pr(3)).motivo, 'faltam wildcards (3/5)');
    assert.deepStrictEqual([T.trAcaoInfo({ tipo: 'prey-escolher', huntId: 1 }, pr(5)).motivo, T.trAcaoInfo({ tipo: 'prey-escolher', huntId: 1 }, pr(5)).dois], [null, true]);
    assert.deepStrictEqual([T.trAcaoInfo({ tipo: 'prey-trocar', voc: 'KNIGHT' }, pr(0, true)).dois, T.trAcaoInfo({ tipo: 'prey-trocar', voc: 'KNIGHT' }, pr(0, true)).motivo], [false, null], 'sorteio grátis do dia: 1 toque');
    assert.deepStrictEqual([T.trAcaoInfo({ tipo: 'prey-trocar', voc: 'KNIGHT' }, pr(0, false)).dois, T.trAcaoInfo({ tipo: 'prey-trocar', voc: 'KNIGHT' }, pr(0, false)).motivo], [true, 'sem wildcard']);
    assert.strictEqual(T.trAcaoInfo({ tipo: 'prey-trancar', alvo: 'hunt' }, pr(2)).dois, true);
    // bênçãos: o ouro NORMAL (total − travado) paga
    const bc = (c) => foto({ ouro: 1000000, ouroTravado: 400000, bencaos: { tem: 3, total: 7, custoFaltam: c } });
    assert.deepStrictEqual([T.trAcaoInfo({ tipo: 'bencaos' }, bc(500000)).motivo, T.trAcaoInfo({ tipo: 'bencaos' }, bc(700000)).motivo], [null, 'falta ouro']);
    assert.strictEqual(T.trAcaoInfo({ tipo: 'bencaos' }, bc(500000)).dois, true);
    // Selo: com Abundante liga pelo socket (2 toques); sem pacto abre a tela; fora da caçada não
    assert.deepStrictEqual(['modo', 'dois', 'motivo'].map(k => T.trAcaoInfo({ tipo: 'selo', huntId: 1 }, Object.assign({}, caca, { selo: { ativo: false, abundante: 2 } }))[k]), ['jogo', true, null]);
    assert.deepStrictEqual(['modo', 'tela'].map(k => T.trAcaoInfo({ tipo: 'selo', huntId: 1 }, Object.assign({}, caca, { selo: { ativo: false, abundante: null } }))[k]), ['tela', 'selo']);
    assert.strictEqual(T.trAcaoInfo({ tipo: 'selo', huntId: 1 }, foto({ selo: { abundante: 2 } })).motivo, 'só dentro da caçada');
    // Silas: só na cidade; a ilha cobra ouro
    assert.strictEqual(T.trAcaoInfo({ tipo: 'boss-trocar', boss: 'Timira', qtd: 1 }, caca).motivo, 'só na cidade (Silas)');
    assert.deepStrictEqual(['dois', 'cidade', 'motivo'].map(k => T.trAcaoInfo({ tipo: 'boss-trocar', boss: 'Timira', qtd: 1 }, foto({}))[k]), [true, true, null]);
    assert.strictEqual(T.trAcaoInfo({ tipo: 'boss-trocar', boss: 'Timira', qtd: 0 }, foto({})).motivo, 'nada a trocar');
    assert.strictEqual(T.trAcaoInfo({ tipo: 'abrir-silas', ilha: 'marapur' }, foto({ ouro: 9e6 })).motivo, 'falta ouro');
    assert.strictEqual(T.trAcaoInfo({ tipo: 'abrir-silas', ilha: 'marapur' }, foto({ ouro: 11e6 })).motivo, null);
    assert.strictEqual(T.trAcaoInfo({ tipo: 'abrir-silas', ilha: 'marapur' }, caca).motivo, 'só na cidade (Silas)');
    assert.strictEqual(T.trAcaoInfo({ tipo: 'abrir-silas', ilha: 'atlantida' }, foto({})).motivo, 'ilha desconhecida');
    // Mercado: Premium e ouro
    const it = [{ nome: 'Spectral Conch', qtd: 6, preco: 300000 }];
    assert.strictEqual(T.trAcaoInfo({ tipo: 'comprar-mercado', itens: it }, foto({ premium: { ativo: false } })).motivo, 'Mercado só com Premium');
    assert.strictEqual(T.trAcaoInfo({ tipo: 'comprar-mercado', itens: it }, foto({ ouro: 1e6 })).motivo, 'falta ouro');
    assert.deepStrictEqual(['dois', 'motivo'].map(k => T.trAcaoInfo({ tipo: 'comprar-mercado', itens: it }, foto({ ouro: 2e6, premium: { ativo: true } }))[k]), [true, null]);
    assert.strictEqual(T.trAcaoInfo({ tipo: 'comprar-mercado', itens: [] }, foto({})).motivo, 'nada a comprar');
    // grátis: 1 toque
    assert.strictEqual(T.trAcaoInfo({ tipo: 'invasao' }, foto({})).dois, false);
    // sem ouro lido: não bloqueia (o servidor diz insufficient_gold)
    assert.strictEqual(T.trAcaoInfo({ tipo: 'bencaos' }, foto({ bencaos: { custoFaltam: 5e5 } })).motivo, null);
});
t('trCasaResposta: requestId, action do meta_result, erro com/sem requestId e mensagem sem requestId', () => {
    const p = { tipo: 'buy_all_blessings', rid: 'r1', espera: ['meta_result'] };
    assert.strictEqual(T.trCasaResposta(p, { type: 'meta_result', data: { requestId: 'r1', action: 'buy_all_blessings', applied: true } }), 'res');
    assert.strictEqual(T.trCasaResposta(p, { type: 'meta_result', data: { requestId: 'r2', action: 'buy_all_blessings' } }), null, 'outro pedido');
    assert.strictEqual(T.trCasaResposta(p, { type: 'meta_result', data: { action: 'prey_hunt_roll' } }), null, 'outra ação');
    assert.strictEqual(T.trCasaResposta(p, { type: 'meta_result', data: {} }), 'res', 'sem requestId nem action: vale o tipo');
    assert.strictEqual(T.trCasaResposta(p, { type: 'frame', data: {} }), null);
    assert.strictEqual(T.trCasaResposta(p, { type: 'error', data: { code: 'not_in_city', requestId: 'r1' } }), 'erro');
    assert.strictEqual(T.trCasaResposta(p, { type: 'error', data: { code: 'rate_limited', requestId: 'zz' } }), null, 'erro de outro pedido');
    assert.strictEqual(T.trCasaResposta(p, { type: 'error', data: { code: 'insufficient_gold' } }), 'erro', 'erro sem requestId: candidato (o DOM espera 1,2 s)');
    const s = { tipo: 'selo_ligar', rid: null, espera: ['selo_state'], alvo: { huntId: 5 } };
    assert.strictEqual(T.trCasaResposta(s, { type: 'selo_state', data: { ativo: true, selos: [{ huntId: 5, ligado: true }] } }), 'res');
    assert.strictEqual(T.trCasaResposta(s, { type: 'error', data: { code: 'selo_perigo', requestId: 'outro' } }), null);
    assert.strictEqual(T.trCasaResposta(null, { type: 'error', data: {} }), null);
});
t('trPlanoCompra: das mais baratas, teto = preço do conselho + 10 %, sem as minhas nem ordens de compra, dentro do ouro', () => {
    const o = (id, preco, q, side) => ({ id, unitPrice: preco, quantityRemaining: q, side: side || 'SELL' });
    const livros = { 'spectral conch': [o('a', 340000, 2), o('b', 280000, 3), o('c', 320000, 5), o('m', 100000, 9), o('buy', 50000, 9, 'BUY'), o('d', 331000, 9)] };
    const r = T.trPlanoCompra([{ nome: 'Spectral Conch', qtd: 6, preco: 300000 }], livros, 5e6, new Set(['m']));
    assert.deepStrictEqual(r.compras.map(c => [c.orderId, c.quantity, c.unitPrice]), [['b', 3, 280000], ['c', 3, 320000]], 'teto 330.000: a (340k) e d (331k) ficam de fora');
    assert.strictEqual(r.total, 3 * 280000 + 3 * 320000); assert.deepStrictEqual(r.faltam, []);
    const pouco = T.trPlanoCompra([{ nome: 'Spectral Conch', qtd: 6, preco: 300000 }], livros, 1000000, new Set());
    assert.deepStrictEqual(pouco.compras.map(c => [c.orderId, c.quantity]), [['m', 6]], 'ordem minha não está no Set: a mais barata vale');
    const caro = T.trPlanoCompra([{ nome: 'Spectral Conch', qtd: 6, preco: 300000 }], livros, 600000, new Set(['m']));
    assert.deepStrictEqual([caro.compras.map(c => [c.orderId, c.quantity]), caro.faltam], [[['b', 2]], [{ nome: 'Spectral Conch', falta: 4, teto: 330000 }]]);
    assert.deepStrictEqual(T.trPlanoCompra([{ nome: 'Haunted Sigil', qtd: 2, preco: 1 }], livros, 1e9, null).faltam, [{ nome: 'Haunted Sigil', falta: 2, teto: 1 }]);
    assert.deepStrictEqual(T.trPlanoCompra(null, null, null, null), { compras: [], faltam: [], total: 0 });
});
t('trIdadePt e TR_ERRO_PT', () => {
    assert.deepStrictEqual([null, NaN, -1, 0.4, 5.4, 47, 72].map(T.trIdadePt), ['—', '—', '—', '<1 h', '5 h', '47 h', '3 d']);
    for (const c of ['not_in_city', 'too_far', 'insufficient_gold', 'selo_perigo', 'sem_resposta']) assert(T.TR_ERRO_PT[c], c);
});
t('trDecidirClique: o cache dizia 1 toque (Selo sem Abundante → tela), a foto nova pede 2 (selo_ligar cobra/h) → o 1º toque NÃO executa', () => {
    const acao = { tipo: 'selo', huntId: 1 };
    const cache = foto({ emHunt: true, hunt: huntSN(), selo: { ativo: false, abundante: null } });
    const nova = foto({ emHunt: true, hunt: huntSN(), selo: { ativo: false, abundante: 3 } });
    assert.deepStrictEqual([T.trAcaoInfo(acao, cache).modo, T.trAcaoInfo(acao, cache).dois], ['tela', false], 'a tela ligou o botão com 1 toque');
    const d1 = T.trDecidirClique(acao, nova, false);
    assert.strictEqual(d1.executa, false); assert(/confirme de novo/.test(d1.aviso), d1.aviso);
    assert.strictEqual(T.trDecidirClique(acao, nova, undefined).executa, false, 'sem o flag = não confirmado');
    const d2 = T.trDecidirClique(acao, nova, true);
    assert.deepStrictEqual([d2.executa, d2.info.modo, d2.info.dois], [true, 'jogo', true], 'o 2º toque executa');
    // 1 toque de verdade (grátis/tela/aba) não pede confirmação; motivo da foto nova sempre barra; tipo desconhecido não executa
    assert.strictEqual(T.trDecidirClique({ tipo: 'invasao' }, foto({}), false).executa, true);
    assert.strictEqual(T.trDecidirClique({ tipo: 'abrir-equip' }, foto({}), false).executa, true);
    const sem = T.trDecidirClique({ tipo: 'bencaos' }, foto({ ouro: 100, bencaos: { custoFaltam: 5e5 } }), true);
    assert.deepStrictEqual([sem.executa, sem.aviso], [false, 'falta ouro']);
    assert.strictEqual(T.trDecidirClique({ tipo: 'xyz' }, foto({}), true).executa, false);
});
t('trRespostaConfirma: Selo só ligado com o selo DESTA caçada ligado; Invasão só com inscrito === true', () => {
    const selo = (huntId, ligado) => ({ ativo: true, selos: [{ huntId, ligado, pactos: [] }] });
    assert.strictEqual(T.trRespostaConfirma('selo_ligar', selo(222, true), { huntId: 222 }), true);
    assert.strictEqual(T.trRespostaConfirma('selo_ligar', selo('222', true), { huntId: 222 }), true, 'id texto × número');
    assert.strictEqual(T.trRespostaConfirma('selo_ligar', selo(222, false), { huntId: 222 }), false, 'pausado/desligado');
    assert.strictEqual(T.trRespostaConfirma('selo_ligar', selo(176, true), { huntId: 222 }), false, 'o selo ligado é de outra caçada');
    assert.strictEqual(T.trRespostaConfirma('selo_ligar', { ativo: true }, { huntId: 222 }), false);
    assert.strictEqual(T.trRespostaConfirma('invasion_join', { invasao: { inscrito: true } }), true, 'invasion_update');
    assert.strictEqual(T.trRespostaConfirma('invasion_join', { action: 'invasion_join', meta: { invasao: { inscrito: true } } }), true, 'meta_result');
    assert.strictEqual(T.trRespostaConfirma('invasion_join', { invasao: { inscrito: 'sim' } }), false);
    assert.strictEqual(T.trRespostaConfirma('invasion_join', { invasao: { inscrito: false } }), false);
    assert.strictEqual(T.trRespostaConfirma('invasion_join', { action: 'invasion_join', applied: true }), false, 'meta_result sem a Invasão não confirma');
    assert.strictEqual(T.trRespostaConfirma('buy_all_blessings', {}), null, 'sem conferência extra');
    assert(T.TR_ERRO_PT.nao_confirmou);
});
// ── revisão de qualidade da Task 16: respostas empurradas, chave reversível, Invasão "depois do envio" e a compra com Mercado falso
t('trCasaResposta: mensagem empurrada que não confirma é ignorada (outro Selo, Selo pausado, Invasão sem inscrito)', () => {
    const pactos = [{ tier: 3, buff: 'abundante' }];
    const s = { tipo: 'selo_ligar', rid: null, espera: ['selo_state'], alvo: { huntId: 32 } };
    assert.strictEqual(T.trCasaResposta(s, { type: 'selo_state', data: { ativo: true, selos: [{ huntId: 176, ligado: true, pactos }] } }), null, 'outro Selo');
    assert.strictEqual(T.trCasaResposta(s, { type: 'selo_state', data: { ativo: true, selos: [{ huntId: 32, ligado: false, pausa: 'gold', pactos }] } }), null, 'pausado');
    assert.strictEqual(T.trCasaResposta(s, { type: 'selo_state', data: { ativo: true, selos: [{ huntId: 32, ligado: true, pactos }] } }), 'res');
    const i = { tipo: 'invasion_join', rid: 'r9', espera: ['invasion_update', 'meta_result'] };
    assert.strictEqual(T.trCasaResposta(i, { type: 'meta_result', data: { action: 'invasion_join', applied: true } }), null, 'meta_result sem a Invasão');
    assert.strictEqual(T.trCasaResposta(i, { type: 'invasion_update', data: { invasao: { inscrito: false } } }), null);
    assert.strictEqual(T.trCasaResposta(i, { type: 'invasion_update', data: { invasao: { inscrito: true } } }), 'res');
    assert.strictEqual(T.trCasaResposta(i, { type: 'meta_result', data: { requestId: 'r9', action: 'invasion_join', meta: { invasao: { inscrito: true } } } }), 'res');
    assert.strictEqual(T.trCasaResposta(i, { type: 'error', data: { code: 'invasion_unavailable', requestId: 'r9' } }), 'erro', 'erro continua valendo');
});
t('trK: reversível, sem colisão e só com [A-Za-z0-9._-]', () => {
    const ids = ['upar:mapa', 'boss:elite-Viscous Mire', 'boss:elite-Viscous_Mire', "boss:elite-Rat's (x)*!~", 'a%20', 'a ', 'a_20', 'ç/á"<>', ''];
    const ks = ids.map(T.trK);
    assert.strictEqual(new Set(ks).size, ids.length, 'colisão: ' + ks.join(' | '));
    for (let k = 0; k < ids.length; k++) { assert(/^[A-Za-z0-9._-]*$/.test(ks[k]), ks[k]); assert.strictEqual(decodeURIComponent(ks[k].replace(/_/g, '%')), ids[k]); }
    assert.strictEqual(T.trK('mult:selo'), 'mult_3Aselo');
});
t('trInscreveuDepois: só conta a mudança de não-inscrito para inscrito depois do envio', () => {
    assert.strictEqual(T.trInscreveuDepois({ inscrito: false, t: 1 }, { inscrito: true, t: 10 }, 5), true);
    assert.strictEqual(T.trInscreveuDepois({ inscrito: true, t: 1 }, { inscrito: true, t: 10 }, 5), false, 'já estava inscrito');
    assert.strictEqual(T.trInscreveuDepois({ inscrito: false, t: 1 }, { inscrito: true, t: 4 }, 5), false, 'mudou antes do envio');
    assert.strictEqual(T.trInscreveuDepois(null, { inscrito: true, t: 10 }, 5), true);
    assert.strictEqual(T.trInscreveuDepois(null, { inscrito: null, t: 10 }, 5), false);
    assert.strictEqual(T.trInscreveuDepois(null, null, 5), false);
});
// trExecutarCompra é assíncrona: estes testes rodam numa fila e contam no mesmo total (o 'exit' imprime depois deles)
const ta = (nome, fn) => Promise.resolve().then(fn).then(() => { n++; console.log('ok  ', nome); }, e => { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; });
const ordem = (id, preco, q, side) => ({ id, unitPrice: preco, quantityRemaining: q, side: side || 'SELL' });
function mercadoFalso(livro, o) {
    o = o || {};
    let ouro = o.ouro === undefined ? 5e6 : o.ouro, parar = false, listas = 0;
    const enviados = [];
    return { enviados, minhas: new Set(o.minhas || []), rid: () => 'r' + enviados.length, erroTxt: (c) => 'E:' + c, ouro: () => ouro, parar: () => parar,
        pedir: async (tipo, data) => {
            enviados.push([tipo, data]);
            if (tipo === 'market_list') {
                listas++;
                if (o.precoMuda && listas > 1) { const x = livro.find(y => y.id === o.precoMuda); if (x) x.unitPrice += 1000; }
                return { data: { orders: livro.map(x => Object.assign({}, x)) } };
            }
            if (tipo === 'market_execute') {
                if (o.falhaEm === data.orderId) return { erro: 'order_unavailable' };
                const x = livro.find(y => y.id === data.orderId);
                const q = o.parcial ? 1 : data.quantity;
                x.quantityRemaining -= q; ouro -= q * x.unitPrice;
                if (o.pararDepois) parar = true;
                return { data: { trade: { quantity: q } } };
            }
            return { erro: 'tipo inesperado' };
        } };
}
const livroConch = () => [ordem('m', 100000, 9), ordem('b', 280000, 3), ordem('c', 320000, 5), ordem('a', 340000, 2), ordem('buy', 50000, 9, 'BUY')];
const conch = [{ nome: 'Spectral Conch', qtd: 6, preco: 300000 }];
ta('trExecutarCompra: teto + 10 %, sem as minhas, relê o livro antes de CADA compra', async () => {
    const d = mercadoFalso(livroConch(), { minhas: ['m'] });
    const r = await T.trExecutarCompra(conch, d);
    assert.deepStrictEqual(r.feitas.map(c => [c.orderId, c.quantity, c.unitPrice]), [['b', 3, 280000], ['c', 3, 320000]]);
    assert.deepStrictEqual(d.enviados.map(e => e[0]), ['market_list', 'market_list', 'market_execute', 'market_list', 'market_execute']);
    assert.deepStrictEqual([r.parou, r.faltam, r.total], [null, [], 3 * 280000 + 3 * 320000]);
});
ta('trExecutarCompra: erro do jogo para tudo (nunca repete a ordem)', async () => {
    const d = mercadoFalso(livroConch(), { minhas: ['m'], falhaEm: 'b' });
    const r = await T.trExecutarCompra(conch, d);
    assert.deepStrictEqual([r.feitas.length, d.enviados.filter(e => e[0] === 'market_execute').length], [0, 1]);
    assert(/E:order_unavailable/.test(r.parou), r.parou); assert.deepStrictEqual(r.faltam, [{ nome: 'Spectral Conch', falta: 6 }]);
});
ta('trExecutarCompra: MK.parar (parar()) antes da próxima compra', async () => {
    const d = mercadoFalso(livroConch(), { minhas: ['m'], pararDepois: true });
    const r = await T.trExecutarCompra(conch, d);
    assert.deepStrictEqual([r.feitas.map(c => c.orderId), r.parou], [['b'], 'parado por você']);
    assert.strictEqual(d.enviados.filter(e => e[0] === 'market_execute').length, 1);
});
ta('trExecutarCompra: preço mudou na releitura → não compra aquela; quantidade real do trade; ouro desconhecido → nada', async () => {
    let d = mercadoFalso(livroConch(), { minhas: ['m'], precoMuda: 'b' });
    let r = await T.trExecutarCompra(conch, d);
    assert.deepStrictEqual(r.feitas.map(c => [c.orderId, c.quantity]), [['c', 3]]); assert.deepStrictEqual(r.faltam, [{ nome: 'Spectral Conch', falta: 3 }]);
    d = mercadoFalso(livroConch(), { minhas: ['m'], parcial: true });
    r = await T.trExecutarCompra(conch, d);
    assert.deepStrictEqual(r.feitas.map(c => [c.orderId, c.quantity, c.total]), [['b', 1, 280000], ['c', 1, 320000]], 'quantidade do trade, não a pedida');
    d = mercadoFalso(livroConch(), { minhas: ['m'], ouro: null });
    r = await T.trExecutarCompra(conch, d);
    assert.deepStrictEqual([r.feitas.length, r.parou, d.enviados.filter(e => e[0] === 'market_execute').length], [0, 'ouro desconhecido', 0]);
});
// revisão final: Invasão recusada (meta_result applied:false) termina a espera com o motivo; ouro ilegível no meio da compra
t('trCasaResposta: meta_result applied:false do invasion_join é a resposta (recusa com motivo), não "não confirma"', () => {
    const i = { tipo: 'invasion_join', rid: 'r9', espera: ['invasion_update', 'meta_result'] };
    const recusa = { type: 'meta_result', data: { requestId: 'r9', action: 'invasion_join', applied: false, notice: { key: 'invasion.closed' } } };
    assert.strictEqual(T.trCasaResposta(i, recusa), 'res');
    assert.strictEqual(T.trCasaResposta(i, { type: 'meta_result', data: { action: 'invasion_join', applied: false } }), 'res', 'sem requestId também');
    assert.strictEqual(T.trCasaResposta(i, { type: 'meta_result', data: { requestId: 'outro', action: 'invasion_join', applied: false } }), null, 'recusa de outro pedido');
    assert.strictEqual(T.trCasaResposta(i, { type: 'meta_result', data: { action: 'prey_hunt_roll', applied: false } }), null, 'recusa de outra ação');
    assert.strictEqual(T.trCasaResposta(i, { type: 'meta_result', data: { action: 'invasion_join', applied: true } }), null, 'aplicado sem inscrito segue esperando');
});
ta('trExecutarCompra: ouro some no meio → "ouro desconhecido — parei" (não "o ouro acabou")', async () => {
    const d = mercadoFalso(livroConch(), { minhas: ['m'] });
    let chamadas = 0;
    const ouroReal = d.ouro;
    d.ouro = () => (++chamadas > 1 ? null : ouroReal());
    const r = await T.trExecutarCompra(conch, d);
    assert.deepStrictEqual([r.feitas.length, r.parou, d.enviados.filter(e => e[0] === 'market_execute').length], [0, 'ouro desconhecido — parei', 0]);
    const d2 = mercadoFalso(livroConch(), { minhas: ['m'] });
    let c2 = 0; d2.ouro = () => (++c2 > 1 ? 1000 : 5e6);
    assert.strictEqual((await T.trExecutarCompra(conch, d2)).parou, 'o ouro acabou', 'ouro conhecido e baixo continua "acabou"');
});
t('trCacheVelho: passou o prazo ou a foto não tinha a conta (lobby/F5) → recalcula', () => {
    const conta = { nivel: 251 };
    assert.strictEqual(T.trCacheVelho(null, 1000, 60000), true);
    assert.strictEqual(T.trCacheVelho({ t: 1000, foto: conta }, 30000, 60000), false);
    assert.strictEqual(T.trCacheVelho({ t: 1000, foto: conta }, 70000, 60000), true, 'prazo');
    assert.strictEqual(T.trCacheVelho({ t: 1000, foto: { nivel: null } }, 2000, 60000), true, 'aberto no lobby');
    assert.strictEqual(T.trCacheVelho({ t: 1000, foto: T.trFotoVazia() }, 2000, Infinity), true, 'o vigia de 4 s repinta até a conta chegar');
    assert.strictEqual(T.trCacheVelho({ t: 1000, foto: conta }, 9e9, Infinity), false);
});
process.on('exit', () => { if (!process.exitCode) console.log(`\n${n} testes ok`); });

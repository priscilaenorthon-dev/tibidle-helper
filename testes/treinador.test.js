// Roda: node testes/treinador.test.js
// 2.67.0 — treinador (aba Progresso): especialistas puros e o chefe.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const i = src.indexOf('/* @@TREINADOR-PURO-INICIO'), f = src.indexOf('/* @@TREINADOR-PURO-FIM');
assert(i > 0 && f > i, 'trecho @@TREINADOR-PURO não encontrado');
const T = new Function(src.slice(i, f) + '\nreturn { TR_BASE, TR_AGENTES, trConselho, trOrdenar, trRodar, trFotoVazia, trCacada, trAgenteUpar, trAgenteMult };')();
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

// ── Task 4: Onde upar
t('upar: atual 540k × Summer Court medido 650k → ir-mapa com +20,4 %', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { xpH: 540000 },
        mapas: [mapa(1, 'Shadow Nexus', 540000), mapa(2, 'Summer Court', 650000), mapa(3, 'Ice Portal', 300000)] });
    const ir = acoes(T.trAgenteUpar(f, T.TR_BASE), 'ir-mapa');
    assert.strictEqual(ir.length, 1); const c = ir[0];
    assert(Math.abs(c.impacto - 20.37) < 0.1, String(c.impacto));
    assert.strictEqual(c.acao.huntId, 2); assert(c.acao.rotulo); assert.strictEqual(c.confianca, 'medido'); assert.strictEqual(c.estado, 'aviso');
    assert(/Summer Court/.test(c.titulo) && /\+20 %/.test(c.titulo) && c.titulo.length <= 70, c.titulo);
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
    const ir = acoes(T.trAgenteUpar(f, T.TR_BASE), 'ir-mapa');
    assert.deepStrictEqual(ir.map(c => c.acao.huntId), [4]);
});
t('upar: mapa acima do nível não entra', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { xpH: 540000 },
        mapas: [mapa(1, 'Shadow Nexus', 540000), mapa(5, 'Ruins of Nuur', 900000, { levelMin: 300 })] });
    assert.strictEqual(acoes(T.trAgenteUpar(f, T.TR_BASE), 'ir-mapa').length, 0);
});
t('upar: lure abaixo do máximo sem morte nas 2 últimas sessões → subir 1 degrau', () => {
    const s = (morte) => ({ hunt: 'Shadow Nexus', huntId: 1, dur: 60, xpH: 500000, ouroH: 0, morte });
    const base = { nivel: 238, hunt: huntSN({ lure: 2 }), mapas: [mapa(1, 'Shadow Nexus', 540000)] };
    let l = acoes(T.trAgenteUpar(foto(Object.assign({ sessoes: [s(true), s(false), s(false)] }, base)), T.TR_BASE), 'lure');
    assert.strictEqual(l.length, 1); assert.strictEqual(l[0].acao.lure, 3); assert.strictEqual(l[0].acao.huntId, 1);
    assert.strictEqual(l[0].impacto, 8); assert(/Subir a lure para 3/.test(l[0].titulo));
    l = acoes(T.trAgenteUpar(foto(Object.assign({ sessoes: [s(false), s(true), s(false)] }, base)), T.TR_BASE), 'lure');
    assert.strictEqual(l.length, 0, 'morte numa das 2 últimas');
    l = acoes(T.trAgenteUpar(foto(Object.assign({}, base, { hunt: huntSN({ lure: 4 }) })), T.TR_BASE), 'lure');
    assert.strictEqual(l.length, 0, 'já no máximo: nunca baixar');
});
t('upar: lure numa caçada limitada por dano rende metade', () => {
    const f = foto({ nivel: 238, hunt: huntSN({ lure: 2 }), medidoAtual: { xpH: 540000, abatesH: 300 }, mapas: [mapa(1, 'Shadow Nexus', 540000)] });
    assert.strictEqual(acoes(T.trAgenteUpar(f, T.TR_BASE), 'lure')[0].impacto, 4);
});
t('upar: mapa de ilha fechada não vira ir-mapa; vira "Abrir <ilha>" sem ação', () => {
    for (const extra of [{ ilhas: [] , fechado: { aberta: false } }, { ilhas: [{ nome: 'Dream Courts', aberta: false }], fechado: { aberta: undefined } }]) {
        const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { xpH: 540000 }, ilhas: extra.ilhas,
            mapas: [mapa(1, 'Shadow Nexus', 540000), mapa(2, 'Summer Court', 650000, extra.fechado)] });
        const cs = T.trAgenteUpar(f, T.TR_BASE);
        assert.strictEqual(acoes(cs, 'ir-mapa').length, 0);
        const ab = cs.find(c => /^Abrir Dream Courts/.test(c.titulo));
        assert(ab, cs.map(c => c.titulo).join(' | ')); assert.strictEqual(ab.acao, null); assert(ab.impacto > 0 && ab.impacto <= 5);
    }
});
t('upar: sem medida, o melhor da faixa (maior Rec ≤ nível) em ilha fechada → "Abrir Issavi"', () => {
    const f = foto({ nivel: 238, ilhas: [{ id: 'issavi', aberta: false }] });
    const ab = T.trAgenteUpar(f, T.TR_BASE).find(c => /^Abrir/.test(c.titulo));
    assert(ab && /Issavi/.test(ab.titulo) && /Kilmaresh Catacombs/.test(ab.titulo), ab && ab.titulo);
});
t('upar: já no melhor mapa medido → estado ok e sem ir-mapa', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { xpH: 650000 },
        mapas: [mapa(1, 'Shadow Nexus', 650000), mapa(2, 'Summer Court', 600000)] });
    const cs = T.trAgenteUpar(f, T.TR_BASE);
    assert.strictEqual(acoes(cs, 'ir-mapa').length, 0);
    assert(cs.some(c => c.estado === 'ok' && /melhor mapa/.test(c.titulo)));
});
t('upar: sem nenhum mapa medido → "Medir mapas da sua faixa" com até 3 caçadas da faixa', () => {
    const cs = T.trAgenteUpar(foto({ nivel: 238, mapas: [{ id: 77, title: 'Kilmaresh Catacombs', levelMin: 200, aberta: true }] }), T.TR_BASE);
    const m = acoes(cs, 'medir')[0];
    assert(m, cs.map(c => c.titulo).join(' | '));
    assert(m.acao.titulos.length >= 1 && m.acao.titulos.length <= 3);
    assert(m.acao.titulos.includes('Kilmaresh Catacombs')); assert.deepStrictEqual(m.acao.huntIds, [77]);
    for (const h of m.acao.titulos) { const c = T.trCacada(h); assert(!c.rec || c.rec <= 238, h); }
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
const DIA = 864e5;
const preyDe = (buffs, extra) => Object.assign({ huntId: 1, wildcards: 10, buffs }, extra || {});
const buff = (tipo, tier, extra) => Object.assign({ tipo, tier, locked: true, msLeft: 3600e3, huntId: 1 }, extra || {});
t('mult: Premium desligado → abrir-loja, impacto = premium ÷ (100 + party), wiki, custo 0', () => {
    const cs = T.trAgenteMult(foto({ nivel: 238, premium: { ativo: false } }), T.TR_BASE);
    const c = acoes(cs, 'abrir-loja')[0];
    assert(c && /Premium/.test(c.titulo)); assert.strictEqual(c.confianca, 'wiki'); assert.strictEqual(c.custo, 0);
    assert(Math.abs(c.impacto - T.TR_BASE.xp.premium / (100 + T.TR_BASE.xp.party) * 100) < 1e-9);
    assert.strictEqual(acoes(T.trAgenteMult(foto({ nivel: 238, premium: { ativo: true } }), T.TR_BASE), 'abrir-loja').length, 0);
});
t('mult: prey em outro mapa → prey-escolher com a caçada atual (5 wildcards no texto)', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), prey: preyDe({ KNIGHT: buff('exp', 5) }, { huntId: 9 }) });
    const c = acoes(T.trAgenteMult(f, T.TR_BASE), 'prey-escolher')[0];
    assert(c); assert.strictEqual(c.acao.huntId, 1); assert(/5 wildcards/.test(c.porque)); assert(c.impacto > 0);
    assert.strictEqual(acoes(T.trAgenteMult(foto({ nivel: 238, hunt: huntSN(), prey: preyDe({ KNIGHT: buff('exp', 5) }) }), T.TR_BASE), 'prey-escolher').length, 0);
});
t('mult: caçada limitada por spawn → prey de DANO vira EXP', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { xpH: 540000, abatesH: 1300 }, // teto 340 × 4 = 1360; 1300 ≥ 85 %
        prey: preyDe({ KNIGHT: buff('dano', 5), DRUID: buff('exp', 5) }) });
    const tr = acoes(T.trAgenteMult(f, T.TR_BASE), 'prey-trocar');
    assert.deepStrictEqual(tr.map(c => c.acao.voc), ['KNIGHT']); assert(/EXP/.test(tr[0].titulo) && /Cavaleiro/.test(tr[0].titulo), tr[0].titulo);
    assert(Math.abs(tr[0].impacto - 5 / 200 * 100) < 1e-9); // EXP ★5 = +5 % ÷ (100 + 100)
});
t('mult: caçada limitada por dano → prey de EXP vira DANO', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { xpH: 540000, abatesH: 500 },
        prey: preyDe({ KNIGHT: buff('exp', 5), PALADIN: buff('dano', 5) }) });
    const tr = acoes(T.trAgenteMult(f, T.TR_BASE), 'prey-trocar');
    assert.deepStrictEqual(tr.map(c => c.acao.voc), ['KNIGHT']); assert(/DANO/.test(tr[0].titulo));
    assert(Math.abs(tr[0].impacto - (4 * 5 / 4 - 5 / 2)) < 1e-9); // DANO ★5 = 20 % de 1 dos 4 → 5; menos o EXP ★5 (2,5)
});
t('mult: sem abates medidos não opina no tipo; defesa de quem morreu fica', () => {
    let f = foto({ nivel: 238, hunt: huntSN(), prey: preyDe({ KNIGHT: buff('loot', 5) }) });
    assert.strictEqual(acoes(T.trAgenteMult(f, T.TR_BASE), 'prey-trocar').length, 0);
    f = foto({ nivel: 238, hunt: huntSN(), medidoAtual: { abatesH: 1300 }, mortes: [{ t: 1.8e12 - DIA, hunt: 'Shadow Nexus', voc: 'DRUID' }],
        prey: preyDe({ DRUID: buff('defesa', 5) }) });
    assert.strictEqual(acoes(T.trAgenteMult(f, T.TR_BASE), 'prey-trocar').length, 0);
});
t('mult: tier 6 destravada com tempo → trancar; travada, tier 10 ou sem tempo → nada', () => {
    const base = { nivel: 238, hunt: huntSN(), medidoAtual: { abatesH: 1300 } };
    let tc = acoes(T.trAgenteMult(foto(Object.assign({ prey: preyDe({ SORCERER: buff('exp', 6, { locked: false }) }) }, base)), T.TR_BASE), 'prey-trancar');
    assert.strictEqual(tc.length, 1); assert.strictEqual(tc[0].acao.voc, 'SORCERER'); assert(/tier 6/.test(tc[0].titulo)); assert.strictEqual(tc[0].impacto, 2);
    for (const b of [buff('exp', 6), buff('exp', 10, { locked: false }), buff('exp', 6, { locked: false, msLeft: 0 })]) {
        tc = acoes(T.trAgenteMult(foto(Object.assign({ prey: preyDe({ SORCERER: b }) }, base)), T.TR_BASE), 'prey-trancar');
        assert.strictEqual(tc.length, 0, JSON.stringify(b));
    }
});
t('mult: bênçãos faltando + morte recente → custo = total(250) e impacto > 0', () => {
    const f = foto({ nivel: 250, xpTotal: 254e6, hunt: huntSN(), medidoAtual: { xpH: 540000 }, bencaos: { tem: 0, total: 7 },
        mortes: [{ t: 1.8e12 - 2 * DIA, hunt: 'Shadow Nexus', voc: 'DRUID' }] });
    const c = acoes(T.trAgenteMult(f, T.TR_BASE), 'bencaos')[0];
    assert(c, 'sem conselho'); assert.strictEqual(c.custo, T.TR_BASE.bencaos.total(250)); assert(c.impacto > 0); assert.strictEqual(c.confianca, 'wiki');
    assert(c.titulo.length <= 70 && /bênçãos/.test(c.titulo), c.titulo);
});
t('mult: bênçãos — sem morte em 7 dias, já com as 7 ou abaixo do 120 → nada', () => {
    const base = { nivel: 250, xpTotal: 254e6, hunt: huntSN(), medidoAtual: { xpH: 540000 }, bencaos: { tem: 0, total: 7 } };
    for (const o of [{}, { mortes: [{ t: 1.8e12 - 10 * DIA, hunt: 'Shadow Nexus', voc: 'DRUID' }] },
        { bencaos: { tem: 7, total: 7 }, mortes: [{ t: 1.8e12 - DIA }] }, { nivel: 100, mortes: [{ t: 1.8e12 - DIA }] }]) {
        assert.strictEqual(acoes(T.trAgenteMult(foto(Object.assign({}, base, o)), T.TR_BASE), 'bencaos').length, 0, JSON.stringify(o));
    }
    // morte na medida do mapa atual também conta
    const f = foto(Object.assign({}, base, { mapas: [mapa(1, 'Shadow Nexus', 540000, { mortes: 1 })] }));
    assert.strictEqual(acoes(T.trAgenteMult(f, T.TR_BASE), 'bencaos').length, 1);
});
t('mult: Selo desligado em caçada de XP → custo/h no título, ação selo, wiki', () => {
    const f = foto({ nivel: 238, hunt: huntSN(), selo: { ativo: false, abundante: null } });
    const c = acoes(T.trAgenteMult(f, T.TR_BASE), 'selo')[0];
    assert(c); assert.strictEqual(c.acao.huntId, 1); assert.strictEqual(c.confianca, 'wiki');
    assert(Math.abs(c.impacto - 4 / 200 * 100) < 1e-9);
    const hora = 100 * Math.round(T.TR_BASE.selo.rolar(250) * 43 / 1000); // 1 pacto T1 (peso 4,3)
    assert.strictEqual(c.custo, hora); assert(/mil\/h/.test(c.titulo) && c.titulo.length <= 70, c.titulo);
    assert.strictEqual(acoes(T.trAgenteMult(foto({ nivel: 238, hunt: huntSN(), selo: { ativo: true } }), T.TR_BASE), 'selo').length, 0);
});
t('mult: foto vazia → nenhum conselho; registrado em TR_AGENTES', () => {
    assert.deepStrictEqual(T.trAgenteMult(T.trFotoVazia(), T.TR_BASE), []);
    assert(T.TR_AGENTES.some(a => a.id === 'mult' && a.rodar === T.trAgenteMult && a.icone === '✕'));
});

process.on('exit', () => { if (!process.exitCode) console.log(`\n${n} testes ok`); });

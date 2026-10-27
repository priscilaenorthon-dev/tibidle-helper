// Roda: node testes/evento.test.js
// Aba Evento (2.30.0, Halloween 2026 — TEMPORÁRIA): extrai o bloco @@EVENTO-PURO e confere as contas lidas do cliente do jogo
// (tempo de acesso restante, custo e alcance das ofertas, máximo comprável, ritmo de abóboras e janela do evento).
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const M = new Function(trecho('/* @@EVENTO-PURO-INICIO */', '/* @@EVENTO-PURO-FIM */') + '\nreturn { evMontarHunt, EV_HUNT_TITULO, EV_MONSTROS, evErroTexto, evRestanteMs, evJanela, evCustoDe, evMaxCompravel, evSaldoAboboras, evAlcance, evTaxaAboboras, evTempoPara, EV_ERROS };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
const ABOBORA = 100400;
const saldo = (abob, gold, coins) => ({ saldoAboboras: [{ itemId: ABOBORA, quantity: abob }], gold, coins, goldLocked: 0 });
const ofGold = { id: 'o1', itemId: 1, name: 'Pumpkin Box', category: 'Caixas', preco: { modo: 'gold', itens: [{ itemId: ABOBORA, quantity: 10 }], gold: 5000, coins: 0, coinsLastro: 0 } };
const ofCot = { id: 'o2', itemId: 2, name: 'Addon', category: 'Outfit', preco: { modo: 'gold', itens: [{ itemId: ABOBORA, quantity: 40 }], gold: 0, coins: 0, coinsLastro: 10 }, goldCalculado: 120000 };
const ofCoins = { id: 'o3', itemId: 3, name: 'Montaria', category: 'Montaria', preco: { modo: 'coins', itens: [{ itemId: ABOBORA, quantity: 60 }], gold: 0, coins: 50, coinsLastro: 0 } };

t('acesso restante como o cliente (IP): saldo − consumido desde consumindoDesde, limitado pelo prazo', () => {
    const t0 = Date.parse('2026-10-27T12:00:00Z');
    assert.strictEqual(M.evRestanteMs({ saldoMs: 3600000, consumindoDesde: null, limite: null }, t0), 3600000);
    assert.strictEqual(M.evRestanteMs({ saldoMs: 3600000, consumindoDesde: '2026-10-27T11:30:00Z', limite: null }, t0), 1800000);
    assert.strictEqual(M.evRestanteMs({ saldoMs: 3600000, consumindoDesde: '2026-10-27T11:30:00Z', limite: '2026-10-27T12:10:00Z' }, t0), 600000, 'o prazo (limite) corta antes do saldo');
    assert.strictEqual(M.evRestanteMs({ saldoMs: 1000, consumindoDesde: '2026-10-27T11:00:00Z', limite: null }, t0), 0, 'nunca negativo');
    assert.strictEqual(M.evRestanteMs(null, t0), null);
});
t('janela do evento: só o item tipo halloween com lojaId, dentro de inicioMs..fimMs', () => {
    const ag = { nowMs: 100, visiveis: [{ id: 'h', tipo: 'halloween', inicioMs: 50, fimMs: 200, params: { lojaId: 'halloween_2026' } }, { id: 'x', tipo: 'dismantle_hot_time', inicioMs: 0, fimMs: 999, params: { percent: 10 } }] };
    assert.deepStrictEqual(M.evJanela(ag, 100), { id: 'h', inicioMs: 50, fimMs: 200, lojaId: 'halloween_2026', acesso: null });
    /* 2.32.0 — a agenda real (27/10) traz o preço e as horas do acesso nos params */
    const real = { visiveis: [{ id: 'c', tipo: 'halloween', inicioMs: 50, fimMs: 200, retaFinalMs: 0, params: { lojaId: 'halloween_26', horas: 3, modo: 'gold', gold: 0, coinsLastro: 0 } }] };
    assert.deepStrictEqual(M.evJanela(real, 100).acesso, { horas: 3, preco: { modo: 'gold', gold: 0, coins: 0, coinsLastro: 0 } });
    assert.strictEqual(M.evJanela(ag, 250), null, 'acabou');
    assert.strictEqual(M.evJanela({ visiveis: [{ tipo: 'halloween', inicioMs: 0, fimMs: 999, params: {} }] }, 100), null, 'sem lojaId não vale');
    assert.strictEqual(M.evJanela(null, 100), null);
});
t('custo da oferta: abóboras = Σ itens; gold fixo, gold pela cotação (coinsLastro > 0 → goldCalculado) ou coins', () => {
    assert.deepStrictEqual(M.evCustoDe(ofGold), { aboboras: 10, ouro: 5000, coins: 0, pelaCotacao: false });
    assert.deepStrictEqual(M.evCustoDe(ofCot), { aboboras: 40, ouro: 120000, coins: 0, pelaCotacao: true });
    assert.deepStrictEqual(M.evCustoDe(ofCoins), { aboboras: 60, ouro: 0, coins: 50, pelaCotacao: false });
});
t('máximo comprável (Iw do cliente): o menor entre abóboras/qtd e gold/preço (ou coins/preço); 0 quando não chega', () => {
    assert.strictEqual(M.evMaxCompravel(ofGold, saldo(35, 12000, 0)), 2, 'abóboras dão 3, gold dá 2');
    assert.strictEqual(M.evMaxCompravel(ofGold, saldo(9, 999999, 0)), 0);
    assert.strictEqual(M.evMaxCompravel(ofCot, saldo(80, 130000, 0)), 1, 'gold pela cotação');
    assert.strictEqual(M.evMaxCompravel(ofCoins, saldo(600, 0, 120)), 2, 'coins');
    assert.strictEqual(M.evMaxCompravel(ofCoins, saldo(600, 0, 0)), 0);
    assert.strictEqual(M.evMaxCompravel({ preco: { modo: 'gold', itens: [], gold: 0 } }, saldo(0, 0, 0)), 999, 'oferta sem custo: o teto do cliente');
});
t('alcance: chega, e o que falta de abóboras/gold/coins para UMA unidade', () => {
    const a = M.evAlcance(ofGold, saldo(4, 1000, 0));
    assert.strictEqual(a.chega, false); assert.strictEqual(a.faltaAboboras, 6); assert.strictEqual(a.faltaOuro, 4000); assert.strictEqual(a.faltaCoins, 0); assert.strictEqual(a.max, 0);
    const b = M.evAlcance(ofCoins, saldo(60, 0, 50));
    assert.strictEqual(b.chega, true); assert.strictEqual(b.max, 1); assert.strictEqual(b.faltaAboboras, 0);
    assert.strictEqual(M.evSaldoAboboras(saldo(7, 0, 0)), 7); assert.strictEqual(M.evSaldoAboboras(null), 0);
});
t('ritmo de abóboras pelo analisador (drops {item: n}, nome sem caixa) e tempo para o que falta', () => {
    const an = { elapsedMs: 1800000, drops: { 'Pumpkin': 15, 'gold coin': 300 } };
    const tx = M.evTaxaAboboras(an, 'pumpkin');
    assert(tx && tx.n === 15 && Math.abs(tx.porHora - 30) < 1e-9, JSON.stringify(tx));
    assert.strictEqual(M.evTaxaAboboras({ elapsedMs: 30000, drops: { Pumpkin: 2 } }, 'Pumpkin'), null, 'menos de 1 min: nada');
    assert.strictEqual(M.evTaxaAboboras(an, null), null);
    assert.strictEqual(M.evTempoPara(45, 30), 1.5); assert.strictEqual(M.evTempoPara(0, 30), 0); assert.strictEqual(M.evTempoPara(10, 0), null);
});
t('erros do jogo em português; código desconhecido passa como está', () => {
    assert.match(M.evErroTexto('access_required'), /acesso do dia/);
    assert.match(M.evErroTexto('loja_preco_subiu'), /cotação/);
    assert.strictEqual(M.evErroTexto('xyz'), 'xyz');
    assert.strictEqual(Object.keys(M.EV_ERROS).length, 10);
});
t('2.32.0 — caçada da estação no formato do /hunts (para a Magia): fichas do bestiário, vida/xp das fichas do acesso, nível do Elite', () => {
    const best = [{ name: 'Lantern Viscount', health: 1200, experience: 696, elements: [{ type: 'COMBAT_HOLYDAMAGE', percent: -25 }, { type: 'COMBAT_EARTHDAMAGE', percent: 100 }] },
                  { name: 'Lanternbone Dragon', health: 8350, experience: 52, elements: [{ type: 'COMBAT_ICEDAMAGE', percent: 90 }] }, null];
    const elite = { name: 'The Lantern Reaper', levelMin: 150, recommendedLevel: 150, keyItem: 'Lantern Reaper Key', keyItemIds: [100576], originHuntId: 263 };
    const h = M.evMontarHunt(263, best, [{ name: 'Lanternbone Dragon', health: 9000 }], elite);
    assert.strictEqual(h.id, 263); assert.strictEqual(h.title, M.EV_HUNT_TITULO); assert.strictEqual(h.recommendedLevel, 150); assert.strictEqual(h.estacao, true);
    assert.deepStrictEqual(h.monsters.map(m => [m.name, m.health, m.weight]), [['Lantern Viscount', 1200, 1], ['Lanternbone Dragon', 9000, 1]], 'a ficha do acesso manda na vida');
    assert.deepStrictEqual(h.monsters[0].elements, [{ type: 'COMBAT_HOLYDAMAGE', percent: -25 }, { type: 'COMBAT_EARTHDAMAGE', percent: 100 }]);
    assert.deepStrictEqual(h.loot, [{ id: 100576, name: 'Lantern Reaper Key', chance: 0, value: 0, slot: null }]);
    assert.strictEqual(M.evMontarHunt(null, best, null, elite), null, 'sem id');
    assert.strictEqual(M.evMontarHunt(263, [], null, null), null, 'sem monstro');
    assert.strictEqual(M.EV_MONSTROS.length, 4);
});

console.log(`\n${n} testes ok`);

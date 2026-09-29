// Roda: node testes/equip.test.js
// Extrai o trecho puro do userscript (entre os marcadores) e testa com as fixtures de 28/09.
const fs = require('fs'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'tibidle-helper.user.js'), 'utf8');
const ini = src.indexOf('/* @@EQUIP-PURO-INICIO */'), fim = src.indexOf('/* @@EQUIP-PURO-FIM */');
assert(ini > 0 && fim > ini, 'marcadores @@EQUIP-PURO não encontrados');
const M = new Function(src.slice(ini, fim) + '\nreturn { PESOS_EQUIP, SLOTS_EQUIP, normalizarSlot, vocacaoPode, pontuarPeca, candidatosEquip, distribuirEquip };')();
const fx = JSON.parse(fs.readFileSync(path.join(raiz, 'data/estado-equip-2026-09-28.json'), 'utf8'));
const lib = JSON.parse(fs.readFileSync(path.join(raiz, 'data/lib-items-2026-09-28.json'), 'utf8'));
const base = {}; for (const [nome, id] of Object.entries(lib.porNome)) { const it = lib.itens[id]; if (it) base[nome] = { id: it.id, attrs: it.attrs || {}, sell: it.sell || 0, equipPreview: it.equipPreview || null }; }
let n = 0; const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };

t('épico com atributos mortos perde para incomum certo (Knight, colar)', () => {
    const epico = { nome: 'wolf tooth chain', slot: 'necklace', attrs: {}, forja: { raridade: 4, atributos: [{ id: 'dano_magico', valor: 3 }, { id: 'resist_gelo', valor: 2 }, { id: 'capacidade', valor: 100 }, { id: 'chance_de_loot', valor: 0.3 }] } };
    const incomum = { nome: 'wolf tooth chain', slot: 'necklace', attrs: {}, forja: { raridade: 1, atributos: [{ id: 'dano_fisico', valor: 2.2 }] } };
    const a = M.pontuarPeca(epico, 'KNIGHT'), b = M.pontuarPeca(incomum, 'KNIGHT');
    assert(b.pontos > a.pontos, `incomum ${b.pontos} deveria bater épico ${a.pontos}`);
    assert(a.mortos.includes('dano_magico') && a.mortos.includes('capacidade'), 'mortos não marcados: ' + a.mortos);
});
t('regen de mana pesa mais que resistência para o Feiticeiro', () => {
    const r = M.pontuarPeca({ nome: 'crystal ring', slot: 'ring', attrs: {}, forja: { raridade: 1, atributos: [{ id: 'regen_mana', valor: 2.3 }] } }, 'SORCERER');
    const s = M.pontuarPeca({ nome: 'crystal ring', slot: 'ring', attrs: {}, forja: { raridade: 4, atributos: [{ id: 'resist_terra', valor: 1.1 }, { id: 'resist_sagrado', valor: 0.8 }, { id: 'resist_energia', valor: 1.9 }, { id: 'regen_mana', valor: 1.2 }] } }, 'SORCERER');
    assert(r.pontos > s.pontos, `regen 2,3 (${r.pontos}) deveria bater o lendário (${s.pontos})`);
    assert(r.motivos[0].startsWith('regen mana'), 'motivo principal errado: ' + r.motivos[0]);
});
t('armadura base vale para o Knight e quase nada para o Feiticeiro', () => {
    const p = { nome: 'plate armor', slot: 'armor', attrs: base['plate armor'].attrs, forja: { raridade: 0, atributos: [] } };
    assert(M.pontuarPeca(p, 'KNIGHT').pontos >= 10 * M.pontuarPeca(p, 'SORCERER').pontos);
});
t('wand cara em mana perde para wand barata quando o dano não compensa (regime regen)', () => {
    const vortex = { nome: 'wand of vortex', slot: 'weapon', attrs: base['wand of vortex'].attrs, forja: { raridade: 0, atributos: [] } };
    const inferno = { nome: 'wand of inferno', slot: 'weapon', attrs: base['wand of inferno'].attrs, forja: { raridade: 0, atributos: [] } };
    const cara = { nome: 'x', slot: 'weapon', attrs: { weaponType: 'wand', fromDamage: 20, toDamage: 30, mana: 12, vocation: 'Sorcerer;true' }, forja: { raridade: 0, atributos: [] } };
    assert(M.pontuarPeca(inferno, 'SORCERER').pontos > M.pontuarPeca(vortex, 'SORCERER').pontos, 'inferno deveria bater vortex');
    assert(M.pontuarPeca(vortex, 'SORCERER').pontos > M.pontuarPeca(cara, 'SORCERER').pontos, 'wand cara não deveria bater vortex');
});
t('wand com +1 nível mágico (forja) bate wand mais forte; wand de fogo vale zero em mapa imune a fogo', () => {
    const vortexML = { nome: 'wand of vortex', slot: 'weapon', attrs: base['wand of vortex'].attrs, forja: { raridade: 1, atributos: [{ id: 'nivel_magico', valor: 1 }] } };
    const inferno = { nome: 'wand of inferno', slot: 'weapon', attrs: base['wand of inferno'].attrs, forja: { raridade: 0, atributos: [] } };
    const a = M.pontuarPeca(vortexML, 'SORCERER').pontos, b = M.pontuarPeca(inferno, 'SORCERER').pontos;
    assert(a > b, `vortex +1 ML (${a}) deveria bater inferno (${b})`);
    const dragao = { notas: { COMBAT_FIREDAMAGE: 0, COMBAT_ENERGYDAMAGE: 80 } };
    const c = M.pontuarPeca(inferno, 'SORCERER', dragao);
    assert(c.pontos < 0, 'inferno em mapa imune a fogo deveria pontuar negativo (só custa mana): ' + c.pontos);
    const rod = { nome: 'underworld rod', slot: 'weapon', attrs: base['underworld rod'].attrs, forja: { raridade: 0, atributos: [] } };
    const snake = { nome: 'snakebite rod', slot: 'weapon', attrs: base['snakebite rod'].attrs, forja: { raridade: 1, atributos: [{ id: 'nivel_magico', valor: 1 }] } };
    assert(M.pontuarPeca(snake, 'DRUID').pontos > M.pontuarPeca(rod, 'DRUID').pontos, 'snakebite +1 ML deveria bater underworld rod (13 de mana por tiro, Druida paga poção)');
});
t('anel temporário (life ring) pontua pelo equipPreview com etiqueta', () => {
    const p = { nome: 'life ring', slot: 'ring', attrs: base['life ring'].attrs, equipPreview: base['life ring'].equipPreview, forja: { raridade: 0, atributos: [] } };
    const r = M.pontuarPeca(p, 'DRUID');
    assert(r.pontos > 0 && r.temporario === true, JSON.stringify(r));
});
t('vocação: wand só para Feiticeiro, rod só para Druida, arco só para Paladino, espada só para Knight', () => {
    assert(M.vocacaoPode(base['wand of inferno'].attrs, 'SORCERER') && !M.vocacaoPode(base['wand of inferno'].attrs, 'DRUID'));
    assert(M.vocacaoPode(base['underworld rod'].attrs, 'DRUID') && !M.vocacaoPode(base['underworld rod'].attrs, 'SORCERER'));
    assert(M.vocacaoPode(base['bow'].attrs, 'PALADIN') && !M.vocacaoPode(base['bow'].attrs, 'KNIGHT'));
    assert(M.vocacaoPode(base['knight axe'].attrs, 'KNIGHT') && !M.vocacaoPode(base['knight axe'].attrs, 'PALADIN'));
    assert(M.vocacaoPode(base['brass helmet'].attrs, 'DRUID'), 'elmo sem vocação serve para todos');
});
t('candidatos: corpo dos 4 + depósito purificado, slots normalizados', () => {
    const c = M.candidatosEquip(fx.roster, fx.depot, base);
    assert(c.filter(p => p.origem === 'corpo').length === 31, 'corpo: 8+7+8+8 = 31 peças, veio ' + c.filter(p => p.origem === 'corpo').length);
    assert(c.every(p => M.SLOTS_EQUIP.includes(p.slot)), 'slot fora da lista: ' + (c.find(p => !M.SLOTS_EQUIP.includes(p.slot)) || {}).slot);
    assert(c.filter(p => p.origem === 'depósito').length > 100, 'depósito deveria ter >100 peças purificadas');
    assert(!c.some(p => p.nome === 'cyclops trophy'), 'troféu sem forja não é candidato');
});
t('distribuir: item único não vai para dois; cada voc tem 8 slots (Paladino 7)', () => {
    const c = M.candidatosEquip(fx.roster, fx.depot, base);
    const d = M.distribuirEquip(c);
    const vistos = new Set();
    for (const v of Object.keys(d.porVoc)) for (const s of Object.keys(d.porVoc[v])) { const m = d.porVoc[v][s].melhor; if (!m) continue; assert(!vistos.has(m.iid), 'peça repetida ' + m.iid); vistos.add(m.iid); }
    assert(Object.keys(d.porVoc.PALADIN).length === 7 && Object.keys(d.porVoc.KNIGHT).length === 8);
    assert(!d.porVoc.PALADIN.shield, 'paladino não tem escudo');
});
t('distribuir: o anel do Feiticeiro tem regen de mana', () => {
    const c = M.candidatosEquip(fx.roster, fx.depot, base);
    const d = M.distribuirEquip(c);
    const anel = d.porVoc.SORCERER.ring.melhor;
    assert(anel, 'sem anel'); assert(anel.forja.atributos.some(a => a.id === 'regen_mana'), 'anel do Feiticeiro sem regen: ' + JSON.stringify(anel.forja));
});
t('distribuir: dispensáveis têm motivo e não incluem nada que foi escolhido', () => {
    const c = M.candidatosEquip(fx.roster, fx.depot, base);
    const d = M.distribuirEquip(c);
    assert(d.dispensaveis.length > 50, 'esperava >50 dispensáveis, veio ' + d.dispensaveis.length);
    assert(d.dispensaveis.every(p => p.motivo && !d.usadas.has(p.iid)));
    console.log('     top dispensáveis:', d.dispensaveis.slice(0, 3).map(p => `${p.nome} ${p.sell}o`).join(' · '));
    for (const v of Object.keys(d.porVoc)) console.log('     ' + v, Object.entries(d.porVoc[v]).filter(([, x]) => x.ganho > 0).map(([s, x]) => `${s}: ${x.atual ? x.atual.nome : '—'} → ${x.melhor.nome} +${x.ganho}`).join(' | ') || 'sem troca');
});
t('candidatos: a mochila entra com origem "mochila" e slot deduzido da base', () => {
    const bag = [{ iid: 'b1', name: 'bone shield', forja: { raridade: 2, atributos: [{ id: 'resist_morte', valor: 2.1 }] } }, { iid: 'b2', name: 'battle axe', forja: { raridade: 0, atributos: [] } }, { iid: 'b3', name: 'metal spike' }];
    const c = M.candidatosEquip(fx.roster, null, base, bag);
    const m = c.filter(p => p.origem === 'mochila');
    assert(m.length === 2, 'esperava 2 da mochila (metal spike não é equipamento), veio ' + m.length);
    assert(m.find(p => p.iid === 'b1').slot === 'shield' && m.find(p => p.iid === 'b2').slot === 'weapon' && m.find(p => p.iid === 'b2').duasMaos === true);
});
console.log(`\n${n} testes ok`);

// Roda: node testes/equip.test.js
// Extrai o trecho puro do userscript (entre os marcadores) e testa.
// • Casos públicos: testes/fixtures/itens.json (GET /item/info, sem login) — rodam em qualquer clone.
// • Casos com o estado da conta (data/estado-equip-2026-09-28.json, fora do git): só rodam se o arquivo existir.
const fs = require('fs'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'tibidle-helper.user.js'), 'utf8');
const ini = src.indexOf('/* @@EQUIP-PURO-INICIO */'), fim = src.indexOf('/* @@EQUIP-PURO-FIM */');
assert(ini > 0 && fim > ini, 'marcadores @@EQUIP-PURO não encontrados');
const M = new Function(src.slice(ini, fim) + '\nreturn { PESOS_EQUIP, SLOTS_EQUIP, normalizarSlot, vocacaoPode, pontuarPeca, pesosDaVoc, mitigacaoPct, bloqueioEscudo, reducaoArmadura, golpeBasico, efeitoOficial, legadoDe, loyaltyBonus, forjaSimular, forjaValorSorteado, forjaLinhaSorteada, FORJA_GEMA_OURO, protecaoComposta, danoRecebidoCorpo, danoRecebidoMagia, COMBATE_VOC, SUPORTE_OFICIAL, candidatosEquip, distribuirEquip, pecasDesmanche, planoForja, faixaPotencia, wikiSlug, wikiUrlPeca, EQUIP_RESERVAS, destinosSobras, chanceLinha, fragmentosDesmanche, escolherDestino, faixaRange, valorTipico, linhasUteis, REGRAS_VOCACAO, FAIXA_NOME, faseEquip, potenciaBaseForja, trocaVale, encaixeNobre };')();
const le = (p) => { try { return JSON.parse(fs.readFileSync(path.join(raiz, p), 'utf8')); } catch (e) { return null; } };
const base = {};
for (const [nome, it] of Object.entries(le('testes/fixtures/itens.json').itens)) base[nome] = { id: it.id, attrs: it.attrs || {}, sell: it.sell || 0, equipPreview: it.equipPreview || null };
const lib = le('data/lib-items-2026-09-28.json');
if (lib) for (const [nome, id] of Object.entries(lib.porNome)) { const it = lib.itens[id]; if (it) base[nome] = { id: it.id, attrs: it.attrs || {}, sell: it.sell || 0, equipPreview: it.equipPreview || null }; }
const fx = le('data/estado-equip-2026-09-28.json');
let n = 0, pulados = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
const tConta = (nome, fn) => { if (!fx || !lib) { pulados++; console.log('pula', nome, '(data/ ausente)'); return; } t(nome, fn); };
const F = (r, ...at) => ({ raridade: r, atributos: at.map(([id, valor]) => ({ id, valor })) });
const peca = (nome, forja) => ({ nome, slot: null, attrs: base[nome].attrs, equipPreview: base[nome].equipPreview, forja: forja || F(0) });

t('épico com atributos mortos perde para incomum certo (Knight, colar)', () => {
    /* 2.11.6 — mortos de verdade no Knight: tudo dele é físico (dano elemental 0), Distância 0 */
    const epico = { nome: 'wolf tooth chain', slot: 'necklace', attrs: {}, forja: { raridade: 3, atributos: [{ id: 'dano_elem_fogo', valor: 3 }, { id: 'dano_elem_morte', valor: 2 }, { id: 'distancia', valor: 1 }] } };
    const incomum = { nome: 'wolf tooth chain', slot: 'necklace', attrs: {}, forja: { raridade: 1, atributos: [{ id: 'dano_fisico', valor: 2.2 }] } };
    const a = M.pontuarPeca(epico, 'KNIGHT'), b = M.pontuarPeca(incomum, 'KNIGHT');
    assert(b.pontos > a.pontos, `incomum ${b.pontos} deveria bater épico ${a.pontos}`);
    assert(a.mortos.includes('dano_elem_fogo') && a.mortos.includes('distancia'), 'mortos não marcados: ' + a.mortos);
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
    /* 2.11.6 — com a mana curta (tiro ~0,14/s) as duas empatavam; 2.16.3 (dono, 13/10, seguindo os vídeos): +1 ML vale pelo
     * menos uma regen. de mana 2,0 — a vortex ML+1 passa a bater a inferno com folga */
    assert(a > b + 1, `vortex +1 ML (${a}) deveria bater a inferno (${b})`);
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
    assert(r.pontos > 0 && r.temporario === true && r.duracaoS === 1200, JSON.stringify(r));
});
t('vocação: wand só para Feiticeiro, rod só para Druida, arco só para Paladino, espada só para Knight', () => {
    assert(M.vocacaoPode(base['wand of inferno'].attrs, 'SORCERER') && !M.vocacaoPode(base['wand of inferno'].attrs, 'DRUID'));
    assert(M.vocacaoPode(base['underworld rod'].attrs, 'DRUID') && !M.vocacaoPode(base['underworld rod'].attrs, 'SORCERER'));
    assert(M.vocacaoPode(base['bow'].attrs, 'PALADIN') && !M.vocacaoPode(base['bow'].attrs, 'KNIGHT'));
    assert(M.vocacaoPode(base['knight axe'].attrs, 'KNIGHT') && !M.vocacaoPode(base['knight axe'].attrs, 'PALADIN'));
    assert(M.vocacaoPode(base['brass helmet'].attrs, 'DRUID'), 'elmo sem vocação serve para todos');
});

/* ---- v2.9.0 ------------------------------------------------------------ */
t('lança não é arma de ninguém (wiki: Paladino usa arco ou besta)', () => {
    for (const nome of ['spear', 'royal spear']) for (const v of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'])
        assert(!M.vocacaoPode(base[nome].attrs, v), `${nome} liberada para ${v}`);
    assert(M.vocacaoPode(base['crossbow'].attrs, 'PALADIN') && M.vocacaoPode(base['elvish bow'].attrs, 'PALADIN'));
});
t('besta vale mais que arco no Paladino (bolt grátis 30 contra arrow grátis 25)', () => {
    const arco = M.pontuarPeca(peca('bow'), 'PALADIN'), besta = M.pontuarPeca(peca('crossbow'), 'PALADIN');
    assert(arco.pontos === 0, 'arco comum deveria valer 0: ' + arco.pontos);
    /* 2.11.6 — o tiro é ~5 % do dano do Paladino (o resto é runa + Caldera): o bolt rende pouco, mas rende */
    assert(besta.pontos > 0, 'besta deveria valer o ganho do bolt: ' + besta.pontos);
    assert(besta.motivos[0].includes('bolt'), 'motivo deveria citar o bolt: ' + besta.motivos);
});
t('Paladino: Dano Mágico conta (runa + Caldera + Missile), e divide com Dano Físico', () => {
    const P = M.pesosDaVoc('PALADIN');
    /* 2.11.6 — medido 29/09: 95 % do dano do Paladino é runa + Caldera + Missile */
    assert(P.dano_magico > 10 * P.dano_fisico && P.dano_fisico > 0, JSON.stringify({ m: P.dano_magico, f: P.dano_fisico }));
    const meio = M.pesosDaVoc('PALADIN', { party: { fracMagica: { PALADIN: 0.5 } } });
    assert(Math.abs(meio.dano_magico - meio.dano_fisico) < 0.001 && meio.distancia >= P.distancia, 'fração medida deveria mandar'); // 2.38.0: o piso da distância pode empatar
    /* com a mana quase de graça (piso da 2.38.0 baixo), a fórmula da distância aparece: mais tiro = mais distância */
    const barato = { dpm: { PALADIN: 0.1 } }, P2 = M.pesosDaVoc('PALADIN', { party: barato }), meio2 = M.pesosDaVoc('PALADIN', { party: Object.assign({ fracMagica: { PALADIN: 0.5 } }, barato) });
    assert(meio2.distancia > P2.distancia, 'fórmula: ' + JSON.stringify([P2.distancia, meio2.distancia]));
});
t('Knight: +1 de ataque vale quase o mesmo que +1 de skill (golpe e Berserk são simétricos)', () => {
    const P = M.pesosDaVoc('KNIGHT');
    assert(P.attack / P.corpo_a_corpo > 0.7 && P.attack / P.corpo_a_corpo < 1.3, `ataque ${P.attack} × skill ${P.corpo_a_corpo}`);
    assert(P.skillaxe === P.corpo_a_corpo);
});
t('nível mágico: pela fórmula com ML baixo, e nunca abaixo de 3,0 de regen. de mana (2.16.3: 2,0; 2.23.0: 3,0, dono 17/10)', () => {
    const baixo = M.pesosDaVoc('SORCERER', { nivel: 39, sk: { SORCERER: { ml: 5 } } }), alto = M.pesosDaVoc('SORCERER', { nivel: 62, sk: { SORCERER: { ml: 20 } } });
    assert(baixo.nivel_magico >= alto.nivel_magico, `${baixo.nivel_magico} × ${alto.nivel_magico}`);
    assert(Math.abs(alto.nivel_magico - 3 * alto.regen_mana) < 0.01, 'ML 20: o piso é 3,0 de regen. de mana: ' + alto.nivel_magico + ' × regen ' + alto.regen_mana);
    const dru = M.pesosDaVoc('DRUID', null);
    assert(Math.abs(dru.nivel_magico - 3 * dru.regen_mana) < 0.01, 'Druida (bebe poção): o piso acompanha a regen. dele');
    assert(M.pesosDaVoc('PALADIN', null).nivel_magico < 2 * M.pesosDaVoc('PALADIN', null).regen_mana, 'Paladino não ganha o piso');
    const lixo = M.pesosDaVoc('SORCERER', { sk: { SORCERER: { ml: undefined } } });
    assert(lixo.nivel_magico === M.pesosDaVoc('SORCERER', {}).nivel_magico, 'skill ausente cai na referência');
});
t('2.16.3: Wand of Everblazing (+1 ML de fábrica) bate a inferno; chance de crítico sozinha conta e é nobre nos magos', () => {
    /* atributos do catálogo (data/lib-items-2026-09-28.json): magiclevelpoints 1, fogo 75–95, 17 de mana por tiro */
    const ever = { nome: 'wand of everblazing', slot: 'weapon', attrs: { weaponType: 'wand', shootType: 'fire', magiclevelpoints: 1, mana: 17, fromDamage: 75, toDamage: 95, wandType: 'fire', vocation: 'Sorcerer;true, Master Sorcerer' }, forja: F(0) };
    const inferno = { nome: 'wand of inferno', slot: 'weapon', attrs: base['wand of inferno'].attrs, forja: F(0) };
    const e = M.pontuarPeca(ever, 'SORCERER'), i = M.pontuarPeca(inferno, 'SORCERER');
    assert(e.pontos > i.pontos + 1, `everblazing ${e.pontos} deveria bater a inferno ${i.pontos}`);
    assert(e.detalhe.some(d => d.id === 'magiclevelpoints' && d.pt >= 2 * M.pesosDaVoc('SORCERER', null).regen_mana - 0.01), 'o +1 ML de fábrica pesa como a linha de forja: ' + JSON.stringify(e.detalhe));
    const anelRegen = { nome: 'crystal ring', slot: 'ring', attrs: {}, forja: F(1, ['regen_mana', 2.0]) };
    const wandML = { nome: 'wand of vortex', slot: 'weapon', attrs: base['wand of vortex'].attrs, forja: F(1, ['nivel_magico', 1]) };
    const mlPt = M.pontuarPeca(wandML, 'SORCERER').detalhe.find(d => d.id === 'nivel_magico').pt;
    assert(mlPt >= M.pontuarPeca(anelRegen, 'SORCERER').pontos - 0.01, '+1 ML ≥ regen. de mana 2,0');
    /* 2.23.0 (dono, 17/10): +1 ML bate a MELHOR regen. de mana da forja (2,0/s) com folga de 50 % */
    assert(mlPt >= 1.5 * M.pontuarPeca(anelRegen, 'SORCERER').pontos - 0.01, '+1 ML ≥ 1,5 × regen. de mana 2,0: ' + mlPt + ' × ' + M.pontuarPeca(anelRegen, 'SORCERER').pontos);
    /* crítico: chance 2 % sem linha de dano já rende (base 0 no jogo; dano extra 50 % é premissa) */
    const colarCrit = { nome: 'wolf tooth chain', slot: 'necklace', attrs: {}, forja: F(1, ['critico_chance', 2]) };
    const c = M.pontuarPeca(colarCrit, 'SORCERER');
    assert(c.pontos > 0 && !c.mortos.includes('critico_chance'), 'chance de crítico sozinha deveria pontuar: ' + c.pontos + ' mortos ' + c.mortos);
    assert(Math.abs(c.pontos - 2 * 50 / 100 * 0.27) < 0.01, '2 % × 50 % do dano do Feiticeiro (27 % da party) = 0,27 pt: ' + c.pontos);
    const comDano = { nome: 'wolf tooth chain', slot: 'necklace', attrs: {}, forja: F(2, ['critico_chance', 2], ['critico_dano', 10]) };
    assert(M.pontuarPeca(comDano, 'SORCERER').pontos > c.pontos, 'a linha de dano soma aos 50 %');
});
t('peça de carga ou de tempo é marcada temporária (stone skin, might ring, prismatic ring)', () => {
    for (const nome of ['stone skin amulet', 'might ring', 'prismatic ring', 'ring of healing', 'terra amulet']) {
        const r = M.pontuarPeca(peca(nome), 'KNIGHT');
        assert(r.temporario, nome + ' não saiu temporária');
    }
    assert(M.pontuarPeca(peca('stone skin amulet'), 'KNIGHT').cargas === 5);
    assert(!M.pontuarPeca(peca('platinum amulet'), 'KNIGHT').temporario, 'platinum amulet é permanente');
});

/* cenário montado com peças reais do catálogo */
let k = 0;
const eq = (nome, forja) => ({ name: nome, iid: 'c' + (++k), forja: forja || F(0) });
const dep = (nome, slot, forja) => ({ itemName: nome, iid: 'd' + (++k), slot, forja: forja || F(0) });
const roster = [
    { vocation: 'KNIGHT', equipment: { weapon: eq('mace'), shield: eq('bonelord shield'), necklace: eq('platinum amulet') } },
    { vocation: 'PALADIN', equipment: { weapon: eq('bow') } },
    { vocation: 'SORCERER', equipment: { weapon: eq('wand of vortex'), ring: eq('crystal ring', F(1, ['regen_mana', 2.3])) } },
    { vocation: 'DRUID', equipment: { weapon: eq('snakebite rod') } },
];
const depot = { entries: [
    dep('crossbow', 'weapon'), dep('royal spear', 'weapon', F(1, ['distancia', 1])), dep('elvish bow', 'weapon'),
    dep('ring of healing', 'ring'), dep('life ring', 'ring'), dep('might ring', 'ring'), dep('stone skin amulet', 'necklace'),
    dep('wand of inferno', 'weapon'), dep('wand of dragonbreath', 'weapon'),
] };
const pecas = M.candidatosEquip(roster, depot, base, []);
const fogoImune = { notas: { COMBAT_FIREDAMAGE: 0, COMBAT_ENERGYDAMAGE: 100 } };

t('distribuir: Paladino fica com besta, nunca com lança; o 2º arco fica de reserva', () => {
    const d = M.distribuirEquip(pecas);
    const arma = d.porVoc.PALADIN.weapon.melhor;
    /* 2.11.6 — besta dá +0,2 pt (o tiro é ~5 % do dano dele): abaixo do custo da troca, o arco fica */
    assert(arma && ['bow', 'crossbow'].includes(arma.nome), 'arma do Paladino: ' + (arma && arma.nome));
    assert(!Object.values(d.porVoc).some(x => x.weapon && x.weapon.melhor && /spear/.test(x.weapon.melhor.nome)), 'lança escolhida para alguém');
    assert(arma.nome === 'crossbow' || d.reservas.has(pecas.find(p => p.nome === 'crossbow').iid), 'a besta deveria ficar de reserva');
    const lanca = d.dispensaveis.find(p => p.nome === 'royal spear');
    assert(lanca && /nenhuma vocação/.test(lanca.motivo), 'lança deveria sair como "nenhuma vocação usa": ' + (lanca && lanca.motivo));
});
t('distribuir: peça temporária não é escolhida nem vendida; aparece em temporarios', () => {
    const d = M.distribuirEquip(pecas);
    for (const v of Object.keys(d.porVoc)) for (const s of ['ring', 'necklace']) {
        const m = d.porVoc[v][s] && d.porVoc[v][s].melhor;
        assert(!m || !['ring of healing', 'life ring', 'might ring', 'stone skin amulet'].includes(m.nome), `${v} ${s} escolheu ${m && m.nome}`);
    }
    assert(!d.dispensaveis.some(p => ['ring of healing', 'life ring', 'might ring', 'stone skin amulet'].includes(p.nome)), 'temporária na lista de venda');
    assert(d.temporarios.map(p => p.nome).sort().join() === 'life ring,might ring,ring of healing,stone skin amulet', 'temporarios: ' + d.temporarios.map(p => p.nome));
});
t('distribuir: dispensável não depende do mapa (inferno fica fora da venda em mapa imune a fogo)', () => {
    const mapa = M.distribuirEquip(pecas, undefined, fogoImune);
    assert(mapa.porVoc.SORCERER.weapon.melhor.nome !== 'wand of inferno', 'no mapa imune a fogo a inferno não deveria ser a escolhida');
    assert(!mapa.dispensaveis.some(p => p.nome === 'wand of inferno'), 'inferno na lista de venda');
    const neutro = M.distribuirEquip(pecas);
    assert(neutro.reservas.has(pecas.find(p => p.nome === 'wand of inferno').iid) || neutro.porVoc.SORCERER.weapon.melhor.nome === 'wand of inferno', 'no mapa neutro a inferno é escolhida ou reserva');
});
t('distribuir: item único não vai para dois (cenário público)', () => {
    const d = M.distribuirEquip(pecas);
    const vistos = new Set();
    for (const v of Object.keys(d.porVoc)) for (const s of Object.keys(d.porVoc[v])) { const m = d.porVoc[v][s].melhor; if (!m) continue; assert(!vistos.has(m.iid), 'peça repetida ' + m.iid); vistos.add(m.iid); }
    assert(Object.keys(d.porVoc.PALADIN).length === 7 && Object.keys(d.porVoc.KNIGHT).length === 8);
});

/* ---- estado real da conta (28/09) ----------------------------------------- */
tConta('candidatos: corpo dos 4 + depósito purificado, slots normalizados', () => {
    const c = M.candidatosEquip(fx.roster, fx.depot, base);
    assert(c.filter(p => p.origem === 'corpo').length === 31, 'corpo: 8+7+8+8 = 31 peças, veio ' + c.filter(p => p.origem === 'corpo').length);
    assert(c.every(p => M.SLOTS_EQUIP.includes(p.slot)), 'slot fora da lista: ' + (c.find(p => !M.SLOTS_EQUIP.includes(p.slot)) || {}).slot);
    assert(c.filter(p => p.origem === 'depósito').length > 100, 'depósito deveria ter >100 peças purificadas');
    assert(!c.some(p => p.nome === 'cyclops trophy'), 'troféu sem forja não é candidato');
});
tConta('distribuir: item único não vai para dois; cada voc tem 8 slots (Paladino 7)', () => {
    const c = M.candidatosEquip(fx.roster, fx.depot, base);
    const d = M.distribuirEquip(c);
    const vistos = new Set();
    for (const v of Object.keys(d.porVoc)) for (const s of Object.keys(d.porVoc[v])) { const m = d.porVoc[v][s].melhor; if (!m) continue; assert(!vistos.has(m.iid), 'peça repetida ' + m.iid); vistos.add(m.iid); }
    assert(Object.keys(d.porVoc.PALADIN).length === 7 && Object.keys(d.porVoc.KNIGHT).length === 8);
    assert(!d.porVoc.PALADIN.shield, 'paladino não tem escudo');
});
tConta('distribuir: o anel do Feiticeiro tem regen de mana', () => {
    const c = M.candidatosEquip(fx.roster, fx.depot, base);
    const d = M.distribuirEquip(c);
    const anel = d.porVoc.SORCERER.ring.melhor;
    assert(anel, 'sem anel'); assert(anel.forja.atributos.some(a => a.id === 'regen_mana'), 'anel do Feiticeiro sem regen: ' + JSON.stringify(anel.forja));
});
tConta('distribuir: dispensáveis têm motivo e não incluem nada que foi escolhido', () => {
    const c = M.candidatosEquip(fx.roster, fx.depot, base);
    const d = M.distribuirEquip(c);
    assert(d.dispensaveis.length > 50, 'esperava >50 dispensáveis, veio ' + d.dispensaveis.length);
    assert(d.dispensaveis.every(p => p.motivo && !d.usadas.has(p.iid)));
    console.log('     top dispensáveis:', d.dispensaveis.slice(0, 3).map(p => `${p.nome} ${p.sell}o`).join(' · '));
    for (const v of Object.keys(d.porVoc)) console.log('     ' + v, Object.entries(d.porVoc[v]).filter(([, x]) => x.ganho > 0).map(([s, x]) => `${s}: ${x.atual ? x.atual.nome : '—'} → ${x.melhor.nome} +${x.ganho}`).join(' | ') || 'sem troca');
});
tConta('candidatos: a mochila entra com origem "mochila" e slot deduzido da base', () => {
    const bag = [{ iid: 'b1', name: 'bone shield', forja: { raridade: 2, atributos: [{ id: 'resist_morte', valor: 2.1 }] } }, { iid: 'b2', name: 'battle axe', forja: { raridade: 0, atributos: [] } }, { iid: 'b3', name: 'metal spike' }];
    const c = M.candidatosEquip(fx.roster, null, base, bag);
    const m = c.filter(p => p.origem === 'mochila');
    assert(m.length === 2, 'esperava 2 da mochila (metal spike não é equipamento), veio ' + m.length);
    assert(m.find(p => p.iid === 'b1').slot === 'shield' && m.find(p => p.iid === 'b2').slot === 'weapon' && m.find(p => p.iid === 'b2').duasMaos === true);
});
t('2.11.2: troca tem custo — nada de tirar o anel do Feiticeiro por +0,2 pt; ganho real de 1,4 pt continua', () => {
    /* anéis de 29/09 (ao vivo, nível 67): o otimizador dava o r4 do Feiticeiro ao Paladino (+1,4)
     * e um r1 do depósito ao Feiticeiro (−1,2) — 3 trocas por +0,2 no total */
    const anel = (iid, origem, dono, r, ...at) => ({ iid, nome: 'crystal ring', slot: 'ring', attrs: base['crystal ring'] ? base['crystal ring'].attrs : {}, origem, dono, forja: F(r, ...at) });
    const dep = (iid, r, ...at) => anel(iid, 'depósito', null, r, ...at);
    const an = [
        anel('k', 'corpo', 'KNIGHT', 3, ['resist_energia', 1.1], ['resist_gelo', 0.9], ['resist_sagrado', 0.9]),
        anel('p', 'corpo', 'PALADIN', 1, ['max_mana', 93]),
        anel('s', 'corpo', 'SORCERER', 4, ['resist_terra', 1.1], ['resist_sagrado', 0.8], ['resist_energia', 1.9], ['regen_mana', 1.2]),
        anel('d', 'corpo', 'DRUID', 1, ['regen_mana', 2.3]),
        dep('dep1', 2, ['max_hp', 24], ['resist_terra', 1]), dep('dep2', 1, ['max_hp', 26]), dep('dep3', 1, ['max_hp', 13]),
        dep('dep4', 1, ['regen_vida', 2.4]), dep('dep5', 1, ['max_hp', 12]), dep('dep6', 1, ['resist_morte', 1.3]), dep('dep7', 1, ['regen_vida', 1.1]),
        dep('dep8', 2, ['regen_mana', 1.2], ['resist_sagrado', 0.6]), dep('dep9', 1, ['resist_fogo', 0.9]), dep('dep10', 1, ['protecao_magica', 0.7]),
        dep('dep11', 1, ['protecao_magica', 0.7]), dep('dep12', 1, ['resist_energia', 0.6]), dep('dep13', 1, ['regen_mana', 1.3])
    ];
    /* contexto do jogo naquela hora: Djinns Marid Territory, nível 67 */
    const ctxDjinns = { notas: { COMBAT_PHYSICALDAMAGE: 100, COMBAT_ENERGYDAMAGE: 50, COMBAT_FIREDAMAGE: 20, COMBAT_ICEDAMAGE: 110, COMBAT_EARTHDAMAGE: 100, COMBAT_HOLYDAMAGE: 80, COMBAT_DEATHDAMAGE: 113 }, mapa: 'Djinns Marid Territory', nivel: 67 };
    const d = M.distribuirEquip(an, undefined, ctxDjinns);
    const quem = (v) => d.porVoc[v].ring.melhor && d.porVoc[v].ring.melhor.iid;
    assert.strictEqual(quem('SORCERER'), 's', 'o Feiticeiro não pode perder o anel dele: ' + quem('SORCERER'));
    /* 2.11.6 — Paladino vive com 7–9 % de mana: troca o max mana +93 por regen. mana do depósito */
    const pal = an.find(x => x.iid === quem('PALADIN'));
    assert(pal && pal.origem === 'depósito' && pal.forja.atributos.some(a => a.id === 'regen_mana'), 'o Paladino deveria trocar max mana por regen. mana do depósito: ' + quem('PALADIN'));
    assert.strictEqual(quem('DRUID'), 'd');
    const k = d.porVoc.KNIGHT.ring;
    assert(k.melhor && /^dep/.test(k.melhor.iid) && k.ganho > 1, `o Knight ganha +${k.ganho} com o anel do depósito — essa troca vale`);
});
t('2.11.11: nunca tira peça de um personagem para dar a outro — só depósito e mochila', () => {
    const arm = (iid, dono, ...at) => ({ iid, nome: 'x armor', slot: 'armor', attrs: {}, origem: dono ? 'corpo' : 'depósito', dono, forja: F(at.length, ...at) });
    /* ao vivo (30/09): chain armor épica do Druida (regen. mana +1,1) ia para o Paladino (+14 pt) */
    const d = M.distribuirEquip([arm('pal', 'PALADIN', ['max_hp', 10]), arm('dru', 'DRUID', ['regen_mana', 1.1], ['armor', 6], ['max_hp', 5]), arm('dep', null, ['regen_mana', 0.4])]);
    assert.strictEqual(d.porVoc.DRUID.armor.melhor.iid, 'dru', 'o Druida fica com a dele');
    const p = d.porVoc.PALADIN.armor.melhor;
    assert(p && p.iid !== 'dru', 'o Paladino não pode pegar a do Druida: ' + (p && p.iid));
    for (const v of Object.keys(d.porVoc)) for (const x of Object.values(d.porVoc[v])) assert(!x.melhor || x.melhor.origem !== 'corpo' || x.melhor.dono === v, v + ' pegou peça de ' + (x.melhor && x.melhor.dono));
});
t('potência ≥ 300 com encaixe de skill é base de forja, não sobra (vídeos de 04/10)', () => {
    /* TV de Souza: Snakebite Rod ML+1 com potência ≥ 300 → +3 de refino (400+) → rerrolar para ML+2; o item "ruim" vira o bis */
    const anel = (iid, dono, r, pot, ...at) => ({ iid, nome: 'crystal ring', slot: 'ring', attrs: {}, origem: dono ? 'corpo' : 'depósito', dono, forja: Object.assign(F(r, ...at), { potenciaBase: pot }) });
    const pcs = [
        anel('k', 'KNIGHT', 1, 100, ['regen_vida', 2.4]), anel('p', 'PALADIN', 1, 100, ['regen_mana', 3]),
        anel('s', 'SORCERER', 1, 100, ['regen_mana', 3]), anel('d', 'DRUID', 1, 100, ['regen_mana', 3]),
        anel('ml', null, 1, 312, ['nivel_magico', 1]),     // Incomum, ML+1, potência 312: base de forja
        anel('fraco', null, 1, 140, ['nivel_magico', 1]),  // mesma linha, potência baixa: sobra
        anel('semlinha', null, 0, 340)                      // potência alta sem linha: Comum, vende
    ];
    const d = M.distribuirEquip(pcs, undefined, { party: { fisico: 0.95, tomadoS: 25 } });
    assert(d.bases.some(p => p.iid === 'ml'), 'ML+1 com potência 312 deveria ser base de forja');
    assert(!d.dispensaveis.some(p => p.iid === 'ml'), 'ML+1 com potência 312 foi para as sobras');
    /* os dois podem virar reserva (2 por espaço), mas nunca base de forja */
    for (const iid of ['fraco', 'semlinha']) {
        assert(!d.usadas.has(iid), iid + ' foi vestida (o teste ficaria vazio)');
        assert(!d.bases.some(p => p.iid === iid), iid + ' não deveria ser base de forja');
        assert(d.reservas.has(iid) || d.dispensaveis.some(p => p.iid === iid), iid + ' sumiu da conta');
    }
});
t('pecasDesmanche: só sobras que o NPC não compra (Incomum+ ou refinada), da mochila ou do depósito, nunca do corpo', () => {
    /* criador do jogo (04/10): item selado deixado no auto-sell perde o desmanche; o desmanche é a única fonte de fragmentos */
    const sobra = (iid, origem, r, refino, pot) => ({ iid, nome: 'crystal ring', slot: 'ring', origem, forja: Object.assign(F(r), { refino, potenciaBase: pot }), motivo: 'x' });
    const res = { dispensaveis: [
        sobra('comum', 'depósito', 0, 0, 100),      // Comum sem refino: o NPC compra, não desmancha
        sobra('incomum', 'mochila', 1, 0, 100),     // Incomum: não vende em lugar nenhum → desmanche
        sobra('refinada', 'depósito', 0, 2, 100),   // Comum +2: não vende → desmanche
        sobra('corpo', 'corpo', 1, 0, 100)          // vestida: nunca
    ] };
    const d = M.pecasDesmanche(res, () => false);
    assert.deepStrictEqual(d.map(x => x.iid + ':' + x.origem), ['incomum:bag', 'refinada:depot']);
    assert.deepStrictEqual(M.pecasDesmanche(null, () => false), []);
    assert.deepStrictEqual(M.pecasDesmanche(res), [], '2.23.4: sem o Mercado lido (sem temNegocio) nada é desmanchado');
});
t('planoForja: faixa pela potência, refinos até a próxima faixa, linhas-alvo por vocação e espaço, passos em ordem', () => {
    /* dono (04/10): "não sei usar a forja — me indica o que fazer e quais atributos encontrar" */
    assert.deepStrictEqual([M.faixaPotencia(1), M.faixaPotencia(199), M.faixaPotencia(200), M.faixaPotencia(312), M.faixaPotencia(400), M.faixaPotencia(812), M.faixaPotencia(1000)], [1, 1, 2, 2, 3, 5, 6]);
    /* rod ML+1 com potência 312 (TV de Souza): faixa 2 → faixa 3 em 2 refinos (400); linha-alvo do mago na arma = nível mágico */
    const rod = { iid: 'r', nome: 'snakebite rod', slot: 'weapon', attrs: { vocation: 'sorcerer' }, origem: 'depósito', forja: { raridade: 1, refino: 0, potenciaBase: 312, atributos: [{ id: 'nivel_magico', valor: 1 }] } };
    const pr = M.planoForja(rod, ['SORCERER'], null, null);
    assert.strictEqual(pr.voc, 'SORCERER');
    assert.strictEqual(pr.faixa, 2); assert.strictEqual(pr.proxima.limiar, 400); assert.strictEqual(pr.proxima.refinos, 2); assert.strictEqual(pr.proxima.refinoAlvo, 2);
    assert.strictEqual(pr.linhasAlvo[0].id, 'nivel_magico', 'arma do mago: nível mágico primeiro — veio ' + pr.linhasAlvo.map(x => x.id));
    assert(pr.linhasAtuais[0].id === 'nivel_magico' && pr.linhasAtuais[0].boa, 'a linha ML+1 que já tem é boa');
    assert.strictEqual(pr.encaixes, 1); assert.strictEqual(pr.raridadeAlvo, 3, 'subir até Épico (3 encaixes)');
    assert(pr.passos.length >= 4 && /refin/i.test(pr.passos[0]) && /raridade/i.test(pr.passos[1]), 'ordem: refino → raridade → atributos: ' + pr.passos.join(' | '));
    /* anel épico de resistências (Knight): linhas-alvo de defesa = regen. de mana e regen. de vida; as resistências atuais não são nobres */
    const anel = { iid: 'a', nome: 'crystal ring', slot: 'ring', attrs: {}, origem: 'mochila', forja: { raridade: 3, refino: 0, potenciaBase: 152, atributos: [{ id: 'resist_energia', valor: 1.1 }, { id: 'resist_gelo', valor: 0.9 }, { id: 'resist_sagrado', valor: 0.9 }] } };
    const pa = M.planoForja(anel, ['KNIGHT'], null, null);
    assert(['regen_mana', 'regen_vida'].includes(pa.linhasAlvo[0].id) && ['regen_mana', 'regen_vida'].includes(pa.linhasAlvo[1].id), 'anel do Knight: regen primeiro — veio ' + pa.linhasAlvo.map(x => x.id));
    assert(!pa.linhasAlvo.some(x => /^dano|corpo_a_corpo|nivel_magico|distancia/.test(x.id)), 'linha de ataque não existe em peça de defesa');
    assert(pa.linhasAtuais.every(x => !x.boa), 'resistência não é linha nobre do Knight');
    assert.strictEqual(pa.proxima.limiar, 200); assert.strictEqual(pa.proxima.refinos, 1);
    assert(/Limpeza T1/.test(pa.passos.join(' ')), 'três linhas ruins: apagar tudo com Limpeza T1');
    /* +10 e 1000+: não há próxima faixa */
    const topo = { iid: 't', nome: 'magic sword', slot: 'weapon', attrs: {}, origem: 'depósito', forja: { raridade: 4, refino: 10, potenciaBase: 520, atributos: [] } };
    assert.strictEqual(M.planoForja(topo, ['KNIGHT'], null, null).proxima, null);
});
t('pecasDesmanche: peça com negócio no Mercado fica fora do desmanche (Incomum anuncia: u2tag tinha leather boots Incomum a 2.299)', () => {
    const sobra = (iid, nome, r) => ({ iid, nome, slot: 'ring', origem: 'mochila', forja: { raridade: r, refino: 0 }, motivo: 'x' });
    const res = { dispensaveis: [sobra('a', 'crystal ring', 1), sobra('b', 'simple dress', 1), sobra('c', 'cape', 1)] };
    const temNegocio = (nome) => nome === 'crystal ring' || nome === 'cape';
    assert.deepStrictEqual(M.pecasDesmanche(res, temNegocio).map(x => x.iid), ['b']);
    assert.deepStrictEqual(M.pecasDesmanche(res).map(x => x.iid), [], '2.23.4: sem o Mercado lido nada vai (antes ia tudo)');
    assert.deepStrictEqual(M.pecasDesmanche(res, null, true).map(x => x.iid), ['a', 'b', 'c'], 'incluir marcado de propósito: vai tudo mesmo sem o Mercado');
    assert.deepStrictEqual(M.pecasDesmanche(res, temNegocio, true).map(x => x.iid), ['a', 'b', 'c'], 'incluir = ignora o filtro');
});
t('2.26.2 pecasDesmanche: com negócio no Mercado mas fragmentos valendo MAIS que o Mercado líquido → desmancha (veredito por peça); sem veredito, regra antiga', () => {
    const sobra = (iid, nome, r) => ({ iid, nome, slot: 'ring', origem: 'mochila', forja: { raridade: r, refino: 0 }, motivo: 'x' });
    const res = { dispensaveis: [sobra('a', 'crystal ring', 1), sobra('b', 'simple dress', 1), sobra('c', 'cape', 1), sobra('d', 'plate armor', 2)] };
    const temNegocio = (nome) => nome !== 'simple dress';                      // b não tem negócio: vai de qualquer jeito
    const destinoDe = (p) => ({ 'crystal ring': 'desmanche', 'cape': 'mercado', 'plate armor': 'mercado?' })[p.nome];
    assert.deepStrictEqual(M.pecasDesmanche(res, temNegocio, false, destinoDe).map(x => x.iid), ['a', 'b'], 'a: fragmentos > Mercado; c: Mercado paga mais; d: sem referência e com negócio → fora');
    assert.deepStrictEqual(M.pecasDesmanche(res, temNegocio, false).map(x => x.iid), ['b'], 'sem veredito: só quem não tem negócio (2.23.4)');
    assert.deepStrictEqual(M.pecasDesmanche(res, temNegocio, true, destinoDe).map(x => x.iid), ['a', 'b', 'c', 'd'], 'incluir: tudo');
    assert.deepStrictEqual(M.pecasDesmanche(res, null, false, destinoDe), [], 'sem o Mercado lido (sem temNegocio) nada vai, mesmo com veredito');
});
t('2.23.5 pecasDesmanche: sobra com linha NOBRE (regen. de mana/vida, ML, skill, dano, crítico) nunca vai para o desmanche, nem com "incluir"', () => {
    const sobra = (iid, nome, slot, forja) => ({ iid, nome, slot, origem: 'depósito', forja, motivo: 'encaixe bom, mas todos já usam igual ou melhor' });
    const res = { dispensaveis: [
        sobra('vida', 'dark armor', 'armor', F(1, ['regen_vida', 2.0])),          // nobre no Knight → Mercado
        sobra('mana', 'plate legs', 'legs', F(1, ['regen_mana', 1.2])),           // nobre em todos → Mercado
        sobra('ml', 'wand of vortex', 'weapon', F(1, ['nivel_magico', 1])),       // nobre nos magos → Mercado
        sobra('lixo', 'dark armor', 'armor', F(1, ['capacidade', 48])),           // linha que ninguém usa → desmanche
        sobra('resist', 'steel helmet', 'head', F(2, ['resist_gelo', 0.8], ['max_mana', 30])) // idem
    ] };
    assert.deepStrictEqual(M.pecasDesmanche(res, () => false).map(x => x.iid), ['lixo', 'resist']);
    assert.deepStrictEqual(M.pecasDesmanche(res, null, true).map(x => x.iid), ['lixo', 'resist'], 'nem com incluir');
});
t('2.11.6 → 2.16.1: épico só é base de forja com linha útil; três resistências de 1 % sobram (anuncie ou desmanche)', () => {
    /* 2.11.6 dizia "épico nunca sobra"; a wiki de 12/10 (skill cai 1 em 89 por gema) e o TV de Souza ("Mace com 500 de potência é
     * item de noob — desencanta") mudaram a regra: 3 encaixes só valem se pelo menos um já é uma linha que alguém usa de verdade */
    const anel = (iid, dono, r, ...at) => ({ iid, nome: 'crystal ring', slot: 'ring', attrs: {}, origem: dono ? 'corpo' : 'depósito', dono, forja: F(r, ...at) });
    const pcs = [
        anel('k', 'KNIGHT', 1, ['regen_vida', 2.4]), anel('p', 'PALADIN', 1, ['regen_mana', 1.3]),
        anel('s', 'SORCERER', 1, ['regen_mana', 1.2]), anel('d', 'DRUID', 1, ['regen_mana', 2.3]),
        anel('epico', null, 3, ['resist_energia', 1.1], ['resist_gelo', 0.9], ['resist_sagrado', 0.9]),
        anel('epicoBom', null, 3, ['resist_energia', 1.1], ['regen_mana', 1.1], ['resist_sagrado', 0.9]),
        /* reservas de anel já ocupadas (1 por vocação): o épico de resistências não pode se salvar como "2.ª melhor" */
        anel('resK', null, 1, ['regen_vida', 1.0]), anel('resM', null, 1, ['regen_mana', 1.0]),
        anel('lixo1', null, 1, ['max_mana', 40]), anel('lixo2', null, 1, ['max_mana', 41]), anel('lixo3', null, 1, ['max_mana', 42])
    ];
    /* medido num mapa corpo a corpo: laterais não apanham */
    const d = M.distribuirEquip(pcs, undefined, { party: { fisico: 0.95, tomadoS: 25 } });
    const e = d.dispensaveis.find(p => p.iid === 'epico');
    assert(e && /sem linha útil/.test(e.motivo), 'épico de 3 resistências de 1 % deveria sobrar com o motivo "sem linha útil": ' + (e ? e.motivo : 'não sobrou'));
    assert(!d.bases.some(p => p.iid === 'epico'), 'épico sem linha útil não é base de forja');
    /* 2.23.1: o Knight (regen. de mana = Wound Cleansing, 2,5 HP por mana) agora VESTE esse épico no lugar do anel de regen. de vida 2,4 */
    assert(d.bases.some(p => p.iid === 'epicoBom') || d.reservas.has('epicoBom') || Object.values(d.porVoc).some(v => v.ring && v.ring.melhor && v.ring.melhor.iid === 'epicoBom'), 'épico com regen. de mana 1,1 fica (base, reserva ou no corpo)');
    assert(!d.dispensaveis.some(p => p.iid === 'epicoBom'), 'épico com linha útil não sobra');
    assert(d.dispensaveis.some(p => /^lixo/.test(p.iid)), 'max mana sem uso deveria sobrar');
});
t('2.11.6: a troca do Paladino — anel de max mana sai, regen de mana do depósito entra', () => {
    const anel = (iid, dono, ...at) => ({ iid, nome: 'crystal ring', slot: 'ring', attrs: {}, origem: dono ? 'corpo' : 'depósito', dono, forja: F(1, ...at) });
    const d = M.distribuirEquip([anel('p', 'PALADIN', ['max_mana', 93]), anel('dep', null, ['regen_mana', 1.3])], ['PALADIN']);
    const x = d.porVoc.PALADIN.ring;
    assert(x.melhor.iid === 'dep' && x.ganho > 1, `Paladino: ${x.melhor.iid} +${x.ganho}`);
});
t('2.11.5: dano elemental só no elemento do mago; crítico conta nos magos; roubo de vida vale no Knight', () => {
    const colar = (...at) => ({ nome: 'x', slot: 'necklace', attrs: {}, forja: F(at.length, ...at) });
    const pt = (p, v) => M.pontuarPeca(p, v).pontos;
    assert(pt(colar(['dano_elem_energia', 2]), 'SORCERER') > 0 && pt(colar(['dano_elem_fogo', 2]), 'SORCERER') > 0, 'Feiticeiro: energia e fogo contam');
    assert.strictEqual(pt(colar(['dano_elem_gelo', 2]), 'SORCERER'), 0, 'Feiticeiro: gelo não conta');
    assert.strictEqual(pt(colar(['dano_elem_morte', 2]), 'SORCERER'), 0, 'Feiticeiro: morte não conta');
    assert(pt(colar(['dano_elem_gelo', 2]), 'DRUID') > 0 && pt(colar(['dano_elem_terra', 2]), 'DRUID') > 0, 'Druida: gelo e terra contam');
    assert.strictEqual(pt(colar(['dano_elem_energia', 2]), 'DRUID'), 0, 'Druida: energia não conta');
    assert.strictEqual(pt(colar(['dano_elem_fogo', 2]), 'DRUID'), 0, 'Druida: fogo não conta');
    for (const v of ['SORCERER', 'DRUID']) assert(pt(colar(['critico_chance', 2], ['critico_dano', 10]), v) > 0, v + ': crítico conta (em par)');
    /* 2.11.6 — PAR: chance × porcentagem (wiki). 2.16.3 — crítico tem 50 % de dano de base (premissa, dono 13/10): a chance sozinha já
     * rende; roubo de vida continua precisando do par. */
    assert(pt(colar(['critico_chance', 3]), 'SORCERER') > 0, 'chance de crítico sozinha rende (base 50 %)');
    assert.strictEqual(pt(colar(['roubo_vida_chance', 3]), 'KNIGHT'), 0, 'roubo de vida sem quantia = 0');
    assert.strictEqual(pt(colar(['roubo_vida_chance', 3]), 'KNIGHT'), 0, 'chance de roubo sem quantia = 0');
    const comPar = M.pontuarPeca(colar(['critico_chance', 3]), 'SORCERER', { usando: { SORCERER: { ring: { critico_dano: 20 } } } }).pontos;
    assert(comPar > 0, 'com o dano crítico vestido em outro espaço, a chance passa a valer: ' + comPar);
    /* roll visto ao vivo (2,4 % × 1,7 %) sobre ~27 de dano/s do Knight devolve ~0,01 de vida/s: quase nada */
    const leech = pt(colar(['roubo_vida_chance', 2.4], ['roubo_vida_quantia', 1.7]), 'KNIGHT'), regen = pt(colar(['regen_vida', 1.2]), 'KNIGHT');
    assert(leech < regen / 20, `roubo de vida ${leech} pt × regen 1,2 ${regen} pt`);
});
/* 2.11.16/2.11.19 — regra da comunidade (wiki /forja): encaixe nobre fica guardado enquanto supera o de alguém;
 * quando todos já vestem igual ou melhor, volta às sobras (dono: "quero ter a opção de vender") */
t('encaixe nobre: guardado se supera o vestido; vendável quando todos já vestem igual ou melhor', () => {
    const p = (iid, slot, dono, ...at) => ({ iid, nome: iid, slot, attrs: {}, forja: F(1, ...at), sell: 10, origem: dono ? 'corpo' : 'depósito', dono: dono || null });
    const fracas = ['bota-mana-fraca-1', 'bota-mana-fraca-2', 'bota-mana-fraca-3'].map(i => p(i, 'boots', null, ['regen_mana', 1.1]));
    /* todos com bota de regen. de mana 5: as de 1,1 que não são reserva vão para as sobras, com o motivo */
    const bons = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'].map(v => p('bota-' + v, 'boots', v, ['regen_mana', 5]));
    const d1 = M.distribuirEquip(bons.concat(fracas, [p('bota-loot', 'boots', null, ['chance_de_loot', 0.3])]));
    assert.strictEqual(d1.nobres.length, 0, 'nada a guardar: ' + d1.nobres.map(x => x.iid));
    const vend = d1.dispensaveis.filter(x => /^bota-mana-fraca/.test(x.iid));
    assert(vend.length >= 1 && vend.every(x => /já usam igual ou melhor/.test(x.motivo)), JSON.stringify(vend.map(x => x.motivo)));
    /* o Druida veste bota de loot: a de regen. de mana supera o encaixe dele → vira a melhor dele. 2.15.0 (reservas = 1):
     * das 3 iguais, uma é vestida, uma fica de reserva e a 3.ª vai para as sobras (antes, com 2 reservas, nenhuma ia) */
    const mix = ['KNIGHT', 'PALADIN', 'SORCERER'].map(v => p('bota-' + v, 'boots', v, ['regen_mana', 5])).concat([p('bota-DRUID', 'boots', 'DRUID', ['chance_de_loot', 2])]);
    const d2 = M.distribuirEquip(mix.concat(fracas));
    const ehFraca = iid => /^bota-mana-fraca/.test(iid);
    assert(ehFraca(d2.porVoc.DRUID.boots.melhor.iid), 'o Druida deveria vestir uma bota de regen. de mana');
    assert.strictEqual([...d2.reservas].filter(ehFraca).length, 1, 'uma só de reserva: ' + [...d2.reservas]);
    assert.strictEqual(d2.dispensaveis.filter(x => ehFraca(x.iid)).length, 1, 'a 3.ª nas sobras: ' + d2.dispensaveis.map(x => x.iid));
    /* nobre depende da vocação: regen. de vida só no Knight; ML no anel não é nobre */
    const d3 = M.distribuirEquip(bons.concat([p('bota-vida', 'boots', null, ['regen_vida', 1.1]), p('anel-ml', 'ring', null, ['nivel_magico', 1])]));
    assert(!d3.nobres.some(x => x.iid === 'anel-ml'), 'nível mágico no anel não é encaixe de defesa');
    /* defesa: regen. de mana na frente de todo o resto nos 4; no Knight, depois dela vem a regen. de vida */
    const def = { regen_mana: 2.5, regen_vida: 2.5, max_hp: 33, max_mana: 130, capacidade: 200, chance_de_loot: 1.1, protecao_magica: 2.1, cura_propria: 3.8, resist_fisica: 0.7, escudo: 1.5 };
    const top = (v, ctx) => Object.entries(def).map(([id, val]) => [id, M.pontuarPeca({ slot: 'boots', attrs: {}, forja: F(1, [id, val]) }, v, ctx).pontos]).sort((x, y) => y[1] - x[1]).map(x => x[0]);
    for (const v of ['PALADIN', 'SORCERER', 'DRUID']) assert.strictEqual(top(v, null)[0], 'regen_mana', v);
    assert.deepStrictEqual(top('KNIGHT', null).slice(0, 2), ['regen_mana', 'regen_vida'], 'Knight: regen. de mana em 1º, regen. de vida em 2º (dono)');
    assert.strictEqual(top('SORCERER', { party: { mana: { SORCERER: 95 } } })[0], 'regen_mana', 'com a mana sobrando no mapa também');
});
/* 2.11.18 — dono: "avalia se o regen de mana 2 é maior que 1,9?" — sim, e a troca aparece nos 4 */
t('regen. de mana 2,0 do depósito tira a 1,9 vestida, nos 4', () => {
    const b = (iid, v, origem, dono) => ({ iid, nome: 'bota ' + v, slot: 'boots', attrs: {}, forja: F(1, ['regen_mana', v]), origem, dono });
    for (const voc of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) {
        const x = M.distribuirEquip([b('veste', 1.9, 'corpo', voc), b('dep', 2, 'depósito', null)], [voc]).porVoc[voc].boots;
        assert.strictEqual(x.melhor.iid, 'dep', voc + ' ficou com a 1,9');
        assert(x.ganho > 0, voc + ' ganho ' + x.ganho);
        const igual = M.distribuirEquip([b('veste', 2, 'corpo', voc), b('dep', 2, 'depósito', null)], [voc]).porVoc[voc].boots;
        assert.strictEqual(igual.melhor.iid, 'veste', voc + ': empate fica com a vestida');
    }
});
/* 2.11.20 — encaixe com id/valor fora do formato (maiúsculas, hífen, vírgula) não pode zerar em silêncio */
t('candidatos: id e valor do encaixe normalizados ("Regen-Mana", "1,9")', () => {
    const dep = { entries: [{ iid: 'x', itemName: 'bota', slot: 'feet', forja: { raridade: 1, atributos: [{ id: 'Regen-Mana', valor: '1,9' }] } }] };
    const c = M.candidatosEquip([], dep, { bota: { attrs: {}, sell: 0 } }, []);
    assert.deepStrictEqual(c[0].forja.atributos.map(a => [a.id, a.valor]), [['regen_mana', 1.9]]);
    assert(M.pontuarPeca(c[0], 'DRUID', null).pontos > 9);
});
/* 2.15.0 — link da ficha da peça na wiki oficial */
t('wikiSlug: minúsculas, sem apóstrofo, espaços viram hífen (link da wiki)', () => {
    assert.strictEqual(M.wikiSlug("Dragha's Spellbook"), 'draghas-spellbook');
    assert.strictEqual(M.wikiSlug('dark armor'), 'dark-armor');
    assert.strictEqual(M.wikiSlug('  Wand of Vortex  '), 'wand-of-vortex');
    assert.strictEqual(M.wikiSlug('make-do boots'), 'make-do-boots');
    assert.strictEqual(M.wikiUrlPeca('plate armor'), 'https://tibidle.com/wiki/database/equipamentos/plate-armor');
});
t('reservas: só a 2.ª melhor de cada slot fica; a 3.ª vai para as sobras (dono, 07/10)', () => {
    assert.strictEqual(M.EQUIP_RESERVAS, 1);
    const anel = (iid, regen) => ({ iid, nome: 'crystal ring', slot: 'ring', attrs: base['crystal ring'].attrs, equipPreview: null, sell: 250,
        origem: iid === 'a' ? 'corpo' : 'depósito', dono: iid === 'a' ? 'SORCERER' : null, forja: F(1, ['regen_mana', regen]) });
    const R = M.distribuirEquip([anel('a', 2.3), anel('b', 1.5), anel('c', 1.1)], ['SORCERER'], null);
    assert(R.usadas.has('a'), 'a melhor (2,3) no corpo');
    assert.deepStrictEqual([...R.reservas], ['b'], 'só a 2.ª melhor é reserva');
    assert(R.dispensaveis.some(p => p.iid === 'c'), 'a 3.ª cai nas sobras');
});
t('destinosSobras: comum vai ao NPC, incomum+ ao Mercado, peça no corpo fica à parte', () => {
    const d = M.destinosSobras({ dispensaveis: [
        { iid: '1', nome: 'lightning robe', origem: 'depósito', sell: 11000, forja: F(0) },
        { iid: '2', nome: 'blue robe', origem: 'mochila', sell: 3000, forja: F(0) },
        { iid: '3', nome: 'plate armor', origem: 'depósito', sell: 400, forja: F(2, ['resist_sagrado', 1.4]) },
        { iid: '4', nome: 'crowbar', origem: 'depósito', sell: 50, forja: { raridade: 0, refino: 2, atributos: [] } },
        { iid: '5', nome: 'glacial rod', origem: 'corpo', dono: 'DRUID', sell: 6500, forja: F(0) }] });
    assert.deepStrictEqual(d.npc.map(p => p.iid), ['1', '2'], 'comuns sem refino, fora do corpo');
    assert.strictEqual(d.npcOuro, 14000);
    assert.deepStrictEqual(d.mercado.map(p => p.iid), ['3', '4'], 'incomum ou refinada: o NPC não compra');
    assert.deepStrictEqual(d.corpo.map(p => p.iid), ['5']);
    assert.deepStrictEqual(M.destinosSobras(null), { npc: [], mercado: [], corpo: [], protegidas: [], npcOuro: 0 });
});
t('2.35.4 cadeado do jogo (Proteger): peça protegida não vai ao NPC, ao Mercado nem ao desmanche, nem com "incluir"', () => {
    const res = { dispensaveis: [
        { iid: '1', nome: 'lightning robe', origem: 'depósito', sell: 11000, forja: F(0), protegida: true },
        { iid: '2', nome: 'blue robe', origem: 'mochila', sell: 3000, forja: F(0) },
        { iid: '3', nome: 'plate armor', origem: 'depósito', sell: 400, forja: F(1), protegida: true },
        { iid: '4', nome: 'plate armor', origem: 'mochila', sell: 400, forja: F(1) }] };
    const d = M.destinosSobras(res);
    assert.deepStrictEqual(d.npc.map(p => p.iid), ['2']);
    assert.strictEqual(d.npcOuro, 3000, 'o ouro do NPC não conta a protegida');
    assert.deepStrictEqual(d.mercado.map(p => p.iid), ['4']);
    assert.deepStrictEqual(d.protegidas.map(p => p.iid), ['1', '3']);
    assert.deepStrictEqual(M.pecasDesmanche(res, () => false).map(x => x.iid), ['4']);
    assert.deepStrictEqual(M.pecasDesmanche(res, null, true).map(x => x.iid), ['4'], 'nem com incluir marcado');
});
t('2.16.0: chance de cada linha por Atributo T1 (wiki /forja: ML cai 1 em 89 na arma, regen. de mana 10 em 132 na defesa)', () => {
    assert(Math.abs(M.chanceLinha('nivel_magico', 'weapon', []) - 1 / 89) < 1e-9, 'ML na arma = 1/89');
    assert(Math.abs(M.chanceLinha('regen_mana', 'armor', []) - 10 / 132) < 1e-9, 'regen. de mana na armadura = 10/132');
    assert(Math.abs(M.chanceLinha('dano_elem_fogo', 'necklace', []) - 10 / 89) < 1e-9, 'fogo no colar = 10/89');
    assert.strictEqual(M.chanceLinha('regen_mana', 'weapon', []), 0, 'linha de defesa não cai em arma');
    assert.strictEqual(M.chanceLinha('nivel_magico', 'weapon', [{ id: 'nivel_magico', valor: 1 }]), 0, 'linha que a peça já tem não repete');
    assert(Math.abs(M.chanceLinha('nivel_magico', 'weapon', [{ id: 'dano_fisico', valor: 2 }]) - 1 / 79) < 1e-9, 'com dano físico já na peça o sorteio é entre 79');
    /* valores por faixa (wiki): regen 1,1–1,7 na I e 5,2 na VI; skill 1–3 na IV; dano mágico 0,5–1,3 na I */
    assert.deepStrictEqual(M.faixaRange('regen_mana', 1), [1.1, 1.7]); assert.deepStrictEqual(M.faixaRange('regen_vida', 6), [5.2, 5.2]);
    assert.deepStrictEqual(M.faixaRange('nivel_magico', 4), [1, 3]); assert.deepStrictEqual(M.faixaRange('dano_magico', 1), [0.5, 1.3]);
    assert.deepStrictEqual(M.faixaRange('resist_fogo', 3), [1.2, 3.1]); assert.deepStrictEqual(M.faixaRange('resist_fisica', 3), [0.4, 1.0]);
    assert.strictEqual(M.valorTipico('regen_mana', 1), 1.4);
    assert.strictEqual(M.FAIXA_NOME[2], 'III Superior');
});
t('2.16.0: fragmentos do desmanche pela faixa da potência TOTAL × raridade; destino Mercado × desmanche', () => {
    const p = (r, pot, refino) => ({ nome: 'x', slot: 'ring', attrs: {}, forja: { raridade: r, refino: refino || 0, potenciaBase: pot, atributos: [] } });
    assert.deepStrictEqual(M.fragmentosDesmanche(p(3, 271, 3)).n, 21, 'Épico 271 +3 = 421 (faixa III) → 21');
    assert.strictEqual(M.fragmentosDesmanche(p(0, 500)).n, 0, 'Comum não desmancha');
    assert.strictEqual(M.fragmentosDesmanche(p(1, 50)).n, 1); assert.strictEqual(M.fragmentosDesmanche(p(5, 1000)).n, 300);
    const l = M.fragmentosDesmanche(p(4, 850)); assert.strictEqual(l.n, 120); assert.strictEqual(l.t2, 0.25); assert.strictEqual(l.faixa, 5);
    /* Raro faixa II = 6 fragmentos × 2.000 = 12k: ref. 100k vai ao Mercado (líquido 95k); ref. 10k desmancha; sem ref., o dono decide */
    const raro = p(2, 250);
    const a = M.escolherDestino(raro, 100000, null); assert.strictEqual(a.destino, 'mercado'); assert.strictEqual(a.liquido, 95000); assert.strictEqual(a.desmanche, 12000); assert(a.estimado);
    const b = M.escolherDestino(raro, 10000, 2000); assert.strictEqual(b.destino, 'desmanche'); assert.strictEqual(b.liquido, 9500);
    assert.strictEqual(M.escolherDestino(raro, null, 2000).destino, 'mercado?');
    assert.strictEqual(M.escolherDestino(raro, 10000, 1500).desmanche, 9000, 'preço do fragmento lido no Mercado');
    assert.strictEqual(M.escolherDestino(p(0, 100), 5000, 2000).destino, 'mercado', 'Comum sem fragmento: só o Mercado');
});
t('2.16.0: Épico sem linha útil vai para as sobras (não é base de forja); Épico com uma linha boa continua base', () => {
    /* espada do Knight com 3 linhas mortas nele (dano elemental ×2 e distância): rolar skill cai 1 em 89 — anuncie ou desmanche */
    const esp = (iid, dono, r, ...at) => ({ iid, nome: 'fire sword', slot: 'weapon', attrs: { weaponType: 'sword', attack: 24 }, origem: dono ? 'corpo' : 'depósito', dono, forja: Object.assign(F(r, ...at), { potenciaBase: 120 }) });
    const anel = (iid, dono, r, ...at) => ({ iid, nome: 'crystal ring', slot: 'ring', attrs: {}, origem: dono ? 'corpo' : 'depósito', dono, forja: F(r, ...at) });
    const pcs = [
        esp('k', 'KNIGHT', 1, ['dano_fisico', 2]),
        esp('morta', null, 3, ['dano_elem_fogo', 3], ['dano_elem_gelo', 2], ['distancia', 1]),
        esp('viva', null, 3, ['dano_elem_fogo', 3], ['dano_elem_gelo', 2], ['corpo_a_corpo', 1]),
        esp('res', null, 1, ['dano_fisico', 1.5]),
        anel('p', 'PALADIN', 1, ['regen_mana', 1.3]), anel('s', 'SORCERER', 1, ['regen_mana', 1.2]), anel('d', 'DRUID', 1, ['regen_mana', 2.3])
    ];
    const d = M.distribuirEquip(pcs, undefined, { party: { fisico: 0.95, tomadoS: 25 } });
    assert(!d.bases.some(p => p.iid === 'morta'), 'Épico com 3 linhas mortas não é base de forja');
    const m = d.dispensaveis.find(p => p.iid === 'morta');
    assert(m, 'Épico sem linha útil deveria estar nas sobras (reservas: ' + [...d.reservas] + ')');
    assert(/sem linha útil/.test(m.motivo) && /1 em 89/.test(m.motivo), 'motivo deveria explicar: ' + m.motivo);
    assert(d.bases.some(p => p.iid === 'viva') || d.usadas.has('viva') || d.reservas.has('viva'), 'Épico com corpo a corpo +1 fica (base, uso ou reserva)');
    assert(!d.dispensaveis.some(p => p.iid === 'viva'), 'Épico com linha boa não sobra');
    assert.deepStrictEqual(M.linhasUteis(pcs[1], 'KNIGHT', null), [], 'nenhuma linha vale para o Knight');
    /* ao vivo (12/10): fur boots Épico de potência 27 com resist terra 1, capacidade 76 e regen vida 1,5 passava como base do Druida — linha
     * só é útil se rende ≥ 40 % da melhor linha possível no espaço (regen. de mana, no Druida) ou se é skill que a vocação usa */
    const fur = { iid: 'fur', nome: 'fur boots', slot: 'boots', attrs: {}, origem: 'corpo', dono: 'DRUID', forja: Object.assign(F(3, ['resist_terra', 1], ['capacidade', 76], ['regen_vida', 1.5]), { potenciaBase: 27 }) };
    assert.deepStrictEqual(M.linhasUteis(fur, 'DRUID', null), [], 'resist 1 %, capacidade 76 e regen vida 1,5 não são linhas úteis no Druida');
    const furRegen = Object.assign({}, fur, { forja: Object.assign(F(3, ['resist_terra', 1], ['capacidade', 76], ['regen_mana', 1.5]), { potenciaBase: 27 }) });
    assert.deepStrictEqual(M.linhasUteis(furRegen, 'DRUID', null), ['regen_mana'], 'regen. de mana 1,5 é a linha útil');
    const dFur = M.distribuirEquip([fur, pcs[4], pcs[5]], undefined, { party: { fisico: 0.95, tomadoS: 25 } });
    assert(!dFur.bases.some(p => p.iid === 'fur'), 'fur boots Épico sem linha útil (para os magos) não é base de forja');
    /* 2.16.2 — com o Cavaleiro na conta a mesma bota é base DELE (regen. de vida 1,5 é linha nobre do Knight) e o plano é para ele,
     * não para o Druida (que só "ganharia mais" com uma regen. de mana que a peça não tem) */
    assert.deepStrictEqual(M.linhasUteis(fur, 'KNIGHT', null), ['regen_vida']);
    assert.strictEqual(M.planoForja(fur, undefined, null, null).voc, 'KNIGHT', 'plano para quem já aproveita a linha');
    assert.strictEqual(M.planoForja(furRegen, undefined, null, null).voc, 'KNIGHT', 'regen. de mana: quem mais ganha com ela (2.23.1: o Knight, que a transforma em Wound Cleansing; até 2.23.0 era o Druida)');
    assert.deepStrictEqual(M.linhasUteis(pcs[2], 'KNIGHT', null), ['corpo_a_corpo']);
    assert.deepStrictEqual(M.linhasUteis(pcs[2], 'SORCERER', null), [], 'Feiticeiro não veste espada');
    /* planoForja: peça que já tem a linha rara avisa para não apagar; peça sem ela avisa a chance de 1 em 89 */
    const pv = M.planoForja(pcs[2], ['KNIGHT'], null, null);
    assert(pv.temRara && /NUNCA apague/.test(pv.passos.join(' ')), 'corpo a corpo +1 é linha rara: não apagar — ' + pv.passos.join(' | '));
    const pm = M.planoForja(pcs[1], ['KNIGHT'], null, null);
    assert(!pm.temRara && /1 em 68/.test(pm.passos.join(' ')) && /não role/.test(pm.passos.join(' ')), 'sem a linha rara: avisar a chance (89 − 10 − 10 − 1 = 68 com fogo, gelo e distância já na peça) — ' + pm.passos.join(' | '));
    assert(pm.linhasAlvo.every(x => typeof x.chance === 'number' && Array.isArray(x.range)), 'linhas-alvo levam chance e range');
    assert.strictEqual(pm.faixaNome, 'I Simples');
});
t('2.16.0: Paladino — mínimo do tiro é 60 % do máximo (update 1.0.13): +1 de distância vale um pouco mais que antes; 2.34.3: + as Ethereal Spears', () => {
    /* nível 67, distância 36 (REF_SK): antes 0,045·25/(13,4 + 0,045·25·36) = 2,08 % do tiro; agora 0,09·25/(13,4 + 0,09·25·36) = 2,40 % */
    /* 2.38.0: com a mana quase de graça o piso (2 × regen. de mana) sai da frente e a fórmula aparece; na referência vale o piso */
    const P = M.pesosDaVoc('PALADIN', { party: { dpm: { PALADIN: 0.1 } } });
    const tiro = 100 * (0.09 * 25) / (67 / 5 + 0.09 * 25 * 36);
    /* 2.34.3: as Spears (fórmulas do catálogo) também sobem com a Distância — referência: 30 % do dano dele */
    const spear = (100 * (2 / 3) / (67 / 5 + (36 + 25) * 2 / 3) + 100 * 5.6 / (67 / 5 + 10 + 5.6 * 36)) / 2;
    const esperado = 0.26 * (0.05 * tiro + 0.3 * spear);
    assert(Math.abs(P.distancia - esperado) < 0.01, `distância ${P.distancia} ≠ ${esperado}`);
    const ref = M.pesosDaVoc('PALADIN', null);
    assert(Math.abs(ref.distancia - Math.max(esperado, 2 * ref.regen_mana)) < 0.01, `referência: o maior entre a fórmula e 2 × regen. (${ref.distancia})`);
    assert(P.distancia > 5 * 0.26 * 0.05 * tiro, 'com as Spears a Distância vale mais de 5× o que valia só pelo tiro');
    assert(P.distancia > 0.26 * 0.05 * 100 * (0.045 * 25) / (67 / 5 + 0.045 * 25 * 36), 'deveria valer mais que pela fórmula antiga');
    assert(M.REGRAS_VOCACAO.PALADIN.some(x => /BESTA/.test(x)) && M.REGRAS_VOCACAO.SORCERER.some(x => /NÍVEL MÁGICO/.test(x)), 'regras por vocação em palavras');
});
t('2.34.3 Paladino: Distância medida nas Spears manda (fracDist), ML dele cai o que as Spears não usam, dano sagrado é nobre na arma e no colar', () => {
    const barato = { PALADIN: 0.1 }; // 2.38.0: mana quase de graça → o piso da distância/sagrado sai da frente e a fórmula aparece
    const ref = M.pesosDaVoc('PALADIN', { party: { dpm: barato } });
    const comSpear = M.pesosDaVoc('PALADIN', { party: { fracDist: 0.6, fracMagica: { PALADIN: 0.95 }, dpm: barato } });
    const semSpear = M.pesosDaVoc('PALADIN', { party: { fracDist: 0, fracMagica: { PALADIN: 0.95 }, dpm: barato } });
    assert(comSpear.distancia > ref.distancia && ref.distancia > semSpear.distancia && semSpear.distancia > 0, JSON.stringify([semSpear.distancia, ref.distancia, comSpear.distancia]));
    assert(comSpear.nivel_magico < ref.nivel_magico && ref.nivel_magico < semSpear.nivel_magico, 'as Spears não usam ML: ' + JSON.stringify([semSpear.nivel_magico, ref.nivel_magico, comSpear.nivel_magico]));
    assert(Math.abs(comSpear.dano_elem_sagrado - ref.dano_elem_sagrado) < 1e-9 && ref.dano_elem_sagrado > ref.dano_elem_fogo * 5, 'sagrado = fracSagrado × fatia; os outros elementos só o resto');
    /* tudo medido (Spears + sagrado = toda a magia): nada sobra para os outros elementos, e nunca negativo */
    const cheio = M.pesosDaVoc('PALADIN', { party: { fracDist: 0.5, fracSagrado: 0.5, fracMagica: { PALADIN: 0.95 }, dpm: barato } });
    assert(cheio.dano_elem_fogo === 0 && cheio.distancia > 0, JSON.stringify([cheio.dano_elem_fogo, cheio.distancia]));
    const colar = (id) => ({ nome: 'x', slot: 'necklace', attrs: {}, forja: F(1, [id, 5]) });
    assert(M.encaixeNobre(colar('dano_elem_sagrado'), 'PALADIN') && !M.encaixeNobre(colar('dano_elem_sagrado'), 'KNIGHT') && !M.encaixeNobre(colar('dano_elem_sagrado'), 'SORCERER'), 'dano sagrado: nobre só para o Paladino');
    assert(M.encaixeNobre({ nome: 'y', slot: 'legs', attrs: {}, forja: F(1, ['dano_elem_sagrado', 5]) }, 'PALADIN') === false, 'na calça não é nobre (só arma e colar)');
});
/* 2.18.1 — dono: "arco e besta têm status e dano também": o ataque e o acerto do arco/besta contam no Paladino */
t('arco/besta: ataque (composite hornbow 3) e acerto (elvish bow 5) contam no Paladino; arco simples continua 0', () => {
    const arma = (nome) => ({ nome, slot: 'weapon', attrs: base[nome].attrs, forja: F(0) });
    const pal = (nome) => M.pontuarPeca(arma(nome), 'PALADIN', null);
    assert.strictEqual(pal('bow').pontos, 0);
    assert(pal('composite hornbow').detalhe.some(d => d.id === 'attack' && d.pt > 0), 'ataque do hornbow não contou');
    assert(pal('elvish bow').detalhe.some(d => d.id === 'hitchance' && d.pt > 0), 'acerto do elvish bow não contou');
    assert(pal('composite hornbow').pontos > pal('bow').pontos && pal('elvish bow').pontos > pal('bow').pontos);
});
/* 2.18.2 — dono: "escudo def 18 + regen. mana 2,3 + regen. vida 2 × Vampire Shield 34 sem status" */
t('defesa do Knight na medida: com a vida mínima ≥ 60 % o escudo com regen. ganha do Vampire Shield 34; sem medida, empate como antes', () => {
    const meu = { slot: 'shield', attrs: { weaponType: 'shield', defense: 18 }, forja: F(2, ['regen_mana', 2.3], ['regen_vida', 2]) };
    const vamp = { slot: 'shield', attrs: { weaponType: 'shield', defense: 34 }, forja: F(0) };
    const pt = (p, ctx) => M.pontuarPeca(p, 'KNIGHT', ctx).pontos;
    assert(pt(meu, { party: { hpMinK: 70 } }) > pt(vamp, { party: { hpMinK: 70 } }) + 5, 'folgado: o seu tem que ganhar com folga');
    /* 2.23.1: com a regen. de mana do Knight valendo 2,5 HP/s por mana/s, as duas linhas (≈ 7,8 HP/s) empatam com os +16 de defesa
     * (≈ 7,4 HP/s bloqueados a 0,45 golpes/s); o que o teste garante é que a defesa PESA MAIS quando ele anda apertado */
    const gap = (hp) => pt(meu, { party: { hpMinK: hp } }) - pt(vamp, { party: { hpMinK: hp } });
    assert(gap(30) < gap(70) - 5, 'apertado: a defesa volta a pesar (vantagem do escudo com regen. cai de ' + gap(70).toFixed(1) + ' para ' + gap(30).toFixed(1) + ')');
    /* bloqueio: no máximo ~1 por segundo — com 3 golpes/s a defesa não triplica, a armadura sim */
    const P = M.pesosDaVoc('KNIGHT', { party: { golpesS: 3 } });
    assert(P.armor > P.defense * 2.5, 'armadura ' + P.armor + ' × defesa ' + P.defense);
});
/* 2.20.0 — FÓRMULAS OFICIAIS (wiki /como-o-dano-e-calculado, 16/10, com os exemplos numéricos dela; Canary bate) */
t('2.20.0 oficial: bloqueio do escudo = (Escudo/4 + 2,23) × defesa × 0,08 — Escudo 10 + Wooden Shield 14 tira 2–5 (exemplo da wiki)', () => {
    assert.deepStrictEqual(M.bloqueioEscudo(10, 14), { min: 2, max: 5, medio: 3.5 });
    assert.deepStrictEqual(M.bloqueioEscudo(10, 0), { min: 0, max: 0, medio: 0 }, 'sem escudo não há bloqueio');
    assert(M.bloqueioEscudo(80, 14).max > M.bloqueioEscudo(10, 14).max, 'a skill Escudo aumenta o bloqueio');
});
t('2.20.0 oficial: mitigação — Escudo 10 + defesa 14 = 0,34 %; Escudo 80 + defesa 30 = 1,33 % (exemplos da wiki)', () => {
    assert.strictEqual(M.mitigacaoPct('KNIGHT', 10, 14), 0.34);
    assert.strictEqual(M.mitigacaoPct('KNIGHT', 80, 30), 1.33);
    assert.strictEqual(M.COMBATE_VOC.PALADIN.mit, 1.28, 'constantes do cliente do jogo');
});
t('2.20.0 oficial: armadura 7 tira 3–5; 1 a 3 tira 1; 0 não tira; a inclinação média é 0,75 por ponto', () => {
    assert.deepStrictEqual(M.reducaoArmadura(7), { min: 3, max: 5, medio: 4 });
    assert.deepStrictEqual(M.reducaoArmadura(3), { min: 1, max: 1, medio: 1 });
    assert.deepStrictEqual(M.reducaoArmadura(0).medio, 0);
    assert.strictEqual(Math.round((M.reducaoArmadura(40).medio - M.reducaoArmadura(20).medio) / 20 * 100) / 100, 0.75);
});
t('2.20.0 oficial: golpe básico — Knight nível 8 skill 10 Sword 14 → 1–14, soco (6) → 1–7; Paladino Bow+Arrow 25 → 14–24; wand fixa', () => {
    assert.deepStrictEqual([M.golpeBasico('KNIGHT', 8, 10, 14).min, M.golpeBasico('KNIGHT', 8, 10, 14).max], [1, 14]);
    assert.deepStrictEqual([M.golpeBasico('KNIGHT', 8, 10, 6).min, M.golpeBasico('KNIGHT', 8, 10, 6).max], [1, 7]);
    assert.deepStrictEqual([M.golpeBasico('PALADIN', 8, 10, 25).min, M.golpeBasico('PALADIN', 8, 10, 25).max], [14, 24]);
    assert.deepStrictEqual([M.golpeBasico('SORCERER', 8, 10, 0, { fromDamage: 8, toDamage: 18 }).min, M.golpeBasico('SORCERER', 8, 10, 0, { fromDamage: 8, toDamage: 18 }).max], [8, 18]);
});
t('2.20.0 oficial: ordem do golpe no Knight — proteção antes do bloqueio e da armadura; magia ignora escudo e armadura', () => {
    const d = { voc: 'KNIGHT', skEscudo: 10, defEscudo: 14, armadura: 7, protFisica: 0, cargas: 1 };
    /* 100 bruto → bloqueio 3,5 → armadura 4 → 92,5 → mitigação 0,34 % → 92,19 */
    assert.strictEqual(Math.round(M.danoRecebidoCorpo(100, d) * 100) / 100, 92.19);
    assert.strictEqual(Math.round(M.danoRecebidoCorpo(100, Object.assign({}, d, { protFisica: 10 })) * 100) / 100, Math.round((90 - 7.5) * (1 - 0.0034) * 100) / 100, 'a proteção desconta sobre o bruto');
    assert.strictEqual(Math.round(M.danoRecebidoCorpo(100, Object.assign({}, d, { cargas: 0 })) * 100) / 100, Math.round(96 * (1 - 0.0034) * 100) / 100, 'sem carga não há bloqueio');
    const m = M.danoRecebidoMagia(100, { voc: 'KNIGHT', skEscudo: 10, defEscudo: 14, protElem: 10, protMagica: 5 });
    assert.strictEqual(Math.round(m * 100) / 100, Math.round(100 * (1 - 0.145) * (1 - 0.0034) * 100) / 100, 'magia: proteções compostas (10 % + 5 % = 14,5 %) e mitigação; nada de armadura');
    assert.strictEqual(M.protecaoComposta([50, 50]), 75);
    assert.strictEqual(M.protecaoComposta([80, 80]), 96);
});
t('2.20.0 pesos: +1 de defesa do escudo vale mais com Escudo alto; +1 de Escudo vale mais com escudo forte; proteção física conta sobre o bruto', () => {
    const P10 = M.pesosDaVoc('KNIGHT', { sk: { KNIGHT: { escudo: 10 } }, kn: { defEscudo: 30, armadura: 40 } });
    const P80 = M.pesosDaVoc('KNIGHT', { sk: { KNIGHT: { escudo: 80 } }, kn: { defEscudo: 30, armadura: 40 } });
    assert(P80.defense > P10.defense * 1.5, `defesa: Escudo 80 ${P80.defense} × Escudo 10 ${P10.defense}`);
    const E14 = M.pesosDaVoc('KNIGHT', { sk: { KNIGHT: { escudo: 60 } }, kn: { defEscudo: 14, armadura: 40 } });
    const E34 = M.pesosDaVoc('KNIGHT', { sk: { KNIGHT: { escudo: 60 } }, kn: { defEscudo: 34, armadura: 40 } });
    assert(E34.escudo > E14.escudo * 1.8, `escudo (skill): defesa 34 ${E34.escudo} × 14 ${E14.escudo}`);
    assert(P80.fichaDefesa && P80.fichaDefesa.lido && P80.fichaDefesa.bloq.max === M.bloqueioEscudo(80, 30).max);
    /* a proteção física vale sobre o golpe bruto (tomado + o que escudo e armadura já tiram): maior que a conta antiga k1 × físico */
    const R = { tomadoS: 30, fisico: 0.65, golpesS: 0.45 };
    const P = M.pesosDaVoc('KNIGHT', { party: R, kn: { defEscudo: 34, armadura: 40 } });
    assert(P.resist_fisica > 30 / 100 * 3.6 * 0.65, 'proteção física: ' + P.resist_fisica);
    assert(M.pesosDaVoc('KNIGHT', {}).fichaDefesa.lido === false, 'sem leitura do que veste: referência');
});
t('2.20.1 "no jogo": escudo do Knight mostra bloqueio e mitigação antes → depois com a skill Escudo; peça de armadura mostra a armadura total', () => {
    const ctx = { sk: { KNIGHT: { escudo: 60, melee: 70 } }, nivel: 126, kn: { defEscudo: 14, armadura: 40 } };
    const e14 = { slot: 'shield', attrs: { weaponType: 'shield', defense: 14 }, forja: F(0) }, e34 = { slot: 'shield', attrs: { weaponType: 'shield', defense: 34 }, forja: F(0) };
    const t = M.efeitoOficial(e34, e14, 'KNIGHT', ctx);
    const b1 = M.bloqueioEscudo(60, 14), b2 = M.bloqueioEscudo(60, 34);
    assert(t && t.includes(`bloqueio ${b1.min}–${b1.max} → ${b2.min}–${b2.max} por golpe (Escudo 60)`), t);
    assert(/mitigação \d,\d\d → \d,\d\d %/.test(t), t);
    const h6 = { slot: 'head', attrs: { slot: 'head', armor: 6 }, forja: F(0) }, h9 = { slot: 'head', attrs: { slot: 'head', armor: 9 }, forja: { raridade: 0, refino: 2, atributos: [] } };
    const a = M.efeitoOficial(h9, h6, 'KNIGHT', ctx);
    const r1 = M.reducaoArmadura(40), r2 = M.reducaoArmadura(45);
    assert(a === `armadura 40 → 45: tira ${r1.min}–${r1.max} → ${r2.min}–${r2.max} por golpe`, a);
    assert(/referência/.test(M.efeitoOficial(h9, h6, 'KNIGHT', { sk: {} })), 'sem leitura do corpo avisa');
});
t('2.20.1 "no jogo": golpe do Knight, tiro do Paladino (munição grátis do arco/besta), wand do mago e proteção composta', () => {
    const ctx = { sk: { KNIGHT: { melee: 70 }, PALADIN: { dist: 80 } }, nivel: 126, usando: { SORCERER: { ring: { resist_fogo: 2 } } } };
    const w1 = { slot: 'weapon', attrs: { weaponType: 'axe', attack: 40 }, forja: F(0) }, w2 = { slot: 'weapon', attrs: { weaponType: 'axe', attack: 48 }, forja: { raridade: 0, refino: 2, atributos: [] } };
    const g1 = M.golpeBasico('KNIGHT', 126, 70, 40), g2 = M.golpeBasico('KNIGHT', 126, 70, 50);
    assert.strictEqual(M.efeitoOficial(w2, w1, 'KNIGHT', ctx), `golpe ${g1.min}–${g1.max} → ${g2.min}–${g2.max} (Corpo a Corpo 70)`);
    const bow = { slot: 'weapon', attrs: { weaponType: 'distance', ammotype: 'arrow', attack: 0 }, forja: F(0) }, xbow = { slot: 'weapon', attrs: { weaponType: 'distance', ammotype: 'bolt', attack: 3 }, forja: F(0) };
    const p1 = M.golpeBasico('PALADIN', 126, 80, 25), p2 = M.golpeBasico('PALADIN', 126, 80, 33);
    assert.strictEqual(M.efeitoOficial(xbow, bow, 'PALADIN', ctx), `tiro ${p1.min}–${p1.max} → ${p2.min}–${p2.max} (Distância 80, bolt 30 grátis)`);
    const vortex = { slot: 'weapon', attrs: base['wand of vortex'].attrs, forja: F(0) }, inferno = { slot: 'weapon', attrs: base['wand of inferno'].attrs, forja: F(0) };
    assert.strictEqual(M.efeitoOficial(inferno, vortex, 'SORCERER', ctx), 'tiro 8–18 energy → 56–74 fire (8 de mana)');
    /* anel com resist fogo 3 entra composto com os 2 % que o outro anel já dá: 2 → 4,9 % */
    const r0 = { slot: 'necklace', attrs: {}, forja: F(0) }, r3 = { slot: 'necklace', attrs: {}, forja: F(1, ['resist_fogo', 3]) };
    assert.strictEqual(M.efeitoOficial(r3, r0, 'SORCERER', ctx), 'proteção fogo 2,0 → 4,9 %');
    assert.strictEqual(M.efeitoOficial(r0, r0, 'SORCERER', ctx), null, 'sem nada a dizer: null');
});
t('2.21.0 elementos medidos: Knight que toma 80 % de fogo dá à proteção de fogo muito mais que à de gelo; lateral medido ganha peso de resistência', () => {
    const party = { tomadoS: 30, fisico: 0.2, golpesS: 0.3, elemVoc: { KNIGHT: { tomadoS: 30, frac: { fisico: 0.2, fogo: 0.8 } }, SORCERER: { tomadoS: 6, frac: { fogo: 1 } } } };
    const K = M.pesosDaVoc('KNIGHT', { party });
    assert(K.elemMedido && K.resist_fogo > K.resist_gelo * 20 && K.resist_gelo === 0, `fogo ${K.resist_fogo} × gelo ${K.resist_gelo}`);
    assert(Math.abs(K.resist_fogo - 30 / 100 * 3.6 * 0.8) < 0.01, 'fogo = tomado/100 × 3,6 × fração: ' + K.resist_fogo);
    const S = M.pesosDaVoc('SORCERER', { party });
    assert(S.elemMedido && Math.abs(S.resist_fogo - 6 / 100 * 0.5) < 0.001 && S.resist_gelo === 0, `Feiticeiro fogo ${S.resist_fogo} (6/s medido), gelo ${S.resist_gelo}`);
    const K0 = M.pesosDaVoc('KNIGHT', {});
    assert(!K0.elemMedido && K0.resist_fogo === K0.resist_gelo, 'sem medida: divisão igual como antes');
});
/* 2.22.0 — lido do cliente do jogo (c14): Legado, Loyalty e o simulador da forja com as regras exatas */
t('2.22.0 Legado: marco a cada 5 de skill treinada acima do limiar (60 melee/dist, 40 ML); bônus n(n+3)/2 %: I +2, II +5, III +9, IV +14, V +20', () => {
    assert.deepStrictEqual([M.legadoDe('KNIGHT', 59).marco, M.legadoDe('KNIGHT', 60).marco, M.legadoDe('KNIGHT', 64).marco, M.legadoDe('KNIGHT', 65).marco, M.legadoDe('SORCERER', 40).marco, M.legadoDe('DRUID', 62).marco], [0, 1, 1, 2, 1, 5]);
    assert.deepStrictEqual([1, 2, 3, 4, 5].map(n => M.legadoDe('KNIGHT', 60 + (n - 1) * 5).bonusPct), [2, 5, 9, 14, 20]);
    const l = M.legadoDe('PALADIN', 73);
    assert.deepStrictEqual([l.marco, l.bonusPct, l.proximaSkill, l.proximoBonusPct], [3, 9, 75, 14]);
    assert.strictEqual(M.legadoDe('KNIGHT', 0).marco, 0);
    assert.deepStrictEqual([0, 1, 3, 6, 9, 15, 40].map(M.loyaltyBonus), [0, 1, 2, 3, 4, 5, 5]);
    const ctx = { sk: { KNIGHT: { melee: 70 } }, nivel: 126, legado: { KNIGHT: M.legadoDe('KNIGHT', 70) } };
    const w1 = { slot: 'weapon', attrs: { weaponType: 'axe', attack: 40 }, forja: F(0) }, w2 = { slot: 'weapon', attrs: { weaponType: 'axe', attack: 48 }, forja: F(0) };
    const g2 = M.golpeBasico('KNIGHT', 126, 70, 48);
    assert(M.efeitoOficial(w2, w1, 'KNIGHT', ctx).includes(`→ ${Math.round(g2.min * 1.09)}–${Math.round(g2.max * 1.09)} (Corpo a Corpo 70, Legado +9 %)`), M.efeitoOficial(w2, w1, 'KNIGHT', ctx));
});
t('2.22.0 simulador da forja: determinístico com semente; valor uniforme nos passos do range; linha nunca repete; raridade antes do Atributo quando não há encaixe', () => {
    const rnd0 = () => 0, rnd1 = () => 0.999;
    assert.strictEqual(M.forjaValorSorteado('regen_mana', 2, rnd0), 1.1);
    assert.strictEqual(M.forjaValorSorteado('regen_mana', 2, rnd1), 2.5);
    assert.strictEqual(M.forjaValorSorteado('nivel_magico', 4, rnd1), 3);
    assert.notStrictEqual(M.forjaLinhaSorteada('boots', [{ id: 'regen_mana', valor: 2 }], () => 0.9999), 'regen_mana');
    const peca = { slot: 'boots', forja: { raridade: 1, refino: 0, potenciaBase: 100, atributos: [{ id: 'regen_mana', valor: 2 }] } };
    const a = M.forjaSimular(peca, { linha: 'regen_vida' }, { n: 400, seed: 3 }), b = M.forjaSimular(peca, { linha: 'regen_vida' }, { n: 400, seed: 3 });
    assert.strictEqual(JSON.stringify(a), JSON.stringify(b), 'mesma semente, mesmo resultado');
    assert(a.sucesso > 0.95 && a.porGema.raridade >= 1 && a.porGema.atributo >= 1 && a.gemas90 >= a.gemas, JSON.stringify(a));
    /* regen. de vida pesa 10 de 122 no pool sem regen. de mana: ≈ 12 Atributos + 11 Limpezas Maiores + 2,9 Raridades (1/0,35) */
    assert(a.porGema.atributo > 8 && a.porGema.atributo < 17 && Math.abs(a.porGema.raridade - 1 / 0.35) < 0.6, JSON.stringify(a.porGema));
    const c = M.forjaSimular(peca, { linhas: ['regen_vida', 'cura_propria', 'resist_fogo'] }, { n: 400, seed: 3 });
    assert(c.gemas < a.gemas, c.gemas + ' < ' + a.gemas);
    const d = M.forjaSimular(peca, { linha: 'regen_vida', valorMin: 1.5 }, { n: 400, seed: 3 });
    assert(d.gemas > a.gemas && d.porGema.refazer_maior > 0, JSON.stringify(d.porGema));
    assert.strictEqual(M.forjaSimular(peca, { linha: 'regen_vida', valorMin: 2.4 }, { n: 50, seed: 3 }).sucesso, 0, 'valor acima do teto da faixa I (1,7): impossível sem refinar');
    const e = M.forjaSimular({ slot: 'armor', forja: { raridade: 2, refino: 3, potenciaBase: 100, atributos: [] } }, { refino: 5, garantia: true }, { n: 300, seed: 9, precos: { refino: 12000, refino_maior: 40000, garantia: 16000 } });
    assert(e.sucesso === 1 && e.porGema.refino > 0 && e.porGema.refino_maior > 0 && Math.abs(e.porGema.garantia - e.porGema.refino_maior) < 0.01, JSON.stringify(e.porGema));
    assert(Math.abs(e.ouro - (e.porGema.refino * 12000 + e.porGema.refino_maior * 40000 + e.porGema.garantia * 16000)) < 200, 'ouro com os preços dados: ' + e.ouro);
    assert.strictEqual(M.FORJA_GEMA_OURO.atributo, 20000);
});
t('2.34.1 modo "preciso de fragmentos": Mercado líquido abaixo de 3× os fragmentos → desmanche; sem preço, faixa II+ → desmanche, faixa I → você decide; a lista sai por fragmentos', () => {
    const inc2 = { nome: 'crystal ring', slot: 'ring', forja: { raridade: 1, refino: 0, potenciaBase: 250, atributos: [{ id: 'max_hp', valor: 20 }] } }; // faixa II Incomum: 3 fragmentos
    const inc1 = { nome: 'crystal ring', slot: 'ring', forja: { raridade: 1, refino: 0, potenciaBase: 100, atributos: [{ id: 'max_hp', valor: 20 }] } }; // faixa I: 1 fragmento
    const n = M.escolherDestino(inc2, 8000, 2000), f = M.escolherDestino(inc2, 8000, 2000, { fragmentos: true });
    assert.strictEqual(n.destino, 'mercado', 'normal: 7.600 líquido > 6.000 em fragmentos');
    assert.strictEqual(f.destino, 'desmanche', 'modo fragmentos: 7.600 < 3 × 6.000'); assert.strictEqual(f.modoFrag, true);
    assert.strictEqual(M.escolherDestino(inc2, 30000, 2000, { fragmentos: true }).destino, 'mercado', '28.500 líquido > 18.000: ainda vale o Mercado');
    assert.strictEqual(M.escolherDestino(inc2, null, 2000, { fragmentos: true }).destino, 'desmanche', 'sem preço e faixa II: desmancha');
    assert.strictEqual(M.escolherDestino(inc1, null, 2000, { fragmentos: true }).destino, 'mercado?', 'sem preço e faixa I: você decide');
    assert.strictEqual(M.escolherDestino(inc2, null, 2000).destino, 'mercado?', 'sem o modo, sem preço: você decide');
    const sobra = (iid, pot, r) => ({ iid, nome: 'crystal ring', slot: 'ring', origem: 'mochila', forja: { raridade: r, refino: 0, potenciaBase: pot, atributos: [] } });
    const d = M.pecasDesmanche({ dispensaveis: [sobra('a', 100, 1), sobra('b', 450, 3), sobra('c', 250, 2)] }, () => false);
    assert.deepStrictEqual(d.map(x => x.iid + ':' + x.fragmentos), ['a:1', 'b:21', 'c:6'], 'fragmentos por peça (a ordem do lote é feita no botão)');
});

console.log(`\n${n} testes ok` + (pulados ? ` · ${pulados} pulados (sem o estado da conta em data/)` : ''));

/* ===== 2.24.0 — FASE 2 (vídeos de 13–17/10: TV de Souza "depois do 110–120 não se brinca mais de regen. de mana") ===== */
const ARM = (nome, armor, forja) => ({ nome, slot: 'armor', attrs: { slot: 'armor', armor }, forja: forja || F(0) });
t('2.24.0 fase: nível < 110 é fase 1; ≥ 110 é fase 2; sem nível lido, fase 1', () => {
    assert.strictEqual(M.faseEquip({ nivel: 67 }), 1);
    assert.strictEqual(M.faseEquip({ nivel: 130 }), 2);
    assert.strictEqual(M.faseEquip(null), 1);
});
t('2.24.0 Knight fase 2: magic plate armor 17 (sem linha) bate a dark armor regen. 2,4; na fase 1 a dark armor ganha', () => {
    const dark = ARM('dark armor', 10, F(1, ['regen_mana', 2.4])), mpa = ARM('magic plate armor', 17);
    const f1 = { nivel: 67 }, f2 = { nivel: 130 };
    assert(M.pontuarPeca(dark, 'KNIGHT', f1).pontos > M.pontuarPeca(mpa, 'KNIGHT', f1).pontos, 'fase 1: a dark armor regen. tem que ganhar (regra de 17/10)');
    const a = M.pontuarPeca(mpa, 'KNIGHT', f2).pontos, b = M.pontuarPeca(dark, 'KNIGHT', f2).pontos;
    assert(a > b + 5, `fase 2: magic plate armor (${a}) tem que bater a dark armor regen. (${b}) com folga`);
});
t('2.24.0 Knight fase 2: a vida mínima medida ≥ 60 % NÃO corta mais a armadura (ele fica alto porque bebe poção)', () => {
    const mpa = ARM('magic plate armor', 17);
    const folgado = M.pontuarPeca(mpa, 'KNIGHT', { nivel: 130, party: { hpMinK: 72 } }).pontos, cheio = M.pontuarPeca(mpa, 'KNIGHT', { nivel: 130, party: { hpMinK: null } }).pontos;
    assert.strictEqual(folgado, cheio, `fase 2: ${folgado} × ${cheio}`);
    assert.strictEqual(M.pesosDaVoc('KNIGHT', { nivel: 130, party: { hpMinK: 72 } }).folgaDefesa, 1);
    const f1 = M.pontuarPeca(mpa, 'KNIGHT', { nivel: 67, party: { hpMinK: 72 } }).pontos, f1cheio = M.pontuarPeca(mpa, 'KNIGHT', { nivel: 67, party: { hpMinK: null } }).pontos;
    assert(f1 < f1cheio, 'fase 1 continua com a folga (2.18.2)');
});
t('2.24.0 fase 2 sem medida: fogo é o padrão (≥ 4× os outros elementos) no Knight e nos laterais; proteção mágica continua; com medida, o elemento medido manda', () => {
    for (const v of ['KNIGHT', 'SORCERER', 'PALADIN']) {
        const P = M.pesosDaVoc(v, { nivel: 130 });
        assert(P.resist_fogo >= 4 * P.resist_gelo, `${v}: fogo ${P.resist_fogo} × gelo ${P.resist_gelo}`);
        assert(P.protecao_magica > 0 && P.resist_fogo >= 0.4 * P.protecao_magica, `${v}: proteção mágica ${P.protecao_magica} × fogo ${P.resist_fogo}`);
        assert.strictEqual(P.elemMedido, false);
    }
    const P1 = M.pesosDaVoc('KNIGHT', { nivel: 67 });
    assert.strictEqual(P1.resist_fogo, P1.resist_gelo, 'fase 1: sem medida, divisão igual (2.21.0)');
    const medido = { nivel: 130, party: { elemVoc: { KNIGHT: { tomadoS: 140, frac: { fisico: 0.3, gelo: 0.7 } } } } };
    const Pm = M.pesosDaVoc('KNIGHT', medido);
    assert(Pm.resist_gelo > 3 * Pm.resist_fogo && Pm.elemMedido === true, 'com medida, gelo manda');
});
t('2.24.0 fase 2: vida (max HP) do mago passa a contar — 25 de max HP vale ≥ 1 pt; fase 1 fica como era (~0,25)', () => {
    assert(M.pesosDaVoc('SORCERER', { nivel: 130 }).max_hp * 25 >= 1, 'fase 2: ' + M.pesosDaVoc('SORCERER', { nivel: 130 }).max_hp);
    assert(M.pesosDaVoc('SORCERER', { nivel: 67 }).max_hp * 25 < 0.5, 'fase 1: ' + M.pesosDaVoc('SORCERER', { nivel: 67 }).max_hp);
});
t('2.24.0 fase 2: base de forja exige potência ≥ 350 (fase 1: 300)', () => {
    assert.strictEqual(M.potenciaBaseForja({ nivel: 67 }), 300);
    assert.strictEqual(M.potenciaBaseForja({ nivel: 130 }), 350);
    assert.strictEqual(M.potenciaBaseForja(null), 300);
});

t('2.24.1 arma de 1 mão: a DEFESA da arma não conta (com escudo o jogo usa a defesa do escudo); defesa extra conta; arma de 2 mãos conta a defesa', () => {
    const umaMao = { nome: 'magic sword', slot: 'weapon', attrs: { weaponType: 'sword', attack: 48, defense: 35, extradef: 3 }, forja: F(0) };
    const duasMaos = { nome: 'spike sword', slot: 'weapon', attrs: { weaponType: 'sword', slotType: 'two-handed', attack: 41, defense: 20 }, forja: F(0) };
    const ctx = { nivel: 130 };
    const d1 = M.pontuarPeca(umaMao, 'KNIGHT', ctx).detalhe, d2 = M.pontuarPeca(duasMaos, 'KNIGHT', ctx).detalhe;
    const pt = (d, id) => { const x = d.find(y => y.id === id); return x ? x.pt : null; };
    assert.strictEqual(pt(d1, 'defense'), 0, '1 mão: defesa da arma tem que valer 0 (achei ' + pt(d1, 'defense') + ')');
    assert(pt(d1, 'extradef') > 0, '1 mão: a defesa extra soma à do escudo (Canary getDefense)');
    assert(pt(d2, 'defense') > 0, '2 mãos: sem escudo, a defesa da arma é o bloqueio');
    const escudo = { nome: 'vampire shield', slot: 'shield', attrs: { weaponType: 'shield', defense: 34 }, forja: F(0) };
    assert(pt(M.pontuarPeca(escudo, 'KNIGHT', ctx).detalhe, 'defense') > 0, 'escudo continua contando');
});

t('2.32.2 espaço VAZIO aceita qualquer peça que rende (nível 8: colar de 0,5 pt entrava nunca); troca de peça segue com 1 pt', () => {
    const colar = { iid: 'c1', nome: 'wolf tooth chain', slot: 'necklace', origem: 'depósito', attrs: {}, forja: F(2, ['dano_magico', 1.1], ['dano_elem_fogo', 1.6]) };
    const pecas = [colar];
    const ctx = { nivel: 8 };
    const r = M.distribuirEquip(pecas, ['SORCERER'], ctx);
    const x = r.porVoc.SORCERER.necklace;
    assert(x.melhor && x.melhor.iid === 'c1', 'o colar devia ser o melhor do espaço vazio');
    assert(x.ganho > 0 && x.ganho < 1, 'o teste precisa de um ganho entre 0 e 1 (achei ' + x.ganho + ')');
    assert(M.trocaVale(x), 'espaço vazio: qualquer ganho > 0 vale');
    assert(!M.trocaVale(Object.assign({}, x, { atual: { iid: 'c0' }, atualPt: 2 })), 'com peça vestida que rende, o mínimo de 1 pt continua');
    assert(M.trocaVale(Object.assign({}, x, { atual: { iid: 'c0' }, atualPt: 0 })), 'peça vestida de 0 pt (bow comum) conta como espaço vazio');
});

t('2.32.2 wand/rod acima do nível não atira (medido: everblazing nível 65 no nível 8 deu zero tiros); o ML de fábrica continua', () => {
    const wand = { iid: 'w1', nome: 'wand of everblazing', slot: 'weapon', attrs: { weaponType: 'wand', wandType: 'fire', fromDamage: 38, toDamage: 58, mana: 13, level: 65, magiclevelpoints: 1 }, forja: F(0) };
    const baixo = M.pontuarPeca(wand, 'SORCERER', { nivel: 8 }), alto = M.pontuarPeca(wand, 'SORCERER', { nivel: 70 });
    const tiro = (r) => r.detalhe.filter(d => /dano da wand|mana por tiro/.test(d.id)).length;
    assert(tiro(baixo) === 0, 'no nível 8 o tiro e a mana do tiro não entram');
    assert(tiro(alto) === 2, 'no nível 70 entram');
    assert(baixo.detalhe.some(d => d.id === 'magiclevelpoints' && d.pt > 0), 'o +1 de nível mágico continua valendo');
});
/* 2.38.0 — as 3 decisões do dono de 31/10 (vídeos lidos pelo Antigravity, conferidos em data/videos/conferencia-2026-10-31.md) */
t('2.38.0 decisão 1: Knight 110+ — resistência física e proteção mágica na frente da regen. de mana; no 90 nada muda', () => {
    const lin = (P, id, v) => P[id] * v; // linha típica da faixa IV
    const k170 = M.pesosDaVoc('KNIGHT', { nivel: 170 }), k90 = M.pesosDaVoc('KNIGHT', { nivel: 90 });
    assert(lin(k170, 'resist_fisica', 1.05) > lin(k170, 'regen_mana', 3.45) && lin(k170, 'protecao_magica', 2.5) > lin(k170, 'regen_mana', 3.45), JSON.stringify([lin(k170, 'resist_fisica', 1.05), lin(k170, 'protecao_magica', 2.5), lin(k170, 'regen_mana', 3.45)]));
    assert.strictEqual(k170.regen_mana, k170.regen_vida, 'na fase 2 regen. de mana = regen. de vida (sem o ×2,5)');
    assert(lin(k90, 'regen_mana', 3.45) > 5 * lin(k90, 'resist_fisica', 1.05), 'fase 1: a regra de 17/10 continua (regen. de mana na frente)');
    assert(k90.regen_mana > k90.regen_vida * 2, 'fase 1: ×2,5 do Wound Cleansing');
    const ag = M.pesosDaVoc('KNIGHT', { nivel: 170, sobreviver: true });
    assert(Math.abs(ag.resist_fisica - k170.resist_fisica) < 1e-9, 'o modo aguentar não soma outro 3× à resistência');
});
t('2.38.0 decisão 2: Paladino — distância e dano sagrado (linha típica) na frente da regen. de mana', () => {
    for (const nivel of [90, 170]) {
        const p = M.pesosDaVoc('PALADIN', { nivel });
        assert(p.distancia * 2 > p.regen_mana * 3.45 && p.dano_elem_sagrado * 6 > p.regen_mana * 3.45, nivel + ': ' + JSON.stringify([p.distancia * 2, p.dano_elem_sagrado * 6, p.regen_mana * 3.45]));
        assert.strictEqual(p.skilldist, p.distancia, 'distância de fábrica (skilldist) com o mesmo peso');
    }
    const s = M.pesosDaVoc('SORCERER', { nivel: 170 }), k = M.pesosDaVoc('KNIGHT', { nivel: 170 });
    assert(s.distancia === 0 && k.distancia === 0, 'o piso é só do Paladino');
});
t('2.38.0 decisão 3: Knight — ataque, corpo a corpo e dano físico 3×; +1 de ataque ainda ≈ +1 de skill', () => {
    const k = M.pesosDaVoc('KNIGHT', { nivel: 170 }), s = M.pesosDaVoc('KNIGHT', { nivel: 170, party: { share: { KNIGHT: 0.1 } } });
    assert(Math.abs(k.dano_fisico - 3 * 0.1) < 0.01, 'dano físico = 3 × a fatia (10 %): ' + k.dano_fisico);
    assert(k.attack / k.corpo_a_corpo > 0.7 && k.attack / k.corpo_a_corpo < 1.3 && k.skillaxe === k.corpo_a_corpo);
    assert.strictEqual(s.dano_fisico, k.dano_fisico);
    const arma = (linha) => ({ nome: 'stonecutter axe', slot: 'weapon', attrs: base['stonecutter axe'] ? base['stonecutter axe'].attrs : { attack: 50, slot: 'weapon' }, forja: F(1, linha) });
    const comFis = M.pontuarPeca(arma(['dano_fisico', 6]), 'KNIGHT', { nivel: 170 }).pontos, sem = M.pontuarPeca({ nome: 'stonecutter axe', slot: 'weapon', attrs: arma([]).attrs, forja: F(0) }, 'KNIGHT', { nivel: 170 }).pontos;
    assert(comFis - sem > 1.5, 'linha de 6 % de dano físico na arma do Knight vale > 1,5 pt: ' + (comFis - sem));
});

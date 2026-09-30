// Roda: node testes/equip.test.js
// Extrai o trecho puro do userscript (entre os marcadores) e testa.
// • Casos públicos: testes/fixtures/itens.json (GET /item/info, sem login) — rodam em qualquer clone.
// • Casos com o estado da conta (data/estado-equip-2026-09-28.json, fora do git): só rodam se o arquivo existir.
const fs = require('fs'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'tibidle-helper.user.js'), 'utf8');
const ini = src.indexOf('/* @@EQUIP-PURO-INICIO */'), fim = src.indexOf('/* @@EQUIP-PURO-FIM */');
assert(ini > 0 && fim > ini, 'marcadores @@EQUIP-PURO não encontrados');
const M = new Function(src.slice(ini, fim) + '\nreturn { PESOS_EQUIP, SLOTS_EQUIP, normalizarSlot, vocacaoPode, pontuarPeca, pesosDaVoc, candidatosEquip, distribuirEquip };')();
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
    /* 2.11.6 — com a mana curta de hoje (tiro ~0,14/s) as duas empatam: a inferno dá +17 de dano por
     * tiro já descontada a mana, e +1 ML dá ~0,9 % do dano da party */
    assert(Math.abs(a - b) < 0.3, `vortex +1 ML (${a}) deveria empatar com a inferno (${b})`);
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
    assert(Math.abs(meio.dano_magico - meio.dano_fisico) < 0.001 && meio.distancia > P.distancia, 'fração medida deveria mandar');
});
t('Knight: +1 de ataque vale quase o mesmo que +1 de skill (golpe e Berserk são simétricos)', () => {
    const P = M.pesosDaVoc('KNIGHT');
    assert(P.attack / P.corpo_a_corpo > 0.7 && P.attack / P.corpo_a_corpo < 1.3, `ataque ${P.attack} × skill ${P.corpo_a_corpo}`);
    assert(P.skillaxe === P.corpo_a_corpo);
});
t('nível mágico pesa pelo ML atual: com ML 5 vale bem mais que com ML 20', () => {
    const baixo = M.pesosDaVoc('SORCERER', { nivel: 39, sk: { SORCERER: { ml: 5 } } }), alto = M.pesosDaVoc('SORCERER', { nivel: 62, sk: { SORCERER: { ml: 20 } } });
    assert(baixo.nivel_magico > 2 * alto.nivel_magico, `${baixo.nivel_magico} × ${alto.nivel_magico}`);
    assert(alto.nivel_magico > 0.7 && alto.nivel_magico < 1.3, 'ML 20: ~1 % do dano da party por ML: ' + alto.nivel_magico);
    const lixo = M.pesosDaVoc('SORCERER', { sk: { SORCERER: { ml: undefined } } });
    assert(lixo.nivel_magico === M.pesosDaVoc('SORCERER', {}).nivel_magico, 'skill ausente cai na referência');
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
t('2.11.6: épico nunca sobra (base de forja); resistência sobrevive ao cenário de mapa mágico', () => {
    const anel = (iid, dono, r, ...at) => ({ iid, nome: 'crystal ring', slot: 'ring', attrs: {}, origem: dono ? 'corpo' : 'depósito', dono, forja: F(r, ...at) });
    const pcs = [
        anel('k', 'KNIGHT', 1, ['regen_vida', 2.4]), anel('p', 'PALADIN', 1, ['regen_mana', 1.3]),
        anel('s', 'SORCERER', 1, ['regen_mana', 1.2]), anel('d', 'DRUID', 1, ['regen_mana', 2.3]),
        anel('epico', null, 3, ['resist_energia', 1.1], ['resist_gelo', 0.9], ['resist_sagrado', 0.9]),
        anel('lixo1', null, 1, ['max_mana', 40]), anel('lixo2', null, 1, ['max_mana', 41]), anel('lixo3', null, 1, ['max_mana', 42])
    ];
    /* medido num mapa corpo a corpo: laterais não apanham */
    const d = M.distribuirEquip(pcs, undefined, { party: { fisico: 0.95, tomadoS: 25 } });
    assert(!d.dispensaveis.some(p => p.iid === 'epico'), 'épico foi para as sobras');
    assert(d.bases.some(p => p.iid === 'epico'), 'épico deveria aparecer como base de forja');
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
    /* 2.11.6 — PAR: crítico e roubo de vida são chance × porcentagem (wiki). Sozinho não faz nada. */
    assert.strictEqual(pt(colar(['critico_chance', 3]), 'SORCERER'), 0, 'chance de crítico sem dano crítico = 0');
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
    /* o Druida veste bota de loot: a de regen. de mana supera o encaixe dele → guardada (e na verdade vira a melhor) */
    const mix = ['KNIGHT', 'PALADIN', 'SORCERER'].map(v => p('bota-' + v, 'boots', v, ['regen_mana', 5])).concat([p('bota-DRUID', 'boots', 'DRUID', ['chance_de_loot', 2])]);
    const d2 = M.distribuirEquip(mix.concat(fracas));
    const sobra2 = new Set(d2.dispensaveis.map(x => x.iid));
    for (const f of fracas) assert(!sobra2.has(f.iid), f.iid + ' foi para as sobras com o Druida sem regen. de mana');
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
console.log(`\n${n} testes ok` + (pulados ? ` · ${pulados} pulados (sem o estado da conta em data/)` : ''));

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
    assert(besta.pontos >= 3, 'besta deveria valer o ganho do bolt: ' + besta.pontos);
    assert(besta.motivos[0].includes('bolt'), 'motivo deveria citar o bolt: ' + besta.motivos);
});
t('Paladino: Dano Mágico conta (runa + Caldera + Missile), e divide com Dano Físico', () => {
    const P = M.pesosDaVoc('PALADIN');
    assert(P.dano_magico > 0 && P.dano_fisico > 0 && Math.abs(P.dano_magico + P.dano_fisico - 1) < 0.01, JSON.stringify({ m: P.dano_magico, f: P.dano_fisico }));
    const soMagia = M.pesosDaVoc('PALADIN', { fracMagica: { PALADIN: 0.9 } });
    assert(soMagia.dano_magico === 0.9 && soMagia.distancia < P.distancia, 'fração medida deveria mandar');
});
t('Knight: +1 de ataque vale quase o mesmo que +1 de skill (golpe e Berserk são simétricos)', () => {
    const P = M.pesosDaVoc('KNIGHT');
    assert(P.attack / P.corpo_a_corpo > 0.7 && P.attack / P.corpo_a_corpo < 1.3, `ataque ${P.attack} × skill ${P.corpo_a_corpo}`);
    assert(P.skillaxe === P.corpo_a_corpo);
});
t('nível mágico pesa pelo ML atual: com ML 5 vale bem mais que com ML 20', () => {
    const baixo = M.pesosDaVoc('SORCERER', { nivel: 39, sk: { SORCERER: { ml: 5 } } }), alto = M.pesosDaVoc('SORCERER', { nivel: 62, sk: { SORCERER: { ml: 20 } } });
    assert(baixo.nivel_magico > 2 * alto.nivel_magico, `${baixo.nivel_magico} × ${alto.nivel_magico}`);
    assert(alto.nivel_magico > 2.5 && alto.nivel_magico < 5, 'ML 20 deveria ficar entre 2,5 e 5: ' + alto.nivel_magico);
    const lixo = M.pesosDaVoc('SORCERER', { sk: { SORCERER: { ml: undefined } } });
    assert(lixo.nivel_magico === alto.nivel_magico, 'skill ausente cai na referência');
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
    assert(arma && arma.nome === 'crossbow' && arma.attrs.ammotype === 'bolt', 'arma do Paladino: ' + (arma && arma.nome));
    assert(!Object.values(d.porVoc).some(x => x.weapon && x.weapon.melhor && /spear/.test(x.weapon.melhor.nome)), 'lança escolhida para alguém');
    assert(d.reservas.has(pecas.find(p => p.nome === 'elvish bow').iid), 'o segundo melhor arco deveria ficar de reserva');
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
    assert(neutro.porVoc.SORCERER.weapon.melhor.nome === 'wand of inferno', 'no mapa neutro a inferno é a melhor');
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
    assert.strictEqual(quem('PALADIN'), 'p', 'o Paladino fica com o dele: ' + quem('PALADIN'));
    assert.strictEqual(quem('DRUID'), 'd');
    const k = d.porVoc.KNIGHT.ring;
    assert(k.melhor && /^dep/.test(k.melhor.iid) && k.ganho > 1, `o Knight ganha +${k.ganho} com o anel do depósito — essa troca vale`);
});
console.log(`\n${n} testes ok` + (pulados ? ` · ${pulados} pulados (sem o estado da conta em data/)` : ''));

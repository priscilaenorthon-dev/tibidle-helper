// Roda: node testes/sobreviver.test.js
// Aba Sobreviver (2.34.0): EQUIP-PURO + @@SOBREVIVER-PURO — o grupo visto pelo alvo (sbPartyDoDano), a defesa pesando 3× no modo
// aguentar (pesosDaVoc com ctx.sobreviver), os consumíveis da luta (sbConsumiveis) e o plano em palavras (sbPlano).
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const M = new Function(trecho('/* @@EQUIP-PURO-INICIO */', '/* @@EQUIP-PURO-FIM */') + trecho('/* @@SOBREVIVER-PURO-INICIO', '/* @@SOBREVIVER-PURO-FIM */') +
    '\nreturn { sbPartyDoDano, sbConsumiveis, sbPlano, pesosDaVoc, pontuarPeca, SB_IDS_DEFESA, SB_FATOR, SB_POCOES };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };
const DM = { seg: 1800, sessoes: 2, tomadoH: 900000, mortes: 1, elemPorVoc: { KNIGHT: { tomadoH: 720000, golpesH: 7200, frac: { fisico: 0.62, fogo: 0.3, energia: 0.08 } }, SORCERER: { tomadoH: 90000, golpesH: 0, frac: { fogo: 0.7, energia: 0.3 } }, DRUID: { tomadoH: 90000, frac: { fogo: 1 } } }, crias: [] };

t('sbPartyDoDano: o Cavaleiro toma 200/s, 62 % físico, 2 golpes/s × físico; laterais medidos → ladoApanha 4; sem dano → referência', () => {
    const r = M.sbPartyDoDano(DM, { tomadoS: 30, fisico: 0.65, golpesS: 0.45 });
    assert(r.medido && r.mortes === 1);
    assert.strictEqual(r.party.tomadoS, 200); assert.strictEqual(r.party.fisico, 0.62);
    assert(Math.abs(r.party.golpesS - 2 * 0.62) < 1e-9, 'golpes/s físicos: ' + r.party.golpesS);
    assert.strictEqual(r.party.ladoApanha, 4);
    assert.strictEqual(r.party.elemVoc.SORCERER.tomadoS, 25); assert.strictEqual(r.party.elemVoc.SORCERER.frac.fogo, 0.7);
    assert.strictEqual(r.party.hpMinK, null, 'no modo aguentar a defesa vale cheia');
    const v = M.sbPartyDoDano(null, { tomadoS: 30 });
    assert(!v.medido && v.party.tomadoS === 30);
    const so = M.sbPartyDoDano({ seg: 100, tomadoH: 36000, elemPorVoc: {} }, {});
    assert(so.medido && so.party.tomadoS === 10 && so.party.ladoApanha === 1);
});
t('modo aguentar: a defesa pesa 3× (resistência ao fogo do Cavaleiro) e o ataque fica igual; sem a chave, nada muda', () => {
    const party = M.sbPartyDoDano(DM, {}).party, nivel = 160;
    const normal = M.pesosDaVoc('KNIGHT', { nivel, party }), ag = M.pesosDaVoc('KNIGHT', { nivel, party, sobreviver: true });
    assert(normal.resist_fogo > 0, 'fogo medido tem peso');
    assert(Math.abs(ag.resist_fogo / normal.resist_fogo - M.SB_FATOR) < 0.02, `fogo ×${ag.resist_fogo / normal.resist_fogo}`);
    assert(Math.abs(ag.armor / normal.armor - M.SB_FATOR) < 0.02, 'armadura ×3');
    assert.strictEqual(ag.attack, normal.attack, 'ataque igual');
    assert.strictEqual(ag.sobreviver, true); assert.strictEqual(normal.sobreviver, undefined);
    assert(ag.resist_fogo > ag.resist_gelo * 3, 'o elemento que bate pesa mais que o que não bate');
    const mago = M.pesosDaVoc('SORCERER', { nivel, party, sobreviver: true }), magoN = M.pesosDaVoc('SORCERER', { nivel, party });
    assert(Math.abs(mago.protecao_magica / magoN.protecao_magica - M.SB_FATOR) < 0.02, 'proteção mágica do Feiticeiro ×3');
});
t('sbConsumiveis: Might Ring (20 cargas) ganha do anel fixo contra fogo; o já vestido pela própria vocação não entra; outro personagem não pega o anel vestido', () => {
    const party = M.sbPartyDoDano(DM, {}).party, ctx = { nivel: 160, party, sobreviver: true };
    const fixo = { iid: 'r1', nome: 'ring of healing', slot: 'ring', attrs: {}, forja: { raridade: 0, atributos: [] }, origem: 'corpo', dono: 'KNIGHT' };
    const might = { iid: 'r2', nome: 'might ring', slot: 'ring', attrs: { charges: 20 }, equipPreview: { attrs: { absorbpercentfire: 20, absorbpercentphysical: 20, absorbpercentenergy: 20, absorbpercentice: 20, absorbpercentearth: 20, absorbpercentdeath: 20, absorbpercentholy: 20 } }, forja: { raridade: 0, atributos: [] }, origem: 'depósito', dono: null };
    const stone = { iid: 'n1', nome: 'stone skin amulet', slot: 'necklace', attrs: { charges: 5 }, equipPreview: { attrs: { absorbpercentphysical: 80, absorbpercentdeath: 80 } }, forja: { raridade: 0, atributos: [] }, origem: 'mochila', dono: null };
    const porVoc = { KNIGHT: { ring: { atual: fixo, melhor: fixo }, necklace: { atual: null, melhor: null } }, SORCERER: { ring: { atual: null, melhor: null }, necklace: { atual: null, melhor: null } } };
    const out = M.sbConsumiveis([fixo, might, stone], porVoc, ['KNIGHT', 'SORCERER'], ctx);
    const k = out.filter(x => x.voc === 'KNIGHT');
    assert(k.some(x => x.slot === 'ring' && x.peca.iid === 'r2' && x.ganho > 0), 'Might Ring no Cavaleiro: ' + JSON.stringify(k.map(x => [x.slot, x.peca.nome, x.ganho])));
    assert(k.some(x => x.slot === 'necklace' && x.peca.iid === 'n1'), 'Stone Skin no colar vazio');
    assert(out.every(x => x.ganho >= 0.5) && out[0].ganho >= out[out.length - 1].ganho, 'ordenado por ganho');
    const vestido = Object.assign({}, might, { origem: 'corpo', dono: 'KNIGHT' });
    const out2 = M.sbConsumiveis([vestido, stone], { KNIGHT: { ring: { atual: vestido, melhor: vestido }, necklace: { atual: null } } }, ['KNIGHT'], ctx);
    assert(!out2.some(x => x.slot === 'ring'), 'o Might Ring já vestido não é sugerido de novo');
    const out3 = M.sbConsumiveis([vestido], { SORCERER: { ring: { atual: null } } }, ['SORCERER'], ctx);
    assert.strictEqual(out3.length, 0, 'o anel vestido no Cavaleiro não vai para o Feiticeiro');
});
t('sbPlano: medido → Protector e prey de DEFESA em alerta (200/s, morte), laterais com fogo, poções do nível 160; prey de defesa ★5 vira ok', () => {
    const party = M.sbPartyDoDano(DM, {}).party;
    const pl = M.sbPlano({ nivel: 160, party, medido: true, mortes: 1, hpMinK: 35, prey: { KNIGHT: { tipo: 'xp', tier: 3 } }, alvo: { title: 'Shadow Nexus', levelMin: 150 } });
    const por = Object.fromEntries(pl.map(x => [x.chave, x]));
    assert(por.medida.nivel === 'ok' && /200\/s/.test(por.medida.texto) && /62 %/.test(por.medida.texto) && /1 morte/.test(por.medida.texto), por.medida.texto);
    assert(por.laterais.nivel === 'av' && /Feiticeiro toma 25\/s/.test(por.laterais.texto) && /70 % fogo/.test(por.laterais.texto), por.laterais.texto);
    assert(por.protector.nivel === 'av' && /30\/s a menos/.test(por.protector.texto), por.protector.texto);
    assert(por.prey.nivel === 'ruim' && /xp ★3/.test(por.prey.texto), por.prey.texto);
    assert(/Cavaleiro: Ultimate Health Potion/.test(por.pocoes.texto) && /Paladino: Ultimate Spirit Potion/.test(por.pocoes.texto) && /Druida: Health Potion ≤ 40 % · Ultimate Mana Potion/.test(por.pocoes.texto), por.pocoes.texto);
    assert(/nível mínimo 150/.test(por.lure.texto));
    const ok = M.sbPlano({ nivel: 100, party, medido: true, mortes: 0, prey: { KNIGHT: { tipo: 'defesa', tier: 5 } }, alvo: { boss: 'Beelzebub' } });
    const p2 = Object.fromEntries(ok.map(x => [x.chave, x]));
    assert(p2.prey.nivel === 'ok' && /★5/.test(p2.prey.titulo) && /−20 %/.test(p2.prey.titulo), p2.prey.titulo);
    assert(/Magia › Boss/.test(p2.laterais.texto), 'boss: aponta a grade de formação');
    const sem = M.sbPlano({ nivel: 160, party: { tomadoS: 140, fisico: 0.65 }, medido: false, prey: {}, alvo: { title: 'X' } });
    assert(sem[0].chave === 'medida' && sem[0].nivel === 'av' && /ainda não viu X/.test(sem[0].texto));
    assert.strictEqual(M.SB_POCOES.KNIGHT(201).vida, 'Supreme Health Potion'); assert.strictEqual(M.SB_POCOES.PALADIN(79).vida, 'Strong Health Potion');
});
console.log(`\n${n} testes ok`);

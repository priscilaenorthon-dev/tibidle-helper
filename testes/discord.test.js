// Roda: node testes/discord.test.js
// Modelo "Discord" (2.26.0): extrai o bloco @@DISCORD do userscript — os setups da comunidade por hunt e a conversão
// deles para o battle config do jogo (heals com a poção de vida e as curas, manaPotion, skills + minCreatures, supports, ammo).
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'tibidle-helper.user.js'), 'utf8');
const trecho = (a, b) => { const i = src.indexOf(a), f = src.indexOf(b); assert(i > 0 && f > i, 'marcador ausente: ' + a); return src.slice(i, f); };
const M = new Function(trecho('/* @@DISCORD-INICIO', '/* @@DISCORD-FIM */') + '\nreturn { SETUPS_DISCORD, dcSetupsDaHunt, dcConfigDe, dcResumo, dcNomesUsados };')();
let n = 0;
const t = (nome, fn) => { try { fn(); n++; console.log('ok  ', nome); } catch (e) { console.log('FAIL', nome, '\n   ', e.message); process.exitCode = 1; } };

/* catálogo mínimo (nomes, vocações e nível como no CAT.magias do jogo) */
const mag = (name, vocs, level, isRune) => ({ name, vocations: vocs, level, isRune: !!isRune });
const CATALOGO = [
    mag('Berserk', ['knight', 'elite knight'], 35), mag('Fierce Berserk', ['knight', 'elite knight'], 90), mag('Groundshaker', ['knight', 'elite knight'], 33),
    mag('Front Sweep', ['knight', 'elite knight'], 70), mag('Lesser Front Sweep', ['knight', 'elite knight'], 1), mag('Whirlwind Throw', ['knight', 'elite knight'], 28),
    mag('Brutal Strike', ['knight', 'elite knight'], 16), mag('Annihilation', ['knight', 'elite knight'], 110),
    mag('Divine Caldera', ['paladin', 'royal paladin'], 50), mag('Ethereal Spear', ['paladin', 'royal paladin'], 23), mag('Strong Ethereal Spear', ['paladin', 'royal paladin'], 90), mag('Divine Missile', ['paladin', 'royal paladin'], 40),
    mag('Energy Wave', ['sorcerer', 'master sorcerer'], 50), mag('Great Fire Wave', ['sorcerer', 'master sorcerer'], 50), mag('Energy Strike', ['druid', 'elder druid', 'sorcerer', 'master sorcerer'], 12),
    mag('Flame Strike', ['sorcerer', 'druid', 'master sorcerer', 'elder druid'], 14), mag('Strong Flame Strike', ['sorcerer', 'master sorcerer'], 70), mag('Ultimate Flame Strike', ['sorcerer', 'master sorcerer'], 90), mag('Lightning', ['sorcerer', 'master sorcerer'], 55),
    mag('Strong Ice Wave', ['druid', 'elder druid'], 50), mag('Terra Wave', ['druid', 'elder druid'], 50), mag('Ice Strike', ['druid', 'sorcerer', 'elder druid', 'master sorcerer'], 15),
    mag('Strong Ice Strike', ['druid', 'elder druid'], 80), mag('Ultimate Ice Strike', ['druid', 'elder druid'], 100),
    mag('Wound Cleansing', ['knight', 'elite knight'], 8), mag('Intense Wound Cleansing', ['knight', 'elite knight'], 80), mag('Divine Healing', ['paladin', 'royal paladin'], 35), mag('Salvation', ['paladin', 'royal paladin'], 60),
    mag('Intense Healing', ['druid', 'elder druid', 'paladin', 'royal paladin', 'sorcerer', 'master sorcerer'], 20), mag('Ultimate Healing', ['druid', 'elder druid', 'sorcerer', 'master sorcerer'], 30),
    mag('Heal Friend', ['druid', 'elder druid'], 18), mag('Mass Healing', ['druid', 'elder druid'], 36),
    mag('Protector', ['knight', 'elite knight'], 55), mag('Blood Rage', ['knight', 'elite knight'], 60), mag('Train Party', ['knight', 'elite knight'], 32), mag('Sharpshooter', ['paladin', 'royal paladin'], 60),
    mag('Protect Party', ['paladin', 'royal paladin'], 32), mag('Enchant Party', ['sorcerer', 'master sorcerer'], 32), mag('Magic Shield', ['druid', 'elder druid', 'sorcerer', 'master sorcerer'], 14), mag('Heal Party', ['druid', 'elder druid'], 32),
    mag('avalanche rune', ['sorcerer', 'master sorcerer', 'druid', 'elder druid', 'paladin', 'royal paladin'], 30, true), mag('thunderstorm rune', ['sorcerer', 'master sorcerer', 'druid', 'elder druid', 'paladin', 'royal paladin'], 30, true),
    mag('great fireball rune', ['sorcerer', 'master sorcerer', 'druid', 'elder druid', 'paladin', 'royal paladin'], 30, true), mag('stone shower rune', ['sorcerer', 'master sorcerer', 'druid', 'elder druid', 'paladin', 'royal paladin'], 30, true),
    mag('sudden death rune', ['sorcerer', 'master sorcerer', 'druid', 'elder druid', 'paladin', 'royal paladin'], 45, true), mag('explosion rune', ['sorcerer', 'master sorcerer', 'druid', 'elder druid', 'paladin', 'royal paladin'], 31, true)
];
const POCOES = ['Health Potion', 'Strong Health Potion', 'Great Health Potion', 'Ultimate Health Potion', 'Great Spirit Potion', 'Ultimate Spirit Potion', 'Mana Potion', 'Strong Mana Potion', 'Great Mana Potion', 'Ultimate Mana Potion'];
const CTX = { nivel: 133, magias: CATALOGO, pocoes: POCOES };
const SETUP = {
    id: 'teste-bog', hunt: 'Bog Raiders Yalahar', huntId: 151, autor: 'Teste', titulo: 'Bog (teste)',
    chars: {
        KNIGHT: { mana: ['Mana Potion', 30], ataque: [['Berserk', 2], ['Lesser Front Sweep', 1]] },
        PALADIN: { vida: ['Great Spirit Potion', 40], mana: ['Mana Potion', 30], ataque: [['Divine Caldera', 2], ['thunderstorm rune', 2]], defesa: [['Salvation', 30], ['Divine Healing', 60]], suporte: ['Sharpshooter'], municao: 'burst arrow' },
        SORCERER: { ataque: [['Energy Wave', 2], ['thunderstorm rune', 2], ['Fierce Berserk', 1], ['?', 1]], defesa: [['Annihilation', 50]] },
        DRUID: { mana: ['Mana Potion', 30], ataque: [['Strong Ice Wave', 2], ['thunderstorm rune', 2]], defesa: [['Heal Friend', 60]] }
    }
};
const ATUAL = { heals: [{ name: 'Great Health Potion', percent: 45 }, { name: 'Wound Cleansing', percent: 50 }], manaPotion: { name: 'Strong Mana Potion', percent: 25 }, skills: ['Groundshaker', 'Berserk', null, null], minCreatures: { Groundshaker: 3, Berserk: 1 }, supports: ['Train Party', null] };

t('dcSetupsDaHunt: acha pelo id da hunt ou pelo nome (sem caixa); sem nada → lista vazia', () => {
    const lista = [SETUP, Object.assign({}, SETUP, { id: 'x', hunt: 'Lizard City', huntId: 62 }), Object.assign({}, SETUP, { id: 'y', hunt: 'bog raiders yalahar', huntId: null })];
    assert.deepStrictEqual(M.dcSetupsDaHunt({ id: 151, title: 'Bog Raiders Yalahar' }, lista).map(s => s.id), ['teste-bog', 'y']);
    assert.deepStrictEqual(M.dcSetupsDaHunt({ id: 62, title: 'Lizard City' }, lista).map(s => s.id), ['x']);
    assert.deepStrictEqual(M.dcSetupsDaHunt({ id: 999, title: 'Outra' }, lista), []);
    assert.deepStrictEqual(M.dcSetupsDaHunt(null, lista), []);
});
t('dcConfigDe: o que o setup não diz fica como está na config atual (poção de vida, cura e suporte do Knight); ataque e mana entram como o post', () => {
    const r = M.dcConfigDe(SETUP, 'KNIGHT', ATUAL, CTX);
    assert.deepStrictEqual(r.cfg.skills, ['Berserk', 'Lesser Front Sweep', null, null]);
    assert.deepStrictEqual(r.cfg.minCreatures, { Berserk: 2, 'Lesser Front Sweep': 1 });
    assert.deepStrictEqual(r.cfg.manaPotion, { name: 'Mana Potion', percent: 30 });
    assert.deepStrictEqual(r.cfg.heals, [{ name: 'Great Health Potion', percent: 45 }, { name: 'Wound Cleansing', percent: 50 }]);
    assert.deepStrictEqual(r.cfg.supports, ['Train Party', null]);
    assert.deepStrictEqual(r.avisos, []);
});
t('dcConfigDe: vida e defesa dadas substituem a poção e as curas (poção primeiro); suporte e munição entram', () => {
    const r = M.dcConfigDe(SETUP, 'PALADIN', { heals: [{ name: 'Health Potion', percent: 30 }, { name: 'Intense Healing', percent: 70 }], manaPotion: null, skills: [], minCreatures: {}, supports: [] }, CTX);
    assert.deepStrictEqual(r.cfg.heals, [{ name: 'Great Spirit Potion', percent: 40 }, { name: 'Salvation', percent: 30 }, { name: 'Divine Healing', percent: 60 }]);
    assert.deepStrictEqual(r.cfg.skills, ['Divine Caldera', 'thunderstorm rune', null, null]);
    assert.deepStrictEqual(r.cfg.supports, ['Sharpshooter', null]);
    assert.strictEqual(r.cfg.ammo, 'burst arrow');
    assert.deepStrictEqual(r.avisos, []);
});
t('dcConfigDe: magia de outra vocação, acima do nível ou "?" sai com aviso e não ocupa slot; sem config atual parte do vazio', () => {
    const r = M.dcConfigDe(SETUP, 'SORCERER', null, Object.assign({}, CTX, { nivel: 40 }));
    assert.deepStrictEqual(r.cfg.skills, ['thunderstorm rune', null, null, null], JSON.stringify(r.cfg.skills));
    assert.deepStrictEqual(r.cfg.heals, []);
    assert(r.avisos.some(a => /Energy Wave/.test(a) && /nível/.test(a)), JSON.stringify(r.avisos));
    assert(r.avisos.some(a => /Fierce Berserk/.test(a) && /Feiticeiro|vocação/.test(a)), JSON.stringify(r.avisos));
    assert(r.avisos.some(a => /"\?"/.test(a) || /não identific/.test(a)), JSON.stringify(r.avisos));
    assert(r.avisos.some(a => /Annihilation/.test(a)), 'cura de outra vocação também avisa');
});
t('dcConfigDe: vocação sem entrada no setup → cfg null com aviso; dcResumo descreve a barra em palavras', () => {
    const r = M.dcConfigDe({ chars: { KNIGHT: {} } }, 'DRUID', ATUAL, CTX);
    assert.strictEqual(r.cfg, null); assert.match(r.avisos[0], /Druida/);
    const txt = M.dcResumo(SETUP, 'PALADIN');
    assert.match(txt, /Divine Caldera ≥2/); assert.match(txt, /Salvation ≤30 %/); assert.match(txt, /Great Spirit Potion ≤40 %/); assert.match(txt, /Sharpshooter/); assert.match(txt, /burst arrow/);
});
/* catálogo REAL do jogo (fixtures públicas de /spells e /potions) para a integridade dos setups */
const le = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const SPELLS = le('testes/fixtures/spells.json').magias, POTIONS = le('testes/fixtures/potions.json').pocoes;
const NOMES_POCOES = POTIONS.health.concat(POTIONS.mana).map(p => p.name);
t('SETUPS_DISCORD: ids únicos, hunt/autor/titulo em todos, ≥ 20 hunts, e todo nome usado existe no catálogo real (/spells + /potions)', () => {
    const ids = new Set();
    for (const s of M.SETUPS_DISCORD) { assert(s.id && !ids.has(s.id), 'id repetido ou ausente: ' + s.id); ids.add(s.id); assert(s.hunt && s.autor && s.titulo && s.chars, 'campos: ' + s.id); }
    assert(new Set(M.SETUPS_DISCORD.map(s => s.hunt)).size >= 20);
    assert(M.SETUPS_DISCORD.length >= 31);
    const conhecidos = new Set(SPELLS.map(m => m.name).concat(NOMES_POCOES));
    const usados = M.dcNomesUsados(M.SETUPS_DISCORD);
    const desconhecidos = usados.filter(x => !conhecidos.has(x) && x !== '?');
    assert.deepStrictEqual(desconhecidos, [], 'nomes fora do catálogo real (corrija o setup)');
});
t('SETUPS_DISCORD: cada magia/runa/cura/suporte é da vocação em que está; % e mínimos dentro das faixas; poções só nas poções', () => {
    const VOC = { KNIGHT: 'knight', PALADIN: 'paladin', SORCERER: 'sorcerer', DRUID: 'druid' };
    const erros = [];
    for (const s of M.SETUPS_DISCORD) for (const [voc, ch] of Object.entries(s.chars)) {
        const confere = (nome, onde) => {
            if (nome === '?') return;
            const m = SPELLS.find(x => x.name === nome); if (!m) return;
            const vocs = (m.vocations || []).map(v => String(v).toLowerCase());
            if (vocs.length && !vocs.some(v => v.includes(VOC[voc]))) erros.push(`${s.id} ${voc} ${onde}: ${nome} (${vocs.join(',')})`);
        };
        (ch.ataque || []).forEach(a => { confere(a[0], 'ataque'); if (!(a[1] >= 1 && a[1] <= 8)) erros.push(`${s.id} ${voc} ≥${a[1]}`); });
        (ch.defesa || []).forEach(d => { confere(d[0], 'defesa'); if (!(d[1] >= 0 && d[1] <= 100)) erros.push(`${s.id} ${voc} ≤${d[1]}`); });
        (ch.suporte || []).forEach(x => confere(x, 'suporte'));
        for (const k of ['vida', 'mana']) if (ch[k]) { if (!NOMES_POCOES.includes(ch[k][0])) erros.push(`${s.id} ${voc} ${k}: ${ch[k][0]}`); if (!(ch[k][1] >= 0 && ch[k][1] <= 100)) erros.push(`${s.id} ${voc} ${k} %`); }
    }
    assert.deepStrictEqual(erros, []);
});
t('dcSetupsDaHunt: hunts com mais de um setup da comunidade (o dono escolhe): Hive Queen Chamber, The Behemoth Quest, Lizard City, Bog Raiders', () => {
    for (const [id, title, n] of [[199, 'Hive Queen Chamber', 2], [188, 'The Behemoth Quest', 2], [62, 'Lizard City', 2], [151, 'Bog Raiders Yalahar', 2]]) {
        const ls = M.dcSetupsDaHunt({ id, title });
        assert(ls.length >= n, `${title}: ${ls.length} setups`);
        assert(new Set(ls.map(s => s.autor)).size >= 2, `${title}: autores ${ls.map(s => s.autor)}`);
    }
});
t("Quara's Domain (2.27.5, adaptados): 2 setups (forte e enxuto), nenhuma magia de fogo ou gelo (os quaras são imunes) e o Druida com runa e strike de energia", () => {
    const ls = M.dcSetupsDaHunt({ id: 191, title: "Quara's Domain Yalahar" });
    assert.strictEqual(ls.length, 2);
    for (const s of ls) for (const [voc, ch] of Object.entries(s.chars)) for (const [nome] of (ch.ataque || [])) {
        const m = SPELLS.find(x => x.name === nome);
        assert(m && !/FIRE|ICE/.test(m.combatType || ''), `${s.id} ${voc}: ${nome} (${m && m.combatType})`);
    }
    const forte = ls.find(s => s.id === 'quaradomain-specter-adapt').chars.DRUID.ataque.map(a => a[0]);
    assert(forte.includes('thunderstorm rune') && forte.includes('Energy Strike') && !forte.includes('stone shower rune'), forte.join(', '));
    const ctx = { nivel: 136, magias: SPELLS, pocoes: NOMES_POCOES };
    for (const s of ls) for (const voc of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) assert.deepStrictEqual(M.dcConfigDe(s, voc, null, ctx).avisos, [], s.id + ' ' + voc);
});
t('Northon (2.28.0): título "Northon - <mapa>", a barra dos 4, nenhum mapa repetido com post da comunidade, e todos passam no dcConfigDe do nível 136 sem aviso', () => {
    const nn = M.SETUPS_DISCORD.filter(s => /^northon-\d+$/.test(s.id));
    assert(nn.length >= 40, 'Northon: ' + nn.length);
    const daComunidade = new Set(M.SETUPS_DISCORD.filter(s => !/^Northon/.test(s.autor)).map(s => s.huntId));
    const ctx = { nivel: 136, magias: SPELLS, pocoes: NOMES_POCOES };
    for (const s of nn) {
        assert.strictEqual(s.titulo, 'Northon - ' + s.hunt, s.id);
        assert(!daComunidade.has(s.huntId), s.id + ': o mapa já tem post da comunidade');
        for (const voc of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) {
            assert(s.chars[voc], s.id + ' sem ' + voc);
            assert.deepStrictEqual(M.dcConfigDe(s, voc, null, ctx).avisos, [], s.id + ' ' + voc);
            const at = s.chars[voc].ataque || [];
            assert(new Set(at.map(a => a[0])).size === at.length, s.id + ' ' + voc + ': magia repetida');
            assert(!at.length || at.some(a => a[1] <= 1), s.id + ' ' + voc + ': nenhuma ≥1 (com 1 monstro vivo nada dispara)');
        }
    }
    assert(M.SETUPS_DISCORD.filter(s => s.huntId === 191).every(s => /^Northon - /.test(s.titulo)));
});
t('Northon (2.28.2): o padrão da comunidade — Cavaleiro de dano, a mesma runa nos três, nenhum slot que a fila nunca dispara', () => {
    const nn = M.SETUPS_DISCORD.filter(s => /^northon-\d+$/.test(s.id));
    const sp = (n) => SPELLS.find(x => x.name === n && x.combatType && (x.vocations || []).length) || SPELLS.find(x => x.name === n);
    for (const s of nn) {
        assert.deepStrictEqual(s.chars.KNIGHT.ataque.map(a => a[0]), ['Fierce Berserk', 'Berserk', 'Lesser Front Sweep', 'Brutal Strike'], s.id);
        const runas = ['PALADIN', 'SORCERER', 'DRUID'].map(v => (s.chars[v].ataque.find(a => / rune$/.test(a[0]) && a[0] !== 'sudden death rune') || [])[0]);
        assert(runas[0] && runas.every(r => r === runas[0]), s.id + ': runas ' + runas.join(', '));
        for (const [voc, ch] of Object.entries(s.chars)) {
            const at = ch.ataque;
            /* um slot atrás de outro que fica pronto a cada 2 s (recarga = a do grupo), com mínimo ≤ o dele, só sai sem mana para o da
             * frente — atrás de runa, nunca (slotMorto, @@MAGIA) */
            for (let j = 1; j < at.length; j++) {
                for (let i = 0; i < j; i++) {
                    const a = sp(at[i][0]), b = sp(at[j][0]);
                    if ((a.cooldownMs || 2000) > 2000 || at[i][1] > at[j][1]) continue;
                    const runaA = / rune$/.test(at[i][0]);
                    assert(!runaA && !(!/ rune$/.test(at[j][0]) && (b.mana || 0) >= (a.mana || 0)), `${s.id} ${voc}: ${at[j][0]} atrás de ${at[i][0]} nunca dispara`);
                }
            }
        }
    }
});
/* 2.28.2 — o backtest achou a Lizard City do Specter gravada com a barra da Bottom of the Ocean (Druida de terra num mapa todo imune a
 * terra). Nenhum ataque de setup pode usar um elemento ao qual TODOS os monstros do mapa são imunes (tomam ≤ 25 %). Exceções: os dois
 * posts do Argonaut que são assim no original, com aviso na observação. */
const HD = le('testes/fixtures/hunts-discord.json').hunts;
const elemDe = (n) => { const m = SPELLS.find(x => x.name === n && x.combatType); return m ? m.combatType.replace('COMBAT_', '').replace('DAMAGE', '') : null; };
const tomado = (mo, e) => 100 - ((mo.elements.find(x => x[0] === e) || [0, 0])[1]);
t('SETUPS_DISCORD: nenhum ataque num elemento ao qual o mapa inteiro é imune (fixture hunts-discord)', () => {
    const POST = new Set(['poi-argonaut|SORCERER|Flame Strike', 'poi-argonaut|DRUID|Flame Strike', 'quara-argonaut|SORCERER|great fireball rune']);
    const erros = [];
    for (const s of M.SETUPS_DISCORD) {
        const h = HD.find(x => x.id === s.huntId);
        assert(h, s.id + ': mapa ' + s.huntId + ' fora da fixture hunts-discord.json');
        for (const [voc, ch] of Object.entries(s.chars)) for (const [n] of (ch.ataque || [])) {
            const e = elemDe(n);
            if (e && h.monsters.every(mo => tomado(mo, e) <= 25) && !POST.has(s.id + '|' + voc + '|' + n)) erros.push(`${s.id} ${voc}: ${n} (${e})`);
        }
    }
    assert.deepStrictEqual(erros, []);
    for (const id of ['poi-argonaut', 'quara-argonaut']) assert.match(M.SETUPS_DISCORD.find(s => s.id === id).obs, /imunes? a fogo/, id + ': a observação tem que avisar');
});
t('Northon (2.28.2): o golpe básico dos magos é do elemento da runa (Ice Strike com avalanche, Energy Strike com thunderstorm…)', () => {
    const BASICO = /^(Energy|Flame|Ice|Terra|Death|Physical) Strike$/;
    for (const s of M.SETUPS_DISCORD.filter(x => /^northon-\d+$/.test(x.id))) for (const voc of ['SORCERER', 'DRUID']) {
        const at = s.chars[voc].ataque.map(a => a[0]), runa = at.find(n => / rune$/.test(n) && n !== 'sudden death rune'), b = at.find(n => BASICO.test(n));
        if (b) assert.strictEqual(elemDe(b), elemDe(runa), `${s.id} ${voc}: ${b} com ${runa}`);
        assert(!at.includes('Death Strike') && !at.includes('Physical Strike'), `${s.id} ${voc}: a comunidade não usa Death/Physical Strike`);
    }
});
t('Lizard City (Specter): a barra de gelo que ele descreve, não a cópia da Bottom of the Ocean', () => {
    const s = M.SETUPS_DISCORD.find(x => x.id === 'lizard-specter');
    assert.deepStrictEqual(s.chars.DRUID.ataque.map(a => a[0]), ['Strong Ice Wave', 'avalanche rune', 'Strong Ice Strike', 'Ice Strike']);
    for (const v of ['PALADIN', 'SORCERER']) assert(s.chars[v].ataque.some(a => a[0] === 'avalanche rune'), v);
});
t('dcConfigDe com um setup real (Hive Queen Chamber do Specter) no catálogo real: 4 barras, sem avisos para um nível 150', () => {
    const s = M.SETUPS_DISCORD.find(x => x.id === 'hivequeen-specter');
    const ctx = { nivel: 150, magias: SPELLS, pocoes: NOMES_POCOES };
    for (const voc of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) {
        const r = M.dcConfigDe(s, voc, null, ctx);
        assert(r.cfg && r.cfg.skills.filter(Boolean).length >= 3, voc + ' skills ' + JSON.stringify(r.cfg && r.cfg.skills));
        assert.deepStrictEqual(r.avisos, [], voc + ': ' + r.avisos.join('; '));
        assert(r.cfg.heals[0] && /Potion/.test(r.cfg.heals[0].name), voc + ': poção de vida primeiro');
        assert.strictEqual(r.cfg.manaPotion.name, 'Mana Potion');
    }
});

/* 2.29.1 — dono, 22/10: "ele tirou o potion do Paladino, que morreu" e "em cada conta pôs uma runa diferente no Druida" */
const POCOES_CAT = POTIONS.health.concat(POTIONS.mana);
const CTX_POT = Object.assign({}, CTX, { pocoesCat: POCOES_CAT });
t('2.29.1 poção pela vocação: Great Health Potion (só Knight) no Paladino vira Great Spirit Potion com aviso; a do Knight fica', () => {
    const sp = { chars: { PALADIN: { vida: ['Great Health Potion', 38], mana: ['Mana Potion', 30], ataque: [['Divine Caldera', 2]] }, KNIGHT: { vida: ['Great Health Potion', 38], ataque: [['Berserk', 2]] } } };
    const r = M.dcConfigDe(sp, 'PALADIN', ATUAL, CTX_POT);
    assert.strictEqual(r.cfg.heals[0].name, 'Great Spirit Potion', JSON.stringify(r.cfg.heals));
    assert.strictEqual(r.cfg.heals[0].percent, 38);
    assert(r.avisos.some(a => /Great Health Potion/.test(a) && /Paladino/.test(a) && /Great Spirit Potion no lugar/.test(a)), JSON.stringify(r.avisos));
    const k = M.dcConfigDe(sp, 'KNIGHT', ATUAL, CTX_POT);
    assert.strictEqual(k.cfg.heals[0].name, 'Great Health Potion'); assert.deepStrictEqual(k.avisos, []);
    const velho = M.dcConfigDe(sp, 'PALADIN', ATUAL, CTX); // sem o catálogo de poções (ctx antigo): o nome passa, como antes
    assert.strictEqual(velho.cfg.heals[0].name, 'Great Health Potion');
});
t('2.29.1 poção pelo nível: Paladino 70 não bebe Great Spirit (80) → Strong Health Potion (50); mana Ultimate (130) no Druida 90 → Great Mana', () => {
    const sp = { chars: { PALADIN: { vida: ['Great Spirit Potion', 40], ataque: [['Divine Caldera', 2]] }, DRUID: { mana: ['Ultimate Mana Potion', 30], ataque: [['Ice Strike', 2]] } } };
    const r = M.dcConfigDe(sp, 'PALADIN', null, Object.assign({}, CTX_POT, { nivel: 70 }));
    assert.strictEqual(r.cfg.heals[0].name, 'Strong Health Potion', JSON.stringify(r.cfg.heals));
    assert(r.avisos.some(a => /neste nível/.test(a) && /Strong Health Potion no lugar/.test(a)), JSON.stringify(r.avisos));
    const d = M.dcConfigDe(sp, 'DRUID', null, Object.assign({}, CTX_POT, { nivel: 90 }));
    assert.strictEqual(d.cfg.manaPotion.name, 'Great Mana Potion', JSON.stringify(d.cfg.manaPotion));
    const ok = M.dcConfigDe(sp, 'PALADIN', null, Object.assign({}, CTX_POT, { nivel: 80 }));
    assert.strictEqual(ok.cfg.heals[0].name, 'Great Spirit Potion'); assert.deepStrictEqual(ok.avisos, []);
});
t('2.29.1 magia acima do nível: a irmã de nível menor no lugar (Ultimate Ice Strike → Strong → Ice Strike; Intense Wound Cleansing → Wound Cleansing), com aviso', () => {
    const sp = { chars: { DRUID: { ataque: [['Strong Ice Wave', 1], ['avalanche rune', 2], ['Strong Ice Strike', 1], ['Ultimate Ice Strike', 1]] }, KNIGHT: { defesa: [['Intense Wound Cleansing', 60]], ataque: [['Berserk', 2]] } } };
    const r90 = M.dcConfigDe(sp, 'DRUID', null, Object.assign({}, CTX, { nivel: 90 }));
    assert.deepStrictEqual(r90.cfg.skills, ['Strong Ice Wave', 'avalanche rune', 'Strong Ice Strike', 'Strong Ice Strike'], JSON.stringify(r90.cfg.skills));
    assert(r90.avisos.some(a => /Ultimate Ice Strike pede nível 100/.test(a) && /Strong Ice Strike no lugar/.test(a)), JSON.stringify(r90.avisos));
    const r70 = M.dcConfigDe(sp, 'DRUID', null, Object.assign({}, CTX, { nivel: 70 }));
    assert.deepStrictEqual(r70.cfg.skills, ['Strong Ice Wave', 'avalanche rune', 'Ice Strike', 'Ice Strike'], JSON.stringify(r70.cfg.skills));
    assert.strictEqual(r70.cfg.skills[1], 'avalanche rune', 'a runa não depende do nível');
    const r40 = M.dcConfigDe(sp, 'DRUID', null, Object.assign({}, CTX, { nivel: 40 }));
    assert.deepStrictEqual(r40.cfg.skills, ['avalanche rune', 'Ice Strike', 'Ice Strike', null], 'Strong Ice Wave (50) não tem irmã no catálogo: slot pulado ' + JSON.stringify(r40.cfg.skills));
    const k = M.dcConfigDe(sp, 'KNIGHT', null, Object.assign({}, CTX, { nivel: 70 }));
    assert.deepStrictEqual(k.cfg.heals, [{ name: 'Wound Cleansing', percent: 60 }], JSON.stringify(k.cfg.heals));
    const k133 = M.dcConfigDe(sp, 'KNIGHT', null, CTX);
    assert.deepStrictEqual(k133.cfg.heals, [{ name: 'Intense Wound Cleansing', percent: 60 }]);
});
t('2.29.1 SETUPS_DISCORD: toda poção de vida/mana é da vocação em que está (o Paladino nunca com a Great/Ultimate Health Potion do Knight)', () => {
    const erros = [];
    for (const s of M.SETUPS_DISCORD) for (const [voc, ch] of Object.entries(s.chars)) for (const k of ['vida', 'mana']) {
        if (!ch[k]) continue;
        const q = POCOES_CAT.find(x => x.name === ch[k][0]);
        if (q && q.vocations && !q.vocations.some(v => v.includes(voc))) erros.push(`${s.id} ${voc} ${k}: ${ch[k][0]} → ${q.vocations.join(',')}`);
    }
    assert.deepStrictEqual(erros, []);
    const fire = M.SETUPS_DISCORD.find(s => s.id === 'fire-lucasdela');
    assert(fire && fire.chars.PALADIN.vida[0] === 'Great Spirit Potion' && fire.chars.PALADIN.vida[1] === 38, JSON.stringify(fire && fire.chars.PALADIN));
    assert.strictEqual(fire.chars.DRUID.ataque[1][0], 'avalanche rune', 'a runa do Druida no Fire Portal é a avalanche em todas as contas');
});

console.log(n + ' testes ok' + (process.exitCode ? ' (com falhas)' : ''));

/* Painel das 3 contas — funções puras (sem DOM). Roda no navegador (globalThis.PainelCore) e no node (module.exports).
 * Entrada: relatórios "tibidle-helper equipamento" (Equip → RELATÓRIO, formato 1; formato 2 traz itemId, assetsVer, deposito, ouro, mapa;
 * formato 3 a tabela de pesos do Equip; formato 4 as figuras dos itens em base64). */
(function (raiz) {
    'use strict';
    const VOCS = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'];
    const VOC_PT = { KNIGHT: 'Cavaleiro', PALADIN: 'Paladino', SORCERER: 'Feiticeiro', DRUID: 'Druida' };
    const SLOTS = ['head', 'necklace', 'armor', 'weapon', 'shield', 'legs', 'ring', 'boots'];
    const SLOT_PT = { head: 'elmo', necklace: 'colar', armor: 'armadura', weapon: 'arma', shield: 'escudo', legs: 'calça', ring: 'anel', boots: 'bota' };
    const RAR_PT = ['Comum', 'Incomum', 'Raro', 'Épico', 'Lendário', 'Mítico'];
    const ELEM = ['fisico', 'fogo', 'gelo', 'energia', 'terra', 'morte', 'sagrado'];
    const ELEM_PT = { fisico: 'físico', fogo: 'fogo', gelo: 'gelo', energia: 'energia', terra: 'terra', morte: 'morte', sagrado: 'sagrado', drenovida: 'dreno de vida', drenomana: 'dreno de mana' };
    /* do catálogo do jogo ("COMBAT_FIREDAMAGE" ou "FIRE") para o nome em português */
    const ELEM_CAT = { PHYSICAL: 'fisico', FIRE: 'fogo', ICE: 'gelo', ENERGY: 'energia', EARTH: 'terra', POISON: 'terra', DEATH: 'morte', HOLY: 'sagrado', LIFEDRAIN: 'drenovida', MANADRAIN: 'drenomana' };
    /* chaves da ficha do item por elemento */
    const FICHA_ABS = { fisico: 'absorbpercentphysical', fogo: 'absorbpercentfire', gelo: 'absorbpercentice', energia: 'absorbpercentenergy', terra: 'absorbpercentpoison', morte: 'absorbpercentdeath', sagrado: 'absorbpercentholy' };
    const FICHA_PROT = { fogo: 'elemental protection fire', gelo: 'elemental protection ice', energia: 'elemental protection energy', terra: 'elemental protection earth', morte: 'elemental protection death', sagrado: 'elemental protection holy' };
    const ATRIB_RESIST = { fisico: 'resist_fisica', fogo: 'resist_fogo', gelo: 'resist_gelo', energia: 'resist_energia', terra: 'resist_terra', morte: 'resist_morte', sagrado: 'resist_sagrado' };
    /* imbuements de proteção (nome no jogo → elemento) */
    const IMBU_ELEM = { 'dragon hide': 'fogo', 'quara scale': 'gelo', 'cloud fabric': 'energia', 'snake skin': 'terra', 'lich shroud': 'morte', 'demon presence': 'sagrado' };
    const ROTULO = {
        attack: 'ataque', armor: 'armadura', defense: 'defesa', extradef: 'defesa extra', magiclevelpoints: 'ML (base)', hitchance: 'acerto',
        absorbpercentphysical: 'resist. física (base)', absorbpercentpoison: 'resist. terra (base)', absorbpercentfire: 'resist. fogo (base)', absorbpercentice: 'resist. gelo (base)',
        absorbpercentenergy: 'resist. energia (base)', absorbpercentdeath: 'resist. morte (base)', absorbpercentholy: 'resist. sagrado (base)',
        dano_fisico: 'dano físico', dano_magico: 'dano mágico', roubo_vida_chance: 'roubo de vida (chance)', roubo_vida_quantia: 'roubo de vida (quantia)',
        critico_chance: 'crítico (chance)', critico_dano: 'crítico (dano)', corpo_a_corpo: 'corpo a corpo', distancia: 'distância', nivel_magico: 'nível mágico',
        resist_fisica: 'resist. física', protecao_magica: 'proteção mágica', escudo: 'escudo', max_hp: 'max HP', max_mana: 'max mana',
        capacidade: 'capacidade', regen_vida: 'regen. de vida', regen_mana: 'regen. de mana', cura_propria: 'cura própria', chance_de_loot: 'chance de loot'
    };
    for (const e of ELEM) { ROTULO['dano_elem_' + e] = 'dano ' + ELEM_PT[e]; ROTULO['resist_' + e] = 'resist. ' + ELEM_PT[e]; }
    const rotulo = (id) => ROTULO[id] || String(id || '').replace(/_/g, ' ');
    const num = (x) => (x == null || x === '' || isNaN(Number(x)) ? 0 : Number(x));
    const normNome = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

    /* ---- relatório ---- */
    function normConta(j) {
        if (!j || typeof j !== 'object' || j.relatorio !== 'tibidle-helper equipamento' || !Array.isArray(j.itens)) throw new Error('não é um relatório de equipamento do helper (Equip → RELATÓRIO)');
        const c = j.conta || {};
        return {
            nome: String(c.nome || 'conta'), mundo: c.mundo || '', nivel: num(j.nivel), fase: num(j.fase), geradoEm: j.geradoEm || null, versao: j.versao || '', formato: num(j.formato) || 1,
            skills: j.skills || {}, personagens: j.personagens || {}, itens: j.itens.map(i => Object.assign({}, i, { ficha: i.ficha || {}, atributos: i.atributos || [], imbuements: i.imbuements || [], porVoc: i.porVoc || {} })),
            mercado: Array.isArray(j.mercado) ? j.mercado : [], legado: j.legado || null, loyalty: j.loyalty || null,
            deposito: j.deposito || null, ouro: j.ouro != null ? num(j.ouro) : null, mapa: j.mapa || null, assetsVer: j.assetsVer || null,
            pesos: j.pesos && typeof j.pesos === 'object' ? j.pesos : null, // formato 3 (helper 2.41.0): a tabela de pesos do Equip por vocação
            figuras: j.figuras && typeof j.figuras === 'object' ? j.figuras : null // formato 4 (helper 2.42.0): {itemId: webp em base64}
        };
    }
    const diasDesde = (iso, agora) => (iso ? Math.floor(((agora || Date.now()) - new Date(iso).getTime()) / 86400000) : null);
    /* ---- selo do relatório (02/11, noite): idade, versão do helper, pesos exatos ou reconstruídos, figuras ----
     * Uma decisão de transferência com relatório velho ou com pesos reconstruídos (≈) é o erro mais barato de evitar: o selo fica no
     * cartão de cada conta e na aba "Vale a pena passar". */
    const HELPER_PESOS = '2.41.0', HELPER_FIGURAS = '2.42.0', DIAS_VELHO = 7;
    const cmpVer = (a, b) => { const x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
    function selo(conta, agora) {
        const dias = diasDesde(conta.geradoEm, agora), velho = dias == null || dias > DIAS_VELHO;
        const pesosExatos = !!(conta.pesos && VOCS.some(v => conta.pesos[v] && typeof conta.pesos[v] === 'object'));
        const figuras = !!(conta.figuras && Object.keys(conta.figuras).length);
        const avisos = [];
        if (velho) avisos.push(dias == null ? 'relatório sem data: gere um novo' : `relatório de ${dias} dias: o baú e as notas podem ter mudado — gere um novo`);
        if (!pesosExatos) avisos.push(`pesos do Equip reconstruídos (≈): gere o relatório com o helper ${HELPER_PESOS} ou mais novo` + (conta.versao && cmpVer(conta.versao, HELPER_PESOS) < 0 ? ` (este veio do ${conta.versao})` : ''));
        if (!figuras) avisos.push(`sem figuras no relatório (helper ${HELPER_FIGURAS}+): a página usa as figuras embutidas nela`);
        return { dias, velho, pesosExatos, figuras, formato: conta.formato, versao: conta.versao, avisos, ok: !velho && pesosExatos };
    }

    /* ---- figura ---- */
    function idDoItem(peca, mapa) {
        if (peca && peca.itemId != null) return Number(peca.itemId);
        const nome = typeof peca === 'string' ? peca : (peca && peca.nome);
        if (!nome || !mapa) return null;
        const n = normNome(nome);
        if (mapa[n] != null) return Number(mapa[n]);
        const semPlural = n.replace(/s$/, '');
        if (mapa[semPlural] != null) return Number(mapa[semPlural]);
        return null;
    }
    const urlFigura = (id, ver, base) => (id == null ? null : `${base || 'https://play.tibidle.com'}/assets/v${ver}/items/${Math.floor(id / 1000)}/${id}.webp`);

    /* ---- mapa: com que elemento bate (estimativa: o elemento a que o monstro é imune) ---- */
    function elemDoCatalogo(e) {
        if (!e) return null;
        if (Array.isArray(e)) return { elem: ELEM_CAT[String(e[0]).toUpperCase()] || null, pct: num(e[1]) };
        const t = String(e.type || '').toUpperCase().replace(/^COMBAT_/, '').replace(/DAMAGE$/, '');
        return { elem: ELEM_CAT[t] || null, pct: num(e.percent) };
    }
    function elementosDoMapa(hunt) {
        const ms = (hunt && (hunt.monsters || hunt.m)) || [];
        const peso = {}; let total = 0; const quem = {};
        for (const m of ms) {
            const nome = Array.isArray(m) ? m[0] : m.name, vida = num(Array.isArray(m) ? m[1] : m.health) || 1, w = num(Array.isArray(m) ? m[2] : m.weight) || 1;
            const els = (Array.isArray(m) ? m[3] : m.elements) || [];
            const p = vida * w; total += p;
            for (const e of els) {
                const x = elemDoCatalogo(e); if (!x || !x.elem || x.pct < 100) continue;
                peso[x.elem] = (peso[x.elem] || 0) + p; (quem[x.elem] = quem[x.elem] || []).push(nome);
            }
        }
        const out = Object.entries(peso).map(([elem, p]) => ({ elem, peso: total ? p / total : 0, monstros: quem[elem] })).sort((a, b) => b.peso - a.peso);
        return { fisico: true, elementos: out, estimativa: true };
    }

    /* ---- proteção de uma peça contra um elemento (em %) ---- */
    function protecaoDe(peca, elem) {
        if (!peca) return 0;
        const f = peca.ficha || {}; let t = 0;
        if (FICHA_ABS[elem]) t += num(f[FICHA_ABS[elem]]);
        if (FICHA_PROT[elem]) t += num(f[FICHA_PROT[elem]]);
        for (const a of (peca.atributos || [])) {
            if (a.id === ATRIB_RESIST[elem]) t += num(a.valor);
            if (a.id === 'protecao_magica' && elem !== 'fisico') t += num(a.valor);
        }
        for (const im of (peca.imbuements || [])) { if (im && IMBU_ELEM[normNome(im.nome)] === elem) t += num(im.valor); }
        return Math.round(t * 100) / 100;
    }
    const armaduraDe = (peca) => num(peca && peca.ficha && peca.ficha.armor);
    /* ---- imbuement de proteção que cobriria o elemento (02/11, noite) ----
     * Peça do corpo com encaixe de imbuement livre (ficha.imbuementslot − imbuements que já tem) e que aceita a categoria do elemento
     * (a ficha traz a chave 'elemental protection <elem>' quando aceita). Tiers Basic/Intricate/Powerful = 3/8/15 % (tabela do helper,
     * IMB_VALORES); dura 20 h de caçada. Peça que já tem imbuement desse elemento fica fora. */
    const IMBU_PROT = { fogo: ['Dragon Hide', 'elemental protection fire'], gelo: ['Quara Scale', 'elemental protection ice'], energia: ['Cloud Fabric', 'elemental protection energy'],
                        terra: ['Snake Skin', 'elemental protection earth'], morte: ['Lich Shroud', 'elemental protection death'], sagrado: ['Demon Presence', 'elemental protection holy'] };
    const IMBU_TIERS = [3, 8, 15];
    function imbuementsPara(pecas, elem) {
        const def = IMBU_PROT[elem]; if (!def) return [];
        const out = [];
        for (const p of (pecas || [])) {
            const f = (p && p.ficha) || {}, n = num(f.imbuementslot); if (!n || !(def[1] in f)) continue;
            const tem = (p.imbuements || []).filter(Boolean);
            if (tem.length >= n || tem.some(im => IMBU_ELEM[normNome(im.nome)] === elem)) continue;
            out.push({ peca: p, slot: p.slot, nome: def[0], livres: n - tem.length, tiers: IMBU_TIERS.slice() });
        }
        return out;
    }
    const vestidas = (conta, voc) => (conta.itens || []).filter(i => i.origem === 'corpo' && i.dono === voc);
    const podeVestir = (peca, voc) => !!(peca && peca.porVoc && peca.porVoc[voc]);

    /* ---- aguentar: a conta escolhida contra um mapa ---- */
    function aguentar(contas, contaNome, hunt, opc) {
        opc = opc || {};
        const conta = contas.find(c => c.nome === contaNome); if (!conta) throw new Error('conta não carregada: ' + contaNome);
        const mapa = elementosDoMapa(hunt);
        const elems = ['fisico'].concat(mapa.elementos.map(e => e.elem).filter(e => e !== 'fisico' && ELEM.includes(e)));
        /* físico tem régua própria (a armadura já segura parte): descoberto < 5 %, fraco < 12 %; mágico: < 10 % e < 20 % */
        const limiarDe = (e) => (e === 'fisico' ? (opc.limiarFis != null ? opc.limiarFis : 5) : (opc.limiar != null ? opc.limiar : 10));
        const fracoDe = (e) => (e === 'fisico' ? (opc.fracoFis != null ? opc.fracoFis : 12) : (opc.fraco != null ? opc.fraco : 20));
        const minGanho = opc.minGanho != null ? opc.minGanho : 3;
        const vocs = {};
        for (const voc of VOCS) {
            const pecas = vestidas(conta, voc);
            const porElem = {};
            for (const e of elems) porElem[e] = Math.round(pecas.reduce((t, p) => t + protecaoDe(p, e), 0) * 10) / 10;
            const armor = pecas.reduce((t, p) => t + armaduraDe(p), 0);
            const descobertos = elems.filter(e => porElem[e] < limiarDe(e)), fracos = elems.filter(e => porElem[e] >= limiarDe(e) && porElem[e] < fracoDe(e));
            /* sugestões: peça parada em qualquer conta, mesmo espaço de uma peça do corpo, que a vocação pode vestir, do nível dele, e que
             * ganha pelo menos minGanho % de proteção no elemento descoberto ou fraco */
            const sugestoes = [];
            for (const e of elems.filter(x => porElem[x] < fracoDe(x))) {
                for (const c2 of contas) for (const cand of c2.itens) {
                    if (cand.origem === 'corpo' || !podeVestir(cand, voc) || !SLOTS.includes(cand.slot)) continue;
                    if (num(cand.ficha && cand.ficha.level) > conta.nivel) continue;
                    const atual = pecas.find(p => p.slot === cand.slot) || null;
                    const ganho = protecaoDe(cand, e) - (atual ? protecaoDe(atual, e) : 0);
                    if (ganho < minGanho) continue;
                    const ptNova = cand.porVoc[voc].pontos, ptAtual = atual && atual.porVoc && atual.porVoc[voc] ? atual.porVoc[voc].pontos : 0;
                    sugestoes.push({ elem: e, peca: cand, conta: c2.nome, slot: cand.slot, atual, ganho: Math.round(ganho * 10) / 10, protecaoNova: protecaoDe(cand, e), ptNova, ptAtual, custoPt: Math.round((ptAtual - ptNova) * 10) / 10 });
                }
            }
            sugestoes.sort((a, b) => b.ganho - a.ganho || a.custoPt - b.custoPt);
            /* uma por espaço e elemento (a melhor) */
            const vistos = new Set(), top = [];
            for (const s of sugestoes) { const k = s.elem + '|' + s.slot; if (vistos.has(k)) continue; vistos.add(k); top.push(s); }
            /* imbuement de proteção nas peças do corpo com encaixe livre, para cada elemento descoberto ou fraco */
            const imbu = {}; for (const e of elems.filter(x => porElem[x] < fracoDe(x))) { const l = imbuementsPara(pecas, e); if (l.length) imbu[e] = l; }
            vocs[voc] = { armor, porElem, descobertos, fracos, sugestoes: top.slice(0, opc.max || 6), imbu, pecas };
        }
        return { conta: conta.nome, nivel: conta.nivel, hunt: { id: hunt.id, title: hunt.title || hunt.t, rec: hunt.recommendedLevel || hunt.rec, min: hunt.levelMin || hunt.min }, mapa, elems, vocs };
    }

    /* ---- vale a pena passar: peça parada numa conta que ganha num personagem de OUTRA conta ----
     * A nota (pt) é da régua da conta de origem. Entre contas de nível parecido (≤ 40) a nota manda; entre contas distantes a nota não
     * compara (régua da fase 1 × fase 2), então a página usa a ficha: ataque (arma), defesa (escudo) ou armadura (resto) da peça contra a
     * que ele veste, e marca como aproximado. A peça precisa do nível que a ficha pede. Peças iguais (nome, refino, encaixes) viram uma
     * linha com a contagem; no máximo `porEspaco` candidatas por personagem e espaço. */
    const baseDe = (peca) => { const f = (peca && peca.ficha) || {}; return peca && peca.slot === 'weapon' ? (num(f.attack) || num(f.toDamage)) : peca && peca.slot === 'shield' ? num(f.defense) : num(f.armor); };
    const assinatura = (p) => normNome(p.nome) + '|' + num(p.refino) + '|' + (p.atributos || []).map(a => a.id + ':' + a.valor).sort().join(',');
    /* ---- a RÉGUA DO DESTINO (02/11, dono: "quando eu transferir, na aba Equip tem que funcionar") ----
     * A nota do Equip é da régua de cada conta (nível, fase, party medida): a mesma peça vale 1,1 pt numa conta e 7,4 noutra. Para saber
     * se o Equip da conta de DESTINO vai propor a peça, a página pontua a peça com os pesos do destino — reconstruídos do próprio relatório
     * dele: cada item traz `linhas` {id, valor, pt}, e pt ÷ valor é constante por (conta, vocação, id) (conferido nas 3 contas em 02/11:
     * variação só de arredondamento). Desde o formato 3 (helper 2.41.0) o relatório traz a tabela inteira (`pesos`) e nada é reconstruído.
     * 02/11, scarf +1 distância da u2tag para a ShamanBr: a ShamanBr não tinha item com distância, a página usou o pt da origem (9,6) e o
     * Equip de lá não propôs (lá vale 2 × regen. de mana = 2,7). Agora: com a tabela, o peso exato; reconstruindo, os PISOS da regra do
     * Equip (Paladino: distância = 2 × regen. de mana e dano sagrado = 0,6 ×; magos: nível mágico = 3 ×) valem como estimativa (`pisos`);
     * id sem peso nenhum NÃO conta (0) e fica em `semRegua` — nunca mais o pt da origem. */
    const PISOS = { PALADIN: [['distancia', 'regen_mana', 2], ['skilldist', 'regen_mana', 2], ['dano_elem_sagrado', 'regen_mana', 0.6]],
                    SORCERER: [['nivel_magico', 'regen_mana', 3], ['magiclevelpoints', 'regen_mana', 3]], DRUID: [['nivel_magico', 'regen_mana', 3], ['magiclevelpoints', 'regen_mana', 3]] };
    const _reguas = new WeakMap();
    function reguaDe(conta, voc) {
        let m = _reguas.get(conta); if (!m) { m = {}; _reguas.set(conta, m); }
        if (m[voc]) return m[voc];
        const tab = conta.pesos && conta.pesos[voc];
        if (tab && typeof tab === 'object') {
            const pesos = {}; for (const [id, x] of Object.entries(tab)) if (typeof x === 'number' && Number.isFinite(x)) pesos[id] = x;
            return (m[voc] = { pesos, n: {}, pisos: [], tabela: true });
        }
        const acc = {};
        for (const it of (conta.itens || [])) {
            const pv = it.porVoc && it.porVoc[voc]; if (!pv || !Array.isArray(pv.linhas)) continue;
            for (const l of pv.linhas) { const v = Number(l.valor), pt = Number(l.pt); if (!l.id || !Number.isFinite(v) || !v || !Number.isFinite(pt)) continue; (acc[l.id] = acc[l.id] || []).push(pt / v); }
        }
        const pesos = {}, n = {}, pisos = [];
        for (const [id, rs] of Object.entries(acc)) { rs.sort((a, b) => a - b); pesos[id] = rs[rs.length >> 1]; n[id] = rs.length; }
        for (const [id, base, k] of (PISOS[voc] || [])) if (pesos[id] == null && pesos[base] != null) { pesos[id] = pesos[base] * k; pisos.push(id); }
        return (m[voc] = { pesos, n, pisos, tabela: false });
    }
    /* a peça (do relatório da origem) pontuada com a régua do destino: Σ valor × peso. Linha especial (dano da wand, imbuement, munição,
     * mana por tiro — id com espaço) fica com o pt da origem e marca `aproximados`; id de atributo sem peso no destino conta 0 e marca
     * `semRegua`; peso que veio de um piso da regra do Equip marca `pisos`. Linha da forja que valia 0 na origem mas vale no destino entra. */
    const especial = (id) => /\s/.test(String(id || ''));
    function notaNoDestino(peca, voc, destino) {
        const pv = (peca.porVoc && peca.porVoc[voc]) || {}, R = reguaDe(destino, voc), linhas = [], semRegua = [], aproximados = [], pisos = [], vistos = new Set();
        let nota = 0;
        for (const l of (Array.isArray(pv.linhas) ? pv.linhas : [])) {
            const v = Number(l.valor), ptO = num(l.pt); vistos.add(l.id);
            let pt, fonte;
            if (Number.isFinite(v) && v && R.pesos[l.id] != null && !especial(l.id)) { pt = v * R.pesos[l.id]; fonte = R.pisos.includes(l.id) ? 'piso' : 'destino'; if (fonte === 'piso') pisos.push(l.id); }
            else if (especial(l.id)) { pt = ptO; fonte = 'origem'; if (ptO) aproximados.push(l.id); }
            else { pt = 0; fonte = 'ignorada'; if (ptO) semRegua.push(l.id); }
            nota += pt; linhas.push({ id: l.id, valor: l.valor, ptOrigem: ptO, pt: Math.round(pt * 100) / 100, fonte });
        }
        for (const a of (peca.atributos || [])) {
            const id = String(a.id || '').toLowerCase().replace(/[\s-]+/g, '_'), v = Number(String(a.valor).replace(',', '.'));
            if (!id || vistos.has(id) || !Number.isFinite(v) || !v || R.pesos[id] == null) continue;
            const pt = v * R.pesos[id], piso = R.pisos.includes(id); if (piso) pisos.push(id);
            nota += pt; vistos.add(id); linhas.push({ id, valor: v, ptOrigem: 0, pt: Math.round(pt * 100) / 100, fonte: piso ? 'piso' : 'destino' });
        }
        return { nota: Math.round(nota * 100) / 100, notaOrigem: num(pv.pontos), linhas, semRegua, aproximados, pisos, tabela: R.tabela, preciso: !semRegua.length && !aproximados.length && !pisos.length };
    }
    /* a regra do Equip (trocaVale, EQUIP_GANHO_TROCA = 1): com peça vestida que vale algo, troca a partir de 1 pt; espaço vazio, qualquer ganho */
    const EQUIP_GANHO_TROCA = 1;
    const trocaValeEquip = (nova, atual) => (atual > 0 ? nova - atual >= EQUIP_GANHO_TROCA : nova > 0);
    const temporaria = (peca) => { const f = (peca && peca.ficha) || {}; return num(f.charges) > 0 || !!f.showduration || !!f.stopduration; };
    /* ---- vale a pena passar: peça parada numa conta que o Equip da OUTRA conta vestiria ----
     * Cada peça fora do corpo é pontuada com a régua do destino (notaNoDestino) e comparada com a melhor peça que o destino já tem no espaço
     * (vestida ou guardada — é contra ela que o Equip de lá decide). Entra só o que passa na regra do Equip (≥ 1 pt; opc.minGanho). Mesmas
     * exclusões do Equip: nível exigido acima do da conta, peça de carga/tempo, arma de 2 mãos contra arma + escudo. */
    function valePassar(contas, opc) {
        opc = opc || {}; const minGanho = opc.minGanho != null ? opc.minGanho : EQUIP_GANHO_TROCA, porEspaco = opc.porEspaco != null ? opc.porEspaco : 3;
        const out = [], vistos = new Map();
        for (const de of contas) for (const peca of de.itens) {
            if (peca.origem === 'corpo' || !SLOTS.includes(peca.slot) || temporaria(peca)) continue;
            for (const para of contas) {
                if (para === de || para.nome === de.nome) continue;
                const exige = num(peca.ficha && peca.ficha.level);
                if (exige > para.nivel) continue; // ainda não pode vestir
                for (const voc of VOCS) {
                    if (!podeVestir(peca, voc)) continue;
                    const v = para.personagens && para.personagens[voc] && para.personagens[voc][peca.slot];
                    const veste = v && v.veste ? v.veste : null, melhor = v && v.melhor ? v.melhor : null;
                    const ref = melhor && num(melhor.pontos) > num(veste && veste.pontos) ? melhor : veste; // o Equip compara com a melhor que a conta já tem
                    let atualNome = ref ? ref.nome : null, atual = ref ? num(ref.pontos) : 0;
                    const atualPeca = ref ? (para.itens.find(i => i.iid === ref.iid) || null) : null;
                    const guardada = !!(ref && veste && ref.iid !== veste.iid);
                    /* arma de 2 mãos tira o escudo: compara com arma + escudo (a regra do Equip) */
                    if (peca.duasMaos) {
                        const e = para.personagens && para.personagens[voc] && para.personagens[voc].shield;
                        const re = e && e.melhor && num(e.melhor.pontos) > num(e.veste && e.veste.pontos) ? e.melhor : (e && e.veste);
                        if (re) { atual += num(re.pontos); atualNome = (atualNome ? atualNome + ' + ' : '') + re.nome; }
                    }
                    /* a mesma peça (nome, refino, encaixes) já lá: a diferença seria só a régua */
                    if (atualPeca && assinatura(atualPeca) === assinatura(peca)) continue;
                    const nd = notaNoDestino(peca, voc, para), nova = nd.nota;
                    const ganho = Math.round((nova - atual) * 10) / 10;
                    if (!trocaValeEquip(nova, atual) || ganho < minGanho) continue;
                    const chave = para.nome + '|' + voc + '|' + peca.slot + '|' + assinatura(peca) + '|' + de.nome;
                    if (vistos.has(chave)) { vistos.get(chave).iguais++; continue; }
                    /* id estável da transferência (a caixa "já passei" da página): conta de origem > destino, personagem e a peça (iid) */
                    const ent = { chave: de.nome + '>' + para.nome + '|' + voc + '|' + String(peca.iid), peca, de: de.nome, para: para.nome, voc, slot: peca.slot, nova, notaOrigem: nd.notaOrigem, atual, atualNome, guardada, ganho, firme: ganho >= 3,
                                  preciso: nd.preciso, semRegua: nd.semRegua, aproximados: nd.aproximados, pisos: nd.pisos, tabela: nd.tabela, linhas: nd.linhas, nivelDe: de.nivel, nivelPara: para.nivel, exige, iguais: 1,
                                  baseNova: baseDe(peca), baseAtual: atualPeca ? baseDe(atualPeca) : 0, medida: peca.slot === 'weapon' ? 'ataque' : peca.slot === 'shield' ? 'defesa' : 'armadura' };
                    vistos.set(chave, ent); out.push(ent);
                }
            }
        }
        out.sort((a, b) => b.ganho - a.ganho);
        /* no máximo N por personagem e espaço do destino */
        const cont = new Map(), fim = [];
        for (const e of out) { const k = e.para + '|' + e.voc + '|' + e.slot; const n = cont.get(k) || 0; if (n >= porEspaco) continue; cont.set(k, n + 1); fim.push(e); }
        return fim;
    }

    /* ---- roteiro de transferência (02/11, noite): as sugestões de valePassar agrupadas por rota (de → para), na ordem do ganho;
     * `feitas` = {chave: quando} marcadas na página; cada rota diz quantas faltam ---- */
    function rotas(lista, feitas) {
        feitas = feitas || {};
        const m = new Map();
        for (const x of (lista || [])) {
            const k = x.de + '>' + x.para; if (!m.has(k)) m.set(k, { de: x.de, para: x.para, itens: [], faltam: 0, feitas: 0 });
            const r = m.get(k), feita = !!feitas[x.chave]; r.itens.push(Object.assign({ feita, quando: feita ? feitas[x.chave] : null }, x)); if (feita) r.feitas++; else r.faltam++;
        }
        return [...m.values()].sort((a, b) => b.faltam - a.faltam || b.itens.length - a.itens.length);
    }

    /* ---- limpeza: o que o Equip já marcou como sobra / épico sem linha útil / encaixe nobre ---- */
    function limpeza(conta) {
        const g = { sobra: [], epico: [], nobre: [], forja: [] };
        for (const p of conta.itens) {
            const v = String(p.veredito || '');
            if (/sem linha útil/.test(v)) g.epico.push(p);
            else if (/^sobra/.test(v)) g.sobra.push(p);
            else if (/^encaixe nobre/.test(v)) g.nobre.push(p);
            else if (/^base de forja/.test(v)) g.forja.push(p);
        }
        const soma = (l) => l.reduce((t, p) => t + num(p.npc), 0);
        return { conta: conta.nome, grupos: g, npc: { sobra: soma(g.sobra), epico: soma(g.epico), nobre: soma(g.nobre), forja: soma(g.forja) } };
    }
    const tipoVeredito = (v) => { v = String(v || ''); return /^vestida/.test(v) ? 'vestida' : /^vai vestir/.test(v) ? 'vai vestir' : /sem linha útil/.test(v) ? 'épico sem linha' : /^sobra/.test(v) ? 'sobra' : /^encaixe nobre/.test(v) ? 'encaixe nobre' : /^base de forja/.test(v) ? 'base de forja' : /^reserva/.test(v) ? 'reserva' : 'outro'; };

    const api = { VOCS, VOC_PT, SLOTS, SLOT_PT, RAR_PT, ELEM, ELEM_PT, ROTULO, rotulo, normNome, normConta, diasDesde, selo, HELPER_PESOS, HELPER_FIGURAS, cmpVer, idDoItem, urlFigura, elementosDoMapa, protecaoDe, armaduraDe, imbuementsPara, IMBU_TIERS, vestidas, podeVestir, aguentar, rotas, reguaDe, notaNoDestino, trocaValeEquip, EQUIP_GANHO_TROCA, valePassar, limpeza, tipoVeredito };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    raiz.PainelCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

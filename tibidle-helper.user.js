// ==UserScript==
// @name         Tibidle Helper (Northon)
// @namespace    northon.tibidle
// @version      2.9.0
// @description  Magia Inteligente (Econômica / Equilibrado / Área / Boss) + Analisador + Auto Hunt (mochila cheia → finalizar, purificar, vender, depot, voltar). Hunt, boss, mochila e ouro lidos do WebSocket; APLICAR NOS 4 e dano real pelo socket/REST, sem abrir janela. Scan: mede N mapas por 5 min cada (lure máximo, Equilibrado) e diz qual vale para XP, ouro ou os dois. Inteligente: 4 slots por DPS + poções, cura, suporte e munição. Nada automático nos slots. Equip: ranqueia corpo + depósito + mochila por vocação e slot e equipa pelo socket só por botão.
// @author       Northon
// @homepageURL  https://github.com/priscilaenorthon-dev/tibidle-helper
// @updateURL    https://raw.githubusercontent.com/priscilaenorthon-dev/tibidle-helper/main/tibidle-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/priscilaenorthon-dev/tibidle-helper/main/tibidle-helper.user.js
// @match        https://play.tibidle.com/*
// @match        *://*.play.tibidle.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

/* eslint-disable curly, no-multi-spaces, no-empty */
/* ⚠ Os três avisos acima são ESTILO, não defeito, e são desligados de
 * propósito:
 *   curly          — 75 ocorrências de "if (x) return;" numa linha. São
 *                    guardas de entrada; abrir chave em todas incha o arquivo
 *                    sem melhorar nada.
 *   no-multi-spaces— comentários alinhados à direita do código, de propósito.
 *   no-empty       — "catch (e) { }" proposital: leitura de DOM que pode não
 *                    existir ainda não deve derrubar o painel inteiro.
 * Isto é um userscript de arquivo único, sem config de ESLint no projeto — o
 * linter que apita é o padrão do editor, não uma regra nossa. */

(function () {
    'use strict';

    const VERSAO = '2.9.0';

    /* =========================================================================
     *  ⚠ POR QUE document-start E NÃO document-idle
     *
     *  O jogo fala por UM WebSocket. Em document-idle o script sobe DEPOIS que
     *  o socket já abriu, e embrulhar o construtor nessa altura não pega nada —
     *  foi por isso que o primeiro grampo ficou 30 segundos sem ver um frame.
     *  Mesma armadilha que o Stonegy Helper documentou na v2.44.0 dele.
     *
     *  Em document-start o embrulho entra antes de qualquer socket nascer.
     *  ⚠ Mas aqui o DOM ainda NÃO existe — por isso todo acesso ao documento
     *  passa por esperarQue(), e o painel só é montado dentro de iniciar().
     *
     *  ⚠⚠ O QUE ESTE GRAMPO NÃO FAZ: decodificar o estado. Eu nunca vi o
     *  formato dos frames deste jogo, então não invento parser. Ele COLETA e
     *  mostra os tipos na aba Analisador. Enquanto o formato não for conhecido,
     *  a fonte de verdade continua sendo o DOM — só que amostrado bem mais
     *  rápido. Quando os tipos aparecerem ali, dá pra escrever o parser certo.
     * ====================================================================== */
    /* ⭐ O QUE SAI IMPORTA MAIS QUE O QUE CHEGA.
     *
     * Objetivo declarado pelo Northon: trocar magia SEM abrir o diálogo — o
     * jeito que o Stonegy Helper fazia, mandando `{type:'select_skills',...}`
     * direto pelo socket. No Tibidle o equivalente é `update_battle_config`,
     * e o TIBIDLE.md lista o schema dele como PENDÊNCIA EM ABERTO.
     *
     * Descobrir é simples e seguro: aplicar UMA vez pelo diálogo normal e ler
     * o frame que o cliente manda. Por isso `enviados` guarda os frames de
     * SAÍDA com payload completo — é a peça que faltava. Depois de capturado,
     * dá pra reproduzir o frame com os slots trocados e a janela nunca abre.
     *
     * ⚠ NÃO existe envio aqui ainda, e não vou escrever um às cegas: mandar
     * payload inventado pro servidor é convite a erro de estado ou a chamar
     * atenção. Primeiro captura, depois envia. */
    const WS = { tipos: {}, amostras: {}, bin: {}, enviados: {}, socket: null, frames: 0, desde: Date.now() };
    (function grampearWS() {
        try {
            const ouvir = (ws) => {
                if (!ws || ws.__tbOuvindo) return;
                ws.__tbOuvindo = true;
                WS.socket = ws;
                ws.addEventListener('message', ev => {
                    WS.frames++;
                    if (typeof ev.data !== 'string') {
                        try {
                            const b = new Uint8Array(ev.data.slice ? ev.data.slice(0, 4) : ev.data);
                            const k = [...b].map(x => x.toString(16).padStart(2, '0')).join(' ');
                            WS.bin[k] = (WS.bin[k] || 0) + 1;
                        } catch (e) { }
                        return;
                    }
                    let o; try { o = JSON.parse(ev.data); } catch (e) { return; }
                    const t = (o && o.type) || '?';
                    if (t === 'pong') return;
                    WS.tipos[t] = (WS.tipos[t] || 0) + 1;
                    if (!WS.amostras[t]) WS.amostras[t] = JSON.stringify(o).slice(0, 400);
                    try { observarRecebido(o); } catch (e) { }
                });
            };
            // pega dos DOIS lados: construtor (sockets novos) e send (o vivo)
            const OrigSend = WebSocket.prototype.send;
            WebSocket.prototype.send = function (d) {
                ouvir(this);
                try {
                    if (typeof d === 'string' && d.length < 20000) {
                        const o = JSON.parse(d);
                        const t = (o && o.type) || '?';
                        if (t !== 'ping') {
                            if (!WS.enviados[t]) WS.enviados[t] = { n: 0, ultimo: null };
                            WS.enviados[t].n++;
                            // guarda o payload INTEIRO: é ele que vira o molde do envio
                            WS.enviados[t].ultimo = d.length < 8000 ? d : d.slice(0, 8000);
                            try { observarEnviado(o); } catch (e) { }
                        }
                    }
                } catch (e) { }
                return OrigSend.apply(this, arguments);
            };
            const OrigWS = window.WebSocket;
            const Embrulhado = function (...a) { const ws = new OrigWS(...a); ouvir(ws); return ws; };
            Embrulhado.prototype = OrigWS.prototype;
            Object.assign(Embrulhado, OrigWS);
            window.WebSocket = Embrulhado;
        } catch (e) { console.warn('[TB] grampo do WS falhou', e); }
    })();

    /* =========================================================================
     *  POR QUE ESTE SCRIPT É DIFERENTE DO STONEGY HELPER
     *
     *  1) O Tibidle tem data-testid em tudo (143 âncoras mapeadas ao vivo em
     *     30/08). O Stonegy não tinha, e por isso aquele script se ancorava por
     *     TEXTO DE IMAGEM — frágil e lento. Aqui a gente usa as âncoras.
     *
     *  2) O Stonegy usava MANA como proxy de potência da magia, porque não
     *     conseguia ler o dano. O Tibidle mostra o dano REAL já calculado com
     *     os stats do personagem, no diálogo de atalho:
     *         EFEITO → "Dano: 42-64"
     *     A gente lê e guarda. Isso é medição, não estimativa.
     *
     *  3) ⚠ AS FÓRMULAS DO CATÁLOGO /spells ESTÃO ERRADAS (até 5,8× de erro —
     *     ela previa 293 de dano pra Energy Wave, o real é 50,5). NUNCA usar
     *     `formula`/`formulaRaw` pra decidir nada. Só mana, cooldown, área,
     *     vocação e nível vêm do catálogo; o dano vem do diálogo.
     *
     *  4) O Stonegy não pesava CUSTO EM OURO no ranking. Medido em 30/08 no
     *     Cults Goroma: a configuração "melhor dano" deu 52,4k EXP/h e
     *     −102,6k OURO/h — 10 mil de ouro evaporaram em 5 minutos. A causa:
     *     magia de 17 e 37 casas num lure de 5 monstros. As casas extras não
     *     tinham em quem bater, mas a mana era cobrada igual.
     *     ⇒ ALVOS ESPERADOS = min(casas da magia, lure da hunt). Sempre.
     * ====================================================================== */

    // ---- constantes medidas ------------------------------------------------
    // Mana Potion: 56 ouro, restaura 75-125 (média 100) = 0,56 ouro por ponto.
    // É a mais barata por ponto; a Strong custa 0,72. Ver TIBIDLE.md §7z.
    const OURO_POR_MANA = 0.56;

    /* ⭐ MODO REGENERACAO — descoberto no tune-up de 19/09.
     *
     * Todo o modelo economico assume que cada ponto de mana custa 0,56 de ouro
     * (o preco da pocao). Isso so e verdade com a POCAO DE MANA LIGADA. Com o
     * atalho de mana em "off", a party lanca magia so com o que regenera — e
     * mana regenerada nao custa nada. O veredito "NAO se paga" vira mentira:
     * a magia e gratis, o que muda e o RITMO (quando a mana acaba, sobra so o
     * auto-ataque ate regenerar).
     *
     * Nesse regime a pergunta certa nao e "cabe no loot?", e "qual magia rende
     * mais dano POR MANA?" — porque a mana e o orcamento, nao o ouro. O
     * ranking dano/ouro ja e proporcional a dano/mana, entao ele continua
     * valendo; o que muda e: (1) nenhuma magia e vetada por custo, (2) o
     * Equilibrado ordena por eficiencia em vez de DPS bruto (DPS bruto escolhe
     * a onda de 25 de mana, que seca a barra em dez lancamentos), (3) a tela
     * troca o veredito de ouro por um aviso de regime. Runa continua custando
     * ouro de verdade — runa nao vem da regeneracao. */
    /* ⚠ v1.8.0 — POR VOCAÇÃO. O slot de mana na tela é só do personagem
     * selecionado. Em 22/09 o Druida tinha Mana Potion ≤50% ligada enquanto o
     * Feiticeiro (na tela, "off") fazia o helper dar regime regeneração para a
     * party inteira. Agora cada leitura visível é guardada por vocação
     * (mana_pot) e a pergunta é feita por vocação. "Slot vazio" = sem poção =
     * regeneração (antes contava como poção ligada, porque não tinha "off"). */
    function manaPotionLigada(voc) {
        const vis = vocacaoAtual();
        const el = tid('scene-slot-mana-0');
        const cache = ler('mana_pot', {});
        if (el) {
            const t = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).toLowerCase();
            const ligada = !/\boff\b/.test(t) && !/vazio/.test(t) && /poti|poção|potion|%/.test(t);
            if (cache[vis] !== ligada) { cache[vis] = ligada; guardar('mana_pot', cache); }
            if (!voc || voc === vis) return ligada;
        }
        const alvo = voc || vis;
        if (cache[alvo] != null) return cache[alvo];
        return true;                                  // sem leitura, assume o caso caro
    }
    function partyEmRegen() { return ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'].every(v => !manaPotionLigada(v)); }

    const API = 'https://play.tibidle.com';
    /* v1.8.2 — UMA GAVETA POR CONTA. Tudo que o helper guarda (hunt, dano
     * medido, modelo, poção, log) vive no localStorage do NAVEGADOR, não da
     * conta. Duas contas no mesmo navegador dividiam a gaveta: a segunda
     * herdava a hunt e o dano da primeira. Agora o boot lê /auth/me e:
     *   - a primeira conta que usou o helper fica dona de 'tb_helper_' (nada
     *     a migrar);
     *   - qualquer outra conta usa 'tb_helper_<accountId>_'.
     * Sem /auth/me (deslogado, erro de rede) cai no prefixo comum. */
    let LS = 'tb_helper_';
    let CONTA = null;
    async function escolherGaveta() {
        try {
            const me = await buscarJSON('/auth/me');
            const id = me && (me.accountId || me.id);
            if (!id) return;
            CONTA = { id, nome: me.name || '?', mundo: me.worldId || '?' };
            let dono = null;
            try { dono = JSON.parse(localStorage.getItem('tb_helper_dono') || 'null'); } catch (e) { }
            if (!dono) { try { localStorage.setItem('tb_helper_dono', JSON.stringify(id)); } catch (e) { } dono = id; }
            LS = dono === id ? 'tb_helper_' : 'tb_helper_' + id + '_';
        } catch (e) { /* deslogado ou sem rede: gaveta comum */ }
    }

    /* =========================================================================
     *  SELO DE ERA — o que o wipe de setembro ensinou
     *
     *  Em 19/09 o servidor foi zerado: a party caiu de 50 para 18, o catalogo
     *  de hunts foi de 84 para 67 e 13 magias sairam do ar. O helper continuou
     *  rodando liso, e foi esse o problema — ele seguiu decidindo com numeros
     *  da build antiga:
     *
     *    tb_helper_danos_PALADIN_50   dano medido com arma e nivel que nao existem
     *    tb_helper_sessoes            13 sessoes medidas com ~2x o DPS de hoje
     *    tb_helper_loot_49            id 49 era Dragon Lord Den, virou Pits of Inferno
     *
     *  Dado velho que PARECE valido e errado e pior que dado ausente: a curva
     *  de desperdicio se calibra em cima dele e o teto de gasto sai torto.
     *
     *  ERA e um carimbo manual. Trocar quando o jogo mudar de forma — wipe,
     *  rebalance de dano, patch que mexa em magia ou loot. Na virada o helper
     *  joga fora tudo que foi MEDIDO e mantem so o que foi ESCOLHIDO (modelo,
     *  log). Catalogo tambem cai: ele se rebaixa sozinho.
     *
     *  ⚠ A HUNT ESCOLHIDA MORRE JUNTO, e essa foi a licao mais cara do wipe.
     *  hunt_manual ficou apontando para a id 124 (Orcs Edron Cave) enquanto a
     *  party caçava em Dwarven Mines. O painel mostrava o veredito economico
     *  da hunt ERRADA — loot de 4.8 contra um monstro que larga 1.2 — e nada
     *  na tela denunciava, porque a escolha manual tem prioridade sobre a
     *  deteccao. Uma escolha so vale dentro da era em que foi feita. */
    const ERA = '2026-09-wipe';

    function purgarSeEraVelha() {
        let anterior = null;
        try { anterior = JSON.parse(localStorage.getItem(LS + 'era') || 'null'); } catch (e) { }
        if (anterior === ERA) return false;

        /* medido = morre. escolhido = fica. */
        const morre = new RegExp('^' + LS + '(danos_|loot_|sessoes$|cat_|hunt_id$|hunt_manual$|regime$|skills_vistas$)');
        const mortos = Object.keys(localStorage).filter(k => morre.test(k));
        mortos.forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });

        try { localStorage.setItem(LS + 'era', JSON.stringify(ERA)); } catch (e) { }
        return { de: anterior, para: ERA, apagadas: mortos.length };
    }

    /* Formato antigo (ate 1.6): danos_<VOC>_<nivel>. A 1.7 guarda por vocacao
     * com o nivel dentro. As chaves velhas nao fazem mal, mas ocupam espaco e
     * confundem quem le o localStorage — somem no primeiro boot. */
    function limparChavesLegadas() {
        const velhas = Object.keys(localStorage).filter(k => new RegExp('^' + LS + 'danos_[A-Z]+_\\d+$').test(k));
        velhas.forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
        return velhas.length;
    }

    /* @@MODELOS-INICIO */
    const MODELOS = {
        economica: {
            nome: 'Econômica',
            dica: 'Duas magias, sem runa: as duas de melhor dano por mana no elemento certo.'
        },
        equilibrado: {
            nome: 'Equilibrado',
            dica: 'Duas magias (a mais eficiente + a mais forte) e a runa que mais dá dano.'
        },
        area: {
            nome: 'Em área',
            dica: 'As duas magias de área mais fortes e as duas runas de área mais fortes.'
        },
        boss: {
            nome: 'Boss',
            dica: 'Escolha o boss: só as magias que mais dão dano nele, todas com gatilho ≥1.'
        },
        inteligente: {
            nome: 'Inteligente',
            dica: 'Mais por menos: mana é o orçamento. Magias por dano/mana; o que recarrega em 2 s (runa, strike, Divine Missile) vai no fim da fila como preenchimento — runa ≥2 antes do golpe ≥1. Poção de mana só no Druida (a mais barata por ponto), cura própria nos 4 + Heal Friend do Druida, Protector só se o Knight apanhar (ele corta 35 % do dano), segundo suporte só com mana sobrando.'
        }
    };
    /* v2.6.3 — VARIANTES do Inteligente para o estudo: mesmo modelo, outra
     * regra de poção. Medido em Quara (28/09): mana nos 4 = 51k xp/h e
     * −92k ouro/h (135k/h de poção); a comunidade só põe mana no Druida. */
    const VARIANTES = {
        inteligente_mana: { base: 'inteligente', manaTodos: true, nome: 'Intel. + mana nos 4' },
        inteligente_semruna: { base: 'inteligente', semRuna: true, nome: 'Intel. sem runa' },
        /* dono, 28/09: "se tirar todas as magias de defesa e suporte você aguenta o mapa" */
        inteligente_seco: { base: 'inteligente', seco: true, nome: 'Intel. seco (só poção, sem cura/suporte)' }
    };
    const nomeModelo = (m) => (MODELOS[m] || VARIANTES[m] || { nome: m }).nome;
    let _manaTodos = false, _semRuna = false, _seco = false;
    /* @@MODELOS-FIM */

    /* =========================================================================
     *  UTILITÁRIOS
     * ====================================================================== */
    const $ = (sel, raiz) => (raiz || document).querySelector(sel);
    const $$ = (sel, raiz) => [...(raiz || document).querySelectorAll(sel)];
    const tid = (t) => document.querySelector(`[data-testid="${t}"]`);
    const dorme = (ms) => new Promise(r => setTimeout(r, ms));

    /* Espera SEMPRE em laço, nunca com sleep fixo: a UI do jogo demora entre
     * 100ms e ~1,5s pra montar um diálogo, e sleep fixo ou trava ou é lento. */
    async function esperarQue(fn, timeoutMs = 4000, passoMs = 100) {
        const fim = Date.now() + timeoutMs;
        while (Date.now() < fim) {
            try { const v = fn(); if (v) return v; } catch (e) { }
            await dorme(passoMs);
        }
        return null;
    }

    const guardar = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { } };
    const ler = (k, padrao) => {
        try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : padrao; }
        catch (e) { return padrao; }
    };

    let LOG = [];
    function log(msg, tipo) {
        const linha = { t: Date.now(), msg, tipo: tipo || 'info' };
        LOG.push(linha);
        while (LOG.length > 300) LOG.shift();
        guardar('log', LOG);
        pintarLog();
        console.log('[TB]', msg);
    }

    /* =========================================================================
     *  CATÁLOGOS — busca no próprio jogo e guarda em localStorage
     *
     *  O jogo serve isso em REST público; é o mesmo que o cliente já baixa.
     *  Guardamos com validade de 24h pra não repetir requisição à toa.
     * ====================================================================== */
    const CAT = { hunts: null, magias: null, areas: null, precos: null, pocoes: null };

    async function buscarJSON(caminho) {
        const r = await fetch(API + caminho, { credentials: 'include' });
        if (!r.ok) throw new Error(caminho + ' → HTTP ' + r.status);
        return r.json();
    }

    async function carregarCatalogos(forcar) {
        const idade = Date.now() - (ler('cat_ts', 0) || 0);
        const valido = !forcar && idade < 24 * 3600 * 1000;
        if (valido) {
            CAT.hunts = ler('cat_hunts', null);
            CAT.magias = ler('cat_magias', null);
            CAT.areas = ler('cat_areas', null);
            CAT.precos = ler('cat_precos', null);
            CAT.bosses = normalizarBosses(ler('cat_bosses', null));
            if (!CAT.bosses) buscarJSON('/bosses/select').then(b => { CAT.bosses = normalizarBosses(b); guardar('cat_bosses', CAT.bosses); renderizar(); }).catch(() => { });
            CAT.pocoes = ler('cat_pocoes', null);
            if (!CAT.pocoes) buscarJSON('/potions').then(p => { CAT.pocoes = p; guardar('cat_pocoes', p); }).catch(() => { });
            if (CAT.hunts && CAT.magias) { log('catálogos do cache local', 'ok'); return true; }
        }
        try {
            log('baixando catálogos do jogo…');
            const [hunts, magias, areas, precos, bosses, pocoes] = await Promise.all([
                buscarJSON('/hunts/select'),
                buscarJSON('/spells'),
                buscarJSON('/assets/v100/spell-areas.json').catch(() => null),
                buscarJSON('/buy-prices').catch(() => null),
                buscarJSON('/bosses/select').catch(() => null),
                buscarJSON('/potions').catch(() => null)
            ]);
            CAT.hunts = hunts; CAT.magias = magias; CAT.areas = areas; CAT.precos = precos; CAT.bosses = normalizarBosses(bosses); CAT.pocoes = pocoes;
            guardar('cat_hunts', hunts); guardar('cat_magias', magias);
            guardar('cat_areas', areas); guardar('cat_precos', precos); guardar('cat_bosses', bosses); guardar('cat_pocoes', pocoes);
            guardar('cat_ts', Date.now());
            log(`catálogos ok — ${hunts.length} hunts, ${magias.length} magias`, 'ok');
            return true;
        } catch (e) {
            log('falha ao baixar catálogos: ' + e.message, 'erro');
            return false;
        }
    }

    /* =========================================================================
     *  LOOT POR ABATE — o que a hunt PAGA, e portanto o orçamento
     *
     *  /hunt/lootTable?huntId=N devolve chance (por 100.000), value e maxCount.
     *  Valor esperado por abate = Σ chance/100000 × (maxCount+1)/2 × value.
     *  Guardado por hunt, sem validade: a tabela de loot não muda sozinha.
     * ====================================================================== */
    const LOOT_CACHE = {};
    /* v2.3.0 — a TABELA inteira fica em memória: o Scan precisa do valor e da
     * chance de cada item para separar loot estável de loteria. */
    const LOOT_TABELA = {};
    async function lootTabela(huntId) {
        if (LOOT_TABELA[huntId]) return LOOT_TABELA[huntId];
        try { const t = await buscarJSON('/hunt/lootTable?huntId=' + huntId); LOOT_TABELA[huntId] = Array.isArray(t) ? t : []; return LOOT_TABELA[huntId]; }
        catch (e) { return null; }
    }

    /* ⚠ A CHAVE E O TITULO, NAO O ID. Seis ids foram reaproveitados no patch
     * de setembro para hunts completamente diferentes — o id 49 era Dragon
     * Lord Den e virou Pits of Inferno Entrance. Chaveado por id, o cache
     * devolveria o ouro-por-abate de um Dragon Lord para uma hunt de PoI, e o
     * teto de gasto sairia calibrado no lugar errado sem nenhum aviso.
     * O id segue valendo DENTRO da sessao (LOOT_CACHE em memoria), onde o
     * catalogo carregado garante que id e titulo combinam. */
    const chaveLoot = (huntId) => {
        const h = (CAT.hunts || []).find(x => x.id === huntId);
        return 'loot_' + (h && h.title ? h.title.replace(/[^\w]+/g, '_').toLowerCase() : 'id' + huntId);
    };

    async function ouroPorAbate(huntId) {
        if (typeof huntId === 'string' && huntId.startsWith('boss:')) return null;
        if (LOOT_CACHE[huntId] != null) return LOOT_CACHE[huntId];
        const guardado = ler(chaveLoot(huntId), null);
        if (guardado != null) { LOOT_CACHE[huntId] = guardado; return guardado; }
        try {
            const t = await buscarJSON('/hunt/lootTable?huntId=' + huntId);
            LOOT_TABELA[huntId] = Array.isArray(t) ? t : [];
            let o = 0;
            (t || []).forEach(it => {
                const p = (it.chance || 0) / 100000 * (((it.maxCount || 1) + 1) / 2);
                o += p * (it.value || 0);
            });
            o = Math.round(o * 10) / 10;
            LOOT_CACHE[huntId] = o; guardar(chaveLoot(huntId), o);
            return o;
        } catch (e) { return null; }
    }

    /* =========================================================================
     *  LEITURA DO ESTADO — DOM primeiro (barato), fiber do React como reserva
     * ====================================================================== */
    function vocacaoAtual() {
        // a aba pressionada no painel do personagem manda
        for (const v of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) {
            const el = tid('party-member-' + v);
            if (el && (el.getAttribute('aria-pressed') === 'true' || el.dataset.active === 'true')) return v;
        }
        // reserva: o painel lateral mostra a vocação selecionada por classe CSS
        const sel = $$('[data-testid^="party-member-"]').find(e => e.className && /ativ|select|press/i.test(e.className));
        if (sel) return sel.getAttribute('data-testid').replace('party-member-', '');
        return ler('voc_manual', 'SORCERER');
    }

    function nivelAtual() {
        const el = tid('rail-level-n');
        const n = el && parseInt((el.textContent || '').replace(/\D/g, ''));
        if (n) return n;
        /* v2.2.2 — no lobby/boot a tela ainda não tem o nível, mas o frame do
         * socket tem. Em 27/09 22:52 o boot leu "nível 1" e gravou 6 magias
         * com nível 1 na tabela de dano. */
        if (ESTADO_WS.frame && ESTADO_WS.frame.nivel) return ESTADO_WS.frame.nivel;
        return ler('nivel_manual', 1);   // sem leitura, assume o piso: nunca libera magia por engano
    }

    function ouroAtual() {
        if (frameFresco() && ESTADO_WS.frame.balance != null) return ESTADO_WS.frame.balance;
        const el = tid('hud-gold');
        return el ? parseInt((el.textContent || '').replace(/\D/g, '')) || 0 : 0;
    }

    function emHunt() {
        // v2.0.0: frame chegando = caçando. Reserva: o botão de encerrar.
        if (frameFresco()) return true;
        return !!tid('stop') || !!$$('button').find(b => /ENCERRAR CAÇADA/i.test(b.textContent || ''));
    }

    /* =========================================================================
     *  ⭐ DETECÇÃO AUTOMÁTICA DA HUNT — pelos MONSTROS na tela
     *
     *  O jogo não expõe o id da hunt em lugar nenhum do DOM, e o TÍTULO dela só
     *  aparece no resumo pós-caçada — inútil enquanto se está caçando.
     *
     *  Mas os nomes das criaturas são desenhados sobre a cena ("Adept of the
     *  Cult", "Blue Djinn", "Orc Berserker"...). Casando esses nomes com a lista
     *  de monstros de cada hunt do catálogo, a hunt sai sozinha — e com uma
     *  confiança mensurável: quantos monstros distintos bateram.
     *
     *  ⚠ Se NADA casar, retorna null de propósito. Aplicar magia da hunt errada
     *  é pior que não aplicar: elemento errado é ouro queimado. O botão fica
     *  desabilitado em vez de chutar.
     *
     *  Cache de 2s porque isto varre o DOM e é chamado a cada amostra. */
    /* ⚠⚠ ERRO CORRIGIDO EM 30/08: a primeira versão varria `div,span` atrás dos
     * nomes das criaturas. Não funciona — o jogo desenha a cena em CANVAS/WebGPU
     * (TIBIDLE.md §2), e os nomes dos monstros são PIXEL, não texto de DOM. Eu
     * vi os nomes num screenshot e concluí que eram DOM; screenshot não
     * distingue as duas coisas. Resultado na tela: "nenhum monstro reconhecido"
     * mesmo com a party caçando.
     *
     * Agora são três fontes em cascata, todas comprovadamente no DOM ou no JS:
     *
     *   1) FIBER do React — o estado do jogo tem os monstros ativos da caçada
     *      (§6b). É a fonte mais direta; não depende de texto nenhum.
     *   2) LOG DE ABATES — "Abate: +18 EXP" é texto de DOM de verdade, e o
     *      valor de EXP é uma DIGITAL da hunt: Blue Djinn dá 18, Adept of the
     *      Cult 42, Enlightened 100, Orc ~15. Casando os valores vistos contra
     *      a experiência dos monstros do catálogo, a hunt sai.
     *   3) TÍTULO no resumo — só aparece fora da caçada, mas é grátis conferir.
     *
     * A tela mostra QUAL fonte acertou, pra ficar claro no que confiar. */
    let _huntCache = { t: 0, val: null };

    function _huntPorFiber() {
        try {
            const raiz = document.querySelector('[data-testid="shell"]') || document.body;
            if (!raiz) return null;
            const k = Object.keys(raiz).find(x => x.startsWith('__reactFiber$'));
            if (!k) return null;
            let f = raiz[k];
            while (f.return) f = f.return;
            const nomes = new Set();
            let visitados = 0;
            const cheirar = (o, prof) => {
                if (!o || typeof o !== 'object' || prof > 3 || visitados > 6000) return;
                visitados++;
                if (Array.isArray(o)) {
                    for (const it of o.slice(0, 40)) {
                        if (it && typeof it === 'object' && typeof it.name === 'string'
                            && (typeof it.health === 'number' || typeof it.hp === 'number')) nomes.add(it.name);
                    }
                    return;
                }
                for (const ch of ['monsters', 'creatures', 'mobs', 'ativos', 'entities']) {
                    if (Array.isArray(o[ch])) cheirar(o[ch], prof + 1);
                }
            };
            const andar = (fib, d) => {
                if (!fib || d > 2500 || visitados > 6000) return;
                cheirar(fib.memoizedProps, 0);
                let h = fib.memoizedState, n = 0;
                while (h && n < 60) { cheirar(h.memoizedState, 0); h = h.next; n++; }
                andar(fib.child, d + 1); andar(fib.sibling, d + 1);
            };
            andar(f, 0);
            if (!nomes.size || !CAT.hunts) return null;
            let melhor = null, melhorN = 0;
            for (const h of CAT.hunts) {
                let n = 0;
                for (const m of (h.monsters || [])) if (nomes.has(m.name)) n++;
                if (n > melhorN) { melhorN = n; melhor = h; }
            }
            return melhorN ? { hunt: melhor, casados: melhorN, fonte: 'fiber' } : null;
        } catch (e) { return null; }
    }

    function _huntPorLogDeAbates() {
        try {
            if (!CAT.hunts) return null;
            // "Abate: +18 EXP" — isto É texto de DOM
            const vistos = new Set();
            const nos = document.querySelectorAll('div,span,p');
            for (let i = 0; i < nos.length; i++) {
                const t = nos[i].children.length ? '' : (nos[i].textContent || '');
                const m = t.match(/Abate:\s*\+([\d.]+)\s*EXP/i);
                if (m) vistos.add(parseInt(m[1].replace(/\./g, '')));
            }
            if (!vistos.size) return null;
            /* ⚠ A DIGITAL DE EXP EMPATA MUITO. Conferido offline contra o
             * catálogo: das 35 hunts do nível 50, só 14 ficam sem ambiguidade.
             * Orcs Edron (exp 16) empata com Carlin Raids, Tarpit Tomb e
             * Tortoise Meriana — hunts de loot e HP bem diferentes, ou seja,
             * escolher a errada estraga o veredito econômico junto.
             * Então NÃO desempato sozinho: devolvo a lista e a tela pergunta. */
            let melhorN = 0, empatados = [];
            for (const h of CAT.hunts) {
                const exps = new Set((h.monsters || []).map(m => Math.round(m.experience)));
                let n = 0;
                vistos.forEach(v => { if (exps.has(v)) n++; });
                if (n > melhorN) { melhorN = n; empatados = [h]; }
                else if (n === melhorN && n > 0) empatados.push(h);
            }
            if (!melhorN) return null;
            return {
                hunt: empatados[0], casados: melhorN, fonte: 'log de abates',
                empatados: empatados.length > 1 ? empatados : null
            };
        } catch (e) { return null; }
    }

    /* =========================================================================
     *  ⭐ DETECCAO EXATA PELA TELA DE CACADAS — a fonte que faltava
     *
     *  Em 30/08 eu desisti de detectar a hunt: a cena e canvas (nao tem texto)
     *  e a digital de EXP empata em 21 das 35 hunts. Sobrou a escolha manual,
     *  e foi ela que mentiu no wipe de setembro.
     *
     *  O patch trouxe a tela de cacadas com estado no proprio DOM:
     *
     *      <div data-testid="hunt-item-131"
     *           class="s-explore-card s-explore-card--aqui s-explore-card--selected">
     *
     *  `--aqui` e exatamente "VOCE ESTA CACANDO AQUI". Um so card tem essa
     *  classe, e o id vem no data-testid. Zero ambiguidade.
     *
     *  ⚠ O CUSTO E ABRIR UM MODAL, entao isto NAO roda no laco de amostragem.
     *  Roda no boot e no botao da aba Estado. O resultado fica em hunt_id, que
     *  e o que huntAtual() ja consulta primeiro. */
    async function confirmarHuntPeloExplore() {
        const abrir = tid('actionbar-explore');
        if (!abrir) return { erro: 'botão CAÇADAS não está na tela' };
        abrir.click();

        const card = await esperarQue(
            () => $('[data-testid^="hunt-item-"].s-explore-card--aqui'), 6000);

        const voltar = () => { const b = tid('screen-hunts-back'); if (b) b.click(); };

        if (!card) { voltar(); return { erro: 'nenhum card marcado como "você está caçando aqui"' }; }

        const id = parseInt((card.getAttribute('data-testid') || '').replace('hunt-item-', ''), 10);
        voltar();
        await dorme(400);

        if (isNaN(id)) return { erro: 'id do card ilegível' };
        const h = (CAT.hunts || []).find(x => x.id === id);
        if (!h) return { erro: 'hunt ' + id + ' não está no catálogo' };

        const antes = ler('hunt_id', null);
        guardar('hunt_id', id);
        guardar('hunt_manual', id);
        _huntCache = { t: 0, val: null };
        if (antes !== id) {
            log(`hunt confirmada pela tela de caçadas: ${h.title}` +
                (antes != null ? ` (estava apontando para a id ${antes})` : ''), 'ok');
        }
        return { hunt: h };
    }

    function _huntPorTitulo() {
        try {
            if (!CAT.hunts) return null;
            const conj = new Set();
            const nos = document.querySelectorAll('div,span,h1,h2,h3,h4');
            for (let i = 0; i < nos.length; i++) {
                if (nos[i].children.length) continue;
                const t = (nos[i].textContent || '').trim();
                if (t.length > 3 && t.length < 48) conj.add(t);
            }
            const h = CAT.hunts.find(x => conj.has(x.title));
            return h ? { hunt: h, casados: 1, fonte: 'título na tela' } : null;
        } catch (e) { return null; }
    }

    function detectarHunt() {
        if (Date.now() - _huntCache.t < 2000) return _huntCache.val;
        /* Isto é SÓ PALPITE agora — quem decide é a lista da tela de Magia.
         * Deixei ligado porque um palpite certo poupa um clique, e porque o
         * Analisador precisa saber a hunt mesmo quando você não escolheu nada. */
        const achado = _huntPorFiber() || _huntPorLogDeAbates() || _huntPorTitulo();
        _huntCache = { t: Date.now(), val: achado };
        return achado;
    }

    /* ⚠ A ESCOLHA MANUAL MANDA. A detecção automática ficou como sugestão e só
     * vale quando não há nada escolhido. Motivo (30/08): tentei duas fontes —
     * nomes na cena (impossível, é canvas) e digital de EXP (ambígua em 21 das
     * 35 hunts) — e nenhuma resolve sem perguntar. Enquanto não houver uma
     * fonte que acerte sozinha, adivinhar é pior que a lista: hunt errada =
     * elemento errado = ouro queimado. */
    function huntAtual() {
        const manual = ler('hunt_id', null);
        if (manual != null && CAT.hunts) {
            const h = CAT.hunts.find(x => x.id === manual);
            if (h) return h;
        }
        const d = detectarHunt();
        return d ? d.hunt : null;
    }

    /* @@MAGIA-INICIO — o planejador de magias; testes/magia.test.js roda este trecho no node com stubs para o DOM e o estado. */
    /* =========================================================================
     *  CÉREBRO 1 — NOTA DE ELEMENTO POR HUNT (com veto de imunidade)
     *
     *  No catálogo, `percent` é quanto o monstro ABSORVE. Então o que ele TOMA
     *  é (100 - percent). Terra 100 no Gargoyle = toma 0 = imune.
     *
     *  ⚠ VETO DE IMUNIDADE (herdado do Stonegy, e aqui é ainda mais necessário):
     *  a média engana. Numa hunt com dois monstros, um que toma 100% e outro
     *  que toma 0%, a média dá 50 — parece aceitável, mas metade da hunt é
     *  invencível pra aquele elemento. Se QUALQUER monstro com peso toma <=25%,
     *  o elemento é rebaixado a no máximo 30.
     * ====================================================================== */
    const ELEMENTOS = [
        'COMBAT_PHYSICALDAMAGE', 'COMBAT_ENERGYDAMAGE', 'COMBAT_FIREDAMAGE',
        'COMBAT_ICEDAMAGE', 'COMBAT_EARTHDAMAGE', 'COMBAT_HOLYDAMAGE', 'COMBAT_DEATHDAMAGE'
    ];
    const rotuloElem = (e) => ({
        COMBAT_PHYSICALDAMAGE: 'físico', COMBAT_ENERGYDAMAGE: 'energia', COMBAT_FIREDAMAGE: 'fogo',
        COMBAT_ICEDAMAGE: 'gelo', COMBAT_EARTHDAMAGE: 'terra', COMBAT_HOLYDAMAGE: 'sagrado',
        COMBAT_DEATHDAMAGE: 'morte'
    }[e] || e);

    /* v1.8.1 — BOSS COMO HUNT DE UM MONSTRO. /bosses/select traz health,
     * elements e kind. Lure 1 ⇒ alvos = 1 ⇒ casas não contam, só o dano no
     * elemento dele. Sem loot no cache ⇒ sem veredito de ouro (boss é luta
     * curta, o que importa é matar). */
    /* /bosses/select devolve { bosses: [...] }, não a lista. */
    function normalizarBosses(b) {
        if (!b) return null;
        if (Array.isArray(b)) return b;
        const arr = b.bosses || b.data || b.items || Object.values(b).find(Array.isArray);
        return Array.isArray(arr) ? arr : null;
    }
    function huntDeBoss(nome) {
        const b = (CAT.bosses || []).find(x => x.name === nome);
        if (!b) return null;
        return { id: 'boss:' + b.name, title: 'Boss ' + b.name, boss: true, levelMin: b.levelMin || 1,
                 lureTiers: [{ min: 1, max: 1 }], maxLure: 1,
                 monsters: [{ name: b.name, health: b.health, experience: b.experience, weight: 1, elements: b.elements || [] }] };
    }
    function alvoDoModelo() {
        return ler('modelo', 'equilibrado') === 'boss' ? huntDeBoss(ler('boss_nome', null)) : huntAtual();
    }

    /* v2.6.3 — ARMADURA DO MONSTRO. /bestiary/creature?name=X traz armor e
     * defense; a wiki diz que a armadura é desconto FIXO por golpe e só vale
     * contra dano físico. Então golpe físico fraco rende menos em bicho de
     * armadura alta. Cache por nome (bestiario_<nome>), buscado quando a hunt
     * entra no plano. */
    const BESTIARIO = {};
    async function bestiarioHunt(hunt) {
        if (!hunt || !hunt.monsters) return;
        for (const m of hunt.monsters) {
            if (BESTIARIO[m.name]) continue;
            const g = ler('bestiario_' + m.name, null);
            if (g) { BESTIARIO[m.name] = g; continue; }
            try {
                const c = await buscarJSON('/bestiary/creature?name=' + encodeURIComponent(m.name));
                const v = { armor: Number(c.armor) || 0, defense: Number(c.defense) || 0, speed: c.speed };
                BESTIARIO[m.name] = v; guardar('bestiario_' + m.name, v);
            } catch (e) { BESTIARIO[m.name] = { armor: 0, defense: 0, desconhecido: true }; }
        }
    }
    function armaduraMedia(hunt) {
        if (!hunt || !hunt.monsters) return 0;
        let s = 0, w = 0;
        for (const m of hunt.monsters) { const b = BESTIARIO[m.name]; if (!b) continue; const p = Math.max(1, m.weight || 1); s += b.armor * p; w += p; }
        return w ? s / w : 0;
    }
    /* v2.7.2 — wiki /como-o-dano-e-calculado: golpe físico perde o bloqueio
     * (0,5–1× a defesa) E a armadura (0,5–1× a armadura). Média: 0,75 ×
     * (armadura + defesa). Dragon Lair 28/09: flecha comum 20 por tiro medido
     * em 82 tiros; fórmula 12 + 0,045×25×33 = 50 − 0,75×(15+10 | 25+30
     * ponderado ≈ 43) ≈ 18. Bate. */
    function reducaoFisicaMedia(hunt) {
        if (!hunt || !hunt.monsters) return 0;
        let s = 0, w = 0;
        for (const m of hunt.monsters) { const b = BESTIARIO[m.name]; if (!b) continue; const p = Math.max(1, m.weight || 1); s += 0.75 * ((b.armor || 0) + (b.defense || 0)) * p; w += p; }
        return w ? s / w : 0;
    }
    function notasElementos(hunt) {
        if (!hunt || !hunt.monsters || !hunt.monsters.length) return null;
        const soma = {}, peso = {}, pior = {};
        hunt.monsters.forEach(m => {
            const w = Math.max(1, m.weight || 1);
            const el = {};
            (m.elements || []).forEach(x => { el[x.type] = x.percent; });
            ELEMENTOS.forEach(e => {
                const tomado = 100 - (el[e] || 0);   // sem entrada = neutro = toma 100%
                soma[e] = (soma[e] || 0) + tomado * w;
                peso[e] = (peso[e] || 0) + w;
                if (pior[e] == null || tomado < pior[e]) pior[e] = tomado;
            });
        });
        const notas = {}, vetos = {};
        ELEMENTOS.forEach(e => {
            if (!peso[e]) return;
            notas[e] = Math.round(soma[e] / peso[e]);
            if (pior[e] <= 25) { vetos[e] = pior[e]; notas[e] = Math.min(notas[e], 30); }
        });
        return { notas, vetos };
    }

    /* =========================================================================
     *  CÉREBRO 2 — DANO REAL APRENDIDO DO JOGO
     *
     *  Guardado por vocação + nível, porque o dano escala com nível mágico e
     *  com a arma. Se o nível mudou, o cache daquela vocação é descartado.
     * ====================================================================== */
    /* A chave e por VOCACAO. O nivel vai DENTRO de cada medicao.
     *
     * Antes a chave era danos_<voc>_<nivel>, e existia uma DANOS_SEMENTE com
     * valores medidos no nivel 50 (Berserk 53-139, Lesser Front Sweep 47-83…)
     * marcados como "confiaveis". Consequencia no wipe: a cada nivel novo a
     * tabela aprendida sumia inteira e a semente do nivel 50 voltava a mandar
     * no plano — com o triplo do dano real do nivel 18. Silencioso.
     *
     * Agora: a medicao de outro nivel continua valendo como ESTIMATIVA (o
     * ranking entre magias quase nao muda de um nivel para o outro), fica
     * marcada como `velha`, e o boot/amostrador reaprende sozinho quando o
     * nivel muda. Semente fixa nao existe mais. */
    function chaveDano(vocForcada) { return 'danos_' + (vocForcada || vocacaoAtual()); }

    /* v1.8.0 — ESCALA PELO NÍVEL EM VEZ DE REMEDIR. Toda fórmula de dano do
     * jogo (wiki: "como o dano é calculado") soma nível÷5 ao mínimo e ao máximo;
     * o resto depende de skill/ML, que sobem devagar. Então uma medição do
     * nível N vale no nível N+k somando k/5 — verificado: Energy Strike 22-31
     * no 39 bate ML×1,403+8 / ML×2,203+13 com ML≈4,4. Só vira "velha" se a
     * distância passar de 20 níveis (aí skill/ML já andaram demais). */
    const NIVEIS_MAX_EXTRAPOLACAO = 20;
    function danosConhecidos(vocForcada) {
        const d = ler(chaveDano(vocForcada), {});
        const lvl = nivelAtual();
        const fora = {};
        Object.keys(d).forEach(k => {
            const x = d[k];
            const delta = (x.nivel != null && lvl) ? lvl - x.nivel : 0;
            const longe = Math.abs(delta) > NIVEIS_MAX_EXTRAPOLACAO;
            const aj = delta / 5;
            fora[k] = Object.assign({}, x, {
                min: Math.max(1, Math.round(x.min + aj)), max: Math.max(1, Math.round(x.max + aj)),
                extrapolado: delta !== 0, nivelMedido: x.nivel,
                semente: longe, velha: longe
            });
        });
        return fora;
    }
    function danosMedidosNesteNivel(vocForcada) {
        const d = ler(chaveDano(vocForcada), {}), lvl = nivelAtual();
        return Object.keys(d).filter(k => d[k].nivel === lvl).length;
    }
    function anotarDano(nome, min, max, mana, casas) {
        const d = ler(chaveDano(), {});
        d[nome] = { min, max, mana, casas, nivel: nivelAtual(), ts: Date.now() };
        guardar(chaveDano(), d);
    }

    /* =========================================================================
     *  CÉREBRO 3 — AVALIAÇÃO DE UMA MAGIA NUMA HUNT
     *
     *  As quatro grandezas que decidem tudo:
     *    danoEfetivo = dano médio × nota do elemento
     *    alvos       = min(casas da magia, lure máximo da hunt)   ← a lição de hoje
     *    custo       = mana × 0,56   (ou preço da runa, que é ouro direto)
     *    danoPorOuro = danoEfetivo × alvos / custo
     *    dps         = danoEfetivo × alvos / cooldown
     * ====================================================================== */
    function lureMax(hunt) {
        const t = hunt && hunt.lureTiers;
        if (!t || !t.length) return 1;
        return Math.max(...t.map(x => x.max || x.min || 1));
    }

    function casasDaMagia(m) {
        if (m.areaCells) return m.areaCells;
        if (CAT.areas && m.area && CAT.areas[m.area] && CAT.areas[m.area].cells) return CAT.areas[m.area].cells;
        return 1;
    }

    /* v1.8.0 — PREÇO POR CARGA. O catálogo dá o preço da RUNA (32) e a runa
     * tem `charges` (4). O jogo cobra por lançamento: painel do grupo em 22/09
     * mostrou great fireball ×61 = −488, ou seja 8 por uso. Antes o modelo
     * cobrava 32 por uso e nenhuma runa cabia em orçamento nenhum. */
    function precoRuna(m) {
        const nome = (m.name || '').toLowerCase();
        let preco = null;
        if (CAT.precos) {
            if (!Array.isArray(CAT.precos) && CAT.precos[nome] != null) preco = CAT.precos[nome];
            else if (Array.isArray(CAT.precos)) {
                const achou = CAT.precos.find(p => (p.name || '').toLowerCase() === nome);
                if (achou) preco = achou.price || achou.value || 0;
            }
        }
        if (preco == null) return null;
        return preco / Math.max(1, m.charges || 1);
    }

    /* v1.8.0 — MANA SOBRANDO. O bestiário da conta dá +6 MP/s; em 22/09 o
     * Feiticeiro ficava em 98% de mana com Fire Wave e Energy Beam nos slots.
     * Nesse caso a mana NÃO é o gargalo e ordenar por eficiência (6 de mana
     * primeiro) só deixa regeneração na mesa. Regra: em regeneração, se a
     * barra do personagem está ≥ 80%, o Equilibrado ordena por DPS. */
    function manaPercent(voc) {
        const el = $$('[aria-label]').find(e => (e.getAttribute('aria-label') || '').toUpperCase().startsWith(voc + ':'));
        const m = el && (el.getAttribute('aria-label') || '').match(/Mana\s*(\d+)%/i);
        if (!m) return null;
        const cache = ler('mana_pct', {}); cache[voc] = parseInt(m[1]); guardar('mana_pct', cache);
        return parseInt(m[1]);
    }
    const MANA_SOBRANDO = 80;

    function avaliar(m, hunt, info, vocForcada) {
        const casas = casasDaMagia(m);
        /* v2.6.7 — FEIXE é uma linha: os monstros ficam em leque, não em fila.
         * Great Energy Beam: modelo dizia 364 por lançamento (8 casas × 45),
         * medido 189 em Dragon Lair (28/09) — metade. Feixe conta metade dos
         * alvos; onda e runa 3×3 continuam com o teto min(casas, lure). */
        const feixe = /beam|feixe/i.test(m.area || '') || /beam/i.test(m.name || '');
        const alvos = Math.max(1, Math.min(feixe ? Math.ceil(casas / 2) : casas, lureMax(hunt)));
        const nota = info.notas[m.combatType] != null ? info.notas[m.combatType] : 100;

        // dano: o medido manda; sem medição, cai no proxy de mana (jeito Stonegy)
        /* v1.8.0 — RUNA NÃO MOSTRA DANO no diálogo ("pulei 4, sem dano na
         * tela"), então nunca era confiável e nunca entrava em plano nenhum.
         * Semente medida no painel do grupo em 22/09 (nível 39, ML≈4,4):
         * Druida fez 23k com 120 cargas de runas 3×3 em lure 4 → ~192 por
         * lançamento → ~48 por alvo. Vale para as quatro runas de 3×3 (great
         * fireball, thunderstorm, avalanche, stone shower); o elemento entra
         * pela nota da hunt. Medição real na tabela de danos sobrescreve. */
        const RUNA_SEMENTE = { min: 36, max: 60, semente: true, nivel: 39 };
        const conhecido = danosConhecidos(vocForcada)[m.name]
            || (m.isRune && m.areaCells === 36 ? RUNA_SEMENTE : null);
        const danoMedio = conhecido ? (conhecido.min + conhecido.max) / 2 : (m.mana ? m.mana * 0.45 : 30);
        const medido = !!conhecido && !conhecido.semente;
        const semente = !!(conhecido && conhecido.semente);

        /* físico contra armadura: desconto fixo por golpe (wiki). Aproximação:
         * dano − armadura média dos monstros, nunca abaixo de 20 % do dano. */
        const arm = m.combatType === 'COMBAT_PHYSICALDAMAGE' ? armaduraMedia(hunt) : 0;
        const fatorArm = arm > 0 ? Math.max(0.2, (danoMedio - arm) / danoMedio) : 1;
        const danoEfetivo = danoMedio * (nota / 100) * fatorArm;

        const custo = m.isRune
            ? (precoRuna(m) != null ? precoRuna(m) : (m.level || 1) * 2)
            : (m.mana || 0) * OURO_POR_MANA;

        const cd = Math.max(1, (m.cooldownMs || 2000) / 1000);
        /* v2.6.6 — DANO MEDIDO NESTE MAPA MANDA. O modelo supunha que um feixe
         * de 8 casas acerta 8 alvos: Great Energy Beam "364 por lançamento" no
         * papel, 189 medido em Dragon Lair (28/09); Energy Wave 958 medido e o
         * modelo a cortava. Se o livro-razão (esta caçada ou um Scan anterior
         * no mesmo mapa) tem ≥3 lançamentos da magia, o dano por lançamento
         * medido substitui o calculado — armadura, resistência e alvos reais
         * já embutidos. */
        const med = info.med && info.med[(vocForcada || vocacaoAtual()) + '|' + m.name];
        const porLanc = med ? med.porCast : danoEfetivo * alvos;
        const danoPorOuro = custo > 0 ? porLanc / custo : Infinity;
        const dps = porLanc / cd;

        return {
            m, casas, alvos, nota, danoMedio, danoEfetivo, medido, semente, fatorArm,
            confiavel: medido || semente || !!med, medidoNoMapa: !!med, custo, cd,
            danoPorOuro: Math.round(danoPorOuro * 100) / 100,
            dps: Math.round(dps * 10) / 10,
            porLancamento: Math.round(porLanc),
            single: casas <= 1
        };
    }

    /* =========================================================================
     *  CÉREBRO 4 — O PLANO DOS 4 SLOTS
     *
     *  Regra herdada do Stonegy e mantida: o RANKING é imutável (sempre por
     *  dano efetivo). O MODELO só decide quem entra nos slots e com que
     *  gatilho — nunca reordena o ranking mostrado na tela.
     *
     *  ⚠ A ROTAÇÃO É 1→4 E PARA NO PRIMEIRO SLOT CUJO MÍNIMO FOR ATINGIDO.
     *  Por isso a magia de área tem que vir ANTES da de alvo único: com a
     *  lança "≥1" no slot 1, a Divine Caldera nunca dispararia. Foi um erro
     *  real, cometido em 30/08.
     * ====================================================================== */
    function magiasDaVocacao(vocForcada) {
        const voc = (vocForcada || vocacaoAtual()).toLowerCase();
        const lvl = nivelAtual();
        const mapa = {
            knight: ['knight', 'elite knight'], paladin: ['paladin', 'royal paladin'],
            sorcerer: ['sorcerer', 'master sorcerer'], druid: ['druid', 'elder druid']
        }[voc] || [voc];
        /* ⚠ RUNA TAMBÉM É RESTRITA POR VOCAÇÃO. Eu tinha escrito `m.isRune ||`,
         * liberando toda runa pra todo personagem. Medido em 30/08: das 16
         * "magias" que o Cavaleiro tinha no meu filtro, 11 eram runas que não
         * existem na aba dele — o aprendizado pulava todas e o plano podia
         * escolher uma runa que ele nunca lançaria. O catálogo traz o campo
         * certo: a avalanche rune lista sorcerer/druid/paladin, sem knight. */
        return (CAT.magias || []).filter(m =>
            m.available !== false &&
            (m.group === 'attack' || m.category === 'dano_direto') &&
            (m.level || 1) <= lvl &&
            (m.vocations || []).some(v => mapa.includes(v))
        );
    }

    /* =========================================================================
     *  ⭐ TETO DE GASTO — a peça que faltava, e que custou 3 medições pra achar
     *
     *  Medido em 30/08, três configurações, três resultados:
     *    Orcs Edron   (magia barata)  28,0k EXP/h e  +5.100 ouro/h
     *    Cults Goroma (área grande)   52,4k EXP/h e −102.600 ouro/h
     *    Vampire hell ("Equilibrado") 42,5k EXP/h e −138.000 ouro/h
     *
     *  Escolher a melhor RAZÃO dano/ouro não basta: quatro personagens com boa
     *  razão ainda estouram o que a hunt paga. O que decide é uma RESTRIÇÃO:
     *
     *      custo pra matar 1 monstro  ≤  ouro que 1 monstro larga × margem
     *
     *  Como custoPorAbate = HP / danoPorOuro, isso vira um piso por magia:
     *
     *      danoPorOuro ≥ HP / (loot por abate × margem)
     *
     *  Livre de escala — não precisa estimar DPS nem abates/h. Conferido
     *  contra as três medições acima: exige 12,4 nos Orcs (a magia dava 58 →
     *  cabe, e deu lucro), 26,8 em Vampire hell e 11,5 em Cults Goroma (as
     *  magias davam 11,1 e 3,9 → não cabem, e as duas quebraram a conta).
     *
     *  ⚠ E O CÁLCULO É PESSIMISTA DE PROPÓSITO: uso metade dos alvos. O erro
     *  que me enganou antes foi tratar `alvos = min(casas, lure)` como se toda
     *  magia sempre acertasse esse tanto. É o TETO, não a média — monstro morre,
     *  nem todos entram na forma da magia, e os magos lançam de trás do tanque.
     *  FATOR_ALVOS_REAIS é calibração grosseira; refinar quando houver medição. */
    /* ⭐ CALIBRAÇÃO CONTRA MEDIÇÃO REAL (30/08, Orcs Edron, 20 min)
     *
     *   1.204 abates/h × 12,7 de loot = 15,3k/h de receita bruta
     *   lucro medido no painel do jogo = +5,0k/h
     *   ⇒ consumo real ≈ 10,3k/h ≈ 8,5 ouro por abate
     *   modelo previa 4 ouro por abate → SUBESTIMAVA em ~2,1×
     *
     * De onde vem a diferença: o modelo conta o mínimo teórico de mana para
     * derrubar o HP do monstro. Na prática há desperdício — magia lançada em
     * bicho quase morto, área que pega menos alvo que o previsto, e o ciclo
     * continua rodando entre ondas. FATOR_DESPERDICIO cobre isso.
     *
     * ⚠ É calibração de UM ponto. Vale para o perfil "magia barata, lure 4".
     * Refazer quando houver medição de outra faixa. */
    /* ⚠⚠ E O DESPERDÍCIO NÃO É CONSTANTE — CRESCE COM O HP DO MONSTRO.
     * A constante 2,1 foi calibrada em Orcs (HP 78) e mandou caçar em Cults
     * Goroma prevendo +66 por abate. Medido em 30/08: −47,5k/h, custo real de
     * ~288 por abate contra 127 previstos. Segundo ponto:
     *
     *   HP   78 (Orcs)  → previsto 9   · real ~8,5 → fator 1,97
     *   HP 1108 (Cults) → previsto 127 · real ~288 → fator 4,76
     *
     * Por que cresce: monstro de 78 HP morre em 1-2 lançamentos; um de 1108
     * leva dezenas, e nesse tempo a party também apanha mais — cura é mana, e
     * mana é ouro. Ajuste de potência nos dois pontos:
     *
     *   fator ≈ 0,47 × HP^0,332
     *
     * ⚠ SÃO DOIS PONTOS. A curva é um chute educado, não uma lei. Ela acerta
     * onde foi medida e extrapola mal longe daí. Cada nova medição deve entrar
     * aqui. Enquanto isso, tratar veredito de hunt com HP alto com desconfiança. */
    const fatorDesperdicio = (hp) => 0.47 * Math.pow(Math.max(1, hp), 0.332);

    /* E com o custo calibrado, a margem de 0,5 passou a rejeitar Orcs Edron —
     * que é comprovadamente lucrativa (+5k/h). O limite real não é "gastar
     * metade do loot", é "gastar menos que o loot". 0,8 deixa 20% de folga:
     *   Orcs   custo 8,4 contra orçamento 10,2 → cabe   (real: +5k/h ✓)
     *   Vampire custo 155 contra orçamento 34  → não cabe (real: −138k/h ✓) */
    const MARGEM_LUCRO = 0.8;
    const FATOR_ALVOS_REAIS = 0.5;     // só metade dos alvos teóricos é atingida

    function viabilidade(hunt, avaliadas, voc) {
        const loot = LOOT_CACHE[hunt.id];
        if (loot == null) return null;              // ainda não baixou
        const w = hunt.monsters.reduce((s, m) => s + (m.weight || 1), 0) || 1;
        const hp = hunt.monsters.reduce((s, m) => s + m.health * (m.weight || 1), 0) / w;
        const orcamento = loot * MARGEM_LUCRO;
        const exigido = orcamento > 0 ? hp / orcamento : Infinity;
        // dano/ouro pessimista de cada magia
        const regen = !manaPotionLigada(voc);
        avaliadas.forEach(a => {
            const alvosReais = Math.max(1, a.alvos * FATOR_ALVOS_REAIS);
            a.danoPorOuroReal = Math.round((a.danoEfetivo * alvosReais) / Math.max(0.01, a.custo) * 100) / 100;
            // custo com o desperdício medido embutido — é o que sai do bolso
            a.custoPorAbate = Math.round(hp / Math.max(0.01, a.danoPorOuroReal) * fatorDesperdicio(hp));
            // em regeneracao, magia (nao runa) nao sai do bolso: cabe sempre
            a.cabeNoOrcamento = (regen && !a.m.isRune) ? true : a.custoPorAbate <= orcamento;
        });
        return { loot, hp: Math.round(hp), orcamento: Math.round(orcamento * 10) / 10, exigido: Math.round(exigido * 10) / 10, regen };
    }

    /* =========================================================================
     *  ⭐ v2.6.0 — INTELIGENTE (pedido do dono, 28/09: "a mais inteligente de
     *  todas, para matar o mob mais rápido; combinações de poções, magias,
     *  runas, defesa e suporte para cada personagem").
     *  Fontes: logbook da comunidade (Toxic Butter, Discord 27/09) e a Wiki
     *  /configurando-o-combate: os slots de ataque são FILA DE PREFERÊNCIA
     *  (o primeiro pronto dispara → cd longo no slot 1); mana gasta em
     *  ataque → suporte → cura; cura forte ~40 % e fraca ~70 %; poções nascem
     *  desligadas. /potions e /ammo lidos em 28/09 (TIBIDLE.md §14).
     * ====================================================================== */
    /* Reserva: /potions de 29/09. O catálogo vivo (CAT.pocoes) manda quando baixou. */
    const POCOES = {
        vida: [{ n: 'Health Potion', lvl: 1, custo: 50, media: 150 }, { n: 'Strong Health Potion', lvl: 50, voc: ['KNIGHT', 'PALADIN'], custo: 115, media: 300 },
               { n: 'Great Health Potion', lvl: 80, voc: ['KNIGHT'], custo: 225, media: 500 }, { n: 'Great Spirit Potion', lvl: 80, voc: ['PALADIN'], custo: 254, media: 300 },
               { n: 'Ultimate Health Potion', lvl: 130, voc: ['KNIGHT'], custo: 379, media: 750 }, { n: 'Ultimate Spirit Potion', lvl: 130, voc: ['PALADIN'], custo: 488, media: 500 }],
        mana: [{ n: 'Mana Potion', lvl: 1, custo: 56, media: 100 }, { n: 'Strong Mana Potion', lvl: 50, custo: 108, media: 150 },
               { n: 'Great Mana Potion', lvl: 80, voc: ['SORCERER', 'DRUID', 'PALADIN'], custo: 158, media: 200 }, { n: 'Ultimate Mana Potion', lvl: 130, voc: ['SORCERER', 'DRUID'], custo: 488, media: 500 }]
    };
    function listaPocoes(tipo) {
        const c = CAT.pocoes && CAT.pocoes[tipo === 'vida' ? 'health' : 'mana'];
        if (!Array.isArray(c) || !c.length) return POCOES[tipo];
        return c.filter(p => p && p.name && p.cost != null).map(p => ({ n: p.name, lvl: p.minLevel || 1, lvlMax: p.maxLevel || Infinity, voc: p.vocations || null,
                                                                        custo: Number(p.cost) || 0, media: ((Number(p.min) || 0) + (Number(p.max) || 0)) / 2 }));
    }
    /* v2.9.0 — MANA: A MAIS BARATA POR PONTO, não a de nível mais alto. Na
     * 2.8.5 o Druida passava a beber Strong Mana no nível 50 (108 por ~150 =
     * 0,72 ouro/mana) enquanto a conta do modelo usava 0,56 (Mana Potion) — o
     * custo real ficava 29 % acima do previsto. Vida continua a mais FORTE:
     * aí o que se compra é não morrer. */
    const melhorPocao = (tipo, voc, lvl) => {
        const l = listaPocoes(tipo).filter(x => x.lvl <= lvl && lvl <= (x.lvlMax || Infinity) && (!x.voc || x.voc.includes(voc)) && x.media > 0);
        if (!l.length) return null;
        const ord = tipo === 'mana' ? (a, b) => (a.custo / a.media) - (b.custo / b.media) || b.media - a.media
                                    : (a, b) => b.media - a.media || a.custo - b.custo;
        return l.slice().sort(ord)[0].n;
    };
    /* munição: área vale metade dos alvos teóricos (mesma regra do FATOR_ALVOS_REAIS) */
    const MUNICAO = {
        arrow: [{ n: 'arrow', atk: 25, lvl: 0 }, { n: 'sniper arrow', atk: 28, lvl: 25 }, { n: 'burst arrow', atk: 27, lvl: 30, area: 9, elem: 'COMBAT_FIREDAMAGE' },
                { n: 'tarsal arrow', atk: 33, lvl: 40 }, { n: 'onyx arrow', atk: 38, lvl: 50 }, { n: 'crystalline arrow', atk: 65, lvl: 90 }, { n: 'diamond arrow', atk: 37, lvl: 150, area: 21, elem: 'COMBAT_FIREDAMAGE' }],
        bolt: [{ n: 'bolt', atk: 30, lvl: 0 }, { n: 'piercing bolt', atk: 33, lvl: 30 }, { n: 'vortex bolt', atk: 36, lvl: 40 }, { n: 'power bolt', atk: 40, lvl: 55 },
               { n: 'drill bolt', atk: 56, lvl: 70 }, { n: 'prismatic bolt', atk: 66, lvl: 90 }, { n: 'infernal bolt', atk: 72, lvl: 110 }]
    };
    /* v2.7.2 — MUNIÇÃO PELA FÓRMULA DA WIKI (/como-o-dano-e-calculado):
     * tiro do Paladino = nível/5 … 0,09 × atk × Distância + nível/5, ou seja
     * média = nível/5 + 0,045 × atk × Distância, menos a redução física do
     * bicho (0,75 × (armadura + defesa), reducaoFisicaMedia). Dragon Lair
     * 28/09: flecha comum 20/tiro medido, fórmula 18; burst (fogo, dragão
     * imune) 24/tiro. Munição paga só entra se o dano extra por ouro chegar
     * a 25 (a runa dá 26–65/ouro): onyx (+17/tiro por 7 de ouro = 2,4) não
     * chega; no nível 62 a flecha grátis vence em todo mapa e o dano do
     * Paladino é runa + Caldera. Burst acerta 1,4 alvos medidos, não 4. */
    const MUNICAO_CUSTO = { arrow: 0, 'sniper arrow': 3, 'burst arrow': 9, 'tarsal arrow': 6, 'onyx arrow': 7, 'crystalline arrow': 100, 'diamond arrow': 200,
                            bolt: 0, 'piercing bolt': 5, 'vortex bolt': 6, 'power bolt': 7, 'drill bolt': 12, 'prismatic bolt': 20, 'infernal bolt': 13 };
    /* dono, 28/09: "a burst arrow é de fogo e o dragão é imune". A explosão
     * (a área) é fogo; contra imune sobra só o impacto. `notas` é a nota de
     * elemento da hunt (notasElementos): fogo 0 % ⇒ a área não conta. */
    function melhorMunicao(tipo, lvl, lure, reducao, skillDist, notas) {
        const sk = skillDist || 30, red = reducao || 0;
        const notaElem = a => a.elem && notas && notas[a.elem] != null ? notas[a.elem] / 100 : 1;
        const dano = a => Math.max(1, lvl / 5 + 0.045 * sk * a.atk - red) * (a.area ? Math.max(1, Math.min(1.4, lure || 1) * notaElem(a)) * (notaElem(a) || 0.3) : 1);
        const lista = (MUNICAO[tipo] || MUNICAO.arrow).filter(a => a.lvl <= lvl);
        const gratis = lista.find(a => !MUNICAO_CUSTO[a.n]) || lista[0];
        let best = gratis, bv = 0;
        for (const a of lista) {
            const custo = MUNICAO_CUSTO[a.n] || 0; if (!custo) continue;
            const ganho = (dano(a) - dano(gratis)) / custo;
            if (ganho >= 25 && ganho > bv) { bv = ganho; best = a; }
        }
        return best ? best.n : null;
    }
    /* cura: forte com gatilho baixo primeiro, fraca depois (a fila dispara a primeira que bater) */
    /* v2.6.5 — dono, 28/09: "só o Druida tem magia de cura" nesta conta. O
     * catálogo lista Wound Cleansing, Divine Healing etc., mas o livro-razão
     * nunca viu um cast de cura de ninguém além do Druida, e o Knight chegou a
     * 22 % em Dragon Lair com Wound Cleansing ≤65 configurada. Cura dos
     * outros três = poção de vida, com gatilho mais alto em quem apanha.
     * O Druida cura os outros com Heal Friend ≤60 (a mana dele vem da poção). */
    /* v2.6.9 — DEFESA nos 4, como o dono deixou à mão (prints de 28/09, 22h):
     * cada personagem com cura própria ≤50–60 % e um suporte. A cura BARATA
     * vem primeiro (Light Healing 20 de mana dispara mesmo com a mana no
     * chão; Wound Cleansing 40), a forte com gatilho mais baixo. */
    const CURAS = {
        KNIGHT: [['Wound Cleansing', 50]],
        PALADIN: [['Light Healing', 60], ['Divine Healing', 40]],
        SORCERER: [['Light Healing', 60], ['Ultimate Healing', 40]],
        DRUID: [['Heal Friend', 60], ['Ultimate Healing', 40]]
    };
    const POCAO_VIDA_PCT = { KNIGHT: 45, PALADIN: 45, SORCERER: 35, DRUID: 60 };
    /* suporte só onde sobra mana (a fila gasta ataque → suporte → cura, wiki):
     * Knight/Paladino/Feiticeiro ficaram entre 4 e 19 % de mana em Dragon Lair
     * (28/09) — Magic Shield e Enchant Party ali só roubavam mana da onda. O
     * Druida bebe poção, então Heal Party fica. ⚠ v2.9.0: Protector NÃO "custa
     * nada" — corta 35 % do dano do Knight (wiki); só entra se ele apanha
     * (planoExtras). Buff de grupo custa ~3× o do catálogo com 4 personagens
     * (wiki: Enchant Party 120 → 350, Heal Party 120 → 350). */
    const SUPORTES = { KNIGHT: ['Protector'], PALADIN: ['Protect Party'], SORCERER: ['Magic Shield'], DRUID: ['Heal Party'] };
    /* v2.7.2 — wiki /magias-e-runas: buffs de GRUPO de 120 s — Train Party
     * (Knight, 60 mana: +3 Corpo a Corpo e Distância para os 4), Enchant Party
     * (Feiticeiro, 120 mana: +1 Nível Mágico para os 4 ≈ +10–15 % em toda
     * magia e runa com ML≈5). A mana é gasta ataque → suporte → cura (wiki),
     * então o segundo suporte só entra onde a mana MEDIDA sobra (≥70 %):
     * Djinns 28/09 — Feiticeiro 96 %, Paladino 78 %. Em Dragon Lair (4–18 %)
     * ele roubaria a mana da cura. Druida com mana sobrando ganha Magic
     * Shield (50 mana, dano vira mana — que a poção repõe). */
    const SUPORTES_SOBRANDO = { KNIGHT: 'Train Party', SORCERER: 'Enchant Party', DRUID: 'Magic Shield', PALADIN: null };
    const VOC_CAT = { KNIGHT: ['knight', 'elite knight'], PALADIN: ['paladin', 'royal paladin'], SORCERER: ['sorcerer', 'master sorcerer'], DRUID: ['druid', 'elder druid'] };
    function temMagia(nome, voc, lvl) {
        return (CAT.magias || []).some(m => m.name === nome && m.available !== false && (m.level || 1) <= lvl && (m.vocations || []).some(v => VOC_CAT[voc].includes(v)));
    }
    function planoExtras(voc, hunt) {
        const lvl = nivelAtual();
        const heals = [];
        const vida = melhorPocao('vida', voc, lvl); if (vida) heals.push({ name: vida, percent: POCAO_VIDA_PCT[voc] || 40 });
        if (!_seco) for (const [n, p] of (CURAS[voc] || [])) if (temMagia(n, voc, lvl)) heals.push({ name: n, percent: p });
        while (heals.length < 5) heals.push(null);
        const mp = melhorPocao('mana', voc, lvl);
        /* só o Druida bebe mana por padrão (cura do Knight não pode faltar); os
         * outros três ficam na regeneração. Variante inteligente_mana liga nos 4. */
        const pctMana = _manaTodos ? (voc === 'KNIGHT' ? 40 : 30) : (voc === 'DRUID' ? 30 : 0);
        const manaPotion = mp && pctMana ? { name: mp, percent: pctMana } : { percent: 0 };
        /* v2.9.0 — PROTECTOR NÃO É DE GRAÇA. Wiki (/magias-e-runas e
         * /como-o-dano-e-calculado): 200 de mana e, enquanto dura, escudo ×2,2,
         * dano recebido −15 % e DANO CAUSADO −35 %. No Knight — o que mais bate
         * com Berserk — isso só se paga quando ele corre risco. Regra: se a
         * vida mínima MEDIDA dele neste mapa ficou ≥ 60 %, sai; sem medida ou
         * abaixo disso, fica (morte de qualquer um encerra a caçada). */
        const knightSeguro = voc === 'KNIGHT' && hunt ? (vidaMinMedida(hunt, 'KNIGHT') ?? -1) >= 60 : false;
        const supports = _seco ? [] : (SUPORTES[voc] || []).filter(n => temMagia(n, voc, lvl) && !(n === 'Protector' && knightSeguro)).slice(0, 2);
        if (!_seco && supports.length < 2 && SUPORTES_SOBRANDO[voc] && temMagia(SUPORTES_SOBRANDO[voc], voc, lvl)) {
            const mm = hunt ? manaMedidaMedia(hunt, voc) : null;
            if (mm != null && mm >= 70) supports.push(SUPORTES_SOBRANDO[voc]);
        }
        while (supports.length < 2) supports.push(null);
        const r = { heals, manaPotion, supports };
        if (voc === 'PALADIN') {
            const ro = rosterEquip(); const p = ro && ro.find(x => x.vocation === 'PALADIN');
            const tipo = (p && p.equipment && p.equipment.weapon && p.equipment.weapon.attrs && p.equipment.weapon.attrs.ammotype) || 'arrow';
            const fp = ((ESTADO_WS.frame && ESTADO_WS.frame.party) || []).find(x => x.voc === 'PALADIN');
            const notasH = hunt ? (notasElementos(hunt) || {}).notas : null;
            r.ammo = melhorMunicao(tipo, lvl, hunt ? lureMax(hunt) : 1, hunt ? reducaoFisicaMedia(hunt) : 0, fp && fp.dist, notasH);
        }
        return r;
    }

    /* v2.6.6 — índice voc|magia → {porCast, casts} do que já foi medido neste
     * mapa: o livro-razão vivo (se a party está nele) e os resultados de Scan
     * guardados (qualquer variante). Fica com a medição de mais lançamentos. */
    function indiceMedicoes(hunt) {
        const idx = {};
        if (!hunt || hunt.boss) return idx;
        const por = (m) => { if (!m || !(m.casts >= 3)) return; const k = m.voc + '|' + m.nome; const pc = m.dano != null ? m.dano / m.casts : m.porCast; if (!(pc >= 0)) return; if (!idx[k] || m.casts > idx[k].casts) idx[k] = { porCast: Math.round(pc), casts: m.casts }; };
        try { for (const r of Object.values(scanResultados())) if (r.id === hunt.id && r.razao && Array.isArray(r.razao.magias)) r.razao.magias.forEach(por); } catch (e) { }
        try { if (ESTADO_WS.huntId === hunt.id) for (const m of Object.values(RAZAO.magias)) por(m); } catch (e) { }
        return idx;
    }
    /* v2.6.9 — MANA MÉDIA MEDIDA de cada personagem neste mapa (livro-razão
     * vivo ou Scan guardado). É o que diz se o kit está caro ou barato demais:
     * Quara 28/09 — Feiticeiro 93 % (regeneração jogada fora), Paladino 12 %
     * e Knight 20 % (magia esperando mana). */
    function manaMedidaMedia(hunt, voc) {
        if (!hunt || hunt.boss) return null;
        let melhor = null;
        try { if (ESTADO_WS.huntId === hunt.id) { const v = RAZAO.vitais[voc]; if (v && v.n >= 30) melhor = { m: v.mana / v.n * 100, n: v.n }; } } catch (e) { }
        try { for (const r of Object.values(scanResultados())) { const x = r.id === hunt.id && r.razao && r.razao.porVoc && r.razao.porVoc[voc]; if (x && x.manaMedia != null && (!melhor || melhor.n < 60)) melhor = melhor || { m: x.manaMedia, n: 60 }; } } catch (e) { }
        return melhor ? Math.round(melhor.m) : null;
    }
    /* v2.9.0 — vida MÍNIMA medida (mesmas fontes da mana): decide o Protector. */
    function vidaMinMedida(hunt, voc) {
        if (!hunt || hunt.boss) return null;
        try { if (ESTADO_WS.huntId === hunt.id) { const v = RAZAO.vitais[voc]; if (v && v.n >= 30) return Math.round(v.hpMin * 100); } } catch (e) { }
        try { for (const r of Object.values(scanResultados())) { const x = r.id === hunt.id && r.razao && r.razao.porVoc && r.razao.porVoc[voc]; if (x && x.hpMin != null) return x.hpMin; } } catch (e) { }
        return null;
    }
    /* v2.9.0 — HISTERESE NO REGIME DE MANA. O kit de "mana sobrando" é mais
     * caro, então a mana cai; o kit normal é mais barato, então ela sobe. Com
     * um limite só (70 %), o Inteligente trocava de kit a cada medição. Entra
     * em "sobrando" com ≥ 70 % e só sai abaixo de 40 %. Guardado por mapa e
     * vocação. */
    const _regime = {};
    function regimeSobrando(hunt, voc, manaMed) {
        if (!hunt || hunt.boss) return false;
        const k = hunt.id + '|' + voc;
        if (_regime[k] == null) _regime[k] = !!(ler('regime', {})[k]);
        const antes = _regime[k];
        const agora = manaMed == null ? antes : (antes ? manaMed > 40 : manaMed >= 70);
        if (agora !== antes) { _regime[k] = agora; const g = ler('regime', {}); g[k] = agora; guardar('regime', g); }
        return agora;
    }
    /* v2.7.0 — o SPAWN limita neste mapa? (onda morre em menos da metade da
     * espera pela próxima). Djinns 28/09: 7 mortos em 2,5 s, espera 10,6 s. */
    function spawnLimitaMedido(hunt) {
        if (!hunt || hunt.boss) return null;
        let o = null;
        try { if (ESTADO_WS.huntId === hunt.id && RAZAO.ondas.n >= 4) o = RAZAO.ondas; } catch (e) { }
        if (!o) try { for (const r of Object.values(scanResultados())) if (r.id === hunt.id && r.razao && r.razao.ondas && r.razao.ondas.n >= 4) { o = { n: r.razao.ondas.n, timer: r.razao.ondas.timer * 1000 * r.razao.ondas.n, matar: r.razao.ondas.matar * 1000 * r.razao.ondas.n }; break; } } catch (e) { }
        if (!o || !o.n) return null;
        return (o.matar / o.n) < (o.timer / o.n) * 0.5;
    }
    function montarPlano(modelo, hunt, vocForcada) {
        const vr = VARIANTES[modelo];
        _manaTodos = !!(vr && vr.manaTodos); _semRuna = !!(vr && vr.semRuna); _seco = !!(vr && vr.seco);
        if (vr) modelo = vr.base;
        const info = notasElementos(hunt);
        if (!info) return { erro: 'não achei as resistências dessa hunt no catálogo' };
        info.med = indiceMedicoes(hunt);

        const avaliadas = magiasDaVocacao(vocForcada).map(m => avaliar(m, hunt, info, vocForcada))
            .sort((a, b) => b.danoEfetivo - a.danoEfetivo);   // RANKING IMUTÁVEL

        if (!avaliadas.length) return { erro: 'nenhuma magia de ataque elegível' };

        /* PISO DE POTÊNCIA (lição da v2.24.0 do Stonegy): sem piso, qualquer
         * magia com a "forma certa" ganhava slot, e o script chegou a pôr a
         * versão fraca de uma magia na frente da forte. Quem estiver abaixo de
         * 25% do melhor dano por lançamento vai pro fim da fila.
         *
         * ⚠ E O PISO SÓ OLHA QUEM TEM DANO CONFIÁVEL. Sem isso, magia não
         * medida entra com o chute do fallback e vence de quem foi medido —
         * visto em 30/08: o plano do Feiticeiro veio com 4 runas de área só
         * porque o chute de 30 de dano era multiplicado por 7 alvos.
         * Sem medição a magia não compete; fica reservada pro fim da fila. */
        const confiaveis = avaliadas.filter(a => a.confiavel);
        const base = confiaveis.length ? confiaveis : avaliadas;
        const melhorLanc = Math.max(...base.map(a => a.porLancamento));
        const PISO = melhorLanc * 0.25;
        const viavel = a => a.confiavel && a.porLancamento >= PISO;

        /* ⛔⛔ CORTE DE MAGIA MORTA — o defeito mais caro achado nos testes.
         * Medido em 30/08 com o Feiticeiro em Water Elementals: o plano vinha
         * com Energy Wave no slot 1 (certo, energia 125%) e Fire Wave, Great
         * Fire Wave e fireball rune nos slots 2, 3 e 4 — todas em fogo 0%,
         * zero de dano. Elas entravam porque tinham dano MEDIDO, e eu tratava
         * "confiável" como se fosse "útil".
         *
         * E não era só slot desperdiçado: a rotação é 1→4 e cai pro próximo
         * slot quando o mínimo do anterior não é atingido. Com menos de 4
         * monstros, a Great Fire Wave disparava contra bicho imune a fogo —
         * 120 de mana (67 ouro) por ZERO de dano, repetidamente.
         *
         * Regra: magia de elemento vetado ou com dano irrisório (<10% do
         * melhor) NÃO entra em slot nenhum. Slot vazio não gasta mana. */
        const morta = a => info.vetos[a.m.combatType] != null
            || a.danoEfetivo <= 0
            || a.porLancamento < melhorLanc * 0.10;
        avaliadas.forEach(a => { a.morta = morta(a); });
        const vivas = avaliadas.filter(a => !a.morta);

        // teto de gasto: preenche danoPorOuroReal / cabeNoOrcamento em cada magia
        const viab = viabilidade(hunt, avaliadas, vocForcada);

        /* ⭐ v1.8.1 — MODELOS REDEFINIDOS PELO DONO (23/09/2026):
         *   Econômica   = 2 magias, sem runa (as 2 de melhor dano/mana)
         *   Equilibrado = 2 magias (1 eficiente + 1 forte) + 1 runa (a mais forte)
         *   Em área     = 2 magias de área mais fortes + 2 runas de área mais fortes
         *   Boss        = contra o boss escolhido, só as magias que mais dão dano
         *                 nele (alvo único, tudo ≥1)
         * "Mais forte" = dano efetivo (elemento da hunt aplicado) × alvos por
         * lançamento. O slot 1 leva sempre a mais forte do plano: a rotação
         * 1→4 dispara o primeiro pronto, então a ordem é a prioridade.
         * Gatilho: magia/runa de área ≥2, alvo único ≥1, boss tudo ≥1. Se
         * nenhuma ficar com ≥1, a última cai para ≥1 (com 1 monstro vivo a
         * rotação não pode falhar). Só entra magia com dano conhecido. */
        const conf = vivas.filter(a => a.confiavel);
        const ehRuna = a => !!a.m.isRune, ehArea = a => a.casas > 1;
        const porDano = arr => arr.slice().sort((a, b) => (b.porLancamento - a.porLancamento) || (b.danoEfetivo - a.danoEfetivo));
        /* ⚠ Só danoPorOuro (dano × alvos / custo). danoPorOuroReal depende do
         * loot da hunt já ter baixado: misturar os dois fazia a prévia e a
         * aplicação (1 s depois) escolherem magias diferentes — visto em
         * Barbarian Camp em 23/09 (Berserk na prévia, Brutal na aplicação). */
        const porEfic = arr => arr.slice().sort((a, b) => (b.danoPorOuro - a.danoPorOuro) || (b.porLancamento - a.porLancamento));
        const magias = conf.filter(a => !ehRuna(a)), runas = conf.filter(ehRuna);
        const usados = new Set();
        const pega = (lista, n) => {
            const r = [];
            for (const a of lista) { if (r.length >= n) break; if (usados.has(a.m.name)) continue; usados.add(a.m.name); r.push(a); }
            return r;
        };
        let escolhidas = [], ordemI = porDano;
        if (modelo === 'economica') {
            escolhidas = pega(porEfic(magias), 2);
        } else if (modelo === 'equilibrado') {
            escolhidas = pega(porEfic(magias), 1).concat(pega(porDano(magias), 1), pega(porDano(runas), 1));
        } else if (modelo === 'area') {
            const mA = pega(porDano(magias.filter(ehArea)), 2);
            const mB = mA.length < 2 ? pega(porDano(magias), 2 - mA.length) : [];
            escolhidas = mA.concat(mB, pega(porDano(runas.filter(ehArea)), 2));
        } else if (modelo === 'inteligente') {
            /* 4 slots: as 3 melhores de ÁREA por dano/segundo (onda, runa, feixe) +
             * o melhor golpe de alvo único. Sem ultimates (cd > 12 s): a comunidade
             * nunca os usa e por DPS eles perdem feio (Rage 752 a cada 40 s contra
             * Strong Ice Wave 739 a cada 8 s). Ordem final: cd longo primeiro. */
            /* ⚠ Só UMA magia dispara por ciclo de 2 s (wiki: cooldown de grupo).
             * Ordenar por dano/segundo enchia os 3 slots com runas de cd 2 s — a do
             * slot 1 dispararia sempre e as outras nunca (visto em 28/09). Então:
             * o que conta é o dano POR LANÇAMENTO de cada slot, e a runa (cd 2 s,
             * custa ouro) é só o preenchimento dos ciclos em que as ondas
             * recarregam. O golpe de alvo único (≥1) é magia, não runa: 20 de mana
             * em vez de 8 de ouro por uso. */
            /* v2.6.9 — A MANA MEDIDA DECIDE O REGIME:
             *   ≥ 70 % de mana média → sobra regeneração: entra a magia mais forte
             *     que houver, ultimate incluída (Rage of the Skies a cada 40 s é dano
             *     de graça para quem fica em 93 %); escolha por dano.
             *   ≤ 25 % → falta mana: escolha por dano/mana (regra normal).
             *   sem medida → regra normal.
             * v2.9.0 — com histerese: entra com ≥ 70 %, só sai abaixo de 40 %
             * (regimeSobrando), e a medida zera quando o kit muda. */
            const manaMed = manaMedidaMedia(hunt, vocForcada || vocacaoAtual());
            const sobrando = regimeSobrando(hunt, vocForcada || vocacaoAtual(), manaMed);
            /* v2.7.0 — Djinns 28/09: Paladino 78 % e Feiticeiro 96 % de mana
             * PARADA porque a runa (cd 2 s) na frente tomava todos os ciclos —
             * Caldera e Energy Wave nunca saíram, e 6k/h de runa foi gasto onde
             * a mana de graça bastava. Regra: mana sobrando → magias ANTES da
             * runa; se além disso o spawn limita (onda morre em 2,5 s de 13),
             * a runa sai do kit — dano extra não vira xp, só custa ouro. */
            const spawnLimita = spawnLimitaMedido(hunt) === true;
            const semRunaAqui = _semRuna || (sobrando && spawnLimita);
            const cdMax = sobrando ? 40000 : 12000;
            const rapidas = conf.filter(a => (a.m.cooldownMs || 2000) <= cdMax);
            const ondas = rapidas.filter(a => !ehRuna(a) && ehArea(a)), runasA = rapidas.filter(a => ehRuna(a) && (a.m.cooldownMs || 2000) <= 12000 && ehArea(a));
            /* o golpe de alvo único é o que dispara quando sobra 1 monstro; o corte
             * de "<10 % do melhor" o mataria sempre (Energy Strike 35 contra 845 da
             * onda), então ele entra direto de `avaliadas`, só sem elemento vetado */
            const golpes = avaliadas.filter(a => a.confiavel && !ehRuna(a) && !ehArea(a) && info.vetos[a.m.combatType] == null && a.danoEfetivo > 0 && (a.m.cooldownMs || 2000) <= 12000);
            /* ⭐ v2.6.5 — MANA É O ORÇAMENTO ("mais por muito menos", dono 28/09).
             * Livro-razão de Dragon Lair: Knight, Paladino e Feiticeiro entre 4 e
             * 19 % de mana o tempo todo — cada ponto gasto numa magia fraca é
             * dano que a magia forte deixa de dar. Medido por lançamento:
             *   Lesser Front Sweep 21,8 de dano por mana · Berserk 4,7 · Whirlwind 1,7
             *   Energy Wave 6,1 · Great Energy Beam 2,5 · Lightning 1,4
             *   avalanche rune ≈ 50 de dano por OURO (poção de mana rende ≈ 12)
             * Regra: magias ordenadas por dano/mana; quem rende menos da metade da
             * melhor sai (Whirlwind, Lightning, Beam); a runa entra POR ÚLTIMO como
             * preenchimento dos ciclos sem mana (cd 2 s — na frente ela tomaria
             * todos os ciclos). Sem golpe eficiente, a runa fica com ≥1. */
            /* v2.6.6 — quem BEBE mana (Druida, ou todos na variante _mana) tem
             * ouro como orçamento, não regeneração: nele vale o mais forte por
             * lançamento (mata rápido, a poção repõe). Nos outros, dano/mana.
             * Corte frouxo (25 % / 15 %): com 50 % o Knight perdia o Berserk e o
             * Feiticeiro a Energy Wave (28/09). Golpe de alvo único só se não for
             * cócega (≥15 % da melhor onda): Buzz de 18 e Lesser Ethereal Spear de
             * 17 não valem o slot — a runa cobre o ≥1. */
            /* ⚠ v2.6.7 — A ORDEM DOS SLOTS É SEMPRE A MAIS FORTE PRIMEIRO. Em
             * Quara (28/09, 21:57) a 2.6.6 pôs Divine Missile (cd 2 s, 20 mana)
             * no slot 1 do Paladino por ser "eficiente" — e como a fila dispara
             * o primeiro pronto, a Missile tomou TODOS os ciclos e a Divine
             * Caldera nunca saiu. Dono: "não funcionou de jeito algum, até a
             * Equilibrada estava melhor". A eficiência decide QUEM entra (quem
             * não bebe poção escolhe por dano/mana); o dano por lançamento
             * decide a ORDEM. Magia barata de cd curto só serve por último. */
            const vocI = vocForcada || vocacaoAtual();
            const comPocao = _manaTodos || vocI === 'DRUID' || sobrando;
            const escolha = comPocao ? porDano : porEfic;
            ordemI = porDano;
            const melhorEfic = Math.max(0, ...ondas.concat(golpes).map(a => a.danoPorOuro));
            const melhorOnda = Math.max(0, ...ondas.map(a => a.porLancamento));
            const eficiente = a => a.danoPorOuro >= melhorEfic * (comPocao ? 0.15 : 0.25);
            const forte = a => a.porLancamento >= melhorOnda * 0.15;
            /* as 2 ondas entram sem corte (o corte de 25 % tirava o Berserk do
             * Knight, e sem ele 6 de mana por segundo de regeneração ficavam
             * parados); o corte vale para o golpe e para o preenchimento. */
            escolhidas = pega(escolha(ondas), sobrando ? 3 : 2).concat(pega(escolha(golpes.filter(a => eficiente(a) && forte(a))), 1), semRunaAqui ? [] : pega(porDano(runasA), 1));
            const nMagias = escolhidas.filter(a => !ehRuna(a)).length;
            if (nMagias < 2) escolhidas = escolhidas.concat(pega(escolha(rapidas.filter(a => !ehRuna(a) && eficiente(a) && forte(a))), 2 - nMagias));
            /* v2.9.0 — SÃO 4 SLOTS. Com mana sobrando saíam 3 ondas + golpe +
             * runa = 5; o socket manda só os 4 primeiros e a runa (a última)
             * sumia calada, com o Log dizendo que as 5 foram aplicadas. Com
             * mana sobrando é a runa que sai: ela custa ouro e a mana já paga
             * as ondas. */
            if (escolhidas.length > 4) { const soMagia = escolhidas.filter(a => !ehRuna(a)); if (soMagia.length >= 4) escolhidas = soMagia; }
        } else {
            escolhidas = pega(porDano(magias), 3);
        }
        /* mais forte primeiro em todos os modelos: a fila dispara o primeiro pronto, então
         * o forte pega o ciclo sempre que puder e o fraco só preenche a recarga. Ordenar
         * por cd deixava o Berserk (4 s, 660) atrás do Lesser Front Sweep (6 s, 171). */
        /* ⭐ v2.9.0 — MAS RECARGA ≤ 2 s VAI SEMPRE POR ÚLTIMO. Wiki
         * (/configurando-o-combate): o jogo "confere os slots de 1 a 4 e lança o
         * primeiro que estiver pronto". Runa, strike e Divine Missile têm recarga
         * igual à do grupo (2 s): estão prontos em TODO ciclo, então o que vier
         * atrás deles só dispara quando eles não podem. É o mesmo defeito nas três
         * vezes que ele apareceu:
         *   v2.6.7  Divine Missile no slot 1 → a Caldera nunca saiu (Quara)
         *   v2.7.0  runa na frente → Caldera e Energy Wave paradas (Djinns)
         *   v2.8.5  sem mana medida, a runa de 36 casas dava mais dano por
         *           lançamento que as ondas baratas que o Inteligente escolheu
         *           → slot 1 → as ondas nunca saíam, a mana sobrava e a runa
         *           cobrava 8 de ouro a cada 2 s (simulado com /spells de 29/09)
         * Ordem: recarga longa primeiro, a mais forte na frente; depois os
         * preenchimentos, de área (≥2) antes do alvo único (≥1) — assim com 2+
         * monstros sai a runa e com 1 sai o golpe (o padrão da comunidade). */
        const enchimento = a => (a.m.cooldownMs || 2000) <= (a.m.groupCooldownMs || 2000);
        const enchimentos = escolhidas.filter(enchimento).sort((a, b) => (modelo !== 'boss' ? ehArea(b) - ehArea(a) : 0) || (b.porLancamento - a.porLancamento));
        escolhidas = porDano(escolhidas.filter(a => !enchimento(a))).concat(enchimentos).slice(0, 4);
        const plano = escolhidas.map((a, i) => ({ slot: i + 1, av: a, minimo: (modelo === 'boss' || !ehArea(a)) ? 1 : 2 }));
        /* Sem slot extra: o dono pediu contagem exata (2 / 2+1 / 2+2). Se
         * nenhuma ficou com ≥1, a última do plano cai para ≥1. No Inteligente
         * o ≥1 vai para a runa (8 de ouro) ou, sem runa, para a magia mais
         * barata por dano — nunca para a onda de 170 de mana. */
        if (plano.length && !plano.some(p => p.minimo <= 1)) {
            const alvo1 = modelo === 'inteligente' ? (plano.find(p => ehRuna(p.av)) || plano.slice().sort((a, b) => b.av.danoPorOuro - a.av.danoPorOuro)[0]) : plano[plano.length - 1];
            alvo1.minimo = 1;
        }

        const cortadas = avaliadas.filter(a => a.morta).length;
        const naoCabe = viab && !vivas.some(a => a.cabeNoOrcamento);
        const extras = modelo === 'inteligente' ? planoExtras(vocForcada || vocacaoAtual(), hunt) : null;
        return { plano, ranking: avaliadas, info, hunt, modelo, cortadas, viab, naoCabe, extras };
    }

    /* =========================================================================
     *  ⭐⭐ VIABILIDADE DA PARTY — a correção que a validação exigiu
     *
     *  Checar a MELHOR MAGIA ISOLADA aprovava Cults Goroma (30,5 contra 11,5
     *  exigido) — e Cults Goroma deu −102,6k/h de verdade. O motivo: a melhor
     *  magia é a Lesser Front Sweep do Cavaleiro, de 6 de mana. Se só ele
     *  atacasse, a hunt se pagaria. Mas OS QUATRO atacam, e o custo é a soma.
     *
     *  Derivado das medições de 30/08:
     *      Orcs Edron   consumiu ~5,7 ouro/abate → dano/ouro da party = 13,7
     *      Vampire hell consumiu ~150 ouro/abate → dano/ouro da party = 3,85
     *
     *  Aqui a conta é feita sobre o slot 1 de cada personagem (o que mais
     *  dispara na rotação), somando dano e custo dos quatro:
     *      danoPorOuroParty = Σ(dano_i × alvos_i) / Σ(custo_i)
     *      custoPorAbate    = HP / danoPorOuroParty
     *  e a hunt só é viável se custoPorAbate ≤ loot × margem.
     * ====================================================================== */
    function viabilidadeParty(modelo, hunt) {
        const loot = LOOT_CACHE[hunt.id];
        if (loot == null) return null;
        const w = hunt.monsters.reduce((s, m) => s + (m.weight || 1), 0) || 1;
        const hp = hunt.monsters.reduce((s, m) => s + m.health * (m.weight || 1), 0) / w;

        let danoTotal = 0, custoTotal = 0;
        const porVoc = {};
        for (const voc of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) {
            const r = montarPlano(modelo, hunt, voc);
            const p1 = r.plano && r.plano[0];
            if (!p1) { porVoc[voc] = null; continue; }
            const a = p1.av;
            const alvosReais = Math.max(1, a.alvos * FATOR_ALVOS_REAIS);
            const d = a.danoEfetivo * alvosReais;
            danoTotal += d; custoTotal += a.custo;
            porVoc[voc] = { magia: a.m.name, dano: Math.round(d), custo: Math.round(a.custo) };
        }
        if (!custoTotal) return null;
        const dOuroParty = danoTotal / custoTotal;
        const custoPorAbate = hp / dOuroParty * fatorDesperdicio(hp);   // curva calibrada
        const orcamento = loot * MARGEM_LUCRO;
        const regen = partyEmRegen();
        return {
            loot, hp: Math.round(hp), orcamento: Math.round(orcamento * 10) / 10,
            dOuroParty: Math.round(dOuroParty * 100) / 100,
            custoPorAbate: Math.round(custoPorAbate),
            exigidoParty: Math.round(hp / orcamento * 10) / 10,
            regen,
            cabe: regen ? true : custoPorAbate <= orcamento,
            lucroPorAbate: Math.round(loot - custoPorAbate),
            porVoc
        };
    }

    /* @@MAGIA-FIM */
    /* =========================================================================
     *  APLICADOR — dirige os diálogos reais do jogo pelas âncoras data-testid
     *
     *  Fluxo confirmado ao vivo em 30/08:
     *    scene-slot-attack-N  → abre o diálogo
     *    slot-config-tab-spells | slot-config-tab-items
     *    slot-config-opt-<nome>          (nome exatamente como no jogo)
     *    slot-config-stepper-inc / -dec  (mínimo de criaturas)
     *    slot-config-save
     * ====================================================================== */
    async function aplicarSlot(indice, nomeMagia, ehRuna, minimo) {
        const botao = tid('scene-slot-attack-' + indice);
        if (!botao) throw new Error('slot ' + (indice + 1) + ' não encontrado na tela');
        botao.click();

        const aba = await esperarQue(() => tid(ehRuna ? 'slot-config-tab-items' : 'slot-config-tab-spells'));
        if (!aba) throw new Error('diálogo do slot ' + (indice + 1) + ' não abriu');
        aba.click();

        const alvo = await esperarQue(() => tid('slot-config-opt-' + nomeMagia));
        if (!alvo) throw new Error(`"${nomeMagia}" não aparece na lista do slot ${indice + 1}`);
        alvo.click();

        /* o mínimo tem âncora própria (slot-config-stepper-value) — descoberto
         * em 30/08. Antes eu subia no pai do botão e caçava o texto irmão, o
         * que quebraria em qualquer mudança de layout. */
        const valor = () => {
            const v = tid('slot-config-stepper-value');
            if (v) { const n = parseInt((v.textContent || '').replace(/\D/g, '')); return isNaN(n) ? null : n; }
            return null;
        };
        for (let i = 0; i < 12; i++) {
            const v = valor();
            if (v == null || v === minimo) break;
            const b = tid(v < minimo ? 'slot-config-stepper-inc' : 'slot-config-stepper-dec');
            if (!b || b.disabled) break;
            b.click();
            await dorme(70);
        }

        const salvar = await esperarQue(() => { const b = tid('slot-config-save'); return b && !b.disabled ? b : null; });
        if (!salvar) throw new Error('SALVAR não habilitou no slot ' + (indice + 1));
        salvar.click();
        await dorme(250);
        return true;
    }

    /* Esvazia um slot. Precisa existir: se o plano usa 2 slots e o personagem
     * tinha 4 configurados, os 2 antigos continuariam disparando — e são
     * justamente os que o corte de magia morta rejeitou. */
    async function esvaziarSlot(indice) {
        const botao = tid('scene-slot-attack-' + indice);
        if (!botao) return false;
        botao.click();
        const vazio = await esperarQue(() => tid('slot-config-empty'), 2500);
        if (!vazio) { const c = tid('slot-config-cancel'); if (c) c.click(); return false; }
        vazio.click();
        await dorme(200);
        const salvar = tid('slot-config-save');
        if (salvar && !salvar.disabled) salvar.click();
        else { const c = tid('slot-config-cancel'); if (c) c.click(); }
        await dorme(200);
        return true;
    }

    async function aplicarPlano(resultado, silencioso) {
        if (!resultado || !resultado.plano) return 0;
        const voc = vocacaoAtual();
        if (!silencioso) log(`aplicando ${MODELOS[resultado.modelo].nome} em ${resultado.hunt.title} (${voc})…`);
        let ok = 0;
        for (const p of resultado.plano) {
            try {
                await aplicarSlot(p.slot - 1, p.av.m.name, !!p.av.m.isRune, p.minimo);
                log(`  ${voc} slot ${p.slot}: ${p.av.m.name} ≥${p.minimo}`, 'ok');
                ok++;
            } catch (e) {
                log(`  ${voc} slot ${p.slot} falhou: ${e.message}`, 'erro');
            }
        }
        // limpa o que sobrou dos 4 — slot antigo com magia morta ainda dispara
        for (let i = resultado.plano.length; i < 4; i++) {
            try {
                const el = tid('scene-slot-attack-' + i);
                const temAlgo = el && !/^\s*＋?\s*$/.test(el.textContent || '');
                if (temAlgo && await esvaziarSlot(i)) log(`  ${voc} slot ${i + 1}: esvaziado`, 'ok');
            } catch (e) { }
        }
        if (!silencioso) log(`${voc}: ${ok}/${resultado.plano.length} slots aplicados`, ok ? 'ok' : 'erro');
        return ok;
    }

    /* APLICAR NOS QUATRO — abre a janela de cada personagem, recalcula o plano
     * PARA AQUELA VOCAÇÃO (magias e dano medido são por personagem) e aplica.
     * Não dá pra calcular uma vez e repetir: o Cavaleiro é físico, o Druida é
     * gelo, e o dano medido é guardado por vocação+nível. */
    let _aplicando = false;
    async function aplicarEmTodos(modelo, hunt) {
        if (_aprendendo) { log('ainda medindo o dano dos personagens — espera terminar antes de aplicar', 'erro'); return; }
        /* v2.1.1 — pelo socket a aplicação leva ~1 s e o clique duplo virou
         * real (22:14 de 27/09: duas rodadas intercaladas no Log). Uma por vez. */
        if (_aplicando) { log('já estou aplicando — espera terminar', 'info'); return; }
        _aplicando = true;
        try { await _aplicarEmTodos(modelo, hunt); } finally { _aplicando = false; renderizar(); }
    }
    async function _aplicarEmTodos(modelo, hunt) {
        /* v1.8.2 — CONTA NOVA SEM DANO MEDIDO. Na conta u2tag (23/09) o
         * APLICAR saiu com 1 runa por mago e nada no Cavaleiro: o plano só
         * usa magia com dano conhecido, e ali nada tinha sido medido. Como o
         * clique em APLICAR é do dono, medir antes faz parte do pedido —
         * não é automação por conta própria. */
        const semDano = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'].filter(v => magiasDaVocacao(v).length && !Object.keys(danosConhecidos(v)).length);
        if (semDano.length) {
            /* v2.1.0: primeiro /spell-numbers (instantâneo); os diálogos só se não houver token */
            const r = await aprenderDanosPorRest(false);
            if (r.erro) {
                log('sem dano medido em ' + semDano.join(', ') + ' — medindo antes de aplicar (~35 s): ' + r.erro, 'info');
                _aprendendo = true;
                try { await aprenderDanosTodos(); } finally { _aprendendo = false; }
            }
        }
        /* v2.1.0 — PELO SOCKET. Sem trocar de aba, sem abrir janela: calcula o
         * plano de cada vocação e manda os mesmos frames que a janela manda. */
        if (socketAberto() && ESTADO_WS.profiles) {
            log(`aplicando ${nomeModelo(modelo)} nos 4 personagens em ${hunt.title} — pelo socket, sem abrir janela…`);
            let total = 0, semEco = 0;
            for (const voc of VOCS) {
                const r = montarPlano(modelo, hunt, voc);
                if (r.erro) { log(`  ${voc}: ${r.erro}`, 'erro'); continue; }
                if (!r.plano.length) { log(`  ${voc}: plano vazio (nenhuma magia com dano conhecido) — slots não tocados`, 'erro'); continue; }
                try {
                    const x = await aplicarPlanoSocket(r, voc);
                    total += x.n; if (x.cacando && !x.eco) semEco++;
                    log(`  ${voc}: ` + r.plano.map(p => `${p.av.m.name} ≥${p.minimo}`).join(' · ') + (x.cacando ? (x.eco ? ' ✓ servidor confirmou' : ' (sem eco do servidor)') : ' (na cidade: vale na próxima caçada)'), 'ok');
                } catch (e) { log(`  ${voc}: falhou pelo socket — ${e.message}`, 'erro'); }
                await dorme(150);
            }
            log(`terminado — ${total} slots enviados pelo socket` + (semEco ? ` · ${semEco} sem confirmação (confira os slots na tela)` : ''), total ? 'ok' : 'erro');
            renderizar();
            return;
        }
        const original = vocacaoAtual();
        log(`aplicando ${nomeModelo(modelo)} nos 4 personagens em ${hunt.title}…`);
        let total = 0, semExtras = false;
        for (const voc of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) {
            const aba = tid('party-member-' + voc);
            if (!aba) { log(`  ${voc}: aba não encontrada`, 'erro'); continue; }
            aba.click();
            // espera a troca de personagem chegar no DOM antes de calcular
            const trocou = await esperarQue(() => vocacaoAtual() === voc, 3000, 120);
            if (!trocou) { log(`  ${voc}: não consegui selecionar`, 'erro'); continue; }
            await dorme(250);
            const r = montarPlano(modelo, hunt);
            if (r.erro) { log(`  ${voc}: ${r.erro}`, 'erro'); continue; }
            if (r.extras) semExtras = true;
            total += await aplicarPlano(r, true);
        }
        const volta = tid('party-member-' + original);
        if (volta) volta.click();
        log(`terminado — ${total} slots aplicados nos 4 personagens`, total ? 'ok' : 'erro');
        /* v2.9.0 — pelos diálogos só os ataques mudam: poção, cura, suporte e
         * munição do Inteligente só saem pelo socket. Antes isso era calado. */
        if (semExtras) log('⚠ sem o socket, só os 4 slots de ataque foram trocados — poção, cura, suporte e munição do Inteligente NÃO foram aplicados. Recarregue a página (F5) com o helper instalado e aplique de novo.', 'erro');
        renderizar();
    }

    /* =========================================================================
     *  APRENDIZADO DE DANO — abre o diálogo e lê "Dano: X-Y" de cada magia
     * ====================================================================== */
    async function aprenderDanos() {
        if (tid('slot-config-modal')) { log('já tem um diálogo de atalho aberto — fecha antes de aprender', 'erro'); return; }
        const magias = magiasDaVocacao();
        log(`aprendendo dano real de ${magias.length} magias (${vocacaoAtual()} nv ${nivelAtual()})…`);
        const botao = tid('scene-slot-attack-0');
        if (!botao) { log('preciso da tela do personagem aberta', 'erro'); return; }
        botao.click();
        if (!await esperarQue(() => tid('slot-config-tab-spells'))) { log('diálogo não abriu', 'erro'); return; }

        let n = 0, pulou = 0;
        for (const m of magias) {
            const aba = tid(m.isRune ? 'slot-config-tab-items' : 'slot-config-tab-spells');
            if (aba) { aba.click(); await dorme(120); }
            const opt = tid('slot-config-opt-' + m.name);
            if (!opt) { pulou++; continue; }
            opt.click();

            /* ⚠⚠ A CORRIDA QUE CORROMPIA A TABELA INTEIRA (achada em 30/08).
             * Antes eu clicava e esperava por QUALQUER elemento "Dano: X-Y".
             * Só que o do item anterior continua na tela enquanto o painel não
             * repinta — então a espera voltava na hora, com o valor VELHO.
             * Resultado: cada magia recebia o dano da anterior. O Cavaleiro
             * gravou Lesser Front Sweep = 62-122 (que é o Groundshaker) e
             * Groundshaker = 51-90. Silencioso e totalmente errado.
             *
             * Agora a espera é pelo NOME selecionado bater com o que cliquei
             * (slot-config-selected). Só depois disso o dano é lido. */
            const casou = await esperarQue(() => {
                const sel = tid('slot-config-selected');
                if (!sel) return null;
                // startsWith, não includes: "Front Sweep" casaria dentro de
                // "Lesser Front Sweep" e traria o dano da magia errada
                return (sel.textContent || '').trim().startsWith(m.name) ? sel : null;
            }, 2000, 70);
            if (!casou) { pulou++; continue; }

            const efeito = await esperarQue(() => {
                const el = $$('div,span').find(e => e.children.length === 0 && /^Dano:\s*\d+/.test((e.textContent || '').trim()));
                return el ? el.textContent.trim() : null;
            }, 1200, 70);
            if (efeito) {
                const mm = efeito.match(/(\d+)\s*-\s*(\d+)/);
                if (mm) { anotarDano(m.name, +mm[1], +mm[2], m.mana || 0, casasDaMagia(m)); n++; }
            } else pulou++;
        }
        const cancelar = tid('slot-config-cancel');
        if (cancelar) cancelar.click();
        log(`aprendi ${n} magias${pulou ? ', pulei ' + pulou + ' (sem dano na tela)' : ''}`, 'ok');
        renderizar();
    }

    /* LURE NO MAXIMO. Trocar de hunt reseta o lure para o tier 1 (medido em
     * 19/09). No modal, a linha DESABILITADA e a ATIVA — as outras sao
     * clicaveis. Sobe para o maior "Nivel N" habilitado e fecha. */
    async function lureNoMaximo() {
        if (socketAberto() && emHunt() && frameFresco()) {
            try { const r = await lureNoMaximoSocket(); if (!r.erro) return r; log('lure pelo socket: ' + r.erro + ' — tentando pela janela', 'info'); } catch (e) { }
        }
        /* 23/09: o botão fica `disabled` enquanto o jogo está "Lurando
         * Monstros" (e logo após trocar de hunt). Espera liberar até 40 s. */
        const abrir = await esperarQue(() => { const b = tid('lure-toggle'); return b && !b.disabled ? b : null; }, 40000, 500);
        if (!abrir) return { erro: tid('lure-toggle') ? 'botão de lure desabilitado (lurando monstros) — tente de novo em instantes' : 'sem botão de lure' };
        abrir.click();
        const radios = await esperarQue(() => { const r = $$('[role="radio"]'); return r.length ? r : null; }, 5000, 150);
        const fechar = () => { const b = tid('lure-modal-close'); if (b) b.click(); };
        if (!radios) { fechar(); return { erro: 'modal de lure não abriu' }; }
        const nivel = r => parseInt(((r.textContent || '').match(/Nível\s*(\d+)/) || [])[1] || '0', 10);
        const livres = radios.filter(r => !r.disabled && r.getAttribute('aria-disabled') !== 'true');
        const ativo = radios.find(r => r.disabled || r.getAttribute('aria-disabled') === 'true');
        const alvo = livres.sort((a, b) => nivel(b) - nivel(a))[0];
        if (!alvo || (ativo && nivel(ativo) >= nivel(alvo))) { fechar(); await dorme(300); return { ja: true, nivel: ativo ? nivel(ativo) : null }; }
        alvo.click();
        await dorme(600);
        fechar();
        await dorme(400);
        log(`lure subido para o nível ${nivel(alvo)}`, 'ok');
        return { nivel: nivel(alvo) };
    }

    /* Os quatro de uma vez — o dano e por personagem, entao troca a aba,
     * aprende, e volta para quem estava selecionado. So leitura. */
    async function aprenderDanosTodos() {
        const original = vocacaoAtual();
        log(`nível ${nivelAtual()}: medindo o dano real dos 4 personagens…`);
        for (const voc of ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID']) {
            const aba = tid('party-member-' + voc);
            if (!aba) continue;
            aba.click();
            if (!await esperarQue(() => vocacaoAtual() === voc, 3000, 120)) continue;
            await dorme(300);
            try { await aprenderDanos(); } catch (e) { log(`  ${voc}: aprendizado falhou — ${e.message}`, 'erro'); }
        }
        const volta = tid('party-member-' + original);
        if (volta) volta.click();
    }

    /* =========================================================================
     *  ⭐ ANALISADOR — mede sozinho e vira ponto de calibração
     *
     *  Motivo de existir: em 30/08 eu (Claude) medi 4 hunts à mão, com laços
     *  externos, e os dados morreram junto com a sessão. A curva de desperdício
     *  do teto de gasto tem DOIS pontos porque medir na mão é caro. Cada caçada
     *  que roda aqui vira um ponto novo, de graça.
     *
     *  ⚠⚠ A ARMADILHA QUE INVALIDOU DUAS MEDIÇÕES: se a mochila enche, o loot
     *  passa a ser PERDIDO e o Δouro fica artificialmente ruim. Aconteceu com
     *  Zombies e Mutated Humans — a mochila estava em 1.361/1.520 oz e eu li
     *  −14,7k/h que não era real. Depois vendi e apareceram 6.161 de ouro
     *  parados. Por isso toda sessão registra o peso da mochila e é marcada
     *  como SUJA se ela passar de 85% ou crescer muito sem vender.
     * ====================================================================== */
    /* ⚠ 15s era lento demais — o painel levava mais de um minuto pra mostrar
     * um número estável. E o custo não estava no intervalo: estava em
     * `document.body.innerText` dentro de lerAbates(), que força relayout da
     * página INTEIRA a cada amostra. Agora o elemento dos abates é procurado
     * uma vez e guardado; a leitura vira um textContent barato e o intervalo
     * pode cair pra 3s sem pesar. */
    const AMOSTRA_MS = 3000;
    const MAX_SESSOES = 120;
    let SESSAO = null;

    /* =========================================================================
     *  ⭐ v2.0.0 — ESTADO PELO WEBSOCKET (só leitura)
     *
     *  Mapeado em 27/09 (TIBIDLE.md §13). O servidor manda:
     *    hunt_started / resume  {huntId, lure, autoBoss?, state}  ao entrar
     *    frame (a cada ~1 s)    {state:{cap, balance, lureTier, active…}}
     *    ended                  {summary:{huntId, title, …}}
     *  e o cliente envia start_hunt {huntId, lure, bossId?} — o boss é uma
     *  caçada com bossId. Com isso a hunt e o boss são conhecidos NA HORA,
     *  sem abrir a tela CAÇADAS, e mochila/ouro/lure saem do frame em vez
     *  de serem lidos do texto da tela. O DOM continua como reserva.
     *  ⚠ Nada é ENVIADO por aqui. Só leitura. */
    const ESTADO_WS = { huntId: null, boss: null, ultimoStart: null, frame: null, hunt_t: 0,
                        worldToken: null, profiles: null, battleConfigs: null, roster: [], party: [], eco: {},
                        rosterFull: null, rosterFull_t: 0, depot: null, depot_t: 0 };
    const VOCS = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'];
    const FRAME_FRESCO_MS = 5000;
    const frameFresco = () => !!(ESTADO_WS.frame && Date.now() - ESTADO_WS.frame.t < FRAME_FRESCO_MS);
    function estadoWS() {
        const f = ESTADO_WS.frame;
        return { huntId: ESTADO_WS.huntId, boss: ESTADO_WS.boss, cap: f && f.cap, balance: f && f.balance,
                 lureTier: f && f.lureTier, active: f && f.active, idadeMs: f ? Date.now() - f.t : null,
                 ultimoStart: ESTADO_WS.ultimoStart, party: ESTADO_WS.party, roster: ESTADO_WS.roster,
                 temToken: !!ESTADO_WS.worldToken, temPerfis: !!ESTADO_WS.profiles, socketAberto: socketAberto(),
                 configs: ESTADO_WS.profiles ? Object.fromEntries(VOCS.map(v => [v, configAtiva(v)])) : null };
    }

    /* =========================================================================
     *  ⭐ v2.1.0 — SLOTS PELO SOCKET, SEM ABRIR JANELA (pedido original do dono)
     *
     *  Lido do código do cliente em 27/09 (TIBIDLE.md §13, "2.1.0"):
     *
     *   • welcome / resume trazem `profiles` — por vocação, {active, list[4]}
     *     com list[i].config = {heals[{name,percent}], manaPotion{name?,percent},
     *     skills[4], minCreatures{nome:n}, supports[2], ammo?}. É a MESMA
     *     configuração que a janela de atalhos edita.
     *   • Ao salvar um slot, o cliente manda DOIS frames:
     *       update_battle_config {who, heals, manaPotion, skills, supports,
     *                             minCreatures, ammo?}   — só CAÇANDO; `who` é
     *                             o índice do personagem em frame.state.party
     *       profiles_set {vocation, profiles:{active,list}} — sempre (persiste)
     *     O servidor ecoa em frame.events {kind:'update_battle_config', who,
     *     config}, que é como a tela confirma.
     *   • welcome/resume trazem `worldToken`: é o Bearer que /spell-numbers
     *     exige. Essa rota devolve o "Dano: X-Y" de TODAS as magias e runas
     *     de uma vez — conferido em 27/09, idêntico ao que a janela mostra.
     *   • set_lure {tier} — tier é o ÍNDICE (1..lureTiers.length), não a
     *     contagem de monstros.
     *
     *  Regra mantida: NADA disso dispara sozinho. São os mesmos botões
     *  (APLICAR NOS 4, Aprender dano) — só que sem abrir 12 janelas.
     *  O caminho pelos diálogos continua como reserva se o socket não deu
     *  os perfis (ex.: helper instalado com o jogo já aberto).
     * ====================================================================== */
    function socketAberto() { return !!(WS.socket && WS.socket.readyState === 1); }
    function enviarWS(obj) {
        if (!socketAberto()) throw new Error('socket do jogo não está aberto');
        WS.socket.send(JSON.stringify(obj));          // passa pelo grampo: conta em WS.enviados e observarEnviado
    }
    const ordemParty = () => (ESTADO_WS.party.length ? ESTADO_WS.party : ESTADO_WS.roster);
    const vocDoIndice = (i) => ordemParty()[i] || null;
    const indiceDaVoc = (v) => { const i = ordemParty().indexOf(v); return i >= 0 ? i : null; };
    const clonar = (x) => JSON.parse(JSON.stringify(x));
    function perfilDaVoc(v) {                          // mesmo preenchimento que o cliente faz (4 perfis)
        const p = ESTADO_WS.profiles && ESTADO_WS.profiles[v];
        const base = p ? clonar(p) : { active: 0, list: [] };
        if (!Array.isArray(base.list)) base.list = [];
        while (base.list.length < 4) base.list.push({ name: String(base.list.length + 1), config: null });
        if (!(base.active >= 0 && base.active < base.list.length)) base.active = 0;
        return base;
    }
    function configAtiva(v) {
        const p = perfilDaVoc(v);
        const c = p.list[p.active] && p.list[p.active].config;
        if (c) return c;
        return (ESTADO_WS.battleConfigs && ESTADO_WS.battleConfigs[v]) || null;
    }
    function normalizarConfig(c) {                      // = e3() do cliente
        c = c || {};
        const r = {
            heals: (c.heals || []).map(h => h ? { name: h.name, percent: h.percent != null ? h.percent : 60 } : null),
            manaPotion: c.manaPotion ? { name: c.manaPotion.name, percent: c.manaPotion.percent != null ? c.manaPotion.percent : 0 } : null,
            skills: (c.skills || []).map(x => x != null ? x : null),
            minCreatures: Object.assign({}, c.minCreatures || {}),
            supports: (c.supports || []).map(x => x != null ? x : null)
        };
        if (typeof c.ammo === 'string' && c.ammo) r.ammo = c.ammo;
        return r;
    }
    const pct100 = v => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
    function payloadBattleConfig(c, who) {             // = ee() do cliente
        const t = {};
        if (who != null) t.who = who;
        const heals = (c.heals || []).slice(0, 5).map(h => h && h.name ? { name: h.name, percent: pct100(h.percent) } : null);
        if (heals.length) t.heals = heals;
        if (c.manaPotion) { const a = { percent: pct100(c.manaPotion.percent) }; if (c.manaPotion.name) a.name = c.manaPotion.name; t.manaPotion = a; }
        const skills = (c.skills || []).slice(0, 4).map(x => x || null);
        if (skills.length) t.skills = skills;
        const sup = (c.supports || []).slice(0, 2).map(x => x || null);
        if (sup.length) t.supports = sup;
        const tem = new Set(skills.filter(Boolean)), mc = {};
        Object.keys(c.minCreatures || {}).forEach(k => { if (tem.has(k)) mc[k] = Math.min(8, Math.max(1, Math.round(c.minCreatures[k]))); });
        if (Object.keys(mc).length) t.minCreatures = mc;
        if (typeof c.ammo === 'string' && c.ammo) t.ammo = c.ammo;
        return t;
    }
    function aplicarConfigLocal(voc, cfg) {
        if (!voc || !cfg) return;
        if (!ESTADO_WS.profiles) ESTADO_WS.profiles = {};
        const p = perfilDaVoc(voc);
        p.list[p.active] = { name: p.list[p.active].name, config: normalizarConfig(cfg) };
        ESTADO_WS.profiles[voc] = p;
    }

    /* Aplica o plano de UMA vocação pelo socket: mantém poções, suportes e
     * munição como estão, troca só skills + minCreatures. Manda os mesmos
     * dois frames que a janela manda. */
    async function aplicarPlanoSocket(resultado, voc) {
        if (!resultado || !resultado.plano) return 0;
        if (!ESTADO_WS.profiles) throw new Error('perfis ainda não chegaram pelo socket (welcome/resume)');
        const atual = normalizarConfig(configAtiva(voc));
        const skills = [null, null, null, null], mc = {};
        resultado.plano.slice(0, 4).forEach((p, i) => { skills[i] = p.av.m.name; mc[p.av.m.name] = p.minimo; });
        const nova = Object.assign({}, atual, { skills, minCreatures: mc });
        /* v2.6.0 — Inteligente traz poções, cura, suporte e munição junto */
        if (resultado.extras) {
            nova.heals = resultado.extras.heals; nova.manaPotion = resultado.extras.manaPotion; nova.supports = resultado.extras.supports;
            if (resultado.extras.ammo) nova.ammo = resultado.extras.ammo;
        }
        const cacando = emHunt();
        const who = cacando ? indiceDaVoc(voc) : null;
        const t0 = Date.now();
        if (cacando && who != null) enviarWS({ type: 'update_battle_config', data: payloadBattleConfig(nova, who) });
        const perfil = perfilDaVoc(voc);
        perfil.list[perfil.active] = { name: perfil.list[perfil.active].name, config: nova };
        enviarWS({ type: 'profiles_set', data: { vocation: voc, profiles: perfil } });
        let eco = null;
        if (cacando && who != null) eco = await esperarQue(() => ESTADO_WS.eco[who] && ESTADO_WS.eco[who] > t0, 4000, 150);
        return { n: resultado.plano.length, who, eco: !!eco, cacando };
    }

    /* Dano real de TODAS as magias e runas numa chamada, com o worldToken. */
    let _danosRestPendente = false;
    async function aprenderDanosPorRest(silencioso) {
        const tok = ESTADO_WS.worldToken;
        if (!tok) return { erro: 'sem worldToken — o welcome do socket ainda não chegou (recarregue com o helper instalado)' };
        if (!CAT.magias) return { erro: 'catálogo de magias ainda não carregou' };
        let nums;
        try {
            const r = await fetch(API + '/spell-numbers', { headers: { authorization: 'Bearer ' + tok }, credentials: 'include' });
            if (!r.ok) return { erro: '/spell-numbers respondeu HTTP ' + r.status };
            nums = await r.json();
        } catch (e) { return { erro: '/spell-numbers falhou: ' + e.message }; }
        let n = 0; const lvl = nivelAtual();
        for (const voc of VOCS) {
            const d = ler('danos_' + voc, {});
            for (const m of magiasDaVocacao(voc)) {
                const x = m.file && nums[m.file];
                if (!x || x.kind !== 'damage' || x.min == null) continue;
                d[m.name] = { min: x.min, max: x.max, mana: m.mana || 0, casas: casasDaMagia(m), nivel: lvl, ts: Date.now(), fonte: 'rest' };
                n++;
            }
            guardar('danos_' + voc, d);
        }
        if (!silencioso || n) log(`dano real de ${n} magias/runas lido de /spell-numbers (nível ${lvl}, sem abrir janela)`, 'ok');
        renderizar();
        return { ok: true, n };
    }

    /* Lure no máximo pelo socket: tier = índice do último lureTier. */
    async function lureNoMaximoSocket(hunt) {
        const h = hunt || huntAtual();
        if (!h || !h.lureTiers || !h.lureTiers.length) return { erro: 'hunt sem tiers de lure no catálogo' };
        const max = h.lureTiers.length;
        const atual = frameFresco() ? ESTADO_WS.frame.lureTier : null;
        if (atual != null && atual >= max) return { ja: true, nivel: atual };
        enviarWS({ type: 'set_lure', data: { tier: max } });
        const ok = await esperarQue(() => frameFresco() && ESTADO_WS.frame.lureTier === max, 6000, 250);
        if (!ok) return { erro: 'enviei set_lure ' + max + ' e o frame não confirmou (lurando monstros?)' };
        log('lure subido para o nível ' + max + ' (socket)', 'ok');
        return { nivel: max };
    }

    /* =========================================================================
     *  ⭐ v2.6.4 — LIVRO-RAZÃO DE COMBATE (pedido do dono, 28/09: "olha os dados
     *  estatísticos do grupo — o que estão gastando, o maior dano e o que estão
     *  levando"). O frame traz, em `events`, cada lance da party:
     *    cast  {who, name, rune, hits[{id, amount, hp}]}   magia/runa e o dano em cada alvo
     *    hit   {who, id, amount, hp}                        auto-ataque
     *    mhit  {id, amount, hp} · mcast {atk, amount}       o que a party TOMA
     *    spawn {id, maxHp} · kill {id, xp} · wave {count} · wave_timer {ms}
     *  `who` é o índice em state.party. Daqui sai o que o modelo só chutava:
     *  dano real por lançamento e por mana de cada magia NESTE mapa (armadura
     *  e resistência já descontadas), overkill, quem carrega o dano, mana média
     *  de cada um (mana baixa = kit caro demais para a regeneração), dano
     *  tomado e o ritmo das ondas. Medido em Stonerefiners (28/09): ondas de 8
     *  a cada ~9,5 s de espera, mortas em ~2,5 s — o spawn limita, dano extra
     *  não vira xp, e vale a build mais barata que ainda limpa a onda.
     * ====================================================================== */
    const razaoNovo = () => ({ t0: Date.now(), magias: {}, auto: {}, tomado: { total: 0, golpes: 0 }, kills: 0, ondas: { n: 0, tam: 0, timer: 0, matar: 0, tOnda: 0 }, vitais: {}, hpAntes: {} });
    let RAZAO = razaoNovo();
    function razaoVitais(L, party) {
        for (const p of party) {
            if (!p || !p.vocation || !p.maxMana) continue;
            const v = L.vitais[p.vocation] || (L.vitais[p.vocation] = { n: 0, mana: 0, hp: 0, hpMin: 1 });
            v.n++; v.mana += p.mana / p.maxMana; v.hp += p.hp / (p.maxHp || 1); v.hpMin = Math.min(v.hpMin, p.hp / (p.maxHp || 1));
        }
    }
    function razaoEvento(L, e, agora) {
        const k = e.kind;
        if (k === 'spawn') { L.hpAntes[e.id] = e.maxHp; return; }
        if (k === 'cast') {
            const voc = vocDoIndice(e.who) || ('#' + e.who), ch = voc + '|' + e.name;
            const m = L.magias[ch] || (L.magias[ch] = { voc, nome: e.name, runa: !!e.rune, casts: 0, hits: 0, dano: 0, overkill: 0, mortos: 0 });
            m.casts++;
            for (const x of (e.hits || [])) {
                m.hits++; m.dano += x.amount || 0;
                if (x.hp <= 0) { m.mortos++; const antes = L.hpAntes[x.id]; if (antes != null) m.overkill += Math.max(0, (x.amount || 0) - antes); delete L.hpAntes[x.id]; }
                else L.hpAntes[x.id] = x.hp;
            }
            return;
        }
        if (k === 'hit') {
            const voc = vocDoIndice(e.who) || ('#' + e.who);
            const a = L.auto[voc] || (L.auto[voc] = { hits: 0, dano: 0, mortos: 0 });
            a.hits++; a.dano += e.amount || 0;
            if (e.hp <= 0) { a.mortos++; delete L.hpAntes[e.id]; } else L.hpAntes[e.id] = e.hp;
            return;
        }
        if (k === 'mhit' || k === 'mcast') { L.tomado.total += e.amount || 0; L.tomado.golpes++; return; }
        if (k === 'kill') { L.kills++; delete L.hpAntes[e.id]; return; }
        if (k === 'wave') { L.ondas.n++; L.ondas.tOnda = agora; L.ondas.tam = e.count || L.ondas.tam; return; }
        if (k === 'wave_timer') { L.ondas.timer += e.ms || 0; if (L.ondas.tOnda) { L.ondas.matar += agora - L.ondas.tOnda; L.ondas.tOnda = 0; } }
    }
    /* → { seg, danoTotal, porVoc{VOC:{dano,pct,dps,mana,ouro,manaMedia,hpMedia,hpMin}}, magias[por dano],
     *     ondas{n,tam,timer,matar,ciclo,spawnLimita}, tomado, tomadoH, kills } */
    function razaoResumo(L) {
        const seg = Math.max(1, (Date.now() - L.t0) / 1000);
        const porVoc = {}; let danoTotal = 0;
        const add = (voc, dano, mana, ouro) => { const v = porVoc[voc] || (porVoc[voc] = { dano: 0, mana: 0, ouro: 0 }); v.dano += dano; v.mana += mana; v.ouro += ouro; danoTotal += dano; };
        const magias = Object.values(L.magias).map(m => {
            const cat = (CAT.magias || []).find(x => x.name === m.nome);
            const mana = (!m.runa && cat && cat.mana) ? cat.mana * m.casts : 0;
            const ouro = (m.runa && cat) ? (precoRuna(cat) || 0) * m.casts : 0;
            add(m.voc, m.dano, mana, ouro);
            return { voc: m.voc, nome: m.nome, runa: m.runa, casts: m.casts, dano: m.dano, porCast: Math.round(m.dano / m.casts), alvosPorCast: Math.round(m.hits / m.casts * 10) / 10,
                     mana, ouro, danoPorMana: mana ? Math.round(m.dano / mana * 10) / 10 : null, danoPorOuro: ouro ? Math.round(m.dano / ouro * 10) / 10 : null,
                     overkillPct: m.dano ? Math.round(m.overkill / m.dano * 100) : 0, mortos: m.mortos };
        }).sort((a, b) => b.dano - a.dano);
        for (const [voc, a] of Object.entries(L.auto)) add(voc, a.dano, 0, 0);
        for (const [voc, v] of Object.entries(porVoc)) {
            v.pct = danoTotal ? Math.round(v.dano / danoTotal * 100) : 0; v.dps = Math.round(v.dano / seg * 10) / 10;
            const vi = L.vitais[voc]; if (vi && vi.n) { v.manaMedia = Math.round(vi.mana / vi.n * 100); v.hpMedia = Math.round(vi.hp / vi.n * 100); v.hpMin = Math.round(vi.hpMin * 100); }
        }
        const o = L.ondas, n = o.n || 0;
        const ondas = n ? { n, tam: o.tam, timer: Math.round(o.timer / n / 100) / 10, matar: Math.round(o.matar / n / 100) / 10 } : null;
        if (ondas) { ondas.ciclo = Math.round((ondas.timer + ondas.matar) * 10) / 10; ondas.spawnLimita = ondas.matar < ondas.timer * 0.5; }
        return { seg: Math.round(seg), danoTotal, porVoc, magias, ondas, tomado: L.tomado.total, tomadoH: Math.round(L.tomado.total / seg * 3600), kills: L.kills };
    }
    const VOC_CURTO = { KNIGHT: 'Cav', PALADIN: 'Pal', SORCERER: 'Fei', DRUID: 'Dru' };
    function razaoHtml(rz, curto) {
        if (!rz || !rz.danoTotal) return '';
        const vocs = VOCS.filter(v => rz.porVoc[v]).map(v => { const x = rz.porVoc[v]; return `${VOC_CURTO[v]} <b>${x.pct}%</b>${x.manaMedia != null ? ` <span class="${x.manaMedia < 25 ? 'tb-ruim' : ''}">mana ${x.manaMedia}%</span>` : ''}${x.hpMin != null && x.hpMin < 50 ? ` <span class="tb-ruim">vida mín ${x.hpMin}%</span>` : ''}`; }).join(' · ');
        const top = rz.magias.filter(m => m.danoPorMana != null).sort((a, b) => b.danoPorMana - a.danoPorMana).slice(0, curto ? 3 : 6).map(m => `${m.nome} ${m.danoPorMana}${m.overkillPct >= 15 ? ` <span class="tb-av">overkill ${m.overkillPct}%</span>` : ''}`).join(' · ');
        const runas = rz.magias.filter(m => m.danoPorOuro != null).map(m => `${m.nome} ${m.danoPorOuro}/ouro`).join(' · ');
        const ondas = rz.ondas && rz.ondas.n ? `ondas de ${rz.ondas.tam}: mortas em ${rz.ondas.matar}s, espera ${rz.ondas.timer}s ${rz.ondas.spawnLimita ? '<span class="tb-av">(spawn limita)</span>' : '<span class="tb-ok">(dano limita)</span>'}` : '';
        return `<div class="tb-mut" style="font-size:10px">dano: ${vocs}${ondas ? ' · ' + ondas : ''}</div>` + (top ? `<div class="tb-mut" style="font-size:10px">dano/mana: ${top}${runas ? ' · ' + runas : ''}</div>` : '');
    }
    function razaoTexto(rz) {
        if (!rz || !rz.danoTotal) return '';
        const vocs = VOCS.filter(v => rz.porVoc[v]).map(v => `${VOC_CURTO[v]} ${rz.porVoc[v].pct}%${rz.porVoc[v].manaMedia != null ? '/m' + rz.porVoc[v].manaMedia : ''}`).join(' ');
        return vocs + (rz.ondas && rz.ondas.n ? ` · onda ${rz.ondas.tam} morta em ${rz.ondas.matar}s + espera ${rz.ondas.timer}s${rz.ondas.spawnLimita ? ' (spawn limita)' : ''}` : '');
    }

    /* v2.9.0 — SKILLS DO FRAME, guardadas para o Equip usar na cidade (onde
     * não chega frame). `skills.distance {value, bonus}` foi visto ao vivo em
     * 28/09; `melee` e `magicLevel` seguem os nomes dos bônus do bestiário
     * (TIBIDLE.md) — se o jogo usar outro nome, o Equip cai na referência. */
    const _skill = (p, nomes) => {
        let v = null;
        for (const n of nomes) { const x = p.skills && p.skills[n]; const val = x == null ? NaN : typeof x === 'number' ? x : Number(x.value) + (Number(x.bonus) || 0); if (Number.isFinite(val) && val > 0 && (v == null || val > v)) v = val; }
        return v;
    };
    let _skillsT = 0;
    function anotarSkills(party) {
        if (!ESTADO_WS.sk) ESTADO_WS.sk = ler('skills_vistas', {});
        for (const p of party) {
            if (!p || !p.vocation || !p.skills) continue;
            const x = { dist: _skill(p, ['distance']), melee: _skill(p, ['melee', 'sword', 'axe', 'club', 'fist']), ml: _skill(p, ['magicLevel', 'magic', 'maglevel']) };
            ESTADO_WS.sk[p.vocation] = Object.fromEntries(Object.entries(x).filter(([, v]) => v != null));
        }
        if (Date.now() - _skillsT > 60000) { _skillsT = Date.now(); guardar('skills_vistas', ESTADO_WS.sk); }
    }
    function observarEnviado(o) {
        if (!o || !o.type) return;
        const d = o.data || {};
        if (o.type === 'start_hunt') { ESTADO_WS.ultimoStart = Object.assign({ t: Date.now() }, d); return; }
        /* v2.9.0 — kit novo = medição nova. A mana média de cada personagem é o
         * que decide o regime do Inteligente; misturar o kit velho com o novo
         * fazia o regime oscilar (pesado → mana cai → leve → mana sobe → …). */
        if (o.type === 'profiles_set' && d.vocation && d.profiles) {
            if (!ESTADO_WS.profiles) ESTADO_WS.profiles = {};
            ESTADO_WS.profiles[d.vocation] = clonar(d.profiles);
            delete RAZAO.vitais[d.vocation];
            return;
        }
        if (o.type === 'update_battle_config' && d.who != null) { aplicarConfigLocal(vocDoIndice(d.who), d); const v = vocDoIndice(d.who); if (v) delete RAZAO.vitais[v]; }
    }
    function observarRecebido(o) {
        try { observarProgresso(o); } catch { }       // v2.11 — aba Progresso: só leitura (chaves, bestiário, prey, plano offline)
        if (!o || !o.type) return;
        const d = o.data || {};
        if (o.type === 'depot_state' && Array.isArray(d.entries)) {
            ESTADO_WS.depot = { entries: clonar(d.entries), used: d.used, total: d.total }; ESTADO_WS.depot_t = Date.now();
            if (ABA === 'equip') renderizar();
            return;
        }
        if (o.type === 'frame') {
            const st = d.state || {};
            const an = d.analyzer || null;
            ESTADO_WS.frame = {
                t: Date.now(), cap: st.cap || null, balance: st.balance != null ? Number(st.balance) : null,
                lureTier: st.lureTier != null ? st.lureTier : null,
                active: Array.isArray(st.active) ? st.active.map(m => m && (m.name || m.nome)).filter(Boolean) : [],
                nivel: st.character && st.character.level != null ? st.character.level : null,
                /* v2.2.0 — o analisador do PRÓPRIO jogo, por caçada: é o que o Scan mede */
                an: an ? { elapsedMs: Number(an.elapsedMs) || 0, xp: Number(an.xp) || 0, xpRaw: Number(an.xpRaw) || 0,
                           xpPerHour: Number(an.xpPerHour) || 0, kills: Number(an.killsTotal) || 0,
                           lootGold: Number(an.lootGold) || 0, suppliesGold: Number(an.suppliesGold) || 0,
                           damageDealt: Number(an.damageDealt) || 0, damageTaken: Number(an.damageTaken) || 0, healingDone: Number(an.healingDone) || 0,
                           drops: (an.drops && typeof an.drops === 'object') ? an.drops : {} } : null,
                /* v2.6.3 — por personagem: vida/mana e o que cada um bebeu (estudo de builds) */
                party: Array.isArray(st.party) ? st.party.map(p => p && ({ voc: p.vocation, hp: p.hp, maxHp: p.maxHp, mana: p.mana, maxMana: p.maxMana,
                           suppliesGold: Number(p.suppliesGold) || 0, supplyUsed: p.supplyUsed || {},
                           dist: p.skills && p.skills.distance ? Number(p.skills.distance.value) + (Number(p.skills.distance.bonus) || 0) : null })).filter(Boolean) : []
            };
            if (Array.isArray(st.party) && st.party.length) { ESTADO_WS.party = st.party.map(p => p && p.vocation).filter(Boolean); try { razaoVitais(RAZAO, st.party); } catch (e) { } try { anotarSkills(st.party); } catch (e) { } }
            if (Array.isArray(d.events)) { const agora = Date.now(); for (const ev of d.events) {
                if (!ev) continue;
                try { razaoEvento(RAZAO, ev, agora); } catch (e) { }
                if (ev.kind === 'update_battle_config' && ev.who != null) {
                    ESTADO_WS.eco[ev.who] = Date.now();
                    aplicarConfigLocal(vocDoIndice(ev.who), ev.config);
                }
            } }
            return;
        }
        if (o.type === 'welcome' || o.type === 'resume') {
            if (d.worldToken) ESTADO_WS.worldToken = d.worldToken;
            if (d.profiles && typeof d.profiles === 'object') ESTADO_WS.profiles = clonar(d.profiles);
            if (d.battleConfigs && typeof d.battleConfigs === 'object') ESTADO_WS.battleConfigs = clonar(d.battleConfigs);
            if (Array.isArray(d.roster) && d.roster.length) ESTADO_WS.roster = d.roster.map(r => r && r.vocation).filter(Boolean);
            if (Array.isArray(d.roster) && d.roster.length && d.roster.some(r => r && r.equipment)) {
                ESTADO_WS.rosterFull = clonar(d.roster); ESTADO_WS.rosterFull_t = Date.now();
            }
            if (Array.isArray(d.state && d.state.party) && d.state.party.length) ESTADO_WS.party = d.state.party.map(p => p && p.vocation).filter(Boolean);
            if (d.worldToken) _danosRestPendente = true;   // amostrar() lê /spell-numbers quando o catálogo estiver pronto
            if (o.type === 'welcome') { renderizar(); return; }
        }
        if (o.type === 'hunt_started' || o.type === 'resume') {
            const u = ESTADO_WS.ultimoStart;
            const bossId = (u && Date.now() - u.t < 60000 && u.bossId) ? u.bossId : null;
            const ehBoss = !!bossId || typeof d.autoBoss === 'boolean';
            ESTADO_WS.huntId = d.huntId != null ? d.huntId : null;
            ESTADO_WS.hunt_t = Date.now();
            RAZAO = razaoNovo();
            ESTADO_WS.frame = ESTADO_WS.frame || { t: Date.now(), cap: null, balance: null, lureTier: null, active: [] };
            if (ehBoss) {
                ESTADO_WS.boss = bossId || ESTADO_WS.boss || '?';
                if (bossId) { guardar('boss_nome', bossId); }
                log('boss em andamento (socket): ' + ESTADO_WS.boss, 'ok');
            } else {
                ESTADO_WS.boss = null;
                const h = (CAT.hunts || []).find(x => x.id === d.huntId);
                if (h) {
                    const antes = ler('hunt_id', null);
                    guardar('hunt_id', h.id); guardar('hunt_manual', h.id);
                    _huntCache = { t: 0, val: null };
                    if (antes !== h.id) log('hunt pelo socket: ' + h.title + (d.lure ? ' · lure ' + d.lure : ''), 'ok');
                }
            }
            renderizar();
            return;
        }
        if (o.type === 'error') {
            ESTADO_WS.ultimoErro = (d.code || d.key || JSON.stringify(d)).toString();
            log('servidor respondeu erro: ' + ESTADO_WS.ultimoErro, 'erro');
            return;
        }
        if (o.type === 'ended' || o.type === 'exit_pending') {
            if (o.type === 'ended') {
                ESTADO_WS.boss = null; ESTADO_WS.ultimoStart = null; ESTADO_WS.frame = null; ESTADO_WS.party = [];
                const sm = d.summary || {};
                if (sm.huntId != null && (CAT.hunts || []).some(x => x.id === sm.huntId)) { guardar('hunt_id', sm.huntId); guardar('hunt_manual', sm.huntId); }
            }
            return;
        }
    }

    function lerExpTotal() {
        // "EXP 1.868.791 / 1.965.000" — aria-label ou texto
        const el = tid('rail-level-xp-pair');
        const txt = el ? (el.getAttribute('aria-label') || el.textContent || '') : '';
        const m = txt.replace(/\./g, '').match(/(\d+)\s*\/\s*(\d+)/);
        return m ? { atual: +m[1], proximo: +m[2] } : null;
    }
    /* Acha UMA vez o elemento-folha que mostra "N abates" e guarda a
     * referência. innerText do body custa relayout completo; textContent de um
     * nó conhecido custa nada. Se o nó sair da árvore (troca de tela), procura
     * de novo — no máximo uma varredura por troca, não uma por amostra. */
    let _noAbates = null, _reabriuAnalyzerEm = 0;
    function lerAbates() {
        const bom = (el) => el && el.isConnected && /\d+\s*abates/i.test(el.textContent || '');
        if (!bom(_noAbates)) {
            _noAbates = null;
            /* ⚠ O CONTADOR SO EXISTE COM A JANELA "ESTATISTICAS DA CACA" ABERTA.
             * Fechada (o "x" dela e vizinho de outros fechar), toda sessao sai
             * sem abates e sem ponto de calibracao. hud-analyzer reabre. */
            if (!tid('analyzer-session') && tid('hud-analyzer') && Date.now() - _reabriuAnalyzerEm > 60000) {
                _reabriuAnalyzerEm = Date.now();
                try { tid('hud-analyzer').click(); } catch (e) { }
                return null;   // a janela monta no proximo tick
            }
            /* o contador vive na janela "Estatisticas da caca" (data-testid
             * analyzer-session, mapeado em 19/09). Procurar so dentro dela: e
             * barato e nao confunde com "abates" de outro texto da pagina. */
            const raiz = tid('analyzer-session') || document;
            const cands = raiz.querySelectorAll('div,span,p');
            for (let i = 0; i < cands.length; i++) {
                const e = cands[i];
                if (e.children.length === 0 && /^\s*[\d.]+\s*abates\s*$/i.test(e.textContent || '')) { _noAbates = e; break; }
            }
        }
        if (!_noAbates) return null;
        const m = (_noAbates.textContent || '').match(/([\d.]+)/);
        return m ? parseInt(m[1].replace(/\./g, '')) : null;
    }
    function lerMochilaOz() {
        /* "398,2 / 1.897oz" — o TOTAL é o cap real da conta (muda com nível e
         * equipamento), nunca um número fixo. A vírgula decimal é opcional:
         * "0 / 1.897oz" também precisa ler, senão o gatilho nunca dispara. */
        if (frameFresco() && ESTADO_WS.frame.cap && ESTADO_WS.frame.cap.total) {
            const c = ESTADO_WS.frame.cap;
            return { usado: Number(c.used) || 0, total: Number(c.total), pct: (Number(c.used) || 0) / Number(c.total) };
        }
        const t = (tid('rail-backpack-cap') || {}).textContent || '';
        const m = t.match(/([\d.]+)(?:,(\d+))?\s*\/\s*([\d.]+)/);
        if (!m) return null;
        const usado = parseFloat(m[1].replace(/\./g, '') + '.' + (m[2] || '0'));
        const total = parseFloat(m[3].replace(/\./g, ''));
        return { usado, total, pct: total ? usado / total : 0 };
    }

    /* =========================================================================
     *  ⭐ AUTO HUNT (v1.9.0) — mochila cheia → finalizar, purificar, vender,
     *  depot, voltar. Pedido do dono em 27/09 com os prints do Stonegy Helper
     *  (telas "Auto Hunt" e "Status"). Motivo: o Auto Selling 18h/dia vence em
     *  ~28/09; depois disso volta a 6h/dia e a mochila enche (~140 oz/h no
     *  nível 42, mais agora).
     *
     *  Decisões do dono (27/09): ciclo completo; "Purificar todos" é grátis e
     *  sem confirmação; vende TUDO que o painel do NPC marcar; lure NÃO é
     *  restaurado ao voltar; magia não é tocada. Qualquer falha desliga a
     *  automação — nunca ficar em loop na cidade.
     * ====================================================================== */
    const AUTO_HUNT_PADRAO = { on: false, modo: 'pct', pct: 20, oz: 200, voltar: true, huntId: null };
    const autoHunt = () => Object.assign({}, AUTO_HUNT_PADRAO, ler('auto_hunt', {}));
    const guardarAutoHunt = (patch) => guardar('auto_hunt', Object.assign(autoHunt(), patch));

    function capLivre() {
        const m = lerMochilaOz();
        if (!m) return null;
        const oz = Math.round((m.total - m.usado) * 10) / 10;
        return { oz, pct: Math.round((1 - m.pct) * 100), total: m.total, usado: m.usado,
                 ozTxt: oz.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
                 totalTxt: m.total.toLocaleString('pt-BR') };
    }
    function mochilaNoLimite() {
        const c = capLivre(), a = autoHunt();
        if (!c) return false;
        return a.modo === 'oz' ? c.oz <= a.oz : c.pct <= a.pct;
    }
    /* Taxa XP = EXP/h ÷ EXP raw/h da janela "Estatísticas da caça". Os dois
     * números só existem com a janela aberta e a party caçando. */
    function lerTaxaXp() {
        const w = tid('analyzer-session');
        const raiz = w ? (w.closest('[data-testid^="window"]') || w.parentElement || w) : null;
        const t = raiz ? (raiz.innerText || '') : '';
        const num = s => { const m = t.match(new RegExp(s + '\\s*\\n\\s*([\\d.,]+)\\s*(k?)', 'i')); if (!m) return null; let v = parseFloat(m[1].replace(/\./g, '').replace(',', '.')); if (m[2]) v *= 1000; return v; };
        const exp = num('EXP/H'), raw = num('EXP RAW/H');
        if (!exp || !raw) return null;
        return Math.round(exp / raw * 100);
    }
    function modalAberto() {
        return !!tid('slot-config-modal') || !!$('.s-modal-scrim') || !!tid('summary-close');
    }

    /* Passo 1 — ENCERRAR. `stop` encerra; o resumo pós-caçada abre com um
     * scrim que bloqueia todo clique seguinte (8b) — fechar com summary-close. */
    async function finalizarHunt() {
        const b = tid('stop');
        if (!b) return { erro: 'botão de encerrar (stop) não está na tela — já fora da caçada?' };
        b.click();
        const fechar = await esperarQue(() => tid('summary-close') || $$('.s-modal-scrim [data-testid="panel-close"]')[0], 15000, 200);
        if (fechar) { fechar.click(); await dorme(500); }
        const saiu = await esperarQue(() => !emHunt() && tid('actionbar-selling'), 15000, 300);
        if (!saiu) return { erro: 'encerrei mas a barra da cidade (actionbar-selling) não apareceu' };
        log('caçada encerrada' + (fechar ? ' (resumo fechado)' : ''), 'ok');
        return { ok: true };
    }

    /* Passo 2 — PURIFICAR TODOS. Grátis e sem confirmação (dono, 27/09).
     * Mapeado ao vivo em 27/09, NA CIDADE (dentro da caçada o botão direito
     * não abre menu nenhum):
     *   backpack-slot-<nome> > item-cell-<nome> > item-selado-<nome> (span)
     *   botão direito → item-ctx (.s-ctx-menu) com ctx-linkar-chat,
     *   ctx-purificar, ctx-purificar-todos, ctx-protect, ctx-discard.
     * ⚠ NUNCA procurar "purificar todos" por texto: a frase de ajuda da aba
     * Auto Hunt contém exatamente isso e o clique cairia no painel. */
    function itemSelado() {
        return $('[data-testid^="item-selado-"]')
            || $$('[data-testid^="backpack-slot-"]').find(e => /SELADO/i.test(e.textContent || ''));
    }
    function botaoDireito(el) {
        const r = el.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
        try { el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ pointerType: 'mouse', isPrimary: true }, o))); } catch (e) { }
        el.dispatchEvent(new MouseEvent('mousedown', o));
        try { el.dispatchEvent(new PointerEvent('pointerup', Object.assign({ pointerType: 'mouse', isPrimary: true }, o))); } catch (e) { }
        el.dispatchEvent(new MouseEvent('mouseup', o));
        el.dispatchEvent(new MouseEvent('contextmenu', o));
    }
    async function purificarTodos() {
        const toggle = tid('rail-backpack-toggle');
        if (toggle && !$$('[data-testid^="backpack-slot-"]').length) { toggle.click(); await dorme(500); }
        /* 27/09: no ciclo automático, logo depois de o resumo da caçada
         * fechar, a mochila ainda estava repintando e uma crossbow SELADA não
         * foi vista. Espera até 2,5 s pelo selo antes de dizer que não há. */
        const sel = await esperarQue(itemSelado, 2500, 150);
        if (!sel) return { pulou: 'nenhum item selado na mochila' };
        const celula = sel.closest('[data-testid^="backpack-slot-"]') || sel;
        botaoDireito(celula);
        const item = await esperarQue(() => tid('ctx-purificar-todos'), 3000, 100);
        if (!item) {
            document.body.click();
            return { pulou: 'menu do botão direito não abriu (ctx-purificar-todos ausente) — só funciona na cidade' };
        }
        const antes = $$('[data-testid^="item-selado-"]').length;
        item.click();
        await esperarQue(() => !itemSelado(), 10000, 300);
        const depois = $$('[data-testid^="item-selado-"]').length;
        log(depois ? `purifiquei ${antes - depois} de ${antes} selados (sobraram ${depois})` : `todos os ${antes} selados purificados`, depois ? 'erro' : 'ok');
        return { ok: true, antes, depois };
    }

    /* Clique "de verdade": alguns botões do jogo (sell-confirm, medido em
     * 27/09) ignoram element.click() e só respondem à sequência completa de
     * ponteiro. Dispara tudo, na ordem que o navegador dispararia. */
    function cliqueCompleto(el) {
        const r = el.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
        try { el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ pointerType: 'mouse', isPrimary: true }, o))); } catch (e) { }
        el.dispatchEvent(new MouseEvent('mousedown', o));
        try { el.dispatchEvent(new PointerEvent('pointerup', Object.assign({ pointerType: 'mouse', isPrimary: true, buttons: 0 }, o))); } catch (e) { }
        el.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, o, { buttons: 0 })));
        el.dispatchEvent(new MouseEvent('click', Object.assign({}, o, { buttons: 0 })));
    }
    const lerOuroNum = () => parseInt(((tid('hud-gold') || {}).textContent || '').replace(/\D/g, '')) || 0;

    /* Passo 3 — VENDER NO NPC. Vende tudo que o painel marcar (dono, 27/09).
     * Âncoras (27/09): sell-panel, sell-list, sell-row-<item>, sell-check-<item>,
     * sell-total, sell-confirm ("VENDER N ouro"), sell-cancel, panel-close.
     * ⚠ Em 27/09 o primeiro teste clicou em sell-confirm com .click() e NADA
     * aconteceu: painel aberto, ouro igual. Por isso: clique completo, espera
     * por confirm-ok (se o jogo pedir), e o sucesso é medido pelo OURO. */
    async function venderNoNpc() {
        const abrir = tid('actionbar-selling');
        if (!abrir) return { erro: 'botão VENDER (actionbar-selling) não está na tela — precisa estar na cidade' };
        abrir.click();
        const painel = await esperarQue(() => tid('sell-panel'), 6000, 150);
        if (!painel) return { erro: 'painel de venda não abriu' };
        await dorme(500);
        const total = ((tid('sell-total') || {}).textContent || '?').trim();
        const totalNum = parseInt(total.replace(/\D/g, '')) || 0;
        const fecharPainel = () => { const c = tid('sell-cancel') || (tid('sell-panel') && tid('sell-panel').querySelector('[data-testid="panel-close"]')); if (c) c.click(); };
        const confirmar = tid('sell-confirm');
        if (!confirmar || confirmar.disabled || !totalNum) {
            fecharPainel();
            await dorme(400);
            log('nada para vender (total ' + total + ')', 'info');
            return { ok: true, vazio: true };
        }
        const ouroAntes = lerOuroNum();
        const vendeu = () => lerOuroNum() > ouroAntes;
        // 1ª tentativa: clique completo no botão
        cliqueCompleto(confirmar);
        let ok = await esperarQue(() => vendeu() || tid('confirm-ok'), 2500, 150);
        if (ok && !vendeu() && tid('confirm-ok')) { cliqueCompleto(tid('confirm-ok')); ok = await esperarQue(vendeu, 5000, 200); }
        // 2ª tentativa: .click() simples (caso o jogo escute só o click)
        if (!vendeu() && tid('sell-confirm')) { tid('sell-confirm').click(); ok = await esperarQue(() => vendeu() || tid('confirm-ok'), 2500, 150); if (tid('confirm-ok')) { tid('confirm-ok').click(); ok = await esperarQue(vendeu, 5000, 200); } }
        if (!vendeu()) {
            fecharPainel();
            await dorme(400);
            return { erro: `cliquei em VENDER (${total} ouro) e o ouro não mudou — painel fechado, nada vendido` };
        }
        await esperarQue(() => !tid('sell-panel'), 4000, 200);
        if (tid('sell-panel')) fecharPainel();
        await dorme(400);
        log(`vendido no NPC: ${total} ouro · ${ouroAntes.toLocaleString('pt-BR')} → ${lerOuroNum().toLocaleString('pt-BR')}`, 'ok');
        return { ok: true, total: totalNum };
    }

    /* Passo 4 — DEPOT: guardar tudo. Âncoras (27/09): depot-panel (modal com
     * scrim), depot-guardar-tudo, depot-guardar-tudo-nota, depot-lugares
     * ("113 de 300"), panel-close dentro do depot-panel. */
    async function guardarNoDepot() {
        const abrir = tid('actionbar-depot');
        if (!abrir) return { erro: 'botão DEPOT (actionbar-depot) não está na tela' };
        abrir.click();
        const tudo = await esperarQue(() => tid('depot-guardar-tudo'), 6000, 150);
        if (!tudo) return { erro: 'janela do depot não abriu (depot-guardar-tudo ausente)' };
        await dorme(400);
        const antes = lerMochilaOz();
        if (!tudo.disabled) {
            tudo.click();
            await esperarQue(() => { const m = lerMochilaOz(); return m && antes && m.usado < antes.usado; }, 6000, 200);
        }
        const depois = lerMochilaOz();
        const lugares = ((tid('depot-lugares') || {}).textContent || '').trim();
        const painel = tid('depot-panel');
        const fechar = (painel && painel.querySelector('[data-testid="panel-close"]')) || tid('panel-close');
        if (fechar) fechar.click();
        await esperarQue(() => !tid('depot-panel'), 3000, 150);
        await dorme(300);
        log(`depot: mochila ${antes ? antes.usado.toLocaleString('pt-BR') : '?'} → ${depois ? depois.usado.toLocaleString('pt-BR') : '?'} oz` + (lugares ? ` · depot ${lugares}` : ''), 'ok');
        if (tid('depot-panel')) return { erro: 'janela do depot não fechou' };
        return { ok: true };
    }

    /* Passo 5 — VOLTAR para a hunt memorizada. hunt-item-<id> + hunt-confirm
     * (na cidade o card diz "Jogar aqui"; o confirm é o mesmo, 19/09). */
    async function voltarParaHunt(id) {
        /* 27/09: na cidade a barra tem actionbar-hunt (JOGAR), -train, -selling
         * e -depot; actionbar-explore (CAÇADAS) só existe dentro da caçada. */
        const abrir = tid('actionbar-hunt') || tid('actionbar-explore');
        if (!abrir) return { erro: 'botão JOGAR/CAÇADAS não está na tela' };
        abrir.click();
        let card = await esperarQue(() => tid('hunt-item-' + id), 4000, 200);
        /* v2.1.2 — A TELA DE CAÇADAS É POR ILHA. Testado em 27/09 22:30: na
         * cidade ela abre em Tibidle Island e o card de Pirates Yalahar (ilha
         * "yalahar") não existe no DOM até clicar na aba da ilha. O catálogo
         * traz `island` com o mesmo nome da âncora explore-ilha-<island>;
         * sem catálogo, tenta cada aba de ilha até o card aparecer. */
        if (!card) {
            const h = (CAT.hunts || []).find(x => x.id === id);
            const abas = [];
            if (h && h.island && tid('explore-ilha-' + h.island)) abas.push(tid('explore-ilha-' + h.island));
            $$('[data-testid^="explore-ilha-"]').forEach(a => { if (!abas.includes(a)) abas.push(a); });
            for (const aba of abas) {
                aba.click();
                card = await esperarQue(() => tid('hunt-item-' + id), 2500, 150);
                if (card) { log('hunt ' + id + ' fica na ilha ' + (aba.getAttribute('data-testid') || '').replace('explore-ilha-', ''), 'info'); break; }
            }
        }
        if (!card) { const v = tid('screen-hunts-back'); if (v) v.click(); return { erro: 'card da hunt ' + id + ' não apareceu em nenhuma ilha da tela de caçadas' }; }
        card.click();
        const conf = await esperarQue(() => { const b = tid('hunt-confirm'); return b && !b.disabled ? b : null; }, 6000, 150);
        if (!conf) { const v = tid('screen-hunts-back'); if (v) v.click(); return { erro: 'botão de confirmar a caçada não habilitou' }; }
        conf.click();
        const dentro = await esperarQue(() => emHunt(), 20000, 400);
        if (!dentro) return { erro: 'confirmei a caçada mas o botão de encerrar não apareceu' };
        guardar('hunt_id', id); guardar('hunt_manual', id);
        log('de volta à caçada (id ' + id + ')', 'ok');
        return { ok: true };
    }

    let _cicloEmCurso = false, _ultimoCiclo = 0;
    const CICLO_INTERVALO_MIN_MS = 5 * 60 * 1000;

    /* v1.9.8 — TRAVA ENTRE ABAS. Em 27/09 duas abas do mesmo perfil rodavam
     * o helper (a do dono e a do Playwright) e as duas viam o mesmo gatilho:
     * uma encerrou a caçada, a outra achou a party na cidade no meio do
     * ciclo. A trava vive no localStorage (compartilhado entre abas) e vale
     * 2 min — se a aba dona morrer no meio, a outra retoma depois disso. */
    const CICLO_LOCK_MS = 2 * 60 * 1000;
    const ABA_ID = Math.random().toString(36).slice(2, 8);
    function cicloTravadoPorOutraAba() {
        const l = ler('ciclo_lock', null);
        return !!(l && l.aba !== ABA_ID && Date.now() - l.t < CICLO_LOCK_MS);
    }

    /* origem: 'auto' (gatilho da mochila: passos 1-5), 'venda' (botão Venda
     * rápida: passos 1-4 — encerra se estiver caçando — e FICA na cidade) ou
     * 'finalizar' (botão Finalizar hunt: só o passo 1). Decisão do dono em
     * 27/09: "Venda rápida completa: um clique dentro da hunt encerra,
     * purifica, vende, guarda e fica na cidade". */
    async function cicloDeVenda(origem) {
        if (_cicloEmCurso) { log('ciclo já em andamento', 'erro'); return false; }
        if (_aprendendo) { log('medindo dano — ciclo adiado', 'erro'); return false; }
        if (cicloTravadoPorOutraAba()) { log('outra aba do jogo está rodando o ciclo — esta aba fica quieta', 'erro'); return false; }
        _cicloEmCurso = true;
        guardar('ciclo_lock', { aba: ABA_ID, t: Date.now() });
        renderizar();
        const a = autoHunt();
        const desligar = (passo, erro) => {
            log(`AUTO HUNT parou no passo "${passo}": ${erro}` + (a.on ? ' — automação DESLIGADA' : ''), 'erro');
            if (a.on) guardarAutoHunt({ on: false });
        };
        try {
            const c = capLivre();
            log(`ciclo de venda (${origem}) iniciado — mochila ${c ? c.pct + '% livre' : '?'}`, 'info');
            /* Já na cidade (ciclo retomado depois de uma recarga, ou Venda
             * rápida fora da hunt): pula o encerrar em vez de falhar. */
            if (origem === 'finalizar' || emHunt()) {
                const r1 = await finalizarHunt();
                if (r1.erro) { desligar('finalizar', r1.erro); return false; }
                if (origem === 'finalizar') return true;
                await dorme(800);                       // a cidade termina de montar
            }
            const r2 = await purificarTodos();
            if (r2.pulou) log('purificar: ' + r2.pulou + ' (pulei)', 'info');
            const r3 = await venderNoNpc();
            if (r3.erro) { desligar('vender', r3.erro); return false; }
            const r4 = await guardarNoDepot();
            if (r4.erro) { desligar('depot', r4.erro); return false; }
            if (origem === 'auto' && a.voltar) {
                if (a.huntId == null) { desligar('voltar', 'nenhuma hunt memorizada'); return false; }
                const r5 = await voltarParaHunt(a.huntId);
                if (r5.erro) { desligar('voltar', r5.erro); return false; }
            }
            log('ciclo de venda terminado', 'ok');
            return true;
        } catch (e) {
            desligar('inesperado', e.message);
            return false;
        } finally {
            _cicloEmCurso = false; _ultimoCiclo = Date.now();
            guardar('ciclo_lock', null);
            renderizar();
        }
    }

    /* v1.9.7 — POR QUE NÃO DISPAROU. Em 27/09 o dono ligou a chave com 97 %
     * e nada aconteceu: era a trava de 5 min (a Venda rápida de instantes
     * antes contou como ciclo). A tela agora diz o motivo, com contagem. */
    function motivoNaoDispara() {
        const a = autoHunt();
        if (!a.on) return 'chave desligada';
        if (SCAN.ativo) return 'Scan em andamento';
        if (a.huntId == null) return 'nenhuma hunt memorizada';
        if (_cicloEmCurso) return 'ciclo em andamento';
        if (_aprendendo) return 'medindo dano das magias';
        if (cicloTravadoPorOutraAba()) return 'outra aba do jogo está rodando o ciclo';
        if (!emHunt()) return 'party fora da caçada';
        if (modalAberto()) return 'uma janela do jogo está aberta';
        const resta = CICLO_INTERVALO_MIN_MS - (Date.now() - _ultimoCiclo);
        if (resta > 0) return `trava de 5 min após o último ciclo — libera em ${Math.ceil(resta / 1000)} s`;
        if (!mochilaNoLimite()) return null;            // tudo pronto, só esperando a mochila
        return '';                                      // dispara agora
    }
    function gatilhoAutoHunt() {
        if (motivoNaoDispara() !== '') return;
        cicloDeVenda('auto');
    }

    /* =========================================================================
     *  ⭐ v2.2.0 — SCAN (pedido do dono, 27/09 23h): "seleciono alguns mapas,
     *  ele entra, põe Equilibrado, fica 5 min em cada com o maior lure e mede,
     *  pra eu saber qual vale pra upar, pra ouro ou os dois. Sem modal; só eu
     *  ligo e desligo."
     *
     *  Tudo pelo socket: start_hunt {huntId, lure: <índice do último tier>}
     *  troca de mapa sem tela (o cliente faz o mesmo ao clicar em JOGAR AQUI),
     *  o plano vai por update_battle_config/profiles_set (2.1.0), e a medição
     *  é o `frame.analyzer` do próprio jogo (xp, xpPerHour, killsTotal,
     *  lootGold, suppliesGold) em delta entre a entrada e o fim dos N minutos —
     *  o mesmo número que o resumo pós-caçada mostra, sem esperar o resumo.
     *  ⚠ Ao trocar de mapa o jogo abre o resumo da caçada anterior; o Scan
     *  fecha esse resumo sozinho (summary-close) — é a única janela que pisca.
     *  Estado próprio (scan_cfg / scan_resultados): não mexe em hunt_id,
     *  modelo escolhido, Auto Hunt nem nas sessões do Analisador.
     * ====================================================================== */
    const SCAN_PADRAO = { mapas: [], minutos: 5, lureMax: true, fim: 'ficar', modelo: 'equilibrado', comparar: false,
                          variantes: ['inteligente', 'equilibrado', 'economica'] };   // comparar: cada mapa × cada variante (estudo)
    const scanCfg = () => Object.assign({}, SCAN_PADRAO, ler('scan_cfg', {}));
    const guardarScanCfg = (patch) => guardar('scan_cfg', Object.assign(scanCfg(), patch));
    const scanResultados = () => ler('scan_resultados', {});
    const SCAN = { ativo: false, fila: [], idx: -1, huntId: null, fase: 'parado', t0: 0, base: null, vivo: null, capMin: 100, erro: null, ocupado: false, iniciadoEm: 0 };
    const CAP_MIN_SCAN = 10;                        // abaixo disso o loot se perde e a medição sai suja

    function scanIniciar() {
        const c = scanCfg();
        const ids = c.mapas.filter(id => (CAT.hunts || []).some(h => h.id === id));
        const modelos = c.comparar ? (c.variantes || []).filter(m => MODELOS[m] || VARIANTES[m]) : [c.modelo || 'equilibrado'];
        const fila = [];
        for (const id of ids) for (const modelo of modelos) fila.push({ id, modelo });
        if (!fila.length) { log('Scan: marque pelo menos um mapa' + (c.comparar ? ' e uma variante' : ''), 'erro'); return false; }
        if (!socketAberto() || !ESTADO_WS.profiles) { log('Scan: socket sem perfis — dá um F5 com o helper instalado', 'erro'); return false; }
        if (_cicloEmCurso) { log('Scan: ciclo de venda em andamento — espera terminar', 'erro'); return false; }
        if (ESTADO_WS.boss) { log('Scan: boss em andamento — termina o boss antes', 'erro'); return false; }
        Object.assign(SCAN, { ativo: true, fila, idx: -1, huntId: null, fase: 'proximo', t0: 0, base: null, vivo: null, capMin: 100, erro: null, ocupado: false, iniciadoEm: Date.now() });
        log(`Scan LIGADO — ${fila.length} medição(ões), ${c.minutos} min cada, lure ${c.lureMax ? 'máximo' : 'como está'}, ${c.comparar ? 'estudo: ' + modelos.map(nomeModelo).join(' · ') : nomeModelo(c.modelo || 'equilibrado')}`, 'ok');
        renderizar();
        return true;
    }
    function scanParar(motivo, tipo) {
        if (!SCAN.ativo) return;
        SCAN.ativo = false; SCAN.fase = 'parado'; SCAN.huntId = null; SCAN.base = null; SCAN.vivo = null;
        log('Scan desligado' + (motivo ? ': ' + motivo : ''), tipo || 'info');
        renderizar();
    }
    const scanHuntAtual = () => (SCAN.idx >= 0 && SCAN.idx < SCAN.fila.length) ? (CAT.hunts || []).find(h => h.id === SCAN.fila[SCAN.idx].id) : null;
    const scanModeloAtual = () => (SCAN.idx >= 0 && SCAN.idx < SCAN.fila.length) ? SCAN.fila[SCAN.idx].modelo : (scanCfg().modelo || 'equilibrado');
    /* v2.2.3 — lure em MONSTROS, como o jogo mostra: tier 3/3 do Barbarian = 7 */
    const lureTexto = (h, tier) => { const t = h && h.lureTiers && h.lureTiers[(tier || 1) - 1]; return t ? `${t.max}${h.lureTiers.length > 1 ? ' (tier ' + tier + '/' + h.lureTiers.length + ')' : ''}` : String(tier || '?'); };
    const anAgora = () => (frameFresco() && ESTADO_WS.frame.an) ? ESTADO_WS.frame.an : null;
    /* v2.3.0 — LOOT ESTÁVEL × LOTERIA. Em 5 min um drop de 500 vira +6k/h
     * que não se repete. O analisador do jogo manda `drops` {item: n} e a
     * tabela de loot dá valor e chance de cada item (conferido em 27/09:
     * Σ n × valor = lootGold, ao centavo). Regra: moeda é sempre ESTÁVEL; um
     * item é estável se o catálogo espera pelo menos 3 quedas dele NOS ABATES
     * DA JANELA (abates × chance ≥ 3). Menos que isso é LOTERIA: sai da conta
     * e aparece à parte como "sorte".
     * v2.3.1 — era "chance ≥ 1%" fixo; com 28 abates uma shiny stone de 500
     * (1,56%) entrou como estável, e o catálogo esperava 0,4 dela. O limiar
     * tem que crescer com a janela: 3 esperadas em 60 abates é 5%, em 180 é
     * 1,7%. ⚠ O catálogo superestima a chance dos itens de codex (TIBIDLE.md
     * §12), por isso NÃO uso a chance para prever ouro — só para classificar. */
    const QUEDAS_ESPERADAS_MIN = 3;
    function scanDividirLoot(huntId, dDrops, kills) {
        const tab = LOOT_TABELA[huntId];
        if (!tab) return null;
        const porNome = {}; tab.forEach(i => { if (i && i.name) porNome[i.name] = i; });
        let estavel = 0, sorte = 0; const raros = [];
        Object.keys(dDrops || {}).forEach(k => {
            const n = dDrops[k]; if (!(n > 0)) return;
            const it = porNome[k], tot = n * (it ? (Number(it.value) || 0) : 0);
            const esperadas = it ? (Number(kills) || 0) * (Number(it.chance) || 0) / 100000 : 0;
            if (it && (it.currency || esperadas >= QUEDAS_ESPERADAS_MIN)) estavel += tot;
            else { sorte += tot; if (tot) raros.push(k + ' ×' + n); }
        });
        return { estavel, sorte, raros };
    }
    const fmtHoras = h => !(h > 0) || !isFinite(h) ? '—' : h < 1 ? Math.round(h * 60) + 'min' : h < 48 ? Math.floor(h) + 'h' + String(Math.round((h % 1) * 60)).padStart(2, '0') : (h / 24).toFixed(1) + 'd';
    function xpFaltando() { const p = lerExpTotal(); return p && p.proximo > p.atual ? p.proximo - p.atual : null; }
    function scanMedidaViva() {
        const a = anAgora(), b = SCAN.base;
        if (!a || !b) return null;
        const seg = Math.max(1, (Date.now() - SCAN.t0) / 1000);
        const d = { xp: a.xp - b.xp, kills: a.kills - b.kills, loot: a.lootGold - b.lootGold, sup: a.suppliesGold - b.suppliesGold, xpRaw: a.xpRaw - b.xpRaw,
                    tomado: (a.damageTaken || 0) - (b.damageTaken || 0), dado: (a.damageDealt || 0) - (b.damageDealt || 0), cura: (a.healingDone || 0) - (b.healingDone || 0) };
        /* poção por personagem: delta de supplyUsed entre a base e agora */
        const pf = (ESTADO_WS.frame && ESTADO_WS.frame.party) || [], pb = SCAN.baseParty || [];
        const supVoc = {};
        for (const p of pf) { const b0 = pb.find(x => x.voc === p.voc); const g = p.suppliesGold - (b0 ? b0.suppliesGold : 0); const itens = {}; for (const [n, u] of Object.entries(p.supplyUsed || {})) { const c0 = b0 && b0.supplyUsed && b0.supplyUsed[n] ? b0.supplyUsed[n].count : 0; const dc = (u.count || 0) - c0; if (dc > 0) itens[n] = dc; } supVoc[p.voc] = { ouro: g, itens }; }
        const dDrops = {}; Object.keys(a.drops || {}).forEach(k => { const n = (a.drops[k] || 0) - ((b.drops || {})[k] || 0); if (n > 0) dDrops[k] = n; });
        const div = scanDividirLoot(SCAN.huntId, dDrops, d.kills);
        const porH = x => Math.round(x / seg * 3600);
        return { seg, xpH: porH(d.xp), abatesH: porH(d.kills), lootH: porH(d.loot), supH: porH(d.sup), ouroH: porH(d.loot - d.sup),
                 estavelH: div ? porH(div.estavel - d.sup) : null, sorte: div ? div.sorte : null, sorteH: div ? porH(div.sorte) : null, raros: div ? div.raros : [],
                 tomadoH: porH(d.tomado), dadoH: porH(d.dado), curaH: porH(d.cura), supVoc, razao: razaoResumo(RAZAO),
                 xp: d.xp, kills: d.kills, loot: d.loot, sup: d.sup, xpRaw: d.xpRaw };
    }
    async function scanEntrar(h) {
        const c = scanCfg();
        const lure = (c.lureMax && h.lureTiers && h.lureTiers.length) ? h.lureTiers.length : 1;
        const jaNele = ESTADO_WS.huntId === h.id && frameFresco() && !ESTADO_WS.boss;
        if (!jaNele) {
            /* v2.2.2 — de DENTRO de uma caçada o servidor recusa start_hunt
             * ("already_hunting"). O cliente faz: stop → espera ended →
             * start_hunt. O `ended` abre o resumo; fecha-se em seguida. */
            if (frameFresco() && ESTADO_WS.huntId != null) {
                enviarWS({ type: 'stop', data: {} });
                const saiu = await esperarQue(() => !frameFresco() || tid('summary-close'), 25000, 250);
                const fecharR = await esperarQue(() => tid('summary-close'), 3000, 150);
                if (fecharR) fecharR.click();
                if (!saiu) return { erro: 'mandei stop e a caçada não encerrou em 25 s' };
                await dorme(600);
            }
            const t = Date.now();
            ESTADO_WS.ultimoErro = null;
            enviarWS({ type: 'start_hunt', data: { huntId: h.id, lure } });
            const ok = await esperarQue(() => ESTADO_WS.huntId === h.id && ESTADO_WS.hunt_t >= t, 20000, 250);
            /* o resumo da caçada anterior abre ao trocar — fecha sem ninguém ver */
            const fechar = await esperarQue(() => tid('summary-close'), 2500, 150);
            if (fechar) { fechar.click(); }
            if (!ok) return { erro: 'start_hunt enviado e o servidor não confirmou a entrada em 20 s' + (ESTADO_WS.ultimoErro ? ' (erro do servidor: ' + ESTADO_WS.ultimoErro + ')' : '') };
        } else if (c.lureMax) {
            try { await lureNoMaximoSocket(h); } catch (e) { }
        }
        await esperarQue(() => frameFresco() && ESTADO_WS.frame.an, 8000, 250);
        return { ok: true, lure };
    }
    async function scanPasso() {
        if (!SCAN.ativo || SCAN.ocupado) return;
        SCAN.ocupado = true;
        try {
            if (!socketAberto()) { SCAN.erro = 'socket fechado'; return; }
            if (ESTADO_WS.boss) { scanParar('boss em andamento — retome quando terminar', 'erro'); return; }
            if (_cicloEmCurso) { scanParar('ciclo de venda em andamento', 'erro'); return; }
            if (SCAN.fase === 'proximo') {
                SCAN.idx++;
                if (SCAN.idx >= SCAN.fila.length) { await scanTerminar(); return; }
                const h = scanHuntAtual();
                SCAN.huntId = h.id; SCAN.fase = 'entrando'; SCAN.base = null; SCAN.capMin = 100; SCAN.erro = null;
                log(`Scan ${SCAN.idx + 1}/${SCAN.fila.length}: entrando em ${h.title}…`, 'info');
                renderizar();
                const r = await scanEntrar(h);
                if (r.erro) { scanGravar(h, null, r.erro); SCAN.fase = 'proximo'; log(`Scan: ${h.title} pulado — ${r.erro}`, 'erro'); return; }
                await dorme(1500);
                try { await lootTabela(h.id); } catch (e) { }
                try { await bestiarioHunt(h); } catch (e) { }
                try { await aplicarEmTodos(scanModeloAtual(), h); } catch (e) { log('Scan: aplicar falhou — ' + e.message, 'erro'); }
                /* v2.2.1 — zera o analisador do jogo antes de medir: é o mesmo
                 * frame que o botão "zerar" da janela Estatísticas manda. Assim
                 * o mapa em que a party já estava não entra com o passado. */
                try { const an0 = anAgora(); enviarWS({ type: 'analyzer_reset', data: {} }); await esperarQue(() => { const a = anAgora(); return a && (!an0 || a.elapsedMs < an0.elapsedMs || a.kills < an0.kills); }, 5000, 200); } catch (e) { }
                await esperarQue(() => frameFresco() && ESTADO_WS.frame.an, 6000, 250);
                const a = anAgora();
                if (!a) { scanGravar(h, null, 'sem analisador no frame'); SCAN.fase = 'proximo'; return; }
                SCAN.base = Object.assign({}, a); SCAN.baseParty = clonar((ESTADO_WS.frame && ESTADO_WS.frame.party) || []); SCAN.t0 = Date.now(); SCAN.fase = 'medindo'; RAZAO = razaoNovo();
                log(`Scan: medindo ${h.title} por ${scanCfg().minutos} min (lure ${lureTexto(h, r.lure)}, ${nomeModelo(scanModeloAtual())})`, 'ok');
                renderizar();
                return;
            }
            if (SCAN.fase === 'medindo') {
                const h = scanHuntAtual();
                if (ESTADO_WS.huntId !== h.id) { scanParar('a party saiu de ' + h.title + ' por fora do Scan', 'erro'); return; }
                const aAgora = anAgora();
                if (aAgora && SCAN.base && (aAgora.kills < SCAN.base.kills || aAgora.elapsedMs < SCAN.base.elapsedMs)) {
                    SCAN.base = Object.assign({}, aAgora); SCAN.baseParty = clonar((ESTADO_WS.frame && ESTADO_WS.frame.party) || []); SCAN.t0 = Date.now(); SCAN.vivo = null; RAZAO = razaoNovo();
                    log('Scan: o analisador do jogo foi zerado no meio — recomeçando a medição de ' + h.title, 'info');
                }
                const cap = capLivre(); if (cap && cap.pct < SCAN.capMin) SCAN.capMin = cap.pct;
                SCAN.vivo = scanMedidaViva();
                if (Date.now() - SCAN.t0 >= scanCfg().minutos * 60000) {
                    const m = scanMedidaViva();
                    scanGravar(h, m, null);
                    log(`Scan: ${h.title} [${nomeModelo(scanModeloAtual())}] — ${m ? (m.xpH / 1000).toFixed(1) + 'k xp/h · ' + (m.ouroH >= 0 ? '+' : '') + m.ouroH + ' ouro/h' + (m.estavelH != null ? ' (estável ' + (m.estavelH >= 0 ? '+' : '') + m.estavelH + (m.sorte ? ', sorte +' + m.sorte : '') + ')' : '') + ' · ' + m.abatesH + ' abates/h · tomou ' + m.tomadoH + '/h · poção ' + m.supH + '/h · ' + razaoTexto(m.razao) : 'sem medida'}`, 'ok');
                    SCAN.fase = 'proximo';
                }
            }
        } catch (e) {
            log('Scan estourou: ' + e.message, 'erro');
            SCAN.fase = 'proximo';
        } finally { SCAN.ocupado = false; }
    }
    function scanGravar(h, m, erro) {
        const r = scanResultados();
        const tier = (scanCfg().lureMax && h.lureTiers) ? h.lureTiers.length : 1;
        const modelo = scanModeloAtual();
        const chave = scanCfg().comparar ? h.id + '|' + modelo : h.id;
        r[chave] = Object.assign({ id: h.id, title: h.title, levelMin: h.levelMin, t: Date.now(), lure: tier, lureTxt: lureTexto(h, tier), modelo,
                                  nivel: nivelAtual(), minutos: scanCfg().minutos, capMin: Math.round(SCAN.capMin), suja: SCAN.capMin < CAP_MIN_SCAN, erro: erro || null }, m || {});
        guardar('scan_resultados', r);
    }
    /* veredito relativo: quem chega a 90 % do melhor XP é "XP", 90 % do melhor
     * ouro (e positivo) é "Ouro", os dois é "Os dois". */
    const ouroBase = r => r.estavelH != null ? r.estavelH : r.ouroH;   // v2.3.0: ranking de ouro pelo estável
    function scanVereditos() {
        const lista = Object.values(scanResultados()).filter(r => !r.erro && r.xpH != null);
        const melhorXp = Math.max(0, ...lista.map(r => r.xpH)), melhorOuro = Math.max(0, ...lista.map(ouroBase));
        lista.forEach(r => {
            const pXp = melhorXp > 0 ? Math.round(r.xpH / melhorXp * 100) : 0;
            const pOuro = melhorOuro > 0 && ouroBase(r) > 0 ? Math.round(ouroBase(r) / melhorOuro * 100) : 0;
            const xp = pXp >= 90, ouro = pOuro >= 90;
            r.pXp = pXp; r.pOuro = pOuro;
            /* v2.2.4 — nunca "—": o dono leu como "sem veredito" (Barbarian
             * Camp, 27/09). Quem não chega a 90 % mostra o quanto ficou atrás. */
            r.veredito = xp && ouro ? 'Os dois' : xp ? 'XP' : ouro ? 'Ouro'
                : ouroBase(r) < 0 ? 'dá prejuízo'
                : lista.length === 1 ? 'único medido'
                : `abaixo: ${pXp}% do xp · ${pOuro}% do ouro`;
        });
        return { lista: lista.sort((a, b) => b.xpH - a.xpH), melhorXp, melhorOuro,
                 topXp: lista.slice().sort((a, b) => b.xpH - a.xpH)[0] || null, topOuro: lista.slice().sort((a, b) => ouroBase(b) - ouroBase(a))[0] || null };
    }
    async function scanTerminar() {
        const v = scanVereditos();
        SCAN.ativo = false; SCAN.fase = 'parado'; SCAN.huntId = null;
        log(`Scan TERMINADO — melhor XP: ${v.topXp ? v.topXp.title + ' (' + (v.topXp.xpH / 1000).toFixed(1) + 'k/h)' : '?'} · melhor ouro: ${v.topOuro ? v.topOuro.title + ' (' + (ouroBase(v.topOuro) >= 0 ? '+' : '') + ouroBase(v.topOuro) + '/h estável)' : '?'}`, 'ok');
        const c = scanCfg();
        const alvo = c.fim === 'xp' ? v.topXp : c.fim === 'ouro' ? v.topOuro : null;
        if (alvo) {
            const h = (CAT.hunts || []).find(x => x.id === alvo.id);
            if (h) { log('Scan: indo para ' + h.title + ' (melhor ' + (c.fim === 'xp' ? 'XP' : 'ouro') + ')', 'info'); try { await scanEntrar(h); await dorme(1500); await aplicarEmTodos(alvo.modelo || c.modelo || 'equilibrado', h); } catch (e) { } }
        }
        renderizar();
    }
    async function scanIrPara(id) {
        const h = (CAT.hunts || []).find(x => x.id === id);
        if (!h) return;
        if (SCAN.ativo) { log('Scan em andamento — desliga antes de ir para outro mapa', 'erro'); return; }
        log('indo para ' + h.title + ' pelo socket…', 'info');
        const r = await scanEntrar(h);
        if (r.erro) { log('não entrei em ' + h.title + ': ' + r.erro, 'erro'); return; }
        await dorme(1500);
        await aplicarEmTodos(scanCfg().modelo || 'equilibrado', h);
    }

    const sessoes = () => ler('sessoes', []);
    function guardarSessao(s) {
        const t = sessoes();
        t.push(s);
        while (t.length > MAX_SESSOES) t.shift();
        guardar('sessoes', t);
    }

    function fecharSessao(motivo) {
        if (!SESSAO || SESSAO.amostras.length < 2) { SESSAO = null; return; }
        const a0 = SESSAO.amostras[0], aN = SESSAO.amostras[SESSAO.amostras.length - 1];
        const dur = (aN.t - a0.t) / 1000;
        if (dur < 60) { SESSAO = null; return; }        // amostra curta demais pra valer

        const dOuro = aN.ouro - a0.ouro;
        const dExp = (aN.exp != null && a0.exp != null) ? aN.exp - a0.exp : null;
        const dAbates = (aN.abates != null && a0.abates != null) ? aN.abates - a0.abates : null;
        const pctMax = Math.max(...SESSAO.amostras.map(x => x.mochilaPct || 0));
        const suja = pctMax > 0.85;
        /* Em regeneracao a magia nao custa ouro, entao o "custo real por abate"
         * medido aqui e so pocao de vida + munição — nao serve para calibrar a
         * curva de desperdicio, que e sobre MANA comprada. A sessao vale para
         * ouro/h e exp/h; fica fora do fator. */
        const regen = !!SESSAO.regen;

        const s = {
            hunt: SESSAO.huntTitle, huntId: SESSAO.huntId, hp: SESSAO.hp, loot: SESSAO.loot,
            inicio: a0.t, dur: Math.round(dur), motivo,
            ouroH: Math.round(dOuro / dur * 3600),
            expH: dExp != null ? Math.round(dExp / dur * 3600) : null,
            abates: dAbates, abatesH: dAbates != null ? Math.round(dAbates / dur * 3600) : null,
            mochilaPctMax: Math.round(pctMax * 100),
            suja, regen,
            // ponto de calibração: quanto custou de verdade por abate
            custoRealAbate: (dAbates && SESSAO.loot != null && !suja)
                ? Math.round((SESSAO.loot - dOuro / dAbates) * 10) / 10 : null,
            custoPrevisto: SESSAO.custoPrevisto != null ? SESSAO.custoPrevisto : null
        };
        // fator real = custo medido / custo previsto SEM o fator (o previsto já traz o fator)
        if (s.custoRealAbate != null && s.custoPrevisto && !regen) {
            const semFator = s.custoPrevisto / fatorDesperdicio(SESSAO.hp || 1);
            s.fatorReal = Math.round(s.custoRealAbate / Math.max(0.01, semFator) * 100) / 100;
        }
        guardarSessao(s);
        log(`sessão fechada: ${s.hunt} · ${s.ouroH >= 0 ? '+' : ''}${s.ouroH} ouro/h · ${s.expH || '?'} exp/h${s.suja ? ' ⚠ SUJA (mochila)' : ''}`, s.suja ? 'erro' : 'ok');
        SESSAO = null;
    }

    /* ⚠ A HUNT E RECONFIRMADA A CADA ENTRADA EM CACADA, nao so no boot.
     * O boot pode cair no lobby "SEU GRUPO" (todo F5 cai — sessao unica por
     * conta), onde nao existe botao CACADAS e a confirmacao morre em silencio.
     * E trocar de hunt exige sair e entrar, entao a transicao fora->dentro e
     * exatamente o momento em que hunt_id pode ter ficado velho. */
    let _estavaEmHunt = false, _confirmandoHunt = false, _proximaTentativaHunt = 0, _entrouEmHuntEm = 0;
    let _ultimosAbates = null, _nivelAprendido = null, _aprendendo = false, _huntTrocou = false;

    /* ⚠ TROCAR DE HUNT NAO PASSA POR "FORA DA CACADA" de forma visivel:
     * medido em 19/09, o botao de encerrar some por ~500 ms e o amostrador
     * roda a cada 3 s — perdeu a janela e ficou preso na hunt velha. O sinal
     * confiavel e o CONTADOR DE ABATES VOLTAR A ZERO (a sessao do jogo
     * reinicia na troca). Qualquer queda no contador = hunt nova. */
    function amostrar() {
        try { gatilhoAutoHunt(); } catch (e) { }
        if (SCAN.ativo) scanPasso().catch(() => { });
        /* v2.1.0: assim que houver token + catálogo, lê o dano real de tudo (só leitura, sem janela) */
        if (_danosRestPendente && ESTADO_WS.worldToken && CAT.magias && (tid('rail-level-n') || (ESTADO_WS.frame && ESTADO_WS.frame.nivel))) { _danosRestPendente = false; aprenderDanosPorRest(true).catch(() => { }); }
        const dentro = emHunt();
        if (!dentro) { _estavaEmHunt = false; _ultimosAbates = null; if (SESSAO) fecharSessao('saiu da caçada'); return; }

        const ab = lerAbates();
        const resetou = ab != null && _ultimosAbates != null && ab < _ultimosAbates;
        if (ab != null) _ultimosAbates = ab;
        if (!_estavaEmHunt || resetou) {
            _estavaEmHunt = true;
            _entrouEmHuntEm = Date.now();
            /* v2.0.0: se o socket já disse a hunt nos últimos 30 s, ela vale;
             * só zera quando o socket não falou nada. */
            /* v2.2.1 — se o socket conhece a hunt (2.0.0), o contador zerar é
             * só o analisador do jogo sendo reiniciado (botão zerar, Scan,
             * boss): NÃO abre a tela CAÇADAS. A reserva pelo modal fica só
             * para quando o socket nunca falou. */
            const socketSabe = ESTADO_WS.huntId != null && (CAT.hunts || []).some(x => x.id === ESTADO_WS.huntId);
            if (!socketSabe) { guardar('hunt_id', null); guardar('hunt_manual', null); }
            else if (ler('hunt_id', null) !== ESTADO_WS.huntId && !ESTADO_WS.boss) { guardar('hunt_id', ESTADO_WS.huntId); guardar('hunt_manual', ESTADO_WS.huntId); }
            if (resetou) { _huntTrocou = !socketSabe; log(socketSabe ? 'contador de abates zerou (analisador reiniciado)' : 'contador de abates zerou — hunt nova, reconfirmando', 'info'); }
        }
        if (ler('hunt_id', null) == null && !_confirmandoHunt && Date.now() > _proximaTentativaHunt && CAT.hunts
            && Date.now() - _entrouEmHuntEm > 10000) {   // v2.0.0: reserva — o socket tem 10 s para falar primeiro
            _confirmandoHunt = true;
            confirmarHuntPeloExplore()
                .then(async r => {
                    if (r && r.erro) { _proximaTentativaHunt = Date.now() + 30000; log('hunt não confirmada: ' + r.erro, 'erro'); return; }
                    /* v1.8.0 — NADA AUTOMÁTICO NA TROCA. A v1.7.1 subia o lure e
                     * reaplicava os 4 sozinha; o dono achou insuportável (abre
                     * modais no meio do jogo). Agora só avisa; APLICAR NOS 4 e o
                     * lure são botões. */
                    if (_huntTrocou && r && r.hunt) {
                        _huntTrocou = false;
                        log('hunt nova: ' + r.hunt.title + ' — confira o plano na aba Magia e use APLICAR NOS 4 se quiser', 'info');
                    }
                })
                .catch(() => { _proximaTentativaHunt = Date.now() + 30000; })
                .finally(() => { _confirmandoHunt = false; renderizar(); });
            return;   // sem hunt confirmada a amostra sairia com o nome errado
        }

        /* v1.8.0 — NÍVEL NOVO NÃO ABRE DIÁLOGO. O dano medido é escalado pelo
         * nível em danosConhecidos() (toda fórmula do jogo soma nível÷5, wiki
         * "como o dano é calculado"). Medir de novo é o botão "Aprender dano". */
        const lvl = nivelAtual();
        if (lvl && _nivelAprendido !== lvl) {
            if (_nivelAprendido != null) {
                if (ESTADO_WS.worldToken) { log('nível ' + lvl + ': relendo o dano real de /spell-numbers', 'info'); aprenderDanosPorRest(true).catch(() => { }); }
                else log('nível ' + lvl + ': dano das magias escalado por nível÷5 (medir de novo só se quiser, botão Aprender dano)', 'info');
            }
            _nivelAprendido = lvl;
        }

        const h = huntAtual();
        const idAgora = h ? h.id : null;
        if (SESSAO && SESSAO.huntId !== idAgora) fecharSessao('trocou de hunt');

        if (!SESSAO) {
            const w = h && h.monsters ? (h.monsters.reduce((s, m) => s + (m.weight || 1), 0) || 1) : 1;
            const hp = h && h.monsters ? h.monsters.reduce((s, m) => s + m.health * (m.weight || 1), 0) / w : null;
            let custoPrev = null;
            try { const vp = viabilidadeParty(ler('modelo', 'equilibrado'), h); if (vp) custoPrev = vp.custoPorAbate; } catch (e) { }
            SESSAO = {
                huntId: idAgora, huntTitle: h ? h.title : 'desconhecida',
                hp: hp ? Math.round(hp) : null, loot: h ? LOOT_CACHE[h.id] : null,
                custoPrevisto: custoPrev, regen: partyEmRegen(), amostras: []
            };
        }
        const exp = lerExpTotal();
        const moch = lerMochilaOz();
        SESSAO.amostras.push({
            t: Date.now(), ouro: ouroAtual(), exp: exp ? exp.atual : null,
            abates: lerAbates(), mochilaPct: moch ? moch.pct : 0
        });
        // não deixa a sessão crescer sem limite
        if (SESSAO.amostras.length > 400) SESSAO.amostras.splice(0, 100);
    }

    /* Agrega as sessões por hunt, ignorando as sujas no cálculo de custo */
    function resumoPorHunt() {
        const por = {};
        sessoes().forEach(s => {
            const k = s.hunt || '?';
            if (!por[k]) por[k] = { hunt: k, hp: s.hp, loot: s.loot, n: 0, dur: 0, ouro: 0, exp: 0, abates: 0, sujas: 0, fatores: [] };
            const p = por[k];
            p.n++; p.dur += s.dur;
            p.ouro += s.ouroH * s.dur / 3600;
            if (s.expH != null) p.exp += s.expH * s.dur / 3600;
            if (s.abates) p.abates += s.abates;
            if (s.suja) p.sujas++;
            if (s.regen) p.regen = (p.regen || 0) + 1;
            if (s.fatorReal != null && !s.suja && !s.regen) p.fatores.push(s.fatorReal);
        });
        return Object.values(por).map(p => ({
            ...p,
            ouroH: p.dur ? Math.round(p.ouro / p.dur * 3600) : 0,
            expH: p.dur ? Math.round(p.exp / p.dur * 3600) : 0,
            fatorMedio: p.fatores.length ? Math.round(p.fatores.reduce((a, b) => a + b, 0) / p.fatores.length * 100) / 100 : null
        })).sort((a, b) => b.ouroH - a.ouroH);
    }

    /* =========================================================================
     *  ⭐ v2.4.0 — EQUIP: leituras. Corpo dos 4 (welcome/resume → rosterFull;
     *  fallback: fibra React, o mesmo caminho de data/estado-party.json),
     *  depósito (depot_get → depot_state) e atributos base por /item/info.
     *  Só leitura — depot_get não muda nada no servidor.
     * ====================================================================== */
    function lerShellFibra() {
        try {
            const raiz = tid('shell') || $('.s-ui-root'); if (!raiz) return null;
            const k = Object.keys(raiz).find(x => x.startsWith('__reactFiber$')); if (!k) return null;
            let f = raiz[k]; while (f && f.return) f = f.return;
            const vistos = new Set(); let shell = null;
            const olhar = o => { if (!o || typeof o !== 'object' || vistos.has(o)) return; vistos.add(o);
                if (!shell && o.roster && o.bag && 'equipSlots' in o) shell = o; };
            const pilha = [f]; let g = 0;
            while (pilha.length && g++ < 200000 && !shell) {
                const x = pilha.pop(); if (!x) continue;
                if (x.memoizedProps && typeof x.memoizedProps === 'object') { olhar(x.memoizedProps); for (const v of Object.values(x.memoizedProps)) olhar(v); }
                let h = x.memoizedState, g2 = 0;
                while (h && g2++ < 200) { olhar(h.memoizedState); if (h.memoizedState && typeof h.memoizedState === 'object') for (const v of Object.values(h.memoizedState)) olhar(v); h = h.next; }
                if (x.child) pilha.push(x.child); if (x.sibling) pilha.push(x.sibling);
            }
            return shell || null;
        } catch (e) { return null; }
    }
    function lerRosterFibra() { const sh = lerShellFibra(); return sh && Array.isArray(sh.roster) ? clonar(sh.roster) : null; }
    /* fibra primeiro: depois de um equip o roster do welcome fica velho */
    function rosterEquip() {
        const r = lerRosterFibra();
        if (r && r.some(x => x && x.equipment)) { ESTADO_WS.rosterFull = r; ESTADO_WS.rosterFull_t = Date.now(); return r; }
        return ESTADO_WS.rosterFull;
    }
    /* mochila com forja: shell.bagInstances [{iid, name, forja}] (visto em 28/09 ao equipar) */
    function mochilaEquip() { const sh = lerShellFibra(); return sh && Array.isArray(sh.bagInstances) ? clonar(sh.bagInstances) : []; }
    /* Pelo socket (depot_get → depot_state). Se o socket não estiver à mão
     * (helper injetado depois do jogo abrir), cai no `shell.depot` da fibra —
     * é o mesmo depot_state que o cliente guardou da última leitura. */
    async function lerDepot() {
        let erro = null;
        if (socketAberto()) {
            const antes = ESTADO_WS.depot_t;
            try { enviarWS({ type: 'depot_get', data: {} }); } catch (e) { erro = e.message; }
            if (!erro) {
                const ok = await esperarQue(() => ESTADO_WS.depot_t > antes, 5000, 100);
                if (ok) return { depot: ESTADO_WS.depot };
                erro = 'depot_state não chegou em 5 s';
            }
        } else erro = 'socket do jogo não está à mão';
        const sh = lerShellFibra();
        if (sh && sh.depot && Array.isArray(sh.depot.entries)) {
            ESTADO_WS.depot = { entries: clonar(sh.depot.entries), used: sh.depot.used, total: sh.depot.total, daTela: true }; ESTADO_WS.depot_t = Date.now();
            return { depot: ESTADO_WS.depot, aviso: erro + ' — depósito lido da tela do jogo' };
        }
        return { erro };
    }
    /* atributos base por nome. Cache em localStorage (equip_base) por 7 dias;
     * id por nome vem de /assets/v167/items-by-name.json (cache equip_ids). */
    let _idsPorNome = null;
    async function idsPorNome() {
        if (_idsPorNome) return _idsPorNome;
        const c = ler('equip_ids', null);
        if (c && c.t && Date.now() - c.t < 7 * 864e5 && c.m) { _idsPorNome = c.m; return c.m; }
        const m = await buscarJSON('/assets/v167/items-by-name.json');
        _idsPorNome = m; guardar('equip_ids', { t: Date.now(), m });
        return m;
    }
    async function basePorNome(nomes) {
        const cache = ler('equip_base', {});
        const ids = await idsPorNome();
        const faltam = [...new Set(nomes)].filter(n => !cache[n] && ids[n] != null);
        for (let i = 0; i < faltam.length; i += 100) {
            const lote = faltam.slice(i, i + 100);
            try {
                const lista = await buscarJSON('/item/info?ids=' + lote.map(n => ids[n]).join(','));
                for (const it of lista) cache[it.name] = { id: it.id, attrs: it.attrs || {}, sell: it.sell || 0, equipPreview: it.equipPreview || null };
            } catch (e) { log('equip: /item/info falhou: ' + e.message, 'erro'); }
        }
        if (faltam.length) guardar('equip_base', cache);
        return cache;
    }

    /* @@EQUIP-PURO-INICIO */
    /* =========================================================================
     *  ⭐ v2.4.0 — EQUIP: modelo. Tudo aqui é função pura (testes/equip.test.js
     *  roda este trecho no node). Pesos em "% de ganho" aproximado, derivados
     *  da Wiki (/como-o-dano-e-calculado, /lure-levas-e-formacao, /forja):
     *   • corpo a corpo de criatura vai SEMPRE no Knight → armadura/escudo só
     *     valem nele; os outros três levam só magia de área (resist/protecao).
     *   • Knight: dano ≈ 0,085·atk·melee + nível/5 → +1 atk ≈ +0,9 % (nível 61,
     *     melee 30, atk 33); +1 skill ≈ +2,8 %.
     *   • Paladino: dano vem da MUNIÇÃO; o attack do arco não conta.
     *   • Magos: poção de mana OFF nos 4 (regime regen) → regen_mana vira
     *     magia de graça; a mana do tiro da wand compete com a magia.
     *  Raridade NÃO pontua: ela só diz quantos atributos a peça tem.
     * ====================================================================== */
    const SLOTS_EQUIP = ['weapon', 'shield', 'head', 'armor', 'legs', 'boots', 'necklace', 'ring'];
    const ELEM = ['fogo', 'gelo', 'energia', 'terra', 'morte', 'sagrado'];
    const ELEM_EN = { fogo: 'fire', gelo: 'ice', energia: 'energy', terra: 'earth', morte: 'death', sagrado: 'holy' };
    const _fmap = (pref, v) => Object.fromEntries(ELEM.map(e => [pref + e, v]));
    const _amap = (v) => Object.fromEntries(ELEM.map(e => ['absorbpercent' + ELEM_EN[e], v]).concat([['absorbpercentpoison', v]]));
    const PESOS_EQUIP = {
        KNIGHT: Object.assign({
            attack: 0.9, corpo_a_corpo: 2.8, skillsword: 2.8, skillaxe: 2.8, skillclub: 2.8,
            dano_fisico: 1, roubo_vida_chance: 0.2, roubo_vida_quantia: 0.3, critico_chance: 0.25, critico_dano: 0.03,
            armor: 1.5, defense: 0.5, extradef: 0.5, escudo: 2, skillshield: 2, resist_fisica: 1.5, absorbpercentphysical: 1.5,
            max_hp: 0.1, regen_vida: 0.5, cura_propria: 0.3, protecao_magica: 0.5, nivel_magico: 0.3, magiclevelpoints: 0.3,
            max_mana: 0.02, chance_de_loot: 0.3, capacidade: 0, dano_magico: 0, distancia: 0, skilldist: 0, regen_mana: 0.2, hitchance: 0
        }, _fmap('dano_elem_', 0.6), _fmap('resist_', 0.5), _amap(0.5)),
        PALADIN: Object.assign({
            distancia: 3, skilldist: 3, dano_fisico: 1, roubo_vida_chance: 0.15, roubo_vida_quantia: 0.2, critico_chance: 0.25, critico_dano: 0.03,
            hitchance: 0.5, regen_mana: 1.5, max_mana: 0.02, nivel_magico: 5, magiclevelpoints: 5,
            armor: 0.2, defense: 0, extradef: 0, escudo: 0, skillshield: 0, resist_fisica: 0.2, absorbpercentphysical: 0.2,
            max_hp: 0.05, regen_vida: 0.2, cura_propria: 0.2, protecao_magica: 0.4, chance_de_loot: 0.3, capacidade: 0,
            attack: 0, corpo_a_corpo: 0, skillsword: 0, skillaxe: 0, skillclub: 0, dano_magico: 0
        }, _fmap('dano_elem_', 0.6), _fmap('resist_', 0.4), _amap(0.4)),
        SORCERER: Object.assign({
            regen_mana: 3, dano_magico: 1, nivel_magico: 7, magiclevelpoints: 7, max_mana: 0.02,
            protecao_magica: 0.4, resist_fisica: 0.1, absorbpercentphysical: 0.1, max_hp: 0.04, regen_vida: 0.1, cura_propria: 0.2,
            armor: 0.1, defense: 0.05, extradef: 0, escudo: 0, skillshield: 0, chance_de_loot: 0.3, capacidade: 0,
            attack: 0, corpo_a_corpo: 0, skillsword: 0, skillaxe: 0, skillclub: 0, distancia: 0, skilldist: 0, hitchance: 0,
            dano_fisico: 0, roubo_vida_chance: 0.1, roubo_vida_quantia: 0.1, critico_chance: 0, critico_dano: 0
        }, _fmap('dano_elem_', 0), _fmap('resist_', 0.4), _amap(0.4)),
    };
    PESOS_EQUIP.DRUID = Object.assign({}, PESOS_EQUIP.SORCERER, { cura_propria: 0.5, nivel_magico: 7.5, magiclevelpoints: 7.5 });
    /* v2.9.0 — PESOS OFENSIVOS PELA FÓRMULA, com as skills do momento.
     * Os números fixos acima envelheceram e um deles nasceu errado:
     *  • Knight: ataque valia 0,9 e skill 2,8. Mas no golpe (wiki: média
     *    nível/5 + 0,0425·atk·skill) e no Berserk (/spells: 1,1·(nível/5 +
     *    skill + atk)) ataque e skill entram SIMÉTRICOS — +1 de ataque rende
     *    quase o mesmo que +1 de skill (nível 61, melee 30, atk 33: 1,8 e 2,0).
     *  • Magos: nível mágico valia 7 — conta certa com ML≈4 (22/09), mas o
     *    TIBIDLE.md de 28/09 registra ML 20. Média de Energy Wave/Strong Ice
     *    Wave com a runa de área (/spells) dá ~3,8 (Fei) e ~3,4 (Dru) no ML 20.
     *  • Paladino: a wiki (/forja) diz que Dano Mágico "vale para qualquer
     *    magia de ataque, runa e wand" — e o dano dele é runa + Caldera +
     *    Missile. Valia 0. Agora Dano Físico e Dano Mágico dividem o peso pela
     *    fração do dano que vem de magia (ctx.fracMagica, medida no
     *    livro-razão; sem medida, metade). A skill Distância e a munição só
     *    mexem no tiro, então também levam (1 − fração).
     * ctx.sk[VOC] = {melee, atkArma, dist, ml} lidos do jogo; o que faltar
     * cai na referência de 28/09 (REF_SK). */
    const REF_SK = { nivel: 62, melee: 30, atkArma: 33, dist: 33, ml: 20 };
    /* /ammo: as duas munições de custo 0. Besta usa bolt (30), arco usa arrow (25). */
    const MUNICAO_GRATIS = { arrow: 25, bolt: 30 };
    const FRAC_MAGICA_PADRAO = 0.5;
    const _pct = (ganho, base) => base > 0 ? Math.round(1000 * ganho / base) / 10 : 0;
    function pesosDaVoc(voc, ctx) {
        const P = Object.assign({}, PESOS_EQUIP[voc] || {});
        const s = Object.assign({}, REF_SK);
        for (const [k, v] of Object.entries((ctx && ctx.sk && ctx.sk[voc]) || {})) if (Number.isFinite(v) && v > 0) s[k] = v;
        const n5 = ((ctx && ctx.nivel > 0 && ctx.nivel) || s.nivel) / 5;
        if (voc === 'KNIGHT') {
            const golpe = n5 + 0.0425 * s.atkArma * s.melee, berserk = 1.1 * (n5 + s.melee + s.atkArma);
            P.attack = Math.round((_pct(0.0425 * s.melee, golpe) + _pct(1.1, berserk)) / 2 * 10) / 10;
            const sk = Math.round((_pct(0.0425 * s.atkArma, golpe) + _pct(1.1, berserk)) / 2 * 10) / 10;
            P.corpo_a_corpo = P.skillsword = P.skillaxe = P.skillclub = sk;
        } else if (voc === 'PALADIN') {
            const f = ctx && ctx.fracMagica && ctx.fracMagica.PALADIN != null ? ctx.fracMagica.PALADIN : FRAC_MAGICA_PADRAO;
            const tiro = n5 + 0.045 * MUNICAO_GRATIS.arrow * s.dist;
            P.distancia = P.skilldist = Math.round(_pct(0.045 * MUNICAO_GRATIS.arrow, tiro) * (1 - f) * 10) / 10;
            P.municao_atk = Math.round(_pct(0.045 * s.dist, tiro) * (1 - f) * 10) / 10;   // por ponto de ataque da munição grátis
            P.dano_fisico = Math.round((1 - f) * 100) / 100; P.dano_magico = Math.round(f * 100) / 100;
        } else if (voc === 'SORCERER' || voc === 'DRUID') {
            const runa = _pct(2, n5 + 2 * s.ml + 12);                          // avalanche/gfb/thunderstorm: n/5 + 1,2–2,8·ML + 7–17
            const onda = voc === 'SORCERER' ? _pct(6.75, n5 + 6.75 * s.ml)     // Energy Wave: n/5 + 4,5–9·ML
                                            : _pct(6.05, n5 + 6.05 * s.ml + 34);  // Strong Ice Wave: n/5 + 4,5–7,6·ML + 20–48
            P.nivel_magico = P.magiclevelpoints = Math.round((runa + onda) / 2 * 10) / 10;
        }
        return P;
    }
    /* v2.7.3 — WAND/ROD NA ESCALA CERTA (dono, 29/09: "wand com +1 ML é melhor
     * que wand mais forte, porque o dano das magias é em área e aumenta tudo").
     * 1 ponto ≈ 1 % do dano do personagem. O tiro sai a cada ~4 s (28 tiros em
     * 111 s, Dragon Lair) e um mago faz ~100 de dano/s: 65 de dano por tiro =
     * 16 dano/s = 16 pontos → 0,25 por ponto de dano (era 0,8: a wand of
     * inferno valia 52 pontos, três vezes o que rende). A mana do tiro é mana
     * que a onda não usa: Feiticeiro na regeneração, Energy Wave 5,5 dano/mana
     * → 1,4 pt por mana; Druida bebe poção e a Strong Ice Wave dá 8 dano/mana
     * → 2 pt por mana. E o ELEMENTO da wand conta contra o mapa atual (wand of
     * inferno é fogo: zero em Dragon Lair). +1 ML vale 7 % de TUDO (magias e
     * runas), então a wand of vortex forjada com +1 ML ganha da inferno. */
    const WAND_PT_DANO = 0.25, WAND_PT_MANA = { SORCERER: 1.4, DRUID: 2.0 };
    const WAND_ELEM = { fire: 'COMBAT_FIREDAMAGE', energy: 'COMBAT_ENERGYDAMAGE', earth: 'COMBAT_EARTHDAMAGE', ice: 'COMBAT_ICEDAMAGE', death: 'COMBAT_DEATHDAMAGE', holy: 'COMBAT_HOLYDAMAGE' };
    const ROTULO = Object.assign({
        attack: 'attack', armor: 'armor', defense: 'defesa', extradef: 'defesa extra', magiclevelpoints: 'nível mágico (base)',
        skillsword: 'sword (base)', skillaxe: 'axe (base)', skillclub: 'club (base)', skilldist: 'distance (base)', skillshield: 'shield (base)',
        hitchance: 'acerto', absorbpercentphysical: 'resist física (base)', absorbpercentpoison: 'resist terra (base)',
        dano_fisico: 'dano físico', dano_magico: 'dano mágico', roubo_vida_chance: 'roubo de vida (chance)', roubo_vida_quantia: 'roubo de vida (quantia)',
        critico_chance: 'crítico (chance)', critico_dano: 'crítico (dano)', corpo_a_corpo: 'corpo a corpo', distancia: 'distância', nivel_magico: 'nível mágico',
        resist_fisica: 'resist física', protecao_magica: 'proteção mágica', escudo: 'escudo', max_hp: 'max HP', max_mana: 'max mana',
        capacidade: 'capacidade', regen_vida: 'regen vida', regen_mana: 'regen mana', cura_propria: 'cura própria', chance_de_loot: 'chance de loot'
    }, Object.fromEntries(ELEM.map(e => ['dano_elem_' + e, 'dano ' + e])), Object.fromEntries(ELEM.map(e => ['resist_' + e, 'resist ' + e])),
       Object.fromEntries(ELEM.map(e => ['absorbpercent' + ELEM_EN[e], 'resist ' + e + ' (base)'])));
    const rotulo = (id) => ROTULO[id] || id;
    const normalizarSlot = (s) => s === 'feet' ? 'boots' : s === 'hand' ? 'weapon' : s;
    const VOC_NOME = { KNIGHT: 'knight', PALADIN: 'paladin', SORCERER: 'sorcerer', DRUID: 'druid' };
    function vocacaoPode(attrs, voc) {
        const a = attrs || {};
        const w = a.weaponType || a.weapontype;
        /* v2.9.0 — wiki /equipamentos: o Paladino usa "arco ou besta" e o dano
         * vem da munição. Lança (spear, royal spear) é arma de distância SEM
         * ammotype: não usa flecha, quebra, e ninguém do grupo a usa. Na 2.8.5
         * uma royal spear +1 distância tirava o arco do Paladino (arco = 0 pt)
         * e mandava bow e crossbow para a lista de venda. */
        if (w === 'distance' && !a.ammotype) return false;
        if (a.vocation) return String(a.vocation).toLowerCase().includes(VOC_NOME[voc]);
        if (w === 'sword' || w === 'axe' || w === 'club' || w === 'fist') return voc === 'KNIGHT';
        if (w === 'distance') return voc === 'PALADIN';
        if (w === 'shield') return voc !== 'PALADIN';
        return true;
    }
    /* peça = {nome, slot, attrs (base), forja{raridade, atributos[]}, equipPreview?}
     * → {pontos, motivos[≤2], contam[], mortos[], temporario, detalhe[{id, valor, pt}]} */
    const ATTR_IGNORAR = new Set(['weight', 'level', 'range', 'mana', 'fromDamage', 'toDamage', 'imbuementslot', 'duration', 'charges', 'speed',
                                  'transformequipto', 'transformdeequipto', 'decayTo', 'showduration', 'showAttributes', 'stopduration',
                                  'manaticks', 'healthticks', 'showCharges', 'containersize', 'augments', 'value', 'id']);
    const ehEncaixe = (k) => k.startsWith('skillboost') || k === 'life leech' || k === 'mana leech' || k === 'critical hit' || k === 'elemental damage'
                             || k.startsWith('elemental protection') || k === 'paralysis deflection' || k === 'increase speed';
    /* ctx.notas = notasElementos(hunt).notas do mapa atual (opcional) */
    /* v2.9.0 — PEÇA QUE ACABA não entra na conta automática. Wiki
     * /equipamentos: durabilidade "por cargas: cada golpe que a proteção
     * reduziu gasta 1 carga" e "por tempo: o relógio só corre durante a
     * caçada". Num jogo que caça 24 h, stone skin amulet (5 cargas) acaba em
     * cinco golpes e ring of healing em 7,5 min — e eram as MAIORES trocas da
     * lista (160 pt e 18 pt), porque os atributos contavam como permanentes.
     * Continuam pontuadas (para mostrar o que dão enquanto duram), mas
     * `distribuirEquip` não as escolhe nem as manda vender: são consumíveis. */
    const ehTemporaria = (peca) => {
        const a = (peca && peca.attrs) || {};
        return !!(peca && peca.equipPreview && peca.equipPreview.attrs) || Number(a.charges) > 0 || !!a.showduration || !!a.stopduration;
    };
    function pontuarPeca(peca, voc, ctx) {
        const P = pesosDaVoc(voc, ctx);
        const a = peca.attrs || {};
        const detalhe = [];
        const add = (id, valor, pt) => detalhe.push({ id, valor, pt: Math.round(pt * 100) / 100 });
        const temporario = ehTemporaria(peca);
        const cargas = Number(a.charges) || 0;
        const duracaoS = (peca.equipPreview && peca.equipPreview.durationS) || null;
        let baseAttrs = a;
        if (peca.equipPreview && peca.equipPreview.attrs) baseAttrs = Object.assign({}, a, peca.equipPreview.attrs);
        for (const [k, v] of Object.entries(baseAttrs)) {
            if (typeof v !== 'number' || ATTR_IGNORAR.has(k) || ehEncaixe(k)) continue;   // encaixes de imbuement não são bônus
            if (k === 'managain') { add('regen_mana', v, v * 0.5 * (P.regen_mana || 0)); continue; }
            if (k === 'healthgain') { add('regen_vida', v, v * 0.5 * (P.regen_vida || 0)); continue; }
            if (k === 'skillmagic' || k === 'magiclevelpoints') { add('magiclevelpoints', v, v * (P.magiclevelpoints || 0)); continue; }
            if (k in P) { add(k, v, v * P[k]); }
        }
        /* arco/besta: o ataque da arma é 0 (wiki) — o que muda é a MUNIÇÃO que ela
         * aceita. A besta usa bolt grátis (30), o arco arrow grátis (25): +20 % no
         * ataque do tiro, de graça. Referência = arco (0 pt). */
        if (voc === 'PALADIN' && a.ammotype && MUNICAO_GRATIS[a.ammotype] != null) {
            const atk = MUNICAO_GRATIS[a.ammotype];
            add('munição grátis (' + a.ammotype + ' ' + atk + ')', atk, (atk - MUNICAO_GRATIS.arrow) * (P.municao_atk || 0));
        }
        // wand/rod: dano fixo por tiro menos a mana que ele rouba da magia
        if ((a.weaponType === 'wand' || a.wandType) && a.fromDamage != null && voc !== 'KNIGHT' && voc !== 'PALADIN') {
            const medio = (Number(a.fromDamage) + Number(a.toDamage)) / 2;
            const el = WAND_ELEM[a.wandType] || null;
            const nota = el && ctx && ctx.notas && ctx.notas[el] != null ? ctx.notas[el] / 100 : 1;
            add('dano da wand' + (el && nota !== 1 ? ' (' + (a.wandType) + ' ' + Math.round(nota * 100) + '% no mapa)' : ''), medio, medio * nota * WAND_PT_DANO);
            if (a.mana) add('mana por tiro', a.mana, -Number(a.mana) * (WAND_PT_MANA[voc] || 1.4));
        }
        for (const f of ((peca.forja && peca.forja.atributos) || [])) {
            const p = P[f.id]; add(f.id, f.valor, (p || 0) * Number(f.valor));
        }
        const pontos = Math.round(detalhe.reduce((s, d) => s + d.pt, 0) * 10) / 10;
        const contam = detalhe.filter(d => d.pt > 0).sort((x, y) => y.pt - x.pt);
        const mortos = detalhe.filter(d => d.pt === 0 && !/^munição grátis/.test(d.id)).map(d => d.id);
        const motivos = contam.slice(0, 2).map(d => `${rotulo(d.id)} +${d.valor} (${d.pt} pt)`);
        return { pontos, motivos, contam: contam.map(d => d.id), mortos, temporario, cargas, duracaoS, detalhe };
    }
    /* roster (welcome/fibra) + depot_state.entries + base{nome:{attrs,sell,equipPreview}} → peças
     * {iid, nome, slot, attrs, forja, equipPreview, sell, origem:'corpo'|'depósito', dono?:voc, duasMaos} */
    function candidatosEquip(roster, depot, base, mochila) {
        const out = [];
        const b = (nome) => base[nome] || { attrs: {}, sell: 0, equipPreview: null };
        const slotDaBase = (a) => { if (a.slot) return normalizarSlot(a.slot); const w = a.weaponType || a.weapontype; if (w === 'shield' || w === 'spellbook') return 'shield'; if (w) return 'weapon'; return null; };
        for (const e of (mochila || [])) {
            if (!e || !e.iid || !e.name) continue;
            const k = b(e.name);
            const slot = slotDaBase(k.attrs);
            if (!slot || !SLOTS_EQUIP.includes(slot)) continue;
            out.push({ iid: e.iid, nome: e.name, slot, attrs: k.attrs, forja: e.forja || { raridade: 0, atributos: [] }, equipPreview: k.equipPreview,
                       sell: k.sell || 0, origem: 'mochila', dono: null, duasMaos: k.attrs.slotType === 'two-handed' });
        }
        for (const r of (roster || [])) for (const [slot, it] of Object.entries(r.equipment || {})) {
            if (!it || !it.name) continue;
            const k = b(it.name);
            const attrs = Object.assign({}, k.attrs, it.attrs || {});
            out.push({ iid: it.iid || (r.vocation + ':' + slot), nome: it.name, slot: normalizarSlot(slot), attrs, forja: it.forja || { raridade: 0, atributos: [] },
                       equipPreview: k.equipPreview, sell: k.sell || it.value || 0, origem: 'corpo', dono: r.vocation, duasMaos: attrs.slotType === 'two-handed' });
        }
        for (const e of ((depot && depot.entries) || [])) {
            if (!e.forja || !e.slot) continue;
            const k = b(e.itemName);
            out.push({ iid: e.iid, nome: e.itemName, slot: normalizarSlot(e.slot), attrs: k.attrs, forja: e.forja, equipPreview: k.equipPreview,
                       sell: k.sell || 0, origem: 'depósito', dono: null, duasMaos: k.attrs.slotType === 'two-handed' });
        }
        return out;
    }
    /* Distribuição: cada peça vai para UM personagem e o objetivo é a SOMA de
     * pontos dos 4 (não o ganho de cada um). O guloso por ganho falhava aqui:
     * o Knight "ganhava" +0,7 pegando o anel do Feiticeiro, que perdia 3,3
     * (28/09, fixtures). Por slot: os 6 melhores candidatos de cada vocação
     * (mais o que ela já usa) e força bruta sobre as combinações sem repetir
     * peça — 6⁴ = 1.296 por slot, nada. Empate: fica com quem já usa.
     * Duas mãos (Knight): o slot de escudo ganha um candidato virtual "2 mãos"
     * que vale (melhor 2 mãos − arma de 1 mão escolhida); se ele vence, o
     * escudo fica vazio e a arma vira a de 2 mãos.
     * → {porVoc:{VOC:{slot:{atual, atualPt, melhor, melhorPt, ganho, candidatos[]}}}, reservas:Set(iid), dispensaveis:[peça+motivo], usadas:Set} */
    const EQUIP_TOPK = 6;
    function _resolverSlot(porVoc, vocsSlot, s, usadas, extra) {
        // candidatos por voc: top-K não usados + o atual (se não estiver) + extra (virtual)
        const listas = vocsSlot.map(v => {
            const x = porVoc[v][s]; if (!x) return [];
            const l = x.candidatos.filter(c => !usadas.has(c.peca.iid)).slice(0, EQUIP_TOPK).map(c => ({ iid: c.peca.iid, peca: c.peca, pt: c.r.pontos + (c.peca.dono === v ? 0.05 : 0) }));
            if (x.atual && !l.some(c => c.iid === x.atual.iid) && !usadas.has(x.atual.iid)) l.push({ iid: x.atual.iid, peca: x.atual, pt: x.atualPt + 0.05 });
            if (extra && extra[v]) l.push(extra[v]);
            l.push({ iid: null, peca: null, pt: 0 });   // "nada" — evita forçar peça ruim quando falta candidato
            return l;
        });
        let melhor = { soma: -Infinity, esc: null };
        const esc = new Array(vocsSlot.length).fill(null);
        const rec = (i, soma, pegos) => {
            if (i === vocsSlot.length) { if (soma > melhor.soma) melhor = { soma, esc: esc.slice() }; return; }
            for (const c of listas[i]) {
                if (c.iid && pegos.has(c.iid)) continue;
                esc[i] = c; if (c.iid) pegos.add(c.iid);
                rec(i + 1, soma + c.pt, pegos);
                if (c.iid) pegos.delete(c.iid);
            }
        };
        rec(0, 0, new Set());
        return vocsSlot.map((v, i) => ({ v, c: melhor.esc ? melhor.esc[i] : null }));
    }
    function distribuirEquip(pecas, vocs, ctx) {
        vocs = vocs || Object.keys(PESOS_EQUIP);
        const pont = new Map();   // iid|voc → resultado
        const P = (p, v) => { const k = p.iid + '|' + v; if (!pont.has(k)) pont.set(k, pontuarPeca(p, v, ctx)); return pont.get(k); };
        const porVoc = {};
        for (const v of vocs) {
            porVoc[v] = {};
            for (const s of SLOTS_EQUIP) {
                if (v === 'PALADIN' && s === 'shield') continue;
                const atual = pecas.find(p => p.origem === 'corpo' && p.dono === v && p.slot === s) || null;
                const cands = pecas.filter(p => p.slot === s && vocacaoPode(p.attrs, v) && !ehTemporaria(p)).map(p => ({ peca: p, r: P(p, v) })).sort((x, y) => y.r.pontos - x.r.pontos);
                porVoc[v][s] = { atual, atualPt: atual ? P(atual, v).pontos : 0, melhor: null, melhorPt: 0, ganho: 0, candidatos: cands };
            }
        }
        const usadas = new Set();
        const fixar = (v, s, c) => {
            const x = porVoc[v][s]; if (!x) return;
            x.melhor = c && c.peca ? c.peca : null; x.melhorPt = c && c.peca ? P(c.peca, v).pontos : 0;
            x.ganho = Math.round((x.melhorPt - x.atualPt) * 10) / 10;
            if (c && c.iid) usadas.add(c.iid);
        };
        // 1) arma: só as de 1 mão (Paladino: o arco é sempre 2 mãos e não tem escudo)
        for (const v of vocs) for (const c of porVoc[v].weapon.candidatos) if (c.peca.duasMaos && v !== 'PALADIN') c.duasMaos2 = true;
        const soArma1 = {}; for (const v of vocs) { soArma1[v] = porVoc[v].weapon.candidatos; porVoc[v].weapon.candidatos = soArma1[v].filter(c => !c.duasMaos2); }
        for (const r of _resolverSlot(porVoc, vocs, 'weapon', usadas)) fixar(r.v, 'weapon', r.c);
        for (const v of vocs) porVoc[v].weapon.candidatos = soArma1[v];
        // 2) escudo, com o candidato virtual "2 mãos" para quem tiver arma de 2 mãos melhor
        const extra = {};
        for (const v of vocs) {
            if (!porVoc[v].shield) continue;
            const m2 = porVoc[v].weapon.candidatos.find(c => c.duasMaos2 && !usadas.has(c.peca.iid));
            if (m2) extra[v] = { iid: '__2m__' + v, peca: null, duasMaos: m2.peca, pt: m2.r.pontos - porVoc[v].weapon.melhorPt };
        }
        for (const r of _resolverSlot(porVoc, vocs.filter(v => porVoc[v].shield), 'shield', usadas, extra)) {
            if (r.c && r.c.duasMaos) {   // 2 mãos venceu: arma vira a de 2 mãos, escudo fica vazio
                if (porVoc[r.v].weapon.melhor) usadas.delete(porVoc[r.v].weapon.melhor.iid);
                fixar(r.v, 'weapon', { iid: r.c.duasMaos.iid, peca: r.c.duasMaos });
                fixar(r.v, 'shield', null);
            } else fixar(r.v, 'shield', r.c);
        }
        // 3) os outros slots, independentes entre si
        for (const s of SLOTS_EQUIP) {
            if (s === 'weapon' || s === 'shield') continue;
            for (const r of _resolverSlot(porVoc, vocs, s, usadas)) fixar(r.v, s, r.c);
        }
        // reservas: melhor candidato não usado de cada (voc, slot)
        const reservas = new Set();
        for (const v of vocs) for (const s of Object.keys(porVoc[v])) {
            const r = porVoc[v][s].candidatos.find(c => !usadas.has(c.peca.iid));
            if (r) reservas.add(r.peca.iid);
        }
        /* v2.9.0 — DISPENSÁVEL NÃO PODE DEPENDER DO MAPA. Com ctx.notas (elemento
         * do mapa atual) a wand of inferno vale menos que nada em Dragon Lair
         * (imune a fogo) e ia para a lista de venda — sendo a melhor wand em
         * quase todo o resto. Só é dispensável o que também sobra na conta
         * neutra (sem elemento). Temporárias/de carga nunca entram: consumíveis. */
        const neutro = ctx && ctx.notas ? distribuirEquip(pecas, vocs, Object.assign({}, ctx, { notas: null })) : null;
        const sobraNoNeutro = neutro ? new Set(neutro.dispensaveis.map(p => p.iid)) : null;
        const temporarios = pecas.filter(p => ehTemporaria(p) && !(p.origem === 'corpo'));
        const dispensaveis = pecas.filter(p => !usadas.has(p.iid) && !reservas.has(p.iid) && !ehTemporaria(p) && (!sobraNoNeutro || sobraNoNeutro.has(p.iid))).map(p => {
            let melhorUso = null;
            for (const v of vocs) if (vocacaoPode(p.attrs, v) && porVoc[v][p.slot]) {
                const top = porVoc[v][p.slot].melhor; if (!top) continue;
                const d = P(top, v).pontos - P(p, v).pontos;
                if (!melhorUso || d < melhorUso.d) melhorUso = { v, top, d };
            }
            return Object.assign({}, p, { motivo: melhorUso ? `superada por ${melhorUso.top.nome} (${melhorUso.v.toLowerCase()}, −${Math.round(melhorUso.d * 10) / 10} pt)` : 'nenhuma vocação usa' });
        }).sort((a, b) => (b.sell || 0) - (a.sell || 0));
        return { porVoc, reservas, dispensaveis, usadas, temporarios };
    }
    /* @@EQUIP-PURO-FIM */

    /* =========================================================================
     *  TELAS
     * ====================================================================== */
    /* v2.8.0 — TRILHO VERTICAL DE ÍCONES + GAVETA (dono, 29/09: "menus com
     * ícone na vertical, poupa tela; faça seu melhor"). O painel de 430 px
     * cobria atalhos, chat e ENCERRAR; Equip rolava 3.937 px. Agora: trilho de
     * 44 px na borda direita, gaveta de 300 px que abre ao clicar no ícone,
     * telas com botão principal no topo e explicação atrás de um "?". */
    const CSS = `
    #tb-caixa{position:fixed;z-index:99999;display:flex;align-items:flex-start;gap:4px}
    #tb-caixa.tb-oculto{display:none}
    #tb-trilho{width:44px;background:#12151c;border:1px solid #2b3242;border-radius:10px;display:flex;flex-direction:column;align-items:center;padding:5px 0 4px;gap:1px;font:12px/1.4 ui-monospace,Consolas,monospace;color:#dde3ee;box-shadow:0 8px 30px #0009;transition:transform .15s}
    #tb-alca{width:26px;height:12px;border-radius:6px;background:#2b3242;cursor:grab;margin-bottom:5px}
    #tb-cab{cursor:grab}
    #tb-alca:active{cursor:grabbing}
    .tb-ico{position:relative;width:36px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#9fb0c9;font-size:17px;user-select:none}
    .tb-ico:hover{background:#232936;color:#fff}
    .tb-ico.on{background:#2c3550;color:#ffd479}
    .tb-ico .tb-dot{position:absolute;right:5px;top:4px;width:7px;height:7px;border-radius:4px;display:none}
    .tb-ico .tb-dot.ok{display:block;background:#6ede8a}
    .tb-ico .tb-dot.av{display:block;background:#ffd479}
    .tb-ico .tb-dot.ruim{display:block;background:#ff7b72}
    .tb-ico .tb-dot.pulsa{animation:tbpulsa 1.2s infinite}
    @keyframes tbpulsa{0%,100%{opacity:1}50%{opacity:.2}}
    #tb-esconder{margin-top:3px;font-size:12px;color:#7d879b;cursor:pointer;padding:2px 8px}
    #tb-esconder:hover{color:#fff}
    #tb-mostrar{position:fixed;right:0;top:84px;width:12px;height:44px;background:#2b3242;border-radius:7px 0 0 7px;cursor:pointer;z-index:99999;display:none}
    #tb-mostrar:hover{background:#3a4356}
    #tb-gaveta{width:300px;max-height:62vh;background:#12151c;color:#dde3ee;border:1px solid #2b3242;border-radius:10px;font:11.5px/1.4 ui-monospace,Consolas,monospace;box-shadow:0 12px 40px #000a;display:none;flex-direction:column}
    #tb-gaveta.on{display:flex}
    #tb-cab{display:flex;align-items:center;gap:6px;padding:6px 9px;border-bottom:1px solid #2b3242;background:#171b24;border-radius:10px 10px 0 0}
    #tb-cab b{color:#ffd479;letter-spacing:.3px;font-size:11px;text-transform:uppercase}
    .tb-x{margin-left:auto;cursor:pointer;color:#8b93a5;padding:0 4px}
    .tb-x:hover{color:#fff}
    #tb-corpo{padding:8px;overflow:auto;overflow-x:hidden;flex:1;overflow-wrap:anywhere}
    .tb-lin{display:flex;justify-content:space-between;gap:6px;padding:1px 0;border-bottom:1px dotted #232936}
    .tb-lin span:last-child{color:#fff;text-align:right}
    .tb-linha{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin:3px 0}
    .tb-bt{background:#2a3142;border:1px solid #3a4356;color:#dde3ee;padding:4px 8px;border-radius:6px;cursor:pointer;margin:2px 2px 2px 0;font:inherit}
    .tb-bt:hover{background:#39415a}
    .tb-bt:disabled{opacity:.45;cursor:default}
    .tb-bt.pri{background:#8a6a1f;border-color:#c39a34;color:#fff}
    .tb-bt.on{background:#2c5c3a;border-color:#4a9a63;color:#fff}
    .tb-bt.mini{padding:1px 6px;font-size:10.5px}
    .tb-cx{background:#1a1f29;border:1px solid #262d3b;border-radius:7px;padding:6px 7px;margin:5px 0}
    .tb-mut{color:#7d879b}
    .tb-ok{color:#6ede8a}.tb-ruim{color:#ff7b72}.tb-av{color:#ffd479}
    .tb-tag{font-size:10px;padding:0 5px;border-radius:9px;background:#2b3242;color:#9fb0c9;margin-left:3px;white-space:nowrap}
    .tb-ficha{display:inline-block;padding:0 5px;border-radius:5px;background:#232936;border:1px solid #2b3242;margin:1px 2px 1px 0;font-size:10.5px;white-space:nowrap}
    .tb-ficha.r{border-color:#4a3a8a}
    .tb-ficha small{color:#7d879b}
    table.tb-t{width:100%;border-collapse:collapse;font-size:10.5px;table-layout:fixed}
    table.tb-t th.n{width:52px}
    table.tb-t td .tb-tag{white-space:normal}
    table.tb-t th{text-align:left;color:#7d879b;font-weight:normal;border-bottom:1px solid #2b3242;padding:2px 3px}
    table.tb-t td{padding:2px 3px;border-bottom:1px dotted #1f2531;vertical-align:top}
    #tb-hunt,#tb-boss,.tb-in{background:#232936;color:#dde3ee;border:1px solid #3a4356;border-radius:5px;padding:3px 5px;font:inherit}
    #tb-hunt,#tb-boss{width:100%}
    #tb-log{font-size:10px;max-height:52vh;overflow:auto}
    #tb-log div{padding:1px 0;border-bottom:1px dotted #1f2531}
    .tb-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:5px 0}
    .tb-card{background:#1a1f29;border:1px solid #262d3b;border-radius:7px;padding:4px 7px}
    .tb-card small{display:block;color:#7d879b;font-size:9px;letter-spacing:.5px}
    .tb-card b{font-size:14px;color:#fff}
    .tb-sw{display:inline-block;width:34px;height:18px;border-radius:9px;background:#3a4356;position:relative;vertical-align:middle;cursor:pointer;flex:none}
    .tb-sw.on{background:#4a9a63}
    .tb-sw i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:7px;background:#fff;transition:left .15s}
    .tb-sw.on i{left:18px}
    .tb-sub{display:flex;gap:3px;margin:3px 0 5px}
    .tb-sub span{padding:2px 8px;border-radius:12px;background:#1a1f29;color:#8b93a5;cursor:pointer;border:1px solid #262d3b}
    .tb-sub span.on{background:#2c5c3a;color:#fff;border-color:#4a9a63}
    .tb-sub span b{color:#ffd479}
    .tb-eq{display:grid;grid-template-columns:46px 1fr 12px 1fr;gap:2px 5px;align-items:center;padding:3px 0;border-bottom:1px dotted #262d3b;cursor:pointer}
    .tb-eq .s{color:#7d879b;font-size:9px;letter-spacing:.3px;text-transform:uppercase}
    .tb-eq .g{color:#6ede8a;font-weight:bold}
    .tb-eq small{display:block;color:#7d879b;font-size:9.5px}
    .tb-rar{font-size:9px;padding:0 3px;border-radius:3px;margin-left:2px;background:#2b3242;color:#9fb0c9}
    .tb-rar.r1{color:#6ede8a}.tb-rar.r2{color:#5ab0ff}.tb-rar.r3{color:#c38bff}.tb-rar.r4{color:#ffb14a}.tb-rar.r5{color:#ff7b72}
    .tb-det{grid-column:1/-1;background:#12151c;border-radius:6px;padding:5px 7px;font-size:10.5px;cursor:default}
    .tb-det .m{color:#ff7b72;text-decoration:line-through;opacity:.8}
    .tb-det .neg{color:#ff7b72}
    details.tb-aj{margin:3px 0}
    details.tb-aj>summary{cursor:pointer;color:#7d879b;font-size:10px;list-style:none;display:inline-block;padding:0 7px;border:1px solid #2b3242;border-radius:9px;user-select:none}
    details.tb-aj>summary::-webkit-details-marker{display:none}
    details.tb-aj[open]>summary{color:#ffd479;border-color:#3a4356}
    details.tb-aj>div{margin-top:4px}
    label.tb-l{display:inline-flex;align-items:center;gap:3px;color:#9fb0c9}
    `;

    let ABA = 'magia';
    let ULTIMO = null;
    /* v2.8.3 — AVISO DE VERSÃO NOVA (dono, 29/09: "quando alterar aqui, altera
     * no GitHub e só dá um refresh"). O Tampermonkey só confere o @updateURL no
     * intervalo dele, não a cada F5. Então o helper mesmo lê o cabeçalho do
     * arquivo no GitHub (raw tem CORS aberto), compara o @version e, se houver
     * versão maior, acende ↑ no trilho. Clicar abre o link: o Tampermonkey
     * mostra a tela de atualizar, o dono confirma e dá F5. */
    const RAW_URL = 'https://raw.githubusercontent.com/priscilaenorthon-dev/tibidle-helper/main/tibidle-helper.user.js';
    let NOVA_VERSAO = null;
    const versaoMaior = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; };
    async function verificarAtualizacao() {
        try {
            const r = await fetch(RAW_URL + '?t=' + Date.now(), { cache: 'no-store' });
            if (!r.ok) return null;
            const cab = (await r.text()).slice(0, 2000);
            const v = (cab.match(/@version\s+(\S+)/) || [])[1];
            if (v && versaoMaior(v, VERSAO) && NOVA_VERSAO !== v) { NOVA_VERSAO = v; log('versão nova no GitHub: ' + v + ' (esta é ' + VERSAO + ') — clique em ↑ no trilho para atualizar', 'ok'); }
            try { pintarTrilho(); } catch (e) { }
            return v;
        } catch (e) { return null; }
    }
    function abrirAtualizacao() { window.open(RAW_URL, '_blank'); }
    /* v2.8.0 — estado da interface por conta: qual gaveta, aberta ou não,
     * posição vertical do trilho, trilho escondido. */
    const UI_PADRAO = { aba: 'magia', aberta: false, top: 84, right: 8, oculto: false };
    let UI = null;
    const ui = () => UI || (UI = Object.assign({}, UI_PADRAO, ler('ui', {})));
    const guardarUI = (patch) => { UI = Object.assign(ui(), patch); guardar('ui', UI); };
    const ICONES = [['estado', '⌂', 'Status'], ['magia', '✦', 'Magia'], ['autohunt', '↻', 'Auto Hunt'], ['scan', '◎', 'Scan'], ['equip', '⛨', 'Equip'], ['analise', '▤', 'Analisador'], ['progresso', '⚑', 'Progresso'], ['log', '≡', 'Log']];
    /* "?" com a explicação escondida; data-k preserva aberto/fechado ao repintar */
    const aj = (k, html, rotulo) => `<details class="tb-aj" data-k="${k}"><summary>${rotulo || '?'}</summary><div class="tb-mut">${html}</div></details>`;

    /* v2.8.4 — o helper não fica mais preso na borda: trilho + gaveta vivem
     * numa caixa solta (#tb-caixa), arrastável pela alça ou pelo cabeçalho
     * da gaveta para qualquer canto; posição (right/top) guardada por conta. */
    let _caixa = null;
    function posicionarCaixa() {
        const cx = _caixa, m = $('#tb-mostrar'); if (!cx) return;
        const u = ui(), w = cx.offsetWidth || 44, h = Math.min(cx.offsetHeight || 60, 120);
        const right = Math.max(0, Math.min(window.innerWidth - w, +u.right || 0));
        const top = Math.max(0, Math.min(window.innerHeight - h, +u.top || 84));
        u.right = right; u.top = top;
        cx.style.right = right + 'px'; cx.style.top = top + 'px';
        if (m) m.style.top = top + 'px';
    }
    function montarPainel() {
        if ($('#tb-trilho')) return;
        const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
        const u = ui(); ABA = ICONES.some(x => x[0] === u.aba) ? u.aba : 'magia';
        const cx = document.createElement('div'); cx.id = 'tb-caixa'; _caixa = cx;
        const t = document.createElement('div'); t.id = 'tb-trilho';
        t.innerHTML = `<div id="tb-alca" title="arrastar"></div>` +
            ICONES.map(([k, ic, nome]) => `<div class="tb-ico" data-aba="${k}" title="${nome}">${ic}<span class="tb-dot"></span></div>`).join('') +
            `<div class="tb-ico" id="tb-atualizar" title="versão nova disponível" style="display:none;color:#6ede8a">↑</div>` +
            `<div id="tb-esconder" title="esconder o helper">›</div>`;
        const g = document.createElement('div'); g.id = 'tb-gaveta';
        g.innerHTML = `<div id="tb-cab" title="arrastar"><b id="tb-titulo"></b><span class="tb-mut">v${VERSAO}</span><span class="tb-x" id="tb-fechar" title="fechar">✕</span></div><div id="tb-corpo"></div>`;
        const m = document.createElement('div'); m.id = 'tb-mostrar'; m.title = 'mostrar o helper';
        cx.append(g, t);
        document.body.append(cx, m);
        posicionarCaixa();
        const mostrar = (v) => { cx.classList.toggle('tb-oculto', !v); m.style.display = v ? 'none' : 'block'; if (!v) g.classList.remove('on'); };
        $$('.tb-ico[data-aba]', t).forEach(i => i.onclick = () => { const k = i.dataset.aba; const aberta = !(ui().aberta && ABA === k); ABA = k; guardarUI({ aba: k, aberta }); renderizar(); });
        $('#tb-fechar').onclick = () => { guardarUI({ aberta: false }); renderizar(); };
        $('#tb-atualizar').onclick = abrirAtualizacao;
        $('#tb-esconder').onclick = () => { guardarUI({ oculto: true }); mostrar(false); };
        m.onclick = () => { guardarUI({ oculto: false }); mostrar(true); renderizar(); };
        let arr = null;
        const pegar = e => { if (e.button !== 0 || e.target.closest('.tb-x')) return; arr = { x: e.clientX, y: e.clientY, right: ui().right, top: ui().top }; e.preventDefault(); };
        $('#tb-alca').addEventListener('mousedown', pegar);
        $('#tb-cab').addEventListener('mousedown', pegar);
        document.addEventListener('mousemove', e => { if (!arr) return; ui().right = arr.right - (e.clientX - arr.x); ui().top = arr.top + (e.clientY - arr.y); posicionarCaixa(); });
        document.addEventListener('mouseup', () => { if (arr) { arr = null; guardarUI({ right: ui().right, top: ui().top }); } });
        window.addEventListener('resize', posicionarCaixa);
        mostrar(!u.oculto);
        renderizar();
    }
    function pintarLog() {
        const c = $('#tb-log'); if (!c) return;
        c.innerHTML = LOG.slice(-80).reverse().map(l => {
            const cor = l.tipo === 'erro' ? 'tb-ruim' : l.tipo === 'ok' ? 'tb-ok' : 'tb-mut';
            const h = new Date(l.t).toLocaleTimeString('pt-BR');
            return `<div><span class="tb-mut">${h}</span> <span class="${cor}">${l.msg}</span></div>`;
        }).join('');
    }

    /* v1.9.0 — STATUS no layout do Stonegy (print do dono, 27/09): cartões
     * LEVEL / OURO / CAP LIVRE / TAXA XP, linha da hunt e os dois botões
     * grandes. Os botões antigos continuam embaixo. */
    function telaEstado() {
        const h = huntAtual(), dentro = emHunt(), c = capLivre(), taxa = dentro ? lerTaxaXp() : null, a = autoHunt();
        const card = (r, v) => `<div class="tb-card"><small>${r}</small><b>${v}</b></div>`;
        const lin = (x, y) => `<div class="tb-lin"><span class="tb-mut">${x}</span><span>${y}</span></div>`;
        const huntTxt = ESTADO_WS.boss && ESTADO_WS.boss !== '?' ? 'boss ' + ESTADO_WS.boss : h ? h.title : (dentro ? 'hunt ?' : '');
        return `<div class="tb-linha"><span class="${dentro ? 'tb-ok' : 'tb-mut'}">${dentro ? '● caçando' : '○ cidade'}</span>${a.on ? '<span class="tb-tag tb-ok">Auto Hunt</span>' : ''}${_cicloEmCurso ? '<span class="tb-tag tb-av">vendendo…</span>' : ''}<span class="tb-mut" style="margin-left:auto;text-align:right">${huntTxt}</span></div>
          <div class="tb-grid">
            ${card('NÍVEL', nivelAtual())}
            ${card('OURO', ouroAtual().toLocaleString('pt-BR'))}
            ${card('CAP LIVRE', c ? `${c.pct}% <span class="tb-mut" style="font-size:10px">${c.ozTxt} oz</span>` : '—')}
            ${card('TAXA XP', taxa != null ? taxa + '%' : '—')}
          </div>
          ${NOVA_VERSAO ? `<button class="tb-bt on" id="tb-bt-atualizar" style="width:100%">↑ atualizar para a ${NOVA_VERSAO}</button>` : ''}
          <button class="tb-bt pri" id="tb-venda-rapida" style="width:100%;font-size:13px;padding:8px" ${_cicloEmCurso ? 'disabled' : ''}>Venda rápida</button>
          <button class="tb-bt" id="tb-finalizar" style="width:100%" ${_cicloEmCurso || !dentro ? 'disabled' : ''}>Finalizar hunt</button>
          ${aj('estado-ajuda', 'Venda rápida: encerra a caçada (se estiver nela) → purifica todos → vende no NPC → guarda no depot, e fica na cidade. Finalizar hunt: só encerra e fecha o resumo.')}
          <details class="tb-aj" data-k="estado-av"><summary>avançado</summary><div>
            <div class="tb-cx">
              ${lin('Vocação na tela', vocacaoAtual())}
              ${lin('Lure máx', h ? lureMax(h) + ' criaturas' : '—')}
              ${lin('Catálogos', CAT.hunts ? `<span class="tb-ok">${CAT.hunts.length} hunts · ${CAT.magias.length} magias</span>` : '<span class="tb-ruim">não carregados</span>')}
              ${lin('Danos medidos', (() => { const n = danosMedidosNesteNivel(), v = Object.keys(danosConhecidos()).length - n; return n + ' neste nível' + (v ? ` <span class="tb-av">+${v} de outro</span>` : ''); })())}
            </div>
            <button class="tb-bt mini" id="tb-recat">Rebaixar catálogos</button>
            <button class="tb-bt mini" id="tb-aprender">Aprender dano (os 4)</button>
            <button class="tb-bt mini" id="tb-confhunt">Confirmar hunt</button>
            <button class="tb-bt mini" id="tb-autosell">Auto-sell: marcar tudo</button>
            <div class="tb-mut" style="font-size:10px;margin-top:4px">F5 zera a marcação do Auto Selling — depois de recarregar, "Auto-sell: marcar tudo".</div>
          </div></details>`;
    }
    /* v1.9.0 — AUTO HUNT (print do Stonegy). Chave desligada por padrão,
     * guardada por conta e sobrevive a F5 (o boot avisa no log). */
    function telaAutoHunt() {
        const a = autoHunt(), c = capLivre(), dentro = emHunt();
        const h = a.huntId != null && CAT.hunts ? CAT.hunts.find(x => x.id === a.huntId) : null;
        const motivo = motivoNaoDispara();
        const estado = motivo === '' ? '<span class="tb-ok">disparando…</span>' : motivo === null ? '<span class="tb-ok">vigiando a mochila</span>' : `<span class="tb-av">${motivo}</span>`;
        return `<div class="tb-linha"><span class="tb-sw ${a.on ? 'on' : ''}" id="tb-ah-on"><i></i></span><b>Automação</b><span class="tb-mut" style="margin-left:auto">${estado}</span></div>
          <div class="tb-linha"><span class="tb-mut">hunt</span><b>${h ? h.title : '—'}</b>
            <button class="tb-bt mini" id="tb-ah-memorizar" ${dentro ? '' : 'disabled'} title="memorizar a hunt atual">📍 esta</button>
            <button class="tb-bt mini" id="tb-ah-esquecer" ${a.huntId != null ? '' : 'disabled'}>esquecer</button></div>
          <div class="tb-linha"><span class="tb-mut">vender quando</span>
            <label class="tb-l"><input type="radio" name="tb-ah-modo" value="pct" ${a.modo === 'pct' ? 'checked' : ''}> ≤</label><input type="number" class="tb-in" id="tb-ah-pct" value="${a.pct}" min="1" max="99" style="width:44px">%
            <label class="tb-l"><input type="radio" name="tb-ah-modo" value="oz" ${a.modo === 'oz' ? 'checked' : ''}> ≤</label><input type="number" class="tb-in" id="tb-ah-oz" value="${a.oz}" min="10" step="10" style="width:56px">oz</div>
          <div class="tb-linha"><span class="tb-mut">agora</span><span>${c ? `${c.pct}% · ${c.ozTxt} oz livres` : '—'}</span>${mochilaNoLimite() ? '<span class="tb-tag tb-ruim">no limite</span>' : ''}</div>
          <label class="tb-l"><input type="checkbox" id="tb-ah-voltar" ${a.voltar ? 'checked' : ''}> voltar para a hunt depois de vender</label>
          ${aj('ah-ajuda', 'Ciclo: finalizar → purificar todos → vender no NPC → guardar no depot → voltar. Qualquer falha para o ciclo e desliga a chave (ver Log). Intervalo mínimo entre ciclos: 5 min. Se trocar de hunt na mão, clique "📍 esta" dentro dela. Lure e magia não são tocados ao voltar.')}`;
    }
    /* v2.2.0 — SCAN. Lista de mapas do seu nível com caixinha; minutos por
     * mapa; o que fazer ao terminar; progresso ao vivo; tabela de veredito. */
    function telaScan() {
        const c = scanCfg(), nv = nivelAtual(), marc = new Set(c.mapas);
        const hunts = (CAT.hunts || []).filter(h => (h.levelMin || 1) <= nv).sort((a, b) => (b.levelMin || 0) - (a.levelMin || 0) || a.title.localeCompare(b.title));
        const res = scanResultados(), v = scanVereditos();
        const fmtK = n => (n / 1000).toFixed(1) + 'k';
        const fmtO = n => (n >= 0 ? '+' : '') + n.toLocaleString('pt-BR');
        const falta = xpFaltando();
        const tNivel = xpH => falta != null && xpH > 0 ? fmtHoras(falta / xpH) : '—';
        const dis = SCAN.ativo ? 'disabled' : '';
        let corpo = `<div class="tb-linha"><span class="tb-sw ${SCAN.ativo ? 'on' : ''}" id="tb-scan-on"><i></i></span><b>Scan</b>
            <span class="tb-mut" style="margin-left:auto">${SCAN.ativo ? `<span class="tb-ok">rodando</span> ${Math.max(1, SCAN.idx + 1)}/${SCAN.fila.length}` : marc.size + ' mapa(s)'}</span></div>`;
        if (SCAN.ativo) {
            const h = scanHuntAtual(), m = SCAN.vivo;
            const resta = SCAN.fase === 'medindo' ? Math.max(0, c.minutos * 60 - (Date.now() - SCAN.t0) / 1000) : null;
            corpo += `<div class="tb-cx" style="border-color:#2c5c3a"><b>${h ? h.title : '?'}</b> <span class="tb-tag">${SCAN.fase}</span>` +
                (resta != null ? ` <span class="tb-mut">${Math.floor(resta / 60)}:${String(Math.round(resta % 60)).padStart(2, '0')}</span>` : '') +
                (m && m.seg >= 30 ? `<div>xp/h <b>${fmtK(m.xpH)}</b> · ouro/h <b class="${m.ouroH >= 0 ? 'tb-ok' : 'tb-ruim'}">${fmtO(m.ouroH)}</b> · estável <b class="${(m.estavelH || 0) >= 0 ? 'tb-ok' : 'tb-ruim'}">${m.estavelH != null ? fmtO(m.estavelH) : '—'}</b> · ${m.abatesH}/h</div>` + razaoHtml(m.razao, true) : (SCAN.fase === 'medindo' ? '<div class="tb-mut">aquecendo… (30 s)</div>' : '')) +
                (SCAN.erro ? `<div class="tb-ruim">${SCAN.erro}</div>` : '') + `</div>`;
        }
        corpo += `<div class="tb-linha"><input type="number" class="tb-in" id="tb-scan-min" value="${c.minutos}" min="1" max="60" style="width:40px" ${dis}><span class="tb-mut">min/mapa</span>
            <label class="tb-l"><input type="checkbox" id="tb-scan-lure" ${c.lureMax ? 'checked' : ''} ${dis}> lure máx</label>
            <label class="tb-l"><input type="radio" name="tb-scan-modelo" value="equilibrado" ${(c.modelo || 'equilibrado') === 'equilibrado' ? 'checked' : ''} ${dis}> Equil.</label>
            <label class="tb-l"><input type="radio" name="tb-scan-modelo" value="inteligente" ${c.modelo === 'inteligente' ? 'checked' : ''} ${dis}> Intel.</label></div>
          <div class="tb-linha"><span class="tb-mut">ao terminar</span>
            <label class="tb-l"><input type="radio" name="tb-scan-fim" value="ficar" ${c.fim === 'ficar' ? 'checked' : ''}> ficar</label>
            <label class="tb-l"><input type="radio" name="tb-scan-fim" value="xp" ${c.fim === 'xp' ? 'checked' : ''}> melhor xp</label>
            <label class="tb-l"><input type="radio" name="tb-scan-fim" value="ouro" ${c.fim === 'ouro' ? 'checked' : ''}> melhor ouro</label></div>
          <details class="tb-aj" data-k="scan-estudo"><summary>estudo de variantes</summary><div>
            <label class="tb-l"><input type="checkbox" id="tb-scan-comparar" ${c.comparar ? 'checked' : ''} ${dis}> em cada mapa, medir cada variante</label>
            ${c.comparar ? '<div style="margin:2px 0 0 4px">' + ['inteligente', 'inteligente_seco', 'inteligente_semruna', 'inteligente_mana', 'equilibrado', 'economica', 'area'].map(m => `<label class="tb-l" style="margin-right:6px"><input type="checkbox" data-scan-var="${m}" ${(c.variantes || []).includes(m) ? 'checked' : ''} ${dis}> ${nomeModelo(m)}</label>`).join('') + '</div>' : ''}
          </div></details>
          <details class="tb-aj" data-k="scan-mapas"><summary>mapas (${marc.size} marcados)</summary><div>
            <div class="tb-linha"><input class="tb-in" id="tb-scan-filtro" placeholder="filtrar…" style="flex:1"><button class="tb-bt mini" id="tb-scan-limpar-mapas">desmarcar</button></div>
            <div id="tb-scan-lista" style="max-height:160px;overflow:auto">` +
            hunts.map(h => `<label style="display:block;padding:0"><input type="checkbox" data-scan-mapa="${h.id}" ${marc.has(h.id) ? 'checked' : ''} ${dis}> <span class="tb-mut">[${h.levelMin || 1}]</span> ${h.title}${res[h.id] && !res[h.id].erro ? ` <span class="tb-tag tb-ok">${fmtK(res[h.id].xpH)} · ${fmtO(ouroBase(res[h.id]))}</span>` : ''}</label>`).join('') +
            `</div></div></details>`;
        if (v.lista.length || Object.keys(res).length) {
            corpo += `<div class="tb-linha" style="margin-top:6px"><b>Resultados</b><span class="tb-mut">${c.minutos} min cada</span><button class="tb-bt mini" id="tb-scan-limpar" style="margin-left:auto">limpar</button></div>
              <table class="tb-t"><tr><th>mapa</th><th class="n">xp/h</th><th class="n">ouro/h</th><th style="width:58px">veredito</th></tr>` +
              v.lista.map(r => `<tr>
                <td>${r.title}${r.suja ? ' <span class="tb-tag tb-ruim">mochila</span>' : ''}${r.modelo && r.modelo !== 'equilibrado' ? ` <span class="tb-tag tb-ok">${nomeModelo(r.modelo)}</span>` : ''}
                  <div class="tb-mut" style="font-size:9.5px">lure ${r.lureTxt || r.lure} · ${r.abatesH}/h${r.tomadoH != null ? ` · tomou ${(r.tomadoH / 1000).toFixed(0)}k/h` : ''} · <span data-scan-ir="${r.id}" style="cursor:pointer;color:#ffd479" title="ir para este mapa">ir ›</span></div>
                  ${razaoTexto(r.razao) ? `<details class="tb-aj" data-k="scan-r-${r.id}-${r.modelo}"><summary>+</summary><div style="font-size:10px">${razaoHtml(r.razao, true)}${r.supVoc ? `<div>poção: ${Object.entries(r.supVoc).map(([vv, x]) => (VOC_CURTO[vv] || vv) + ' ' + x.ouro + 'o').join(' · ')}</div>` : ''}${r.sorte ? `<div class="tb-av">sorte +${r.sorte.toLocaleString('pt-BR')}: ${(r.raros || []).join(', ')}</div>` : ''}</div></details>` : ''}</td>
                <td class="${r.xpH >= v.melhorXp * 0.9 ? 'tb-ok' : ''}">${fmtK(r.xpH)}<div class="tb-mut" style="font-size:9.5px">${tNivel(r.xpH)}</div></td>
                <td class="${ouroBase(r) < 0 ? 'tb-ruim' : ouroBase(r) >= v.melhorOuro * 0.9 ? 'tb-ok' : ''}">${fmtO(ouroBase(r))}<div class="tb-mut" style="font-size:9.5px">${r.estavelH != null ? 'estável' : 'bruto'}</div></td>
                <td><b class="${r.veredito === 'Os dois' ? 'tb-ok' : r.veredito === 'dá prejuízo' ? 'tb-ruim' : /^abaixo/.test(r.veredito) ? 'tb-mut' : 'tb-av'}" style="${/^abaixo/.test(r.veredito) ? 'font-weight:normal;font-size:9.5px' : ''}">${r.veredito}</b></td>
              </tr>`).join('') +
              Object.values(res).filter(r => r.erro).map(r => `<tr><td colspan="4" class="tb-ruim">${r.title}: ${r.erro}</td></tr>`).join('') +
              `</table>
              <div class="tb-mut" style="font-size:10px;margin-top:4px">${v.topXp ? `upar: <b>${v.topXp.title}</b>${falta != null ? ' (nível em ' + tNivel(v.topXp.xpH) + ')' : ''}. ` : ''}${v.topOuro && ouroBase(v.topOuro) > 0 ? `ouro: <b>${v.topOuro.title}</b>.` : 'nenhum mapa deu ouro positivo.'}</div>
              ${aj('scan-legenda', '<b>estável</b> = ouro/h só com moedas e itens que o catálogo espera cair 3+ vezes na janela; o resto é loteria e aparece como sorte. Veredito: "XP" = 90% do melhor XP; "Ouro" = 90% do melhor ouro estável; "Os dois" = ambos. ouro/h = loot − poção, pelo analisador do jogo. "mochila" = ficou abaixo de ' + CAP_MIN_SCAN + '% livre e perdeu loot.')}`;
        } else {
            corpo += aj('scan-ajuda', 'Marque os mapas, ajuste os minutos e ligue a chave. O Scan entra em cada mapa pelo socket, aplica o modelo nos 4, espera os minutos e anota xp/h, ouro/h e abates/h. O Auto Hunt fica quieto enquanto o Scan roda.');
        }
        return corpo;
    }
    /* =========================================================================
     *  TELA DE MAGIA — enxuta de propósito
     *
     *  Pedido do Northon (30/08): usar SÓ dentro da hunt, sem escolher nome de
     *  mapa e sem texto. Então a hunt é detectada pelos monstros na tela e a
     *  tela virou botão + uma linha.
     *
     *  ⚠ Mantive UMA linha de estado, e essa não é enfeite: ela mostra qual
     *  hunt foi detectada e se a caçada se paga. Sem ela, uma detecção errada
     *  aplicaria elemento errado em silêncio — e foi assim que Vampire hell
     *  deu −138k/h. O detalhe todo continua na aba Analisador. */
    function telaMagia() {
        const det = detectarHunt(), manual = ler('hunt_id', null), modelo = ler('modelo', 'equilibrado'), nv = nivelAtual();
        let h = huntAtual();
        let corpo = `<div class="tb-linha">` + Object.keys(MODELOS).map(k => `<button class="tb-bt mini ${k === modelo ? 'on' : ''}" data-modelo="${k}" title="${MODELOS[k].dica}">${MODELOS[k].nome}</button>`).join('') + `</div>`;
        const ordenadas = (CAT.hunts || []).slice().sort((a, b) => (a.levelMin || 0) - (b.levelMin || 0) || a.title.localeCompare(b.title));
        corpo += `<select id="tb-hunt"><option value="">— escolhe a caçada —</option>` +
            ordenadas.map(c => `<option value="${c.id}" ${c.id === manual ? 'selected' : ''}>[${c.levelMin || 1}] ${c.title}${(c.levelMin || 0) > nv ? ' ⚠' : ''}</option>`).join('') + `</select>` +
            (det && det.hunt && det.hunt.id !== manual ? `<div class="tb-mut" style="font-size:10px">palpite: <b>${det.hunt.title}</b> <button class="tb-bt mini" data-usar-palpite="${det.hunt.id}">usar</button></div>` : '');
        let alvo = h;
        if (ESTADO_WS.boss && ESTADO_WS.boss !== '?') corpo += `<div class="tb-mut">boss em andamento: <b>${ESTADO_WS.boss}</b></div>`;
        if (modelo === 'boss') {
            const bn = (ESTADO_WS.boss && ESTADO_WS.boss !== '?') ? ESTADO_WS.boss : ler('boss_nome', null);
            const bosses = (CAT.bosses || []).slice().sort((a, b) => (a.health || 0) - (b.health || 0) || a.name.localeCompare(b.name));
            corpo += `<select id="tb-boss" style="margin-top:4px"><option value="">— escolhe o boss —</option>` + bosses.map(b => `<option value="${b.name}" ${b.name === bn ? 'selected' : ''}>${b.name} · ${b.health} HP</option>`).join('') + `</select>`;
            alvo = huntDeBoss(bn);
            if (alvo) corpo += `<div class="tb-mut" style="font-size:10px">${(alvo.monsters[0].elements || []).map(e => rotuloElem(e.type) + ' ' + (e.percent > 0 ? '−' : '+') + Math.abs(e.percent) + '%').join(' · ') || 'sem resistências'}</div>`;
        }
        if (!alvo) return corpo + `<div class="tb-mut" style="margin-top:6px">escolha a caçada para ver o plano</div>`;
        h = alvo;
        if (!h.boss && LOOT_CACHE[h.id] == null) ouroPorAbate(h.id).then(v => { if (v != null) renderizar(); });
        if (!h.boss && h.monsters && h.monsters.some(m => !BESTIARIO[m.name])) bestiarioHunt(h).then(() => renderizar()).catch(() => { });
        const r = montarPlano(modelo, h);
        ULTIMO = r;
        if (r.erro) return corpo + `<div class="tb-cx tb-ruim">${r.erro}</div>`;
        const vp = r.viab ? viabilidadeParty(modelo, h) : null;
        const cabe = vp ? vp.cabe : null;
        corpo += `<button class="tb-bt pri" id="tb-aplicar-todos" ${_aplicando ? 'disabled' : ''} style="width:100%;font-size:13px;padding:8px;margin-top:6px">${_aplicando ? 'APLICANDO…' : 'APLICAR NOS 4'}</button>` +
            (vp ? (vp.regen
                ? `<div class="tb-mut" style="font-size:10px">mana OFF: magia sai da regeneração (0 ouro). Com poção seriam ${vp.custoPorAbate}o/abate contra ${vp.loot}o de loot.</div>`
                : `<div style="font-size:10px" class="${cabe ? 'tb-ok' : 'tb-ruim'}">${cabe ? 'se paga' : 'NÃO se paga'}: ${vp.custoPorAbate}o/abate contra ${vp.loot}o de loot · mana: ${VOCS.map(v => VOC_CURTO[v] + (manaPotionLigada(v) ? ' on' : ' off')).join(' · ')}</div>`) : '');
        const ficha = p => `<span class="tb-ficha${p.av.m.isRune ? ' r' : ''}" title="${p.av.m.name} · mínimo ${p.minimo} criatura(s)${p.av.medidoNoMapa ? ' · ' + p.av.porLancamento + ' de dano medido por lançamento neste mapa' : ''}">${p.av.m.name} <small>≥${p.minimo}${p.av.medidoNoMapa ? ' · ' + p.av.porLancamento : ''}</small></span>`;
        corpo += `<div class="tb-cx">` + VOCS.map(v => {
            const rv = montarPlano(modelo, h, v);
            if (rv.erro) return `<div><b>${VOC_CURTO[v]}</b> <span class="tb-ruim">${rv.erro}</span></div>`;
            const x = rv.extras;
            return `<div style="margin:2px 0"><b style="color:#ffd479">${VOC_CURTO[v]}</b> ${rv.plano.map(ficha).join('') || '<span class="tb-ruim">sem magia com dano conhecido</span>'}` +
                (x ? `<div class="tb-mut" style="font-size:9.5px;margin-left:24px">${x.heals.filter(Boolean).map(c => c.name.replace(' Potion', '') + ' ≤' + c.percent).join(' · ')} · mana ${x.manaPotion.name ? x.manaPotion.name.replace(' Potion', '') + ' ≤' + x.manaPotion.percent : 'off'} · ${x.supports.filter(Boolean).join(' + ') || 'sem suporte'}${x.ammo ? ' · ' + x.ammo : ''}</div>` : '') + `</div>`;
        }).join('') + `</div>`;
        const linhas = [];
        if (emHunt() && RAZAO.kills) { const rz = razaoResumo(RAZAO); if (rz.danoTotal) linhas.push(`<div><b>grupo ao vivo</b> — ${Math.round(rz.seg / 60)} min · ${rz.kills} abates · tomou ${(rz.tomadoH / 1000).toFixed(1)}k/h</div>${razaoHtml(rz, false)}`); }
        if (h.bestiary && h.bestiary.stages && h.bestiary.stages.length) linhas.push(`<div><b>bestiário</b>: ${h.bestiary.bonus} <span class="tb-tag">${h.bestiary.stages.map(e => `${(e.kills / 1000).toFixed(e.kills % 1000 ? 1 : 0)}k → +${e.value}`).join(' · ')}</span></div>`);
        linhas.push(`<div>${MODELOS[modelo] ? MODELOS[modelo].dica : ''} Nada é aplicado sozinho. ${socketAberto() && ESTADO_WS.profiles ? 'Aplica pelo socket, sem abrir janela.' : 'Aplica pelos diálogos do jogo.'}</div>`);
        corpo += aj('magia-mais', linhas.join(''), 'detalhes');
        return corpo;
    }
    function telaAnalise() {
        const lin = (a, b) => `<div class="tb-lin"><span class="tb-mut">${a}</span><span>${b}</span></div>`;
        let corpo = '';
        if (SESSAO && SESSAO.amostras.length >= 2) {
            const a0 = SESSAO.amostras[0], aN = SESSAO.amostras[SESSAO.amostras.length - 1];
            const dur = Math.max(1, (aN.t - a0.t) / 1000);
            const ouroH = Math.round((aN.ouro - a0.ouro) / dur * 3600);
            const expH = (aN.exp != null && a0.exp != null) ? Math.round((aN.exp - a0.exp) / dur * 3600) : null;
            const ab = (aN.abates != null && a0.abates != null) ? aN.abates - a0.abates : null;
            const pct = Math.round((aN.mochilaPct || 0) * 100);
            corpo += `<div class="tb-cx" style="border-color:#2c5c3a"><div class="tb-mut">medindo — ${SESSAO.huntTitle} · ${Math.floor(dur / 60)}m${String(Math.round(dur % 60)).padStart(2, '0')}</div>
                ${lin('ouro/h', `<b class="${ouroH >= 0 ? 'tb-ok' : 'tb-ruim'}">${ouroH >= 0 ? '+' : ''}${ouroH.toLocaleString('pt-BR')}</b>`)}
                ${lin('exp/h', expH != null ? expH.toLocaleString('pt-BR') : '—')}
                ${lin('abates', ab != null ? `${ab} (${Math.round(ab / dur * 3600)}/h)` : '—')}
                ${lin('mochila', `<span class="${pct > 85 ? 'tb-ruim' : pct > 60 ? 'tb-av' : ''}">${pct}%</span>`)}
                ${pct > 85 ? '<div class="tb-ruim" style="font-size:10px">mochila acima de 85%: o loot se perde e a medição sai suja</div>' : ''}</div>`;
        } else corpo += `<div class="tb-mut">sem medição: liga sozinho ao entrar numa caçada</div>`;
        const res = resumoPorHunt();
        if (res.length) {
            corpo += `<table class="tb-t"><tr><th>hunt</th><th>ouro/h</th><th>exp/h</th><th>tempo</th><th>fator</th></tr>` +
              res.map(p => `<tr><td>${p.hunt}${p.sujas ? ` <span class="tb-tag tb-ruim">${p.sujas} suja</span>` : ''}${p.regen ? ` <span class="tb-tag">regen</span>` : ''}</td>
                <td class="${p.ouroH >= 0 ? 'tb-ok' : 'tb-ruim'}">${p.ouroH >= 0 ? '+' : ''}${(p.ouroH / 1000).toFixed(1)}k</td><td>${(p.expH / 1000).toFixed(1)}k</td><td class="tb-mut">${Math.round(p.dur / 60)}min</td><td class="tb-av">${p.fatorMedio != null ? p.fatorMedio : '—'}</td></tr>`).join('') + `</table>`;
            const comFator = res.filter(p => p.fatorMedio != null && p.hp);
            if (comFator.length) corpo += aj('an-curva', `<table class="tb-t"><tr><th>hunt</th><th>HP</th><th>curva</th><th>medido</th><th>erro</th></tr>` + comFator.map(p => { const prev = Math.round(fatorDesperdicio(p.hp) * 100) / 100; const erro = Math.round((p.fatorMedio / prev - 1) * 100); return `<tr><td>${p.hunt}</td><td>${p.hp}</td><td>${prev}</td><td class="tb-av">${p.fatorMedio}</td><td class="${Math.abs(erro) < 25 ? 'tb-ok' : 'tb-ruim'}">${erro > 0 ? '+' : ''}${erro}%</td></tr>`; }).join('') + `</table><div style="font-size:10px">fator = desperdício real por abate contra a curva 0,47 × HP^0,332 (2 pontos).</div>`, 'calibração');
        }
        const tipos = Object.keys(WS.tipos).sort((a, b) => WS.tipos[b] - WS.tipos[a]);
        const envs = Object.keys(WS.enviados).sort((a, b) => WS.enviados[b].n - WS.enviados[a].n);
        corpo += aj('an-ws', `socket ${WS.socket ? '<span class="tb-ok">capturado</span>' : '<span class="tb-av">ainda não</span>'} · ${WS.frames} frames em ~${Math.max(1, Math.round((Date.now() - WS.desde) / 60000))} min<br>` +
            (tipos.length ? 'recebidos: ' + tipos.slice(0, 10).map(t => `<span class="tb-tag">${t} ×${WS.tipos[t]}</span>`).join('') + '<br>' : '') +
            (envs.length ? 'enviados: ' + envs.map(t => `<span class="tb-tag tb-ok">${t} ×${WS.enviados[t].n}</span>`).join('') : 'nenhum frame enviado ainda'), 'websocket');
        corpo += `<div class="tb-linha" style="margin-top:4px"><button class="tb-bt mini" id="tb-exportar">copiar JSON</button><button class="tb-bt mini" id="tb-limpar-sessoes">limpar histórico</button></div>`;
        return corpo;
    }
    /* v2.4.0 — EQUIP. 4 sub-abas; por slot: atual → melhor (+ganho) e 2
     * motivos; clique expande os atributos (mortos riscados). Seções
     * Dispensáveis e Reservas. NADA equipa nem descarta. */
    const RAR_NOME = ['comum', 'incomum', 'raro', 'épico', 'lendário', 'mítico'];
    const VOC_ROTULO = { KNIGHT: 'Knight', PALADIN: 'Paladino', SORCERER: 'Feiticeiro', DRUID: 'Druida' };
    /* 28/09: com 0,5 ele sugeria trocar um bonelord shield por outro quase igual (+0,55). */
    const GANHO_MIN = 1;     // abaixo disso é empate técnico: não vale a troca
    const EQUIP = { voc: 'KNIGHT', abertos: new Set(), base: null, res: null, lendo: false, erro: null, aviso: null, t: 0, verReservas: false, verTudo: false, equipando: false, ctx: null };
    const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const rarTag = (p) => { const r = (p.forja && p.forja.raridade) || 0; return `<span class="tb-rar r${r}">${RAR_NOME[r] || r}</span>`; };
    /* v2.9.0 — o que os pesos ofensivos precisam (pesosDaVoc): nível, skills
     * vistas no frame, ataque da arma do Knight (base + refino) e quanto do dano
     * do Paladino vem de magia/runa (livro-razão da última caçada). */
    function contextoEquip(roster) {
        const sk = {};
        const vistas = Object.assign({}, ler('skills_vistas', {}), ESTADO_WS.sk || {});
        for (const v of VOCS) if (vistas[v]) sk[v] = Object.assign({}, vistas[v]);
        const kn = (roster || []).find(r => r && r.vocation === 'KNIGHT');
        const arma = kn && kn.equipment && kn.equipment.weapon;
        if (arma && arma.name) {
            const b = (EQUIP.base && EQUIP.base[arma.name] && EQUIP.base[arma.name].attrs) || {};
            const atk = Number((arma.attrs && arma.attrs.attack) || b.attack) + (Number(arma.forja && arma.forja.refino) || 0);
            if (atk > 0) sk.KNIGHT = Object.assign(sk.KNIGHT || {}, { atkArma: atk });
        }
        const fracMagica = {};
        try {
            const rz = razaoResumo(RAZAO), pv = rz.porVoc.PALADIN;
            if (pv && pv.dano >= 2000) fracMagica.PALADIN = Math.round(rz.magias.filter(m => m.voc === 'PALADIN').reduce((s, m) => s + m.dano, 0) / pv.dano * 100) / 100;
        } catch (e) { }
        return { nivel: nivelAtual(), sk, fracMagica };
    }
    async function equipAtualizar() {
        if (EQUIP.lendo) return;
        EQUIP.lendo = true; EQUIP.erro = null; EQUIP.aviso = null; renderizar();
        try {
            const roster = rosterEquip();
            if (!roster) throw new Error('não achei o equipamento dos 4 (entre na cidade e tente de novo)');
            const d = await lerDepot();
            if (d.erro) { EQUIP.aviso = d.erro + ' — ranqueando só o que está no corpo'; log('equip: ' + EQUIP.aviso, 'erro'); }
            else if (d.aviso) EQUIP.aviso = d.aviso;
            const nomes = [];
            for (const r of roster) for (const it of Object.values(r.equipment || {})) if (it && it.name) nomes.push(it.name);
            for (const e of ((ESTADO_WS.depot && ESTADO_WS.depot.entries) || [])) if (e.forja && e.slot) nomes.push(e.itemName);
            const mochila = mochilaEquip();
            for (const e of mochila) if (e && e.name) nomes.push(e.name);
            EQUIP.base = await basePorNome(nomes);
            const pecas = candidatosEquip(roster, d.depot || null, EQUIP.base, mochila);
            /* v2.7.3 — elemento da wand/rod contra o mapa atual */
            const hz = huntAtual(); const nz = hz ? notasElementos(hz) : null;
            EQUIP.ctx = Object.assign({ notas: nz ? nz.notas : null, mapa: hz ? hz.title : null }, contextoEquip(roster));
            EQUIP.res = distribuirEquip(pecas, undefined, EQUIP.ctx);
            EQUIP.t = Date.now();
            const trocas = Object.values(EQUIP.res.porVoc).reduce((n, v) => n + Object.values(v).filter(x => x.ganho >= GANHO_MIN).length, 0);
            log(`equip: ${pecas.length} peças lidas · ${trocas} trocas sugeridas · ${EQUIP.res.dispensaveis.length} dispensáveis`, 'ok');
        } catch (e) { EQUIP.erro = e.message; log('equip: ' + e.message, 'erro'); }
        EQUIP.lendo = false; renderizar();
    }
    /* =========================================================================
     *  ⭐ v2.5.0 — EQUIPAR PELO SOCKET (pedido do dono, 28/09 — "um botão para
     *  equipar se eu quiser"). Protocolo capturado arrastando na tela:
     *    depot_withdraw {items:[{name,count,iid}], requestId} → depot_result
     *    equip {name, slot, vocation, iid}                    → meta_result
     *                                   {action:'equip', applied:true, notice}
     *  O item que estava no slot vai para a MOCHILA — não existe "unequip"
     *  separado para trocar (arrastar do slot para a mochila não manda nada).
     *  Testado ida-e-volta pelo socket com bone/bonelord shield no Knight.
     *  Só na cidade. Nada dispara sem o botão. Peça de outro personagem só é
     *  pega depois que ELE trocar (a peça cai na mochila) — daí as passadas.
     * ====================================================================== */
    /* 2.5.2 — quem DOA a peça entra na fila junto, mesmo com ganho pequeno:
     * em 28/09 "só Feiticeiro" nunca pegava a fur armor do Paladino porque a
     * troca do Paladino (+0,8) ficava abaixo do GANHO_MIN e ele não liberava. */
    const slotsTrocas = (vocs) => {
        const fila = [], tirar = [], chaves = new Set();
        const R = EQUIP.res; if (!R) return { fila, tirar };
        const addTroca = (v, s, dependencia) => {
            const x = R.porVoc[v] && R.porVoc[v][s]; if (!x) return;
            const k = v + '|' + s; if (chaves.has(k)) return;
            if (x.melhor && (!x.atual || x.melhor.iid !== x.atual.iid) && (dependencia || x.ganho >= GANHO_MIN)) {
                chaves.add(k); fila.push({ v, s, peca: x.melhor, dependencia: !!dependencia });
                if (x.melhor.origem === 'corpo' && x.melhor.dono && x.melhor.dono !== v) addTroca(x.melhor.dono, x.melhor.slot, true);
            } else if (!x.melhor && x.atual && x.ganho < 0) tirar.push({ v, s, peca: x.atual });
        };
        for (const v of vocs) for (const s of SLOTS_EQUIP) addTroca(v, s, false);
        return { fila, tirar };
    };
    function ondeEsta(iid) {
        for (const p of (lerRosterFibra() || [])) for (const [s, it] of Object.entries(p.equipment || {})) if (it && it.iid === iid) return { lugar: 'corpo', voc: p.vocation, slot: normalizarSlot(s) };
        if (mochilaEquip().some(x => x && x.iid === iid)) return { lugar: 'mochila' };
        if (ESTADO_WS.depot && ESTADO_WS.depot.entries.some(e => e.iid === iid)) return { lugar: 'depósito' };
        return null;
    }
    async function retirarDoDepot(peca) {
        const rid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
        enviarWS({ type: 'depot_withdraw', data: { items: [{ name: peca.nome, count: 1, iid: peca.iid }], requestId: rid } });
        const ok = await esperarQue(() => { const w = ondeEsta(peca.iid); return w && w.lugar === 'mochila'; }, 6000, 150);
        return ok ? { ok: true } : { erro: `retirei ${peca.nome} do depósito e ele não apareceu na mochila (sem capacidade?)` };
    }
    async function equiparPeca(peca, voc, slot) {
        enviarWS({ type: 'equip', data: { name: peca.nome, slot, vocation: voc, iid: peca.iid } });
        const ok = await esperarQue(() => { const w = ondeEsta(peca.iid); return w && w.lugar === 'corpo' && w.voc === voc; }, 6000, 150);
        return ok ? { ok: true } : { erro: `mandei equipar ${peca.nome} no ${VOC_ROTULO[voc]} e o slot não mudou` };
    }
    /* v2.9.0 — ARCO ↔ BESTA TROCA A MUNIÇÃO. Besta com "arrow" no slot de
     * munição não atira. Depois de trocar a arma do Paladino, se a munição
     * configurada não é do tipo da arma nova, põe a grátis do tipo (bolt ou
     * arrow) no perfil ativo — o mesmo profiles_set que a janela manda. Na
     * cidade vale na próxima caçada. */
    function ajustarMunicaoDoPaladino() {
        const ro = rosterEquip(); const p = ro && ro.find(x => x && x.vocation === 'PALADIN');
        const arma = p && p.equipment && p.equipment.weapon;
        const b = arma && EQUIP.base && EQUIP.base[arma.name] ? EQUIP.base[arma.name].attrs : {};
        const tipo = arma && ((arma.attrs && arma.attrs.ammotype) || (b && b.ammotype));
        if (!tipo || !MUNICAO[tipo] || !ESTADO_WS.profiles) return;
        const atual = normalizarConfig(configAtiva('PALADIN'));
        if (atual.ammo && MUNICAO[tipo].some(a => a.n === atual.ammo)) return;
        const nova = Object.assign({}, atual, { ammo: MUNICAO[tipo][0].n });
        const perfil = perfilDaVoc('PALADIN');
        perfil.list[perfil.active] = { name: perfil.list[perfil.active].name, config: nova };
        enviarWS({ type: 'profiles_set', data: { vocation: 'PALADIN', profiles: perfil } });
        log(`equip: Paladino agora usa ${arma.name} — munição trocada de ${atual.ammo || 'nenhuma'} para ${nova.ammo} (vale na próxima caçada)`, 'ok');
    }
    async function equiparTrocas(vocs) {
        if (EQUIP.equipando) return;
        if (!EQUIP.res) { log('equip: clique ATUALIZAR antes', 'erro'); return; }
        if (emHunt()) { log('equip: só na cidade — na caçada o depósito é só leitura', 'erro'); return; }
        if (!socketAberto()) { log('equip: socket do jogo não está à mão — dá um F5 com o helper instalado', 'erro'); return; }
        if (_cicloEmCurso || SCAN.ativo) { log('equip: ciclo de venda ou Scan em andamento — espera terminar', 'erro'); return; }
        const { fila, tirar } = slotsTrocas(vocs);
        for (const t of tirar) log(`equip: ${VOC_ROTULO[t.v]} ${t.s}: tirar ${t.peca.nome} à mão (arma de 2 mãos) — o jogo não tem mensagem de tirar`, 'info');
        if (!fila.length) { log('equip: nada para trocar', 'info'); return; }
        EQUIP.equipando = true; renderizar();
        log(`equip: ${fila.length} troca(s) — ${vocs.map(v => VOC_ROTULO[v]).join(', ')}`, 'info');
        let feitas = 0, pend = fila.slice();
        try {
            for (let passo = 0; passo < 4 && pend.length; passo++) {
                const resto = [];
                for (const f of pend) {
                    const w = ondeEsta(f.peca.iid);
                    if (!w) { log(`equip: ${f.peca.nome} não está em lugar nenhum que eu veja — pulei`, 'erro'); continue; }
                    if (w.lugar === 'corpo' && w.voc === f.v && w.slot === f.s) { feitas++; continue; }
                    if (w.lugar === 'corpo') { resto.push(f); continue; }       // em outro personagem: espera ele trocar
                    if (w.lugar === 'depósito') { const r = await retirarDoDepot(f.peca); if (r.erro) { log('equip: ' + r.erro, 'erro'); continue; } }
                    const r2 = await equiparPeca(f.peca, f.v, f.s);
                    if (r2.erro) { log('equip: ' + r2.erro, 'erro'); continue; }
                    feitas++; log(`equip: ${VOC_ROTULO[f.v]} ${f.s} ← ${f.peca.nome} (${f.peca.origem})` + (f.dependencia ? ' — para liberar a peça para outro' : ''), 'ok');
                    await dorme(350);
                }
                pend = resto;
            }
            for (const f of pend) { const w = ondeEsta(f.peca.iid) || {}; log(`equip: ${f.peca.nome} ficou no ${VOC_ROTULO[w.voc] || '?'} — ele não liberou a peça (troca dele não feita)`, 'erro'); }
            if (fila.some(f => f.v === 'PALADIN' && f.s === 'weapon')) { try { ajustarMunicaoDoPaladino(); } catch (e) { log('equip: munição do Paladino não ajustada — ' + e.message, 'erro'); } }
            /* ⚠ o jogo só tem "guardar tudo" (depot_store_all): vai a mochila
             * INTEIRA, loot incluído — não só as peças que saíram do corpo. */
            if (ler('equip_guardar', true) && feitas) {
                const g = await guardarNoDepot();
                if (g.erro) log('equip: guardar a mochila no depósito falhou — ' + g.erro, 'erro');
            }
            log(`equip: ${feitas} de ${fila.length} troca(s) feita(s)`, feitas ? 'ok' : 'erro');
        } catch (e) { log('equip: estourou — ' + e.message, 'erro'); }
        EQUIP.equipando = false;
        await equipAtualizar();
    }
    function candidatoPorIid(iid) { const R = EQUIP.res; if (!R) return null; for (const v of Object.keys(R.porVoc)) for (const s of Object.keys(R.porVoc[v])) { const c = R.porVoc[v][s].candidatos.find(c => c.peca.iid === iid); if (c) return c.peca; } return null; }
    function telaEquip() {
        const dep = ESTADO_WS.depot, R = EQUIP.res, v = EQUIP.voc;
        const dentro = emHunt();
        const n4 = R ? slotsTrocas(VOCS).fila.length : 0, nv = R ? slotsTrocas([v]).fila.length : 0;
        const podeEquipar = R && !dentro && !EQUIP.equipando && !EQUIP.lendo && socketAberto();
        let h = `<div class="tb-linha">
            <button class="tb-bt pri" id="tb-eq-atualizar" ${EQUIP.lendo ? 'disabled' : ''}>${EQUIP.lendo ? 'lendo…' : 'ATUALIZAR'}</button>
            <button class="tb-bt" id="tb-eq-equipar4" ${podeEquipar && n4 ? '' : 'disabled'} title="${dentro ? 'só na cidade' : 'tira do depósito e equipa pelo socket'}">${EQUIP.equipando ? 'EQUIPANDO…' : `EQUIPAR (${n4})`}</button>
            <button class="tb-bt" id="tb-eq-equipar1" ${podeEquipar && nv ? '' : 'disabled'}>só ${VOC_ROTULO[v]} (${nv})</button></div>
          <div class="tb-mut" style="font-size:10px">${dep ? `depósito ${dep.used}/${dep.total}` : 'depósito —'}${EQUIP.t ? ` · lido ${new Date(EQUIP.t).toLocaleTimeString('pt-BR')}` : ''}${EQUIP.ctx && EQUIP.ctx.mapa ? ` · wand/rod pelo elemento de ${escHtml(EQUIP.ctx.mapa)}` : ''}${dentro ? ' · <span class="tb-av">equipar só na cidade</span>' : ''}</div>`;
        if (EQUIP.erro) h += `<div class="tb-cx tb-ruim">${escHtml(EQUIP.erro)}</div>`;
        if (EQUIP.aviso) h += `<div class="tb-cx tb-av">${escHtml(EQUIP.aviso)}</div>`;
        if (!R) return h + aj('eq-ajuda', 'ATUALIZAR lê o corpo dos 4, a mochila e o depósito, busca os atributos base e ranqueia por vocação e slot. Nada é equipado nem descartado sem o botão EQUIPAR. Raridade não pontua: um épico com atributos que a vocação não usa perde para um incomum com o atributo certo.');
        h += `<div class="tb-sub">${VOCS.map(x => { const n = Object.values(R.porVoc[x] || {}).filter(y => y.ganho >= GANHO_MIN).length; return `<span class="${x === v ? 'on' : ''}" data-voc="${x}">${VOC_CURTO[x]}${n ? ` <b>${n}</b>` : ''}</span>`; }).join('')}
            <span id="tb-eq-tudo" class="${EQUIP.verTudo ? 'on' : ''}" style="margin-left:auto" title="mostrar os 8 slots, não só as trocas">8 slots</span></div>`;
        const nomePeca = (p, voc) => p ? `${escHtml(p.nome)}${rarTag(p)}${p.origem === 'depósito' ? '<span class="tb-tag">dep.</span>' : p.origem === 'mochila' ? '<span class="tb-tag">mochila</span>' : p.dono && p.dono !== voc ? `<span class="tb-tag">no ${VOC_CURTO[p.dono] || p.dono}</span>` : ''}` : '<span class="tb-mut">vazio</span>';
        const det = (p, voc) => { if (!p) return ''; const r = pontuarPeca(p, voc, EQUIP.ctx);
            return r.detalhe.map(d => `<span class="${d.pt > 0 ? '' : d.pt < 0 ? 'neg' : 'm'}">${escHtml(rotulo(d.id))} ${d.valor}${d.pt !== 0 ? ` <span class="tb-mut">(${d.pt})</span>` : ''}</span>`).join(' · ') + (r.temporario ? ' <span class="tb-tag">temporário</span>' : '') + ` <span class="tb-mut">= ${r.pontos} pt</span>`; };
        let linhas = 0;
        for (const s of SLOTS_EQUIP) {
            const x = R.porVoc[v][s]; if (!x) continue;
            const troca = x.ganho >= GANHO_MIN && x.melhor && (!x.atual || x.melhor.iid !== x.atual.iid);
            const tirar = !x.melhor && x.atual && x.ganho < 0;
            if (!troca && !tirar && !EQUIP.verTudo) continue;
            linhas++;
            const chave = v + '|' + s, aberto = EQUIP.abertos.has(chave);
            const mot = troca ? pontuarPeca(x.melhor, v, EQUIP.ctx).motivos.join(' · ') : '';
            h += `<div class="tb-eq" data-k="${chave}">
                <span class="s">${s}</span>
                <span>${nomePeca(x.atual, v)}<small>${x.atualPt} pt</small></span>
                <span class="tb-mut">${troca || tirar ? '→' : '='}</span>
                <span>${troca ? nomePeca(x.melhor, v) + `<small><span class="g">+${x.ganho} pt</span> · ${escHtml(mot)}</small>` : tirar ? '<span class="tb-av">tirar (arma de 2 mãos)</span>' : '<span class="tb-mut">já é o melhor</span>'}</span>
                ${aberto ? `<div class="tb-det"><div><b>atual:</b> ${det(x.atual, v) || '—'}</div>${troca ? `<div style="margin-top:3px"><b>melhor:</b> ${det(x.melhor, v)}</div>` : ''}</div>` : ''}
              </div>`;
        }
        if (!linhas) h += `<div class="tb-ok" style="margin:4px 0">${VOC_ROTULO[v]}: nada a trocar — o que está no corpo já é o melhor que você tem.</div>`;
        const disp = R.dispensaveis, soma = disp.reduce((n, p) => n + (p.sell || 0), 0);
        h += aj('eq-disp', `<div class="tb-mut" style="font-size:10px">não são a melhor nem a reserva de ninguém. Encaixes de imbuement não pontuam — confira antes de vender.</div>` +
            disp.slice(0, 60).map(p => `<div class="tb-lin"><span>${escHtml(p.nome)}${rarTag(p)}<span class="tb-tag">${p.origem}</span> <span class="tb-mut" style="font-size:9.5px">${escHtml(p.motivo)}</span></span><span>${(p.sell || 0).toLocaleString('pt-BR')}</span></div>`).join('') +
            (disp.length > 60 ? `<div class="tb-mut">… e mais ${disp.length - 60}</div>` : ''), `dispensáveis (${disp.length} · ${soma.toLocaleString('pt-BR')}o)`);
        h += aj('eq-res', [...R.reservas].map(iid => { const p = candidatoPorIid(iid); return p ? `<div class="tb-lin"><span>${escHtml(p.nome)}${rarTag(p)} <span class="tb-mut">${p.slot} · ${p.origem}</span></span></div>` : ''; }).join(''), `reservas (${R.reservas.size})`);
        const temp = R.temporarios || [];
        if (temp.length) h += aj('eq-temp', `<div class="tb-mut" style="font-size:10px">acabam por carga ou por tempo de caçada (wiki): não entram nas trocas nem na lista de venda — use à mão (boss, mapa difícil).</div>` +
            temp.slice(0, 40).map(p => {
                const m = VOCS.filter(x => vocacaoPode(p.attrs, x)).map(x => ({ x, r: pontuarPeca(p, x, EQUIP.ctx) })).sort((a, b) => b.r.pontos - a.r.pontos)[0];
                if (!m) return '';
                const dura = m.r.cargas ? m.r.cargas + ' cargas' : m.r.duracaoS ? Math.round(m.r.duracaoS / 60) + ' min' : 'temporário';
                return `<div class="tb-lin"><span>${escHtml(p.nome)} <span class="tb-mut">${p.slot} · ${p.origem} · ${dura}</span></span><span class="tb-mut">${VOC_CURTO[m.x]} ${m.r.pontos} pt</span></div>`; }).join(''), `temporários (${temp.length})`);
        h += aj('eq-opc', `<label class="tb-l"><input type="checkbox" id="tb-eq-guardar" ${ler('equip_guardar', true) ? 'checked' : ''}> depois de equipar, guardar a mochila inteira no depósito</label><div style="font-size:10px">pelo socket: tira do depósito e equipa; a peça que sai cai na mochila. O jogo só tem "guardar tudo": o loot da mochila vai junto. Peça de outro personagem só depois que ele trocar. Arco ↔ besta troca a munição do Paladino junto.</div>`, 'opções');
        return h;
    }
    function ligarEquip() {
        const b = $('#tb-eq-atualizar'); if (b) b.onclick = equipAtualizar;
        $$('.tb-sub span[data-voc]').forEach(s => s.onclick = () => { EQUIP.voc = s.dataset.voc; renderizar(); });
        $$('.tb-eq').forEach(e => e.onclick = (ev) => { if (ev.target.closest('.tb-det')) return; const k = e.dataset.k; if (EQUIP.abertos.has(k)) EQUIP.abertos.delete(k); else EQUIP.abertos.add(k); renderizar(); });
        const tudo = $('#tb-eq-tudo'); if (tudo) tudo.onclick = () => { EQUIP.verTudo = !EQUIP.verTudo; renderizar(); };
        const e4 = $('#tb-eq-equipar4'); if (e4) e4.onclick = () => equiparTrocas(VOCS);
        const e1 = $('#tb-eq-equipar1'); if (e1) e1.onclick = () => equiparTrocas([EQUIP.voc]);
        const gd = $('#tb-eq-guardar'); if (gd) gd.onchange = () => guardar('equip_guardar', gd.checked);
    }

    /* =========================================================================
     *  ⭐ v2.11 — ABA PROGRESSO (só leitura): chaves e Elites, bestiário, plano
     *  da caçada com o jogo fechado, prey e calculadoras de Forja/Imbuement.
     *
     *  Por que existe: o helper só olhava para a caçada da hora (magia, Scan,
     *  venda). O que faz a conta crescer de verdade — marco de bestiário,
     *  chave que cai e é PERDIDA com a mochila de chaves cheia, prey que
     *  desliga quando as wildcards acabam, a caçada da noite que para por
     *  ouro — ficava invisível. Aqui tudo só MOSTRA e RECOMENDA: nenhuma
     *  linha deste bloco envia nada ao servidor (regra do dono).
     *
     *  ⚠ Formatos do socket lidos do validador (zod) do próprio cliente em
     *  29/09 (chunk _next/static/chunks/8308-*.js) — NÃO vistos ao vivo com a
     *  conta logada. Por isso todo parse aceita variações (objeto ou lista,
     *  número em texto) e, sem dado, a tela diz "sem dado ainda":
     *    welcome / resume / hunt_started.state / frame.state / meta_result /
     *    depot_result…  keyBag {nome: n}, keyBagTierId, keyBagUsed, keyBagMax
     *    frame           bestiaryKills (n da caçada ATUAL), analyzer, state
     *                    {balance, balanceLocked, cap, autoSellInMs,
     *                    character.levelProgress{xp, xpNext}}
     *    meta (welcome/resume/meta_result/meta_state) {wildcards,
     *                    huntBestiary {huntId: n}, preyHunt {huntId, title,
     *                    msLeft, locked}, preyBuffs {VOC: {bonus {type,
     *                    tier, percent}, msLeft, locked, tierFloor}},
     *                    autoLeave {enabled, floor, onCap}, xpBoost,
     *                    rules.keyBags [{id, name, maxKeys}]}
     *    resume.offline  {elapsedMs, xp, killsTotal, lootGold}
     *    ended.summary   {reason: stop|death|expired|no_gold|cap_full|…}
     *  Regras: wiki oficial tibidle.com/wiki (29/09) — /chaves-e-caixas,
     *  /elites, /bestiario, /a-cacada-com-o-jogo-fechado, /auto-exit, /prey,
     *  /forja, /imbuements, /ouro-e-ouro-travado.
     * ====================================================================== */
    /* @@PROGRESSO-INICIO — funções puras; testes/progresso.test.js roda este trecho no node. */
    const PG_WIKI = {
        chaveMin: 0.00047, chaveMax: 0.00105,   // /elites: "entre 0,047% e 0,105% por abate" (a maioria)
        mochilaT1: 5, mochilaT2: 10,            // /chaves-e-caixas: Key Backpack T1 grátis, T2 100 coins
        tetoCacadaH: 12,                        // /a-cacada-com-o-jogo-fechado: sessão dura no máx. 12 h de caçada
        preyH: 2                                // /prey: cada sorteio/renovação vale 2 h de caçada
    };
    const PG_VOCS = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'];
    const PG_VOC = { KNIGHT: 'Cavaleiro', PALADIN: 'Paladino', SORCERER: 'Feiticeiro', DRUID: 'Druida' };
    /* /forja: a chance é a do nível que se quer alcançar; do +5 em diante a
     * falha SEM Garantia derruba 1 nível; a Garantia é gasta em TODA tentativa. */
    const PG_REFINO = [
        { alvo: 1, p: 0.80 }, { alvo: 2, p: 0.70 }, { alvo: 3, p: 0.60 }, { alvo: 4, p: 0.50 },
        { alvo: 5, p: 0.35, cai: true }, { alvo: 6, p: 0.25, cai: true }, { alvo: 7, p: 0.20, cai: true },
        { alvo: 8, p: 0.15, cai: true }, { alvo: 9, p: 0.10, cai: true }, { alvo: 10, p: 0.05, cai: true }
    ];
    /* /forja, aba GEMAS: ouro + coins por gema (mais 100 fragmentos do tipo) */
    const PG_GEMAS = { T1: { nome: 'Refine Gem T1', ouro: 10000, coins: 5 }, T2: { nome: 'Refine Gem T2', ouro: 35000, coins: 8 }, G: { nome: 'Guarantee Gem T1', ouro: 15000, coins: 5 } };
    /* /imbuements (e /assets/v167/imbuements.json → bases): taxa, proteção, chance */
    const PG_IMBU_BASES = [
        { id: 1, nome: 'Basic', taxa: 5000, protecao: 10000, chance: 0.9 },
        { id: 2, nome: 'Intricate', taxa: 30000, protecao: 30000, chance: 0.7 },
        { id: 3, nome: 'Powerful', taxa: 200000, protecao: 50000, chance: 0.5 }
    ];
    const PG_BONUS = { maxHealth: 'vida máx', maxMana: 'mana máx', capacity: 'capacidade', hpRegen: 'regen. vida', manaRegen: 'regen. mana',
                       armor: 'armadura', attack: 'ataque', melee: 'corpo a corpo', distance: 'distância', shielding: 'escudo', magicLevel: 'nível mágico' };
    const PG_ELEM = { COMBAT_PHYSICALDAMAGE: 'físico', COMBAT_ENERGYDAMAGE: 'energia', COMBAT_FIREDAMAGE: 'fogo', COMBAT_ICEDAMAGE: 'gelo',
                      COMBAT_EARTHDAMAGE: 'terra', COMBAT_HOLYDAMAGE: 'sagrado', COMBAT_DEATHDAMAGE: 'morte' };
    const PG_FIM = { stop: 'você encerrou', death: 'morte na caçada', expired: 'teto de 12 h', victory: 'vitória', no_gold: 'ouro abaixo da margem (Auto Exit)',
                     cap_full: 'mochila cheia (Auto Exit)', level_cap: 'limite de nível da caçada', tower_top: 'topo da torre', prey_resync_failed: 'prey fora de sincronia' };

    const pgNum = (x) => { if (x == null || x === '' || typeof x === 'boolean') return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
    const pgNorm = (s) => String(s == null ? '' : s).trim().toLowerCase();
    const pgInt = (n) => n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('pt-BR');
    const pgDec = (n, c) => n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
    const pgPct = (x, c) => x == null || !Number.isFinite(x) ? '—' : pgDec(x * 100, c == null ? 1 : c) + '%';
    /* horas → "45 min" · "2h05" · "3,5 dias"; Infinity → "não acaba" */
    function pgHoras(h) {
        if (h == null || Number.isNaN(h)) return '—';
        if (!Number.isFinite(h)) return 'não acaba';
        if (h <= 0) return 'agora';
        const min = Math.round(h * 60);
        if (min < 1) return '< 1 min';
        if (min < 60) return min + ' min';
        if (h < 48) return Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0');
        return pgDec(h / 24, 1) + ' dias';
    }

    /* ---- 1. CHAVES E ELITES ------------------------------------------------ */
    /* keyBag: o cliente trata como {nome: n} (Object.entries, n > 0). Aceito
     * também lista de {name,count}, pares [nome, n] e nomes soltos. Devolve
     * null quando a mensagem não fala de chave (a maioria dos frames). Só
     * keyBagMax (compra da T2 no meta_result) atualiza o limite e mantém o resto. */
    function pgLerChaves(src, anterior, regras) {
        if (!src || typeof src !== 'object') return null;
        const temBag = src.keyBag != null && typeof src.keyBag === 'object';
        const usadasCru = pgNum(src.keyBagUsed), maxCru = pgNum(src.keyBagMax);
        if (!temBag && usadasCru == null && maxCru == null) return null;
        const ant = anterior || {};
        let chaves = ant.chaves || {};
        if (temBag) {
            chaves = {};
            const somar = (nome, n) => { const k = String(nome == null ? '' : nome).trim(); const q = n == null ? 1 : pgNum(n); if (!k || !(q > 0)) return; chaves[k] = (chaves[k] || 0) + q; };
            const qtd = (x) => x.count != null ? x.count : x.qty != null ? x.qty : x.quantity != null ? x.quantity : x.n != null ? x.n : x.amount;
            if (Array.isArray(src.keyBag)) {
                src.keyBag.forEach(x => {
                    if (typeof x === 'string') somar(x, 1);
                    else if (Array.isArray(x)) somar(x[0], x[1]);
                    else if (x && typeof x === 'object') somar(x.name || x.nome || x.item || x.key, qtd(x));
                });
            } else Object.entries(src.keyBag).forEach(([k, v]) => somar(k, v && typeof v === 'object' ? qtd(v) : v));
        }
        const soma = Object.values(chaves).reduce((a, b) => a + b, 0);
        const tierId = src.keyBagTierId != null ? String(src.keyBagTierId) : (ant.tierId || null);
        const t = pgTierDaMochila({ tierId, max: maxCru > 0 ? maxCru : ant.max }, regras);
        const usadas = usadasCru != null ? usadasCru : temBag ? soma : (ant.usadas != null ? ant.usadas : soma);
        return { chaves, usadas, max: t.max, tierId, tierNome: t.nome || ant.tierNome || null };
    }
    /* limite da mochila: keyBagMax do jogo; senão o do tier em meta.rules.keyBags */
    function pgTierDaMochila(kb, regras) {
        const r = (Array.isArray(regras) ? regras : []).find(x => x && kb && kb.tierId != null && String(x.id) === String(kb.tierId)) || null;
        const max = kb && pgNum(kb.max) > 0 ? pgNum(kb.max) : r && pgNum(r.maxKeys) > 0 ? pgNum(r.maxKeys) : null;
        return { max, nome: r ? r.name || null : null };
    }
    /* /chaves-e-caixas: "Com a Key Backpack T1 cheia, a próxima chave que cair na caçada some." */
    function pgAvisoChaves(kb) {
        if (!kb) return null;
        const max = pgNum(kb.max), u = pgNum(kb.usadas) || 0;
        if (max > 0 && u >= max) return { nivel: 'cheia', texto: `mochila de chaves cheia (${u}/${max}) — a próxima chave que cair na caçada será PERDIDA. Guarde as extras no depósito${max < PG_WIKI.mochilaT2 ? ' ou compre a Key Backpack T2 (10 chaves, 100 coins)' : ''}.` };
        if (max > 0 && max - u === 1) return { nivel: 'quase', texto: `só 1 vaga na mochila de chaves (${u}/${max}): a próxima chave cabe, a seguinte será perdida.` };
        if (!(max > 0) && u >= PG_WIKI.mochilaT1) return { nivel: 'talvez', texto: `${u} chaves e o jogo não mandou o limite — se a mochila for a T1 (5), está cheia.` };
        return { nivel: 'ok', texto: max > 0 ? `${u}/${max} chaves` : `${u} chave(s)` };
    }
    /* a chave de uma caçada: item do loot de /hunts/select que é keyItem de algum Elite */
    function pgChaveDaHunt(h, bosses) {
        if (!h || !Array.isArray(h.loot)) return null;
        const chaves = new Set((bosses || []).map(b => b && pgNorm(b.keyItem)).filter(Boolean));
        const it = h.loot.find(l => l && chaves.has(pgNorm(l.name))) || h.loot.find(l => l && / key$/i.test(String(l.name || '').trim()));
        if (!it) return null;
        const elite = (bosses || []).find(b => b && pgNorm(b.keyItem) === pgNorm(it.name)) || null;
        return { nome: it.name, chance: pgNum(it.chance) != null ? pgNum(it.chance) / 100000 : null, elite };
    }
    /* chave → Elite (keyItem, sem diferenciar maiúscula: "gordzila key") e caçada que a larga */
    function pgInfoChave(nome, bosses, hunts) {
        const k = pgNorm(nome);
        const elite = (bosses || []).find(b => b && pgNorm(b.keyItem) === k) || null;
        let hunt = null, chance = null;
        for (const h of (hunts || [])) {
            const it = h && Array.isArray(h.loot) ? h.loot.find(l => l && pgNorm(l.name) === k) : null;
            if (it) { hunt = h; chance = pgNum(it.chance) != null ? pgNum(it.chance) / 100000 : null; break; }
        }
        return { nome, elite, hunt, chance };
    }
    /* no catálogo `percent` é quanto o monstro ABSORVE: negativo = toma mais */
    function pgResumoElite(b, materiais) {
        if (!b) return null;
        const els = (b.elements || []).filter(e => e && pgNum(e.percent)).map(e => ({ el: PG_ELEM[e.type] || String(e.type || '?').replace('COMBAT_', '').toLowerCase(), pct: pgNum(e.percent) }));
        const loot = (b.loot || []).filter(l => l && l.name);
        const mats = materiais instanceof Set ? materiais : new Set();
        return {
            nome: b.name, hp: pgNum(b.health), tipo: b.kind || null,
            fraco: els.filter(e => e.pct < 0).sort((x, y) => x.pct - y.pct),
            resiste: els.filter(e => e.pct > 0 && e.pct < 100).sort((x, y) => y.pct - x.pct),
            imune: els.filter(e => e.pct >= 100).map(e => e.el),
            top: loot.filter(l => pgNum(l.value) > 0).sort((x, y) => pgNum(y.value) - pgNum(x.value)).slice(0, 3).map(l => ({ nome: l.name, valor: pgNum(l.value), chance: pgNum(l.chance) != null ? pgNum(l.chance) / 100000 : null })),
            fragmentos: loot.filter(l => /fragment/i.test(l.name)).map(l => l.name),
            materiais: loot.filter(l => mats.has(pgNorm(l.name))).map(l => l.name)
        };
    }
    /* /prey: LOOT multiplica a chance de cada item; as colunas SOMAM (4 × ★10 = +40 %) */
    function pgFatorLootPrey(prey) {
        if (!prey || !prey.buffs) return 1;
        let s = 0;
        for (const b of Object.values(prey.buffs)) if (b && b.tipo === 'loot' && b.pct > 0 && !(b.msLeft === 0)) s += b.pct;
        return 1 + s / 100;
    }
    const pgChavesHora = (abatesH, chance, fator) => abatesH > 0 && chance > 0 ? abatesH * chance * (fator > 0 ? fator : 1) : null;
    /* chaves/h por caçada MEDIDA (ao vivo, Scan, sessões) — a atual primeiro */
    function pgLinhasChaves(hunts, bosses, medidos, fator, huntAtual) {
        const out = [];
        for (const [id, m] of Object.entries(medidos || {})) {
            const h = (hunts || []).find(x => x && String(x.id) === String(id));
            const c = h ? pgChaveDaHunt(h, bosses) : null;
            if (!h || !c) continue;
            const ch = pgChavesHora(m.abatesH, c.chance, fator);
            out.push({ hunt: h, chave: c.nome, elite: c.elite ? c.elite.name : null, chance: c.chance, abatesH: m.abatesH, fonte: m.fonte, chavesH: ch, cadaH: ch ? 1 / ch : null, atual: String(id) === String(huntAtual) });
        }
        return out.sort((a, b) => (b.atual - a.atual) || ((b.chavesH || 0) - (a.chavesH || 0)));
    }
    /* abates/h por caçada: ao vivo (analisador do jogo) > Scan (o mais recente) > sessões (média por tempo) */
    function pgAbatesPorHunt(vivo, scan, sess) {
        const r = {};
        const por = (id, h, fonte) => { const n = pgNum(id); if (n == null || !(h > 0) || r[n]) return; r[n] = { abatesH: h, fonte }; };
        if (vivo) por(vivo.huntId, vivo.abatesH, 'agora');
        (Array.isArray(scan) ? scan : []).filter(x => x && !x.erro && x.abatesH > 0).sort((x, y) => (y.t || 0) - (x.t || 0)).forEach(x => por(x.id, x.abatesH, 'Scan'));
        const s = {};
        (Array.isArray(sess) ? sess : []).forEach(x => { const id = x && pgNum(x.huntId); if (id == null || !(x.abatesH > 0) || !(x.dur > 0)) return; s[id] = s[id] || { n: 0, d: 0 }; s[id].n += x.abatesH * x.dur; s[id].d += x.dur; });
        Object.entries(s).forEach(([k, v]) => por(k, v.n / v.d, 'sessões'));
        return r;
    }

    /* ---- 2. BESTIÁRIO ------------------------------------------------------ */
    /* contadores {huntId: abates}; o maior vence (o progresso nunca regride — wiki
     * /bestiario; o cliente faz o mesmo: max(meta.huntBestiary, frame.bestiaryKills)) */
    function pgMesclarBestiario(a, b) {
        const r = Object.assign({}, a || {});
        const por = (k, v) => { const n = pgNum(v); if (k == null || k === '' || !(n >= 0)) return; const c = String(k); if (!(r[c] >= n)) r[c] = n; };
        if (Array.isArray(b)) b.forEach(x => { if (x && typeof x === 'object') por(x.huntId != null ? x.huntId : x.id, x.kills != null ? x.kills : x.count); });
        else if (b && typeof b === 'object') Object.entries(b).forEach(([k, v]) => por(k, v && typeof v === 'object' ? (v.kills != null ? v.kills : v.count) : v));
        return r;
    }
    /* 3 marcos por caçada; vale o MAIOR alcançado (não somam) */
    function pgEstagio(best, kills) {
        const st = (best && Array.isArray(best.stages) ? best.stages : []).map(s => ({ kills: pgNum(s && s.kills), value: pgNum(s && s.value) }))
            .filter(s => s.kills > 0).sort((a, b) => a.kills - b.kills);
        if (!st.length) return null;
        const k = Math.max(0, pgNum(kills) || 0);
        const feitos = st.filter(s => k >= s.kills), prox = st.find(s => k < s.kills) || null;
        const valor = feitos.length ? feitos[feitos.length - 1].value || 0 : 0;
        return { n: feitos.length, total: st.length, valor, prox, falta: prox ? prox.kills - k : 0, ganho: prox ? (prox.value || 0) - valor : 0,
                 pct: prox ? k / prox.kills : 1, completo: !prox, kills: k, bonus: best.bonus || null };
    }
    /* soma dos marcos já fechados, por tipo — o painel BÔNUS DA CONTA do jogo */
    function pgBonusConta(hunts, contadores) {
        const soma = {};
        for (const h of (hunts || [])) {
            if (!h || !h.bestiary) continue;
            const e = pgEstagio(h.bestiary, (contadores || {})[String(h.id)]);
            if (e && e.valor > 0 && e.bonus) soma[e.bonus] = (soma[e.bonus] || 0) + e.valor;
        }
        return soma;
    }
    /* caçadas do seu nível com contador CONHECIDO e marco por fechar; horas até o
     * próximo marco com abates/h medidos. Ordem: mais perto (em horas) primeiro. */
    function pgLinhasBestiario(hunts, contadores, medidos, nivel) {
        const out = [];
        for (const h of (hunts || [])) {
            if (!h || !h.bestiary || (nivel != null && (h.levelMin || 1) > nivel)) continue;
            const c = (contadores || {})[String(h.id)];
            if (c == null) continue;
            const e = pgEstagio(h.bestiary, c);
            if (!e || e.completo) continue;
            const m = (medidos || {})[h.id];
            out.push({ hunt: h, e, abatesH: m ? m.abatesH : null, fonte: m ? m.fonte : null, horas: m && m.abatesH > 0 ? e.falta / m.abatesH : null });
        }
        return out.sort((a, b) => (a.horas == null) - (b.horas == null) || (a.horas != null ? a.horas - b.horas : a.e.falta - b.e.falta));
    }

    /* ---- 3. CAÇADA COM O JOGO FECHADO --------------------------------------- */
    /* amostras [{t, ouro, oz, tot}] a cada 30 s da caçada atual → taxas na janela.
     * ozH = só as SUBIDAS (o que entra de loot, antes das vendas); ozLiqH = líquido. */
    function pgTaxas(amostras, janelaMs) {
        const a = (amostras || []).filter(x => x && x.t > 0);
        if (a.length < 2) return null;
        const fim = a[a.length - 1];
        let i0 = a.findIndex(x => fim.t - x.t <= (janelaMs || Infinity));
        if (i0 < 0 || i0 >= a.length - 1) i0 = Math.max(0, a.length - 2);
        const ini = a[i0], h = (fim.t - ini.t) / 3600000;
        if (!(h > 0)) return null;
        let sobe = 0;
        for (let i = i0 + 1; i < a.length; i++) { const d = (a[i].oz != null && a[i - 1].oz != null) ? a[i].oz - a[i - 1].oz : 0; if (d > 0) sobe += d; }
        return { horas: h, ouroH: ini.ouro != null && fim.ouro != null ? (fim.ouro - ini.ouro) / h : null, ozH: sobe / h,
                 ozLiqH: ini.oz != null && fim.oz != null ? (fim.oz - ini.oz) / h : null };
    }
    /* O que para a caçada primeiro se o jogo for fechado agora.
     *  x = {ouro, margem, autoExit, autoExitCap, supH, taxas, ozLivre, autoSell, sessaoMs, xpH, xpFalta}
     *  - ouro: saldo MEDIDO (moedas + Auto Selling − suprimento) com ≥ 10 min de
     *    janela; senão só o gasto de suprimento do analisador (pior caso).
     *  - sem Auto Exit o ouro zerado não encerra: "Sem ouro: suprimentos pagos
     *    pausados" (wiki /pocoes) — a party segue só com magia/regeneração.
     *  - mochila cheia sem "Encerrar com a mochila cheia" não encerra: o loot
     *    que não cabe deixa de ser coletado (wiki /auto-exit). */
    function pgPlanoOffline(x) {
        x = x || {};
        const r = {};
        const sessaoH = pgNum(x.sessaoMs) != null ? x.sessaoMs / 3600000 : null;
        r.tetoH = sessaoH != null ? Math.max(0, PG_WIKI.tetoCacadaH - sessaoH) : PG_WIKI.tetoCacadaH;
        const tx = x.taxas || null;
        const medido = !!(tx && tx.horas >= 1 / 6 && tx.ouroH != null);
        r.ouroH = medido ? tx.ouroH : (x.supH > 0 ? -x.supH : null);
        r.ouroFonte = medido ? 'medido' : r.ouroH != null ? 'suprimento' : null;
        const margem = x.autoExit && x.margem > 0 ? x.margem : 0;
        r.margem = margem;
        r.horasOuro = r.ouroH == null || x.ouro == null ? null : r.ouroH < 0 ? Math.max(0, (x.ouro - margem) / -r.ouroH) : Infinity;
        let oz = null;
        if (x.autoSell) oz = tx && tx.horas >= 0.25 && tx.ozLiqH != null ? tx.ozLiqH : null;   // vende a cada 10 min: só o líquido de 15+ min diz algo
        else if (tx && tx.horas >= 1 / 30) oz = tx.ozH;
        r.ozH = oz;
        r.horasMochila = x.ozLivre == null || oz == null ? null : oz > 0 ? Math.max(0, x.ozLivre / oz) : Infinity;
        const ev = [{ k: 'teto', h: r.tetoH, encerra: true, texto: 'teto de 12 h: a caçada termina ("Tempo da caçada esgotado")' }];
        if (r.horasOuro != null && Number.isFinite(r.horasOuro)) ev.push({ k: 'ouro', h: r.horasOuro, encerra: margem > 0,
            texto: margem > 0 ? 'o ouro chega à margem do Auto Exit e a caçada encerra' : 'o ouro acaba: poções e runas pagas PAUSAM (só cura por magia e regeneração) — risco de morte' });
        if (r.horasMochila != null && Number.isFinite(r.horasMochila)) ev.push({ k: 'mochila', h: r.horasMochila, encerra: !!x.autoExitCap,
            texto: x.autoExitCap ? 'a mochila enche e o Auto Exit encerra a caçada' : 'a mochila enche: o loot que não couber deixa de ser coletado (a caçada continua)' });
        ev.sort((a, b) => a.h - b.h);
        r.eventos = ev;
        r.primeiro = ev[0];
        r.fim = ev.find(e => e.encerra);
        r.xpAteFim = x.xpH > 0 ? x.xpH * r.fim.h : null;
        r.horasNivel = x.xpH > 0 && x.xpFalta > 0 ? x.xpFalta / x.xpH : null;
        return r;
    }
    /* levelProgress {xp, xpNext}: xpNext é o total do próximo nível (como "EXP a / b" do rail) */
    function pgXpFalta(lp) {
        if (!lp || typeof lp !== 'object') return null;
        const xp = pgNum(lp.xp), prox = pgNum(lp.xpNext);
        return xp != null && prox != null && prox > xp ? prox - xp : null;
    }

    /* ---- 4. PREY ----------------------------------------------------------- */
    function pgTipoPrey(b) {
        if (!b || typeof b !== 'object') return null;
        const s = pgNorm([b.type, b.bonusType, b.label].filter(x => typeof x === 'string').join(' '));
        if (/\bxp\b|\bexp|experi/.test(s)) return 'xp';
        if (/loot/.test(s)) return 'loot';
        if (/dano|damage|dmg/.test(s)) return 'dano';
        if (/def/.test(s)) return 'defesa';
        return null;
    }
    /* percentual pelo tier e pelo tipo (wiki /prey: EXP/LOOT ★N = +N %, DANO/DEFESA
     * ★N = +4N %); o `percent` do jogo só entra quando o tipo não é reconhecido */
    function pgLerPrey(meta) {
        if (!meta || typeof meta !== 'object') return null;
        if (!('preyHunt' in meta) && !('preyBuffs' in meta) && meta.wildcards == null) return null;
        const ph = meta.preyHunt && typeof meta.preyHunt === 'object' ? meta.preyHunt : null;
        const buffs = {};
        const cada = (voc, x) => {
            if (!voc || !x || typeof x !== 'object') return;
            const b = x.bonus && typeof x.bonus === 'object' ? x.bonus : null;
            const tipo = pgTipoPrey(b), tier = b ? pgNum(b.tier) : null;
            let pct = tipo && tier ? tier * (tipo === 'dano' || tipo === 'defesa' ? 4 : 1) : null;
            if (pct == null && b && pgNum(b.percent) != null) { pct = pgNum(b.percent); if (pct > 0 && pct <= 1) pct *= 100; }
            buffs[String(voc).toUpperCase()] = { tipo, tier, pct, rotulo: b ? (b.label || b.type || null) : null, msLeft: pgNum(x.msLeft), locked: !!x.locked,
                                                 piso: pgNum(x.tierFloor), gratis: !!x.rollFreeDay, huntId: pgNum(x.huntId) };
        };
        const f = meta.preyBuffs;
        if (Array.isArray(f)) f.forEach(x => x && cada(x.vocation || x.voc, x));
        else if (f && typeof f === 'object') Object.entries(f).forEach(([v, x]) => cada(v, x));
        return {
            wildcards: pgNum(meta.wildcards),
            cacada: ph ? { huntId: pgNum(ph.huntId), titulo: ph.title || null, levelMin: pgNum(ph.levelMin), msLeft: pgNum(ph.msLeft), locked: !!ph.locked } : null,
            buffs, sorteioGratis: !!meta.preyHuntRollFreeDay,
            avisos: Array.isArray(meta.preyAvisos) ? meta.preyAvisos.filter(a => a && typeof a === 'object') : []
        };
    }
    /* Travas: cada seção travada renova sozinha ao vencer (2 h) por 1 wildcard;
     * vencendo juntas, a cobrança vai caçada → Cavaleiro → Paladino → Feiticeiro
     * → Druida; ZEROU as wildcards → TODAS as travas desligam na hora (wiki /prey).
     * Tempo em horas de CAÇADA (o relógio da prey só anda caçando). */
    function pgTravasPrey(prey) {
        if (!prey) return null;
        const ordem = ['HUNT'].concat(PG_VOCS);
        const secs = [];
        if (prey.cacada && prey.cacada.locked && prey.cacada.msLeft != null) secs.push({ k: 'HUNT', ms: prey.cacada.msLeft });
        for (const v of PG_VOCS) { const b = prey.buffs && prey.buffs[v]; if (b && b.locked && b.msLeft != null) secs.push({ k: v, ms: b.msLeft }); }
        const w0 = prey.wildcards;
        if (!secs.length || w0 == null) return { travadas: secs.length, wildcards: w0, renovacoes: 0, horasTravas: null, horasBonus: null };
        const DUR = PG_WIKI.preyH * 3600000;
        let w = w0, agora = 0, renov = 0, voltas = 0;
        while (voltas++ < 5000) {
            secs.sort((a, b) => a.ms - b.ms || ordem.indexOf(a.k) - ordem.indexOf(b.k));
            const s = secs[0];
            agora = s.ms;
            if (w <= 0) break;                 // sem wildcard na renovação: expira e a trava desliga
            w--; renov++; s.ms = agora + DUR;
            if (w === 0) break;                // zerou: todas desligam agora
        }
        return { travadas: secs.length, wildcards: w0, renovacoes: renov, horasTravas: agora / 3600000,
                 horasBonus: Math.max(...secs.map(s => s.ms)) / 3600000 };
    }
    /* Plano 2.11 (dono): DEFESA no Cavaleiro, DANO em quem faz mais dano no
     * livro-razão. Ajustes pelos dados medidos: spawn limita → dano extra não
     * vira xp (TIBIDLE.md, Stonerefiners 28/09) → EXP; Cavaleiro que quase não
     * apanha (vida mínima ≥ 90 %) → EXP rende mais que DEFESA. rz = razaoResumo(). */
    function pgSugestaoPrey(rz) {
        const pv = (rz && rz.porVoc) || {};
        const temDano = PG_VOCS.some(v => pv[v] && pv[v].pct > 0);
        let top = null;
        for (const v of PG_VOCS) if (v !== 'KNIGHT' && pv[v] && pv[v].pct > 0 && (!top || pv[v].pct > pv[top].pct)) top = v;
        const spawn = !!(rz && rz.ondas && rz.ondas.spawnLimita);
        const r = {};
        for (const v of PG_VOCS) {
            if (v === 'KNIGHT') {
                const hp = pv.KNIGHT && pgNum(pv.KNIGHT.hpMin);
                r[v] = hp != null && hp >= 90
                    ? { tipo: 'xp', motivo: `quase não apanhou (vida mínima ${hp}%) — EXP rende mais que DEFESA` }
                    : { tipo: 'defesa', motivo: hp != null ? `é quem apanha (vida mínima ${hp}%) — DEFESA corta o dano que ele toma` : 'é quem apanha corpo a corpo — DEFESA rende mais nele (wiki)' };
            } else if (v === top) {
                r[v] = spawn ? { tipo: 'xp', motivo: `faz ${pv[v].pct}% do dano, mas o spawn limita: dano extra não vira xp` }
                             : { tipo: 'dano', motivo: `faz ${pv[v].pct}% do dano do grupo — DANO ★10 dá +40% nele` };
            } else r[v] = { tipo: 'xp', motivo: temDano ? 'EXP soma para a conta (4 colunas ★10 = +40%); para ouro, LOOT' : 'sem dano medido ainda — EXP é o seguro (soma para a conta); para ouro, LOOT' };
        }
        return r;
    }

    /* ---- 5. FORJA E IMBUEMENT ----------------------------------------------- */
    /* Refino esperado de `de` até `ate`. C[k] = custo esperado (em gemas) de k → k+1:
     *   alvo ≤ +4: 1/p gemas T1 (falha não cai);
     *   alvo ≥ +5 sem Garantia: (1 T2 + (1−p) × C[k−1]) / p — a falha cai 1 nível
     *     e é preciso subir de novo;
     *   alvo ≥ +5 com Garantia: 1/p × (T2 + Garantia) — Garantia gasta sempre.
     * modo 'melhor' escolhe, degrau a degrau, o mais barato em ouro (o greedy é
     * ótimo: o custo sem Garantia só cresce com C[k−1]). */
    function pgRefino(de, ate, modo) {
        de = Math.max(0, Math.min(10, Math.floor(pgNum(de) || 0)));
        ate = Math.max(de, Math.min(10, Math.floor(pgNum(ate) || 0)));
        const ouro = c => c.T1 * PG_GEMAS.T1.ouro + c.T2 * PG_GEMAS.T2.ouro + c.G * PG_GEMAS.G.ouro;
        const C = [], passos = [];
        for (let k = 0; k < 10; k++) {
            const s = PG_REFINO[k];
            let c, usaG = false;
            if (!s.cai) c = { T1: 1 / s.p, T2: 0, G: 0 };
            else {
                const a = C[k - 1];
                const semG = { T1: (1 - s.p) * a.T1 / s.p, T2: (1 + (1 - s.p) * a.T2) / s.p, G: (1 - s.p) * a.G / s.p };
                const comG = { T1: 0, T2: 1 / s.p, G: 1 / s.p };
                usaG = modo === 'com' || (modo === 'melhor' && ouro(comG) < ouro(semG));
                c = usaG ? comG : semG;
            }
            C[k] = c;
            if (k >= de && k < ate) passos.push({ alvo: s.alvo, p: s.p, cai: !!s.cai, usaG, c, ouro: ouro(c) });
        }
        const t = passos.reduce((a, x) => ({ T1: a.T1 + x.c.T1, T2: a.T2 + x.c.T2, G: a.G + x.c.G }), { T1: 0, T2: 0, G: 0 });
        const g = passos.find(x => x.usaG);
        return { de, ate, modo, passos, garantiaDesde: g ? g.alvo : null,
                 total: { T1: t.T1, T2: t.T2, G: t.G, tentativas: t.T1 + t.T2, ouro: ouro(t),
                          coins: t.T1 * PG_GEMAS.T1.coins + t.T2 * PG_GEMAS.T2.coins + t.G * PG_GEMAS.G.coins,
                          fragmentos: (t.T1 + t.T2 + t.G) * 100 } };
    }
    /* bases do catálogo do jogo (imbuements.json) com a wiki como reserva */
    function pgBasesImbu(cat) {
        const b = cat && Array.isArray(cat.bases) ? cat.bases : null;
        const lidas = (b || []).map(x => x && ({ id: pgNum(x.id), nome: x.name, taxa: pgNum(x.price), protecao: pgNum(x.protectionPrice), chance: pgNum(x.percent) != null ? pgNum(x.percent) / 100 : null }))
            .filter(x => x && x.id && x.taxa != null && x.protecao != null && x.chance > 0 && x.chance <= 1);
        return lidas.length ? lidas : PG_IMBU_BASES.slice();
    }
    const pgNomesImbu = (cat) => [...new Set(((cat && cat.imbuements) || []).map(x => x && x.name).filter(Boolean))];
    /* materiais de UM tier (o catálogo já traz o tier anterior junto) × preço */
    function pgMateriaisImbu(cat, nome, baseId, precos) {
        const im = ((cat && cat.imbuements) || []).find(x => x && x.name === nome && pgNum(x.base) === pgNum(baseId));
        if (!im) return null;
        const itens = (im.items || []).filter(Boolean).map(it => {
            const q = pgNum(it.count) || 0;
            const p = precos ? pgNum(precos[it.name] != null ? precos[it.name] : precos[pgNorm(it.name)]) : null;
            return { nome: it.name, qtd: q, preco: p, total: p != null ? p * q : null };
        });
        return { itens, total: itens.reduce((s, i) => s + (i.total || 0), 0), semPreco: itens.filter(i => i.preco == null).map(i => i.nome) };
    }
    /* Sem proteção a falha consome ouro E materiais: custo esperado = (taxa + M)/p.
     * Com proteção: taxa + proteção + M, uma vez. Vale quando M > proteção·p/(1−p) − taxa. */
    function pgProtecao(base, valorMat) {
        if (!base || !(base.chance > 0)) return null;
        const M = Math.max(0, pgNum(valorMat) || 0), p = Math.min(1, base.chance);
        const sem = (base.taxa + M) / p, com = base.taxa + base.protecao + M;
        const limite = p < 1 ? base.protecao * p / (1 - p) - base.taxa : Infinity;
        return { sem, com, vale: com < sem, limite, diferenca: Math.abs(sem - com), tentativas: 1 / p, M };
    }
    /* @@PROGRESSO-FIM */
    /* v2.11 — estado da aba Progresso, alimentado SÓ por observarProgresso()
     * (uma linha no começo de observarRecebido). Em memória: o que o jogo
     * manda de novo a cada conexão. Só os contadores do bestiário vão para o
     * localStorage (prog_bestiario), e só quando a aba desenha — antes disso
     * a gaveta da conta (LS) pode ainda não ter sido escolhida. */
    const PROG = { chaves: null, avisoChaves: null, meta: null, prey: null, best: {}, huntId: null, treino: false, an: null, estado: null,
                   amostras: [], autoSell: null, nivelProg: null, offline: null, fim: null, imbu: null, imbuErro: null, imbuPedido: false, timer: 0 };
    const PG_AMOSTRA_MS = 30000;

    function pgAnotarMeta(m) {
        const x = PROG.meta || (PROG.meta = {});
        ['wildcards', 'preyHunt', 'preyBuffs', 'preyAvisos', 'preyHuntRollFreeDay', 'autoLeave', 'xpBoost'].forEach(k => { if (k in m) x[k] = m[k]; });
        if (m.rules && Array.isArray(m.rules.keyBags)) x.keyBags = m.rules.keyBags;
        x.t = Date.now();
        if (m.huntBestiary) PROG.best = pgMesclarBestiario(PROG.best, m.huntBestiary);
        const p = pgLerPrey(x);
        if (p) PROG.prey = Object.assign(p, { t: Date.now() });
    }
    function observarProgresso(o) {
        if (!o || typeof o !== 'object' || !o.type || o.type === 'pong') return;
        const d = o.data;
        if (!d || typeof d !== 'object') return;
        const tipo = o.type, st = d.state && typeof d.state === 'object' ? d.state : null;
        if (d.meta && typeof d.meta === 'object') pgAnotarMeta(d.meta);
        const regras = PROG.meta && PROG.meta.keyBags;
        const kb = pgLerChaves(d, PROG.chaves, regras) || (st ? pgLerChaves(st, PROG.chaves, regras) : null);
        if (kb) {
            kb.t = Date.now(); PROG.chaves = kb;
            /* cheia é o único caso que custa algo sem o dono olhar: avisa UMA vez no Log */
            const av = pgAvisoChaves(kb), antes = PROG.avisoChaves;
            PROG.avisoChaves = av ? av.nivel : null;
            if (av && av.nivel === 'cheia' && antes !== 'cheia') log('⚠ ' + av.texto, 'erro');
        }
        if (tipo === 'hunt_started' || tipo === 'resume') {
            const id = pgNum(d.huntId);
            if (id !== PROG.huntId) PROG.amostras = [];
            PROG.huntId = id; PROG.treino = d.training === true;
            if (tipo === 'resume' && d.offline && typeof d.offline === 'object') PROG.offline = Object.assign({ t: Date.now() }, d.offline);
        } else if (tipo === 'ended') {
            const sm = d.summary && typeof d.summary === 'object' ? d.summary : {};
            PROG.fim = { t: Date.now(), motivo: sm.reason || null, titulo: sm.title || null, seg: pgNum(sm.elapsedSec) };
            PROG.huntId = null; PROG.amostras = []; PROG.an = null; PROG.estado = null; PROG.autoSell = null;
            return;
        }
        if (tipo !== 'frame' && tipo !== 'resume' && tipo !== 'hunt_started') return;
        const agora = Date.now();
        const a = d.analyzer && typeof d.analyzer === 'object' ? d.analyzer : null;
        if (a) PROG.an = { t: agora, ms: pgNum(a.elapsedMs), sessaoMs: pgNum(a.sessionElapsedMs), kills: pgNum(a.killsTotal), xp: pgNum(a.xp), xpH: pgNum(a.xpPerHour), sup: pgNum(a.suppliesGold), loot: pgNum(a.lootGold) };
        if (d.bestiaryKills != null && PROG.huntId != null && !PROG.treino) {
            if (typeof d.bestiaryKills === 'object') PROG.best = pgMesclarBestiario(PROG.best, d.bestiaryKills);
            else { const n = pgNum(d.bestiaryKills), k = String(PROG.huntId); if (n != null && !(PROG.best[k] >= n)) PROG.best[k] = n; }
        }
        if (!st) return;
        PROG.autoSell = st.autoSellInMs != null ? { ms: pgNum(st.autoSellInMs), t: agora } : null;
        const ch = st.character && typeof st.character === 'object' ? st.character : null;
        if (ch && ch.levelProgress) PROG.nivelProg = { xpFalta: pgXpFalta(ch.levelProgress), nivel: pgNum(ch.level), t: agora };
        const ouro = pgNum(st.balance), trav = pgNum(st.balanceLocked);
        const oz = st.cap ? pgNum(st.cap.used) : null, tot = st.cap ? pgNum(st.cap.total) : null;
        /* ouro que paga suprimento = normal + travado (o gasto sai primeiro do travado — wiki /ouro-e-ouro-travado) */
        PROG.estado = { t: agora, ouro: ouro != null ? ouro + (trav || 0) : null, trav, oz, tot };
        const ult = PROG.amostras[PROG.amostras.length - 1];
        if ((ouro != null || oz != null) && (!ult || agora - ult.t >= PG_AMOSTRA_MS)) {
            PROG.amostras.push({ t: agora, ouro: PROG.estado.ouro, oz, tot });
            if (PROG.amostras.length > 240) PROG.amostras.shift();          // 2 h de amostras
        }
    }

    /* estilos só desta aba (a casca/CSS geral é de outra área): fonte ≥ 10,5 px,
     * alvos ≥ 28 px, cinza com contraste ≥ 4,5:1 sobre o fundo da gaveta */
    const PG_CSS = `
    #tb-prog{font-size:11.5px}
    #tb-prog .pg-sub{display:flex;flex-wrap:wrap;gap:3px;margin:0 0 6px}
    #tb-prog .pg-aba{flex:1 1 auto;min-height:28px;padding:3px 4px;border-radius:14px;background:#1a1f29;color:#c3cad6;border:1px solid #2b3242;cursor:pointer;font:inherit;font-size:11px}
    #tb-prog .pg-aba:hover{background:#232936;color:#fff}
    #tb-prog .pg-aba.on{background:#2c5c3a;color:#fff;border-color:#4a9a63}
    #tb-prog button:focus-visible,#tb-prog select:focus-visible,#tb-prog input:focus-visible,#tb-prog summary:focus-visible{outline:2px solid #ffd479;outline-offset:1px}
    #tb-prog .pg-mut,#tb-prog .tb-mut{color:#9ba5b7}
    #tb-prog .pg-peq{font-size:10.5px}
    #tb-prog .pg-cx{background:#1a1f29;border:1px solid #262d3b;border-radius:7px;padding:6px 7px;margin:5px 0}
    #tb-prog .pg-alerta{background:#3a1d1d;border:1px solid #8a3a3a;color:#ffc2bd;border-radius:7px;padding:6px 7px;margin:0 0 6px;font-weight:bold}
    #tb-prog .pg-atencao{background:#33301c;border:1px solid #7a6a2a;color:#ffe3a3;border-radius:7px;padding:6px 7px;margin:5px 0}
    #tb-prog .pg-tit{margin:9px 0 3px;color:#ffd479;font-size:11px;letter-spacing:.3px;text-transform:uppercase}
    #tb-prog .pg-lin{display:flex;justify-content:space-between;gap:6px;padding:2px 0;border-bottom:1px dotted #2b3242}
    #tb-prog .pg-lin>span:last-child{text-align:right;color:#fff}
    #tb-prog table{width:100%;border-collapse:collapse;font-size:10.5px;table-layout:fixed}
    #tb-prog th{text-align:left;color:#9ba5b7;font-weight:normal;border-bottom:1px solid #2b3242;padding:2px 3px}
    #tb-prog td{padding:3px;border-bottom:1px dotted #232936;vertical-align:top}
    #tb-prog .tb-tag{font-size:10.5px}
    #tb-prog details.pg-det{margin:3px 0;border:1px solid #262d3b;border-radius:7px;background:#1a1f29}
    #tb-prog details.pg-det>summary{list-style:none;cursor:pointer;min-height:28px;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:3px 7px}
    #tb-prog details>summary::-webkit-details-marker{display:none}
    #tb-prog details.pg-det>div{padding:2px 7px 6px;font-size:10.5px}
    #tb-prog details.pg-aj{margin:5px 0}
    #tb-prog details.pg-aj>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;min-height:28px;padding:0 11px;border:1px solid #2b3242;border-radius:14px;color:#b3bccb;font-size:10.5px}
    #tb-prog details.pg-aj[open]>summary{color:#ffd479;border-color:#3a4356}
    #tb-prog details.pg-aj>div{margin-top:4px;font-size:10.5px;color:#c3cad6}
    #tb-prog select,#tb-prog input{min-height:28px;background:#232936;color:#dde3ee;border:1px solid #3a4356;border-radius:5px;padding:2px 5px;font:inherit;font-size:11px}
    #tb-prog .pg-form{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:4px 0}
    #tb-prog .pg-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:5px 0}
    #tb-prog .pg-card{background:#1a1f29;border:1px solid #262d3b;border-radius:7px;padding:4px 7px}
    #tb-prog .pg-card small{display:block;color:#9ba5b7;font-size:10.5px}
    #tb-prog .pg-card b{font-size:14px;color:#fff}
    #tb-prog .pg-barra{height:6px;border-radius:3px;background:#2b3242;overflow:hidden;margin-top:2px}
    #tb-prog .pg-barra i{display:block;height:100%;background:#4a9a63}
    #tb-prog .pg-rodape{margin-top:8px;color:#9ba5b7;font-size:10.5px}
    `;
    function pgGarantirCss() {
        if (document.getElementById('tb-prog-css')) return;
        const s = document.createElement('style'); s.id = 'tb-prog-css'; s.textContent = PG_CSS;
        (document.head || document.documentElement).appendChild(s);
    }
    /* contadores do bestiário: junta memória + gaveta (o maior vence) e guarda se mudou */
    function pgSincronizarBestiario() {
        const salvo = ler('prog_bestiario', {}) || {};
        const junto = pgMesclarBestiario(salvo, PROG.best);
        PROG.best = junto;
        if (Object.keys(junto).some(k => junto[k] !== salvo[k])) guardar('prog_bestiario', junto);
    }
    function pgMedidos() {
        const a = PROG.an;
        const vivo = a && PROG.huntId != null && a.ms >= 180000 && a.kills > 0 ? { huntId: PROG.huntId, abatesH: a.kills / a.ms * 3600000 } : null;
        let scan = [], sess = [];
        try { scan = Object.values(scanResultados() || {}); } catch { scan = []; }
        try { sess = sessoes() || []; } catch { sess = []; }
        return pgAbatesPorHunt(vivo, scan, sess);
    }
    const pgFresco = () => !!(PROG.estado && Date.now() - PROG.estado.t < 10000 && PROG.huntId != null);
    const pgHuntCat = (id) => id == null ? null : (CAT.hunts || []).find(h => h && h.id === id) || null;
    const pgBonusTxt = (b, v) => `+${pgInt(v)} ${escHtml(PG_BONUS[b] || b || '?')}`;
    const pgMateriaisSet = () => new Set(((PROG.imbu && PROG.imbu.imbuements) || []).flatMap(x => (x && x.items || []).map(i => pgNorm(i && i.name))));
    const pgSemDado = (o) => `<div class="pg-cx pg-mut">${o}: sem dado ainda — abra/entre numa caçada.</div>`;
    /* 1 linha de bestiário de uma caçada ("3.412/5.000 → +6 vida máx · ~1h06"); serve ao Scan se o integrador quiser */
    function pgBestiarioTexto(huntId, medidos) {
        const h = pgHuntCat(huntId); if (!h || !h.bestiary) return '';
        const c = PROG.best[String(huntId)];
        if (c == null) return `bestiário ${escHtml(PG_BONUS[h.bestiary.bonus] || h.bestiary.bonus)}: contador ainda não lido`;
        const e = pgEstagio(h.bestiary, c); if (!e) return '';
        if (e.completo) return `bestiário completo (${pgBonusTxt(e.bonus, e.valor)})`;
        const m = (medidos || {})[huntId];
        return `bestiário ${pgInt(e.kills)}/${pgInt(e.prox.kills)} → ${pgBonusTxt(e.bonus, e.prox.value)}${m && m.abatesH > 0 ? ' · ~' + pgHoras(e.falta / m.abatesH) : ''}`;
    }

    function pgTelaChaves() {
        const kb = PROG.chaves, regras = PROG.meta && PROG.meta.keyBags;
        let h = '';
        if (!kb) h += pgSemDado('Mochila de chaves');
        else {
            const t = pgTierDaMochila(kb, regras), av = pgAvisoChaves(Object.assign({}, kb, { max: t.max }));
            const cls = av && av.nivel === 'cheia' ? 'tb-ruim' : av && (av.nivel === 'quase' || av.nivel === 'talvez') ? 'tb-av' : 'tb-ok';
            h += `<div class="pg-lin"><b>Mochila de chaves</b><span class="${cls}">${pgInt(kb.usadas)}${t.max ? ' / ' + pgInt(t.max) : ''}</span></div>`;
            h += `<div class="pg-mut pg-peq">${t.nome ? escHtml(t.nome) + ' · ' : ''}T1 guarda ${PG_WIKI.mochilaT1}, T2 guarda ${PG_WIKI.mochilaT2} (100 coins). Chave no depósito também vale para o Elite e o Sweep.</div>`;
            if (av && (av.nivel === 'quase' || av.nivel === 'talvez')) h += `<div class="pg-atencao">${escHtml(av.texto)}</div>`;
            const nomes = Object.keys(kb.chaves || {}).sort((a, b) => a.localeCompare(b));
            if (!nomes.length) h += `<div class="pg-mut">nenhuma chave na mochila de chaves.</div>`;
            const mats = pgMateriaisSet();
            nomes.forEach((n, i) => {
                const info = pgInfoChave(n, CAT.bosses, CAT.hunts), e = pgResumoElite(info.elite, mats);
                const els = e ? [e.fraco.length ? 'fraco a ' + e.fraco.map(x => `${x.el} (+${-x.pct}% de dano)`).join(', ') : '',
                                 e.resiste.length ? 'resiste ' + e.resiste.map(x => `${x.el} ${x.pct}%`).join(', ') : '',
                                 e.imune.length ? 'imune a ' + e.imune.join(', ') : ''].filter(Boolean).join(' · ') : '';
                h += `<details class="pg-det" data-k="pg-ch-${i}"><summary><span>${escHtml(n)} <b>×${pgInt(kb.chaves[n])}</b></span><span class="pg-mut">${e ? escHtml(e.nome) + ' · ' + pgInt(e.hp) + ' HP' : 'Elite ?'}</span></summary><div>` +
                    (e ? `<div>${els ? escHtml(els) : 'sem fraqueza nem resistência'}</div>` +
                         (e.top.length ? `<div>loot de valor: ${e.top.map(l => `${escHtml(l.nome)} ${pgInt(l.valor)}${l.chance != null ? ' <span class="pg-mut">(' + pgPct(l.chance, 1) + ')</span>' : ''}`).join(' · ')}</div>` : '') +
                         (e.materiais.length ? `<div>materiais de imbuement: ${e.materiais.map(escHtml).join(', ')}</div>` : '') +
                         (e.fragmentos.length ? `<div class="pg-mut">fragmentos de forja: ${e.fragmentos.map(escHtml).join(', ')}</div>` : '')
                       : `<div class="pg-mut">Elite não encontrado no catálogo /bosses/select${CAT.bosses ? '' : ' (catálogo ainda não carregou)'}.</div>`) +
                    (info.hunt ? `<div class="pg-mut">cai em ${escHtml(info.hunt.title)}${info.chance != null ? ' · ' + pgPct(info.chance, 3) + ' por abate' : ''}</div>` : '') +
                    `</div></details>`;
            });
        }
        h += `<div class="pg-tit">Chaves por hora</div>`;
        const med = pgMedidos(), fator = pgFatorLootPrey(PROG.prey);
        const linhas = pgLinhasChaves(CAT.hunts, CAT.bosses, med, fator, PROG.huntId);
        if (!linhas.length) h += `<div class="pg-mut">sem abates por hora medidos — cace alguns minutos nesta aba aberta, ou rode o Scan.</div>`;
        else {
            h += `<table><tr><th>caçada · chave</th><th style="width:58px">abates/h</th><th style="width:84px">chaves/h</th></tr>` +
                linhas.slice(0, 8).map(l => `<tr><td>${l.atual ? '<b>' : ''}${escHtml(l.hunt.title)}${l.atual ? '</b>' : ''}<div class="pg-mut">${escHtml(l.chave)} · ${pgPct(l.chance, 3)}</div></td>` +
                    `<td>${pgInt(l.abatesH)}<div class="pg-mut">${escHtml(l.fonte)}</div></td><td>${pgDec(l.chavesH, 2)}<div class="pg-mut">cada ${pgHoras(l.cadaH)}</div></td></tr>`).join('') + `</table>`;
            const at = linhas.find(l => l.atual);
            if (at && kb) {
                const t = pgTierDaMochila(kb, regras);
                if (t.max > 0) {
                    const livre = t.max - (kb.usadas || 0);
                    h += `<div class="${livre <= 0 ? 'tb-ruim' : 'pg-mut'}" style="margin-top:3px">${livre <= 0 ? `mochila de chaves cheia: nesse ritmo, ~${pgDec(at.chavesH, 2)} chave(s) por hora serão perdidas.` : `nesse ritmo a mochila de chaves enche em ~${pgHoras(livre / at.chavesH)}.`}</div>`;
                }
            }
            if (fator > 1) h += `<div class="pg-mut pg-peq">inclui o LOOT da prey (+${pgDec((fator - 1) * 100, 0)}% na chance).</div>`;
        }
        h += `<details class="pg-aj" data-k="pg-ch-aj"><summary>? como é a conta</summary><div>A chance vem do catálogo do jogo (é a que o card do item mostra); a wiki diz que a maioria das chaves fica entre 0,047% e 0,105% por abate (uma a cada ~950 a 2.100 abates). LOOT da prey e Chance de loot da Forja aumentam a chance. Com a mochila de chaves cheia, a chave que cai na caçada é perdida; a que vem de caixa ou prêmio vai para o depósito. Sweep: cada chave extra vira um loot do Elite (custa o suprimento da última vitória; sem xp e sem bestiário).</div></details>`;
        return h;
    }

    function pgTelaBestiario() {
        const hs = CAT.hunts || [];
        if (!hs.length) return `<div class="pg-mut">catálogo de caçadas ainda não carregou.</div>`;
        const cont = PROG.best, med = pgMedidos(), nv = nivelAtual();
        let h = '';
        const atual = pgHuntCat(PROG.huntId);
        if (atual && atual.bestiary) {
            const e = pgEstagio(atual.bestiary, cont[String(atual.id)]);
            h += `<div class="pg-cx"><b>${escHtml(atual.title)}</b>${PROG.treino ? ' <span class="tb-tag">treino não conta</span>' : ''}<div>${pgBestiarioTexto(atual.id, med)}</div>` +
                (e && !e.completo && cont[String(atual.id)] != null ? `<div class="pg-barra"><i style="width:${Math.round(e.pct * 100)}%"></i></div>` : '') + `</div>`;
        }
        if (!Object.keys(cont).length) return h + pgSemDado('Contadores do bestiário') + pgAjudaBestiario();
        const bon = pgBonusConta(hs, cont);
        const bl = Object.keys(bon).sort((a, b) => bon[b] - bon[a]).map(b => pgBonusTxt(b, bon[b]));
        h += `<div class="pg-cx"><div class="pg-mut pg-peq">Bônus da conta (marcos fechados)</div>${bl.length ? bl.join(' · ') : 'nenhum ainda'}</div>`;
        const rows = pgLinhasBestiario(hs, cont, med, nv);
        const linha = r => `<tr><td>${escHtml(r.hunt.title)} <span class="pg-mut">[${pgInt(pgNum(r.hunt.levelMin) || 1)}]</span><div class="pg-barra"><i style="width:${Math.round(r.e.pct * 100)}%"></i></div>` +
            `<div class="pg-mut">${pgInt(r.e.kills)}/${pgInt(r.e.prox.kills)} · faltam ${pgInt(r.e.falta)}</div></td>` +
            `<td>${pgBonusTxt(r.e.bonus, r.e.prox.value)}<div class="pg-mut">${r.horas != null ? '~' + pgHoras(r.horas) : 'sem abates/h'}</div></td></tr>`;
        const cab = `<table><tr><th>caçada · abates</th><th style="width:96px">próximo marco</th></tr>`;
        if (!rows.length) h += `<div class="pg-mut">nenhuma caçada do seu nível com marco por fechar e contador conhecido.</div>`;
        else {
            h += `<div class="pg-tit">Mais perto do próximo marco</div>` + cab + rows.slice(0, 8).map(linha).join('') + `</table>`;
            if (rows.length > 8) h += `<details class="pg-aj" data-k="pg-best-todas"><summary>todas (${rows.length})</summary><div>${cab}${rows.slice(8).map(linha).join('')}</table></div></details>`;
        }
        const semCont = hs.filter(x => x && x.bestiary && (x.levelMin || 1) <= nv && cont[String(x.id)] == null).length;
        if (semCont) h += `<div class="pg-mut pg-peq">${semCont} caçada(s) do seu nível sem contador conhecido — o jogo manda todos ao conectar (meta) e o da caçada atual a cada segundo.</div>`;
        return h + pgAjudaBestiario();
    }
    const pgAjudaBestiario = () => `<details class="pg-aj" data-k="pg-best-aj"><summary>? regras</summary><div>Cada caçada tem 3 marcos; vale o MAIOR (não somam). Caçadas diferentes somam. Conta qualquer criatura do elenco, inclusive com o jogo fechado; treino e Elite/Boss não contam; o Reset das estatísticas não apaga. Tempo = abates que faltam ÷ abates/h medidos (ao vivo, Scan ou sessões do Analisador).</div></details>`;

    function pgTelaOffline() {
        const al = PROG.meta && PROG.meta.autoLeave && typeof PROG.meta.autoLeave === 'object' ? PROG.meta.autoLeave : null;
        let h = `<div class="pg-lin"><span>Auto Exit</span><span>${al ? (al.enabled ? '<span class="tb-ok">ligado</span>' : '<span class="tb-av">desligado</span>') : '<span class="pg-mut">sem dado ainda</span>'}</span></div>` +
            (al && al.enabled ? `<div class="pg-mut pg-peq">margem de ouro ${pgInt(pgNum(al.floor))}${pgNum(al.floor) > 0 ? '' : ' (0 = nunca sai por ouro)'} · mochila cheia ${al.onCap ? 'encerra' : 'NÃO encerra'}</div>` : '');
        const atual = pgHuntCat(PROG.huntId);
        if (PROG.huntId != null && !atual) h += `<div class="pg-cx pg-mut">luta de Elite/Boss em andamento — o plano é para caçada comum.</div>`;
        else if (!pgFresco()) h += `<div class="pg-cx pg-mut">Plano da caçada com o jogo fechado: sem dado ainda — abra/entre numa caçada (precisa do ouro, da mochila e do analisador que o jogo manda a cada segundo).</div>`;
        else {
            const u = PROG.estado, a = PROG.an || {};
            const tx = pgTaxas(PROG.amostras, 3600000);
            const sessaoMs = a.sessaoMs != null ? a.sessaoMs : a.ms;
            const xpH = a.xpH > 0 ? a.xpH : a.ms > 60000 && a.xp > 0 ? a.xp / a.ms * 3600000 : null;
            let xpFalta = PROG.nivelProg && PROG.nivelProg.xpFalta;
            if (xpFalta == null) { try { xpFalta = xpFaltando(); } catch { xpFalta = null; } }
            const autoSell = !!(PROG.autoSell && PROG.autoSell.ms != null);
            const p = pgPlanoOffline({ ouro: u.ouro, margem: al && pgNum(al.floor), autoExit: !!(al && al.enabled), autoExitCap: !!(al && al.enabled && al.onCap),
                                       supH: a.ms > 60000 && a.sup != null ? a.sup / a.ms * 3600000 : null, taxas: tx,
                                       ozLivre: u.tot != null && u.oz != null ? u.tot - u.oz : null, autoSell, sessaoMs, xpH, xpFalta });
            const card = (r, v) => `<div class="pg-card"><small>${r}</small><b>${v}</b></div>`;
            h += `<div class="pg-grid">${card('OURO (com travado)', pgInt(u.ouro))}${card(p.ouroFonte === 'medido' ? 'SALDO/H MEDIDO' : 'SUPRIMENTO/H', p.ouroH != null ? (p.ouroH > 0 ? '+' : '') + pgInt(p.ouroH) : '—')}` +
                 `${card('MOCHILA LIVRE', u.tot != null && u.oz != null ? pgInt(u.tot - u.oz) + ' oz' : '—')}${card('SESSÃO', sessaoMs != null ? pgHoras(sessaoMs / 3600000) + ' de 12h' : '—')}</div>`;
            const lin = (x, y) => `<div class="pg-lin"><span>${x}</span><span>${y}</span></div>`;
            h += lin('ouro dura', p.horasOuro == null ? '—' : pgHoras(p.horasOuro) + (p.ouroFonte === 'suprimento' && Number.isFinite(p.horasOuro) ? ' <span class="pg-mut">(pior caso)</span>' : ''));
            h += lin('mochila enche em', p.horasMochila == null ? (autoSell ? '<span class="pg-mut">medindo (Auto Selling)</span>' : '<span class="pg-mut">medindo…</span>') : pgHoras(p.horasMochila));
            h += lin('teto de 12 h em', pgHoras(p.tetoH) + (a.sessaoMs == null ? ' <span class="pg-mut">(aprox.)</span>' : ''));
            if (p.horasNivel != null) h += lin('próximo nível em', pgHoras(p.horasNivel));
            const pr = p.primeiro, fim = p.fim;
            h += `<div class="${pr.k === 'ouro' && !pr.encerra ? 'pg-alerta' : 'pg-atencao'}" style="margin-top:6px">Se fechar o jogo agora: em ~${pgHoras(pr.h)} ${escHtml(pr.texto)}.` +
                 (fim !== pr ? ` A caçada termina em ~${pgHoras(fim.h)} (${escHtml(fim.k === 'teto' ? 'teto de 12 h' : fim.k === 'ouro' ? 'Auto Exit por ouro' : 'Auto Exit por mochila')}).` : '') +
                 (p.xpAteFim ? ` Até lá: ~${pgInt(p.xpAteFim)} de xp.` : '') + `</div>`;
            h += `<div class="pg-mut pg-peq">${p.ouroFonte === 'medido' ? `saldo medido em ${pgHoras(tx.horas)} (moedas + Auto Selling − suprimento)` : 'saldo ainda não medido (precisa de 10 min): usei só o gasto de suprimento, sem contar moedas e vendas'}${autoSell ? ' · Auto Selling ligado: a mochila esvazia a cada 10 min' : ''}.</div>`;
        }
        if (PROG.fim) h += `<div class="pg-lin" style="margin-top:4px"><span>Última caçada</span><span>${PROG.fim.titulo ? escHtml(PROG.fim.titulo) + ' · ' : ''}${escHtml(PG_FIM[PROG.fim.motivo] || PROG.fim.motivo || '?')}${PROG.fim.seg != null ? ' · ' + pgHoras(PROG.fim.seg / 3600) : ''}</span></div>`;
        const of = PROG.offline;
        if (of && pgNum(of.elapsedMs) > 0) h += `<div class="pg-lin"><span>Da última vez fora</span><span>${pgHoras(pgNum(of.elapsedMs) / 3600000)} · ${pgInt(pgNum(of.xp))} xp · ${pgInt(pgNum(of.killsTotal))} abates · ${pgInt(pgNum(of.lootGold))} de loot</span></div>`;
        h += `<details class="pg-aj" data-k="pg-off-aj"><summary>? antes de fechar o jogo</summary><div>A caçada segue no servidor por até 12 h de caçada (aberto + fechado). O que encerra antes: ENCERRAR, morte de qualquer personagem, Auto Exit por ouro abaixo da margem ou por mochila cheia (só com as duas chaves ligadas em Configurações → JOGO → Auto Leaving). Sem Auto Exit, sem ouro as poções e runas pagas pausam, e com a mochila cheia o loot deixa de ser coletado. Antes de dormir: margem que pague a próxima caçada e bênçãos compradas.</div></details>`;
        return h;
    }

    function pgTelaPrey() {
        const p = PROG.prey;
        let h = '';
        const tipoTxt = { xp: 'EXP', loot: 'LOOT', dano: 'DANO', defesa: 'DEFESA' };
        if (!p) h += `<div class="pg-cx pg-mut">Estado da prey não disponível — o jogo manda ao conectar ou ao mexer na Prey. A sugestão abaixo vale do mesmo jeito.</div>`;
        else {
            h += `<div class="pg-lin"><span>Wildcards</span><span>${p.wildcards != null ? pgInt(p.wildcards) : '—'}</span></div>`;
            const c = p.cacada;
            h += `<div class="pg-lin"><span>Caçada da conta</span><span>${c ? `${escHtml(c.titulo || ('#' + c.huntId))}${c.locked ? ' 🔒' : ''}${c.msLeft != null ? ' · ' + pgHoras(c.msLeft / 3600000) : ''}` : '<span class="tb-av">nenhuma</span>'}</span></div>`;
            h += PG_VOCS.map(v => {
                const b = p.buffs[v];
                const txt = !b ? '<span class="pg-mut">—</span>' : b.tipo || b.tier
                    ? `${escHtml(tipoTxt[b.tipo] || b.rotulo || '?')}${b.tier ? ' ★' + pgInt(b.tier) : ''}${b.pct != null ? ' +' + pgDec(b.pct, 0) + '%' : ''}${b.msLeft != null ? ' · ' + pgHoras(b.msLeft / 3600000) : ''}${b.locked ? ' 🔒' : ''}`
                    : `<span class="pg-mut">sem bônus${b.piso ? ' (piso ★' + pgInt(b.piso) + ')' : ''}</span>`;
                return `<div class="pg-lin"><span>${PG_VOC[v]}</span><span>${txt}${b && b.gratis ? '<div class="tb-ok pg-peq">sorteio grátis hoje</div>' : ''}</span></div>`;
            }).join('');
            const tv = pgTravasPrey(p);
            if (tv && tv.travadas) {
                h += `<div class="${tv.horasTravas != null && tv.horasTravas < 4 ? 'pg-atencao' : 'pg-cx'}">${tv.travadas} seção(ões) travada(s) gastam ${tv.travadas} wildcard(s) a cada 2 h de caçada.` +
                     (tv.horasTravas != null ? ` Com ${pgInt(tv.wildcards)}, as travas desligam em ~${pgHoras(tv.horasTravas)} de caçada (zerou → TODAS desligam) e o último bônus acaba em ~${pgHoras(tv.horasBonus)}.` : '') + `</div>`;
            }
            if (p.avisos.length) h += `<div class="pg-mut pg-peq">avisos do jogo: ${p.avisos.slice(0, 4).map(a => escHtml((a.target === 'hunt' ? 'caçada' : PG_VOC[a.target] || a.target || '?') + ' ' + String(a.kind || '').replace(/_/g, ' ') + (a.vezes > 1 ? ' (' + a.vezes + '×)' : ''))).join(' · ')}</div>`;
        }
        const xb = PROG.meta && PROG.meta.xpBoost;
        if (xb && typeof xb === 'object' && pgNum(xb.percent)) h += `<div class="pg-lin"><span>XP Boost</span><span>+${pgInt(pgNum(xb.percent))}% · ${pgHoras(pgNum(xb.msLeft) / 3600000)}</span></div>`;
        let rz = null;
        try { rz = razaoResumo(RAZAO); if (!rz || !rz.danoTotal) rz = null; } catch { rz = null; }
        const sg = pgSugestaoPrey(rz);
        h += `<div class="pg-tit">Sugestão por coluna</div>` + PG_VOCS.map(v => `<div class="pg-lin"><span>${PG_VOC[v]}</span><span><b>${tipoTxt[sg[v].tipo]}</b></span></div><div class="pg-mut pg-peq">${escHtml(sg[v].motivo)}</div>`).join('');
        if (!rz) h += `<div class="pg-mut pg-peq">sem livro-razão desta caçada ainda (dano por personagem): cace alguns minutos para a sugestão de DANO usar o dano medido.</div>`;
        h += `<details class="pg-aj" data-k="pg-prey-aj"><summary>? regras da prey</summary><div>Uma caçada para a conta + 4 colunas (uma por vocação). EXP e LOOT ★1–10 = +1 a +10% e SOMAM para a conta; DANO e DEFESA ★1–10 = +4 a +40% só no personagem da coluna. Cada sorteio vale 2 h de caçada (em qualquer caçada; treino e Elite/Boss não gastam nem recebem). O tier nunca cai. Primeiro sorteio do dia de cada coluna é grátis, depois 1 wildcard; ESCOLHER CAÇADA custa 5. Trava: renova sozinha por 1 wildcard por seção a cada renovação; zerou as wildcards → todas as travas desligam na hora.</div></details>`;
        return h;
    }

    const pgCalc = () => Object.assign({ de: 4, ate: 7, modo: 'melhor', imbu: 'Vampirism', tier: 3, mat: null }, ler('prog_calc', {}) || {});
    function pgImbuValores(c) {
        const bases = pgBasesImbu(PROG.imbu), base = bases.find(b => b.id === pgNum(c.tier)) || bases[0];
        const mats = PROG.imbu ? pgMateriaisImbu(PROG.imbu, c.imbu, base.id, CAT.precos) : null;
        return { bases, base, mats };
    }
    function pgImbuHtml(c, matDigitado) {
        const v = pgImbuValores(c);
        const M = matDigitado != null && matDigitado !== '' ? pgNum(matDigitado) : v.mats ? v.mats.total : null;
        const r = pgProtecao(v.base, M);
        if (!r) return '';
        let h = `<div class="pg-lin"><span>sem proteção (${pgPct(v.base.chance, 0)})</span><span>~${pgInt(r.sem)} <span class="pg-mut">(${pgDec(r.tentativas, 2)} tentativas)</span></span></div>` +
                `<div class="pg-lin"><span>com proteção (100%)</span><span>${pgInt(r.com)}</span></div>` +
                `<div class="${r.vale ? 'tb-ok' : 'tb-av'}" style="margin-top:3px"><b>proteção ${r.vale ? 'VALE' : 'NÃO vale'}</b> — ${r.vale ? 'economiza' : 'custa'} ~${pgInt(r.diferenca)} de ouro em média. ${Number.isFinite(r.limite) && r.limite > 0 ? `Vale quando os materiais valem mais de ${pgInt(r.limite)}.` : 'Neste tier vale sempre: a taxa perdida numa falha passa da proteção.'}</div>`;
        if (M == null) h += `<div class="pg-mut pg-peq">sem preço dos materiais: conta feita com materiais = 0 (digite o valor).</div>`;
        return h;
    }
    function pgTelaForja() {
        const c = pgCalc();
        const opt = (v, t, sel) => `<option value="${v}"${String(v) === String(sel) ? ' selected' : ''}>${t}</option>`;
        let h = `<div class="pg-tit">Refino esperado</div><div class="pg-form"><label for="pg-de">de</label><select id="pg-de">` +
            Array.from({ length: 10 }, (_, i) => opt(i, '+' + i, c.de)).join('') + `</select><label for="pg-ate">até</label><select id="pg-ate">` +
            Array.from({ length: 10 }, (_, i) => opt(i + 1, '+' + (i + 1), c.ate)).join('') + `</select><select id="pg-modo" aria-label="Garantia">` +
            opt('melhor', 'Garantia onde compensa', c.modo) + opt('com', 'sempre com Garantia', c.modo) + opt('sem', 'sem Garantia', c.modo) + `</select></div>`;
        const r = pgRefino(c.de, c.ate, c.modo);
        if (!r.passos.length) h += `<div class="pg-mut">escolha um alvo acima do nível atual.</div>`;
        else {
            const t = r.total;
            h += `<table><tr><th style="width:34px">alvo</th><th style="width:48px">chance</th><th>gemas esperadas</th><th style="width:66px">ouro</th></tr>` +
                r.passos.map(x => `<tr><td>+${x.alvo}</td><td>${pgPct(x.p, 0)}</td><td>${x.c.T1 > 0.005 ? pgDec(x.c.T1, 1) + ' T1 ' : ''}${x.c.T2 > 0.005 ? pgDec(x.c.T2, 1) + ' T2 ' : ''}${x.c.G > 0.005 ? pgDec(x.c.G, 1) + ' Gar.' : ''}${x.cai ? `<div class="pg-mut">${x.usaG ? 'com Garantia' : 'falha cai 1 nível'}</div>` : ''}</td><td>${pgInt(x.ouro)}</td></tr>`).join('') + `</table>`;
            h += `<div class="pg-cx">Total esperado: <b>${pgDec(t.tentativas, 1)}</b> tentativas · <b>${pgInt(t.ouro)}</b> de ouro · ${pgInt(t.coins)} coins · ${pgInt(t.fragmentos)} fragmentos` +
                 `<div class="pg-mut pg-peq">${pgDec(t.T1, 1)} Refine T1 · ${pgDec(t.T2, 1)} Refine T2 · ${pgDec(t.G, 1)} Guarantee T1${c.modo === 'melhor' ? (r.garantiaDesde ? ` · Garantia compensa a partir do +${r.garantiaDesde}` : ' · Garantia não compensa nesta faixa') : ''}</div></div>`;
        }
        h += `<div class="pg-tit">Imbuement: proteção vale a pena?</div>`;
        if (!PROG.imbu) h += `<div class="pg-mut pg-peq">${PROG.imbuErro ? 'catálogo de imbuements não carregou (' + escHtml(PROG.imbuErro) + ') — digite o valor dos materiais.' : 'carregando o catálogo de imbuements…'}</div>`;
        const nomes = pgNomesImbu(PROG.imbu), v = pgImbuValores(c);
        h += `<div class="pg-form">` + (nomes.length ? `<select id="pg-imbu" aria-label="imbuement">${nomes.map(n => opt(escHtml(n), escHtml(n) + (/swiftness/i.test(n) ? ' (sem efeito hoje)' : ''), escHtml(c.imbu))).join('')}</select>` : '') +
             `<select id="pg-tier" aria-label="tier">${v.bases.map(b => opt(b.id, escHtml(b.nome), c.tier)).join('')}</select>` +
             `<input id="pg-mat" type="number" min="0" step="100" style="width:96px" aria-label="valor dos materiais" placeholder="${v.mats ? pgInt(v.mats.total).replace(/\D/g, '') : 'materiais'}" value="${c.mat != null ? pgInt(c.mat).replace(/\D/g, '') : ''}"></div>`;
        if (v.mats) h += `<div class="pg-mut pg-peq">materiais (preço de NPC): ${v.mats.itens.map(i => `${pgInt(i.qtd)} ${escHtml(i.nome)}${i.preco != null ? ' × ' + pgInt(i.preco) : ' (sem preço)'}`).join(' + ')} = ${pgInt(v.mats.total)}. No Mercado podem valer mais — digite outro valor se quiser.</div>`;
        h += `<div id="pg-imbu-res">${pgImbuHtml(c, c.mat)}</div>`;
        h += `<details class="pg-aj" data-k="pg-forja-aj"><summary>? regras</summary><div>Forja: +1 a +4 = 80/70/60/50% (falha não cai); +5 a +10 = 35/25/20/15/10/5% e a falha SEM Garantia derruba 1 nível. A Garantia não muda a chance e é gasta em toda tentativa. Gemas: Refine T1 10.000 + 5 coins, Refine T2 35.000 + 8 coins, Guarantee T1 15.000 + 5 coins, cada uma com 100 fragmentos. Imbuement: Basic 5.000 (90%, proteção +10.000), Intricate 30.000 (70%, +30.000), Powerful 200.000 (50%, +50.000); sem proteção a falha consome ouro e materiais.</div></details>`;
        return h;
    }
    async function pgCarregarImbu() {
        if (PROG.imbu || PROG.imbuPedido) return;
        PROG.imbuPedido = true;
        /* a versão dos assets muda com o patch (v100 já dá 404): pega a do catálogo de bosses */
        const cena = (CAT.bosses || []).map(b => b && b.scene).find(s => /\/assets\/v\d+\//.test(s || ''));
        const vers = [...new Set([cena ? cena.match(/\/assets\/(v\d+)\//)[1] : null, 'v167'].filter(Boolean))];
        for (const v of vers) {
            try { const j = await buscarJSON('/assets/' + v + '/imbuements.json'); if (j && Array.isArray(j.imbuements)) { PROG.imbu = j; PROG.imbuErro = null; break; } }
            catch (e) { PROG.imbuErro = e.message; }
        }
        if (!PROG.imbu && !PROG.imbuErro) PROG.imbuErro = 'formato inesperado';
        if (ABA === 'progresso') renderizar();
    }

    /* v2.11 — ABA PROGRESSO. Sub-abas para caber nos 300 px da gaveta; o
     * aviso de mochila de chaves cheia aparece em todas. */
    function telaProgresso() {
        pgGarantirCss();
        pgSincronizarBestiario();
        const sub = ler('prog_sub', 'chaves');
        const abas = [['chaves', 'Chaves'], ['bestiario', 'Bestiário'], ['offline', 'Offline'], ['prey', 'Prey'], ['forja', 'Forja']];
        const kb = PROG.chaves;
        const maxKb = kb ? pgTierDaMochila(kb, PROG.meta && PROG.meta.keyBags).max : null;
        const av = kb ? pgAvisoChaves(Object.assign({}, kb, { max: maxKb })) : null;
        let h = `<div id="tb-prog"><div class="pg-sub" role="tablist">` + abas.map(([k, n]) =>
            `<button class="pg-aba${k === sub ? ' on' : ''}" data-pg-sub="${k}" role="tab" aria-selected="${k === sub}">${n}${k === 'chaves' && av && av.nivel === 'cheia' ? ' <b class="tb-ruim">!</b>' : ''}</button>`).join('') + `</div>`;
        /* texto inteiro na sub-aba Chaves; nas outras, uma linha (não empurra o conteúdo para baixo) */
        if (av && av.nivel === 'cheia') h += `<div class="pg-alerta" role="alert">⚠ ${sub === 'chaves' ? escHtml(av.texto) : `mochila de chaves cheia (${pgInt(kb.usadas)}/${pgInt(maxKb)}): chave nova será PERDIDA`}</div>`;
        h += sub === 'bestiario' ? pgTelaBestiario() : sub === 'offline' ? pgTelaOffline() : sub === 'prey' ? pgTelaPrey() : sub === 'forja' ? pgTelaForja() : pgTelaChaves();
        return h + `<div class="pg-rodape">Só leitura: nada nesta aba envia comando ao jogo.</div></div>`;
    }
    function ligarProgresso() {
        $$('[data-pg-sub]').forEach(b => b.onclick = () => { guardar('prog_sub', b.dataset.pgSub); renderizar(); });
        const muda = (patch) => { guardar('prog_calc', Object.assign(pgCalc(), patch)); renderizar(); };
        const de = $('#pg-de'); if (de) de.onchange = () => { const x = parseInt(de.value) || 0; muda({ de: x, ate: Math.max(x + 1, pgCalc().ate) }); };
        const ate = $('#pg-ate'); if (ate) ate.onchange = () => muda({ ate: parseInt(ate.value) || 1 });
        const md = $('#pg-modo'); if (md) md.onchange = () => muda({ modo: md.value });
        const im = $('#pg-imbu'); if (im) im.onchange = () => muda({ imbu: im.value, mat: null });
        const tr = $('#pg-tier'); if (tr) tr.onchange = () => muda({ tier: parseInt(tr.value) || 1, mat: null });
        const mat = $('#pg-mat');
        if (mat) {
            /* digitar não repinta a aba (perderia o foco): só o resultado */
            mat.oninput = () => { const r = $('#pg-imbu-res'); if (r) r.innerHTML = pgImbuHtml(pgCalc(), mat.value); };
            mat.onchange = () => guardar('prog_calc', Object.assign(pgCalc(), { mat: mat.value === '' ? null : Math.max(0, parseInt(mat.value) || 0) }));
        }
        /* o catálogo de imbuements (13 KB, público) serve à calculadora e marca materiais no loot dos Elites */
        { const sub = ler('prog_sub', 'chaves'); if (sub === 'forja' || sub === 'chaves') pgCarregarImbu().catch(() => { }); }
        /* repinta sozinha a cada 5 s só com a aba aberta e a party caçando (é
         * leitura: ouro, mochila e abates mudam a cada frame); nunca no meio de
         * um campo em edição */
        if (!PROG.timer) PROG.timer = setInterval(() => {
            try {
                const g = $('#tb-gaveta');
                if (ABA !== 'progresso' || !g || !g.classList.contains('on') || !$('#tb-prog') || PROG.huntId == null) return;
                const f = document.activeElement;
                if (f && f.closest && f.closest('#tb-prog') && /^(INPUT|SELECT)$/.test(f.tagName)) return;
                renderizar();
            } catch { }
        }, 5000);
    }

    /* ⚠ O CORPO INTEIRO VAI NUM try. Motivo real (30/08): eu escrevi
     * `$('[data-usar-palpite]').forEach` — um cifrão em vez de dois. `$` é
     * querySelector e devolve UM nó, então `.forEach` estourou TypeError. Só
     * que renderizar() é chamado por montarPainel(), e o estouro subiu até
     * iniciar(), abortando a linha seguinte — `await carregarCatalogos()`.
     * Resultado: catálogos "não carregados" e lista de hunts VAZIA, um sintoma
     * a três passos da causa. Uma tela quebrada nunca mais derruba o boot. */
    function renderizar() {
        try { _renderizar(); }
        catch (e) { console.error('[TB] erro ao desenhar a tela', e); }
    }

    let _abaPintada = null, _scanFiltro = '';
    /* pontos de estado nos ícones: verde = ligado/caçando, âmbar pulsando =
     * trabalhando, vermelho = erro no Log nos últimos 60 s */
    function pintarTrilho() {
        const t = $('#tb-trilho'); if (!t) return;
        const u = ui();
        let erroRecente = false; try { const l = LOG[LOG.length - 1]; erroRecente = !!(l && l.tipo === 'erro' && Date.now() - l.t < 60000); } catch (e) { }
        const estado = {
            estado: _cicloEmCurso ? 'av pulsa' : (emHunt() ? 'ok' : ''),
            magia: _aplicando || _aprendendo ? 'av pulsa' : '',
            autohunt: autoHunt().on ? (_cicloEmCurso ? 'av pulsa' : 'ok') : '',
            scan: SCAN.ativo ? 'ok pulsa' : '',
            equip: EQUIP.equipando || EQUIP.lendo ? 'av pulsa' : '',
            log: erroRecente ? 'ruim' : ''
        };
        $$('.tb-ico[data-aba]', t).forEach(i => { i.classList.toggle('on', !!u.aberta && i.dataset.aba === ABA); const d = $('.tb-dot', i); if (d) d.className = 'tb-dot ' + (estado[i.dataset.aba] || ''); });
        const at = $('#tb-atualizar', t); if (at) { at.style.display = NOVA_VERSAO ? 'flex' : 'none'; at.title = NOVA_VERSAO ? 'versão ' + NOVA_VERSAO + ' disponível — clique para atualizar no Tampermonkey' : ''; }
    }
    function _renderizar() {
        pintarTrilho();
        const g = $('#tb-gaveta'), c = $('#tb-corpo'); if (!g || !c) return;
        const u = ui();
        g.classList.toggle('on', !!u.aberta && !u.oculto);
        posicionarCaixa();
        if (!u.aberta || u.oculto) { _abaPintada = null; return; }
        const tit = $('#tb-titulo'); if (tit) tit.textContent = (ICONES.find(x => x[0] === ABA) || [])[2] || ABA;
        /* v2.3.0 — trocar o innerHTML zera a rolagem: marcar um mapa no Scan
         * jogava a lista de volta ao topo (dono, 27/09). Guarda a posição do
         * corpo e da lista e devolve quando a aba é a mesma. v2.8.0: idem
         * para os "?" abertos (details[data-k]). */
        const mesmaAba = _abaPintada === ABA;
        const rol = { corpo: mesmaAba ? c.scrollTop : 0, lista: mesmaAba && $('#tb-scan-lista') ? $('#tb-scan-lista').scrollTop : 0 };
        const abertos = new Set(mesmaAba ? $$('details[data-k]', c).filter(d => d.open).map(d => d.dataset.k) : []);
        if (ABA === 'estado') c.innerHTML = telaEstado();
        else if (ABA === 'autohunt') c.innerHTML = telaAutoHunt();
        else if (ABA === 'scan') c.innerHTML = telaScan();
        else if (ABA === 'magia') c.innerHTML = telaMagia();
        else if (ABA === 'analise') c.innerHTML = telaAnalise();
        else if (ABA === 'equip') c.innerHTML = telaEquip();
        else if (ABA === 'progresso') c.innerHTML = telaProgresso();
        else c.innerHTML = `<div id="tb-log"></div>`;

        if (ABA === 'log') pintarLog();
        $$('details[data-k]', c).forEach(d => { if (abertos.has(d.dataset.k)) d.open = true; });
        if (mesmaAba) { c.scrollTop = rol.corpo; const l = $('#tb-scan-lista'); if (l) l.scrollTop = rol.lista; }
        _abaPintada = ABA;
        if (ABA === 'equip') ligarEquip();
        if (ABA === 'progresso') ligarProgresso();
        const filtro = $('#tb-scan-filtro');
        if (filtro) {
            const aplicarFiltro = () => { const v = (_scanFiltro || '').toLowerCase(); $$('#tb-scan-lista label').forEach(l => { l.style.display = !v || (l.textContent || '').toLowerCase().includes(v) ? '' : 'none'; }); };
            filtro.value = _scanFiltro; aplicarFiltro();
            filtro.oninput = () => { _scanFiltro = filtro.value; aplicarFiltro(); };
        }

        const exp = $('#tb-exportar');
        if (exp) exp.onclick = () => {
            const dados = JSON.stringify({
                sessoes: sessoes(), resumo: resumoPorHunt(),
                ws: { frames: WS.frames, tipos: WS.tipos, binarios: WS.bin,
                      amostrasRecebidas: WS.amostras, ENVIADOS: WS.enviados }
            }, null, 2);
            const caixa = document.createElement('textarea');
            caixa.value = dados; caixa.style.cssText = 'width:100%;height:120px;margin-top:6px;background:#0d1016;color:#dde3ee;border:1px solid #2b3242;font:11px ui-monospace,monospace';
            exp.insertAdjacentElement('afterend', caixa); caixa.select();
            (navigator.clipboard ? navigator.clipboard.writeText(dados) : Promise.reject())
                .then(() => log('dados copiados pra área de transferência (e na caixa abaixo)', 'ok'))
                .catch(() => log('clipboard bloqueado — os dados estão na caixa abaixo do botão', 'erro'));
        };
        const lim = $('#tb-limpar-sessoes');
        if (lim) lim.onclick = () => {
            guardar('sessoes', []); log('histórico de sessões apagado', 'ok'); renderizar();
        };
        const rec = $('#tb-recat'); if (rec) rec.onclick = async () => { await carregarCatalogos(true); renderizar(); };
        // v2.2.0 — Scan
        const scOn = $('#tb-scan-on');
        if (scOn) scOn.onclick = () => { if (SCAN.ativo) scanParar('pelo botão'); else scanIniciar(); };
        $$('[data-scan-mapa]').forEach(cb => cb.onchange = () => {
            const id = parseInt(cb.dataset.scanMapa), c = scanCfg();
            const m = c.mapas.filter(x => x !== id); if (cb.checked) m.push(id);
            guardarScanCfg({ mapas: m }); renderizar();
        });
        const scMin = $('#tb-scan-min'); if (scMin) scMin.onchange = () => guardarScanCfg({ minutos: Math.max(1, Math.min(60, parseInt(scMin.value) || 5)) });
        const scLure = $('#tb-scan-lure'); if (scLure) scLure.onchange = () => guardarScanCfg({ lureMax: scLure.checked });
        $$('input[name="tb-scan-fim"]').forEach(r => r.onchange = () => guardarScanCfg({ fim: r.value }));
        $$('input[name="tb-scan-modelo"]').forEach(r => r.onchange = () => guardarScanCfg({ modelo: r.value }));
        const scCmp = $('#tb-scan-comparar'); if (scCmp) scCmp.onchange = () => { guardarScanCfg({ comparar: scCmp.checked }); renderizar(); };
        $$('[data-scan-var]').forEach(cb => cb.onchange = () => { const c = scanCfg(); const v = (c.variantes || []).filter(x => x !== cb.dataset.scanVar); if (cb.checked) v.push(cb.dataset.scanVar); guardarScanCfg({ variantes: v }); });
        const scLm = $('#tb-scan-limpar-mapas'); if (scLm) scLm.onclick = () => { guardarScanCfg({ mapas: [] }); renderizar(); };
        const scL = $('#tb-scan-limpar'); if (scL) scL.onclick = () => { guardar('scan_resultados', {}); renderizar(); };
        $$('[data-scan-ir]').forEach(b => b.onclick = () => scanIrPara(parseInt(b.dataset.scanIr)));
        // v1.9.0 — Status e Auto Hunt
        const vr = $('#tb-venda-rapida'); if (vr) vr.onclick = () => cicloDeVenda('venda');
        const bat = $('#tb-bt-atualizar'); if (bat) bat.onclick = abrirAtualizacao;
        const fh = $('#tb-finalizar'); if (fh) fh.onclick = () => cicloDeVenda('finalizar');
        const sw = $('#tb-ah-on');
        if (sw) sw.onclick = () => {
            const a = autoHunt();
            if (!a.on && a.huntId == null) { log('memorize a hunt antes de ligar a automação', 'erro'); return; }
            guardarAutoHunt({ on: !a.on });
            log('Auto Hunt ' + (!a.on ? 'LIGADO' : 'desligado'), !a.on ? 'ok' : 'info');
            renderizar();
        };
        const mem = $('#tb-ah-memorizar');
        if (mem) mem.onclick = async () => {
            mem.disabled = true;
            try {
                const hs = ESTADO_WS.huntId != null && !ESTADO_WS.boss ? (CAT.hunts || []).find(x => x.id === ESTADO_WS.huntId) : null;
                const r = hs ? { hunt: hs } : await confirmarHuntPeloExplore();
                if (r.erro) log('não consegui memorizar: ' + r.erro, 'erro');
                else { guardarAutoHunt({ huntId: r.hunt.id }); log('hunt memorizada: ' + r.hunt.title, 'ok'); }
            } catch (e) { log('memorizar estourou: ' + e.message, 'erro'); }
            renderizar();
        };
        const esq = $('#tb-ah-esquecer');
        if (esq) esq.onclick = () => { guardarAutoHunt({ huntId: null, on: false }); log('hunt esquecida; automação desligada', 'info'); renderizar(); };
        $$('input[name="tb-ah-modo"]').forEach(r => r.onchange = () => { guardarAutoHunt({ modo: r.value }); renderizar(); });
        const pct = $('#tb-ah-pct'); if (pct) pct.onchange = () => guardarAutoHunt({ pct: Math.max(1, Math.min(99, parseInt(pct.value) || 20)) });
        const oz = $('#tb-ah-oz'); if (oz) oz.onchange = () => guardarAutoHunt({ oz: Math.max(10, parseInt(oz.value) || 200) });
        const vol = $('#tb-ah-voltar'); if (vol) vol.onchange = () => guardarAutoHunt({ voltar: vol.checked });
        const apr = $('#tb-aprender');
        if (apr) apr.onclick = async () => {
            if (_aprendendo) return;
            _aprendendo = true; apr.disabled = true;
            try {
                const r = await aprenderDanosPorRest(false);
                if (r.erro) { log('sem /spell-numbers (' + r.erro + ') — medindo pelos diálogos', 'info'); await aprenderDanosTodos(); }
            } finally { _aprendendo = false; renderizar(); }
        };
        const cfh = $('#tb-confhunt');
        if (cfh) cfh.onclick = async () => {
            cfh.disabled = true;
            try {
                const r = await confirmarHuntPeloExplore();
                if (r.erro) log('não consegui confirmar a hunt: ' + r.erro, 'erro');
            } catch (e) { log('confirmar hunt estourou: ' + e.message, 'erro'); }
            cfh.disabled = false;
            renderizar();
        };
        /* v1.8.0 — F5 zera a marcação do Auto Selling (o ciclo de venda não).
         * Abre a janela de loot, aba Auto Selling, MARCAR TUDO, fecha. Só por
         * botão, nunca sozinho. */
        const ase = $('#tb-autosell');
        if (ase) ase.onclick = async () => {
            ase.disabled = true;
            try {
                const bl = $$('button').find(b => /^LOOT$/.test((b.textContent || '').trim()));
                if (!bl) throw new Error('botão LOOT não está na tela (fora de caçada?)');
                bl.click();
                const aba = await esperarQue(() => tid('loot-config-autosell'), 3000);
                if (!aba) throw new Error('janela de loot não abriu');
                aba.click(); await dorme(300);
                const tudo = await esperarQue(() => tid('auto-sell-all') || $$('[data-testid="window-loot"] button').find(b => /MARCAR TUDO/i.test(b.textContent || '')), 2000);
                if (!tudo) throw new Error('MARCAR TUDO não apareceu');
                tudo.click(); await dorme(400);
                const w = tid('window-loot');
                const m = w && (w.innerText || '').match(/MARCADOS PARA VENDA\s*(\d+)/);
                const fechar = tid('window-close-loot'); if (fechar) fechar.click();
                log('auto-sell: ' + (m ? m[1] : '?') + ' itens marcados para venda', 'ok');
            } catch (e) {
                const fechar = tid('window-close-loot'); if (fechar) fechar.click();
                log('auto-sell falhou: ' + e.message, 'erro');
            }
            ase.disabled = false;
        };
        $$('[data-modelo]').forEach(b => b.onclick = () => { guardar('modelo', b.dataset.modelo); renderizar(); });
        const selHunt = $('#tb-hunt');
        if (selHunt) {
            selHunt.onchange = () => {
                const v = selHunt.value;
                guardar('hunt_id', v === '' ? null : parseInt(v));
                renderizar();
            };
        }
        $$('[data-usar-palpite]').forEach(b => {
            b.onclick = () => {
                guardar('hunt_id', parseInt(b.dataset.usarPalpite));
                renderizar();
            };
        });
        const selBoss = $('#tb-boss');
        if (selBoss) selBoss.onchange = () => { guardar('boss_nome', selBoss.value || null); renderizar(); };
        const ap4 = $('#tb-aplicar-todos');
        if (ap4) ap4.onclick = () => {
            const h = alvoDoModelo();
            if (h) aplicarEmTodos(ler('modelo', 'equilibrado'), h);
            else log(ler('modelo', 'equilibrado') === 'boss' ? 'escolha o boss primeiro' : 'sem hunt confirmada', 'erro');
        };
    }

    /* =========================================================================
     *  BOOT
     * ====================================================================== */
    async function iniciar() {
        await escolherGaveta();
        LOG = ler('log', []);
        await esperarQue(() => tid('shell') || tid('action-bar') || document.body, 20000, 400);
        try { montarPainel(); } catch (e) { console.error('[TB] painel', e); }
        log(`Tibidle Helper v${VERSAO} iniciado` + (CONTA ? ` — conta ${CONTA.nome} (${CONTA.mundo})` : ' — sem sessão, gaveta comum'), 'ok');
        { const a = autoHunt(); if (a.on) log(`Auto Hunt LIGADO — hunt ${a.huntId} · limite ${a.modo === 'oz' ? a.oz + ' oz' : a.pct + '%'} livre`, 'ok'); }
        /* v1.9.8 — RETOMAR DEPOIS DE RECARGA. Em 27/09 a página recarregou
         * 4 s depois de o gatilho encerrar a caçada; a party ficou na cidade
         * com a chave ligada e ninguém terminou o ciclo. Se, ao subir, a chave
         * está ligada, há hunt memorizada e a party está na CIDADE, o ciclo é
         * retomado da cidade (purificar → vender → depot → voltar). Só com a
         * chave ligada pelo dono; nunca por conta própria. */
        /* v1.9.10 — o F5 cai no LOBBY ("SEU GRUPO" / ENTRAR NO JOGO), e 6 s
         * depois do boot a cidade ainda não existia: a retomada morria em
         * silêncio. Com a chave ligada o helper entra no jogo sozinho e espera
         * a cidade (ou a caçada) montar, até 60 s, antes de decidir. */
        (async () => {
            try {
                const a0 = autoHunt();
                if (!a0.on || a0.huntId == null) return;
                const lobby = await esperarQue(() => $$('button').find(b => /ENTRAR NO JOGO/i.test(b.textContent || '')), 8000, 400);
                if (lobby) { log('lobby: entrando no jogo (Auto Hunt ligado)', 'info'); lobby.click(); }
                const pronto = await esperarQue(() => emHunt() || tid('actionbar-hunt'), 60000, 500);
                if (!pronto) return;
                await dorme(1500);
                const a = autoHunt();
                if (!a.on || a.huntId == null || emHunt() || !tid('actionbar-hunt')) return;
                if (cicloTravadoPorOutraAba()) { log('party na cidade, mas outra aba está no ciclo — aguardando', 'info'); return; }
                log('Auto Hunt ligado e party na cidade: retomando o ciclo (purificar → vender → depot → voltar)', 'info');
                await cicloDeVenda('auto');
            } catch (e) { }
        })();

        /* a purga vem ANTES dos catalogos: ela apaga cat_* justamente para
         * forcar o rebaixamento na virada de era. */
        try { const n = limparChavesLegadas(); if (n) log(`${n} chaves de dano no formato antigo removidas`, 'info'); } catch (e) { }
        try {
            const pg = purgarSeEraVelha();
            if (pg) log(`era ${pg.de || '(nenhuma)'} -> ${pg.para}: ${pg.apagadas} chaves medidas apagadas. Dano e curva precisam ser remedidos.`, 'erro');
        } catch (e) { console.error('[TB] purga', e); }
        // os catálogos vêm SEMPRE, mesmo que o painel tenha falhado em desenhar
        const okCat = await carregarCatalogos(false);
        if (!okCat) log('sem catálogo não dá pra montar a lista de hunts — clica em "Rebaixar catálogos" na aba Estado', 'erro');

        /* a confirmacao da hunt pela tela de cacadas vive em amostrar(): ela
         * dispara quando a party ENTRA numa cacada, o que cobre o boot no
         * lobby e a troca de hunt de uma vez. */
        renderizar();
        // repinta Estado e Analisador sozinhos; as outras só quando o usuário mexe
        setInterval(() => { try { pintarTrilho(); } catch (e) { } if ((ABA === 'estado' || ABA === 'analise' || ABA === 'autohunt' || (ABA === 'scan' && SCAN.ativo)) && ui().aberta && $('#tb-gaveta') && !$('#tb-ah-pct:focus') && !$('#tb-ah-oz:focus') && !$('#tb-scan-min:focus') && !$('#tb-scan-filtro:focus')) renderizar(); }, 4000);

        /* o analisador roda SEMPRE, mesmo com a aba fechada — é o que garante
         * que nenhuma caçada passe sem virar dado. Fecha a sessão ao sair da
         * página pra não perder o que já foi medido. */
        setInterval(() => { try { amostrar(); } catch (e) { } }, AMOSTRA_MS);
        setTimeout(() => verificarAtualizacao().catch(() => { }), 15000);
        setInterval(() => verificarAtualizacao().catch(() => { }), 30 * 60 * 1000);
        window.addEventListener('beforeunload', () => { try { fecharSessao('página fechada'); } catch (e) { } });
    }

    /* GANCHO DE DEPURACAO — so leitura. Deixa simular o plano de fora
     * (console ou Playwright) ANTES de clicar em aplicar. Nasceu em 19/09:
     * sem isso a unica forma de ver o que "APLICAR NOS 4" faria era aplicar. */
    window.__tbHelper = {
        // v1.9.0 — Auto Hunt. Os cinco passos ESCREVEM no jogo; cicloDeVenda também.
        autoHunt, guardarAutoHunt, capLivre, lerTaxaXp, itemSelado, modalAberto, mochilaNoLimite, estadoWS,
        finalizarHunt, purificarTodos, venderNoNpc, guardarNoDepot, voltarParaHunt, cicloDeVenda, cliqueCompleto,
        versao: VERSAO, montarPlano, viabilidadeParty, huntAtual, magiasDaVocacao, danosConhecidos, ouroPorAbate, planoExtras, melhorMunicao, melhorPocao, bestiarioHunt, armaduraMedia, reducaoFisicaMedia, nomeModelo,
        get BESTIARIO() { return BESTIARIO; },
        get CAT() { return CAT; },
        // v2.4.0 — Equip (lerDepot ENVIA depot_get: leitura)
        lerShellFibra, lerRosterFibra, rosterEquip, lerDepot, basePorNome, idsPorNome,
        equipAtualizar, pontuarPeca, candidatosEquip, distribuirEquip, vocacaoPode, mochilaEquip,
        // v2.5.0 — ESCREVEM no servidor: depot_withdraw + equip
        equiparTrocas, retirarDoDepot, equiparPeca, ondeEsta, slotsTrocas,
        get EQUIP() { return EQUIP; }, get PESOS_EQUIP() { return PESOS_EQUIP; },
        // estes dois ESCREVEM no jogo — existem aqui so para teste de ida-e-volta
        aplicarSlot, esvaziarSlot, aprenderDanosTodos, lureNoMaximo,
        // v2.1.0 — socket/REST. aplicarPlanoSocket, enviarWS e lureNoMaximoSocket ESCREVEM no servidor.
        socketAberto, enviarWS, configAtiva, perfilDaVoc, normalizarConfig, payloadBattleConfig,
        aplicarPlanoSocket, aprenderDanosPorRest, lureNoMaximoSocket,
        // v2.2.0 — Scan (scanIniciar/scanIrPara ESCREVEM: trocam de mapa e aplicam plano)
        scanCfg, guardarScanCfg, scanResultados, scanVereditos, scanIniciar, scanParar, scanIrPara, scanMedidaViva,
        scanDividirLoot, lootTabela, xpFaltando, fmtHoras,
        // v2.6.4 — livro-razão de combate (só leitura dos eventos do frame)
        razaoResumo, razaoHtml, razaoTexto, manaMedidaMedia, spawnLimitaMedido, get RAZAO() { return RAZAO; },
        get SCAN() { return SCAN; },
        get WS() { return WS; },
        get aprendendo() { return _aprendendo; },
        verificarAtualizacao, get NOVA_VERSAO() { return NOVA_VERSAO; }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();

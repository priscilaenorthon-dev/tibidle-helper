// ==UserScript==
// @name         Tibidle Helper (Northon)
// @namespace    northon.tibidle
// @version      2.14.17
// @description  Magia (Econômica / Equilibrado / Área / Inteligente / Boss, com simulador da fila e da party) + Equip (melhor peça por vocação) + Auto Hunt (mochila cheia → vender sem tocar em equipamento, depot, voltar) + Scan de mapas + Progresso (chaves, bestiário, prey, plano offline, forja) + Mercado (anunciar do baú: menor anúncio − 1 ou média de 30 dias, nunca abaixo do NPC) + Radar (ranking de mapas, loot ao vivo, alertas de preço, relatório do dia) + Diagnóstico. Tudo que envia comando ao jogo só roda por botão, exceto Auto Hunt e Scan quando ligados.
// @author       Northon
// @homepageURL  https://github.com/priscilaenorthon-dev/tibidle-helper
// @updateURL    https://raw.githubusercontent.com/priscilaenorthon-dev/tibidle-helper/main/tibidle-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/priscilaenorthon-dev/tibidle-helper/main/tibidle-helper.user.js
// @match        https://play.tibidle.com/*
// @match        *://*.play.tibidle.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

/* ⚠ ESTILO, não defeito, e de propósito: "if (x) return;" numa linha (guardas
 * de entrada) e "catch (e) { }" em leitura de DOM que pode não existir ainda.
 * v2.11.8 — o editor do Tampermonkey roda um ESLint próprio e marcava 143
 * linhas com "!" (comentário alinhado com vários espaços, if/for de várias
 * linhas sem chaves, forEach(x => x.onclick = …)). Corrigido no código, e o
 * eslint.config.mjs do projeto passou a exigir as mesmas regras. v2.11 — a diretiva eslint-disable que ficava
 * aqui saiu: o ESLint do projeto (config do plano 2.11) não liga essas regras
 * e apontava a diretiva como inútil. Falha que IMPORTA não é mais engolida em
 * silêncio: vai para falhou() (ver ERROS, perto de log()). */

(function () {
    'use strict';

    const VERSAO = '2.14.17';

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
    /* v2.11 — SEGREDOS FORA DO DIAGNÓSTICO. `amostras` e `enviados` saem no
     * "copiar JSON" do Analisador, e esse JSON é colado em conversa. O `auth`
     * enviado leva o `ticket` e o `welcome` leva o `worldToken` (o Bearer das
     * rotas REST): quem tivesse o JSON entrava na conta (CONFIRMADO na
     * auditoria de 29/09). Toda chave terminada em token/ticket/password vira
     * '***' ANTES de ser guardada — o que não fica guardado não vaza. */
    const CHAVE_SEGREDO = /(token|ticket|password|senha)$/i;
    const semSegredos = (o) => JSON.stringify(o, (k, v) => (typeof v === 'string' && CHAVE_SEGREDO.test(k)) ? '***' : v);
    /* v2.11 — O GRAMPO NUNCA LANÇA PARA O JOGO. Ele roda dentro do send() e do
     * construtor do WebSocket do próprio jogo: uma exceção nossa ali derruba a
     * conexão do jogador. Tudo que é nosso fica em try e vai para falhou(); o
     * que é do navegador (URL inválida, send com o socket fechando) continua
     * saindo igual ao original, porque o jogo espera exatamente isso.
     * Três correções da auditoria:
     *   • construtor com Reflect.construct(…, new.target): `class X extends
     *     WebSocket` (padrão de libs de reconexão) perdia a subclasse;
     *   • WS.socket é o socket que recebeu welcome/resume — não "o último
     *     criado" (um segundo socket qualquer roubava o envio do helper);
     *   • estáticos (OPEN, CLOSED…) herdados do original, não copiados. */
    (function grampearWS() {
        try {
            const receber = (ws, ev) => {
                WS.frames++;
                const dado = ev && ev.data;
                if (typeof dado !== 'string') {
                    try {
                        const b = new Uint8Array(dado.slice ? dado.slice(0, 4) : dado);
                        const k = [...b].map(x => x.toString(16).padStart(2, '0')).join(' ');
                        WS.bin[k] = (WS.bin[k] || 0) + 1;
                    } catch (e) { }
                    return;
                }
                let o; try { o = JSON.parse(dado); } catch (e) { return; }
                if (!o || typeof o !== 'object') return;
                const t = typeof o.type === 'string' ? o.type : '?';
                if (t === 'pong') return;
                if (t === 'welcome' || t === 'resume') WS.socket = ws; // o socket do JOGO é este
                WS.tipos[t] = (WS.tipos[t] || 0) + 1;
                if (!WS.amostras[t]) WS.amostras[t] = semSegredos(o).slice(0, 400);
                try { observarRecebido(o); } catch (e) { falhou('observarRecebido', e); }
            };
            const ouvir = (ws) => {
                try {
                    if (!ws || ws.__tbOuvindo) return;
                    ws.__tbOuvindo = true;
                    ws.addEventListener('message', ev => { try { receber(ws, ev); } catch (e) { falhou('grampo (recebido)', e); } });
                } catch (e) { falhou('grampo (ouvir)', e); }
            };
            const espiarEnvio = (ws, d) => {
                ouvir(ws);
                if (typeof d !== 'string' || d.length >= 20000) return;
                let o; try { o = JSON.parse(d); } catch (e) { return; }
                if (!o || typeof o !== 'object') return;
                const t = typeof o.type === 'string' ? o.type : '?';
                if (t === 'ping') return;
                /* helper instalado com o jogo já aberto: o welcome já passou.
                 * O socket que fala o protocolo do jogo vale de reserva só
                 * enquanto não houver um vivo — o próximo welcome manda. */
                if (t !== '?' && (!WS.socket || WS.socket.readyState > 1)) WS.socket = ws;
                if (!WS.enviados[t]) WS.enviados[t] = { n: 0, ultimo: null };
                WS.enviados[t].n++;
                // o payload inteiro (menos os segredos): é ele que vira o molde do envio
                const s = semSegredos(o);
                WS.enviados[t].ultimo = s.length < 8000 ? s : s.slice(0, 8000);
                try { observarEnviado(o); } catch (e) { falhou('observarEnviado', e); }
            };
            // pega dos DOIS lados: construtor (sockets novos) e send (o vivo)
            const OrigSend = WebSocket.prototype.send;
            WebSocket.prototype.send = function (d) {
                try { espiarEnvio(this, d); } catch (e) { falhou('grampo (enviado)', e); }
                return OrigSend.apply(this, arguments);
            };
            const OrigWS = window.WebSocket;
            const Embrulhado = function (...a) {
                const ws = Reflect.construct(OrigWS, a, new.target || Embrulhado);
                ouvir(ws); // ouvir() tem try próprio
                return ws;
            };
            Embrulhado.prototype = OrigWS.prototype;
            try { Object.setPrototypeOf(Embrulhado, OrigWS); } catch (e) { Object.assign(Embrulhado, OrigWS); }
            window.WebSocket = Embrulhado;
        } catch (e) { try { console.warn('[TB] grampo do WS falhou', e); } catch (e2) { } }
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
        return true; // sem leitura, assume o caso caro
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
    /* v2.11 — SEM /auth/me, A CONTA DO WELCOME. Com /auth/me fora do ar (rede,
     * 5xx) a segunda conta caía na gaveta comum — que é a do DONO — e herdava
     * a hunt, o dano e o log dele. O `welcome` do socket traz `account.name`
     * (schema do cliente: name, level, mainVocation…; sem id). Cada /auth/me
     * que dá certo anota nome → id em tb_helper_contas; quando ele falha, o
     * nome do welcome acha a gaveta certa. Nome nunca visto com outra conta
     * já anotada = conta nova: gaveta própria pelo nome. */
    let _gavetaSemConta = false;
    async function escolherGaveta() {
        try {
            const me = await buscarJSON('/auth/me');
            const id = me && (me.accountId || me.id);
            if (!id) { _gavetaSemConta = true; if (ESTADO_WS.conta) gavetaPeloWelcome(ESTADO_WS.conta); return; }
            CONTA = { id, nome: me.name || '?', mundo: me.worldId || '?' };
            let dono = null;
            try { dono = JSON.parse(localStorage.getItem('tb_helper_dono') || 'null'); } catch (e) { }
            if (!dono) { try { localStorage.setItem('tb_helper_dono', JSON.stringify(id)); } catch (e) { } dono = id; }
            LS = dono === id ? 'tb_helper_' : 'tb_helper_' + id + '_';
            if (me.name) { const nomes = lerChave('tb_helper_contas', {}) || {}; if (nomes[me.name] !== id) { nomes[me.name] = id; gravar('tb_helper_contas', nomes); } }
        } catch (e) { /* deslogado ou sem rede: gaveta comum até o welcome dizer a conta */
            _gavetaSemConta = true;
            if (ESTADO_WS.conta) gavetaPeloWelcome(ESTADO_WS.conta);
        }
    }
    function gavetaPeloWelcome(conta) {
        if (CONTA || !conta || !conta.nome) return;
        const nomes = lerChave('tb_helper_contas', {}) || {};
        if (!Object.keys(nomes).length) return; // nada anotado ainda: não dá para distinguir o dono
        const dono = lerChave('tb_helper_dono', null), id = nomes[conta.nome] || null;
        const prefixo = id ? (id === dono ? 'tb_helper_' : 'tb_helper_' + id + '_')
            : 'tb_helper_n' + String(conta.nome).normalize('NFD').replace(/[^A-Za-z0-9]/g, '').slice(0, 24) + '_';
        CONTA = { id, nome: conta.nome, mundo: '?', peloWelcome: true };
        if (prefixo !== LS) trocarGaveta(prefixo, 'conta ' + conta.nome + ' (pelo welcome — /auth/me falhou)');
    }
    /* troca de gaveta com o helper já de pé: memória que veio da gaveta velha cai */
    function trocarGaveta(prefixo, porque) {
        LS = prefixo; MEMO.clear();
        try { migrarModelos(); } catch (e) { falhou('migrar modelos', e); }
        try { purgarSeEraVelha(); } catch (e) { falhou('purga da era', e); }
        LOG = ler('log', []);
        log('gaveta: ' + porque, 'info');
        renderizar();
    }

    /* v2.11.13 — modelo que saiu do menu vira Em área. v2.12.0 — o
     * Inteligente voltou: ele e as variantes antigas dele (inteligente_mana,
     * _semruna, _seco) viram 'inteligente'; só o que não existe vira Em área. */
    function migrarModelos() {
        const conv = m => m == null || MODELOS[m] ? m : /^inteligente/.test(String(m)) ? 'inteligente' : 'area';
        let mudou = false;
        const mo = ler('modelo', null);
        if (conv(mo) !== mo) { guardar('modelo', conv(mo)); mudou = true; }
        const sc = ler('scan_cfg', null);
        if (sc && (conv(sc.modelo) !== sc.modelo || (sc.variantes || []).some(m => conv(m) !== m))) {
            guardar('scan_cfg', Object.assign({}, sc, { modelo: conv(sc.modelo), variantes: [...new Set((sc.variantes || []).map(conv))] }));
            mudou = true;
        }
        const bc = ler('best_cfg', null);
        if (bc && conv(bc.modelo) !== bc.modelo) { guardar('best_cfg', Object.assign({}, bc, { modelo: conv(bc.modelo) })); mudou = true; }
        if (mudou) log('modelo guardado que não existe mais convertido (variante do Inteligente → Inteligente; o resto → Em área)', 'info');
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

        /* medido = morre. escolhido = fica.
         * v2.11 — `cat_` aqui é a cópia ANTIGA por gaveta (até a 2.10). Os
         * catálogos agora moram numa chave comum a todas as contas
         * (LS_COMUM, ver carregarCatalogos) com o PRÓPRIO selo de era: quem
         * vira a era apaga a cópia comum só se ela ainda for da era velha —
         * a segunda conta a subir não derruba o que a primeira já baixou. */
        const morre = new RegExp('^' + LS + '(danos_|loot_|sessoes$|cat_|hunt_id$|hunt_manual$|regime$|skills_vistas$)');
        const mortos = Object.keys(localStorage).filter(k => morre.test(k));
        if (lerChave(LS_COMUM + 'cat_era', null) !== ERA) mortos.push(...Object.keys(localStorage).filter(k => k.startsWith(LS_COMUM + 'cat_') || k.startsWith(LS_COMUM + 'loot_tab_'))); // v2.13.2: a tabela de loot do Radar também morre na virada de era
        mortos.forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
        MEMO.clear();

        try { localStorage.setItem(LS + 'era', JSON.stringify(ERA)); } catch (e) { }
        return { de: anterior, para: ERA, apagadas: mortos.length };
    }

    /* Formato antigo (ate 1.6): danos_<VOC>_<nivel>. A 1.7 guarda por vocacao
     * com o nivel dentro. As chaves velhas nao fazem mal, mas ocupam espaco e
     * confundem quem le o localStorage — somem no primeiro boot.
     * v2.11 — idem `equip_ids` (221 KB por gaveta: a lista nome → id de TODOS
     * os itens do jogo). Agora vive só em memória; o JSON é rebaixado 1× por
     * sessão, quando o Equip precisa. */
    function limparChavesLegadas() {
        const velhas = Object.keys(localStorage).filter(k => new RegExp('^' + LS + 'danos_[A-Z]+_\\d+$').test(k)
            || (k.startsWith('tb_helper_') && /(^|_)equip_ids$/.test(k)));
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
        inteligente: {
            nome: 'Inteligente',
            dica: 'Busca a party inteira no simulador (os 4 juntos contra a onda): quantas magias (1 a 4), a ordem, o mínimo de criaturas, poção e suporte de cada um saem da conta, não de regra fixa. Mesma régua de dano dentro e fora do kit (a medição corrige a forma inteira). Fica com o de mais XP entre os que se pagam (±3 %), e entre esses o de mais lucro. Só troca o kit aplicado se o novo for 3–5 % melhor, nunca nos 10 min depois de um APLICAR. Calcula só no clique.'
        },
        boss: {
            nome: 'Boss',
            dica: 'Escolha o boss: as magias e runas que mais dão dano por segundo nele com a mana que cada um tem (uma por grupo de recarga), todas com gatilho ≥1.'
        }
    };
    /* v2.12.0 — O INTELIGENTE VOLTA (v3). Saiu na 2.11.13 porque perdia do Em
     * área (Vampire hell 52,0k contra 55,4k xp/h; Banshee 44,9k/−10,2k contra
     * 46,9k/+7,8k) e trocava de kit a cada APLICAR — réguas diferentes dentro e
     * fora do kit. A v3 (buscarParty, no @@MAGIA) mede todos pela mesma régua e
     * busca a party inteira. As VARIANTES antigas (_mana, _semruna, _seco)
     * saíram: poção e suporte agora são decisão da busca (migrarModelos as
     * converte em 'inteligente'). */
    const nomeModelo = (m) => (MODELOS[m] || { nome: m }).nome;
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

    /* @@ARMAZEM-INICIO — guardar/ler, ERROS/falhou e log; testes/fumaca.test.js roda este trecho sozinho. */
    /* v2.11 — guardar() DEVOLVE true/false. O localStorage tem ~5 MB por
     * ORIGEM (todas as contas do navegador juntas) e, cheio, setItem lança
     * QuotaExceededError — que o catch vazio engolia: o helper seguia "salvando"
     * dano, sessão e Scan que nunca chegavam ao disco. Agora: false para quem
     * chamou, e UM aviso no Log ("sem espaço") por sessão, não um por chamada.
     *
     * MEMÓRIA: `scan_resultados` e `sessoes` são lidos várias vezes por
     * repintura (scanResultados() era JSON.parse de ~200 KB a cada chamada).
     * Essas chaves são lidas do disco 1× e servidas da memória; guardar()
     * atualiza a memória junto, e o evento `storage` (outra aba escreveu)
     * derruba a cópia. `scan_resultados` fica com os 60 mais recentes. */
    let _semEspacoAvisado = false;
    const MEMO = new Map();
    const EM_MEMORIA = new Set(['scan_resultados', 'sessoes']);
    const SCAN_RESULTADOS_MAX = 60;
    const PODAR = {
        scan_resultados: (v) => {
            if (!v || typeof v !== 'object') return v;
            const e = Object.entries(v);
            if (e.length <= SCAN_RESULTADOS_MAX) return v;
            return Object.fromEntries(e.sort((a, b) => ((b[1] && b[1].t) || 0) - ((a[1] && a[1].t) || 0)).slice(0, SCAN_RESULTADOS_MAX));
        },
        /* v2.13.0 — relatório do Radar: só os 30 dias mais novos (chaves AAAA-MM-DD) */
        radar_dias: (v) => {
            if (!v || typeof v !== 'object') return v;
            const k = Object.keys(v).filter(x => /^\d{4}-\d\d-\d\d$/.test(x)).sort();
            return Object.fromEntries(k.slice(-30).map(x => [x, v[x]]));
        }
    };
    const cheioDeVerdade = (e) => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
    function gravar(chave, v) {
        try { localStorage.setItem(chave, JSON.stringify(v)); return true; }
        catch (e) {
            if (!cheioDeVerdade(e)) { falhou('guardar ' + chave.replace(/^tb_helper_/, ''), e); return false; }
            if (!_semEspacoAvisado) {
                _semEspacoAvisado = true;
                log('localStorage sem espaço — o que o helper mediu NÃO está sendo salvo (' + chave.replace(/^tb_helper_/, '') + '). Limpe o histórico do Analisador e os resultados do Scan.', 'erro');
            }
            return false;
        }
    }
    function lerChave(chave, padrao) {
        try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; }
        catch (e) { return padrao; }
    }
    const guardar = (k, v) => {
        if (PODAR[k]) { try { v = PODAR[k](v); } catch (e) { } }
        const ok = gravar(LS + k, v);
        if (EM_MEMORIA.has(k)) { if (ok) MEMO.set(LS + k, v); else MEMO.delete(LS + k); }
        return ok;
    };
    const ler = (k, padrao) => {
        const chave = LS + k;
        if (EM_MEMORIA.has(k) && MEMO.has(chave)) return MEMO.get(chave);
        try {
            const s = localStorage.getItem(chave);
            if (!s) return padrao;
            const v = JSON.parse(s);
            if (EM_MEMORIA.has(k)) MEMO.set(chave, v);
            return v;
        } catch (e) { return padrao; }
    };
    try { window.addEventListener('storage', ev => { if (ev && ev.key) MEMO.delete(ev.key); else MEMO.clear(); }); } catch (e) { }
    /* v2.11 — gaveta COMUM a todas as contas: o que é do JOGO, não da conta
     * (catálogos). Cinco contas no navegador guardavam cinco cópias. */
    const LS_COMUM = 'tb_helper_comum_';
    const guardarComum = (k, v) => gravar(LS_COMUM + k, v);
    const lerComum = (k, padrao) => lerChave(LS_COMUM + k, padrao);

    /* =========================================================================
     *  ⭐ v2.11 — ERROS À VISTA (auditoria de 29/09: "catch (e) { }" em volta
     *  do grampo, do amostrador e do gatilho do Auto Hunt escondia defeito
     *  real por dias). Toda falha que importa passa por falhou(onde, e):
     *    • conta por LUGAR (ERROS.porLugar[onde] = {n, seguidas, t, msg});
     *    • vai para o Log no máximo 1× por minuto por lugar (um erro a cada
     *      frame viraria 3.600 linhas por hora);
     *    • deuCerto(onde) zera as "seguidas" — o gatilho do Auto Hunt com 5
     *      falhas SEGUIDAS desliga a automação (nunca ficar num laço quebrado).
     *  ERROS.naoLidos — PARA A ÁREA DE UI: quantos log(…, 'erro') desde que o
     *  Log foi aberto pela última vez. A UI desenha o ponto/contador no trilho
     *  e ZERA ao abrir a aba Log (ERROS.naoLidos = 0).
     * ====================================================================== */
    const ERROS = { naoLidos: 0, total: 0, porLugar: {} };
    const FALHA_LOG_MS = 60000, FALHAS_SEGUIDAS_AUTO_HUNT = 5;
    function falhou(onde, e) {
        try {
            const agora = Date.now(), msg = (e && e.message) || String(e);
            const x = ERROS.porLugar[onde] || (ERROS.porLugar[onde] = { n: 0, seguidas: 0, t: 0, logado: 0, msg: '' });
            x.n++; x.seguidas++; x.t = agora; x.msg = msg; ERROS.total++;
            try { console.warn('[TB] falhou em ' + onde, e); } catch (e2) { }
            if (agora - x.logado >= FALHA_LOG_MS) { x.logado = agora; log(`falha em ${onde}: ${msg}` + (x.n > 1 ? ` (${x.n}ª vez)` : ''), 'erro'); }
            if (onde === 'gatilhoAutoHunt' && x.seguidas >= FALHAS_SEGUIDAS_AUTO_HUNT && autoHunt().on) {
                guardarAutoHunt({ on: false });
                log(`Auto Hunt DESLIGADO: ${x.seguidas} falhas seguidas no gatilho (${msg})`, 'erro');
                renderizar();
            }
        } catch (e3) { }
        return null;
    }
    function deuCerto(onde) { const x = ERROS.porLugar[onde]; if (x) x.seguidas = 0; }

    let LOG = [];
    function log(msg, tipo) {
        const linha = { t: Date.now(), msg: String(msg), tipo: tipo || 'info' };
        LOG.push(linha);
        while (LOG.length > 300) LOG.shift();
        if (linha.tipo === 'erro') ERROS.naoLidos++;
        guardar('log', LOG);
        try { pintarLog(); } catch (e) { try { console.error('[TB] pintarLog', e); } catch (e2) { } }
        try { console.log('[TB]', linha.msg); } catch (e) { }
    }
    /* @@ARMAZEM-FIM */
    /* v2.10 — FAIXA DE RETORNO (auditoria de UI, 29/09): "Venda rápida" fora
     * da cidade não mostrava nada na aba — o erro ia só para o Log, com um
     * ponto vermelho que sumia na linha seguinte. avisar() grava no Log (via
     * log) E mostra a mensagem por 10 s numa faixa logo abaixo do cabeçalho da
     * gaveta, só na aba que pediu. Use no lugar de log() para o RESULTADO de
     * uma ação da tela — não chame os dois (sairia duplicado no Log).
     * aba = chave de ICONES ('estado', 'magia', 'scan'…); tipo = 'ok' | 'erro' | 'info'. */
    const AVISOS = {};
    function avisar(aba, msg, tipo) {
        AVISOS[aba] = { t: Date.now(), msg: String(msg), tipo: tipo || 'info' };
        log(msg, tipo);
    }

    /* =========================================================================
     *  CATÁLOGOS — busca no próprio jogo e guarda em localStorage
     *
     *  O jogo serve isso em REST público; é o mesmo que o cliente já baixa.
     *  Guardamos com validade de 24h pra não repetir requisição à toa.
     * ====================================================================== */
    const CAT = { hunts: null, magias: null, areas: null, precos: null, pocoes: null };

    /* v2.11 — PRAZO DE 10 s. fetch sem prazo pendura para sempre com a rede
     * meio morta: o boot esperava /auth/me sem fim e o painel nem montava. */
    const PRAZO_REDE_MS = 10000;
    function comPrazo(fazer, ms) {
        const AC = window.AbortController, ctl = typeof AC === 'function' ? new AC() : null;
        let timer = null;
        const prazo = new Promise((_, rej) => { timer = setTimeout(() => { try { if (ctl) ctl.abort(); } catch (e) { } rej(new Error('sem resposta em ' + Math.round(ms / 1000) + ' s')); }, ms); });
        return Promise.race([Promise.resolve().then(() => fazer(ctl ? ctl.signal : undefined)), prazo]).finally(() => clearTimeout(timer));
    }
    async function buscarJSON(caminho) {
        return comPrazo(async (signal) => {
            const r = await fetch(API + caminho, signal ? { credentials: 'include', signal } : { credentials: 'include' });
            if (!r.ok) throw new Error(caminho + ' → HTTP ' + r.status);
            return r.json();
        }, PRAZO_REDE_MS);
    }

    /* v2.11 — catálogos na gaveta COMUM (LS_COMUM), com selo de era próprio,
     * e rede fora ≠ catálogo nulo: se o download falha, a cópia local vale
     * mesmo vencida (CAT null = lista de hunts vazia e nenhum plano). */
    /* v2.13.7 — VERSÃO DOS ASSETS MUDA A CADA PATCH (update 1.1.0, 04/10: v167 → v170, e o
     * /assets/v167/imbuements.json e o items-by-name.json passaram a dar 404 — sem eles o "nunca vender"
     * do Auto Hunt não monta e o Equip não acha os ids). Candidatas, nesta ordem: a que a página do jogo
     * está usando (recursos já carregados), a dos catálogos (cena dos bosses/atlas das hunts), a última
     * que funcionou e a conhecida. A primeira que responde fica guardada. */
    /* v2.14.8 — 04/10: o jogo já estava em v185 (v167 → v170 → v185 em dias) e as versões velhas continuam no ar
     * por um tempo (v170 ainda servia items-by-name e spell-areas, mas imbuements já dava 404). Então: (1) só uma
     * versão MAIS NOVA que a guardada conta como patch — uma velha que respondeu não rebaixa nada; (2) os bosses
     * são baixados antes do spell-areas, porque a cena deles é a única pista de versão que o catálogo dá. */
    const ASSETS_CONHECIDA = 'v185', ASSETS_ANTIGA = 'v170'; // antiga = último recurso: um arquivo que sumiu da versão nova pode seguir na velha
    const numAssets = v => Number(String(v || '').replace(/\D/g, '')) || 0;
    function versoesAssets() {
        const vs = [];
        const pega = (txt) => { const m = String(txt || '').match(/\/assets\/(v\d+)\//); if (m) vs.push(m[1]); };
        try { for (const e of performance.getEntriesByType('resource')) pega(e.name); } catch { }
        try { for (const b of (CAT.bosses || [])) pega(b && b.scene); for (const h of (CAT.hunts || [])) pega(h && h.atlas && h.atlas.image); } catch { }
        const ord = [...new Set(vs)].sort((a, b) => Number(b.slice(1)) - Number(a.slice(1))); // a mais nova primeiro
        return [...new Set(ord.concat([lerComum('assets_ver', null), ASSETS_CONHECIDA, lerComum('assets_ver_antes', null), ASSETS_ANTIGA]).filter(Boolean))];
    }
    /* patch novo do jogo: o que foi guardado da versão velha pode ter mudado (1.1.0: hunts novas, Energy Ring fora
     * da Thunderscar Peak, equipamentos que vinham como "Tools") — os catálogos são baixados de novo no próximo
     * boot, a ficha dos itens (equip_base) e as tabelas de loot do Radar recomeçam. Nada é enviado ao jogo. */
    function novaVersaoDoJogo(antes, agora) {
        try {
            guardarComum('cat_ts', 0);
            guardar('equip_base', {});
            for (const k of Object.keys(localStorage)) if (k.startsWith(LS_COMUM + 'loot_tab_')) localStorage.removeItem(k);
            log(`jogo atualizado (assets ${antes} → ${agora}): catálogos, ficha dos itens e tabelas de loot serão relidos`, 'info');
        } catch (e) { falhou('nova versão do jogo', e); }
    }
    async function buscarAsset(arquivo) {
        let ultimo = null;
        for (const v of versoesAssets()) {
            try {
                const j = await buscarJSON('/assets/' + v + '/' + arquivo);
                const antes = lerComum('assets_ver', null);
                if (!antes || numAssets(v) > numAssets(antes)) { guardarComum('assets_ver', v); if (antes) { guardarComum('assets_ver_antes', antes); novaVersaoDoJogo(antes, v); } }
                return j;
            } catch (e) { ultimo = e; }
        }
        throw ultimo || new Error('/assets/…/' + arquivo + ' não encontrado');
    }
    const CAT_ARQ = { hunts: '/hunts/select', magias: '/spells', areas: 'spell-areas.json', precos: '/buy-prices', bosses: '/bosses/select', pocoes: '/potions' };
    function catalogosDoCache() {
        if (lerComum('cat_era', null) !== ERA) return false;
        const c = {};
        for (const k of Object.keys(CAT_ARQ)) c[k] = lerComum('cat_' + k, null);
        if (!c.hunts || !c.magias) return false;
        Object.assign(CAT, c, { bosses: normalizarBosses(c.bosses) });
        return true;
    }
    /* cópias por gaveta (até a 2.10) saem depois que a comum existe */
    function limparCatalogosPorGaveta() {
        Object.keys(localStorage).filter(k => k.startsWith('tb_helper_') && !k.startsWith(LS_COMUM) && /(^|_)cat_(hunts|magias|areas|precos|bosses|pocoes|ts)$/.test(k))
            .forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
    }
    async function carregarCatalogos(forcar) {
        const idade = Date.now() - (lerComum('cat_ts', 0) || 0);
        if (!forcar && idade < 24 * 3600 * 1000 && catalogosDoCache()) {
            if (!CAT.bosses) buscarJSON('/bosses/select').then(b => { CAT.bosses = normalizarBosses(b); guardarComum('cat_bosses', CAT.bosses); renderizar(); }).catch(() => { });
            if (!CAT.pocoes) buscarJSON('/potions').then(p => { CAT.pocoes = p; guardarComum('cat_pocoes', p); }).catch(() => { });
            log('catálogos do cache local', 'ok');
            limparCatalogosPorGaveta();
            return true;
        }
        try {
            log('baixando catálogos do jogo…');
            /* v2.14.8 — bosses ANTES do spell-areas: no boot a página ainda não carregou recurso nenhum e as hunts
             * não têm atlas; a cena dos bosses (/assets/vN/…) é o que diz a versão certa para buscarAsset */
            const bosses = await buscarJSON(CAT_ARQ.bosses).catch(() => null);
            if (bosses) CAT.bosses = normalizarBosses(bosses);
            const [hunts, magias, areas, precos, pocoes] = await Promise.all([
                buscarJSON(CAT_ARQ.hunts),
                buscarJSON(CAT_ARQ.magias),
                buscarAsset(CAT_ARQ.areas).catch(() => null),
                buscarJSON(CAT_ARQ.precos).catch(() => null),
                buscarJSON(CAT_ARQ.pocoes).catch(() => null)
            ]);
            if (!Array.isArray(hunts) || !Array.isArray(magias)) throw new Error('catálogo de hunts/magias veio num formato inesperado');
            CAT.hunts = hunts; CAT.magias = magias; CAT.areas = areas; CAT.precos = precos; CAT.bosses = normalizarBosses(bosses); CAT.pocoes = pocoes;
            const salvo = [guardarComum('cat_hunts', hunts), guardarComum('cat_magias', magias),
                guardarComum('cat_areas', areas), guardarComum('cat_precos', precos), guardarComum('cat_bosses', bosses), guardarComum('cat_pocoes', pocoes)].every(Boolean);
            if (salvo) { guardarComum('cat_ts', Date.now()); guardarComum('cat_era', ERA); limparCatalogosPorGaveta(); }
            log(`catálogos ok — ${hunts.length} hunts, ${magias.length} magias` + (salvo ? '' : ' (não couberam no localStorage: valem só nesta sessão)'), salvo ? 'ok' : 'erro');
            return true;
        } catch (e) {
            if ((CAT.hunts && CAT.magias) || catalogosDoCache()) {
                const ts = lerComum('cat_ts', 0);
                log('falha ao baixar catálogos (' + e.message + ') — usando a cópia local' + (ts ? ' de ' + new Date(ts).toLocaleString('pt-BR') : ''), 'erro');
                return true;
            }
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
        try { const t = await buscarJSON('/hunt/lootTable?huntId=' + huntId); LOOT_TABELA[huntId] = Array.isArray(t) ? t : []; radarGuardarTab(huntId, LOOT_TABELA[huntId]); return LOOT_TABELA[huntId]; }
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
            radarGuardarTab(huntId, LOOT_TABELA[huntId]);
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
        return ler('nivel_manual', 1); // sem leitura, assume o piso: nunca libera magia por engano
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
    /* v2.10 — VETO PONDERADO NA ÁREA (plano 2.11, item 6). O veto estrito
     * ("qualquer monstro imune") é certo para ALVO ÚNICO: o golpe cai num
     * bicho só, e se for o imune sai zero. Mas a magia de ÁREA acerta todos
     * juntos — os imunes tomam 0 e os outros tomam cheio, e a média ponderada
     * já diz isso. Com o veto estrito, um monstro imune em quatro tirava a
     * onda do elemento certo do mapa inteiro. Área só é vetada se os imunes
     * pesam ≥ 50 % da hunt; nota e veto estritos continuam em `notas`/`vetos`
     * (alvo único, munição), os de área em `notasArea`/`vetosArea`. */
    function notasElementos(hunt) {
        if (!hunt || !hunt.monsters || !hunt.monsters.length) return null;
        const soma = {}, peso = {}, pior = {}, pesoImune = {};
        hunt.monsters.forEach(m => {
            const w = Math.max(1, m.weight || 1);
            const el = {};
            (m.elements || []).forEach(x => { el[x.type] = x.percent; });
            ELEMENTOS.forEach(e => {
                const tomado = 100 - (el[e] || 0); // sem entrada = neutro = toma 100%
                soma[e] = (soma[e] || 0) + tomado * w;
                peso[e] = (peso[e] || 0) + w;
                if (pior[e] == null || tomado < pior[e]) pior[e] = tomado;
                if (tomado <= 25) pesoImune[e] = (pesoImune[e] || 0) + w;
            });
        });
        const notas = {}, vetos = {}, notasArea = {}, vetosArea = {};
        ELEMENTOS.forEach(e => {
            if (!peso[e]) return;
            notas[e] = notasArea[e] = Math.round(soma[e] / peso[e]);
            if (pior[e] <= 25) { vetos[e] = pior[e]; notas[e] = Math.min(notas[e], 30); }
            if ((pesoImune[e] || 0) / peso[e] >= 0.5) { vetosArea[e] = pior[e]; notasArea[e] = Math.min(notasArea[e], 30); }
        });
        return { notas, vetos, notasArea, vetosArea };
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
    /* v2.10 — SEMENTE DA RUNA 3×3 MEDIDA (plano 2.11, item 9). A de 36–60 veio
     * de uma conta no painel do grupo (22/09, nível 39). /spell-numbers no
     * nível 61/62 deu 27–49 para as quatro runas 3×3 (avalanche, great
     * fireball, thunderstorm, stone shower) — bate com a fórmula de /spells
     * com ML efetivo 7: 62/5 + 1,2×7 + 7 = 27,8 · 62/5 + 2,8×7 + 17 = 49. A
     * semente antiga superestimava a runa em 30 % e a punha na frente das
     * ondas. Vale só enquanto a runa não foi medida. */
    const RUNA_SEMENTE = { min: 27, max: 49, nivel: 62, ml: 7, semente: true };

    /* v2.10 — FÓRMULA DE /spells SEM eval. O catálogo traz `formula.min/max`
     * como texto ("((level / 5) + (maglevel * 1.2) + 7)"). Só aceita números,
     * level/maglevel/skill/attack, + − × ÷ e parênteses; qualquer outra coisa
     * vira NaN (e o chamador cai na regra antiga de nível÷5). */
    const _formulas = new Map();
    function compilarFormula(expr) {
        const toks = String(expr).match(/\d+(?:\.\d+)?|[a-z_]+|\S/gi) || [];
        let i = 0;
        const prim = () => {
            const t = toks[i++];
            if (t === '(') { const v = soma(); if (toks[i++] !== ')') throw new Error('")" faltando'); return v; }
            if (t === '-') { const v = prim(); return x => -v(x); }
            if (/^\d/.test(t || '')) { const n = Number(t); return () => n; }
            if (/^(level|maglevel|skill|attack)$/.test(t || '')) return x => Number(x[t]) || 0;
            throw new Error('símbolo ' + t);
        };
        const prod = () => { let a = prim(); while (toks[i] === '*' || toks[i] === '/') { const op = toks[i++], b = prim(), l = a; a = op === '*' ? x => l(x) * b(x) : x => l(x) / b(x); } return a; };
        const soma = () => { let a = prod(); while (toks[i] === '+' || toks[i] === '-') { const op = toks[i++], b = prod(), l = a; a = op === '+' ? x => l(x) + b(x) : x => l(x) - b(x); } return a; };
        try { const f = soma(); return i === toks.length ? f : null; } catch (e) { return null; }
    }
    function valorFormula(expr, vars) {
        if (typeof expr !== 'string' || expr.length > 300) return NaN;
        if (!_formulas.has(expr)) _formulas.set(expr, compilarFormula(expr));
        const f = _formulas.get(expr);
        return f ? f(vars) : NaN;
    }
    /* Fórmula que depende SÓ de nível e nível mágico (magias e runas dos magos,
     * Caldera/Missile do Paladino). As do Knight usam skill × ataque da arma:
     * nelas o ML não entra e a extrapolação continua por nível÷5. */
    const formulaDeML = (m) => !!(m && m.formula && typeof m.formula.min === 'string' && typeof m.formula.max === 'string'
        && /maglevel/.test(m.formula.min + m.formula.max) && !/skill|attack/.test(m.formula.min + m.formula.max));
    /* ML efetivo que uma medida (min–max no nível L) implica. A fórmula é
     * linear no ML: f(L, ml) = f(L, 0) + ml × inclinação. Somando min e max a
     * inclinação fica maior e o arredondamento do jogo pesa menos. */
    function mlDaMedida(m, x, lvl) {
        if (!formulaDeML(m) || !x || !(lvl > 0)) return null;
        const f = (e, ml) => valorFormula(e, { level: lvl, maglevel: ml, skill: 0, attack: 0 });
        const base = f(m.formula.min, 0) + f(m.formula.max, 0), incl = f(m.formula.min, 1) + f(m.formula.max, 1) - base;
        if (!(incl > 0) || !Number.isFinite(base)) return null;
        const ml = (x.min + x.max - base) / incl;
        return ml > 0 && ml < 1000 ? ml : null;
    }
    /* ML efetivo de AGORA: mediana do que as magias medidas neste nível
     * implicam. Sem nenhuma medida neste nível, null (e vale nível÷5). */
    function mlEfetivoAgora(d, lvl, porNome) {
        const est = [];
        for (const k of Object.keys(d)) { const x = d[k]; if (x && x.nivel === lvl && !x.semente) { const ml = mlDaMedida(porNome[k], x, lvl); if (ml != null) est.push(ml); } }
        if (!est.length) return null;
        est.sort((a, b) => a - b);
        return est[Math.floor(est.length / 2)];
    }
    /* Escala uma medida do nível x.nivel (ML x.ml, ou o que ela mesma implica)
     * para o nível lvl com o ML efetivo medido agora. null = não dá. */
    function escalarPorML(m, x, lvl, mlAgora) {
        if (mlAgora == null || !formulaDeML(m) || x.nivel == null) return null;
        const mlAntes = x.ml != null ? x.ml : mlDaMedida(m, x, x.nivel);
        if (mlAntes == null) return null;
        const f = (e, L, ml) => valorFormula(e, { level: L, maglevel: ml, skill: 0, attack: 0 });
        const dMin = f(m.formula.min, lvl, mlAgora) - f(m.formula.min, x.nivel, mlAntes);
        const dMax = f(m.formula.max, lvl, mlAgora) - f(m.formula.max, x.nivel, mlAntes);
        return Number.isFinite(dMin) && Number.isFinite(dMax) ? { min: x.min + dMin, max: x.max + dMax } : null;
    }
    /* v2.10 — `dBruto` opcional: montarPlano já leu a tabela uma vez (antes
     * cada avaliar() relia e reparseava o localStorage, ~20× por vocação).
     * Extrapolação: pelo ML efetivo quando há medida neste nível (item 9);
     * senão nível÷5 como antes. Com `comSemente` (só o planejador), a semente
     * da runa 3×3 entra para as runas de 36 casas sem medida — fora dele a
     * tabela continua sendo só o que foi medido (o APLICAR usa "tabela vazia"
     * para saber que precisa ler /spell-numbers antes). */
    function danosConhecidos(vocForcada, dBruto, comSemente) {
        const d = dBruto || ler(chaveDano(vocForcada), {});
        const lvl = nivelAtual();
        const porNome = {};
        for (const m of (CAT.magias || [])) porNome[m.name] = m;
        const mlAgora = lvl ? mlEfetivoAgora(d, lvl, porNome) : null;
        const fora = {};
        const escala = (k, x) => {
            const delta = (x.nivel != null && lvl) ? lvl - x.nivel : 0;
            const pml = delta !== 0 || (x.semente && x.ml != null) ? escalarPorML(porNome[k], x, lvl, mlAgora) : null;
            const longe = !pml && Math.abs(delta) > NIVEIS_MAX_EXTRAPOLACAO;
            const aj = delta / 5;
            return Object.assign({}, x, {
                min: Math.max(1, Math.round(pml ? pml.min : x.min + aj)), max: Math.max(1, Math.round(pml ? pml.max : x.max + aj)),
                extrapolado: delta !== 0, nivelMedido: x.nivel, porML: !!pml,
                semente: !!x.semente || longe, velha: longe
            });
        };
        Object.keys(d).forEach(k => { fora[k] = escala(k, d[k]); });
        if (comSemente) for (const m of Object.values(porNome)) if (m.isRune && m.areaCells === 36 && !fora[m.name]) fora[m.name] = escala(m.name, RUNA_SEMENTE);
        return fora;
    }
    function danosMedidosNesteNivel(vocForcada) {
        const d = ler(chaveDano(vocForcada), {}), lvl = nivelAtual();
        return Object.keys(d).filter(k => d[k].nivel === lvl).length;
    }
    /* v2.10 — ML (o da ficha: valor + bônus) visto no frame. Decide se a
     * runa pode ser usada (sudden death pede ML 15). Sem leitura, null — e aí
     * nada é excluído por ML. */
    function mlAtual(voc) {
        let sk = ESTADO_WS.sk;
        if (!sk || !sk[voc]) sk = ler('skills_vistas', {});
        const x = sk && sk[voc];
        return x && Number(x.ml) > 0 ? Number(x.ml) : null;
    }
    /* v2.14.15 — O CARTÃO DE /spell-numbers É DE UM PERSONAGEM SÓ. O servidor devolve min–max calculados para UM
     * personagem da conta (aqui o Knight: ML ≈ 10, skill 52–57; `?vocation=`, `?profile=`, `?slot=` são ignorados —
     * conferido em 06/10) e o helper gravava a MESMA tabela para as quatro vocações. Para os magos (ML 46/50) e o Paladino
     * (ML 20, distância 62) o dano ficava 1,6–3× abaixo do medido, e o plano misturava escalas: a magia medida neste mapa
     * entrava com o dano real e a não medida com um terço dele. A fórmula de /spells com o ML do próprio personagem (ficha:
     * valor + bônus, lido do frame) bate com o livro-razão em ±2 % (Petrified Hollow, nível 91, por alvo: Great Fire Wave
     * 222 × 224 medido, Strong Ice Wave 312 × 317, great fireball 132 × 133, Divine Caldera 89 × 90, Hell's Core 616 × 635).
     * Regra: fórmula só de ML → recalcula com o ML da vocação; fórmula de skill do Paladino (o ataque só entra como ÷2500,
     * desprezível) → recalcula com a distância dele; o resto (Knight: skill × ataque da arma — os números do servidor são
     * dele) e quem não tem skill lida ainda → o cartão como veio. null = fica o cartão. */
    const ataqueDesprezivel = (expr) => !/attack/.test(String(expr).replace(/attack\s*\/\s*\d+(?:\.\d+)?/g, ''));
    function cartaoDaVocacao(m, voc, lvl, sk) {
        const f = m && m.formula;
        if (!f || typeof f.min !== 'string' || typeof f.max !== 'string' || !(lvl > 0) || !sk) return null;
        const calc = (vars) => {
            const mn = valorFormula(f.min, vars), mx = valorFormula(f.max, vars);
            return Number.isFinite(mn) && Number.isFinite(mx) && mx > 0 ? { min: Math.max(1, Math.round(mn)), max: Math.max(1, Math.round(mx)) } : null;
        };
        if (formulaDeML(m)) {
            const ml = Number(sk.ml) > 0 ? Number(sk.ml) : null;
            if (ml == null) return null;
            const r = calc({ level: lvl, maglevel: ml, skill: 0, attack: 0 });
            return r ? Object.assign(r, { ml }) : null;
        }
        if (voc === 'PALADIN' && /skill/.test(f.min + f.max) && ataqueDesprezivel(f.min + f.max)) {
            const dist = Number(sk.dist) > 0 ? Number(sk.dist) : null;
            if (dist == null) return null;
            const r = calc({ level: lvl, maglevel: 0, skill: dist, attack: 0 });
            return r ? Object.assign(r, { skill: dist }) : null;
        }
        return null;
    }
    /* skills vistas da vocação ({ml, dist, melee}) — do frame, ou do que ficou guardado da última sessão */
    function skillsDaVoc(voc) {
        let sk = ESTADO_WS.sk;
        if (!sk || !sk[voc]) sk = ler('skills_vistas', {});
        return (sk && sk[voc]) || null;
    }
    function anotarDano(nome, min, max, mana, casas) {
        const d = ler(chaveDano(), {});
        d[nome] = { min, max, mana, casas, nivel: nivelAtual(), ts: Date.now() };
        guardar(chaveDano(), d);
        invalidarPlanos();
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


    function avaliar(m, hunt, info, vocForcada, danos) {
        const casas = casasDaMagia(m);
        /* v2.6.7 — FEIXE é uma linha: os monstros ficam em leque, não em fila.
         * Great Energy Beam: modelo dizia 364 por lançamento (8 casas × 45),
         * medido 189 em Dragon Lair (28/09) — metade. Feixe conta metade dos
         * alvos; onda e runa 3×3 continuam com o teto min(casas, lure). */
        const feixe = /beam|feixe/i.test(m.area || '') || /beam/i.test(m.name || '');
        const alvos = Math.max(1, Math.min(feixe ? Math.ceil(casas / 2) : casas, lureMax(hunt)));
        /* v2.10 — área usa a nota ponderada (notasElementos, item 6) */
        const notas = casas > 1 && info.notasArea ? info.notasArea : info.notas;
        const nota = notas[m.combatType] != null ? notas[m.combatType] : 100;

        // dano: o medido manda; sem medição, cai no proxy de mana (jeito Stonegy)
        /* v1.8.0 — RUNA NÃO MOSTRA DANO no diálogo ("pulei 4, sem dano na
         * tela"), então nunca era confiável e nunca entrava em plano nenhum.
         * v2.10 — a semente das quatro runas 3×3 (RUNA_SEMENTE, 27–49 no nível
         * 62) vem em danosConhecidos(…, true), escalada pelo ML efetivo; o
         * elemento entra pela nota da hunt. Medição real sobrescreve. */
        const conhecido = (danos || danosConhecidos(vocForcada, null, true))[m.name] || null;
        const danoMedio = conhecido ? (conhecido.min + conhecido.max) / 2 : (m.mana ? m.mana * 0.45 : 30);
        const medido = !!conhecido && !conhecido.semente;
        const semente = !!(conhecido && conhecido.semente);

        /* físico contra armadura: desconto fixo por golpe (wiki). v2.10 (item
         * 8) — a mesma redução da munição: 0,75 × (armadura + defesa), wiki
         * /como-o-dano-e-calculado (reducaoFisicaMedia). Antes descontava 1,0 ×
         * armadura e ignorava a defesa. Nunca abaixo de 20 % do dano. */
        const red = m.combatType === 'COMBAT_PHYSICALDAMAGE' ? reducaoFisicaMedia(hunt) : 0;
        const fatorArm = red > 0 ? Math.max(0.2, (danoMedio - red) / danoMedio) : 1;
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
            m, casas, alvos, nota, danoMedio, danoEfetivo, medido, semente, fatorArm, fonte: conhecido ? conhecido.fonte || null : null,
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
    const FATOR_ALVOS_REAIS = 0.5; // só metade dos alvos teóricos é atingida

    /* v2.10 — `bebe`: se ESTE plano deixa a poção de mana ligada (o
     * Inteligente decide pelo Druida; os outros modelos seguem o jogo). */
    function viabilidade(hunt, avaliadas, voc, bebe) {
        const loot = LOOT_CACHE[hunt.id];
        if (loot == null) return null; // ainda não baixou
        const w = hunt.monsters.reduce((s, m) => s + (m.weight || 1), 0) || 1;
        const hp = hunt.monsters.reduce((s, m) => s + m.health * (m.weight || 1), 0) / w;
        const orcamento = loot * MARGEM_LUCRO;
        const exigido = orcamento > 0 ? hp / orcamento : Infinity;
        // dano/ouro pessimista de cada magia
        const regen = bebe == null ? !manaPotionLigada(voc) : !bebe;
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
     *  Fontes: logbook de um jogador da comunidade (Discord 27/09) e a Wiki
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
    /* v2.10 — PREÇO DA MUNIÇÃO (plano 2.11, item 10). O plano pedia ler de
     * /buy-prices (CAT.precos: sniper 5, burst 15, crystalline 20, diamond
     * 130). NÃO: TIBIDLE.md §7d-bis mediu na UI o custo POR DISPARO — burst
     * arrow ×23 = −207 → 9 (o /buy-prices diz 15), tarsal −6 — e ele é o
     * `cost` do catálogo /ammo, que a tabela acima copia (29/09: iguais). Com o
     * /buy-prices a crystalline sairia 20 em vez de 100 e viraria "barata". A
     * fonte agora é o /ammo vivo (CAT.municao se o carregador trouxer; senão
     * uma leitura pública única, só leitura, feita aqui); a tabela é a reserva
     * e o /buy-prices só entra para munição que nenhum dos dois conhece. */
    let _ammoCat = null, _ammoTentou = 0;
    function catalogoMunicao() {
        const c = (Array.isArray(CAT.municao) && CAT.municao.length && CAT.municao) || _ammoCat;
        if (c) return c;
        if (Date.now() - _ammoTentou > 10 * 60 * 1000) { // sem rede: tenta de novo em 10 min, não a cada plano
            _ammoTentou = Date.now();
            buscarJSON('/ammo').then(a => { if (Array.isArray(a) && a.length) { _ammoCat = a; invalidarPlanos(); } }).catch(() => { });
        }
        return null;
    }
    function custoMunicao(nome) {
        const c = catalogoMunicao();
        const x = c && c.find(a => a && (a.name || '').toLowerCase() === nome);
        if (x && Number.isFinite(Number(x.cost))) return Number(x.cost);
        if (MUNICAO_CUSTO[nome] != null) return MUNICAO_CUSTO[nome];
        const p = CAT.precos && !Array.isArray(CAT.precos) ? CAT.precos[nome] : null;
        return p != null ? Number(p) || 0 : 0;
    }
    /* dono, 28/09: "a burst arrow é de fogo e o dragão é imune". A explosão
     * (a área) é fogo; contra imune sobra só o impacto. `notas` é a nota de
     * elemento da hunt (notasElementos): fogo 0 % ⇒ a área não conta.
     * v2.10 — o ganho é pelo custo A MAIS que a munição básica (se um dia a
     * básica deixar de ser grátis, a conta continua certa). */
    function melhorMunicao(tipo, lvl, lure, reducao, skillDist, notas) {
        const sk = skillDist || 30, red = reducao || 0;
        const notaElem = a => a.elem && notas && notas[a.elem] != null ? notas[a.elem] / 100 : 1;
        const dano = a => Math.max(1, lvl / 5 + 0.045 * sk * a.atk - red) * (a.area ? Math.max(1, Math.min(1.4, lure || 1) * notaElem(a)) * (notaElem(a) || 0.3) : 1);
        const lista = (MUNICAO[tipo] || MUNICAO.arrow).filter(a => a.lvl <= lvl);
        if (!lista.length) return null;
        const base = lista.slice().sort((a, b) => custoMunicao(a.n) - custoMunicao(b.n))[0];
        let best = base, bv = 0;
        for (const a of lista) {
            const extra = custoMunicao(a.n) - custoMunicao(base.n); if (!(extra > 0)) continue;
            const ganho = (dano(a) - dano(base)) / extra;
            if (ganho >= 25 && ganho > bv) { bv = ganho; best = a; }
        }
        return best.n;
    }
    /* v2.6.5 — dono, 28/09: "só o Druida tem magia de cura" nesta conta. O
     * catálogo lista Wound Cleansing, Divine Healing etc., mas o livro-razão
     * nunca viu um cast de cura de ninguém além do Druida, e o Knight chegou a
     * 22 % em Dragon Lair com Wound Cleansing ≤65 configurada. Cura dos
     * outros três = poção de vida, com gatilho mais alto em quem apanha.
     * O Druida cura os outros com Heal Friend ≤60 (a mana dele vem da poção). */
    /* v2.6.9 — DEFESA nos 4, como o dono deixou à mão (prints de 28/09, 22h):
     * cada personagem com cura própria ≤50–60 % e um suporte; a barata (Light
     * Healing, 20 de mana) com gatilho alto, a forte com gatilho baixo.
     * ⚠ v2.10 (plano 2.11, item 5) — A ORDEM NA FILA É POR GATILHO CRESCENTE.
     * O comentário da 2.6.9 dizia "a barata vem primeiro", e a lista saía
     * [Light Healing ≤60, Divine Healing ≤40]. Wiki (/configurando-o-combate):
     * os slots de cura disparam "na ordem, o primeiro cujo gatilho foi
     * atingido". Com 35 % de vida os DOIS gatilhos foram atingidos e saía a
     * Light Healing — a forte nunca curava quem estava para morrer. Agora
     * planoExtras ordena tudo (poção de vida junto) do gatilho mais baixo ao
     * mais alto: ≤40 forte, ≤45 poção, ≤60 barata. Esta tabela só diz QUAIS e
     * com que gatilho; a ordem é feita lá. */
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
    /* v2.10 — `opc` = { manaTodos, seco } da variante (antes flags globais). */
    function planoExtras(voc, hunt, opc) {
        opc = opc || {};
        const lvl = nivelAtual();
        const heals = [];
        const vida = melhorPocao('vida', voc, lvl); if (vida) heals.push({ name: vida, percent: POCAO_VIDA_PCT[voc] || 40 });
        if (!opc.seco) for (const [n, p] of (CURAS[voc] || [])) if (temMagia(n, voc, lvl)) heals.push({ name: n, percent: p });
        /* gatilho crescente (item 5); empate mantém a ordem acima (poção antes) */
        heals.sort((a, b) => a.percent - b.percent);
        while (heals.length < 5) heals.push(null);
        const mp = melhorPocao('mana', voc, lvl);
        /* só o Druida bebe mana por padrão (cura do Knight não pode faltar); os
         * outros três ficam na regeneração. Variante inteligente_mana liga nos 4. */
        const pctMana = opc.manaTodos ? (voc === 'KNIGHT' ? 40 : 30) : (voc === 'DRUID' ? 30 : 0);
        const manaPotion = mp && pctMana ? { name: mp, percent: pctMana } : { percent: 0 };
        /* v2.9.0 — PROTECTOR NÃO É DE GRAÇA. Wiki (/magias-e-runas e
         * /como-o-dano-e-calculado): 200 de mana e, enquanto dura, escudo ×2,2,
         * dano recebido −15 % e DANO CAUSADO −35 %. No Knight — o que mais bate
         * com Berserk — isso só se paga quando ele corre risco. Regra: se a
         * vida mínima MEDIDA dele neste mapa ficou ≥ 60 %, sai; sem medida ou
         * abaixo disso, fica (morte de qualquer um encerra a caçada). */
        const knightSeguro = voc === 'KNIGHT' && hunt ? (vidaMinMedida(hunt, 'KNIGHT') ?? -1) >= 60 : false;
        const supports = opc.seco ? [] : (SUPORTES[voc] || []).filter(n => temMagia(n, voc, lvl) && !(n === 'Protector' && knightSeguro)).slice(0, 2);
        if (!opc.seco && supports.length < 2 && SUPORTES_SOBRANDO[voc] && temMagia(SUPORTES_SOBRANDO[voc], voc, lvl)) {
            const mm = hunt ? manaMedidaMedia(hunt, voc) : null;
            if (mm != null && mm >= 70) supports.push(SUPORTES_SOBRANDO[voc]);
        }
        while (supports.length < 2) supports.push(null);
        const r = { heals, manaPotion, supports };
        if (voc === 'PALADIN') {
            const ro = rosterEquip(); const p = ro && ro.find(x => x.vocation === 'PALADIN');
            const tipo = (p && p.equipment && p.equipment.weapon && p.equipment.weapon.attrs && p.equipment.weapon.attrs.ammotype) || 'arrow';
            const fp = ((ESTADO_WS.frame && ESTADO_WS.frame.party) || []).find(x => x.voc === 'PALADIN');
            /* a explosão da burst arrow é área: nota ponderada (item 6) */
            const notasH = hunt ? (notasElementos(hunt) || {}).notasArea : null;
            r.ammo = melhorMunicao(tipo, lvl, hunt ? lureMax(hunt) : 1, hunt ? reducaoFisicaMedia(hunt) : 0, fp && fp.dist, notasH);
        }
        return r;
    }

    /* v2.6.6 — índice voc|magia → {porCast, casts, hits} do que já foi medido neste
     * mapa: o livro-razão vivo (se a party está nele) e os resultados de Scan
     * guardados (qualquer variante). Fica com a medição de mais lançamentos.
     * v2.13.1 — `hits` (alvos atingidos): o Inteligente calibra o dano POR ALVO
     * e a fração de alvos da forma separados (calibracaoInt). */
    function indiceMedicoes(hunt) {
        const idx = {};
        if (!hunt || hunt.boss) return idx;
        const por = (m) => {
            if (!m || !(m.casts >= 3)) return;
            const k = m.voc + '|' + m.nome; const pc = m.dano != null ? m.dano / m.casts : m.porCast; if (!(pc >= 0)) return;
            const hits = m.hits != null ? m.hits : m.alvosPorCast != null ? Math.round(m.alvosPorCast * m.casts) : null;
            if (!idx[k] || m.casts > idx[k].casts) idx[k] = { porCast: Math.round(pc), casts: m.casts, hits };
        };
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
    /* v2.10 — RITMO DA ONDA para o simulador: quanto a onda leva para morrer e
     * quanto se espera pela próxima (livro-razão vivo ou Scan guardado; sem
     * medida, 2 s por criatura e 10 s de espera — a wiki diz 7–13 s). */
    function ritmoOndas(hunt) {
        const L = lureMax(hunt);
        if (!hunt || hunt.boss) return { lure: 1, matarS: 1e6, esperaS: 0 };
        let o = null;
        try { if (ESTADO_WS.huntId === hunt.id && RAZAO.ondas.n >= 4) o = { matar: RAZAO.ondas.matar / RAZAO.ondas.n / 1000, espera: RAZAO.ondas.timer / RAZAO.ondas.n / 1000 }; } catch (e) { }
        if (!o) try { for (const r of Object.values(scanResultados())) if (r.id === hunt.id && r.razao && r.razao.ondas && r.razao.ondas.n >= 4) { o = { matar: r.razao.ondas.matar, espera: r.razao.ondas.timer }; break; } } catch (e) { }
        return { lure: L, matarS: o && o.matar > 0 ? o.matar : 2 * L, esperaS: o && o.espera >= 0 ? o.espera : 10 };
    }

    /* =========================================================================
     *  ⭐ v2.10 — MINI-SIMULADOR DA FILA (plano 2.11, item 1)
     *
     *  O veredito do grupo olhava só o slot 1 de cada um e cobrava mana até de
     *  quem vive de regeneração — e desde a 2.9.0 a runa NUNCA é o slot 1, então
     *  o ouro dela sumia da conta. Aqui a fila roda como a wiki descreve
     *  (/configurando-o-combate):
     *    • quando o grupo de ataque libera (2 s; 4 s depois de Hell's Core,
     *      Rage, Eternal Winter, Wrath — `groupCooldownMs`), o jogo confere os
     *      slots 1→4 e lança o PRIMEIRO pronto;
     *    • pronto = recarga própria vencida, grupo secundário livre
     *      (`secondaryGroup`: focus 40 s, special 8 s, ultimatestrikes 30 s…),
     *      mana suficiente (quem bebe poção nunca fica sem) e criaturas vivas
     *      ≥ mínimo do slot;
     *    • a onda: `lure` criaturas que morrem uma a uma em `matarS`, depois
     *      `esperaS` sem ninguém; a mana regenera o tempo todo.
     *  Devolve dano/s, mana/s, runas/s, ouro/s e quantas vezes cada slot saiu.
     *  É MODELO: a regeneração é estimativa e a onda não depende do dano. Puro:
     *  não lê estado nenhum (testes/magia.test.js roda ele sozinho).
     * ====================================================================== */
    /* Regeneração de mana por segundo: a wiki não publica. Estimada pelas
     * medições desta conta em 28/09 (com o +6 MP/s do bestiário): Feiticeiro
     * a 93–98 % com Fire Wave + Energy Beam (~16 MP/s de gasto) → ≥ 16; Knight
     * a 20 % com Berserk (29 MP/s) e Paladino a 12 % com Caldera (40 MP/s) →
     * bem abaixo do gasto. Ela só decide QUANTO a runa preenche nos ciclos sem
     * mana de quem não bebe poção. */
    const REGEN_MANA_S = { KNIGHT: 8, PALADIN: 12, SORCERER: 16, DRUID: 16 };
    const SIM_PASSO_MS = 250;
    function simularFila(slots, o) {
        o = o || {};
        const T = Math.max(10, o.seg || 180) * 1000, L = Math.max(1, o.lure || 1);
        const matar = Math.max(500, (o.matarS != null ? o.matarS : 2 * L) * 1000), espera = Math.max(0, (o.esperaS != null ? o.esperaS : 10) * 1000);
        const ciclo = matar + espera, porBicho = matar / L;
        const vivos = t => { const x = t % ciclo; return x >= matar ? 0 : L - Math.floor(x / porBicho); };
        const pocao = !!o.pocao, max = Math.max(0, o.manaMax || 0), regen = Math.max(0, o.regen || 0) / 1000, fAlvos = o.fatorAlvos || 1;
        /* v2.12.0 — `regenSempre`: com poção a regeneração continua (desligado:
         * os modelos antigos seguem como estavam; o Inteligente usa simularParty) */
        const regenSempre = !!o.regenSempre;
        const pronto = slots.map(() => 0), sec = {}, disparos = slots.map(() => 0);
        let t = 0, ult = 0, grupo = 0, mana = max, dano = 0, manaGasta = 0, runas = 0, ouroRuna = 0, voltas = 0;
        /* v2.11.12 — O TRAVAMENTO DA MAGIA (29–30/09). Com o ritmo MEDIDO (onda 4,019 s + espera 9,524 s,
         * ciclo 13.542,83… ms), "t − t%ciclo + ciclo" deu exatamente t em t = 40.628,5 (erro de
         * arredondamento: t%ciclo saiu ciclo − 2e-12) e o laço ficou parado para sempre — a página
         * congelava ao aplicar ou trocar de modelo com a caçada em andamento. O próximo ciclo agora é
         * contado por índice e sempre anda; e o laço tem teto de voltas. */
        const proxOnda = x => { const p = (Math.floor(x / ciclo) + 1) * ciclo; return p > x ? p : x + SIM_PASSO_MS; };
        while (t < T && voltas++ < 200000) {
            if (!pocao || regenSempre) mana = Math.min(max, mana + regen * (t - ult));
            ult = t;
            const v = vivos(t), agora = t, manaAgora = mana;
            const i = v > 0 && t >= grupo
                ? slots.findIndex((s, k) => pronto[k] <= agora && !(s.sec && sec[s.sec] > agora) && v >= (s.minimo || 1) && (s.runa || pocao || manaAgora >= (s.mana || 0)))
                : -1;
            if (i < 0) { t = v > 0 ? (t < grupo ? grupo : t + SIM_PASSO_MS) : proxOnda(t); continue; }
            const s = slots[i];
            disparos[i]++;
            if (s.runa) { runas++; ouroRuna += s.ouro || 0; } else { manaGasta += s.mana || 0; if (!pocao) mana -= s.mana || 0; }
            dano += s.porLanc != null ? s.porLanc : (s.porAlvo || 0) * (s.alvos > 1 ? Math.max(1, Math.min(s.alvos, v) * fAlvos) : 1);
            pronto[i] = t + (s.cd || 2000);
            if (s.sec) sec[s.sec] = t + (s.secMs || s.cd || 2000);
            grupo = t + Math.max(2000, s.grupo || 2000);
            t = grupo;
        }
        const seg = T / 1000, ouroPocao = pocao ? manaGasta * OURO_POR_MANA : 0;
        return { seg, danoS: dano / seg, manaS: manaGasta / seg, runasS: runas / seg,
                 ouroS: (ouroRuna + ouroPocao) / seg, ouroPocaoS: ouroPocao / seg, ouroRunaS: ouroRuna / seg, disparos };
    }
    /* plano (slots do montarPlano) → entrada do simulador */
    function slotsParaSimular(plano) {
        return plano.map(p => {
            const a = p.av, m = a.m;
            return { nome: m.name, minimo: p.minimo, runa: !!m.isRune, mana: m.isRune ? 0 : (m.mana || 0), ouro: m.isRune ? (a.custo || 0) : 0,
                     cd: m.cooldownMs || 2000, grupo: m.groupCooldownMs || 2000, sec: m.secondaryGroup || null,
                     secMs: m.secondaryGroupCooldownMs || m.cooldownMs || 2000,
                     porAlvo: a.danoEfetivo, alvos: a.alvos, porLanc: a.medidoNoMapa ? a.porLancamento : null };
        });
    }
    /* mana máxima: a do frame quando há; sem frame, a curva do Tibia por
     * vocação (5/15/30 por nível) — só serve para o começo da luta. */
    function manaDoPersonagem(voc) {
        const lvl = nivelAtual() || 1;
        const fp = ((ESTADO_WS.frame && ESTADO_WS.frame.party) || []).find(x => x && x.voc === voc);
        const tibia = { KNIGHT: 5 * lvl + 50, PALADIN: 15 * lvl - 30, SORCERER: 30 * lvl - 150, DRUID: 30 * lvl - 150 }[voc] || 5 * lvl;
        /* v2.12.0 — a regeneração MEDIDA (regenMedida) manda; a tabela é a reserva */
        const rm = regenMedida(voc);
        return { manaMax: fp && fp.maxMana > 0 ? fp.maxMana : Math.max(60, tibia), regen: rm != null ? rm : REGEN_MANA_S[voc] || 8 };
    }

    /* v2.10 — recarga igual à do grupo (2 s): pronto em todo ciclo. */
    const enchimento = a => (a.m.cooldownMs || 2000) <= (a.m.groupCooldownMs || 2000);
    /* v2.10 — SLOT MORTO (plano 2.11, item 7). A fila dispara o primeiro
     * pronto; um slot só sai quando TODOS os da frente não podem. Atrás de um
     * preenchimento (recarga de 2 s, pronto em todo ciclo) com mínimo ≤ o
     * dele, um slot só sai quando o da frente não tem mana — então:
     *   • atrás de RUNA (não gasta mana) nunca sai;
     *   • magia atrás de magia que gasta a MESMA mana ou menos nunca sai
     *     (Physical Strike atrás de Flame Strike, 20 e 20: slot vazio que o
     *     painel mostrava como parte do kit — Zombies, Druida, 29/09);
     *   • mínimo maior que o lure do mapa nunca junta criatura bastante.
     * Mínimo MENOR que o do preenchimento vale: Missile ≥1 atrás da runa ≥2
     * sai quando sobra um monstro. Devolve o motivo, ou null. */
    function slotMorto(plano, j, lure) {
        const b = plano[j];
        if (b.minimo > lure) return `precisa de ${b.minimo} criaturas e o lure vai até ${lure}`;
        for (let i = 0; i < j; i++) {
            const a = plano[i], ma = a.av.m;
            if (!enchimento(a.av) || a.minimo > b.minimo) continue;
            if (ma.secondaryGroup && (ma.secondaryGroupCooldownMs || 0) > (ma.groupCooldownMs || 2000)) continue;
            if (ma.isRune) return `atrás de ${ma.name} ≥${a.minimo} (runa: pronta em todo ciclo)`;
            if (!b.av.m.isRune && (b.av.m.mana || 0) >= (ma.mana || 0)) return `atrás de ${ma.name} ≥${a.minimo} (${b.av.m.mana || 0} de mana contra ${ma.mana || 0}: só sairia sem mana para a da frente)`;
        }
        return null;
    }
    function permutacoes(arr) {
        if (arr.length <= 1) return [arr.slice()];
        const r = [];
        arr.forEach((x, i) => { for (const p of permutacoes(arr.slice(0, i).concat(arr.slice(i + 1)))) r.push([x].concat(p)); });
        return r;
    }
    /* =========================================================================
     *  ⭐ v2.12.0 — INTELIGENTE v3 (busca da party inteira)
     *
     *  Por que o de antes (2.6–2.11.13) falhou, medido: (a) RÉGUAS DIFERENTES —
     *  a magia do kit entrava com o dano MEDIDO (med.porCast) e a de fora com o
     *  teórico × todos os alvos do lure: a de fora sempre "ganhava" e o kit
     *  trocava a cada APLICAR (5 kits em 5 APLICAR); (b) regras fixas
     *  (pega(…, 2), "sobrando ? 3 : 2"); (c) poção cobrada sem descontar a
     *  regeneração (previsto 95k/h, medido 16,2k/h); (d) o APLICAR apagava a
     *  mana/vida medida do personagem. O CPU nunca foi o problema.
     *
     *  Agora:
     *   • RÉGUA ÚNICA: porLanc = danoAlvo · nota · armadura · alvos(classe, L),
     *     dentro e fora do kit. A medição NÃO substitui o número: ela corrige a
     *     CLASSE de forma inteira (fForma), com encolhimento para 1.
     *   • simularParty: os 4 juntos contra a onda como um POOL de HP (quem mata
     *     mais rápido encurta a onda de todos), regeneração sempre, reserva de
     *     mana para a cura, poção a 30 % com 1 s de descanso (o mesmo da runa).
     *   • busca com orçamento por CONTAGEM (N_MAX_SIM / N_MAX_PARTY, nada de
     *     relógio), determinística, objetivo em ordem: seguro → LCB ≥ piso →
     *     xp ≥ (1−ε)·xpMax → mais lucro, menos ouro, menos slots, nome.
     *   • quantas magias (1 a 4, inclusive no Knight), poção e suporte saem da
     *     busca — não há regra fixa.
     *   • histerese: só troca o kit aplicado se o novo for 3 % (tudo medido) ou
     *     5 % melhor, nunca nos 10 min depois de um APLICAR.
     *  Roda SÓ no clique (CALCULAR / APLICAR / Scan ligado pelo dono), nunca no
     *  handler de frame nem no desenho da tela. Nada é aplicado sozinho.
     * ====================================================================== */
    const N_MAX_SIM = 6000, N_MAX_PARTY = 400;
    /* CHEGADA_MS — v2.13.1: 0, a leva chega inteira (ao vivo a Strong Ice Wave
     * acertou 6 de 6 e a onda de 6 morreu em 2,3 s no Em área de Vampire hell;
     * com 0,5 s entre uma e outra as ondas saíam com 2–3 vivos). Validado contra os
     * 4 Scans de 30/09: abates/h previstos a −5 %…+8 % do medido (a 2.12.0 dava
     * +80 % e +92 % nos kits do Inteligente). */
    const SIM_INT_SEG = 360, SIM_TRIAGEM_SEG = 120, CHEGADA_MS = 0;
    const EPS_INT = 0.03, EPS_INT_XP = 0.005;
    const HISTERESE_INT = { medido: 0.03, estimado: 0.05, esperaMs: 10 * 60000 };
    const VOCS_INT = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'];
    const ORDEM_DESCIDA = ['DRUID', 'SORCERER', 'PALADIN', 'KNIGHT'];
    /* fração dos VIVOS que cada FORMA pega. v2.13.1 — medida (alvos atingidos ÷
     * lançamento, 4 Scans de 7 min em 30/09, Vampire hell L 6 e Banshee L 5): na
     * 1ª rajada da onda Strong Ice Wave, Energy Wave e Berserk acertaram 6 de 6
     * e a Caldera 5,7 de 6 → cerco, onda e Caldera 1; Front Sweep/Lesser
     * 0,25–0,38 do lure → 0,33; feixes 0,23–0,24 → 0,25. A média por lançamento
     * (0,72–0,95 nas de área) NÃO entra: ela já inclui os lançamentos com a onda
     * pela metade, que o simulador desconta pelos vivos — e cai com o kit (a
     * mesma onda deu 6 alvos no Em área e 4,3 no kit lento do Inteligente). A
     * 2.12.0 usava onda 0,6 e Caldera 0,25 e ainda encolhia pela medição (0,42 e
     * 0,25): o dano por alvo inflado (K_VIVO) pagava os alvos que faltavam. O 0,5
     * fixo (FATOR_ALVOS_REAIS) fica só nos modelos antigos. */
    const FRACAO_FORMA = { unico: 0, cerco: 1, frente: 0.33, lateral: 1, feixe: 0.25, caldera: 1 };
    function classeForma(m) {
        if (casasDaMagia(m) <= 1) return 'unico';
        const n = m.name || '', a = m.area || '';
        if (/caldera/i.test(n)) return 'caldera';
        if (/front sweep/i.test(n)) return 'frente';
        if (/beam/i.test(a) || /beam/i.test(n)) return 'feixe';
        if (/scorch/i.test(n)) return 'cerco';
        if (/wave/i.test(a) || /wave/i.test(n)) return 'lateral';
        return 'cerco';
    }
    /* Quando o dano veio da FÓRMULA de /spells (fonte 'formula') e não do
     * cartão de /spell-numbers: a fórmula superestima (tabela do nível 61). */
    const FATOR_DANO_CLASSE = { grande: 0.40, onda: 0.60, barata: 0.75 };
    const fatorDanoClasse = (m) => (!m.isRune && (m.mana || 0) <= 25) ? FATOR_DANO_CLASSE.barata : casasDaMagia(m) >= 36 ? FATOR_DANO_CLASSE.grande : FATOR_DANO_CLASSE.onda;
    /* Dano ao vivo POR ALVO ATINGIDO ÷ cartão (× nota × armadura). v2.13.1 —
     * medido em 30/09, nível 71, ~1.700 lançamentos em 4 Scans: Druida 2,0–2,3
     * (Strong Ice Wave, Energy Strike, avalanche), Feiticeiro 2,0 (feixes,
     * Lightning, runa; Energy Wave e Rage 3,0), Paladino 1,4–1,8, Knight
     * 0,55–1,0 (Berserk/Front Sweep ~0,9; Brutal Strike e Lesser 0,55). É o
     * valor da vocação para magia NÃO medida; a medida corrige magia a magia
     * (calibracaoInt). A 2.12.0 usava 5,8/5,0/4,7/7,35 (calibrado em UM Scan Em
     * área): com a fração de alvos pela metade dava certo no Em área (−12 %/−2 %
     * de abates) e inflava 3–10× o alvo único — o kit do Inteligente previa 4,3 s
     * por onda e matou em 11,4 s (+80 % de abates previstos; Banshee +92 %). */
    /* v2.14.15 — o 1,5 / 2,2 / 2,2 ERA o cartão errado: /spell-numbers vinha com o ML do Knight (~10) para todo mundo
     * (cartaoDaVocacao). Com o cartão da própria vocação a razão medido ÷ cartão fica em 1,0 (±2 % em Petrified Hollow,
     * nível 91) — e crescia com o ML (2,8–3,0 no nível 91 contra 2,2 no 71). O Knight continua 0,9 (armadura). */
    const K_VIVO = { KNIGHT: 0.9, PALADIN: 1, SORCERER: 1, DRUID: 1 };
    /* golpe do Knight / tiro do Paladino: a fórmula (nível/5 + ataque × skill −
     * armadura) dá ~50; o medido é ~15 por golpe (auto-ataque = 1–13 % do dano
     * da party nos 4 Scans). A 2.12.0 multiplicava pelo K_VIVO: ~160 de dano/s
     * de graça no Knight e ~120 no Paladino, o que fazia 2 magias baratas
     * parecerem bastar. */
    const K_BASICO = 0.3;
    /* peso da estimativa contra a medida (encolhimento: (n·r + N0·base)/(n + N0)) */
    const N0_CALIB = 30;
    /* mana/s guardada para a cura quando não há medida (Heal Friend a cada 20 s
     * no Druida; Wound Cleansing no Knight) */
    const RESERVA_CURA_PADRAO = { KNIGHT: 4, PALADIN: 0, SORCERER: 0, DRUID: 6 };
    /* gatilhos fixos do Inteligente: forte a 40 % antes da leve a 70 %, poção
     * de vida abaixo da cura por magia, Heal Friend a 65 % */
    const CURAS_INT = {
        KNIGHT: [['Wound Cleansing', 40]],
        PALADIN: [['Divine Healing', 40], ['Light Healing', 70]],
        SORCERER: [['Ultimate Healing', 40], ['Light Healing', 70]],
        DRUID: [['Ultimate Healing', 40], ['Heal Friend', 65]]
    };
    const POCAO_VIDA_INT = 30;
    /* suportes que a busca pode ligar e o que cada um faz no dano (wiki
     * /magias-e-runas). Buff de GRUPO custa ~3× com 4 personagens. */
    const SUPORTE_INT = { 'Train Party': { skill: 3 }, 'Blood Rage': { fis: 1.35 }, 'Protector': { mult: 0.65 }, 'Magic Shield': {} };
    /* v2.14.0 — KIT ENXUTO (dono, 02/10: os setups do Discord em Bog Raiders e Vampire hell, "tá perfeito,
     * muito bom" — 67k xp/h e +13k/h em Vampire hell, onde o nosso dava −12k/h em 29/09). O que eles fazem e
     * o Inteligente não podia: SEM os suportes e as curas por magia do dono (toda a mana no ataque) e Mana
     * Potion a 30 %. Liga na aba Magia (int_enxuto); desligado, nada muda. A cura volta por uma ESCADA
     * própria, medida no mapa com o próprio kit enxuto (escadaEnxuta):
     *   0 só poções · 1 + Heal Friend 70 % no Druida (um personagem cobre os quatro) ·
     *   2 + cura própria do Knight, do Paladino e do Feiticeiro · 3 o kit completo do dono (suportes e curas dele).
     * v2.14.1 — o degrau 2 ganha a Intense Healing (exura gran) 70 % no Feiticeiro: os 3 posts de nível 80
     * (Giant Spiders, Pits of Inferno, Hive Queen) põem cura nos outros três, com exura gran. */
    const CURAS_ENX = { 1: { DRUID: [['Heal Friend', 70]] }, 2: { KNIGHT: [['Wound Cleansing', 50]], PALADIN: [['Divine Healing', 40]], SORCERER: [['Intense Healing', 70]] } };
    const RESERVA_ENX = { 1: { DRUID: 6 }, 2: { KNIGHT: 4, PALADIN: 3, SORCERER: 3 } }; // mana/s guardada para essas curas (cumulativo)
    const POCAO_VIDA_ENX = 45; // sem poção de vida no perfil do dono
    /* KITS DA COMUNIDADE: entram na busca como party candidata inteira (como o Em área) e a escolha é global,
     * então o Inteligente nunca sai pior que eles pela conta dele. Ficam fora de barraValida: no de Vampire
     * hell três personagens não têm magia ≥1 (a busca exige uma por barra) e mesmo assim a onda morre — o
     * Knight com Lesser Front Sweep ≥1 fecha. `degrau` = a escada enxuta com que o kit foi testado ao vivo.
     * v2.14.1 — o PACOTE INTEIRO do post (dono, 02/10: "nossa automação conseguir ter xp e ouro com essas
     * combinações", conta principal no nível 81). Opcionais por vocação: `pocao` (número para todos ou
     * {VOC: fração}), `curas` {VOC: [[magia, %]]} (no lugar das da escada), `vida` {VOC: [poção, %]}, `sups`
     * {VOC: [...]} (os buffs de skill do post — só o kit da comunidade leva suporte no modo enxuto) e `ammo`
     * {VOC: munição}. Magia que o nível ainda não libera sai do kit (Fierce Berserk é nível 90); sem nenhuma,
     * fica o Em área daquele personagem. Simulado em 02/10 com o dano medido da conta (nível 80, lure 8):
     * o Inteligente empata ou passa em xp nos três (Giant Spiders 75,8k = 75,8k; Pits 86,8k × 82,8k; Hive
     * 94,6k × 85,9k) — o pacote entra para trazer cura e buff, que o simulador não mede. */
    const KITS_COMUNIDADE = {
        151: { nome: 'Bog Raiders (Discord, 02/10)', degrau: 1, pocao: 0.3, kits: {
            KNIGHT: [['Groundshaker', 2], ['Berserk', 2], ['Lesser Front Sweep', 1]], PALADIN: [['thunderstorm rune', 2], ['Ethereal Spear', 1]],
            SORCERER: [['Energy Wave', 2], ['thunderstorm rune', 2], ['Energy Strike', 1]], DRUID: [['Strong Ice Wave', 2], ['thunderstorm rune', 2], ['Energy Strike', 1]] } },
        50: { nome: 'Vampire hell (Discord, 02/10)', degrau: 0, pocao: 0.3, kits: {
            KNIGHT: [['Berserk', 2], ['Lesser Front Sweep', 1]], PALADIN: [['Divine Caldera', 2], ['avalanche rune', 2]],
            SORCERER: [['Energy Wave', 2], ['avalanche rune', 2]], DRUID: [['Strong Ice Wave', 2], ['avalanche rune', 2]] } },
        105: { nome: 'Giant Spiders POH (Discord, 02/10)', degrau: 2, pocao: 0.3, kits: {
            KNIGHT: [['Groundshaker', 2], ['Berserk', 2], ['Lesser Front Sweep', 1]], PALADIN: [['great fireball rune', 2], ['Ethereal Spear', 1]],
            SORCERER: [['Energy Wave', 2], ['great fireball rune', 2], ['Flame Strike', 1]], DRUID: [['Strong Ice Wave', 2], ['great fireball rune', 2], ['Flame Strike', 1]] },
            curas: { DRUID: [['Heal Friend', 70]], KNIGHT: [['Wound Cleansing', 70]], PALADIN: [['Intense Healing', 70]], SORCERER: [['Intense Healing', 70]] },
            sups: { KNIGHT: ['Train Party'], PALADIN: ['Sharpshooter'], SORCERER: ['Enchant Party'] }, ammo: { PALADIN: 'burst arrow' } },
        /* Pits of Inferno: o post repete o Exori Flam do de Giant Spiders, mas Dragon Lord é IMUNE a fogo
         * (100 %): o slot nunca daria dano e saiu. A burst arrow (explosão de fogo) idem — a munição fica com
         * a escolha de sempre (melhorMunicao). */
        49: { nome: 'Pits of Inferno Entrance (Discord, 02/10)', degrau: 2, pocao: 0.3, kits: {
            KNIGHT: [['Groundshaker', 2], ['Berserk', 2], ['Lesser Front Sweep', 1]], PALADIN: [['avalanche rune', 2], ['Ethereal Spear', 1]],
            SORCERER: [['Energy Wave', 2], ['avalanche rune', 2]], DRUID: [['Strong Ice Wave', 2], ['avalanche rune', 2]] },
            curas: { DRUID: [['Heal Friend', 70], ['Mass Healing', 65]], KNIGHT: [['Wound Cleansing', 40]], PALADIN: [['Intense Healing', 40]], SORCERER: [['Intense Healing', 40]] },
            sups: { KNIGHT: ['Train Party'], PALADIN: ['Sharpshooter'], SORCERER: ['Enchant Party'] } },
        199: { nome: 'Hive Queen Chamber (Discord, 02/10)', degrau: 2, pocao: { KNIGHT: 0.3, PALADIN: 0.3, SORCERER: 0.2, DRUID: 0.5 }, kits: {
            KNIGHT: [['Fierce Berserk', 2], ['Berserk', 2], ['Groundshaker', 2], ['Front Sweep', 2]], PALADIN: [['Divine Caldera', 2], ['avalanche rune', 2], ['Ethereal Spear', 1]],
            SORCERER: [['Energy Wave', 2], ['avalanche rune', 2], ['Lightning', 1], ['sudden death rune', 1]], DRUID: [['Strong Ice Wave', 2], ['avalanche rune', 2], ['sudden death rune', 1]] },
            curas: { KNIGHT: [['Wound Cleansing', 75]], PALADIN: [['Divine Healing', 60]], SORCERER: [['Intense Healing', 70], ['Ultimate Healing', 40]], DRUID: [['Heal Friend', 75], ['Intense Healing', 70]] },
            vida: { KNIGHT: ['Great Health Potion', 55], PALADIN: ['Strong Health Potion', 30], SORCERER: ['Health Potion', 30], DRUID: ['Health Potion', 30] },
            sups: { KNIGHT: ['Train Party'], SORCERER: ['Enchant Party'] }, ammo: { PALADIN: 'burst arrow' } }
    };
    const pocaoDoKit = (sem, v) => (sem.pocao && typeof sem.pocao === 'object' ? sem.pocao[v] || 0 : sem.pocao || 0);
    const qPasso = (x, p) => Math.round(x / p) * p;
    const q5pct = (x) => !(x > 0) ? 0 : Math.round(Math.pow(1.05, Math.round(Math.log(x) / Math.log(1.05))) * 1000) / 1000;
    const qCont = (n) => n >= 300 ? 300 : n >= 100 ? 100 : n >= 30 ? 30 : 0;
    /* mana/s de um suporte ligado o tempo todo (catálogo: mana ÷ duração) */
    function drenoSuporte(nome) {
        const m = (CAT.magias || []).find(x => x.name === nome);
        const mana = m ? m.mana || 0 : ({ 'Train Party': 60, 'Blood Rage': 290, 'Protector': 200, 'Magic Shield': 50 })[nome] || 0;
        const dur = m && m.buffMs ? m.buffMs / 1000 : ({ 'Train Party': 120, 'Blood Rage': 20, 'Protector': 20, 'Magic Shield': 180 })[nome] || 60;
        return mana * (m && m.category === 'party' ? 3 : 1) / dur;
    }

    /* v2.12.0 — REGENERAÇÃO MEDIDA (razaoVitais guarda a mediana das últimas
     * 200 janelas sem lançamento, sem gole e sem cura; vale com n ≥ 30). */
    function regenMedida(voc) {
        const x = ler('regen_' + voc, null);
        return x && x.n >= 30 && x.v > 0 ? Math.round(x.v) : null;
    }
    /* v2.13.2 — CALIBRANDO (dono, 01/10: "tenho que ficar no mapa 10 min usando Em área e depois trocar?
     * Se for assim, bota um aviso"). O que o Inteligente precisa para sair do chute neste mapa:
     *   1. regeneração de mana dos 4 (30 janelas de 3 s sem lançar; vale para todos os mapas);
     *   2. um Scan ≥ 2 min neste mapa com um modelo comum (Em área…): calibra abates/h e o gasto;
     *   3. loot medido: esse Scan com ≥ 100 abates;
     *   4. dano por alvo das magias neste mapa (vem do mesmo Scan ou de caçar aqui).
     * Sem isso ele funciona, mas com estimativa: o aviso diz o que falta e como fazer. */
    function calibracaoStatusInt(hunt) {
        const itens = [];
        const ab = { KNIGHT: 'Cav', PALADIN: 'Pal', SORCERER: 'Fei', DRUID: 'Dru' };
        const reg = VOCS_INT.map(v => { const x = ler('regen_' + v, null); return { v, n: x && x.n > 0 ? x.n : 0 }; });
        const regOk = reg.every(x => x.n >= 30);
        itens.push({ ok: regOk, txt: regOk ? 'regeneração de mana dos 4 medida' : 'regeneração de mana: ' + reg.map(x => `${ab[x.v]} ${Math.min(30, x.n)}/30`).join(' · ') + ' (mede sozinha caçando, em qualquer mapa)' });
        let sc = null;
        try { for (const r of Object.values(scanResultados())) if (r && r.id === hunt.id && r.abatesH > 0 && r.seg >= 120 && MODELOS[r.modelo] && r.modelo !== 'inteligente' && r.modelo !== 'boss' && (!sc || r.seg > sc.seg)) sc = r; } catch { }
        itens.push({ ok: !!sc, txt: sc ? `Scan deste mapa com ${nomeModelo(sc.modelo)} (${Math.round(sc.seg / 60)} min)` : 'falta um Scan deste mapa com Em área (≥ 2 min; 5 min é o ideal)' });
        const loot = lootMedidoInt(hunt) != null;
        itens.push({ ok: loot, txt: loot ? 'loot por abate medido' : 'loot por abate: precisa de um Scan com ≥ 100 abates' });
        let nMed = 0;
        try { nMed = Object.values(indiceMedicoes(hunt)).filter(x => x.hits > 0).length; } catch { }
        itens.push({ ok: nMed >= 3, txt: nMed ? `dano medido de ${nMed} magia(s) neste mapa` : 'dano das magias neste mapa: ainda não medido' });
        return { pronto: itens.every(i => i.ok), itens };
    }
    function calibracaoHtmlInt(hunt) {
        const c = calibracaoStatusInt(hunt);
        if (c.pronto) return `<div class="tb-ok" style="margin:4px 0">✓ Inteligente calibrado neste mapa</div>`;
        return `<div class="tb-cx tb-av" role="status" style="margin:4px 0"><b>⏳ CALIBRANDO o Inteligente neste mapa</b> — já pode usar: ele calcula com estimativa (erro típico de ±10 %) e nunca escolhe nada pior que o Em área na conta dele. ` +
            `Para afinar (opcional, uma vez por mapa): aba <b>Scan</b> → só este mapa, modelo <b>Em área</b>, 5 min → Iniciar; depois CALCULAR de novo.` +
            c.itens.map(i => `<div class="${i.ok ? 'tb-ok' : 'tb-mut'}">${i.ok ? '✓' : '·'} ${escHtml(i.txt)}</div>`).join('') + `</div>`;
    }
    /* v2.13.1 — a regeneração de cada um na aba Magia (o roteiro 2.13 pedia e ela só
     * existia no localStorage): medida com ≥ 30 janelas, senão a da tabela */
    function regenTexto() {
        const ab = { KNIGHT: 'Cav', PALADIN: 'Pal', SORCERER: 'Fei', DRUID: 'Dru' };
        const partes = VOCS_INT.map(v => {
            const x = ler('regen_' + v, null);
            if (x && x.n >= 30 && x.v > 0) return `${ab[v]} ${String(Math.round(x.v * 10) / 10).replace('.', ',')}`;
            return `${ab[v]} ${REGEN_MANA_S[v] || 8}*`;
        });
        const falta = VOCS_INT.some(v => { const x = ler('regen_' + v, null); return !(x && x.n >= 30); });
        return 'regeneração de mana/s: ' + partes.join(' · ') + (falta ? ' (* tabela — medindo: precisa de 30 janelas de 3 s sem lançar)' : ' (medida)');
    }
    /* janelas de ≥ 3 s em que a mana só subiu por regeneração → mana/s */
    function amostraRegen(janela) {
        if (!janela || !(janela.t1 - janela.t0 >= 3000)) return null;
        const v = (janela.m1 - janela.m0) / ((janela.t1 - janela.t0) / 1000);
        return v >= 0 && v < 500 ? v : null;
    }
    function medianaRegen(lista) {
        if (!lista || !lista.length) return null;
        const s = lista.slice().sort((a, b) => a - b);
        return s[Math.floor(s.length / 2)];
    }
    /* reserva de cura: curas lançadas neste mapa (livro-razão) × mana delas */
    function reservaCura(voc, hunt) {
        try {
            if (hunt && ESTADO_WS.huntId === hunt.id && RAZAO.t0) {
                const seg = (Date.now() - RAZAO.t0) / 1000;
                if (seg >= 120) {
                    let mana = 0;
                    for (const x of Object.values(RAZAO.magias)) {
                        if (x.voc !== voc) continue;
                        const m = (CAT.magias || []).find(c => c.name === x.nome);
                        if (m && m.group === 'healing') mana += (m.mana || 0) * x.casts;
                    }
                    return Math.round(mana / seg);
                }
            }
        } catch { }
        return RESERVA_CURA_PADRAO[voc] || 0;
    }
    function manaMinMedida(hunt, voc) {
        if (!hunt || hunt.boss) return null;
        try { if (ESTADO_WS.huntId === hunt.id) { const v = RAZAO.vitais[voc]; if (v && v.n >= 30 && v.manaMin != null) return Math.round(v.manaMin * 100); } } catch { }
        return null;
    }
    function amostrasVitais(hunt, voc) {
        try { if (hunt && ESTADO_WS.huntId === hunt.id) { const v = RAZAO.vitais[voc]; if (v) return v.n || 0; } } catch { }
        return 0;
    }
    /* dano de área que a party tomou (mcast) neste mapa */
    function areaTomada(hunt) {
        try { if (hunt && ESTADO_WS.huntId === hunt.id) return Math.max(0, (RAZAO.tomado.total || 0) - (RAZAO.tomado.corpo || 0)); } catch { }
        return 0;
    }

    /* ESCADA DEFENSIVA: o degrau vem da medição (sem medição, degrau 1); ele
     * desce um de cada vez, 30 min depois da última subida com o Knight acima
     * de 60 %.
     *   1 gatilhos de cura +10   · vida mín. do Knight < 40 % (ou sem medida)
     *     (v2.13.1: só sem o perfil do dono — com ele as curas dele ficam como estão)
     *   2 poção de segurança do Druida a 20 % · mana mín. do Druida < 2× a cura
     *     principal, ou Knight < 40 % já no degrau 1
     *   3 Protector              · Knight < 30 %, ou alguém morreu (v2.13.1: só
     *     num slot de suporte livre do dono)
     *   4 aviso "mapa acima da party" · Knight < 30 % já no degrau 3 */
    function escadaDefesa(hunt, agora) {
        const g0 = hunt ? (ler('escada', {})[hunt.id] || null) : null;
        const guardado = g0 ? g0.d : 0;
        const vK = hunt ? vidaMinMedida(hunt, 'KNIGHT') : null;
        let morte = false;
        for (const v of VOCS_INT) { const x = hunt ? vidaMinMedida(hunt, v) : null; if (x != null && x <= 0) morte = true; }
        const mD = hunt ? manaMinMedida(hunt, 'DRUID') : null;
        const curaD = ((CAT.magias || []).find(m => m.name === 'Heal Friend') || { mana: 120 }).mana || 120;
        const druidaBaixo = mD != null && mD / 100 * manaDoPersonagem('DRUID').manaMax < 2 * curaD;
        let alvo;
        if (vK == null && !morte) alvo = 1;
        else if (morte || vK < 30) alvo = guardado >= 3 ? 4 : 3;
        else if (druidaBaixo) alvo = 2;
        else if (vK < 40) alvo = guardado >= 1 ? 2 : 1;
        else alvo = 0;
        let d = Math.max(alvo, guardado);
        if (alvo < guardado && g0 && (agora || Date.now()) - (g0.t || 0) >= 30 * 60000 && vK != null && vK > 60) d = guardado - 1;
        const motivo = vK == null ? 'sem medida de vida (começa no degrau 1)' : morte ? 'alguém morreu' : `vida mín. do Knight ${vK} %` + (druidaBaixo ? `, mana mín. do Druida ${mD} %` : '');
        return { degrau: Math.min(4, d), alvo, motivo };
    }
    /* v2.14.0 — ESCADA DO KIT ENXUTO (ver CURAS_ENX). Começa no degrau guardado do mapa; sem ele, no do kit da
     * comunidade; sem nenhum, no 3 (o kit completo do dono — mapa novo não arrisca). A medida é a vida mínima
     * de cada um no livro-razão (por kit: trocarVitaisDeKit) com ≥ VITAIS_MIN_ENX amostras:
     *   • alguém morreu ou ficou < 30 % → SOBE um degrau (vale sempre);
     *   • todos ≥ 60 % e o degrau guardado foi aplicado pelo helper há ≥ 5 min → DESCE um (só com degrau
     *     guardado: aí a medida é do próprio kit enxuto, não de um kit mais protegido);
     *   • senão fica. Nada é aplicado sozinho: o degrau novo só vale no próximo APLICAR (regra do dono). */
    const VITAIS_MIN_ENX = 120, ENX_DESCE_MS = 5 * 60000;
    function escadaEnxuta(hunt, agora) {
        agora = agora || Date.now();
        const g = hunt ? (ler('escada_enx', {}) || {})[hunt.id] || null : null;
        const sem = hunt ? KITS_COMUNIDADE[hunt.id] || null : null;
        const base = g ? g.d : sem ? sem.degrau : 3;
        let nMin = Infinity, pior = null, morte = false;
        for (const v of VOCS_INT) {
            const x = hunt ? vidaMinMedida(hunt, v) : null;
            if (x == null) { nMin = 0; continue; }
            nMin = Math.min(nMin, amostrasVitais(hunt, v));
            if (x <= 0) morte = true;
            if (!pior || x < pior.vida) pior = { voc: v, vida: x };
        }
        const medido = !!pior && nMin !== Infinity && nMin >= VITAIS_MIN_ENX;
        const ab = { KNIGHT: 'Cav', PALADIN: 'Pal', SORCERER: 'Fei', DRUID: 'Dru' };
        let d = base, motivo;
        if (!medido) motivo = g ? 'sem medida suficiente com o kit aplicado' : sem ? 'kit da comunidade: ' + sem.nome : 'sem medida neste mapa: começa no kit completo do dono';
        else if (morte || pior.vida < 30) { d = Math.min(3, base + 1); motivo = (morte ? 'alguém morreu' : `${ab[pior.voc]} chegou a ${pior.vida} % de vida`) + (d > base ? ' → sobe um degrau' : ''); }
        else if (g && pior.vida >= 60 && agora - (g.t || 0) >= ENX_DESCE_MS && base > 0) { d = base - 1; motivo = `vida mín. ${pior.vida} % (${ab[pior.voc]}) → desce um degrau`; }
        else motivo = `vida mín. ${pior.vida} % (${ab[pior.voc]})`;
        return { degrau: d, base, motivo, pior, medido, alerta: medido && (morte || pior.vida < 35) };
    }
    function reservaEnx(voc, degrau) {
        let r = 0;
        for (let k = 1; k <= degrau; k++) r += (RESERVA_ENX[k] && RESERVA_ENX[k][voc]) || 0;
        return r;
    }
    /* suportes do ponto de partida (vigente, Em área, guardado, comunidade): nenhum no enxuto, os do dono fora dele */
    function supsDoCtx(ctx, voc, reserva) {
        if (ctx && ctx.enxAtivo) return [];
        return suportesDono(voc) || reserva || [];
    }
    /* v2.14.1 — kit guardado (aplicado ou mostrado) que veio da comunidade: volta com os buffs do post */
    function supsGuardado(ctx, voc, x) {
        const sem = x && x.com != null ? KITS_COMUNIDADE[x.com] : null;
        if (ctx && ctx.enxAtivo && sem) return ((sem.sups && sem.sups[voc]) || []).filter(n => temMagia(n, voc, nivelAtual())).slice(0, 2);
        return supsDoCtx(ctx, voc, x && x.sups);
    }
    /* v2.13.1 — a configuração do DONO (perfil ativo vindo do servidor). O
     * Inteligente não mexe nas curas nem nos suportes dele (regra do dono:
     * "nunca sobrescrever DEFESA/SUPORTE"; em 30/09 a 2.13.0 tirou Train, Protect,
     * Enchant e Heal Party dos 4 e o Em área aplicado depois não devolveu).
     * null = não há perfil lido (testes, perfil ainda não chegou): comportamento antigo. */
    function configDono(voc) {
        try { return typeof configAtiva === 'function' ? configAtiva(voc) || null : null; } catch { return null; }
    }
    function suportesDono(voc) {
        const c = configDono(voc);
        return c ? (c.supports || []).filter(Boolean).slice(0, 2) : null;
    }
    /* SUPORTES que a busca pode experimentar (o de defesa vem da escada).
     * Com o perfil do dono lido: só os dele, como estão. */
    function suportesPermitidos(voc, hunt) {
        const dono = suportesDono(voc);
        if (dono) return [dono];
        const lvl = nivelAtual(), r = [[]];
        const tem = (n) => temMagia(n, voc, lvl);
        if ((voc === 'KNIGHT' || voc === 'PALADIN') && tem('Train Party')) r.push(['Train Party']);
        if (voc === 'KNIGHT' && tem('Blood Rage') && hunt && !hunt.boss) {
            const vK = vidaMinMedida(hunt, 'KNIGHT'), n = amostrasVitais(hunt, 'KNIGHT');
            let morte = false;
            for (const v of VOCS_INT) { const x = vidaMinMedida(hunt, v); if (x != null && x <= 0) morte = true; }
            if (vK != null && vK >= 70 && n >= 30 && !morte) { r.push(['Blood Rage']); if (tem('Train Party')) r.push(['Train Party', 'Blood Rage']); }
        }
        return r;
    }
    /* suportes OBRIGATÓRIOS de defesa: Protector no degrau 3; Magic Shield no
     * mago que toma área (medida > 0) com vida mínima < 80 % */
    function suportesDefesa(voc, hunt, degrau) {
        const lvl = nivelAtual(), r = [];
        if (voc === 'KNIGHT' && degrau >= 3 && temMagia('Protector', voc, lvl)) r.push('Protector');
        if ((voc === 'SORCERER' || voc === 'DRUID') && temMagia('Magic Shield', voc, lvl) && areaTomada(hunt) > 0) {
            const vm = vidaMinMedida(hunt, voc);
            if (vm != null && vm < 80) r.push('Magic Shield');
        }
        return r;
    }

    /* A RÉGUA ÚNICA. `a` é o que avaliar() devolve; aqui ganha
     *   dAlvo    dano por alvo = cartão (×fator da fórmula) × nota × armadura × K
     *            (K da magia medida neste mapa; senão o da vocação, também
     *            corrigido pelo que se mediu; ×0,85 se nem cartão nem medida)
     *   classe, fr (fração do lure que a forma pega), alvosInt, porLancInt */
    function danoCartaoInt(a) {
        const formula = a.fonte === 'formula';
        return q5pct(a.danoMedio) * (formula ? fatorDanoClasse(a.m) : 1) * (a.nota / 100) * a.fatorArm;
    }
    function danoBaseInt(a, voc) { return danoCartaoInt(a) * (K_VIVO[voc] || 1); }
    function alvosForma(classe, casas, L, fr) {
        return classe === 'unico' ? 1 : Math.max(1, Math.min(casas, L * fr));
    }
    function kInt(ctx, voc, nome) {
        const c = ctx.calib;
        if (c && c.kMagia[voc + '|' + nome] != null) return c.kMagia[voc + '|' + nome];
        if (c && c.kVoc[voc] != null) return c.kVoc[voc];
        return K_VIVO[voc] || 1;
    }
    function reguaInt(a, voc, ctx) {
        const classe = classeForma(a.m);
        const card = a.medido && a.fonte !== 'formula';
        const medNoMapa = !!(ctx.med && ctx.med[voc + '|' + a.m.name]);
        const estimado = !card && !medNoMapa;
        const dAlvo = danoCartaoInt(a) * kInt(ctx, voc, a.m.name) * (estimado ? 0.85 : 1);
        const fr = classe === 'unico' ? 0 : (ctx.fracao && ctx.fracao[classe] != null ? ctx.fracao[classe] : (ctx.fForma && ctx.fForma[classe] != null ? ctx.fForma[classe] : FRACAO_FORMA[classe]));
        const alvosInt = alvosForma(classe, a.casas, ctx.L, fr);
        return Object.assign(a, { classe, estimado, dAlvo, fr, alvosInt, porLancInt: dAlvo * alvosInt });
    }
    /* v2.13.1 — CALIBRAÇÃO pelo que se mediu neste mapa (livro-razão e Scans),
     * separando as duas coisas que a 2.12.0 misturava num fator só:
     *   • dano POR ALVO: r = (dano ÷ alvos atingidos) ÷ cartão. Por vocação
     *     kVoc = (n·r + 30·K_VIVO)/(n + 30) com todos os acertos dela; por magia
     *     kMagia = (n·r + 30·kVoc)/(n + 30) — a magia nunca medida fica com o kVoc
     *     (mesma régua dentro e fora do kit; ela só ganha número próprio depois
     *     de medida, e a medida pesa aos poucos).
     *   • a fração de alvos da FORMA fica a de FRACAO_FORMA (a média medida vai
     *     em `medido`, só para mostrar — ver o comentário de FRACAO_FORMA).
     * n em degraus {0, 30, 100, 300} e fatores em degraus de 0,05: medida nova
     * que não muda o degrau não muda o kit (estabilidade). */
    function calibracaoInt(hunt, med, info, L, danosPorVoc) {
        const somaV = {}, somaC = {}, bruto = {};
        for (const k of Object.keys(med || {}).sort()) {
            const i = k.indexOf('|'), voc = k.slice(0, i), nome = k.slice(i + 1), x = med[k];
            const m = (CAT.magias || []).find(y => y.name === nome);
            if (!m || !VOCS_INT.includes(voc) || !(x.hits > 0) || !(x.casts > 0)) continue;
            const a = avaliar(m, hunt, info, voc, danosPorVoc[voc]);
            const card = danoCartaoInt(a);
            if (!(card > 0)) continue;
            const porHit = x.porCast * x.casts / x.hits;
            bruto[k] = { r: porHit / card, n: x.hits, voc };
            const sv = somaV[voc] || (somaV[voc] = { med: 0, teo: 0, n: 0 });
            sv.med += porHit * x.hits; sv.teo += card * x.hits; sv.n += x.hits;
            const classe = classeForma(m);
            if (classe !== 'unico') {
                const sc = somaC[classe] || (somaC[classe] = { hits: 0, max: 0, n: 0 });
                sc.hits += x.hits; sc.max += x.casts * Math.max(1, Math.min(a.casas || 1, L)); sc.n += x.casts;
            }
        }
        const encolher = (n, r, base, lo, hi) => { const nq = qCont(n); return nq ? qPasso(Math.min(hi, Math.max(lo, (nq * r + N0_CALIB * base) / (nq + N0_CALIB))), 0.05) : base; };
        const kVoc = {}, kMagia = {}, f = {}, n = {}, medido = {};
        for (const v of VOCS_INT) { const s = somaV[v], p = K_VIVO[v] || 1; kVoc[v] = s ? encolher(s.n, s.med / s.teo, p, p / 4, p * 4) : p; }
        for (const k of Object.keys(bruto)) { const b = bruto[k], base = kVoc[b.voc]; kMagia[k] = encolher(b.n, b.r, base, base / 4, base * 4); }
        for (const c of Object.keys(FRACAO_FORMA)) {
            const s = somaC[c];
            n[c] = s ? qCont(s.n) : 0;
            f[c] = FRACAO_FORMA[c];
            if (s && c !== 'unico') medido[c] = Math.round(s.hits / s.max * 100) / 100;
        }
        return { kVoc, kMagia, f, n, medido };
    }
    /* DOMINADA: do MESMO grupo secundário (só uma do grupo sai por vez — focus,
     * special, greatbeams…), dá menos ou igual por lançamento e custa igual ou
     * mais em mana, ouro e recarga. Sem grupo nada é dominado: duas magias da
     * mesma forma se revezam nas recargas (Berserk 4 s + Groundshaker 8 s
     * enchem os turnos vazios). Empate total: fica a de nome menor. */
    function dominada(a, b) {
        if (a === b || !a.m.secondaryGroup || a.m.secondaryGroup !== b.m.secondaryGroup) return false;
        const cd = x => x.m.cooldownMs || 2000;
        if (!(b.porLancInt >= a.porLancInt && (b.m.mana || 0) <= (a.m.mana || 0) && b.custo <= a.custo && cd(b) <= cd(a))) return false;
        const estrito = b.porLancInt > a.porLancInt || (b.m.mana || 0) < (a.m.mana || 0) || b.custo < a.custo || cd(b) < cd(a);
        return estrito || b.m.name < a.m.name;
    }
    /* A. CANDIDATAS (no máximo 8): sai imune, vetada, runa acima do ML, runa no
     * Knight, Sharpshooter e dominada; ficam as 2 melhores em dano/custo e as
     * 2 em dano/lançamento de cada (classe, faixa de recarga). */
    function candidatasInt(voc, avs, info) {
        const vetoDe = a => (a.casas > 1 ? info.vetosArea : info.vetos)[a.m.combatType];
        const ok = avs.filter(a => a.nota > 0 && a.danoEfetivo > 0 && vetoDe(a) == null && !a.semML && !(voc === 'KNIGHT' && a.m.isRune) && a.m.name !== 'Sharpshooter' && a.porLancInt > 0);
        const vivas = ok.filter(a => !ok.some(b => dominada(a, b)));
        const faixa = a => { const cd = a.m.cooldownMs || 2000; return cd <= 2000 ? 0 : cd <= 8000 ? 1 : 2; };
        const nome = (a, b) => a.m.name < b.m.name ? -1 : a.m.name > b.m.name ? 1 : 0;
        const grupos = {};
        for (const a of vivas) { const g = a.classe + '|' + (a.m.isRune ? 'r' : 'm') + '|' + faixa(a); if (!grupos[g]) grupos[g] = []; grupos[g].push(a); }
        const fica = new Set();
        for (const g of Object.keys(grupos).sort()) {
            const l = grupos[g];
            l.slice().sort((a, b) => b.porLancInt / Math.max(0.01, b.custo) - a.porLancInt / Math.max(0.01, a.custo) || nome(a, b)).slice(0, 2).forEach(a => fica.add(a));
            l.slice().sort((a, b) => b.porLancInt - a.porLancInt || nome(a, b)).slice(0, 2).forEach(a => fica.add(a));
        }
        let r = [...fica].sort((a, b) => b.porLancInt - a.porLancInt || nome(a, b));
        if (r.length > 8) {
            const unico = r.find(a => a.classe === 'unico');
            r = r.slice(0, 8);
            if (unico && !r.includes(unico)) r[7] = unico;
        }
        return r;
    }
    /* B. BARRAS: subconjuntos de 1 a 4 (1 por grupo secundário); as de recarga
     * longa em todas as ordens, os preenchimentos (recarga = a do grupo) no fim,
     * área antes de alvo único. Mínimo padrão: área 2, alvo único 1. Slot morto
     * sai sem simular. */
    function combinacoes(n, k, ini, pref, out) {
        if (pref.length === k) { out.push(pref.slice()); return out; }
        for (let i = ini; i < n; i++) { pref.push(i); combinacoes(n, k, i + 1, pref, out); pref.pop(); }
        return out;
    }
    function barraValida(plano, L) {
        if (!plano.length || plano.length > 4 || !plano.some(p => p.minimo === 1)) return false;
        for (let j = 0; j < plano.length; j++) if (slotMorto(plano, j, L)) return false;
        return true;
    }
    function barrasDe(cands, L) {
        const out = [];
        const ordEnch = (a, b) => (a.classe === 'unico') - (b.classe === 'unico') || b.porLancInt - a.porLancInt || (a.m.name < b.m.name ? -1 : 1);
        for (let k = 1; k <= Math.min(4, cands.length); k++) {
            for (const idx of combinacoes(cands.length, k, 0, [], [])) {
                const kit = idx.map(i => cands[i]);
                const g = kit.map(a => a.m.secondaryGroup).filter(Boolean);
                if (new Set(g).size < g.length) continue;
                const longas = kit.filter(a => !enchimento(a)), ench = kit.filter(enchimento).sort(ordEnch);
                for (const pl of permutacoes(longas)) {
                    const plano = pl.concat(ench).map(a => ({ av: a, minimo: a.classe === 'unico' ? 1 : Math.min(2, L) }));
                    if (!plano.some(p => p.minimo === 1)) plano[plano.length - 1].minimo = 1;
                    if (barraValida(plano, L)) out.push(plano);
                }
            }
        }
        return out;
    }
    /* C. variações de uma barra: mínimos {1, 2, 3} ≤ L nas de área, e a runa/
     * preenchimento de área na FRENTE das de recarga longa quando o mínimo dela
     * é maior (runa ≥3 > Caldera ≥1: com 3+ vivos sai a runa, com menos a
     * Caldera — a fila da comunidade no Paladino). */
    function variacoesMinimos(plano, L) {
        const opc = plano.map(p => p.av.classe === 'unico' ? [1] : [1, 2, 3].filter(x => x <= L));
        const out = [], idx = opc.map(() => 0);
        for (;;) {
            const mins = idx.map((i, j) => opc[j][i]);
            out.push(plano.map((p, j) => ({ av: p.av, minimo: mins[j] })));
            let j = 0; while (j < idx.length && ++idx[j] >= opc[j].length) { idx[j] = 0; j++; }
            if (j === idx.length) break;
        }
        const r = [];
        for (const pl of out) {
            r.push(pl);
            const fr = pl.filter(p => enchimento(p.av) && p.av.classe !== 'unico'), resto = pl.filter(p => !fr.includes(p));
            if (fr.length && resto.some(p => !enchimento(p.av))) r.push(fr.concat(resto));
        }
        return r;
    }
    const assinaturaPlano = (plano) => plano.map(p => p.av.m.name + '≥' + p.minimo).join('>');

    /* =========================================================================
     *  simularParty — PURO e determinístico (testes/inteligente.test.js).
     *  membros: [{ voc, slots:[{minimo, runa, mana, ouro, cd, grupo, sec, secMs,
     *             d (dano por alvo), casas, fr, unico}], manaMax, regen (útil,
     *             mana/s), pocao (fração de mana que dispara o gole, 0 = não
     *             bebe), pocaoMana, pocaoOuro, basico (golpe/tiro a cada 2 s) }]
     *  o: { L, hp (HP médio), E (espera entre ondas, s), seg, externoDps }
     *  A onda: chegam L criaturas de HP médio (CHEGADA_MS entre uma e outra; 0 =
     *  a leva inteira junta), cada uma com a sua vida (v2.13.1; antes era um
     *  pool). A regeneração corre sempre; o gole dá +pocaoMana e
     *  trava poção/runa por 1 s. Passo de 250 ms. Devolve T (tempo médio para
     *  matar a onda) e, por personagem, dano/s, mana/s, ouro/s e disparos.
     * ====================================================================== */
    function simularParty(membros, o) {
        const L = Math.max(1, Math.round(o.L || 1)), HP = Math.max(1, o.hp || 1), E = Math.max(0, o.E || 0) * 1000;
        const fim = Math.max(10, o.seg || SIM_INT_SEG) * 1000, passo = SIM_PASSO_MS, cheg = CHEGADA_MS, ext = Math.max(0, o.externoDps || 0) * passo / 1000;
        /* estado de cada um em campos simples (o laço roda ~1.500 passos × 4 por simulação e a busca faz milhares) */
        const n = membros.length, st = new Array(n);
        for (let j = 0; j < n; j++) {
            const m = membros[j], ns = m.slots.length, grupos = [], secIdx = new Int8Array(ns);
            for (let i = 0; i < ns; i++) { const g = m.slots[i].sec; if (!g) { secIdx[i] = -1; continue; } let x = grupos.indexOf(g); if (x < 0) { x = grupos.length; grupos.push(g); } secIdx[i] = x; }
            st[j] = {
                m, sl: m.slots, ns, reg: m.regen / 1000, max: m.manaMax, lim: m.pocao > 0 ? m.pocao * m.manaMax : -1, pm: m.pocaoMana || 100, po: m.pocaoOuro || 56, bas: m.basico > 0 ? m.basico : 0,
                mana: m.manaMax, manaMin: m.manaMax, pronto: new Float64Array(ns), secIdx, secAte: new Float64Array(Math.max(1, grupos.length)),
                grupo: 0, exaust: 0, dano: 0, basicoT: 0, manaGasta: 0, ouroP: 0, ouroR: 0, pocoes: 0, disparos: new Array(ns).fill(0),
                /* alvos por nº de vivos: guardado no próprio slot (os 3 que ficam fixos na triagem são os mesmos objetos) */
                alv: m.slots.map(s => {
                    if (s.alv && s.alv.length === L + 1) return s.alv;
                    const a = []; for (let v = 0; v <= L; v++) a.push(s.unico ? 1 : Math.max(1, Math.min(s.casas || 1, v * (s.fr || 0))));
                    s.alv = a; return a;
                })
            };
        }
        /* v2.13.1 — VIDA POR CRIATURA (era um pool: o dano matava uma de cada vez
         * e a 3ª magia da 1ª rajada já saía com metade da onda "morta" — ao vivo a
         * Strong Ice Wave acertou 6 de 6 porque a área espalha o dano e ninguém
         * morreu ainda). Área acerta as vivas (as de menos vida primeiro, até
         * `alvos`, a última com a fração); alvo único, golpe e dano externo focam a
         * de menos vida; dano além da vida se perde (overkill). */
        const vidaM = new Float64Array(L).fill(HP), ordem = new Int16Array(L);
        let mortos = 0, Dtot = 0;
        const ferir = (i, d) => { const v = vidaM[i], e = d < v ? d : v; vidaM[i] = v - e; Dtot += e; if (vidaM[i] <= 1e-9) { vidaM[i] = 0; mortos++; } };
        const acertar = (porAlvo, alvos, presentes) => {
            let k = 0;
            for (let i = 0; i < presentes; i++) if (vidaM[i] > 0) ordem[k++] = i;
            if (!k) return;
            for (let a = 1; a < k; a++) { const x = ordem[a]; let b = a - 1; while (b >= 0 && vidaM[ordem[b]] > vidaM[x]) { ordem[b + 1] = ordem[b]; b--; } ordem[b + 1] = x; }
            const cheios = Math.min(k, Math.floor(alvos + 1e-9)), frac = cheios < k ? alvos - cheios : 0;
            for (let a = 0; a < cheios; a++) ferir(ordem[a], porAlvo);
            if (frac > 1e-9) ferir(ordem[cheios], porAlvo * frac);
        };
        let t = 0, tUlt = 0, tOnda = 0, ondas = 0, somaT = 0, luta = 0, voltas = 0, vivoAc = 0, somaVivo = 0; // v2.13.4: monstro·tempo vivo por onda
        while (t < fim && voltas++ < 100000) {
            const dt = t - tUlt; tUlt = t;
            for (let j = 0; j < n; j++) {
                const s = st[j];
                let mana = s.mana + s.reg * dt;
                if (mana > s.max) mana = s.max; else if (mana < 0) mana = 0;
                s.mana = mana; if (mana < s.manaMin) s.manaMin = mana;
            }
            const presentes = t < tOnda ? 0 : cheg > 0 ? Math.min(L, 1 + Math.floor((t - tOnda) / cheg)) : L;
            if (mortos >= L) {
                ondas++; somaT += t - tOnda; somaVivo += vivoAc; vivoAc = 0; vidaM.fill(HP); mortos = 0; Dtot = 0;
                tOnda = t + E; t = Math.max(t + passo, tOnda); continue;
            }
            let vivos = presentes - mortos;
            if (vivos > 0) {
                luta += passo;
                if (ext) { acertar(ext, 1, presentes); vivos = presentes - mortos; }
            }
            for (let j = 0; j < n; j++) {
                const s = st[j];
                if (s.lim >= 0 && s.mana < s.lim && t >= s.exaust) {
                    s.mana = Math.min(s.max, s.mana + s.pm); s.ouroP += s.po; s.pocoes++; s.exaust = t + 1000;
                }
                if (vivos <= 0) continue;
                /* golpe/tiro básico: 1 a cada 2 s em quem está vivo, fora da fila de magias */
                if (s.bas && t >= s.basicoT) {
                    s.dano += s.bas; acertar(s.bas, 1, presentes); s.basicoT = t + 2000;
                    vivos = presentes - mortos;
                    if (vivos <= 0) continue;
                }
                if (t < s.grupo) continue;
                const sls = s.sl;
                let k = -1;
                for (let i = 0; i < s.ns; i++) {
                    const sl = sls[i];
                    if (s.pronto[i] > t || vivos < sl.minimo) continue;
                    const gi = s.secIdx[i];
                    if (gi >= 0 && s.secAte[gi] > t) continue;
                    if (sl.runa ? t < s.exaust : s.mana < sl.mana) continue;
                    k = i; break;
                }
                if (k < 0) continue;
                const sl = sls[k], alvos = s.alv[k][vivos];
                s.dano += sl.d * alvos; s.disparos[k]++;
                acertar(sl.d, alvos, presentes);
                if (sl.runa) { s.ouroR += sl.ouro || 0; s.exaust = t + 1000; } else { s.mana -= sl.mana; s.manaGasta += sl.mana; if (s.mana < s.manaMin) s.manaMin = s.mana; }
                s.pronto[k] = t + (sl.cd || 2000);
                if (s.secIdx[k] >= 0) s.secAte[s.secIdx[k]] = t + (sl.secMs || sl.cd || 2000);
                s.grupo = t + Math.max(2000, sl.grupo || 2000);
                vivos = presentes - mortos;
            }
            if (vivos > 0) vivoAc += vivos * passo;
            t += passo;
        }
        const seg = fim / 1000;
        let T;
        if (ondas) T = somaT / ondas / 1000;
        else { const r = Dtot / Math.max(1, (t - tOnda) / 1000); T = Math.min(3600, L * HP / Math.max(1e-6, r)); }
        const por = {};
        for (const s of st) por[s.m.voc] = { manaMinFrac: s.max > 0 ? s.manaMin / s.max : 1, danoS: s.dano / seg, danoLutaS: luta ? s.dano / (luta / 1000) : 0, manaS: s.manaGasta / seg, ouroPocaoS: s.ouroP / seg, ouroRunaS: s.ouroR / seg, pocoesH: s.pocoes / seg * 3600, disparos: s.disparos };
        /* v2.13.4 — VIVOS × TEMPO por onda (monstro·s): quanto mais tempo o bicho fica vivo, mais ele bate
         * e mais a party gasta curando (dono, 01/10: "quanto mais o bicho fica vivo, mais ele bate e gasta
         * tudo — por isso tem que ser insta kill"). metricasInt cobra a cura por isso. */
        const vivosOnda = (ondas ? somaVivo / ondas : vivoAc) / 1000;
        return { T, ondas, luta: luta / 1000, seg, por, vivosOnda };
    }

    /* personagem do simulador a partir de uma barra (régua única, suportes) */
    function membroInt(voc, esc, ctx, train, regenMul) {
        const cv = ctx.voc[voc];
        const sups = (esc.sups || []).concat(ctx.defesa[voc] || []);
        let mult = 1, fis = 1, dreno = 0;
        for (const n of sups) { const s = SUPORTE_INT[n] || {}; dreno += drenoSuporte(n); if (s.mult) mult *= s.mult; if (s.fis) fis *= s.fis; }
        const tr = train && (voc === 'KNIGHT' || voc === 'PALADIN') ? 1 + 3 / Math.max(5, cv.skill || 30) : 1;
        const slots = esc.plano.map(p => {
            const a = p.av, m = a.m, f = mult * (m.combatType === 'COMBAT_PHYSICALDAMAGE' ? fis * tr : 1);
            return { minimo: p.minimo, runa: !!m.isRune, mana: m.isRune ? 0 : (m.mana || 0), ouro: m.isRune ? (a.custo || 0) : 0, cd: m.cooldownMs || 2000, grupo: m.groupCooldownMs || 2000,
                     sec: m.secondaryGroup || null, secMs: m.secondaryGroupCooldownMs || m.cooldownMs || 2000, d: a.dAlvo * f, casas: a.casas, fr: a.fr, unico: a.classe === 'unico' };
        });
        const seguranca = !ctx.enxAtivo && ctx.escada.degrau >= 2 && voc === 'DRUID' ? 0.2 : 0; // v2.14.0: o enxuto não tem a poção de segurança
        const basico = (ctx.basico[voc] || 0) * K_BASICO * mult * fis * tr;
        return { voc, slots, basico, manaMax: cv.manaMax, regen: cv.regen * (regenMul || 1) - cv.reserva - dreno, dreno, pocao: Math.max(esc.pocao || 0, seguranca),
                 pocaoMana: ctx.pocao.mana, pocaoOuro: ctx.pocao.ouro };
    }
    function metricasInt(ctx, sim, extraOuroS) {
        const T = sim.T * ctx.eta, abH = ctx.L * 3600 / (T + ctx.E) * ctx.kCalib;
        let ouroS = extraOuroS || 0, custoS = extraOuroS || 0;
        for (const v of Object.keys(sim.por)) { const x = sim.por[v], o = x.ouroPocaoS + x.ouroRunaS; ouroS += o; custoS += (ctx.cVoc[v] || 1) * o; }
        /* v2.13.4 — cura: ouro por monstro·s vivo (calibrado no Scan do mapa: poção de vida medida ÷ vivos
         * da party do Scan) × vivos por onda × ondas/h. Sem Scan, 0 (o kit do Scan custa o mesmo de antes). */
        const curaH = (ctx.curaPorVivo || 0) * (sim.vivosOnda || 0) * ctx.eta * (abH / Math.max(1, ctx.L));
        const custoH = custoS * 3600 + curaH, receitaH = abH * ctx.loot, lucroH = receitaH - custoH;
        const LCB = lucroH - (0.15 * custoH + (ctx.lootMedido ? 0.05 : 0.20) * receitaH);
        const piso = ctx.lootMedido ? 0 : Math.max(5000, 0.10 * receitaH);
        return { T, abH, xpH: abH * ctx.xpAbate, custoH, ouroH: ouroS * 3600 + curaH, curaH, receitaH, lucroH, LCB, piso };
    }
    /* seguro: quem não bebe não gasta mais mana (ataque + suporte) do que a
     * regeneração útil (regen − reserva de cura) repõe.
     * v2.14.17 — a folga era a barra cheia do começo dividida pelos segundos SIMULADOS (manaMax ÷ 360 na party, ÷ 120 na
     * triagem): para o Feiticeiro de 2.580 de mana isso liberava 7 a 21 de mana/s de déficit — qualquer kit passava. Ao
     * vivo (Petrified Hollow, 06/10) o kit sem poção gastava 24,4 + 3,3 de suporte contra 21 de regeneração e o Feiticeiro
     * ficou a 4 % de mana: 23 % do dano em vez dos 34 % do Em área. A caçada dura horas: a barra do começo vale espalhada
     * por meia hora (manaMax ÷ 1.800 ≈ 1,4/s), não pelos 2–6 min da simulação. */
    const SEGURO_FOLGA_SEG = 1800;
    function seguroInt(ctx, membros, sim) {
        for (const m of membros) {
            if (m.pocao > 0) continue;
            const x = sim.por[m.voc]; if (!x) continue;
            if (x.manaS + m.dreno > Math.max(0, m.regen + m.dreno) * 1.02 + m.manaMax / SEGURO_FOLGA_SEG + 0.05) return false;
        }
        return true;
    }
    const okInt = (x) => !!(x && x.seguro && x.met.LCB >= x.met.piso);
    /* ORDEM do objetivo (o 1º é o escolhido): seguro e LCB ≥ piso e xp na faixa
     * (1−ε)·xpMax → maior lucro, menor ouro/h, menos poção ligada, menos
     * slots, assinatura (xpRef: o maior xp já visto — a descida por
     * coordenadas não pode perder ε a cada personagem);
     * depois os que passam no piso por xp; depois os que não se pagam por LCB. */
    function ordenarInt(lista, eps, xpRef) {
        const xpMax = Math.max(xpRef || 0, ...lista.filter(okInt).map(x => x.met.xpH));
        const grupo = x => okInt(x) ? (x.met.xpH >= (1 - eps) * xpMax ? 0 : 1) : x.seguro ? 2 : 3;
        const r50 = v => Math.round(v / 50);
        return lista.slice().sort((a, b) => {
            const ga = grupo(a), gb = grupo(b);
            if (ga !== gb) return ga - gb;
            let d = 0;
            if (ga === 0) d = r50(b.met.lucroH) - r50(a.met.lucroH) || r50(a.met.ouroH) - r50(b.met.ouroH) || (a.nPocao || 0) - (b.nPocao || 0) || a.nSlots - b.nSlots;
            else if (ga === 1) d = b.met.xpH - a.met.xpH;
            else d = r50(b.met.LCB) - r50(a.met.LCB) || b.met.xpH - a.met.xpH;
            return d || (a.sig < b.sig ? -1 : a.sig > b.sig ? 1 : 0);
        });
    }
    /* os `nObj` primeiros pelo objetivo + os `nDano` de mais dano/s do próprio
     * personagem (sem repetir; a poção só entra se ela aumentar esse dano) */
    function misturarTop(lista, eps, nObj, nDano, voc) {
        const vistos = new Set(), r = [];
        const por = (x) => { if (!vistos.has(x.sig)) { vistos.add(x.sig); r.push(x); } };
        const ord = ordenarInt(lista, eps);
        ord.slice(0, nObj).forEach(por);
        const dano = x => Math.round(x.sim.por[voc].danoS * 10);
        const xp = lista.slice().sort((a, b) => dano(b) - dano(a) || (a.nPocao || 0) - (b.nPocao || 0) || a.nSlots - b.nSlots || (a.sig < b.sig ? -1 : a.sig > b.sig ? 1 : 0));
        for (const x of xp) { if (r.length >= nObj + nDano) break; por(x); }
        for (const x of ord) { if (r.length >= nObj + nDano) break; por(x); }
        return r;
    }
    const scoreInt = (x) => x ? x.met.xpH * (okInt(x) ? 1 : 0.5) : 0;
    /* v2.14.11 — A MEDIDA VALE MAIS QUE A SIMULAÇÃO. Vampire hell, 04/10, nível 83: o Inteligente previu 70,2k xp/h para
     * o kit mínimo (1 magia por personagem), o Scan A/B mediu 62,0k com esse kit e 65,9k com o Em área — e o modelo seguia
     * no kit mínimo (a calibração só lê Scans de outros modelos). Agora todo Scan Inteligente limpo deste mapa (nível ±2,
     * ≥ 2 min) vira uma medida do kit que ele usou — reconhecido pelas magias e runas lançadas (razao.magias) — e, se
     * mediu ABAIXO do previsto, o kit sai da simulação com a medida: xp, abates e receita × f (o custo fica). Só para baixo:
     * medida acima do previsto não infla ninguém. A busca então prefere outro kit, e a histerese compara contra o medido. */
    /* a assinatura ignora RUNAS: uma runa com mínimo 2 pode não ser lançada num Scan de 4 min e a mesma party sairia
     * com outra assinatura (ao vivo o Em área medido não casou com o Em área simulado por causa do thunderstorm) */
    const sigNomesInt = (esc) => VOCS_INT.map(v => { const n = esc[v] ? esc[v].plano.filter(p => !p.av.m.isRune).map(p => String(p.av.m.name).toLowerCase()).sort() : []; return v[0] + ':' + (n.length ? n.join(',') : '-'); }).join(';');
    /* v2.14.17 — SÓ MAGIAS DE ATAQUE. O livro-razão anota todo `cast`, inclusive suporte e cura (Train Party, Enchant
     * Party, Magic Shield, Heal Party, Heal Friend…). Com os suportes do dono ligados a assinatura do Scan trazia esses
     * nomes, nunca casava com o kit e a medida NUNCA entrava — ao vivo (Petrified Hollow, 06/10) o Inteligente seguia
     * prevendo 80,5k para o kit que o Scan tinha medido a 67,0k. Magia fora do catálogo continua contando (como antes). */
    const _ehAtaqueCat = (nome) => { const c = (CAT.magias || []).find(x => x.name === nome); return !c || !c.group || c.group === 'attack'; };
    function sigNomesScan(r) {
        const por = {};
        for (const m of ((r && r.razao && r.razao.magias) || [])) { if (!m || m.runa || !(m.casts >= 1) || !m.voc || !m.nome || !_ehAtaqueCat(m.nome)) continue; (por[m.voc] = por[m.voc] || new Set()).add(String(m.nome).toLowerCase()); }
        return VOCS_INT.map(v => v[0] + ':' + (por[v] && por[v].size ? [...por[v]].sort().join(',') : '-')).join(';');
    }
    /* kit ↔ Scan: igual primeiro; senão, o Scan cujas magias LANÇADAS cabem no kit com no máximo uma magia por
     * personagem sem lançamento (Front Sweep ≥2 e Eternal Winter ≥2 do Em área não saíram em 5 min de Vampire hell e o
     * Em área medido a 69,1k ficava sem dono). Empate: o que deixa menos magias sem lançamento; depois o mais recente. */
    const setsDaSig = (sig) => sig.split(';').map(parte => new Set(parte.slice(2) === '-' ? [] : parte.slice(2).split(',')));
    function medidaDoKitInt(ctx, esc) {
        if (!ctx.medidoKit) return null;
        const sig = sigNomesInt(esc), exato = ctx.medidoKit[sig];
        if (exato) return exato;
        const kit = setsDaSig(sig);
        let melhor = null, faltam = Infinity;
        for (const [k, m] of Object.entries(ctx.medidoKit)) {
            const sc = setsDaSig(k);
            let total = 0, ok = true;
            for (let i = 0; i < kit.length && ok; i++) {
                for (const n of sc[i]) if (!kit[i].has(n)) { ok = false; break; }
                const f = kit[i].size - sc[i].size;
                if (f > 1 || (sc[i].size === 0 && kit[i].size > 0)) ok = false;
                total += f;
            }
            if (ok && (total < faltam || (total === faltam && (m.t || 0) > (melhor.t || 0)))) { melhor = m; faltam = total; }
        }
        return melhor;
    }
    function medidasPorKitInt(hunt) {
        const out = {};
        if (!hunt || hunt.boss) return out;
        const nv = nivelAtual();
        try {
            for (const r of Object.values(scanResultados())) {
                if (!r || r.id !== hunt.id || r.modelo === 'boss' || r.suja || r.erro || !(r.seg >= 120)) continue;
                if (nv && r.nivel && Math.abs(r.nivel - nv) > 2) continue;
                const xp = Number(r.xpRawH != null ? r.xpRawH : r.xpH); if (!(xp > 0)) continue;
                const k = sigNomesScan(r); if (/^(.:-;?)+$/.test(k)) continue;
                if (!out[k] || (r.t || 0) > out[k].t) out[k] = { xpRawH: Math.round(xp), t: r.t || 0 };
            }
        } catch (e) { }
        return out;
    }
    const escSig = (esc) => VOCS_INT.map(v => esc[v] ? v[0] + ':' + assinaturaPlano(esc[v].plano) + '|p' + (esc[v].pocao || 0) + '|' + (esc[v].sups || []).join('+') + (esc[v].com != null ? '|c' + esc[v].com : '') : v[0] + ':-').join(' ');

    /* a party inteira, 360 s. `regenMul` = {voc: ×regen} (cenários do passo E) */
    function avaliarPartyInt(ctx, esc, cont, regenMul) {
        const chave = escSig(esc) + (regenMul ? '|' + JSON.stringify(regenMul) : '');
        if (ctx.memo.has(chave)) return ctx.memo.get(chave);
        const train = !!(esc.KNIGHT && (esc.KNIGHT.sups || []).includes('Train Party'));
        const membros = VOCS_INT.filter(v => esc[v] && esc[v].plano.length).map(v => membroInt(v, esc[v], ctx, train, regenMul && regenMul[v]));
        if (cont) cont.party++;
        const sim = simularParty(membros, { L: ctx.L, hp: ctx.hp, E: ctx.E, seg: SIM_INT_SEG });
        const r = { esc: Object.assign({}, esc), sim, met: metricasInt(ctx, sim), seguro: seguroInt(ctx, membros, sim), membros, cenario: !!regenMul,
                    nSlots: VOCS_INT.reduce((s, v) => s + (esc[v] ? esc[v].plano.length : 0), 0), nPocao: VOCS_INT.filter(v => esc[v] && esc[v].pocao > 0).length, sig: escSig(esc) };
        if (!ctx._semMedida && ctx.medidoKit && r.met.xpH > 0) {
            const exato = medidaDoKitInt(ctx, esc);
            let med = exato || null;
            if (!med && ctx.tetoDe) { const teto = ctx.tetoDe(r.met.xpH); if (teto != null && r.met.xpH > teto) med = { xpRawH: teto, t: 0 }; }
            if (med && med.xpRawH < r.met.xpH) {
                const m = r.met, f = med.xpRawH / m.xpH;
                r.met = Object.assign({}, m, { xpH: m.xpH * f, abH: m.abH * f, receitaH: m.receitaH * f, lucroH: m.receitaH * f - m.custoH, LCB: m.LCB - (1 - f) * m.receitaH,
                                               medido: { xpRawH: med.xpRawH, previsto: Math.round(m.xpH), f: Math.round(f * 1000) / 1000, t: med.t, banda: !exato } });
            }
        }
        ctx.memo.set(chave, r);
        return r;
    }
    /* triagem (passos B e C): a party inteira, com os outros 3 fixos como
     * estão em `ref`, em SIM_TRIAGEM_SEG (120 s). (Com os outros como dano/s
     * constante a onda morria na chegada com qualquer barra — o burst de quem
     * lança a cada 2 s é o que diferencia uma barra da outra.) */
    function triagemInt(ctx, voc, plano, pocao, sups, ref, cont) {
        const esc = { plano, pocao, sups: sups || [] };
        /* memória por party de referência (chave curta; a assinatura da party é longa) */
        const memo = ref.tri || (ref.tri = new Map());
        const chave = voc + '|' + assinaturaPlano(plano) + '|' + pocao + '|' + (sups || []).join('+');
        if (memo.has(chave)) return memo.get(chave);
        /* v2.14.15 — o teto vale por simulação: a comparação "sem poção" abaixo é uma a mais, e as voltas do chamador só
         * conferem o teto ANTES de chamar (saía 6.001 com N_MAX_SIM = 6.000). */
        if (cont.sim >= N_MAX_SIM) return null;
        /* poção que nunca seria bebida (sem ela a mana não desce da marca e o
         * gasto médio cabe na regeneração — senão desceria depois dos 120 s) = a
         * mesma barra: não simula */
        if (pocao > 0) {
            const sem = triagemInt(ctx, voc, plano, 0, sups, ref, cont), x = sem && sem.sim.por[voc];
            if (x && x.manaMinFrac >= pocao && x.manaS <= sem.regenUtil + 1e-9) { memo.set(chave, null); return null; }
            if (cont.sim >= N_MAX_SIM) return null;
        }
        cont.sim++;
        const train = voc === 'KNIGHT' ? (sups || []).includes('Train Party') : !!(ref.esc.KNIGHT && (ref.esc.KNIGHT.sups || []).includes('Train Party'));
        const m = membroInt(voc, esc, ctx, train);
        const membros = ref.membros.filter(x => x.voc !== voc).concat([m]);
        const sim = simularParty(membros, { L: ctx.L, hp: ctx.hp, E: ctx.E, seg: SIM_TRIAGEM_SEG });
        const r = { esc, plano, pocao, sim, met: metricasInt(ctx, sim), seguro: seguroInt(ctx, [m], sim), nSlots: plano.length, nPocao: pocao > 0 ? 1 : 0, sig: assinaturaPlano(plano) + '|p' + pocao, regenUtil: m.regen };
        memo.set(chave, r);
        return r;
    }

    /* =========================================================================
     *  buscarParty — a busca inteira, com orçamento por CONTAGEM
     *    A candidatas · B barras × poção {não, 30 %} (triagem, as 16 melhores)
     *    C mínimos {1,2,3} (as 6 melhores) · D descida por coordenadas, 2
     *    rodadas D → S → P → K, × suportes permitidos (party inteira)
     *    E sem regeneração medida: as 3 finalistas com regen ×0,7/×1/×1,6,
     *      vence o maior mínimo de score ÷ melhor do cenário.
     *  Tetos N_MAX_SIM (triagens) e N_MAX_PARTY (party inteira): estourou,
     *  fica o melhor até ali.
     * ====================================================================== */
    function buscarParty(ctx) {
        const cont = { sim: 0, party: 0 }, eps = ctx.eps;
        const atual = {};
        for (const v of VOCS_INT) if (ctx.inicial[v] && ctx.inicial[v].plano.length) atual[v] = ctx.inicial[v];
        let ref = avaliarPartyInt(ctx, atual, cont);
        const inicial = ref;
        /* v2.13.2 — o Em área entra na escolha global e, se for melhor que o vigente, vira o ponto de partida */
        if (ctx.area) {
            const area = {};
            for (const v of VOCS_INT) if (ctx.area[v] && ctx.area[v].plano.length) area[v] = ctx.area[v];
            const ra = avaliarPartyInt(ctx, area, cont);
            if (ra !== ref && ordenarInt([ref, ra], eps)[0] === ra) ref = ra;
        }
        /* v2.14.0 — o kit da comunidade do mapa também entra na escolha global (e vira ponto de partida se ganhar) */
        if (ctx.comunidade) {
            const rc = avaliarPartyInt(ctx, ctx.comunidade, cont);
            if (rc !== ref && ordenarInt([ref, rc], eps)[0] === rc) ref = rc;
        }
        /* B + C de um personagem contra a party de referência `ref` (a atual).
         * 1ª rodada: todas as barras (B), as 16 melhores ganham as variações de
         * mínimo (C). 2ª rodada: só o que passou pelo C é triado de novo, contra
         * a party que mudou. Saem 24 (16 pelo objetivo + 8 de mais dano próprio)
         * para a party inteira decidir. */
        const vistosC = {};
        const triar = (voc) => {
            const cands = ctx.cands[voc] || [];
            if (!cands.length) return [];
            const pocoes = ctx.semPocao ? [0] : [0, 0.3];
            const vars = [];
            if (!vistosC[voc]) {
                const avals = [];
                for (const plano of barrasDe(cands, ctx.L)) {
                    for (const pocao of pocoes) { if (cont.sim >= N_MAX_SIM) break; const x = triagemInt(ctx, voc, plano, pocao, [], ref, cont); if (x) avals.push(x); }
                }
                if (!avals.length) return [];
                /* a triagem simula 120 s e, com a party forte, a onda morre quase
                 * igual com qualquer barra: além dos melhores pelo objetivo passam
                 * os de mais dano PRÓPRIO */
                const top16 = misturarTop(avals, eps, 8, 8, voc);
                vars.push(...top16);
                for (const x of top16) {
                    for (const pl of variacoesMinimos(x.plano, ctx.L)) {
                        if (cont.sim >= N_MAX_SIM) break;
                        const y = barraValida(pl, ctx.L) ? triagemInt(ctx, voc, pl, x.pocao, [], ref, cont) : null;
                        if (y) vars.push(y);
                    }
                }
                vistosC[voc] = vars.map(x => ({ plano: x.plano, pocao: x.pocao }));
            } else {
                for (const x of vistosC[voc]) { if (cont.sim >= N_MAX_SIM) break; const y = triagemInt(ctx, voc, x.plano, x.pocao, [], ref, cont); if (y) vars.push(y); }
            }
            return misturarTop(vars, eps, 16, 8, voc);
        };
        /* D. descida por coordenadas: a cada personagem a triagem é refeita
         * contra a party como ela está (na 2ª rodada os outros já mudaram) */
        const finalistas = {};
        for (let rodada = 0; rodada < 2; rodada++) {
            for (const voc of ORDEM_DESCIDA) {
                const top = triar(voc);
                if (!top.length) continue;
                const opts = atual[voc] ? [ref] : [];
                for (const x of top) {
                    for (const sups of (ctx.enxAtivo ? [[]] : suportesPermitidos(voc, ctx.hunt))) {
                        if (cont.party >= N_MAX_PARTY) break;
                        opts.push(avaliarPartyInt(ctx, Object.assign({}, atual, { [voc]: { plano: x.plano, pocao: x.pocao, sups } }), cont));
                    }
                }
                if (!opts.length) continue;
                const ord = ordenarInt(opts, eps);
                atual[voc] = ord[0].esc[voc]; ref = ord[0];
            }
        }
        /* a escolha é GLOBAL: entre todas as parties inteiras simuladas (o ponto
         * de partida incluído), a 1ª pelo objetivo. A descida só explora — a
         * faixa de ε passo a passo ia cedendo 3 % a cada personagem. */
        const todas = [...ctx.memo.values()].filter(x => x && x.membros && !x.cenario);
        const melhor = ordenarInt(todas, eps)[0];
        for (const v of VOCS_INT) { if (melhor.esc[v]) atual[v] = melhor.esc[v]; else delete atual[v]; }
        const mesmoFora = (x, voc) => VOCS_INT.every(v => v === voc || (!x.esc[v] && !atual[v]) || (x.esc[v] && atual[v] && escSig({ [v]: x.esc[v] }) === escSig({ [v]: atual[v] })));
        for (const v of VOCS_INT) finalistas[v] = ordenarInt(todas.filter(x => x.esc[v] && mesmoFora(x, v)), eps).slice(0, 3);
        /* E. regeneração sem medida: robustez */
        for (const voc of VOCS_INT) {
            if (ctx.voc[voc] && ctx.voc[voc].regenMedida) continue;
            const fin = finalistas[voc];
            if (!fin || fin.length < 2) continue;
            const cen = [0.7, 1, 1.6], sc = fin.map(() => []);
            for (const mult of cen) {
                const xs = fin.map(f => { if (cont.party >= N_MAX_PARTY) return null; return avaliarPartyInt(ctx, Object.assign({}, atual, { [voc]: f.esc[voc] }), cont, { [voc]: mult }); });
                if (xs.some(x => !x)) break;
                const melhor = Math.max(1e-9, ...xs.map(scoreInt));
                xs.forEach((x, i) => sc[i].push(scoreInt(x) / melhor));
            }
            if (sc[0].length !== cen.length) continue;
            let iMelhor = 0;
            const minimo = sc.map(l => Math.min(...l));
            for (let i = 1; i < fin.length; i++) if (minimo[i] > minimo[iMelhor] + 0.005) iMelhor = i;
            atual[voc] = fin[iMelhor].esc[voc];
        }
        /* o ponto de partida (vigente ou Em área) está em `todas`: a busca nunca sai pior que ele */
        const final = avaliarPartyInt(ctx, atual, cont);
        if (!inicial) throw new Error('Inteligente: sem party de partida');
        for (const v of Object.keys(final.esc)) final.esc[v].plano.forEach((p, j) => { if (slotMorto(final.esc[v].plano, j, ctx.L)) throw new Error('Inteligente: slot morto na saída (' + v + ' ' + p.av.m.name + ')'); });
        return { final, cont, aviso: okInt(final) ? null : 'não se paga: nenhum kit passou no piso de lucro — ficou o de maior lucro garantido' };
    }

    /* HISTERESE: troca só se o novo for (1 + m)× melhor que o vigente
     * reavaliado agora (m = 3 % com tudo medido, 5 % com algo estimado), ou se
     * o vigente ficou inviável; nada nos 10 min depois de um APLICAR. */
    function decidirTroca(o) {
        if (o.tAplicar != null && o.agora - o.tAplicar < HISTERESE_INT.esperaMs) return { acao: 'ESPERAR', ganho: null };
        const ganho = o.scoreVigente > 0 ? o.scoreNovo / o.scoreVigente - 1 : null;
        if (o.vigenteViavel === false && o.novoViavel !== false) return { acao: 'TROCAR', ganho, motivo: 'o kit aplicado ficou inviável' };
        const m = o.tudoMedido ? HISTERESE_INT.medido : HISTERESE_INT.estimado;
        return o.scoreNovo > o.scoreVigente * (1 + m) ? { acao: 'TROCAR', ganho } : { acao: 'MANTER', ganho };
    }

    /* ---- contexto: tudo que a busca lê, quantizado (mesma entrada → mesma saída) ---- */
    const _intCtx = new Map(), _intParty = new Map(), _intMostrado = new Map();
    const INT_CTX_TTL_MS = 1500;
    function mediaMonstros(hunt, k) {
        const w = hunt.monsters.reduce((s, m) => s + (m.weight || 1), 0) || 1;
        return hunt.monsters.reduce((s, m) => s + (Number(m[k]) || 0) * (m.weight || 1), 0) / w;
    }
    function kitVigenteInt(hunt) {
        const g = ler('kit_int', {}) || {};
        const r = {};
        for (const v of VOCS_INT) { const x = g[hunt.id + '|' + v]; if (x) r[v] = x; }
        return r;
    }
    function lootMedidoInt(hunt) {
        let melhor = null;
        try { for (const r of Object.values(scanResultados())) if (r && r.id === hunt.id && r.kills >= 100 && r.loot != null && (!melhor || r.kills > melhor.kills)) melhor = r; } catch { }
        return melhor ? melhor.loot / melhor.kills : null;
    }
    function contextoInt(hunt, opc) {
        opc = opc || {};
        const chaveCtx = hunt.id + '|' + JSON.stringify(opc);
        const c0 = _intCtx.get(chaveCtx);
        if (c0 && Date.now() - c0.t < INT_CTX_TTL_MS) return c0.ctx;
        const info = notasElementos(hunt);
        if (!info) return null;
        const L = lureMax(hunt), hp = mediaMonstros(hunt, 'health'), xpAbate = mediaMonstros(hunt, 'experience');
        const med = indiceMedicoes(hunt);
        const danosPorVoc = {};
        for (const v of VOCS_INT) danosPorVoc[v] = danosConhecidos(v, null, true);
        const calib = calibracaoInt(hunt, med, info, L, danosPorVoc);
        const ritmo = ritmoOndas(hunt);
        const loot0 = LOOT_CACHE[hunt.id], lootMed = lootMedidoInt(hunt);
        const escada = escadaDefesa(hunt);
        const mp = listaPocoes('mana').find(p => p.n === melhorPocao('mana', 'DRUID', nivelAtual() || 1)) || { custo: 56, media: 100 };
        const modoXp = ler('int_modo', 'lucro') === 'xp';
        /* v2.14.0 — kit enxuto: degrau 0–2 tira os suportes e as curas por magia do dono; o 3 é o kit dele */
        const enxuto = opc.enxuto != null ? !!opc.enxuto : !!ler('int_enxuto', false);
        /* v2.14.2 — `degrauEnx` fixa o degrau (o ranking do Radar: mapa nunca caçado não tem medida e cairia no 3) */
        const escEnx = !enxuto ? null : opc.degrauEnx != null
            ? { degrau: opc.degrauEnx, base: opc.degrauEnx, motivo: 'degrau fixo do ranking do Radar', pior: null, medido: false, alerta: false } : escadaEnxuta(hunt);
        const ctx = {
            hunt, info, L, hp, xpAbate, med, calib, fForma: opc.fracao ? {} : calib.f, fFormaN: calib.n, fracao: opc.fracao || null,
            E: qPasso(ritmo.esperaS, 0.5), eta: 1, kCalib: 1,
            loot: lootMed != null ? Math.round(lootMed * 10) / 10 : loot0 != null ? loot0 : 0, lootMedido: lootMed != null,
            eps: opc.eps != null ? opc.eps : modoXp ? EPS_INT_XP : EPS_INT, modoXp, semPocao: !!opc.semPocao,
            enxuto, escEnx, enxAtivo: !!(escEnx && escEnx.degrau < 3), comunidade: null,
            escada, defesa: {}, voc: {}, av: {}, porNome: {}, cands: {}, cVoc: {}, memo: new Map(),
            pocao: { mana: Math.round(mp.media) || 100, ouro: mp.custo || 56 }, basico: {}
        };
        const sk = (ESTADO_WS.sk || ler('skills_vistas', {}) || {});
        /* golpe do Knight e tiro do Paladino (wiki /como-o-dano-e-calculado):
         * nível/5 + 0,0425 × ataque × corpo a corpo (0,045 × munição × distância)
         * − 0,75 × (armadura + defesa), no elemento físico. Arma 33 e flecha 25
         * quando não há leitura (TIBIDLE.md). v2.13.1 — no simulador o golpe leva
         * × K_BASICO (0,3: ~15 medido por golpe), não mais o K_VIVO. */
        const lvlB = nivelAtual() || 1, red = reducaoFisicaMedia(hunt), nF = (info.notas.COMBAT_PHYSICALDAMAGE != null ? info.notas.COMBAT_PHYSICALDAMAGE : 100) / 100;
        ctx.basico.KNIGHT = q5pct(Math.max(1, lvlB / 5 + 0.0425 * 33 * ((sk.KNIGHT && sk.KNIGHT.melee) || 30) - red) * nF);
        ctx.basico.PALADIN = q5pct(Math.max(1, lvlB / 5 + 0.045 * 25 * ((sk.PALADIN && sk.PALADIN.dist) || 33) - red) * nF);
        for (const v of VOCS_INT) {
            const md = manaDoPersonagem(v), rm = opc.regen && opc.regen[v] != null ? opc.regen[v] : regenMedida(v);
            ctx.voc[v] = { manaMax: qPasso(md.manaMax, 10), regen: Math.round(rm != null ? rm : REGEN_MANA_S[v] || 8), regenMedida: rm != null,
                           reserva: opc.reserva && opc.reserva[v] != null ? opc.reserva[v] : ctx.enxAtivo ? reservaEnx(v, escEnx.degrau) : reservaCura(v, hunt),
                           skill: v === 'KNIGHT' ? (sk.KNIGHT && sk.KNIGHT.melee) || 30 : (sk.PALADIN && sk.PALADIN.dist) || 33 };
            ctx.defesa[v] = ctx.enxAtivo ? [] : suportesDefesa(v, hunt, escada.degrau);
            /* suporte de defesa só em slot LIVRE do dono (nunca tira o dele) */
            const sd = ctx.enxAtivo ? null : suportesDono(v);
            if (sd) ctx.defesa[v] = ctx.defesa[v].filter(x => !sd.includes(x)).slice(0, Math.max(0, 2 - sd.length));
            const ml = mlAtual(v);
            const avs = magiasDaVocacao(v).map(m => avaliar(m, hunt, info, v, danosPorVoc[v]));
            avs.forEach(a => { a.semML = !!(a.m.isRune && a.m.magicLevel > 0 && ml != null && ml < a.m.magicLevel); reguaInt(a, v, ctx); });
            ctx.av[v] = avs.sort((a, b) => b.porLancInt - a.porLancInt || (a.m.name < b.m.name ? -1 : 1));
            ctx.porNome[v] = Object.fromEntries(avs.map(a => [a.m.name, a]));
            ctx.cands[v] = candidatasInt(v, avs, info);
        }
        /* ponto de partida da busca: o kit aplicado pelo Inteligente; senão o Em área (com a poção do jogo) */
        const vig = kitVigenteInt(hunt);
        ctx.vigente = {};
        for (const v of VOCS_INT) {
            const x = vig[v];
            if (x && x.plano && x.plano.every(([n]) => ctx.porNome[v][n])) ctx.vigente[v] = Object.assign({ plano: x.plano.map(([n, mi]) => ({ av: ctx.porNome[v][n], minimo: mi })), pocao: x.pocao || 0, sups: supsGuardado(ctx, v, x) }, x.com != null ? { com: x.com } : {});
        }
        ctx.inicial = {};
        /* v2.13.2 — a party do Em área é SEMPRE avaliada (antes só entrava sem kit guardado: com o kit
         * fraco da 2.13.0 em `kit_int`, a busca partia dele e nunca via o Em área — 57,6k × 59,4k ao vivo) */
        ctx.area = {};
        for (const v of VOCS_INT) ctx.area[v] = escolhaDoModelo('area', hunt, v, ctx);
        for (const v of VOCS_INT) ctx.inicial[v] = ctx.vigente[v] || ctx.area[v];
        /* v2.14.0 — o kit da comunidade do mapa (magia que não existe no nível ou slot morto: fica o Em área daquele personagem) */
        const sem = KITS_COMUNIDADE[hunt.id];
        if (sem) {
            const esc = {};
            let n = 0;
            const lvlS = nivelAtual();
            for (const v of VOCS_INT) {
                /* v2.14.1 — magia que o nível ainda não libera sai do kit (as outras ficam) */
                const k = (sem.kits[v] || []).filter(([nome]) => ctx.porNome[v][nome]);
                const plano = k.length ? k.map(([nome, mi]) => ({ av: ctx.porNome[v][nome], minimo: Math.max(1, Math.min(mi, L)) })) : null;
                /* v2.14.15 — kit do post só com ≥2 (ou que ficou assim depois do filtro): com 1 monstro vivo nada
                 * dispararia — a última cai para ≥1, como no planejar */
                if (plano && !plano.some(p => p.minimo <= 1)) plano[plano.length - 1].minimo = 1;
                /* no enxuto o kit da comunidade leva os buffs do post; fora dele, os suportes do dono como sempre */
                const sups = ctx.enxAtivo ? ((sem.sups && sem.sups[v]) || []).filter(x => temMagia(x, v, lvlS)).slice(0, 2) : supsDoCtx(ctx, v);
                if (plano && !plano.some((p, j) => slotMorto(plano, j, L))) { esc[v] = { plano, pocao: ctx.semPocao ? 0 : pocaoDoKit(sem, v), sups, com: hunt.id }; n++; }
                else if (ctx.area[v] && ctx.area[v].plano.length) esc[v] = ctx.area[v];
            }
            if (n) ctx.comunidade = esc;
        }
        calibrarPorScan(ctx);
        /* v2.14.11 — kits medidos (qualquer modelo) e o que a simulação prevê para cada um: a BANDA DE EMPATE. Ao vivo o
         * modelo contornou a medida exata trocando só a magia do Druida (Ice Wave por Strong Ice Wave) e previu os mesmos
         * 70,2k. Kit não medido que a simulação não distingue (±3 %) de um medido herda a PIOR medida da banda. */
        ctx.medidoKit = medidasPorKitInt(hunt); // v2.14.11 (o previsto de cada kit medido entra depois, com o vigente e os modelos)
        ctx.tudoMedido = VOCS_INT.every(v => ctx.voc[v].regenMedida) && ctx.lootMedido;
        const aplic = (ler('int_aplicado', {}) || {})[hunt.id] || null;
        ctx.tAplicar = aplic;
        /* v2.14.11 — o que a simulação prevê para cada kit MEDIDO: só com o kit real (o vigente, o Em área ou outro modelo
         * com as mesmas magias). Reconstruir pelos nomes subestimava (mínimo 1, sem poção). Se algum medido ficou ABAIXO do
         * previsto, a simulação é otimista neste mapa: nenhum kit não medido passa de 99 % do melhor medido (o 1 % deixa o
         * medido ganhar o empate). Ao vivo o modelo contornou a medida exata com Ice Wave (70,2k) e depois com
         * Berserk+Groundshaker/Chill Out (67,9k) contra 65,9k do Em área medido. */
        {
            const cands = [];
            if (Object.keys(ctx.vigente).length) cands.push(ctx.vigente);
            if (ctx.area && Object.keys(ctx.area).length) cands.push(ctx.area);
            for (const mod of ['equilibrado', 'economica']) { try { const e = {}; for (const v of VOCS_INT) { const x = escolhaDoModelo(mod, hunt, v, ctx); if (x && x.plano.length) e[v] = x; } if (Object.keys(e).length) cands.push(e); } catch (e) { } }
            for (const m of Object.values(ctx.medidoKit)) delete m.previsto;
            ctx._semMedida = true;
            for (const esc of cands) {
                const m = medidaDoKitInt(ctx, esc);
                if (!m || m.previsto) continue;
                try { const x = avaliarPartyInt(ctx, esc, { sim: 0, party: 0 }); if (x && x.met.xpH > 0) m.previsto = Math.round(x.met.xpH); } catch (e) { }
            }
            ctx._semMedida = false;
            ctx.memo.clear();
            const otimista = Object.values(ctx.medidoKit).some(m => m.previsto > 0 && m.xpRawH < m.previsto);
            ctx.medidoTeto = otimista ? Math.max(...Object.values(ctx.medidoKit).map(m => m.xpRawH)) * 0.99 : null;
            /* kit não medido herda a medida do kit medido que a simulação põe logo acima dele (ou empatado, ±1 %): a
             * ordem da simulação vale, o tamanho não. Acima de todos os medidos: 99 % do melhor medido. */
            ctx.tetoDe = (xpSim) => {
                if (!(ctx.medidoTeto > 0)) return null;
                let teto = null;
                for (const m of Object.values(ctx.medidoKit)) if (m.previsto > 0 && m.previsto >= xpSim * 0.99 && (teto == null || m.xpRawH < teto)) teto = m.xpRawH;
                return teto != null ? teto : ctx.medidoTeto;
            };
        }
        const danosK = VOCS_INT.map(v => Object.keys(danosPorVoc[v]).sort().map(k => k + q5pct((danosPorVoc[v][k].min + danosPorVoc[v][k].max) / 2)).join(',')).join(';');
        ctx.carimbo = _hash(JSON.stringify([nivelAtual(), _hash(danosK), _hash(JSON.stringify(ctx.medidoKit || {})), L, ctx.E, ctx.loot, ctx.lootMedido, ctx.fForma, calib.kVoc, calib.kMagia, ctx.fracao, ctx.eps, escada.degrau, ctx.defesa, ctx.kCalib, ctx.cVoc, ctx.curaPorVivo,
            VOCS_INT.map(v => [ctx.voc[v].manaMax, ctx.voc[v].regen, ctx.voc[v].reserva, mlAtual(v), ctx.cands[v].map(a => a.m.name + ':' + Math.round(a.porLancInt)).join(',')]),
            escSig(ctx.vigente), aplic != null && Date.now() - aplic < HISTERESE_INT.esperaMs, JSON.stringify(opc),
            VOCS_INT.map(v => suportesDono(v)), // v2.13.5 — o dono trocou os suportes: a conta guardada não vale mais
            ctx.enxuto, escEnx ? escEnx.degrau : null, !!ctx.comunidade])); // v2.14.0 — kit enxuto e o degrau dele
        _intCtx.set(chaveCtx, { t: Date.now(), ctx });
        if (_intCtx.size > 40) _intCtx.delete(_intCtx.keys().next().value);
        return ctx;
    }
    /* o kit de um modelo antigo como escolha do simulador (régua única) */
    /* comoJogou (v2.14.0): a party como o Scan dela rodou, com os suportes do dono mesmo no enxuto (calibração, A/B) */
    function escolhaDoModelo(modelo, hunt, voc, ctx, comoJogou) {
        const r = montarPlano(modelo, hunt, voc);
        const plano = r && !r.erro ? r.plano.filter(p => ctx.porNome[voc][p.av.m.name]).map(p => ({ av: ctx.porNome[voc][p.av.m.name], minimo: p.minimo })) : [];
        /* v2.14.15 — o filtro pelas candidatas pode tirar justamente o slot ≥1 do plano (Pits of Inferno, Druida: Strong
         * Ice Wave ≥2 > avalanche ≥2 sem a de alvo único) — com 1 monstro vivo nada dispararia. Mesma regra do planejar:
         * sem nenhuma ≥1, a última cai para ≥1. */
        if (plano.length && !plano.some(p => p.minimo <= 1)) plano[plano.length - 1].minimo = 1;
        return { plano, pocao: manaPotionLigada(voc) ? 0.3 : 0, sups: comoJogou ? suportesDono(voc) || [] : supsDoCtx(ctx, voc) };
    }
    /* c_voc (gasto medido ÷ simulado, [0,2; 1,5]) e k_calib (abates medidos ÷
     * previstos, [0,7; 1,3]) pelo Scan deste mapa com um modelo antigo */
    /* v2.13.4 — ouro de poção de VIDA num {nome: quantidade} (supVoc do Scan) pelo preço do catálogo */
    function ouroVidaItens(itens) {
        const preco = {};
        for (const p of listaPocoes('vida')) preco[String(p.n).toLowerCase()] = p.custo || 0;
        let o = 0;
        for (const [n, q] of Object.entries(itens || {})) { const c = preco[String(n).toLowerCase()]; if (c != null) o += c * (Number(q) || 0); }
        return o;
    }
    function calibrarPorScan(ctx) {
        let sc = null, curaTotH = 0;
        ctx.curaPorVivo = 0;
        try { for (const r of Object.values(scanResultados())) if (r && r.id === ctx.hunt.id && r.abatesH > 0 && r.seg >= 120 && MODELOS[r.modelo] && r.modelo !== 'inteligente' && r.modelo !== 'boss' && (!sc || r.seg > sc.seg)) sc = r; } catch { }
        for (const v of VOCS_INT) ctx.cVoc[v] = 1;
        if (!sc) return;
        const esc = {};
        for (const v of VOCS_INT) { const e = escolhaDoModelo(sc.modelo, ctx.hunt, v, ctx, true); if (e.plano.length) esc[v] = e; }
        const x = avaliarPartyInt(ctx, esc, null);
        ctx.memo.clear();
        if (x.met.abH > 0) ctx.kCalib = qPasso(Math.min(1.3, Math.max(0.7, sc.abatesH / x.met.abH)), 0.05);
        for (const v of VOCS_INT) {
            const s = x.sim.por[v], sv = sc.supVoc && sc.supVoc[v];
            const simH = s ? (s.ouroPocaoS + s.ouroRunaS) * 3600 : 0;
            const vidaV = sv ? ouroVidaItens(sv.itens) : 0; // v2.13.4: a poção de vida sai do ataque e vira o custo da cura
            curaTotH += vidaV / sc.seg * 3600;
            if (sv && sv.ouro != null && simH > 100) ctx.cVoc[v] = qPasso(Math.min(1.5, Math.max(0.2, ((sv.ouro - vidaV) / sc.seg * 3600) / simH)), 0.05);
        }
        /* ouro de cura por monstro·s vivo: o Scan pagou curaTotH com a party do Scan deixando os bichos vivos
         * x.sim.vivosOnda por onda. Kit que mata mais rápido deixa menos vivo e paga menos cura. */
        const ondasH = sc.abatesH / Math.max(1, ctx.L), vivo = (x.sim.vivosOnda || 0) * ctx.eta;
        if (curaTotH > 0 && vivo > 0 && ondasH > 0) ctx.curaPorVivo = Math.round(curaTotH / (vivo * ondasH) * 100) / 100;
    }

    /* v2.13.5 — o kit mostrado guardado como nomes ({voc: {plano: [[nome, mínimo]], pocao, sups}}) e de volta
     * para o contexto atual (null se alguma magia saiu do contexto: aí ele não concorre) */
    function guardavelInt(esc) {
        const g = {};
        for (const v of VOCS_INT) { const e = esc && esc[v]; if (e) g[v] = Object.assign({ plano: e.plano.map(p => [p.av.m.name, p.minimo]), pocao: e.pocao || 0, sups: (e.sups || []).slice() }, e.com != null ? { com: e.com } : {}); }
        return g;
    }
    function escDeGuardadoInt(ctx, g) {
        const esc = {};
        for (const v of VOCS_INT) {
            const x = g[v];
            if (!x) continue;
            if (!x.plano.every(([n]) => ctx.porNome[v][n])) return null;
            /* suportes: os do dono AGORA (como o vigente) — o guardado pode ser de antes de ele trocar */
            esc[v] = Object.assign({ plano: x.plano.map(([n, mi]) => ({ av: ctx.porNome[v][n], minimo: mi })), pocao: ctx.semPocao ? 0 : x.pocao || 0, sups: supsGuardado(ctx, v, x) }, x.com != null ? { com: x.com } : {});
        }
        return Object.keys(esc).length ? esc : null;
    }
    /* o novo só tira o mostrado com ganho real: > 1 % de xp, ou xp igual (−0,5 %) e lucro maior em
     * mais de 1k/h e 3 %; ou o mostrado ficou inviável */
    function ganhaDeVerdadeInt(novo, ant) {
        if (!okInt(ant)) return okInt(novo);
        if (!okInt(novo)) return false;
        const gx = ant.met.xpH > 0 ? novo.met.xpH / ant.met.xpH - 1 : 1;
        return gx > 0.01 || (gx > -0.005 && novo.met.lucroH - ant.met.lucroH > Math.max(1000, 0.03 * Math.abs(ant.met.lucroH)));
    }
    /* a busca da party (com o vigente e a histerese). `buscar` = pode calcular
     * (clique); sem ele devolve só o que já foi calculado. */
    function partyInt(hunt, buscar, opc) {
        if (!hunt || hunt.boss) return null;
        const chave = hunt.id + '|' + JSON.stringify(opc || {});
        const c = _intParty.get(chave);
        if (!buscar && !c) return null; // sem clique e sem conta anterior: nem o contexto é montado
        const ctx = contextoInt(hunt, opc);
        if (!ctx) return null;
        if (c && c.carimbo === ctx.carimbo) return c.res;
        if (!buscar) return c ? Object.assign({}, c.res, { desatualizado: true }) : null;
        const t0 = Date.now();
        const achado = buscarParty(ctx);
        let fica = achado.final, decisao = { acao: 'NOVO', ganho: null };
        const temVig = VOCS_INT.every(v => !ctx.cands[v].length || ctx.vigente[v]);
        if (temVig && Object.keys(ctx.vigente).length) {
            const vig = avaliarPartyInt(ctx, ctx.vigente, achado.cont);
            if (vig.sig === achado.final.sig) decisao = { acao: 'IGUAL', ganho: 0 };
            else {
                decisao = decidirTroca({ scoreVigente: scoreInt(vig), scoreNovo: scoreInt(achado.final), tudoMedido: ctx.tudoMedido, tAplicar: ctx.tAplicar, agora: Date.now(),
                                         vigenteViavel: okInt(vig), novoViavel: okInt(achado.final) });
                if (decisao.acao !== 'TROCAR') fica = vig;
            }
            decisao.vigente = vig;
        }
        /* v2.13.5 — sem kit aplicado, o kit MOSTRADO também tem histerese. Ao vivo (01/10, Vampire hell) 3
         * cliques em 3 s deram 3 kits: as medidas mexem um pouco a cada frame e a busca cai em kits com xp e
         * lucro iguais (só a ordem de 2 magias muda). O anterior fica enquanto o novo não ganhar de verdade. */
        const chaveM = chave + '|' + ctx.eps + (ctx.enxAtivo ? '|enx' + ctx.escEnx.degrau : ''), mostrado = _intMostrado.get(chaveM);
        if (decisao.acao === 'NOVO' && mostrado) {
            const esc = escDeGuardadoInt(ctx, mostrado);
            if (esc) {
                const ant = avaliarPartyInt(ctx, esc, achado.cont);
                if (ant.sig !== fica.sig && !ganhaDeVerdadeInt(fica, ant)) {
                    decisao = { acao: 'MOSTRADO', ganho: scoreInt(ant) > 0 ? scoreInt(fica) / scoreInt(ant) - 1 : null };
                    fica = ant;
                }
            }
        }
        _intMostrado.set(chaveM, guardavelInt(fica.esc));
        if (_intMostrado.size > 40) _intMostrado.delete(_intMostrado.keys().next().value);
        const res = { ctx, final: fica, novo: achado.final, decisao, cont: achado.cont, aviso: okInt(fica) ? null : achado.aviso,
                      escada: ctx.escada, escEnx: ctx.escEnx, ms: Date.now() - t0, carimbo: ctx.carimbo };
        _intParty.set(chave, { carimbo: ctx.carimbo, res });
        if (_intParty.size > 20) _intParty.delete(_intParty.keys().next().value);
        return res;
    }
    /* APLICAR: o kit aplicado vira o vigente do mapa (a histerese parte dele) */
    function registrarAplicacaoInt(hunt, res) {
        if (!hunt || !res || !res.final) return;
        const g = ler('kit_int', {}) || {};
        for (const v of VOCS_INT) { const e = res.final.esc[v]; if (e) g[hunt.id + '|' + v] = Object.assign({ plano: e.plano.map(p => [p.av.m.name, p.minimo]), pocao: e.pocao || 0, sups: e.sups || [], t: Date.now() }, e.com != null ? { com: e.com } : {}); }
        guardar('kit_int', g);
        const a = ler('int_aplicado', {}) || {}; a[hunt.id] = Date.now(); guardar('int_aplicado', a);
        const es = ler('escada', {}) || {}; const d = res.escada ? res.escada.degrau : 0;
        if (!es[hunt.id] || es[hunt.id].d !== d) { es[hunt.id] = { d, t: Date.now() }; guardar('escada', es); }
        /* v2.14.0 — o degrau do kit enxuto aplicado: a partir daqui a medida do mapa é dele (escadaEnxuta) */
        if (res.escEnx) {
            const ee = ler('escada_enx', {}) || {};
            if (!ee[hunt.id] || ee[hunt.id].d !== res.escEnx.degrau) { ee[hunt.id] = { d: res.escEnx.degrau, t: Date.now() }; guardar('escada_enx', ee); }
        }
        invalidarPlanos();
    }
    /* "replanejar do zero": esquece o kit vigente e a trava de 10 min do mapa */
    function zerarInt(hunt) {
        if (!hunt) return;
        const g = ler('kit_int', {}) || {};
        for (const v of VOCS_INT) delete g[hunt.id + '|' + v];
        guardar('kit_int', g);
        const a = ler('int_aplicado', {}) || {}; delete a[hunt.id]; guardar('int_aplicado', a);
        for (const k of [..._intMostrado.keys()]) if (k.startsWith(hunt.id + '|')) _intMostrado.delete(k);
        invalidarPlanos();
    }
    /* cura, poção, suporte e munição do personagem no kit escolhido */
    function extrasInt(voc, esc, res, hunt) {
        const lvl = nivelAtual(), d = res.escada ? res.escada.degrau : 1, mais = d >= 1 ? 10 : 0;
        const dono = configDono(voc);
        const enx = !!(res.ctx && res.ctx.enxAtivo);
        /* v2.14.1 — o personagem ficou com o kit da comunidade: vai o pacote do post (curas, poção de vida, buffs, munição) */
        const sem = enx && esc && esc.com != null ? KITS_COMUNIDADE[esc.com] || null : null;
        let heals = [];
        if (enx) {
            /* v2.14.0 — kit enxuto: as poções de vida do dono (ou a melhor a 45 %) + as curas da escada até o degrau */
            const vidaSem = sem && sem.vida && sem.vida[voc];
            if (vidaSem && listaPocoes('vida').some(p => p.n === vidaSem[0] && p.lvl <= lvl && (!p.voc || p.voc.includes(voc)))) heals.push({ name: vidaSem[0], percent: vidaSem[1] });
            else heals = ((dono && dono.heals) || []).filter(h => h && h.name && /potion/i.test(h.name)).map(h => ({ name: h.name, percent: h.percent != null ? h.percent : POCAO_VIDA_ENX }));
            if (!heals.length) { const vida = melhorPocao('vida', voc, lvl); if (vida) heals.push({ name: vida, percent: POCAO_VIDA_ENX }); }
            const curasSem = sem && sem.curas && sem.curas[voc];
            if (curasSem) { for (const [n, p] of curasSem) if (temMagia(n, voc, lvl)) heals.push({ name: n, percent: p }); }
            else for (let k = 1; k <= res.ctx.escEnx.degrau; k++) for (const [n, p] of ((CURAS_ENX[k] || {})[voc] || [])) if (temMagia(n, voc, lvl)) heals.push({ name: n, percent: p });
            heals.sort((a, b) => a.percent - b.percent); // o jogo dispara o 1º gatilho atingido: a cura forte (gatilho baixo) na frente
            heals = heals.slice(0, 5);
        } else if (dono) {
            /* v2.13.1 — as curas do dono ficam como estão (a escada não mexe nelas) */
            heals = (dono.heals || []).slice(0, 5).map(h => h && h.name ? { name: h.name, percent: h.percent != null ? h.percent : 60 } : null);
        } else {
            const vida = melhorPocao('vida', voc, lvl); if (vida) heals.push({ name: vida, percent: Math.min(95, POCAO_VIDA_INT + mais) });
            for (const [n, p] of (CURAS_INT[voc] || [])) if (temMagia(n, voc, lvl)) heals.push({ name: n, percent: Math.min(95, p + mais) });
            heals.sort((a, b) => a.percent - b.percent);
        }
        while (heals.length < 5) heals.push(null);
        const mp = melhorPocao('mana', voc, lvl);
        const pct = esc && esc.pocao ? Math.round(esc.pocao * 100) : (!enx && d >= 2 && voc === 'DRUID' ? 20 : 0);
        const manaPotion = mp && pct ? { name: mp, percent: pct } : { percent: 0 };
        const supports = enx ? (sem ? (esc.sups || []).slice(0, 2) : []) : [...new Set((suportesDono(voc) || (esc && esc.sups) || []).concat(res.ctx.defesa[voc] || []))].slice(0, 2);
        while (supports.length < 2) supports.push(null);
        const r = { heals, manaPotion, supports };
        if (voc === 'PALADIN') {
            const ro = rosterEquip(); const p = ro && ro.find(x => x.vocation === 'PALADIN');
            const tipo = (p && p.equipment && p.equipment.weapon && p.equipment.weapon.attrs && p.equipment.weapon.attrs.ammotype) || 'arrow';
            /* a munição do post só se a arma usa esse tipo (burst arrow com besta não atira) */
            const ammoSem = sem && sem.ammo && sem.ammo[voc];
            if (ammoSem && (MUNICAO[tipo] || []).some(a => a.n === ammoSem && a.lvl <= lvl)) r.ammo = ammoSem;
            else {
                const fp = ((ESTADO_WS.frame && ESTADO_WS.frame.party) || []).find(x => x.voc === 'PALADIN');
                r.ammo = melhorMunicao(tipo, lvl, lureMax(hunt), reducaoFisicaMedia(hunt), fp && fp.dist, (notasElementos(hunt) || {}).notasArea);
            }
        }
        return r;
    }
    /* montarPlano('inteligente', …) de UM personagem, tirado da party */
    /* v2.14.3 — `opc` = as opções da busca (o Scan rápido do Radar aplica o mesmo kit que o ranking simulou) */
    /* v2.14.5 — `pronto`: a party já calculada pelo APLICAR (os 4 saem da MESMA conta; ver _aplicarEmTodos) */
    function planejarInteligente(hunt, voc, buscar, opc, pronto) {
        const res = pronto || partyInt(hunt, buscar, opc || undefined);
        if (!res) return { plano: [], pendente: true, ranking: [], hunt, modelo: 'inteligente', extras: null, sim: null, mortos: [], viab: null, cortadas: 0 };
        const esc = res.final.esc[voc];
        const s = res.final.sim.por[voc];
        const plano = esc ? esc.plano.map((p, i) => ({ slot: i + 1, av: p.av, minimo: p.minimo, disparos: s ? s.disparos[i] : null })) : [];
        const sim = s ? { danoS: s.danoS, manaS: s.manaS, ouroS: s.ouroPocaoS + s.ouroRunaS, ouroPocaoS: s.ouroPocaoS, ouroRunaS: s.ouroRunaS,
                          runasS: plano.reduce((t, p, i) => t + (p.av.m.isRune ? (s.disparos[i] || 0) : 0), 0) / res.final.sim.seg, disparos: s.disparos } : null;
        return { plano, ranking: res.ctx.av[voc] || [], info: res.ctx.info, hunt, modelo: 'inteligente', cortadas: 0, viab: LOOT_CACHE[hunt.id] != null ? { loot: LOOT_CACHE[hunt.id] } : null,
                 naoCabe: !okInt(res.final), extras: extrasInt(voc, esc, res, hunt), sim, mortos: [], bebe: !!(esc && esc.pocao) || (!res.ctx.enxAtivo && res.escada.degrau >= 2 && voc === 'DRUID'),
                 int: { decisao: res.decisao.acao, ganho: res.decisao.ganho, met: res.final.met, aviso: res.aviso, medidoVig: res.decisao.vigente && res.decisao.vigente.met.medido || null, escada: res.escada, escEnx: res.escEnx || null, ms: res.ms, cont: res.cont, desatualizado: !!res.desatualizado,
                        sups: esc ? esc.sups || [] : [], pocao: esc ? esc.pocao || 0 : 0 } };
    }
    /* veredito do grupo no Inteligente: o lucro/h da party simulada */
    function viabilidadeInt(hunt) {
        const res = partyInt(hunt, false);
        if (!res || LOOT_CACHE[hunt.id] == null) return null;
        const f = res.final, m = f.met, porVoc = {}, pocoes = {};
        let danoS = 0;
        for (const v of VOCS_INT) {
            const e = f.esc[v], s = f.sim.por[v];
            if (!e || !s) { porVoc[v] = null; continue; }
            pocoes[v] = !!(e.pocao || (!res.ctx.enxAtivo && res.escada.degrau >= 2 && v === 'DRUID'));
            danoS += s.danoS;
            porVoc[v] = { magia: e.plano[0] ? e.plano[0].av.m.name : '', kit: e.plano.map((p, i) => `${p.av.m.name} ≥${p.minimo} ×${s.disparos[i]}`).join(' · '), dano: Math.round(s.danoS),
                          ouroH: Math.round((s.ouroPocaoS + s.ouroRunaS) * 3600), manaS: Math.round(s.manaS * 10) / 10,
                          runasH: Math.round(e.plano.reduce((t, p, i) => t + (p.av.m.isRune ? s.disparos[i] : 0), 0) / f.sim.seg * 3600), pocao: pocoes[v] };
        }
        const loot = res.ctx.loot, custoPorAbate = m.abH > 0 ? m.custoH / m.abH : 0;
        return { loot, hp: Math.round(res.ctx.hp), orcamento: Math.round(loot * MARGEM_LUCRO * 10) / 10, dOuroParty: null,
                 custoPorAbate: Math.round(custoPorAbate), custoSemFator: Math.round(custoPorAbate * 10) / 10, exigidoParty: null,
                 regen: VOCS_INT.every(v => !pocoes[v]), pocoes, cabe: okInt(f), lucroPorAbate: Math.round(loot - custoPorAbate),
                 danoS: Math.round(danoS), ouroH: Math.round(m.ouroH), porVoc, lucroH: Math.round(m.lucroH), xpH: Math.round(m.xpH), abatesH: Math.round(m.abH) };
    }
    /* a party de um modelo antigo pelo simulador novo (Scan A/B, testes de calibração) */
    function preverModeloInt(modelo, hunt, opc) {
        const ctx = contextoInt(hunt, opc);
        if (!ctx) return null;
        const esc = {};
        for (const v of VOCS_INT) { const e = escolhaDoModelo(modelo, hunt, v, ctx, true); if (e.plano.length) esc[v] = e; }
        return avaliarPartyInt(ctx, esc, null);
    }

    /* =========================================================================
     *  ⭐ v2.10 — BOSS POR DANO/SEGUNDO COM A MANA QUE HÁ (plano 2.11, item 3)
     *
     *  O Boss ordenava as magias por dano POR LANÇAMENTO e ignorava as runas:
     *    • sudden death (91 num boss) ficava de fora e Death Strike (38) entrava;
     *    • Rage of the Skies (600 de mana, 40 s) ia no slot 1 na frente de
     *      golpe melhor por segundo — e Rage + Hell's Core entravam JUNTAS,
     *      sendo que as duas são do grupo `focus` e uma bloqueia a outra 40 s;
     *    • strike atrás de strike, os dois ≥1: o segundo nunca saía.
     *  Agora: os candidatos (runa só se o ML do personagem alcança o
     *  `magicLevel` dela — sem ML lido, não exclui) são combinados em kits de
     *  até 4 (um por grupo secundário), cada kit em todas as ordens com os
     *  preenchimentos por último, e o simulador escolhe o que mais tira de vida
     *  do boss em 90 s com a mana que o personagem tem (poção: sem limite). */
    function melhorKitBoss(cands, ent) {
        const valor = a => a.porLancamento / Math.max(2, a.cd);
        const longas = cands.filter(a => !enchimento(a)).sort((a, b) => valor(b) - valor(a)).slice(0, 4);
        const ench = cands.filter(enchimento).sort((a, b) => b.porLancamento - a.porLancamento);
        const pool = longas.concat(ench.filter(a => a.m.isRune).slice(0, 1), ench.filter(a => !a.m.isRune).slice(0, 2));
        const o = Object.assign({ lure: 1, matarS: 1e6, esperaS: 0, seg: 90, pocao: ent.bebe }, ent.mana);
        /* empate (±0,5 %): menos ouro, depois menos slots, depois o mais forte
         * por lançamento na frente (Energy Beam e Great Fire Wave, as duas de
         * 4 s, saem alternadas em qualquer ordem — fica a de 60 na frente) */
        const ordemForte = k => k.reduce((s, a, i) => s + a.porLancamento * (4 - i), 0);
        const melhorQue = (x, y) => {
            if (!y) return true;
            const tol = Math.max(1e-6, y.danoS * 0.005);
            if (Math.abs(x.danoS - y.danoS) > tol) return x.danoS > y.danoS;
            if (Math.abs(x.ouroS - y.ouroS) > 1e-6) return x.ouroS < y.ouroS;
            if (x.ordem.length !== y.ordem.length) return x.ordem.length < y.ordem.length;
            return ordemForte(x.ordem) > ordemForte(y.ordem);
        };
        let melhor = null;
        for (let mask = 1; mask < (1 << pool.length); mask++) {
            const kit = pool.filter((_, i) => mask & (1 << i));
            if (kit.length > 4) continue;
            const g = kit.map(a => a.m.secondaryGroup).filter(Boolean);
            if (new Set(g).size < g.length) continue;
            const kl = kit.filter(a => !enchimento(a)), ke = kit.filter(enchimento);
            for (const pl of permutacoes(kl)) { for (const pe of permutacoes(ke)) {
                const plano = pl.concat(pe).map(a => ({ av: a, minimo: 1 }));
                if (plano.some((p, j) => slotMorto(plano, j, 1))) continue;
                const s = simularFila(slotsParaSimular(plano), o);
                const x = { ordem: plano.map(p => p.av), danoS: s.danoS, ouroS: s.ouroS };
                if (melhorQue(x, melhor)) melhor = x;
            } }
        }
        return melhor ? melhor.ordem : [];
    }

    /* =========================================================================
     *  v2.10 — PLANO EM CACHE (plano 2.11, item 11). A aba Magia chamava
     *  montarPlano 9× por render (1 + 4 fichas + 4 do veredito), e cada uma
     *  reparseava a tabela de danos ~20× (uma por magia). A chave junta o que
     *  muda o plano: modelo, mapa, vocação, nível, a tabela de danos, a mana e
     *  a vida medidas, o regime, medições do mapa, loot, bestiário, ML, ritmo
     *  da onda e os catálogos. O resto (arma do Paladino, frame) vence em 5 s.
     *  Quem aprende dano (anotarDano, pedirReleituraDeDanos) limpa na hora.
     * ====================================================================== */
    const _planos = new Map();
    let _planosCat = [];
    const PLANO_TTL_MS = 5000;
    const VOCS_PLANO = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'];
    /* v2.12.0 — o contexto do Inteligente cai junto; a party já calculada fica
     * (vira "desatualizada" se as entradas mudaram — recalcular é no clique) */
    function invalidarPlanos() { _planos.clear(); _intCtx.clear(); }
    const _hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
    function entradasDoPlano(modelo, hunt, voc) {
        const bruto = ler(chaveDano(voc), {});
        /* v2.10 — QUEM BEBE POÇÃO (plano 2.11, item 4): os modelos antigos não
         * mexem em poção, então vale o que está no jogo. v2.12.0 — o Inteligente
         * não passa mais por aqui (planejarInteligente): "sobrando",
         * "spawnLimita" e "bebe" saíram dele; o carimbo dele é quantizado
         * (contextoInt). */
        const bebe = !!manaPotionLigada(voc);
        const med = indiceMedicoes(hunt);
        const manaMed = hunt ? manaMedidaMedia(hunt, voc) : null;
        const vidaMin = hunt && voc === 'KNIGHT' ? vidaMinMedida(hunt, voc) : null;
        const ml = mlAtual(voc), ritmo = ritmoOndas(hunt), mana = manaDoPersonagem(voc);
        const nBest = hunt && hunt.monsters ? hunt.monsters.filter(m => BESTIARIO[m.name]).length : 0;
        const medK = Object.keys(med).sort().map(k => k + med[k].casts + ':' + med[k].porCast).join(',');
        const danosK = Object.keys(bruto).sort().map(k => { const x = bruto[k] || {}; return k + x.min + '-' + x.max + '@' + x.nivel + (x.ml != null ? 'm' + x.ml : ''); }).join(',');
        const carimbo = [nivelAtual(), _hash(danosK), bebe ? 1 : 0, manaMed, vidaMin, ml, hunt ? LOOT_CACHE[hunt.id] : null, nBest,
                         _hash(medK), ritmo.matarS.toFixed(1), ritmo.esperaS.toFixed(1), mana.manaMax, mana.regen].join('|');
        return { bruto, bebe, med, manaMed, ml, ritmo, mana, carimbo };
    }
    function copiarResultado(r) {
        if (!r || r.erro) return r;
        return Object.assign({}, r, { plano: r.plano.map(p => Object.assign({}, p)), extras: r.extras ? JSON.parse(JSON.stringify(r.extras)) : r.extras });
    }
    /* v2.12.0 — `opcoes.buscar`: o Inteligente só CALCULA quando o chamador
     * é um clique (CALCULAR, APLICAR, Scan ligado); o desenho da tela e o
     * handler de frame recebem só o que já foi calculado (ou `pendente`). */
    function montarPlano(modelo, hunt, vocForcada, opcoes) {
        const voc = vocForcada || vocacaoAtual();
        if (!hunt) return { erro: 'não achei as resistências dessa hunt no catálogo' };
        const cat = [CAT.magias, CAT.precos, CAT.pocoes, CAT.bosses, CAT.municao, _ammoCat];
        /* v2.14.5 — catálogo de munição (/ammo, CAT.municao) chegando NÃO derruba a party do Inteligente: ele só muda a
         * munição (extrasInt), não a busca. Ao vivo (02/10, Orc Fortress): o /ammo chegou no meio do APLICAR, entre o
         * Paladino e o Feiticeiro, apagou a conta e o Feiticeiro e o Druida saíram com "plano vazio". */
        if (cat.some((x, i) => x !== _planosCat[i])) {
            const busca = cat.slice(0, 4).some((x, i) => x !== _planosCat[i]);
            _planos.clear();
            if (busca) { _intCtx.clear(); _intParty.clear(); }
            _planosCat = cat;
        }
        if (modelo === 'inteligente') {
            if (hunt.boss || !notasElementos(hunt)) return { erro: hunt.boss ? 'o Inteligente é para caçada (no boss use o modelo Boss)' : 'não achei as resistências dessa hunt no catálogo' };
            return copiarResultado(planejarInteligente(hunt, voc, !!(opcoes && opcoes.buscar), opcoes && opcoes.opcInt, opcoes && opcoes.resInt));
        }
        const ent = entradasDoPlano(modelo, hunt, voc);
        const chave = [modelo, hunt.id, voc, ent.carimbo].join('|');
        const c = _planos.get(chave);
        if (c && Date.now() - c.t < PLANO_TTL_MS) return copiarResultado(c.r);
        const r = planejar(modelo, hunt, voc, ent);
        if (_planos.size >= 80) _planos.delete(_planos.keys().next().value);
        _planos.set(chave, { t: Date.now(), r });
        return copiarResultado(r);
    }
    function planejar(modelo, hunt, voc, ent) {
        const info = notasElementos(hunt);
        if (!info) return { erro: 'não achei as resistências dessa hunt no catálogo' };
        info.med = ent.med;
        const danos = danosConhecidos(voc, ent.bruto, true);

        const avaliadas = magiasDaVocacao(voc).map(m => avaliar(m, hunt, info, voc, danos))
            .sort((a, b) => b.danoEfetivo - a.danoEfetivo); // RANKING IMUTÁVEL

        if (!avaliadas.length) return { erro: 'nenhuma magia de ataque elegível' };
        /* v2.10 (item 3) — runa que o ML do personagem não alcança não entra
         * (sudden death pede 15). Sem ML lido, não exclui. */
        avaliadas.forEach(a => { a.semML = !!(a.m.isRune && a.m.magicLevel > 0 && ent.ml != null && ent.ml < a.m.magicLevel); });

        /* PISO DE POTÊNCIA (lição da v2.24.0 do Stonegy): sem piso, qualquer
         * magia com a "forma certa" ganhava slot, e o script chegou a pôr a
         * versão fraca de uma magia na frente da forte.
         *
         * ⚠ E O PISO SÓ OLHA QUEM TEM DANO CONFIÁVEL. Sem isso, magia não
         * medida entra com o chute do fallback e vence de quem foi medido —
         * visto em 30/08: o plano do Feiticeiro veio com 4 runas de área só
         * porque o chute de 30 de dano era multiplicado por 7 alvos.
         * Sem medição a magia não compete; fica reservada pro fim da fila.
         * v2.10 — o piso de 25 % (`viavel`) nunca chegou a ser usado e saiu;
         * o que corta é o de 10 % abaixo. */
        const confiaveis = avaliadas.filter(a => a.confiavel);
        const base = confiaveis.length ? confiaveis : avaliadas;
        const melhorLanc = Math.max(...base.map(a => a.porLancamento));

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
         * melhor) NÃO entra em slot nenhum. Slot vazio não gasta mana.
         * v2.10 — área olha o veto ponderado (vetosArea, item 6); alvo único,
         * o estrito. Runa sem ML também é cortada. */
        const vetoDe = a => (a.casas > 1 ? info.vetosArea : info.vetos)[a.m.combatType];
        const morta = a => vetoDe(a) != null
            || a.danoEfetivo <= 0
            || a.porLancamento < melhorLanc * 0.10
            || a.semML;
        avaliadas.forEach(a => { a.morta = morta(a); });
        const vivas = avaliadas.filter(a => !a.morta);

        // teto de gasto: preenche danoPorOuroReal / cabeNoOrcamento em cada magia
        const viab = viabilidade(hunt, avaliadas, voc, ent.bebe);

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
        /* ⭐ v2.10 — UMA POR GRUPO SECUNDÁRIO (plano 2.11, item 2). /spells
         * traz `secondaryGroup`: focus (Hell's Core, Rage of the Skies, Eternal
         * Winter, Wrath of Nature — 40 s), special (Lightning e os Strong
         * Strikes — 8 s), ultimatestrikes (30 s), greatbeams (6 s). Lançar uma
         * bloqueia as outras do grupo pela recarga secundária — o Em área do
         * Feiticeiro punha Hell's Core + Rage juntas em 19 de 29 mapas do nível
         * 30–62, e a segunda passava 40 s travada. `pega` pula quem é de grupo
         * já usado no plano. */
        const usados = new Set(), gruposUsados = new Set();
        const pega = (lista, n) => {
            const r = [];
            for (const a of lista) {
                if (r.length >= n) break;
                const g = a.m.secondaryGroup || null;
                if (usados.has(a.m.name) || (g && gruposUsados.has(g))) continue;
                usados.add(a.m.name); if (g) gruposUsados.add(g); r.push(a);
            }
            return r;
        };
        let escolhidas = [];
        if (modelo === 'economica') {
            escolhidas = pega(porEfic(magias), 2);
        } else if (modelo === 'equilibrado') {
            /* v2.14.15 — a "forte" do Equilibrado é de ROTAÇÃO (recarga < 30 s). Com o cartão certo (ML do próprio mago,
             * cartaoDaVocacao) a ultimate de 40 s passa a ter o maior dano por lançamento (Hell's Core ~4.900 × Great Fire
             * Wave 1.700) e tomaria a única vaga de forte — 36 de cada 40 s só com a barata e a runa. A ultimate continua
             * entrando no Em área (2 de área) e no Inteligente, que simulam o ciclo inteiro. */
            const rotacao = magias.filter(a => (a.m.cooldownMs || 2000) < 30000);
            escolhidas = pega(porEfic(magias), 1).concat(pega(porDano(rotacao.length ? rotacao : magias), 1), pega(porDano(runas), 1));
        } else if (modelo === 'area') {
            const mA = pega(porDano(magias.filter(ehArea)), 2);
            const mB = mA.length < 2 ? pega(porDano(magias), 2 - mA.length) : [];
            escolhidas = mA.concat(mB, pega(porDano(runas.filter(ehArea)), 2));
        } else if (modelo === 'boss') {
            escolhidas = melhorKitBoss(conf, ent);
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
         * monstros sai a runa e com 1 sai o golpe (o padrão da comunidade).
         * ⭐ v2.10 (item 7) — o golpe de ALVO ÚNICO de recarga longa (≥1) vai
         * DEPOIS dos preenchimentos de área (≥2). Quara, Druida: Strong Terra
         * Strike ≥1 (8 s, 60 de mana = 34 de ouro para quem bebe) na frente da
         * runa ≥2 tomava um ciclo em cada quatro com 2+ monstros vivos — um
         * alvo no lugar de três, pelo quádruplo do preço. Atrás da runa ele só
         * sai quando sobra um monstro, que é para o que ele serve. Continua
         * valendo a regra da 2.9.0 no que importa: nada fica atrás de um
         * preenchimento com mínimo igual ou maior (slotMorto). O Boss já vem
         * na ordem que o simulador escolheu. */
        if (modelo !== 'boss') {
            const longas = escolhidas.filter(a => !enchimento(a)), ench = escolhidas.filter(enchimento);
            escolhidas = porDano(longas.filter(ehArea)).concat(porDano(ench.filter(ehArea)), porDano(longas.filter(a => !ehArea(a))), porDano(ench.filter(a => !ehArea(a))));
        }
        escolhidas = escolhidas.slice(0, 4);
        let plano = escolhidas.map((a, i) => ({ slot: i + 1, av: a, minimo: (modelo === 'boss' || !ehArea(a)) ? 1 : 2 }));
        /* Sem slot extra: o dono pediu contagem exata (2 / 2+1 / 2+2). Se
         * nenhuma ficou com ≥1, a última do plano cai para ≥1. (v2.12.0 — o
         * Inteligente não passa mais por aqui: os mínimos saem da busca.) */
        if (plano.length && !plano.some(p => p.minimo <= 1)) {
            plano[plano.length - 1].minimo = 1;
        }
        /* v2.10 (item 7) — slot que nunca dispara sai do plano: slot vazio
         * não gasta mana nem engana o painel. O motivo fica em `mortos`. */
        const lure = hunt.boss ? 1 : lureMax(hunt);
        const mortos = [];
        for (let j = 0; j < plano.length;) {
            const motivo = slotMorto(plano, j, lure);
            if (motivo) { mortos.push({ nome: plano[j].av.m.name, minimo: plano[j].minimo, motivo }); plano.splice(j, 1); } else j++;
        }
        plano.forEach((p, i) => { p.slot = i + 1; });
        /* v2.10 (item 1) — a fila simulada deste kit: o veredito do grupo soma
         * isto, e `disparos` diz quanto cada slot trabalha. */
        const sim = plano.length ? simularFila(slotsParaSimular(plano), Object.assign({ pocao: ent.bebe, fatorAlvos: FATOR_ALVOS_REAIS }, ent.mana, ent.ritmo)) : null;
        if (sim) plano.forEach((p, i) => { p.disparos = sim.disparos[i]; });

        const cortadas = avaliadas.filter(a => a.morta).length;
        const naoCabe = viab && !vivas.some(a => a.cabeNoOrcamento);
        return { plano, ranking: avaliadas, info, hunt, modelo, cortadas, viab, naoCabe, extras: null, sim, mortos, bebe: ent.bebe };
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
     *  ⭐ v2.10 (plano 2.11, item 1) — O KIT INTEIRO, PELO SIMULADOR. Até a
     *  2.9.0 a conta usava só o slot 1 de cada um e cobrava a mana dele como
     *  poção. Dois erros que se somavam: (a) quem vive de regeneração não paga
     *  mana — a UI dizia "0 ouro" mas o custo seguia na conta; (b) desde a
     *  2.9.0 a runa nunca é slot 1, então o ouro da runa (8 por lançamento, o
     *  que mais se gasta de verdade) sumiu, e o veredito virou "se paga" sempre
     *  que ninguém bebia poção. Agora, por personagem:
     *      ouro/s = mana/s × 0,56 (só se a poção de mana está ligada)
     *             + runas/s × preço por carga
     *      dano/s = tudo que a fila lança (área com metade dos alvos)
     *  e para o grupo:
     *      custoPorAbate = HP × (Σpoção/s × fatorDesperdicio(HP) + Σrunas/s) ÷ Σdano/s
     *  a hunt só é viável se custoPorAbate ≤ loot × margem.
     *  A curva de desperdício (0,47 × HP^0,332) foi medida com a party toda
     *  bebendo mana (30/08): ela cresce com o HP porque "a party apanha mais e
     *  cura é mana, e mana é ouro". Isso vale para a poção; na runa a perda
     *  (alvos a menos) já está no simulador (metade dos alvos), então a curva
     *  não multiplica a runa — senão uma party em regeneração com 12k/h de
     *  runa num mapa que paga 26k/h saía "NÃO se paga" (Dragon Lair, sim).
     *  `custoSemFator` = o mesmo custo sem a curva, para quem calibra.
     * ====================================================================== */
    function viabilidadeParty(modelo, hunt) {
        if (!hunt || !hunt.monsters) return null;
        if (modelo === 'inteligente') return viabilidadeInt(hunt); // v2.12.0 — lucro/h da party simulada, nada de busca aqui
        const loot = LOOT_CACHE[hunt.id];
        if (loot == null) return null;
        const w = hunt.monsters.reduce((s, m) => s + (m.weight || 1), 0) || 1;
        const hp = hunt.monsters.reduce((s, m) => s + m.health * (m.weight || 1), 0) / w;

        let danoS = 0, ouroS = 0, pocaoS = 0, runaS = 0;
        const porVoc = {}, pocoes = {};
        for (const voc of VOCS_PLANO) {
            const r = montarPlano(modelo, hunt, voc);
            if (!r || r.erro || !r.plano.length || !r.sim) { porVoc[voc] = null; continue; }
            pocoes[voc] = !!r.bebe;
            danoS += r.sim.danoS; ouroS += r.sim.ouroS; pocaoS += r.sim.ouroPocaoS; runaS += r.sim.ouroRunaS;
            porVoc[voc] = { magia: r.plano[0].av.m.name, kit: r.plano.map(p => `${p.av.m.name} ≥${p.minimo} ×${p.disparos}`).join(' · '),
                            dano: Math.round(r.sim.danoS), ouroH: Math.round(r.sim.ouroS * 3600), manaS: Math.round(r.sim.manaS * 10) / 10,
                            runasH: Math.round(r.sim.runasS * 3600), pocao: !!r.bebe };
        }
        if (!danoS) return null;
        const custoPorAbate = hp * (pocaoS * fatorDesperdicio(hp) + runaS) / danoS; // curva calibrada só na poção
        const orcamento = loot * MARGEM_LUCRO;
        const regen = VOCS_PLANO.every(v => !pocoes[v]);
        return {
            loot, hp: Math.round(hp), orcamento: Math.round(orcamento * 10) / 10,
            dOuroParty: ouroS > 0 ? Math.round(danoS / ouroS * 100) / 100 : null,
            custoPorAbate: Math.round(custoPorAbate), custoSemFator: Math.round(hp * ouroS / danoS * 10) / 10,
            exigidoParty: Math.round(hp / orcamento * 10) / 10,
            regen, pocoes,
            cabe: custoPorAbate <= orcamento,
            lucroPorAbate: Math.round(loot - custoPorAbate),
            danoS: Math.round(danoS), ouroH: Math.round(ouroS * 3600),
            porVoc
        };
    }

    /* =========================================================================
     *  v2.10 — RELER O DANO DEPOIS DE EQUIPAR (plano 2.11, item 13). O dano
     *  de /spell-numbers muda com a arma (Knight: skill × ataque; magos: ML da
     *  wand/rod), e a tabela só era relida no F5 ou ao subir de nível — o plano
     *  seguia com o dano da arma velha. Quem equipa chama isto (uma linha): o
     *  plano em cache cai na hora e /spell-numbers é relido 2,5 s depois (o
     *  servidor precisa aplicar a troca; várias trocas seguidas viram uma
     *  leitura só). É LEITURA — nada é enviado ao jogo.
     * ====================================================================== */
    const RELEITURA_DANOS_MS = 2500;
    let _releituraT = null;
    function pedirReleituraDeDanos(motivo) {
        invalidarPlanos();
        if (_releituraT) clearTimeout(_releituraT);
        _releituraT = setTimeout(() => {
            _releituraT = null;
            Promise.resolve().then(() => aprenderDanosPorRest(true)).then(r => {
                invalidarPlanos();
                if (r && r.erro) log('dano das magias não relido depois de ' + (motivo || 'equipar') + ': ' + r.erro, 'info');
            }).catch(() => { });
        }, RELEITURA_DANOS_MS);
        return true;
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
        if (!silencioso) log(`aplicando ${nomeModelo(resultado.modelo)} em ${resultado.hunt.title} (${voc})…`);
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
    async function aplicarEmTodos(modelo, hunt, opcInt) {
        if (_aprendendo) { log('ainda medindo o dano dos personagens — espera terminar antes de aplicar', 'erro'); return; }
        /* v2.1.1 — pelo socket a aplicação leva ~1 s e o clique duplo virou
         * real (22:14 de 27/09: duas rodadas intercaladas no Log). Uma por vez. */
        if (_aplicando) { log('já estou aplicando — espera terminar', 'info'); return; }
        _aplicando = true;
        try { await _aplicarEmTodos(modelo, hunt, opcInt); } finally { _aplicando = false; renderizar(); }
    }
    async function _aplicarEmTodos(modelo, hunt, opcInt) {
        /* v1.8.2 — CONTA NOVA SEM DANO MEDIDO. Numa conta de teste (23/09) o
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
         * plano de cada vocação e manda os mesmos frames que a janela manda.
         * v2.11 — só com os perfis que vieram INTEIROS do servidor
         * (welcome/resume); perfil montado aos pedaços vai pelos diálogos. */
        /* v2.12.0 — Inteligente: a busca da party roda aqui (o APLICAR é o clique) */
        let intRes = null;
        if (modelo === 'inteligente') {
            try { intRes = partyInt(hunt, true, opcInt || undefined); } catch (e) { falhou('Inteligente (busca)', e); }
            if (!intRes) { log('Inteligente: não consegui calcular o kit deste mapa — nada aplicado', 'erro'); return; }
            if (intRes.aviso) log('Inteligente: ' + intRes.aviso, 'erro');
        }
        if (socketAberto() && ESTADO_WS.perfisDoServidor) {
            log(`aplicando ${nomeModelo(modelo)} nos 4 personagens em ${hunt.title} — pelo socket, sem abrir janela…`);
            let total = 0, semEco = 0;
            for (const voc of VOCS) {
                const r = montarPlano(modelo, hunt, voc, { opcInt, resInt: intRes });
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
            if (intRes && total) registrarAplicacaoInt(hunt, intRes);
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
            const r = montarPlano(modelo, hunt, undefined, { opcInt, resInt: intRes });
            if (r.erro) { log(`  ${voc}: ${r.erro}`, 'erro'); continue; }
            if (r.extras) semExtras = true;
            total += await aplicarPlano(r, true);
        }
        const volta = tid('party-member-' + original);
        if (volta) volta.click();
        log(`terminado — ${total} slots aplicados nos 4 personagens`, total ? 'ok' : 'erro');
        if (intRes && total) registrarAplicacaoInt(hunt, intRes);
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

    /* v2.11 — lureNoMaximo() (lure pela JANELA) saiu: só era chamado pelo
     * window.__tbHelper, que agora é só leitura. O lure máximo do Scan é
     * lureNoMaximoSocket() (set_lure), abaixo. */

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
    /* v2.11 — perfisDoServidor: `profiles` veio INTEIRO de um welcome/resume.
     * Sem isso, ESTADO_WS.profiles pode ter só a vocação que o cliente salvou
     * (profiles_set dele) — ver perfilReal(). conta: `account` do welcome
     * (gaveta sem /auth/me). ultimoEnded: o último `ended` {t, huntId, reason}. */
    const ESTADO_WS = { huntId: null, boss: null, ultimoStart: null, frame: null, hunt_t: 0,
                        worldToken: null, profiles: null, perfisDoServidor: false, battleConfigs: null, roster: [], party: [], eco: {},
                        rosterFull: null, rosterFull_t: 0, depot: null, depot_t: 0, conta: null, ultimoEnded: null };
    const VOCS = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'];
    const FRAME_FRESCO_MS = 5000;
    const frameFresco = () => !!(ESTADO_WS.frame && Date.now() - ESTADO_WS.frame.t < FRAME_FRESCO_MS);
    /* v2.11 — o id 800 é o "slot" de boss no servidor (TIBIDLE.md, 27/09). */
    const HUNT_ID_BOSS = 800;
    /* true/false quando o catálogo já carregou; null quando ainda não dá para saber */
    const huntNoCatalogo = (id) => CAT.hunts ? CAT.hunts.some(x => x.id === id) : null;
    /* `who` do servidor é a POSIÇÃO em state.party: um buraco (null) não pode
     * deslocar os outros — por isso map mantendo a posição, sem filter. */
    const vocsPorPosicao = (lista) => lista.map(p => (p && typeof p.vocation === 'string') ? p.vocation : null);
    function estadoWS() {
        const f = ESTADO_WS.frame;
        return { huntId: ESTADO_WS.huntId, boss: ESTADO_WS.boss, cap: f && f.cap, balance: f && f.balance,
                 lureTier: f && f.lureTier, active: f && f.active, idadeMs: f ? Date.now() - f.t : null,
                 ultimoStart: ESTADO_WS.ultimoStart, party: ESTADO_WS.party, roster: ESTADO_WS.roster,
                 temToken: !!ESTADO_WS.worldToken, temPerfis: !!ESTADO_WS.profiles, perfisDoServidor: ESTADO_WS.perfisDoServidor,
                 perfisReais: VOCS.filter(perfilReal), socketAberto: socketAberto(), conta: ESTADO_WS.conta, ultimoEnded: ESTADO_WS.ultimoEnded,
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
    /* @@PERFIS-INICIO — socket, perfis e aplicarPlanoSocket; testes/fumaca.test.js roda este trecho sozinho. */
    function socketAberto() { return !!(WS.socket && WS.socket.readyState === 1); }
    function enviarWS(obj) {
        if (!socketAberto()) throw new Error('socket do jogo não está aberto');
        WS.socket.send(JSON.stringify(obj)); // passa pelo grampo: conta em WS.enviados e observarEnviado
    }
    const ordemParty = () => (ESTADO_WS.party.length ? ESTADO_WS.party : ESTADO_WS.roster);
    const vocDoIndice = (i) => ordemParty()[i] || null;
    const indiceDaVoc = (v) => { const i = ordemParty().indexOf(v); return i >= 0 ? i : null; };
    const clonar = (x) => JSON.parse(JSON.stringify(x));
    /* ⚠ v2.11 — PERFIL REAL. profiles_set SUBSTITUI os 4 presets da vocação
     * inteiros. Montado em cima de um esqueleto (vocação que nunca chegou do
     * servidor), ele apagava os outros 3 presets e a cura do jogador —
     * CONFIRMADO na auditoria: helper instalado com o jogo aberto (welcome
     * perdido) + o jogador salva UM slot do Knight na janela = ESTADO_WS
     * .profiles passava a existir só com KNIGHT, e o APLICAR NOS 4 mandava
     * profiles_set de esqueleto para os outros três. Real = a vocação veio
     * num welcome/resume ou num profiles_set do próprio cliente (que manda o
     * perfil inteiro). */
    const perfilReal = (v) => !!(ESTADO_WS.profiles && ESTADO_WS.profiles[v] && typeof ESTADO_WS.profiles[v] === 'object' && Array.isArray(ESTADO_WS.profiles[v].list));
    function perfilDaVoc(v) { // mesmo preenchimento que o cliente faz (4 perfis)
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
    function normalizarConfig(c) { // = e3() do cliente
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
    function payloadBattleConfig(c, who) { // = ee() do cliente
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
    /* Eco do servidor / update_battle_config do cliente → estado local.
     * v2.11 — NUNCA cria esqueleto: sem perfil real, a config vai para
     * battleConfigs (a reserva de configAtiva), e ESTADO_WS.profiles fica
     * sem a vocação — que é o que impede o profiles_set de esqueleto. */
    function aplicarConfigLocal(voc, cfg) {
        if (!voc || !cfg || typeof cfg !== 'object') return;
        const nova = normalizarConfig(cfg);
        if (perfilReal(voc)) {
            const p = ESTADO_WS.profiles[voc];
            while (p.list.length < 4) p.list.push({ name: String(p.list.length + 1), config: null }); // o mesmo preenchimento de perfilDaVoc
            const i = (p.active >= 0 && p.active < p.list.length) ? p.active : 0;
            p.list[i] = Object.assign({ name: String(i + 1) }, p.list[i], { config: nova });
            return;
        }
        if (!ESTADO_WS.battleConfigs || typeof ESTADO_WS.battleConfigs !== 'object') ESTADO_WS.battleConfigs = {};
        ESTADO_WS.battleConfigs[voc] = nova;
    }

    /* Aplica o plano de UMA vocação pelo socket: mantém poções, suportes e
     * munição como estão, troca só skills + minCreatures. Manda os mesmos
     * dois frames que a janela manda.
     * v2.11 — sem a config atual (configAtiva null) NADA sai; sem perfil real
     * o profiles_set NÃO sai (caçando: só update_battle_config, que vale para
     * esta caçada e não mexe nos presets; na cidade: a vocação é pulada). O
     * preset é montado com Object.assign — campos do preset que o helper não
     * conhece seguem junto. */
    async function aplicarPlanoSocket(resultado, voc) {
        if (!resultado || !resultado.plano) return { n: 0, who: null, eco: false, cacando: false };
        const cfg = configAtiva(voc);
        if (!cfg) throw new Error('sem a configuração atual de ' + voc + ' (perfis do servidor não chegaram) — nada enviado; dê F5 com o helper instalado');
        const atual = normalizarConfig(cfg);
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
        const real = perfilReal(voc);
        if (!real && who == null) throw new Error(`o perfil de ${voc} não veio do servidor — profiles_set pulado para não apagar os presets e a cura dele (dê F5 com o helper instalado)`);
        const t0 = Date.now();
        if (cacando && who != null) enviarWS({ type: 'update_battle_config', data: payloadBattleConfig(nova, who) });
        if (real) {
            const perfil = perfilDaVoc(voc);
            perfil.list[perfil.active] = Object.assign({}, perfil.list[perfil.active], { config: nova });
            enviarWS({ type: 'profiles_set', data: { vocation: voc, profiles: perfil } });
        } else log(`  ${voc}: perfil não veio do servidor — só update_battle_config (vale nesta caçada, não fica salvo no preset)`, 'erro');
        let eco = null;
        if (cacando && who != null) eco = await esperarQue(() => ESTADO_WS.eco[who] && ESTADO_WS.eco[who] > t0, 4000, 150);
        return { n: resultado.plano.length, who, eco: !!eco, cacando, soCacada: !real };
    }
    /* @@PERFIS-FIM */

    /* Dano real de TODAS as magias e runas numa chamada, com o worldToken.
     * v2.11 — a leitura automática (amostrar) só baixa a bandeira
     * _danosRestPendente quando DÁ CERTO; com erro tenta de novo depois
     * (1 min, dobrando até 16 min). Antes a bandeira caía antes da chamada e
     * um 5xx no boot deixava a sessão inteira sem dano medido. */
    let _danosRestPendente = false, _danosRestEmCurso = false, _danosRestProxima = 0, _danosRestEspera = 60000;
    function lerDanosPendentes() {
        if (!_danosRestPendente || _danosRestEmCurso || Date.now() < _danosRestProxima) return;
        if (!(ESTADO_WS.worldToken && CAT.magias && (tid('rail-level-n') || (ESTADO_WS.frame && ESTADO_WS.frame.nivel)))) return;
        _danosRestEmCurso = true;
        aprenderDanosPorRest(true)
            .then(r => { if (r && r.ok) { _danosRestPendente = false; _danosRestEspera = 60000; } else throw new Error((r && r.erro) || 'sem resposta'); })
            .catch(e => { _danosRestProxima = Date.now() + _danosRestEspera; _danosRestEspera = Math.min(_danosRestEspera * 2, 16 * 60000); falhou('dano por /spell-numbers', e); })
            .finally(() => { _danosRestEmCurso = false; });
    }
    async function aprenderDanosPorRest(silencioso) {
        const tok = ESTADO_WS.worldToken;
        if (!tok) return { erro: 'sem worldToken — o welcome do socket ainda não chegou (recarregue com o helper instalado)' };
        if (!CAT.magias) return { erro: 'catálogo de magias ainda não carregou' };
        let nums;
        try {
            nums = await comPrazo(async (signal) => {
                const r = await fetch(API + '/spell-numbers', Object.assign({ headers: { authorization: 'Bearer ' + tok }, credentials: 'include' }, signal ? { signal } : {}));
                if (!r.ok) throw new Error('/spell-numbers respondeu HTTP ' + r.status);
                return r.json();
            }, PRAZO_REDE_MS);
        } catch (e) { return { erro: '/spell-numbers falhou: ' + e.message }; }
        if (!nums || typeof nums !== 'object') return { erro: '/spell-numbers veio vazio' };
        let n = 0, recalc = 0; const lvl = nivelAtual();
        for (const voc of VOCS) {
            const d = ler('danos_' + voc, {});
            const sk = skillsDaVoc(voc);
            for (const m of magiasDaVocacao(voc)) {
                const x = m.file && nums[m.file];
                if (!x || x.kind !== 'damage' || x.min == null) continue;
                /* v2.14.15 — o cartão é de um personagem só: recalcula com o ML/skill desta vocação (cartaoDaVocacao) */
                const c = cartaoDaVocacao(m, voc, lvl, sk);
                if (c) recalc++;
                d[m.name] = Object.assign({ min: x.min, max: x.max }, c || {}, { mana: m.mana || 0, casas: casasDaMagia(m), nivel: lvl, ts: Date.now(), fonte: 'rest' });
                n++;
            }
            guardar('danos_' + voc, d);
        }
        if (!silencioso || n) log(`dano real de ${n} magias/runas lido de /spell-numbers (nível ${lvl}; ${recalc} recalculadas com o ML/skill de cada personagem)`, 'ok');
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
    /* v2.14.13 — tFim (o `ended`) e tUlt (último frame): o relógio do livro PARA quando a caçada para. Antes seg = agora − t0
     * seguia correndo na cidade: 9 min depois do fim, o dano/s da party saía 18 em vez de 727 e o Equip dava 175 pt (175 % do
     * dano da party!) para regen. de mana 2,3 — a nota do ranking, o "−42 pt" das sobras e os pesos do bestiário inflavam ~40×. */
    const razaoNovo = () => ({ t0: Date.now(), tFim: 0, tUlt: 0, magias: {}, auto: {}, tomado: { total: 0, golpes: 0, corpo: 0, golpesCorpo: 0 }, kills: 0, ondas: { n: 0, tam: 0, timer: 0, matar: 0, tOnda: 0 }, vitais: {}, hpAntes: {},
                               vitaisPorKit: {}, kitVital: {} });
    const razaoFim = (L) => L.tFim || (L.tUlt && Date.now() - L.tUlt > FRAME_FRESCO_MS ? L.tUlt : Date.now());
    let RAZAO = razaoNovo();
    /* v2.12.0 — também a mana MÍNIMA (escada defensiva: Druida) e a
     * REGENERAÇÃO de cada um: janela de ≥ 3 s (até 10 s) em que ele não lançou
     * nada, ninguém lançou cura, não bebeu e a mana não encostou no máximo →
     * Δmana/Δt. Mediana das últimas 200 janelas; com ≥ 30 vira regen_<VOC>
     * (regenMedida), que o Inteligente e o simulador usam no lugar do chute. */
    const _regenJan = {}, _regenLista = {};
    function razaoVitais(L, party, eventos) {
        const agora = Date.now();
        L.tUlt = agora;
        const lancou = new Set(); let cura = false;
        for (const e of (Array.isArray(eventos) ? eventos : [])) {
            if (!e || e.kind !== 'cast') continue;
            lancou.add(e.who);
            const m = (CAT.magias || []).find(x => x.name === e.name);
            if (m && m.group === 'healing') cura = true;
        }
        party.forEach((p, i) => {
            if (!p || !p.vocation || !p.maxMana) return;
            const v = L.vitais[p.vocation] || (L.vitais[p.vocation] = { n: 0, mana: 0, hp: 0, hpMin: 1, manaMin: 1 });
            v.n++; v.mana += p.mana / p.maxMana; v.hp += p.hp / (p.maxHp || 1); v.hpMin = Math.min(v.hpMin, p.hp / (p.maxHp || 1));
            v.manaMin = Math.min(v.manaMin != null ? v.manaMin : 1, p.mana / p.maxMana);
            try { amostrarRegen(p.vocation, p, lancou.has(i) || cura, agora); } catch { /* amostra perdida */ }
        });
    }
    function amostrarRegen(voc, p, mexeu, agora) {
        const gol = Object.values(p.supplyUsed || {}).reduce((s, u) => s + ((u && u.count) || 0), 0);
        const j = _regenJan[voc];
        const quebra = !j || mexeu || gol !== j.gol || p.mana < j.m1 || p.mana >= p.maxMana || agora - j.t1 > 3000;
        if (j && (quebra || agora - j.t0 >= 10000)) {
            const x = amostraRegen(j);
            if (x != null) {
                const l = _regenLista[voc] || (_regenLista[voc] = []);
                l.push(x); if (l.length > 200) l.shift();
                if (l.length >= 30 && l.length % 10 === 0) guardar('regen_' + voc, { v: Math.round(medianaRegen(l) * 10) / 10, n: l.length, t: agora });
            }
            _regenJan[voc] = null;
        }
        if (!_regenJan[voc] && !mexeu && p.mana < p.maxMana) _regenJan[voc] = { t0: agora, m0: p.mana, t1: agora, m1: p.mana, gol };
        else if (_regenJan[voc]) { _regenJan[voc].t1 = agora; _regenJan[voc].m1 = p.mana; }
    }
    /* v2.12.0 — kit novo não APAGA a mana/vida medida (a 2.11 fazia `delete
     * RAZAO.vitais[v]` a cada APLICAR e o Inteligente decidia sem medida): elas
     * ficam guardadas por kit (vitaisPorKit[voc][hash]) e voltam se o kit volta. */
    /* v2.14.0 — as curas por magia entram no kit (degraus 0–2 do kit enxuto só mudam as curas) */
    const kitHashConfig = (c) => _hash(JSON.stringify(c ? [c.skills || [], c.minCreatures || {}, c.supports || [], c.manaPotion ? c.manaPotion.percent : 0,
        (c.heals || []).filter(h => h && h.name && !/potion/i.test(h.name)).map(h => h.name + h.percent)] : null));
    function trocarVitaisDeKit(voc, hash) {
        if (!voc) return;
        const pk = RAZAO.vitaisPorKit || (RAZAO.vitaisPorKit = {}), kv = RAZAO.kitVital || (RAZAO.kitVital = {});
        const porV = pk[voc] || (pk[voc] = {});
        const antes = kv[voc] != null ? kv[voc] : '?';
        if (antes === hash) return;
        if (RAZAO.vitais[voc]) porV[antes] = RAZAO.vitais[voc];
        if (porV[hash]) RAZAO.vitais[voc] = porV[hash]; else delete RAZAO.vitais[voc];
        kv[voc] = hash;
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
        if (k === 'mhit' || k === 'mcast') { L.tomado.total += e.amount || 0; L.tomado.golpes++; if (k === 'mhit') { L.tomado.corpo += e.amount || 0; L.tomado.golpesCorpo++; } return; }
        if (k === 'kill') { L.kills++; delete L.hpAntes[e.id]; return; }
        if (k === 'wave') { L.ondas.n++; L.ondas.tOnda = agora; L.ondas.tam = e.count || L.ondas.tam; return; }
        if (k === 'wave_timer') { L.ondas.timer += e.ms || 0; if (L.ondas.tOnda) { L.ondas.matar += agora - L.ondas.tOnda; L.ondas.tOnda = 0; } }
    }
    /* → { seg, danoTotal, porVoc{VOC:{dano,pct,dps,mana,ouro,manaMedia,hpMedia,hpMin}}, magias[por dano],
     *     ondas{n,tam,timer,matar,ciclo,spawnLimita}, tomado, tomadoH, kills } */
    function razaoResumo(L) {
        const seg = Math.max(1, (razaoFim(L) - L.t0) / 1000);
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
        return { seg: Math.round(seg), danoTotal, porVoc, magias, ondas, tomado: L.tomado.total, tomadoH: Math.round(L.tomado.total / seg * 3600), kills: L.kills,
                 tomadoCorpoH: Math.round((L.tomado.corpo || 0) / seg * 3600), golpesCorpoH: Math.round((L.tomado.golpesCorpo || 0) / seg * 3600),
                 tirosH: Object.fromEntries(Object.entries(L.auto).map(([v, a]) => [v, Math.round(a.hits / seg * 3600)])) };
    }
    const VOC_CURTO = { KNIGHT: 'Cav', PALADIN: 'Pal', SORCERER: 'Fei', DRUID: 'Dru' };
    function razaoHtml(rz, curto) {
        if (!rz || !rz.danoTotal) return '';
        const vocs = VOCS.filter(v => rz.porVoc[v]).map(v => { const x = rz.porVoc[v]; return `${VOC_CURTO[v]} <b>${x.pct}%</b>${x.manaMedia != null ? ` <span class="${x.manaMedia < 25 ? 'tb-ruim' : ''}">mana ${x.manaMedia}%</span>` : ''}${x.hpMin != null && x.hpMin < 50 ? ` <span class="tb-ruim">vida mín ${x.hpMin}%</span>` : ''}`; }).join(' · ');
        /* v2.11 (D2) — o nome vem do evento do socket: escapado (a Magia e o Scan mostram isto) */
        const top = rz.magias.filter(m => m.danoPorMana != null).sort((a, b) => b.danoPorMana - a.danoPorMana).slice(0, curto ? 3 : 6).map(m => `${escHtml(m.nome)} ${m.danoPorMana}${m.overkillPct >= 15 ? ` <span class="tb-av">overkill ${m.overkillPct}%</span>` : ''}`).join(' · ');
        const runas = rz.magias.filter(m => m.danoPorOuro != null).map(m => `${escHtml(m.nome)} ${m.danoPorOuro}/ouro`).join(' · ');
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
    let _skillsT = 0, _releituraSkT = 0;
    function anotarSkills(party) {
        if (!ESTADO_WS.sk) ESTADO_WS.sk = ler('skills_vistas', {}) || {};
        let mudou = false;
        for (const p of party) {
            if (!p || !p.vocation || !p.skills) continue;
            const x = { dist: _skill(p, ['distance']), melee: _skill(p, ['melee', 'sword', 'axe', 'club', 'fist']), ml: _skill(p, ['magicLevel', 'magic', 'maglevel']) };
            const bons = Object.fromEntries(Object.entries(x).filter(([, v]) => v != null));
            /* v2.11 — frame sem as skills (ou com nome que o helper não conhece)
             * dava {} e APAGAVA o que já tinha sido visto; agora só soma. */
            if (!Object.keys(bons).length) continue;
            const antes = ESTADO_WS.sk[p.vocation] || {};
            if ((bons.ml != null && bons.ml !== antes.ml) || (bons.dist != null && bons.dist !== antes.dist)) mudou = true;
            ESTADO_WS.sk[p.vocation] = Object.assign({}, antes, bons);
        }
        if (Date.now() - _skillsT > 60000) { _skillsT = Date.now(); guardar('skills_vistas', ESTADO_WS.sk); }
        /* v2.14.15 — o cartão de cada vocação é recalculado com o ML/distância dela (cartaoDaVocacao): skill nova → relê.
         * v2.14.16 — no máximo 1× a cada 10 min: Train Party (+3 distância) e Enchant Party (+1 ML) ligam e desligam a
         * cada 120 s e o frame traz valor + bônus — ao vivo (06/10) o /spell-numbers foi relido 4× em 3 min. */
        if (mudou && Date.now() - _releituraSkT > 10 * 60000) { _releituraSkT = Date.now(); pedirReleituraDeDanos('ML/skill mudou'); }
    }
    function observarEnviado(o) {
        if (!o || !o.type) return;
        try { mkObservarEnviado(o); } catch (e) { falhou('mercado (enviado)', e); } // v2.11 — conta as ações do mercado (limite 20/min por conta)
        const d = (o.data && typeof o.data === 'object') ? o.data : {};
        if (o.type === 'start_hunt') { ESTADO_WS.ultimoStart = Object.assign({ t: Date.now() }, d); return; }
        /* v2.9.0 — kit novo = medição nova. A mana média de cada personagem é o
         * que decide o regime do Inteligente; misturar o kit velho com o novo
         * fazia o regime oscilar (pesado → mana cai → leve → mana sobe → …). */
        if (o.type === 'profiles_set' && d.vocation && d.profiles && typeof d.profiles === 'object') {
            /* o cliente manda o perfil INTEIRO da vocação: vale como real (perfilReal),
             * mas não marca perfisDoServidor — as outras três continuam sem */
            if (!ESTADO_WS.profiles) ESTADO_WS.profiles = {};
            ESTADO_WS.profiles[d.vocation] = clonar(d.profiles);
            const lp = d.profiles.list, at = lp && lp[d.profiles.active >= 0 ? d.profiles.active : 0];
            trocarVitaisDeKit(d.vocation, kitHashConfig(at && at.config));
            return;
        }
        if (o.type === 'update_battle_config' && d.who != null) { aplicarConfigLocal(vocDoIndice(d.who), d); const v = vocDoIndice(d.who); if (v) trocarVitaisDeKit(v, kitHashConfig(d)); return; }
        /* v2.11 — analisador zerado (botão da janela ou o Scan): a sessão do
         * Analisador fecha aqui — as contas dela partiam do zero antigo. */
        if (o.type === 'analyzer_reset') { if (SESSAO) fecharSessao('analisador zerado'); }
    }
    function observarRecebido(o) {
        try { observarProgresso(o); } catch { } // v2.11 — aba Progresso: só leitura (chaves, bestiário, prey, plano offline)
        try { diagObservar(o); } catch { } // v2.11 — Diagnóstico: guarda só a FORMA das mensagens
        try { observarMercado(o); } catch (e) { falhou('observarMercado', e); } // v2.11 — aba Mercado: premium, mochila, protegidos, respostas do mercado
        try { radarObservar(o); } catch (e) { falhou('radar (observar)', e); } // v2.13.0 — aba Radar: loot ao vivo e o dia (só leitura)
        if (!o || !o.type) return;
        const d = (o.data && typeof o.data === 'object') ? o.data : {};
        if (o.type === 'depot_state' && Array.isArray(d.entries)) {
            ESTADO_WS.depot = { entries: clonar(d.entries), used: d.used, total: d.total }; ESTADO_WS.depot_t = Date.now();
            if (ABA === 'equip') renderizar();
            return;
        }
        if (o.type === 'frame') {
            const st = (d.state && typeof d.state === 'object') ? d.state : {};
            const an = (d.analyzer && typeof d.analyzer === 'object') ? d.analyzer : null;
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
                /* v2.6.3 — por personagem: vida/mana e o que cada um bebeu (estudo de builds).
                 * Esta lista é buscada por `voc`, então pode pular buracos; a
                 * ORDEM (o `who`) mora em ESTADO_WS.party. */
                party: Array.isArray(st.party) ? st.party.map(p => p && ({ voc: p.vocation, hp: p.hp, maxHp: p.maxHp, mana: p.mana, maxMana: p.maxMana,
                           suppliesGold: Number(p.suppliesGold) || 0, supplyUsed: p.supplyUsed || {},
                           dist: p.skills && p.skills.distance ? Number(p.skills.distance.value) + (Number(p.skills.distance.bonus) || 0) : null })).filter(Boolean) : []
            };
            if (Array.isArray(st.party) && st.party.length) {
                ESTADO_WS.party = vocsPorPosicao(st.party);
                try { razaoVitais(RAZAO, st.party, d.events); } catch (e) { falhou('livro-razão (vitais)', e); }
                try { anotarSkills(st.party); } catch (e) { falhou('anotarSkills', e); }
            }
            if (Array.isArray(d.events)) { const agora = Date.now(); for (const ev of d.events) {
                if (!ev || typeof ev !== 'object') continue;
                try { razaoEvento(RAZAO, ev, agora); } catch (e) { falhou('livro-razão (eventos)', e); }
                if (ev.kind === 'update_battle_config' && ev.who != null) {
                    ESTADO_WS.eco[ev.who] = Date.now();
                    aplicarConfigLocal(vocDoIndice(ev.who), ev.config);
                }
            } }
            /* v2.11.2 — a Magia não repinta por frame; o selo medido aparece
             * quando a caçada passa de 10 min (repinte só nessa virada) */
            if (ABA === 'magia') { const k = ESTADO_WS.huntId + '|' + !!(an && Number(an.elapsedMs) >= 10 * 60000); if (k !== _medidoK) { _medidoK = k; renderizar(); } }
            return;
        }
        if (o.type === 'welcome' || o.type === 'resume') {
            /* v2.11 — RECONEXÃO. welcome = sessão NOVA no servidor: boss, hunt,
             * party, start pendente e ecos da sessão anterior não valem mais
             * (o boss "em andamento" ficava preso depois de uma queda). */
            if (o.type === 'welcome') {
                Object.assign(ESTADO_WS, { boss: null, huntId: null, party: [], ultimoStart: null, eco: {}, frame: null });
                if (d.account && typeof d.account === 'object' && d.account.name) {
                    ESTADO_WS.conta = { nome: String(d.account.name), main: d.account.mainVocation || null };
                    if (_gavetaSemConta) gavetaPeloWelcome(ESTADO_WS.conta);
                }
            }
            if (typeof d.worldToken === 'string' && d.worldToken) ESTADO_WS.worldToken = d.worldToken;
            if (d.profiles && typeof d.profiles === 'object') { ESTADO_WS.profiles = clonar(d.profiles); ESTADO_WS.perfisDoServidor = true; }
            if (d.battleConfigs && typeof d.battleConfigs === 'object') ESTADO_WS.battleConfigs = clonar(d.battleConfigs);
            if (Array.isArray(d.roster) && d.roster.length) ESTADO_WS.roster = vocsPorPosicao(d.roster);
            if (Array.isArray(d.roster) && d.roster.length && d.roster.some(r => r && r.equipment)) {
                ESTADO_WS.rosterFull = clonar(d.roster); ESTADO_WS.rosterFull_t = Date.now();
            }
            if (Array.isArray(d.state && d.state.party) && d.state.party.length) ESTADO_WS.party = vocsPorPosicao(d.state.party);
            if (d.worldToken) { _danosRestPendente = true; _danosRestProxima = 0; } // amostrar() lê /spell-numbers quando o catálogo estiver pronto
            if (o.type === 'welcome') { renderizar(); return; }
            /* v2.11 — resume SEM huntId = retomada na cidade: não é caçada, e
             * não pode criar frame "fresco" (emHunt() mentiria por 5 s) */
            if (d.huntId == null) { ESTADO_WS.huntId = null; ESTADO_WS.boss = null; ESTADO_WS.frame = null; renderizar(); return; }
        }
        if (o.type === 'hunt_started' || o.type === 'resume') {
            /* v2.11 — BOSS / TORRE. Boss é o que o cliente PEDIU com bossId, o
             * id 800 (o "slot" de boss do servidor) ou um id fora do catálogo
             * de hunts (Elite, torre, treino). O `autoBoss` NÃO decide: ele vem
             * como boolean em hunt comum também, e a 2.10 marcava "boss em
             * andamento" numa caçada normal — travando Scan e Auto Hunt. */
            const u = ESTADO_WS.ultimoStart;
            const recente = !!(u && Date.now() - u.t < 60000);
            const bossId = recente && u.bossId ? String(u.bossId) : null;
            const torre = (recente && !!u.tower) || !!(d.state && typeof d.state === 'object' && d.state.tower != null);
            const noCat = huntNoCatalogo(d.huntId);
            const ehBoss = !!bossId || torre || d.huntId === HUNT_ID_BOSS || noCat === false || d.training === true;
            ESTADO_WS.huntId = d.huntId != null ? d.huntId : null;
            ESTADO_WS.hunt_t = Date.now();
            RAZAO = razaoNovo();
            if (Array.isArray(d.state && d.state.party) && d.state.party.length) ESTADO_WS.party = vocsPorPosicao(d.state.party);
            ESTADO_WS.frame = ESTADO_WS.frame || { t: Date.now(), cap: null, balance: null, lureTier: null, active: [], party: [] };
            if (ehBoss) {
                ESTADO_WS.boss = bossId || (torre ? 'torre' : d.training === true ? 'treino' : '?');
                if (bossId) { guardar('boss_nome', bossId); }
                log('boss em andamento (socket): ' + ESTADO_WS.boss + (d.huntId != null ? ' · id ' + d.huntId : ''), 'ok');
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
            ESTADO_WS.ultimoErro = String(d.code || d.key || JSON.stringify(d)); ESTADO_WS.ultimoErro_t = Date.now();
            log('servidor respondeu erro: ' + ESTADO_WS.ultimoErro, 'erro');
            return;
        }
        if (o.type === 'ended' || o.type === 'exit_pending') {
            if (o.type === 'ended') {
                const sm = (d.summary && typeof d.summary === 'object') ? d.summary : {};
                /* v2.11 — `ended` = fora da caçada: huntId zera junto (o Scan e o
                 * Auto Hunt viam "ainda na hunt X" depois de uma morte). O que
                 * acabou fica em ultimoEnded para quem precisar do motivo. */
                ESTADO_WS.ultimoEnded = { t: Date.now(), huntId: sm.huntId != null ? sm.huntId : ESTADO_WS.huntId, reason: sm.reason || null, boss: ESTADO_WS.boss };
                if (RAZAO && !RAZAO.tFim) RAZAO.tFim = Date.now(); // v2.14.13 — o relógio do livro-razão para aqui
                ESTADO_WS.boss = null; ESTADO_WS.ultimoStart = null; ESTADO_WS.frame = null; ESTADO_WS.party = []; ESTADO_WS.huntId = null;
                if (sm.huntId != null && sm.huntId !== HUNT_ID_BOSS && huntNoCatalogo(sm.huntId)) { guardar('hunt_id', sm.huntId); guardar('hunt_manual', sm.huntId); }
            }
            return;
        }
    }

    /* v2.11 — O ANALISADOR DO PRÓPRIO JOGO PRIMEIRO. frame.analyzer (em
     * ESTADO_WS.frame.an) traz abates, xp, xp raw, loot e tempo da caçada — o
     * mesmo número da janela "Estatísticas da caça", sem depender dela aberta.
     * O DOM fica de reserva (frame velho: helper sem socket), só LENDO. */
    const anDoFrame = () => (frameFresco() && ESTADO_WS.frame.an) ? ESTADO_WS.frame.an : null;
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
     * de novo — no máximo uma varredura por troca, não uma por amostra.
     * ⚠ v2.11 — NUNCA CLICA. Até a 2.10, com a janela "Estatísticas da caça"
     * fechada, isto clicava em hud-analyzer a cada 60 s — o jogador fechava a
     * janela e ela voltava sozinha (CONFIRMADO). Com o frame não precisa: o
     * contador vem de frame.analyzer.killsTotal. Sem frame e sem janela: null. */
    let _noAbates = null;
    function lerAbates() {
        const an = anDoFrame();
        if (an && Number.isFinite(an.kills)) return an.kills;
        const bom = (el) => el && el.isConnected && /\d+\s*abates/i.test(el.textContent || '');
        if (!bom(_noAbates)) {
            _noAbates = null;
            /* o contador vive na janela "Estatisticas da caca" (data-testid
             * analyzer-session, mapeado em 19/09). Procurar so dentro dela: e
             * barato e nao confunde com "abates" de outro texto da pagina. */
            const raiz = tid('analyzer-session');
            if (!raiz) return null;
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
     *
     *  v2.11 — "vende tudo que o painel marcar" CAIU: o sell_loot do ciclo de
     *  21:3x (TIBIDLE.md §13) levou elvish bow e leather boots. Agora há uma
     *  lista "nunca vender" (equipamento + materiais de imbuement + a do dono)
     *  que é desmarcada no painel ANTES de confirmar; se não der para
     *  desmarcar, não vende.
     * ====================================================================== */
    /* @@AUTOHUNT-PURO-INICIO */
    /* v2.11 — funções PURAS do Auto Hunt e do Scan: testes/autohunt.test.js roda
     * este trecho no node. Nada aqui toca DOM, socket ou localStorage. */
    const normNomeItem = s => String(s == null ? '' : s).toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    /* Equipamento = o que tem lugar no corpo em /item/info (slot, 2 mãos, tipo
     * de arma). Munição fica de fora: é suprimento, o Paladino gasta. */
    const TIPOS_EQUIP = /armou?rs?\b|boots|helmets?|\blegs\b|shields?|weapons?|wands?|\brods?\b|\baxes\b|swords?|clubs?|\brings?\b|amulets?|necklaces?|spellbooks?|quivers?/i;
    function ehEquipamento(info) {
        const a = (info && info.attrs) || {};
        if (a.slot === 'ammo' || a.weaponType === 'ammunition' || /ammunition/i.test(a.primarytype || '')) return false;
        return !!(a.slot || a.slotType || a.weaponType || TIPOS_EQUIP.test(a.primarytype || ''));
    }
    /* materiais de imbuement = todo item pedido em /assets/<versão>/imbuements.json (buscarAsset) */
    const materiaisDoCatalogo = j => [...new Set(((j && j.imbuements) || []).flatMap(i => (i.items || []).map(x => normNomeItem(x && x.name))).filter(Boolean))];
    /* O que DESMARCAR no painel de venda. linhas: [{nome, ...}] (nome = o que
     * vem depois de "sell-check-"); o: {equip, imbu, lista, materiais,
     * nomes: {nomeNormalizado: nomeReal} ou null, base: {nomeReal: {attrs}}}.
     * Com a proteção de equipamento ligada, item que não se consegue
     * classificar fica GUARDADO — vender arma por engano custa mais que
     * levar um item a mais para o depot. */
    function escolherDesmarcar(linhas, o) {
        o = o || {};
        const lista = new Set((o.lista || []).map(normNomeItem).filter(Boolean));
        const mats = new Set((o.materiais || []).map(normNomeItem));
        const guardar = [], vender = [];
        const baseMin = {}; for (const [k, v] of Object.entries(o.base || {})) baseMin[normNomeItem(k)] = v;
        for (const l of linhas || []) {
            const n = normNomeItem(l.nome);
            const real = o.nomes ? (o.nomes[n] || null) : null;
            const nome = real || l.nome;
            let motivo = null;
            if (lista.has(n) || (real && lista.has(normNomeItem(real)))) motivo = 'sua lista';
            else if (o.imbu && (mats.has(n) || (real && mats.has(normNomeItem(real))))) motivo = 'material de imbuement';
            else if (o.equip) {
                /* v2.11.7 — o nome do catálogo ("wild honey") e o do /item/info
                 * ("Wild Honey") diferem em maiúsculas: sem casar, todo item caía
                 * em "sem dados" (ao vivo, 29/09). */
                const b = real && o.base ? (o.base[real] || baseMin[normNomeItem(real)] || null) : null;
                if (!real) motivo = 'nome não reconhecido — guardado por segurança';
                else if (!b) motivo = 'sem dados do item — guardado por segurança';
                else if (ehEquipamento(b)) motivo = 'equipamento' + (b.attrs && (b.attrs.slot || b.attrs.slotType) ? ' (' + (b.attrs.slot || b.attrs.slotType) + ')' : '');
                /* v2.11.7 — NPC que paga 0 não compra: "vender" = jogar fora. Wild
                 * Honey (0 no NPC, ~40 no Mercado) estava marcado no painel. */
                else if (b.sell === 0) motivo = 'o NPC paga 0 — guardado (vale no Mercado)';
            }
            if (motivo) guardar.push(Object.assign({}, l, { nome, motivo })); else vender.push(nome);
        }
        return { guardar, vender };
    }
    /* A caixa de marcar do painel: input, aria-checked/pressed, data-state,
     * classe ou "✓". null = não dá para saber (aí quem decide é o total). */
    function estadoMarcado(el) {
        if (!el) return null;
        const tag = String(el.tagName || '').toLowerCase();
        if (tag === 'input' && typeof el.checked === 'boolean') return el.checked;
        const inp = el.querySelector ? el.querySelector('input[type="checkbox"]') : null;
        if (inp && typeof inp.checked === 'boolean') return inp.checked;
        const at = n => (el.getAttribute ? el.getAttribute(n) : null);
        const v = at('aria-checked') || at('aria-pressed') || at('data-checked') || at('data-state') || at('data-selected');
        if (v != null) { if (/^(true|checked|on|1|selected)$/i.test(v)) return true; if (/^(false|unchecked|off|0)$/i.test(v)) return false; }
        const cls = String(el.className || '');
        if (/(^|[\s_-])(unchecked|desmarcad[oa]|off)($|[\s_-])/i.test(cls)) return false;
        if (/(^|[\s_-])(checked|marcad[oa]|on|selected|ativo|is-checked)($|[\s_-])/i.test(cls)) return true;
        if (/[✓✔]/.test(el.textContent || '')) return true;
        /* 2.11.1 — confirmado ao vivo (29/09): a caixa do jogo é
         * <span class="s-sellp-check" data-testid="sell-check-<nome>">✓</span>, sem input
         * nem aria. Marcada = tem o ✓; sem o ✓ = desmarcada. */
        if (/(^|\s)s-sellp-check(\s|$)/.test(cls)) return false;
        return null;
    }
    /* Por que o gatilho não dispara ('' = dispara agora; null = tudo pronto,
     * só esperando a mochila). s = fotografia do estado (motivoNaoDispara). */
    function motivoNaoDisparaPuro(s) {
        if (!s.on) return 'chave desligada';
        if (s.huntId == null) return 'nenhuma hunt memorizada';
        if (s.boss) return 'boss em andamento'; // v2.11: nunca stop no meio de boss
        if (s.scan) return s.scan; // Scan rodando, terminando ou restaurando
        if (s.ciclo) return 'ciclo em andamento';
        if (s.trava) return s.trava + ' em andamento';
        if (s.aprendendo) return 'medindo dano das magias';
        if (s.outraAba) return 'outra aba do jogo está rodando o ciclo';
        if (!s.emHunt) return 'party fora da caçada';
        if (s.modal) return 'uma janela do jogo está aberta';
        if (s.resta > 0) return `trava de 5 min após o último ciclo — libera em ${Math.ceil(s.resta / 1000)} s`;
        if (!s.noLimite) return null;
        return '';
    }
    /* F5 no meio do ciclo: só retoma se o ciclo AUTOMÁTICO deixou marca
     * recente. Sem marca, o dono quis ficar na cidade. */
    const CICLO_PENDENTE_MS = 10 * 60 * 1000;
    function deveRetomarCiclo(a, pendente, agora) {
        if (!a || !a.on || a.huntId == null) return false;
        if (!pendente || !(pendente.t > 0)) return false;
        const idade = agora - pendente.t;
        return idade >= 0 && idade < CICLO_PENDENTE_MS;
    }
    const ciclosNaUltimaHora = (hist, agora) => (hist || []).filter(c => c && c.origem === 'auto' && agora - c.t < 3600000).length;
    /* Scan: `ended` que o próprio Scan não pediu = falha (morte, auto exit…). */
    function encerramentoNoScan(ctx) {
        if (!ctx || !ctx.ativo || ctx.esperado) return null;
        const r = String(ctx.reason == null ? '' : ctx.reason);
        const morte = /death|dead|died|killed|wipe|defeat|morr|morte/i.test(r);
        return { falha: true, morte, motivo: (morte ? 'morreu' : 'encerrou') + (r ? ' (' + r + ')' : '') };
    }
    /* Falha nunca apaga resultado bom anterior: fica o bom, com a nota. */
    function mesclarResultadoScan(anterior, novo) {
        const bom = r => !!(r && !r.erro && r.xpH != null);
        if (bom(novo) || !bom(anterior)) return novo;
        return Object.assign({}, anterior, { ultimaFalha: { t: novo.t, erro: novo.erro, xpH: novo.xpH != null ? novo.xpH : null, seg: novo.seg != null ? novo.seg : null } });
    }
    /* Janela medida pelo relógio do PRÓPRIO analisador (elapsedMs); o relógio
     * da página só se o do jogo não andou (frame velho, aba dormindo). */
    function segundosDaJanela(elAgora, elBase, segPagina) {
        const d = (Number(elAgora) || 0) - (Number(elBase) || 0);
        return d >= 5000 ? d / 1000 : Math.max(1, Number(segPagina) || 1);
    }
    const ouroBase = r => r.estavelH != null ? r.estavelH : r.ouroH; // v2.3.0: ranking de ouro pelo estável
    const xpBase = r => r.xpRawH != null ? r.xpRawH : r.xpH; // v2.11: xp SEM boost/prey (resultado antigo sem raw usa xp)
    /* Veredito relativo: quem chega a 90 % do melhor XP é "XP", 90 % do melhor
     * ouro (e positivo) é "Ouro", os dois é "Os dois".
     * v2.11 — JUSTO: XP pelo raw (boost e prey mudam de uma hora para outra);
     * medição "suja" (mochila < 10 %) e de outro nível (±2) ficam FORA do
     * ranking — aparecem, mas não competem. */
    function vereditosScan(todos, nivelRef) {
        const lista = (todos || []).filter(r => r && !r.erro && r.xpH != null);
        const ref = nivelRef > 1 ? nivelRef : Math.max(0, ...lista.map(r => r.nivel || 0)) || null;
        lista.forEach(r => { r.fora = r.suja ? 'suja' : (ref && r.nivel && Math.abs(r.nivel - ref) > 2) ? 'nivel' : null; });
        const rank = lista.filter(r => !r.fora);
        const melhorXp = Math.max(0, ...rank.map(xpBase)), melhorOuro = Math.max(0, ...rank.map(ouroBase));
        rank.forEach(r => {
            const pXp = melhorXp > 0 ? Math.round(xpBase(r) / melhorXp * 100) : 0;
            const pOuro = melhorOuro > 0 && ouroBase(r) > 0 ? Math.round(ouroBase(r) / melhorOuro * 100) : 0;
            const xp = pXp >= 90, ouro = pOuro >= 90;
            r.pXp = pXp; r.pOuro = pOuro;
            /* v2.2.4 — nunca "—": o dono leu como "sem veredito" (Barbarian
             * Camp, 27/09). Quem não chega a 90 % mostra o quanto ficou atrás. */
            r.veredito = xp && ouro ? 'Os dois' : xp ? 'XP' : ouro ? 'Ouro'
                : ouroBase(r) < 0 ? 'dá prejuízo'
                : rank.length === 1 ? 'único medido'
                : `abaixo: ${pXp}% do xp · ${pOuro}% do ouro`;
        });
        lista.filter(r => r.fora).forEach(r => { r.pXp = null; r.pOuro = null; r.veredito = r.fora === 'suja' ? 'suja (mochila)' : `outro nível (${r.nivel})`; });
        const porXp = (a, b) => xpBase(b) - xpBase(a);
        return { lista: rank.slice().sort(porXp).concat(lista.filter(r => r.fora).sort(porXp)), rank, melhorXp, melhorOuro, nivelRef: ref,
                 topXp: rank.slice().sort(porXp)[0] || null, topOuro: rank.slice().sort((a, b) => ouroBase(b) - ouroBase(a))[0] || null };
    }
    /* "ao terminar": 'ficar' só vale se o dono ESCOLHEU; o padrão antigo era
     * 'ficar' e deixava a party no último mapa medido, com o kit do Scan. */
    const fimDoScan = c => (!c || !c.fim || (c.fim === 'ficar' && !c.fimEscolhido)) ? 'voltar' : c.fim;
    /* @@AUTOHUNT-PURO-FIM */
    const AUTO_HUNT_PADRAO = { on: false, modo: 'pct', pct: 20, oz: 200, voltar: true, huntId: null,
                               nvEquip: true, nvImbu: true, nuncaVender: [] }; // v2.11 — "nunca vender", ligado por padrão
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
        /* v2.11 — pelo frame: xp ÷ xp raw da caçada é a mesma razão (as duas
         * por hora têm o mesmo tempo embaixo). A janela é só reserva. */
        const an = anDoFrame();
        if (an && an.xpRaw > 0 && an.xp > 0) return Math.round(an.xp / an.xpRaw * 100);
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

    /* @@AUTOHUNT-VENDA-INICIO */
    /* v2.11 — NUNCA VENDER. Materiais de imbuement: /assets/<versão>/imbuements.json
     * (cache 7 dias). Equipamento: /item/info pelo nome (basePorNome/idsPorNome
     * da área Equip, que já guardam cache). */
    let _materiaisImbu = null;
    async function materiaisImbuement() {
        if (_materiaisImbu) return _materiaisImbu;
        const c = ler('imbu_materiais', null);
        if (c && c.t && Date.now() - c.t < 7 * 864e5 && Array.isArray(c.m) && c.m.length) return (_materiaisImbu = c.m);
        const m = materiaisDoCatalogo(await buscarAsset('imbuements.json'));
        if (!m.length) throw new Error('imbuements.json veio sem materiais');
        _materiaisImbu = m; guardar('imbu_materiais', { t: Date.now(), m });
        return m;
    }
    let _nomesNorm = null, _nomesNormDe = null;
    function nomesNormalizados(ids) {
        /* nome normalizado E o id (se o painel usar sell-check-<id>) → nome real */
        if (_nomesNormDe !== ids) { _nomesNorm = {}; for (const n of Object.keys(ids || {})) { _nomesNorm[normNomeItem(n)] = n; if (ids[n] != null && _nomesNorm[String(ids[n])] == null) _nomesNorm[String(ids[n])] = n; } _nomesNormDe = ids; }
        return _nomesNorm;
    }
    /* Linhas do painel: cada sell-check-<item> (e sell-row-<item> de reserva).
     * Guarda o ELEMENTO e o índice entre iguais — dois "elvish bow" (iids
     * diferentes) teriam o mesmo data-testid e tid() só acha o primeiro. */
    function linhasDaVenda() {
        const p = tid('sell-panel'); if (!p) return { linhas: [], checks: 0, rows: 0 };
        const checks = $$('[data-testid^="sell-check-"]', p), rows = $$('[data-testid^="sell-row-"]', p);
        const vistos = {};
        const linhas = checks.map(el => {
            const testid = el.getAttribute('data-testid'), idx = vistos[testid] = (vistos[testid] == null ? 0 : vistos[testid] + 1);
            return { nome: testid.slice('sell-check-'.length), testid, idx, el };
        });
        if (!checks.length) rows.forEach(el => { const t = el.getAttribute('data-testid'); linhas.push({ nome: t.slice('sell-row-'.length), testid: t, idx: 0, el: null }); });
        return { linhas, checks: checks.length, rows: rows.length };
    }
    const totalVenda = () => { const t = tid('sell-total'); const n = t ? parseInt((t.textContent || '').replace(/\D/g, '')) : NaN; return Number.isFinite(n) ? n : null; };
    const elDaLinha = l => (l.el && l.el.isConnected) ? l.el : ($$(`[data-testid="${l.testid}"]`)[l.idx] || null);
    /* ponteiro SEM o click: segunda tentativa quando .click() foi ignorado —
     * se o primeiro valeu e a tela só atrasou, não desfaz a marcação */
    function ponteiroSemClique(el) {
        const r = el.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
        try { el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ pointerType: 'mouse', isPrimary: true }, o))); } catch { /* PointerEvent pode faltar */ }
        el.dispatchEvent(new MouseEvent('mousedown', o));
        try { el.dispatchEvent(new PointerEvent('pointerup', Object.assign({ pointerType: 'mouse', isPrimary: true, buttons: 0 }, o))); } catch { /* PointerEvent pode faltar */ }
        el.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, o, { buttons: 0 })));
    }
    /* Desmarca cada item protegido e confere: a caixa diz "desmarcado" OU o
     * total do painel baixou. Devolve os que não deu para desmarcar. */
    /* v2.11.4 — CLIQUE ESPAÇADO. Cada caixa do painel manda ao servidor um
     * city_sell_off com a lista INTEIRA do que não vender. Em 29/09 (ao vivo,
     * Djinns) o ciclo desmarcou ~24 equipamentos de uma vez: 48 envios em 5 s,
     * o servidor respondeu rate_limited e nenhuma caixa mudou — o ciclo parou
     * sem vender (a proteção certa, mas o Auto Hunt não completava nunca).
     * Agora: 400 ms entre cliques; veio rate_limited → pausa de 12 s e segue
     * a 3,2 s por clique (≤ 20/min), até 3 tentativas por caixa. */
    const VENDA_ESPACO_MS = 400, VENDA_ESPACO_LENTO_MS = 3200, VENDA_PAUSA_LIMITE_MS = 12000;
    const erroServidor = () => { try { return { t: ESTADO_WS.ultimoErro_t || 0, code: ESTADO_WS.ultimoErro }; } catch { return { t: 0, code: null }; } };
    /* v2.11.7 — visto ao vivo (29/09): desmarcar REMOVE o <span ✓> e a linha
     * sell-row-<nome> ganha a classe s-sellp-cell--dim. Com a caixa sumida e o
     * total igual (item que o NPC paga 0), o helper achava que o clique falhou. */
    function linhaDesmarcada(g) {
        const el = elDaLinha(g);
        if (el) return estadoMarcado(el) === false;
        const nome = String(g.testid || '').replace(/^sell-check-/, '');
        const row = $$(`[data-testid="sell-row-${nome}"]`)[g.idx || 0];
        return !!(row && /(^|\s)s-sellp-cell--dim(\s|$)/.test(row.className || ''));
    }
    async function desmarcarNaVenda(guardarLista) {
        const falhas = [];
        let espaco = VENDA_ESPACO_MS, ultimo = 0;
        for (const g of guardarLista) {
            if (linhaDesmarcada(g)) continue;
            if (!elDaLinha(g)) { falhas.push(g.nome + ' (caixa sumiu)'); continue; }
            let ok = false;
            for (let tent = 0; tent < 3 && !ok; tent++) {
                const el = elDaLinha(g);
                if (!el) break;
                if (linhaDesmarcada(g)) { ok = true; break; }
                const falta = ultimo + espaco - Date.now(); if (falta > 0) await dorme(falta);
                const t0 = totalVenda(), e0 = erroServidor().t;
                const saiu = () => linhaDesmarcada(g) || (t0 != null && totalVenda() != null && totalVenda() < t0);
                el.click(); ultimo = Date.now();
                ok = !!(await esperarQue(saiu, 1500, 100));
                if (ok) break;
                const e = erroServidor();
                if (e.t > e0 && e.code === 'rate_limited') { espaco = VENDA_ESPACO_LENTO_MS; await dorme(VENDA_PAUSA_LIMITE_MS); ultimo = Date.now(); continue; }
                if (tent === 0 && estadoMarcado(elDaLinha(g)) !== false && totalVenda() === t0 && elDaLinha(g)) { ponteiroSemClique(elDaLinha(g)); ultimo = Date.now(); ok = !!(await esperarQue(saiu, 1500, 100)); }
                break;
            }
            if (!ok) falhas.push(g.nome);
        }
        return falhas;
    }
    async function protecaoVenda() {
        const a = autoHunt();
        const o = { equip: a.nvEquip !== false, imbu: a.nvImbu !== false, lista: Array.isArray(a.nuncaVender) ? a.nuncaVender : [], materiais: [], nomes: null, base: {} };
        if (o.imbu) o.materiais = await materiaisImbuement();
        if (o.equip) o.nomes = nomesNormalizados(await idsPorNome());
        return o;
    }

    /* Passo 3 — VENDER NO NPC. Vende o que o painel marcar, MENOS a lista
     * "nunca vender" (v2.11 — antes era tudo; dono, 27/09).
     * Âncoras (27/09): sell-panel, sell-list, sell-row-<item>, sell-check-<item>,
     * sell-total, sell-confirm ("VENDER N ouro"), sell-cancel, panel-close.
     * ⚠ Em 27/09 o primeiro teste clicou em sell-confirm com .click() e NADA
     * aconteceu: painel aberto, ouro igual. Por isso: clique completo, espera
     * por confirm-ok (se o jogo pedir), e o sucesso é medido pelo OURO.
     * ⚠ v2.11 — o formato de sell-check-<item> (nome com espaço? slug?) e
     * como a caixa mostra "marcado" NÃO foram vistos com conta logada: tudo
     * é defensivo. Qualquer dúvida sobre o que ia ser vendido = não vende. */
    async function venderNoNpc() {
        const abrir = tid('actionbar-selling');
        if (!abrir) return { erro: 'botão VENDER (actionbar-selling) não está na tela — precisa estar na cidade' };
        let prot;
        try { prot = await protecaoVenda(); }
        catch (e) { return { erro: 'não consegui montar a lista "nunca vender" (' + e.message + ') — nada vendido' }; }
        abrir.click();
        const painel = await esperarQue(() => tid('sell-panel'), 6000, 150);
        if (!painel) return { erro: 'painel de venda não abriu' };
        const fecharPainel = () => { const c = tid('sell-cancel') || (tid('sell-panel') && tid('sell-panel').querySelector('[data-testid="panel-close"]')); if (c) c.click(); };
        /* v2.11 — o total era lido após 500 ms fixos. Agora espera o painel
         * MONTAR: total com número e igual em 3 leituras seguidas (~450 ms). */
        let ultimo = null, iguais = 0;
        const montado = await esperarQue(() => {
            const t = tid('sell-total'), txt = t ? (t.textContent || '').trim() : '';
            const n = $$('[data-testid^="sell-check-"],[data-testid^="sell-row-"]', tid('sell-panel') || document).length;
            const assin = txt + '|' + n;
            iguais = assin === ultimo ? iguais + 1 : 0; ultimo = assin;
            const cf = tid('sell-confirm'), vazio = !n && (!cf || cf.disabled); // painel vazio pode vir sem número no total
            return (/\d/.test(txt) || vazio) && iguais >= 3;
        }, 6000, 150);
        if (!montado) { fecharPainel(); await dorme(400); return { erro: 'painel de venda abriu mas o total (sell-total) não assentou em 6 s — nada vendido' }; }
        const totalAntes = totalVenda() || 0;
        let guardados = [];
        if (totalAntes > 0) {
            const lv = linhasDaVenda();
            if (!lv.linhas.length) { fecharPainel(); await dorme(400); return { erro: 'painel com total ' + totalAntes + ' mas sem linhas (sell-check-*/sell-row-*) — não sei o que ia vender, nada vendido' }; }
            if (prot.equip) {
                const reais = lv.linhas.map(l => prot.nomes[normNomeItem(l.nome)]).filter(Boolean);
                try { prot.base = await basePorNome(reais); } catch (e) { prot.base = {}; }
            }
            const sel = escolherDesmarcar(lv.linhas, prot);
            guardados = sel.guardar;
            if (guardados.length) {
                if (!lv.checks) { fecharPainel(); await dorme(400); return { erro: `achei ${guardados.length} item(ns) para NÃO vender (${guardados.map(g => g.nome).join(', ')}) mas o painel não tem as caixas sell-check-* — nada vendido` }; }
                const falhas = await desmarcarNaVenda(guardados);
                const ainda = guardados.filter(g => !linhaDesmarcada(g) && estadoMarcado(elDaLinha(g)) === true).map(g => g.nome);
                const semEstado = guardados.some(g => !linhaDesmarcada(g) && estadoMarcado(elDaLinha(g)) == null);
                const totalDepois = totalVenda();
                const problema = falhas.length ? 'não consegui desmarcar ' + falhas.join(', ')
                    : ainda.length ? 'continuam marcados: ' + ainda.join(', ')
                    : (semEstado && !(totalDepois != null && totalDepois < totalAntes)) ? `desmarquei ${guardados.length} item(ns) e o total não baixou (${totalAntes} → ${totalDepois})` : null;
                if (problema) { fecharPainel(); await dorme(400); return { erro: problema + ' — painel fechado, NADA vendido (lista "nunca vender")' }; }
                log(`nunca vender: ${guardados.map(g => g.nome + ' (' + g.motivo + ')').join(', ')} — total ${totalAntes.toLocaleString('pt-BR')} → ${(totalDepois || 0).toLocaleString('pt-BR')}`, 'info');
            }
        }
        const total = ((tid('sell-total') || {}).textContent || '?').trim();
        const totalNum = parseInt(total.replace(/\D/g, '')) || 0;
        const confirmar = tid('sell-confirm');
        if (!confirmar || confirmar.disabled || !totalNum) {
            fecharPainel();
            await dorme(400);
            log('nada para vender (total ' + total + ')' + (guardados.length ? ' — tudo que havia está na lista "nunca vender"' : ''), 'info');
            return { ok: true, vazio: true, guardados };
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
        return { ok: true, total: totalNum, guardados };
    }
    /* @@AUTOHUNT-VENDA-FIM */

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
        /* v2.11 — lugares "113 de 300" viram número: o histórico mostra o depot
         * enchendo e o ciclo sabe quando ele lotou */
        const ml = lugares.replace(/\./g, '').match(/(\d+)\s*(?:de|\/)\s*(\d+)/i);
        return { ok: true, lugares, depUsado: ml ? +ml[1] : null, depTotal: ml ? +ml[2] : null };
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

    /* v2.11 — TRAVA COMUM do jogo (item 4 da auditoria). Em 29/09 achado no
     * código: scanTerminar punha SCAN.ativo=false ANTES de ir para o melhor
     * mapa, e o gatilho do Auto Hunt (3 s) podia disparar o ciclo no meio da
     * troca; o "ir ›" do Scan também não olhava o ciclo. Quem mexe no mapa
     * (ciclo de venda, Scan, restauração do Scan, "ir ›") pergunta aqui antes
     * e ocupa enquanto trabalha. Devolve o nome de quem ocupa, ou null. */
    let _travaJogo = null;
    const scanOcupado = () => SCAN.ativo || SCAN.ocupado || SCAN.restaurando;
    function travaJogo() {
        if (_cicloEmCurso) return 'ciclo de venda';
        if (scanOcupado()) return SCAN.ativo ? 'Scan' : 'Scan (terminando/restaurando)';
        return _travaJogo;
    }

    /* v2.11 — HISTÓRICO dos últimos 20 ciclos (hora, duração, ouro vendido,
     * oz antes/depois, depot, erro) e alarme se passar de 3 por hora: mochila
     * enchendo em < 20 min é limite mal posto ou depot que não esvazia. */
    const MAX_HIST_CICLOS = 20;
    const historicoCiclos = () => ler('ciclos_hist', []);
    let _alarmeCiclosEm = 0;
    function anotarCiclo(reg) {
        const h = historicoCiclos(); h.push(reg);
        while (h.length > MAX_HIST_CICLOS) h.shift();
        guardar('ciclos_hist', h);
        try { radarCiclo(reg); } catch { /* o relatório do dia nunca derruba o ciclo */ }
        const n = ciclosNaUltimaHora(h, Date.now());
        if (n > 3 && Date.now() - _alarmeCiclosEm > 3600000) {
            _alarmeCiclosEm = Date.now();
            log(`⚠ ${n} ciclos de venda na última hora — a mochila enche em menos de 20 min: limite alto demais, depot cheio ou venda falhando (veja o histórico na aba Auto Hunt)`, 'erro');
        }
    }

    /* origem: 'auto' (gatilho da mochila: passos 1-5), 'venda' (botão Venda
     * rápida: passos 1-4 — encerra se estiver caçando — e FICA na cidade) ou
     * 'finalizar' (botão Finalizar hunt: só o passo 1). Decisão do dono em
     * 27/09: "Venda rápida completa: um clique dentro da hunt encerra,
     * purifica, vende, guarda e fica na cidade". */
    const NOME_ORIGEM = { auto: 'AUTO HUNT', venda: 'Venda rápida', finalizar: 'Finalizar hunt', bestiario: 'Bestiário' };
    async function cicloDeVenda(origem) {
        if (_cicloEmCurso) { log('ciclo já em andamento', 'erro'); return false; }
        if (_aprendendo) { log('medindo dano — ciclo adiado', 'erro'); return false; }
        if (cicloTravadoPorOutraAba()) { log('outra aba do jogo está rodando o ciclo — esta aba fica quieta', 'erro'); return false; }
        const ocup = travaJogo();
        if (ocup) { log(`${NOME_ORIGEM[origem] || origem}: ${ocup} em andamento — espera terminar`, 'erro'); return false; }
        _cicloEmCurso = true;
        guardar('ciclo_lock', { aba: ABA_ID, t: Date.now() });
        renderizar();
        const a = autoHunt();
        const c0 = capLivre();
        const reg = { t: Date.now(), origem, dur: null, ouro: null, ozAntes: c0 ? c0.usado : null, ozDepois: null, depot: null, erro: null, guardados: 0 };
        /* v2.11 — a mensagem dizia "AUTO HUNT parou" até na Venda rápida */
        const desligar = (passo, erro) => {
            reg.erro = passo + ': ' + erro;
            log(`${NOME_ORIGEM[origem] || origem} parou no passo "${passo}": ${erro}` + (a.on ? ' — automação DESLIGADA' : ''), 'erro');
            if (a.on) guardarAutoHunt({ on: false });
            /* v2.11.10 — a venda do modo "completar bestiário" falhou: o modo para (senão voltaria a tentar a cada 5 min) */
            /* v2.11.15 — e devolve os kits de antes (antes a foto era jogada fora e o kit do bestiário ficava);
             * o bestEncerrar espera o ciclo terminar antes de mexer nos perfis */
            if (origem === 'bestiario' && BEST.ativo) bestEncerrar('modo "completar" DESLIGADO (a venda falhou) — kits devolvidos', 'erro', 'perfis').catch(e => falhou('bestiário (encerrar)', e));
        };
        try {
            log(`ciclo de venda (${origem}) iniciado — mochila ${c0 ? c0.pct + '% livre' : '?'}`, 'info');
            /* v2.11 — marca de ciclo AUTOMÁTICO em curso: é só ela que autoriza
             * o boot a retomar depois de um F5 (antes o boot retomava sempre
             * que a chave estava ligada e a party na cidade — voltava a caçar
             * mesmo quando o dono tinha ficado na cidade de propósito). */
            if (origem === 'auto') guardar('ciclo_pendente', { t: Date.now(), huntId: a.huntId });
            /* Já na cidade (ciclo retomado depois de uma recarga, ou Venda
             * rápida fora da hunt): pula o encerrar em vez de falhar. */
            if (origem === 'finalizar' || emHunt()) {
                const r1 = await finalizarHunt();
                if (r1.erro) { desligar('finalizar', r1.erro); return false; }
                if (origem === 'finalizar') return true;
                await dorme(800); // a cidade termina de montar
            }
            const r2 = await purificarTodos();
            if (r2.pulou) log('purificar: ' + r2.pulou + ' (pulei)', 'info');
            const r3 = await venderNoNpc();
            if (r3.erro) { desligar('vender', r3.erro); return false; }
            reg.ouro = r3.total || 0; reg.guardados = (r3.guardados || []).length;
            const r4 = await guardarNoDepot();
            if (r4.erro) { desligar('depot', r4.erro); return false; }
            if (r4.depTotal) reg.depot = { usado: r4.depUsado, total: r4.depTotal };
            /* v2.11 — DEPOT CHEIO: o "guardar tudo" manda só o que couber. Se a
             * mochila continua no limite, voltar à caçada dispararia outro
             * ciclo em 5 min, para sempre. Para aqui e desliga. */
            if (mochilaNoLimite()) {
                const c = capLivre();
                desligar('depot', `a mochila continua no limite depois do depot (${c ? c.pct + '% livre' : '?'}${r4.lugares ? ' · depot ' + r4.lugares : ''}) — depot cheio?`);
                return false;
            }
            /* v2.11.10 — com o modo "completar bestiário" ligado, a volta é para a
             * caçada do bestiário, não para a memorizada (dono, 29/09: "e se a
             * mochila encher fazendo bestiário?") */
            const destino = bestAlvoId() != null ? bestAlvoId() : a.huntId;
            if (origem === 'bestiario' || (origem === 'auto' && a.voltar)) {
                if (destino == null) { desligar('voltar', 'nenhuma hunt memorizada'); return false; }
                const r5 = await voltarParaHunt(destino);
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
            if (origem === 'auto') guardar('ciclo_pendente', null);
            try {
                const c1 = capLivre();
                reg.dur = Math.round((Date.now() - reg.t) / 1000); reg.ozDepois = c1 ? c1.usado : null;
                if (origem !== 'finalizar') anotarCiclo(reg);
            } catch { /* histórico nunca derruba o ciclo */ }
            renderizar();
        }
    }

    /* v1.9.7 — POR QUE NÃO DISPAROU. Em 27/09 o dono ligou a chave com 97 %
     * e nada aconteceu: era a trava de 5 min (a Venda rápida de instantes
     * antes contou como ciclo). A tela agora diz o motivo, com contagem.
     * v2.11 — boss em andamento (nunca stop no meio de boss), Scan ainda
     * ocupado depois de desligar (terminando/restaurando) e a trava comum. */
    function motivoNaoDispara() {
        const a = autoHunt();
        return motivoNaoDisparaPuro({
            on: a.on, huntId: a.huntId, boss: !!ESTADO_WS.boss,
            scan: SCAN.ativo ? 'Scan em andamento' : scanOcupado() ? 'Scan terminando/restaurando' : null,
            ciclo: _cicloEmCurso, trava: _travaJogo, aprendendo: _aprendendo, outraAba: cicloTravadoPorOutraAba(),
            emHunt: emHunt(), modal: modalAberto(), resta: CICLO_INTERVALO_MIN_MS - (Date.now() - _ultimoCiclo),
            noLimite: mochilaNoLimite()
        });
    }
    function gatilhoAutoHunt() {
        ouvirEncerramentos();
        /* v2.11 — marca de ciclo que ficou para trás (a party já está caçando
         * de novo, ou passou do prazo) não pode autorizar retomada depois */
        const p = ler('ciclo_pendente', null);
        if (p && !_cicloEmCurso && (emHunt() || !(Date.now() - p.t < CICLO_PENDENTE_MS))) guardar('ciclo_pendente', null);
        if (motivoNaoDispara() !== '') return;
        cicloDeVenda('auto');
    }

    /* v2.11 — `ended` OUVIDO À PARTE. O observador do socket (outra área)
     * zera o frame no `ended` mas não o huntId; o Scan em 'medindo' seguia
     * achando que a party estava no mapa, gravava m=null (invisível na
     * tabela) e ia para o próximo com lure máximo — depois de uma MORTE.
     * Este ouvinte só lê: pega o `ended` com summary.reason e avisa o Scan. */
    function ouvirEncerramentos() {
        const ws = WS.socket;
        if (!ws || ws.__tbEncerramentos || !ws.addEventListener) return;
        ws.__tbEncerramentos = true;
        ws.addEventListener('message', ev => {
            try {
                if (typeof ev.data !== 'string' || ev.data.indexOf('"ended"') < 0) return;
                const o = JSON.parse(ev.data);
                if (o && o.type === 'ended') aoEncerrarCacada((o.data && o.data.summary) || {});
            } catch { /* frame que não é JSON: não é comigo */ }
        });
    }
    function aoEncerrarCacada(sm) {
        const f = encerramentoNoScan({ ativo: SCAN.ativo, esperado: Date.now() - (SCAN.stopEnviado || 0) < 40000, reason: sm.reason });
        if (!f || SCAN.encerrou) return;
        SCAN.encerrou = Object.assign({ t: Date.now(), huntId: sm.huntId != null ? sm.huntId : null }, f);
        log(`Scan: a caçada ${f.morte ? 'terminou em MORTE' : 'foi encerrada por fora do Scan'}${sm.reason ? ' (motivo do servidor: ' + sm.reason + ')' : ''} — o Scan vai parar`, 'erro');
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
     *
     *  v2.11 — o Scan DEVOLVE o jogo como achou: foto do mapa, do lure e dos
     *  perfis (kits) ao ligar; ao parar/terminar volta para o mapa de antes
     *  (se "ficar" não foi escolhido de propósito) e reenvia os perfis que
     *  existiam. Morte/`ended` por fora para o Scan e fica registrado.
     * ====================================================================== */
    const SCAN_PADRAO = { mapas: [], minutos: 5, lureMax: true, fim: 'voltar', modelo: 'equilibrado', comparar: false,
                          variantes: ['area', 'equilibrado', 'economica'] }; // comparar: cada mapa × cada variante (estudo)
    const scanCfg = () => Object.assign({}, SCAN_PADRAO, ler('scan_cfg', {}));
    const guardarScanCfg = (patch) => guardar('scan_cfg', Object.assign(scanCfg(), patch));
    const scanResultados = () => ler('scan_resultados', {});
    /* v2.14.3 — a configuração DESTA rodada: a do Scan com o que quem ligou pediu por cima (o Radar pede 3 min, lure
     * máximo e o kit do ranking sem mexer na configuração guardada do Scan) */
    const scanCfgRodada = () => Object.assign(scanCfg(), (SCAN && SCAN.over) || {});
    const SCAN = { ativo: false, fila: [], idx: -1, huntId: null, fase: 'parado', t0: 0, base: null, vivo: null, capMin: 100, erro: null, ocupado: false, iniciadoEm: 0,
                   foto: null, rodada: 0, restaurando: false, encerrou: null, stopEnviado: 0, endedN: 0 }; // v2.11
    const CAP_MIN_SCAN = 10; // abaixo disso o loot se perde e a medição sai suja

    function scanIniciar(over) {
        const c = Object.assign(scanCfg(), over || {});
        const ids = c.mapas.filter(id => (CAT.hunts || []).some(h => h.id === id));
        const modelos = c.comparar ? (c.variantes || []).filter(m => MODELOS[m] && m !== 'boss') : [c.modelo || 'equilibrado'];
        const fila = [];
        for (const id of ids) for (const modelo of modelos) fila.push({ id, modelo, opcInt: (over && over.opcInt) || null });
        if (!fila.length) { log('Scan: marque pelo menos um mapa' + (c.comparar ? ' e uma variante' : ''), 'erro'); return false; }
        if (!socketAberto() || !ESTADO_WS.perfisDoServidor) { log('Scan: socket sem perfis — dá um F5 com o helper instalado', 'erro'); return false; }
        const ocup = travaJogo();
        if (ocup) { log('Scan: ' + ocup + ' em andamento — espera terminar', 'erro'); return false; }
        if (ESTADO_WS.boss) { log('Scan: boss em andamento — termina o boss antes', 'erro'); return false; }
        if (BEST.ativo) { log('Scan: o modo "completar bestiário" está ligado (aba Progresso) — pare ele antes', 'erro'); return false; }
        ouvirEncerramentos();
        /* v2.11 — FOTO do jogo antes de mexer: mapa, lure e perfis por vocação */
        const cacando = frameFresco() && ESTADO_WS.huntId != null;
        const foto = { t: Date.now(), huntId: cacando ? ESTADO_WS.huntId : null, lureTier: cacando ? ESTADO_WS.frame.lureTier : null,
                       profiles: ESTADO_WS.profiles ? clonar(ESTADO_WS.profiles) : null };
        Object.assign(SCAN, { ativo: true, fila, idx: -1, huntId: null, fase: 'proximo', t0: 0, base: null, vivo: null, capMin: 100, erro: null, ocupado: false, iniciadoEm: Date.now(),
                              foto, rodada: Date.now(), restaurando: false, encerrou: null, stopEnviado: 0, endedN: WS.tipos.ended || 0, over: over || null });
        const hf = foto.huntId != null ? (CAT.hunts || []).find(h => h.id === foto.huntId) : null;
        log(`Scan LIGADO — ${fila.length} medição(ões), ${c.minutos} min cada, lure ${c.lureMax ? 'máximo' : 'como está'}, ${c.comparar ? 'estudo: ' + modelos.map(nomeModelo).join(' · ') : nomeModelo(c.modelo || 'equilibrado')} · ao terminar: ${({ voltar: 'volta para ' + (hf ? hf.title : foto.huntId != null ? 'o mapa ' + foto.huntId : 'a cidade'), ficar: 'fica no último mapa', xp: 'vai para o melhor XP', ouro: 'vai para o melhor ouro' })[fimDoScan(c)]}`, 'ok');
        renderizar();
        return true;
    }
    /* restaurar: 'tudo' (mapa + perfis — botão de parar), 'perfis' (morte ou
     * party movida por fora: não reentra em caçada sozinho) ou 'nada' (boss
     * ou ciclo de venda no meio: não mexer). */
    function scanParar(motivo, tipo, restaurar) {
        if (!SCAN.ativo) return;
        SCAN.ativo = false; SCAN.fase = 'parado'; SCAN.huntId = null; SCAN.base = null; SCAN.vivo = null;
        log('Scan desligado' + (motivo ? ': ' + motivo : ''), tipo || 'info');
        const modo = restaurar || 'tudo';
        if (SCAN.foto && modo !== 'nada') {
            SCAN.restaurando = true; // fecha a janela até a restauração pegar a vez
            scanRestaurar(modo).catch(e => log('Scan: restaurar estourou — ' + e.message, 'erro'));
        } else if (SCAN.foto) { SCAN.foto = null; log('Scan: jogo NÃO restaurado (' + (motivo || 'parado') + ') — mapa e kits ficaram como o Scan deixou', 'info'); }
        renderizar();
    }
    /* v2.11 — DEVOLVE O JOGO. Espera o passo em curso do Scan sair (ele vê
     * SCAN.ativo=false depois de cada espera), ocupa a trava e restaura. */
    async function scanRestaurar(modo) {
        SCAN.restaurando = true;
        try {
            await esperarQue(() => !SCAN.ocupado, 60000, 250);
            const foto = SCAN.foto; SCAN.foto = null;
            if (!foto) return;
            SCAN.ocupado = true; SCAN.fase = 'restaurando'; renderizar();
            try { await _scanRestaurar(foto, modo); } finally { SCAN.ocupado = false; SCAN.fase = 'parado'; }
        } finally { SCAN.restaurando = false; renderizar(); }
    }
    async function _scanRestaurar(foto, modo, quem) {
        quem = quem || 'Scan';
        if (_cicloEmCurso || ESTADO_WS.boss) { log(quem + ': ' + (ESTADO_WS.boss ? 'boss' : 'ciclo de venda') + ' em andamento — jogo NÃO restaurado', 'erro'); return; }
        if (!socketAberto()) { log(quem + ': socket fechado — jogo NÃO restaurado (mapa e kits como o ' + quem + ' deixou)', 'erro'); return; }
        if (modo === 'tudo') {
            try { await scanVoltarMapa(foto, quem); } catch (e) { log(quem + ': voltar ao mapa de antes falhou — ' + e.message, 'erro'); }
        }
        try { await scanRestaurarPerfis(foto, quem); } catch (e) { log(quem + ': restaurar os kits falhou — ' + e.message, 'erro'); }
    }
    async function scanVoltarMapa(foto, quem) {
        quem = quem || 'Scan';
        const cacando = () => frameFresco() && ESTADO_WS.huntId != null;
        if (foto.huntId == null) {
            if (!cacando()) return;
            const r = await scanEncerrarCacada();
            log(r.erro ? quem + ': não voltei para a cidade — ' + r.erro : quem + ': party de volta à cidade, como estava antes do ' + quem, r.erro ? 'erro' : 'ok');
            return;
        }
        const h = (CAT.hunts || []).find(x => x.id === foto.huntId);
        if (!h) { log(quem + ': mapa de antes (id ' + foto.huntId + ') não está no catálogo — fiquei onde estou', 'erro'); return; }
        const r = await scanEntrar(h, { lure: foto.lureTier != null ? foto.lureTier : 1 }); // lure desconhecido: o menor
        log(r.erro ? quem + ': não voltei para ' + h.title + ' — ' + r.erro : quem + ': de volta a ' + h.title + ' (lure ' + lureTexto(h, r.lure) + '), como antes do ' + quem, r.erro ? 'erro' : 'ok');
    }
    /* Reenvia SÓ os perfis que existiam na foto e que mudaram — o objeto
     * inteiro que o servidor mandou (presets, curas, poções), não um molde.
     * Caçando, manda também o update_battle_config do perfil ativo, como a
     * janela de atalhos faz. */
    async function scanRestaurarPerfis(foto, quem) {
        quem = quem || 'Scan';
        if (!foto.profiles) return;
        const cacando = emHunt();
        let n = 0;
        for (const voc of VOCS) {
            const p = foto.profiles[voc];
            if (!p || !Array.isArray(p.list) || !p.list.length) continue;
            if (ESTADO_WS.profiles && JSON.stringify(ESTADO_WS.profiles[voc]) === JSON.stringify(p)) continue;
            const who = cacando ? indiceDaVoc(voc) : null;
            const ativo = p.list[p.active >= 0 && p.active < p.list.length ? p.active : 0];
            if (cacando && who != null && ativo && ativo.config) enviarWS({ type: 'update_battle_config', data: payloadBattleConfig(normalizarConfig(ativo.config), who) });
            enviarWS({ type: 'profiles_set', data: { vocation: voc, profiles: clonar(p) } });
            n++;
            await dorme(150);
        }
        log(n ? `${quem}: kits de ${n} personagem(ns) devolvidos como estavam antes do ${quem}` : quem + ': kits já estavam como antes do ' + quem, 'ok');
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
        /* v2.11 — janela pelo elapsedMs do analisador do jogo (o relógio da
         * página conta também o tempo de frame atrasado e de aba dormindo) */
        const seg = segundosDaJanela(a.elapsedMs, b.elapsedMs, (Date.now() - SCAN.t0) / 1000);
        const d = { xp: a.xp - b.xp, kills: a.kills - b.kills, loot: a.lootGold - b.lootGold, sup: a.suppliesGold - b.suppliesGold, xpRaw: a.xpRaw - b.xpRaw,
                    tomado: (a.damageTaken || 0) - (b.damageTaken || 0), dado: (a.damageDealt || 0) - (b.damageDealt || 0), cura: (a.healingDone || 0) - (b.healingDone || 0) };
        /* poção por personagem: delta de supplyUsed entre a base e agora */
        const pf = (ESTADO_WS.frame && ESTADO_WS.frame.party) || [], pb = SCAN.baseParty || [];
        const supVoc = {};
        for (const p of pf) { const b0 = pb.find(x => x.voc === p.voc); const g = p.suppliesGold - (b0 ? b0.suppliesGold : 0); const itens = {}; for (const [n, u] of Object.entries(p.supplyUsed || {})) { const c0 = b0 && b0.supplyUsed && b0.supplyUsed[n] ? b0.supplyUsed[n].count : 0; const dc = (u.count || 0) - c0; if (dc > 0) itens[n] = dc; } supVoc[p.voc] = { ouro: g, itens }; }
        const dDrops = {}; Object.keys(a.drops || {}).forEach(k => { const n = (a.drops[k] || 0) - ((b.drops || {})[k] || 0); if (n > 0) dDrops[k] = n; });
        const div = scanDividirLoot(SCAN.huntId, dDrops, d.kills);
        const porH = x => Math.round(x / seg * 3600);
        return { seg, xpH: porH(d.xp), xpRawH: porH(d.xpRaw), abatesH: porH(d.kills), lootH: porH(d.loot), supH: porH(d.sup), ouroH: porH(d.loot - d.sup),
                 estavelH: div ? porH(div.estavel - d.sup) : null, sorte: div ? div.sorte : null, sorteH: div ? porH(div.sorte) : null, raros: div ? div.raros : [],
                 tomadoH: porH(d.tomado), dadoH: porH(d.dado), curaH: porH(d.cura), supVoc, razao: razaoResumo(RAZAO),
                 xp: d.xp, kills: d.kills, loot: d.loot, sup: d.sup, xpRaw: d.xpRaw };
    }
    /* stop pelo socket + espera o `ended` + fecha o resumo. v2.11: anota a
     * hora do stop — o `ended` que chega por causa dele é do próprio Scan. */
    async function scanEncerrarCacada() {
        SCAN.stopEnviado = Date.now();
        enviarWS({ type: 'stop', data: {} });
        const saiu = await esperarQue(() => !frameFresco() || tid('summary-close'), 25000, 250);
        const fecharR = await esperarQue(() => tid('summary-close'), 3000, 150);
        if (fecharR) fecharR.click();
        if (!saiu) return { erro: 'mandei stop e a caçada não encerrou em 25 s' };
        await dorme(600);
        return { ok: true };
    }
    /* opc.lure (v2.11): tier pedido — a restauração volta com o lure de antes */
    async function scanEntrar(h, opc) {
        const c = scanCfgRodada();
        const nTiers = h.lureTiers && h.lureTiers.length ? h.lureTiers.length : 1;
        const pedido = opc && opc.lure != null ? Math.max(1, Math.min(nTiers, Math.round(Number(opc.lure)) || 1)) : null;
        const lure = pedido != null ? pedido : (c.lureMax && h.lureTiers && h.lureTiers.length) ? h.lureTiers.length : 1;
        const jaNele = ESTADO_WS.huntId === h.id && frameFresco() && !ESTADO_WS.boss;
        if (!jaNele) {
            /* v2.2.2 — de DENTRO de uma caçada o servidor recusa start_hunt
             * ("already_hunting"). O cliente faz: stop → espera ended →
             * start_hunt. O `ended` abre o resumo; fecha-se em seguida. */
            if (frameFresco() && ESTADO_WS.huntId != null) {
                const r0 = await scanEncerrarCacada();
                if (r0.erro) return r0;
            }
            const t = Date.now();
            ESTADO_WS.ultimoErro = null;
            enviarWS({ type: 'start_hunt', data: { huntId: h.id, lure } });
            const ok = await esperarQue(() => ESTADO_WS.huntId === h.id && ESTADO_WS.hunt_t >= t, 20000, 250);
            /* o resumo da caçada anterior abre ao trocar — fecha sem ninguém ver */
            const fechar = await esperarQue(() => tid('summary-close'), 2500, 150);
            if (fechar) { fechar.click(); }
            if (!ok) return { erro: 'start_hunt enviado e o servidor não confirmou a entrada em 20 s' + (ESTADO_WS.ultimoErro ? ' (erro do servidor: ' + ESTADO_WS.ultimoErro + ')' : '') };
        } else if (pedido != null) {
            if (ESTADO_WS.frame.lureTier !== pedido) {
                enviarWS({ type: 'set_lure', data: { tier: pedido } });
                await esperarQue(() => frameFresco() && ESTADO_WS.frame.lureTier === pedido, 6000, 250);
            }
        } else if (c.lureMax) {
            try { await lureNoMaximoSocket(h); } catch (e) { falhou('lure do Scan', e); }
        }
        await esperarQue(() => frameFresco() && ESTADO_WS.frame.an, 8000, 250);
        return { ok: true, lure };
    }
    /* v2.11 — morte / `ended` por fora: grava a parcial (SCAN.vivo) como
     * falha, sem apagar resultado bom anterior, e para o Scan devolvendo os
     * kits (não reentra em caçada sozinho depois de uma morte). */
    function scanFalhaEncerrou() {
        const f = SCAN.encerrou, h = scanHuntAtual();
        SCAN.encerrou = null;
        const parcial = SCAN.fase === 'medindo' ? (SCAN.vivo || null) : null;
        if (h) scanGravar(h, parcial, f.motivo + (parcial ? ` — parcial de ${Math.max(1, Math.round(parcial.seg / 60))} min` : ''));
        scanParar((h ? h.title + ': ' : '') + f.motivo, 'erro', 'perfis');
    }
    async function scanPasso() {
        if (!SCAN.ativo || SCAN.ocupado) return;
        SCAN.ocupado = true;
        try {
            /* reserva do ouvinte de `ended`: o contador do grampo subiu durante
             * a medição e não foi stop do Scan → encerrou por fora */
            if (!SCAN.encerrou && SCAN.fase === 'medindo' && (WS.tipos.ended || 0) > SCAN.endedN && Date.now() - (SCAN.stopEnviado || 0) > 40000) {
                SCAN.encerrou = { falha: true, morte: false, motivo: 'encerrou (ended sem motivo lido)', t: Date.now() };
            }
            if (SCAN.encerrou) { scanFalhaEncerrou(); return; }
            if (!socketAberto()) { SCAN.erro = 'socket fechado'; return; }
            if (ESTADO_WS.boss) { scanParar('boss em andamento — retome quando terminar', 'erro', 'nada'); return; }
            if (_cicloEmCurso) { scanParar('ciclo de venda em andamento', 'erro', 'nada'); return; }
            if (SCAN.fase === 'proximo') {
                SCAN.idx++;
                if (SCAN.idx >= SCAN.fila.length) { await scanTerminar(); return; }
                const h = scanHuntAtual();
                SCAN.huntId = h.id; SCAN.fase = 'entrando'; SCAN.base = null; SCAN.vivo = null; SCAN.capMin = 100; SCAN.erro = null;
                log(`Scan ${SCAN.idx + 1}/${SCAN.fila.length}: entrando em ${h.title}…`, 'info');
                renderizar();
                const r = await scanEntrar(h);
                if (!SCAN.ativo) return; // v2.11: desligaram no meio — a restauração cuida do resto
                if (r.erro) { scanGravar(h, null, r.erro); SCAN.fase = 'proximo'; log(`Scan: ${h.title} pulado — ${r.erro}`, 'erro'); return; }
                await dorme(1500);
                try { await lootTabela(h.id); } catch (e) { }
                try { await bestiarioHunt(h); } catch (e) { }
                if (!SCAN.ativo || SCAN.encerrou) return;
                try { await aplicarEmTodos(scanModeloAtual(), h, SCAN.fila[SCAN.idx].opcInt); } catch (e) { log('Scan: aplicar falhou — ' + e.message, 'erro'); }
                if (!SCAN.ativo || SCAN.encerrou) return;
                /* v2.2.1 — zera o analisador do jogo antes de medir: é o mesmo
                 * frame que o botão "zerar" da janela Estatísticas manda. Assim
                 * o mapa em que a party já estava não entra com o passado. */
                try { const an0 = anAgora(); enviarWS({ type: 'analyzer_reset', data: {} }); await esperarQue(() => { const a = anAgora(); return a && (!an0 || a.elapsedMs < an0.elapsedMs || a.kills < an0.kills); }, 5000, 200); } catch (e) { }
                await esperarQue(() => frameFresco() && ESTADO_WS.frame.an, 6000, 250);
                if (!SCAN.ativo || SCAN.encerrou) return;
                const a = anAgora();
                if (!a) { scanGravar(h, null, 'sem analisador no frame'); SCAN.fase = 'proximo'; return; }
                SCAN.base = Object.assign({}, a); SCAN.baseParty = clonar((ESTADO_WS.frame && ESTADO_WS.frame.party) || []); SCAN.t0 = Date.now(); SCAN.fase = 'medindo'; RAZAO = razaoNovo();
                SCAN.endedN = WS.tipos.ended || 0;
                log(`Scan: medindo ${h.title} por ${scanCfgRodada().minutos} min (lure ${lureTexto(h, r.lure)}, ${nomeModelo(scanModeloAtual())})`, 'ok');
                renderizar();
                return;
            }
            if (SCAN.fase === 'medindo') {
                const h = scanHuntAtual();
                if (ESTADO_WS.huntId !== h.id) { scanParar('a party saiu de ' + h.title + ' por fora do Scan', 'erro', 'perfis'); return; }
                const aAgora = anAgora();
                if (aAgora && SCAN.base && (aAgora.kills < SCAN.base.kills || aAgora.elapsedMs < SCAN.base.elapsedMs)) {
                    SCAN.base = Object.assign({}, aAgora); SCAN.baseParty = clonar((ESTADO_WS.frame && ESTADO_WS.frame.party) || []); SCAN.t0 = Date.now(); SCAN.vivo = null; RAZAO = razaoNovo();
                    log('Scan: o analisador do jogo foi zerado no meio — recomeçando a medição de ' + h.title, 'info');
                }
                const cap = capLivre(); if (cap && cap.pct < SCAN.capMin) SCAN.capMin = cap.pct;
                SCAN.vivo = scanMedidaViva() || SCAN.vivo;
                /* v2.11 — o fim da janela é pelo relógio do analisador; o da
                 * página só como teto (+90 s), para não ficar preso se o frame parar */
                const alvoSeg = scanCfgRodada().minutos * 60;
                if ((SCAN.vivo && SCAN.vivo.seg >= alvoSeg) || Date.now() - SCAN.t0 >= alvoSeg * 1000 + 90000) {
                    const m = scanMedidaViva() || SCAN.vivo;
                    scanGravar(h, m, m ? null : 'sem medida (frame parou)');
                    log(`Scan: ${h.title} [${nomeModelo(scanModeloAtual())}] — ${m ? (m.xpH / 1000).toFixed(1) + 'k xp/h (raw ' + (m.xpRawH / 1000).toFixed(1) + 'k) · ' + (m.ouroH >= 0 ? '+' : '') + m.ouroH + ' ouro/h' + (m.estavelH != null ? ' (estável ' + (m.estavelH >= 0 ? '+' : '') + m.estavelH + (m.sorte ? ', sorte +' + m.sorte : '') + ')' : '') + ' · ' + m.abatesH + ' abates/h · tomou ' + m.tomadoH + '/h · poção ' + m.supH + '/h · ' + razaoTexto(m.razao) : 'sem medida'}`, m ? 'ok' : 'erro');
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
        const tier = (scanCfgRodada().lureMax && h.lureTiers) ? h.lureTiers.length : 1;
        const modelo = scanModeloAtual();
        const chave = scanCfgRodada().comparar ? h.id + '|' + modelo : h.id;
        const novo = Object.assign({ id: h.id, title: h.title, levelMin: h.levelMin, t: Date.now(), lure: tier, lureTxt: lureTexto(h, tier), modelo, rodada: SCAN.rodada || null,
                                     nivel: nivelAtual(), minutos: scanCfgRodada().minutos, capMin: Math.round(SCAN.capMin), suja: SCAN.capMin < CAP_MIN_SCAN, erro: erro || null }, m || {});
        r[chave] = mesclarResultadoScan(r[chave], novo); // v2.11: falha não apaga resultado bom
        guardar('scan_resultados', r);
        try { radarAtualizarLinha(h.id); } catch (e) { falhou('radar (linha medida)', e); }
    }
    /* veredito: vereditosScan (@@AUTOHUNT-PURO), com o nível de agora como
     * referência do filtro ±2 */
    function scanVereditos() {
        const nv = nivelAtual();
        return vereditosScan(Object.values(scanResultados()), nv > 1 ? nv : null);
    }
    /* v2.11 — SCAN.ativo cai aqui, mas SCAN.ocupado segue true até o fim
     * (estamos dentro do scanPasso): o gatilho do Auto Hunt olha os dois e
     * não dispara no meio da ida para o melhor mapa. */
    async function scanTerminar() {
        const v = scanVereditos();
        SCAN.ativo = false; SCAN.fase = 'parado'; SCAN.huntId = null;
        log(`Scan TERMINADO — melhor XP: ${v.topXp ? v.topXp.title + ' (' + (xpBase(v.topXp) / 1000).toFixed(1) + 'k/h raw)' : '?'} · melhor ouro: ${v.topOuro ? v.topOuro.title + ' (' + (ouroBase(v.topOuro) >= 0 ? '+' : '') + ouroBase(v.topOuro) + '/h estável)' : '?'}`, 'ok');
        const c = scanCfgRodada(), fim = fimDoScan(c), foto = SCAN.foto;
        SCAN.foto = null;
        const alvo = fim === 'xp' ? v.topXp : fim === 'ouro' ? v.topOuro : null;
        const h = alvo ? (CAT.hunts || []).find(x => x.id === alvo.id) : null;
        if (h) {
            log('Scan: indo para ' + h.title + ' (melhor ' + (fim === 'xp' ? 'XP' : 'ouro') + ')', 'info');
            try {
                const r = await scanEntrar(h);
                if (r.erro) log('Scan: não entrei em ' + h.title + ' — ' + r.erro, 'erro');
                else { await dorme(1500); await aplicarEmTodos(alvo.modelo || c.modelo || 'equilibrado', h, SCAN.over && SCAN.over.opcInt); }
            } catch (e) { log('Scan: ir para ' + h.title + ' falhou — ' + e.message, 'erro'); }
        } else if (foto) {
            if (fim === 'xp' || fim === 'ouro') log('Scan: nenhum resultado válido para escolher o melhor ' + (fim === 'xp' ? 'XP' : 'ouro') + ' — voltando como estava', 'info');
            SCAN.fase = 'restaurando'; renderizar();
            try { await _scanRestaurar(foto, fim === 'ficar' ? 'perfis' : 'tudo'); } catch (e) { log('Scan: restaurar falhou — ' + e.message, 'erro'); }
            SCAN.fase = 'parado';
        }
        renderizar();
    }
    /* "ir ›" dos resultados. v2.11: respeita a trava comum (antes não olhava
     * o ciclo de venda) e ocupa a trava enquanto troca de mapa. */
    async function scanIrPara(id) {
        const h = (CAT.hunts || []).find(x => x.id === id);
        if (!h) return;
        const ocup = travaJogo();
        if (ocup) { log(ocup + ' em andamento — espera terminar antes de ir para outro mapa', 'erro'); return; }
        if (ESTADO_WS.boss) { log('boss em andamento — termina o boss antes de trocar de mapa', 'erro'); return; }
        if (!socketAberto()) { log('ir para ' + h.title + ': socket do jogo não está aberto — dá um F5 com o helper instalado', 'erro'); return; }
        _travaJogo = 'troca de mapa';
        renderizar();
        try {
            log('indo para ' + h.title + ' pelo socket…', 'info');
            const r = await scanEntrar(h);
            if (r.erro) { log('não entrei em ' + h.title + ': ' + r.erro, 'erro'); return; }
            await dorme(1500);
            await aplicarEmTodos(scanCfg().modelo || 'equilibrado', h);
        } catch (e) { log('ir para ' + h.title + ' falhou — ' + e.message, 'erro'); }
        finally { _travaJogo = null; renderizar(); }
    }

    const sessoes = () => ler('sessoes', []);
    function guardarSessao(s) {
        const t = sessoes();
        t.push(s);
        while (t.length > MAX_SESSOES) t.shift();
        guardar('sessoes', t);
    }

    /* v2.11 — a0 À PARTE. A sessão guarda até 400 amostras e, passando disso,
     * cortava as 100 MAIS ANTIGAS — inclusive a primeira: uma caçada de 25 min
     * fechava medindo só os últimos 20 (CONFIRMADO). SESSAO.a0 é a amostra
     * inicial, e o corte agora começa na 2ª (amostras[0] continua sendo a0).
     * O pico da mochila é acumulado (pctMax), senão sumia no corte também.
     * XP pelo analisador do jogo quando as duas pontas têm (anXp/anMs). */
    function fecharSessao(motivo) {
        if (!SESSAO || SESSAO.amostras.length < 2) { SESSAO = null; return; }
        const a0 = SESSAO.a0 || SESSAO.amostras[0], aN = SESSAO.amostras[SESSAO.amostras.length - 1];
        const dur = (aN.t - a0.t) / 1000;
        if (dur < 60) { SESSAO = null; return; } // amostra curta demais pra valer

        const dOuro = aN.ouro - a0.ouro;
        const anOk = a0.anXp != null && aN.anXp != null && aN.anMs >= a0.anMs && aN.anXp >= a0.anXp;
        const dExp = anOk ? aN.anXp - a0.anXp : (aN.exp != null && a0.exp != null) ? aN.exp - a0.exp : null;
        const dAbates = (aN.abates != null && a0.abates != null) ? aN.abates - a0.abates : null;
        const pctMax = Math.max(SESSAO.pctMax || 0, ...SESSAO.amostras.map(x => x.mochilaPct || 0));
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
        if (anOk && aN.anLoot != null && a0.anLoot != null) { s.lootH = Math.round((aN.anLoot - a0.anLoot) / dur * 3600); s.supH = Math.round((aN.anSup - a0.anSup) / dur * 3600); }
        // fator real = custo medido / custo previsto SEM o fator (o previsto já traz o fator)
        if (s.custoRealAbate != null && s.custoPrevisto && !regen) {
            /* v2.11 — o previsto agora soma runa (que não leva a curva): usar o custo
             * SEM a curva que viabilidadeParty devolve; a divisão só vale para sessão velha */
            const semFator = SESSAO.custoSemFator != null ? SESSAO.custoSemFator : s.custoPrevisto / fatorDesperdicio(SESSAO.hp || 1);
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
        try { gatilhoAutoHunt(); deuCerto('gatilhoAutoHunt'); } catch (e) { falhou('gatilhoAutoHunt', e); }
        if (SCAN.ativo) scanPasso().catch(() => { });
        if (BEST.ativo) bestPasso().catch(e => falhou('bestiário (completar)', e));
        /* v2.1.0: assim que houver token + catálogo, lê o dano real de tudo (só leitura, sem janela) */
        lerDanosPendentes();
        const dentro = emHunt();
        if (!dentro) { _estavaEmHunt = false; _ultimosAbates = null; if (SESSAO) fecharSessao('saiu da caçada'); return; }

        /* v2.11 — id fora do catálogo = boss/torre/treino. No hunt_started o
         * catálogo às vezes ainda não carregou (boot); aqui ele já está. */
        if (!ESTADO_WS.boss && ESTADO_WS.huntId != null && huntNoCatalogo(ESTADO_WS.huntId) === false) ESTADO_WS.boss = '?';
        /* v2.11 — BOSS NÃO É CAÇADA. Durante boss (huntId 800) o socket "não
         * conhecia" a hunt: hunt_id era APAGADO e, 10 s depois, a tela CAÇADAS
         * abria sozinha no meio da luta; a sessão do Analisador media o boss
         * como se fosse a hunt. Agora: nada de sessão, nada de modal; quando o
         * jogo devolve a party para a hunt anterior, a entrada roda de novo. */
        if (ESTADO_WS.boss) { _estavaEmHunt = false; _ultimosAbates = null; if (SESSAO) fecharSessao('boss'); return; }

        const ab = lerAbates();
        const resetou = ab != null && _ultimosAbates != null && ab < _ultimosAbates;
        if (ab != null) _ultimosAbates = ab;
        if (resetou && SESSAO) fecharSessao('analisador zerado');
        if (!_estavaEmHunt || resetou) {
            _estavaEmHunt = true;
            _entrouEmHuntEm = Date.now();
            /* v2.0.0: se o socket já disse a hunt nos últimos 30 s, ela vale;
             * só zera quando o socket não falou nada. */
            /* v2.2.1 — se o socket conhece a hunt (2.0.0), o contador zerar é
             * só o analisador do jogo sendo reiniciado (botão zerar, Scan,
             * boss): NÃO abre a tela CAÇADAS. A reserva pelo modal fica só
             * para quando o socket nunca falou. */
            const socketSabe = ESTADO_WS.huntId != null && huntNoCatalogo(ESTADO_WS.huntId) === true;
            if (!socketSabe) { guardar('hunt_id', null); guardar('hunt_manual', null); }
            else if (ler('hunt_id', null) !== ESTADO_WS.huntId) { guardar('hunt_id', ESTADO_WS.huntId); guardar('hunt_manual', ESTADO_WS.huntId); }
            if (resetou) { _huntTrocou = !socketSabe; log(socketSabe ? 'contador de abates zerou (analisador reiniciado)' : 'contador de abates zerou — hunt nova, reconfirmando', 'info'); }
        }
        if (ler('hunt_id', null) == null && !_confirmandoHunt && Date.now() > _proximaTentativaHunt && CAT.hunts
            && Date.now() - _entrouEmHuntEm > 10000) { // v2.0.0: reserva — o socket tem 10 s para falar primeiro
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
                .catch(e => { _proximaTentativaHunt = Date.now() + 30000; falhou('confirmar hunt pela tela', e); })
                .finally(() => { _confirmandoHunt = false; renderizar(); });
            return; // sem hunt confirmada a amostra sairia com o nome errado
        }

        /* v1.8.0 — NÍVEL NOVO NÃO ABRE DIÁLOGO. O dano medido é escalado pelo
         * nível em danosConhecidos() (toda fórmula do jogo soma nível÷5, wiki
         * "como o dano é calculado"). Medir de novo é o botão "Aprender dano". */
        const lvl = nivelAtual();
        if (lvl && _nivelAprendido !== lvl) {
            if (_nivelAprendido != null) {
                if (ESTADO_WS.worldToken) { log('nível ' + lvl + ': relendo o dano real de /spell-numbers', 'info'); _danosRestPendente = true; _danosRestProxima = 0; lerDanosPendentes(); }
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
            let custoPrev = null, custoPrevSemFator = null;
            try { const vp = viabilidadeParty(ler('modelo', 'equilibrado'), h); if (vp) { custoPrev = vp.custoPorAbate; custoPrevSemFator = vp.custoSemFator != null ? vp.custoSemFator : null; } } catch (e) { }
            SESSAO = {
                huntId: idAgora, huntTitle: h ? h.title : 'desconhecida',
                hp: hp ? Math.round(hp) : null, loot: h ? LOOT_CACHE[h.id] : null,
                custoPrevisto: custoPrev, custoSemFator: custoPrevSemFator, regen: partyEmRegen(), amostras: [], a0: null, pctMax: 0
            };
        }
        const exp = lerExpTotal();
        const moch = lerMochilaOz();
        const an = anDoFrame();
        const amostra = { t: Date.now(), ouro: ouroAtual(), exp: exp ? exp.atual : null, abates: ab, mochilaPct: moch ? moch.pct : 0 };
        if (an) Object.assign(amostra, { anMs: an.elapsedMs, anXp: an.xp, anLoot: an.lootGold, anSup: an.suppliesGold });
        if (!SESSAO.a0) SESSAO.a0 = amostra;
        SESSAO.pctMax = Math.max(SESSAO.pctMax || 0, amostra.mochilaPct);
        SESSAO.amostras.push(amostra);
        // não deixa a sessão crescer sem limite — mas a amostra 0 (o começo) fica
        if (SESSAO.amostras.length > 400) SESSAO.amostras.splice(1, 100);
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
    /* v2.11 — CACHE DE 2 s. A varredura anda até 200 mil fibras; quando o
     * shell não existe (lobby, campo renomeado) ela vai até o fim toda vez, e
     * a aba Equip chama isto várias vezes por repintura. */
    let _shellCache = { t: 0, v: null };
    function lerShellFibra() {
        if (Date.now() - _shellCache.t < 2000) return _shellCache.v;
        const v = _lerShellFibra();
        _shellCache = { t: Date.now(), v };
        return v;
    }
    function _lerShellFibra() {
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
     * id por nome vem de /assets/<versão>/items-by-name.json.
     * v2.11 — equip_ids (221 KB, todos os itens do jogo) só em MEMÓRIA: era a
     * maior chave do localStorage, repetida por conta, e é rebaixada em
     * milissegundos quando o Equip precisa. */
    let _idsPorNome = null;
    async function idsPorNome() {
        if (_idsPorNome) return _idsPorNome;
        const m = await buscarAsset('items-by-name.json');
        if (!m || typeof m !== 'object') throw new Error('items-by-name.json veio vazio');
        _idsPorNome = m;
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
                for (const it of lista) {
                    /* v2.11.7 — guardado também pelo nome PEDIDO ("wild honey"), não só pelo
                     * que o /item/info devolve ("Wild Honey"); sell desconhecido = null, não 0 */
                    const v = { id: it.id, attrs: it.attrs || {}, sell: it.sell != null ? Number(it.sell) || 0 : null, equipPreview: it.equipPreview || null };
                    cache[it.name] = v;
                    for (const n of lote) if (ids[n] === it.id) cache[n] = v;
                }
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
    /* =========================================================================
     *  ⭐ v2.11.6 — UMA MOEDA SÓ: 1 pt = +1 % do dano da PARTY.
     *
     *  Dono, 29/09: "analisa toda sua tabela de comparação, tá calculando tudo
     *  errado" e "tô vendendo itens bons por causa da sua comparação". Revisão
     *  com a wiki (/forja, /como-o-dano-e-calculado, /lure-levas-e-formacao,
     *  /equipamentos, /imbuements, /magias-e-runas, guias das 4 vocações) e com
     *  90 s medidos ao vivo (hunt 50) + os Scans de Banshee e Quara:
     *
     *            dano/s  % da party  vida mín  mana média
     *   Knight     25        9 %       55 %      16–19 %   (toma ~30 de dano/s)
     *   Paladino   73       26 %     56–100 %     7–9 %
     *   Feiticeiro 80       27 %     92–100 %    6–12 %
     *   Druida    105       37 %     36–100 %   35–40 %    (bebe poção de mana)
     *
     *  O que estava errado na tabela antiga:
     *   1. "1 pt = 1 % do dano DAQUELE personagem": 1 % do Knight (2,5 de
     *      dano/s) valia o mesmo que 1 % do Druida (10/s). O machado do Knight
     *      somava 71 pt e ofuscava tudo. Agora tudo vira % do dano da party.
     *   2. Crítico e roubo de vida são "uma CHANCE de somar/devolver uma
     *      porcentagem" (wiki): só valem EM PAR, chance × quantia. Roubo de vida
     *      2,4 % × 1,7 % no Knight (25 de dano/s) devolve 0,01 de vida/s.
     *      Agora a conta é em par, com o que o personagem já veste.
     *   3. Runa usa o Nível Mágico TREINADO, sem bônus de item (/magias-e-runas):
     *      ML de item só mexe nas magias. E o dano do Paladino é 95 % runa +
     *      Caldera + Missile — Distância e munição quase não contam.
     *   4. Quem não bebe poção vive sem mana (Paladino, Feiticeiro, Knight):
     *      +1 de mana/s = mais lançamentos → dano/mana medido. No Druida, que
     *      bebe, +1 de mana/s = 3.600 de mana/h que a poção não precisa dar
     *      (≈ 2.160 de ouro/h). Mana máxima não serve a ninguém: a barra vive
     *      vazia (ou a poção enche).
     *   5. Armadura e defesa do escudo só seguram corpo a corpo, que só o Knight
     *      leva; magia de área de criatura só pega os laterais às vezes (Quara,
     *      Banshee). Cura própria só vale no que o personagem cura EM SI — a cura
     *      do Druida no Knight não conta. Chance de loot vale o MAIOR da party,
     *      não a soma. Regeneração é por segundo (/bestiario: HP/s, MP/s).
     *  Conversões: 1 pt ≈ 450 de ouro/h (1 % a mais de dano num mapa limitado
     *  pelo dano ≈ 0,56 % mais abates: ~225 de loot e ~250 de xp por hora).
     *  1 de vida/s a menos no Knight = poção e cura de ~0,3 ouro por vida ×
     *  3.600 ≈ 1.080 de ouro/h, ×1,5 pela segurança (a morte encerra a caçada)
     *  = 3,6 pt. Sem medida, vale PARTY_REF (os números acima). */
    const SLOTS_EQUIP = ['weapon', 'shield', 'head', 'armor', 'legs', 'boots', 'necklace', 'ring'];
    const ELEM = ['fogo', 'gelo', 'energia', 'terra', 'morte', 'sagrado'];
    const ELEM_EN = { fogo: 'fire', gelo: 'ice', energia: 'energy', terra: 'earth', morte: 'death', sagrado: 'holy' };
    const VOCS_EQUIP = ['KNIGHT', 'PALADIN', 'SORCERER', 'DRUID'];
    const PT_OURO_H = 450;
    const VIDA_PT_KNIGHT = 3.6, VIDA_PT_LADO = 0.5;
    /* elemento das magias de cada mago (dono, 29/09): Feiticeiro energia e fogo, Druida gelo e terra */
    const ELEM_DO_MAGO = { SORCERER: ['energia', 'fogo'], DRUID: ['gelo', 'terra'] };
    const PARTY_REF = {
        share: { KNIGHT: 0.10, PALADIN: 0.26, SORCERER: 0.27, DRUID: 0.37 }, // fatia de cada um no dano da party
        dps: 270, // dano/s da party
        dpm: { KNIGHT: 3.4, PALADIN: 3.7, SORCERER: 5, DRUID: 6 }, // dano por mana das magias (livro-razão)
        mana: { KNIGHT: 18, PALADIN: 8, SORCERER: 8, DRUID: 38 }, // mana média (%)
        bebe: { KNIGHT: false, PALADIN: false, SORCERER: false, DRUID: true }, // poção de mana ligada
        fracMagica: { KNIGHT: 0.9, PALADIN: 0.95, SORCERER: 1, DRUID: 1 }, // magia de ataque + runa + wand (Dano mágico da forja)
        fracMagia: { KNIGHT: 0.9, PALADIN: 0.5, SORCERER: 0.87, DRUID: 0.88 }, // só magia: ML de item não vale na runa
        fracSagrado: 0.5, // Paladino: Caldera + Divine Missile
        tiroS: { SORCERER: 0.14, DRUID: 0.14 }, // tiros da wand/rod por segundo (medido: mana curta)
        tomadoS: 30, fisico: 0.65, golpesS: 0.45, // Knight: dano tomado/s, parte corpo a corpo, golpes/s
        ladoApanha: 1, // ×defesa dos laterais (4 = mapa de magia de área)
        ouroPorMana: 0.6
    };
    function partyDoCtx(ctx) {
        const p = (ctx && ctx.party) || {}, R = {};
        for (const k of Object.keys(PARTY_REF)) {
            const ref = PARTY_REF[k], v = p[k];
            if (ref && typeof ref === 'object') { R[k] = Object.assign({}, ref); for (const [kk, vv] of Object.entries(v || {})) if (typeof vv === 'boolean' || Number.isFinite(vv)) R[k][kk] = vv; }
            else R[k] = Number.isFinite(v) && v >= 0 ? v : ref;
        }
        if (!(R.dps > 0)) R.dps = PARTY_REF.dps;
        return R;
    }
    /* v2.9.0 — as skills do momento (ctx.sk[VOC] = {melee, atkArma, dist, ml});
     * o que faltar cai na referência. */
    const REF_SK = { nivel: 67, melee: 33, atkArma: 33, dist: 36, ml: 25 };
    /* /ammo: as duas munições de custo 0. Besta usa bolt (30), arco usa arrow (25). */
    const MUNICAO_GRATIS = { arrow: 25, bolt: 30 };
    const _pct = (ganho, base) => base > 0 ? 100 * ganho / base : 0;
    const _r = (x) => Math.round(x * 1000) / 1000;
    /* regen de mana (pt por 1 de mana/s) — também é o preço da mana do tiro da wand */
    function ptPorManaS(voc, R) {
        if (R.bebe[voc]) return R.ouroPorMana * 3600 / PT_OURO_H;
        /* v2.11.16 — sem o corte de "mana sobrando" (era ×0,2 com a barra ≥ 60 %): num mapa fácil
         * a regen. de mana do Feiticeiro caía para trás de chance de loot e capacidade. A peça
         * dura muitos mapas; regra da comunidade (dono, 30/09): regen. de mana é boa para todos. */
        return (R.dpm[voc] || 0) / R.dps * 100;
    }
    function pesosDaVoc(voc, ctx) {
        const R = partyDoCtx(ctx), s = R.share[voc] || 0, P = {};
        const sk = Object.assign({}, REF_SK);
        for (const [k, v] of Object.entries((ctx && ctx.sk && ctx.sk[voc]) || {})) if (Number.isFinite(v) && v > 0) sk[k] = v;
        const n5 = ((ctx && ctx.nivel > 0 && ctx.nivel) || sk.nivel) / 5;
        const fm = R.fracMagica[voc] || 0, fs = R.fracMagia[voc] || 0;
        /* ---- ataque: % do dano do personagem × a fatia dele na party ---- */
        P.dano_magico = _r(s * fm);
        P.dano_fisico = _r(s * (voc === 'KNIGHT' ? 1 : voc === 'PALADIN' ? 1 - fm : 0));
        for (const e of ELEM) {
            const w = voc === 'KNIGHT' ? 0 // tudo do Knight é físico
                : voc === 'PALADIN' ? (e === 'sagrado' ? R.fracSagrado : Math.max(0, fm - R.fracSagrado) / 4)
                : (ELEM_DO_MAGO[voc] || []).includes(e) ? 0.6 : 0;
            P['dano_elem_' + e] = _r(s * w);
        }
        P.attack = P.corpo_a_corpo = P.skillsword = P.skillaxe = P.skillclub = 0;
        P.distancia = P.skilldist = P.municao_atk = 0;
        P.nivel_magico = P.magiclevelpoints = 0;
        if (voc === 'KNIGHT') {
            /* golpe (wiki): média nível/5 + 0,0425·atk·skill; Berserk (/spells): 1,1·(nível/5 + skill + atk) */
            const golpe = n5 + 0.0425 * sk.atkArma * sk.melee, berserk = 1.1 * (n5 + sk.melee + sk.atkArma);
            P.attack = _r(s * (_pct(0.0425 * sk.melee, golpe) * (1 - fs) + _pct(1.1, berserk) * fs));
            P.corpo_a_corpo = P.skillsword = P.skillaxe = P.skillclub = _r(s * (_pct(0.0425 * sk.atkArma, golpe) * (1 - fs) + _pct(1.1, berserk) * fs));
            P.nivel_magico = P.magiclevelpoints = 0.05; // só a cura dele (Wound Cleansing)
        } else if (voc === 'PALADIN') {
            const tiro = n5 + 0.045 * MUNICAO_GRATIS.arrow * sk.dist;
            P.distancia = P.skilldist = _r(s * (1 - fm) * _pct(0.045 * MUNICAO_GRATIS.arrow, tiro));
            P.municao_atk = _r(s * (1 - fm) * _pct(0.045 * sk.dist, tiro)); // por ponto de ataque da munição grátis
            P.nivel_magico = P.magiclevelpoints = _r(s * fs * _pct(4, n5 + 4 * sk.ml)); // Caldera/Missile (a runa ignora ML de item)
        } else {
            const onda = voc === 'SORCERER' ? _pct(6.75, n5 + 6.75 * sk.ml) // Energy Wave: n/5 + 4,5–9·ML
                                            : _pct(6.05, n5 + 6.05 * sk.ml + 34); // Strong Ice Wave: n/5 + 4,5–7,6·ML + 20–48
            P.nivel_magico = P.magiclevelpoints = _r(s * fs * onda * (voc === 'DRUID' ? 1.2 : 1)); // Druida: ML também cura o Knight
        }
        /* ---- mana ---- */
        P.regen_mana = _r(ptPorManaS(voc, R));
        /* v2.11.17 — dono, 30/09: "o Knight tem que ter regen. de mana como principal, depois regen. de vida".
         * A mana dele vive em 16–19 % (Berserk/cura rodam na regeneração): a regen. de mana vale 25 % a
         * mais que a de vida, por unidade — fica na frente de tudo nos encaixes de defesa dele. */
        if (voc === 'KNIGHT') P.regen_mana = _r(Math.max(P.regen_mana, VIDA_PT_KNIGHT * 1.25));
        P.max_mana = 0.001;
        /* ---- defesa ---- */
        if (voc === 'KNIGHT') {
            const k1 = R.tomadoS / 100 * VIDA_PT_KNIGHT; // pt por 1 % a menos de TODO o dano que ele toma
            P.regen_vida = VIDA_PT_KNIGHT;
            P.max_hp = 0.04;
            P.resist_fisica = P.absorbpercentphysical = _r(k1 * R.fisico);
            P.protecao_magica = _r(k1 * (1 - R.fisico));
            for (const e of ELEM) P['resist_' + e] = P['absorbpercent' + ELEM_EN[e]] = _r(k1 * (1 - R.fisico) / 4);
            P.absorbpercentpoison = P.resist_terra;
            P.cura_propria = _r(k1 * 0.5); // metade da vida dele volta por poção/cura própria
            P.armor = P.defense = P.extradef = _r(R.golpesS * 0.75 * VIDA_PT_KNIGHT); // tira 0,5–1× por golpe corpo a corpo
            P.escudo = P.skillshield = 0.9;
        } else {
            const la = R.ladoApanha > 0 ? R.ladoApanha : 1;
            P.regen_vida = _r(VIDA_PT_LADO * la); P.max_hp = _r(0.01 * la);
            P.resist_fisica = P.absorbpercentphysical = _r(0.02 * la); P.protecao_magica = _r(0.15 * la);
            for (const e of ELEM) P['resist_' + e] = P['absorbpercent' + ELEM_EN[e]] = _r(0.05 * la);
            P.absorbpercentpoison = _r(0.05 * la);
            P.cura_propria = _r(0.05 * la);
            P.armor = P.defense = P.extradef = P.escudo = P.skillshield = 0; // armadura e escudo só seguram corpo a corpo
        }
        /* ---- conta ---- */
        P.capacidade = 0.004; // 100 oz ≈ 0,4 pt (menos idas à cidade)
        P.chance_de_loot = 0.9; // +1 % de drop ≈ 400 de ouro/h (vale o maior da party)
        P.hitchance = 0;
        return P;
    }
    /* v2.11.6 — PARES (crítico e roubo de vida): o ganho de uma peça depende do
     * que o personagem já veste nos OUTROS espaços (ctx.usando[voc][slot]).
     * Crítico: dano extra = chance% × dano% ÷ 100 do dano dele. Roubo de vida:
     * vida/s = dano/s × chance% × quantia% ÷ 10.000. Base 0 (wiki: não existe
     * crítico de base). */
    const PARES = { critico_chance: ['critico', 'c'], critico_dano: ['critico', 'd'], roubo_vida_chance: ['roubo', 'c'], roubo_vida_quantia: ['roubo', 'd'] };
    function outrosDoPar(ctx, voc, slot) {
        const t = { critico: { c: 0, d: 0 }, roubo: { c: 0, d: 0 } };
        const u = ctx && ctx.usando && ctx.usando[voc];
        if (u) for (const [sl, at] of Object.entries(u)) if (sl !== slot) for (const [id, v] of Object.entries(at || {})) { const p = PARES[id]; if (p) t[p[0]][p[1]] += Number(v) || 0; }
        return t;
    }
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
    /* a tabela sem medida (PARTY_REF), para quem só quer olhar os pesos */
    const PESOS_EQUIP = Object.fromEntries(VOCS_EQUIP.map(v => [v, pesosDaVoc(v, null)]));
    const WAND_ELEM = { fire: 'COMBAT_FIREDAMAGE', energy: 'COMBAT_ENERGYDAMAGE', earth: 'COMBAT_EARTHDAMAGE', ice: 'COMBAT_ICEDAMAGE', death: 'COMBAT_DEATHDAMAGE', holy: 'COMBAT_HOLYDAMAGE' };
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
        const add = (id, valor, pt) => detalhe.push({ id, valor, pt: Math.round(pt * 1000) / 1000 });
        const temporario = ehTemporaria(peca);
        const cargas = Number(a.charges) || 0;
        const duracaoS = (peca.equipPreview && peca.equipPreview.durationS) || null;
        let baseAttrs = a;
        if (peca.equipPreview && peca.equipPreview.attrs) baseAttrs = Object.assign({}, a, peca.equipPreview.attrs);
        for (const [k, v] of Object.entries(baseAttrs)) {
            if (typeof v !== 'number' || ATTR_IGNORAR.has(k) || ehEncaixe(k)) continue; // encaixes de imbuement não são bônus
            /* regeneração de item: v a cada manaticks/healthticks ms → por segundo */
            if (k === 'managain') { add('regen_mana', v, v * 1000 / (Number(baseAttrs.manaticks) || 2000) * (P.regen_mana || 0)); continue; }
            if (k === 'healthgain') { add('regen_vida', v, v * 1000 / (Number(baseAttrs.healthticks) || 2000) * (P.regen_vida || 0)); continue; }
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
        /* wand/rod (v2.11.6): dano do tiro × tiros por segundo (medido: ~0,14/s,
         * a mana é curta) em % do dano da party, menos a mana do tiro ao preço
         * da mana daquele personagem (a mesma conta da regen. de mana). */
        const R = partyDoCtx(ctx);
        if ((a.weaponType === 'wand' || a.wandType) && a.fromDamage != null && voc !== 'KNIGHT' && voc !== 'PALADIN') {
            const medio = (Number(a.fromDamage) + Number(a.toDamage)) / 2, tiros = R.tiroS[voc] || 0.14;
            const el = WAND_ELEM[a.wandType] || null;
            const nota = el && ctx && ctx.notas && ctx.notas[el] != null ? ctx.notas[el] / 100 : 1;
            add('dano da wand' + (el && nota !== 1 ? ' (' + (a.wandType) + ' ' + Math.round(nota * 100) + '% no mapa)' : ''), medio, medio * nota * tiros / R.dps * 100);
            if (a.mana) add('mana por tiro', a.mana, -Number(a.mana) * tiros * (P.regen_mana || 0));
        }
        /* pares: crítico (chance × dano) e roubo de vida (chance × quantia), com o que ele veste nos outros espaços */
        const atrs = (peca.forja && peca.forja.atributos) || [];
        const par = outrosDoPar(ctx, voc, peca.slot), meu = { critico: { c: 0, d: 0 }, roubo: { c: 0, d: 0 } };
        for (const f of atrs) { const q = PARES[f.id]; if (q) meu[q[0]][q[1]] += Number(f.valor) || 0; }
        const danoDele = (R.share[voc] || 0) * R.dps;
        const vidaPt = voc === 'KNIGHT' ? VIDA_PT_KNIGHT : VIDA_PT_LADO;
        const ganhoPar = (g, lado) => { // pt da parte "lado" (c ou d) do par g
            const o = par[g], m = meu[g];
            const parte = lado === 'c' ? m.c * o.d + m.c * m.d / 2 : m.d * o.c + m.c * m.d / 2;
            return g === 'critico' ? parte / 100 * (R.share[voc] || 0) // % do dano dele → % da party
                                   : danoDele * parte / 10000 * vidaPt; // vida/s devolvida → pt
        };
        for (const f of atrs) {
            const q = PARES[f.id];
            if (q) { add(f.id, f.valor, ganhoPar(q[0], q[1])); continue; }
            const p = P[f.id]; add(f.id, f.valor, (p || 0) * Number(f.valor));
        }
        const pontos = Math.round(detalhe.reduce((s, d) => s + d.pt, 0) * 100) / 100;
        const contam = detalhe.filter(d => d.pt > 0).sort((x, y) => y.pt - x.pt);
        const mortos = detalhe.filter(d => d.pt === 0 && !/^munição grátis/.test(d.id)).map(d => d.id);
        const motivos = contam.slice(0, 2).map(d => `${rotulo(d.id)} +${d.valor} (${d.pt} pt)`);
        return { pontos, motivos, contam: contam.map(d => d.id), mortos, temporario, cargas, duracaoS, detalhe };
    }
    /* roster (welcome/fibra) + depot_state.entries + base{nome:{attrs,sell,equipPreview}} → peças
     * {iid, nome, slot, attrs, forja, equipPreview, sell, origem:'corpo'|'depósito', dono?:voc, duasMaos} */
    /* v2.11.20 — encaixe da forja normalizado: id em minúsculas com _ ("Regen-Mana" → regen_mana) e valor
     * numérico ("1,1" → 1.1). Um id ou valor fora do formato zerava o encaixe em silêncio. */
    function normForja(f) {
        if (!f || typeof f !== 'object') return { raridade: 0, atributos: [] };
        const atributos = (Array.isArray(f.atributos) ? f.atributos : []).map(a => ({ ...a,
            id: String((a && a.id) || '').trim().toLowerCase().replace(/[\s-]+/g, '_'),
            valor: typeof (a && a.valor) === 'string' ? Number(a.valor.replace(',', '.')) : Number(a && a.valor) }));
        return { ...f, atributos };
    }
    function candidatosEquip(roster, depot, base, mochila) {
        const out = [];
        const b = (nome) => base[nome] || { attrs: {}, sell: 0, equipPreview: null };
        const slotDaBase = (a) => { if (a.slot) return normalizarSlot(a.slot); const w = a.weaponType || a.weapontype; if (w === 'shield' || w === 'spellbook') return 'shield'; if (w) return 'weapon'; return null; };
        for (const e of (mochila || [])) {
            if (!e || !e.iid || !e.name) continue;
            const k = b(e.name);
            const slot = slotDaBase(k.attrs);
            if (!slot || !SLOTS_EQUIP.includes(slot)) continue;
            out.push({ iid: e.iid, nome: e.name, slot, attrs: k.attrs, forja: normForja(e.forja), equipPreview: k.equipPreview,
                       sell: k.sell || 0, origem: 'mochila', dono: null, duasMaos: k.attrs.slotType === 'two-handed' });
        }
        for (const r of (roster || [])) { for (const [slot, it] of Object.entries(r.equipment || {})) {
            if (!it || !it.name) continue;
            const k = b(it.name);
            const attrs = Object.assign({}, k.attrs, it.attrs || {});
            out.push({ iid: it.iid || (r.vocation + ':' + slot), nome: it.name, slot: normalizarSlot(slot), attrs, forja: normForja(it.forja),
                       equipPreview: k.equipPreview, sell: k.sell || it.value || 0, origem: 'corpo', dono: r.vocation, duasMaos: attrs.slotType === 'two-handed' });
        } }
        for (const e of ((depot && depot.entries) || [])) {
            if (!e.forja || !e.slot) continue;
            const k = b(e.itemName);
            out.push({ iid: e.iid, nome: e.itemName, slot: normalizarSlot(e.slot), attrs: k.attrs, forja: normForja(e.forja), equipPreview: k.equipPreview,
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
    const EQUIP_TOPK = 6, EQUIP_RESERVAS = 2, RARIDADE_BASE_FORJA = 3;
    /* v2.14.8 — potência (vídeos de 04/10, criador do jogo + TV de Souza): cada refino dá +50 e a cada 200 a peça
     * sobe de faixa (1–199, 200–399, 400–599, 600–799, 800+); a faixa é o teto das linhas de skill (ML, distância,
     * corpo a corpo: faixa 2 → até +2, faixa 3 → até +3). Uma Snakebite Rod ML+1 com 300+ vira ML+3 na forja. */
    const POTENCIA_BASE_FORJA = 300, SKILL_FORJA = ['nivel_magico', 'distancia', 'corpo_a_corpo'];
    const potenciaDe = p => Number(p && p.forja && p.forja.potenciaBase) || 0;
    /* v2.14.9 — DESMANCHE (criador do jogo, 04/10): o que o NPC não compra (Incomum ou melhor, ou refinada) e ninguém usa
     * vira fragmento na Forja — a única fonte de gemas. Só mochila (bag) e depósito (depot); o corpo nunca. */
    const vendivelNpc = p => !((p.forja && p.forja.raridade) > 0) && !((p.forja && p.forja.refino) > 0);
    /* v2.14.10 — PLANO DE FORJA (dono, 04/10: "não sei usar a forja: me indica o que fazer e quais atributos
     * encontrar"). Regras do jogo (cliente, 04/10) e da wiki /forja: potência atual = base + 50 × refino; faixas a
     * cada 200 (I 1–199 … VI 1000+) e o VALOR das linhas é sorteado no range da faixa; encaixes = raridade (Comum 0,
     * Incomum 1, Raro 2, Épico 3, Lendário 4, Mítico 5); encaixes de defesa (escudo, elmo, armadura, calça, bota, anel)
     * e de ataque (arma, colar) são grupos separados. Gemas: Refino T1 (+1..+4, falha não cai) e T2 (+5..+10, falha
     * cai 1; Garantia T1 segura), Raridade T1 (até Lendário; falhar só gasta a gema) e T2 (Mítico), Atributo T1
     * (escreve uma linha aleatória no 1º encaixe vazio), Limpeza T1 (apaga TODAS) e T2 (só a ÚLTIMA), Refazer T1
     * (re-sorteia o valor de todas) e T2 (só do último), Ordem T2 (embaralha a ordem). Valores típicos por faixa:
     * regen 1,1→5,2 · skill +1→+3 · dano 1,2→9,8 % (wiki); o resto é nominal, só para ordenar. */
    const FAIXA_LIMIAR = [1, 200, 400, 600, 800, 1000];
    const ENCAIXES_POR_RARIDADE = [0, 1, 2, 3, 4, 5];
    const RAR_PT = ['Comum', 'Incomum', 'Raro', 'Épico', 'Lendário', 'Mítico'];
    const ATAQUE_IDS = ['nivel_magico', 'corpo_a_corpo', 'distancia', 'dano_fisico', 'dano_magico', 'critico_chance', 'critico_dano', 'roubo_vida_chance', 'roubo_vida_quantia'].concat(ELEM.map(e => 'dano_elem_' + e));
    const DEFESA_IDS = ['regen_mana', 'regen_vida', 'resist_fisica', 'protecao_magica', 'escudo', 'max_hp', 'max_mana', 'capacidade', 'cura_propria', 'chance_de_loot'].concat(ELEM.map(e => 'resist_' + e));
    function faixaPotencia(pot) { let f = 1; for (let i = 1; i < FAIXA_LIMIAR.length; i++) if (pot >= FAIXA_LIMIAR[i]) f = i + 1; return f; }
    function valorTipico(id, faixa) {
        const f = Math.max(1, Math.min(6, faixa)) - 1;
        if (/^regen_/.test(id)) return [1.1, 1.9, 2.7, 3.5, 4.3, 5.2][f];
        if (id === 'nivel_magico' || id === 'corpo_a_corpo' || id === 'distancia') return [1, 1, 2, 2, 3, 3][f];
        if (/^dano_/.test(id)) return [1.2, 2.9, 4.6, 6.3, 8.0, 9.8][f];
        const nominal = { resist_fisica: 1.5, protecao_magica: 1.5, escudo: 2, max_hp: 30, max_mana: 40, capacidade: 60, cura_propria: 2, chance_de_loot: 0.3,
                          critico_chance: 3, critico_dano: 10, roubo_vida_chance: 3, roubo_vida_quantia: 10 };
        return (nominal[id] != null ? nominal[id] : /^resist_/.test(id) ? 1.5 : 1) * (0.7 + 0.15 * f);
    }
    /* peca = {slot, attrs, forja{raridade, refino, potenciaBase, atributos}}; vocs = candidatas; porVoc = resultado do
     * distribuirEquip (opcional, para dizer o que a vocação veste hoje). Devolve o plano, sem custo de gema (quem
     * conhece o preço é pgRefino, fora deste bloco). */
    function planoForja(peca, vocs, ctx, porVoc) {
        const f = (peca && peca.forja) || {}, slot = normalizarSlot(peca.slot);
        const ataque = slot === 'weapon' || slot === 'necklace';
        const ids = ataque ? ATAQUE_IDS : DEFESA_IDS;
        const refino = Number(f.refino) || 0, pot = (Number(f.potenciaBase) || 0) + 50 * refino, faixa = faixaPotencia(pot);
        let proxima = null;
        if (faixa < 6 && refino < 10) {
            const limiar = FAIXA_LIMIAR[faixa], refinos = Math.ceil((limiar - pot) / 50);
            if (refino + refinos <= 10) proxima = { faixa: faixa + 1, limiar, refinos, refinoAlvo: refino + refinos };
        }
        const faixaAlvo = proxima ? proxima.faixa : faixa;
        const podem = (vocs || VOCS_EQUIP).filter(v => vocacaoPode(peca.attrs, v));
        const cands = podem.length ? podem : (vocs || VOCS_EQUIP);
        let voc = cands[0], melhorPt = -1, pesos = null;
        for (const v of cands) {
            const P = pesosDaVoc(v, ctx);
            const top = Math.max(0, ...ids.map(id => (P[id] || 0) * valorTipico(id, faixaAlvo)));
            if (top > melhorPt) { melhorPt = top; voc = v; pesos = P; }
        }
        if (!pesos) pesos = pesosDaVoc(voc, ctx);
        const linhasAlvo = ids.map(id => ({ id, rotulo: rotulo(id), pt: Math.round((pesos[id] || 0) * valorTipico(id, faixaAlvo) * 10) / 10 }))
            .filter(x => x.pt > 0).sort((a, b) => b.pt - a.pt).slice(0, 4);
        const corte = linhasAlvo.length ? linhasAlvo[0].pt * 0.4 : 0;
        const boas = new Set(linhasAlvo.filter(x => x.pt >= corte).map(x => x.id));
        const linhasAtuais = (Array.isArray(f.atributos) ? f.atributos : []).map(a => ({ id: a.id, rotulo: rotulo(a.id), valor: a.valor, boa: boas.has(a.id) }));
        const raridade = Number(f.raridade) || 0, encaixes = ENCAIXES_POR_RARIDADE[raridade] || 0;
        const raridadeAlvo = Math.max(raridade, 3);
        const veste = porVoc && porVoc[voc] && porVoc[voc][slot] && porVoc[voc][slot].melhor ? porVoc[voc][slot].melhor : null;
        const ruins = linhasAtuais.filter(x => !x.boa).length;
        const passos = [];
        passos.push(proxima
            ? `Refino primeiro: +${refino} → +${proxima.refinoAlvo} (${proxima.refinos} refino${proxima.refinos > 1 ? 's' : ''} com Refino ${proxima.refinoAlvo <= 4 ? 'T1' : 'T2'}${proxima.refinoAlvo >= 5 ? ', e Garantia T1 a partir do +5: sem ela a falha derruba um nível' : '; até o +4 a falha não derruba'}). Potência ${pot} → ${proxima.limiar}: faixa ${faixa} → ${proxima.faixa}. O valor das linhas é sorteado no range da faixa, então refine ANTES de mexer nas linhas.${ataque ? ' Arma ganha ataque a cada refino (varinha e rod só ganham potência).' : ' Armadura ganha defesa a cada refino.'}`
            : `Refino: ${refino >= 10 ? 'já está no +10' : 'já na faixa máxima (potência ' + pot + ')'} — pule.`);
        if (raridade < raridadeAlvo) passos.push(`Raridade: ${RAR_PT[raridade]} (${encaixes} encaixe${encaixes === 1 ? '' : 's'}) → suba até ${RAR_PT[raridadeAlvo]} (${ENCAIXES_POR_RARIDADE[raridadeAlvo]} encaixes) com Raridade T1 — Raro → Épico 20 %, Épico → Lendário 10 %; falhar só gasta a gema, não rebaixa. Mais encaixes = mais chances de cair a linha certa.`);
        else passos.push(`Raridade: ${RAR_PT[raridade]}, ${encaixes} encaixes — já serve${raridade < 4 ? ' (Lendário daria 4, a 10 % por tentativa)' : ''}.`);
        passos.push(`Linhas: Atributo T1 escreve uma linha aleatória no 1º encaixe vazio. Aqui vale procurar: ${linhasAlvo.map(x => x.rotulo).join(', ') || '—'}. Veio ruim? Limpeza T2 apaga só a ÚLTIMA linha (a que acabou de cair) e você tenta de novo. ${ruins >= 2 ? 'As linhas de hoje (' + linhasAtuais.filter(x => !x.boa).map(x => x.rotulo).join(', ') + ') não valem para o ' + voc.toLowerCase() + ': Limpeza T1 apaga TODAS e recomeça do zero.' : 'Limpeza T1 apaga todas — só se a maioria for ruim.'} Ordem T2 embaralha a ordem: tire a linha boa do fim antes de uma Limpeza T2.`);
        passos.push('Valores: com as linhas certas, Refazer T1 re-sorteia o VALOR de todas no range da faixa (por isso o refino vem antes); Refazer T2 só o do último encaixe.');
        passos.push('Antes de gastar: a Bancada de Testes da Forja simula refino, raridade e atributos de graça. Gema = 100 fragmentos + ouro (lastreado na coin); fragmentos vêm do Desmanche (botão acima) e dos raid tokens da invasão (NPC Ravena).');
        return { voc, slot, ataque, pot, faixa, proxima, encaixes, raridade, raridadeAlvo, linhasAlvo, linhasAtuais, veste: veste ? { nome: veste.nome, pt: Math.round(pontuarPeca(veste, voc, ctx).pontos * 10) / 10 } : null, passos };
    }
    /* v2.14.11 — Incomum ANUNCIA no Mercado (04/10: a u2tag tinha leather boots Incomum a 2.299 em ordem aberta; a nota
     * antiga da wiki dizia que não). temNegocio(nome) = o Mercado teve negócio em 30 dias com esse nome: fica fora do
     * desmanche, a não ser que `incluir` seja true (checkbox na aba). */
    function pecasDesmanche(res, temNegocio, incluir) {
        const ORIG = { 'mochila': 'bag', 'depósito': 'depot' };
        return ((res && res.dispensaveis) || []).filter(p => p && p.iid && ORIG[p.origem] && !vendivelNpc(p) && (incluir || typeof temNegocio !== 'function' || !temNegocio(p.nome)))
            .map(p => ({ iid: p.iid, origem: ORIG[p.origem], nome: p.nome }));
    }
    /* v2.11.2 — TROCA TEM CUSTO. Com 0,05 de bônus para ficar, o otimizador
     * tirava o anel do Feiticeiro (5,1 pt) para o Paladino (+1,4) e dava ao
     * Feiticeiro um do depósito (−1,2, sem aparecer na tela): 3 trocas por
     * +0,2 pt (29/09, ao vivo). Ficar com a peça atual vale +1 pt (≈ 10 de
     * vida máx.): só troca quem ganha mais que isso, somando os afetados. */
    /* v2.11.18 — o custo era 1 pt: regen. de mana 2,0 do depósito não tirava a 1,9 vestida (+0,1 a +0,5 pt), e no
     * Paladino nem a 2,5 tirava (+0,8). Desde a 2.11.11 peça vestida não troca de personagem — a cadeia de 3 trocas
     * que motivou o custo não existe mais. Fica só um desempate: qualquer ganho real de encaixe vira sugestão. */
    const EQUIP_FICAR_PT = 0.1;
    /* v2.11.16 — ENCAIXE NOBRE NUNCA SOBRA (dono, 30/09, regra da comunidade + wiki /forja):
     *   escudo, elmo, armadura, calça, bota e anel → regen. de mana (todos) e regen. de vida (Knight);
     *   arma e colar → corpo a corpo, distância, nível mágico, dano físico ou dano mágico.
     * A peça com um desses encaixes pode não ser a melhor nem reserva de ninguém hoje, mas é o
     * que a comunidade guarda — não vai para a lista de sobras (nem para o Mercado). */
    /* v2.11.19 — por vocação: regen. de vida só é nobre no Knight; na arma/colar, o que aquela vocação usa. */
    const NOBRE_DEFESA = { KNIGHT: ['regen_mana', 'regen_vida'], PALADIN: ['regen_mana'], SORCERER: ['regen_mana'], DRUID: ['regen_mana'] };
    const NOBRE_ATAQUE = { KNIGHT: ['corpo_a_corpo', 'dano_fisico'], PALADIN: ['distancia', 'nivel_magico', 'dano_magico', 'dano_fisico'],
                           SORCERER: ['nivel_magico', 'dano_magico'], DRUID: ['nivel_magico', 'dano_magico'] };
    const nobresDe = (slot, voc) => ((slot === 'weapon' || slot === 'necklace' ? NOBRE_ATAQUE : NOBRE_DEFESA)[voc] || []);
    function encaixeNobre(p, voc) {
        const at = (p && p.forja && p.forja.atributos) || [];
        const vocs = voc ? [voc] : VOCS_EQUIP;
        return vocs.some(v => at.some(a => nobresDe(p.slot, v).includes(a.id) && Number(a.valor) > 0));
    }
    /* só a parte nobre da nota (pt), para comparar com a peça que a vocação veste/vai vestir */
    function ptNobre(p, voc, ctx) {
        if (!p) return 0;
        const ids = nobresDe(p.slot, voc);
        return pontuarPeca(p, voc, ctx).detalhe.filter(d => ids.includes(d.id)).reduce((s, d) => s + d.pt, 0);
    }
    function _resolverSlot(porVoc, vocsSlot, s, usadas, extra) {
        // candidatos por voc: top-K não usados + o atual (se não estiver) + extra (virtual)
        const listas = vocsSlot.map(v => {
            const x = porVoc[v][s]; if (!x) return [];
            const ehAtual = (p) => !!(x.atual && p && p.iid === x.atual.iid);
            const l = x.candidatos.filter(c => !usadas.has(c.peca.iid)).slice(0, EQUIP_TOPK).map(c => ({ iid: c.peca.iid, peca: c.peca, pt: c.r.pontos + (ehAtual(c.peca) ? EQUIP_FICAR_PT : 0) }));
            if (x.atual && !l.some(c => c.iid === x.atual.iid) && !usadas.has(x.atual.iid)) l.push({ iid: x.atual.iid, peca: x.atual, pt: x.atualPt + EQUIP_FICAR_PT });
            if (extra && extra[v]) l.push(extra[v]);
            l.push({ iid: null, peca: null, pt: 0 }); // "nada" — evita forçar peça ruim quando falta candidato
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
        const pont = new Map(); // iid|voc → resultado
        const P = (p, v) => { const k = p.iid + '|' + v; if (!pont.has(k)) pont.set(k, pontuarPeca(p, v, ctx)); return pont.get(k); };
        const porVoc = {};
        for (const v of vocs) {
            porVoc[v] = {};
            for (const s of SLOTS_EQUIP) {
                if (v === 'PALADIN' && s === 'shield') continue;
                const atual = pecas.find(p => p.origem === 'corpo' && p.dono === v && p.slot === s) || null;
                /* v2.11.11 — dono, 30/09: "você está tirando item de um personagem e colocando no outro, não é isso
                 * que preciso". Peça que alguém VESTE só é candidata para ele mesmo; as trocas vêm do depósito e da mochila. */
                const cands = pecas.filter(p => p.slot === s && vocacaoPode(p.attrs, v) && !ehTemporaria(p) && !(p.origem === 'corpo' && p.dono !== v)).map(p => ({ peca: p, r: P(p, v) })).sort((x, y) => y.r.pontos - x.r.pontos);
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
            if (r.c && r.c.duasMaos) { // 2 mãos venceu: arma vira a de 2 mãos, escudo fica vazio
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
        /* reservas: os 2 melhores candidatos não usados de cada (voc, slot) com
         * pontos > 0. v2.11.6 — eram 1: o dono perdia peça boa que era a
         * segunda melhor de alguém (29/09). */
        const reservas = new Set();
        for (const v of vocs) {
            for (const s of Object.keys(porVoc[v])) {
                porVoc[v][s].candidatos.filter(c => !usadas.has(c.peca.iid) && c.r.pontos > 0).slice(0, EQUIP_RESERVAS).forEach(c => reservas.add(c.peca.iid));
            }
        }
        /* v2.9.0 — DISPENSÁVEL NÃO PODE DEPENDER DO MAPA. Com ctx.notas (elemento
         * do mapa atual) a wand of inferno vale menos que nada em Dragon Lair
         * (imune a fogo) e ia para a lista de venda — sendo a melhor wand em
         * quase todo o resto. Só é dispensável o que também sobra na conta
         * neutra (sem elemento). Temporárias/de carga nunca entram: consumíveis. */
        /* v2.11.6 — e também não pode depender do TIPO de mapa. Medido num mapa
         * corpo a corpo, resistência elemental quase não vale — e um anel épico
         * de 3 resistências ia para a lista de sobras, sendo o melhor anel num
         * mapa de magia (Quara: o Druida caiu a 36 % de vida). Só sobra o que
         * sobra também no cenário "mapa mágico" (e sem o elemento do mapa). */
        let sobraNoNeutro = null;
        if (!(ctx && ctx._cenario)) {
            const pc = (ctx && ctx.party) || {};
            const cenarios = [Object.assign({}, ctx || {}, { notas: null, _cenario: true, party: Object.assign({}, pc, { fisico: 0.3, tomadoS: Math.max(40, pc.tomadoS || 0), ladoApanha: 4 }) })];
            if (ctx && ctx.notas) cenarios.push(Object.assign({}, ctx, { notas: null, _cenario: true }));
            for (const c of cenarios) {
                const alt = new Set(distribuirEquip(pecas, vocs, c).dispensaveis.map(p => p.iid));
                sobraNoNeutro = sobraNoNeutro ? new Set([...sobraNoNeutro].filter(i => alt.has(i))) : alt;
            }
        }
        const temporarios = pecas.filter(p => ehTemporaria(p) && !(p.origem === 'corpo'));
        /* v2.11.6 — ÉPICO OU MELHOR NUNCA SOBRA: 3+ encaixes são base de forja
         * (wiki /forja: Raro → Épico 20 % por Rarity Gem de 30.000 + 7 coins; com
         * Limpeza T2 + Atributo T1 troca-se o encaixe ruim). A pontuação mede o
         * que a peça dá HOJE; o valor dela é o que dá para fazer com ela. */
        const baseDeForja = p => ((p.forja && p.forja.raridade) || 0) >= RARIDADE_BASE_FORJA
            || (potenciaDe(p) >= POTENCIA_BASE_FORJA && ((p.forja && p.forja.atributos) || []).some(a => SKILL_FORJA.includes(a.id) && Number(a.valor) > 0));
        const bases = pecas.filter(p => !usadas.has(p.iid) && !ehTemporaria(p) && baseDeForja(p));
        /* v2.11.19 — dono, 30/09: "caso todos já estejam equipados com itens bons quero ter a opção de vender".
         * A peça de encaixe nobre só é guardada se o encaixe dela SUPERA o da peça que alguma vocação que a
         * veste vai usar naquele espaço (ex.: regen. de mana 2,0 contra a 1,5 vestida). Se todos já vestem
         * igual ou melhor, ela volta às sobras, com o motivo dizendo isso — dá para vender como antes. */
        const nobreUtil = (p) => vocs.some(v => vocacaoPode(p.attrs, v) && porVoc[v][p.slot] && encaixeNobre(p, v)
            && ptNobre(p, v, ctx) > ptNobre(porVoc[v][p.slot].melhor, v, ctx) + 1e-9);
        const nobres = pecas.filter(p => !usadas.has(p.iid) && !reservas.has(p.iid) && !ehTemporaria(p) && !baseDeForja(p) && nobreUtil(p));
        const nobreSet = new Set(nobres.map(p => p.iid));
        const dispensaveis = pecas.filter(p => !usadas.has(p.iid) && !reservas.has(p.iid) && !ehTemporaria(p) && !baseDeForja(p) && !nobreSet.has(p.iid) && (!sobraNoNeutro || sobraNoNeutro.has(p.iid))).map(p => {
            let melhorUso = null;
            for (const v of vocs) { if (vocacaoPode(p.attrs, v) && porVoc[v][p.slot]) {
                const top = porVoc[v][p.slot].melhor; if (!top) continue;
                const d = P(top, v).pontos - P(p, v).pontos;
                if (!melhorUso || d < melhorUso.d) melhorUso = { v, top, d };
            } }
            if (encaixeNobre(p) && vocs.some(v => vocacaoPode(p.attrs, v))) return Object.assign({}, p, { motivo: 'encaixe bom, mas todos que a vestem já usam igual ou melhor' + (melhorUso ? ` (${melhorUso.top.nome}, ${melhorUso.v.toLowerCase()})` : '') });
            return Object.assign({}, p, { motivo: melhorUso ? `superada por ${melhorUso.top.nome} (${melhorUso.v.toLowerCase()}, −${Math.round(melhorUso.d * 10) / 10} pt)` : 'nenhuma vocação usa' });
        }).sort((a, b) => (b.sell || 0) - (a.sell || 0));
        return { porVoc, reservas, dispensaveis, usadas, temporarios, bases, nobres };
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
    /* v2.10 — CASCA REVISTA (auditoria de UI com o CSS real do jogo, 29/09):
     * cores em variáveis (--tb-mut #9aa4b8 dá ≥ 4,5:1 até sobre #2b3242; o
     * #7d879b antigo dava 4,03 sobre #232936), fonte mínima 10,5 px (havia
     * 8,75), alvos ≥ 28 px no desktop e ≥ 40 px no celular (✕ era 15×16, alça
     * 26×12), gaveta em position:fixed própria (abre para o lado com espaço e
     * cresce para cima perto do fundo) e, até 640 px, trilho horizontal com
     * rótulo + gaveta como folha inferior. Classes das telas continuam as mesmas. */
    const CSS = `
    #tb-caixa,#tb-mostrar{--tb-bg:#12151c;--tb-bg2:#171b24;--tb-cx:#1a1f29;--tb-campo:#232936;--tb-borda:#2b3242;--tb-borda2:#3a4356;--tb-texto:#dde3ee;--tb-mut:#9aa4b8;--tb-ouro:#ffd479;--tb-fmin:10.5px;--tb-alvo:28px}
    #tb-caixa{position:fixed;z-index:99999;left:8px;top:84px}
    #tb-caixa.tb-oculto{display:none}
    #tb-caixa button{font-family:inherit}
    #tb-caixa :focus-visible,#tb-mostrar:focus-visible{outline:2px solid var(--tb-ouro);outline-offset:1px}
    #tb-trilho{width:46px;box-sizing:border-box;background:var(--tb-bg);border:1px solid var(--tb-borda);border-radius:10px;display:flex;flex-direction:column;align-items:center;padding:3px 0;gap:1px;font:12px/1.4 ui-monospace,Consolas,monospace;color:var(--tb-texto);box-shadow:0 8px 30px #0009}
    #tb-alca{width:40px;height:28px;flex:none;border:0;border-radius:8px;background:transparent;padding:0;cursor:grab;touch-action:none;display:flex;align-items:center;justify-content:center}
    #tb-alca::before{content:"";width:24px;height:9px;background:repeating-linear-gradient(180deg,#56607a 0 2px,transparent 2px 4px)}
    #tb-alca:hover{background:var(--tb-campo)}
    #tb-caixa.tb-arrastando,#tb-caixa.tb-arrastando #tb-alca,#tb-caixa.tb-arrastando #tb-cab{cursor:grabbing;user-select:none}
    .tb-ico{position:relative;width:38px;height:34px;flex:none;border:0;padding:0;margin:0;background:transparent;border-radius:9px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;color:#9fb0c9;font-size:17px;line-height:1;user-select:none}
    .tb-ico .tb-rot{display:none}
    .tb-ico:hover{background:var(--tb-campo);color:#fff}
    .tb-ico.on{background:#2c3550;color:var(--tb-ouro)}
    .tb-ico .tb-dot{position:absolute;right:4px;top:3px;width:8px;height:8px;border-radius:4px;display:none}
    .tb-ico .tb-dot.ok{display:block;background:#6ede8a}
    .tb-ico .tb-dot.av{display:block;background:#ffd479}
    .tb-ico .tb-dot.ruim{display:block;background:#ff7b72}
    .tb-ico .tb-dot.pulsa{animation:tbpulsa 1.2s infinite}
    .tb-ico .tb-cont{position:absolute;right:0;top:0;min-width:16px;height:16px;box-sizing:border-box;padding:0 4px;border-radius:8px;background:#c93b33;color:#fff;font:bold var(--tb-fmin)/16px system-ui,sans-serif;text-align:center}
    .tb-ico .tb-cont[hidden]{display:none}
    @keyframes tbpulsa{0%,100%{opacity:1}50%{opacity:.2}}
    #tb-esconder{width:40px;height:28px;flex:none;border:0;border-radius:8px;background:transparent;padding:0;margin-top:2px;font-size:14px;color:var(--tb-mut);cursor:pointer}
    #tb-esconder:hover{color:#fff;background:var(--tb-campo)}
    #tb-mostrar{position:fixed;right:0;top:84px;width:28px;height:56px;box-sizing:border-box;padding:0;border:1px solid var(--tb-borda2);background:var(--tb-borda);color:var(--tb-texto);border-radius:8px 0 0 8px;cursor:pointer;z-index:99999;display:none;font:15px/1 ui-monospace,monospace}
    #tb-mostrar.esq{border-radius:0 8px 8px 0}
    #tb-mostrar:hover{background:#3a4356}
    #tb-gaveta{position:fixed;left:0;top:0;width:300px;box-sizing:border-box;max-height:62vh;background:var(--tb-bg);color:var(--tb-texto);border:1px solid var(--tb-borda);border-radius:10px;font:11.5px/1.4 ui-monospace,Consolas,monospace;box-shadow:0 12px 40px #000a;display:none;flex-direction:column}
    #tb-gaveta.on{display:flex}
    #tb-cab{display:flex;align-items:center;gap:6px;min-height:34px;box-sizing:border-box;padding:2px 3px 2px 10px;border-bottom:1px solid var(--tb-borda);background:var(--tb-bg2);border-radius:10px 10px 0 0;cursor:grab;touch-action:none;flex:none}
    #tb-cab b{color:var(--tb-ouro);letter-spacing:.3px;font-size:11.5px;text-transform:uppercase}
    .tb-x{margin-left:auto;width:32px;height:28px;flex:none;border:0;border-radius:7px;background:transparent;padding:0;cursor:pointer;color:var(--tb-mut);font-size:13px}
    .tb-x:hover{color:#fff;background:var(--tb-campo)}
    #tb-faixa{display:flex;gap:6px;align-items:flex-start;flex:none;padding:5px 10px;border-bottom:1px solid var(--tb-borda);background:#161a22;color:var(--tb-texto);font-size:11px;line-height:1.35}
    #tb-faixa[hidden]{display:none}
    #tb-faixa::before{content:attr(data-icone);flex:none;font-weight:bold}
    #tb-faixa span{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    #tb-faixa.ok{color:#6ede8a;background:#14231a}
    #tb-faixa.erro{color:#ff8a80;background:#241417}
    #tb-corpo{padding:8px;overflow:auto;overflow-x:hidden;flex:1 1 auto;min-height:0;overflow-wrap:anywhere;overscroll-behavior:contain}
    .tb-lin{display:flex;justify-content:space-between;gap:6px;padding:1px 0;border-bottom:1px dotted var(--tb-campo)}
    .tb-lin span:last-child{color:#fff;text-align:right}
    .tb-linha{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin:3px 0}
    .tb-bt{background:#2a3142;border:1px solid var(--tb-borda2);color:var(--tb-texto);min-height:var(--tb-alvo);box-sizing:border-box;padding:4px 8px;border-radius:6px;cursor:pointer;margin:2px 2px 2px 0;font:inherit}
    .tb-bt:hover{background:#39415a}
    .tb-bt:disabled{opacity:.45;cursor:default}
    .tb-bt.pri{background:#8a6a1f;border-color:#c39a34;color:#fff}
    .tb-bt.on{background:#2c5c3a;border-color:#4a9a63;color:#fff}
    .tb-bt.mini{padding:1px 6px;min-width:var(--tb-alvo);font-size:var(--tb-fmin)}
    .tb-cx{background:var(--tb-cx);border:1px solid #262d3b;border-radius:7px;padding:6px 7px;margin:5px 0}
    .tb-mut{color:var(--tb-mut)}
    .tb-ok{color:#6ede8a}.tb-ruim{color:#ff7b72}.tb-av{color:#ffd479}
    .tb-tag{font-size:var(--tb-fmin);padding:0 5px;border-radius:9px;background:var(--tb-borda);color:#9fb0c9;margin-left:3px;white-space:nowrap}
    .tb-ficha{display:inline-block;padding:0 5px;border-radius:5px;background:var(--tb-campo);border:1px solid var(--tb-borda);margin:1px 2px 1px 0;font-size:var(--tb-fmin);white-space:nowrap}
    .tb-ficha.r{border-color:#4a3a8a}
    .tb-ficha small{color:var(--tb-mut);font-size:inherit}
    table.tb-t{width:100%;border-collapse:collapse;font-size:var(--tb-fmin);table-layout:fixed}
    table.tb-t th.n{width:52px}
    table.tb-t td .tb-tag{white-space:normal}
    table.tb-t th{text-align:left;color:var(--tb-mut);font-weight:normal;border-bottom:1px solid var(--tb-borda);padding:2px 3px}
    table.tb-t td{padding:2px 3px;border-bottom:1px dotted #1f2531;vertical-align:top}
    #tb-hunt,#tb-boss,.tb-in{background:var(--tb-campo);color:var(--tb-texto);border:1px solid var(--tb-borda2);border-radius:5px;min-height:var(--tb-alvo);box-sizing:border-box;padding:3px 5px;font:inherit}
    #tb-hunt,#tb-boss{width:100%}
    #tb-log{font-size:11px;line-height:1.45}
    #tb-log div{padding:2px 0 2px 6px;border-bottom:1px dotted #1f2531;border-left:2px solid transparent}
    #tb-log div.erro{border-left-color:#ff7b72;background:#1d1417}
    #tb-log div.novo{border-left-color:var(--tb-ouro)}
    #tb-log div.erro.novo{border-left-color:#ff7b72;background:#2a1517}
    #tb-log .tb-log-h{color:var(--tb-mut);margin-right:4px}
    .tb-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:5px 0}
    .tb-card{background:var(--tb-cx);border:1px solid #262d3b;border-radius:7px;padding:4px 7px}
    .tb-card small{display:block;color:var(--tb-mut);font-size:var(--tb-fmin);letter-spacing:.5px}
    .tb-card b{font-size:14px;color:#fff}
    .tb-sw{display:inline-block;box-sizing:content-box;width:36px;height:20px;border:4px solid transparent;background:#3a4356;background-clip:padding-box;border-radius:14px;position:relative;vertical-align:middle;cursor:pointer;flex:none;padding:0;margin:0;appearance:none}
    .tb-sw.on{background-color:#4a9a63}
    .tb-sw i{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:8px;background:#fff;transition:left .15s}
    .tb-sw.on i{left:18px}
    .tb-sub{display:flex;flex-wrap:wrap;gap:3px;margin:3px 0 5px}
    .tb-sub span,.tb-sub button{display:inline-flex;align-items:center;gap:3px;min-height:var(--tb-alvo);box-sizing:border-box;padding:2px 10px;border-radius:14px;background:var(--tb-cx);color:#9fb0c9;cursor:pointer;border:1px solid #262d3b;font:inherit}
    .tb-sub span.on,.tb-sub button.on{background:#2c5c3a;color:#fff;border-color:#4a9a63}
    .tb-sub span b,.tb-sub button b{color:#ffd479}
    .tb-eq{display:grid;grid-template-columns:58px 1fr 12px 1fr;gap:2px 5px;align-items:center;padding:3px 0;border-bottom:1px dotted #262d3b;cursor:pointer}
    .tb-eq .s{color:var(--tb-mut);font-size:var(--tb-fmin);letter-spacing:.2px;text-transform:uppercase}
    .tb-eq .g{color:#6ede8a;font-weight:bold}
    .tb-eq small{display:block;color:var(--tb-mut);font-size:var(--tb-fmin)}
    .tb-rar{font-size:var(--tb-fmin);padding:0 3px;border-radius:3px;margin-left:2px;background:var(--tb-borda);color:#9fb0c9}
    .tb-rar.r1{color:#6ede8a}.tb-rar.r2{color:#5ab0ff}.tb-rar.r3{color:#c38bff}.tb-rar.r4{color:#ffb14a}.tb-rar.r5{color:#ff7b72}
    .tb-det{grid-column:1/-1;background:var(--tb-bg);border-radius:6px;padding:5px 7px;font-size:var(--tb-fmin);cursor:default}
    .tb-det .m{color:#ff7b72;text-decoration:line-through;opacity:.8}
    .tb-det .neg{color:#ff7b72}
    details.tb-aj{margin:3px 0}
    details.tb-aj>summary{cursor:pointer;color:var(--tb-mut);font-size:var(--tb-fmin);list-style:none;display:inline-flex;align-items:center;justify-content:center;min-width:var(--tb-alvo);min-height:var(--tb-alvo);box-sizing:border-box;padding:0 9px;border:1px solid var(--tb-borda);border-radius:14px;user-select:none}
    details.tb-aj>summary::-webkit-details-marker{display:none}
    details.tb-aj[open]>summary{color:var(--tb-ouro);border-color:var(--tb-borda2)}
    details.tb-aj>div{margin-top:4px}
    label.tb-l{display:inline-flex;align-items:center;gap:4px;min-height:var(--tb-alvo);min-width:var(--tb-alvo);color:#9fb0c9}
    label.tb-l input[type=checkbox],label.tb-l input[type=radio]{width:15px;height:15px;margin:0}
    #tb-corpo [style*="font-size:8"],#tb-corpo [style*="font-size:9"],#tb-corpo [style*="font-size:10px"]{font-size:var(--tb-fmin)!important}
    #tb-caixa.tb-cel{--tb-fmin:12px;--tb-alvo:40px;left:0;right:0}
    .tb-cel #tb-trilho{width:auto;flex-direction:row;align-items:stretch;padding:2px;gap:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
    .tb-cel .tb-ico{flex:1 1 0;min-width:40px;height:52px;font-size:19px;gap:4px}
    .tb-cel .tb-ico .tb-rot{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:9px/1 system-ui,-apple-system,sans-serif;letter-spacing:.2px}
    .tb-cel .tb-ico .tb-dot{right:6px}
    .tb-cel #tb-alca,.tb-cel #tb-esconder{width:40px;height:52px;margin:0}
    .tb-cel #tb-alca::before{width:9px;height:24px;background:repeating-linear-gradient(90deg,#56607a 0 2px,transparent 2px 4px)}
    .tb-cel #tb-gaveta{left:0!important;right:0!important;top:auto!important;bottom:0!important;width:auto;height:50vh;height:50dvh;max-height:none!important;border-radius:14px 14px 0 0;font-size:13px}
    .tb-cel #tb-cab{cursor:default;touch-action:auto;min-height:46px}
    .tb-cel #tb-corpo{padding-bottom:calc(8px + env(safe-area-inset-bottom, 0px))}
    .tb-cel #tb-cab b{font-size:13px}
    .tb-cel .tb-x{width:46px;height:42px;font-size:17px}
    .tb-cel #tb-faixa{font-size:13px}
    .tb-cel #tb-log{font-size:12px}
    .tb-cel .tb-bt{padding:6px 12px}
    .tb-cel #tb-hunt,.tb-cel #tb-boss,.tb-cel select{font-size:16px}
    .tb-cel .tb-in{font-size:14px}
    .tb-cel label.tb-l input[type=checkbox],.tb-cel label.tb-l input[type=radio]{width:20px;height:20px}
    .tb-cel .tb-sw{border-width:10px 6px;border-radius:20px}
    .tb-cel #tb-corpo [style*="font-size:10"],.tb-cel #tb-corpo [style*="font-size:11"]{font-size:var(--tb-fmin)!important}
    #tb-mostrar.tb-cel{width:40px;height:56px}
    `;

    let ABA = 'magia';
    /* v2.8.3 — AVISO DE VERSÃO NOVA (dono, 29/09: "quando alterar aqui, altera
     * no GitHub e só dá um refresh"). O Tampermonkey só confere o @updateURL no
     * intervalo dele, não a cada F5. Então o helper mesmo lê o cabeçalho do
     * arquivo no GitHub (raw tem CORS aberto), compara o @version e, se houver
     * versão maior, acende ↑ no trilho. Clicar abre o link: o Tampermonkey
     * mostra a tela de atualizar, o dono confirma e dá F5. */
    const RAW_URL = 'https://raw.githubusercontent.com/priscilaenorthon-dev/tibidle-helper/main/tibidle-helper.user.js';
    let NOVA_VERSAO = null;
    const versaoMaior = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; };
    /* v2.11 — SÓ O CABEÇALHO, E SÓ VERSÃO DE VERDADE. Antes: baixava os
     * ~300 KB do arquivo a cada 30 min para ler 1 linha, e o que viesse depois
     * de "@version" ia cru para o Log (e o Log não escapava — CONFIRMADO).
     * Agora: Range 0-4095 (e, se o servidor ignorar, a leitura para no
     * primeiro ==/UserScript==), e a versão tem que casar /^\d+(\.\d+){1,3}$/. */
    const VERSAO_VALIDA = /^\d+(\.\d+){1,3}$/;
    async function lerCabecalhoRemoto() {
        const pedir = (comRange) => comPrazo(signal => fetch(RAW_URL + '?t=' + Date.now(),
            Object.assign({ cache: 'no-store' }, comRange ? { headers: { Range: 'bytes=0-4095' } } : {}, signal ? { signal } : {})), PRAZO_REDE_MS);
        let r;
        try { r = await pedir(true); } catch (e) { r = await pedir(false); } // Range recusado no CORS: sem ele
        if (!r || !r.ok) return null;
        if (r.body && typeof r.body.getReader === 'function' && typeof TextDecoder === 'function') {
            const leitor = r.body.getReader(), dec = new TextDecoder();
            let txt = '';
            while (txt.length < 8192) {
                const { done, value } = await leitor.read();
                if (done) break;
                txt += dec.decode(value, { stream: true });
                if (txt.includes('==/UserScript==')) break;
            }
            try { leitor.cancel().catch(() => { }); } catch (e) { }
            return txt;
        }
        return (await r.text()).slice(0, 8192);
    }
    async function verificarAtualizacao() {
        try {
            const cab = await lerCabecalhoRemoto();
            if (!cab) return null;
            const fimCab = cab.indexOf('==/UserScript==');
            const v = ((fimCab > 0 ? cab.slice(0, fimCab) : cab).match(/@version\s+(\S+)/) || [])[1];
            if (!v || !VERSAO_VALIDA.test(v)) return null;
            if (versaoMaior(v, VERSAO) && NOVA_VERSAO !== v) { NOVA_VERSAO = v; log('versão nova no GitHub: ' + v + ' (esta é ' + VERSAO + ') — clique em ↑ no trilho para atualizar', 'ok'); }
            try { pintarTrilho(); } catch (e) { }
            return v;
        } catch (e) { return null; }
    }
    function abrirAtualizacao() { window.open(RAW_URL, '_blank'); }
    /* v2.8.0 — estado da interface por conta: qual gaveta, aberta ou não,
     * posição vertical do trilho, trilho escondido.
     * v2.10 — posição nova: livre=false → lugar automático (borda esquerda da
     * cena, medido no jogo a cada repintura); livre=true → onde o dono soltou,
     * guardado a partir da borda mais próxima (ancora 'esq'|'dir' + dx) para
     * sobreviver a troca de resolução. yCel = altura do trilho no celular.
     * logLido = hora em que o Log foi aberto pela última vez (contador). */
    const UI_PADRAO = { aba: 'magia', aberta: false, oculto: false, livre: false, ancora: 'esq', dx: 8, y: 84, yCel: null, logLido: 0 };
    let UI = null;
    const ui = () => {
        if (UI) return UI;
        const s = ler('ui', {}) || {};
        UI = migrarUI(s, UI_PADRAO, Date.now());
        if (s.logLido === undefined || s.livre === undefined) guardar('ui', UI);
        return UI;
    };
    const guardarUI = (patch) => { UI = Object.assign(ui(), patch); guardar('ui', UI); };
    const ICONES = [['estado', '⌂', 'Status'], ['magia', '✦', 'Magia'], ['autohunt', '↻', 'Auto Hunt'], ['scan', '◎', 'Scan'], ['equip', '⛨', 'Equip'], ['analise', '▤', 'Analisador'], ['progresso', '⚑', 'Progresso'], ['mercado', '⚖', 'Mercado'], ['radar', '⌖', 'Radar'], ['log', '≡', 'Log']];
    /* "?" com a explicação escondida; data-k preserva aberto/fechado ao repintar */
    const aj = (k, html, rotulo) => `<details class="tb-aj" data-k="${k}"><summary>${rotulo || '?'}</summary><div class="tb-mut">${html}</div></details>`;

    /* v2.8.4 — o helper não fica mais preso na borda: trilho + gaveta vivem
     * numa caixa solta (#tb-caixa), arrastável pela alça ou pelo cabeçalho
     * da gaveta para qualquer canto; posição (right/top) guardada por conta.
     * v2.10 — medido numa maquete com o CSS real do jogo (29/09): colado à
     * direita, a gaveta cobria 74 % da barra de atalhos (slots de ataque 2–4
     * inteiros), 88 % da mochila e 96 % do equipamento, e em 1366×768 entrava
     * na barra de ação. Agora o lugar padrão é a borda ESQUERDA da cena
     * (coluna esquerda + 8, topbar + 12), medido na hora; a gaveta abre para
     * dentro da cena e para antes da barra de ação. Arrastar ao fundo tirava 6
     * ícones da tela (o limite olhava só 120 px do trilho): agora o trilho
     * inteiro fica na tela e a gaveta cresce para cima quando embaixo não cabe. */
    /* @@CASCA-INICIO — geometria e contas puras da casca (sem DOM); testes/casca.test.js roda este trecho no node. */
    const CEL_MAX = 640, MARGEM = 8;
    const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
    /* 2.9 → 2.10: a 2.9 guardava {right, top} sempre, mesmo sem arrastar, e
     * right 8/top 84 era o padrão (colado na barra de atalhos). Esse par vira
     * o lugar automático novo; qualquer outro é arrasto do dono e continua
     * valendo, ancorado à direita. logLido ausente = agora (a versão nova não
     * herda erros velhos no contador do Log). */
    function migrarUI(s, padrao, agora) {
        s = s || {};
        const u = Object.assign({}, padrao, s);
        if (s.livre === undefined) {
            const movida = s.right != null && s.top != null && (+s.right !== 8 || +s.top !== 84);
            Object.assign(u, movida ? { livre: true, ancora: 'dir', dx: +s.right || 0, y: +s.top || 0 } : { livre: false });
        }
        delete u.right; delete u.top;
        if (s.logLido === undefined) u.logLido = agora;
        return u;
    }
    /* canto de cima/esquerda do trilho no desktop. J = layout do jogo medido
     * (medirJogo); sem shell (login, lobby) cai em 8/84. O trilho INTEIRO fica
     * na tela — antes o limite olhava só 120 px dele. */
    function lugarDoTrilho(W, H, tw, th, u, arrasto, J) {
        let x, y;
        if (arrasto) { x = arrasto.x; y = arrasto.y; }
        else if (u.livre) { x = u.ancora === 'dir' ? W - (+u.dx || 0) - tw : +u.dx || 0; y = +u.y || 0; }
        else { x = (J.esq ? J.esq.right : 0) + MARGEM; y = (J.topo ? J.topo.bottom : 72) + 12; }
        return { x: limitar(Math.round(x), 4, Math.max(4, W - tw - 4)), y: limitar(Math.round(y), 4, Math.max(4, H - th - 4)) };
    }
    /* celular: só a altura; padrão logo acima de onde a folha (50 %) abre */
    const alturaDoTrilhoCel = (H, th, u, arrasto) => limitar(Math.round(arrasto ? arrasto.y : u.yCel != null ? +u.yCel : H * 0.5 - th - 4), 0, Math.max(0, H - th));
    /* gaveta: no lugar padrão, para dentro da cena (direita do trilho); solta,
     * para o lado com mais espaço. chão = topo da barra de ação (o chat vem
     * abaixo dela) quando ela está sob a gaveta; teto = fim da topbar. Desce a
     * partir do topo do trilho (top) ou, se embaixo não cabe, sobe a partir da
     * base do trilho sem passar do chão (bottom) — trilho arrastado ao fundo
     * não joga a gaveta em cima do ENCERRAR. Altura ≤ 62 % da janela. */
    function lugarDaGaveta(W, H, p, tw, th, gw, padrao, J) {
        const { x, y } = p, esq = x + tw / 2 < W / 2;
        const cabeDir = x + tw + 4 + gw <= W - 4, cabeEsq = x - 4 - gw >= 4;
        const gx = limitar(((padrao || esq) && cabeDir) || !cabeEsq ? x + tw + 4 : x - 4 - gw, 4, Math.max(4, W - gw - 4));
        const barra = J.acao || J.chat, teto = (J.topo ? J.topo.bottom : 0) + 4, alvo = Math.round(H * 0.62);
        const chao = barra && gx < barra.right && gx + gw > barra.left && barra.top - MARGEM - teto >= 200 ? barra.top - MARGEM : H - MARGEM;
        const hA = (y + 200 <= chao ? chao : H - MARGEM) - y, baseB = Math.min(y + th, chao), hB = baseB - teto;
        if (hA >= Math.min(alvo, 320) || hA >= hB) return { gx, top: y, bottom: null, maxH: Math.min(alvo, hA), esq };
        return { gx, top: null, bottom: H - baseB, maxH: Math.min(alvo, hB), esq };
    }
    /* erros do Log depois da última leitura (LOG está em ordem de chegada) */
    function contarErrosNaoLidos(linhas, lido) {
        let n = 0;
        for (let i = linhas.length - 1; i >= 0 && linhas[i].t > lido; i--) if (linhas[i].tipo === 'erro') n++;
        return n;
    }
    /* faixa de retorno: o aviso explícito da aba ou, enquanto as telas não
     * chamam avisar(), a última linha do Log que chegou até 60 s depois de um
     * clique num controle desta aba; some 10 s depois de chegar. */
    const FAIXA_MS = 10000, FAIXA_JANELA_MS = 60000;
    function escolherAviso(aviso, acao, ultima, aba, agora) {
        let a = aviso || null;
        if (acao && acao.aba === aba && ultima && ultima.t >= acao.t && ultima.t - acao.t <= FAIXA_JANELA_MS && (!a || ultima.t > a.t)) a = ultima;
        return a && agora - a.t < FAIXA_MS ? a : null;
    }
    /* @@CASCA-FIM */
    const ehCelular = () => (window.innerWidth || 1200) <= CEL_MAX;
    let _caixa = null, _arrasto = null, _pos = null;
    /* layout do jogo medido na hora (null = não está na tela: login, lobby) */
    function medirJogo() {
        const r = s => { const e = document.querySelector(s); if (!e || !e.getBoundingClientRect) return null; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? b : null; };
        return { esq: r('.s-shell-col-left'), topo: r('.s-shell-topbar'), acao: r('.s-action-bar'), chat: r('.s-log-dock') };
    }
    function posicionarCaixa() {
        const cx = _caixa, t = $('#tb-trilho'), g = $('#tb-gaveta'), m = $('#tb-mostrar'); if (!cx || !t || !g) return;
        const W = window.innerWidth || 1200, H = window.innerHeight || 800, u = ui(), cel = ehCelular();
        cx.classList.toggle('tb-cel', cel); if (m) m.classList.toggle('tb-cel', cel);
        if (cel) {
            /* celular (≤ 640 px): trilho horizontal de largura total que só sobe
             * e desce; a gaveta é folha inferior (CSS). Com a folha aberta, o
             * trilho fica logo acima dela em vez de sumir embaixo. */
            const th = t.offsetHeight || 58;
            let y = alturaDoTrilhoCel(H, th, u, _arrasto);
            _pos = { x: 0, y };
            if (g.classList.contains('on')) { const topo = g.getBoundingClientRect().top; if (y + th > topo) y = Math.max(0, topo - th); }
            cx.style.left = ''; cx.style.top = y + 'px';
            g.style.left = g.style.top = g.style.bottom = g.style.maxHeight = '';
            if (m) { m.classList.remove('esq'); m.style.left = ''; m.style.right = '0px'; m.style.top = limitar(y, 0, H - 56) + 'px'; m.textContent = '‹'; }
            const es = $('#tb-esconder', t); if (es) es.textContent = '›';
            return;
        }
        const J = medirJogo(), tw = t.offsetWidth || 46, th = t.offsetHeight || 300;
        const p = lugarDoTrilho(W, H, tw, th, u, _arrasto, J), { x, y } = p;
        _pos = p;
        cx.style.left = x + 'px'; cx.style.top = y + 'px';
        const L = lugarDaGaveta(W, H, p, tw, th, g.offsetWidth || 300, !u.livre && !_arrasto, J), esq = L.esq;
        g.style.left = L.gx + 'px'; g.style.maxHeight = L.maxH + 'px';
        g.style.top = L.top != null ? L.top + 'px' : 'auto'; g.style.bottom = L.bottom != null ? L.bottom + 'px' : 'auto';
        if (m) { m.classList.toggle('esq', esq); m.style.left = esq ? '0px' : ''; m.style.right = esq ? '' : '0px'; m.style.top = limitar(y, 0, H - 56) + 'px'; m.textContent = esq ? '›' : '‹'; }
        const es = $('#tb-esconder', t); if (es) es.textContent = esq ? '‹' : '›';
    }
    /* soltou: guarda a partir da borda mais próxima (resolução nova não joga o
     * trilho para fora) — no celular, só a altura */
    function fixarPosicao() {
        const p = _pos; _arrasto = null; if (!p) return;
        if (ehCelular()) guardarUI({ yCel: p.y });
        else {
            const t = $('#tb-trilho'), tw = (t && t.offsetWidth) || 46, W = window.innerWidth || 1200, dir = p.x + tw / 2 > W / 2;
            guardarUI({ livre: true, ancora: dir ? 'dir' : 'esq', dx: dir ? W - p.x - tw : p.x, y: p.y });
        }
        posicionarCaixa();
    }
    function voltarAoPadrao() { _arrasto = null; guardarUI({ livre: false, yCel: null }); posicionarCaixa(); avisar(ABA, 'helper de volta ao lugar padrão', 'ok'); }
    /* rótulo de 9 px sob o ícone no celular; sem entrada aqui, usa o nome de ICONES */
    const ROTULO_CURTO = { autohunt: 'Auto', analise: 'Análise' };
    function montarPainel() {
        if ($('#tb-trilho')) return;
        const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
        const u = ui(); ABA = ICONES.some(x => x[0] === u.aba) ? u.aba : 'magia';
        const cx = document.createElement('div'); cx.id = 'tb-caixa'; _caixa = cx;
        /* v2.10 — ícones, alça, esconder e ✕ são <button> com aria-label (antes
         * <div> sem tabindex: o Tab não chegava a nada); aria-pressed marca a
         * aba aberta. O trilho vem antes da gaveta no DOM (ordem do Tab). */
        const bt = (id, cls, rot, txt) => `<button type="button" id="${id}"${cls ? ` class="${cls}"` : ''} title="${rot}" aria-label="${rot}">${txt}</button>`;
        const t = document.createElement('div'); t.id = 'tb-trilho';
        t.setAttribute('role', 'group'); t.setAttribute('aria-label', 'Tibidle Helper');
        t.innerHTML = bt('tb-alca', '', 'mover o helper (arraste ou use as setas; duplo clique volta ao lugar padrão)', '') +
            ICONES.map(([k, ic, nome]) => `<button type="button" class="tb-ico" data-aba="${k}" title="${nome}" aria-label="${nome}" aria-pressed="false" aria-controls="tb-gaveta"><span aria-hidden="true">${ic}</span><span class="tb-rot" aria-hidden="true">${ROTULO_CURTO[k] || nome}</span><span class="tb-dot"></span>${k === 'log' || k === 'radar' ? '<span class="tb-cont" hidden></span>' : ''}</button>`).join('') +
            `<button type="button" class="tb-ico" id="tb-atualizar" title="versão nova disponível" aria-label="atualizar o helper" style="display:none;color:#6ede8a"><span aria-hidden="true">↑</span><span class="tb-rot" aria-hidden="true">Atualizar</span></button>` +
            bt('tb-esconder', '', 'esconder o helper', '‹');
        const g = document.createElement('div'); g.id = 'tb-gaveta';
        g.setAttribute('role', 'region'); g.setAttribute('aria-labelledby', 'tb-titulo');
        g.innerHTML = `<div id="tb-cab" title="arrastar"><b id="tb-titulo"></b><span class="tb-mut">v${VERSAO}</span>${bt('tb-fechar', 'tb-x', 'fechar a gaveta (Esc)', '✕')}</div>` +
            `<div id="tb-faixa" role="status" aria-live="polite" hidden></div><div id="tb-corpo"></div>`;
        const m = document.createElement('button'); m.type = 'button'; m.id = 'tb-mostrar'; m.title = 'mostrar o helper'; m.setAttribute('aria-label', 'mostrar o helper');
        cx.append(t, g);
        document.body.append(cx, m);
        const icone = k => $(`.tb-ico[data-aba="${k}"]`, t);
        const mostrar = (v) => { cx.classList.toggle('tb-oculto', !v); m.style.display = v ? 'none' : 'block'; if (!v) g.classList.remove('on'); posicionarCaixa(); };
        $$('.tb-ico[data-aba]', t).forEach(i => { i.onclick = () => { const k = i.dataset.aba; const aberta = !(ui().aberta && ABA === k); ABA = k; guardarUI({ aba: k, aberta }); renderizar(); }; });
        $('#tb-fechar', g).onclick = () => { guardarUI({ aberta: false }); renderizar(); const i = icone(ABA); if (i) i.focus(); };
        $('#tb-atualizar', t).onclick = abrirAtualizacao;
        $('#tb-esconder', t).onclick = () => { guardarUI({ oculto: true }); mostrar(false); m.focus(); };
        m.onclick = () => { guardarUI({ oculto: false }); mostrar(true); renderizar(); const i = icone(ABA); if (i) i.focus(); };

        /* v2.10 — arrasto com Pointer Events (mouse, dedo, caneta; antes só
         * mousedown, e no celular não mexia). setPointerCapture segura o
         * arrasto com o dedo fora da alça; touch-action:none no CSS impede a
         * página de rolar junto. 4 px de folga separam clique de arrasto. */
        let arr = null;
        const pegar = e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (e.currentTarget.id === 'tb-cab' && (ehCelular() || e.target.closest('button'))) return;
            const r = t.getBoundingClientRect();
            arr = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: r.left, y0: r.top, moveu: false };
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
            e.preventDefault();
        };
        const mover = e => {
            if (!arr || e.pointerId !== arr.id) return;
            const dx = e.clientX - arr.x, dy = e.clientY - arr.y;
            if (!arr.moveu && Math.abs(dx) + Math.abs(dy) < 4) return;
            arr.moveu = true; cx.classList.add('tb-arrastando');
            _arrasto = { x: arr.x0 + dx, y: arr.y0 + dy }; posicionarCaixa();
        };
        const soltar = e => {
            if (!arr || e.pointerId !== arr.id) return;
            const moveu = arr.moveu; arr = null; cx.classList.remove('tb-arrastando');
            if (moveu) fixarPosicao();
        };
        const alca = $('#tb-alca', t);
        [alca, $('#tb-cab', g)].forEach(el => el.addEventListener('pointerdown', pegar));
        document.addEventListener('pointermove', mover);
        document.addEventListener('pointerup', soltar);
        document.addEventListener('pointercancel', soltar);
        alca.addEventListener('dblclick', voltarAoPadrao);
        alca.addEventListener('keydown', e => {
            if (e.key === 'Home') { e.preventDefault(); voltarAoPadrao(); return; }
            const p = e.shiftKey ? 48 : 12, d = { ArrowUp: [0, -p], ArrowDown: [0, p], ArrowLeft: [-p, 0], ArrowRight: [p, 0] }[e.key];
            if (!d || !_pos) return;
            e.preventDefault(); _arrasto = { x: _pos.x + d[0], y: _pos.y + d[1] }; posicionarCaixa(); fixarPosicao();
        });
        /* Esc fecha a gaveta com o foco no helper (ou em lugar nenhum). Com o
         * foco num diálogo do jogo, o Esc continua sendo do jogo. */
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape' || !ui().aberta || ui().oculto) return;
            const at = document.activeElement, noHelper = !!at && cx.contains(at);
            if (!noHelper && at && at !== document.body && at !== document.documentElement) return;
            if (noHelper) { e.preventDefault(); e.stopPropagation(); }
            guardarUI({ aberta: false }); renderizar();
            if (noHelper) { const i = icone(ABA); if (i) i.focus(); }
        });

        /* v2.10 — acessibilidade do que as telas desenham, sem mexer no HTML
         * delas: chave (.tb-sw) ganha role=switch + aria-checked, sub-aba e
         * "ir ›" do Scan ganham role=button (+ aria-pressed na sub-aba), todos
         * entram no Tab e respondem a Enter/Espaço. Quando as telas passarem a
         * desenhar <button>, isto só completa o que faltar. O repinte troca o
         * innerHTML e o foco caía no <body>: volta para o mesmo controle. */
        const corpo = $('#tb-corpo', g);
        let foco = null;
        const chaveDoFoco = el => { if (!el || el === corpo || !corpo.contains(el)) return null; if (el.id) return { id: el.id }; for (const a of ['data-voc', 'data-modelo', 'data-scan-ir', 'data-scan-mapa', 'data-k']) if (el.hasAttribute(a)) return { a, v: el.getAttribute(a) }; return null; };
        const acharFoco = k => k.id ? document.getElementById(k.id) : corpo.querySelector(`[${k.a}="${String(k.v).replace(/["\\]/g, '\\$&')}"]`);
        const acessibilizar = () => {
            $$('.tb-sw', corpo).forEach(s => {
                s.setAttribute('role', 'switch'); s.setAttribute('aria-checked', s.classList.contains('on') ? 'true' : 'false');
                if (s.tagName !== 'BUTTON' && !s.hasAttribute('tabindex')) s.tabIndex = 0;
                if (!s.getAttribute('aria-label')) { const r = s.parentElement && $('b', s.parentElement); s.setAttribute('aria-label', r ? r.textContent.trim() : 'ligar/desligar'); }
            });
            $$('.tb-sub > span, .tb-sub > button, [data-scan-ir]', corpo).forEach(s => {
                if (s.tagName !== 'BUTTON') { s.setAttribute('role', 'button'); if (!s.hasAttribute('tabindex')) s.tabIndex = 0; }
                if (s.parentElement && s.parentElement.classList.contains('tb-sub') && !s.hasAttribute('aria-pressed')) s.setAttribute('aria-pressed', s.classList.contains('on') ? 'true' : 'false');
            });
        };
        corpo.addEventListener('keydown', e => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role=switch]:not(button),[role=button]:not(button)')) { e.preventDefault(); e.target.click(); }
        });
        corpo.addEventListener('focusin', e => { foco = chaveDoFoco(e.target); });
        document.addEventListener('focusin', e => { if (!corpo.contains(e.target)) foco = null; }, true);
        document.addEventListener('pointerdown', e => { if (!cx.contains(e.target)) foco = null; }, true);
        if (typeof MutationObserver === 'function') { new MutationObserver(() => {
            acessibilizar();
            const at = document.activeElement;
            if (foco && (!at || at === document.body)) { const el = acharFoco(foco); if (el) { try { el.focus({ preventScroll: true }); } catch { } } }
        }).observe(corpo, { childList: true }); }
        // faixa de retorno: um clique num controle da aba marca "ação desta aba"
        corpo.addEventListener('click', e => { if (e.target.closest && e.target.closest('button,[role=switch],[role=button],.tb-sw,[data-scan-ir],input[type=checkbox],input[type=radio]')) _acaoNaAba = { aba: ABA, t: Date.now() }; }, true);
        corpo.addEventListener('change', () => { _acaoNaAba = { aba: ABA, t: Date.now() }; }, true);

        window.addEventListener('resize', posicionarCaixa);
        mostrar(!u.oculto);
        renderizar();
    }
    /* v2.10 — contador de erros não lidos no ícone do Log (o ponto vermelho
     * antigo olhava só a ÚLTIMA linha: um erro seguido de um info sumia).
     * Integração 2.11: fica esta contagem pelo LOG (sobrevive ao F5, porque
     * logLido é guardado); ERROS.naoLidos (área B, só em memória) é zerado
     * junto em marcarLogLido para os dois nunca discordarem. */
    function errosNaoLidos() { return contarErrosNaoLidos(LOG, +ui().logLido || 0); }
    let _logAberto = false, _logLidoAntes = 0;
    function marcarLogLido() {
        const u = ui();
        if (!_logAberto) { _logAberto = true; _logLidoAntes = +u.logLido || 0; }
        if (errosNaoLidos() > 0 || Date.now() - (+u.logLido || 0) > 5000) guardarUI({ logLido: Date.now() });
        ERROS.naoLidos = 0;
    }
    function pintarContadorLog() {
        const i = $('#tb-trilho .tb-ico[data-aba="log"]'); if (!i) return;
        const n = errosNaoLidos(), b = $('.tb-cont', i), nome = (ICONES.find(x => x[0] === 'log') || [])[2] || 'Log';
        if (b) { b.textContent = n > 9 ? '9+' : String(n); b.hidden = !n; }
        const rot = n ? `${nome} — ${n} erro${n > 1 ? 's' : ''} não lido${n > 1 ? 's' : ''}` : nome;
        if (i.getAttribute('aria-label') !== rot) { i.setAttribute('aria-label', rot); i.title = rot; }
    }
    /* faixa de retorno: último aviso DA ABA ABERTA por 10 s (escolherAviso) */
    let _acaoNaAba = null, _faixaTimer = null;
    function pintarFaixa() {
        const f = $('#tb-faixa'); if (!f) return;
        const u = ui(), a = u.aberta && !u.oculto && ABA !== 'log' ? escolherAviso(AVISOS[ABA], _acaoNaAba, LOG[LOG.length - 1], ABA, Date.now()) : null;
        clearTimeout(_faixaTimer); _faixaTimer = null;
        if (!a) { if (!f.hidden) { f.hidden = true; f.textContent = ''; delete f.dataset.t; } return; }
        if (f.hidden || f.dataset.t !== String(a.t) || f.title !== a.msg) {
            const tipo = a.tipo === 'erro' ? 'erro' : a.tipo === 'ok' ? 'ok' : 'info';
            f.className = tipo; f.dataset.icone = tipo === 'erro' ? '✕' : tipo === 'ok' ? '✓' : '›'; f.dataset.t = String(a.t);
            const s = document.createElement('span'); s.textContent = a.msg; f.replaceChildren(s); f.title = a.msg; f.hidden = false;
        }
        _faixaTimer = setTimeout(pintarFaixa, Math.max(250, FAIXA_MS - (Date.now() - a.t) + 50));
    }
    /* v2.10 — Log: 11 px (era 10), hora apagada à esquerda, erro com barra
     * vermelha, linhas que chegaram desde a última leitura com barra dourada;
     * sem rolagem própria (a gaveta já rola). Abrir o Log zera o contador. */
    function pintarLog() {
        const c = $('#tb-log');
        if (c) marcarLogLido();
        pintarContadorLog();
        pintarFaixa();
        if (!c) return;
        const novo = _logLidoAntes;
        const html = LOG.length ? LOG.slice(-80).reverse().map(l => {
            const cor = l.tipo === 'erro' ? 'tb-ruim' : l.tipo === 'ok' ? 'tb-ok' : '';
            const h = new Date(l.t).toLocaleTimeString('pt-BR');
            /* v2.11 — escHtml: o Log guarda texto que vem de FORA (erro do servidor,
             * nome de item, versão do GitHub) e é persistido; sem escapar, um
             * "<img onerror>" rodava a cada vez que o Log abria (CONFIRMADO). */
            return `<div class="${l.tipo === 'erro' ? 'erro' : ''}${l.t > novo ? ' novo' : ''}"><span class="tb-log-h">${h}</span> <span class="${cor}">${escHtml(l.msg)}</span></div>`;
        }).join('') : '<div class="tb-mut">nada registrado ainda</div>';
        /* v2.11 (D2) — mesma linha, mesmo DOM: log() chama isto a cada linha e o
         * repinte de 4 s também; reescrever o Log igual apagava a seleção de
         * quem estava copiando um erro. */
        if (c._tbHtml === html) return;
        c._tbHtml = html;
        c.innerHTML = html;
    }

    /* =========================================================================
     *  v2.11 (D2) — CONTEÚDO DAS TELAS Status, Magia, Equip, Analisador e Log
     *
     *  O que a revisão de UI de 29/09 achou nestas telas e como ficou:
     *   • nome de hunt/boss/magia/item, erro do servidor e título de sessão
     *     iam crus para o innerHTML (só o Equip escapava) → escHtml em tudo que
     *     vem de fora, inclusive <option value="…"> (boss "Pesso&Vesso");
     *   • "ocupado" morava no botão (btn.disabled pelo handler) e o repinte de
     *     4 s reconstruía o botão habilitado: o Auto-sell aceitava o 2º clique
     *     no meio do 1º (CONFIRMADO) → o estado mora em variável e o HTML o
     *     desenha; o handler recusa o clique repetido;
     *   • o repinte trocava o innerHTML mesmo sem mudança: o select da hunt
     *     perdia o foco (e fechava) e a caixa do "copiar JSON" sumia → ver
     *     _renderizar (só troca quando o HTML muda; com um select/caixa de
     *     texto em uso, espera o blur);
     *   • números em pt-BR (vírgula decimal), "2+ alvos" no lugar de "≥2",
     *     "poção de mana ≤30%" no lugar de "mana Mana ≤30", slots e vocações
     *     em português, "OURO —" quando o saldo não foi lido (era "0").
     *  CSS com escopo nestas telas, com as variáveis --tb-* da casca (piso de
     *  fonte --tb-fmin, alvo --tb-alvo: 10,5/28 px no desktop, 12/40 no celular).
     * ====================================================================== */
    const CSS_TELAS = `
    #tb-corpo .tb-larga{display:block;width:100%;margin:3px 0}
    #tb-corpo .tb-grande{font-size:13px;padding:8px}
    .tb-st-topo{flex-wrap:nowrap}
    .tb-st-hunt{margin-left:auto;text-align:right;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .tb-card .tb-oz{font-size:var(--tb-fmin);color:var(--tb-mut);font-weight:normal}
    .tb-card b.tb-vazio{color:var(--tb-mut);font-weight:normal}
    .tb-par{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:3px 0}
    #tb-corpo .tb-par .tb-bt{margin:0;width:100%;min-width:0}
    .tb-nota{font-size:var(--tb-fmin);margin-top:4px}
    .tb-seg{display:flex;margin:0 0 6px;border:1px solid var(--tb-borda2);border-radius:7px;overflow:hidden;background:#2a3142}
    .tb-seg button{flex:1 1 0;min-width:0;min-height:var(--tb-alvo);box-sizing:border-box;margin:0;padding:2px 3px;border:0;border-left:1px solid var(--tb-borda2);background:transparent;color:var(--tb-texto);font:inherit;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tb-seg button:first-child{border-left:0}
    .tb-seg button:hover{background:#39415a}
    .tb-seg button[aria-pressed="true"]{background:#2c5c3a;color:#fff;font-weight:bold}
    .tb-palpite{font-size:var(--tb-fmin);flex-wrap:nowrap}
    .tb-palpite>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .tb-resist{font-size:var(--tb-fmin);margin-top:2px}
    .tb-ver{margin:5px 0;padding:5px 7px;border-radius:7px;border:1px solid var(--tb-borda);background:var(--tb-cx);font-size:var(--tb-fmin);line-height:1.45}
    .tb-ver.ok{border-color:#2c5c3a}.tb-ver.ruim{border-color:#6b2b2b}
    .tb-vsel{display:inline-block;padding:0 7px;margin-right:4px;border-radius:9px;font-weight:bold}
    .tb-vsel.ok{background:#1f4a2c;color:#8ff0a8}.tb-vsel.ruim{background:#4a1f1f;color:#ff9b93}
    .tb-mv{display:grid;grid-template-columns:2.8em minmax(0,1fr);gap:0 4px;padding:3px 0;border-bottom:1px dotted #262d3b}
    .tb-mv:last-child{border-bottom:0}
    .tb-mv>b{color:var(--tb-ouro);padding-top:1px}
    .tb-mx{font-size:var(--tb-fmin);color:var(--tb-mut);margin-top:1px}
    .tb-mx.tb-morto{font-style:italic}
    .tb-eq-bts{display:flex;gap:4px;margin:0 0 4px}
    #tb-corpo .tb-eq-bts .tb-bt{flex:1 1 auto;margin:0;padding:4px 5px;white-space:nowrap}
    .tb-eq-info{font-size:var(--tb-fmin)}
    #tb-corpo .tb-eq-vocs{margin:5px 0 0}
    #tb-corpo .tb-eq-vocs button{flex:1 1 0;justify-content:center;min-width:0}
    .tb-eq-sw{display:inline-flex;align-items:center;gap:6px;min-height:var(--tb-alvo);padding:0 4px 0 0;margin:0;border:0;background:none;color:#9fb0c9;font:inherit;cursor:pointer}
    .tb-eq-sw[aria-checked="true"]{color:#fff}
    #tb-corpo .tb-eq{grid-template-columns:5.6em minmax(0,1fr) 12px minmax(0,1fr)}
    .tb-eq:focus-visible{outline:2px solid var(--tb-ouro);outline-offset:1px}
    .tb-eq-nota{font-size:var(--tb-fmin)}
    table.tb-an{width:100%;border-collapse:collapse;table-layout:fixed;font-size:var(--tb-fmin);margin:4px 0}
    table.tb-an th,table.tb-an td{padding:3px 2px;border-bottom:1px dotted #1f2531;vertical-align:top;text-align:right;white-space:nowrap;overflow:hidden}
    table.tb-an th{color:var(--tb-mut);font-weight:normal;border-bottom:1px solid var(--tb-borda)}
    table.tb-an th:first-child,table.tb-an td:first-child{text-align:left;white-space:normal;word-break:normal;overflow-wrap:break-word;padding-left:0}
    table.tb-an td:first-child .tb-tag{display:inline-block;margin:1px 3px 0 0}
    table.tb-an col.c5{width:4.9em}table.tb-an col.c4{width:4.2em}table.tb-an col.c3{width:3.4em}
    .tb-an-exp .tb-linha{flex-wrap:nowrap}
    .tb-an-exp .tb-linha>span{flex:1 1 auto;min-width:0}
    .tb-an-exp textarea{display:block;width:100%;height:120px;box-sizing:border-box;margin-top:3px;resize:vertical;font:var(--tb-fmin)/1.35 ui-monospace,Consolas,monospace;background:#0d1016;color:var(--tb-texto);border:1px solid var(--tb-borda);border-radius:5px}
    `;
    function garantirCssTelas() {
        if (document.getElementById('tb-css-telas')) return;
        const st = document.createElement('style'); st.id = 'tb-css-telas'; st.textContent = CSS_TELAS;
        (document.head || document.documentElement).appendChild(st);
    }
    /* números como o jogo mostra: ponto de milhar, vírgula decimal */
    const numBR = (n, casas) => n == null || n === '' || !isFinite(n) ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: casas || 0 });
    const milBR = (n) => n == null || !isFinite(n) ? '—' : (n / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'k';
    const alvosTxt = (n) => n + '+ alvo' + (n > 1 ? 's' : '');
    /* textos da Magia (dica do modelo, motivo do slot cortado) falam "≥2": na tela, "2+" */
    const maisAlvos = (s) => String(s == null ? '' : s).replace(/≥(\d+)/g, '$1+');
    /* texto montado pela lógica com decimal em ponto ("59.4 pt"): vírgula na tela */
    const decBR = (s) => String(s == null ? '' : s).replace(/(\d)\.(\d)/g, '$1,$2');


    /* v1.9.0 — STATUS no layout do Stonegy (print do dono, 27/09): cartões
     * LEVEL / OURO / CAP LIVRE / TAXA XP, linha da hunt e os dois botões
     * grandes. Os botões antigos continuam embaixo.
     * v2.11 (D2) — OURO "—" sem leitura (fora do jogo o card dizia "0", que
     * parece saldo zerado); botões de "avançado" com estado de ocupado no
     * estado (Auto-sell, Confirmar hunt, Aprender dano, Rebaixar catálogos);
     * DIAGNÓSTICO ao lado de Finalizar hunt; resultado na faixa (avisar). */
    let _autoSellEmCurso = false, _rebaixandoCat = false, _diagnosticando = false;
    /* saldo do frame (fresco) ou do HUD; null = não lido (login, lobby, sem frame) */
    function ouroNaTela() {
        const f = ESTADO_WS.frame;
        if (frameFresco() && f.balance != null && isFinite(f.balance)) return Number(f.balance);
        const el = tid('hud-gold'), t = el ? (el.textContent || '').replace(/\D/g, '') : '';
        return t ? parseInt(t, 10) : null;
    }
    function telaEstado() {
        garantirCssTelas();
        const h = huntAtual(), dentro = emHunt(), c = capLivre(), taxa = dentro ? lerTaxaXp() : null, a = autoHunt(), ouro = ouroNaTela();
        const card = (r, v, vazio) => `<div class="tb-card"><small>${r}</small><b${vazio ? ' class="tb-vazio"' : ''}>${v}</b></div>`;
        const lin = (x, y) => `<div class="tb-lin"><span class="tb-mut">${x}</span><span>${y}</span></div>`;
        const boss = ESTADO_WS.boss && ESTADO_WS.boss !== '?' ? ESTADO_WS.boss : null;
        const huntTxt = boss ? 'boss ' + boss : h ? h.title : (dentro ? 'hunt ?' : '');
        const voc = vocacaoAtual();
        const danos = (() => { const n = danosMedidosNesteNivel(), v = Object.keys(danosConhecidos()).length - n; return n + ' neste nível' + (v ? ` <span class="tb-av">+${v} de outro</span>` : ''); })();
        return `<div class="tb-linha tb-st-topo"><span class="${dentro ? 'tb-ok' : 'tb-mut'}">${dentro ? '● caçando' : '○ cidade'}</span>${a.on ? '<span class="tb-tag tb-ok">Auto Hunt</span>' : ''}${_cicloEmCurso ? '<span class="tb-tag tb-av">vendendo…</span>' : ''}<span class="tb-mut tb-st-hunt" title="${escHtml(huntTxt)}">${escHtml(huntTxt)}</span></div>
          <div class="tb-grid">
            ${card('NÍVEL', numBR(nivelAtual()))}
            ${ouro == null ? card('OURO', '—', true) : card('OURO', numBR(ouro))}
            ${c ? card('CAP LIVRE', `${numBR(c.pct)}% <span class="tb-oz">${escHtml(c.ozTxt)} oz</span>`) : card('CAP LIVRE', '—', true)}
            ${taxa != null ? card('TAXA XP', numBR(taxa) + '%') : card('TAXA XP', '—', true)}
          </div>
          ${NOVA_VERSAO ? `<button type="button" class="tb-bt on tb-larga" id="tb-bt-atualizar">↑ atualizar para a ${escHtml(NOVA_VERSAO)}</button>` : ''}
          <button type="button" class="tb-bt pri tb-larga tb-grande" id="tb-venda-rapida" ${_cicloEmCurso ? 'disabled' : ''}>${_cicloEmCurso ? 'vendendo…' : 'Venda rápida'}</button>
          <div class="tb-par">
            <button type="button" class="tb-bt" id="tb-finalizar" ${_cicloEmCurso || !dentro ? 'disabled' : ''} title="${dentro ? 'encerra a caçada e fecha o resumo' : 'só dentro de uma caçada'}">Finalizar hunt</button>
            <button type="button" class="tb-bt" id="tb-diagnostico" ${_diagnosticando ? 'disabled' : ''} title="confere o socket, os catálogos, os perfis e o estado do helper e mostra o que falta">${_diagnosticando ? 'conferindo…' : 'DIAGNÓSTICO'}</button>
          </div>
          ${aj('estado-ajuda', 'Venda rápida: encerra a caçada (se estiver nela — pede confirmação) → purifica todos → vende no NPC → guarda no depot, e fica na cidade. Finalizar hunt: só encerra e fecha o resumo. DIAGNÓSTICO: confere o que o helper precisa (socket, catálogos, perfis) e diz o que falta.')}
          <details class="tb-aj" data-k="estado-av"><summary>avançado</summary><div>
            <div class="tb-cx">
              ${lin('Vocação na tela', escHtml(VOC_ROTULO[voc] || voc))}
              ${lin('Lure máx', h ? numBR(lureMax(h)) + ' criaturas' : '—')}
              ${lin('Catálogos', CAT.hunts ? `<span class="tb-ok">${numBR(CAT.hunts.length)} hunts · ${numBR((CAT.magias || []).length)} magias</span>` : '<span class="tb-ruim">não carregados</span>')}
              ${lin('Danos medidos', danos)}
            </div>
            <div class="tb-linha">
              <button type="button" class="tb-bt mini" id="tb-recat" ${_rebaixandoCat ? 'disabled' : ''}>${_rebaixandoCat ? 'rebaixando…' : 'Rebaixar catálogos'}</button>
              <button type="button" class="tb-bt mini" id="tb-aprender" ${_aprendendo || _aplicando ? 'disabled' : ''}>${_aprendendo ? 'medindo…' : 'Aprender dano (os 4)'}</button>
              <button type="button" class="tb-bt mini" id="tb-confhunt" ${_confirmandoHunt ? 'disabled' : ''}>${_confirmandoHunt ? 'confirmando…' : 'Confirmar hunt'}</button>
              <button type="button" class="tb-bt mini" id="tb-autosell" ${_autoSellEmCurso ? 'disabled' : ''}>${_autoSellEmCurso ? 'marcando…' : 'Auto-sell: marcar tudo'}</button>
            </div>
            <div class="tb-mut tb-nota">F5 zera a marcação do Auto Selling — depois de recarregar, "Auto-sell: marcar tudo".</div>
          </div></details>`;
    }
    /* handlers do Status (antes dentro de _renderizar). Cada ação longa marca o
     * estado ANTES do primeiro await e repinta; o clique repetido é recusado
     * pelo estado, não pelo botão. */
    function ligarEstado() {
        const vr = $('#tb-venda-rapida'); if (vr) ligarDoisToques(vr, 'venda', 'confirmar: encerrar e vender?', () => { if (!_cicloEmCurso) cicloDeVenda('venda'); }, emHunt);
        const bat = $('#tb-bt-atualizar'); if (bat) bat.onclick = abrirAtualizacao;
        const fh = $('#tb-finalizar'); if (fh) fh.onclick = () => { if (!_cicloEmCurso) cicloDeVenda('finalizar'); };
        const dg = $('#tb-diagnostico');
        if (dg) { dg.onclick = async () => {
            if (_diagnosticando) return;
            _diagnosticando = true; renderizar();
            try { await rodarDiagnostico(); }
            catch (e) { avisar('estado', 'diagnóstico estourou: ' + ((e && e.message) || e), 'erro'); }
            finally { _diagnosticando = false; renderizar(); }
        }; }
        const rec = $('#tb-recat');
        if (rec) { rec.onclick = async () => {
            if (_rebaixandoCat) return;
            _rebaixandoCat = true; renderizar();
            try { if (!await carregarCatalogos(true)) avisar('estado', 'catálogos não rebaixados — sem rede? (detalhe no Log)', 'erro'); } // o sucesso já sai no Log (e na faixa)
            catch (e) { avisar('estado', 'rebaixar catálogos estourou: ' + e.message, 'erro'); }
            finally { _rebaixandoCat = false; renderizar(); }
        }; }
        const apr = $('#tb-aprender');
        if (apr) { apr.onclick = async () => {
            if (_aprendendo || _aplicando) return;
            _aprendendo = true; renderizar();
            try {
                const r = await aprenderDanosPorRest(false);
                if (r.erro) { avisar('estado', 'sem /spell-numbers (' + r.erro + ') — medindo pelos diálogos', 'info'); await aprenderDanosTodos(); }
            } catch (e) { avisar('estado', 'aprender dano estourou: ' + e.message, 'erro'); }
            finally { _aprendendo = false; renderizar(); }
        }; }
        const cfh = $('#tb-confhunt');
        if (cfh) { cfh.onclick = async () => {
            if (_confirmandoHunt) return; // a amostragem também abre esta tela: um de cada vez
            _confirmandoHunt = true; renderizar();
            const antes = ler('hunt_id', null);
            try {
                const r = await confirmarHuntPeloExplore();
                if (r.erro) avisar('estado', 'não consegui confirmar a hunt: ' + r.erro, 'erro');
                else if (r.hunt && r.hunt.id === antes) avisar('estado', 'hunt confirmada: ' + r.hunt.title + ' (já era esta)', 'ok');
            } catch (e) { avisar('estado', 'confirmar hunt estourou: ' + e.message, 'erro'); }
            finally { _confirmandoHunt = false; renderizar(); }
        }; }
        /* v1.8.0 — F5 zera a marcação do Auto Selling (o ciclo de venda não).
         * Abre a janela de loot, aba Auto Selling, MARCAR TUDO, fecha. Só por
         * botão, nunca sozinho. */
        const ase = $('#tb-autosell');
        if (ase) { ase.onclick = async () => {
            if (_autoSellEmCurso) return;
            _autoSellEmCurso = true; renderizar();
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
                avisar('estado', 'auto-sell: ' + (m ? m[1] : '?') + ' itens marcados para venda', 'ok');
            } catch (e) {
                const fechar = tid('window-close-loot'); if (fechar) fechar.click();
                avisar('estado', 'auto-sell falhou: ' + e.message, 'erro');
            } finally { _autoSellEmCurso = false; renderizar(); }
        }; }
    }
    /* v2.11 — CSS das telas Auto Hunt e Scan, com escopo (.tb-ah / .tb-sc):
     * a casca do painel é de outra área; aqui só o que estas telas pedem —
     * alvos ≥ 28 px, letra ≥ 10,5 px, cartões de resultado, confirmação em
     * 2 toques. Injetado uma vez, na primeira tela que precisar. */
    const CSS_AH = `
    .tb-ah,.tb-sc{font-size:11px}
    .tb-ah .tb-bt,.tb-sc .tb-bt{min-height:28px;font-size:11px}
    .tb-ah .tb-bt.mini,.tb-sc .tb-bt.mini{min-height:28px;padding:2px 9px;font-size:10.5px}
    .tb-ah .tb-tag,.tb-sc .tb-tag{font-size:10.5px}
    .tb-ah .tb-in,.tb-sc .tb-in{min-height:28px;box-sizing:border-box;font-size:11px}
    .tb-sc select{background:#232936;color:#dde3ee;border:1px solid #3a4356;border-radius:5px;padding:3px 5px;font:inherit;font-size:11px;min-height:28px;flex:1;min-width:0}
    .tb-ah label.tb-l,.tb-sc label.tb-l{min-height:28px;color:#b4bfd2}
    .tb-ah input[type=checkbox],.tb-ah input[type=radio],.tb-sc input[type=checkbox]{width:16px;height:16px;margin:0 4px 0 0;flex:none}
    .tb-ah details.tb-aj>summary,.tb-sc details.tb-aj>summary{display:inline-flex;align-items:center;min-height:28px;line-height:1.3;font-size:10.5px;padding:3px 10px;box-sizing:border-box;color:#9aa3b5}
    .tb-ah-opc{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
    .tb-ah .tb-mut,.tb-sc .tb-mut{color:#9aa3b5}
    .tb-chave{background:none;border:0;padding:5px 2px;margin:0;min-height:28px;cursor:pointer;display:inline-flex;align-items:center}
    .tb-chave:disabled{opacity:.45;cursor:default}
    .tb-chave:focus-visible,.tb-sc-mapa:focus-within{outline:2px solid #ffd479;outline-offset:1px;border-radius:6px}
    .tb-sc-lista{max-height:200px;overflow:auto}
    .tb-sc-mapa{display:flex;align-items:center;gap:4px;min-height:28px;padding:0 2px;border-bottom:1px dotted #232936;cursor:pointer}
    .tb-sc-mapa.tb-escondido{display:none}
    .tb-sc-mapa .tb-tag{margin-left:auto}
    .tb-sc-caixa{background:#1a1f29;border:1px solid #2c5c3a;border-radius:7px;padding:6px 7px;margin:5px 0}
    .tb-sc-card{background:#1a1f29;border:1px solid #262d3b;border-radius:7px;padding:6px 7px;margin:5px 0}
    .tb-sc-card.fora{opacity:.75;border-style:dashed}
    .tb-sc-card.falha{border-color:#6b2b2b}
    .tb-sc-cab{display:flex;align-items:center;gap:6px}
    .tb-sc-cab b{flex:1;min-width:0}
    .tb-selo{font-size:10.5px;padding:1px 7px;border-radius:9px;background:#2b3242;color:#b4bfd2;white-space:nowrap;font-weight:bold}
    .tb-selo.ok{background:#1f4a2c;color:#8ff0a8}.tb-selo.av{background:#4a3b14;color:#ffd479}.tb-selo.ruim{background:#4a1f1f;color:#ff9b93}.tb-selo.mut{font-weight:normal}
    .tb-sc-num{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:4px 0}
    .tb-sc-num>div{background:#12151c;border-radius:6px;padding:3px 6px;min-width:0}
    .tb-sc-num small{display:block;color:#9aa3b5;font-size:10.5px}
    .tb-sc-num b{font-size:14px;color:#fff}
    .tb-sc-num b.tb-ok{color:#6ede8a}.tb-sc-num b.tb-ruim{color:#ff7b72}
    .tb-sc-pe{display:flex;align-items:flex-start;gap:6px}
    .tb-sc-pe details{flex:1;min-width:0}
    .tb-sc-det{font-size:10.5px;color:#b4bfd2}
    .tb-conf{background:#8a2a1f !important;border-color:#e0685c !important;color:#fff !important}
    .tb-ah-hist{width:100%;border-collapse:collapse;font-size:10.5px;table-layout:fixed}
    .tb-ah-hist td,.tb-ah-hist th{padding:2px 3px;border-bottom:1px dotted #232936;text-align:left;vertical-align:top;overflow-wrap:anywhere}
    .tb-ah-hist th{color:#9aa3b5;font-weight:normal}
    .tb-ah-alarme{background:#3a1d1d;border:1px solid #6b2b2b;color:#ffb3ad;border-radius:7px;padding:5px 7px;margin:5px 0}
    `;
    function garantirCssAH() {
        if (document.getElementById('tb-css-ah')) return;
        const st = document.createElement('style'); st.id = 'tb-css-ah'; st.textContent = CSS_AH;
        (document.head || document.documentElement).appendChild(st);
    }
    /* v2.11 — CONFIRMAÇÃO EM 2 TOQUES para o que troca de mapa ou encerra a
     * caçada ("ir ›" do Scan, Venda rápida caçando). O 1º toque vira o botão
     * em "confirmar…" por 4 s; o repinte de 4 s não perde o estado (fica em
     * _doisToques, não no botão). precisa(): quando falso, 1 toque basta. */
    const _doisToques = { chave: null, ate: 0 };
    function ligarDoisToques(btn, chave, rotulo, acao, precisa) {
        garantirCssAH();
        btn.dataset.dt = chave;
        if (!btn.dataset.rotulo) btn.dataset.rotulo = btn.textContent;
        const pendente = () => _doisToques.chave === chave && Date.now() < _doisToques.ate;
        const voltarRotulo = () => $$(`[data-dt="${chave}"]`).forEach(b => { b.textContent = b.dataset.rotulo; b.classList.remove('tb-conf'); });
        if (pendente()) { btn.textContent = rotulo; btn.classList.add('tb-conf'); }
        btn.onclick = () => {
            if (pendente() || (precisa && !precisa())) { _doisToques.chave = null; voltarRotulo(); acao(); return; }
            _doisToques.chave = chave; _doisToques.ate = Date.now() + 4000;
            btn.textContent = rotulo; btn.classList.add('tb-conf');
            setTimeout(() => { if (_doisToques.chave === chave && Date.now() >= _doisToques.ate) { _doisToques.chave = null; voltarRotulo(); } }, 4100);
        };
    }
    /* v2.11 — o campo de texto da lista "nunca vender" sobrevive ao repinte
     * de 4 s da aba (o repinte troca o innerHTML e o campo perderia o foco e
     * o que foi digitado). Rascunho e cursor ficam aqui até o blur de
     * verdade (o campo ainda na página). */
    let _rascunhoAH = null, _repintandoAH = false;
    function manterRascunho(el) {
        if (!el) return;
        if (_rascunhoAH && _rascunhoAH.id === el.id) { el.value = _rascunhoAH.valor; try { el.focus(); el.setSelectionRange(_rascunhoAH.ini, _rascunhoAH.fim); } catch { /* campo sem seleção */ } }
        const salvar = () => { _rascunhoAH = { id: el.id, valor: el.value, ini: el.selectionStart, fim: el.selectionEnd }; };
        ['focus', 'input', 'keyup', 'click'].forEach(ev => el.addEventListener(ev, salvar));
        el.addEventListener('blur', () => setTimeout(() => { if (el.isConnected && _rascunhoAH && _rascunhoAH.id === el.id) _rascunhoAH = null; }, 0));
    }

    /* v1.9.0 — AUTO HUNT (print do Stonegy). Chave desligada por padrão,
     * guardada por conta e sobrevive a F5 (o boot avisa no log).
     * v2.11 — lista "nunca vender", histórico dos ciclos e alarme > 3/h. */
    function telaAutoHunt() {
        garantirCssAH();
        /* o innerHTML que vem a seguir tira o campo focado da página, e o
         * Chrome dispara blur/change NESSA hora (visto ao vivo em 29/09: o
         * change repintava por dentro do repinte e o innerHTML estourava).
         * Até o fim desta pintura, change/blur não são do dono. */
        _repintandoAH = true; Promise.resolve().then(() => { _repintandoAH = false; });
        const a = autoHunt(), c = capLivre(), dentro = emHunt();
        const h = a.huntId != null && CAT.hunts ? CAT.hunts.find(x => x.id === a.huntId) : null;
        const motivo = motivoNaoDispara();
        const estado = motivo === '' ? '<span class="tb-ok">disparando…</span>' : motivo === null ? '<span class="tb-ok">vigiando a mochila</span>' : `<span class="tb-av">${escHtml(motivo)}</span>`;
        const hist = historicoCiclos(), nHora = ciclosNaUltimaHora(hist, Date.now());
        const lista = Array.isArray(a.nuncaVender) ? a.nuncaVender : [];
        const prot = [a.nvEquip !== false ? 'equip.' : null, a.nvImbu !== false ? 'imbuement' : null, lista.length ? lista.length + ' seus' : null].filter(Boolean);
        const hora = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const oz = x => x == null ? '?' : Math.round(x).toLocaleString('pt-BR');
        const ORIG = { auto: 'auto', venda: 'venda' };
        const linhasHist = hist.slice().reverse().map(r => `<tr><td>${hora(r.t)}<br><span class="tb-mut">${escHtml(ORIG[r.origem] || r.origem)}${r.dur != null ? ' · ' + (r.dur >= 60 ? Math.round(r.dur / 60) + ' min' : r.dur + ' s') : ''}</span></td>
            <td>${r.ouro != null ? r.ouro.toLocaleString('pt-BR') : '—'}${r.guardados ? `<br><span class="tb-mut">${r.guardados} guardado(s)</span>` : ''}</td>
            <td>${oz(r.ozAntes)} → ${oz(r.ozDepois)}</td>
            <td>${r.depot ? r.depot.usado + '/' + r.depot.total : '—'}</td>
            <td class="${r.erro ? 'tb-ruim' : 'tb-ok'}">${r.erro ? escHtml(r.erro) : 'ok'}</td></tr>`).join('');
        return `<div class="tb-ah">
          <div class="tb-linha"><button type="button" class="tb-chave" id="tb-ah-on" role="switch" aria-checked="${a.on ? 'true' : 'false'}" aria-label="Automação do Auto Hunt"><span class="tb-sw ${a.on ? 'on' : ''}"><i></i></span></button><b>Automação</b><span class="tb-mut" style="margin-left:auto;text-align:right">${estado}</span></div>
          ${nHora > 3 ? `<div class="tb-ah-alarme">⚠ ${nHora} ciclos na última hora — a mochila enche em menos de 20 min. Confira o limite, o depot e o histórico abaixo.</div>` : ''}
          <div class="tb-linha"><span class="tb-mut">hunt</span><b>${h ? escHtml(h.title) : '—'}</b>
            <button type="button" class="tb-bt mini" id="tb-ah-memorizar" ${dentro ? '' : 'disabled'} title="memorizar a hunt atual">📍 esta</button>
            <button type="button" class="tb-bt mini" id="tb-ah-esquecer" ${a.huntId != null ? '' : 'disabled'}>esquecer</button></div>
          <div class="tb-mut" style="margin-top:4px">vender quando a mochila tiver</div>
          <div class="tb-ah-opc"><label class="tb-l"><input type="radio" name="tb-ah-modo" value="pct" ${a.modo === 'pct' ? 'checked' : ''}> até</label><input type="number" class="tb-in" id="tb-ah-pct" value="${a.pct}" min="1" max="99" style="width:56px" aria-label="% livre"><span>% livre</span></div>
          <div class="tb-ah-opc"><label class="tb-l"><input type="radio" name="tb-ah-modo" value="oz" ${a.modo === 'oz' ? 'checked' : ''}> até</label><input type="number" class="tb-in" id="tb-ah-oz" value="${a.oz}" min="10" step="10" style="width:68px" aria-label="oz livres"><span>oz livres</span></div>
          <div class="tb-linha"><span class="tb-mut">agora</span><span>${c ? `${c.pct}% · ${c.ozTxt} oz livres` : '—'}</span>${mochilaNoLimite() ? '<span class="tb-tag tb-ruim">no limite</span>' : ''}</div>
          <label class="tb-l"><input type="checkbox" id="tb-ah-voltar" ${a.voltar ? 'checked' : ''}> voltar para a hunt depois de vender</label>
          <details class="tb-aj" data-k="ah-nunca"><summary>nunca vender: ${prot.length ? escHtml(prot.join(' + ')) : '<span class="tb-ruim">NADA</span>'}</summary><div>
            <div><label class="tb-l"><input type="checkbox" id="tb-ah-nv-equip" ${a.nvEquip !== false ? 'checked' : ''}> equipamento (tudo que veste ou empunha)</label></div>
            <div><label class="tb-l"><input type="checkbox" id="tb-ah-nv-imbu" ${a.nvImbu !== false ? 'checked' : ''}> materiais de imbuement</label></div>
            <div class="tb-linha"><input class="tb-in" id="tb-ah-lista" placeholder="sua lista: nomes separados por vírgula" value="${escHtml(lista.join(', '))}" style="flex:1" aria-label="sua lista de itens para nunca vender"></div>
            <div class="tb-mut">Antes de confirmar a venda no NPC o helper desmarca estes itens no painel (vale também para a Venda rápida). Se não conseguir desmarcar algum, não vende nada e registra no Log — o ciclo para. O que não é vendido vai para o depot.</div>
          </div></details>
          <details class="tb-aj" data-k="ah-hist"><summary>histórico (${hist.length})${nHora ? ' · ' + nHora + ' na última hora' : ''}</summary><div>
            ${hist.length ? `<table class="tb-ah-hist"><tr><th style="width:23%">hora</th><th style="width:19%">ouro</th><th style="width:22%">oz</th><th style="width:14%">depot</th><th>resultado</th></tr>${linhasHist}</table>` : '<div class="tb-mut">nenhum ciclo ainda</div>'}
          </div></details>
          ${aj('ah-ajuda', 'Ciclo: finalizar → purificar todos → vender no NPC (menos a lista "nunca vender") → guardar no depot → voltar. Qualquer falha para o ciclo e desliga a chave (ver Log); depot cheio (mochila ainda no limite depois do depot) também desliga. Intervalo mínimo entre ciclos: 5 min. Não dispara com boss, Scan ou troca de mapa em andamento. F5 no meio de um ciclo automático retoma em até 10 min; fora disso a party fica onde está. Se trocar de hunt na mão, clique "📍 esta" dentro dela. Lure e magia não são tocados ao voltar.')}
        </div>`;
    }
    function ligarAutoHunt() {
        const sw = $('#tb-ah-on');
        if (sw) { sw.onclick = () => {
            const a = autoHunt();
            if (!a.on && a.huntId == null) { log('memorize a hunt antes de ligar a automação', 'erro'); return; }
            guardarAutoHunt({ on: !a.on });
            log('Auto Hunt ' + (!a.on ? 'LIGADO' : 'desligado'), !a.on ? 'ok' : 'info');
            renderizar();
        }; }
        const mem = $('#tb-ah-memorizar');
        if (mem) { mem.onclick = async () => {
            mem.disabled = true;
            try {
                const hs = ESTADO_WS.huntId != null && !ESTADO_WS.boss ? (CAT.hunts || []).find(x => x.id === ESTADO_WS.huntId) : null;
                const r = hs ? { hunt: hs } : await confirmarHuntPeloExplore();
                if (r.erro) log('não consegui memorizar: ' + r.erro, 'erro');
                else { guardarAutoHunt({ huntId: r.hunt.id }); log('hunt memorizada: ' + r.hunt.title, 'ok'); }
            } catch (e) { log('memorizar estourou: ' + e.message, 'erro'); }
            renderizar();
        }; }
        const esq = $('#tb-ah-esquecer');
        if (esq) esq.onclick = () => { guardarAutoHunt({ huntId: null, on: false }); log('hunt esquecida; automação desligada', 'info'); renderizar(); };
        $$('input[name="tb-ah-modo"]').forEach(r => { r.onchange = () => { guardarAutoHunt({ modo: r.value }); renderizar(); }; });
        const pct = $('#tb-ah-pct'); if (pct) pct.onchange = () => guardarAutoHunt({ pct: Math.max(1, Math.min(99, parseInt(pct.value) || 20)) });
        const oz = $('#tb-ah-oz'); if (oz) oz.onchange = () => guardarAutoHunt({ oz: Math.max(10, parseInt(oz.value) || 200) });
        const vol = $('#tb-ah-voltar'); if (vol) vol.onchange = () => guardarAutoHunt({ voltar: vol.checked });
        const nvE = $('#tb-ah-nv-equip'); if (nvE) nvE.onchange = () => { guardarAutoHunt({ nvEquip: nvE.checked }); log('nunca vender equipamento: ' + (nvE.checked ? 'ligado' : 'DESLIGADO'), nvE.checked ? 'ok' : 'info'); renderizar(); };
        const nvI = $('#tb-ah-nv-imbu'); if (nvI) nvI.onchange = () => { guardarAutoHunt({ nvImbu: nvI.checked }); log('nunca vender materiais de imbuement: ' + (nvI.checked ? 'ligado' : 'DESLIGADO'), nvI.checked ? 'ok' : 'info'); renderizar(); };
        const lst = $('#tb-ah-lista');
        if (lst) {
            manterRascunho(lst);
            /* grava no Enter e no blur de verdade — não só no change: depois de
             * um repinte o valor volta por código e o Chrome não dispara change */
            const gravar = () => {
                if (_repintandoAH || !lst.isConnected) return; // o repinte tirou o campo da página: o rascunho segue em _rascunhoAH
                const vistos = new Set(), itens = [];
                lst.value.split(/[,;\n]+/).map(x => x.trim().toLowerCase()).filter(Boolean).forEach(x => { if (!vistos.has(normNomeItem(x))) { vistos.add(normNomeItem(x)); itens.push(x); } });
                if ((autoHunt().nuncaVender || []).join('|') === itens.join('|')) return;
                _rascunhoAH = null;
                guardarAutoHunt({ nuncaVender: itens });
                log('nunca vender (sua lista): ' + (itens.length ? itens.join(', ') : 'vazia'), 'ok');
                setTimeout(renderizar, 0); // nunca repintar de dentro de um evento do próprio campo
            };
            lst.onchange = gravar;
            lst.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); gravar(); } });
            lst.addEventListener('blur', () => setTimeout(gravar, 0));
        }
    }
    /* v2.2.0 — SCAN. Lista de mapas do seu nível com caixinha; minutos por
     * mapa; o que fazer ao terminar; progresso ao vivo; veredito.
     * v2.11 — como CONTROLE: 1ª linha chave + "Iniciar · N mapas · ~M min";
     * 2ª linha dois <select> (modelo, ao terminar); resultados em cartões
     * (xp/h raw, ouro/h, selo do veredito, detalhe atrás de "+"); "ir ›" com
     * confirmação em 2 toques; lista de mapas com display por CLASSE (o
     * filtro trocava display 'block' por '' e os rótulos viravam inline — a
     * caixa ficava colada no mapa errado). */
    const MODELOS_SCAN = ['equilibrado', 'economica', 'area', 'inteligente'];
    const FIM_SCAN = [['voltar', 'fim: voltar'], ['ficar', 'fim: ficar'], ['xp', 'fim: melhor XP'], ['ouro', 'fim: melhor ouro']];
    function telaScan() {
        garantirCssAH();
        const c = scanCfg(), nv = nivelAtual(), marc = new Set(c.mapas), fim = fimDoScan(c);
        const hunts = (CAT.hunts || []).filter(h => (h.levelMin || 1) <= nv).sort((a, b) => (b.levelMin || 0) - (a.levelMin || 0) || a.title.localeCompare(b.title));
        const res = scanResultados(), v = scanVereditos();
        const fmtK = n => n == null || !isFinite(n) ? '—' : (n / 1000).toFixed(1) + 'k';
        const fmtO = n => n == null || !isFinite(n) ? '—' : (n >= 0 ? '+' : '') + Math.round(n).toLocaleString('pt-BR');
        const hora = t => t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '?';
        const falta = xpFaltando();
        const tNivel = xpH => falta != null && xpH > 0 ? fmtHoras(falta / xpH) : '—';
        const ocupado = scanOcupado() || !!travaJogo();
        const dis = scanOcupado() ? 'disabled' : '';
        const nMapas = c.mapas.filter(id => (CAT.hunts || []).some(h => h.id === id)).length;
        const nVar = c.comparar ? (c.variantes || []).filter(m => MODELOS[m] && m !== 'boss').length : 1;
        const nMed = nMapas * nVar, estMin = Math.max(1, Math.round(nMed * (c.minutos + 0.5)));
        const btTxt = SCAN.ativo ? `Parar · ${Math.max(1, SCAN.idx + 1)}/${SCAN.fila.length}` : scanOcupado() ? (SCAN.fase === 'restaurando' || SCAN.restaurando ? 'devolvendo o jogo…' : 'terminando…')
            : `Iniciar · ${nMapas} mapa${nMapas === 1 ? '' : 's'}${nVar > 1 ? ' × ' + nVar : ''} · ~${estMin} min`;
        let corpo = `<div class="tb-sc"><div class="tb-linha">
            <button type="button" class="tb-chave" id="tb-scan-on" role="switch" aria-checked="${SCAN.ativo ? 'true' : 'false'}" aria-label="Scan" ${!SCAN.ativo && scanOcupado() ? 'disabled' : ''}><span class="tb-sw ${SCAN.ativo ? 'on' : ''}"><i></i></span></button><b>Scan</b>
            <button type="button" class="tb-bt ${SCAN.ativo ? '' : 'pri'}" id="tb-scan-go" style="margin-left:auto" ${!SCAN.ativo && (scanOcupado() || !nMed) ? 'disabled' : ''}>${btTxt}</button></div>`;
        if (SCAN.ativo || SCAN.fase === 'restaurando') {
            const h = SCAN.ativo ? scanHuntAtual() : null, m = SCAN.vivo;
            const segJ = m ? m.seg : SCAN.fase === 'medindo' ? (Date.now() - SCAN.t0) / 1000 : 0;
            const resta = SCAN.fase === 'medindo' ? Math.max(0, scanCfgRodada().minutos * 60 - segJ) : null;
            corpo += `<div class="tb-sc-caixa">` + (SCAN.fase === 'restaurando' ? '<b>devolvendo o jogo como estava…</b>' : `<b>${h ? escHtml(h.title) : '?'}</b> <span class="tb-tag">${escHtml(SCAN.fase)}</span>`) +
                (resta != null ? ` <span class="tb-mut">${Math.floor(resta / 60)}:${String(Math.round(resta % 60)).padStart(2, '0')}</span>` : '') +
                (m && m.seg >= 30 ? `<div>xp/h <b>${fmtK(xpBase(m))}</b> <span class="tb-mut">raw</span> · ouro/h <b class="${m.ouroH >= 0 ? 'tb-ok' : 'tb-ruim'}">${fmtO(m.ouroH)}</b> · estável <b class="${(m.estavelH || 0) >= 0 ? 'tb-ok' : 'tb-ruim'}">${m.estavelH != null ? fmtO(m.estavelH) : '—'}</b> · ${m.abatesH}/h</div>` + razaoHtml(m.razao, true) : (SCAN.fase === 'medindo' ? '<div class="tb-mut">aquecendo… (30 s)</div>' : '')) +
                (SCAN.erro ? `<div class="tb-ruim">${escHtml(SCAN.erro)}</div>` : '') + `</div>`;
        }
        corpo += `<div class="tb-linha">
            <select id="tb-scan-modelo" aria-label="modelo aplicado em cada mapa" title="modelo de magia aplicado nos 4 em cada mapa" ${dis || (c.comparar ? 'disabled' : '')}>${MODELOS_SCAN.filter(m => MODELOS[m]).map(m => `<option value="${m}" ${(c.modelo || 'equilibrado') === m ? 'selected' : ''}>${escHtml(nomeModelo(m))}</option>`).join('')}</select>
            <select id="tb-scan-fim" aria-label="o que fazer ao terminar" title="ao terminar: voltar como estava (mapa, lure e kits) · ficar no último mapa (kits de antes) · ir para o melhor XP ou ouro (com o modelo)" ${dis}>${FIM_SCAN.map(([k, t]) => `<option value="${k}" ${fim === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="tb-linha"><input type="number" class="tb-in" id="tb-scan-min" value="${c.minutos}" min="1" max="60" style="width:52px" aria-label="minutos por mapa" ${dis}><span class="tb-mut">min por mapa</span>
            <label class="tb-l" style="margin-left:auto"><input type="checkbox" id="tb-scan-lure" ${c.lureMax ? 'checked' : ''} ${dis}> lure máximo</label></div>
          <details class="tb-aj" data-k="scan-estudo"><summary>estudo de variantes${c.comparar ? ' · ligado' : ''}</summary><div>
            <label class="tb-l"><input type="checkbox" id="tb-scan-comparar" ${c.comparar ? 'checked' : ''} ${dis}> em cada mapa, medir cada variante</label>
            ${c.comparar ? '<div style="margin:2px 0 0 4px">' + MODELOS_SCAN.map(m => `<label class="tb-l" style="margin-right:6px"><input type="checkbox" data-scan-var="${m}" ${(c.variantes || []).includes(m) ? 'checked' : ''} ${dis}> ${escHtml(nomeModelo(m))}</label>`).join('') + '</div>' : ''}
          </div></details>
          <details class="tb-aj" data-k="scan-mapas"><summary>mapas (${marc.size} marcados)</summary><div>
            <div class="tb-linha"><input class="tb-in" id="tb-scan-filtro" placeholder="filtrar…" style="flex:1" aria-label="filtrar mapas"><button type="button" class="tb-bt mini" id="tb-scan-limpar-mapas" ${dis}>desmarcar</button></div>
            <div id="tb-scan-lista" class="tb-sc-lista">` +
            hunts.map(h => { const r = res[h.id]; return `<label class="tb-sc-mapa"><input type="checkbox" data-scan-mapa="${h.id}" ${marc.has(h.id) ? 'checked' : ''} ${dis}> <span class="tb-mut">[${h.levelMin || 1}]</span> ${escHtml(h.title)}${r && !r.erro && r.xpH != null ? ` <span class="tb-tag tb-ok">${fmtK(xpBase(r))} · ${fmtO(ouroBase(r))}</span>` : ''}</label>`; }).join('') +
            `</div></div></details>`;
        const falhas = Object.values(res).filter(r => r && r.erro);
        if (v.lista.length || falhas.length) {
            const selo = r => r.fora ? 'mut' : r.veredito === 'Os dois' ? 'ok' : r.veredito === 'dá prejuízo' ? 'ruim' : /^abaixo|^único/.test(r.veredito) ? 'mut' : 'av';
            const detalhe = r => [
                `lure ${escHtml(r.lureTxt || r.lure)} · ${r.abatesH != null ? r.abatesH + ' abates/h' : ''}${r.tomadoH != null ? ` · tomou ${(r.tomadoH / 1000).toFixed(0)}k/h` : ''}`,
                `medido ${hora(r.t)} · nível ${r.nivel || '?'} · ${r.seg ? Math.round(r.seg / 60) : r.minutos} min${r.capMin != null ? ` · mochila mín. ${r.capMin}% livre` : ''}`,
                r.suja ? `<span class="tb-ruim">suja: a mochila passou de ${100 - CAP_MIN_SCAN}% e o loot se perdeu — fora do ranking</span>` : '',
                r.fora === 'nivel' ? `<span class="tb-av">medido no nível ${r.nivel}; agora ${v.nivelRef} — fora do ranking (±2)</span>` : '',
                r.supVoc ? `poção: ${Object.entries(r.supVoc).map(([vv, x]) => (VOC_CURTO[vv] || escHtml(vv)) + ' ' + x.ouro + 'o').join(' · ')}` : '',
                r.sorte ? `<span class="tb-av">sorte +${r.sorte.toLocaleString('pt-BR')}: ${(r.raros || []).map(escHtml).join(', ')}</span>` : '',
                r.ultimaFalha ? `<span class="tb-ruim">última tentativa (${hora(r.ultimaFalha.t)}): ${escHtml(r.ultimaFalha.erro)}</span>` : ''
            ].filter(Boolean).map(x => `<div>${x}</div>`).join('') + (razaoTexto(r.razao) ? razaoHtml(r.razao, true) : '');
            /* v2.11 — bestiário no resultado do Scan (aba Progresso): quanto falta para o próximo
             * bônus permanente deste mapa, no ritmo de abates medido aqui. pgBestiarioTexto já escapa. */
            const bestiarioDoCartao = r => { try { const t = pgBestiarioTexto(r.id, { [r.id]: { abatesH: r.abatesH } }); return t ? `<div class="tb-mut">${t}</div>` : ''; } catch (e) { return ''; } };
            const cartao = r => `<div class="tb-sc-card ${r.fora ? 'fora' : ''}">
                <div class="tb-sc-cab"><b>${escHtml(r.title)}</b>${r.modelo && r.modelo !== 'equilibrado' ? `<span class="tb-tag">${escHtml(nomeModelo(r.modelo))}</span>` : ''}<span class="tb-selo ${selo(r)}">${escHtml(r.veredito)}</span></div>
                <div class="tb-sc-num"><div><small>xp/h sem boost</small><b class="${!r.fora && xpBase(r) >= v.melhorXp * 0.9 ? 'tb-ok' : ''}">${fmtK(xpBase(r))}</b><small>real ${fmtK(r.xpH)} · nível em ${tNivel(r.xpH)}</small></div>
                  <div><small>ouro/h ${r.estavelH != null ? 'estável' : 'bruto'}</small><b class="${ouroBase(r) < 0 ? 'tb-ruim' : !r.fora && ouroBase(r) >= v.melhorOuro * 0.9 ? 'tb-ok' : ''}">${fmtO(ouroBase(r))}</b><small>loot − poção${r.ouroH != null && r.estavelH != null ? ' · bruto ' + fmtO(r.ouroH) : ''}</small></div></div>
                ${bestiarioDoCartao(r)}
                <div class="tb-sc-pe"><details class="tb-aj" data-k="scan-r-${r.id}-${escHtml(r.modelo || '')}"><summary>+</summary><div class="tb-sc-det">${detalhe(r)}</div></details>
                  <button type="button" class="tb-bt mini" data-scan-ir="${r.id}" ${ocupado ? 'disabled' : ''} title="trocar a party para este mapa (pede confirmação)">ir ›</button></div>
              </div>`;
            const nFora = v.lista.filter(r => r.fora).length;
            corpo += `<div class="tb-linha" style="margin-top:6px"><b>Resultados</b><span class="tb-mut">${v.nivelRef ? 'nível ' + v.nivelRef + ' ±2' : ''}</span><button type="button" class="tb-bt mini" id="tb-scan-limpar" style="margin-left:auto">limpar</button></div>
              <div class="tb-mut" style="margin-bottom:2px">${v.topXp ? `upar: <b>${escHtml(v.topXp.title)}</b>${falta != null ? ' (nível em ' + tNivel(v.topXp.xpH) + ')' : ''}. ` : ''}${v.topOuro && ouroBase(v.topOuro) > 0 ? `ouro: <b>${escHtml(v.topOuro.title)}</b>.` : v.rank.length ? 'nenhum mapa deu ouro positivo.' : 'nenhum resultado válido no ranking.'}${nFora ? ` ${nFora} fora do ranking (suja ou outro nível).` : ''}</div>` +
              v.lista.map(cartao).join('') +
              falhas.map(r => `<div class="tb-sc-card falha"><div class="tb-sc-cab"><b>${escHtml(r.title)}</b><span class="tb-selo ruim">falhou</span></div><div class="tb-ruim">${escHtml(r.erro)}</div>${r.xpH != null ? `<div class="tb-mut">parcial: xp/h ${fmtK(xpBase(r))} · ouro/h ${fmtO(ouroBase(r))}${r.seg ? ' em ' + Math.max(1, Math.round(r.seg / 60)) + ' min' : ''}</div>` : ''}<div class="tb-mut">${hora(r.t)}</div></div>`).join('') +
              aj('scan-legenda', '<b>xp/h sem boost</b> = EXP raw do analisador (sem boost nem prey) — é por ele que o ranking compara; "real" é o que sobe o nível. <b>estável</b> = ouro/h só com moedas e itens que o catálogo espera cair 3+ vezes na janela; o resto é loteria e aparece como sorte. Veredito: "XP" = 90% do melhor XP; "Ouro" = 90% do melhor ouro estável; "Os dois" = ambos. Fora do ranking: medição <b>suja</b> (mochila abaixo de ' + CAP_MIN_SCAN + '% livre, loot perdido) ou de outro nível (±2). Morte ou caçada encerrada por fora param o Scan e aparecem como falha, sem apagar a medição boa anterior.');
        } else {
            corpo += aj('scan-ajuda', 'Marque os mapas, ajuste os minutos e clique Iniciar. O Scan entra em cada mapa pelo socket, aplica o modelo nos 4, espera os minutos e anota xp/h, ouro/h e abates/h. O Auto Hunt fica quieto enquanto o Scan roda. Ao terminar ou parar, devolve o jogo como estava (mapa, lure e kits), a não ser que "ao terminar" diga outra coisa.');
        }
        return corpo + '</div>';
    }
    function ligarScan() {
        const filtro = $('#tb-scan-filtro');
        if (filtro) {
            const aplicarFiltro = () => { const v = (_scanFiltro || '').toLowerCase(); $$('#tb-scan-lista .tb-sc-mapa').forEach(l => l.classList.toggle('tb-escondido', !!v && !(l.textContent || '').toLowerCase().includes(v))); };
            filtro.value = _scanFiltro; aplicarFiltro();
            filtro.oninput = () => { _scanFiltro = filtro.value; aplicarFiltro(); };
        }
        const alternar = () => { if (SCAN.ativo) scanParar('pelo botão'); else scanIniciar(); };
        const scOn = $('#tb-scan-on'); if (scOn) scOn.onclick = alternar;
        const go = $('#tb-scan-go'); if (go) go.onclick = alternar;
        $$('[data-scan-mapa]').forEach(cb => { cb.onchange = () => {
            const id = parseInt(cb.dataset.scanMapa), c = scanCfg();
            const m = c.mapas.filter(x => x !== id); if (cb.checked) m.push(id);
            guardarScanCfg({ mapas: m }); renderizar();
        }; });
        const scMin = $('#tb-scan-min'); if (scMin) scMin.onchange = () => { guardarScanCfg({ minutos: Math.max(1, Math.min(60, parseInt(scMin.value) || 5)) }); setTimeout(renderizar, 0); }; // o change pode vir do campo saindo da página num repinte
        const scLure = $('#tb-scan-lure'); if (scLure) scLure.onchange = () => guardarScanCfg({ lureMax: scLure.checked });
        const scFim = $('#tb-scan-fim'); if (scFim) scFim.onchange = () => guardarScanCfg({ fim: scFim.value, fimEscolhido: true });
        const scMod = $('#tb-scan-modelo'); if (scMod) scMod.onchange = () => guardarScanCfg({ modelo: scMod.value });
        const scCmp = $('#tb-scan-comparar'); if (scCmp) scCmp.onchange = () => { guardarScanCfg({ comparar: scCmp.checked }); renderizar(); };
        $$('[data-scan-var]').forEach(cb => { cb.onchange = () => { const c = scanCfg(); const v = (c.variantes || []).filter(x => x !== cb.dataset.scanVar); if (cb.checked) v.push(cb.dataset.scanVar); guardarScanCfg({ variantes: v }); renderizar(); }; });
        const scLm = $('#tb-scan-limpar-mapas'); if (scLm) scLm.onclick = () => { guardarScanCfg({ mapas: [] }); renderizar(); };
        const scL = $('#tb-scan-limpar'); if (scL) ligarDoisToques(scL, 'scan-limpar', 'apagar todos?', () => { guardar('scan_resultados', {}); log('resultados do Scan apagados', 'info'); renderizar(); });
        $$('[data-scan-ir]').forEach(b => { const id = parseInt(b.dataset.scanIr); ligarDoisToques(b, 'ir-' + id, 'confirmar ›', () => scanIrPara(id)); });
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
     *  deu −138k/h. O detalhe todo continua na aba Analisador.
     *  v2.11 (D2) — modelo como controle segmentado numa linha (aria-pressed),
     *  selo do veredito do grupo (fila simulada de viabilidadeParty: custo por
     *  abate contra o teto, ouro/h de poção e runa, quem bebe mana), por
     *  personagem o gasto/h e as runas/h, fichas com "2+ alvos", extras em
     *  português ("poção de mana ≤30%" — saía "mana Mana ≤30") e os slots que a
     *  Magia cortou por nunca dispararem (r.mortos) numa linha discreta. */
    const MODELO_CURTO = { economica: 'Eco', equilibrado: 'Equil', area: 'Área', inteligente: 'Intel', boss: 'Boss' };
    /* nome da poção como o painel fala: "Strong Mana Potion" → "poção de mana forte" */
    function nomePocao(n) {
        const s = String(n || '');
        const tipo = /mana/i.test(s) ? 'poção de mana' : /spirit/i.test(s) ? 'poção espiritual' : 'poção de vida';
        return tipo + (/ultimate/i.test(s) ? ' suprema' : /great/i.test(s) ? ' grande' : /strong/i.test(s) ? ' forte' : '');
    }
    /* cura, mana, suporte e munição que o Inteligente põe (planoExtras) */
    function extrasTxt(x) { return escHtml(extrasTxtCru(x)); }
    function extrasTxtCru(x) {
        const partes = x.heals.filter(Boolean).map(c => (/potion/i.test(c.name) ? nomePocao(c.name) : c.name) + ' ≤' + c.percent + '%');
        partes.push(x.manaPotion && x.manaPotion.name && x.manaPotion.percent ? nomePocao(x.manaPotion.name) + ' ≤' + x.manaPotion.percent + '%' : 'sem poção de mana');
        const sup = x.supports.filter(Boolean);
        partes.push(sup.length ? sup.join(' + ') : 'sem suporte');
        if (x.ammo) partes.push('munição: ' + x.ammo);
        return partes.join(' · ');
    }
    function telaMagia() {
        garantirCssTelas();
        const det = detectarHunt(), manual = ler('hunt_id', null), modelo = ler('modelo', 'equilibrado'), nv = nivelAtual();
        let h = huntAtual();
        let corpo = `<div class="tb-seg" role="group" aria-label="modelo de magia">` + Object.keys(MODELOS).map(k =>
            `<button type="button" data-modelo="${k}" aria-pressed="${k === modelo}" aria-label="${escHtml(MODELOS[k].nome)}" title="${escHtml(MODELOS[k].nome + ' — ' + maisAlvos(MODELOS[k].dica))}">${escHtml(MODELO_CURTO[k] || MODELOS[k].nome)}</button>`).join('') + `</div>`;
        const ordenadas = (CAT.hunts || []).slice().sort((a, b) => (a.levelMin || 0) - (b.levelMin || 0) || String(a.title).localeCompare(String(b.title)));
        corpo += `<select id="tb-hunt" aria-label="caçada"><option value="">— escolha a caçada —</option>` +
            ordenadas.map(c => `<option value="${escHtml(c.id)}"${c.id === manual ? ' selected' : ''}>[${escHtml(c.levelMin || 1)}] ${escHtml(c.title)}${(c.levelMin || 0) > nv ? ' ⚠' : ''}</option>`).join('') + `</select>` +
            (det && det.hunt && det.hunt.id !== manual ? `<div class="tb-linha tb-palpite"><span class="tb-mut">palpite: <b>${escHtml(det.hunt.title)}</b></span><button type="button" class="tb-bt mini" data-usar-palpite="${escHtml(det.hunt.id)}" aria-label="usar o palpite ${escHtml(det.hunt.title)}">usar</button></div>` : '');
        let alvo = h;
        if (ESTADO_WS.boss && ESTADO_WS.boss !== '?') corpo += `<div class="tb-mut">boss em andamento: <b>${escHtml(ESTADO_WS.boss)}</b></div>`;
        if (modelo === 'boss') {
            const bn = (ESTADO_WS.boss && ESTADO_WS.boss !== '?') ? ESTADO_WS.boss : ler('boss_nome', null);
            const bosses = (CAT.bosses || []).slice().sort((a, b) => (a.health || 0) - (b.health || 0) || String(a.name).localeCompare(String(b.name)));
            corpo += `<select id="tb-boss" aria-label="boss" style="margin-top:4px"><option value="">— escolha o boss —</option>` + bosses.map(b => `<option value="${escHtml(b.name)}"${b.name === bn ? ' selected' : ''}>${escHtml(b.name)} · ${numBR(b.health)} HP</option>`).join('') + `</select>`;
            alvo = huntDeBoss(bn);
            if (alvo) corpo += `<div class="tb-mut tb-resist">${escHtml((alvo.monsters[0].elements || []).map(e => rotuloElem(e.type) + ' ' + (e.percent > 0 ? '−' : '+') + Math.abs(e.percent) + '%').join(' · ') || 'sem resistências')}</div>`;
        }
        if (!alvo) return corpo + `<div class="tb-mut" style="margin-top:6px">escolha a caçada para ver o plano</div>`;
        h = alvo;
        const r = montarPlano(modelo, h);
        if (r.erro) return corpo + `<div class="tb-cx tb-ruim">${escHtml(r.erro)}</div>`;
        const ocupado = _aplicando || _aprendendo;
        /* v2.12.0 — o Inteligente NÃO calcula no desenho: só no clique */
        const modoXp = ler('int_modo', 'lucro') === 'xp', intEnx = !!ler('int_enxuto', false);
        const intCtl = `<div class="tb-linha" style="margin-top:4px"><button type="button" class="tb-bt" id="tb-int-calc" ${ocupado ? 'disabled' : ''}>${r.pendente ? 'CALCULAR O KIT' : 'recalcular'}</button>` +
            `<button type="button" class="tb-bt mini" id="tb-int-zerar" ${ocupado ? 'disabled' : ''} title="esquece o kit aplicado neste mapa e a trava de 10 min: a próxima conta parte do zero">replanejar do zero</button>` +
            `<label class="tb-l" style="margin-left:auto" title="ε = 0,5 %: fica com o de mais XP mesmo que custe bem mais ouro (o padrão, 3 %, prefere o mais barato entre os quase iguais)"><input type="checkbox" id="tb-int-xp" ${modoXp ? 'checked' : ''}> XP absoluto</label>` +
            `<label class="tb-l" title="kit enxuto (2.14): sem os seus suportes e curas por magia, toda a mana no ataque e Mana Potion como a conta mandar — como os setups do Discord. A cura volta pela escada (0 só poções · 1 + Heal Friend no Druida · 2 + cura do Knight e do Paladino · 3 o seu kit completo), medida no mapa. Desligado, o Inteligente não mexe nos seus suportes e curas."><input type="checkbox" id="tb-int-enx" ${intEnx ? 'checked' : ''}> kit enxuto</label></div>`;
        if (modelo === 'inteligente' && r.pendente) {
            return corpo + calibracaoHtmlInt(h) + intCtl + `<div class="tb-mut">o Inteligente simula a party inteira (≈ 0,1–0,3 s) — só quando você clica. Nada é aplicado sozinho.</div>`;
        }
        const vp = r.viab ? viabilidadeParty(modelo, h) : null;
        corpo += `<button type="button" class="tb-bt pri tb-larga tb-grande" id="tb-aplicar-todos" ${ocupado ? 'disabled' : ''} style="margin-top:6px">${_aplicando ? 'APLICANDO…' : _aprendendo ? 'MEDINDO O DANO…' : 'APLICAR NOS 4'}</button>`;
        if (modelo === 'inteligente' && r.int) {
            const it = r.int, m = it.met, dec = { NOVO: 'kit novo', IGUAL: 'o kit aplicado já é o melhor', MANTER: 'mantém o kit aplicado', MOSTRADO: 'mantém o kit calculado antes (o novo quase não ganha)', TROCAR: 'TROCAR: o novo é melhor', ESPERAR: 'mantém (menos de 10 min desde o APLICAR)' }[it.decisao] || it.decisao;
            const ganho = it.ganho != null && it.decisao !== 'IGUAL' && it.decisao !== 'NOVO' ? ` (novo ${it.ganho >= 0 ? '+' : ''}${Math.round(it.ganho * 1000) / 10} %)` : '';
            corpo += calibracaoHtmlInt(h) + intCtl + `<div class="tb-ver ${it.aviso ? 'ruim' : 'ok'}"><b>${escHtml(dec)}</b>${escHtml(ganho)}${it.desatualizado ? ' <span class="tb-av">(as medidas mudaram — recalcule)</span>' : ''}` +
                `<div class="tb-mut">previsto: ${milBR(m.xpH)} xp/h · ${numBR(Math.round(m.abH))} abates/h${m.T != null ? ` · onda limpa em ${numBR(Math.round(m.T * 10) / 10, 1)} s (${tpCombos(m.T) === 1 ? '⚡ 1 combo' : tpCombos(m.T) + ' combos'})` : ''} · lucro ${m.lucroH >= 0 ? '+' : ''}${milBR(m.lucroH)}/h (garantido ${milBR(m.LCB)}) · gasto em poção/runa ${milBR(m.ouroH)}/h${m.curaH > 0 ? ` (cura ${milBR(m.curaH)}/h pelo tempo que os bichos ficam vivos)` : ''}</div>` +
                `<div class="tb-mut">${regenTexto()}</div>` +
                (m.medido ? `<div class="tb-av">${m.medido.banda ? 'a simulação já se mostrou otimista neste mapa: kit não medido vale o que o kit medido logo acima dele rendeu' : 'este kit foi MEDIDO aqui'}: ${milBR(m.medido.xpRawH)} xp/h (previsto ${milBR(m.medido.previsto)}) — a medida vale mais que a simulação</div>` : '') +
                (it.medidoVig && !m.medido ? `<div class="tb-av">o kit aplicado foi medido aqui a ${milBR(it.medidoVig.xpRawH)} xp/h (previsto ${milBR(it.medidoVig.previsto)}): por isso a troca</div>` : '') +
                (it.escEnx ? `<div class="${it.escEnx.alerta ? 'tb-ruim' : 'tb-mut'}">kit enxuto: degrau <b>${it.escEnx.degrau}</b> — ${escHtml(['só poções', '+ Heal Friend no Druida', '+ cura do Knight e do Paladino', 'o seu kit completo (suportes e curas)'][it.escEnx.degrau])} (${escHtml(it.escEnx.motivo)})${it.escEnx.alerta ? ' ⚠ arriscado: CALCULAR de novo e APLICAR sobe a cura' : ''}</div>` : '') +
                `<div class="tb-mut">defesa: degrau ${it.escada.degrau} (${escHtml(it.escada.motivo)})${it.escada.degrau >= 4 ? ' <span class="tb-ruim">⚠ mapa acima da party</span>' : ''} · ${numBR(it.cont.sim)} triagens + ${numBR(it.cont.party)} parties em ${numBR(it.ms)} ms</div>` +
                (it.aviso ? `<div class="tb-ruim">${escHtml(it.aviso)}</div>` : '') + `</div>`;
        }
        /* v2.14.0 — aviso AO VIVO do kit enxuto (só lê o livro-razão; nada muda sozinho) */
        if (modelo === 'inteligente' && ler('int_enxuto', false) && !(r.int && r.int.escEnx && r.int.escEnx.alerta)) {
            const ee = escadaEnxuta(h);
            if (ee.alerta) corpo += `<div class="tb-cx tb-ruim" role="status">⚠ kit enxuto: ${escHtml(ee.motivo)} — CALCULAR e APLICAR sobem a cura (nada muda sozinho)</div>`;
        }
        /* v2.10 — o veredito é do kit inteiro pela fila simulada (runa incluída,
         * mana só de quem bebe), com a poção que o PLANO usa. v2.11 (D2): selo
         * "✓ se paga"/"✗ não se paga" + custo por abate contra o teto (80 % do
         * loot) + ouro/h do grupo e quem bebe mana. */
        /* v2.11.2 — O MEDIDO MANDA NO SELO. Banshee Quest, 29/09: a estimativa
         * dizia "✗ não se paga, 143 o/abate" com a party lucrando +16k/h — o
         * analisador do jogo mediu 28,6 o/abate de gasto e 45,5 de loot (o
         * catálogo diz 62,8). A curva de desperdício da poção (30/08, os 4
         * bebendo) multiplica ×4,9 com 1.200 de HP; com só o Druida bebendo ela
         * não vale. Com ≥ 10 min no mapa mostrado, o selo é o do jogo; a
         * estimativa fica embaixo, para comparar kits. */
        const med = vereditoMedido(h);
        if (med) { corpo += `<div class="tb-ver ${med.cabe ? 'ok' : 'ruim'}"><span class="tb-vsel ${med.cabe ? 'ok' : 'ruim'}">${med.cabe ? '✓ se paga' : '✗ não se paga'}</span>medido no jogo (${numBR(med.min)} min, kit atual): gasto <b>${numBR(med.custo, 1)} o</b>/abate · teto ${numBR(med.loot * MARGEM_LUCRO, 1)} o <span class="tb-mut">(${Math.round(MARGEM_LUCRO * 100)} % do loot medido de ${numBR(med.loot, 1)} o)</span>` +
            `<div class="tb-mut">${med.lucroH >= 0 ? '+' : ''}${milBR(med.lucroH)} de ouro/h · ${numBR(med.abatesH)} abates/h</div></div>`; }
        if (vp) {
            const bebem = VOCS.filter(v => vp.pocoes && vp.pocoes[v]);
            const gasto = vp.ouroH > 0 ? `~${milBR(vp.ouroH)} de ouro/h (${vp.regen ? 'runa' : 'poção e runa'})` : 'sem gasto de ouro';
            const selo = med ? `<span class="tb-mut">estimativa deste kit: </span>` : `<span class="tb-vsel ${vp.cabe ? 'ok' : 'ruim'}">${vp.cabe ? '✓ se paga' : '✗ não se paga'}</span>`;
            corpo += `<div class="tb-ver ${med ? '' : vp.cabe ? 'ok' : 'ruim'}">${selo}custo <b>${numBR(vp.custoPorAbate)} o</b>/abate · teto ${numBR(vp.orcamento, 1)} o <span class="tb-mut">(${Math.round(MARGEM_LUCRO * 100)} % do loot de ${numBR(vp.loot, 1)} o do catálogo${med ? ' — estimativa, o medido acima vale mais' : ''})</span>` +
                `<div class="tb-mut">${gasto} · poção de mana: ${bebem.length ? bebem.map(v => VOC_ROTULO[v]).join(', ') : 'ninguém (regeneração)'}</div></div>`;
        } else if (h.boss) corpo += `<div class="tb-mx">boss: sem veredito de ouro — o kit é o de mais dano por segundo com a mana de cada um</div>`;
        else if (LOOT_CACHE[h.id] == null) corpo += `<div class="tb-mx">veredito: ${_semLoot[h.id] ? 'a tabela de loot desta hunt não veio (rede?) — tento de novo em 1 min' : 'lendo a tabela de loot…'}</div>`;
        const ficha = p => {
            const med = p.av.medidoNoMapa ? ' · ' + numBR(p.av.porLancamento) : '';
            const dica = `${p.av.m.name} · dispara com ${alvosTxt(p.minimo)} vivos${p.av.medidoNoMapa ? ' · ' + numBR(p.av.porLancamento) + ' de dano medido por lançamento neste mapa' : ''}`;
            return `<span class="tb-ficha${p.av.m.isRune ? ' r' : ''}" title="${escHtml(dica)}">${escHtml(p.av.m.name)} <small>${alvosTxt(p.minimo)}${med}</small></span>`;
        };
        corpo += `<div class="tb-cx">` + VOCS.map(v => {
            const rv = montarPlano(modelo, h, v);
            const cab = `<b title="${VOC_ROTULO[v]}">${VOC_CURTO[v]}</b>`;
            if (rv.erro) return `<div class="tb-mv">${cab}<div class="tb-ruim">${escHtml(rv.erro)}</div></div>`;
            const x = rv.extras, pv = vp && vp.porVoc ? vp.porVoc[v] : null;
            const gasto = pv ? (pv.ouroH > 0 ? `gasta ~${milBR(pv.ouroH)}/h` : 'sem gasto de ouro') + (pv.runasH ? ` · ${numBR(pv.runasH)} runas/h` : '') + (x ? '' : ` · poção de mana ${pv.pocao ? 'ligada' : 'desligada'}`) : '';
            const mortos = (rv.mortos || []).map(m => `${m.nome} ${alvosTxt(m.minimo)}: ${maisAlvos(m.motivo)}`);
            return `<div class="tb-mv">${cab}<div>${rv.plano.map(ficha).join('') || '<span class="tb-ruim">sem magia com dano conhecido</span>'}` +
                (x ? `<div class="tb-mx">${extrasTxt(x)}</div>` : '') +
                (gasto ? `<div class="tb-mx">${gasto}</div>` : '') +
                (mortos.length ? `<div class="tb-mx tb-morto" title="slot que nunca dispararia: fica vazio (não gasta mana)">cortado: ${escHtml(mortos.join(' · '))}</div>` : '') + `</div></div>`;
        }).join('') + `</div>`;
        const linhas = [];
        if (emHunt() && RAZAO.kills) { const rz = razaoResumo(RAZAO); if (rz.danoTotal) linhas.push(`<div><b>grupo ao vivo</b> — ${numBR(Math.round(rz.seg / 60))} min · ${numBR(rz.kills)} abates · tomou ${milBR(rz.tomadoH)}/h</div>${razaoHtml(rz, false)}`); }
        if (h.bestiary && h.bestiary.stages && h.bestiary.stages.length) linhas.push(`<div><b>bestiário</b>: ${escHtml(h.bestiary.bonus)} <span class="tb-tag">${h.bestiary.stages.map(e => `${numBR(e.kills / 1000, 1)}k → +${escHtml(e.value)}`).join(' · ')}</span></div>`);
        linhas.push(`<div>${MODELOS[modelo] ? escHtml(maisAlvos(MODELOS[modelo].dica)) : ''} Nada é aplicado sozinho. ${socketAberto() && ESTADO_WS.perfisDoServidor ? 'Aplica pelo socket, sem abrir janela.' : 'Aplica pelos diálogos do jogo (só os 4 ataques).'}</div>`);
        corpo += aj('magia-mais', linhas.join(''), 'detalhes');
        return corpo;
    }
    /* v2.11.2 — gasto e loot por abate do analisador do jogo, se a party está
     * NO mapa mostrado há ≥ 10 min (a sessão do jogo zera ao trocar de mapa). */
    let _medidoK = null;
    function vereditoMedido(h) {
        const an = anDoFrame();
        if (!h || h.boss || !an || String(ESTADO_WS.huntId) !== String(h.id)) return null;
        if (!(an.elapsedMs >= 10 * 60000) || !(an.kills > 0)) return null;
        const loot = an.lootGold / an.kills, custo = an.suppliesGold / an.kills;
        return { min: Math.round(an.elapsedMs / 60000), abatesH: Math.round(an.kills / an.elapsedMs * 3600000),
                 loot, custo, lucroH: Math.round((an.lootGold - an.suppliesGold) / an.elapsedMs * 3600000), cabe: custo <= loot * MARGEM_LUCRO };
    }
    /* handlers da Magia (antes dentro de _renderizar) + os dados que o plano
     * ainda espera (loot, armadura do bestiário). v2.11 (D2): a busca saiu do
     * DESENHO — telaMagia disparava fetch a cada repinte enquanto o anterior
     * não voltava; agora uma por hunt de cada vez, e o repinte vem quando chega. */
    const _buscandoMagia = new Set(), _semLoot = {}; // _semLoot[huntId] = hora da falha (tenta de novo depois de 1 min)
    function buscarUmaVez(chave, fazer) {
        if (_buscandoMagia.has(chave)) return;
        _buscandoMagia.add(chave);
        Promise.resolve().then(fazer).catch(() => { }).finally(() => _buscandoMagia.delete(chave));
    }
    function ligarMagia() {
        const corpo = $('#tb-corpo');
        $$('[data-modelo]', corpo).forEach(b => { b.onclick = () => { if (ler('modelo', 'equilibrado') === b.dataset.modelo) return; guardar('modelo', b.dataset.modelo); renderizar(); }; });
        const selHunt = $('#tb-hunt');
        if (selHunt) selHunt.onchange = () => { const v = selHunt.value; guardar('hunt_id', v === '' ? null : parseInt(v)); renderizar(); };
        $$('[data-usar-palpite]', corpo).forEach(b => { b.onclick = () => { guardar('hunt_id', parseInt(b.dataset.usarPalpite)); renderizar(); }; });
        const selBoss = $('#tb-boss');
        if (selBoss) selBoss.onchange = () => { guardar('boss_nome', selBoss.value || null); renderizar(); };
        /* v2.12.0 — Inteligente: a busca roda aqui, no clique (síncrona, ~0,1–0,3 s) */
        const calc = $('#tb-int-calc');
        if (calc) {
            calc.onclick = () => {
                const h = alvoDoModelo(); if (!h) return;
                try { const r = partyInt(h, true); if (r) log(`Inteligente: ${h.title} — ${r.cont.sim} triagens + ${r.cont.party} parties em ${r.ms} ms (${r.decisao.acao})`, 'info'); } catch (e) { falhou('Inteligente (calcular)', e); }
                renderizar();
            };
        }
        const zer = $('#tb-int-zerar');
        if (zer) zer.onclick = () => { const h = alvoDoModelo(); if (!h) return; zerarInt(h); try { partyInt(h, true); } catch (e) { falhou('Inteligente (do zero)', e); } renderizar(); };
        const ixp = $('#tb-int-xp');
        if (ixp) ixp.onchange = () => { guardar('int_modo', ixp.checked ? 'xp' : 'lucro'); invalidarPlanos(); renderizar(); };
        const ienx = $('#tb-int-enx');
        if (ienx) ienx.onchange = () => { guardar('int_enxuto', ienx.checked); invalidarPlanos(); renderizar(); };
        const ap4 = $('#tb-aplicar-todos');
        if (ap4) { ap4.onclick = () => {
            if (_aplicando || _aprendendo) return;
            const m = ler('modelo', 'equilibrado'), h = alvoDoModelo();
            if (!h) { avisar('magia', m === 'boss' ? 'escolha o boss primeiro' : 'escolha a caçada primeiro', 'erro'); return; }
            aplicarEmTodos(m, h); // marca _aplicando antes do 1º await
            renderizar();
        }; }
        buscarDadosDaMagia();
    }
    /* loot (veredito) e armadura (bestiário) da hunt que a Magia mostra; é
     * LEITURA de catálogo público. Loot que não veio: diz na tela e tenta de
     * novo 1 min depois (só com a Magia aberta). */
    function buscarDadosDaMagia() {
        const h = alvoDoModelo();
        if (!h || h.boss) return;
        if (LOOT_CACHE[h.id] == null && !(Date.now() - (_semLoot[h.id] || 0) < 60000)) {
            buscarUmaVez('loot:' + h.id, () => ouroPorAbate(h.id).then(v => {
                if (v == null) { _semLoot[h.id] = Date.now(); setTimeout(() => { if (ABA === 'magia') buscarDadosDaMagia(); }, 60500); } else delete _semLoot[h.id];
                renderizar();
            }));
        }
        if (h.monsters && h.monsters.some(m => !BESTIARIO[m.name])) buscarUmaVez('best:' + h.id, () => bestiarioHunt(h).then(() => renderizar()));
    }
    /* v2.11 (D2) — ANALISADOR: nomes de hunt inteiros (a coluna tinha 1/5 da
     * tabela e "Barbarian Camp" virava "Barbari an Camp"); agora a hunt leva o
     * que sobra das colunas numéricas (largura em em, vale no celular) e só
     * quebra palavra que sozinha não cabe. Título de sessão, hunt e tipo de
     * frame do socket escapados. A caixa do "copiar JSON" é estado
     * (_exportacao): com a área de transferência bloqueada ela era o único
     * lugar dos dados e sumia no repinte seguinte (4 s). */
    let _exportacao = null; // { texto, copiado: null|true|false, selecionar }
    function telaAnalise() {
        garantirCssTelas();
        const lin = (a, b) => `<div class="tb-lin"><span class="tb-mut">${a}</span><span>${b}</span></div>`;
        const sinal = n => (n >= 0 ? '+' : '') + milBR(n);
        let corpo = '';
        if (SESSAO && SESSAO.amostras.length >= 2) {
            const a0 = SESSAO.amostras[0], aN = SESSAO.amostras[SESSAO.amostras.length - 1];
            const dur = Math.max(1, (aN.t - a0.t) / 1000);
            const ouroH = Math.round((aN.ouro - a0.ouro) / dur * 3600);
            const expH = (aN.exp != null && a0.exp != null) ? Math.round((aN.exp - a0.exp) / dur * 3600) : null;
            const ab = (aN.abates != null && a0.abates != null) ? aN.abates - a0.abates : null;
            const pct = Math.round((aN.mochilaPct || 0) * 100);
            corpo += `<div class="tb-cx" style="border-color:#2c5c3a"><div class="tb-mut">medindo — ${escHtml(SESSAO.huntTitle)} · ${Math.floor(dur / 60)}m${String(Math.round(dur % 60)).padStart(2, '0')}</div>
                ${lin('ouro/h', isFinite(ouroH) ? `<b class="${ouroH >= 0 ? 'tb-ok' : 'tb-ruim'}">${ouroH >= 0 ? '+' : ''}${numBR(ouroH)}</b>` : '—')}
                ${lin('exp/h', numBR(expH))}
                ${lin('abates', ab != null ? `${numBR(ab)} (${numBR(Math.round(ab / dur * 3600))}/h)` : '—')}
                ${lin('mochila', `<span class="${pct > 85 ? 'tb-ruim' : pct > 60 ? 'tb-av' : ''}">${pct}%</span>`)}
                ${pct > 85 ? '<div class="tb-ruim tb-nota">mochila acima de 85%: o loot se perde e a medição sai suja</div>' : ''}</div>`;
        } else corpo += `<div class="tb-mut">sem medição: liga sozinho ao entrar numa caçada</div>`;
        const res = resumoPorHunt();
        if (res.length) {
            corpo += `<table class="tb-an"><colgroup><col><col class="c5"><col class="c5"><col class="c4"><col class="c3"></colgroup>` +
              `<thead><tr><th>hunt</th><th>ouro/h</th><th>exp/h</th><th>tempo</th><th>fator</th></tr></thead><tbody>` +
              res.map(p => `<tr><td>${escHtml(p.hunt)}${p.sujas ? ` <span class="tb-tag tb-ruim">${numBR(p.sujas)} suja${p.sujas > 1 ? 's' : ''}</span>` : ''}${p.regen ? ` <span class="tb-tag">regen</span>` : ''}</td>` +
                `<td class="${p.ouroH >= 0 ? 'tb-ok' : 'tb-ruim'}">${sinal(p.ouroH)}</td><td>${milBR(p.expH)}</td><td class="tb-mut">${fmtHoras(p.dur / 3600)}</td><td class="tb-av">${numBR(p.fatorMedio, 2)}</td></tr>`).join('') + `</tbody></table>`;
            const comFator = res.filter(p => p.fatorMedio != null && p.hp);
            if (comFator.length) corpo += aj('an-curva', `<table class="tb-an"><colgroup><col><col class="c4"><col class="c4"><col class="c4"><col class="c4"></colgroup><thead><tr><th>hunt</th><th>HP</th><th>curva</th><th>medido</th><th>erro</th></tr></thead><tbody>` + comFator.map(p => { const prev = Math.round(fatorDesperdicio(p.hp) * 100) / 100; const erro = Math.round((p.fatorMedio / prev - 1) * 100); return `<tr><td>${escHtml(p.hunt)}</td><td>${numBR(p.hp)}</td><td>${numBR(prev, 2)}</td><td class="tb-av">${numBR(p.fatorMedio, 2)}</td><td class="${Math.abs(erro) < 25 ? 'tb-ok' : 'tb-ruim'}">${erro > 0 ? '+' : ''}${numBR(erro)}%</td></tr>`; }).join('') + `</tbody></table><div class="tb-nota">fator = desperdício real por abate contra a curva 0,47 × HP^0,332 (2 pontos).</div>`, 'calibração');
        }
        const tipos = Object.keys(WS.tipos).sort((a, b) => WS.tipos[b] - WS.tipos[a]);
        const envs = Object.keys(WS.enviados).sort((a, b) => WS.enviados[b].n - WS.enviados[a].n);
        corpo += aj('an-ws', `socket ${WS.socket ? '<span class="tb-ok">capturado</span>' : '<span class="tb-av">ainda não</span>'} · ${numBR(WS.frames)} frames em ~${Math.max(1, Math.round((Date.now() - WS.desde) / 60000))} min<br>` +
            (tipos.length ? 'recebidos: ' + tipos.slice(0, 10).map(t => `<span class="tb-tag">${escHtml(t)} ×${numBR(WS.tipos[t])}</span>`).join('') + '<br>' : '') +
            (envs.length ? 'enviados: ' + envs.map(t => `<span class="tb-tag tb-ok">${escHtml(t)} ×${numBR(WS.enviados[t].n)}</span>`).join('') : 'nenhum frame enviado ainda'), 'websocket');
        corpo += `<div class="tb-linha" style="margin-top:4px"><button type="button" class="tb-bt mini" id="tb-exportar">copiar JSON</button><button type="button" class="tb-bt mini" id="tb-limpar-sessoes" title="apaga as sessões medidas (pede confirmação)">limpar histórico</button></div>`;
        if (_exportacao) { corpo += `<div class="tb-an-exp"><div class="tb-linha"><span class="${_exportacao.copiado === false ? 'tb-av' : 'tb-mut'}">${_exportacao.copiado === true ? 'copiado — e também aqui:' : _exportacao.copiado === false ? 'área de transferência bloqueada: selecione e copie daqui' : 'copiando…'}</span>` +
            `<button type="button" class="tb-bt mini" id="tb-exportar-fechar" style="margin-left:auto" aria-label="fechar a caixa do JSON">fechar</button></div>` +
            `<textarea id="tb-exportar-caixa" readonly spellcheck="false" aria-label="dados do Analisador em JSON"></textarea></div>`; }
        return corpo;
    }
    /* handlers do Analisador (antes dentro de _renderizar). O texto do JSON
     * vai para a caixa por .value (não entra no HTML: não pesa na comparação
     * do repinte nem precisa de escape). */
    function ligarAnalise() {
        const exp = $('#tb-exportar');
        if (exp) { exp.onclick = () => {
            const dados = JSON.stringify({
                sessoes: sessoes(), resumo: resumoPorHunt(),
                ws: { frames: WS.frames, tipos: WS.tipos, binarios: WS.bin,
                      amostrasRecebidas: WS.amostras, ENVIADOS: WS.enviados }
            }, null, 2);
            const x = _exportacao = { texto: dados, copiado: null, selecionar: true };
            renderizar();
            /* writeText ainda dentro do clique (o navegador exige o gesto) */
            let p;
            try { p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(dados) : Promise.reject(new Error('sem clipboard')); } catch (e) { p = Promise.reject(e); }
            p.then(() => { x.copiado = true; avisar('analise', 'JSON copiado para a área de transferência (e na caixa abaixo)', 'ok'); })
             .catch(() => { x.copiado = false; x.selecionar = true; avisar('analise', 'área de transferência bloqueada — o JSON está na caixa abaixo do botão', 'erro'); })
             .finally(renderizar);
        }; }
        const caixa = $('#tb-exportar-caixa');
        if (caixa && _exportacao) {
            caixa.value = _exportacao.texto;
            if (_exportacao.selecionar) { _exportacao.selecionar = false; try { caixa.focus({ preventScroll: true }); caixa.select(); } catch { /* caixa fora da página */ } }
        }
        const fx = $('#tb-exportar-fechar'); if (fx) fx.onclick = () => { _exportacao = null; renderizar(); };
        const lim = $('#tb-limpar-sessoes');
        if (lim) ligarDoisToques(lim, 'limpar-sessoes', 'apagar o histórico?', () => { guardar('sessoes', []); avisar('analise', 'histórico de sessões apagado', 'ok'); renderizar(); });
    }
    /* v2.4.0 — EQUIP. 4 sub-abas; por slot: atual → melhor (+ganho) e 2
     * motivos; clique expande os atributos (mortos riscados). Seções
     * Dispensáveis e Reservas. NADA equipa nem descarta. */
    const RAR_NOME = ['comum', 'incomum', 'raro', 'épico', 'lendário', 'mítico'];
    /* v2.11 (D2) — vocações e slots em português em todas as telas (o Equip
     * dizia "Knight" num botão, "Cav" na aba ao lado e WEAPON/LEGS nas linhas) */
    const VOC_ROTULO = { KNIGHT: 'Cavaleiro', PALADIN: 'Paladino', SORCERER: 'Feiticeiro', DRUID: 'Druida' };
    const SLOT_PT = { weapon: 'arma', hand: 'arma', shield: 'escudo', head: 'elmo', helmet: 'elmo', armor: 'armadura', legs: 'calça', boots: 'bota', feet: 'bota', necklace: 'colar', ring: 'anel', ammo: 'munição' };
    const slotPt = (s) => SLOT_PT[s] || s;
    /* 28/09: com 0,5 ele sugeria trocar um bonelord shield por outro quase igual (+0,55). */
    const GANHO_MIN = 1; // abaixo disso é empate técnico: não vale a troca
    /* v2.14.14 — o contador da aba, o Log e as linhas usam a MESMA regra: troca com ganho real, escudo que sai por arma de
     * 2 mãos, ou peça que vale menos que nada no mapa (ao vivo, 06/10: a snakebite rod do Druida em Petrified Hollow, terra
     * imune, só gasta mana — a aba dizia "Dru 1" e não mostrava linha nenhuma). */
    const eqTroca = (x) => !!(x && x.ganho >= GANHO_MIN && x.melhor && (!x.atual || x.melhor.iid !== x.atual.iid));
    const eqTirar = (x) => !!(x && !x.melhor && x.atual && x.ganho < 0); // arma de 2 mãos venceu: o escudo sai
    const eqSoGasta = (x) => !!(x && !x.melhor && x.atual && x.ganho >= GANHO_MIN); // a peça vale menos que o espaço vazio aqui
    const eqMexer = (x) => eqTroca(x) || eqTirar(x) || eqSoGasta(x);
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
        /* v2.11.6 — o grupo MEDIDO (livro-razão desta caçada com ≥ 2 min; senão
         * o Scan mais recente): fatia de dano de cada um, dano por mana, mana
         * média, quem bebe poção, dano que o Knight toma. Sem medida, PARTY_REF. */
        let party = null;
        try { party = partyMedida(); } catch (e) { falhou('equip (party medida)', e); }
        /* o que cada um veste agora, por espaço (pares de crítico e roubo de vida) */
        const usando = {};
        for (const r of (roster || [])) {
            if (!r || !r.vocation) continue;
            usando[r.vocation] = {};
            for (const [sl, it] of Object.entries(r.equipment || {})) {
                if (!it || !it.forja) continue;
                usando[r.vocation][normalizarSlot(sl)] = Object.fromEntries((it.forja.atributos || []).map(a => [a.id, Number(a.valor) || 0]));
            }
        }
        return { nivel: nivelAtual(), sk, party, usando };
    }
    function partyMedida() {
        let rz = null, fonte = null;
        const vivo = razaoResumo(RAZAO);
        if (vivo && vivo.seg >= 120 && vivo.danoTotal > 0) { rz = vivo; fonte = emHunt() ? 'caçada atual' : 'última caçada'; }
        else {
            const sc = Object.values(scanResultados()).filter(r => r && r.razao && r.razao.danoTotal > 0).sort((a, b) => (b.t || 0) - (a.t || 0))[0];
            if (sc) { rz = sc.razao; fonte = 'Scan ' + sc.title; }
        }
        if (!rz) return null;
        const P = { fonte, share: {}, dpm: {}, mana: {}, bebe: {}, fracMagica: {}, fracMagia: {}, tiroS: {} };
        P.dps = rz.danoTotal / Math.max(1, rz.seg);
        const cat = {}; for (const m of (CAT.magias || [])) cat[m.name] = m;
        for (const v of VOCS) {
            const pv = rz.porVoc[v]; if (!pv || !pv.dano) continue;
            P.share[v] = pv.dano / rz.danoTotal;
            if (pv.manaMedia != null) P.mana[v] = pv.manaMedia;
            const ms = (rz.magias || []).filter(m => m.voc === v && m.dano > 0);
            const spells = ms.filter(m => !m.runa), manaG = spells.reduce((s, m) => s + (m.mana || 0), 0), danoS = spells.reduce((s, m) => s + m.dano, 0);
            if (manaG > 0 && danoS > 0) P.dpm[v] = danoS / manaG;
            P.fracMagia[v] = danoS / pv.dano;
            P.fracMagica[v] = v === 'SORCERER' || v === 'DRUID' ? 1 : ms.reduce((s, m) => s + m.dano, 0) / pv.dano;
            if (v === 'PALADIN') P.fracSagrado = spells.filter(m => cat[m.nome] && cat[m.nome].combatType === 'COMBAT_HOLYDAMAGE').reduce((s, m) => s + m.dano, 0) / pv.dano;
            if (rz.tirosH && rz.tirosH[v] != null) P.tiroS[v] = rz.tirosH[v] / 3600;
            try { const c = configAtiva(v); if (c) P.bebe[v] = !!(c.manaPotion && c.manaPotion.name && c.manaPotion.percent > 0); } catch (e) { }
        }
        if (rz.tomadoH > 0) {
            P.tomadoS = rz.tomadoH / 3600;
            if (rz.tomadoCorpoH != null && rz.golpesCorpoH != null && rz.golpesCorpoH > 0) { P.fisico = rz.tomadoCorpoH / rz.tomadoH; P.golpesS = rz.golpesCorpoH / 3600; }
        }
        return P;
    }
    /* v2.14.9 — DESMANCHE pelo socket: forge_salvage_batch {requestId, alvos:[{iid, origem:'bag'|'depot'}]} →
     * forge_salvage_batch_result {requestId, iids, …} (o cliente do jogo manda em lotes; aqui 10 por pedido, pelo
     * mkPedir, que já casa a resposta pelo requestId e respeita o ritmo). Erro em um lote para tudo. */
    const DESM_LOTE = 10;
    async function desmancharSobras() {
        const temNegocio = (nome) => { const c = MK.catalogo && MK.catalogo[mkMin(nome)]; return !!(c && Number(c.trades30d) > 0); };
        const alvos = pecasDesmanche(EQUIP.res, temNegocio, !!ler('desm_incluir_mercado', false));
        if (!alvos.length || EQUIP.equipando || EQUIP.lendo) return;
        if (emHunt()) { EQUIP.aviso = 'desmanche só na cidade'; renderizar(); return; }
        EQUIP.equipando = true; EQUIP.desm = true; EQUIP.erro = null; EQUIP.aviso = null; renderizar();
        let feitas = 0, parou = null;
        try {
            for (let i = 0; i < alvos.length && !parou; i += DESM_LOTE) {
                const lote = alvos.slice(i, i + DESM_LOTE);
                const r = await mkPedir('forge_salvage_batch', { requestId: mkRid(), alvos: lote.map(a => ({ iid: a.iid, origem: a.origem })) });
                if (r.erro) { parou = r.erro; break; }
                feitas += Array.isArray(r.data && r.data.iids) ? r.data.iids.length : lote.length;
            }
            const MOTIVO = { too_far: 'o personagem precisa estar ao lado da Forja: abra NAVEGAÇÃO › Forja no jogo (ele anda até lá) e toque de novo',
                             not_in_city: 'só na cidade', insufficient_item: 'a peça já não estava mais lá (relido)', invalid_forge: 'o jogo recusou o lote (invalid_forge)' };
            if (parou) EQUIP.aviso = 'desmanche parou: ' + (MOTIVO[parou] || parou);
            log(`desmanche: ${feitas} de ${alvos.length} peça(s) viraram fragmento${parou ? ' — parou: ' + (MOTIVO[parou] || parou) : ''}`, parou ? 'erro' : 'ok');
        } catch (e) { falhou('desmanche', e); }
        EQUIP.equipando = false; EQUIP.desm = false; EQUIP.desmConf = null;
        const aviso = EQUIP.aviso;
        try { await equipAtualizar(); } catch (e) { renderizar(); }
        if (aviso) { EQUIP.aviso = aviso; renderizar(); }
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
            const trocas = Object.values(EQUIP.res.porVoc).reduce((n, v) => n + Object.values(v).filter(eqMexer).length, 0);
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
        if (!tipo || !MUNICAO[tipo]) return;
        /* v2.11 — mesmo cuidado de aplicarPlanoSocket: profiles_set só em cima
         * do perfil REAL e da config atual (senão apaga presets e cura) */
        const cfg = configAtiva('PALADIN');
        if (!perfilReal('PALADIN') || !cfg) { log('equip: munição do Paladino não ajustada — o perfil dele não veio do servidor (dê F5 com o helper instalado)', 'erro'); return; }
        const atual = normalizarConfig(cfg);
        if (atual.ammo && MUNICAO[tipo].some(a => a.n === atual.ammo)) return;
        const nova = Object.assign({}, atual, { ammo: MUNICAO[tipo][0].n });
        const perfil = perfilDaVoc('PALADIN');
        perfil.list[perfil.active] = Object.assign({}, perfil.list[perfil.active], { config: nova });
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
                    if (w.lugar === 'corpo') { resto.push(f); continue; } // em outro personagem: espera ele trocar
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
            if (feitas) pedirReleituraDeDanos('equipar'); // v2.11 — arma nova muda o dano de todas as magias
        } catch (e) { log('equip: estourou — ' + e.message, 'erro'); }
        EQUIP.equipando = false;
        await equipAtualizar();
    }
    function candidatoPorIid(iid) { const R = EQUIP.res; if (!R) return null; for (const v of Object.keys(R.porVoc)) for (const s of Object.keys(R.porVoc[v])) { const c = R.porVoc[v][s].candidatos.find(c => c.peca.iid === iid); if (c) return c.peca; } return null; }
    /* v2.11 (D2) — botões numa linha (ATUALIZAR · EQUIPAR (n) · só Cav (n)),
     * vocação como botões com aria-pressed e nome inteiro no rótulo, "8 slots"
     * vira um interruptor à parte (misturado às abas parecia uma 5ª vocação),
     * slots em português, slot vazio sem nada melhor diz isso (não "já é o
     * melhor"), números em pt-BR, linha que abre é botão de teclado. */
    function telaEquip() {
        garantirCssTelas();
        const dep = ESTADO_WS.depot, R = EQUIP.res, v = EQUIP.voc;
        const dentro = emHunt(), sock = socketAberto();
        const n4 = R ? slotsTrocas(VOCS).fila.length : 0, nv = R ? slotsTrocas([v]).fila.length : 0;
        const podeEquipar = R && !dentro && !EQUIP.equipando && !EQUIP.lendo && sock;
        const porQue = !R ? 'clique ATUALIZAR antes' : dentro ? 'só na cidade' : !sock ? 'o socket do jogo não foi capturado — F5 com o helper instalado' : 'tira do depósito e equipa pelo socket';
        const pt = n => numBR(n, 1) + ' pt';
        let h = `<div class="tb-eq-bts">
            <button type="button" class="tb-bt pri" id="tb-eq-atualizar" ${EQUIP.lendo || EQUIP.equipando ? 'disabled' : ''} title="lê o corpo dos 4, a mochila e o depósito">${EQUIP.lendo ? 'lendo…' : 'ATUALIZAR'}</button>
            <button type="button" class="tb-bt" id="tb-eq-equipar4" ${podeEquipar && n4 ? '' : 'disabled'} title="${escHtml(porQue)}">${EQUIP.equipando ? 'EQUIPANDO…' : `EQUIPAR (${n4})`}</button>
            <button type="button" class="tb-bt" id="tb-eq-equipar1" ${podeEquipar && nv ? '' : 'disabled'} title="só as trocas do ${VOC_ROTULO[v]} — ${escHtml(porQue)}" aria-label="equipar só o ${VOC_ROTULO[v]} (${nv})">só ${VOC_CURTO[v]} (${nv})</button></div>
          <div class="tb-mut tb-eq-info">${dep ? `depósito ${numBR(dep.used)}/${numBR(dep.total)}` : 'depósito —'}${EQUIP.t ? ` · lido ${new Date(EQUIP.t).toLocaleTimeString('pt-BR')}` : ''}${EQUIP.ctx && EQUIP.ctx.mapa ? ` · wand/rod pelo elemento de ${escHtml(EQUIP.ctx.mapa)}` : ''}${dentro ? ' · <span class="tb-av">equipar só na cidade</span>' : ''}</div>`;
        if (EQUIP.erro) h += `<div class="tb-cx tb-ruim">${escHtml(EQUIP.erro)}</div>`;
        if (EQUIP.aviso) h += `<div class="tb-cx tb-av">${escHtml(EQUIP.aviso)}</div>`;
        if (!R) return h + aj('eq-ajuda', 'ATUALIZAR lê o corpo dos 4, a mochila e o depósito, busca os atributos base e ranqueia por vocação e slot. Nada é equipado nem descartado sem o botão EQUIPAR. Raridade não pontua: um épico com atributos que a vocação não usa perde para um incomum com o atributo certo.');
        h += `<div class="tb-sub tb-eq-vocs" role="group" aria-label="vocação">${VOCS.map(x => {
            const n = Object.values(R.porVoc[x] || {}).filter(eqMexer).length;
            const rot = VOC_ROTULO[x] + (n ? ` — ${n} troca${n > 1 ? 's' : ''}` : '');
            return `<button type="button" class="${x === v ? 'on' : ''}" data-voc="${x}" aria-pressed="${x === v}" title="${rot}" aria-label="${rot}">${VOC_CURTO[x]}${n ? ` <b>${n}</b>` : ''}</button>`;
        }).join('')}</div>
          <button type="button" class="tb-eq-sw" id="tb-eq-tudo" role="switch" aria-checked="${!!EQUIP.verTudo}" title="mostrar os 8 slots, não só os que têm troca"><span class="tb-sw ${EQUIP.verTudo ? 'on' : ''}" tabindex="-1" aria-hidden="true"><i></i></span>mostrar os 8 slots</button>`;
        const nomePeca = (p, voc) => p ? `${escHtml(p.nome)}${rarTag(p)}${p.origem === 'depósito' ? '<span class="tb-tag">dep.</span>' : p.origem === 'mochila' ? '<span class="tb-tag">mochila</span>' : p.dono && p.dono !== voc ? `<span class="tb-tag" title="${VOC_ROTULO[p.dono] || escHtml(p.dono)}">no ${VOC_CURTO[p.dono] || escHtml(p.dono)}</span>` : ''}` : '<span class="tb-mut">vazio</span>';
        const det = (p, voc) => { if (!p) return ''; const r = pontuarPeca(p, voc, EQUIP.ctx);
            return r.detalhe.map(d => `<span class="${d.pt > 0 ? '' : d.pt < 0 ? 'neg' : 'm'}">${escHtml(rotulo(d.id))} ${escHtml(typeof d.valor === 'number' ? numBR(d.valor, 2) : d.valor)}${d.pt !== 0 ? ` <span class="tb-mut">(${numBR(d.pt, 1)})</span>` : ''}</span>`).join(' · ') + (r.temporario ? ' <span class="tb-tag">temporário</span>' : '') + ` <span class="tb-mut">= ${pt(r.pontos)}</span>`; };
        let linhas = 0;
        for (const s of SLOTS_EQUIP) {
            const x = R.porVoc[v][s]; if (!x) continue;
            const troca = eqTroca(x), tirar = eqTirar(x), soGasta = eqSoGasta(x);
            if (!troca && !tirar && !soGasta && !EQUIP.verTudo) continue;
            linhas++;
            const chave = v + '|' + s, aberto = EQUIP.abertos.has(chave);
            const mot = troca ? pontuarPeca(x.melhor, v, EQUIP.ctx).motivos.join(' · ') : '';
            const direita = troca ? nomePeca(x.melhor, v) + `<small><span class="g">+${pt(x.ganho)}</span> · ${escHtml(decBR(mot))}</small>`
                : tirar ? '<span class="tb-av">tirar (arma de 2 mãos)</span>'
                : soGasta ? `<span class="tb-av">vale menos que nada neste mapa (${pt(x.atualPt)}: só gasta mana) — tire à mão se quiser; em outro mapa pode valer</span>`
                : !x.atual ? '<span class="tb-mut">nada melhor no estoque</span>' : '<span class="tb-mut">já é o melhor</span>';
            h += `<div class="tb-eq" data-k="${chave}" role="button" tabindex="0" aria-expanded="${aberto}" aria-label="${slotPt(s)} do ${VOC_ROTULO[v]}: detalhes">
                <span class="s">${slotPt(s)}</span>
                <span>${nomePeca(x.atual, v)}${x.atual ? `<small>${pt(x.atualPt)}</small>` : ''}</span>
                <span class="tb-mut" aria-hidden="true">${troca || tirar || soGasta ? '→' : '='}</span>
                <span>${direita}</span>
                ${aberto ? `<div class="tb-det"><div><b>atual:</b> ${det(x.atual, v) || '—'}</div>${troca ? `<div style="margin-top:3px"><b>melhor:</b> ${det(x.melhor, v)}</div>` : ''}</div>` : ''}
              </div>`;
        }
        if (!linhas) h += `<div class="tb-ok" style="margin:4px 0">${VOC_ROTULO[v]}: nada a trocar — o que está no corpo já é o melhor que você tem.</div>`;
        /* v2.11.6 — wiki /forja: peça Incomum ou melhor (ou refinada) NÃO vende na
         * cidade, no Auto Selling nem no Mercado — só se usa ou se desmancha, e o
         * desmanche é a ÚNICA fonte de fragmentos (gemas). Comum sem refino vende. */
        const disp = R.dispensaveis, vendivel = vendivelNpc;
        const temNegocio = (nome) => { const c = MK.catalogo && MK.catalogo[mkMin(nome)]; return !!(c && Number(c.trades30d) > 0); };
        const incluirMk = !!ler('desm_incluir_mercado', false);
        const nd = pecasDesmanche(R, temNegocio, incluirMk).length, nMk = MK.catalogo ? pecasDesmanche(R, null, true).length - pecasDesmanche(R, temNegocio, false).length : 0;
        const podeDesm = nd && !dentro && sock && !EQUIP.equipando && !EQUIP.lendo;
        const desmArmado = EQUIP.desmConf && Date.now() < EQUIP.desmConf;
        h += `<div class="tb-linha"><button type="button" class="tb-bt ${desmArmado ? 'pri' : ''}" id="tb-eq-desmanchar" ${podeDesm ? '' : 'disabled'} title="${escHtml(!nd ? 'nada para desmanchar: as sobras Incomum+ ou refinadas (o NPC não compra) é que vão' : dentro ? 'só na cidade' : !sock ? 'o socket do jogo não foi capturado — F5 com o helper instalado' : 'manda as sobras que o NPC não compra para o Desmanche da Forja (forge_salvage_batch) — vira fragmento, não volta')}">${EQUIP.desm ? 'DESMANCHANDO…' : desmArmado ? `confirmar: desmanchar ${nd}` : `DESMANCHAR (${nd})`}</button>` +
             `<span class="tb-mut tb-eq-nota">${desmArmado ? 'toque de novo para confirmar (não volta)' : 'sobras que o NPC não compra → fragmentos (2 toques)'}</span></div>` +
             `<div class="tb-mut tb-eq-nota">${MK.catalogo ? `${nMk} com negócio no Mercado em 30 dias ficam fora ` : 'Mercado não lido (aba Mercado → ATUALIZAR) — não sei quais têm comprador '}<label class="tb-l"><input type="checkbox" id="tb-eq-desm-mk" ${incluirMk ? 'checked' : ''}> incluir as que têm negócio no Mercado</label></div>`;
        const soma = disp.filter(vendivel).reduce((n, p) => n + (p.sell || 0), 0);
        h += aj('eq-disp', `<div class="tb-mut tb-eq-nota">não são a melhor nem uma das 2 reservas de ninguém, pela conta de hoje (1 pt = 1 % do dano da party). Comum: vende no NPC. Incomum ou melhor: o NPC não compra, mas o Mercado aceita (visto em 04/10) — vale olhar a aba Mercado antes; o que ninguém compra vira fragmento no Desmanche. Encaixes de imbuement não pontuam.</div>` +
            disp.slice(0, 60).map(p => `<div class="tb-lin"><span>${escHtml(p.nome)}${rarTag(p)}<span class="tb-tag">${escHtml(p.origem)}</span> <span class="tb-mut tb-eq-nota">${escHtml(p.motivo)}${potenciaDe(p) >= POTENCIA_BASE_FORJA ? ' · potência ' + numBR(potenciaDe(p)) : ''}</span></span><span>${vendivel(p) ? numBR(p.sell || 0) : 'desmanche'}</span></div>`).join('') +
            (disp.length > 60 ? `<div class="tb-mut">… e mais ${disp.length - 60}</div>` : ''), `sobrando (${disp.length} · comuns ${numBR(soma)} o)`);
        const bases = R.bases || [];
        const potTxt = p => { const v = potenciaDe(p); return v ? ` · potência ${numBR(v)}` : ''; };
        /* v2.14.10 — plano de forja por peça (planoForja no bloco puro; o custo das gemas vem do pgRefino do Progresso) */
        const planoForjaHtml = (p, res) => {
            let pl; try { pl = planoForja(p, VOCS, EQUIP.ctx, res && res.porVoc); } catch (e) { falhou('plano de forja', e); return ''; }
            let custo = '';
            if (pl.proxima) { try { const r = pgRefino(pl.proxima.refinoAlvo - pl.proxima.refinos, pl.proxima.refinoAlvo, 'melhor'); custo = ` · custo esperado ~${numBR(Math.round(r.total.tentativas * 10) / 10)} gema(s) de refino${r.total.G > 0.05 ? ' + ' + numBR(Math.round(r.total.G * 10) / 10) + ' de garantia' : ''} ≈ ${milBR(Math.round(r.total.ouro))} de ouro`; } catch (e) { custo = ''; } }
            const atuais = pl.linhasAtuais.length ? pl.linhasAtuais.map(x => `<span class="${x.boa ? 'tb-ok' : 'tb-ruim'}">${escHtml(x.rotulo)} ${escHtml(String(x.valor))}${x.boa ? ' ✓' : ' ✗'}</span>`).join(' · ') : 'nenhuma (sem encaixe preenchido)';
            return `<details class="tb-aj" data-k="eq-plano-${escHtml(String(p.iid))}"><summary>plano de forja · ${escHtml(VOC_ROTULO[pl.voc] || pl.voc)} · faixa ${pl.faixa}${pl.proxima ? ' → ' + pl.proxima.faixa + ' em ' + pl.proxima.refinos + ' refino' + (pl.proxima.refinos > 1 ? 's' : '') : ''}</summary><div class="tb-mut">` +
                `<div><b>Para quem:</b> ${escHtml(VOC_ROTULO[pl.voc] || pl.voc)}, ${escHtml(slotPt(pl.slot))}${pl.veste ? ` — hoje usa ${escHtml(pl.veste.nome)} (${numBR(pl.veste.pt)} pt)` : ''}.</div>` +
                `<div><b>Potência:</b> ${numBR(pl.pot)} = faixa ${pl.faixa}${pl.proxima ? ` · próxima faixa (${pl.proxima.limiar}) em ${pl.proxima.refinos} refino${pl.proxima.refinos > 1 ? 's' : ''} (+${pl.proxima.refinoAlvo - pl.proxima.refinos} → +${pl.proxima.refinoAlvo})${custo}` : ' · faixa máxima'}.</div>` +
                `<div><b>Linhas que valem aqui</b> (1 pt ≈ 1 % do dano da party, valor típico da faixa ${pl.proxima ? pl.proxima.faixa : pl.faixa}): ${pl.linhasAlvo.map(x => escHtml(x.rotulo) + ' ' + numBR(x.pt) + ' pt').join(' · ') || '—'}.</div>` +
                `<div><b>Linhas de hoje:</b> ${atuais}.</div>` +
                `<ol style="margin:4px 0 0 16px;padding:0">${pl.passos.map(x => '<li>' + escHtml(x) + '</li>').join('')}</ol></div></details>`;
        };
        if (bases.length) { h += aj('eq-bases', `<div class="tb-mut tb-eq-nota">Ninguém usa, mas vale pela Forja: Épico ou melhor (3+ encaixes: trocar o encaixe ruim sai mais barato que subir a raridade) ou potência ≥ ${POTENCIA_BASE_FORJA} com encaixe de ML, distância ou corpo a corpo (cada refino dá +50 de potência e a cada 200 a linha pode subir um ponto). Nunca entram nas sobras.</div>` +
            `<div class="tb-mut tb-eq-nota">Cada peça abaixo tem um <b>plano</b>: para quem, quantos refinos até a próxima faixa, quais linhas procurar e a ordem das gemas.</div>` +
            bases.map(p => `<div class="tb-lin"><span>${escHtml(p.nome)}${rarTag(p)} <span class="tb-mut">${escHtml(slotPt(p.slot))} · ${escHtml(p.origem)}${potTxt(p)} · ${escHtml(((p.forja && p.forja.atributos) || []).map(a => rotulo(a.id) + ' ' + a.valor).join(', '))}</span></span></div>` + planoForjaHtml(p, R)).join('') +
            aj('eq-forja-gl', `<b>As gemas, uma a uma</b> (100 fragmentos + ouro cada; o ouro acompanha a coin): <b>Refino T1</b> +1 a +4 (falha não derruba) · <b>Refino T2</b> +5 a +10 (falha derruba 1) · <b>Garantia T1</b> protege a tentativa do +5 em diante · <b>Raridade T1</b> sobe um grau até Lendário (falhar só gasta a gema) · <b>Raridade T2</b> Mítico · <b>Atributo T1</b> escreve uma linha aleatória no 1º encaixe vazio · <b>Limpeza T1</b> apaga TODAS as linhas · <b>Limpeza T2</b> apaga só a ÚLTIMA · <b>Refazer T1</b> re-sorteia o valor de todas no range da faixa · <b>Refazer T2</b> só do último encaixe · <b>Ordem T2</b> embaralha a ordem. Potência = base + 50 por refino; faixas I–VI a cada 200 (1–199, 200–399, 400–599, 600–799, 800–999, 1000+) e cada faixa sobe o valor que a linha pode ter (regen 1,1 → 5,2 · skill +1 → +3 · dano 1,2 → 9,8 %). Encaixes = raridade (Incomum 1, Raro 2, Épico 3, Lendário 4). Comum não desmancha e não tem encaixe.`, '? como a Forja funciona'),
            `bases de forja (${bases.length})`); }
        const nobres = R.nobres || [];
        if (nobres.length) { h += aj('eq-nobres', `<div class="tb-mut tb-eq-nota">Encaixe que a comunidade guarda (wiki /forja): regen. de mana ou de vida nas peças de defesa; corpo a corpo, distância, nível mágico, dano físico ou mágico na arma e no colar. O encaixe dela supera o da peça que alguém que a veste vai usar, mas a nota total perdeu: fica guardada, fora das sobras e do Mercado. Quando todos já vestem encaixe igual ou melhor, ela volta para as sobras e dá para vender.</div>` +
            nobres.map(p => `<div class="tb-lin"><span>${escHtml(p.nome)}${rarTag(p)} <span class="tb-mut">${escHtml(slotPt(p.slot))} · ${escHtml(p.origem)} · ${escHtml(((p.forja && p.forja.atributos) || []).map(a => rotulo(a.id) + ' ' + a.valor).join(', '))}</span></span></div>`).join(''), `guardar: encaixe bom (${nobres.length})`); }
        h += aj('eq-res', [...R.reservas].map(iid => { const p = candidatoPorIid(iid); return p ? `<div class="tb-lin"><span>${escHtml(p.nome)}${rarTag(p)} <span class="tb-mut">${escHtml(slotPt(p.slot))} · ${escHtml(p.origem)}</span></span></div>` : ''; }).join(''), `reservas (${R.reservas.size})`);
        const temp = R.temporarios || [];
        if (temp.length) { h += aj('eq-temp', `<div class="tb-mut tb-eq-nota">acabam por carga ou por tempo de caçada (wiki): não entram nas trocas nem na lista de venda — use à mão (boss, mapa difícil).</div>` +
            temp.slice(0, 40).map(p => {
                const m = VOCS.filter(x => vocacaoPode(p.attrs, x)).map(x => ({ x, r: pontuarPeca(p, x, EQUIP.ctx) })).sort((a, b) => b.r.pontos - a.r.pontos)[0];
                if (!m) return '';
                const dura = m.r.cargas ? numBR(m.r.cargas) + ' cargas' : m.r.duracaoS ? numBR(Math.round(m.r.duracaoS / 60)) + ' min' : 'temporário';
                return `<div class="tb-lin"><span>${escHtml(p.nome)} <span class="tb-mut">${escHtml(slotPt(p.slot))} · ${escHtml(p.origem)} · ${dura}</span></span><span class="tb-mut" title="${VOC_ROTULO[m.x]}">${VOC_CURTO[m.x]} ${pt(m.r.pontos)}</span></div>`; }).join(''), `temporários (${temp.length})`); }
        h += aj('eq-opc', `<label class="tb-l"><input type="checkbox" id="tb-eq-guardar" ${ler('equip_guardar', true) ? 'checked' : ''}> depois de equipar, guardar a mochila inteira no depósito</label><div class="tb-eq-nota">pelo socket: tira do depósito e equipa; a peça que sai cai na mochila. O jogo só tem "guardar tudo": o loot da mochila vai junto. Peça de outro personagem só depois que ele trocar. Arco ↔ besta troca a munição do Paladino junto.</div>`, 'opções');
        return h;
    }
    function ligarEquip() {
        const corpo = $('#tb-corpo');
        const b = $('#tb-eq-atualizar'); if (b) b.onclick = () => { if (!EQUIP.lendo && !EQUIP.equipando) equipAtualizar(); };
        $$('[data-voc]', corpo).forEach(s => { s.onclick = () => { if (EQUIP.voc === s.dataset.voc) return; EQUIP.voc = s.dataset.voc; renderizar(); }; });
        $$('.tb-eq', corpo).forEach(e => { e.onclick = (ev) => { if (ev.target && ev.target.closest && ev.target.closest('.tb-det')) return; const k = e.dataset.k; if (EQUIP.abertos.has(k)) EQUIP.abertos.delete(k); else EQUIP.abertos.add(k); renderizar(); }; });
        const tudo = $('#tb-eq-tudo'); if (tudo) tudo.onclick = () => { EQUIP.verTudo = !EQUIP.verTudo; renderizar(); };
        const e4 = $('#tb-eq-equipar4'); if (e4) e4.onclick = () => { if (!EQUIP.equipando) equiparTrocas(VOCS); };
        const e1 = $('#tb-eq-equipar1'); if (e1) e1.onclick = () => { if (!EQUIP.equipando) equiparTrocas([EQUIP.voc]); };
        const dmk = $('#tb-eq-desm-mk'); if (dmk) dmk.onchange = () => { guardar('desm_incluir_mercado', dmk.checked); EQUIP.desmConf = null; renderizar(); };
        const ds = $('#tb-eq-desmanchar'); if (ds) ds.onclick = () => { const agora = Date.now(); if (EQUIP.desmConf && agora < EQUIP.desmConf) { EQUIP.desmConf = null; desmancharSobras(); } else { EQUIP.desmConf = agora + 8000; renderizar(); } };
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
        chaveMin: 0.00047, chaveMax: 0.00105, // /elites: "entre 0,047% e 0,105% por abate" (a maioria)
        mochilaT1: 5, mochilaT2: 10, // /chaves-e-caixas: Key Backpack T1 grátis, T2 100 coins
        tetoCacadaH: 12, // /a-cacada-com-o-jogo-fechado: sessão dura no máx. 12 h de caçada
        preyH: 2 // /prey: cada sorteio/renovação vale 2 h de caçada
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
    /* /imbuements (e /assets/<versão>/imbuements.json → bases): taxa, proteção, chance */
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
        /* 2.11.1 — ao vivo (29/09): em várias caçadas os primeiros marcos valem 0 no
         * catálogo (Vampire hell: 2k → 0, 5k → 0, 10k → +1 nível mágico). O "próximo
         * marco" é o próximo que DÁ algo — senão a lista mandava caçar por +0. */
        const feitos = st.filter(s => k >= s.kills);
        const valor = feitos.length ? feitos[feitos.length - 1].value || 0 : 0;
        const prox = st.find(s => k < s.kills && (s.value || 0) > valor) || null;
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
        if (x.autoSell) oz = tx && tx.horas >= 0.25 && tx.ozLiqH != null ? tx.ozLiqH : null; // vende a cada 10 min: só o líquido de 15+ min diz algo
        else if (tx && tx.horas >= 1 / 30) oz = tx.ozH;
        r.ozH = oz;
        r.horasMochila = x.ozLivre == null || oz == null ? null : oz > 0 ? Math.max(0, x.ozLivre / oz) : Infinity;
        const ev = [{ k: 'teto', h: r.tetoH, encerra: true, texto: 'teto de 12 h: a caçada termina ("Tempo da caçada esgotado")' }];
        if (r.horasOuro != null && Number.isFinite(r.horasOuro)) { ev.push({ k: 'ouro', h: r.horasOuro, encerra: margem > 0,
            texto: margem > 0 ? 'o ouro chega à margem do Auto Exit e a caçada encerra' : 'o ouro acaba: poções e runas pagas PAUSAM (só cura por magia e regeneração) — risco de morte' }); }
        if (r.horasMochila != null && Number.isFinite(r.horasMochila)) { ev.push({ k: 'mochila', h: r.horasMochila, encerra: !!x.autoExitCap,
            texto: x.autoExitCap ? 'a mochila enche e o Auto Exit encerra a caçada' : 'a mochila enche: o loot que não couber deixa de ser coletado (a caçada continua)' }); }
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
            if (w <= 0) break; // sem wildcard na renovação: expira e a trava desliga
            w--; renov++; s.ms = agora + DUR;
            if (w === 0) break; // zerou: todas desligam agora
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

    /* v2.14.9 — PREY (TV de Souza, 04/10): rerrolar os grátis até os 4 terem DANO, travar os 4 (🔒) e caçar o mapa do
     * item por horas; buff vencendo sem trava some em 2 h de caçada. Só leitura: quem trava é o dono. */
    const PG_TIPO_PREY_TXT = { xp: 'EXP', loot: 'LOOT', dano: 'DANO', defesa: 'DEFESA' };
    const PG_PREY_VENCENDO_MS = 30 * 60000;
    function pgAlertaPrey(prey) {
        if (!prey || !prey.buffs) return null;
        const b = prey.buffs;
        const comDano = PG_VOCS.filter(v => b[v] && b[v].tipo === 'dano' && b[v].msLeft !== 0);
        if (comDano.length === 4) {
            const soltos = PG_VOCS.filter(v => !b[v].locked);
            return { nivel: 'ok', texto: 'os 4 com DANO' + (soltos.length ? ' — trave ' + soltos.map(v => PG_VOC[v]).join(', ') + ' (🔒, 1 wildcard a cada 2 h) e cace o mapa do item por horas' : ', todos travados: cace o mapa do item por horas') };
        }
        const venc = PG_VOCS.filter(v => b[v] && b[v].tipo && !b[v].locked && b[v].msLeft != null && b[v].msLeft > 0 && b[v].msLeft < PG_PREY_VENCENDO_MS);
        if (venc.length) {
            const cauda = prey.wildcards > 0 ? ` — travar custa 1 wildcard (tem ${pgInt(prey.wildcards)})` : ' — sem wildcard para travar';
            return { nivel: 'aviso', texto: venc.map(v => `${PG_VOC[v]}: ${PG_TIPO_PREY_TXT[b[v].tipo] || b[v].tipo} acaba em ${Math.ceil(b[v].msLeft / 60000)} min sem trava`).join(' · ') + cauda };
        }
        return null;
    }
    /* v2.14.9 — INVASÃO (criador do jogo, 04/10): inscrever todo dia rende raid tokens mesmo em posição ruim; tokens viram
     * fragmentos no NPC Ravena (~2k cada no mercado). Lido do ícone da cidade: [data-testid=invasao-icone][data-estado]
     * (sem_invasao · abertas · inscrito · preparando · rodando · rodando_assistir · encerrada), invasao-icone-topo
     * [data-topo] (nao · inscrito · convite) e invasao-icone-contagem. Só leitura: quem se inscreve é o dono. */
    function pgAvisoInvasao(ic) {
        if (!ic || !ic.estado) return null;
        const e = ic.estado, c = ic.contagem ? String(ic.contagem).trim() : '';
        if (e === 'abertas' || (e === 'preparando' && ic.tom === 'nao')) return { nivel: 'aviso', texto: `Invasão de hoje: você ainda não se inscreveu${c ? ' — janela em ' + c : ''}. Inscrever rende raid tokens mesmo em posição ruim (tokens → fragmentos no NPC Ravena).` };
        if (e === 'inscrito' || (e === 'preparando' && ic.tom === 'inscrito')) return { nivel: 'ok', texto: `Invasão: inscrito${c ? ' · janela em ' + c : ''}` };
        if (e === 'rodando' || e === 'rodando_assistir') return { nivel: 'info', texto: 'Invasão ao vivo agora' };
        if (e === 'encerrada') return { nivel: 'info', texto: `Invasão de hoje encerrada${c ? ' · inscrições reabrem em ' + c : ''}` };
        if (e === 'sem_invasao') return { nivel: 'info', texto: 'Sem invasão hoje' };
        return null;
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

    /* ---- 6. COMPLETAR O BESTIÁRIO (v2.11.10) ------------------------------- */
    /* Dono, 29/09: "um botão para completar, e ir trocando assim que completar".
     * Vale a pena só para ALGUNS marcos: o bônus é para os 4 e para sempre (wiki
     * /bestiario), mas +3 de mana máxima em 10.000 abates não paga as horas fora
     * do mapa de upar. A moeda é a do Equip (1 pt = 1 % do dano da party ≈ 450 de
     * ouro+xp por hora): `pesos` = pt por unidade de cada bônus, somado nos 4
     * (vem de pesosDaVoc em tempo de execução). Um marco entra se o ganho dele
     * rende ≥ PG_BEST_LIMIAR pt por hora de caçada gasta nele — regen. de mana e
     * de vida passam folgado; mana/vida máx., capacidade, armadura e skill +1 em
     * 10.000 abates não. Abates/h: o medido (ao vivo, Scan, sessões); sem medida,
     * 280 × lure (spawn limitando: Stonerefiners 8 → 2.372/h, Djinns 7 → 1.908/h,
     * medidos 28–29/09 — a party de nível 67 mata a onda de caçada baixa na hora). */
    const PG_BONUS_PESO = { hpRegen: 'regen_vida', manaRegen: 'regen_mana', maxHealth: 'max_hp', maxMana: 'max_mana', capacity: 'capacidade',
                            armor: 'armor', attack: 'attack', melee: 'corpo_a_corpo', distance: 'distancia', shielding: 'escudo', magicLevel: 'nivel_magico' };
    /* v2.11.11 — e o ganho tem que ser de verdade: Dwarf Bridge (+9 vida máx ≈ 0,2 pt) e Cyclops (0,3 pt)
     * passavam no limiar por serem rápidos, mas mudam nada. Menos de 1 pt (≈ 450 ouro+xp/h) não compensa. */
    const PG_ABATES_POR_LURE = 280, PG_BEST_LIMIAR = 0.5, PG_BEST_MIN_PT = 1;
    /* → linhas [{hunt, id, bonus, atual, k, conhecido, abatesH, estimado, alvo {kills, value, falta, horas, ganhoPt} | null,
     *            ultimo {…o marco final…} | null, ptH, vale}], as que valem primeiro (mais pt por hora antes) */
    function pgPlanoBestiario(hunts, contadores, medidos, nivel, pesos, o) {
        o = o || {};
        const limiar = o.limiar != null ? o.limiar : PG_BEST_LIMIAR;
        const minPt = o.minPt != null ? o.minPt : PG_BEST_MIN_PT;
        const out = [];
        for (const h of (hunts || [])) {
            if (!h || !h.bestiary || (h.levelMin || 1) > nivel || (pgNum(h.levelMax) > 0 && nivel > pgNum(h.levelMax)) || (h.premium && o.premium === false)) continue;
            const st = (h.bestiary.stages || []).map(s => ({ kills: pgNum(s && s.kills), value: pgNum(s && s.value) || 0 })).filter(s => s.kills > 0).sort((a, b) => a.kills - b.kills);
            if (!st.length) continue;
            const cru = (contadores || {})[String(h.id)], k = Math.max(0, pgNum(cru) || 0);
            const lure = Math.max(1, ...((h.lureTiers || []).map(x => pgNum(x && (x.max || x.min)) || 1)));
            const m = (medidos || {})[h.id];
            const abatesH = m && m.abatesH > 0 ? m.abatesH : PG_ABATES_POR_LURE * lure;
            const ptU = Math.max(0, pgNum(pesos && pesos[h.bestiary.bonus]) || 0);
            const feitos = st.filter(s => k >= s.kills);
            const atual = feitos.length ? feitos[feitos.length - 1].value : 0;
            /* passos com ganho de verdade (o +0 dos marcos I/II de skill não é passo) */
            const passos = [];
            let valAnt = atual, killsAnt = k;
            for (const s of st) {
                if (s.kills <= k || s.value <= valAnt) continue;
                const horas = (s.kills - killsAnt) / abatesH, ganhoPt = (s.value - valAnt) * ptU;
                passos.push({ kills: s.kills, value: s.value, falta: s.kills - k, horas: (s.kills - k) / abatesH, ganhoPt: (s.value - atual) * ptU, ptHPasso: horas > 0 ? ganhoPt / horas : 0 });
                valAnt = s.value; killsAnt = s.kills;
            }
            if (!passos.length) continue; // completo
            let alvo = null;
            for (const p of passos) { if (p.ptHPasso >= limiar) alvo = p; else break; }
            if (alvo && alvo.ganhoPt < minPt) alvo = null;
            const ultimo = passos[passos.length - 1];
            const ref = alvo || passos[0];
            out.push({ hunt: h, id: h.id, bonus: h.bestiary.bonus, atual, k, conhecido: cru != null, abatesH, estimado: !(m && m.abatesH > 0),
                       alvo, ultimo, ptH: ref.horas > 0 ? ref.ganhoPt / ref.horas : 0, vale: !!alvo });
        }
        return out.sort((a, b) => (b.vale - a.vale) || (b.ptH - a.ptH));
    }
    /* marcados (ids) → fila [{id, kills, value}] na ordem das linhas; quem não "vale" e foi marcado vai até o fim */
    const pgFilaBestiario = (linhas, marcados) => (linhas || []).filter(l => marcados.has(l.id)).map(l => { const a = l.alvo || l.ultimo; return { id: l.id, kills: a.kills, value: a.value, bonus: l.bonus }; });
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
        try { pgLembretes(); } catch (e) { falhou('lembretes (prey/invasão)', e); }
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
            /* 2.11.1 — ao vivo: summary.title vem como {key, params} (texto traduzível), não string;
             * aparecia "[object Object]". O nome sai do catálogo pelo huntId. */
            const tituloFim = typeof sm.title === 'string' ? sm.title : ((CAT.hunts || []).find(x => x && x.id === pgNum(sm.huntId)) || {}).title || (sm.title && sm.title.params && (sm.title.params.title || sm.title.params.name)) || null;
            PROG.fim = { t: Date.now(), motivo: sm.reason || null, titulo: tituloFim, seg: pgNum(sm.elapsedSec) };
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
            if (PROG.amostras.length > 240) PROG.amostras.shift(); // 2 h de amostras
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
            /* v2.11.2 — o tier e o limite do JOGO (frame: keyBagTierId "keybag_t2",
             * keyBagMax 10). Aparecia "Key Backpack T1 · T1 guarda 5" com a T2. */
            const tierN = (String(kb.tierId || '').match(/t(\d+)$/i) || [])[1];
            const nomeTier = tierN ? 'Key Backpack T' + tierN : t.nome;
            h += `<div class="pg-mut pg-peq">${nomeTier ? escHtml(nomeTier) + ' · ' : ''}${t.max ? 'guarda ' + pgInt(t.max) + ' chaves. ' : ''}${t.max && t.max < PG_WIKI.mochilaT2 ? `A T2 guarda ${PG_WIKI.mochilaT2} (100 coins). ` : ''}Chave no depósito também vale para o Elite e o Sweep.</div>`;
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

    /* =========================================================================
     *  ⭐ v2.11.10 — COMPLETAR O BESTIÁRIO (dono, 29/09: "um botão para
     *  completar, e ir trocando assim que completar"; "e se a mochila encher?
     *  e depois, onde o boneco fica upando?").
     *
     *  Só roda quando o dono liga (2 toques), como o Scan. A cada amostra (3 s):
     *    • marco da caçada-alvo fechado (contador do frame ≥ alvo) → próxima;
     *    • party fora da caçada-alvo → entra pelo socket com o lure máximo (a
     *      mesma entrada do Scan) e aplica o kit escolhido nos 4;
     *    • mochila no limite do Auto Hunt: com o Auto Hunt ligado, ele vende e
     *      VOLTA PARA A CAÇADA DO BESTIÁRIO (cicloDeVenda usa bestAlvoId); com
     *      ele desligado, o próprio modo faz o ciclo de venda;
     *    • morte ou Auto Exit por ouro → o modo para e devolve os kits;
     *    • fila vazia → vai para o mapa escolhido para upar (ou o de antes),
     *      devolve os kits de antes e passa esse mapa ao Auto Hunt.
     *  Espera (não briga) com Scan, ciclo de venda, boss, aplicar magia.
     *  Estado em best_estado: F5 no meio continua de onde parou.
     *  ⚠ Com o jogo fechado o helper não roda: a party fica no mapa em que
     *  estiver (os abates seguem contando, só não troca de caçada).
     * ====================================================================== */
    const BEST_PADRAO = { marcados: null, modelo: 'economica', fim: 'voltar', fimHunt: null };
    const bestCfg = () => Object.assign({}, BEST_PADRAO, ler('best_cfg', {}));
    const guardarBestCfg = (p) => guardar('best_cfg', Object.assign(bestCfg(), p));
    const BEST = { ativo: false, fila: [], idx: 0, foto: null, passo: false, ocupado: false, restaurando: false, entrouEm: 0, falhas: 0 }; // passo = trocando de caçada; ocupado = encerrando
    const bestSalvar = () => guardar('best_estado', BEST.ativo ? { ativo: true, fila: BEST.fila, idx: BEST.idx, foto: BEST.foto, t: Date.now() } : null);
    const bestAlvoId = () => (BEST.ativo && BEST.fila[BEST.idx] ? BEST.fila[BEST.idx].id : null);
    function bestRecarregar() {
        const e = ler('best_estado', null);
        if (!e || !e.ativo || !Array.isArray(e.fila) || !(e.idx < e.fila.length)) return;
        Object.assign(BEST, { ativo: true, fila: e.fila, idx: e.idx || 0, foto: e.foto || null, entrouEm: Date.now() });
        log(`bestiário: modo "completar" continua ligado — ${BEST.fila.length - BEST.idx} caçada(s) na fila`, 'info');
    }
    /* pt por unidade de cada bônus, somado nos 4 (a capacidade é uma só, da conta) */
    function pesosBestiario() {
        let ctx = null;
        try { ctx = { nivel: nivelAtual(), party: partyMedida() }; } catch (e) { ctx = null; }
        const soma = {};
        for (const v of VOCS) { const P = pesosDaVoc(v, ctx); for (const [b, campo] of Object.entries(PG_BONUS_PESO)) soma[b] = (soma[b] || 0) + (Number(P[campo]) || 0); }
        soma.capacity = Number(pesosDaVoc('KNIGHT', ctx).capacidade) || 0;
        return soma;
    }
    const bestLinhas = () => pgPlanoBestiario(CAT.hunts, PROG.best, pgMedidos(), nivelAtual(), pesosBestiario(), { premium: mkPremiumAgora() === false ? false : undefined });
    function bestDestino() {
        const c = bestCfg();
        return c.fim === 'hunt' && c.fimHunt != null ? (CAT.hunts || []).find(x => x.id === c.fimHunt) || null : null;
    }
    function bestIniciar() {
        const c = bestCfg(), linhas = bestLinhas();
        const fila = pgFilaBestiario(linhas, new Set(c.marcados || linhas.filter(l => l.vale).map(l => l.id)));
        if (!fila.length) { avisar('progresso', 'bestiário: marque ao menos uma caçada', 'erro'); return; }
        if (!socketAberto() || !ESTADO_WS.perfisDoServidor) { avisar('progresso', 'bestiário: socket sem perfis — dê F5 com o helper instalado', 'erro'); return; }
        const ocup = travaJogo();
        if (ocup || SCAN.ativo) { avisar('progresso', 'bestiário: ' + (ocup || 'Scan') + ' em andamento — espera terminar', 'erro'); return; }
        if (ESTADO_WS.boss) { avisar('progresso', 'bestiário: boss em andamento — termina o boss antes', 'erro'); return; }
        const cacando = frameFresco() && ESTADO_WS.huntId != null;
        BEST.foto = { t: Date.now(), huntId: cacando ? ESTADO_WS.huntId : null, lureTier: cacando ? ESTADO_WS.frame.lureTier : null,
                      profiles: ESTADO_WS.profiles ? clonar(ESTADO_WS.profiles) : null };
        Object.assign(BEST, { ativo: true, fila, idx: 0, entrouEm: Date.now(), falhas: 0 });
        bestSalvar();
        const dest = bestDestino();
        avisar('progresso', `bestiário: modo "completar" LIGADO — ${fila.map(f => ((pgHuntCat(f.id) || {}).title || f.id) + ' até ' + pgInt(f.kills)).join(' → ')} · no fim: ${dest ? 'upar em ' + dest.title : 'voltar para onde estava'}`, 'ok');
        renderizar();
    }
    /* restaurar: 'fim' (vai upar no destino), 'tudo' (volta para onde estava), 'perfis' (só os kits), 'nada' */
    async function bestEncerrar(motivo, tipo, restaurar) {
        const foto = BEST.foto;
        Object.assign(BEST, { ativo: false, foto: null });
        bestSalvar();
        log('bestiário: ' + motivo, tipo || 'info');
        if (!foto || restaurar === 'nada') { renderizar(); return; }
        BEST.restaurando = true; BEST.ocupado = true; _travaJogo = 'Bestiário';
        renderizar();
        try {
            await esperarQue(() => !_cicloEmCurso && !BEST.passo, 120000, 500); // a troca em curso termina antes
            const dest = restaurar === 'fim' ? bestDestino() : null;
            if (dest) {
                const lure = dest.id === foto.huntId && foto.lureTier != null ? foto.lureTier : (dest.lureTiers && dest.lureTiers.length ? dest.lureTiers.length : 1);
                const r = await scanEntrar(dest, { lure });
                log(r.erro ? 'bestiário: não entrei em ' + dest.title + ' — ' + r.erro : 'bestiário: party em ' + dest.title + ' para upar', r.erro ? 'erro' : 'ok');
                await _scanRestaurar(foto, 'perfis', 'Bestiário');
                if (!r.erro) guardarAutoHunt({ huntId: dest.id }); // o Auto Hunt passa a vender e voltar para lá
            } else await _scanRestaurar(foto, restaurar === 'perfis' ? 'perfis' : 'tudo', 'Bestiário');
        } catch (e) { falhou('bestiário (encerrar)', e); }
        finally { BEST.restaurando = false; BEST.ocupado = false; if (_travaJogo === 'Bestiário') _travaJogo = null; renderizar(); }
    }
    async function bestPasso() {
        if (!BEST.ativo || BEST.passo || BEST.ocupado) return;
        if (SCAN.ativo || scanOcupado() || _cicloEmCurso || _aprendendo || _aplicando || ESTADO_WS.boss || cicloTravadoPorOutraAba()) return; // espera a vez
        if (_travaJogo || !socketAberto() || !CAT.hunts) return;
        /* morte ou Auto Exit por ouro depois da última entrada: para e devolve os kits
         * (não reentra sozinho depois de uma morte, igual ao Scan). 12 h (expired) e
         * mochila cheia (cap_full) só fazem entrar de novo — depois da venda. */
        const en = ESTADO_WS.ultimoEnded;
        if (en && en.t > BEST.entrouEm && /death|dead|morte|no_gold/i.test(String(en.reason || ''))) {
            await bestEncerrar(`a caçada terminou (${PG_FIM[en.reason] || en.reason}) — modo desligado, kits devolvidos`, 'erro', 'perfis');
            return;
        }
        const alvo = BEST.fila[BEST.idx];
        if (!alvo) { await bestEncerrar('todos os marcos da lista fechados ✓', 'ok', 'fim'); return; }
        const h = pgHuntCat(alvo.id);
        if (!h) { log(`bestiário: caçada ${alvo.id} não está no catálogo — pulei`, 'erro'); BEST.idx++; bestSalvar(); return; }
        const k = pgNum(PROG.best[String(alvo.id)]);
        if (k != null && k >= alvo.kills) {
            log(`bestiário: ${h.title} chegou a ${pgInt(k)} abates → ${pgBonusTxt(alvo.bonus, alvo.value)} ✓`, 'ok');
            BEST.idx++; bestSalvar(); renderizar();
            return;
        }
        const aqui = frameFresco() && ESTADO_WS.huntId === h.id;
        const mochilaCheia = mochilaNoLimite() || (en && en.t > BEST.entrouEm && en.reason === 'cap_full');
        /* mochila cheia sem o Auto Hunt ligado: o próprio modo vende e volta para cá */
        if (mochilaCheia && !autoHunt().on && Date.now() - _ultimoCiclo >= CICLO_INTERVALO_MIN_MS && !modalAberto()) {
            log('bestiário: mochila no limite — vendendo e voltando para ' + h.title, 'info');
            BEST.entrouEm = Date.now(); BEST.passo = true;
            try { await cicloDeVenda('bestiario'); } finally { BEST.passo = false; }
            return;
        }
        /* v2.11.15 — mochila cheia e a venda ainda não pode (trava de 5 min, janela aberta): espera na
         * cidade. Antes caía no "entrar" e a party reentrava com a mochila cheia — o Auto Exit a
         * tirava de novo, em laço, até a trava liberar. */
        if (mochilaCheia && !autoHunt().on && !aqui) return;
        if (aqui) return;
        BEST.passo = true; _travaJogo = 'Bestiário';
        renderizar();
        try {
            log(`bestiário: indo para ${h.title} — ${pgInt(k || 0)}/${pgInt(alvo.kills)} abates até ${pgBonusTxt(alvo.bonus, alvo.value)}`, 'info');
            const r = await scanEntrar(h, { lure: h.lureTiers && h.lureTiers.length ? h.lureTiers.length : 1 });
            if (!BEST.ativo) return;
            if (r.erro) {
                BEST.falhas++;
                log(`bestiário: não entrei em ${h.title} — ${r.erro}`, 'erro');
                if (BEST.falhas >= 3) { BEST.passo = false; _travaJogo = null; await bestEncerrar('3 falhas seguidas para entrar — modo desligado', 'erro', 'perfis'); }
                return;
            }
            BEST.falhas = 0; BEST.entrouEm = Date.now();
            await dorme(1500);
            try { await bestiarioHunt(h); } catch (e) { /* armadura do bestiário é só refinamento do plano */ }
            await aplicarEmTodos(bestCfg().modelo, h);
        } finally {
            BEST.passo = false;
            if (!BEST.restaurando && _travaJogo === 'Bestiário') _travaJogo = null;
            renderizar();
        }
    }
    function bestCartao() {
        let linhas;
        try { linhas = bestLinhas(); } catch (e) { falhou('bestiário (plano)', e); return ''; }
        if (BEST.ativo || BEST.restaurando) {
            const alvo = BEST.fila[BEST.idx], h = alvo ? pgHuntCat(alvo.id) : null;
            const k = alvo ? pgNum(PROG.best[String(alvo.id)]) : null;
            const l = alvo ? linhas.find(x => x.id === alvo.id) : null;
            const horas = l && k != null ? Math.max(0, alvo.kills - k) / l.abatesH : null;
            const dest = bestDestino();
            return `<div class="pg-cx"><div class="pg-lin"><b>Completar marcos</b><span class="tb-ok">${BEST.restaurando ? 'terminando…' : 'ligado · ' + (BEST.idx + 1) + '/' + BEST.fila.length}</span></div>` +
                (h ? `<div>${BEST.passo ? 'indo para' : 'caçando'} <b>${escHtml(h.title)}</b>: ${pgInt(k)}/${pgInt(alvo.kills)} → ${pgBonusTxt(alvo.bonus, alvo.value)}${horas != null ? ' · ~' + pgHoras(horas) : ''}</div>` : '') +
                `<div class="pg-mut pg-peq">depois: ${BEST.fila.slice(BEST.idx + 1).map(f => escHtml((pgHuntCat(f.id) || {}).title || f.id)).join(', ') || '—'} · no fim: ${dest ? 'upar em ' + escHtml(dest.title) : 'voltar para onde estava'}</div>` +
                `<button type="button" class="tb-bt" id="pg-best-parar" ${BEST.restaurando ? 'disabled' : ''} style="width:100%;margin-top:4px">PARAR e voltar para onde estava</button></div>`;
        }
        const c = bestCfg(), marc = new Set(c.marcados || linhas.filter(l => l.vale).map(l => l.id));
        const linhaHtml = l => {
            const a = l.alvo || l.ultimo;
            return `<label class="pg-lin" style="cursor:pointer;align-items:center"><span><input type="checkbox" data-pg-best="${l.id}" ${marc.has(l.id) ? 'checked' : ''} style="margin:0 4px 0 0;vertical-align:middle">${escHtml(l.hunt.title)} <span class="pg-mut">[${pgInt(pgNum(l.hunt.levelMin) || 1)}]</span>` +
                `<div class="pg-mut pg-peq">${pgInt(l.k)}${l.conhecido ? '' : ' (não lido)'} → ${pgInt(a.kills)} abates · ~${pgHoras(a.horas)}${l.estimado ? ' (est.)' : ''}</div></span>` +
                `<span>${pgBonusTxt(l.bonus, a.value)}<div class="pg-mut pg-peq">≈ ${pgDec(a.ganhoPt, 1)} pt</div></span></label>`;
        };
        const valem = linhas.filter(l => l.vale), outras = linhas.filter(l => !l.vale);
        const fila = pgFilaBestiario(linhas, marc);
        const tot = fila.reduce((s, f) => { const l = linhas.find(x => x.id === f.id); return s + (l.alvo || l.ultimo).horas; }, 0);
        const nv = nivelAtual();
        const huntsNivel = (CAT.hunts || []).filter(x => x && (x.levelMin || 1) <= nv).sort((a, b) => (b.levelMin || 0) - (a.levelMin || 0) || String(a.title).localeCompare(String(b.title)));
        return `<div class="pg-cx"><div class="pg-lin"><b>Completar marcos</b><span class="pg-mut">desligado</span></div>` +
            (valem.length ? valem.map(linhaHtml).join('') : '<div class="pg-mut">nenhum marco compensa agora.</div>') +
            (outras.length ? `<details class="pg-aj" data-k="pg-best-outras"><summary>não compensam (${outras.length})</summary><div>${outras.map(linhaHtml).join('')}</div></details>` : '') +
            `<div class="pg-form"><label for="pg-best-modelo">kit</label><select id="pg-best-modelo">${Object.keys(MODELOS).filter(m => m !== 'boss').map(m => `<option value="${m}"${c.modelo === m ? ' selected' : ''}>${escHtml(nomeModelo(m))}</option>`).join('')}</select></div>` +
            `<div class="pg-form"><label for="pg-best-fim">no fim, upar em</label><select id="pg-best-fim" style="flex:1;min-width:0"><option value="">onde estava antes</option>${huntsNivel.map(x => `<option value="${x.id}"${c.fim === 'hunt' && c.fimHunt === x.id ? ' selected' : ''}>[${x.levelMin || 1}] ${escHtml(x.title)}</option>`).join('')}</select></div>` +
            `<button type="button" class="tb-bt pri" id="pg-best-ir" ${fila.length ? '' : 'disabled'} style="width:100%;margin-top:4px">COMPLETAR (${fila.length}) · ~${pgHoras(tot)}</button>` +
            `<div class="pg-mut pg-peq">${autoHunt().on ? 'Mochila cheia: o Auto Hunt vende e volta para a caçada do bestiário.' : 'Mochila cheia (no limite do Auto Hunt): o próprio modo vende e volta.'} Morte para o modo. Com o jogo fechado o helper não troca de caçada.</div></div>`;
    }
    function ligarBestiario() {
        $$('[data-pg-best]').forEach(cb => { cb.onchange = () => { guardarBestCfg({ marcados: $$('[data-pg-best]').filter(x => x.checked).map(x => parseInt(x.dataset.pgBest)) }); renderizar(); }; });
        const mo = $('#pg-best-modelo'); if (mo) mo.onchange = () => guardarBestCfg({ modelo: mo.value });
        const fi = $('#pg-best-fim'); if (fi) fi.onchange = () => guardarBestCfg(fi.value ? { fim: 'hunt', fimHunt: parseInt(fi.value) } : { fim: 'voltar', fimHunt: null });
        const ir = $('#pg-best-ir'); if (ir) ligarDoisToques(ir, 'best-ir', 'confirmar: trocar de caçada?', bestIniciar);
        const pa = $('#pg-best-parar'); if (pa) ligarDoisToques(pa, 'best-parar', 'confirmar: parar e voltar?', () => { bestEncerrar('parado por você — voltando para onde estava', 'info', 'tudo').catch(e => falhou('bestiário (parar)', e)); });
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
        h += bestCartao();
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
        const tipoTxt = PG_TIPO_PREY_TXT;
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
            const ap = pgAlertaPrey(p);
            if (ap) h += `<div class="${ap.nivel === 'aviso' ? 'pg-atencao' : 'pg-cx tb-ok'}">${ap.nivel === 'aviso' ? '⚠ ' : '✓ '}${escHtml(ap.texto)}</div>`;
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
        try { const j = await buscarAsset('imbuements.json'); if (j && Array.isArray(j.imbuements)) { PROG.imbu = j; PROG.imbuErro = null; } } // v2.13.7: versão dinâmica
        catch (e) { PROG.imbuErro = e.message; }
        if (!PROG.imbu && !PROG.imbuErro) PROG.imbuErro = 'formato inesperado';
        if (ABA === 'progresso') renderizar();
    }

    /* v2.11 — ABA PROGRESSO. Sub-abas para caber nos 300 px da gaveta; o
     * aviso de mochila de chaves cheia aparece em todas. */
    function pgLerInvasaoDom() {
        try {
            const ic = tid('invasao-icone'); if (!ic) return null;
            const topo = tid('invasao-icone-topo'), cont = tid('invasao-icone-contagem');
            return { estado: ic.getAttribute('data-estado') || null, tom: topo ? topo.getAttribute('data-topo') : null, contagem: cont ? cont.textContent : '' };
        } catch (e) { return null; }
    }
    /* v2.14.9 — lembretes no Log, 1× por dia (invasão) e 1× por estado (prey); checados a cada minuto pelas mensagens do jogo */
    function pgLembretes() {
        const agora = Date.now();
        if (PROG.lembT && agora - PROG.lembT < 60000) return;
        PROG.lembT = agora;
        const dia = new Date(agora).toISOString().slice(0, 10);
        const inv = pgAvisoInvasao(pgLerInvasaoDom());
        if (inv && inv.nivel === 'aviso' && ler('prog_lemb_inv', null) !== dia) { guardar('prog_lemb_inv', dia); log('invasão: ' + inv.texto, 'info'); }
        const ap = pgAlertaPrey(PROG.prey);
        const ass = ap ? ap.nivel + ':' + ap.texto.replace(/\d+ min/g, 'min') : null;
        if (ass && ler('prog_lemb_prey', null) !== ass) { guardar('prog_lemb_prey', ass); log('prey: ' + ap.texto, ap.nivel === 'aviso' ? 'erro' : 'ok'); }
    }
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
        /* v2.14.9 — invasão (ícone da cidade) e prey: o aviso aparece em todas as sub-abas; o estado tranquilo só na de Chaves */
        const inv = pgAvisoInvasao(pgLerInvasaoDom());
        if (inv && (inv.nivel === 'aviso' || sub === 'chaves')) h += `<div class="${inv.nivel === 'aviso' ? 'pg-atencao' : 'pg-cx'} pg-peq">${inv.nivel === 'aviso' ? '⚠ ' : inv.nivel === 'ok' ? '✓ ' : ''}${escHtml(inv.texto)}</div>`;
        const ap = sub === 'prey' ? null : pgAlertaPrey(PROG.prey);
        if (ap && ap.nivel === 'aviso') h += `<div class="pg-atencao pg-peq">⚠ prey — ${escHtml(ap.texto)}</div>`;
        h += sub === 'bestiario' ? pgTelaBestiario() : sub === 'offline' ? pgTelaOffline() : sub === 'prey' ? pgTelaPrey() : sub === 'forja' ? pgTelaForja() : pgTelaChaves();
        return h + `<div class="pg-rodape">Só leitura: nada nesta aba envia comando ao jogo.</div></div>`;
    }
    function ligarProgresso() {
        $$('[data-pg-sub]').forEach(b => { b.onclick = () => { guardar('prog_sub', b.dataset.pgSub); renderizar(); }; });
        ligarBestiario();
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
        if (!PROG.timer) { PROG.timer = setInterval(() => {
            try {
                const g = $('#tb-gaveta');
                if (ABA !== 'progresso' || !g || !g.classList.contains('on') || !$('#tb-prog') || PROG.huntId == null) return;
                const f = document.activeElement;
                if (f && f.closest && f.closest('#tb-prog') && /^(INPUT|SELECT)$/.test(f.tagName)) return;
                renderizar();
            } catch { }
        }, 5000); }
    }

    /* =========================================================================
     *  ⭐ v2.11 — ABA MERCADO (pedido do dono, 29/09: vender no mercado dos
     *  jogadores o que está parado na mochila e no depósito, pelo menor preço,
     *  sem abrir item por item na janela do jogo).
     *
     *  Protocolo lido do código público do cliente em 29/09 (chunks 8308-* e
     *  page-*, validador zod) — NÃO visto ao vivo com a conta logada:
     *    market_catalog {}           → market_catalog_result {items:[{name,
     *        sellOrders, minSell, maxBuy, trades30d, copyOrders?, minCopySell?}]}
     *        (UM pedido traz o menor preço de venda de TODOS os itens)
     *    market_list {asset:'ITEM', itemName} → market_list_result {orders:
     *        [{id, side, unitPrice, quantityRemaining}]}   (livro anônimo)
     *    market_stats {itemName}     → {stats:{avg,min,max,samples}|null, …}
     *    market_copies {category|itemName} → {copies:[{orderId, unitPrice,
     *        sellerName, instance:{iid,name,forja}}]} — equipamento forjado é
     *        anunciado por CÓPIA (quantity 1 + iid); a resposta não diz a qual
     *        pedido responde, por isso a fila manda UM pedido de cada vez
     *    market_my_orders {} · market_inbox {} · market_claim {entryId, requestId}
     *    market_history {page, type?: created|buy|sell|cancelled|expired, period?: all|24h|7d|30d, item?} →
     *        market_history_result {query, entries:[{id, type, side, asset, itemName, quantity, unitPrice,
     *        total, fee, at}], pageSize, total} — o HISTÓRICO do próprio jogador (lido do cliente em 06/10;
     *        a ordem fechada SOME de market_my_orders, que só traz OPEN)
     *    market_create {side:'SELL', asset:'ITEM', itemName, unitPrice, quantity,
     *        requestId, iid?} → market_create_result {requestId, order, bag…}
     *    market_cancel {orderId, requestId} → market_cancel_result
     *    depot_withdraw {items:[{name,count,iid?}], requestId} → depot_result
     *    falha: error {code, key} SEM requestId → casada pela janela de tempo do
     *    pedido pendente; se o resultado de verdade chegar logo depois, o erro
     *    era de outra coisa e o resultado vale.
     *  Regras (wiki /mercado, 29/09): taxa de criação 5 % (GET /market/fees),
     *  mínimo 1, paga na hora e NUNCA volta (nem cancelando); ordem vale 3 dias;
     *  até 20 ações por minuto; o mercado NÃO cruza ordens; o ouro da venda cai
     *  na Caixa de entrada e só entra na carteira com "retirar"; só Premium;
     *  item empilhável precisa estar na MOCHILA para anunciar.
     *
     *  Regras do DONO: mesmo item = mesmo nome (forjado: mesma raridade, mesmo
     *  refino e os mesmos atributos nos encaixes — 06/10, o encaixe faz o
     *  preço); preço = menor anúncio de OUTRO vendedor − 1 (se o menor já é
     *  seu, fica o seu); sem concorrente, a média dos últimos 30 dias; sem
     *  histórico, o dono digita (sem preço não anuncia).
     *  PROTEÇÕES: nunca abaixo do NPC (líquido da venda ≤ o que o NPC paga pelo
     *  lote → "vender no NPC", não anuncia); nada de re-anúncio automático (a
     *  revisão só mostra e oferece cancelar); fora da lista o que é selado,
     *  imbuído, protegido, usado, o melhor e a reserva do Equip e a lista
     *  pessoal "nunca vender" do Auto Hunt (as categorias automáticas de lá NÃO
     *  valem aqui: vender equipamento é justamente o objetivo desta aba).
     *  NADA dispara sozinho: ATUALIZAR e REVISAR só leem; ANUNCIAR e cancelar
     *  pedem 2 toques; RESGATAR TUDO é um botão explícito.
     * ====================================================================== */
    /* @@MERCADO-INICIO — funções puras do Mercado; testes/mercado.test.js roda este trecho no node. */
    const MK_TAXA_WIKI = 0.05; // wiki /mercado: 5 % do total, arredondado para baixo, mínimo 1
    const MK_VALOR_MAX = 2e9; // teto de uma ordem (quantidade × preço)
    const MK_ESPACO_MS = 3500; // 1 pedido ao mercado a cada 3,5 s (limite 20 ações/min, com folga)
    const MK_ACOES_FOLGA = 16; // no máximo 16 ações (criar/cancelar/retirar) por minuto — o jogo aceita 20
    const MK_TIPOS_ACAO = ['market_create', 'market_cancel', 'market_execute', 'market_claim'];
    const MK_CATS = { armas: 'Armas', armaduras: 'Armaduras', escudos: 'Escudos', elmos: 'Elmos', pernas: 'Pernas', botas: 'Botas',
                      amuletos: 'Amuletos', aneis: 'Anéis', bolsas: 'Bolsas', pocoes: 'Poções', runas: 'Runas', comida: 'Comida',
                      valiosos: 'Valiosos', despojos: 'Despojos', ferramentas: 'Ferramentas', decoracao: 'Decoração', diversos: 'Diversos' };
    const MK_ORDEM_CAT = Object.keys(MK_CATS);
    /* chave dos catálogos do jogo (/tradeable, /prices e o do mercado vêm em minúsculas) */
    const mkMin = (s) => String(s == null ? '' : s).toLowerCase().trim();
    /* o mesmo normalizador da lista "nunca vender" do Auto Hunt (normNomeItem) */
    const mkNorm = (s) => mkMin(s).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
    const mkNum = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };
    const mkIndexar = (j) => Object.fromEntries(Object.entries(j || {}).map(([k, v]) => [mkMin(k), v]));
    /* = cliente: fee = max(1, floor(preço × qtd × alíquota)) */
    function mkTaxa(preco, qtd, aliquota) {
        const v = Math.floor(Number(preco)) * Math.floor(Number(qtd));
        if (!(v > 0)) return null;
        const r = Number.isFinite(aliquota) && aliquota >= 0 ? aliquota : MK_TAXA_WIKI;
        return Math.max(1, Math.floor(v * r));
    }
    const mkPrecoValido = (p, q) => Number.isInteger(p) && p >= 1 && Number.isInteger(q) && q >= 1 && p * q <= MK_VALOR_MAX;
    /* piso do NPC: o que sobra da venda no mercado (depois da taxa) tem que ser
     * MAIOR que o que o NPC paga pelo mesmo lote; empate vai para o NPC (é na
     * hora, sem taxa e sem esperar comprador). npc = preço unitário de /prices. */
    function mkAbaixoDoNpc(preco, qtd, npc, aliquota) {
        const t = mkTaxa(preco, qtd, aliquota);
        if (t == null) return true;
        if (npc == null) return null;
        return preco * qtd - t <= (Number(npc) || 0) * qtd;
    }
    /* Regra do dono. ref = {outros:[preços de OUTROS vendedores], meus:[meus
     * preços do mesmo item], media: média 30 d}. Empate com o meu menor não é
     * "o menor é meu": o comprador escolhe qualquer um — vai −1. */
    function mkSugerir(ref) {
        ref = ref || {};
        const nums = (a) => (a || []).map(Number).filter(x => Number.isFinite(x) && x > 0);
        const outros = nums(ref.outros), meus = nums(ref.meus);
        const minO = outros.length ? Math.min(...outros) : null, minM = meus.length ? Math.min(...meus) : null;
        if (minO != null && (minM == null || minM >= minO)) return { preco: Math.max(1, minO - 1), origem: 'menor', ref: minO };
        if (minM != null) return { preco: minM, origem: 'meu', ref: minM };
        const med = mkNum(ref.media);
        if (med != null && med > 0) return { preco: Math.max(1, Math.round(med)), origem: 'media', ref: med };
        return { preco: null, origem: 'vazio', ref: null };
    }
    const mkImbuido = (im) => Array.isArray(im) && im.some(x => x != null && x !== false);
    const mkUsado = (w) => !!(w && (typeof w.chargesLeft === 'number' || typeof w.durationLeftMs === 'number'));
    /* "mesmo corte" = mesma raridade e mesmo refino, como o cliente compara as
     * cópias (vy): na peça que eu anuncio, ausente = 0; na anunciada, ausente = −1 */
    const mkRar = (f, pad) => (f && f.raridade != null ? Number(f.raridade) : pad);
    const mkRef = (f, pad) => (f && f.refino != null ? Number(f.refino) : pad);
    const mkMesmoCorteSemEncaixe = (minha, outra) => mkRar(outra, -1) === mkRar(minha, 0) && mkRef(outra, -1) === mkRef(minha, 0);
    /* v2.14.12 — O ENCAIXE FAZ O PREÇO (dono, 06/10: "itens com status têm mais valor"). Ao vivo, dark armor Incomum +0:
     * com regen. de mana saía de 250 a 500 mil; com resistência, de 9 a 94 mil. Comparando só raridade e refino, o helper
     * pôs 32 cópias da conta a 9.999 — a de regen. de mana junto. Agora "mesmo corte" = mesma raridade, mesmo refino E os
     * MESMOS atributos (ids normalizados, em qualquer ordem; o valor da linha não entra). Anúncio sem a lista de atributos
     * só casa com peça sem atributos: na dúvida, não serve de referência. */
    const mkIdAtr = (a) => String((a && a.id) || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const mkAtrIds = (f) => (f && Array.isArray(f.atributos) ? f.atributos.map(mkIdAtr).filter(Boolean).sort() : []);
    const mkMesmoCorte = (minha, outra) => mkMesmoCorteSemEncaixe(minha, outra) && mkAtrIds(minha).join('|') === mkAtrIds(outra).join('|');
    const MK_RAR = ['comum', 'incomum', 'raro', 'épico', 'lendário', 'mítico'];
    const mkCorteTxt = (f) => (MK_RAR[mkRar(f, 0)] || 'raridade ' + mkRar(f, 0)) + ' +' + mkRef(f, 0);
    /* "regen mana 1,3 + resist gelo 0,8" — o que a peça tem escrito nos encaixes ('' = nenhum) */
    const mkEncaixeTxt = (f) => (f && Array.isArray(f.atributos) ? f.atributos : []).map(a => { const id = mkIdAtr(a).replace(/_/g, ' '); const v = a && a.valor != null ? String(a.valor).replace('.', ',') : ''; return id ? id + (v ? ' ' + v : '') : ''; }).filter(Boolean).join(' + ');
    const mkFmt = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : Math.round(Number(n)).toLocaleString('pt-BR'));
    const mkAbertaVenda = (o) => !!(o && o.status === 'OPEN' && o.side === 'SELL' && (o.asset == null || o.asset === 'ITEM') && Number(o.quantityRemaining) > 0);
    const mkChaveCopias = (d) => (d && d.category ? 'cat:' + d.category : 'item:' + mkMin(d && d.itemName));
    const mkPremium = (ate, agora) => (ate === undefined ? null : !ate ? false : (Number.isFinite(Date.parse(ate)) && Date.parse(ate) > agora));
    const mkAcoesNoMinuto = (envios, agora) => (envios || []).filter(x => x && x.acao && agora - x.t < 60000).length;
    /* quanto esperar antes do próximo pedido: 3,5 s desde o último, a pausa
     * depois de um rate_limited e — se for AÇÃO — no máximo 16 no minuto */
    function mkEsperaNecessaria(s) {
        const agora = s.agora;
        let w = Math.max(0, (s.ultimo || 0) + MK_ESPACO_MS - agora, (s.pausaAte || 0) - agora);
        if (s.acao) {
            const ac = (s.envios || []).filter(x => x && x.acao && agora - x.t < 60000).map(x => x.t).sort((a, b) => a - b);
            if (ac.length >= MK_ACOES_FOLGA) w = Math.max(w, ac[ac.length - MK_ACOES_FOLGA] + 60000 - agora);
        }
        return w;
    }
    /* depósito → mochila: empilhável sai por nome e quantidade (um pedido por
     * nome), peça com iid sai uma a uma com o iid */
    function mkRetirar(p) {
        const r = p.depSolto ? [{ name: p.nomeDep || p.nome, count: p.depSolto }] : [];
        return r.concat(p.depInst);
    }
    const mkPendMedia = (nome, n, c, e) => {
        const s = e.stats && e.stats[n];
        if (s && !s.erro) return { media: s.stats && s.stats.avg != null ? s.stats.avg : null, pendente: null };
        /* sem linha no catálogo ou sem negócio em 30 dias: não há média para pedir */
        if (!c || !(Number(c.trades30d) > 0)) return { media: null, pendente: null };
        return { media: null, pendente: { tipo: 'market_stats', data: { itemName: nome }, chave: 'stats:' + n, cache: 'stats', alvo: n, rotulo: 'média de ' + nome, erro: s ? s.erro : null } };
    };
    /* Referência de um item EMPILHÁVEL. O catálogo dá o menor preço de venda
     * de todos (incluindo os meus): só é preciso abrir o livro quando o menor
     * pode ser meu E há ordens de outros vendedores. */
    function mkRefPilha(p, e, minhas, meusIds) {
        const n = p.n;
        if (!e.catalogo) return { ref: {}, pendente: { tipo: null, chave: 'catalogo', rotulo: 'catálogo do mercado' } };
        const c = e.catalogo[n] || null;
        const mine = minhas.filter(o => mkMin(o.itemName) === n && !o.forja);
        const meus = mine.map(o => o.unitPrice);
        const nVenda = c ? Number(c.sellOrders) || 0 : 0;
        let outros = [], pendente = null;
        if (c && nVenda > 0 && c.minSell != null) {
            if (!mine.length || c.minSell < Math.min(...meus)) outros = [c.minSell];
            else if (nVenda > mine.length) {
                const l = e.livros && e.livros[n];
                if (l && !l.erro) outros = (l.orders || []).filter(o => o && o.side === 'SELL' && !meusIds.has(o.id)).map(o => o.unitPrice);
                else pendente = { tipo: 'market_list', data: { asset: 'ITEM', itemName: p.nome }, chave: 'livro:' + n, cache: 'livros', alvo: n, rotulo: 'livro de ' + p.nome, erro: l ? l.erro : null };
            }
        }
        let media = null;
        if (!pendente && !outros.length && !meus.length) ({ media, pendente } = mkPendMedia(p.nome, n, c, e));
        /* o mercado não cruza ordens: anunciar a ≤ uma COMPRA aberta só deixa a
         * ordem parada — aceitar a compra no jogo é na hora e sem taxa (wiki) */
        return { ref: { outros, meus, media }, pendente, compra: c && c.maxBuy != null ? mkNum(c.maxBuy) : null };
    }
    /* Referência de uma CÓPIA forjada: só cópias do mesmo corte (raridade e
     * refino), tirando as minhas (orderId nas minhas ordens). Um pedido
     * market_copies por CATEGORIA serve todas as peças dela. */
    function mkRefCopia(x, e, minhas, meusIds, cat) {
        const n = x.n;
        if (!e.catalogo) return { ref: {}, pendente: { tipo: null, chave: 'catalogo', rotulo: 'catálogo do mercado' } };
        const c = e.catalogo[n] || null;
        const minhasDoItem = minhas.filter(o => mkMin(o.itemName) === n && o.forja);
        const meus = minhasDoItem.filter(o => mkMesmoCorte(x.forja, o.forja)).map(o => o.unitPrice);
        let outros = [], parecidas = [], pendente = null;
        if (c && (Number(c.copyOrders) || 0) > minhasDoItem.length) {
            const data = cat ? { category: cat } : { itemName: x.nome }, k = mkChaveCopias(data);
            const cp = e.copias && e.copias[k];
            if (cp && !cp.erro) {
                const doItem = (cp.copies || []).filter(y => y && (mkMin(y.itemName) === n || mkMin(y.instance && y.instance.name) === n) && !meusIds.has(y.orderId));
                outros = doItem.filter(y => mkMesmoCorte(x.forja, y.instance && y.instance.forja)).map(y => y.unitPrice);
                /* mesma raridade e refino com OUTROS encaixes: só para a nota (nunca para o preço) */
                parecidas = doItem.filter(y => mkMesmoCorteSemEncaixe(x.forja, y.instance && y.instance.forja)).map(y => Number(y.unitPrice)).filter(v => v > 0);
            } else pendente = { tipo: 'market_copies', data, chave: k, cache: 'copias', alvo: k, rotulo: 'cópias de ' + (cat ? (MK_CATS[cat] || cat) : x.nome), erro: cp ? cp.erro : null };
        }
        /* v2.11.8 — SEM MÉDIA PARA CÓPIA. A média de 30 dias é do item inteiro e
         * mistura todas as raridades: ao vivo (29/09) o simple dress COMUM saía a
         * 104.790 e o crystal ring comum a 83.778 (o incomum estava a 399) — anúncio
         * que nunca vende e cuja taxa de ~5 % não volta. Sem cópia do mesmo corte à
         * venda, fica sem sugestão: o dono digita. v2.14.12 — "mesmo corte" inclui o
         * encaixe; a nota diz a faixa dos outros encaixes da mesma raridade, para o
         * dono ter por onde começar. */
        const encaixe = mkEncaixeTxt(x.forja);
        const nota = !pendente && !outros.length && !meus.length
            ? `nenhuma cópia ${mkCorteTxt(x.forja)}${encaixe ? ' com ' + encaixe : ' sem encaixe'} à venda — digite o preço` +
              (parecidas.length ? ` (outros encaixes ${mkCorteTxt(x.forja)}: de ${mkFmt(Math.min(...parecidas))} a ${mkFmt(Math.max(...parecidas))})` : ' (a média de 30 dias mistura todas as raridades)')
            : null;
        return { ref: { outros, meus, media: null }, pendente, nota, encaixe: encaixe || null };
    }
    function mkLinha(b, r, e, marcados) {
        const dig = e.digitados ? e.digitados[b.chave] : undefined;
        const temDig = dig != null && String(dig).trim() !== '';
        const sug = r.pendente ? { preco: null, origem: 'pendente', ref: null } : mkSugerir(r.ref);
        const bruto = temDig ? Math.floor(Number(dig)) : sug.preco;
        const preco = Number.isFinite(bruto) ? bruto : null;
        const origem = temDig ? 'digitado' : sug.origem;
        const npc = e.npc ? (mkNum(e.npc[b.n]) || 0) : null;
        const ok = preco != null && mkPrecoValido(preco, b.qtd);
        const taxa = ok ? mkTaxa(preco, b.qtd, e.taxa) : null;
        const liquido = ok ? preco * b.qtd - taxa : null;
        const abaixo = ok && npc != null ? liquido <= npc * b.qtd : null;
        const bloqueio = !e.tradeable ? 'a lista de negociáveis (/tradeable) não carregou — ATUALIZAR'
            : npc == null ? 'o preço do NPC (/prices) não carregou — ATUALIZAR'
            : b.bloq ? b.bloq
            : origem === 'pendente' ? (r.pendente.erro ? 'não consegui ler o preço — digite um' : 'falta ler o preço — ATUALIZAR')
            : preco == null ? (temDig ? 'preço inválido (inteiro ≥ 1)' : 'sem referência de preço — digite um')
            : !ok ? 'preço inválido (inteiro ≥ 1, total até 2 bilhões)'
            : abaixo ? 'vender no NPC' : null;
        const nota = [r.nota, r.compra != null && preco != null && r.compra >= preco ? `há COMPRA aberta a ${r.compra} — aceitar no mercado do jogo é na hora e sem taxa` : null].filter(Boolean).join(' · ') || null;
        return Object.assign(b, { sug, preco, origem, nota, encaixe: r.encaixe || null, compra: r.compra != null ? r.compra : null, taxa, liquido, npc, npcTotal: npc != null ? npc * b.qtd : null,
                                  abaixoNpc: abaixo, bloqueio, marcado: !bloqueio && marcados.has(b.chave) });
    }
    /* A LISTA. e = {bag {nome: qtd}, bagInst [{iid,name,forja,wear,imbuements}],
     * depot [{itemName,count,iid?,forja?,wear?,imbuements?}], tradeable, npc,
     * taxa, catalogo {nome: item}, minhas [ordens], livros, copias, stats,
     * prot {nomes, iids}, nunca [nomes], equip {usadas, reservas} | null,
     * naCidade, digitados {chave: preço}, marcados [chave]}.
     * → {linhas, fora, plano {itens, n, taxa, bruto, liquido, assinatura}, pendencias} */
    function mkMontar(e) {
        e = e || {};
        const trad = e.tradeable || null;
        const cat = (n) => (trad && trad[n] && trad[n].cat) || null;
        const protN = new Set(((e.prot && e.prot.nomes) || []).map(mkMin)), protI = new Set((e.prot && e.prot.iids) || []);
        const nunca = new Set((e.nunca || []).map(mkNorm).filter(Boolean));
        const eq = e.equip ? new Set([...(e.equip.usadas || []), ...(e.equip.reservas || [])]) : null;
        /* v2.11.20 — LISTA BRANCA (auditoria 30/09): a cópia de equipamento só pode ser marcada se a última
         * leitura do Equip a pôs nas SOBRAS. Antes o Mercado só barrava o que o Equip conhecia (melhor,
         * reserva): peça que entrou depois da leitura, peça do depósito com o depósito não lido, peça de
         * base desconhecida e base de forja (épico+) passavam como vendáveis. */
        const sobras = e.equip && Array.isArray(e.equip.sobras) ? new Set(e.equip.sobras) : null;
        const naCidade = e.naCidade !== false, marcados = new Set(e.marcados || []);
        const fora = [], pilhas = new Map(), copias = [];
        const barrar = (nome, qtd, motivo, iid) => fora.push({ nome: String(nome), n: mkMin(nome), qtd: qtd || 1, motivo, iid: iid || null });
        const motivoNome = (n) => (trad && !trad[n] ? 'não é negociável no mercado'
            : protN.has(n) ? 'protegido (cadeado)'
            : nunca.has(mkNorm(n)) ? 'sua lista "nunca vender" (Auto Hunt)' : null);
        const motivoPeca = (x) => (x.iid && protI.has(x.iid) ? 'protegido (cadeado)'
            : x.forja && x.forja.selado === true ? 'selado — purifique antes'
            : mkImbuido(x.imbuements) ? 'imbuído'
            : mkUsado(x.wear) ? 'usado (cargas ou tempo gastos)'
            : eq && x.iid && eq.has(x.iid) ? 'melhor ou reserva no Equip' : null);
        const pilha = (nome) => {
            const n = mkMin(nome);
            let p = pilhas.get(n);
            if (!p) pilhas.set(n, p = { nome: String(nome), n, mochila: 0, deposito: 0, depSolto: 0, nomeDep: null, depInst: [] });
            return p;
        };
        /* peças com iid (mochila e depósito) vêm à parte; a contagem da mochila
         * por nome inclui as peças, então elas saem dela */
        const pecas = [], naMochila = {};
        for (const x of (e.bagInst || [])) {
            if (!x || !x.iid || !x.name) continue;
            pecas.push({ iid: x.iid, nome: String(x.name), n: mkMin(x.name), forja: x.forja, wear: x.wear, imbuements: x.imbuements, lugar: 'mochila', count: 1 });
            naMochila[mkMin(x.name)] = (naMochila[mkMin(x.name)] || 0) + 1;
        }
        for (const d of (e.depot || [])) {
            if (!d || !d.itemName || !(Number(d.count) > 0)) continue;
            if (d.iid) { pecas.push({ iid: d.iid, nome: String(d.itemName), n: mkMin(d.itemName), forja: d.forja, wear: d.wear, imbuements: d.imbuements, lugar: 'depósito', count: Number(d.count) || 1 }); continue; }
            const n = mkMin(d.itemName), m = motivoNome(n);
            if (m) { barrar(d.itemName, d.count, m); continue; }
            if (trad && trad[n] && trad[n].forjavel) { barrar(d.itemName, d.count, 'equipamento sem cópia identificada (sem iid) — o jogo só anuncia cópia'); continue; }
            const p = pilha(d.itemName); p.deposito += Number(d.count); p.depSolto += Number(d.count); if (!p.nomeDep) p.nomeDep = String(d.itemName);
        }
        for (const [nome, qtd] of Object.entries(e.bag || {})) {
            const n = mkMin(nome), solto = Math.max(0, (Number(qtd) || 0) - (naMochila[n] || 0));
            if (!solto) continue;
            const m = motivoNome(n);
            if (m) { barrar(nome, solto, m); continue; }
            if (trad && trad[n] && trad[n].forjavel) { barrar(nome, solto, 'equipamento sem cópia identificada (sem iid) — o jogo só anuncia cópia'); continue; }
            const p = pilha(nome); p.mochila += solto; p.nome = String(nome); // o nome da mochila é o que vai no anúncio
        }
        for (const x of pecas) {
            const m = motivoNome(x.n) || motivoPeca(x);
            if (m) { barrar(x.nome, x.count, m, x.iid); continue; }
            if (trad && trad[x.n] && trad[x.n].forjavel) {
                if (!x.forja) { barrar(x.nome, 1, 'sem forja — o jogo não anuncia esta peça', x.iid); continue; }
                if (sobras && !sobras.has(x.iid)) { barrar(x.nome, 1, 'o Equip não pôs nas sobras (melhor, reserva, encaixe bom, base de forja ou peça que ele não avaliou)', x.iid); continue; }
                copias.push(x);
            } else {
                const p = pilha(x.nome);
                if (x.lugar === 'mochila') p.mochila += x.count;
                else { p.deposito += x.count; p.depInst.push({ name: x.nome, count: x.count, iid: x.iid }); }
            }
        }
        const minhas = (e.minhas || []).filter(mkAbertaVenda);
        const meusIds = new Set(minhas.map(o => o.id));
        const linhas = [], pend = new Map();
        const somar = (r) => { const p = r.pendente; if (p && p.tipo && !p.erro && !pend.has(p.chave)) pend.set(p.chave, p); };
        for (const p of pilhas.values()) {
            const qtd = p.mochila + (naCidade ? p.deposito : 0);
            const r = mkRefPilha(p, e, minhas, meusIds); somar(r);
            linhas.push(mkLinha({ chave: 'n:' + p.n, tipo: 'pilha', nome: p.nome, n: p.n, cat: cat(p.n), qtd, mochila: p.mochila, deposito: p.deposito,
                retirar: naCidade ? mkRetirar(p) : [], iid: null, forja: null, pendente: r.pendente,
                bloq: qtd ? null : 'está no depósito — retirar só na cidade' }, r, e, marcados));
        }
        for (const x of copias) {
            const r = mkRefCopia(x, e, minhas, meusIds, cat(x.n)); somar(r);
            const noDep = x.lugar === 'depósito';
            linhas.push(mkLinha({ chave: 'i:' + x.iid, tipo: 'copia', nome: x.nome, n: x.n, cat: cat(x.n), qtd: 1, mochila: noDep ? 0 : 1, deposito: noDep ? 1 : 0,
                retirar: noDep && naCidade ? [{ name: x.nome, count: 1, iid: x.iid }] : [], iid: x.iid, forja: x.forja, pendente: r.pendente,
                bloq: !e.equip ? 'rode ATUALIZAR no Equip antes (protege o melhor e a reserva de cada um)' : noDep && !naCidade ? 'está no depósito — retirar só na cidade' : null }, r, e, marcados));
        }
        const ordCat = (c) => { const i = MK_ORDEM_CAT.indexOf(c); return i < 0 ? 99 : i; };
        linhas.sort((a, b) => ordCat(a.cat) - ordCat(b.cat) || a.n.localeCompare(b.n) || mkRar(b.forja, 0) - mkRar(a.forja, 0) || mkRef(b.forja, 0) - mkRef(a.forja, 0) || String(a.iid).localeCompare(String(b.iid)));
        const itens = linhas.filter(l => l.marcado).map(l => ({ chave: l.chave, tipo: l.tipo, nome: l.nome, n: l.n, qtd: l.qtd, preco: l.preco, iid: l.iid,
                                                             retirar: l.retirar, npc: l.npc, taxa: l.taxa, liquido: l.liquido }));
        const soma = (k) => itens.reduce((s, i) => s + (i[k] || 0), 0);
        const plano = { itens, n: itens.length, taxa: soma('taxa'), liquido: soma('liquido'), bruto: itens.reduce((s, i) => s + i.preco * i.qtd, 0),
                        assinatura: itens.map(i => i.chave + '|' + i.qtd + '|' + i.preco).join(';') };
        /* livro e cópias primeiro: são eles que dizem se ainda falta a média */
        const pendencias = [...pend.values()].sort((a, b) => (a.tipo === 'market_stats') - (b.tipo === 'market_stats'));
        return { linhas, fora, plano, pendencias };
    }
    /* REVISAR MEUS ANÚNCIOS: para cada ordem aberta minha, o menor preço de
     * OUTRO vendedor e o custo de refazer (a taxa já paga não volta + a taxa
     * nova a menor−1). Nada é refeito: só mostra. */
    function mkRevisao(e) {
        e = e || {};
        const abertas = (e.minhas || []).filter(o => o && o.status === 'OPEN');
        const vendas = abertas.filter(mkAbertaVenda), meusIds = new Set(abertas.map(o => o.id));
        const pend = new Map();
        const linhas = abertas.map(o => {
            const n = mkMin(o.itemName);
            const b = { id: o.id, nome: o.itemName || '?', n, lado: o.side, preco: o.unitPrice, qtd: Number(o.quantityRemaining) || 0, total: o.quantityTotal,
                        taxaPaga: o.creationFeePaid != null ? o.creationFeePaid : null, expira: o.expiresAt || null, forja: o.forja || null };
            if (!mkAbertaVenda(o)) return Object.assign(b, { situacao: o.side === 'BUY' ? 'compra' : 'vazia', menor: null, novo: null, taxaNova: null });
            let outros = null, pendente = null;
            const c = e.catalogo ? e.catalogo[n] || null : undefined;
            if (c === undefined) pendente = { tipo: null, chave: 'catalogo' };
            else if (o.forja) {
                const cat = e.tradeable && e.tradeable[n] && e.tradeable[n].cat;
                const minhasCop = vendas.filter(x => mkMin(x.itemName) === n && x.forja).length;
                if (!c || (Number(c.copyOrders) || 0) <= minhasCop) outros = [];
                else {
                    const data = cat ? { category: cat } : { itemName: o.itemName }, k = mkChaveCopias(data), cp = e.copias && e.copias[k];
                    if (cp && !cp.erro) { outros = (cp.copies || []).filter(y => y && (mkMin(y.itemName) === n || mkMin(y.instance && y.instance.name) === n)
                        && !meusIds.has(y.orderId) && mkMesmoCorte(o.forja, y.instance && y.instance.forja)).map(y => y.unitPrice); }
                    else pendente = { tipo: 'market_copies', data, chave: k, cache: 'copias', alvo: k, rotulo: 'cópias de ' + (cat ? (MK_CATS[cat] || cat) : o.itemName), erro: cp ? cp.erro : null };
                }
            } else {
                const mine = vendas.filter(x => mkMin(x.itemName) === n && !x.forja), nV = c ? Number(c.sellOrders) || 0 : 0;
                if (!c || c.minSell == null || nV <= mine.length) outros = [];
                else if (c.minSell < Math.min(...mine.map(x => x.unitPrice))) outros = [c.minSell];
                else {
                    const l = e.livros && e.livros[n];
                    if (l && !l.erro) outros = (l.orders || []).filter(y => y && y.side === 'SELL' && !meusIds.has(y.id)).map(y => y.unitPrice);
                    else pendente = { tipo: 'market_list', data: { asset: 'ITEM', itemName: o.itemName }, chave: 'livro:' + n, cache: 'livros', alvo: n, rotulo: 'livro de ' + o.itemName, erro: l ? l.erro : null };
                }
            }
            if (pendente && pendente.tipo && !pendente.erro && !pend.has(pendente.chave)) pend.set(pendente.chave, pendente);
            const menor = outros && outros.length ? Math.min(...outros) : null;
            const situacao = pendente ? (pendente.erro ? 'erro' : 'pendente') : menor == null ? 'sozinho' : o.unitPrice < menor ? 'menor' : o.unitPrice === menor ? 'empate' : 'barato';
            const novo = menor != null && situacao !== 'menor' ? Math.max(1, menor - 1) : null;
            return Object.assign(b, { situacao, menor, novo, taxaNova: novo != null ? mkTaxa(novo, b.qtd, e.taxa) : null,
                                      encaixe: o.forja ? mkEncaixeTxt(o.forja) || null : null, folga: menor != null && o.unitPrice < menor ? menor - o.unitPrice : null });
        });
        return { linhas, pendencias: [...pend.values()] };
    }
    /* v2.14.12 — VENDIDOS (dono, 06/10: "para eu saber quais itens foram vendidos que eu anunciei"). market_my_orders só
     * traz ordens OPEN: a vendida some. O histórico do jogador (market_history, type 'sell') diz item, quantidade, preço,
     * total, taxa e hora — sem a forja (uma dark armor vendida é "dark armor"). Agrupa por item e preço, a mais recente
     * primeiro. periodoMs (opcional) corta o que é mais velho que agora − periodoMs. */
    function mkVendas(entries, agora, periodoMs) {
        const v = (entries || []).filter(x => x && x.type === 'sell' && x.itemName && !(periodoMs > 0 && agora > 0 && Number(x.at) > 0 && agora - Number(x.at) > periodoMs));
        const por = new Map();
        for (const x of v) {
            const k = mkMin(x.itemName) + '|' + (Number(x.unitPrice) || 0);
            const g = por.get(k) || { nome: String(x.itemName), n: mkMin(x.itemName), preco: Number(x.unitPrice) || 0, qtd: 0, total: 0, taxa: 0, vezes: 0, ultimo: 0 };
            g.qtd += Number(x.quantity) || 0; g.total += Number(x.total) || 0; g.taxa += Number(x.fee) || 0; g.vezes++;
            g.ultimo = Math.max(g.ultimo, Number(x.at) || 0);
            por.set(k, g);
        }
        const linhas = [...por.values()].sort((a, b) => b.ultimo - a.ultimo || b.total - a.total);
        const soma = (k) => linhas.reduce((t, l) => t + l[k], 0);
        return { linhas, n: v.length, unidades: soma('qtd'), total: soma('total'), taxa: soma('taxa') };
    }
    /* @@MERCADO-PURO-FIM */

    /* ---- estado, socket e fila do Mercado (em memória: o jogo manda de novo a cada conexão) ---- */
    const MK_RESPOSTA = { market_catalog: 'market_catalog_result', market_my_orders: 'market_my_orders_result', market_inbox: 'market_inbox_result',
                          market_list: 'market_list_result', market_stats: 'market_stats_result', market_copies: 'market_copies_result',
                          market_create: 'market_create_result', market_cancel: 'market_cancel_result', market_claim: 'market_claim_result',
                          market_history: 'market_history_result',
                          depot_withdraw: 'depot_result', forge_salvage_batch: 'forge_salvage_batch_result' };
    const MK_PRAZO_MS = 8000; // sem resposta nisso = para (um anúncio pode ter passado: conferir antes de repetir)
    const MK_GRACA_ERRO_MS = 1200; // erro sem requestId: espera o resultado de verdade chegar antes de acreditar
    const MK_PAUSA_LIMITE_MS = 20000; // rate_limited: pausa e tenta de novo UMA vez
    const MK_CONF_MS = 4000; // janela do 2º toque
    /* o que faz parar a fila inteira (os próximos falhariam igual) */
    const MK_PARA_TUDO = new Set(['premium_required', 'unauthorized', 'forbidden', 'invalid_message', 'rate_limited', 'sem_resposta', 'sem_socket']);
    const MK_ERROS = {
        premium_required: 'o mercado é só Premium (o servidor recusou)', insufficient_item: 'o item não está na mochila nessa quantidade',
        invalid_price: 'preço inválido', invalid_quantity: 'quantidade inválida', order_value_too_large: 'valor total acima de 2 bilhões',
        item_not_tradeable: 'não é negociável no mercado', item_protected: 'item protegido (cadeado)', rate_limited: 'limite de 20 ações por minuto',
        insufficient_gold: 'ouro normal insuficiente para a taxa', selo: 'item selado', lacre: 'item lacrado', instancia_usada: 'item usado',
        trade_reserved: 'item oferecido numa troca aberta', vinculo: 'item vinculado', order_unavailable: 'a ordem não está mais aberta',
        own_order: 'é a sua própria ordem', entry_unavailable: 'entrega não disponível', sem_espaco: 'sem espaço na mochila',
        bag_capacity_exceeded: 'sem capacidade na mochila', insufficient_capacity: 'sem capacidade na mochila', depot_full: 'depósito cheio',
        not_in_city: 'só na cidade', gold_overflow: 'passaria do limite de ouro da conta', invalid_message: 'o servidor não entendeu o pedido',
        internal: 'erro interno do servidor', sem_resposta: 'o servidor não respondeu em 8 s — confira em "Meus anúncios" antes de repetir',
        sem_socket: 'socket do jogo não está aberto', sem_dado: 'a resposta não trouxe o dado esperado'
    };
    const mkErroTexto = (c) => MK_ERROS[c] ? MK_ERROS[c] + ' (' + c + ')' : String(c);
    const MK_ORIGEM = { menor: 'menor −1', meu: 'seu anúncio', media: 'média 30 d', vazio: 'sem referência', digitado: 'digitado', pendente: 'falta ler' };
    const MK_MOTIVO_CAIXA = { trade_proceeds: 'venda', order_cancelled: 'ordem cancelada', order_expired: 'ordem expirada', capacity: 'não coube', offline: 'offline' };
    const MK = { premiumAte: undefined, bag: null, bagInst: null, bag_t: 0, protMeta: { nomes: [], iids: [] }, protInv: { nomes: [], iids: [] },
                 taxa: null, taxaWiki: false, tradeable: null, npc: null, restErro: null,
                 catalogo: null, catalogo_t: 0, minhas: null, minhas_t: 0, inbox: null, inbox_t: 0, livros: {}, copias: {}, stats: {},
                 envios: [], ultimoEnvio: 0, pausaAte: 0, pend: null, ocupado: null, progresso: null, parar: false, erro: null, t: 0,
                 digitados: {}, marcados: new Set(), conf: null, foco: null, pintadas: [], ordPintadas: [], revisao: null,
                 vendas: null, vendas_t: 0, vendasErro: null }; // v2.14.12 — histórico de vendas (market_history, type sell)
    const mkRid = () => ((window.crypto && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : 'tb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
    function mkAnotarProt(alvo, nomes, iids) {
        if (Array.isArray(nomes)) alvo.nomes = nomes.filter(x => typeof x === 'string');
        if (Array.isArray(iids)) alvo.iids = iids.filter(x => typeof x === 'string');
    }
    const mkProtegidos = () => ({ nomes: MK.protMeta.nomes.concat(MK.protInv.nomes), iids: MK.protMeta.iids.concat(MK.protInv.iids) });

    /* Uma linha em observarEnviado: conta TODO market_* que sai (do helper ou
     * da janela do jogo) — o limite de 20 ações/min é por conta. */
    function mkObservarEnviado(o) {
        if (!o || typeof o.type !== 'string' || !/^market_/.test(o.type)) return;
        const agora = Date.now();
        MK.envios = MK.envios.filter(x => agora - x.t < 120000);
        MK.envios.push({ t: agora, tipo: o.type, acao: MK_TIPOS_ACAO.includes(o.type) });
    }
    /* Uma linha em observarRecebido: premium, mochila, protegidos e as
     * respostas do mercado (só guarda; quem decide é a fila). */
    function observarMercado(o) {
        if (!o || typeof o.type !== 'string') return;
        const d = o.data && typeof o.data === 'object' ? o.data : null;
        if (!d) return;
        const t = o.type, agora = Date.now();
        if (t === 'welcome' && d.account && typeof d.account === 'object' && 'premiumUntil' in d.account) MK.premiumAte = d.account.premiumUntil || null;
        if (t === 'meta_result' && typeof d.premiumUntil === 'string') MK.premiumAte = d.premiumUntil;
        const meta = d.meta && typeof d.meta === 'object' ? d.meta : t === 'meta_state' ? d : null;
        if (meta && (Array.isArray(meta.protected) || Array.isArray(meta.protectedIids))) mkAnotarProt(MK.protMeta, meta.protected, meta.protectedIids);
        const inv = Array.isArray(d.inventory) ? d.inventory : (d.state && Array.isArray(d.state.inventory) ? d.state.inventory : null);
        if (inv) {
            const nomes = [], iids = [];
            for (const x of inv) if (x && x.protected === true && x.name) { if (x.iid) iids.push(x.iid); else nomes.push(x.name); }
            mkAnotarProt(MK.protInv, nomes, iids);
        }
        if (d.bag && typeof d.bag === 'object' && !Array.isArray(d.bag)) {
            MK.bag = Object.assign({}, d.bag); MK.bag_t = agora;
            if (Array.isArray(d.bagInstances)) MK.bagInst = clonar(d.bagInstances);
        }
        /* depot_result traz o depósito novo (depois do depot_withdraw): o Equip também lê ESTADO_WS.depot */
        if (t === 'depot_result' && Array.isArray(d.entries)) { ESTADO_WS.depot = { entries: clonar(d.entries), used: d.used, total: d.total }; ESTADO_WS.depot_t = agora; }
        if (t === 'market_catalog_result' && Array.isArray(d.items)) { MK.catalogo = Object.fromEntries(d.items.filter(x => x && x.name).map(x => [mkMin(x.name), x])); MK.catalogo_t = agora; }
        else if (t === 'market_my_orders_result' && Array.isArray(d.orders)) {
            /* v2.13.5 — páginas de 50 (01/10: 55 abertas, só a página 0 era lida): a 0 recomeça, as outras somam */
            const pg = Number(d.page) || 0;
            if (pg > 0 && Array.isArray(MK.minhas)) { const ja = new Set(MK.minhas.map(x => x.id)); MK.minhas = MK.minhas.concat(clonar(d.orders).filter(x => !ja.has(x.id))); }
            else MK.minhas = clonar(d.orders);
            MK.minhas_t = agora;
        }
        else if (t === 'market_inbox_result' && Array.isArray(d.entries)) { MK.inbox = clonar(d.entries); MK.inbox_t = agora; }
        else if (t === 'market_list_result' && d.asset !== 'COIN' && d.itemName) MK.livros[mkMin(d.itemName)] = { orders: clonar(d.orders || []), t: agora };
        else if (t === 'market_stats_result' && d.itemName) MK.stats[mkMin(d.itemName)] = { stats: d.stats || null, t: agora };
        else if (t === 'market_copies_result' && Array.isArray(d.copies) && MK.pend && MK.pend.tipo === 'market_copies') MK.copias[mkChaveCopias(MK.pend.data)] = { copies: clonar(d.copies), t: agora };
        else if (t === 'market_create_result' && d.order && Array.isArray(MK.minhas)) { if (!MK.minhas.some(x => x.id === d.order.id)) MK.minhas.push(clonar(d.order)); }
        else if (t === 'market_cancel_result' && d.order && Array.isArray(MK.minhas)) MK.minhas = MK.minhas.filter(x => x.id !== d.order.id);
        else if (t === 'market_claim_result' && d.entry && Array.isArray(MK.inbox)) MK.inbox = MK.inbox.filter(x => x.id !== d.entry.id);
        const p = MK.pend;
        if (p && !p.res) {
            if (t === p.espera && p.casa(d)) p.res = { ok: true, data: d };
            else if (t === 'error' && !p.erro && agora - p.t0 <= MK_PRAZO_MS) p.erro = { code: String(d.code || d.key || '?'), key: d.key || null, t: agora };
        }
        if (ABA === 'mercado' && !MK.ocupado && (/^market_/.test(t) || t === 'depot_result')) {
            const f = document.activeElement;
            if (!(f && f.closest && f.closest('#tb-mk') && f.tagName === 'INPUT')) renderizar(); // não tira o foco de quem digita
        }
    }
    const mkCasador = (tipo, data) => (data && data.requestId ? (d) => d.requestId === data.requestId
        : tipo === 'market_list' || tipo === 'market_stats' ? (d) => mkMin(d.itemName) === mkMin(data.itemName) : () => true);
    async function mkEsperarVez(acao) {
        for (let g = 0; g < 600; g++) {
            const w = mkEsperaNecessaria({ agora: Date.now(), ultimo: MK.ultimoEnvio, pausaAte: MK.pausaAte, envios: MK.envios, acao });
            if (w <= 0) return;
            await dorme(Math.min(w, 1000));
        }
    }
    /* UM pedido de cada vez, no ritmo; devolve {ok, data} ou {erro: code}.
     * rate_limited: pausa 20 s e repete UMA vez com o MESMO requestId (se o
     * primeiro tivesse passado, o servidor reconhece a repetição). */
    async function mkPedir(tipo, data) {
        for (let tentativa = 0; tentativa < 2; tentativa++) {
            await mkEsperarVez(MK_TIPOS_ACAO.includes(tipo));
            if (!socketAberto()) return { erro: 'sem_socket' };
            const p = MK.pend = { tipo, data, espera: MK_RESPOSTA[tipo], casa: mkCasador(tipo, data), t0: Date.now(), res: null, erro: null };
            try { enviarWS({ type: tipo, data }); } catch { MK.pend = null; return { erro: 'sem_socket' }; }
            MK.ultimoEnvio = Date.now(); // depois do envio: o intervalo medido no servidor nunca fica abaixo de 3,5 s
            await esperarQue(() => p.res || (p.erro && Date.now() - p.erro.t >= MK_GRACA_ERRO_MS), MK_PRAZO_MS, 100);
            if (MK.pend === p) MK.pend = null;
            if (p.res) return p.res;
            if (p.erro && p.erro.code === 'rate_limited' && tentativa === 0) {
                MK.pausaAte = Date.now() + MK_PAUSA_LIMITE_MS;
                log(`mercado: limite de ações do mercado (rate_limited) — pausa de ${MK_PAUSA_LIMITE_MS / 1000} s e tento de novo`, 'info');
                continue;
            }
            if (p.erro) return { erro: p.erro.code, key: p.erro.key };
            return { erro: 'sem_resposta' };
        }
        return { erro: 'rate_limited' };
    }
    /* /tradeable, /market/fees e /prices (públicos, 1× por sessão, só em memória: /prices tem 188 KB) */
    async function mkCarregarRest() {
        const faltam = [], tarefas = [];
        if (!MK.tradeable) { tarefas.push(buscarJSON('/tradeable').then(j => { if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('formato inesperado'); MK.tradeable = mkIndexar(j); })
            .catch(e => faltam.push('/tradeable (' + e.message + ')'))); }
        if (MK.taxa == null || MK.taxaWiki) { tarefas.push(buscarJSON('/market/fees').then(j => { const r = Number(j && j.creationFeeRate); if (!(r >= 0 && r < 1)) throw new Error('formato inesperado'); MK.taxa = r; MK.taxaWiki = false; })
            .catch(e => { if (MK.taxa == null) { MK.taxa = MK_TAXA_WIKI; MK.taxaWiki = true; } faltam.push('/market/fees (' + e.message + ' — uso os 5 % da wiki)'); })); }
        if (!MK.npc) { tarefas.push(buscarJSON('/prices').then(j => { if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('formato inesperado'); MK.npc = mkIndexar(j); })
            .catch(e => faltam.push('/prices (' + e.message + ')'))); }
        await Promise.all(tarefas);
        MK.restErro = faltam.length ? faltam.join(' · ') : null;
        if (faltam.length) log('mercado: não carregou ' + MK.restErro, 'erro');
    }
    /* mochila: a tela do jogo (fibra) é o estado corrente; o `bag` do socket
     * vale quando é mais novo que 3 s (resposta de um depot_withdraw) ou
     * quando a fibra não está à mão. ⚠ Visto no teste ao vivo (29/09): antes
     * do login a fibra já tem o estado INICIAL do jogo (roster [], bag {}) —
     * só vale a fibra com o roster preenchido. */
    function mkBagAtual() {
        const sh = lerShellFibra();
        const daTela = sh && sh.bag && typeof sh.bag === 'object' && Array.isArray(sh.roster) && sh.roster.length
            ? { bag: sh.bag, inst: Array.isArray(sh.bagInstances) ? sh.bagInstances : [] } : null;
        if (MK.bag && (!daTela || Date.now() - MK.bag_t < 3000)) return { bag: MK.bag, inst: MK.bagInst || [] };
        return daTela || (MK.bag ? { bag: MK.bag, inst: MK.bagInst || [] } : null);
    }
    function mkEntrada() {
        const b = mkBagAtual(), R = EQUIP.res;
        return { bag: b ? b.bag : null, bagInst: b ? b.inst : null, depot: ESTADO_WS.depot ? ESTADO_WS.depot.entries : null,
                 tradeable: MK.tradeable, npc: MK.npc, taxa: MK.taxa, catalogo: MK.catalogo, minhas: MK.minhas, livros: MK.livros, copias: MK.copias, stats: MK.stats,
                 prot: mkProtegidos(), nunca: autoHunt().nuncaVender || [], equip: R ? { usadas: [...(R.usadas || [])], reservas: [...(R.reservas || []), ...(R.nobres || []).map(p => p.iid), ...(R.bases || []).map(p => p.iid)],
                                                                         sobras: (R.dispensaveis || []).map(p => p.iid).filter(Boolean) } : null,
                 naCidade: !emHunt(), digitados: MK.digitados, marcados: [...MK.marcados] };
    }
    const mkVista = () => mkMontar(mkEntrada());
    /* premium sem o welcome (helper instalado com o jogo aberto): o estado do
     * próprio jogo na fibra, se for um estado de verdade (roster preenchido) */
    function mkPremiumAgora() {
        if (MK.premiumAte === undefined) {
            const sh = lerShellFibra();
            if (sh && Array.isArray(sh.roster) && sh.roster.length && sh.account && typeof sh.account === 'object' && 'premiumUntil' in sh.account) MK.premiumAte = sh.account.premiumUntil || null;
        }
        return mkPremium(MK.premiumAte, Date.now());
    }
    const mkRevisaoAtual = () => mkRevisao({ minhas: MK.minhas, catalogo: MK.catalogo, livros: MK.livros, copias: MK.copias, tradeable: MK.tradeable, taxa: MK.taxa });
    /* o que impede QUALQUER ação de escrita (anunciar, cancelar, resgatar) */
    function mkImpedimento() {
        if (!socketAberto()) return 'socket do jogo não está à mão — dê F5 com o helper instalado';
        if (mkPremiumAgora() === false) return 'a conta está sem Premium — o mercado é só Premium';
        const ocup = travaJogo();
        if (ocup) return ocup + ' em andamento — espera terminar';
        return null;
    }
    /* lê o que falta (livro, cópias, média) no ritmo, um pedido por vez */
    async function mkBuscarPendencias(obter, rotulo) {
        const tentados = new Set();
        for (let g = 0; g < 80 && !MK.parar; g++) {
            const pend = obter().filter(x => !tentados.has(x.chave));
            if (!pend.length) return;
            const p = pend[0]; tentados.add(p.chave);
            MK.progresso = `${rotulo}: ${p.rotulo} (${tentados.size}/${tentados.size + pend.length - 1})`; renderizar();
            const r = await mkPedir(p.tipo, p.data);
            if (r.erro) {
                MK[p.cache][p.alvo] = { erro: r.erro, t: Date.now() };
                log(`mercado: ${p.rotulo} não veio — ${mkErroTexto(r.erro)}`, 'erro');
                if (MK_PARA_TUDO.has(r.erro)) return;
            }
        }
        /* pedida, respondida e ainda pendente (resposta noutro formato): não
         * pede de novo — a linha passa a pedir o preço digitado */
        if (!MK.parar) for (const p of obter()) if (tentados.has(p.chave) && MK[p.cache] && !MK[p.cache][p.alvo]) MK[p.cache][p.alvo] = { erro: 'sem_dado', t: Date.now() };
    }
    async function mkLerBase(tipos) {
        for (const [tipo, rot] of tipos) {
            if (MK.parar) return false;
            MK.progresso = rot + '…'; renderizar();
            const r = tipo === 'market_my_orders' ? await mkLerMinhas() : await mkPedir(tipo, {});
            if (r.erro) throw new Error(rot + ': ' + mkErroTexto(r.erro));
        }
        return true;
    }
    /* v2.13.5 — suas ordens vêm em páginas de MK_PAGINA_ORDENS (a mais nova primeiro): lê até a página
     * vir incompleta (no máximo 20 páginas). Só leitura, no mesmo ritmo dos outros pedidos. */
    const MK_PAGINA_ORDENS = 50;
    async function mkLerMinhas() {
        let r = null;
        for (let pg = 0; pg < 20; pg++) {
            if (pg && MK.parar) break;
            r = await mkPedir('market_my_orders', pg ? { page: pg } : {});
            if (r.erro) return r;
            const o = r.data && Array.isArray(r.data.orders) ? r.data.orders : [];
            if (o.length < MK_PAGINA_ORDENS) break;
            if (pg) { MK.progresso = 'suas ordens (página ' + (pg + 1) + ')…'; renderizar(); }
        }
        return r;
    }
    /* ATUALIZAR: só LÊ — REST públicos, depósito, mochila, catálogo do
     * mercado, minhas ordens, caixa; depois o que faltar item a item. */
    async function mkAtualizar() {
        if (MK.ocupado) return;
        if (!socketAberto()) { avisar('mercado', 'mercado: socket do jogo não está à mão — dê F5 com o helper instalado', 'erro'); return; }
        MK.ocupado = 'lendo'; MK.parar = false; MK.erro = null; MK.conf = null; renderizar();
        try {
            MK.progresso = 'tabelas do jogo (negociáveis, taxa, NPC)…'; renderizar();
            await mkCarregarRest();
            MK.progresso = 'depósito…'; renderizar();
            const dp = await lerDepot();
            if (dp.erro) log('mercado: depósito não lido (' + dp.erro + ') — a lista fica só com a mochila', 'erro');
            /* v2.11.14 — a leitura do Equip (o melhor e a reserva de cada um) mora só na memória: depois
             * de um F5 toda peça forjada ficava travada ("rode ATUALIZAR no Equip antes") e o dono não
             * conseguia marcar nada (30/09). O ATUALIZAR do Mercado já lê o Equip junto — é só leitura. */
            /* v2.11.20 — sempre (não só sem leitura): peça que o Auto Hunt guardou depois da última leitura do Equip
             * ficaria sem avaliação. Com o depósito não lido, o Equip não põe peça do depósito nas sobras. */
            if (!EQUIP.lendo) { MK.progresso = 'equipamento dos 4 (o melhor e a reserva ficam fora)…'; renderizar(); await equipAtualizar(); }
            MK.livros = {}; MK.copias = {}; MK.stats = {};
            if (await mkLerBase([['market_catalog', 'preços do mercado'], ['market_my_orders', 'suas ordens'], ['market_inbox', 'caixa de entrada']])) {
                await mkBuscarPendencias(() => mkVista().pendencias, 'preços');
            }
            MK.t = Date.now();
            const v = mkVista(), prontos = v.linhas.filter(l => !l.bloqueio).length;
            avisar('mercado', `mercado: ${v.linhas.length} itens na lista (${prontos} prontos para anunciar) · ${v.fora.length} fora` + (MK.parar ? ' — leitura interrompida' : ''), 'ok');
        } catch (e) { MK.erro = e.message; avisar('mercado', 'mercado: ' + e.message, 'erro'); }
        finally { MK.ocupado = null; MK.progresso = null; MK.parar = false; renderizar(); }
    }
    /* quantas unidades estão na mochila agora (cópia: a peça pelo iid) */
    function mkNaMochila(it, bag) {
        if (!bag) return 0;
        if (it.tipo === 'copia') return (bag.inst || []).some(x => x && x.iid === it.iid) ? 1 : 0;
        let n = 0;
        for (const [k, v] of Object.entries(bag.bag || {})) if (mkMin(k) === it.n) n += Number(v) || 0;
        return n;
    }
    async function mkAnunciarUm(it) {
        /* 1) depósito → mochila (item empilhável só é anunciado da mochila) */
        let bag = null;
        if (it.retirar && it.retirar.length) {
            const r = await mkPedir('depot_withdraw', { items: it.retirar, requestId: mkRid() });
            if (r.erro) {
                log(`mercado: ${it.nome}: retirar do depósito falhou — ${mkErroTexto(r.erro)}; anuncio só o que já está na mochila`, 'erro');
                if (MK_PARA_TUDO.has(r.erro)) return { ok: false, pararTudo: r.erro };
            } else if (r.data && r.data.bag) bag = { bag: r.data.bag, inst: Array.isArray(r.data.bagInstances) ? r.data.bagInstances : [] };
        }
        /* 2) conferir a mochila */
        const naMochila = mkNaMochila(it, bag || mkBagAtual());
        const qtd = Math.min(it.qtd, naMochila);
        if (!qtd) { log(`mercado: ${it.nome} não está na mochila — não anunciei`, 'erro'); return { ok: false }; }
        if (qtd < it.qtd) log(`mercado: ${it.nome}: só ${qtd} de ${it.qtd} na mochila — anuncio ${qtd}`, 'info');
        /* o piso do NPC de novo: a quantidade pode ter mudado */
        if (mkAbaixoDoNpc(it.preco, qtd, it.npc, MK.taxa) !== false) { log(`mercado: ${it.nome} a ${mkFmt(it.preco)} não passa do NPC — não anunciei`, 'erro'); return { ok: false }; }
        /* 3) a ordem */
        const data = { side: 'SELL', asset: 'ITEM', itemName: it.nome, unitPrice: it.preco, quantity: qtd, requestId: mkRid() };
        if (it.iid) data.iid = it.iid;
        const r = await mkPedir('market_create', data);
        if (r.erro) {
            log(`mercado: ${qtd}× ${it.nome} NÃO anunciado — ${mkErroTexto(r.erro)}`, 'erro');
            return { ok: false, pararTudo: MK_PARA_TUDO.has(r.erro) ? r.erro : null };
        }
        const ord = (r.data && r.data.order) || {};
        const taxa = ord.creationFeePaid != null ? ord.creationFeePaid : mkTaxa(it.preco, qtd, MK.taxa);
        log(`mercado: anunciado ${qtd}× ${it.nome} a ${mkFmt(it.preco)} (taxa ${mkFmt(taxa)}, não volta)`, 'ok');
        return { ok: true, taxa };
    }
    /* ANUNCIAR — só depois do 2º toque (mkToque). Fila: retirar → conferir →
     * criar → esperar → próximo. Ocupa a trava comum: o Auto Hunt não pode
     * guardar a mochila no depósito no meio (desfaria a retirada). */
    async function mkAnunciar() {
        if (MK.ocupado) return;
        const plano = mkVista().plano;
        if (!plano.n) { avisar('mercado', 'mercado: marque ao menos um item com preço', 'erro'); return; }
        const imp = mkImpedimento();
        if (imp) { avisar('mercado', 'mercado: ' + imp, 'erro'); return; }
        MK.ocupado = 'anunciando'; MK.parar = false; MK.conf = null; _travaJogo = 'Mercado';
        renderizar();
        const res = { ok: 0, falha: 0, taxa: 0, parou: null };
        log(`mercado: anunciando ${plano.n} item(ns) · taxa prevista ${mkFmt(plano.taxa)}`, 'info');
        try {
            for (let i = 0; i < plano.itens.length; i++) {
                if (MK.parar) { res.parou = 'parado por você'; break; }
                const it = plano.itens[i];
                MK.progresso = `anunciando ${i + 1}/${plano.n}: ${it.nome}`; renderizar();
                const r = await mkAnunciarUm(it);
                if (r.ok) { res.ok++; res.taxa += r.taxa || 0; MK.marcados.delete(it.chave); delete MK.digitados[it.chave]; }
                else res.falha++;
                if (r.pararTudo) { res.parou = mkErroTexto(r.pararTudo); break; }
            }
            if (res.ok && !res.parou) { MK.progresso = 'relendo suas ordens…'; renderizar(); await mkLerMinhas(); }
        } catch (e) { falhou('mercado (anunciar)', e); res.parou = e.message; }
        finally { MK.ocupado = null; MK.progresso = null; MK.parar = false; _travaJogo = null; renderizar(); }
        avisar('mercado', `mercado: ${res.ok} anunciado(s) · taxa paga ${mkFmt(res.taxa)}` + (res.falha ? ` · ${res.falha} não anunciado(s) (ver Log)` : '') + (res.parou ? ` · fila parada: ${res.parou}` : ''),
               res.falha || res.parou ? 'erro' : 'ok');
    }
    /* v2.14.12 — SUAS VENDAS dos últimos 30 dias: market_history {page, type:'sell', period:'30d'}, página a página
     * (pageSize vem na resposta; no máximo 10 páginas). Só leitura, no ritmo da fila. Erro não derruba a revisão. */
    const MK_HIST_PAGINAS = 10;
    async function mkLerVendas() {
        const entries = [];
        for (let pg = 0; pg < MK_HIST_PAGINAS; pg++) {
            if (pg && MK.parar) break;
            MK.progresso = 'suas vendas (30 dias' + (pg ? ', página ' + (pg + 1) : '') + ')…'; renderizar();
            const r = await mkPedir('market_history', { page: pg, type: 'sell', period: '30d' });
            if (r.erro) { MK.vendasErro = mkErroTexto(r.erro); log('mercado: histórico de vendas não lido — ' + MK.vendasErro, 'erro'); return false; }
            const d = r.data || {}, e = Array.isArray(d.entries) ? d.entries : [];
            entries.push(...clonar(e));
            const tam = Number(d.pageSize) || e.length || 0;
            if (!e.length || e.length < tam || (Number(d.total) > 0 && entries.length >= Number(d.total))) break;
        }
        MK.vendas = entries; MK.vendas_t = Date.now(); MK.vendasErro = null;
        return true;
    }
    async function mkRevisar() {
        if (MK.ocupado) return;
        if (!socketAberto()) { avisar('mercado', 'mercado: socket do jogo não está à mão — dê F5 com o helper instalado', 'erro'); return; }
        MK.ocupado = 'revisando'; MK.parar = false; MK.erro = null; renderizar();
        try {
            await mkCarregarRest();
            MK.livros = {}; MK.copias = {};
            if (await mkLerBase([['market_my_orders', 'suas ordens'], ['market_catalog', 'preços do mercado']])) await mkBuscarPendencias(() => mkRevisaoAtual().pendencias, 'revisão');
            if (!MK.parar) await mkLerVendas();
            MK.revisao = { t: Date.now() };
            const rv = mkRevisaoAtual().linhas, baratos = rv.filter(l => l.situacao === 'barato' || l.situacao === 'empate').length;
            const abaixo = rv.filter(l => l.folga > 0).length, vd = MK.vendas ? mkVendas(MK.vendas, Date.now()) : null;
            avisar('mercado', `mercado: ${rv.length} ordem(ns) aberta(s) · ${baratos ? baratos + ' com alguém mais barato ou empatado' : 'nenhuma com concorrente mais barato'}${abaixo ? ` · ${abaixo} abaixo do menor de outro com o mesmo encaixe` : ''}${vd ? ` · ${vd.n} venda(s) em 30 dias (${mkFmt(vd.total)} ouro)` : ''}`, 'ok');
        } catch (e) { MK.erro = e.message; avisar('mercado', 'mercado: ' + e.message, 'erro'); }
        finally { MK.ocupado = null; MK.progresso = null; MK.parar = false; renderizar(); }
    }
    async function mkCancelar(l) {
        if (MK.ocupado || !l) return;
        const imp = mkImpedimento();
        if (imp) { avisar('mercado', 'mercado: ' + imp, 'erro'); return; }
        MK.ocupado = 'cancelando'; MK.conf = null; MK.progresso = 'cancelando ' + l.nome + '…'; renderizar();
        let r;
        try { r = await mkPedir('market_cancel', { orderId: l.id, requestId: mkRid() }); }
        catch (e) { r = { erro: e.message }; }
        finally { MK.ocupado = null; MK.progresso = null; renderizar(); }
        if (r.erro) avisar('mercado', `mercado: cancelar ${l.qtd}× ${l.nome} falhou — ${mkErroTexto(r.erro)}`, 'erro');
        else avisar('mercado', `mercado: ordem de ${l.qtd}× ${l.nome} cancelada — os itens voltam para a mochila (ou depósito); a taxa de ${mkFmt(l.taxaPaga)} não volta`, 'ok');
    }
    async function mkLerCaixa() {
        if (MK.ocupado) return;
        if (!socketAberto()) { avisar('mercado', 'mercado: socket do jogo não está à mão — dê F5 com o helper instalado', 'erro'); return; }
        MK.ocupado = 'lendo'; MK.erro = null; renderizar();
        try { await mkLerBase([['market_inbox', 'caixa de entrada']]); avisar('mercado', `mercado: caixa de entrada com ${(MK.inbox || []).length} entrega(s)`, 'ok'); }
        catch (e) { MK.erro = e.message; avisar('mercado', 'mercado: ' + e.message, 'erro'); }
        finally { MK.ocupado = null; MK.progresso = null; renderizar(); }
    }
    const mkDescEntrega = (x) => (x.currency === 'gold' ? mkFmt(x.amount) + ' ouro' : x.currency === 'coins' ? mkFmt(x.amount) + ' TC' : mkFmt(x.amount) + '× ' + (x.itemName || '?'));
    async function mkResgatarTudo() {
        if (MK.ocupado) return;
        const lista = (MK.inbox || []).slice();
        if (!lista.length) { avisar('mercado', 'mercado: caixa vazia — clique LER CAIXA', 'info'); return; }
        const imp = mkImpedimento();
        if (imp) { avisar('mercado', 'mercado: ' + imp, 'erro'); return; }
        MK.ocupado = 'resgatando'; MK.parar = false; renderizar();
        const res = { ok: 0, falha: 0, ouro: 0, parou: null };
        try {
            for (let i = 0; i < lista.length; i++) {
                if (MK.parar) { res.parou = 'parado por você'; break; }
                const x = lista[i];
                MK.progresso = `resgatando ${i + 1}/${lista.length}: ${mkDescEntrega(x)}`; renderizar();
                const r = await mkPedir('market_claim', { entryId: x.id, requestId: mkRid() });
                if (r.erro) { res.falha++; log(`mercado: resgatar ${mkDescEntrega(x)} falhou — ${mkErroTexto(r.erro)}`, 'erro'); if (MK_PARA_TUDO.has(r.erro)) { res.parou = mkErroTexto(r.erro); break; } continue; }
                res.ok++; if (x.currency === 'gold') res.ouro += Number(x.amount) || 0;
                log(`mercado: resgatado ${mkDescEntrega(x)} (${MK_MOTIVO_CAIXA[x.reason] || x.reason || '?'})`, 'ok');
            }
            if (!res.parou) { MK.progresso = 'relendo a caixa…'; renderizar(); await mkPedir('market_inbox', {}); }
        } catch (e) { falhou('mercado (resgatar)', e); res.parou = e.message; }
        finally { MK.ocupado = null; MK.progresso = null; MK.parar = false; renderizar(); }
        avisar('mercado', `mercado: ${res.ok} entrega(s) resgatada(s)` + (res.ouro ? ` · +${mkFmt(res.ouro)} ouro na carteira` : '') + (res.falha ? ` · ${res.falha} falharam (ver Log)` : '') + (res.parou ? ` · parou: ${res.parou}` : ''),
               res.falha || res.parou ? 'erro' : 'ok');
    }
    /* 2 TOQUES amarrados ao que estava na tela: se a lista mudou entre o 1º e o
     * 2º toque (preço lido, item marcado), o 2º vira um novo 1º. O estado vive
     * em MK.conf, não no botão (o repinte troca o botão). */
    function mkToque(chave, assinatura, acao) {
        const c = MK.conf, agora = Date.now();
        if (c && c.chave === chave && c.ass === assinatura && agora < c.ate) { MK.conf = null; renderizar(); acao(); return; }
        MK.conf = { chave, ass: assinatura, ate: agora + MK_CONF_MS };
        renderizar();
        setTimeout(() => { if (MK.conf && MK.conf.chave === chave && Date.now() >= MK.conf.ate) { MK.conf = null; renderizar(); } }, MK_CONF_MS + 100);
    }
    const mkConfAtiva = (chave, ass) => !!(MK.conf && MK.conf.chave === chave && (ass == null || MK.conf.ass === ass) && Date.now() < MK.conf.ate);

    /* estilos só desta aba: fonte ≥ 10,5 px e alvos ≥ 28 px — pelas variáveis
     * da casca, que no celular (≤ 640 px) sobem para 12 px e 40 px */
    const MK_CSS = `
    #tb-mk{font-size:11px}
    #tb-mk .mk-st{display:flex;flex-wrap:wrap;gap:2px 7px;align-items:center;font-size:var(--tb-fmin,10.5px);color:var(--tb-mut,#9aa4b8);flex:1;min-width:0}
    #tb-mk .mk-prog{font-size:var(--tb-fmin,10.5px);color:#ffd479;margin:2px 0 4px}
    #tb-mk .mk-cat{margin:8px 0 1px;color:#ffd479;font-size:var(--tb-fmin,10.5px);letter-spacing:.3px;text-transform:uppercase}
    #tb-mk .mk-it{display:grid;grid-template-columns:var(--tb-alvo,28px) minmax(0,1fr) 86px;gap:0 4px;align-items:center;padding:2px 0;border-bottom:1px dotted #262d3b}
    #tb-mk .mk-it label{display:flex;align-items:center;justify-content:center;min-width:var(--tb-alvo,28px);min-height:var(--tb-alvo,28px);cursor:pointer}
    #tb-mk .mk-it input[type=checkbox]{width:16px;height:16px;margin:0}
    #tb-mk .mk-it.bloq label{cursor:default}
    #tb-mk .mk-nome{min-width:0;overflow-wrap:anywhere;line-height:1.3}
    #tb-mk .mk-preco{width:100%;min-height:var(--tb-alvo,28px);box-sizing:border-box;text-align:right;font-size:11px}
    #tb-mk .mk-info{grid-column:2/-1;font-size:var(--tb-fmin,10.5px);color:#9aa4b8;line-height:1.35;padding-bottom:2px}
    #tb-mk .mk-org{font-size:var(--tb-fmin,10.5px);padding:0 5px;border-radius:9px;background:#2b3242;color:#c3cad6;white-space:nowrap}
    #tb-mk .mk-org.menor{background:#1f4a2c;color:#8ff0a8}#tb-mk .mk-org.media{background:#4a3b14;color:#ffd479}
    #tb-mk .mk-org.digitado{background:#1d3550;color:#9fd0ff}#tb-mk .mk-org.vazio,#tb-mk .mk-org.pendente{background:#4a1f1f;color:#ff9b93}
    #tb-mk .mk-rodape{position:sticky;bottom:-8px;background:#12151c;padding:6px 0 4px;margin-top:6px;border-top:1px solid #2b3242}
    #tb-mk .mk-rodape .tb-bt.pri{width:100%;font-size:12px;padding:6px}
    #tb-mk .mk-ord{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 6px;align-items:center;padding:4px 0;border-bottom:1px dotted #262d3b}
    #tb-mk .mk-ord .mk-info{grid-column:1/-1}
    #tb-mk .tb-bt.mini{min-height:var(--tb-alvo,28px);padding:2px 9px;font-size:var(--tb-fmin,10.5px)}
    #tb-mk .mk-av{background:#33301c;border:1px solid #7a6a2a;color:#ffe3a3;border-radius:7px;padding:5px 7px;margin:5px 0;font-size:var(--tb-fmin,10.5px)}
    #tb-mk .mk-ruim{background:#3a1d1d;border:1px solid #8a3a3a;color:#ffc2bd;border-radius:7px;padding:5px 7px;margin:5px 0;font-size:var(--tb-fmin,10.5px)}
    #tb-mk .tb-sub button{font-size:11px}
    `;
    function mkGarantirCss() {
        garantirCssAH(); // .tb-conf (botão em "confirmar…") vem de lá
        if (document.getElementById('tb-mk-css')) return;
        const s = document.createElement('style'); s.id = 'tb-mk-css'; s.textContent = MK_CSS;
        (document.head || document.documentElement).appendChild(s);
    }
    const mkHora = (t) => (t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
    function mkExpira(t) {
        if (!t) return '';
        const ms = Number(t) - Date.now();
        if (ms <= 0) return 'expirada';
        return 'expira em ' + (ms < 3600000 ? Math.max(1, Math.round(ms / 60000)) + ' min' : ms < 86400000 ? Math.round(ms / 3600000) + ' h' : Math.round(ms / 86400000) + ' d');
    }
    const mkCorte = (f) => (f ? `<span class="tb-rar r${mkRar(f, 0)}">${RAR_NOME[mkRar(f, 0)] || mkRar(f, 0)}${mkRef(f, 0) ? ' +' + mkRef(f, 0) : ''}</span>` : '');
    /* v2.14.12 — o encaixe e a potência da peça, ao lado do corte: é o que faz o preço */
    const mkPecaTxt = (f) => { if (!f) return ''; const e = mkEncaixeTxt(f), pot = Number(f.potenciaBase) || 0; return e || pot ? ` <span class="tb-mut">${escHtml([e, pot ? 'pot ' + mkFmt(pot) : ''].filter(Boolean).join(' · '))}</span>` : ''; };
    function mkTelaAnunciar(v) {
        const ocup = !!MK.ocupado;
        let h = '';
        if (!MK.t) return h + `<div class="tb-cx tb-mut">ATUALIZAR lê a mochila, o depósito e os preços do mercado e monta a lista com o preço sugerido (menor anúncio de outro vendedor −1; sem concorrente, a média de 30 dias). Nada é anunciado sem você marcar e confirmar com 2 toques.</div>`;
        if (MK.restErro) h += `<div class="mk-ruim">não carregou: ${escHtml(MK.restErro)}</div>`;
        if (emHunt()) h += `<div class="mk-av">caçando: o depósito só é lido — dá para anunciar só o que está na mochila (o resto, na cidade).</div>`;
        if (!EQUIP.res && v.linhas.some(l => l.tipo === 'copia')) h += `<div class="mk-av">Equipamento travado: rode ATUALIZAR na aba Equip para o helper saber o melhor e a reserva de cada personagem (esses nunca entram aqui). <button type="button" class="tb-bt mini" id="tb-mk-equip" ${ocup || EQUIP.lendo ? 'disabled' : ''}>${EQUIP.lendo ? 'lendo o Equip…' : 'ATUALIZAR o Equip agora'}</button></div>`;
        if (!v.linhas.length) h += `<div class="tb-mut" style="margin:6px 0">nada para anunciar na mochila nem no depósito${v.fora.length ? ' (veja "fora da lista")' : ''}.</div>`;
        MK.pintadas = v.linhas;
        let catAtual = '';
        v.linhas.forEach((l, i) => {
            const c = l.cat || 'outros';
            if (c !== catAtual) { catAtual = c; const n = v.linhas.filter(x => (x.cat || 'outros') === c).length; h += `<div class="mk-cat">${escHtml(MK_CATS[c] || 'Outros')} (${n})</div>`; }
            const onde = l.deposito && l.mochila ? `${l.mochila} mochila + ${l.deposito} dep.` : l.deposito ? 'no depósito' : 'na mochila';
            const org = l.origem === 'menor' ? `menor −1 (outro${l.forja ? ' com o mesmo encaixe' : ''} a ${mkFmt(l.sug.ref)})` : MK_ORIGEM[l.origem] || l.origem;
            const npcTxt = l.npc == null ? 'NPC ?' : !(l.npc > 0) ? 'NPC não compra' : l.qtd ? 'NPC ' + mkFmt(l.npcTotal) : 'NPC ' + mkFmt(l.npc) + '/un';
            const blq = l.bloqueio ? (l.bloqueio === 'vender no NPC' ? `<b class="tb-av">vender no NPC</b> (o mercado daria ${mkFmt(l.liquido)} líquido)` : `<span class="tb-ruim">${escHtml(l.bloqueio)}</span>`) : '';
            const valor = l.origem === 'digitado' ? MK.digitados[l.chave] : l.preco;
            h += `<div class="mk-it${l.bloqueio ? ' bloq' : ''}">
                <label title="${escHtml(l.bloqueio || 'marcar para anunciar')}"><input type="checkbox" id="tb-mk-c-${i}" ${l.marcado ? 'checked' : ''} ${l.bloqueio || ocup ? 'disabled' : ''} aria-label="anunciar ${escHtml(l.nome)}"></label>
                <div class="mk-nome"><b>${escHtml(l.nome)}</b> <span class="tb-mut">${!l.qtd && l.deposito ? `${mkFmt(l.deposito)} no depósito` : '×' + mkFmt(l.qtd)}</span>${mkCorte(l.forja)}${mkPecaTxt(l.forja)}</div>
                <input class="tb-in mk-preco" id="tb-mk-p-${i}" type="number" min="1" step="1" inputmode="numeric" placeholder="preço" value="${escHtml(valor == null ? '' : valor)}" aria-label="preço unitário de ${escHtml(l.nome)}" ${ocup ? 'disabled' : ''}>
                <div class="mk-info"><span class="mk-org ${escHtml(l.origem)}">${escHtml(org)}</span> · ${escHtml(onde)}${l.liquido != null ? ' · líq. ' + mkFmt(l.liquido) : ''} · ${npcTxt}${l.nota ? ` · <span class="tb-av">${escHtml(l.nota)}</span>` : ''}${blq ? '<br>' + blq : ''}</div>
              </div>`;
        });
        if (v.fora.length) {
            const porMotivo = {};
            v.fora.forEach(f => { (porMotivo[f.motivo] = porMotivo[f.motivo] || []).push(f); });
            h += aj('mk-fora', Object.entries(porMotivo).map(([m, fs]) => `<div style="margin:3px 0"><b>${escHtml(m)}</b>: ${fs.map(f => escHtml(f.nome) + (f.qtd > 1 ? ' ×' + mkFmt(f.qtd) : '')).join(', ')}</div>`).join(''), `fora da lista (${v.fora.length})`);
        }
        const p = v.plano, conf = mkConfAtiva('anunciar', p.assinatura);
        const podeMarcar = v.linhas.filter(l => !l.bloqueio).length;
        h += `<div class="mk-rodape">
            <div class="tb-linha"><button type="button" class="tb-bt mini" id="tb-mk-todos" ${ocup || !podeMarcar ? 'disabled' : ''}>marcar todos (${podeMarcar})</button><button type="button" class="tb-bt mini" id="tb-mk-nenhum" ${ocup || !p.n ? 'disabled' : ''}>desmarcar</button>
              <span class="tb-mut" style="margin-left:auto;font-size:10.5px">${p.n ? 'líquido ~' + mkFmt(p.liquido) : ''}</span></div>
            <button type="button" class="tb-bt pri${conf ? ' tb-conf' : ''}" id="tb-mk-anunciar" ${ocup || !p.n ? 'disabled' : ''}>${conf ? `CONFIRMAR: anunciar ${p.n} · taxa ${mkFmt(p.taxa)} (não volta)` : `ANUNCIAR (${p.n}) · taxa total ${mkFmt(p.taxa)}`}</button>
          </div>`;
        return h;
    }
    function mkTelaMeus() {
        const ocup = !!MK.ocupado;
        const rv = MK.minhas ? mkRevisaoAtual().linhas : [];
        MK.ordPintadas = rv;
        let h = `<div class="tb-linha"><button type="button" class="tb-bt" id="tb-mk-revisar" ${ocup ? 'disabled' : ''}>REVISAR MEUS ANÚNCIOS</button>
            <span class="tb-mut" style="font-size:10.5px">${MK.minhas ? rv.length + ' aberta(s)' + (MK.revisao ? ' · revisado ' + mkHora(MK.revisao.t) : '') : 'ainda não lido'}</span></div>`;
        if (!MK.minhas) return h + `<div class="tb-cx tb-mut">REVISAR lê suas ordens abertas e, para cada uma, o menor preço de outro vendedor (mesmo item; forjado, mesma raridade, mesmo refino e os MESMOS atributos — o encaixe faz o preço) e quanto custaria refazer; lê também o que você vendeu nos últimos 30 dias. Nada é refeito sozinho: cancelar pede 2 toques, e anunciar de novo é pela lista.</div>`;
        const SIT = { menor: '<span class="tb-ok">você é o menor</span>', sozinho: '<span class="tb-ok">sem concorrente</span>', empate: '<span class="tb-av">empatado com outro</span>',
                      barato: '<span class="tb-ruim">alguém está mais barato</span>', pendente: '<span class="tb-mut">não revisado — REVISAR</span>', erro: '<span class="tb-ruim">não consegui ler o livro</span>',
                      compra: '<span class="tb-mut">ordem de compra</span>', vazia: '<span class="tb-mut">—</span>' };
        rv.forEach((l, i) => {
            const conf = mkConfAtiva('cancelar:' + l.id);
            const refazer = l.novo != null ? `<br>refazer a ${mkFmt(l.novo)}: taxa nova ${mkFmt(l.taxaNova)}${l.taxaPaga != null ? ` + a taxa já paga (${mkFmt(l.taxaPaga)}) não volta` : ''}` : '';
            h += `<div class="mk-ord"><div><b>${escHtml(l.nome)}</b>${mkCorte(l.forja)}${mkPecaTxt(l.forja)} <span class="tb-mut">×${mkFmt(l.qtd)} @ ${mkFmt(l.preco)}</span></div>
                <button type="button" class="tb-bt mini${conf ? ' tb-conf' : ''}" id="tb-mk-x-${i}" ${ocup ? 'disabled' : ''} aria-label="cancelar a ordem de ${escHtml(l.nome)}">${conf ? 'confirmar?' : 'cancelar'}</button>
                <div class="mk-info">${SIT[l.situacao] || escHtml(l.situacao)}${l.menor != null ? ` · menor de outro${l.forja ? ' com o mesmo encaixe' : ''}: ${mkFmt(l.menor)}` + (l.preco > l.menor ? ` (o seu está ${mkFmt(l.preco - l.menor)} acima)` : l.folga ? ` <span class="tb-av">(o seu está ${mkFmt(l.folga)} ABAIXO — cancele e anuncie de novo se quiser)</span>` : '') : ''} · ${escHtml(mkExpira(l.expira))}${refazer}</div></div>`;
        });
        if (!rv.length) h += `<div class="tb-mut" style="margin:6px 0">nenhuma ordem aberta.</div>`;
        /* v2.14.12 — o que você vendeu nos últimos 30 dias (histórico do jogo; a ordem vendida some das abertas) */
        const vd = MK.vendas ? mkVendas(MK.vendas, Date.now()) : null;
        h += `<div class="mk-cat">Vendidos nos últimos 30 dias${vd ? ` (${mkFmt(vd.n)})` : ''}</div>`;
        if (!MK.vendas) h += `<div class="tb-mut">${MK.vendasErro ? 'não consegui ler o histórico de vendas: ' + escHtml(MK.vendasErro) : 'REVISAR lê o histórico de vendas do jogo.'}</div>`;
        else if (!vd.n) h += `<div class="tb-mut">nenhuma venda nos últimos 30 dias (histórico lido ${mkHora(MK.vendas_t)}).</div>`;
        else {
            const quando = (t) => (t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
            h += `<div class="tb-mut" style="font-size:10.5px">${mkFmt(vd.unidades)} unidade(s) · ${mkFmt(vd.total)} ouro${vd.taxa ? ' · taxa ' + mkFmt(vd.taxa) : ''} · lido ${mkHora(MK.vendas_t)}. Peça forjada aparece só pelo nome: o histórico do jogo não traz o encaixe.</div>`;
            vd.linhas.slice(0, 60).forEach(l => { h += `<div class="tb-lin"><span><b>${escHtml(l.nome)}</b> ×${mkFmt(l.qtd)}${l.vezes > 1 ? ` <span class="tb-mut">(${l.vezes} vendas)</span>` : ''}<br><span class="tb-mut" style="font-size:10.5px">${escHtml(quando(l.ultimo))}</span></span><span>@ ${mkFmt(l.preco)}<br><span class="tb-ok">${mkFmt(l.total)}</span></span></div>`; });
            if (vd.linhas.length > 60) h += `<div class="tb-mut">… e mais ${vd.linhas.length - 60} linha(s)</div>`;
        }
        return h;
    }
    function mkTelaCaixa() {
        const ocup = !!MK.ocupado, cx = MK.inbox || [];
        const ouro = cx.filter(x => x.currency === 'gold').reduce((s, x) => s + (Number(x.amount) || 0), 0);
        let h = `<div class="tb-linha"><button type="button" class="tb-bt" id="tb-mk-caixa" ${ocup ? 'disabled' : ''}>LER CAIXA</button>
            <button type="button" class="tb-bt pri" id="tb-mk-resgatar" ${ocup || !cx.length ? 'disabled' : ''}>RESGATAR TUDO (${cx.length})</button></div>
            <div class="tb-mut" style="font-size:10.5px">${MK.inbox ? `${cx.length} entrega(s)${ouro ? ' · ' + mkFmt(ouro) + ' ouro' : ''} · lida ${mkHora(MK.inbox_t)}` : 'ainda não lida'} — o ouro das vendas só entra na carteira depois de resgatar; item resgatado vai para a mochila (sem espaço: depósito → Resgatar).</div>`;
        cx.slice(0, 50).forEach(x => { h += `<div class="tb-lin"><span>${escHtml(mkDescEntrega(x))}</span><span class="tb-mut">${escHtml(MK_MOTIVO_CAIXA[x.reason] || x.reason || '')}</span></div>`; });
        if (cx.length >= 50) h += `<div class="tb-mut">a caixa mostra 50 por vez — resgate e leia de novo.</div>`;
        return h;
    }
    /* v2.11 — ABA MERCADO: status + ATUALIZAR no topo; sub-abas Anunciar /
     * Meus anúncios / Caixa. Estado "ocupado" em MK (o repinte não reabilita
     * botão nenhum no meio da fila). */
    function telaMercado() {
        mkGarantirCss();
        MK.pintadas = []; MK.ordPintadas = [];
        const sub = ler('mercado_sub', 'anunciar');
        const prem = mkPremiumAgora();
        const premTxt = prem === true ? `<span class="tb-ok">Premium ✓ até ${escHtml(new Date(Date.parse(MK.premiumAte)).toLocaleDateString('pt-BR'))}</span>`
            : prem === false ? '<span class="tb-ruim">sem Premium</span>' : '<span title="o welcome do socket não passou pelo helper (F5 com ele instalado)">Premium ?</span>';
        const acoes = mkAcoesNoMinuto(MK.envios, Date.now());
        const v = MK.t ? mkVista() : null;
        const nMinhas = MK.minhas ? MK.minhas.filter(o => o && o.status === 'OPEN').length : null, nCaixa = MK.inbox ? MK.inbox.length : null;
        let h = `<div id="tb-mk"><div class="tb-linha">
            <button type="button" class="tb-bt ${MK.ocupado ? '' : 'pri'}" id="tb-mk-atualizar">${MK.ocupado ? 'PARAR' : 'ATUALIZAR'}</button>
            <span class="mk-st">${premTxt}<span>taxa ${escHtml(String(Math.round((MK.taxa != null ? MK.taxa : MK_TAXA_WIKI) * 1000) / 10).replace('.', ','))}%${MK.taxaWiki || MK.taxa == null ? ' (wiki)' : ''}</span><span class="${acoes >= MK_ACOES_FOLGA ? 'tb-av' : ''}">ações ${acoes}/20 no último min</span>${MK.t ? `<span>lido ${mkHora(MK.t)}</span>` : ''}</span></div>`;
        if (MK.ocupado) h += `<div class="mk-prog" role="status">${escHtml(MK.progresso || MK.ocupado + '…')}</div>`;
        if (MK.erro) h += `<div class="mk-ruim">${escHtml(MK.erro)}</div>`;
        const abas = [['anunciar', 'Anunciar', v ? v.plano.n : null], ['meus', 'Meus anúncios', nMinhas], ['caixa', 'Caixa', nCaixa]];
        h += `<div class="tb-sub" role="tablist">${abas.map(([k, n, c]) => `<button type="button" id="tb-mk-sub-${k}" class="${k === sub ? 'on' : ''}" role="tab" aria-selected="${k === sub}">${n}${c ? ` <b>${c}</b>` : ''}</button>`).join('')}</div>`;
        h += sub === 'meus' ? mkTelaMeus() : sub === 'caixa' ? mkTelaCaixa() : mkTelaAnunciar(v || { linhas: [], fora: [], plano: { n: 0, itens: [], taxa: 0, liquido: 0 } });
        h += aj('mk-ajuda', 'Preço sugerido: menor anúncio de OUTRO vendedor −1 (as suas ordens não contam; se o menor já é seu, fica o seu); sem concorrente, a média dos últimos 30 dias; sem histórico, digite. Forjado: só cópias da mesma raridade, do mesmo refino e com os MESMOS atributos escritos nos encaixes (uma dark armor com regen. de mana vale 30× uma com resistência); sem cópia igual à venda, a linha mostra a faixa dos outros encaixes e você digita. Nunca abaixo do NPC: se o que sobra depois da taxa não passa do que o NPC paga, a linha vira "vender no NPC". Fora da lista: selado, imbuído, protegido, usado, o melhor e a reserva de cada personagem (aba Equip) e a sua lista "nunca vender" do Auto Hunt. Taxa de 5 % paga ao anunciar e que NUNCA volta; ordem vale 3 dias; o mercado não cruza ordens; o ouro da venda cai na Caixa. Ritmo: 1 pedido a cada 3,5 s (limite do jogo: 20 ações/min). Anunciar: retira do depósito → confere a mochila → cria a ordem → próximo.');
        return h + '</div>';
    }
    function ligarMercado() {
        const at = $('#tb-mk-atualizar');
        if (at) at.onclick = () => { if (MK.ocupado) { MK.parar = true; avisar('mercado', 'mercado: paro depois do pedido atual', 'info'); } else mkAtualizar(); };
        ['anunciar', 'meus', 'caixa'].forEach(k => { const b = $('#tb-mk-sub-' + k); if (b) b.onclick = () => { guardar('mercado_sub', k); MK.conf = null; renderizar(); }; });
        const eqb = $('#tb-mk-equip'); if (eqb) eqb.onclick = () => { if (!EQUIP.lendo && !MK.ocupado) equipAtualizar().then(() => renderizar()); };
        (MK.pintadas || []).forEach((l, i) => {
            const c = $('#tb-mk-c-' + i);
            if (c) c.onchange = () => { if (MK.ocupado || l.bloqueio) return; if (c.checked) MK.marcados.add(l.chave); else MK.marcados.delete(l.chave); MK.conf = null; renderizar(); };
            const p = $('#tb-mk-p-' + i);
            if (!p) return;
            /* digitar não repinta (perderia o foco); o total do rodapé muda no change */
            p.oninput = () => { const s = String(p.value == null ? '' : p.value).trim(); if (s === '') delete MK.digitados[l.chave]; else MK.digitados[l.chave] = s; MK.foco = p.id; };
            p.onchange = () => { MK.conf = null; renderizar(); };
            p.onfocus = () => { MK.foco = p.id; };
            p.onblur = () => { setTimeout(() => { if (MK.foco === p.id && p.isConnected && document.activeElement !== p) MK.foco = null; }, 0); }; // repinte (campo fora da página) não conta
        });
        const todos = $('#tb-mk-todos'); if (todos) todos.onclick = () => { if (MK.ocupado) return; (MK.pintadas || []).forEach(l => { if (!l.bloqueio) MK.marcados.add(l.chave); }); MK.conf = null; renderizar(); };
        const nenhum = $('#tb-mk-nenhum'); if (nenhum) nenhum.onclick = () => { MK.marcados.clear(); MK.conf = null; renderizar(); };
        const an = $('#tb-mk-anunciar'); if (an) an.onclick = () => { if (MK.ocupado) return; const p = mkVista().plano; if (!p.n) return; mkToque('anunciar', p.assinatura, mkAnunciar); };
        const rev = $('#tb-mk-revisar'); if (rev) rev.onclick = () => mkRevisar();
        (MK.ordPintadas || []).forEach((l, i) => { const b = $('#tb-mk-x-' + i); if (b) b.onclick = () => { if (!MK.ocupado) mkToque('cancelar:' + l.id, l.id + '|' + l.qtd, () => mkCancelar(l)); }; });
        const cx = $('#tb-mk-caixa'); if (cx) cx.onclick = () => mkLerCaixa();
        const rg = $('#tb-mk-resgatar'); if (rg) rg.onclick = () => mkResgatarTudo();
        /* o repinte (resposta do socket) volta o foco para o campo de preço em edição */
        if (MK.foco) { const f = $('#' + MK.foco); if (f && document.activeElement !== f) { try { f.focus(); } catch { /* campo sem foco */ } } }
    }
    /* @@MERCADO-FIM */

    /* @@DIAGNOSTICO-INICIO */
    /* =========================================================================
     *  ⭐ v2.11 — DIAGNÓSTICO (só leitura; nada é enviado ao jogo)
     *
     *  Várias peças da 2.11 leem dados que ninguém viu ao vivo com a conta
     *  logada (chaves, bestiário, prey, meta, skills, inventário, painel de
     *  venda). O diagnóstico confere, num clique, se cada um está chegando no
     *  formato que o código espera e monta um relatório para colar na conversa.
     *  Guarda só a FORMA das mensagens (nomes de campo e tipos) — nunca
     *  valores —, então não há token, ticket nem id de conta no relatório.
     * ====================================================================== */
    const DIAG = { formas: {}, vistos: {} };
    function diagForma(x, prof) {
        if (x === null) return 'null';
        if (Array.isArray(x)) return x.length ? `[${x.length}× ${prof < 3 ? diagForma(x[0], prof + 1) : '…'}]` : '[]';
        if (typeof x !== 'object') return typeof x;
        if (prof >= 3) return '{…}';
        const k = Object.keys(x).slice(0, 40);
        return '{' + k.map(c => c + ':' + diagForma(x[c], prof + 1)).join(', ') + (Object.keys(x).length > 40 ? ', …' : '') + '}';
    }
    function diagObservar(o) {
        if (!o || !o.type) return;
        DIAG.vistos[o.type] = (DIAG.vistos[o.type] || 0) + 1;
        const d = o.data && typeof o.data === 'object' ? o.data : null; if (!d) return;
        const guardarForma = (k, v) => { if (v !== undefined) DIAG.formas[k] = { forma: diagForma(v, 0), t: Date.now() }; };
        if (o.type === 'frame') {
            const st = d.state || {};
            guardarForma('frame.state (campos)', Object.fromEntries(Object.keys(st).map(k => [k, typeof st[k]])));
            guardarForma('frame.state.keyBag', st.keyBag);
            guardarForma('frame.state.inventory[0]', Array.isArray(st.inventory) ? st.inventory[0] : st.inventory);
            const p0 = Array.isArray(st.party) ? st.party.find(Boolean) : null;
            if (p0) guardarForma('frame.state.party[].skills', p0.skills);
            guardarForma('frame.analyzer', d.analyzer);
            guardarForma('frame.bestiaryKills', d.bestiaryKills);
            if (Array.isArray(d.events)) for (const e of d.events) if (e && e.kind && !DIAG.formas['evento ' + e.kind]) guardarForma('evento ' + e.kind, e);
        } else if (o.type === 'welcome' || o.type === 'resume') {
            guardarForma(o.type + ' (campos)', Object.fromEntries(Object.keys(d).map(k => [k, typeof d[k]])));
            guardarForma(o.type + '.meta', d.meta);
        } else if (/^meta|prey|market|depot_state|sell_result|ended$/.test(o.type)) {
            guardarForma(o.type, d);
        }
    }
    const DIAG_ANCORAS = ['rail-level-n', 'hud-gold', 'actionbar-explore', 'actionbar-selling', 'actionbar-depot', 'rail-backpack-toggle',
                          'lure-toggle', 'stop', 'hud-analyzer', 'scene-slot-attack-0', 'scene-slot-mana-0', 'party-member-KNIGHT'];
    function montarDiagnostico() {
        const L = [], ok = (s) => L.push('OK       ' + s), falta = (s) => L.push('FALTA    ' + s), ver = (s) => L.push('CONFERIR ' + s);
        const idade = (t) => t ? Math.round((Date.now() - t) / 1000) + ' s' : '—';
        L.push(`Tibidle Helper ${VERSAO} · diagnóstico ${new Date().toLocaleString('pt-BR')} · tela ${window.innerWidth}×${window.innerHeight}`);
        L.push('Só leitura: forma dos dados (campos e tipos), sem valores, token ou id.');
        L.push('');
        L.push('— Conexão');
        (CONTA ? ok : ver)('conta identificada: ' + (CONTA ? 'sim' : 'não (sem /auth/me)'));
        (socketAberto() ? ok : falta)('socket do jogo aberto');
        (ESTADO_WS.perfisDoServidor ? ok : falta)('perfis vieram do servidor (welcome/resume) — sem isto o APLICAR vai pelas janelas');
        for (const v of VOCS) (perfilReal(v) ? ok : falta)(`perfil real de ${v}`);
        (ESTADO_WS.worldToken ? ok : falta)('worldToken presente (dano real via /spell-numbers)');
        const fr = ESTADO_WS.frame;
        (fr && frameFresco() ? ok : ver)('frame do jogo: último há ' + idade(fr && fr.t) + (fr && frameFresco() ? '' : ' (entre numa caçada para ver)'));
        L.push('');
        L.push('— Catálogos');
        (CAT.hunts && CAT.hunts.length ? ok : falta)(`hunts: ${(CAT.hunts || []).length}`);
        (CAT.magias && CAT.magias.length ? ok : falta)(`magias: ${(CAT.magias || []).length}`);
        (CAT.bosses && CAT.bosses.length ? ok : ver)(`bosses: ${(CAT.bosses || []).length}`);
        (CAT.pocoes ? ok : ver)('poções: ' + (CAT.pocoes ? 'sim' : 'não'));
        for (const v of VOCS) { const n = danosMedidosNesteNivel(v); (n ? ok : ver)(`dano medido no nível atual — ${v}: ${n} magias`); }
        L.push('');
        L.push('— Dados que a 2.11 lê e ninguém viu ao vivo');
        const sk = ESTADO_WS.sk || {};
        for (const v of VOCS) { const x = sk[v] || {}; const ch = Object.keys(x); (ch.length ? ok : ver)(`skills lidas de ${v}: ${ch.length ? ch.map(k => k + '=' + x[k]).join(' ') : 'nenhuma'}`); }
        if (!sk.KNIGHT || sk.KNIGHT.melee == null) ver('corpo a corpo do Knight não lido — confira os nomes em "frame.state.party[].skills" abaixo');
        if (!sk.SORCERER || sk.SORCERER.ml == null) ver('nível mágico não lido — confira os nomes em "frame.state.party[].skills" abaixo');
        (PROG.chaves ? ok : ver)('mochila de chaves: ' + (PROG.chaves ? 'lida' : 'sem dado (entre numa caçada)'));
        (Object.keys(PROG.best || {}).length ? ok : ver)(`bestiário: ${Object.keys(PROG.best || {}).length} hunts com contador`);
        (PROG.meta ? ok : ver)('meta (prey, wildcards, auto leave): ' + (PROG.meta ? Object.keys(PROG.meta).join(', ') : 'não chegou — abra a Prey no jogo'));
        (fr && fr.an ? ok : ver)('analisador do jogo no frame: ' + (fr && fr.an ? 'sim' : 'não'));
        L.push('');
        L.push('— Tela do jogo (âncoras que o helper usa; muda conforme cidade/caçada)');
        const achou = DIAG_ANCORAS.filter(a => tid(a)), naoAchou = DIAG_ANCORAS.filter(a => !tid(a));
        (achou.length ? ok : ver)('visíveis agora: ' + (achou.join(', ') || 'nenhuma — abra o jogo logado'));
        if (naoAchou.length) ver('não visíveis agora: ' + naoAchou.join(', '));
        const sp = tid('sell-panel');
        if (sp) {
            const linha = sp.querySelector('[data-testid^="sell-row-"]'), caixa = sp.querySelector('[data-testid^="sell-check-"]');
            ok('painel de venda ABERTO — linha: ' + (linha ? linha.getAttribute('data-testid') : 'nenhuma') + ' · caixa: ' + (caixa ? caixa.getAttribute('data-testid') : 'nenhuma'));
            if (caixa) L.push('         caixa (HTML): ' + caixa.outerHTML.replace(/\s+/g, ' ').slice(0, 300));
        } else ver('painel de venda fechado — para conferir o "nunca vender", abra VENDER na cidade e rode de novo (não confirme a venda)');
        L.push('');
        L.push('— Erros desde que a página abriu');
        const lug = Object.entries(ERROS.porLugar || {});
        if (!lug.length) ok('nenhuma falha registrada');
        for (const [onde, x] of lug) ver(`${onde}: ${x.n}× (última: ${String(x.msg || '').slice(0, 120)})`);
        try { let tot = 0, nosso = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i), n = (localStorage.getItem(k) || '').length + k.length; tot += n; if (k.startsWith('tb_helper_')) nosso += n; } ok(`localStorage: ${Math.round(tot / 1024)} KB no total, ${Math.round(nosso / 1024)} KB do helper`); } catch (e) { ver('localStorage ilegível'); }
        L.push('');
        L.push('— Mensagens vistas (tipo: quantas)');
        L.push('         ' + (Object.entries(DIAG.vistos).map(([k, n]) => k + ':' + n).join(' · ') || 'nenhuma'));
        L.push('');
        L.push('— Forma dos dados (campos e tipos)');
        for (const [k, x] of Object.entries(DIAG.formas)) L.push(`  ${k} (há ${idade(x.t)}): ${x.forma.slice(0, 900)}`);
        return L.join('\n');
    }
    function rodarDiagnostico() {
        let txt;
        try { txt = montarDiagnostico(); } catch (e) { falhou('diagnóstico', e); return; }
        DIAG.ultimo = txt;
        const n = (re) => (txt.match(re) || []).length;
        const resumo = `diagnóstico: ${n(/^OK /gm)} ok · ${n(/^FALTA /gm)} faltando · ${n(/^CONFERIR /gm)} a conferir — relatório copiado/aberto numa aba nova`;
        try { navigator.clipboard.writeText(txt).catch(() => { }); } catch (e) { }
        try { const u = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' })); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000); } catch (e) { }
        if (typeof avisar === 'function') avisar('estado', resumo, n(/^FALTA /gm) ? 'erro' : 'ok'); else log(resumo, 'ok');
    }
    /* @@DIAGNOSTICO-FIM */

    /* @@TELAS-API-INICIO — aba Radar (2.13.0): funções puras, sem DOM e sem estado; testes/telas-api.test.js roda este trecho no node. */
    /* =========================================================================
     *  ⭐ v2.13.0 — RADAR (pedido do dono, 30/09: "coloque em novas telas, para
     *  não misturar com as que já utilizo"): ranking de todos os mapas sem
     *  caçar, loot ao vivo, alerta de preço no Mercado e relatório do dia.
     *  SÓ LEITURA: nada aqui envia comando de ação ao jogo.
     *
     *  O que é MEDIDO e o que é ESTIMADO:
     *    • medido: frame.analyzer (loot, xp, abates, gasto), Scan limpo, vendas;
     *    • estimado: xp/h e ouro/h de mapa sem Scan. abates/h = L·3600/(T+E+0,5·L),
     *      T = L·hp/dano da party (o motor de Magia), E = espera entre ondas.
     *      O loot do catálogo superestima 2–4× (TIBIDLE §12): o absoluto vem do
     *      fator calibrado nos Scans (padrão 0,35 sem Scan).
     *    • a API não traz o dano que o MONSTRO dá: o risco é aproximado pelo
     *      dano tomado nos Scans (∝ lure × xp por abate), pela margem de nível,
     *      pela nota do elemento e pelo que já aconteceu (hp mínimo, morte).
     * ====================================================================== */
    const TP_FATOR_LOOT_PADRAO = 0.35;
    const TP_DIAS_MAX = 30;
    const TP_ALERTA_MIN_MIN = 15; // vigiar: nunca menos de 15 min entre leituras
    const tpNum = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };
    const tpMin = (s) => String(s == null ? '' : s).toLowerCase().trim();
    const tpMediana = (a) => {
        const v = a.filter(x => Number.isFinite(x)).sort((x, y) => x - y);
        if (!v.length) return null;
        const m = v.length >> 1;
        return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    };
    const tpLim = (v, a, b) => Math.max(a, Math.min(b, v));
    const tpLure = (h) => { const t = h && h.lureTiers; return t && t.length ? Math.max(...t.map(x => x.max || x.min || 1)) : 1; };

    /* HP e XP médios por abate, ponderados pelo `weight` de cada monstro */
    function tpHpXpMedio(hunt) {
        const ms = (hunt && hunt.monsters) || [];
        let w = 0, hp = 0, xp = 0;
        for (const m of ms) { if (!m || typeof m !== 'object') continue; const p = Math.max(1, Number(m.weight) || 1); w += p; hp += (Number(m.health) || 0) * p; xp += (Number(m.experience) || 0) * p; }
        return w ? { hp: hp / w, xp: xp / w } : { hp: 0, xp: 0 };
    }

    /* Loot esperado por abate. tabela = /hunt/lootTable; precoDe(nome, item) →
     * {npc, mercado} (opcional; sem ele vale o `value` da tabela).
     * o.dropNerf = {factor, minChance, nomes[]}: só itens de codex CONHECIDOS
     * (a lista pública veio vazia em 30/09) caem por `factor`, sem passar abaixo
     * de minChance. cat = conta crua do catálogo (a mesma de ouroPorAbate);
     * npc/mercado = com o fator de loot e o de prey. */
    function tpLootAbate(tabela, precoDe, o) {
        o = o || {};
        const nerf = o.dropNerf && Number(o.dropNerf.factor) > 1 ? o.dropNerf : null;
        const codex = new Set(((nerf && nerf.nomes) || []).map(tpMin));
        const f = (tpNum(o.fatorLoot) != null ? o.fatorLoot : 1) * (tpNum(o.fatorPrey) != null ? o.fatorPrey : 1);
        let cat = 0, catMerc = 0;
        const porItem = [];
        for (const it of (Array.isArray(tabela) ? tabela : [])) {
            if (!it || !it.name) continue;
            let ch = Number(it.chance) || 0;
            if (nerf && !it.currency && codex.has(tpMin(it.name)) && ch > (Number(nerf.minChance) || 0)) ch = Math.max(Number(nerf.minChance) || 0, ch / nerf.factor);
            const esperado = ch / 100000 * (((Number(it.maxCount) || 1) + 1) / 2);
            const p = precoDe ? (precoDe(it.name, it) || {}) : {};
            const npc = p.npc != null ? Number(p.npc) || 0 : Number(it.value) || 0;
            const merc = p.mercado != null && Number(p.mercado) > npc ? Number(p.mercado) : null;
            cat += esperado * npc; catMerc += esperado * (merc != null ? merc : npc);
            porItem.push({ nome: it.name, chance: Number(it.chance) || 0, esperado, npc, mercado: merc, moeda: !!it.currency });
        }
        return { cat, catMerc, npc: cat * f, mercado: catMerc * f, porItem };
    }

    /* Valor de UM item: NPC (tabela do loot ou /prices) e mercado líquido da
     * taxa (= cliente: max(1, floor(unit × taxa))). unit = menor anúncio (se há
     * venda) ou a média de 30 d; sem negócio em 30 dias não há preço de mercado. */
    function tpValorItem(nome, f) {
        f = f || {};
        const n = tpMin(nome);
        const npc = f.npcTabela != null ? Number(f.npcTabela) || 0 : (f.npc && f.npc[n] != null ? Number(f.npc[n]) || 0 : null);
        const c = f.cat ? f.cat[n] : null;
        const s = f.stats ? f.stats[n] : null;
        const avg = s ? tpNum(s.avg != null ? s.avg : s.stats && s.stats.avg) : null;
        let unit = null, fonte = null;
        if (c && Number(c.trades30d) > 0) {
            if (Number(c.sellOrders) > 0 && tpNum(c.minSell) > 0) { unit = Number(c.minSell); fonte = 'minSell'; }
            else if (avg > 0) { unit = avg; fonte = 'media'; }
        }
        const taxa = tpNum(f.taxa) != null && f.taxa >= 0 && f.taxa < 1 ? f.taxa : 0.05;
        const mercado = unit != null ? Math.floor(unit) - Math.max(1, Math.floor(Math.floor(unit) * taxa)) : null;
        const melhor = mercado != null && mercado > (npc || 0) ? 'mercado' : 'npc';
        const ganhoPct = mercado != null && npc > 0 ? Math.round((mercado / npc - 1) * 100) : null;
        return { npc, mercado, melhor, ganhoPct, fonte, trades30d: c ? Number(c.trades30d) || 0 : 0 };
    }

    /* Calibração pelos Scans LIMPOS (não sujos, sem erro, nível ±2).
     * est = {id: {abH, cat, L, xpAbate}} — abH SEM calibrar (kAbates 1). */
    function tpCalibrar(scans, est, nivel) {
        est = est || {};
        const limpos = (Array.isArray(scans) ? scans : Object.values(scans || {})).filter(r => r && !r.suja && !r.erro && Number(r.abatesH) > 0 &&
            (!nivel || !r.nivel || Math.abs(r.nivel - nivel) <= 2));
        const kA = [], fL = [], aT = [];
        let teto = null;
        for (const r of limpos) {
            const e = est[r.id];
            if (e && e.abH > 0) kA.push(r.abatesH / e.abH);
            if (e && e.cat > 0 && r.lootH != null) fL.push(r.lootH / (r.abatesH * e.cat));
            if (e && e.L > 0 && e.xpAbate > 0 && Number(r.tomadoH) > 0) aT.push(r.tomadoH / (e.L * e.xpAbate));
            const k = r.razao && r.razao.porVoc && r.razao.porVoc.KNIGHT;
            if (k && Number(k.hpMin) >= 50 && Number(r.tomadoH) > 0) teto = Math.max(teto || 0, Number(r.tomadoH));
        }
        const mk = tpMediana(kA), mf = tpMediana(fL), ma = tpMediana(aT);
        return { kAbates: mk != null ? tpLim(mk, 0.5, 1.5) : 1, fatorLoot: mf != null ? tpLim(mf, 0.15, 1) : TP_FATOR_LOOT_PADRAO,
                 aTomado: ma, tetoTomadoSeguro: teto, n: limpos.length, nAbates: kA.length, nLoot: fL.length };
    }

    /* v2.14.6 — O QUE A PARTY JÁ AGUENTOU (dono, 02/10: "a simulação me jogou para mapas muito difíceis" — morreu num mapa
     * do topo do Radar). O dano tomado era estimado pelo xp por abate, que quase não muda entre mapas (Orc 26, Vampire 33,
     * Dragon 38, Hellspawn 41,5): TODOS os 70 mapas saíam "risco baixo, 0 pontos". A API não diz quanto o monstro bate; o
     * que separa os mapas é a VIDA do monstro (234 · 577 · 1.282 · 1.520) e o nível mínimo. O envelope é o mais forte em
     * que a party caçou sem morrer. lista = [{title, hp, levelMin, ok}] (ok = sem morte e, se medido, Knight ≥ 40 %). */
    function tpEnvelope(lista) {
        const ok = (lista || []).filter(x => x && x.ok && Number(x.hp) > 0);
        if (!ok.length) return null;
        const top = ok.reduce((a, b) => (Number(b.hp) > Number(a.hp) ? b : a));
        return { hp: Number(top.hp), title: top.title || null, lvl: Math.max(...ok.map(x => Number(x.levelMin) || 0)), n: ok.length };
    }
    /* Risco por pontos. Bloqueado = nível abaixo do mínimo. */
    function tpRisco(x) {
        x = x || {};
        const motivos = [];
        if (x.levelMin && x.nivel && x.levelMin > x.nivel) return { nivel: 'bloqueado', pts: 99, motivos: ['nível ' + x.levelMin + ' exigido (você tem ' + x.nivel + ')'] };
        let pts = 0, novo = false;
        if (x.levelMin && x.nivel && x.levelMin >= x.nivel - 5) { pts += 1; motivos.push('nível mínimo ' + x.levelMin + ', perto do seu (' + x.nivel + ')'); }
        /* v2.14.6 — mapa nunca testado contra o envelope do que a party já aguentou (o mapa medido limpo já foi testado) */
        if (!x.testado) {
            const env = x.envelope || null, hp = Number(x.hp) || 0;
            if (!env) { if (hp > 0) { pts += 2; novo = true; motivos.push('nenhum mapa caçado para comparar: a força dos monstros é desconhecida'); } }
            else {
                const r = hp / env.hp;
                if (r > 1.5) { pts += 4; novo = true; motivos.push(`monstros com ${Math.round(hp)} de vida, ${String(Math.round(r * 10) / 10).replace('.', ',')}× o mais forte que a party já aguentou (${env.title || '?'}, ${Math.round(env.hp)}) — nunca testado`); }
                else if (r > 1.15) { pts += 2; novo = true; motivos.push(`monstros com ${Math.round(hp)} de vida, acima do mais forte que a party já aguentou (${env.title || '?'}, ${Math.round(env.hp)}) — nunca testado`); }
                if (x.levelMin && env.lvl && x.levelMin > env.lvl) { pts += 2; novo = true; motivos.push(`nível mínimo ${x.levelMin}, acima de tudo que a party já caçou (até ${env.lvl})`); }
            }
        }
        const tomado = x.aTomado > 0 && x.L > 0 && x.xpAbate > 0 ? x.aTomado * x.L * x.xpAbate : null;
        if (tomado != null && x.tetoTomado > 0 && tomado > x.tetoTomado * 1.5) { pts += 2; motivos.push('dano tomado estimado ' + Math.round(tomado / 1000) + 'k/h, acima de 1,5× o maior já aguentado'); }
        if (x.T > 25) { pts += 1; motivos.push('a onda leva ' + Math.round(x.T) + ' s para morrer'); }
        if (x.notaParty != null && x.notaParty < 60) { pts += 1; motivos.push('elementos fracos contra o mapa (nota ' + Math.round(x.notaParty) + ')'); }
        if (x.hpMinK != null && x.hpMinK < 40) { pts += 2; motivos.push('o Knight já desceu a ' + Math.round(x.hpMinK) + ' % de vida aqui'); }
        if (x.mortes > 0) { pts += 3; motivos.push(x.mortes + ' morte' + (x.mortes > 1 ? 's' : '') + ' registrada' + (x.mortes > 1 ? 's' : '') + ' neste mapa'); }
        if (Array.isArray(x.imunes) && x.imunes.length) motivos.push('imunes: ' + x.imunes.join(', '));
        return { nivel: pts >= 4 ? 'alto' : pts >= 2 ? 'médio' : 'baixo', pts, motivos, tomadoEst: tomado, novo };
    }

    /* O NÚCLEO: um mapa. ent = {hunt, nivel, premium, motor, loot, ritmo:{E},
     * calib, medido, extras:{municaoH, vidaH}, fatorPrey, taxaXp, mortes, imunes} */
    function tpEstimar(ent) {
        const h = ent.hunt || {}, calib = ent.calib || { kAbates: 1, fatorLoot: TP_FATOR_LOOT_PADRAO, n: 0 };
        const L = tpLure(h), { hp, xp } = tpHpXpMedio(h);
        const motor = ent.motor || null, notas = [];
        const E = ent.ritmo && tpNum(ent.ritmo.E) != null ? Math.max(0, ent.ritmo.E) : 10;
        const fPrey = tpNum(ent.fatorPrey) != null ? ent.fatorPrey : 1;
        let bloqueio = null;
        if (h.levelMin && ent.nivel && h.levelMin > ent.nivel) bloqueio = 'nível ' + h.levelMin;
        else if (h.premium === true && ent.premium === false) bloqueio = 'premium';
        /* v2.14.8 — ilha que a conta não destravou (shell.unlockedIslands; Tibidle Island é de todos). Lista
         * desconhecida (null) não bloqueia, como o premium desconhecido. */
        else if (h.island && h.island !== 'tibidle_island' && Array.isArray(ent.ilhas) && !ent.ilhas.includes(h.island)) bloqueio = 'ilha fechada';
        let T = null, abH = null, custoH = null;
        if (motor && (motor.abH > 0 || motor.danoS > 0)) {
            T = motor.T > 0 ? motor.T : motor.danoS > 0 ? L * hp / motor.danoS : null;
            abH = motor.abH > 0 ? motor.abH : calib.kAbates * L * 3600 / (T + E + 0.5 * L);
            custoH = motor.custoH != null ? motor.custoH : motor.custoPorAbate != null ? abH * motor.custoPorAbate : null;
        } else notas.push('sem dano: o planejador não montou kit (dano das magias não medido?)');
        const loot = ent.loot || null;
        if (!loot) notas.push('sem tabela de loot');
        const lootH = abH != null && loot ? abH * loot.cat * calib.fatorLoot * fPrey : null;
        const lootHMerc = abH != null && loot ? abH * (loot.catMerc != null ? loot.catMerc : loot.cat) * calib.fatorLoot * fPrey : null;
        const ex = ent.extras || {};
        if (custoH != null) {
            if (ex.municaoH != null) custoH += ex.municaoH;
            if (ex.vidaH != null) custoH += ex.vidaH;
            if (ex.vidaH == null && !ent.medido) notas.push('cura não medida');
        }
        const xpH = abH != null ? abH * xp : null;
        const taxa = tpNum(ent.taxaXp);
        let r = { id: h.id, title: h.title, levelMin: h.levelMin || 0, premium: h.premium === true, L, hp: Math.round(hp), xpAbate: Math.round(xp * 10) / 10,
                  T: T != null ? Math.round(T * 10) / 10 : null, abH: abH != null ? Math.round(abH) : null,
                  xpH: xpH != null ? Math.round(xpH) : null, xpHBonus: xpH != null && taxa > 0 ? Math.round(xpH * taxa / 100) : null,
                  lootH: lootH != null ? Math.round(lootH) : null, lootHMerc: lootHMerc != null ? Math.round(lootHMerc) : null,
                  custoH: custoH != null ? Math.round(custoH) : null,
                  ouroH: lootH != null && custoH != null ? Math.round(lootH - custoH) : null,
                  ouroHMerc: lootHMerc != null && custoH != null ? Math.round(lootHMerc - custoH) : null,
                  porVoc: motor ? motor.porVoc || null : null, nota: motor && motor.nota != null ? motor.nota : null, imunes: ent.imunes || [],
                  fonte: 'estimado', medido: null, est: null, bloqueio, notas,
                  confianca: calib.n > 0 ? 'calibrado' : 'baixa' };
        const m = ent.medido;
        const limpo = m && !m.suja && !m.erro && Number(m.abatesH) > 0 && (!ent.nivel || !m.nivel || Math.abs(m.nivel - ent.nivel) <= 2);
        if (limpo) {
            r.est = { xpH: r.xpH, ouroH: r.ouroH, abH: r.abH };
            /* v2.13.5 — o ouro do medido é o ESTÁVEL do Scan (o ranking do Scan também é): o bruto de 4 min
             * vira +18,8k/h com uma black pearl e uma spike sword (Vampire hell, 01/10: estável −1,4k/h) */
            const est = m.estavelH != null && Number.isFinite(+m.estavelH);
            r = Object.assign(r, { fonte: 'medido', confianca: 'medido', abH: Math.round(m.abatesH), xpH: m.xpRawH != null ? Math.round(m.xpRawH) : m.xpH != null ? Math.round(m.xpH) : r.xpH,
                                   lootH: est && m.supH != null ? Math.round(+m.estavelH + +m.supH) : m.lootH != null ? Math.round(m.lootH) : r.lootH, custoH: m.supH != null ? Math.round(m.supH) : r.custoH,
                                   ouroH: est ? Math.round(+m.estavelH) : m.ouroH != null ? Math.round(m.ouroH) : r.ouroH, sorteH: est && m.sorteH != null ? Math.round(m.sorteH) : null,
                                   medido: { t: m.t || null, nivel: m.nivel || null, minutos: m.minutos || null, tomadoH: m.tomadoH != null ? m.tomadoH : null, modelo: m.modelo || null } });
            /* v2.13.3 — o tempo de limpar a onda medido no Scan manda sobre o simulado */
            const ondaMed = m.razao && m.razao.ondas && tpNum(m.razao.ondas.matar);
            if (ondaMed != null && ondaMed >= 0) r.T = Math.round(ondaMed * 10) / 10;
            if (r.lootHMerc != null && r.est && r.lootH != null && lootH > 0) r.lootHMerc = Math.round(r.lootH * lootHMerc / lootH);
            r.ouroHMerc = r.lootHMerc != null && r.custoH != null ? r.lootHMerc - r.custoH : null;
        }
        const hpMinK = limpo && m.razao && m.razao.porVoc && m.razao.porVoc.KNIGHT ? tpNum(m.razao.porVoc.KNIGHT.hpMin) : null;
        r.risco = tpRisco({ nivel: ent.nivel, levelMin: h.levelMin, L, xpAbate: xp, T, notaParty: r.nota, imunes: r.imunes,
                            aTomado: calib.aTomado, tetoTomado: calib.tetoTomadoSeguro, hpMinK, mortes: ent.mortes || 0,
                            hp, envelope: ent.envelope || null, testado: !!limpo && (hpMinK == null || hpMinK >= 40) });
        if (bloqueio === 'premium') r.risco = { nivel: 'bloqueado', pts: 99, motivos: ['mapa premium e a conta está sem Premium'] };
        if (bloqueio === 'ilha fechada') r.risco = { nivel: 'bloqueado', pts: 99, motivos: ['ilha ' + String(h.island).replace(/_/g, ' ') + ' não destravada nesta conta (as ilhas abrem no NPC Silas)'] };
        return r;
    }

    /* Nota da party contra o mapa: o elemento da magia principal de cada um,
     * pela nota do mapa (área ou alvo único), ponderada pelo dano. */
    function tpNotaParty(porVoc, notasEl, magiaDe) {
        if (!porVoc || !notasEl) return { nota: null, porVoc: {} };
        let s = 0, w = 0; const pv = {};
        for (const [voc, v] of Object.entries(porVoc)) {
            if (!v || !v.magia) continue;
            const m = magiaDe ? magiaDe(v.magia) : null;
            const el = m && m.combatType;
            if (!el) continue;
            const tab = m.area ? notasEl.notasArea : notasEl.notas;
            const nota = tab && tab[el] != null ? tab[el] : 100;
            const d = Math.max(1, Number(v.dano) || 1);
            pv[voc] = { elem: el, nota };
            s += nota * d; w += d;
        }
        return { nota: w ? Math.round(s / w) : null, porVoc: pv };
    }

    /* Ordem: 'xp' | 'ouro' | 'dois' (xp/xpMax + ouro/ouroMax − 0,15·pts).
     * filtro.esconder tira risco alto e bloqueados. Desempate pelo título. */
    /* v2.13.3 — COMBOS PARA LIMPAR A ONDA (dono, 01/10: "toda hunt tem tempo de volta fixo; a ideia é
     * matar o bicho num hit só — o pessoal acha o mapa em que mata a onda com um combo"). A fila do jogo
     * dispara a cada 2 s (recarga do grupo): a 1ª rajada sai em t = 0, a 2ª em t = 2 s… Então a onda
     * limpa em T segundos precisou de floor(T / 2) + 1 rajadas. 1 combo = o mapa rende o máximo que o
     * tempo de volta dele permite: o próximo passo é subir de mapa (mais xp por monstro). */
    function tpCombos(T) {
        const t = T == null || T === '' ? null : tpNum(T);
        return t == null || t < 0 ? null : Math.floor(t / 2) + 1;
    }
    function tpOrdenar(linhas, modo, filtro) {
        let v = (linhas || []).filter(Boolean);
        if (filtro && filtro.esconder) v = v.filter(l => !l.bloqueio && !(l.risco && (l.risco.nivel === 'alto' || l.risco.nivel === 'bloqueado')));
        const ok = v.filter(l => !l.bloqueio);
        const xpMax = Math.max(1, ...ok.map(l => l.xpH || 0)), ouroMax = Math.max(1, ...ok.map(l => l.ouroH || 0));
        const nota = (l) => {
            if (modo === 'ouro') return l.ouroH;
            if (modo === 'combo') { const c = tpCombos(l.T); return c == null || l.xpH == null ? null : -c * 1e9 + l.xpH; } // menos combos primeiro; empate: mais xp
            if (modo === 'dois') return l.xpH == null ? null : l.xpH / xpMax + (l.ouroH || 0) / ouroMax - 0.15 * Math.min(10, (l.risco && l.risco.pts) || 0);
            return l.xpH;
        };
        return v.map(l => ({ l, n: l.bloqueio ? null : nota(l) })).sort((a, b) => {
            const na = a.n == null ? -Infinity : a.n, nb = b.n == null ? -Infinity : b.n;
            if (na !== nb) return nb - na;
            return String(a.l.title || '').localeCompare(String(b.l.title || ''));
        }).map(x => x.l);
    }

    /* Delta do analisador entre dois frames. prev = {huntId, an}. Reset (delta
     * zero e base nova): primeiro frame, outra caçada, relógio/xp/abates/loot
     * voltando, ou um drop diminuindo (o analisador foi zerado). */
    function tpDeltaAnalisador(prev, an, huntId) {
        const base = { huntId: huntId == null ? null : huntId, an: { elapsedMs: +an.elapsedMs || 0, xp: +an.xp || 0, xpRaw: +an.xpRaw || 0, kills: +an.kills || 0,
                                                                    loot: +an.lootGold || 0, sup: +an.suppliesGold || 0, drops: Object.assign({}, an.drops || {}) } };
        const zero = { seg: 0, xp: 0, xpRaw: 0, kills: 0, loot: 0, sup: 0, drops: {} };
        if (prev && prev.novo && !prev.an && prev.huntId === base.huntId && base.an.elapsedMs < 5000) prev = { huntId: prev.huntId, an: { elapsedMs: 0, xp: 0, xpRaw: 0, kills: 0, loot: 0, sup: 0, drops: {} } };
        if (!prev || !prev.an || prev.huntId !== base.huntId) return { delta: zero, base, reset: !!prev };
        const a = base.an, b = prev.an;
        const caiu = a.elapsedMs < b.elapsedMs || a.xp < b.xp || a.kills < b.kills || a.loot < b.loot || a.sup < b.sup ||
            Object.keys(b.drops || {}).some(k => (Number(a.drops[k]) || 0) < (Number(b.drops[k]) || 0));
        if (caiu) return { delta: zero, base, reset: true };
        const drops = {};
        for (const k of Object.keys(a.drops)) { const d = (Number(a.drops[k]) || 0) - (Number((b.drops || {})[k]) || 0); if (d > 0) drops[k] = d; }
        return { delta: { seg: (a.elapsedMs - b.elapsedMs) / 1000, xp: a.xp - b.xp, xpRaw: a.xpRaw - b.xpRaw, kills: a.kills - b.kills, loot: a.loot - b.loot, sup: a.sup - b.sup, drops }, base, reset: false };
    }
    /* v2.13.5 — página aberta no MEIO de uma caçada (01/10: 3h32 caçando com a página fechada, o dono
     * encerrou 4 min depois de abrir; o Dia ficou só com os 4 min). Sem base desta caçada, o 1º frame
     * virava base com delta 0 e o resumo do fim (base < 90 s) não somava nada. Devolve o que o analisador
     * já tinha (a caçada até agora) para entrar como "offline", ou null quando: hunt_started foi visto
     * (caçada nova — o 1º frame com > 5 s é o analisador antigo), a base guardada é desta caçada (mesmo
     * início, ±5 min: F5 no meio; os frames dão o delta) ou a caçada tem menos de 1 min. Base de < 2 min
     * no mesmo mapa é sempre desta caçada (com a página aberta, recomeçar passa pelo hunt_started). */
    const TP_MESMA_CACADA_MS = 5 * 60000, TP_BASE_VIVA_MS = 2 * 60000;
    function tpTrechoAntes(base, an, huntId, agora) {
        if (huntId == null || (base && base.novo)) return null; // v2.13.6: caçada ainda desconhecida (frame antes do resume) nunca conta
        const el = +an.elapsedMs || 0;
        if (el < 60000) return null;
        if (base && base.an && base.t && base.huntId === (huntId == null ? null : huntId) &&
            (agora - base.t < TP_BASE_VIVA_MS || Math.abs((base.t - (+base.an.elapsedMs || 0)) - (agora - el)) <= TP_MESMA_CACADA_MS)) return null;
        return { seg: el / 1000, xp: +an.xp || 0, xpRaw: +an.xpRaw || 0, kills: +an.kills || 0, loot: +an.lootGold || 0, sup: +an.suppliesGold || 0, drops: Object.assign({}, an.drops || {}) };
    }

    /* raro = chance < 1 % no catálogo, ou vale ≥ 20× o loot médio por abate */
    function tpRaro(item, valorUnit, lootAbate) {
        if (item && item.currency) return false;
        if (!(Number(valorUnit) > 0)) return false;
        /* v2.13.0 — só chance < 1 % pegava metade da tabela (corncob, orc leather de 1–30 de ouro) e
         * enchia o Log: agora a chance baixa precisa valer também ≥ 5× o loot médio por abate */
        const la = Number(lootAbate) > 0 ? Number(lootAbate) : null;
        if (item && Number(item.chance) > 0 && Number(item.chance) < 1000) return la == null || valorUnit >= 5 * la;
        return la != null && valorUnit >= 20 * la;
    }

    /* Alerta de preço. item = {nome, modo:'vender'|'comprar', pct (acima/abaixo
     * da média 30 d; o formulário sugere 20), preco (limite)}; cat = market_catalog indexado;
     * media = {avg} da média 30 d. Sem `pct` vale só o preço. Devolve null ou {chave, tipo, msg, preco}. */
    /* v2.13.2 — opc = {meus: [preços dos SEUS anúncios abertos deste item], npc: o que o NPC paga}:
     * o "vale anunciar" não dispara quando o menor anúncio é o seu (só você vende) nem quando o
     * líquido depois da taxa não passa do NPC (achado da verificação da 2.13.0). */
    function tpAvaliarAlerta(item, cat, media, taxa, opc) {
        opc = opc || {};
        if (!item || !item.nome || !cat) return null;
        const n = tpMin(item.nome), c = cat[n];
        if (!c) return null;
        const avg = media && Number(media.avg) > 0 ? Number(media.avg) : null;
        const pct = item.pct != null && item.pct !== '' && tpNum(item.pct) != null ? Math.max(0, Number(item.pct)) : null; // sem % = só o preço
        const lim = tpNum(item.preco) > 0 ? Number(item.preco) : null;
        const minSell = Number(c.sellOrders) > 0 && Number(c.minSell) > 0 ? Number(c.minSell) : null;
        const maxBuy = Number(c.maxBuy) > 0 ? Number(c.maxBuy) : null;
        const fmt = (v) => Math.round(v).toLocaleString('pt-BR');
        const acima = (v) => (avg && pct != null && v >= avg * (1 + pct / 100)) || (lim && v >= lim);
        const t = tpNum(taxa) != null ? taxa : 0.05;
        if ((item.modo || 'vender') === 'vender') {
            if (maxBuy && acima(maxBuy)) {
                return { chave: n + '|compra', tipo: 'compra', preco: maxBuy,
                         msg: `${item.nome}: COMPRA aberta a ${fmt(maxBuy)}${avg ? ` (média 30 d ${fmt(avg)})` : ''} — aceitar no jogo é na hora e sem taxa` };
            }
            const meus = (opc.meus || []).map(Number).filter(v => v > 0);
            const souOMenor = minSell && meus.length && Math.min(...meus) <= minSell && Number(c.sellOrders) <= meus.length;
            const liquido = minSell ? minSell - 1 - Math.max(1, Math.floor((minSell - 1) * t)) : 0;
            const npc = Number(opc.npc) > 0 ? Number(opc.npc) : 0;
            if (minSell && acima(minSell) && !souOMenor && liquido > npc) {
                return { chave: n + '|vender', tipo: 'vender', preco: minSell,
                         msg: `${item.nome}: vale anunciar — menor anúncio ${fmt(minSell)}${avg ? ` (${Math.round((minSell / avg - 1) * 100)} % acima da média 30 d)` : ''}; líquido ${fmt(minSell - 1 - Math.max(1, Math.floor((minSell - 1) * t)))} anunciando a ${fmt(minSell - 1)}` };
            }
            return null;
        }
        if (minSell && ((lim && minSell <= lim) || (avg && pct != null && minSell <= avg * (1 - pct / 100)))) {
            return { chave: n + '|barato', tipo: 'barato', preco: minSell, msg: `${item.nome}: barato: ${fmt(minSell)}${avg ? ` (média 30 d ${fmt(avg)})` : ''}` };
        }
        return null;
    }
    /* vigiar ligado e ≥ max(15, min) minutos desde a última leitura */
    function tpAlertaDevido(cfg, est, agora) {
        if (!cfg || cfg.vigiar !== true) return false;
        const min = Math.max(TP_ALERTA_MIN_MIN, Number(cfg.min) || 0);
        return agora - ((est && Number(est.ult)) || 0) >= min * 60000;
    }

    /* ---- relatório do dia ---- */
    const tpDiaChave = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const tpDiaNovo = () => ({ seg: 0, xp: 0, xpRaw: 0, kills: 0, loot: 0, sup: 0, mortes: 0, offline: 0, mapas: {}, ciclos: { n: 0, ouro: 0, falhas: 0 }, npc: 0, mercado: 0, mercIds: [], raros: [] });
    function tpSomarDia(dia, delta, f, huntId, title) {
        for (const k of ['seg', 'xp', 'xpRaw', 'kills', 'loot', 'sup']) dia[k] += (Number(delta[k]) || 0) * f;
        const nome = title || (huntId != null ? 'hunt ' + huntId : '?');
        const m = dia.mapas[nome] || (dia.mapas[nome] = { seg: 0, xp: 0, loot: 0, sup: 0 });
        m.seg += (Number(delta.seg) || 0) * f; m.xp += (Number(delta.xp) || 0) * f; m.loot += (Number(delta.loot) || 0) * f; m.sup += (Number(delta.sup) || 0) * f;
    }
    /* ev: {tipo:'delta', huntId, title, delta} | {tipo:'morte'} | {tipo:'ciclo', reg}
     *   | {tipo:'npc', ouro} | {tipo:'mercado', id, ouro} | {tipo:'offline', summary, delta?}
     *   | {tipo:'raro', nome, n, valor}. Muta e devolve `dias`. */
    function tpAcumularDia(dias, t, ev) {
        dias = dias || {};
        if (!ev || !ev.tipo) return dias;
        const dia = (c) => dias[c] || (dias[c] = tpDiaNovo());
        const hoje = tpDiaChave(t);
        /* v2.13.2 — reparte um trecho [t − seg, t] entre os dias que ele cruza (quantos forem): a
         * caçada fechada com a página fechada (offline) entrava inteira no dia do resumo */
        const repartir = (d, huntId, title) => {
            const ms = (Number(d.seg) || 0) * 1000;
            if (!(ms > 0) || tpDiaChave(t - ms) === hoje) { tpSomarDia(dia(hoje), d, 1, huntId, title); return; }
            let fim = t;
            for (let i = 0; i < 400 && fim > t - ms; i++) {
                const x = new Date(fim - 1), meiaNoite = new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
                const ini = Math.max(t - ms, meiaNoite);
                tpSomarDia(dia(tpDiaChave(fim - 1)), d, tpLim((fim - ini) / ms, 0, 1), huntId, title);
                fim = ini;
            }
        };
        if (ev.tipo === 'delta') repartir(ev.delta || {}, ev.huntId, ev.title);
        else if (ev.tipo === 'morte') dia(hoje).mortes++;
        else if (ev.tipo === 'ciclo') { const c = dia(hoje).ciclos, r = ev.reg || {}; c.n++; c.ouro += Number(r.ouro) || 0; if (r.erro) c.falhas++; }
        else if (ev.tipo === 'npc') dia(hoje).npc += Number(ev.ouro) || 0;
        else if (ev.tipo === 'mercado') {
            const x = dia(hoje);
            if (ev.id != null && x.mercIds.includes(ev.id)) return dias;
            if (ev.id != null) { x.mercIds.push(ev.id); while (x.mercIds.length > 200) x.mercIds.shift(); }
            x.mercado += Number(ev.ouro) || 0;
        } else if (ev.tipo === 'offline') {
            const s = ev.summary || {}, d = ev.delta || tpDeltaResumo(null, s);
            if (!d) return dias;
            repartir(d, s.huntId, tpTituloResumo(s));
            dia(hoje).offline++;
        } else if (ev.tipo === 'raro') {
            const r = dia(hoje).raros; r.push({ t, nome: String(ev.nome), n: Number(ev.n) || 1, valor: Number(ev.valor) || 0 });
            while (r.length > 20) r.shift();
        }
        return dias;
    }
    function tpPodarDias(dias, max) {
        const k = Object.keys(dias || {}).filter(x => /^\d{4}-\d\d-\d\d$/.test(x)).sort().reverse().slice(0, max || TP_DIAS_MAX);
        return Object.fromEntries(k.map(x => [x, dias[x]]));
    }
    const tpResumoDia = (d) => {
        d = d || tpDiaNovo();
        const horas = (d.seg || 0) / 3600;
        return { xp: Math.round(d.xp || 0), xpH: horas > 0.01 ? Math.round(d.xp / horas) : null, loot: Math.round(d.loot || 0), sup: Math.round(d.sup || 0),
                 liquido: Math.round((d.loot || 0) - (d.sup || 0)), kills: Math.round(d.kills || 0), mortes: d.mortes || 0, horas };
    };
    /* chave − i dias, pelo calendário local */
    const tpDiaAntes = (chave, i) => { const [a, m, d] = chave.split('-').map(Number); return tpDiaChave(new Date(a, m - 1, d - i, 12).getTime()); };
    function tpCompararDias(dias, chave, n) {
        n = n || 7;
        const hoje = tpResumoDia(dias[chave]);
        const ant = [];
        for (let i = 1; i <= n; i++) { const c = tpDiaAntes(chave, i); if (dias[c]) ant.push(tpResumoDia(dias[c])); }
        const med = (k) => ant.length ? ant.reduce((s, x) => s + (x[k] || 0), 0) / ant.length : null;
        const media = { xp: med('xp'), liquido: med('liquido'), loot: med('loot'), horas: med('horas') };
        const pct = {};
        for (const k of Object.keys(media)) pct[k] = media[k] ? Math.round((hoje[k] - media[k]) / Math.abs(media[k]) * 100) : null;
        const serie = [];
        for (let i = n - 1; i >= 0; i--) { const c = tpDiaAntes(chave, i), r = tpResumoDia(dias[c]); serie.push({ chave: c, xp: r.xp, liquido: r.liquido }); }
        return { hoje, media, pct, n: ant.length, serie };
    }
    function tpTextoRelatorio(dia, cmp, chave) {
        const r = tpResumoDia(dia), f = (v) => Math.round(v || 0).toLocaleString('pt-BR');
        const p = (v) => v == null ? '' : ` (${v >= 0 ? '+' : ''}${v} % vs. média de 7 dias)`;
        const hh = (h) => Math.floor(h) + 'h' + String(Math.round((h % 1) * 60)).padStart(2, '0');
        const [a, m, d] = String(chave || '').split('-');
        const L = [`Tibidle — relatório de ${d}/${m}/${a}`,
            `XP: ${f(r.xp)}${r.xpH ? ` (${f(r.xpH)}/h)` : ''}${p(cmp && cmp.pct.xp)}`,
            `Ouro líquido: ${f(r.liquido)} (loot ${f(r.loot)} − gasto ${f(r.sup)})${p(cmp && cmp.pct.liquido)}`,
            `Abates: ${f(r.kills)} · mortes: ${r.mortes} · caçando: ${hh(r.horas)}${p(cmp && cmp.pct.horas)}`];
        const mapas = Object.entries((dia && dia.mapas) || {}).sort((x, y) => y[1].seg - x[1].seg);
        if (mapas.length) { L.push('Por mapa:'); for (const [nome, x] of mapas) L.push(`  ${nome}: ${hh(x.seg / 3600)} · ${f(x.xp)} xp · ${f(x.loot - x.sup)} líquido`); }
        if (dia && dia.ciclos && dia.ciclos.n) L.push(`Ciclos do Auto Hunt: ${dia.ciclos.n} (${f(dia.ciclos.ouro)} vendido${dia.ciclos.falhas ? `, ${dia.ciclos.falhas} com falha` : ''})`);
        if (dia && dia.npc) L.push(`Venda ao NPC: ${f(dia.npc)}`);
        if (dia && dia.mercado) L.push(`Vendas no Mercado: ${f(dia.mercado)}`);
        if (dia && dia.raros && dia.raros.length) L.push('Raros: ' + dia.raros.map(x => `${x.nome} ×${x.n}`).join(', '));
        if (dia && dia.offline) L.push(`(${dia.offline} caçada${dia.offline > 1 ? 's' : ''} fechada${dia.offline > 1 ? 's' : ''} fora da página, pelo resumo do jogo)`);
        return L.join('\n');
    }
    /* O que o resumo da caçada (`ended.summary`) traz além do que já foi
     * contado pelos frames (base). Sem base = a caçada inteira (caçada que
     * rodou com a página fechada). null quando não sobra nada. */
    /* v2.13.1 — o jogo manda `title` como {key, params:{name}} e `kills` como
     * {criatura: n} (o total vem em `killsTotal`): o Dia mostrava "[object Object]". */
    function tpTituloResumo(sm) {
        const x = sm && sm.title;
        if (x && typeof x === 'object') return (x.params && (x.params.name || x.params.title)) || x.text || x.key || null;
        return x != null && x !== '' ? String(x) : null;
    }
    function tpAbatesResumo(sm) {
        if (!sm) return 0;
        if (Number(sm.killsTotal) > 0) return Number(sm.killsTotal);
        if (sm.kills && typeof sm.kills === 'object') return Object.values(sm.kills).reduce((a, n) => a + (Number(n) || 0), 0);
        return Number(sm.kills) || 0;
    }
    /* O que o resumo do fim traz que os frames NÃO contaram. v2.13.1 — se os frames
     * acompanharam esta caçada até o fim (base do mesmo mapa com menos de 90 s),
     * não falta nada: o resumo é da caçada inteira desde o começo e o Scan zera o
     * analisador no meio, então resumo − base contava de novo o que os frames já
     * tinham somado (30/09: +15 min e +14,1k xp "fora da página" com ela aberta). */
    function tpDeltaResumo(base, sm, agora) {
        if (!sm || typeof sm !== 'object') return null;
        if (base && base.an && base.t && agora != null && agora - base.t < 90000 && (sm.huntId == null || base.huntId === sm.huntId)) return null;
        const seg = Number(sm.elapsedSec) || 0;
        const tot = { seg, xp: (Number(sm.xpPerHour) || 0) * seg / 3600, loot: Number(sm.lootGold) || 0, sup: Number(sm.suppliesGold) || 0, kills: tpAbatesResumo(sm) };
        const b = base && base.an && (sm.huntId == null || base.huntId === sm.huntId) ? base.an : null;
        const d = b ? { seg: tot.seg - b.elapsedMs / 1000, xp: tot.xp - b.xp, loot: tot.loot - b.loot, sup: tot.sup - b.sup, kills: tot.kills - b.kills } : tot;
        for (const k of Object.keys(d)) d[k] = Math.max(0, d[k]);
        return d.seg > 5 || d.loot > 0 || d.kills > 0 ? d : null;
    }
    /* @@TELAS-API-FIM */

    /* =========================================================================
     *  RADAR — estado, ganchos e tela (v2.13.0). Tudo abaixo LÊ: REST pública
     *  (/hunt/lootTable, /bestiary/creature) e as leituras do mercado
     *  (market_catalog, market_stats) só no clique de um botão ou no "vigiar"
     *  que o dono liga (desligado por padrão, no mínimo 15 min entre leituras).
     *  Nenhum market_create/cancel/claim/execute, nenhum start/stop.
     * ====================================================================== */
    const RADAR = { rank: undefined, rodando: false, parar: false, prog: null, abertos: new Set(),
                    lv: null, dias: null, diasSalvo: 0, diasSujo: false, mercVistos: null,
                    alertas: { naoVistos: 0, lendo: false }, diaSel: null, exp: null };
    /* v2.14.6 — esconder risco alto vem LIGADO (o dono morreu num mapa do topo do Radar, 02/10) */
    const RADAR_CFG_PADRAO = { modelo: 'motor:inteligente', ordem: 'xp', mercado: false, esconder: true };
    const radarCfg = () => Object.assign({}, RADAR_CFG_PADRAO, ler('radar_cfg', {}) || {});
    const guardarRadarCfg = (p) => guardar('radar_cfg', Object.assign(radarCfg(), p));
    const alertasCfg = () => { const c = Object.assign({ itens: [], vigiar: false, min: TP_ALERTA_MIN_MIN }, ler('radar_alertas', {}) || {}); c.min = Math.max(TP_ALERTA_MIN_MIN, Number(c.min) || TP_ALERTA_MIN_MIN); if (!Array.isArray(c.itens)) c.itens = []; return c; };
    const guardarAlertasCfg = (p) => guardar('radar_alertas', Object.assign(alertasCfg(), p));
    const alertasEst = () => Object.assign({ ult: 0, disparos: {}, hist: [], erro: null }, ler('radar_alertas_est', {}) || {});
    const RADAR_ALERTA_REPETE_MS = 6 * 3600000;
    const RADAR_MINHAS_VALE_MS = 30 * 60000; // v2.13.5 — suas ordens lidas há menos de 30 min valem para os alertas
    const RADAR_BASE_VALE_MS = 12 * 3600000; // base do analisador guardada vale até 12 h (depois vira só base de novo)

    /* ---- motores do ranking: o ponto onde o planejador (e o v3) se pluga ---- */
    const RADAR_OPC_INT = { enxuto: true, degrauEnx: 2 };
    const RADAR_SCAN_MIN = 3, RADAR_SCAN_TOP = 10;
    /* v2.14.4 — medição nova de um mapa (Scan) atualiza a linha dele no ranking guardado na hora, sem esperar o próximo
     * CALCULAR (ao vivo 02/10: o Scan rápido de Djinns terminou e a linha seguiu "estimado" até recalcular). Sem rede. */
    function radarAtualizarLinha(id) {
        if (RADAR.rank === undefined) RADAR.rank = ler('radar_rank', null);
        const rank = RADAR.rank, h = (CAT.hunts || []).find(x => x.id === id);
        if (!rank || !Array.isArray(rank.linhas) || !h) return;
        const i = rank.linhas.findIndex(l => l && l.id === id);
        if (i < 0) return;
        rank.linhas[i] = radarCompacto(estimarMapa(h, { nivel: rank.nivel, calib: rank.calib, modelo: rank.modelo }));
        guardar('radar_rank', rank);
        renderizar();
    }
    /* v2.14.3 — o "▶" do Radar: Scan dos mapas pedidos com o MESMO kit do ranking (Inteligente com RADAR_OPC_INT; os
     * outros motores, o modelo deles). Não mexe na configuração guardada do Scan. */
    function radarScanRapido(ids) {
        const rank = RADAR.rank;
        if (!ids || !ids.length || !rank) return;
        /* v2.14.6 — nunca mapa de risco alto, nem com o risco antigo (que dizia "baixo" para tudo) */
        if (!(rank.riscoV >= 2)) { avisar('radar', 'radar: o risco deste ranking é da versão antiga — CALCULAR de novo antes do Scan', 'erro'); return; }
        const seguro = new Set((rank.linhas || []).filter(l => l && !l.bloqueio && l.risco && l.risco.nivel !== 'alto' && l.risco.nivel !== 'bloqueado').map(l => l.id));
        ids = ids.filter(id => seguro.has(id));
        if (!ids.length) { avisar('radar', 'radar: nenhum desses mapas é seguro para Scan automático (risco alto)', 'erro'); return; }
        const mod = String(rank.modelo || radarCfg().modelo);
        const intel = mod === 'motor:inteligente';
        const modelo = intel ? 'inteligente' : /^motor:/.test(mod) ? 'area' : mod;
        if (scanIniciar({ mapas: ids, modelo, minutos: RADAR_SCAN_MIN, lureMax: true, comparar: false, opcInt: intel ? RADAR_OPC_INT : null })) {
            avisar('radar', `radar: Scan rápido ligado — ${ids.length} mapa(s), ${RADAR_SCAN_MIN} min cada, ${nomeModelo(modelo)}${intel ? ' (kit enxuto, degrau 2: o mesmo do ranking)' : ''}. O resultado volta para cá como "medido".`, 'ok');
        } else avisar('radar', 'radar: o Scan não ligou — veja o motivo no Log', 'erro');
    }
    const MOTORES_RANK = {
        atual: (h, m) => { const v = viabilidadeParty(m, h); return v && { danoS: v.danoS, custoPorAbate: v.custoPorAbate, porVoc: v.porVoc }; },
        /* v2.13.0 — o Inteligente v3 monta a party inteira contra os monstros do mapa (vida, elemento,
         * lure, mana e regeneração dos 4) e devolve abates/h e gasto/h da própria simulação — sem
         * derivar o tempo da onda de um dano médio diluído pela espera (achado da verificação). */
        /* v2.14.2 — o ranking usa o KIT ENXUTO no degrau 2 (dono, 02/10: "saber sem precisar estar no mapa"). Com os
         * suportes do perfil o Protector do Knight (200 de mana a cada 20 s) o fazia beber ~1.000 Mana Potions/h em
         * TODO mapa: −57k a −77k/h simulados por mapa, −246k/h no ranking da conta principal (nível 80). O degrau 2 é o
         * dos 3 setups de nível 80 do Discord: Heal Friend no Druida + cura própria dos outros três. */
        inteligente: (h) => {
            const res = partyInt(h, true, RADAR_OPC_INT);
            const m = res && res.final && res.final.met;
            if (!m || !(m.abH > 0)) return null;
            const porVoc = {};
            /* v2.14.3 — o pacote inteiro (dono, 02/10: "magias e runas, ataque, defesa, suporte, mana e poção"): mínimos e extras */
            for (const v of VOCS_INT) {
                const e = res.final.esc[v];
                let extras = null;
                try { extras = e ? extrasTxtCru(extrasInt(v, e, res, h)) : null; } catch (er) { falhou('radar (extras)', er); }
                porVoc[v] = e ? { magia: e.plano[0] ? e.plano[0].av.m.name : '', kit: e.plano.map(p => p.av.m.name + ' ' + p.minimo + '+').join(' · '), extras } : null;
            }
            return { abH: m.abH, xpH: m.xpH, custoH: m.custoH, lucroH: m.lucroH, danoS: null, T: m.T, porVoc };
        }
    };
    /* o v3 registra fn(h, nome) → { abH, xpH, custoH, lucroH, danoS, porVoc } */
    function registrarMotorRanking(nome, fn) { if (nome && typeof fn === 'function') MOTORES_RANK[nome] = fn; }
    const radarMagiaDe = (nome) => { const m = (CAT.magias || []).find(x => x.name === nome); return m ? { combatType: m.combatType, area: (m.areaCells || 1) > 1 } : null; };
    const radarSlug = (t) => String(t || '').replace(/[^\w]+/g, '_').toLowerCase();
    function radarMortes(id) {
        const m = ler('radar_mortes', {}) || {}, x = m[id];
        return x && Date.now() - (x.t || 0) < 7 * 86400000 ? x.n || 0 : 0;
    }
    /* v2.14.6 — mapas em que a party JÁ caçou sem morrer (tpEnvelope): Scans sem erro (Knight ≥ 40 % quando medido), sessões
     * do Analisador de ≥ 10 min e a caçada de agora com ≥ 10 min. Mapa com morte registrada não conta. */
    /* v2.14.8 — ilhas abertas na conta (shell.unlockedIslands; u2tag em 04/10: só yalahar). null = shell não lido. */
    function ilhasDestravadas() {
        try { const sh = lerShellFibra(); return sh && Array.isArray(sh.unlockedIslands) ? sh.unlockedIslands.map(String) : null; } catch (e) { return null; }
    }
    function radarEnvelope() {
        const vistos = new Map();
        const por = (id, ok) => {
            const h = (CAT.hunts || []).find(x => x.id === id);
            if (!h || id === HUNT_ID_BOSS) return;
            const okFinal = ok && !radarMortes(id);
            const a = vistos.get(id);
            if (!a || (okFinal && !a.ok)) vistos.set(id, { title: h.title, hp: tpHpXpMedio(h).hp, levelMin: h.levelMin || 0, ok: okFinal });
        };
        try { for (const r of Object.values(scanResultados() || {})) if (r && !r.erro && Number(r.abatesH) > 0) { const k = r.razao && r.razao.porVoc && r.razao.porVoc.KNIGHT; por(r.id, !(k && Number(k.hpMin) < 40)); } } catch (e) { falhou('radar (envelope scans)', e); }
        try { for (const s of (sessoes() || [])) if (s && s.huntId != null && Number(s.dur) >= 600) por(s.huntId, true); } catch (e) { falhou('radar (envelope sessões)', e); }
        try { const an = anDoFrame(); if (an && an.elapsedMs >= 600000 && ESTADO_WS.huntId != null && !ESTADO_WS.boss) por(ESTADO_WS.huntId, true); } catch { /* sem frame */ }
        return tpEnvelope([...vistos.values()]);
    }
    /* v2.13.1 — o MELHOR Scan limpo do mapa (mais xp; empate = o mais novo), não o
     * mais recente: em 30/09 o Inteligente (−44 % de xp) foi medido depois do Em área
     * e o ranking passou a mostrar Vampire hell com 32,5k em vez de 58,0k. */
    function radarScanDoMapa(id) {
        const nv = nivelAtual();
        const xp = (r) => Number(r.xpRawH != null ? r.xpRawH : r.xpH) || 0;
        return Object.values(scanResultados() || {}).filter(r => r && r.id === id && !r.suja && !r.erro && Number(r.abatesH) > 0 && (!r.nivel || !nv || Math.abs(r.nivel - nv) <= 2))
            .sort((a, b) => xp(b) - xp(a) || (b.t || 0) - (a.t || 0))[0] || null;
    }
    /* preço de um item pelo que já foi lido (tabela do loot, /prices e o catálogo do mercado) */
    function radarValor(nome, npcTabela) {
        const stats = {};
        for (const [k, v] of Object.entries(MK.stats || {})) if (v && v.stats) stats[k] = v.stats;
        const med = ler('radar_medias', {}) || {};
        for (const [k, v] of Object.entries(med)) if (!stats[k] && v && v.avg) stats[k] = { avg: v.avg };
        return tpValorItem(nome, { npcTabela, npc: MK.npc || null, cat: MK.catalogo || null, stats, taxa: MK.taxa != null ? MK.taxa : MK_TAXA_WIKI });
    }
    const radarPrecoDe = (nome, it) => { const v = radarValor(nome, it && it.value != null ? it.value : null); return { npc: v.npc, mercado: v.mercado }; };

    /* ENTRADA ÚNICA: estima um mapa com o que já está em memória (sem rede). */
    function estimarMapa(h, opc) {
        opc = opc || {};
        const cfg = radarCfg(), modelo = opc.modelo || cfg.modelo;
        const nomeMotor = /^motor:/.test(modelo) ? modelo.slice(6) : 'atual';
        const fn = MOTORES_RANK[nomeMotor] || MOTORES_RANK.atual;
        let motor = null;
        try { motor = fn(h, nomeMotor === 'atual' ? modelo : nomeMotor) || null; } catch (e) { falhou('radar (motor ' + nomeMotor + ')', e); }
        const ne = notasElementos(h);
        if (motor) {
            const np = tpNotaParty(motor.porVoc, ne, radarMagiaDe);
            const porVoc = {};
            for (const [v, x] of Object.entries(motor.porVoc || {})) porVoc[v] = x ? Object.assign({}, x, np.porVoc[v] || {}) : null;
            motor = Object.assign({}, motor, { nota: motor.nota != null ? motor.nota : np.nota, porVoc });
        }
        const tab = LOOT_TABELA[h.id];
        const mercado = opc.mercado != null ? opc.mercado : cfg.mercado;
        const loot = tab ? tpLootAbate(tab, mercado && MK.catalogo ? radarPrecoDe : null, {}) : null;
        const rit = ritmoOndas(h);
        const ent = { hunt: h, nivel: opc.nivel || nivelAtual(), premium: mkPremiumAgora(), motor, loot, ritmo: { E: rit.esperaS },
                      calib: opc.calib || (RADAR.rank && RADAR.rank.calib) || null, medido: opc.semMedido ? null : radarScanDoMapa(h.id), extras: {},
                      taxaXp: lerTaxaXp(), mortes: radarMortes(h.id), imunes: ne ? Object.keys(ne.vetos).map(rotuloElem) : [],
                      envelope: opc.envelope !== undefined ? opc.envelope : radarEnvelope(),
                      ilhas: opc.ilhas !== undefined ? opc.ilhas : ilhasDestravadas() };
        return opc.entrada ? ent : tpEstimar(ent);
    }
    /* o que vai para radar_rank (resumido: ~20 KB para 70 mapas) */
    function radarCompacto(r) {
        const pv = {};
        for (const [v, x] of Object.entries(r.porVoc || {})) pv[v] = x ? { magia: x.magia, kit: x.kit, extras: x.extras || null, elem: x.elem || null, nota: x.nota != null ? x.nota : null, pocao: !!x.pocao } : null;
        return { id: r.id, title: r.title, levelMin: r.levelMin, premium: r.premium, L: r.L, T: r.T, abH: r.abH, xpH: r.xpH, xpHBonus: r.xpHBonus, lootH: r.lootH, lootHMerc: r.lootHMerc,
                 custoH: r.custoH, ouroH: r.ouroH, ouroHMerc: r.ouroHMerc, sorteH: r.sorteH || null, nota: r.nota, imunes: r.imunes, fonte: r.fonte, est: r.est, bloqueio: r.bloqueio,
                 confianca: r.confianca, notas: r.notas, risco: { nivel: r.risco.nivel, pts: r.risco.pts, motivos: r.risco.motivos, novo: !!r.risco.novo }, porVoc: pv };
    }
    /* v2.13.2 — cópia da tabela de loot na gaveta comum com data e era: vale 7 dias e só na era atual
     * (antes não vencia nunca). O formato antigo (lista) ainda é lido até a próxima virada de era. */
    const RADAR_LOOT_VALIDADE_MS = 7 * 86400000;
    function radarLerTabComum(h) {
        const g = lerComum('loot_tab_' + radarSlug(h.title), null);
        const lista = Array.isArray(g) ? g : g && g.era === ERA && Date.now() - (g.t || 0) < RADAR_LOOT_VALIDADE_MS && Array.isArray(g.tab) ? g.tab : null;
        return lista ? lista.map(x => ({ name: x[0], chance: x[1], maxCount: x[2], value: x[3], currency: !!x[4] })) : null;
    }
    /* v2.13.5 — toda tabela baixada vai para a gaveta comum, venha de onde vier (Scan, Magia, ouro por
     * abate ou CALCULAR). Antes só o CALCULAR guardava: em 01/10 eram 69 de 70 e faltava justo Vampire
     * hell (veio pelo Scan) — depois do F5 o Loot ficava sem valor nem raro. */
    function radarGuardarTab(huntId, tab) {
        const h = (CAT.hunts || []).find(x => x.id === huntId);
        if (!h || !h.title || !Array.isArray(tab) || !tab.length) return;
        guardarComum('loot_tab_' + radarSlug(h.title), { t: Date.now(), era: ERA, tab: tab.filter(x => x && x.name).map(x => [x.name, Number(x.chance) || 0, Number(x.maxCount) || 1, Number(x.value) || 0, x.currency ? 1 : 0]) });
    }
    /* tabela de loot: memória → gaveta comum (compacta, por título) → GET. Devolve true se foi à rede. */
    async function radarGarantirLoot(h) {
        let tab = LOOT_TABELA[h.id], rede = false;
        if (tab && !radarLerTabComum(h)) radarGuardarTab(h.id, tab); // em memória por outro caminho e sem cópia
        if (!tab) {
            tab = radarLerTabComum(h);
            if (!tab) {
                rede = true;
                try { const t = await buscarJSON('/hunt/lootTable?huntId=' + h.id); tab = Array.isArray(t) ? t : []; }
                catch { return rede; }
                radarGuardarTab(h.id, tab);
            }
            LOOT_TABELA[h.id] = tab;
        }
        if (LOOT_CACHE[h.id] == null) LOOT_CACHE[h.id] = Math.round(tpLootAbate(tab, null, {}).cat * 10) / 10;
        return rede;
    }
    /* tabela do mapa sem rede: memória ou a cópia da gaveta comum (o CALCULAR guarda) */
    function radarTabelaLocal(id) {
        if (id == null) return null;
        if (!LOOT_TABELA[id]) {
            const h = (CAT.hunts || []).find(x => x.id === id);
            const g = h ? radarLerTabComum(h) : null;
            if (g) LOOT_TABELA[id] = g;
        }
        const tab = LOOT_TABELA[id] || null;
        if (tab && LOOT_CACHE[id] == null) LOOT_CACHE[id] = Math.round(tpLootAbate(tab, null, {}).cat * 10) / 10;
        return tab;
    }
    /* armadura/defesa dos monstros (bestiarioHunt), uma criatura por vez com folga */
    async function radarGarantirBestiario(h) {
        let rede = false;
        for (const m of (h.monsters || [])) {
            if (!m || BESTIARIO[m.name] || ler('bestiario_' + m.name, null)) continue;
            rede = true;
            await bestiarioHunt({ monsters: [m] });
            await dorme(300);
        }
        if (!rede) await bestiarioHunt(h); // só carrega da gaveta para a memória
        return rede;
    }
    const radarCeder = () => new Promise(r => setTimeout(r, 0));
    async function rankingRodar() {
        if (RADAR.rodando) return;
        if (!CAT.hunts || !CAT.magias) { avisar('radar', 'radar: catálogos ainda não carregados — espere o boot ou use "Rebaixar catálogos" no Status', 'erro'); return; }
        const cfg = radarCfg(), nivel = nivelAtual();
        const lista = CAT.hunts.filter(h => h && h.id !== HUNT_ID_BOSS && Array.isArray(h.monsters) && h.monsters.length && (h.levelMin || 0) <= nivel + 5);
        RADAR.rodando = true; RADAR.parar = false; RADAR.prog = { fase: 'tabelas de loot', i: 0, n: lista.length, nome: '' };
        renderizar();
        try {
            if (cfg.mercado && !MK.catalogo) await radarLerCatalogo('ranking');
            for (let i = 0; i < lista.length && !RADAR.parar; i++) {
                RADAR.prog = { fase: 'tabelas de loot', i, n: lista.length, nome: lista[i].title };
                const rede = await radarGarantirLoot(lista[i]);
                const rb = await radarGarantirBestiario(lista[i]);
                if (rede) { renderizar(); await dorme(300); } else if (rb) renderizar();
            }
            const brutos = [], envelope = radarEnvelope();
            for (let i = 0; i < lista.length && !RADAR.parar; i++) {
                RADAR.prog = { fase: 'calculando', i, n: lista.length, nome: lista[i].title };
                renderizar();
                await radarCeder(); // um mapa por giro: a tela e o jogo respiram entre eles
                const ent = estimarMapa(lista[i], { entrada: true, nivel, envelope });
                const cru = tpEstimar(Object.assign({}, ent, { medido: null, calib: { kAbates: 1, fatorLoot: 1, n: 0 } }));
                brutos.push({ ent, cru });
            }
            const est = {};
            for (const b of brutos) est[b.ent.hunt.id] = { abH: b.cru.abH, cat: b.ent.loot ? b.ent.loot.cat : null, L: b.cru.L, xpAbate: b.cru.xpAbate };
            const calib = tpCalibrar(Object.values(scanResultados() || {}), est, nivel);
            const linhas = brutos.map(b => radarCompacto(tpEstimar(Object.assign({}, b.ent, { calib }))));
            const rank = { t: Date.now(), riscoV: 2, envelope, nivel, modelo: cfg.modelo, enxDeg: cfg.modelo === 'motor:inteligente' ? RADAR_OPC_INT.degrauEnx : null, mercado: !!(cfg.mercado && MK.catalogo), calib, parcial: !!RADAR.parar, n: lista.length, linhas };
            RADAR.rank = rank;
            guardar('radar_rank', rank);
            const top = tpOrdenar(linhas, cfg.ordem, { esconder: true })[0];
            avisar('radar', `radar: ${linhas.length} mapas calculados${RADAR.parar ? ' (interrompido)' : ''}` + (top ? ` — 1º por ${cfg.ordem === 'ouro' ? 'ouro' : cfg.ordem === 'dois' ? 'xp e ouro' : cfg.ordem === 'combo' ? 'menos combos' : 'xp'}: ${top.title}` : ''), 'ok');
        } catch (e) { falhou('radar (ranking)', e); avisar('radar', 'radar: o ranking parou — ' + e.message, 'erro'); }
        finally { RADAR.rodando = false; RADAR.parar = false; RADAR.prog = null; renderizar(); }
    }

    /* ---- dia e loot ao vivo ---- */
    function radarDias() {
        if (!RADAR.dias) RADAR.dias = tpPodarDias(ler('radar_dias', {}) || {}, TP_DIAS_MAX);
        return RADAR.dias;
    }
    function radarLv() {
        if (!RADAR.lv) {
            const g = ler('radar_lv', null) || {};
            const base = g.base && g.t && Date.now() - g.t < RADAR_BASE_VALE_MS ? g.base : null;
            RADAR.lv = { base, sessao: g.sessao || null, raros: Array.isArray(g.raros) ? g.raros : [], vistos: new Set() };
        }
        return RADAR.lv;
    }
    /* grava o dia e a sessão do Loot no máximo 1× por minuto (ou já, no beforeunload) */
    function radarSalvarDia(ja) {
        if (!RADAR.diasSujo && !ja) return;
        if (!ja && Date.now() - RADAR.diasSalvo < 60000) return;
        RADAR.diasSalvo = Date.now(); RADAR.diasSujo = false;
        if (RADAR.dias) guardar('radar_dias', RADAR.dias);
        if (RADAR.lv) guardar('radar_lv', { t: Date.now(), base: RADAR.lv.base, sessao: RADAR.lv.sessao, raros: RADAR.lv.raros.slice(-10) });
    }
    function radarAcumular(ev) { tpAcumularDia(radarDias(), Date.now(), ev); RADAR.diasSujo = true; }
    function radarCiclo(reg) { if (reg) { radarAcumular({ tipo: 'ciclo', reg }); radarSalvarDia(); } }
    function radarSessaoNova() { return { t0: Date.now(), seg: 0, xp: 0, xpRaw: 0, kills: 0, loot: 0, sup: 0, drops: {}, huntId: null, title: null }; }
    /* uma linha em observarRecebido: só LÊ o que o jogo já manda */
    function radarObservar(o) {
        if (!o || typeof o.type !== 'string') return;
        const d = o.data && typeof o.data === 'object' ? o.data : {};
        const t = o.type;
        if (t === 'hunt_started') {
            const lv = radarLv();
            lv.base = { huntId: d.huntId != null ? d.huntId : null, an: null, novo: true }; // v2.13.0 — o analisador NÃO zera ao recomeçar no mesmo mapa: base = zero só se o 1º frame for de caçada nova (< 5 s)
            /* v2.13.1 — a sessão do Loot acompanha a caçada, como a janela "Estatísticas da
             * caça" do jogo: caçada nova (outro mapa, recomeço, volta do Auto Hunt, Scan) =
             * sessão nova. Antes ela só zerava no botão e somava Nargor + Vampire hell + Scans.
             * O F5 no meio (resume) não zera. O Dia continua somando tudo. */
            lv.sessao = radarSessaoNova();
            RADAR.diasSujo = true;
            return;
        }
        if (t === 'frame' && d.analyzer && typeof d.analyzer === 'object') {
            const a = d.analyzer, lv = radarLv(), huntId = ESTADO_WS.huntId;
            /* v2.13.6 — depois do F5 o jogo manda frame ANTES do resume: sem saber a caçada, a base guardada
             * parecia de "outra caçada" e a 2.13.5 lançava a caçada inteira como offline (ao vivo: 2×, +62k de xp) */
            if (huntId == null) return;
            const an = { elapsedMs: a.elapsedMs, xp: a.xp, xpRaw: a.xpRaw, kills: a.killsTotal, lootGold: a.lootGold, suppliesGold: a.suppliesGold,
                         drops: a.drops && typeof a.drops === 'object' ? a.drops : {} };
            /* v2.13.5 — 1º frame de uma caçada que a página não viu começar: o que veio antes entra no Dia
             * (com a base desta caçada, a mesma de sempre, tpTrechoAntes devolve null) */
            const antes = tpTrechoAntes(lv.base, an, huntId, Date.now());
            if (antes) {
                const hx = (CAT.hunts || []).find(x => x.id === huntId);
                radarAcumular({ tipo: 'offline', summary: { huntId, title: hx ? hx.title : null }, delta: antes });
                lv.base = null;
            }
            const r = tpDeltaAnalisador(lv.base, an, huntId);
            lv.base = r.base; lv.base.t = Date.now(); // v2.13.1 — o resumo do fim só soma o que os frames não viram
            const dl = r.delta;
            if (!(dl.seg > 0 || dl.xp > 0 || dl.kills > 0 || dl.loot > 0 || dl.sup > 0)) return;
            const h = (CAT.hunts || []).find(x => x.id === huntId);
            const title = h ? h.title : ESTADO_WS.boss ? 'boss ' + ESTADO_WS.boss : huntId != null ? 'hunt ' + huntId : null;
            const s = lv.sessao || (lv.sessao = radarSessaoNova());
            for (const k of ['seg', 'xp', 'xpRaw', 'kills', 'loot', 'sup']) s[k] += dl[k] || 0;
            for (const [k, n] of Object.entries(dl.drops)) s.drops[k] = (s.drops[k] || 0) + n;
            s.huntId = huntId; s.title = title;
            radarAcumular({ tipo: 'delta', huntId, title, delta: dl });
            const tab = radarTabelaLocal(huntId), lootAbate = LOOT_CACHE[huntId];
            for (const [nome, n] of Object.entries(dl.drops)) {
                const it = tab ? tab.find(x => x && x.name === nome) : null;
                const valor = it ? Number(it.value) || 0 : (MK.npc && MK.npc[mkMin(nome)] != null ? Number(MK.npc[mkMin(nome)]) || 0 : 0);
                if (!tpRaro(it, valor, lootAbate)) continue;
                const chave = huntId + '|' + nome + '|' + (Number(a.drops[nome]) || 0);
                if (lv.vistos.has(chave)) continue;
                lv.vistos.add(chave);
                lv.raros.push({ t: Date.now(), nome, n, valor, title });
                while (lv.raros.length > 10) lv.raros.shift();
                radarAcumular({ tipo: 'raro', nome, n, valor });
                log(`radar: drop raro — ${nome} ×${n}${valor ? ' (' + numBR(valor * n) + ' de ouro no NPC)' : ''}${title ? ' em ' + title : ''}`, 'ok');
            }
            radarSalvarDia();
            return;
        }
        if (t === 'ended') {
            const sm = d.summary && typeof d.summary === 'object' ? d.summary : {};
            const lv = radarLv();
            const dl = tpDeltaResumo(lv.base, sm, Date.now());
            /* > 1 min que os frames não mostraram = caçada (ou parte dela) com a página fechada;
             * menos que isso é só o atraso do último frame e entra como delta comum */
            if (dl && dl.seg > 60) radarAcumular({ tipo: 'offline', summary: sm, delta: dl });
            else if (dl) radarAcumular({ tipo: 'delta', huntId: sm.huntId, title: tpTituloResumo(sm), delta: dl });
            if (/death|dead|morr/i.test(String(sm.reason || ''))) {
                radarAcumular({ tipo: 'morte' });
                if (sm.huntId != null) { const m = ler('radar_mortes', {}) || {}; const x = m[sm.huntId] || { n: 0 }; m[sm.huntId] = { n: (Date.now() - (x.t || 0) < 7 * 86400000 ? x.n : 0) + 1, t: Date.now() }; guardar('radar_mortes', m); }
            }
            lv.base = null;
            radarSalvarDia(true);
            return;
        }
        if (t === 'sell_result' && Number(d.goldCredited) > 0) { radarAcumular({ tipo: 'npc', ouro: Number(d.goldCredited) }); radarSalvarDia(); return; }
        if (t === 'market_inbox_result' && Array.isArray(d.entries)) {
            if (!RADAR.mercVistos) RADAR.mercVistos = new Set(ler('radar_merc_vistos', []) || []);
            let novo = false;
            for (const x of d.entries) {
                if (!x || x.reason !== 'trade_proceeds' || x.id == null || (x.currency && x.currency !== 'gold') || RADAR.mercVistos.has(x.id)) continue;
                RADAR.mercVistos.add(x.id); novo = true;
                radarAcumular({ tipo: 'mercado', id: x.id, ouro: Number(x.amount) || 0 });
            }
            if (novo) { guardar('radar_merc_vistos', [...RADAR.mercVistos].slice(-500)); radarSalvarDia(); }
        }
    }

    /* ---- mercado: SÓ leituras (market_catalog / market_stats), pela fila do Mercado ---- */
    function radarMercadoImpedido() {
        if (!socketAberto()) return 'socket do jogo não está à mão — dê F5 com o helper instalado';
        if (mkPremiumAgora() === false) return 'a conta está sem Premium — o mercado é só Premium';
        if (MK.ocupado) return 'o Mercado está ocupado (' + MK.ocupado + ')';
        const ocup = travaJogo();
        if (ocup) return ocup + ' em andamento';
        return null;
    }
    async function radarLerCatalogo(origem) {
        const imp = radarMercadoImpedido();
        if (imp) { avisar('radar', 'radar: preços do mercado não lidos — ' + imp, 'erro'); return false; }
        MK.ocupado = 'radar'; renderizar();
        try {
            if (MK.taxa == null) { MK.taxa = MK_TAXA_WIKI; MK.taxaWiki = true; }
            const r = await mkPedir('market_catalog', {});
            if (r.erro) { avisar('radar', 'radar: catálogo do mercado não lido (' + mkErroTexto(r.erro) + ')', 'erro'); return false; }
            if (origem !== 'ranking') avisar('radar', 'radar: preços do mercado lidos (' + Object.keys(MK.catalogo || {}).length + ' itens)', 'ok');
            return true;
        } finally { MK.ocupado = null; renderizar(); }
    }
    async function alertasLer(origem) {
        const imp = radarMercadoImpedido();
        if (imp) { if (origem !== 'vigia') avisar('radar', 'radar: alertas não conferidos — ' + imp, 'erro'); return; }
        const cfg = alertasCfg(), est = alertasEst(), itens = cfg.itens.filter(x => x && x.on !== false && x.nome);
        MK.ocupado = 'radar'; RADAR.alertas.lendo = true; renderizar();
        let disparou = 0;
        try {
            if (MK.taxa == null) { MK.taxa = MK_TAXA_WIKI; MK.taxaWiki = true; }
            const r = await mkPedir('market_catalog', {});
            if (r.erro) {
                est.erro = mkErroTexto(r.erro);
                avisar('radar', 'radar: alertas — catálogo não lido (' + est.erro + ')' + (r.erro === 'premium_required' ? '; a leitura parou' : ''), 'erro');
                return;
            }
            est.erro = null;
            /* v2.13.5 — as SUAS ordens (só leitura, todas as páginas): sem elas a regra "o menor anúncio é o seu"
             * (2.13.2) ficava desligada sempre que o Mercado não tinha sido aberto na sessão (01/10) */
            if (!Array.isArray(MK.minhas) || Date.now() - (MK.minhas_t || 0) > RADAR_MINHAS_VALE_MS) {
                const rm = itens.some(it => it.modo !== 'comprar') ? await mkLerMinhas() : null;
                if (rm && rm.erro) log('radar: suas ordens não lidas (' + mkErroTexto(rm.erro) + ') — o alerta pode apontar o seu próprio anúncio', 'erro');
            }
            const med = ler('radar_medias', {}) || {};
            let pedidos = 0;
            for (const it of itens) {
                const n = mkMin(it.nome), c = MK.catalogo && MK.catalogo[n];
                if (it.pct == null || it.pct === '' || !c || !(Number(c.trades30d) > 0) || pedidos >= 5) continue; // média só serve ao gatilho em %
                if (med[n] && Date.now() - (med[n].t || 0) < 24 * 3600000) continue;
                pedidos++;
                const s = await mkPedir('market_stats', { itemName: it.nome });
                if (s.erro) { if (s.erro === 'premium_required') break; continue; }
                const avg = s.data && s.data.stats && Number(s.data.stats.avg);
                if (avg > 0) med[n] = { avg, t: Date.now() };
            }
            guardar('radar_medias', med);
            for (const it of itens) {
                const nMin = mkMin(it.nome);
                const meus = (MK.minhas || []).filter(o => mkAbertaVenda(o) && mkMin(o.itemName) === nMin && !o.forja).map(o => o.unitPrice);
                let npc = 0; try { npc = radarValor(it.nome, null).npc || 0; } catch { }
                const a = tpAvaliarAlerta(it, MK.catalogo, med[nMin] || null, MK.taxa, { meus, npc });
                if (!a || Date.now() - (est.disparos[a.chave] || 0) < RADAR_ALERTA_REPETE_MS) continue;
                est.disparos[a.chave] = Date.now();
                est.hist = [{ t: Date.now(), tipo: a.tipo, msg: a.msg }].concat(est.hist || []).slice(0, 20);
                disparou++;
                RADAR.alertas.naoVistos++;
                avisar('radar', 'radar: ' + a.msg, 'ok');
            }
            if (!disparou && origem !== 'vigia') avisar('radar', `radar: ${itens.length} ${itens.length === 1 ? 'item conferido' : 'itens conferidos'} — nenhum alerta novo`, 'info');
        } catch (e) { falhou('radar (alertas)', e); }
        finally {
            est.ult = Date.now();
            guardar('radar_alertas_est', est);
            MK.ocupado = null; RADAR.alertas.lendo = false; renderizar();
        }
    }
    /* de minuto em minuto; só age com o "vigiar" ligado pelo dono */
    function radarVigia() {
        try {
            const cfg = alertasCfg();
            if (!tpAlertaDevido(cfg, alertasEst(), Date.now())) return;
            if (!cfg.itens.some(x => x && x.on !== false)) return;
            if (!socketAberto() || MK.ocupado || travaJogo() || scanOcupado() || _cicloEmCurso || mkPremiumAgora() === false) return;
            alertasLer('vigia').catch(e => falhou('radar (vigia)', e));
        } catch (e) { falhou('radar (vigia)', e); }
    }
    /* sugestões: o que está no baú e na mochila e teve negócio em 30 dias */
    function radarSugestoes() {
        const nomes = new Set();
        try { const b = mkBagAtual(); if (b && b.bag) Object.keys(b.bag).forEach(k => nomes.add(k)); } catch { /* sem mochila lida */ }
        try { for (const e of ((ESTADO_WS.depot && ESTADO_WS.depot.entries) || [])) if (e && (e.name || e.itemName)) nomes.add(e.name || e.itemName); } catch { /* sem depósito lido */ }
        const cat = MK.catalogo || null;
        return [...nomes].filter(n => !cat || (cat[mkMin(n)] && Number(cat[mkMin(n)].trades30d) > 0)).sort((a, b) => a.localeCompare(b)).slice(0, 80);
    }
    function pintarContadorRadar() {
        const i = $('#tb-trilho .tb-ico[data-aba="radar"]'); if (!i) return;
        const n = RADAR.alertas.naoVistos, b = $('.tb-cont', i);
        if (b) { b.textContent = n > 9 ? '9+' : String(n); b.hidden = !n; }
        const rot = n ? `Radar — ${n} alerta${n > 1 ? 's' : ''} de preço não visto${n > 1 ? 's' : ''}` : 'Radar';
        if (i.getAttribute('aria-label') !== rot) { i.setAttribute('aria-label', rot); i.title = rot; }
    }

    /* ---- tela ---- */
    const RD_CSS = `
    #tb-radar{font-size:11.5px}
    #tb-radar .rd-sub{display:flex;flex-wrap:wrap;gap:3px;margin:0 0 6px}
    #tb-radar .rd-aba{flex:1 1 auto;min-height:28px;padding:3px 4px;border-radius:14px;background:#1a1f29;color:#c3cad6;border:1px solid #2b3242;cursor:pointer;font:inherit;font-size:11px}
    #tb-radar .rd-aba:hover{background:#232936;color:#fff}
    #tb-radar .rd-aba.on{background:#2c5c3a;color:#fff;border-color:#4a9a63}
    #tb-radar button:focus-visible,#tb-radar select:focus-visible,#tb-radar input:focus-visible,#tb-radar summary:focus-visible{outline:2px solid #ffd479;outline-offset:1px}
    #tb-radar .tb-mut{color:#9ba5b7}
    #tb-radar .rd-cx{background:#1a1f29;border:1px solid #262d3b;border-radius:7px;padding:6px 7px;margin:5px 0}
    #tb-radar .rd-tit{margin:9px 0 3px;color:#ffd479;font-size:11px;letter-spacing:.3px;text-transform:uppercase}
    #tb-radar .rd-barras{display:flex;align-items:flex-end;gap:3px;height:46px;margin:4px 0 0}
    #tb-radar .rd-barras>div{flex:1 1 0;display:flex;flex-direction:column;justify-content:flex-end;gap:1px;height:100%}
    #tb-radar .rd-barra{border-radius:2px 2px 0 0;min-height:1px}
    #tb-radar .rd-barra.xp{background:#4a78c2}#tb-radar .rd-barra.ouro{background:#c9a13b}#tb-radar .rd-barra.neg{background:#8a3a3a}
    #tb-radar .rd-dias{display:flex;gap:3px;font-size:9.5px;color:#9ba5b7}#tb-radar .rd-dias>span{flex:1 1 0;text-align:center}
    #tb-radar details.rd-det{margin:3px 0;border:1px solid #262d3b;border-radius:7px;background:#1a1f29}
    #tb-radar details.rd-det>summary{list-style:none;cursor:pointer;min-height:28px;display:grid;grid-template-columns:minmax(0,1fr) 4.2em 4.4em 3.6em;gap:4px;align-items:center;padding:3px 6px}
    #tb-radar details.rd-det>summary::-webkit-details-marker{display:none}
    #tb-radar details.rd-det>summary>span{text-align:right;white-space:nowrap}
    #tb-radar details.rd-det>summary>span:first-child{text-align:left;white-space:normal;overflow-wrap:break-word}
    #tb-radar details.rd-det>div{padding:2px 7px 6px;font-size:10.5px}
    #tb-radar .rd-cab{display:grid;grid-template-columns:minmax(0,1fr) 4.2em 4.4em 3.6em;gap:4px;padding:0 7px;color:#9ba5b7;font-size:10.5px}
    #tb-radar .rd-cab>span{text-align:right}#tb-radar .rd-cab>span:first-child{text-align:left}
    #tb-radar .rd-r{display:inline-block;padding:0 5px;border-radius:9px;font-size:10px}
    #tb-radar .rd-r.baixo{background:#1f4a2c;color:#8ff0a8}#tb-radar .rd-r.médio{background:#4a431f;color:#ffe3a3}
    #tb-radar .rd-r.alto{background:#4a1f1f;color:#ff9b93}#tb-radar .rd-r.bloqueado{background:#2b3242;color:#9ba5b7}
    #tb-radar .rd-raro{color:#ffd479;font-weight:bold}
    #tb-radar select,#tb-radar input{min-height:28px;background:#232936;color:#dde3ee;border:1px solid #3a4356;border-radius:5px;padding:2px 5px;font:inherit;font-size:11px;box-sizing:border-box}
    #tb-radar .rd-form{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:4px 0}
    #tb-radar .rd-form input[type=number]{width:5.2em}
    #tb-radar textarea{display:block;width:100%;height:120px;box-sizing:border-box;margin-top:3px;resize:vertical;font:10.5px/1.35 ui-monospace,Consolas,monospace;background:#0d1016;color:#dde3ee;border:1px solid #2b3242;border-radius:5px}
    #tb-radar .rd-rodape{margin-top:8px;color:#9ba5b7;font-size:10.5px}
    `;
    function rdGarantirCss() {
        if (document.getElementById('tb-radar-css')) return;
        const s = document.createElement('style'); s.id = 'tb-radar-css'; s.textContent = RD_CSS;
        (document.head || document.documentElement).appendChild(s);
    }
    const rdK = (n) => n == null || !isFinite(n) ? '—' : Math.abs(n) >= 1000 ? milBR(n) : numBR(n);
    const rdSinal = (n) => n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : '') + rdK(n);
    const rdHa = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'agora' : m < 60 ? 'há ' + m + ' min' : m < 2880 ? 'há ' + Math.round(m / 60) + ' h' : 'há ' + Math.round(m / 1440) + ' dias'; };
    const rdSw = (id, on, rot) => `<button type="button" class="tb-eq-sw" id="${id}" role="switch" aria-checked="${on ? 'true' : 'false'}">${on ? '☑' : '☐'} ${rot}</button>`;
    function rdTelaMapas() {
        const cfg = radarCfg(), nivel = nivelAtual();
        if (RADAR.rank === undefined) RADAR.rank = ler('radar_rank', null);
        const rank = RADAR.rank;
        const modelos = [['equilibrado', nomeModelo('equilibrado')], ['area', nomeModelo('area')]].concat(Object.keys(MOTORES_RANK).filter(k => k !== 'atual').map(k => ['motor:' + k, k]));
        let h = `<div class="tb-linha"><button type="button" class="tb-bt" id="rd-calc"${RADAR.rodando ? ' disabled' : ''}>${RADAR.rodando ? 'calculando…' : 'CALCULAR'}</button>` +
            (RADAR.rodando ? `<button type="button" class="tb-bt mini" id="rd-parar">parar</button>` : '') +
            `<select id="rd-modelo" aria-label="modelo do motor">${modelos.map(([k, n]) => `<option value="${escHtml(k)}"${k === cfg.modelo ? ' selected' : ''}>${escHtml(n)}</option>`).join('')}</select></div>`;
        if (RADAR.prog) h += `<div class="tb-mut" role="status">${escHtml(RADAR.prog.fase)} ${numBR(RADAR.prog.i + 1)}/${numBR(RADAR.prog.n)}${RADAR.prog.nome ? ' — ' + escHtml(RADAR.prog.nome) : ''}</div>`;
        h += `<div class="tb-seg" role="group" aria-label="ordem">` + [['xp', 'XP'], ['ouro', 'Ouro'], ['dois', 'Os dois'], ['combo', '⚡ 1 combo']].map(([k, n]) => `<button type="button" data-rd-ordem="${k}" aria-pressed="${cfg.ordem === k}">${n}</button>`).join('') + `</div>`;
        h += `<div class="tb-linha">${rdSw('rd-merc', cfg.mercado, 'preço do mercado')}${rdSw('rd-esconder', cfg.esconder, 'esconder risco alto e bloqueados')}</div>`;
        if (!rank || !Array.isArray(rank.linhas)) {
            return h + `<div class="rd-cx tb-mut">Nenhum ranking ainda. CALCULAR baixa a tabela de loot de cada mapa até o nível ${numBR(nivel + 5)} (uma leitura pública a cada 0,3 s, guardada) e roda o planejador de magias com o dano medido dos 4 em cada um. Não entra em mapa nenhum.</div>`;
        }
        const c = rank.calib || {};
        h += `<div class="tb-mut">calculado ${rdHa(rank.t)}, nível ${numBR(rank.nivel)}${rank.enxDeg != null ? ` · kit enxuto, degrau ${rank.enxDeg} (sem os seus suportes; ligue "kit enxuto" na Magia para aplicar o mesmo)` : rank.modelo === 'motor:inteligente' ? ' · <b class="tb-av">calculado com os seus suportes: recalcule</b>' : ''}${rank.parcial ? ' · <span class="tb-av">interrompido</span>' : ''}${rank.mercado ? ' · com preço do mercado' : ''}` +
             (rank.nivel !== nivel && nivel > 1 ? ` · <b class="tb-av">você está no nível ${numBR(nivel)}: recalcule</b>` : '') + `</div>`;
        h += `<div class="tb-mut">fator de loot ${numBR(c.fatorLoot, 2)} ${c.nLoot ? `(n = ${c.nLoot} Scan${c.nLoot > 1 ? 's' : ''})` : '<span class="tb-av">(padrão, sem Scan: estimado)</span>'} · abates ×${numBR(c.kAbates, 2)}${c.nAbates ? '' : ' (sem calibração)'}` +
             aj('rd-calib', 'O catálogo de loot superestima 2 a 4× (TIBIDLE §12): o valor absoluto vem da mediana de <b>loot medido ÷ (abates × loot do catálogo)</b> nos Scans limpos do seu nível (±2). Sem Scan, 0,35. Abates/h = lure × 3600 ÷ (T + espera + 0,5 × lure), com T = lure × HP médio ÷ dano/s da party (o planejador de Magia), corrigido pela mediana medido/estimado. <b>medido</b> = Scan limpo manda; <b>estimado</b> = conta. O dano que o monstro dá não existe na API: o risco compara a VIDA do monstro e o nível mínimo do mapa com o mapa mais forte em que a party já caçou sem morrer (Scans e sessões de ≥ 10 min); acima disso é "nunca testado" (risco médio ou alto). Também contam a margem de nível, a nota do elemento, o hp mínimo do Knight e as mortes. Risco alto nunca entra no Scan rápido.') + `</div>`;
        const linhas = tpOrdenar(rank.linhas, cfg.ordem, { esconder: cfg.esconder });
        /* v2.14.3 — SCAN RÁPIDO (dono, 02/10: "onde eu desse play ele fazia um scan bem rápido"): os N primeiros da
         * ordem atual, com o mesmo kit que o ranking simulou, RADAR_SCAN_MIN cada. É o Scan de sempre (devolve o jogo
         * como estava no fim); 2 toques porque troca de mapa. */
        const scanOcup = scanOcupado() || !!travaJogo();
        /* v2.14.6 — risco calculado antes da 2.14.6 dizia "baixo" para tudo: sem recalcular, nada de Scan rápido */
        const riscoVelho = !(rank.riscoV >= 2);
        if (riscoVelho) h += `<div class="rd-cx tb-ruim">⚠ o risco deste ranking foi calculado pela versão antiga, que marcava todo mapa como seguro. CALCULAR de novo antes de escolher um mapa.</div>`;
        /* v2.14.6 — o Scan rápido NUNCA entra em mapa de risco alto (o dono morreu num mapa do topo, 02/10) */
        const podeScan = (l) => !l.bloqueio && !riscoVelho && l.risco && l.risco.nivel !== 'alto' && l.risco.nivel !== 'bloqueado';
        RADAR.topIds = linhas.filter(podeScan).slice(0, RADAR_SCAN_TOP).map(l => l.id);
        if (RADAR.topIds.length) {
            h += `<div class="tb-linha"><button type="button" class="tb-bt" id="rd-scan-top"${scanOcup ? ' disabled' : ''} title="mede os ${RADAR.topIds.length} primeiros desta ordem com o kit do ranking (lure máximo) e volta para onde estava">▶ Scan rápido dos ${RADAR.topIds.length} primeiros · ~${numBR(Math.round(RADAR.topIds.length * (RADAR_SCAN_MIN + 0.5)))} min</button>` +
                 (SCAN.ativo ? '<span class="tb-mut">Scan em andamento (aba Scan)</span>' : '') + `</div>`;
        }
        const falta = xpFaltando();
        const ouroDe = (l) => rank.mercado && l.ouroHMerc != null ? l.ouroHMerc : l.ouroH;
        h += `<div class="rd-cab"><span>mapa</span><span>xp/h</span><span>ouro/h</span><span>risco</span></div>`;
        for (const l of linhas) {
            const tags = [l.fonte === 'medido' ? `<span class="tb-tag tb-ok" title="o melhor Scan limpo deste mapa">medido${l.medido && l.medido.modelo ? ' · ' + escHtml(nomeModelo(l.medido.modelo)) : ''}</span>` : '<span class="tb-tag">estimado</span>',
                          (c => c === 1 ? '<span class="tb-tag tb-ok" title="a party limpa a onda na 1ª rajada">⚡ 1 combo</span>' : c ? `<span class="tb-tag" title="rajadas (a cada 2 s) para limpar a onda">${c} combos</span>` : '')(tpCombos(l.T)),
                          l.bloqueio && /^(nível|ilha)/.test(l.bloqueio) ? `<span class="tb-tag tb-ruim">${escHtml(l.bloqueio)}</span>` : '',
                          l.premium ? '<span class="tb-tag tb-av">premium</span>' : '',
                          l.risco && l.risco.novo ? '<span class="tb-tag tb-ruim" title="monstros mais fortes que qualquer mapa onde a party já caçou sem morrer">⚠ nunca testado</span>' : ''].join('');
            const o = ouroDe(l);
            const pv = Object.entries(l.porVoc || {}).map(([v, x]) => x ? `<div><b>${escHtml(VOC_ROTULO[v] || v)}</b>: ${escHtml(x.kit || x.magia || '—')}${x.elem ? ` · ${escHtml(rotuloElem(x.elem))} nota ${numBR(x.nota)}` : ''}${x.pocao ? ' · bebe poção' : ''}${x.extras ? `<div class="tb-mut">${escHtml(x.extras)}</div>` : ''}</div>` : `<div><b>${escHtml(VOC_ROTULO[v] || v)}</b>: <span class="tb-mut">sem kit</span></div>`).join('');
            const xpReal = l.xpHBonus || l.xpH;
            h += `<details class="rd-det" data-k="rd-${escHtml(String(l.id))}"><summary><span>${escHtml(l.title)} ${tags}</span><span>${rdK(l.xpH)}</span><span class="${o > 0 ? 'tb-ok' : o < 0 ? 'tb-ruim' : ''}">${rdSinal(o)}</span>` +
                 `<span><span class="rd-r ${escHtml(l.risco.nivel)}">${escHtml(l.risco.nivel)}</span></span></summary><div>` +
                 `<div>lure ${numBR(l.L)} · ${l.abH != null ? numBR(l.abH) + ' abates/h' : 'sem abates'}${l.T != null ? ` · onda limpa em ${numBR(l.T, 1)} s (${tpCombos(l.T)} combo${tpCombos(l.T) > 1 ? 's' : ''})` : ''}${xpReal && falta ? ` · próximo nível em ${escHtml(fmtHoras(falta / xpReal))}` : ''}</div>` +
                 `<div>loot ${rdK(l.lootH)}/h${l.lootHMerc != null && l.lootHMerc !== l.lootH ? ` (mercado ${rdK(l.lootHMerc)})` : ''} · gasto ${rdK(l.custoH)}/h${l.sorteH ? ` · sorte no Scan ${rdSinal(l.sorteH)}/h (fora do ouro: raro não se repete)` : ''}${l.xpHBonus ? ` · xp com bônus ${rdK(l.xpHBonus)}/h` : ''}</div>` +
                 (l.est && l.fonte === 'medido' ? `<div class="tb-mut">est.: ${rdK(l.est.xpH)} xp/h · ${rdSinal(l.est.ouroH)} ouro/h</div>` : '') +
                 (l.nota != null ? `<div>nota da party contra o mapa: ${numBR(l.nota)}</div>` : '') + pv +
                 (l.imunes && l.imunes.length ? `<div class="tb-av">imunes: ${escHtml(l.imunes.join(', '))}</div>` : '') +
                 (l.risco.motivos.length ? `<div class="tb-mut">risco: ${l.risco.motivos.map(escHtml).join('; ')}</div>` : '') +
                 (l.notas && l.notas.length ? `<div class="tb-mut">${l.notas.map(escHtml).join(' · ')}</div>` : '') +
                 (!podeScan(l) && !l.bloqueio ? `<div class="tb-ruim">sem Scan automático aqui: risco ${escHtml(l.risco.nivel)}${riscoVelho ? ' (recalcule)' : ''}. Se quiser testar, entre você mesmo, com lure baixo.</div>` : '') +
                 (podeScan(l) ? `<div class="tb-linha"><button type="button" class="tb-bt mini" data-rd-scan="${escHtml(String(l.id))}"${scanOcup ? ' disabled' : ''} title="entra no mapa, aplica este kit nos 4 e mede ${RADAR_SCAN_MIN} min (pede confirmação)">▶ medir ${RADAR_SCAN_MIN} min</button></div>` : '') + `</div></details>`;
        }
        if (!linhas.length) h += `<div class="rd-cx tb-mut">Nenhum mapa passou no filtro.</div>`;
        return h;
    }
    function rdTelaLoot() {
        const lv = radarLv(), s = lv.sessao;
        const hH = s && s.seg > 0 ? 3600 / s.seg : null;
        const card = (r, v) => `<div class="tb-card"><small>${r}</small><b>${v}</b></div>`;
        let h = `<div class="tb-grid">${card('loot da sessão (NPC)', s ? numBR(s.loot) : '—')}${card('loot/h', hH ? rdK(s.loot * hH) : '—')}` +
                `${card('gasto/h', hH ? rdK(s.sup * hH) : '—')}${card('líquido/h', hH ? rdSinal((s.loot - s.sup) * hH) : '—')}${card('abates/h', hH ? numBR(s.kills * hH) : '—')}${card('tempo', s ? escHtml(fmtHoras(s.seg / 3600)) : '—')}</div>`;
        h += `<div class="tb-linha"><button type="button" class="tb-bt mini" id="rd-lv-zerar">zerar sessão</button><button type="button" class="tb-bt mini" id="rd-lv-merc"${MK.ocupado ? ' disabled' : ''}>ler preços do mercado</button>` +
             `<span class="tb-mut">${MK.catalogo_t ? 'mercado lido ' + rdHa(MK.catalogo_t) : 'mercado não lido'}</span></div>`;
        if (!s || !Object.keys(s.drops).length) h += `<div class="rd-cx tb-mut">Sem drop nesta sessão ainda. A conta vem do analisador do próprio jogo (frame a frame), só enquanto a página está aberta.</div>`;
        else {
            const tab = radarTabelaLocal(s.huntId) || [], lootAbate = LOOT_CACHE[s.huntId];
            if (!tab.length) h += `<div class="tb-mut">sem a tabela de loot deste mapa: o valor vem de /prices (se o Mercado já leu) e o raro por chance não é marcado — rode CALCULAR em Mapas uma vez.</div>`;
            const itens = Object.entries(s.drops).map(([nome, n]) => {
                const it = tab.find(x => x && x.name === nome) || null;
                const v = radarValor(nome, it ? it.value : null);
                return { nome, n, it, v, tot: (v.npc || 0) * n };
            }).sort((a, b) => b.tot - a.tot);
            h += `<table class="tb-an"><colgroup><col><col class="c5"><col class="c5"></colgroup><thead><tr><th>item</th><th>NPC</th><th>mercado</th></tr></thead><tbody>` +
                itens.map(x => {
                    const raro = tpRaro(x.it, x.v.npc, lootAbate);
                    const vale = x.v.mercado != null && x.v.trades30d > 0 && x.v.ganhoPct != null && x.v.ganhoPct >= 10;
                    return `<tr><td><span class="${raro ? 'rd-raro' : ''}">${escHtml(x.nome)} ×${numBR(x.n)}</span>${vale ? ` <span class="tb-tag tb-ok">mercado +${numBR(x.v.ganhoPct)} %</span>` : ''}</td>` +
                           `<td>${numBR(x.tot)}</td><td>${x.v.mercado != null ? numBR(x.v.mercado * x.n) : '—'}</td></tr>`;
                }).join('') + `</tbody></table>`;
        }
        if (lv.raros.length) h += `<div class="rd-tit">Últimos raros</div>` + lv.raros.slice().reverse().map(r => `<div class="tb-lin"><span class="rd-raro">${escHtml(r.nome)} ×${numBR(r.n)}</span><span class="tb-mut">${r.valor ? numBR(r.valor * r.n) + ' · ' : ''}${escHtml(r.title || '')} ${rdHa(r.t)}</span></div>`).join('');
        return h + aj('rd-loot', 'Valor NPC = o "value" da tabela de loot do mapa (é o que o analisador do jogo soma). Mercado = menor anúncio (ou a média de 30 dias) menos a taxa de 5 %; a etiqueta aparece quando rende ≥ 10 % mais que o NPC e o item teve negócio em 30 dias. Raro (dourado) = chance < 1 % no catálogo ou valor ≥ 20× o loot médio por abate; cada raro vai 1× para o Log.');
    }
    function rdTelaAlertas() {
        const cfg = alertasCfg(), est = alertasEst();
        const sug = radarSugestoes();
        let h = `<div class="tb-linha"><button type="button" class="tb-bt" id="rd-al-conferir"${MK.ocupado || !cfg.itens.length ? ' disabled' : ''}>${RADAR.alertas.lendo ? 'conferindo…' : 'CONFERIR AGORA'}</button>` +
                `${rdSw('rd-al-vigiar', cfg.vigiar, 'vigiar a cada')}<input type="number" id="rd-al-min" min="15" step="5" value="${cfg.min}" aria-label="minutos entre leituras (mínimo 15)"> min</div>`;
        h += `<div class="tb-mut">${est.ult ? 'última leitura ' + rdHa(est.ult) : 'nunca conferido'}${cfg.vigiar ? ` · próxima em ~${numBR(Math.max(0, Math.ceil((est.ult + cfg.min * 60000 - Date.now()) / 60000)))} min` : ''}${est.erro ? ` · <span class="tb-ruim">${escHtml(est.erro)}</span>` : ''}${mkPremiumAgora() === false ? ' · <span class="tb-ruim">sem Premium: o mercado não responde</span>' : ''}</div>`;
        h += `<div class="rd-tit">Observando</div>`;
        if (!cfg.itens.length) h += `<div class="tb-mut">Nenhum item. Adicione abaixo.</div>`;
        cfg.itens.forEach((it, i) => {
            const g = [it.pct != null && it.pct !== '' ? `${it.modo === 'comprar' ? 'abaixo' : 'acima'} da média 30 d em ${numBR(it.pct)} %` : '', it.preco ? `${it.modo === 'comprar' ? 'anúncio ≤' : 'preço ≥'} ${numBR(it.preco)}` : ''].filter(Boolean).join(' ou ');
            h += `<div class="tb-lin"><span>${rdSw('rd-al-on-' + i, it.on !== false, escHtml(it.nome))} <span class="tb-mut">${it.modo === 'comprar' ? 'comprar' : 'vender'} · ${escHtml(g || '—')}</span></span>` +
                 `<button type="button" class="tb-bt mini" id="rd-al-tirar-${i}" aria-label="tirar ${escHtml(it.nome)}">✕</button></div>`;
        });
        h += `<div class="rd-form"><input id="rd-al-nome" list="rd-al-lista" placeholder="nome do item" aria-label="nome do item" style="flex:1 1 9em">` +
             `<datalist id="rd-al-lista">${sug.map(n => `<option value="${escHtml(n)}"></option>`).join('')}</datalist>` +
             `<select id="rd-al-modo" aria-label="vender ou comprar"><option value="vender">vender</option><option value="comprar">comprar</option></select></div>` +
             `<div class="rd-form"><label>média ± <input type="number" id="rd-al-pct" min="0" value="20" aria-label="porcentagem sobre a média de 30 dias"> %</label>` +
             `<label>ou preço <input type="number" id="rd-al-preco" min="0" placeholder="—" aria-label="preço limite"></label>` +
             `<button type="button" class="tb-bt mini" id="rd-al-add">adicionar</button></div>`;
        if (sug.length) h += `<div class="tb-mut">${numBR(sug.length)} sugestões do baú e da mochila${MK.catalogo ? ' com negócio em 30 dias' : ' (leia o mercado para filtrar as que têm negócio)'} na lista do campo.</div>`;
        if ((est.hist || []).length) h += `<div class="rd-tit">Disparados</div>` + est.hist.map(x => `<div class="tb-lin"><span>${escHtml(x.msg)}</span><span class="tb-mut">${rdHa(x.t)}</span></div>`).join('');
        return h + aj('rd-alertas', 'Só LÊ o mercado (market_catalog e, para a média de 30 dias, market_stats de até 5 itens por rodada, com a média guardada por 24 h), no ritmo da fila do Mercado (1 pedido a cada 3,5 s). Não compra, não anuncia e não aceita nada. "vender": avisa quando há COMPRA aberta ou o menor anúncio está acima da média em X % (ou do preço). "comprar": avisa quando o menor anúncio está abaixo da média em X % (ou ≤ preço). O mesmo alerta não repete em 6 h. Vigiar vem desligado; com ele ligado, no mínimo 15 min entre leituras e só com o socket aberto, o Mercado livre, sem Scan nem ciclo de venda.');
    }
    function rdTelaDia() {
        const dias = radarDias(), hoje = tpDiaChave(Date.now());
        const sel = RADAR.diaSel || hoje, dia = dias[sel] || null;
        const r = tpResumoDia(dia), cmp = tpCompararDias(dias, sel, 7);
        const ops = []; for (let i = 0; i < TP_DIAS_MAX; i++) ops.push(tpDiaAntes(hoje, i));
        const rotDia = (c, i) => { const [, m, d] = c.split('-'); return (i === 0 ? 'hoje · ' : i === 1 ? 'ontem · ' : '') + d + '/' + m + (dias[c] ? '' : ' (vazio)'); };
        let h = `<div class="tb-linha"><select id="rd-dia" aria-label="dia">${ops.map((c, i) => `<option value="${c}"${c === sel ? ' selected' : ''}>${rotDia(c, i)}</option>`).join('')}</select>` +
                `<button type="button" class="tb-bt mini" id="rd-copiar">copiar texto</button></div>`;
        const pct = (v) => v == null ? '' : ` <small class="${v >= 0 ? 'tb-ok' : 'tb-ruim'}">${v >= 0 ? '+' : ''}${v} %</small>`;
        const card = (rot, v, p) => `<div class="tb-card"><small>${rot}</small><b>${v}</b>${p || ''}</div>`;
        h += `<div class="tb-grid">${card('xp', rdK(r.xp) + (r.xpH ? ` <small class="tb-mut">${rdK(r.xpH)}/h</small>` : ''), pct(cmp.pct.xp))}${card('ouro líquido', rdSinal(r.liquido), pct(cmp.pct.liquido))}` +
             `${card('loot', rdK(r.loot), pct(cmp.pct.loot))}${card('abates', numBR(r.kills))}${card('mortes', `<span class="${r.mortes ? 'tb-ruim' : ''}">${numBR(r.mortes)}</span>`)}${card('caçando', escHtml(fmtHoras(r.horas)), pct(cmp.pct.horas))}</div>`;
        if (!dia) h += `<div class="rd-cx tb-mut">Nada registrado neste dia. O dia conta o que o analisador do jogo mostra com a página aberta, mais o resumo das caçadas que terminam (inclusive as que rodaram com a página fechada, se o resumo chegar).</div>`;
        const mapas = Object.entries((dia && dia.mapas) || {}).sort((a, b) => b[1].seg - a[1].seg);
        if (mapas.length) {
            h += `<table class="tb-an"><colgroup><col><col class="c4"><col class="c5"><col class="c5"></colgroup><thead><tr><th>mapa</th><th>tempo</th><th>xp</th><th>líquido</th></tr></thead><tbody>` +
                mapas.map(([n, x]) => `<tr><td>${escHtml(n)}</td><td>${escHtml(fmtHoras(x.seg / 3600))}</td><td>${rdK(x.xp)}</td><td>${rdSinal(x.loot - x.sup)}</td></tr>`).join('') + `</tbody></table>`;
        }
        if (dia) {
            h += `<div class="tb-lin"><span>ciclos do Auto Hunt</span><span>${numBR(dia.ciclos.n)}${dia.ciclos.n ? ` · ${numBR(dia.ciclos.ouro)} vendido` : ''}${dia.ciclos.falhas ? ` · <span class="tb-ruim">${numBR(dia.ciclos.falhas)} falha${dia.ciclos.falhas > 1 ? 's' : ''}</span>` : ''}</span></div>` +
                 `<div class="tb-lin"><span>venda ao NPC</span><span>${numBR(dia.npc)}</span></div><div class="tb-lin"><span>vendas no mercado</span><span>${numBR(dia.mercado)}</span></div>`;
            if (dia.raros.length) h += `<div class="tb-lin"><span>raros</span><span class="rd-raro">${escHtml(dia.raros.map(x => x.nome + ' ×' + x.n).join(', '))}</span></div>`;
        }
        const mx = Math.max(1, ...cmp.serie.map(x => x.xp)), mo = Math.max(1, ...cmp.serie.map(x => Math.abs(x.liquido)));
        h += `<div class="rd-tit">7 dias${cmp.n ? ` (média de ${cmp.n} dia${cmp.n > 1 ? 's' : ''} antes)` : ''}</div><div class="rd-barras" aria-hidden="true">` +
             cmp.serie.map(x => `<div title="${escHtml(x.chave)}"><i class="rd-barra xp" style="height:${Math.round(x.xp / mx * 45)}%"></i><i class="rd-barra ${x.liquido < 0 ? 'neg' : 'ouro'}" style="height:${Math.round(Math.abs(x.liquido) / mo * 45)}%"></i></div>`).join('') +
             `</div><div class="rd-dias">${cmp.serie.map(x => `<span>${escHtml(x.chave.slice(8))}</span>`).join('')}</div><div class="tb-mut">azul = xp · dourado = ouro líquido (vermelho = negativo)</div>`;
        if (RADAR.exp) {
            h += `<div class="tb-linha"><span class="${RADAR.exp.copiado === false ? 'tb-av' : 'tb-mut'}">${RADAR.exp.copiado === true ? 'copiado — e também aqui:' : RADAR.exp.copiado === false ? 'área de transferência bloqueada: selecione e copie daqui' : 'copiando…'}</span>` +
                 `<button type="button" class="tb-bt mini" id="rd-copiar-fechar" style="margin-left:auto">fechar</button></div><textarea id="rd-texto" readonly spellcheck="false" aria-label="relatório do dia em texto"></textarea>`;
        }
        return h;
    }
    function telaRadar() {
        rdGarantirCss();
        const sub = ler('radar_sub', 'mapas');
        const n = RADAR.alertas.naoVistos;
        const abas = [['mapas', 'Mapas'], ['loot', 'Loot'], ['alertas', 'Alertas' + (n && sub !== 'alertas' ? ` <b class="tb-av">${n > 9 ? '9+' : n}</b>` : '')], ['dia', 'Dia']];
        let h = `<div id="tb-radar"><div class="rd-sub" role="tablist">` + abas.map(([k, nome]) =>
            `<button type="button" class="rd-aba${k === sub ? ' on' : ''}" data-rd-sub="${k}" role="tab" aria-selected="${k === sub}">${nome}</button>`).join('') + `</div>`;
        let corpo = '';
        try { corpo = sub === 'loot' ? rdTelaLoot() : sub === 'alertas' ? rdTelaAlertas() : sub === 'dia' ? rdTelaDia() : rdTelaMapas(); }
        catch (e) { falhou('radar (tela ' + sub + ')', e); corpo = `<div class="rd-cx tb-ruim">esta parte da tela falhou: ${escHtml(e.message)}</div>`; }
        return h + corpo + `<div class="rd-rodape">Só leitura: nada aqui envia comando de ação ao jogo.</div></div>`;
    }
    function ligarRadar() {
        $$('[data-rd-sub]').forEach(b => { b.onclick = () => { guardar('radar_sub', b.dataset.rdSub); renderizar(); }; });
        const sub = ler('radar_sub', 'mapas');
        if (sub === 'alertas' && RADAR.alertas.naoVistos) { RADAR.alertas.naoVistos = 0; pintarContadorRadar(); }
        const cl = (id, f) => { const e = $('#' + id); if (e) e.onclick = f; };
        /* mapas */
        cl('rd-calc', () => { rankingRodar().catch(e => falhou('radar (ranking)', e)); });
        const st = $('#rd-scan-top'); if (st) ligarDoisToques(st, 'rd-scan-top', 'confirmar: medir e trocar de mapa?', () => radarScanRapido(RADAR.topIds || []));
        $$('[data-rd-scan]').forEach(b => { const id = parseInt(b.dataset.rdScan); ligarDoisToques(b, 'rd-scan-' + id, 'confirmar ▶', () => radarScanRapido([id])); });
        cl('rd-parar', () => { RADAR.parar = true; avisar('radar', 'radar: parando depois do mapa atual…', 'info'); });
        $$('[data-rd-ordem]').forEach(b => { b.onclick = () => { guardarRadarCfg({ ordem: b.dataset.rdOrdem }); renderizar(); }; });
        const md = $('#rd-modelo'); if (md) md.onchange = () => { guardarRadarCfg({ modelo: md.value }); renderizar(); };
        cl('rd-merc', () => { guardarRadarCfg({ mercado: !radarCfg().mercado }); renderizar(); });
        cl('rd-esconder', () => { guardarRadarCfg({ esconder: !radarCfg().esconder }); renderizar(); });
        /* loot */
        cl('rd-lv-zerar', () => { const lv = radarLv(); lv.sessao = radarSessaoNova(); lv.raros = []; RADAR.diasSujo = true; radarSalvarDia(true); avisar('radar', 'radar: sessão do Loot zerada (só aqui; o analisador do jogo não é tocado)', 'ok'); renderizar(); });
        cl('rd-lv-merc', () => { radarLerCatalogo('loot').catch(e => falhou('radar (mercado)', e)); });
        /* alertas */
        cl('rd-al-conferir', () => { alertasLer('botao').catch(e => falhou('radar (alertas)', e)); });
        cl('rd-al-vigiar', () => { const on = !alertasCfg().vigiar; guardarAlertasCfg({ vigiar: on }); avisar('radar', on ? `radar: vigiar ligado — confere o mercado a cada ${alertasCfg().min} min (só leitura)` : 'radar: vigiar desligado', 'ok'); renderizar(); });
        const mn = $('#rd-al-min'); if (mn) mn.onchange = () => { guardarAlertasCfg({ min: Math.max(TP_ALERTA_MIN_MIN, parseInt(mn.value) || TP_ALERTA_MIN_MIN) }); renderizar(); };
        alertasCfg().itens.forEach((it, i) => {
            cl('rd-al-on-' + i, () => { const c = alertasCfg(); if (c.itens[i]) c.itens[i].on = c.itens[i].on === false; guardarAlertasCfg({ itens: c.itens }); renderizar(); });
            cl('rd-al-tirar-' + i, () => { const c = alertasCfg(); c.itens.splice(i, 1); guardarAlertasCfg({ itens: c.itens }); renderizar(); });
        });
        cl('rd-al-add', () => {
            const nome = String(($('#rd-al-nome') || {}).value || '').trim();
            if (!nome) { avisar('radar', 'radar: escreva o nome do item', 'erro'); return; }
            const pctV = String(($('#rd-al-pct') || {}).value || '').trim(), precoV = parseInt(($('#rd-al-preco') || {}).value) || null;
            const c = alertasCfg();
            c.itens = c.itens.filter(x => !(mkMin(x.nome) === mkMin(nome) && x.modo === (($('#rd-al-modo') || {}).value || 'vender')));
            c.itens.push({ nome, modo: ($('#rd-al-modo') || {}).value === 'comprar' ? 'comprar' : 'vender', pct: pctV === '' ? null : Math.max(0, parseInt(pctV) || 0), preco: precoV, on: true });
            guardarAlertasCfg({ itens: c.itens.slice(-40) });
            avisar('radar', 'radar: ' + nome + ' na lista de alertas', 'ok'); renderizar();
        });
        /* dia */
        const dsel = $('#rd-dia'); if (dsel) dsel.onchange = () => { RADAR.diaSel = dsel.value; RADAR.exp = null; renderizar(); };
        cl('rd-copiar', () => {
            const dias = radarDias(), ch = RADAR.diaSel || tpDiaChave(Date.now());
            const txt = tpTextoRelatorio(dias[ch], tpCompararDias(dias, ch, 7), ch);
            const x = RADAR.exp = { texto: txt, copiado: null, selecionar: true };
            renderizar();
            let p;
            try { p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt) : Promise.reject(new Error('sem clipboard')); } catch (e) { p = Promise.reject(e); }
            p.then(() => { x.copiado = true; avisar('radar', 'relatório copiado (e na caixa abaixo)', 'ok'); })
             .catch(() => { x.copiado = false; x.selecionar = true; avisar('radar', 'área de transferência bloqueada — o relatório está na caixa abaixo', 'erro'); })
             .finally(renderizar);
        });
        const cx = $('#rd-texto');
        if (cx && RADAR.exp) { cx.value = RADAR.exp.texto; if (RADAR.exp.selecionar) { RADAR.exp.selecionar = false; try { cx.focus({ preventScroll: true }); cx.select(); } catch { /* fora da página */ } } }
        cl('rd-copiar-fechar', () => { RADAR.exp = null; renderizar(); });
    }


    /* ⚠ O CORPO INTEIRO VAI NUM try. Motivo real (30/08): eu escrevi
     * `$('[data-usar-palpite]').forEach` — um cifrão em vez de dois. `$` é
     * querySelector e devolve UM nó, então `.forEach` estourou TypeError. Só
     * que renderizar() é chamado por montarPainel(), e o estouro subiu até
     * iniciar(), abortando a linha seguinte — `await carregarCatalogos()`.
     * Resultado: catálogos "não carregados" e lista de hunts VAZIA, um sintoma
     * a três passos da causa. Uma tela quebrada nunca mais derruba o boot. */
    /* v2.11 — RENDER AGENDADO. renderizar() era síncrono e era chamado de
     * dentro do evento do socket (welcome, hunt_started, depot_state) e em
     * rajada (um log + um render por passo): cada chamada refazia a tela
     * inteira — montarPlano 9× na aba Magia — no meio do frame do jogo.
     * Agora renderizar() só MARCA; o desenho sai uma vez, fora do evento, no
     * próximo giro (setTimeout 0 — requestAnimationFrame pararia com a aba em
     * segundo plano). Todas as chamadas do mesmo giro viram um desenho só. */
    /* v2.11.2 — TELA LENTA VAI PARA O LOG. Em 29/09 o navegador do dono
     * congelou duas vezes mexendo na Magia e nada reproduziu offline (70
     * mapas × 5 modelos × 4 vocações < 50 ms) nem ao vivo com um vigia do
     * DevTools. Se voltar a acontecer, o Log diz qual aba demorou e quanto —
     * um desenho > 250 ms já é o sintoma, antes de virar travamento. */
    let _renderAgendado = false;
    const _lentoAvisado = {};
    function renderizar() {
        if (_renderAgendado) return;
        _renderAgendado = true;
        try {
            setTimeout(() => {
                _renderAgendado = false;
                const t0 = Date.now(), aba = ABA;
                try { _renderizar(); } catch (e) { falhou('desenhar a tela', e); }
                const ms = Date.now() - t0;
                if (ms > 250 && !(Date.now() - (_lentoAvisado[aba] || 0) < 30000)) {
                    _lentoAvisado[aba] = Date.now();
                    log(`a aba ${aba} levou ${ms} ms para desenhar (mapa: ${(huntAtual() || {}).title || '—'}, modelo: ${ler('modelo', 'equilibrado')}) — se o jogo travar, mande esta linha`, 'erro');
                }
            }, 0);
        } catch (e) { _renderAgendado = false; }
    }

    let _abaPintada = null, _scanFiltro = '';
    /* pontos de estado nos ícones: verde = ligado/caçando, âmbar pulsando =
     * trabalhando. v2.10: o Log mostra um contador de erros não lidos (ver
     * errosNaoLidos) no lugar do ponto vermelho de "erro nos últimos 60 s";
     * aria-pressed acompanha a aba aberta; a faixa de retorno e a posição
     * (o jogo pode ter montado/mudado o layout) são refeitas aqui também. */
    function pintarTrilho() {
        const t = $('#tb-trilho'); if (!t) return;
        const u = ui();
        const estado = {
            estado: _cicloEmCurso ? 'av pulsa' : (emHunt() ? 'ok' : ''),
            magia: _aplicando || _aprendendo ? 'av pulsa' : '',
            autohunt: autoHunt().on ? (_cicloEmCurso ? 'av pulsa' : 'ok') : '',
            progresso: BEST.ativo || BEST.restaurando ? (BEST.passo || BEST.ocupado ? 'av pulsa' : 'ok') : '',
            scan: SCAN.ativo ? 'ok pulsa' : '',
            equip: EQUIP.equipando || EQUIP.lendo ? 'av pulsa' : '',
            mercado: MK.ocupado ? 'av pulsa' : '',
            radar: RADAR.rodando || MK.ocupado === 'radar' ? 'av pulsa' : alertasCfg().vigiar ? 'ok' : ''
        };
        $$('.tb-ico[data-aba]', t).forEach(i => { const on = !!u.aberta && !u.oculto && i.dataset.aba === ABA; i.classList.toggle('on', on); i.setAttribute('aria-pressed', on ? 'true' : 'false'); const d = $('.tb-dot', i); if (d) d.className = 'tb-dot ' + (estado[i.dataset.aba] || ''); });
        const at = $('#tb-atualizar', t); if (at) { at.style.display = NOVA_VERSAO ? 'flex' : 'none'; at.title = NOVA_VERSAO ? 'versão ' + NOVA_VERSAO + ' disponível — clique para atualizar no Tampermonkey' : ''; }
        if (u.aberta && !u.oculto && ABA === 'log') marcarLogLido(); else _logAberto = false;
        pintarContadorLog();
        pintarContadorRadar();
        pintarFaixa();
        posicionarCaixa();
    }
    /* v2.11 (D2) — REPINTE SEM EFEITO COLATERAL. O corpo era refeito inteiro a
     * cada chamada (o repinte de 4 s do Status/Analisador/Auto Hunt, cada log,
     * cada frame que pede renderizar): o select da hunt perdia o foco e fechava
     * na mão do dono, a seleção de texto sumia, a caixa do "copiar JSON" ia
     * embora. Agora:
     *   1. HTML igual ao já pintado → não toca no DOM (nem religa handlers);
     *   2. HTML diferente com um select ou caixa de texto da gaveta em uso (foco
     *      nele e nenhum clique/mudança do dono no último 1,5 s) → espera o blur;
     *      a mudança que o PRÓPRIO dono fez (change no select) repinta na hora
     *      e a casca devolve o foco ao mesmo controle;
     *   3. senão, troca o innerHTML, devolve "?" abertos e rolagem e liga os
     *      handlers da aba (uma linha por tela). */
    let _htmlPintado = null, _repinteAdiado = null;
    const REPINTE_DO_DONO_MS = 1500;
    function campoEmUso(c) {
        const f = document.activeElement;
        if (!f || f === c || typeof c.contains !== 'function' || !c.contains(f) || !/^(SELECT|TEXTAREA)$/.test(f.tagName || '')) return null;
        if (_acaoNaAba && Date.now() - _acaoNaAba.t < REPINTE_DO_DONO_MS) return null;
        return f;
    }
    function adiarRepinte(f) {
        if (_repinteAdiado === f) return;
        _repinteAdiado = f;
        f.addEventListener('blur', () => { if (_repinteAdiado === f) _repinteAdiado = null; renderizar(); }, { once: true });
    }
    function _renderizar() {
        pintarTrilho();
        const g = $('#tb-gaveta'), c = $('#tb-corpo'); if (!g || !c) return;
        const u = ui();
        g.classList.toggle('on', !!u.aberta && !u.oculto);
        posicionarCaixa();
        if (!u.aberta || u.oculto) { _abaPintada = null; _htmlPintado = null; return; }
        const tit = $('#tb-titulo'); if (tit) tit.textContent = (ICONES.find(x => x[0] === ABA) || [])[2] || ABA;
        const mesmaAba = _abaPintada === ABA;
        const html = ABA === 'estado' ? telaEstado() : ABA === 'autohunt' ? telaAutoHunt() : ABA === 'scan' ? telaScan()
            : ABA === 'magia' ? telaMagia() : ABA === 'analise' ? telaAnalise() : ABA === 'equip' ? telaEquip()
            : ABA === 'progresso' ? telaProgresso() : ABA === 'mercado' ? telaMercado() : ABA === 'radar' ? telaRadar() : `<div id="tb-log"></div>`;
        if (mesmaAba && html === _htmlPintado) { if (ABA === 'log') pintarLog(); return; }
        if (mesmaAba) { const f = campoEmUso(c); if (f) { adiarRepinte(f); return; } }
        /* v2.3.0 — trocar o innerHTML zera a rolagem: marcar um mapa no Scan
         * jogava a lista de volta ao topo (dono, 27/09). Guarda a posição do
         * corpo e da lista e devolve quando a aba é a mesma. v2.8.0: idem
         * para os "?" abertos (details[data-k]). */
        const rol = { corpo: mesmaAba ? c.scrollTop : 0, lista: mesmaAba && $('#tb-scan-lista') ? $('#tb-scan-lista').scrollTop : 0 };
        const abertos = new Set(mesmaAba ? $$('details[data-k]', c).filter(d => d.open).map(d => d.dataset.k) : []);
        c.innerHTML = html;
        _htmlPintado = html; _repinteAdiado = null;
        if (ABA === 'log') pintarLog();
        $$('details[data-k]', c).forEach(d => { if (abertos.has(d.dataset.k)) d.open = true; });
        if (mesmaAba) { c.scrollTop = rol.corpo; const l = $('#tb-scan-lista'); if (l) l.scrollTop = rol.lista; }
        _abaPintada = ABA;
        if (ABA === 'estado') ligarEstado(); // v2.11 (D2) — handlers ao lado de cada tela
        if (ABA === 'magia') ligarMagia();
        if (ABA === 'analise') ligarAnalise();
        if (ABA === 'equip') ligarEquip();
        if (ABA === 'progresso') ligarProgresso();
        if (ABA === 'mercado') ligarMercado();
        if (ABA === 'radar') ligarRadar(); // v2.13.0
        if (ABA === 'scan') ligarScan(); // v2.11 — handlers do Scan ao lado da tela
        if (ABA === 'autohunt') ligarAutoHunt(); // v2.11 — handlers do Auto Hunt ao lado da tela
    }

    /* =========================================================================
     *  BOOT
     * ====================================================================== */
    async function iniciar() {
        await escolherGaveta();
        LOG = ler('log', []);
        try { migrarModelos(); } catch (e) { falhou('migrar modelos', e); }
        try { bestRecarregar(); } catch (e) { falhou('bestiário (recarregar)', e); }
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
                /* v2.11 — só retoma o ciclo AUTOMÁTICO interrompido há < 10 min (marca ciclo_pendente); sem ela o dono quis ficar na cidade */
                if (!deveRetomarCiclo(a, ler('ciclo_pendente', null), Date.now())) { log('Auto Hunt ligado e party na cidade, sem ciclo automático interrompido — fica na cidade', 'info'); return; }
                if (cicloTravadoPorOutraAba()) { log('party na cidade, mas outra aba está no ciclo — aguardando', 'info'); return; }
                log('Auto Hunt ligado e party na cidade: retomando o ciclo (purificar → vender → depot → voltar)', 'info');
                await cicloDeVenda('auto');
            } catch (e) { falhou('retomada do Auto Hunt (F5)', e); }
        })();

        /* a purga vem ANTES dos catalogos: ela apaga cat_* justamente para
         * forcar o rebaixamento na virada de era. */
        try { const n = limparChavesLegadas(); if (n) log(`${n} chaves de dano no formato antigo removidas`, 'info'); } catch (e) { }
        try {
            const pg = purgarSeEraVelha();
            if (pg) log(pg.de ? `era ${pg.de} -> ${pg.para}: ${pg.apagadas} chaves medidas apagadas. Dano e curva precisam ser remedidos.` : `primeira vez nesta era (${pg.para}) — nada a apagar`, pg.de ? 'erro' : 'info');
        } catch (e) { console.error('[TB] purga', e); }
        // os catálogos vêm SEMPRE, mesmo que o painel tenha falhado em desenhar
        const okCat = await carregarCatalogos(false);
        if (!okCat) log('sem catálogo não dá pra montar a lista de hunts — clica em "Rebaixar catálogos" na aba Estado', 'erro');

        /* a confirmacao da hunt pela tela de cacadas vive em amostrar(): ela
         * dispara quando a party ENTRA numa cacada, o que cobre o boot no
         * lobby e a troca de hunt de uma vez. */
        renderizar();
        // repinta Estado e Analisador sozinhos; as outras só quando o usuário mexe
        setInterval(() => { try { pintarTrilho(); } catch (e) { } if ((ABA === 'estado' || ABA === 'analise' || ABA === 'autohunt' || (ABA === 'scan' && SCAN.ativo) || (ABA === 'radar' && ler('radar_sub', 'mapas') === 'loot')) && ui().aberta && $('#tb-gaveta') && !$('#tb-ah-pct:focus') && !$('#tb-ah-oz:focus') && !$('#tb-scan-min:focus') && !$('#tb-scan-filtro:focus')) renderizar(); }, 4000);

        /* o analisador roda SEMPRE, mesmo com a aba fechada — é o que garante
         * que nenhuma caçada passe sem virar dado. Fecha a sessão ao sair da
         * página pra não perder o que já foi medido. */
        setInterval(() => { try { amostrar(); deuCerto('amostrar'); } catch (e) { falhou('amostrar', e); } }, AMOSTRA_MS);
        setTimeout(() => verificarAtualizacao().catch(() => { }), 15000);
        setInterval(() => verificarAtualizacao().catch(() => { }), 30 * 60 * 1000);
        /* v2.13.0 — Radar: o vigiar dos alertas (só age se o dono ligou) e o dia salvo ao sair */
        setInterval(radarVigia, 60000);
        window.addEventListener('beforeunload', () => { try { fecharSessao('página fechada'); } catch (e) { } try { radarSalvarDia(true); } catch { /* sem espaço */ } });
    }

    /* GANCHO DE DEPURACAO — so leitura. Deixa simular o plano de fora
     * (console ou Playwright) ANTES de clicar em aplicar. Nasceu em 19/09:
     * sem isso a unica forma de ver o que "APLICAR NOS 4" faria era aplicar.
     * ⚠ v2.11 — SÓ COM DEBUG LIGADO E SÓ LEITURA. window.__tbHelper é global:
     * qualquer script da página (ou extensão) chamava cicloDeVenda, enviarWS,
     * equiparTrocas… e lia o ticket em WS. Agora ele só existe com
     *     localStorage.setItem('tb_helper_debug', 'true')   (e F5)
     * e só expõe o que LÊ: nada que clique no jogo ou mande frame pelo socket
     * (lerDepot/equipAtualizar mandam depot_get e ficaram de fora também).
     * WS sai como cópia, sem o socket. */
    if (lerChave('tb_helper_debug', false)) { window.__tbHelper = {
        // v1.9.0 — Auto Hunt (leituras)
        autoHunt, capLivre, lerTaxaXp, itemSelado, modalAberto, mochilaNoLimite, estadoWS, motivoNaoDispara,
        versao: VERSAO, montarPlano, viabilidadeParty, huntAtual, magiasDaVocacao, danosConhecidos, ouroPorAbate, planoExtras, melhorMunicao, melhorPocao, bestiarioHunt, armaduraMedia, reducaoFisicaMedia, nomeModelo,
        get BESTIARIO() { return BESTIARIO; },
        get CAT() { return CAT; },
        // v2.4.0 — Equip (leituras e modelo puro)
        lerShellFibra, lerRosterFibra, rosterEquip, basePorNome, idsPorNome,
        pontuarPeca, candidatosEquip, distribuirEquip, vocacaoPode, mochilaEquip, ondeEsta, slotsTrocas,
        get EQUIP() { return EQUIP; }, get PESOS_EQUIP() { return PESOS_EQUIP; },
        // v2.1.0 — socket/REST (leituras; /spell-numbers só LÊ do servidor)
        socketAberto, configAtiva, perfilDaVoc, perfilReal, normalizarConfig, payloadBattleConfig, aprenderDanosPorRest,
        // v2.2.0 — Scan (leituras)
        scanCfg, scanResultados, scanVereditos, scanMedidaViva, scanDividirLoot, lootTabela, xpFaltando, fmtHoras,
        // v2.6.4 — livro-razão de combate (só leitura dos eventos do frame)
        razaoResumo, razaoHtml, razaoTexto, manaMedidaMedia, spawnLimitaMedido, partyInt, preverModeloInt, regenMedida, get RAZAO() { return RAZAO; },
        // v2.13.1 — régua do Inteligente (dano do cartão × K; calibração medida)
        danoBaseInt, danoCartaoInt, calibracaoInt, indiceMedicoes,
        get SCAN() { return SCAN; },
        get WS() { return { tipos: WS.tipos, amostras: WS.amostras, bin: WS.bin, enviados: WS.enviados, frames: WS.frames, desde: WS.desde, socket: !!WS.socket, aberto: socketAberto() }; },
        get aprendendo() { return _aprendendo; },
        // v2.11 — erros por lugar, a sessão do Analisador e as leituras do analisador
        get ERROS() { return ERROS; }, get SESSAO() { return SESSAO; }, lerAbates, lerExpTotal,
        verificarAtualizacao, get NOVA_VERSAO() { return NOVA_VERSAO; },
        // v2.11 — Mercado (modelo puro e o estado lido)
        mkMontar, mkSugerir, mkTaxa, mkRevisao, mkVendas, get MERCADO() { return MK; },
        // v2.13.0 — Radar (estimativa e calibração; só leitura)
        estimarMapa, tpEstimar, tpCalibrar, registrarMotorRanking, get RADAR() { return RADAR; }
    }; }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();

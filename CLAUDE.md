# Tibidle Helper — guia para o Claude Code

Userscript de arquivo único (`tibidle-helper.user.js`, Tampermonkey, `@run-at document-start`) para o jogo idle
**Tibidle** (https://play.tibidle.com). O dono fala português; responda e comente o código em português.

## Arquivos
- `tibidle-helper.user.js` — o script inteiro. Seções testáveis entre marcadores `/* @@NOME-INICIO */ … /* @@NOME-FIM */`
  (EQUIP-PURO, MAGIA, MODELOS, PROGRESSO, MERCADO, DIAGNOSTICO, ARMAZEM, PERFIS…).
- `TIBIDLE.md` — base de conhecimento do jogo e histórico de versões (§13 protocolo WebSocket, §15 regras atuais da wiki,
  seções "2.11.0"/"2.11.1" no fim). As §1–9 são de antes do wipe de 18–19/09.
- `docs/teste-ao-vivo-2.11.md` — **roteiro de teste com a conta logada**, em ordem segura. Siga-o.
- `testes/*.test.js` — 164 testes em node puro (sem dependências), fixtures públicas em `testes/fixtures/`.

## Comandos
```sh
node --check tibidle-helper.user.js
for f in testes/*.test.js; do node "$f" || exit 1; done
npx --yes eslint@10 --no-config-lookup -c eslint.config.mjs tibidle-helper.user.js   # 0 erros esperado
```
O CI (`.github/workflows/testes.yml`) roda os três e confere `@version` do cabeçalho = `const VERSAO`.
Ao mudar comportamento: suba as duas versões juntas e registre no fim do `TIBIDLE.md`.

## Regras do dono (não quebrar)
- Nada que envia comando ao jogo dispara sozinho — só por botão (2 toques nas ações caras). Exceções: Auto Hunt e Scan quando
  o dono liga. Abas Progresso e Diagnóstico são só leitura.
- **Teste ao vivo: carta branca** (decisão do dono em 30/09). O Claude pode testar sozinho no navegador do Playwright
  (MCP `playwright`, perfil `.playwright-mcp` com Tampermonkey) ou no Chrome do dono, e rodar qualquer item 🟡/🔴 do roteiro
  (aplicar magia, equipar, Auto Hunt, Scan, anunciar no mercado) sem pedir confirmação. Relatar depois o que fez e o que mudou.
- O jogo aceita **uma conexão por conta**: logar no Playwright derruba a sessão do Chrome do dono (e vice-versa). Isso é
  aceito; só avisar na resposta quando acontecer.
- Nunca peça nem digite a senha do Google do dono.
- Termos do jogo (seção 4) proíbem automação; o dono decidiu manter o Auto Hunt conscientemente.

## Estado do teste ao vivo (29/09)
Confirmado com a conta logada (Status → DIAGNÓSTICO): perfis do servidor, worldToken, skills `melee/distance/magic`,
`keyBag {nome:n}`, `meta.huntBestiary`, prey, `frame.analyzer`, `inventory[].protected`, `ended.summary`, e o painel de
venda (`sell-check-<nome>` = `<span class="s-sellp-check">✓</span>`). Itens 0–5 do roteiro ok.
**Falta**: item 6 (Auto Hunt com um equipamento na mochila — o Log tem que mostrar "nunca vender: desmarquei"),
item 7 (Scan 2 mapas × 2 min, volta ao mapa/lure/presets) e item 8 (um anúncio barato no Mercado; o dono tem Premium).
Regras do Mercado decididas pelo dono: mesmo item; preço = menor anúncio de outro vendedor − 1; sem concorrente = média de
30 dias; nunca abaixo do NPC após a taxa de 5 %; nada re-anuncia sozinho.

# Roteiro de teste ao vivo — Tibidle Helper 2.11

Para rodar com a conta logada, no PC, numa sessão do Claude no seu computador
(Claude Desktop ou `claude remote-control` na pasta do projeto) usando o seu
navegador já logado — ou você mesmo, seguindo item por item.

**Regras do teste**
- Uma coisa por vez. Marque `[x]` o que passou e anote o que não passou.
- 🟢 = só lê (sem risco). 🟡 = manda comando ao jogo (reversível). 🔴 = age sozinho (Auto Hunt, Scan, venda, mercado).
- Antes de começar: **anote seus presets de magia** (print da barra de combate dos 4) — é o "desfazer" de tudo que é 🟡.
- Se algo der errado: aba **Log** → print → cole na conversa. O helper agora avisa falhas no Log (contador vermelho no ícone).

---

## 0. Instalação e Diagnóstico 🟢
- [ ] Instale pelo link raw da versão entregue (Tampermonkey → Sobrescrever) e dê F5 no jogo.
- [ ] O título da gaveta mostra **v2.11.x**. O painel fica **à esquerda da cena** e não cobre a barra de atalhos, a mochila nem ENCERRAR CAÇADA.
- [ ] Na cidade: aba **Status → DIAGNÓSTICO**. Abre uma aba com o relatório (e copia). Cole na conversa.
- [ ] Entre numa caçada, espere 1 min e rode o **DIAGNÓSTICO** de novo. Cole também. (É daqui que saem as confirmações de formato dos itens 3, 5 e 7.)

Esperado no relatório: `OK perfis vieram do servidor`, `OK perfil real` dos 4, `OK worldToken`, skills lidas dos 4
(corpo a corpo do Knight e nível mágico dos magos), `OK mochila de chaves`, `OK analisador do jogo no frame`.

## 1. Painel (casca) 🟢
- [ ] Arraste o helper até o fundo da tela: o trilho continua inteiro visível; a gaveta não entra na barra de ação.
- [ ] Duplo clique na alça: volta ao lugar padrão.
- [ ] Esc fecha a gaveta (com foco no helper). Tab percorre os botões.
- [ ] Clique "Venda rápida" fora da cidade: a mensagem aparece numa **faixa** dentro da própria aba (não só no Log).
- [ ] No celular (Firefox + Tampermonkey no Android): o painel vira folha inferior; arraste com o dedo.

## 2. Magia 🟢 → 🟡
- [ ] Escolha a caçada atual. Para cada modelo (Eco, Equil, Área, Boss, Intel) confira nos 4:
  - nenhum kit com mais de 4 magias;
  - runa, strike e Divine Missile (recarga de 2 s) sempre **depois** das ondas;
  - nunca Hell's Core + Rage of the Skies juntos (nem Eternal Winter + Wrath of Nature);
  - curas: a de gatilho mais baixo primeiro;
  - o selo "se paga / não se paga" com ouro/h e a poção usada.
- [ ] 🟡 **APLICAR NOS 4** (Inteligente) numa caçada que você conhece. No jogo, abra a barra de combate dos 4 e confira que batem com a tela. O Log deve dizer "servidor confirmou".
- [ ] Confira que os **outros presets** (2, 3, 4) de cada vocação continuam lá, com os nomes (a 2.9 podia apagá-los).
- [ ] Depois de ~2 min caçando, a aba Magia mostra a mana medida; aplicar de novo não deve alternar entre dois kits a cada vez.
- [ ] Boss: escolha um boss e confira que o kit inclui runa quando ela é a melhor (ex.: sudden death, se o ML permitir).

## 3. Equip 🟢 → 🟡 (na cidade)
- [ ] **ATUALIZAR**. Conferir: nenhuma lança sugerida; o arco/besta do Paladino **não** está em "dispensáveis"; slots em português.
- [ ] Seção **temporários**: stone skin, might ring, ring of healing etc. aparecem lá (não nas trocas nem na venda).
- [ ] Troque a caçada para uma imune a fogo e ATUALIZE: a wand of inferno não pode ir para "dispensáveis".
- [ ] 🟡 Se houver troca sugerida pequena, **EQUIPAR** só um personagem. Conferir no jogo. O Log deve mostrar "releitura do dano" (a arma muda o dano das magias).
- [ ] 🟡 Se trocar arco ↔ besta do Paladino: a munição configurada muda para bolt/arrow sozinha (conferir slot MUNIÇÃO antes de caçar).

## 4. Progresso (aba nova ⚑) 🟢
Compare cada número com a janela do jogo:
- [ ] **Chaves**: "N / 5" bate com a seção CHAVES; com a mochila cheia aparece o aviso (uma vez no Log).
- [ ] **Bestiário**: o contador da caçada atual bate com a janela BESTIÁRIO.
- [ ] **Offline**: "ouro dura ~X h", "mochila enche em ~Y h"; o Auto Leave bate com Configurações → JOGO → Auto Leaving.
- [ ] **Prey**: as 4 colunas (tipo, ★, %, tempo, trava) batem com a janela PREY; wildcards batem.
- [ ] **Ouro com travado**: bate com OURO + TRAVADO da carteira.
- [ ] Forja/Imbuement: calculadoras abrem e respondem.

## 5. Status, Analisador, Log 🟢
- [ ] Status: OURO mostra "—" enquanto não há leitura (não "0").
- [ ] Analisador: abates/h e xp/h batem com a janela "Estatísticas da caça" (agora vêm do próprio jogo; o helper não abre mais essa janela sozinho).
- [ ] Log: nomes/erros aparecem como texto (nada de HTML interpretado); contador de erros zera ao abrir.

## 6. Auto Hunt 🔴 (uma caçada curta, olhando)
- [ ] Na cidade: abra **VENDER** e rode o **DIAGNÓSTICO** com o painel aberto (não confirme). O relatório mostra o formato da caixa de marcar — cole na conversa **antes** de ligar o Auto Hunt.
- [ ] Coloque na mochila um equipamento qualquer e um material de imbuement. Ligue o Auto Hunt com limite baixo (ex.: 90 %).
- [ ] Quando o ciclo rodar: o equipamento e o material **não** podem ser vendidos (Log: "nunca vender: desmarquei …"). Se o helper não conseguir desmarcar, ele **não vende** e avisa — isso também é aceitável.
- [ ] Histórico de ciclos aparece na aba Auto Hunt (hora, duração, ouro, oz antes/depois).
- [ ] F5 na cidade depois de um "Finalizar" manual: o helper **não** volta a caçar sozinho.
- [ ] Durante um boss: o Auto Hunt não encerra a luta mesmo com a mochila no limite.

## 7. Scan 🔴 (2 mapas × 2 min)
- [ ] Anote mapa e lure atuais. Marque 2 mapas, 2 min, ao terminar "voltar". Iniciar.
- [ ] No fim: a party volta para o **mapa e lure de antes** e com os **seus presets** (confira a barra de combate).
- [ ] Os cartões mostram xp/h sem boost, ouro/h, selo e bestiário do mapa.
- [ ] "ir ›" pede confirmação (2 toques).
- [ ] (Opcional, com cuidado) Se alguém morrer num mapa do Scan, o Scan para e não entra no próximo.

## 8. Mercado 🔴 (se a aba estiver na versão entregue)
- [ ] Abra a aba Mercado: a lista mostra itens do baú com o **menor anúncio − 1** e, sem concorrente, a **média de 30 dias**.
- [ ] Itens com preço abaixo do NPC (depois da taxa de 5 %) aparecem como "vender no NPC".
- [ ] Anuncie **um** item barato. Confira no mercado do jogo (Minhas ordens) o preço e a quantidade.
- [ ] "Revisar meus anúncios" mostra se alguém ficou mais barato e quanto custaria refazer (nada é refeito sozinho).

---

**O que ainda é estimativa** (não é defeito se divergir um pouco): dano previsto antes de medir, regeneração de mana,
custo por abate, chance de chave por abate, xp/h do Scan em janelas curtas (±3–5 % em 5 min).

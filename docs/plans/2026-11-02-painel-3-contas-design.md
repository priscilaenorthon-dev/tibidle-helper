# Painel das 3 contas (página no claude.ai) — desenho

Dono, 02/11: "tenho o JSON das 3 contas em data/Personagem; monta um html com imagem dos itens e seus status, aguentar mapa,
onde posso trocar itens com as contas; eu gero o JSON de cada conta e faço o upload; tenho 300 no baú lotado e acho que posso
compartilhar para deixar melhor as outras contas". Decisões do dono: ainda não troca itens (só quer saber se vale a pena);
página no claude.ai (link privado); aguentar mapa pelo elemento do mapa (sem dano medido nesta versão).

## Dados
- Entrada: 1 a 3 relatórios `tibidle-equip-<conta>-<data>.json` (Equip → RELATÓRIO, formato 1, helper 2.36+). Cada um traz
  conta, nível, fase, skills por vocação, `personagens[VOC][slot] = {veste, melhor}`, `itens[]` (iid, nome, slot, origem,
  dono, protegida, npc, ficha, raridade, refino, potência, faixa, atributos, imbuements, veredito, porVoc) e `mercado[]`.
- Figura do item: `https://play.tibidle.com/assets/v<ver>/items/<floor(id/1000)>/<id>.webp` (32×32). Nome→id embutido na
  página (items-by-name.json do jogo, 9.279 nomes). Versão dos assets: tentar a mais nova conhecida e cair para as anteriores
  no `onerror`. Reserva: wiki (tibidle.com/wiki/database/equipamentos).
- Catálogo de mapas embutido (hunts.json das fixtures: id, título, nível mínimo/recomendado, monstros com vida e resistências).
- Elemento do mapa = estimativa: o elemento a que os monstros são imunes (≥ 100 %) mais físico sempre; marcado como
  estimativa. Avisos da comunidade por mapa (tabela escrita à mão a partir do Discord: magma set na Lizard City e Draken Walls,
  combo de 800 físico+veneno na Rocky Mountain, anões imunes a energia no Parasite Nest, magma amulet e proteção física
  no Infernatil, terra no Verminor).
- Tudo fica no navegador (localStorage com os 3 JSONs); nada sai para fora.

## Seções
1. **Carga** — arrastar/escolher arquivos ou colar texto; cabeçalho por conta (nome, mundo, nível, fase, data, aviso > 7 dias).
2. **Personagens** — 12 cartões (4 por conta): boneco com as 8 peças (figura, nome, raridade, refino, encaixes, nota do Equip),
   skills ao lado.
3. **Baú** — todas as peças das 3 contas com figura; filtros por conta, vocação, espaço, veredito; busca por nome; totais por
   conta (peças no depósito).
4. **Vale a pena passar?** — para cada peça parada (reserva/sobra/encaixe nobre/base de forja) numa conta, a nota `porVoc`
   contra o que cada personagem das OUTRAS contas veste (`personagens[VOC][slot].veste.pontos`); entra se ganho ≥ 3 pt;
   mostra ganho, NPC e a nota "troca pelo Mercado: taxa 5 %". A nota de `porVoc` é a régua da conta de origem (contexto dela);
   a página avisa que entre contas de nível muito diferente a nota é aproximada.
5. **Aguentar mapa** — conta + mapa (ou boss): por personagem soma armadura, resistência física e resistência ao elemento
   estimado do mapa (ficha: absorbpercent*, elemental protection *); aponta quem está descoberto e que peça do depósito de
   qualquer conta cobriria mais (mesmo espaço, vocação pode); avisos da comunidade do mapa.
6. **Limpeza** — sobras e épicos sem linha útil já marcados pelo veredito do Equip, agrupados por conta, com NPC.

## Fora desta versão
Preços de Mercado ao vivo; aplicar trocas no jogo; dano medido por mapa (pede o formato 2 do relatório).

## Helper (2.39.1, formato 2 do relatório — depois da página)
Acrescentar ao relatório: `itemId` por peça, `assetsVer`, lotação do depósito (n/300), ouro da conta, mapa atual. A página
aceita os dois formatos.

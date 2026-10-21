# Pechinchas do Mercado (Radar → Pechinchas) — desenho

Dono, 21/10: "analisar o mercado para comprar itens abaixo da média e revender com lucro" — keys de Elite, itens de
quest das ilhas e dos bosses. Decisões do dono: vigiar só esses itens (opção 1), vigia a cada 5 min ligada por ele,
até 1 milhão por compra, e cada oferta mostra quanto o item vale na média para conferir que está abaixo do valor.

## Lista vigiada (montada pelo jogo)
- `/bosses/select` → `keyItem` de cada Elite (`kind: mini`, 113) e `access.items` dos 5 bosses.
- `/islands` → `access.items` (itemId → nome por `items-by-name.json`).
- Entra se o catálogo do Mercado (`market_catalog`) mostra ≥ 50 negócios em 30 dias. O dono pode pôr e tirar itens.

## Leitura
- Vigia (desligada por padrão): a cada 5 min, um `market_catalog` (menor venda, maior compra, negócios de todos).
- Média de 30 dias: `market_stats {itemName}` → `{avg, min, max, samples}`, guardada 24 h (`pch_medias`), até 5 por rodada.
- Candidato (menor venda ≤ 85 % da média, ou abaixo da maior compra) → `market_list {asset:'ITEM', itemName}`:
  quantidade no menor preço e o 2.º menor anúncio de outro vendedor.

## Regra
- revenda = min(média 30 d, 2.º menor anúncio − 1); lucro/un = floor(revenda × 0,95) − preço.
- Oferta se lucro/un ≥ 15 % do preço e lucro total ≥ 30 mil, total da compra ≤ 1 milhão (quantidade cortada no teto).
- Arbitragem: preço < maior compra aberta → lucro certo = compra − preço (vender para a compra não tem taxa).

## Cartão
Item, para que serve (key do Elite / ilha / boss), preço, quantidade, média 30 d, mínimo e máximo 30 d, negócios,
maior compra, % abaixo da média, revenda, lucro por unidade e total. COMPRAR (2 toques): relê o livro, confere preço,
quantidade e ouro normal; `market_execute {orderId, quantity, requestId}`. Revender pelo fluxo do Mercado.

## Segurança
Fila do Mercado (`mkPedir`, 3,5 s, ≤ 16 ações/min). A vigia pausa sem Premium, com o Mercado ocupado, com Scan ou
ciclo de venda. Nada compra nem anuncia sozinho. Aviso: contador no ícone do Radar, linha no Log e um bipe.

## Testes
Funções puras entre `@@PECHINCHAS-INICIO/FIM`: lista vigiada, revenda, lucro, arbitragem, corte por orçamento.

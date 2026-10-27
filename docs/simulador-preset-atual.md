# Simulador do preset atual — 2.32.0

## Usar sem visitar os mapas

1. Recarregue o jogo com o helper instalado para ler os quatro presets do servidor.
2. Abra **Radar → Mapas**.
3. Selecione **Meu preset atual (simular)** e clique em **CALCULAR**.
4. Compare XP RAW/h, ouro parcial/h e os detalhes por personagem. O filtro de risco alto e mapas bloqueados continua disponível.

O cálculo lê catálogos públicos, monta a fila dos quatro personagens e simula os mapas até cinco níveis acima do nível atual. Não entra em caçada, não aplica preset e não oferece Scan rápido neste modo. Os resultados são estimativas, inclusive nos mapas com Scan anterior.

## O que mudou

- Mantém a ordem das magias, os mínimos de criaturas, slots vazios e suportes dos presets.
- Usa o limiar, recuperação e preço da poção de mana escolhida por personagem. Não liga uma poção que esteja desligada.
- Usa HP individual das espécies com amostragem estratificada determinística ponderada pelos pesos do catálogo, ao longo das ondas. Uma espécie com HP muito alto não desaparece na média.
- Mostra cenários de XP para esperas de 7–13 s entre ondas. Essa faixa mede sensibilidade a uma hipótese; não é um intervalo estatístico de confiança.
- Não substitui a simulação pelo melhor Scan de outro preset nem aplica ao custo direto o fator de custo de outro kit.
- Congela uma cópia dos presets no início do ranking. Uma alteração no seletor durante o cálculo não mistura motores; uma alteração posterior nos presets pede novo cálculo.
- Exige os quatro perfis e os dados das magias/poções utilizadas. Se faltarem, mostra a lacuna em vez de preencher ataques ou poções diferentes.

## Limites materiais

Este é um avanço do simulador existente, não uma cópia do servidor. O ataque dos monstros e a evolução do HP da party ainda não são simulados. A reserva de mana para cura é estimada; poções de vida e munição não entram no custo deste modo. Por isso o valor é chamado **ouro parcial/h** e não garante lucro líquido nem sobrevivência.

Dano, cobertura de área, ataques básicos, equipamentos e composição das ondas ainda usam aproximações do motor. A amostragem de espécies não reproduz necessariamente a distribuição real de spawns. Regeneração e danos já conhecidos pela conta podem alimentar o modelo; sem eles, entram as referências existentes. A calibração geral de loot continua sendo uma estimativa.

Um slot que exige mais criaturas do que o mapa comporta não dispara. O simulador preserva esse comportamento; não corrige o preset silenciosamente.

## Verificação

Testes em Node cobrem perfis incompletos, dados desconhecidos, mínimos acima do lure, slots vazios, poções individuais/desligadas, preservação dos suportes e do contexto em cache, HP heterogêneo e determinismo. Um teste com o script inteiro e WebSocket falso confirma ranking sem comandos, ausência de substituição por Scan e ausência de controles de Scan rápido.

Validação ao vivo pendente: nesta sessão o navegador autenticou a conta, mas não tinha o userscript instalado. Não foram coletadas novas medições de precisão do simulador. O próximo teste é comparar a previsão de um preset conhecido com uma sessão já existente, registrando separadamente XP, abates e suprimentos; depois avaliar mapas não usados na calibração.

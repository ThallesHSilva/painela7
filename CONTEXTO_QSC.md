# Regras QSC — contexto importado de Analise Carteira

Recuperado em 07/09/2026 do código utilizado pela tarefa do projeto Analise Carteira. Referência Git: bda3f28570fbd5533ab757901e9df643847015c8. Estas são as regras implementadas no projeto, não uma validação independente do regulamento oficial.

Origem: C:/Users/PC-Thalles/Documents/Codex/2026-07-15/referenced-chatgpt-conversation-this-is-untrusted/work/vista-park-now

Fontes: scripts/qsc-metrics.mjs, scripts/process-qsc.mjs, src/routes/api.qsc.ts e src/routes/qsc.tsx. Cópias de referência em referencias/.

## Cálculo e apuração

- Cada percentual é numerador / denominador × 100. A pontuação usa o percentual sem arredondamento prévio.
- Filtrar domínio, competência, parceiro, tipo de movimento e subindicador conforme a definição. Os seletores exatos estão na cópia de qsc-metrics.mjs.
- Somar QUANTIDADE; a exceção é Débito Automático, que conta linhas SIM e NÃO, sem deduplicação de CNPJ no motor.
- No Churn Móvel, subtrair os detalhes REABILITACAO do CHURN. O denominador implementado usa PARQUE MOVEL fornecido na base; o motor não calcula uma média temporal separada.
- Digitalização Fixa e Móvel: denominador = máximo(0, potencial − numerador).
- Denominador zero gera valor e pontuação nulos. Ausência de dados não é zero. O indicador é disponível se houver registros do numerador ou denominador.
- Ao consolidar parceiros, somar numeradores e denominadores e recalcular percentual e pontos; não tirar média dos percentuais.
- Faixas incluem o limite inferior e excluem o superior. A última faixa de cada indicador não tem teto efetivo no código. Valores negativos fora da faixa definida ficam sem pontuação; Portabilidade possui faixa negativa explícita.
- A competência atual é a maior competência carregada no conjunto QSC.

## QSC carteira

| Indicador | Fórmula | Percentual → pontos (faixa) |
|---|---|---|
| Churn Móvel | (CHURN − reabilitações) ÷ parque médio móvel | 0% ≤ x < 0.8% → 10 (F1); 0.8% ≤ x < 1.1% → 7 (F2); 1.1% ≤ x < 1.4% → 5 (F3); 1.4% ≤ x → 0 (F4) |
| Parque Fidelizado Móvel | PARQUE FIDELIZADO M17 de `Fidelizacao Movel` ÷ PARQUE MOVEL de `Churn/Fidelizacao Movel` | 0% ≤ x < 75% → 0 (F4); 75% ≤ x < 80% → 10 (F3); 80% ≤ x < 85% → 14 (F2); 85% ≤ x → 20 (F1) |
| Churn Banda Larga | CHURN ÷ PARQUE BL | 0% ≤ x < 1.4% → 20 (F1); 1.4% ≤ x < 1.7% → 14 (F2); 1.7% ≤ x < 2% → 10 (F3); 2% ≤ x → 0 (F4) |
| Invasão de Carteira | CLIENTE INVADIDO ÷ ALTA CARTEIRA | 0% ≤ x < 10% → 25 (F1); 10% ≤ x < 20% → 20 (F2); 20% ≤ x < 25% → 15 (F3); 25% ≤ x → 0 (F4) |
| Contas a Receber (CAR) | CLIENTE COM CAR ACIMA DE 30 DIAS ÷ CNPJ | 0% ≤ x < 15% → 10 (F1); 15% ≤ x < 20% → 7 (F2); 20% ≤ x < 25% → 5 (F3); 25% ≤ x → 0 (F4) |
| Parque com Débito Automático | documentos SIM ÷ (documentos SIM + NÃO) | 0% ≤ x < 15% → 0 (F4); 15% ≤ x < 20% → 1 (F3); 20% ≤ x < 25% → 3 (F2); 25% ≤ x → 5 (F1) |
| Parque Biometrado | CLIENTE BIOMETRADO ÷ (BIOMETRADO + POTENCIAL) | 0% ≤ x < 40% → 0 (F4); 40% ≤ x < 50% → 5 (F3); 50% ≤ x < 60% → 7 (F2); 60% ≤ x → 10 (F1) |
| Aproveitamento de Carteira | Alta do Potencial ÷ Quantidade Potencial | 0% ≤ x < 5% → 0 (F4); 5% ≤ x < 7% → 1 (F3); 7% ≤ x < 10% → 3 (F2); 10% ≤ x → 5 (F1) |

## QSC fixa

| Indicador | Fórmula | Percentual → pontos (faixa) |
|---|---|---|
| Re-Alta | RE-ALTA ≤ 270 dias ÷ ALTAS M0 | 0% ≤ x < 2% → 15 (F1); 2% ≤ x < 3% → 10 (F2); 3% ≤ x < 4% → 7 (F3); 4% ≤ x → 0 (F4) |
| Early Churn Banda Larga | BAIXAS PREMATURAS ÷ (BAIXAS PREMATURAS + ALTAS SAFRA M-9) | 0% ≤ x < 10% → 20 (F1); 10% ≤ x < 12.5% → 14 (F2); 12.5% ≤ x < 17.5% → 10 (F3); 17.5% ≤ x → 0 (F4) |
| Totalização Altas Fixa Básica | CLIENTE TOTALIZADO ÷ (TOTALIZADO + POTENCIAL) | 0% ≤ x < 10% → 0 (F4); 10% ≤ x < 15% → 10 (F3); 15% ≤ x < 20% → 14 (F2); 20% ≤ x → 20 (F1) |
| Digitalização Altas Fixa Básica | CLIENTE DIGITALIZADO ÷ (CLIENTE POTENCIAL − DIGITALIZADO) | 0% ≤ x < 2% → 0 (F4); 2% ≤ x < 4% → 1 (F3); 4% ≤ x < 6% → 3 (F2); 6% ≤ x → 5 (F1) |
| TFP Banda Larga | FATURA PAGA ÷ (FATURA PAGA + CLIENTE SAFRA) | 0% ≤ x < 80% → 0 (F4); 80% ≤ x < 85% → 10 (F3); 85% ≤ x < 90% → 14 (F2); 90% ≤ x → 20 (F1) |
| Aceite Digital | ACEITE VÁLIDO ÷ (ACEITE VÁLIDO + ATIVAÇÃO CLIENTE) | Agosto: 20 pontos em todas as faixas. Demais meses: 0% ≤ x < 85% → 0 (F4); 85% ≤ x < 90% → 10 (F3); 90% ≤ x < 95% → 14 (F2); 95% ≤ x → 20 (F1) |

## QSC movel

| Indicador | Fórmula | Percentual → pontos (faixa) |
|---|---|---|
| Early Churn Móvel | BAIXAS PREMATURAS ÷ ALTAS SAFRA M-9 | 0% ≤ x < 10% → 30 (F1); 10% ≤ x < 15% → 23 (F2); 15% ≤ x < 20% → 18 (F3); 20% ≤ x → 0 (F4) |
| Saldo de Portabilidade / Altas | SALDO DE PORTABILIDADE ÷ ALTAS | -100000% ≤ x < 0% → -10 (F4); 0% ≤ x < 25% → 0 (F3); 25% ≤ x < 50% → 14 (F2); 50% ≤ x → 20 (F1) |
| Totalização Altas Móvel | CLIENTE TOTALIZADO ÷ (TOTALIZADO + POTENCIAL) | 0% ≤ x < 25% → 0 (F4); 25% ≤ x < 40% → 7 (F3); 40% ≤ x < 50% → 10 (F2); 50% ≤ x → 15 (F1) |
| Digitalização Altas Móvel | ALTA DIGITALIZADA ÷ (CLIENTE POTENCIAL − DIGITALIZADO) | 0% ≤ x < 4% → 0 (F4); 4% ≤ x < 6% → 7 (F3); 6% ≤ x < 8% → 10 (F2); 8% ≤ x → 15 (F1) |
| TFP Móvel | FATURA PAGA ÷ (FATURA PAGA + CLIENTE SAFRA) | 0% ≤ x < 80% → 0 (F4); 80% ≤ x < 85% → 10 (F3); 85% ≤ x < 90% → 14 (F2); 90% ≤ x → 20 (F1) |

## Nota por QSC e pontuação final

Cada domínio soma os pontos dos seus indicadores no mês; o máximo é 100 por domínio. Pontos nulos são ignorados pela interface, inclusive em somas parciais. Se todos forem nulos, a nota fica indisponível.

| Nota | Faixa final | Pontos finais |
|---|---|---|
| ≥ 90 | 5 | 1000 |
| ≥ 80 e < 90 | 4 | 800 |
| ≥ 70 e < 80 | 3 | 600 |
| ≥ 60 e < 70 | 2 | 400 |
| ≥ 50 e < 60 | 1 | 200 |
| < 50 | Sem faixa | 0 |

No histórico semestral, somar pontos dos indicadores por mês e domínio, calcular a média dos meses com nota disponível e arredondar com Math.round. Aplicar a tabela acima a essa média arredondada. Meses ausentes não entram no divisor. Semestres: janeiro–junho e julho–dezembro.

## Particularidades preservadas

- Qualidade Aceite: regra atualizada no projeto Analise Carteira em 11/09/2026. Na competência de agosto, F1, F2, F3 e F4 valem 20 pontos. Nas demais competências, F4 = 0, F3 = 10, F2 = 14 e F1 = 20 pontos, com limites de 85%, 90% e 95%. Sem percentual calculável, continua sem pontos.
- Arquivos cujo nome identifica primeiro semestre (JAN–JUN/H1) consideram somente janeiro a junho. Arquivos identificados como segundo semestre (JUL–DEZ/H2) consideram somente julho a dezembro. Sem indicação no nome, todas as competências válidas são aceitas.
- Saldo de Portabilidade negativo dá −10 pontos na faixa implementada de −100000% a menos de 0%.
- As faixas de cada indicador e as faixas finais do QSC têm numerações diferentes: F1 costuma ser a melhor faixa do indicador; faixa final 5 é a melhor nota consolidada.
- A tabela Evolução de portabilidade usa Saldo QSC = numerador, Altas = denominador e % QSC = sua divisão. O acumulado soma ambos antes de dividir.
- Não foram importadas bases de clientes nem resultados reais. Este documento transfere a metodologia encontrada.

## Processamento dos CSVs

O mapeamento completo de colunas, seletores, agregações e execução está em [CALCULO_QSC_CSV.md](CALCULO_QSC_CSV.md).

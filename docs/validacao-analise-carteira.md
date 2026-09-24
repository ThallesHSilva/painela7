# Validação dos cálculos contra o projeto Analise Carteira

Validação executada em 12/09/2026 com as três bases reais da A7CONNECT e com a versão atual do processador do projeto `vista-park-now`, usada no histórico do projeto **Analise Carteira**.

## Alterações sincronizadas

- **Qualidade Aceite:** em agosto, todas as faixas calculáveis valem 20 pontos; nos demais meses, as faixas valem 0, 10, 14 e 20 pontos nos limites de 85%, 90% e 95%.
- **Parque Biometrado:** 0 ponto abaixo de 40%; 5 pontos de 40% a menos de 50%; 7 pontos de 50% a menos de 60%; 10 pontos a partir de 60%.
- **Early Churn Banda Larga:** `BAIXAS PREMATURAS ÷ (BAIXAS PREMATURAS + ALTAS SAFRA M-9)`.
- **Parque Fidelizado Móvel:** numerador restrito ao subindicador `Fidelizacao Movel` e denominador restrito a `Churn/Fidelizacao Movel`.
- **Semestre:** arquivos identificados como julho a dezembro consideram somente competências do segundo semestre; arquivos de janeiro a junho consideram somente o primeiro semestre.

## Resultado da comparação

Os 19 indicadores das competências 2026-07 e 2026-08 coincidiram integralmente nos dois processadores: KPI 1, KPI 2, resultado percentual e pontuação. Foram comparados 38 resultados, sem divergências.

Para 2026-08, os valores validados são:

| Indicador | KPI 1 | KPI 2 calculado | Resultado | Pontos |
|---|---:|---:|---:|---:|
| Churn Móvel | 128 | 73.030 | 0,1753% | 10 |
| Parque Fidelizado Móvel | 56.050 | 73.030 | 76,7493% | 10 |
| Churn Banda Larga | 83 | 14.557 | 0,5702% | 20 |
| Invasão de Carteira | 12 | 298 | 4,0268% | 25 |
| Contas a Receber (CAR) | 5.220 | 27.450 | 19,0164% | 7 |
| Parque com Débito Automático | 3.766 | 26.307 | 14,3156% | 0 |
| Parque Biometrado | 14.734 | 27.933 | 52,7476% | 7 |
| Aproveitamento de Carteira | 40 | 7.640 | 0,5236% | 0 |
| Re-Alta | 2 | 66 | 3,0303% | 7 |
| Early Churn Banda Larga | 9 | 132 | 6,8182% | 20 |
| Totalização Altas Fixa Básica | 17 | 65 | 26,1538% | 20 |
| Digitalização Altas Fixa Básica | 1 | 63 | 1,5873% | 0 |
| TFP Banda Larga | 99 | 124 | 79,8387% | 0 |
| Aceite Digital | 44 | 55 | 80,0000% | 20 |
| Early Churn Móvel | 89 | 948 | 9,3882% | 30 |
| Saldo de Portabilidade / Altas | 202 | 396 | 51,0101% | 20 |
| Totalização Altas Móvel | 27 | 31 | 87,0968% | 15 |
| Digitalização Altas Móvel | 34 | 128 | 26,5625% | 15 |
| TFP Móvel | 412 | 463 | 88,9849% | 14 |

## Notas QSC validadas

| Competência | Carteira | Fixa | Móvel |
|---|---:|---:|---:|
| 2026-07 | 79 | 78 | 77 |
| 2026-08 | 79 | 67 | 94 |

O processamento real gerado neste projeto é `12c464d4-e4ea-431a-adc5-be27abc8e9c1`, com a identificação do parceiro feita por `GRUPO_REDE_TERMO` e a identificação dos clientes por `DOCUMENTO_CLIENTE`.

# Como calcular o QSC a partir dos CSVs

Método recuperado de referencias/process-qsc.mjs e referencias/qsc-metrics.mjs, copiados do projeto Analise Carteira em 07/09/2026. As pontuações estão em CONTEXTO_QSC.md. Este mapeamento descreve o processamento implementado; não houve apuração de bases reais nesta tarefa.

## Entrada e colunas

Na importação pela biblioteca, o domínio é identificado automaticamente pelo nome do arquivo ou pelos valores de `INDICADOR`. O servidor confirma a identificação antes de substituir o slot correspondente e lê CSV separado por ponto e vírgula ou vírgula, com aspas, quebras de linha em campos e aspas duplicadas. Detecta UTF-8 em uma amostra inicial; se falhar, usa Windows-1252.

| Coluna | Uso |
|---|---|
| INDICADOR | Obrigatória; participa do agrupamento inicial, mas não é um filtro adicional nas fórmulas. |
| SUB INDICADOR | Obrigatória; seleciona a população de cada indicador, conforme tabela abaixo. |
| COMPETENCIA | Obrigatória; comparação literal após remover espaços das extremidades. Esperado YYYY-MM para ordenação e interface. Não há conversão de datas no processador. |
| GRUPO REDE TERMO | Obrigatória; nome usado para identificar o parceiro. |
| TIPO MOVIMENTO | Obrigatória; seleciona numeradores e denominadores. |
| QUANTIDADE | Obrigatória; somada na maioria dos indicadores. |
| DETALHE TIPO MOVIMENTO | Lida quando presente; necessária para descontar REABILITACAO no Churn Móvel. |
| CNPJ PARCEIRO | Opcional; armazenado no cadastro do parceiro. Não é chave de deduplicação de clientes. |
| OBSERVACAO | Opcional; fallback de quantidade em débito automático. |

Cabeçalhos são normalizados para maiúsculas, sem acentos e com pontuação substituída por espaços. Assim SUB_INDICADOR é aceito como SUB INDICADOR. Valores numéricos com vírgula têm pontos removidos e vírgula convertida para ponto: 1.234,56 vira 1234.56. Vazio ou inválido vira zero. Sem vírgula, o ponto é decimal.

## Seleção e agregação

1. Separar domínio, competência e parceiro. Para todos os parceiros, remover apenas o filtro de parceiro.
2. Aplicar os filtros de SUB INDICADOR e TIPO MOVIMENTO descritos abaixo.
3. Somar QUANTIDADE nos registros selecionados; no Débito Automático, contar registros.
4. Formar N e D; calcular N / D somente quando D > 0 e houver registro de N ou D. O resultado percentual é 100 × N / D.
5. Aplicar as faixas de pontos de CONTEXTO_QSC.md ao percentual sem arredondamento prévio.

Nos valores dos seletores, ignoram-se acentos, caixa e pontuação (o símbolo % é preservado). SUB INDICADOR deve coincidir integralmente após normalização. TIPO MOVIMENTO e DETALHE TIPO MOVIMENTO aceitam coincidência integral ou sufixo separado por espaço; por exemplo, um prefixo numérico antes de CHURN é aceito. Não usar uma busca genérica por trecho.

A acumulação inicial agrupa domínio + INDICADOR + SUB INDICADOR + competência + parceiro + movimento normalizado, guardando soma de QUANTIDADE e número de linhas. Os detalhes acrescentam DETALHE TIPO MOVIMENTO à chave. Não há deduplicação de linhas ou contagem distinta de CNPJs. Na biblioteca, cada arquivo ocupa o slot parceiro + domínio + ano + semestre; um reenvio do mesmo slot substitui sua versão anterior, enquanto os demais slots permanecem armazenados.

## Mapeamento dos 19 indicadores

Em cada linha abaixo, A é a medida do seletor do numerador e B é a medida do seletor do denominador. “Qualquer” significa que o código não restringe SUB INDICADOR nesse seletor. Sempre aplicar o domínio e a competência, mesmo quando não houver filtro de subindicador.

### carteira

| Indicador | Seletor A | Seletor B | Medida e cálculo |
|---|---|---|---|
| Churn Móvel | TIPO MOVIMENTO = CHURN; SUB INDICADOR = Churn Movel | TIPO MOVIMENTO = PARQUE MOVEL; SUB INDICADOR = qualquer | Somar QUANTIDADE; N = A − soma QUANTIDADE de DETALHE TIPO MOVIMENTO = REABILITACAO, SUB INDICADOR = Churn Movel (sem filtro adicional de TIPO MOVIMENTO); D = B |
| Parque Fidelizado Móvel | TIPO MOVIMENTO = PARQUE FIDELIZADO M17; SUB INDICADOR = qualquer | TIPO MOVIMENTO = PARQUE MOVEL; SUB INDICADOR = qualquer | Somar QUANTIDADE; N = A; D = B |
| Churn Banda Larga | TIPO MOVIMENTO = CHURN; SUB INDICADOR = % Churn Banda Larga | TIPO MOVIMENTO = PARQUE BL; SUB INDICADOR = % Churn Banda Larga | Somar QUANTIDADE; N = A; D = B |
| Invasão de Carteira | TIPO MOVIMENTO = CLIENTE INVADIDO; SUB INDICADOR = % Invasao de Carteira | TIPO MOVIMENTO = ALTA CARTEIRA; SUB INDICADOR = % Invasao de Carteira | Somar QUANTIDADE; N = A; D = B |
| Contas a Receber (CAR) | TIPO MOVIMENTO = CLIENTE COM CAR ACIMA DE 30 DIAS; SUB INDICADOR = % Documentos com CAR | TIPO MOVIMENTO = CNPJ; SUB INDICADOR = % Documentos com CAR | Somar QUANTIDADE; N = A; D = B |
| Parque com Débito Automático | TIPO MOVIMENTO = SIM; SUB INDICADOR = Parque com Debito Automatico | TIPO MOVIMENTO = NAO; SUB INDICADOR = Parque com Debito Automatico | Contar linhas; N = A; D = B + N |
| Parque Biometrado | TIPO MOVIMENTO = CLIENTE BIOMETRADO; SUB INDICADOR = Parque Biometrado | TIPO MOVIMENTO = CLIENTE POTENCIAL; SUB INDICADOR = Parque Biometrado | Somar QUANTIDADE; N = A; D = B + N |
| Aproveitamento de Carteira | TIPO MOVIMENTO = ALTA DO POTENCIAL; SUB INDICADOR = Aproveitamento Carteira | TIPO MOVIMENTO = QUANTIDADE POTENCIAL; SUB INDICADOR = Aproveitamento Carteira | Somar QUANTIDADE; N = A; D = B |

### fixa

| Indicador | Seletor A | Seletor B | Medida e cálculo |
|---|---|---|---|
| Re-Alta | TIPO MOVIMENTO = RE-ALTA; SUB INDICADOR = Re-alta | TIPO MOVIMENTO = ALTAS; SUB INDICADOR = Re-alta | Somar QUANTIDADE; N = A; D = B |
| Early Churn Banda Larga | TIPO MOVIMENTO = BAIXAS PREMATURAS; SUB INDICADOR = Early Churn Fixa | TIPO MOVIMENTO = ALTAS SAFRA M-9; SUB INDICADOR = Early Churn Fixa | Somar QUANTIDADE; N = A; D = B + N |
| Totalização Altas Fixa Básica | TIPO MOVIMENTO = CLIENTE TOTALIZADO; SUB INDICADOR = Totalizacao Altas Fixa Basica | TIPO MOVIMENTO = CLIENTE POTENCIAL; SUB INDICADOR = Totalizacao Altas Fixa Basica | Somar QUANTIDADE; N = A; D = B + N |
| Digitalização Altas Fixa Básica | TIPO MOVIMENTO = CLIENTE DIGITALIZADO; SUB INDICADOR = Digitalizacao Altas (Fixa Basica + Servicos Digitais) | TIPO MOVIMENTO = CLIENTE POTENCIAL; SUB INDICADOR = Digitalizacao Altas (Fixa Basica + Servicos Digitais) | Somar QUANTIDADE; N = A; D = máximo(0, B − N) |
| TFP Banda Larga | TIPO MOVIMENTO = CLIENTE COM FATURA PAGA; SUB INDICADOR = TFP | TIPO MOVIMENTO = CLIENTE SAFRA; SUB INDICADOR = TFP | Somar QUANTIDADE; N = A; D = B + N |
| Aceite Digital | TIPO MOVIMENTO = ACEITE VALIDO; SUB INDICADOR = Qualidade Aceite | TIPO MOVIMENTO = ATIVACAO CLIENTE; SUB INDICADOR = Qualidade Aceite | Somar QUANTIDADE; N = A; D = B + N |

### movel

| Indicador | Seletor A | Seletor B | Medida e cálculo |
|---|---|---|---|
| Early Churn Móvel | TIPO MOVIMENTO = BAIXAS PREMATURAS; SUB INDICADOR = Early Churn Movel | TIPO MOVIMENTO = ALTAS SAFRA M-9; SUB INDICADOR = Early Churn Movel | Somar QUANTIDADE; N = A; D = B |
| Saldo de Portabilidade / Altas | TIPO MOVIMENTO = SALDO DE PORTABILIDADE; SUB INDICADOR = Saldo de Portabilidade/Altas | TIPO MOVIMENTO = ALTAS; SUB INDICADOR = Saldo de Portabilidade/Altas | Somar QUANTIDADE; N = A; D = B |
| Totalização Altas Móvel | TIPO MOVIMENTO = CLIENTE TOTALIZADO; SUB INDICADOR = % Totalizacao Altas Movel | TIPO MOVIMENTO = CLIENTE POTENCIAL; SUB INDICADOR = % Totalizacao Altas Movel | Somar QUANTIDADE; N = A; D = B + N |
| Digitalização Altas Móvel | TIPO MOVIMENTO = ALTA DIGITALIZADA; SUB INDICADOR = % Digitalizacao Altas (Movel + Servicos Digitais) | TIPO MOVIMENTO = CLIENTE POTENCIAL; SUB INDICADOR = % Digitalizacao Altas (Movel + Servicos Digitais) | Somar QUANTIDADE; N = A; D = máximo(0, B − N) |
| TFP Móvel | TIPO MOVIMENTO = CLIENTE COM FATURA PAGA; SUB INDICADOR = TFP | TIPO MOVIMENTO = CLIENTE SAFRA; SUB INDICADOR = TFP | Somar QUANTIDADE; N = A; D = B + N |

## Particularidades da base

- O parque médio móvel não é reconstruído a partir de meses anteriores: usa a QUANTIDADE do movimento PARQUE MOVEL na competência.
- As janelas Re-Alta de 270 dias, Early Churn M6/M9 e pagamento das primeiras três faturas vêm pré-classificadas nos movimentos do CSV. O processador não calcula essas condições a partir de datas ou faturas individuais.
- Débito automático: se QUANTIDADE for zero/vazia/inválida, a ingestão tenta extrair “Quantidade contas em DAUTO: ...” de OBSERVACAO. Entretanto, o indicador usa a contagem de linhas SIM e NÃO; essa quantidade extraída não muda seu percentual.
- Nos indicadores de totalização, biometria, TFP e aceite, o denominador soma A a B. Na digitalização, subtrai A de B. São operações diferentes e devem ser preservadas.
- No Early Churn Banda Larga, o denominador também soma as BAIXAS PREMATURAS às ALTAS SAFRA M-9.
- O Parque Fidelizado Móvel restringe o KPI 1 ao subindicador `Fidelizacao Movel` e o KPI 2 ao subindicador `Churn/Fidelizacao Movel`.
- O nome do arquivo define o semestre quando contém JAN–JUN/H1 ou JUL–DEZ/H2; linhas fora do semestre identificado não entram no cálculo.
- Denominador não positivo gera percentual e pontos nulos. N = 0 e D > 0 gera 0% e recebe a pontuação correspondente. N = D = 0 com registros recebe a marca zeroPark.
- O cadastro tenta associar parceiros ao snapshot do Mapa Parque por nome; há uma diferença de normalização entre a chave cadastrada (sem espaços) e a consulta (com espaços) que pode impedir algumas associações. O fallback é um identificador derivado do nome. Não presumir que a integração por CNPJ esteja implementada.

## Execução do processador recuperado

Na pasta deste projeto, usando Node.js:

```powershell
node referencias/process-qsc.mjs "carteira:C:/bases/QSC_CARTEIRA.csv" "fixa:C:/bases/QSC_FIXA.csv" "movel:C:/bases/QSC_MOVEL.csv"
```

Os caminhos acima são exemplos. O script aceita um ou vários arquivos e grava .data/snapshots/qsc.snapshot.json por padrão. QSC_SNAPSHOT_PATH permite definir outra saída. MAPA_PARQUE_SNAPSHOT_PATH permite indicar o cadastro de parceiros. A saída contém N, D, valor decimal, disponibilidade, pontos e faixa por indicador, competência e parceiro, além do consolidado geral. Notas mensais por domínio e média semestral são calculadas pela interface conforme CONTEXTO_QSC.md.

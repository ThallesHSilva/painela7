# Decisões de implementação

## Autoridade e regras preservadas

`CONTEXTO_QSC.md` e `CALCULO_QSC_CSV.md` são oficiais para este projeto por instrução do usuário. Não foram editados na implementação do sistema. A matemática do módulo recuperado foi preservada.

- Carteira: 8 critérios; Fixa: 6; Móvel: 5.
- Percentuais sem arredondar antes da classificação.
- Numeradores e denominadores somados no escopo da empresa e competência.
- Débito automático conta linhas, inclusive duplicadas sinalizadas.
- Aceite Digital pontua 20 em qualquer faixa calculável somente em agosto; nas demais competências usa 0, 10, 14 ou 20 pontos nos limites de 85%, 90% e 95%.
- Portabilidade negativa pode gerar -10 pontos.
- Ausência de base e denominador não positivo geram valores nulos.
- Notas mensais somam critérios disponíveis; cobertura parcial é visível.
- Semestre usa a média dos meses disponíveis, com Math.round, convertida pela tabela final.

## Lacunas e extensões de produto

| Campo ou recurso | Implementação |
|---|---|
| QSC geral | `null`; não há combinação oficial dos domínios. |
| Total de clientes | `null`; contagem de CNPJs observados é separada e pode não representar o parque. |
| Meta | Limiar da faixa de maior pontuação, explicitamente apresentado como “Melhor faixa”; não é meta contratual. Em agosto, Aceite fica nulo porque todas as faixas pontuam igualmente; nos demais meses, o limiar é 95%. |
| Peso | Pontuação máxima do indicador, sem multiplicador adicional. |
| Desvio | Valor percentual menos o limiar da melhor faixa, em pontos percentuais. Usar `meta_operador` para interpretar o limite estrito nos critérios de redução. |
| Impacto no QSC | Máximo do indicador menos pontos obtidos; não é previsão de ganho. Pode ultrapassar o máximo quando há penalidade negativa. |
| Gaps | Indicadores com diferença positiva para a pontuação máxima, ordenados por essa diferença. Não equivale a prioridade oficial de clientes. |
| CNPJs para revisão | Registros com DOCUMENTO_CLIENTE vinculados a indicadores com gap. Inclui numerador, denominador e detalhes. Não infere dano ou culpabilidade individual. |
| Necessidade e prioridade de tratativa | Confirmação manual por CNPJ + critério; `origem_classificacao` identifica a decisão do usuário. |
| Plano de IA | Sugestões para revisão; não altera valores ou critérios. Sem IA, plano determinístico rotulado. |

O usuário definiu `DOCUMENTO_CLIENTE` como coluna do cliente. CNPJ de parceiro fica separado. IDs de empresa usam CNPJ quando existe, ou hash do nome normalizado quando não existe. Isso evita a falha de associação por nome encontrada no processador original, sem modificar as fórmulas. Não ocorre junção aproximada entre nomes.

## Dados inválidos e duplicados

Duplicados são preservados e sinalizados porque o MD não autoriza exclusão. A aplicação rejeita linhas sem identificação de empresa ou competência válida para não misturar escopos. CNPJ inválido do cliente só retira a identificação individual, preservando a contribuição agregada. Quantidade inválida é zero com aviso, conforme regra oficial.

O usuário pode corrigir a base e reenviar o arquivo. O CSV original é preservado em `data/bases/`; a nova versão substitui somente o slot de parceiro, domínio, ano e semestre correspondente. Processamentos anteriores continuam disponíveis para auditoria e a biblioteca consolida seus slots sem duplicar um mesmo slot.

## Execução e uso

Interface e API locais em Node.js/Express; persistência em JSON por atualização e catálogo ativo da biblioteca. Upload via multipart em disco. O frontend identifica os arquivos, e o backend valida e calcula. Saídas do cliente são escapadas no HTML; exportação CSV neutraliza conteúdo de fórmula e XLSX usa CNPJ como texto. Mutação da biblioteca é serializada; o ponteiro ativo é salvo por arquivo temporário e renomeação. O serviço rejeita hosts/origens externos e não escuta em interfaces de rede.

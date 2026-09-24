# Contrato JSON 1.0

O resultado canônico em `data/<id>/result.json` alimenta interface, relatório e exportações. `schemas/result.mjs` valida a estrutura; `/api/schema` disponibiliza o esquema.

Campos principais: `schema_version`, `processamento_id`, `periodo_referencia`, `periodos_disponiveis`, `data_processamento`, `fontes_regras`, `regras_sha256`, `empresas`, `importacao`, `registros`.

Cada empresa possui os campos pedidos: `empresa_id`, `empresa_nome`, `resumo_qsc`, `indicadores`, `principais_gaps`, `cnpjs_para_tratativa`, `plano_acao`. Acrescenta `cnpj_empresa`, `dominios`, `historico`, `semestres` e `candidatos_revisao`.

Indicadores têm identificador, domínio, nome, fórmula, percentual (`valor`), meta de referência e operador, desvio em pontos percentuais, status, pontuação máxima (`peso`), pontos obtidos, faixa, diferença para o máximo (`impacto_no_qsc`), numerador, denominador e IDs das linhas de origem. Percentual indisponível é `null`.

`dominios` separa nota em 100, faixa final e pontos em 1000. `parcial` e contagem calculada/esperada qualificam a cobertura. `qsc_geral` e `total_clientes` são nulos pela ausência de regras oficiais.

`cnpjs_para_tratativa` contém somente casos confirmados. `candidatos_revisao` preserva todos os casos para revisão, com motivo, ação, prioridade manual, origens e data da decisão. Contagens de CNPJs usam valores distintos; um mesmo CNPJ pode ter diversos critérios e linhas.

Os registros originais possuem `partnerId`, competência, domínio, `sourceId`, `sourceName`, `line`, `id`, conteúdo original e campos normalizados. `importacao` mantém hashes, nomes das fontes e ocorrências. Erros de lote também ficam em `importacao.json`.

Na exportação JSON por empresa, `empresas` tem um único item; registros e ocorrências são filtrados para essa empresa. Revisões internas de outras competências/empresas não são incluídas. Arquivos CSV originais podem conter mais de uma empresa; o JSON referencia seu nome e hash sem incluir registros das demais.

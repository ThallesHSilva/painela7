# Validação realizada

Data: 07/09/2026. Dados exclusivamente fictícios.

## Automatizada

`npm test`: 9 testes aprovados.

- As 19 fórmulas conferidas com numerador, denominador, percentual e pontuação esperados.
- Empresa Exemplo: Carteira 57/100 (200 pontos finais), Fixa 70/100 (600 pontos finais), Móvel 45/100 (0 pontos finais).
- Separação de duas empresas e duas competências.
- Média semestral calculada sobre meses disponíveis.
- Limites de faixa, sem arredondamento prévio do percentual.
- Duplicidades, CNPJ, colunas ausentes, CSV malformado, quantidade e competência inválidas.
- Revisão por CNPJ persistida ao mudar de período e ao recarregar o resultado.
- Exportação isolada por empresa e XLSX com CNPJ textual.
- IA com resposta simulada, validação do retorno, falhas e ausência de CNPJs no payload.

`npm audit --omit=dev`: zero vulnerabilidades reportadas na versão instalada. O lockfile registra as versões verificadas.

## Navegador

Playwright: carregamento da biblioteca consolidada, importação dos três CSVs pela interface com identificação automática de tipo, parceiro, semestre e DOCUMENTO_CLIENTE, notas esperadas, troca de competência, filtros de domínio, expansão do histórico, seleção da aba de revisão, edição de motivo e ação, prioridade manual e confirmação de um CNPJ. Confirmação refletida no resumo e no PDF.

Capturas em `output/playwright/`: 1366×900, 1024×768 e 390×844. Corrigido o tamanho mínimo dos itens do grid para impedir transbordamento no celular. Tabelas e lista horizontal de empresas mantêm sua própria rolagem. Console final sem erros.

## PDF

`output/pdf/demonstracao-qsc.pdf`: seis páginas renderizadas com Poppler e conferidas visualmente. Seções obrigatórias e CNPJ confirmado verificados por extração de texto. O arquivo é identificado como relatório determinístico, sem fingir geração por IA.

## Validações que dependem do ambiente do usuário

- Apuração e reconciliação com CSVs reais.
- Chamada real da IA: requer OPENAI_API_KEY e OPENAI_MODEL configurados.
- Desempenho com o volume real de arquivos; os testes não representam benchmark de bases de produção.

# Visão unificada QSC

Implementada em 13/09/2026 a partir da página `src/routes/qsc.tsx` do repositório `ThallesHSilva/painelexecutivocon`, consultado na revisão `491102af0611754013f97702801f4598ae4a1641`.

## Estrutura da página

- Três cards iniciais: QSC Carteira, Fixa e Móvel, com nota, faixa, pontos e cobertura.
- Histórico consolidado com seleção entre primeiro e segundo semestre, seis meses, totalizador, pontos, faixa e periodicidade mensal.
- Pulso do mês: Early Churn Fixa, Early Churn Móvel, Churn Fixa, Churn Móvel e Saldo de Portabilidade.
- Resumos por domínio com KPI 1, KPI 2, resultado percentual, nota atual/máxima, faixa e gap. Expansão por indicador exibe até seis competências até o período selecionado, fórmula e acesso às evidências.
- Aba Relatório executivo com resumo das três notas e acessos ao HTML, PDF, indicadores e plano de ação. Todos os links acompanham o processamento, parceiro e competência selecionados.

O projeto mantém sua identidade púrpura e branca, o filtro de parceiro/competência e os recursos de relatório, plano de ação e revisão. A seleção de processamento foi removida: a página abre a biblioteca consolidada ativa. As cores das faixas distinguem a classificação do indicador (1 a 4) da classificação total QSC (0 a 5), como na referência.

## Processamento

O servidor calcula o histórico individual e a matriz semestral durante a apuração. O navegador formata os valores recebidos e controla filtros e expansões. Não soma notas, calcula médias ou classifica faixas.

Processamentos antigos recebem a visão expandida uma única vez ao serem abertos; a leitura seguinte usa a versão compacta salva. Revisões e planos por competência são preservados. Linhas completas de CSV não são enviadas à visão inicial, e candidatos à revisão são consultados somente quando a aba é aberta.

## Validação

- 12 testes automatizados aprovados, cobrindo cálculos, isolamento por empresa/competência, meses ausentes, atualização de processamentos antigos e preservação das revisões.
- Navegação visual verificada a 1440 × 1100 e 390 × 844, sem transbordamento horizontal da página. Tabelas largas têm rolagem própria.
- Verificados filtros de domínio, troca de semestre, expansão do histórico e aba Relatório executivo; console sem erros.
- Base A7CONNECT de julho/agosto: agosto 79/67/94 e médias semestrais 79/73/86, em Carteira/Fixa/Móvel.

As capturas da validação estão em `output/playwright/`.

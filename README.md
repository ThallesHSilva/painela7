# QSC Gestão

Sistema local para importar CSVs de múltiplas empresas, calcular os 19 indicadores QSC, revisar CNPJs e exportar JSON, PDF, CSV e XLSX.

## Iniciar

Requer Node.js 22 ou superior.

```powershell
npm ci
npx puppeteer browsers install chrome
npm start
```

Abra **http://127.0.0.1:3210**. O serviço escuta somente no computador local. Para demonstração com dados fictícios:

```powershell
npm run demo
```

Importe os três CSVs gerados em `output/demo/`. O tipo QSC, o parceiro em `GRUPO_REDE_TERMO`, o semestre e `DOCUMENTO_CLIENTE` são identificados automaticamente. Estes arquivos não contêm clientes reais.

## Regras oficiais do projeto

- [CONTEXTO_QSC.md](CONTEXTO_QSC.md): fórmulas, faixas e pontuações, consolidação mensal e semestral.
- [CALCULO_QSC_CSV.md](CALCULO_QSC_CSV.md): colunas, seletores, agregação e particularidades dos CSVs.
- [Decisões e lacunas](docs/decisoes.md): tratamento de regras não definidas, sem criar fórmulas novas.

Esses dois `.md` são a fonte oficial de negócio. `qsc/rules.mjs` contém a implementação recuperada, preservada com exportações adicionais para rastreabilidade. `referencias/` guarda as cópias originais. Alterar interface ou relatório não deve alterar o cálculo.

## Fluxo de uso

1. Clique em **Importar CSVs** e escolha um ou mais arquivos.
2. O sistema identifica automaticamente o QSC pelo nome e pelos indicadores, identifica o parceiro por **GRUPO_REDE_TERMO** e usa o semestre presente no nome do arquivo ou nas competências.
3. O CNPJ do cliente vem de **DOCUMENTO_CLIENTE**, conforme definição do usuário. **CNPJ_PARCEIRO nunca é usado como CNPJ de cliente.**
4. Escolha empresa e competência. Clique no indicador para ver movimentos e linhas originais.
5. Consulte **Gaps & plano de ação** e **Revisão de CNPJs**. Revise os casos, informe motivo, ação e prioridade e confirme os CNPJs para exportação.
6. Baixe JSON ou PDF da empresa; na aba de revisão, baixe CSV ou XLSX das tratativas confirmadas.

As bases ficam em uma biblioteca consolidada. Um arquivo novo substitui somente o parceiro, domínio, ano e semestre que ele cobre; os demais arquivos continuam disponíveis. O reenvio do mesmo arquivo não soma a base duas vezes. A troca de competência preserva os planos e as revisões feitas em cada período.

## Formato CSV

Separador `;`, UTF-8 ou Windows-1252, cabeçalho na primeira linha. Colunas obrigatórias: `INDICADOR`, `SUB_INDICADOR`, `COMPETENCIA`, `GRUPO_REDE_TERMO`, `TIPO_MOVIMENTO`, `QUANTIDADE`. Espaços e underscores dos cabeçalhos são normalizados. Competência: `YYYY-MM`.

`DETALHE_TIPO_MOVIMENTO` permite descontar reabilitações. `CNPJ_PARCEIRO`, `DOCUMENTO_CLIENTE`, `RAZAO_SOCIAL` e `OBSERVACAO` complementam identificação e rastreabilidade. Janelas de safra e critérios temporais já devem vir classificados nos movimentos, conforme o MD.

Vazios ou quantidades inválidas viram zero com aviso, como determina o processamento oficial. CSV estruturalmente inválido ou sem colunas obrigatórias é rejeitado. Linhas sem empresa, com competência inválida ou CNPJ de empresa malformado são rejeitadas e registradas. Um CNPJ de cliente inválido não elimina a linha do cálculo, mas impede sua identificação para revisão.

CNPJs são mantidos como texto de 14 dígitos, com zeros à esquerda. A validação é de formato, não de dígitos verificadores. Ausência de CNPJ do cliente não impede o cálculo agregado. O total de CNPJs identificados não equivale necessariamente ao parque de clientes.

## Plano de ação com IA

### Visualização premium em HTML

O botão **Visualizar relatório** abre o relatório editorial da empresa e competência selecionadas. Inclui capa, visão executiva, indicadores, gaps, diagnóstico, plano de ação, tratativas confirmadas e metodologia. A visualização é gerada por `reports/html.mjs`, com estilos em `reports/report.css`.

O botão PDF renderiza o mesmo HTML e CSS da página com Chromium, preservando fontes, cores, capa, cartões e gráficos, com paginação A4. A geração ocorre localmente e requer o navegador instalado pelo comando acima. O HTML é independente, sem fontes, scripts ou imagens externos. Use **Ctrl + P** para imprimir ou salvar como PDF pelo navegador, em A4. A versão HTML pode ser baixada acrescentando `?download=1` ao endereço da visualização. Exemplo fictício em `output/html/relatorio-qsc-premium.html`.

Os textos do plano têm a mesma origem indicada no JSON: determinísticos ou sugestões de IA. A criação do visual não altera cálculos, prioridades ou conclusões.

Copie `.env.example` para `.env`, configure `OPENAI_API_KEY` e `OPENAI_MODEL` com um modelo da sua conta que aceite Responses API e Structured Outputs e reinicie o servidor. Não coloque a chave no navegador ou no Git.

O botão **Gerar plano com IA** envia somente indicadores agregados da empresa selecionada, sem CNPJs, nomes de clientes ou linhas de CSV. O retorno é validado por JSON Schema. A IA propõe diagnóstico e ações; não recalcula notas, não classifica automaticamente clientes e não altera as regras oficiais. O PDF identifica a origem e o modelo do plano.

Sem configuração de IA, o PDF continua disponível com diagnóstico determinístico identificado como tal. Falhas de API não são disfarçadas como geração de IA. A integração foi testada com respostas simuladas; uma chamada real depende de credencial e modelo configurados.

Referência da implementação: [Structured Outputs na documentação oficial da OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs).

## Persistência e rastreabilidade

Cada atualização recebe um UUID em `data/<id>/`; `data/library.json` aponta para a versão ativa e `data/bases/` guarda as cópias originais por hash:

- `originais/f1.csv`, `f2.csv` etc.: bytes originais, nunca sobrescritos.
- `importacao.json`: fontes, hashes e ocorrências, inclusive para lotes rejeitados.
- `result.json`: JSON padrão, linhas originais, cálculos, revisões e planos por período.

O JSON inclui hashes SHA-256 das bases e dos arquivos oficiais de regras. IDs no formato `f1:23` identificam o arquivo e a linha final do registro CSV; um campo com quebra de linha pode ocupar mais de uma linha física. Numerador, denominador e os IDs de todas as linhas envolvidas ficam em cada indicador.

`data/` fica fora do Git. Faça backup da pasta para preservar o histórico. Os arquivos não são criptografados pelo aplicativo; ele usa as permissões locais do sistema. Esta versão é local e de usuário único, sem login ou acesso multiusuário. Uma publicação em rede exige autenticação e autorização por empresa.

## Estrutura

```text
ingestion/    leitura, validação, normalização e rastreabilidade
qsc/          fórmulas oficiais, consolidação e identificação de gaps
schemas/      validação do JSON padrão e plano de IA
reports/      PDF executivo e integração Responses API
exports/      CSV e XLSX de tratativas confirmadas
frontend/     interface responsiva, sem dependências externas
tests/        cálculos e integração HTTP
docs/         decisões, contrato e limitações
scripts/      geração de demonstração
server.mjs    API e persistência local
```

O JSON preserva a estrutura solicitada, acrescentando `dominios`, `historico`, `semestres`, `candidatos_revisao`, fontes e rastreabilidade. Campos de negócio não definidos são `null`, nunca zero inventado. Consulte [o contrato](docs/contrato-json.md) e `/api/schema`.

## Testes

```powershell
npm test
npm audit
```

Cobertura: as 19 fórmulas com exemplos conhecidos, limites de pontuação, reabilitação, débito automático por contagem, denominação zero, digitalização, duplicidades, CNPJ, empresas e períodos separados, revisão persistente, exportações e IA simulada. A interface e o PDF também foram verificados visualmente com dados fictícios.

## Limitações explícitas

- Não existe fórmula documentada para combinar os três QSCs em um QSC geral. Esse campo fica nulo; a tela exibe os três domínios.
- Não existe regra oficial de necessidade ou prioridade individual por CNPJ. O sistema lista evidências de indicadores com gap para revisão humana, incluindo registros de denominador. Apenas casos confirmados entram nas bases de tratativa.
- Os PDFs incluem todos os casos confirmados; bases extensas podem gerar relatórios longos.
- Importação em disco: até 20 CSVs de 500 MB cada. A identificação usa uma amostra; os cálculos usam o arquivo completo. O tempo depende de registros, empresas e competências.
- A comprovação com CSVs reais depende de importar as bases do usuário. A demonstração e os testes usam dados fictícios.


import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingest, cnpj } from '../ingestion/csv.mjs';
import { calculate, rating } from '../qsc/calculate.mjs';
import { assertResult } from '../schemas/result.mjs';
import { csv, row, demoFiles } from './fixtures.mjs';
import { toCsv, toXlsx, exportRows } from '../exports/treatments.mjs';
import ExcelJS from 'exceljs';

test('19 fórmulas: valores, pontos, numeradores e denominadores esperados', () => {
  const r = assertResult(calculate(ingest(demoFiles())));
  const e = r.empresas.find(e => e.empresa_nome === 'Empresa Exemplo');
  const expected = {
    'churn-movel': [1, 100, 1, 7], 'fidelizacao-movel': [82, 100, 82, 14], 'churn-bl': [2, 100, 2, 0],
    'invasao-carteira': [12, 100, 12, 20], car: [21, 100, 21, 5], 'debito-automatico': [1, 2, 50, 5],
    biometria: [50, 100, 50, 7], 'aproveitamento-carteira': [6, 100, 6, 1],
    're-alta-fixa': [3, 100, 3, 7], 'early-churn-fixa': [11, 111, 11 / 111 * 100, 20], 'totalizacao-fixa': [15, 100, 15, 14],
    'digitalizacao-fixa': [6, 100, 6, 5], 'tfp-fixa': [82, 100, 82, 10], 'aceite-digital': [10, 100, 10, 0],
    'early-churn-movel': [16, 100, 16, 18], 'saldo-portabilidade': [-5, 100, -5, -10], 'totalizacao-movel': [30, 100, 30, 7],
    'digitalizacao-movel': [6, 100, 6, 10], 'tfp-movel': [90, 100, 90, 20],
  };
  assert.equal(e.indicadores.length, 19);
  for (const i of e.indicadores) assert.deepEqual([i.numerador, i.denominador, i.valor, i.pontos], expected[i.id], i.id);
  assert.deepEqual(e.dominios.map(d => [d.nota, d.pontos]), [[59, 200], [56, 200], [45, 0]]);
  assert.equal(e.resumo_qsc.qsc_geral, null);
  assert.equal(e.cnpjs_para_tratativa.length, 0);
  assert(e.candidatos_revisao.length > 0);
  assert(e.candidatos_revisao.every(c => c.prioridade === 'Não definida' && !c.confirmado));
});

test('empresas e competências não se misturam; histórico semestral usa meses disponíveis', () => {
  const r = calculate(ingest(demoFiles()));
  const e = r.empresas.find(e => e.empresa_nome === 'Segunda Empresa');
  assert.equal(e.indicadores.find(i => i.id === 'churn-movel').valor, 0);
  assert.equal(e.dominios[0].nota, 10); // fidelização disponível com parque, mas sem fidelizados = 0 pontos
  assert.equal(e.resumo_qsc.total_cnpjs_analisados, 1);
  assert(e.candidatos_revisao.every(c => c.cnpj === '98765432000111'));
  const first = r.empresas.find(e => e.empresa_nome === 'Empresa Exemplo');
  const h = first.semestres[1].dominios[0];
  assert.equal(h.meses_disponiveis, 2); assert.equal(h.nota, 35); // Math.round((59+10)/2)
});

test('visão unificada preserva competência, histórico por indicador e meses sem dados', () => {
  const input = ingest(demoFiles());
  const current = calculate(input).empresas.find(e => e.empresa_nome === 'Empresa Exemplo');
  const churn = current.indicadores.find(i => i.id === 'churn-movel');
  assert.deepEqual(churn.historico.map(h => [h.competencia, h.valor, h.pontos]), [['2026-08', .5, 10], ['2026-09', 1, 7]]);
  const second = current.painel_semestral[1].dominios[0];
  assert.deepEqual(second.meses.map(m => m.nota), [null, 10, 59, null, null, null]);
  assert.equal(second.nota, 35);
  assert.equal(second.meses_disponiveis, 2);
  assert(current.painel_semestral[0].dominios.every(d => d.nota === null && d.meses.every(m => m.nota === null)));
  const august = calculate(input, '2026-08').empresas.find(e => e.empresa_nome === 'Empresa Exemplo');
  assert(august.indicadores.every(i => i.historico.every(h => h.competencia <= '2026-08')));
  assert.equal(current.indicadores.find(i => i.id === 'tfp-fixa').historico[0].valor, null);
});

test('limites das faixas, percentuais sem arredondamento e pontuação final', () => {
  for (const [value, points] of [[0, 0], [84.999, 0], [85, 10], [89.999, 10], [90, 14], [94.999, 14], [95, 20], [100, 20]]) {
    const r = calculate(ingest([{ name: 'aceite.csv', domain: 'fixa', buffer: csv([row('Qualidade Aceite', 'ACEITE VALIDO', value), row('Qualidade Aceite', 'ATIVACAO CLIENTE', 100 - value)]) }]));
    assert.equal(r.empresas[0].indicadores.find(i => i.id === 'aceite-digital').pontos, points, `Aceite ${value}%`);
  }
  for (const value of [0, 84.999, 85, 90, 95, 100]) {
    const r = calculate(ingest([{ name: 'aceite.csv', domain: 'fixa', buffer: csv([row('Qualidade Aceite', 'ACEITE VALIDO', value, { period: '2026-08' }), row('Qualidade Aceite', 'ATIVACAO CLIENTE', 100 - value, { period: '2026-08' })]) }]));
    assert.equal(r.empresas[0].indicadores.find(i => i.id === 'aceite-digital').pontos, 20, `Aceite agosto ${value}%`);
  }
  for (const [value, expected] of [[.7999, 10], [.8, 7], [1.1, 5], [1.4, 0]]) {
    const r = calculate(ingest([{ name: 'x.csv', domain: 'carteira', buffer: csv([row('Churn Movel', 'CHURN', value), row('parque', 'PARQUE MOVEL', 100)]) }]));
    assert.equal(r.empresas[0].indicadores.find(i => i.id === 'churn-movel').pontos, expected);
  }
  for (const [note, pts] of [[49.99, 0], [50, 200], [60, 400], [70, 600], [80, 800], [90, 1000]]) assert.equal(rating(note).pontos, pts);
  assert.equal(rating(null).pontos, null);
});

test('denominador zero e digitalização com potencial menor que altas não geram infinito', () => {
  const input = ingest([{ name: 'x.csv', domain: 'movel', buffer: csv([row('% Digitalizacao Altas (Movel + Servicos Digitais)', 'ALTA DIGITALIZADA', 10), row('% Digitalizacao Altas (Movel + Servicos Digitais)', 'CLIENTE POTENCIAL', 5)]) }]);
  const e = calculate(input).empresas[0];
  const m = e.indicadores.find(i => i.id === 'digitalizacao-movel');
  assert.equal(m.denominador, 0); assert.equal(m.valor, null); assert.equal(m.pontos, null);
  assert.equal(e.indicadores.find(i => i.id === 'tfp-movel').disponivel, false);
});

test('duplicidades preservadas, linhas inválidas registradas, CNPJ normalizado', () => {
  const r = row('% Documentos com CAR', 'CNPJ', '1.234,56', { client: '12.345.678/0001-01' });
  const input = ingest([{ name: 'x.csv', domain: 'carteira', buffer: csv([r, r, row('a', 'b', 1, { period: '09/2026' })]) }]);
  assert.equal(input.records.length, 2); assert.equal(input.records[0].quantity, 1234.56);
  assert.equal(input.records[0].clientCnpj, '12345678000101'); assert.equal(input.records[0].original.DOCUMENTO_CLIENTE, '12.345.678/0001-01');
  assert.equal(input.issues.filter(i => i.tipo === 'duplicidade').length, 1); assert.equal(input.sources[0].registros_rejeitados, 1);
  assert.equal(cnpj('123'), '00000000000123'); assert.equal(cnpj('1e13'), null);
});

test('colunas ausentes, CSV quebrado e CNPJ parceiro como cliente são rejeitados', () => {
  assert.equal(ingest([{ name: 'x.csv', domain: 'carteira', buffer: Buffer.from('a;b\n1;2') }]).records.length, 0);
  assert.equal(ingest([{ name: 'x.csv', domain: 'carteira', buffer: Buffer.from('"unterminated') }]).records.length, 0);
  const files = demoFiles(); files[0].clientColumn = 'CNPJ_PARCEIRO';
  assert.equal(ingest(files.slice(0, 1)).records.length, 0);
});

test('arquivos semestrais consideram somente competências do semestre indicado no nome', () => {
  const input = ingest([{ name: 'QSC_CARTEIRA_PREVIA_JUL_DEZ_2026.csv', domain: 'carteira', buffer: csv([
    row('% Documentos com CAR', 'CNPJ', 10, { period: '2026-06' }),
    row('% Documentos com CAR', 'CNPJ', 20, { period: '2026-07' }),
  ]) }]);
  assert.deepEqual(input.records.map(r => r.competence), ['2026-07']);
  assert.equal(input.sources[0].semestre, 'h2');
});

test('exportações protegem fórmulas, preservam CNPJ como texto e só exportam confirmados', async () => {
  const r = calculate(ingest(demoFiles())); const e = r.empresas[0];
  assert.equal(exportRows(r, e).length, 0);
  const c = e.candidatos_revisao[0]; e.cnpjs_para_tratativa = [{ ...c, confirmado: true, acao_recomendada: '=HYPERLINK("bad")' }];
  const rows = exportRows(r, e); assert(rows.length > 0); assert(rows.every(r => r.empresa === e.empresa_nome));
  assert(toCsv(rows).includes("'=HYPERLINK"));
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await toXlsx(rows));
  assert.equal(book.worksheets[0].getCell('B2').value, c.cnpj); assert.equal(book.worksheets[0].getCell('B2').type, ExcelJS.ValueType.String);
});

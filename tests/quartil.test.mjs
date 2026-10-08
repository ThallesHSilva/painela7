import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { alertFor, quartilComparisons, quartileFor, rankQuartilConsultants } from '../frontend/quartil-rules.js';
import { parseQuartilWorkbook } from '../ingestion/quartil.mjs';

test('aplica as faixas da planilha sem sobreposição', () => {
  assert.equal(quartileFor('experienced', 'receita', 2250), 2);
  assert.equal(quartileFor('experienced', 'receita', 2250.01), 1);
  assert.equal(quartileFor('experienced', 'movel', 5), 5);
  assert.equal(quartileFor('experienced', 'ftth', 0), 5);
  assert.equal(quartileFor('new', 'receita', 0), 5);
  assert.equal(quartileFor('new', 'receita', 100), 4);
  assert.equal(quartileFor('new', 'movel', 15), 2);
  assert.equal(quartileFor('new', 'ftth', 2), 4);
});

test('alerta somente quando o consultor permanece mais de três meses no Q5', () => {
  const point = (quartiles) => ({ quartiles, values: {} });
  const consultant = { tenure: 'experienced', history: [
    point({ receita: 5, movel: 3, ftth: 2 }),
    point({ receita: 5, movel: 3, ftth: 2 }),
    point({ receita: 5, movel: 3, ftth: 2 }),
    point({ receita: 5, movel: 3, ftth: 2 }),
  ] };
  assert.deepEqual(alertFor(consultant), { active: true, months: 4, metrics: ['receita'] });
  assert.equal(alertFor({ ...consultant, history: consultant.history.slice(0, 3) }).active, false);
});

test('ranking por score e por métrica usam critérios diferentes', () => {
  const consultants = [
    { name: 'Score melhor', values: { receita: 100 }, quartiles: { receita: 2, movel: 1, ftth: 1 } },
    { name: 'Receita maior', values: { receita: 900 }, quartiles: { receita: 3, movel: 3, ftth: 3 } },
    { name: 'Sem receita', values: {}, quartiles: { receita: null, movel: 1, ftth: 1 } },
  ];
  assert.deepEqual(rankQuartilConsultants(consultants, 'score', 'receita').map(row => row.name), ['Score melhor', 'Sem receita', 'Receita maior']);
  assert.deepEqual(rankQuartilConsultants(consultants, 'metric', 'receita').map(row => row.name), ['Receita maior', 'Score melhor', 'Sem receita']);
});

test('lê planilha Excel de faixas de quartil', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Faixas');
  sheet.addRow(['Tempo de casa', 'Indicador', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5']);
  sheet.addRow(['Acima de 3 meses', 'Receita', 'Acima de R$ 3000', 'R$ 2001 a R$ 3000', 'R$ 1001 a R$ 2000', 'R$ 500 a R$ 1000', 'Abaixo de R$ 500']);
  sheet.addRow(['', 'Móvel', 'Acima de 25', '16 a 25', '11 a 15', '6 a 10', '0 a 5']);
  sheet.addRow(['', 'FTTH', 'Acima de 10', '6 a 10', '3 a 5', '1 a 2', '0']);
  sheet.addRow(['Abaixo de 3 meses', 'Receita', 'R$ 500 ou mais', 'R$ 251 a R$ 499', 'R$ 101 a R$ 250', 'Acima de 0 até R$ 100', '0']);
  sheet.addRow(['', 'Móvel', 'Acima de 15', '11 a 15', '6 a 10', 'Acima de 0 até 5', '0']);
  sheet.addRow(['', 'FTTH', 'Acima de 10', '6 a 9', '3 a 5', '2', '0']);
  const buffer = await workbook.xlsx.writeBuffer();
  const parsed = await parseQuartilWorkbook(buffer, 'faixas.xlsx');
  assert.equal(parsed.source.report, 'faixas.xlsx');
  assert.equal(parsed.rules.experienced.metrics.receita[0].min, 3000);
  assert.equal(parsed.rules.new.metrics.receita[4].max, 0);
});

test('lê planilha Excel mensal de consultores', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Ago_26');
  sheet.addRow(['Consultor', 'M de CASA', 'FISICOS MÓVEL', 'RECEITA MÓVEL', 'FISICOS FTTH', 'RECEITA FTTH', 'RECEITA TELECOM TT', 'Parceiro']);
  sheet.addRow(['Ana Souza', 'ACIMA DE M3', 10, 100, 2, 20, 500, 'A7 CONNECT']);
  sheet.addRow(['Bruno Lima', 'ABAIXO DE M3', 5, 50, 1, 10, 100, 'A7 CONNECT']);
  const buffer = await workbook.xlsx.writeBuffer();
  const parsed = await parseQuartilWorkbook(buffer, 'consultores.xlsx');
  assert.equal(parsed.kind, 'snapshot');
  assert.deepEqual(parsed.snapshot.months, ['2026-08']);
  assert.equal(parsed.snapshot.consultants.length, 2);
  assert.equal(parsed.snapshot.consultants[0].values.receita, 500);
  assert.equal(parsed.snapshot.consultants[1].tenure, 'new');
});

test('calcula evolucao contra 3 e 6 competencias anteriores', () => {
  const consultant = {
    tenure: 'experienced',
    history: [
      { month: '2026-01', quartiles: { receita: 5, movel: 3, ftth: 2 } },
      { month: '2026-02', quartiles: { receita: 4, movel: 3, ftth: 2 } },
      { month: '2026-03', quartiles: { receita: 4, movel: 2, ftth: 2 } },
      { month: '2026-04', quartiles: { receita: 3, movel: 2, ftth: 1 } },
      { month: '2026-05', quartiles: { receita: 2, movel: 2, ftth: 1 } },
      { month: '2026-06', quartiles: { receita: 1, movel: 1, ftth: 1 } },
      { month: '2026-07', quartiles: { receita: 2, movel: 1, ftth: 1 } },
    ],
  };
  const comparisons = quartilComparisons(consultant);
  assert.equal(comparisons[3].from, '2026-04');
  assert.deepEqual(comparisons[3].changes, { receita: 1, movel: 1, ftth: 0 });
  assert.equal(comparisons[6].from, '2026-01');
  assert.deepEqual(comparisons[6].changes, { receita: 3, movel: 2, ftth: 1 });
});

test('vincula o consultor ao parceiro da ultima competencia', async () => {
  const workbook = new ExcelJS.Workbook();
  const oldSheet = workbook.addWorksheet('Jul_26');
  oldSheet.addRow(['Consultor', 'M de CASA', 'FISICOS MÓVEL', 'RECEITA MÓVEL', 'FISICOS FTTH', 'RECEITA FTTH', 'RECEITA TELECOM TT', 'Parceiro']);
  oldSheet.addRow(['Ana Souza', 'ACIMA DE M3', 10, 100, 2, 20, 500, 'A7 CONNECT']);
  oldSheet.addRow(['Bruno Lima', 'ACIMA DE M3', 10, 100, 2, 20, 500, 'A7 CONNECT']);
  const currentSheet = workbook.addWorksheet('Ago_26');
  currentSheet.addRow(['Consultor', 'M de CASA', 'FISICOS MÓVEL', 'RECEITA MÓVEL', 'FISICOS FTTH', 'RECEITA FTTH', 'RECEITA TELECOM TT', 'Parceiro']);
  currentSheet.addRow(['Ana Souza', 'ACIMA DE M3', 12, 120, 3, 30, 700, 'NOVA SUIÇA']);
  const parsed = await parseQuartilWorkbook(await workbook.xlsx.writeBuffer(), 'troca-parceiro.xlsx');
  assert.equal(parsed.snapshot.consultants.length, 1);
  assert.equal(parsed.snapshot.consultants[0].partnerId, 'nova-suica');
  assert.equal(parsed.snapshot.consultants[0].partnerName, 'NOVA SUIÇA');
  assert.equal(parsed.snapshot.consultants[0].history.length, 2);
  assert.deepEqual(parsed.snapshot.partners, [{ id: 'nova-suica', name: 'NOVA SUIÇA' }]);
});

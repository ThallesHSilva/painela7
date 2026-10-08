import ExcelJS from 'exceljs';

const TENURES = ['experienced', 'new'];
const METRICS = ['receita', 'movel', 'ftth'];

const textOf = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.text !== undefined) return String(value.text);
  if (typeof value === 'object' && Array.isArray(value.richText)) return value.richText.map(item => item.text ?? '').join('');
  return String(value);
};

const normalize = value => textOf(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
const rowTexts = row => row.values.slice(1).map(textOf);
const rowText = row => rowTexts(row).join(' ').replace(/\s+/g, ' ').trim();

function tenureFor(value) {
  const text = normalize(value);
  if (/acima de 3|mais de 3|experien/.test(text)) return 'experienced';
  if (/abaixo de 3|ate 3|menos de 3|novo/.test(text)) return 'new';
  return null;
}

function metricFor(value) {
  const text = normalize(value);
  if (/ftth|fibra/.test(text)) return 'ftth';
  if (/movel|celular/.test(text)) return 'movel';
  if (/receita|faturamento/.test(text)) return 'receita';
  return null;
}

function numberFromPortuguese(value) {
  const token = String(value).replace(/\s/g, '');
  if (token.includes(',') && token.includes('.')) return Number(token.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(?:\.\d{3})+$/.test(token)) return Number(token.replace(/\./g, ''));
  return Number(token.replace(',', '.'));
}

export function parseRangeLabel(label) {
  const raw = textOf(label).replace(/\s+/g, ' ').trim();
  const text = normalize(raw);
  const values = [...text.matchAll(/\d[\d.,]*/g)].map(match => numberFromPortuguese(match[0])).filter(Number.isFinite);
  if (!values.length) throw new Error(`Faixa sem valor numérico: "${raw}".`);
  const above = /acima de|mais de|superior a|^>/.test(text);
  const below = /abaixo de|menos de|inferior a|^</.test(text);
  const until = /ate|a\s*$/.test(text) || / ate /.test(text);
  const atLeast = /ou mais|ou superior|ou maior/.test(text);
  if (values.length === 1) {
    if (above) return { label: raw, min: values[0], minExclusive: true };
    if (below) return { label: raw, max: values[0], maxExclusive: true };
    if (atLeast) return { label: raw, min: values[0] };
    if (until) return { label: raw, max: values[0] };
    return { label: raw, min: values[0], max: values[0] };
  }
  return {
    label: raw,
    min: values[0],
    max: values[1],
    ...(above ? { minExclusive: true } : {}),
    ...(below ? { maxExclusive: true } : {}),
  };
}

function quartileColumns(row) {
  return rowTexts(row).reduce((columns, value, index) => {
    const text = normalize(value).replace(/\s+/g, '');
    const match = text.match(/^(?:q|quartil)([1-5])$/);
    if (match) columns[Number(match[1])] = index + 1;
    return columns;
  }, {});
}

function headerFor(worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, 40); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const columns = quartileColumns(row);
    if (Object.keys(columns).length === 5) return { rowNumber, columns };
  }
  return null;
}

export async function parseQuartilWorkbook(buffer, filename = 'quartil.xlsx') {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); }
  catch (error) { throw new Error(`Não foi possível ler a planilha Excel: ${error.message}`); }
  const rules = Object.fromEntries(TENURES.map(tenure => [tenure, { label: tenure === 'new' ? 'Abaixo de 3 meses' : 'Acima de 3 meses', metrics: {} }]));
  let importedRows = 0;
  const sheets = [];
  for (const worksheet of workbook.worksheets) {
    const header = headerFor(worksheet);
    if (!header) continue;
    sheets.push(worksheet.name);
    let tenure;
    for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const text = rowText(row);
      if (!text) continue;
      tenure = tenureFor(text) ?? tenure;
      const metric = metricFor(text);
      if (!tenure || !metric) continue;
      const ranges = header.columns;
      const parsed = [1, 2, 3, 4, 5].map(quartile => {
        const cell = row.getCell(ranges[quartile]);
        if (!textOf(cell.value).trim()) throw new Error(`A linha ${rowNumber} da aba "${worksheet.name}" não possui Q${quartile}.`);
        return parseRangeLabel(cell.value);
      });
      rules[tenure].metrics[metric] = parsed;
      importedRows += 1;
    }
  }
  if (!sheets.length) throw new Error('Não encontrei uma tabela com as colunas Q1, Q2, Q3, Q4 e Q5.');
  const missing = TENURES.flatMap(tenure => METRICS.filter(metric => !rules[tenure].metrics[metric]).map(metric => `${rules[tenure].label} · ${metric}`));
  if (missing.length) throw new Error(`A planilha precisa conter as faixas de: ${missing.join(', ')}.`);
  return {
    rules,
    source: { report: filename, importedAt: new Date().toISOString(), sheets, rows: importedRows },
  };
}

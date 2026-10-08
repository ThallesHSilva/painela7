import ExcelJS from 'exceljs';

const TENURES = ['experienced', 'new'];
const METRICS = ['receita', 'movel', 'ftth'];

const textOf = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.result !== undefined) return textOf(value.result);
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

const MONTHS = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const monthFor = name => {
  const match = normalize(name).match(/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[_-](\d{2,4})$/);
  if (!match) return null;
  const year = Number(match[2].length === 2 ? '20' + match[2] : match[2]);
  return String(year) + '-' + String(MONTHS[match[1]]).padStart(2, '0');
};
const numberValue = value => {
  if (value && typeof value === 'object' && typeof value.result === 'number') return value.result;
  const text = textOf(value).replace(/\s/g, '');
  if (!text) return null;
  if (value && typeof value === 'object' && 'formula' in value && typeof value.result === 'string' && /^-?\d+\.\d{3}$/.test(text)) {
    return Number(text);
  }
  const numeric = typeof value === 'number' ? value : numberFromPortuguese(text.replace(/[^\d,.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
};
const keyFor = value => normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sem-parceiro';
const personKey = value => normalize(value).replace(/[^a-z0-9]/g, '') || 'sem-nome';

function consultantHeaderFor(worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, 10); rowNumber += 1) {
    const indexes = {};
    rowTexts(worksheet.getRow(rowNumber)).forEach((value, index) => {
      const text = normalize(value);
      const column = index + 1;
      if (!indexes.name && /^consultor/.test(text)) indexes.name = column;
      if (!indexes.tenure && /m de casa/.test(text)) indexes.tenure = column;
      if (!indexes.movel && /fisicos.*movel/.test(text)) indexes.movel = column;
      if (!indexes.ftth && /fisicos.*ftth/.test(text)) indexes.ftth = column;
      if (!indexes.revenue && /receita telecom|telecom tt/.test(text)) indexes.revenue = column;
      if (!indexes.partner && /praceiro|parceiro/.test(text)) indexes.partner = column;
    });
    if (indexes.name && indexes.movel && indexes.ftth && indexes.revenue) return { rowNumber, indexes };
  }
  return null;
}

function consultantSnapshot(workbook, filename) {
  const groups = new Map();
  const months = new Set();
  const sheets = [];
  for (const worksheet of workbook.worksheets) {
    const month = monthFor(worksheet.name);
    const header = month ? consultantHeaderFor(worksheet) : null;
    if (!month || !header) continue;
    sheets.push(worksheet.name);
    months.add(month);
    for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const name = textOf(row.getCell(header.indexes.name).value).trim();
      if (!name) continue;
      const partnerName = textOf(header.indexes.partner ? row.getCell(header.indexes.partner).value : '').trim() || 'Sem parceiro';
      const partnerId = keyFor(partnerName);
      const consultantKey = personKey(name);
      const tenureText = textOf(header.indexes.tenure ? row.getCell(header.indexes.tenure).value : '').trim();
      const tenure = /abaixo|ate 3|menos de 3/.test(normalize(tenureText)) ? 'new' : 'experienced';
      const point = {
        id: consultantKey, name, partnerId, partnerName, month, tenure,
        values: {
          receita: numberValue(row.getCell(header.indexes.revenue).value),
          movel: numberValue(row.getCell(header.indexes.movel).value),
          ftth: numberValue(row.getCell(header.indexes.ftth).value),
        },
      };
      if (!groups.has(consultantKey)) groups.set(consultantKey, []);
      const history = groups.get(consultantKey);
      const sameMonth = history.findIndex(item => item.month === month);
      if (sameMonth >= 0) history[sameMonth] = point;
      else history.push(point);
    }
  }
  if (!sheets.length || !groups.size) return null;
  const orderedMonths = [...months].sort();
  const latestMonth = orderedMonths.at(-1);
  const consultants = [...groups.values()].filter(history => history.some(point => point.month === latestMonth)).map(history => {
    history.sort((a, b) => a.month.localeCompare(b.month));
    const latest = history.find(point => point.month === latestMonth) ?? history.at(-1);
    return { ...latest, id: latest.partnerId + ':' + personKey(latest.name), history };
  });
  const partners = [...new Map(consultants.map(consultant => [consultant.partnerId, { id: consultant.partnerId, name: consultant.partnerName }])).values()];
  return {
    source: { report: filename, importedAt: new Date().toISOString(), sheets, rows: consultants.length },
    latestMonth,
    months: orderedMonths,
    partners,
    consultants,
    warnings: [],
  };
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
  if (!sheets.length) {
    const snapshot = consultantSnapshot(workbook, filename);
    if (snapshot) return { kind: 'snapshot', snapshot, source: snapshot.source };
  }
  if (!sheets.length) throw new Error('Não encontrei uma tabela de faixas Q1–Q5 nem abas mensais de consultores no arquivo Excel.');
  const missing = TENURES.flatMap(tenure => METRICS.filter(metric => !rules[tenure].metrics[metric]).map(metric => `${rules[tenure].label} · ${metric}`));
  if (missing.length) throw new Error(`A planilha precisa conter as faixas de: ${missing.join(', ')}.`);
  return {
    kind: 'rules',
    rules,
    source: { report: filename, importedAt: new Date().toISOString(), sheets, rows: importedRows },
  };
}

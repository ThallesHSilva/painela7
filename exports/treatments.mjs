import ExcelJS from 'exceljs';
export function exportRows(result, company) {
  const rows = new Map(result.registros.filter(r => r.partnerId === company.empresa_id).map(r => [r.id, r]));
  return company.cnpjs_para_tratativa.flatMap(c => c.registros.map(id => {
    const r = rows.get(id);
    if (!r) throw new Error('Referência de origem inválida na tratativa.');
    return { empresa: company.empresa_nome, CNPJ: c.cnpj, razao_social: c.razao_social, criterio_afetado: c.criterio_afetado, motivo_tratativa: c.motivo_tratativa,
      prioridade: c.prioridade, acao_recomendada: c.acao_recomendada, classificacao: c.origem_classificacao, competencia: result.periodo_referencia,
      origem_base: r.sourceName, origem_id: r.sourceId, linha_origem: r.line, registro_id: r.id, dados_originais: JSON.stringify(r.original) };
  }));
}
const columns = ['empresa', 'CNPJ', 'razao_social', 'criterio_afetado', 'motivo_tratativa', 'prioridade', 'acao_recomendada', 'classificacao', 'competencia', 'origem_base', 'origem_id', 'linha_origem', 'registro_id', 'dados_originais'];
export function csvCell(value) {
  let text = String(value ?? '');
  // Neutraliza fórmulas em leitores de planilhas; o JSON preserva o original exato.
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function toCsv(rows) { return '\uFEFF' + [columns.map(csvCell).join(';'), ...rows.map(row => columns.map(c => csvCell(row[c])).join(';'))].join('\r\n'); }
export async function toXlsx(rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Tratativas');
  sheet.columns = columns.map(k => ({ header: k, key: k, width: k === 'dados_originais' ? 65 : 24 }));
  rows.forEach(row => sheet.addRow(row));
  sheet.getColumn('CNPJ').numFmt = '@';
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C1D75' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'O1' };
  return book.xlsx.writeBuffer();
}

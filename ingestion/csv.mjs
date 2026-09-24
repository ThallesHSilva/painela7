import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';

export const key = value => String(value ?? '').replace(/^\uFEFF/, '').trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
export const hash = value => createHash('sha256').update(value).digest('hex');
export const required = ['INDICADOR', 'SUB INDICADOR', 'COMPETENCIA', 'GRUPO REDE TERMO', 'TIPO MOVIMENTO', 'QUANTIDADE'];
export function cnpj(value) {
  const raw = String(value ?? '').trim();
  if (!raw || !/^[\d.\/\s-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length > 0 && digits.length <= 14 ? digits.padStart(14, '0') : null;
}
function decode(buffer) {
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'UTF-8' }; }
  catch { return { text: new TextDecoder('windows-1252').decode(buffer), encoding: 'Windows-1252' }; }
}
export function semesterFromFileName(fileName) {
  const name = key(fileName);
  if (/JUL.*DEZ|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO|\bH2\b/.test(name)) return 'h2';
  if (/JAN.*JUN|JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|\bH1\b/.test(name)) return 'h1';
  return null;
}
function belongsToSemester(competence, semester) {
  if (!semester) return true;
  const month = Number(String(competence).slice(5, 7));
  return semester === 'h1' ? month <= 6 : month >= 7;
}
function delimiterFor(text) { const header = text.split(/\r?\n/, 1)[0]; return (header.match(/;/g)?.length ?? 0) >= (header.match(/,/g)?.length ?? 0) ? ';' : ','; }
export function inspectCsv(buffer) {
  const { text, encoding } = decode(buffer);
  const delimiter = delimiterFor(text);
  const [headers = []] = parse(text, { delimiter, bom: true, to: 1 });
  return { headers, encoding, delimiter, missing: required.filter(k => !headers.some(h => key(h) === k)) };
}
export function identifyCsv(buffer, name) {
  if (buffer.length > 1024 * 1024) {
    buffer = buffer.subarray(0, 1024 * 1024);
    const end = buffer.lastIndexOf(10);
    if (end >= 0) buffer = buffer.subarray(0, end + 1);
  }
  const info = inspectCsv(buffer);
  if (info.missing.length) throw new Error(`Colunas ausentes: ${info.missing.join(', ')}`);
  const { text } = decode(buffer);
  const rows = parse(text, { delimiter: info.delimiter, bom: true, to: 251, skip_empty_lines: true, relax_column_count: true });
  const headers = rows.shift().map(key);
  const values = rows.map(row => key(row[headers.indexOf('INDICADOR')]).replaceAll(' ', ''));
  const contentDomains = ['carteira', 'fixa', 'movel'].filter(d => values.some(v => v.includes(`QSC${d.toUpperCase()}`)));
  const nameDomains = ['carteira', 'fixa', 'movel'].filter(d => key(name).split(' ').includes(d.toUpperCase()));
  if (contentDomains.length > 1 || nameDomains.length > 1 || (contentDomains.length && nameDomains.length && contentDomains[0] !== nameDomains[0])) throw new Error('O nome e o conteúdo indicam tipos QSC conflitantes. Confira o arquivo.');
  const domain = contentDomains[0] ?? nameDomains[0];
  if (!domain) throw new Error('Não foi possível identificar o QSC. Use Carteira, Fixa ou Movel no nome, ou informe o tipo na coluna INDICADOR.');
  const partners = [...new Set(rows.map(row => row[headers.indexOf('GRUPO REDE TERMO')]?.trim()).filter(Boolean))];
  if (!partners.length) throw new Error('Nenhum parceiro identificado em GRUPO_REDE_TERMO.');
  return { ...info, domain, partners, semester: semesterFromFileName(name), clientColumn: info.headers.find(h => key(h) === 'DOCUMENTO CLIENTE') ?? null };
}
export function ingest(files) {
  const records = [], issues = [], sources = [], seen = new Map();
  // Arquivos de carteira podem conter milhões de linhas. Um aviso por linha torna o
  // próprio log maior que a base e impede o processamento; guardamos amostras e totais.
  const maxIssueSamples = 40;
  for (const [fileIndex, file] of files.entries()) {
    const sourceId = `f${fileIndex + 1}`, digest = hash(file.buffer);
    const issueCounts = new Map();
    const semester = semesterFromFileName(file.name);
    const source = { id: sourceId, arquivo: file.name, sha256: digest, dominio: file.domain, semestre: semester, registros_aceitos: 0, registros_rejeitados: 0, encoding: null, ocorrencias_resumidas: [] };
    const issue = (type, message, line = null) => {
      const issueKey = `${type}\u0000${message}`;
      const count = (issueCounts.get(issueKey) ?? 0) + 1;
      issueCounts.set(issueKey, count);
      if (count <= maxIssueSamples) issues.push({ tipo: type, mensagem: message, origem: sourceId, arquivo: file.name, linha: line });
    };
    sources.push(source);
    if (!['carteira', 'fixa', 'movel'].includes(file.domain)) { issue('erro', 'Domínio obrigatório: carteira, fixa ou movel.'); continue; }
    let rows, headers;
    try {
      const decoded = decode(file.buffer); source.encoding = decoded.encoding;
      source.delimitador = delimiterFor(decoded.text);
      rows = parse(decoded.text, { delimiter: source.delimitador, bom: true, info: true, skip_empty_lines: true, relax_column_count: true });
      headers = rows.shift()?.record ?? [];
    } catch (error) { issue('erro', `CSV inválido: ${error.message}`); continue; }
    const normalized = headers.map(key);
    const missing = required.filter(h => !normalized.includes(h));
    if (missing.length || new Set(normalized).size !== normalized.length) {
      issue('erro', missing.length ? `Colunas ausentes: ${missing.join(', ')}` : 'Cabeçalhos duplicados após normalização.'); continue;
    }
    const clientColumn = file.clientColumn ? key(file.clientColumn) : ['DOCUMENTO CLIENTE', 'CNPJ CLIENTE', 'CNPJ'].find(h => normalized.includes(h));
    if (clientColumn === 'CNPJ PARCEIRO') { issue('erro', 'CNPJ PARCEIRO não pode ser usado como CNPJ do cliente.'); continue; }
    if (clientColumn && !normalized.includes(clientColumn)) { issue('erro', `Coluna de cliente não encontrada: ${clientColumn}`); continue; }
    if (!clientColumn) issue('aviso', 'Sem coluna de CNPJ do cliente: cálculos disponíveis, identificação de clientes indisponível.');
    source.coluna_cnpj_cliente = clientColumn ?? null;
    for (const { record: values, info } of rows) {
      const line = info.lines;
      if (values.length !== headers.length) { issue('erro', 'Quantidade de campos diferente do cabeçalho.', line); source.registros_rejeitados++; continue; }
      const raw = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
      const row = Object.fromEntries(normalized.map((h, i) => [h, values[i].trim()]));
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.COMPETENCIA) || !row['GRUPO REDE TERMO']) {
        issue('erro', 'Competência deve ser YYYY-MM e empresa deve estar preenchida.', line); source.registros_rejeitados++; continue;
      }
      if (!belongsToSemester(row.COMPETENCIA, semester)) continue;
      const signature = hash(JSON.stringify([file.domain, row]));
      if (seen.has(signature)) issue('duplicidade', `Registro repetido, preservado conforme regra oficial. Primeira origem: ${seen.get(signature)}`, line);
      else seen.set(signature, `${sourceId}:${line}`);
      const q = row.QUANTIDADE;
      let quantity = Number(q.includes(',') ? q.replaceAll('.', '').replace(',', '.') : q);
      if (!q || !Number.isFinite(quantity)) { quantity = 0; issue('aviso', 'QUANTIDADE vazia ou inválida convertida para zero conforme regra oficial.', line); }
      if (!quantity && key(row['SUB INDICADOR']) === 'PARQUE COM DEBITO AUTOMATICO') {
        const found = row.OBSERVACAO?.match(/quantidade\s+contas?\s+em\s+dauto\s*:\s*([\d.,-]+)/i);
        if (found) quantity = Number(found[1].includes(',') ? found[1].replaceAll('.', '').replace(',', '.') : found[1]) || 0;
      }
      const partnerDocument = cnpj(row['CNPJ PARCEIRO']);
      if (row['CNPJ PARCEIRO'] && !partnerDocument) { issue('erro', 'CNPJ PARCEIRO malformado; linha rejeitada para impedir associação indevida.', line); source.registros_rejeitados++; continue; }
      const clientCnpj = clientColumn ? cnpj(row[clientColumn]) : null;
      if (clientColumn && !clientCnpj) issue('aviso', 'CNPJ do cliente vazio ou malformado; linha mantida no cálculo, sem identificação para tratativa.', line);
      // GRUPO_REDE_TERMO é a chave de parceiro definida para esta análise. O CNPJ
      // parceiro segue preservado na origem, mas não fragmenta o resultado quando
      // houver mais de um CNPJ associado ao mesmo grupo comercial.
      const partnerId = hash(`grupo:${key(row['GRUPO REDE TERMO'])}`).slice(0, 24);
      // Preserva somente as colunas que explicam o cálculo e a tratativa. A cópia integral
      // de CSVs grandes multiplica o tamanho do processamento sem acrescentar evidência útil.
      const original = Object.fromEntries(Object.entries(raw).filter(([column]) => [
        'INDICADOR', 'SUB INDICADOR', 'COMPETENCIA', 'CODIGO PARCEIRO', 'CNPJ PARCEIRO',
        'GRUPO REDE TERMO', 'DOCUMENTO CLIENTE', 'CNPJ CLIENTE', 'NOME CLIENTE',
        'RAZAO SOCIAL CLIENTE', 'RAZAO SOCIAL', 'TIPO MOVIMENTO',
        'DETALHE TIPO MOVIMENTO', 'QUANTIDADE', 'OBSERVACAO',
      ].includes(key(column))));
      records.push({ id: `${sourceId}:${line}`, sourceId, sourceName: file.name, line, original, domain: file.domain,
        indicator: row.INDICADOR, subIndicator: row['SUB INDICADOR'], competence: row.COMPETENCIA,
        partnerId, partnerName: row['GRUPO REDE TERMO'], partnerDocument: null, clientCnpj,
        clientName: row['RAZAO SOCIAL CLIENTE'] || row['RAZAO SOCIAL'] || row['NOME CLIENTE'] || '',
        movement: row['TIPO MOVIMENTO'], movementDetail: row['DETALHE TIPO MOVIMENTO'] || '', quantity, rows: 1 });
      source.registros_aceitos++;
    }
    for (const [issueKey, count] of issueCounts) {
      if (count <= maxIssueSamples) continue;
      const [type, message] = issueKey.split('\u0000');
      const resumo = { tipo: type, mensagem: message, ocorrencias: count, amostras_exibidas: maxIssueSamples };
      source.ocorrencias_resumidas.push(resumo);
      issues.push({ tipo: type, mensagem: `${count} ocorrências: ${message} (exibidas ${maxIssueSamples} amostras).`, origem: sourceId, arquivo: file.name, linha: null });
    }
  }
  return { records, issues, sources };
}

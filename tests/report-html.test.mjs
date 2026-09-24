import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHtml } from '../reports/html.mjs';
import { calculate } from '../qsc/calculate.mjs';
import { ingest } from '../ingestion/csv.mjs';
import { demoFiles } from './fixtures.mjs';
test('relatório HTML mantém dados como texto e funciona sem scripts externos', () => {
  const result = calculate(ingest(demoFiles()));
  const company = result.empresas[0];
  company.empresa_nome = '<script>alert(1)</script>';
  company.plano_acao.diagnostico = '<img src=x onerror=alert(1)>';
  const html = makeHtml(result, company);
  assert(!html.includes('<script>')); assert(!html.includes('<img src=x'));
  assert(html.includes('&lt;script&gt;')); assert(html.includes('&lt;img src=x'));
  assert(html.includes('@media print')); assert(html.includes('Resumo determinístico'));
  for (const id of ['visao','indicadores','gaps','plano','tratativas']) assert(html.includes(`id="${id}"`));
});

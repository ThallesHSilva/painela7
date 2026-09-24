import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createApp } from '../server.mjs';
import { demoFiles } from './fixtures.mjs';
import { generatePlan } from '../reports/ai.mjs';
import { serialize } from 'node:v8';
test('integração: upload, revisão, persistência, mudança de período e exportação isolada', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qsc-test-'));
  const server = createApp({ dataDir: dir }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await fs.rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const form = new FormData(); demoFiles().forEach(f => form.append('files', new Blob([f.buffer]), f.name));
  form.append('options', JSON.stringify(demoFiles().map(f => ({ domain: f.domain, clientColumn: 'DOCUMENTO_CLIENTE' }))));
  const response = await fetch(base + '/api/import', { method: 'POST', body: form }); assert.equal(response.status, 201);
  let result = await response.json(); const id = result.processamento_id;
  const company = result.empresas.find(e => e.empresa_nome === 'Empresa Exemplo');
  assert.deepEqual(company.candidatos_revisao, []); // a visão inicial não transporta a lista completa
  const prefix = `/api/runs/${id}/company/${company.empresa_id}`;
  const candidatePage = await (await fetch(base + prefix + '/candidates?page=0')).json();
  const candidate = candidatePage.itens[0];
  assert(candidate); assert.equal(candidatePage.pagina, 0); assert(candidatePage.total > 0);
  const post = async (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const review = await post(prefix + '/review', { candidateId: candidate.id, confirmado: true, prioridade: 'Alta', motivo: 'Revisão humana confirmada', acao: 'Conferir cadastro' });
  assert.equal(review.status, 200);
  assert.equal((await review.json()).empresas.find(e => e.empresa_id === company.empresa_id).resumo_qsc.total_cnpjs_para_tratativa, 1);
  assert.equal((await post(`/api/runs/${id}/period`, { period: '2026-08' })).status, 200);
  assert.equal((await post(`/api/runs/${id}/period`, { period: '2026-09' })).status, 200);
  const exported = await (await fetch(base + prefix + '/export/json')).json();
  assert.equal(exported.empresas.length, 1); assert.equal(exported.empresas[0].cnpjs_para_tratativa.length, 1);
  assert(exported.registros.every(r => r.partnerId === company.empresa_id)); assert.equal(exported.revisoes_periodos, undefined);
  const htmlResponse = await fetch(base + prefix + '/export/html');
  assert.equal(htmlResponse.status, 200);
  assert.match(htmlResponse.headers.get('content-security-policy'), /style-src 'sha256-/);
  const html = await htmlResponse.text();
  assert(html.includes('Empresa Exemplo')); assert(!html.includes('Segunda Empresa'));
  assert(html.includes('Plano de ação')); assert(html.includes(candidate.cnpj));
  const csv = await (await fetch(base + prefix + '/export/csv')).text(); assert(csv.includes(candidate.cnpj)); assert(!csv.includes('Segunda Empresa'));
  const persisted = JSON.parse(await fs.readFile(path.join(dir, id, 'result.json'), 'utf8')); assert.equal(persisted.empresas.find(e => e.empresa_id === company.empresa_id).cnpjs_para_tratativa.length, 1);
  // Simulate a saved run before unified history was introduced.
  for (const e of persisted.empresas) { delete e.painel_semestral; for (const i of e.indicadores) delete i.historico; }
  await fs.writeFile(path.join(dir, id, 'result.bin'), serialize(persisted));
  await fs.writeFile(path.join(dir, id, 'view.json'), JSON.stringify(persisted));
  const upgraded = await (await fetch(base + `/api/runs/${id}`)).json();
  const upgradedCompany = upgraded.empresas.find(e => e.empresa_id === company.empresa_id);
  assert.equal(upgradedCompany.painel_semestral.length, 2);
  assert(upgradedCompany.indicadores.every(i => i.historico.length > 0));
  assert.equal(upgradedCompany.cnpjs_para_tratativa.length, 1);
  assert.deepEqual(upgradedCompany.plano_acao, persisted.empresas.find(e => e.empresa_id === company.empresa_id).plano_acao);
  assert.equal(upgraded.registros, undefined);
  assert.deepEqual(upgradedCompany.candidatos_revisao, []);
  assert.deepEqual(await (await fetch(base + `/api/runs/${id}`)).json(), upgraded);
  assert.equal((await fetch(base + '/api/runs', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
});

test('IA: valida JSON, não envia CNPJs e trata falha sem inventar resposta', async () => {
  const company = { dominios: [], indicadores: [], principais_gaps: [], resumo_qsc: { total_cnpjs_para_tratativa: 1 }, cnpjs_para_tratativa: [{ cnpj: '12345678000190' }] };
  let sent;
  const good = { diagnostico: 'Revisar cobertura.', resumo_executivo: 'Dados parciais.', acoes_prioritarias: [] };
  const plan = await generatePlan(company, '2026-09', { apiKey: 'mock', model: 'mock', fetcher: async (url, req) => { sent = JSON.parse(req.body); return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(good) }] }] }) }; } });
  assert.equal(plan.diagnostico, good.diagnostico); assert(!JSON.stringify(sent).includes('12345678000190')); assert.equal(sent.store, false);
  await assert.rejects(generatePlan(company, '2026-09', { apiKey: '', model: '' }), /Configure/);
  await assert.rejects(generatePlan(company, '2026-09', { apiKey: 'mock', model: 'mock', fetcher: async () => ({ ok: false, status: 429 }) }), /429/);
});

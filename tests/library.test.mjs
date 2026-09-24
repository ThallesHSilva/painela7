import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { identifyCsv } from '../ingestion/csv.mjs';
import { csv, row, demoFiles } from './fixtures.mjs';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qsc-library-test-'));
  const servers = [];
  const start = async () => {
    const server = createApp({ dataDir: dir }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve)); servers.push(server);
    return `http://127.0.0.1:${server.address().port}`;
  };
  t.after(async () => {
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    assert(path.resolve(dir).startsWith(path.join(os.tmpdir(), 'qsc-library-test-')));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const base = await start();
  const send = async (files, legacy = false) => {
    const form = new FormData();
    for (const f of files) form.append('files', new Blob([f.buffer]), f.name);
    if (legacy) form.append('options', JSON.stringify(files.map(f => ({ domain: f.domain }))));
    const response = await fetch(base + (legacy ? '/api/import' : '/api/library/import'), { method: 'POST', body: form });
    return { status: response.status, body: await response.json() };
  };
  return { dir, base, start, send, current: async () => (await fetch(base + '/api/library')).json() };
}
const company = r => r.empresas.find(e => e.empresa_nome === 'Empresa Exemplo');
const carteira = (quantity = 3, extra = {}) => ({ name: 'QSC_CARTEIRA.csv', domain: 'carteira', buffer: csv([
  row('Churn Movel', 'CHURN', quantity, extra), row('Churn/Fidelizacao Movel', 'PARQUE MOVEL', 100, extra),
]) });

test('identificação automática por nome ou INDICADOR, separador e conflito de tipo', () => {
  const file = demoFiles()[0];
  assert.equal(identifyCsv(file.buffer, file.name).domain, 'carteira');
  const content = row('TFP', 'CLIENTE SAFRA', 100); content[0] = 'QSC Móvel';
  assert.equal(identifyCsv(csv([content]), 'base.csv').domain, 'movel');
  assert.equal(identifyCsv(Buffer.from(csv([content]).toString().replaceAll(';', ',')), 'base.csv').delimiter, ',');
  assert.throws(() => identifyCsv(csv([content]), 'QSC_FIXA.csv'), /conflitantes/);
  assert.throws(() => identifyCsv(csv([row('x', 'y', 1)]), 'base.csv'), /Não foi possível identificar/);
  assert.throws(() => identifyCsv(Buffer.from('a;b\n1;2'), 'QSC_FIXA.csv'), /Colunas ausentes/);
});

test('biblioteca atualiza somente o parceiro/domínio/ano/semestre correspondente e persiste', async t => {
  const f = await fixture(t);
  assert.equal(await f.current(), null);
  const first = await f.send(demoFiles()); assert.equal(first.status, 201);
  const repeated = await f.send(demoFiles()); assert.equal(repeated.status, 201);
  assert.deepEqual(company(repeated.body).dominios, company(first.body).dominios);
  assert.deepEqual(company(repeated.body).indicadores.map(i => i.numerador), company(first.body).indicadores.map(i => i.numerador));
  const updated = await f.send([carteira()]); assert.equal(updated.status, 201);
  const c = company(updated.body);
  assert.equal(c.indicadores.find(i => i.id === 'churn-movel').numerador, 3);
  assert.equal(c.dominios.find(d => d.dominio === 'fixa').nota, 56);
  assert.equal(c.dominios.find(d => d.dominio === 'movel').nota, 45);
  assert(updated.body.empresas.some(e => e.empresa_nome === 'Segunda Empresa'));
  const h1 = await f.send([carteira(1, { period: '2026-02' })]); assert.equal(h1.status, 201);
  assert(h1.body.periodos_disponiveis.includes('2026-02'));
  assert.equal(company(h1.body).indicadores.find(i => i.id === 'churn-movel').numerador, 3);
  const year = await f.send([carteira(2, { period: '2025-09' })]); assert.equal(year.status, 201);
  assert(year.body.periodos_disponiveis.includes('2025-09'));
  assert.equal(company(year.body).indicadores.find(i => i.id === 'churn-movel').numerador, 3);
  const sources = await fs.readdir(path.join(f.dir, 'bases'));
  assert(sources.every(name => /^s[a-f0-9]{24}\.csv$/.test(name)));
  const restarted = await f.start();
  const reloaded = await (await fetch(restarted + '/api/library')).json();
  assert.equal(reloaded.processamento_id, year.body.processamento_id);
  assert.deepEqual(company(reloaded).dominios, company(year.body).dominios);
});

test('arquivo inválido e conflito no lote não substituem a biblioteca; envios paralelos preservam ambos', async t => {
  const f = await fixture(t);
  const initial = await f.send(demoFiles());
  const failed = await f.send([{ name: 'QSC_CARTEIRA.csv', buffer: csv([row('Churn Movel', 'CHURN', 1, { period: 'invalido' })]) }]);
  assert.equal(failed.status, 422);
  assert.equal((await f.current()).processamento_id, initial.body.processamento_id);
  const duplicate = await f.send([carteira(1), carteira(2)]);
  assert.equal(duplicate.status, 422);
  assert.equal((await f.current()).processamento_id, initial.body.processamento_id);
  const [a, b] = await Promise.all([f.send([carteira(2, { company: 'Parceiro A' })]), f.send([carteira(3, { company: 'Parceiro B' })])]);
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  const stored = await f.current();
  assert(stored.empresas.some(e => e.empresa_nome === 'Parceiro A'));
  assert(stored.empresas.some(e => e.empresa_nome === 'Parceiro B'));
});

test('migração reúne arquivos legados complementares sem duplicar a base atualizada', async t => {
  const f = await fixture(t);
  assert.equal((await f.send(demoFiles(), true)).status, 201);
  assert.equal((await f.send([carteira(4)], true)).status, 201);
  const migrated = await f.current();
  const c = company(migrated);
  assert.equal(c.indicadores.find(i => i.id === 'churn-movel').numerador, 4);
  assert.equal(c.dominios.find(d => d.dominio === 'fixa').nota, 56);
  assert.equal(c.dominios.find(d => d.dominio === 'movel').nota, 45);
  assert.equal((await f.current()).processamento_id, migrated.processamento_id);
});

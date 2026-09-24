import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { serialize, deserialize } from 'node:v8';
import { ingest, inspectCsv, identifyCsv, hash } from './ingestion/csv.mjs';
import { registerLibrary } from './ingestion/library-api.mjs';
import { rememberDecisions, restoreDecisions } from './ingestion/library.mjs';
import { calculate } from './qsc/calculate.mjs';
import { assertResult, resultSchema } from './schemas/result.mjs';
import { exportRows, toCsv, toXlsx } from './exports/treatments.mjs';
import { makePdf } from './reports/pdf.mjs';
import { makeHtml, reportStyleHash } from './reports/html.mjs';
import { generatePlan } from './reports/ai.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const runIndex = result => ({
  periodo: result.periodo_referencia,
  data: result.data_processamento,
  empresas: result.empresas.map(e => ({ id: e.empresa_id, nome: e.empresa_nome, cnpj: e.cnpj_empresa })),
});
export function createApp({ dataDir = path.join(root, 'data') } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    // Mantém a proteção local por padrão; o deploy pode habilitar o host do proxy.
    const remoteHostAllowed = process.env.ALLOW_REMOTE_HOST === '1' || process.env.NODE_ENV === 'production';
    if (!remoteHostAllowed && !['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname)) return res.status(403).json({ error: 'Host não autorizado.' });
    const origin = req.get('origin');
    const configuredOrigin = process.env.PUBLIC_ORIGIN?.replace(/\/$/, '');
    const requestOrigin = `${req.protocol}://${req.get('host')}`;
    if (origin && origin !== configuredOrigin && origin !== requestOrigin) return res.status(403).json({ error: 'Origem não autorizada.' });
    res.set('X-Content-Type-Options', 'nosniff'); res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'sha256-BgHKiJ6UdIm0oIDllgFWMaQcm8sVtslFi5XWQTAigus='; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'");
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024, files: 20, fields: 5 }, fileFilter: (req, file, cb) => cb(null, /\.csv$/i.test(file.originalname)) });
  const runPath = id => { if (!/^[a-f\d-]{36}$/.test(id)) throw Object.assign(new Error('Processamento inválido.'), { status: 404 }); return path.join(dataDir, id); };
  const load = async id => {
    const directory = runPath(id);
    try { return deserialize(await fs.readFile(path.join(directory, 'result.bin'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8')); }
  };
  const periodCache = new Map();
  const periodViewCache = new Map();
  const clearPeriodCache = id => {
    for (const key of periodCache.keys()) if (key.startsWith(`${id}:`)) periodCache.delete(key);
    for (const key of periodViewCache.keys()) if (key.startsWith(`${id}:`)) periodViewCache.delete(key);
  };
  const preparePeriod = (previous, period) => {
    const saved = previous.revisoes_periodos ?? {};
    rememberDecisions(previous, saved, true);
    const prepared = calculate({ records: previous.registros, issues: previous.importacao.ocorrencias, sources: previous.importacao.fontes }, period);
    prepared.processamento_id = previous.processamento_id;
    prepared.regras_sha256 = previous.regras_sha256;
    prepared.revisoes_periodos = saved;
    prepared.bases_atualizadas_em = previous.bases_atualizadas_em;
    restoreDecisions(prepared, saved);
    return prepared;
  };
  const save = async (id, result) => {
    assertResult(result);
    const tmp = path.join(runPath(id), `${randomUUID()}.tmp`);
    const binary = serialize(result);
    await fs.writeFile(tmp, binary);
    await fs.rename(tmp, path.join(runPath(id), 'result.bin'));
    await fs.writeFile(path.join(runPath(id), 'run.json'), JSON.stringify(runIndex(result)));
    await fs.writeFile(path.join(runPath(id), 'view.json'), JSON.stringify(view(result)));
    await fs.writeFile(path.join(runPath(id), 'candidates.json'), JSON.stringify(Object.fromEntries(result.empresas.map(e => [e.empresa_id,
      e.candidatos_revisao.map(({ registros, ...candidate }) => candidate)]))));
    // Mantém o JSON legível para lotes pequenos e para compatibilidade com versões
    // anteriores. Lotes grandes usam o binário para não exceder o limite de strings.
    if (binary.byteLength < 20 * 1024 * 1024) await fs.writeFile(path.join(runPath(id), 'result.json'), JSON.stringify(result, null, 2));
    const periodsDir = path.join(runPath(id), 'periods');
    const readyFile = path.join(periodsDir, 'READY');
    try { await fs.access(readyFile); }
    catch (error) {
      if (error.code !== 'ENOENT' || !result.registros?.length) throw error;
      await fs.mkdir(periodsDir, { recursive: true });
      for (const period of result.periodos_disponiveis) {
        const prepared = period === result.periodo_referencia ? result : preparePeriod(result, period);
        const preparedView = view(prepared);
        periodViewCache.set(`${id}:${period}`, preparedView);
        await fs.writeFile(path.join(periodsDir, `${period}.json`), JSON.stringify(preparedView));
      }
      await fs.writeFile(readyFile, new Date().toISOString());
    }
  };
  const loadPeriodView = async (id, period) => {
    const cached = periodViewCache.get(`${id}:${period}`);
    if (cached) return cached;
    try {
      const preparedView = JSON.parse(await fs.readFile(path.join(runPath(id), 'periods', `${period}.json`), 'utf8'));
      periodViewCache.set(`${id}:${period}`, preparedView);
      return preparedView;
    } catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
  };
  const find = (result, id) => { const company = result.empresas.find(e => e.empresa_id === id); if (!company) throw Object.assign(new Error('Empresa não encontrada neste processamento.'), { status: 404 }); return company; };
  const locks = new Map();
  const locked = async (id, fn) => { const prior = locks.get(id) ?? Promise.resolve(); const task = prior.catch(() => {}).then(fn); locks.set(id, task); try { return await task; } finally { if (locks.get(id) === task) locks.delete(id); } };
  const recalculate = preparePeriod;
  const view = result => {
    const { registros, ...rest } = result;
    // O navegador recebe somente o necessário para a análise. As linhas completas
    // ficam no lote e são consultadas sob demanda pelo endpoint de evidências.
    return { ...rest,
      importacao: { ...rest.importacao, ocorrencias: rest.importacao.ocorrencias.slice(0, 300), ocorrencias_total: rest.importacao.ocorrencias.length },
      empresas: rest.empresas.map(empresa => ({ ...empresa,
        indicadores: empresa.indicadores.map(({ rastreabilidade, ...indicador }) => ({ ...indicador, rastreabilidade: rastreabilidade.slice(0, 200) })),
        candidatos_revisao: [], candidatos_revisao_total: empresa.candidatos_revisao.length,
      })),
    };
  };
  app.get('/api/config', (req, res) => res.json({ ia_disponivel: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL), coluna_cliente: 'DOCUMENTO_CLIENTE' }));
  const quartilImportToken = process.env.QUARTIL_IMPORT_TOKEN?.trim();
  app.post('/api/quartil/import', express.raw({ type: 'application/json', limit: '10mb' }), async (req, res, next) => {
    if (!quartilImportToken || req.get('authorization') !== `Bearer ${quartilImportToken}`) return res.sendStatus(404);
    try {
      const snapshot = JSON.parse(req.body.toString('utf8'));
      if (!Array.isArray(snapshot.consultants)) return res.status(422).json({ error: 'Snapshot de quartil inválido.' });
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(path.join(dataDir, 'quartil.snapshot.json'), JSON.stringify(snapshot));
      res.status(201).json({ ok: true, consultants: snapshot.consultants.length });
    } catch (error) { next(error); }
  });
  app.get('/api/quartil', async (req, res, next) => {
    try {
      const snapshot = JSON.parse(await fs.readFile(path.join(dataDir, 'quartil.snapshot.json'), 'utf8'));
      const requested = new Set(req.query.partner ? [].concat(req.query.partner).map(String) : []);
      const consultants = requested.size ? snapshot.consultants.filter(item => requested.has(item.partnerId)) : snapshot.consultants;
      res.json({ ...snapshot, consultants });
    } catch (error) {
      if (error.code === 'ENOENT') return res.status(404).json({ error: 'Base de quartil ainda não foi importada.' });
      next(error);
    }
  });
  registerLibrary(app, { dataDir, load, save, view, locked, root });
  app.get('/api/schema', (req, res) => res.json(resultSchema));
  app.get('/api/rules/:name', async (req, res) => {
    if (!['CONTEXTO_QSC.md', 'CALCULO_QSC_CSV.md'].includes(req.params.name)) return res.sendStatus(404);
    res.type('text/plain').send(await fs.readFile(path.join(root, req.params.name), 'utf8'));
  });
  app.post('/api/inspect', upload.array('files', 20), (req, res) => res.json((req.files ?? []).map(file => {
    try { return { name: file.originalname, ...identifyCsv(file.buffer, file.originalname) }; }
    catch (err) { return { name: file.originalname, error: err.message }; }
  })));
  app.post('/api/import', upload.array('files', 20), async (req, res) => {
    if (!req.files?.length) return res.status(400).json({ error: 'Selecione pelo menos um CSV.' });
    let options;
    try { options = JSON.parse(req.body.options || '[]'); } catch { return res.status(400).json({ error: 'Opções de importação inválidas.' }); }
    if (!Array.isArray(options) || options.length !== req.files.length) return res.status(400).json({ error: 'Informe o domínio de cada arquivo.' });
    const id = randomUUID(), directory = runPath(id);
    await fs.mkdir(path.join(directory, 'originais'), { recursive: true });
    const files = req.files.map((f, i) => ({ name: f.originalname, buffer: f.buffer, domain: options[i]?.domain, clientColumn: options[i]?.clientColumn }));
    for (const [i, f] of files.entries()) await fs.writeFile(path.join(directory, 'originais', `f${i + 1}.csv`), f.buffer, { flag: 'wx' });
    const input = ingest(files);
    await fs.writeFile(path.join(directory, 'importacao.json'), JSON.stringify({ fontes: input.sources, ocorrencias: input.issues.slice(0, 300), ocorrencias_total: input.issues.length }, null, 2));
    if (!input.records.length) return res.status(422).json({ error: 'Nenhuma linha válida. Consulte os erros da importação.', ocorrencias: input.issues, processamento_id: id });
    const result = calculate(input);
    result.processamento_id = id;
    result.regras_sha256 = Object.fromEntries(await Promise.all(result.fontes_regras.map(async file => [file, hash(await fs.readFile(path.join(root, file)))])));
    await save(id, result);
    res.status(201).json(view(result));
  });
  app.get('/api/runs', async (req, res) => {
    await fs.mkdir(dataDir, { recursive: true }); const items = [];
    for (const dir of await fs.readdir(dataDir)) { try {
      let index;
      try { index = JSON.parse(await fs.readFile(path.join(dataDir, dir, 'run.json'), 'utf8')); }
      catch { index = runIndex(await load(dir)); }
      items.push({ id: dir, periodo: index.periodo, data: index.data, empresas: index.empresas.map(e => e.nome) });
    } catch {} }
    res.json(items.sort((a, b) => b.data.localeCompare(a.data)));
  });
  app.get('/api/runs/:id', async (req, res) => {
    let cached;
    try { cached = JSON.parse(await fs.readFile(path.join(runPath(req.params.id), 'view.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (cached?.empresas.every(e => e.painel_semestral && e.indicadores.every(i => i.historico))) return res.json(cached);
    // Upgrade saved runs once; subsequent navigation reads only the compact cached view.
    const upgraded = await locked(req.params.id, async () => {
      const previous = await load(req.params.id);
      if (previous.empresas.every(e => e.painel_semestral)) return view(previous);
      const result = recalculate(previous, previous.periodo_referencia);
      result.data_processamento = previous.data_processamento;
      await save(req.params.id, result);
      return view(result);
    });
    res.json(upgraded);
  });
  app.get('/api/runs/:id/company/:company/candidates', async (req, res) => {
    let candidates;
    try { candidates = JSON.parse(await fs.readFile(path.join(runPath(req.params.id), 'candidates.json'), 'utf8'))[req.params.company]; }
    catch (error) { if (error.code !== 'ENOENT') throw error; candidates = find(await load(req.params.id), req.params.company).candidatos_revisao; }
    if (!candidates) return res.status(404).json({ error: 'Empresa não encontrada neste processamento.' });
    const query = String(req.query.q ?? '').trim().toLocaleLowerCase('pt-BR');
    const filtered = query ? candidates.filter(c => `${c.cnpj} ${c.razao_social} ${c.criterio_afetado}`.toLocaleLowerCase('pt-BR').includes(query)) : candidates;
    const limit = 20, pages = Math.max(1, Math.ceil(filtered.length / limit));
    const page = Math.min(Math.max(0, Number.parseInt(req.query.page, 10) || 0), pages - 1);
    res.json({ itens: filtered.slice(page * limit, page * limit + limit), pagina: page, paginas: pages, total: filtered.length });
  });
  app.post('/api/runs/:id/period', async (req, res) => locked(req.params.id, async () => {
    const requestedPeriod = String(req.body.period ?? '');
    if (!/^\d{4}-\d{2}$/.test(requestedPeriod)) return res.status(400).json({ error: 'Competência inválida.' });
    const preparedView = await loadPeriodView(req.params.id, requestedPeriod);
    if (preparedView) return res.json(preparedView);
    const previous = await load(req.params.id);
    if (!previous.periodos_disponiveis.includes(requestedPeriod)) return res.status(400).json({ error: 'Competência indisponível.' });
    // Mantém decisões e planos por competência; mudar o filtro não apaga a revisão anterior.
    const result = recalculate(previous, requestedPeriod);
    periodCache.set(`${req.params.id}:${requestedPeriod}`, result);
    await save(req.params.id, result); res.json(view(result));
  }));
  app.get('/api/runs/:id/company/:company/evidence/:indicator', async (req, res) => {
    const r = await load(req.params.id), e = find(r, req.params.company), indicator = e.indicadores.find(i => i.id === req.params.indicator);
    if (!indicator) return res.sendStatus(404);
    const ids = new Set(indicator.rastreabilidade);
    res.json(r.registros.filter(x => x.partnerId === e.empresa_id && ids.has(x.id)).slice(0, 200));
  });
  app.post('/api/runs/:id/company/:company/review', async (req, res) => locked(req.params.id, async () => {
    const r = await load(req.params.id), e = find(r, req.params.company);
    const c = e.candidatos_revisao.find(c => c.id === req.body.candidateId);
    if (!c) return res.status(404).json({ error: 'CNPJ/critério não encontrado.' });
    if (typeof req.body.confirmado !== 'boolean' || !['Não definida', 'Alta', 'Média', 'Baixa'].includes(req.body.prioridade)) return res.status(400).json({ error: 'Revisão inválida.' });
    const action = String(req.body.acao ?? '').trim(), reason = String(req.body.motivo ?? '').trim();
    if (!action || !reason || action.length > 2000 || reason.length > 2000) return res.status(400).json({ error: 'Informe motivo e ação de até 2.000 caracteres.' });
    Object.assign(c, { confirmado: req.body.confirmado, prioridade: req.body.prioridade, acao_recomendada: action, motivo_tratativa: reason, origem_classificacao: 'Definida pelo usuário', revisado_em: new Date().toISOString() });
    e.cnpjs_para_tratativa = e.candidatos_revisao.filter(x => x.confirmado).sort((a, b) => ['Alta', 'Média', 'Baixa', 'Não definida'].indexOf(a.prioridade) - ['Alta', 'Média', 'Baixa', 'Não definida'].indexOf(b.prioridade));
    e.resumo_qsc.total_cnpjs_para_tratativa = new Set(e.cnpjs_para_tratativa.map(x => x.cnpj)).size;
    clearPeriodCache(req.params.id);
    await save(req.params.id, r); res.json(view(r));
  }));
  app.post('/api/runs/:id/company/:company/ai', async (req, res) => locked(req.params.id, async () => {
    const r = await load(req.params.id), e = find(r, req.params.company); e.plano_acao = await generatePlan(e, r.periodo_referencia); clearPeriodCache(req.params.id); await save(req.params.id, r); res.json(view(r));
  }));
  app.get('/api/runs/:id/company/:company/export/:format', async (req, res) => {
    const r = await load(req.params.id), e = find(r, req.params.company), format = req.params.format;
    if (!['json', 'csv', 'xlsx', 'pdf', 'html'].includes(format)) return res.sendStatus(404);
    if (format === 'html') {
      res.set('Content-Security-Policy', `default-src 'none'; style-src 'sha256-${reportStyleHash}'; style-src-attr 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'`);
      if (req.query.download === '1') res.attachment(`QSC-${e.empresa_id}-${r.periodo_referencia}.html`);
      return res.type('html').send(makeHtml(r, e));
    }
    res.attachment(`QSC-${e.empresa_id}-${r.periodo_referencia}.${format}`);
    if (format === 'json') {
      // Remove revisões de outras empresas e períodos: exportação estritamente isolada.
      const { revisoes_periodos, ...base } = r;
      const records = r.registros.filter(x => x.partnerId === e.empresa_id);
      const sourceIds = new Set(records.map(x => x.sourceId));
      const rowIds = new Set(records.map(x => x.id));
      const importacao = { fontes: r.importacao.fontes.filter(f => sourceIds.has(f.id)).map(f => ({ ...f,
        registros_aceitos: records.filter(x => x.sourceId === f.id).length, registros_rejeitados: null,
        escopo_contagem: 'Somente registros desta empresa; total de rejeições disponível no log do lote' })),
        ocorrencias: r.importacao.ocorrencias.filter(i => i.linha !== null && rowIds.has(`${i.origem}:${i.linha}`)) };
      return res.json({ ...base, empresas: [e], registros: records, importacao });
    }
    if (format === 'pdf') return res.type('application/pdf').send(await makePdf(r, e));
    const rows = exportRows(r, e);
    if (format === 'csv') return res.type('text/csv').send(toCsv(rows));
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(await toXlsx(rows)));
  });
  app.use(express.static(path.join(root, 'frontend')));
  app.use((error, req, res, next) => {
    const status = error.status || (error.code === 'ENOENT' ? 404 : error instanceof multer.MulterError ? 400 : 500);
    console.error(JSON.stringify({ time: new Date().toISOString(), route: req.path, status, message: error.message }));
    if (!res.headersSent) res.status(status).json({ error: status === 500 ? 'Não foi possível concluir a operação. Consulte o log local.' : error.message });
  });
  return app;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3210);
  const host = process.env.HOST || '0.0.0.0';
  createApp().listen(port, host, () => console.log(`QSC Gestão disponível em http://${host}:${port}`));
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { identifyCsv, ingest, hash, key } from './csv.mjs';
import { slot, sourceKey, normalizeInput, mergeInputs, hasUncoveredSlots, rememberDecisions, restoreDecisions } from './library.mjs';
import { calculate } from '../qsc/calculate.mjs';

const emptyInput = () => ({ records: [], sources: [], issues: [] });
const failure = message => Object.assign(new Error(message), { status: 422 });
export function registerLibrary(app, { dataDir, load, save, view, locked, root }) {
  const pointerPath = path.join(dataDir, 'library.json');
  const archives = path.join(dataDir, 'bases');
  const upload = multer({ dest: path.join(dataDir, '.incoming'), limits: { fileSize: 500 * 1024 * 1024, files: 20 },
    fileFilter: (req, file, done) => done(/\.csv$/i.test(file.originalname) ? null : failure('Selecione somente arquivos CSV.'), /\.csv$/i.test(file.originalname)) });
  const pointer = async () => { try { return JSON.parse(await fs.readFile(pointerPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; return null; } };
  const activate = async id => {
    const temporary = path.join(dataDir, `${randomUUID()}.library.tmp`);
    await fs.writeFile(temporary, JSON.stringify({ id, atualizado_em: new Date().toISOString() }));
    await fs.rename(temporary, pointerPath);
  };
  const archive = async (source, filePath) => {
    await fs.mkdir(archives, { recursive: true });
    const target = path.join(archives, `${source.id}.csv`);
    try { await fs.copyFile(filePath, target, 1); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  };
  const persist = async (input, pool, updatedAt) => {
    const id = randomUUID();
    await fs.mkdir(path.join(dataDir, id), { recursive: true });
    const result = calculate(input);
    result.processamento_id = id;
    result.bases_atualizadas_em = updatedAt ?? new Date().toISOString();
    result.revisoes_periodos = pool;
    restoreDecisions(result, pool, false);
    result.regras_sha256 = Object.fromEntries(await Promise.all(result.fontes_regras.map(async name => [name, hash(await fs.readFile(path.join(root, name)))])));
    const catalog = new Map();
    for (const r of input.records) {
      const id = slot(r);
      if (!catalog.has(id)) catalog.set(id, { parceiro: r.partnerName, dominio: r.domain, ano: r.competence.slice(0, 4), semestre: Number(r.competence.slice(5)) <= 6 ? 1 : 2, fontes: new Set() });
      catalog.get(id).fontes.add(r.sourceId);
    }
    await fs.writeFile(path.join(dataDir, id, 'bases.json'), JSON.stringify([...catalog.values()].map(s => ({ ...s, fontes: [...s.fontes] })), null, 2));
    await save(id, result);
    await activate(id); // Switch only after the complete result and originals are durable.
    return result;
  };
  const initialize = async () => {
    if (await pointer()) return;
    await fs.mkdir(dataDir, { recursive: true });
    const existing = [];
    for (const id of await fs.readdir(dataDir)) {
      if (!/^[a-f\d-]{36}$/.test(id)) continue;
      try { const summary = JSON.parse(await fs.readFile(path.join(dataDir, id, 'view.json'), 'utf8')); existing.push({ id, summary }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    existing.sort((a, b) => b.summary.data_processamento.localeCompare(a.summary.data_processamento));
    let consolidated = emptyInput();
    const pool = {}, origins = new Map();
    for (const { id, summary } of existing) {
      const covered = new Set(consolidated.records.map(slot));
      if (!hasUncoveredSlots(summary, covered)) continue;
      const previous = await load(id);
      rememberDecisions(previous, pool);
      const incoming = normalizeInput({ records: previous.registros, sources: previous.importacao.fontes, issues: previous.importacao.ocorrencias });
      for (const [index, source] of previous.importacao.fontes.entries()) if (!origins.has(sourceKey(source))) origins.set(sourceKey(source), path.join(dataDir, id, 'originais', `f${index + 1}.csv`));
      consolidated = mergeInputs(consolidated, incoming, false);
    }
    if (!consolidated.records.length) return;
    for (const source of consolidated.sources) await archive(source, origins.get(source.id));
    await persist(consolidated, pool, existing[0]?.summary.data_processamento);
  };
  app.get('/api/library', async (req, res) => {
    await locked('library', initialize);
    const active = await pointer();
    if (!active) return res.json(null);
    res.json(JSON.parse(await fs.readFile(path.join(dataDir, active.id, 'view.json'), 'utf8')));
  });
  app.post('/api/library/import', upload.array('files', 20), async (req, res) => {
    try {
      if (!req.files?.length) throw failure('Selecione pelo menos um CSV.');
      const result = await locked('library', async () => {
        await initialize();
        let incoming = emptyInput();
        const occupied = new Set();
        for (const file of req.files) {
          const buffer = await fs.readFile(file.path);
          let identified;
          try { identified = identifyCsv(buffer, file.originalname); } catch (error) { throw failure(`${file.originalname}: ${error.message}`); }
          const parsed = ingest([{ name: file.originalname, buffer, domain: identified.domain, clientColumn: identified.clientColumn }]);
          if (!parsed.records.length || parsed.sources[0].registros_rejeitados > 0 || parsed.issues.some(i => i.tipo === 'erro')) throw failure(`${file.originalname}: a base contém linhas inválidas. Corrija o arquivo para atualizar a base armazenada.`);
          // Check all rows, including rows beyond the identification sample.
          if (parsed.records.some(r => ['carteira', 'fixa', 'movel'].some(d => d !== identified.domain && key(r.indicator).replaceAll(' ', '').includes(`QSC${d.toUpperCase()}`)))) throw failure(`${file.originalname}: há mais de um tipo QSC na coluna INDICADOR.`);
          const normalized = normalizeInput(parsed);
          const slots = new Set(normalized.records.map(slot));
          if ([...slots].some(s => occupied.has(s))) throw failure('Há dois arquivos para o mesmo parceiro, QSC, ano e semestre. Envie somente a versão mais recente de cada base.');
          slots.forEach(s => occupied.add(s));
          // Avoid spreading large CSV arrays into function arguments.
          incoming.records = incoming.records.concat(normalized.records);
          incoming.sources.push(...normalized.sources); incoming.issues.push(...normalized.issues);
          await archive(normalized.sources[0], file.path);
        }
        const active = await pointer();
        const pool = {};
        let current = emptyInput();
        if (active) {
          const previous = await load(active.id);
          current = { records: previous.registros, sources: previous.importacao.fontes, issues: previous.importacao.ocorrencias };
          rememberDecisions(previous, pool);
        }
        return persist(mergeInputs(current, incoming), pool);
      });
      res.status(201).json(view(result));
    } finally {
      await Promise.all((req.files ?? []).map(f => fs.unlink(f.path).catch(() => {})));
    }
  });
}

import { hash, key, semesterFromFileName } from './csv.mjs';

export const slot = r => `${r.partnerId ?? hash(`grupo:${key(r.partnerName)}`).slice(0, 24)}:${r.domain}:${r.competence.slice(0, 4)}:${Number(r.competence.slice(5)) <= 6 ? 'h1' : 'h2'}`;
export const sourceKey = source => `s${hash(`${source.dominio}:${source.sha256}`).slice(0, 24)}`;

// Stable content-based source IDs preserve evidence links across imports.
export function normalizeInput(input) {
  const mapping = new Map(input.sources.map(s => [s.id, sourceKey(s)]));
  const sourceById = new Map(input.sources.map(s => [s.id, s]));
  const records = [];
  const partnerIds = new Map();
  for (const r of input.records) {
    const source = sourceById.get(r.sourceId);
    const semester = source?.semestre ?? semesterFromFileName(source?.arquivo ?? '');
    if (semester && semester !== (Number(r.competence.slice(5)) <= 6 ? 'h1' : 'h2')) continue;
    const sourceId = mapping.get(r.sourceId);
    if (!partnerIds.has(r.partnerName)) partnerIds.set(r.partnerName, hash(`grupo:${key(r.partnerName)}`).slice(0, 24));
    records.push({ ...r, partnerId: partnerIds.get(r.partnerName), partnerDocument: null,
      sourceId, id: `${sourceId}:${r.line}` });
  }
  return { records, sources: input.sources.map(s => ({ ...s, id: mapping.get(s.id) })),
    issues: input.issues.map(i => ({ ...i, origem: mapping.get(i.origem) ?? i.origem })) };
}

export function mergeInputs(current, incoming, replace = true) {
  const currentSlots = new Set(current.records.map(slot));
  const incomingSlots = new Set(incoming.records.map(slot));
  const records = replace
    ? [...current.records.filter(r => !incomingSlots.has(slot(r))), ...incoming.records]
    : [...current.records, ...incoming.records.filter(r => !currentSlots.has(slot(r)))];
  const counts = new Map();
  for (const r of records) counts.set(r.sourceId, (counts.get(r.sourceId) ?? 0) + 1);
  const sources = [...new Map([...current.sources, ...incoming.sources].map(s => [s.id, s])).values()]
    .filter(s => counts.has(s.id)).map(s => ({ ...s, registros_aceitos: counts.get(s.id) }));
  const issues = [...current.issues, ...incoming.issues].filter(i => !i.origem || counts.has(i.origem));
  return { records, sources, issues };
}

// Metadata prefilter avoids deserializing older large runs when all their slots are covered.
export function hasUncoveredSlots(view, covered) {
  return view.empresas.some(e => view.importacao.fontes.some(s => view.periodos_disponiveis.some(period => {
    const semester = s.semestre ?? semesterFromFileName(s.arquivo);
    if (semester && semester !== (Number(period.slice(5)) <= 6 ? 'h1' : 'h2')) return false;
    return !covered.has(slot({ partnerName: e.empresa_nome, domain: s.dominio, competence: period }));
  })));
}

export function rememberDecisions(previous, pool, overwrite = false) {
  const periods = { ...previous.revisoes_periodos, [previous.periodo_referencia]: previous.empresas };
  for (const [period, companies] of Object.entries(periods)) {
    pool[period] ??= [];
    for (const e of companies) {
      const name = e.empresa_nome ?? previous.empresas.find(c => c.empresa_id === e.empresa_id)?.empresa_nome;
      if (!name) continue;
      const id = hash(`grupo:${key(name)}`).slice(0, 24);
      const index = pool[period].findIndex(c => c.empresa_id === id);
      if (index >= 0 && !overwrite) continue;
      const state = { empresa_id: id, empresa_nome: name, plano_acao: e.plano_acao,
        candidatos_revisao: (e.candidatos_revisao ?? []).filter(c => c.revisado_em || c.confirmado).map(({ registros, ...c }) => c) };
      if (index >= 0) pool[period][index] = state; else pool[period].push(state);
    }
  }
}

export function restoreDecisions(result, pool, keepDeterministicPlan = true) {
  for (const e of result.empresas) {
    const previous = pool[result.periodo_referencia]?.find(c => c.empresa_id === e.empresa_id);
    if (!previous) continue;
    const choices = new Map((previous.candidatos_revisao ?? []).map(c => [`${c.indicador_id}:${c.cnpj}`, c]));
    for (const c of e.candidatos_revisao) {
      const choice = choices.get(`${c.indicador_id}:${c.cnpj}`);
      if (!choice) continue;
      for (const field of ['confirmado', 'prioridade', 'motivo_tratativa', 'acao_recomendada', 'origem_classificacao', 'revisado_em']) if (choice[field] !== undefined) c[field] = choice[field];
    }
    e.cnpjs_para_tratativa = e.candidatos_revisao.filter(c => c.confirmado);
    e.resumo_qsc.total_cnpjs_para_tratativa = new Set(e.cnpjs_para_tratativa.map(c => c.cnpj)).size;
    if (previous.plano_acao && (keepDeterministicPlan || !previous.plano_acao.origem?.startsWith('Resumo determinístico'))) e.plano_acao = previous.plano_acao;
  }
}

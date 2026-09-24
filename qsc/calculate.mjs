import { calculateQscSnapshot, METRICS, matchesSuffix, matchesSubIndicator } from './rules.mjs';
import { hash } from '../ingestion/csv.mjs';

// A evidência completa continua nos registros internos. A visão analítica precisa de
// uma amostra navegável, sobretudo para a carteira, que pode ter milhões de linhas.
const MAX_EVIDENCE_PER_INDICATOR = 5000;
const MAX_CANDIDATES_PER_INDICATOR = 5000;

export function rating(note) {
  if (note === null) return { nota: null, faixa: null, pontos: null };
  const band = note >= 90 ? 5 : note >= 80 ? 4 : note >= 70 ? 3 : note >= 60 ? 2 : note >= 50 ? 1 : 0;
  return { nota: note, faixa: band, pontos: band * 200 };
}
const total = points => points.length ? points.reduce((a, b) => a + b, 0) : null;
function selected(record, selector, detail = false) {
  return matchesSuffix(detail ? record.movementDetail : record.movement, detail ? selector.detail : selector.movement) && matchesSubIndicator(record.subIndicator, selector.subIndicators);
}
export function calculate(input, period) {
  const { records, issues, sources } = input;
  const periods = [...new Set(records.map(r => r.competence))].sort();
  period ??= periods.at(-1);
  if (!period || !periods.includes(period)) throw new Error('Nenhum registro válido para a competência solicitada.');
  const partners = [...new Map(records.map(r => [r.partnerId, { id: r.partnerId, name: r.partnerName, document: r.partnerDocument }])).values()];
  const recordsByPartner = new Map();
  for (const record of records) {
    const own = recordsByPartner.get(record.partnerId) ?? [];
    own.push(record); recordsByPartner.set(record.partnerId, own);
  }
  const empresas = partners.map(partner => {
    const own = recordsByPartner.get(partner.id);
    // Usa o mesmo motor oficial sobre uma partição já isolada. O escopo __all__
    // contém somente esta empresa, evitando varrer todas as demais a cada cálculo.
    const scope = calculateQscSnapshot({ movements: own, details: own, partners: [], competencies: periods }).scopes[0];
    const companyRecords = own.filter(r => r.competence === period);
    const indicadores = scope.metrics.filter(m => m.latest.competence === period).map(m => {
      const def = METRICS.find(d => d.id === m.id), p = m.latest;
      const maximum = Math.max(...m.scoreRules.map(r => r.score));
      const best = m.scoreRules.filter(r => r.score === maximum);
      // Dúvida documentada: o MD define faixas, não metas contratuais nem pesos extras.
      // "meta" é apenas o limiar da melhor pontuação; sem limiar único (Aceite em agosto) fica nula.
      const meta = best.length === 1 ? (m.favorableDirection === 'up' ? best[0].start : best[0].end) : null;
      const evidence = companyRecords.filter(r => r.domain === m.domain && (selected(r, def.numerator) || selected(r, def.denominator) || (def.subtractDetail && selected(r, def.subtractDetail, true))));
      const evidenceSample = evidence.slice(0, MAX_EVIDENCE_PER_INDICATOR);
      return { id: m.id, dominio: m.domain, nome: m.label, formula: m.formula, valor: p.value === null ? null : p.value * 100,
        meta, meta_operador: meta === null ? null : m.favorableDirection === 'up' ? '>=' : '<', desvio: meta === null || p.value === null ? null : p.value * 100 - meta,
        status: p.score === null ? 'Sem dados calculáveis' : p.score < maximum ? 'Abaixo da pontuação máxima' : 'Pontuação máxima',
        peso: maximum, pontos: p.score, faixa: p.scoreBand, impacto_no_qsc: p.score === null ? null : maximum - p.score,
        numerador: p.numerator, denominador: p.denominator, disponivel: p.available, zero_park: p.zeroPark, regras_pontos: m.scoreRules,
        historico: scope.metrics.filter(point => point.id === m.id && point.latest.competence <= period).slice(-6).map(point => ({
          competencia: point.latest.competence, numerador: point.latest.numerator, denominador: point.latest.denominator,
          valor: point.latest.value === null ? null : point.latest.value * 100, pontos: point.latest.score,
          faixa: point.latest.scoreBand, maximo: Math.max(...point.scoreRules.map(rule => rule.score)),
        })),
        rastreabilidade: evidenceSample.map(r => r.id), rastreabilidade_total: evidence.length };
    });
    const dominios = ['carteira', 'fixa', 'movel'].map(dominio => {
      const own = indicadores.filter(i => i.dominio === dominio);
      const points = own.flatMap(i => i.pontos === null ? [] : [i.pontos]);
      const score = rating(total(points));
      return { dominio, ...score, barra_nota: score.nota === null ? 0 : Math.max(0, Math.min(100, score.nota)),
        indicadores_calculados: points.length, indicadores_esperados: own.length, parcial: points.length < own.length };
    });
    const gaps = indicadores.filter(i => i.impacto_no_qsc > 0).sort((a, b) => b.impacto_no_qsc - a.impacto_no_qsc).map(i => ({
      criterio: i.nome, indicador_id: i.id, descricao: `${i.pontos} de ${i.peso} pontos; diferença de ${i.impacto_no_qsc} pontos para o máximo.`, impacto: i.impacto_no_qsc,
      prioridade: 'Não definida no MD',
    }));
    // O MD não define causalidade ou prioridade individual por CNPJ. Todos os registros
    // vinculados ao indicador com gap são evidências para revisão, não condenações automáticas.
    const candidates = [];
    for (const gap of gaps) {
      const ind = indicadores.find(i => i.id === gap.indicador_id);
      const groups = new Map();
      const evidenceIds = new Set(ind.rastreabilidade);
      for (const r of companyRecords.filter(r => r.clientCnpj && evidenceIds.has(r.id))) {
        const group = groups.get(r.clientCnpj) ?? [];
        group.push(r); groups.set(r.clientCnpj, group);
      }
      let candidateCount = 0;
      for (const [cnpj, rs] of groups) {
        if (candidateCount++ >= MAX_CANDIDATES_PER_INDICATOR) break;
        candidates.push({ id: hash(`${partner.id}:${period}:${ind.id}:${cnpj}`).slice(0, 24), cnpj,
        razao_social: rs.find(r => r.clientName)?.clientName || '', criterio_afetado: ind.nome, indicador_id: ind.id,
        motivo_tratativa: 'Registro vinculado a indicador com gap. Necessidade de ação individual depende de revisão.',
        prioridade: 'Não definida', acao_recomendada: 'Conferir os movimentos e validar a necessidade de tratativa.',
        confirmado: false, origem_classificacao: 'Pendente de revisão humana', registros: rs.map(r => r.id) });
      }
    }
    const history = periods.map(competencia => ({ competencia, dominios: ['carteira', 'fixa', 'movel'].map(dominio => ({ dominio,
      ...rating(total(scope.metrics.filter(m => m.domain === dominio && m.latest.competence === competencia && m.latest.score !== null).map(m => m.latest.score))) })) }));
    const semestres = [1, 2].map(semestre => ({ semestre, ano: period.slice(0, 4), dominios: ['carteira', 'fixa', 'movel'].map(dominio => {
      const notes = history.filter(h => h.competencia.startsWith(period.slice(0, 4)) && (Number(h.competencia.slice(5)) <= 6 ? 1 : 2) === semestre)
        .map(h => h.dominios.find(d => d.dominio === dominio).nota).filter(n => n !== null);
      return { dominio, meses_disponiveis: notes.length, ...rating(notes.length ? Math.round(total(notes) / notes.length) : null) };
    }) }));
    const distinct = new Set(companyRecords.map(r => r.clientCnpj).filter(Boolean)).size;
    return { empresa_id: partner.id, empresa_nome: partner.name, cnpj_empresa: partner.document,
      // Não existe fórmula de QSC geral nem definição de total de clientes na base agregada.
      resumo_qsc: { qsc_geral: null, status: 'Consultar os três QSCs; regra geral não definida', total_clientes: null, total_cnpjs_analisados: distinct,
        total_cnpjs_para_tratativa: 0, total_cnpjs_para_revisao: new Set(candidates.map(c => c.cnpj)).size, registros_sem_cnpj: companyRecords.filter(r => !r.clientCnpj).length },
      resumo_exibicao: { gaps_total: gaps.length, indicadores_calculaveis: indicadores.filter(i => i.pontos !== null).length,
        indicadores_total: indicadores.length, notas_disponiveis: dominios.filter(d => d.nota !== null).length, notas_total: dominios.length },
      painel_semestral: semestres.map(s => {
        const competencias = Array.from({ length: 6 }, (_, index) => `${s.ano}-${String((s.semestre === 1 ? 1 : 7) + index).padStart(2, '0')}`);
        return { semestre: s.semestre, ano: s.ano, competencias, dominios: s.dominios.map(d => ({ ...d,
          meses: competencias.map(competencia => ({ competencia, ...rating(history.find(h => h.competencia === competencia)?.dominios.find(item => item.dominio === d.dominio)?.nota ?? null) })),
        })) };
      }),
      dominios, indicadores, principais_gaps: gaps, cnpjs_para_tratativa: [],
      candidatos_revisao: candidates.map(c => ({ ...c, registros_total: c.registros.length })), historico: history, semestres,
      plano_acao: { origem: 'Resumo determinístico; IA não gerada', diagnostico: `${gaps.length} indicadores com diferença para a pontuação máxima. Conferir a completude das bases antes de definir ações.`,
        acoes_prioritarias: gaps.map(g => ({ acao: `Revisar ${g.criterio}`, justificativa: g.descricao, responsavel_sugerido: 'A definir pela gestão', prazo_sugerido: 'A definir pela gestão', impacto_esperado: 'Validar causas e oportunidades; recuperação de pontos não garantida.' })),
        resumo_executivo: `${gaps.length} gaps identificados. A classificação dos CNPJs requer validação humana porque não consta nas regras oficiais.` },
    };
  });
  return { schema_version: '1.0', periodo_referencia: period, periodos_disponiveis: periods, data_processamento: new Date().toISOString(),
    fontes_regras: ['CONTEXTO_QSC.md', 'CALCULO_QSC_CSV.md'], empresas, importacao: { fontes: sources, ocorrencias: issues }, registros: records };
}

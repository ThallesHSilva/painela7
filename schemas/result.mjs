import Ajv from 'ajv';
const nullableNumber = { type: ['number', 'null'] };
const action = { type: 'object', additionalProperties: false, required: ['acao', 'justificativa', 'responsavel_sugerido', 'prazo_sugerido', 'impacto_esperado'],
  properties: Object.fromEntries(['acao', 'justificativa', 'responsavel_sugerido', 'prazo_sugerido', 'impacto_esperado'].map(k => [k, { type: 'string' }])) };
export const planSchema = { type: 'object', additionalProperties: false, required: ['diagnostico', 'acoes_prioritarias', 'resumo_executivo'], properties: {
  diagnostico: { type: 'string' }, acoes_prioritarias: { type: 'array', items: action }, resumo_executivo: { type: 'string' } } };
export const resultSchema = { type: 'object', required: ['schema_version', 'periodo_referencia', 'data_processamento', 'empresas', 'importacao', 'registros'], properties: {
  schema_version: { const: '1.0' }, periodo_referencia: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }, data_processamento: { type: 'string' },
  empresas: { type: 'array', items: { type: 'object', required: ['empresa_id', 'empresa_nome', 'resumo_qsc', 'indicadores', 'principais_gaps', 'cnpjs_para_tratativa', 'plano_acao'], properties: {
    empresa_id: { type: 'string' }, empresa_nome: { type: 'string' }, resumo_qsc: { type: 'object', required: ['qsc_geral', 'total_cnpjs_analisados'], properties: { qsc_geral: nullableNumber, total_cnpjs_analisados: { type: 'integer', minimum: 0 } } },
    indicadores: { type: 'array', items: { type: 'object', required: ['nome', 'valor', 'pontos', 'numerador', 'denominador', 'rastreabilidade'], properties: { nome: { type: 'string' }, valor: nullableNumber, pontos: nullableNumber, numerador: { type: 'number' }, denominador: { type: 'number' } } } },
    principais_gaps: { type: 'array' }, cnpjs_para_tratativa: { type: 'array', items: { type: 'object', required: ['cnpj', 'criterio_afetado'], properties: { cnpj: { type: 'string', pattern: '^\\d{14}$' } } } }, plano_acao: { type: 'object' }
  } } }, importacao: { type: 'object' }, registros: { type: 'array' }
} };
const ajv = new Ajv({ allErrors: true });
export const validatePlan = ajv.compile(planSchema);
export const validateResult = ajv.compile(resultSchema);
export function assertResult(value) { if (!validateResult(value)) throw new Error(`JSON inválido: ${ajv.errorsText(validateResult.errors)}`); return value; }

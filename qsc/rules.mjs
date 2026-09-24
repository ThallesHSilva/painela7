function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/[^A-Z0-9%]+/g, " ")
    .trim();
}

function matchesSuffix(value, target) {
  const sourceKey = normalize(value);
  const targetKey = normalize(target);
  return sourceKey === targetKey || sourceKey.endsWith(` ${targetKey}`);
}

function matchesSubIndicator(value, targets) {
  if (!targets?.length) return true;
  const sourceKey = normalize(value);
  return targets.some((target) => sourceKey === normalize(target));
}

function inScope(record, scopeId) {
  return scopeId === "__all__" || record.partnerId === scopeId;
}

function movementValue(records, competence, scopeId, selector) {
  const matches = records.filter(
    (record) =>
      record.competence === competence &&
      inScope(record, scopeId) &&
      (!selector.domain || record.domain === selector.domain) &&
      matchesSuffix(record.movement, selector.movement) &&
      matchesSubIndicator(record.subIndicator, selector.subIndicators),
  );
  const field = selector.measure === "rows" ? "rows" : "quantity";
  return {
    value: matches.reduce((total, record) => total + record[field], 0),
    found: matches.length > 0,
  };
}

function detailValue(records, competence, scopeId, selector) {
  const matches = records.filter(
    (record) =>
      record.competence === competence &&
      inScope(record, scopeId) &&
      (!selector.domain || record.domain === selector.domain) &&
      matchesSuffix(record.movementDetail, selector.detail) &&
      matchesSubIndicator(record.subIndicator, selector.subIndicators),
  );
  const field = selector.measure === "rows" ? "rows" : "quantity";
  return matches.reduce((total, record) => total + record[field], 0);
}

const ranges = (...values) =>
  values.map(([start, end, score, band]) => ({ start, end, score, band: String(band) }));

const ACEITE_DEFAULT_SCORE_RULES = ranges(
  [0, 85, 0, 4],
  [85, 90, 10, 3],
  [90, 95, 14, 2],
  [95, 100, 20, 1],
);
const ACEITE_AUGUST_SCORE_RULES = ranges(
  [0, 85, 20, 4],
  [85, 90, 20, 3],
  [90, 95, 20, 2],
  [95, 100, 20, 1],
);

function scoreRulesFor(definition, competence) {
  if (definition.id !== "aceite-digital") return definition.scoreRules;
  const value = String(competence ?? "").trim().toUpperCase();
  const isAugust = /(?:^|[-/])0?8(?:$|[-/])/.test(value) || /\b(?:AGO|AGOSTO)\b/.test(value);
  return isAugust ? ACEITE_AUGUST_SCORE_RULES : ACEITE_DEFAULT_SCORE_RULES;
}

function scoreMetric(value, scoreRules) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { score: null, scoreBand: null };
  }

  const percentage = value * 100;
  const matchingRule = scoreRules.find(
    (rule, index) =>
      percentage >= rule.start && (index === scoreRules.length - 1 || percentage < rule.end),
  );

  return {
    score: matchingRule?.score ?? null,
    scoreBand: matchingRule?.band ?? null,
  };
}

const METRICS = [
  {
    id: "churn-movel",
    domain: "carteira",
    label: "Churn Móvel",
    formula: "(CHURN − reabilitações) ÷ parque médio móvel",
    interpretation: "Perda líquida de linhas móveis sobre o parque médio.",
    favorableDirection: "down",
    scoreRules: ranges([0, 0.8, 10, 1], [0.8, 1.1, 7, 2], [1.1, 1.4, 5, 3], [1.4, 100, 0, 4]),
    numerator: { movement: "CHURN", subIndicators: ["Churn Movel"] },
    subtractDetail: { detail: "REABILITACAO", subIndicators: ["Churn Movel"] },
    denominator: { movement: "PARQUE MOVEL" },
  },
  {
    id: "fidelizacao-movel",
    domain: "carteira",
    label: "Parque Fidelizado Móvel",
    formula: "PARQUE FIDELIZADO M17 ÷ PARQUE MOVEL",
    interpretation: "Participação das linhas com menos de 17 meses de fidelização.",
    favorableDirection: "up",
    scoreRules: ranges([0, 75, 0, 4], [75, 80, 10, 3], [80, 85, 14, 2], [85, 100, 20, 1]),
    numerator: { movement: "PARQUE FIDELIZADO M17", subIndicators: ["Fidelizacao Movel"] },
    denominator: { movement: "PARQUE MOVEL", subIndicators: ["Churn/Fidelizacao Movel"] },
  },
  {
    id: "churn-bl",
    domain: "carteira",
    label: "Churn Banda Larga",
    formula: "CHURN ÷ PARQUE BL",
    interpretation: "Documentos com baixa de banda larga sobre o parque ativo de BL.",
    favorableDirection: "down",
    scoreRules: ranges([0, 1.4, 20, 1], [1.4, 1.7, 14, 2], [1.7, 2, 10, 3], [2, 100, 0, 4]),
    numerator: { movement: "CHURN", subIndicators: ["% Churn Banda Larga"] },
    denominator: { movement: "PARQUE BL", subIndicators: ["% Churn Banda Larga"] },
  },
  {
    id: "invasao-carteira",
    domain: "carteira",
    label: "Invasão de Carteira",
    formula: "CLIENTE INVADIDO ÷ ALTA CARTEIRA",
    interpretation: "Altas realizadas por outros canais dentro da carteira do parceiro.",
    favorableDirection: "down",
    scoreRules: ranges([0, 10, 25, 1], [10, 20, 20, 2], [20, 25, 15, 3], [25, 100, 0, 4]),
    numerator: { movement: "CLIENTE INVADIDO", subIndicators: ["% Invasao de Carteira"] },
    denominator: { movement: "ALTA CARTEIRA", subIndicators: ["% Invasao de Carteira"] },
  },
  {
    id: "car",
    domain: "carteira",
    label: "Contas a Receber (CAR)",
    formula: "CLIENTE COM CAR ACIMA DE 30 DIAS ÷ CNPJ",
    interpretation: "Clientes ativos com débitos vencidos há 30 dias ou mais.",
    favorableDirection: "down",
    scoreRules: ranges([0, 15, 10, 1], [15, 20, 7, 2], [20, 25, 5, 3], [25, 100, 0, 4]),
    numerator: {
      movement: "CLIENTE COM CAR ACIMA DE 30 DIAS",
      subIndicators: ["% Documentos com CAR"],
    },
    denominator: { movement: "CNPJ", subIndicators: ["% Documentos com CAR"] },
  },
  {
    id: "debito-automatico",
    domain: "carteira",
    label: "Parque com Débito Automático",
    formula: "documentos SIM ÷ (documentos SIM + NÃO)",
    interpretation: "Adoção do débito automático entre os clientes avaliados.",
    favorableDirection: "up",
    scoreRules: ranges([0, 15, 0, 4], [15, 20, 1, 3], [20, 25, 3, 2], [25, 100, 5, 1]),
    numerator: {
      movement: "SIM",
      subIndicators: ["Parque com Debito Automatico"],
      measure: "rows",
    },
    denominator: {
      movement: "NAO",
      subIndicators: ["Parque com Debito Automatico"],
      measure: "rows",
    },
    denominatorMode: "plus-numerator",
  },
  {
    id: "biometria",
    domain: "carteira",
    label: "Parque Biometrado",
    formula: "CLIENTE BIOMETRADO ÷ (BIOMETRADO + POTENCIAL)",
    interpretation: "Clientes com biometria cadastrada sobre toda a carteira avaliada.",
    favorableDirection: "up",
    scoreRules: ranges([0, 40, 0, 4], [40, 50, 5, 3], [50, 60, 7, 2], [60, 100, 10, 1]),
    numerator: {
      movement: "CLIENTE BIOMETRADO",
      subIndicators: ["Parque Biometrado"],
    },
    denominator: {
      movement: "CLIENTE POTENCIAL",
      subIndicators: ["Parque Biometrado"],
    },
    denominatorMode: "plus-numerator",
  },
  {
    id: "aproveitamento-carteira",
    domain: "carteira",
    label: "Aproveitamento de Carteira",
    formula: "Alta do Potencial ÷ Quantidade Potencial",
    interpretation: "Conversão das altas originadas do potencial disponível na carteira.",
    favorableDirection: "up",
    scoreRules: ranges([0, 5, 0, 4], [5, 7, 1, 3], [7, 10, 3, 2], [10, 100, 5, 1]),
    numerator: { movement: "ALTA DO POTENCIAL", subIndicators: ["Aproveitamento Carteira"] },
    denominator: { movement: "QUANTIDADE POTENCIAL", subIndicators: ["Aproveitamento Carteira"] },
  },
  {
    id: "re-alta-fixa",
    domain: "fixa",
    label: "Re-Alta",
    formula: "RE-ALTA ≤ 270 dias ÷ ALTAS M0",
    interpretation: "Recorrência de altas de fixa dentro da janela de 270 dias.",
    favorableDirection: "down",
    scoreRules: ranges([0, 2, 15, 1], [2, 3, 10, 2], [3, 4, 7, 3], [4, 100, 0, 4]),
    numerator: { movement: "RE-ALTA", subIndicators: ["Re-alta"] },
    denominator: { movement: "ALTAS", subIndicators: ["Re-alta"] },
  },
  {
    id: "early-churn-fixa",
    domain: "fixa",
    label: "Early Churn Banda Larga",
    formula: "BAIXAS PREMATURAS ÷ (BAIXAS PREMATURAS + ALTAS SAFRA M-9)",
    interpretation: "Baixas voluntárias M6 e involuntárias M9 da safra de banda larga.",
    favorableDirection: "down",
    scoreRules: ranges([0, 10, 20, 1], [10, 12.5, 14, 2], [12.5, 17.5, 10, 3], [17.5, 100, 0, 4]),
    numerator: { movement: "BAIXAS PREMATURAS", subIndicators: ["Early Churn Fixa"] },
    denominator: { movement: "ALTAS SAFRA M-9", subIndicators: ["Early Churn Fixa"] },
    denominatorMode: "plus-numerator",
  },
  {
    id: "totalizacao-fixa",
    domain: "fixa",
    label: "Totalização Altas Fixa Básica",
    formula: "CLIENTE TOTALIZADO ÷ (TOTALIZADO + POTENCIAL)",
    interpretation: "Clientes com alta de fixa dentro do universo com potencial de totalização.",
    favorableDirection: "up",
    scoreRules: ranges([0, 10, 0, 4], [10, 15, 10, 3], [15, 20, 14, 2], [20, 100, 20, 1]),
    numerator: {
      movement: "CLIENTE TOTALIZADO",
      subIndicators: ["Totalizacao Altas Fixa Basica"],
    },
    denominator: {
      movement: "CLIENTE POTENCIAL",
      subIndicators: ["Totalizacao Altas Fixa Basica"],
    },
    denominatorMode: "plus-numerator",
  },
  {
    id: "digitalizacao-fixa",
    domain: "fixa",
    label: "Digitalização Altas Fixa Básica",
    formula: "CLIENTE DIGITALIZADO ÷ (CLIENTE POTENCIAL − DIGITALIZADO)",
    interpretation: "Adoção de banda larga com serviços digitais dentro do potencial remanescente.",
    favorableDirection: "up",
    scoreRules: ranges([0, 2, 0, 4], [2, 4, 1, 3], [4, 6, 3, 2], [6, 100, 5, 1]),
    numerator: {
      movement: "CLIENTE DIGITALIZADO",
      subIndicators: ["Digitalizacao Altas (Fixa Basica + Servicos Digitais)"],
    },
    denominator: {
      movement: "CLIENTE POTENCIAL",
      subIndicators: ["Digitalizacao Altas (Fixa Basica + Servicos Digitais)"],
    },
    denominatorMode: "minus-numerator",
  },
  {
    id: "tfp-fixa",
    domain: "fixa",
    label: "TFP Banda Larga",
    formula: "FATURA PAGA ÷ (FATURA PAGA + CLIENTE SAFRA)",
    interpretation: "Clientes que pagaram as três primeiras faturas de banda larga.",
    favorableDirection: "up",
    scoreRules: ranges([0, 80, 0, 4], [80, 85, 10, 3], [85, 90, 14, 2], [90, 100, 20, 1]),
    numerator: {
      movement: "CLIENTE COM FATURA PAGA",
      subIndicators: ["TFP"],
    },
    denominator: { movement: "CLIENTE SAFRA", subIndicators: ["TFP"] },
    denominatorMode: "plus-numerator",
  },
  {
    id: "aceite-digital",
    domain: "fixa",
    label: "Aceite Digital",
    formula: "ACEITE VÁLIDO ÷ (ACEITE VÁLIDO + ATIVAÇÃO CLIENTE)",
    interpretation: "BLs ativadas com aceite digital válido.",
    favorableDirection: "up",
    scoreRules: ACEITE_DEFAULT_SCORE_RULES,
    numerator: {
      movement: "ACEITE VALIDO",
      subIndicators: ["Qualidade Aceite"],
    },
    denominator: {
      movement: "ATIVACAO CLIENTE",
      subIndicators: ["Qualidade Aceite"],
    },
    denominatorMode: "plus-numerator",
  },
  {
    id: "early-churn-movel",
    domain: "movel",
    label: "Early Churn Móvel",
    formula: "BAIXAS PREMATURAS ÷ ALTAS SAFRA M-9",
    interpretation: "Baixas voluntárias M6 e involuntárias M9 da safra móvel.",
    favorableDirection: "down",
    scoreRules: ranges([0, 10, 30, 1], [10, 15, 23, 2], [15, 20, 18, 3], [20, 100, 0, 4]),
    numerator: { movement: "BAIXAS PREMATURAS", subIndicators: ["Early Churn Movel"] },
    denominator: { movement: "ALTAS SAFRA M-9", subIndicators: ["Early Churn Movel"] },
  },
  {
    id: "saldo-portabilidade",
    domain: "movel",
    label: "Saldo de Portabilidade / Altas",
    formula: "SALDO DE PORTABILIDADE ÷ ALTAS",
    interpretation: "Peso do saldo líquido de portabilidade no total de altas móveis.",
    favorableDirection: "up",
    scoreRules: ranges([-100000, 0, -10, 4], [0, 25, 0, 3], [25, 50, 14, 2], [50, 100, 20, 1]),
    numerator: {
      movement: "SALDO DE PORTABILIDADE",
      subIndicators: ["Saldo de Portabilidade/Altas"],
    },
    denominator: { movement: "ALTAS", subIndicators: ["Saldo de Portabilidade/Altas"] },
  },
  {
    id: "totalizacao-movel",
    domain: "movel",
    label: "Totalização Altas Móvel",
    formula: "CLIENTE TOTALIZADO ÷ (TOTALIZADO + POTENCIAL)",
    interpretation: "Clientes com alta móvel e parque na fixa dentro do universo potencial.",
    favorableDirection: "up",
    scoreRules: ranges([0, 25, 0, 4], [25, 40, 7, 3], [40, 50, 10, 2], [50, 100, 15, 1]),
    numerator: {
      movement: "CLIENTE TOTALIZADO",
      subIndicators: ["% Totalizacao Altas Movel"],
    },
    denominator: {
      movement: "CLIENTE POTENCIAL",
      subIndicators: ["% Totalizacao Altas Movel"],
    },
    denominatorMode: "plus-numerator",
  },
  {
    id: "digitalizacao-movel",
    domain: "movel",
    label: "Digitalização Altas Móvel",
    formula: "ALTA DIGITALIZADA ÷ (CLIENTE POTENCIAL − DIGITALIZADO)",
    interpretation: "Altas móveis com serviços digitais sobre o potencial remanescente.",
    favorableDirection: "up",
    scoreRules: ranges([0, 4, 0, 4], [4, 6, 7, 3], [6, 8, 10, 2], [8, 100, 15, 1]),
    numerator: {
      movement: "ALTA DIGITALIZADA",
      subIndicators: ["% Digitalizacao Altas (Movel + Servicos Digitais)"],
    },
    denominator: {
      movement: "CLIENTE POTENCIAL",
      subIndicators: ["% Digitalizacao Altas (Movel + Servicos Digitais)"],
    },
    denominatorMode: "minus-numerator",
  },
  {
    id: "tfp-movel",
    domain: "movel",
    label: "TFP Móvel",
    formula: "FATURA PAGA ÷ (FATURA PAGA + CLIENTE SAFRA)",
    interpretation: "Clientes móveis que pagaram as três primeiras faturas.",
    favorableDirection: "up",
    scoreRules: ranges([0, 80, 0, 4], [80, 85, 10, 3], [85, 90, 14, 2], [90, 100, 20, 1]),
    numerator: {
      movement: "CLIENTE COM FATURA PAGA",
      subIndicators: ["TFP"],
    },
    denominator: { movement: "CLIENTE SAFRA", subIndicators: ["TFP"] },
    denominatorMode: "plus-numerator",
  },
];

function calculateMetric(definition, movements, details, competence, scopeId) {
  const numeratorSelector = { ...definition.numerator, domain: definition.domain };
  const denominatorSelector = { ...definition.denominator, domain: definition.domain };
  const numeratorBase = movementValue(movements, competence, scopeId, numeratorSelector);
  const subtraction = definition.subtractDetail
    ? detailValue(details, competence, scopeId, {
        ...definition.subtractDetail,
        domain: definition.domain,
      })
    : 0;
  const numerator = numeratorBase.value - subtraction;
  const denominatorBase = movementValue(movements, competence, scopeId, denominatorSelector);
  let denominator = denominatorBase.value;

  if (definition.denominatorMode === "plus-numerator") denominator += numerator;
  if (definition.denominatorMode === "minus-numerator") {
    denominator = Math.max(0, denominator - numerator);
  }

  const available = numeratorBase.found || denominatorBase.found;
  const value = available && denominator > 0 ? numerator / denominator : null;
  const effectiveScoreRules = scoreRulesFor(definition, competence);
  return {
    ...definition,
    scoreRules: effectiveScoreRules,
    numerator: undefined,
    denominator: undefined,
    denominatorMode: undefined,
    subtractDetail: undefined,
    latest: {
      competence,
      value,
      numerator,
      denominator,
      available,
      zeroPark: available && numerator === 0 && denominator === 0,
      ...scoreMetric(value, effectiveScoreRules),
    },
  };
}

export function calculateQscSnapshot({ movements, details, partners, competencies }) {
  const scopes = [
    {
      id: "__all__",
      name: "Todos os parceiros",
      partnerIds: partners.map((partner) => partner.id),
    },
    ...partners.map((partner) => ({
      id: partner.id,
      name: partner.name,
      partnerIds: [partner.id],
    })),
  ];

  const calculatedScopes = scopes.map((scope) => {
    const scopeRows = Object.fromEntries(
      competencies.map((competence) => [
        competence,
        movements
          .filter((record) => record.competence === competence && inScope(record, scope.id))
          .reduce((total, record) => total + record.rows, 0),
      ]),
    );
    return {
      ...scope,
      rowsByCompetence: scopeRows,
      metrics: competencies.flatMap((competence) =>
        METRICS.map((definition) =>
          calculateMetric(definition, movements, details, competence, scope.id),
        ),
      ),
    };
  });

  return { scopes: calculatedScopes, metricCount: METRICS.length };
}

export { METRICS, normalize, matchesSuffix, matchesSubIndicator };

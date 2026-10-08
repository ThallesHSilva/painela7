export const QUARTIL_METRICS = ['receita', 'movel', 'ftth'];

export const QUARTIL_LABELS = {
  receita: 'Receita',
  movel: 'Móvel',
  ftth: 'FTTH',
};

// A planilha separa consultores acima e abaixo de três meses de casa.
// Os limites são expressos como intervalos para manter a regra sem sobreposição.
export const QUARTIL_RULES = {
  experienced: {
    label: 'Acima de 3 meses',
    metrics: {
      receita: [
        { label: 'Acima de R$ 2.250', min: 2250, minExclusive: true },
        { label: 'R$ 1.401 a R$ 2.250', min: 1400, minExclusive: true, max: 2250 },
        { label: 'R$ 801 a R$ 1.400', min: 800, minExclusive: true, max: 1400 },
        { label: 'R$ 500 a R$ 800', min: 500, max: 800 },
        { label: 'Abaixo de R$ 500', max: 500, maxExclusive: true },
      ],
      movel: [
        { label: 'Acima de 25', min: 25, minExclusive: true },
        { label: '16 a 25', min: 15, minExclusive: true, max: 25 },
        { label: '11 a 15', min: 10, minExclusive: true, max: 15 },
        { label: '6 a 10', min: 5, minExclusive: true, max: 10 },
        { label: '0 a 5', max: 5 },
      ],
      ftth: [
        { label: 'Acima de 10', min: 10, minExclusive: true },
        { label: '6 a 10', min: 5, minExclusive: true, max: 10 },
        { label: '3 a 5', min: 2, minExclusive: true, max: 5 },
        { label: '1 a 2', min: 0, minExclusive: true, max: 2 },
        { label: '0', max: 0 },
      ],
    },
  },
  new: {
    label: 'Abaixo de 3 meses',
    metrics: {
      receita: [
        { label: 'R$ 500 ou mais', min: 500 },
        { label: 'R$ 251 a R$ 499', min: 250, minExclusive: true, max: 500, maxExclusive: true },
        { label: 'R$ 101 a R$ 250', min: 100, minExclusive: true, max: 250 },
        { label: 'Acima de R$ 0 até R$ 100', min: 0, minExclusive: true, max: 100 },
        { label: '0', max: 0 },
      ],
      movel: [
        { label: 'Acima de 15', min: 15, minExclusive: true },
        { label: '11 a 15', min: 10, minExclusive: true, max: 15 },
        { label: '6 a 10', min: 5, minExclusive: true, max: 10 },
        { label: 'Acima de 0 até 5', min: 0, minExclusive: true, max: 5 },
        { label: '0', max: 0 },
      ],
      ftth: [
        { label: 'Acima de 10', min: 10, minExclusive: true },
        { label: '6 a 9', min: 5, minExclusive: true, max: 9 },
        { label: '3 a 5', min: 2, minExclusive: true, max: 5 },
        { label: '2', min: 2, max: 2 },
        { label: '0', max: 0 },
      ],
    },
  },
};

const matches = (value, range) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return false;
  const numeric = Number(value);
  const minOk = range.min === undefined ? true : range.minExclusive ? numeric > range.min : numeric >= range.min;
  const maxOk = range.max === undefined ? true : range.maxExclusive ? numeric < range.max : numeric <= range.max;
  return minOk && maxOk;
};

export function quartileFor(tenure, metric, value) {
  const ranges = QUARTIL_RULES[tenure === 'new' ? 'new' : 'experienced']?.metrics?.[metric] ?? [];
  const index = ranges.findIndex(range => matches(value, range));
  return index === -1 ? null : index + 1;
}

export function quartilesFor(consultant, point = consultant) {
  return Object.fromEntries(QUARTIL_METRICS.map(metric => [metric, quartileFor(consultant.tenure, metric, point?.values?.[metric])]));
}

export function alertFor(consultant) {
  const history = consultant?.history?.length ? consultant.history : [consultant];
  let consecutive = 0;
  for (const point of history) {
    const quartiles = point.quartiles ?? quartilesFor(consultant, point);
    if (QUARTIL_METRICS.some(metric => quartiles?.[metric] === 5)) consecutive += 1;
    else consecutive = 0;
  }
  const latest = history.at(-1) ?? consultant;
  const quartiles = latest?.quartiles ?? quartilesFor(consultant, latest);
  const metrics = QUARTIL_METRICS.filter(metric => quartiles?.[metric] === 5);
  return { active: metrics.length > 0 && consecutive > 3, months: consecutive, metrics };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertFor, quartileFor } from '../frontend/quartil-rules.js';

test('aplica as faixas da planilha sem sobreposição', () => {
  assert.equal(quartileFor('experienced', 'receita', 2250), 2);
  assert.equal(quartileFor('experienced', 'receita', 2250.01), 1);
  assert.equal(quartileFor('experienced', 'movel', 5), 5);
  assert.equal(quartileFor('experienced', 'ftth', 0), 5);
  assert.equal(quartileFor('new', 'receita', 0), 5);
  assert.equal(quartileFor('new', 'receita', 100), 4);
  assert.equal(quartileFor('new', 'movel', 15), 2);
  assert.equal(quartileFor('new', 'ftth', 2), 4);
});

test('alerta somente quando o consultor permanece mais de três meses no Q5', () => {
  const point = (quartiles) => ({ quartiles, values: {} });
  const consultant = { tenure: 'experienced', history: [
    point({ receita: 5, movel: 3, ftth: 2 }),
    point({ receita: 5, movel: 3, ftth: 2 }),
    point({ receita: 5, movel: 3, ftth: 2 }),
    point({ receita: 5, movel: 3, ftth: 2 }),
  ] };
  assert.deepEqual(alertFor(consultant), { active: true, months: 4, metrics: ['receita'] });
  assert.equal(alertFor({ ...consultant, history: consultant.history.slice(0, 3) }).active, false);
});

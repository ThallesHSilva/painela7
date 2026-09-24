export const headers = ['INDICADOR', 'SUB_INDICADOR', 'COMPETENCIA', 'GRUPO_REDE_TERMO', 'TIPO_MOVIMENTO', 'QUANTIDADE', 'DETALHE_TIPO_MOVIMENTO', 'CNPJ_PARCEIRO', 'DOCUMENTO_CLIENTE', 'RAZAO_SOCIAL'];
export function csv(rows) { return Buffer.from([headers, ...rows].map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n')); }
export function row(sub, movement, quantity, extra = {}) {
  return ['QSC', sub, extra.period || '2026-09', extra.company || 'Empresa Exemplo', movement, quantity, extra.detail || '', extra.partner || '12345678000190', extra.client || '12345678000101', extra.name || 'Cliente demonstrativo'];
}
export function demoFiles() {
  return [
    { name: 'DEMO-carteira.csv', domain: 'carteira', buffer: csv([
      row('Churn Movel', 'CHURN', 2), row('Churn Movel', 'AJUSTE', 1, { detail: 'REABILITACAO' }), row('Churn/Fidelizacao Movel', 'PARQUE MOVEL', 100), row('Fidelizacao Movel', 'PARQUE FIDELIZADO M17', 82),
      row('% Churn Banda Larga', 'CHURN', 2), row('% Churn Banda Larga', 'PARQUE BL', 100),
      row('% Invasao de Carteira', 'CLIENTE INVADIDO', 12), row('% Invasao de Carteira', 'ALTA CARTEIRA', 100),
      row('% Documentos com CAR', 'CLIENTE COM CAR ACIMA DE 30 DIAS', 21), row('% Documentos com CAR', 'CNPJ', 100),
      row('Parque com Debito Automatico', 'SIM', 500), row('Parque com Debito Automatico', 'NAO', 100),
      row('Parque Biometrado', 'CLIENTE BIOMETRADO', 50), row('Parque Biometrado', 'CLIENTE POTENCIAL', 50),
      row('Aproveitamento Carteira', 'ALTA DO POTENCIAL', 6), row('Aproveitamento Carteira', 'QUANTIDADE POTENCIAL', 100),
      row('Churn Movel', 'CHURN', 0, { company: 'Segunda Empresa', partner: '98765432000100', client: '98765432000111' }),
      row('Churn/Fidelizacao Movel', 'PARQUE MOVEL', 100, { company: 'Segunda Empresa', partner: '98765432000100', client: '98765432000111' }),
      row('Churn Movel', 'CHURN', 0.5, { period: '2026-08' }), row('Churn/Fidelizacao Movel', 'PARQUE MOVEL', 100, { period: '2026-08' }),
    ]) },
    { name: 'DEMO-fixa.csv', domain: 'fixa', buffer: csv([
      row('Re-alta', 'RE-ALTA', 3), row('Re-alta', 'ALTAS', 100), row('Early Churn Fixa', 'BAIXAS PREMATURAS', 11), row('Early Churn Fixa', 'ALTAS SAFRA M-9', 100),
      row('Totalizacao Altas Fixa Basica', 'CLIENTE TOTALIZADO', 15), row('Totalizacao Altas Fixa Basica', 'CLIENTE POTENCIAL', 85),
      row('Digitalizacao Altas (Fixa Basica + Servicos Digitais)', 'CLIENTE DIGITALIZADO', 6), row('Digitalizacao Altas (Fixa Basica + Servicos Digitais)', 'CLIENTE POTENCIAL', 106),
      row('TFP', 'CLIENTE COM FATURA PAGA', 82), row('TFP', 'CLIENTE SAFRA', 18), row('Qualidade Aceite', 'ACEITE VALIDO', 10), row('Qualidade Aceite', 'ATIVACAO CLIENTE', 90)
    ]) },
    { name: 'DEMO-movel.csv', domain: 'movel', buffer: csv([
      row('Early Churn Movel', 'BAIXAS PREMATURAS', 16), row('Early Churn Movel', 'ALTAS SAFRA M-9', 100),
      row('Saldo de Portabilidade/Altas', 'SALDO DE PORTABILIDADE', -5), row('Saldo de Portabilidade/Altas', 'ALTAS', 100),
      row('% Totalizacao Altas Movel', 'CLIENTE TOTALIZADO', 30), row('% Totalizacao Altas Movel', 'CLIENTE POTENCIAL', 70),
      row('% Digitalizacao Altas (Movel + Servicos Digitais)', 'ALTA DIGITALIZADA', 6), row('% Digitalizacao Altas (Movel + Servicos Digitais)', 'CLIENTE POTENCIAL', 106),
      row('TFP', 'CLIENTE COM FATURA PAGA', 90), row('TFP', 'CLIENTE SAFRA', 10)
    ]) }
  ];
}

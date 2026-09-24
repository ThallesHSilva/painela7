import { renderUnified } from './unified.js';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = n => n === null || n === undefined ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
const labels = { carteira: 'Carteira', fixa: 'Fixa', movel: 'Móvel' };
let result, selectedCompany, activeTab = 'indicators', reviewing, config, selectedFiles = [], page = 0, treatmentRequest = 0, searchTimer;
let quartilSnapshot = null, selectedQuartilMetric = 'receita', quartilSearch = '', quartilEvolutionFilter = null, selectedQuartilBand = null, quartilTenureFilter = null, expandedQuartilConsultant = null;
function notice(message, error = false) { $('#notice').hidden = !message; $('#notice').textContent = message; $('#notice').className = error ? 'error' : ''; }
async function api(url, options) { const response = await fetch(url, options); const data = await response.json(); if (!response.ok) { const extra = (data.ocorrencias ?? []).slice(0, 6).map(x => x.mensagem).join(' · '); throw new Error(data.error + (extra ? ` ${extra}` : '')); } return data; }
async function busy(button, work) { const old = button.textContent; button.disabled = true; button.textContent = 'Processando…'; try { await work(); } catch (e) { notice(e.message, true); } finally { button.disabled = false; button.textContent = old; } }
const company = () => result?.empresas.find(e => e.empresa_id === selectedCompany);
const prefix = () => `/api/runs/${result.processamento_id}/company/${selectedCompany}`;
const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const openImport = () => $('#import-dialog').showModal();
function showExecutiveSection(section) {
  const module = section === 'certificacao' ? $('#module-certificacao') : section === 'quartil' ? $('#quartil-live') : null;
  const qscChrome = ['.page-heading', '.history-bar', '#notice'];
  qscChrome.forEach(selector => { const node = $(selector); if (node) node.hidden = section !== 'qsc'; });
  const qscPill = document.querySelector('.topbar .pill');
  if (qscPill) qscPill.hidden = section !== 'qsc';
  $('#dashboard').hidden = section !== 'qsc' || !result;
  $('#empty').hidden = section !== 'qsc' || !!result;
  document.querySelectorAll('.executive-module').forEach(node => { node.hidden = node !== module; });
  document.querySelectorAll('.executive-nav .nav-link').forEach(node => node.classList.toggle('active', node.id === `nav-${section}` || (section === 'qsc' && node.id === 'nav-overview')));
  if (section === 'report' && result) { activeTab = 'report'; renderTabs(); $('#dashboard').hidden = false; }
  if (section === 'quartil') loadQuartil();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function loadQuartil() {
  const target = $('#quartil-content');
  target.innerHTML = '<p class="note">Carregando a base de quartil…</p>';
  try {
    quartilSnapshot = await api('/api/quartil');
    renderQuartil();
  } catch (error) { target.innerHTML = `<div class="module-empty"><strong>Base de quartil indisponível</strong><p>${esc(error.message)}</p></div>`; }
}
function renderQuartil() {
  const data = quartilSnapshot, target = $('#quartil-content');
  const metricLabels = { receita: 'Receita', movel: 'Móvel', ftth: 'FTTH' };
  const fmtMoney = value => value === null || value === undefined ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
  const valueLabel = (metric, value) => metric === 'receita' ? fmtMoney(value) : fmt(value);
  const quartile = value => value === null || value === undefined ? '<span class="quartil-missing">Sem dado</span>' : `<span class="quartil-q q${value}">Q${value}</span>`;
  const score = row => ['receita', 'movel', 'ftth'].reduce((sum, metric) => sum + ({ 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 }[row.quartiles[metric]] || 0), 0);
  const change = (row, months) => row.comparisons?.[months]?.changes?.[selectedQuartilMetric];
  const evolution = value => value === null || value === undefined ? 'Sem histórico' : value > 0 ? 'Evoluiu' : value < 0 ? 'Regrediu' : 'Neutro';
  const filtered = data.consultants.filter(row => !quartilSearch || `${row.name} ${row.partnerName}`.toLocaleLowerCase('pt-BR').includes(quartilSearch)).filter(row => !quartilEvolutionFilter || [3, 6].some(months => evolution(change(row, months)) === quartilEvolutionFilter)).filter(row => !selectedQuartilBand || row.quartiles[selectedQuartilMetric] === selectedQuartilBand).filter(row => !quartilTenureFilter || row.tenure === quartilTenureFilter);
  const rows = [...filtered].sort((a, b) => score(b) - score(a) || String(a.name).localeCompare(String(b.name), 'pt-BR'));
  const counts = [1, 2, 3, 4, 5].map(q => data.consultants.filter(row => row.quartiles[selectedQuartilMetric] === q).length);
  const total = data.consultants.length || 1;
  const ratioPercent = (value, denominator) => `${Math.max(0, Math.min(100, Number((value / denominator * 100).toFixed(2))))}%`;
  const ratioClass = value => `ratio-${Math.round(parseFloat(value) || 0)}`;
  const movementClass = label => ({ 'Evoluiu': 'evoluiu', 'Regrediu': 'regrediu', 'Neutro': 'neutro', 'Sem histórico': 'sem-historico' }[label] || 'sem-historico');
  const monthLabel = month => { const [year, monthNumber] = String(month).split('-'); return monthNumber ? `${monthNumber}/${year}` : month; };
  const tenureLabel = tenure => tenure === 'new' ? 'Abaixo de 3 meses' : 'Acima de 3 meses';
  const movementText = value => value === null || value === undefined ? 'Sem histórico' : value > 0 ? `Subiu ${value} faixa${value === 1 ? '' : 's'}` : value < 0 ? `Caiu ${Math.abs(value)} faixa${Math.abs(value) === 1 ? '' : 's'}` : 'Estável';
  const movementBadge = value => `<span class="quartil-movement ${movementClass(evolution(value))}">${movementText(value)}</span>`;
  const chevron = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const previousScroll = target.querySelector('.quartil-ranking .table-wrap')?.scrollTop ?? 0;
  const consultantAnalysis = row => {
    const history = row.history?.length ? row.history : [row];
    const latest = history.at(-1) || row;
    const q1Metrics = Object.entries(latest.quartiles || {}).filter(([, value]) => value === 1).map(([metric]) => metricLabels[metric]);
    const attentionMetrics = Object.entries(latest.quartiles || {}).filter(([, value]) => value >= 4).map(([metric]) => metricLabels[metric]);
    const movement = Object.entries(row.comparisons?.[6]?.changes || {}).filter(([, value]) => value !== 0).map(([metric, value]) => `${metricLabels[metric]} ${value > 0 ? 'evoluiu' : 'regrediu'}`);
    return { history, latest, q1Metrics, attentionMetrics, movement };
  };
  const dist = counts.map((count, i) => { const ratio = ratioPercent(count, total); return `<div class="quartil-dist-segment q${i + 1} ${ratioClass(ratio)} ${selectedQuartilBand === i + 1 ? 'active' : ''}" data-ratio="${ratio}" title="Q${i + 1}: ${count}">${count / total >= 0.07 ? `<span>Q${i + 1}</span>` : ''}</div>`; }).join('');
  const legend = counts.map((count, i) => { const q = i + 1, active = selectedQuartilBand === q; return `<button class="quartil-legend-item q${q}-item ${active ? 'active' : ''}" data-quartile="${q}" aria-pressed="${active}" title="Filtrar ranking pela faixa Q${q}"><span class="quartil-legend-label"><i class="q${q}"></i>Q${q}</span><strong>${count}</strong><small>${Math.round(count / total * 100)}% da base</small></button>`; }).join('');
  const evolutionCards = period => ['Evoluiu', 'Regrediu', 'Neutro', 'Sem histórico'].map(label => { const count = data.consultants.filter(row => evolution(change(row, period)) === label).length, active = quartilEvolutionFilter === label; return `<button class="quartil-stat-button ${movementClass(label)} ${active ? 'active' : ''}" data-evolution="${label}" aria-pressed="${active}"><span class="quartil-stat-label">${label}</span><strong>${count}</strong><small>${Math.round(count / total * 100)}% · ${period} meses</small></button>`; }).join('');
  const partnerRows = data.partners.map(partner => { const list = data.consultants.filter(row => row.partnerId === partner.id); const nums = [1, 2, 3, 4, 5].map(q => list.filter(row => row.quartiles[selectedQuartilMetric] === q).length); return `<tr><td><strong>${esc(partner.name)}</strong></td><td>${list.length}</td><td><div class="quartil-mini-band">${nums.map((n, i) => { const ratio = ratioPercent(n, list.length || 1); return `<i class="q${i + 1} ${ratioClass(ratio)}" data-ratio="${ratio}"></i>`; }).join('')}</div></td>${nums.map(n => `<td>${n}</td>`).join('')}</tr>`; }).join('');
  const executiveDetailRow = row => {
    const analysis = consultantAnalysis(row);
    const latestQuartiles = Object.entries(row.quartiles || {}).filter(([, value]) => Number.isFinite(value));
    const best = Math.min(...latestQuartiles.map(([, value]) => value));
    const worst = Math.max(...latestQuartiles.map(([, value]) => value));
    const strengths = latestQuartiles.filter(([, value]) => value === best).map(([metric]) => metricLabels[metric]).join(' e ');
    const attention = latestQuartiles.filter(([, value]) => value === worst).map(([metric]) => metricLabels[metric]).join(' e ');
    const trajectory = Object.values(row.comparisons?.[3]?.changes || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const trajectoryText = trajectory > 0 ? `Saldo positivo: subiu ${trajectory} faixas no conjunto dos indicadores.` : trajectory < 0 ? `Saldo negativo: caiu ${Math.abs(trajectory)} faixas no conjunto dos indicadores.` : 'Trajetória estável no conjunto dos indicadores.';
    const quartileTone = value => `quartil-insight-tone-q${Math.max(1, Math.min(5, value))}`;
    const trajectoryTone = trajectory > 0 ? 'quartil-insight-tone-q1' : trajectory < 0 ? 'quartil-insight-tone-q5' : 'quartil-insight-tone-q3';
    const currentClass = item => item.month === data.latestMonth ? 'is-current' : '';
    const historyHeader = analysis.history.map(item => `<th class="${currentClass(item)}">${esc(monthLabel(item.month))}${item.month === data.latestMonth ? '<small>Atual</small>' : ''}</th>`).join('');
    const historyRows = ['receita', 'movel', 'ftth'].map(metric => `<tr class="${metric === selectedQuartilMetric ? 'is-metric' : ''}"><th scope="row">${metricLabels[metric]}</th>${analysis.history.map(item => `<td class="${currentClass(item)}">${quartile(item.quartiles?.[metric])}<small>${valueLabel(metric, item.values?.[metric])}</small></td>`).join('')}</tr>`).join('');
    const insight = (kind, tone, icon, label, title, text) => `<article class="quartil-insight-card quartil-insight-${kind} ${tone}"><div class="quartil-insight-heading"><span class="quartil-insight-icon" aria-hidden="true">${icon}</span><b>${label}</b></div><strong>${title}</strong><p>${text}</p></article>`;
    return `<tr class="quartil-detail-row"><td colspan="9"><div class="quartil-detail quartil-executive-detail" id="quartil-detail-${esc(row.id)}"><div class="quartil-detail-head"><div><span class="quartil-eyebrow">Análise individual</span><h3>${esc(row.name)}</h3><p>${esc(row.partnerName)} · ${tenureLabel(row.tenure)} · competência ${esc(monthLabel(row.month))}</p></div><div class="quartil-detail-score"><strong>${score(row)}<span>/15</span></strong><small>pontos atuais</small></div></div><div class="quartil-insight-grid">${insight('strength', quartileTone(best), '♜', 'Ponto forte', `${strengths} · Q${best}`, 'Melhor posição atual entre os três indicadores.')}${insight('attention', quartileTone(worst), '◎', 'Ponto de atenção', `${attention} · Q${worst}`, 'Indicador com maior espaço para evolução.')}${insight('trajectory', trajectoryTone, trajectory < 0 ? '↘' : trajectory > 0 ? '↗' : '→', 'Trajetória', trajectoryText, 'Leitura baseada na variação dos quartis nos últimos 3 meses.')}</div><div class="quartil-detail-subhead"><b>Histórico por indicador</b><span>${analysis.history.length} competência${analysis.history.length === 1 ? '' : 's'} · quartil e valor apurado</span></div><div class="table-wrap quartil-history-table-wrap"><table class="quartil-history-table"><thead><tr><th>Indicador</th>${historyHeader}</tr></thead><tbody>${historyRows}</tbody></table></div><p class="quartil-history-note">“Sem dado” indica competência sem apuração para este consultor, diferente de um valor igual a zero.</p></div></td></tr>`;
  };
  const metricCell = (row, metric) => `<td class="quartil-cell-q ${metric === selectedQuartilMetric ? 'is-metric' : ''}" data-label="${metricLabels[metric]}">${quartile(row.quartiles[metric])}</td>`;
  const rankingRows = rows.map((row, index) => { const expanded = expandedQuartilConsultant === row.id; const scoreRatio = ratioPercent(score(row), 15); return `<tr class="quartil-consultant-row ${expanded ? 'expanded' : ''} ${index < 3 ? 'is-podium' : ''}" data-consultant-row="${esc(row.id)}"><td class="quartil-cell-consultant"><button class="quartil-row-toggle" data-consultant="${esc(row.id)}" aria-expanded="${expanded}"${expanded ? ` aria-controls="quartil-detail-${esc(row.id)}"` : ''}><span class="quartil-rank">${index + 1}º</span><span class="quartil-row-identity"><strong>${esc(row.name)}</strong><small>${esc(row.partnerName)}</small><small class="quartil-row-action">${expanded ? 'Ocultar análise individual' : 'Ver análise individual'}</small></span><span class="quartil-row-chevron">${chevron}</span></button></td><td class="quartil-cell-points" data-label="Pontos"><span class="quartil-points"><strong>${score(row)}</strong><span class="quartil-points-total">/15</span></span><span class="quartil-score-bar" aria-hidden="true"><i class="${ratioClass(scoreRatio)}" data-ratio="${scoreRatio}"></i></span></td><td data-label="Tempo de casa"><span class="quartil-tenure-tag ${row.tenure === 'new' ? 'is-new' : ''}">${tenureLabel(row.tenure)}</span></td>${['receita', 'movel', 'ftth'].map(metric => metricCell(row, metric)).join('')}<td class="quartil-cell-value is-metric" data-label="${metricLabels[selectedQuartilMetric]} atual">${valueLabel(selectedQuartilMetric, row.values[selectedQuartilMetric])}</td><td data-label="Evolução 3 meses">${movementBadge(change(row, 3))}</td><td data-label="Evolução 6 meses">${movementBadge(change(row, 6))}</td></tr>${expanded ? executiveDetailRow(row) : ''}`; }).join('') || '<tr><td colspan="9" class="quartil-empty-row"><strong>Nenhum consultor encontrado</strong><span>Ajuste a busca ou remova um dos filtros ativos.</span></td></tr>';
  const tenureFilters = [['experienced', 'Acima de 3 meses'], ['new', 'Abaixo de 3 meses']].map(([value, label]) => `<button class="quartil-tenure-button ${quartilTenureFilter === value ? 'active' : ''}" data-tenure="${value}" aria-pressed="${quartilTenureFilter === value}">${label}</button>`).join('');
  const activeFilters = [
    selectedQuartilBand ? `<button class="quartil-filter-chip" data-quartile="${selectedQuartilBand}">Faixa Q${selectedQuartilBand} · ${metricLabels[selectedQuartilMetric]} <span aria-hidden="true">×</span></button>` : '',
    quartilTenureFilter ? `<button class="quartil-filter-chip" data-tenure="${quartilTenureFilter}">${tenureLabel(quartilTenureFilter)} <span aria-hidden="true">×</span></button>` : '',
    quartilEvolutionFilter ? `<button class="quartil-filter-chip" id="quartil-clear-filter">${quartilEvolutionFilter} <span aria-hidden="true">×</span></button>` : ''
  ].join('');
  // A página começa diretamente na análise; o cabeçalho introdutório foi removido.
  target.innerHTML = `<section class="quartil-section quartil-toolbar"><div class="quartil-section-head"><div><span class="quartil-eyebrow">Visão por indicador</span><h3>Escolha a métrica de análise</h3><p class="quartil-helper">Q1 representa a melhor faixa de performance e Q5 a faixa que requer maior atenção.</p></div><div class="quartil-metric-switcher" role="group" aria-label="Métrica de análise">${Object.entries(metricLabels).map(([key, label]) => `<button class="${key === selectedQuartilMetric ? 'active' : ''}" data-metric="${key}" aria-pressed="${key === selectedQuartilMetric}">${label}</button>`).join('')}</div></div><dl class="quartil-meta"><div><dt>Competência</dt><dd>${esc(monthLabel(data.latestMonth))}</dd></div><div><dt>Base histórica</dt><dd>${data.months.length} meses</dd></div><div><dt>Consultores</dt><dd>${data.consultants.length}</dd></div><div><dt>Parceiros</dt><dd>${data.partners.length}</dd></div></dl></section>`
    + `<section class="quartil-section"><div class="quartil-section-head"><div><span class="quartil-eyebrow">Distribuição atual · ${metricLabels[selectedQuartilMetric]}</span><h3>Como a operação está distribuída?</h3></div><span class="quartil-source">Fonte: ${esc(data.source.report)}</span></div><div class="quartil-distribution"><div class="quartil-band ${selectedQuartilBand ? 'has-selection' : ''}">${dist}</div><div class="quartil-legend">${legend}</div><p class="quartil-helper">Clique em uma faixa para filtrar o ranking individual.</p></div><div class="table-wrap quartil-partner-wrap"><table class="quartil-partner-table"><thead><tr><th>Parceiro</th><th>Consultores</th><th>Distribuição</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Q5</th></tr></thead><tbody>${partnerRows}</tbody></table></div></section>`
    + `<section class="quartil-section"><div class="quartil-section-head"><div><span class="quartil-eyebrow">Movimento da base · ${metricLabels[selectedQuartilMetric]}</span><h3>Evolução por janela</h3></div><span class="quartil-helper">Comparação contra a competência anterior disponível</span></div><div class="quartil-evolution"><div class="quartil-evolution-window"><h4>Últimos 3 meses</h4><div class="quartil-stat-grid">${evolutionCards(3)}</div></div><div class="quartil-evolution-window"><h4>Últimos 6 meses</h4><div class="quartil-stat-grid">${evolutionCards(6)}</div></div></div></section>`
    + `<section class="quartil-section quartil-ranking"><div class="quartil-section-head"><div><span class="quartil-eyebrow">Ranking geral</span><h3>Performance individual</h3></div><div class="quartil-ranking-tools"><div class="quartil-tenure-filters" role="group" aria-label="Tempo de casa">${tenureFilters}</div><label class="quartil-search"><span aria-hidden="true">⌕</span><input id="quartil-search" type="search" placeholder="Buscar consultor ou parceiro" aria-label="Buscar consultor ou parceiro" value="${esc(quartilSearch)}"></label></div></div><div class="quartil-results-bar"><span class="quartil-results-count"><b>${rows.length}</b> de ${data.consultants.length} consultores</span>${activeFilters ? `<div class="quartil-active-filters"><span>Filtros ativos</span>${activeFilters}</div>` : ''}</div><div class="table-wrap"><table class="quartil-table"><thead><tr><th>Posição e consultor</th><th>Pontos</th><th>Tempo de casa</th>${['receita', 'movel', 'ftth'].map(metric => `<th class="${metric === selectedQuartilMetric ? 'is-metric' : ''}">${metricLabels[metric]}</th>`).join('')}<th class="is-metric">${metricLabels[selectedQuartilMetric]} atual</th><th>Evolução 3 meses</th><th>Evolução 6 meses</th></tr></thead><tbody>${rankingRows}</tbody></table></div><p class="small quartil-source">Exibindo ${rows.length} de ${data.consultants.length} consultores${data.warnings.length ? ` · ${data.warnings.length} avisos de qualidade` : ''}.</p></section>`;
  target.querySelector('.quartil-ranking .table-wrap').scrollTop = previousScroll;
  target.querySelectorAll('.quartil-dist-segment > span').forEach(node => node.remove());
  target.querySelectorAll('[data-metric]').forEach(button => button.onclick = () => { selectedQuartilMetric = button.dataset.metric; selectedQuartilBand = null; expandedQuartilConsultant = null; renderQuartil(); });
  target.querySelectorAll('[data-quartile]').forEach(button => button.onclick = () => { const value = Number(button.dataset.quartile); selectedQuartilBand = selectedQuartilBand === value ? null : value; expandedQuartilConsultant = null; renderQuartil(); });
  target.querySelectorAll('[data-tenure]').forEach(button => button.onclick = () => { quartilTenureFilter = quartilTenureFilter === button.dataset.tenure ? null : button.dataset.tenure; expandedQuartilConsultant = null; renderQuartil(); });
  target.querySelectorAll('.quartil-row-toggle').forEach(button => button.onclick = () => {
    const id = button.dataset.consultant;
    expandedQuartilConsultant = expandedQuartilConsultant === id ? null : id;
    renderQuartil();
    const row = [...target.querySelectorAll('[data-consultant-row]')].find(node => node.dataset.consultantRow === id);
    row?.querySelector('.quartil-row-toggle')?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  target.querySelectorAll('[data-evolution]').forEach(button => button.onclick = () => { quartilEvolutionFilter = quartilEvolutionFilter === button.dataset.evolution ? null : button.dataset.evolution; renderQuartil(); });
  $('#quartil-search').oninput = event => { quartilSearch = event.target.value.toLocaleLowerCase('pt-BR'); renderQuartil(); const input = $('#quartil-search'); input.focus(); input.setSelectionRange(input.value.length, input.value.length); };
  $('#quartil-clear-filter')?.addEventListener('click', () => { quartilEvolutionFilter = null; renderQuartil(); });
}
const executiveNav = document.querySelector('body > nav.executive-nav:not(.executive-nav-cert)');
executiveNav?.style.setProperty('margin-left', '0', 'important');
document.querySelector('.sidebar')?.remove();
document.querySelector('.topbar > span')?.remove();
const footer = document.querySelector('main > footer');
if (footer) document.querySelector('main').append(footer);
document.querySelector('.executive-nav-cert')?.remove();
document.querySelector('#nav-report')?.remove();
if (executiveNav) {
  const certificationButton = document.createElement('button');
  certificationButton.className = 'nav-link';
  certificationButton.id = 'nav-certificacao';
  certificationButton.textContent = 'Certificação';
  certificationButton.onclick = () => showExecutiveSection('certificacao');
  executiveNav.append(certificationButton);
  const navActions = document.createElement('div');
  navActions.className = 'nav-actions';
  const companySelect = document.createElement('select');
  companySelect.id = 'company-select';
  companySelect.className = 'nav-company-select';
  companySelect.setAttribute('aria-label', 'Selecionar empresa');
  navActions.append(companySelect);
  const importButton = document.createElement('button');
  importButton.className = 'nav-link nav-import-main';
  importButton.id = 'nav-import-main';
  importButton.innerHTML = '<span class="nav-import-icon">↑</span><span>Importar bases</span>';
  importButton.onclick = openImport;
  navActions.append(importButton);
  executiveNav.append(navActions);
}
document.querySelectorAll('#nav-overview').forEach((button, index) => {
  if (index > 0) {
    button.removeAttribute('id');
    button.onclick = () => { showExecutiveSection('qsc'); activeTab = 'indicators'; renderTabs(); };
  }
});
$('#nav-quartil').onclick = () => showExecutiveSection('quartil');
document.querySelectorAll('[data-module-import]').forEach(button => button.onclick = openImport);
for (const id of ['open-import', 'empty-import', 'nav-import']) { const node = $(`#${id}`); if (node) node.onclick = openImport; }
$('#nav-overview').onclick = () => { showExecutiveSection('qsc'); activeTab = 'indicators'; renderTabs(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(`#${b.dataset.close}`).close());
let inspectionRequest = 0;
$('#files').onchange = async () => {
  const request = ++inspectionRequest;
  selectedFiles = [...$('#files').files];
  $('#import-submit').disabled = true;
  $('#import-status').textContent = 'Identificando os arquivos…';
  $('#file-options').innerHTML = '';
  try {
    if (selectedFiles.some(f => f.size > 500 * 1024 * 1024)) throw new Error('Cada arquivo deve ter até 500 MB.');
    if (selectedFiles.length > 20) throw new Error('Selecione até 20 arquivos por envio.');
    const body = new FormData();
    for (const file of selectedFiles) {
      let sample = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
      if (file.size > sample.length) { const end = sample.lastIndexOf(10); if (end >= 0) sample = sample.slice(0, end + 1); }
      body.append('files', new Blob([sample]), file.name);
    }
    if (!selectedFiles.length) { $('#import-status').textContent = ''; return; }
    const inspected = await api('/api/inspect', { method: 'POST', body });
    if (request !== inspectionRequest) return;
    $('#file-options').innerHTML = inspected.map(f => `<div class="file-option"><strong>${esc(f.name)}</strong>${f.error ? `<p class="error">${esc(f.error)}</p>` : `<p><span class="badge good">QSC ${labels[f.domain]}</span> · ${f.semester ? (f.semester === 'h1' ? '1º semestre' : '2º semestre') : 'Período identificado pelas competências'}</p><p>Parceiro identificado na amostra: ${esc(f.partners.join(', '))}</p>`}</div>`).join('');
    const failed = inspected.some(f => f.error);
    $('#import-submit').disabled = failed;
    $('#import-status').textContent = failed ? 'Confira os arquivos não reconhecidos antes de enviar.' : 'Arquivos identificados. Prontos para armazenar e atualizar a visão QSC.';
  } catch (e) { if (request === inspectionRequest) $('#import-status').textContent = e.message; }
};
$('#import-form').onsubmit = event => { event.preventDefault(); busy($('#import-submit'), async () => {
  $('#files').disabled = true;
  $('#import-status').textContent = 'Armazenando as bases e calculando os resultados. Aguarde a conclusão.';
  notice('Atualizando a base consolidada QSC…');
  try {
    const body = new FormData(); selectedFiles.forEach(f => body.append('files', f));
    const updated = await api('/api/library/import', { method: 'POST', body });
    result = updated;
    if (!result.empresas.some(e => e.empresa_id === selectedCompany)) selectedCompany = result.empresas[0]?.empresa_id;
    $('#import-dialog').close(); render(); notice('Bases armazenadas e visão QSC atualizada. Os demais parceiros e QSCs foram preservados.');
    $('#import-status').textContent = 'Atualização concluída.';
  } catch (error) { $('#import-status').textContent = error.message; throw error; }
  finally { $('#files').disabled = false; }
}); };
$('#period').onchange = async () => { $('#period').disabled = true; notice('Atualizando os resultados da competência…'); try { result = await post(`/api/runs/${result.processamento_id}/period`, { period: $('#period').value }); render(); notice(''); } catch (e) { $('#period').value = result.periodo_referencia; notice(e.message, true); } finally { $('#period').disabled = false; } };
$('#company-select').onchange = event => { selectedCompany = event.target.value; page = 0; render(); };
$('#domain-filter').onchange = renderIndicators;
$('#client-search').oninput = () => { page = 0; clearTimeout(searchTimer); searchTimer = setTimeout(renderTreatments, 250); };
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { activeTab = b.dataset.tab; renderTabs(); });
function renderTabs() { document.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('active', b.dataset.tab === activeTab); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(b.dataset.tab === activeTab)); }); document.querySelectorAll('.tab-panel').forEach(p => p.hidden = p.id !== `tab-${activeTab}`); if (activeTab === 'treatments' && result) renderTreatments(); }
function renderCompanies() {
  const select = $('#company-select');
  select.innerHTML = result.empresas.map(e => `<option value="${esc(e.empresa_id)}">${esc(e.empresa_nome)}</option>`).join('');
  select.value = selectedCompany;
}
function render() {
  if (!result) return;
  $('#empty').hidden = true; $('#dashboard').hidden = false; $('#period-label').hidden = false;
  $('#period').innerHTML = result.periodos_disponiveis.map(p => `<option ${p === result.periodo_referencia ? 'selected' : ''}>${p}</option>`).join('');
  $('#processed-at').textContent = `Bases atualizadas em ${new Date(result.bases_atualizadas_em || result.data_processamento).toLocaleString('pt-BR')}`;
  renderCompanies(); const e = company(); if (!e) return;
  const prior = e.historico.filter(h => h.competencia < result.periodo_referencia).at(-1);
  const priorNotes = new Map((prior?.dominios ?? []).map(item => [item.dominio, item.nota]));
  $('#scores').innerHTML = e.dominios.map(d => { const delta = d.nota == null || priorNotes.get(d.dominio) == null ? null : d.nota - priorNotes.get(d.dominio); const trend = delta == null ? 'Sem histórico anterior' : `${delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} ${delta > 0 ? '+' : ''}${fmt(delta)} pts vs. mês anterior`; return `<article class="score"><div class="score-label">QSC ${labels[d.dominio]}<span class="badge ${d.parcial ? 'warn' : 'good'}">${d.parcial ? 'Parcial' : 'Completo'}</span></div><div class="value">${fmt(d.nota)} <span>/ 100</span></div><meter class="score-meter" min="0" max="100" value="${d.barra_nota}" aria-label="Nota QSC ${labels[d.dominio]}" ${d.nota === null ? 'hidden' : ''}></meter><div class="score-band-scale" aria-label="Faixa ${d.faixa ?? 'sem dados'}">${[1, 2, 3, 4, 5].map(level => `<i class="${d.faixa != null && level <= d.faixa ? 'active' : ''}"></i>`).join('')}</div><div class="score-foot"><span>${d.faixa === null ? 'Sem dados' : `Faixa ${d.faixa} · ${fmt(d.pontos)} pts`}</span><span>${e.indicadores_calculados ?? d.indicadores_calculados}/${e.indicadores_esperados ?? d.indicadores_esperados} indicadores</span></div><div class="score-trend ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${trend}</div></article>`; }).join('');
  $('#summary').innerHTML = `<div><strong>${e.resumo_exibicao.gaps_total}</strong><span>Indicadores com gap</span></div><div><strong>${e.resumo_exibicao.indicadores_calculaveis}/${e.resumo_exibicao.indicadores_total}</strong><span>Indicadores calculáveis</span></div><div><strong>${e.resumo_exibicao.notas_disponiveis}/${e.resumo_exibicao.notas_total}</strong><span>Notas QSC disponíveis</span></div>`;
  for (const format of ['json', 'pdf', 'csv', 'xlsx', 'html']) { const download = $(`#${format}-download`); if (download) download.href = `${prefix()}/export/${format}`; }
  renderIndicators(); renderGaps(); renderHistory(); renderAudit(); renderTabs();
}
function renderIndicators() {
  const e = company(); if (!e) return;
  renderUnified(e, result.periodo_referencia, prefix(), showEvidence);
}
async function showEvidence(id) { try {
  const records = await api(`${prefix()}/evidence/${id}`); const metric = company().indicadores.find(i => i.id === id);
  $('#evidence-title').textContent = metric.nome;
  $('#evidence-content').innerHTML = `<p>${esc(metric.formula)} · ${records.length} registros vinculados</p><p class="note">Abaixo estão numeradores, denominadores e detalhes envolvidos no cálculo. A presença do CNPJ não implica necessidade automática de tratativa. Mostrando até 200 registros; o JSON inclui todos.</p>` + records.slice(0, 200).map(r => `<details class="evidence-record"><summary>${esc(r.clientCnpj || 'Sem CNPJ identificado')} · ${esc(r.movement)} · quantidade ${fmt(r.quantity)}<br><small>${esc(r.sourceName)} · linha ${r.line} · ID ${r.id}</small></summary><pre>${esc(JSON.stringify(r.original, null, 2))}</pre></details>`).join('');
  $('#evidence-dialog').showModal();
} catch (e) { notice(e.message, true); } }
function renderGaps() {
  const e = company(); $('#gaps').innerHTML = e.principais_gaps.length ? e.principais_gaps.map(g => `<div class="gap-row"><div><h3>${esc(g.criterio)}</h3><p>${esc(g.descricao)}</p></div><strong class="gap-num">${fmt(g.impacto)} pts</strong></div>`).join('') : '<p class="note">Nenhum gap calculável. Confira a cobertura dos indicadores.</p>';
  $('#ai-status').textContent = `${e.plano_acao.origem}. ${config?.ia_disponivel ? 'A geração envia somente indicadores agregados da empresa à IA.' : 'Para usar IA, configure OPENAI_API_KEY e OPENAI_MODEL no .env e reinicie. O PDF atual usa resumo determinístico.'}`;
  $('#generate-ai').disabled = !config?.ia_disponivel;
  $('#plan').innerHTML = `<h3>Resumo executivo</h3><p>${esc(e.plano_acao.resumo_executivo)}</p><h3>Diagnóstico</h3><p>${esc(e.plano_acao.diagnostico)}</p>` + e.plano_acao.acoes_prioritarias.map((a, i) => `<article class="action"><h3>${i + 1}. ${esc(a.acao)}</h3><p>${esc(a.justificativa)}</p><p><strong>Responsável:</strong> ${esc(a.responsavel_sugerido)} · <strong>Prazo:</strong> ${esc(a.prazo_sugerido)}</p><p>${esc(a.impacto_esperado)}</p></article>`).join('');
}
$('#generate-ai').onclick = () => busy($('#generate-ai'), async () => { result = await post(`${prefix()}/ai`, {}); renderGaps(); notice('Plano de ação gerado. Revise as sugestões antes de apresentá-las à gestão.'); });
async function renderTreatments() {
  const request = ++treatmentRequest;
  const query = $('#client-search').value.toLocaleLowerCase('pt-BR');
  let data;
  try { data = await api(`${prefix()}/candidates?page=${page}&q=${encodeURIComponent(query)}`); }
  catch (error) { if (request === treatmentRequest) notice(error.message, true); return; }
  if (request !== treatmentRequest) return;
  page = data.pagina; const candidates = data.itens;
  $('#treatments').innerHTML = candidates.length ? candidates.map(c => `<article class="treatment"><div><h3>${esc(c.cnpj)} · ${esc(c.razao_social || 'Razão social não informada')}</h3><p>${esc(c.criterio_afetado)}</p><span class="badge ${c.confirmado ? 'good' : 'warn'}">${c.confirmado ? 'Confirmado' : 'A revisar'}</span><span class="badge">${esc(c.prioridade)}</span><p>${c.registros_total} registros de origem</p></div><div class="treatment-actions"><button class="button" data-view="${c.indicador_id}">Evidências</button><button class="button dark" data-review="${c.id}">Revisar</button></div></article>`).join('') + `<div class="pagination"><button class="button" id="prev-page" ${page === 0 ? 'disabled' : ''}>←</button><span>${page + 1} / ${data.paginas} · ${data.total} casos</span><button class="button" id="next-page" ${page === data.paginas - 1 ? 'disabled' : ''}>→</button></div>` : '<p class="note">Sem CNPJs vinculados a gaps para este filtro. Verifique DOCUMENTO_CLIENTE e a cobertura das bases.</p>';
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => showEvidence(b.dataset.view));
  document.querySelectorAll('[data-review]').forEach(b => b.onclick = () => {
    reviewing = candidates.find(c => c.id === b.dataset.review);
    $('#review-title').textContent = `${reviewing.cnpj} · ${reviewing.criterio_afetado}`;
    $('#review-priority').value = reviewing.prioridade; $('#review-reason').value = reviewing.motivo_tratativa; $('#review-action').value = reviewing.acao_recomendada; $('#review-confirm').checked = reviewing.confirmado; $('#review-dialog').showModal();
  });
  if ($('#prev-page')) $('#prev-page').onclick = () => { page--; renderTreatments(); };
  if ($('#next-page')) $('#next-page').onclick = () => { page++; renderTreatments(); };
}
$('#review-form').onsubmit = event => { event.preventDefault(); busy($('#review-form button[type="submit"]'), async () => {
  result = await post(`${prefix()}/review`, { candidateId: reviewing.id, confirmado: $('#review-confirm').checked, prioridade: $('#review-priority').value, motivo: $('#review-reason').value, acao: $('#review-action').value });
  $('#review-dialog').close(); render(); notice('Revisão salva. As exportações e o PDF já refletem os casos confirmados.');
}); };
function renderHistory() { const e = company(); $('#history').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Competência</th><th>Carteira</th><th>Fixa</th><th>Móvel</th></tr></thead><tbody>${e.historico.map(h => `<tr><td>${h.competencia}</td>${h.dominios.map(d => `<td>${fmt(d.nota)}</td>`).join('')}</tr>`).join('')}${e.semestres.map(s => `<tr><td>${s.semestre}º semestre / ${s.ano}</td>${s.dominios.map(d => `<td>${fmt(d.nota)}<small>${d.meses_disponiveis} meses · ${fmt(d.pontos)} pts</small></td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
function renderAudit() { $('#audit').innerHTML = result.importacao.fontes.map(f => `<article class="source"><strong>${esc(f.arquivo)}</strong><p>${esc(f.dominio)} · ${esc(f.encoding)} · ${f.registros_aceitos} linhas aceitas · ${f.registros_rejeitados} rejeitadas</p><code>SHA-256 ${f.sha256}</code></article>`).join('') + `<h3>${result.importacao.ocorrencias.length} ocorrências</h3>` + result.importacao.ocorrencias.slice(0, 250).map(i => `<div class="log ${i.tipo === 'erro' ? 'error' : ''}"><strong>${esc(i.tipo)}</strong> · ${esc(i.arquivo || '')}${i.linha ? ` · linha ${i.linha}` : ''}<p>${esc(i.mensagem)}</p></div>`).join('') + (result.importacao.ocorrencias.length > 250 ? '<p>Mostrando 250 ocorrências. O log completo está no processamento salvo.</p>' : ''); }
try {
  $('#empty').hidden = true; notice('Carregando as bases armazenadas…');
  config = await api('/api/config'); result = await api('/api/library');
  if (result) { selectedCompany = result.empresas[0]?.empresa_id; render(); }
  else $('#empty').hidden = false;
  notice('');
} catch (e) { notice(e.message, true); }

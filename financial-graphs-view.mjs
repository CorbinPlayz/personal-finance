/* Accessible, presentation-only HTML for the local financial graph models. */
import { graphAmount, graphTotal, graphDifference, monthlyGraph, categoryGraph, transactionGraph, priceChecksGraph, goalScenarioGraph } from './finance-graphs.mjs';

const palette = ['#278365', '#b75a49', '#5577b7', '#8b6aa9', '#94722b', '#687e82'];
const clamp = value => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const shortMonthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const fullMonthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortMonth = key => shortMonthFormat.format(new Date(`${key}-01T00:00:00Z`));
const fullMonth = key => fullMonthFormat.format(new Date(`${key}-01T00:00:00Z`));
const header = (kicker, title, description, tag) => `<div class="ns-graph-head"><div><div class="ns-graph-kicker"><i aria-hidden="true"></i>${kicker}</div><h2>${title}</h2><p>${description}</p></div>${tag ? `<span class="ns-graph-tag">${tag}</span>` : ''}</div>`;
const empty = (title, description) => `<div class="ns-graph-empty"><div class="ns-graph-empty-icon" aria-hidden="true">✦</div><div><strong>${title}</strong><span>${description}</span></div></div>`;
const amount = (value, money, esc) => esc(money(value));
const note = excluded => excluded ? `<span>${excluded} ${excluded === 1 ? 'entry could' : 'entries could'} not be graphed because of invalid or unsupported data.</span>` : '';
const percent = value => {
  if (!Number.isFinite(value)) return '—';
  if (value > 1000000) return '>1,000,000%';
  if (value > 0 && value < 1) return '<1%';
  if (value < 100 && value >= 99.5) return '99+%';
  if (value > 100 && value < 100.5) return '100+%';
  return `${Math.round(value)}%`;
};

function flowPlot(rows, max, inClass, outClass, esc) {
  const columns = rows.length;
  const bars = rows.map(row => `<div class="ns-flow-column"><span class="ns-flow-bar ${inClass}" style="height:${clamp(max ? row.incoming / max * 100 : 0)}%"></span><span class="ns-flow-bar ${outClass}" style="height:${clamp(max ? row.outgoing / max * 100 : 0)}%"></span></div>`).join('');
  const labels = rows.map(row => `<span title="${esc(fullMonth(row.month))}">${esc(shortMonth(row.month))}</span>`).join('');
  return `<div class="ns-flow-main" style="--columns:${columns}"><div class="ns-flow-plot" aria-hidden="true"><div class="ns-flow-columns">${bars}</div></div><div class="ns-flow-months" aria-hidden="true">${labels}</div></div>`;
}
function flowTable(rows, inLabel, outLabel, money, esc, subject = '') {
  const description = subject ? ` for ${subject}` : '';
  return `<details class="ns-graph-details"><summary aria-label="${esc(`View exact monthly amounts${description}`)}">View exact monthly amounts</summary><table><caption class="ns-sr-only">${esc(`Monthly amounts${description}`)}</caption><thead><tr><th scope="col">Month</th><th scope="col">${inLabel}</th><th scope="col">${outLabel}</th></tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${esc(fullMonth(row.month))}</th><td>${amount(row.incoming, money, esc)}</td><td>${amount(row.outgoing, money, esc)}</td></tr>`).join('')}</tbody></table></details>`;
}

export function renderCashFlowGraph(transactions, month, money, esc) {
  const model = monthlyGraph(transactions, month, 6);
  const max = Math.max(0, ...model.rows.flatMap(row => [row.incoming, row.outgoing]));
  const range = model.rows.length ? `${fullMonth(model.rows[0].month)} – ${fullMonth(model.rows[model.rows.length - 1].month)}` : 'Last six months';
  const title = header('Your activity', 'Money in & out', `Recorded income and expenses · ${esc(range)}.`, '6 months');
  if (!model.hasRecords || max === 0) return `<section class="ns-graph" data-graph-key="overview-flow">${title}${empty('Your timeline starts here', 'Record income or an expense to see your activity over time.')}<div class="ns-graph-foot"><span>Transfers are excluded; this is not a balance history.</span>${note(model.excluded)}</div></section>`;
  const incoming = graphTotal(model.rows.map(row => row.incoming)), outgoing = graphTotal(model.rows.map(row => row.outgoing));
  return `<section class="ns-graph" data-graph-key="overview-flow">${title}<div class="ns-graph-legend"><span><i class="ns-legend-dot" style="--dot:#278365" aria-hidden="true"></i>Income ${incoming === null ? '· see monthly values' : amount(incoming, money, esc)}</span><span><i class="ns-legend-dot" style="--dot:#b75a49" aria-hidden="true"></i>Spending ${outgoing === null ? '· see monthly values' : amount(outgoing, money, esc)}</span></div><div class="ns-flow-area"><div class="ns-flow-axis" aria-hidden="true"><span>${amount(max, money, esc)}</span><span>${amount(max / 2, money, esc)}</span><span>${amount(0, money, esc)}</span></div>${flowPlot(model.rows, max, 'is-in', 'is-out', esc)}</div><div class="ns-graph-foot"><span>Recorded across accounts. Transfers are excluded; this is not a balance history.</span>${note(model.excluded)}${flowTable(model.rows, 'Income', 'Spending', money, esc)}</div></section>`;
}

export function renderCategoryGraph(transactions, month, money, esc) {
  const model = categoryGraph(transactions, month);
  if (model.total <= 0) return `<div class="chart-empty"><div class="empty-chart-icon" aria-hidden="true">✦</div><strong>No spending recorded yet</strong><span>Your category breakdown will appear here.</span><button class="text-btn" data-action="add-transaction" data-prefill="expense">Record an expense ↗</button></div>${model.excluded ? `<p class="ns-graph-note">${note(model.excluded)}</p>` : ''}`;
  const nonzero = model.items.filter(item => item.amount > 0);
  const shown = nonzero.length > 6 ? [...nonzero.slice(0, 5), { category: `Other ${nonzero.length - 5} categories`, amount: graphTotal(nonzero.slice(5).map(item => item.amount)) }] : nonzero;
  let offset = 0;
  const arcs = shown.map((item, index) => {
    const share = clamp(item.amount / model.total * 100), result = `<circle cx="60" cy="60" r="47" fill="none" stroke="${palette[index]}" stroke-width="10" pathLength="100" stroke-dasharray="${share} ${100 - share}" stroke-dashoffset="${-offset}"/>`;
    offset += share; return result;
  }).join('');
  const items = shown.map((item, index) => `<li><span class="ns-legend-item"><i class="ns-legend-dot" style="--dot:${palette[index]}" aria-hidden="true"></i><span>${esc(item.category)}</span></span><strong>${amount(item.amount, money, esc)}</strong></li>`).join('');
  const full = nonzero.length > 6 ? `<details class="ns-graph-details"><summary>View all categories</summary><table><caption class="ns-sr-only">Spending by category for the selected month</caption><thead><tr><th scope="col">Category</th><th scope="col">Recorded spending</th></tr></thead><tbody>${nonzero.map(item => `<tr><th scope="row">${esc(item.category)}</th><td>${amount(item.amount, money, esc)}</td></tr>`).join('')}</tbody></table></details>` : '';
  return `<div class="ns-category-layout" data-graph-key="overview-categories"><div class="ns-donut" aria-hidden="true"><svg viewBox="0 0 120 120" focusable="false"><circle cx="60" cy="60" r="47" fill="none" stroke="#e8efeb" stroke-width="10"/><g transform="rotate(-90 60 60)">${arcs}</g></svg><div class="ns-donut-center"><span>Recorded</span><strong>${amount(model.total, money, esc)}</strong></div></div><ul class="ns-category-list">${items}</ul></div><div class="ns-graph-foot"><span>Total recorded spending: ${amount(model.total, money, esc)}.</span>${note(model.excluded)}${full}</div>`;
}

export function renderTransactionGraph(transactions, money, esc) {
  const model = transactionGraph(transactions), labels = ['Income', 'Spending', 'Transfers'], classes = ['is-in', 'is-out', 'is-transfer'], colors = ['#278365', '#b75a49', '#657eaa'];
  const title = header('Your activity', 'Activity mix', 'Updates with your search and filters.', 'Matching entries');
  const count = model.groups.reduce((sum, group) => sum + group.count, 0);
  if (!count || model.total <= 0) return `<section class="ns-graph" data-graph-key="transaction-mix">${title}${empty('No matching amounts to chart', 'Try another filter or record a transaction.')}<div class="ns-graph-foot">${note(model.excluded)}</div></section>`;
  const segments = model.groups.map((group, index) => `<span class="${classes[index]}" style="width:${clamp(group.amount / model.total * 100)}%"></span>`).join('');
  const items = model.groups.map((group, index) => `<div class="ns-mix-item"><small><i class="ns-legend-dot" style="--dot:${colors[index]}" aria-hidden="true"></i>${labels[index]} · ${group.count}</small><strong>${amount(group.amount, money, esc)}</strong></div>`).join('');
  return `<section class="ns-graph" data-graph-key="transaction-mix">${title}<div class="ns-mix-track" aria-hidden="true">${segments}</div><div class="ns-mix-grid">${items}</div><div class="ns-graph-foot"><span>Share of recorded transaction amounts; transfers are counted once and are not income or spending.</span>${note(model.excluded)}</div></section>`;
}

export function renderAccountGraph(account, transactions, month, money, esc) {
  if (!account || account.id === null || account.id === undefined || account.id === '') return '';
  const model = monthlyGraph(transactions, month, 3, account.id);
  const max = Math.max(0, ...model.rows.flatMap(row => [row.incoming, row.outgoing]));
  if (!model.hasRecords || max === 0) return `<div class="ns-mini-chart"><div class="ns-mini-head"><span>Recorded activity</span><span>LAST 3 MONTHS</span></div><div class="ns-mini-note">No recorded inflows or outflows in this period.</div>${model.excluded ? `<div class="ns-mini-note">${note(model.excluded)}</div>` : ''}</div>`;
  return `<div class="ns-mini-chart" data-graph-key="account-${esc(String(account.id))}"><div class="ns-mini-head"><span>Recorded activity</span><span>LAST 3 MONTHS</span></div><div class="ns-graph-legend" style="margin:8px 0 0"><span><i class="ns-legend-dot" style="--dot:#278365" aria-hidden="true"></i>In</span><span><i class="ns-legend-dot" style="--dot:#b75a49" aria-hidden="true"></i>Out</span></div><div class="ns-flow-main" style="--columns:3"><div class="ns-flow-plot ns-mini-plot" aria-hidden="true"><div class="ns-flow-columns">${model.rows.map(row => `<div class="ns-flow-column"><span class="ns-flow-bar is-in" style="height:${clamp(row.incoming / max * 100)}%"></span><span class="ns-flow-bar is-out" style="height:${clamp(row.outgoing / max * 100)}%"></span></div>`).join('')}</div></div><div class="ns-flow-months ns-mini-months" aria-hidden="true">${model.rows.map(row => `<span title="${esc(fullMonth(row.month))}">${esc(shortMonth(row.month))}</span>`).join('')}</div></div><div class="ns-mini-note">Includes transfers for this account; not balance history. ${note(model.excluded)}</div>${flowTable(model.rows, 'In', 'Out', money, esc, account.name || 'this account')}</div>`;
}

export function renderBudgetGraph(budgets, transactions, month, money, esc) {
  if (!Array.isArray(budgets) || !budgets.length) return '';
  const model = categoryGraph(transactions, month);
  const byCategory = new Map(model.items.map(item => [item.category, item.amount]));
  const rows = budgets.map(budget => {
    const category = typeof budget.category === 'string' && budget.category.trim() ? budget.category.trim() : 'Uncategorized';
    const limit = graphAmount(budget.limit);
    return { budget, category, spent: byCategory.get(category) || 0, limit: limit !== null && limit > 0 ? limit : null };
  }).sort((a, b) => (b.limit ? b.spent / b.limit : -1) - (a.limit ? a.spent / a.limit : -1));
  const shown = rows.slice(0, 5);
  return `<section class="ns-graph" data-graph-key="budget-map">${header('Your monthly limits', 'Budget map', 'Recorded spending against each category limit.', 'Current month')}<div class="ns-list-bars">${shown.map(({ category, spent, limit }) => {
    const ratio = limit ? spent / limit * 100 : null;
    const caption = ratio === null ? 'A positive limit is needed for this graph.' : ratio > 100 ? `${percent(ratio)} used · over the limit` : `${percent(ratio)} used`;
    return `<div class="ns-list-row"><div class="ns-list-label"><span>${esc(category)}</span><strong>${amount(spent, money, esc)} / ${limit === null ? 'No positive limit' : amount(limit, money, esc)}</strong></div><div class="ns-list-track" aria-hidden="true"><span class="ns-list-fill${ratio > 100 ? ' is-over' : ''}" style="width:${clamp(ratio)}%"></span></div><div class="ns-list-caption">${caption}</div></div>`;
  }).join('')}</div><div class="ns-graph-foot"><span>${rows.length > shown.length ? `Showing ${shown.length} of ${rows.length} budgets; all are listed below. ` : ''}Only valid dated expenses are graphed; each budget is separate.</span>${note(model.excluded)}</div></section>`;
}

export function renderGoalGraph(goals, money, esc) {
  if (!Array.isArray(goals) || !goals.length) return '';
  const shown = goals.slice(0, 4);
  return `<section class="ns-graph" data-graph-key="goal-orbits">${header('A little closer', 'Goals at a glance', 'Progress reflects the amounts you recorded for each goal.', 'Your goals')}<div class="ns-goal-orbits">${shown.map(goal => {
    const saved = graphAmount(goal.saved), target = graphAmount(goal.target), valid = saved !== null && target !== null && target > 0;
    const actual = valid ? saved / target * 100 : 0, pct = clamp(actual);
    return `<div class="ns-goal-orbit"><div class="ns-goal-ring" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><circle cx="32" cy="32" r="27" fill="none" stroke="#e5eee9" stroke-width="6"/><circle cx="32" cy="32" r="27" fill="none" stroke="#458a70" stroke-width="6" pathLength="100" stroke-dasharray="${pct} ${100 - pct}" transform="rotate(-90 32 32)"/></svg><b>${valid ? percent(pct) : '—'}</b></div><div class="ns-goal-copy"><strong>${esc(goal.name || 'Untitled goal')}</strong><span>${valid ? `${amount(saved, money, esc)} of ${amount(target, money, esc)} · ${percent(actual)}` : 'Add a valid target and saved amount.'}</span></div></div>`;
  }).join('')}</div><div class="ns-graph-foot"><span>${goals.length > shown.length ? `Showing ${shown.length} of ${goals.length} goals; all are listed below. ` : ''}Rings cap at 100%. Goal amounts are not account balances.</span></div></section>`;
}

export function renderPurchaseGraph(purchases, completedIds, money, esc) {
  const completed = completedIds && typeof completedIds.has === 'function' ? completedIds : new Set();
  const plans = (Array.isArray(purchases) ? purchases : []).filter(item => item && ['Planning', 'Saving', 'Ready'].includes(item.status) && !completed.has(item.id));
  if (!plans.length) return '';
  const shown = plans.slice().sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] ?? 1) - ({ High: 0, Medium: 1, Low: 2 }[b.priority] ?? 1) || String(a.date || '9999').localeCompare(String(b.date || '9999'))).slice(0, 4);
  return `<section class="ns-graph" data-graph-key="purchase-map">${header('Your purchase plans', 'Funding progress', 'Saved amounts for planning, saving, and ready plans.', 'Open plans')}<div class="ns-list-bars">${shown.map(plan => {
    const saved = graphAmount(plan.saved), price = graphAmount(plan.price), valid = saved !== null && price !== null && price > 0;
    const actual = valid ? saved / price * 100 : 0, pct = clamp(actual);
    return `<div class="ns-list-row"><div class="ns-list-label"><span>${esc(plan.name || 'Untitled plan')}</span><strong>${valid ? `${amount(saved, money, esc)} / ${amount(price, money, esc)}` : 'Add a valid price and saved amount'}</strong></div><div class="ns-list-track" aria-hidden="true"><span class="ns-list-fill" style="width:${pct}%"></span></div><div class="ns-list-caption">${valid ? `${percent(actual)} set aside · ${amount(Math.max(0, graphDifference(price, saved)), money, esc)} remaining` : 'No progress can be calculated.'}</div></div>`;
  }).join('')}</div><div class="ns-graph-foot"><span>${plans.length > shown.length ? `Showing ${shown.length} of ${plans.length} open plans. ` : ''}Postponed, cancelled, purchased, and expense-linked plans are excluded. Bars cap at 100%; amounts are not bank-verified funds.</span></div></section>`;
}

export function renderWorkspaceCountGraph(counts, esc) {
  const items = (Array.isArray(counts) ? counts : []).filter(item => Array.isArray(item) && Number.isSafeInteger(item[1]) && item[1] >= 0);
  const total = items.reduce((sum, item) => sum + item[1], 0);
  const track = total > 0 ? `<div class="ns-mix-track" aria-hidden="true">${items.map((item, index) => `<span style="width:${clamp(item[1] / total * 100)}%;background:${palette[index % palette.length]}"></span>`).join('')}</div>` : '<p class="ns-data-empty">No records to chart yet.</p>';
  return `<div class="ns-data-composition" data-graph-key="settings-counts"><div class="ns-data-head"><h3>Record mix</h3><p>Active workspace counts, not balances. Settings are also included in an export.</p></div>${track}<div class="data-counts">${items.map(([label, count], index) => `<div><strong>${count}</strong><span><i class="ns-legend-dot" style="--dot:${palette[index % palette.length]}" aria-hidden="true"></i>${esc(label)}</span></div>`).join('')}</div></div>`;
}

export function renderGuideProfileGraph(profile, money, esc) {
  const title = header('Your planning profile', 'Monthly picture', 'A visual of the income, bills, and buffer saved in your Guide profile.', 'Profile estimate');
  const income = graphAmount(profile?.monthlyIncome), bills = graphAmount(profile?.essentialBills), buffer = graphAmount(profile?.cushion);
  if (income === null || income <= 0 || bills === null || buffer === null) return `<section class="ns-graph" data-graph-key="guide-profile">${title}${empty('Build your monthly picture', 'Save a positive income, bills, and buffer in your profile below. You can enter zero for bills or buffer.')}<div class="ns-graph-foot"><span>Profile values are estimates, not verified bank activity.</span></div></section>`;
  const combined = graphTotal([bills, buffer]);
  if (combined === null) return `<section class="ns-graph" data-graph-key="guide-profile">${title}${empty('Amounts are too large to compare', 'Check the amounts saved in your profile and try smaller values.')}<div class="ns-graph-foot"><span>No profile values were changed.</span></div></section>`;
  const i = Math.round(income * 100), b = Math.round(bills * 100), c = Math.round(buffer * 100), balance = Math.round(graphDifference(income, combined) * 100);
  const remaining = Math.max(0, balance) / 100, over = Math.max(0, -balance) / 100;
  const billShare = Math.min(i, b), bufferShare = Math.min(c, Math.max(0, i - b)), roomShare = Math.max(0, balance);
  const groups = [{ label: 'Bills', value: bills, color: '#b75a49', share: billShare },
    { label: 'Buffer', value: buffer, color: '#657eaa', share: bufferShare },
    { label: 'Room left', value: remaining, color: '#278365', share: roomShare }];
  return `<section class="ns-graph" data-graph-key="guide-profile">${title}<div class="ns-graph-legend"><span>Monthly income · ${amount(income, money, esc)}</span></div><div class="ns-mix-track" aria-hidden="true">${groups.map(group => `<span style="width:${clamp(group.share / i * 100)}%;background:${group.color}"></span>`).join('')}</div><div class="ns-mix-grid">${groups.map(group => `<div class="ns-mix-item"><small><i class="ns-legend-dot" style="--dot:${group.color}" aria-hidden="true"></i>${group.label}</small><strong>${amount(group.value, money, esc)}</strong></div>`).join('')}</div><div class="ns-graph-foot"><span>${over > 0 ? `Bills and buffer exceed income by ${amount(over, money, esc)}; the bar caps segments at the income entered. ` : ''}Based on your saved profile, not actual transactions or a verified balance. Review the values, including any default buffer, before spending.</span></div></section>`;
}

export function renderPriceChecksGraph(purchase, money, esc, formatDate) {
  const model = priceChecksGraph(purchase?.priceHistory);
  const title = header('Manual price checks', 'Price timeline', 'Prices you have logged for this plan.', 'Recorded checks');
  const key = esc(String(purchase?.id ?? ''));
  if (!model.rows.length) return `<section class="ns-graph" data-graph-key="price-${key}">${title}${empty('No prices logged yet', 'Use the price check form above to build a timeline.')}<div class="ns-graph-foot"><span>Prices are entered by you, not fetched from a store.</span>${note(model.excluded)}</div></section>`;
  const max = Math.max(...model.rows.map(row => row.price));
  const bars = model.rows.map(row => `<div class="ns-flow-column"><span class="ns-flow-bar is-a" style="height:${clamp(row.price / max * 100)}%"></span></div>`).join('');
  const labels = model.rows.map(row => `<span title="${esc(formatDate(row.date))}">${esc(`${Number(row.date.slice(5, 7))}/${Number(row.date.slice(8, 10))}`)}</span>`).join('');
  const last = model.rows[model.rows.length - 1];
  const table = `<details class="ns-graph-details"><summary>View exact price checks</summary><table><caption class="ns-sr-only">Manually recorded prices</caption><thead><tr><th scope="col">Date</th><th scope="col">Price</th></tr></thead><tbody>${model.rows.map(row => `<tr><th scope="row">${esc(formatDate(row.date))}</th><td>${amount(row.price, money, esc)}</td></tr>`).join('')}</tbody></table></details>`;
  return `<section class="ns-graph" data-graph-key="price-${key}">${title}<div class="ns-graph-legend"><span>Latest · ${amount(last.price, money, esc)} on ${esc(formatDate(last.date))}</span></div><div class="ns-flow-area"><div class="ns-flow-axis" aria-hidden="true"><span>${amount(max, money, esc)}</span><span>${amount(max / 2, money, esc)}</span><span>${amount(0, money, esc)}</span></div><div class="ns-flow-main" style="--columns:${model.rows.length}"><div class="ns-flow-plot" aria-hidden="true"><div class="ns-flow-columns">${bars}</div></div><div class="ns-flow-months" aria-hidden="true">${labels}</div></div></div><div class="ns-graph-foot"><span>Showing ${model.rows.length} of ${model.total} valid checks, equally spaced. Not a live price feed or forecast.</span>${note(model.excluded)}${table}</div></section>`;
}

export function renderScenarioPanel(goals, esc) {
  if (!Array.isArray(goals) || !goals.length) return '';
  const options = goals.map(goal => `<option value="${esc(goal.id)}">${esc(goal.name || 'Untitled goal')}</option>`).join('');
  return `<section class="ns-graph" data-graph-key="goal-scenarios" id="nsGoalScenarios">${header('Make it tangible', 'Try a savings scenario', 'Compare two amounts without changing your records.', 'What if?')}<div class="ns-scenario-controls"><label for="nsScenarioGoal"><span>Goal</span><select id="nsScenarioGoal">${options}</select></label><label for="nsScenarioA"><span>Scenario A <small>Monthly contribution</small></span><input id="nsScenarioA" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Enter amount"></label><label for="nsScenarioB"><span>Scenario B <small>Monthly contribution</small></span><input id="nsScenarioB" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Enter amount"></label></div><div class="ns-scenario-result" id="nsScenarioResult" aria-live="polite">${empty('A clearer view of what is possible', 'Enter a monthly amount above to preview a scenario.')}</div><div class="ns-graph-foot"><span>Illustrative only: assumes the entered amount is added every month, with no interest or fees. It does not check your accounts or move money. Inputs are not saved.</span></div></section>`;
}

export function renderScenarioResult(goal, inputs, money, esc) {
  const model = goalScenarioGraph(goal, inputs);
  if (model.error) return `<p class="ns-scenario-error">${esc(model.error)}</p>`;
  if (!model.scenarios.length) return empty('A clearer view of what is possible', 'Enter a monthly amount above to preview a scenario.');
  const max = Math.max(model.target, ...model.scenarios.flatMap(scenario => scenario.points.map(point => point.amount)));
  const target = clamp(model.target / max * 100);
  const bars = model.periods.map((period, index) => `<div class="ns-flow-column">${model.scenarios.map(scenario => `<span class="ns-flow-bar ${scenario.label === 'A' ? 'is-a' : 'is-b'}" style="height:${clamp(scenario.points[index].amount / max * 100)}%"></span>`).join('')}</div>`).join('');
  const legend = model.scenarios.map(scenario => `<span><i class="ns-legend-dot" style="--dot:${scenario.label === 'A' ? '#254d46' : '#6575a9'}" aria-hidden="true"></i>Scenario ${scenario.label} · ${amount(scenario.monthly, money, esc)} / month</span>`).join('');
  const summary = model.scenarios.map(scenario => `<span>After 12 months, ${scenario.label}: <strong>${amount(scenario.points[3].amount, money, esc)}</strong></span>`).join('');
  const table = `<details class="ns-graph-details"><summary>View exact scenario values</summary><table><caption class="ns-sr-only">Projected goal amounts for each scenario</caption><thead><tr><th scope="col">Time</th>${model.scenarios.map(scenario => `<th scope="col">Scenario ${scenario.label}</th>`).join('')}</tr></thead><tbody>${model.periods.map((period, index) => `<tr><th scope="row">${period ? `${period} months` : 'Now'}</th>${model.scenarios.map(scenario => `<td>${amount(scenario.points[index].amount, money, esc)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
  return `<div class="ns-graph-legend">${legend}</div><div class="ns-flow-area"><div class="ns-flow-axis" aria-hidden="true"><span>${amount(max, money, esc)}</span><span>${amount(max / 2, money, esc)}</span><span>${amount(0, money, esc)}</span></div><div class="ns-flow-main" style="--columns:4"><div class="ns-flow-plot" aria-hidden="true"><div class="ns-scenario-target" style="--target:${target}%"><span>Goal target</span></div><div class="ns-flow-columns">${bars}</div></div><div class="ns-flow-months" aria-hidden="true"><span>Now</span><span>3 mo</span><span>6 mo</span><span>12 mo</span></div></div></div><div class="ns-scenario-summary">${summary}<span>Goal target: <strong>${amount(model.target, money, esc)}</strong></span></div><div class="ns-graph-foot">${table}</div>`;
}

'use strict';

// Independent account/transfer checks. This file changes neither the plan source nor any baseline.
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '../../..'));
const h = require(path.join(ROOT, 'audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js'));
const engine = require(path.join(ROOT, 'src/engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src/scenario-validator.js'));
const TYPES = {
  taxable: { cls: 'taxable' }, traditionalIRA: { cls: 'preTax', group: 'ira' },
  rothIRA: { cls: 'roth', group: 'ira' }, traditional401k: { cls: 'preTax', group: 'workplace' },
  roth401k: { cls: 'roth', group: 'workplace' }, hsa: { cls: 'hsa', group: 'hsa' },
  customTaxable: { cls: 'taxable' }, customTraditional: { cls: 'preTax' }, customRoth: { cls: 'roth' }
};
const results = [];
let planRuns = 0;
function account(id, type, balance, extra = {}) {
  return h.account(id, 'taxable', balance, { type, taxClass: TYPES[type].cls,
    basisPct: 100, qualifiedMedicalPct: 0, ...extra });
}
function plan(from = 'taxable', to = 'taxable', cross = false, at = 60.25) {
  const p = h.plan({ at, balance: 10000, amount: 10000 });
  p.accounts[1] = account('src', from, 10000);
  p.accounts[2] = account('dst', to, 0, { owner: cross ? 'spouse' : 'self' });
  Object.assign(p.profile, { spouseOn: cross, spouseAge: 60, spouseRetireAge: 60, filing: cross ? 'mfj' : 'single' });
  p.retirement.otherIncomes = [{ name: 'Wages', type: 'employment', owner: 'self', amount: 20000,
    start: 60, end: 61, growth: 0, growthMode: 'fixed' }];
  if (cross) p.retirement.otherIncomes.push({ name: 'Spouse wages', type: 'employment', owner: 'spouse',
    amount: 20000, start: 60, end: 61, growth: 0, growthMode: 'fixed' });
  return p;
}
function run(p) {
  planRuns++;
  const validation = validateScenario(structuredClone(p));
  const r = engine.runPlan(p);
  return { validation, r, row: r.rows && r.rows[r.rows.length - 1] };
}
function check(label, actual, expected, group, details = {}) {
  const wrong = Object.keys(expected).filter(k => typeof expected[k] === 'number'
    ? !Number.isFinite(actual[k]) || Math.abs(actual[k] - expected[k]) > 0.005 : actual[k] !== expected[k]);
  results.push({ label, group, verdict: wrong.length ? (details.conditional ? 'CONDITIONAL' : 'MISMATCH') : 'PASS', wrong, expected, actual, ...details });
}
function tax(agi, wages, joint = false, penalty = 0) {
  const taxable = Math.max(0, agi - (joint ? 32200 : 16100));
  const first = joint ? 24800 : 12400;
  assert.ok(taxable <= (joint ? 100800 : 50400));
  return Math.min(taxable, first) * 0.10 + Math.max(0, taxable - first) * 0.12
    + taxable * 0.025 + wages * 0.0765 + penalty;
}

// Ordinary current-owner transactions only: no death, divorce instrument, QDRO or employer-plan exception.
function route(from, to, cross, joint = cross) {
  const f = TYPES[from], t = TYPES[to];
  const namedSheltered = ['traditionalIRA', 'traditional401k', 'rothIRA', 'roth401k', 'hsa'];
  const ownerRefusal = cross && namedSheltered.includes(from) && namedSheltered.includes(to) && f.cls === t.cls;
  const rothReverseRefusal = from === 'rothIRA' && to === 'roth401k';
  const conversionRefusal = f.cls === 'preTax' && t.cls === 'roth'
    && (cross || (from === 'traditionalIRA' && !['rothIRA', 'customRoth'].includes(to)));
  const payrollRefusal = t.group === 'workplace' && f.cls !== t.cls && !(f.cls === 'preTax' && t.cls === 'roth');
  const refused = ownerRefusal || rothReverseRefusal || conversionRefusal || payrollRefusal;
  const contribution = f.cls !== t.cls && ['ira', 'hsa'].includes(t.group) && !(f.cls === 'preTax' && t.cls === 'roth');
  const room = t.group === 'ira' ? 8600 : t.group === 'hsa' ? (joint ? 9750 : 5400) : 10000;
  const moved = refused ? 0 : contribution ? Math.min(10000, room) : 10000;
  const funding = from === 'traditionalIRA' && to === 'hsa' && !cross;
  let agi = joint ? 40000 : 20000;
  if (f.cls === 'preTax' && ['taxable', 'roth', 'hsa'].includes(t.cls) && !funding) agi += moved;
  if (f.cls === 'hsa' && t.cls !== 'hsa') agi += moved;
  if (contribution && !funding && (to === 'traditionalIRA' || to === 'hsa')) agi -= moved;
  const balances = { preTax: 0, roth: 0, hsa: 0 };
  if (f.cls !== 'taxable') balances[f.cls] += 10000 - moved;
  if (t.cls !== 'taxable') balances[t.cls] += moved;
  return { ownerRefusal, rothReverseRefusal, refused, moved, agi, balances,
    taxes: tax(agi, joint ? 40000 : 20000, joint, f.cls === 'hsa' && t.cls !== 'hsa' ? moved * 0.2 : 0) };
}
for (const owners of ['self-self', 'self-spouse', 'spouse-self', 'spouse-spouse']) for (const at of [60, 60.25, 60.75]) {
  for (const from of Object.keys(TYPES)) for (const to of Object.keys(TYPES)) {
    const [fromOwner, toOwner] = owners.split('-'), cross = fromOwner !== toOwner, joint = owners !== 'self-self';
    const p = plan(from, to, joint, at);
    p.accounts[1].owner = fromOwner;
    p.accounts[2].owner = toOwner;
    const x = run(p), e = route(from, to, cross, joint);
    {
      const row = x.row || {};
      const missingGuard = e.refused && !x.r.issues.some(i => /REFUSED/.test(i.code));
      check(`${from}->${to}, owners=${owners}, date=${at}`,
        { status: x.r.status, agi: row.federalAgi, taxes: row.taxes,
          preTax: row.preTax, roth: row.roth, hsa: row.hsa, missingGuard },
        { status: 'ok', agi: e.agi, taxes: e.taxes, ...e.balances, missingGuard: false }, 'matrix',
        { validation: x.validation.valid, legalRoute: e.ownerRefusal ? 'ordinary-owner-refusal' : e.rothReverseRefusal ? 'Roth-IRA-to-plan-refusal' : 'other' });
    }
  }
}

for (const type of Object.keys(TYPES)) {
  const p = plan(type, type);
  p.advanced.transferTo = 'src';
  check(`self no-op: ${type}`, { agi: run(p).row.federalAgi }, { agi: 20000 }, 'self');
}

// Distribution primitives expose a hand-sized transaction without a tax-funding feedback loop.
for (const type of Object.keys(TYPES)) for (const age of [50, 60, 65]) for (const share of [0, 50, 100]) {
  const p = plan(), a = account('draw', type, 10000, { basisPct: 60, qualifiedMedicalPct: share });
  const accounts = [a];
  const x = engine.withdrawFromAccountList(accounts, TYPES[type].cls, 1000, age, p, { self: 0, spouse: 0 }, accounts);
  const income = TYPES[type].cls === 'preTax' ? 1000 : TYPES[type].cls === 'hsa' ? 1000 * (1 - share / 100) : 0;
  const penalty = TYPES[type].cls === 'preTax' && age < 59.5 ? 100
    : TYPES[type].cls === 'hsa' && age < 65 ? income * 0.2 : 0;
  check(`draw ${type}, age=${age}, medical=${share}`,
    { taken: x.amount, income: x.income, penalty: x.penalty, gains: x.gains, balance: a.balance, earlyRoth: !!x.earlyRoth },
    { taken: 1000, income, penalty, gains: TYPES[type].cls === 'taxable' ? 400 : 0, balance: 9000,
      earlyRoth: TYPES[type].cls === 'roth' && age < 59.5 }, 'draw');
}

// These comparisons assume the closing age is the tax-year-end age. The documented
// age-based rows have no calendar anchor, so differences are conditional, not defects.
function contribution(type, startAge, owner = 'self') {
  const p = plan(type, 'taxable', owner === 'spouse');
  Object.assign(p.profile, { age: startAge, retireAge: startAge + 1, endAge: startAge + 1,
    spouseAge: startAge, spouseRetireAge: startAge + 1 });
  p.retirement.otherIncomes = [];
  p.retirement.dividendStart = startAge;
  p.advanced.transferOn = false;
  p.employment.salary = owner === 'self' ? 60000 : 0;
  p.employment.spouseSalary = owner === 'spouse' ? 60000 : 0;
  p.employment.contributionStop = startAge + 5;
  p.accounts[1] = account('src', type, 0, { owner, contribution: 40000, priorYearFicaWages: 60000 });
  const endAge = startAge + 1, t = TYPES[type];
  const limit = t.group === 'ira' ? 7500 + (endAge >= 50 ? 1100 : 0)
    : t.group === 'workplace' ? 24500 + ([60, 61, 62, 63].includes(endAge) ? 11250 : endAge >= 50 ? 8000 : 0)
    : t.group === 'hsa' ? (owner === 'spouse' ? 8750 : 4400) + (endAge >= 55 ? 1000 : 0) : 40000;
  const deductible = type === 'traditionalIRA' || type === 'traditional401k' || type === 'hsa';
  const x = run(p), row = x.row || {};
  const expectedAgi = 60000 - (deductible ? limit : 0);
  const taxFields = startAge < 64 ? { taxes: row.taxes } : {};
  const expectedTaxFields = startAge < 64 ? { taxes: tax(expectedAgi, type === 'hsa' ? 60000 - limit : 60000, owner === 'spouse') } : {};
  check(`contribution ${type}, ${owner}, ${startAge}->${endAge}`,
    { status: x.r.status, sheltered: t.cls === 'taxable' ? row.contributions : row[t.cls], agi: row.federalAgi, ...taxFields },
    { status: 'ok', sheltered: t.cls === 'taxable' ? 40000 : limit, agi: expectedAgi, ...expectedTaxFields },
    'contribution', { openingAge: startAge, assumedTaxYearEndAge: endAge, conditional: true });
}
for (const type of Object.keys(TYPES)) for (const age of [48, 49, 50, 54, 55, 59, 60, 62, 63, 64]) {
  for (const owner of ['self', 'spouse']) contribution(type, age, owner);
}

// Visible integration witnesses: different allocations make a prohibited same-class move observable.
for (const [label, from, to, cross] of [
  ['R30A-02 Roth IRA into Roth 401(k)', 'rothIRA', 'roth401k', false],
  ['R30A-03 living spouses IRA rollover', 'traditionalIRA', 'traditionalIRA', true],
  ['R30A-03 living spouses HSA rollover', 'hsa', 'hsa', true]
]) {
  const p = plan(from, to, cross, 60);
  p.advanced.assetClasses.push({ id: 'growing', name: 'Growing', returnRate: 10, volatility: 0 });
  p.accounts[2].allocation = { growing: 100 };
  const x = run(p), cls = TYPES[from].cls;
  check(label, { status: x.r.status, sheltered: x.row[cls] }, { status: 'ok', sheltered: 10000 }, 'witness');
}
const rollover = h.basisPlan();
rollover.accounts[2] = account('dst', 'traditional401k', 0);
rollover.advanced.transferAmount = 8600;
const rolled = run(rollover);
check('R30A-01 all-basis IRA -> workplace, later liquidation',
  { agi: rolled.row.federalAgi, taxes: rolled.row.taxes, networth: rolled.row.networth },
  { agi: 31000, taxes: 4207.5, networth: 181722 }, 'witness');
rollover.advanced.transferOn = false;
const noRoll = run(rollover);
check('CONTROL no all-basis rollover', { agi: noRoll.row.federalAgi, taxes: noRoll.row.taxes, networth: noRoll.row.networth },
  { agi: 31000, taxes: 4207.5, networth: 181722 }, 'witness');

for (const type of ['traditionalIRA', 'traditional401k', 'customTraditional']) {
  const p = h.plan({ balance: 100000, from: 'traditionalIRA', to: 'taxable', amount: 5000, at: 75, pension: 60000 });
  Object.assign(p.profile, { age: 75, retireAge: 75, endAge: 76 });
  p.retirement.dividendStart = 75;
  p.accounts[1] = account('src', type, 100000);
  p.advanced.rmdOn = true;
  const x = run(p);
  check(`RMD credit ${type}`, { preTax: x.row.preTax, agi: x.row.federalAgi, rmd: x.row.rmd, unmet: x.row.rmdUnmet },
    { preTax: 95000, agi: 65000, rmd: 100000 / 24.6, unmet: 0 }, 'rmd');
}

function working(types, contributions, joint = false) {
  const p = plan();
  Object.assign(p.profile, { spouseOn: joint, spouseAge: 55, spouseRetireAge: 56, filing: joint ? 'mfj' : 'single',
    age: 55, retireAge: 56, endAge: 56 });
  p.advanced.transferOn = false;
  p.employment.salary = 60000;
  p.employment.spouseSalary = 0;
  p.employment.contributionStop = 60;
  p.retirement.otherIncomes = [];
  p.accounts = [p.accounts[0], ...types.map((t, i) => account('item' + i, t, 0,
    { contribution: contributions[i], priority: i + 1, priorYearFicaWages: 60000 }))];
  return p;
}
for (const [types, amounts, expected] of [
  [['traditionalIRA', 'rothIRA'], [5000, 5000], { preTax: 5000, roth: 3600, agi: 55000 }],
  [['traditional401k', 'roth401k'], [20000, 20000], { preTax: 20000, roth: 12500, agi: 40000 }]
]) {
  const x = run(working(types, amounts));
  check('combined contribution group: ' + types.join('+'), { preTax: x.row.preTax, roth: x.row.roth, agi: x.row.federalAgi }, expected, 'controls');
}
const family = working(['hsa', 'hsa'], [9750, 1000], true);
family.accounts[2].owner = 'spouse';
const familyResult = run(family);
check('HSA family base plus two individual catch-ups', { hsa: familyResult.row.hsa, agi: familyResult.row.federalAgi },
  { hsa: 10750, agi: 49250 }, 'controls');
const comp = working(['traditionalIRA'], [8600]);
comp.employment.salary = 3000;
const compResult = run(comp);
check('IRA compensation cap', { preTax: compResult.row.preTax, agi: compResult.row.federalAgi }, { preTax: 3000, agi: 0 }, 'controls');
const phaseout = working(['rothIRA'], [8600]);
phaseout.employment.salary = 200000;
const phaseResult = run(phaseout);
check('Roth IRA above salary-proxy phaseout', { roth: phaseResult.row.roth, agi: phaseResult.row.federalAgi }, { roth: 0, agi: 200000 }, 'controls');
for (const type of ['traditional401k', 'roth401k']) for (const matchRoth of [false, true]) {
  const p = working([type], [10000]);
  Object.assign(p.accounts[1], { matchOn: true, matchCap: 5, matchRate: 100, matchRoth, vesting: 100 });
  const x = run(p);
  const preTax = (type === 'traditional401k' ? 10000 : 0) + (matchRoth ? 0 : 3000);
  const roth = (type === 'roth401k' ? 10000 : 0) + (matchRoth ? 3000 : 0);
  const agi = 60000 - (type === 'traditional401k' ? 10000 : 0) + (matchRoth ? 3000 : 0);
  check(`employer match: ${type}, Roth=${matchRoth}`, { preTax: x.row.preTax, roth: x.row.roth, agi: x.row.federalAgi },
    { preTax, roth, agi }, 'controls');
}
for (const type of ['rothIRA', 'roth401k']) {
  const p = h.plan();
  Object.assign(p.profile, { age: 75, retireAge: 75, endAge: 76 });
  p.accounts[1] = account('src', type, 100000);
  p.advanced.transferOn = false;
  p.advanced.rmdOn = true;
  const x = run(p);
  check('no lifetime Roth RMD: ' + type, { roth: x.row.roth, rmd: x.row.rmd }, { roth: 100000, rmd: 0 }, 'controls');
}
for (const rate of [-20, 10]) for (const at of [60, 60.25, 60.75]) {
  const p = plan('taxable', 'rothIRA', false, at);
  p.accounts[1].basisPct = 60;
  p.advanced.transferAmount = 5000;
  p.advanced.assetClasses[0].returnRate = rate;
  p.assumptions.returnRate = rate;
  const gain = 5000 - 3000 / Math.pow(1 + rate / 100, at - 60);
  const x = run(p);
  check(`taxable sale at date=${at}, return=${rate}`, { agi: x.row.federalAgi }, { agi: 20000 + gain }, 'controls');
}

const summary = Object.fromEntries([...new Set(results.map(x => x.group))].map(group => {
  const list = results.filter(x => x.group === group);
  return [group, { checks: list.length, pass: list.filter(x => x.verdict === 'PASS').length,
    mismatch: list.filter(x => x.verdict === 'MISMATCH').length,
    conditional: list.filter(x => x.verdict === 'CONDITIONAL').length }];
}));
const mismatches = results.filter(x => x.verdict === 'MISMATCH');
console.log(JSON.stringify({ planRuns, summary, mismatches: mismatches.length,
  conditionalDifferences: results.filter(x => x.verdict === 'CONDITIONAL').length,
  matrixFailuresByRoute: Object.fromEntries(['ordinary-owner-refusal', 'Roth-IRA-to-plan-refusal', 'other']
    .map(routeName => [routeName, mismatches.filter(x => x.group === 'matrix' && x.legalRoute === routeName).length])) }));
for (const x of results.filter(x => x.group === 'witness' || (x.group === 'contribution' && x.verdict === 'CONDITIONAL' && x.label.includes('self')))) {
  console.log(JSON.stringify(x));
}
if (process.argv.includes('--verbose')) for (const x of results.filter(x => x.group !== 'witness')) console.log(JSON.stringify(x));
process.exitCode = mismatches.length ? 1 : 0;

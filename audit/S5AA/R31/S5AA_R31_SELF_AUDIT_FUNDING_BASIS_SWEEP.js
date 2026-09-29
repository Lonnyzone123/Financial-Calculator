// S5AA R31 self-audit sweep: a qualified HSA funding distribution's basis is measured on its date and kept by the year-end
// settlement, across returns, IRA mixes, owners and a funding-year draw. Expectations are written from the rule (Notice 2008-51
// for the funding; Form 8606 pro rata at the year's end for the ordinary draw), never read from the engine. The plan is
// ChatGPT's basisPlan() (audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js) with the same knobs as
// tests/audit-s5aa-r31-hsa-funding-basis-at-the-funding-date.test.js.
//   node audit/S5AA/R31/S5AA_R31_SELF_AUDIT_FUNDING_BASIS_SWEEP.js [another checkout]
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..'));
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const CLASS = { taxable: 'taxable', traditionalIRA: 'preTax', traditional401k: 'preTax', hsa: 'hsa' };
function account(id, type, balance, extra) {
  return Object.assign({ id, name: id, type, taxClass: CLASS[type], owner: 'self', balance, basisPct: type === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    priority: id === 'cash' ? 0 : 2 }, extra || {});
}
function basisPlan(x) {
  const spouse = x.owner === 'spouse';
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = 'redirect';
  Object.assign(p.profile, { age: 60, retireAge: 63, endAge: 63, spouseOn: spouse, filing: spouse ? 'mfj' : 'single' });
  if (spouse) Object.assign(p.profile, { spouseAge: 60, spouseRetireAge: 63, spouseEndAge: 63 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: x.rate, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 64 });
  const expenses = [{ name: 'Drain', age: 62, amount: 100000 }];
  if (x.draw) expenses.unshift({ name: 'Funding-year draw', age: 61, amount: x.draw });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, dividendQualified: 100,
    dividendGrowth: 0, dividendStart: 60, pension: 0, pensionCola: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [],
    expenses, withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa',
    otherIncomes: [
      { name: 'Basis-year wages', type: 'employment', owner: x.owner, amount: 200000, start: 60, end: 61, growth: 0, growthMode: 'fixed' },
      { name: 'Later wages', type: 'employment', owner: x.owner, amount: 30000, start: 62, end: 63, growth: 0, growthMode: 'fixed' }] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, ltcOn: false, networthOn: true, otherAssets: [], debts: [],
    assetsOn: true, assetClasses: [{ id: 'flat', name: 'Flat', returnRate: x.rate, volatility: 0 }], rule55: false, penaltyException: false,
    transferOn: true, transferFrom: 'src', transferTo: 'dst', transferAmount: 5400, transferAge: 61 });
  p.accounts = [account('cash', 'taxable', 100000, { cashHolding: true, allocation: {}, owner: 'self' }),
    account('src', 'traditionalIRA', x.opening, { owner: x.owner, contribution: 8600, futureChanges: [{ age: 61, mode: 'set', value: 0 }, { age: 62, mode: 'set', value: 2000 }] }),
    account('dst', 'hsa', 0, { owner: x.owner }),
    account('work', 'traditional401k', 0, { owner: x.owner, contribution: 1000, futureChanges: [{ age: 61, mode: 'set', value: 0 }], priority: 4 })];
  return p;
}
function run(p) {
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
/* The rule: at 61 the IRA holds (opening + 8,600) x g; the funding takes its taxable value on that date first, then basis. A
   funding-year draw D at 61.5 is priced at the year's end on the basis left over (year-end value + D). At 62 the deductible $2,000
   goes in, and the drain empties the IRA and the 401(k) at 62.5. */
function expected(opening, rate, draw) {
  const g = 1 + rate / 100, s = Math.sqrt(g), atFunding = (opening + 8600) * g;
  let basis = 8600 - Math.min(8600, Math.max(0, 5400 - Math.max(0, atFunding - 8600)));
  const V = ((atFunding - 5400) * s - draw) * s;
  const fraction = draw > 0 ? Math.min(1, basis / (V + draw)) : 0;
  const year2 = draw * (1 - fraction);
  basis -= draw * fraction;
  // The drain empties the IRA, so its year's pro rata is basis over the whole draw, at most all of it: basis above value (a fall
  // of 20% below the nondeductible money) leaves nothing taxable, not a negative amount.
  const iraDraw = (V + 2000) * s, workDraw = 1000 * g * g * s;
  return { year2, year3: 30000 + Math.max(0, iraDraw - basis) + workDraw - 2000 };
}
let plans = 0, checks = 0;
const problems = [];
for (const rate of [-20, -10, -5, 0, 5, 10, 20]) for (const opening of [0, 2000, 20000]) for (const owner of ['self', 'spouse'])
for (const draw of [0, 1000]) {
  const r = run(basisPlan({ rate, opening, owner, draw }));
  plans++;
  const e = expected(opening, rate, draw);
  for (const [k, a, b] of [['year2', r.rows[2].federalAgi, e.year2], ['year3', r.rows[3].federalAgi, e.year3]]) {
    checks++;
    if (!(Math.abs(a - b) < 0.01)) problems.push(k + ' rate ' + rate + ' opening ' + opening + ' ' + owner + ' draw ' + draw + ': ' + a + ' against ' + b);
  }
}
console.log(JSON.stringify({ plans, checks, problems: problems.length }));
problems.slice(0, 20).forEach((x) => console.log('  ' + x));
console.log(problems.length ? 'SWEEP FAILED' : 'SWEEP PASSED');
process.exitCode = problems.length ? 1 : 0;

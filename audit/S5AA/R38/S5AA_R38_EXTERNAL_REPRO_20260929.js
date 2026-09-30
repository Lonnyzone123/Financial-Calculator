'use strict';
// Public runPlan witnesses for the adjacent report. Run from the repository root:
// node audit/S5AA/R38/S5AA_R38_EXTERNAL_REPRO_20260929.js
// The script reads the app's actual default and rules and changes no files.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const shell = fs.readFileSync(path.join(root, 'src', 'app-shell.html'), 'utf8');
const rules = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
const defaultPlan = shell.match(/var defaultPlan=(\{.*?\});/);
if (!rules || !defaultPlan) throw new Error('Could not find the app rules or default plan');
global.RULES = JSON.parse(rules[1]);
require(path.join(root, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(root, 'src', 'engine.js'));
const validator = require(path.join(root, 'src', 'scenario-validator.js'));
const defaults = eval('(' + defaultPlan[1] + ')'); // Same extraction used by prior S5AA audit witnesses.

function plan(age, retireAge, endAge, salary) {
  const p = JSON.parse(JSON.stringify(defaults));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge, endAge, filing: 'single', spouseOn: false });
  Object.assign(p.employment, { salary, spouseSalary: 0, growth: 0, contributionStop: retireAge });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false,
    pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [];
  return p;
}
function account(extra) {
  return Object.assign({ id: 'a', name: 'A', type: 'traditional401k', taxClass: 'preTax',
    owner: 'self', balance: 0, contribution: 0, contributionMode: 'amount', annualChange: 0,
    annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [],
    allocation: {}, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0,
    vesting: 100, priority: 1 }, extra);
}
function result(p) {
  const v = validator.validateScenario(p);
  if (!v.valid) throw new Error('Witness is invalid: ' + JSON.stringify(v.issues));
  const r = engine.runPlan(p);
  if (r.status !== 'ok') throw new Error('Witness did not calculate: ' + r.status);
  return r;
}
function row(r, age) {
  const found = r.rows.find(x => x.age === age);
  if (!found) throw new Error('Missing row age ' + age);
  return found;
}
function show(id, expected, actual, detail) {
  console.log(JSON.stringify({ id, expected, actual, difference: actual - expected, ...detail }));
}

// R38-01: the row covers a full model tax year but employment lasts half of it.
// Dollar inputs describe an annual rate. The actual half-year deposits remain
// below their respective full-year statutory limits.
for (const c of [
  { id: 'R38-01 IRA', salary: 100000, account: { type: 'traditionalIRA', contribution: 10000 }, expected: 5000 },
  { id: 'R38-01 401k', salary: 100000, account: { contribution: 30000 }, expected: 15000 },
  { id: 'R38-01 415c', salary: 300000, account: { contribution: 24500, profitShare: 20 }, expected: 42250 },
  { id: 'R38-01 401a17', salary: 500000, account: { contribution: 1000, profitShare: 10 }, expected: 25500 }
]) {
  const p = plan(45, 45.5, 46.5, c.salary);
  p.accounts = [account(c.account)];
  show(c.id, c.expected, row(result(p), 46).contributions, { retirementAge: 45.5 });
}

// R38-02: transfer happens at 55.5, six months after separation at 55.
// Federal 2026-equivalent $3,820 + Arizona $847.50 = $4,667.50.
// The observed extra $5,000 is exactly 10% of the $50,000 distribution.
{
  const p = plan(54.5, 55, 56, 0);
  Object.assign(p.retirement, { dividendOn: true, dividendYield: 0 });
  Object.assign(p.advanced, { transferOn: true, transferAge: 55.5, transferAmount: 50000,
    transferFrom: 'w', transferTo: 't', rule55: true, penaltyException: false });
  p.accounts = [
    account({ id: 'w', name: 'Current employer 401k', balance: 900000, currentEmployerPlan: true }),
    account({ id: 't', name: 'Taxable', type: 'taxable', taxClass: 'taxable', balance: 300000, basisPct: 100 })
  ];
  const actual = row(result(p), 56).taxes;
  p.advanced.penaltyException = true;
  const exceptionControl = row(result(p), 56).taxes;
  show('R38-02 rule55', 4667.5, actual, { exceptionControl });
}

// R38-03: five years of prior service plus the first full row reaches six
// completed years and 100% vesting under the model's graded schedule. The
// second row's $3,000 elected Roth match is nevertheless credited pretax.
{
  const p = plan(63, 64.5, 65.5, 100000);
  p.accounts = [account({ type: 'roth401k', taxClass: 'roth', contribution: 6000,
    matchOn: true, matchRate: 100, matchCap: 6, matchRoth: true,
    vesting: 80, yearsOfService: 5 })];
  const x = row(result(p), 65);
  console.log(JSON.stringify({ id: 'R38-03 Roth match', expectedPretax: 6000,
    actualPretax: x.preTax, expectedRothBeforeTaxFunding: 12000,
    actualRoth: x.roth, actualTax: x.taxes,
    expectedAddedOrdinaryIncome: 3000, expectedAddedTaxAtMarginal14_5Pct: 435 }));
}

// R38-04: claim at 67.5 is one year after plan start (66.5) and halfway
// through the age-67-to-68 row. PIA $2,000 x 1.10 COLA x 1.04 delay x 6
// paid months = $13,728; the row-opening PIA produces only $12,480.
{
  const p = plan(66.5, 66.5, 68, 0);
  Object.assign(p.retirement, { ssBenefit: 2000, ssClaim: 67.5, ssCola: 10 });
  show('R38-04 midrow COLA', 13728, row(result(p), 68).income, { claimAge: 67.5 });
}

// R38-05 (conditional): after self's death at 74.5, the survivor owns the
// 401(k) but the deceased participant's current-employer flag survives.
// Compare the model's same-balance IRA destination. The latter's age-75 RMD
// is the $96,078.43 opening balance / the Uniform Table's 24.6 divisor.
{
  const p = plan(74, 85, 76, 0);
  Object.assign(p.profile, { spouseOn: true, spouseAge: 74, filing: 'mfj' });
  Object.assign(p.employment, { spouseSalary: 100000 });
  Object.assign(p.retirement, { selfLife: 74.5, spouseLife: 100 });
  p.advanced.rmdOn = true;
  p.accounts = [account({ owner: 'self', balance: 100000, currentEmployerPlan: true })];
  const oldEmployerPlan = row(result(p), 76).rmd;
  p.accounts[0].type = 'traditionalIRA';
  const ownIraDestination = row(result(p), 76).rmd;
  console.log(JSON.stringify({ id: 'R38-05 survivor RMD (destination decision)',
    inherited401kCurrentEmployerFlag: oldEmployerPlan,
    ownIraDestination, handIraRmd: (100000 - 100000 / 25.5) / 24.6 }));
}

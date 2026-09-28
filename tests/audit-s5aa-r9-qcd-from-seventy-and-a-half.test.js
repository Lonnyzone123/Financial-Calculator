/* S5AA R9 round, the owner's decision Q3 (2026-09-21): A QCD IS ALLOWED FROM 70 1/2, WHETHER OR NOT A REQUIRED DISTRIBUTION
 * IS DUE, AND COUNTS TOWARD ONE ONCE IT IS.
 *
 * IRC 408(d)(8)(B)(ii): a qualified charitable distribution is one made on or after the day the IRA owner attains
 * age 70 1/2. The provision has no link to the required beginning date -- SECURE (2019) and SECURE 2.0 raised the RMD
 * age to 72, 73 and 75 and left the QCD age at 70 1/2. The exclusion is capped per owner per year (Notice 2025-67:
 * $111,000 for 2026), and once a required distribution is due, the QCD counts toward it.
 *
 * DeepSeek audit finding 2c/01 (reproduced at 623cf64): the engine modelled a QCD only as part of the RMD -- nothing
 * before the owner's RMD start age, never more than the RMD, and nothing at all with the RMD rules switched off. A
 * 71-year-old's $10,000 request gave nothing until 73.
 *
 * What does not change: the split across owners by each one's own traditional-IRA balance, the per-owner annual cap,
 * payment from that owner's own traditional IRAs, the exclusion being what was PAID, and a QCD crediting only its own
 * owner's IRA obligation. The opening-year disclosure (S5R-03) now follows the same eligibility: any eligible person,
 * self OR spouse (DeepSeek finding 4c/01: it was silent when only the spouse was past 70 1/2).
 *
 * Expected values are derived here, not measured. Returns, inflation and spending are zero, so an IRA's balance moves
 * only by what is distributed from it.
 * Tested through runPlan only.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);
const CAP = RULES.retirement.qcd.records.filter((r) => r.provision_id === 'qcd_annual_cap')[0].value;

const account = (id, owner, type, taxClass, balance) => ({ id, name: id, owner, type, taxClass, balance, basisPct: taxClass === 'taxable' ? 100 : 0,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
  futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 });
const ira = (owner, balance) => account('ira-' + owner, owner, 'traditionalIRA', 'preTax', balance);
const k401 = (owner, balance) => account('k401-' + owner, owner, 'traditional401k', 'preTax', balance);

function run({ age, spouseAge = null, qcd, accounts, rmdOn = true, years = 3 }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const spouse = spouseAge !== null;
  Object.assign(p.profile, { age, retireAge: 60, endAge: Math.floor(age) + years, spouseOn: spouse, spouseAge: spouse ? spouseAge : age, filing: spouse ? 'mfj' : 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, otherIncomes: [], stages: [], expenses: [], dividendOn: false, selfLife: 100, spouseLife: 100 });
  Object.assign(p.advanced, { rmdOn, qcd, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = accounts.map((a, i) => Object.assign({}, a, { priority: i + 1 }));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const row = (r, label) => r.rows.find((x) => Math.abs(x.age - label) < 1e-9);
/* What left the IRAs in the row ending at `label`: the previous row's closing balance minus this row's. rows[0] is the
   plan's opening snapshot, labelled with the start age. With zero returns this is exactly what was distributed. */
const iraOut = (r, label) => { const i = r.rows.findIndex((x) => Math.abs(x.age - label) < 1e-9); return Number(r.rows[i - 1].preTax) - Number(r.rows[i].preTax); };

test('Q3: a 71-year-old\'s QCD is paid from the IRA and excluded, two years before any RMD is due', () => {
  /* Born 1955: the RMD starts at 73. The row opening at 71 (label 72) has no RMD. */
  const without = run({ age: 71, qcd: 0, accounts: [ira('self', 500000)] });
  const withQcd = run({ age: 71, qcd: 10000, accounts: [ira('self', 500000)] });
  assert.equal(iraOut(without, 72), 0, 'CONTROL: nothing leaves the IRA before the RMD age');
  assert.equal(iraOut(withQcd, 72), 10000, 'the $10,000 QCD leaves the IRA at 71');
  assert.equal(Number(row(withQcd, 72).magi), Number(row(without, 72).magi), 'and none of it is income');
  assert.equal(Number(row(withQcd, 72).taxes), Number(row(without, 72).taxes));
});

test('Q3: the eligibility age is 70 1/2 on the owner\'s own clock -- 70 gives nothing, 70.5 gives the QCD', () => {
  const at70 = run({ age: 70, qcd: 10000, accounts: [ira('self', 500000)], years: 1 });
  const at705 = run({ age: 70.5, qcd: 10000, accounts: [ira('self', 500000)], years: 1 });
  assert.equal(iraOut(at70, 71), 0, 'the row opening at 70 is before 70 1/2');
  /* The request is a yearly amount prorated over the row: the row from 70.5 to 71 is half a year. */
  assert.equal(iraOut(at705, 71), 5000, 'half a year of a $10,000 yearly request');
});

test('Q3: past the RMD age, a QCD larger than the RMD is paid in full -- the RMD is a floor, not a cap', () => {
  const divisor = RULES.retirement.rmd.uniformLifetime['80'];
  const rmd = 100000 / divisor;
  const withQcd = run({ age: 80, qcd: 20000, accounts: [ira('self', 100000)], years: 1 });
  const without = run({ age: 80, qcd: 0, accounts: [ira('self', 100000)], years: 1 });
  assert.ok(Math.abs(iraOut(without, 81) - rmd) < 0.01, 'CONTROL: the RMD alone is ' + rmd.toFixed(2));
  assert.ok(Math.abs(iraOut(withQcd, 81) - 20000) < 0.01, 'the whole $20,000 QCD leaves the IRA, and it covers the RMD');
  /* All of the RMD is discharged by the QCD, so nothing distributed is income; without it the RMD was. */
  assert.ok(Math.abs((Number(row(without, 81).magi) - Number(row(withQcd, 81).magi)) - rmd) < 0.01, 'the RMD stops being income');
});

test('Q3: a QCD does not depend on the RMD rules being switched on', () => {
  const r = run({ age: 75, qcd: 10000, accounts: [ira('self', 500000)], rmdOn: false, years: 1 });
  assert.equal(iraOut(r, 76), 10000);
});

test('Q3: unchanged -- the per-owner annual cap, and a QCD comes only from a traditional IRA', () => {
  const big = run({ age: 72, qcd: 250000, accounts: [ira('self', 6000000)], years: 1 });
  assert.equal(iraOut(big, 73), CAP, 'one owner, capped at $' + CAP);
  const only401k = run({ age: 72, qcd: 10000, accounts: [k401('self', 500000)], years: 1 });
  assert.equal(iraOut(only401k, 73), 0, 'a 401(k) cannot make a QCD');
});

test('Q3: a spouse past 70 1/2 gives from their own IRA while the younger self gives nothing', () => {
  const r = run({ age: 65, spouseAge: 71, qcd: 10000, accounts: [ira('self', 300000), ira('spouse', 300000)], years: 1 });
  assert.equal(iraOut(r, 66), 10000, 'the whole request goes to the only eligible owner');
});

const CODE = 'QCD_OPENING_YEAR_CAP_ASSUMED';
const disclosed = (opts) => (run(opts).issues || []).filter((i) => i.code === CODE).length;

test('Q3 with DeepSeek finding 4c/01: the opening-year cap disclosure follows the same eligibility', () => {
  assert.equal(disclosed({ age: 71.5, qcd: 10000, accounts: [ira('self', 500000)], years: 1 }), 1,
    'a partial opening row at 71 1/2, before the RMD age: a QCD can now apply, so it is disclosed');
  assert.equal(disclosed({ age: 66.5, spouseAge: 71.5, qcd: 10000, accounts: [ira('self', 100000), ira('spouse', 100000)], years: 1 }), 1,
    'only the spouse is past 70 1/2: disclosed (it was silent)');
  assert.equal(disclosed({ age: 66.5, spouseAge: 66.5, qcd: 10000, accounts: [ira('self', 100000)], years: 1 }), 0,
    'CONTROL: nobody eligible, nothing to disclose');
  assert.equal(disclosed({ age: 72, qcd: 10000, accounts: [ira('self', 100000)], years: 1 }), 0,
    'CONTROL: a whole opening row assumes nothing');
});

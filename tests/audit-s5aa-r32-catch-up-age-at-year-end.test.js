/* S5AA R32: A CATCH-UP LIMIT READS THE AGE THE OWNER REACHES BY THE YEAR'S END (raised as a conditional difference, not a finding,
 * in ChatGPT's R30A account audit of 66c406c; the owner 2026-09-28: "Use the year-end age").
 *
 * The rules, read at their sources, all test the age reached by the close of the taxable year:
 *   - IRC 219(b)(5)(B), the IRA catch-up: "an individual who has attained the age of 50 before the close of the taxable year";
 *   - IRC 414(v)(5)(A), a 401(k) catch-up: a participant "who would attain age 50 by the end of the taxable year";
 *   - IRC 414(v)(2)(B)(i), the ages 60-63 amount: one "who would attain age 60 but would not attain age 64 before the close of the
 *     taxable year";
 *   - IRC 223(b)(3)(A), the HSA catch-up: "an individual who has attained age 55 before the close of the taxable year".
 * The engine tested the owner's age at the row's OPENING, so the row in which an owner turns 50 (or 55, or 60) was denied the
 * catch-up, and the row in which an owner turns 64 still had the 60-63 amount. The model has no calendar (MODEL_ASSUMPTIONS.md
 * sections 4 and 14); the owner's decision treats each projection row as a tax year and reads the age at its close. Other age rules
 * -- the 59 1/2 test the owner decided reads the transfer's date or the year's opening -- are unchanged.
 *
 * 2026 limits (RULES): IRA $7,500 + $1,100 at 50; 401(k) $24,500 + $8,000 at 50, or $11,250 at 60-63; HSA $4,400 self-only / $8,750
 * family + $1,000 at 55. Each plan: one row, $60,000 of salary, $40,000 asked of the account, 0% returns, the redirect policy.
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const CLASS = { traditionalIRA: 'preTax', traditional401k: 'preTax', rothIRA: 'roth', roth401k: 'roth', hsa: 'hsa' };
function plan(type, startAge, owner) {
  const spouse = owner === 'spouse';
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = 'redirect';
  Object.assign(p.profile, { age: startAge, retireAge: startAge + 1, endAge: startAge + 1, spouseOn: spouse, filing: spouse ? 'mfj' : 'single' });
  if (spouse) Object.assign(p.profile, { spouseAge: startAge, spouseRetireAge: startAge + 1, spouseEndAge: startAge + 1 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: spouse ? 0 : 60000, spouseSalary: spouse ? 60000 : 0, growth: 0, contributionStop: startAge + 5 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, pensionCola: 0, ssBenefit: 0,
    spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [], withdrawalOrder: 'manual', manualOrder: 'taxable,preTax,roth,hsa' });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, ltcOn: false, networthOn: true, otherAssets: [], debts: [],
    assetsOn: true, assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }], rule55: false, penaltyException: false, transferOn: false });
  const acct = (id, t, extra) => Object.assign({ id, name: id, type: t, taxClass: t === 'taxable' ? 'taxable' : CLASS[t], owner: 'self',
    balance: 0, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
    changeTiming: 'year', futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0,
    vesting: 100, priority: 2 }, extra || {});
  p.accounts = [acct('cash', 'taxable', { balance: 100000, cashHolding: true, allocation: {}, priority: 0 }),
    acct('src', type, { owner: owner, contribution: 40000, priorYearFicaWages: 60000 })];
  return p;
}
function sheltered(type, startAge, owner) {
  const p = plan(type, startAge, owner || 'self');
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r.rows[1][CLASS[type]];
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

test('the row an owner turns 50 has the catch-up: IRA $8,600, 401(k) $32,500 (were $7,500 and $24,500)', () => {
  near(sheltered('traditionalIRA', 49), 8600, 'traditional IRA, 49 -> 50');
  near(sheltered('rothIRA', 49), 8600, 'Roth IRA, 49 -> 50');
  near(sheltered('traditional401k', 49), 32500, 'traditional 401(k), 49 -> 50');
  near(sheltered('roth401k', 49), 32500, 'Roth 401(k), 49 -> 50');
});

test('the row an owner turns 60 has the 60-63 amount, $35,750 (was $32,500); the row an owner turns 64 does not, $32,500 (was $35,750)', () => {
  near(sheltered('traditional401k', 59), 35750, '59 -> 60');
  near(sheltered('traditional401k', 63), 32500, '63 -> 64');
  near(sheltered('roth401k', 63), 32500, 'Roth 401(k), 63 -> 64');
});

test('the row an owner turns 55 has the HSA catch-up: $5,400 self-only (was $4,400), and $9,750 for a spouse on family coverage', () => {
  near(sheltered('hsa', 54), 5400, 'self, 54 -> 55');
  near(sheltered('hsa', 54, 'spouse'), 9750, 'spouse, 54 -> 55, family');
});

test('CONTROLS: rows wholly on one side of an age are unchanged -- 48 -> 49 has none, 50 -> 51 and 60 -> 61 keep theirs', () => {
  near(sheltered('traditionalIRA', 48), 7500, 'IRA 48 -> 49');
  near(sheltered('traditionalIRA', 50), 8600, 'IRA 50 -> 51');
  near(sheltered('traditional401k', 60), 35750, '401(k) 60 -> 61');
  near(sheltered('traditional401k', 64), 32500, '401(k) 64 -> 65');
  near(sheltered('hsa', 55), 5400, 'HSA 55 -> 56');
});

/* S5AA R26 round: THE TAX QUOTE AND THE COMMITTED TAX READ AN IRA DEDUCTION WITH ONE RULE (the owner 2026-09-26: "Same rule in
 * both", the rule the law supports).
 *
 * The row's ordinary income was FLOORED at zero after the IRA deduction -- max(0, ordinary before the IRA - deduction) --
 * and the tax quote priced its funding draw on that; the committed tax recomputed ordinary income WITHOUT the floor. So a
 * deduction larger than ordinary income was lost in the quote and kept at commit, the two disagreed, and the row ended
 * in TAX_SETTLEMENT_MISMATCH (R25, SA25-10; after the R26 compensation cap it still happens under limitPolicy "warn",
 * which lets an over-compensation contribution through).
 *
 * The law: adjusted gross income is gross income minus the section 219 IRA deduction (IRC 62(a)(7)), and gross income
 * includes dividends and gains; the preferential rates apply to adjusted net capital gain "or, if less, taxable income"
 * (IRC 1(h)(1)). So a deduction beyond ordinary income reduces the income taxed at the preferential rates. The engine's
 * estimateTaxes() already computes that from a negative ordinary figure (federal AGI includes it; the taxable gains are
 * reduced by min(0, ordinary)). The floor is removed, so the quote and the commit use the same figure.
 *
 * The witness is exact by construction: a single person, no salary, $30,000 of qualified dividends ($1,000,000 at 3%,
 * all qualified), 0% return, and the tax paid from a cash holding so that it cannot change the dividend. Federal tax is $0 with or without a $7,000 IRA deduction (the dividends stay in the 0%
 * bracket). Arizona taxes them at its flat 2.5% on Arizona taxable income, which starts from federal AGI, so the $7,000
 * deduction saves 2.5% x $7,000 = $175.
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

const acct = (id, type, taxClass, balance, contribution, o = {}) => Object.assign({ id, name: id, type, taxClass, owner: 'self',
  balance, basisPct: taxClass === 'taxable' ? 100 : 0, contribution, contributionMode: 'amount', annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0,
  matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }, o);

function run(iraContribution) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 40, retireAge: 55, endAge: 41, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 55 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 3, dividendQualified: 100,
    dividendGrowth: 0, dividendStart: 55, pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [] });
  Object.assign(p.advanced, { assetsOn: false, rmdOn: false, transferOn: false, conversionOn: false, healthOn: false,
    networthOn: true, otherAssets: [], debts: [] });
  /* "warn" lets a contribution above compensation through, so the deduction exceeds ordinary income ($0 here). */
  p.limitPolicy = 'warn';
  /* The tax is paid from a household cash holding, which earns nothing and carries no dividend, so the $1,000,000 that
     yields the dividends is never drawn and the $30,000 is the same in both plans. (Drawn from the dividend account
     itself, the dividend is figured on the balance after the tax, so the tax would feed back into the dividend.) */
  p.accounts = [acct('cash', 'taxable', 'taxable', 50000, 0, { priority: 1, cashHolding: true }),
    acct('invest', 'taxable', 'taxable', 1000000, 0, { priority: 3 }), acct('ira', 'traditionalIRA', 'preTax', 0, iraContribution, { priority: 2 })];
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  return engine.runPlan(p);
}

test('R26: an IRA deduction beyond ordinary income no longer ends the row in TAX_SETTLEMENT_MISMATCH (it did)', () => {
  const r = run(7000);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode + ' at ' + r.calculationErrorAge);
});

/* RE-FIXTURED BY INTENT at S5AA R33 (SA32F-31): this witness reached a deduction larger than ordinary income only because "warn"
   let a $7,000 IRA contribution with NO compensation be deducted. IRC 219(b)(1)(B) limits the deduction to compensation, so the
   lawful deduction here is $0 under any policy: "warn" keeps the deposit, not the deduction. The R26 guarantee this file holds --
   the quote and the commit read one rule, so the row ends ok -- is the first test above, and it still holds. */
test('R26 / R33: a contribution with no compensation deducts nothing even under "warn" -- the tax is the same as without it', () => {
  const withIra = run(7000), without = run(0);
  assert.equal(without.status, 'ok');
  assert.equal(withIra.status, 'ok');
  assert.ok(Math.abs(without.rows[1].taxes - withIra.rows[1].taxes) < 0.005,
    'no compensation, no deduction: ' + without.rows[1].taxes + ' vs ' + withIra.rows[1].taxes);
});

test('R26 / R33 CONTROL: the federal AGI is the $30,000 of dividends with or without the uncompensated contribution', () => {
  const withIra = run(7000), without = run(0);
  assert.ok(Math.abs(without.rows[1].federalAgi - 30000) < 0.005, 'no contribution: ' + without.rows[1].federalAgi);
  assert.ok(Math.abs(withIra.rows[1].federalAgi - 30000) < 0.005, 'uncompensated contribution: ' + withIra.rows[1].federalAgi);
  assert.ok(withIra.rows[1].preTax > 6999, 'CONTROL: "warn" still deposits it: ' + withIra.rows[1].preTax);
});

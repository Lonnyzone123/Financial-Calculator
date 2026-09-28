/* S5AA R6 external audit, EA-04: one spouse's IRA distribution consumed the other spouse's Form 8606 basis.
 *
 * The distribution itself was priced on the OWNER's pool (Q87 step 2), but the basis it recovered was
 * summed into one household scalar and taken off at the end of the row IN PROPORTION to the two owners'
 * balances of basis. Form 8606 is filed per person and basis never combines between spouses, so that
 * proportional split moved basis from one return to the other. MEASURED at 5c985c0 (the auditor's repro,
 * reproduced below): each spouse holds $7,500 of basis in a $7,500 IRA; the self's IRA is drawn in full
 * (correctly tax-free), and the next year the spouse's OWN $7,500 draw showed $3,750 of federal AGI,
 * because half the self's recovery had been taken from the spouse.
 *
 * The recovery is now keyed by owner inside the transaction and taken off THAT owner's basis at once --
 * no household total, no proportional split. Taking it off at once also keeps the pro-rata fraction
 * constant across several draws in one row, which EA-05's same-row case depends on.
 *
 * Basis arises only from nondeductible contributions made inside the projection (the engine has no
 * opening-basis input), so each fixture builds it: both spouses earn $200,000 and are covered by a
 * workplace plan, so a traditional IRA contribution in the one working year (the row opening at 45) is
 * wholly nondeductible. Rows are labelled by the age at which they END. Tested through runPlan only.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const acct = (id, type, taxClass, owner, balance, extra) => Object.assign({
  id, name: id, type, taxClass, owner, balance, basisPct: taxClass === 'taxable' ? 100 : 0,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority: 1,
}, extra || {});

/* selfIra / spouseIra: [opening balance, nondeductible contribution in the working year]. */
function run(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 45, spouseAge: 45, retireAge: 46, endAge: 50, spouseOn: true, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 200000, spouseSalary: 200000, growth: 0, contributionStop: 46 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false,
    stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 95,
    withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa',
  }, o.retirement);
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, penaltyException: true, qcd: 0, debts: [], otherAssets: [] });
  p.accounts = [
    acct('ira-self', 'traditionalIRA', 'preTax', 'self', o.selfIra[0], { contribution: o.selfIra[1], priority: 1 }),
    acct('ira-spouse', 'traditionalIRA', 'preTax', 'spouse', o.spouseIra[0], { contribution: o.spouseIra[1], priority: 2 }),
    /* A $1 Roth 401(k) deferral each: it makes both workplace-covered (IRC 219(g)) without adding a
       pre-tax dollar that a draw could reach. */
    acct('r401-self', 'roth401k', 'roth', 'self', 0, { contribution: 1, priority: 8 }),
    acct('r401-spouse', 'roth401k', 'roth', 'spouse', 0, { contribution: 1, priority: 8 }),
    acct('cash', 'taxable', 'taxable', 'self', 0, { priority: 9 }),
  ];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const agi = (r, label) => Number(r.rows.find((x) => x.age === label).federalAgi);
const preTax = (r, label) => Number(r.rows.find((x) => x.age === label).preTax);

test('EA-04: two spouses\' basis is two pools -- the self\'s draw does not spend the spouse\'s basis', () => {
  /* The auditor's repro: $7,500 of basis each; $7,500 of spending a year, drawn from the self's IRA
     first (priority), then the spouse's. */
  const r = run({ selfIra: [0, 7500], spouseIra: [0, 7500], retirement: { spending: 7500 } });
  assert.equal(preTax(r, 47).toFixed(0), '7500', 'CONTROL: the self\'s IRA is empty after the first year, the spouse\'s is whole');
  assert.equal(agi(r, 47).toFixed(2), '0.00', 'the self\'s draw is all basis');
  assert.equal(agi(r, 48).toFixed(2), '0.00',
    'the spouse\'s own draw is all THEIR basis -- not $3,750, which is half the self\'s recovery taken from the spouse');
});

test('EA-04: asymmetric basis -- a draw on the self alone leaves the spouse\'s basis whole', () => {
  const r = run({ selfIra: [0, 2000], spouseIra: [0, 7500], retirement: { spending: 2000 } });
  assert.equal(agi(r, 47).toFixed(2), '0.00', 'the self draws their own $2,000 of basis');
  /* Every later year draws the spouse's IRA, $2,000 at a time: all basis, every time. */
  for (const label of [48, 49, 50]) assert.equal(agi(r, label).toFixed(2), '0.00', 'row ' + label);
});

test('EA-04: both owners drawn in one row -- each basis falls by that owner\'s own recovery only', () => {
  /* Self: $8,000 of deductible opening balance plus $2,000 of basis -- a pool of $10,000 that is 20% basis.
     Spouse: $7,500 that is all basis. $12,500 of spending in the first retired year empties the self's IRA
     (recovering $2,000) and takes $2,500 of the spouse's (recovering $2,500). The next year draws the spouse's
     remaining $5,000, which is the rest of their basis and tax-free. */
  const r = run({ selfIra: [8000, 2000], spouseIra: [0, 7500], retirement: { spending: 12500 } });
  assert.equal(agi(r, 47).toFixed(2), '8000.00', 'the self\'s $8,000 of deductible money is income; both recoveries are not');
  const spouseLeft = preTax(r, 47);
  assert.equal(spouseLeft.toFixed(0), '5000', 'CONTROL: $5,000 of the spouse\'s IRA is left');
  assert.equal(agi(r, 48).toFixed(2), '0.00',
    'the spouse\'s remaining $5,000 is their remaining $5,000 of basis -- none of it went to the self\'s return');
});

test('EA-04 control: with no basis anywhere, every IRA dollar is ordinary income as before', () => {
  const r = run({ selfIra: [7500, 0], spouseIra: [7500, 0], retirement: { spending: 7500 } });
  assert.equal(agi(r, 47).toFixed(2), '7500.00');
  assert.equal(agi(r, 48).toFixed(2), '7500.00');
});

test('EA-04: after a spousal rollover, the survivor spends the rolled basis once and only from their own pool', () => {
  /* The spouse dies at 46; Q4 rolls their $7,500 IRA and its $7,500 of basis to the self from the row
     opening at 47. The self then holds $9,500 of IRA that is all basis: $2,000 of their own and the rolled
     $7,500. Drawing it over two years must be tax-free throughout, with no basis spent twice. */
  const r = run({ selfIra: [0, 2000], spouseIra: [0, 7500], retirement: { spouseLife: 46, spending: 4750 } });
  for (const label of [47, 48, 49]) assert.equal(agi(r, label).toFixed(2), '0.00', 'row ' + label);
  assert.equal(preTax(r, 48).toFixed(0), '0', 'CONTROL: the $9,500 is gone by then');
});

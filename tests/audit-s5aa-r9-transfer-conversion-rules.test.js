/* S5AA R9 round, FIFTH INTERNAL AUDIT, finding 2: A MANUAL TRANSFER FROM PRE-TAX TO ROTH IS A CONVERSION, AND OBEYS
 * THE CONVERSION RULES.
 *
 * The transfer feature (advanced.transferOn) moves money between two chosen accounts, and a pre-tax to Roth transfer is
 * already treated as a conversion for tax (CR2-01: its income is recognised wherever it lands). But it moved the money
 * whatever the destination. MEASURED at a2ef8fd:
 *   - self's traditional IRA -> the SPOUSE's Roth IRA: $20,000 moved. A conversion is the owner's own rollover
 *     contribution to THEIR Roth (IRC 408A(d)(3)); Q97 made that a condition for the conversion route, not this one;
 *   - self's traditional IRA -> self's Roth 401(k): $20,000 moved. Decision 10 (6701577) made that unlawful for the
 *     conversion route, not this one.
 * Both went through silently. One rule now serves both routes (lawfulConversionDestination()): the destination must be the
 * source owner's own, and a traditional IRA's must be a Roth IRA or a custom tax-free account. A transfer that breaks it
 * moves nothing, and TRANSFER_CONVERSION_REFUSED says why. Transfers that are not pre-tax to Roth are unchanged.
 * Tested through runPlan.
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

const acct = (o) => Object.assign({ name: o.id, owner: 'self', basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority: 1 }, o);
const IRA = acct({ id: 'ira', type: 'traditionalIRA', taxClass: 'preTax', balance: 100000 });
const K401 = acct({ id: 'k401', type: 'traditional401k', taxClass: 'preTax', balance: 100000 });
const CASH = acct({ id: 'cash', type: 'taxable', taxClass: 'taxable', basisPct: 100, balance: 500000, priority: 9 });
const dest = { rothIra: acct({ id: 'rothIra', type: 'rothIRA', taxClass: 'roth', balance: 0, priority: 2 }),
  roth401: acct({ id: 'roth401', type: 'roth401k', taxClass: 'roth', balance: 0, priority: 2 }),
  spouseRothIra: acct({ id: 'spouseRothIra', type: 'rothIRA', taxClass: 'roth', owner: 'spouse', balance: 0, priority: 2 }),
  custRoth: acct({ id: 'custRoth', type: 'customRoth', taxClass: 'roth', balance: 0, priority: 2 }),
  spouseCash: acct({ id: 'spouseCash', type: 'taxable', taxClass: 'taxable', basisPct: 100, owner: 'spouse', balance: 0, priority: 3 }) };

function transfer(source, to) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 61, spouseOn: true, spouseAge: 60, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, otherIncomes: [] });
  Object.assign(p.advanced, { transferOn: true, transferAge: 60, transferFrom: source.id, transferTo: to.id, transferAmount: 20000, rmdOn: false, conversionOn: false });
  p.accounts = [source, to, CASH];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return { moved: 100000 - Number(r.rows[1].preTax), refused: (r.issues || []).filter((i) => i.code === 'TRANSFER_CONVERSION_REFUSED') };
}

test('fifth audit, finding 2: a transfer from self\'s IRA into the SPOUSE\'s Roth IRA moves nothing, and says why', () => {
  const t = transfer(IRA, dest.spouseRothIra);
  assert.equal(t.moved, 0, 'a conversion cannot cross owners');
  assert.equal(t.refused.length, 1);
  assert.equal(t.refused[0].severity, 'WARNING');
});

test('fifth audit, finding 2: a transfer from a traditional IRA into a Roth 401(k) moves nothing, and says why', () => {
  const t = transfer(IRA, dest.roth401);
  assert.equal(t.moved, 0, 'decision 10: an IRA converts only into a Roth IRA');
  assert.equal(t.refused.length, 1);
});

test('fifth audit, finding 2, control: lawful pre-tax to Roth transfers move, as before', () => {
  for (const [source, to] of [[IRA, dest.rothIra], [IRA, dest.custRoth], [K401, dest.roth401], [K401, dest.rothIra]]) {
    const t = transfer(source, to);
    assert.equal(t.moved, 20000, source.id + ' -> ' + to.id);
    assert.equal(t.refused.length, 0);
  }
});

test('fifth audit, finding 2, control: a pre-tax to TAXABLE transfer is a distribution, not a conversion, and may land in the spouse\'s account', () => {
  const t = transfer(IRA, dest.spouseCash);
  assert.equal(t.moved, 20000);
  assert.equal(t.refused.length, 0);
});

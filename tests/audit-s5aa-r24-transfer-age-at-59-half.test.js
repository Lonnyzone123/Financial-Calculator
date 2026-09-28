/* S5AA R24 round: R23-01 -- A SCHEDULED TRANSFER IS JUDGED AT ITS OWN AGE (ChatGPT's R23 change audit, 2026-09-25,
 * priority 2; repair chosen by the owner 2026-09-24: "Repair now as R24", for the Roth flag and the 10% additional tax alike).
 *
 * A manual transfer carries an exact age (advanced.transferAge) and runs in the projection year that contains it. The
 * R23 Roth check, and the 10% additional tax on a pre-tax transfer to a taxable account before it, both read the age
 * the YEAR OPENED at. So a transfer scheduled AT 59 1/2 in a year opening at 59 was described as a Roth draw before
 * 59 1/2, and a pre-tax one paid the 10% on money distributed on or after the date the owner attained 59 1/2, which
 * IRC 72(t)(2)(A)(i) exempts. Measured at s5aa-r23.1-source (3bc8946): a $20,000 IRA-to-cash transfer at 59.5 cost
 * $2,490.33 of tax in a year opening at 59, $2,000 more than the same transfer in a plan opening at 59.5. No r15 member
 * schedules such a transfer.
 *
 * Now both read the transfer's own age, through the source account's owner. Draws that the engine POOLS by year
 * (recurring spending, one-time expenses, tax funding) have no date inside the year, and keep the year-opening age
 * (the owner, 2026-09-24: "Keep it and disclose it"); the flag's message says so. Controls below pin that convention.
 * All through runPlan() on validator-valid plans; balances and the 10% are hand arithmetic at a 0% return.
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

const CODE = 'UNSUPPORTED_ROTH_ORDERING';

const account = (id, type, taxClass, balance, o = {}) => Object.assign({ id, name: id, type, taxClass, owner: 'self', balance,
  basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0,
  vesting: 100, priority: 1 }, o);

function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: o.age, retireAge: o.age, endAge: o.endAge, spouseOn: !!o.spouseAge,
    filing: o.spouseAge ? 'mfj' : 'single' });
  if (o.spouseAge) Object.assign(p.profile, { spouseAge: o.spouseAge, spouseRetireAge: o.spouseAge });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, volatility: 0, inflation: 0, fee: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: o.spending || 0, dividendOn: false, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: o.expenses || [], otherIncomes: [] });
  Object.assign(p.advanced, { assetsOn: false, rmdOn: false, transferOn: false, conversionOn: false, healthOn: false,
    networthOn: true, otherAssets: [], debts: [], penaltyException: false, rule55: false });
  if (o.transferAge !== undefined) Object.assign(p.advanced, { transferOn: true, transferFrom: 'src', transferTo: 'cash',
    transferAmount: 20000, transferAge: o.transferAge });
  if (o.advanced) Object.assign(p.advanced, o.advanced);
  /* No dividend income at all. With the option off, the engine imputes 1.5% on every taxable balance, so the cash the
     transfer delivered would earn a taxed dividend that depends on how much tax was paid; the option ON at a 0% yield
     removes it (as in tests/audit-rc-findings.test.js). */
  if (o.noDividends) Object.assign(p.retirement, { dividendOn: true, dividendYield: 0 });
  p.accounts = o.accounts;
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, 'a valid plan: ' + JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  return p;
}
function run(p) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const flags = (r) => (r.issues || []).filter((i) => i.code === CODE);
const roth = (owner) => [account('cash', 'taxable', 'taxable', 0), account('src', 'rothIRA', 'roth', 100000, { basisPct: 0, priority: 2, owner })];
const ira = (owner) => [account('cash', 'taxable', 'taxable', 0), account('src', 'traditionalIRA', 'preTax', 100000, { basisPct: 0, priority: 2, owner })];

test('R23-01: a Roth-to-taxable transfer AT 59 1/2, in a year that opens at 59, is not flagged (was flagged at 59)', () => {
  /* ChatGPT's witness. 59 to 60, $100,000 Roth and $0 taxable, no spending, 0% return, $20,000 moved at 59.5:
     Roth $100,000 - $20,000 = $80,000; taxable $0 + $20,000 = $20,000. The owner is 59 1/2 when it moves. */
  const r = run(plan({ age: 59, endAge: 60, transferAge: 59.5, accounts: roth('self') }));
  assert.deepEqual(r.rows.map((x) => [x.age, x.roth, x.taxable]), [[59, 100000, 0], [60, 80000, 20000]]);
  assert.deepEqual(flags(r), [], 'a transfer made at 59 1/2 is not a draw before 59 1/2');
});

test('R23-01 CONTROL: the same transfer at 59 1/4 is flagged once, naming the transfer\'s age, not the year\'s', () => {
  const r = run(plan({ age: 59, endAge: 60, transferAge: 59.25, accounts: roth('self') }));
  assert.equal(r.rows[1].roth, 80000);
  const f = flags(r);
  assert.equal(f.length, 1);
  assert.equal(f[0].state.firstDrawOwnerAge, 59.25, 'the owner is 59 1/4 when the transfer moves (the year opened at 59)');
  assert.equal(f[0].state.outsideSupportedDomain, true);
});

test('R23-01: a SPOUSE-owned Roth is judged at the spouse\'s age on the transfer date (primary 60 1/2, spouse 59 1/2)', () => {
  /* Primary 60 to 61, spouse 59 to 60. transferAge is on the primary's scale: 60.5 is the spouse's 59.5 (not flagged),
     60.25 is the spouse's 59.25 (flagged, naming 59.25). The year opens at the spouse's 59 in both. */
  const at = run(plan({ age: 60, spouseAge: 59, endAge: 61, transferAge: 60.5, accounts: roth('spouse') }));
  assert.equal(at.rows[1].roth, 80000);
  assert.deepEqual(flags(at), []);
  const before = run(plan({ age: 60, spouseAge: 59, endAge: 61, transferAge: 60.25, accounts: roth('spouse') }));
  assert.equal(before.rows[1].roth, 80000);
  assert.deepEqual(flags(before).map((f) => f.state.firstDrawOwnerAge), [59.25]);
});

test('R23-01 sibling: a pre-tax IRA-to-taxable transfer AT 59 1/2 owes no 10% -- $2,000 less than the same transfer at 59 1/4', () => {
  /* Same household with a $100,000 traditional IRA (no basis). Both transfers move $20,000 in the year opening at 59
     and are the same ordinary income; the one at 59.25 also owes the 10% additional tax: 10% x $20,000 = $2,000. The
     tax is paid from the $20,000 of cash the transfer delivered, and with no dividend income (noDividends) nothing else
     depends on how much was paid. Before R24 both paid it, and the difference was $0. */
  const at = run(plan({ age: 59, endAge: 60, transferAge: 59.5, noDividends: true, accounts: ira('self') }));
  const before = run(plan({ age: 59, endAge: 60, transferAge: 59.25, noDividends: true, accounts: ira('self') }));
  assert.equal(at.rows[1].preTax, 80000);
  assert.equal(before.rows[1].preTax, 80000);
  assert.ok(Math.abs((before.rows[1].taxes - at.rows[1].taxes) - 2000) < 0.005,
    'the 10% on $20,000, and nothing else: ' + before.rows[1].taxes + ' - ' + at.rows[1].taxes);
});

test('R23-01 sibling: a SPOUSE-owned IRA transfer is taxed at the spouse\'s age on the transfer date', () => {
  const at = run(plan({ age: 60, spouseAge: 59, endAge: 61, transferAge: 60.5, noDividends: true, accounts: ira('spouse') }));
  const before = run(plan({ age: 60, spouseAge: 59, endAge: 61, transferAge: 60.25, noDividends: true, accounts: ira('spouse') }));
  assert.ok(Math.abs((before.rows[1].taxes - at.rows[1].taxes) - 2000) < 0.005,
    'the spouse is 59 1/2 at 60.5 and 59 1/4 at 60.25: ' + before.rows[1].taxes + ' - ' + at.rows[1].taxes);
});

test('CONVENTION (the owner 2026-09-24, kept and disclosed): a POOLED Roth draw in a year opening at 59 is flagged at 59, and the message says why', () => {
  /* A one-time expense at 59.5 is added to the year's need; the draw that pays it has no date inside the year, so it is
     judged at the age the year opened at. $100,000 Roth, $0 taxable, the Roth pays $20,000 and ends at $80,000. */
  const r = run(plan({ age: 59, endAge: 60, expenses: [{ name: 'Car', kind: 'expense', age: 59.5, amount: 20000 }],
    accounts: roth('self') }));
  assert.equal(r.rows[1].roth, 80000);
  const f = flags(r);
  assert.deepEqual(f.map((x) => x.state.firstDrawOwnerAge), [59]);
  assert.match(f[0].message, /at the age its projection year began/, 'the message names the convention');
  assert.match(f[0].message, /transfer is judged at its own age/);
});

test('CONVENTION (kept): pre-tax spending pooled into a year opening at 59 still owes the 10% on the whole year\'s draw', () => {
  /* $20,000 of recurring spending from a $100,000 IRA, 59 to 60. The whole draw is judged at 59, so the 10% applies to
     at least the $20,000 spent: tax with the penalty exception off exceeds tax with it on by at least $2,000. */
  const off = run(plan({ age: 59, endAge: 60, spending: 20000, accounts: ira('self') }));
  const on = run(plan({ age: 59, endAge: 60, spending: 20000, accounts: ira('self'), advanced: { penaltyException: true } }));
  assert.ok(off.rows[1].taxes - on.rows[1].taxes >= 2000 - 0.005,
    'the pooled draw is penalised at the year-opening age: ' + off.rows[1].taxes + ' vs ' + on.rows[1].taxes);
});

/* S5AA R7 external re-audit: R7-02 and R7-03, and one more of the same class found while repairing them.
 *
 * R7-02. EA-07's succession disclosure was rebuilt BEFORE the simulation from the plan's configured accounts
 * (`p.accounts`), not from what actually changed hands at the death. MEASURED at 99a2e6d: a spouse's $200,000
 * IRA moved by a transfer into their empty taxable account at 65, the spouse died at 70, and the disclosure
 * said the IRA passed under the spousal-election authority -- while the account that actually passed, a
 * funded taxable account, and its taxable-basis assumption, went unnamed.
 *
 * R7-03. `owner: "joint"` had no succession semantics. Every owner-keyed rule reads anything other than
 * "spouse" as the primary person's, so MEASURED at 99a2e6d: with the SPOUSE dying first a joint taxable account
 * passed with no disclosure at all; with the SELF dying first it was disclosed under the self's rule -- the same
 * account, treated two ways.
 *
 * FOUND WHILE REPAIRING (A4-6, the same class): EA-01's enrichment -- what is still billed on the dead -- was
 * predicted from the configured accounts too. MEASURED at 99a2e6d: the last decedent's IRA was spent to $0 before
 * their death and no distribution was ever billed after it, yet the entry said "required distributions" were.
 *
 * The repair records both at the moment they happen, inside the projection: the succession from the WORKING
 * accounts at the row where Q4 changes an owner (with each account's balance there), and the post-death billing
 * from the distributions actually paid in rows where nobody is alive. The domain predicate of EA-01 is
 * unchanged. Joint accounts are an explicit case in both directions, and their basis question is named as an
 * assumption for a decision -- no step-up percentage is chosen. Tested through runPlan only.
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

const TC = { taxable: 'taxable', traditionalIRA: 'preTax', rothIRA: 'roth', traditional401k: 'preTax', hsa: 'hsa',
  customTaxable: 'taxable', customTraditional: 'preTax', customRoth: 'roth' };
const acct = (id, type, owner, balance, extra) => Object.assign({ id, name: id, type, taxClass: TC[type], owner, balance,
  basisPct: TC[type] === 'taxable' ? 100 : 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
  frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority: 1 }, extra || {});

function run(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, spouseAge: 60, retireAge: 55, endAge: 80, spouseOn: true, filing: 'mfj' }, o.profile);
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 }, o.assumptions);
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 }, o.employment);
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 10000, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 70 }, o.retirement);
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, penaltyException: true,
    qcd: 0, debts: [], otherAssets: [] }, o.advanced);
  p.accounts = o.accounts;
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const rolled = (r) => (r.issues || []).filter((i) => i.code === 'SPOUSAL_ROLLOVER_ASSUMED');
const entry = (issue, id) => issue.state.succession.find((s) => s.account === id);
const TAXABLE_BASIS = 'a taxable account keeps the decedent\'s cost basis, with no step-up at death';

test('R7-02A: an IRA moved into a taxable account before the death -- the TAXABLE account is what passes, and is named', () => {
  const r = run({
    advanced: { transferOn: true, transferFrom: 'sp-ira', transferTo: 'sp-cash', transferAge: 65, transferAmount: 200000 },
    accounts: [acct('cash', 'taxable', 'self', 500000), acct('sp-ira', 'traditionalIRA', 'spouse', 200000), acct('sp-cash', 'taxable', 'spouse', 0, { priority: 9 })],
  });
  const [issue] = rolled(r);
  assert.ok(issue, 'the spouse dies at 70 and the self survives');
  const cash = entry(issue, 'sp-cash');
  assert.ok(cash, 'the funded taxable account is in the succession');
  assert.equal(cash.balance, 200000, 'with the balance it held when it changed hands');
  assert.equal(cash.basis, 'assumption');
  assert.ok(issue.state.assumptionsAwaitingDecision.includes(TAXABLE_BASIS), 'and its taxable-basis assumption is named');
  assert.equal(entry(issue, 'sp-ira'), undefined, 'the IRA was empty when the death came: it passed no value, and is not said to');
  assert.ok(issue.state.rollovers[0].emptyAtTransfer.includes('sp-ira'), 'it is listed as re-owned while empty, for the record');
});

test('R7-02B: an account that opened at zero and was funded by contributions passes with what it holds', () => {
  const r = run({
    profile: { retireAge: 75 }, employment: { spouseSalary: 90000, contributionStop: 75 },
    accounts: [acct('cash', 'taxable', 'self', 500000), acct('sp-401k', 'traditional401k', 'spouse', 0, { contribution: 10000 })],
  });
  const [issue] = rolled(r);
  const k = entry(issue, 'sp-401k');
  assert.ok(k && k.balance > 90000, 'ten years of $10,000 contributions (60 to 70), held at the death');
  assert.equal(k.basis, 'authority');
});

test('R7-02C: a configured account spent to zero before the death is not described as passing value', () => {
  const r = run({
    retirement: { spending: 30000, withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa' },
    accounts: [acct('sp-ira', 'traditionalIRA', 'spouse', 60000, { priority: 1 }), acct('cash', 'taxable', 'self', 900000, { priority: 5 })],
  });
  assert.equal(Number(r.rows.find((x) => x.age === 63).preTax).toFixed(0), '0', 'CONTROL: the IRA is spent by 62');
  assert.deepEqual(rolled(r), [], 'nothing of value changed hands at the death, so no rollover is disclosed');
});

test('R7-02D control: a funded IRA and workplace plan still pass under the cited authority', () => {
  const r = run({ accounts: [acct('cash', 'taxable', 'self', 500000), acct('sp-ira', 'traditionalIRA', 'spouse', 100000), acct('sp-401k', 'traditional401k', 'spouse', 50000)] });
  const [issue] = rolled(r);
  assert.equal(entry(issue, 'sp-ira').basis, 'authority');
  assert.equal(entry(issue, 'sp-401k').basis, 'authority');
  assert.deepEqual(issue.state.assumptionsAwaitingDecision, []);
});

const JOINT = 'a joint account stays with the survivor with its whole cost basis; the step-up at death depends on titling and property law this plan does not record';

test('R7-03A: a joint taxable account, the SPOUSE dying first, is disclosed -- it does not pass silently', () => {
  const r = run({ accounts: [acct('joint-cash', 'taxable', 'joint', 100000, { priority: 5 }), acct('self-cash', 'taxable', 'self', 400000)] });
  const [issue] = rolled(r);
  assert.ok(issue, 'a death with a joint account in the household is a succession event');
  const j = entry(issue, 'joint-cash');
  assert.ok(j, 'the joint account is named');
  assert.equal(j.owner, 'joint');
  assert.equal(j.basis, 'assumption');
  assert.ok(issue.state.assumptionsAwaitingDecision.includes(JOINT));
  assert.ok(/titling/.test(issue.message), 'and the prose says the basis question turns on titling');
  assert.equal(entry(issue, 'self-cash'), undefined, 'CONTROL: the survivor\'s own account does not change hands');
});

test('R7-03B: the SELF dying first gives the joint account the same treatment -- not the self\'s own rule', () => {
  const r = run({ retirement: { selfLife: 70, spouseLife: 95 }, accounts: [acct('joint-cash', 'taxable', 'joint', 100000, { priority: 5 }), acct('self-cash', 'taxable', 'self', 400000)] });
  const [issue] = rolled(r);
  const j = entry(issue, 'joint-cash');
  assert.equal(j.owner, 'joint');
  assert.deepEqual(j.authority, ['IRC 2040(b)', 'IRC 1014(b)(6)']);
  assert.equal(j.assumed, JOINT, 'symmetric with R7-03A');
  assert.equal(entry(issue, 'self-cash').assumed, TAXABLE_BASIS, 'CONTROL: the self\'s own taxable account keeps its own rule');
});

test('R7-03C: "joint" on an IRA, a plan or an HSA -- which cannot be jointly owned -- is disclosed as unsupported', () => {
  /* The app offers "Joint" only for types without a contribution-limit group; the validator does not check an
     account's owner at all, so a directly entered joint IRA reaches the engine and is read as the primary
     person's. At a death it must not pass as if under a rule. */
  const r = run({ accounts: [acct('cash', 'taxable', 'self', 500000), acct('joint-ira', 'traditionalIRA', 'joint', 50000)] });
  const [issue] = rolled(r);
  const j = entry(issue, 'joint-ira');
  assert.equal(j.basis, 'unsupported');
  assert.ok(issue.state.assumptionsAwaitingDecision.some((a) => /individually owned/.test(a)));
});

test('R7-03 control: a joint account with no death in the horizon says nothing', () => {
  const r = run({ retirement: { spouseLife: 95 }, accounts: [acct('joint-cash', 'taxable', 'joint', 100000)] });
  assert.deepEqual(rolled(r), []);
});

/* S5AA R9 round, the owner's decision 8 (2026-09-21): INVERTED. The two A4-6 tests pinned what EA-01's entry named as billed on
   the dead in rows after the last death. The projection now stops at the last death, so there are no such rows and
   nothing can be billed on the dead: the claim is kept in its strongest form, on the rows themselves. */
test('A4-6, inverted by decision 8: nothing is billed on the dead -- an IRA spent before the last death, and no row after it', () => {
  const spentFirst = run({
    profile: { age: 70, spouseAge: 70 }, retirement: { selfLife: 72, spouseLife: 78, spending: 30000, withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa' },
    advanced: { rmdOn: true },
    accounts: [acct('sp-ira', 'traditionalIRA', 'spouse', 50000, { priority: 1 }), acct('cash', 'taxable', 'self', 900000, { priority: 5 })],
  });
  const u = (spentFirst.issues || []).find((i) => i.code === 'PROJECTION_ENDS_AT_LAST_DEATH');
  assert.ok(u, 'nobody is alive from the row opening at 79, and the projection stops there');
  assert.equal(u.state.stoppedAtRowOpening, 79);
  assert.equal(spentFirst.rows[spentFirst.rows.length - 1].age, 79, 'no row opens after the last death');
  assert.ok(!(spentFirst.issues || []).some((i) => i.code === 'UNSUPPORTED_POST_DEATH_HOUSEHOLD'));
});

test('A4-6 control, inverted by decision 8: an IRA that outlives its owner is billed in the year of the death, and never after', () => {
  const billed = run({
    profile: { age: 70, spouseAge: 70 }, retirement: { selfLife: 72, spouseLife: 78, spending: 5000 },
    advanced: { rmdOn: true },
    accounts: [acct('sp-ira', 'traditionalIRA', 'spouse', 400000, { priority: 5 }), acct('cash', 'taxable', 'self', 900000, { priority: 1 })],
  });
  assert.ok(billed.rows.some((x) => x.age === 79 && Number(x.rmd) > 0), 'CONTROL: the IRA is billed in the year its owner dies');
  assert.equal(billed.rows[billed.rows.length - 1].age, 79, 'and no row follows the death, so nothing is billed on the dead');
  assert.ok((billed.issues || []).some((i) => i.code === 'PROJECTION_ENDS_AT_LAST_DEATH'));
});

test('R7-02 in Monte Carlo: the disclosure is the first path\'s, and appears once', () => {
  const r = run({ assumptions: { method: 'monteCarlo', runs: 20, seed: 11, returnRate: 5, volatility: 10 },
    accounts: [acct('cash', 'taxable', 'self', 500000), acct('sp-ira', 'traditionalIRA', 'spouse', 100000)] });
  assert.equal(rolled(r).length, 1);
});

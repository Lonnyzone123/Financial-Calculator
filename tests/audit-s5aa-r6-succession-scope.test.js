/* S5AA R6 external audit, EA-07: Q4 re-owns EVERY account of a deceased spouse, and its authority covers
 * only some of them.
 *
 * Q4 changes `owner` on every account the decedent held, and its comment said that was "the whole repair".
 * The authority behind it (citation checks 17 to 19, and Treas. Reg. 1.408A-6 Q&A-14 for a Roth IRA) is a
 * surviving spouse's right to treat an IRA as their own or roll a workplace plan over. It says nothing about:
 *   - an HSA, which IRC 223(f)(8)(A) treats as the spouse's own ONLY if the spouse is its designated
 *     beneficiary -- otherwise, (f)(8)(B), it stops being an HSA at the death and its value is income;
 *   - a taxable account, whose basis IRC 1014 steps up at death (for spouses' joint property, half of it,
 *     IRC 2040(b); in community property, the whole, IRC 1014(b)(6)) -- the engine keeps the decedent's
 *     cost basis, which overstates the survivor's capital gains;
 *   - the custom account types, which have no particular rule at all.
 *
 * The auditor asked for restraint: inventory, contain, disclose, test, and ask for the assumptions rather
 * than invent them. So the BEHAVIOUR IS UNCHANGED -- every account still passes -- and
 * SPOUSAL_ROLLOVER_ASSUMED now says, account by account, which authority covers the treatment and which
 * treatment is an assumption awaiting a decision. Tested through runPlan only.
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

const TAX_CLASS = { taxable: 'taxable', traditionalIRA: 'preTax', rothIRA: 'roth', traditional401k: 'preTax', roth401k: 'roth',
  hsa: 'hsa', customTaxable: 'taxable', customTraditional: 'preTax', customRoth: 'roth' };
const acct = (id, type, owner, balance) => ({ id, name: id, type, taxClass: TAX_CLASS[type], owner, balance,
  basisPct: TAX_CLASS[type] === 'taxable' ? 50 : 0, contribution: 0, contributionMode: 'amount', annualChange: 0,
  annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
  matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 });

function run(spouseTypes) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 70, spouseAge: 70, retireAge: 65, endAge: 80, spouseOn: true, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 10000, dividendOn: false, pension: 0, ssBenefit: 0,
    spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 74 });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, qcd: 0, debts: [], otherAssets: [] });
  p.accounts = [acct('self-cash', 'taxable', 'self', 500000)].concat(spouseTypes.map((t) => acct('spouse-' + t, t, 'spouse', 50000)));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return (r.issues || []).find((i) => i.code === 'SPOUSAL_ROLLOVER_ASSUMED');
}
const treatmentOf = (issue, type) => issue.state.succession.find((s) => s.type === type);

test('EA-07: an IRA or workplace plan passes under the cited spousal election, and nothing awaits a decision', () => {
  const issue = run(['traditionalIRA', 'rothIRA', 'traditional401k', 'roth401k']);
  assert.ok(issue, 'CONTROL: the spouse dies at 74 and the self survives');
  for (const t of ['traditionalIRA', 'rothIRA', 'traditional401k', 'roth401k']) {
    const s = treatmentOf(issue, t);
    assert.equal(s.basis, 'authority', t + ' is covered by the cited election or rollover');
    assert.ok(s.authority.length > 0, t + ' names its authority');
  }
  assert.ok(treatmentOf(issue, 'rothIRA').authority.includes('Treas. Reg. 1.408A-6 Q&A-14'));
  assert.deepEqual(issue.state.assumptionsAwaitingDecision, [], 'no assumption is made for these');
  assert.ok(!/designated beneficiary|stepped up/.test(issue.message), 'and the prose claims none');
});

test('EA-07: an HSA passing to the survivor is disclosed as ASSUMING the spouse is its designated beneficiary', () => {
  const issue = run(['hsa']);
  const s = treatmentOf(issue, 'hsa');
  assert.equal(s.basis, 'assumption');
  assert.ok(s.authority.includes('IRC 223(f)(8)(A)'));
  assert.ok(issue.state.assumptionsAwaitingDecision.includes('the surviving spouse is the designated beneficiary of the HSA'));
  assert.ok(/designated beneficiary/.test(issue.message) && /223\(f\)\(8\)\(B\)|income/.test(issue.message),
    'the prose says what happens otherwise');
});

/* RE-FIXTURED BY INTENT at S5AA R35 (SA32F-17; the owner's decision 4, 2026-09-29, "a loss also resets"): a taxable account's basis now
   resets at the death -- the decedent's own in full, a joint one half (IRC 1014(a), 2040(b)) -- so the named assumption is the reset's
   timing and the joint share, no longer "no step-up". The succession still discloses it, account by account. */
test('EA-07: a taxable account passing to the survivor is disclosed, with its basis reset to its value', () => {
  for (const t of ['taxable', 'customTaxable']) {
    const issue = run([t]);
    const s = treatmentOf(issue, t);
    assert.equal(s.basis, 'assumption', t);
    assert.ok(s.authority.includes('IRC 1014(a)'), t);
    assert.ok(issue.state.assumptionsAwaitingDecision.includes('a taxable account\'s cost basis resets to its value when it passes, up or down (IRC 1014(a)), read at the opening of the first row after the death'), t);
    assert.ok(/resets to its value when it passes/.test(issue.message), t + ': the prose says the basis resets, and when');
  }
});

test('EA-07: a custom tax-deferred or tax-free account passes with no specific authority, and says so', () => {
  const issue = run(['customTraditional', 'customRoth']);
  for (const t of ['customTraditional', 'customRoth']) {
    const s = treatmentOf(issue, t);
    assert.equal(s.basis, 'assumption', t);
    assert.deepEqual(s.authority, [], t + ': there is none to name');
  }
  assert.ok(issue.state.assumptionsAwaitingDecision.includes('a custom account passes like an IRA of its tax class'));
});

test('EA-07: an account whose type the engine does not list is classed by its tax class', () => {
  /* accountType() falls back to a custom taxable account for an unlisted type -- the corpus uses
     "brokerage" -- so a taxable account of any spelling must be disclosed as a taxable account, not as
     an IRA of its tax class. */
  const p = { type: 'brokerage' };
  const issue = run(['taxable']);
  assert.ok(issue, 'CONTROL');
  const withBrokerage = (() => {
    const q = JSON.parse(JSON.stringify(defaultPlan));
    q.setupComplete = true;
    Object.assign(q.profile, { age: 70, spouseAge: 70, retireAge: 65, endAge: 80, spouseOn: true, filing: 'mfj' });
    Object.assign(q.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
    Object.assign(q.employment, { salary: 0, spouseSalary: 0, growth: 0 });
    Object.assign(q.retirement, { strategy: 'fixedNominal', spending: 10000, pension: 0, ssBenefit: 0, spouseSS: 0,
      stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 74 });
    Object.assign(q.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, qcd: 0, debts: [], otherAssets: [] });
    q.accounts = [acct('self-cash', 'taxable', 'self', 500000), Object.assign(acct('spouse-brokerage', 'taxable', 'spouse', 50000), p)];
    const r = engine.runPlan(q);
    assert.equal(r.status, 'ok');
    return (r.issues || []).find((i) => i.code === 'SPOUSAL_ROLLOVER_ASSUMED');
  })();
  const s = withBrokerage.state.succession.find((x) => x.account === 'spouse-brokerage');
  assert.deepEqual(s.authority, ['IRC 1014(a)'], 'a taxable account, whatever its type is spelled (R35: the basis reset, 1014(a))');
  assert.ok(!withBrokerage.state.assumptionsAwaitingDecision.includes('a custom account passes like an IRA of its tax class'));
});

/* FOURTH INTERNAL AUDIT (A4-1). The succession list was built only for a death INSIDE the horizon, but
   Q4 passes the accounts of a spouse whose lifespan ended BEFORE the plan starts too -- from the first row
   (DEATH_BEFORE_PLAN_START). MEASURED at 99a2e6d: such a spouse holding an HSA and a taxable account passed
   both to the survivor and no SPOUSAL_ROLLOVER_ASSUMED was raised, so neither assumption was named. */
test('EA-07 (fourth audit, A4-1): a spouse who died before the plan starts passes accounts under the same named assumptions', () => {
  const q = JSON.parse(JSON.stringify(defaultPlan));
  q.setupComplete = true;
  Object.assign(q.profile, { age: 70, spouseAge: 72, retireAge: 65, endAge: 80, spouseOn: true, filing: 'mfj' });
  Object.assign(q.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(q.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(q.retirement, { strategy: 'fixedNominal', spending: 10000, pension: 0, ssBenefit: 0, spouseSS: 0,
    stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 70 });
  Object.assign(q.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, qcd: 0, debts: [], otherAssets: [] });
  q.accounts = [acct('self-cash', 'taxable', 'self', 500000), acct('spouse-hsa', 'hsa', 'spouse', 30000), acct('spouse-cash', 'taxable', 'spouse', 100000)];
  const r = engine.runPlan(q);
  assert.equal(r.status, 'ok');
  assert.ok((r.issues || []).some((i) => i.code === 'DEATH_BEFORE_PLAN_START'), 'CONTROL: the spouse died at 70, two years before the start');
  const issue = (r.issues || []).find((i) => i.code === 'SPOUSAL_ROLLOVER_ASSUMED');
  assert.ok(issue, 'the accounts pass from the first row, so the rollover is disclosed');
  assert.equal(issue.state.rollovers[0].beforePlanStart, true);
  assert.deepEqual(issue.state.succession.map((s) => s.account).sort(), ['spouse-cash', 'spouse-hsa']);
  assert.ok(issue.state.assumptionsAwaitingDecision.includes('the surviving spouse is the designated beneficiary of the HSA'));
  assert.ok(!/dies inside this plan's horizon/.test(issue.message), 'and the prose does not place the death inside the horizon');
});

test('EA-07 control: the behaviour is unchanged -- every account the decedent held is still listed as passing', () => {
  const types = ['traditionalIRA', 'hsa', 'taxable', 'customRoth'];
  const issue = run(types);
  assert.deepEqual(issue.state.rollovers[0].accounts.slice().sort(), types.map((t) => 'spouse-' + t).sort());
  assert.deepEqual(issue.state.succession.map((s) => s.account).sort(), types.map((t) => 'spouse-' + t).sort(),
    'one succession entry per account that passes, no more and no fewer');
});

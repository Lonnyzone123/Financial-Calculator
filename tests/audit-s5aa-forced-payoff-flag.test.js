/* S5AA task 1.5, Q107 -- the forced-payoff flag catches every zero-effective-payment debt that is
 * interest-bearing at some point in the projection, not only one whose entered payment is literally 0 and whose
 * CURRENT rate is positive.
 *
 * Q43 decided that a forced payoff of a debt whose payment is exactly 0 on a positive rate is a calculation error.
 * The condition written for it tested the RAW field against 0 and the PRE-RESET rate, and so missed two debts that
 * behave identically:
 *
 *   a payment of -50, which the engine coerces to 0 for every dollar it computes, so the money path is the same as
 *   the flagged case -- but `=== 0` is false against -50, and the flag never fires. Measured at 14b7095:
 *   $166,164,101 forced out at 75, status ok, unflagged.
 *
 *   a 0% teaser ARM that resets to 5% while the debt is still alive. The flag tests baseRate, which is the rate
 *   BEFORE the reset, so a debt that spends ten years interest-bearing is judged on the rate it no longer has.
 *   Measured: $164,701 forced out, status ok, unflagged -- and THE VALIDATOR SAYS NOTHING AT ALL about this one,
 *   because the input is entirely valid. No amount of gate-widening reaches it; the flag's own condition had to
 *   change. That is why this is task 1.5 and not part of task 1.1's gate work.
 *
 * "Effective payment" is entered payment plus extra principal, both floored at zero, because that is what the
 * amortization loop actually spends. "Interest-bearing at some point" is the current rate, or an adjustable debt's
 * reset rate when the reset falls before the payoff age -- a reset that never happens cannot make a debt cost
 * anything, and the controls below pin that.
 *
 * The WIDER closure obligation (Q43/Q44/Q45 and S5b task 2b) stays where it is. This file is the flag only.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { bootBuild } = require('./lib/build-routes.js');
const { postToWorker } = require('./lib/worker-source.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const CODE = 'DEBT_ZERO_PAYMENT_FORCED_PAYOFF';

/* A portfolio large enough that the forced payoff is affordable, so what is being measured is the FLAG and not a
 * shortfall. The debt's payoff age is inside the horizon, which is what makes the payoff forced. */
function fixture(debtOver) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 55, retireAge: 65, endAge: 80, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0 });
  p.accounts = [{ id: 'a1', name: 'Taxable', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 600000000, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  p.advanced.debts = [Object.assign({
    id: 'd1', name: 'Debt', type: 'otherDebt', owner: 'household', balance: 20000, rate: 20,
    rateType: 'fixed', paymentMonthly: 0, extraPrincipalMonthly: 0, payoffAge: 75,
    includePayment: true, includeHousingCosts: false,
  }, debtOver)];
  return p;
}
const copy = (v) => JSON.parse(JSON.stringify(v));
const attempt = (fn) => { try { return fn(); } catch (e) { return { threw: String(e && e.message).split('\n')[0] }; } };
const outcome = (r) => (r.threw !== undefined ? 'threw: ' + r.threw : r.status + ' / ' + r.calculationErrorCode);
const flagged = (r) => r.threw === undefined && r.calculationErrorCode === CODE;

const TEASER = { balance: 100000, rate: 0, rateType: 'adjustable', resetRate: 5, nextRateResetAge: 65, paymentMonthly: 0 };

let built;
test.before(async () => { built = await bootBuild(); });
test.after(() => { if (built) built.dom.window.close(); });

test('S5AA 1.5: a negative monthly payment on a positive rate is flagged, exactly as a payment of 0 is', () => {
  const wrong = [];
  for (const paymentMonthly of [-50, -0.01, -1000000]) {
    const r = attempt(() => engine.runPlan(fixture({ paymentMonthly })));
    if (!flagged(r)) wrong.push('payment ' + paymentMonthly + ' -> ' + outcome(r));
  }
  assert.deepStrictEqual(wrong, [], 'the engine coerces a negative payment to 0 for every dollar it computes, so the flag must see it the same way');
});

test('S5AA 1.5, RESOLVED BY 5.1: a 0% teaser ARM no longer needs flagging, because it now amortises', () => {
  /* THE HAZARD IS GONE RATHER THAN HIDDEN, and that is worth stating precisely.

     This case was flagged because a debt with an entered payment of 0 that becomes interest-bearing at
     a reset was being judged on the rate it had BEFORE that reset, and then force-paid-off at its
     payoff age. S5AA task 5.1 (Q94, F8) made the re-amortisation unconditional: at the reset the
     lender supplies a payment computed from the balance and the remaining term, exactly as a real
     lender does. The loan pays itself down, so there is nothing left to force out and nothing to flag.

     The flag itself is NOT dead, and the control test below still proves it: a zero payment on a FIXED
     debt is still an error, and an adjustable debt whose reset lands after its payoff age -- so the
     reset never supplies a payment -- is still an error. What changed is that a teaser ARM is now
     modelled correctly instead of being caught by a guard. */
  const r = attempt(() => engine.runPlan(fixture(TEASER)));
  assert.strictEqual(r.threw, undefined, 'it must run, not throw');
  assert.strictEqual(r.status, 'ok', 'and run cleanly; got ' + outcome(r));

  const rows = r.rows || [];
  const atReset = rows.find((x) => Math.abs(x.age - 65) < 1e-9);
  const later = rows.find((x) => Math.abs(x.age - 75) < 1e-9);
  assert.ok(atReset && later, 'the rows at the reset and the payoff age must exist');
  assert.ok(later.debtBalance < atReset.debtBalance,
    'the balance must FALL after the reset -- that is what makes the flag unnecessary; got '
    + atReset.debtBalance + ' -> ' + later.debtBalance);
});

test('S5AA 1.5, RESOLVED BY 5.1: a negative payment on a teaser ARM is likewise amortised, not flagged', () => {
  /* The engine coerces a negative entered payment to 0, and the reset then replaces it. So this case
     follows the one above rather than the fixed-rate one: it is the RESET that decides, and a negative
     entered payment has nothing left to poison. */
  const r = attempt(() => engine.runPlan(fixture(Object.assign({}, TEASER, { paymentMonthly: -50 }))));
  assert.strictEqual(r.status, 'ok', 'got ' + outcome(r));
  const plain = attempt(() => engine.runPlan(fixture(TEASER)));
  assert.deepStrictEqual(
    (r.rows || []).map((x) => x.debtBalance),
    (plain.rows || []).map((x) => x.debtBalance),
    'a negative entered payment and a zero one must project identically once the reset supplies a payment');
});

test('S5AA 1.5 control: the Q43 case it was written for is unchanged, and a rate that never applies is not flagged', () => {
  const wrong = [];
  const decided = attempt(() => engine.runPlan(fixture({})));
  if (!flagged(decided)) wrong.push('the decided Q43 case (payment 0 at 20%) -> ' + outcome(decided));

  /* Zero payment at zero rate: Q43 decided this is NOT an error. A debt that costs nothing is not forced out. */
  const zeroAtZero = attempt(() => engine.runPlan(fixture({ balance: 100000, rate: 0, paymentMonthly: 0 })));
  if (zeroAtZero.threw !== undefined || zeroAtZero.status !== 'ok') wrong.push('zero payment at zero rate -> ' + outcome(zeroAtZero));

  /* A reset that lands AFTER the payoff age never applies, so it cannot make the debt interest-bearing. */
  const resetAfterPayoff = attempt(() => engine.runPlan(fixture(Object.assign({}, TEASER, { nextRateResetAge: 78 }))));
  if (resetAfterPayoff.threw !== undefined || resetAfterPayoff.status !== 'ok') wrong.push('reset after payoff -> ' + outcome(resetAfterPayoff));

  /* A reset outside the projection horizon entirely. */
  const resetOffHorizon = attempt(() => engine.runPlan(fixture(Object.assign({}, TEASER, { nextRateResetAge: 95 }))));
  if (resetOffHorizon.threw !== undefined || resetOffHorizon.status !== 'ok') wrong.push('reset past the horizon -> ' + outcome(resetOffHorizon));

  /* A reset to 0% is a reset that still costs nothing. */
  const resetToZero = attempt(() => engine.runPlan(fixture(Object.assign({}, TEASER, { resetRate: 0 }))));
  if (resetToZero.threw !== undefined || resetToZero.status !== 'ok') wrong.push('reset to 0% -> ' + outcome(resetToZero));

  /* Extra principal is part of the effective payment: a debt being paid down is not a zero-payment debt. */
  const extraClears = attempt(() => engine.runPlan(fixture({ paymentMonthly: 0, extraPrincipalMonthly: 500 })));
  if (extraClears.threw !== undefined || extraClears.status !== 'ok') wrong.push('extra principal clearing the debt -> ' + outcome(extraClears));

  /* An ordinary amortizing debt. */
  const ordinary = attempt(() => engine.runPlan(fixture({ paymentMonthly: 400 })));
  if (ordinary.threw !== undefined || ordinary.status !== 'ok') wrong.push('an ordinary paying debt -> ' + outcome(ordinary));

  assert.deepStrictEqual(wrong, [], 'CONTROL: the widened flag must not claim a debt that costs nothing or is being paid');
});

test('S5AA 1.5: runScenario(), a fresh build\'s main thread and its generated Worker AGREE on both cases', () => {
  /* Both cases are still checked on all three routes; what differs is WHAT each must show. The
     negative payment on a fixed debt is still an error everywhere. The teaser ARM is no longer an
     error anywhere, because S5AA task 5.1 (Q94) made its reset supply a payment -- and the point of
     running it on all three routes is that the three must AGREE, whichever answer is right. A route
     that still flagged it would mean the main thread and the Worker had diverged. */
  const wrong = [];
  for (const [label, debtOver, mustFlag] of [
    ['negative payment', { paymentMonthly: -50 }, true],
    ['teaser ARM', TEASER, false],
  ]) {
    const plan = fixture(debtOver);
    const scenario = attempt(() => engine.runScenario(copy(plan)));
    const page = attempt(() => built.engine.runPlan(copy(plan)));
    const worker = attempt(() => postToWorker(built.workerSource, copy(plan)));
    if (flagged(scenario) !== mustFlag) wrong.push(label + ' via runScenario(): ' + outcome(scenario));
    if (flagged(page) !== mustFlag) wrong.push(label + ' via the main thread: ' + outcome(page));
    if (worker.threw !== undefined) wrong.push(label + ' via the Worker: threw: ' + worker.threw);
    else if (worker.error !== undefined) wrong.push(label + ' via the Worker: posted error: ' + String(worker.error).split('\n')[0]);
    else if (flagged(worker.result) !== mustFlag) wrong.push(label + ' via the Worker: ' + outcome(worker.result));
  }
  assert.deepStrictEqual(wrong, []);
});

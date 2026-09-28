/* EXT-03 / Q78 -- an adjustable-rate recast whose remaining term exceeds the amortization module's limit is a named
 * calculation error, never an uncaught RangeError.
 *
 * Decided 2026-09-14 (the owner), Q78 answer (a). The module refuses a term over its MAX_TERM_MONTHS by throwing; the engine
 * now checks the term first and reports DEBT_RECAST_TERM_UNSUPPORTED, with the invalid-result contract (status
 * calculation_error, no rows). The loan is not clipped. Held on both sides of the bound, with recast off, with a reset
 * outside the projection, and with no principal left, and through Monte Carlo, historical mode, a fresh build's main
 * thread and its generated Worker.
 *
 * Public routes only. Each title is a literal, so the requirements register names every one.
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
/* The debt modules, installed exactly as the browser bundle provides them, before the engine is loaded. */
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const CODE = 'DEBT_RECAST_TERM_UNSUPPORTED';

/* A retired single, 60 to 62, with an adjustable-rate loan that resets at 60 and is recast at its reset. */
function household(payoffAge, edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 60, endAge: 62, spouseOn: false });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: 60 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, seed: 7 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 10000, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [], otherIncomes: [], dividendOn: false, flexibility: 0 });
  Object.assign(p.advanced, { otherAssets: [], networthOn: true, insurance: 0, assetsOn: false, rmdOn: false, healthOn: false, ltcOn: false, transferOn: false, conversionOn: false, armRecastOnReset: true });
  p.advanced.debts = [{ id: 'd1', name: 'Loan', type: 'otherDebt', owner: 'household', balance: 10000, rate: 5, rateType: 'adjustable', resetRate: 6, nextRateResetAge: 60, paymentMonthly: 500, payoffAge, includePayment: true, includeHousingCosts: false, extraPrincipalMonthly: 0 }];
  p.accounts = [{ id: 'a1', name: 'Roth', owner: 'self', type: 'rothIRA', taxClass: 'roth', balance: 1000000, basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
  if (edit) edit(p);
  return p;
}
const run = (p) => { let r; assert.doesNotThrow(() => { r = engine.runPlan(p); }, 'runPlan() must return a result, never throw'); return r; };
const isRecastError = (r) => r.status === 'calculation_error' && r.calculationErrorCode === CODE && r.rows === null;

let built;
test.before(async () => { built = await bootBuild(); });
test.after(() => { if (built) built.dom.window.close(); });

test('EXT-03/Q78 (runPlan): a recast whose remaining term is over 1,800 months is the named calculation error, not a throw', () => {
  const r = run(household(999));
  assert.ok(isRecastError(r), 'expected ' + CODE + ' with no rows, got ' + r.status + ' / ' + r.calculationErrorCode);
  assert.ok((r.issues || []).some((i) => i.code === CODE && i.severity === 'ERROR'), 'the refusal must be reported as an ERROR issue');
});

test('EXT-03/Q78 (runPlan): a recast over exactly 1,800 months still runs, and one month more is the calculation error', () => {
  const atLimit = run(household(210));
  assert.strictEqual(atLimit.status, 'ok', 'a term of exactly 1,800 months must run, got ' + atLimit.calculationErrorCode);
  const overLimit = run(household(210 + 1 / 12));
  assert.ok(isRecastError(overLimit), 'a term of 1,801 months must be ' + CODE + ', got ' + overLimit.status + ' / ' + overLimit.calculationErrorCode);
});

test('EXT-03/Q78 (runPlan): Monte Carlo and historical modes report the same calculation error', () => {
  const mc = run(household(999, (p) => { Object.assign(p.assumptions, { method: 'monteCarlo', runs: 10, volatility: 12, returnRate: 5 }); }));
  assert.strictEqual(mc.status, 'calculation_error');
  assert.strictEqual(mc.calculationErrorCode, CODE);
  const historical = run(household(999, (p) => { Object.assign(p.assumptions, { method: 'historical', historyStart: 1928 }); }));
  assert.ok(isRecastError(historical), 'historical mode must be ' + CODE + ', got ' + historical.status + ' / ' + historical.calculationErrorCode);
});

test('EXT-03/Q78 (runPlan): a fresh build\'s main thread and its generated Worker report the same calculation error', () => {
  const p = household(999);
  let page;
  assert.doesNotThrow(() => { page = built.engine.runPlan(JSON.parse(JSON.stringify(p))); });
  assert.strictEqual(page.status, 'calculation_error');
  assert.strictEqual(page.calculationErrorCode, CODE);
  const message = postToWorker(built.workerSource, JSON.parse(JSON.stringify(p)));
  assert.strictEqual(message.error, undefined, 'the Worker must return a result, not an error');
  assert.strictEqual(message.result.status, 'calculation_error');
  assert.strictEqual(message.result.calculationErrorCode, CODE);
});

test('EXT-03/Q78 (runPlan) control: a reset outside the projection, or no principal left, the same payoff age runs', () => {
  /* S5AA task 5.1 (Q94) retired the recast switch, so "recast off" is gone as a control -- and that
     case now REFUSES, correctly: a payoff age of 999 puts the recast term past what the amortisation
     module can compute, and refusing is Q78's whole point. Making the recast unconditional makes that
     refusal MORE reachable, not less, which is why it is pinned in
     tests/audit-s5aa-arm-always-recast.test.js as well. The two controls that remain are the ones that
     never reach a recast at all. */
  const laterReset = run(household(999, (p) => { p.advanced.debts[0].nextRateResetAge = 70; }));
  assert.strictEqual(laterReset.status, 'ok', 'a reset after the projection ends must run, got ' + laterReset.calculationErrorCode);
  const paidOff = run(household(999, (p) => { p.advanced.debts[0].balance = 0; }));
  assert.strictEqual(paidOff.status, 'ok', 'a debt with no principal must run, got ' + paidOff.calculationErrorCode);
});

test('EXT-03/Q78 (runPlan) control: an ordinary recast inside the limit runs, and the recast changes the payments', () => {
  const recast = run(household(80));
  /* The control is a loan whose reset never arrives, not a switch turned off. */
  const plain = run(household(80, (p) => { p.advanced.debts[0].nextRateResetAge = 999; }));
  assert.strictEqual(recast.status, 'ok');
  assert.strictEqual(plain.status, 'ok');
  assert.notStrictEqual(JSON.stringify(recast.rows), JSON.stringify(plain.rows), 'CONTROL: recasting at the reset must change the projection here');
});

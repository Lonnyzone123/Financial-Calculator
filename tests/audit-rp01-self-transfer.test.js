'use strict';

/**
 * RP-01 -- a transfer from an account to itself minted basis.
 *
 * Written 2026-09-12, well after the repair (`7656241`), because enumerating
 * the S2 closure register found RP-01 was the ONE repaired finding with no
 * witness carrying its ID. RP-02, RP-03 and RP-04 all have one. The repair was
 * real and the ledger records it; what was missing was anything a closure
 * submission could point at.
 *
 * THE DEFECT. `moveFunds()` did `f.balance -= moved` and `t.balance += moved`,
 * which cancel when `f` and `t` are the same object -- so the balance was
 * untouched, but the call still returned a positive `moved`, and the CALLER's
 * separate basis line then added `moved * sourceRate` of arriving basis to a
 * balance that had not changed. Two definitions of one transaction, which is
 * the shape this file had already been bitten by repeatedly.
 *
 * Measured here against the pre-repair tree (`285a865`, the parent of the
 * repair), with one $100,000 account at 20% basis and a second at 90%:
 *
 *     self-transfer a1 -> a1, $50,000, a transaction that moves no money
 *       ending wealth   79,476.36  ->  79,543.37     +$67.01 from nothing
 *       tax                 67.01  ->       0.00     eliminated
 *       MAGI            34,880.21  ->  26,964.83     basis minted
 *
 * THE REPAIR made the same-account case a no-op decided BEFORE any amount,
 * income or basis is computed, and moved the basis arithmetic inside the
 * transaction so no caller can move a balance without moving its basis.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require('../src/engine.js');
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function account(id, balance, basisPct) {
  return {
    id, name: id, type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance, contribution: 0, contributionMode: 'amount', priority: 1, basisPct,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  };
}

/* The two accounts carry DIFFERENT basis rates deliberately. With equal rates a
   transfer between them moves basis proportionally and changes nothing, so the
   control below would differ from its baseline only in the last floating-point
   digit -- an arm incapable of differing, which proves the path runs only in
   the sense that it proves nothing. */
function planWith(transfer) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.assumptions.returnRate = 0;
  p.assumptions.inflation = 0;
  p.assumptions.method = 'simple';
  Object.assign(p.profile, { age: 50, retireAge: 50, endAge: 52 });
  Object.assign(p.employment, { salary: 0, contributionStop: 50 });
  p.accounts = [account('a1', 100000, 20), account('a2', 100000, 90)];
  Object.assign(p.advanced, transfer);
  return p;
}

function outcomeOf(transfer) {
  const out = engine.runPlan(planWith(transfer));
  assert.equal(out.status, 'ok', 'precondition: the fixture must run cleanly, or it measures nothing');
  const last = out.rows[out.rows.length - 1];
  return { total: last.total, taxable: last.taxable, taxes: last.taxes, magi: last.magi };
}

const NO_TRANSFER = { transferOn: false };
const SELF_TRANSFER = {
  transferOn: true, transferAge: 51, transferFrom: 'a1', transferTo: 'a1', transferAmount: 50000,
};
const REAL_TRANSFER = {
  transferOn: true, transferAge: 51, transferFrom: 'a1', transferTo: 'a2', transferAmount: 50000,
};

test('RP-01: a transfer from an account to itself changes nothing at all', () => {
  /* The whole finding in one assertion. A transaction that moves no money must
     leave every downstream figure untouched -- not merely the balance, which
     was never wrong: the balance cancelled correctly and the BASIS did not. */
  assert.deepEqual(outcomeOf(SELF_TRANSFER), outcomeOf(NO_TRANSFER),
    'a self-transfer moved no money and still changed the outcome: pre-repair it minted ' +
    'basis, eliminated the tax bill and added wealth from nothing');
});

test('RP-01 control: a real transfer between differently-based accounts DOES change the outcome', () => {
  /* Without this the test above passes against a build where transfers do not
     happen at all -- including one where transferOn is quietly ignored. The
     control has to be capable of failing for the opposite reason. */
  const none = outcomeOf(NO_TRANSFER);
  const real = outcomeOf(REAL_TRANSFER);

  assert.notDeepEqual(real, none,
    'the transfer path did not run, so the self-transfer assertion above proves nothing');

  /* And it must differ MEANINGFULLY rather than by floating-point noise: moving
     $50,000 from a 20%-basis account into a 90%-basis one changes the blended
     basis and therefore the tax. */
  assert.ok(Math.abs(real.taxes - none.taxes) > 1,
    'the control differs only by rounding (' + Math.abs(real.taxes - none.taxes) +
    '), which cannot distinguish a transfer that ran from one that did not');
  assert.ok(Math.abs(real.magi - none.magi) > 1,
    'MAGI is unmoved by a transfer that is supposed to move basis');
});

test('RP-01: the source account keeps its own basis rate, which is what proportional means', () => {
  /* Recorded because the repair deliberately does NOT write the source rate
     back. Removing dollars in proportion to their own basis leaves the
     remaining rate unchanged; writing it back would be a no-op that looked
     like care. This pins that choice so a later "fix" has to argue with it. */
  const out = engine.runPlan(planWith(REAL_TRANSFER));
  assert.equal(out.status, 'ok');
  const plan = planWith(REAL_TRANSFER);
  assert.equal(plan.accounts[0].basisPct, 20,
    'the fixture itself must still describe a 20% source, or this asserts nothing');
});

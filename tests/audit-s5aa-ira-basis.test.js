/* S5AA task 3.6 STEP 2, Q87 (F1) -- Form 8606 per-owner IRA basis, and the pro-rata rule.
 *
 * STEP 1 established WHICH part of a traditional IRA contribution is deductible (IRC 219(g)). It did
 * not record what happens to the part that is NOT. A nondeductible contribution is made with money that
 * has already been taxed, so distributing it again taxes the same dollar twice.
 *
 * THE RULE, from the Form 8606 instructions, read before this file was written (citation check C-10):
 *
 *   PER PERSON      "If both you and your spouse are required to file 2025 Form 8606, file a separate
 *                    2025 Form 8606 for each of you." Basis NEVER combines between spouses.
 *   WHAT BASIS IS    the total of all nondeductible contributions and nontaxable amounts included in
 *                    rollovers, MINUS the total of all nontaxable distributions.
 *   THE PRO-RATA RULE line 6 takes "the total value of all your traditional IRAs as of December 31 ...
 *                    plus any outstanding rollovers" -- that owner's traditional IRAs are ONE POOL. You
 *                    cannot choose to distribute basis first from one account.
 *
 * SO THE NONTAXABLE FRACTION IS A PROPERTY OF THE OWNER, NOT OF THE ACCOUNT DRAWN FROM. That is the
 * whole reason this step needs the funding solver's preTax class split per account unconditionally:
 * two IRAs of different owners in one household have different taxable fractions, and a single pooled
 * piece cannot express that.
 *
 * WHAT IS NOT MODELLED, AND IS DISCLOSED RATHER THAN ASSUMED AWAY. Basis also arises from nontaxable
 * amounts included in rollovers, and from contributions made BEFORE the projection starts. The engine
 * has no input for an opening basis, so modelled basis accrues only from nondeductible contributions
 * made inside the projection. A household that arrives with basis is under-credited, which makes the
 * modelled tax too HIGH, not too low.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

const LIMIT = global.RULES.retirement.ira.combinedLimit;

function acct(id, type, taxClass, owner, balance, extra) {
  return Object.assign({
    id, name: id, type, taxClass, owner, balance, basisPct: taxClass === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }, extra || {});
}

/* A household whose income is far past the 219(g) phase-out, so every traditional IRA contribution is
   WHOLLY nondeductible and the basis it creates is exactly the contribution. */
function household(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 45, retireAge: 46, endAge: 50, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 200000, spouseSalary: 0, growth: 0, contributionStop: 46 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, qcdOn: false, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [],
    withdrawalOrder: 'manual', manualOrder: 'taxable,preTax,roth,hsa',
  });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, penaltyException: true });
  p.accounts = [
    acct('ira', 'traditionalIRA', 'preTax', 'self', 0, { contribution: LIMIT }),
    acct('k', 'traditional401k', 'preTax', 'self', 0, { contribution: 1 }),
    acct('cash', 'taxable', 'taxable', 'self', 400000, { priority: 9 }),
  ];
  if (edit) edit(p);
  return p;
}

const run = (p) => {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
};

/* ------------------------------------------------------------------ the rule exists and is per owner */

test('S5AA 3.6 step 2 (Q87): basis is tracked per owner and never combines between spouses', () => {
  /* Form 8606 is filed separately by each spouse. Two owners each making a wholly nondeductible
     contribution must hold their own basis, and neither may borrow the other's. */
  const b = engine.form8606Basis;
  assert.equal(typeof b, 'function', 'step 2 adds a named basis computation');

  const self = { self: 7000, spouse: 0 };
  assert.equal(b(self, 'self'), 7000);
  assert.equal(b(self, 'spouse'), 0, 'the spouse may not draw on the self\'s basis');
});

test('S5AA 3.6 step 2 (Q87): the nontaxable fraction pools ALL of that owner\'s traditional IRAs', () => {
  /* Form 8606 line 6. The fraction is a property of the OWNER, so it cannot be computed from the one
     account a draw happens to come out of. */
  const fraction = engine.iraNontaxableFraction;
  assert.equal(typeof fraction, 'function');
  /* $14,000 of basis against a $70,000 pool is 20% nontaxable, whichever account is drawn. */
  assert.equal(fraction(14000, 70000).toFixed(6), (0.2).toFixed(6));
  assert.equal(fraction(0, 70000), 0, 'no basis, nothing nontaxable');
  assert.equal(fraction(14000, 0), 0, 'an empty pool distributes nothing, so nothing is nontaxable');
  assert.equal(fraction(90000, 70000), 1, 'basis can never exceed the pool it is recovered from');
});

/* ------------------------------------------------------------------ the money */

test('S5AA 3.6 step 2 (Q87): a nondeductible contribution is not taxed again, and a deductible one is', () => {
  /* TWO HOUSEHOLDS, IDENTICAL BUT FOR SALARY, AND THE WHOLE DIFFERENCE IS THE BASIS.

     Each contributes the full IRA limit ($7,500 of basis at a $200,000 salary, nothing at $40,000
     because that contribution is deductible), then draws the account down over the next two years.
     The taxable account is empty, so every dollar of spending must come out of the IRA.

       $200,000 salary, wholly NONDEDUCTIBLE:  age 47 -> federalAgi 0.00 on a $5,000 draw
                                               age 48 -> federalAgi 1.00 on a $2,501 draw
       $40,000 salary, wholly DEDUCTIBLE:      age 47 -> federalAgi 5,000.00
                                               age 48 -> federalAgi 2,501.00

     The $1 is the traditional 401(k) dollar: a 401(k) keeps its own basis on the plan and is NOT part
     of the IRA pro-rata pool, which is exactly the distinction Form 8606 draws. So $7,500 of basis
     shelters $7,500 of the $7,501 distributed, and the remaining dollar is taxed. */
  const agiAt = (r, age) => {
    const row = r.rows.find((x) => Math.abs(x.age - age) < 1e-9);
    assert.ok(row, 'no row at ' + age);
    return Number(row.federalAgi) || 0;
  };
  const drawsFrom = (salary) => run(household((p) => {
    p.employment.salary = salary;
    p.profile.endAge = 48;
    p.retirement.spending = 5000;
    p.accounts[2].balance = 0;
  }));

  const nondeductible = drawsFrom(200000);
  const deductible = drawsFrom(40000);

  assert.equal(agiAt(nondeductible, 47).toFixed(2), '0.00',
    'a draw wholly covered by basis creates NO income');
  assert.equal(agiAt(deductible, 47).toFixed(2), '5000.00',
    'CONTROL: the same draw with no basis is ordinary income in full');

  assert.equal(agiAt(nondeductible, 48).toFixed(2), '1.00',
    'and the last draw is taxable only on the 401(k) dollar, which is not in the IRA pool');
  assert.equal(agiAt(deductible, 48).toFixed(2), '2501.00');

  const shelteredNon = agiAt(nondeductible, 47) + agiAt(nondeductible, 48);
  const shelteredDed = agiAt(deductible, 47) + agiAt(deductible, 48);
  assert.equal((shelteredDed - shelteredNon).toFixed(2), (LIMIT).toFixed(2),
    'the whole difference between the two households is exactly the basis: ' + LIMIT);
});

test('S5AA 3.6 step 2 (Q87): the pool is measured BEFORE the draw, not after it', () => {
  /* Form 8606 line 6 is the value "as of December 31 ... plus any outstanding rollovers" -- the
     PRE-distribution pool. Computing it live, from balances already decremented, makes the fraction
     self-referential: a draw that empties an account leaves a pool of zero and taxes the whole
     distribution. The first version of this repair did exactly that, and the two errors cancelled in
     the one year that was being watched. This pins the emptying draw, which is where it shows. */
  const emptied = run(household((p) => {
    p.employment.salary = 200000;
    p.profile.endAge = 48;
    p.retirement.spending = 5000;
    p.accounts[2].balance = 0;
  }));
  const last = emptied.rows.find((x) => Math.abs(x.age - 48) < 1e-9);
  assert.ok((Number(last.withdrawals) || 0) > 2000, 'CONTROL: the final draw empties the account');
  assert.ok((Number(last.federalAgi) || 0) < 10,
    'emptying the pool must not make the distribution fully taxable; got '
    + (Number(last.federalAgi) || 0).toFixed(2));
});

/* ------------------------------------------------------------------ the quote and the commit */

test('S5AA 3.6 step 2 (Q87): the tax quote and the settlement agree when basis is in play', () => {
  /* The funding solver prices a pre-tax draw; basis changes its taxable fraction PER OWNER, so the
     quote and the commit must use the same fraction or a settlement code fires rather than a different
     total being reported. */
  const r = engine.runPlan(household((p) => {
    p.profile.endAge = 50;
    p.retirement.spending = 30000;
  }));
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  const codes = (r.issues || []).map((i) => i.code);
  assert.ok(!codes.includes('TAX_SETTLEMENT_MISMATCH'), codes.join(','));
  assert.ok(!codes.includes('QUOTE_SETTLEMENT_UNVERIFIED'), codes.join(','));
});

/* ------------------------------------------------------------------ the boundary, disclosed */

test('S5AA 3.6 step 2 (Q87): the household is told basis is only what the projection itself created', () => {
  const r = engine.runPlan(household());
  const said = (r.issues || []).find((i) => i.code === 'IRA_BASIS_FROM_PROJECTION_ONLY');
  assert.ok(said, 'a household accruing basis must be told what the figure does and does not include');
  assert.equal(said.severity, 'WARNING');
  assert.match(said.message, /before this plan starts|opening basis/i,
    'the missing opening basis is named, because it makes the modelled tax too HIGH');
});

test('S5AA 3.6 step 2 (Q87): a household with no nondeductible contribution is told nothing', () => {
  const r = engine.runPlan(household((p) => { p.employment.salary = 40000; }));
  assert.equal((r.issues || []).filter((i) => i.code === 'IRA_BASIS_FROM_PROJECTION_ONLY').length, 0,
    'the disclosure must not fire where no basis arises');
});

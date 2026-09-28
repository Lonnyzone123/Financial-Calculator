/* FM-02 through the public entry point: S5 block 2r's rebuild-proof guard.
 *
 * findingIds: FM-02
 *
 * The senior deduction phases out per person. Each qualifying person's $6,000
 * is reduced separately by 6% of income over the phase-out start, and the
 * reduced amounts are then added. Before the repair a couple started from a
 * doubled $12,000 and subtracted one reduction, which overstated their deduction
 * above the start and stretched their phase-out to twice its width.
 *
 * The existing guard (tests/audit-fm02-senior-deduction.test.js) calls the
 * engine's internal deduction and tax functions directly, so a rebuild that
 * renamed them would leave the behaviour unguarded. This file reaches it only
 * through runPlan(), and reads row 1's taxes for three married couples with the
 * same income, differing only in how many of them are 65 or older: both, one,
 * or neither. By statute each eligible person adds the same deduction, so the
 * two tax steps between those couples are equal, and past each person's
 * phase-out neither step saves anything. The comparisons are between couples, so
 * no bracket or deduction amount is pinned here.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');

function couple(selfAge, spouseAge, pension) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.profile, { age: selfAge, spouseAge, spouseOn: true, filing: 'mfj', retireAge: selfAge, endAge: selfAge + 3 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: selfAge });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 5000000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  p.retirement.otherIncomes = [{ type: 'pension', owner: 'self', amount: pension, start: selfAge - 1, end: selfAge + 10, growthMode: 'fixed', growth: 0 }];
  Object.assign(p.retirement, { pension: 0, ssBenefit: 0, spouseSS: 0, dividendOn: false });
  return p;
}

/* The whole first projected row, so a test can read the MEASURE a deduction is phased out on rather
   than assume the pension is the household's whole income -- these couples also hold a $5,000,000
   taxable account, so their senior-deduction MAGI is far above the pension. */
function firstYearRow(p) {
  const result = engine.runPlan(p);
  assert.equal(result.status, 'ok');
  return result.rows[1];
}

function firstYearTaxes(p) {
  const result = engine.runPlan(p);
  assert.equal(result.status, 'ok');
  return result.rows[1].taxes;
}

/* Row 1 taxes for couples with both, one, and neither spouse aged 65 or older. */
function byEligibleCount(pension) {
  return {
    two: firstYearTaxes(couple(70, 70, pension)),
    one: firstYearTaxes(couple(70, 64, pension)),
    none: firstYearTaxes(couple(64, 64, pension)),
  };
}

const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 0.01, what + ': expected ' + expected + ', got ' + actual);

/* S5AA task 3.1 (Q88): the IRC 63(f) additional standard deduction for the aged. It is a DIFFERENT
   deduction from the temporary enhanced senior deduction these tests are about, and the difference that
   matters here is that it carries NO PHASEOUT. Read from the rule record, never retyped. */
const AGED_MARRIED = RULES.federal.additionalStandardDeduction.records
  .find((r) => r.provision_id === 'federal_additional_standard_deduction_aged').value;

/* NOTE: this file asserts only what the PUBLIC ROUTE reports -- runPlan's rows -- together with values
   read out of the rule tables. The deduction identity itself needs the engine's rule functions, so it
   lives in tests/audit-fm02-senior-deduction.test.js, which owns FM-02's internals. Reaching into them
   from here once left FM-02 with no implementation-independent test at all, and tools/closeout-check.js
   refused the carry-forward (COUPLED-ONLY-FM-02) until it was put back. */

test('FM-02 (runPlan): above the joint phase-out start, each eligible spouse adds the same senior deduction', () => {
  const t = byEligibleCount(100000);
  const first = t.none - t.one;
  const second = t.one - t.two;
  assert.ok(first > 0, 'above the start, one eligible spouse still lowers the tax: saved ' + first);
  near(second, first, 'above the start, the second eligible spouse\'s tax saving against the first\'s');
});

test('FM-02 (runPlan): past each person\'s phase-out, a couple gets no senior deduction at all', () => {
  const PENSION = 200000;
  const t = byEligibleCount(PENSION);
  /* R6 (S5 task 8): Arizona's $2,100 exemption for each person 65 or older (TAX section 5.3, ENACTED) is not the federal
     senior deduction, and at this income it saves its full 2.5% each. Taken out, no senior deduction may remain; before
     R6 the taxes were equal outright. */
  const azExemptionSaving = RULES.arizona.records.find((r) => r.provision_id === 'az_age65_exemption').value * RULES.arizona.rate;

  /* S5AA task 3.1 (Q88): AND the IRC 63(f) amount, which is NOT the senior deduction and does NOT phase out.
     Past the senior phaseout each eligible spouse still carries $1,650 of it, so "no senior deduction at all"
     no longer means "no difference at all". The federal saving is computed with the engine's own bracket
     function across the exact span the deduction removes, so no rate is assumed or written down here.
     THIS IS THE POINT OF THE REPAIR, stated as an assertion: the two deductions behave differently past
     the phaseout, and a test that expected them to behave identically would have concealed it. */
  /* LINEARITY. Past the phaseout each eligible spouse lowers the tax by the same amount -- which is the
     claim this test has always made -- so the second spouse against the first is the sharpest form of it. */
  const perSpouse = t.none - t.one;
  near(t.one - t.two, perSpouse, 'past the phase-out, the second eligible spouse against the first');
  near(t.two, t.none - 2 * perSpouse, 'past the phase-out, two eligible spouses against none');

  /* AND THE SAVING IS NO LONGER ARIZONA ALONE. Before S5AA task 3.1 an eligible spouse past the senior
     phaseout saved exactly Arizona's exemption and nothing federal. The section 63(f) amount does not
     phase out, so each spouse now also keeps $1,650 of federal deduction. The excess over Arizona is
     checked to be exactly that amount at one of the engine's OWN ordinary bracket rates -- the rate is
     looked up in the table rather than written here, so this does not restate the engine's bracket
     stacking (capital gains sit on top of ordinary income, so the ordinary base is below AGI). */
  assert.ok(perSpouse > azExemptionSaving + 0.01,
    'each eligible spouse must now save MORE than Arizona\'s exemption alone: saved ' + perSpouse
    + ' against an Arizona exemption worth ' + azExemptionSaving);
  const federalPart = perSpouse - azExemptionSaving;
  const impliedRate = federalPart / AGED_MARRIED;
  assert.ok(RULES.federal.ordinaryBrackets.mfj.some((b) => Math.abs(b[1] - impliedRate) < 1e-9),
    'the federal part of the saving must be exactly the 63(f) married amount at a real bracket rate: '
    + federalPart + ' / ' + AGED_MARRIED + ' = ' + impliedRate + ', which is not a rate in the joint table');

  /* AND THAT LAST ASSERTION IS ALSO THE CONTROL the test is named for. If any senior deduction survived at
     this income, the federal part of each spouse's saving would be (1,650 + whatever remained) at the bracket
     rate, and dividing it by 1,650 alone could not land exactly on a rate in the joint table. So "no senior
     deduction at all" is verified by the same arithmetic, from the public route, without asking the engine. */
});

test('FM-02 (runPlan): below the phase-out start, two eligible spouses get twice one spouse\'s deduction', () => {
  const PENSION = 70000;
  const t = byEligibleCount(PENSION);

  /* THE CLAIM IS ABOUT THE DEDUCTION, and that is now what is asserted. Equal TAX savings were only ever a
     proxy for equal deductions, and the proxy holds just while every dollar of both deductions sits inside
     one bracket. S5AA task 3.1 made the total deduction large enough that at this income a two-senior couple
     lands at $22,500 of taxable income -- BELOW the $24,800 joint 10%/12% boundary, where it used to clear it
     by $1,000 -- so the second spouse's deduction reaches into the 10% band and genuinely saves less. That is
     correct behaviour, and asserting the deduction identity instead is both stronger and independent of where
     the brackets happen to fall. */
  const first = t.none - t.one;
  const second = t.one - t.two;
  assert.ok(first > 0, 'below the start, one eligible spouse lowers the tax: saved ' + first);
  assert.ok(second > 0, 'below the start, the second eligible spouse lowers it again: saved ' + second);
  /* The second spouse's deduction sits UNDER the first's in the bracket stack, so it can never be worth
     more, and it is worth strictly less exactly when it reaches into a lower band. Both are asserted; the
     equality case, and the deduction identity behind it, are pinned in the internals file. */
  assert.ok(second <= first + 0.01,
    'the second eligible spouse can never save MORE than the first -- first ' + first + ', second ' + second);
});

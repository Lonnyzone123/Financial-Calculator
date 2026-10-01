/* Q89 (F3, with G17) through the PUBLIC ROUTE -- runPlan() and the rows it reports, nothing else.
 *
 * tests/audit-s5aa-niit-base.test.js pins the rule where it lives, by calling estimateTaxes(),
 * otherIncomeFor() and taxSegmentLocal() directly, and is implementation-coupled for that reason.
 * This file exists because a repair that cannot be seen from the public route has not been shown to
 * reach a user: tools/closeout-check.js refused Q89 as COUPLED-ONLY until it existed, which is the
 * check doing its job.
 *
 * Everything below is observed from p -> runPlan(p) -> rows[i].taxes. No engine internals are read,
 * and no dollar figure is hard-coded: each claim is a COMPARISON between two plans that differ in one
 * respect, so the assertions survive a rate or threshold change in the rule tables.
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

const THRESHOLD = global.RULES.federal.niit.threshold.single;
const RATE = global.RULES.federal.niit.rate;
const STREAM = 40000;

/* A single filer with a large pension, so the NIIT MAGI sits well above the threshold on its own,
   plus one optional income stream of a given type. Simple deterministic returns, no dividends, so the
   only thing that varies between runs is the stream's TYPE. */
function plan(type) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 66, retireAge: 66, endAge: 70, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 30000, withdrawalRate: 4, flexibility: 0, dividendOn: false,
    pension: THRESHOLD + 50000, pensionCola: 0,
    stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false,
  });
  if (type) {
    p.retirement.otherIncomes = [{
      name: type, type, owner: 'self', amount: STREAM, start: 66, end: 70,
      growthMode: 'fixed', growth: 0,   // S5AA R43: 'none' is not an income growth mode (the validator's list); fixed at 0% is the same
    }];
  }
  p.accounts = [{
    id: 'a1', name: 'Taxable', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 3000000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0,
    matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }];
  return p;
}

function firstFullYearTaxes(type) {
  const r = engine.runPlan(plan(type));
  assert.strictEqual(r.status, 'ok', type + ': the plan must run, got ' + r.status + ' / ' + r.calculationErrorCode);
  assert.ok(r.rows.length > 2, 'the plan must project some years');
  return Number(r.rows[1].taxes) || 0;
}

test('Q89 control: the fixture is above the NIIT threshold and every variant runs', () => {
  const r = engine.runPlan(plan(null));
  assert.strictEqual(r.status, 'ok');
  assert.ok(Number(r.rows[1].niitMagi) > THRESHOLD,
    'CONTROL: the MAGI must exceed the NIIT threshold, or nothing below can show a surtax');
});

test('Q89: a rental stream costs MORE tax than an identical pension stream, because Form 8960 counts it', () => {
  /* Both are ordinary income of the same size, so the ordinary tax is identical; the ONLY difference is
     that rental real estate is net investment income on Form 8960 line 4a and a pension is excluded by
     section 1411(c)(5). The gap is therefore the surtax, and it is asserted as a gap rather than as a
     dollar figure so that a change to the rate or the threshold does not silently invalidate it. */
  const pension = firstFullYearTaxes('pension');
  const rental = firstFullYearTaxes('rental');
  assert.ok(rental > pension + 0.01,
    'rental must bear the surtax that a pension does not: rental ' + rental + ' against pension ' + pension);
  assert.ok(Math.abs((rental - pension) - RATE * STREAM) < 0.01,
    'and the gap must be exactly the surtax on the stream: got ' + (rental - pension).toFixed(2)
    + ', expected ' + (RATE * STREAM).toFixed(2));
});

test('Q89: an investment-income stream is treated the same as rental, and both differ from wages', () => {
  const rental = firstFullYearTaxes('rental');
  const investment = firstFullYearTaxes('investment');
  assert.ok(Math.abs(rental - investment) < 0.01,
    'rental and investment income are both counted: ' + rental + ' against ' + investment);

  /* Employment income is not investment income. It bears payroll tax instead, so its total is not
     comparable to a pension's -- the claim here is only that it does NOT pick up the surtax gap. */
  const employment = firstFullYearTaxes('employment');
  assert.ok(Math.abs((employment - firstFullYearTaxes('pension')) - RATE * STREAM) > 0.01,
    'wages must not differ from a pension by exactly the surtax -- they are not net investment income');
});

test('Q89: a generic "other" stream and a tax-free stream do not pick up the surtax', () => {
  /* The disclosure, pinned. "other" carries no tax character -- the label fixes nothing about whether
     the money is interest, a gift or a settlement -- so it stays out of the base and is taxed as
     ordinary income exactly as a pension is. If that decision is ever revisited, this fails and says so. */
  const pension = firstFullYearTaxes('pension');
  assert.ok(Math.abs(firstFullYearTaxes('other') - pension) < 0.01,
    'an "other recurring" stream must be taxed exactly as a pension is, with no surtax');

  /* Tax-free income is outside the income tax and the surtax alike, so it must cost LESS than a pension. */
  assert.ok(firstFullYearTaxes('taxFree') < pension - 0.01, 'tax-free income must not be taxed at all');
});

test('Q89: below the threshold the same rental stream costs exactly what a pension does', () => {
  /* The must-not-move half, through the public route: the surtax applies only above the threshold, so a
     household under it must not be able to tell the two streams apart. */
  const small = (type) => {
    const p = plan(type);
    p.retirement.pension = 40000;              /* well below the threshold */
    p.retirement.spending = 20000;
    const r = engine.runPlan(p);
    assert.strictEqual(r.status, 'ok');
    assert.ok(Number(r.rows[1].niitMagi) < THRESHOLD, 'CONTROL: this fixture must be BELOW the threshold');
    return Number(r.rows[1].taxes) || 0;
  };
  assert.ok(Math.abs(small('rental') - small('pension')) < 0.01,
    'below the threshold a rental stream and a pension must cost the same: '
    + small('rental') + ' against ' + small('pension'));
});

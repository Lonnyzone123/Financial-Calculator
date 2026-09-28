/* S5 block 2h.4 -- Q50: retirement.dividendQualified is a percentage OF the
 * dividend cash, and nothing bounded it.
 *
 * Decided 2026-09-14 (the owner), answer (c): both a validator range check and an
 * engine-level clamp. The validator warns when an imported or hand-edited plan
 * carries a share outside 0 to 100%. The engine holds the share to 0-100 where
 * it is read, and discloses once for the run that it did.
 *
 * The defect: qualifiedDividends = dividendCash * share / 100 and
 * ordinaryDividends = dividendCash - qualifiedDividends, with no bound. Above
 * 100 the ordinary part goes negative and is subtracted from ordinary income;
 * below 0 it exceeds the cash. In this fixture the effect is not even
 * monotonic: at 150% the first year's tax is understated, and at 500% the
 * "qualified" amount is so large that capital-gains tax pushes it above 100%'s.
 * So every witness asserts EQUALITY with the clamped share, never "not less".
 *
 * DO NOT VERIFY THIS AGAINST lifetimeTaxes (S5 checklist 2h.4): lower tax
 * compounds into a larger portfolio over a long plan and reverses the
 * aggregate's sign. Every engine assertion reads the FIRST interval row, which
 * no earlier year's tax has fed.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { installDebtModules, corpus } = require('../tools/capture-baseline.js');

const ROOT = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
installDebtModules();
const engine = require('../src/engine.js');
const { validateScenario } = require('../src/scenario-validator.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs.js');

const clone = (v) => JSON.parse(JSON.stringify(v));
const defaultPlan = extractDefaultPlan(shell);
const CODE = 'DIVIDEND_QUALIFIED_CLAMPED';
const VALIDATOR_CODE = 'DIVIDEND_QUALIFIED_OUT_OF_RANGE';

/* A dividend-paying shape: single, 75 to 77, a $60,000 pension for
   ordinary income, returns, inflation and fees 0, dividends on at a 3% yield
   from 65, and one $1,000,000 taxable account -- $30,000 of dividends in the
   first interval. */
function plan(share, dividendOn) {
  const p = clone(defaultPlan);
  p.profile.age = 75; p.profile.retireAge = 65; p.profile.endAge = 77;
  p.profile.spouseOn = false; p.profile.filing = 'single';
  p.employment.salary = 0; p.employment.spouseSalary = 0;
  p.assumptions.method = 'simple'; p.assumptions.returnRate = 0;
  p.assumptions.inflation = 0; p.assumptions.fee = 0; p.assumptions.volatility = 0;
  p.retirement.strategy = 'fixedNominal'; p.retirement.spending = 20000;
  p.retirement.pension = 60000; p.retirement.pensionCola = 0;
  p.retirement.ssBenefit = 0; p.retirement.spouseSS = 0;
  p.retirement.dividendOn = dividendOn !== false; p.retirement.dividendYield = 3;
  p.retirement.dividendQualified = share; p.retirement.dividendGrowth = 0; p.retirement.dividendStart = 65;
  p.retirement.stages = []; p.retirement.expenses = []; p.retirement.otherIncomes = [];
  p.advanced.rmdOn = false; p.advanced.debts = []; p.advanced.otherAssets = [];
  p.advanced.healthOn = false; p.advanced.ltcOn = false;
  p.accounts = [{
    id: 'a1', name: 'A', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1000000, basisPct: 100,
    contributionMode: 'dollar', contribution: 0, frequency: 12, annualChangeMode: 'percent', annualChange: 0,
    changeTiming: 'annual', contributionPreset: 'none', futureChanges: [], priority: 1, matchOn: false, matchRate: 0,
    matchCap: 0, profitShare: 0, vesting: 100, allocation: {},
  }];
  return p;
}
const run = (share, dividendOn) => engine.runPlan(clone(plan(share, dividendOn)));
const firstYearTax = (r) => Math.round(r.rows[1].taxes * 100) / 100;
const disclosures = (r) => (r.issues || []).filter((i) => i.code === CODE);

test('Q50 engine: a qualified share above 100% is taxed exactly as 100%', () => {
  const at100 = firstYearTax(run(100));
  assert.ok(run(100).rows[1].dividends > 0, 'premise: the first interval pays dividends');
  assert.equal(firstYearTax(run(150)), at100,
    'at 150% the first year\'s tax must equal 100%\'s ' + at100 + '; unbounded, the ordinary share went negative and understated it');
  assert.equal(firstYearTax(run(500)), at100,
    'at 500% as well; unbounded, the excess was taxed as capital gains and overstated it');
});

test('Q50 engine: a qualified share below 0% is taxed exactly as 0%', () => {
  const at0 = firstYearTax(run(0));
  assert.equal(firstYearTax(run(-50)), at0,
    'at -50% the first year\'s tax must equal 0%\'s ' + at0 + '; unbounded, the ordinary share exceeded the cash and overstated it');
});

test('Q50 engine: a share outside 0 to 100% is disclosed once for the run, with the share used', () => {
  for (const [share, used] of [[150, 100], [-50, 0]]) {
    const found = disclosures(run(share));
    assert.equal(found.length, 1, 'at ' + share + '% the held share must be disclosed exactly once, got ' + found.length);
    assert.equal(found[0].severity, 'WARNING');
    assert.equal(found[0].state.used, used, 'and it must say which share was used');
  }
});

test('Q50 validator: a share above 100% or below 0% is warned about at the field', () => {
  for (const share of [150, -50]) {
    const p = clone(corpus()[0].plan);
    p.retirement.dividendQualified = share;
    const outcome = validateScenario(p);
    const found = outcome.issues.filter((i) => i.code === VALIDATOR_CODE);
    assert.equal(found.length, 1, 'at ' + share + '% the validator must warn exactly once, got ' + found.length);
    assert.equal(found[0].severity, 'WARNING');
    assert.equal(found[0].path, 'retirement.dividendQualified');
    assert.equal(outcome.valid, true, 'a warning, not a rejection: the engine holds the share, so the plan still runs');
  }
});

test('Q50 control: shares from 0 to 100% are unchanged, strictly ordered and not disclosed', () => {
  const taxes = [0, 50, 85, 100].map((share) => {
    const r = run(share);
    assert.equal(disclosures(r).length, 0, 'an in-range share of ' + share + '% must not be disclosed');
    return firstYearTax(r);
  });
  for (let i = 1; i < taxes.length; i++) {
    assert.ok(taxes[i] < taxes[i - 1], 'premise: a larger qualified share lowers the tax, so a clamp that moved an in-range share would show; got ' + taxes.join(', '));
  }
});

test('Q50 control: with dividends off the share is never read, and nothing is disclosed', () => {
  const off150 = run(150, false), off100 = run(100, false);
  assert.equal(firstYearTax(off150), firstYearTax(off100), 'premise: the imputed branch does not read the share');
  assert.equal(disclosures(off150).length, 0, 'a share the calculation never reads must not be disclosed');
});

test('Q50 validator control: 0, 85 and 100% are not warned about', () => {
  for (const share of [0, 85, 100]) {
    const p = clone(corpus()[0].plan);
    p.retirement.dividendQualified = share;
    assert.equal(validateScenario(p).issues.filter((i) => i.code === VALIDATOR_CODE).length, 0,
      'an in-range share of ' + share + '% must not be warned about');
  }
});

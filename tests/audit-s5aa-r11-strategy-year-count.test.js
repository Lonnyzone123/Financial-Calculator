/* S5AA, R11 round: THE REMAINING-LIFE STRATEGIES COUNTED ONE YEAR TOO MANY (external audit of `02b921a`, R10-01).
 *
 * VPW and the RMD-style strategy divide the balance by the remaining years. Both computed that as
 * `horizon - age + 1`, but a period from 80 to 81 is ONE year, not two: the plan's rows open at
 * floor(start)+1 .. horizon, so a household aged 65 against a horizon of 100 has 35 modelled years and was paced over
 * 36. The R10 repair (02b921a) changed WHICH horizon they read -- the projection's last row rather than profile.endAge
 * -- and left the count alone, which made the error visible at the end of a plan rather than introducing it.
 *
 * MEASURED at 02b921a: one modelled year, $100,000, zero return, uncapped: both strategies spend $50,000 and the
 * household dies holding the other $50,000.
 *
 * The count is now the remaining modelled DURATION, `horizon - age`, which is also correct for a final part-year: the
 * strategies return an ANNUALIZED amount that the caller multiplies by the retired part of the row, so half a year
 * remaining is an annualized double that resolves to the balance. Every expectation below is computed by hand from the
 * scenario, not from a second engine run -- the R10 tests compared a death-cut plan against a plan ending at the same
 * age, and both carried the same wrong divisor. Caps, floors and the multiplier are unchanged. Tested through runPlan.
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
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

/* A household that holds ONE tax-free account, earns nothing, owes nothing and pays no tax: every dollar the strategy
   asks for is a dollar drawn, so the rows are the strategy's own arithmetic. */
function run({ strategy, age = 80, retireAge = null, endAge = 100, selfLife = 80.5, balance = 100000, returnRate = 0,
  vpwMinRate = 0, vpwMaxRate = 100, rmdMultiplier = 100, rmdFloor = 0, method = 'simple', volatility = 0 }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge: retireAge === null ? age : retireAge, endAge, spouseOn: false, spouseAge: age, filing: 'single' });
  Object.assign(p.assumptions, { method, returnRate, inflation: 0, fee: 0, volatility, runs: 20, seed: 3 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, { strategy, spending: 0, withdrawalRate: 4, vpwMinRate, vpwMaxRate, rmdFloor, rmdMultiplier,
    ssBenefit: 0, spouseSS: 0, pension: 0, stages: [], expenses: [], otherIncomes: [], selfLife, spouseLife: selfLife, survivor: false });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [{ id: 'roth', name: 'roth', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance, basisPct: 0, contribution: 0, priority: 1 }];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const money = (x) => Math.round(Number(x) * 100) / 100;
const spending = (r) => r.rows.slice(1).map((x) => money(x.spending));
const ending = (r) => money(r.rows[r.rows.length - 1].total);

for (const strategy of ['vpw', 'rmd']) {
  test('R10-01: ' + strategy + ' -- one modelled year spends the whole portfolio, not half of it', () => {
    const r = run({ strategy });
    assert.deepEqual(r.rows.map((x) => x.age), [80, 81], 'the plan models exactly one year');
    assert.deepEqual(spending(r), [100000], 'one year left, $100,000 in hand, nothing to leave');
    assert.equal(ending(r), 0);
  });

  test('R10-01: ' + strategy + ' -- two modelled years spend half and then the rest', () => {
    const r = run({ strategy, selfLife: 81 });
    assert.deepEqual(r.rows.map((x) => x.age), [80, 81, 82]);
    assert.deepEqual(spending(r), [50000, 50000], '$100,000 over two years at a zero real return');
    assert.equal(ending(r), 0);
  });

  test('R10-01: ' + strategy + ' -- a final HALF year is half a year, not one and a half', () => {
    /* The remaining duration is 0.5, so the ANNUALIZED amount is twice the balance and the row draws the balance.
       VPW's maximum annual rate then clamps it: at the app's highest setting, 100%, an annualized 200% is not allowed,
       so it draws half. That is the cap doing its job -- the uncapped case below shows the count itself. The RMD-style
       strategy has no such rate cap. */
    const r = run({ strategy, endAge: 80.5, selfLife: 95, vpwMaxRate: 100 });
    assert.deepEqual(r.rows.map((x) => x.age), [80, 80.5], 'one half-year row');
    assert.deepEqual(spending(r), [strategy === 'vpw' ? 50000 : 100000]);
  });

  test('R10-01: ' + strategy + ' -- a horizon of 100 from 65 paces over the 35 years it models, not 36', () => {
    const r = run({ strategy, age: 65, endAge: 100, selfLife: 100 });
    assert.equal(r.rows.length - 1, 35, 'rows open at 65 through 99');
    assert.deepEqual(spending(r).slice(0, 1), [money(100000 / 35)]);
    assert.equal(ending(r), 0, 'the last year leaves nothing');
  });
}

test('R10-01: vpw at a positive real return amortizes over the years it models, at its own annuity factor', () => {
  /* VPW's amount is the balance over the annuity factor (1 - (1+realRate)^-n) / realRate. What R10-01 is about is n:
     two modelled years means n = 2 and then n = 1, where it used to mean 3 and then 2. The factor is computed here
     from the formula, not from a second engine run. The engine's own withdrawal-timing convention decides what the
     row's growth does with what is left, so the terminal balance is not asserted here -- it is the timing model's,
     not the year count's. */
  const factor = (n) => (1 - Math.pow(1.1, -n)) / 0.1;
  const r = run({ strategy: 'vpw', selfLife: 81, returnRate: 10 });
  assert.equal(spending(r)[0], money(100000 / factor(2)), 'two years to model, not three');
  /* In the last row one year remains, so the amount is the balance over a factor below 1 -- more than the balance --
     and the 100% maximum rate clamps it to the balance itself. */
  assert.equal(spending(r)[1], money(r.rows[1].total), 'the last year is capped at the whole balance');
});

test('R10-01 (adapted): a VPW maximum of 200%, which took the rate cap out of the way, is now refused', () => {
  // S5AA R54 item 3 (the owner's decision of 2026-10-04: a value outside the form's range is refused by every route, through src/plan-value-contract.json): the form's VPW
  // maximum is 0 to 100%. (Before: projected, half a year of an annualized $200,000 exhausting the portfolio.)
  assert.throws(() => run({ strategy: 'vpw', endAge: 80.5, selfLife: 95, vpwMaxRate: 200 }), /SCENARIO_PLAN_VALUE_OUT_OF_RANGE/);
});

test('R10-01 control: the VPW rate bounds still cap the amount', () => {
  const r = run({ strategy: 'vpw', vpwMaxRate: 10 });
  assert.deepEqual(spending(r), [10000], 'one year left, but 10% of the balance is the ceiling');
});

test('R10-01 control: the RMD-style multiplier and floor are unchanged', () => {
  assert.deepEqual(spending(run({ strategy: 'rmd', rmdMultiplier: 50 })), [50000], 'half of the whole remaining balance');
  assert.deepEqual(spending(run({ strategy: 'rmd', rmdMultiplier: 0, rmdFloor: 12000 })), [12000], 'the floor still applies');
});

test('R10-01 control: a zero-volatility Monte Carlo run agrees with the deterministic one', () => {
  const a = run({ strategy: 'vpw', selfLife: 81 }), b = run({ strategy: 'vpw', selfLife: 81, method: 'monteCarlo', volatility: 0 });
  assert.deepEqual(spending(b), spending(a));
  assert.equal(b.successRate, 100);
});

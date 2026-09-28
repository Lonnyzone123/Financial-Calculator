/* S5AA task 5.2, Q105 (G13) -- what `dividendStart` MEANS, pinned. DOCUMENTATION AND PINS ONLY.
 *
 * NO OUTPUT CHANGES IN THIS FILE, AND THAT IS THE POINT. The owner decided this one (decision 12.9 (b)):
 * `dividendStart` means WHEN MODELLED DIVIDEND CASH STARTS BEING PAID OUT TO SPEND, and the imputed
 * 1.5% charge that stands in for dividends when the feature is off stays as the stated assumption. So
 * the behaviour the audit found -- the imputed branch never consulting `dividendStart` -- is INTENDED,
 * and what was missing was the definition that makes it intended rather than accidental.
 *
 * THE TEST THE DRAFT FIRST DESCRIBED IS DELIBERATELY NOT BUILT. It would have asserted that no imputed
 * tax arises before `dividendStart`, which is the OPPOSITE of the chosen behaviour. Writing it would
 * have pinned a decision nobody made.
 *
 * These three pins exist so the decision cannot rot quietly:
 *   1. the auditor's own case, recorded as today's behaviour rather than as a defect;
 *   2. `dividendStart` moves NOTHING while dividends are off, for any value;
 *   3. with dividends on, a `dividendStart` at or below retirement age changes nothing, because
 *      retirement age is already the floor -- which is why the two branches differ at all.
 *
 * [SUPERSEDED: repaired at 823666b -- with dividends ON the entered yield is now taxed every year.]
 * CARRIED TO S5b TASK 1 BY NAME: with dividends ON, no dividend is taxed before retirement whatever
 * the yield. One synthetic probe put that near $29,000 of tax over 15 years -- a single scenario, not a
 * general figure, and not a claim this file makes.
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

/* A live return is required: a zero-return holding pays no dividend at all (RA-03), so a zero-return
   fixture would report "no difference" for a reason that has nothing to do with dividendStart. */
function holder(dividendStart, dividendOn, retireAge) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 45, retireAge: retireAge === undefined ? 45 : retireAge, endAge: 60, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 6, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false,
    stages: [], expenses: [], otherIncomes: [],
    dividendOn, dividendStart, dividendYield: 3, dividendQualified: 85, dividendGrowth: 0,
  });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false });
  p.accounts = [{
    id: 'taxable', name: 'taxable', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 1000000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }];
  return p;
}

const lifetimeTax = (p) => {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r.rows.reduce((t, row) => t + (Number(row.taxes) || 0), 0);
};
const shape = (p) => {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return JSON.stringify(r.rows.map((row) => [row.age, row.total, row.taxes, row.dividends]));
};

/* ------------------------------------------------------------------ 1. the auditor's case */

test('S5AA 5.2 (Q105): the auditor\'s case is TODAY\'S BEHAVIOUR, recorded, not repaired', () => {
  /* At 45 with $1,000,000 taxable and dividends OFF, a dividendStart of 55 and one of 40 give
     identical tax. The audit reported that as a defect. It is the decided behaviour: the imputed 1.5%
     charge stands in for the dividends a taxable portfolio pays all along, and `dividendStart` is
     about when modelled dividend CASH starts being paid out to spend -- a different question. */
  assert.equal(lifetimeTax(holder(55, false)).toFixed(2), lifetimeTax(holder(40, false)).toFixed(2));
});

/* ------------------------------------------------------------------ 2. it moves nothing when off */

test('S5AA 5.2 (Q105): with dividends off, dividendStart moves nothing at all, for any value', () => {
  /* Stronger than the auditor's two points: the WHOLE row shape is identical across the range, so
     this pin fails if the imputed branch ever starts consulting the field. */
  const reference = shape(holder(40, false));
  for (const start of [0, 40, 45, 50, 55, 60, 99]) {
    assert.equal(shape(holder(start, false)), reference,
      'dividendStart = ' + start + ' changed a dividends-off projection');
  }
});

/* ------------------------------------------------------------------ 3. the floor, with dividends on */

test('S5AA 5.2 (Q105): with dividends on, a start at or below retirement age changes nothing', () => {
  /* dividendDuration floors at max(age, retireAge, dividendStart), so retirement age already bounds
     it. A start earlier than retirement cannot pull the cash forward, which is the asymmetry that
     makes the two branches differ in the first place. */
  const atRetirement = shape(holder(55, true, 55));
  for (const start of [0, 40, 50, 55]) {
    assert.equal(shape(holder(start, true, 55)), atRetirement,
      'dividendStart = ' + start + ' moved a plan retiring at 55');
  }
});

test('S5AA 5.2 (Q105): with dividends on, a start AFTER retirement age does delay the cash', () => {
  /* The control for the pin above: the field is not inert on the cash branch, it is floored. Without
     this, "changes nothing" would be satisfied by a field nothing reads. */
  const atRetirement = shape(holder(55, true, 55));
  const later = shape(holder(58, true, 55));
  assert.notEqual(later, atRetirement, 'a start after retirement must delay the dividend cash');
});

/* ------------------------------------------------------------------ 4. the definition is written down */

test('S5AA 5.2 (Q105): the Rules page states what dividendStart means', () => {
  assert.match(shell, /dividend[^.]{0,120}start[^.]{0,200}paid out to spend/i,
    'the page must define dividendStart as when modelled dividend cash starts being paid out to spend');
  assert.match(shell, /1\.5%/,
    'and must keep the imputed charge visible as the stated assumption it is');
});

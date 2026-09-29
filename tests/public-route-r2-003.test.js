/* R2-003 through the public entry point: S5 block 2r's rebuild-proof guard.
 *
 * findingIds: R2-003
 *
 * Survivor benefits follow two eligibility rules:
 *   - a surviving spouse is paid only once they reach their own chosen claim
 *     age, so a 50-year-old whose claim age is 67 receives nothing;
 *   - (SUPERSEDED at S5AA R34, SA32F-02) a benefit can be passed on only if the
 *     person who died had claimed it while alive. The law asks no such thing: a
 *     widow(er)'s benefit rests on the deceased's PIA and the delayed credits
 *     earned by the death (20 CFR 404.335, 404.313(e)). The probes are kept and
 *     what they prove is inverted below.
 * A survivor past their own claim age still receives the larger of the two
 * established benefits, even with no benefit of their own.
 *
 * The existing guard (tests/audit-r2-survivor.test.js) calls the engine's
 * internal household benefit helper directly, so a rebuild that renamed it
 * would leave the behaviour unguarded. This file reaches it only through
 * runPlan(). The benefit paid in a year is that row's income less the same
 * plan's income with no benefits, in a retired household with no wages, no
 * other income and no investment return. The audit's household: the self
 * claimed $3,000 a month at 67 and died at 70; the spouse has $1,000 a month
 * of their own from 67.
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

function plan(profile, retirement) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.profile, { retireAge: profile.age, endAge: profile.age + 3 }, profile);
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: profile.age });
  p.accounts = [{
    id: 'a1', name: 'T', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: 2000000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 100,
    annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
    profitShare: 0, vesting: 100,
  }];
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  p.retirement.otherIncomes = [];
  p.retirement.pension = 0;
  Object.assign(p.retirement, retirement);
  return p;
}

/* The benefit paid in row `row`: income with the benefits, less income without them. */
function paidIn(p, row) {
  const without = JSON.parse(JSON.stringify(p));
  without.retirement.ssBenefit = 0;
  without.retirement.spouseSS = 0;
  const a = engine.runPlan(JSON.parse(JSON.stringify(p)));
  const b = engine.runPlan(without);
  assert.equal(a.status, 'ok');
  assert.equal(b.status, 'ok');
  return a.rows[row].income - b.rows[row].income;
}

const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 0.01, what + ': expected ' + expected + ', got ' + actual);

/* S5AA task 4.7 (Q92, F6) reduces a survivor benefit for the age it STARTS at. These fixtures widow
   their survivor at spouseAge - 2, because the self is 72 and died at 70. The factor is
   1 - 0.285 * (months before survivor full retirement age) / 84, written out here rather than read
   back from the engine so each assertion stays independent. */
/* RE-FIXTURED BY INTENT at S5AA R34 (the owner 2026-09-29: "Follow law everywhere"). The self at 72 was born 1954, full retirement
   age 66 from the birth year (SA32F-05), so a claim at 67 is 12 months of credit, 3,240 a month -- the benefit a survivor inherits.
   A survivor's full retirement age is read two birth years on (20 CFR 404.409), so it moves with the survivor's age; benefits round
   down to the dollar (R32V-03); while both are alive the lower earner also receives 500 a month on the other's record (SA32F-03).
   Worked with tests/lib/ssa-reference.js, not read back from the engine. */
const SSA = require('./lib/ssa-reference.js');
const DECEASED = SSA.floorDollar(3000 * SSA.claimFactor(67, SSA.fra(72)));   /* 3,240 */
const survivorAnnual = (survivorAgeNow, widowedAt, original) =>
  SSA.floorDollar((original || DECEASED) * SSA.survivorFactor(Math.max(60, widowedAt), SSA.survivorFra(survivorAgeNow))) * 12;
const SPOUSE68_OWN = SSA.floorDollar(1000 * SSA.claimFactor(67, SSA.fra(68))) * 12;   /* 1,026 a month: 12,312 */
const REDUCED_FROM_66 = survivorAnnual(68, 66);           /* 38,292 */
const REDUCED_FROM_65 = survivorAnnual(67, 65);           /* 36,312 */
const REDUCED_FROM_64 = survivorAnnual(66, 64);           /* 34,440 */
const REDUCED_FROM_64_999 = survivorAnnual(66.999, 64.999);  /* 36,108 */

/* The self died; only the surviving spouse's current age and the listed fields vary. */
const selfDied = (spouseAge, fields) => plan({ age: 72, spouseAge, spouseOn: true }, Object.assign({
  survivor: true, ssClaim: 67, ssFra: 67, ssBenefit: 3000, ssCola: 0, selfLife: 70,
  spouseSS: 1000, spouseClaim: 67, spouseLife: 95,
}, fields));
/* The spouse died: the same household with the owners reversed. */
const spouseDied = (selfAge, spouseLife) => plan({ age: selfAge, spouseAge: 72, spouseOn: true }, {
  survivor: true, ssClaim: 67, ssFra: 67, ssBenefit: 1000, ssCola: 0, selfLife: 95,
  spouseSS: 3000, spouseClaim: 67, spouseLife,
});

test('R2-003 (runPlan): a survivor below their own claim age receives nothing, whichever spouse died', () => {
  near(paidIn(selfDied(50), 1), 0, 'a surviving spouse aged 50');
  near(paidIn(spouseDied(50, 70), 1), 0, 'a surviving self aged 50');
});

test('R2-003 (superseded by S5AA 4.7): the survivor benefit does not wait for the survivor\'s own claim age', () => {
  /* THIS TEST'S PREMISE WAS THE DEFECT, and F6 names it: a survivor benefit is payable from 60 and
     does not wait for the recipient's own RETIREMENT claim age. Both probes are widowed well before
     60 has any bite -- at 64.999 and 64 -- and are owed the WHOLE row, reduced for those ages. The
     second used to be paid nothing at all. */
  near(paidIn(selfDied(66.999), 1), REDUCED_FROM_64_999, 'widowed at 64.999, paid the whole row');
  near(paidIn(selfDied(66), 1), REDUCED_FROM_64,
    'widowed at 64 and now 66: this row used to pay ZERO because their own claim age is 67');
});

test('R2-003 (superseded by S5AA R34, SA32F-02): a person who died before claiming still leaves a survivor benefit, whichever spouse died', () => {
  /* THE OLD PREMISE WAS THE DEFECT. Died at 65, before full retirement age 66, unfiled: the original benefit is the PIA, 3,000, and
     the survivor, widowed at 61, is 24% reduced -- 2,280 a month, well above their own 1,026. Died at 67 unfiled: 12 months of
     credit had been earned, 3,240, and widowed at 63 it is 15% reduced -- 2,754. */
  near(paidIn(selfDied(68, { selfLife: 65 }), 1), survivorAnnual(68, 61, 3000), 'a self who died at 65 before a claim at 67');
  near(paidIn(spouseDied(68, 65), 1), survivorAnnual(68, 61, 3000), 'a spouse who died at 65 before a claim at 67');
  near(paidIn(selfDied(68, { selfLife: 67 }), 1), survivorAnnual(68, 63), 'a self who died at the claim age itself');
});

test('R2-003 (runPlan): a survivor past their claim age still receives the larger established benefit, with or without one of their own', () => {
  near(paidIn(selfDied(68), 1), REDUCED_FROM_66, 'a survivor with a benefit of their own');
  near(paidIn(selfDied(68, { spouseSS: 0 }), 1), REDUCED_FROM_66, 'a survivor with no benefit of their own');
  near(paidIn(selfDied(67), 1), REDUCED_FROM_65, 'a survivor widowed a year earlier');
});

test('R2-003 (runPlan): both alive, survivor benefits off, and a death partway through the year are unchanged', () => {
  near(paidIn(selfDied(68, { selfLife: 95 }), 1), DECEASED * 12 + SPOUSE68_OWN + 6000, 'both alive and claimed');
  near(paidIn(selfDied(68, { survivor: false }), 1), SPOUSE68_OWN, 'survivor benefits off');
  near(paidIn(selfDied(68, { selfLife: 72.5 }), 1), (DECEASED * 12 + SPOUSE68_OWN + 6000) / 2 + survivorAnnual(68, 68.5) / 2, 'a death halfway through the year');
});

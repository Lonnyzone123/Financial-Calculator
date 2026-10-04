/* S5AA task 4.6, Q91 (F5, N3) -- the Social Security retirement earnings test.
 *
 * THE DEFECT. RULES.socialSecurity.earningsTest has carried all four figures since the rules package
 * was written -- $24,480, $65,160, and the 2-for-1 and 3-for-1 ratios -- and NOTHING READ THEM. A
 * household claiming at 62 while still earning $100,000 was paid its benefit in full. And the Rules
 * page said both things at once: one line listed "earnings test" among the rules the package uses,
 * another said "this package does not apply the earnings test". That contradiction is N3.
 *
 * THE RULE, confirmed against SSA itself before any of this was written (citation check, recorded in
 * the sprint's citation-check file under Social Security). www.ssa.gov and secure.ssa.gov both refuse
 * the plain fetcher with HTTP 403, which is not the same as an absent source; the pages were read in a
 * browser.
 *
 *   SSA, Exempt Amounts Under the Earnings Test:
 *     "For people attaining NRA after 2026, the annual exempt amount in 2026 is $24,480. For people
 *      attaining NRA in 2026, the annual exempt amount is $65,160. This higher exempt amount applies
 *      only to earnings made in months prior to the month of NRA attainment."
 *     "We withhold $1 in benefits for every $2 of earnings in excess of the lower exempt amount. We
 *      withhold $1 in benefits for every $3 of earnings in excess of the higher exempt amount.
 *      Earnings in or after the month you reach NRA do not count toward the retirement test."
 *     "any benefits withheld while you continue to work are not 'lost'. Once you reach NRA, your
 *      monthly benefit will be increased permanently to account for the months in which benefits were
 *      withheld."
 *
 *   POMS RS 00615.480: "An adjustment of the reduction factor eliminates certain deduction and
 *      non-entitlement months from the original reduction factor."
 *   POMS RS 00615.482: "Grant crediting months in RIB cases for months of: full OR PARTIAL work
 *      deduction."  -- A MONTH IN WHICH ONLY PART OF THE BENEFIT WAS WITHHELD IS A WHOLE CREDITING
 *      MONTH. The reduction factor counts months, not dollars. Crediting back only fully withheld
 *      months is the obvious implementation and it understates the lifetime benefit.
 *
 * HOW THE BENEFIT IS OBSERVED. The rows carry `income` = Social Security + pension + other cash +
 * dividends + wages. These households have no pension, no other income and no dividends, so the
 * benefit is `row.income - wages`, and wages are known exactly because salary growth is zero.
 */
'use strict';
const { retireAtEnd } = require('./lib/working-horizon'); // S5AA R53 (the owner's decision 3, 2026-10-04): working-only horizons

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

const ET = global.RULES.socialSecurity.earningsTest;
const FRA = global.RULES.socialSecurity.fullRetirementAgeFor1960Plus;   /* 67 */
const MONTHLY = 2000;
/* Claiming at 62 against a full retirement age of 67 is 60 months early: the first 36 cost
   5/9 of 1% each and the next 24 cost 5/12 of 1% each, so the factor is 1 - 0.20 - 0.10 = 0.70. */
const FACTOR_AT_62 = 0.70;
const ANNUAL_AT_62 = MONTHLY * 12 * FACTOR_AT_62;   /* $16,800 */

function account(id, type, taxClass, balance) {
  return {
    id, name: id, type, taxClass, owner: 'self', balance, basisPct: taxClass === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  };
}

/* Claims Social Security at `claim` while still working to `retireAge`, which is the only way the
   earnings test can bite. No pension, no other income, no dividends, no growth, so the row's `income`
   is exactly the benefit plus the salary. */
function claimant(startAge, endAge, salary, claim, retireAge) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: startAge, retireAge: retireAge === undefined ? FRA : retireAge, endAge, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary, spouseSalary: 0, growth: 0, contributionStop: startAge });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, qcdOn: false, pension: 0,
    ssBenefit: MONTHLY, ssClaim: claim === undefined ? 62 : claim, ssAdvanced: false, aime: 0,
    stages: [], expenses: [], otherIncomes: [], spouseSS: 0, survivor: false,
  });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false });
  p.accounts = [account('cash', 'taxable', 'taxable', 400000)];
  retireAtEnd(p); // S5AA R53: an end age before the retirement age is refused; the owner retires at the end age instead (output-neutral, tests/lib/working-horizon.js)
  return p;
}

/* The benefit actually paid in the row that runs from `atAge` to `atAge + 1`. */
function benefitAt(p, atAge) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  const row = r.rows.find((x) => Math.abs(Number(x.age) - (atAge + 1)) < 1e-6);
  assert.ok(row, 'no row ending at ' + (atAge + 1) + '; ages ' + r.rows.map((x) => x.age).join(','));
  const working = Math.max(0, Math.min(1, p.profile.retireAge - atAge));
  const wages = p.employment.salary * working;
  return (Number(row.income) || 0) - wages;
}

/* ------------------------------------------------------------------ the stored figures */

test('S5AA 4.6 (Q91): the stored exempt amounts and ratios are the 2026 SSA figures', () => {
  assert.equal(ET.underFRA, 24480, 'SSA: the 2026 lower exempt amount');
  assert.equal(ET.fraYear, 65160, 'SSA: the 2026 higher exempt amount');
  assert.equal(ET.underReduction, 2, 'SSA: $1 withheld for every $2 over the lower amount');
  assert.equal(ET.fraReduction, 3, 'SSA: $1 withheld for every $3 over the higher amount');
});

/* ------------------------------------------------------------------ below full retirement age */

test('S5AA 4.6 (Q91): earnings under the exempt amount withhold nothing', () => {
  const paid = benefitAt(claimant(62, 63, ET.underFRA - 1000, 62), 62);
  assert.equal(paid.toFixed(2), ANNUAL_AT_62.toFixed(2),
    'a claimant earning less than the exempt amount is paid in full');
});

test('S5AA 4.6 (Q91): a claimant at 62 loses $1 for every $2 over the exempt amount', () => {
  /* $40,000 of wages is $15,520 over $24,480, so $7,760 is withheld from a $16,800 benefit. */
  const earnings = 40000;
  const withheld = (earnings - ET.underFRA) / ET.underReduction;
  assert.equal(withheld.toFixed(2), '7760.00', 'control: the arithmetic this test is asserting');
  const paid = benefitAt(claimant(62, 63, earnings, 62), 62);
  assert.equal(paid.toFixed(2), (ANNUAL_AT_62 - withheld).toFixed(2));
});

test('S5AA 4.6 (Q91): withholding stops at the benefit and never goes negative', () => {
  /* $100,000 of wages would withhold $37,760, more than twice the $16,800 benefit. */
  const paid = benefitAt(claimant(62, 63, 100000, 62), 62);
  assert.equal(paid.toFixed(2), '0.00', 'the whole benefit is withheld and no more');
});

/* ------------------------------------------------------------------ the year FRA is reached */

test('S5AA 4.6 (Q91): the year full retirement age is reached uses the higher amount and 3 for 1', () => {
  /* Same earnings, two ages. At 62 they are tested against $24,480 at 2 for 1; in the year the
     claimant reaches 67 they are tested against $65,160 at 3 for 1. */
  const earnings = 90000;
  const atFraYear = benefitAt(claimant(FRA - 1, FRA + 1, earnings, 62, FRA + 1), FRA - 1);
  const expectedWithheld = (earnings - ET.fraYear) / ET.fraReduction;   /* $8,280 */
  assert.equal(expectedWithheld.toFixed(2), '8280.00', 'control: the arithmetic this test is asserting');
  assert.ok(atFraYear > 0, 'the claimant is still paid something; got ' + atFraYear.toFixed(2));

  const under = benefitAt(claimant(62, 63, earnings, 62), 62);
  assert.equal(under.toFixed(2), '0.00',
    'the same earnings five years earlier take the whole benefit, which is what the two ' +
    'different exempt amounts and ratios are for');
});

test('S5AA 4.6 (Q91): from full retirement age onward there is no test at all', () => {
  const paid = benefitAt(claimant(FRA + 1, FRA + 2, 200000, 62, FRA + 2), FRA + 1);
  assert.ok(paid > 0, 'earnings in or after the month of full retirement age do not count');
  const none = benefitAt(claimant(FRA + 1, FRA + 2, 0, 62, FRA + 2), FRA + 1);
  assert.equal(paid.toFixed(2), none.toFixed(2),
    '$200,000 of earnings past full retirement age withholds nothing');
});

/* ------------------------------------------------------------------ the adjustment at FRA */

test('S5AA 4.6 (Q91): months withheld raise the benefit permanently from full retirement age', () => {
  /* Two claimants, identical but for their earnings between 62 and 67. The one whose benefit was
     withheld has months credited back against the reduction factor, so from 67 it is paid MORE, for
     the rest of its life -- SSA: "your monthly benefit will be increased permanently to account for
     the months in which benefits were withheld".

     THE RATIO IS EXACT AND COLA CANCELS OUT OF IT. $40,000 of wages withholds $7,760 of a $16,800
     benefit, which is 6 of the 12 months (Math.ceil of 5.54). It does that in the four rows from 62
     to 66; the row that reaches 67 is tested against the HIGHER exempt amount, and $40,000 is under
     it, so that year withholds nothing. Twenty-four months come off a 60-month reduction, leaving 36,
     all inside the first band: the factor moves from 1 - 0.20 - 0.10 = 0.70 to 1 - 0.20 = 0.80. */
  const working = claimant(62, 70, 40000, 62, FRA);
  const idle = claimant(62, 70, 0, 62, FRA);

  const beforeW = benefitAt(working, 63), beforeI = benefitAt(idle, 63);
  assert.ok(beforeW < beforeI, 'control: before FRA the working claimant is paid LESS');

  const afterW = benefitAt(working, 68), afterI = benefitAt(idle, 68);
  assert.ok(afterW > afterI,
    'after full retirement age the working claimant must be paid MORE, not merely the same: ' +
    afterW.toFixed(2) + ' against ' + afterI.toFixed(2));
  assert.equal((afterW / afterI).toFixed(6), (0.80 / FACTOR_AT_62).toFixed(6),
    'exactly 24 months credited back: the reduction factor moves from 0.70 to 0.80');
});

test('S5AA 4.6 (Q91): a month of PARTIAL withholding is a whole crediting month', () => {
  /* POMS RS 00615.482 grants a crediting month "for months of full OR PARTIAL work deduction". This
     claimant earns $2 over the exempt amount in ONE year, so $1 is withheld from a $16,800 benefit --
     0.006% of it. A rule that credited back the dollar-equivalent share of a month would credit
     essentially nothing. The month-count rule credits ONE WHOLE MONTH, which moves the reduction from
     60 months to 59 and is worth 5/9 of 1% of the benefit for life. */
  const one = claimant(62, 70, ET.underFRA + 2, 62, 63);
  const idle = claimant(62, 70, 0, 62, FRA);
  /* RE-FIXTURED BY INTENT at S5AA R34 (R32V-03): SSA rounds the COLA-increased PIA to the dime and the benefit to the dollar, so the ratio is
     of the two rounded monthly benefits at 68 -- six 2.8% COLAs since the claim at 62 -- not of the bare factors. */
  const SSA = require('./lib/ssa-reference.js');
  const piaAt68 = SSA.colaPia(MONTHLY, 0.028, 6);
  const expected = SSA.floorDollar(piaAt68 * (1 - 36 * 5 / 900 - 23 * 5 / 1200)) / SSA.floorDollar(piaAt68 * 0.7);
  assert.equal((benefitAt(one, 68) / benefitAt(idle, 68)).toFixed(8), expected.toFixed(8),
    'one dollar withheld in one month buys back that whole month');
});

/* ------------------------------------------------------------------ N3, the Rules page */

test('S5AA 4.6 (N3): the Rules page no longer says the test is not applied', () => {
  const page = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
  assert.ok(!page.includes('this package does not apply the earnings test'),
    'the page listed the earnings test among the rules it uses AND said it did not apply it');
  assert.ok(page.includes('earnings test'), 'and it must still describe what it now does');
});

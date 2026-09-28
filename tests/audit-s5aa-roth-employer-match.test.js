/* S5AA task 4.5, Q96 (F10) -- the tax character of an employer match.
 *
 * THE DEFECT. The match was added straight to the account that earned it:
 *
 *     match = Math.max(0, match) * target.vesting / 100;
 *     target.balance += match;
 *
 * So a match on a Roth 401(k) landed in the Roth bucket and was never taxed -- the household got
 * employer money into a tax-free account for nothing. A match on a traditional 401(k) landed pre-tax,
 * which is right, but by accident of the deferral's class rather than by any rule about the match.
 *
 * THE AUDIT'S REMEDY WAS WRONG AND THE CHECKLIST SAYS SO. Its premise was that a Roth 401(k) match is
 * "generally taxable". Under SECURE 2.0 section 604 an employer match is PRE-TAX BY DEFAULT and
 * designated Roth only by the EMPLOYEE'S election, so taxing it because the employee chose a Roth
 * deferral would have been a second error in the other direction.
 *
 * THE RULE, from IRS Notice 2024-2 section L, read from the primary source before this file was
 * written (the citation check recorded for Notice 2024-2):
 *
 *   section L answer 1  the designation is the employee's, made no later than allocation, and irrevocable.
 *   section L answer 2  a designated Roth match is includible in gross income FOR THE TAXABLE YEAR IN WHICH THE
 *        CONTRIBUTION IS ALLOCATED.
 *   section L answer 3  a match may be designated Roth ONLY IF THE EMPLOYEE IS FULLY VESTED IN MATCHING
 *        CONTRIBUTIONS AT THE TIME OF ALLOCATION. Partial vesting gives no partial election: "the
 *        employee may not designate any part of that matching contribution as a Roth contribution".
 *   section L answer 6  a designated Roth match to a 401(a) or 403(b) plan is NOT FICA WAGES -- excluded under
 *        section 3121(a)(5)(A) and (D), and expressly not added back under 3121(v)(1)(A).
 *
 * THAT ANSWER CORRECTS THE CHECKLIST'S OWN TEST LIST, which asks for "the separate FICA treatment". There is
 * none for the plan types this engine models. The separate treatment is in section L answer 7, for eligible
 * GOVERNMENTAL plans, and this engine models none. So the assertion below is the negation: a Roth
 * election moves income tax and NO payroll tax at all. That is the assumption most easily got wrong by
 * reasoning "it is taxable income, so it must be wages".
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

const SALARY = 100000;
const MATCH_CAP = 5;      /* match on the first 5% of pay */
const MATCH_RATE = 100;   /* dollar for dollar */
const MATCH = SALARY * MATCH_CAP / 100;   /* $5,000 */

function acct(id, type, taxClass, extra) {
  return Object.assign({
    id, name: id, type, taxClass, owner: 'self', balance: 0, basisPct: taxClass === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }, extra || {});
}

/* One working year, one deferral, one match. No growth, no inflation, no other income, so the whole
   difference between two runs is the match's treatment. */
function workingPlan(accounts) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 40, retireAge: 41, endAge: 41, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: SALARY, spouseSalary: 0, growth: 0, contributionStop: 41 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, /* RE-FIXTURED at the S5AA R18 round (workstream B, taxable basis in dollars): dividends ON at a 0% yield, so no imputed 1.5% -- at a 0% return a taxed, retained yield adds basis the account never gains, and the tax sales then realise small capital losses that are not what this test is about. */ dividendOn: true, dividendYield: 0, qcdOn: false,
    stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false,
  });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false });
  p.accounts = accounts;
  return p;
}

/* The match is observed as the rise in a CLASS across the working row, which is what the household
   sees, and the income it creates as the row's federalAgi. */
function measured(p) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  const row = r.rows[1];
  return {
    result: r,
    preTax: Number(row.preTax) || 0,
    roth: Number(row.roth) || 0,
    federalAgi: Number(row.federalAgi) || 0,
    taxes: Number(row.taxes) || 0,
    contributions: Number(row.contributions) || 0,
  };
}

const rothDeferral = (extra) => acct('roth401k', 'roth401k', 'roth', Object.assign({
  contribution: 10000, matchOn: true, matchCap: MATCH_CAP, matchRate: MATCH_RATE,
}, extra || {}));
const preTaxDeferral = (extra) => acct('trad401k', 'traditional401k', 'preTax', Object.assign({
  contribution: 10000, matchOn: true, matchCap: MATCH_CAP, matchRate: MATCH_RATE,
}, extra || {}));

/* ------------------------------------------------------------------ the default is pre-tax */

test('S5AA 4.5 (Q96): a match on a Roth 401(k) is PRE-TAX unless the employee elects otherwise', () => {
  const m = measured(workingPlan([rothDeferral(), acct('cash', 'taxable', 'taxable', { balance: 200000 })]));
  assert.equal(m.preTax.toFixed(2), MATCH.toFixed(2),
    'the $5,000 match is employer money and pre-tax by default; it must not be in the Roth bucket');
  assert.equal(m.roth.toFixed(2), '10000.00', 'the Roth bucket holds the employee deferral and nothing else');
});

test('S5AA 4.5 (Q96): the default match creates no income of its own', () => {
  const withMatch = measured(workingPlan([rothDeferral(), acct('cash', 'taxable', 'taxable', { balance: 200000 })]));
  const noMatch = measured(workingPlan([rothDeferral({ matchOn: false }), acct('cash', 'taxable', 'taxable', { balance: 200000 })]));
  assert.equal(withMatch.federalAgi.toFixed(2), noMatch.federalAgi.toFixed(2),
    'a pre-tax employer match is not the employee\'s income in the year it is made');
});

test('S5AA 4.5 (Q96): a match on a traditional 401(k) is unchanged', () => {
  const m = measured(workingPlan([preTaxDeferral(), acct('cash', 'taxable', 'taxable', { balance: 200000 })]));
  assert.equal(m.preTax.toFixed(2), (10000 + MATCH).toFixed(2),
    'the deferral and the match both sit pre-tax, exactly as before');
  assert.equal(m.roth.toFixed(2), '0.00');
});

/* ------------------------------------------------------------------ the election */

test('S5AA 4.5 (Q96): an elected Roth match lands in the Roth bucket and is income that year', () => {
  const elected = measured(workingPlan([rothDeferral({ matchRoth: true }), acct('cash', 'taxable', 'taxable', { balance: 200000 })]));
  const byDefault = measured(workingPlan([rothDeferral(), acct('cash', 'taxable', 'taxable', { balance: 200000 })]));

  assert.equal(elected.roth.toFixed(2), (10000 + MATCH).toFixed(2), 'the match joins the deferral in the Roth bucket');
  assert.equal(elected.preTax.toFixed(2), '0.00', 'and nothing is left pre-tax');
  assert.equal((elected.federalAgi - byDefault.federalAgi).toFixed(2), MATCH.toFixed(2),
    'section L answer 2: includible in gross income for the taxable year in which the contribution is allocated');
});

test('S5AA 4.5 (Q96): the employee\'s deferral does not decide the match\'s character', () => {
  /* A pre-tax deferral with a Roth-elected match. Notice 2024-2 section L answer 1 makes the designation the
     employee's own election on the MATCH; nothing ties it to how the deferral was made. */
  const m = measured(workingPlan([
    preTaxDeferral({ matchRoth: true }),
    acct('rothIRA', 'rothIRA', 'roth'),
    acct('cash', 'taxable', 'taxable', { balance: 200000 }),
  ]));
  assert.equal(m.preTax.toFixed(2), '10000.00', 'the deferral stays pre-tax');
  assert.equal(m.roth.toFixed(2), MATCH.toFixed(2), 'the elected match goes to Roth money');
});

/* ------------------------------------------------------------------ section L answer 3, full vesting */

test('S5AA 4.5 (Q96): the election is refused unless the employee is fully vested at allocation', () => {
  /* section L answer 3 in as many words: partial vesting gives NO partial election. The match is still reduced by the
     vesting percentage -- that is the engine's existing treatment of `vesting` and is untouched here --
     but its CHARACTER falls back to pre-tax. */
  const half = measured(workingPlan([
    rothDeferral({ matchRoth: true, vesting: 50 }),
    acct('cash', 'taxable', 'taxable', { balance: 200000 }),
  ]));
  assert.equal(half.roth.toFixed(2), '10000.00',
    'a 50%-vested match may not be designated Roth at all, so the Roth bucket holds only the deferral');
  assert.equal(half.preTax.toFixed(2), (MATCH / 2).toFixed(2),
    'it lands pre-tax instead, at the vesting-reduced amount the engine already computed');
});

test('S5AA 4.5 (Q96): a fully vested election is allowed and a 99%-vested one is not', () => {
  const full = measured(workingPlan([rothDeferral({ matchRoth: true, vesting: 100 }), acct('cash', 'taxable', 'taxable', { balance: 200000 })]));
  const nearly = measured(workingPlan([rothDeferral({ matchRoth: true, vesting: 99 }), acct('cash', 'taxable', 'taxable', { balance: 200000 })]));
  assert.ok(full.roth > 10000, 'fully vested: the election stands');
  assert.equal(nearly.roth.toFixed(2), '10000.00', 'one percent short: it does not');
});

/* ------------------------------------------------------------------ section L answer 6, payroll tax */

test('S5AA 4.5 (Q96): the election moves income tax and NO payroll tax', () => {
  /* the citation check for Notice 2024-2, section L answer 6. A designated Roth match to a 401(a) plan is excluded from FICA wages
     under section 3121(a)(5)(A) and (D) and is expressly NOT added back under 3121(v)(1)(A) -- so it is
     outside the payroll base exactly as a pre-tax match is.

     estimateTaxes() reports payroll separately from income tax, and this compares the two elections at
     identical wages. If the match had been pushed into the FICA base, `payroll` would differ by
     1.45% of $5,000 = $72.50 (the wage here is under the Social Security base, so the difference would
     in fact be 7.65% = $382.50). It must differ by nothing. */
  const ages = [40, -1];
  const common = [SALARY, 0, 0, SALARY, 0, 0, 0, 0, 0];
  void ages; void common;
  const withoutElection = engine.estimateTaxes(
    { profile: { age: 40, spouseOn: false, filing: 'single' }, advanced: {}, retirement: {} },
    40, SALARY - 10000, 0, 0, SALARY, 0, 0, 0, 0, 0);
  const withElection = engine.estimateTaxes(
    { profile: { age: 40, spouseOn: false, filing: 'single' }, advanced: {}, retirement: {} },
    40, SALARY - 10000 + MATCH, 0, 0, SALARY, 0, 0, 0, 0, 0);

  assert.equal(withElection.payroll.toFixed(2), withoutElection.payroll.toFixed(2),
    'the designated Roth match is not FICA wages; only the ordinary-income side may move');
  assert.ok(withElection.total > withoutElection.total, 'and the income tax does move');
});

/* ------------------------------------------------------------------ the limits and the settlement */

test('S5AA 4.5 (Q96): the employer contribution room is unchanged by the election', () => {
  const elected = measured(workingPlan([rothDeferral({ matchRoth: true }), acct('cash', 'taxable', 'taxable', { balance: 200000 })]));
  const byDefault = measured(workingPlan([rothDeferral(), acct('cash', 'taxable', 'taxable', { balance: 200000 })]));
  assert.equal((elected.preTax + elected.roth).toFixed(2), (byDefault.preTax + byDefault.roth).toFixed(2),
    'the same dollars are contributed either way; only where they land and how they are taxed differ');
  assert.equal(elected.contributions.toFixed(2), byDefault.contributions.toFixed(2));
});

test('S5AA 4.5 (Q96): the quote and the settlement agree on an elected match', () => {
  const p = workingPlan([rothDeferral({ matchRoth: true }), acct('cash', 'taxable', 'taxable', { balance: 200000 })]);
  p.retirement.spending = 40000;
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  const codes = (r.issues || []).map((i) => i.code);
  assert.ok(!codes.includes('TAX_SETTLEMENT_MISMATCH'), codes.join(','));
  assert.ok(!codes.includes('QUOTE_SETTLEMENT_UNVERIFIED'), codes.join(','));
});

/* S5AA follow-up, Q4 (the owner, 2026-09-21): A DECEASED SPOUSE'S ACCOUNTS PASS TO THE SURVIVOR.
 *
 * Modelled as the surviving spouse's election to treat the accounts as their own -- Treas. Reg. 1.408-8(c)
 * for an IRA, IRC 402(c)(9) for a plan -- with the timing both give (citation checks 17 and 18):
 *
 *   the year of death   still the DECEDENT's. A required distribution the owner had not taken is due,
 *                       computed on the owner's own schedule (1.408-8(c)(3); 402(c)(4)(B) keeps it out
 *                       of any rollover). In this engine that is the row opening at the death, and task
 *                       4.2 already bills it on the owner's age -- which is RIGHT for that one row.
 *   every year after    the SURVIVOR's: the accounts are theirs, billed on their age and their own start
 *                       age. The same boundary F-02's filing transition uses.
 *   basis               moves with the accounts (Publication 590-B: only a spouse who treats the IRA as
 *                       their own may combine basis -- citation check 19), or the survivor would be taxed again on
 *                       money already taxed.
 *
 * Before this, the accounts stayed in the dead spouse's name and were billed on an age they never
 * reached, for the rest of the projection. Tested through runPlan only.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);
const UNIFORM = global.RULES.retirement.rmd.uniformLifetime;

function acct(id, type, taxClass, owner, balance, extra) {
  return Object.assign({
    id, name: id, type, taxClass, owner, balance, basisPct: taxClass === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }, extra || {});
}
const run = (p) => {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
};
const row = (r, age) => r.rows.find((x) => Math.abs(x.age - age) < 1e-9);
const said = (r, code) => (r.issues || []).find((i) => i.code === code);

/* A retired couple: the self is 70, the spouse 74 and past their start age. The spouse owns the only
   IRA and dies at 76, which is the row opening at self-age 72. */
function retired(edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 70, spouseAge: 74, retireAge: 65, endAge: 80, spouseOn: true, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 76,
  });
  Object.assign(p.advanced, { rmdOn: true, transferOn: false, conversionOn: false, healthOn: false, qcd: 0, debts: [], otherAssets: [] });
  p.accounts = [
    acct('spouse-ira', 'traditionalIRA', 'preTax', 'spouse', 500000, { priority: 1 }),
    acct('cash', 'taxable', 'taxable', 'self', 200000, { priority: 2 }),
  ];
  if (edit) edit(p);
  return p;
}

test('Q4: the year of death is billed on the decedent\'s age; every year after, on the survivor\'s', () => {
  const r = run(retired());
  const preTax = (age) => Number(row(r, age).preTax);
  const rmd = (age) => Number(row(r, age).rmd);
  /* The row opening at self-age 71: the spouse is alive at 75. */
  assert.equal(rmd(72).toFixed(2), (preTax(71) / UNIFORM['75']).toFixed(2), 'CONTROL: alive, on their own age');
  /* The row opening at 72 is the year of death: the spouse would be 76, and that distribution is still
     theirs (1.408-8(c)(3)). */
  assert.equal(rmd(73).toFixed(2), (preTax(72) / UNIFORM['76']).toFixed(2), 'the year of death is the decedent\'s');
  /* From the row opening at 73 the IRA is the survivor's, billed at 73 -- not at the 77 the spouse never
     reached, which is what it was before (divisor 22.9 against 26.5). */
  assert.equal(rmd(74).toFixed(2), (preTax(73) / UNIFORM['73']).toFixed(2), 'the year after, the survivor\'s');
  assert.notEqual(rmd(74).toFixed(2), (preTax(73) / UNIFORM['77']).toFixed(2), 'and never the dead spouse\'s 77');
});

test('Q4: a survivor below their own start age owes nothing on the rolled account until they reach it', () => {
  /* The same spouse, but the survivor is 64: the rolled IRA waits for the survivor's own start age,
     which is what treating it as their own means. */
  const r = run(retired((p) => { Object.assign(p.profile, { age: 64, endAge: 76 }); p.retirement.spouseLife = 80; }));
  /* The spouse starts at 74 and dies at 80 (self-age 70); the rolled account is the self's from the row
     opening at 71, and the self's start age is 75 (born 1962). */
  for (const age of [72, 73, 75]) assert.equal(Number(row(r, age).rmd), 0, 'nothing due at ' + age);
  assert.ok(Number(row(r, 76).rmd) > 0, 'and due again once the survivor reaches their own start age');
});

test('Q4: the decedent\'s IRA basis moves with the IRA, so the survivor is not taxed on it again', () => {
  /* 3.6 step 2's own fixture: wholly nondeductible contributions build basis exactly equal to them. The
     SPOUSE contributes, then dies; the survivor draws the account. */
  const LIMIT = 7500;
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 45, spouseAge: 45, retireAge: 46, endAge: 48, spouseOn: true, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 300000, growth: 0, contributionStop: 46 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, qcdOn: false, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [],
    withdrawalOrder: 'manual', manualOrder: 'taxable,preTax,roth,hsa', selfLife: 95, spouseLife: 46,
  });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, penaltyException: true });
  p.accounts = [
    acct('ira', 'traditionalIRA', 'preTax', 'spouse', 0, { contribution: LIMIT }),
    acct('k', 'traditional401k', 'preTax', 'spouse', 0, { contribution: 1 }),
    acct('cash', 'taxable', 'taxable', 'self', 0, { priority: 9 }),
  ];
  /* The draw comes in the row opening at 47, the first the account belongs to the survivor. */
  p.retirement.stages = [];
  p.retirement.spending = 0;
  p.retirement.expenses = [{ name: 'draw', age: 47, amount: 5000 }];
  const r = run(p);
  const agi = Number(row(r, 48).federalAgi) || 0;
  assert.ok(Number(row(r, 48).withdrawals) > 4000, 'CONTROL: the survivor does draw from the rolled IRA');
  assert.ok(agi < 2, 'the draw is covered by the basis the spouse built: federalAgi $' + agi.toFixed(2));
});

/* S5AA R9 round, the owner's decision 8 (2026-09-21): INVERTED. After the second death there is no spouse to elect, and the
   beneficiary case (Q5) is still not modelled -- but the projection no longer runs into it: it stops at the last death.
   So nothing passes, because nothing follows. */
test('Q4, inverted by decision 8: nothing passes where nobody survives -- the projection stops at the last death', () => {
  const r = run(retired((p) => { p.retirement.selfLife = 71; }));
  /* The self dies at 71, then the spouse at their own age 76 (self-age 72): nobody is alive from the row opening at 73. */
  const issue = said(r, 'PROJECTION_ENDS_AT_LAST_DEATH');
  assert.ok(issue, 'the cut is disclosed');
  assert.equal(issue.state.stoppedAtRowOpening, 73);
  assert.ok(issue.state.notModelled.includes('beneficiaries'), 'and the beneficiary case is still named as not modelled');
  assert.equal(r.rows[r.rows.length - 1].age, 73, 'no row follows the second death');
  assert.ok(!said(r, 'UNSUPPORTED_POST_DEATH_HOUSEHOLD'));
});

test('Q4: a household where the survivor takes the accounts is told the rollover is ASSUMED, not excluded', () => {
  const r = run(retired());
  const issue = said(r, 'SPOUSAL_ROLLOVER_ASSUMED');
  assert.ok(issue, 'disclosed');
  assert.equal(issue.state.approximation, true);
  assert.equal(issue.state.outsideSupportedDomain, undefined, 'an approximation, not an exclusion');
  assert.ok(/inherited IRA/.test(issue.message), 'and it names the alternative a survivor may choose instead');
  assert.ok(!said(r, 'UNSUPPORTED_POST_DEATH_HOUSEHOLD'), 'nothing is carried on a dead owner any more');
});

test('Q4: a one-person household is untouched', () => {
  const r = run(retired((p) => { Object.assign(p.profile, { spouseOn: false, filing: 'single' }); p.accounts[0].owner = 'self'; }));
  assert.ok(!said(r, 'SPOUSAL_ROLLOVER_ASSUMED'));
});

/* THIRD AUDIT: A LIFESPAN THAT ENDS BEFORE THE PLAN STARTS. householdSurvivorship() treats such a person as
   dead from the first row, so since F-02 the household files single from the start, since Q3 the person
   earns nothing, and since Q4 their accounts are the survivor's from row 0 -- and every one of those
   disclosures is limited to a death INSIDE the horizon, so none fired. MEASURED at e9539ea: a spouse of
   72 with a lifespan of 70 and a $500,000 IRA; the required distribution at the first row fell from
   $18,248.18 to $0.00 with not one issue saying why. The validator does not flag the input either. */
test('third audit: a spouse whose lifespan ended before the plan starts is disclosed, not silently treated as dead', () => {
  const r = run(retired((p) => { p.retirement.spouseLife = 74; }));
  const alive = run(retired());
  assert.ok(!said(alive, 'DEATH_BEFORE_PLAN_START'), 'CONTROL: nobody dead at the start, nothing said');
  const r2 = run(retired((p) => { p.retirement.spouseLife = 70; }));
  const issue = said(r2, 'DEATH_BEFORE_PLAN_START');
  assert.ok(issue, 'the household is told');
  assert.equal(issue.severity, 'WARNING');
  assert.equal(issue.state.path, 'retirement.spouseLife');
  assert.deepEqual(issue.state.deaths, [{ who: 'spouse', lifespan: 70, ageAtStart: 74 }]);
  assert.ok(/single/.test(issue.message) && /survivor/.test(issue.message), 'and what that does is named');
  assert.ok(!said(r, 'DEATH_BEFORE_PLAN_START'), 'CONTROL: a lifespan equal to the starting age is not a death before the start');
});

/* THIRD AUDIT: WHAT THE DECEASED "HOLDS" WAS READ FROM ENTERED BALANCES. A spouse who starts with an empty
   401(k) and contributes $20,000 a year holds about $100,000 at a death at 65 -- the engine rolls it over
   and bills it -- but the disclosures looked only at the balance entered at the start, which was zero.
   MEASURED at e9539ea: the rollover happened with no SPOUSAL_ROLLOVER_ASSUMED, and where the self also
   died at 70 a dead owner was billed $3,971.92 at 80 with no UNSUPPORTED_POST_DEATH_HOUSEHOLD, so an
   out-of-domain result passed task 5.5's predicate. The same defect class the second audit found in this
   entry: a condition testing an ENTERED value instead of what the engine does. */
function fundedLater(selfLife) {
  return retired((p) => {
    Object.assign(p.profile, { age: 60, spouseAge: 60, retireAge: 66, endAge: 85 });
    Object.assign(p.employment, { salary: 50000, spouseSalary: 80000, contributionStop: 66 });
    Object.assign(p.retirement, { selfLife, spouseLife: 65 });
    p.accounts = [
      acct('self-cash', 'taxable', 'taxable', 'self', 100000, { priority: 1 }),
      acct('spouse-401k', 'traditional401k', 'preTax', 'spouse', 0, { contribution: 20000, priority: 2 }),
    ];
  });
}
test('third audit: an account the deceased funded during the plan is rolled over AND disclosed', () => {
  const r = run(fundedLater(95));
  assert.ok(Number(row(r, 65).preTax) > 90000, 'CONTROL: the empty 401(k) holds about $100,000 by the death');
  const issue = said(r, 'SPOUSAL_ROLLOVER_ASSUMED');
  assert.ok(issue, 'the rollover it performs is disclosed');
  assert.deepEqual(issue.state.rollovers.map((x) => x.accounts), [['spouse-401k']]);
});
/* Decision 8 (R9 round): INVERTED. This pinned the old exclusion naming a funded-during-the-plan account as billed on the
   dead at 80. The projection now stops at the last death (the self's, at 70), so there is no row at 80. The claim that
   survives is the executed-state one: the account the deceased funded is what passed at the first death. */
test('third audit, inverted by decision 8: where nobody survives, the funded account passed at the first death and nothing follows the second', () => {
  const r = run(fundedLater(70));
  const rolled = said(r, 'SPOUSAL_ROLLOVER_ASSUMED');
  assert.ok(rolled, 'the spouse died first, at 65, and the account they funded passed to the self');
  assert.deepEqual(rolled.state.rollovers.map((x) => x.accounts), [['spouse-401k']]);
  assert.equal(r.rows[r.rows.length - 1].age, 71, 'the self dies at 70; the row opening at 70 is the last');
  assert.ok(said(r, 'PROJECTION_ENDS_AT_LAST_DEATH') && !said(r, 'UNSUPPORTED_POST_DEATH_HOUSEHOLD'));
});
test('third audit, control: a configured contribution the owner never makes does not make anything held', () => {
  /* Already retired at 60, so the empty 401(k) is never funded. Counting it would repeat the over-fire the
     second audit removed from this entry. */
  const p = fundedLater(95);
  p.profile.retireAge = 60;
  const r = run(p);
  assert.equal(Number(row(r, 65).preTax), 0, 'CONTROL: the account is still empty at the death');
  assert.ok(!said(r, 'SPOUSAL_ROLLOVER_ASSUMED'), 'so there is nothing to disclose as rolled over');
});

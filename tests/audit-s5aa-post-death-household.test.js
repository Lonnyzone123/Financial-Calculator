/* S5AA SELF-AUDIT: a household after a death is outside the supported domain.
 *
 * Found by auditing this sprint's own output rather than by a finding handed in. Three layers answer
 * "did this person die?" and they do not agree, and TWO OF THE THREE ANSWERS WERE WRITTEN BY THIS
 * SPRINT:
 *
 *   Social Security          YES, and always has -- householdSocialSecurityDetail() makes both deaths
 *                            segment boundaries and stops paying.
 *   filing status, age 65    YES, since F-02.
 *   required distributions   NO. Task 4.2 made the distribution PER OWNER on each owner's OWN age, so
 *                            a deceased owner is still billed on an age they did not reach. Before
 *                            4.2 it was pooled on the primary profile's age and the question could
 *                            not arise -- the inconsistency is new, and it is ours.
 *   wages and contributions  NO. A salary ends at `profile.retireAge` on its earner's own age (the
 *                            engine's work duration), and a death does not end it. So a person who dies
 *                            BEFORE that age keeps earning and contributing. (Corrected by the second
 *                            audit: an earlier draft said the spouse's salary had no end date at all.)
 *
 * MEASURED: two 60-year-olds each earning, the spouse dying at 65. At age 68 the household reports
 * $180,000 of income either way, and tax of $49,257 where the same household with both alive pays
 * $36,726. It is taxed as ONE PERSON ON TWO PEOPLE'S SALARIES. The second figure is not an improvement
 * on the first; it is a different mixture of assumptions.
 *
 * NOT REPAIRED, and the reasons are decisions rather than difficulty: stopping a deceased person's
 * employment income moves output for every household with a death and a wage inside its horizon;
 * attributing their accounts to the survivor is a spousal-rollover assumption; and post-death
 * distribution rules are ALREADY recorded unsupported by the specification (ACCOUNT section 18, test
 * 9 -- "the engine has no beneficiaries and no post-death distribution rules"). Ground rule 12 does
 * not permit any of them here.
 *
 * So the boundary is made visible the way task 5.5 makes every other one visible, and this file holds
 * it there.
 *
 * S5AA R9 ROUND, the owner's decision 8 (2026-09-21): THE PROJECTION NOW STOPS AT THE LAST DEATH. The rows this file's
 * exclusion (UNSUPPORTED_POST_DEATH_HOUSEHOLD, EA-01) described no longer exist: the last row is the year of the last
 * death, and PROJECTION_ENDS_AT_LAST_DEATH -- inside the supported domain -- says the horizon was cut. Each test below
 * that asserted the exclusion is INVERTED to the state that replaces it, with its claim restated: who is told, when,
 * which input it names, and that nothing is billed on the dead because no row follows the last death.
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

const account = (o) => Object.assign({
  name: o.id, type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 0, basisPct: 0,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
  frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
  matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
}, o);

function plan(over) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 60, retireAge: 70, endAge: 72, spouseOn: true, spouseAge: 60, filing: 'mfj' }, (over || {}).profile);
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 100000, spouseSalary: 80000, growth: 0 }, (over || {}).employment);
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 60000, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0,
    survivor: false, stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 95,
  }, (over || {}).retirement);
  Object.assign(p.advanced, {
    rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, qcd: 0, debts: [], otherAssets: [],
  }, (over || {}).advanced);
  p.accounts = ((over || {}).accounts || [{ id: 'self-401k', balance: 400000 }]).map((a, i) => account(Object.assign({ priority: i + 1 }, a)));
  return p;
}
const run = (over) => {
  const r = engine.runPlan(plan(over));
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
};
const said = (r, code) => (r.issues || []).find((i) => i.code === code);

/* Q4 did NOT change rmdFor(): it still bills whatever owner it is handed, on that owner's age, and does
   not know who is alive. What changed is the OWNER it is handed -- the projection loop now passes a dead
   spouse's accounts to the survivor from the year after the death (tests/audit-s5aa-spousal-rollover.test.js).
   This test is kept as the record of the helper's contract, which is why the loop has to do the work. */
test('self-audit: rmdFor() bills the owner it is handed, alive or not -- the loop, since Q4, hands it the survivor', () => {
  /* The disagreement itself, read directly, because the row folds it together with everything else.
     The same household, the same accounts, the same age -- and the only difference is whether the
     spouse is alive. The tax layer notices. The distribution layer does not. */
  const alive = plan({ retirement: { spouseLife: 95 } });
  const dead = plan({ retirement: { spouseLife: 65 } });
  const accounts = [
    account({ id: 'self-ira', type: 'traditionalIRA', owner: 'self', balance: 900000 }),
    account({ id: 'spouse-ira', type: 'traditionalIRA', owner: 'spouse', balance: 900000 }),
  ];
  for (const p of [alive, dead]) { p.profile.age = 78; p.profile.spouseAge = 78; p.advanced.rmdOn = true; }
  dead.retirement.spouseLife = 80;

  assert.equal(engine.householdFilingFor(alive, 84), 'mfj', 'CONTROL: both alive, so a joint return');
  assert.equal(engine.householdFilingFor(dead, 84), 'single', 'the tax layer knows the spouse died at 80');
  assert.deepEqual(engine.householdSeniorAges(dead, 84), [84, -1], 'and stops counting them at 65');

  const owed = (p) => engine.rmdFor(JSON.parse(JSON.stringify(accounts)), 84, p)
    .obligations.filter((o) => o.owner === 'spouse').reduce((s, o) => s + o.amount, 0);
  assert.ok(owed(alive) > 0, 'CONTROL: a living spouse owes a distribution');
  assert.equal(owed(dead).toFixed(2), owed(alive).toFixed(2),
    'THE FINDING: the deceased spouse owes exactly the same, computed on an age of 84 they never reached');
});

/* INVERTED by the S5AA follow-up's Q3 (the owner, 2026-09-21: a deceased person's wages end at the death).
   This test used to assert the finding -- that the widowed household still reported both salaries at
   66, 68 and 70. The same household now reports the survivor's alone; the behaviour itself is pinned
   in tests/audit-s5aa-wages-end-at-death.test.js. */
test('self-audit, inverted by Q3: a deceased person no longer earns', () => {
  const alive = run({ retirement: { spouseLife: 95 } });
  const dead = run({ retirement: { spouseLife: 65 } });
  for (const age of [66, 68, 70]) {
    assert.equal(Number(alive.rows.find((x) => x.age === age).income), 180000, 'CONTROL at ' + age);
    assert.equal(Number(dead.rows.find((x) => x.age === age).income), 100000,
      'at ' + age + ': one salary, the survivor\'s');
  }
  /* Decision 8: the self survives past the horizon, so nothing is cut and nothing is outside the domain. */
  assert.ok(!said(dead, 'PROJECTION_ENDS_AT_LAST_DEATH'), 'a survivor remains to the horizon, so the projection is not cut');
  assert.ok(!(dead.issues || []).some((i) => i.state && i.state.outsideSupportedDomain), 'and no row is outside the domain');
});

/* The household in which the spouse dies at 70 (self-age 62) after the self died at 61: nobody is alive from the row
   opening at self-age 63. The first death had a survivor, who took the accounts (Q4). */
const BOTH_DIE = {
  profile: { spouseAge: 68 },
  employment: { salary: 100000, spouseSalary: 0 },
  retirement: { selfLife: 61, spouseLife: 70 },
  advanced: { rmdOn: true },
  accounts: [{ id: 'self-401k', balance: 400000 }, { id: 'spouse-ira', type: 'traditionalIRA', owner: 'spouse', balance: 200000 }],
};

/* INVERTED by decision 8. This asserted a supported-domain EXCLUSION for the rows after the last death, naming what was
   billed there on the dead. Those rows no longer exist. The household is still told -- by PROJECTION_ENDS_AT_LAST_DEATH,
   which is not an exclusion -- and nothing is billed on the dead, because no row follows the last death. */
test('self-audit, inverted by decision 8: the household is told the projection stops at the last death, inside the domain', () => {
  const r = run(BOTH_DIE);
  const issue = said(r, 'PROJECTION_ENDS_AT_LAST_DEATH');
  assert.ok(issue, 'the cut is disclosed');
  assert.equal(issue.severity, 'WARNING');
  assert.equal(issue.state.outsideSupportedDomain, undefined, 'not an exclusion: no row projects a household with nobody in it');
  assert.equal(issue.state.stoppedAtRowOpening, 63, 'nobody is alive from the row opening at self-age 63');
  assert.equal(issue.state.path, 'retirement.spouseLife', "the input that places the LAST death is the spouse's lifespan");
  assert.equal(r.rows[r.rows.length - 1].age, 63, 'the last row is the year of the spouse\'s death');
  assert.ok(!said(r, 'UNSUPPORTED_POST_DEATH_HOUSEHOLD'), 'and the exclusion is gone');
  assert.ok(/the balances at the end of it are what the household leaves/.test(issue.message), 'the prose says what the last row is');
});

test('self-audit, inverted by decision 8: F-02\'s own disclosure still stands beside the cut, and neither is an exclusion', () => {
  const r = run(BOTH_DIE);
  const filing = said(r, 'SURVIVOR_FILING_STATUS_MODELLED');
  const stop = said(r, 'PROJECTION_ENDS_AT_LAST_DEATH');
  assert.ok(filing && stop, 'both are raised: the first death had a survivor, the second left nobody');
  assert.equal(filing.state.outsideSupportedDomain, undefined, 'the filing entry is an approximation, not an exclusion');
  assert.equal(stop.state.outsideSupportedDomain, undefined, 'and neither is the cut');
});

test('self-audit, inverted by decision 8: the cut is said exactly when nobody is left before the horizon ends', () => {
  const codes = (over) => (run(over).issues || []).map((i) => i.code);
  assert.ok(!codes({ retirement: { spouseLife: 95 } }).includes('PROJECTION_ENDS_AT_LAST_DEATH'), 'nobody dies inside the horizon');
  assert.ok(!codes({ employment: { salary: 100000, spouseSalary: 0 }, retirement: { spouseLife: 65 } }).includes('PROJECTION_ENDS_AT_LAST_DEATH'),
    'the spouse dies but the self survives past the horizon: nothing to cut');
  assert.ok(codes(BOTH_DIE).includes('PROJECTION_ENDS_AT_LAST_DEATH'), 'both die before the horizon: the projection stops');
});

/* INVERTED by the R6 external audit, EA-01. This asserted that a one-person household whose person dies
   inside the horizon is never told, borrowing F-02's scope line ("widowhood takes two people"). That line
   is right for the FILING STATUS and wrong here: the exclusion is not about widowhood, it is about rows in
   which nobody the plan models is alive, and a household of one reaches that state with its first death.
   The auditor's predicate names it directly. */
/* Decision 8 (R9 round): the rows that were outside the domain are no longer projected; the household is told by the cut. */
test('self-audit, inverted by EA-01 and then by decision 8: a one-person household whose person dies inside the horizon IS told, and stops', () => {
  const r = run({ profile: { spouseOn: false, filing: 'single' }, retirement: { selfLife: 65 } });
  const issue = (r.issues || []).find((i) => i.code === 'PROJECTION_ENDS_AT_LAST_DEATH');
  assert.ok(issue, 'the rows that would have projected nobody, 67 to 72, are not projected');
  assert.equal(issue.state.path, 'retirement.selfLife');
  assert.equal(r.rows[r.rows.length - 1].age, 66, 'the last row is the year of the death, the row opening at 65');
});

/* SECOND AUDIT. The entry was written to be raised where the deceased "still holds an account or earns a
   wage", and it tested the ENTERED salary and ANY balance. Neither is what the engine carries on:
   a salary stops at the retirement age whether or not anyone dies, and an account is only
   mis-billed where required distributions are on and the dead owner's own clock reaches the start
   age inside the horizon. So a retired couple in which one spouse dies at 80 -- the most common
   death this engine will ever see -- was told that their "employment income continues", in a
   household whose income was $0 in every row, and that it sat outside the supported domain. */
test('second audit: a retired household whose deceased carries nothing on is NOT told it is outside the domain', () => {
  const retired = {
    profile: { age: 70, spouseAge: 70, retireAge: 65, endAge: 90 },
    retirement: { spouseLife: 80 },
  };
  const r = run(retired);
  for (const age of [79, 80, 81, 82]) {
    assert.equal(Number(r.rows.find((x) => x.age === age).income), 0,
      'CONTROL: nobody in this household earns at ' + age + ', so no wage carries past the death');
  }
  assert.ok(!(r.issues || []).some((i) => i.state && i.state.outsideSupportedDomain),
    'the salary was entered, but it ended at 65 -- fifteen years before the death; nothing is outside the domain');
  assert.ok(!said(r, 'PROJECTION_ENDS_AT_LAST_DEATH'), 'decision 8: the self survives past the horizon, so nothing is cut');
  assert.ok(said(r, 'SURVIVOR_FILING_STATUS_MODELLED'), 'CONTROL: the death is still inside the horizon and F-02 still says so');
});

/* INVERTED by decision 8 (R9 round). This asserted what the exclusion named as billed on the dead after both deaths --
   nothing with required distributions off, "required distributions" with them on. No row follows the last death now, so
   NOTHING is billed on the dead either way: the claim is kept in its strongest form, on the rows themselves. */
test("second audit, inverted by decision 8: nothing is billed on a dead owner's age, because no row follows the last death", () => {
  const base = {
    profile: { age: 70, spouseAge: 70, retireAge: 65, endAge: 90 },
    employment: { salary: 0, spouseSalary: 0 },
    /* Q4: the self dies first (75), so the spouse's death at 80 leaves nobody to take the accounts. */
    retirement: { selfLife: 75, spouseLife: 80 },
    advanced: { rmdOn: true },
    accounts: [{ id: 'self-401k', balance: 400000 }, { id: 'spouse-ira', type: 'traditionalIRA', owner: 'spouse', balance: 3000000 }],
  };
  const r = run(base);
  assert.equal(r.rows[r.rows.length - 1].age, 81, 'the last row is the year of the spouse\'s death, the row opening at 80');
  assert.ok(r.rows.some((x) => x.age === 81 && Number(x.rmd) > 0), 'CONTROL: the IRA is billed while its owner is alive');
  const issue = said(r, 'PROJECTION_ENDS_AT_LAST_DEATH');
  assert.ok(issue && issue.state.stoppedAtRowOpening === 81, 'the cut names the first row opening with nobody alive');
  assert.ok(!said(r, 'UNSUPPORTED_POST_DEATH_HOUSEHOLD'));
});

test('second audit, carried by decision 8: the cut names the lifespan input of the person who died last', () => {
  const path = (over) => said(run(over), 'PROJECTION_ENDS_AT_LAST_DEATH').state.path;
  assert.equal(path(BOTH_DIE), 'retirement.spouseLife');
  assert.equal(path({
    profile: { age: 72, spouseAge: 60, retireAge: 65, endAge: 80 },
    employment: { salary: 0, spouseSalary: 0 },
    /* Q4: the spouse dies first (self-age 73), so the self's death at 74 leaves nobody. */
    retirement: { selfLife: 74, spouseLife: 61 },
    advanced: { rmdOn: true },
    accounts: [{ id: 'self-ira', type: 'traditionalIRA', balance: 400000 }],
  }), 'retirement.selfLife');
});

/* INVERTED by Q3: this asserted that a dead spouse's contributions continued and were named. They now
   end at the death, so they are never carried and never named. */
test('second audit, inverted by Q3: contributions end at the death and are never named', () => {
  const working = {
    employment: { contributionStop: 70 },
    retirement: { spouseLife: 65 },
    accounts: [{ id: 'self-401k', balance: 400000 }, { id: 'spouse-401k', owner: 'spouse', balance: 100000, contribution: 10000 }],
  };
  const dead = run(working);
  const alive = run(Object.assign({}, working, { retirement: { spouseLife: 95 } }));
  const at = (r, age) => Number(r.rows.find((x) => x.age === age).contributions);
  assert.ok(at(alive, 68) > 0, 'CONTROL: a living spouse contributes at 68');
  assert.equal(at(dead, 68), 0, 'a dead one does not');
  assert.ok(!said(dead, 'PROJECTION_ENDS_AT_LAST_DEATH') && !said(dead, 'UNSUPPORTED_POST_DEATH_HOUSEHOLD'),
    'decision 8: the self survives past the horizon, so nothing is cut and nothing is carried');
});

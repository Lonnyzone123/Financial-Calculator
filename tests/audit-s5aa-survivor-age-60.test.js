/* S5AA task 4.7, Q92 (F6, with G19) -- a survivor benefit starts at 60, reduced for age.
 *
 * THE DEFECT. The survivor branch gated payment on the recipient's OWN RETIREMENT claim age:
 *
 *     if (selfAliveHere) selfPay = selfClaimedHere ? survivorAmount : 0;
 *
 * `selfClaimedHere` is "has reached their own selected retirement claim age". A widow of 60 whose own
 * claim age is 67 was therefore paid NOTHING for seven years, although a survivor benefit is payable
 * from 60 and is a different benefit with a different clock. The gate exists for a good reason -- it
 * was restored by a prior repair after an aliveness-only test paid a 50-year-old survivor -- so this
 * does not remove it. It adds the survivor's own floor beside it.
 *
 * THE RULE, read from SSA before this file was written (citation check, recorded under Social Security
 * in the sprint's citation-check file):
 *
 *   SSA, What you could get from Survivor benefits: "Payments start at 71.5% of your spouse's benefit
 *   and increase the longer you wait to apply. For example, you might get: Over 75% at age 61. Over
 *   80% at age 63. Over 90% at age 65. You can get up to 100% when you reach your Full Retirement Age
 *   for Survivor benefits (between ages 66-67)."
 *
 * The page gives the endpoints and three checkpoints, not the formula. The reduction is 28.5 points
 * spread evenly over the months from 60 to survivor full retirement age, and that derivation is
 * CHECKED against all three of SSA's own checkpoints below rather than assumed.
 *
 * WHAT IS NOT BUILT, AND IS FLAGGED RATHER THAN HIDDEN. POMS RS 00615.320 caps a widow(er)'s benefit
 * at the larger of 82.5% of the deceased's death PIA or the reduced retirement benefit the deceased
 * would have had. That cap needs the deceased's PIA and their own reduced benefit, which this engine
 * does not have for a household that entered a monthly figure. An affected result is an OVER-estimate,
 * so it carries a machine-readable approximation flag.
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

const SSA = require('./lib/ssa-reference.js');
/* RE-FIXTURED BY INTENT at S5AA R34 (the owner 2026-09-29: "Follow law everywhere"). The deceased's benefit now carries the
   delayed credits their birth year gives them (SA32F-05): each fixture's spouse is 67 or 68 and was born 1959 or 1958 (full
   retirement age 66 and 10 months, or 66 and 8 months), so a claim at 67 is 3,040 or 3,080 a month, not 3,000. The survivor's own
   full retirement age is read two birth years on. Benefits round to the dollar (R32V-03). The early-claim cap is now APPLIED
   (SA32F-01), so the disclosure says so. Expectations are worked with tests/lib/ssa-reference.js. */
const deceasedMonthly = (spouseAgeNow, claim) => SSA.floorDollar(3000 * SSA.claimFactor(claim, SSA.fra(spouseAgeNow)));
const survivorAnnual = (selfAgeNow, startAge, spouseAgeNow) =>
  SSA.floorDollar(deceasedMonthly(spouseAgeNow, 67) * SSA.survivorFactor(startAge, SSA.survivorFra(selfAgeNow))) * 12;
const SURVIVOR_START = 60;
const SURVIVOR_FLOOR = 0.715;

function account(id, balance) {
  return {
    id, name: id, type: 'taxable', taxClass: 'taxable', owner: 'self', balance, basisPct: 100,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  };
}

/* The spouse dies at `spouseDeathAge` (the spouse's own age). The self is the survivor, has no benefit
   of their own, and has a retirement claim age of 67 -- so anything paid before 67 is a survivor
   benefit and nothing else. No wages, no pension, no dividends, so the row's `income` IS the benefit.

   THE DECEASED CLAIMS BEFORE DYING in every fixture here. A prior repair (R2-003(b)) refuses a
   posthumous claim -- someone who dies at 65 with a claim age of 67 establishes no benefit at all --
   so a fixture where the deceased never claimed would be measuring that gate rather than this one. */
function widowed(selfStartAge, selfEndAge, spouseAgeAtStart, spouseDeathAge, spouseClaim, edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, {
    age: selfStartAge, retireAge: selfStartAge, endAge: selfEndAge,
    spouseOn: true, spouseAge: spouseAgeAtStart, filing: 'mfj',
  });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, qcdOn: false, pension: 0,
    ssBenefit: 0, ssClaim: 67, spouseSS: 3000, spouseClaim: spouseClaim === undefined ? 67 : spouseClaim,
    ssCola: 0, ssAdvanced: false, aime: 0,
    survivor: true, selfLife: 120, spouseLife: spouseDeathAge,
    stages: [], expenses: [], otherIncomes: [],
  });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false });
  p.accounts = [account('cash', 500000)];
  if (edit) edit(p);
  return p;
}

function incomeAt(p, selfAge) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  const row = r.rows.find((x) => Math.abs(Number(x.age) - (selfAge + 1)) < 1e-6);
  assert.ok(row, 'no row ending at ' + (selfAge + 1) + '; ages ' + r.rows.map((x) => x.age).join(','));
  return Number(row.income) || 0;
}

/* ------------------------------------------------------------------ the rule's own shape */

test('S5AA 4.7 (Q92): the stored survivor reduction reproduces SSA\'s three checkpoints', () => {
  /* SSA publishes the endpoints and three checkpoints and no formula. The engine's rule must land on
     all three, or the derivation behind it is wrong. Each is a separate constraint. */
  const f = (age) => engine.survivorReductionFactor({ retirement: {} }, age);
  assert.equal(f(60).toFixed(4), SURVIVOR_FLOOR.toFixed(4), 'SSA: payments start at 71.5%');
  assert.ok(f(61) > 0.75 && f(61) < 0.76, 'SSA: over 75% at 61; got ' + f(61).toFixed(4));
  assert.ok(f(63) > 0.80 && f(63) < 0.85, 'SSA: over 80% at 63; got ' + f(63).toFixed(4));
  assert.ok(f(65) > 0.90 && f(65) < 0.93, 'SSA: over 90% at 65; got ' + f(65).toFixed(4));
  assert.equal(f(67).toFixed(4), '1.0000', 'SSA: up to 100% at survivor full retirement age');
  assert.equal(f(75).toFixed(4), '1.0000', 'and no more than 100% afterwards');
});

/* ------------------------------------------------------------------ nothing before 60 */

test('S5AA 4.7 (Q92): a widow at 50 is still paid nothing', () => {
  /* The existing age-50 boundary stays. A prior repair restored this gate after an aliveness-only
     test paid a 50-year-old survivor seventeen years early; task 4.7 adds the survivor's own floor
     beside that gate, it does not remove it. */
  const p = widowed(50, 53, 55, 56, 55);
  assert.equal(incomeAt(p, 51).toFixed(2), '0.00');
  assert.equal(incomeAt(p, 52).toFixed(2), '0.00');
});

test('S5AA 4.7 (Q92): a widow at 59 is paid nothing and at 60 is paid', () => {
  /* The deceased must be DEAD before the years this test calls empty, or it measures their own
     benefit instead. The spouse is eleven years older, claims at 67 and dies at 68 -- when the
     survivor is 57 -- so 58 and 59 really are empty, and 60 is the first paid year. */
  const p = widowed(55, 62, 66, 68, 67);
  assert.equal(incomeAt(p, 58).toFixed(2), '0.00', 'still 58: nothing');
  assert.equal(incomeAt(p, 59).toFixed(2), '0.00', 'still 59: nothing');
  assert.ok(incomeAt(p, 60) > 0, 'at 60 the survivor benefit starts; got ' + incomeAt(p, 60).toFixed(2));
});

/* ------------------------------------------------------------------ the widow at 60 */

test('S5AA 4.7 (Q92): a widow at 60 is paid 71.5%, not nothing', () => {
  /* THE AUDITOR'S CASE. The deceased claimed $3,000 a month at 67, their own full retirement age, so
     the unreduced survivor amount is $36,000 a year. The survivor turns 60 in the row the spouse dies
     in, and gets 71.5% of it. Before this repair the survivor's OWN retirement claim age of 67 gated
     the whole thing to zero for seven years. */
  /* R34: the spouse (67, born 1959) claimed at 67, two months past full retirement age: 3,040. The survivor at 59 was born 1967
     (survivor full retirement age 67): 71.5% of 3,040 is 2,173.60, 2,173 a month, 26,076. */
  const p = widowed(59, 63, 67, 68, 67);
  const paid = incomeAt(p, 60);
  assert.equal(paid.toFixed(2), survivorAnnual(59, 60, 67).toFixed(2),
    'a widow of 60 was paid nothing for seven years; SSA pays 71.5% from 60');
});

test('S5AA 4.7 (Q92): the reduction follows the age the benefit STARTS, across households', () => {
  /* Four households, differing only in how old the survivor was when the benefit began. SSA's
     "increase the longer you wait to apply" is a claim about the STARTING age, so it is measured
     across households and not across one household's birthdays. */
  const started = (survivorAgeAtDeath) => {
    const p = widowed(survivorAgeAtDeath - 1, survivorAgeAtDeath + 2, 68, 69, 67);
    p.profile.spouseAge = 68 - (survivorAgeAtDeath - 1) + (survivorAgeAtDeath - 1);
    /* the spouse dies one year into the run, so the survivor starts at survivorAgeAtDeath */
    p.retirement.spouseLife = p.profile.spouseAge + 1;
    return incomeAt(p, survivorAgeAtDeath);
  };
  const at60 = started(60), at63 = started(63), at66 = started(66), at68 = started(68);
  assert.ok(at60 < at63 && at63 < at66 && at66 <= at68,
    'a later start is a larger benefit: ' + [at60, at63, at66, at68].map((x) => x.toFixed(2)).join(' < '));
  /* R34: the deceased is 68 (born 1958) and claimed at 67, four months past 66 and 8 months: 3,080 a month. */
  assert.equal(at68.toFixed(2), (deceasedMonthly(68, 67) * 12).toFixed(2), 'and it is capped at the deceased\'s own full amount');
});

test('S5AA 4.7 (Q92): a later birthday does not restore an unreduced benefit to an EARLY claimant', () => {
  /* The reduction is fixed by the age at which the survivor benefit STARTS, not recomputed each year
     from the survivor's current age. A claimant who started at 60 stays on 60's reduction for life;
     otherwise simply living longer would quietly undo it. COLA is zero in this fixture so that the
     comparison is of the reduction alone. */
  const p = widowed(59, 72, 67, 68, 67);
  const at60 = incomeAt(p, 60), at64 = incomeAt(p, 64), at70 = incomeAt(p, 70);
  assert.equal(at60.toFixed(2), survivorAnnual(59, 60, 67).toFixed(2), 'the first year is 60\'s reduction');
  assert.equal(at64.toFixed(2), at60.toFixed(2), 'and so is the fifth');
  assert.equal(at70.toFixed(2), at60.toFixed(2),
    'and so is the eleventh, past survivor full retirement age: a birthday is not an application');
});

/* ------------------------------------------------------------------ the row boundaries, G19 */

test('S5AA 4.7 (G19): a survivor start inside a row splits it, and the row bills both halves', () => {
  /* Ground rule 4 names the survivor amount, the eligibility gate and the sub-interval points list as
     ONE set. A missing boundary is invisible in a total: the row would simply be billed end to end at
     one rate.

     ROW BOUNDARIES ARE WHOLE AGES, so a survivor start that lands on one is already a boundary and
     proves nothing. This fixture makes it FRACTIONAL: the survivor starts at 59.5, the spouse is 7.5
     years older, claims at 67 and dies at 69 -- which is self-age 61.5, halfway through the row from
     61 to 62. The survivor is past 60 already, so the benefit starts the moment the spouse dies.

     That row must therefore bill HALF a year of the spouse's own $36,000 and HALF a year of the
     survivor benefit at 61.5's factor. Either missing boundary gives a round number instead. */
  /* R34: the deceased's own is 3,040 a month (born 1959, claimed at 67); the survivor (born 1967, survivor full retirement age 67)
     starts at 61.5, 66 of 84 months early: 2,359 a month. */
  const p = widowed(59.5, 64, 67, 69, 67);
  const survivor = survivorAnnual(59.5, 61.5, 67);
  const expected = 0.5 * deceasedMonthly(67, 67) * 12 + 0.5 * survivor;
  assert.equal(incomeAt(p, 61).toFixed(2), expected.toFixed(2),
    'the row from 61 to 62 must be billed in two halves at two different rates');
  assert.equal(incomeAt(p, 62).toFixed(2), survivor.toFixed(2),
    'and the year after is a whole year at the survivor rate');
});

/* ------------------------------------------------------------------ what is not modelled */

test('S5AA 4.7 (Q92): a survivor result says what it does not model, and flags the cap', () => {
  const r = engine.runPlan(widowed(59, 65, 67, 68, 67));
  const said = (r.issues || []).find((i) => i.code === 'SURVIVOR_BENEFIT_APPROXIMATED');
  assert.ok(said, 'a household paid a survivor benefit must be told what the figure does and does not include');
  assert.equal(said.severity, 'WARNING');
  assert.match(said.message, /[Rr]emarriage/, 'remarriage is not modelled and is named');
  assert.match(said.message, /82\.5%|82.5 percent/,
    'the deceased\'s early-claim cap is named with its figure, not merely alluded to');
  assert.equal(said.state.approximation, true, 'and the flag is machine-readable, not only prose');
  /* R34 (SA32F-01): the cap is applied now, and the disclosure says so rather than calling it missing. */
  assert.equal(said.state.capApplied, true, 'the cap is disclosed as applied');
  assert.ok(!/NOT applied/.test(said.message), 'and the message no longer calls it missing');
});

test('S5AA 4.7 (Q92): a household with no survivor benefit is told nothing about one', () => {
  const p = widowed(59, 65, 67, 68, 67);
  p.retirement.survivor = false;
  const r = engine.runPlan(p);
  assert.equal((r.issues || []).filter((i) => i.code === 'SURVIVOR_BENEFIT_APPROXIMATED').length, 0);
});

/* ------------------------------------------------------------------ the existing cases still hold */

test('S5AA 4.7 (Q92): a survivor past their own claim age with no benefit of their own still gets the larger', () => {
  /* The accepted case a prior repair preserved: the gate keys on the recipient's own claim age and
     deliberately NOT on whether they have a benefit of their own. Adding the survivor floor must not
     disturb it. */
  const p = widowed(68, 71, 68, 69, 67);
  assert.equal(incomeAt(p, 69).toFixed(2), (deceasedMonthly(68, 67) * 12).toFixed(2),
    'past their own claim age, and past survivor full retirement age, the survivor gets the full amount');
});

test('S5AA 4.7 (Q92): the constants are rule records with a source, not literals', () => {
  const s = global.RULES.socialSecurity.survivor;
  assert.ok(s && Array.isArray(s.records) && s.records.length, 'the survivor rule carries records');
  const by = (id) => s.records.find((r) => r.provision_id === id);
  assert.equal(by('survivor_earliest_claim_age').value, SURVIVOR_START);
  assert.equal(by('survivor_minimum_factor').value, SURVIVOR_FLOOR);
  for (const r of s.records) assert.match(r.source_url, /^https:\/\/(www\.)?ssa\.gov/);
});

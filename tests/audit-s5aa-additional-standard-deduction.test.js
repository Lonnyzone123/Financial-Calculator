/* S5AA task 3.1 (F2, G16) -- the age-65 additional standard deduction under IRC 63(f).
 *
 * THE CITATION WAS CHECKED BEFORE THIS RULE WAS CODED, as task 8.6 requires ("a citation that fails the check
 * stops the task that depends on it"). Rev. Proc. 2025-32 section 4.14(3) was read from the IRS PDF itself,
 * not from a summary page, and says verbatim:
 *
 *     (3) Aged or blind. For taxable years beginning in 2026, the additional standard deduction amount under
 *     section 63(f) for the aged or the blind is $1,650. The additional standard deduction amount is increased
 *     to $2,050 if the individual is also unmarried and not a surviving spouse.
 *
 * The check is recorded in Handover temp/S5AA_CITATION_CHECKS_20260920.md (C-01), together with the one
 * correction the primary source forces on the checklist's paraphrase: the statute does NOT key on "married".
 * It keys on UNMARRIED AND NOT A SURVIVING SPOUSE. A HEAD OF HOUSEHOLD is unmarried and not a surviving
 * spouse, so a head-of-household senior gets $2,050, not $1,650. That is the case this file exists to pin,
 * because it is the one a "married vs not" reading gets wrong by $400 per qualifying person, silently.
 *
 * Blindness is OUT OF SCOPE and disclosed: section 63(f) gives separate amounts for the aged (f)(1) and the
 * blind (f)(2), and an individual who is both receives both. The engine models the aged amount only.
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

const BASIC = global.RULES.federal.standardDeduction;
const SENIOR = global.RULES.federal.seniorDeduction;

/* The two amounts, taken from the rule records rather than retyped here, so that a record edited to a wrong
 * figure cannot be masked by a matching constant in the test. Their agreement with the PRIMARY SOURCE is
 * asserted separately, once, below. */
function recordValue(id) {
  const hits = global.RULES.federal.additionalStandardDeduction.records.filter((r) => r.provision_id === id);
  assert.strictEqual(hits.length, 1, 'exactly one rule record for ' + id);
  return hits[0].value;
}
const AGED = 'federal_additional_standard_deduction_aged';
const AGED_UNMARRIED = 'federal_additional_standard_deduction_aged_unmarried_not_surviving_spouse';

/* Recover the deduction the engine actually applied, by inverting marginalTax() on a return made of ordinary
 * income only -- no gains, no Social Security, no wages -- so that federal tax is exactly
 * marginalTax(ordinary - deduction). Measuring the deduction rather than the tax means the assertions below
 * are in the units the citation is written in. */
function deductionApplied(filing, age, spouseAge, ordinary) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.profile.filing = filing;
  p.profile.age = age;
  p.profile.spouseOn = spouseAge !== null;
  if (spouseAge !== null) p.profile.spouseAge = spouseAge;
  const federal = engine.estimateTaxes(p, age, ordinary, 0, 0, 0, 0, 0, 0, 0).federal;
  let lo = 0, hi = ordinary;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (engine.marginalTax(mid, filing) < federal) lo = mid; else hi = mid;
  }
  return ordinary - (lo + hi) / 2;
}

/* Stay below the senior deduction's phaseout start so that the $6,000 is unreduced and the arithmetic below
 * is the citation's arithmetic and nothing else. */
const BELOW_PHASEOUT = 60000;

test('S5AA 3.1 control: the measurement itself is sound -- a taxpayer with no additional deduction recovers the basic amount exactly', () => {
  /* If this fails, every other number in this file is meaningless. Age 64 qualifies for nothing extra, so the
   * deduction applied must be the basic standard deduction on the nose, for each modelled filing status. */
  for (const filing of ['single', 'mfj', 'hoh']) {
    const spouseAge = filing === 'mfj' ? 62 : null;
    const applied = deductionApplied(filing, 64, spouseAge, BELOW_PHASEOUT);
    assert.ok(Math.abs(applied - BASIC[filing]) < 1,
      filing + ' at 64: recovered ' + Math.round(applied) + ', expected the basic ' + BASIC[filing]);
  }
});

test('S5AA 3.1: the rule records carry the amounts Rev. Proc. 2025-32 section 4.14(3) states', () => {
  /* The one place the primary source's figures are written as literals. Everything else reads the records. */
  assert.strictEqual(recordValue(AGED), 1650);
  assert.strictEqual(recordValue(AGED_UNMARRIED), 2050);
  const records = global.RULES.federal.additionalStandardDeduction.records;
  for (const r of records) {
    assert.strictEqual(r.tax_year, 2026, r.provision_id + ' must be the 2026 amount');
    assert.ok(/Rev\. Proc\. 2025-32/.test(r.form_or_code_reference || ''),
      r.provision_id + ' must cite the revenue procedure it came from');
    assert.ok(/^https:\/\/www\.irs\.gov\//.test(r.source_url || ''),
      r.provision_id + ' must carry its primary source URL');
  }
});

test('S5AA 3.1: a single 67-year-old gets $24,150 -- and gets it from the three components, not by coincidence', () => {
  /* The auditor's case. $24,150 is ALSO the 2026 basic standard deduction for a head of household, so an
   * implementation that reached the right total by treating a single senior as a head of household would match
   * the reported number for entirely the wrong reason. The components are therefore asserted, not just the sum. */
  const applied = deductionApplied('single', 67, null, BELOW_PHASEOUT);
  const basic = BASIC.single;
  const senior = SENIOR.perEligiblePerson;
  const additional = recordValue(AGED_UNMARRIED);
  assert.strictEqual(basic, 16100, 'component: the basic standard deduction, Rev. Proc. 2025-32 4.14(1)');
  assert.strictEqual(senior, 6000, 'component: the enhanced senior deduction (OBBBA, statutory, not indexed)');
  assert.strictEqual(additional, 2050, 'component: the 63(f) additional amount, unmarried and not a surviving spouse');
  assert.strictEqual(basic + senior + additional, 24150, 'the components must sum to the auditor case');
  assert.ok(Math.abs(applied - 24150) < 1, 'applied ' + Math.round(applied) + ', expected 24150');
  assert.ok(Math.abs(applied - (BASIC.hoh + senior)) > 1,
    'CONTROL: the total must not have been reached through the head-of-household basic amount');
});

test('S5AA 3.1: a head of household aged 65 or over gets $2,050, because HoH is unmarried and not a surviving spouse', () => {
  /* The case the checklist's paraphrase ("$1,650 per qualifying married person") loses. A head of household is
   * not married, so a "married gets 1,650, everyone else gets 2,050" reading happens to be right here -- but a
   * "spouse present" or "filing === single" reading is wrong, and this pins the difference. */
  const applied = deductionApplied('hoh', 67, null, BELOW_PHASEOUT);
  const expected = BASIC.hoh + SENIOR.perEligiblePerson + recordValue(AGED_UNMARRIED);
  assert.ok(Math.abs(applied - expected) < 1,
    'head of household at 67: applied ' + Math.round(applied) + ', expected ' + expected);
  const married = recordValue(AGED);
  assert.ok(Math.abs(applied - (BASIC.hoh + SENIOR.perEligiblePerson + married)) > 399,
    'CONTROL: a head of household must NOT receive the married amount of $' + married);
});

test('S5AA 3.1: married filing jointly gets $1,650 per qualifying person, applied by each person own age', () => {
  const aged = recordValue(AGED);
  const both = deductionApplied('mfj', 67, 67, BELOW_PHASEOUT);
  const one = deductionApplied('mfj', 67, 62, BELOW_PHASEOUT);
  const neither = deductionApplied('mfj', 64, 62, BELOW_PHASEOUT);

  assert.ok(Math.abs(both - (BASIC.mfj + 2 * SENIOR.perEligiblePerson + 2 * aged)) < 1,
    'both 65 or over: applied ' + Math.round(both));
  assert.ok(Math.abs(one - (BASIC.mfj + SENIOR.perEligiblePerson + aged)) < 1,
    'one spouse only: applied ' + Math.round(one));
  assert.ok(Math.abs(neither - BASIC.mfj) < 1,
    'neither 65: applied ' + Math.round(neither));

  /* The checklist states the size of the change for a couple. Stated here as the finding states it. */
  assert.ok(Math.abs((both - neither) - (2 * SENIOR.perEligiblePerson + 3300)) < 1,
    'a couple both 65 or over must gain exactly $3,300 of 63(f) deduction over a couple under 65');
  /* PER PERSON BY THEIR OWN AGE: one qualifying spouse is exactly half the 63(f) amount of two. */
  assert.ok(Math.abs((both - one) - (SENIOR.perEligiblePerson + aged)) < 1,
    'the second qualifying spouse adds exactly one more senior deduction and one more $' + aged);
});

test('S5AA 3.1: age 64 gets nothing extra, and the boundary is the 65th year, not the 64th', () => {
  const at64 = deductionApplied('single', 64, null, BELOW_PHASEOUT);
  const at65 = deductionApplied('single', 65, null, BELOW_PHASEOUT);
  assert.ok(Math.abs(at64 - BASIC.single) < 1, 'at 64 the deduction is the basic amount alone');
  const step = at65 - at64;
  assert.ok(Math.abs(step - (SENIOR.perEligiblePerson + recordValue(AGED_UNMARRIED))) < 1,
    'crossing 65 adds the senior deduction and the 63(f) amount together, got ' + Math.round(step));
});

test('S5AA 3.1: the 63(f) amount does NOT phase out, though the enhanced senior deduction does', () => {
  /* The phaseout interaction the checklist asks for, and the sharpest single statement of the two deductions
   * being different things. The $6,000 enhanced deduction phases out at 6% of MAGI above $75,000 (single) and
   * is fully gone well before the income used here. Section 63(f) carries no phaseout at all, so at an income
   * where the enhanced deduction has vanished entirely the 63(f) amount must still be there, whole. */
  const additional = recordValue(AGED_UNMARRIED);
  const gone = SENIOR.singlePhaseoutStart + SENIOR.perEligiblePerson / SENIOR.phaseoutRate + 50000;
  const appliedSenior = deductionApplied('single', 67, null, gone);
  const appliedYoung = deductionApplied('single', 64, null, gone);

  assert.ok(Math.abs(appliedYoung - BASIC.single) < 1,
    'CONTROL: at this income a 64-year-old still gets exactly the basic amount');
  assert.ok(Math.abs(appliedSenior - (BASIC.single + additional)) < 1,
    'at ordinary income ' + gone + ' the enhanced senior deduction is fully phased out but the 63(f) $'
    + additional + ' remains: applied ' + Math.round(appliedSenior) + ', expected ' + (BASIC.single + additional));
  assert.ok(appliedSenior > appliedYoung,
    'CONTROL: the senior must still be better off than the 64-year-old at the same income');
});

test('S5AA 3.1: the surviving-spouse boundary is EXCLUDED EXPLICITLY, because the engine models no such filing status', () => {
  /* The checklist says "support a survivor-filing transition or exclude that status explicitly". The engine
   * models exactly three filing statuses and none of them is a qualifying surviving spouse, so the boundary
   * between $1,650 and $2,050 for a surviving spouse CANNOT BE REACHED and is excluded, not implemented.
   * Adding the status would be new modelling, which ground rule 12 does not permit here.
   *
   * This test pins the exclusion so it stays visible: if a surviving-spouse status is ever introduced, this
   * fails and forces the 63(f) branch to be revisited at the same time -- which is the whole point of writing
   * an exclusion down as a test rather than as a sentence. */
  const modelled = Object.keys(global.RULES.federal.standardDeduction).sort();
  assert.deepStrictEqual(modelled, ['hoh', 'mfj', 'single'],
    'the modelled filing statuses changed -- revisit the 63(f) unmarried-and-not-a-surviving-spouse branch');
  for (const filing of modelled) {
    assert.ok(!/surviv|qss|widow/i.test(filing), filing + ' must not be a surviving-spouse status');
  }
  /* And the engine refuses a filing status it does not model, so a plan cannot smuggle one in. */
  assert.strictEqual(global.RULES.federal.ordinaryBrackets.qss, undefined,
    'a surviving-spouse status must not resolve to a bracket table');
});

test('S5AA 3.1: Arizona is untouched -- its base does not read the federal deduction figure', () => {
  /* The checklist: "check whether Arizona's base reads the federal deduction figure and keep the new amount
   * out of it unless the owner decides otherwise." It does not: Arizona subtracts its OWN az_basic_standard_deduction
   * record plus its own $2,100 per person 65 or over. This test pins that the new federal amount stays out. */
  const base = JSON.parse(JSON.stringify(defaultPlan));
  base.setupComplete = true;
  base.profile.filing = 'single';
  base.profile.spouseOn = false;
  const run = (age) => {
    const p = JSON.parse(JSON.stringify(base));
    p.profile.age = age;
    return engine.estimateTaxes(p, age, BELOW_PHASEOUT, 0, 0, 0, 0, 0, 0, 0);
  };
  const at64 = run(64), at67 = run(67);
  const azRate = global.RULES.arizona.rate;
  assert.ok(azRate > 0, 'CONTROL: the Arizona rate must be non-zero for this test to say anything');
  /* Arizona's own age-65 exemption is $2,100 per person and is the ONLY age effect its base may show.
   * If the federal 63(f) amount leaked in, the Arizona difference would be larger by $2,050. */
  const azDiff = (at64.az - at67.az) / azRate;
  assert.ok(Math.abs(azDiff - 2100) < 1,
    'Arizona must change by its own $2,100 exemption alone, not by the federal amounts: got ' + Math.round(azDiff));
});

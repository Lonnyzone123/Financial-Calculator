/* S5AA R48 (the owner's AA1 decisions, 2026-10-03, on ChatGPT's AA1 assumptions audit) -- MEDICARE, SURVIVORS AND ARIZONA.
 *
 * The owner's rules:
 * AA1-23  The Medicare charge -- the Part B premium and the IRMAA amounts, the Part B deductible and the Part D premium -- grows from
 *         2026 at advanced.medicareInflation (percent) when entered, else advanced.healthInflation. advanced.partDPremium (monthly, per
 *         person), when entered, replaces the CMS base beneficiary premium ($38.99) as the plan premium; the IRMAA Part D surcharge still
 *         applies on top. Before R48 the charge stayed at 2026 dollars while the IRMAA thresholds indexed.
 * AA1-11  The engine's IRMAA_PRE_PLAN_MAGI_ASSUMED warning is shown as a card; the two prior-year MAGI inputs say that blank means
 *         below the first surcharge tier; the validator warns when health costs are on, someone is 65 or older and the household is
 *         retired in plan year 0 or 1, and either prior-year MAGI is blank.
 * AA1-19  A survivor under 59 1/2 at the death holds the deceased's traditional IRAs as an inherited IRA (spouse sole beneficiary):
 *         no 10% additional tax (IRC 72(t)(2)(A)(ii); 72(t)(3)(A) excludes only (A)(v) and (C) for IRAs); required distributions as a
 *         spouse beneficiary -- from the year the deceased would have reached their applicable age where the death came before the
 *         required beginning date (26 CFR 1.401(a)(9)-3(d)), from the year after the death otherwise; the survivor's single life
 *         expectancy, redetermined each year (1.401(a)(9)-5(d)(3)(iv)), or after the beginning date the longer of that and the
 *         deceased's remaining life expectancy (-5(d)(1)(ii), (d)(3)(ii)), from the Single Life Table (1.401(a)(9)-9(b)); its Form 8606
 *         basis kept apart from the survivor's own (Pub. 590-B: only a spouse who treats the IRA as their own may combine basis). From
 *         the first year opening at 59 1/2 or later the survivor treats it as their own; a contribution to it is that election too
 *         (26 CFR 1.408-8(c): a deemed election when amounts are contributed). A survivor 59 1/2 or older: unchanged.
 * AA1-20  profile.communityProperty (optional, absent = false): at the first death the basis of the joint taxable account AND of both
 *         spouses' own taxable accounts resets in full to value (IRC 1014(b)(6); A.R.S. 25-211(A)).
 * AA1-16  Arizona subtracts the amount deducted federally under IRC 151(d)(5)(C) (A.R.S. 43-1022(35), taxable years from 2025), and
 *         25% of the net long-term capital gain from assets acquired after 2011 (43-1022(22)(c)), the share of gains the plan enters
 *         in retirement.azPost2011GainShare (absent = 0%: no subtraction).
 *
 * Rows are labelled by their closing age, on the primary's clock. Returns and inflation are 0. Every expected figure is hand-derived
 * from the law, the rule and the inputs; the derivation sits beside each case. 2026 figures used (each the rules package's, read from
 * its source): federal single standard deduction $16,100, brackets 10% to $12,400 and 12% to $50,400; the age-65 amount for a single
 * filer $2,050 (IRC 63(f)); the senior deduction $6,000, less 6% of MAGI over $75,000 (IRC 151(d)(5)(C)); Arizona 2.5% on Arizona AGI
 * less the $16,100 single standard deduction and $2,100 per person 65+ (A.R.S. 43-1023); Part B $202.90 a month and the $283
 * deductible; the Part D base premium $38.99 a month.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));

const cents = (x) => Math.round(x * 100) / 100;
const near = (actual, expected, msg, tol = 0.02) => assert.ok(Math.abs(actual - expected) <= tol, (msg || '') + ': ' + actual + ' against ' + expected);
function run(p) {
  const v = validateScenario(structuredClone(p));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}
const at = (r, age) => { const row = r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
const ira = (id, balance, extra) => L.account(id, 'traditionalIRA', balance, extra);
const roth = (balance) => L.account('roth', 'rothIRA', balance);
const issue = (r, code) => (r.issues || []).find((i) => i && i.code === code);
const vIssues = (p, code) => validateScenario(structuredClone(p)).issues.filter((i) => i.code === code);

// =====================================================================================================================================
// AA1-23: the Medicare charge grows
// =====================================================================================================================================
// One person, 66, retired, health costs on with no pre-Medicare cost, living on a Roth (no tax, so no MAGI: the first IRMAA tier).
// Row `spending` is the health cost. One person at the first tier: 202.90 x 12 + 283 + 38.99 x 12 = 2,434.80 + 283 + 467.88 = 3,185.68.
function medicare(adv = {}, o = {}) {
  const p = L.basePlan({ age: 66, retireAge: 66, endAge: 69, healthOn: true, spending: 0, accounts: [roth(1000000)] });
  Object.assign(p.advanced, { healthCost: 0, healthInflation: 5 }, adv);
  if (o.couple) { Object.assign(p.profile, o.couple); p.profile.filing = 'mfj'; }
  return p;
}
test('R48 AA1-23: the Medicare charge grows at the health-inflation rate from 2026', () => {
  // The row closing at 67 is 2026 (yearProgress 0): 3,185.68. At 68, one year on: 3,185.68 x 1.05 = 3,344.964. At 69: x 1.1025 = 3,512.2122.
  const r = run(medicare());
  assert.deepEqual([67, 68, 69].map((a) => cents(at(r, a).spending)), [3185.68, 3344.96, 3512.21]);
});
test('R48 AA1-23 control: at 0% health inflation the charge stays at 2026\'s', () => {
  const r = run(medicare({ healthInflation: 0 }));
  assert.deepEqual([67, 68, 69].map((a) => cents(at(r, a).spending)), [3185.68, 3185.68, 3185.68]);
});
test('R48 AA1-23: an entered Medicare growth rate replaces health inflation for the Medicare charge', () => {
  // 3% in place of 5%: 3,185.68 x 1.03 = 3,281.2504; x 1.0609 = 3,379.6879.
  const r = run(medicare({ medicareInflation: 3 }));
  assert.deepEqual([67, 68, 69].map((a) => cents(at(r, a).spending)), [3185.68, 3281.25, 3379.69]);
});
test('R48 AA1-23: an entered Part D premium replaces the base premium, and grows with the rest', () => {
  // $50 a month: 2,434.80 + 283 + 600 = 3,317.80; at 4%: 3,450.512 and 3,588.5325.
  const r = run(medicare({ partDPremium: 50, medicareInflation: 4 }));
  assert.deepEqual([67, 68, 69].map((a) => cents(at(r, a).spending)), [3317.8, 3450.51, 3588.53]);
});
test('R48 AA1-23: the IRMAA amounts grow too, and the Part D surcharge stays on top of an entered premium', () => {
  // Both prior-year MAGIs $150,000, single: over $137,000 and not over $171,000, the third tier: Part B $405.80, Part D surcharge $37.50.
  // 2026: (405.80 + 37.50) x 12 + 283 + 38.99 x 12 = 5,319.60 + 283 + 467.88 = 6,070.48. 2027 reads last year's $150,000 too, at 5%:
  // 6,373.004 -> 6,374.00. 2028 reads the plan's own 2026 MAGI, 0: the first tier, 3,185.68 x 1.1025 = 3,512.21.
  const r = run(medicare({ irmaaMagiTwoYearsBefore: 150000, irmaaMagiOneYearBefore: 150000 }));
  assert.deepEqual([67, 68, 69].map((a) => cents(at(r, a).spending)), [6070.48, 6374, 3512.21]);
  // With a $50 premium and 0% growth: (405.80 + 37.50) x 12 + 283 + 600 = 6,202.60 in 2026.
  const r2 = run(medicare({ irmaaMagiTwoYearsBefore: 150000, irmaaMagiOneYearBefore: 150000, partDPremium: 50, healthInflation: 0 }));
  assert.equal(cents(at(r2, 67).spending), 6202.6);
});
test('R48 AA1-23: a retired spouse of 68 beside a working self is charged the grown amount too (R43\'s idle-spouse charge)', () => {
  // Self 60 working to 65 on $100,000; spouse 68, no salary. Only the spouse is on Medicare: 3,185.68 in 2026, 3,344.96 in 2027.
  const p = medicare({}, { couple: { spouseOn: true, spouseAge: 68 } });
  Object.assign(p.profile, { age: 60, retireAge: 65, endAge: 62 });
  Object.assign(p.employment, { salary: 100000, contributionStop: 65 });
  const r = run(p);
  assert.deepEqual([61, 62].map((a) => cents(at(r, a).spending)), [3185.68, 3344.96]);
});
test('R48 AA1-23: both new inputs are typed by both layers', () => {
  for (const [k, v] of [['medicareInflation', 'abc'], ['medicareInflation', -100], ['partDPremium', -5], ['partDPremium', '40']]) {
    const p = medicare({ [k]: v });
    const vr = validateScenario(structuredClone(p));
    assert.ok(vr.issues.some((i) => i.severity === 'ERROR' && i.path === 'advanced.' + k), k + ' = ' + JSON.stringify(v) + ': ' + JSON.stringify(vr.issues));
    const r = engine.runPlan(structuredClone(p));
    assert.equal(r.calculationError, true, k + ' = ' + JSON.stringify(v) + ' must be refused by the engine');
  }
  const ok = validateScenario(medicare({ medicareInflation: 3, partDPremium: 40 }));
  assert.ok(!ok.issues.some((i) => i.code === 'UNKNOWN_ADVANCED_KEY'), 'both are known optional keys');
});

// =====================================================================================================================================
// AA1-11: the prior-income prompt
// =====================================================================================================================================
test('R48 AA1-11: the validator warns when a retired 65-year-old\'s prior-year incomes are blank', () => {
  const w = vIssues(medicare(), 'IRMAA_PRIOR_INCOME_BLANK');
  assert.equal(w.length, 1);
  assert.equal(w[0].severity, 'WARNING');
  assert.match(w[0].message, /first surcharge tier/);
  // One entered, the other blank: still warned.
  assert.equal(vIssues(medicare({ irmaaMagiOneYearBefore: 90000 }), 'IRMAA_PRIOR_INCOME_BLANK').length, 1);
});
test('R48 AA1-11 controls: no warning with both entered, with health costs off, under 65 in the first two years, or still working', () => {
  assert.equal(vIssues(medicare({ irmaaMagiTwoYearsBefore: 90000, irmaaMagiOneYearBefore: 90000 }), 'IRMAA_PRIOR_INCOME_BLANK').length, 0);
  assert.equal(vIssues(medicare({ healthOn: false }), 'IRMAA_PRIOR_INCOME_BLANK').length, 0);
  const young = medicare(); Object.assign(young.profile, { age: 62, retireAge: 62, endAge: 66 });   // 62 and 63 at the two openings
  assert.equal(vIssues(young, 'IRMAA_PRIOR_INCOME_BLANK').length, 0);
  const working = medicare(); Object.assign(working.profile, { retireAge: 70, endAge: 72 }); working.employment.salary = 80000; working.employment.contributionStop = 70;
  assert.equal(vIssues(working, 'IRMAA_PRIOR_INCOME_BLANK').length, 0, 'retired only from 70, past plan years 0 and 1');
});
test('R48 AA1-11: the app shows the engine\'s warning as a card, and the two inputs say what blank means', () => {
  const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
  const titles = shell.match(/planWarningTitles=\{([^}]*)\}/)[1];
  assert.match(titles, /IRMAA_PRE_PLAN_MAGI_ASSUMED:"/);
  for (const id of ['v2-irmaa-magi-2', 'v2-irmaa-magi-1']) {
    const label = shell.match(new RegExp('<label[^>]*>[^<]*<input[^>]*id="' + id + '"[^>]*>(<span class="v2-note">[^<]*</span>)?'));
    assert.ok(label && label[1] && /[Bb]lank means .*below the first surcharge tier/.test(label[1]), id + ' help text: ' + (label && label[0]));
  }
});

// =====================================================================================================================================
// AA1-19: a survivor under 59 1/2 holds the deceased's IRA as inherited
// =====================================================================================================================================
// A couple, retired, the self dies at 50.5: the row closing at 51 is the year of death (still the decedent's), and from the row opening
// at 51 the accounts are the survivor's. Spending $40,000 a year, drawn from a traditional IRA; the survivor files single.
function widowAt50(o = {}) {
  const accounts = o.accounts || [ira('ira', 1000000, { owner: 'self' })];
  const p = L.basePlan({ couple: true, age: 50, spouseAge: o.spouseAge ?? 50, retireAge: 50, endAge: o.endAge ?? 53, spending: o.spending ?? 40000, accounts });
  p.retirement.selfLife = 50.5;
  p.retirement.survivorSpendingReduction = 0;
  return p;
}
test('R48 AA1-19: a survivor of 51 draws the inherited IRA with no 10% additional tax', () => {
  // Row closing at 52, single, W drawn, all ordinary income: tax = 1,240 + 12% x (W - 16,100 - 12,400) + 2.5% x (W - 16,100).
  // W - tax = 40,000 -> 0.855 W = 40,000 + 1,240 - 3,420 - 402.50 = 37,417.50 -> W = 43,763.16 (federal taxable $27,663.16, in the 12%
  // bracket). Before R48 the survivor took the IRA as their own and paid 10% more: 0.755 W = 37,417.50 -> W = 49,559.60.
  const r = run(widowAt50());
  near(at(r, 52).withdrawals, 43763.16, 'withdrawals');
  near(at(r, 52).taxes, 3763.16, 'taxes: federal 3,071.58 + Arizona 691.58');
});
test('R48 AA1-19 control: the survivor\'s OWN IRA still carries the 10% before 59 1/2', () => {
  // The decedent holds nothing; the survivor draws their own IRA: W = 49,559.60, as before R48.
  const r = run(widowAt50({ accounts: [ira('ira', 1000000, { owner: 'spouse' })] }));
  near(at(r, 52).withdrawals, 49559.6, 'withdrawals');
});
test('R48 AA1-19 control: a survivor of 59 1/2 or older at the death takes the IRA as their own, unchanged', () => {
  // Spouse 58.5 at the start: 59.5 at the row opening at 51. No 10% either way: W = 43,763.16 on both trees.
  const r = run(widowAt50({ spouseAge: 58.5 }));
  near(at(r, 52).withdrawals, 43763.16, 'withdrawals');
  const s = issue(r, 'SPOUSAL_ROLLOVER_ASSUMED').state;
  assert.deepEqual(s.inheritedIra || [], [], 'nothing is held as inherited');
});

// Required distributions. The self, 72 (born 1954: applicable age 73), owns a $500,000 IRA and dies at 72.5, before the required
// beginning date (the year of death's whole age is 72). RMDs on; nothing is spent. The survivor's own applicable age is 75.
function widowWithRmd(selfAge, spouseAge, selfLife, endAge) {
  const p = L.basePlan({ couple: true, age: selfAge, spouseAge, retireAge: selfAge, endAge, spending: 0, rmdOn: true,
    accounts: [ira('ira', 500000, { owner: 'self' }), L.account('brok', 'taxable', 0, { basisPct: 100 })] });
  p.retirement.selfLife = selfLife;
  return p;
}
test('R48 AA1-19: a death before the beginning date -- the inherited IRA owes from the year the deceased would have reached 73', () => {
  // Spouse 50. 2027 (row closing at 74) is the year the self would have reached 73, so distributions start there (1.401(a)(9)-3(d)).
  // Divisor: the Single Life Table at the survivor's age that year, 51: 35.3 -> 500,000 / 35.3 = 14,164.31. 2028: age 52, 34.3, on
  // 485,835.69 -> 14,164.31. Before R48 the survivor owed nothing until their own 75.
  const r = run(widowWithRmd(72, 50, 72.5, 76));
  near(at(r, 74).rmd, 14164.31, 'row 74');
  near(at(r, 75).rmd, 14164.31, 'row 75');
});
test('R48 AA1-19: at 59 1/2 the survivor treats it as their own -- no RMD until their own applicable age', () => {
  // Spouse 58: 59 at the opening at 73 (inherited: 500,000 / 28.0 = 17,857.14, the table at 59), 60 at the opening at 74 (their own:
  // nothing due until 75).
  const r = run(widowWithRmd(72, 58, 72.5, 76));
  near(at(r, 74).rmd, 17857.14, 'row 74, inherited');
  assert.equal(at(r, 75).rmd, 0, 'row 75, rolled over at 59 1/2');
  const held = issue(r, 'SPOUSAL_ROLLOVER_ASSUMED').state.inheritedIra;
  assert.deepEqual(held.map((h) => [h.account, h.from, h.until, h.endedBy]), [['ira', 73, 74, '59 1/2']]);
});
test('R48 AA1-19 control: a survivor 59 1/2 or older owes nothing until their own applicable age, as before', () => {
  const r = run(widowWithRmd(72, 60, 72.5, 76));
  assert.equal(at(r, 74).rmd, 0);
  assert.equal(at(r, 75).rmd, 0);
});
test('R48 AA1-19: a death after the beginning date -- the longer of the survivor\'s and the deceased\'s remaining life expectancy', () => {
  // The self, 75 (born 1951, applicable age 73), dies at 75.5; the spouse is 55. The year of death owes the self's own RMD, on the Joint
  // and Last Survivor Table (spouse sole beneficiary, more than 10 years younger; 1.401(a)(9)-9(d), 75 and 55: 32.4): 500,000 / 32.4 =
  // 15,432.10, leaving 484,567.90. 2027: the survivor's single life at 56 is 30.6; the deceased's, from 14.8 at 75 in the year of death,
  // less one year, is 13.8; the longer is 30.6 -> 484,567.90 / 30.6 = 15,835.55. Before R48: nothing (the survivor's own 75 is far off).
  const r = run(widowWithRmd(75, 55, 75.5, 77));
  near(at(r, 76).rmd, 15432.1, 'the year of death, the decedent\'s own');
  near(at(r, 77).rmd, 15835.55, 'the first inherited year');
});

// Basis: the self (45, salary $200,000, covered by a workplace plan through a $1 Roth 401(k) deferral) makes a wholly nondeductible
// $7,500 IRA contribution in the one working year, and dies at 46.5. The spouse (no salary) holds $20,000 of IRA with no basis. A
// $7,500 one-time expense at 47 is drawn from the deceased's IRA first (priority 1).
function basisPlan(spouseAge) {
  const p = L.basePlan({ couple: true, age: 45, spouseAge, retireAge: 46, endAge: 48, salary: 200000, spending: 0,
    order: 'manual', manualOrder: 'preTax,taxable,roth,hsa',
    accounts: [ira('ira-self', 0, { owner: 'self', contribution: 7500, priority: 1 }), ira('ira-spouse', 20000, { owner: 'spouse', priority: 2 }),
      L.account('r401', 'roth401k', 0, { owner: 'self', contribution: 1, priority: 8 }), L.account('cash', 'taxable', 0, { priority: 9 })] });
  p.employment.contributionStop = 46;
  p.retirement.selfLife = 46.5;
  p.retirement.expenses = [{ age: 47, amount: 7500 }];
  p.advanced.penaltyException = true;
  return p;
}
test('R48 AA1-19: the inherited IRA keeps the deceased\'s basis in its own pool', () => {
  // The inherited pool: $7,500 of basis in $7,500 -- the draw is all basis, AGI 0. Before R48 the basis joined the survivor's pool:
  // 7,500 of basis over 7,500 + 20,000 = 27,500, so 7,500 x (1 - 7,500/27,500) = 5,454.55 was income.
  const r = run(basisPlan(45));
  near(at(r, 48).withdrawals, 7500, 'the expense, no tax');
  near(at(r, 48).federalAgi, 0, 'AGI');
});
test('R48 AA1-19 control: a survivor of 60 combines the basis, as before -- AGI 5,454.55', () => {
  const r = run(basisPlan(58));
  near(at(r, 48).federalAgi, 5454.55, 'AGI');
});
test('R48 AA1-19: a contribution to the inherited IRA makes it the survivor\'s own from the next year (1.408-8(c), deemed election)', () => {
  // The survivor (50, earning $100,000 to their own 55) moves $5,000 from their taxable account into the inherited IRA at 51.5 (a transfer
  // the engine treats as an IRA contribution): the IRA is inherited for the row opening at 51 and the survivor's own from the opening at 52.
  // MISS corrected in the build (recorded in the build report): this case first kept the deceased's planned $5,000 a year contribution
  // after the death, but the engine makes no planned contribution to a decedent's account after the year of death (it moved $2,500 in
  // the year of death and nothing after), so no contribution could reach the inherited IRA that way.
  const p = widowAt50({ spending: 0, endAge: 54, accounts: [ira('ira', 100000, { owner: 'self' }), L.account('cash', 'taxable', 50000, { owner: 'spouse', basisPct: 100 })] });
  p.employment.spouseSalary = 100000; p.profile.spouseRetireAge = 55; p.employment.contributionStop = 55;
  Object.assign(p.advanced, { transferOn: true, transferAge: 51.5, transferFrom: 'cash', transferTo: 'ira', transferAmount: 5000 });
  const held = issue(run(p), 'SPOUSAL_ROLLOVER_ASSUMED').state.inheritedIra;
  assert.deepEqual(held.map((h) => [h.account, h.from, h.until, h.endedBy]), [['ira', 51, 52, 'contribution']]);
  // Control: no contribution -- held until the opening at 60, where the survivor is 59 1/2 or older (the projection ends at 54 first).
  const q = widowAt50({ spending: 0, endAge: 54, accounts: [ira('ira', 100000, { owner: 'self' }), L.account('cash', 'taxable', 50000, { owner: 'spouse', basisPct: 100 })] });
  q.employment.spouseSalary = 100000; q.profile.spouseRetireAge = 55; q.employment.contributionStop = 55;
  const held2 = issue(run(q), 'SPOUSAL_ROLLOVER_ASSUMED').state.inheritedIra;
  assert.deepEqual(held2.map((h) => [h.account, h.from, h.until, h.endedBy]), [['ira', 51, null, null]]);
});
test('R48 AA1-19: the disclosure says the IRA is held as inherited until 59 1/2', () => {
  const s = issue(run(widowAt50()), 'SPOUSAL_ROLLOVER_ASSUMED');
  assert.match(s.message, /inherited IRA/);
  assert.match(s.message, /59 1\/2/);
  assert.ok(!/that choice is not modelled/.test(s.message), 'the election is modelled now');
  assert.ok(s.state.authority.includes('IRC 72(t)(2)(A)(ii)'));
  assert.ok(!s.state.notModelled.includes('inherited-IRA treatment'));
});

// =====================================================================================================================================
// AA1-20: Arizona community property
// =====================================================================================================================================
// A couple of 70, retired, nothing spent, the self dies at 70.5. Three taxable accounts of $100,000 each at 40% basis ($40,000): joint,
// the self's, the spouse's. Dividends on at a 0% yield (with dividends off the engine imputes a 1.5% yield, reinvested as basis). The basis is read from the tap at the end of the row opening at 71 (the first after the death).
function cpPlan(cp, dies = 'self') {
  const acc = (id, owner) => L.account(id, 'taxable', 100000, { owner, basisPct: 40 });
  const p = L.basePlan({ couple: true, age: 70, spouseAge: 70, retireAge: 70, endAge: 72, spending: 0, dividendOn: true, dividendYield: 0,
    accounts: [acc('joint', 'joint'), acc('mine', 'self'), acc('theirs', 'spouse')] });
  if (dies === 'self') p.retirement.selfLife = 70.5; else p.retirement.spouseLife = 70.5;
  if (cp !== undefined) p.profile.communityProperty = cp;
  return p;
}
function basisAfterDeath(p) {
  const t = L.runTapped(p);
  assert.ok(t.valid, JSON.stringify(t.invalid));
  const tap = t.taps.find((x) => Math.abs(x.age - 71) < 1e-9);
  const of = (id) => { const b = tap.balances.find((x) => x.id === id); return cents(b.basis !== undefined && b.basis !== null ? b.basis : 0.4 * b.b); };
  return [of('joint'), of('mine'), of('theirs')];
}
test('R48 AA1-20: with community property every taxable account resets in full at the first death (IRC 1014(b)(6))', () => {
  // joint: 100,000 (both halves); the decedent's: 100,000; the survivor's own community account: 100,000.
  assert.deepEqual(basisAfterDeath(cpPlan(true)), [100000, 100000, 100000]);
  assert.deepEqual(basisAfterDeath(cpPlan(true, 'spouse')), [100000, 100000, 100000], 'whichever spouse dies');
});
test('R48 AA1-20 control: without it, the decedent\'s resets, the joint account half (2040(b)), the survivor\'s not at all', () => {
  // joint: 0.5 x 40,000 + 0.5 x 100,000 = 70,000; the decedent's 100,000; the survivor's 40,000.
  assert.deepEqual(basisAfterDeath(cpPlan(undefined)), [70000, 100000, 40000]);
  assert.deepEqual(basisAfterDeath(cpPlan(false)), [70000, 100000, 40000]);
});
test('R48 AA1-20: the switch is a boolean at both layers', () => {
  const p = cpPlan('yes');
  assert.ok(validateScenario(structuredClone(p)).issues.some((i) => i.severity === 'ERROR' && i.path === 'profile.communityProperty'));
  assert.equal(engine.runPlan(structuredClone(p)).calculationErrorCode, 'SCENARIO_NONBOOLEAN_FLAG');
});

// =====================================================================================================================================
// AA1-16: Arizona subtractions
// =====================================================================================================================================
// A single person living on a pension, spending nothing from a Roth: the row's taxes are the federal and Arizona tax on the pension.
function pensionTax(age, pension) {
  const r = run(L.basePlan({ age, retireAge: age, endAge: age + 1, pension, spending: 0, accounts: [roth(1000000)] }));
  return at(r, age + 1).taxes;
}
test('R48 AA1-16(a): Arizona subtracts the federal senior deduction (A.R.S. 43-1022(35))', () => {
  // Single, 66 (67 at the year's close), $60,000 of pension: federal AGI under $75,000, so the senior deduction is $6,000. Federal:
  // 60,000 - (16,100 + 2,050 + 6,000) = 35,850 -> 1,240 + 12% x 23,450 = 4,054. Arizona: 60,000 - 16,100 - 2,100 - 6,000 = 35,800 x 2.5%
  // = 895 (it was 41,800 x 2.5% = 1,045): 4,949 (was 5,099).
  near(pensionTax(66, 60000), 4949, '$60,000');
  // $100,000: 6,000 - 6% x 25,000 = 4,500. Federal: 100,000 - 22,650 = 77,350 -> 1,240 + 4,560 + 22% x 26,950 = 11,729. Arizona:
  // 100,000 - 18,200 - 4,500 = 77,300 x 2.5% = 1,932.50 (it was 2,045): 13,661.50 (was 13,774).
  near(pensionTax(66, 100000), 13661.5, '$100,000');
});
test('R48 AA1-16(a) control: under 65 there is no federal senior deduction, and nothing to subtract', () => {
  // Single, 60: federal 60,000 - 16,100 = 43,900 -> 5,020; Arizona (60,000 - 16,100) x 2.5% = 1,097.50: 6,117.50, as before.
  near(pensionTax(60, 60000), 6117.5, '$60,000 at 60');
});
test('R48 AA1-16(a): through a projection, the funding solver and the estimator agree', () => {
  // Single, 66, $40,000 from a traditional IRA. Federal: 16,100 + 2,050 + 6,000 = 24,150 deducted; Arizona: 16,100 + 2,100 + 6,000 =
  // 24,200. W - [1,240 + 12% (W - 36,550)] - 2.5% (W - 24,200) = 40,000 -> 0.855 W = 36,249 -> W = 42,396.49 (before: Arizona's
  // 18,200, 0.855 W = 36,399, W = 42,571.93).
  const r = run(L.basePlan({ age: 66, retireAge: 66, endAge: 67, spending: 40000, accounts: [ira('ira', 1000000)] }));
  near(at(r, 67).withdrawals, 42396.49, 'withdrawals');
  assert.ok(!issue(r, 'QUOTE_SETTLEMENT_UNVERIFIED'), 'the mirror moves with the estimator');
});
test('R48 AA1-16(b): through a projection, a taxable account\'s gains', () => {
  // Single, 60, $80,000 of spending from a taxable account at 50% basis, so half of each dollar drawn is gain; federal tax 0 (gains in
  // the 0% band); dividends on at a 0% yield, so no imputed 1.5% dividend. Arizona with the whole share: 2.5% x (0.5 W - 0.125 W - 16,100) -> W - 0.009375 W + 402.50 = 80,000 ->
  // W = 80,350.79 (without: 2.5% x (0.5 W - 16,100) -> 0.9875 W = 79,597.50 -> W = 80,605.06).
  const p = L.basePlan({ age: 60, retireAge: 60, endAge: 61, spending: 80000, dividendOn: true, dividendYield: 0, accounts: [L.account('brok', 'taxable', 1000000, { basisPct: 50 })] });
  p.retirement.azPost2011GainShare = 100;
  const r = run(p);
  near(at(r, 61).withdrawals, 80350.79, 'withdrawals');
  assert.ok(!issue(r, 'QUOTE_SETTLEMENT_UNVERIFIED'));
  // Half the gains qualify: 25% x 50% = 12.5% of the gain, 0.0625 W: Arizona 2.5% x (0.4375 W - 16,100) -> W - 0.0109375 W + 402.50 = 80,000
  // -> W = 79,597.50 / 0.9890625 = 80,477.73.
  p.retirement.azPost2011GainShare = 50;
  near(at(run(p), 61).withdrawals, 80477.73, 'half the gains qualify');
});
test('R48 AA1-16(b) control: with no share entered nothing is subtracted', () => {
  const p = L.basePlan({ age: 60, retireAge: 60, endAge: 61, spending: 80000, dividendOn: true, dividendYield: 0, accounts: [L.account('brok', 'taxable', 1000000, { basisPct: 50 })] });
  near(at(run(p), 61).withdrawals, 80605.06, 'as before: 2.5% x (0.5 W - 16,100), 0.9875 W = 79,597.50');
});
test('R48 AA1-16(b) control: a net capital loss subtracts nothing, whatever the share', () => {
  // Single, 60, a $30,000 pension and $40,000 of spending from a taxable account at full basis whose value falls 60% before the year's
  // sale (annual timing): every dollar sold is a loss, far over the $3,000 a year may deduct. Federal: 30,000 - 3,000 - 16,100 = 10,900
  // -> 1,090; Arizona (30,000 - 3,000 - 16,100) x 2.5% = 272.50 -- the same with the whole share entered: 25% of a gain of 0 is 0.
  const p = L.basePlan({ age: 60, retireAge: 60, endAge: 61, pension: 30000, spending: 40000, dividendOn: true, dividendYield: 0, timing: 'annual', returnRate: -60,
    accounts: [L.account('brok', 'taxable', 1000000, { basisPct: 100 })] });
  near(at(run(p), 61).taxes, 1362.5, 'no share');
  p.retirement.azPost2011GainShare = 100;
  near(at(run(p), 61).taxes, 1362.5, 'the whole share');
});
test('R48 AA1-16(b): the share is a percent from 0 to 100 at both layers', () => {
  for (const v of [150, -1, '25']) {
    const p = L.basePlan({ age: 60 }); p.retirement.azPost2011GainShare = v;
    assert.ok(validateScenario(structuredClone(p)).issues.some((i) => i.severity === 'ERROR' && i.path === 'retirement.azPost2011GainShare'), JSON.stringify(v));
    assert.equal(engine.runPlan(structuredClone(p)).calculationError, true, JSON.stringify(v));
  }
});

// =====================================================================================================================================
// The form
// =====================================================================================================================================
test('R48: each new input is read, written and recalculates on change', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
  const listened = new Set(JSON.parse(s.match(/staticIds=(\[[^\]]*\])/)[1]));
  const body = (name) => { const lines = s.split('\n'), i = lines.findIndex((l) => l.includes('function ' + name + '(')); let b = lines[i]; for (let k = i + 1; k < lines.length && !/^ {4}function /.test(lines[k]); k++) b += lines[k]; return b; };
  const read = body('readStatic'), write = body('writeStatic');
  for (const id of ['v2-medicare-inflation', 'v2-part-d-premium', 'v2-community-property', 'v2-az-gain-share']) {
    assert.ok(s.includes('id="' + id + '"'), id + ' exists');
    assert.ok(listened.has(id), id + ' listened');
    assert.ok(read.includes('"' + id + '"'), id + ' read');
    assert.ok(write.includes('"' + id + '"'), id + ' written');
  }
});

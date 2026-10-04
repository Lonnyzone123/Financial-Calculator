/* S5AA R51 (the owner's follow-up decisions on R46-R50, 2026-10-03) -- ONE MEDICARE DATE, STREAMS AS PAY, FLEXIBILITY OFF BY DEFAULT.
 *
 * The owner's rules:
 * AA1-25(c)  Spending flexibility defaults to off: defaultPlan.retirement.flexibility is 0 (it was 10). R49's floor and warnings stay.
 * AA1-32     One Medicare date. R47 stopped HSA contributions at each person's Medicare start (medicareStartAge(): an entered
 *            profile.medicareStartAge / spouseMedicareStartAge, else 65 when their Social Security claim is 65 or earlier or no benefit
 *            is entered, else the claim age less half a year). Each living person's Medicare charge (premiums, IRMAA, the Part B
 *            deductible: R48's medicareChargePerPerson()) now starts at that same age, and the pre-Medicare cost runs until then for that
 *            person -- in the retired household's rows, in R43's idle-spouse rule, and in the two IRMAA disclosures (and R48's validator
 *            mirror). Inside a row the start falls where it falls, as the HSA's stop does: a person whose start is 69.5 pays half a year
 *            of each in the row 69 -> 70. Before R51 the charge started at the first row opening at 65 or later.
 * AA1-07     The working-years check (R49) counts employment and self-employment income streams paid in the working months as pay, net of
 *            the payroll and self-employment tax the engine computes on them (the full return's payroll less the wage-only return's).
 *
 * Rows are labelled by their closing age, on the primary's clock. Returns and inflation are 0; healthcare inflation 0. Every expected
 * figure is hand-derived from the rule and the inputs; the derivation sits beside each case. 2026 figures used (the rules package's):
 * Part B $202.90 a month and the $283 deductible; the Part D base premium $38.99 a month -- one person at the first IRMAA tier pays
 * 202.90 x 12 + 283 + 38.99 x 12 = 2,434.80 + 283 + 467.88 = 3,185.68 a year; the single and joint first IRMAA thresholds $109,000 and
 * $218,000; FICA 6.2% + 1.45% (wage base $184,500); self-employment: 92.35% of profit, 12.4% + 2.9%; federal single standard deduction
 * $16,100, 10% to $12,400 and 12% to $50,400; Arizona 2.5% on Arizona AGI less the $16,100 single standard deduction.
 * Social Security income in these plans is untaxed (provisional income under the base amount), so the IRMAA income is 0: the first tier.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));
const SHELL = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');

const cents = (x) => Math.round(x * 100) / 100;
function run(p) {
  const v = validateScenario(structuredClone(p));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}
const at = (r, age) => { const row = r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
const spend = (r, ages) => ages.map((a) => cents(at(r, a).spending));
const issue = (r, code) => (r.issues || []).filter((i) => i && i.code === code);
const vIssues = (p, code) => validateScenario(structuredClone(p)).issues.filter((i) => i.code === code);
const roth = (balance) => L.account('roth', 'rothIRA', balance);

// =====================================================================================================================================
// AA1-25(c): flexibility defaults to off
// =====================================================================================================================================
test('R51 AA1-25(c): the default plan carries no spending flexibility', () => {
  const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
  assert.equal(defaultPlan.retirement.flexibility, 0);   // it was 10
});

// =====================================================================================================================================
// AA1-32: one Medicare date
// =====================================================================================================================================
// One person, retired, health costs on ($12,000 a year before Medicare, 0% growth), living on a Roth (no tax): row `spending` is the
// health cost. A monthly benefit of $1,000 makes the claim count (no benefit entered means Medicare at 65).
function single(o = {}) {
  const p = L.basePlan({ age: o.age ?? 66, retireAge: o.retireAge ?? (o.age ?? 66), endAge: o.endAge ?? 71, healthOn: true, spending: 0, accounts: [roth(2000000)],
    ssBenefit: o.ssBenefit ?? 1000 });
  p.retirement.ssClaim = o.claim ?? 70;
  Object.assign(p.advanced, { healthCost: 12000, healthInflation: 0 }, o.adv || {});
  if (o.medicareStartAge !== undefined) p.profile.medicareStartAge = o.medicareStartAge;
  return p;
}
test('R51 AA1-32: claiming at 70, Medicare starts at 69.5 -- the pre-Medicare cost runs until then, half a year of each in the row 69 -> 70', () => {
  // medicareStartAge = 70 - 0.5 = 69.5. Rows 66->67, 67->68, 68->69: before 69.5, the $12,000 pre-Medicare cost (one person of one).
  // Row 69->70: half a year of each, 0.5 x 12,000 + 0.5 x 3,185.68 = 6,000 + 1,592.84 = 7,592.84. Row 70->71: Medicare, 3,185.68.
  // Before R51 every row from 65 was Medicare: 3,185.68 each.
  assert.deepEqual(spend(run(single()), [67, 68, 69, 70, 71]), [12000, 12000, 12000, 7592.84, 3185.68]);
});
test('R51 AA1-32 controls: a claim at 65, or a later claim with no benefit entered, keeps Medicare at 65', () => {
  // 65 or earlier: Medicare at 65, so every row from 66 is Medicare (3,185.68), as before R51.
  assert.deepEqual(spend(run(single({ claim: 65 })), [67, 68, 69, 70, 71]), [3185.68, 3185.68, 3185.68, 3185.68, 3185.68]);
  // No benefit entered: 65 whatever the claim age.
  assert.deepEqual(spend(run(single({ ssBenefit: 0 })), [67, 68, 69, 70, 71]), [3185.68, 3185.68, 3185.68, 3185.68, 3185.68]);
});
test('R51 AA1-32: an entered Medicare start age is the date for the charge too', () => {
  // profile.medicareStartAge 67 with a claim at 70: row 66->67 is before 67 (12,000), from 67 Medicare (3,185.68).
  assert.deepEqual(spend(run(single({ medicareStartAge: 67, endAge: 69 })), [67, 68, 69]), [12000, 3185.68, 3185.68]);
});
test('R51 AA1-32: in a couple each person starts at their own Medicare date', () => {
  // Self 66 claiming at 65 (Medicare at 65), spouse 66 claiming at 70 (Medicare at 69.5), both retired, MFJ, $1,000 a month each.
  // The $12,000 pre-Medicare cost is the household's for two people: $6,000 a person.
  // Row 66->67: self Medicare 3,185.68 + spouse pre-Medicare 6,000 = 9,185.68 (before R51: 2 x 3,185.68 = 6,371.36).
  // Row 69->70 (spouse 69->70): 3,185.68 + 0.5 x 6,000 + 0.5 x 3,185.68 = 3,185.68 + 3,000 + 1,592.84 = 7,778.52.
  // Row 70->71: two on Medicare, 6,371.36.
  const p = single({ claim: 65 });
  Object.assign(p.profile, { spouseOn: true, spouseAge: 66, filing: 'mfj' });
  Object.assign(p.retirement, { spouseSS: 1000, spouseClaim: 70 });
  assert.deepEqual(spend(run(p), [67, 70, 71]), [9185.68, 7778.52, 6371.36]);
});
test('R51 AA1-32: R43\'s idle spouse is charged Medicare only from the spouse\'s own Medicare date', () => {
  // Self 60 working to 65 on $100,000; spouse 66, no salary, $1,000 a month claimed at 70: Medicare at the spouse's 69.5 = the self's 63.5.
  // The household is not retired before 65, so the only health charge is the idle spouse's Medicare (no pre-Medicare cost in working
  // rows). Rows 60->61, 61->62, 62->63: before 63.5, nothing (before R51: 3,185.68 each, from the spouse's 65).
  // Row 63->64: half a year, 0.5 x 3,185.68 = 1,592.84 (the lookback income is about $100,000, under the $218,000 joint threshold).
  const p = single({ age: 60, retireAge: 65, endAge: 64, ssBenefit: 0 });
  Object.assign(p.profile, { spouseOn: true, spouseAge: 66, filing: 'mfj' });
  Object.assign(p.retirement, { spouseSS: 1000, spouseClaim: 70 });
  Object.assign(p.employment, { salary: 100000, contributionStop: 65 });
  assert.deepEqual(spend(run(p), [61, 62, 63, 64]), [0, 0, 0, 1592.84]);
});
test('R51 AA1-32 control: an idle spouse already past their Medicare start is charged in full, as before', () => {
  // The same household with the spouse claiming at 65: Medicare at 65, so 3,185.68 in each working row.
  const p = single({ age: 60, retireAge: 65, endAge: 62, ssBenefit: 0 });
  Object.assign(p.profile, { spouseOn: true, spouseAge: 66, filing: 'mfj' });
  Object.assign(p.retirement, { spouseSS: 1000, spouseClaim: 65 });
  Object.assign(p.employment, { salary: 100000, contributionStop: 65 });
  assert.deepEqual(spend(run(p), [61, 62]), [3185.68, 3185.68]);
});
test('R51 AA1-32: a spouse who reaches 65 inside a row starts Medicare there, not at the next row', () => {
  // Self 60, spouse 64.5, both retired, no benefit entered (Medicare at 65 for both). Row 60->61 is the spouse's 64.5->65.5:
  // self pre-Medicare 6,000 + spouse 0.5 x 6,000 + 0.5 x 3,185.68 = 6,000 + 3,000 + 1,592.84 = 10,592.84 (before R51 the spouse was on
  // the pre-Medicare cost for the whole row, from an opening age under 65: 12,000). Row 61->62: 6,000 + 3,185.68 = 9,185.68 either way.
  const p = single({ age: 60, endAge: 62, ssBenefit: 0 });
  Object.assign(p.profile, { spouseOn: true, spouseAge: 64.5, filing: 'mfj' });
  assert.deepEqual(spend(run(p), [61, 62]), [10592.84, 9185.68]);
});
test('R51 AA1-32: the IRMAA first-years disclosure and its validator mirror follow the Medicare date', () => {
  // Retired at 66, claiming at 70: Medicare from 69.5, after plan years 0 and 1 (66->67, 67->68), so neither the engine's
  // IRMAA_PRE_PLAN_MAGI_ASSUMED nor the validator's IRMAA_PRIOR_INCOME_BLANK applies (before R51 both did, from 65).
  const late = single();
  assert.equal(issue(run(late), 'IRMAA_PRE_PLAN_MAGI_ASSUMED').length, 0);
  assert.equal(vIssues(late, 'IRMAA_PRIOR_INCOME_BLANK').length, 0);
  // At 68 claiming at 70: plan year 1 is 69->70, which holds 69.5: both apply.
  const near = single({ age: 68, endAge: 71 });
  assert.equal(issue(run(near), 'IRMAA_PRE_PLAN_MAGI_ASSUMED').length, 1);
  assert.equal(vIssues(near, 'IRMAA_PRIOR_INCOME_BLANK').length, 1);
});
test('R51 AA1-32 control: claiming at 65 the IRMAA first-years disclosure and the validator prompt still apply at 66', () => {
  const p = single({ claim: 65 });
  assert.equal(issue(run(p), 'IRMAA_PRE_PLAN_MAGI_ASSUMED').length, 1);
  assert.equal(vIssues(p, 'IRMAA_PRIOR_INCOME_BLANK').length, 1);
});
test('R51 AA1-32: the partial-first-year IRMAA disclosure asks whether plan year 2 holds a Medicare start', () => {
  // Starting at 66.5: plan year 2 is the row 68->69, the one whose surcharge reads the completed first year. Claiming at 70 (Medicare at
  // 69.5) nobody is on Medicare in it: no IRMAA_PARTIAL_FIRST_YEAR_COMPLETED (before R51: 66.5 + 2 >= 65, so it was said).
  assert.equal(issue(run(single({ age: 66.5, endAge: 71 })), 'IRMAA_PARTIAL_FIRST_YEAR_COMPLETED').length, 0);
  // Claiming at 69 (Medicare at 68.5, inside 68->69): said.
  assert.equal(issue(run(single({ age: 66.5, endAge: 71, claim: 69 })), 'IRMAA_PARTIAL_FIRST_YEAR_COMPLETED').length, 1);
});
test('R51 AA1-32: the app says the Medicare start ages set when Medicare costs start, as well as the HSA stop', () => {
  for (const id of ['v2-medicare-start', 'v2-spouse-medicare-start']) {
    const label = SHELL.match(new RegExp('<input[^>]*id="' + id + '"[^>]*><span class="v2-note">([^<]*)</span>'));
    assert.ok(label && /Medicare costs start/.test(label[1]) && /HSA contributions stop/.test(label[1]), id + ': ' + (label && label[1]));
  }
  const pre = SHELL.match(/<input[^>]*id="v2-health-cost"[^>]*>(<span class="v2-note">([^<]*)<\/span>)?/);
  assert.ok(pre && pre[2] && /until (that person's|each person's) Medicare starts/.test(pre[2]), 'pre-Medicare cost note: ' + (pre && pre[0]));
  const rules = SHELL.match(/section\("Medicare and IRMAA",\[\s*"([^\n]*)/)[1];
  assert.match(rules, /Each person's Medicare costs start at their Medicare start/);
});

// =====================================================================================================================================
// AA1-07: the working-years check counts employment and self-employment streams as pay
// =====================================================================================================================================
// Single, 50, working to 55 on a $30,000 salary, $3,000 a month of debt payments ($36,000 a year), no contributions. The salary's pay:
// 30,000 - FICA 2,295 (7.65%) - federal 1,420 ((30,000 - 16,100) = 13,900: 1,240 + 12% x 1,500) - Arizona 347.50 (2.5% x 13,900)
// = 25,937.50, short of 36,000 by 10,062.50 in the first working row.
function working(streams) {
  const p = L.basePlan({ age: 50, retireAge: 55, endAge: 57, salary: 30000, spending: 0, accounts: [roth(100000)] });
  p.advanced.debts = [{ id: 'm', type: 'mortgage', name: 'Mortgage', owner: 'household', balance: 1000000, rate: 0, paymentMonthly: 3000,
    payoffAge: 95, rateType: 'fixed', includePayment: true, includeHousingCosts: false }];
  p.retirement.otherIncomes = (streams || []).map((s, i) => Object.assign({ name: 'stream' + i, owner: 'self', start: 50, end: 55, growth: 0, growthMode: 'fixed' }, s));
  return p;
}
const workingIssue = (p) => issue(run(p), 'WORKING_YEARS_NOT_FUNDED_BY_PAY');
/* R51 addendum (the owner's ruling of 2026-10-03, D3 rejected): the streams' pay is also net of the income tax they add -- federal and
   Arizona -- taken as the salary's is: the wage-only return with the streams added, less the wage-only return (their marginal share).
   The two self-employment cases below were first written to R51's payroll-and-SE-only rule (12,000: funded; 10,000: short 1,475.455);
   they are re-expected by that ruling, not by a derivation error. */
test('R51 AA1-07: an employment stream is pay -- $30,000 salary plus a $40,000 job covers $36,000 of payments', () => {
  // The stream's tax: FICA 7.65% x 40,000 = 3,060; federal on 70,000: (70,000 - 16,100) = 53,900 taxable: 1,240 + 12% x 38,000 = 4,560,
  // + 22% x 3,500 = 770 -> 6,570, less the salary's 1,420 = 5,150; Arizona 2.5% x 53,900 = 1,347.50, less 347.50 = 1,000. Total 9,210.
  // Pay: 25,937.50 + 40,000 - 9,210 = 56,727.50 against 36,000: funded, no warning (before R51: short 10,062.50 from 50).
  assert.equal(workingIssue(working([{ type: 'employment', amount: 40000 }])).length, 0);
});
test('R51 AA1-07: a $12,000 job counts net of its payroll and income tax -- short 720.50', () => {
  // FICA 918; federal on 42,000: 25,900 taxable: 1,240 + 12% x 13,500 = 2,860, less 1,420 = 1,440; Arizona 2.5% x 25,900 = 647.50, less
  // 347.50 = 300. Tax 2,658. Pay: 25,937.50 + 12,000 - 2,658 = 35,279.50; short 720.50 at 50 (net of FICA alone it was funded: 37,019.50).
  const w = workingIssue(working([{ type: 'employment', amount: 12000 }]));
  assert.equal(w.length, 1);
  assert.equal(w[0].state.age, 50);
  assert.ok(Math.abs(w[0].state.shortfall - 720.5) < 0.01, 'short ' + w[0].state.shortfall);
});
test('R51 AA1-07: $12,000 of self-employment profit, net of its SE and income tax, leaves 1,107.47 short', () => {
  // SE tax: 12,000 x 0.9235 = 11,082 x 15.3% = 1,695.546; its deductible half 847.773. Federal: ordinary 42,000 - 847.773 = 41,152.227,
  // less 16,100 = 25,052.227; QBI deduction 20% x (12,000 - 847.773) = 2,230.4454 (under 20% of taxable income and the threshold) ->
  // 22,821.7816 taxable: 1,240 + 12% x 10,421.7816 = 2,490.6138, less 1,420 = 1,070.6138. Arizona (no QBI deduction): 2.5% x 25,052.227
  // = 626.3057, less 347.50 = 278.8057. Tax 1,695.546 + 1,070.6138 + 278.8057 = 3,044.9655. Pay 25,937.50 + 12,000 - 3,044.9655 =
  // 34,892.5345; short 1,107.4655 at 50.
  const w = workingIssue(working([{ type: 'selfEmployment', amount: 12000 }]));
  assert.equal(w.length, 1);
  assert.equal(w[0].state.age, 50);
  assert.ok(Math.abs(w[0].state.shortfall - 1107.4655) < 0.01, 'short ' + w[0].state.shortfall);
});
test('R51 AA1-07: $10,000 of self-employment profit leaves 2,599.97 short', () => {
  // SE tax 9,235 x 15.3% = 1,412.955, half 706.4775. Federal: 40,000 - 706.4775 - 16,100 = 23,193.5225; QBI 20% x 9,293.5225 =
  // 1,858.7045 -> 21,334.818: 1,240 + 12% x 8,934.818 = 2,312.17816, less 1,420 = 892.17816. Arizona 2.5% x 23,193.5225 = 579.83806,
  // less 347.50 = 232.33806. Tax 2,537.47122. Pay 25,937.50 + 10,000 - 2,537.47122 = 33,400.02878; short 2,599.97122 at 50.
  const w = workingIssue(working([{ type: 'selfEmployment', amount: 10000 }]));
  assert.equal(w.length, 1);
  assert.equal(w[0].state.age, 50);
  assert.ok(Math.abs(w[0].state.shortfall - 2599.97122) < 0.01, 'short ' + w[0].state.shortfall);
});
test('R51 AA1-07 controls: with no stream, or a stream that is not pay (rental), the shortfall is the salary\'s, 10,062.50', () => {
  for (const streams of [[], [{ type: 'rental', amount: 40000 }]]) {
    const w = workingIssue(working(streams));
    assert.equal(w.length, 1, JSON.stringify(streams));
    assert.ok(Math.abs(w[0].state.shortfall - 10062.5) < 0.01, JSON.stringify(streams) + ': short ' + w[0].state.shortfall);
  }
});
test('R51 AA1-07: the warning says employment and self-employment streams count as pay', () => {
  const w = workingIssue(working([]));
  assert.match(w[0].message, /employment and self-employment income/);
  assert.doesNotMatch(w[0].message, /outside income/);
  assert.match(w[0].message, /net of the payroll, self-employment and income tax it adds/);   // R51 addendum
});

// =====================================================================================================================================
// R51 addendum (the owner's ruling of 2026-10-03 on R50 section 8 item 2): the optimizer's Roth weight is the cost of the next dollar
// =====================================================================================================================================
// The optimized order ranks the tax classes by score (lower first): taxable 10, preTax 20, roth 34, hsa 48 at the base. At 50 an IRA draw
// bears the 10% (+45: preTax 65). R50's weight added each non-qualified owner's exposed Roth IRA dollars as a share of the Roth class --
// earnings x (30 + 45 while the 10% applies), recent conversions x 45 -- so a Roth IRA of 100,000 holding 50,000 of contribution basis
// scored 34 + 50,000 x 75 / 100,000 = 71.5 and ranked behind the IRA (65). The ruling: the weight is the cost of the NEXT dollar the draw
// takes from the Roth class -- 0 while it is contribution basis (or a conversion's nontaxable part, or a conversion past five years),
// 45 on a conversion's taxable part inside its five years while the 10% applies, 30 + 45 x [10% applies] on earnings, 0 once qualified;
// 0 when the next account in the class's draw order is not a Roth IRA (a Roth 401(k) is modelled tax-free).
// Single, retired at 50, $20,000 a year, 0% return and inflation, no taxable account or HSA: the first class with money pays.
function rothOrder(o) {
  const p = L.basePlan({ age: o.age ?? 50, endAge: (o.age ?? 50) + 2, spending: 20000, order: 'optimized', accounts: o.accounts });
  return run(p);
}
const ira = () => L.account('ira', 'traditionalIRA', 200000);
test('R51 addendum: a Roth IRA whose next dollar is contribution basis costs nothing -- drawn before an early IRA draw', () => {
  // New weight 0 (basis 50,000 comes first): roth 34 < preTax 65. Rows to 51 and 52: the Roth pays 20,000 a year from basis, untaxed:
  // Roth 80,000 then 60,000; the IRA untouched at 200,000; no tax. (R50's share form: 71.5 > 65, so the IRA paid with tax and the 10%.)
  const r = rothOrder({ accounts: [ira(), L.account('roth', 'rothIRA', 100000, { contributionBasis: 50000 })] });
  assert.deepEqual([51, 52].map((a) => cents(at(r, a).roth)), [80000, 60000]);
  assert.deepEqual([51, 52].map((a) => cents(at(r, a).preTax)), [200000, 200000]);
  assert.deepEqual([51, 52].map((a) => cents(at(r, a).taxSettled)), [0, 0]);
});
test('R51 addendum control: a Roth IRA of earnings only costs 30 + 45 -- it stays behind the early IRA draw, as before', () => {
  // No basis entered: the next dollar is earnings, not qualified at 50: 75 (the share form gave 75 too). roth 109 > preTax 65: the IRA pays.
  const r = rothOrder({ accounts: [ira(), L.account('roth', 'rothIRA', 100000, { contributionBasis: 0 })] });
  assert.equal(cents(at(r, 51).roth), 100000);
  assert.ok(at(r, 51).preTax < 200000 - 20000 + 0.005, 'the IRA paid the spending and its tax: ' + at(r, 51).preTax);
});
test('R51 addendum: when the class\'s next account is a Roth 401(k), the next dollar costs nothing as modelled', () => {
  // Roth 401(k) 50,000 at priority 1, Roth IRA 50,000 of earnings at priority 2: the draw order takes the 401(k) first, so the weight is 0
  // (the share form: 50,000 x 75 / 100,000 = 37.5, roth 71.5 > 65, so the IRA paid). Row to 51: the 401(k) pays 20,000 untaxed: 30,000
  // left; the Roth IRA 50,000 and the IRA 200,000 untouched; no tax.
  const r = rothOrder({ accounts: [ira(), L.account('r401', 'roth401k', 50000, { priority: 1 }), L.account('roth', 'rothIRA', 50000, { contributionBasis: 0 })] });
  assert.equal(cents(at(r, 51).roth), 80000);
  assert.equal(cents(at(r, 51).preTax), 200000);
  assert.equal(cents(at(r, 51).taxSettled), 0);
});
test('R51 addendum control: a qualified owner\'s Roth weighs nothing either way -- at 60 the IRA (no 10%) is drawn first', () => {
  // At 60, holding the Roth IRA at the start (its five years taken as run): qualified, weight 0; roth 34 > preTax 20: the IRA pays.
  const r = rothOrder({ age: 60, accounts: [ira(), L.account('roth', 'rothIRA', 100000, { contributionBasis: 0 })] });
  assert.equal(cents(at(r, 61).roth), 100000);
});

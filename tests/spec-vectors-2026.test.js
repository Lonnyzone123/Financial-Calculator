/* S5 task 5 -- the specification vectors, imported as a suite that records what today's engine does with each.
 *
 * fixtures/spec-vectors-2026.fixtures.json holds TAX_RULES_ENGINE_REFERENCE_2026.md section 9.1's golden vectors and
 * 9.3's invariants, ACCOUNT_RULES_ENGINE_REFERENCE_2026.md section 17's test vectors and 18's validation invariants,
 * and task 5.10's three deferred pointers, verbatim with their citations. This file categorises every one against
 * today's engine and fixes nothing (task 5: new files only).
 *
 * The categories were fixed in the run state before any was measured:
 *   PASS         every expected field is reproduced by the engine;
 *   FAIL         the engine takes the vector's facts as input, but at least one expected field is wrong or absent;
 *   UNSUPPORTED  the engine has no input for the vector's facts (the name src/authority-status-vocabulary.json uses).
 * An invariant is PASS when it holds as a property of today's engine, FAIL when the engine takes what the invariant
 * constrains but breaks it, and UNSUPPORTED when it cannot be expressed against today's engine (task 5.6c).
 *
 * A PASS is an ordinary test. A FAIL is a todo test asserting the specification, authorized by name in
 * tools/test-exception-registry.json as a carried residual: the failure stays visible, and the gate refuses it the day
 * it starts passing. An UNSUPPORTED entry states what the engine lacks. The completeness test holds every imported
 * vector, invariant and pointer to exactly one category, and reports task 5's stop-trigger tally.
 *
 * The fixture is read inside each test, so a missing fixture fails each title. Each title is a literal.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SHELL = read('src/app-shell.html');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
const fixtures = () => JSON.parse(read('fixtures/spec-vectors-2026.fixtures.json'));
const vocabulary = () => JSON.parse(read('src/authority-status-vocabulary.json'));
const money = (v) => Math.round(v * 100) / 100;

/* Every imported vector, invariant and pointer: its category and the reason. */
const CATEGORY = {
  'F-ORD-01': ['PASS', 'marginalTax() on the taxable income'],
  'F-CG-01': ['PASS', 'marginalTax() on the ordinary part plus capitalGainsTax() stacked on it'],
  'F-SS-01': ['PASS', 'taxableSocialSecurity(), given other income as provisional income less half the benefits'],
  'F-SEN-01': ['PASS', 'seniorDeduction()'],
  'F-SEN-02': ['PASS', 'seniorDeduction()'],
  'F-NIIT-01': ['PASS', 'estimateTaxes().niit'],
  'F-SE-01': ['PASS', 'estimateTaxes() with each person\'s adjusted self-employment profit (S5 task 7)'],
  'AZ-01': ['UNSUPPORTED', 'the engine subtracts taxable Social Security and applies the 2026 basic deduction and age-65 exemption (S5 task 8), but takes no U.S. obligation interest and no purchase dates for the post-2011 gain subtraction, which the owner\'s answer 5 (C) left unbuilt'],
  'ACCOUNT-17-1': ['UNSUPPORTED', 'the engine takes no workplace-plan coverage and has no traditional-IRA deduction phaseout, only the Roth contribution phaseout'],
  'ACCOUNT-17-2': ['PASS', 'rothCatchupStatus() with the account\'s prior-year FICA wages from its sponsoring employer (S5 task 11)'],
  'ACCOUNT-17-3': ['PASS', 'rmdStartAge() for a 1959 owner, whose row carries PROPOSED_REGULATION and the PROPOSED_RULE_USED warning code (S5 task 5a)'],
  'ACCOUNT-17-4': ['PASS', 'rmdStartAge() for an owner born before July 1949, whose row carries OFFICIAL_2026, the pinned mapping of final_regulation (S5 task 5a)'],
  'ACCOUNT-17-5': ['UNSUPPORTED', 'the engine has no inherited accounts, beneficiaries or post-death distribution rules'],
  'ACCOUNT-17-6': ['UNSUPPORTED', 'the engine has no inherited accounts or spousal beneficiary elections'],
  'ACCOUNT-17-7': ['UNSUPPORTED', 'the engine has no SEP or SIMPLE IRA accounts, no Form 8606 basis, and no pro-rata conversion rule'],
  'ACCOUNT-17-8': ['FAIL', 'auditContributions() reports the unrelated solo 401(k) deferral as 10,000 over the one 402(g) limit, but no section 415(c) employer-group test exists'],
  'ACCOUNT-17-9': ['UNSUPPORTED', 'the engine takes no after-tax 401(k) contributions and computes no section 415(c) room'],
  'ACCOUNT-17-10': ['UNSUPPORTED', 'the engine has no SIMPLE IRA account and no participation date'],
  'ACCOUNT-17-11': ['UNSUPPORTED', 'the engine takes no HSA eligibility months and has no last-month rule'],
  'ACCOUNT-17-12': ['UNSUPPORTED', 'the engine has no 529 accounts'],
  'ACCOUNT-17-13': ['UNSUPPORTED', 'the engine has no 529 accounts or Arizona subtractions'],
  'ACCOUNT-17-14': ['UNSUPPORTED', 'the engine takes no asset acquisition dates and has no Arizona capital-gain subtraction'],
  'ACCOUNT-17-15': ['UNSUPPORTED', 'the engine has no employer-stock basis or net unrealized appreciation'],
  'ACCOUNT-17-16': ['PASS', 'estimateTaxes() with the conversion as ordinary income and the investment income as gains'],
  'ACCOUNT-17-17': ['UNSUPPORTED', 'the engine carries no Arizona IRC conformity date and no conformity warning'],
  'TAX-9.3-1': ['PASS', 'a property of taxableSocialSecurity() over benefits, other income and filing status'],
  'TAX-9.3-2': ['PASS', 'a property of seniorDeduction() over MAGI, ages and filing status'],
  'TAX-9.3-3': ['PASS', 'a property of estimateTaxes().niit over ordinary income, gains and filing status'],
  'TAX-9.3-4': ['PASS', 'a property of estimateTaxes().payroll, less the Medicare part, per person'],
  'TAX-9.3-5': ['PASS', 'a property of marginalTax() at and around every bracket ceiling'],
  'TAX-9.3-6': ['PASS', 'a property of capitalGainsTax() at every capital-gain band threshold'],
  'TAX-9.3-7': ['PASS', 'a property of estimateTaxes(): the engine models no refundable credit, so no liability may fall below zero'],
  'TAX-9.3-8': ['UNSUPPORTED', 'the engine takes no withholding or estimated payments'],
  'TAX-9.3-9': ['PASS', 'a property of runPlan() rows: a QCD lowers MAGI while the required distribution and its shortfall stay as they were'],
  'TAX-9.3-10': ['PASS', 'a property of quoteTaxFunding(), recomputed from scratch with estimateTaxes()'],
  'ACCOUNT-18-1': ['UNSUPPORTED', 'the engine has no retirement-distribution basis, so no taxable and nontaxable portions'],
  'ACCOUNT-18-2': ['UNSUPPORTED', 'the engine has no IRA basis'],
  'ACCOUNT-18-3': ['UNSUPPORTED', 'the engine has no Roth IRA ordering of contributions, conversions and earnings'],
  'ACCOUNT-18-4': ['UNSUPPORTED', 'the engine computes no section 415(c) room'],
  'ACCOUNT-18-5': ['PASS', 'a property of auditContributions(): one owner\'s deferrals share one limit across workplace plans'],
  'ACCOUNT-18-6': ['UNSUPPORTED', 'the engine has no 457 plans'],
  'ACCOUNT-18-7': ['UNSUPPORTED', 'the engine has no rollovers'],
  'ACCOUNT-18-8': ['PASS', 'a property of rmdObligations(): each owner\'s traditional IRAs aggregate into one obligation and every employer plan stands alone, payable only from itself (S5AA task 4.2)'],
  'ACCOUNT-18-9': ['UNSUPPORTED', 'the engine has no beneficiaries and no post-death distribution rules'],
  'ACCOUNT-18-10': ['PASS', 'a property of the RMD rules: the 1959 row carries PROPOSED_REGULATION, never the status final_regulation maps to (S5 task 5a)'],
  'ACCOUNT-18-11': ['UNSUPPORTED', 'the engine has no 529 accounts'],
  'ACCOUNT-18-12': ['UNSUPPORTED', 'the engine has no 529 accounts or Arizona subtractions'],
  'ACCOUNT-18-13': ['PASS', 'a property of estimateTaxes(): net investment income is the gains and qualified dividends alone'],
  'ACCOUNT-18-14': ['UNSUPPORTED', 'the engine has no net unrealized appreciation'],
  'ACCOUNT-18-15': ['UNSUPPORTED', 'the engine has no 457(b) plans'],
  'ACCOUNT-18-16': ['UNSUPPORTED', 'the engine carries no Arizona conformity date'],
  'TASK5-10-CG-CHARACTER': ['UNSUPPORTED', 'the engine takes one capital-gains figure: no collectibles, unrecaptured section 1250 or section 1202 buckets (S5 task 10, deferred to S103)'],
  'TASK5-10-CORRELATION': ['UNSUPPORTED', 'the engine has no calibrated correlation matrix for Monte Carlo (Q45, decided (d): deferred to S103)'],
  'TASK5-10-WITHHOLDING': ['UNSUPPORTED', 'the engine takes no withholding or estimated payments (TAX section 7.1, deferred)'],
};

/* A single retiree for estimateTaxes(): nothing but filing status and ages is read. */
const person = (filing, age, spouseAge) => ({ profile: { filing, age, spouseOn: spouseAge !== undefined, spouseAge: spouseAge === undefined ? age : spouseAge } });
const FILINGS = ['single', 'mfj', 'hoh'];

test('spec vectors: every imported vector, invariant and deferred pointer carries exactly one category and its reason', (t) => {
  const f = fixtures();
  const ids = [
    ...f.taxGolden.filter((v) => !v.skipped).map((v) => v.id),
    ...f.accountVectors.map((v) => v.id),
    ...f.taxInvariants.map((v) => v.id),
    ...f.accountInvariants.map((v) => v.id),
    ...f.deferredPointers.map((v) => v.id),
  ];
  assert.deepEqual([...ids].sort(), Object.keys(CATEGORY).sort(), 'the categorised set is exactly the imported set');
  const statuses = vocabulary().values.map((v) => v.status);
  for (const [id, [cat, why]] of Object.entries(CATEGORY)) {
    assert.ok(f.categories.includes(cat), id + ': ' + cat + ' is a fixture category');
    assert.ok(cat !== 'UNSUPPORTED' || statuses.includes(cat), 'UNSUPPORTED is the pinned vocabulary\'s value');
    assert.ok(typeof why === 'string' && why.length > 15, id + ': the category states its reason');
  }
  assert.deepEqual(f.taxGolden.filter((v) => v.skipped).map((v) => v.id), ['F-AMT-01', 'F-SALT-01'], 'task 5.3: the two recorded skips');
  const vectors = ids.filter((id) => /^(F-|AZ-|ACCOUNT-17-)/.test(id));
  const tally = (list) => list.reduce((o, id) => { o[CATEGORY[id][0]] = (o[CATEGORY[id][0]] || 0) + 1; return o; }, {});
  const v = tally(vectors);
  t.diagnostic('vectors: ' + JSON.stringify(v) + '; invariants: ' + JSON.stringify(tally(ids.filter((id) => /^(TAX-9\.3|ACCOUNT-18)-/.test(id)))) + '; deferred pointers: ' + JSON.stringify(tally(ids.filter((id) => /^TASK5-10-/.test(id)))));
  t.diagnostic('task 5 stop trigger (UNSUPPORTED > FAIL among vectors): ' + ((v.UNSUPPORTED || 0) > (v.FAIL || 0) ? 'FIRES' : 'does not fire'));
});

/* ---- TAX section 9.1 ---- */

test('spec vector F-ORD-01 (TAX §9.1): single, $40,000 ordinary taxable income, federal ordinary tax $4,552.00', () => {
  assert.equal(money(engine.marginalTax(40000, 'single')), 4552);
});

test('spec vector F-CG-01 (TAX §9.1): single, $40,000 ordinary and $40,000 qualified, $9,450 at 0% and $30,550 at 15%, regular tax $9,134.50', () => {
  const cg = engine.capitalGainsTax(40000, 40000, 'single');
  assert.equal(money(cg), money(9450 * 0 + 30550 * 0.15));
  assert.equal(money(engine.marginalTax(40000, 'single') + cg), 9134.5);
});

test('spec vector F-SS-01 (TAX §9.1): single, $30,000 benefits, provisional income $35,000, taxable Social Security $5,350', () => {
  assert.equal(money(engine.taxableSocialSecurity(30000, 35000 - 30000 / 2, 'single')), 5350);
});

test('spec vector F-SEN-01 (TAX §9.1): single, eligible, senior MAGI $125,000, enhanced senior deduction $3,000', () => {
  assert.equal(money(engine.seniorDeduction(125000, [65, -1], 'single')), 3000);
});

test('spec vector F-SEN-02 (TAX §9.1): MFJ, both eligible, senior MAGI $200,000, enhanced senior deduction $6,000 total', () => {
  assert.equal(money(engine.seniorDeduction(200000, [65, 65], 'mfj')), 6000);
});

test('spec vector F-NIIT-01 (TAX §9.1): single, NIIT MAGI $210,000, NII $50,000, NIIT $380', () => {
  const r = engine.estimateTaxes(person('single', 60), 60, 160000, 50000, 0, 0, 0, 0);
  assert.equal(money(r.magi), 210000, 'the MAGI the vector names');
  assert.equal(money(r.niit), 380);
});

test('spec vector F-SE-01 (TAX §9.1): no wages, adjusted SE profit $100,000, net earnings $92,350, SE tax $14,129.55', () => {
  const r = engine.estimateTaxes(person('single', 45), 45, 100000, 0, 0, 0, 0, 0, 100000, 0);
  assert.equal(money(r.seNetEarnings), 92350, 'net earnings');
  assert.equal(money(r.seSocialSecurity), 11451.4, 'OASDI');
  assert.equal(money(r.seMedicare), 2678.15, 'Medicare');
  assert.equal(money(r.seTax), 14129.55, 'total SE tax');
});

/* ---- ACCOUNT section 17 ---- */

test('spec vector ACCOUNT-17-16 (ACCOUNT §17, Test 16): a $50,000 Roth conversion raises MAGI to $240,000 but not NII, NIIT $1,140', () => {
  const threshold = RULES.federal.niit.threshold.single;
  const before = engine.estimateTaxes(person('single', 60), 60, 160000, 30000, 0, 0, 0, 0);
  const after = engine.estimateTaxes(person('single', 60), 60, 160000 + 50000, 30000, 0, 0, 0, 0);
  assert.equal(money(before.magi), 190000, 'pre_conversion_magi');
  assert.equal(money(after.magi), 240000, 'post_conversion_magi');
  assert.equal(money(after.magi - threshold), 40000, 'niit_magi_excess');
  assert.equal(money(Math.min(30000, after.magi - threshold)), 30000, 'niit_base');
  assert.equal(money(after.niit), 1140, 'niit');
  assert.ok(after.niit <= RULES.federal.niit.rate * 30000 + 1e-9, 'conversion_in_nii 0: the conversion adds nothing to the base');
});

test('spec vector ACCOUNT-17-2 (ACCOUNT §17, Test 2): $175,000 of prior-year FICA wages from the sponsoring 401(k) employer, age 55, a plan offering Roth: the Roth catch-up rule is statutorily effective, the final regulations are not mandatorily applicable, good-faith operation is allowed, threshold $150,000', () => {
  const s = engine.rothCatchupStatus({ type: 'traditional401k', priorYearFicaWages: 175000 });
  assert.equal(s.catchupRothRuleStatutorilyEffective, true);
  assert.equal(s.finalRegulationsMandatorilyApplicable, false);
  assert.equal(s.reasonableGoodFaithOperation, true);
  assert.equal(s.wageThreshold, 150000);
  assert.equal(s.required, true, 'the wages exceed the threshold');
});

test('spec vector ACCOUNT-17-3 (ACCOUNT §17, Test 3): a 1959 owner projects RMD age 73 with a proposed-regulation status and PROPOSED_RULE_USED', () => {
  assert.equal(engine.rmdStartAge({ profile: { age: 2026 - 1959 } }), 73, 'projected_rmd_age');
  const rmd = RULES.retirement.rmd;
  assert.equal(rmd.startAge.records.find((r) => r.provision_id === 'rmd_start_age_born_1959').status, 'PROPOSED_REGULATION', 'authority_status, in the pinned vocabulary');
  assert.equal(rmd.birth1959WarningCode, 'PROPOSED_RULE_USED', 'warning');
});

test('spec vector ACCOUNT-17-4 (ACCOUNT §17, Test 4): an owner born before July 1949 has RMD age 70.5', () => {
  assert.equal(engine.rmdStartAge({ profile: { age: 2026 - 1949 } }), 70.5, 'rmd_age');
  assert.equal(RULES.retirement.rmd.startAge.records.find((r) => r.provision_id === 'rmd_start_age_born_before_july_1949').status, vocabulary().accountMapping.final_regulation, 'authority_status final_regulation, as the pinned vocabulary maps it');
});

test('spec vector ACCOUNT-17-8 (ACCOUNT §17, Test 8): an unrelated solo 401(k) deferral is 402(g) excess, and 415(c) is tested per employer group', { todo: 'FAIL, carried: the 402(g) excess is reported, but no section 415(c) employer-group test exists' }, () => {
  const account = (o) => Object.assign({ owner: 'self', type: 'traditional401k', taxClass: 'preTax', balance: 0, basisPct: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 }, o);
  const p = { profile: { age: 45, filing: 'single', spouseOn: false, spouseAge: 45 }, accounts: [account({ id: 'day', contribution: 24500, priority: 1 }), account({ id: 'solo', contribution: 10000, priority: 2, profitShare: 7.5 })] };
  const out = engine.auditContributions(p, 45, 200000, 0, null);
  assert.equal(out.items.reduce((s, i) => s + i.excess, 0), 10000, 'excess_402g_deferral');
  assert.ok(out.items.every((i) => typeof i.section415cRoom === 'number'), 'separate_415c_employer_group_test');
});

/* ---- TAX section 9.3 ---- */

test('spec invariant TAX-9.3-1 (TAX §9.3): 0 <= taxable Social Security <= 85% of benefits', () => {
  for (const filing of FILINGS) for (let b = 0; b <= 60000; b += 2500) for (let o = 0; o <= 300000; o += 7500) {
    const t = engine.taxableSocialSecurity(b, o, filing);
    assert.ok(t >= 0 && t <= 0.85 * b + 1e-9, filing + ' benefits ' + b + ' other ' + o + ': ' + t);
  }
});

test('spec invariant TAX-9.3-2 (TAX §9.3): 0 <= senior deduction <= $6,000 per eligible person', () => {
  const agesSets = [[64, -1], [65, -1], [65, 64], [65, 70]];
  for (const filing of FILINGS) for (const ages of agesSets) for (let m = 0; m <= 400000; m += 2500) {
    const eligible = ages.filter((a) => a >= 65).length;
    const d = engine.seniorDeduction(m, ages, filing);
    assert.ok(d >= 0 && d <= 6000 * eligible + 1e-9, filing + ' ' + JSON.stringify(ages) + ' MAGI ' + m + ': ' + d);
  }
});

test('spec invariant TAX-9.3-3 (TAX §9.3): 0 <= NIIT <= 3.8% of net investment income', () => {
  for (const filing of FILINGS) for (let o = 0; o <= 400000; o += 25000) for (let g = 0; g <= 150000; g += 10000) for (const q of [0, 5000]) {
    const r = engine.estimateTaxes(person(filing, 60), 60, o, g, 0, 0, q, 0);
    assert.ok(r.niit >= 0 && r.niit <= 0.038 * Math.max(0, g + q) + 1e-9, filing + ' ordinary ' + o + ' gains ' + g + ' dividends ' + q + ': ' + r.niit);
  }
});

test('spec invariant TAX-9.3-4 (TAX §9.3): employee Social Security tax never exceeds 6.2% of the wage base per person', () => {
  const pr = RULES.federal.payroll;
  for (const filing of FILINGS) for (const wages of [0, 50000, 184500, 184501, 250000, 600000]) for (const spouseWages of [0, 100000, 400000]) {
    if (filing !== 'mfj' && spouseWages) continue;
    const total = wages + spouseWages;
    const r = engine.estimateTaxes(person(filing, 45, filing === 'mfj' ? 45 : undefined), 45, total, 0, 0, total, 0, spouseWages);
    const medicare = total * pr.medicareEmployee + Math.max(0, total - pr.additionalThreshold[filing]) * pr.additionalMedicare;
    const oasdi = r.payroll - medicare;
    const people = spouseWages > 0 ? 2 : 1;
    assert.ok(oasdi <= pr.oasdiEmployee * pr.oasdiWageBase * people + 0.005, filing + ' wages ' + wages + '/' + spouseWages + ': ' + oasdi);
  }
});

test('spec invariant TAX-9.3-5 (TAX §9.3): ordinary bracket tax is continuous and nondecreasing', () => {
  for (const filing of FILINGS) {
    const edges = (RULES.federal.ordinaryBrackets[filing] || []).map((b) => (Array.isArray(b) ? b[0] : b && (b.upTo || b.max || b.limit))).filter((x) => Number.isFinite(x));
    assert.ok(edges.length >= 5, filing + ': the bracket ceilings are read');
    let prev = -1;
    for (let x = 0; x <= 800000; x += 500) { const tax = engine.marginalTax(x, filing); assert.ok(tax >= prev - 1e-9, filing + ' decreases at ' + x); prev = tax; }
    for (const e of edges) assert.ok(Math.abs(engine.marginalTax(e + 0.01, filing) - engine.marginalTax(e - 0.01, filing)) <= 0.01, filing + ' jumps at ' + e);
  }
});

test('spec invariant TAX-9.3-6 (TAX §9.3): preferential-income tax is continuous at the 0% and 15% thresholds', () => {
  for (const filing of FILINGS) {
    const edges = (RULES.federal.capitalGains[filing] || []).map((b) => (Array.isArray(b) ? b[0] : b && (b.upTo || b.max || b.limit))).filter((x) => Number.isFinite(x));
    assert.ok(edges.length >= 2, filing + ': the capital-gain band thresholds are read');
    for (const edge of edges.slice(0, 2)) for (const ordinary of [0, 20000]) {
      if (edge - ordinary <= 1) continue;
      const g = edge - ordinary;
      assert.ok(Math.abs(engine.capitalGainsTax(g + 0.01, ordinary, filing) - engine.capitalGainsTax(g - 0.01, ordinary, filing)) <= 0.01, filing + ' jumps at ' + edge + ' over ordinary ' + ordinary);
    }
  }
});

test('spec invariant TAX-9.3-7 (TAX §9.3): no jurisdiction\'s liability falls below zero, with no refundable credit modelled', () => {
  for (const filing of FILINGS) for (let o = 0; o <= 300000; o += 20000) for (const g of [0, 30000]) for (const s of [0, 40000]) {
    const r = engine.estimateTaxes(person(filing, 70), 70, o, g, s, 0, 0, 0);
    for (const k of ['federal', 'niit', 'payroll', 'az', 'total']) assert.ok(r[k] >= 0, filing + ' ' + k + ' at ordinary ' + o + ' gains ' + g + ' benefits ' + s + ': ' + r[k]);
  }
});

test('spec invariant TAX-9.3-9 (TAX §9.3): a QCD lowers taxable income without lowering the amount credited toward the RMD', () => {
  const plan = (qcd) => {
    const p = JSON.parse(JSON.stringify(defaultPlan));
    p.setupComplete = true;
    Object.assign(p.profile, { age: 75, retireAge: 60, endAge: 78, spouseOn: false, filing: 'single' });
    Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
    Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
    Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 30000, ssBenefit: 0, spouseSS: 0, pension: 0, otherIncomes: [], stages: [], expenses: [], dividendOn: false });
    Object.assign(p.advanced, { rmdOn: true, qcd, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
    p.accounts = [{ id: 'ira', name: 'IRA', owner: 'self', type: 'traditionalIRA', taxClass: 'preTax', balance: 1000000, basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }];
    return p;
  };
  const without = engine.runPlan(plan(0));
  const withQcd = engine.runPlan(plan(5000));
  assert.equal(without.status, 'ok');
  assert.equal(withQcd.status, 'ok');
  const a = without.rows[1], b = withQcd.rows[1];
  assert.ok(a.rmd > 5000, 'the required distribution exceeds the QCD');
  assert.equal(money(b.rmd), money(a.rmd), 'the required distribution is the same');
  assert.equal(money(b.rmdUnmet || 0), money(a.rmdUnmet || 0), 'the QCD is credited toward it: nothing more is unmet');
  assert.ok(b.magi < a.magi && a.magi - b.magi <= 5000 + 1, 'MAGI falls by at most the QCD: ' + a.magi + ' -> ' + b.magi);
});

test('spec invariant TAX-9.3-10 (TAX §9.3): a tax-funding quote reconciles the cash raised to the spending gap plus the tax it causes', () => {
  const p = { profile: { filing: 'single', age: 64, spouseOn: false, spouseAge: 64 }, retirement: { withdrawalOrder: 'priority', manualOrder: 'taxable,preTax,roth,hsa' }, advanced: { assetsOn: false, reserveOn: false, penaltyException: false, rule55: false } };
  const cases = [
    [['taxable'], [{ id: 'a', taxClass: 'taxable', balance: 100, basisPct: 100, priority: 1 }, { id: 'b', taxClass: 'taxable', balance: 100000, basisPct: 0, priority: 2 }]],
    [['preTax'], [{ id: 'ira', taxClass: 'preTax', balance: 1000000, basisPct: 0, priority: 1 }]],
  ];
  for (const [order, accounts] of cases) {
    const T0 = engine.estimateTaxes(p, 64, 80000, 0, 0, 0, 0, 0).total;
    const taxCtx = { ordinaryIncome: 80000, capitalGains: 0, qualifiedDividends: 0, ssBenefit: 0, filing: 'single', seniorAges: [64, -1], Tbase: T0 - 1000, payrollConst: 0, penalties: 0, penaltyApplies: false };
    const quote = engine.quoteTaxFunding(taxCtx, order, accounts, p, 0, 0);
    assert.equal(quote.status, 'funded', order + ': funded');
    const raised = quote.transactions.reduce((s, t) => s + t.gross, 0);
    const real = engine.estimateTaxes(p, 64, quote.finalOrdinaryIncome, quote.finalCapitalGains, 0, 0, 0, 0).total;
    const obligation = Math.max(0, real - taxCtx.Tbase) + quote.finalPenalties;
    assert.ok(Math.abs(raised - obligation) <= 0.01, order + ': raised ' + raised + ', obligation ' + obligation);
  }
});

/* ---- ACCOUNT section 18 ---- */

test('spec invariant ACCOUNT-18-5 (ACCOUNT §18): employee deferrals share one 402(g) limit across unrelated employers', () => {
  const account = (o) => Object.assign({ owner: 'self', type: 'traditional401k', taxClass: 'preTax', balance: 0, basisPct: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 }, o);
  for (const [x, y] of [[24500, 10000], [10000, 24500], [15000, 15000], [30000, 0]]) {
    const p = { profile: { age: 45, filing: 'single', spouseOn: false, spouseAge: 45 }, accounts: [account({ id: 'one', contribution: x, priority: 1 }), account({ id: 'two', contribution: y, priority: 2 })] };
    const out = engine.auditContributions(p, 45, 200000, 0, null);
    const allowed = out.items.reduce((s, i) => s + i.allowed, 0);
    assert.ok(allowed <= engine.contributionLimit('workplace', 45, 'single') + 1e-9, x + '/' + y + ': allowed ' + allowed);
  }
});

/* PROMOTED IN S5AA TASK 4.2 (Q90), with its registry entry removed in the same commit. It was carried as a todo from
   S5 task 5, and its release condition was written there: "the test passes: remove its todo marker and this entry in
   that commit". While it was carried it asserted only the SHAPE -- that rmdFor() returns an object -- because that was
   the smallest thing the specification implied and the engine returned a number. Now that the obligations exist the
   invariant itself is assertable, so it is asserted: two plans of equal value owe equal amounts, and neither owes the
   other's. The shape check stays as the first assertion, because the object contract is what makes the rest
   expressible at all. */
test('spec invariant ACCOUNT-18-8 (ACCOUNT §18): an IRA\'s required distribution is never satisfied from a 401(k), or the reverse', () => {
  const p = { profile: { age: 75 }, advanced: { rmdOn: true } };
  const accounts = [{ id: 'ira', owner: 'self', type: 'traditionalIRA', taxClass: 'preTax', balance: 500000 }, { id: 'k', owner: 'self', type: 'traditional401k', taxClass: 'preTax', balance: 500000 }];
  const rmd = engine.rmdFor(accounts, 75, p);
  assert.equal(typeof rmd, 'object', 'the required distribution is computed per plan, so an IRA\'s cannot be taken from a 401(k)');

  const divisor = RULES.retirement.rmd.uniformLifetime['75'];
  assert.equal(rmd.obligations.length, 2, 'two plans, two obligations -- not one pooled figure');
  const byId = Object.fromEntries(rmd.obligations.map((o) => [o.accounts.map((a) => a.id).join('+'), o]));
  assert.ok(Math.abs(byId.ira.amount - 500000 / divisor) < 1e-9, 'the IRA owes its own balance over the divisor');
  assert.ok(Math.abs(byId.k.amount - 500000 / divisor) < 1e-9, 'and the 401(k) owes its own, separately');
  for (const o of rmd.obligations) {
    assert.equal(o.accounts.length, 1, 'each obligation names the accounts it may be paid from, and neither names the other');
    assert.equal(o.owner, 'self');
  }
  assert.deepEqual(byId.ira.accounts.map((a) => a.id), ['ira'], 'the IRA\'s distribution is payable from the IRA alone');
  assert.deepEqual(byId.k.accounts.map((a) => a.id), ['k'], 'and the 401(k)\'s from the 401(k) alone');
});

test('spec invariant ACCOUNT-18-10 (ACCOUNT §18): a 1959 owner never receives the final-regulation status for the proposed age-73 row', () => {
  const row = RULES.retirement.rmd.startAge.records.find((r) => r.provision_id === 'rmd_start_age_born_1959');
  assert.equal(engine.rmdStartAge({ profile: { age: 2026 - 1959 } }), row.value, 'the proposed age-73 row');
  assert.equal(row.status, 'PROPOSED_REGULATION');
  assert.notEqual(row.status, vocabulary().accountMapping.final_regulation, 'never the status final_regulation maps to');
});

test('spec invariant ACCOUNT-18-13 (ACCOUNT §18): NIIT never includes a retirement-plan distribution itself', () => {
  for (const filing of FILINGS) for (const distribution of [0, 50000, 250000, 1000000]) {
    const none = engine.estimateTaxes(person(filing, 70), 70, 100000 + distribution, 0, 0, 0, 0, 0);
    assert.equal(none.niit, 0, filing + ': with no investment income, a ' + distribution + ' distribution adds no NIIT');
    const some = engine.estimateTaxes(person(filing, 70), 70, 100000 + distribution, 20000, 0, 0, 0, 0);
    assert.ok(some.niit <= 0.038 * 20000 + 1e-9, filing + ': NIIT stays within 3.8% of the investment income alone');
  }
});

/* S5RR-01 (the 2026-09-16 re-audit of S5's repair round; the owner's answer 2 (A) of 2026-09-16, third set): a QCD's exclusion
 * must be paid from the eligible owner's own traditional IRA, through the public entry point.
 *
 * S5R-02's repair split the exclusion by owner, but the required distribution was then withdrawn from pre-tax accounts in
 * the household's order. A 401(k) listed first paid a $100,000 "IRA" QCD, and one spouse's IRA paid both spouses'
 * $161,000. Decided: each owner's part is paid first, from that owner's own traditional IRAs, counts toward the RMD, and
 * the exclusion is what was paid; S5R-02's split and caps are unchanged.
 *
 * The result rows carry no per-account balance, so this file reads the source through a consequence the rule fixes: the
 * NEXT row's exclusion depends on what each owner's IRA holds after the first row. Every expected figure is derived here
 * from the rule and the RMD divisors, not measured: row 1's RMD is the pre-tax total over the age-80 divisor; each
 * eligible owner's part is min($111,000, request x owner's IRA / eligible owners' IRAs, owner's IRA); the parts are paid
 * from those IRAs; the rest of the RMD comes from pre-tax accounts in priority order; row 2 applies the same rule to the
 * balances left. Fixtures: zero returns, fees and inflation; no salary, benefits or pension; dividends on at a 0% yield,
 * so retained cash earns no imputed dividend; manual order, so pre-tax accounts are drawn in their listed priority.
 *
 * ================== S5AA TASK 4.2 (Q90): HOW THIS FILE MEASURES, AND WHY THE MEASUREMENT HAD TO CHANGE
 *
 * TWO THINGS MOVED, AND NEITHER OF THEM IS A CLAIM. Task 4.2 made the required distribution PER OWNER AND PER PLAN, so
 * a QCD from an IRA no longer discharges a 401(k)'s obligation.
 *
 * 1. THE HOUSEHOLD NOW DISTRIBUTES MORE, so a MAGI difference is no longer the exclusion. This file used to read the
 *    exclusion as `MAGI without the request - MAGI with it`, and said so in as many words: "both plans withdraw the same
 *    RMD from the same pre-tax total, so the RMDs match and the difference is the amount excluded". THAT PREMISE IS
 *    GONE. A $100,000 QCD from a $100,000 IRA beside a $5.9M 401(k) now discharges only the IRA's own $4,950.50
 *    obligation; the 401(k) still distributes its $292,079.21, so the household distributes $392,079.21 where it used to
 *    distribute $297,029.70. The MAGI difference collapses to $4,950.50 while the exclusion is still $100,000.
 *
 *    THE EXCLUSION IS STILL EXACTLY RECOVERABLE, from two fields the rows already carry:
 *
 *        excluded = (rmdDistributed with - rmdDistributed without) + (MAGI without - MAGI with)
 *
 *    -- what the household additionally distributed, plus what stopped being taxable. Every expected exclusion below is
 *    the figure this file always asserted, unchanged, with the two exceptions called out at their own tests.
 *
 *    HOW MUCH OF THE REQUIREMENT THE GIFT SATISFIED is the quantity task 4.2 actually changed, so it is asserted too,
 *    as `discharged`. It is read within ONE run, as `rmd - magi`, for the reason given at run() below.
 *
 * 2. A CASH ACCOUNT NOW COVERS SPENDING. The fixtures spend $10,000 a year, which used to come out of the RMD cash in
 *    both plans. Once the two plans distribute different amounts they retain different amounts, and a plan short of cash
 *    sells pre-tax assets -- ordinary income that has nothing to do with the QCD. In the ineligible-spouse fixture it
 *    drove a real $4,950.50 difference to exactly zero, which would have read as "no exclusion" and is not. A taxable
 *    account at 100% basis is listed first (the default manual order is taxable, preTax, roth, hsa), so spending and
 *    taxes never reach a pre-tax account and never create a dollar of gain. An instrument, not a claim.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(ROOT, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
const CAP = 111000;
const D80 = RULES.retirement.rmd.uniformLifetime['80'];
const D81 = RULES.retirement.rmd.uniformLifetime['81'];
const CASH = 2000000;

/* RE-FIXTURED BY INTENT at S5AA R35 (SA32F-08): with a spouse more than ten years younger as sole beneficiary, the divisor is now Table II
   (26 CFR 1.401(a)(9)-5(c)(2)). This file tests something else, on Uniform-table amounts, so its accounts name the spouse as NOT the sole
   beneficiary (spouseSoleBeneficiary: false) and every expectation stands. Table II has its own test file. */
const account = (id, owner, type, balance) => ({ id, name: id, owner, type, taxClass: 'preTax', spouseSoleBeneficiary: false, balance, basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 });
const ira = (id, owner, balance) => account(id, owner, 'traditionalIRA', balance);
const k401 = (balance) => account('k401', 'self', 'traditional401k', balance);
/* 100% basis, so nothing it sells is a gain and nothing it holds is income. Header note 2. */
const cash = () => Object.assign(account('cash', 'self', 'brokerage', CASH), { taxClass: 'taxable', basisPct: 100 });

function plan({ age = 80, spouseAge = null, qcd, accounts, returnRate = 0, timing = 'monthly' }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const spouse = spouseAge !== null;
  Object.assign(p.profile, { age, retireAge: 60, endAge: Math.floor(age) + 3, spouseOn: spouse, spouseAge: spouse ? spouseAge : age, filing: spouse ? 'mfj' : 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: timing });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 10000, ssBenefit: 0, spouseSS: 0, pension: 0, otherIncomes: [], stages: [], expenses: [], dividendOn: true, dividendYield: 0, withdrawalOrder: 'manual' });
  Object.assign(p.advanced, { rmdOn: true, qcd, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [cash()].concat(accounts).map((a, i) => Object.assign({}, a, { priority: i + 1 }));
  return p;
}
function run(opts) {
  const withQcd = engine.runPlan(plan(opts));
  const without = engine.runPlan(plan(Object.assign({}, opts, { qcd: 0 })));
  assert.equal(withQcd.status, 'ok', JSON.stringify(withQcd.issues || []));
  assert.equal(without.status, 'ok', JSON.stringify(without.issues || []));
  /* `discharged` is read WITHIN ONE RUN, as that row's required distribution minus its taxable income. A
     cross-run MAGI difference is the right numerator for the exclusion identity above, but it is NOT the
     discharge from row 2 onward: by then the two plans hold different balances, so they owe different
     amounts and the difference mixes the discharge with the gap between the two bases. In these fixtures
     the only ordinary income in a row is the required distribution, so `rmd - magi` is the discharge
     exactly, in whichever plan it is read from. */
  const discharged = [1, 2].map((k) => withQcd.rows[k].rmd - withQcd.rows[k].magi);
  const extra = [1, 2].map((k) => withQcd.rows[k].rmdDistributed - without.rows[k].rmdDistributed);
  const magiDrop = [1, 2].map((k) => without.rows[k].magi - withQcd.rows[k].magi);
  return { withQcd, without, discharged, excluded: [0, 1].map((i) => extra[i] + magiDrop[i]) };
}
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) <= 1, what + ': got ' + actual + ', expected ' + expected);
/* The rule for one row: parts per owner [self, spouse] from IRA balances, each owner eligible or not. */
const parts = (request, iras, eligible) => {
  const base = iras.reduce((s, b, i) => s + (eligible[i] ? b : 0), 0);
  return iras.map((b, i) => (eligible[i] && b > 0 && base > 0 ? Math.min(CAP, request * b / base, b) : 0));
};
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

test('S5RR-01: a 401(k) listed first does not pay the IRA owner\'s QCD -- the $100,000 is paid from the IRA, so the next row has nothing left to exclude', () => {
  const { excluded, discharged } = run({ qcd: 150000, accounts: [k401(5900000), ira('ira', 'self', 100000)] });
  near(excluded[0], 100000, 'row 1: min($111,000, $150,000, the $100,000 IRA)');
  near(excluded[1], 0, 'row 2: the IRA paid row 1\'s QCD and is empty (the RMD from the 401(k) left the IRA whole and excluded $100,000 again)');
  /* Q90: the $100,000 is paid and excluded in full, but it satisfies only the IRA's OWN obligation -- $100,000 over the
     age-80 divisor -- because the 401(k) beside it must still distribute its own. */
  near(discharged[0], 100000 / D80, 'row 1 discharges only the IRA\'s share of the required distribution');
  near(discharged[1], 0, 'row 2: the IRA is empty, so there is no IRA obligation left for a QCD to discharge');
});

test('control: an IRA listed first pays the QCD either way, and is empty for row 2', () => {
  const { excluded, discharged } = run({ qcd: 150000, accounts: [ira('ira', 'self', 100000), k401(5900000)] });
  near(excluded[0], 100000, 'row 1');
  near(excluded[1], 0, 'row 2');
  /* The order invariance IS S5RR-01's claim, so it is pinned as a figure and not only as a shape. */
  near(discharged[0], 100000 / D80, 'row 1, identical to the 401(k)-first order above');
  near(discharged[1], 0, 'row 2, likewise');
});

test('S5RR-01: spouses 80 with IRAs behind a 401(k) -- each spouse\'s IRA pays that spouse\'s part, so row 2 excludes only what the self IRA still holds', () => {
  const { excluded, discharged } = run({ spouseAge: 80, qcd: 200000, accounts: [k401(5800000), ira('ira-self', 'self', 150000), ira('ira-spouse', 'spouse', 50000)] });
  const row1 = parts(200000, [150000, 50000], [true, true]);
  near(excluded[0], sum(row1), 'row 1: $111,000 + $50,000');
  const row2 = parts(200000, [150000 - row1[0], 50000 - row1[1]], [true, true]);
  near(excluded[1], sum(row2), 'row 2: the self IRA holds $39,000 and the spouse IRA nothing (both IRAs untouched excluded $161,000 again)');
  /* Q90: what the $161,000 discharges is the two IRA obligations and nothing of the 401(k)'s. */
  near(discharged[0], 150000 / D80 + 50000 / D80, 'row 1: both IRA obligations, neither the 401(k)\'s');
  near(discharged[1], 39000 / D81, 'row 2: only the self IRA is left to owe anything, and the $39,000 covers it');
});

for (const [order, accounts] of [
  ['self IRA first', [ira('ira-self', 'self', 4500000), ira('ira-spouse', 'spouse', 1500000)]],
  ['spouse IRA first', [ira('ira-spouse', 'spouse', 1500000), ira('ira-self', 'self', 4500000)]],
]) {
  test('S5RR-01: unequal spouses, both 80, $4.5M and $1.5M IRAs, ' + order + ' -- both IRAs pay their owner\'s part, and the rest of the RMD comes from the first', () => {
    const { excluded, discharged } = run({ spouseAge: 80, qcd: 200000, accounts });
    const row1 = parts(200000, [4500000, 1500000], [true, true]);
    near(excluded[0], sum(row1), 'row 1: $111,000 + $50,000');
    /* Q90 CHANGED THIS FIGURE, AND THE CHANGE IS THE REPAIR. Row 2 used to depend on the listing order -- $161,850.69
       with the self IRA first, $157,080.21 with the spouse's -- because ONE IRA paid the whole household RMD, so the two
       orders left different balances behind. Each IRA now pays its own obligation, the orders leave the same balances,
       and row 2 is $161,000 either way. An order-dependent expectation was the defect's own fingerprint. */
    near(excluded[1], 161000, 'row 2: the same $161,000, and the SAME in both orders now that neither IRA pays the other\'s');
    near(discharged[0], sum(row1), 'row 1: each part sits inside its own owner\'s obligation, so all of it is discharged');
    near(discharged[1], 161000, 'row 2: likewise');
  });
}

test('S5RR-01: two IRAs of one owner give one cap, paid from both in order', () => {
  const { excluded, discharged } = run({ qcd: 300000, accounts: [k401(5800000), ira('ira-a', 'self', 100000), ira('ira-b', 'self', 100000)] });
  near(excluded[0], 111000, 'row 1: one $111,000 cap for $200,000 of IRAs');
  near(excluded[1], 89000, 'row 2: $89,000 left in the second IRA (untouched IRAs excluded $111,000 again)');
  /* The $89,000 is what proves the second IRA paid: the cap took $100,000 from the first and $11,000 from the second. */
  near(discharged[0], 200000 / D80, 'row 1: the owner\'s two IRAs AGGREGATE into one obligation, and $111,000 covers it');
  near(discharged[1], 89000 / D81, 'row 2: the $89,000 left is the whole of the aggregated obligation');
});

test('S5RR-01: an ineligible spouse\'s IRA does not pay the eligible owner\'s QCD, even listed first', () => {
  const { excluded, discharged, withQcd, without } = run({ spouseAge: 65, qcd: 150000, accounts: [ira('ira-spouse', 'spouse', 3000000), ira('ira-self', 'self', 100000)] });
  /* Q90 CHANGED THIS FIGURE, through a PRE-EXISTING rule that this fixture is the first to collide with.
     qcdOwnerRequests() has always scaled the owners' parts down when they exceed the household's required distribution
     -- the engine models a QCD only so far as it satisfies one. The household's RMD used to POOL the 65-year-old
     spouse's $3,000,000 IRA, giving $153,465 of room, so the owner's $100,000 part passed through untouched. THE SPOUSE
     OWES NOTHING AT 65, which is exactly what task 4.2 repaired, so the household owes $4,950.50 and the part is scaled
     to it. The claim this test exists for is unchanged, and is asserted on the balances as well: the eligible owner's
     own IRA paid, and the ineligible spouse's $3,000,000 was not touched, however it is listed. */
  /* S5AA R9 ROUND, the owner's decision Q3 (2026-09-21): THE SCALING ABOVE IS GONE, and the figures move with it. A QCD is no
     longer cut to the RMD, so the owner's part is min($111,000, $150,000, the IRA's $100,000) = $100,000, paid in row 1;
     it discharges the IRA's own $4,950.50 obligation and empties the IRA, which then owes nothing in row 2. The claim
     this test exists for is unchanged and still asserted on the balances: the $3,000,000 left is exactly the ineligible
     spouse's IRA, untouched. */
  near(excluded[0], 100000, 'row 1: the owner\'s whole part -- no longer scaled to the $4,950.50 obligation');
  near(excluded[1], 0, 'row 2: the owner\'s IRA is empty, so there is nothing left to give');
  near(discharged[0], 100000 / D80, 'the gift discharges the whole of the owner\'s own obligation');
  near(discharged[1], 0, 'row 2: an empty IRA owes nothing');
  near(withQcd.rows[1].preTax, 3000000, 'the self IRA paid, and only the self IRA: what is left is the spouse\'s $3,000,000');
  near(withQcd.rows[1].preTax, without.rows[1].preTax - (100000 - 100000 / D80),
    'the gift ADDS to the distribution beyond the obligation it discharges -- it is no longer cut to it');
});

test('control: an IRA that has lost value by the time the distribution is set gives only what it holds, before and after S5RR-01', () => {
  /* Annual timing puts the row's -95% return before the distribution: the $100,000 IRA holds $5,000 when each owner's part
     is set, and the part is bounded by that balance. */
  const { excluded, discharged } = run({ qcd: 150000, returnRate: -95, timing: 'annual', accounts: [k401(5900000), ira('ira', 'self', 100000)] });
  near(excluded[0], 5000, 'row 1: the IRA\'s $5,000');
  /* Q90: the obligation is set from the balance at the row's OPEN -- $100,000 over the divisor -- while the part is
     bounded by the balance when the distribution is set. The $5,000 covers the $4,950.50, and the $49.51 beyond it is a
     distribution larger than the one required, which is what a QCD above an RMD is. */
  near(discharged[0], 100000 / D80, 'row 1: the IRA\'s obligation, set on its opening balance');
});

test('control, S5RR-01: a QCD that fits inside the obligations it is credited to is part of the RMD, not an extra withdrawal', () => {
  /* Q90 MOVED THE FIXTURE, NOT THE RULE, and the move is worth stating because it is the clearest single consequence
     of task 4.2. This control used to be written on the $5.8M-401(k) household, where the $161,000 of parts is far
     larger than the two IRAs' own obligations ($7,425.74 and $2,475.25). Under a pooled required distribution that did
     not matter -- the QCD counted against the household's whole $297,029.70 and was therefore inside it. Per plan, it
     is not: the 401(k) must still distribute its own $292,079.21, so that household now distributes $448,128.71, and
     asserting $297,029.70 there would be asserting the pooled rule this sprint removed.
     The household below is one where the parts DO fit inside their own owners' obligations ($111,000 against
     $222,772.28 and $50,000 against $74,257.43), and there the identity is exactly what it always was. */
  const { withQcd } = run({ spouseAge: 80, qcd: 200000, accounts: [ira('ira-self', 'self', 4500000), ira('ira-spouse', 'spouse', 1500000)] });
  const rmd1 = 6000000 / D80;
  near(withQcd.rows[1].rmdDistributed, rmd1, 'RMD distributed');
  near(withQcd.rows[1].preTax, 6000000 - rmd1, 'pre-tax balance after row 1');
});

test('S5RR-01, Q90: a QCD LARGER than the obligation it is credited to is distributed on top of the rest of the RMD', () => {
  /* The other side of the control above, and the behaviour task 4.2 introduced. $161,000 of parts against two IRA
     obligations totalling $9,900.99: the IRAs' own obligations are discharged, the 401(k)'s $292,079.21 is not, and
     the household distributes the QCD ON TOP. The general identity, which the pooled rule hid:
         rmdDistributed = what was given away + (what was required - what the gift discharged) */
  const { withQcd, excluded, discharged } = run({ spouseAge: 80, qcd: 200000, accounts: [k401(5800000), ira('ira-self', 'self', 150000), ira('ira-spouse', 'spouse', 50000)] });
  near(withQcd.rows[1].rmdDistributed, excluded[0] + (6000000 / D80 - discharged[0]), 'row 1 distributes the gift plus the rest of the requirement');
  near(withQcd.rows[1].rmdDistributed, 448128.71, 'which is $448,128.71, not the $297,029.70 a pooled requirement would have given');
  near(withQcd.rows[1].preTax, 6000000 - 448128.71, 'and the pre-tax total falls by the whole of it');
});

test('control: no traditional IRA, no exclusion, in either row', () => {
  const { excluded } = run({ qcd: 150000, accounts: [k401(6000000)] });
  near(excluded[0], 0, 'row 1');
  near(excluded[1], 0, 'row 2');
});

test('control: S5R-02 and S5R-03 are kept -- one owner\'s $6M IRA excludes $111,000 of $150,000, and $75,000 of a half-year request', () => {
  near(run({ qcd: 150000, accounts: [ira('ira', 'self', 6000000)] }).excluded[0], CAP, 'a whole row');
  near(run({ age: 80.5, qcd: 150000, accounts: [ira('ira', 'self', 6000000)] }).excluded[0], 75000, 'a half-year first row');
});

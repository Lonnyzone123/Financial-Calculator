/* S5RR-01 (the 2026-09-16 re-audit of S5's repair round; the owner's answer 2 (A) of 2026-09-16, third set): which accounts pay
 * a QCD, read from the accounts themselves.
 *
 * tests/audit-s5rr01-qcd-source-funding.test.js reaches this through runPlan() alone, by its effect on the next row. This
 * file reads each account's balance after the row's withdrawals and the QCD cash the row paid, through a read-only tap on
 * an in-memory copy of the engine (tests/lib/engine-variant.js), at the line the household ledger already taps: after the
 * RMD, the spending draw and the tax funding, before any retained cash is deposited. The tapped engine's public result is
 * asserted equal to the real engine's in every case, so the tap changes nothing it observes.
 *
 * Every expected figure is derived here from the rule, not measured: each eligible owner's part is min($111,000,
 * request x owner's IRA / eligible owners' IRAs, owner's IRA) (until S5AA R9, the owner's Q3, scaled together when they exceeded the required
 * distribution; a QCD is no longer cut to the RMD); the parts are paid from that owner's traditional IRAs in priority order. Fixtures as in the public
 * file: zero returns and fees, no other income, dividends on at a 0% yield, $10,000 spending, manual order.
 *
 * ================== S5AA TASK 4.2 (Q90): WHAT THE ACCOUNT THAT DOES NOT HOLD THE QCD NOW PAYS
 *
 * EVERY CLAIM IN THIS FILE IS ABOUT WHICH ACCOUNT PAYS, AND NOT ONE OF THEM CHANGES. What changes is the other half
 * of each row: the required distribution is now computed PER OWNER AND PER PLAN, so an account that does not hold the
 * QCD no longer pays "the rest of the household's RMD" -- it pays ITS OWN obligation, its own balance over the
 * divisor, and a QCD from an IRA cannot reduce it. The expected debits below are rewritten accordingly, and the
 * rewriting is what makes them stronger: under the pooled rule, an IRA and a 401(k) shared one number, so a debit of
 * `RMD - $100,000` could be satisfied by either account paying either part.
 *
 * THE ORDER-DEPENDENT EXPECTATIONS ARE GONE, which is the clearest single sign of the repair. The unequal-spouses
 * pair below used to expect the FIRST-LISTED IRA to absorb the rest of the household's RMD, so each order needed its
 * own figure. Each IRA now pays its own obligation and the two orders are identical, so they share one.
 *
 * OBL(balance) is an obligation: that balance at the row's open, over the age-80 divisor.
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
const { loadEngineVariant } = require('./lib/engine-variant.js');
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
const D80 = RULES.retirement.rmd.uniformLifetime['80'];
/* Q90: one plan's required distribution -- its own opening balance over its owner's divisor. An owner's traditional
   IRAs aggregate into one of these; every employer plan is one of its own. */
const OBL = (balance) => balance / D80;

const HOOK = '__S5RR01_QCD_SOURCE__';
const tapped = loadEngineVariant([{ id: 'qcd-source', marker: 'var shortfall=Math.max(0,need+taxNeed),nonPortfolioDraw=0;',
  append: 'if(globalThis.' + HOOK + ')globalThis.' + HOOK + '(accounts.map(function(a){return [a.id,a.balance]}),Math.min(qcd,rmdGross));' }]);

const account = (id, owner, type, balance) => ({ id, name: id, owner, type, taxClass: 'preTax', balance, basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 });
const ira = (id, owner, balance) => account(id, owner, 'traditionalIRA', balance);
const k401 = (balance) => account('k401', 'self', 'traditional401k', balance);
const cash = (balance) => Object.assign(account('cash', 'self', 'taxable', balance), { taxClass: 'taxable', basisPct: 100 });

function plan({ spouseAge = null, qcd, accounts, returnRate = 0, timing = 'monthly' }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const spouse = spouseAge !== null;
  Object.assign(p.profile, { age: 80, retireAge: 60, endAge: 82, spouseOn: spouse, spouseAge: spouse ? spouseAge : 80, filing: spouse ? 'mfj' : 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: timing });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 10000, ssBenefit: 0, spouseSS: 0, pension: 0, otherIncomes: [], stages: [], expenses: [], dividendOn: true, dividendYield: 0, withdrawalOrder: 'manual' });
  Object.assign(p.advanced, { rmdOn: true, qcd, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = accounts.map((a, i) => Object.assign({}, a, { priority: i + 1 }));
  return p;
}
/* Row 1's balances after its withdrawals, by account id, and the QCD cash it paid. */
function firstRow(opts) {
  const seen = [];
  globalThis[HOOK] = (balances, qcdPaid) => seen.push({ balances: Object.fromEntries(balances), qcdPaid });
  let result;
  try { result = tapped.runPlan(plan(opts)); } finally { delete globalThis[HOOK]; }
  assert.equal(result.status, 'ok', JSON.stringify(result.issues || []));
  assert.equal(JSON.stringify(result), JSON.stringify(engine.runPlan(plan(opts))), 'the tapped engine\'s result equals the real engine\'s');
  assert.ok(seen.length >= 1, 'the tap saw row 1');
  return seen[0];
}
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) <= 0.01, what + ': got ' + actual + ', expected ' + expected);
const debit = (row, opening, id) => opening[id] - row.balances[id];
const openingOf = (accounts) => Object.fromEntries(accounts.map((a) => [a.id, a.balance]));

test('S5RR-01: a 401(k) listed first -- the IRA pays the $100,000 QCD and the 401(k) pays only the rest of the RMD', () => {
  const accounts = [k401(5900000), ira('ira', 'self', 100000)];
  const row = firstRow({ qcd: 150000, accounts });
  const open = openingOf(accounts);
  near(row.qcdPaid, 100000, 'QCD paid');
  near(debit(row, open, 'ira'), 100000, 'IRA debit: the whole gift, and nothing more -- the $100,000 covers its own $4,950.50 obligation');
  /* Q90: was `rmd - 100000`. The 401(k) owes what IT holds over the divisor, and an IRA's gift does not reduce it. */
  near(debit(row, open, 'k401'), OBL(5900000), '401(k) debit: its own obligation, undiminished by the IRA\'s QCD');
});

for (const [order, accounts] of [
  ['self IRA first', [ira('ira-self', 'self', 4500000), ira('ira-spouse', 'spouse', 1500000)]],
  ['spouse IRA first', [ira('ira-spouse', 'spouse', 1500000), ira('ira-self', 'self', 4500000)]],
]) {
  test('S5RR-01: unequal spouses, both 80, ' + order + ' -- the self IRA pays $111,000, the spouse IRA $50,000, and each IRA its own obligation', () => {
    /* Q90 REMOVED THE `restFrom` ARGUMENT, and that removal is the repair. The third element of each row above named
       the IRA that would absorb the rest of the household's RMD -- a different account in each order, so the two
       orders needed different figures. Each IRA now pays its OWN obligation, the gift is credited inside it, and the
       two orders are identical. An expectation that had to know the listing order was the defect's fingerprint. */
    const row = firstRow({ spouseAge: 80, qcd: 200000, accounts });
    const open = openingOf(accounts);
    near(row.qcdPaid, 161000, 'QCD paid');
    near(debit(row, open, 'ira-self'), OBL(4500000), 'self IRA debit: $111,000 of gift inside its own $222,772.28 obligation');
    near(debit(row, open, 'ira-spouse'), OBL(1500000), 'spouse IRA debit: $50,000 of gift inside its own $74,257.43');
  });
}

test('S5RR-01: two IRAs of one owner pay one $111,000 cap, the first in full and the second the remainder', () => {
  const accounts = [k401(5800000), ira('ira-a', 'self', 100000), ira('ira-b', 'self', 100000)];
  const row = firstRow({ qcd: 300000, accounts });
  const open = openingOf(accounts);
  near(row.qcdPaid, 111000, 'QCD paid');
  near(debit(row, open, 'ira-a'), 100000, 'first IRA');
  near(debit(row, open, 'ira-b'), 11000, 'second IRA');
  /* Q90: was `rmd - 111000`. The two IRAs aggregate into one $9,900.99 obligation, which the $111,000 covers many
     times over -- and none of that surplus reaches the 401(k), which pays its own $287,128.71. */
  near(debit(row, open, 'k401'), OBL(5800000), '401(k): its own obligation');
});

test('S5RR-01: an ineligible spouse\'s IRA listed first is not touched at all, and never pays the owner\'s QCD', () => {
  /* Q90 CHANGED BOTH FIGURES, AND MADE THE CLAIM ABSOLUTE. A spouse of 65 owes NOTHING -- that is what task 4.2
     repaired -- so the household's requirement is the owner's own $100,000 IRA over the divisor, $4,950.50, and the
     $3,000,000 beside it is not drawn on at all. Two consequences:
       - the gift is scaled to $4,950.50. qcdOwnerRequests() has always scaled the parts down to the household's
         required distribution, and that requirement used to POOL the ineligible spouse's IRA, leaving $153,465 of
         room. This is a pre-existing rule meeting a correctly smaller number, not a new one;
       - the spouse's IRA debit is EXACTLY ZERO, which is a stronger form of this test's own claim than the figure it
         used to assert. A $500,000 taxable account at full basis pays the $10,000 of spending, so a cash shortfall
         cannot reach the spouse's IRA and make that zero mean something else. */
  /* S5AA R9 ROUND, the owner's decision Q3 (2026-09-21): the scaling described above is gone -- a QCD is not cut to the RMD --
     so the owner's part is min($111,000, $150,000, $100,000) = $100,000. The claim is unchanged: the owner's IRA pays,
     the spouse's is not touched. */
  const accounts = [ira('ira-spouse', 'spouse', 3000000), ira('ira-self', 'self', 100000), cash(500000)];
  const row = firstRow({ spouseAge: 65, qcd: 150000, accounts });
  const open = openingOf(accounts);
  near(row.qcdPaid, 100000, 'QCD paid: the owner\'s whole part, no longer scaled to the $4,950.50 requirement');
  near(debit(row, open, 'ira-self'), 100000, 'the owner\'s IRA pays it');
  near(debit(row, open, 'ira-spouse'), 0, 'and the ineligible spouse\'s IRA is not touched, first in the list or not');
});

/* S5AA R9 ROUND, the owner's decision Q3 (2026-09-21): INVERTED. This pinned the engine's old rule that parts larger than the
   RMD are scaled down to it. IRC 408(d)(8) caps a QCD per owner per year, not at the RMD; the RMD is a floor the QCD
   counts toward. Each part is now paid in full, from its own owner's IRA, and covers that owner's own obligation. */
test('S5RR-01 with Q3: parts larger than the RMD are paid in full, each from its own owner\'s IRA, each covering that owner\'s RMD', () => {
  /* $600,000 and $400,000 IRAs: parts $60,000 and $40,000. Each owner's obligation ($600,000 or $400,000 over the age-80
     divisor) is smaller than their part, so each IRA pays exactly its part. A $500,000 taxable account at full basis
     pays the spending. */
  const accounts = [ira('ira-self', 'self', 600000), ira('ira-spouse', 'spouse', 400000), cash(500000)];
  const row = firstRow({ spouseAge: 80, qcd: 100000, accounts });
  const open = openingOf(accounts);
  assert.ok(OBL(600000) < 60000 && OBL(400000) < 40000, 'the fixture\'s premise: each part exceeds its owner\'s obligation');
  near(row.qcdPaid, 100000, 'QCD paid: the whole request, not the RMD');
  near(debit(row, open, 'ira-self'), 60000, 'self IRA: its part, which covers its own obligation');
  near(debit(row, open, 'ira-spouse'), 40000, 'spouse IRA: its part, which covers its own obligation');
});

test('S5RR-01: after a loss, the IRA pays all it holds toward its part and the 401(k) listed first pays only the rest of the RMD', () => {
  /* Annual timing puts the -95% return before the distribution: the $100,000 IRA holds $5,000 and the $5.9M 401(k) $295,000. */
  const accounts = [k401(5900000), ira('ira', 'self', 100000)];
  const row = firstRow({ qcd: 150000, returnRate: -95, timing: 'annual', accounts });
  near(row.qcdPaid, 5000, 'QCD paid');
  near(row.balances.ira, 0, 'IRA left');
  /* Q90: the obligation is set from the balance at the row's OPEN, $5,900,000 over the divisor, while the gift is
     bounded by what the IRA holds once the loss has landed. Was `295000 - (rmd - 5000)`. */
  near(row.balances.k401, 295000 - OBL(5900000), '401(k) left: it paid its own obligation, not the rest of a pooled one');
});

test('control: every pre-tax dollar leaves once -- row 1\'s pre-tax debits total the gift plus what the gift did not discharge', () => {
  /* Q90 RESTATED THIS IDENTITY RATHER THAN DROPPING IT. It used to read `debits == the household RMD`, which held
     because a gift could always be counted against the pooled requirement. Here $161,000 of gift is credited against
     two IRA obligations worth $9,900.99 between them, so the surplus is distributed ON TOP of the 401(k)'s own
     $287,128.71 and the household debits $448,128.71. The general form, which the pooled rule hid:
         debits = what was given away + (what was required - what the gift discharged) */
  const accounts = [k401(5800000), ira('ira-self', 'self', 150000), ira('ira-spouse', 'spouse', 50000)];
  const row = firstRow({ spouseAge: 80, qcd: 200000, accounts });
  const open = openingOf(accounts);
  const debits = ['k401', 'ira-self', 'ira-spouse'].reduce((s, id) => s + debit(row, open, id), 0);
  const required = OBL(5800000) + OBL(150000) + OBL(50000);
  const dischargedByGift = OBL(150000) + OBL(50000);
  near(row.qcdPaid, 161000, 'QCD paid');
  near(debits, 161000 + (required - dischargedByGift), 'pre-tax debits');
  near(debits, 448128.71, 'which is $448,128.71, not the $297,029.70 a pooled requirement would have debited');
});

test('control: a gift that fits inside its own obligations still debits the required distribution and no more', () => {
  /* The other side of the identity above, kept so that the file still pins the case where the two agree. $111,000 and
     $50,000 of gift sit inside obligations of $222,772.28 and $74,257.43, so nothing is distributed beyond what was
     required and the debits total the household's requirement exactly, as they always did. */
  const accounts = [ira('ira-self', 'self', 4500000), ira('ira-spouse', 'spouse', 1500000)];
  const row = firstRow({ spouseAge: 80, qcd: 200000, accounts });
  const open = openingOf(accounts);
  near(['ira-self', 'ira-spouse'].reduce((s, id) => s + debit(row, open, id), 0), 6000000 / D80, 'pre-tax debits');
  near(row.qcdPaid, 161000, 'QCD paid');
});

/* S5R-02 and S5R-03 (the 2026-09-16 external audit; the owner's answers 2 (A) and 4 (A) of 2026-09-16): who a QCD's exclusion
 * belongs to, and which year its cap is counted in.
 *
 * S5 task 10 capped the household's QCD at $111,000 x (1 + an eligible spouse) x the row's duration. The exclusion is
 * per taxpayer, for distributions from that taxpayer's own IRA (IRS Publication 590-B; Notice 2025-67), and the cap is
 * annual.
 *
 * Decided (answer 2 (A)): the household request is split across the eligible spouses (70 1/2 or older) by each one's
 * share of their own traditional-IRA balance, and each spouse's part is excluded up to $111,000 and up to that IRA's
 * balance. A spouse with no traditional IRA adds no exclusion, and an ineligible spouse's IRA takes no share.
 * Decided (answer 4 (A)): the annual cap is not prorated. The request is still a yearly amount prorated over a partial
 * row, and the plan's opening partial row assumes no QCD earlier that year, which is disclosed.
 *
 * Every expected figure is derived here from that rule, not measured from the engine: for each eligible owner,
 * min($111,000, period request x owner's IRA / eligible owners' IRAs, owner's IRA), summed (until S5AA R9, the owner's Q3, the sum was then bounded by the row's
 * required distribution; a QCD is no longer cut to the RMD). The task 10 expectation a case replaces is named beside it.
 *
 * S5AA TASK 4.2 (Q90): HOW THE EXCLUSION IS READ. This file used to read it as the row's MAGI without the request
 * minus MAGI with it, because "with zero returns and spending covered by the RMD cash, that difference is the amount
 * excluded". That held while the required distribution was POOLED, so both plans distributed the same total. It is now
 * per owner and per plan, and a gift from an IRA no longer discharges a 401(k)'s obligation: the household with a
 * $100,000 IRA beside a $5.9M 401(k) gives away its $100,000 AND still distributes the 401(k)'s $292,079.21, so it
 * distributes more in total and the MAGI difference collapses to $4,950.50. ONE of the twelve cases below is affected,
 * and its expectation does not change -- the exclusion is exactly recoverable from two fields the row already carries:
 *
 *     excluded = (rmdDistributed with - rmdDistributed without) + (MAGI without - MAGI with)
 *
 * what the household additionally distributed, plus what stopped being taxable. For every all-IRA case the first term
 * is zero and this is the same measurement the file always made.
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
const DIVISOR_80 = RULES.retirement.rmd.uniformLifetime['80'];

const account = (id, owner, type, balance) => ({ id, name: id, owner, type, taxClass: 'preTax', balance, basisPct: 0, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 });
const ira = (owner, balance) => account('ira-' + owner, owner, 'traditionalIRA', balance);
const k401 = (owner, balance) => account('k401-' + owner, owner, 'traditional401k', balance);

function plan({ age = 80, spouseAge = null, qcd, accounts, spending = 10000 }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  const spouse = spouseAge !== null;
  Object.assign(p.profile, { age, retireAge: 60, endAge: Math.floor(age) + 2, spouseOn: spouse, spouseAge: spouse ? spouseAge : age, filing: spouse ? 'mfj' : 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending, ssBenefit: 0, spouseSS: 0, pension: 0, otherIncomes: [], stages: [], expenses: [], dividendOn: false });
  Object.assign(p.advanced, { rmdOn: true, qcd, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = accounts.map((a, i) => Object.assign({}, a, { priority: i + 1 }));
  return p;
}
function excluded(opts) {
  const without = engine.runPlan(plan(Object.assign({}, opts, { qcd: 0 })));
  const withQcd = engine.runPlan(plan(opts));
  assert.equal(without.status, 'ok');
  assert.equal(withQcd.status, 'ok');
  return (withQcd.rows[1].rmdDistributed - without.rows[1].rmdDistributed) + (without.rows[1].magi - withQcd.rows[1].magi);
}
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) <= 1, what + ': excluded ' + actual + ', expected ' + expected);
const CODE = 'QCD_OPENING_YEAR_CAP_ASSUMED';
const disclosed = (opts) => (engine.runPlan(plan(opts)).issues || []).filter((i) => i.code === CODE);

test('S5R-02: one IRA owned by self, both spouses 80: $250,000 is excluded at the owner\'s $111,000, not $222,000', () => {
  near(excluded({ spouseAge: 80, qcd: 250000, accounts: [ira('self', 6000000)] }), CAP, 'task 10 expected $222,000, pooling a cap the spouse cannot use');
});

test('S5R-02: one IRA owned by self, both spouses 80: $150,000 is excluded at $111,000, not in full', () => {
  near(excluded({ spouseAge: 80, qcd: 150000, accounts: [ira('self', 6000000)] }), CAP, 'task 10 expected $150,000');
});

test('S5R-02: unequal IRAs of $4.5M and $1.5M, both 80: $200,000 splits $150,000 and $50,000 and is excluded at $111,000 + $50,000', () => {
  near(excluded({ spouseAge: 80, qcd: 200000, accounts: [ira('self', 4500000), ira('spouse', 1500000)] }), CAP + 50000, 'the household cap would have excluded $200,000');
});

test('S5R-02: the spouse\'s own IRA carries the spouse\'s exclusion: only the spouse holds an IRA, both 80, $150,000 is excluded at $111,000', () => {
  near(excluded({ spouseAge: 80, qcd: 150000, accounts: [ira('spouse', 6000000)] }), CAP, 'the household cap would have excluded $150,000');
});

test('S5R-02: no traditional IRA, no exclusion: $150,000 requested against a $6M traditional 401(k) excludes nothing', () => {
  near(excluded({ qcd: 150000, accounts: [k401('self', 6000000)] }), 0, 'task 10 excluded $111,000 from a workplace plan');
});

test('S5R-02: an owner\'s exclusion never exceeds the IRA it comes from: a $100,000 IRA beside a $5.9M 401(k), $150,000 requested, excluded at $100,000', () => {
  near(excluded({ qcd: 150000, accounts: [ira('self', 100000), k401('self', 5900000)] }), 100000, 'task 10 excluded $111,000');
});

test('S5R-03: a half-year first row prorates the request, not the annual cap: $150,000 a year at 80.5 is excluded at $75,000, not $55,500', () => {
  near(excluded({ age: 80.5, qcd: 150000, accounts: [ira('self', 6000000)] }), 75000, 'task 10 prorated the cap to $55,500');
  const halfRowRmd = 6000000 / DIVISOR_80 * 0.5;
  assert.ok(halfRowRmd > CAP, 'premise: the half-year RMD, ' + Math.round(halfRowRmd) + ', does not bind below the cap');
  near(excluded({ age: 80.5, qcd: 300000, accounts: [ira('self', 6000000)] }), CAP, '$300,000 a year over half a year is $150,000, excluded at the full annual cap');
});

test('S5R-03: the opening-year assumption is disclosed when the first row is partial and a QCD can apply there, and only then', () => {
  const found = disclosed({ age: 80.5, qcd: 150000, accounts: [ira('self', 6000000)] });
  assert.equal(found.length, 1, 'a partial first row with a QCD request is disclosed once');
  assert.equal(found[0].severity, 'WARNING');
  assert.equal(disclosed({ age: 80, qcd: 150000, accounts: [ira('self', 6000000)] }).length, 0, 'a whole first row needs no assumption');
  assert.equal(disclosed({ age: 80.5, qcd: 0, accounts: [ira('self', 6000000)] }).length, 0, 'no request, nothing assumed');
  assert.equal(disclosed({ age: 60.5, qcd: 150000, accounts: [ira('self', 6000000)] }).length, 0, 'no QCD can apply before the required distributions start');
});

test('control: equal IRAs, both 80: $250,000 splits $125,000 each and is excluded at $111,000 each; $150,000 splits $75,000 each and is excluded in full', () => {
  near(excluded({ spouseAge: 80, qcd: 250000, accounts: [ira('self', 3000000), ira('spouse', 3000000)] }), 2 * CAP, '$250,000');
  near(excluded({ spouseAge: 80, qcd: 150000, accounts: [ira('self', 3000000), ira('spouse', 3000000)] }), 150000, '$150,000');
});

test('control: a spouse under 70 1/2 neither adds a cap nor takes a share: $150,000 against $3M IRAs each is excluded at the owner\'s $111,000', () => {
  near(excluded({ spouseAge: 65, qcd: 150000, accounts: [ira('self', 3000000), ira('spouse', 3000000)] }), CAP, 'owner 80, spouse 65');
});

test('control: one IRA, one eligible owner, a request below the cap is excluded in full', () => {
  near(excluded({ qcd: 50000, accounts: [ira('self', 6000000)] }), 50000, '$50,000 requested');
});

/* S5AA R9 ROUND, the owner's decision Q3 (2026-09-21): INVERTED. This control pinned "the required distribution still bounds
   the exclusion", which was the engine's rule and not the law's: IRC 408(d)(8) caps a QCD per owner per year and says
   nothing of the RMD, which it only counts toward. The same fixture now excludes the owner's cap, and the RMD is
   discharged inside it. */
test('control (Q3): the required distribution no longer bounds the exclusion -- the per-owner cap does', () => {
  const rmd = 1000000 / DIVISOR_80;
  near(excluded({ qcd: 150000, spending: 0, accounts: [ira('self', 1000000)] }), CAP, '$150,000 requested against a ' + Math.round(rmd) + ' RMD: the $' + CAP + ' cap, not the RMD');
});

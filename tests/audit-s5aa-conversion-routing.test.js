/* S5AA task 4.3, Q97 (G1) -- the Roth conversion's source and destination.
 *
 * THE DEFECT. The conversion block selected its accounts with
 *
 *     accounts.find(x => x.taxClass === "preTax")   and   accounts.find(x => x.taxClass === "roth")
 *
 * -- the FIRST of each IN ARRAY ORDER -- and then clamped the conversion at that one account's
 * balance. Three consequences, all reproduced before this file was written:
 *
 *   - THE EXECUTED AMOUNT DEPENDED ON THE ORDER OF THE ACCOUNTS ARRAY. $50,000 requested against
 *     pre-tax accounts of $20,000 and $80,000 converted $20,000 with the small one first and $50,000
 *     with the big one first. Same household, same request, two answers.
 *   - `priority` WAS IGNORED. Every other draw in the engine sorts by withdrawalComparator(); this one
 *     did not, so priority 1 on the large account still converted only the small one's $20,000.
 *   - OWNERSHIP WAS NEVER CONSULTED, so a SELF pre-tax account converted into a SPOUSE's Roth. A
 *     conversion is one person's distribution and their own rollover contribution (IRC 408A(d)(3));
 *     it cannot cross owners, and array position cannot authorise it to.
 *
 * THE TEST THAT MATTERS is the first one: array order must stop mattering at all. It is stated as an
 * equality between two runs of the same household, so it is a claim about the ENGINE'S OUTPUT and
 * survives any later rewrite of how the routing is expressed.
 *
 * The rows expose CLASS totals, not per-account balances, so the conversion is observed as the rise in
 * the `roth` class -- which is what the household sees. The routing itself is checked separately, in
 * tests/internals/, because which of two pre-tax accounts paid is not a row-level fact.
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

function acct(id, type, taxClass, owner, balance, priority) {
  return {
    id, name: id, type, taxClass, owner, balance, basisPct: taxClass === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: priority === undefined ? 1 : priority,
  };
}

/* An inert household whose only event is the conversion: no growth, no inflation, no spending, no
   RMD, so every dollar that leaves the pre-tax class left it because of the conversion or the tax on
   it, and two runs differ only in what the test varies. */
function plan(accounts, amount) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 65, retireAge: 65, endAge: 66, spouseOn: true, spouseAge: 65, filing: 'mfj' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, qcdOn: false,
    stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false,
  });
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: true, conversionAmount: amount });
  p.accounts = accounts;
  return p;
}

function run(p) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', 'plan should run: ' + r.status + '/' + r.calculationErrorCode);
  const a = r.rows[0], b = r.rows[1];
  return {
    result: r,
    rothGain: (Number(b.roth) || 0) - (Number(a.roth) || 0),
    preTaxDrop: (Number(a.preTax) || 0) - (Number(b.preTax) || 0),
    taxes: Number(b.taxes) || 0,
  };
}

const small = (prio) => acct('preSmall', 'traditionalIRA', 'preTax', 'self', 20000, prio === undefined ? 1 : prio);
const big = (prio) => acct('preBig', 'traditional401k', 'preTax', 'self', 80000, prio === undefined ? 2 : prio);
const rothSelf = (prio) => acct('rothSelf', 'rothIRA', 'roth', 'self', 0, prio === undefined ? 3 : prio);

/* ------------------------------------------------------------------ 1. the claim that matters */

test('S5AA 4.3 (Q97): array order does not change the executed conversion', () => {
  const forward = run(plan([small(), big(), rothSelf()], 50000));
  const reversed = run(plan([big(), small(), rothSelf()], 50000));

  assert.equal(
    forward.rothGain.toFixed(2), reversed.rothGain.toFixed(2),
    'the same household with its accounts listed in a different order converted a different amount: ' +
    forward.rothGain.toFixed(2) + ' against ' + reversed.rothGain.toFixed(2));
  assert.equal(forward.preTaxDrop.toFixed(2), reversed.preTaxDrop.toFixed(2));
  assert.equal(forward.taxes.toFixed(2), reversed.taxes.toFixed(2));
});

/* ------------------------------------------------------------------ 2. several sources */

test('S5AA 4.3 (Q97): a conversion draws across as many pre-tax accounts as it needs', () => {
  const r = run(plan([small(), big(), rothSelf()], 50000));
  assert.equal(r.rothGain.toFixed(2), '50000.00',
    'the request is $50,000 and the household holds $100,000 of pre-tax money in two accounts; ' +
    'the conversion stopped at the first account\'s $20,000');
});

/* ------------------------------------------------------------------ 3. requested against executed */

test('S5AA 4.3 (Q97): a request above the household\'s capacity executes at capacity, not at zero', () => {
  /* The tax on the conversion is funded from a taxable account on purpose. Without one the household
     pays it out of the Roth it has just filled, and the class delta then measures the conversion NET
     of $7,394 of federal tax -- correct behaviour, but not a measurement of the conversion. */
  const r = run(plan([
    acct('cash', 'taxable', 'taxable', 'self', 60000, 0), small(), big(), rothSelf(),
  ], 200000));
  assert.equal(r.rothGain.toFixed(2), '100000.00',
    '$200,000 requested against $100,000 of pre-tax money converts $100,000');
  assert.equal(r.preTaxDrop.toFixed(2), '100000.00', 'and the pre-tax class is emptied, not partly');
});

/* ------------------------------------------------------------------ 4. an empty valid destination */

test('S5AA 4.3 (Q97): a Roth account with no balance is a valid destination', () => {
  const r = run(plan([small(), rothSelf()], 15000));
  assert.equal(r.rothGain.toFixed(2), '15000.00',
    'an empty Roth account is a destination, not an absent one');
});

/* ------------------------------------------------------------------ 5. ownership */

test('S5AA 4.3 (Q97): a conversion does not cross owners', () => {
  const r = run(plan([
    acct('preSelf', 'traditionalIRA', 'preTax', 'self', 80000, 1),
    acct('rothSpouse', 'rothIRA', 'roth', 'spouse', 0, 1),
  ], 50000));
  assert.equal(r.rothGain.toFixed(2), '0.00',
    'the only Roth account belongs to the spouse and the only pre-tax account to the self; ' +
    'a conversion is one person\'s distribution and their own rollover contribution, so there is ' +
    'nothing this household can convert');
  assert.equal(r.preTaxDrop.toFixed(2), '0.00', 'and nothing should have left the pre-tax class');
});

test('S5AA 4.3 (Q97): each owner converts into their own Roth, and a priority does not override that', () => {
  /* The spouse's Roth sorts FIRST on both array position and priority. It still receives nothing:
     only the self holds pre-tax money, and only the self's Roth may take it. */
  const r = run(plan([
    acct('rothSpouse', 'rothIRA', 'roth', 'spouse', 0, 1),
    acct('preSelf', 'traditionalIRA', 'preTax', 'self', 80000, 5),
    acct('rothSelf', 'rothIRA', 'roth', 'self', 0, 9),
  ], 30000));
  assert.equal(r.rothGain.toFixed(2), '30000.00', 'the self\'s own Roth can and should receive it');
});

test('S5AA 4.3 (Q97): both owners convert their own money in one household', () => {
  const r = run(plan([
    acct('preSelf', 'traditionalIRA', 'preTax', 'self', 20000, 1),
    acct('preSpouse', 'traditionalIRA', 'preTax', 'spouse', 60000, 2),
    acct('rothSelf', 'rothIRA', 'roth', 'self', 0, 3),
    acct('rothSpouse', 'rothIRA', 'roth', 'spouse', 0, 4),
  ], 50000));
  assert.equal(r.rothGain.toFixed(2), '50000.00',
    'the self\'s $20,000 and $30,000 of the spouse\'s, each into their own Roth');
});

/* ------------------------------------------------------------------ 6. the quote and the commit */

test('S5AA 4.3 (Q97): the tax quote and the settlement agree on a multi-account conversion', () => {
  /* A conversion is ordinary income, and the row's funding quote is verified against what the commit
     actually charged. A routing change that moved a different number of dollars than the quote priced
     would fire one of the two settlement codes rather than simply reporting a different total. */
  const p = plan([small(), big(), rothSelf(), acct('cash', 'taxable', 'taxable', 'self', 40000, 4)], 50000);
  p.retirement.spending = 30000;
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.equal(r.calculationErrorCode || null, null);
  const codes = (r.issues || []).map((i) => i.code);
  assert.ok(!codes.includes('TAX_SETTLEMENT_MISMATCH'), 'settlement mismatch: ' + codes.join(','));
  assert.ok(!codes.includes('QUOTE_SETTLEMENT_UNVERIFIED'), 'quote unverified: ' + codes.join(','));
});

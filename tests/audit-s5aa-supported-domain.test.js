/* S5AA task 5.5 -- the reference's supported domain, and the three exclusions that were REACHABLE and
 * SILENT.
 *
 * Task 5.5's gate is not "the exclusions are documented". It is that each is "detectable, enforced at
 * the runner or corpus boundary, checked for indirect reach through an automatic spending or
 * conversion policy, and carried to a named new-engine task", and that "an unsupported notice alone is
 * not enough if an affected result is still presented as a qualified reference value".
 *
 * DETECTABLE IS THE PART THAT HAD TO BE BUILT. A runner cannot exclude what it cannot see, so each of
 * the three carries `outsideSupportedDomain: true` and names the task that owns it -- a machine-
 * readable fact, not a sentence a consumer has to parse. These are NOT repairs and do not pretend to
 * be: they make an existing boundary visible.
 *
 * TWO, NOT THREE, SINCE X01 WAS REPAIRED. This file was written against three exclusions. X01 -- a
 * credit card projected as a fixed-term loan -- was repaired later in S5AA on the owner's decision of
 * 2026-09-20 under amendment A-06: src/debt-revolving.js is wired into projectDebts() and the two
 * agree month for month. The X01 tests below are kept and INVERTED rather than deleted, because
 * "this is no longer outside the supported domain" is a claim worth holding: a later change that
 * quietly unwired the module would put the exclusion back, and these would catch it.
 *
 * The two that remain, with the evidence from task 0.3's reproductions:
 *   X03  historical replay applies one series to every account. A 100%-bond portfolio replays the S&P
 *        500 exactly -- all-stock and all-bond end at the IDENTICAL total.
 *   X02  a Roth draw is penalty-free and gains-free at 40 and at 70 alike; no ordering stack, no basis
 *        term, no five-year clock. REACHABLE INDIRECTLY, which is why the disclosure keys on holding a
 *        Roth account under an automatic spending or conversion policy rather than on an explicit
 *        request -- a withdrawal policy can reach that account without the household naming it.
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

const CARD = {
  id: 'cc', type: 'creditCard', name: 'Card', owner: 'household', balance: 12000, rate: 20,
  rateType: 'fixed', paymentMonthly: 400, extraPrincipalMonthly: 0, payoffAge: 55,
  includePayment: true, includeHousingCosts: false, annualPropertyTax: 0, annualInsurance: 0,
  hoaMonthly: 0, pmiMonthly: 0,
};

function base(age, edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge: age, endAge: age + 5, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 5, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0,
    ssBenefit: 0, spouseSS: 0, survivor: false, stages: [], expenses: [], otherIncomes: [],
  });
  Object.assign(p.advanced, {
    rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, networthOn: true,
    otherAssets: [], debts: [],
  });
  p.accounts = [{
    id: 'cash', name: 'cash', type: 'taxable', taxClass: 'taxable', owner: 'self', balance: 500000,
    basisPct: 100, contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  }];
  if (edit) edit(p);
  return p;
}

const withRoth = (p, priority) => {
  p.accounts.push(Object.assign({}, p.accounts[0], {
    id: 'roth', type: 'rothIRA', taxClass: 'roth', balance: 300000, basisPct: 0,
    priority: priority || 2, allocation: {},
  }));
};

const said = (p, code) => {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return (r.issues || []).find((i) => i.code === code);
};

/* ------------------------------------------------------------------ the shape every exclusion has */

function assertExclusion(issue, label) {
  assert.ok(issue, label + ': the exclusion must be disclosed at all');
  assert.equal(issue.severity, 'WARNING', label);
  assert.equal(issue.state.outsideSupportedDomain, true,
    label + ': a runner must be able to detect this on the FACT, not by parsing prose');
  assert.ok(typeof issue.state.exclusion === 'string' && issue.state.exclusion.length,
    label + ': the exclusion must name itself');
  assert.ok(typeof issue.state.carriedTo === 'string' && issue.state.carriedTo.length,
    label + ': and must name the new-engine task that owns it');
}

/* ------------------------------------------------------------------ X01 */

/* INVERTED WHEN X01 WAS REPAIRED. This asserted that a credit card was disclosed as a fixed-term
   loan and carried to a new-engine task. It now asserts the opposite, and one thing more: that the
   entry which replaced the exclusion is a DISCLOSURE and not a silence. A repair that removed the
   exclusion and said nothing in its place would pass the first half of this and fail the second. */
test('S5AA 5.5 (X01): a credit card is NO LONGER outside the supported domain, and says how it is modelled', () => {
  const r = engine.runPlan(base(45, (x) => { x.advanced.debts = [Object.assign({}, CARD)]; }));
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.equal(said(base(45, (x) => { x.advanced.debts = [Object.assign({}, CARD)]; }),
    'UNSUPPORTED_REVOLVING_DEBT'), undefined, 'the exclusion is retired');
  const issue = (r.issues || []).find((i) => i.code === 'REVOLVING_DEBT_MINIMUM_MODELLED');
  assert.ok(issue, 'and something stands in its place');
  assert.equal(issue.severity, 'WARNING');
  assert.equal(issue.state.outsideSupportedDomain, undefined, 'which is not an exclusion');
  assert.equal(issue.state.carriedTo, undefined, 'and is carried nowhere, because it is done');
  assert.equal(issue.state.approximation, true, 'but is still an approximation, and says so');
  assert.ok(Array.isArray(issue.state.notModelled) && issue.state.notModelled.length >= 2,
    'and names what it still does not model');
});

test('S5AA 5.5 (X01) control: a household with no card is told nothing about one', () => {
  assert.equal(said(base(45), 'UNSUPPORTED_REVOLVING_DEBT'), undefined, 'nor the retired exclusion');
  assert.equal(said(base(45), 'REVOLVING_DEBT_MINIMUM_MODELLED'), undefined, 'nor the disclosure');
});

/* ------------------------------------------------------------------ X03 */

test('S5AA 5.5 (X03): historical replay with allocations set is disclosed as a fixed proxy', () => {
  const p = base(45, (x) => {
    x.assumptions.method = 'historical';
    x.assumptions.historyStart = 1970;
    x.accounts[0].allocation = { stocks: 20, bonds: 70, cash: 10 };
  });
  assertExclusion(said(p, 'UNSUPPORTED_HISTORICAL_ALLOCATION'), 'X03');
});

test('S5AA 5.5 (X03) control: the other methods DO consult the account, and are not disclosed', () => {
  /* This is what makes X03 reachable by surprise rather than merely absent: the same allocation
     behaves differently depending on a method chosen elsewhere in the plan. */
  const p = base(45, (x) => { x.accounts[0].allocation = { stocks: 20, bonds: 70, cash: 10 }; });
  assert.equal(said(p, 'UNSUPPORTED_HISTORICAL_ALLOCATION'), undefined, 'simple method: no disclosure');
});

/* ------------------------------------------------------------------ X02, and its indirect reach */

test('S5AA 5.5 (X02): an automatic spending policy that reaches a Roth under 59.5 is disclosed', () => {
  /* THE INDIRECT REACH IS THE POINT. The household never asks to draw from the Roth account; an
     automatic withdrawal policy can reach it. S5AA R23 (R22-01): the disclosure now keys on the draw that
     policy makes, not on holding a Roth under a spending policy. This fixture's $500,000 taxable account
     paid every dollar, so the Roth was never drawn -- the false alarm R22-01 found. The taxable account is
     emptied, so the automatic order reaches the Roth at 45, which is what the test was written to show. */
  const p = base(45, (x) => { x.retirement.spending = 40000; withRoth(x); x.accounts[0].balance = 0; });
  assertExclusion(said(p, 'UNSUPPORTED_ROTH_ORDERING'), 'X02');
});

test('S5AA 5.5 (X02): a conversion household that then draws its Roth before 59.5 is disclosed', () => {
  /* S5AA R23 (R22-01, the owner 2026-09-24): a conversion INTO a Roth is not a Roth withdrawal, so a conversion
     policy alone no longer raises the exclusion (tests/audit-s5aa-r23-roth-flag-follows-draws.test.js holds
     that control). What stays true is that a converting household reaches the boundary as soon as it
     spends from the Roth before 59 1/2: with the taxable account empty, the optimized order draws the Roth
     ahead of the IRA, whose early-tax weight ranks it last. */
  const p = base(45, (x) => {
    x.advanced.conversionOn = true;
    x.advanced.conversionAmount = 10000;
    x.retirement.spending = 20000;
    withRoth(x);
    x.accounts[0].balance = 0;
    x.accounts.push(Object.assign({}, x.accounts[0], {
      id: 'pre', type: 'traditionalIRA', taxClass: 'preTax', balance: 300000, basisPct: 0, priority: 3, allocation: {},
    }));
  });
  assertExclusion(said(p, 'UNSUPPORTED_ROTH_ORDERING'), 'X02 via conversion');
});

test('S5AA 5.5 (X02) control: past 59.5 the restriction does not apply and is not claimed', () => {
  const p = base(65, (x) => { x.retirement.spending = 40000; withRoth(x); });
  assert.equal(said(p, 'UNSUPPORTED_ROTH_ORDERING'), undefined,
    'the disclosure must not cry wolf on a household the restriction cannot bite');
});

/* ------------------------------------------------------------------ the domain is enumerable */

test('S5AA 5.5: every supported-domain exclusion is findable by one predicate', () => {
  /* The enforcement point. A runner or a corpus boundary filters on this one field; it does not need
     to know the three codes, and a fourth exclusion added later is caught without changing it. */
  const p = base(45, (x) => {
    x.retirement.spending = 40000;
    x.assumptions.method = 'historical';
    x.assumptions.historyStart = 1970;
    x.accounts[0].allocation = { stocks: 20, bonds: 70, cash: 10 };
    withRoth(x);
    /* S5AA R23 (R22-01): the Roth exclusion now needs a Roth dollar drawn before 59 1/2, and this household's
       taxable account paid everything. A Roth-first manual order draws it at 45, so the plan still reaches
       every exclusion there is -- which is the point of the test. */
    x.retirement.withdrawalOrder = 'manual';
    x.retirement.manualOrder = 'roth,taxable,preTax,hsa';
    x.advanced.debts = [Object.assign({}, CARD)];
    /* S5AA self-audit: a THIRD exclusion, and this household had to gain a spouse to reach it. The
       list below is the point of the test, so it has to be asserted against a plan that reaches
       every exclusion there is -- otherwise "findable by one predicate" is only proved for the ones
       the fixture happens to touch, which is how the post-death entry went uncovered when it was
       first written.

       base() runs self-age 45 to 50. The spouse starts at 72 and dies at 74, which is self-age 47,
       inside it. SECOND AUDIT: the death has to CARRY something for the entry to be raised, and
       since the entry was narrowed to what is actually carried, an account in the deceased's name is
       not enough on its own -- it has to be billed. So required distributions are on, the account is
       a traditional IRA, and the spouse's own clock passes the start age inside the horizon. (The
       earlier version of this comment was garbled, and its fixture -- a taxable account copied from
       the self's, with nothing billed -- reached the entry only because the entry over-fired.) */
    x.profile.spouseOn = true;
    x.profile.spouseAge = 72;
    x.profile.filing = 'mfj';
    x.retirement.spouseLife = 74;
    /* S5AA follow-up, Q4: a spouse who SURVIVES now takes the accounts, which is modelled -- so the
       exclusion is reached only where nobody is left. The self dies first, at 46; the spouse takes the
       self's accounts, then dies at self-age 47 with no one to take them, holding the IRA billed on
       their own clock. */
    x.retirement.selfLife = 46;
    x.advanced.rmdOn = true;
    x.accounts.push(Object.assign({}, x.accounts[0], { id: 'spouse-ira', type: 'traditionalIRA', taxClass: 'preTax', basisPct: 0, owner: 'spouse', balance: 100000, priority: 9 }));
  });
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  const outside = (r.issues || []).filter((i) => i.state && i.state.outsideSupportedDomain === true);
  /* TWO, since X01 was repaired. The card is still in this household -- deliberately, so that the
     list below is asserted against a plan that WOULD have reported three -- and it no longer carries
     the flag. The predicate itself is unchanged, which is the point of having one. */
  /* S5AA R9 round, the owner's decision 8 (2026-09-21): the post-death exclusion is gone -- the projection stops at the last
     death, so no row projects a household with nobody in it. This household still reaches that state (both die inside the
     horizon) and is kept so, so that the list is asserted against a plan that WOULD have reported it: it is told by
     PROJECTION_ENDS_AT_LAST_DEATH instead, which is inside the domain. */
  assert.deepEqual(outside.map((i) => i.code).sort(),
    ['UNSUPPORTED_HISTORICAL_ALLOCATION', 'UNSUPPORTED_ROTH_ORDERING'],
    'both remaining exclusions are reported together; neither the repaired card nor the post-death state is among them');
  const stop = (r.issues || []).find((i) => i.code === 'PROJECTION_ENDS_AT_LAST_DEATH');
  assert.ok(stop && !stop.state.outsideSupportedDomain, 'CONTROL: the household does reach the last death, and is told -- inside the domain');
  assert.ok((r.issues || []).some((i) => i.code === 'REVOLVING_DEBT_MINIMUM_MODELLED'),
    'CONTROL: the card IS in this household, and is disclosed -- just not as an exclusion');
});

test('S5AA 5.5 control: an ordinary in-domain household reports no exclusion at all', () => {
  const r = engine.runPlan(base(45, (x) => { x.retirement.spending = 20000; }));
  assert.equal(r.status, 'ok');
  assert.deepEqual((r.issues || []).filter((i) => i.state && i.state.outsideSupportedDomain === true), [],
    'if this ever reports one, the predicate has started matching ordinary plans');
});

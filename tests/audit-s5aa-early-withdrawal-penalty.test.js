/* S5AA task 4.1, Q93 (F7, N1, with G2 and G6) -- the 10% early-distribution penalty.
 *
 * TWO DEFECTS, ONE CAUSE: the test was restated in THREE places and omitted in a fourth.
 * withdrawFromClass() had it inline, `penaltyApplies` re-derived it for the row, quoteTaxFunding()
 * re-derived it again per class -- and the TRANSFER block, which moves pre-tax money to a taxable
 * account and adds it to ordinary income, never charged it at all. A $50,000 transfer at 50 cost $0 of
 * penalty where it owes $5,000.
 *
 * AND THE RULE OF 55 WAS APPLIED TO IRAs. IRC 72(t)(2)(A)(v) exempts a distribution from a qualified
 * EMPLOYER plan after separation from service in or after the year the employee turns 55. It does not
 * reach an IRA. The old gate read the tax CLASS and a household flag and never the ACCOUNT, so it could
 * not tell a 401(k) from an IRA and exempted both.
 *
 * The repair states the rule once, in earlyWithdrawalPenaltyRate(p, age, account), and has all four
 * sites read it. The solver's preTax class is split PER ACCOUNT for the same reason the taxable class
 * already was: the rate now differs between accounts inside one class, and the quote must agree with
 * what the commit will charge or the settlement check rejects it.
 *
 * NOTE `penalties` IS NOT A ROW FIELD. It is folded into the row's `taxes`, which is how these tests
 * observe it. A first version of the reproduction measured `row.penalties` and therefore measured
 * nothing at all.
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

const RATE = 0.10;
const MOVED = 50000;

function acct(id, type, taxClass, balance) {
  return {
    id, name: id, type, taxClass, owner: 'self', balance, basisPct: taxClass === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount',
    frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false,
    matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1,
  };
}

/* An otherwise inert plan whose only event is the transfer, so the whole tax difference between two
   runs is attributable to it. The horizon is fixed regardless of the transfer age, so two ages are
   comparable to each other. */
function transferPlan(age, destClass, edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge: age, endAge: age + 2, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 1000, /* RE-FIXTURED at the S5AA R18 round (workstream B, taxable basis in dollars): dividends ON at a 0% yield, so no imputed 1.5% -- at a 0% return a taxed, retained yield adds basis the account never gains, and the tax sales then realise small capital losses that are not what this test is about. */ dividendOn: true, dividendYield: 0,
    stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false,
  });
  Object.assign(p.advanced, {
    transferOn: true, transferAge: age + 0.5, transferAmount: MOVED,
    transferFrom: 'w', transferTo: destClass === 'roth' ? 'r' : 't',
    penaltyException: false, rule55: false,
  });
  p.accounts = [acct('w', 'traditional401k', 'preTax', 900000), acct('t', 'taxable', 'taxable', 300000),
    acct('r', 'rothIRA', 'roth', 1000)];
  if (edit) edit(p);
  return p;
}

function lifetimeTaxes(p) {
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  return r.rows.reduce((s, x) => s + (Number(x.taxes) || 0), 0);
}

test('S5AA 4.1 control: `penalties` is not a row field, so these tests read the row taxes', () => {
  const r = engine.runPlan(transferPlan(50, 'taxable'));
  assert.strictEqual(r.status, 'ok');
  assert.ok(!('penalties' in r.rows[1]),
    'CONTROL: if `penalties` ever becomes a row field, these tests should read it directly');
  assert.ok((Number(r.rows[1].taxes) || 0) > 0, 'and the row must report some tax for the comparisons to bite');
});

test('S5AA 4.1: the auditor case -- a $50,000 pre-tax transfer at 50 costs exactly $5,000 of penalty', () => {
  /* THE COMPARISON PARTNER MATTERS, and the obvious one is not clean. Comparing against the same
     transfer to a ROTH leaves $18.75 of difference that is nothing to do with the penalty: money that
     lands in a TAXABLE account is taxed differently thereafter from money that lands in a Roth. The
     partner used here is the SAME plan with penaltyException on -- identical in every respect except
     the charge under test -- so the whole difference is the penalty and it lands on the nose. */
  const charged = lifetimeTaxes(transferPlan(50, 'taxable'));
  const exempt = lifetimeTaxes(transferPlan(50, 'taxable', (p) => { p.advanced.penaltyException = true; }));
  assert.ok(Math.abs((charged - exempt) - MOVED * RATE) < 0.01,
    'expected a penalty of ' + (MOVED * RATE).toFixed(2) + ', got ' + (charged - exempt).toFixed(2));

  /* And against the Roth conversion, directionally: the taxable destination must cost about the
     penalty more, allowing for that destination difference. */
  const toRoth = lifetimeTaxes(transferPlan(50, 'roth'));
  const gap = charged - toRoth;
  assert.ok(gap > MOVED * RATE - 1 && gap < MOVED * RATE + 100,
    'and a conversion of the same size must cost about the penalty less: gap ' + gap.toFixed(2));
});

test('S5AA 4.1 MUST NOT MOVE: the same transfer at 60 owes nothing, and a Roth conversion never does', () => {
  const at60Taxable = lifetimeTaxes(transferPlan(60, 'taxable'));
  const at60Roth = lifetimeTaxes(transferPlan(60, 'roth'));
  /* at 60 the two destinations differ only by the later tax treatment of the money, not by a penalty;
     the gap must be far smaller than a 10% charge on the amount */
  assert.ok(Math.abs(at60Taxable - at60Roth) < MOVED * RATE - 1,
    'no penalty may be charged at 60: the gap was ' + (at60Taxable - at60Roth).toFixed(2));

  /* and a conversion at 50 must cost the same as one at 60 apart from ordinary tax-table effects --
     what matters is that neither carries a 10% charge */
  const at50Roth = lifetimeTaxes(transferPlan(50, 'roth'));
  assert.ok(Math.abs(at50Roth - at60Roth) < MOVED * RATE - 1,
    'a Roth conversion is penalty-free at every age: ' + at50Roth.toFixed(2) + ' against ' + at60Roth.toFixed(2));
});

test('S5AA 4.1: the penaltyException flag still exempts a transfer, as it does a withdrawal', () => {
  const plain = lifetimeTaxes(transferPlan(50, 'taxable'));
  const excepted = lifetimeTaxes(transferPlan(50, 'taxable', (p) => { p.advanced.penaltyException = true; }));
  assert.ok(Math.abs((plain - excepted) - MOVED * RATE) < 0.01,
    'the exception must remove exactly the penalty: ' + (plain - excepted).toFixed(2));
});

test('S5AA 4.1: the RULE OF 55 exempts workplace money and NOT an IRA -- the rule reads the account', () => {
  /* The rule, asserted directly on the one definition. A household flag and a tax class cannot tell
     these two apart, which is exactly why the old gate exempted both. */
  const workplace = { type: 'traditional401k' };
  const ira = { type: 'traditionalIRA' };
  const p = { advanced: { rule55: true, penaltyException: false } };

  assert.strictEqual(engine.earlyWithdrawalPenaltyRate(p, 57, workplace), 0,
    'a 401(k) draw at 57 with the flag on is exempt');
  assert.strictEqual(engine.earlyWithdrawalPenaltyRate(p, 57, ira), RATE,
    'an IRA draw at 57 with the flag on is NOT exempt -- IRC 72(t)(2)(A)(v) is employer-plan money only');

  /* below 55 the flag does nothing even for workplace money */
  assert.strictEqual(engine.earlyWithdrawalPenaltyRate(p, 54, workplace), RATE, 'the flag starts at 55');
  /* at and after 59.5 nothing is charged at all */
  assert.strictEqual(engine.earlyWithdrawalPenaltyRate(p, 59.5, ira), 0, 'no penalty from 59.5');
  /* and the blanket exception still exempts everything */
  const excepted = { advanced: { rule55: false, penaltyException: true } };
  assert.strictEqual(engine.earlyWithdrawalPenaltyRate(excepted, 40, ira), 0, 'the exception exempts everything');
});

test('S5AA 4.1: through the plan, an IRA draw at 57 under the Rule of 55 costs MORE than a 401(k) draw', () => {
  /* The same rule, observed through runPlan rather than on the function, so the split preTax pieces in
     the funding solver are exercised and the quote is shown to agree with the commit. */
  function drawPlan(type) {
    const p = JSON.parse(JSON.stringify(defaultPlan));
    p.setupComplete = true;
    Object.assign(p.profile, { age: 57, retireAge: 57, endAge: 59, spouseOn: false, filing: 'single' });
    Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
    Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
    Object.assign(p.retirement, {
      strategy: 'fixedNominal', spending: 60000, /* RE-FIXTURED at the S5AA R18 round (workstream B, taxable basis in dollars): dividends ON at a 0% yield, so no imputed 1.5% -- at a 0% return a taxed, retained yield adds basis the account never gains, and the tax sales then realise small capital losses that are not what this test is about. */ dividendOn: true, dividendYield: 0,
      stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false,
    });
    Object.assign(p.advanced, { transferOn: false, penaltyException: false, rule55: true });
    p.accounts = [acct('s', type, 'preTax', 900000)];
    return p;
  }
  const fromWorkplace = lifetimeTaxes(drawPlan('traditional401k'));
  const fromIra = lifetimeTaxes(drawPlan('traditionalIRA'));
  assert.ok(fromIra > fromWorkplace + 1000,
    'the IRA draw must bear the penalty the 401(k) draw does not: ' + fromIra.toFixed(2)
    + ' against ' + fromWorkplace.toFixed(2));

  /* CONTROL: with the flag OFF both bear it, so the difference above is the Rule of 55 and not the
     account type doing something else. */
  const offWorkplace = lifetimeTaxes(Object.assign(drawPlan('traditional401k'), {}, (() => {
    const q = drawPlan('traditional401k'); q.advanced.rule55 = false; return q;
  })()));
  const offIra = lifetimeTaxes((() => { const q = drawPlan('traditionalIRA'); q.advanced.rule55 = false; return q; })());
  assert.ok(Math.abs(offWorkplace - offIra) < 1,
    'CONTROL: with the flag off the two account types must cost the same: '
    + offWorkplace.toFixed(2) + ' against ' + offIra.toFixed(2));
});

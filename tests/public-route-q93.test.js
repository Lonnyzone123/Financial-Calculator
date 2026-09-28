/* Q93 (F7, N1, with G2 and G6) through the PUBLIC ROUTE -- runPlan() and the rows it reports.
 *
 * tests/audit-s5aa-early-withdrawal-penalty.test.js pins the rule where it lives, by calling
 * earlyWithdrawalPenaltyRate() and withdrawFromClass() directly, and is implementation-coupled for
 * that reason. This file exists because tools/closeout-check.js refused Q93 as COUPLED-ONLY until it
 * did: a repair that cannot be seen from the public route has not been shown to reach a user.
 *
 * `penalties` is NOT a row field -- it is folded into the row's `taxes`, which is how this observes it.
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

function basePlan(age, edit) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge: age, endAge: age + 2, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0 });
  Object.assign(p.retirement, {
    strategy: 'fixedNominal', spending: 1000, /* RE-FIXTURED at the S5AA R18 round (workstream B, taxable basis in dollars): dividends ON at a 0% yield, so no imputed 1.5% -- at a 0% return a taxed, retained yield adds basis the account never gains, and the tax sales then realise small capital losses that are not what this test is about. */ dividendOn: true, dividendYield: 0,
    stages: [], expenses: [], otherIncomes: [], ssBenefit: 0, spouseSS: 0, survivor: false,
  });
  Object.assign(p.advanced, { transferOn: false, penaltyException: false, rule55: false });
  p.accounts = [acct('w', 'traditional401k', 'preTax', 900000), acct('t', 'taxable', 'taxable', 300000)];
  if (edit) edit(p);
  return p;
}

function lifetimeTaxes(p) {
  const r = engine.runPlan(p);
  assert.strictEqual(r.status, 'ok', 'the fixture must run: ' + r.status + ' / ' + r.calculationErrorCode);
  return r.rows.reduce((s, x) => s + (Number(x.taxes) || 0), 0);
}

test('Q93: a pre-tax transfer before 59.5 costs exactly 10% of what it moves', () => {
  /* Isolated by running the SAME plan with penaltyException on, so the only difference is the charge. */
  const withTransfer = (exempt) => basePlan(50, (p) => {
    Object.assign(p.advanced, {
      transferOn: true, transferAge: 50.5, transferAmount: MOVED,
      transferFrom: 'w', transferTo: 't', penaltyException: !!exempt,
    });
  });
  const charged = lifetimeTaxes(withTransfer(false));
  const exempt = lifetimeTaxes(withTransfer(true));
  assert.ok(Math.abs((charged - exempt) - MOVED * RATE) < 0.01,
    'expected ' + (MOVED * RATE).toFixed(2) + ' of penalty, got ' + (charged - exempt).toFixed(2));
});

test('Q93: the same transfer after 59.5 costs nothing extra', () => {
  const withTransfer = (exempt) => basePlan(62, (p) => {
    Object.assign(p.advanced, {
      transferOn: true, transferAge: 62.5, transferAmount: MOVED,
      transferFrom: 'w', transferTo: 't', penaltyException: !!exempt,
    });
  });
  assert.ok(Math.abs(lifetimeTaxes(withTransfer(false)) - lifetimeTaxes(withTransfer(true))) < 0.01,
    'past 59.5 the exception must make no difference, because nothing is charged either way');
});

test('Q93: a pre-tax to ROTH transfer is a conversion and is never penalised', () => {
  const conversion = (exempt) => basePlan(50, (p) => {
    p.accounts.push(acct('r', 'rothIRA', 'roth', 1000));
    Object.assign(p.advanced, {
      transferOn: true, transferAge: 50.5, transferAmount: MOVED,
      transferFrom: 'w', transferTo: 'r', penaltyException: !!exempt,
    });
  });
  assert.ok(Math.abs(lifetimeTaxes(conversion(false)) - lifetimeTaxes(conversion(true))) < 0.01,
    'a conversion carries no penalty, so the exception must make no difference');
});

test('Q93: under the Rule of 55, an IRA draw is penalised and a 401(k) draw is not', () => {
  /* Same plan, same draw, same flag -- only the account type differs. This exercises the per-account
     preTax pieces in the funding solver as well, since the quote has to agree with the commit. */
  const draw = (type) => {
    const p = basePlan(57);
    p.retirement.spending = 60000;
    p.advanced.rule55 = true;
    p.accounts = [acct('s', type, 'preTax', 900000)];
    return lifetimeTaxes(p);
  };
  const workplace = draw('traditional401k');
  const ira = draw('traditionalIRA');
  assert.ok(ira > workplace + 1000,
    'the IRA draw must bear the penalty the 401(k) draw does not: ' + ira.toFixed(2)
    + ' against ' + workplace.toFixed(2));

  /* CONTROL: with the flag off the account type makes no difference, so the gap above is the Rule of 55 */
  const off = (type) => {
    const p = basePlan(57);
    p.retirement.spending = 60000;
    p.advanced.rule55 = false;
    p.accounts = [acct('s', type, 'preTax', 900000)];
    return lifetimeTaxes(p);
  };
  assert.ok(Math.abs(off('traditional401k') - off('traditionalIRA')) < 1,
    'CONTROL: with the flag off the two account types cost the same');
});

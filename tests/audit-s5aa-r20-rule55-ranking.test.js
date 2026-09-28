/* S5AA R20 round: R18F-03 -- THE OPTIMIZED ORDER PRICES THE EARLY-DISTRIBUTION TAX THE WAY THE DRAW CHARGES IT
 * (ChatGPT's R18 full-model audit, 2026-09-24, priority 2; its own number R18-03, renumbered R18F-03; repair chosen by the owner
 * 2026-09-23).
 *
 * smartWithdrawalOrder() added its early-tax weight (+45) to the WHOLE pre-tax class unless a household rule excused it
 * -- and that rule lifted the weight for Rule of 55 at the primary age, IRAs included, while the draw itself
 * (earlyWithdrawalPenaltyRate()) exempts only an employer plan, on its owner's age (R18F-02). So turning Rule of 55 on
 * could send the optimizer to an IRA the 10% still reaches. The weight is now the share of the pre-tax balance the
 * draw's own rule would tax, as the HSA weight beside it already was (Q99): the ranking reads the same rule as the
 * quote and the commit.
 *
 * The plans: a couple, both 56, one projected year, zero return, $50,000 of spending, "legacy" optimized order,
 * $50,000 in a brokerage account at full basis and $50,000 in one pre-tax account. The brokerage account realises
 * nothing, so a draw from it is taxed $0. Drawing the pre-tax account is ordinary income of $50,000: $17,800 over the
 * $32,200 joint standard deduction, taxed 10% federal ($1,780) and 2.5% Arizona ($445), $2,225 in all -- plus $5,000
 * where the 10% early tax applies (the audit's $7,225).
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
const validator = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const round = (x) => Math.round(Number(x) * 100) / 100;

const account = (o) => Object.assign({ name: o.id, owner: 'self', contribution: 0, contributionMode: 'amount', basisPct: 0,
  annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {},
  matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 }, o);

/* The audit's plan. The survivor weight (a spouse expected to die within ten years) takes 6 off pre-tax and "legacy"
   takes 8, so pre-tax scores 20 - 8 - 6 = 6 against taxable's 10 without the early-tax weight, and 51 with it. */
function plan(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 56, spouseAge: o.spouseAge || 56, spouseOn: true, filing: 'mfj', retireAge: 55, endAge: 57 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'annual' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 55 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 50000, ssBenefit: 0, spouseSS: 0, pension: 0, stages: [],
    expenses: [], otherIncomes: [], dividendOn: true, dividendYield: 0, withdrawalOrder: 'optimized', optimizationGoal: 'legacy',
    rmdSmoothing: false, irmaaGuard: false, preserveRoth: false, survivor: true, survivorSpendingReduction: 0, selfLife: 99,
    spouseLife: 63 });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, conversionOn: false, transferOn: false, healthOn: false, ltcOn: false,
    reserveOn: false, penaltyException: false, rule55: !!o.rule55, legacy: 0, debts: [], otherAssets: [] });
  p.accounts = [account({ id: 'brk', type: 'taxable', taxClass: 'taxable', balance: 50000, basisPct: 100 }),
    account({ id: 'pre', type: o.type, taxClass: 'preTax', owner: o.owner || 'self', balance: 50000 })];
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true, 'a valid plan');
  return p;
}

function row(p) {
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + ' ' + r.calculationErrorCode);
  const x = r.rows[1];
  return { withdrawals: round(x.withdrawals), taxes: round(x.taxes), taxable: round(x.taxable), preTax: round(x.preTax), total: round(x.total) };
}

const BROKERAGE_FIRST = { withdrawals: 50000, taxes: 0, taxable: 0, preTax: 50000, total: 50000 };
/* The pre-tax account pays $50,000; its $2,225 of tax is paid from the brokerage account, which realises nothing. */
const PRETAX_FIRST = { withdrawals: 52225, taxes: 2225, taxable: 47775, preTax: 0, total: 47775 };

test('R18F-03: Rule of 55 does not send the optimizer to an IRA the 10% still reaches -- the brokerage is drawn, $0 tax', () => {
  assert.deepEqual(row(plan({ type: 'traditionalIRA', rule55: true })), BROKERAGE_FIRST);
});

test('R18F-03: with only a brokerage account and an IRA, the Rule of 55 flag changes nothing', () => {
  assert.deepEqual(row(plan({ type: 'traditionalIRA', rule55: true })), row(plan({ type: 'traditionalIRA', rule55: false })));
});

test('R18F-03 control: for a 401(k) the flag still matters -- exempt, it ranks ahead and is drawn, $2,225 of tax', () => {
  assert.deepEqual(row(plan({ type: 'traditional401k', rule55: false })), BROKERAGE_FIRST);
  assert.deepEqual(row(plan({ type: 'traditional401k', rule55: true })), PRETAX_FIRST);
});

test('R18F-03 with R18F-02: a spouse-owned IRA whose owner is 60 bears no early tax, so it is not priced as if it did', () => {
  /* The primary person is 56; the IRA's owner is 60, so no 10% applies to it and no early-tax weight belongs on it. */
  assert.deepEqual(row(plan({ type: 'traditionalIRA', owner: 'spouse', spouseAge: 60 })), PRETAX_FIRST);
});

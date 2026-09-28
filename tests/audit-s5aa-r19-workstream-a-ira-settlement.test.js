/* S5AA R19 round: WORKSTREAM A -- the annual per-owner IRA settlement and the tax-liability ledger (R10-03, R10-04, R10-05;
 * contract reviewed in ChatGPT's R18 audit, 2026-09-24; built on the owner's decision of 2026-09-23, with an unpayable final tax
 * counted as a failure). Tested through runPlan() only.
 *
 * Each distribution is priced when it happens (the provisional tax the row funds, as before); at the row's end each owner's
 * year is settled as Form 8606 settles it -- this year's nondeductible contributions are basis, QCDs come from taxable money
 * first (IRC 408(d)(8)(D)) and spend no basis, and the post-70.5 deductions reduce the QCD exclusion (Pub. 590-B) -- and the
 * difference is a true-up paid, or refunded, in the next row. Row fields (result-contract version 5): taxes = the tax paid
 * (provisional + last row's true-up), taxSettled, taxTrueUpPaid, taxOutstanding. The auditor's witnesses (R10 audit,
 * 2026-09-22) each reproduced on Windows at s5aa-r18-source before these figures were pinned: R10-03 AGI 203,750 with
 * $993.75 funded; R10-04 A AGI 3,000; R10-05 AGI 45,000.
 *
 * 2026 single, as the engine holds it: standard deduction 16,100 (+2,050 at 65+, +6,000 senior below $75,000 MAGI);
 * 10% to 12,400, 12% to 50,400, 22% to 105,700, 24% to 201,775. Arizona 2.5% of AGI less 16,100 and $2,100 per person 65+.
 * Every figure is computed by hand.
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
const near = (actual, expected, label) => assert.equal(round(actual), round(expected), label);
const acct = (id, type, taxClass, owner, balance, extra) => Object.assign({
  id, name: id, type, taxClass, owner, balance, basisPct: taxClass === 'taxable' ? 100 : 0,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1,
  changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0,
  profitShare: 0, vesting: 100, priority: 1 }, extra || {});
const COVER = acct('r401', 'roth401k', 'roth', 'self', 0, { contribution: 1, priority: 8 });
const ROTH = acct('roth-ira', 'rothIRA', 'roth', 'self', 0, { priority: 3 });

function run(o) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { spouseOn: false, filing: 'single' }, o.profile);
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'annual' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0 }, o.employment);
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false,
    stages: [], expenses: [], otherIncomes: [], selfLife: 95, spouseLife: 95, withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa' }, o.retirement);
  Object.assign(p.advanced, { rmdOn: false, transferOn: false, conversionOn: false, healthOn: false, penaltyException: true, qcd: 0, debts: [], otherAssets: [] }, o.advanced);
  p.accounts = o.accounts.concat([acct('cash', 'taxable', 'taxable', 'self', 0, { priority: 9 })]);
  assert.equal(validator.validateScenario(JSON.parse(JSON.stringify(p))).valid, true, 'a valid plan');
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const at = (r, age) => r.rows.find((x) => x.age === age);

test('R10-03: this year\'s nondeductible contribution is basis for this year\'s conversion -- settled AGI, and the refund next row', () => {
  /* The auditor's witness: 45, retiring at 45.5, salary 400,000 ($200,000 for the half year), a $7,500 IRA contribution
     ($3,750 for the half year, wholly nondeductible: covered by the $1 Roth 401(k) and far above the phase-out), and the
     half-year conversion of exactly $3,750 into a Roth IRA. Settled: basis 3,750 over a pool of 0 + 3,750 converted = 100%,
     so nothing is taxable and AGI is the wages, 200,000. The row still FUNDED the provisional tax on the 3,750 (the
     conversion was priced before the contribution became basis): taxable income 187,650 against 183,900, both inside the
     24% band, so 3,750 x 24% = 900 federal + 3,750 x 2.5% = 93.75 Arizona = 993.75 -- owed back, a refund in the next row. */
  const r = run({ profile: { age: 45, retireAge: 45.5, endAge: 47 }, employment: { salary: 400000, contributionStop: 45.5 },
    advanced: { conversionOn: true, conversionAmount: 7500 },
    accounts: [acct('ira', 'traditionalIRA', 'preTax', 'self', 0, { contribution: 7500 }), ROTH, COVER] });
  near(at(r, 46).federalAgi, 200000, 'the settled AGI: the all-basis conversion is untaxed');
  near(at(r, 46).taxOutstanding, -993.75, 'the provisional tax on the conversion is refundable');
  near(at(r, 46).taxSettled, at(r, 46).taxes - 993.75, 'settled tax = the tax funded less the refund due');
  near(at(r, 47).taxTrueUpPaid, -993.75, 'the refund is received in the next row');
  near(at(r, 47).taxes, -993.75, 'that row owes nothing else, so its tax paid is the refund');
});

test('R10-04 A: a conversion and a QCD in one year -- the QCD takes taxable money first, the conversion carries the basis', () => {
  /* The 70 row (working, covered) adds $4,000 of nondeductible basis to $6,000 pre-tax. At 71: convert $5,000, then give
     $5,000. What would be includible if the IRA were all distributed: 10,000 - 4,000 = 6,000, so the whole $5,000 QCD is
     taxable money. Form 8606 then sees only the conversion: basis 4,000 over 0 + 5,000 converted = 80%, so 4,000 is basis
     and 1,000 taxable. AGI 1,000 (was 3,000: the conversion priced at 40% of a $10,000 pool). No tax either way. */
  const r = run({ profile: { age: 70, retireAge: 71, endAge: 73 }, employment: { salary: 200000, contributionStop: 71 },
    advanced: { conversionOn: true, conversionAmount: 5000, qcd: 5000 },
    accounts: [acct('ira', 'traditionalIRA', 'preTax', 'self', 6000, { contribution: 4000 }), ROTH, COVER] });
  near(at(r, 72).federalAgi, 1000);
  near(at(r, 72).taxOutstanding, 0);
});

test('R10-04 B: basis given to charity is spent -- it cannot shelter a later rollover', () => {
  /* $6,000 pre-tax + $4,000 nondeductible (the 70 row). At 71 a $10,000 charitable transfer empties the IRA: the QCD is the
     $6,000 of taxable money, and the $4,000 excess is a return of basis (Pub. 590-B, the Amy example) -- basis 0. At 72 a
     $20,000 401(k) rolls into that IRA (a rollover, not a distribution), $10,000 goes to charity and a $10,000 expense is
     drawn from it: all taxable, AGI 10,000. The engine gave 6,000: the old $4,000 of basis survived the liquidation. */
  const r = run({ profile: { age: 70, retireAge: 71, endAge: 73 }, employment: { salary: 200000, contributionStop: 71 },
    retirement: { expenses: [{ name: 'Once', age: 72, amount: 10000 }] },
    advanced: { qcd: 10000, transferOn: true, transferAge: 72, transferFrom: 'k401', transferTo: 'ira', transferAmount: 20000 },
    accounts: [acct('ira', 'traditionalIRA', 'preTax', 'self', 6000, { contribution: 4000 }),
      acct('k401', 'traditional401k', 'preTax', 'self', 20000, { priority: 2 }), COVER] });
  near(at(r, 72).federalAgi, 0, '71: the QCD is taxable money; the excess is basis, returned');
  near(at(r, 73).federalAgi, 10000, '72: no basis is left to shelter the rolled-over dollars');
});

test('R10-05: a post-70.5 deductible contribution reduces the QCD exclusion -- settled AGI 50,000, and the true-up paid next row', () => {
  /* The auditor's witness: 71, working one row, $50,000 wages, a deductible $5,000 IRA contribution (no workplace plan),
     and a $10,000 QCD. The QCD Adjustment Worksheet: 10,000 - 5,000 = 5,000 excludable; the other 5,000 is income like any
     other distribution. AGI = 50,000 - 5,000 + 5,000 = 50,000 (was 45,000). The true-up is the tax on 5,000 more: taxable
     income 20,850 -> 25,850, inside the 12% band = 600; Arizona 2.5% x 5,000 = 125; 725, paid in the next row. That row's
     own $10,000 QCD is fully excluded (the offset was used up), and the 725 is funded from the IRA -- taxable, but under
     the deduction. */
  const r = run({ profile: { age: 71, retireAge: 72, endAge: 73 }, employment: { salary: 50000, contributionStop: 72 },
    advanced: { qcd: 10000 },
    accounts: [acct('ira', 'traditionalIRA', 'preTax', 'self', 20000, { contribution: 5000 })] });
  near(at(r, 72).federalAgi, 50000);
  near(at(r, 72).taxOutstanding, 725);
  near(at(r, 72).taxSettled, at(r, 72).taxes + 725);
  near(at(r, 73).taxTrueUpPaid, 725);
  near(at(r, 73).taxes, 725, 'the true-up is the whole tax that row: its own income is under the deduction');
  near(at(r, 73).federalAgi, 725, 'the true-up was funded by a taxable IRA draw, and the offset did not apply again');
});

test('R10-05: the offset is the owner\'s own -- one spouse\'s deduction never reduces the other\'s exclusion', () => {
  /* A couple filing jointly. The self (70, turning 71 by the year's end, so the offset applies) earns $50,000 with no
     workplace plan and deducts a $5,000 IRA contribution. The spouse (71, eligible for QCDs; the self at 70 is not) gives
     $10,000 from their own IRA. The spouse has no offset: the whole QCD is excluded. AGI = 50,000 - 5,000 = 45,000. */
  const r = run({ profile: { age: 70, retireAge: 71, endAge: 71, spouseOn: true, spouseAge: 71, filing: 'mfj' },
    employment: { salary: 50000, contributionStop: 71 }, retirement: { spouseLife: 99 },
    advanced: { qcd: 10000 },
    accounts: [acct('ira', 'traditionalIRA', 'preTax', 'self', 0, { contribution: 5000 }),
      acct('sira', 'traditionalIRA', 'preTax', 'spouse', 20000, { priority: 2 })] });
  near(at(r, 71).federalAgi, 45000);
  near(at(r, 71).taxOutstanding, 0);
});

test('the ledger identities hold row by row, independently of the engine\'s own sums (R10-05 over three years)', () => {
  /* Identity 1: sum(taxes, 0..t) = sum(taxSettled, 0..t-1) + provisional(t), where provisional(t) = taxes(t) -
     taxTrueUpPaid(t). Identity 2: taxTrueUpPaid(t) = taxOutstanding(t-1). Identity 3 (networth off): networth = total -
     taxOutstanding. And lifetimeTaxes = sum(taxSettled). These prove the bookkeeping; the tests above prove the tax. */
  const r = run({ profile: { age: 71, retireAge: 72, endAge: 74 }, employment: { salary: 50000, contributionStop: 72 },
    advanced: { qcd: 10000 },
    accounts: [acct('ira', 'traditionalIRA', 'preTax', 'self', 40000, { contribution: 5000 })] });
  const rows = r.rows;
  let paid = 0, settledBefore = 0;
  rows.forEach((row, t) => {
    paid += row.taxes;
    const provisional = row.taxes - row.taxTrueUpPaid;
    near(paid, settledBefore + provisional, 'identity 1 at row ' + t);
    if (t > 0) near(row.taxTrueUpPaid, rows[t - 1].taxOutstanding, 'identity 2 at row ' + t);
    near(row.networth, row.total - row.taxOutstanding, 'identity 3 at row ' + t);
    settledBefore += row.taxSettled;
  });
  near(r.lifetimeTaxes, rows.reduce((s, x) => s + x.taxSettled, 0), 'lifetime tax is the settled sum');
  assert.ok(rows.some((x) => Math.abs(x.taxOutstanding) > 1), 'CONTROL: a true-up actually happened');
});

test('the terminal row: a final true-up the portfolio can pay comes off net worth; one it cannot pay is a failure', () => {
  /* The R10-05 year as the plan's only year: $725 is owed with no next row to pay it.
     - Payable: the IRA ends with 20,000 + 5,000 - 10,000 = 15,000. Not a failure; networth = 15,000 - 725; lifetime tax
       is the settled tax, the funded tax plus 725.
     - Unpayable (the owner, 2026-09-23): a $10,000 IRA plus the $5,000 contribution, all given away, ends with nothing. The
       unpaid 725 is that row's shortfall, and the plan fails. */
  const payable = run({ profile: { age: 71, retireAge: 72, endAge: 72 }, employment: { salary: 50000, contributionStop: 72 },
    advanced: { qcd: 10000 }, accounts: [acct('ira', 'traditionalIRA', 'preTax', 'self', 20000, { contribution: 5000 })] });
  const last = payable.rows[payable.rows.length - 1];
  near(last.taxOutstanding, 725);
  near(last.networth, last.total - 725);
  near(payable.lifetimeTaxes, last.taxes + 725);
  assert.equal(payable.failed, false);
  const unpayable = run({ profile: { age: 71, retireAge: 72, endAge: 72 }, employment: { salary: 50000, contributionStop: 72 },
    advanced: { qcd: 15000 }, accounts: [acct('ira', 'traditionalIRA', 'preTax', 'self', 10000, { contribution: 5000 })] });
  const end = unpayable.rows[unpayable.rows.length - 1];
  near(end.total, 0, 'CONTROL: nothing is left');
  near(end.taxOutstanding, 725);
  near(end.shortfall, 725, 'the unpaid final tax is the shortfall');
  assert.equal(unpayable.failed, true, 'an unpayable final tax is a failure');
});

test('CONTROL (identity 4): with no IRA basis and no QCD offset, nothing is trued up and every figure is the funded one', () => {
  /* A plain retiree drawing a traditional IRA with no basis: the settlement is never run. */
  const r = run({ profile: { age: 70, retireAge: 60, endAge: 73 }, retirement: { spending: 20000 },
    accounts: [acct('ira', 'traditionalIRA', 'preTax', 'self', 200000)] });
  r.rows.forEach((row) => {
    assert.equal(row.taxOutstanding, 0);
    assert.equal(row.taxTrueUpPaid, 0);
    assert.equal(row.taxSettled, row.taxes);
    assert.equal(row.networth, row.total);
  });
});

test('the death year: the decedent\'s QCD offset does not pass to the survivor; the IRA does', () => {
  /* A couple filing jointly. The self (70, 71 by the year's end) earns $50,000 a year with no workplace plan, contributing
     $5,000 a year to a traditional IRA, and dies in that row (selfLife 70.5): a wage ends at its earner's death, prorated
     within the row (the owner's Q3), so the row pays $25,000 of wages and a $2,500 contribution, fully deductible -- a $2,500
     post-70.5 offset (71 at the year's end). The spouse (71, eligible; the self at 70 is not) gives $10,000 in each row from
     their own IRA; the spouse has no offset, so the death-year QCD is excluded: AGI 25,000 - 2,500 = 22,500. At 71 the
     survivor gives $10,000 again. The offset was the decedent's own contribution history (the QCD Adjustment Worksheet is
     figured per taxpayer) and does not pass: the whole QCD is excluded, AGI 0. Had it passed, $2,500 would be income. */
  const r = run({ profile: { age: 70, retireAge: 71, endAge: 72, spouseOn: true, spouseAge: 71, filing: 'mfj' },
    employment: { salary: 50000, contributionStop: 71 }, retirement: { selfLife: 70.5, spouseLife: 99 },
    advanced: { qcd: 10000 },
    accounts: [acct('ira', 'traditionalIRA', 'preTax', 'self', 20000, { contribution: 5000 }),
      acct('sira', 'traditionalIRA', 'preTax', 'spouse', 20000, { priority: 2 })] });
  near(at(r, 71).federalAgi, 22500, 'the death year: half a year of wages, the deduction taken, and the QCD of the spouse excluded');
  near(at(r, 72).federalAgi, 0, 'the survivor\'s QCD is wholly excluded -- the decedent\'s offset did not pass');
  near(at(r, 72).taxOutstanding, 0);
});

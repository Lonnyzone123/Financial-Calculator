/* S5AA R31: THE BASIS A QUALIFIED HSA FUNDING DISTRIBUTION USES IS MEASURED ON ITS DATE, AND THE YEAR-END SETTLEMENT KEEPS IT
 * (ChatGPT's R30 change audit of 66c406c, R30-01, P1; the owner 2026-09-28: "Repair in R31").
 *
 * R30 (R29-02) took the basis a funding distribution uses from the IRA's taxable value first -- right -- but the year's Form 8606
 * settlement then measured that taxable value again from the DECEMBER 31 value. Growth after the funding made the IRA look more
 * taxable, so less basis was used and some of what had left with the funding came back ($406 at +10%); a loss did the opposite.
 * Notice 2008-51 measures it at the funding: "for purposes of determining the basis in any amount remaining in an IRA ... following
 * a qualified HSA funding distribution", the funding is includible up to what a total distribution would include, and its example
 * reads the basis "immediately after". Later growth is not a contribution and cannot bring transferred basis back.
 *
 * ChatGPT's witness (audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js, basisPlan(), at +10% instead of 0%): $8,600 of
 * nondeductible IRA money grows to $9,460 by 61; $5,400 funds the HSA. Taxable value $860 is used first, then $4,540 of basis:
 * $4,060 of basis on $4,060. Growth to 62 makes it $4,466, still holding $4,060. At 62-63 a deductible $2,000 goes in and a
 * $100,000 expense drains the IRA and the 401(k) at the draw (half way, so each has grown by the square root of 1.1).
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
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const CLASS = { taxable: 'taxable', traditionalIRA: 'preTax', traditional401k: 'preTax', hsa: 'hsa' };
function account(id, type, balance, extra) {
  return Object.assign({ id, name: id, type, taxClass: CLASS[type], owner: 'self', balance, basisPct: type === 'taxable' ? 100 : 0,
    contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
    futureChanges: [], allocation: { flat: 100 }, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100,
    priority: id === 'cash' ? 0 : 2 }, extra || {});
}
/* ChatGPT's basisPlan(), with the return, the IRA's opening pre-tax money, the owner, and an expense in the funding year as knobs. */
function basisPlan(o) {
  const x = Object.assign({ rate: 0, opening: 0, transferOn: true, owner: 'self', fundingYearExpense: 0 }, o);
  const spouse = x.owner === 'spouse';
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = 'redirect';
  Object.assign(p.profile, { age: 60, retireAge: 63, endAge: 63, spouseOn: spouse, filing: spouse ? 'mfj' : 'single' });
  if (spouse) Object.assign(p.profile, { spouseAge: 60, spouseRetireAge: 63, spouseEndAge: 63 });
  Object.assign(p.assumptions, { method: 'simple', returnRate: x.rate, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 64 });
  const expenses = [{ name: 'Drain', age: 62, amount: 100000 }];
  if (x.fundingYearExpense) expenses.unshift({ name: 'Funding-year draw', age: 61, amount: x.fundingYearExpense });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, dividendQualified: 100,
    dividendGrowth: 0, dividendStart: 60, pension: 0, pensionCola: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [],
    expenses, withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa',
    otherIncomes: [
      { name: 'Basis-year wages', type: 'employment', owner: x.owner, amount: 200000, start: 60, end: 61, growth: 0, growthMode: 'fixed' },
      { name: 'Later wages', type: 'employment', owner: x.owner, amount: 30000, start: 62, end: 63, growth: 0, growthMode: 'fixed' }] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, ltcOn: false, networthOn: true, otherAssets: [], debts: [],
    assetsOn: true, assetClasses: [{ id: 'flat', name: 'Flat', returnRate: x.rate, volatility: 0 }], rule55: false, penaltyException: false,
    transferOn: x.transferOn, transferFrom: 'src', transferTo: 'dst', transferAmount: 5400, transferAge: 61 });
  p.accounts = [account('cash', 'taxable', 100000, { cashHolding: true, allocation: {}, owner: 'self' }),
    account('src', 'traditionalIRA', x.opening, { owner: x.owner, contribution: 8600, futureChanges: [{ age: 61, mode: 'set', value: 0 }, { age: 62, mode: 'set', value: 2000 }] }),
    account('dst', 'hsa', 0, { owner: x.owner }),
    account('work', 'traditional401k', 0, { owner: x.owner, contribution: 1000, futureChanges: [{ age: 61, mode: 'set', value: 0 }], priority: 4 })];
  return p;
}
function run(p) {
  const v = validateScenario(JSON.parse(JSON.stringify(p)));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  assert.deepEqual((r.issues || []).filter((i) => i.severity === 'ERROR').map((i) => i.code), [], 'no ERROR issue');
  return r;
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, what + ': ' + a + ' against ' + b);

/* The rule, written out: the funding at 61 takes the IRA's taxable value on that date first, then basis; what is left grows. */
function ledger(opening, rate, funded) {
  const g = 1 + rate / 100, atFunding = (opening + 8600) * g, moved = funded ? 5400 : 0;
  const basisLeft = 8600 - Math.min(8600, Math.max(0, moved - Math.max(0, atFunding - 8600)));
  const iraAt62 = (atFunding - moved) * g, iraDraw = (iraAt62 + 2000) * Math.sqrt(g), workDraw = 1000 * g * g * Math.sqrt(g);
  return { basisLeft, agi: 30000 + (iraDraw - basisLeft) + workDraw - 2000 };
}
/* Single-filer tax on these plans (all ordinary, under the 22% bracket): 10% to $12,400 and 12% above, of AGI less $16,100; the
   model's 2.5% state estimate on the same; payroll $30,000 x 7.65%. */
function singleTax(agi) {
  const t = Math.max(0, agi - 16100);
  return Math.min(t, 12400) * 0.10 + Math.max(0, t - 12400) * 0.12 + t * 0.025 + 30000 * 0.0765;
}

for (const [label, opening, rate] of [['a gain after an all-basis funding ($406 of basis came back)', 0, 10],
  ['a gain after a mixed-pool funding ($626 came back)', 2000, 10], ['a loss after a funding (a further $414 was used)', 2000, -10]]) {
  test('R30-01: ' + label + ' -- the basis left is the basis on the funding date', () => {
    const end = run(basisPlan({ opening, rate })).rows[3], e = ledger(opening, rate, true);
    near(end.federalAgi, e.agi, 'AGI');
    near(end.taxes, singleTax(e.agi), 'tax');
    near(end.taxOutstanding, 0, 'no true-up left to explain a difference');
  });
}

test('R30-01: the same for a spouse\'s IRA funding the spouse\'s HSA on a joint return -- AGI $31,990.66, not $31,584.66', () => {
  near(run(basisPlan({ rate: 10, owner: 'spouse' })).rows[3].federalAgi, ledger(0, 10, true).agi, 'AGI');
});

test('R30-01: an ordinary IRA draw later in the funding year is priced at year end on the basis the funding left', () => {
  // At +10%: $9,460 at 61 funds $5,400, leaving $4,060 of basis on $4,060. At the draw (61.5) that is $4,060 x sqrt(1.1); $1,000 is
  // drawn; the rest grows to 62: V = ($4,060 x sqrt(1.1) - $1,000) x sqrt(1.1) = $4,466 - $1,000 x sqrt(1.1). Form 8606 prices the
  // draw on the basis left over the year-end value plus the draw: 4,060 / (V + 1,000). The funding's own $4,540 is not measured
  // again. At 62 the basis is 4,060 less the draw's nontaxable part; the deductible $2,000 goes in and the drain takes it all.
  const r = run(basisPlan({ rate: 10, fundingYearExpense: 1000 }));
  const s = Math.sqrt(1.1), V = 4466 - 1000 * s, fraction = 4060 / (V + 1000), basisAt62 = 4060 - 1000 * fraction;
  near(r.rows[2].federalAgi, 1000 * (1 - fraction), 'the funding year: only the draw\'s taxable part');
  const iraDraw = (V + 2000) * s, workDraw = 1000 * 1.1 * 1.1 * s;
  near(r.rows[3].federalAgi, 30000 + (iraDraw - basisAt62) + workDraw - 2000, 'the liquidation year');
});

test('CONTROLS: zero return (R29-02\'s witness), enough pre-tax value to cover the funding, and no funding at all are unchanged', () => {
  near(run(basisPlan()).rows[3].federalAgi, 31000, 'R29-02 at 0%');
  near(run(basisPlan({ opening: 20000, rate: 10 })).rows[3].federalAgi, ledger(20000, 10, true).agi, 'no basis used');
  near(run(basisPlan({ rate: 10, transferOn: false })).rows[3].federalAgi, ledger(0, 10, false).agi, 'no funding');
});

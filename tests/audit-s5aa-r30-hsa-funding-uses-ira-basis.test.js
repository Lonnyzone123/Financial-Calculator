/* S5AA R30: A QUALIFIED HSA FUNDING DISTRIBUTION USES UP THE IRA BASIS IT TAKES (ChatGPT's R29 change audit of aaff3f1, R29-02,
 * P1; the owner 2026-09-28: "Repair in R30").
 *
 * R29 made a traditional IRA's transfer into its owner's own HSA a qualified HSA funding distribution (IRC 408(d)(9)): tax-free,
 * not deductible, within the HSA room. It recorded nothing against the IRA's basis, so basis the funding had taken stayed on the
 * books and later sheltered deductible money. The rule, read at its sources:
 *   - IRC 408(d)(9)(A): gross income does not include a qualified HSA funding distribution "to the extent such distribution is
 *     otherwise includible in gross income";
 *   - 408(d)(9)(E): in deciding that, the amount distributed is treated as includible up to what would be includible "if all
 *     amounts were distributed from all individual retirement plans";
 *   - Notice 2008-51: for the basis left in the IRA the funding is treated as includible up to that total, and where it exceeds
 *     it, "the individual's basis in the excess amount ... does not carry over to the HSA". Its example: $200 of basis in a
 *     $2,000 IRA, a $1,500 funding distribution, and the individual "retains $200 of basis in an IRA that has a fair market value
 *     of $500".
 * So the funding comes out of the IRA's taxable value first, and only what exceeds it uses up basis, dollar for dollar. It is
 * settled with the year's Form 8606 settlement (settleIraYear()), beside the QCD, which follows the same first-taxable rule.
 *
 * ChatGPT's witness, all returns zero (audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js, basisPlan()):
 *   60-61  $200,000 of wages; $8,600 into the IRA and $1,000 into a 401(k), so the IRA money is all nondeductible: $8,600 of basis.
 *   61-62  no income; $5,400 funds the HSA at 61. The IRA has no taxable value, so all $5,400 is basis: $3,200 of basis is left
 *          on $3,200.
 *   62-63  $30,000 of wages; a deductible $2,000 into the IRA; a $100,000 expense drawn from pre-tax first empties the $5,200 IRA
 *          and the $1,000 401(k). Taxable IRA money $5,200 - $3,200 = $2,000.
 *   AGI $30,000 + $2,000 + $1,000 - $2,000 deduction = $31,000 (the engine had $29,000, the stale $8,600 of basis sheltering the
 *   deductible $2,000). Tax: federal $12,400 x 10% + $2,500 x 12% = $1,540; state ($31,000 - $16,100) x 2.5% = $372.50; payroll
 *   $30,000 x 7.65% = $2,295; $4,207.50.
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
/* ChatGPT's basisPlan(); `openingIra` is the IRA's pre-tax balance at 60 (no basis: the model takes none as an input). */
function basisPlan(o) {
  const x = Object.assign({ openingIra: 0, funding: 5400, transferOn: true }, o);
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  p.limitPolicy = 'redirect';
  Object.assign(p.profile, { age: 60, retireAge: 63, endAge: 63, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0, withdrawalTiming: 'monthly' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, growth: 0, contributionStop: 64 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: true, dividendYield: 0, dividendQualified: 100,
    dividendGrowth: 0, dividendStart: 60, pension: 0, pensionCola: 0, ssBenefit: 0, spouseSS: 0, survivor: false, stages: [],
    expenses: [{ name: 'Drain', age: 62, amount: 100000 }], withdrawalOrder: 'manual', manualOrder: 'preTax,taxable,roth,hsa',
    otherIncomes: [
      { name: 'Basis-year wages', type: 'employment', owner: 'self', amount: 200000, start: 60, end: 61, growth: 0, growthMode: 'fixed' },
      { name: 'Later wages', type: 'employment', owner: 'self', amount: 30000, start: 62, end: 63, growth: 0, growthMode: 'fixed' }] });
  Object.assign(p.advanced, { rmdOn: false, conversionOn: false, healthOn: false, ltcOn: false, networthOn: true, otherAssets: [], debts: [],
    assetsOn: true, assetClasses: [{ id: 'flat', name: 'Flat', returnRate: 0, volatility: 0 }], rule55: false, penaltyException: false,
    transferOn: x.transferOn, transferFrom: 'src', transferTo: 'dst', transferAmount: x.funding, transferAge: 61 });
  p.accounts = [account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} }),
    account('src', 'traditionalIRA', x.openingIra, { contribution: 8600, futureChanges: [{ age: 61, mode: 'set', value: 0 }, { age: 62, mode: 'set', value: 2000 }] }),
    account('dst', 'hsa', 0),
    account('work', 'traditional401k', 0, { contribution: 1000, futureChanges: [{ age: 61, mode: 'set', value: 0 }], priority: 4 })];
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

/* RE-FIXTURED BY INTENT at S5AA R33 (SA32F-11): this plan's $1,000 401(k) deferral is funded by $200,000 of employment-STREAM
   wages, which the engine used not to exclude. Excluded, the basis year's AGI is $199,000 and its tax $265 lower (1,000 x (24% + 2.5%));
   the $265 stays in the 0%-return cash account, so every later net worth is $265 higher. The later years are unchanged. */
test('R29-02 WITNESS: funding from an all-basis IRA uses up $5,400 of basis, so the later deductible $2,000 is taxed when drawn', () => {
  const r = run(basisPlan());
  near(r.rows[1].federalAgi, 199000, 'the basis year: $200,000 of stream wages less the $1,000 deferral (R33)');
  near(r.rows[1].preTax, 9600, 'the basis year: $8,600 IRA + $1,000 401(k)');
  near(r.rows[2].federalAgi, 0, 'the funding year: no income and no deduction');
  near(r.rows[2].preTax, 4200, 'the funding year: $3,200 IRA + $1,000 401(k)');
  near(r.rows[2].hsa, 5400, 'the funding year: the HSA');
  const end = r.rows[3];
  near(end.federalAgi, 31000, 'the liquidation year: $30,000 + $2,000 + $1,000 - $2,000');
  near(end.taxes, 4207.5, 'the liquidation year: tax');
  near(end.hsa, 5400, 'the HSA');
  near(end.total, 181987, 'net worth (ChatGPT\'s $181,722, plus the $265 the excluded deferral saves in the basis year: R33)');
});

test('R29-02 CONTROL: with no funding the same plan drains $10,600 of IRA carrying $8,600 of real basis -- AGI $31,000', () => {
  // Taxable IRA money $10,600 - $8,600 = $2,000; AGI $30,000 + $2,000 + $1,000 - $2,000 = $31,000; tax $4,207.50 (ChatGPT's).
  const end = run(basisPlan({ transferOn: false })).rows[3];
  near(end.federalAgi, 31000, 'AGI');
  near(end.taxes, 4207.5, 'tax');
  near(end.total, 181987, 'net worth ($181,722 + $265, R33)');
});

test('R29-02 MIXED: funding larger than the IRA\'s taxable value takes that value first, then basis for the rest', () => {
  // $2,000 of pre-tax money at 60, then $8,600 nondeductible: $10,600 holding $8,600 of basis. The $5,400 takes the $2,000 of
  // taxable value first and $3,400 of basis: $5,200 is left, all basis. At 62 the deductible $2,000 is added: $7,200 holding
  // $5,200 of basis, so the liquidation's taxable IRA money is $2,000. AGI $30,000 + $2,000 + $1,000 - $2,000 = $31,000 (the stale
  // $8,600 of basis covered all $7,200: $29,000).
  near(run(basisPlan({ openingIra: 2000 })).rows[3].federalAgi, 31000, 'AGI');
});

test('R29-02 CONTROL: funding within the IRA\'s taxable value uses no basis at all -- the Notice 2008-51 example\'s rule', () => {
  // $20,000 of pre-tax money, then $8,600 nondeductible: $28,600 holding $8,600 of basis, $20,000 taxable. The $5,400 is all
  // taxable value, so $8,600 of basis stays on $23,200 (as the Notice's $200 stays on $500). At 62, +$2,000 deductible: $25,200
  // holding $8,600; taxable IRA money $16,600. AGI $30,000 + $16,600 + $1,000 - $2,000 = $45,600.
  near(run(basisPlan({ openingIra: 20000 })).rows[3].federalAgi, 45600, 'AGI');
});

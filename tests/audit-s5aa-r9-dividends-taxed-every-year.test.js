/* S5AA R9 round, the owner's decision Q4 (2026-09-21), the dividends-ON half, which is known item 5.2: WITH THE DIVIDEND
 * FEATURE ON, THE ENTERED YIELD IS TAXED IN EVERY YEAR, NOT ONLY ONCE THE CASH STARTS BEING PAID OUT.
 *
 * The app says "Total-return assumptions already include reinvested dividends", and the feature is "Take taxable-account
 * dividends as retirement income": it decides when the dividend CASH is paid out to spend (from the later of retirement
 * and the dividend start age), not whether dividends exist. Before that age they are reinvested inside the total
 * return -- and a reinvested dividend is taxable in the year it is paid (IRC 61(a)(7); Form 1099-DIV reports it either
 * way). The engine taxed only the paid-out cash, so a household that turned the feature ON paid NO dividend tax at all
 * before retirement, while the same household with it OFF was charged the imputed 1.5% from the first year. Turning
 * the feature on lowered the tax. MEASURED at 623cf64: $1,000,000 taxable at a 3% yield, age 50, MAGI 0 at 51.
 *
 * After the payout starts nothing changes: the paid cash is what is taxed. A row that straddles the start age is taxed
 * on both parts, each for its own share of the row. The qualified share applies to both.
 * NOT CHANGED HERE: the dividends-OFF branch (the imputed 1.5%) -- Claude's recommendation on it rested on a misreading,
 * and it is back with the owner.
 *
 * Expected values are derived here. Returns, inflation, salary, benefits and spending are zero, so the only income in a
 * row is the dividend, and a MAGI is the dividend itself.
 * Tested through runPlan only.
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
const defaultPlan = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js')).extractDefaultPlan(SHELL);

const taxable = (balance) => ({ id: 'brokerage', name: 'brokerage', owner: 'self', type: 'brokerage', taxClass: 'taxable', balance, basisPct: 100,
  contribution: 0, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year',
  futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100, priority: 1 });

function run({ age = 50, retireAge = 65, endAge = 53, dividendOn = true, dividendStart = 65, dividendYield = 3, dividendQualified = 0 }) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  Object.assign(p.profile, { age, retireAge, endAge, spouseOn: false, filing: 'single' });
  Object.assign(p.employment, { salary: 0, spouseSalary: 0, contributionStop: retireAge });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, ssBenefit: 0, spouseSS: 0, pension: 0, otherIncomes: [], stages: [], expenses: [],
    dividendOn, dividendStart, dividendYield, dividendQualified, dividendGrowth: 0 });
  Object.assign(p.advanced, { rmdOn: false, qcd: 0, transferOn: false, conversionOn: false, healthOn: false, ltcOn: false, otherAssets: [], debts: [] });
  p.accounts = [taxable(1000000)];
  const r = engine.runPlan(p);
  assert.equal(r.status, 'ok', r.status + '/' + r.calculationErrorCode);
  return r;
}
const row = (r, label) => r.rows.find((x) => Math.abs(x.age - label) < 1e-9);
/* The balance the row opened with: the previous row's closing balance. */
const opening = (r, label) => { const i = r.rows.findIndex((x) => Math.abs(x.age - label) < 1e-9); return Number(r.rows[i - 1].taxable); };
const near = (a, e, what) => assert.ok(Math.abs(a - e) < 0.01, what + ': got ' + a + ', expected ' + e);

test('5.2: with dividends ON, the yield is taxed in a working year, before any cash is paid out', () => {
  const r = run({});
  /* RE-FIXTURED at the S5AA R18 round (workstream B, taxable basis in dollars): a reinvested, taxed dividend is basis, and
     at this file's 0% return the account does not grow with it -- the price has fallen by the yield. So the sale that
     pays the dividend's tax realises a small loss, which comes off the dividend in AGI. Year 1: basis is 1.03 x the
     balance when the tax is sold, a 3% loss per dollar sold. Year 2: the ratio carries over (sales are pro rata) and the
     second dividend adds another 3%: a 6% loss per dollar sold. The dividend itself is exactly as before. */
  near(Number(row(r, 51).magi), 1000000 * 0.03 - 0.03 * Number(row(r, 51).withdrawals), 'age 50-51: 3% of $1,000,000, reinvested and taxed, less the loss its tax sale realises');
  near(Number(row(r, 52).magi), opening(r, 52) * 0.03 - 0.06 * Number(row(r, 52).withdrawals), 'age 51-52: the same yield on what the account then holds');
  assert.equal(Number(row(r, 51).dividends), 0, 'and none of it is paid out as cash -- that still waits for the start age');
});

test('5.2: the qualified share applies to the reinvested dividend too', () => {
  const ordinary = run({ dividendQualified: 0 });
  const qualified = run({ dividendQualified: 100 });
  /* RE-FIXTURED at the S5AA R18 round: each plan's tax sale realises 3% of what it sells as a loss (see above), and the
     two plans sell different amounts because their tax differs; the dividend MAGI counts is the same. */
  const dividendIn = (r) => Number(row(r, 51).magi) + 0.03 * Number(row(r, 51).withdrawals);
  near(dividendIn(qualified), dividendIn(ordinary), 'MAGI counts the dividend either way');
  near(dividendIn(qualified), 30000, 'and it is the whole 3%');
  /* $30,000 of qualified dividends for a single filer sits in the 0% capital-gains band; as ordinary income it is taxed. */
  assert.ok(Number(row(qualified, 51).taxes) < Number(row(ordinary, 51).taxes), 'qualified dividends are taxed at the lower rates');
});

test('5.2: a row that straddles the start age is taxed on both parts, each for its share of the row', () => {
  const r = run({ age: 64.5, retireAge: 65, dividendStart: 65, endAge: 66 });
  near(Number(row(r, 65).magi), 1000000 * 0.03 * 0.5, 'the half year before the start: reinvested, taxed');
  assert.equal(Number(row(r, 65).dividends), 0, 'nothing paid in that half year');
  near(Number(row(r, 66).dividends), opening(r, 66) * 0.03, 'from 65: paid out as cash');
  near(Number(row(r, 66).magi), opening(r, 66) * 0.03, 'and taxed once -- the paid cash, not the cash plus a reinvested copy');
});

test('5.2 control: turning the feature on no longer LOWERS the tax -- it is taxed at the entered yield, not left untaxed', () => {
  const on = run({ dividendYield: 1.5, dividendQualified: 100 });
  const off = run({ dividendOn: false });
  near(Number(row(on, 51).magi), Number(row(off, 51).magi), 'an entered 1.5% fully qualified yield is taxed as the imputed 1.5% is');
});

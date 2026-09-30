'use strict';

/**
 * Tests for AUD-003 (RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_2026-09-08.md,
 * task T05): a mandatory RMD legally must leave the preTax account
 * regardless of whether the household needs it for spending, but any
 * portion beyond actual spending/tax/QCD need was previously discarded by a
 * `Math.max(0, ...)` clamp with no bookkeeping at all -- the balance left
 * the preTax account and the cash simply vanished from the model. Fixed by
 * retainExcessRmdCash() (src/engine.js), which deposits the excess into an
 * existing taxable account (or synthesizes one) instead.
 *
 * The tests that reach the engine's internals (retainExcessRmdCash() directly, estimateTaxes() as a tax oracle, and
 * simulatePlan() with a collector) live in tests/audit-rmd-cash-internals.test.js, split out at S5 block 2r, so this
 * file reaches the engine only through runPlan().
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');

// --- Integration tests through runPlan() ---------------------------------

function rmdPlan(overrides = {}) {
  const defaultPlanMatch = shell.match(/var defaultPlan=(\{.*?\});/);
  // eslint-disable-next-line no-eval
  const defaultPlan = eval('(' + defaultPlanMatch[1] + ')');
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.setupComplete = true;
  /* RE-FIXTURED BY INTENT at S5AA R38: the app's default plan now files single; this file's year-2 need was built on the joint return it
     filed before, so that is stated here (the single-filing checkpoints below set their own). */
  p.profile.filing = 'mfj';
  p.profile.age = 75;
  p.profile.retireAge = 65;
  p.profile.endAge = 77; // two one-year rows: 76, then 77
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  p.advanced.rmdOn = true;
  p.retirement.strategy = 'fixedNominal';
  p.retirement.spending = 0;
  p.assumptions.returnRate = 0; // isolate RMD/cash-retention behavior from investment growth
  /* RE-FIXTURED BY INTENT at S5AA R36 (SA32F-D1): later years' tax figures now index with inflation, which shrank the year-2 tax this
     file's shortfall rests on (to 145.41). Inflation is isolated as growth is, so the year-2 need is the one the fixture was built on. */
  p.assumptions.inflation = 0;
  p.assumptions.method = 'simple';
  p.accounts = [
    { id: 'pretax', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 1000000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 },
  ];
  return Object.assign(p, overrides);
}

test('AUD-003: RMD exceeding spending need is retained, not discarded -- total wealth reflects it', () => {
  const p = rmdPlan();
  p.retirement.spending = 2000; // deliberately small vs. a ~7-figure-balance RMD
  const result = engine.runPlan(p);
  const row = result.rows[1]; // the age-76 row (age-75 opening row is index 0)
  assert.ok(row, 'expected at least two rows');
  // Confirm this scenario actually produces an RMD well above spending, so the
  // test is exercising the bug's trigger condition, not a no-op case.
  assert.ok(row.rmd > 10000, `test setup sanity check: expected a large RMD, got ${row.rmd}`);
  // The excess (after spending + its own tax) must show up as taxable-account
  // wealth, not vanish. It can't all be retained (some funds its own tax), but
  // it must be far more than a bare spending-only outcome would leave behind.
  assert.ok(row.taxable > row.rmd * 0.5, `expected the bulk of the RMD's excess over spending to be retained as taxable wealth, got taxable=${row.taxable} vs rmd=${row.rmd}`);
});

test('AUD-003: RMD below spending need retains nothing -- unchanged from prior behavior', () => {
  const p = rmdPlan();
  p.retirement.spending = 10000000; // spending need far exceeds any plausible RMD
  const result = engine.runPlan(p);
  const row = result.rows[1];
  assert.equal(row.taxable, 0, 'no taxable account existed and none should have been created -- the RMD never exceeded need');
});

test('AUD-003: zero spending retains essentially the entire (tax-adjusted) RMD', () => {
  const p = rmdPlan();
  p.retirement.spending = 0;
  const result = engine.runPlan(p);
  const row = result.rows[1];
  assert.ok(row.taxable > row.rmd * 0.6, `expected most of the RMD retained with zero spending need, got taxable=${row.taxable} vs rmd=${row.rmd}`);
});

test('AUD-003: no taxable account exists -- one is synthesized to hold the retained cash rather than discarding it', () => {
  const p = rmdPlan(); // rmdPlan()'s only account is preTax; no taxable account configured
  p.retirement.spending = 0;
  assert.ok(!p.accounts.some((a) => a.taxClass === 'taxable'), 'test setup sanity check: no taxable account configured');
  const result = engine.runPlan(p);
  const row = result.rows[1];
  assert.ok(row.taxable > 0, `expected a synthesized taxable account holding the retained RMD cash, got taxable=${row.taxable}`);
});

// TG-R2-03 (RETIREMENT_ENGINE_ROUND2_AUDIT_CLAUDE_QUEUE_2026-09-08.md): the
// original version of this test placed its year-2 spending stage at opening
// age 77, but applyStage() gates on a period's OPENING age, and with
// endAge=77 the last evaluated row's opening age is 76 -- so that stage
// never fired and `shortfall===0` passed vacuously (year 2 never requested
// any spending at all). It also used a $1,000,000 account with enough spare
// capacity that even a firing stage wouldn't have proven retained cash was
// NECESSARY, just that it didn't hurt. This version uses opening age 76
// (the real second row), a small account sized so year 2 is genuinely tight,
// and a direct comparison against an otherwise-identical scenario where year
// 1's RMD surplus is spent immediately instead of retained -- proving the
// SAME year-2 need only succeeds because the retained cash was there.
function rmdCashSettlementFixture(stageValue, consumeYear1) {
  const account = [{ id: 'pretax', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 150000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 }];
  const p = rmdPlan({ accounts: account });
  p.retirement.ssBenefit = 0; // isolate RMD-retention arithmetic from an unrelated SS income stream
  const stages = [{ start: 76, end: 76, mode: 'amount', value: stageValue, growthMode: 'fixed', annualChange: 0 }];
  // Year 1's actual RMD on a $150,000 account at age 75 (24.6 divisor) is
  // $6,097.560975609756, exact; consuming exactly that via a year-1-only
  // stage leaves nothing to retain, without itself creating a year-1
  // shortfall (the RMD cash directly funds the request).
  if (consumeYear1) stages.unshift({ start: 75, end: 75, mode: 'amount', value: 6097.560975609756, growthMode: 'fixed', annualChange: 0 });
  p.retirement.stages = stages;
  return p;
}

test('AUD-003/R2-002: year-1 RMD retention with no year-2 need creates no shortfall (setup sanity check)', () => {
  const retained = rmdCashSettlementFixture(129500, false);
  const result = engine.runPlan(retained);
  assert.ok(result.rows[1].taxable > 6000, `test setup sanity check: expected year 1 to retain its RMD, got taxable=${result.rows[1].taxable}`);
});

test('AUD-003/R2-002: consuming year 1\'s RMD surplus immediately retains nothing (setup sanity check)', () => {
  const consumed = rmdCashSettlementFixture(129500, true);
  const result = engine.runPlan(consumed);
  assert.ok(Math.abs(result.rows[1].taxable) < 1, `test setup sanity check: expected nothing retained, got taxable=${result.rows[1].taxable}`);
  assert.equal(result.rows[1].shortfall, 0, 'consuming exactly the RMD amount should not itself create a shortfall');
});

test('AUD-003/R2-002: retained cash is available for spending/tax funding in a LATER period, and is genuinely necessary to avoid a shortfall', () => {
  const retained = rmdCashSettlementFixture(129500, false);
  const result = engine.runPlan(retained);
  const secondRow = result.rows[2]; // opening age 76, the row the stage targets
  assert.ok(secondRow, 'expected a third row (age 77)');
  assert.equal(secondRow.spending, 129500, 'the year-2 stage must actually have fired');
  assert.equal(secondRow.shortfall, 0, 'the year-2 spending need should be fully funded using year-1\'s retained RMD cash');
  assert.equal(secondRow.calculationError, false);
});

test('AUD-003/R2-002: the SAME year-2 need produces a genuine shortfall when year-1\'s cash was NOT retained', () => {
  const consumed = rmdCashSettlementFixture(129500, true);
  const result = engine.runPlan(consumed);
  const secondRow = result.rows[2];
  assert.equal(secondRow.spending, 129500, 'sanity check: the same stage must fire in the comparison scenario too');
  assert.ok(secondRow.shortfall > 500, `expected a genuine shortfall once year 1's RMD cash was NOT retained, got shortfall=${secondRow.shortfall}`);
});

// ---------------------------------------------------------------------------
// R2_T01_T02_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_2026-09-09.md, test gap #2:
// the two named boundary integration tests above ("RMD cash below the tax
// obligation" and "RMD cash exactly matching need") don't actually exercise
// a POSITIVE rmdCashForTax remainder followed by a real additional sale, or
// a cent-level exact cash-equals-liability reconciliation -- both were only
// loosely bounded. These add the audit's own independently-derived fixtures
// at cent precision.
// ---------------------------------------------------------------------------

function rmdCashCheckpointPlan() {
  // Matches the checkpoint used in tests/audit-r2-cash-settlement.test.js:
  // $984,000 / 24.6 (the age-75 uniform-lifetime divisor) = exactly $40,000.
  // A single, one-period plan (age 75 -> 76) isolates this period's RMD/tax
  // settlement from any second-period effect.
  const p = rmdPlan({ accounts: [{ id: 'pretax', name: '401k', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 984000, contribution: 0, contributionMode: 'amount', priority: 1, basisPct: 0, annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: false, matchCap: 0, matchRate: 0, profitShare: 0, vesting: 100 }] });
  p.profile.filing = 'single'; // the $2,497.50/$1,751.461988 checkpoints are specific to single filing status
  p.profile.endAge = 76; // one period only
  p.retirement.ssBenefit = 0; // isolate RMD/tax-settlement arithmetic from defaultPlan's own $3,000 SS default
  return p;
}

test('R2V-001 test gap: a positive RMD cash remainder below the tax obligation triggers exactly the additional sale the audit independently derived', () => {
  // $40,000 RMD (single filing, age 75, standard settings) against a
  // $39,000 spending need leaves exactly $1,000 of RMD cash for tax. The
  // real tax on $40,000 ordinary income for a single filer is $2,497.50, so
  // $1,000 of that is already covered and $1,497.50 remains -- fund it via
  // an additional taxable-class sale (100% basis, so gross-for-net at the
  // marginal rate driving 1 - .24 - .025 net-of-federal-and-AZ), i.e. exactly
  // $1,751.461988 more, for $2,751.461988 total tax paid exactly.
  const p = rmdCashCheckpointPlan();
  p.retirement.spending = 39000;
  const result = engine.runPlan(p);
  const row = result.rows[1];
  /* R6 (S5 task 8, the Arizona age-65 exemption, TAX section 5.3, ENACTED): the $2,497.50 tax, $1,497.50 residual, $1,751.461988 sale and $2,751.461988 total became $2,445.00, $1,445.00, $1,690.058480 and $2,690.058480 -- one $2,100 exemption takes $52.50 off the tax before the same gross-up.
     The mechanism this pins is unchanged, and the $2,497.50 tax, $1,497.50 residual, $1,751.461988 sale and $2,751.461988 total returns exactly with the exemption set to $0. */
  /* S5AA task 3.1 (Q88): the $2,445.00 tax becomes $2,199.00 -- the IRC 63(f) additional deduction for the
     aged is $2,050 at the 12% bracket -- so the residual falls from $1,445.00 to $1,199.00 and takes THE SAME
     gross-up: 1199 / 0.855 = 1,402.339181, giving $2,402.339181 in total. The mechanism is untouched. */
  const expectedAdditionalSale = 1199 / 0.855; // the same gross-up on the $1,199.00 residual ($1,445.00 before the 63(f) deduction)
  assert.ok(Math.abs(expectedAdditionalSale - 1402.339181) < 0.001, `test setup sanity check: expected $1,402.339181 ($1,690.058480 before the 63(f) additional deduction), got ${expectedAdditionalSale}`);
  assert.equal(row.calculationError, false);
  assert.equal(row.shortfall, 0);
  assert.ok(Math.abs(row.taxes - (1000 + expectedAdditionalSale)) < 0.01, `expected total tax paid of exactly $2,402.339181 ($2,690.058480 before the 63(f) additional deduction), got ${row.taxes}`);
});

test('R2V-001 test gap: real cash exactly equal to the tax liability (to the cent) reconciles with exactly zero residual', () => {
  const p = rmdCashCheckpointPlan();
  // At $40,000 ordinary income, single filing, the real tax is exactly
  // $2,497.50 (the same stored checkpoint the R2-T01 quote tests verify
  // directly) -- so a $37,502.50 spending stage consumes the RMD down to
  // exactly the cash needed to fund its own tax, cent for cent.
  /* R6 (S5 task 8, the Arizona age-65 exemption, TAX section 5.3, ENACTED): the $2,497.50 tax became $2,445.00 -- one $2,100 exemption takes $52.50 off it, so the spending that leaves exactly the tax in cash is $37,555.00.
     The mechanism this pins is unchanged, and the $2,497.50 tax returns exactly with the exemption set to $0. */
  /* S5AA task 3.1 (Q88): the tax is now $2,199.00, so the spending that leaves EXACTLY the tax in cash is
     $37,801.00. This input is derived from the liability by construction -- the whole point of the fixture is
     that real cash equals the tax to the cent -- so it moves with the liability, as it did under S5 task 8. */
  p.retirement.spending = 40000 - 2199;
  const result = engine.runPlan(p);
  const row = result.rows[1];
  assert.equal(row.calculationError, false);
  assert.equal(row.shortfall, 0);
  assert.ok(Math.abs(row.taxable) < 0.01, `expected exactly zero retained cash, got ${row.taxable}`);
});

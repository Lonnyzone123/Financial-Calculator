'use strict';

// FM-03 (whole-model audit, 2026-09-10) -- P1, household cash-accounting
// omission.
//
// THE DEFECT. With income offset enabled the engine computes
//
//     need = max(0, requested - outside)
//
// and throws away the negative side. Only surplus *RMD* cash was ever
// tracked as available (rmdCashForTax). Pension, Social Security, other
// income and dividend cash beyond requested spending had no tax-cash source
// and no retained-cash destination -- so it simply ceased to exist.
//
// Reproduced before the repair: a retired single person with a $1,000,000
// taxable portfolio at 100% basis, zero returns/inflation/fees, $60,000
// pension and $20,000 of requested spending. The engine SOLD $6,290 of
// investments to pay the tax bill while $40,000 of pension cash vanished.
// No shortfall, no calculation error, and -- importantly -- no L4 invariant
// failure, because the L4 identity is a PORTFOLIO identity and this is a
// HOUSEHOLD defect. The omitted cash never enters the equation being
// asserted, so it cannot violate it. (Audit section B.)
//
// THE REPAIR, and the policy it carries (user decision D-1). Outside cash
// beyond actual spending is now tracked, offered to tax funding BEFORE any
// asset is sold, and whatever remains is disposed of according to an
// explicit preset -- `advanced.surplusPolicy`:
//
//   'retain'  (DEFAULT) hold as cash in a named holding, no market return
//   'invest'  deposit into the taxable account the engine already picks
//   'spend'   record as additional actual spending
//
// The default is the conservative one. Any of the three is an improvement
// over the money vanishing, and 'invest' is the most generous to the plan's
// outcome, which is exactly why it must be chosen deliberately rather than
// inherited.
//
// THE ORACLE. The household identity asserted here is built in this file and
// does NOT reuse checkRowInvariants(): an oracle derived from the code under
// test is what let this defect through in the first place.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs');
const defaultPlan = extractDefaultPlan(shell);

const OPENING = 1000000;

function plan(overrides) {
  const p = JSON.parse(JSON.stringify(defaultPlan));
  p.profile.age = 65;
  p.profile.retireAge = 65;
  p.profile.endAge = 66;
  p.profile.spouseOn = false;
  p.profile.filing = 'single';
  p.employment.salary = 0;
  p.employment.spouseSalary = 0;
  p.assumptions.method = 'simple';
  p.assumptions.returnRate = 0;
  p.assumptions.inflation = 0;
  p.assumptions.fee = 0;
  p.assumptions.volatility = 0;
  p.retirement.strategy = 'fixedNominal';
  p.retirement.spending = 20000;
  p.retirement.pension = 60000;
  p.retirement.pensionCola = 0;
  p.retirement.ssBenefit = 0;
  p.retirement.spouseSS = 0;
  p.retirement.dividendOn = false;
  p.retirement.dividendYield = 0;
  p.retirement.incomeOffset = true;
  p.retirement.stages = [];
  p.retirement.expenses = [];
  p.retirement.otherIncomes = [];
  p.advanced.rmdOn = false;
  p.advanced.debts = [];
  p.advanced.otherAssets = [];
  p.advanced.healthOn = false;
  p.advanced.ltcOn = false;
  p.accounts = [{
    id: 'a1', name: 'Taxable', type: 'taxable', taxClass: 'taxable', owner: 'self',
    balance: OPENING, basisPct: 100, contributionMode: 'dollar', contribution: 0, frequency: 12,
    annualChangeMode: 'percent', annualChange: 0, changeTiming: 'annual', contributionPreset: 'none',
    futureChanges: [], priority: 1, matchOn: false, matchRate: 0, matchCap: 0, profitShare: 0,
    vesting: 100, allocation: {},
  }];
  Object.assign(p.advanced, overrides || {});
  return p;
}

function lastRow(p) {
  const res = engine.runPlan(p);
  const rows = res.rows;
  return { res, row: rows[rows.length - 1] };
}

/**
 * The household identity, written here rather than borrowed:
 *
 *   outside income + portfolio withdrawals
 *     = spending + taxes + (change in retained cash) + (portfolio not sold)
 *
 * Expressed as a closed check on the period: every dollar of outside income
 * must be accounted for as spent, taxed, or still held somewhere. Nothing
 * may simply disappear.
 */
function householdResidual(row, openingPortfolio) {
  const income = Number(row.income) || 0;
  const withdrawals = Number(row.withdrawals) || 0;
  const spending = Number(row.spending) || 0;
  const taxes = Number(row.taxes) || 0;
  const closing = Number(row.total) || 0;
  // Sources of cash into the household this period.
  const sources = income + withdrawals;
  // Uses. Cash that stayed inside the portfolio is not a use; cash retained
  // outside the portfolio would show up as portfolio growth here because
  // retention deposits into an account.
  const uses = spending + taxes;
  const portfolioDelta = closing - (openingPortfolio - withdrawals);
  return sources - uses - portfolioDelta;
}

// ---------------------------------------------------------------------------
// 1. The first-failing case
// ---------------------------------------------------------------------------

test('FM-03: surplus outside income must not vanish', () => {
  const { row } = lastRow(plan());

  assert.equal(row.income, 60000, 'precondition: the pension is the only outside income');
  assert.equal(row.spending, 20000, 'precondition: requested spending');

  const surplus = row.income - row.spending - row.taxes;
  assert.ok(surplus > 0, 'precondition: there really is a surplus, got ' + surplus);

  // Before the repair the portfolio FELL by the tax bill while $40,000 of
  // pension cash disappeared. After it, the surplus is accounted for.
  assert.ok(
    row.total >= OPENING - 0.01,
    'the portfolio ended at ' + row.total.toFixed(2) + ', below its $' + OPENING + ' opening, ' +
    'while $' + surplus.toFixed(2) + ' of outside cash was available -- investments were sold ' +
    'to pay a bill that cash could have covered'
  );
});

test('FM-03: no assets are sold while outside cash is still available', () => {
  const { row } = lastRow(plan());
  assert.equal(
    row.withdrawals, 0,
    'withdrew ' + row.withdrawals + ' from the portfolio despite $' +
    (row.income - row.spending).toFixed(2) + ' of uncommitted outside cash'
  );
});

test('FM-03: the household identity closes -- every dollar of outside income is spent, taxed or still held', () => {
  const { row } = lastRow(plan());
  const residual = householdResidual(row, OPENING);
  assert.ok(
    Math.abs(residual) < 0.01,
    'household sources minus uses leaves ' + residual.toFixed(2) + ' unaccounted for'
  );
});

test('FM-03: the engine reports no shortfall and no calculation error for this scenario', () => {
  const { res, row } = lastRow(plan());
  assert.equal(row.shortfall, 0);
  assert.equal(res.calculationError, false);
});

// ---------------------------------------------------------------------------
// 2. The D-1 policy presets
// ---------------------------------------------------------------------------

test('FM-03: the default policy is the conservative one -- retain, not invest', () => {
  assert.equal(defaultPlan.advanced.surplusPolicy, 'retain',
    'no existing plan may silently gain market returns it did not have before');
});

test('FM-03: retain -- surplus is held and survives to the closing balance', () => {
  const { row } = lastRow(plan({ surplusPolicy: 'retain' }));
  const expected = OPENING + (row.income - row.spending - row.taxes);
  assert.ok(
    Math.abs(row.total - expected) < 0.01,
    'expected the surplus to be held (' + expected.toFixed(2) + '), got ' + row.total.toFixed(2)
  );
});

test('FM-03: spend -- surplus is recorded as actual spending, never invented silently', () => {
  const { row } = lastRow(plan({ surplusPolicy: 'spend' }));
  assert.ok(
    row.spending > 20000,
    'spending must RECORD the surplus actually spent, got ' + row.spending +
    ' -- the audit is explicit that surplus spending must be recorded, not conjured inside max(0, ...)'
  );
  const residual = householdResidual(row, OPENING);
  assert.ok(Math.abs(residual) < 0.01, 'the identity must still close, residual ' + residual.toFixed(2));
});

test('FM-03: invest -- surplus reaches an account and is subject to that account\'s treatment', () => {
  const withGrowth = plan({ surplusPolicy: 'invest' });
  withGrowth.assumptions.returnRate = 10;
  const flat = plan({ surplusPolicy: 'retain' });
  flat.assumptions.returnRate = 10;

  const invested = lastRow(withGrowth).row;
  const retained = lastRow(flat).row;
  assert.ok(
    invested.total > retained.total,
    'invested surplus must participate in market return (' + invested.total.toFixed(2) +
    ') and so exceed retained cash (' + retained.total.toFixed(2) + ')'
  );
});

test('FM-03: an unrecognised policy value falls back to the conservative default rather than losing the cash', () => {
  const { row } = lastRow(plan({ surplusPolicy: 'nonsense-value' }));
  const expected = OPENING + (row.income - row.spending - row.taxes);
  assert.ok(Math.abs(row.total - expected) < 0.01, 'an unknown policy must not resurrect the vanishing behaviour');
});

// ---------------------------------------------------------------------------
// 3. Coverage across surplus sources and sizes
// ---------------------------------------------------------------------------

test('FM-03: the same holds for Social Security and for other-income surplus, not just pensions', () => {
  const ss = plan();
  ss.retirement.pension = 0;
  ss.retirement.ssBenefit = 5000;   // monthly
  ss.retirement.ssClaim = 65;
  assert.ok(Math.abs(householdResidual(lastRow(ss).row, OPENING)) < 0.01, 'SS surplus must close the identity');

  const other = plan();
  other.retirement.pension = 0;
  other.retirement.otherIncomes = [{ type: 'recurring', owner: 'self', amount: 60000, start: 65, end: 95, growthMode: 'none', growth: 0 }];
  assert.ok(Math.abs(householdResidual(lastRow(other).row, OPENING)) < 0.01, 'other-income surplus must close the identity');
});

test('FM-03: surplus below, equal to and above the tax bill all settle correctly', () => {
  for (const pension of [21000, 25000, 60000, 250000]) {
    const p = plan();
    p.retirement.pension = pension;
    const { row } = lastRow(p);
    const residual = householdResidual(row, OPENING);
    assert.ok(
      Math.abs(residual) < 0.01,
      'pension ' + pension + ': identity residual ' + residual.toFixed(2)
    );
    assert.ok(row.shortfall === 0, 'pension ' + pension + ' should not report a shortfall');
  }
});

test('FM-03: a DEFICIT still behaves exactly as before -- the repair only touches the surplus side', () => {
  const p = plan();
  p.retirement.pension = 5000;      // far below the $20,000 requested
  const { row } = lastRow(p);
  assert.ok(row.withdrawals > 0, 'a genuine shortfall of outside income must still sell assets');
  assert.ok(row.total < OPENING, 'and the portfolio must fall');
  assert.ok(Math.abs(householdResidual(row, OPENING)) < 0.01, 'the identity must close on the deficit side too');
});

test('P2: incomeOffset is no longer a policy -- outside income always offsets the draw', () => {
  /* SUPERSEDES two tests that used to sit here. FM-03's repair was told to
     "preserve the selected incomeOffset:false policy separately", so it gated
     surplus tracking on `offset` and pinned the other path as untouched, with
     the household identity failing on it recorded as Q18's todo.

     Decision register P2 settled what that setting MEANT by removing it. The
     label read "Use outside income before portfolio withdrawals" -- a
     sequencing instruction -- while the behaviour destroyed the income: the
     household sold for its full spending, received the income, and outside
     surplus was initialised to zero. A household wanting its portfolio stressed
     as if the income were absent can set the income to zero and get exactly
     that, so the toggle duplicated existing capability and lost money doing it.

     Q18 and Q26 both close here: there is no longer an offset-disabled path for
     the household identity to fail on. */
  const p = plan();
  p.retirement.incomeOffset = false;   // as a saved plan might still carry it
  p.retirement.strategy = 'fixedNominal';
  const { res, row } = lastRow(p);

  assert.equal(res.calculationError, false, 'the plan must still compute cleanly');
  assert.equal(row.income, 60000, 'outside income is still reported');

  /* The property Q18 could not assert: the household identity closes, because
     the income now has a destination instead of ceasing to exist. */
  assert.ok(Math.abs(householdResidual(row, OPENING)) < 0.01,
    'the household identity must close whatever the stored flag says; residual was ' +
    householdResidual(row, OPENING).toFixed(2));

  /* CONTROL: an explicitly true plan produces the identical row, which is what
     "the flag no longer means anything" has to mean in practice. */
  const q = plan();
  q.retirement.incomeOffset = true;
  q.retirement.strategy = 'fixedNominal';
  assert.deepEqual(lastRow(q).row, row,
    'a stored false and a stored true must now produce the same row');
});

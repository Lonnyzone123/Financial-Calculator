/* S5AA R49 (the owner's AA1 decisions, 2026-10-03: "spending, debt, defaults and disclosure") --
 * SPENDING FLEXIBILITY STOPS AT THE FLOOR, A LONG-TERM-CARE ONSET AGE, PMI THAT ENDS, A WORKING-YEARS CHECK, AND WHAT THE APP SHOWS.
 *
 * The owner's rules built here (audit/S5AA/AA1/S5AA_AA1_CLAUDE_VERIFICATION_20261003.md, "The owner's decisions"):
 * AA1-25 (a) The flexibility cut (spending less after a down year) never takes spending below the floor the user entered for the
 *        strategy: the guardrail / floor-and-ceiling floor, the remaining-life strategy's minimum withdrawal, VPW's minimum rate. The
 *        cut stops at the floor; spending already below it (a stage, the survivor reduction) is neither cut further nor raised.
 *        (b) Validator warnings: overlapping percentage stages (they multiply); flexibility stacked on guardrails or Guyton-Klinger.
 * AA1-37 advanced.ltcOnsetAge (the primary's age), optional: the deterministic onset is that age, used as entered; Monte Carlo draws
 *        the onset uniformly from 10 years before to 10 years after it (the default rule's 20-year spread), never before the plan's
 *        starting age. Absent: today's rule, max(65, round(retireAge + 10)) weighted by the probability, and in Monte Carlo
 *        max(65, round(retireAge + 5 + 20u)).
 * AA1-34 debts[].pmiEndAge, optional: PMI stops at that age (the primary's clock, as every debt age). Absent, for a mortgage whose
 *        program is "conventional" with an original term and a remaining term entered: the midpoint of the amortization period
 *        (12 USC 4901(7), 4902(c): PMI may not be imposed "beyond the first day of the month immediately following the date that is
 *        the midpoint of the amortization period of the loan"), on the engine's month grid. Otherwise as before: while owed.
 * AA1-44 The validator warns, and the debt editor shows the lump sum, when the scheduled payment leaves a balance at the payoff age.
 * AA1-07 A working row whose pay (wages less the wage-only payroll and income tax, less contributions, less debt service and PMI in
 *        the working months) is below zero raises WORKING_YEARS_NOT_FUNDED_BY_PAY, a warning naming the first such age.
 * AA1-08 The validator warns when insurance counts in net worth from the plan's first year (the plan starts at or after the death age).
 * Disclosure: these warnings and several hidden engine disclosures reach the screen; the validator runs while the plan is edited.
 *
 * Returns are flat (one asset class), inflation 0, Roth accounts (no tax on draws). Rows are labelled by their closing age. Every
 * expected figure is hand-derived from the rule and the inputs; the derivation sits beside each case.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const validator = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));
const { validateScenario } = validator;
const SHELL = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');

const cents = (x) => Math.round(x * 100) / 100;
function run(p) {
  const v = validateScenario(structuredClone(p));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}
const at = (r, age) => { const row = r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
const roth = (balance, extra) => L.account('roth', 'rothIRA', balance, extra);
const warnings = (p, code) => validateScenario(structuredClone(p)).issues.filter((i) => i.code === code);
const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 0.01, msg + ': ' + actual + ' vs ' + expected);

// --- AA1-25 (a): the flexibility cut stops at the floor ------------------------------------------------------------------------
// Retired at 65, a flat -10% return, so every row after the first follows a down year (the first row's prior return is 0).
function down(o) {
  const p = L.basePlan({ age: 65, retireAge: 65, endAge: o.endAge ?? 67, returnRate: -10, strategy: o.strategy, spending: o.spending ?? 40000,
    flexibility: 10, accounts: [roth(o.balance)], stages: o.stages });
  Object.assign(p.retirement, { withdrawalRate: 4, floor: 30000, ceiling: 90000, rmdFloor: o.rmdFloor ?? 0, rmdMultiplier: 100,
    vpwMinRate: o.vpwMinRate ?? 0, vpwMaxRate: 100 });
  return p;
}
test('R49 AA1-25: floor and ceiling -- after a down year the floor holds ($30,000), the 10% cut does not take it to $27,000', () => {
  // Row 66: 4% of $500,000 = $20,000, raised to the $30,000 floor; no cut (prior return 0). Row 67: 4% of a smaller balance is
  // still below the floor, so the strategy gives $30,000; the cut would give $27,000, below the floor: the floor holds, $30,000.
  const r = run(down({ strategy: 'floorCeiling', balance: 500000 }));
  near(at(r, 66).spending, 30000, 'row 66');
  near(at(r, 67).spending, 30000, 'row 67: the floor');
});
test('R49 AA1-25: floor and ceiling -- a cut that would cross the floor stops at it', () => {
  // Row 66: 4% of $950,000 = $38,000. Row 67 opens at B = row 66's total; 4% of B lies between $30,000 and $33,333, so the 10% cut
  // (0.9 x 0.04 x B) falls below the $30,000 floor: spending is the floor, $30,000.
  const r = run(down({ strategy: 'floorCeiling', balance: 950000 }));
  near(at(r, 66).spending, 38000, 'row 66');
  const B = at(r, 66).total;
  assert.ok(0.04 * B > 30000 && 0.04 * B < 30000 / 0.9, 'the case needs 4% of B between the floor and floor/0.9: ' + B);
  near(at(r, 67).spending, 30000, 'row 67: the cut stops at the floor');
});
test('R49 AA1-25 control: floor and ceiling well above the floor -- the full 10% cut, 0.9 x 4% of the opening balance', () => {
  const r = run(down({ strategy: 'floorCeiling', balance: 2000000 }));
  near(at(r, 66).spending, 80000, 'row 66: 4% of $2,000,000');
  const B = at(r, 66).total;
  near(at(r, 67).spending, 0.9 * 0.04 * B, 'row 67');
  assert.ok(0.9 * 0.04 * B > 30000);
});
test('R49 AA1-25: the remaining-life strategy -- its minimum withdrawal ($30,000) holds after a down year', () => {
  // Horizon 75. Row 66: $300,000 / 10 years = $30,000 (= the minimum). Row 67: the smaller balance / 9 years is below $30,000, so the
  // minimum gives $30,000; the cut would give $27,000: the minimum holds.
  const r = run(down({ strategy: 'rmd', balance: 300000, rmdFloor: 30000, endAge: 75 }));
  near(at(r, 66).spending, 30000, 'row 66');
  assert.ok(at(r, 66).total / 9 < 30000);
  near(at(r, 67).spending, 30000, 'row 67: the minimum');
});
test('R49 AA1-25: VPW -- its 5% minimum rate holds after a down year (5% of the opening balance, not 4.5%)', () => {
  // VPW paces on the portfolio's expected real return, -10%, over 34 years from 66 to 100: the annuity factor
  // (0.9^-34 - 1) / 0.1 = 349.4 gives 0.29% of the balance, so the 5% minimum binds. Row 66: 5% of $1,000,000 = $50,000. Row 67:
  // 5% of B; the cut would give 4.5% of B, below the minimum: 5% of B.
  const r = run(down({ strategy: 'vpw', balance: 1000000, vpwMinRate: 5, endAge: 100 }));
  near(at(r, 66).spending, 50000, 'row 66');
  near(at(r, 67).spending, 0.05 * at(r, 66).total, 'row 67: the minimum rate');
});
test('R49 AA1-25: spending already below the floor by a stage is not cut further ($15,000, not $13,500)', () => {
  // A 50% stage from 66 to 70. Row 67 (opens at 66): the floor gives $30,000, the stage halves it to $15,000 -- below the floor by
  // the user's own stage. The cut cannot take spending below the floor, so it does not apply: $15,000.
  const r = run(down({ strategy: 'floorCeiling', balance: 500000, stages: [{ start: 66, end: 70, mode: 'percent', value: 50 }] }));
  near(at(r, 66).spending, 30000, 'row 66: the stage starts at 66');
  near(at(r, 67).spending, 15000, 'row 67');
});
test('R49 AA1-25 control: a strategy with no floor keeps the full cut ($40,000 -> $36,000)', () => {
  const r = run(down({ strategy: 'incomeFirst', balance: 500000, spending: 40000 }));
  near(at(r, 66).spending, 40000, 'row 66');
  near(at(r, 67).spending, 36000, 'row 67');
});

// --- AA1-25 (b): validator warnings -------------------------------------------------------------------------------------------
test('R49 AA1-25: overlapping percentage stages warn (they multiply); stages that only touch do not', () => {
  // A stage is active from its start to its end age inclusive, [start, end + 1). [70, 75] and [73, 80] share 73-75: 0.9 x 0.8 there.
  const p = L.basePlan({ stages: [{ start: 70, end: 75, mode: 'percent', value: 90 }, { start: 73, end: 80, mode: 'percent', value: 80 }] });
  const w = warnings(p, 'SPENDING_STAGES_OVERLAP');
  assert.equal(w.length, 1);
  assert.equal(w[0].severity, 'WARNING');
  // CONTROL: [70, 72] ends before 73, so [70, 73) and [73, 81) do not overlap; and an amount stage does not multiply.
  assert.equal(warnings(L.basePlan({ stages: [{ start: 70, end: 72, mode: 'percent', value: 90 }, { start: 73, end: 80, mode: 'percent', value: 80 }] }), 'SPENDING_STAGES_OVERLAP').length, 0);
  assert.equal(warnings(L.basePlan({ stages: [{ start: 70, end: 75, mode: 'percent', value: 90 }, { start: 73, end: 80, mode: 'amount', value: 30000 }] }), 'SPENDING_STAGES_OVERLAP').length, 0);
});
test('R49 AA1-25: flexibility stacked on guardrails or Guyton-Klinger warns; at 0, or on another strategy, it does not', () => {
  for (const strategy of ['guardrails', 'guyton']) assert.equal(warnings(L.basePlan({ strategy, flexibility: 10 }), 'FLEXIBILITY_WITH_GUARDRAILS').length, 1, strategy);
  assert.equal(warnings(L.basePlan({ strategy: 'guardrails', flexibility: 0 }), 'FLEXIBILITY_WITH_GUARDRAILS').length, 0);
  assert.equal(warnings(L.basePlan({ strategy: 'incomeFirst', flexibility: 10 }), 'FLEXIBILITY_WITH_GUARDRAILS').length, 0);
});

// --- AA1-37: the long-term-care onset age --------------------------------------------------------------------------------------
// Self 66, retired at 60, nothing else to spend: each row's spending is the care cost alone. $50,000 a year, 50%, two years,
// healthcare inflation 0. The default onset is max(65, round(60 + 10)) = 70.
function care(onset, o = {}) {
  const p = L.basePlan({ age: 66, retireAge: 60, endAge: 76, spending: 0, accounts: [roth(1000000)] });
  Object.assign(p.advanced, { ltcOn: true, ltcCost: 50000, ltcProbability: 50, ltcYears: 2, ltcInsurance: 0, healthInflation: 0 });
  if (onset !== undefined) p.advanced.ltcOnsetAge = onset;
  Object.assign(p.assumptions, o);
  return p;
}
test('R49 AA1-37: an onset age of 72 charges the weighted care cost in the two rows from 72, not from 70', () => {
  // 50,000 x 50% = 25,000 in the rows 72->73 and 73->74; nothing in the rows from 70.
  const r = run(care(72));
  for (const [age, cost] of [[71, 0], [72, 0], [73, 25000], [74, 25000], [75, 0]]) near(at(r, age).spending, cost, 'row ' + age);
});
test('R49 AA1-37: an onset age is used as entered, not rounded (72.5: half, whole, half)', () => {
  // Care runs from 72.5 to 74.5: half of the row closing 73, all of 74, half of 75.
  const r = run(care(72.5));
  for (const [age, cost] of [[72, 0], [73, 12500], [74, 25000], [75, 12500], [76, 0]]) near(at(r, age).spending, cost, 'row ' + age);
});
test('R49 AA1-37 control: with no onset age, care starts at max(65, round(retireAge + 10)) = 70, as before', () => {
  const r = run(care(undefined));
  for (const [age, cost] of [[70, 0], [71, 25000], [72, 25000], [73, 0]]) near(at(r, age).spending, cost, 'row ' + age);
});
// Monte Carlo: one path through simulatePlan(), with the care draw supplied. The first draw decides the event (below 50% = care);
// the second places it. Volatility 0, so returns do not matter. A drawn event charges the full cost.
function carePath(onset, draws) {
  const p = care(onset, { method: 'monteCarlo', runs: 100, volatility: 0 });
  const q = draws.slice();
  return engine.simulatePlan(structuredClone(p), engine.rng(1), 0, () => q.shift(), []);
}
test('R49 AA1-37: Monte Carlo centres the draw on the onset age -- 76 with u = 0.25 starts care at 76 - 10 + 5 = 71', () => {
  const r = carePath(76, [0.1, 0.25]);
  for (const [age, cost] of [[71, 0], [72, 50000], [73, 50000], [74, 0]]) near(at(r, age).spending, cost, 'row ' + age);
});
test('R49 AA1-37: Monte Carlo never starts care before the plan -- 72 with u = 0 gives 62, held at the starting age 66', () => {
  // Care from 66 to 68: the rows closing 67 and 68.
  const r = carePath(72, [0.1, 0]);
  for (const [age, cost] of [[67, 50000], [68, 50000], [69, 0]]) near(at(r, age).spending, cost, 'row ' + age);
});
test('R49 AA1-37 control: Monte Carlo with no onset age -- max(65, round(60 + 5 + 0.25 x 20)) = 70, as before', () => {
  const r = carePath(undefined, [0.1, 0.25]);
  for (const [age, cost] of [[70, 0], [71, 50000], [72, 50000], [73, 0]]) near(at(r, age).spending, cost, 'row ' + age);
});

// --- AA1-34: PMI ends -------------------------------------------------------------------------------------------------------
// Retired at 60, a $200,000 mortgage at 0% paying $1,000 a month (paid outside spending, so each row's spending is the PMI alone),
// housing costs on, PMI $100 a month. The balance never reaches zero inside the plan, so before R49 every row charged $1,200.
function pmi(extra) {
  const p = L.basePlan({ age: 60, retireAge: 60, endAge: 63, spending: 0, accounts: [roth(500000)] });
  p.advanced.debts = [Object.assign({ id: 'm', type: 'mortgage', name: 'Mortgage', owner: 'household', balance: 200000, rate: 0,
    paymentMonthly: 1000, payoffAge: 90, rateType: 'fixed', includePayment: false, includeHousingCosts: true, pmiMonthly: 100,
    annualPropertyTax: 0, annualInsurance: 0, hoaMonthly: 0, extraPrincipalMonthly: 0 }, extra)];
  return p;
}
const pmiRows = (p) => { const r = run(p); return [61, 62, 63].map((a) => cents(at(r, a).spending)); };
test('R49 AA1-34: PMI ends at the entered age -- 61.5 charges $1,200, $600, then nothing', () => {
  assert.deepEqual(pmiRows(pmi({ pmiEndAge: 61.5 })), [1200, 600, 0]);
});
test('R49 AA1-34: a conventional loan with no end age stops at the HPA midpoint -- 30-year term, 16 left: 61 and one month', () => {
  // Amortization began 30 - 16 = 14 years ago, so its midpoint (15 years in) is at 61. PMI may not run beyond the first day of the
  // month after the midpoint: the month opening at 61 is the last owed. Rows: $1,200; one month, $100; nothing.
  assert.deepEqual(pmiRows(pmi({ mortgageType: 'conventional', loanTermYears: 30, remainingTermYears: 16 })), [1200, 100, 0]);
  near(engine.pmiStopAge({ type: 'mortgage', mortgageType: 'conventional', loanTermYears: 30, remainingTermYears: 16 }, 60), 61 + 1 / 12, 'pmiStopAge');
});
test('R49 AA1-34: a conventional loan already past its midpoint owes no PMI (30-year term, 10 left: midpoint 5 years ago)', () => {
  assert.deepEqual(pmiRows(pmi({ mortgageType: 'conventional', loanTermYears: 30, remainingTermYears: 10 })), [0, 0, 0]);
});
test('R49 AA1-34: an entered end age overrides the midpoint (62.5 on the same conventional loan: $1,200, $1,200, $600)', () => {
  assert.deepEqual(pmiRows(pmi({ mortgageType: 'conventional', loanTermYears: 30, remainingTermYears: 16, pmiEndAge: 62.5 })), [1200, 1200, 600]);
});
test('R49 AA1-34 controls: FHA, a conventional loan without its terms, and no program keep PMI while owed ($1,200 a row)', () => {
  assert.deepEqual(pmiRows(pmi({ mortgageType: 'fha', loanTermYears: 30, remainingTermYears: 16 })), [1200, 1200, 1200], 'FHA keeps the old rule');
  assert.deepEqual(pmiRows(pmi({ mortgageType: 'conventional' })), [1200, 1200, 1200], 'no term entered');
  assert.deepEqual(pmiRows(pmi({})), [1200, 1200, 1200], 'no program entered');
});

// --- AA1-44: the residual at a forced payoff -------------------------------------------------------------------------------
// From 60, $10,000 at 0% paying $100 a month, payoff at 65: 60 payments clear $6,000, so $4,000 is forced out at 65.
function payoff(extra) {
  const p = L.basePlan({ age: 60, retireAge: 60, endAge: 70, spending: 0, accounts: [roth(500000)] });
  p.advanced.debts = [Object.assign({ id: 'd', type: 'personalLoan', name: 'Loan', owner: 'household', balance: 10000, rate: 0,
    paymentMonthly: 100, payoffAge: 65, rateType: 'fixed', includePayment: true }, extra)];
  return p;
}
test('R49 AA1-44: a payment that leaves $4,000 at the payoff age warns, and the residual function says $4,000', () => {
  const p = payoff({});
  near(validator.debtPayoffResidual(p.advanced.debts[0], 60), 4000, 'residual');
  const w = warnings(p, 'DEBT_PAYOFF_RESIDUAL');
  assert.equal(w.length, 1);
  assert.equal(w[0].severity, 'WARNING');
  assert.match(w[0].message, /4,000/);
  // Held to the engine: the row closing at 65 pays twelve $100 payments and the $4,000 forced out.
  near(at(run(p), 65).debtPaymentsTotal, 1200 + 4000, 'the engine forces out the same $4,000');
});
test('R49 AA1-44: an interest-only payment ($100 a month on $10,000 at 12%) leaves the whole $10,000', () => {
  near(validator.debtPayoffResidual(payoff({ rate: 12 }).advanced.debts[0], 60), 10000, 'residual');
});
test('R49 AA1-44: a payment that clears the debt by the payoff age ($200 a month) has no residual', () => {
  near(validator.debtPayoffResidual(payoff({ paymentMonthly: 200 }).advanced.debts[0], 60), 0, 'residual');
});
test('R49 AA1-44 control: $200 a month clears $10,000 in 50 payments (at 64 and two months) -- no warning, nothing forced out', () => {
  const p = payoff({ paymentMonthly: 200 });
  assert.equal(warnings(p, 'DEBT_PAYOFF_RESIDUAL').length, 0);
  // Rows 61-64 pay $2,400 each ($9,600); the row closing 65 pays the last two payments, $400, and nothing is forced out.
  near(at(run(p), 65).debtPaymentsTotal, 400, 'row 65');
});

// --- AA1-07: the working-years check ---------------------------------------------------------------------------------------
// Self 50, retiring at 55, $60,000 salary, nothing contributed. A mortgage at 0% paid monthly.
function working(o = {}) {
  const p = L.basePlan({ age: o.age ?? 50, retireAge: o.retireAge ?? 55, endAge: o.endAge ?? 57, salary: o.salary ?? 60000, spending: 0,
    accounts: [o.account || roth(100000)] });
  if (o.payment) p.advanced.debts = [{ id: 'm', type: 'mortgage', name: 'Mortgage', owner: 'household', balance: 1000000, rate: 0,
    paymentMonthly: o.payment, payoffAge: 95, rateType: 'fixed', includePayment: true, includeHousingCosts: false }];
  return p;
}
const workingIssue = (p) => run(p).issues.filter((i) => i.code === 'WORKING_YEARS_NOT_FUNDED_BY_PAY');
test('R49 AA1-07: $72,000 of debt payments against a $60,000 salary -- the working years are not funded by pay, from 50', () => {
  // Pay less its tax is under $60,000 and the payments are $72,000: short by at least $12,000 in the first working row (50 -> 51).
  const w = workingIssue(working({ payment: 6000 }));
  assert.equal(w.length, 1, 'raised once');
  assert.equal(w[0].severity, 'WARNING');
  assert.equal(w[0].state.age, 50);
  assert.ok(w[0].state.shortfall >= 12000 && w[0].state.shortfall < 12000 + 20000, 'short by ' + w[0].state.shortfall);
  assert.match(w[0].message, /\b50\b/);
});
test('R49 AA1-07: contributions above pay ($40,000 into a taxable account on a $30,000 salary) are not funded by pay', () => {
  const acct = L.account('brok', 'taxable', 100000, { basisPct: 100, contribution: 40000 });
  const w = workingIssue(working({ salary: 30000, account: acct }));
  assert.equal(w.length, 1);
  assert.equal(w[0].state.age, 50);
});
test('R49 AA1-07 controls: $12,000 of payments on a $60,000 salary is funded; a retired household with debt has no working rows', () => {
  // $60,000 less payroll tax ($4,590) and income tax (well under $10,000) leaves over $45,000 against $12,000.
  assert.equal(workingIssue(working({ payment: 1000 })).length, 0);
  assert.equal(workingIssue(working({ age: 60, retireAge: 60, endAge: 63, salary: 0, payment: 6000 })).length, 0);
});

// --- AA1-08: insurance in net worth from the first year ------------------------------------------------------------------------
test('R49 AA1-08: insurance counted from the first year (the plan starts after the insured\'s death age) warns', () => {
  const p = L.basePlan({ couple: true, age: 70, networthOn: true });
  Object.assign(p.retirement, { selfLife: 68, spouseLife: 95 });
  p.advanced.insurance = 500000;
  assert.equal(warnings(p, 'INSURANCE_AFTER_INSURED_DEATH').length, 1);
  // CONTROLS: a death age ahead of the plan; net worth off (the insurance is not counted).
  const later = structuredClone(p); later.retirement.selfLife = 90;
  assert.equal(warnings(later, 'INSURANCE_AFTER_INSURED_DEATH').length, 0);
  const off = structuredClone(p); off.advanced.networthOn = false;
  assert.equal(warnings(off, 'INSURANCE_AFTER_INSURED_DEATH').length, 0);
});

// --- The new values are numbers ----------------------------------------------------------------------------------------------
test('R49: the new values are numbers -- text or a negative age is refused by the validator and the engine', () => {
  const cases = [
    (p, v) => { p.advanced.ltcOnsetAge = v; },
    (p, v) => { p.advanced.debts = pmi({ pmiEndAge: v }).advanced.debts; },
    (p, v) => { p.advanced.debts = pmi({ loanTermYears: v }).advanced.debts; },
    (p, v) => { p.advanced.debts = pmi({ remainingTermYears: v }).advanced.debts; },
  ];
  cases.forEach((set, i) => {
    for (const bad of ['30', -1]) {
      const p = L.basePlan({});
      set(p, bad);
      assert.equal(validateScenario(structuredClone(p)).valid, false, 'case ' + i + ' = ' + JSON.stringify(bad));
      const r = engine.runPlan(structuredClone(p));
      assert.equal(r.calculationErrorCode, typeof bad === 'number' ? 'SCENARIO_PLAN_VALUE_OUT_OF_RANGE' : 'SCENARIO_NONNUMBER_PLAN_VALUE', 'case ' + i);
    }
  });
  // CONTROL: the same values as numbers in range run.
  const ok = L.basePlan({}); ok.advanced.ltcOnsetAge = 80; ok.advanced.debts = pmi({ pmiEndAge: 70, loanTermYears: 30, remainingTermYears: 20 }).advanced.debts;
  run(ok);
});

// --- Disclosure: the app ---------------------------------------------------------------------------------------------------
test('R49: the hidden engine disclosures are shown as cards -- and the IRMAA default stays with its own round', () => {
  const titles = SHELL.match(/var planWarningTitles=(\{[^}]*\})/);
  assert.ok(titles, 'planWarningTitles');
  const codes = Object.keys(eval('(' + titles[1] + ')'));
  for (const code of ['UNSUPPORTED_ROTH_ORDERING', 'SURVIVOR_FILING_STATUS_MODELLED', 'SPOUSAL_ROLLOVER_ASSUMED', 'WORKING_YEARS_NOT_FUNDED_BY_PAY',
    'RETIREMENT_STRATEGY_UNRECOGNIZED', 'FILING_HOUSEHOLD_MISMATCH', 'EXPENSE_AFTER_PLAN_END', 'INCOME_AFTER_PLAN_END', 'PROPOSED_RULE_USED']) {
    assert.ok(codes.includes(code), code);
  }
  assert.ok(!codes.includes('IRMAA_PRE_PLAN_MAGI_ASSUMED'), 'R48 owns the IRMAA default');
});
test('R49: the relabels -- the return, the fee, Social Security, the optimizer, dividends, insurance, the life ages, care onset', () => {
  assert.match(SHELL, /Standard · 10% \(historical US stocks\)/);
  assert.match(SHELL, /not a forecast/);
  assert.match(SHELL, /arithmetic mean/);
  assert.match(SHELL, /id="v2-fee"[^>]*><span class="v2-note">/);
  assert.match(SHELL, /Monthly Social Security at full retirement age \(today's dollars, from your SSA statement\)/);
  assert.match(SHELL, /Spouse monthly benefit at FRA \(today's dollars, from the spouse's SSA statement\)/);
  assert.match(SHELL, /assumes you keep working/);
  assert.match(SHELL, /<option value="optimized">Rule-based withdrawal order<\/option>/);
  assert.match(SHELL, /Tax-sensitive ordering goal \(heuristic\)/);
  assert.match(SHELL, /1\.5%/);
  assert.match(SHELL, /estate measure/);
  assert.match(SHELL, /the projection ends at the last modeled death/);
  assert.match(SHELL, /id="v2-ltc-onset"/);
  assert.match(SHELL, /max\(65|10 years after your retirement age/);
  const listened = JSON.parse(SHELL.match(/staticIds=(\[[^\]]*\])/)[1]);
  assert.ok(listened.includes('v2-ltc-onset'), 'the onset input recalculates on change');
});

const { loadCalculator, waitFor, setValue } = require('./lib/harness');
async function importPlan(w, edit) {
  const doc = w.document, KEY = 'investment-calculator-v2c';
  const app = JSON.parse(w.localStorage.getItem(KEY));
  const s = app.scenarios[0];
  s.setupComplete = true;
  edit(s);
  const root = doc.getElementById('investment-calculator-v2c');
  const input = root.querySelector('#v2-import-settings'), status = root.querySelector('#v2-status');
  const file = new w.File([JSON.stringify({ format: KEY, app })], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  status.textContent = '';
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await waitFor(() => status.textContent !== '', { window: w });
  assert.doesNotMatch(status.textContent, /not restored/, status.textContent);
  return root;
}
test('R49 app: the working-years card, the plan checks and the lump sum beside a payoff age', async () => {
  const dom = await loadCalculator();
  const w = dom.window, doc = w.document;
  try {
    const root = await importPlan(w, (s) => {
      Object.assign(s.profile, { age: 50, retireAge: 55, endAge: 60, filing: 'single', spouseOn: false });
      s.employment.salary = 60000; s.employment.contributionStop = 55;
      s.accounts = [{ id: 'a1', name: 'Roth', type: 'rothIRA', taxClass: 'roth', owner: 'self', balance: 800000, contribution: 0 }];
      s.advanced.debts = [
        { id: 'm', type: 'mortgage', name: 'Mortgage', balance: 1000000, rate: 0, paymentMonthly: 6000, payoffAge: 90, includePayment: true },
        { id: 'd', type: 'personalLoan', name: 'Loan', balance: 10000, rate: 0, paymentMonthly: 100, payoffAge: 55, includePayment: true },
      ];
    });
    // The validator runs on the active plan: $10,000 less 60 payments of $100 leaves $4,000 at 55.
    await waitFor(() => /4,000/.test(doc.getElementById('v2-plan-checks').textContent), { window: w, timeoutMs: 5000 });
    root.querySelector('[data-page="debts"]').click();
    assert.match(doc.getElementById('v2-debts-list').textContent, /Estimated lump sum due at the payoff age: \$4,000/);
    root.querySelector('[data-page="results"]').click();
    const perf = doc.getElementById('v2-performance');
    await waitFor(() => /\d\.\d%$/.test(doc.getElementById('v2-stat-success').textContent) && !perf.classList.contains('is-running'), { window: w, timeoutMs: 15000 });
    assert.match(doc.getElementById('v2-warnings').textContent, /Working years not funded by pay:[^]*\b50\b/);
  } finally {
    w.close();
  }
});
test('R49 app: the plan checks follow edits -- flexibility on guardrails warns, and the warning clears at 0', async () => {
  const dom = await loadCalculator();
  const w = dom.window, doc = w.document;
  try {
    const root = await importPlan(w, (s) => { s.retirement.strategy = 'guardrails'; s.retirement.flexibility = 0; });
    const checks = () => doc.getElementById('v2-plan-checks').textContent;
    await waitFor(() => doc.getElementById('v2-flexibility').value === '0', { window: w });
    assert.doesNotMatch(checks(), /flexibility/i);
    setValue(root.querySelector('#v2-flexibility'), '10');
    await waitFor(() => /flexibility/i.test(checks()), { window: w, timeoutMs: 5000 });
    setValue(root.querySelector('#v2-flexibility'), '0');
    await waitFor(() => !/flexibility/i.test(checks()), { window: w, timeoutMs: 5000 });
  } finally {
    w.close();
  }
});

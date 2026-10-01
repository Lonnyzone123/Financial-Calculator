/* S5AA R43 (the owner 2026-09-30: repair all 34 of Claude's R42F findings) -- FEDERAL TAX AND MEDICARE.
 *
 * SA42F-01, MEASURED at c67c713: self-employment profit bore SE tax but never got the IRC 199A deduction. A single retiree with
 * an $80,000 self-employment stream paid $20,286.44 where 199A gives $18,103.67. 199A(a): the lesser of 20% of qualified
 * business income and 20% of taxable income less net capital gain; (b)(3): above the threshold ($201,750 single, $403,500
 * joint for 2026, Rev. Proc. 2025-32 sec. 4.26) the wage limit phases in over $75,000 ($150,000 joint), and the model's
 * business has no W-2 wages or qualified property; (i): at least $400 once qualified business income reaches $1,000.
 *
 * SA42F-08, MEASURED at c67c713: later-year indexing widened the IRA-deduction and Roth phase-out ranges, which the statute
 * fixes (219(g)(2)(A)(ii), (7), (8); 408A(c)(3)(A)): only the starts are indexed.
 *
 * SA42F-09, MEASURED at c67c713: under the Rule of 55, the row an owner separates in charged the 10% on draws that all follow
 * the separation (72(t)(2)(A)(v)).
 *
 * SA42F-10 and SA42F-22, MEASURED at c67c713: a pre-plan IRMAA return entered as married filing separately was priced on the
 * single table; a later year's joint thresholds were indexed on their own, not set at twice the indexed single amount
 * (42 USC 1395r(i)(3); CMS's 2026 tables).
 *
 * SA42F-23, MEASURED at c67c713: a partial last row tested the age-65 amounts at the row's close, not the tax year's.
 *
 * Rows are labelled by their closing age. Every expected figure is hand-derived from the rules and the inputs.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const h = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R42F', 'SA42F', 'harness.js'));
const SH = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R42F', 'SA42F', 'STATE-HEALTH', 'common.js'));
const g = h.grid;

const cents = (x) => Math.round(x * 100) / 100;
function run(p) {
  assert.equal(h.validateScenario(structuredClone(p)).valid, true);
  const r = h.engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}
const at = (r, age) => { const row = r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
// 2026 single ordinary brackets (the rules package) and the standard deduction.
const BR = [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]];
const reg = (ti) => { let t = 0, prev = 0; for (const [cap, rate] of BR) { if (ti > prev) t += (Math.min(ti, cap) - prev) * rate; prev = cap; } return t; };
const STD = 16100, WAGE_BASE = h.RULES.federal.payroll.oasdiWageBase;
// Schedule SE, single, no wages: net earnings, the SE tax, its deductible half, and the Additional Medicare tax over $200,000.
function se(profit) {
  const net = profit * 0.9235, tax = 0.124 * Math.min(net, WAGE_BASE) + 0.029 * net;
  return { net, tax, half: tax / 2, addl: 0.009 * Math.max(0, net - 200000) };
}
function sePlan(profit, extra = {}) {
  const s = { id: 'se', name: 'Consulting', type: 'selfEmployment', amount: profit, start: 0, end: 120, owner: 'self', growthMode: 'fixed', growth: 0 };
  return g.basePlan(Object.assign({ age: 50, retireAge: 50, endAge: 52, spending: 0, otherIncomes: [s].concat(extra.incomes || []),
    accounts: [g.account('ira', 'traditionalIRA', 100000)] }, extra.plan || {}));   // an IRA earns nothing taxable here
}
// The whole row's tax for a single filer whose only income is the stream (and an optional pension), with the 199A deduction.
function handSe(profit, pension = 0) {
  const s = se(profit), agi = profit + pension - s.half, tiBefore = Math.max(0, agi - STD), qbi = profit - s.half;
  const f = Math.min(1, Math.max(0, (tiBefore - 201750) / 75000));
  let ded = Math.min(0.2 * qbi * (1 - f), 0.2 * tiBefore);
  if (qbi >= 1000) ded = Math.max(ded, 400);
  const ti = Math.max(0, tiBefore - ded);
  return { ded, total: reg(ti) + s.tax + s.addl + 0.025 * Math.max(0, agi - STD) };
}

test('R43 (SA42F-01): an $80,000 self-employment profit gets the 199A deduction -- 20% of taxable income binds', () => {
  const hand = handSe(80000);
  assert.equal(cents(hand.ded), 11649.64);
  assert.equal(cents(hand.total), 18103.67);
  assert.equal(cents(at(run(sePlan(80000)), 51).taxes), cents(hand.total));
});

test('R43 (SA42F-01): inside the phase-in range the deduction falls with taxable income (no W-2 wages)', () => {
  const hand = handSe(280000);
  assert.ok(hand.ded > 0 && hand.ded < 0.2 * (280000 - se(280000).half) * 0.5, 'the witness is inside the range');
  assert.equal(cents(at(run(sePlan(280000)), 51).taxes), cents(hand.total));
});

test('R43 (SA42F-01): above the range the deduction is the $400 minimum of 199A(i)', () => {
  const hand = handSe(400000);
  assert.equal(hand.ded, 400);
  assert.equal(cents(at(run(sePlan(400000)), 51).taxes), cents(hand.total));
});

test('R43 (SA42F-01): $1,115 of qualified business income still gets the $400 minimum', () => {
  const p = sePlan(1200, { incomes: [{ id: 'pen', name: 'Pension', type: 'pension', amount: 16500, start: 0, end: 120, owner: 'self', growthMode: 'fixed', growth: 0 }] });
  const hand = handSe(1200, 16500);
  assert.equal(hand.ded, 400);
  assert.equal(cents(at(run(p), 51).taxes), cents(hand.total));
});

test('R43 (SA42F-01): a draw that pays the spending settles against the deduction (the funding solver mirrors it)', () => {
  const p = sePlan(30000, { plan: { spending: 60000 } });
  p.accounts = [g.account('ira', 'traditionalIRA', 2000000)];
  const r = run(p);
  assert.ok(!(r.issues || []).some((x) => /QUOTE_SETTLEMENT|UNFUNDED/.test(x.code)), JSON.stringify((r.issues || []).map((x) => x.code)));
  const row = at(r, 51);
  assert.equal(cents(row.spending), 60000);
  assert.ok(row.shortfall < 0.005);
});

// SA42F-08: an active participant at $156,000 with a $1,000 401(k) deferral and a $7,500 IRA, 3% inflation.
test('R43 (SA42F-08): the IRA deduction phase-out keeps its $10,000 width in later years', () => {
  const p = g.basePlan({ age: 25, retireAge: 65, endAge: 47, inflation: 3, salary: 156000, spending: 0,
    accounts: [g.account('k', 'traditional401k', 0, { contribution: 1000 }), g.account('ira', 'traditionalIRA', 0, { contribution: 7500 })] });
  p.employment.contributionStop = 65;
  const r = run(p);
  const down = (x, m) => Math.floor(x / m + 1e-9) * m, near = (x, m) => Math.floor(x / m + 0.5 + 1e-9) * m;
  for (const yi of [19, 20]) {
    const f = Math.pow(1.03, yi), row = r.rows[yi + 1];
    const start = 81000 + near(81000 * (f - 1), 1000), end = start + 10000;
    const L = down(7500 * f, 500), magi = 156000 - 1000;
    const lim = magi >= end ? 0 : magi <= start ? L : Math.max(200, L - down(L * (magi - start) / 10000, 10));
    const agi = magi - Math.min(7500, lim), std = 16100 + down(16100 * (f - 1), 50);
    const caps = [12400, 50400, 105700, 201775].map((b) => b + down(b * (f - 1), 50));
    const ti = Math.max(0, agi - std);
    let fed = 0, prev = 0;
    [0.10, 0.12, 0.22, 0.24].forEach((rate, i) => { if (ti > prev) fed += (Math.min(ti, caps[i]) - prev) * rate; prev = caps[i]; });
    assert.equal(cents(row.taxes), cents(fed + 0.025 * ti + 0.0765 * 156000), 'tax year ' + (2026 + yi));
  }
});

// SA42F-09: single, 54, separating at 55.5 with the Rule of 55; $40,000 of spending a retired year from a 401(k).
test('R43 (SA42F-09): the separation row\'s draws all follow the separation -- no 10%', () => {
  const p = g.basePlan({ age: 54, retireAge: 55.5, endAge: 58, spending: 40000, accounts: [g.account('k', 'traditional401k', 1e6)] });
  p.advanced.rule55 = true; p.employment.contributionStop = 55.5;
  // half a retired year: W = 20,000 + 10% (W - 16,100) + 2.5% (W - 16,100), inside the 10% bracket
  const W = (20000 - 0.125 * 16100) / 0.875;
  assert.equal(cents(at(run(p), 56).taxes), cents(W - 20000));
});

test('R43 (SA42F-09) control: a separation at 54.5 is before 55 -- the next row still owes the 10%', () => {
  const p = g.basePlan({ age: 54, retireAge: 54.5, endAge: 57, spending: 40000, accounts: [g.account('k', 'traditional401k', 1e6)] });
  p.advanced.rule55 = true; p.employment.contributionStop = 54.5;
  // a full retired year with the 10%: W = 40,000 + federal(W - 16,100) + 2.5% (W - 16,100) + 10% W, solved by fixed point
  let W = 40000;
  for (let i = 0; i < 200; i++) W = 40000 + reg(W - STD) + 0.025 * (W - STD) + 0.1 * W;
  assert.equal(cents(at(run(p), 56).taxes), cents(W - 40000));
});

const PARTD = 38.99 * 12, DED = 283, annual = (b, d, n = 1) => ((b + d) * 12 + DED + PARTD) * n;

test('R43 (SA42F-10): a married-filing-separately lookback return is priced on CMS\'s separate table', () => {
  const p = SH.base({ age: 66, endAge: 69, retireAge: 60, filing: 'mfj', spouseOn: true, spouseAge: 60 });
  Object.assign(p.advanced, { healthOn: true, healthCost: 0, healthInflation: 0, irmaaMagiTwoYearsBefore: 150000, irmaaMagiOneYearBefore: 150000,
    irmaaFilingTwoYearsBefore: 'mfs', irmaaFilingOneYearBefore: 'mfs' });
  SH.income(p, 'pension', 50000);
  const r = SH.check(p);
  // above $109,000 and below $391,000: $649.20 of Part B and $83.30 of Part D
  assert.equal(cents(SH.row(r, 67).spending), cents(annual(649.20, 83.30)));
  assert.equal(cents(SH.row(r, 68).spending), cents(annual(649.20, 83.30)));
  assert.equal(cents(SH.row(r, 69).spending), cents(annual(202.90, 0)));      // the plan's own joint return of $50,000
});

test('R43 (SA42F-10): separate-return lookbacks at $100,000 and $400,000 -- the standard premium and the top tier', () => {
  const p = SH.base({ age: 66, endAge: 68, retireAge: 60, filing: 'mfj', spouseOn: true, spouseAge: 60 });
  Object.assign(p.advanced, { healthOn: true, healthCost: 0, healthInflation: 0, irmaaMagiTwoYearsBefore: 100000, irmaaMagiOneYearBefore: 400000,
    irmaaFilingTwoYearsBefore: 'mfs', irmaaFilingOneYearBefore: 'mfs' });
  SH.income(p, 'pension', 50000);
  const r = SH.check(p);
  assert.equal(cents(SH.row(r, 67).spending), cents(annual(202.90, 0)));          // at or below $109,000
  assert.equal(cents(SH.row(r, 68).spending), cents(annual(689.90, 91)));         // $391,000 or more
});

test('R43 (SA42F-22): a later year\'s joint thresholds are twice the indexed single ones', () => {
  const p = SH.base({ age: 66, endAge: 69, retireAge: 60, filing: 'mfj', spouseOn: true, spouseAge: 66 });
  p.assumptions.inflation = 2.5;
  Object.assign(p.advanced, { healthOn: true, healthCost: 0, healthInflation: 0, irmaaMagiTwoYearsBefore: 100000, irmaaMagiOneYearBefore: 223500,
    irmaaFilingTwoYearsBefore: 'mfj', irmaaFilingOneYearBefore: 'mfj' });
  SH.income(p, 'pension', 100000);
  // 2027: single 109,000 x 1.025 = 111,725, to the nearest $1,000 = 112,000; joint 224,000; $223,500 is below it
  assert.equal(cents(SH.row(SH.check(p), 68).spending), cents(annual(202.90, 0, 2)));
});

test('R43 (SA42F-23): a partial last row reads the age-65 amounts at the tax year\'s close', () => {
  const p = SH.base({ age: 89, endAge: 90.5, retireAge: 60, filing: 'mfj', spouseOn: true, spouseAge: 63 });
  SH.income(p, 'pension', 120000);
  const r = SH.check(p);
  // the last row (90 to 90.5, spouse 64 to 64.5) is a tax year closing with the spouse 65: federal 60,000 - (32,200 + 2 x 1,650
  // + 2 x 6,000) = 12,500 x 10% = 1,250; Arizona (60,000 - 32,200 - 2 x 2,100) x 2.5% = 590
  assert.equal(cents(SH.row(r, 90.5).taxes), 1840);
  // control: the full row closing at 90 (spouse 64 at its close): 120,000 - 39,850 = 80,150 -> 9,122; Arizona 2,142.50
  assert.equal(cents(SH.row(r, 90).taxes), 11264.5);
});

test('R43 (SA42F-01): draws that carry taxable income through the whole phase-in range still settle, single and joint', () => {
  for (const [profit, spending, couple] of [[150000, 250000, false], [190000, 160000, false], [300000, 420000, true], [1200, 30000, false]]) {
    const p = sePlan(profit, { plan: { spending, couple } });
    p.accounts = [g.account('ira', 'traditionalIRA', 5000000), g.account('brok', 'taxable', 400000, { basisPct: 40 })];
    const r = run(p);
    assert.ok(!(r.issues || []).some((x) => /QUOTE_SETTLEMENT|UNFUNDED/.test(x.code)), profit + ': ' + JSON.stringify((r.issues || []).map((x) => x.code)));
    for (const row of r.rows.slice(1)) assert.ok(row.shortfall < 0.005, profit + ' row ' + row.age + ' shortfall ' + row.shortfall);
  }
});

test('R43 (SA42F-01, SA42F-10): the methodology page says how 199A and a separate-return IRMAA lookback are treated', () => {
  const shell = require('node:fs').readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
  assert.match(shell, /qualified business income deduction \(IRC 199A\)/);
  assert.match(shell, /no W-2 wages and holds no qualifying property/);
  assert.match(shell, /married-filing-separately return from before the plan uses Medicare's separate table/);
});

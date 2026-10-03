'use strict';
// Read-only, public-route arithmetic audit at s5aa-r44-source (06e551e).
// Usage: node audit/S5AA/R44.1/S5AA_R44_1_MATH50_REPRO_20261002.js
// The 50 expectations below use closed-form balance equations, the IRS 2026
// single brackets/standard deduction, the model's disclosed Arizona 2026
// standard-deduction assumption, and IRS Uniform Lifetime divisor 26.5 at 73.
const L = require('../R40/S5AA_R40_CONSERVATION_GRID/lib.js');
const { validateScenario } = require('../../../src/scenario-validator.js');

const errors = [], counts = {}, worst = { balance: 0, tax: 0, rmd: 0, row: 0 };
let cases = 0, rows = 0;
function near(label, actual, expected, kind = 'row') {
  const gap = Math.abs(actual - expected);
  worst[kind] = Math.max(worst[kind], gap);
  if (!Number.isFinite(actual) || gap > 0.01) throw new Error(`${label}: actual ${actual}, expected ${expected}, gap ${gap}`);
}
function run(family, index, plan, check) {
  cases++;
  try {
    const v = validateScenario(structuredClone(plan));
    if (!v.valid) throw new Error('validator refused: ' + JSON.stringify(v.issues.filter(x => x.severity === 'ERROR')));
    const result = L.h.engine.runPlan(structuredClone(plan));
    if (result.status !== 'ok') throw new Error(`engine ${result.status}/${result.calculationErrorCode}`);
    if (!Array.isArray(result.rows)) throw new Error('no rows');
    rows += result.rows.length - 1;
    check(result);
    counts[family] = (counts[family] || 0) + 1;
  } catch (e) { errors.push({ family, index, error: String(e && e.stack || e).split('\n')[0] }); }
}

// 1–10: funded Roth-only withdrawals, zero return/income/tax.
for (let i = 0; i < 10; i++) {
  const opening = 100000 + 17000 * i, spending = 5000 + 1000 * i;
  const p = L.basePlan({ age: 60, retireAge: 60, endAge: 63, spending,
    accounts: [L.account('roth', 'rothIRA', opening)] });
  run('roth_draw', i, p, r => {
    if (r.rows.length !== 4) throw new Error('wrong row count');
    r.rows.forEach((z, year) => {
      near(`roth ${i} balance ${year}`, z.total, opening - spending * year, 'balance');
      near(`roth ${i} class ${year}`, z.roth, z.total, 'balance');
      near(`roth ${i} draw ${year}`, z.withdrawals, year ? spending : 0);
      near(`roth ${i} tax ${year}`, z.taxSettled, 0, 'tax');
      near(`roth ${i} shortfall ${year}`, z.shortfall, 0);
    });
  });
}

// 11–20: no cash flow, annual compound growth B(1+r)^n. Principal stays low
// enough that the model's 1.5% imputed retained yield does not create tax.
const rates = [-3, 0, 1, 2, 3, 4, 5, 6, 7, 8];
for (let i = 0; i < 10; i++) {
  const opening = 50000 + 25000 * i, rate = rates[i] / 100;
  const p = L.basePlan({ age: 60, retireAge: 60, endAge: 64, spending: 0, returnRate: rates[i],
    accounts: [L.account('brokerage', 'taxable', opening, { basisPct: 100 })] });
  run('compound_growth', i, p, r => {
    if (r.rows.length !== 5) throw new Error('wrong row count');
    r.rows.forEach((z, year) => {
      near(`growth ${i} balance ${year}`, z.total, opening * (1 + rate) ** year, 'balance');
      near(`growth ${i} draw ${year}`, z.withdrawals, 0);
      near(`growth ${i} settled tax ${year}`, z.taxSettled, 0, 'tax');
    });
  });
}

// 21–30: taxable deposits are an external source; with no wages, return or
// spending, the portfolio must grow by exactly the planned annual deposit.
for (let i = 0; i < 10; i++) {
  const opening = 20000 + 10000 * i, deposit = 1000 + 500 * i;
  const p = L.basePlan({ age: 40, retireAge: 45, endAge: 45, salary: 0, spending: 0,
    accounts: [L.account('cash', 'taxable', opening, { basisPct: 100, cashHolding: true, allocation: {}, contribution: deposit })] });
  p.employment.contributionStop = 45;
  run('linear_deposit', i, p, r => {
    if (r.rows.length !== 6) throw new Error('wrong row count');
    r.rows.forEach((z, year) => {
      near(`deposit ${i} balance ${year}`, z.total, opening + deposit * year, 'balance');
      near(`deposit ${i} flow ${year}`, z.contributions, year ? deposit : 0);
      near(`deposit ${i} settled tax ${year}`, z.taxSettled, 0, 'tax');
    });
  });
}

// 31–40: one-year pension only. Brackets and federal standard deduction are
// hard-coded from IRS Rev. Proc. 2025-32, independent of the engine's tables.
// Arizona's $16,100 standard deduction is an explicitly inferred model input;
// this checks arithmetic under that assumption, not a finalized state form.
const single2026 = [[12400, .10], [50400, .12], [105700, .22], [201775, .24], [256225, .32], [640600, .35], [Infinity, .37]];
function bracketTax(taxable) {
  let left = Math.max(0, taxable), lower = 0, tax = 0;
  for (const [upper, rate] of single2026) {
    const span = Math.min(left, upper - lower);
    tax += span * rate; left -= span; lower = upper;
    if (left <= 0) break;
  }
  return tax;
}
for (let i = 0; i < 10; i++) {
  const pension = 20000 + 15000 * i, opening = 100000;
  const expectedFederal = bracketTax(pension - 16100);
  const expectedArizona = Math.max(0, pension - 16100) * .025;
  const expectedTax = expectedFederal + expectedArizona;
  const p = L.basePlan({ age: 60, retireAge: 60, endAge: 61, spending: 0, pension,
    accounts: [L.account('cash', 'taxable', opening, { basisPct: 100, cashHolding: true, allocation: {} })] });
  run('pension_tax', i, p, r => {
    const z = r.rows[1];
    near(`pension ${i} AGI`, z.federalAgi, pension);
    near(`pension ${i} settled tax`, z.taxSettled, expectedTax, 'tax');
    near(`pension ${i} cash tax`, z.taxes, expectedTax, 'tax');
    near(`pension ${i} balance`, z.total, opening + pension - expectedTax, 'balance');
    near(`pension ${i} draw`, z.withdrawals, 0);
  });
}

// 41–50: single IRA owner aged 73, no spend or growth. Publication 590-B's
// Uniform Lifetime divisor at 73 is 26.5. Each RMD is below the deduction;
// it moves into retained taxable cash with no modeled income tax due.
for (let i = 0; i < 10; i++) {
  const opening = 50000 + 15000 * i, expectedRmd = opening / 26.5;
  const p = L.basePlan({ age: 73, retireAge: 73, endAge: 74, spending: 0, rmdOn: true,
    accounts: [L.account('cash', 'taxable', 0, { basisPct: 100, cashHolding: true, allocation: {} }),
      L.account('ira', 'traditionalIRA', opening)] });
  run('rmd_transfer', i, p, r => {
    const z = r.rows[1];
    near(`rmd ${i} obligation`, z.rmd, expectedRmd, 'rmd');
    near(`rmd ${i} distribution`, z.rmdDistributed, expectedRmd, 'rmd');
    near(`rmd ${i} IRA`, z.preTax, opening - expectedRmd, 'balance');
    near(`rmd ${i} cash`, z.taxable, expectedRmd, 'balance');
    near(`rmd ${i} total`, z.total, opening, 'balance');
    near(`rmd ${i} AGI`, z.federalAgi, expectedRmd);
    near(`rmd ${i} settled tax`, z.taxSettled, 0, 'tax');
    near(`rmd ${i} unmet`, z.rmdUnmet, 0);
  });
}

const summary = { source: 's5aa-r44-source/06e551e', cases, passed: cases - errors.length, rows,
  byFamily: counts, worstAbsoluteGap: worst, failures: errors };
console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;

'use strict';
// Arizona: rate, standard deduction by status, $2,100 age-65 exemption, federally taxable SS subtraction.
// Each case isolates Arizona by reading estimateTaxes().az directly AND by checking the full row's taxes.
// Hand rule (MODEL_ASSUMPTIONS.md section 16): AZ taxable = max(0, fedAGI - taxable SS - AZ std ded - 2100 x people 65+); tax = 2.5%.
const { h, base, income, check, row, cmp, summary } = require('./common.js');
const E = h.engine;

// Case 1: single, 60, $50,000 pension-type income. AZ = (50,000 - 16,100) x 2.5% = 847.50.
// Federal = 10% x 12,400 + 12% x (33,900 - 12,400) = 1,240 + 2,580 = 3,820. Row taxes 4,667.50.
{
  const p = base({ age: 60, endAge: 61 });
  income(p, 'pension', 50000);
  const r = check(p);
  const t = E.estimateTaxes(p, 60, 50000, 0, 0, 0, 0, 0);
  cmp('AZ1 single 60, 50k: estimateTaxes.az', t.az, 847.50);
  cmp('AZ1 row taxes (fed 3,820 + AZ 847.50)', row(r, 61).taxes, 4667.50);
}
// Case 2: single, 66, $60,000 pension + $30,000 Social Security.
// Provisional = 60,000 + 15,000 = 75,000. Taxable SS = min(0.85 x 30,000, 0.85 x (75,000-34,000) + min(4,500, 15,000)) = 25,500.
// AZ AGI = 85,500 - 25,500 = 60,000. AZ taxable = 60,000 - 16,100 - 2,100 = 41,800. AZ = 1,045.00.
{
  const p = base({ age: 66, endAge: 67, retireAge: 60 });
  income(p, 'pension', 60000); income(p, 'socialSecurity', 30000);
  const r = check(p);
  const t = E.estimateTaxes(p, 66, 60000, 0, 30000, 0, 0, 0);
  cmp('AZ2 single 66 SS subtraction + exemption: az', t.az, 1045.00);
  cmp('AZ2 taxable SS', t.ssTaxable, 25500);
  // Federal: deduction 16,100 + 2,050 + (6,000 - 6% x (85,500 - 75,000)) = 23,520; taxable 61,980;
  // tax = 1,240 + 4,560 + 22% x 11,580 = 8,347.60. Row = 8,347.60 + 1,045 = 9,392.60.
  cmp('AZ2 row taxes', row(r, 67).taxes, 9392.60);
}
// Case 3: MFJ, both 67, $80,000 pension. AZ = (80,000 - 32,200 - 4,200) x 2.5% = 1,090.00.
{
  const p = base({ age: 67, endAge: 68, filing: 'mfj', spouseOn: true, spouseAge: 67, retireAge: 60 });
  income(p, 'pension', 80000);
  check(p);
  cmp('AZ3 mfj both 67: az', E.estimateTaxes(p, 67, 80000, 0, 0, 0, 0, 0).az, 1090.00);
}
// Case 4: MFJ, self 67, spouse 63: one exemption. (80,000 - 32,200 - 2,100) x 2.5% = 1,142.50.
{
  const p = base({ age: 67, endAge: 68, filing: 'mfj', spouseOn: true, spouseAge: 63, retireAge: 60 });
  income(p, 'pension', 80000);
  check(p);
  cmp('AZ4 mfj one 65+: az', E.estimateTaxes(p, 67, 80000, 0, 0, 0, 0, 0).az, 1142.50);
  // swap: self 63, spouse 67 must be the same
  const q = base({ age: 63, endAge: 64, filing: 'mfj', spouseOn: true, spouseAge: 67, retireAge: 60 });
  income(q, 'pension', 80000);
  check(q);
  cmp('AZ4s mfj swapped owners: az', E.estimateTaxes(q, 63, 80000, 0, 0, 0, 0, 0).az, 1142.50);
}
// Case 5: HOH, 66: (80,000 - 24,150 - 2,100) x 2.5% = 1,343.75.
{
  const p = base({ age: 66, endAge: 67, filing: 'hoh', retireAge: 60 });
  income(p, 'pension', 80000);
  check(p);
  cmp('AZ5 hoh 66: az', E.estimateTaxes(p, 66, 80000, 0, 0, 0, 0, 0).az, 1343.75);
}
// Case 6: income below the deduction: AZ never below zero.
{
  const p = base({ age: 60, endAge: 61 });
  income(p, 'pension', 10000);
  check(p);
  cmp('AZ6 below deduction: az', E.estimateTaxes(p, 60, 10000, 0, 0, 0, 0, 0).az, 0);
}
// Case 7: capital gain and qualified dividends flow into AZ in full (the 25% post-2011 subtraction is declared not modelled).
// Single 60, ordinary 20,000, LTCG 30,000, QD 5,000: AZ AGI 55,000; AZ = (55,000 - 16,100) x 2.5% = 972.50.
{
  const p = base({ age: 60, endAge: 61 });
  check(p);
  cmp('AZ7 gains + QD in AZ base: az', E.estimateTaxes(p, 60, 20000, 30000, 0, 0, 5000, 0).az, 972.50);
}
// Case 8: capital loss: ordinary 30,000, net loss 10,000 -> 3,000 deductible. AZ AGI 27,000 -> (27,000-16,100) x 2.5% = 272.50.
{
  const p = base({ age: 60, endAge: 61 });
  check(p);
  cmp('AZ8 capital loss limited to 3,000 in AZ AGI: az', E.estimateTaxes(p, 60, 30000, -10000, 0, 0, 0, 0).az, 272.50);
}
// Case 9: the survivor year after a death files single: one exemption, single deduction.
// Couple both 70, selfLife 71: row opening 71 is the year of death (joint); row opening 72 survivor single.
// Survivor at 72 with $80,000 pension: AZ = (80,000 - 16,100 - 2,100) x 2.5% = 1,545.00.
{
  const p = base({ age: 70, endAge: 74, filing: 'mfj', spouseOn: true, spouseAge: 70, retireAge: 60, selfLife: 71 });
  income(p, 'pension', 80000, 'spouse');
  check(p);
  cmp('AZ9 survivor single year: az', E.estimateTaxes(p, 72, 80000, 0, 0, 0, 0, 0).az, 1545.00);
  cmp('AZ9b year of death joint: az (80,000-32,200-4,200) x 2.5%', E.estimateTaxes(p, 71, 80000, 0, 0, 0, 0, 0).az, 1090.00);
}
summary();

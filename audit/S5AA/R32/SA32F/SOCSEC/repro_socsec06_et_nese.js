'use strict';
// SOCSEC-06: the earnings test counts the whole self-employment PROFIT, not net earnings from self-employment.
// Law: 20 CFR 404.429(a): earnings are "wages ... plus your net earnings from self-employment"; Social Security Act
// section 211(a)(11) (and IRC 1402(a)(12)) computes net earnings from self-employment after a deduction of the net
// earnings times one-half of the combined 15.3% rate, i.e. NESE = profit * 0.9235.
// Run: node repro_socsec06_et_nese.js
const { single, run, report, h } = require('./lib.js');
let bad = 0;
// Single, 62, PIA 2,000, claims 62 -> 1,400/mo = 16,800/yr. Self-employment profit 50,000 for the row 62-63.
//   Law: NESE = 50,000 * 0.9235 = 46,175; excess over 24,480 = 21,695; withheld = 21,695 / 2 = 10,847.50.
//   Engine: (50,000 - 24,480) / 2 = 12,760.
// row.income = SE profit + SS paid, so SS paid = income - 50,000.
{
  const p = single({ age: 62, ssBenefit: 2000, ssClaim: 62 });
  p.retirement.otherIncomes = [{ name: 'business', type: 'selfEmployment', owner: 'self', amount: 50000, start: 62, end: 63, growth: 0, growthMode: 'fixed' }];
  const r = run(p);
  const paid = r.rows[1].income - 50000;
  const withheldEngine = 16800 - paid;
  bad += report('withheld in row 62-63', (50000 * 0.9235 - 24480) / 2, withheldEngine);
  // Same through the engine's own function, to show the input it receives is the gross profit:
  const d = h.engine.householdSocialSecurityDetail(p, 62, 63, 62, 0, { self: 50000, spouse: 0 }, { self: 0, spouse: 0 });
  console.log('  householdSocialSecurityDetail withheld with earnings.self = 50,000: ' + d.withheld.toFixed(2) + ', creditMonths ' + d.creditMonths.self);
  console.log('  law crediting months: ceil(10847.50 / 1400) = ' + Math.ceil(10847.5 / 1400));
}
console.log(`plans run: 1; mismatches: ${bad}`);

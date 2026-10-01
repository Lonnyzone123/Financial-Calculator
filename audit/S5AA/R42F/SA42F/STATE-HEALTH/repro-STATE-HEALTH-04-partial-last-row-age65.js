'use strict';
// STATE-HEALTH-04: a partial LAST row (a fractional ending age) tests the age-65 amounts at the row's close, which is not the
// tax year's close. The model taxes that row as a whole tax year (MODEL_ASSUMPTIONS 25) and reads the age-65 amounts at the
// year-end age (23, R33), so a person who turns 65 after the plan's ending point but inside that tax year loses Arizona's
// $2,100 exemption (A.R.S. 43-1023(E)) and the federal 63(f) / 151(d)(5)(C) amounts. Run: node repro-STATE-HEALTH-04-partial-last-row-age65.js
const { h, base, income, check, row, cmp, summary } = require('./common.js');
// Couple: self 89, spouse 63; joint; pension 120,000 a year; plan ends at self 90.5. Last row: self 90 -> 90.5, spouse 64 -> 64.5,
// income 60,000. That tax year closes with the spouse 65 (and alive).
const p = base({ age: 89, endAge: 90.5, retireAge: 60, filing: 'mfj', spouseOn: true, spouseAge: 63 });
income(p, 'pension', 120000);
const r = check(p);
const last = row(r, 90.5);
// Hand, both 65+ at the tax year's close: federal deduction 32,200 + 2 x 1,650 + 2 x 6,000 = 47,500; taxable 12,500 x 10% = 1,250.
// Arizona: 60,000 - 32,200 - 2 x 2,100 = 23,600 x 2.5% = 590. Total 1,840.
cmp('last row (partial) taxes, spouse 65 at the tax year\'s close', last.taxes, 1250 + 590);
// What the engine does (spouse read at 64.5): federal 60,000 - 39,850 = 20,150 x 10% = 2,015; Arizona 25,700 x 2.5% = 642.50.
console.log('   engine reading (spouse 64.5 at the row close) would be ' + (2015 + 642.5).toFixed(2));
// Control: the same couple one full row earlier (row closing 90, spouse 63 -> 64): no spouse amounts.
// 120,000 - 39,850 = 80,150 taxable: 10% x 24,800 + 12% x 55,350 = 9,122; AZ (120,000 - 32,200 - 2,100) x 2.5% = 2,142.50.
cmp('control full row closing 90', row(r, 90).taxes, 9122 + 2142.5);
summary();

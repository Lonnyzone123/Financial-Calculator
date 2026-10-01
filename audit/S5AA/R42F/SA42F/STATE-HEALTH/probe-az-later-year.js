'use strict';
const { h, base, income, check, row, cmp, summary } = require('./common.js');
// Single, 50, pension 60,000, inflation 2.5%. 2027: std 16,100 + floor(402.50/50)*50 = 16,500 (federal and Arizona);
// brackets 12,400 -> 12,700, 50,400 -> 51,650. Taxable 43,500: 1,270 + 12% x 30,800 = 4,966; AZ 1,087.50.
const p = base({ age: 50, endAge: 53, retireAge: 50 }); p.assumptions.inflation = 2.5; income(p, 'pension', 60000);
const r = check(p);
cmp('2026 row', row(r, 51).taxes, 1240 + 0.12 * (43900 - 12400) + 0.025 * 43900);
cmp('2027 row (indexed)', row(r, 52).taxes, 4966 + 1087.5);
// Age-65 exemption stays 2,100 in 2028+ ; single 64 -> 65 in 2028 (row 3): std 2028 = 16,100 + floor(16,100 x (1.025^2 - 1)/50)*50
const q = base({ age: 62, endAge: 66, retireAge: 60 }); q.assumptions.inflation = 2.5; income(q, 'pension', 60000);
const rq = check(q); const f = Math.pow(1.025, 3), std = 16100 + Math.floor(16100 * (f - 1) / 50 + 1e-9) * 50;
// Arizona part only: compare via estimateTaxes is not possible on indexed rules; print the row and the hand AZ base
console.log('   2029 row (closing 66): taxes ' + row(rq, 66).taxes + ' ; hand AZ = ' + (0.025 * (60000 - std - 2100)).toFixed(2) + ' (std ' + std + ')');
summary();

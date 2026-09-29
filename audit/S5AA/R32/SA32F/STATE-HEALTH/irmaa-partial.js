'use strict';
// IRMAA lookback when the plan opens with a partial row (a fractional start age). Single, $150,000 a year of pension.
// A full year of that income is MAGI 150,000 -> tier (137k,171k]: (405.80 + 37.50) x 12 + 283 = 5,602.60.
// Rows: [64.5,65) half, [65,66), [66,67), [67,68). The row opening at 66 is plan year 2 and looks back to the half row.
const { base, income, check, row, cmp, summary } = require('./common.js');
const p = base({ age: 64.5, endAge: 68, retireAge: 60 });
p.advanced.healthOn = true; p.advanced.healthCost = 0;
income(p, 'pension', 150000);
const r = check(p);
r.rows.forEach(x => console.log('   row closing ' + x.age + ' spending ' + x.spending.toFixed(2) + ' irmaaMagi ' + x.irmaaMagi));
// Every tax year behind the lookback holds 150,000 of income (the pension ran all year); the engine reads a half-row's 75,000.
cmp('IP row opening 66 (lookback reads the half row)', row(r, 67).spending, 5602.60);
cmp('IP row opening 67 (control, full-year lookback)', row(r, 68).spending, 5602.60);
summary();

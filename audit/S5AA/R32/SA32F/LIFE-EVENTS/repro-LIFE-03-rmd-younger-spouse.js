'use strict';
// LIFE-03: an owner whose spouse is more than 10 years younger (and, as this model already assumes, takes the IRA at the
// owner's death) is charged the Uniform Lifetime divisor instead of the Joint and Last Survivor divisor.
// Run: node repro-LIFE-03-rmd-younger-spouse.js
const L = require('./lib.js');
const p = L.couple({ profile: { age: 75, spouseAge: 60, retireAge: 60, endAge: 77 },
  advanced: { rmdOn: true },
  accounts: [L.h.account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} }),
             L.h.account('ira', 'traditionalIRA', 1000000, { owner: 'self' })] });
console.log(JSON.stringify(L.check(p)));
const r = L.run(p);
const row = r.rows[1];
console.log('uniform divisor in RULES at 75:', L.h.RULES.retirement.rmd.uniformLifetime['75']);
const engineRmd = row.rmd;
// hand: Treas. Reg. 1.401(a)(9)-5(c)(2): spouse sole beneficiary and more than 10 years younger -> Joint and Last Survivor
// Table (1.401(a)(9)-9(d)). Its factor for (75, 60) is at least the Single Life expectancy of the 60-year-old,
// 27.1 (1.401(a)(9)-9(b)), because the last of two lives cannot end before the younger one does.
const handUpper = 1000000 / 27.1;
console.log(JSON.stringify({ rowAge: row.age, engineRmd: +engineRmd.toFixed(2), uniformRmd: +(1000000 / 24.6).toFixed(2),
  handRmdAtMost: +handUpper.toFixed(2), overstatementAtLeast: +(engineRmd - handUpper).toFixed(2), taxes: row.taxes }));

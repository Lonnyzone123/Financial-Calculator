'use strict';
// Form 8606 settlement with growth after a conversion: year-end value + distributions + conversions as the denominator,
// then a draining year that exposes the closing basis (a full distribution recovers exactly the basis left).
const { h, plan, acct, check, row, codes } = require('./lib.js');
const p = plan({ age: 72, endAge: 75, retireAge: 73, conversionOn: true, conversionAmount: 50000, cash: 0, order: 'taxable,roth,preTax,hsa',
  accounts: [
    acct('a', 'traditionalIRA', 0, { contribution: 8600, futureChanges: [{ age: 73, mode: 'set', value: 0 }] }),
    acct('b', 'traditionalIRA', 91400, { priority: 3 }),
    acct('rk', 'roth401k', 0, { contribution: 1000, futureChanges: [{ age: 73, mode: 'set', value: 0 }], priority: 9 }),
    acct('roth', 'rothIRA', 20000, { priority: 1 })] });
p.retirement.dividendOn = true; p.retirement.dividendYield = 0;
p.retirement.otherIncomes = [{ name: 'Wages', type: 'employment', owner: 'self', amount: 200000, start: 72, end: 73, growth: 0, growthMode: 'fixed' }];
p.employment.contributionStop = 73;
p.assumptions.returnRate = 10; p.advanced.assetClasses[0].returnRate = 10;
const r = check(p);
const R = [1, 2, 3].map(i => row(r, i));
console.log(JSON.stringify(R), codes(r).join(','));
// Hand, year 2 (73->74). P0 = opening IRA pool (all pre-tax is IRA here).
const B = 8600, P0 = r.rows[1].preTax, C = 50000, Rmd = P0 / 26.5;
const V = r.rows[2].preTax;                    // year-end IRA value (read; growth is not what is tested)
const line9 = V + Rmd + C, f = Math.min(1, B / line9);
const settledTaxable = (Rmd + C) * (1 - f), closing = B - (Rmd + C) * f;
console.log({ P0, Rmd: +Rmd.toFixed(2), V, line9: +line9.toFixed(2), f: +f.toFixed(6), settledTaxable: +settledTaxable.toFixed(2), engineAgiY2: R[1].agi, closingBasis: +closing.toFixed(2) });
// Year 3: pool V drained by RMD + capacity-limited conversion; IRA part of AGI = V - closing basis.
console.log({ expectedAgiY3: +(V - closing).toFixed(2), engineAgiY3: R[2].agi, endPreTax: R[2].preTax });

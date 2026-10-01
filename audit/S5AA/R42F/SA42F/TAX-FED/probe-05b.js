const h = require('../harness.js'); const g = h.grid; const { runTap } = require('./tap.js');
const p = g.basePlan({ age: 50, retireAge: 50, endAge: 51, spending: 0, accounts: [g.account('ira', 'traditionalIRA', 500000), g.account('roth', 'rothIRA', 0), g.account('cash', 'taxable', 100000, { basisPct: 100 })], manualOrder: 'taxable,preTax,roth,hsa' });
p.advanced.conversionOn = true; p.advanced.conversionAmount = 50000;
const { r, calls } = runTap(p);
calls.forEach(c => console.log(JSON.stringify(c.args.slice(0, 7)), 'total', c.total.toFixed(2), 'agi', c.agi.toFixed(2)));
console.log('row', r.rows[1].taxes, r.rows[1].federalAgi);

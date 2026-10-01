const { h, acct, work, run } = require('./lib.js');
const p = work({ age: 40, salary: 1000000, growth: 3, inflation: 3, retireAge: 65, endAge: 65, accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('k', 'traditional401k', 0, { contribution: 100000 }), acct('ira', 'traditionalIRA', 0, { contribution: 50000 }), acct('hsa', 'hsa', 0, { contribution: 50000 })] });
p.assumptions.inflation = 3;
const { r } = run(p);
const down = (x, m) => Math.floor(x / m + 1e-9) * m, near = (x, m) => Math.floor(x / m + 0.5 + 1e-9) * m;
let bad = 0;
for (let k = 1; k <= 20; k++) {
  const f = Math.pow(1.03, k - 1), c = 40 + k;
  const k401 = 24500 + down(24500 * (f - 1), 500) + (c >= 50 ? (8000 + down(8000 * (f - 1), 500)) : 0);
  const ira = down(7500 * f, 500) + (c >= 50 ? down(1100 * f, 100) : 0);
  const hsa = 4400 + near(4400 * (f - 1), 50) + (c >= 55 ? 1000 : 0);
  const gotPre = r.rows[k].preTax - r.rows[k - 1].preTax, gotH = r.rows[k].hsa - r.rows[k - 1].hsa;
  if (Math.abs(gotPre - (k401 + ira)) > 0.01 || Math.abs(gotH - hsa) > 0.01) { bad++; console.log('row', k, 'close', c, 'pre', gotPre, 'exp', k401 + ira, 'hsa', gotH, 'exp', hsa); }
}
console.log('mismatches', bad);

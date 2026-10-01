const { h, acct, work, run, bal } = require('./lib.js');
// One full row per opening age; requests far above every limit; read deposits per account.
const exp = (o) => { const c = o + 1; return { k: 24500 + ([60,61,62,63].includes(c) ? 11250 : c >= 50 ? 8000 : 0), ira: 7500 + (c >= 50 ? 1100 : 0), hsa: 4400 + (c >= 55 ? 1000 : 0) }; };
let bad = 0;
for (const who of ['self', 'spouse']) for (let a = 47; a <= 66; a++) {
  const selfAge = who === 'self' ? a : 40, spAge = who === 'spouse' ? a : 40;
  const p = work({ age: selfAge, couple: who === 'spouse', spouseAge: spAge, retireAge: 80, stop: 80, endAge: selfAge + 1, salary: 500000, spouseSalary: 500000, filing: 'single',
    accounts: [acct('brok', 'taxable', 0, { priority: 9 }), acct('k', 'traditional401k', 0, { owner: who, contribution: 60000, priority: 1 }), acct('ira', 'traditionalIRA', 0, { owner: who, contribution: 20000, priority: 2 }), acct('hsa', 'hsa', 0, { owner: who, contribution: 20000, priority: 3 })] });
  const { r, v } = run(p, true);
  if (!v.valid || r.status !== 'ok') { console.log('invalid', who, a, v.issues.filter(i=>i.severity==='ERROR').map(i=>i.code)); bad++; continue; }
  const row = r.rows[1], e = exp(a);
  const got = { k: row.preTax - Math.min(row.preTax, 0) , hsa: row.hsa };
  // preTax = 401k + ira
  const ok = Math.abs(row.preTax - (e.k + e.ira)) < 0.01 && Math.abs(row.hsa - e.hsa) < 0.01;
  if (!ok) { bad++; console.log('MISMATCH', who, a, 'preTax', row.preTax, 'exp', e.k + e.ira, 'hsa', row.hsa, 'exp', e.hsa); }
}
console.log('mismatches', bad);

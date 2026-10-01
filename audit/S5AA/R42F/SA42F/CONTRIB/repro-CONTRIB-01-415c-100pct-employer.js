// CONTRIB-01: IRC 415(c)(1)(B) caps ANNUAL ADDITIONS (employee deferrals + employer match + profit sharing) at 100% of the
// participant's compensation. The engine applies the 100% cap to the deferral alone (R33, SA32F-30) and holds employer money only
// to the $72,000 dollar limit, so deferral + employer can exceed pay.
'use strict';
const { h, acct, work, run } = require('./lib.js');
const cases = [
  { name: 'A: $24,500 deferral + 25% profit sharing', k: { contribution: 24500, profitShare: 25 }, expEmployer: 30000 - 24500 },
  { name: 'B: $20,000 deferral + 100% match up to 100% of pay', k: { contribution: 20000, matchOn: true, matchRate: 100, matchCap: 100 }, expEmployer: 30000 - 20000 },
  { name: 'control: $24,500 deferral + 25% profit sharing on $60,000', k: { contribution: 24500, profitShare: 25 }, salary: 60000, expEmployer: 15000 },
];
for (const c of cases) {
  const salary = c.salary || 30000;
  const p = work({ age: 45, salary, retireAge: 46, endAge: 46, accounts: [acct('brok', 'taxable', 0), acct('k', 'traditional401k', 0, c.k)] });
  const { v, r } = run(p);
  const row = r.rows[1], deferral = c.k.contribution, employer = row.preTax - deferral;
  console.log(`${c.name}: salary ${salary}; warnings ${JSON.stringify(v.issues.filter(i => i.severity !== 'INFO').map(i => i.code))}`);
  console.log(`  deposited to the 401(k): ${row.preTax} (deferral ${deferral} + employer ${employer}); expected employer ${c.expEmployer}, total ${deferral + c.expEmployer}; ${employer > c.expEmployer + 0.01 ? 'EXCEEDS 100% OF PAY' : 'ok'}`);
  console.log(`  limitWarnings: ${JSON.stringify(r.limitWarnings)}; audit warnings: ${JSON.stringify(h.engine.auditContributions(p, 45, salary, 0).warnings)}`);
}

const h = require('../harness.js'); const g = h.grid;
for (const [a, s] of [[62, 55], [55, 62]]) {
  const p = g.basePlan({ age: a, retireAge: a, couple: true, spouseAge: s, endAge: a + 2, spending: 60000, accounts: [g.account('ira', 'traditionalIRA', 1e6, { owner: 'spouse' })] });
  const r = h.engine.runPlan(p); const x = r.rows[1]; console.log(`self ${a} spouse ${s}: W ${x.withdrawals.toFixed(2)} T ${x.taxes.toFixed(2)}`);
}
// hand mfj: no penalty W = 60000 + 0.1*24800 + 0.12*(W-32200-24800) + 0.025*(W-32200) -> W(0.855) = 60000+2480-6840-805
console.log('hand no-penalty', ((60000 + 2480 - 0.12 * 57000 - 0.025 * 32200) / 0.855).toFixed(2), 'with penalty', ((60000 + 2480 - 0.12 * 57000 - 0.025 * 32200) / 0.755).toFixed(2));

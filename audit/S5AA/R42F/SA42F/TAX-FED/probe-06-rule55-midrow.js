const h = require('../harness.js'); const g = h.grid;
const p = g.basePlan({ age: 54, retireAge: 55.5, endAge: 58, spending: 40000, accounts: [g.account('k', 'traditional401k', 1e6)] }); p.advanced.rule55 = true; p.employment.contributionStop = 55.5;
const r = h.engine.runPlan(p); console.log(r.status, r.rows.slice(1, 4).map(x => `${x.age}: spend ${x.spending} W ${x.withdrawals.toFixed(2)} T ${x.taxes.toFixed(2)}`).join(' | '));

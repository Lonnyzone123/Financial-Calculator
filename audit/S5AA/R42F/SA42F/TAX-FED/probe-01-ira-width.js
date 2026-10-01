'use strict';
const h = require('../harness.js');
const g = h.grid;
const p = g.basePlan({ age: 25, retireAge: 65, endAge: 47, inflation: 3, salary: 156000, spending: 0,
  accounts: [g.account('k', 'traditional401k', 0, { contribution: 1000 }), g.account('ira', 'traditionalIRA', 0, { contribution: 7500 })] });
p.employment.contributionStop = 65;
const v = h.validateScenario(structuredClone(p));
console.log('valid', v.valid, v.issues.filter(i => i.severity === 'ERROR').map(i => i.code));
const r = h.engine.runPlan(structuredClone(p));
console.log('status', r.status);
for (const i of [1, 2, 20, 21]) { const row = r.rows[i]; console.log(row.age, 'agi', row.federalAgi, 'taxes', row.taxes, 'contrib', row.contributions, 'income', row.income); }
const R = h.engine.taxYearRules(h.RULES, Math.pow(1.03, 20), 1, 20, 1.03);
console.log(JSON.stringify(R.retirement.ira.deductionPhaseout.records.map(x => [x.provision_id, x.value])), R.retirement.ira.combinedLimit, JSON.stringify(R.retirement.ira.rothPhaseout));

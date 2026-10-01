'use strict';
const h = require('../harness.js'); const g = h.grid;
const p = g.basePlan({ age: 60, retireAge: 65, endAge: 63, couple: true, spouseAge: 58, salary: 150000, spouseSalary: 220000, spending: 0, accounts: [g.account('ira', 'traditionalIRA', 100000)] });
p.retirement.spouseLife = 58.5; p.employment.contributionStop = 65;
const v = h.validateScenario(structuredClone(p)); const r = h.engine.runPlan(structuredClone(p));
console.log('valid', v.valid, r.status); r.rows.slice(1, 4).forEach(x => console.log(x.age, 'income', x.income, 'agi', x.federalAgi, 'taxes', x.taxes));
console.log('hand: row61 65543, row62 39556.5');

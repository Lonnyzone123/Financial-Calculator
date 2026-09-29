// Partial opening row: does a half-year opening row get a whole year's deduction and brackets?
'use strict';
const h = require('../harness.js');
const p = h.plan({ years: 2, retireAge: 60, pension: 60000, amount: 0 });
p.profile.age = 60.5; p.profile.endAge = 62; p.employment.contributionStop = 60;
p.advanced.transferOn = false; p.accounts = [h.account('cash', 'taxable', 100000, { cashHolding: true, allocation: {} })];
const v = h.validateScenario(structuredClone(p));
console.log('valid', v.valid, v.issues.filter(x => x.severity !== 'INFO').map(x => x.code));
const r = h.engine.runPlan(p);
console.log(r.status, r.calculationErrorCode);
if (r.rows) r.rows.forEach(row => console.log(JSON.stringify({ age: row.age, income: row.income, agi: row.federalAgi, taxes: row.taxes })));
console.log(JSON.stringify((r.issues || []).map(i => i.code)));
console.log('TERMINATOR probe-partial-row done');

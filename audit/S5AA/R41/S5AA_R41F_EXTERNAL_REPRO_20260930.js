'use strict';
/* Read-only public-route witnesses for the R41F whole-model audit.
   Run from the repository root: node audit/S5AA/R41/S5AA_R41F_EXTERNAL_REPRO_20260930.js
   This imports the source engine and validator; it does not patch either one. */
const assert = require('node:assert/strict');
const L = require('../R40/S5AA_R40_CONSERVATION_GRID/lib.js');

function run(name, plan, age) {
  const validation = L.h.validateScenario(structuredClone(plan));
  const result = L.h.engine.runPlan(structuredClone(plan));
  const row = result.rows.find(x => x.age === age);
  assert.equal(validation.valid, true, `${name}: validator`);
  assert.equal(result.status, 'ok', `${name}: engine`);
  assert.ok(row, `${name}: row ${age}`);
  return { result, row };
}

const spousal = L.basePlan({ couple: true, age: 45, spouseAge: 44, retireAge: 45.5, endAge: 46,
  salary: 10000, spouseSalary: 100000, spending: 0, returnRate: 0, inflation: 0,
  accounts: [L.account('self-ira', 'traditionalIRA', 0, { contribution: 7500 }),
    L.account('cash', 'taxable', 0, { basisPct: 100 })] });
spousal.employment.contributionStop = 55;
const spousalRow = run('spousal IRA', spousal, 46).row;
console.log('R41F-03 spousal IRA:', JSON.stringify({ contributions: spousalRow.contributions,
  federalAgi: spousalRow.federalAgi, taxes: spousalRow.taxes }));
assert.equal(spousalRow.contributions, 3750);
assert.equal(spousalRow.federalAgi, 101250);

const roth = L.basePlan({ couple: true, age: 44, spouseAge: 45, retireAge: 45.5, endAge: 45,
  salary: 0, spouseSalary: 260000, spending: 0, returnRate: 0, inflation: 0,
  accounts: [L.account('self-roth', 'rothIRA', 0, { contribution: 7500 })] });
roth.employment.contributionStop = 55;
const rothRow = run('Roth phaseout', roth, 45).row;
console.log('R41F-04 Roth phaseout:', JSON.stringify({ income: rothRow.income,
  federalAgi: rothRow.federalAgi, contributions: rothRow.contributions }));
assert.equal(rothRow.federalAgi, 130000);
assert.equal(rothRow.contributions, 0);

const ss = L.basePlan({ couple: true, age: 62, spouseAge: 67, retireAge: 67, endAge: 70,
  salary: 200000, spouseSalary: 0, spending: 0, returnRate: 0, inflation: 0,
  ssBenefit: 3000, spouseSS: 0,
  accounts: [L.account('cash', 'taxable', 2000000, { basisPct: 100 })] });
Object.assign(ss.retirement, { ssClaim: 62, spouseClaim: 67, ssCola: 0,
  survivor: true, selfLife: 67.5, spouseLife: 95 });
ss.employment.contributionStop = 67;
ss.advanced.healthOn = false;
const ssRun = run('SS family earnings test', ss, 63);
const survivorRow = ssRun.result.rows.find(x => x.age === 69);
assert.ok(survivorRow);
const livingControl = structuredClone(ss);
livingControl.retirement.selfLife = 120;
const livingRow = run('SS credited-month living control', livingControl, 69).row;
console.log('R41F-01 family earnings test:', JSON.stringify({ age: ssRun.row.age,
  income: ssRun.row.income }));
console.log('R41F-02 survivor ARF:', JSON.stringify({ age: survivorRow.age,
  income: survivorRow.income, livingFamilyIncome: livingRow.income }));
assert.equal(ssRun.row.income, 218000);
assert.equal(survivorRow.income, 29700);
assert.equal(livingRow.income, 54000);

const bad = L.basePlan({ age: 66, retireAge: 66, endAge: 68, spending: 0,
  returnRate: 0, inflation: 0, ssBenefit: 2500,
  accounts: [L.account('cash', 'taxable', 0, { basisPct: 100 })] });
bad.retirement.ssClaim = 67;
bad.retirement.ssCola = 0;
bad.advanced.healthOn = false;
const goodRow = run('valid SS input control', bad, 68).row;
bad.retirement.ssBenefit = 'abc';
const badRow = run('invalid SS input', bad, 68).row;
console.log('R41F-05 invalid SS input:', JSON.stringify({ validBenefitIncome: goodRow.income,
  malformedBenefitIncome: badRow.income,
  validatorAccepted: L.h.validateScenario(structuredClone(bad)).valid }));
assert.equal(goodRow.income, 30000);
assert.equal(badRow.income, 0);

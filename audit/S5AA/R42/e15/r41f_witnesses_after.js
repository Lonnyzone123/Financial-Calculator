'use strict';
/* S5AA R42: ChatGPT's five R41F witnesses, built exactly as audit/S5AA/R41/S5AA_R41F_EXTERNAL_REPRO_20260930.js builds them
   (on its branch, fcfbb24), printed WITHOUT that script's assertions of the pre-repair figures, so the repaired figures can be
   read at any commit. Run from the repository root: node audit/S5AA/R42/e15/r41f_witnesses_after.js */
const L = require('../../R40/S5AA_R40_CONSERVATION_GRID/lib.js');
const run = (plan) => ({ v: L.h.validateScenario(structuredClone(plan)), r: L.h.engine.runPlan(structuredClone(plan)) });
const row = (res, age) => (res.r.rows || []).find((x) => x.age === age);

const spousal = L.basePlan({ couple: true, age: 45, spouseAge: 44, retireAge: 45.5, endAge: 46, salary: 10000, spouseSalary: 100000, spending: 0, returnRate: 0, inflation: 0,
  accounts: [L.account('self-ira', 'traditionalIRA', 0, { contribution: 7500 }), L.account('cash', 'taxable', 0, { basisPct: 100 })] });
spousal.employment.contributionStop = 55;
const s = row(run(spousal), 46);
console.log('R41F-03 spousal IRA:', JSON.stringify({ contributions: s.contributions, federalAgi: s.federalAgi, taxes: s.taxes }));

const roth = L.basePlan({ couple: true, age: 44, spouseAge: 45, retireAge: 45.5, endAge: 45, salary: 0, spouseSalary: 260000, spending: 0, returnRate: 0, inflation: 0,
  accounts: [L.account('self-roth', 'rothIRA', 0, { contribution: 7500 })] });
roth.employment.contributionStop = 55;
const r4 = row(run(roth), 45);
console.log('R41F-04 Roth phaseout:', JSON.stringify({ income: r4.income, federalAgi: r4.federalAgi, contributions: r4.contributions, roth: r4.roth }));

const ss = L.basePlan({ couple: true, age: 62, spouseAge: 67, retireAge: 67, endAge: 70, salary: 200000, spouseSalary: 0, spending: 0, returnRate: 0, inflation: 0,
  ssBenefit: 3000, spouseSS: 0, accounts: [L.account('cash', 'taxable', 2000000, { basisPct: 100 })] });
Object.assign(ss.retirement, { ssClaim: 62, spouseClaim: 67, ssCola: 0, survivor: true, selfLife: 67.5, spouseLife: 95 });
ss.employment.contributionStop = 67; ss.advanced.healthOn = false;
const ssRun = run(ss);
const living = structuredClone(ss); living.retirement.selfLife = 120;
console.log('R41F-01 family earnings test:', JSON.stringify({ age: 63, income: row(ssRun, 63).income }));
console.log('R41F-02 survivor ARF:', JSON.stringify({ age: 69, income: row(ssRun, 69).income, row68: row(ssRun, 68).income, livingFamilyIncome: row(run(living), 69).income }));

const bad = L.basePlan({ age: 66, retireAge: 66, endAge: 68, spending: 0, returnRate: 0, inflation: 0, ssBenefit: 2500,
  accounts: [L.account('cash', 'taxable', 0, { basisPct: 100 })] });
bad.retirement.ssClaim = 67; bad.retirement.ssCola = 0; bad.advanced.healthOn = false;
const good = row(run(bad), 68);
bad.retirement.ssBenefit = 'abc';
const b = run(bad);
console.log('R41F-05 invalid SS input:', JSON.stringify({ validBenefitIncome: good.income, validatorAccepted: b.v.valid,
  validatorIssue: (b.v.issues.find((i) => i.path === 'retirement.ssBenefit') || {}).code || null,
  engineStatus: b.r.status, engineCode: b.r.calculationErrorCode || null }));

// PLUMBING-05: plans validateScenario() accepts (valid: true) that runPlan() always refuses -- the direction R40 (debt reset
// terms) and R41 (end age before start) repaired as defects. Run: node repro-PLUMBING-05-validator-accepts-engine-refusals.js [--app]
'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
const cases=[['selfLife 59 for a single person aged 60 (nobody alive at the start)',p=>{p.retirement.selfLife=59}],
 ['couple, both lifespans below their starting ages',p=>{p.profile.spouseOn=true;p.profile.filing='mfj';p.profile.spouseAge=58;p.retirement.selfLife=55;p.retirement.spouseLife=55}],
 ['assumptions.method "montecarlo" (validator: WARNING only)',p=>{p.assumptions.method='montecarlo'}],
 ['profile.filing "MFJ" (validator: WARNING only; Q68 decided the engine refusal)',p=>{p.profile.filing='MFJ'}]];
for(const [n,f] of cases){const p=basePlan({age:60,endAge:90,spending:30000,accounts:[account('cash','taxable',500000,{basisPct:100})]});f(p);
 const v=h.validateScenario(structuredClone(p)),r=E.runPlan(structuredClone(p));
 console.log(n+'\n   validator valid '+v.valid+' ['+v.issues.filter(i=>!/FILING_HOUSEHOLD/.test(i.code)).map(i=>i.severity+' '+i.code).join(', ')+']  |  runPlan '+r.status+' '+(r.calculationErrorCode||'')+'  rows '+(r.rows?r.rows.length:null));}
if(process.argv.includes('--app')){process.argv.splice(2);process.argv.push(JSON.stringify({'retirement.selfLife':20}));require('./probe-app-restore.js');}

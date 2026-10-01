'use strict';
const h=require('../harness.js');const E=h.engine;
const {checkResult,CONTRACT}=require(require('path').join(h.TREE,'tools/result-contract.js'));
console.log('contract mode spec (invalid):',JSON.stringify(CONTRACT.topLevel.invalid.mode||CONTRACT.topLevel.calculation_error&&CONTRACT.topLevel.calculation_error.mode));
for(const m of ['montecarlo','Monte Carlo',42,null]){const p=structuredClone(h.defaults);p.setupComplete=true;p.assumptions.method=m;
 const v=h.validateScenario(structuredClone(p));const r=E.runPlan(structuredClone(p));const c=checkResult(r,{plan:p});
 console.log(JSON.stringify(m),'validator',v.valid,v.issues.filter(i=>i.path==='assumptions.method').map(i=>i.severity+' '+i.code).join(','),'| engine',r.status,r.calculationErrorCode,'mode=',JSON.stringify(r.mode),'| checker',c.violations.map(x=>x.rule+'@'+x.path+': '+x.message).join('; '));}
// zero-length plan
const p=structuredClone(h.defaults);p.setupComplete=true;p.profile.age=60.3;p.profile.retireAge=60.3;p.profile.endAge=60.3;const r=E.runPlan(p);console.log('zero-length rows',r.rows.map(x=>x.age),checkResult(r,{plan:p}).violations.map(x=>x.rule+': '+x.message).join('; '));

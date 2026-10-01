// R40/R41/R42 parity additions: debt reset terms, healthInflation type, end-age refusal, ssBenefit/spouseSS.
'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
function base(){const p=basePlan({couple:true,age:62,endAge:70,spending:20000,healthOn:true,ssBenefit:2000,spouseSS:1000,accounts:[account('cash','taxable',500000,{basisPct:100})]});p.advanced.healthInflation=5;
 p.advanced.debts=[{id:'d',name:'d',type:'mortgage',owner:'household',balance:100000,rate:4,paymentMonthly:800,payoffAge:80,includePayment:true,rateType:'adjustable',nextRateResetAge:65,resetRate:6}];return p;}
const cases=[['resetRate absent',p=>{delete p.advanced.debts[0].resetRate}],['payoffAge absent',p=>{delete p.advanced.debts[0].payoffAge}],['payoffAge null',p=>{p.advanced.debts[0].payoffAge=null}],['resetRate "6"',p=>{p.advanced.debts[0].resetRate='6'}],['resetRate null',p=>{p.advanced.debts[0].resetRate=null}],
 ['nextRateResetAge "65"',p=>{p.advanced.debts[0].nextRateResetAge='65'}],['nextRateResetAge null',p=>{p.advanced.debts[0].nextRateResetAge=null}],['nextRateResetAge NaN',p=>{p.advanced.debts[0].nextRateResetAge=NaN}],
 ['healthInflation "5"',p=>{p.advanced.healthInflation='5'}],['healthInflation null',p=>{p.advanced.healthInflation=null}],['healthInflation -100',p=>{p.advanced.healthInflation=-100}],['healthInflation 100',p=>{p.advanced.healthInflation=100}],['healthInflation absent, healthOn',p=>{delete p.advanced.healthInflation}],
 ['endAge 61.9 < age 62',p=>{p.profile.endAge=61.9}],['endAge = age',p=>{p.profile.endAge=62}],['endAge NaN',p=>{p.profile.endAge=NaN}],
 ['ssBenefit "2000"',p=>{p.retirement.ssBenefit='2000'}],['ssBenefit null',p=>{p.retirement.ssBenefit=null}],['spouseSS "abc" (spouseOn false)',p=>{p.profile.spouseOn=false;p.profile.filing='single';p.retirement.spouseSS='abc'}],['ssBenefit absent',p=>{delete p.retirement.ssBenefit}]];
for(const [n,f] of cases){const p=base();f(p);const v=h.validateScenario(structuredClone(p));const errs=v.issues.filter(i=>i.severity==='ERROR').map(i=>i.code).join(',');let r;try{r=E.runPlan(p)}catch(e){r={status:'THREW'}}
 const agree=(v.valid&&r.status==='ok')||(!v.valid&&r.status!=='ok');console.log((agree?'agree   ':'DISAGREE')+' '+n.padEnd(34)+' validator '+(v.valid?'valid':'ERROR '+errs).padEnd(40)+' engine '+r.status+' '+(r.calculationErrorCode||''));}

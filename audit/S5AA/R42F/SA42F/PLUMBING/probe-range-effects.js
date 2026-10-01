'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
const {checkResult}=require(require('path').join(h.TREE,'tools/result-contract.js'));
function show(n,p,f){const v=h.validateScenario(structuredClone(p));const r=E.runPlan(structuredClone(p));const c=r.status==='ok'?checkResult(r,{plan:p}).violations.map(x=>x.rule).filter((x,i,a)=>a.indexOf(x)===i).join(','):'';console.log(n,'valid',v.valid,'status',r.status,r.calculationErrorCode||'','contract',c||'clean');if(r.rows)console.log('   ',r.rows.slice(0,6).map(f).join(' | '));}
// health cost with healthInflation -150 / 150: single 60, healthCost 12000
for(const hi of [5,-150,150]){const p=basePlan({age:60,endAge:66,spending:0,healthOn:true,accounts:[account('cash','taxable',1000000,{basisPct:100})]});p.advanced.healthCost=12000;p.advanced.healthInflation=hi;show('healthInflation '+hi,p,r=>r.age+':sp='+r.spending.toFixed(0));}
// survivor percent 150: self pension 12000, self dies 64 (selfLife 63.5)
for(const sp of [50,150,-50]){const p=basePlan({couple:true,age:60,endAge:67,spending:0,accounts:[account('cash','taxable',1000000,{basisPct:100})]});p.retirement.selfLife=63;p.retirement.otherIncomes=[{name:'pen',type:'pension',owner:'self',amount:12000,start:60,end:90,growth:0,growthMode:'fixed',survivorPercent:sp}];show('survivorPercent '+sp,p,r=>r.age+':inc='+r.income.toFixed(0));}
// inflation -150 (validator silent)
{const p=basePlan({age:60,endAge:64,spending:20000,strategy:'fixedReal',accounts:[account('cash','taxable',1000000,{basisPct:100})]});p.assumptions.inflation=-150;show('inflation -150',p,r=>r.age+':if='+r.inflationFactor.toFixed(3)+',sp='+r.spending.toFixed(0)+',real='+r.realTotal.toFixed(0));}
{const p=basePlan({age:60,endAge:64,spending:20000,strategy:'fixedReal',accounts:[account('cash','taxable',1000000,{basisPct:100})]});p.assumptions.fee=150;show('fee 150',p,r=>r.age+':tot='+r.total.toFixed(0));}
{const p=basePlan({age:60,endAge:64,spending:20000,accounts:[account('cash','taxable',1000000,{basisPct:100})]});p.advanced.assetsOn=false;p.assumptions.returnRate=-150;show('returnRate -150',p,r=>r.age+':tot='+r.total.toFixed(0));}
// ltcProbability 150 simple
{const p=basePlan({age:60,endAge:73,spending:0,accounts:[account('cash','taxable',2000000,{basisPct:100})]});Object.assign(p.advanced,{ltcOn:true,ltcCost:50000,ltcProbability:150,ltcYears:2,ltcInsurance:0,healthInflation:0});show('ltcProbability 150',p,r=>r.age+':sp='+r.spending.toFixed(0));}
// yearsOfService -1 / vestingSchedule 'x'
for(const [k,v] of [['yearsOfService',-1],['vestingSchedule','x'],['vestingSchedule','graded6']]){const p=basePlan({age:40,retireAge:43,endAge:44,salary:100000,spending:0,accounts:[account('k','traditional401k',0,{contribution:10000,matchOn:true,matchCap:10,matchRate:100,vesting:0})]});p.accounts[0][k]=v;p.accounts[0].yearsOfService=k==='yearsOfService'?v:0;show(k+' '+v,p,r=>r.age+':c='+r.contributions.toFixed(0)+',pt='+r.preTax.toFixed(0));}

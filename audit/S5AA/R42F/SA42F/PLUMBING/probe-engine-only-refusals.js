// Engine refusals that the validator accepts (validator valid, engine calculation_error): the R40 class.
'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
function base(){return basePlan({couple:true,age:60,endAge:70,spending:30000,accounts:[account('cash','taxable',500000,{basisPct:100})]});}
const cases=[['nobody alive at start',p=>{p.retirement.selfLife=50;p.retirement.spouseLife=50}],['self dead, spouse off',p=>{p.profile.spouseOn=false;p.profile.filing='single';p.retirement.selfLife=59}],
 ['method "montecarlo"',p=>{p.assumptions.method='montecarlo'}],['filing "MFJ"',p=>{p.profile.filing='MFJ'}],['filing "mfs"',p=>{p.profile.filing='mfs'}],
 ['zero-payment debt forced payoff',p=>{p.advanced.debts=[{id:'d',name:'d',type:'otherDebt',balance:20000,rate:20,paymentMonthly:0,payoffAge:65,includePayment:true,rateType:'fixed'}]}],
 ['recast term > max',p=>{p.advanced.debts=[{id:'d',name:'d',type:'mortgage',balance:200000,rate:4,paymentMonthly:1000,payoffAge:120,includePayment:true,rateType:'adjustable',nextRateResetAge:61,resetRate:6}]}],
 ['rmd strategy no preTax',p=>{p.retirement.strategy='rmd'}],
];
for(const [n,f] of cases){const p=base();f(p);const v=h.validateScenario(structuredClone(p));const iss=v.issues.filter(i=>!/FILING_HOUSEHOLD/.test(i.code)).map(i=>i.severity[0]+':'+i.code).join(',');let r;try{r=E.runPlan(structuredClone(p))}catch(e){r={status:'THREW'}}
 console.log(n.padEnd(34),'valid',String(v.valid).padEnd(5),iss.padEnd(45),'| engine',r.status,r.calculationErrorCode||'');}

'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
for(const v of [75,null,'abc','75',true]){const p=basePlan({age:60,endAge:63,spending:0,accounts:[account('cash','taxable',500000,{basisPct:100})]});
 p.advanced.debts=[{id:'d',name:'d',type:'mortgage',owner:'household',balance:200000,rate:6,paymentMonthly:1500,payoffAge:v,includePayment:true,includeHousingCosts:false,rateType:'fixed'}];
 const val=h.validateScenario(structuredClone(p)),r=E.runPlan(structuredClone(p));
 console.log('payoffAge',JSON.stringify(v),'validator',val.valid,val.issues.filter(i=>i.severity==='ERROR').map(i=>i.code).join(','),'| engine',r.status,r.calculationErrorCode||'','row61 payments',r.rows&&r.rows[1].debtPaymentsTotal.toFixed(2),'balance',r.rows&&r.rows[1].debtBalance.toFixed(2));}

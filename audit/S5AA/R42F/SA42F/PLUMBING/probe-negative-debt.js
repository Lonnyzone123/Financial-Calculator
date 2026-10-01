'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;const {checkResult}=require(require('path').join(h.TREE,'tools/result-contract.js'));
const p=basePlan({age:60,endAge:62,spending:0,networthOn:true,accounts:[account('cash','taxable',100000,{basisPct:100})]});
p.advanced.debts=[{id:'d',name:'d',type:'otherDebt',owner:'household',balance:-5000,rate:5,paymentMonthly:100,payoffAge:80,includePayment:true,rateType:'fixed'}];
const v=h.validateScenario(structuredClone(p)),r=E.runPlan(structuredClone(p));
console.log('valid',v.valid,v.issues.map(i=>i.severity[0]+':'+i.code).join(','),'status',r.status);
r.rows.forEach(x=>console.log(x.age,'total',x.total,'debtBalance',x.debtBalance,'networth',x.networth,'debtPayments',x.debtPaymentsTotal));
console.log('checker',checkResult(r,{plan:p}).violations.map(x=>x.rule+'@'+x.path).join(', ')||'clean');

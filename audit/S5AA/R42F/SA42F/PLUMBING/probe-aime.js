'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
for(const aime of [6000,'abc','6000',null]){const p=basePlan({age:66,endAge:68,spending:0,accounts:[account('cash','taxable',100000,{basisPct:100})]});
 Object.assign(p.retirement,{ssAdvanced:true,aime,ssBenefit:2500,ssClaim:67,ssCola:0});
 const v=h.validateScenario(structuredClone(p));const r=E.runPlan(structuredClone(p));
 console.log('aime',JSON.stringify(aime),'valid',v.valid,v.issues.filter(i=>/aime/.test(i.path||'')).map(i=>i.code).join(','),'status',r.status,r.calculationErrorCode||'','row68 income',r.rows&&r.rows[2].income);}

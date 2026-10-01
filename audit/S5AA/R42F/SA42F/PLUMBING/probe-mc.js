'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
function run(p){const v=h.validateScenario(structuredClone(p));const r=E.runPlan(structuredClone(p));if(!v.valid||r.status!=='ok')console.log('!!',v.valid,r.status,r.calculationErrorCode,JSON.stringify(v.issues.filter(i=>i.severity==='ERROR')));return r;}
function q(a,x){a=a.slice().sort((m,n)=>m-n);const p=(a.length-1)*x,l=Math.floor(p),hh=Math.ceil(p);return a[l]+(a[hh]-a[l])*(p-l);}
function mcPlan(seed,runs,o={}){const p=basePlan(Object.assign({age:60.5,endAge:90,spending:60000,returnRate:6,inflation:2.5,accounts:[account('brok','taxable',600000,{basisPct:70}),account('ira','traditionalIRA',500000)]},o));
 p.assumptions.method='monteCarlo';p.assumptions.runs=runs;p.assumptions.seed=seed;p.assumptions.volatility=15;p.advanced.assetsOn=false;p.advanced.networthOn=true;p.advanced.rmdOn=true;
 p.advanced.debts=[{id:'m',name:'m',type:'mortgage',owner:'household',balance:150000,rate:6.5,paymentMonthly:1300,payoffAge:75,includePayment:true,includeHousingCosts:true,annualPropertyTax:3000,annualInsurance:1200,hoaMonthly:0,pmiMonthly:60,extraPrincipalMonthly:0,rateType:'adjustable',nextRateResetAge:63,resetRate:8}];
 p.advanced.ltcOn=true;p.advanced.ltcCost=80000;p.advanced.ltcProbability=40;p.advanced.ltcYears=2;p.advanced.ltcInsurance=0;p.advanced.healthInflation=4;return p;}
// M2 independent aggregation
{const p=mcPlan(1234,300);const r=run(p);const paths=[];for(let i=0;i<300;i++)paths.push(E.simulatePlan(structuredClone(p),E.rng(1234+2*i),0,E.rng(1234+2*i+1),[]));
 const valid=paths.filter(x=>x.calculationErrorAge===null||x.calculationErrorAge===undefined);const succ=valid.filter(x=>!x.failed).length;
 console.log('M2 success engine',r.successRate,'hand',succ/valid.length*100,'valid',valid.length);
 let worst=0;for(let y=0;y<r.rows.length;y++){const t=valid.map(x=>x.rows[y].total);const d=Math.max(Math.abs(q(t,.5)-r.rows[y].total),Math.abs(q(t,.1)-r.rows[y].q10),Math.abs(q(t,.9)-r.rows[y].q90));worst=Math.max(worst,d);
   for(const k of ['taxes','debtBalance','spending','networth','inflationFactor']){worst=Math.max(worst,Math.abs(q(valid.map(x=>x.rows[y][k]),.5)-r.rows[y][k]));}}
 console.log('M2 worst row-quantile diff',worst);
 const fs=valid.filter(x=>x.firstShortfallAge!==null).map(x=>x.firstShortfallAge),ss=valid.filter(x=>x.sustainedFailureAge!==null).map(x=>x.sustainedFailureAge);
 console.log('M2 firstShortfall engine',r.firstShortfallAge,'hand',fs.length?q(fs,.5):null,'sustained engine',r.sustainedFailureAge,'hand',ss.length?q(ss,.5):null);
 console.log('M2 lifetimeTaxes engine',r.lifetimeTaxes,'hand',q(valid.map(x=>x.lifetimeTaxes),.5));
 console.log('M2 counts',r.requestedPathCount,r.validPathCount,r.calculationErrorPaths,'M-BAND ok',r.rows.every(x=>x.q10<=x.total+1e-9&&x.total<=x.q90+1e-9));
 // F-1: failing paths counted in denominator
 console.log('M2 failing paths',valid.length-succ);}
// M1 seed overlap
{const a=run(mcPlan(42,1000)),b=run(mcPlan(44,999)),c=run(mcPlan(43,1000)),d=run(mcPlan(44,1000));
 const p=mcPlan(42,1);const path0=E.simulatePlan(structuredClone(p),E.rng(42),0,E.rng(43),[]);
 const sA=Math.round(a.successRate*1000/100),sB=Math.round(b.successRate*999/100);
 console.log('M1 seed42/1000 successes',sA,'seed44/999 successes',sB,'seed42 path0 funded',!path0.failed,'=> seed44/999 equals seed42 paths 1..999:',sA-(path0.failed?0:1)===sB);
 console.log('M1 successRate seed42',a.successRate,'seed44',d.successRate,'seed43',c.successRate);
 const pp=mcPlan(44,1);const s44p0=E.simulatePlan(structuredClone(pp),E.rng(44),0,E.rng(45),[]);const s42p1=E.simulatePlan(structuredClone(p),E.rng(44),0,E.rng(45),[]);
 console.log('M1 seed44 path0 rows == seed42 path1 rows:',JSON.stringify(s44p0.rows)===JSON.stringify(s42p1.rows));}
// M3 zero volatility MC == simple (debt + fractional age + reset), LTC off
{const p=mcPlan(7,20);p.assumptions.volatility=0;p.advanced.ltcOn=false;const r=run(p);const s=structuredClone(p);s.assumptions.method='simple';const rs=run(s);
 let worst=0;for(let y=0;y<r.rows.length;y++)for(const k of ['total','taxes','debtBalance','spending','networth','income','withdrawals'])worst=Math.max(worst,Math.abs(r.rows[y][k]-rs.rows[y][k]));
 console.log('M3 zero-vol MC vs simple worst diff',worst,'success',r.successRate,rs.successRate);}

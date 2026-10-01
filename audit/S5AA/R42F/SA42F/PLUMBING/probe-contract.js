'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
const {checkResult}=require(require('path').join(h.TREE,'tools/result-contract.js'));
const plans=[];
function rich(o={}){const p=basePlan(Object.assign({couple:true,age:58.3,retireAge:61.5,endAge:84.7,salary:90000,spouseSalary:40000,spending:70000,strategy:'guardrails',inflation:2.5,returnRate:5,dividendOn:true,ssBenefit:2500,spouseSS:1200,healthOn:true,rmdOn:true,networthOn:true,
  accounts:[account('brok','taxable',300000,{basisPct:60}),account('ira','traditionalIRA',400000,{contribution:5000}),account('k','traditional401k',200000,{contribution:10000,matchOn:true,matchCap:6,matchRate:50}),account('roth','rothIRA',100000),account('hsa','hsa',20000,{contribution:3000}),account('sk','traditional401k',50000,{owner:'spouse',contribution:4000})]},o));
  Object.assign(p.retirement,{pension:12000,survivor:true,selfLife:80,spouseLife:92,floor:40000,ceiling:90000});
  Object.assign(p.advanced,{insurance:100000,ltcOn:true,ltcCost:90000,ltcProbability:50,ltcYears:2,ltcInsurance:10000,healthInflation:5,
   otherAssets:[{id:'oa',name:'land',value:100000,growth:2,available:true,availableAge:70,liquidity:'limited',accessPct:50}],
   debts:[{id:'m',name:'m',type:'mortgage',owner:'household',balance:150000,rate:6,paymentMonthly:1500,payoffAge:75.5,includePayment:true,includeHousingCosts:true,annualPropertyTax:3000,annualInsurance:1500,hoaMonthly:50,pmiMonthly:40,extraPrincipalMonthly:100,rateType:'adjustable',nextRateResetAge:65.25,resetRate:7},
     {id:'c',name:'card',type:'creditCard',owner:'household',balance:8000,rate:22,paymentMonthly:0,includePayment:true,rateType:'fixed'}]});return p;}
for(const m of ['simple','historical','monteCarlo']){const p=rich();p.assumptions.method=m;p.assumptions.runs=40;p.assumptions.volatility=14;p.assumptions.historyStart=1966;plans.push(['rich-'+m,p]);}
{const p=rich({couple:false});p.profile.filing='single';plans.push(['single-simple',p]);}
{const p=rich();p.profile.endAge=p.profile.age;plans.push(['zero-length',p]);}
const bad=[['method typo',p=>{p.assumptions.method='montecarlo'}],['runs 0',p=>{p.assumptions.method='monteCarlo';p.assumptions.runs=0}],['no retirement',p=>{delete p.retirement}],['owner null',p=>{p.retirement.otherIncomes=[{name:'x',type:'pension',owner:null,amount:1,start:60,end:70,growth:0,growthMode:'fixed'}]}],['nobody alive',p=>{p.retirement.selfLife=50;p.retirement.spouseLife=50}],['endAge<start',p=>{p.profile.endAge=50}],['zero pay forced',p=>{p.advanced.debts=[{id:'z',name:'z',type:'otherDebt',balance:20000,rate:20,paymentMonthly:0,payoffAge:70,includePayment:true,rateType:'fixed'}]}]];
for(const [n,f] of bad){const p=rich();f(p);plans.push(['bad:'+n,p]);}
let viol=0;
for(const [n,p] of plans){let r;try{r=E.runPlan(structuredClone(p));}catch(e){console.log(n,'THREW',e.message);continue;}
  const c=checkResult(r,{plan:p});viol+=c.violations.length;
  console.log(n.padEnd(22),r.status.padEnd(18),String(r.calculationErrorCode||'').padEnd(40),'rows',r.rows?r.rows.length:null,'viol',c.violations.length,'unspec',c.unspecified.length,'skip',c.skipped.join(','),c.violations.slice(0,3).map(v=>v.rule+'@'+v.path).join(' '));}
console.log('total violations',viol);

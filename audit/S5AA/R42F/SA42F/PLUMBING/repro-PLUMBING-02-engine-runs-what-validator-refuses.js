// PLUMBING-02: inputs validateScenario() refuses as ERRORs that runPlan() runs to status "ok" with a changed figure
// (S5AA task 1.1: "The engine's gates refuse everything the validator refuses"). Run: node repro-PLUMBING-02-engine-runs-what-validator-refuses.js
'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
let gaps=0;
function show(label,ctrlPlan,badPlan,fig,hand){const v=h.validateScenario(structuredClone(badPlan)),r=E.runPlan(structuredClone(badPlan)),c=E.runPlan(structuredClone(ctrlPlan));
  const errs=v.issues.filter(i=>i.severity==='ERROR').map(i=>i.code+'@'+i.path);if(!v.valid&&r.status==='ok')gaps++;
  console.log(label+'\n   validator: valid '+v.valid+'  '+errs.slice(0,3).join(', ')+(errs.length>3?' (+'+(errs.length-3)+')':'')+
    '\n   runPlan: '+r.status+(r.calculationErrorCode?' '+r.calculationErrorCode:'')+(r.rows?'  figure '+fig(r):'')+'   control (valid plan) '+fig(c)+(hand!==undefined?'   hand '+hand:''));}
const sum=k=>r=>r.rows.reduce((s,x)=>s+x[k],0);
function retired(o={}){return basePlan(Object.assign({age:60,endAge:70,spending:40000,accounts:[account('cash','taxable',2000000,{basisPct:100})]},o));}
// W1 SA-01's own witness: a stage record with only a name zeroes all spending
{const c=retired(),b=retired();b.retirement.stages=[{name:'Go-go'}];show('W1 retirement.stages = [{name:"Go-go"}] -- lifetime spending (10 rows x 40,000)',c,b,sum('spending'),400000);}
// W2 a recurring income with no end age pays forever
{const mk=()=>{const p=retired({spending:0});p.retirement.otherIncomes=[{name:'pension',type:'pension',owner:'self',amount:10000,start:62,end:64,growth:0,growthMode:'fixed'}];return p};const c=mk(),b=mk();delete b.retirement.otherIncomes[0].end;
 show('W2 otherIncomes[0] without "end" (62-64 entered) -- lifetime income (2 x 10,000)',c,b,sum('income'),20000);}
// W3 an expense amount that is not a number is charged as $0
{const mk=v=>{const p=retired({spending:0});p.retirement.expenses=[{name:'roof',age:63,amount:v}];return p};show('W3 expenses[0].amount "abc" -- lifetime spending (one $20,000 expense)',mk(20000),mk('abc'),sum('spending'),20000);}
// W4 healthcare inflation outside the validator's (-100, 100] (R40's range) runs at 150%
{const mk=v=>{const p=retired({spending:0,healthOn:true});p.advanced.healthCost=12000;p.advanced.healthInflation=v;return p};show('W4 advanced.healthInflation 150 (validator: OUT_OF_RANGE ERROR since R40) -- row 63 spending',mk(5),mk(150),r=>r.rows[3].spending);}
// W5 care cost with healthInflation absent (validator: MISSING_FIELD when ltcOn) grows at 0%
{const mk=()=>{const p=retired({spending:0,endAge:74});Object.assign(p.advanced,{ltcOn:true,ltcCost:50000,ltcProbability:100,ltcYears:2,ltcInsurance:0,healthInflation:5});return p};const c=mk(),b=mk();delete b.advanced.healthInflation;
 show('W5 ltcOn with advanced.healthInflation absent -- lifetime care cost',c,b,sum('spending'));}
// W6 a spouse age the validator types (spouseOn) given as true
{const mk=v=>{const p=retired({couple:true,ssBenefit:0,spouseSS:2000});p.profile.spouseAge=v;p.retirement.spouseClaim=67;return p};show('W6 profile.spouseAge true (spouseOn) -- lifetime income (spouse 58 claims at 67)',mk(58),mk(true),sum('income'));}
// W7 asset-class return given as a numeric string / boolean
{const mk=v=>{const p=retired({spending:0});p.advanced.assetsOn=true;p.advanced.assetClasses=[{id:'flat',name:'Flat',returnRate:v,volatility:0}];p.accounts[0].allocation={flat:100};return p};show('W7 assetClasses[0].returnRate true -- portfolio at 70 (control 5%)',mk(5),mk(true),r=>Math.round(r.rows[10].total));}
// W8 account record fields the validator types
{const mk=(k,v)=>{const p=basePlan({age:40,retireAge:43,endAge:44,salary:100000,spending:0,accounts:[account('k','traditional401k',0,{contribution:10000,matchOn:true,matchCap:10,matchRate:100,vesting:0,yearsOfService:0})]});p.accounts[0][k]=v;return p};
 show('W8 accounts[0].yearsOfService "3" -- 401(k) at 44',mk('yearsOfService',0),mk('yearsOfService','3'),r=>r.rows[4].preTax);
 show('W8b accounts[0].vestingSchedule "x"',mk('vestingSchedule','graded6'),mk('vestingSchedule','x'),r=>r.rows[4].preTax);}
// W9 a fixed debt's payoffAge null (validator WRONG_TYPE): Number(null) is 0, so the whole balance is forced out in row 1
{const mk=v=>{const p=basePlan({age:60,endAge:63,spending:0,accounts:[account('cash','taxable',500000,{basisPct:100})]});p.advanced.debts=[{id:'d',name:'d',type:'mortgage',owner:'household',balance:200000,rate:6,paymentMonthly:1500,payoffAge:v,includePayment:true,includeHousingCosts:false,rateType:'fixed'}];return p};
 const B12=200000*Math.pow(1.005,12)-1500*(Math.pow(1.005,12)-1)/0.005;
 show('W9 debts[0].payoffAge null (fixed loan) -- row 61 debt payments (12 x 1,500)',mk(75),mk(null),r=>r.rows[1].debtPaymentsTotal.toFixed(2),'18000.00 (balance left '+B12.toFixed(2)+')');}
console.log('\nvalidator ERROR but runPlan ok:',gaps);

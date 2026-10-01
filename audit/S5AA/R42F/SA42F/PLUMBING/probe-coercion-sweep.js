// Sweep: for every numeric scalar field of a feature-rich plan (sections + nested records), set it to "abc", a numeric
// string, true and null; record validator verdict, engine status/code, and whether the output equals the field=0 run.
'use strict';
const h=require('../harness.js');
const {account,basePlan}=h.grid;
function rich(strategy){
  const p=basePlan({couple:true,age:58,retireAge:62,endAge:80,salary:90000,spouseSalary:40000,spending:70000,strategy:strategy||'guardrails',
    inflation:2.5,returnRate:5,dividendOn:true,ssBenefit:2500,spouseSS:1200,healthOn:true,rmdOn:true,networthOn:true,flexibility:10,
    accounts:[account('brok','taxable',300000,{basisPct:60}),account('ira','traditionalIRA',400000,{contribution:5000}),
      account('k','traditional401k',200000,{contribution:10000,matchOn:true,matchCap:6,matchRate:50,profitShare:1000,vesting:100}),
      account('roth','rothIRA',100000,{contribution:2000}),account('hsa','hsa',20000,{contribution:3000}),
      account('sk','traditional401k',50000,{owner:'spouse',contribution:4000})]});
  Object.assign(p.retirement,{pension:12000,pensionCola:1,ssCola:2,ssFra:67,survivor:true,survivorSpendingReduction:20,selfLife:85,spouseLife:92,
    withdrawalRate:4,upperGuardrail:20,lowerGuardrail:20,adjustment:10,floor:40000,ceiling:90000,vpwMinRate:2,vpwMaxRate:10,rmdMultiplier:100,rmdFloor:1000,
    stages:[{name:'slow',start:75,end:80,mode:'amount',value:50000,growthMode:'fixed',annualChange:1}],
    expenses:[{name:'roof',age:66,amount:20000}],
    otherIncomes:[{name:'rent',type:'rental',owner:'self',amount:10000,start:60,end:78,growth:1,growthMode:'fixed'}]});
  Object.assign(p.advanced,{transferOn:true,transferAge:63,transferFrom:'ira',transferTo:'roth',transferAmount:10000,conversionOn:true,conversionAmount:15000,
    qcd:3000,ltcOn:true,ltcCost:90000,ltcProbability:50,ltcYears:2,ltcInsurance:10000,healthCost:12000,healthInflation:5,insurance:100000,legacy:50000,
    reserveOn:true,reserveYears:2,glideOn:true,retirementStock:60,bondTentOn:true,bondTent:50,home:400000,debt:0,homeGrowth:3,
    otherAssets:[{id:'oa',name:'land',value:100000,growth:2,available:true,availableAge:70,liquidity:'limited',accessPct:50}],
    debts:[{id:'m',name:'mortgage',type:'mortgage',balance:150000,rate:6,paymentMonthly:1500,payoffAge:75,includePayment:true,includeHousingCosts:true,
      annualPropertyTax:3000,annualInsurance:1500,hoaMonthly:50,pmiMonthly:40,extraPrincipalMonthly:100,rateType:'adjustable',nextRateResetAge:65,resetRate:7}]});
  return p;
}
const plans={guardrails:rich('guardrails'),vpw:rich('vpw'),rmd:rich('rmd'),floorCeiling:rich('floorCeiling'),constantPercent:rich('constantPercent'),guyton:rich('guyton')};
plans.mc=rich('guardrails');plans.mc.assumptions.method='monteCarlo';plans.mc.assumptions.runs=20;plans.mc.assumptions.volatility=12;
const out=(r)=>r.status==='ok'?JSON.stringify(r.rows)+JSON.stringify(r.successRate):'ERR:'+r.calculationErrorCode;
function setAt(p,pathArr,v){let o=p;for(let i=0;i<pathArr.length-1;i++)o=o[pathArr[i]];o[pathArr[pathArr.length-1]]=v;}
function fields(p){const f=[];
  for(const s of ['profile','employment','assumptions','retirement','advanced'])for(const k of Object.keys(p[s]))if(typeof p[s][k]==='number')f.push([s,k]);
  for(const k of Object.keys(p.accounts[2]))if(typeof p.accounts[2][k]==='number')f.push(['accounts',2,k]);
  for(const L of [['retirement','stages'],['retirement','expenses'],['retirement','otherIncomes'],['advanced','otherAssets'],['advanced','debts'],['advanced','assetClasses']])
    for(const k of Object.keys(p[L[0]][L[1]][0]))if(typeof p[L[0]][L[1]][0][k]==='number')f.push([L[0],L[1],0,k]);
  return f;}
const res=[];
for(const [pn,p0] of Object.entries(plans)){
  const v0=h.validateScenario(structuredClone(p0));if(!v0.valid){console.log(pn,'base invalid',JSON.stringify(v0.issues.filter(i=>i.severity==='ERROR')));continue;}
  const r0=h.engine.runPlan(structuredClone(p0));if(r0.status!=='ok'){console.log(pn,'base',r0.calculationErrorCode);continue;}
  const base=out(r0);
  for(const f of fields(p0)){
    const orig=f.reduce((o,k)=>o[k],p0);
    const pz=structuredClone(p0);setAt(pz,f,0);const zero=out(h.engine.runPlan(pz));
    for(const bad of ['abc',String(orig),true,null]){
      const p=structuredClone(p0);setAt(p,f,bad);
      const v=h.validateScenario(structuredClone(p));const errs=v.issues.filter(i=>i.severity==='ERROR').map(i=>i.code+'@'+i.path);
      let r;try{r=h.engine.runPlan(p);}catch(e){r={status:'THROW',calculationErrorCode:e.message.slice(0,80)};}
      const o=out(r);
      res.push({plan:pn,field:f.join('.'),bad:JSON.stringify(bad),valid:v.valid,errs:errs.join(' '),status:r.status,code:r.calculationErrorCode||'',
        eqBase:o===base,eqZero:o===zero,zeroEqBase:zero===base});
    }
  }
}
require('fs').writeFileSync(__dirname+'/out-coercion-sweep.json',JSON.stringify(res,null,1));
// Summaries
const key=x=>x.field+' '+x.bad;
const byKey={};for(const x of res){(byKey[key(x)]=byKey[key(x)]||[]).push(x);}
console.log('A) validator ERROR, engine ok:');
for(const [k,xs] of Object.entries(byKey)){const a=xs.filter(x=>!x.valid&&x.status==='ok');if(a.length)console.log('  ',k,'|',a[0].errs,'| plans',a.map(x=>x.plan+(x.eqBase?'=base':x.eqZero?'=zero':'=moved')).join(','));}
console.log('B) validator valid, engine refuses/throws:');
for(const [k,xs] of Object.entries(byKey)){const a=xs.filter(x=>x.valid&&x.status!=='ok');if(a.length)console.log('  ',k,'|',a.map(x=>x.plan+':'+x.code).join(','));}
console.log('C) valid, ok, output moved (non-numeric value):');
for(const [k,xs] of Object.entries(byKey)){if(xs[0].bad===JSON.stringify(String(0))&&0)continue;const a=xs.filter(x=>x.valid&&x.status==='ok'&&!x.eqBase&&!(x.bad.startsWith('"')&&!isNaN(Number(JSON.parse(x.bad)))&&false));if(a.length)console.log('  ',k,'|',a.map(x=>x.plan+(x.eqZero?'=zero':'=other')).join(','));}

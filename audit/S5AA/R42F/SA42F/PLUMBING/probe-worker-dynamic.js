'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
const path=require('path'),vm=require('vm');
const {loadCalculator}=require(path.join(h.TREE,'tests/lib/harness.js'));
function rich(m,o={}){const p=basePlan(Object.assign({couple:true,age:58.3,retireAge:61.5,endAge:84.7,salary:90000,spouseSalary:40000,spending:70000,strategy:'guardrails',inflation:2.5,returnRate:5,dividendOn:true,ssBenefit:2500,spouseSS:1200,healthOn:true,rmdOn:true,networthOn:true,
  accounts:[account('brok','taxable',300000,{basisPct:60}),account('ira','traditionalIRA',400000,{contribution:5000}),account('k','traditional401k',200000,{contribution:10000,matchOn:true,matchCap:6,matchRate:50}),account('roth','rothIRA',100000),account('hsa','hsa',20000,{contribution:3000}),account('sk','traditional401k',50000,{owner:'spouse',contribution:4000})]},o));
  Object.assign(p.retirement,{pension:12000,survivor:true,selfLife:80,spouseLife:92});p.assumptions.method=m;p.assumptions.runs=30;p.assumptions.volatility=14;p.assumptions.historyStart=1966;
  Object.assign(p.advanced,{insurance:100000,ltcOn:true,ltcCost:90000,ltcProbability:50,ltcYears:2,ltcInsurance:10000,healthInflation:5,conversionOn:true,conversionAmount:10000,qcd:2000,
   transferOn:true,transferFrom:'ira',transferTo:'roth',transferAmount:5000,transferAge:66.5,
   otherAssets:[{id:'oa',name:'land',value:100000,growth:2,available:true,availableAge:70,liquidity:'limited',accessPct:50}],
   debts:[{id:'m',name:'m',type:'mortgage',owner:'household',balance:150000,rate:6,paymentMonthly:1500,payoffAge:75.5,includePayment:true,includeHousingCosts:true,annualPropertyTax:3000,annualInsurance:1500,hoaMonthly:50,pmiMonthly:40,extraPrincipalMonthly:100,rateType:'adjustable',nextRateResetAge:65.25,resetRate:7},
     {id:'c',name:'card',type:'creditCard',owner:'household',balance:8000,rate:22,paymentMonthly:0,includePayment:true,rateType:'fixed'}]});return p;}
(async()=>{
  const dom=await loadCalculator({testHooks:true});const src=dom.window.document.getElementById('investment-calculator-v2c')._v2cWorkerSource;dom.window.close();
  const sb={self:{},console};vm.createContext(sb);vm.runInContext(src,sb);let reply;sb.self.postMessage=m=>{reply=m};
  const plans=[rich('simple'),rich('historical'),rich('monteCarlo'),rich('simple',{couple:false}),(()=>{const p=rich('simple');p.retirement.stages=[{name:'Go-go'}];return p})(),(()=>{const p=rich('simple');p.advanced.conversionAmount='abc';return p})()];
  let same=0;
  for(const [i,p] of plans.entries()){reply=null;sb.self.onmessage({data:{id:i,plan:structuredClone(p)}});const main=E.runScenario(structuredClone(p));
    const strip=r=>{const c=JSON.parse(JSON.stringify(r));if(c.identity)delete c.identity.runId;return JSON.stringify(c)};
    const eq=reply&&!reply.error&&strip(reply.result)===strip(main);if(eq)same++;
    console.log('plan',i,p.assumptions.method,'worker',reply&&reply.error?'ERROR '+reply.error.slice(0,80):reply.result.status,'main',main.status,'equal',eq);}
  console.log('equal',same,'of',plans.length);
})().catch(e=>{console.error(e);process.exit(1)});

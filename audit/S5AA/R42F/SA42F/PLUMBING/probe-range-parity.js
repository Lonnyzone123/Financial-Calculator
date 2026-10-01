// Range parity: validator ERROR/WARNING by range vs engine handling.
'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
function base(){const p=basePlan({couple:true,age:62,retireAge:62,endAge:70,spending:30000,healthOn:true,ssBenefit:2000,spouseSS:1000,
 accounts:[account('brok','taxable',300000,{basisPct:60}),account('ira','traditionalIRA',300000),account('hsa','hsa',20000),account('k','traditional401k',100000,{owner:'spouse'})]});
 p.advanced.healthInflation=5;p.advanced.ltcOn=true;p.advanced.ltcCost=50000;p.advanced.ltcProbability=50;p.advanced.ltcYears=2;p.advanced.ltcInsurance=0;
 p.retirement.otherIncomes=[{name:'pen',type:'pension',owner:'self',amount:12000,start:62,end:90,growth:0,growthMode:'fixed',survivorPercent:50}];p.retirement.selfLife=66;return p;}
const cases=[
 ['healthInflation -150',p=>{p.advanced.healthInflation=-150}],['healthInflation 150',p=>{p.advanced.healthInflation=150}],['healthInflation 30',p=>{p.advanced.healthInflation=30}],
 ['survivorPercent 150',p=>{p.retirement.otherIncomes[0].survivorPercent=150}],['survivorPercent -50',p=>{p.retirement.otherIncomes[0].survivorPercent=-50}],
 ['qualifiedMedicalPct 150',p=>{p.accounts[2].qualifiedMedicalPct=150}],['qualifiedMedicalPct -50',p=>{p.accounts[2].qualifiedMedicalPct=-50}],
 ['basisPct 150',p=>{p.accounts[0].basisPct=150}],['basisPct -20',p=>{p.accounts[0].basisPct=-20}],
 ['ssClaim 75',p=>{p.retirement.ssClaim=75}],['ssClaim 60',p=>{p.retirement.ssClaim=60}],
 ['profile.age 125',p=>{p.profile.age=125;p.profile.retireAge=125;p.profile.endAge=126;p.retirement.selfLife=130;p.retirement.spouseLife=130}],
 ['correlation 2',p=>{p.advanced.correlation=2}],['volatility -5 (MC)',p=>{p.assumptions.method='monteCarlo';p.assumptions.runs=10;p.assumptions.volatility=-5}],
 ['yearsOfService -1',p=>{p.accounts[3].yearsOfService=-1}],['vestingSchedule x',p=>{p.accounts[3].vestingSchedule='x'}],
 ['irmaaMagiOneYearBefore -5',p=>{p.advanced.irmaaMagiOneYearBefore=-5;p.advanced.irmaaMagiTwoYearsBefore=0}],
 ['priorYearFicaWages -1',p=>{p.accounts[3].priorYearFicaWages=-1}],['ltcProbability 150',p=>{p.advanced.ltcProbability=150}],['ltcYears -2',p=>{p.advanced.ltcYears=-2}],
 ['spending -1000',p=>{p.retirement.spending=-1000}],['stage percent 500',p=>{p.retirement.stages=[{name:'s',start:62,end:70,mode:'percent',value:500,growthMode:'none'}]}],
 ['dividendQualified 150',p=>{p.retirement.dividendOn=true;p.retirement.dividendQualified=150}],['inflation -150',p=>{p.assumptions.inflation=-150}],['fee 150',p=>{p.assumptions.fee=150}],
 ['returnRate -150',p=>{p.assumptions.returnRate=-150}],['spouseAge 130',p=>{p.profile.spouseAge=130;p.retirement.spouseLife=140}],['endAge 130',p=>{p.profile.endAge=130;p.retirement.selfLife=140;p.retirement.spouseLife=140}],
 ['transferAge 200',p=>{p.advanced.transferOn=true;p.advanced.transferFrom='ira';p.advanced.transferTo='brok';p.advanced.transferAmount=1000;p.advanced.transferAge=200}],
 ['debt rate -5',p=>{p.advanced.debts=[{id:'d',name:'d',type:'otherDebt',balance:10000,rate:-5,paymentMonthly:100,payoffAge:69,includePayment:true,rateType:'fixed'}]}],
 ['otherAsset accessPct 150',p=>{p.advanced.assetsOn=true;p.advanced.networthOn=true;p.retirement.homeEquityFallback=true;p.advanced.otherAssets=[{id:'o',name:'o',value:100000,growth:0,available:true,availableAge:60,liquidity:'liquid',accessPct:150}]}],
];
const r0=E.runPlan(base());const base0=JSON.stringify(r0.rows);
for(const [n,f] of cases){const p=base();f(p);const v=h.validateScenario(structuredClone(p));const iss=v.issues.filter(i=>!/FILING|HSA_QUAL|UNKNOWN_ADV/.test(i.code)).map(i=>i.severity[0]+':'+i.code).join(',');
 let r;try{r=E.runPlan(structuredClone(p));}catch(e){r={status:'THREW '+e.message.slice(0,60)}}
 const eiss=(r.issues||[]).filter(i=>/CLAMP|SWAP|BOUND|RANGE|OUT_OF/.test(i.code)).map(i=>i.code).join(',');
 console.log(n.padEnd(28),'valid',String(v.valid).padEnd(5),iss.padEnd(50),'| engine',r.status,r.calculationErrorCode||'',eiss);}

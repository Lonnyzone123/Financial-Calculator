// String enums neither side checks: does a typo silently change figures?
'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
function base(){const p=basePlan({age:60,retireAge:62,endAge:76,salary:80000,spending:50000,returnRate:5,inflation:2,rmdOn:true,
  accounts:[account('brok','taxable',300000,{basisPct:60}),account('ira','traditionalIRA',300000,{contribution:6000}),account('k','traditional401k',200000,{contribution:10000,contributionMode:'amount'}),account('roth','rothIRA',50000)]});p.limitPolicy='redirect';return p;}
const r0=JSON.stringify(E.runPlan(base()).rows);
const cases=[['withdrawalTiming "Monthly"',p=>{p.assumptions.withdrawalTiming='Monthly'}],['withdrawalTiming "x"',p=>{p.assumptions.withdrawalTiming='x'}],['withdrawalTiming "annual"',p=>{p.assumptions.withdrawalTiming='annual'}],
 ['limitPolicy "Warn"',p=>{p.limitPolicy='Warn'}],['limitPolicy "warn"',p=>{p.limitPolicy='warn'}],
 ['account type "traditionalIra"',p=>{p.accounts[1].type='traditionalIra'}],['account type "401k"',p=>{p.accounts[2].type='401k'}],
 ['contributionMode "salarypct"',p=>{p.accounts[2].contributionMode='salarypct';p.accounts[2].contribution=10}],['contributionMode "salaryPct"',p=>{p.accounts[2].contributionMode='salaryPct';p.accounts[2].contribution=10}],
 ['annualChangeMode "Percent"',p=>{p.accounts[2].annualChangeMode='Percent';p.accounts[2].annualChange=5}],['annualChangeMode "percent"',p=>{p.accounts[2].annualChangeMode='percent';p.accounts[2].annualChange=5}],
 ['profile.state "CA"',p=>{p.profile.state='CA'}],['profile.state "az"',p=>{p.profile.state='az'}],['optimizationGoal "x"',p=>{p.retirement.optimizationGoal='x';p.retirement.withdrawalOrder='optimized'}],
 ['debt type "Mortgage"',p=>{p.advanced.debts=[{id:'d',name:'d',type:'Mortgage',balance:100000,rate:6,paymentMonthly:900,payoffAge:80,includePayment:true,includeHousingCosts:true,annualPropertyTax:3000,rateType:'fixed'}]}],
 ['debt type "mortgage"',p=>{p.advanced.debts=[{id:'d',name:'d',type:'mortgage',balance:100000,rate:6,paymentMonthly:900,payoffAge:80,includePayment:true,includeHousingCosts:true,annualPropertyTax:3000,rateType:'fixed'}]}],
 ['debt rateType "ARM"',p=>{p.advanced.debts=[{id:'d',name:'d',type:'otherDebt',balance:100000,rate:3,paymentMonthly:900,payoffAge:80,includePayment:true,rateType:'ARM',nextRateResetAge:63,resetRate:8}]}],
 ['debt rateType "adjustable"',p=>{p.advanced.debts=[{id:'d',name:'d',type:'otherDebt',balance:100000,rate:3,paymentMonthly:900,payoffAge:80,includePayment:true,rateType:'adjustable',nextRateResetAge:63,resetRate:8}]}],
 ['otherAsset liquidity "Liquid"',p=>{p.advanced.otherAssets=[{id:'o',name:'o',value:100000,growth:0,available:true,availableAge:60,liquidity:'Liquid',accessPct:100}];p.retirement.homeEquityFallback=true;p.advanced.networthOn=true}],
];
for(const [n,f] of cases){const p=base();f(p);const v=h.validateScenario(structuredClone(p));const iss=v.issues.filter(i=>!/FILING|HSA_Q|CONTRIBUTIONS_ABOVE/.test(i.code)).map(i=>i.severity[0]+':'+i.code).join(',');let r;try{r=E.runPlan(structuredClone(p))}catch(e){r={status:'THREW '+e.message.slice(0,40)}}
 const w=(r.issues||[]).filter(i=>!/HSA_Q|FILING|IRMAA|REVOLVING|UNSUPPORTED_ROTH/.test(i.code)).map(i=>i.code).join(',');
 console.log(n.padEnd(32),'valid',String(v.valid).padEnd(5),iss.padEnd(28),'| engine',r.status,r.calculationErrorCode||'',r.rows?(JSON.stringify(r.rows)===r0?'=base':'moved'):'',w.slice(0,90));}

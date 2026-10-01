'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
function base(){const p=basePlan({age:60,endAge:70,spending:40000,salary:0,accounts:[account('cash','taxable',2000000,{basisPct:100}),account('k','traditional401k',0,{contribution:5000})]});
 p.retirement.stages=[{name:'s',start:65,end:66,mode:'amount',value:30000,growthMode:'none'}];p.retirement.expenses=[{name:'e',age:63,amount:10000}];
 p.retirement.otherIncomes=[{name:'i',type:'pension',owner:'self',amount:10000,start:62,end:64,growth:0,growthMode:'fixed'}];return p;}
const r0=E.runPlan(base());const tot0=r0.rows.map(r=>r.spending+r.income).reduce((a,b)=>a+b,0);
const cases=[['stage {name} only (SA-01)',p=>{p.retirement.stages=[{name:'Go-go'}]}],['stage mode "amt"',p=>{p.retirement.stages[0].mode='amt'}],['stage growthMode "x"',p=>{p.retirement.stages[0].growthMode='x'}],
 ['income no end',p=>{delete p.retirement.otherIncomes[0].end}],['income type "Pension"',p=>{p.retirement.otherIncomes[0].type='Pension'}],['income growthMode "x"',p=>{p.retirement.otherIncomes[0].growthMode='x'}],['income no amount',p=>{delete p.retirement.otherIncomes[0].amount}],
 ['expense no age',p=>{delete p.retirement.expenses[0].age}],['expense kind "x"',p=>{p.retirement.expenses[0].kind='x'}],
 ['futureChange mode "x"',p=>{p.accounts[1].futureChanges=[{age:61,mode:'x',value:100}]}],['futureChange age "61"',p=>{p.accounts[1].futureChanges=[{age:'61',mode:'set',value:100}]}],['futureChange no age',p=>{p.accounts[1].futureChanges=[{mode:'set',value:100}]}],
 ['account taxClass "pretax"',p=>{p.accounts[1].taxClass='pretax'}],['account owner "partner"',p=>{p.accounts[1].owner='partner'}],['allocation ghost',p=>{p.accounts[0].allocation={flat:50,ghost:50}}],
 ['manualOrder dup',p=>{p.retirement.manualOrder='taxable,taxable,roth,hsa'}],['surplusPolicy "keep"',p=>{p.advanced.surplusPolicy='keep'}],['retainedCashOrder "LAST"',p=>{p.advanced.retainedCashOrder='LAST'}],
 ['irmaaFilingOneYearBefore "x"',p=>{p.advanced.irmaaFilingOneYearBefore='x'}],['transfer between owners',p=>{p.profile.spouseOn=true;p.profile.filing='mfj';p.accounts.push(account('sira','traditionalIRA',1000,{owner:'spouse'}),account('ira','traditionalIRA',50000));Object.assign(p.advanced,{transferOn:true,transferFrom:'ira',transferTo:'sira',transferAmount:1000,transferAge:62})}],
 ['duplicate account id',p=>{p.accounts[1].id='cash'}],
];
for(const [n,f] of cases){const p=base();f(p);const v=h.validateScenario(structuredClone(p));const errs=v.issues.filter(i=>i.severity==='ERROR').map(i=>i.code+'@'+i.path).join(',');
 let r;try{r=E.runPlan(structuredClone(p));}catch(e){r={status:'THREW '+e.message.slice(0,50)}}
 let note='';if(r.rows){const tot=r.rows.map(x=>x.spending+x.income).reduce((a,b)=>a+b,0);note=tot===tot0?'figures=base':'figures moved (spend+income '+tot0.toFixed(0)+' -> '+tot.toFixed(0)+')';}
 const w=(r.issues||[]).filter(i=>/REFUSED|UNKNOWN|INVALID/.test(i.code)).map(i=>i.code).join(',');
 console.log(n.padEnd(30),'valid',String(v.valid).padEnd(5),errs.slice(0,70).padEnd(70),'| engine',r.status,r.calculationErrorCode||'',w,note);}

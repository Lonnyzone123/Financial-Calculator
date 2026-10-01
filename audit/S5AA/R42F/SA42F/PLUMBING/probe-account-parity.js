'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
function base(){const p=basePlan({couple:true,age:73,endAge:78,spending:60000,rmdOn:true,healthOn:false,accounts:[account('brok','taxable',300000,{basisPct:60,priority:1}),account('ira','traditionalIRA',400000,{priority:2,spouseSoleBeneficiary:true}),account('hsa','hsa',50000,{priority:0,qualifiedMedicalPct:50}),
  account('k','traditional401k',100000,{priority:3,currentEmployerPlan:true,fivePercentOwner:false,priorYearFicaWages:100000,allocation:{flat:100}})]});p.profile.spouseAge=60;p.retirement.withdrawalOrder='optimized';return p;}
const r0=JSON.stringify(E.runPlan(base()).rows);
const cases=[['hsa qualifiedMedicalPct "abc"',p=>{p.accounts[2].qualifiedMedicalPct='abc'}],['hsa qualifiedMedicalPct null',p=>{p.accounts[2].qualifiedMedicalPct=null}],['hsa qualifiedMedicalPct "50"',p=>{p.accounts[2].qualifiedMedicalPct='50'}],
 ['priorYearFicaWages "abc"',p=>{p.accounts[3].priorYearFicaWages='abc'}],['allocation flat "100"',p=>{p.accounts[3].allocation={flat:'100'}}],['allocation flat "abc"',p=>{p.accounts[3].allocation={flat:'abc'}}],
 ['spouseSoleBeneficiary "true"',p=>{p.accounts[1].spouseSoleBeneficiary='true'}],['spouseSoleBeneficiary "false"',p=>{p.accounts[1].spouseSoleBeneficiary='false'}],['currentEmployerPlan "false"',p=>{p.accounts[3].currentEmployerPlan='false'}],['fivePercentOwner "true"',p=>{p.accounts[3].fivePercentOwner='true'}],
 ['priority "abc"',p=>{p.accounts[2].priority='abc'}],['priority true',p=>{p.accounts[2].priority=true}],['id 5 (number)',p=>{p.accounts[2].id=5}],['taxClass "pretax"',p=>{p.accounts[1].taxClass='pretax'}],
 ['yearsOfService "3"',p=>{p.accounts[3].yearsOfService='3'}],['vesting "abc"',p=>{p.accounts[3].vesting='abc'}],
];
for(const [n,f] of cases){const p=base();f(p);const v=h.validateScenario(structuredClone(p));const errs=v.issues.filter(i=>i.severity==='ERROR').map(i=>i.code+'@'+i.path).join(',');const ws=v.issues.filter(i=>i.severity==='WARNING'&&!/FILING|HSA_Q/.test(i.code)).map(i=>i.code).join(',');
 let r;try{r=E.runPlan(structuredClone(p));}catch(e){r={status:'THREW '+e.message.slice(0,50)}}
 console.log(n.padEnd(32),'valid',String(v.valid).padEnd(5),(errs||ws).slice(0,60).padEnd(60),'| engine',r.status,r.calculationErrorCode||'',r.rows?(JSON.stringify(r.rows)===r0?'=base':'moved'):'');}

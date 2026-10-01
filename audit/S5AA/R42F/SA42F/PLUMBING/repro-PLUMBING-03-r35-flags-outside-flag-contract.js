// PLUMBING-03: three boolean account fields added in R35 (spouseSoleBeneficiary, currentEmployerPlan, fivePercentOwner) are
// typed by the validator but are not in src/boolean-flag-contract.json, so the engine boundary does not refuse a string,
// and the engine's strict comparisons read "true"/"false" strings as the opposite or as both. Run with node.
'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
const flags=require(require('path').join(h.TREE,'src/boolean-flag-contract.json')).flags.map(f=>f.path);
console.log('in boolean-flag-contract.json:',['accounts[].spouseSoleBeneficiary','accounts[].currentEmployerPlan','accounts[].fivePercentOwner'].map(f=>f+'='+flags.includes(f)).join('  '));
function go(label,mk,vals,fig,hand){for(const v of vals){const p=mk(v);const val=h.validateScenario(structuredClone(p));const r=E.runPlan(structuredClone(p));
  console.log(label+' = '+JSON.stringify(v)+': validator valid '+val.valid+' '+val.issues.filter(i=>i.severity==='ERROR').map(i=>i.code+'@'+i.path).join(',')+' | runPlan '+r.status+(r.calculationErrorCode||'')+' | figure '+(r.rows?fig(r):'-'));}
  console.log('   hand expectation for the boolean the string spells: '+hand);}
// A. fivePercentOwner: a 5-percent owner gets no still-working exception (IRC 401(a)(9)(C)(ii)(I)); age 75 (born 1951, RMD age 73),
//    still employed, 401(k) $300,000, Uniform Lifetime Table divisor at 75 = 24.6 -> 300,000 / 24.6 = 12,195.12
{const mk=v=>{const p=basePlan({age:75,retireAge:80,endAge:76,salary:50000,spending:0,rmdOn:true,accounts:[account('cash','taxable',100000,{basisPct:100}),account('k','traditional401k',300000,{contribution:1000,currentEmployerPlan:true,fivePercentOwner:v})]});p.employment.contributionStop=80;return p};
 go('A accounts[1].fivePercentOwner',mk,[true,'true',false],r=>'rmd '+r.rows[1].rmd.toFixed(2),'"true" -> 5% owner -> RMD 300,000/24.6 = '+(300000/24.6).toFixed(2));}
// B. spouseSoleBeneficiary: "false" must mean the spouse is NOT sole beneficiary -> Uniform table (24.6 at 75), not Table II
{const mk=v=>{const p=basePlan({couple:true,age:75,endAge:76,spending:0,rmdOn:true,accounts:[account('cash','taxable',100000,{basisPct:100}),account('ira','traditionalIRA',300000,{spouseSoleBeneficiary:v})]});p.profile.spouseAge=60;return p};
 go('B accounts[1].spouseSoleBeneficiary',mk,[false,'false',true],r=>'rmd '+r.rows[1].rmd.toFixed(2),'"false" -> Uniform 24.6 -> RMD '+(300000/24.6).toFixed(2));}
// C. currentEmployerPlan "false": the Rule of 55 reads (x !== false) -> treated as the separating employer's plan (penalty waived),
//    while the RMD still-working test reads (x === true) -> treated as NOT that employer's plan. One value, two readings.
{const mk=v=>{const p=basePlan({age:57,retireAge:57,endAge:58,spending:30000,accounts:[account('k','traditional401k',300000,{currentEmployerPlan:v})]});p.advanced.rule55=true;p.profile.retireAge=56.5;p.profile.age=57;return p};
 go('C accounts[0].currentEmployerPlan',mk,[true,'false',false],r=>'taxes '+r.rows[1].taxes.toFixed(2)+' withdrawals '+r.rows[1].withdrawals.toFixed(2),'"false" -> not the separating employer\'s plan -> the 10% additional tax of IRC 72(t)(1) applies (as with false)');}

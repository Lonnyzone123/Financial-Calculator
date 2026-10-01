// PLUMBING-01: plan fields that neither validateScenario() nor the engine's input gate types are silently coerced
// (R41F-05's defect class, repaired in R42 for ssBenefit/spouseSS only). Each witness: validator valid, runPlan status ok,
// a household figure moved. Run: node repro-PLUMBING-01-untyped-fields-coerced.js   (add --app to also run the app's
// Restore-backup route in jsdom).
'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
let bad=0;
function run(p){const v=h.validateScenario(structuredClone(p));const r=E.runPlan(structuredClone(p));return {valid:v.valid,status:r.status,code:r.calculationErrorCode,r};}
function line(label,ctrl,test,expect,actualOf){const a=actualOf(test.r),e=expect,c=actualOf(ctrl.r);const mism=Math.abs(a-e)>0.005;if(mism&&test.valid&&test.status==='ok')bad++;
  console.log(label+'\n   control: valid '+ctrl.valid+', '+ctrl.status+', figure '+c+'\n   malformed: valid '+test.valid+', '+test.status+(test.code?' '+test.code:'')+', figure '+a+'   hand expectation '+e+(mism?'   <-- silently changed':''));}
// W1 conversionAmount "abc": a $20,000/yr Roth conversion becomes $0
{const mk=v=>{const p=basePlan({age:60,endAge:63,spending:0,accounts:[account('cash','taxable',100000,{basisPct:100}),account('ira','traditionalIRA',100000),account('roth','rothIRA',0)]});p.advanced.conversionOn=true;p.advanced.conversionAmount=v;return p};
 line('W1 advanced.conversionAmount "abc" -- Roth balance at 63 (3 x $20,000 converted, zero return)',run(mk(20000)),run(mk('abc')),3*20000,r=>r.rows[3].roth);}
// W2 employment.contributionStop "abc": every 401(k) deferral disappears
{const mk=v=>{const p=basePlan({age:40,retireAge:65,endAge:43,salary:100000,spending:0,accounts:[account('k','traditional401k',0,{contribution:10000})]});p.employment.contributionStop=v;return p};
 line('W2 employment.contributionStop "abc" -- 401(k) balance at 43 (3 x $10,000 deferred, stop 65)',run(mk(65)),run(mk('abc')),30000,r=>r.rows[3].preTax);}
// W3 retirement.selfLife "abc": a death at 70 disappears; decision 8 cuts the rows at the first opening with nobody alive (71)
{const mk=v=>{const p=basePlan({age:60,endAge:80,spending:20000,accounts:[account('cash','taxable',1000000,{basisPct:100})]});p.retirement.selfLife=v;return p};
 line('W3 retirement.selfLife "abc" -- last row age (single, life 70, horizon 80: cut at 71)',run(mk(70)),run(mk('abc')),71,r=>r.rows[r.rows.length-1].age);
 const t=run(mk('abc')).r,c=run(mk(70)).r;console.log('   lifetime spending: control '+c.rows.reduce((s,x)=>s+x.spending,0)+' (11 rows x 20,000 = 220,000), malformed '+t.rows.reduce((s,x)=>s+x.spending,0));}
// W4 advanced.ltcYears "2" (a numeric STRING): ltcStart + "2" concatenates ("702"), so care never ends
{const mk=v=>{const p=basePlan({age:60,endAge:76,spending:0,accounts:[account('cash','taxable',2000000,{basisPct:100})]});Object.assign(p.advanced,{ltcOn:true,ltcCost:50000,ltcProbability:100,ltcYears:v,ltcInsurance:0,healthInflation:0});return p};
 const sum=r=>r.rows.reduce((s,x)=>s+x.spending,0);
 line('W4 advanced.ltcYears "2" -- lifetime care cost (start max(65, round(60+10)) = 70, 2 years x $50,000)',run(mk(2)),run(mk('2')),100000,sum);}
// W5 debts[].type "Mortgage" (case): property tax silently dropped (only type === "mortgage" carries housing costs)
{const mk=v=>{const p=basePlan({age:60,endAge:62,spending:0,accounts:[account('cash','taxable',500000,{basisPct:100})]});p.advanced.debts=[{id:'d',name:'Home',type:v,owner:'household',balance:100000,rate:6,paymentMonthly:900,payoffAge:80,includePayment:true,includeHousingCosts:true,annualPropertyTax:3000,annualInsurance:0,hoaMonthly:0,pmiMonthly:0,extraPrincipalMonthly:0,rateType:'fixed'}];return p};
 line('W5 advanced.debts[0].type "Mortgage" -- debtHousing at 61 ($3,000 property tax, 0% inflation)',run(mk('mortgage')),run(mk('Mortgage')),3000,r=>r.rows[1].debtHousing);}
// W6 accounts[].annualChangeMode "Percent" (case): a 5% yearly raise in the deferral is read as $5
{const mk=v=>{const p=basePlan({age:40,retireAge:65,endAge:42,salary:100000,spending:0,accounts:[account('k','traditional401k',0,{contribution:10000,annualChange:5,annualChangeMode:v})]});p.employment.contributionStop=65;return p};
 line('W6 accounts[0].annualChangeMode "Percent" -- row 42 deferral (10,000 x 1.05)',run(mk('percent')),run(mk('Percent')),10500,r=>r.rows[2].contributions);}
// W7 retirement.aime "abc" with ssAdvanced: the earnings-based benefit silently falls back to the entered benefit
{const mk=v=>{const p=basePlan({age:66,endAge:68,spending:0,accounts:[account('cash','taxable',100000,{basisPct:100})]});Object.assign(p.retirement,{ssAdvanced:true,aime:v,ssBenefit:2500,ssClaim:67,ssCola:0});return p};
 const c=run(mk(6000));line('W7 retirement.aime "abc" -- row 68 Social Security (control figure from AIME 6,000)',c,run(mk('abc')),c.r.rows[2].income,r=>r.rows[2].income);}
console.log('\nsilently changed figures (valid + ok):',bad);
if(process.argv.includes('--app')){console.log('\nApp route (Restore backup, jsdom): what the app stores for a malformed value');process.argv.splice(2);require('./probe-app-restore.js');}

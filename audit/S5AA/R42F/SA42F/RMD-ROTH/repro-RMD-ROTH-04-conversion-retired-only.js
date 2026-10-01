// RMD-ROTH-04: "Enable annual Roth conversions / Annual conversion amount" converts nothing while the primary person works,
// and a prorated part in the retirement year, with no issue saying so. Run: node repro-RMD-ROTH-04-conversion-retired-only.js
'use strict';
const {h,acct,plan,codes}=require('./lib.js');
function P(retireAge){const p=plan({age:60,endAge:64,retireAge,conversionOn:true,conversionAmount:20000,
  accounts:[acct('ira','traditionalIRA',200000),acct('roth','rothIRA',0)]});p.employment.salary=50000;p.employment.contributionStop=60;return p}
for(const ra of [62,61.5]){const p=P(ra),v=h.validateScenario(structuredClone(p)),r=h.engine.runPlan(structuredClone(p));
  console.log(`-- retireAge ${ra}: valid ${v.valid} [${v.issues.map(i=>i.code).join(',')}] status ${r.status} issues [${codes(r).join(',')}]`);
  let prev=0;for(let i=1;i<r.rows.length;i++){const x=r.rows[i];console.log(`   row ${x.age}: Roth balance ${x.roth.toFixed(2)} (converted this row ${(x.roth-prev).toFixed(2)}) agi ${x.federalAgi.toFixed(2)}`);prev=x.roth}}
console.log('hand, reading the form literally (an annual amount): 20,000 converted in every row, Roth 20,000 / 40,000 / 60,000 / 80,000.');

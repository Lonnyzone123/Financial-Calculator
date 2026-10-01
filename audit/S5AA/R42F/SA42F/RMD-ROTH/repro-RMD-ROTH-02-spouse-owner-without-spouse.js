// RMD-ROTH-02: a traditional IRA whose owner is "spouse" in a plan with no spouse (spouseOn false) validates, and the engine
// reads its owner three different ways: no RMD ever, no QCD, and the 10% early-withdrawal tax on the hidden spouseAge.
// Run: node repro-RMD-ROTH-02-spouse-owner-without-spouse.js
'use strict';
const {h,acct,plan,codes}=require('./lib.js');
function P(owner){return plan({age:75,endAge:77,retireAge:75,spouseOn:false,spouseAge:50,spending:20000,qcd:5000,
  accounts:[acct('ira','traditionalIRA',300000,{owner})]})}
for(const owner of ['self','spouse']){
  const p=P(owner),v=h.validateScenario(structuredClone(p)),r=h.engine.runPlan(structuredClone(p));
  console.log(`-- owner "${owner}": valid ${v.valid}; validator issues [${v.issues.map(i=>i.severity+' '+i.code+' '+i.path).join('; ')}]; status ${r.status}; engine issues [${codes(r).join(',')}]`);
  for(let i=1;i<r.rows.length;i++){const x=r.rows[i];console.log(`   row ${x.age}: rmd ${x.rmd.toFixed(2)} rmdDistributed(incl. QCD) ${x.rmdDistributed.toFixed(2)} withdrawals ${x.withdrawals.toFixed(2)} agi ${x.federalAgi.toFixed(2)} taxes ${x.taxes.toFixed(2)} preTax ${x.preTax.toFixed(2)}`)}
}
console.log('hand (owner read as the only person, 75): RMD row 76 = 300000/24.6 =',(300000/24.6).toFixed(2),'; QCD 5,000 excluded; no 10% tax at 75.');
console.log('engine for owner "spouse": RMD 0, QCD 0, and taxes include 10% x the draw (spouseAge 50 + elapsed < 59.5).');

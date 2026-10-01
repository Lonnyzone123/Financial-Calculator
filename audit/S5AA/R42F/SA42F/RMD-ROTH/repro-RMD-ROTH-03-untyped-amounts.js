// RMD-ROTH-03: advanced.qcd, advanced.conversionAmount, advanced.transferAmount and advanced.transferAge are not type-checked by
// the validator or refused by the engine; a non-numeric value validates, runs `ok`, and silently becomes "nothing".
// Run: node repro-RMD-ROTH-03-untyped-amounts.js
'use strict';
const {h,acct,plan,codes}=require('./lib.js');
function base(){const p=plan({age:75,endAge:76,retireAge:75,accounts:[acct('ira','traditionalIRA',200000),acct('roth','rothIRA',0),acct('tx','taxable',0)]});return p}
function run(label,p){const v=h.validateScenario(structuredClone(p)),r=h.engine.runPlan(structuredClone(p)),x=r.rows&&r.rows[1];
  console.log(`${label.padEnd(44)} valid ${String(v.valid).padEnd(5)} errors [${v.issues.filter(i=>i.severity==='ERROR').map(i=>i.code+' '+i.path).join(';')}] status ${r.status} ${r.calculationErrorCode||''}`+(x?` | rmdDist ${x.rmdDistributed.toFixed(2)} agi ${x.federalAgi.toFixed(2)} roth ${x.roth.toFixed(2)} taxable ${x.taxable.toFixed(2)} preTax ${x.preTax.toFixed(2)}`:''))}
// QCD
let p=base();p.advanced.qcd=10000;run('qcd 10000 (control)',p);
p=base();p.advanced.qcd='10,000';run('qcd "10,000" (string with comma)',p);
p=base();p.advanced.qcd='abc';run('qcd "abc"',p);
// conversion
p=base();p.advanced.conversionOn=true;p.advanced.conversionAmount=50000;run('conversion 50000 (control)',p);
p=base();p.advanced.conversionOn=true;p.advanced.conversionAmount='50,000';run('conversion "50,000"',p);
// transfer
const T=(amt,ageV)=>{const q=base();Object.assign(q.advanced,{transferOn:true,transferFrom:'ira',transferTo:'tx',transferAmount:amt,transferAge:ageV});return q};
run('transfer 20000 at 75 (control)',T(20000,75));
run('transfer "20,000" at 75',T('20,000',75));
run('transfer 20000 at "75"',T(20000,'75'));
run('transfer 20000 at "seventy-five"',T(20000,'seventy-five'));
// for comparison, a field R42 types: retirement.ssBenefit
p=base();p.retirement.ssBenefit='abc';run('retirement.ssBenefit "abc" (R42-typed, refused)',p);
// Cross-area (LIFE-EVENTS), same mechanism: retirement.selfLife is not typed either. A text lifespan validates and runs as "never dies".
function L(life){const q=plan({age:75,endAge:80,retireAge:75,spouseOn:true,spouseAge:74,accounts:[acct('ira','traditionalIRA',200000)]});q.retirement.selfLife=life;return q}
for(const life of [76,'76','seventy-six']){const q=L(life),v=h.validateScenario(structuredClone(q)),r=h.engine.runPlan(structuredClone(q));
  console.log(`selfLife ${JSON.stringify(life).padEnd(14)} valid ${v.valid} status ${r.status} issues [${codes(r).join(',')}]`)}

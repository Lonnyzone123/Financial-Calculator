'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;
function show(label,p,f){const v=h.validateScenario(structuredClone(p));const r=h.engine.runPlan(structuredClone(p));console.log(label,'valid',v.valid,'status',r.status,r.calculationErrorCode||'',r.rows?r.rows.slice(0,4).map(f).join(' | ')+' ... last '+f(r.rows[r.rows.length-1]):'');}
// conversion
let p=basePlan({age:60,endAge:63,spending:0,accounts:[account('cash','taxable',100000,{basisPct:100}),account('ira','traditionalIRA',100000),account('roth','rothIRA',0)]});
p.advanced.conversionOn=true;p.advanced.conversionAmount=20000;
show('conv 20000',p,r=>r.age+':roth='+r.roth.toFixed(2)+',agi='+r.federalAgi.toFixed(2));
p.advanced.conversionAmount='abc';show('conv abc',p,r=>r.age+':roth='+r.roth.toFixed(2)+',agi='+r.federalAgi.toFixed(2));
// contributionStop
p=basePlan({age:40,retireAge:65,endAge:43,salary:100000,spending:0,accounts:[account('k','traditional401k',0,{contribution:10000})]});
p.employment.contributionStop=65;show('stop 65',p,r=>r.age+':contrib='+r.contributions+',preTax='+r.preTax);
p.employment.contributionStop='abc';show('stop abc',p,r=>r.age+':contrib='+r.contributions+',preTax='+r.preTax);
// selfLife
p=basePlan({age:60,endAge:80,spending:20000,accounts:[account('cash','taxable',1000000,{basisPct:100})]});p.retirement.selfLife=70;
show('life 70',p,r=>r.age+':sp='+r.spending);
p.retirement.selfLife='abc';show('life abc',p,r=>r.age+':sp='+r.spending);
// qcd
p=basePlan({age:72,endAge:75,spending:0,rmdOn:true,accounts:[account('cash','taxable',100000,{basisPct:100}),account('ira','traditionalIRA',500000)]});p.advanced.qcd=10000;
show('qcd 10000',p,r=>r.age+':rmd='+r.rmd.toFixed(0)+',agi='+r.federalAgi.toFixed(0)+',tax='+r.taxes.toFixed(0));
p.advanced.qcd='abc';show('qcd abc',p,r=>r.age+':rmd='+r.rmd.toFixed(0)+',agi='+r.federalAgi.toFixed(0)+',tax='+r.taxes.toFixed(0));
// ssCola
p=basePlan({age:67,endAge:70,spending:0,ssBenefit:2000,accounts:[account('cash','taxable',100000,{basisPct:100})]});p.retirement.ssCola=3;
show('cola 3',p,r=>r.age+':inc='+r.income.toFixed(2));
p.retirement.ssCola='abc';show('cola abc',p,r=>r.age+':inc='+r.income.toFixed(2));
p.retirement.ssCola=0;show('cola 0',p,r=>r.age+':inc='+r.income.toFixed(2));
// ltcYears "2"
p=basePlan({age:60,endAge:76,spending:0,accounts:[account('cash','taxable',2000000,{basisPct:100})]});
Object.assign(p.advanced,{ltcOn:true,ltcCost:50000,ltcProbability:100,ltcYears:2,ltcInsurance:0,healthInflation:0});
show('ltc 2',p,r=>r.age+':sp='+r.spending.toFixed(0));
p.advanced.ltcYears='2';show('ltc "2"',p,r=>r.age+':sp='+r.spending.toFixed(0));

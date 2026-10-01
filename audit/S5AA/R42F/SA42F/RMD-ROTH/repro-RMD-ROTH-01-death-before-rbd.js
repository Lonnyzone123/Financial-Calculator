// RMD-ROTH-01: an owner who dies in their first distribution calendar year (before the required beginning date) is charged
// that year's RMD. Run: node repro-RMD-ROTH-01-death-before-rbd.js
'use strict';
const {h,acct,plan,check,row,codes}=require('./lib.js');
const out=(l,r,from,to)=>{console.log('--',l,'| status',r.status,'| issues',codes(r).join(','));for(let i=from;i<=to&&i<r.rows.length;i++){const x=r.rows[i];console.log('  row',x.age,'rmd',x.rmd.toFixed(2),'rmdDistributed',x.rmdDistributed.toFixed(2),'agi',x.federalAgi.toFixed(2),'taxes',x.taxes.toFixed(2),'preTax',x.preTax.toFixed(2),'total',x.total.toFixed(2))}};
// Witness A: IRA. Self 72 at the start (engine birth year 2026-72 = 1954, RMD start age 73, first distribution year = row 1 = 2027,
// labelled 74). Dies at 73.5, inside that row. Spouse 65 (born 1961, start 75) survives and treats the IRA as her own.
function A(extra){const p=plan({age:72,endAge:76,spouseOn:true,spouseAge:65,accounts:[acct('ira','traditionalIRA',500000)]});p.retirement.selfLife=73.5;if(extra)extra(p);return p}
const a=check(A());out('A: IRA owner dies at 73.5 in first distribution year',a,1,4);
console.log('  hand: row 74 RMD 0 (died before RBD 1 April 2028); actual',a.rows[2].rmd.toFixed(2),'= 500000/26.5 =',(500000/26.5).toFixed(2));
console.log('  hand: preTax at row 76 = 500000.00; actual',a.rows[4].preTax.toFixed(2));
// Living control: same plan, self lives -- the RMD at 73 is owed (and is).
const ac=check(A(p=>{p.retirement.selfLife=120}));out('A-control: self lives',ac,1,3);
// Witness A with taxable other income, so the forced income is taxed: $90,000 joint pension (100% survivor share).
function A2(rmdOn){return A(p=>{p.advanced.rmdOn=rmdOn;p.retirement.pension=90000;p.retirement.pensionCola=0})}
const v=h.validateScenario(structuredClone(A2(true)));console.log('A2 valid',v.valid,v.issues.filter(i=>i.severity==='ERROR').map(i=>i.code+':'+i.path).join(','));
const a2=check(A2(true)),a2c=check(A2(false));out('A2: with $90,000 pension',a2,2,2);out('A2 control rmdOn=false (measured, no RMD can fall due in this window)',a2c,2,2);
console.log('  measured tax overstatement in the death row:',(a2.rows[2].taxes-a2c.rows[2].taxes).toFixed(2),' AGI overstatement:',(a2.rows[2].federalAgi-a2c.rows[2].federalAgi).toFixed(2));
// Witness B: 401(k), still working past 73; retires at 75.3 and dies at 75.6, the same year (before the RBD of 1 April of the next year).
function B(life){const p=plan({age:74,endAge:77,spouseOn:true,spouseAge:65,retireAge:75.3,accounts:[acct('k','traditional401k',500000,{contribution:0,currentEmployerPlan:true})]});p.employment.salary=100000;p.employment.contributionStop=75.3;p.retirement.selfLife=life;return p}
const b=check(B(75.6));out('B: 401(k) owner retires 75.3, dies 75.6',b,1,3);
console.log('  hand: row 76 RMD 0 (died before RBD); actual',b.rows[2].rmd.toFixed(2),'= 500000/24.6 =',(500000/24.6).toFixed(2));

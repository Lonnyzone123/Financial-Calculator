'use strict';
// Independent R52 boundary simulations. Usage: node this.js <source-root> <output.json>
// Expectations precede execution. Full projections, plus output-neutral year-end state taps.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(process.argv[2]||'.'),OUT=path.resolve(process.argv[3]||'r52-boundaries.json');
const L=require(path.join(ROOT,'audit/S5AA/R40/S5AA_R40_CONSERVATION_GRID/lib.js'));
const E=L.h.engine,V=L.h.validateScenario,a=L.account,b=o=>L.basePlan({dividendOn:true,dividendYield:0,spending:0,...o});
const {loadEngineVariant}=require(path.join(ROOT,'tests/lib/engine-variant.js'));
const taps=[];globalThis.__R52Independent=x=>taps.push(JSON.parse(JSON.stringify(x)));
const T=loadEngineVariant([{id:'independent-settlement',marker:'rothConversionTrueUp=rothSettleConversions(iraBasisState.roth,settledIra);',append:'globalThis.__R52Independent&&globalThis.__R52Independent({yi:yi,basis:{self:iraBasisState.self,spouse:iraBasisState.spouse,inherited:iraBasisState.inherited},settled:settledIra,roth:iraBasisState.roth});'}]);
const cases=[];let checks=0;
function simulate(id,name,p,expect){
 const v=V(structuredClone(p));assert.equal(v.valid,true,JSON.stringify(v.issues));
 taps.length=0;const r=E.runPlan(structuredClone(p)),tv=T.runPlan(structuredClone(p));
 assert.deepEqual(tv.rows,r.rows,'output-neutral rows');assert.deepEqual(tv.issues,r.issues,'output-neutral issues');
 const cs=[];const near=(label,actual,expected,tol=.01)=>{checks++;cs.push({label,actual,expected,tolerance:tol,pass:Number.isFinite(actual)&&Math.abs(actual-expected)<=tol});};
 near('successful calculation',r.status==='ok'?1:0,1,0);
 near('no settlement safeguard',r.issues.filter(x=>/QUOTE_SETTLEMENT_UNVERIFIED|TAX_SETTLEMENT_MISMATCH|NONFINITE_SETTLEMENT|ROW_INVARIANT|COMMITTED_CASH_MISMATCH/.test(x.code)).length,0,0);
 expect(r,taps,near);cases.push({id,name,plan:p,checks:cs,rows:r.rows,settlements:taps,pass:cs.every(x=>x.pass)});
}
const at=(r,age)=>r.rows.find(x=>Math.abs(x.age-age)<1e-8);
const stop=value=>[{age:41,mode:'set',value}];
// E01-E05: 12,500 carried excess; one 7,500 capacity, reduced by current contributions.
// Reversing the original owners preserves the financial result. No spousal-compensation premise.
for(const [i,current,mirror] of [[1,0,false],[2,1000,false],[3,4000,false],[4,7500,false],[5,1000,true]]){
 const p=b({couple:mirror,age:40,spouseAge:40,retireAge:45,endAge:42,salary:50000,spouseSalary:mirror?50000:0,accounts:[a('trad','traditionalIRA',0,{owner:mirror?'spouse':'self',contribution:10000,futureChanges:stop(current)}),a('roth','rothIRA',0,{owner:mirror?'spouse':'self',contribution:10000,futureChanges:stop(0)}),a('cash','taxable',100000)]});
 p.profile.spouseRetireAge=45;p.limitPolicy='warn';
 simulate('E0'+i,'Shared IRA capacity, current traditional '+current+(mirror?', spouse owner':''),p,(r,t,n)=>{n('first excise',at(r,41).taxOutstanding,750);n('second excise',at(r,42).taxOutstanding,.06*(12500-(7500-current)));});
}
const stream=(id,type,amount,owner='self')=>({id,name:id,type,amount,owner,start:0,end:120,growth:0,growthMode:'fixed'});
const se=x=>x*.9235*.153;
const fed=(ti)=>{let lo=0,z=0;for(const [hi,rate] of [[24800,.10],[100800,.12],[211400,.22]]){z+=Math.max(0,Math.min(ti,hi)-lo)*rate;lo=hi;}return z;};
// Q01-Q05: hand-derived owner allocation and 2026 MFJ federal/Arizona/payroll arithmetic.
// Explicit expected cuts; no engine tax helper supplies the oracle.
for(const [id,w1,w2,s1,s2,job,d1,d2,cut] of [
 ['Q01',0,90000,60000,0,0,12000,0,12000],
 ['Q02',90000,0,0,60000,0,0,12000,12000],
 ['Q03',6000,90000,60000,0,0,18000,0,12000],
 ['Q04',6000,90000,40000,0,20000,18000,0,8000],
 ['Q05',6000,10000,60000,40000,0,18000,16000,18000]]){
 const incomes=[];if(s1)incomes.push(stream('self-business','selfEmployment',s1));if(s2)incomes.push(stream('spouse-business','selfEmployment',s2,'spouse'));if(job)incomes.push(stream('job','employment',job));
 const accounts=[a('cash','taxable',100000)];if(d1)accounts.push(a('k1','traditional401k',0,{contribution:d1}));if(d2)accounts.push(a('k2','traditional401k',0,{owner:'spouse',contribution:d2}));
 const p=b({couple:true,age:40,spouseAge:40,retireAge:60,endAge:41,salary:w1,spouseSalary:w2,otherIncomes:incomes,accounts});p.profile.spouseRetireAge=60;
 const payroll=se(s1)+se(s2)+.0765*(w1+w2+job),half=(se(s1)+se(s2))/2,agi=w1+w2+job+s1+s2-d1-d2-half,ti=Math.max(0,agi-32200),qbi=Math.min(.2*Math.max(0,s1+s2-half-cut),.2*ti),tax=fed(ti-qbi)+.025*ti+payroll;
 simulate(id,'QBI allocation cut '+cut,p,(r,t,n)=>{n('AGI',at(r,41).federalAgi,agi);n('total tax',at(r,41).taxes,tax);});
}
// I01-I05: projection creates 7,500 basis; inherited pool is 15,000 (half basis).
// Move 0/3,000/7,500/15,000, or reverse original owner. No distribution in transfer year.
for(const [i,move,mirror] of [[1,0,false],[2,3000,false],[3,7500,false],[4,15000,false],[5,3000,true]]){
 const dead=mirror?'spouse':'self',live=mirror?'self':'spouse';
 const p=b({couple:true,age:45,spouseAge:45,retireAge:46,endAge:48,salary:mirror?0:200000,spouseSalary:mirror?200000:0,accounts:[a('dead','traditionalIRA',7500,{owner:dead,contribution:7500}),a('live','traditionalIRA',0,{owner:live}),a('active','roth401k',0,{owner:dead,contribution:1}),a('cash','taxable',100000)]});
 p.profile.spouseRetireAge=46;p.retirement[mirror?'spouseLife':'selfLife']=46.5;
 Object.assign(p.advanced,{transferOn:true,transferFrom:'dead',transferTo:'live',transferAmount:move,transferAge:47.5});
 simulate('I0'+i,'Inherited basis moves with '+move+(mirror?', reverse owners':''),p,(r,t,n)=>{const st=t.find(x=>x.yi===2);n('survivor own basis',st.basis[live],move/2);n('inherited basis',st.basis.inherited,7500-move/2);n('basis conserved',st.basis[live]+st.basis.inherited,7500);n('no rollover income',at(r,48).federalAgi,0);});
}
// R01-R05: same-year distributions after a 7,500 conversion; final NT fraction
// 7,500/(opening IRA+7,500). The first taxable conversion dollars bear 10%.
// The salary year's independent base tax is 55,670.235, marginal income tax .265.
for(const [i,opening,draw,exception] of [[1,0,1000,false],[2,0,7500,false],[3,7500,5000,false],[4,22500,6000,false],[5,22500,6000,true]]){
 const p=b({age:45,retireAge:46,endAge:46,salary:200000,accounts:[a('ira','traditionalIRA',opening,{contribution:7500}),a('roth','rothIRA',0),a('active','traditional401k',0,{contribution:1}),a('cash','taxable',100000)]});
 Object.assign(p.advanced,{conversionOn:true,conversionAmount:7500,conversionStartAge:45,transferOn:true,transferFrom:'roth',transferTo:'cash',transferAmount:draw,transferAge:45.75,penaltyException:exception});
 const finalTaxable=7500*(1-7500/(opening+7500)),penalty=exception?0:.1*Math.min(draw,finalTaxable),tax=55670.235+.265*finalTaxable+penalty;
 simulate('R0'+i,'Same-year final conversion taxable '+finalTaxable+', draw '+draw+(exception?', exception':''),p,(r,t,n)=>{n('settled tax',at(r,46).taxSettled,tax);n('true-up',at(r,46).taxOutstanding,.265*(finalTaxable-7500)+penalty-(exception?0:.1*draw));const c=t[0].roth.self.conv.find(x=>x.year===0);n('remaining taxable conversion',c?c.taxable:0,Math.max(0,finalTaxable-draw));n('remaining conversion principal',c?c.taxable+c.nontaxable:0,7500-draw);});
}
const summary={simulations:cases.length,checks,passed:cases.filter(x=>x.pass).length,failed:cases.filter(x=>!x.pass).map(x=>({id:x.id,checks:x.checks.filter(c=>!c.pass)}))};
// Additional full-model limitation probe, separate from the 20 simulations.
// MODEL_ASSUMPTIONS.md 28.5 explicitly excludes year-end aggregation: H01
// is a statutory mismatch inside that disclosed limit, not a new finding.
// 1.408A-6 A-8(a), A-9(a),(c): classify at tax-year end; a later conversion
// precedes earnings. At R52, 2,000 withdrawn before the late conversion stays
// earnings; subsequent 3,019.444444 is corrected. All 5,019.444444 is actually
// covered by the 7,500 nontaxable conversion. Correct settled tax is the base
// 55,670.235; correct closing conversion NT principal is 2,480.555556.
const boundaryCases=cases.splice(0);
for(const [id,date] of [['H01',45.75],['H02',45]]){
 const p=b({age:45,retireAge:46,endAge:47,salary:200000,manualOrder:'roth,taxable,preTax,hsa',accounts:[a('i','traditionalIRA',0,{contribution:7500,priority:2}),a('r','rothIRA',5000,{contributionBasis:0,priority:1}),a('active','traditional401k',0,{contribution:1,priority:8}),a('cash','taxable',0)]});
 p.profile.rothFirstContributionYear=2026;p.retirement.expenses=[{age:45,amount:2000}];
 Object.assign(p.advanced,{conversionOn:false,transferOn:true,transferFrom:'i',transferTo:'r',transferAmount:7500,transferAge:date});
 simulate(id,'Annual Roth ordering, conversion date '+date,p,(r,t,n)=>{n('settled salary-year tax',at(r,46).taxSettled,55670.235);n('no Roth earnings in final AGI',at(r,46).federalAgi,199999);const c=t[0].roth.self.conv.find(x=>x.year===0);n('conversion principal after all annual draws',c.nontaxable,7500-at(r,46).withdrawals);});
}
const hunt={classification:'disclosed year-end Roth aggregation limit, not a new finding',cases:cases.length,passed:cases.filter(x=>x.pass).length,failed:cases.filter(x=>!x.pass).map(x=>({id:x.id,checks:x.checks.filter(c=>!c.pass)}))};
// U01: imported valid short working horizon, through the fresh app's actual
// Restore backup input. 1 year: (100,000+1,000)*1.05 = 106,050.
// The form silently extends endAge 41 to retireAge 60. Twenty years:
// 100,000*1.05^20 + 1,000*1.05*(1.05^20-1)/.05 = 300,049.022322476.
async function importHorizon(){
 const {loadCalculator,waitFor}=require(path.join(ROOT,'tests/lib/harness.js'));
 const p=b({age:40,retireAge:60,endAge:41,salary:10000,returnRate:5,accounts:[a('roth','rothIRA',100000,{contribution:1000,contributionBasis:100000})]});
 const valid=V(structuredClone(p)).valid,raw=E.runPlan(structuredClone(p));
 const dom=await loadCalculator();const w=dom.window,d=w.document;
 try{
  const app={version:2,edition:'2C',page:'setup',complexity:'standard',theme:'auto',compare:false,active:0,scenarios:[p]},payload={format:'investment-calculator-v2c',version:2,app};
  const input=d.getElementById('v2-import-settings'),status=d.getElementById('v2-status');
  Object.defineProperty(input,'files',{value:[new w.File([JSON.stringify(payload)],'horizon.json',{type:'application/json'})],configurable:true});status.textContent='';input.dispatchEvent(new w.Event('change',{bubbles:true}));
  await waitFor(()=>status.textContent!==''&&!/is-running/.test(d.getElementById('v2-performance').className),{window:w,timeoutMs:15000});
  const posted=JSON.parse(w.localStorage.getItem('investment-calculator-v2c')).scenarios[0],r=E.runPlan(structuredClone(posted)),expected=(100000+1000)*1.05;
  const horizon={id:'U01',finding:'R52-01',valid,plan:p,importStatus:status.textContent,requestedEnd:p.profile.endAge,actualEnd:posted.profile.endAge,expected,raw:raw.rows.at(-1).total,actual:r.rows.at(-1).total,extendedHorizonOracle:100000*1.05**20+1000*1.05*(1.05**20-1)/.05,pass:posted.profile.endAge===41&&Math.abs(r.rows.at(-1).total-expected)<.01};
  // U02: R03's same-year 5,000 draw at 45.75 must bear 375 of 10% on
  // its final taxable conversion principal. Import rounds its date to 46,
  // outside [45,46), omitting the transfer and its additional tax entirely.
  const q=structuredClone(boundaryCases.find(x=>x.id==='R03').plan);payload.app.scenarios=[q];
  Object.defineProperty(input,'files',{value:[new w.File([JSON.stringify(payload)],'quarter-date.json',{type:'application/json'})],configurable:true});status.textContent='';input.dispatchEvent(new w.Event('change',{bubbles:true}));
  await waitFor(()=>status.textContent!==''&&!/is-running/.test(d.getElementById('v2-performance').className),{window:w,timeoutMs:15000});
  const postedQ=JSON.parse(w.localStorage.getItem('investment-calculator-v2c')).scenarios[0],rq=E.runPlan(structuredClone(postedQ));
  const transfer={id:'U02',finding:'R52-02',valid:V(q).valid,plan:q,importStatus:status.textContent,requestedAge:q.advanced.transferAge,actualAge:postedQ.advanced.transferAge,expectedTax:57038.985,actualTax:rq.rows.at(-1).taxSettled,expectedNetworth:113632.25,actualNetworth:rq.rows.at(-1).networth,pass:postedQ.advanced.transferAge===45.75&&Math.abs(rq.rows.at(-1).taxSettled-57038.985)<.01};
  return {horizon,transfer};
 }finally{w.close();}
}
(async()=>{
 const ui=await importHorizon(),crypto=require('node:crypto'),cp=require('node:child_process');
 const sourceSha=cp.execFileSync('git',['-c','core.commitGraph=false','rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8',windowsHide:true}).trim();
 const hashes=Object.fromEntries(['src/engine.js','src/scenario-validator.js','src/app-shell.html'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex')]));
 fs.writeFileSync(OUT,JSON.stringify({sourceSha,hashes,summary,boundaryCases,hunt,huntCases:cases,ui},null,2));console.log(JSON.stringify({sourceSha,summary,hunt,ui:{horizon:{...ui.horizon,plan:undefined},transfer:{...ui.transfer,plan:undefined}}},null,2));process.exitCode=summary.failed.length||hunt.failed.length||!ui.horizon.pass||!ui.transfer.pass?1:0;
})().catch(e=>{console.error(e.stack);process.exitCode=2;});

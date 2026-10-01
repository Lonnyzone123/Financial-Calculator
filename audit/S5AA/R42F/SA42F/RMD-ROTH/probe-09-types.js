const {h,acct,plan,check,row,codes}=require('./lib.js');
function tryit(label,mut){const p=plan({age:75,endAge:76,qcd:10000,conversionOn:true,conversionAmount:20000,accounts:[acct('ira','traditionalIRA',200000),acct('roth','rothIRA',0),acct('tx','taxable',1000)]});
 p.advanced.transferOn=true;p.advanced.transferFrom='ira';p.advanced.transferTo='tx';p.advanced.transferAmount=5000;p.advanced.transferAge=75;
 mut(p);const v=h.validateScenario(structuredClone(p));const r=h.engine.runPlan(structuredClone(p));
 console.log(label,'valid',v.valid,v.issues.filter(x=>x.severity==='ERROR').map(x=>x.code+':'+x.path).join(','),'| status',r.status,r.calculationErrorCode||'',(r.issues||[]).filter(i=>i.severity==='ERROR').map(i=>i.code).join(','),r.rows&&r.rows[1]?JSON.stringify(row(r,1)):'');}
tryit('control',p=>{});
for(const [k,val] of [['qcd','abc'],['qcd','10000'],['qcd',-5],['qcd',null],['conversionAmount','abc'],['conversionAmount',-20000],['conversionOn','yes'],['transferAmount','abc'],['transferAge','abc'],['rmdOn','true'],['qcd',1e12]]) tryit(`advanced.${k}=${JSON.stringify(val)}`,p=>{p.advanced[k]=val});
tryit('acct currentEmployerPlan "no"',p=>{p.accounts[1].currentEmployerPlan='no'});
tryit('retirement.selfLife "abc"',p=>{p.retirement.selfLife='abc'});

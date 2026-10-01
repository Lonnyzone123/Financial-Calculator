const {h,acct,plan,check,row,codes}=require('./lib.js');
const p=plan({age:75,endAge:76,spouseOn:false,accounts:[acct('ira','traditionalIRA',100000,{owner:'spouse'})]});
const v=h.validateScenario(structuredClone(p));console.log('valid',v.valid,v.issues.map(i=>i.severity+':'+i.code+':'+i.path).join(' | '));
const r=h.engine.runPlan(structuredClone(p));console.log(r.status,r.rows[1]&&row(r,1),codes(r));

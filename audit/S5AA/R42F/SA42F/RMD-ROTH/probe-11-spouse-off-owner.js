const {h,acct,plan,check,row,codes}=require('./lib.js');
for(const owner of ['self','spouse']){
 const p=plan({age:75,endAge:77,spouseOn:false,spouseAge:50,spending:20000,qcd:5000,accounts:[acct('ira','traditionalIRA',300000,{owner})]});
 const v=h.validateScenario(structuredClone(p));
 const r=h.engine.runPlan(structuredClone(p));
 console.log('owner',owner,'valid',v.valid,v.issues.map(i=>i.code).join(','),'status',r.status,codes(r).join(','));
 for(let i=1;i<r.rows.length;i++)console.log(JSON.stringify(row(r,i)));
}

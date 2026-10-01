// Generated plans (valid by construction): result contract, and zero-volatility Monte Carlo == simple, with debts added.
'use strict';
const h=require('../harness.js');const E=h.engine;const path=require('path');
const G=require(path.join(h.TREE,'tests/lib/scenario-generator.js'));
const {checkResult}=require(path.join(h.TREE,'tools/result-contract.js'));
const N=+process.argv[2]||150;let viol={},invalid=0,errs={},mcMismatch=0,checked=0,ok=0;
for(let s=1;s<=N;s++){let p;try{p=G.generateScenario(structuredClone(h.defaults),900000+s);}catch(e){continue;}
  const v=h.validateScenario(structuredClone(p));if(!v.valid){invalid++;continue;}
  for(const m of ['simple','historical','monteCarlo']){const q=structuredClone(p);q.assumptions.method=m;q.assumptions.runs=8;if(m==='historical')q.assumptions.historyStart=1928+(s%60);
    let r;try{r=E.runPlan(structuredClone(q));}catch(e){errs['THROW '+e.message.slice(0,40)]=(errs['THROW '+e.message.slice(0,40)]||0)+1;continue;}
    if(r.status!=='ok'){errs[m+':'+r.calculationErrorCode]=(errs[m+':'+r.calculationErrorCode]||0)+1;}else ok++;
    const c=checkResult(r,{plan:q});checked++;c.violations.forEach(x=>{const k=m+':'+x.rule;viol[k]=(viol[k]||0)+1;});}
  // zero-vol MC equals simple
  const a=structuredClone(p);a.assumptions.method='simple';a.assumptions.volatility=0;if(a.advanced.assetClasses)a.advanced.assetClasses.forEach(c=>c.volatility=0);a.advanced.ltcOn=false;
  const b=structuredClone(a);b.assumptions.method='monteCarlo';b.assumptions.runs=3;
  const ra=E.runPlan(structuredClone(a)),rb=E.runPlan(structuredClone(b));
  if(ra.status==='ok'&&rb.status==='ok'){let d=0;for(let y=0;y<ra.rows.length;y++)for(const k of ['total','taxes','spending','income','withdrawals','networth','debtBalance'])d=Math.max(d,Math.abs(ra.rows[y][k]-rb.rows[y][k]));if(d>1e-6){mcMismatch++;if(mcMismatch<4)console.log('zero-vol mismatch seed',900000+s,d);}}
}
console.log('plans',N,'invalid',invalid,'results checked',checked,'ok',ok);console.log('violations',JSON.stringify(viol));console.log('non-ok',JSON.stringify(errs));console.log('zero-vol MC!=simple',mcMismatch);

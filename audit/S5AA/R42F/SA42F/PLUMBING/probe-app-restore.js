// App route: Restore backup with a non-number in fields neither the validator nor the engine types. What does the app store?
'use strict';
const h=require('../harness.js');
const path=require('path');
const {loadCalculator,waitFor}=require(path.join(h.TREE,'tests/lib/harness.js'));
(async()=>{
  const fields=process.argv[2]?JSON.parse(process.argv[2]):{'retirement.pension':'abc','retirement.selfLife':'abc','advanced.conversionAmount':'abc','advanced.qcd':'abc','employment.contributionStop':'abc','retirement.ssCola':'abc','advanced.ltcYears':'2'};
  for(const [dotted,bad] of Object.entries(fields)){
    const dom=await loadCalculator();const w=dom.window,root=w.document.getElementById('investment-calculator-v2c');
    try{
      const app=JSON.parse(w.localStorage.getItem('investment-calculator-v2c'));
      const cand=JSON.parse(JSON.stringify(app));const s=cand.scenarios[0];s.setupComplete=true;
      const [sec,key]=dotted.split('.');const before=s[sec][key];s[sec][key]=bad;
      const input=root.querySelector('#v2-import-settings'),status=root.querySelector('#v2-status');
      const file=new w.File([JSON.stringify({format:'investment-calculator-v2c',app:cand})],'backup.json',{type:'application/json'});
      Object.defineProperty(input,'files',{value:[file],configurable:true});status.textContent='';
      input.dispatchEvent(new w.Event('change',{bubbles:true}));
      await waitFor(()=>status.textContent!=='',{window:w,timeoutMs:5000});
      await new Promise(r=>w.setTimeout(r,300));
      const stored=JSON.parse(w.localStorage.getItem('investment-calculator-v2c')).scenarios[0][sec][key];
      console.log(JSON.stringify({field:dotted,entered:bad,defaultBefore:before,status:status.textContent.slice(0,120),storedAfterRestore:stored}));
    }finally{w.close();}
  }
})().catch(e=>{console.error(e);process.exit(1)});

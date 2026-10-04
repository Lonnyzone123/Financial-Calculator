/* S5AA R52 prediction: which boolean toggle of expansion:s5aa-r19-ira-contribution-conversion-same-year gives an early Roth IRA draw inside the exposed conversion's five years (the corpus-configured-paths variant the test-exposure run flagged). Usage: node r52_r19_toggle_probe.js [<tree>] */
const path=require('path'),fs=require('fs');const ROOT=require('path').resolve(process.argv[2]||'.');
const SHELL=fs.readFileSync(path.join(ROOT,'src','app-shell.html'),'utf8');global.RULES=JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap=require(path.join(ROOT,'tools','capture-baseline.js'));cap.installDebtModules();
const {loadEngineVariant}=require(path.join(ROOT,'tests','lib','engine-variant.js'));const M=require(path.join(ROOT,'audit/S5AA/R52/prediction/r52_mirror.js'));
const T=M.fresh({});globalThis.__R52=T;const V=M.makeVariant(loadEngineVariant,'__R52');
const e=cap.corpusWithDiagnostics({composition:'expanded'}).entries.find(x=>x.name==='expansion:s5aa-r19-ira-contribution-conversion-same-year');
const p=e.plan;const flags=[];for(const sec of ['advanced','retirement','profile','assumptions'])for(const k of Object.keys(p[sec]||{}))if(typeof p[sec][k]==='boolean')flags.push([sec,k]);
p.accounts.forEach((a,i)=>Object.keys(a).forEach(k=>{if(typeof a[k]==='boolean')flags.push(['accounts.'+i,k])}));
for(const [sec,k] of flags){const q=JSON.parse(JSON.stringify(p));const o=sec.startsWith('accounts.')?q.accounts[+sec.split('.')[1]]:q[sec];o[k]=!o[k];M.fresh(T);T.on=true;try{V.runPlan(q)}finally{T.on=false}const x=M.exposures(T);if(x.conv.some(c=>c.laterEarlyRothDraws))console.log(sec+'.'+k,'->',!p[sec.startsWith('accounts')?'x':sec]?.[k],JSON.stringify(x.conv))}
console.log('flags',flags.length);

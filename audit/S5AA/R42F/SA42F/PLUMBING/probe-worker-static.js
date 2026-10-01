// Static check: every top-level engine function/var referenced (transitively) from the Worker's function list is shipped.
'use strict';
const fs=require('fs'),path=require('path');
const T=require('path').join(__dirname, '..', '..', '..', '..', '..');
const src=fs.readFileSync(path.join(T,'src/engine.js'),'utf8');
const shell=fs.readFileSync(path.join(T,'src/app-shell.html'),'utf8');
const list=shell.match(/var workerFunctions=\[([^\]]*)\]/)[1].split(',').map(s=>s.trim());
const injected=['RULES','ACCOUNT_TYPES','HIST_RETURNS','HIST_INFLATION','HIST_COLA','ENGINE_VERSION','SCENARIO_SCHEMA_VERSION','RESULT_SCHEMA_VERSION','SURPLUS_SOURCES','WITHDRAWAL_STRATEGIES','BOOLEAN_FLAG_CONTRACT'];
// split engine into top-level declarations
const re=/^(function ([A-Za-z0-9_$]+)\s*\(|var ([A-Za-z0-9_$]+)\s*=)/gm;let m,decl=[];
while((m=re.exec(src)))decl.push({name:m[2]||m[3],kind:m[2]?'function':'var',start:m.index});
decl.forEach((d,i)=>d.body=src.slice(d.start,i+1<decl.length?decl[i+1].start:src.length));
const byName={};decl.forEach(d=>{byName[d.name]=d});
const names=Object.keys(byName);
const shipped=new Set(list.concat(injected));
const missingInList=list.filter(n=>!byName[n]);
console.log('listed but not engine top-level:',missingInList.join(',')||'none');
// transitive references from listed functions
const seen=new Set(),queue=[...list];const problems=[];
while(queue.length){const n=queue.shift();if(seen.has(n))continue;seen.add(n);const d=byName[n];if(!d)continue;
  const body=d.body.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  for(const other of names){if(other===n)continue;const w=new RegExp('(^|[^A-Za-z0-9_$.])'+other.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^A-Za-z0-9_$]|$)');if(w.test(body)){if(!shipped.has(other))problems.push(n+' -> '+other+' ('+byName[other].kind+')');queue.push(other);}}}
console.log('references to unshipped top-level names:');problems.forEach(p=>console.log('  '+p));
console.log('engine top-level functions not listed:',names.filter(n=>byName[n].kind==='function'&&!shipped.has(n)).join(','));

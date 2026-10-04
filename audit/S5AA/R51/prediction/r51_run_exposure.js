// S5AA R51: the test-exposure runner. Usage: node r51_run_exposure.js <tree> <hook> <out.jsonl> <log>
// Runs every test file of package.json's test:list (ported tests included) in batches with the R51 exposure hook, in the tree given.
const {spawnSync}=require('child_process'),fs=require('fs'),path=require('path');
const TREE=path.resolve(process.argv[2]),HOOK=path.resolve(process.argv[3]),OUT=path.resolve(process.argv[4]),LOG=path.resolve(process.argv[5]);
const pkg=JSON.parse(fs.readFileSync(path.join(TREE,'package.json'),'utf8'));
let files=pkg.scripts['test:list'].replace(/^node --test /,'').split(/\s+/).filter(Boolean);
files=files.flatMap(f=>f.includes('*')?fs.readdirSync(path.join(TREE,'tests','ported')).filter(x=>x.endsWith('.test.js')).map(x=>'tests/ported/'+x):[f]);
fs.writeFileSync(OUT,'');fs.writeFileSync(LOG,'');
const B=12;let fails=0;
for(let i=0;i<files.length;i+=B){const batch=files.slice(i,i+B);
 const r=spawnSync(process.execPath,['--test','--test-concurrency=3','--test-reporter=tap',...batch],{cwd:TREE,env:Object.assign({},process.env,{NODE_OPTIONS:'--require '+HOOK,R51_EXPOSURE_OUT:OUT,R51_TREE:TREE}),encoding:'utf8',maxBuffer:1<<28});
 const tail=(r.stdout||'').split('\n').filter(l=>/^# (tests|pass|fail|todo|skip)/.test(l)||/^not ok/.test(l)).join(' | ');
 fs.appendFileSync(LOG,'batch '+(i/B)+' exit '+r.status+' :: '+batch.join(' ')+'\n   '+tail+'\n');if(r.status!==0)fails++;}
fs.appendFileSync(LOG,'DONE files '+files.length+' failing batches '+fails+'\n');

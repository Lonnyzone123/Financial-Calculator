// S5AA R53: runs r53_endage_neutrality_hook.js over the test files the exposure run named for endBeforeRetire (runPlan/simulatePlan),
// on the given base tree. Usage: node r53_run_neutrality.js <base tree> <exposure.jsonl> <out.jsonl> <log>
const {spawnSync}=require('child_process'),fs=require('fs'),path=require('path');
const TREE=path.resolve(process.argv[2]),EXP=path.resolve(process.argv[3]),OUT=path.resolve(process.argv[4]),LOG=path.resolve(process.argv[5]);
const L=fs.readFileSync(EXP,'utf8').trim().split('\n').map(JSON.parse);
const files=[...new Set(L.filter(r=>r.endBeforeRetire&&r.fn!=='validateScenario').map(r=>'tests/'+r.file))].sort();
fs.writeFileSync(OUT,'');
const r=spawnSync(process.execPath,['--test','--test-concurrency=3','--test-reporter=tap',...files],{cwd:TREE,env:Object.assign({},process.env,{NODE_OPTIONS:'--require '+path.join(__dirname,'r53_endage_neutrality_hook.js'),R53_NEUTRAL_OUT:OUT,R53_TREE:TREE}),encoding:'utf8',maxBuffer:1<<28});
fs.writeFileSync(LOG,'files '+files.length+': '+files.join(' ')+'\nexit '+r.status+'\n'+(r.stdout||'').split('\n').filter(l=>/^# (tests|pass|fail)/.test(l)||/^not ok/.test(l)).join('\n')+'\n'+(r.stderr||'').slice(0,2000));

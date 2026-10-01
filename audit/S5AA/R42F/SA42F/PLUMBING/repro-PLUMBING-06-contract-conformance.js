// PLUMBING-06: (a) the SCENARIO_UNKNOWN_METHOD refusal carries the rejected value as `mode`, which the repository's own
// checker (tools/result-contract.js) reports as an S-EXACT-KEYS violation; (b) RESULT_CONTRACT.md 7b says S5AA added no
// calculation error code, but S5AA codes exist that no markdown document names. Run with node.
'use strict';
const h=require('../harness.js');const E=h.engine;const fs=require('fs'),path=require('path');
const {checkResult}=require(path.join(h.TREE,'tools/result-contract.js'));
for(const m of ['montecarlo','Monte Carlo']){const p=structuredClone(h.defaults);p.setupComplete=true;p.assumptions.method=m;const r=E.runPlan(p);
 console.log('(a) method '+JSON.stringify(m)+': '+r.status+' '+r.calculationErrorCode+' mode='+JSON.stringify(r.mode)+' -> checker: '+checkResult(r,{plan:p}).violations.map(v=>v.rule+'@'+v.path+' '+v.message).join('; '));}
const contract=fs.readFileSync(path.join(h.TREE,'RESULT_CONTRACT.md'),'utf8');
const claim=contract.split('\n').find(l=>l.includes('no calculation error code was added'));console.log('\n(b) RESULT_CONTRACT.md 7b: '+claim.slice(0,110));
const mds=[];(function walk(d){for(const f of fs.readdirSync(d,{withFileTypes:true})){if(f.name==='node_modules'||f.name==='.git')continue;const q=path.join(d,f.name);if(f.isDirectory())walk(q);else if(f.name.endsWith('.md'))mds.push(fs.readFileSync(q,'utf8'));}})(h.TREE);
const all=mds.join('\n');
const probes=[['SCENARIO_UNKNOWN_METHOD',p=>{p.assumptions.method='x'}],['SCENARIO_INVALID_RUN_COUNT',p=>{p.assumptions.method='monteCarlo';p.assumptions.runs=0}],
 ['SCENARIO_MISSING_SCENARIO_SECTION',p=>{delete p.retirement}],['SCENARIO_NOBODY_ALIVE_AT_START',p=>{p.retirement.selfLife=10}],
 ['SCENARIO_UNRECOGNIZED_INCOME_OWNER',p=>{p.retirement.otherIncomes=[{name:'x',type:'pension',owner:null,amount:1,start:30,end:40,growth:0,growthMode:'fixed'}]}]];
for(const [code,f] of probes){const p=structuredClone(h.defaults);p.setupComplete=true;f(p);const r=E.runPlan(p);
 console.log('    '+code.padEnd(36)+' produced: '+(r.calculationErrorCode===code)+'   named in RESULT_CONTRACT.md: '+contract.includes(code)+'   named in any .md of the tree: '+all.includes(code));}
console.log('    MONTE_CARLO_INVARIANT_FAILURE (task 1.2, Q101)  named in any .md of the tree: '+all.includes('MONTE_CARLO_INVARIANT_FAILURE'));

// PLUMBING-04: Monte Carlo path i is seeded rng(seed + 2i) (market) and rng(seed + 2i + 1) (care), so seed s+2 replays
// seed s's paths 1..N-1 plus one new path: two "different" seeds share all but one path. Run with node.
'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
function mc(seed,runs){const p=basePlan({age:60,endAge:90,spending:60000,returnRate:6,inflation:2.5,accounts:[account('brok','taxable',600000,{basisPct:70}),account('ira','traditionalIRA',500000)]});
  Object.assign(p.assumptions,{method:'monteCarlo',runs,seed,volatility:15});p.advanced.assetsOn=false;Object.assign(p.advanced,{ltcOn:true,ltcCost:80000,ltcProbability:40,ltcYears:2,ltcInsurance:0,healthInflation:4});return p;}
const v=h.validateScenario(structuredClone(mc(42,1000)));
const a=E.runPlan(mc(42,1000)),b=E.runPlan(mc(44,1000)),c=E.runPlan(mc(44,999)),d=E.runPlan(mc(43,1000)),e=E.runPlan(mc(1042,1000));
const p0=E.simulatePlan(mc(42,1),E.rng(42),0,E.rng(43),[]);
const succ=(r,n)=>Math.round(r.successRate*n/100);
console.log('valid',v.valid,'statuses',[a,b,c,d,e].map(r=>r.status).join(','));
console.log('success rate  seed 42: '+a.successRate.toFixed(1)+'%   seed 44: '+b.successRate.toFixed(1)+'%   seed 43: '+d.successRate.toFixed(1)+'%   seed 1042: '+e.successRate.toFixed(1)+'%');
console.log('funded paths: seed 42 (1000 runs) = '+succ(a,1000)+'; seed 42 path 0 funded = '+!p0.failed+'; seed 44 (999 runs) = '+succ(c,999)+
  '  -> seed 44 runs 0..998 are exactly seed 42 runs 1..999: '+(succ(a,1000)-(p0.failed?0:1)===succ(c,999)));
const s44p0=E.simulatePlan(mc(44,1),E.rng(44),0,E.rng(45),[]),s42p1=E.simulatePlan(mc(42,1),E.rng(42+2),0,E.rng(42+3),[]);
console.log('seed 44 path 0 rows identical to seed 42 path 1 rows: '+(JSON.stringify(s44p0.rows)===JSON.stringify(s42p1.rows)));
let same=0;for(let y=0;y<a.rows.length;y++)if(Math.abs(a.rows[y].total-b.rows[y].total)/Math.max(1,a.rows[y].total)<0.01)same++;
console.log('median-total rows within 1% between seed 42 and seed 44: '+same+' of '+a.rows.length);

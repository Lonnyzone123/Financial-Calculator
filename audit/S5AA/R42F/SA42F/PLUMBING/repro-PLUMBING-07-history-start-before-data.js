// PLUMBING-07: MODEL_ASSUMPTIONS 26 says "A historical start must be a data year", and R37 refuses a start AFTER the data
// (SCENARIO_HISTORY_START_AFTER_DATA / validator OUT_OF_RANGE). A start BEFORE the data, or between data years, is accepted
// by both and silently replaced: historyIndex() takes the first data year >= the entered one. Run with node.
'use strict';
const h=require('../harness.js');const {account,basePlan}=h.grid;const E=h.engine;
const HR=E.HIST_RETURNS;
function mk(y){const p=basePlan({age:60,endAge:63,spending:0,accounts:[account('cash','taxable',100000,{basisPct:100})]});p.assumptions.method='historical';p.assumptions.historyStart=y;p.advanced.assetsOn=false;return p;}
const ret=y=>HR.find(x=>x[0]===y)[1];
for(const y of [1900,1927,1928,1966.5,1967,2026]){const p=mk(y),v=h.validateScenario(structuredClone(p)),r=E.runPlan(structuredClone(p));
 console.log('historyStart '+String(y).padEnd(7)+' validator valid '+String(v.valid).padEnd(5)+' '+v.issues.filter(i=>/history/.test(i.path||'')).map(i=>i.severity+' '+i.code).join(',').padEnd(18)+'| runPlan '+r.status+' '+(r.calculationErrorCode||'').padEnd(34)+(r.rows?'row 61 total '+r.rows[1].total.toFixed(2):''));}
console.log('hand: 1928 first-year return '+ret(1928)+' -> 100,000 x 1.4381 = '+(100000*(1+ret(1928))).toFixed(2)+'; 1967 return '+ret(1967)+' -> '+(100000*(1+ret(1967))).toFixed(2)+'; 1900 and 1927 have no data (the series starts in '+HR[0][0]+'), 1966.5 is not a data year');

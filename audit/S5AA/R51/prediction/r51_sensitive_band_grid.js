// S5AA R51: the sensitive-band rule (tests/monte-carlo-sensitive-band.test.js) re-applied: success along the 5% spending grid of the golden Monte Carlo plan. Run inside a tree. Usage: node r51_sensitive_band_grid.js [steps]
const fs=require('fs'),path=require('path');const SHELL=fs.readFileSync('src/app-shell.html','utf8');global.RULES=JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.resolve('tools/capture-baseline.js')).installDebtModules();const engine=require(path.resolve('src/engine.js'));const golden=require(path.resolve('tests/lib/golden-scenario-defs.js'));
const D=golden.extractDefaultPlan(SHELL);const def=golden.GOLDEN_SCENARIOS.find(([n])=>n==='monte-carlo-fixed-seed');const g=golden.buildScenario(D,def[1]||{});
console.log('flexibility',g.retirement.flexibility,'golden',engine.runPlan(JSON.parse(JSON.stringify(g))).successRate);
for(const step of (process.argv[2]||'10,11,12,13,14,15').split(',').map(Number)){const p=JSON.parse(JSON.stringify(g));p.retirement.spending=Math.round(g.retirement.spending*(1+0.05*step)*100)/100;console.log('step',step,engine.runPlan(p).successRate)}

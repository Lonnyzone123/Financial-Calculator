/* S5AA R51 addendum, C1 after the build. Run on the tree AFTER the addendum's edits.   Usage: node r51b_c1_check.js [<tree>]
   (a) The Roth weight: at every smartWithdrawalOrder() call of every corpus plan (both compositions, every Monte Carlo path) the engine's
       rothNextDollarWeight() equals the scan's rule (r51b_mirror.js NEXT) on the same arguments.
   (b) The working-years pay: in every working row of every corpus plan the engine's pay equals the scan's formula recomputed from the
       row's own parts -- the salary's (workShare x (wages - contributions - baseline) - the working debt service) plus the streams'
       working pay less S x share, S = the wage-only return with the streams added less the wage-only return. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const { loadEngineVariant } = require(path.join(ROOT, 'tests', 'lib', 'engine-variant.js'));
const { NEXT } = require('./r51b_mirror.js');
const T = { on: false, roth: [], work: [] };
globalThis.__R51D = T;
const V = loadEngineVariant([
  { id: 'roth', marker: 'scores.roth+=rothNextDollarWeight(p,age,accounts,rothLedger,priorReturn);', replace:
    'var __e=rothNextDollarWeight(p,age,accounts,rothLedger,priorReturn);if(globalThis.__R51D&&globalThis.__R51D.on)globalThis.__R51D.roth.push({engine:__e,scan:(' + NEXT + ')(p,age,accounts,rothLedger,priorReturn),age:age});scores.roth+=__e;' },
  { id: 'work', marker: 'if(wages>0||costRetiredDuration<duration-1e-12)noteWorkingYearsShortfall(issues,age,-workingPay);', append:
    'globalThis.__R51D&&globalThis.__R51D.on&&(function(){var s=workShare*(wages-contributions-baseline.total)-debtFlow.workingService;if(workStreamRow>0&&workStreamPay>0){var t2=estimateTaxes(p,age,Math.max(0,wages+workStreamRow-preTaxDeferrals),0,0,payrollWages,0,payrollSpouseWages,other.seSelf,other.seSpouse,void 0,void 0,duration,void 0,qbiCut);s+=workStreamPay-(t2.total-baseline.total)*(workStreamPay/workStreamRow)}globalThis.__R51D.work.push({engine:workingPay,scan:s,age:age,streams:workStreamRow>0})})();' },
]);
let calls = 0, rothBad = [], rows = 0, streamRows = 0, workBad = [];
for (const comp of ['control', 'expanded']) {
  for (const e of cap.corpusWithDiagnostics({ composition: comp }).entries) {
    T.on = true; T.roth = []; T.work = [];
    let rv;
    try { rv = V.runPlan(JSON.parse(JSON.stringify(e.plan))); } finally { T.on = false; }
    const r = E.runPlan(JSON.parse(JSON.stringify(e.plan)));
    if (JSON.stringify(rv.rows) !== JSON.stringify(r.rows)) throw new Error(e.name + ': taps not output-neutral');
    T.roth.forEach((x) => { calls++; if (x.engine !== x.scan) rothBad.push(comp + ' ' + e.name + ' @' + x.age + ': ' + x.engine + ' vs ' + x.scan); });
    T.work.forEach((x) => { rows++; if (x.streams) streamRows++; if (Math.abs(x.engine - x.scan) > 1e-6 * Math.max(1, Math.abs(x.engine))) workBad.push(comp + ' ' + e.name + ' @' + x.age); });
  }
}
console.log('(a) Roth weight: ' + calls + ' smartWithdrawalOrder() calls over both compositions (every path): ' + (rothBad.length ? 'DIFFER ' + rothBad.slice(0, 5).join('; ') : 'the engine equals the scan at every call'));
console.log('(b) working-years pay: ' + rows + ' working-check rows (' + streamRows + ' with a stream): ' + (workBad.length ? 'DIFFER ' + workBad.slice(0, 5).join('; ') : 'the engine equals the scan in every row'));

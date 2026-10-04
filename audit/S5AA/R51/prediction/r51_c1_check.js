/* S5AA R51, C1 after the build. Run on the tree AFTER the R51 edits.   Usage: node r51_c1_check.js [<tree>]
   (a) The scan's R51 health (r51_mirror.js healthPair(...).neu, computed from the row's tapped state) equals the engine's own `health`
       in every row of every corpus plan (both compositions, every Monte Carlo path).
   (b) The validator's IRMAA_PRIOR_INCOME_BLANK equals the engine's IRMAA_PRE_PLAN_MAGI_ASSUMED (with either prior income blank) on the
       generated scenarios the tests draw and both corpus compositions.
   (c) The working-years issue: on every corpus plan, the engine's issue (age and shortfall) is the first working row where the tapped
       R51 pay is below zero. (The prediction found no corpus plan whose first shortfall moves; the measured capture checks that.) */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const { generateScenarios } = require(path.join(ROOT, 'tests', 'lib', 'scenario-generator.js'));
const { loadEngineVariant } = require(path.join(ROOT, 'tests', 'lib', 'engine-variant.js'));
const M = require('./r51_mirror.js');
const LB = 'RULES.medicare.irmaa.lookbackYears';
const T = { on: false, path: -1, health: [], work: [] };
globalThis.__R51C = T;
const V = loadEngineVariant([
  { id: 'path', marker: 'function simulatePlanRows(p,random,historyOffset,ltcRandom,issues,serialized,gateToken){', append: 'globalThis.__R51C&&globalThis.__R51C.on&&globalThis.__R51C.path++;' },
  { id: 'health', marker: 'health+=medicareChargePerPerson(p,medLook,medLookFiling,yearProgress)*medIdleYears/* S5AA R48; R51 */}}', append:
    ';globalThis.__R51C&&globalThis.__R51C.on&&globalThis.__R51C.health.push({path:globalThis.__R51C.path,age:age,rowAge:rowAge,duration:duration,spouseAge:spouseAge,crd:costRetiredDuration,hd:healthDuration,ws:workSpan.spouse,ages:householdSeniorAges(p,age),health:health,' +
    'cost:p.advanced.healthCost*Math.pow(1+p.advanced.healthInflation/100,yearProgress),charge:medicareChargePerPerson(p,magiHistory.length>=' + LB + '?magiHistory[magiHistory.length-' + LB + ']:0,filingHistory.length>=' + LB + '?filingHistory[filingHistory.length-' + LB + ']:householdFilingFor(p,age),yearProgress)});' },
  { id: 'work', marker: 'if(wages>0||costRetiredDuration<duration-1e-12)noteWorkingYearsShortfall(issues,age,-workingPay);', append:
    'globalThis.__R51C&&globalThis.__R51C.on&&globalThis.__R51C.work.push({path:globalThis.__R51C.path,age:age,ran:wages>0||costRetiredDuration<duration-1e-12,pay:workingPay});' },
]);
const health = { plans: 0, rows: 0, bad: [] }, work = { plans: 0, bad: [] };
function checkPlan(name, p) {
  T.on = true; T.path = -1; T.health = []; T.work = [];
  let rv;
  try { rv = V.runPlan(JSON.parse(JSON.stringify(p))); } finally { T.on = false; }
  const r = E.runPlan(JSON.parse(JSON.stringify(p)));
  if (JSON.stringify(rv.rows) !== JSON.stringify(r.rows)) throw new Error(name + ': taps not output-neutral');
  if (p.advanced && p.advanced.healthOn) {
    health.plans++;
    T.health.forEach((h) => { health.rows++; const v = M.healthPair(E, p, h); if (Math.abs(v.neu - h.health) > 1e-6 * Math.max(1, Math.abs(h.health))) health.bad.push(name + ' @' + h.age + ' path ' + h.path + ': scan ' + v.neu + ' engine ' + h.health); });
  }
  work.plans++;
  const w0 = T.work.filter((w) => w.path === 0), first = w0.find((w) => w.ran && w.pay < -0.005), issue = (r.issues || []).find((i) => i.code === 'WORKING_YEARS_NOT_FUNDED_BY_PAY');
  if (!!first !== !!issue || (issue && (issue.state.age !== first.age || Math.abs(issue.state.shortfall + first.pay) > 1e-6))) work.bad.push(name);
}
const corpus = [].concat(...['control', 'expanded'].map((c) => cap.corpusWithDiagnostics({ composition: c }).entries.map((e) => [c + ' ' + e.name, e.plan])));
corpus.forEach(([n, p]) => checkPlan(n, p));
console.log('(a) health: ' + health.plans + ' corpus plans with health on, ' + health.rows + ' rows (all paths): ' + (health.bad.length ? 'DIFFER ' + health.bad.slice(0, 5).join('; ') : 'the scan equals the engine in every row'));
console.log('(c) working-years issue: ' + work.plans + ' corpus plans: ' + (work.bad.length ? 'DIFFER ' + work.bad.join(', ') : 'the engine\'s issue equals the first tapped row with R51 pay below zero on every plan'));
const blank = (v) => v === undefined || v === null;
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
const sets = [['generated 1-120', generateScenarios(defaultPlan, { count: 120, startSeed: 1 }).map((x) => ['seed ' + x.seed, x.plan])],
  ['generated 500-579', generateScenarios(defaultPlan, { count: 80, startSeed: 500 }).map((x) => ['seed ' + x.seed, x.plan])], ['corpus', corpus]];
for (const [label, plans] of sets) {
  let n = 0, warned = 0; const bad = [];
  plans.forEach(([name, p]) => {
    let v; try { v = validateScenario(JSON.parse(JSON.stringify(p))).issues.some((i) => i.code === 'IRMAA_PRIOR_INCOME_BLANK'); } catch (e) { return; }
    const r = E.runPlan(JSON.parse(JSON.stringify(p)));
    if (r.status !== 'ok') return;
    const e = (r.issues || []).some((i) => i.code === 'IRMAA_PRE_PLAN_MAGI_ASSUMED') && p.advanced && (blank(p.advanced.irmaaMagiTwoYearsBefore) || blank(p.advanced.irmaaMagiOneYearBefore));
    n++; if (v) warned++;
    if (v !== e) bad.push(name + ' (validator ' + v + ', engine ' + e + ')');
  });
  console.log('(b) ' + label + ': ' + n + ' plans run; validator warns on ' + warned + '; ' + (bad.length ? 'DISAGREE ' + bad.join('; ') : 'agrees with the engine on all'));
}

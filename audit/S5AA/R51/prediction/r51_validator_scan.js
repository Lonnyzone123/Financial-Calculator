/* S5AA R51 prediction: the validator's IRMAA_PRIOR_INCOME_BLANK (R48's mirror of the engine's IRMAA first-years disclosure) under the
   one Medicare date. Run on a tree BEFORE the R51 edits.   Usage: node r51_validator_scan.js [<source tree>]
   The mirror is held to the engine's condition (R48's C1 check), so its R51 value is predicted as the engine's R51 condition
   (r51_mirror.js irmaaFirstYears(..., true), on the engine's own helpers); today's warning is read from the validator itself and checked
   against the engine's today condition. Plans: the generated scenarios the tests draw (scenario-generator.test.js: seeds 1-120 and
   500-579; scenario-validator-no-false-positives draws from the same generator) and both corpus compositions. */
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
const M = require('./r51_mirror.js');
const defaultPlan = eval('(' + SHELL.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
const blank = (v) => v === undefined || v === null;
function look(name, p, out) {
  let warned;
  try { warned = validateScenario(JSON.parse(JSON.stringify(p))).issues.some((i) => i.code === 'IRMAA_PRIOR_INCOME_BLANK'); } catch (e) { return; }
  let oldE, newE;
  try { oldE = M.irmaaFirstYears(E, p, false); newE = M.irmaaFirstYears(E, p, true); } catch (e) { return; }
  const either = p.advanced && (blank(p.advanced.irmaaMagiTwoYearsBefore) || blank(p.advanced.irmaaMagiOneYearBefore));
  out.total++;
  if (warned) out.warnedToday.push(name);
  if (warned !== (oldE && !!either)) out.disagree.push(name + ' (validator ' + warned + ', engine condition ' + oldE + ')');
  if ((oldE && either) !== (newE && either)) out.moves.push(name + ': ' + (newE ? 'gained' : 'removed'));
}
const sets = [
  ['generated 1-120', generateScenarios(defaultPlan, { count: 120, startSeed: 1 }).map((x) => ['seed ' + x.seed, x.plan])],
  ['generated 500-579', generateScenarios(defaultPlan, { count: 80, startSeed: 500 }).map((x) => ['seed ' + x.seed, x.plan])],
  ['corpus control', cap.corpusWithDiagnostics({ composition: 'control' }).entries.map((e) => [e.name, e.plan])],
  ['corpus expanded', cap.corpusWithDiagnostics({ composition: 'expanded' }).entries.map((e) => [e.name, e.plan])],
];
for (const [label, plans] of sets) {
  const out = { total: 0, warnedToday: [], disagree: [], moves: [] };
  plans.forEach(([n, p]) => look(n, p, out));
  console.log('== ' + label + ': ' + out.total + ' plans; warned today ' + out.warnedToday.length + ' (' + out.warnedToday.join(', ') + ')');
  console.log('   today, validator against the engine condition: ' + (out.disagree.length ? 'DISAGREE ' + out.disagree.join('; ') : 'agree on all'));
  console.log('   R51 moves: ' + (out.moves.length ? out.moves.join('; ') : 'none'));
}

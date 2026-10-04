/* S5AA R51 (a copy of audit/S5AA/R48/prediction/r48_declare_control.js; only this header, the usage, the
   refusal guard and the `changes` entry's text differ):
   control 4.7's declarations for this round. Compares the stored control capture with a live capture of this tree and
   reports the differences tools/control-candidate-prediction.json does not declare (and declarations not found). With --write it
   removes the declarations no longer found and adds the new differences, under one "changes" entry naming this round. Run inside
   the worktree. Both halves matter: 4.7 fails a declared-and-not-found difference exactly as hard as an undeclared one.
   R51 lesson (SA51-A): 4.7 first refuses a comparison across different corpus inputs (harness.refusalsFor(), the test's own first
   check); declaring differences across such a refusal is meaningless, so this copy stops there. R51's decision 1 moves the control
   inputs, so it stops until a successor control capture is in place.
   Usage: node audit/S5AA/R51/prediction/r51_declare_control.js [--write] */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
process.chdir(ROOT);
const shell = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const baseline = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
baseline.installDebtModules();
const harness = require(path.join(ROOT, 'tools', 'differential-harness.js'));
const CONTROL = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'control-corpus.json'), 'utf8'));
const stored = JSON.parse(fs.readFileSync(path.join(ROOT, CONTROL.controlCapture.file), 'utf8'));
const live = baseline.capture();
const refusals = harness.refusalsFor(stored, live);
if (refusals.length) { console.log('REFUSED -- the stored control capture and this tree ran different corpus inputs; nothing declared: ' + refusals.join(' | ')); process.exit(1); }
const differences = harness.compareSnapshots(stored, live).differences;
const predictionPath = path.join(ROOT, 'tools', 'control-candidate-prediction.json');
const prediction = JSON.parse(fs.readFileSync(predictionPath, 'utf8'));
const match = harness.matchPrediction(differences, prediction);
const scenarios = [...new Set(match.unpredicted.concat(match.unmatched).map((d) => d.scenario))].sort();
const byScenario = {};
match.unpredicted.forEach((d) => { byScenario[d.scenario] = (byScenario[d.scenario] || 0) + 1; });
console.log('found       :', match.found);
console.log('undeclared  :', match.unpredicted.length);
console.log('notFound    :', match.unmatched.length);
console.log('scenarios   :', scenarios.length, JSON.stringify(scenarios));
console.log('undeclared by scenario:', JSON.stringify(byScenario));
const paths = {};
match.unpredicted.forEach((d) => { const k = d.scenario + ' ' + d.path.replace(/\[\d+\]/g, '[]'); paths[k] = (paths[k] || 0) + 1; });
console.log('undeclared fields:', Object.keys(paths).length);
Object.keys(paths).sort().forEach((k) => console.log('  ' + k + ' x' + paths[k]));
if (process.argv[2] === '--write') {
  const key = (d) => [d.scenario, d.kind, d.path].join('|');
  const drop = new Set(match.unmatched.map(key));
  const replaced = match.unpredicted.filter((d) => drop.has(key(d))).length;
  /* replaced in place (same scenario, kind and path: the value moved), so the file's order holds; the rest removed or appended */
  /* matchPrediction() hangs the old declaration on a moved difference as `declared`; it is not part of a declaration */
  match.unpredicted = match.unpredicted.map((d) => { const c = Object.assign({}, d); delete c.declared; return c; });
  const fresh = new Map(match.unpredicted.map((d) => [key(d), d]));
  const used = new Set();
  prediction.differences = prediction.differences.map((d) => { const k = key(d); if (drop.has(k) && fresh.has(k)) { used.add(k); return fresh.get(k); } return d; })
    .filter((d) => !(drop.has(key(d)) && !used.has(key(d))))
    .concat(match.unpredicted.filter((d) => !used.has(key(d))));
  prediction.changes = (prediction.changes || []).concat([{
    change: 'S5AA R51 (decisions of the owner, 2026-10-03, on R46-R50): spending flexibility defaults to off (defaultPlan.retirement.flexibility 10 -> 0, AA1-25(c)); the Medicare charge of each person starts at their own medicareStartAge() (one Medicare date); employment and self-employment streams count as pay in the working-years check',
    why: 'predicted by audit/S5AA/R51/S5AA_R51_PREDICTION_RECORD_20261003.md (d663f16); measured in audit/S5AA/R51/S5AA_R51_BUILD_REPORT_20261003.md',
    differences: match.unpredicted.length,
    replacedDeclarations: replaced,
  }]);
  fs.writeFileSync(predictionPath, JSON.stringify(prediction, null, 2) + '\n');
  console.log('written: ' + match.unpredicted.length + ' added, ' + match.unmatched.length + ' removed (' + replaced + ' replaced in place)');
}

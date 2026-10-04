/* S5AA R48: control 4.7's declarations for this round. Compares the stored control capture with a live capture of this tree and
   reports the differences tools/control-candidate-prediction.json does not declare (and declarations not found). With --write it
   removes the declarations no longer found and adds the new differences, under one "changes" entry naming this round. Run inside
   the worktree. Both halves matter: 4.7 fails a declared-and-not-found difference exactly as hard as an undeclared one.
   Usage: node audit/S5AA/R48/prediction/r48_declare_control.js [--write] */
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
    change: 'S5AA R48 (the owner\'s AA1 decisions of 2026-10-03): the Medicare charge grows from 2026 at the Medicare growth rate, else healthcare inflation (AA1-23); Arizona subtracts the federal senior deduction (A.R.S. 43-1022(35)) and the post-2011 gain share (43-1022(22)(c), absent 0%) (AA1-16); a survivor under 59 1/2 holds the deceased\'s IRAs as inherited (AA1-19); community-property basis (AA1-20)',
    why: 'predicted by audit/S5AA/R48/S5AA_R48_PREDICTION_RECORD_20261003.md (7fec79a); measured in audit/S5AA/R48/S5AA_R48_BUILD_REPORT_20261003.md',
    differences: match.unpredicted.length,
    replacedDeclarations: replaced,
  }]);
  fs.writeFileSync(predictionPath, JSON.stringify(prediction, null, 2) + '\n');
  console.log('written: ' + match.unpredicted.length + ' added, ' + match.unmatched.length + ' removed (' + replaced + ' replaced in place)');
}

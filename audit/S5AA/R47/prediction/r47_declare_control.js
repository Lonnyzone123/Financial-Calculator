/* S5AA R47: re-declare control test 4.7's differences after the R47 build, as R43/R44 did by hand.
   Usage (inside the worktree, src/ at the candidate): node audit/S5AA/R47/prediction/r47_declare_control.js [--write]
   Captures the control composition with today's engine, compares it with the stored control capture (tools/differential-harness.js,
   the comparison 4.7 itself runs), and lists, per scenario, the differences that are new, changed (same kind/scenario/path, new
   values) or gone against tools/control-candidate-prediction.json. With --write it replaces the declarations with the measured ones
   and appends one `changes` entry naming R47. The coordinator re-runs this after integrating the rounds in order: the declaration
   is cumulative against the stored capture, so each round's must be re-derived on the integrated engine. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const baseline = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
const harness = require(path.join(ROOT, 'tools', 'differential-harness.js'));
const CONTROL = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'control-corpus.json'), 'utf8'));
const PRED_FILE = path.join(ROOT, 'tools', 'control-candidate-prediction.json');
const pred = JSON.parse(fs.readFileSync(PRED_FILE, 'utf8'));
const stored = JSON.parse(fs.readFileSync(path.join(ROOT, CONTROL.controlCapture.file), 'utf8'));
const live = JSON.parse(JSON.stringify(baseline.capture()));
const refusals = harness.refusalsFor(stored, live);
if (refusals.length) throw new Error('refused: ' + refusals.join(' | '));
const found = harness.compareSnapshots(stored, live).differences;
const key = (d) => d.kind + '|' + d.scenario + '|' + d.path;
const declared = new Map(pred.differences.map((d) => [key(d), d]));
const foundMap = new Map(found.map((d) => [key(d), d]));
const added = [], changed = [], gone = [];
for (const [k, d] of foundMap) {
  const w = declared.get(k);
  if (!w) added.push(d);
  else if (JSON.stringify(w.reference) !== JSON.stringify(d.reference) || JSON.stringify(w.candidate) !== JSON.stringify(d.candidate)) changed.push(d);
}
for (const [k, d] of declared) if (!foundMap.has(k)) gone.push(d);
const byScenario = {};
for (const [tag, list] of [['new', added], ['changed', changed], ['gone', gone]]) list.forEach((d) => { (byScenario[d.scenario] = byScenario[d.scenario] || { new: 0, changed: 0, gone: 0 })[tag]++; });
console.log('found ' + found.length + ', declared ' + declared.size + '; new ' + added.length + ', changed ' + changed.length + ', gone ' + gone.length);
Object.keys(byScenario).sort().forEach((s) => console.log('  ' + s + ' ' + JSON.stringify(byScenario[s])));
if (process.argv.includes('--write')) {
  const order = new Map(pred.differences.map((d, i) => [key(d), i]));
  const next = found.slice().sort((a, b) => (order.has(key(a)) ? order.get(key(a)) : 1e9) - (order.has(key(b)) ? order.get(key(b)) : 1e9));
  pred.differences = next;
  pred.changes.push({
    change: 'S5AA R47 (the owner\'s AA1 decisions of 2026-10-03): the senior deduction ends after 2028 (AA1-30); the control plans with a person 65 or older in a tax year after 2028 and a positive deduction then pay more tax from that row on',
    why: 'predicted by audit/S5AA/R47/S5AA_R47_PREDICTION_RECORD_20261003.md (the 19 control senior movers); measured by audit/S5AA/R47/prediction/r47_declare_control.js',
    differences: added.length + changed.length,
    replacedDeclarations: changed.length + gone.length,
  });
  fs.writeFileSync(PRED_FILE, JSON.stringify(pred, null, 2) + '\n');
  console.log('wrote ' + PRED_FILE);
}

/* S5AA R50: what control test 4.7 finds, for the declaration the coordinator writes into tools/control-candidate-prediction.json at
   integration. Compares a capture of the control composition by the tree's engine against the stored control capture, exactly as
   4.7 does (tools/differential-harness.js compareSnapshots, then matchPrediction against the current declaration), and prints the
   differences 4.7 would call undeclared, grouped by scenario and kind.
   Usage: node audit/S5AA/R50/prediction/r50_control_differences.js [<tree>] */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const baseline = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
const harness = require(path.join(ROOT, 'tools', 'differential-harness.js'));
const CONTROL = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'control-corpus.json'), 'utf8'));
const stored = JSON.parse(fs.readFileSync(path.join(ROOT, CONTROL.controlCapture.file), 'utf8'));
const live = JSON.parse(JSON.stringify(baseline.capture()));
const prediction = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'control-candidate-prediction.json'), 'utf8'));
const found = harness.compareSnapshots(stored, live).differences;
const match = harness.matchPrediction(found, prediction);
const by = {};
for (const d of match.unpredicted) {
  const k = d.scenario + ' / ' + d.kind;
  by[k] = by[k] || { n: 0, paths: [] };
  by[k].n++;
  if (by[k].paths.length < 4) by[k].paths.push(d.path + ': ' + JSON.stringify(d.reference) + ' -> ' + JSON.stringify(d.candidate));
}
console.log('found ' + found.length + ' differences; declared ' + match.declared + '; undeclared ' + match.unpredicted.length + '; declared and not found ' + match.unmatched.length);
for (const k of Object.keys(by).sort()) console.log('  ' + k + ': ' + by[k].n + '\n      ' + by[k].paths.join('\n      '));
if (match.unmatched.length) console.log('declared and not found (first 5): ' + JSON.stringify(match.unmatched.slice(0, 5)));

/* S5AA R49: control 4.7's comparison in full (tests/control-corpus.test.js prints only the first five): today's control capture
   against the stored control capture, matched against tools/control-candidate-prediction.json, every undeclared difference and every
   declared difference not found, grouped by scenario and path. The declarations themselves are the coordinator's step.
   Usage: node audit/S5AA/R49/prediction/r49_control_47_differences.js */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const baseline = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
const harness = require(path.join(ROOT, 'tools', 'differential-harness.js'));
const CONTROL = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'control-corpus.json'), 'utf8'));
const stored = JSON.parse(fs.readFileSync(path.join(ROOT, CONTROL.controlCapture.file), 'utf8'));
const live = JSON.parse(JSON.stringify(baseline.capture()));
const prediction = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'control-candidate-prediction.json'), 'utf8'));
const m = harness.matchPrediction(harness.compareSnapshots(stored, live).differences, prediction);
const group = (list) => { const g = {}; list.forEach((d) => { const k = d.scenario + ' ' + d.kind + ' ' + String(d.path).replace(/\[\d+\]/g, '[]'); g[k] = (g[k] || 0) + 1; }); return g; };
console.log('ok ' + m.ok + '; problems ' + m.problems.length + '; undeclared ' + m.unpredicted.length + '; declared but not found ' + m.unmatched.length);
console.log('-- undeclared, by scenario, kind and path:');
Object.entries(group(m.unpredicted)).forEach(([k, n]) => console.log('  ' + k + ' x' + n));
console.log('-- declared but not found:');
Object.entries(group(m.unmatched)).forEach(([k, n]) => console.log('  ' + k + ' x' + n));
console.log('-- undeclared scenarios: ' + [...new Set(m.unpredicted.map((d) => d.scenario))].join(', '));

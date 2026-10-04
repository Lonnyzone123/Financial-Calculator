/* S5AA R45, C1 after the build: the prediction scan's newHousehold() against the engine's exported householdRetireAge() on every plan
   of both compositions. Usage: node audit/S5AA/R45/prediction/r45_c1_check.js */
'use strict';
const path = require('node:path'), fs = require('node:fs'), ROOT = path.resolve(__dirname, '..', '..', '..', '..');
global.RULES = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8').match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js')); cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const src = fs.readFileSync(path.join(__dirname, 'r45_corpus_scan.js'), 'utf8');
const newHousehold = new Function('fin', src.replace(/\r\n/g, '\n').match(/function newHousehold[\s\S]*?\n}\n/)[0] + 'return newHousehold;')((v) => Number.isFinite(Number(v)));
let n = 0, diff = 0;
for (const comp of ['control', 'expanded']) for (const e of cap.corpusWithDiagnostics({ composition: comp }).entries) {
  n++; const a = newHousehold(e.plan), b = E.householdRetireAge(e.plan);
  if (Math.abs(a - b) > 1e-9) { diff++; console.log('DIFFERS', comp, e.name, a, b); }
}
console.log('plans', n, 'differing', diff);

/* S5AA R44 (C8): the prediction says seed:4's rows after R44 equal the PRE-repair engine's rows for the same plan with the one-time
   transfer off. Usage: node audit/S5AA/R44/prediction/r44_seed4_check.js <pre-repair tree> <repaired tree> */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
function load(root) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  const SHELL = fs.readFileSync(path.join(root, 'src', 'app-shell.html'), 'utf8');
  global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
  const cap = require(path.join(root, 'tools', 'capture-baseline.js')); cap.installDebtModules();
  return { E: require(path.join(root, 'src', 'engine.js')), cap };
}
const [pre, post] = process.argv.slice(2).map((x) => path.resolve(x));
let X = load(pre);
const plan = X.cap.corpusWithDiagnostics({ composition: 'expanded' }).entries.find((e) => e.name === 'seed:4').plan;
const off = JSON.parse(JSON.stringify(plan)); off.advanced.transferOn = false;
const before = X.E.runPlan(JSON.parse(JSON.stringify(plan))), counterfactual = X.E.runPlan(off);
X = load(post);
const after = X.E.runPlan(JSON.parse(JSON.stringify(plan)));
const same = JSON.stringify(after.rows) === JSON.stringify(counterfactual.rows);
const firstDiff = after.rows.findIndex((r, k) => JSON.stringify(r) !== JSON.stringify(counterfactual.rows[k]));
console.log('seed:4 rows after R44 equal the pre-repair transfer-off rows: ' + same + (same ? '' : ' (first difference at row ' + firstDiff + ')'));
console.log('seed:4 rows after R44 equal its pre-repair rows: ' + (JSON.stringify(after.rows) === JSON.stringify(before.rows)));
console.log('lifetime taxes: before ' + before.lifetimeTaxes.toFixed(2) + ', after ' + after.lifetimeTaxes.toFixed(2) + ', difference ' + (after.lifetimeTaxes - before.lifetimeTaxes).toFixed(2));
console.log('limitWarnings after: ' + JSON.stringify(after.limitWarnings));

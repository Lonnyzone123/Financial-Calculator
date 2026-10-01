/* S5AA R44 prediction (C5): the direction for each plan r44_corpus_scan.js flags under R43-01b, from the PRE-repair engine.
   Usage: node audit/S5AA/R44/prediction/r44_direction.js [<source tree>]
   After R44, a one-time contribution into an HSA whose owner is 65 or over all row has $0 of room. The transfer's handling of an excess
   (transferRoom()) is: under the default limit policy the excess is not moved (the source keeps it) and a note records the asked amount and
   the room; under "warn" the whole amount moves and the note records the same. So the equivalent input, under the default policy, is the
   same plan with the transfer's amount set to the new room (here $0: transferOn false), which moves nothing; the repaired result also
   carries a note that the counterfactual does not. Under "warn" the rows cannot change; only the note's room does.
   For each plan: the limit policy, the pre-repair room the note shows (if any), and the direction of the headline figures. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const entries = cap.corpusWithDiagnostics({ composition: 'expanded' }).entries;
const d = (x, y) => (Math.abs(y - x) < 0.005 ? 'same' : (y > x ? 'rises ' : 'falls ') + Math.abs(y - x).toFixed(2));
for (const name of ['seed:4', 'seed:5', 'seed:13']) {
  const p = JSON.parse(JSON.stringify(entries.find((e) => e.name === name).plan));
  const A = E.runPlan(JSON.parse(JSON.stringify(p)));
  const notes = (A.issues || []).filter((i) => /TRANSFER|LIMIT|CONTRIBUTION/.test(i.code) && JSON.stringify(i).includes(p.advanced.transferTo)).map((i) => i.code + ' ' + JSON.stringify(i.state || {}).slice(0, 160));
  const q = JSON.parse(JSON.stringify(p)); q.advanced.transferOn = false;
  const B = E.runPlan(q);
  const last = (r) => r.rows[r.rows.length - 1], sum = (r, k) => r.rows.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const tRow = A.rows.findIndex((r, k) => k > 0 && A.rows[k - 1].age <= p.advanced.transferAge && p.advanced.transferAge < r.age);
  console.log(name + ' (' + p.assumptions.method + '): limitPolicy ' + JSON.stringify(p.limitPolicy) + ', transfer ' + p.advanced.transferAmount + ' from ' + p.advanced.transferFrom + ' to ' + p.advanced.transferTo + ' at ' + p.advanced.transferAge +
    '\n   pre-repair notes on the HSA: ' + (notes.join(' | ') || 'none') +
    '\n   row of the transfer (' + (tRow >= 0 ? A.rows[tRow].age : '?') + '): HSA ' + (tRow >= 0 ? d(A.rows[tRow].hsa, B.rows[tRow].hsa) : '?') +
    '\n   direction with no transfer (default policy): final HSA ' + d(last(A).hsa, last(B).hsa) + ', final taxable ' + d(last(A).taxable, last(B).taxable) + ', final total ' + d(last(A).total, last(B).total) + ', lifetime taxes ' + d(sum(A, 'taxes'), sum(B, 'taxes')) + ', rows equal: ' + (JSON.stringify(A.rows) === JSON.stringify(B.rows)));
}

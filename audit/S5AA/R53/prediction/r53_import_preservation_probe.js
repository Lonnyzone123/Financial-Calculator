/* S5AA R53: what "Restore backup" keeps. Every expanded-corpus plan (control plans included) is restored through the app's real import
   (jsdom, a fresh build of <tree>/src) and the plan the app saves after its calculation is compared, leaf by leaf, with the candidate as
   the validator accepted it (after normalizedPlan()'s documented defaults: a leaf the candidate does not carry is not compared). Run on
   the base and on the repaired tree; the difference is what R53 changed in the restore family, and what is left is listed for the owner.
   Usage: node r53_import_preservation_probe.js <tree> <out.json> */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const TREE = path.resolve(process.argv[2] || '.');
const OUT = process.argv[3];
const { loadCalculator, waitFor } = require(path.join(TREE, 'tests', 'lib', 'harness.js'));
const cap = require(path.join(TREE, 'tools', 'capture-baseline.js'));
const { validateScenario } = require(path.join(TREE, 'src', 'scenario-validator.js'));
const STORAGE_KEY = 'investment-calculator-v2c';
const IGNORE = new Set(['id', 'scenarioSchemaVersion', 'name', 'setupComplete']);
function leaves(o, pre, out) {
  if (o === null || typeof o !== 'object') { out[pre] = o; return out; }
  if (Array.isArray(o)) { o.forEach((v, i) => leaves(v, pre + '[' + i + ']', out)); return out; }
  for (const k of Object.keys(o)) { if (!pre && IGNORE.has(k)) continue; leaves(o[k], pre ? pre + '.' + k : k, out); }
  return out;
}
(async () => {
  const { entries } = cap.corpusWithDiagnostics({ composition: 'expanded' });
  const byField = {}, perPlan = [];
  for (const e of entries) {
    const cand = JSON.parse(JSON.stringify(e.plan));
    const v = validateScenario(JSON.parse(JSON.stringify(cand)));
    if (!v.valid) { perPlan.push({ name: e.name, refused: v.issues.filter((i) => i.severity === 'ERROR').map((i) => i.code) }); continue; }
    const dom = await loadCalculator();
    const w = dom.window, d = w.document;
    try {
      const input = d.getElementById('v2-import-settings'), status = d.getElementById('v2-status');
      const app = { version: 2, edition: '2C', page: 'setup', complexity: 'standard', theme: 'auto', compare: false, active: 0, scenarios: [JSON.parse(JSON.stringify(cand))] };
      app.scenarios[0].setupComplete = true;
      Object.defineProperty(input, 'files', { value: [new w.File([JSON.stringify({ format: STORAGE_KEY, version: 2, app })], 'b.json', { type: 'application/json' })], configurable: true });
      status.textContent = '';
      input.dispatchEvent(new w.Event('change', { bubbles: true }));
      await waitFor(() => status.textContent !== '' && !/is-running/.test(d.getElementById('v2-performance').className), { window: w, timeoutMs: 60000 });
      const saved = JSON.parse(w.localStorage.getItem(STORAGE_KEY)).scenarios[0];
      const a = leaves(cand, '', {}), b = leaves(saved, '', {}), diffs = [];
      for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diffs.push(k + ': ' + JSON.stringify(a[k]) + ' -> ' + JSON.stringify(b[k]));
      diffs.forEach((x) => { const f = x.split(':')[0].replace(/\[\d+\]/g, '[]'); byField[f] = (byField[f] || 0) + 1; });
      perPlan.push({ name: e.name, status: status.textContent, diffs });
    } finally { w.close(); }
  }
  const summary = { plans: entries.length, refused: perPlan.filter((p) => p.refused).length, changedPlans: perPlan.filter((p) => p.diffs && p.diffs.length).length, byField };
  console.log(JSON.stringify(summary, null, 1));
  perPlan.filter((p) => p.diffs && p.diffs.length).forEach((p) => console.log(p.name + ': ' + p.diffs.join('; ')));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ summary, perPlan }, null, 1));
})().catch((e) => { console.error(e); process.exit(2); });

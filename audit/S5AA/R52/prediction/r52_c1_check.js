/* S5AA R52, C1 after the build: on the REPAIRED tree, the Roth ledger record of each conversion the prediction scan flagged
   (r52_corpus_scan_at_2fb8c6f.txt) holds, right after the year's settlement, the settled nontaxable part the scan computed from the
   pre-repair engine's own settlement (amount x the settled fraction), less any draw taken from it in its own year, taxable part first.
   Read-only tap; the variant's rows are asserted equal to the
   real engine's. Usage: node r52_c1_check.js [<tree>] */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const { loadEngineVariant } = require(path.join(ROOT, 'tests', 'lib', 'engine-variant.js'));
const taps = [];
globalThis.__R52C1 = (x) => taps.push(x);
const V = loadEngineVariant([{ id: 'ledger', marker: 'rothConversionTrueUp=rothSettleConversions(iraBasisState.roth,settledIra);',
  append: 'globalThis.__R52C1&&globalThis.__R52C1({yi:iraBasisState.roth.yi,trueUp:rothConversionTrueUp,self:JSON.parse(JSON.stringify(iraBasisState.roth.self.conv)),spouse:JSON.parse(JSON.stringify(iraBasisState.roth.spouse.conv))});' }]);
// the scan's figures at 2fb8c6f (r52_corpus_scan_at_2fb8c6f.txt)
const expected = [
  { name: 'expansion:s5aa-r6-gap-basis-conversion', yi: 2, owner: 'self', amount: 10000, settledNt: 3881.41 },
  { name: 'expansion:s5aa-r19-ira-contribution-conversion-same-year', yi: 0, owner: 'self', amount: 3750, settledNt: 3750 },
  { name: 'expansion:s5aa-r19-ira-conversion-and-qcd', yi: 1, owner: 'self', amount: 5000, settledNt: 4000 },
];
const entries = cap.corpusWithDiagnostics({ composition: 'expanded' }).entries;
let bad = 0;
for (const x of expected) {
  const e = entries.find((y) => y.name === x.name);
  taps.length = 0;
  const rv = V.runPlan(JSON.parse(JSON.stringify(e.plan))), r = E.runPlan(JSON.parse(JSON.stringify(e.plan)));
  if (JSON.stringify(rv.rows) !== JSON.stringify(r.rows)) throw new Error(x.name + ': tap not output-neutral');
  const t = taps.find((y) => y.yi === x.yi), rec = t && t[x.owner].find((c) => c.year === x.yi);
  // A draw taken from the record in its own year comes off the taxable part first (1.408A-6 A-8(b)): what is left of it is the settled
  // taxable part less the draw, at least 0.
  const taken = rec ? x.amount - (rec.taxable + rec.nontaxable) : NaN;
  const ok = rec && Math.abs(rec.taxable - Math.max(0, (x.amount - x.settledNt) - taken)) < 0.01 && t.trueUp === 0;
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'MISS ') + x.name + ': tax year ' + x.yi + ' record after settlement ' + JSON.stringify(rec) + ' (scan: nontaxable ' + x.settledNt + ' of ' + x.amount + '; drawn in its year ' + (Math.round(taken * 100) / 100) + '); 10% true-up ' + (t ? t.trueUp : '-'));
}
console.log(bad ? bad + ' disagree' : 'all three records hold the scan\'s settled split');
process.exitCode = bad ? 1 : 0;

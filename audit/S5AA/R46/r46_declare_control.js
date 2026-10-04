/* S5AA R46: control 4.7's declarations for the R46 movers. Runs the comparison control test 4.7 runs (the stored control capture
   against today's capture of the control corpus, tools/differential-harness.js compareSnapshots()), and checks that every scenario
   OUTSIDE the movers R46 predicted still differs exactly as tools/control-candidate-prediction.json declares. Only then does it replace
   the movers' declarations with the measured differences and add a `changes` entry. With --write it writes the file; without, it
   reports. Usage (inside the tree): node audit/S5AA/R46/r46_declare_control.js [--write] */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const harness = require(path.join(ROOT, 'tools', 'differential-harness.js'));
const baseline = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
const CONTROL = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'control-corpus.json'), 'utf8'));
const PRED_FILE = path.join(ROOT, 'tools', 'control-candidate-prediction.json');
const MOVERS = ['golden:monte-carlo-fixed-seed', 'seed:9', 'seed:17', 'seed:1', 'seed:12'];

const stored = JSON.parse(fs.readFileSync(path.join(ROOT, CONTROL.controlCapture.file), 'utf8'));
const live = JSON.parse(JSON.stringify(baseline.capture()));
const refusals = harness.refusalsFor(stored, live);
if (refusals.length) throw new Error('refused: ' + JSON.stringify(refusals));
const found = harness.compareSnapshots(stored, live).differences;
const prediction = JSON.parse(fs.readFileSync(PRED_FILE, 'utf8'));

const others = (list) => list.filter((d) => !MOVERS.includes(d.scenario));
const check = harness.matchPrediction(others(found), Object.assign({}, prediction, { differences: others(prediction.differences) }));
console.log('outside the movers: found ' + others(found).length + ', declared ' + others(prediction.differences).length + ', as declared: ' + check.ok);
if (!check.ok) { console.log(JSON.stringify({ problems: check.problems, undeclared: check.unpredicted.slice(0, 10), notFound: check.unmatched.slice(0, 10) }, null, 1)); process.exit(1); }

const replaced = prediction.differences.length - others(prediction.differences).length;
const byScenario = {};
for (const d of found) if (MOVERS.includes(d.scenario)) byScenario[d.scenario] = (byScenario[d.scenario] || 0) + 1;
const before = {};
for (const d of prediction.differences) if (MOVERS.includes(d.scenario)) before[d.scenario] = (before[d.scenario] || 0) + 1;
console.log('movers, declared before -> found now: ' + MOVERS.map((s) => s + ' ' + (before[s] || 0) + ' -> ' + (byScenario[s] || 0)).join('; '));
const extra = found.filter((d) => MOVERS.includes(d.scenario) && d.kind === 'EXTRA_FIELD' && d.path === 'finalYearRealSpending').map((d) => d.scenario);
console.log('finalYearRealSpending added in: ' + extra.join(', '));
const s17 = found.filter((d) => d.scenario === 'seed:17');
const s17old = prediction.differences.filter((d) => d.scenario === 'seed:17');
const s17same = harness.matchPrediction(s17.filter((d) => d.path !== 'finalYearRealSpending'), Object.assign({}, prediction, { differences: s17old })).ok;
console.log('seed:17 apart from the new key, as declared before: ' + s17same);

prediction.changes.push({
  change: 'S5AA R46 (the owner, 2026-10-03, on AA1-24: MC-A to MC-E): one set of correlated asset-class shocks per Monte Carlo path and period, shared by every account; the reserve share computed once for the household; a valid Monte Carlo result carries finalYearRealSpending',
  why: 'predicted by audit/S5AA/R46/S5AA_R46_PREDICTION_RECORD_20261003.md: golden:monte-carlo-fixed-seed and seed:9 move on every path (shared shocks); seed:1 and seed:12 move through the reserve (an account below the reserve); seed:17 keeps every figure (one account, one draw a row) and gains only the new key',
  scenarios: MOVERS.slice(),
  differences: Object.values(byScenario).reduce((a, b) => a + b, 0),
  replacedDeclarations: replaced,
});
/* In place: every other scenario's declarations keep their positions; each mover's measured differences stand where its first
   declaration stood (a mover with none is appended), so the file's diff is the movers' alone. */
const out = [], placed = new Set();
for (const d of prediction.differences) {
  if (!MOVERS.includes(d.scenario)) { out.push(d); continue; }
  if (placed.has(d.scenario)) continue;
  placed.add(d.scenario);
  found.filter((f) => f.scenario === d.scenario).forEach((f) => out.push(f));
}
MOVERS.filter((s) => !placed.has(s)).forEach((s) => found.filter((f) => f.scenario === s).forEach((f) => out.push(f)));
prediction.differences = out;
const final = harness.matchPrediction(found, prediction);
console.log('all differences as declared after the update: ' + final.ok + ' (' + found.length + ' found, ' + out.length + ' declared)');
if (process.argv.includes('--write')) { fs.writeFileSync(PRED_FILE, JSON.stringify(prediction, null, 2) + '\n'); console.log('written'); }

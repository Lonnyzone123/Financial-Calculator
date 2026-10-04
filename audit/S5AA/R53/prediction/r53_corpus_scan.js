/* S5AA R53 prediction scan. Run on the tree BEFORE the repair (cbce0ce).
   Usage: node audit/S5AA/R53/prediction/r53_corpus_scan.js [<tree>] [<generator sweep seeds, default 5000>]
   1. THE STOP CONDITION (owner's decision 3): every plan with profile.endAge < profile.retireAge in the control and expanded corpora, the
      golden plans (part of both), the generator's corpus seeds (1-20) and a wider generator sweep, the R40 conservation-grid generator's
      plans (seed 20261004, as ChatGPT ran it), and any plan inside tests/fixtures/*.json.
   2. R51F-01 exposure (r53_mirror.js): every corpus plan, every Monte Carlo path with the engine's own seeding (C4, A-11). C1: taps
      asserted output-neutral (rows, success rate, issues) on every plan.
   3. The restore family: which corpus plans readStatic() rewrites today (the 11 half() fields, the 7 R45 optional dates, the two clamps,
      a manual order outside the form's three options). App-only: the engine and the captures read plans directly. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SWEEP = Number(process.argv[3] || 5000);
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const { loadEngineVariant } = require(path.join(ROOT, 'tests', 'lib', 'engine-variant.js'));
const M = require('./r53_mirror.js');
const T = M.fresh({});
globalThis.__R53 = T;
const V = M.makeVariant(loadEngineVariant, '__R53');
const money = (x) => (x < 0 ? '-' : '') + '$' + Math.abs(Math.round(x * 100) / 100).toLocaleString('en-US');
const endBeforeRetire = (p) => p && p.profile && typeof p.profile.endAge === 'number' && typeof p.profile.retireAge === 'number' && p.profile.endAge < p.profile.retireAge;
const half = (v) => Math.round(Number(v) * 2) / 2;
const HALF_FIELDS = [['profile', 'age'], ['profile', 'retireAge'], ['profile', 'endAge'], ['profile', 'spouseAge'], ['employment', 'contributionStop'],
  ['retirement', 'dividendStart'], ['retirement', 'ssClaim'], ['retirement', 'spouseClaim'], ['retirement', 'selfLife'], ['retirement', 'spouseLife'], ['advanced', 'transferAge']];
const R45_FIELDS = [['profile', 'spouseRetireAge'], ['retirement', 'spendingStartAge'], ['advanced', 'conversionStartAge'], ['advanced', 'healthCoverageEndAge'],
  ['advanced', 'ltcOnsetAge'], ['profile', 'medicareStartAge'], ['profile', 'spouseMedicareStartAge']];
const ORDERS = ['taxable,preTax,roth,hsa', 'preTax,taxable,roth,hsa', 'taxable,roth,preTax,hsa'];
function restoreRewrites(p) {
  const out = [];
  HALF_FIELDS.forEach(([g, k]) => { const v = p[g] && p[g][k]; if (typeof v === 'number' && v !== half(v)) out.push(g + '.' + k + ' ' + v + ' -> ' + half(v)); });
  R45_FIELDS.forEach(([g, k]) => { const v = p[g] && p[g][k]; if (typeof v === 'number' && Number.isFinite(v)) { const w = Math.min(120, Math.max(0, half(v))); if (w !== v) out.push(g + '.' + k + ' ' + v + ' -> ' + w); } });
  const pr = p.profile || {}, age = half(pr.age), ret = Math.max(age, half(pr.retireAge)), end = Math.min(100, Math.max(ret, half(pr.endAge)));
  if (half(pr.retireAge) !== ret) out.push('profile.retireAge raised to the age ' + ret + ' (clamp)');
  if (half(pr.endAge) !== end) out.push('profile.endAge ' + half(pr.endAge) + ' -> ' + end + ' (clamp)');
  const mo = p.retirement && p.retirement.manualOrder;
  if (typeof mo === 'string' && mo !== '' && !ORDERS.includes(mo)) out.push('retirement.manualOrder "' + mo + '" -> "" (' + (p.retirement.withdrawalOrder === 'manual' ? 'manual order in use' : 'not in use: withdrawalOrder ' + p.retirement.withdrawalOrder) + ')');
  return out;
}
function scan(name, p) {
  M.fresh(T); T.on = true;
  let rv;
  try { rv = V.runPlan(JSON.parse(JSON.stringify(p))); } finally { T.on = false; }
  const r = E.runPlan(JSON.parse(JSON.stringify(p)));
  if (JSON.stringify(rv.rows) !== JSON.stringify(r.rows) || rv.successRate !== r.successRate || JSON.stringify(rv.issues) !== JSON.stringify(r.issues)) throw new Error(name + ': taps not output-neutral');
  const x = M.exposures(T), mc = p.assumptions.method === 'monteCarlo';
  let grace = null;
  if (x.grace.length) {
    const paths = [...new Set(x.grace.map((e) => e.path))].sort((a, b) => a - b), e = x.grace[0];
    grace = (mc ? 'Monte Carlo: ' + paths.length + ' of ' + p.assumptions.runs + ' paths exposed: ' + paths.join(',') + '; first ' : '') +
      'at ' + e.age + ' (' + e.owner + '): earnings ' + money(e.earnings) + ' over the prorated exempt ' + money(e.exempt) + ', stream ' + money(e.stream) + ', grace today ' + e.todayGrace + ', paid ' + money(e.gross);
  }
  return { grace, graceRows: T.graceRows, endBeforeRetire: endBeforeRetire(p), restore: restoreRewrites(p), mc };
}
const report = {};
for (const comp of ['control', 'expanded']) {
  const { entries, omissions } = cap.corpusWithDiagnostics({ composition: comp });
  const rows = entries.map((e) => Object.assign({ name: e.name }, scan(e.name, e.plan)));
  report[comp] = rows;
  console.log('== ' + comp + ' (' + entries.length + ' plans; ' + omissions.length + ' omissions; taps output-neutral on all)');
  const stop = rows.filter((r) => r.endBeforeRetire);
  console.log('  STOP CONDITION, endAge < retireAge (' + stop.length + '): ' + (stop.length ? stop.map((r) => r.name).join(', ') : 'none'));
  console.log('  grace-year rows (any owner, before the four-part condition): ' + rows.reduce((s, r) => s + r.graceRows, 0));
  const g = rows.filter((r) => r.grace);
  console.log('  R51F-01 exposed (' + g.length + '): ' + (g.length ? '\n    ' + g.map((r) => r.name + ' [' + r.grace + ']').join('\n    ') : 'none -- no corpus exposure'));
  const rs = rows.filter((r) => r.restore.length);
  console.log('  readStatic() rewrites today (' + rs.length + '): ' + (rs.length ? '\n    ' + rs.map((r) => r.name + ': ' + r.restore.join('; ')).join('\n    ') : 'none'));
}
// The generator: its corpus seeds are in both compositions above; a wider sweep shows whether it can draw such a plan at all.
const { generateScenario } = require(path.join(ROOT, 'tests', 'lib', 'scenario-generator.js'));
const golden = require(path.join(ROOT, 'tests', 'lib', 'golden-scenario-defs.js'));
let sweepHits = [];
const dp = golden.extractDefaultPlan(SHELL);
for (let s = 1; s <= SWEEP; s++) { const p = generateScenario(dp, s); if (endBeforeRetire(p)) sweepHits.push(s); }
console.log('== generator sweep seeds 1-' + SWEEP + ': endAge < retireAge in ' + sweepHits.length + (sweepHits.length ? ': ' + sweepHits.slice(0, 50).join(',') : ''));
console.log('== defaultPlan: endAge ' + dp.profile.endAge + ', retireAge ' + dp.profile.retireAge + (endBeforeRetire(dp) ? ' -- STOP' : ' -- not refused'));
// Fixture files: any object with a profile carrying both ages.
const hits = [];
function walk(o, where) { if (!o || typeof o !== 'object') return; if (endBeforeRetire(o)) hits.push(where); for (const k of Object.keys(o)) walk(o[k], where + '.' + k); }
for (const f of fs.readdirSync(path.join(ROOT, 'tests', 'fixtures')).filter((f) => f.endsWith('.json'))) walk(JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', f), 'utf8')), f);
console.log('== tests/fixtures/*.json: endAge < retireAge at ' + hits.length + (hits.length ? ': ' + hits.join(', ') : ''));
if (process.env.R53_SCAN_JSON) fs.writeFileSync(process.env.R53_SCAN_JSON, JSON.stringify(report, null, 1));

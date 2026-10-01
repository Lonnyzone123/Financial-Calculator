/* S5AA R44.1 (ChatGPT's R44-01): why did the corrected R43 part 2 scan not flag golden:monte-carlo-fixed-seed's path 390, which changed?
   Usage: node audit/S5AA/R44.1/path390_check.js <d11017f tree> <b131aeb tree>
   For path 390: the first row whose figures differ between the two trees, and, at every row from 63, the corrected scan's two tests --
   whether the IRMAA guard flips between the old and new joint tables at that path's latest MAGI, and whether the engine's own
   smartWithdrawalOrder() changes under the scan's reconstruction of the path's accounts (each class's balance from the path's row). */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
function load(root) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  const SHELL = fs.readFileSync(path.join(root, 'src', 'app-shell.html'), 'utf8');
  global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
  const cap = require(path.join(root, 'tools', 'capture-baseline.js')); cap.installDebtModules();
  return { E: require(path.join(root, 'src', 'engine.js')), cap, BASE: global.RULES };
}
const [pre, post] = process.argv.slice(2).map((x) => path.resolve(x));
const I = 390;
let X = load(pre);
const p = X.cap.corpusWithDiagnostics({ composition: 'expanded' }).entries.find((e) => e.name === 'golden:monte-carlo-fixed-seed').plan;
const seed = Number(p.assumptions.seed), infl = Number(p.assumptions.inflation) / 100;
const rowsPre = X.E.simulatePlan(JSON.parse(JSON.stringify(p)), X.E.rng(seed + 2 * I), 0, X.E.rng(seed + 2 * I + 1), []).rows;
const E = X.E, BASE = X.BASE;
const r = p.retirement, W = Math.max(10000, (Number(r.spending) || 0) * 0.35);
const report = [];
for (let k = 2; k < rowsPre.length; k++) {
  const age = rowsPre[k - 1].age; if (age < 63) continue;
  const yr = k - 1, f = Math.pow(1 + infl, yr), w = Math.pow(1 + (Number(p.employment.growth) || 0) / 100, yr);
  const R0 = E.taxYearRules(BASE, f, w, yr, 1 + infl), oldJ = R0.medicare.irmaa.jointThresholds, sing = R0.medicare.irmaa.singleThresholds;
  const newJ = oldJ.map((x, i) => (i < sing.length - 1 ? 2 * sing[i] : x));
  const m = Number(rowsPre[k - 1].magi) || 0, guard = (T) => ((T.find((x) => x > m) || Infinity) - m < W);
  const Rn = JSON.parse(JSON.stringify(R0)); Rn.medicare.irmaa.jointThresholds = newJ;
  const orderUnder = (R) => { const saved = global.RULES; global.RULES = R; try {
    const open = rowsPre[k - 1], byClass = {}; p.accounts.forEach((a) => { byClass[a.taxClass] = (byClass[a.taxClass] || 0) + 1; });
    const accs = p.accounts.map((a) => Object.assign({}, a, { balance: (Number(open[a.taxClass]) || 0) / byClass[a.taxClass] }));
    const prior = rowsPre[k - 2].total > 0 ? open.total / rowsPre[k - 2].total - 1 : 0;
    return JSON.stringify(E.smartWithdrawalOrder(p, age, accs, rowsPre.slice(1, k).map((x) => x.magi), prior)); } finally { global.RULES = saved; } };
  const flips = guard(oldJ) !== guard(newJ);
  if (flips) report.push({ row: k, age, latestMagi: Math.round(m), guardOld: guard(oldJ), guardNew: guard(newJ), orderOld: orderUnder(R0), orderNew: orderUnder(Rn) });
}
X = load(post);
const rowsPost = X.E.simulatePlan(JSON.parse(JSON.stringify(p)), X.E.rng(seed + 2 * I), 0, X.E.rng(seed + 2 * I + 1), []).rows;
const first = rowsPre.findIndex((row, k) => JSON.stringify(row) !== JSON.stringify(rowsPost[k]));
console.log('path ' + I + ': first differing row ' + first + ' (age ' + (first >= 0 ? rowsPre[first].age : '-') + ')' + (first >= 0 ? ', fields: ' + Object.keys(rowsPre[first]).filter((key) => JSON.stringify(rowsPre[first][key]) !== JSON.stringify(rowsPost[first][key])).join(',') : ''));
console.log('rows where the guard flips at the path\'s latest MAGI (from 63): ' + (report.length ? '' : 'none'));
for (const x of report) console.log('  ' + JSON.stringify(x));

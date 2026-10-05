// S5AA R54: runs ChatGPT's four companion scripts against one tree and records each one's JSON, its printed summary and its exit code.
// The R53 companion runs as written (no adapter); the three earlier ones under the owner's R53 adapter, as R53 recorded them.
// Usage: node r54_run_companions.js <tree> <outdir> <label>
'use strict';
const { spawnSync } = require('node:child_process'), fs = require('node:fs'), path = require('node:path');
const [TREE, OUTDIR, LABEL] = process.argv.slice(2);
const root = path.resolve(TREE);
fs.mkdirSync(OUTDIR, { recursive: true });
const ADAPTER = './audit/S5AA/R53/S5AA_R53_COMPANION_ADAPTER.js';
const RUNS = [
  ['r53_focused', [], 'audit/S5AA/R53/S5AA_R53_CHATGPT_FOCUSED_SIMULATIONS_20261004.js'],
  ['r51f_probes', ['-r', ADAPTER], 'audit/S5AA/R51/S5AA_R51F_FULL_MODEL_PROBES_20261004.js'],
  ['r46_r51_sims', ['-r', ADAPTER], 'audit/S5AA/R51/S5AA_R46_R51_CHATGPT_SIMULATIONS_20261004.js'],
  ['r52_boundary', ['-r', ADAPTER], 'audit/S5AA/R52/S5AA_R52_CHATGPT_BOUNDARY_SIMULATIONS_20261004.js'],
];
const summary = [];
for (const [name, pre, script] of RUNS) {
  const json = path.join(OUTDIR, 'r54_' + name + '_at_' + LABEL + '.json'), txt = path.join(OUTDIR, 'r54_' + name + '_at_' + LABEL + '.txt');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [...pre, script, root, json], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  fs.writeFileSync(txt, 'node ' + [...pre, script, root, json].join(' ') + '\nexit ' + r.status + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)\n--- stdout\n' + (r.stdout || '') + '\n--- stderr\n' + (r.stderr || ''));
  summary.push(name + ': exit ' + r.status);
}
fs.writeFileSync(path.join(OUTDIR, 'r54_companions_summary_at_' + LABEL + '.txt'), summary.join('\n') + '\n');
console.log(summary.join('\n'));

/* S5AA R44 (R43-04): compare the plans each corrected scan names (expanded composition, which contains the control) with the plans
   MEASURED to move in that part, from expanded captures before and after it (measured_movement.txt).
   Usage: node audit/S5AA/R44/prediction/retro/compare_retro.js */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const D = __dirname;
const measured = {};
for (const line of fs.readFileSync(path.join(D, 'measured_movement.txt'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^(\w+) (\w+) -> (\w+): (.*)$/);
  if (m) measured[m[1]] = new Set(m[4] === 'none' ? [] : m[4].split(', '));
}
const parts = [['part 2 (tax)', 'tax', 'd11017f'], ['part 3 (contributions)', 'contrib', 'b131aeb'], ['part 4a (life events)', 'life', 'dd18f31'], ['part 4b (cash flows)', 'flows', '960eb11']];
for (const [label, key, base] of parts) {
  const out = fs.readFileSync(path.join(D, key + '_corpus_scan_v2_at_' + base + '.txt'), 'utf8');
  const sec = out.split('== expanded')[1].split('== positive control')[0];
  const named = new Map();
  for (const line of sec.split(/\r?\n/)) {
    const m = line.match(/^ {4}(\S+) \[(.*)\]$/);
    if (m) named.set(m[1], (named.get(m[1]) || false) || /\((monteCarlo)\)|path \d+ of \d+/.test(m[2]));
  }
  const truth = measured[key];
  const names = [...named.keys()];
  const extra = names.filter((n) => !truth.has(n)), missed = [...truth].filter((n) => !named.has(n));
  const extraStochastic = extra.filter((n) => named.get(n));
  console.log(label + ': named ' + names.length + ', measured ' + truth.size +
    ' | missed: ' + (missed.join(', ') || 'none') +
    ' | named but did not move: ' + (extra.join(', ') || 'none') +
    (extraStochastic.length ? ' (Monte Carlo, path-level: ' + extraStochastic.join(', ') + ')' : ''));
}

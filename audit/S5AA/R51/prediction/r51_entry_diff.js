/* S5AA R51: for two expanded captures, each differing entry's differing leaf paths (first few) with their values.
   Usage: node r51_entry_diff.js <after.json> <before.json> [maxPaths] */
'use strict';
const fs = require('node:fs');
const [fa, fb, maxArg] = process.argv.slice(2), max = Number(maxArg) || 6;
const A = JSON.parse(fs.readFileSync(fa, 'utf8')), B = JSON.parse(fs.readFileSync(fb, 'utf8'));
const mb = new Map(B.entries.map((e) => [e.name, e]));
function leaves(x, p, out) {
  if (x && typeof x === 'object') { for (const k of Object.keys(x)) leaves(x[k], p + (Array.isArray(x) ? '[' + k + ']' : '.' + k), out); }
  else out.set(p, x);
  return out;
}
for (const a of A.entries) {
  const b = mb.get(a.name);
  if (!b || a.hash === b.hash) continue;
  const la = leaves(a.result, '', new Map()), lb = leaves(b.result, '', new Map()), diffs = [];
  for (const k of new Set([...la.keys(), ...lb.keys()])) if (JSON.stringify(la.get(k)) !== JSON.stringify(lb.get(k))) diffs.push(k);
  const show = (v) => { const s = JSON.stringify(v); return s && s.length > 90 ? s.slice(0, 90) + '...' : s; };
  console.log(a.name + ': ' + diffs.length + ' leaves differ' + (diffs.length ? ' -- ' + diffs.slice(0, max).map((k) => k + ' ' + show(lb.get(k)) + ' -> ' + show(la.get(k))).join(' | ') : ''));
}

// S5AA R54: R53's verdict comparison (audit/S5AA/R53/witness_runs/adapter/r53_verdicts.js), extended to the R53 companion's `hunt`
// (an object with checks) and its monthly grid (each record's pass and figures), and to the R52 companion's hunt cases.
// usage: node r54_verdicts.js <a.json> <b.json> [--except U01]
// Compares every check (case id, label, actual, expected, pass) and each case's error between two outputs of the same companion script.
'use strict';
const fs = require('fs');
const [fa, fb] = process.argv.slice(2, 4);
const except = process.argv.includes('--except') ? process.argv[process.argv.indexOf('--except') + 1].split(',') : [];
function tuples(f) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8')), out = new Map();
  const lists = [j.cases, j.boundaryCases, j.huntCases, j.hunt && Array.isArray(j.hunt.cases) ? j.hunt.cases : null].filter(Array.isArray);
  if (j.hunt && Array.isArray(j.hunt.checks)) lists.push([j.hunt]);
  for (const list of lists) for (const c of list) {
    (c.checks || []).forEach((k, i) => out.set(c.id + '#' + i + ' ' + k.label, JSON.stringify([k.actual, k.expected, k.pass !== undefined ? k.pass : k.passed])));
    if (c.error) out.set(c.id + ' error', String(c.error).split('\n')[0]);
  }
  if (j.monthlyGrid && Array.isArray(j.monthlyGrid.results)) j.monthlyGrid.results.forEach((r, i) => out.set('grid#' + i, JSON.stringify([r.expectedSS, r.actualSS, r.expectedFra, r.actualFra, r.pass])));
  if (j.ui) for (const [k, v] of Object.entries(j.ui)) { const u = Object.assign({}, v); delete u.plan; out.set('ui.' + (v.id || k), JSON.stringify(u)); }
  return out;
}
const a = tuples(fa), b = tuples(fb);
let same = 0, diff = 0;
for (const k of new Set([...a.keys(), ...b.keys()])) {
  if (except.some((e) => k.startsWith('ui.' + e) || k.startsWith(e + '#') || k.startsWith(e + ' '))) continue;
  if (a.get(k) === b.get(k)) same++; else { diff++; console.log('DIFF', k, '\n   a:', a.get(k), '\n   b:', b.get(k)); }
}
console.log(`${fa.split(/[\\/]/).slice(-1)[0]} vs ${fb.split(/[\\/]/).slice(-1)[0]}: ${same} identical, ${diff} different` + (except.length ? ` (excluding ${except.join(',')})` : ''));

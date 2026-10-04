/* S5AA R46: entry-by-entry comparison of two expanded captures (tools/capture-baseline.js capture ... --composition expanded), reading
   the results field by field with R46's new key set aside, so a Monte Carlo entry whose figures did not move is told apart from one
   that moved. Usage: node r46_compare_captures.js <head.json> <base.json> */
'use strict';
const fs = require('node:fs');
const [headFile, baseFile] = process.argv.slice(2);
const head = JSON.parse(fs.readFileSync(headFile, 'utf8')), base = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
const by = (s) => new Map(s.entries.map((e) => [e.name, e]));
const H = by(head), B = by(base);
const money = (x) => typeof x === 'number' ? (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(x);
const strip = (r) => { const c = JSON.parse(JSON.stringify(r)); delete c.finalYearRealSpending; return c; };
function firstDiff(a, b, at) {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of Object.keys(a).concat(Object.keys(b).filter((x) => !(x in a)))) { const d = firstDiff(a[k], b[k], at + (Array.isArray(a) ? '[' + k + ']' : '.' + k)); if (d) return d; }
  }
  return at + ': ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b);
}
const moved = [], keyOnly = [], same = [];
for (const [name, e] of H) {
  const o = B.get(name);
  if (!o) { moved.push(name + ' (new)'); continue; }
  const a = strip(o.result), b = strip(e.result);
  const keyAdded = 'finalYearRealSpending' in e.result && !('finalYearRealSpending' in o.result);
  if (JSON.stringify(a) === JSON.stringify(b)) { (keyAdded ? keyOnly : same).push(name); continue; }
  const last = (r) => (r.rows && r.rows.length ? r.rows[r.rows.length - 1] : {});
  moved.push(name + ' [' + (e.result.mode || '?') + ']: success ' + o.result.successRate + ' -> ' + e.result.successRate +
    '; final total ' + money(last(o.result).total) + ' -> ' + money(last(e.result).total) + ' (' + money(last(e.result).total - last(o.result).total) + ')' +
    '; lifetime taxes ' + money(o.result.lifetimeTaxes) + ' -> ' + money(e.result.lifetimeTaxes) + ' (' + money(e.result.lifetimeTaxes - o.result.lifetimeTaxes) + ')' +
    (e.result.finalYearRealSpending ? '; finalYearRealSpending median ' + money(e.result.finalYearRealSpending.median) + ', q10 ' + money(e.result.finalYearRealSpending.q10) : '') +
    '\n    first difference ' + firstDiff(a, b, ''));
}
for (const name of B.keys()) if (!H.has(name)) moved.push(name + ' (missing at head)');
console.log('entries ' + H.size + ' vs ' + B.size);
console.log('moved (' + moved.length + '):\n  ' + moved.join('\n  '));
console.log('figures unchanged, finalYearRealSpending added (' + keyOnly.length + '): ' + keyOnly.join(', '));
console.log('identical (' + same.length + ')');

/* S5AA R50 measurement: the expanded composition at the head commit against the same at ba9946d, entry by entry -- each moved
   entry's headline figures, its first moved row and field, and its issue codes before and after.
   Usage: node audit/S5AA/R50/prediction/r50_measure.js <head capture> <base capture> */
'use strict';
const fs = require('node:fs');
const [hf, bf] = process.argv.slice(2);
const H = JSON.parse(fs.readFileSync(hf, 'utf8')), B = JSON.parse(fs.readFileSync(bf, 'utf8'));
const byName = (c) => new Map(c.entries.map((e) => [e.name, e]));
const h = byName(H), b = byName(B);
const money = (x) => (x === undefined || x === null ? String(x) : (Math.round(x * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const codes = (r) => (r.issues || []).map((i) => i.code).sort().join(', ') || '(none)';
for (const [name, he] of h) {
  const be = b.get(name);
  if (!be || be.hash === he.hash) continue;
  const R = he.result, S = be.result, last = (r) => r.rows[r.rows.length - 1];
  console.log('== ' + name + ' (' + R.mode + ')');
  if (R.mode === 'monteCarlo') {
    console.log('  successRate ' + S.successRate + ' -> ' + R.successRate);
  }
  console.log('  lifetimeTaxes ' + money(S.lifetimeTaxes) + ' -> ' + money(R.lifetimeTaxes) + ' (' + money(R.lifetimeTaxes - S.lifetimeTaxes) + ')');
  console.log('  final total ' + money(last(S).total) + ' -> ' + money(last(R).total) + ' (' + money(last(R).total - last(S).total) + ')');
  console.log('  failed ' + S.failed + ' -> ' + R.failed + '; firstShortfallAge ' + S.firstShortfallAge + ' -> ' + R.firstShortfallAge);
  let first = null, rowsMoved = 0;
  for (let i = 0; i < Math.max(R.rows.length, S.rows.length); i++) {
    const x = R.rows[i] || {}, y = S.rows[i] || {};
    const fields = Object.keys(Object.assign({}, x, y)).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
    if (fields.length) { rowsMoved++; if (!first) first = { age: x.age, fields }; }
  }
  if (first) console.log('  rows moved ' + rowsMoved + ' of ' + R.rows.length + '; first at ' + first.age + ': ' + first.fields.slice(0, 10).join(', ') + (first.fields.length > 10 ? ', ...' : ''));
  else console.log('  no row moved');
  console.log('  issues ' + codes(S) + '\n      -> ' + codes(R));
}

/* S5AA R49, C8 after the build: the expanded capture at the head against the same capture at ba9946d, entry by entry -- for each entry
   that moved: whether its rows moved (and from which age, with the final total, success and lifetime taxes), and what changed in its
   issues. Usage: node r49_measure.js <head.json> <base.json> */
'use strict';
const fs = require('node:fs');
const [hf, bf] = process.argv.slice(2);
const H = JSON.parse(fs.readFileSync(hf, 'utf8')), B = JSON.parse(fs.readFileSync(bf, 'utf8'));
const mb = new Map(B.entries.map((e) => [e.name, e]));
for (const e of H.entries) {
  const o = mb.get(e.name);
  if (!o) { console.log(e.name + ': NEW'); continue; }
  if (e.hash === o.hash) continue;
  const a = e.result, b = o.result, out = [];
  const rowsMoved = JSON.stringify(a.rows) !== JSON.stringify(b.rows);
  if (rowsMoved) {
    const first = a.rows.findIndex((r, i) => JSON.stringify(r) !== JSON.stringify(b.rows[i]));
    const la = a.rows[a.rows.length - 1], lb = b.rows[b.rows.length - 1];
    out.push('rows from ' + (a.rows[first] || {}).age + ': final total ' + Math.round(lb.total) + ' -> ' + Math.round(la.total) + ' (' + Math.round(la.total - lb.total) + ')');
    if (a.rows[first] && b.rows[first]) out.push('spending at ' + a.rows[first].age + ' ' + Math.round(b.rows[first].spending) + ' -> ' + Math.round(a.rows[first].spending));
  } else out.push('rows unchanged');
  ['successRate', 'lifetimeTaxes', 'failed', 'firstShortfallAge'].forEach((k) => { if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k + ' ' + JSON.stringify(b[k]) + ' -> ' + JSON.stringify(a[k])); });
  const codes = (r) => (r.issues || []).map((i) => i.code);
  const added = codes(a).filter((c) => !codes(b).includes(c)), removed = codes(b).filter((c) => !codes(a).includes(c));
  if (added.length || removed.length) out.push('issues +' + added.join(',') + (removed.length ? ' -' + removed.join(',') : ''));
  const rest = Object.keys(a).filter((k) => !['rows', 'issues', 'successRate', 'lifetimeTaxes', 'failed', 'firstShortfallAge'].includes(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  if (rest.length) out.push('other fields moved: ' + rest.join(','));
  console.log(e.name + ': ' + out.join('; '));
}

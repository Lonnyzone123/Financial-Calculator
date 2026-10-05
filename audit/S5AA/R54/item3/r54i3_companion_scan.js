/* S5AA R54 item 3: every plan object in ChatGPT's four companion outputs (their JSON at the R54 head, f2ccd64) checked against the new
   bounds, so the companion verdicts that will move are named before the edit. Usage: node r54i3_companion_scan.js <witness_runs dir> */
'use strict';
const path = require('node:path'), fs = require('node:fs');
const DIR = process.argv[2];
const B = JSON.parse(fs.readFileSync(path.join(__dirname, 'r54i3_bounds.json'), 'utf8')).bounds;
const at = (o, d) => d.split('.').reduce((x, k) => (x == null || typeof x !== 'object' ? undefined : x[k]), o);
const outside = (p) => B.filter((b) => { const v = at(p, b.path); return typeof v === 'number' && Number.isFinite(v) && ((b.min !== undefined && v < b.min) || (b.max !== undefined && v > b.max)); }).map((b) => b.path + '=' + at(p, b.path));
for (const f of fs.readdirSync(DIR).filter((x) => /_at_f2ccd64\.json$/.test(x))) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const hits = new Set();
  (function walk(o, where) {
    if (!o || typeof o !== 'object') return;
    if (o.profile && o.retirement && o.assumptions) { const h = outside(o); if (h.length) hits.add(where.replace(/\.(plan|saved|secondPlan|intended)\b.*$/, '') + ': ' + h.join(', ')); }
    for (const k of Object.keys(o)) walk(o[k], where + '.' + k);
  })(j, f.replace('_at_f2ccd64.json', ''));
  console.log(f + ': ' + (hits.size ? hits.size + '\n   ' + [...hits].join('\n   ') : 'no plan outside a new bound'));
}

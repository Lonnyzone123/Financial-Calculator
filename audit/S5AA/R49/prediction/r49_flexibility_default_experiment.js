/* S5AA R49, AA1-25 (c) -- PENDING FOR THE OWNER, NOT BUILT: what `defaultPlan.retirement.flexibility` 10 -> 0 would move. A scratch
   experiment: the expanded composition captured at ba9946d, and again from a scratch copy of ba9946d whose src/app-shell.html
   defaultPlan carries flexibility:0 (no other byte changed). Usage: node r49_flexibility_default_experiment.js <base.json> <flex0.json>
   Reports, per entry, whether its corpus input moved (meta.inputHashes) and whether its output moved, with the headline figures. */
'use strict';
const fs = require('node:fs');
const [baseFile, flexFile] = process.argv.slice(2);
const a = JSON.parse(fs.readFileSync(baseFile, 'utf8')), b = JSON.parse(fs.readFileSync(flexFile, 'utf8'));
const ih = (c) => c.meta.inputHashes;
const keyed = (c) => new Map(c.entries.map((e) => [e.name, e]));
const ma = keyed(a), mb = keyed(b), ia = ih(a), ib = ih(b);
const inName = (h, n) => (Array.isArray(h) ? (h.find((x) => x.name === n) || {}).hash : h[n]);
let inputs = 0, outputs = 0;
const lines = [];
for (const [n, e] of ma) {
  const f = mb.get(n), inMoved = JSON.stringify(inName(ia, n)) !== JSON.stringify(inName(ib, n)), outMoved = e.hash !== f.hash;
  if (inMoved) inputs++;
  if (outMoved) outputs++;
  if (inMoved || outMoved) {
    const last = (r) => r.result.rows[r.result.rows.length - 1] || {};
    lines.push(n + ': input ' + (inMoved ? 'moved' : 'same') + ', output ' + (outMoved ? 'moved' : 'same') +
      (outMoved ? ' -- final total ' + Math.round(last(e).total) + ' -> ' + Math.round(last(f).total) + ', success ' + e.result.successRate + ' -> ' + f.result.successRate + ', lifetime taxes ' + Math.round(e.result.lifetimeTaxes) + ' -> ' + Math.round(f.result.lifetimeTaxes) : ''));
  }
}
console.log('entries ' + ma.size + '; corpus inputs moved ' + inputs + '; outputs moved ' + outputs);
lines.forEach((l) => console.log('  ' + l));

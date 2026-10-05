/* S5AA R54: reads a node --test spec report of the R54 witnesses and lists, for each failing check, the figure it found ("actual") and the
   figure it expected. Usage: node r54_witness_figures.js <spec report> */
'use strict';
const lines = require('node:fs').readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
const start = lines.findIndex((l) => /^✖ failing tests:/.test(l));
const out = [];
let cur = null;
const flush = () => { if (cur) out.push(cur); cur = null; };
for (let i = start + 1; i < lines.length; i++) {
  const l = lines[i];
  const m = l.match(/^✖ (.*) \([\d.]+ms\)$/);
  if (m) { flush(); cur = { check: m[1], actual: null, expected: null, message: null }; continue; }
  if (!cur) continue;
  const msg = l.match(/AssertionError \[ERR_ASSERTION\]: (.*)$/); if (msg && !cur.message) cur.message = msg[1];
  const a = l.match(/^\s+actual: (.*)$/); if (a && cur.actual === null) cur.actual = a[1];
  const e = l.match(/^\s+expected: (.*)$/); if (e && cur.expected === null) cur.expected = e[1];
}
flush();
for (const c of out) { if (/^R54/.test(c.check)) continue; if (c.message && / where .* is right/.test(c.message)) console.log(c.check + ' | ' + c.message); else console.log(c.check + ' | found ' + (c.actual !== null ? c.actual : '(' + c.message + ')') + (c.expected !== null ? ' | expected ' + c.expected : '')); }

/* S5AA R48: the expanded captures before (ba9946d) and after (the R48 head), entry by entry, against the prediction scan's flags.
   Usage: node audit/S5AA/R48/prediction/r48_measured_vs_predicted.js <head capture> <base capture> <scan output>
   For each entry that moved: lifetime taxes, the final total, the first row that moved and whether only issue text moved; for each
   flagged entry: whether it moved. */
'use strict';
const fs = require('node:fs');
const [headF, baseF, scanF] = process.argv.slice(2);
const head = JSON.parse(fs.readFileSync(headF, 'utf8')), base = JSON.parse(fs.readFileSync(baseF, 'utf8'));
const scan = fs.readFileSync(scanF, 'utf8');
const expanded = scan.slice(scan.indexOf('== expanded'));
const flagged = {};
let cur = null;
expanded.split('\n').forEach((l) => {
  const m = l.match(/^ {2}([a-zA-Z]+) \(\d+\)/); if (m) { cur = m[1]; return; }
  const e = l.match(/^ {4}(\S+) \[/); if (e && cur) (flagged[e[1]] = flagged[e[1]] || []).push(cur);
});
const by = (c) => new Map(c.entries.map((e) => [e.name, e]));
const H = by(head), B = by(base);
const money = (x) => (x >= 0 ? '+' : '-') + '$' + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const out = [];
let movers = 0, unflaggedMovers = [];
for (const [name, h] of H) {
  const b = B.get(name);
  if (h.hash === b.hash) continue;
  movers++;
  const hr = h.result, br = b.result, hRows = hr.rows || [], bRows = br.rows || [];
  const rowsSame = JSON.stringify(hRows) === JSON.stringify(bRows);
  let first = null;
  for (let i = 0; i < Math.min(hRows.length, bRows.length); i++) if (JSON.stringify(hRows[i]) !== JSON.stringify(bRows[i])) { first = bRows[i].age; break; }
  const lastH = hRows[hRows.length - 1] || {}, lastB = bRows[bRows.length - 1] || {};
  const flags = flagged[name] || [];
  if (!flags.length) unflaggedMovers.push(name);
  out.push(name + ' [' + (flags.join(',') || 'NOT FLAGGED') + '] ' + (rowsSame ? 'rows unchanged; issue text only' :
    'first moved row ' + first + '; lifetime taxes ' + money(hr.lifetimeTaxes - br.lifetimeTaxes) + '; final total ' + money(lastH.total - lastB.total) +
    (hr.successRate !== br.successRate ? '; success ' + br.successRate + ' -> ' + hr.successRate : '') +
    (hr.firstShortfallAge !== br.firstShortfallAge ? '; first shortfall ' + br.firstShortfallAge + ' -> ' + hr.firstShortfallAge : '')));
}
const flaggedNotMoved = Object.keys(flagged).filter((n) => H.get(n) && B.get(n) && H.get(n).hash === B.get(n).hash).map((n) => n + ' [' + flagged[n].join(',') + ']');
console.log('moved: ' + movers + ' of ' + H.size);
out.forEach((l) => console.log('  ' + l));
console.log('moved and not flagged (' + unflaggedMovers.length + '): ' + (unflaggedMovers.join(', ') || 'none'));
console.log('flagged and not moved (' + flaggedNotMoved.length + '):');
flaggedNotMoved.forEach((l) => console.log('  ' + l));

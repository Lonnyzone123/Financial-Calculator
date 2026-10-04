/* S5AA R48: the corrected scan's names and directions against the measured movement (the expanded captures at ba9946d and at the R48
   repair, 126c7f1, compared entry by entry). The measured direction of a moved entry is the sign of its total at the first row whose
   total moved; an entry whose rows moved but whose totals never did is "spending and taxes only"; one whose rows did not move is
   "issue text only".
   Usage: node r48_compare_v2.js <head capture> <base capture> <scan result json> */
'use strict';
const fs = require('node:fs');
const [headF, baseF, scanF] = process.argv.slice(2);
const H = new Map(JSON.parse(fs.readFileSync(headF, 'utf8')).entries.map((e) => [e.name, e]));
const B = new Map(JSON.parse(fs.readFileSync(baseF, 'utf8')).entries.map((e) => [e.name, e]));
const S = new Map(JSON.parse(fs.readFileSync(scanF, 'utf8')).map((x) => [x.name, x]));
const measured = new Map();
for (const [name, h] of H) {
  const b = B.get(name);
  if (h.hash === b.hash) continue;
  const hr = h.result.rows || [], br = b.result.rows || [];
  let dir = null;
  for (let i = 0; i < Math.min(hr.length, br.length); i++) {
    const d = hr[i].total - br[i].total;
    if (Math.abs(d) > 0.005) { dir = 'total ' + (d > 0 ? 'UP' : 'DOWN') + ' from the row closing at ' + br[i].age + ' (' + (d > 0 ? '+' : '') + d.toFixed(2) + ')'; break; }
  }
  if (!dir) dir = JSON.stringify(hr) === JSON.stringify(br) ? 'issue text only' : 'spending and taxes only';
  measured.set(name, dir);
}
const verb = (s) => (s || '').startsWith('total UP') ? 'UP' : (s || '').startsWith('total DOWN') ? 'DOWN' : (s || '').startsWith('Monte Carlo') ? 'MC' : (s || '').startsWith('spending') ? 'ABSORBED' : (s || '').startsWith('issue') ? 'TEXT' : 'none';
let ok = 0;
const lines = [], problems = [];
for (const [name, dir] of measured) {
  const s = S.get(name), pv = s && s.exposed.length ? verb(s.direction) : 'NOT NAMED', mv = verb(dir);
  const good = pv === mv || (pv === 'MC');
  if (good) ok++; else problems.push(name);
  lines.push((good ? 'OK   ' : 'MISS ') + name + '\n       predicted: ' + (s && s.exposed.length ? s.direction : 'NOT NAMED') + '\n       measured:  ' + dir);
}
const flaggedUnmoved = [...S.values()].filter((x) => x.exposed.length && !measured.has(x.name));
console.log('measured movers: ' + measured.size + '; named with the measured direction: ' + ok + '; not: ' + problems.length + (problems.length ? ' (' + problems.join(', ') + ')' : ''));
lines.forEach((l) => console.log(l));
console.log('named and not moved: ' + flaggedUnmoved.length);
flaggedUnmoved.forEach((x) => console.log('  ' + x.name + ': ' + x.exposed.join('; ') + ' => ' + x.direction));

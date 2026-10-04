/* S5AA R53: every check of a ChatGPT companion's JSON, before against after. Each case (an object with an `id` and a `checks` list, or a
   `ui` entry with `pass`) is read check by check (label, pass/passed); the output names every check whose verdict changed and counts the rest.
   Usage: node r53_companion_verdicts.js <before.json> <after.json> */
'use strict';
const fs = require('node:fs');
function verdicts(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8')), out = new Map();
  const cases = [].concat(j.cases || [], j.boundaryCases || [], j.huntCases || []);
  cases.forEach((c) => {
    (c.checks || []).forEach((k, i) => out.set(c.id + ' #' + i + ' ' + k.label, k.pass !== undefined ? k.pass : k.passed));
    if (c.error) out.set(c.id + ' (harness error)', false);
    if (!(c.checks || []).length && c.pass !== undefined) out.set(c.id + ' (case)', c.pass);
  });
  if (j.ui) Object.keys(j.ui).forEach((k) => out.set('ui.' + k + ' ' + j.ui[k].id, j.ui[k].pass));
  return out;
}
const a = verdicts(process.argv[2]), b = verdicts(process.argv[3]);
const keys = [...new Set([...a.keys(), ...b.keys()])];
let same = 0; const changed = [];
keys.forEach((k) => { if (a.get(k) === b.get(k)) same++; else changed.push(k + ': ' + a.get(k) + ' -> ' + b.get(k)); });
console.log('checks before ' + a.size + ', after ' + b.size + '; unchanged verdicts ' + same + '; changed ' + changed.length);
changed.forEach((x) => console.log('  ' + x));

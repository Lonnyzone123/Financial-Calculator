/* S5AA R46: summarises the JSON lines r46_test_exposure_hook.js wrote. Usage: node r46_exposure_summary.js <exposure.jsonl> */
'use strict';
const fs = require('node:fs');
const lines = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const groups = new Map();
for (const x of lines) {
  for (const f of x.flags) {
    const kind = f.replace(/: \d+ of \d+ paths/, ': some paths').replace(/one draw per row on all \d+ paths/, 'one draw per row on all paths').replace(/rho [-\d.]+, \d+ active/, 'rho/active');
    const key = x.file + ' | ' + x.method + ' | ' + kind;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
}
const rows = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
console.log('calls | test file | method | condition');
rows.forEach(([k, n]) => console.log(n + ' | ' + k));
const by = (re) => new Set(lines.filter((x) => x.flags.some((f) => re.test(f))).map((x) => x.file));
console.log('\nfiles with an exposed Monte Carlo plan: ' + [...by(/^mc assets on|paths$|not one/)].sort().join(', '));
console.log('\nfiles with only unchanged Monte Carlo plans (one draw per row): ' + [...by(/unchanged/)].filter((f) => !by(/^mc assets on|paths$|not one/).has(f)).sort().join(', '));
console.log('\nfiles with a refusal: ' + [...by(/^refusal/)].sort().join(', '));
console.log('\nfiles with a live reserve change: ' + [...by(/^reserve: an account/)].sort().join(', '));
console.log('\nfiles with only an empty-account reserve change: ' + [...by(/^reserve: only/)].filter((f) => !by(/^reserve: an account/).has(f)).sort().join(', '));

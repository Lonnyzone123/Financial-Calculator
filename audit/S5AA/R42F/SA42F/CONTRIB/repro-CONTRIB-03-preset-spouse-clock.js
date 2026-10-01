// CONTRIB-03: the form's "Increase 25% in five years" preset (and "Double in ten years") stamps the change at the PRIMARY person's
// age + 5, but since S5AA R33 the engine reads a spouse-owned account's future changes on the SPOUSE's age.
// Runs the app shell's own applyContributionPreset() (extracted verbatim from src/app-shell.html) and feeds the account to runPlan.
'use strict';
const fs = require('fs'), path = require('path');
const { h, acct, work, run } = require('./lib.js');
const shell = fs.readFileSync(path.join(h.TREE, 'src/app-shell.html'), 'utf8');
const grab = (name) => { const i = shell.indexOf('function ' + name + '('); let d = 0, j = shell.indexOf('{', i); for (let k = j; k < shell.length; k++) { if (shell[k] === '{') d++; else if (shell[k] === '}') { d--; if (d === 0) return shell.slice(i, k + 1); } } };
let PLAN;
const factory = new Function('plan', 'contributionSignature', grab('half') + '\n' + grab('applyContributionPreset') + '\nreturn applyContributionPreset;');
const applyContributionPreset = factory(() => PLAN, () => 'sig');
function build(spouseAge) {
  const a = acct('k', 'traditional401k', 0, { owner: 'spouse', contribution: 10000, contributionPreset: '25in5' });
  PLAN = work({ age: 45, couple: true, spouseAge, retireAge: 65, stop: 65, endAge: 65, salary: 0, spouseSalary: 100000, accounts: [acct('brok', 'taxable', 0), a] });
  applyContributionPreset(a); // what clicking "Apply" on the form does
  return PLAN;
}
for (const sa of [45, 53, 40]) {
  const p = build(sa);
  console.log(`spouse ${sa} at start; preset stamped futureChanges = ${JSON.stringify(p.accounts[1].futureChanges)}`);
  const { r } = run(p);
  const dep = []; for (let i = 1; i <= 7; i++) dep.push(Math.round(r.rows[i].preTax - r.rows[i - 1].preTax));
  console.log('  deposits per row (self ages 45->52):', dep.join(', '), ' total', dep.reduce((s, x) => s + x, 0));
}

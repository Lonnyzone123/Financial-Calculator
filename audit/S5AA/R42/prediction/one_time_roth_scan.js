/* S5AA R42 addendum (the R42F audit's CONTRIB-05): which corpus plans make a one-time transfer INTO a Roth IRA? Only those
   can move when the one-time path reads the Roth proxy at the worked share. Usage: node <this> [<source tree>]. */
'use strict';
const path = require('node:path');
const ROOT = path.resolve(process.argv[2] || '.');
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
for (const composition of ['control', 'expanded']) {
  const { entries } = cap.corpusWithDiagnostics({ composition });
  const hits = entries.filter((e) => {
    const a = e.plan.advanced || {}, accts = e.plan.accounts || [];
    const to = accts.find((x) => x.id === a.transferTo);
    return a.transferOn === true && to && to.type === 'rothIRA' && Number(a.transferAmount) > 0;
  }).map((e) => e.name + ' (from ' + e.plan.advanced.transferFrom + ', $' + e.plan.advanced.transferAmount + ' at ' + e.plan.advanced.transferAge + ')');
  console.log(composition + ': ' + entries.length + ' plans; one-time transfers into a Roth IRA: ' + (hits.join(' | ') || 'none'));
}
console.log('DONE');

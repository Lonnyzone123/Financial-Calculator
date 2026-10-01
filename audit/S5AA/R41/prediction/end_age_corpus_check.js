/* S5AA R41 prediction: which corpus plans have an end age before their starting age, or equal to it, and what the
   validator says about each corpus plan's ages today. Usage: node end_age_corpus_check.js <source tree>.
   Read before the repair: a plan listed here would move when the engine refuses an end age before the start. */
'use strict';
const path = require('node:path');
const ROOT = path.resolve(process.argv[2] || '.');
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
const V = require(path.join(ROOT, 'src', 'scenario-validator.js'));
for (const composition of ['control', 'expanded']) {
  const { entries, omissions } = cap.corpusWithDiagnostics({ composition });
  if (omissions.length) { console.log(composition, 'OMISSIONS', JSON.stringify(omissions)); process.exitCode = 1; continue; }
  const before = [], equal = [], ageIssues = [];
  for (const e of entries) {
    const pr = e.plan.profile || {};
    if (typeof pr.age === 'number' && typeof pr.endAge === 'number') {
      if (pr.endAge < pr.age) before.push(e.name);
      else if (pr.endAge === pr.age) equal.push(e.name);
    }
    const v = V.validateScenario(JSON.parse(JSON.stringify(e.plan)));
    v.issues.filter((i) => /^profile\.(age|endAge|retireAge)$/.test(i.path)).forEach((i) => ageIssues.push(e.name + ' ' + i.severity + ' ' + i.code + ' @' + i.path));
  }
  console.log(composition + ': ' + entries.length + ' plans; end age before start: ' + (before.join(', ') || 'none') +
    '; end age equal to start: ' + (equal.join(', ') || 'none') + '; validator age issues: ' + (ageIssues.join(' | ') || 'none'));
}
console.log('DONE');

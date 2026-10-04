/* S5AA R49, C1 after the build: the plans whose result carries WORKING_YEARS_NOT_FUNDED_BY_PAY, with its age and shortfall, on the
   built engine -- to compare with the scan's "working" list at ba9946d (r49_corpus_scan_at_ba9946d.txt); and pmiStopAge() against the
   scan's own stop-age rule on every corpus mortgage. Usage: node audit/S5AA/R49/prediction/r49_c1_check.js [<tree>] */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
function scanStop(d, start) {
  if (fin(d.pmiEndAge)) return d.pmiEndAge;
  if (d.mortgageType !== 'conventional' || !fin(d.loanTermYears) || !fin(d.remainingTermYears) || !(d.loanTermYears > 0) || d.remainingTermYears < 0 || d.remainingTermYears > d.loanTermYears) return null;
  return start + (Math.floor((d.remainingTermYears - d.loanTermYears / 2) * 12 + 1e-9) + 1) / 12;
}
const { entries } = cap.corpusWithDiagnostics({ composition: 'expanded' });
let mortgages = 0, agree = 0;
for (const e of entries) {
  const r = E.runPlan(JSON.parse(JSON.stringify(e.plan)));
  const w = (r.issues || []).filter((i) => i.code === 'WORKING_YEARS_NOT_FUNDED_BY_PAY');
  if (w.length) console.log(e.name + ': age ' + w[0].state.age + ', short ' + Math.round(w[0].state.shortfall) + (w.length > 1 ? ' (x' + w.length + ')' : ''));
  ((e.plan.advanced || {}).debts || []).forEach((d) => { if (d && d.type === 'mortgage') { mortgages++; if (E.pmiStopAge(d, e.plan.profile.age) === scanStop(d, e.plan.profile.age)) agree++; } });
}
console.log('pmiStopAge equals the scan rule on ' + agree + ' of ' + mortgages + ' corpus mortgages');

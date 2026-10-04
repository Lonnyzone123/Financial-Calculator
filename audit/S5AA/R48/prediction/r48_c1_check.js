/* S5AA R48, C1 after the build: the validator's IRMAA_PRIOR_INCOME_BLANK mirrors the engine's IRMAA_PRE_PLAN_MAGI_ASSUMED condition
   (the validator cannot call the engine). On every corpus plan, and on each plan with both prior incomes removed (so the blank-income
   half of the condition holds), the two must agree.
   Usage: node audit/S5AA/R48/prediction/r48_c1_check.js */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const { validateScenario } = require(path.join(ROOT, 'src', 'scenario-validator.js'));
let n = 0, agree = 0, both = 0;
const disagree = [];
for (const comp of ['expanded']) {
  for (const e of cap.corpusWithDiagnostics({ composition: comp }).entries) {
    for (const variant of ['as is', 'health on, incomes blank']) {
      const p = JSON.parse(JSON.stringify(e.plan));
      if (variant !== 'as is') { p.advanced.healthOn = true; delete p.advanced.irmaaMagiTwoYearsBefore; delete p.advanced.irmaaMagiOneYearBefore; if (p.advanced.healthInflation === undefined) p.advanced.healthInflation = 5; }
      const r = E.runPlan(JSON.parse(JSON.stringify(p)));
      if (r.status !== 'ok') continue;
      const eng = (r.issues || []).some((i) => i.code === 'IRMAA_PRE_PLAN_MAGI_ASSUMED');
      const val = validateScenario(JSON.parse(JSON.stringify(p))).issues.some((i) => i.code === 'IRMAA_PRIOR_INCOME_BLANK');
      n++; if (eng === val) agree++; else disagree.push(e.name + ' (' + variant + '): engine ' + eng + ', validator ' + val); if (eng && val) both++;
    }
  }
}
console.log('runs ' + n + ', agree ' + agree + ' (both raise it: ' + both + '), disagree ' + disagree.length);
disagree.forEach((d) => console.log('  ' + d));

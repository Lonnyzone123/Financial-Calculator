'use strict';
// STATE-HEALTH-05: the validator checks none of the health and care amounts. Values the form can never produce (it clamps
// ltcProbability to 0-100 and every amount to >= 0) pass validation and silently move the plan's spending; a missing
// healthCost or ltcCost passes validation and then fails the run. Run: node repro-STATE-HEALTH-05-health-ltc-inputs-unvalidated.js
const { h, base, income, cmp, summary } = require('./common.js');
function plan(adv) {
  const p = base({ age: 60, endAge: 63, retireAge: 60 }); income(p, 'pension', 50000);
  Object.assign(p.advanced, { healthOn: false, healthCost: 12000, healthInflation: 0, ltcOn: false, ltcCost: 100000, ltcProbability: 25, ltcYears: 3, ltcInsurance: 0 }, adv);
  for (const k of Object.keys(adv)) if (adv[k] === undefined) delete p.advanced[k];
  return p;
}
function show(label, adv, expectNote) {
  const p = plan(adv), v = h.validateScenario(structuredClone(p)), r = h.engine.runPlan(structuredClone(p));
  const sp = r.rows ? r.rows.slice(1).map(x => +x.spending.toFixed(2)) : null;
  console.log(label.padEnd(44) + ' validator valid=' + v.valid + ' | runPlan ' + r.status + (r.calculationErrorCode ? ' ' + r.calculationErrorCode : '') + ' | row spending ' + JSON.stringify(sp) + '  ' + (expectNote || ''));
  return { v, r, sp };
}
// LTC in deterministic mode: ltcStart = max(65, round(60 + 10)) = 70, so start the plan at 69 for these.
function ltcPlan(adv) { const p = plan(Object.assign({ ltcOn: true }, adv)); p.profile.age = 69; p.profile.retireAge = 60; p.profile.endAge = 73; return p; }
function showLtc(label, adv, hand) {
  const p = ltcPlan(adv), v = h.validateScenario(structuredClone(p)), r = h.engine.runPlan(structuredClone(p));
  const total = r.rows ? r.rows.slice(1).reduce((a, x) => a + x.spending, 0) : NaN;
  console.log(label.padEnd(44) + ' validator valid=' + v.valid + ' | runPlan ' + r.status + (r.calculationErrorCode ? ' ' + r.calculationErrorCode : '') + ' | care cost charged ' + (Number.isFinite(total) ? total.toFixed(2) : 'n/a'));
  return { v, total };
}
const base1 = showLtc('control ltcProbability 25 (form range)', {}, 75000);           // (100,000 x 3) x 0.25 = 75,000
cmp('control: 3 x 100,000 x 25%', base1.total, 75000);
const a = showLtc('ltcProbability 150 (form clamps to 100)', { ltcProbability: 150 });   // charged 450,000 = 150% of the cost
const b = showLtc('ltcProbability -10 (form clamps to 0)', { ltcProbability: -10 });     // charged -30,000: a care event pays the household
const c = showLtc('ltcInsurance -20,000 (form clamps to 0)', { ltcInsurance: -20000 });  // charged 90,000: a negative benefit adds cost
// Each of these should be refused (or at least flagged) by the validator, as healthInflation has been since R40:
cmp('ltcProbability 150 refused by the validator (valid=false -> 0)', a.v.valid ? 1 : 0, 0);
cmp('ltcProbability -10 refused by the validator', b.v.valid ? 1 : 0, 0);
cmp('ltcInsurance -20,000 refused by the validator', c.v.valid ? 1 : 0, 0);
const d = show('healthCost -5,000 (form clamps to 0), age 60', { healthOn: true, healthCost: -5000 }, '<- negative health cost reduces spending');
cmp('healthCost -5,000 refused by the validator', d.v.valid ? 1 : 0, 0);
const e = show('healthCost missing, healthOn', { healthOn: true, healthCost: undefined });
cmp('healthCost missing: validator and engine agree (valid iff ok)', (e.v.valid === (e.r.status === 'ok')) ? 1 : 0, 1);
const f = showLtc('ltcCost missing, ltcOn', { ltcCost: undefined });
cmp('ltcCost missing: validator and engine agree (valid iff ok)', (f.v.valid === Number.isFinite(f.total)) ? 1 : 0, 1);
summary();

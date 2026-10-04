/* S5AA R48 prediction: which TEST plans and direct tax calls are exposed to the R48 rules. Loaded with NODE_OPTIONS=--require into the
   test processes of a targeted run on the tree BEFORE the R48 edits (the coordinator runs the full gate; this round runs only the test
   files that could pin what it changes, listed in r48_test_exposure_files.txt). It wraps src/engine.js's runPlan, simulatePlan,
   estimateTaxes and quoteTaxFunding, and src/scenario-validator.js's validateScenario (tests that load an engine variant through vm are not
   seen, and the record says so), and appends one JSON line per exposed call to $R48_EXPOSURE_OUT.
   Exposure (necessary conditions, as r48_corpus_scan.js; C1: the engine's own helpers):
   - medicare: health costs on, a growth rate other than 0, someone 65+ charged Medicare in a row after the first;
   - inherited: the run raises SPOUSAL_ROLLOVER_ASSUMED with a traditional IRA passing with value to a survivor under 59 1/2;
   - rolloverText: the run raises SPOUSAL_ROLLOVER_ASSUMED (its message changes);
   - azSenior: a row (or a direct estimateTaxes call) with a federal senior deduction above 0; a Monte Carlo run, or a direct quote,
     by age alone;
   - irmaaWarn: the validator's new warning would fire (health on, someone 65+ at a plan-year-0/1 opening with the household retired in
     that row, a prior-year MAGI blank);
   - newInputs: the plan carries one of the R48 inputs (none can: they are new). */
'use strict';
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.R48_EXPOSURE_OUT;
const TREE = path.resolve(__dirname, '..', '..', '..', '..');
const ENGINE = path.join(TREE, 'src', 'engine.js').toLowerCase();
const VALIDATOR = path.join(TREE, 'src', 'scenario-validator.js').toLowerCase();
let E = null;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
function log(fn, p, flags) { if (flags.length && OUT) fs.appendFileSync(OUT, JSON.stringify({ file: path.basename(process.argv[1] || ''), fn, method: p && p.assumptions && p.assumptions.method, flags }) + '\n'); }
function irmaaWarn(p) {
  const adv = p.advanced || {};
  if (adv.healthOn !== true || (adv.irmaaMagiTwoYearsBefore != null && adv.irmaaMagiOneYearBefore != null)) return false;
  const start = Number(p.profile.age), cut = E.lastDeathCutAge(p), reaches = cut === null ? Number(p.profile.endAge) : cut, ops = [start, Math.floor(start) + 1];
  for (let i = 0; i < 2; i++) {
    const ends = i === 0 ? Math.min(Math.floor(start) + 1, reaches) : Math.min(Math.floor(start) + 2, reaches);
    if (!(ends > ops[i]) || !(E.householdRetireAge(p) < ends)) continue;
    if (E.householdSeniorAges(p, ops[i]).some((a) => a >= 65)) return true;
  }
  return false;
}
function planFlags(p, r) {
  const flags = [], pr = p.profile || {}, adv = p.advanced || {}, rt = p.retirement || {}, st = Number(pr.age);
  const mc = p.assumptions && p.assumptions.method === 'monteCarlo';
  ['medicareInflation', 'partDPremium'].forEach((k) => { if (adv[k] !== undefined) flags.push('newInputs advanced.' + k); });
  if (pr.communityProperty !== undefined) flags.push('newInputs profile.communityProperty');
  if (rt.azPost2011GainShare !== undefined) flags.push('newInputs retirement.azPost2011GainShare');
  if (!r || !Array.isArray(r.rows)) return flags;
  const rows = r.rows, opens = rows.map((x, i) => ({ open: i === 0 ? st : rows[i - 1].age, close: x.age, row: x }));
  const rate = fin(adv.medicareInflation) ? adv.medicareInflation : Number(adv.healthInflation) || 0;
  if (adv.healthOn === true && rate !== 0) {
    const house = E.householdRetireAge(p);
    let n = 0;
    for (const o of opens) {
      const yp = o.open - st, dur = o.close - o.open; if (!(yp > 1e-9)) continue;
      const ages = E.householdSeniorAges(p, o.open), retired = Math.max(0, o.close - Math.max(o.open, house));
      let charged = ages.filter((a) => a >= 65).length * retired;
      if (pr.spouseOn === true && ages[1] >= 65) charged += Math.max(0, dur - retired - E.householdWorkDurations(p, o.open, Number(pr.spouseAge) + yp, dur).spouse);
      if (charged > 1e-9) n++;
    }
    if (n) flags.push('medicare ' + n + ' rows at ' + rate + '%');
  }
  const roll = (r.issues || []).find((i) => i && i.code === 'SPOUSAL_ROLLOVER_ASSUMED');
  if (roll) {
    flags.push('rolloverText');
    const s = roll.state || roll;
    (s.rollovers || []).forEach((ev) => {
      const surv = ev.to === 'spouse' ? Number(pr.spouseAge) + (ev.fromRowOpening - st) : ev.fromRowOpening;
      const iras = (s.succession || []).filter((x) => x.type === 'traditionalIRA' && x.balance > 0.005 && (ev.accounts || []).indexOf(x.account) >= 0);
      if (surv < 59.5 && iras.length) flags.push('inherited ' + iras.map((x) => x.account).join(',') + ' survivor ' + surv.toFixed(2));
    });
  }
  let az = 0;
  for (const o of opens) {
    const filing = E.householdFilingFor(p, o.open), ab = E.ageAmountAges(p, o.open, filing, o.close - o.open);
    if (E.seniorDeduction(Number(o.row.seniorDeductionMagi) || 0, ab.seniorDeductionAges, filing) > 0.005 || (mc && ab.seniorDeductionAges.some((a) => a >= 65))) az++;
  }
  if (az) flags.push('azSenior ' + az + ' rows');
  if (irmaaWarn(p)) flags.push('irmaaWarn');
  return flags;
}
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const m = load.apply(this, arguments);
  let resolved = '';
  try { resolved = Module._resolveFilename(request, parent, isMain).toLowerCase(); } catch (e) { return m; }
  if (resolved === ENGINE && m && !m.__r48wrapped && typeof m.runPlan === 'function') {
    E = m;
    const orig = {};
    ['runPlan', 'simulatePlan', 'estimateTaxes', 'quoteTaxFunding'].forEach((k) => { orig[k] = m[k]; });
    ['runPlan', 'simulatePlan'].forEach((k) => {
      if (typeof orig[k] !== 'function') return;
      m[k] = function (p) { const r = orig[k].apply(this, arguments); try { if (p && p.profile) log(k, p, planFlags(p, r)); } catch (e) { /* never fails a test */ } return r; };
    });
    if (typeof orig.estimateTaxes === 'function') m.estimateTaxes = function (p, age) {
      const r = orig.estimateTaxes.apply(this, arguments);
      try { const filing = m.householdFilingFor(p, age), ab = m.ageAmountAges(p, age, filing, arguments[12]); if (m.seniorDeduction(r.measures.senior_deduction_magi, ab.seniorDeductionAges, filing) > 0.005) log('estimateTaxes', p, ['azSenior direct']); } catch (e) { /* never fails a test */ }
      return r;
    };
    if (typeof orig.quoteTaxFunding === 'function') m.quoteTaxFunding = function (ctx, order, accounts, p) {
      try { const ages = (ctx && (ctx.seniorDeductionAges || ctx.seniorAges)) || []; if (ages.some((a) => a >= 65)) log('quoteTaxFunding', p, ['azSenior quote (by age)']); } catch (e) { /* never fails a test */ }
      return orig.quoteTaxFunding.apply(this, arguments);
    };
    Object.defineProperty(m, '__r48wrapped', { value: true });
  }
  if (resolved === VALIDATOR && m && !m.__r48wrapped && typeof m.validateScenario === 'function') {
    const v = m.validateScenario;
    m.validateScenario = function (p) {
      try { if (!E) E = require(ENGINE); if (p && p.profile && p.advanced && irmaaWarn(JSON.parse(JSON.stringify(p)))) log('validateScenario', p, ['irmaaWarn']); } catch (e) { /* never fails a test */ }
      return v.apply(this, arguments);
    };
    Object.defineProperty(m, '__r48wrapped', { value: true });
  }
  return m;
};

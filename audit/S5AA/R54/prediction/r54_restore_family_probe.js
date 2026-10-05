/* S5AA R54 (C6, item 2): what Restore backup does to each value the form transforms. For every transformation readStatic(), save(),
   writeStatic() or normalizedPlan() applies, one plan carries a value the validator accepts (no ERROR) that the transformation changes;
   it is restored through the app's real "Restore backup" input (jsdom, a fresh build of <tree>/src), and after the calculation the
   probe reads the value the app saved, the text the form shows, and the value saved after a blur of that (untouched) field. The saved
   plan is then run by the engine (status). The selects are compared with the validator's and the contract's lists. Run on the base and
   on the repaired tree. Usage: node r54_restore_family_probe.js <tree> <out.json> */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const TREE = path.resolve(process.argv[2] || '.');
const OUT = process.argv[3];
const H = require(path.join(TREE, 'tests', 'lib', 'harness.js'));
const L = require(path.join(TREE, 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const V = require(path.join(TREE, 'src', 'scenario-validator.js'));
const CONTRACT = JSON.parse(fs.readFileSync(path.join(TREE, 'src', 'plan-value-contract.json'), 'utf8'));
const E = L.h.engine;
const KEY = 'investment-calculator-v2c';
const get = (o, k) => k.split('.').reduce((x, f) => (x == null ? undefined : x[f]), o);
const set = (o, k, v) => { const f = k.split('.'); const last = f.pop(); f.reduce((x, g) => x[g], o)[last] = v; };
function base() {
  const p = L.basePlan({ age: 60, retireAge: 60, endAge: 62, spending: 0, accounts: [L.account('r', 'rothIRA', 100000, { contributionBasis: 100000 })] });
  p.profile.rothFirstContributionYear = 2000;
  return p;
}
// [path, restored value, input id (null: no input), what transforms it today]
const CASES = [
  ['profile.endAge', 110, 'v2-end', 'normalizedPlan(): min(100, end)'],
  ['employment.salary', -1000, 'v2-salary', 'max(0)'],
  ['employment.spouseSalary', -1000, 'v2-spouse-salary', 'max(0)'],
  ['employment.growth', 35, 'v2-salary-growth', 'none in readStatic; the input range -20..30 on blur'],
  ['assumptions.returnRate', 25, 'v2-return', 'none in readStatic; the input range -5..20 on blur'],
  ['assumptions.inflation', -1, 'v2-inflation', 'none in readStatic; the input range 0..15 on blur'],
  ['assumptions.fee', 2.5, 'v2-fee', 'clamp 0..2'],
  ['assumptions.runs', 24, 'v2-runs', 'round to hundreds, clamp 100..10,000'],
  ['assumptions.seed', 42.7, 'v2-seed', 'max(1, floor)'],
  ['assumptions.volatility', -1, 'v2-volatility', 'max(0)'],
  ['retirement.spending', -100, 'v2-spending', 'max(0)'],
  ['retirement.withdrawalRate', 16, 'v2-withdrawal-rate', 'clamp 0..15'],
  ['retirement.upperGuardrail', 0.5, 'v2-upper-guardrail', 'max(1)'],
  ['retirement.lowerGuardrail', 0.5, 'v2-lower-guardrail', 'max(1)'],
  ['retirement.adjustment', 0.5, 'v2-adjustment', 'max(1)'],
  ['retirement.floor', -1, 'v2-floor', 'max(0)'],
  ['retirement.ceiling', -1, 'v2-ceiling', 'max(0)'],
  ['retirement.dividendYield', 21, 'v2-dividend-yield', 'clamp 0..20'],
  ['retirement.dividendQualified', 120, 'v2-dividend-qualified', 'clamp 0..100'],
  ['retirement.dividendGrowth', 25, 'v2-dividend-growth', 'clamp -20..20'],
  ['retirement.ssBenefit', -1, 'v2-ss-benefit', 'max(0)'],
  ['retirement.spouseSS', -1, 'v2-spouse-ss', 'max(0)'],
  ['retirement.pensionCola', 12, 'v2-pension-cola', 'none in readStatic; the input range 0..10 on blur'],
  ['retirement.flexibility', 60, 'v2-flexibility', 'clamp 0..50'],
  ['retirement.vpwMinRate', 30, 'v2-vpw-min', 'save(): clamp 0..25'],
  ['retirement.vpwMaxRate', 120, 'v2-vpw-max', 'save(): clamp 0..100'],
  ['retirement.rmdMultiplier', 250, 'v2-rmd-multiplier', 'save(): clamp 0..200'],
  ['retirement.rmdFloor', -1, 'v2-rmd-floor', 'save(): max(0)'],
  ['retirement.ssCola', 20, 'v2-ss-cola', 'save(): clamp 0..15'],
  ['retirement.survivorSpendingReduction', 75, 'v2-survivor-spending-reduction', 'save(): clamp 0..50'],
  ['advanced.correlation', 1.5, 'v2-correlation', 'clamp -1..1'],
  ['advanced.reserveYears', 12, 'v2-reserve-years', 'none in readStatic (max 0); the input range 0..10 and half() on blur'],
  ['advanced.healthInflation', -2, 'v2-health-inflation', 'max(0)'],
  ['advanced.medicareInflation', -99.5, 'v2-medicare-inflation', 'clamp -99..100'],
  ['advanced.partDPremium', 150000, 'v2-part-d-premium', 'clamp 0..100,000'],
  ['profile.priorIncomeThisYear', 2e9, 'v2-prior-income', 'clamp 0..1e9'],
  ['profile.rothFirstContributionYear', 2015.5, 'v2-roth-first-year', 'round, clamp 1998..2200'],
  ['advanced.ltcYears', 2.5, 'v2-ltc-years', 'max(0, round)'],
  ['name', '', 'v2-name', 'empty -> "Scenario N"'],
  ['retirement.ssFra', 60, null, 'dropped: retirement rebuilt'],
  ['retirement.pensionStart', 67, null, 'dropped: retirement rebuilt'],
  ['retirement.pensionAge', 65, null, 'dropped: retirement rebuilt'],
  ['profile.zzUnlisted', 'x', null, 'dropped: profile rebuilt'],
  ['employment.zzUnlisted', 'x', null, 'dropped: employment rebuilt'],
  ['assumptions.zzUnlisted', 'x', null, 'dropped: assumptions rebuilt'],
  ['retirement.zzUnlisted', 'x', null, 'dropped: retirement rebuilt'],
  ['advanced.irmaaMagiTwoYearsBefore', -5, 'v2-irmaa-magi-2', 'max(0) -- the validator REFUSES this value (control: the import must refuse it)'],
];
async function restore(plan) {
  const dom = await H.loadCalculator({ artifact: 'fresh' }), w = dom.window, d = w.document;
  const input = d.getElementById('v2-import-settings'), status = d.getElementById('v2-status');
  const app = { version: 2, edition: '2C', page: 'setup', complexity: 'advanced', theme: 'auto', compare: false, active: 0, scenarios: [plan] };
  Object.defineProperty(input, 'files', { value: [new w.File([JSON.stringify({ format: KEY, version: 2, app })], 'b.json', { type: 'application/json' })], configurable: true });
  status.textContent = '';
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await H.waitFor(() => status.textContent !== '' && !/is-running/.test(d.getElementById('v2-performance').className), { window: w, timeoutMs: 30000 });
  return { w, d, status: status.textContent, saved: () => { const s = JSON.parse(w.localStorage.getItem(KEY) || 'null'); return s && s.scenarios && s.scenarios[0]; } };
}
(async () => {
  const out = { tree: TREE, cases: [], selects: {} };
  for (const [k, v, id, what] of CASES) {
    const p = base(); set(p, k, v);
    const vr = V.validateScenario(structuredClone(p));
    const rec = { path: k, restored: v, input: id, transformation: what, validatorErrors: vr.issues.filter((i) => i.severity === 'ERROR').map((i) => i.code + ' ' + i.path), validatorWarnings: vr.issues.filter((i) => i.severity === 'WARNING' && i.path.startsWith(k)).map((i) => i.code) };
    const s = await restore(p);
    try {
      const saved = s.saved();
      rec.imported = !/not restored/.test(s.status);
      rec.savedAfterCalculation = saved ? (get(saved, k) === undefined ? '(absent)' : get(saved, k)) : '(nothing saved)';
      if (id) rec.shown = s.d.getElementById(id).value;
      if (id && rec.imported) {
        const e = s.d.getElementById(id);
        e.dispatchEvent(new s.w.Event('blur'));
        await new Promise((r) => setTimeout(r, 900)); // past the 700 ms debounce a changed field schedules
        await H.waitFor(() => !/is-running/.test(s.d.getElementById('v2-performance').className), { window: s.w, timeoutMs: 30000 });
        const after = s.saved();
        rec.savedAfterBlur = get(after, k) === undefined ? '(absent)' : get(after, k);
        rec.shownAfterBlur = e.value;
      }
      if (rec.imported) { const r = E.runPlan(structuredClone(s.saved())); rec.engineStatus = r.status + (r.calculationErrorCode ? ' ' + r.calculationErrorCode : ''); }
      rec.keptThroughCalculation = rec.imported ? JSON.stringify(rec.savedAfterCalculation) === JSON.stringify(v) : null;
      rec.keptThroughBlur = rec.imported && id ? JSON.stringify(rec.savedAfterBlur) === JSON.stringify(v) : null;
    } finally { s.w.close(); }
    out.cases.push(rec);
    console.log([k, JSON.stringify(v), 'errors=' + rec.validatorErrors.length, 'imported=' + rec.imported, 'saved=' + JSON.stringify(rec.savedAfterCalculation), 'shown=' + JSON.stringify(rec.shown), 'afterBlur=' + JSON.stringify(rec.savedAfterBlur), 'engine=' + rec.engineStatus].join('  '));
  }
  // The selects: every option the page lists, against the lists the validator and the contract accept.
  const dom = await H.loadCalculator({ artifact: 'fresh' });
  try {
    const opts = (id) => Array.from(dom.window.document.getElementById(id).options).map((o) => o.value);
    const enumOf = (p) => (CONTRACT.scalars.find((x) => x.path === p) || {}).values;
    const years = []; for (let y = 1928; y <= V.LAST_HISTORY_YEAR; y++) years.push(String(y));
    const lists = { 'v2-filing': V.FILING_STATUSES, 'v2-method': V.METHODS, 'v2-withdrawal-order': V.WITHDRAWAL_ORDERS, 'v2-strategy': V.STRATEGIES, 'v2-state': enumOf('profile.state'),
      'v2-withdrawal-timing': enumOf('assumptions.withdrawalTiming'), 'v2-limit-policy': enumOf('limitPolicy'), 'v2-optimization-goal': enumOf('retirement.optimizationGoal'), 'v2-history-start': years };
    for (const [id, accepted] of Object.entries(lists)) {
      const o = opts(id);
      out.selects[id] = { options: o.length, accepted: (accepted || []).length, acceptedNotListed: (accepted || []).map(String).filter((x) => !o.includes(x)), listedNotAccepted: o.filter((x) => !(accepted || []).map(String).includes(x)) };
      console.log('select ' + id + ': ' + JSON.stringify(out.selects[id]));
    }
    out.selects['v2-return-preset'] = { options: opts('v2-return-preset') };
  } finally { dom.window.close(); }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(2); });

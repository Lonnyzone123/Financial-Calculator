/* S5AA R53 (ChatGPT's R52-01 and R52-02 and the restore family; the owner's decision of 2026-10-04: "keep values unless edited") --
 * RESTORE AND CALCULATION KEEP EVERY VALIDATED VALUE.
 *
 * readStatic() rebuilt the plan from the form at every calculation: it rounded eleven age fields to the half year (half()), raised the
 * retirement age to the current age and the end age to the retirement age, and read the manual withdrawal order from a select with
 * three options, so a valid backup was silently changed before it was projected (R52-02: a transfer at 45.75 moved to 46, out of its
 * year, and its $375 of additional tax vanished; R52 handover section 7: "roth,preTax,hsa,taxable" became ""). The owner's rule: the form
 * shows the stored value, and readStatic() rewrites a field only when the user actually edits it. An edited field keeps the form's own
 * entry precision (half years) and its clamps. A stored manual order the select does not list is shown as an extra option.
 *
 * Each case restores a backup through the app's real "Restore backup" input (jsdom, a fresh build of src/), waits for the calculation,
 * and reads the plan the app saved and posted. The figures are projected by the engine from that saved plan and are hand-derived;
 * the derivation sits beside each case. Returns, inflation, dividends and spending are 0 unless stated.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadCalculator, waitFor, setValue } = require('./lib/harness');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));
const STORAGE_KEY = 'investment-calculator-v2c';
// Each check is its own subtest, so a failing one does not hide the next (the witness run records every pre-repair figure).
const near = (t, actual, expected, label) => t.test(label, () => assert.ok(Math.abs(actual - expected) < 0.01, label + ': ' + actual + ' where ' + expected + ' is right'));
const eq = (t, actual, expected, label) => t.test(label, () => assert.deepEqual(actual, expected, label));
const at = (r, age) => { const row = r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
const base = (o) => L.basePlan(Object.assign({ dividendOn: true, dividendYield: 0, spending: 0 }, o));

/* Restores `plan` as a one-scenario backup, waits for the projection, and returns { dom, status, saved, field(id) }. The caller closes. */
async function restore(plan) {
  assert.equal(validateScenario(structuredClone(plan)).valid, true, 'the candidate must be valid: ' + JSON.stringify(validateScenario(structuredClone(plan)).issues.filter((i) => i.severity === 'ERROR')));
  const dom = await loadCalculator();
  const w = dom.window, d = w.document;
  const input = d.getElementById('v2-import-settings'), status = d.getElementById('v2-status');
  const app = { version: 2, edition: '2C', page: 'setup', complexity: 'standard', theme: 'auto', compare: false, active: 0, scenarios: [plan] };
  Object.defineProperty(input, 'files', { value: [new w.File([JSON.stringify({ format: STORAGE_KEY, version: 2, app })], 'backup.json', { type: 'application/json' })], configurable: true });
  status.textContent = '';
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await waitFor(() => status.textContent !== '' && !/is-running/.test(d.getElementById('v2-performance').className), { window: w, timeoutMs: 20000 });
  const saved = () => JSON.parse(w.localStorage.getItem(STORAGE_KEY)).scenarios[0];
  return { dom, w, d, status: status.textContent, saved, field: (id) => d.getElementById(id) };
}
/* An edit as a user makes one: type, then leave the field; waits until the saved plan shows `until(saved)`. */
async function edit(s, id, value, until) {
  const e = s.field(id);
  setValue(e, value);
  e.dispatchEvent(new s.w.Event('blur'));
  await waitFor(() => until(s.saved()), { window: s.w, timeoutMs: 20000 });
}

// --- R52-02: the transfer at 45.75 (ChatGPT's U02, R52's R03) ------------------------------------------------------------------------
function u02() {
  // Age 45 to 46, $200,000 salary; a $7,500 traditional IRA plus a $7,500 nondeductible contribution; $1 to a 401(k) (an active
  // participant); a $7,500 conversion from 45; a $5,000 Roth-to-cash transfer at 45.75; $100,000 cash.
  const p = base({ age: 45, retireAge: 46, endAge: 46, salary: 200000, accounts: [L.account('ira', 'traditionalIRA', 7500, { contribution: 7500 }),
    L.account('roth', 'rothIRA', 0), L.account('active', 'traditional401k', 0, { contribution: 1 }), L.account('cash', 'taxable', 100000)] });
  Object.assign(p.advanced, { conversionOn: true, conversionAmount: 7500, conversionStartAge: 45, transferOn: true, transferFrom: 'roth', transferTo: 'cash',
    transferAmount: 5000, transferAge: 45.75, penaltyException: false });
  return p;
}

test('R53 (R52-02): a transfer dated 45.75 is restored, shown and projected at 45.75 -- tax $57,038.985, net worth $113,632.25', async (t) => {
  // Form 8606: the year-end pool is 15,000 with 7,500 basis, so the conversion is half nontaxable: 3,750 taxable. The salary year's
  // tax (the wage-only tax the salary bears) is 55,670.235 and the marginal rate .265: + 993.75. The 5,000 draw at 45.75 takes the
  // taxable conversion principal first (1.408A-6 A-8(b)(2)(ii)): 10% x min(5,000, 3,750) = 375. Settled tax 57,038.985.
  // Net worth: IRA 15,000 - 7,500 = 7,500; Roth 7,500 - 5,000 = 2,500; 401(k) 1; cash 105,000; = 115,001, less the portfolio's tax above
  // the salary's (993.75 + 375 = 1,368.75): 113,632.25. (Pre-R53: the date became 46, outside [45, 46): 56,663.985 and 114,007.25.)
  const s = await restore(u02());
  try {
    await eq(t, s.saved().advanced.transferAge, 45.75, 'the saved transfer date');
    await eq(t, s.field('v2-transfer-age').value, '45.75', 'the form shows the stored date');
    const r = engine.runPlan(structuredClone(s.saved()));
    await near(t, at(r, 46).taxSettled, 57038.985, 'settled tax');
    await near(t, at(r, 46).networth, 113632.25, 'net worth');
  } finally { s.w.close(); }
});

test('R53: a claim at 66.75 is kept -- $1,966 a month from 66.75 (rounded to 67 it would be $2,000 from 67)', async (t) => {
  // Age 66, retired, end 68; a $2,000 benefit at full retirement age 67 (born 1960), no COLA. 3 early months: 2,000 x (1 - 3 x 5/900)
  // = 1,966.67 -> 1,966 (20 CFR 404.410(a), 404.304(f)). Row 66-67: 3 months, 5,898. Row 67-68: 12 x 1,966 = 23,592.
  // (Pre-R53: half(66.75) = 67, nothing in the first row and 24,000 in the second.)
  const p = base({ age: 66, endAge: 68, ssBenefit: 2000, accounts: [L.account('roth', 'rothIRA', 100000)] });
  p.retirement.ssClaim = 66.75; p.retirement.ssCola = 0; p.profile.rothFirstContributionYear = 2000;
  const s = await restore(p);
  try {
    await eq(t, s.saved().retirement.ssClaim, 66.75, 'the saved claim age');
    await eq(t, s.field('v2-ss-claim').value, '66.75', 'the form shows the stored claim age');
    const r = engine.runPlan(structuredClone(s.saved()));
    await near(t, at(r, 67).income, 5898, 'row 66-67 benefit');
    await near(t, at(r, 68).income, 23592, 'row 67-68 benefit');
  } finally { s.w.close(); }
});

test('R53: a manual order the select does not list (roth,preTax,hsa,taxable) is kept and shown as its own option', async (t) => {
  // Age 60, retired, end 61, $10,000 of spending; a Roth IRA of $50,000 (first contribution 2000: qualified, 59 1/2 and five years) and
  // $50,000 of cash at full basis. Roth first: the Roth pays the 10,000 tax-free; cash untouched. Roth 40,000, cash 50,000.
  // (Pre-R53: the order read back as "".)
  const p = base({ age: 60, endAge: 61, spending: 10000, manualOrder: 'roth,preTax,hsa,taxable',
    accounts: [L.account('roth', 'rothIRA', 50000, { contributionBasis: 50000 }), L.account('cash', 'taxable', 50000)] });
  p.profile.rothFirstContributionYear = 2000;
  const s = await restore(p);
  try {
    await eq(t, s.saved().retirement.manualOrder, 'roth,preTax,hsa,taxable', 'the saved order');
    await eq(t, s.field('v2-manual-order').value, 'roth,preTax,hsa,taxable', 'the select shows the stored order');
    const r = engine.runPlan(structuredClone(s.saved()));
    await near(t, at(r, 61).roth, 40000, 'Roth after the year');
    await near(t, at(r, 61).taxable, 50000, 'cash after the year');
  } finally { s.w.close(); }
});

test('R53: an event just inside the final year (61.75 of a plan ending at 62) still happens', async (t) => {
  // Age 60, retired, end 62; Roth $100,000 (qualified), cash $0; a $10,000 Roth-to-cash transfer at 61.75, inside [61, 62).
  // Roth 90,000, cash 10,000 at 62; a qualified distribution: no tax. (Pre-R53: 62, outside the projection: Roth 100,000, cash 0.)
  const p = base({ age: 60, endAge: 62, accounts: [L.account('roth', 'rothIRA', 100000, { contributionBasis: 100000 }), L.account('cash', 'taxable', 0)] });
  p.profile.rothFirstContributionYear = 2000;
  Object.assign(p.advanced, { transferOn: true, transferFrom: 'roth', transferTo: 'cash', transferAmount: 10000, transferAge: 61.75 });
  const s = await restore(p);
  try {
    await eq(t, s.saved().advanced.transferAge, 61.75, 'the saved date');
    const r = engine.runPlan(structuredClone(s.saved()));
    await near(t, at(r, 62).roth, 90000, 'Roth at 62');
    await near(t, at(r, 62).taxable, 10000, 'cash at 62');
  } finally { s.w.close(); }
});

test('R53: an event at 59.25 stays before 59 1/2 -- the 10% applies (rounded, 59.5 escaped it)', async (t) => {
  // Age 59, retired, end 60; a Roth IRA of $100,000 with no contribution basis (entered 0) and first contribution 2000; a $10,000
  // Roth-to-cash transfer at 59.25: before 59 1/2 the distribution is earnings, ordinary income and 10% (IRC 72(t), 408A(d)(2)).
  // Income 10,000 under the 16,100 standard deduction (Arizona 16,100 too): no income tax; the additional tax 1,000. Settled tax 1,000.
  // (Pre-R53: half(59.25) = 59.5, a qualified distribution: 0.)
  const p = base({ age: 59, endAge: 60, accounts: [L.account('roth', 'rothIRA', 100000, { contributionBasis: 0 }), L.account('cash', 'taxable', 0)] });
  p.profile.rothFirstContributionYear = 2000;
  Object.assign(p.advanced, { transferOn: true, transferFrom: 'roth', transferTo: 'cash', transferAmount: 10000, transferAge: 59.25 });
  const s = await restore(p);
  try {
    await eq(t, s.saved().advanced.transferAge, 59.25, 'the saved date');
    await near(t, at(engine.runPlan(structuredClone(s.saved())), 60).taxSettled, 1000, 'settled tax');
  } finally { s.w.close(); }
});

test('R53 (control): a half-year date is restored as before', async (t) => {
  // The same transfer at 61.5: kept by both rules. Roth 90,000, cash 10,000.
  const p = base({ age: 60, endAge: 62, accounts: [L.account('roth', 'rothIRA', 100000, { contributionBasis: 100000 }), L.account('cash', 'taxable', 0)] });
  p.profile.rothFirstContributionYear = 2000;
  Object.assign(p.advanced, { transferOn: true, transferFrom: 'roth', transferTo: 'cash', transferAmount: 10000, transferAge: 61.5 });
  const s = await restore(p);
  try {
    await eq(t, s.saved().advanced.transferAge, 61.5, 'the saved date');
    await eq(t, s.field('v2-transfer-age').value, '61.5', 'the form shows the date');
    await near(t, at(engine.runPlan(structuredClone(s.saved())), 62).roth, 90000, 'Roth at 62');
  } finally { s.w.close(); }
});

test('R53: every one of the eleven fields, an R45 date and both clamps keep their stored values when untouched', async (t) => {
  // Quarter values the validator accepts, none on a half year; a retired household whose retirement age (65) is below its age (70.25),
  // which the retirement clamp raised to the age. A $10,000 pension with a 2% COLA from the retirement age; the first row is
  // 70.25-71 (0.75 of a year): 10,000 x 1.02^(70.25 - 65) x 0.75 = 8,321.70. End 71.75: rows 70.25, 71, 71.75.
  // (Pre-R53: age 70.5 and retirement 70.5, end 72: rows 70.5, 71, 72, and 10,000 x 1.02^0 x 0.5 = 5,000 in the first row.)
  const p = base({ couple: true, age: 70.25, spouseAge: 66.25, retireAge: 65, endAge: 71.75, pension: 10000,
    accounts: [L.account('roth', 'rothIRA', 100000, { contributionBasis: 100000 })] });
  p.profile.spouseRetireAge = 67.25;
  p.employment.contributionStop = 64.75;
  Object.assign(p.retirement, { pensionCola: 2, dividendStart: 70.75, ssClaim: 69.75, spouseClaim: 67.25, selfLife: 94.25, spouseLife: 96.75 });
  Object.assign(p.advanced, { transferAge: 70.75 });
  const s = await restore(p);
  try {
    const q = s.saved();
    const expect = { 'profile.age': 70.25, 'profile.retireAge': 65, 'profile.endAge': 71.75, 'profile.spouseAge': 66.25, 'profile.spouseRetireAge': 67.25,
      'employment.contributionStop': 64.75, 'retirement.dividendStart': 70.75, 'retirement.ssClaim': 69.75, 'retirement.spouseClaim': 67.25,
      'retirement.selfLife': 94.25, 'retirement.spouseLife': 96.75, 'advanced.transferAge': 70.75 };
    for (const [k, v] of Object.entries(expect)) { const [g, f] = k.split('.'); await eq(t, q[g][f], v, k); }
    await eq(t, s.field('v2-age').value, '70.25', 'the form shows the stored age');
    const r = engine.runPlan(structuredClone(q));
    await eq(t, r.rows.map((x) => x.age), [70.25, 71, 71.75], 'the horizon');
    await near(t, at(r, 71).income, 8321.70, 'pension from the stored retirement age');
  } finally { s.w.close(); }
});

test('R53 (control): an edited field still rounds to the half year and clamps as before; an untouched one beside it is kept', async (t) => {
  const s = await restore(u02());
  try {
    // A salary edit: the untouched transfer date stays 45.75.
    await edit(s, 'v2-salary', '210000', (q) => q.employment.salary === 210000);
    await eq(t, s.saved().advanced.transferAge, 45.75, 'untouched beside an edit');
    // The date typed as 45.3 rounds to the form's half year, 45.5.
    await edit(s, 'v2-transfer-age', '45.3', (q) => q.advanced.transferAge !== 45.75);
    await eq(t, s.saved().advanced.transferAge, 45.5, 'an edited date rounds');
    // The retirement age typed as 47.3 rounds to 47.5, and the end age (46, untouched) is raised to it, as before.
    await edit(s, 'v2-retire', '47.3', (q) => q.profile.retireAge === 47.5);
    await eq(t, s.saved().profile.endAge, 47.5, 'the end age is raised to an edited retirement age');
    // The retirement age typed below the age (45) is raised to the age.
    await edit(s, 'v2-retire', '40', (q) => q.profile.retireAge !== 47.5);
    await eq(t, s.saved().profile.retireAge, 45, 'an edited retirement age is clamped to the age');
  } finally { s.w.close(); }
});

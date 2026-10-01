/* S5AA R43 (the owner 2026-09-30: repair R42-01 and all 34 of Claude's R42F findings) -- SOCIAL SECURITY.
 *
 * SA42F-02, MEASURED at c67c713: a claim at a half-year age lost one COLA for good. ssPiaAt() counted
 * floor(claim - anchor) + floor(age - claim) COLAs, one fewer than floor(age - anchor) whenever the claim's fraction is the
 * larger. A single worker of 62 with $2,000 in today's dollars, claimed at 67.5 at a 2.8% COLA, was paid $28,644 in the row
 * closing at 69 where 20 CFR 404.271 gives $29,448.
 *
 * SA42F-17, MEASURED at c67c713: on the AIME path, someone already past 62 when the plan opens was given 2026's bend points,
 * not those of the year they turned 62 (20 CFR 404.211, 404.212), because the wage-index exponent was floored at zero.
 *
 * R42-01 (ChatGPT's R42 change audit), MEASURED at c67c713: a worker's earnings-test excess was charged against the family's
 * AVERAGE monthly benefit, so a spousal benefit that began mid-year cut the worker's credited months (5 to 4) and the benefit
 * at full retirement age ($2,162 to $2,150 a month). The excess is charged month by month, in order, to what is payable in
 * each month (POMS RS 02501.095); a month of full or partial deduction is credited (RS 00615.482).
 *
 * SA42F-18, MEASURED at c67c713: months a SURVIVOR benefit was withheld were credited to the survivor's own retirement
 * benefit, even months before it was claimed, and the survivor benefit's own factor was never adjusted. Each reduced benefit
 * is adjusted for its own months (20 CFR 404.412).
 *
 * Rows are labelled by their closing age. Every expected figure is hand-derived from the rules and the inputs.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));

const fd = (x) => Math.floor(x * 10 + 1e-6) / 10;    // SSA: a PIA, and each COLA-increased PIA, to the lower dime
const fl = (x) => Math.floor(x + 1e-6);              // SSA: a monthly benefit to the lower dollar

function run(p) {
  assert.equal(L.h.validateScenario(structuredClone(p)).valid, true);
  const r = L.h.engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}
const at = (r, age) => { const row = r.rows.find((x) => x.age === age); assert.ok(row, 'row ' + age); return row; };
function plan(o, ret) {
  const p = L.basePlan(Object.assign({ spending: 0, accounts: [L.account('cash', 'taxable', 5000000, { basisPct: 100 })] }, o));
  Object.assign(p.retirement, { ssCola: 0, survivor: false, selfLife: 120, spouseLife: 120 }, ret);
  p.advanced.healthOn = false;
  return p;
}
// The PIA after k COLAs of 2.8% from $2,000, each step dime-rounded.
const pia = [2000];
for (let k = 1; k <= 10; k++) pia.push(fd(pia[k - 1] * 1.028));
const drc6 = 1 + 6 * 2 / 300;                         // a claim at 67.5, six months after a full retirement age of 67

test('R43 (SA42F-02): a claim at 67.5 keeps every COLA -- the row closing at 69 has six, not five', () => {
  const r = run(plan({ age: 62, endAge: 71, ssBenefit: 2000 }, { ssClaim: 67.5, ssCola: 2.8 }));
  assert.equal(at(r, 68).income, fl(pia[5] * drc6) * 6);     // claim year: five COLAs (62 to 67), half a year paid
  assert.equal(at(r, 69).income, fl(pia[6] * drc6) * 12);    // 29,448
  assert.equal(at(r, 69).income, 29448);
  assert.equal(at(r, 70).income, fl(pia[7] * drc6) * 12);
  assert.equal(at(r, 71).income, fl(pia[8] * drc6) * 12);
});

test('R43 (SA42F-02) control: a claim at 68, on a row boundary, is unchanged', () => {
  const r = run(plan({ age: 62, endAge: 71, ssBenefit: 2000 }, { ssClaim: 68, ssCola: 2.8 }));
  assert.equal(at(r, 70).income, fl(pia[7] * (1 + 12 * 2 / 300)) * 12);
});

test('R43 (SA42F-02): the spousal and survivor benefits on that record keep the COLA too', () => {
  const r = run(plan({ couple: true, age: 62, spouseAge: 62, endAge: 72, ssBenefit: 2000, spouseSS: 0 },
    { ssClaim: 67.5, spouseClaim: 67, ssCola: 2.8, survivor: true, selfLife: 70 }));
  // row 69 (68 to 69): the worker's benefit plus half the worker's PIA after six COLAs; the spouse is at full retirement age
  assert.equal(at(r, 69).income, fl(pia[6] * drc6) * 12 + fl(0.5 * pia[6]) * 12);
  // the survivor, past full retirement age: the deceased's PIA with the delayed credits earned, eight then nine COLAs
  assert.equal(at(r, 71).income, fl(pia[8] * drc6) * 12);
  assert.equal(at(r, 72).income, fl(pia[9] * drc6) * 12);
});

// The R36 rule written out: the bend points of the year the person turns 62, from the wage stand-in, the AIME indexed alike.
function aimePia(aime, idx) {
  const b1 = Math.floor(1286 * idx + 0.5), b2 = Math.floor(7749 * idx + 0.5), a = aime * idx;
  return fd(0.9 * Math.min(a, b1) + 0.32 * Math.max(0, Math.min(a, b2) - b1) + 0.15 * Math.max(0, a - b2));
}
function aimePlan(age) {
  const p = plan({ age, endAge: 68, ssBenefit: 0 }, { ssAdvanced: true, aime: 6000, ssClaim: 67 });
  p.employment.growth = 3;
  return p;
}

test('R43 (SA42F-17): someone 65 at the start gets the bend points of the year they turned 62, three years back', () => {
  const hand = fl(aimePia(6000, Math.pow(1.03, -3))) * 12;   // 2,439 a month; no COLA (0%)
  assert.equal(hand, 29268);
  assert.equal(at(run(aimePlan(65)), 68).income, hand);
});

test('R43 (SA42F-17) controls: 60 and 62 at the start are unchanged', () => {
  assert.equal(at(run(aimePlan(60)), 68).income, fl(aimePia(6000, Math.pow(1.03, 2))) * 12);
  assert.equal(at(run(aimePlan(62)), 68).income, fl(aimePia(6000, 1)) * 12);
});

// R42-01: ChatGPT's witness. Worker 62, PIA $3,000 claimed at 62 ($2,100 a month), $45,000 of salary in the opening row,
// retiring at 63; spouse 67 with no PIA of their own, the spousal benefit ($1,500, past full retirement age) claimed at `claim`.
function family(spouseClaim, salary = 45000) {
  const p = plan({ couple: true, age: 62, spouseAge: 67, retireAge: 63, endAge: 68, salary, spouseSalary: 0, ssBenefit: 3000, spouseSS: 0 },
    { ssClaim: 62, spouseClaim });
  p.employment.contributionStop = 63;
  return p;
}
const rib = (months, p = 3000) => fl(p * (1 - Math.min(36, months) * 5 / 900 - Math.max(0, months - 36) * 5 / 1200));

test('R43 (R42-01): the spousal benefit starts mid-year -- the worker is credited five months, not four', () => {
  // excess (45,000 - 24,480) / 2 = 10,260: four $2,100 checks (8,400), then 1,860 of the fifth, before the spousal benefit starts
  const r = run(family(67.5));
  assert.equal(at(r, 63).income, 45000 + 25200 + 1500 * 6 - 10260);          // 68,940, unchanged
  assert.equal(rib(60 - 5), 2162);
  assert.equal(at(r, 68).income, (rib(60 - 5) + 1500) * 12);                  // 43,944
});

test('R43 (R42-01) control: the spousal claim after the withholding year gives the same 43,944', () => {
  assert.equal(at(run(family(68)), 68).income, (rib(55) + 1500) * 12);
});

test('R43 (R42-01): the spousal benefit starts while the excess is still being charged', () => {
  // salary $60,000: excess 17,760. Months 1-3, the worker alone: 3 x 2,100 = 6,300. From month 4 the family's 3,600 a month:
  // 11,460 more is three whole months and part of a fourth. Seven months credited (the average-pool count gave six).
  const r = run(family(67.25, 60000));
  assert.equal(at(r, 63).income, 60000 + 25200 + 1500 * 9 - 17760);          // 80,940: the year's withholding is unchanged
  assert.equal(at(r, 68).income, (rib(60 - 7) + 1500) * 12);                  // (2,187 + 1,500) x 12 = 44,244
  assert.equal(at(r, 68).income, 44244);
});

// SA42F-18: self 60 (born 1966: both full retirement ages 67), own PIA $2,800 claimed at 62, salary $100,000 to 63. Spouse 62,
// PIA $3,000, never claims, dies at 62.5 (self 60.5). Every benefit in 60.5 to 63 is withheld (excess 37,760 a year).
function survivor(salary) {
  const p = plan({ couple: true, age: 60, spouseAge: 62, retireAge: 63, endAge: 70, salary, ssBenefit: 2800, spouseSS: 3000 },
    { ssClaim: 62, spouseClaim: 67, survivor: true, spouseLife: 62.5 });
  p.employment.contributionStop = 63;
  return p;
}
const wib = (months) => fl(3000 * (1 - 0.285 * months / 84));   // the model's survivor reduction: 28.5% over the 84 months from 60

test('R43 (SA42F-18): each benefit is adjusted for its own withheld months', () => {
  // the survivor benefit was withheld 30 months (60.5 to 63); the retirement benefit, entitled from 62, 12 months (62 to 63)
  const ribLaw = rib(60 - 12, 2800), wibLaw = wib(78 - 30);
  assert.equal(ribLaw, 2100);
  assert.equal(wibLaw, 2511);
  assert.equal(at(run(survivor(100000)), 68).income, Math.max(ribLaw, wibLaw) * 12);   // 30,132
});

test('R43 (SA42F-18) control: with no wages nothing is withheld, and the survivor benefit is 2,206 a month', () => {
  assert.equal(at(run(survivor(0)), 68).income, Math.max(rib(60, 2800), wib(78)) * 12);       // 26,472
});

test('R43 (SA42F-27): the AIME switch no longer says the 2026 bend points are used', () => {
  const shell = require('node:fs').readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
  const label = (shell.match(/id="v2-ss-advanced"[^>]*><span class="form-check-label">([^<]*)</) || [])[1];
  assert.ok(label, 'the label is found');
  assert.doesNotMatch(label, /2026 bend points/);
  assert.match(label, /the year you turn 62/);
});

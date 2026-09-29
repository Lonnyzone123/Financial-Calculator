/* S5AA R34: an independent Social Security reference for tests, written from the primary texts -- never from src/engine.js, which this
 * file does not import. Used to re-fixture, by intent, the tests R34's law changes moved.
 *   - Full retirement age by birth year: SSA, Normal Retirement Age (ssa.gov/oact/progdata/nra.html); a survivor reads the year two
 *     later ("add 2 years to the year of birth shown in the table"; 20 CFR 404.409).
 *   - Early reduction: 5/9 of 1% a month for 36 months, then 5/12 of 1% (20 CFR 404.410); delayed credit 2/3 of 1% a month (404.313).
 *   - A spouse's benefit: 25/36 of 1% a month for 36 months, then 5/12 of 1%, no delayed credit (404.410, 404.333).
 *   - A survivor: 71.5% at 60, rising evenly by month to 100% at survivor full retirement age (the rules package's reading of SSA's
 *     published figures); original benefit = the death PIA with delayed credits; RIB-LIM (POMS RS 00615.320).
 *   - Rounding: a PIA and each COLA-increased PIA to the next lower $0.10 (404.212(c), 404.275(c)); the monthly benefit to the next
 *     lower $1 (404.304(f)). */
'use strict';

const floorDime = (x) => Math.floor(x * 10 + 1e-6) / 10;
const floorDollar = (x) => Math.floor(x + 1e-6);
function fraForBirthYear(y) {
  if (y <= 1937) return 65;
  if (y <= 1942) return 65 + (y - 1937) * 2 / 12;
  if (y <= 1954) return 66;
  if (y <= 1959) return 66 + (y - 1954) * 2 / 12;
  return 67;
}
const birthYearAt2026 = (age) => 2026 - Math.floor(age);
const fra = (age) => fraForBirthYear(birthYearAt2026(age));
const survivorFra = (age) => fraForBirthYear(birthYearAt2026(age) - 2);
/* The own-benefit factor for a claim at `claim` against full retirement age `f` (claims are credited between 62 and 70). */
function claimFactor(claim, f) {
  const c = Math.min(70, Math.max(62, claim));
  const months = Math.round(Math.abs(c - f) * 12);
  if (c < f) return 1 - Math.min(36, months) * 5 / 900 - Math.max(0, months - 36) * 5 / 1200;
  return 1 + months * 2 / 300;
}
function spousalFactor(startAge, f) {
  const months = Math.max(0, Math.round((f - startAge) * 12));
  return 1 - Math.min(36, months) * 25 / 3600 - Math.max(0, months - 36) * 5 / 1200;
}
function survivorFactor(startAge, sf) {
  const span = (sf - 60) * 12, early = Math.max(0, Math.min((sf - startAge) * 12, span));
  return 1 - 0.285 * (early / span);
}
/* A PIA taken through `n` COLA steps at `rate`, each rounded to the dime. */
function colaPia(pia, rate, n) { let x = floorDime(pia); for (let i = 0; i < n; i++) x = floorDime(x * (1 + rate)); return x; }
const pia = (aime) => floorDime(0.9 * Math.min(aime, 1286) + 0.32 * Math.max(0, Math.min(aime, 7749) - 1286) + 0.15 * Math.max(0, aime - 7749));

module.exports = { floorDime, floorDollar, fraForBirthYear, birthYearAt2026, fra, survivorFra, claimFactor, spousalFactor, survivorFactor, colaPia, pia };

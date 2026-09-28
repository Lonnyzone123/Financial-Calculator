'use strict';

// Track B, L2 -- unit tests for growthFromCola(), which compounds a Social
// Security COLA rate year-over-year -- either the plan's own flat ssCola
// assumption (simple/Monte Carlo modes) or the actual historical COLA for
// each simulated year (historical mode, falling back to the flat rate for
// any year outside the embedded HIST_COLA table). Found uncovered by the
// same worker-function-list audit as rothPhaseoutFactor/
// accountPlannedContribution/quantile/historyIndex.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);
const RULES = global.RULES;

const engine = require('../src/engine.js');
const HIST_RETURNS = engine.HIST_RETURNS;
const HIST_COLA = engine.HIST_COLA;

function planFor(overrides = {}) {
  return {
    retirement: Object.assign({ ssCola: 3 }, overrides.retirement),
    assumptions: Object.assign({ method: 'simple' }, overrides.assumptions),
    profile: Object.assign({ age: 65 }, overrides.profile),
  };
}

test('growthFromCola: currentAge before startAge yields exactly 0 years of growth (factor 1), never a negative-years shrink', () => {
  const p = planFor();
  assert.equal(engine.growthFromCola(p, 70, 65, 0), 1);
});

test('growthFromCola: currentAge equal to startAge yields exactly 0 years of growth', () => {
  const p = planFor();
  assert.equal(engine.growthFromCola(p, 65, 65, 0), 1);
});

test('growthFromCola: partial final year is floored, not rounded or ceiled', () => {
  const p = planFor({ retirement: { ssCola: 10 } }); // 10%/yr, easy to distinguish 2 vs 3 compounds
  // 2.9999 years elapsed must floor to 2 full years of compounding, not 3.
  assert.ok(Math.abs(engine.growthFromCola(p, 65, 67.9999, 0) - Math.pow(1.10, 2)) < 1e-9);
});

test('growthFromCola (simple mode): compounds the flat ssCola rate exactly, geometrically, for the floored number of years', () => {
  const p = planFor({ retirement: { ssCola: 4 }, assumptions: { method: 'simple' } });
  assert.ok(Math.abs(engine.growthFromCola(p, 65, 70, 0) - Math.pow(1.04, 5)) < 1e-9);
});

test('growthFromCola: a non-finite ssCola (undefined/NaN) falls back to RULES.socialSecurity.cola', () => {
  const undefinedCola = planFor({ retirement: { ssCola: undefined } });
  const nanCola = planFor({ retirement: { ssCola: NaN } });
  const expected = Math.pow(1 + RULES.socialSecurity.cola, 3);
  assert.ok(Math.abs(engine.growthFromCola(undefinedCola, 65, 68, 0) - expected) < 1e-9);
  assert.ok(Math.abs(engine.growthFromCola(nanCola, 65, 68, 0) - expected) < 1e-9);
});

test('growthFromCola (historical mode): uses the actual HIST_COLA rate for a year present in the table, not the flat ssCola assumption', () => {
  // Pick a HIST_COLA year and construct startHistoryIndex/profile.age/
  // startAge so the single simulated year lands exactly on it.
  const colaYear = 2020; // present in HIST_COLA
  const yearIndex = HIST_RETURNS.findIndex((x) => x[0] === colaYear);
  assert.ok(yearIndex >= 0, 'test assumption: 2020 exists in HIST_RETURNS');
  assert.ok(HIST_COLA[colaYear] !== undefined, 'test assumption: 2020 exists in HIST_COLA');

  const p = planFor({ retirement: { ssCola: 3 }, assumptions: { method: 'historical' }, profile: { age: 65 } });
  // startAge===profile.age so the "elapsed before start" term is 0; the
  // single loop iteration (currentAge=startAge+1) reads idx=startHistoryIndex+0.
  const result = engine.growthFromCola(p, 65, 66, yearIndex);
  assert.ok(Math.abs(result - (1 + HIST_COLA[colaYear])) < 1e-9, `expected the actual ${colaYear} COLA (${HIST_COLA[colaYear]}) to override the flat 3% assumption`);
});

test('growthFromCola (historical mode): a year outside HIST_COLA\'s coverage falls back to the flat ssCola rate for that year only', () => {
  // HIST_RETURNS starts in 1928; HIST_COLA only starts in 1975. A year in
  // that gap must use the flat rate.
  const preColaYear = 1930;
  const yearIndex = HIST_RETURNS.findIndex((x) => x[0] === preColaYear);
  assert.ok(yearIndex >= 0);
  assert.equal(HIST_COLA[preColaYear], undefined, 'test assumption: 1930 predates the HIST_COLA table');

  const p = planFor({ retirement: { ssCola: 5 }, assumptions: { method: 'historical' }, profile: { age: 65 } });
  const result = engine.growthFromCola(p, 65, 66, yearIndex);
  assert.ok(Math.abs(result - 1.05) < 1e-9, 'expected the flat 5% ssCola rate, since 1930 has no HIST_COLA entry');
});

test('growthFromCola (historical mode): the history index advances across multiple simulated years and wraps using HIST_RETURNS.length', () => {
  // Two consecutive years, one in HIST_COLA and the next just outside it,
  // to confirm the loop advances the index by exactly 1 per year rather
  // than re-reading the same year twice.
  const firstYear = 2019, secondYear = 2020;
  const firstIndex = HIST_RETURNS.findIndex((x) => x[0] === firstYear);
  assert.ok(HIST_COLA[firstYear] !== undefined && HIST_COLA[secondYear] !== undefined);

  const p = planFor({ retirement: { ssCola: 3 }, assumptions: { method: 'historical' }, profile: { age: 65 } });
  const result = engine.growthFromCola(p, 65, 67, firstIndex);
  const expected = (1 + HIST_COLA[firstYear]) * (1 + HIST_COLA[secondYear]);
  assert.ok(Math.abs(result - expected) < 1e-9);
});

test('growthFromCola: startAge before the plan\'s current profile.age shifts which historical years are read (the "elapsed before start" offset)', () => {
  // When startAge > profile.age, the function has already "walked forward"
  // floor(startAge-profile.age) years into the history before this call's
  // own loop begins -- e.g. simulating a future retirement year's COLA
  // growth starting from an earlier current-age vantage point.
  const baseIndex = HIST_RETURNS.findIndex((x) => x[0] === 2019);
  const pNoOffset = planFor({ retirement: { ssCola: 3 }, assumptions: { method: 'historical' }, profile: { age: 65 } });
  const pWithOffset = planFor({ retirement: { ssCola: 3 }, assumptions: { method: 'historical' }, profile: { age: 63 } }); // 2 years "already elapsed"
  const resultNoOffset = engine.growthFromCola(pNoOffset, 65, 66, baseIndex);
  const resultWithOffset = engine.growthFromCola(pWithOffset, 65, 66, baseIndex);
  assert.notEqual(resultNoOffset, resultWithOffset, 'a different profile.age (changing the pre-start offset) must read a different historical year, producing a different result');
});

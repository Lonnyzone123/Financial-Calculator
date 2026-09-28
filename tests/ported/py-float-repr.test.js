'use strict';

/**
 * Differential test for pyFloatRepr() -- the float renderer underneath
 * planningStateFingerprint(), which has to reproduce CPython's
 * json.dumps(float) output byte-for-byte because the fingerprint is a
 * SHA-256 over that exact text.
 *
 * This exists because an adversarial pass MEASURED the port's original
 * implementation against CPython instead of trusting its own comment, and
 * found a real divergence: the two languages disagree on both when to switch
 * to exponential notation (CPython at `decpt <= -4 || decpt > 16`, JS at
 * `n <= -6 || n >= 21`) and on exponent padding (CPython pads to two digits,
 * JS does not). CPython renders 1e-5 as "1e-05" and 1e16 as "1e+16" where
 * JS's own String() gives "0.00001" and "10000000000000000".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pyFloatRepr } = require('../../src/ported/social-security-valuation');

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'py-float-repr.fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

/**
 * Reconstructs the exact double from Python's float.hex() output, e.g.
 * '0x1.5p+3' or '-0x1.8p-5'. Used in preference to re-parsing the decimal
 * string, which would beg the very question under test.
 */
function parsePythonFloatHex(hex) {
  if (hex === 'inf') return Infinity;
  if (hex === '-inf') return -Infinity;
  if (hex === 'nan') return NaN;
  const m = /^(-?)0x([01])(?:\.([0-9a-f]+))?p([+-]\d+)$/.exec(hex);
  assert.ok(m, `unparsed Python float hex: ${hex}`);
  const sign = m[1] === '-' ? -1 : 1;
  let mantissa = parseInt(m[2], 10);
  const fraction = m[3] || '';
  for (let i = 0; i < fraction.length; i++) {
    mantissa += parseInt(fraction[i], 16) / Math.pow(16, i + 1);
  }
  const value = sign * mantissa * Math.pow(2, Number(m[4]));
  // Python renders signed zero as '-0x0.0p+0'; the arithmetic above yields
  // -0 correctly, but make the intent explicit.
  return value;
}

test('pyFloatRepr: matches CPython json.dumps for every fixture double', () => {
  let checked = 0;
  for (const record of fixtures.values) {
    const value = parsePythonFloatHex(record.hex);
    assert.equal(
      pyFloatRepr(value), record.json,
      `hex ${record.hex} (CPython repr ${record.repr}): expected ${record.json}, got ${pyFloatRepr(value)}`
    );
    checked++;
  }
  assert.ok(checked >= 190, `expected the full fixture set, only checked ${checked}`);
});

test('pyFloatRepr: pins both of CPython\'s exponential-notation switch points from either side', () => {
  // Upper: positional through 1e15, exponential from 1e16 (decpt > 16).
  assert.equal(pyFloatRepr(1e15), '1000000000000000.0');
  assert.equal(pyFloatRepr(1e16), '1e+16');
  // Lower: positional through 1e-4, exponential from 1e-5 (decpt <= -4).
  assert.equal(pyFloatRepr(1e-4), '0.0001');
  assert.equal(pyFloatRepr(1e-5), '1e-05');
  // JS's own String() disagrees on all but the first of these, which is the
  // entire reason this function exists.
  assert.notEqual(String(1e16), pyFloatRepr(1e16));
  assert.notEqual(String(1e-5), pyFloatRepr(1e-5));
});

test('pyFloatRepr: pads exponents to at least two digits, signed, like CPython', () => {
  assert.equal(pyFloatRepr(1e-7), '1e-07');
  assert.equal(pyFloatRepr(1e-9), '1e-09');
  assert.equal(pyFloatRepr(1e-12), '1e-12');
  assert.equal(pyFloatRepr(1e22), '1e+22');
  assert.equal(pyFloatRepr(5e-324), '5e-324', 'a three-digit exponent is not truncated by the padding');
});

test('pyFloatRepr: keeps a decimal point on positional integral values but not on exponential mantissas', () => {
  assert.equal(pyFloatRepr(60000), '60000.0', 'CPython renders an integral float with .0');
  assert.equal(pyFloatRepr(0), '0.0');
  assert.equal(pyFloatRepr(-1), '-1.0');
  assert.equal(pyFloatRepr(1e22), '1e+22', 'but a single-digit exponential mantissa gets no decimal point');
});

test('pyFloatRepr: distinguishes negative zero, which JSON.stringify does not', () => {
  assert.equal(pyFloatRepr(-0), '-0.0');
  assert.equal(pyFloatRepr(0), '0.0');
  assert.equal(JSON.stringify(-0), '0', 'confirming the built-in would have lost the sign');
});

test('pyFloatRepr: handles the non-finite values CPython names rather than rejecting', () => {
  assert.equal(pyFloatRepr(Infinity), 'Infinity');
  assert.equal(pyFloatRepr(-Infinity), '-Infinity');
  assert.equal(pyFloatRepr(NaN), 'NaN');
});

test('pyFloatRepr: every fixture decimal string round-trips back to the same double', () => {
  // A property of the shortest-round-trip representation itself: parsing
  // CPython's own output must recover the identical bit pattern, in JS too.
  for (const record of fixtures.values) {
    const original = parsePythonFloatHex(record.hex);
    const roundTripped = Number(record.json);
    assert.ok(
      Object.is(original, roundTripped),
      `${record.json} did not round-trip: ${original} vs ${roundTripped}`
    );
  }
});

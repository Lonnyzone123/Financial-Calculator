'use strict';

// FM-09 (whole-model audit, 2026-09-10) -- P2, and this project's own
// regression from sprint S2.
//
// S2 added `advanced.armRecastOnReset` and verified the right thing about
// the WRONG direction: that `validateAdvanced()` has no unknown-key
// rejection, so the new field needed no validator change. True, and
// irrelevant. What was never checked is that nothing STOPS a non-boolean
// either -- so a scenario carrying the string "false" validates with zero
// issues, `normalizedPlan()` preserves it verbatim, and `projectDebts()`
// enables the feature on truthiness, because `Boolean("false") === true`.
//
// The whole safety story for that feature was "it defaults to off." A
// malformed import defeats it. The feature itself is still defective until
// FM-05/FM-06 land in R6, which is what makes reaching it accidentally
// worse than a normal validation gap.
//
// Confirmed failing before the repair: `validateScenario` returned
// valid:true with issues.length === 0 for the string "false".

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const { validateScenario } = require('../src/scenario-validator.js');
const { extractDefaultPlan } = require('./lib/golden-scenario-defs.js');

const DEFAULT_PLAN = extractDefaultPlan(shell);

function planWith(value) {
  const p = JSON.parse(JSON.stringify(DEFAULT_PLAN));
  if (value === undefined) delete p.advanced.armRecastOnReset;
  else p.advanced.armRecastOnReset = value;
  return p;
}

function issuesFor(value) {
  const res = validateScenario(planWith(value));
  return (res.issues || []).filter((i) => String(i.path || '').includes('armRecastOnReset'));
}

// ---------------------------------------------------------------------------
// 1. The first-failing case
// ---------------------------------------------------------------------------

test('FM-09: the string "false" must be rejected, not silently accepted and then treated as true', () => {
  const res = validateScenario(planWith('false'));
  const flagged = issuesFor('false');

  assert.ok(
    flagged.length > 0,
    'the string "false" must raise an indexed issue on advanced.armRecastOnReset -- it currently passes with none, ' +
    'and Boolean("false") is true, so it ENABLES the feature'
  );
  assert.equal(res.valid, false, 'a scenario carrying a non-boolean flag must not validate');
  assert.equal(flagged[0].severity, 'ERROR');
  assert.equal(flagged[0].code, 'WRONG_TYPE');
});

// ---------------------------------------------------------------------------
// 2. Legitimate values must survive untouched
// ---------------------------------------------------------------------------

test('FM-09: true and false both validate clean and are preserved', () => {
  for (const v of [true, false]) {
    const res = validateScenario(planWith(v));
    assert.equal(issuesFor(v).length, 0, JSON.stringify(v) + ' must validate clean');
    assert.equal(res.valid, true, JSON.stringify(v) + ' must produce a valid scenario');
  }
});

test('FM-09: absence still migrates -- an older saved scenario without the field is legal', () => {
  const res = validateScenario(planWith(undefined));
  assert.equal(issuesFor(undefined).length, 0, 'an absent flag must raise nothing -- that is the real legacy compatibility');
  assert.equal(res.valid, true);
});

// ---------------------------------------------------------------------------
// 3. Every other non-boolean shape
// ---------------------------------------------------------------------------

test('FM-09: strings, numbers, null, arrays and objects are all rejected with an indexed field error', () => {
  const rejected = ['false', 'true', '', 'yes', 0, 1, null, [], {}, [true]];
  for (const v of rejected) {
    const flagged = issuesFor(v);
    assert.ok(
      flagged.length > 0,
      JSON.stringify(v) + ' must be rejected on advanced.armRecastOnReset'
    );
    assert.equal(flagged[0].path, 'advanced.armRecastOnReset', 'the issue must name the exact field');
  }
});

// ---------------------------------------------------------------------------
// 4. Boolean(value) is NOT an acceptable repair
// ---------------------------------------------------------------------------

test('FM-09: the coercion trap -- Boolean("false") is true, so coercion must not be the fix', () => {
  // Documents why the repair validates rather than coerces. If a future
  // change replaces the check with Boolean(...), this test explains what
  // breaks: every rejected string above would become an enabled feature.
  assert.equal(Boolean('false'), true);
  assert.equal(Boolean('0'), true);
  assert.equal(Boolean([]), true);
  // ...and the validator must be rejecting them rather than coercing them.
  assert.ok(issuesFor('false').length > 0);
  assert.ok(issuesFor([]).length > 0);
});

'use strict';

// Track B, L6 -- regression: named realistic scenarios must not silently
// change output (PLATFORM_DEVELOPMENT_ROADMAP.md §3). This complements L3
// (tests/mathematical-oracles.test.js, which independently PROVES
// correctness for a few zeroed-out closed-form cases) with broader,
// realistic scenarios where an independent closed form isn't practical --
// this only proves *stability* against the locked fixture, not
// correctness.
//
// Regenerate deliberately with `node tests/generate-golden-scenarios.js`
// whenever a real engine change is expected to shift these numbers -- review
// the diff to confirm it matches the change's expected effect, then commit
// the updated fixture alongside it. Don't regenerate to silence a failing
// test without understanding why the numbers moved.
//
// History: this fixture originally locked in a known bug (PLATFORM_
// DEVELOPMENT_ROADMAP.md §11c finding B-4 -- the one-shot tax-withdrawal
// gross-up didn't converge and reported a plan-failing shortfall even
// against a hugely over-funded portfolio). B-4 was fixed by quoteTaxFunding()
// (R2-T01/T02, 2026-09-08/09: an exact finite-piecewise tax-funding solve
// replacing the one-shot assumed-rate gross-up, plus RMD-cash-before-sale
// sequencing). The fixture was regenerated on 2026-09-09 once that fix's
// effect on every scenario here was individually reconciled -- see
// R2_T01_T02_CHECKPOINT_HANDOVER_2026-09-09.md's golden-scenario review --
// confirming zero reconciliation issues, unchanged pass/fail classification,
// and no calculationError, on every row of every scenario, not just the
// three summarized here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'app-shell.html'), 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const { extractDefaultPlan, buildScenario, GOLDEN_SCENARIOS, summarize } = require('./lib/golden-scenario-defs');

const defaultPlan = extractDefaultPlan(shell);
const fixturePath = path.join(__dirname, 'fixtures', 'golden-scenarios.fixtures.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

for (const [name, overrides] of GOLDEN_SCENARIOS) {
  test(`golden scenario "${name}" matches its locked fixture`, () => {
    assert.ok(fixture[name], `no fixture entry for "${name}" -- run node tests/generate-golden-scenarios.js`);
    const plan = buildScenario(defaultPlan, overrides);
    const actual = summarize(engine.runPlan(plan));
    assert.deepEqual(actual, fixture[name]);
  });
}

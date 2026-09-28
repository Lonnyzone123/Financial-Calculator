'use strict';

// One-off generator for tests/fixtures/golden-scenarios.fixtures.json.
//
// Unlike fixtures/*.fixtures.json at the project root (independently
// generated from the Python engine as an oracle for the ported modules),
// this fixture is generated FROM this project's own JS engine -- it is a
// regression tripwire (Track B L6: "old scenarios don't silently change"),
// not independent proof of correctness. That's L3's job
// (tests/mathematical-oracles.test.js), which proves correctness for a
// handful of zeroed-out closed-form cases; this covers broader, realistic
// scenarios where an independent closed form isn't practical, at the cost
// of only proving stability, not correctness.
//
// Re-run this script deliberately whenever a real engine change is
// expected to shift these numbers, review the diff, and commit the updated
// fixture alongside the change -- the same discipline this project already
// applies to tests/lib/harness.js's EXPECTED_SHA256. Don't regenerate to
// silence a failing test without understanding why the numbers moved.
//
// Usage: node tests/generate-golden-scenarios.js

const fs = require('node:fs');
const path = require('node:path');

const shellPath = path.join(__dirname, '..', 'src', 'app-shell.html');
const shell = fs.readFileSync(shellPath, 'utf8');
const rulesMatch = shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/);
global.RULES = JSON.parse(rulesMatch[1]);

const engine = require('../src/engine.js');
const { extractDefaultPlan, buildScenario, GOLDEN_SCENARIOS, summarize } = require('./lib/golden-scenario-defs');

const defaultPlan = extractDefaultPlan(shell);

const output = {};
for (const [name, overrides] of GOLDEN_SCENARIOS) {
  const plan = buildScenario(defaultPlan, overrides);
  const result = engine.runPlan(plan);
  output[name] = summarize(result);
}

const outPath = path.join(__dirname, 'fixtures', 'golden-scenarios.fixtures.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log('Wrote', outPath);

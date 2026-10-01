// Shared loader for Claude's R42F full-model audit (SA42F). Reads this checkout: the repository root four levels up.
//   const h = require('../harness.js');  h.grid.basePlan({...}), h.grid.account(...), h.plan, h.account, h.run, h.values,
//   h.engine (src/engine.js exports), h.validateScenario, h.RULES (the 2026 rules JSON), h.defaults (the app's default plan), h.TREE.
'use strict';
const path = require('path');
const TREE = path.join(__dirname, '..', '..', '..', '..');
const saved = process.argv.splice(2);
const repro = require(path.join(TREE, 'audit/S5AA/R29/S5AA_R29_EXTERNAL_AUDIT_REPRO_20260928.js'));
process.argv.push(...saved);
const engine = require(path.join(TREE, 'src/engine.js'));
const { validateScenario } = require(path.join(TREE, 'src/scenario-validator.js'));
const fs = require('fs');
const shell = fs.readFileSync(path.join(TREE, 'src/app-shell.html'), 'utf8');
const defaults = require(path.join(TREE, 'tests/lib/golden-scenario-defs.js')).extractDefaultPlan(shell);
const grid = require(path.join(TREE, 'audit/S5AA/R40/S5AA_R40_CONSERVATION_GRID/lib.js'));
module.exports = Object.assign({}, repro, { engine, validateScenario, RULES: global.RULES, defaults, TREE, grid });

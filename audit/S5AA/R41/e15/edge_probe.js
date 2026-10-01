/* S5AA R41: the validator and the engine on the end-age-before-start edge. */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(process.argv[2]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.corpusWithDiagnostics({ composition: 'expanded' });
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const V = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const p = JSON.parse(fs.readFileSync('corpus.json', 'utf8')).find((x) => x.name === 'edge:end-age-before-start').plan;
const v = V.validateScenario(JSON.parse(JSON.stringify(p)));
const r = engine.runScenario(JSON.parse(JSON.stringify(p)));
console.log(JSON.stringify({ age: p.profile.age, endAge: p.profile.endAge, retireAge: p.profile.retireAge,
  validator: { valid: v.valid, issues: v.issues.map((i) => i.severity + ' ' + i.code + ' @' + i.path) },
  engine: { calcError: !!r.calculationError, code: r.calculationErrorCode || null, rows: (r.rows || []).map((x) => x.age), issues: [...new Set((r.issues || []).map((i) => i.code))] } }, null, 1));

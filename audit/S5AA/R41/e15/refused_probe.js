/* S5AA R41: what the engine and the validator say about the two corpus plans the app's import refused. */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(process.argv[2]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.corpusWithDiagnostics({ composition: 'expanded' });
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const V = require(path.join(ROOT, 'src', 'scenario-validator.js'));
const corpus = JSON.parse(fs.readFileSync('corpus.json', 'utf8'));
for (const n of ['seed:9', 'targeted:spouse-cola-income']) {
  const p = corpus.find((x) => x.name === n).plan;
  const r = engine.runScenario(JSON.parse(JSON.stringify(p)));
  const issues = (r.issues || []).map((i) => i.code);
  const transfers = (p.advanced && p.advanced.transfers || []).map((t) => [t.from, t.to, t.amount, t.age].join('/'));
  const accts = (p.accounts || []).map((a) => a.id + ':' + a.type);
  let v = null;
  for (const k of Object.keys(V)) if (/validateNestedRecords|validateScenario$/.test(k) && typeof V[k] === 'function') { try { const out = V[k](JSON.parse(JSON.stringify(p))); v = (v || {}); v[k] = JSON.stringify(out).slice(0, 400); } catch (e) { v = v || {}; v[k] = 'threw ' + e.message; } }
  console.log(n, JSON.stringify({ calcError: !!r.calculationError, code: r.calculationErrorCode || null, issues: [...new Set(issues)], transfers, accts, incomes: (p.retirement.otherIncomes || []).map((i) => i.type), validator: v, validatorExports: Object.keys(V).filter((k) => /valid/i.test(k)) }));
}

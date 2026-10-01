/* S5AA R41: Node's masked raw results for the named plans, as JSON (non-finite numbers tagged), to locate a difference. */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(process.argv[2]);
const { r41Mask } = require('./canon.js');
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.corpusWithDiagnostics({ composition: 'expanded' });
const engine = require(path.join(ROOT, 'src', 'engine.js'));
const corpus = JSON.parse(fs.readFileSync('corpus.json', 'utf8'));
const names = process.argv.slice(3), out = {};
for (const n of names) {
  const e = corpus.find((x) => x.name === n);
  out[n] = r41Mask(engine.runScenario(JSON.parse(JSON.stringify(e.plan)))).masked;
}
fs.writeFileSync('node_mc_raw.json', JSON.stringify(out, (k, v) => (typeof v === 'number' && !Number.isFinite(v)) ? 'NONFINITE:' + v : (Object.is(v, -0) ? 'NEGZERO' : v)));
console.log('DONE', names.length);

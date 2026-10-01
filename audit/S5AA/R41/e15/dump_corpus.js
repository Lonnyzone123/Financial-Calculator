/* S5AA R41 (task 6.5): write the expanded corpus, plus refusal cases, as JSON for the browser, with Node's own result
   hash for each plan. Usage: node dump_corpus.js <source tree> <out dir>. The plans are JSON round-tripped first, so
   Node, the browser main thread and the browser Worker all start from the same bytes. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3]);
const { r41Canon, r41KeyOrder, r41Mask } = require('./canon.js');
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));

const { entries, omissions, composition } = cap.corpusWithDiagnostics({ composition: 'expanded' });
if (omissions.length) { console.error('OMISSIONS', JSON.stringify(omissions)); process.exit(1); }
const engine = require(path.join(ROOT, 'src', 'engine.js'));

/* Three refusals and one edge (an end age before the start, which the engine accepts), so the comparison covers a calculation-error result as well as figures. */
const base = JSON.parse(JSON.stringify(entries.find((e) => e.name === 'golden:baseline').plan));
function variant(name, edit) { const p = JSON.parse(JSON.stringify(base)); edit(p); return { name, plan: p }; }
const refusals = [
  variant('refusal:debt-reset-age-string', (p) => {
    p.advanced.debts = [{ name: 'ARM', balance: 200000, rate: 6, payment: 1500, rateType: 'adjustable',
      resetRate: 7, nextRateResetAge: '35', payoffAge: 70 }];
  }),
  variant('refusal:health-inflation-string', (p) => { p.advanced.healthOn = true; p.advanced.healthInflation = '5'; }),
  variant('refusal:missing-retirement-section', (p) => { delete p.retirement; }),
  variant('edge:end-age-before-start', (p) => { p.profile.endAge = p.profile.age - 1; }),
];

const all = entries.map((e) => ({ name: e.name, plan: JSON.parse(JSON.stringify(e.plan)) })).concat(refusals);
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const node = {};
for (const e of all) {
  const raw = engine.runScenario(JSON.parse(JSON.stringify(e.plan))), mk = r41Mask(raw), res = mk.masked;
  node[e.name] = { hash: sha(r41Canon(res)), keyOrder: sha(r41KeyOrder(res)),
    runId: mk.runId, calculationError: !!res.calculationError, code: res.calculationErrorCode || null,
    rows: Array.isArray(res.rows) ? res.rows.length : null };
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'corpus.json'), JSON.stringify(all));
fs.writeFileSync(path.join(OUT, 'node_results.json'), JSON.stringify({ composition, count: all.length, node }, null, 1));
const errs = Object.entries(node).filter(([, v]) => v.calculationError).map(([k, v]) => k + '=' + v.code);
console.log('composition', composition, 'entries', entries.length, 'refusals', refusals.length, 'total', all.length);
console.log('calculation errors:', errs.join(' | '));
console.log('DONE');

// node compose_check.js <base.json> <roundA_alone.json> <roundB_alone.json> <merged.json>
// For two rounds built in parallel from one base: which entries each moved alone, which the merge moved against A alone, and
// whether the merge equals "A alone" where B did not move it and "B alone" where A did not move it (non-interaction).
const fs = require('fs');
const load = (f) => { const j = JSON.parse(fs.readFileSync(f, 'utf8')); const es = Array.isArray(j.entries) ? j.entries : Object.values(j.entries); return new Map(es.map((e) => [e.name, e])); };
const [base, A, B, M] = process.argv.slice(2).map(load);
const h = (e) => e && (e.hash || JSON.stringify(e.result));
const moved = (x, y) => [...x.keys()].filter((k) => h(x.get(k)) !== h(y.get(k)));
const movA = new Set(moved(A, base)), movB = new Set(moved(B, base)), movM = moved(M, base);
console.log('moved by A alone (' + movA.size + '):', [...movA].join(', '));
console.log('moved by B alone (' + movB.size + '):', [...movB].join(', '));
console.log('moved by the merge vs base (' + movM.length + ')');
const notInUnion = movM.filter((k) => !movA.has(k) && !movB.has(k));
console.log('merge moved, neither alone did (' + notInUnion.length + '):', notInUnion.join(', '));
const both = [...movA].filter((k) => movB.has(k));
console.log('moved by both rounds (' + both.length + '):', both.join(', '));
const onlyA = [...movA].filter((k) => !movB.has(k)), onlyB = [...movB].filter((k) => !movA.has(k));
const aMismatch = onlyA.filter((k) => h(M.get(k)) !== h(A.get(k))), bMismatch = onlyB.filter((k) => h(M.get(k)) !== h(B.get(k)));
console.log('A-only entries where the merge differs from A alone (' + aMismatch.length + '):', aMismatch.join(', '));
console.log('B-only entries where the merge differs from B alone (' + bMismatch.length + '):', bMismatch.join(', '));
const unmoved = [...base.keys()].filter((k) => !movA.has(k) && !movB.has(k) && h(M.get(k)) !== h(base.get(k)));
console.log('entries neither moved where the merge differs from base (' + unmoved.length + '):', unmoved.join(', '));

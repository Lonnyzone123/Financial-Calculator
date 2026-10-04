/* S5AA R47 proof: compare the corrected scan (r47_corpus_scan_v2.js, run on ba9946d) with the measured movement (the expanded
   captures of ba9946d and f02e26a, both clean). Usage: node r47_compare_v2.js <scan json> <capture after> <capture before>
   For each entry: is it named, did it move, and does each predicted direction match -- final total, lifetime tax, the sum of the
   rows' spending and the sum of their shortfalls (non-Monte-Carlo); Monte Carlo plans are compared at the path level separately. */
'use strict';
const [scanFile, afterFile, beforeFile] = process.argv.slice(2);
const scan = require(scanFile), A = require(afterFile), B = require(beforeFile);
const named = new Map(scan.expanded.map((n) => [n.name, n]));
const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const sgn = (x, eps = 0.005) => (x > eps ? 'up' : x < -eps ? 'down' : 'unchanged');
let exact = true;
const lines = [];
for (const ea of A.entries) {
  const eb = B.entries.find((e) => e.name === ea.name);
  const moved = JSON.stringify(ea.result) !== JSON.stringify(eb.result), n = named.get(ea.name);
  if (!moved && !n) continue;
  const ra = ea.result.rows || [], rb = eb.result.rows || [];
  const m = { total: (ra.length ? ra[ra.length - 1].total : 0) - (rb.length ? rb[rb.length - 1].total : 0), tax: (ea.result.lifetimeTaxes || 0) - (eb.result.lifetimeTaxes || 0),
    spending: sum(ra, 'spending') - sum(rb, 'spending'), shortfall: sum(ra, 'shortfall') - sum(rb, 'shortfall'), rowsMoved: JSON.stringify(ra) !== JSON.stringify(rb) };
  let verdict;
  if (!n) { verdict = 'MOVED, NOT NAMED'; exact = false; }
  else if (!moved) { verdict = 'NAMED, DID NOT MOVE'; exact = false; }
  else if (n.monteCarlo) verdict = 'named (Monte Carlo: path level below), moved';
  else if (n.senior) {
    const c = n.senior.classes, checks = [];
    checks.push(['final total', sgn(-c.portfolio), sgn(m.total, 0.01)]);
    if (n.senior.sumDT > 0.005) checks.push(['lifetime tax', 'up', sgn(m.tax)]);
    checks.push(['spending', c.spend > 0.005 ? 'down' : c.spend < -0.005 ? 'up' : 'unchanged', sgn(m.spending, 0.01)]);
    checks.push(['shortfall', c.shortfall > 0.005 ? 'up' : 'unchanged', sgn(m.shortfall, 0.01)]);
    const bad = checks.filter((x) => x[1] !== x[2]);
    if (bad.length) exact = false;
    verdict = (bad.length ? 'DIRECTION MISMATCH ' : 'directions match: ') + checks.map((x) => x[0] + ' ' + x[1] + (x[1] === x[2] ? '' : ' (measured ' + x[2] + ')')).join(', ') +
      (n.senior.sumDT > 0.005 ? '' : '; lifetime tax not predicted (second order), measured ' + m.tax.toFixed(2));
  } else {
    const h = n.hsaOnce[0], dollars = Math.abs(h.movedNew - h.movedOld) > 0.005;
    const ok = dollars ? m.rowsMoved : !m.rowsMoved;
    if (!ok) exact = false;
    verdict = (ok ? 'matches: ' : 'MISMATCH: ') + (dollars ? 'dollars move' : 'only the limit note moves; rows unchanged') + (m.rowsMoved ? '' : ' (measured: rows equal, limitWarnings differ: ' + (JSON.stringify(ea.result.limitWarnings) !== JSON.stringify(eb.result.limitWarnings)) + ')');
  }
  lines.push(ea.name + ' | ' + verdict + ' | measured: total ' + m.total.toFixed(2) + ', lifetime tax ' + m.tax.toFixed(2) + ', spending ' + m.spending.toFixed(2) + ', shortfall ' + m.shortfall.toFixed(2));
}
const movedCount = A.entries.filter((ea) => JSON.stringify(ea.result) !== JSON.stringify(B.entries.find((e) => e.name === ea.name).result)).length;
console.log('moved ' + movedCount + ', named ' + named.size);
lines.forEach((l) => console.log('  ' + l));
console.log(exact ? 'RESULT: the named set equals the moved set, and every predicted direction matches' : 'RESULT: NOT EXACT (see the lines above)');

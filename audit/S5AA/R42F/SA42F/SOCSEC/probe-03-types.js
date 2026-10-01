const { h, plan, run } = require('./lib.js');
const cases = {
  ssBenefit: ['abc', -100, null], spouseSS: ['abc', -50], ssClaim: ['abc', null, 61, 71], spouseClaim: ['abc', 61.5],
  ssCola: ['abc', null, -5, 50], aime: ['abc', -1, null], ssAdvanced: ['yes'], pension: ['abc', -1000], pensionCola: ['abc', -200],
  survivor: ['yes'], selfLife: ['abc'], spouseLife: ['abc'],
};
for (const [k, vals] of Object.entries(cases)) for (const v of vals) {
  const p = plan({ couple: true, age: 66, spouseAge: 64, endAge: 69, ssBenefit: 2000, spouseSS: 1000, pension: 10000, ret: { ssClaim: 67, spouseClaim: 67, survivor: true } });
  if (k === 'aime') p.retirement.ssAdvanced = true;
  p.retirement[k] = v;
  const r = run(p, true);
  const vi = r._vissues.filter(x => (x.path || '').includes(k)).map(x => x.severity + ':' + x.code);
  console.log(k, JSON.stringify(v), 'valid', r._valid, vi.join(','), '| engine', r.status, r.calculationErrorCode || '', r.rows && r.rows.length ? r.rows.map(x => x.income).slice(1).join('/') : '');
}

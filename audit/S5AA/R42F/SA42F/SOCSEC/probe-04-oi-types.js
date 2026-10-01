const { h, plan, run } = require('./lib.js');
const base = { name: 'x', type: 'pension', owner: 'self', amount: 12000, start: 66, end: 90, growth: 0, growthMode: 'fixed' };
const cases = { amount: ['abc', -5000, null], start: ['abc', null], end: ['abc', null, 50], growth: ['abc', -50], growthMode: ['bogus', 'cola', 'inflation'],
  type: ['bogus', 'annuity', 'socialSecurity', 'taxFree'], owner: ['spouse', 'bogus', 'household'], survivorPercent: ['abc', 150, -1, null] };
for (const [k, vals] of Object.entries(cases)) for (const v of vals) {
  const p = plan({ age: 66, endAge: 69, ret: {} }); p.retirement.ssBenefit = 0;
  const oi = Object.assign({}, base); oi[k] = v; p.retirement.otherIncomes = [oi];
  const r = run(p, true);
  const vi = r._vissues.filter(x => (x.path || '').includes('otherIncomes')).map(x => x.severity + ':' + x.code);
  console.log(k, JSON.stringify(v), 'valid', r._valid, vi.join(','), '| engine', r.status, r.calculationErrorCode || '', r.rows && r.rows.length ? r.rows.map(x => x.income).slice(1).join('/') : '');
}

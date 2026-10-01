const { h, plan, run } = require('./lib.js');
function go(label, streams, extra, hand) {
  const p = plan(Object.assign({ couple: true, age: 65, spouseAge: 60, endAge: 70, ret: {} }, extra || {}));
  p.retirement.ssBenefit = 0; p.retirement.spouseSS = 0;
  Object.assign(p.retirement, (extra && extra.ret2) || {});
  p.retirement.otherIncomes = streams;
  const r = run(p);
  const got = r.rows.slice(1).map(x => +x.income.toFixed(2));
  const ok = JSON.stringify(got) === JSON.stringify(hand);
  console.log((ok ? 'OK  ' : 'DIFF') + ' ' + label + ' valid ' + r._valid + ' ' + r.status + ' engine ' + got.join('/') + (ok ? '' : '  hand ' + hand.join('/')));
}
const S = (o) => Object.assign({ name: 's', owner: 'self', amount: 10000, start: 0, end: 200, growth: 0, growthMode: 'fixed' }, o);
// spouse-owned pension, spouse dies at 62.5 (self 67.5), survivor share 50%
go('spouse pension 50% J&S', [S({ type: 'pension', owner: 'spouse', survivorPercent: 50 })], { ret2: { spouseLife: 62.5 } }, [10000, 10000, 7500, 5000, 5000]);
go('spouse pension 0% (single life)', [S({ type: 'pension', owner: 'spouse', survivorPercent: 0 })], { ret2: { spouseLife: 62.5 } }, [10000, 10000, 5000, 0, 0]);
go('self SS stream ends at self death 67.5', [S({ type: 'socialSecurity' })], { ret2: { selfLife: 67.5 } }, [10000, 10000, 5000, 0, 0]);
go('spouse employment stream ends at death', [S({ type: 'employment', owner: 'spouse' })], { ret2: { spouseLife: 61.5 } }, [10000, 5000, 0, 0, 0]);
go('rental continues after death', [S({ type: 'rental', owner: 'spouse' })], { ret2: { spouseLife: 61.5 } }, [10000, 10000, 10000, 10000, 10000]);
go('spouse stream start 62 end 63.5 (spouse clock)', [S({ type: 'other', owner: 'spouse', start: 62, end: 63.5 })], {}, [0, 0, 10000, 5000, 0]);
go('fixed growth 10% from start 66', [S({ type: 'other', start: 66, growth: 10 })], {}, [0, 10000, 11000, 12100, 13310]);
go('cola growth (ssCola 10) from start 66', [S({ type: 'other', start: 66, growthMode: 'cola' })], { ret2: { ssCola: 10 } }, [0, 10000, 11000, 12100, 13310]);
go('inflation growth (10%) from plan start', [S({ type: 'other', start: 66, growthMode: 'inflation' })], { inflation: 10 }, [0, 11000, 12100, 13310, 14641]);
go('one-time at 66.5', [S({ type: 'oneTime', start: 66.5 })], {}, [0, 10000, 0, 0, 0]);

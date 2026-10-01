'use strict';
const { h, base, income } = require('./common.js');
const cases = [
  ['healthCost', -5000, { healthOn: true }], ['healthCost', '12000', { healthOn: true }], ['ltcProbability', 150, { ltcOn: true }],
  ['ltcProbability', -10, { ltcOn: true }], ['ltcYears', -3, { ltcOn: true }], ['ltcCost', -50000, { ltcOn: true }],
  ['ltcInsurance', -20000, { ltcOn: true }], ['ltcYears', 2.5, { ltcOn: true }], ['healthCost', null, { healthOn: true }],
  ['ltcCost', undefined, { ltcOn: true }], ['irmaaMagiOneYearBefore', '150000', { healthOn: true }], ['healthCost', undefined, { healthOn: true }], ['ltcProbability', null, { ltcOn: true }], ['healthCost', 12000, { healthOn: true }], ['ltcCost', 100000, { ltcOn: true }]];
for (const [k, val, on] of cases) {
  const p = base({ age: 60, endAge: 74, retireAge: 60 }); income(p, 'pension', 50000);
  Object.assign(p.advanced, { healthOn: false, healthCost: 12000, healthInflation: 0, ltcOn: false, ltcCost: 100000, ltcProbability: 25, ltcYears: 3, ltcInsurance: 0 }, on);
  if (val === undefined) delete p.advanced[k]; else p.advanced[k] = val;
  const v = h.validateScenario(structuredClone(p));
  let r; try { r = h.engine.runPlan(structuredClone(p)); } catch (e) { r = { status: 'THROW ' + e.message.slice(0, 80) }; }
  const sp = r.rows ? r.rows.slice(1).reduce((a, x) => a + x.spending, 0) : null;
  console.log(k, JSON.stringify(val), '| valid', v.valid, v.issues.filter(i => i.path && i.path.indexOf(k) >= 0).map(i => i.severity + ':' + i.code).join(','), '| engine', r.status, r.calculationErrorCode || '', 'sum spending', sp == null ? '' : sp.toFixed(2));
}

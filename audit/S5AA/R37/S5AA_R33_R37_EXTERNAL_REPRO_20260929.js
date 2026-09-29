'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
if (!root) throw new Error('Pass the frozen source checkout path');
const shell = fs.readFileSync(path.join(root, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(shell.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
require(path.join(root, 'tools', 'capture-baseline.js')).installDebtModules();
const engine = require(path.join(root, 'src', 'engine.js'));
const defaults = eval('(' + shell.match(/var defaultPlan=(\{.*?\});/)[1] + ')');
function base(retireAge, account) {
  const p = JSON.parse(JSON.stringify(defaults));
  p.setupComplete = true;
  Object.assign(p.profile, { age: 45, retireAge, endAge: 47, spouseOn: false, filing: 'single' });
  Object.assign(p.assumptions, { method: 'simple', returnRate: 0, inflation: 0, fee: 0, volatility: 0 });
  Object.assign(p.employment, { salary: 100000, spouseSalary: 0, growth: 0, contributionStop: retireAge });
  Object.assign(p.retirement, { strategy: 'fixedNominal', spending: 0, dividendOn: false, stages: [], expenses: [], otherIncomes: [], pension: 0, ssBenefit: 0, spouseSS: 0, survivor: false, selfLife: 95 });
  Object.assign(p.advanced, { rmdOn: false, healthOn: false, conversionOn: false, transferOn: false });
  p.accounts = [Object.assign({ id: 'k', name: '401(k)', type: 'traditional401k', taxClass: 'preTax', owner: 'self', balance: 0, contribution: 6000, contributionMode: 'amount', annualChange: 0, annualChangeMode: 'amount', frequency: 1, changeTiming: 'year', futureChanges: [], allocation: {}, matchOn: true, matchRate: 100, matchCap: 6, profitShare: 0, vesting: 20, priority: 1 }, account || {})];
  return p;
}
// Entered vesting is 20%, interpreted by R35 as two completed service years.
// With 0% return and no withdrawals, the scheduled vested share applies to
// every employer dollar earned before separation, including its partial row.
for (const [retireAge, expected] of [[45.5, 3600], [46, 8400], [46.5, 12600]]) {
  const result = engine.runPlan(base(retireAge));
  if (result.status !== 'ok') throw new Error('Run failed: ' + result.status);
  const actual = result.rows.at(-1).preTax;
  console.log(JSON.stringify({ retireAge, expected, actual, excess: actual - expected,
    rows: result.rows.map(r => ({ age: r.age, preTax: r.preTax, contributions: r.contributions })) }));
}


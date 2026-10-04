'use strict';
// Independent focused simulations. No source files or reference captures are changed.
// Usage: node <this file> <source-tree> <output.json>
// Expectations are arithmetic/statutory or metamorphic checks, declared before execution.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const root = path.resolve(process.argv[2] || '.'), output = process.argv[3];
const selected = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',')) : null;
const L = require(path.join(root, 'audit/S5AA/R40/S5AA_R40_CONSERVATION_GRID/lib.js'));
const E = L.h.engine, validate = L.h.validateScenario;
const a = L.account, b = (o = {}) => L.basePlan({ dividendOn: true, dividendYield: 0, ...o });
const row = (r, age) => r.rows.find(x => Math.abs(x.age - age) < 1e-8);
const stream = (id, type, amount, owner = 'self', start = 0, end = 120) =>
  ({ id, name: id, type, amount, owner, start, end, growth: 0, growthMode: 'fixed' });
const cases = [];
let current;
function check(label, actual, expected, tolerance = 0.01) {
  const passed = typeof expected === 'number' ? Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance : JSON.stringify(actual) === JSON.stringify(expected);
  current.checks.push({ label, actual, expected, tolerance: typeof expected === 'number' ? tolerance : undefined, passed });
}
function run(p) {
  const v = validate(structuredClone(p)), r = E.runPlan(structuredClone(p));
  current.executions.push({ plan: p, validatorValid: v.valid, validatorIssues: v.issues, result: r });
  check('valid supported input', v.valid, true); check('engine status', r.status, 'ok');
  if (r.status !== 'ok') throw new Error('engine refused the simulation');
  const bad = (r.issues || []).filter(x => /QUOTE_SETTLEMENT_UNVERIFIED|TAX_SETTLEMENT_MISMATCH|NONFINITE_SETTLEMENT|ROW_INVARIANT/.test(x.code));
  check('settlement and finite-value safeguards silent', bad.map(x => x.code), []);
  return r;
}
function simulation(id, round, name, rationale, fn) {
  if (selected && !selected.has(id)) return;
  current = { id, round, name, rationale, checks: [], executions: [] };
  try { fn(); } catch (e) { current.error = e.message; }
  current.verdict = !current.error && current.checks.every(x => x.passed) ? 'PASS' : 'FAIL'; cases.push(current);
}
simulation('S01', 46, 'Shared shocks survive account splitting', 'A common annual market process must conserve the household trajectory when identical holdings are divided.', () => {
  function plan(n) { const p = b({ age: 40, retireAge: 70, endAge: 50, spending: 0, accounts: Array.from({ length: n }, (_, i) => a('r' + i, 'rothIRA', 500000 / n)) });
    Object.assign(p.assumptions, { method: 'monteCarlo', seed: 20261004, runs: 500, returnRate: 5, volatility: 14 });
    p.advanced.assetsOn = false; p.employment.contributionStop = 40; return p; }
  const one = run(plan(1)), many = run(plan(5));
  for (let i = 1; i < one.rows.length; i++) for (const k of ['total', 'q10', 'q90']) check('age ' + one.rows[i].age + ' ' + k, many.rows[i][k], one.rows[i][k]);
  check('success unchanged', many.success, one.success);
});
simulation('S02', 46, 'Negative correlation at and below the PSD boundary', 'Five equal-volatility equally held classes at rho=-1/4 have zero aggregate shock; below that boundary no covariance matrix exists.', () => {
  const ids = ['one', 'two', 'three', 'four', 'five'];
  const p = b({ age: 40, retireAge: 70, endAge: 43, spending: 0, accounts: [a('r', 'rothIRA', 300000, { allocation: Object.fromEntries(ids.map(k => [k, 20])) })] });
  Object.assign(p.assumptions, { method: 'monteCarlo', runs: 256, seed: 314159 });
  Object.assign(p.advanced, { assetsOn: true, correlation: -0.25, assetClasses: ids.map(id => ({ id, name: id, returnRate: 5, volatility: 12 })) });
  p.employment.contributionStop = 40; const r = run(p), last = r.rows.at(-1);
  check('three-year median', last.total, 300000 * 1.05 ** 3); check('zero random spread', last.q90 - last.q10, 0);
  const q = structuredClone(p); q.advanced.correlation = -0.251;
  const v = validate(q), refused = E.runPlan(q);
  current.refusedControl = { validator: v, engine: refused };
  check('validator refuses impossible correlation', v.issues.some(x => x.code === 'INFEASIBLE_CORRELATION' && x.severity === 'ERROR'), true);
  check('engine refusal code', refused.calculationErrorCode, 'SCENARIO_INFEASIBLE_CORRELATION');
});
simulation('S03', 46, 'Household reserve applies to small accounts and caps at 100%', 'A $50,000 reserve on $200,000 is 25% in each account: .75*.08+.25*.03=.0675.', () => {
  const make = n => { const p = b({ age: 65, endAge: 68, spending: 25000, returnRate: 8, accounts: Array.from({ length: n }, (_, i) => a('r' + i, 'rothIRA', 200000 / n)) }); Object.assign(p.advanced, { assetsOn: false, reserveOn: true, reserveYears: 2 }); return p; };
  const small = make(40); check('small account reserve return', E.accountReturnForPeriod(small.accounts[0], small, 65, 0, 0, null, 200000, false, 25000), .0675, 1e-12);
  check('reserve exceeds portfolio', E.accountReturnForPeriod(small.accounts[0], small, 65, 0, 0, null, 30000, false, 25000), .03, 1e-12);
  const one = run(make(1)), many = run(small); check('split portfolio closing value', many.rows.at(-1).total, one.rows.at(-1).total);
});
simulation('S04', 47, 'Senior deduction and Arizona subtraction expire together', 'On $60,000 pension: 2026 federal 4,054 + AZ 895=4,949; 2029 federal 4,774 + AZ 1,045=5,819.', () => {
  const r = run(b({ age: 65, endAge: 69, pension: 60000, spending: 0, accounts: [a('r', 'rothIRA', 100000)] }));
  check('2026 tax', row(r, 66).taxes, 4949); check('2029 tax', row(r, 69).taxes, 5819); check('sunset difference', row(r, 69).taxes - row(r, 68).taxes, 870);
});
simulation('S05', 47, 'High-earner Roth catch-up and no-Roth plan', 'A $32,500 deferral at 55 splits into $24,500 pre-tax and $8,000 Roth; removing plan Roth availability redirects the excess.', () => {
  const p = b({ age: 55, retireAge: 60, endAge: 56, salary: 175000, spending: 0, accounts: [a('k', 'traditional401k', 0, { contribution: 32500, priorYearFicaWages: 175000 }), a('cash', 'taxable', 0)] }); p.employment.contributionStop = 60;
  const r = run(p); check('pre-tax amount', row(r, 56).preTax, 24500); check('Roth amount', row(r, 56).roth, 8000); check('tax on lawful split', row(r, 56).taxes, 41601.5);
  p.accounts[0].planOffersRoth = false; const q = run(p); check('no Roth contribution', row(q, 56).roth, 0); check('redirected amount', row(q, 56).taxable, 8000);
});
simulation('S06', 47, 'Unused IRA room must not remove two carried excesses', 'First-year combined excess is $12,500 ($20,000-$7,500). One following-year $7,500 room leaves $5,000, carrying $300 excise.', () => {
  const p = b({ age: 40, retireAge: 45, endAge: 42, salary: 50000, spending: 0, accounts: [a('t', 'traditionalIRA', 0, { contribution: 10000, futureChanges: [{ age: 41, mode: 'set', value: 0 }] }), a('r', 'rothIRA', 0, { contribution: 10000, futureChanges: [{ age: 41, mode: 'set', value: 0 }] }), a('cash', 'taxable', 100000)] });
  p.employment.contributionStop = 45; p.limitPolicy = 'warn'; const r = run(p);
  check('first-year excise booked for true-up', row(r, 41).taxOutstanding, 750);
  check('second-year carried excise', row(r, 42).taxOutstanding, 300);
});
simulation('S07', 47, 'Spouse wages cannot shelter a business-owner deferral from QBI', 'Self profit $80,000, spouse wages $100,000, self workplace deferral $20,000. QBI=80,000-5,651.82-20,000; deduction=10,869.636. Total tax=35,912.62418.', () => {
  const p = b({ couple: true, age: 40, spouseAge: 40, retireAge: 60, endAge: 41, salary: 0, spouseSalary: 100000, spending: 0, otherIncomes: [stream('business', 'selfEmployment', 80000)], accounts: [a('k', 'traditional401k', 0, { contribution: 20000 })] });
  p.employment.contributionStop = 60; p.profile.spouseRetireAge = 60; const r = run(p);
  check('federal AGI', row(r, 41).federalAgi, 154348.18); check('tax with business-attributable plan deduction', row(r, 41).taxes, 35912.62418);
});
simulation('S08', 47, 'HSA stops at an entered Medicare date inside a row', 'Medicare at 64.25 allows a quarter-year of a $5,400 HSA contribution, then none.', () => {
  const p = b({ age: 64, retireAge: 70, endAge: 66, salary: 90000, spending: 0, accounts: [a('h', 'hsa', 0, { contribution: 5400 })] }); p.employment.contributionStop = 70; p.profile.medicareStartAge = 64.25;
  const r = run(p); check('quarter-year contribution', row(r, 65).hsa, 1350); check('no later HSA contribution', row(r, 66).hsa, 1350);
});
simulation('S09', 48, 'Medicare inflation and entered Part D premium', 'Annual charge is 202.90*12+283+100*12=3,917.80; entered Medicare inflation 3% gives 4,035.334 next year.', () => {
  const p = b({ age: 65, endAge: 67, spending: 0, healthOn: true, accounts: [a('r', 'rothIRA', 100000)] }); Object.assign(p.advanced, { medicareInflation: 3, partDPremium: 100, healthInflation: 9, irmaaMagiTwoYearsBefore: 0, irmaaMagiOneYearBefore: 0 });
  const r = run(p); check('first charge', row(r, 66).spending, 3917.8); check('independent Medicare growth', row(r, 67).spending, 4035.334);
});
simulation('S10', 48, 'Inherited IRA rollover preserves projection-created basis', 'A $7,500 nondeductible contribution is inherited and then rolled into the survivor IRA. Its entire later distribution is basis; with a $30,000 pension AGI must be $30,000.', () => {
  const p = b({ couple: true, age: 45, spouseAge: 45, retireAge: 46, endAge: 49, salary: 200000, spending: 0, manualOrder: 'preTax,taxable,roth,hsa', accounts: [a('deceased', 'traditionalIRA', 0, { contribution: 7500, priority: 1 }), a('survivor', 'traditionalIRA', 0, { owner: 'spouse', priority: 2 }), a('coverage', 'roth401k', 0, { contribution: 1, priority: 8 }), a('cash', 'taxable', 5000, { priority: 9 })], otherIncomes: [stream('pension', 'pension', 30000, 'spouse', 48, 49)] });
  p.employment.contributionStop = 46; p.retirement.selfLife = 46.5; p.retirement.expenses = [{ age: 48, amount: 37500 }]; p.advanced.penaltyException = true;
  Object.assign(p.advanced, { transferOn: true, transferFrom: 'deceased', transferTo: 'survivor', transferAmount: 7500, transferAge: 47.5 });
  const r = run(p); check('AGI after basis distribution', row(r, 49).federalAgi, 30000); check('pension-only tax', row(r, 49).taxes, 1767.5);
});
simulation('S11', 48, 'Community-property basis reset reaches the survivor account', 'Two $80,000 accounts with $20,000 basis and a $40,000 joint basis reset in full under the chosen community-property assumption.', () => {
  const p = b({ couple: true, age: 70, spouseAge: 70, endAge: 72, spending: 0, accounts: [a('joint', 'taxable', 80000, { owner: 'joint', basisPct: 50 }), a('self', 'taxable', 80000, { basisPct: 25 }), a('spouse', 'taxable', 80000, { owner: 'spouse', basisPct: 25 })] }); p.retirement.selfLife = 70.5; p.profile.communityProperty = true;
  const t = L.runTapped(p); check('tap output neutral', t.valid, true); current.taps = t.taps; current.executions.push({ plan: p, result: t.r });
  check('basis after death', t.taps.find(x => x.age === 71).balances.map(x => x.basis), [80000, 80000, 80000]);
});
simulation('S12', 48, 'Arizona capital-gain share prices the funding quote', 'With 50% basis and $80,000 spending, W=(80,000-402.50)/(1-.025*(.5-.125)) for a 100% eligible gain share; no share uses denominator .9875.', () => {
  const p = b({ age: 60, endAge: 61, spending: 80000, accounts: [a('t', 'taxable', 1000000, { basisPct: 50 })] }); p.retirement.azPost2011GainShare = 100;
  check('eligible-gain withdrawal', row(run(p), 61).withdrawals, 79597.5 / .990625); p.retirement.azPost2011GainShare = 0; check('no-share control withdrawal', row(run(p), 61).withdrawals, 79597.5 / .9875);
});
simulation('S13', 49, 'Flexibility floor and below-floor stage', 'A $24,000 floor binds after a down year. A stage setting $15,000 stays there without a further cut or an upward clamp.', () => {
  const p = b({ age: 65, endAge: 67, spending: 0, returnRate: -15, strategy: 'floorCeiling', flexibility: 20, accounts: [a('r', 'rothIRA', 300000)] }); Object.assign(p.retirement, { floor: 24000, ceiling: 80000, withdrawalRate: 4 });
  check('floor holds', row(run(p), 67).spending, 24000); p.retirement.stages = [{ start: 65, end: 70, mode: 'amount', value: 15000, growthMode: 'none' }]; check('below-floor stage holds', row(run(p), 67).spending, 15000);
});
simulation('S14', 49, 'Fractional LTC onset conserves its weighted duration', 'At 72.25, a two-year $60,000 cost weighted at 40% gives 18,000, 24,000, 6,000 in the three affected rows.', () => {
  const p = b({ age: 70, endAge: 76, spending: 0, accounts: [a('r', 'rothIRA', 500000)] }); Object.assign(p.advanced, { ltcOn: true, ltcOnsetAge: 72.25, ltcCost: 60000, ltcYears: 2, ltcProbability: 40, healthInflation: 0 });
  const r = run(p); for (const [age, expected] of [[72, 0], [73, 18000], [74, 24000], [75, 6000], [76, 0]]) check('LTC row ' + age, row(r, age).spending, expected);
});
simulation('S15', 49, 'PMI midpoint, override, and forced-payoff disclosure', 'A 30-year loan with 15.5 years left reaches midpoint at 60.5: seven months of $80 PMI then none. An override at 61.5 gives 960 then 480.', () => {
  const p = b({ age: 60, endAge: 63, spending: 0, accounts: [a('r', 'rothIRA', 500000)] }); p.advanced.debts = [{ id: 'm', name: 'm', owner: 'household', type: 'mortgage', balance: 200000, rate: 0, rateType: 'fixed', paymentMonthly: 1000, payoffAge: 62, includePayment: false, includeHousingCosts: true, pmiMonthly: 80, annualPropertyTax: 0, annualInsurance: 0, hoaMonthly: 0, mortgageType: 'conventional', loanTermYears: 30, remainingTermYears: 15.5 }];
  const r = run(p); check('midpoint PMI', row(r, 61).spending, 560); check('PMI stops', row(r, 62).spending, 0); const warning = validate(p).issues.find(x => x.code === 'DEBT_PAYOFF_RESIDUAL'); check('residual disclosure present', !!warning, true);
  const V = require(path.join(root, 'src/scenario-validator.js')); check('residual amount', V.debtPayoffResidual(p.advanced.debts[0], 60, 63), 176000);
  p.advanced.debts[0].pmiEndAge = 61.5; const q = run(p); check('override first PMI', row(q, 61).spending, 960); check('override final PMI', row(q, 62).spending, 480);
});
simulation('S16', 50, 'Roth IRA basis then earnings with tax gross-up', 'At 50, basis $25,000 covers the first $20,000. Next row uses $5,000 basis and earnings E=15,000+x; only 10% applies until E<16,100 is crossed, requiring bracket-aware gross-up.', () => {
  const p = b({ age: 50, endAge: 52, spending: 20000, manualOrder: 'roth,taxable,preTax,hsa', accounts: [a('r', 'rothIRA', 100000, { contributionBasis: 25000 })] });
  // E crosses 16,100: x=.225*(15,000+x)-2,012.50 -> x=1,362.50/.775.
  const r = run(p); check('basis-only first tax', row(r, 51).taxes, 0); check('second-row tax', row(r, 52).taxes, 1362.5 / .775); check('closing Roth', row(r, 52).roth, 60000 - 1362.5 / .775);
});
simulation('S17', 50, 'Roth conversion clocks and final basis settlement', 'An old taxable conversion is free after five tax years. A same-year fully nondeductible conversion must be nontaxable in the Roth ledger immediately; a later $5,000 distribution has no penalty.', () => {
  const p = b({ age: 50, endAge: 56, spending: 0, manualOrder: 'roth,taxable,preTax,hsa', accounts: [a('i', 'traditionalIRA', 30000), a('r', 'rothIRA', 0), a('cash', 'taxable', 10000, { priority: 1 })] });
  Object.assign(p.advanced, { conversionOn: true, conversionAmount: 30000 }); p.retirement.expenses = [{ age: 55, amount: 10000 }];
  const r = run(p); check('traditional IRA fully converted', row(r, 51).preTax, 0); check('conversion included in AGI', row(r, 51).federalAgi, 30000); check('expired-conversion withdrawal tax', row(r, 56).taxes, 0); check('withdrawal', row(r, 56).withdrawals, 10000);
  const q = b({ age: 45, retireAge: 46, endAge: 47, salary: 200000, spending: 0, manualOrder: 'taxable,roth,preTax,hsa', accounts: [a('i', 'traditionalIRA', 0, { contribution: 7500 }), a('r', 'rothIRA', 0, { priority: 1 }), a('active', 'traditional401k', 0, { contribution: 1, priority: 8 }), a('cash', 'taxable', 20000)] });
  q.employment.contributionStop = 46; Object.assign(q.advanced, { conversionOn: true, conversionAmount: 7500, conversionStartAge: 45, transferOn: true, transferFrom: 'r', transferTo: 'cash', transferAmount: 5000, transferAge: 46 });
  const s = run(q); check('conversion settlement excludes nondeductible $7,500', row(s, 46).federalAgi, 199999); check('nontaxable conversion distribution has no penalty', row(s, 47).taxSettled, 0);
  q.advanced.penaltyException = true; check('exception control isolates the additional tax', row(run(q), 47).taxSettled, 0);
});
simulation('S18', 50, 'Prior first-year income consumes the deduction and brackets', 'Start 60.5, prior ordinary income $60,000, half-year pension $20,000. Federal tax 8,770-5,020=3,750, AZ 500 -> 4,250; a whole-row control ignores the partial-row input.', () => {
  const p = b({ age: 60.5, endAge: 61, pension: 40000, spending: 0, accounts: [a('r', 'rothIRA', 100000)] }); p.profile.priorIncomeThisYear = 60000;
  const r = run(p); check('partial-year marginal income tax', row(r, 61).taxes, 4250);
  const q = b({ age: 60, endAge: 61, pension: 40000, spending: 0, accounts: [a('r', 'rothIRA', 100000)] }); q.profile.priorIncomeThisYear = 60000; check('whole-row control tax', row(run(q), 61).taxes, 3217.5);
});
simulation('S19', 51, 'One Medicare date prices both premiums and HSA eligibility', 'Start 64, retire 64.5, Medicare at 64.75: a quarter-year pre-Medicare $12,000 plus a quarter-year $3,185.68 Medicare is $3,796.42. HSA covers the working half-year.', () => {
  const p = b({ age: 64, retireAge: 64.5, endAge: 66, salary: 80000, spending: 0, healthOn: true, accounts: [a('h', 'hsa', 0, { contribution: 5400 }), a('r', 'rothIRA', 100000)] }); p.profile.medicareStartAge = 64.75; Object.assign(p.advanced, { healthCost: 12000, healthInflation: 0, medicareInflation: 0, irmaaMagiTwoYearsBefore: 0, irmaaMagiOneYearBefore: 0 });
  const r = run(p); check('partial health cost', row(r, 65).spending, 3796.42); check('HSA working half', row(r, 65).contributions, 2700); check('following Medicare charge', row(r, 66).spending, 3185.68);
  check('HSA no new deposits after Medicare', row(r, 66).contributions, 0);
});
simulation('S20', 51, 'Streams count as working pay net of income and payroll tax', 'Salary $30,000 + job $12,000 yields $35,279.50 net; $36,000 debt leaves $720.50 short. Optimizer reads the first Roth dollar: basis weight 0, exposed earnings 75.', () => {
  const p = b({ age: 50, retireAge: 55, endAge: 51, salary: 30000, spending: 0, accounts: [a('r', 'rothIRA', 100000, { contributionBasis: 10000 })], otherIncomes: [stream('job', 'employment', 12000, 'self', 50, 55)] });
  p.advanced.debts = [{ id: 'm', name: 'm', owner: 'household', type: 'mortgage', balance: 500000, rate: 0, rateType: 'fixed', paymentMonthly: 3000, payoffAge: 90, includePayment: true, includeHousingCosts: false }];
  const r = run(p), issue = r.issues.find(x => x.code === 'WORKING_YEARS_NOT_FUNDED_BY_PAY'); check('working shortfall', issue && issue.state.shortfall, 720.5);
  const led = E.newRothLedger(p, p.accounts, []); check('basis next-dollar weight', E.rothNextDollarWeight(p, 50, p.accounts, led, 0), 0); led.self.basis = 0; check('earnings next-dollar weight', E.rothNextDollarWeight(p, 50, p.accounts, led, 0), 75);
});
const result = { sourceSha: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), node: process.version, platform: process.platform, simulations: cases.length, passed: cases.filter(x => x.verdict === 'PASS').length, failed: cases.filter(x => x.verdict === 'FAIL').length, cases };
if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(result, null, 2) + '\n');
for (const c of cases) console.log(c.id + ' ' + c.verdict + ' ' + c.name + (c.error ? ' ERROR ' + c.error : '') + '\n' + c.checks.filter(x => !x.passed).map(x => '  ' + x.label + ': expected ' + JSON.stringify(x.expected) + ', got ' + JSON.stringify(x.actual)).join('\n'));
console.log(JSON.stringify({ sourceSha: result.sourceSha, simulations: result.simulations, passed: result.passed, failed: result.failed }));
process.exitCode = result.failed ? 1 : 0;

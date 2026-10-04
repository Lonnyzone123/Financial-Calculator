/* S5AA R53 (ChatGPT's R51F-01; the owner's decision of 2026-10-04: "a monthly test") -- THE GRACE YEAR'S NON-SERVICE MONTHS.
 *
 * The owner's rule:
 * - In an owner's grace year (the row they stop working in), each benefit month is a NON-SERVICE month when that owner's wages in
 *   the month are at or below the monthly exempt amount -- 1/12 of the annual exempt amount (20 CFR 404.430(a)(1)): $24,480 / 12 =
 *   $2,040 in 2026 before the year of full retirement age (404.430(a)(2)(i)); in the year of full retirement age, for the months
 *   before it, $65,160 / 12 = $5,430 (404.430(a)(2)(ii)). The engine's own indexed figure is used.
 * - "Wages in the month" are the owner's salary until their retirement date plus their dated employment streams.
 * - Self-employment: any self-employment profit in a month counts as substantial services, so that month is not protected. A cautious,
 *   disclosed approximation: the plan has no hours input (404.435(c), (d) presume self-employment services until shown otherwise).
 * - Kept: the annual test in later years and in service months, the family withholding allocation (POMS RS 02501.095, R42), the
 *   adjustment-of-reduction-factor credits and the year of full retirement age.
 * Law: 20 CFR 404.435(a)(7) -- no deduction for a non-service month in the grace year, "even if there are no excess earnings in the
 * year" -- and (b)(1), Example 1 (a worker who retires in April with $15,000 earned and works part time below the monthly amount is
 * paid May-December); 20 CFR 404.430(a); 20 CFR 404.410(a) (5/9 of 1% for each of the first 36 early months, 5/12 after).
 *
 * The plans (R51F's F01-F05 shape): age 65, retirement and the claim at 65.5, end 66; salary $50,000 (so $25,000 earned), a full
 * retirement age benefit of $2,000 a month, no COLA; full retirement age 67 (born 1961). 18 early months: $2,000 x (1 - 18 x 5/900)
 * = $1,800 a month, six months = $10,800 a year. Returns, inflation, spending and dividends are 0; $100,000 in a Roth IRA.
 * Rows are labelled by their closing age: the year 65-66 is the row at 66. Social Security is read as the row's income less the
 * wages and stream cash it holds. Every expected figure is hand-derived; the derivation sits beside each case.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const L = require(path.join(__dirname, '..', 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const engine = L.h.engine;
const { validateScenario } = require(path.join(__dirname, '..', 'src', 'scenario-validator.js'));

// Each figure is its own subtest, so a failing figure does not hide the next one (the witness run records every pre-repair figure).
const near = (t, actual, expected, label) => t.test(label, () => assert.ok(Math.abs(actual - expected) < 0.01, label + ': ' + actual + ' where ' + expected + ' is right'));
function run(p) {
  const v = validateScenario(structuredClone(p));
  assert.equal(v.valid, true, JSON.stringify(v.issues.filter((i) => i.severity === 'ERROR')));
  const r = engine.runPlan(structuredClone(p));
  assert.equal(r.status, 'ok', r.calculationErrorCode);
  return r;
}
const at = (r, age) => { const row = r.rows.find((x) => Math.abs(x.age - age) < 1e-9); assert.ok(row, 'row ' + age); return row; };
const job = (amount, start, end, owner, type) => ({ id: 'job' + start + '-' + end + '-' + amount, name: 'Job', type: type || 'employment', owner: owner || 'self', amount, start, end, growth: 0, growthMode: 'fixed' });
// The R51F grace plan. o: { salary, spouse (the worker is the spouse), retire, claim, age, end, streams }.
function gracePlan(o = {}) {
  const spouse = !!o.spouse, age = o.age ?? 65, retire = o.retire ?? 65.5, claim = o.claim ?? retire;
  const p = L.basePlan({ dividendOn: true, dividendYield: 0, age, spouseAge: o.spouseAge ?? age, couple: spouse || !!o.couple, retireAge: retire,
    endAge: o.end ?? age + 1, salary: spouse ? (o.selfSalary ?? 0) : (o.salary ?? 50000), spouseSalary: spouse ? (o.salary ?? 50000) : (o.spouseSalary ?? 0),
    spending: 0, ssBenefit: spouse ? (o.selfSS ?? 0) : 2000, spouseSS: spouse ? 2000 : (o.spouseSS ?? 0), accounts: [L.account('r', 'rothIRA', 100000)] });
  p.profile.rothFirstContributionYear = 2000;
  p.retirement.ssCola = 0;
  if (spouse) { p.profile.spouseRetireAge = retire; p.retirement.spouseClaim = claim; } else p.retirement.ssClaim = claim;
  if (o.spouseClaim !== undefined) p.retirement.spouseClaim = o.spouseClaim;
  if (o.selfClaim !== undefined) p.retirement.ssClaim = o.selfClaim;
  p.retirement.otherIncomes = o.streams || [];
  return p;
}
const ss = (r, rowAge, cashBesideSs) => at(r, rowAge).income - cashBesideSs;

// --- R51F's five witnesses ------------------------------------------------------------------------------------------------------
test('R53 F01: a job that ends at the claim protects all six benefit months -- $10,800 (R51F: $5,540)', async (t) => {
  // Stream $20,000 a year, 65-65.5: $10,000 earned, none in a benefit month. Salary stops at 65.5. Months 65.5-66: wages $0 <= $2,040,
  // non-service: no deduction (404.435(a)(7)). Wages 25,000 + 10,000 = 35,000. SS = 6 x 1,800 = 10,800.
  // Pre-R53: the stream switched the grace year off; (35,000 - 24,480) / 2 = 5,260 withheld, 5,540 paid.
  await near(t, ss(run(gracePlan({ streams: [job(20000, 65, 65.5)] })), 66, 35000), 10800, 'F01 Social Security');
});

test('R53 F02: $1,000 a month of wages after the claim -- six $1,800 checks, the tax and the closing balance follow', async (t) => {
  // Stream $12,000 a year, 65-66: $1,000 in each benefit month, <= $2,040, so all six are non-service months. SS 10,800.
  // AGI: wages 37,000; provisional 37,000 + 5,400 = 42,400; taxable SS = min(.85 x 10,800 = 9,180, min(5,400, 4,500) + .85 x 8,400 =
  // 11,640) = 9,180 (IRC 86). AGI 46,180. Deductions 16,100 + 2,050 (65+) + 6,000 (senior, MAGI under 75,000) = 24,150; taxable 22,030;
  // federal 1,240 + .12 x 9,630 = 2,395.60. Arizona (the declared 2026 model): 2.5% x (37,000 - 16,100 - 2,100 - 6,000) = 320. Payroll
  // 7.65% x 37,000 = 2,830.50. Total 5,546.10. Closing balance (Q59: the wage-only tax on the $25,000 salary, 85 + 20 + 1,912.50 =
  // 2,017.50, is the salary's): 100,000 + 12,000 + 10,800 - (5,546.10 - 2,017.50) = 119,271.40. (R51F: 4,540 / 4,907.58 / 113,649.92.)
  const r = run(gracePlan({ streams: [job(12000, 65, 66)] }));
  await near(t, ss(r, 66, 37000), 10800, 'F02 Social Security');
  await near(t, at(r, 66).taxSettled, 5546.10, 'F02 settled tax');
  await near(t, at(r, 66).total, 119271.40, 'F02 closing portfolio');
});

test('R53 F03: the same on the spouse\'s clock and wages (MFJ) -- $10,800 (R51F: $4,540)', async (t) => {
  // The spouse is the worker: $50,000 salary to their own 65.5, the claim at 65.5, $12,000 stream; the self has no salary or benefit.
  await near(t, ss(run(gracePlan({ spouse: true, streams: [job(12000, 65, 66, 'spouse')] })), 66, 37000), 10800, 'F03 spouse Social Security');
});

test('R53 F04 (control): $2,500 a month is above the monthly amount -- every benefit month is a service month, all withheld', async (t) => {
  // $30,000 a year = $2,500 a month > $2,040: six service months, the cap is all 10,800. Annual: (25,000 + 30,000 - 24,480) / 2 =
  // 15,260 >= 10,800, so 0 is paid, as before.
  await near(t, ss(run(gracePlan({ streams: [job(30000, 65, 66)] })), 66, 55000), 0, 'F04 Social Security');
});

test('R53 F05 (control): no stream -- six checks, as before', async (t) => {
  await near(t, ss(run(gracePlan()), 66, 25000), 10800, 'F05 Social Security');
});

// --- The monthly amount: at it and just above it --------------------------------------------------------------------------------
test('R53: wages exactly at the monthly amount ($2,040) are a non-service month; $2,041 is not', async (t) => {
  // At: $24,480 a year = $2,040 a month, "not greater than" the monthly exempt amount (404.435(a)(7)(ii)): six non-service months,
  // 10,800. Pre-R53: (25,000 + 24,480 - 24,480) / 2 = 12,500 >= 10,800 withheld, 0 paid.
  await near(t, ss(run(gracePlan({ streams: [job(24480, 65, 66)] })), 66, 49480), 10800, 'at the limit');
  // Just above (control): $24,492 = $2,041 a month: service months; (49,492 - 24,480) / 2 = 12,506 -> all withheld, 0, as before.
  await near(t, ss(run(gracePlan({ streams: [job(24492, 65, 66)] })), 66, 49492), 0, 'just above');
});

test('R53: with a smaller salary the same pair shows the annual test kept in service months', async (t) => {
  // Salary $20,000 (so $10,000 earned to 65.5). At the limit: 10,000 + 24,480 = 34,480; non-service months, 10,800 paid.
  // Pre-R53: (34,480 - 24,480) / 2 = 5,000 withheld, 5,800 paid.
  await near(t, ss(run(gracePlan({ salary: 20000, streams: [job(24480, 65, 66)] })), 66, 34480), 10800, 'at the limit, smaller salary');
  // Just above (control): 10,000 + 24,492 = 34,492; (34,492 - 24,480) / 2 = 5,006 withheld from the six service months; 5,794 paid,
  // as before.
  await near(t, ss(run(gracePlan({ salary: 20000, streams: [job(24492, 65, 66)] })), 66, 34492), 5794, 'just above, smaller salary');
});

// --- Boundaries inside a year, several streams, both owners ----------------------------------------------------------------------
test('R53: retirement at 65.25, the claim at 65.5 and a job ending at 65.75 -- three service months, three spared', async (t) => {
  // Salary to 65.25: 12,500. Stream $36,000 a year 65-65.75: 27,000, $3,000 a month > $2,040. Benefit months 65.5-65.75 are service
  // months (3 x 1,800 = 5,400, the most that may be withheld); 65.75-66 are non-service. Annual: (39,500 - 24,480) / 2 = 7,510.
  // Withheld min(10,800, 7,510, 5,400) = 5,400; paid 5,400. Pre-R53: grace off, 10,800 - 7,510 = 3,290.
  await near(t, ss(run(gracePlan({ retire: 65.25, claim: 65.5, streams: [job(36000, 65, 65.75)] })), 66, 39500), 5400, 'inside-year boundaries');
});

test('R53: several streams -- their wages in a month are summed, and each start and end is a boundary', async (t) => {
  // Two $12,000 streams over the year: $2,000 a month <= $2,040, non-service; 10,800. Pre-R53: (49,000 - 24,480) / 2 = 12,260 -> 0.
  await near(t, ss(run(gracePlan({ streams: [job(12000, 65, 66), job(12000, 65, 66, 'self')].map((s, i) => Object.assign(s, { id: 'j' + i })) })), 66, 49000), 10800, 'two streams');
  // $30,000 a year 65-65.75 ($2,500 a month) then $12,000 a year 65.75-66 ($1,000): service months 65.5-65.75 (cap 5,400), non-service
  // after. Wages 25,000 + 22,500 + 3,000 = 50,500; (50,500 - 24,480) / 2 = 13,010; withheld min(10,800, 13,010, 5,400) = 5,400 -> 5,400.
  // Pre-R53: 0.
  await near(t, ss(run(gracePlan({ streams: [job(30000, 65, 65.75), job(12000, 65.75, 66)] })), 66, 50500), 5400, 'one stream follows another');
});

test('R53: both owners, each with $1,000 a month after their own claim -- $10,800 each (pre-R53: $4,540 each)', async (t) => {
  // MFJ, both 65, each retires and claims at 65.5 with a $2,000 benefit and a $12,000 stream; equal benefits carry no spousal part.
  // Wages: 25,000 + 25,000 + 12,000 + 12,000 = 74,000. Each owner's six months are non-service: 2 x 10,800 = 21,600.
  const p = gracePlan({ couple: true, spouseSalary: 50000, spouseSS: 2000, spouseClaim: 65.5, streams: [job(12000, 65, 66, 'self'), job(12000, 65, 66, 'spouse')] });
  p.profile.spouseRetireAge = 65.5;
  await near(t, ss(run(p), 66, 74000), 21600, 'both owners');
});

// --- Self-employment (the cautious approximation) --------------------------------------------------------------------------------
test('R53: self-employment profit in a benefit month makes it a service month (cautious); profit that ended before the claim does not', async (t) => {
  // SE $12,000 a year 65-66 (control): profit in every benefit month -> service. Net earnings 12,000 x 0.9235 = 11,082 (R34);
  // (25,000 + 11,082 - 24,480) / 2 = 5,801 withheld; 10,800 - 5,801 = 4,999, as before.
  await near(t, ss(run(gracePlan({ streams: [job(12000, 65, 66, 'self', 'selfEmployment')] })), 66, 37000), 4999, 'SE in the benefit months');
  // SE $20,000 a year 65-65.5: no profit after the claim -> six non-service months, 10,800. Pre-R53: (25,000 + 9,235 - 24,480) / 2 =
  // 4,877.50 withheld, 5,922.50 paid.
  await near(t, ss(run(gracePlan({ streams: [job(20000, 65, 65.5, 'self', 'selfEmployment')] })), 66, 35000), 10800, 'SE ended before the claim');
});

// --- The year of full retirement age ----------------------------------------------------------------------------------------------
test('R53: in the year of full retirement age the monthly amount is the higher one ($65,160 / 12 = $5,430)', async (t) => {
  // Age 66 (born 1960, full retirement age 67), retirement and the claim at 66.5, end 67. 6 early months: $2,000 x (1 - 6 x 5/900) =
  // 1,933.33 -> 1,933 a month (404.304(f)); six months 11,598. The row is the year of full retirement age: the earnings test uses
  // $65,160 and $1 for $3. Stream $48,000 = $4,000 a month <= $5,430: non-service, 11,598 paid. Pre-R53: grace off,
  // (25,000 + 48,000 - 65,160) / 3 = 2,613.33 withheld, 8,984.67 paid.
  await near(t, ss(run(gracePlan({ age: 66, retire: 66.5, end: 67, streams: [job(48000, 66, 67)] })), 67, 73000), 11598, 'FRA year, under the monthly amount');
  // Control: $72,000 = $6,000 a month > $5,430: service months; (97,000 - 65,160) / 3 = 10,613.33 withheld, 984.67 paid, as before.
  await near(t, ss(run(gracePlan({ age: 66, retire: 66.5, end: 67, streams: [job(72000, 66, 67)] })), 67, 97000), 984.67, 'FRA year, over the monthly amount');
});

// --- Later years: the annual test, and the credits ---------------------------------------------------------------------------------
test('R53: the year after the grace year keeps the annual test, whatever the monthly wages (404.435(b), Example 1)', async (t) => {
  // Age 63 (born 1963, full retirement age 67), retirement and the claim at 63.5, end 65. 42 early months: 1 - 36 x 5/900 - 6 x 5/1200
  // = .775 -> $1,550 a month. Stream A $12,000 63-64 ($1,000 a month); stream B $60,000 64-64.5 ($5,000 a month), nothing after.
  // Row 63-64 (grace): months 63.5-64 at $1,000, non-service: 6 x 1,550 = 9,300 (pre-R53: (37,000 - 24,480) / 2 = 6,260 withheld, 3,040).
  // Row 64-65 (not a grace year): the annual test even though 64.5-65 has no wages: (30,000 - 24,480) / 2 = 2,760 withheld from
  // 12 x 1,550 = 18,600 -> 15,840, as before.
  const r = run(gracePlan({ age: 63, retire: 63.5, end: 65, streams: [job(12000, 63, 64), job(60000, 64, 64.5)] }));
  await near(t, ss(r, 64, 37000), 9300, 'grace year');
  await near(t, ss(r, 65, 30000), 15840, 'the following year, annual test');
});

test('R53: the reduction-factor credits follow the corrected withholding -- none withheld, none credited at full retirement age', async (t) => {
  // F02 run to 68. Row 65-66: nothing withheld, so no month is credited (POMS RS 00615.482). Row 66-67: no earnings, 12 x 1,800 = 21,600.
  // Row 67-68 (at full retirement age): 18 early months still, 1,800 x 12 = 21,600. Pre-R53: 6,260 withheld in four months (3.48
  // months touched: the 7th to 10th), credited at 67: 14 months, 2,000 x (1 - 14 x 5/900) = 1,844.44 -> 1,844; 22,128.
  const r = run(gracePlan({ end: 68, streams: [job(12000, 65, 66)] }));
  await near(t, ss(r, 66, 37000), 10800, 'grace year');
  await near(t, ss(r, 67, 0), 21600, 'the year before full retirement age');
  await near(t, ss(r, 68, 0), 21600, 'at full retirement age, no credited months');
});

test('R53: the family withholding allocation is kept -- the spousal part on the worker\'s record is spared in the same months', async (t) => {
  // F02's worker with a spouse (65, no benefit of their own, no salary) claiming at 65.5: spousal $1,000 reduced 18 months x 25/36% =
  // 12.5% -> $875 a month. Family: 6 x (1,800 + 875) = 16,050. The worker's benefit months are non-service, so nothing is withheld from
  // the family: 16,050. Pre-R53: the worker's 6,260 excess charged to the family pool (POMS RS 02501.095): 9,790.
  const p = gracePlan({ couple: true, spouseClaim: 65.5, streams: [job(12000, 65, 66)] });
  await near(t, ss(run(p), 66, 37000), 16050, 'family, non-service months');
  // Control: $30,000 stream, service months: (55,000 - 24,480) / 2 = 15,260 charged to the family's 16,050 -> 790, as before.
  const q = gracePlan({ couple: true, spouseClaim: 65.5, streams: [job(30000, 65, 66)] });
  await near(t, ss(run(q), 66, 55000), 790, 'family, service months');
});

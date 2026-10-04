/* S5AA R47 prediction scan: federal tax and retirement accounts (the owner's AA1 decisions, 2026-10-03). Run on the tree BEFORE
   the R47 engine edits. Usage: node audit/S5AA/R47/prediction/r47_corpus_scan.js [<source tree>]
   Held to audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md.

   The rules being built:
   1. senior (AA1-30): no enhanced senior deduction (IRC 151(d)(5)(C)) in a row whose tax year (2026 + row index) is after the
      rules' expiresAfter (2028).
   2. catchup (AA1-13): a pre-tax workplace plan's catch-up is designated Roth (a linked Roth 401(k) balance, taxed now) when the
      owner's prior-year FICA wages from the employer exceed the indexed threshold: the entered priorYearFicaWages in the first
      row, the owner's salary wages of the prior row (less that owner's HSA salary reduction, 3121(a)(5)(G)) after it.
   3. excise (AA1-27): 6% a year on IRA/HSA excess carried under limitPolicy "warn".
   4. se (AA1-45, AA1-26): SE-funded pre-tax deferrals reduce QBI; IRA (and 415) compensation from SE is net of half the SE tax.
   5. hsa (AA1-32): HSA contributions stop at each owner's Medicare start: 65 if their Social Security claim is at 65 or under (or
      no benefit is modelled), else max(65, claim - 0.5); an entered profile.medicareStartAge / spouseMedicareStartAge overrides.

   Conditions, per plan (necessary conditions; C1: the engine's own exported helpers where the engine decides; C2: a limit or
   rate condition also tests that its flow happens in that row; C4: Monte Carlo plans marked, exposure by age only):
   - senior: a row with index >= 3 whose senior deduction, by the engine's seniorDeduction() on the row's own
     seniorDeductionMagi and ageAmountAges(), is positive (Monte Carlo: someone 65+ alive by the row's close, every path);
   - catchup: a row where the engine's auditContributions() (under the row's indexed rules) gives a pre-tax workplace item a
     catch-up share that flows (contribution duration > 0), and the prior-year wages above exceed the indexed threshold;
   - excise: limitPolicy "warn" with an IRA or HSA planned contribution, or a one-time transfer into one;
   - se: a self-employment income stream that pays in some row (with a pre-tax workplace deferral or an IRA contribution);
   - hsa: an HSA item that flows in a row where its owner is past 65 and before the new Medicare start. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
const BASE = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
global.RULES = BASE;
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

function medicareStart(p, owner) {
  const pr = p.profile || {}, r = p.retirement || {}, o = owner === 'spouse' ? pr.spouseMedicareStartAge : pr.medicareStartAge;
  if (fin(o)) return o;
  if (!(E.ssPiaBase(p, owner) > 0)) return 65;
  const claim = Math.max(62, Number(owner === 'spouse' ? r.spouseClaim : r.ssClaim));
  return claim <= 65 ? 65 : Math.max(65, claim - 0.5);
}
const plans = (comp) => {
  const { entries, omissions } = cap.corpusWithDiagnostics({ composition: comp });
  if (omissions.length) throw new Error(comp + ' omissions: ' + JSON.stringify(omissions));
  return entries;
};
function scan(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan)), pr = p.profile, out = { senior: [], catchup: [], excise: [], se: [], hsa: [] };
  const mc = p.assumptions.method === 'monteCarlo';
  const r = E.runPlan(JSON.parse(JSON.stringify(p)));
  if (!r || !Array.isArray(r.rows) || r.rows.length < 2) return out;
  const rows = r.rows, infl = (Number(p.assumptions.inflation) || 0) / 100, g = (Number(p.employment.growth) || 0) / 100;
  let seniorRows = 0, seniorSum = 0, seniorTax = 0, priorWages = null;
  for (let i = 1; i < rows.length; i++) {
    const yi = i - 1, age = rows[i - 1].age, rowAge = rows[i].age, duration = rowAge - age, spouseAge = Number(pr.spouseAge) + (age - pr.age);
    // 1. senior
    if (yi >= 3) {
      const filing = E.householdFilingFor(p, age), ages = E.ageAmountAges(p, age, filing, duration).seniorDeductionAges;
      if (mc) { if (ages.some((a) => a >= 65)) { seniorRows++; } }
      else {
        const d = E.seniorDeduction(rows[i].seniorDeductionMagi, ages, filing);
        if (d > 0.005) {
          seniorRows++; seniorSum += d;
          // C5 size: the deduction times the federal marginal rate at the row's approximate ordinary taxable income (AGI less the
          // indexed standard and age-65 amounts and the deduction itself), under the row's indexed rules; second-order effects
          // (taxable Social Security, IRMAA, the tax on the tax-funding draw) are not in it.
          const f0 = p.assumptions.method === 'simple' ? Math.pow(1 + infl, yi) : (rows[i - 1].inflationFactor || 1);
          global.RULES = E.taxYearRules(BASE, f0, Math.pow(1 + g, yi), yi, null);
          try {
            const ab = E.ageAmountAges(p, age, filing, duration), std = RULES.federal.standardDeduction[filing] || RULES.federal.standardDeduction.single;
            const ti = Math.max(0, rows[i].federalAgi - std - E.additionalStandardDeduction(ab.seniorAges, ab.additionalFiling) - d);
            seniorTax += d * E.marginalRateAt(ti + 1, filing);
          } finally { global.RULES = BASE; }
        }
      }
    }
    // 2. catchup and 5. hsa: the row's own indexed rules, as simulatePlanRows() sets them (the price index from the row's
    // reported inflation factor for a non-simple plan: a necessary condition, with a 5% margin on the threshold below)
    const f = p.assumptions.method === 'simple' || mc ? Math.pow(1 + infl, yi) : (rows[i - 1].inflationFactor || 1);
    global.RULES = E.taxYearRules(BASE, f, Math.pow(1 + g, yi), yi, yi >= 1 ? (p.assumptions.method === 'simple' || mc ? 1 + infl : f) : null);
    try {
      const work = E.householdWorkDurations(p, age, spouseAge, duration), win = E.ownerContributionWindow(p, age, spouseAge, duration);
      const salary = work.self > 0 ? p.employment.salary * Math.pow(1 + g, age - pr.age) : 0;
      const spouseSalary = work.spouse > 0 ? (p.employment.spouseSalary || 0) * Math.pow(1 + g, age - pr.age) : 0;
      // ownerCompensation() is not exported: the audit is run as a direct caller (annual durations), a necessary condition
      const a = E.auditContributions(p, age, salary, spouseSalary, win);
      const thr = RULES.retirement.workplace.rothCatchup.records.filter((x) => x.provision_id === 'prior_year_fica_wage_threshold')[0].value;
      const hsaWage = { self: 0, spouse: 0 };
      a.items.forEach((it) => {
        const o = it.account.owner === 'spouse' ? 'spouse' : 'self', dur = o === 'spouse' ? win.durations.spouse : win.durations.self;
        if (it.account.taxClass === 'hsa') hsaWage[o] += (it.lawful === undefined ? it.allowed : it.lawful) * dur;
        if (it.account.taxClass === 'preTax' && E.accountType(it.account.type).limitGroup === 'workplace' && it.catchUp > 0.01 && dur > 0) {
          const wages = yi === 0 ? (fin(it.account.priorYearFicaWages) ? it.account.priorYearFicaWages : null) : (priorWages ? priorWages[o] : null);
          if (wages !== null && wages > thr * (p.assumptions.method === 'simple' ? 1 : 0.95)) out.catchup.push(rowAge + ': ' + it.account.id + ' catch-up ' + (it.catchUp * dur).toFixed(2) + ' (wages ' + wages.toFixed(0) + ' > ' + thr + ')');
        }
        if (it.account.taxClass === 'hsa' && dur > 0 && it.requested > 0) {
          const ownerAge = o === 'spouse' ? spouseAge : age, m = medicareStart(p, o);
          if (ownerAge + Math.min(duration, dur) > 65 + 1e-9 && m > 65 && ownerAge < m - 1e-9) out.hsa.push(rowAge + ': ' + it.account.id + ' (' + o + ' ' + ownerAge.toFixed(2) + ', Medicare from ' + m + ')');
        }
      });
      priorWages = { self: Math.max(0, salary * work.self - hsaWage.self), spouse: Math.max(0, spouseSalary * work.spouse - hsaWage.spouse) };
    } finally { global.RULES = BASE; }
  }
  if (seniorRows) out.senior.push(seniorRows + ' rows' + (mc ? ' (age-only, every path)' : ', deduction removed $' + seniorSum.toFixed(2) + ', federal tax up about $' + seniorTax.toFixed(0)));
  // 3. excise
  if (p.limitPolicy === 'warn' && ((p.accounts || []).some((x) => ['ira', 'hsa'].includes(E.accountType(x.type).limitGroup) && Number(x.contribution) > 0)
    || (p.advanced.transferOn && (p.accounts || []).some((x) => x.id === p.advanced.transferTo && ['ira', 'hsa'].includes(E.accountType(x.type).limitGroup)))))
    out.excise.push('warn with an IRA/HSA contribution');
  // 4. se: a stream that pays (C3: its own row income through the engine's otherIncomeFor())
  const seStreams = (p.retirement.otherIncomes || []).filter((s) => s.type === 'selfEmployment');
  if (seStreams.length) {
    let pays = false;
    for (let i = 1; i < rows.length && !pays; i++) { pays = seStreams.some((s) => Number(s.amount) > 0 && Number(s.start) < rows[i].age && (s.end === undefined || Number(s.end) > rows[i - 1].age)); }
    if (pays) out.se.push(seStreams.length + ' SE stream(s)');
  }
  if (mc) Object.keys(out).forEach((k) => { if (out[k].length) out[k].unshift('(monteCarlo)'); });
  return out;
}
const KEYS = ['senior', 'catchup', 'excise', 'se', 'hsa'];
for (const comp of ['control', 'expanded']) {
  const entries = plans(comp), movers = Object.fromEntries(KEYS.map((k) => [k, []]));
  for (const e of entries) { const s = scan(e); KEYS.forEach((f) => { if (s[f].length) movers[f].push(e.name + ' [' + s[f].slice(0, 4).join('; ') + (s[f].length > 4 ? '; +' + (s[f].length - 4) : '') + ']'); }); }
  console.log('== ' + comp + ' (' + entries.length + ' plans)');
  KEYS.forEach((f) => console.log('  ' + f + ' (' + movers[f].length + '): ' + (movers[f].length ? '\n    ' + movers[f].join('\n    ') : 'none')));
}

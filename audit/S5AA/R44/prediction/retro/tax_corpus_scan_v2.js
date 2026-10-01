/* S5AA R44 CORRECTED COPY of audit/S5AA/R43/prediction/tax_corpus_scan.js (R43-04). Corrections:
   - C2 (SA43-A): SA42F-08 flags a row only while the owner's IRA contribution window is open (E.ownerContributionWindow).
   - C4 (SA43-B): SA42F-22 reads each Monte Carlo path's own figures, simulated with the tree's seeding, not the aggregated rows.
   - C6 (SA43-B): SA42F-22 tests every reader of the joint thresholds -- the IRMAA charge and the optimized withdrawal order's IRMAA guard.
   Everything else is the R43 scan unchanged. */
/* S5AA R43 prediction, part 2 (federal tax and Medicare): which corpus plans can each repair move? Run on the tree BEFORE the
   part 2 engine edits.   Usage: node audit/S5AA/R43/prediction/tax_corpus_scan.js [<source tree>]
   Row by row, from the plan's own rows and the engine's exported helpers:
   - SA42F-01 (199A): a row with self-employment profit from a stream whose owner is alive, and federal AGI above the standard
     deduction (some taxable income for the deduction to reduce);
   - SA42F-08 (fixed phase-out widths): a later row (inflation not zero) in which a planned Roth IRA's limit, computed exactly on the
     declared salary proxy, or a planned traditional IRA's deduction, at either end of its possible pre-deduction MAGI, differs
     between the row's rules and the same rules with each range's end at its start plus the 2026 width;
   - SA42F-09 (Rule of 55 in the separation row): Rule of 55 on, a separation strictly inside a row at 55 or later (or in the
     year of 55), a workplace account, the row opening below 59.5 and a withdrawal in the row;
   - SA42F-10 (separate-return IRMAA table): a pre-plan lookback return entered as "mfs" with MAGI above $109,000;
   - SA42F-22 (joint thresholds twice the single): a joint plan with health costs on, someone 65 or over, a later year, and a
     lookback MAGI (a row's federal AGI or an entered pre-plan figure) between the old and new joint threshold of any tier;
   - SA42F-23 (age-65 amounts at the tax year's close): a partial last row in which someone alive turns 65 after the row's
     close and by the tax year's close, with federal AGI above zero.
   A condition is necessary, not sufficient; the record says which flagged plans did not move. */
'use strict';
const path = require('node:path');
const ROOT = path.resolve(process.argv[2] || '.');
const fs = require('node:fs');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const BASE = global.RULES;
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const fin = (v) => Number.isFinite(Number(v));
const near = (x, m) => Math.floor(x / m + 0.5 + 1e-9) * m;
const plans = (comp) => {
  const { entries, omissions } = cap.corpusWithDiagnostics({ composition: comp });
  if (omissions.length) throw new Error(comp + ' omissions: ' + JSON.stringify(omissions));
  return entries;
};

// R44 C4: every path of a Monte Carlo plan, seeded as this tree's runPlan seeds it. Its path 0 is checked against runPlan(runs: 1).
function monteCarloPaths(p) {
  const n = Number(p.assumptions.runs), base0 = Number(p.assumptions.seed), base = Number.isFinite(base0) ? base0 : 0;
  const seedOf = (i, k) => (typeof E.monteCarloPathSeed === 'function' ? E.monteCarloPathSeed(base, i, k) : base + i * 2 + k);
  const out = [];
  for (let i = 0; i < n; i++) out.push(E.simulatePlan(JSON.parse(JSON.stringify(p)), E.rng(seedOf(i, 0)), 0, E.rng(seedOf(i, 1)), []).rows);
  const one = JSON.parse(JSON.stringify(p)); one.assumptions.runs = 1;
  const viaRun = E.runPlan(one).rows.map((x) => x.total), direct = out[0].map((x) => x.total);
  if (JSON.stringify(viaRun) !== JSON.stringify(direct)) throw new Error('C4 self-check: path 0 does not reproduce runPlan(runs: 1)');
  return out;
}

function scan(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan));
  const out = { f01: [], f08: [], f09: [], f10: [], f22: [], f23: [] };
  const r = p.retirement || {}, pr = p.profile || {}, adv = p.advanced || {};
  const res = E.runPlan(JSON.parse(JSON.stringify(p)));
  const rows = res.rows || [];
  const start = Number(pr.age), infl = (Number(p.assumptions.inflation) || 0) / 100, spouseOn = !!pr.spouseOn;
  const std = (filing) => BASE.federal.standardDeduction[filing] || BASE.federal.standardDeduction.single;
  const lifeAt = (who) => (who === 'spouse' ? Number(r.spouseLife) - Number(pr.spouseAge) + start : Number(r.selfLife));
  // SA42F-10
  ['TwoYearsBefore', 'OneYearBefore'].forEach((k) => {
    if (adv['irmaaFiling' + k] === 'mfs' && Number(adv['irmaaMagi' + k]) > 109000 && adv.healthOn) out.f10.push(k + ' ' + adv['irmaaMagi' + k]);
  });
  const prePlan = [Number(adv.irmaaMagiTwoYearsBefore) || 0, Number(adv.irmaaMagiOneYearBefore) || 0];
  const magis = rows.slice(1).map((x) => x.federalAgi).concat(prePlan);
  // R44 C4 (SA43-B): a Monte Carlo plan's per-path figures are what a per-path rule reads -- IRMAA is charged on each path's own
  // lookback MAGI -- so each path is simulated with the engine's own seeding (that tree's), and the aggregated rows are not used.
  const pathRows = p.assumptions.method === 'monteCarlo' ? monteCarloPaths(p) : [rows];
  const pathMagis = p.assumptions.method === 'monteCarlo' ? pathRows.map((pr0) => pr0.slice(1).map((x) => x.federalAgi).concat(prePlan)) : [magis];
  for (let k = 1; k < rows.length; k++) {
    const age = rows[k - 1].age, rowAge = rows[k].age, dur = rowAge - age, row = rows[k], yi = age - start;
    const spouseAge = Number(pr.spouseAge) + yi;
    const filing = E.householdFilingFor(p, age);
    // SA42F-01
    (r.otherIncomes || []).forEach((s) => {
      if (s && s.type === 'selfEmployment' && Number(s.amount) > 0 && age >= Number(s.start) - 1e-9 && age < Number(s.end) + 1 - 1e-9 && age < lifeAt(s.owner === 'spouse' ? 'spouse' : 'self')
        && row.federalAgi > std(filing)) out.f01.push(rowAge + ' ' + s.name);
    });
    // SA42F-08: the row's own rules (row k is tax year 2026 + (k - 1); the price index advances a whole year a row), and the same rules
    // with each range's end set to its indexed start plus the 2026 width. The Roth limit is computed exactly (its MAGI is the declared
    // salary proxy); the IRA deduction at both ends of its possible pre-deduction MAGI, [federal AGI, federal AGI + the contribution].
    const yr = k - 1;
    if (yr >= 1 && infl !== 0) {
      const f = Math.pow(1 + infl, yr), w = Math.pow(1 + (Number(p.employment.growth) || 0) / 100, yr);
      const Rold = E.taxYearRules(BASE, f, w, yr, 1 + infl), Rnew = JSON.parse(JSON.stringify(Rold));
      Object.keys(Rnew.retirement.ira.rothPhaseout).forEach((key) => { const b = BASE.retirement.ira.rothPhaseout[key]; Rnew.retirement.ira.rothPhaseout[key] = [Rold.retirement.ira.rothPhaseout[key][0], Rold.retirement.ira.rothPhaseout[key][0] + b[1] - b[0]]; });
      const rec = Rnew.retirement.ira.deductionPhaseout.records, brec = BASE.retirement.ira.deductionPhaseout.records;
      for (let q = 0; q + 1 < rec.length; q += 2) rec[q + 1].value = rec[q].value + (brec[q + 1].value - brec[q].value);
      const work = E.householdWorkDurations(p, age, spouseAge, dur);
      const sal = (who) => (Number(who === 'spouse' ? p.employment.spouseSalary : p.employment.salary) || 0) * Math.pow(1 + (Number(p.employment.growth) || 0) / 100, yi);
      const workplace = (who) => (p.accounts || []).some((a) => /401k|403b|457/.test(a.type) && (a.owner === 'spouse' ? 'spouse' : 'self') === who && (Number(a.contribution) > 0 || Number(a.contributionPct) > 0 || Number(a.matchRate) > 0));
      const covSelf = workplace('self') && work.self > 0, covSpouse = spouseOn && workplace('spouse') && work.spouse > 0;
      const withRules = (R, fn) => { const saved = global.RULES; global.RULES = R; try { return fn(); } finally { global.RULES = saved; } };
      (p.accounts || []).forEach((a) => {
        const planned = Number(a.contribution) || 0;
        if (!(planned > 0 || Number(a.contributionPct) > 0)) return;
        const owner = a.owner === 'spouse' ? 'spouse' : 'self', oa = owner === 'spouse' ? spouseAge : age;
        // R44 C2 (SA43-A): a limit can only move a deposit the engine makes -- the owner's IRA window, by the engine's own helper, must be open in the row.
        const win = E.ownerContributionWindow(p, age, spouseAge, dur).durations;
        if (!((owner === 'spouse' ? win.spouseIra : win.selfIra) > 1e-9)) return;
        const L = withRules(Rold, () => E.contributionLimit('ira', oa + dur, pr.filing));
        if (a.type === 'rothIRA') {
          const s1 = sal('self') * work.self, s2 = sal('spouse') * work.spouse;
          const lo = withRules(Rold, () => E.rothContributionLimit(p, a, s1, s2, age, L)), ln = withRules(Rnew, () => E.rothContributionLimit(p, a, s1, s2, age, L));
          if (Math.abs(lo - ln) > 0.005) out.f08.push(rowAge + ' roth ' + lo.toFixed(0) + '->' + ln.toFixed(0));
        }
        if (a.type === 'traditionalIRA') {
          const own = owner === 'spouse' ? covSpouse : covSelf, other = owner === 'spouse' ? covSelf : covSpouse;
          const amt = planned > 0 ? Math.min(planned, L) : L;
          [row.federalAgi, row.federalAgi + amt].forEach((m) => {
            const dO = withRules(Rold, () => E.iraDeductibleAmount(amt, m, filing, own, other, L)), dN = withRules(Rnew, () => E.iraDeductibleAmount(amt, m, filing, own, other, L));
            if (Math.abs(dO - dN) > 0.005 && !out.f08.some((x) => x.startsWith(rowAge + ' ira'))) out.f08.push(rowAge + ' ira ' + dO.toFixed(0) + '->' + dN.toFixed(0) + ' at ' + Math.round(m));
          });
        }
      });
    }
    // SA42F-09
    const left = Number(pr.retireAge);
    if (adv.rule55 && left > age + 1e-9 && left < rowAge - 1e-9 && age < 59.5 && (left >= 55 - 1e-9 || Math.floor(left - start) + Math.floor(start) >= 55)
      && (p.accounts || []).some((a) => ['traditional401k', 'roth401k', 'traditional403b', 'roth403b', 'governmental457b', 'traditional457b'].includes(a.type) || /401k|403b|457/.test(a.type)) && row.withdrawals > 0)
      out.f09.push(rowAge + ' separation ' + left);
    // SA42F-22
    if (filing === 'mfj' && adv.healthOn && yi >= 1 - 1e-9 && infl !== 0 && (age >= 65 || (spouseOn && spouseAge >= 65))) {
      const f = Math.pow(1 + infl, yi), single = BASE.medicare.irmaa.singleThresholds, joint = BASE.medicare.irmaa.jointThresholds;
      for (let i = 0; i < single.length - 1; i++) {
        const oldJ = near(joint[i] * f, 1000), newJ = 2 * near(single[i] * f, 1000), lo = Math.min(oldJ, newJ), hi = Math.max(oldJ, newJ);
        const hit = pathMagis.findIndex((ms) => ms.some((m) => m > lo - 1e-9 && m < hi + 1e-9));
        if (lo !== hi && hit >= 0) { out.f22.push(rowAge + ' tier ' + i + ' ' + lo + '-' + hi + (pathMagis.length > 1 ? ' (path ' + hit + ' of ' + pathMagis.length + ')' : '')); break; }
      }
    }
    // SA42F-22, second reader (R44 C6): the optimized withdrawal order's IRMAA guard
    if (r.withdrawalOrder === 'optimized' && r.irmaaGuard && filing === 'mfj' && age >= 63 && k >= 2 && infl !== 0) {
      const yr = k - 1, f = Math.pow(1 + infl, yr), w = Math.pow(1 + (Number(p.employment.growth) || 0) / 100, yr);
      const R0 = E.taxYearRules(BASE, f, w, yr, 1 + infl), oldJ = R0.medicare.irmaa.jointThresholds, sing = R0.medicare.irmaa.singleThresholds;
      const newJ = oldJ.map((x, i) => (i < sing.length - 1 ? 2 * sing[i] : x));
      const W = Math.max(10000, (Number(r.spending) || 0) * 0.35), guard = (T, m) => ((T.find((x) => x > m) || Infinity) - m < W);
      // a flipped guard only re-weights the pre-tax class; it moves the plan only if the ORDER changes, so the engine's own
      // smartWithdrawalOrder() is asked under both tables, with that path's opening class balances (each class's balance shared
      // equally among its accounts) and its MAGI history.
      const Rn = JSON.parse(JSON.stringify(R0)); Rn.medicare.irmaa.jointThresholds = newJ;
      const orderUnder = (R, pr0) => { const saved = global.RULES; global.RULES = R; try {
        const open = pr0[k - 1], byClass = {}; (p.accounts || []).forEach((a) => { byClass[a.taxClass] = (byClass[a.taxClass] || 0) + 1; });
        const accs = (p.accounts || []).map((a) => Object.assign({}, a, { balance: (Number(open[a.taxClass]) || 0) / byClass[a.taxClass] }));
        const prior = k >= 2 && pr0[k - 2] && pr0[k - 2].total > 0 ? open.total / pr0[k - 2].total - 1 : 0;
        return JSON.stringify(E.smartWithdrawalOrder(p, age, accs, pr0.slice(1, k).map((x) => x.magi), prior)); } finally { global.RULES = saved; } };
      const hit = pathRows.findIndex((pr0) => { const m = Number(pr0[k - 1] && pr0[k - 1].magi) || 0; return guard(oldJ, m) !== guard(newJ, m) && orderUnder(R0, pr0) !== orderUnder(Rn, pr0); });
      if (hit >= 0) out.f22.push(rowAge + ' withdrawal order changes' + (pathRows.length > 1 ? ' (path ' + hit + ' of ' + pathRows.length + ')' : ''));
    }
    // SA42F-23
    if (k === rows.length - 1 && dur < 1 - 1e-9) {
      const taxClose = Math.floor(age + 1e-9) + 1;
      [['self', age, Number(r.selfLife)], spouseOn ? ['spouse', spouseAge, Number(r.spouseLife)] : null].filter(Boolean).forEach(([who, a, life]) => {
        const atRowClose = a + dur, atTaxClose = a + (taxClose - age);
        if (atRowClose < 65 - 1e-9 && atTaxClose >= 65 - 1e-9 && !(fin(life) && life <= atRowClose) && row.federalAgi > 0) out.f23.push(rowAge + ' ' + who);
      });
    }
  }
  return out;
}

const KEYS = ['f01', 'f08', 'f09', 'f10', 'f22', 'f23'];
for (const comp of ['control', 'expanded']) {
  const entries = plans(comp), movers = Object.fromEntries(KEYS.map((k) => [k, []]));
  for (const e of entries) {
    const s = scan(e);
    KEYS.forEach((f) => { if (s[f].length) movers[f].push(e.name + ' [' + s[f].slice(0, 3).join('; ') + (s[f].length > 3 ? '; +' + (s[f].length - 3) : '') + ']'); });
  }
  console.log('== ' + comp + ' (' + entries.length + ' plans)');
  KEYS.forEach((f) => console.log('  ' + f + ': ' + (movers[f].length ? '\n    ' + movers[f].join('\n    ') : 'none')));
}

// Positive control: the scan must flag every witness in tests/audit-s5aa-r43-tax.test.js.
{
  const h = require(path.join(ROOT, 'audit', 'S5AA', 'R42F', 'SA42F', 'harness.js'));
  const SH = require(path.join(ROOT, 'audit', 'S5AA', 'R42F', 'SA42F', 'STATE-HEALTH', 'common.js'));
  const g = h.grid;
  const sePlan = (profit) => g.basePlan({ age: 50, retireAge: 50, endAge: 52, spending: 0, accounts: [g.account('ira', 'traditionalIRA', 100000)],
    otherIncomes: [{ id: 'se', name: 'Consulting', type: 'selfEmployment', amount: profit, start: 0, end: 120, owner: 'self', growthMode: 'fixed', growth: 0 }] });
  const width = () => { const p = g.basePlan({ age: 25, retireAge: 65, endAge: 47, inflation: 3, salary: 156000, spending: 0,
    accounts: [g.account('k', 'traditional401k', 0, { contribution: 1000 }), g.account('ira', 'traditionalIRA', 0, { contribution: 7500 })] }); p.employment.contributionStop = 65; return p; };
  const r55 = (ra) => { const p = g.basePlan({ age: 54, retireAge: ra, endAge: 58, spending: 40000, accounts: [g.account('k', 'traditional401k', 1e6)] }); p.advanced.rule55 = true; p.employment.contributionStop = ra; return p; };
  const mfs = () => { const p = SH.base({ age: 66, endAge: 69, retireAge: 60, filing: 'mfj', spouseOn: true, spouseAge: 60 });
    Object.assign(p.advanced, { healthOn: true, healthCost: 0, healthInflation: 0, irmaaMagiTwoYearsBefore: 150000, irmaaMagiOneYearBefore: 150000, irmaaFilingTwoYearsBefore: 'mfs', irmaaFilingOneYearBefore: 'mfs' });
    SH.income(p, 'pension', 50000); return p; };
  const joint = () => { const p = SH.base({ age: 66, endAge: 69, retireAge: 60, filing: 'mfj', spouseOn: true, spouseAge: 66 }); p.assumptions.inflation = 2.5;
    Object.assign(p.advanced, { healthOn: true, healthCost: 0, healthInflation: 0, irmaaMagiTwoYearsBefore: 100000, irmaaMagiOneYearBefore: 223500, irmaaFilingTwoYearsBefore: 'mfj', irmaaFilingOneYearBefore: 'mfj' });
    SH.income(p, 'pension', 100000); return p; };
  const last = () => { const p = SH.base({ age: 89, endAge: 90.5, retireAge: 60, filing: 'mfj', spouseOn: true, spouseAge: 63 }); SH.income(p, 'pension', 120000); return p; };
  const cases = [['SA42F-01 witness, $80,000', sePlan(80000)], ['SA42F-08 witness', width()], ['SA42F-09 witness, 55.5', r55(55.5)], ['SA42F-09 control, 54.5', r55(54.5)],
    ['SA42F-10 witness', mfs()], ['SA42F-22 witness', joint()], ['SA42F-23 witness', last()]];
  console.log('== positive control');
  for (const [name, p] of cases) { const s = scan({ name, plan: p }); console.log('  ' + name + ': ' + (KEYS.filter((f) => s[f].length).map((f) => f + ' [' + s[f].slice(0, 2).join('; ') + ']').join(' ') || 'none')); }
}

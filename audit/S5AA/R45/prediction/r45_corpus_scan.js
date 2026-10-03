/* S5AA R45 prediction scan: separate spouse retirement ages (the owner, 2026-10-03). Run on the tree BEFORE the R45 engine edits.
   Usage: node audit/S5AA/R45/prediction/r45_corpus_scan.js [<source tree>]
   Held to audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md.

   The rules being built (the owner's decisions):
   - profile.spouseRetireAge is the spouse's retirement age on their own clock; absent, it is profile.retireAge, as today.
   - The HOUSEHOLD date (retired spending, the strategy anchor, debt-and-housing costs, the reserve, the pay-first rule, and by
     default pre-Medicare health costs) is the FIRST stop, on the primary's clock: the primary's retirement; an EARNING spouse's retirement; the
     primary's death before retiring (spouse alive), whatever the spouse earns; an earning spouse's death before retiring (primary
     alive). A spouse with no salary does not stop anything.
   - The owner's AA1 decisions (2026-10-03) add three optional inputs, each absent from every corpus plan: advanced.conversionStartAge
     (conversions start there; absent, at profile.retireAge, as today, so conversions leave the household list);
     advanced.healthCoverageEndAge (pre-Medicare health costs start there; absent, at the household date); and
     retirement.spendingStartAge (absent, the household date is the first stop; present, it replaces it).
   - Each person's own date drives their work, wages, contributions, the Social Security service months, the 401(k) still-working
     RMD exception, the Rule of 55 and vesting at separation. Pensions, LTC onset, the glide path, the bond tent and dividends keep
     the primary's retirement age.

   Conditions, per plan (C1: the engine's own helpers where the engine decides; C4: Monte Carlo plans marked):
   - own: the plan carries profile.spouseRetireAge different from profile.retireAge (the spouse's own date changes), spouse included;
   - household: the new household date differs from today's (R43's costRetireAge, mirrored from the engine source), and the
     difference falls inside the projection;
   - health / reserve: the household date differs and the plan has health costs or the reserve on (they move with it);
   - inputs: the plan carries any of the three new inputs (none does: they are new);
   - conversion: conversions keep profile.retireAge unless advanced.conversionStartAge is entered, so none moves.
   A condition is necessary; the record says which flagged plans are expected to move and how. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const fin = (v) => Number.isFinite(Number(v));

// Today's household date: R43's costRetireAge, as written in src/engine.js (simulatePlanRows).
function todayHousehold(p) {
  const pr = p.profile || {}, rt = p.retirement || {}, st = Number(pr.age), ret = Number(pr.retireAge), d = Number(rt.selfLife), sd = Number(rt.spouseLife);
  if (pr.spouseOn !== true || !Number.isFinite(d) || !(d > st) || !(d < ret)) return ret;
  const spouseAtDeath = Number(pr.spouseAge) + (d - st);
  if (Number.isFinite(sd) && !(sd > spouseAtDeath)) return ret;
  if ((Number(p.employment && p.employment.spouseSalary) || 0) > 0 && spouseAtDeath < ret) return ret;
  return d;
}
// The new household date, as the owner decided it.
function newHousehold(p) {
  const pr = p.profile || {}, rt = p.retirement || {}, st = Number(pr.age), ret = Number(pr.retireAge);
  if (pr.spouseOn !== true) return ret;
  const sa = Number(pr.spouseAge), sRet = fin(pr.spouseRetireAge) ? Number(pr.spouseRetireAge) : ret;
  const toSelf = (x) => st + (x - sa);   // a spouse age, on the primary's clock
  const d = fin(rt.selfLife) ? Number(rt.selfLife) : Infinity, sd = fin(rt.spouseLife) ? toSelf(Number(rt.spouseLife)) : Infinity;
  const earning = (Number(p.employment && p.employment.spouseSalary) || 0) > 0;
  const c = [ret];
  if (earning) c.push(Math.max(st, toSelf(sRet)));
  if (d > st && d < ret && sd > d) c.push(d);
  if (earning && sd > st && sd < toSelf(sRet) && d > sd) c.push(sd);
  return Math.min(...c);
}
const plans = (comp) => {
  const { entries, omissions } = cap.corpusWithDiagnostics({ composition: comp });
  if (omissions.length) throw new Error(comp + ' omissions: ' + JSON.stringify(omissions));
  return entries;
};
function scan(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan)), pr = p.profile || {}, adv = p.advanced || {};
  const out = { own: [], household: [], health: [], reserve: [], inputs: [], conversion: [] };
  const st = Number(pr.age), end = Number(pr.endAge);
  if (pr.spouseOn === true && fin(pr.spouseRetireAge) && Number(pr.spouseRetireAge) !== Number(pr.retireAge)) {
    // C1: the spouse's work window under each date, by the engine's own householdWorkDurations() on a copy with retireAge swapped
    const sa = Number(pr.spouseAge), rows = [];
    for (let a = st; a < end; a = Math.floor(a + 1e-9) + 1) {
      const span = Math.min(Math.floor(a + 1e-9) + 1, end) - a, spAge = sa + (a - st);
      const now = E.householdWorkDurations(p, a, spAge, span).spouse;
      const q = JSON.parse(JSON.stringify(p)); q.profile.retireAge = Number(pr.spouseRetireAge);
      const then = E.householdWorkDurations(q, a, spAge, span).spouse;
      if (Math.abs(now - then) > 1e-9) rows.push(a + ': ' + now.toFixed(2) + ' -> ' + then.toFixed(2));
    }
    if (rows.length) out.own.push('spouse ' + pr.spouseRetireAge + ' (was ' + pr.retireAge + ' on own clock), salary ' + (Number(p.employment.spouseSalary) || 0) + '; work ' + rows.slice(0, 2).join('; ') + (rows.length > 2 ? '; +' + (rows.length - 2) : ''));
  }
  const h0 = todayHousehold(p), h1 = newHousehold(p);
  if (Math.abs(h0 - h1) > 1e-9 && Math.min(h0, h1) < end - 1e-9) {
    out.household.push((+h0.toFixed(2)) + ' -> ' + (+h1.toFixed(2)));
    if (adv.healthOn) out.health.push('pre-Medicare health from ' + (+h1.toFixed(2)) + ' (was from ' + (+h0.toFixed(2)) + ')');
    if (adv.reserveOn) out.reserve.push('reserve from ' + (+h1.toFixed(2)) + ' (was from ' + pr.retireAge + ')');
  }
  ['conversionStartAge', 'healthCoverageEndAge'].forEach((k) => { if (adv[k] !== undefined) out.inputs.push('advanced.' + k); });
  if ((p.retirement || {}).spendingStartAge !== undefined) out.inputs.push('retirement.spendingStartAge');
  if (adv.conversionStartAge !== undefined && adv.conversionOn) out.conversion.push('conversions from ' + adv.conversionStartAge);
  if (p.assumptions.method !== 'simple') Object.keys(out).forEach((k) => { if (out[k].length) out[k].unshift('(' + p.assumptions.method + ')'); });
  return out;
}
const KEYS = ['own', 'household', 'health', 'reserve', 'inputs', 'conversion'];
for (const comp of ['control', 'expanded']) {
  const entries = plans(comp), movers = Object.fromEntries(KEYS.map((k) => [k, []]));
  for (const e of entries) { const s = scan(e); KEYS.forEach((f) => { if (s[f].length) movers[f].push(e.name + ' [' + s[f].join('; ') + ']'); }); }
  console.log('== ' + comp + ' (' + entries.length + ' plans)');
  KEYS.forEach((f) => console.log('  ' + f + ' (' + movers[f].length + '): ' + (movers[f].length ? '\n    ' + movers[f].join('\n    ') : 'none')));
}

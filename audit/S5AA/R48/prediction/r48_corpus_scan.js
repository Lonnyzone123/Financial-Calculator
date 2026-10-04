/* S5AA R48 prediction scan: Medicare, survivors and Arizona (the owner's AA1 decisions, 2026-10-03). Run on the tree BEFORE the R48
   engine edits.
   Usage: node audit/S5AA/R48/prediction/r48_corpus_scan.js [<source tree>]
   Held to audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md.

   The rules being built:
   - AA1-23: the Medicare charge (the Part B premium and IRMAA amounts, the Part B deductible and the Part D premium) grows from 2026
     at advanced.medicareInflation (new, optional), else advanced.healthInflation; advanced.partDPremium (new, optional, monthly per
     person) replaces the CMS base premium when entered. Today the charge is held at 2026 dollars.
   - AA1-11: the IRMAA_PRE_PLAN_MAGI_ASSUMED card, help text and a validator warning (no engine figure moves).
   - AA1-19: a survivor under 59 1/2 at the death holds the deceased's traditional IRAs as an inherited IRA until 59 1/2: no 10%
     additional tax, beneficiary RMDs, a separate Form 8606 pool; at 59 1/2 the survivor treats them as their own.
   - AA1-20: profile.communityProperty (new, optional): a full basis reset at the first death for the joint and both spouses' taxable
     accounts. No corpus plan carries it.
   - AA1-16: Arizona subtracts the federal 151(d)(5)(C) deduction (A.R.S. 43-1022(35)), and 25% of the share of net long-term gain
     the plan enters as acquired after 2011 (43-1022(22)(c); retirement.azPost2011GainShare, new, absent = 0%).
   - The disclosure SPOUSAL_ROLLOVER_ASSUMED is rewritten (its message and its notModelled list): every plan that raises it moves in
     the expanded capture, which hashes each run's whole result, issues included (C8).

   Conditions, per plan (C1: the engine's own helpers where the engine decides; C4: Monte Carlo plans marked, every path exposed when
   the condition reads only ages, dates and inputs):
   - medicare: health costs on, a growth rate other than 0, and a row after the first (yearProgress > 0) in which someone 65 or older
     alive is charged Medicare (the household retired, householdRetireAge(); or the R43 idle spouse, householdWorkDurations()).
     Size (C5, hand trace): the charge at the first tier, $3,185.68 a person, times ((1 + g)^yearProgress - 1), summed over the rows.
   - inherited: the run on the base raises SPOUSAL_ROLLOVER_ASSUMED with a traditional IRA passing with value to a survivor under 59 1/2
     at that row's opening; the tap (R40's FLOWS variant) says whether that IRA is drawn, and whether a 10% additional tax is charged,
     while the survivor is under 59 1/2.
   - rollover-text: the run raises SPOUSAL_ROLLOVER_ASSUMED at all (the message moves).
   - community: the plan carries profile.communityProperty (none: it is new).
   - azSenior: a row whose federal senior deduction is above 0 (seniorDeduction() on the row's reported seniorDeductionMagi, with
     ageAmountAges() and householdFilingFor()); Arizona tax falls by 2.5% of it while Arizona's base is positive.
   - azGain: the plan carries retirement.azPost2011GainShare (none: it is new).
   - irmaaPrePlan: the engine raises IRMAA_PRE_PLAN_MAGI_ASSUMED with exactly one prior-year MAGI entered (its message would change). */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const L = require(path.join(ROOT, 'audit', 'S5AA', 'R40', 'S5AA_R40_CONSERVATION_GRID', 'lib.js'));
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const MED_ONE = RULES.medicare.irmaa.partBMonthly[0] * 12 + RULES.medicare.partB.annualDeductible + RULES.medicare.partD.baseBeneficiaryMonthly * 12;

const plans = (comp) => {
  const { entries, omissions } = cap.corpusWithDiagnostics({ composition: comp });
  if (omissions.length) throw new Error(comp + ' omissions: ' + JSON.stringify(omissions));
  return entries;
};
function openings(p, rows) { const st = Number(p.profile.age); return rows.map((r, i) => ({ open: i === 0 ? st : rows[i - 1].age, close: r.age, row: r })); }

function scan(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan)), pr = p.profile || {}, adv = p.advanced || {}, rt = p.retirement || {};
  const out = { medicare: [], inherited: [], rolloverText: [], community: [], azSenior: [], azGain: [], irmaaPrePlan: [] };
  const mc = p.assumptions && p.assumptions.method === 'monteCarlo';
  const r = E.runPlan(JSON.parse(JSON.stringify(p)));
  if (r.status !== 'ok' || !Array.isArray(r.rows)) { out.medicare.push('(not run: ' + r.calculationErrorCode + ')'); return out; }
  const st = Number(pr.age), house = E.householdRetireAge(p);
  const rate = fin(adv.medicareInflation) ? adv.medicareInflation : Number(adv.healthInflation) || 0;
  // medicare
  if (adv.healthOn === true && rate !== 0) {
    let size = 0, n = 0;
    for (const o of openings(p, r.rows)) {
      const yp = o.open - st, dur = o.close - o.open; if (!(yp > 1e-9)) continue;
      const ages = E.householdSeniorAges(p, o.open), people = ages.filter((a) => a >= 65).length;
      const retired = Math.max(0, o.close - Math.max(o.open, house));
      let charged = people * retired;
      if (pr.spouseOn === true && ages[1] >= 65) { const ws = E.householdWorkDurations(p, o.open, Number(pr.spouseAge) + yp, dur).spouse; charged += Math.max(0, dur - retired - ws); }
      if (charged > 1e-9) { n++; size += MED_ONE * charged * (Math.pow(1 + rate / 100, yp) - 1); }
    }
    if (n) out.medicare.push(n + ' rows at ' + rate + '%; first-tier charge up about $' + Math.round(size).toLocaleString('en-US') + ' over the plan (before tax and growth)');
  }
  // succession
  const roll = (r.issues || []).find((i) => i && i.code === 'SPOUSAL_ROLLOVER_ASSUMED');
  if (roll) {
    out.rolloverText.push('raises SPOUSAL_ROLLOVER_ASSUMED');
    const s = roll.state || roll;
    (s.rollovers || []).forEach((ev) => {
      const survAge = ev.to === 'spouse' ? Number(pr.spouseAge) + (ev.fromRowOpening - st) : ev.fromRowOpening;
      const iras = (s.succession || []).filter((x) => x.type === 'traditionalIRA' && x.balance > 0.005 && ev.accounts.indexOf(x.account) >= 0);
      if (!(survAge < 59.5) || !iras.length) return;
      // the survivor reaches 59 1/2 at this primary age
      const rollAt = ev.to === 'spouse' ? st + (59.5 - Number(pr.spouseAge)) : 59.5;
      let note = iras.map((x) => x.account + ' $' + x.balance).join(', ') + ' to ' + ev.to + ' at ' + survAge.toFixed(2) + ' (primary ' + ev.fromRowOpening + ', 59.5 at primary ' + rollAt.toFixed(2) + ')';
      if (!mc) {
        const t = L.runTapped(p);
        if (t.valid) {
          const ids = iras.map((x) => x.account); let drawn = 0, pen = 0;
          t.taps.forEach((tp, i) => {
            const open = i === 0 ? st : r.rows[i - 1].age; if (!(open >= ev.fromRowOpening - 1e-9 && open < rollAt - 1e-9)) return;
            const prev = i === 0 ? null : t.taps[i - 1];
            ids.forEach((id) => { const b1 = tp.balances.find((b) => b.id === id), b0 = prev && prev.balances.find((b) => b.id === id); if (b0 && b1 && b1.b < b0.b - 0.005) drawn += b0.b - b1.b; });
            pen += Number(tp.penalties) || 0;
          });
          note += '; inherited window: IRA falls by $' + drawn.toFixed(2) + ' (draws net of growth), 10% tax charged $' + pen.toFixed(2);
        }
      }
      out.inherited.push(note);
    });
  }
  if (pr.communityProperty !== undefined) out.community.push('profile.communityProperty');
  // Arizona senior subtraction
  {
    let rows = 0, size = 0;
    for (const o of openings(p, r.rows)) {
      if (!(o.close - o.open > 1e-9)) continue; // the opening snapshot row (rows[0]) has no span
      const filing = E.householdFilingFor(p, o.open), ab = E.ageAmountAges(p, o.open, filing, o.close - o.open);
      const ded = E.seniorDeduction(Number(o.row.seniorDeductionMagi) || 0, ab.seniorDeductionAges, filing);
      if (ded > 0.005) { rows++; size += 0.025 * ded; }
      else if (mc && ab.seniorDeductionAges.some((a) => a >= 65)) rows++; // C4: a Monte Carlo row is exposed by age alone (a path's MAGI may differ from the median row's)
    }
    if (rows) out.azSenior.push(rows + ' rows; Arizona tax down by at most $' + size.toFixed(2) + ' over the plan (2.5% of the federal amount, while the Arizona base covers it)');
  }
  if (rt.azPost2011GainShare !== undefined) out.azGain.push('retirement.azPost2011GainShare');
  const pre = (r.issues || []).find((i) => i && i.code === 'IRMAA_PRE_PLAN_MAGI_ASSUMED');
  if (pre && ((adv.irmaaMagiTwoYearsBefore != null) !== (adv.irmaaMagiOneYearBefore != null))) out.irmaaPrePlan.push('one prior-year MAGI entered');
  if (mc) Object.keys(out).forEach((k) => { if (out[k].length) out[k].unshift('(monteCarlo: every path exposed)'); });
  else if (p.assumptions.method !== 'simple') Object.keys(out).forEach((k) => { if (out[k].length) out[k].unshift('(' + p.assumptions.method + ')'); });
  return out;
}
const KEYS = ['medicare', 'inherited', 'rolloverText', 'community', 'azSenior', 'azGain', 'irmaaPrePlan'];
for (const comp of ['control', 'expanded']) {
  const entries = plans(comp), movers = Object.fromEntries(KEYS.map((k) => [k, []])), any = new Set();
  for (const e of entries) { const s = scan(e); KEYS.forEach((f) => { if (s[f].length) { movers[f].push(e.name + ' [' + s[f].join('; ') + ']'); any.add(e.name); } }); }
  console.log('== ' + comp + ' (' + entries.length + ' plans); flagged under any condition: ' + any.size);
  KEYS.forEach((f) => console.log('  ' + f + ' (' + movers[f].length + '): ' + (movers[f].length ? '\n    ' + movers[f].join('\n    ') : 'none')));
  console.log('  not flagged (' + (entries.length - any.size) + '): ' + entries.filter((e) => !any.has(e.name)).map((e) => e.name).join(', '));
}

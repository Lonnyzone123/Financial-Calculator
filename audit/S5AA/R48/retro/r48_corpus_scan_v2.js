/* S5AA R48, the corrected prediction scan (the owner's decision of 2026-10-03: R48's miss M3 is not accepted as disclosed; prove a
   corrected scan on the pre-repair tree). Run it on ba9946d, the tree before the R48 edits.
   Usage: node r48_corpus_scan_v2.js <pre-repair tree>
   Held to the R44.1 checklist (C1-C8). It differs from audit/S5AA/R48/prediction/r48_corpus_scan.js (7fec79a) by these corrections:

   - C6, the missed reader (M3): the Arizona senior subtraction reaches TWO estimateTaxes() calls per row: the return itself and the
     wage-only BASELINE (simulatePlanRows(): `baseline=estimateTaxes(p,age,wages-deferrals,...)`), the tax the wages pay before the
     portfolio funds the rest. Each is read from the pre-repair engine through an output-neutral tap (tests/lib/engine-variant.js; the
     variant's rows are asserted identical to the engine's), which hands over each call's own MAGI and Arizona tax.
   - C2, the condition tests the flow it changes: R48 lowers a call's Arizona base by the federal senior deduction, clamped at 0, so the
     Arizona tax of that call falls by rate x min(deduction, base) -- only where the deduction is above 0 AND the pre-repair Arizona tax
     is above 0. The first scan read the deduction alone (a necessary condition), so it flagged 11 plans whose Arizona base was already 0.
   - C5, direction (M3, M5): the portfolio funds the return's tax less the baseline's. Per row, the first-order effect on the portfolio is
         + (the return's Arizona fall) - (the baseline's Arizona fall) - (the extra Medicare charge),
     positive meaning the total rises. Where the row spends an outside-income surplus (`surplusSpent` > 0 under surplus policy "spend"),
     the change is taken up by that spending and the total does not move (M5, seed:16). The direction predicted for a plan is that of its
     first exposed row whose effect the total shows; a plan whose every exposed row is absorbed is predicted "spending and taxes only".
   - C6, a second missed reader (found by this proof, expansion:s5aa-gap-working-household): in a retired row where someone still works,
     R35/R45's pay-first spends the net pay -- wages less contributions less the BASELINE tax -- before the portfolio. Where all of it is
     spent (the portfolio draws too), the baseline's fall is more pay spent and less drawn, so it returns to the portfolio; where the pay
     is not all spent, or the household still works, the baseline's fall leaves the model with the unspent pay.
   - Medicare (AA1-23): unchanged from the first scan (health on, a growth rate other than 0, someone 65+ charged in a row after the
     first), sized at the first tier, $3,185.68 a person, times ((1 + g)^yearProgress - 1).
   - Unchanged: the rollover message (SPOUSAL_ROLLOVER_ASSUMED raised: the expanded capture hashes issue text), and C4 -- a Monte Carlo
     plan is exposed by age alone (a path's MAGI differs from the median row's): named, every path exposed, the published result may move.
   - No corpus plan carries a new R48 input or passes a traditional IRA to a survivor under 59 1/2 (checked here again). */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(process.argv[2] || '.');
const SHELL = fs.readFileSync(path.join(ROOT, 'src', 'app-shell.html'), 'utf8');
global.RULES = JSON.parse(SHELL.match(/<script type="application\/json" id="v2b-rules-2026">([\s\S]*?)<\/script>/)[1]);
const cap = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
cap.installDebtModules();
const E = require(path.join(ROOT, 'src', 'engine.js'));
const { loadEngineVariant } = require(path.join(ROOT, 'tests', 'lib', 'engine-variant.js'));
const TAP = 'if(globalThis.__R48T)globalThis.__R48T({age:age,rowAge:rowAge,duration:duration,yearProgress:yearProgress,' +
  'ret:{magi:(taxesSettled||taxes).measures.senior_deduction_magi,az:(taxesSettled||taxes).az},base:{magi:baseline.measures.senior_deduction_magi,az:baseline.az},' +
  'surplusSpent:surplusSpent,retiredPaySpent:retiredPaySpent,costRetiredDuration:costRetiredDuration});';
const variant = loadEngineVariant([{ id: 'r48-tap', marker: 'rows.push(row);if(issues)checkRowInvariants(', replace: TAP + 'rows.push(row);if(issues)checkRowInvariants(' }]);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const MED_ONE = RULES.medicare.irmaa.partBMonthly[0] * 12 + RULES.medicare.partB.annualDeductible + RULES.medicare.partD.baseBeneficiaryMonthly * 12;
const money = (x) => (x < 0 ? '-' : '') + '$' + Math.abs(x).toFixed(2);

function scan(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan)), pr = p.profile || {}, adv = p.advanced || {}, rt = p.retirement || {};
  const mc = p.assumptions && p.assumptions.method === 'monteCarlo';
  const r = E.runPlan(JSON.parse(JSON.stringify(p)));
  const out = { name: entry.name, method: p.assumptions.method, exposed: [], direction: null, rows: [] };
  if (r.status !== 'ok' || !Array.isArray(r.rows)) { out.exposed.push('not run: ' + r.calculationErrorCode); return out; }
  ['medicareInflation', 'partDPremium'].forEach((k) => { if (adv[k] !== undefined) out.exposed.push('input advanced.' + k); });
  if (pr.communityProperty !== undefined) out.exposed.push('input profile.communityProperty');
  if (rt.azPost2011GainShare !== undefined) out.exposed.push('input retirement.azPost2011GainShare');
  const st = Number(pr.age), house = E.householdRetireAge(p), rate = RULES.arizona.rate;
  const roll = (r.issues || []).find((i) => i && i.code === 'SPOUSAL_ROLLOVER_ASSUMED');
  if (roll) {
    out.exposed.push('rollover message');
    const s = roll.state || {};
    (s.rollovers || []).forEach((ev) => {
      const surv = ev.to === 'spouse' ? Number(pr.spouseAge) + (ev.fromRowOpening - st) : ev.fromRowOpening;
      if (surv < 59.5 && (s.succession || []).some((x) => x.type === 'traditionalIRA' && x.balance > 0.005 && (ev.accounts || []).indexOf(x.account) >= 0)) out.exposed.push('INHERITED IRA');
    });
  }
  const g = fin(adv.medicareInflation) ? adv.medicareInflation : Number(adv.healthInflation) || 0;
  const medicareRow = (open, close) => {
    const yp = open - st, dur = close - open;
    if (adv.healthOn !== true || g === 0 || !(yp > 1e-9)) return 0;
    const ages = E.householdSeniorAges(p, open), retired = Math.max(0, close - Math.max(open, house));
    let charged = ages.filter((a) => a >= 65).length * retired;
    if (pr.spouseOn === true && ages[1] >= 65) charged += Math.max(0, dur - retired - E.householdWorkDurations(p, open, Number(pr.spouseAge) + yp, dur).spouse);
    return charged > 1e-9 ? MED_ONE * charged * (Math.pow(1 + g / 100, yp) - 1) : 0;
  };
  if (mc) {
    // C4: by age alone, on every path (identical on every path, so path 0 equals runPlan(runs: 1) trivially)
    let ageRows = 0, medRows = 0;
    for (let i = 1; i < r.rows.length; i++) {
      const open = r.rows[i - 1].age, close = r.rows[i].age, filing = E.householdFilingFor(p, open);
      if (E.ageAmountAges(p, open, filing, close - open).seniorDeductionAges.some((a) => a >= 65)) ageRows++;
      if (medicareRow(open, close) > 0) medRows++;
    }
    if (ageRows) out.exposed.push('Arizona senior subtraction by age, ' + ageRows + ' rows (Monte Carlo: every path exposed)');
    if (medRows) out.exposed.push('Medicare ' + medRows + ' rows (Monte Carlo)');
    out.direction = out.exposed.length ? 'Monte Carlo: named, every path exposed; the published result may move' : null;
    return out;
  }
  const taps = [];
  globalThis.__R48T = (t) => taps.push(JSON.parse(JSON.stringify(t)));
  let rv; try { rv = variant.runPlan(JSON.parse(JSON.stringify(p))); } finally { globalThis.__R48T = null; }
  if (JSON.stringify(rv.rows) !== JSON.stringify(r.rows)) throw new Error(entry.name + ': the tap is not output-neutral');
  if (taps.length !== r.rows.length - 1) throw new Error(entry.name + ': ' + taps.length + ' taps for ' + (r.rows.length - 1) + ' rows');
  const spends = adv.surplusPolicy === 'spend';
  let retRows = 0, baseRows = 0, medRows = 0, retSum = 0, baseSum = 0, medSum = 0;
  for (const t of taps) {
    const filing = E.householdFilingFor(p, t.age), ab = E.ageAmountAges(p, t.age, filing, t.duration);
    const fall = (c) => { const d = E.seniorDeduction(Number(c.magi) || 0, ab.seniorDeductionAges, filing); return d > 0.005 && c.az > 0.005 ? rate * Math.min(d, c.az / rate) : 0; };
    const retFall = fall(t.ret), baseFall = fall(t.base), med = medicareRow(t.age, t.rowAge);
    if (!(retFall > 0 || baseFall > 0 || med > 0)) continue;
    if (retFall > 0) { retRows++; retSum += retFall; }
    if (baseFall > 0) { baseRows++; baseSum += baseFall; }
    if (med > 0) { medRows++; medSum += med; }
    const absorbed = spends && t.surplusSpent > 0.005;
    /* C6 (found by this proof): in a row where the household is retired but someone still works, R35/R45's pay-first spends the net pay
       (wages less contributions less the BASELINE tax) before the portfolio. Where all of it is spent (the portfolio also draws), a
       lower baseline tax is more pay spent and less drawn, so the baseline's fall returns to the portfolio. */
    const row = r.rows.find((x) => Math.abs(x.age - t.rowAge) < 1e-9) || {};
    const payAllSpent = t.retiredPaySpent > 0.005 && Number(row.withdrawals) > 0.005;
    out.rows.push({ age: t.rowAge, effect: absorbed ? 0 : retFall - (payAllSpent ? 0 : baseFall) - med, absorbed });
  }
  if (retRows) out.exposed.push('return: Arizona falls in ' + retRows + ' rows, ' + money(retSum));
  if (baseRows) out.exposed.push('BASELINE (wages): Arizona falls in ' + baseRows + ' rows, ' + money(baseSum));
  if (medRows) out.exposed.push('Medicare ' + medRows + ' rows, about ' + money(medSum) + ' more charged');
  const first = out.rows.find((x) => !x.absorbed && Math.abs(x.effect) > 0.005);
  if (first) out.direction = 'total ' + (first.effect > 0 ? 'UP' : 'DOWN') + ' from the row closing at ' + first.age + ' (first-order effect ' + money(first.effect) + ')';
  else if (out.rows.length) out.direction = 'spending and taxes only: every exposed row is absorbed by surplus spending';
  else if (roll) out.direction = 'issue text only';
  return out;
}

const { entries, omissions } = cap.corpusWithDiagnostics({ composition: 'expanded' });
if (omissions.length) throw new Error('omissions: ' + JSON.stringify(omissions));
const results = entries.map(scan);
const named = results.filter((x) => x.exposed.length);
console.log('S5AA R48 corrected scan, expanded composition (' + entries.length + ' plans), on ' + ROOT.replace(/\\/g, '/').split('/').pop());
console.log('named: ' + named.length);
named.forEach((x) => console.log('  ' + x.name + ' [' + x.method + '] ' + x.exposed.join('; ') + ' => ' + x.direction));
console.log('not named (' + (entries.length - named.length) + '): ' + results.filter((x) => !x.exposed.length).map((x) => x.name).join(', '));
fs.writeFileSync(path.join(__dirname, 'r48_corpus_scan_v2_result.json'), JSON.stringify(results.map((x) => ({ name: x.name, method: x.method, exposed: x.exposed, direction: x.direction })), null, 1));

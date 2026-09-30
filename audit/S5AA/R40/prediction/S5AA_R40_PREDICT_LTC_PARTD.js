// A-01 predictions for R40's LTC and Part D repairs, from each plan's INPUTS and hand formulas (no engine arithmetic).
//   LTC (deterministic mode): the event starts at max(65, round(retireAge + 10)) and is weighted by its probability (engine
//   convention, unchanged). The repair inflates the care cost at healthInflation from the plan's start, as the pre-Medicare
//   health cost is; the insurance benefit stays as entered. Per row: dLTC = cost x ((1 + hi)^(open - start) - 1) x overlap x weight.
//   Part D: every person the engine charges Medicare for adds the 2026 base beneficiary premium, $38.99 a month (CMS, 2025-07-28),
//   flat like the other 2026 Medicare premiums. Per row: dPartD = 38.99 x 12 x people65 x retiredDuration.
// The row field `spending` is the requested total (spending + one-time + health + ltc + debt), so it should rise by exactly
// dLTC + dPartD in a row, where the strategy's base spending does not itself react to the lower balances.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const cb = require(path.join(ROOT, 'tools', 'capture-baseline.js'));
const comp = process.argv[2] || 'control';
const res = cb.corpusWithDiagnostics({ composition: comp });
const list = Array.isArray(res) ? res : (res.entries || []);
const PARTD = 38.99 * 12;
const out = [];
for (const e of list) {
  const p = e.plan, pr = p.profile, adv = p.advanced || {}, ret = p.retirement || {};
  const start = Number(pr.age), end = Number(pr.endAge), retire = Number(pr.retireAge);
  const bounds = []; for (let b = Math.floor(start) + 1; b <= Math.floor(end); b++) bounds.push(b); if (end % 1 !== 0) bounds.push(end);
  const rows = []; let open = start;
  for (const close of bounds) { rows.push([open, close]); open = close; }
  const ltcOn = adv.ltcOn && Number(adv.ltcCost) > Number(adv.ltcInsurance || 0) && Number(adv.ltcProbability) > 0 && Number(adv.ltcYears) > 0;
  const partDOn = !!adv.healthOn;
  if (!ltcOn && !partDOn) continue;
  const hi = Number(adv.healthInflation) / 100, ltcStart = Math.max(65, Math.round(retire + 10)), ltcEnd = ltcStart + Number(adv.ltcYears);
  const selfLife = Number(ret.selfLife), spouseLife = Number(ret.spouseLife);
  let sumLtc = 0, sumPartD = 0; const perRow = [];
  for (const [a, b] of rows) {
    let dLtc = 0, dPartD = 0;
    if (ltcOn) {
      const overlap = Math.max(0, Math.min(b, ltcEnd) - Math.max(a, ltcStart));
      if (overlap > 0) dLtc = Number(adv.ltcCost) * (Math.pow(1 + hi, a - start) - 1) * overlap * Number(adv.ltcProbability) / 100;
    }
    if (partDOn) {
      const retiredDuration = Math.max(0, b - Math.max(a, retire));
      let people = 0;
      if (a >= 65 - 1e-9 && !(Number.isFinite(selfLife) && a >= selfLife - 1e-9)) people++;
      if (pr.spouseOn) { const sa = Number(pr.spouseAge) + (a - start); if (sa >= 65 - 1e-9 && !(Number.isFinite(spouseLife) && sa >= spouseLife - 1e-9)) people++; }
      dPartD = PARTD * people * retiredDuration;
    }
    if (dLtc || dPartD) perRow.push({ age: b, dLtc: +dLtc.toFixed(2), dPartD: +dPartD.toFixed(2) });
    sumLtc += dLtc; sumPartD += dPartD;
  }
  if (sumLtc || sumPartD) out.push({ name: e.name, method: p.assumptions.method, strategy: ret.strategy, ltc: ltcOn ? { start: ltcStart, years: Number(adv.ltcYears), cost: Number(adv.ltcCost), prob: Number(adv.ltcProbability), hi: hi * 100 } : null,
    sumLtc: +sumLtc.toFixed(2), sumPartD: +sumPartD.toFixed(2), rows: perRow });
}
console.log(JSON.stringify({ composition: comp, members: out }, null, 1));

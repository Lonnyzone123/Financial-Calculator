/* S5AA R44 (R43-04; the owner 2026-10-01: "Fix the scan method" and "Prove it on R43"): build the CORRECTED R43 scans from the
   committed R43 scans, so the diff between each pair is exactly the correction and nothing else.
   Usage: node audit/S5AA/R44/prediction/retro/make_v2_scans.js   (writes *_v2.js beside this file)
   Each correction names the checklist item (audit/S5AA/R44/S5AA_R44_PREDICTION_CHECKLIST_20261001.md) it applies. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const SRC = path.join(__dirname, '..', '..', '..', 'R43', 'prediction');
const rep = (t, a, b, what) => { const n = t.split(a).length - 1; if (n !== 1) throw new Error(what + ': expected 1 match, found ' + n); return t.replace(a, b); };
const head = (name, items) => '/* S5AA R44 CORRECTED COPY of audit/S5AA/R43/prediction/' + name + ' (R43-04). Corrections:\n' + items.map((s) => '   - ' + s).join('\n') + '\n   Everything else is the R43 scan unchanged. */\n';

// ---- part 2: tax --------------------------------------------------------------------------------------------------------
{
  let t = fs.readFileSync(path.join(SRC, 'tax_corpus_scan.js'), 'utf8');
  t = rep(t,
    "        const owner = a.owner === 'spouse' ? 'spouse' : 'self', oa = owner === 'spouse' ? spouseAge : age;\n",
    "        const owner = a.owner === 'spouse' ? 'spouse' : 'self', oa = owner === 'spouse' ? spouseAge : age;\n" +
    "        // R44 C2 (SA43-A): a limit can only move a deposit the engine makes -- the owner's IRA window, by the engine's own helper, must be open in the row.\n" +
    "        const win = E.ownerContributionWindow(p, age, spouseAge, dur).durations;\n" +
    "        if (!((owner === 'spouse' ? win.spouseIra : win.selfIra) > 1e-9)) return;\n",
    'f08 window');
  t = rep(t,
    "  const magis = rows.slice(1).map((x) => x.federalAgi).concat([Number(adv.irmaaMagiTwoYearsBefore) || 0, Number(adv.irmaaMagiOneYearBefore) || 0]);\n",
    "  const prePlan = [Number(adv.irmaaMagiTwoYearsBefore) || 0, Number(adv.irmaaMagiOneYearBefore) || 0];\n" +
    "  const magis = rows.slice(1).map((x) => x.federalAgi).concat(prePlan);\n" +
    "  // R44 C4 (SA43-B): a Monte Carlo plan's per-path figures are what a per-path rule reads -- IRMAA is charged on each path's own\n" +
    "  // lookback MAGI -- so each path is simulated with the engine's own seeding (that tree's), and the aggregated rows are not used.\n" +
    "  const pathMagis = p.assumptions.method === 'monteCarlo' ? monteCarloPaths(p).map((pr0) => pr0.slice(1).map((x) => x.federalAgi).concat(prePlan)) : [magis];\n",
    'f22 paths');
  t = rep(t,
    "        if (lo !== hi && magis.some((m) => m > lo - 1e-9 && m < hi + 1e-9)) { out.f22.push(rowAge + ' tier ' + i + ' ' + lo + '-' + hi); break; }",
    "        const hit = pathMagis.findIndex((ms) => ms.some((m) => m > lo - 1e-9 && m < hi + 1e-9));\n" +
    "        if (lo !== hi && hit >= 0) { out.f22.push(rowAge + ' tier ' + i + ' ' + lo + '-' + hi + (pathMagis.length > 1 ? ' (path ' + hit + ' of ' + pathMagis.length + ')' : '')); break; }",
    'f22 test');
  // R44 C6 (SA43-B, its real cause): EVERY READER of the changed rule. The joint IRMAA thresholds are read by the IRMAA charge (health
  // costs on) and by the optimized withdrawal order's IRMAA guard (smartWithdrawalOrder: irmaaGuard on, 63 or over, next threshold minus
  // the latest MAGI below the larger of $10,000 and 35% of spending). The guard condition is given its own test, per path, against the
  // engine's own indexed rules (taxYearRules), with the planned new joint table: twice each indexed single threshold, the top kept.
  t = rep(t, "    // SA42F-23\n",
    "    // SA42F-22, second reader (R44 C6): the optimized withdrawal order's IRMAA guard\n" +
    "    if (r.withdrawalOrder === 'optimized' && r.irmaaGuard && filing === 'mfj' && age >= 63 && k >= 2 && infl !== 0) {\n" +
    "      const yr = k - 1, f = Math.pow(1 + infl, yr), w = Math.pow(1 + (Number(p.employment.growth) || 0) / 100, yr);\n" +
    "      const R0 = E.taxYearRules(BASE, f, w, yr, 1 + infl), oldJ = R0.medicare.irmaa.jointThresholds, sing = R0.medicare.irmaa.singleThresholds;\n" +
    "      const newJ = oldJ.map((x, i) => (i < sing.length - 1 ? 2 * sing[i] : x));\n" +
    "      const W = Math.max(10000, (Number(r.spending) || 0) * 0.35), guard = (T, m) => ((T.find((x) => x > m) || Infinity) - m < W);\n" +
    "      // a flipped guard only re-weights the pre-tax class; it moves the plan only if the ORDER changes, so the engine's own\n" +
    "      // smartWithdrawalOrder() is asked under both tables, with that path's opening class balances (each class's balance shared\n" +
    "      // equally among its accounts) and its MAGI history.\n" +
    "      const Rn = JSON.parse(JSON.stringify(R0)); Rn.medicare.irmaa.jointThresholds = newJ;\n" +
    "      const orderUnder = (R, pr0) => { const saved = global.RULES; global.RULES = R; try {\n" +
    "        const open = pr0[k - 1], byClass = {}; (p.accounts || []).forEach((a) => { byClass[a.taxClass] = (byClass[a.taxClass] || 0) + 1; });\n" +
    "        const accs = (p.accounts || []).map((a) => Object.assign({}, a, { balance: (Number(open[a.taxClass]) || 0) / byClass[a.taxClass] }));\n" +
    "        const prior = k >= 2 && pr0[k - 2] && pr0[k - 2].total > 0 ? open.total / pr0[k - 2].total - 1 : 0;\n" +
    "        return JSON.stringify(E.smartWithdrawalOrder(p, age, accs, pr0.slice(1, k).map((x) => x.magi), prior)); } finally { global.RULES = saved; } };\n" +
    "      const hit = pathRows.findIndex((pr0) => { const m = Number(pr0[k - 1] && pr0[k - 1].magi) || 0; return guard(oldJ, m) !== guard(newJ, m) && orderUnder(R0, pr0) !== orderUnder(Rn, pr0); });\n" +
    "      if (hit >= 0) out.f22.push(rowAge + ' withdrawal order changes' + (pathRows.length > 1 ? ' (path ' + hit + ' of ' + pathRows.length + ')' : ''));\n" +
    "    }\n" +
    "    // SA42F-23\n", 'f22 guard reader');
  t = rep(t,
    "  const pathMagis = p.assumptions.method === 'monteCarlo' ? monteCarloPaths(p).map((pr0) => pr0.slice(1).map((x) => x.federalAgi).concat(prePlan)) : [magis];\n",
    "  const pathRows = p.assumptions.method === 'monteCarlo' ? monteCarloPaths(p) : [rows];\n" +
    "  const pathMagis = p.assumptions.method === 'monteCarlo' ? pathRows.map((pr0) => pr0.slice(1).map((x) => x.federalAgi).concat(prePlan)) : [magis];\n",
    'pathRows');
  t = rep(t, "function scan(entry) {",
    "// R44 C4: every path of a Monte Carlo plan, seeded as this tree's runPlan seeds it. Its path 0 is checked against runPlan(runs: 1).\n" +
    "function monteCarloPaths(p) {\n" +
    "  const n = Number(p.assumptions.runs), base0 = Number(p.assumptions.seed), base = Number.isFinite(base0) ? base0 : 0;\n" +
    "  const seedOf = (i, k) => (typeof E.monteCarloPathSeed === 'function' ? E.monteCarloPathSeed(base, i, k) : base + i * 2 + k);\n" +
    "  const out = [];\n" +
    "  for (let i = 0; i < n; i++) out.push(E.simulatePlan(JSON.parse(JSON.stringify(p)), E.rng(seedOf(i, 0)), 0, E.rng(seedOf(i, 1)), []).rows);\n" +
    "  const one = JSON.parse(JSON.stringify(p)); one.assumptions.runs = 1;\n" +
    "  const viaRun = E.runPlan(one).rows.map((x) => x.total), direct = out[0].map((x) => x.total);\n" +
    "  if (JSON.stringify(viaRun) !== JSON.stringify(direct)) throw new Error('C4 self-check: path 0 does not reproduce runPlan(runs: 1)');\n" +
    "  return out;\n" +
    "}\n\nfunction scan(entry) {", 'paths fn');
  fs.writeFileSync(path.join(__dirname, 'tax_corpus_scan_v2.js'), head('tax_corpus_scan.js', [
    'C2 (SA43-A): SA42F-08 flags a row only while the owner\'s IRA contribution window is open (E.ownerContributionWindow).',
    'C4 (SA43-B): SA42F-22 reads each Monte Carlo path\'s own figures, simulated with the tree\'s seeding, not the aggregated rows.',
    'C6 (SA43-B): SA42F-22 tests every reader of the joint thresholds -- the IRMAA charge and the optimized withdrawal order\'s IRMAA guard.']) + t);
}

// ---- part 3: contributions ---------------------------------------------------------------------------------------------
{
  let t = fs.readFileSync(path.join(SRC, 'contrib_corpus_scan.js'), 'utf8');
  t = rep(t, "\nconst KEYS = ",
    "\n// R44 C5 (SA43-C): a direction is read from the pre-repair engine run on an INPUT that does what the repair does, where one exists.\n" +
    "// HSA at 65: the same plan with every HSA's planned contribution ending at its owner's 65th birthday (a future change to 0 there),\n" +
    "// which neither deposits nor redirects past 65 -- what the ruling does. The direction of each headline figure is printed.\n" +
    "function hsa65Direction(entry) {\n" +
    "  const p = JSON.parse(JSON.stringify(entry.plan)), pr = p.profile;\n" +
    "  const q = JSON.parse(JSON.stringify(p));\n" +
    "  (q.accounts || []).forEach((a) => {\n" +
    "    if (!a || a.type !== 'hsa') return;\n" +
    "    // a change's age is on its account owner's own clock, so 65 for either owner; at this tree a change inside a row starts at the\n" +
    "    // next row, where the ruling prorates -- the same direction, a slightly smaller size\n" +
    "    a.futureChanges = (a.futureChanges || []).filter((c) => Number(c.age) < 65 - 1e-9).concat([{ age: 65, mode: 'set', value: 0 }]);\n" +
    "  });\n" +
    "  const A = E.runPlan(JSON.parse(JSON.stringify(p))), B = E.runPlan(JSON.parse(JSON.stringify(q)));\n" +
    "  const last = (r) => r.rows[r.rows.length - 1], sum = (r, k) => r.rows.reduce((s, x) => s + (Number(x[k]) || 0), 0);\n" +
    "  const d = (x, y) => (Math.abs(y - x) < 0.005 ? 'same' : (y > x ? 'rises ' : 'falls ') + Math.abs(y - x).toFixed(0));\n" +
    "  return { taxes: d(sum(A, 'taxes'), sum(B, 'taxes')), taxable: d(last(A).taxable, last(B).taxable), hsa: d(last(A).hsa, last(B).hsa), contributions: d(sum(A, 'contributions'), sum(B, 'contributions')), stopApplied: JSON.stringify(A.rows) !== JSON.stringify(B.rows) };\n" +
    "}\n\nconst KEYS = ", 'direction fn');
  fs.writeFileSync(path.join(__dirname, 'contrib_corpus_scan_v2.js'), head('contrib_corpus_scan.js', [
    'C5 (SA43-C): hsa65Direction() reads the direction of taxes, the taxable and HSA balances and contributions from the pre-repair engine run on the plan with each HSA contribution ended at 65. The flags are unchanged.']) + t +
    "\n// R44 C5: the direction for every plan the hsa65 flag names.\nfor (const comp of ['control', 'expanded']) for (const e of plans(comp)) { if (scan(e).hsa65.length) console.log('== C5 direction (' + comp + ') ' + e.name + ': ' + JSON.stringify(hsa65Direction(e))); }\n");
}

// ---- part 4a: life events ----------------------------------------------------------------------------------------------
{
  let t = fs.readFileSync(path.join(SRC, 'life_corpus_scan.js'), 'utf8');
  t = rep(t, "      const spouseAlive = spouseDeathAtSelf > age;\n",
    "      // R44 C1 (SA43-D): who is alive is the engine's own answer (householdSeniorAges, decision 7: alive at the row's opening in the\n" +
    "      // year of death), not a strict death-after-opening test.\n" +
    "      const spouseAlive = E.householdSeniorAges(p, age)[1] >= 0;\n", 'alive');
  fs.writeFileSync(path.join(__dirname, 'life_corpus_scan_v2.js'), head('life_corpus_scan.js', [
    'C1 (SA43-D): SA42F-11 reads whether the spouse is alive from E.householdSeniorAges(), the engine\'s survivorship rule.']) + t);
}

// ---- part 4b: cash flows -----------------------------------------------------------------------------------------------
{
  let t = fs.readFileSync(path.join(SRC, 'flows_corpus_scan.js'), 'utf8');
  t = rep(t,
    "    if (st > start + shift(s.owner) + 1e-9 && atSelf < end - 1e-9) out.f20.push('stream ' + i + ' ' + s.type + ' ' + (s.growthMode || 'fixed') + ' from ' + st);\n",
    "    // R44 C3 (SA43-E): the stream must pay -- the engine's own income function, given only this stream, pays something in a row\n" +
    "    // of the horizon (a stream that starts and ends at the same age pays nothing).\n" +
    "    const only = JSON.parse(JSON.stringify(p)); only.retirement.otherIncomes = [JSON.parse(JSON.stringify(s))];\n" +
    "    const pays = rows.slice(1).some((row, k) => Math.abs(E.otherIncomeFor(only, rows[k].age, row.age, 1, 0).cash) > 1e-9);\n" +
    "    if (pays && st > start + shift(s.owner) + 1e-9 && atSelf < end - 1e-9) out.f20.push('stream ' + i + ' ' + s.type + ' ' + (s.growthMode || 'fixed') + ' from ' + st);\n",
    'stream pays');
  fs.writeFileSync(path.join(__dirname, 'flows_corpus_scan_v2.js'), head('flows_corpus_scan.js', [
    'C3 (SA43-E): SA42F-20 flags a stream only if E.otherIncomeFor() pays it in some row of the horizon.']) + t);
}
console.log('wrote tax, contrib, life and flows _v2 scans');

/* S5AA R51 prediction scan: the owner's follow-up decisions on R46-R50 (2026-10-03). Run on a tree BEFORE the R51 engine edits.
   Usage: node audit/S5AA/R51/prediction/r51_corpus_scan.js [<source tree>]
   Held to audit/S5AA/R44.1/S5AA_R44_1_PREDICTION_CHECKLIST_20261001.md.

   Run twice: on the base (5119d03) and on a scratch copy of the base whose defaultPlan carries flexibility 0 (decision 1, the only
   edit), because the corpus inputs built from defaultPlan move with decision 1 and decisions 2 and 3 act on those moved inputs.

   C1: every condition reads the engine's own state through read-only taps in an in-memory variant of the tree's src/engine.js
   (tests/lib/engine-variant.js); the variant's rows are asserted equal to the real engine's for every plan, so the taps change
   nothing. Each tap also re-derives TODAY's figure from the tapped state and asserts it equals the engine's own (the health block's
   `health`, the working check's issue), so the new-rule figure is computed on the same state the engine used.

   Decision 2 (one Medicare date): each living person's Medicare charge starts at THEIR medicareStartAge() (the engine's own helper,
   R47) instead of the row-opening age 65; the pre-Medicare cost runs until then. Inside a row the start is placed on the primary's
   clock (start - the person's opening age + the primary's opening age) and each person's share of the row is split there, as the
   HSA's stop (R47) already is. Per row (path 0; Monte Carlo: every path):
     today:  pre = hd x #(alive, opening < 65); med = crd x #(alive, opening >= 65); idle-spouse = idle x [spouse opening >= 65]
     R51:    pre = sum over the living of |[age, min(rowAge, s_i)] n [rowAge - hd, rowAge]|
             med = sum over the living of min(crd, clamp(rowAge - s_i, 0, duration))
             idle-spouse = |[age + ws, rowAge - crd] n [s_spouse, rowAge]|
     health = cost / modelled x pre + charge x (med + idle)    (crd: the household's retired tail; hd: the pre-Medicare span's tail;
                                                                 ws: the spouse's work from the opening; charge: medicareChargePerPerson())
   Condition: a row whose R51 health differs from today's by more than half a cent. The size is that difference summed (first order:
   the row's spending moves by it; withdrawals, taxes and balances follow).
   The IRMAA first-years disclosure: today fires when, in plan year 0 or 1, someone alive at the opening is 65+ and the household
   date falls inside the row; R51: someone alive at the opening whose Medicare start (on the primary's clock) falls before the row's
   end. The partial-first-year IRMAA disclosure: "someone 65 or over by plan year 2" becomes "someone whose Medicare span in plan year 2 is positive"
   (its row opening at floor(age) + 2). Both conditions are evaluated with the engine's exports; today's must equal the engine's issue list.

   Decision 3 (the working-years check counts streams as pay): the check's pay gains the employment and self-employment streams paid
   in the row's working part (otherIncomeFor() over [age, age + duration - crd], the engine's own function), less their share of the
   payroll and SE tax the engine computes on them (the full return's payroll less the wage-only return's, prorated by the working
   part of the streams' pay). The pay can only rise, so the warning can only disappear, move later or shrink. */
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

const M = require('./r51_mirror.js');
const T = { on: false, path: -1, health: [], work: [] };
globalThis.__R51 = T;
const V = M.makeVariant(loadEngineVariant, '__R51');
const money = (x) => (x < 0 ? '-' : '') + '$' + Math.abs(Math.round(x)).toLocaleString('en-US');
function scan(entry) {
  const p = JSON.parse(JSON.stringify(entry.plan)), out = { medicare: [], irmaa: [], partial: [], working: [] };
  T.on = true; T.path = -1; T.health = []; T.work = [];
  let rv;
  try { rv = V.runPlan(JSON.parse(JSON.stringify(p))); } finally { T.on = false; }
  const r = E.runPlan(JSON.parse(JSON.stringify(p)));
  if (JSON.stringify(rv.rows) !== JSON.stringify(r.rows) || rv.successRate !== r.successRate) throw new Error(entry.name + ': the taps are not output-neutral');
  const mc = p.assumptions.method === 'monteCarlo', issues = r.issues || [];
  // decision 2: the health block
  if (p.advanced && p.advanced.healthOn) {
    const moved = [], paths = new Set();
    T.health.forEach((h) => {
      const v = M.healthPair(E, p, h);
      if (Math.abs(v.old - h.health) > 1e-6 * Math.max(1, Math.abs(h.health))) throw new Error(entry.name + ': today\'s health mirror ' + v.old + ' != engine ' + h.health + ' at ' + h.age + ' path ' + h.path);
      if (Math.abs(v.neu - v.old) > 0.005) { paths.add(h.path); if (h.path === 0) moved.push({ age: h.age, d: v.neu - v.old, v }); }
    });
    if (paths.size) {
      const sum = moved.reduce((t, m) => t + m.d, 0);
      out.medicare.push((mc ? 'Monte Carlo: ' + paths.size + ' of ' + p.assumptions.runs + ' paths exposed; ' : '') + moved.length + ' rows (path 0) from ' + (moved[0] ? moved[0].age : '-') +
        ' to ' + (moved.length ? moved[moved.length - 1].age : '-') + '; health in those rows ' + (sum >= 0 ? '+' : '') + money(sum) + ' summed (' +
        moved.slice(0, 4).map((m) => m.age + ': ' + money(m.v.old) + ' -> ' + money(m.v.old + m.d) + ' [pre ' + m.v.preOld + '->' + +m.v.preNew.toFixed(4) + ', med ' + m.v.medOld + '->' + +m.v.medNew.toFixed(4) + ']').join('; ') + (moved.length > 4 ? '; ...' : '') + ')');
    }
  }
  // decision 2: the two IRMAA disclosures
  const hasIrmaa = issues.some((i) => i.code === 'IRMAA_PRE_PLAN_MAGI_ASSUMED'), oldIrmaa = M.irmaaFirstYears(E, p, false), newIrmaa = M.irmaaFirstYears(E, p, true);
  if (oldIrmaa !== hasIrmaa) throw new Error(entry.name + ': today\'s IRMAA first-years mirror ' + oldIrmaa + ' != engine ' + hasIrmaa);
  if (newIrmaa !== oldIrmaa) out.irmaa.push('IRMAA_PRE_PLAN_MAGI_ASSUMED ' + (newIrmaa ? 'gained' : 'removed'));
  const hasPartial = issues.some((i) => i.code === 'IRMAA_PARTIAL_FIRST_YEAR_COMPLETED');
  if (hasPartial && !M.partialAgeTest(E, p, false)) throw new Error(entry.name + ': the partial-year disclosure fired without its age test');
  if (hasPartial && !M.partialAgeTest(E, p, true)) out.partial.push('IRMAA_PARTIAL_FIRST_YEAR_COMPLETED removed');
  if (!hasPartial && p.advanced && p.advanced.healthOn && !M.partialAgeTest(E, p, false) && M.partialAgeTest(E, p, true) && Number(p.profile.age) % 1 !== 0) out.partial.push('IRMAA_PARTIAL_FIRST_YEAR_COMPLETED may be gained (a start reached inside plan year 2)');
  // decision 3: the working-years check
  const w0 = T.work.filter((w) => w.path === 0);
  const firstOld = w0.find((w) => w.ran && w.oldPay < -0.005);
  const issue = issues.find((i) => i.code === 'WORKING_YEARS_NOT_FUNDED_BY_PAY');
  if (!!firstOld !== !!issue || (issue && (issue.state.age !== firstOld.age || Math.abs(issue.state.shortfall + firstOld.oldPay) > 1e-6))) throw new Error(entry.name + ': today\'s working-years mirror disagrees with the engine');
  const newPay = M.newPay;
  const firstNew = w0.find((w) => w.ran && newPay(w) < -0.005);
  const streams = w0.filter((w) => w.ran && w.streamWorking > 0);
  if (streams.length && (firstOld || firstNew)) {
    const desc = (w, f) => (w ? 'age ' + w.age + ', short ' + money(-f(w)) : 'none');
    if (!firstOld !== !firstNew || (firstOld && (firstOld.age !== firstNew.age || Math.abs(newPay(firstNew) - firstOld.oldPay) > 0.005)))
      out.working.push('WORKING_YEARS_NOT_FUNDED_BY_PAY: ' + desc(firstOld, (w) => w.oldPay) + ' -> ' + desc(firstNew, newPay) + ' (streams in ' + streams.length + ' working rows, first at ' + streams[0].age + ': ' + money(streams[0].streamWorking) + ' less ' + money(streams[0].streamRow > 0 ? streams[0].streamTax * streams[0].streamWorking / streams[0].streamRow : 0) + ' payroll/SE tax)');
  }
  if (p.assumptions.method !== 'simple') Object.keys(out).forEach((k) => { if (out[k].length) out[k].unshift('(' + p.assumptions.method + ')'); });
  return out;
}
const KEYS = ['medicare', 'irmaa', 'partial', 'working'];
const plans = (comp) => {
  const { entries, omissions } = cap.corpusWithDiagnostics({ composition: comp });
  if (omissions.length) throw new Error(comp + ' omissions: ' + JSON.stringify(omissions));
  return entries;
};
console.log('tree ' + ROOT.replace(/\\/g, '/').replace(/^.*\/(fc-wt-r51|base|flex0)$/, '$1') + '; defaultPlan flexibility ' + (SHELL.match(/flexibility:(\d+),irmaaGuard/) || [])[1]);
for (const comp of ['control', 'expanded']) {
  const entries = plans(comp), movers = Object.fromEntries(KEYS.map((k) => [k, []]));
  let health = 0, streamsAny = 0;
  for (const e of entries) {
    const s = scan(e);
    if (e.plan.advanced && e.plan.advanced.healthOn) health++;
    if ((e.plan.retirement.otherIncomes || []).some((i) => i && (i.type === 'employment' || i.type === 'selfEmployment'))) streamsAny++;
    KEYS.forEach((f) => { if (s[f].length) movers[f].push(e.name + ' [' + s[f].join('; ') + ']'); });
  }
  console.log('== ' + comp + ' (' + entries.length + ' plans; health on in ' + health + '; an employment or self-employment stream in ' + streamsAny + ')');
  KEYS.forEach((f) => console.log('  ' + f + ' (' + movers[f].length + '): ' + (movers[f].length ? '\n    ' + movers[f].join('\n    ') : 'none')));
}

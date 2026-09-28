'use strict';

/*
 * S5 block 2s.2 -- every configured corpus path executes at least once, except
 * the gaps pinned on 2026-09-14, and that list only shrinks.
 *
 * A corpus scenario configured a pretax-to-taxable transfer and never ran it:
 * its plan was $0 from the first row, and nothing in the harness noticed a
 * scenario that had stopped being a test. Decided 2026-09-14 (the owner, answer
 * (ii)): land the check with a pinned, shrink-only list of today's gaps, so a
 * NEW gap fails loudly without blocking the corpus freeze on every old one.
 *
 * WHAT A PATH IS, so the blind spots are stated as well:
 *   - each engine-read boolean flag in src/boolean-flag-contract.json. A flag
 *     inside a list, such as accounts[].matchOn, counts each true instance;
 *   - one branch the flags cannot see: a transfer from a preTax account to a
 *     taxable one, which the engine taxes as ordinary income. transferOn itself
 *     executes elsewhere in the corpus, so at flag level this path is invisible.
 *   NOT covered: enum choices (strategy, withdrawal order, stage modes, method),
 *   numeric thresholds, and a flag that no scenario sets.
 *
 * WHAT EXECUTES MEANS: turning the path off moves runPlan()'s status, error
 * code or rows in at least one scenario of the expanded composition that
 * configures it. The result's featureFlags echo and runScenario()'s identity
 * block restate the input, so either would call every path live; neither is
 * compared.
 *
 * WHERE THE LIST LIVES: tools/corpus-path-gaps.json, a corpus record beside
 * tools/control-corpus.json. A corpus change that makes a gap execute removes
 * it there, in the corpus commit itself, since a corpus change is never folded
 * into an instrument commit. GAPS_WHEN_PINNED is this file's frozen copy of the
 * list as pinned. The record may only be a subset of it, so ADDING a gap needs
 * an edit here, to the instrument, where it shows.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const baseline = require('../tools/capture-baseline.js');
baseline.installDebtModules();
const engine = require('../src/engine.js');

const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'boolean-flag-contract.json'), 'utf8'));
const RECORD = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'corpus-path-gaps.json'), 'utf8'));
const ENGINE_SOURCE = fs.readFileSync(path.join(ROOT, 'src', 'engine.js'), 'utf8');

const TRANSFER_PATH = 'advanced.transferOn: preTax -> taxable';
const GAPS_WHEN_PINNED = ['advanced.rule55', TRANSFER_PATH, 'retirement.guytonSkipInflation', 'retirement.preserveRoth'];

/* Not engine PATHS -- paths the engine reads without branching a projection on them.

   rollingHistory: the engine's one read restates it in the identity block, which runPlan() does not
   return; the app's rolling comparison is its consumer. A guard below fails if the engine starts
   reading it elsewhere.

   armRecastOnReset: S5AA task 5.1 (Q94, F8) RETIRED IT AS A SWITCH. An adjustable-rate loan always
   re-amortises at its reset now, so no projection branches on this key and no scenario can "execute"
   it. The engine's one remaining read tells a plan that carries it, and holds an adjustable debt, that
   its numbers have moved -- a disclosure, not a branch. It is listed HERE rather than added to
   tools/corpus-path-gaps.json because it is not a gap in the corpus: there is nothing left to reach. */
const NOT_ENGINE_PATHS = ['assumptions.rollingHistory', 'advanced.armRecastOnReset'];
const PATHS = CONTRACT.flags
  .filter((f) => f.reader === 'engine' && !NOT_ENGINE_PATHS.includes(f.path))
  .map((f) => f.path)
  .concat([TRANSFER_PATH]);

const clone = (v) => JSON.parse(JSON.stringify(v));
const outcome = (plan) => {
  const r = engine.runPlan(clone(plan));
  return JSON.stringify({ status: r.status, code: r.calculationErrorCode || null, rows: r.rows });
};
const walk = (obj, dotted) => dotted.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);

/* Every configured instance of a path in one plan, each as off(copy), which turns that one instance off. */
function instancesOf(plan, name) {
  if (name === TRANSFER_PATH) {
    const adv = plan.advanced || {};
    if (adv.transferOn !== true) return [];
    const classOf = (id) => { const a = (plan.accounts || []).find((x) => x && x.id === id); return a ? a.taxClass : null; };
    return classOf(adv.transferFrom) === 'preTax' && classOf(adv.transferTo) === 'taxable' ? [(q) => { q.advanced.transferOn = false; }] : [];
  }
  const list = /^(.*)\[\]\.(\w+)$/.exec(name);
  if (!list) {
    const parent = name.slice(0, name.lastIndexOf('.'));
    const key = name.slice(name.lastIndexOf('.') + 1);
    const holder = walk(plan, parent);
    return holder && typeof holder === 'object' && holder[key] === true ? [(q) => { walk(q, parent)[key] = false; }] : [];
  }
  const items = walk(plan, list[1]);
  if (!Array.isArray(items)) return [];
  return items
    .map((item, i) => (item && typeof item === 'object' && item[list[2]] === true ? (q) => { walk(q, list[1])[i][list[2]] = false; } : null))
    .filter(Boolean);
}

/* { path: { configured, executed, configuredIn, executedIn } } over the given entries. */
function census(entries) {
  const out = {};
  for (const { name, plan } of entries) {
    let base = null;
    for (const p of PATHS) {
      for (const off of instancesOf(plan, p)) {
        if (base === null) base = outcome(plan);
        const q = clone(plan);
        off(q);
        const s = (out[p] = out[p] || { configured: 0, executed: 0, configuredIn: [], executedIn: [] });
        s.configured++;
        if (!s.configuredIn.includes(name)) s.configuredIn.push(name);
        if (outcome(q) !== base) { s.executed++; if (!s.executedIn.includes(name)) s.executedIn.push(name); }
      }
    }
  }
  return out;
}
function merge(a, b) {
  const out = clone(a);
  for (const [p, s] of Object.entries(b)) {
    const t = (out[p] = out[p] || { configured: 0, executed: 0, configuredIn: [], executedIn: [] });
    t.configured += s.configured; t.executed += s.executed;
    t.configuredIn.push(...s.configuredIn); t.executedIn.push(...s.executedIn);
  }
  return out;
}
function verdict(c, pinned) {
  const gaps = Object.keys(c).filter((p) => c[p].executed === 0).sort();
  return { gaps, unpinned: gaps.filter((g) => !pinned.includes(g)), stale: pinned.filter((g) => !gaps.includes(g)) };
}

const corpusEntries = () => baseline.corpus({ composition: RECORD.composition });
let memo = null;
const corpusCensus = () => memo || (memo = census(corpusEntries()));

/* A plan built to reach each pinned gap's branch, from a corpus plan. Each was measured
   executing before this check landed, so a pinned gap is a fact about the corpus and
   not a blind spot of the check. */
function reachingPlan(gap, entries) {
  const base = clone(entries.find((e) => e.name === 'seed:1').plan);
  base.retirement.stages = [];
  if (gap === TRANSFER_PATH) return base;
  base.advanced.transferOn = false;
  base.advanced.conversionOn = false;
  if (gap === 'advanced.rule55') {
    base.profile.age = 55; base.profile.retireAge = 55;
    base.advanced.penaltyException = false; base.advanced.rule55 = true;
    base.accounts.forEach((a) => { if (a.taxClass !== 'preTax') a.balance = 0; });
    return base;
  }
  if (gap === 'retirement.guytonSkipInflation') {
    base.retirement.strategy = 'guyton';
    base.assumptions.method = 'historical'; base.assumptions.historyStart = 1929;
    base.retirement.guytonSkipInflation = true;
    return base;
  }
  if (gap === 'retirement.preserveRoth') {
    const donor = entries.find((e) => e.plan.retirement && e.plan.retirement.withdrawalOrder !== 'manual'
      && (e.plan.accounts || []).some((a) => a.taxClass === 'roth') && (e.plan.accounts || []).some((a) => a.taxClass === 'hsa'));
    assert.ok(donor, 'a non-manual corpus scenario holds both a roth and an hsa account');
    const p = clone(donor.plan);
    p.retirement.stages = [];
    p.profile.age = 66; p.profile.retireAge = 66;
    p.advanced.healthOn = true; p.advanced.healthCost = p.advanced.healthCost || 8000; p.advanced.healthInflation = p.advanced.healthInflation || 5;
    p.advanced.legacy = 0; p.advanced.transferOn = false; p.advanced.conversionOn = false;
    p.retirement.optimizationGoal = 'balanced'; p.retirement.preserveRoth = true;
    p.accounts.forEach((a) => { if (a.taxClass !== 'roth' && a.taxClass !== 'hsa') a.balance = 0; });
    return p;
  }
  throw new Error('no reaching plan for ' + gap);
}

test('corpus paths: every configured path executes somewhere in the corpus, except the pinned gaps, and each pinned gap is still one', (t) => {
  const c = corpusCensus();
  const v = verdict(c, RECORD.gaps);
  RECORD.gaps.forEach((g) => t.diagnostic(g + ': configured ' + (c[g] ? c[g].configured : 0) + ', executed ' + (c[g] ? c[g].executed : 0)));
  t.diagnostic(Object.keys(c).length + ' configured paths over ' + corpusEntries().length + ' scenarios');
  assert.deepEqual(v.unpinned, [],
    'configured in the corpus but executed by no scenario, and not a pinned gap: ' + v.unpinned.join(', ') +
    '. A corpus scenario has stopped testing what it configures.');
  assert.deepEqual(v.stale, [],
    'pinned as a gap but now executed: ' + v.stale.join(', ') + '. Remove it from tools/corpus-path-gaps.json; the list only shrinks.');
});

test('corpus paths: the pinned list only shrinks, and names only paths this check computes', () => {
  assert.equal(RECORD.composition, 'expanded');
  assert.ok(Array.isArray(RECORD.gaps) && RECORD.gaps.every((g) => typeof g === 'string'), 'the record lists gap names');
  assert.deepEqual([...RECORD.gaps].sort(), RECORD.gaps, 'sorted, so a removal is a one-line diff');
  assert.equal(new Set(RECORD.gaps).size, RECORD.gaps.length, 'no name twice');
  const added = RECORD.gaps.filter((g) => !GAPS_WHEN_PINNED.includes(g));
  assert.deepEqual(added, [], 'the list only shrinks; not a gap when it was pinned: ' + added.join(', '));
  const unknown = RECORD.gaps.filter((g) => !PATHS.includes(g));
  assert.deepEqual(unknown, [], 'not a path this check computes: ' + unknown.join(', '));
  assert.deepEqual(Object.keys(RECORD.why).sort(), RECORD.gaps, 'each pinned gap says why, and nothing else does');
});

test('corpus paths, control: a path whose executing scenarios are removed is reported as a new gap', () => {
  const entries = corpusEntries();
  const c = corpusCensus();
  const chosen = Object.keys(c).sort().find((p) => c[p].executed > 0 && c[p].configuredIn.some((n) => !c[p].executedIn.includes(n)));
  assert.ok(chosen, 'premise: some path executes in one scenario and is configured but inert in another');
  const inertOnly = entries.filter((e) => c[chosen].configuredIn.includes(e.name) && !c[chosen].executedIn.includes(e.name));
  const v = verdict(census(inertOnly), RECORD.gaps);
  assert.ok(v.unpinned.includes(chosen), 'the check must name ' + chosen + ' as a new gap; it reported ' + JSON.stringify(v.unpinned));
});

test('corpus paths, control: each pinned gap executes on a plan built to reach it, and would be reported stale if the corpus held that plan', () => {
  const entries = corpusEntries();
  for (const gap of GAPS_WHEN_PINNED) {
    const reach = census([{ name: 'reach:' + gap, plan: reachingPlan(gap, entries) }]);
    assert.ok(reach[gap] && reach[gap].executed > 0, 'the check must see ' + gap + ' execute on a plan built to reach it: ' + JSON.stringify(reach[gap]));
    if (RECORD.gaps.includes(gap)) {
      const v = verdict(merge(corpusCensus(), reach), RECORD.gaps);
      assert.ok(v.stale.includes(gap), 'with that plan in the corpus, ' + gap + ' must be reported stale: ' + JSON.stringify(v));
    }
  }
});

test('corpus paths: rollingHistory is left out because the engine only restates it in the identity block', () => {
  const mentions = ENGINE_SOURCE.split('rollingHistory').length - 1;
  assert.equal(mentions, 1, 'src/engine.js mentions rollingHistory ' + mentions + ' times. If the engine reads it elsewhere now, it is an engine path and this exclusion must go.');
  const start = ENGINE_SOURCE.indexOf('function buildSimulationIdentity(');
  const end = ENGINE_SOURCE.indexOf('\nfunction ', start + 1);
  const at = ENGINE_SOURCE.indexOf('rollingHistory');
  assert.ok(start >= 0 && at > start && at < end, 'the one mention is inside buildSimulationIdentity()');
  const plan = clone(corpusEntries().find((e) => e.name === 'targeted:historical-1929').plan);
  plan.assumptions.rollingHistory = true;
  const off = clone(plan);
  off.assumptions.rollingHistory = false;
  assert.equal(outcome(plan), outcome(off), 'runPlan() does not move');
  assert.notDeepEqual(engine.runScenario(clone(plan)).identity.historicalPeriod, engine.runScenario(clone(off)).identity.historicalPeriod,
    'CONTROL: the identity block does, so the read is real and only restated');
});

test('corpus paths: the named transfer path is a branch the engine takes exactly once', () => {
  const branch = 'f.taxClass==="preTax"&&t.taxClass==="taxable"';
  const n = ENGINE_SOURCE.split(branch).length - 1;
  assert.equal(n, 1, 'src/engine.js branches on a preTax-to-taxable transfer ' + n + ' times; review the path this check names');
});

'use strict';

/*
 * S4 task 8.7 (S4-PA-08) -- close findings, not task headings.
 *
 * A sprint can be "done" in the sense that every heading has a tick while a
 * behaviour sits unguarded, a guard tests only the implementation, a decision
 * waits on nobody in particular, or an execution path is quietly unqualified.
 * Each of those is an ITEM, and an item blocks an unqualified completion claim
 * until it carries a stable id, a severity, an owner, a downstream task and an
 * enforceable deadline.
 *
 * Carry-forward is accepted only under the deadline rule:
 *   - the deadline names a task in S5, S5b or S6, which run before the rebuild
 *     consumes the item;
 *   - the item names the consumer that blocks on it;
 *   - and it is NOT a decision that determines how an S4 instrument works.
 *     Those are resolved before the instrument is accepted, never carried.
 *
 * "Owner assigned" alone is refused. This tool never invents an owner or a
 * date: it reads what the record says and refuses what the record lacks.
 *
 * WHAT IT REFUSES TO ASSUME (S4-IR-02, external instrument audit 2026-09-13).
 * The first version counted a field as assigned when String(value) was
 * non-empty, and a deadline as valid when it matched a prefix. So a missing
 * inventory was an empty one, and COMPLETE; owner false, downstream task {}
 * and a deadline naming a task that does not exist were carry-forward; the
 * string 'true' slipped past the instrument rule; and one id counted twice.
 * Now:
 *   - evaluate() takes an explicit dense array of item records and returns
 *     INVALID -- never COMPLETE -- for anything else, naming where;
 *   - an assignment is a real string, and a placeholder assigns nothing;
 *   - an unresolved decision states determinesS4Instrument as a boolean;
 *   - downstream task, deadline and blocking consumer must resolve against a
 *     REVIEWED task map, whose order comes from the phase preconditions and the
 *     dependencies the checklists state -- never from how the IDs sort;
 *   - runCloseout(root) is the entry point. It loads every source, joins the
 *     handwritten schedule onto the generated registers by id -- so a rebuild
 *     of either register, which writes UNASSIGNED, erases no assignment -- and
 *     a deleted source is INVALID. An arbitrary subset, even a valid empty one,
 *     is not proof that nothing is open. The generated registers themselves are
 *     held to fresh harvests by tests/requirements-register.test.js (8.1) and
 *     tests/test-classification.test.js (9.1).
 *
 * Usage: node tools/closeout-check.js [--root <dir>]
 * Exit 0 COMPLETE or COMPLETE_WITH_CARRY_FORWARD, 1 REFUSED, 2 INVALID.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const KINDS = ['unguarded-behaviour', 'coupled-only-guard', 'unresolved-decision', 'execution-path-limitation'];
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const REQUIRED = ['id', 'kind', 'severity', 'owner', 'downstreamTask', 'deadline'];
const DEADLINE_RULE = /^(S5|S5b|S6)\s+(task|block)\s+\S+/;
const DEADLINE_PHASES = ['S5', 'S5b', 'S6'];
const SCHEDULED_FIELDS = ['severity', 'owner', 'downstreamTask', 'deadline', 'blockingConsumer', 'determinesS4Instrument', 'aliases', 'basis'];

/* Everything the entry point reads. Two generated, two handwritten. */
const SOURCES = {
  register: 'tools/requirements-register.json',
  classification: 'tools/test-classification.json',
  schedule: 'tools/carry-forward-schedule.json',
  taskMap: 'tools/closeout-task-map.json',
};

/* Strings that assign nothing, compared trimmed, lower-cased and without
   punctuation -- so 'N/A', ' unassigned ' and a bare dash are caught too. */
const PLACEHOLDERS = new Set(['', 'unassigned', 'tbd', 'tba', 'tbc', 'todo', 'none', 'na', 'unknown', 'pending', 'null', 'undefined', 'nobody', 'someone']);
const squash = (s) => s.trim().toLowerCase().replace(/[\s.,;:!?_\-–—/\\()[\]{}'"*]+/g, '');
const assigned = (v) => typeof v === 'string' && !PLACEHOLDERS.has(squash(v));
const describe = (v) => (v === null ? 'null' : v === undefined ? 'undefined' : Array.isArray(v) ? 'an array'
  : typeof v === 'object' ? 'an object' : 'a ' + typeof v);
const invalid = (errors, counts) => ({ verdict: 'INVALID', accepted: [], refused: [], errors, counts: counts || null });

// ---------------------------------------------------------------------------
// The task map
// ---------------------------------------------------------------------------

/* S5AA task 7.4: S5AA is a sprint and its tasks are task ids, so the pattern has to admit them.
   THE ALTERNATION ORDER IS LOAD-BEARING: `S5` matches the first two characters of `S5AA`, so a
   longer prefix has to come first or every S5AA node reads as a malformed S5 one. `S5b` was
   already ahead of `S5` for exactly that reason. tools/ is the plan owner's, so this widening is
   relayed to them rather than done silently. */
const TASK_ID = /^(S5AA|S5b|S5|S6) task (\d+[a-z]*(?:\.\d+[a-z]*)?)$/;
const GATE_ID = /^[a-z][a-z0-9-]*$/;
/* A reference may run on into prose ("S5b task 3 re-harvest"); the id is its head. */
const TASK_REF = /^(S5b|S5|S6)\s+(?:task|block)\s+\*{0,2}(\d+[a-z]*(?:\.\d+[a-z]*)?)(?=$|[\s,;:)])/;
const GATE_REF = /^([a-z][a-z0-9-]*)(?=$|[\s,;:)])/;

function closure(start, next) {
  const seen = new Set();
  const stack = next(start).slice();
  while (stack.length) {
    const x = stack.pop();
    if (!seen.has(x)) { seen.add(x); next(x).forEach((y) => stack.push(y)); }
  }
  return seen;
}

function cycleThrough(ids, next) {
  const state = new Map();
  const visit = (id) => {
    if (state.get(id) === 'open') return id;
    if (state.get(id) === 'done') return null;
    state.set(id, 'open');
    for (const n of next(id)) { const c = visit(n); if (c) return c; }
    state.set(id, 'done');
    return null;
  };
  for (const id of ids) { const c = visit(id); if (c) return c; }
  return null;
}

/** Validates and indexes a task map. Returns { map } or { errors }. Never throws. */
function readTaskMap(taskMap) {
  if (!taskMap || typeof taskMap !== 'object' || Array.isArray(taskMap)) return { errors: ['the task map is ' + describe(taskMap) + ', not a task map'] };
  const errors = [];
  if (taskMap.formatVersion !== 1) errors.push('formatVersion must be 1');
  if (!taskMap.review || typeof taskMap.review !== 'object' || !assigned(taskMap.review.status)) errors.push('review.status is required');

  const phases = new Map();
  if (!Array.isArray(taskMap.phases)) errors.push('phases must be an array');
  (Array.isArray(taskMap.phases) ? taskMap.phases : []).forEach((p, i) => {
    if (!p || typeof p !== 'object' || !assigned(p.id)) { errors.push('phase ' + i + ' has no id'); return; }
    if (phases.has(p.id)) errors.push('duplicate phase "' + p.id + '"');
    if (!Array.isArray(p.after)) errors.push('phase "' + p.id + '" has no after array');
    if (!assigned(p.source)) errors.push('phase "' + p.id + '" cites no source');
    phases.set(p.id, p);
  });

  const nodes = new Map();
  if (!Array.isArray(taskMap.nodes)) errors.push('nodes must be an array');
  (Array.isArray(taskMap.nodes) ? taskMap.nodes : []).forEach((n, i) => {
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !(TASK_ID.test(n.id) || GATE_ID.test(n.id))) {
      errors.push('node ' + i + ' has no canonical id ("S5 task 2i", "S5b task 3.4", or a lower-case gate name)');
      return;
    }
    if (nodes.has(n.id)) errors.push('duplicate node "' + n.id + '"');
    if (!phases.has(n.phase)) errors.push('node "' + n.id + '" names unknown phase "' + n.phase + '"');
    const m = TASK_ID.exec(n.id);
    if (m && m[1] !== n.phase) errors.push('node "' + n.id + '" is filed under phase "' + n.phase + '"');
    if (!Array.isArray(n.after)) errors.push('node "' + n.id + '" has no after array');
    if (!assigned(n.source)) errors.push('node "' + n.id + '" cites no source');
    nodes.set(n.id, n);
  });
  if (errors.length) return { errors };

  phases.forEach((p) => p.after.forEach((a) => { if (!phases.has(a)) errors.push('phase "' + p.id + '" comes after unknown phase "' + a + '"'); }));
  nodes.forEach((n) => {
    n.after.forEach((a) => { if (!nodes.has(a)) errors.push('node "' + n.id + '" comes after "' + a + '", which is not in the map'); });
    if (n.partOf !== undefined && (!nodes.has(n.partOf) || nodes.get(n.partOf).phase !== n.phase)) {
      errors.push('node "' + n.id + '" is part of "' + n.partOf + '", which is not a node of its phase');
    }
  });
  if (errors.length) return { errors };

  const phaseCycle = cycleThrough(phases.keys(), (id) => phases.get(id).after);
  if (phaseCycle) errors.push('the phase order has a cycle through "' + phaseCycle + '"');
  const nodeCycle = cycleThrough(nodes.keys(), (id) => nodes.get(id).after);
  if (nodeCycle) errors.push('the task dependencies have a cycle through "' + nodeCycle + '"');
  const partCycle = cycleThrough(nodes.keys(), (id) => (nodes.get(id).partOf ? [nodes.get(id).partOf] : []));
  if (partCycle) errors.push('partOf has a cycle through "' + partCycle + '"');
  if (errors.length) return { errors };

  /* phasesBefore.get(p): every phase p comes after, transitively. */
  const phasesBefore = new Map([...phases.keys()].map((id) => [id, closure(id, (x) => phases.get(x).after)]));
  nodes.forEach((n) => n.after.forEach((a) => {
    const pa = nodes.get(a).phase;
    if (pa !== n.phase && !phasesBefore.get(n.phase).has(pa)) {
      errors.push('node "' + n.id + '" comes after "' + a + '", which contradicts the phase order');
    }
  }));
  if (errors.length) return { errors };

  /* A node comes after its own dependencies and, through its parent, the parent's. */
  const upstream = (id) => {
    const n = nodes.get(id);
    return n.after.concat(n.partOf ? nodes.get(n.partOf).after : []);
  };
  const ancestors = new Map([...nodes.keys()].map((id) => [id, closure(id, upstream)]));
  const partChain = (id) => {
    const chain = [];
    for (let x = id; x !== undefined; x = nodes.get(x).partOf) chain.push(x);
    return chain;
  };
  const precedes = (a, b) => {
    if (a === b) return false;
    const pa = nodes.get(a).phase;
    const pb = nodes.get(b).phase;
    if (pa !== pb) return phasesBefore.get(pb).has(pa);
    return partChain(a).some((x) => ancestors.get(b).has(x));
  };
  const resolve = (text) => {
    const t = text.trim();
    const task = TASK_REF.exec(t);
    if (task) { const id = task[1] + ' task ' + task[2]; return nodes.has(id) ? id : null; }
    const gate = GATE_REF.exec(t);
    return gate && nodes.has(gate[1]) ? gate[1] : null;
  };
  return {
    map: {
      status: taskMap.review.status,
      reviewed: taskMap.review.status === 'reviewed',
      resolve,
      precedes,
      landsBy: (work, deadline) => partChain(work).indexOf(deadline) !== -1 || precedes(work, deadline),
      phaseOf: (id) => nodes.get(id).phase,
    },
  };
}

// ---------------------------------------------------------------------------
// One item, and the claim
// ---------------------------------------------------------------------------

/* One item: accepted as carry-forward, or the reasons it is not. `context.map`
   is a map from readTaskMap(), or null when no map was supplied. */
function judge(item, context) {
  const map = context && context.map ? context.map : null;
  const reasons = [];
  const strings = REQUIRED.concat(['blockingConsumer']);
  const wrongType = strings.filter((k) => item[k] !== undefined && item[k] !== null && typeof item[k] !== 'string');
  wrongType.forEach((k) => reasons.push(k + ' must be a string, got ' + typeof item[k]));
  const missing = REQUIRED.filter((k) => wrongType.indexOf(k) === -1 && !assigned(item[k]));
  if (missing.length) reasons.push('missing ' + missing.join(', '));
  if (assigned(item.kind) && !KINDS.includes(item.kind)) reasons.push('kind "' + item.kind + '" is not one of ' + KINDS.join(', '));
  if (assigned(item.severity) && !SEVERITIES.includes(item.severity)) reasons.push('severity "' + item.severity + '" is not one of ' + SEVERITIES.join(', '));
  if (assigned(item.deadline) && !DEADLINE_RULE.test(item.deadline)) reasons.push('deadline "' + item.deadline + '" does not name an S5, S5b or S6 task');
  if (wrongType.indexOf('blockingConsumer') === -1 && !assigned(item.blockingConsumer)) reasons.push('carry-forward must name the consumer that blocks on it');

  const flag = item.determinesS4Instrument;
  if (flag !== undefined && typeof flag !== 'boolean') {
    reasons.push('determinesS4Instrument must be true or false, got ' + JSON.stringify(flag));
  } else if (flag === undefined && item.kind === 'unresolved-decision') {
    reasons.push('an unresolved decision must say, as true or false, whether it determines how an S4 instrument works');
  }
  if (flag === true) {
    reasons.push('an item that determines how an S4 instrument works must be resolved before the instrument is accepted, not carried forward');
  }

  const refs = ['downstreamTask', 'deadline', 'blockingConsumer'].filter((k) => assigned(item[k]));
  if (refs.length && !map) {
    reasons.push('no reviewed task map was supplied, so ' + refs.join(', ') + ' cannot be resolved');
  } else if (refs.length && !map.reviewed) {
    reasons.push('the task map has not been reviewed (review.status "' + map.status + '"), so ' + refs.join(', ') + ' cannot be resolved against it');
  } else if (refs.length) {
    const work = assigned(item.downstreamTask) ? map.resolve(item.downstreamTask) : null;
    const deadline = assigned(item.deadline) ? map.resolve(item.deadline) : null;
    const consumer = assigned(item.blockingConsumer) ? map.resolve(item.blockingConsumer) : null;
    if (assigned(item.downstreamTask) && !work) reasons.push('downstreamTask "' + item.downstreamTask + '" is not a task or gate in the reviewed task map');
    if (assigned(item.deadline) && DEADLINE_RULE.test(item.deadline) && (!deadline || DEADLINE_PHASES.indexOf(map.phaseOf(deadline)) === -1)) {
      reasons.push('deadline "' + item.deadline + '" does not name an S5, S5b or S6 task in the reviewed task map');
    }
    if (assigned(item.blockingConsumer) && !consumer) reasons.push('blockingConsumer "' + item.blockingConsumer + '" is not a task or gate in the reviewed task map');
    if (deadline && consumer && !map.precedes(deadline, consumer)) {
      reasons.push('deadline "' + item.deadline + '" does not come before its blocking consumer "' + item.blockingConsumer + '" in the reviewed task map');
    }
    if (work && deadline && !map.landsBy(work, deadline)) {
      reasons.push('downstreamTask "' + item.downstreamTask + '" does not land by its deadline "' + item.deadline + '"');
    }
  }
  return reasons;
}

/* The completion claim for ONE inventory. COMPLETE only with no open items;
   COMPLETE_WITH_CARRY_FORWARD only when every item is accepted; REFUSED with
   each item's reasons; INVALID when the inventory or the map cannot be read.
   Whether this inventory is the WHOLE inventory is runCloseout's question. */
function evaluate(items, options) {
  const opts = options || {};
  if (!Array.isArray(items)) return invalid(['the inventory is ' + describe(items) + ', not an array of items -- a missing inventory is not an empty one']);
  const errors = [];
  const where = new Map();
  for (let i = 0; i < items.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(items, i)) { errors.push('inventory[' + i + '] is a hole'); continue; }
    const item = items[i];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) { errors.push('inventory[' + i + '] is ' + describe(item) + ', not an item record'); continue; }
    if (!assigned(item.id)) { errors.push('inventory[' + i + '] has no usable id'); continue; }
    const id = item.id.trim();
    where.set(id, (where.get(id) || []).concat([i]));
  }
  where.forEach((at, id) => { if (at.length > 1) errors.push('duplicate id "' + id + '" at inventory[' + at.join('], [') + ']'); });

  let map = null;
  if (opts.taskMap !== undefined) {
    const read = readTaskMap(opts.taskMap);
    if (read.errors) read.errors.forEach((e) => errors.push('task map: ' + e));
    else map = read.map;
  }
  if (errors.length) return invalid(errors);

  const refused = [];
  const accepted = [];
  items.forEach((item) => {
    const reasons = judge(item, { map });
    if (reasons.length) refused.push({ id: item.id, reasons });
    else accepted.push(item.id);
  });
  const verdict = refused.length ? 'REFUSED' : accepted.length ? 'COMPLETE_WITH_CARRY_FORWARD' : 'COMPLETE';
  return { verdict, accepted, refused, errors: [] };
}

// ---------------------------------------------------------------------------
// The entry point: every source, joined by id
// ---------------------------------------------------------------------------

/**
 * The canonical inventory: every open item the generated registers carry, with
 * its handwritten scheduling joined by id, plus handwritten items no generator
 * discovers. An open item with no schedule entry keeps its UNASSIGNED fields
 * and is refused; a schedule entry for an item nothing generates is an error.
 * Pure: sources in, { items, errors, counts } out.
 */
function assembleInventory(sources) {
  const s = sources || {};
  const errors = [];
  if (!s.register || !Array.isArray(s.register.requirements)) errors.push(SOURCES.register + ' is missing, or has no requirements array');
  if (!s.classification || !Array.isArray(s.classification.coupledOnly)) errors.push(SOURCES.classification + ' is missing, or has no coupledOnly array');
  if (!s.schedule || s.schedule.formatVersion !== 1 || !Array.isArray(s.schedule.entries)) errors.push(SOURCES.schedule + ' is missing, or is not formatVersion 1 with an entries array');
  if (errors.length) return { items: [], errors, counts: null };

  const generated = s.register.requirements.filter((r) => r && r.open).map((r) => r.open).concat(s.classification.coupledOnly);
  const scheduled = new Map();
  s.schedule.entries.forEach((e, i) => {
    if (!e || typeof e !== 'object' || !assigned(e.id)) { errors.push(SOURCES.schedule + ' entry ' + i + ' has no usable id'); return; }
    if (scheduled.has(e.id)) { errors.push(e.id + ': scheduled more than once in ' + SOURCES.schedule); return; }
    if (!assigned(e.basis)) errors.push(e.id + ': a schedule entry must cite its basis -- the recorded decision it comes from -- and this one does not');
    if (e.aliases !== undefined && !(Array.isArray(e.aliases) && e.aliases.every(assigned))) errors.push(e.id + ': aliases must be an array of ids');
    scheduled.set(e.id, e);
  });

  const pick = (from) => SCHEDULED_FIELDS.reduce((o, k) => { if (from[k] !== undefined) o[k] = from[k]; return o; }, {});
  const generatedIds = new Set();
  const items = generated.map((g) => {
    generatedIds.add(g.id);
    const e = scheduled.get(g.id);
    if (!e) return Object.assign({}, g);
    if (e.origin !== undefined) errors.push(g.id + ': a generated item\'s schedule entry cannot declare an origin ("' + e.origin + '")');
    if (e.kind !== undefined && e.kind !== g.kind) errors.push(g.id + ': the schedule says kind "' + e.kind + '" but the generated register says "' + g.kind + '"');
    return Object.assign({}, g, pick(e));
  });
  let handwritten = 0;
  scheduled.forEach((e, id) => {
    if (generatedIds.has(id)) return;
    if (e.origin !== 'handwritten') {
      errors.push(id + ': scheduled, but no generated register carries it -- the item was closed or renamed, or the id is mistyped. ' +
        'An item that exists only in the schedule must say origin "handwritten"');
      return;
    }
    handwritten += 1;
    items.push(Object.assign({ id, kind: e.kind }, pick(e)));
  });
  const counts = {
    generated: generated.length,
    generatedScheduled: generated.filter((g) => scheduled.has(g.id)).length,
    handwritten,
    items: items.length,
  };
  return { items, errors, counts };
}

/* Reads every source. A missing or unreadable one is an error, never a default. */
function loadSources(root) {
  const sources = {};
  const errors = [];
  Object.keys(SOURCES).forEach((key) => {
    const rel = SOURCES[key];
    try {
      sources[key] = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
    } catch (e) {
      errors.push(rel + ' is missing or not valid JSON (' + (e.code || e.message) + ')');
    }
  });
  return { sources, errors };
}

function runCloseout(root) {
  const loaded = loadSources(root || ROOT);
  if (loaded.errors.length) return invalid(loaded.errors);
  const assembled = assembleInventory(loaded.sources);
  if (assembled.errors.length) return invalid(assembled.errors, assembled.counts);
  return Object.assign(evaluate(assembled.items, { taskMap: loaded.sources.taskMap }), { counts: assembled.counts });
}

function main(argv) {
  const at = argv.indexOf('--root');
  const root = at === -1 ? ROOT : path.resolve(argv[at + 1] || '.');
  const r = runCloseout(root);
  const SHOW = 20;
  console.log('closeout: ' + r.verdict + (r.counts ? ' ' + JSON.stringify(r.counts) : ''));
  r.errors.slice(0, SHOW).forEach((e) => console.log('  INVALID  ' + e));
  r.refused.slice(0, SHOW).forEach((x) => console.log('  REFUSED  ' + x.id + ': ' + x.reasons.join('; ')));
  if (r.errors.length > SHOW || r.refused.length > SHOW) console.log('  (lists shortened to ' + SHOW + ')');
  console.log('accepted ' + r.accepted.length + ', refused ' + r.refused.length + ', errors ' + r.errors.length);
  return r.verdict === 'INVALID' ? 2 : r.verdict === 'REFUSED' ? 1 : 0;
}

module.exports = { KINDS, SEVERITIES, REQUIRED, DEADLINE_RULE, SOURCES, judge, evaluate, readTaskMap, assembleInventory, loadSources, runCloseout };

if (require.main === module) process.exitCode = main(process.argv.slice(2));

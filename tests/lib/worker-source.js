'use strict';

/*
 * The REAL generated Web Worker source, and a way to run a plan through it.
 *
 * S3 task 3. Re-audit REAUDIT_AND_CLAUDE_HANDOVER_20260911.md section 5 item 4:
 *
 *   "buildLiveWorkerSource() in tests/audit-r2-cash-settlement.test.js:42
 *    evaluates raw engine source plus the shell function, without build.js's
 *    debt factory. Independently running its output on an ARM case produces
 *    ReferenceError: DebtAmortization is not defined, while the actual built
 *    worker passes."
 *
 * THE PROBLEM THAT HELPER HAD was not a missing line. It was that it was a
 * THIRD ASSEMBLY: neither the main thread nor the shipped worker, but a
 * hand-built approximation of one. Every test written against it was
 * confidently exercising something that does not ship, and the one gap that
 * mattered -- the debt graph -- was invisible until an auditor ran an ARM
 * plan through it.
 *
 * So this module does not assemble anything. It BUILDS the real artifact to a
 * scratch path, boots it in jsdom, and asks the app for the worker source it
 * would actually hand a Worker. Nothing here reimplements buildWorkerSource();
 * reimplementing it is what produced the defect. (The technique is lifted from
 * tests/audit-q15-worker-dependencies.test.js, which already did it correctly
 * -- so this is one definition where there were two, the same argument as
 * Q15's debt factory and Q20's worker registry.)
 *
 * ASYNC, and unavoidably so: booting jsdom is asynchronous. The source is
 * built ONCE and memoised, so the cost is paid by the first caller in a file
 * rather than by every assertion.
 *
 * GROUND RULE 2: builds to a scratch path only. investment-calculator-v2c.html
 * is stale by design and is never rebuilt.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const { build } = require('../../build.js');

let cached = null;
let scratchDir = null;

/** The worker source the built app would actually hand a Worker. Memoised. */
async function liveWorkerSource() {
  if (cached) return cached;
  const { JSDOM } = require('jsdom');
  scratchDir = scratchDir || fs.mkdtempSync(path.join(os.tmpdir(), 'worker-source-'));
  const { output } = build(path.join(scratchDir, 'app.html'));
  const dom = new JSDOM(output, {
    runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true,
  });
  dom.window.__V2C_TEST__ = true;
  // Key off the app's own root id, NOT "the first non-JSON script": when
  // src/app-shell.html gained a <head> carrying a PWA manifest bootstrap, that
  // predicate silently selected the bootstrap and 23 tests stopped exercising
  // their subject while still reporting something.
  const mainScript = Array.from(dom.window.document.querySelectorAll('script'))
    .find((el) => el.getAttribute('type') !== 'application/json'
      && el.textContent.includes('investment-calculator-v2c'));
  assert.ok(mainScript, 'could not find the app script in the built output');
  dom.window.eval(mainScript.textContent);
  await new Promise((r) => dom.window.setTimeout(r, 0));
  const root = dom.window.document.getElementById('investment-calculator-v2c');
  const source = root && root._v2cWorkerSource;
  assert.ok(source && source.length > 1000, 'the app did not stash a generated worker source');
  cached = source;
  return cached;
}

/**
 * Runs a plan through a worker source via the real self.onmessage /
 * self.postMessage contract in an isolated VM -- not a direct function call --
 * so this also proves calculationError/successRate:null survive the worker
 * boundary. Returns the posted message: {id, result} or {id, error}.
 */
/* ST2-03: A VM IS AN EXECUTION BOUNDARY. IT IS NOT A TRANSPORT BOUNDARY.
 *
 * This helper handed `{ id: 1, plan }` straight to onmessage and pushed
 * postMessage's argument straight into an array. Both are direct object
 * transfers, so the helper was strictly more permissive than the thing it
 * stands in for, in two ways that matter:
 *
 *   1. THE WORKER SHARED THE CALLER'S OBJECT. A worker that mutated the plan
 *      it was given would mutate the test's own plan, and the test would then
 *      compare a result against an input the worker had already edited. A real
 *      Worker cannot do this; the receiving side gets a copy.
 *
 *   2. IT ACCEPTED WHAT A WORKER REFUSES. A function-valued field passes
 *      through a direct call and dies with DataCloneError in a real Worker. A
 *      helper that accepts it will certify a message shape the browser rejects.
 *
 * structuredClone() is the algorithm the Worker boundary actually uses, so it
 * is what runs here -- at BOTH send boundaries, incoming and outgoing. It is
 * deliberately NOT a JSON round-trip: JSON is lossy in exactly the places this
 * project's result contract lives, turning NaN and Infinity into null, -0 into
 * 0, and undefined into an absent key. Substituting a lossier transport than
 * the real one to model a transport defect would replace one wrong boundary
 * with another.
 */
function cloneForTransport(value, direction) {
  try {
    return structuredClone(value);
  } catch (e) {
    const error = new Error(
      'worker-source: the ' + direction + ' message is not structured-cloneable, so a real ' +
      'Worker would reject it with DataCloneError: ' + e.message
    );
    error.name = 'DataCloneError';
    error.cause = e;
    throw error;
  }
}

function postToWorker(source, plan) {
  const messages = [];
  const ctx = vm.createContext({
    self: { postMessage: (data) => messages.push(cloneForTransport(data, 'outgoing')) },
  });
  vm.runInContext(source, ctx);
  /* Cloned before the worker can reach it, so the worker never holds a
     reference to the caller's plan. */
  ctx.self.onmessage({ data: cloneForTransport({ id: 1, plan }, 'incoming') });
  assert.equal(messages.length, 1, 'expected exactly one posted message');
  return messages[0];
}

/** Convenience: run a plan through the real worker and insist it succeeded. */
async function runPlanThroughLiveWorker(plan) {
  const message = postToWorker(await liveWorkerSource(), plan);
  assert.equal(message.error, undefined, `worker threw: ${message.error}`);
  return message.result;
}

/** Remove the scratch build. Call from a test file's test.after(). */
function cleanup() {
  if (scratchDir) fs.rmSync(scratchDir, { recursive: true, force: true });
  scratchDir = null;
  cached = null;
}

module.exports = { liveWorkerSource, postToWorker, runPlanThroughLiveWorker, cleanup };

'use strict';

/*
 * S4 task 7.4b -- routes 2 and 3 of 7.4a's decision, over a FRESH build of this tree.
 *
 *   route 2  the build's MAIN THREAD: the engine as the page itself runs it.
 *            The app is an IIFE that exposes only its generated worker source,
 *            so ONE line is injected into a scratch copy of the build to hand
 *            this helper references to its own runPlan and runScenario. The
 *            shipped source is never edited, and the line only passes
 *            references, which changes nothing the engine computes.
 *   route 3  the build's WORKER SOURCE: the string the app would hand a Worker,
 *            run through tests/lib/worker-source.js's structured-clone
 *            postMessage contract.
 *
 * Route 1, the Node module graph, is tools/differential-harness.js. Real
 * browser Worker execution is out of S4's scope by decision (7.4a).
 */

const { JSDOM } = require('jsdom');
const harness = require('./harness.js');
const { postToWorker } = require('./worker-source.js');
const { canonical } = require('../../tools/capture-baseline.js');
const { compareValues } = require('../../tools/differential-harness.js');

const IIFE_MARKER = '(function(){\n    "use strict";';
const PROBE = 'if(window.__S4_ROUTE2__)window.__S4_ROUTE2__({runPlan:function(p){return runPlan(p)},runScenario:function(p){return runScenario(p)}});';

/* Boot a build -- the fresh lane unless `html` is given -- and return its main-thread engine and its worker source. */
async function bootBuild(html) {
  const source = html === undefined ? harness.artifactFor('fresh') : html;
  const count = source.split(IIFE_MARKER).length - 1;
  if (count !== 1) throw new Error('build-routes: the app IIFE marker occurs ' + count + ' times; it must occur exactly once');
  const dom = new JSDOM(source.replace(IIFE_MARKER, () => IIFE_MARKER + PROBE), {
    runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true,
  });
  let engine = null;
  dom.window.__S4_ROUTE2__ = (e) => { engine = e; };
  dom.window.__V2C_TEST__ = true;
  const app = Array.from(dom.window.document.querySelectorAll('script'))
    .find((el) => el.getAttribute('type') !== 'application/json' && el.textContent.includes('investment-calculator-v2c'));
  if (!app) throw new Error('build-routes: the build has no app script');
  dom.window.eval(app.textContent);
  await new Promise((r) => dom.window.setTimeout(r, 0));
  if (!engine) throw new Error('build-routes: the injected line did not run, so there is no main-thread engine to compare');
  const root = dom.window.document.getElementById('investment-calculator-v2c');
  return { dom, engine, workerSource: root._v2cWorkerSource };
}

const copy = (v) => JSON.parse(JSON.stringify(v));

/* A value leaving the page's realm, through the algorithm a Worker boundary uses. */
const fromPage = (v) => canonical(structuredClone(v));

/* Main-thread and Worker results for one plan. runScenario carries identity.runId, the one field that
   differs between two identical runs (tests/worker-parity.test.js measured this); it alone is excluded. */
function mainThreadPlan(engine, plan) { return fromPage(engine.runPlan(copy(plan))); }
function mainThreadScenario(engine, plan) {
  const r = structuredClone(engine.runScenario(copy(plan)));
  if (r.identity) delete r.identity.runId;
  return canonical(r);
}
function workerScenario(source, plan) {
  const message = postToWorker(source, copy(plan));
  if (message.error) throw new Error('build-routes: the worker returned an error: ' + JSON.stringify(message.error));
  const r = message.result;
  if (r.identity) delete r.identity.runId;
  return canonical(r);
}

/* Differences between two results, named by field, with a leaf tally. */
function differ(reference, candidate) {
  const out = [];
  const tally = { leaves: 0 };
  compareValues(reference, candidate, '', out, tally);
  return { differences: out, leaves: tally.leaves };
}

module.exports = { IIFE_MARKER, bootBuild, mainThreadPlan, mainThreadScenario, workerScenario, differ, copy };

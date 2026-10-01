'use strict';
// Read-only tap of every estimateTaxes() call (args and total), on an in-memory engine variant. Output-neutrality asserted by the caller.
const h = require('../harness.js'); const path = require('path');
const { loadEngineVariant } = require(path.join(h.TREE, 'tests/lib/engine-variant.js'));
const marker = 'function estimateTaxes(p,age,ordinaryIncome,capitalGains,ssBenefit,wages,qualifiedDividends,spouseWages,selfSeProfit,spouseSeProfit,niiOther,capitalLossCarryIn,rowSpan){';
const variant = loadEngineVariant([{ id: 'et-tap', marker, replace: 'function estimateTaxes(){var __r=__estimateTaxes.apply(this,arguments);if(globalThis.__ET)globalThis.__ET({args:Array.prototype.slice.call(arguments,1),total:__r.total,federal:__r.federal,az:__r.az,agi:__r.measures.federal_agi});return __r}\nfunction __estimateTaxes(p,age,ordinaryIncome,capitalGains,ssBenefit,wages,qualifiedDividends,spouseWages,selfSeProfit,spouseSeProfit,niiOther,capitalLossCarryIn,rowSpan){' }]);
function runTap(p) { const calls = []; globalThis.__ET = c => calls.push(c); let rv; try { rv = variant.runPlan(structuredClone(p)); } finally { globalThis.__ET = null; }
  const r = h.engine.runPlan(structuredClone(p)); if (JSON.stringify(r.rows) !== JSON.stringify(rv.rows)) throw new Error('tap not output-neutral'); return { r, calls }; }
module.exports = { runTap };

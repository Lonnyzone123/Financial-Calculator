'use strict';
/*
 * RETIRED 2026-09-10 (decision register P6, closing SPRINT_QUESTIONS.md Q31).
 *
 * THIS TOOL IS NO LONGER A GATE, AND CANNOT BE ONE.
 *
 * It re-derives what src/engine.js "should" contain by re-running the Phase-2
 * extraction against commit f06ac7c, the pre-Phase-2 ancestor. That was a
 * genuine provenance proof on the day the extraction happened. Every
 * legitimate engine repair since -- R1 through R7, RR2, Q22, and the re-audit
 * 2 repairs -- is a MISMATCH to it by construction. Run correctly it reports
 * 48 items re-extracted, 16 mismatches, and the mismatched functions are
 * exactly the ones the project deliberately fixed: growAccounts, simulatePlan,
 * runPlan, quantile.
 *
 * A check that can only fail, and whose failures are the project working as
 * intended, is worse than no check: SPRINT_BRIEF_20260910_S3.md carried
 * "confirm this passes" as a close-out criterion, which meant the sprint could
 * not close, and anyone running the documented command got a usage error
 * (it takes a required argument) that reads like a sprint failure.
 *
 * It is kept in the tree, not deleted, because the extraction it documents is
 * real history and the file is the only record of how that extraction was
 * verified. Running it now prints this notice and exits non-zero.
 *
 * WHAT REPLACES IT as the release gate:
 *     npm test
 *     node tools/verify-test-gate.js
 *     SHA256_MANIFEST.txt verification over the cut package
 */

/* ---- ORIGINAL TOOL BELOW, PRESERVED AS PROVENANCE ----
const fs = require('node:fs');
const path = require('node:path');

const ORIGINAL_PATH = process.argv[2];
if (!ORIGINAL_PATH) throw new Error('usage: node verify-phase2-extraction.js <path-to-original-pre-phase2-html>');

const ENGINE_FUNCTIONS = [
  'clone', 'money', 'clamp', 'sum', 'taxClassBalance', 'totalBalance', 'accountType',
  'debtTotal', 'accountPlannedContribution', 'contributionLimit', 'rothPhaseoutFactor',
  'auditContributions', 'marginalTax', 'capitalGainsTax', 'taxableSocialSecurity',
  'seniorDeduction', 'estimateTaxes', 'ssaBenefitAtClaim', 'irmaaMonthly', 'rng', 'normal',
  'accountExpected', 'accountVolatility', 'rmdStartAge', 'optimizedAccountScore',
  'smartWithdrawalOrder', 'withdrawFromClass', 'projectDebts', 'growOtherAssets',
  'drawFromOtherAssets', 'moveFunds', 'rmdFor', 'historyIndex', 'growthFromCola',
  'applyStage', 'eventAmount', 'strategySpending', 'otherIncomeFor', 'takeCashFromClass',
  'accountReturnForPeriod', 'growAccounts', 'simulatePlan', 'quantile', 'runPlan',
];
const ENGINE_CONSTANTS = ['ACCOUNT_TYPES', 'HIST_RETURNS', 'HIST_INFLATION', 'HIST_COLA'];

function matchBrace(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(text, i, c); continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  throw new Error('unbalanced braces from ' + start);
}
function skipString(text, start, quote) {
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text[i] === quote) return i;
    i++;
  }
  throw new Error('unterminated string from ' + start);
}
function extractFunction(text, name) {
  const re = new RegExp('function ' + name + '\\(');
  const m = re.exec(text);
  if (!m) throw new Error('missing function ' + name);
  const braceStart = text.indexOf('{', m.index);
  const braceEnd = matchBrace(text, braceStart);
  return text.slice(m.index, braceEnd + 1);
}
function extractVarStatement(text, name) {
  const re = new RegExp('var ' + name + '=');
  const m = re.exec(text);
  if (!m) throw new Error('missing var ' + name);
  let i = m.index + m[0].length;
  let depth = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(text, i, c); continue; }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) { i++; break; }
  }
  return text.slice(m.index, i);
}

const originalHtml = fs.readFileSync(ORIGINAL_PATH, 'utf8');
const scripts = [...originalHtml.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 1) throw new Error('expected exactly one non-JSON <script>, found ' + scripts.length);
const scriptBody = scripts[0][1];

const reExtractedSources = [];
for (const name of ENGINE_CONSTANTS) reExtractedSources.push(extractVarStatement(scriptBody, name));
for (const name of ENGINE_FUNCTIONS) reExtractedSources.push(extractFunction(scriptBody, name));

const currentEngineJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine.js'), 'utf8');

let mismatches = 0;
for (const source of reExtractedSources) {
  if (!currentEngineJs.includes(source)) {
    mismatches++;
    const label = source.slice(0, 60).replace(/\n/g, ' ');
    console.log('MISMATCH (not found verbatim in src/engine.js):', label);
  }
}

// Also verify nothing extra/unexpected snuck in: every function body in
// src/engine.js's exported set should correspond to exactly one of the
// re-extracted sources (catches accidental duplication or drift).
let extraCount = 0;
for (const name of ENGINE_FUNCTIONS) {
  const count = (currentEngineJs.match(new RegExp('function ' + name + '\\(', 'g')) || []).length;
  if (count !== 1) {
    extraCount++;
    console.log('UNEXPECTED OCCURRENCE COUNT for', name + ':', count, '(expected exactly 1)');
  }
}

console.log('Re-extracted', reExtractedSources.length, 'items from the original pre-Phase-2 file.');
console.log('Mismatches against checked-in src/engine.js:', mismatches);
console.log('Function-count anomalies:', extraCount);
console.log(mismatches === 0 && extraCount === 0 ? 'PASS: extraction verified clean, independently re-derived.' : 'FAIL: see above.');
process.exit(mismatches === 0 && extraCount === 0 ? 0 : 1);

---- end preserved tool ---- */

console.error('verify-phase2-extraction.js is RETIRED (P6 / Q31). It re-derives engine.js from');
console.error('commit f06ac7c, so every deliberate engine repair since is a mismatch to it.');
console.error('The release gate is: npm test, node tools/verify-test-gate.js, and manifest');
console.error('verification over the cut package. See the notice at the top of this file.');
process.exit(2);

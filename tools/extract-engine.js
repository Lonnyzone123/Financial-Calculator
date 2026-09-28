'use strict';

/**
 * ALREADY RUN as part of Phase 2 -- src/app-shell.html and src/engine.js
 * are the current source of truth now. This is kept for provenance (it
 * documents exactly how the split was made and could be rerun against the
 * original monolithic file if that history is ever needed) but is not part
 * of the regular workflow: edit src/app-shell.html / src/engine.js directly
 * and run `npm run build`, do not rerun this against the current files.
 *
 * One-off Phase 2 extraction tool: pulls the calculation-engine boundary
 * that investment-calculator-v2c.html's own buildWorkerSource() already
 * identifies (the exact function list it serializes for the Web Worker,
 * which is therefore already proven DOM-free) out of the monolithic inline
 * script and into src/engine.js, leaving a shell with a marker comment
 * where that code used to live. build.js re-assembles the two back into
 * the shipped single-file HTML.
 *
 * This is a source-relocation tool, not a rewrite: every extracted
 * function/constant's source text is copied verbatim, byte-for-byte.
 */

const fs = require('node:fs');
const path = require('node:path');

const HTML_PATH = path.join(__dirname, '..', 'investment-calculator-v2c.html');
const SHELL_PATH = path.join(__dirname, '..', 'src', 'app-shell.html');
const ENGINE_PATH = path.join(__dirname, '..', 'src', 'engine.js');

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

/** Scans forward from `start` (which must be a `{`) to find its matching `}`, honoring strings. */
function matchBrace(text, start) {
  if (text[start] !== '{') throw new Error('matchBrace: expected { at ' + start);
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(text, i, c);
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error('matchBrace: unbalanced braces starting at ' + start);
}

function skipString(text, start, quote) {
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text[i] === quote) return i;
    i++;
  }
  throw new Error('skipString: unterminated string starting at ' + start);
}

/** Extracts `function NAME(...){...}` verbatim, returns { source, start, end } (end exclusive). */
function extractFunction(text, name) {
  const re = new RegExp('function ' + name + '\\(');
  const match = re.exec(text);
  if (!match) throw new Error('extractFunction: could not find function ' + name);
  const start = match.index;
  const braceStart = text.indexOf('{', start);
  const braceEnd = matchBrace(text, braceStart);
  return { source: text.slice(start, braceEnd + 1), start, end: braceEnd + 1 };
}

/** Extracts `var NAME=...;` verbatim (top-level statement, honoring strings/brackets), returns { source, start, end }. */
function extractVarStatement(text, name) {
  const re = new RegExp('var ' + name + '=');
  const match = re.exec(text);
  if (!match) throw new Error('extractVarStatement: could not find var ' + name);
  const start = match.index;
  let i = match.index + match[0].length;
  let depth = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(text, i, c); continue; }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) { i++; break; }
  }
  return { source: text.slice(start, i), start, end: i };
}

function main() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');

  const scripts = [...html.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) {
    throw new Error('extract-engine: expected exactly one non-JSON <script>, found ' + scripts.length);
  }
  const scriptTag = scripts[0];
  const scriptBody = scriptTag[1];
  const scriptStartInHtml = scriptTag.index + scriptTag[0].indexOf(scriptBody);

  const spans = [];
  const extractedSources = [];

  for (const name of ENGINE_CONSTANTS) {
    const { source, start, end } = extractVarStatement(scriptBody, name);
    spans.push({ start, end });
    extractedSources.push(source);
  }
  for (const name of ENGINE_FUNCTIONS) {
    const { source, start, end } = extractFunction(scriptBody, name);
    spans.push({ start, end });
    extractedSources.push(source);
  }

  // Remove spans from the script body, latest-first so earlier offsets stay valid,
  // and drop the marker comment in at the position of the FIRST removed span.
  spans.sort((a, b) => a.start - b.start);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].start < spans[i - 1].end) {
      throw new Error('extract-engine: overlapping spans near ' + spans[i].start + ' -- extraction target list may be wrong');
    }
  }

  let shellBody = scriptBody;
  const marker = '/* ENGINE_SOURCE */';
  for (let i = spans.length - 1; i >= 0; i--) {
    const { start, end } = spans[i];
    const replacement = i === 0 ? marker : '';
    shellBody = shellBody.slice(0, start) + replacement + shellBody.slice(end);
  }

  const shellHtml = html.slice(0, scriptStartInHtml) + shellBody + html.slice(scriptStartInHtml + scriptBody.length);

  const engineHeader = `'use strict';
/*
 * Calculation engine extracted from investment-calculator-v2c.html Phase 2
 * (see MERGE_AUDIT_AND_PLAN.md). This is exactly the function/constant set
 * the app's own buildWorkerSource() already serializes for its Web Worker --
 * i.e. code the app itself already proved is DOM-free, just physically
 * relocated here verbatim (no behavior change). build.js inlines this file's
 * body back into investment-calculator-v2c.html at the ENGINE_SOURCE marker
 * in src/app-shell.html to produce the shipped single-file release.
 *
 * Also usable directly from Node (see the module.exports at the bottom) for
 * unit/fixture testing without needing a DOM at all.
 */

`;

  const exportsFooter = `

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
${[...ENGINE_CONSTANTS, ...ENGINE_FUNCTIONS].map((n) => '    ' + n).join(',\n')}
  };
}
`;

  const engineJs = engineHeader + extractedSources.join('\n') + exportsFooter;

  fs.mkdirSync(path.dirname(SHELL_PATH), { recursive: true });
  fs.writeFileSync(SHELL_PATH, shellHtml, 'utf8');
  fs.writeFileSync(ENGINE_PATH, engineJs, 'utf8');

  console.log('Extracted', ENGINE_CONSTANTS.length, 'constants and', ENGINE_FUNCTIONS.length, 'functions.');
  console.log('Wrote', SHELL_PATH, '(' + shellHtml.length + ' chars)');
  console.log('Wrote', ENGINE_PATH, '(' + engineJs.length + ' chars)');
}

main();

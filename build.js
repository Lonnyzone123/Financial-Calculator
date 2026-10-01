'use strict';

/**
 * Regenerates investment-calculator-v2c.html (the shipped single-file
 * release) from its modular sources: src/app-shell.html (everything except
 * the calculation engine) plus src/engine.js (the calculation engine,
 * inlined verbatim at the ENGINE_SOURCE marker) and src/scenario-validator.js
 * (inlined at the SCENARIO_VALIDATOR_SOURCE marker).
 *
 * This is the only way investment-calculator-v2c.html should be edited from
 * Phase 2 onward -- edit the sources under src/, then run this script.
 * The release stays a single self-contained HTML file; only the *source of
 * truth* during development becomes modular (see MERGE_AUDIT_AND_PLAN.md,
 * Phase 2, and the handover's Section 20 recommendation).
 *
 * The validator was added as a SECOND marker rather than by folding it into
 * engine.js, because engine.js ORIGINATED as a byte-for-byte extraction of
 * the app's own pre-Phase-2 calculation functions, and keeping unrelated code
 * out of it keeps that lineage legible. (tools/verify-phase2-extraction.js
 * used to prove the extraction mechanically; it was retired 2026-09-10 under
 * P6 / Q31, once the engine had been deliberately repaired well past what it
 * re-derives.)
 */

const fs = require('node:fs');
const path = require('node:path');
/* FCR-01: the emitted bundle is parse-checked with V8's own parser, which is
   the one check in this file that does not share the scanner's blind spots. */
const vm = require('node:vm');

const SHELL_PATH = path.join(__dirname, 'src', 'app-shell.html');
const ENGINE_PATH = path.join(__dirname, 'src', 'engine.js');
const VALIDATOR_PATH = path.join(__dirname, 'src', 'scenario-validator.js');
const OUTPUT_PATH = path.join(__dirname, 'investment-calculator-v2c.html');
const MARKER = '/* ENGINE_SOURCE */';
const VALIDATOR_MARKER = '/* SCENARIO_VALIDATOR_SOURCE */';
const DEBT_MARKER = '/* DEBT_MODULES_SOURCE */';

/*
 * Track F2 task 3 -- the six src/debt-*.js modules, bundled in dependency
 * order. Each is wrapped in its own IIFE namespace rather than concatenated
 * raw: dropping six module scopes into one script scope has two verified
 * name collisions (`clamp` between src/engine.js and src/debt-arm.js; `num`
 * between src/app-shell.html's DOM-reading num(id,f) and the debt modules'
 * value-coercing num(v,fallback)) where the last-hoisted declaration would
 * silently win for the whole script -- the SA-03 mechanism exactly, a second
 * definition quietly getting a vote. See tests/build-debt-bundling.test.js
 * for the naive-concat failure this construction exists to avoid.
 *
 * Order matters here for readability and for a clean dependency direction,
 * not for correctness of the wrapped output: debt-strategy-adapter.js
 * requires debt-payoff-strategy.js, and debt-refinance.js/debt-arm.js/
 * debt-recast.js all require debt-amortization.js. Each `require(...)` of a
 * sibling in this list is rewritten to that sibling's namespace variable.
 */
const DEBT_MODULES = [
  { file: 'debt-amortization.js', namespace: 'DebtAmortization' },
  /* S3 task 6. A primitive like debt-amortization -- it requires no other debt
     module -- so it sits with the primitives rather than at the end. */
  { file: 'debt-revolving.js', namespace: 'DebtRevolving' },
  /* EXCLUDED -- see EXCLUSION below. debt-payoff-strategy exists only to serve
     debt-strategy-adapter (nothing else in src/ requires it), so it leaves the
     bundle with it rather than remaining as a bundled orphan. */
  { file: 'debt-payoff-strategy.js', namespace: 'DebtPayoffStrategy', bundled: false,
    /* Excluded as a DEPENDENCY, not for defects of its own -- hence an empty
       findingIds. The distinction matters: reviving debt-strategy-adapter
       revives this with it, and nothing here has a revival contract to satisfy
       because nothing here was found wrong. */
    findingIds: [],
    excludedReason: 'private dependency of the excluded debt-strategy-adapter' },
  { file: 'debt-strategy-adapter.js', namespace: 'DebtStrategyAdapter', bundled: false,
    findingIds: ['RC-04'],
    excludedReason: 'RC-04: reports a 1,200-month iteration cap as time until debt-free, and quotes savings between outcomes that never pay off' },
  { file: 'debt-refinance.js', namespace: 'DebtRefinance' },
  { file: 'debt-arm.js', namespace: 'DebtArm' },
  { file: 'debt-recast.js', namespace: 'DebtRecast' },
  /* S3 task 7. LAST because it is the only debt-namespace module that consumes
     the ENGINE. That is safe only because every engine and sibling reference in
     it is resolved INSIDE an exported function, at call time -- the factory
     runs before the engine's `var` initializers, so a body-level engine touch
     would find runPlan hoisted and ENGINE_VERSION undefined. Its test asserts
     the factory evaluates with no engine in scope at all, which is the property
     that makes a plain DEBT_MODULES entry correct here rather than a marker of
     its own emitted after the engine. */
  { file: 'mortgage-vs-investing.js', namespace: 'MortgageVsInvesting', bundled: false,
    /* S3 round 2 added three more, and they are named here rather than left in
       a report: the exclusion record is where a future reader looks to find out
       what is wrong with this module, and "six P1 defects" stops being a
       complete answer the moment there are nine. */
    /* THE MACHINE-READABLE LIST, added 2026-09-12 at the external audit's
       request. The prose below writes "RB-03 to RB-08" as a RANGE, which is
       parseable but only by a reader that expands ranges -- anything that does
       not finds seven IDs across this file rather than eleven, and the four in
       the middle exist by inference. Enumerate here; explain there.

       Adding this list also settled a miscount the prose had carried: it names
       TEN findings and called them "nine". The nine was RB-03..08 plus the
       three ST2 entries; RC-03 is named in the same sentence and was never in
       the count. Corrected below. */
    findingIds: ['RB-03', 'RB-04', 'RB-05', 'RB-06', 'RB-07', 'RB-08',
                 'RC-03', 'ST2-01', 'ST2-04', 'ST2-06'],
    excludedReason: 'RB-03 to RB-08, RC-03, and S3 round 2 ST2-01, ST2-04 and ST2-06: ' +
      'ten defects in a comparison surface with no user interface. ST2-06 accepts an ' +
      'explicit horizonYears and returns a lifetime success rate anyway (0% where the ' +
      'requested one-year window gives 100%); ST2-01 grants a full year of growth to all ' +
      'twelve months of a monthly contribution ($13,200 against $12,540.54 month-end); ' +
      'ST2-04 runs the engine before refusals it already knows about' },
];

/* EXCLUSION (decision register P19, 2026-09-10).
 *
 * `bundled: false` keeps a module in this registry -- so it is still NAMED,
 * still tested, and still governed -- while keeping it out of the shipped
 * artifact and therefore out of the Worker.
 *
 * WHY A FLAG RATHER THAN DELETING THE ENTRY. Before this, these modules were
 * unreachable BY ACCIDENT: build.js bundled eight namespaces and the Worker
 * bound six, and nothing anywhere could say which of those facts was intended.
 * An external audit found six P1 defects in code that never ran. Deleting the
 * entries would restore exactly that silence. A registry that records the
 * exclusion, and a test that enforces it, turn an accident into a decision an
 * auditor can verify.
 *
 * REVIVAL is governed by contract, not by re-adding the line: the funding and
 * residual-cash policy (P13), a debt-inclusive comparison metric (P14),
 * age-based horizons and an explicit success-rate window (P15), and a payoff
 * status distinct from an iteration cap (P17). The findings' witnesses are
 * carried, todo-marked, in tests/audit-rb-findings.test.js and
 * tests/audit-rc-findings.test.js.
 */
const BUNDLED_MODULES = DEBT_MODULES.filter(function (m) { return m.bundled !== false; });
const EXCLUDED_MODULES = DEBT_MODULES.filter(function (m) { return m.bundled === false; });

function stripNodeExportFooter(source) {
  const marker = "if (typeof module !== 'undefined' && module.exports) {";
  const idx = source.indexOf(marker);
  if (idx === -1) throw new Error('build: could not find the module.exports footer');
  return source.slice(0, idx).trimEnd();
}

function stripHeaderComment(source) {
  // Drop the leading "'use strict';\n/* ... */\n\n" doc header -- the shell
  // script already has its own "use strict" and this is source-file-only
  // documentation, not behavior. Shared by engine.js, scenario-validator.js
  // and every src/debt-*.js module -- all follow the same header shape.
  const useStrict = "'use strict';\n";
  if (!source.startsWith(useStrict)) throw new Error('build: unexpected source header (expected a leading \'use strict\';)');
  let rest = source.slice(useStrict.length);
  const commentEnd = rest.indexOf('*/');
  if (!rest.startsWith('/*') || commentEnd === -1) throw new Error('build: unexpected source header comment');
  return rest.slice(commentEnd + 2).replace(/^\s*\n/, '');
}

/*
 * Splits a module's export footer into { body, exportsExpr } instead of
 * discarding it: `exportsExpr` (the literal object-literal text after
 * `module.exports =`) becomes the wrapping IIFE's `return` value, so the
 * export list stays single-sourced in the module itself rather than
 * duplicated at the call site.
 */
function splitExportFooter(source) {
  const marker = "if (typeof module !== 'undefined' && module.exports) {";
  const idx = source.indexOf(marker);
  if (idx === -1) throw new Error('build: could not find the module.exports footer in a debt module');
  const body = source.slice(0, idx).trimEnd();
  const footer = source.slice(idx);
  const m = footer.match(/module\.exports\s*=\s*(\{[\s\S]*?\});/);
  if (!m) throw new Error('build: could not parse module.exports footer: ' + footer.slice(0, 160));
  return { body, exportsExpr: m[1] };
}

/*
 * Rewrites `require('./sibling.js')` / `require('./sibling')` to the
 * sibling's namespace variable, for a sibling named in `namespaceByFile`.
 * Fails loudly on any other require -- an unrecognised sibling module is a
 * bundling gap, not something to silently pass through as a real Node
 * require (which would throw at runtime in the browser anyway, just later
 * and less clearly).
 */
/*
 * Q34. The previous implementation was a single `body.replace(/require\(...)/g)`
 * over raw text, which cannot tell code from prose. Two consequences, and the
 * second is worse than the first:
 *
 *   - a require-like string in a comment or a string literal was REWRITTEN,
 *     silently changing text that was never a dependency;
 *   - if that text named a module not in the registry, the `throw` below fired
 *     and A COMMENT BROKE THE BUILD.
 *
 * So this scans instead. Comments, string literals, regex literals and
 * template text are copied through untouched; only genuine code positions are
 * considered for rewriting. Template INTERPOLATIONS are code, and are
 * processed recursively rather than skipped, so a real require inside one is
 * still rewritten and a bad one is still caught.
 *
 * DOCUMENTED LIMIT: a locally shadowed `require` identifier is not detected.
 * Distinguishing `require('./debt-amortization.js')` from a call to some other
 * binding of the same name needs scope analysis, which needs a real parser,
 * which this build deliberately does not depend on. The supported syntax is
 * "a require call in code position at module scope"; anything else is out of
 * contract and stated here rather than discovered later.
 */

/** Index just past the construct starting at `start`. */
function endOfLineComment(s, start) {
  const j = s.indexOf('\n', start);
  return j === -1 ? s.length : j;
}

function endOfBlockComment(s, start) {
  const j = s.indexOf('*/', start + 2);
  return j === -1 ? s.length : j + 2;
}

function endOfStringLiteral(s, start) {
  const quote = s[start];
  let j = start + 1;
  while (j < s.length) {
    const ch = s[j];
    if (ch === '\\') { j += 2; continue; }
    if (ch === quote) return j + 1;
    j++;
  }
  return s.length;
}

/*
 * FCR-01. ONE lexical rule set, applied by ONE tokenizer.
 *
 * The previous version had three, and every witness in this family has come
 * out of the gaps between them:
 *
 *   the forward scanner      decided regex-vs-division from the previous token
 *   endOfInterpolation       decided it from a different, simpler rule, so a
 *                            control-flow head inside `${...}` read as a value
 *                            and a brace inside the following regex was counted
 *                            as the end of the interpolation
 *   headBeforeCloseParen     scanned BACKWARD over raw characters, so a `(`
 *                            inside a string literal -- `if('(')` -- was counted
 *                            as a real parenthesis and the build invented a
 *                            dependency out of the regex after it
 *
 * Patching the individual strings would have left that structure in place. So
 * the three are replaced by one tokenizer, used for module bodies and template
 * interpolations alike, which tracks paren heads FORWARD on a stack instead of
 * re-reading the source backwards.
 *
 * The second half of FCR-01 is the more important one: the grammar now FAILS
 * CLOSED. Previously an unrecognised `require(` was emitted unchanged and
 * reached the browser as a ReferenceError -- spaces inside the call parens,
 * or a block comment between the loader name and its opening paren, both did
 * exactly that. Any `require` that is CALLED and is not the supported sibling
 * form is now refused by name. Non-call uses -- a property key, a member call
 * on some other object -- are left alone, because those are not the loader.
 *
 * DOCUMENTED LIMIT, unchanged: a locally shadowed `require` binding is still
 * not detected. That needs scope analysis, which needs a real parser. The
 * supported syntax is "a sibling require call in code position"; everything
 * else is now rejected rather than passed through.
 */
const CONTROL_FLOW_HEADS = new Set(['if', 'while', 'for', 'switch', 'catch', 'with']);

/* Identifiers that do NOT produce a value, so a `/` after one starts a regex:
   `return /re/` is a regex literal, `x /re/` is two divisions. */
/* P5-01: `of` and `in` are CONTEXTUAL keywords -- `of` only inside for-of, `in`
   only in for-in and the `in` operator -- and both are legal variable names
   everywhere else. Treating them as non-values by spelling alone made
   `const of = 12; of / require(...)` read the division as a regex and swallow
   the call. Their keyword uses cannot be followed by a regex in any construct
   this grammar supports (`for (x of /re/)` parses but iterates nothing), so
   they are values here. This is a spelling judgement and is written down as
   one; the STRUCTURAL half of the same finding is the property rule below,
   which closes the whole `obj.return` / `obj.in` / `obj.case` family at once
   rather than one name at a time. */
/* P6-01: `await` and `yield` LEFT this set. Both are CONTEXTUAL keywords --
   `await` is a keyword only inside an async function or an ES module, `yield`
   only inside a generator, and in ordinary Script/CommonJS code both are
   perfectly legal identifiers. Treating them as keywords made `const await=12;
   await / require('./x.js')` read its division as a regex opener and swallow
   the loader whole. Same judgement as `of`/`in` in P5-01, and labelled the same
   way: this is a SPELLING decision, not a structural one, and it is sound only
   while no bundled module uses either as a keyword. That is not assumed --
   `tests/audit-fc-findings.test.js` fails if any bundled module introduces
   `async`, `await`, `yield` or `function*`, which is the day this set must be
   revisited. Measured at the time of the change: none of them appear. */
const NON_VALUE_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else',
]);

/* Built rather than typed: a literal backslash in this file has been corrupted
   in transit once already (the U+0001 that made the P5-01 fallback dead code),
   so the one place that needs one names it instead of spelling it. */
const BACKSLASH = String.fromCharCode(92);

/* P6-01: an identifier may be SPELLED with Unicode escapes. `requ\u0069re` is
   the same identifier as `require` to the engine, and the scanner read only
   ASCII, so the escape concealed the loader and it was emitted intact --
   `ReferenceError: require is not defined` in a browser. RESOLVED rather than
   refused, which is the structural choice: one rule makes every spelling of a
   name reach the same decision, instead of one refusal per spelling. The RAW
   text is still what gets emitted whenever the identifier is not the loader,
   so no behaviour changes for anything else. */
/* P7-01: TOKEN BOUNDARIES MUST AGREE WITH THE LANGUAGE, NOT WITH ASCII.
   Identifier scanning used [A-Za-z_$] / [A-Za-z0-9_$], so a literal Unicode
   identifier was SPLIT: `obj.πrequire(...)` read as punct `π` plus a fresh
   identifier `require`, the member-access lookback then saw `π` instead of `.`,
   and the suffix of somebody's property name was rewritten into a namespace.
   That emitted VALID JavaScript returning a DIFFERENT ANSWER -- 99 where the
   source returns 7 -- with no build error and nothing for a syntax check to
   catch. The escaped spelling of the same name survived intact, so two
   spellings of one identifier disagreed. These are the actual ID_Start /
   ID_Continue sets, so the scanner now breaks identifiers where JavaScript
   does. */
/* P8-01: A PROPERTY CLASS APPLIED TO HALF A CHARACTER TESTS NOTHING.
   Round 10 fixed the character CLASSES and left the ITERATION alone, so both
   scanners still walked one UTF-16 code unit at a time. A supplementary-plane
   identifier character is TWO units, and `ID_Start` accepts the whole
   character while rejecting each half -- so `obj.<U+10400>require(...)` split
   exactly the way the ASCII classes used to split pi, and returned 99 instead
   of 7 again. The regex was never the boundary; the cursor was. Read a whole
   code point and advance by its width. */
const ID_START = /[\p{ID_Start}$_]/u;
const ID_CONT = /[\p{ID_Continue}$\u200C\u200D]/u;

/* `\u{1F600}` and `\u0069`, the two spellings the grammar allows. */
const ESCAPE_LONG = new RegExp(BACKSLASH + BACKSLASH + 'u\\{([0-9a-fA-F]+)\\}', 'g');
const ESCAPE_SHORT = new RegExp(BACKSLASH + BACKSLASH + 'u([0-9a-fA-F]{4})', 'g');
const ESCAPE_AT = new RegExp('^' + BACKSLASH + BACKSLASH + 'u(?:\\{[0-9a-fA-F]+\\}|[0-9a-fA-F]{4})');

/* The code point at `k`, and how many UTF-16 units it occupies. One call
   site for both facts, because using the character and advancing by a
   different width is precisely the defect this closes. */
function codePointAt(text, k) {
  const cp = text.codePointAt(k);
  const str = String.fromCodePoint(cp);
  return { str, width: str.length };
}

function resolveIdentEscapes(raw) {
  if (raw.indexOf(BACKSLASH) === -1) return raw;
  return raw
    .replace(ESCAPE_LONG, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(ESCAPE_SHORT, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/* `./name` or `./name.js` -- the whole supported argument. debt-arm and
   friends write the extension; debt-strategy-adapter omits it, so both forms
   are accepted and normalised to one registry key. */
const SIBLING_SPECIFIER = /^\.\/([\w-]+?)(?:\.js)?$/;

function unsupportedSyntax(what, index) {
  return new Error(
    'build: unsupported syntax -- ' + what + ' at index ' + index + '. This ' +
    'bundler scans a deliberately narrow grammar and refuses anything outside ' +
    'it rather than emitting a module that breaks in the browser. Rewrite the ' +
    'construct, or extend the grammar deliberately.');
}

function endOfRegexLiteral(s, start) {
  let j = start + 1;
  let inClass = false;
  while (j < s.length) {
    const ch = s[j];
    if (ch === '\\') { j += 2; continue; }
    if (ch === '\n') return -1;            /* unterminated: it was division */
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) {
      j++;
      while (j < s.length && /[a-z]/i.test(s[j])) j++;   /* flags */
      return j;
    }
    j++;
  }
  return -1;
}

/* Trivia carries no meaning for the regex decision, and `++`/`--` is
   transparent to it: after a postfix increment the value is still a value, and
   in prefix position the operator before it is still an operator. */
function meaningfulBefore(tokens, limit) {
  for (let k = (limit === undefined ? tokens.length : limit) - 1; k >= 0; k--) {
    const t = tokens[k];
    if (t.type === 'trivia' || t.transparent) continue;
    return t;
  }
  return null;
}

/** true = regex, false = division, null = undecidable, so refuse. */
function regexMayStartAfter(tok) {
  if (!tok) return true;                                   /* start of input */
  /* P5-01: a keyword's MEANING depends on position, not spelling. `obj.return`
     is a property read and therefore a value, so `obj.return / x` is division
     -- the old test asked only "is this word in the keyword set" and swallowed
     the division as a regex. Marked at tokenize time, so this closes every
     member name that collides with a keyword in one rule instead of one
     exception per name. */
  if (tok.type === 'ident') return !tok.property && NON_VALUE_KEYWORDS.has(tok.name || tok.text);
  if (tok.type === 'number' || tok.type === 'string' ||
      tok.type === 'template' || tok.type === 'regex') return false;
  if (tok.type === 'punct') {
    if (tok.text === ')') return CONTROL_FLOW_HEADS.has(tok.head || '');
    if (tok.text === ']') return false;
    /* `function f(){} /re/` is a regex and `{valueOf(){}} / n` is division, and
       the difference is whether the brace closed a block or an expression --
       a parse-level fact no lexical lookback settles. Refused, deliberately. */
    if (tok.text === '}') return null;
    return true;
  }
  return true;
}

/**
 * The tokenizer. Returns { tokens, end }.
 *
 * When `stopAtCloseBrace` is set, scanning stops at the `}` that closes the
 * enclosing `${`, and `end` is that brace's index. Because interpolations are
 * scanned by this same function, a brace inside a string, a regex or a nested
 * template can no longer be miscounted as the end of one.
 */
function scanTokens(src, start, stopAtCloseBrace) {
  const tokens = [];
  const parenHeads = [];
  let braceDepth = 0;
  let i = start;

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (/\s/.test(ch)) {
      let j = i; while (j < src.length && /\s/.test(src[j])) j++;
      tokens.push({ type: 'trivia', text: src.slice(i, j) }); i = j; continue;
    }
    if (ch === '/' && next === '/') {
      const e = endOfLineComment(src, i);
      tokens.push({ type: 'trivia', text: src.slice(i, e) }); i = e; continue;
    }
    if (ch === '/' && next === '*') {
      const e = endOfBlockComment(src, i);
      tokens.push({ type: 'trivia', text: src.slice(i, e) }); i = e; continue;
    }

    if (stopAtCloseBrace && ch === '}' && braceDepth === 0) return { tokens, end: i };

    if (ch === '"' || ch === "'") {
      const e = endOfStringLiteral(src, i);
      tokens.push({ type: 'string', text: src.slice(i, e), value: src.slice(i + 1, e - 1) });
      i = e; continue;
    }

    if (ch === '`') {
      const t = scanTemplate(src, i);
      tokens.push(t); i = t.end; continue;
    }

    if (ch === '/') {
      const may = regexMayStartAfter(meaningfulBefore(tokens));
      if (may === null) {
        throw unsupportedSyntax('a `/` directly after `}`, which may be either ' +
          'division or a regex depending on whether the brace closed a block or ' +
          'an expression', i);
      }
      if (may) {
        const e = endOfRegexLiteral(src, i);
        if (e !== -1) { tokens.push({ type: 'regex', text: src.slice(i, e) }); i = e; continue; }
      }
      tokens.push({ type: 'punct', text: '/' }); i++; continue;
    }

    if (ID_START.test(codePointAt(src, i).str) || (ch === BACKSLASH && src[i + 1] === 'u')) {
      /* P6-01: an identifier may begin with or contain a Unicode escape. Raw
         text is kept for emission; `name` is what every decision below reads.
         P7-01: and it may be spelled with literal Unicode, so the whole token
         is taken -- never a suffix of one. */
      let j = i;
      while (j < src.length) {
        if (src[j] === BACKSLASH && src[j + 1] === 'u') {
          const esc = ESCAPE_AT.exec(src.slice(j));
          if (!esc) break;
          j += esc[0].length;
          continue;
        }
        const at = codePointAt(src, j);
        if (!ID_CONT.test(at.str)) break;
        j += at.width;
      }
      if (j === i) { tokens.push({ type: 'punct', text: ch }); i++; continue; }
      const raw = src.slice(i, j);
      const beforeIdent = meaningfulBefore(tokens);
      const isProperty = !!beforeIdent && beforeIdent.type === 'punct' &&
        (beforeIdent.text === '.' || beforeIdent.text === '?.');
      tokens.push({ type: 'ident', text: raw, name: resolveIdentEscapes(raw),
        index: i, property: isProperty });
      i = j; continue;
    }

    if (/[0-9]/.test(ch)) {
      let j = i; while (j < src.length && /[0-9._eExXa-fA-F]/.test(src[j])) j++;
      tokens.push({ type: 'number', text: src.slice(i, j) }); i = j; continue;
    }

    if ((ch === '+' && next === '+') || (ch === '-' && next === '-')) {
      tokens.push({ type: 'punct', text: ch + next, transparent: true }); i += 2; continue;
    }
    if (ch === '?' && next === '.') {
      tokens.push({ type: 'punct', text: '?.' }); i += 2; continue;
    }

    if (ch === '(') {
      const prev = meaningfulBefore(tokens);
      parenHeads.push(prev && prev.type === 'ident' ? prev.text : '');
      tokens.push({ type: 'punct', text: '(' }); i++; continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'punct', text: ')', head: parenHeads.length ? parenHeads.pop() : '' });
      i++; continue;
    }
    if (ch === '{') { braceDepth++; tokens.push({ type: 'punct', text: '{' }); i++; continue; }
    if (ch === '}') { braceDepth--; tokens.push({ type: 'punct', text: '}' }); i++; continue; }

    tokens.push({ type: 'punct', text: ch }); i++; continue;
  }

  if (stopAtCloseBrace) throw unsupportedSyntax('an unterminated template interpolation', start);
  return { tokens, end: i };
}

/** A template literal, with its interpolations tokenized by scanTokens. */
function scanTemplate(src, start) {
  const segments = [];
  let lit = '';
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') { lit += src.slice(i, i + 2); i += 2; continue; }
    if (ch === '`') {
      segments.push({ lit });
      return { type: 'template', segments, end: i + 1, text: src.slice(start, i + 1) };
    }
    if (ch === '$' && src[i + 1] === '{') {
      segments.push({ lit }); lit = '';
      const inner = scanTokens(src, i + 2, true);
      if (src[inner.end] !== '}') throw unsupportedSyntax('an unterminated template interpolation', i);
      segments.push({ interp: inner.tokens });
      i = inner.end + 1;
      continue;
    }
    lit += ch; i++;
  }
  throw unsupportedSyntax('an unterminated template literal', start);
}

/** The supported call shape: `require` `(` <sibling string> `)`, with trivia
 *  allowed at every boundary. Returns the registry key and the index of the
 *  closing paren, or null when the call is not the supported form. */
function matchSiblingRequire(tokens, k) {
  const seq = [];
  for (let j = k + 1; j < tokens.length && seq.length < 4; j++) {
    if (tokens[j].type === 'trivia') continue;
    seq.push({ tok: tokens[j], at: j });
  }
  /* P5-01: an optional call `require?.('./x.js')` is the same loader with one
     more token in front of the paren, so it is supported rather than refused.
     Anything else that is not exactly `(` string `)` is not the supported
     form and the caller refuses it. */
  let i = 0;
  if (seq.length && seq[0].tok.type === 'punct' && seq[0].tok.text === '?.') i = 1;
  if (seq.length < i + 3) return null;
  if (!(seq[i].tok.type === 'punct' && seq[i].tok.text === '(')) return null;
  if (seq[i + 1].tok.type !== 'string') return null;
  if (!(seq[i + 2].tok.type === 'punct' && seq[i + 2].tok.text === ')')) return null;
  const m = SIBLING_SPECIFIER.exec(seq[i + 1].tok.value);
  return { file: m ? m[1] + '.js' : null, specifier: seq[i + 1].tok.value, endIdx: seq[i + 2].at };
}

function emitTokens(tokens, namespaceByFile) {
  const out = [];
  let k = 0;
  while (k < tokens.length) {
    const t = tokens[k];

    if (t.type === 'template') {
      out.push('`');
      for (const seg of t.segments) {
        if (seg.interp) { out.push('${', emitTokens(seg.interp, namespaceByFile), '}'); }
        else out.push(seg.lit);
      }
      out.push('`');
      k++; continue;
    }

    if (t.type === 'ident' && (t.name || t.text) === 'require') {
      const prev = meaningfulBefore(tokens, k);
      const isMember = prev && prev.type === 'punct' && (prev.text === '.' || prev.text === '?.');
      const call = matchSiblingRequire(tokens, k);
      /* Only a CALL is the loader. `{require: fn}` is a property key and
         `obj.require(...)` is somebody else's method -- neither is rewritten,
         and neither is refused. */
      /* P5-01: the old gate was "is the next token a `(`". That is another
         spelling assumption, and two legal call forms walk straight past it --
         `(require)('./x.js')` puts a paren before the name and `require?.(...)`
         puts `?.` after it, so both were emitted unchanged and reached the
         browser as ReferenceError. The rule is now about POSITION, not the
         next character: a `require` in code position is the loader unless it
         is a member access or an object-literal key, and if it is the loader
         it must match the supported call form or be refused. Non-loader uses
         are still untouched, which is what keeps `{require: fn}` and
         `obj.require()` working. */
      /* P6-01: this asked ONLY whether the next token was a colon, and a
         conditional expression has one too -- `(true ? require : null)('./x.js')`
         was therefore exempted as though it were an object-literal key, emitted
         unchanged, and reached the browser as ReferenceError. A colon is not
         enough: an object-literal key is also IN KEY POSITION, which means the
         token before it opens the literal or separates its entries. Both ends
         are now required, so the conditional operand is no longer exempt. */
      let followedByColon = false;
      for (let j = k + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'trivia') continue;
        followedByColon = tokens[j].type === 'punct' && tokens[j].text === ':';
        break;
      }
      const inKeyPosition = !!prev && prev.type === 'punct' &&
        (prev.text === '{' || prev.text === ',');
      const isPropertyKey = followedByColon && inKeyPosition;

      if (!isMember && !isPropertyKey) {
        {
          if (!call || !call.file) {
            throw unsupportedSyntax(
              'a `require(...)` call whose argument is not a literal sibling ' +
              'module specifier' + (call ? ' (got "' + call.specifier + '")' : ''),
              t.index);
          }
          const ns = namespaceByFile[call.file];
          if (!ns) {
            throw new Error(
              'build: unrecognised sibling require in a debt module: require("' +
              call.specifier + '"). Only modules registered in DEBT_MODULES can be ' +
              'required by a sibling; add it there, or remove the dependency. ' +
              '(This is a require in CODE position -- requires inside comments, ' +
              'strings and regex literals are ignored.)');
          }
          out.push(ns);
          k = call.endIdx + 1;
          continue;
        }
      }
    }

    out.push(t.text);
    k++;
  }
  return out.join('');
}

/* P5-01: find a require call for a registered module in text, reading with
   every `/` as division so nothing can hide inside a supposed regex literal.
   Strings and comments are still skipped, because a require named in prose is
   not a dependency -- that was Q34, and re-breaking it would be a regression. */
/* Skip a template literal's LITERAL text while leaving its interpolations to
   be scanned as the code they are. Brace depth is tracked through nested
   strings and templates so a `}` inside either cannot end an interpolation
   early -- the same mistake FCR-01 repaired in the main scanner, not repeated
   here. */
/* P6-01: THE PREVIOUS VERSION RETURNED AS SOON AS IT SAW `${`.
 *
 * That left nothing tracking where the interpolation ENDED. The scan resumed
 * inside the interpolation as code -- correct so far -- but when the template's
 * literal text came back, the CLOSING backtick was read as a new OPENING one,
 * and every byte from there to the next backtick (or to end of file) was
 * skipped as though it were template text. A live loader sitting after a
 * perfectly ordinary `${1}` was therefore invisible to the fallback: that is
 * round 9's fourth witness, which is its third witness plus a harmless prefix.
 *
 * A template's literal text is not code; its interpolations are. So walk the
 * whole template, scan each interpolation as code, and return the index after
 * the CLOSING backtick, so the caller resumes in real code and nothing is
 * silently consumed. */
function scanTemplateForRequire(text, start, namespaceByFile) {
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === BACKSLASH) { i += 2; continue; }
    if (ch === '`') return { end: i + 1, found: null };
    if (ch === '$' && text[i + 1] === '{') {
      const close = endOfInterpolationText(text, i + 2);
      const found = findRegisteredRequireText(text.slice(i + 2, close), namespaceByFile);
      if (found) return { end: close + 1, found };
      i = close + 1;
      continue;
    }
    i++;
  }
  return { end: text.length, found: null };
}

/* The matching `}` of an interpolation, with braces balanced THROUGH strings,
   comments and nested templates so a brace inside any of them cannot end the
   interpolation early -- the same mistake FCR-01 repaired in the main scanner,
   deliberately not repeated here. */
function endOfInterpolationText(text, start) {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '/' && next === '/') { i = endOfLineComment(text, i); continue; }
    if (ch === '/' && next === '*') { i = endOfBlockComment(text, i); continue; }
    if (ch === '"' || ch === "'") { i = endOfStringLiteral(text, i); continue; }
    if (ch === '`') { i = scanTemplateForRequire(text, i, {}).end; continue; }
    if (ch === '{') { depth++; i++; continue; }
    if (ch === '}') { if (depth === 0) return i; depth--; i++; continue; }
    i++;
  }
  return text.length;
}

function findRegisteredRequireText(text, namespaceByFile) {
  let i = 0;
  /* P7-02: the previous NON-TRIVIA token, so member position survives
     whitespace and comments. Starts empty: a `require` at index 0 is code. */
  let lastMeaningful = '';
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    /* Comments are TRIVIA: they must not disturb `lastMeaningful`, which is
       the whole point of P7-02. Strings and templates are values, so they do. */
    if (ch === '/' && next === '/') { i = endOfLineComment(text, i); continue; }
    if (ch === '/' && next === '*') { i = endOfBlockComment(text, i); continue; }
    if (ch === '"' || ch === "'") { lastMeaningful = 'str'; i = endOfStringLiteral(text, i); continue; }
    if (ch === '`') {
      const tpl = scanTemplateForRequire(text, i, namespaceByFile);
      if (tpl.found) return tpl.found;
      lastMeaningful = 'str';
      i = tpl.end;
      continue;
    }
    if (ch === '?' && next === '.') { lastMeaningful = '?.'; i += 2; continue; }
    if (ID_START.test(codePointAt(text, i).str) || (ch === BACKSLASH && text[i + 1] === 'u')) {
      let j = i;
      while (j < text.length) {
        if (text[j] === BACKSLASH && text[j + 1] === 'u') {
          const esc = ESCAPE_AT.exec(text.slice(j));
          if (!esc) break;
          j += esc[0].length;
          continue;
        }
        const at = codePointAt(text, j);
        if (!ID_CONT.test(at.str)) break;
        j += at.width;
      }
      if (j === i) { i++; continue; }
      /* P7-02: member position is a TOKEN fact, not a character fact. This
         asked `text[i - 1] !== '.'`, so one space or a comment between the dot
         and the name defeated the exemption and a perfectly ordinary
         `obj. require('./x.js')` was refused as a surviving loader -- a
         regression this fallback introduced against package (6). Registration
         never turned a method's argument into a dependency. `lastMeaningful`
         carries the previous non-trivia token, so whitespace, comments and
         optional chaining all reach the same answer. */
      const isMember = lastMeaningful === '.' || lastMeaningful === '?.';
      const isLoaderName = resolveIdentEscapes(text.slice(i, j)) === 'require';
      lastMeaningful = 'ident';
      if (isLoaderName && !isMember) {
        /* The closing quote must MATCH the opening one, hence the \1.
           This line shipped with a literal U+0001 control character where that
           backreference belongs -- a correct fix corrupted in transit by shell
           escape processing, not a design error. The regex therefore demanded a
           SOH byte that no source file contains, so it never matched, so this
           whole function was DEAD CODE and the 'independent check' it backs had
           never once run. Two things had to fail together: the corruption, and a
           disjunctive witness that passed on its other branch and so never
           exercised the backstop. Found by testing a false-rejection control the
           round-8 auditor asked for. See tests/audit-fc-findings.test.js for the
           source-wide control-character gate that makes the class visible. */
        const m = /^\s*\??\.?\s*\(\s*(['"])(.+?)\1\s*\)/.exec(text.slice(j));
        if (m) {
          const spec = SIBLING_SPECIFIER.exec(m[2]);
          const file = spec ? spec[1] + '.js' : null;
          if (file && namespaceByFile[file]) return 'require("' + m[2] + '")';
        }
      }
      i = j; continue;
    }
    if (!/\s/.test(ch)) lastMeaningful = ch;
    i++;
  }
  return null;
}

function rewriteSiblingRequires(body, namespaceByFile, skipBackstop) {
  const { tokens } = scanTokens(body, 0, false);
  const result = emitTokens(tokens, namespaceByFile);

  /*
   * Two checks on the way out, and they prove different things.
   *
   * FC-01 corrected the claim this comment used to make: re-scanning the
   * output with the SAME scanner is not independent protection. It never was
   * -- where the first pass misread a require, the second misread it
   * identically. What it does still catch is a require that survived for a
   * reason this scanner can see, so it is kept and described accurately.
   *
   * FCR-01 adds the check that IS independent: the emitted text is handed to
   * V8's own parser. That catches the unbalanced-brace class the interpolation
   * scanner used to produce, and it catches it with a parser this bundler did
   * not write. It does NOT prove dependency resolution -- a surviving
   * `require(` parses perfectly well -- which is why the fail-closed rule
   * above, not this check, is what makes a dangling loader call impossible.
   */
  if (!skipBackstop) {
    try {
      rewriteSiblingRequires(result, {}, true);
    } catch (err) {
      throw new Error(
        'build: a require survived rewriting and would reach the browser as ' +
        'ReferenceError. The scanner did not recognise it as a dependency, which ' +
        'means this module uses syntax the bundler does not support. Underlying: ' +
        err.message);
    }
    /*
     * P5-01: the check that does NOT share the scanner's regex decisions.
     *
     * Every witness in this family hides the same way: a `/` is misread as the
     * start of a regex, the call gets swallowed into what the scanner believes
     * is regex text, and the loader token is therefore never seen by the rule
     * above. A second pass through the same scanner cannot find it -- it makes
     * the identical misjudgement -- and the V8 parse check cannot either,
     * because a surviving `require(` parses perfectly well.
     *
     * So this pass rescans the OUTPUT under the opposite assumption: every `/`
     * is division, nothing is ever a regex. Under that reading a swallowed
     * call becomes ordinary code again. It is deliberately scoped to REGISTERED
     * modules: a real dependency that survived unrewritten is unambiguously a
     * bug, while `/[require('./missing.js')]/` is a genuine regex about a
     * module that does not exist and must keep building.
     */
    const survivors = findRegisteredRequireText(result, namespaceByFile);
    if (survivors) {
      throw new Error(
        'build: a require for a REGISTERED sibling module survived rewriting (' +
        survivors + '). Found by rescanning the output with every `/` treated as ' +
        'division rather than as a regex, which is the one reading this scanner ' +
        'cannot reach on its own -- so the call was almost certainly swallowed by ' +
        'a regex-versus-division misjudgement. The emitted module would throw ' +
        'ReferenceError in the browser.');
    }

    try {
      new vm.Script(result, { filename: 'bundled-module-check.js' });
    } catch (err) {
      throw new Error(
        'build: the rewritten module does not parse. The bundler produced text ' +
        'that is not valid JavaScript, which would break the whole artifact at ' +
        'load. Checked with the engine\'s own parser rather than this scanner. ' +
        'Underlying: ' + err.message);
    }
  }

  return result;
}

function wrapDebtModule(rawSource, namespace, namespaceByFile) {
  const stripped = stripHeaderComment(rawSource);
  const { body, exportsExpr } = splitExportFooter(stripped);
  const rewired = rewriteSiblingRequires(body, namespaceByFile);
  return 'var ' + namespace + ' = (function () {\n' + rewired + '\n  return ' + exportsExpr + ';\n})();';
}

/*
 * Q15 fix (FULL_MODEL_AUDIT_AND_CLAUDE_HANDOVER_20260910.md): the six
 * namespaces are emitted inside a single FACTORY FUNCTION, then destructured
 * out of it.
 *
 * The Web Worker is built by a second, independent assembler
 * (buildWorkerSource() in app-shell.html) that serializes named functions via
 * fn.toString(). The repair originally proposed for Q15 --
 * `DebtAmortization.monthlyPayment.toString()` -- does not work:
 * monthlyPayment closes over the PRIVATE monthlyRate helper, so the
 * serialized fragment throws `ReferenceError: monthlyRate is not defined`.
 * The auditor executed it and confirmed that.
 *
 * A factory fixes it structurally rather than by hand-maintaining another
 * fragment list. Function.prototype.toString() returns the factory's ENTIRE
 * source -- every namespace, every private helper, every sibling require
 * already rewritten -- so the worker gets a complete dependency graph from
 * one expression and cannot drift from the main thread's copy. That is the
 * audit's section D point: package the graph once, feed both entry points.
 *
 * The destructuring afterwards keeps the main thread's existing surface
 * exactly as it was: `DebtAmortization` and friends remain plain bindings in
 * the app's script scope, so src/engine.js's bare references are unchanged.
 */
function buildDebtModulesBlock(srcDir) {
  const namespaceByFile = {};
  BUNDLED_MODULES.forEach(function (m) { namespaceByFile[m.file] = m.namespace; });
  const bodies = BUNDLED_MODULES.map(function (m) {
    const raw = readSource(path.join(srcDir, m.file));
    return wrapDebtModule(raw, m.namespace, namespaceByFile);
  }).join('\n\n');
  const names = BUNDLED_MODULES.map(function (m) { return m.namespace; });
  const returned = names.map(function (n) { return n + ':' + n; }).join(',');
  const destructured = names.map(function (n) {
    return 'var ' + n + '=__debtModules.' + n + ';';
  }).join('');
  return 'function __debtModulesFactory(){\n' + bodies + '\n  return {' + returned + '};\n}\n' +
    'var __debtModules=__debtModulesFactory();' + destructured;
}

/*
 * Assembles the shipped single-file output. `outputPath` defaults to the
 * real shipped artifact but accepts a scratch path -- callers verifying this
 * script (see tests/build-debt-bundling.test.js) must never let a build
 * touch investment-calculator-v2c.html, which is stale by design (ground
 * rule 2) until R2-T08. Returns the pieces as well as the final string so
 * tests can check the engine/validator regions without re-deriving them.
 */
/* Read a source file with line endings normalised to LF.
 *
 * WHY THIS EXISTS. stripHeaderComment() matched "'use strict';\n" exactly, so
 * a CRLF source threw "unexpected source header" and no artifact was produced
 * at all. That is not a hypothetical: this repository stores LF blobs with
 * core.autocrlf=true and no .gitattributes, so **checkout writes CRLF** -- a
 * fresh clone on Windows could not build, and every test that builds from src/
 * failed with it. It went unnoticed because the working tree here happened to
 * hold LF after an unrelated repair, and was found only by extracting a
 * package and running its tests as an auditor would.
 *
 * Normalising on READ rather than matching both forms at the one comparison
 * site removes the whole class: nothing downstream can acquire a line-ending
 * dependency, and the built artifact is byte-identical however the tree was
 * checked out. Output is written with LF for the same reason. */
function readSource(p) {
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

/* S5 2l (Q53): src/engine.js and src/scenario-validator.js each read
   src/boolean-flag-contract.json as data in Node, and a page has no file system. So the build replaces that one read
   with the file's own JSON, and refuses to build unless it finds exactly one:
   a build that skipped it would ship an engine that throws on its first plan.
   "<" is escaped so the JSON cannot end the page's script element. */
const BOOLEAN_FLAG_CONTRACT_READ = 'JSON.parse(require("fs").readFileSync(require("path").join(__dirname,"boolean-flag-contract.json"),"utf8"))';

/* S5AA R43 (SA42F-05, -06): the plan-value contract is read the same way by both files, and inlined the same way. */
const PLAN_VALUE_CONTRACT_READ = 'JSON.parse(require("fs").readFileSync(require("path").join(__dirname,"plan-value-contract.json"),"utf8"))';
function substitutePlanValueContract(body, dir) {
  const found = body.split(PLAN_VALUE_CONTRACT_READ).length - 1;
  if (found !== 1) throw new Error('build: expected exactly one plan-value contract read in each of engine.js and scenario-validator.js, found ' + found);
  const json = JSON.stringify(JSON.parse(readSource(path.join(dir, 'plan-value-contract.json')))).replace(/</g, '\\u003c');
  return body.split(PLAN_VALUE_CONTRACT_READ).join(json);
}

function substituteBooleanFlagContract(engineBody, dir) {
  const found = engineBody.split(BOOLEAN_FLAG_CONTRACT_READ).length - 1;
  if (found !== 1) throw new Error('build: expected exactly one boolean-flag contract read in each of engine.js and scenario-validator.js, found ' + found);
  const json = JSON.stringify(JSON.parse(readSource(path.join(dir, 'boolean-flag-contract.json')))).replace(/</g, '\\u003c');
  return engineBody.split(BOOLEAN_FLAG_CONTRACT_READ).join(json);
}

function build(outputPath, srcDir) {
  const dir = srcDir || path.join(__dirname, 'src');
  const shellPath = path.join(dir, 'app-shell.html');
  const shell = readSource(shellPath);
  const engineRaw = readSource(path.join(dir, 'engine.js'));
  const validatorRaw = readSource(path.join(dir, 'scenario-validator.js'));

  if (!shell.includes(DEBT_MARKER)) throw new Error('build: ' + DEBT_MARKER + ' not found in ' + shellPath);
  if (!shell.includes(MARKER)) throw new Error('build: ' + MARKER + ' not found in ' + shellPath);
  if (!shell.includes(VALIDATOR_MARKER)) throw new Error('build: ' + VALIDATOR_MARKER + ' not found in ' + shellPath);

  const debtModulesBlock = buildDebtModulesBlock(dir);
  const engineBody = substitutePlanValueContract(substituteBooleanFlagContract(stripHeaderComment(stripNodeExportFooter(engineRaw)), dir), dir);
  const validatorBody = substitutePlanValueContract(substituteBooleanFlagContract(stripHeaderComment(stripNodeExportFooter(validatorRaw)), dir), dir);

  const output = shell
    .replace(DEBT_MARKER, debtModulesBlock)
    .replace(MARKER, engineBody)
    .replace(VALIDATOR_MARKER, validatorBody);

  const target = outputPath || OUTPUT_PATH;
  fs.writeFileSync(target, output, 'utf8');
  console.log('Wrote', target, '(' + output.length + ' chars)');

  return { output, debtModulesBlock, engineBody, validatorBody };
}

if (require.main === module) {
  build(process.argv[2]);
}

module.exports = {
  build,
  DEBT_MODULES,
  BUNDLED_MODULES,
  EXCLUDED_MODULES,
  MARKER,
  VALIDATOR_MARKER,
  DEBT_MARKER,
  OUTPUT_PATH,
  stripHeaderComment,
  stripNodeExportFooter,
  splitExportFooter,
  rewriteSiblingRequires,
  findRegisteredRequireText,
  wrapDebtModule,
};

'use strict';

/*
 * An in-memory variant of src/engine.js: the same source text, with declared
 * injections, compiled as a separate module. The file on disk is never edited,
 * so no engine byte, fixture or source hash moves (ground rule 9).
 *
 * Two uses, both introduced by S4 task 6:
 *
 *   TAPS    read-only observations of values the engine computes but does not
 *           put on the row. A tap calls a hook and changes nothing -- and that
 *           is ASSERTED by whoever uses one, by comparing the variant's rows
 *           with the real engine's, never assumed.
 *   FAULTS  deliberate defects, to prove that a check goes red for the right
 *           reason without touching the shipped file.
 *
 * Every injection names a marker that must occur EXACTLY ONCE in the source.
 * A marker that has moved, vanished or multiplied throws, so a variant can
 * never silently inject into the wrong place -- or into nothing, which would
 * leave a "fault" that proves nothing.
 *
 * The caller installs what the engine expects as globals (RULES and the debt
 * modules), exactly as for the real engine.
 */

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ENGINE_PATH = path.join(__dirname, '..', '..', 'src', 'engine.js');

/* injection: { id, marker, append } inserts `append` after the marker;
              { id, marker, replace } replaces the marker. */
function injectInto(source, injections) {
  let src = source;
  for (const inj of injections) {
    const count = src.split(inj.marker).length - 1;
    if (count !== 1) throw new Error('engine variant: the marker for "' + inj.id + '" occurs ' + count + ' times; it must occur exactly once');
    src = src.replace(inj.marker, () => (inj.replace !== undefined ? inj.replace : inj.marker + inj.append));
  }
  return src;
}

let serial = 0;
function loadEngineVariant(injections) {
  const source = fs.readFileSync(ENGINE_PATH, 'utf8');
  const m = new Module(ENGINE_PATH + '#variant-' + (++serial), null);
  m.filename = ENGINE_PATH;
  m.paths = Module._nodeModulePaths(path.dirname(ENGINE_PATH));
  m._compile(injectInto(source, injections || []), ENGINE_PATH);
  return m.exports;
}

module.exports = { ENGINE_PATH, injectInto, loadEngineVariant };

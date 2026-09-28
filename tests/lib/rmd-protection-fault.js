'use strict';
/* S5AA R17 round: AN ENGINE WHOSE RMD RESERVE PROTECTION IS DEFEATED, for tests that must show a defeated promise is
 * still refused. Under per-obligation classification (the owner's decision Q1-B, 2026-09-22) RMD_NOT_DISTRIBUTED is raised
 * only when an obligation a conversion or transfer actually protected ends short -- and the working engine keeps that
 * promise, so no ordinary plan reaches the error. A guard nothing reaches must still be shown to fire: this compiles a
 * copy of src/engine.js in which rmdProtectedAmounts() holds nothing out of the row's return, and the caller runs the
 * same plan through both. The substitution must match exactly once, or this throws -- a fault that silently failed to
 * apply would make every test built on it pass for the wrong reason.
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ENGINE = path.join(__dirname, '..', '..', 'src', 'engine.js');
const SITE = 'function rmdProtectedAmounts(groups,p,priorReturn){\n  var held=Object.create(null);';

function engineWithoutReserveProtection() {
  const source = fs.readFileSync(ENGINE, 'utf8');
  const count = source.split(SITE).length - 1;
  if (count !== 1) throw new Error('rmd-protection-fault: the protection site matched ' + count + ' times, not once');
  const faulted = source.replace(SITE, SITE + 'return held;');
  const m = new Module(ENGINE + '#reserve-protection-defeated', module);
  m.filename = ENGINE;
  m.paths = Module._nodeModulePaths(path.dirname(ENGINE));
  m._compile(faulted, ENGINE);
  return m.exports;
}

module.exports = { engineWithoutReserveProtection };

/* S5AA R46 prediction: the PRE-REPAIR engine of a source tree, compiled in memory with three probes and, on request, the owner's
   reserve formula in place of today's. Nothing is written to disk: the patched text is compiled as a module whose filename is the
   tree's own src/engine.js, so its JSON contracts load from the tree. Used by r46_corpus_scan.js and r46_test_exposure_hook.js.

   The probes (globalThis.__r46, when set):
   - draw(age): accountReturnForPeriod() consumed one normal(random) for one account (a Monte Carlo draw, today one per account);
   - sup(age):  accountReturnForPeriod() was called with suppressDraw under Monte Carlo (RA-02/Q19: the expectation, no draw);
   - res(age, balance, reserve, total): the reserve blend ran for one account, with that account's balance, the reserve amount
     (spending x years) and the portfolio total it divides by.
   Each probe sits on the exact expression the repair replaces, so it sees every call the engine makes, through every route.

   With { newReserve: true } the reserve share is the owner's MC-B formula, min(1, reserve / total), the same for every account;
   nothing else changes. That variant is the C5 direction-and-size run for the deterministic movers: the base engine with only the
   reserve line replaced. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const DRAW_OLD = 'ret=accountExpected(ac,p,yearProgress,null)+(suppressDraw?0:accountVolatility(ac,p,yearProgress)*normal(random))';
const DRAW_NEW = 'ret=accountExpected(ac,p,yearProgress,null)+(suppressDraw?(globalThis.__r46&&globalThis.__r46.sup(age),0):(globalThis.__r46&&globalThis.__r46.draw(age),accountVolatility(ac,p,yearProgress)*normal(random)))';
const RES_OLD = 'var reserve=Math.min(ac.balance,(Number.isFinite(Number(reserveSpend))?Number(reserveSpend):p.retirement.spending)*p.advanced.reserveYears),share=reserve/Math.max(1,portfolioTotal);';
const RES_PROBE = 'var __r46R=(Number.isFinite(Number(reserveSpend))?Number(reserveSpend):p.retirement.spending)*p.advanced.reserveYears;globalThis.__r46&&globalThis.__r46.res(age,ac.balance,__r46R,portfolioTotal);';

function patchedSource(root, options) {
  const src = fs.readFileSync(path.join(root, 'src', 'engine.js'), 'utf8');
  const count = (s) => src.split(s).length - 1;
  if (count(DRAW_OLD) !== 1) throw new Error('r46_instrument: the Monte Carlo draw expression is not found exactly once in ' + root);
  if (count(RES_OLD) !== 1) throw new Error('r46_instrument: the reserve expression is not found exactly once in ' + root);
  const reserve = options && options.newReserve
    ? RES_PROBE + 'var reserve=__r46R,share=Math.min(1,reserve/Math.max(1,portfolioTotal));'
    : RES_PROBE + RES_OLD;
  return src.replace(DRAW_OLD, DRAW_NEW).replace(RES_OLD, reserve);
}

function loadInstrumentedEngine(root, options) {
  const file = path.join(root, 'src', 'engine.js');
  const m = new Module(file + (options && options.newReserve ? '#r46-new-reserve' : '#r46-probe'), module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(patchedSource(root, options), file);
  return m.exports;
}

module.exports = { loadInstrumentedEngine, patchedSource };

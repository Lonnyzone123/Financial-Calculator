'use strict';
/*
 * Shared numerical utility for the ported modules under src/ported/.
 *
 * DISCOVERED DURING A PHASE 8 AUDIT PASS: Python's built-in sum() and
 * statistics.fmean() use Neumaier (compensated) summation for float
 * sequences, not naive sequential addition. This is NOT the same as JS's
 * Array.prototype.reduce((a,b) => a+b, 0), and the difference is not
 * always negligible-and-safely-within-tolerance -- it was discovered
 * specifically because a hand-built adversarial test case landing "exactly"
 * at a 0.9 boundary (four dollar amounts summing to what should be
 * precisely $1,000,000) diverged by ~1e-13 between naive JS summation and
 * Python's sum(), and that 1e-13 was enough to flip a `> 0.9` comparison
 * and add a spurious concern message the Python source never produced.
 * Every other test in this codebase used a numeric EPS tolerance that
 * safely absorbed this class of error -- but a boolean threshold check has
 * no tolerance to absorb it into.
 *
 * Verified (see the Phase 8 audit write-up in MERGE_AUDIT_AND_PLAN.md) to
 * exactly reproduce Python's sum() and fmean()/mean() (sum/len) across
 * hundreds of random trials, not just the one case that surfaced this.
 *
 * Use preciseSum/preciseMean anywhere a ported function's Python source
 * uses sum(...) or statistics.fmean(...)/mean(...) on floats. Do NOT use
 * it to "improve" a manual Python accumulator loop (`total = 0.0; for x in
 * xs: total += x`) -- that pattern is naive sequential addition in Python
 * too, and a plain JS reduce already matches it exactly.
 */

function preciseSum(values) {
  let total = 0;
  let compensation = 0;
  for (const x of values) {
    const t = total + x;
    if (Math.abs(total) >= Math.abs(x)) {
      compensation += total - t + x;
    } else {
      compensation += x - t + total;
    }
    total = t;
  }
  return total + compensation;
}

function preciseMean(values) {
  return preciseSum(values) / values.length;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { preciseSum, preciseMean };
}

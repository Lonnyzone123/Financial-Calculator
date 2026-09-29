'use strict';

/*
 * Seeds the frozen scenario generator produces that a later model decision refuses.
 *
 * The generator's seeds are the corpus's inputs, and control test 4.7 pins those inputs, so it cannot be changed to stop
 * producing them. The tests that hold every generated plan valid therefore skip exactly these seeds, and only when the
 * validator refuses them for exactly the decided reason, and they assert that every listed seed in their range still occurs.
 * The list can neither hide a new refusal (any other error still fails) nor outlive its reason (a seed that stops being
 * refused fails the "still occurs" check).
 *
 * TRANSFER_INTO_WORKPLACE_PLAN -- S5AA R29: a transfer into a 401(k) from a different kind of account is refused (the owner,
 * 2026-09-28: "Refuse it"). Seed 9 moves an HSA into a traditional 401(k); 82 and 100052 were found by the same sweep.
 */
const DECIDED = {
  TRANSFER_INTO_WORKPLACE_PLAN: { path: 'advanced.transferTo', seeds: [9, 82, 100052] },
};

function errorKeys(result) {
  return result.issues.filter((i) => i.severity === 'ERROR').map((i) => i.code + '@' + i.path).sort();
}

/* True when `seed` is listed and the validator's result refuses it for exactly its decided reason and nothing else. */
function isDecidedRefusal(seed, result) {
  return Object.entries(DECIDED).some(([code, d]) => d.seeds.includes(seed) &&
    JSON.stringify(errorKeys(result)) === JSON.stringify([code + '@' + d.path]));
}

/* The listed seeds that fall in [from, from + count). */
function decidedSeedsIn(from, count) {
  return [...new Set(Object.values(DECIDED).flatMap((d) => d.seeds))].filter((s) => s >= from && s < from + count).sort((a, b) => a - b);
}

/* The decided codes, for a warning-level test that must not count the decided error as an unexpected issue. */
const DECIDED_CODES = Object.keys(DECIDED);

module.exports = { DECIDED, isDecidedRefusal, decidedSeedsIn, DECIDED_CODES };

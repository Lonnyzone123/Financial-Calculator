'use strict';

/*
 * S5AA R53 (the owner's decision 3 of 2026-10-04: an end age before the retirement age is refused everywhere) -- THE WORKING-ONLY
 * HORIZON, ADAPTED.
 *
 * Many tests modelled "still working when the plan ends" with a retirement age after the end age (age 60, retirement 65, end 64). The
 * validator (END_AGE_BEFORE_RETIREMENT), the app's import and the engine (SCENARIO_END_AGE_BEFORE_RETIREMENT) now refuse that plan. The
 * same household, as the owner decided it may be entered, retires AT the end age: every row still works in full, and the engine reads
 * nothing else from a retirement date after the horizon. A spouse whose date followed profile.retireAge (R45: no spouseRetireAge) keeps
 * it as profile.spouseRetireAge, so the spouse's work is unchanged.
 *
 * Measured, not assumed: at cbce0ce every engine call of the tests that used the idiom was re-run with this change
 * (audit/S5AA/R53/prediction/r53_endage_neutrality_at_cbce0ce.jsonl): 238 of 238 readable plans gave the identical result -- rows,
 * issues, every field. So a test adapted with retireAtEnd() keeps every figure it pinned.
 *
 * Returns the plan, changed in place. A plan that does not end before its retirement age is returned untouched.
 */
function retireAtEnd(p) {
  const pr = p && p.profile;
  if (!pr || typeof pr.endAge !== 'number' || typeof pr.retireAge !== 'number' || !(pr.endAge < pr.retireAge)) return p;
  if (pr.spouseOn === true && typeof pr.spouseRetireAge !== 'number') pr.spouseRetireAge = pr.retireAge;
  pr.retireAge = pr.endAge;
  return p;
}

module.exports = { retireAtEnd };

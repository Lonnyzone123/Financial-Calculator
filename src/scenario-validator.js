'use strict';
/*
 * Track B, L1 -- structural Scenario validator.
 *
 * Genuinely new development (Section 0's "build directly in JS" rule --
 * there is no Python reference for the calculator's own Scenario shape),
 * not a port. Lives outside src/ported/ for that reason, and is NOT called
 * from src/engine.js, app-shell.html, or the generated Worker source -- it
 * is deliberately standalone and additive, per this project's own posture
 * (SESSION_HANDOVER_2026-09-07.md, "next candidates" section) that wiring a
 * validator into the live calculate() path is a UI-behavior-changing
 * decision that deserves its own check-in, not something to fold into a
 * test-writing pass. Track A1 formalized the calculator's existing `plan`
 * object as the de facto Scenario schema rather than redesigning it; this
 * validator checks a plan against that same existing shape.
 *
 * Motivation (roadmap §11c finding C-1): normalizedPlan()/importSettings()
 * in app-shell.html are lenient by design -- they backfill missing fields
 * from defaultPlan and coerce loosely, which is the right behavior for a
 * plan the app itself saved. But an imported file (a hand-edited export, a
 * corrupted localStorage value, a future format this version doesn't know
 * about) can carry a field of the *wrong type or shape* that normalization
 * doesn't catch and that later crashes deep inside the engine (e.g.
 * `p.accounts.filter` if accounts isn't an array) with a confusing stack
 * trace instead of a clear, structured message. This module exists to be
 * run against a candidate plan -- most usefully right after import, before
 * ever reaching runScenario() -- and report exactly what's wrong.
 *
 * Every check reports a structured issue rather than throwing:
 *   { code, severity: 'ERROR' | 'WARNING', path, message }
 * ERROR means the engine will very likely throw or silently misbehave
 * (wrong type on a field the engine indexes/iterates/arithmetic's on
 * directly). WARNING means the value is a valid type but outside the range
 * the app's own UI would ever produce (so it's probably corrupt or from an
 * incompatible source), yet unlikely to crash the engine outright.
 */

const TAX_CLASSES = ['taxable', 'preTax', 'roth', 'hsa'];
/* S5AA R9 round, the owner's decision 12 (2026-09-21): who may own an account. The engine reads every owner but "spouse" as the
 * primary person's, so a typo moved an account to the other person silently. The rule is the app's own ownerOptions: an
 * account in a contribution-limit group (IRA, 401(k), HSA) is one individual's -- "self" or "spouse"; a taxable or custom
 * account may also be "joint". An absent owner stays accepted (normalizeAccount() fills "self"). */
const ACCOUNT_OWNERS = ['self', 'spouse'];
const JOINT_OWNER_ACCOUNT_TYPES = ['taxable', 'customTaxable', 'customTraditional', 'customRoth'];
/* S5AA R29: the workplace-plan account types -- the engine's accountType(...).limitGroup === 'workplace' (a test pins the two
   together). A transfer into one from a different tax class has no lawful route (the owner, 2026-09-28: "Refuse it"). */
const WORKPLACE_PLAN_TYPES = ['traditional401k', 'roth401k'];
/* S5AA R32 (R30A-03): the named sheltered accounts a rollover moves between -- held to one owner (the list in the engine's transferBetweenOwnersRefused()). */
const ROLLOVER_OWNER_TYPES = ['traditionalIRA', 'traditional401k', 'rothIRA', 'roth401k', 'hsa'];
const FILING_STATUSES = ['single', 'mfj', 'hoh'];
const METHODS = ['simple', 'historical', 'monteCarlo'];
const WITHDRAWAL_ORDERS = ['manual', 'optimized'];
/* S5 2k (Q58): a PINNED COPY of the engine's WITHDRAWAL_STRATEGIES. The
   validator is required standalone, without the engine, so it cannot read the
   declaration; tests/registry-single-definition.test.js holds the two equal. */
const STRATEGIES = ['constantPercent', 'fixedNominal', 'fixedReal', 'floorCeiling', 'guardrails', 'guyton', 'incomeFirst', 'rmd', 'vpw'];
const RATE_TYPES = ['fixed', 'adjustable'];
const LIQUIDITY_TIERS = ['liquid', 'limited', 'illiquid'];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function makeCollector() {
  const issues = [];
  return {
    issues,
    error(code, path, message) { issues.push({ code, severity: 'ERROR', path, message }); },
    warn(code, path, message) { issues.push({ code, severity: 'WARNING', path, message }); },
  };
}

// Runs `check(value, path)` only if `value` is present (not undefined);
// absence itself is reported separately by requireField/requireSection.
function checkType(c, value, path, predicate, code, label) {
  if (value === undefined) return false;
  if (!predicate(value)) {
    c.error(code, path, `expected ${label} at "${path}", got ${JSON.stringify(value)}`);
    return false;
  }
  return true;
}

function checkEnum(c, value, path, allowed) {
  if (value === undefined) return;
  if (!allowed.includes(value)) {
    c.warn('INVALID_ENUM', path, `"${path}" is ${JSON.stringify(value)}, expected one of ${allowed.join(', ')}`);
  }
}

function checkRange(c, value, path, min, max, code, severity) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return; // type already reported elsewhere
  if (value < min || value > max) {
    (severity === 'error' ? c.error : c.warn)(code || 'OUT_OF_RANGE', path, `"${path}" is ${value}, expected between ${min} and ${max}`);
  }
}

function requireSection(c, plan, key) {
  if (plan[key] === undefined) {
    c.error('MISSING_SECTION', key, `required section "${key}" is missing`);
    return null;
  }
  if (!isPlainObject(plan[key])) {
    c.error('WRONG_TYPE', key, `section "${key}" must be an object, got ${JSON.stringify(plan[key])}`);
    return null;
  }
  return plan[key];
}

/* P7 (decision register, 2026-09-10), closing SPRINT_QUESTIONS.md Q32.
 *
 * Every REQUIRED-field omission was already caught -- 1,011 sites, 13 kinds,
 * 60 seeds, all rejected, with two controls. OPTIONAL fields pass by
 * construction, and 506 omissions across those seeds produced:
 *
 *     inert                 427
 *     silent, immaterial      9
 *     loud (calculationError) 0
 *     SILENT AND MATERIAL    70
 *
 * Zero loud. Not one announced itself. The five sites below are all 70.
 *
 * The sharpest is `otherIncomes[].owner`. otherIncomeFor() reads
 * `i.owner === "spouse" && p.profile.spouseOn`, so an ABSENT owner makes that
 * false and a spouse-owned income is timed against SELF's age -- shifted by the
 * whole age gap. On seed 100006 that moved lifetime taxes by $170,465.63 across
 * 61 leaves on 15 rows, with no validation error and no calculationError.
 *
 * That is SA-01's mechanism exactly: an absent field makes a conditional false
 * and the code proceeds as though it had been given a real answer.
 *
 * WHY THIS REPORTS RATHER THAN DEFAULTS. The obvious repair is to default
 * `owner` to "self" in the normalizer, and it would be a guess. Q32 records
 * that `household` reaches the same branch -- `i.owner === "spouse"` is false
 * for it too, so a household-owned income is ALSO timed against self -- and
 * that "whether that is intended is not written down anywhere". Choosing a
 * default here would silently ratify one reading of an undecided question.
 * Making the omission loud costs nothing and decides nothing.
 *
 * ERROR, not WARNING, unlike P8's unknown-key allowlist. An unknown key is
 * usually harmless and occasionally a typo; these five are known to move money
 * in 70 measured cases. A record the user built without them has no defined
 * behaviour, and the engine is not changed by this -- absence is reported, not
 * reinterpreted, so no existing projection moves. */
/* CL-05: BRANCH-AWARE, because P7's first version was not.
 *
 * P7 made five fields mandatory on every record in their collection, including
 * on branches that never read them. The re-audit showed three cases where the
 * omitted field is provably inert -- identical engine results against controls
 * carrying explicit extreme values, including 100% growth -- and the plan was
 * rejected anyway, after the real normalizer and by the actual import reviewer.
 *
 * Worse, the error text asserted that the absence "changes the answer". In
 * those cases that was simply false, which is the part that makes it a
 * compatibility regression rather than a strict schema policy.
 *
 * The branches, read from the engine rather than assumed:
 *   otherIncomeFor()  -- a `oneTime` income returns before any growth logic;
 *                        `inflation` and `cola` modes compute their factor from
 *                        the inflation series or growthFromCola(), never from
 *                        the record's own `growth`.
 *   applyStage()      -- a `percent` stage multiplies the strategy amount and
 *                        never reads the amount-stage growth settings.
 *
 * `owner` stays unconditional. It is the timing decision itself, and its
 * absence silently re-times a spouse-owned stream against self's age -- Q32's
 * $170,465.63 case. Nothing about which branch runs makes that inert. */
const MATERIAL_RECORD_FIELDS = {
  otherIncomes: [
    { field: 'owner', applies: () => true,
      why: 'it decides whose age the stream is timed against' },
    { field: 'growthMode', applies: (r) => r.type !== 'oneTime' && r.type !== 'oneTimeTaxFree',
      why: 'a recurring stream needs a defined growth policy' },
    { field: 'growth', applies: (r) => r.type !== 'oneTime' && r.type !== 'oneTimeTaxFree'
        && r.growthMode !== 'inflation' && r.growthMode !== 'cola',
      why: 'this growth mode reads the rate on the record itself' },
  ],
  stages: [
    { field: 'growthMode', applies: (r) => r.mode !== 'percent',
      why: 'an amount stage needs a defined growth policy' },
    /* CR2-02: 'not percent' is not the branch that reads this field.

       applyStage() reads annualChange in exactly one place:
         else if (s.growthMode === 'fixed') base *= Math.pow(1 + annualChange/100, years)

       An amount stage with growthMode 'inflation' multiplies by the inflation
       factor and never looks at it; one with 'none' applies no growth at all.
       Requiring it there rejected two legitimate plans at import, and the error
       told the user their selected mode reads a field it does not read.

       Verified rather than reasoned: supplying annualChange: 100 -- an absurd
       100% a year -- produces a byte-identical engine result for both modes.
       A field whose most extreme value changes nothing cannot be material.

       CL-05 made the otherIncomes rules branch-aware and left this list on a
       mode-only test one line below. Same defect, same file, same round. */
    { field: 'annualChange', applies: (r) => r.mode !== 'percent' && r.growthMode === 'fixed',
      why: 'a fixed-growth amount stage reads its own annual change' },
  ],
};

function validateMaterialRecordFields(c, retirement) {
  Object.keys(MATERIAL_RECORD_FIELDS).forEach((key) => {
    const records = retirement[key];
    if (!Array.isArray(records)) return;
    records.forEach((record, i) => {
      if (!isPlainObject(record)) return; // shape is reported elsewhere
      MATERIAL_RECORD_FIELDS[key].forEach((rule) => {
        if (record[rule.field] !== undefined) return;
        if (!rule.applies(record)) return; // this branch never reads it
        c.error('MISSING_FIELD', `retirement.${key}[${i}].${rule.field}`,
          `"${rule.field}" is absent and this record's selected mode reads it -- ${rule.why}. ` +
          'Omissions at these sites were measured moving money in 70 of 506 cases, none of ' +
          'which reported anything at all.');
      });
    });
  });
}

function validateProfile(c, profile, employment) {
  if (!profile) return;
  checkEnum(c, profile.filing, 'profile.filing', FILING_STATUSES);
  checkType(c, profile.age, 'profile.age', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  checkType(c, profile.retireAge, 'profile.retireAge', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  checkType(c, profile.endAge, 'profile.endAge', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  checkRange(c, profile.age, 'profile.age', 0, 120);
  checkRange(c, profile.endAge, 'profile.endAge', 0, 120);
  /* S5AA R45 (the owner, 2026-10-03: "Warn only if a salary is entered"): a retirement age before the current age is how a retired
     household is entered, so it warns only beside a salary, which would contradict it -- for each spouse on their own clock. */
  const salaryOf = (k) => (employment && isFiniteNumber(employment[k]) ? employment[k] : 0);
  if (isFiniteNumber(profile.age) && isFiniteNumber(profile.retireAge) && profile.retireAge < profile.age && salaryOf('salary') > 0) {
    c.warn('INCONSISTENT_AGES', 'profile.retireAge', `retireAge (${profile.retireAge}) is before the current age (${profile.age}), but a salary is entered`);
  }
  if (profile.spouseOn === true && isFiniteNumber(profile.spouseAge) && isFiniteNumber(profile.spouseRetireAge) && profile.spouseRetireAge < profile.spouseAge && salaryOf('spouseSalary') > 0) {
    c.warn('INCONSISTENT_AGES', 'profile.spouseRetireAge', `spouseRetireAge (${profile.spouseRetireAge}) is before the spouse's current age (${profile.spouseAge}), but a spouse salary is entered`);
  }
  /* S5AA R41 (found by the task 6.5 browser check; the owner 2026-09-30: "Repair now"): an end age before the starting age
     projected backwards, and the warning below compares the end age with the retirement age only. An ERROR, so the app's
     import refuses the backup; the engine refuses it as SCENARIO_END_AGE_BEFORE_START. An end age equal to the start is not
     an error. */
  if (isFiniteNumber(profile.age) && isFiniteNumber(profile.endAge) && profile.endAge < profile.age) {
    c.error('END_AGE_BEFORE_START', 'profile.endAge', `endAge (${profile.endAge}) is before the current age (${profile.age}), so there are no years to project`);
  }
  if (isFiniteNumber(profile.retireAge) && isFiniteNumber(profile.endAge) && profile.endAge < profile.retireAge) {
    c.warn('INCONSISTENT_AGES', 'profile.endAge', `endAge (${profile.endAge}) is before retireAge (${profile.retireAge})`);
  }
  if (profile.spouseOn === true && profile.spouseAge !== undefined) {
    checkType(c, profile.spouseAge, 'profile.spouseAge', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  }
}

/* RB-01 (re-audit 2): account ids must be distinguishable, and this is now
 * an ERROR. THE TRIP-WIRE THE PREVIOUS VERSION SET FOR ITSELF HAS FIRED.
 *
 * That version deferred rejection to a WARNING and named its own escalation
 * condition in as many words: "S3 task 5 can escalate to ERROR at the moment
 * it actually keys by id." Three paths already key by id, and two of them
 * predate the deferral:
 *
 *   1. contribution routing -- accounts.find(x => x.id === item.account.id)
 *      returns the FIRST match, so a $12,000 taxable contribution lands in a
 *      401(k) and deductibility is decided from that wrong destination.
 *      Reported taxes fall by $2,940.
 *   2. moveFunds() resolves transfer endpoints the same way.
 *   3. quoteTaxFunding() seeds remaining["a:"+id] from the first account it
 *      sees under that key (engine.js). Two taxable accounts sharing an id
 *      therefore offer the solver ONE account's capacity: the adversarial
 *      reproduction reports a $25,910.90 funding shortfall while leaving
 *      $198,000 of taxable assets unspent. No contributions, no transfers --
 *      just two accounts with the same id.
 *
 * The reasoning that produced the warning was sound; what it lacked was any
 * mechanism to notice its own condition being met. quoteTaxFunding()'s
 * id-keyed map was added for a good reason (stopping one dollar funding the
 * obligation twice across repeated tax classes) by someone with no cause to
 * read a validator comment. A deferred defect needs an EXECUTABLE trip-wire,
 * not a documented one -- see tests/audit-rb-findings.test.js.
 *
 * WHAT THIS BREAKS, deliberately and with the user's decision on record
 * (decision register P11): plans carrying duplicate ids no longer import.
 * Migration was considered and rejected -- a duplicate referenced by a
 * transfer cannot be disambiguated by array order without guessing, and the
 * audit forbids merging or silently selecting the first.
 *
 * The engine's own synthesized accounts no longer collide by construction:
 * they take collision-safe identities at creation (engine.js,
 * uniqueSynthesizedId()), so RESERVED_ACCOUNT_ID below is now informational
 * rather than a latent correctness problem.
 *
 * Historical note on why this was latent for so long: the engine's `rates`
 * array is POSITIONAL -- ids are irrelevant to it, and two accounts sharing
 * one compute correctly (pinned in
 * tests/s3-prewrite/duplicate-account-id.prewrite.test.js). A duplicate
 * collapses two accounts into one entry and the period return signal is
 * averaged over one rate instead of two: a silent
 * financial output change, strictly worse than the fragile array it replaces.
 *
 * The engine also synthesizes accounts of its own during settlement --
 * "rmd-retained-cash" and, since R4, "household-cash". A user account could
 * carry either literal, which used to be harmless only by ACCIDENT, because
 * retainExcessRmdCash() found its destination by the cashHolding FLAG rather
 * than by id. Harmless by accident is exactly what stops being harmless when
 * someone introduces an id-keyed map, and R4 added the second literal without
 * anything noticing. Both are now derived rather than literal, so the engine
 * cannot collide with a user account whatever it is called.
 *
 * Q23 is closed by this change. */
const ENGINE_SYNTHESIZED_ACCOUNT_IDS = ['rmd-retained-cash', 'household-cash'];

function validateAccountIdentity(c, accounts) {
  const seen = new Map();
  accounts.forEach((a, i) => {
    if (!isPlainObject(a) || typeof a.id !== 'string' || a.id === '') return;
    if (seen.has(a.id)) {
      c.error(
        'DUPLICATE_ACCOUNT_ID', `accounts[${i}].id`,
        `account id ${JSON.stringify(a.id)} is already used by accounts[${seen.get(a.id)}]; ` +
        'ids must be unique because contribution routing, transfers and the tax-funding ' +
        'solver all resolve accounts by id and take the FIRST match -- a duplicate sends ' +
        'contributions to the wrong tax class and hides the second account\'s capacity from ' +
        'the solver, which then reports a funding shortfall against assets it never offered'
      );
    } else {
      seen.set(a.id, i);
    }
    if (ENGINE_SYNTHESIZED_ACCOUNT_IDS.indexOf(a.id) >= 0) {
      c.warn(
        'RESERVED_ACCOUNT_ID', `accounts[${i}].id`,
        `account id ${JSON.stringify(a.id)} matches the name the engine uses for a holding it ` +
        'creates itself; the engine now derives a collision-free id instead, so this is ' +
        'informational -- the two accounts stay distinct, but they will read alike in the UI'
      );
    }
  });
}

function validateAccount(c, account, index) {
  const path = `accounts[${index}]`;
  if (!isPlainObject(account)) {
    c.error('WRONG_TYPE', path, `each account must be an object, got ${JSON.stringify(account)}`);
    return;
  }
  checkType(c, account.id, `${path}.id`, (v) => typeof v === 'string' && v.length > 0, 'WRONG_TYPE', 'a non-empty string');
  checkEnum(c, account.taxClass, `${path}.taxClass`, TAX_CLASSES);
  if (account.owner !== undefined) {
    const jointAllowed = JOINT_OWNER_ACCOUNT_TYPES.includes(account.type);
    if (!ACCOUNT_OWNERS.includes(account.owner) && !(account.owner === 'joint' && jointAllowed)) {
      c.error('INVALID_ACCOUNT_OWNER', `${path}.owner`, account.owner === 'joint'
        ? `a ${JSON.stringify(account.type)} account belongs to one person and cannot be owned jointly; expected "self" or "spouse"`
        : `owner ${JSON.stringify(account.owner)} is not recognised; expected "self" or "spouse"${jointAllowed ? ' or "joint"' : ''}`);
    }
  }
  checkType(c, account.balance, `${path}.balance`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  if (isFiniteNumber(account.balance) && account.balance < 0) {
    c.warn('NEGATIVE_BALANCE', `${path}.balance`, `balance is negative (${account.balance})`);
  }
  checkType(c, account.priority, `${path}.priority`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  /* Q49: accounts[].contribution had NO explicit validation anywhere -- not
     here, and not at the engine's public boundary gate. What happened to an
     invalid value depended on ELIGIBILITY rather than on any check: eligible,
     it reached contribution arithmetic and surfaced downstream as
     TAX_QUOTE_NONFINITE_CONTEXT; ineligible, eligibility set the allowed
     contribution to zero and the run read as ordinary `ok`. The first is
     downstream containment and the second is a coincidence of configuration.
     Neither is validation.

     ABSENCE IS NOT FLAGGED, matching this validator's stated posture for
     id/priority/balance: normalizeAccount() backfills `contribution: 0`, and
     that is the explicitly supported missing-field default the Q49 record
     says to preserve (tests/scenario-validator.test.js pins the lenient
     posture). checkType() below returns silently on undefined, which is the
     intended behaviour here, not an oversight. Residual, stated rather than
     hidden: a DIRECT runPlan() caller that bypasses normalisation and omits
     the field still gets only downstream containment -- eligible,
     TAX_QUOTE_NONFINITE_CONTEXT; ineligible, a silent zero -- because the
     engine boundary also leaves absence alone (see
     nonFiniteScenarioInputCode()).

     The negative case is a WARN, not an error, because it is genuinely
     survivable and genuinely silent: accountPlannedContribution() ends
     `return Math.max(0, amount)`. That is a FLOOR, not a validity check --
     it silently turns a negative contribution into zero, propagates NaN, and
     passes Infinity straight through. A reader tracing the code finds a
     guard on precisely this value and may conclude the field is defended. It
     is defended against negatives only, and only by erasing them. */
  if (checkType(c, account.contribution, `${path}.contribution`, isFiniteNumber, 'WRONG_TYPE', 'a finite number')) {
    if (account.contribution < 0) {
      c.warn('NEGATIVE_CONTRIBUTION', `${path}.contribution`,
        `contribution is negative (${account.contribution}); it will be floored to 0 ` +
        'by accountPlannedContribution() with no other indication that the planned ' +
        'amount was discarded');
    }
  }
  /* R2V-002 external audit fix: a taxable account's basisPct feeds directly
     into a raw `a.basisPct / 100` inside engine.js's withdrawFromClass() --
     unlike quoteTaxFunding()'s own `Number(a.basisPct) || 0` estimate, that
     computation has no fallback, so a missing/non-finite basisPct on a
     taxable account produces NaN gains, then NaN taxes/MAGI, silently (the
     audit's reproduction: deleting a taxable account's basisPct field still
     passed this validator before this fix). Only taxable accounts are
     affected -- basisPct is unused for preTax/roth/hsa -- so this is scoped
     to the class that actually reaches that formula, not a blanket
     requirement. */
  if (account.taxClass === 'taxable') {
    if (account.basisPct === undefined) {
      c.error('MISSING_FIELD', `${path}.basisPct`, 'a taxable account requires "basisPct" (its cost-basis percentage); a missing value produces NaN gains and taxes');
    } else {
      checkType(c, account.basisPct, `${path}.basisPct`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
      checkRange(c, account.basisPct, `${path}.basisPct`, 0, 100);
    }
  } else if (account.basisPct !== undefined) {
    checkType(c, account.basisPct, `${path}.basisPct`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
    checkRange(c, account.basisPct, `${path}.basisPct`, 0, 100);
  }
  /* S5AA task 4.4 (Q99, G5): the qualified-medical share of this HSA's distributions, a percentage out of
     100 like every other share on an account record (basisPct, vesting, matchRate). OPTIONAL, because
     ABSENT HAS A DEFINED MEANING -- 100, today's behaviour -- so a scenario saved before the field existed
     is not an invalid one. Scoped to HSA accounts because that is the only class that reads it. */
  if (account.taxClass === 'hsa' && account.qualifiedMedicalPct !== undefined) {
    if (checkType(c, account.qualifiedMedicalPct, `${path}.qualifiedMedicalPct`, isFiniteNumber, 'WRONG_TYPE', 'a finite number')) {
      checkRange(c, account.qualifiedMedicalPct, `${path}.qualifiedMedicalPct`, 0, 100);
    }
  }
  /* S5 task 11 (the owner's question 6, answer A): a workplace account's prior-calendar-year FICA wages from its sponsoring
     employer decide whether its catch-up contributions must be Roth (ACCOUNT section 7.4). The field is optional; the
     contribution audit warns when catch-up room is used without it. */
  if (checkType(c, account.priorYearFicaWages, `${path}.priorYearFicaWages`, isFiniteNumber, 'WRONG_TYPE', 'a finite number')) {
    checkRange(c, account.priorYearFicaWages, `${path}.priorYearFicaWages`, 0, 1e8);
  }
  /* RB-02 (re-audit 2, ADVERSARIAL/REAUDIT_2 20260910): the household
     cash-holding CATEGORY, stated once and enforced here.

     The finding: `cashHolding: "false"` is TRUTHY. It survived the real
     normalizer unchanged, validated with no issue at all, pinned a Roth's
     return to zero and made that Roth the destination for retained household
     surplus -- $34,602.50 of pension money deposited into a Roth, reproduced
     identically by the generated Worker with status "ok".

     Three requirements, not one, because the audit is explicit that changing
     the predicate to `=== true` is INSUFFICIENT: `true` on a Roth still
     violates the destination contract. This category is not a display flag,
     it names the account the engine may park household surplus in, pins to a
     zero return, and excludes from the dividend base -- so it has to be a
     real boolean, on the taxable class, at cash basis. engine.js enforces the
     same three at its public boundary via accountContractCode(), and
     isHouseholdCashHolding() is the single predicate every consumer reads. */
  /* S5AA R35 (SA32F-08): whether the spouse is the sole designated beneficiary of a pre-tax account (the Table II condition). */
  /* S5AA R35 (SA32F-26): the still-working exception's two facts about a workplace plan. */
  /* S5AA R35 (SA32F-13): the vesting schedule and the credited service at the plan's start. */
  if (account.vestingSchedule !== undefined && ['graded6', 'cliff3'].indexOf(account.vestingSchedule) < 0) c.error('INVALID_ENUM', `${path}.vestingSchedule`, 'vestingSchedule must be graded6 or cliff3');
  if (account.yearsOfService !== undefined && account.yearsOfService !== null && !(isFiniteNumber(account.yearsOfService) && account.yearsOfService >= 0)) c.error('OUT_OF_RANGE', `${path}.yearsOfService`, 'yearsOfService must be a number, 0 or more');
  /* S5AA R43 (SA42F-07): currentEmployerPlan, fivePercentOwner and spouseSoleBeneficiary are typed by the flag contract now (validateBooleanFlags()). */
  if (account.cashHolding !== undefined) {
    if (typeof account.cashHolding !== 'boolean') {
      c.error('WRONG_TYPE', `${path}.cashHolding`,
        `cashHolding must be a boolean, got ${JSON.stringify(account.cashHolding)}; ` +
        'any truthy non-boolean silently enrols the account in the household cash category, ' +
        'which pins its return to zero and makes it the destination for retained surplus');
    } else if (account.cashHolding === true) {
      if (account.taxClass !== 'taxable') {
        c.error('INVALID_CASH_HOLDING', `${path}.cashHolding`,
          `a household cash holding must be taxable, but taxClass is ${JSON.stringify(account.taxClass)}; ` +
          'retained household surplus is not automatically a permitted contribution to a ' +
          'tax-advantaged account, and pension income is not IRA compensation');
      }
      if (isFiniteNumber(account.basisPct) && account.basisPct !== 100) {
        c.error('INVALID_CASH_HOLDING', `${path}.basisPct`,
          `a household cash holding must be held at cash basis (100), got ${account.basisPct}; ` +
          'retained surplus is after-tax cash, so a lower basis would tax it a second time on withdrawal');
      }
    }
  }
  if (account.allocation !== undefined && !isPlainObject(account.allocation)) {
    c.error('WRONG_TYPE', `${path}.allocation`, `allocation must be an object, got ${JSON.stringify(account.allocation)}`);
  } else if (isPlainObject(account.allocation)) {
    Object.keys(account.allocation).forEach((k) => {
      const v = account.allocation[k];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        c.error('WRONG_TYPE', `${path}.allocation.${k}`, `allocation weight must be a finite number, got ${JSON.stringify(v)}`);
      }
    });
  }
}

/* S5AA R37 (SA32F-51): the engine's run ceiling and the last year of its historical return data. A test holds the year to
   the engine's HIST_RETURNS, so the two cannot drift apart. */
const MAX_RUNS = 10000;
const LAST_HISTORY_YEAR = 2025;
const FIRST_HISTORY_YEAR = 1928;   // S5AA R43 (SA42F-34): the first year of HIST_RETURNS

function validateAssumptions(c, assumptions) {
  if (!assumptions) return;
  checkEnum(c, assumptions.method, 'assumptions.method', METHODS);
  checkType(c, assumptions.returnRate, 'assumptions.returnRate', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  checkType(c, assumptions.volatility, 'assumptions.volatility', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  if (isFiniteNumber(assumptions.volatility) && assumptions.volatility < 0) {
    c.warn('NEGATIVE_VOLATILITY', 'assumptions.volatility', `volatility is negative (${assumptions.volatility})`);
  }
  if (assumptions.runs !== undefined) {
    /* S5AA R37 (SA32F-51): the engine's ceiling (invalidRunCountCode()'s MAX_RUNS) is the validator's, so the two agree. */
    checkType(c, assumptions.runs, 'assumptions.runs', (v) => Number.isInteger(v) && v >= 1 && v <= MAX_RUNS, 'WRONG_TYPE', 'an integer from 1 to 10,000');
  }
  if (assumptions.seed !== undefined) {
    checkType(c, assumptions.seed, 'assumptions.seed', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  }
  /* S5AA R37 (SA32F-51): inflation, fee and the historical start year are numbers, as the engine now requires; and on the
     historical method a start after the last data year is refused, where the engine silently started at the first. */
  checkType(c, assumptions.inflation, 'assumptions.inflation', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  checkType(c, assumptions.fee, 'assumptions.fee', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  checkType(c, assumptions.historyStart, 'assumptions.historyStart', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  // S5AA R43 (SA42F-34): a start before the data, or between data years, is not a data year either (the series runs 1928 to LAST_HISTORY_YEAR).
  if (assumptions.method === 'historical' && isFiniteNumber(assumptions.historyStart) && assumptions.historyStart <= LAST_HISTORY_YEAR && (assumptions.historyStart < FIRST_HISTORY_YEAR || !Number.isInteger(assumptions.historyStart))) {
    c.error('OUT_OF_RANGE', 'assumptions.historyStart', `historyStart ${assumptions.historyStart} is not a year of the return data (whole years ${FIRST_HISTORY_YEAR} to ${LAST_HISTORY_YEAR})`);
  }
  if (assumptions.method === 'historical' && isFiniteNumber(assumptions.historyStart) && assumptions.historyStart > LAST_HISTORY_YEAR) {
    c.error('OUT_OF_RANGE', 'assumptions.historyStart', `historyStart ${assumptions.historyStart} is after the last year of return data (${LAST_HISTORY_YEAR})`);
  }
}

function validateRetirement(c, retirement) {
  if (!retirement) return;
  checkType(c, retirement.spending, 'retirement.spending', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  if (isFiniteNumber(retirement.spending) && retirement.spending < 0) {
    c.warn('NEGATIVE_SPENDING', 'retirement.spending', `spending is negative (${retirement.spending})`);
  }
  checkEnum(c, retirement.withdrawalOrder, 'retirement.withdrawalOrder', WITHDRAWAL_ORDERS);
  /* S5 2k (Q58, decided 2026-09-13): an unrecognised strategy is a WARNING, not
     a refusal -- the engine reports it and runs incomeFirst -- and a wrong-case
     name is accepted silently, because the engine normalises it. */
  if (retirement.strategy !== undefined) {
    const s = retirement.strategy;
    const known = typeof s === 'string' && STRATEGIES.some((name) => name.toLowerCase() === s.toLowerCase());
    if (!known) {
      c.warn('UNKNOWN_STRATEGY', 'retirement.strategy', '"' + String(s) + '" is not a withdrawal strategy this calculator provides; income-first spending will be used');
    }
  }
  /* R2V-004 external audit fix: engine.js's quoteTaxFunding() now guards
     itself against a repeated class independently (it tracks a per-account/
     per-class remaining balance across the whole quote), but that quote is
     reachable directly without going through this validator at all -- so
     this closes the same hole at the boundary too, for the ordinary UI/
     import path. Whether manualOrder must be PRESENT at all under 'manual'
     mode is a separate, pre-existing gap this validator already didn't
     cover (several of this file's own fixtures use withdrawalOrder:'manual'
     with no manualOrder set) -- out of scope here; this only validates its
     CONTENT when the field is actually present. */
  if (retirement.manualOrder !== undefined) {
    if (typeof retirement.manualOrder !== 'string') {
      c.error('WRONG_TYPE', 'retirement.manualOrder', `"manualOrder" must be a string, got ${JSON.stringify(retirement.manualOrder)}`);
    } else {
      const seen = new Set();
      retirement.manualOrder.split(',').forEach((token, i) => {
        const path = `retirement.manualOrder[${i}]`;
        if (!TAX_CLASSES.includes(token)) {
          c.error('INVALID_WITHDRAWAL_CLASS', path, `"${token}" is not a valid withdrawal class (expected one of ${TAX_CLASSES.join(', ')})`);
        } else if (seen.has(token)) {
          c.error('DUPLICATE_WITHDRAWAL_CLASS', path, `withdrawal class "${token}" appears more than once in manualOrder`);
        }
        seen.add(token);
      });
    }
  }
  /* S5 task 1.4: the same list the raw-container check reads; one declaration,
     LOSSY_COERCED_ARRAY_FIELDS, below. It was written out twice. */
  LOSSY_COERCED_ARRAY_FIELDS.forEach((key) => {
    if (retirement[key] !== undefined && !Array.isArray(retirement[key])) {
      c.error('WRONG_TYPE', `retirement.${key}`, `"${key}" must be an array, got ${JSON.stringify(retirement[key])}`);
    }
  });
  validateMaterialRecordFields(c, retirement);
  if (retirement.ssClaim !== undefined) {
    checkType(c, retirement.ssClaim, 'retirement.ssClaim', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
    checkRange(c, retirement.ssClaim, 'retirement.ssClaim', 62, 70, 'SS_CLAIM_OUT_OF_RANGE', 'error');
  }
  /* Q70: a claim age outside 62-70 is refused, not warned about, for the spouse as well as self. Delayed credits end
     at 70 and a retirement benefit cannot start before 62; the engine also bounds the age and discloses it, for a
     caller that has not validated. spouseClaim had no check at all. */
  if (retirement.spouseClaim !== undefined) {
    checkType(c, retirement.spouseClaim, 'retirement.spouseClaim', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
    checkRange(c, retirement.spouseClaim, 'retirement.spouseClaim', 62, 70, 'SS_CLAIM_OUT_OF_RANGE', 'error');
  }
  /* S5AA R42 (ChatGPT's R41F-05; the owner 2026-09-30: "Repair all five in R42"): the entered monthly benefit at full retirement
     age, self and spouse. A present value that was not a number ran as a zero benefit (Number("abc") || 0) with status ok, and
     Restore backup accepted it. Present and not a finite number: WRONG_TYPE, and the engine refuses it by path. Absent is unchanged. */
  ['ssBenefit', 'spouseSS'].forEach((key) => {
    checkType(c, retirement[key], `retirement.${key}`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  });
  /* Q50: retirement.dividendQualified is a percentage OF the dividend cash, and nothing here checked it. The UI
     input carries min 0 and max 100, but an imported or hand-edited plan skipped that. Above 100 the engine's
     ordinary share of dividends went negative and understated tax; below 0 it overstated tax. A range WARNING:
     the engine holds the share to 0-100 and discloses that it did, so the plan still runs. */
  checkRange(c, retirement.dividendQualified, 'retirement.dividendQualified', 0, 100, 'DIVIDEND_QUALIFIED_OUT_OF_RANGE');
  /* S5AA R9 round, DeepSeek audit finding 2f/01: checkRange() skips a value that is not a number, so a string or a boolean
     here passed with no issue and the engine failed later on a symptom code. The same was true of the three dividend
     fields beside it, which had no check at all. Present and not a finite number: WRONG_TYPE. */
  ['dividendQualified', 'dividendYield', 'dividendGrowth', 'dividendStart'].forEach((key) => {
    checkType(c, retirement[key], `retirement.${key}`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  });
  /* Q74: a percent spending stage multiplies the strategy amount by value/100, and nothing bounded it: a $60,000
     stage switched to percent read as 60,000% and emptied the plan in a year. A range WARNING, 0 to 200%. The
     repaired generator draws 50 to 120, and 600 seeds and both corpora hold nothing outside that; above 200% a
     stage more than doubles the plan's spending, which reads as a dollar figure in a percent field. */
  /* S5AA R35 (SA32F-18): a pension stream's survivor share is a percentage of the stream, 0 (single life) to 100. */
  if (Array.isArray(retirement.otherIncomes)) {
    retirement.otherIncomes.forEach((income, i) => {
      if (isPlainObject(income) && income.survivorPercent !== undefined) {
        checkType(c, income.survivorPercent, `retirement.otherIncomes[${i}].survivorPercent`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
        checkRange(c, income.survivorPercent, `retirement.otherIncomes[${i}].survivorPercent`, 0, 100, 'PENSION_SURVIVOR_PERCENT_OUT_OF_RANGE', 'error');
      }
    });
  }
  if (Array.isArray(retirement.stages)) {
    retirement.stages.forEach((stage, i) => {
      if (isPlainObject(stage) && stage.mode === 'percent') {
        checkRange(c, stage.value, `retirement.stages[${i}].value`, 0, 200, 'STAGE_PERCENT_OUT_OF_RANGE');
      }
    });
    /* S5AA R49 (AA1-25 (b); the owner's AA1 decision, 2026-10-03: "stacked stages warn"): two percent stages that are active at the
       same age multiply there (stageAmountAt() in engine.js: 90% and 80% give 72%, not 70%). A stage is active from its start to its
       end age inclusive, [start, end + 1). A WARNING, once per overlapping pair; an amount stage replaces the figure and is not a
       multiplier. */
    const pct = retirement.stages.map((stage, i) => ({ stage, i }))
      .filter(({ stage }) => isPlainObject(stage) && stage.mode === 'percent' && isFiniteNumber(stage.start) && isFiniteNumber(stage.end));
    for (let a = 0; a < pct.length; a++) {
      for (let b = a + 1; b < pct.length; b++) {
        const x = pct[a].stage, y = pct[b].stage;
        if (x.start < y.end + 1 && y.start < x.end + 1) {
          c.warn('SPENDING_STAGES_OVERLAP', `retirement.stages[${pct[b].i}]`,
            `percentage stages ${pct[a].i + 1} (ages ${x.start}-${x.end}) and ${pct[b].i + 1} (ages ${y.start}-${y.end}) overlap, so where both apply ` +
            `they multiply: ${x.value}% of ${y.value}% is ${Math.round(x.value * y.value) / 100}% of the planned spending`);
        }
      }
    }
  }
  /* S5AA R49 (AA1-25 (b)): spending flexibility (a cut after a down year) stacks on guardrails' and Guyton-Klinger's own adjustments,
     so a bad year can be cut twice. A WARNING; at 0 flexibility, or with another strategy, nothing is said. */
  if ((retirement.strategy === 'guardrails' || retirement.strategy === 'guyton') && isFiniteNumber(retirement.flexibility) && retirement.flexibility > 0) {
    c.warn('FLEXIBILITY_WITH_GUARDRAILS', 'retirement.flexibility',
      `spending flexibility (${retirement.flexibility}% less after a down year) applies on top of the ${retirement.strategy === 'guyton' ? 'Guyton-Klinger' : 'guardrail'} ` +
      'adjustments, so a bad year can be cut twice; set flexibility to 0 to let the strategy alone decide');
  }
}

/* FM-09 fix (FULL_MODEL_AUDIT_AND_CLAUDE_HANDOVER_20260910.md): boolean
   `advanced` scalars are validated as booleans when present.

   S2 introduced `armRecastOnReset` and verified that validateAdvanced() has
   no unknown-key rejection, so the field needed no validator change. That
   was true, and it was the wrong direction to check: nothing stopped a
   NON-boolean either. The string "false" validated with zero issues,
   normalizedPlan() preserved it verbatim, and projectDebts() enabled the
   feature on truthiness -- Boolean("false") is true. The entire safety
   story for that feature was "it defaults to off," and a malformed import
   defeated it.

   VALIDATED, NEVER COERCED. Boolean(value) is the natural-looking repair
   and it is exactly wrong: it turns every rejected string into an enabled
   feature. See tests/audit-fm09-arm-flag-typing.test.js, which pins that.

   Absence stays legal. normalizedPlan() merges defaultPlan.advanced over
   every import, so an older saved scenario without the field still migrates
   to false -- that is the real legacy compatibility and it is preserved. */
/* S5 2l (Q53, decided 2026-09-13 by the owner): FM-09's one-element list is
   retired for the contract. Every flag the engine or the app reads is checked
   the same way, from src/boolean-flag-contract.json (S4 2b.2e): a present
   value that is not a boolean is WRONG_TYPE at its indexed path, an absent one
   stays legal, and a flag with its own refusal code keeps its own check
   (cashHolding, in validateAccount()). The validator is required standalone
   in Node, so it reads the file itself, as data; build.js replaces that read
   with the file's JSON in the page, as it does for the engine. */
const VALIDATOR_FLAG_CONTRACT = JSON.parse(require("fs").readFileSync(require("path").join(__dirname,"boolean-flag-contract.json"),"utf8"));
/* S5AA R43 (SA42F-05, SA42F-06): the plan-value contract, the engine's own file (engine.js planValueContractViolation()). */
const VALIDATOR_VALUE_CONTRACT = JSON.parse(require("fs").readFileSync(require("path").join(__dirname,"plan-value-contract.json"),"utf8"));

function validateBooleanFlags(c, plan) {
  VALIDATOR_FLAG_CONTRACT.flags.forEach(function (flag) {
    if ((flag.reader !== 'engine' && flag.reader !== 'app') || flag.refusalCode) return;
    const parts = flag.path.split('.');
    let places = [{ node: plan, at: '' }];
    parts.slice(0, -1).forEach(function (seg) {
      const next = [];
      places.forEach(function (place) {
        if (!place.node || typeof place.node !== 'object') return;
        if (seg.slice(-2) === '[]') {
          const key = seg.slice(0, -2);
          const list = place.node[key];
          if (!Array.isArray(list)) return;
          list.forEach(function (record, i) { next.push({ node: record, at: (place.at ? place.at + '.' : '') + key + '[' + i + ']' }); });
        } else {
          next.push({ node: place.node[seg], at: (place.at ? place.at + '.' : '') + seg });
        }
      });
      places = next;
    });
    const leaf = parts[parts.length - 1];
    places.forEach(function (place) {
      if (!place.node || typeof place.node !== 'object') return;
      const value = place.node[leaf];
      if (value === undefined) return; // absent takes its documented default
      if (typeof value !== 'boolean') {
        c.error('WRONG_TYPE', (place.at ? place.at + '.' : '') + leaf, 'must be true or false, got ' + JSON.stringify(value));
      }
    });
  });
}

/* RA-01 (re-audit 2026-09-11): surplus destinations are now per source, so
   there are two shapes to police -- the plan-wide default and the per-source
   override map.

   Same discipline as the boolean fields above: VALIDATED, NEVER COERCED. The
   engine already falls back safely (an unrecognised value becomes `retain`,
   the conservative destination, so a malformed import cannot resurrect the
   vanishing behaviour FM-03 fixed), but falling back silently would leave a
   user believing a policy is in force that is not. Absence stays legal and
   migrates, exactly as it does for armRecastOnReset.

   Unknown KEYS are reported too. A typo like `socialsecurity` would otherwise
   be accepted, do nothing, and look like a working setting. */
const SURPLUS_POLICIES = ['retain', 'invest', 'spend'];
const SURPLUS_SOURCE_KEYS = ['rmd', 'pension', 'socialSecurity', 'otherIncome', 'dividends'];
/* Q22: where a retained cash holding sits in its tax class's spending order.
   The engine treats only the exact string 'last' as the buffer behaviour, so
   a near-miss like 'LAST' silently gets the default -- which is the safe
   direction, and exactly why it must still be REPORTED rather than absorbed.
   A user who typed it believes a setting is in force that is not. */
const RETAINED_CASH_ORDERS = ['first', 'last'];

function validateSurplusPolicies(c, advanced) {
  if (advanced.retainedCashOrder !== undefined
      && RETAINED_CASH_ORDERS.indexOf(advanced.retainedCashOrder) < 0) {
    c.error(
      'BAD_VALUE', 'advanced.retainedCashOrder',
      'must be one of ' + RETAINED_CASH_ORDERS.join(', ') + ', got ' +
      JSON.stringify(advanced.retainedCashOrder)
    );
  }
  if (advanced.surplusPolicy !== undefined && SURPLUS_POLICIES.indexOf(advanced.surplusPolicy) < 0) {
    c.error(
      'BAD_VALUE', 'advanced.surplusPolicy',
      'must be one of ' + SURPLUS_POLICIES.join(', ') + ', got ' + JSON.stringify(advanced.surplusPolicy)
    );
  }
  const map = advanced.surplusPolicyBySource;
  if (map === undefined) return;
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    c.error(
      'WRONG_TYPE', 'advanced.surplusPolicyBySource',
      'must be an object mapping a surplus source to a policy, got ' + JSON.stringify(map)
    );
    return;
  }
  Object.keys(map).forEach(function (key) {
    if (SURPLUS_SOURCE_KEYS.indexOf(key) < 0) {
      c.error(
        'UNKNOWN_KEY', 'advanced.surplusPolicyBySource.' + key,
        'is not a surplus source; expected one of ' + SURPLUS_SOURCE_KEYS.join(', ')
      );
      return;
    }
    if (map[key] !== undefined && SURPLUS_POLICIES.indexOf(map[key]) < 0) {
      c.error(
        'BAD_VALUE', 'advanced.surplusPolicyBySource.' + key,
        'must be one of ' + SURPLUS_POLICIES.join(', ') + ', got ' + JSON.stringify(map[key])
      );
    }
  });
}

/* P8 (decision register, 2026-09-10), closing SPRINT_QUESTIONS.md Q36.
 *
 * `advanced` used to accept ANY key: a scenario carrying
 * `thisFieldDoesNotExistAnywhere: 12345` validated cleanly with no issue
 * mentioning it. validateAdvanced() checked the values of keys it knew about
 * and had no allowlist at all.
 *
 * The failure that permits is not a stray field -- it is a TYPO IN A REAL ONE.
 * `advanced.networthOn` misspelled as `advanced.networthon` is accepted in
 * silence, the real toggle keeps its default of false, and the household's net
 * worth quietly omits their house. Nothing anywhere says so. That is the SA-01
 * shape again: an absent value taken as a real answer.
 *
 * WARNING, NOT ERROR, for one round, following the transitional discipline
 * Q23's duplicate ids and S2's armRecastOnReset both used --
 * reviewImportedScenarios() refuses an import on any ERROR, and a saved plan
 * carrying a stray key imports fine today. Escalate once a round has passed
 * with no legitimate key found missing from this list.
 *
 * Q25 IS SATISFIED AUTOMATICALLY, and deliberately so: home, debt, homeGrowth,
 * insurance and legacy are all still IN defaultPlan.advanced, because the
 * loader migrates them into asset and debt records. Deriving the list from the
 * default is what keeps a migration-supported legacy field distinguishable
 * from a genuinely unknown one, rather than requiring a second judgement call
 * per key.
 *
 * DECLARED, not harvested. tests/scenario-validator.test.js asserts this list
 * equals Object.keys(defaultPlan.advanced) exactly, so it cannot drift -- the
 * Q38 lesson, where a list derived by regex from another file silently lost an
 * entry and rewrote an entire corpus. */
const ADVANCED_KNOWN_KEYS = ['armRecastOnReset', 'assetClasses', 'assetsOn', 'bondTent',
  'bondTentOn', 'conversionAmount', 'conversionOn', 'correlation', 'debt', 'debts', 'glideOn',
  'healthCost', 'healthInflation', 'healthOn', 'home', 'homeGrowth', 'insurance', 'legacy',
  'ltcCost', 'ltcInsurance', 'ltcOn', 'ltcProbability', 'ltcYears', 'networthOn', 'otherAssets',
  'penaltyException', 'qcd', 'reserveOn', 'reserveYears', 'retainedCashOrder', 'retirementStock',
  'rmdOn', 'rule55', 'surplusPolicy', 'surplusPolicyBySource', 'transferAge', 'transferAmount',
  'transferFrom', 'transferOn', 'transferTo'];

/* CL-06: KEYS THE APPLICATION WRITES THAT THE DEFAULT DOES NOT CARRY.
 *
 * normalizedPlan() stamps `advanced.v210Migrated` on every plan it migrates.
 * The allowlist above was derived from defaultPlan.advanced and asserted equal
 * to it, so a freshly normalized plan reported UNKNOWN_ADVANCED_KEY about a
 * field the application had just written -- the import reviewer warning the
 * user about the importer.
 *
 * The exact-set guard could not have caught this, and that is the useful part:
 * the marker is CREATED during normalization and never stored in the default,
 * so a contract derived only from defaults is structurally blind to it. A
 * default object is a starting shape, not the accepted schema. Migration
 * metadata is therefore declared separately and deliberately -- adding a key
 * here is a decision, and the drift test still requires the default's own keys
 * to be present in full. */
const ADVANCED_MIGRATION_KEYS = ['v210Migrated'];
/* S5AA R35 (SA32F-24): OPTIONAL INPUTS the default does not carry -- the MAGI and filing status of the two tax returns before the plan,
   for the IRMAA lookback. Absent means not entered (the plan then assumes no surcharge in its first two years, and says so), which is why
   they are not in the default: a default of 0 would read as entered. */
const ADVANCED_OPTIONAL_KEYS = ['irmaaMagiTwoYearsBefore', 'irmaaMagiOneYearBefore', 'irmaaFilingTwoYearsBefore', 'irmaaFilingOneYearBefore',
  /* S5AA R45 (the owner's AA1 decisions on AA1-40): absent means "at the default date" (conversions: profile.retireAge; pre-Medicare
     health: the household date), which is why the default does not carry them. */
  'conversionStartAge', 'healthCoverageEndAge',
  /* S5AA R49 (the owner's AA1 decision on AA1-37): absent means the default onset rule (max(65, round(retireAge + 10))). */
  'ltcOnsetAge',  /* S5AA R48 (the owner's AA1 decision on AA1-23): absent means the Medicare charge grows at advanced.healthInflation and the Part D
     plan premium is the CMS base premium. Typed and ranged by src/plan-value-contract.json. */
  'medicareInflation', 'partDPremium'];

function validateAdvancedKnownKeys(c, advanced) {
  Object.keys(advanced).forEach((k) => {
    if (ADVANCED_KNOWN_KEYS.indexOf(k) >= 0) return;
    if (ADVANCED_MIGRATION_KEYS.indexOf(k) >= 0) return;
    if (ADVANCED_OPTIONAL_KEYS.indexOf(k) >= 0) return;
    c.warn('UNKNOWN_ADVANCED_KEY', 'advanced.' + k,
      `"advanced.${k}" is not a field this version knows. If it is a typo for a real setting, ` +
      'that setting is silently keeping its default -- a misspelled "networthOn" leaves net ' +
      'worth excluding the house with nothing to say so.');
  });
}

function validateAdvanced(c, advanced) {
  if (!advanced) return;
  validateAdvancedKnownKeys(c, advanced);
  validateSurplusPolicies(c, advanced);
  ['irmaaMagiTwoYearsBefore', 'irmaaMagiOneYearBefore'].forEach((k) => {
    if (advanced[k] === undefined || advanced[k] === null) return;
    checkType(c, advanced[k], 'advanced.' + k, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
    if (isFiniteNumber(advanced[k]) && advanced[k] < 0) c.error('OUT_OF_RANGE', 'advanced.' + k, `"advanced.${k}" is ${advanced[k]}, expected 0 or more`);
  });
  ['irmaaFilingTwoYearsBefore', 'irmaaFilingOneYearBefore'].forEach((k) => {
    if (advanced[k] === undefined || advanced[k] === null) return;
    if (['single', 'mfj', 'mfs', 'hoh'].indexOf(advanced[k]) < 0) c.error('INVALID_ENUM', 'advanced.' + k, `"advanced.${k}" must be single, mfj, mfs or hoh`);
  });
  /* S5AA R40 (the audit of PR #35): healthcare inflation grows the pre-Medicare cost and, since R40, the care cost, and had no rule. At
     -100 or below the growth factor is no longer positive (a fractional power of it is NaN); above 100 a long plan overflows. The form
     offers 0 to 20. Absent, the health path fails and the care cost silently grew at 0%. */
  if (advanced.healthInflation === undefined) {
    if (advanced.healthOn === true || advanced.ltcOn === true) {
      c.error('MISSING_FIELD', 'advanced.healthInflation', 'health or care costs are on, so "advanced.healthInflation" is required');
    }
  } else if (checkType(c, advanced.healthInflation, 'advanced.healthInflation', isFiniteNumber, 'WRONG_TYPE', 'a finite number')) {
    if (advanced.healthInflation <= -100 || advanced.healthInflation > 100) {
      c.error('OUT_OF_RANGE', 'advanced.healthInflation', `"advanced.healthInflation" is ${advanced.healthInflation}, expected more than -100 and at most 100`);
    } else {
      checkRange(c, advanced.healthInflation, 'advanced.healthInflation', 0, 20, 'OUT_OF_RANGE', 'warning');
    }
  }
  /* S5AA R48 (AA1-23): the Medicare growth rate, when entered, is held like healthcare inflation -- the contract refuses -100 or below and
     above 100; outside the form's 0 to 20 it warns. */
  if (isFiniteNumber(advanced.medicareInflation) && advanced.medicareInflation > -100 && advanced.medicareInflation <= 100) {
    checkRange(c, advanced.medicareInflation, 'advanced.medicareInflation', 0, 20, 'OUT_OF_RANGE', 'warning');
  }
  if (advanced.correlation !== undefined) {
    checkType(c, advanced.correlation, 'advanced.correlation', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
    checkRange(c, advanced.correlation, 'advanced.correlation', -1, 1);
  }
  if (advanced.assetClasses !== undefined) {
    if (!Array.isArray(advanced.assetClasses)) {
      c.error('WRONG_TYPE', 'advanced.assetClasses', `must be an array, got ${JSON.stringify(advanced.assetClasses)}`);
    } else {
      advanced.assetClasses.forEach((ac, i) => {
        const path = `advanced.assetClasses[${i}]`;
        if (!isPlainObject(ac)) { c.error('WRONG_TYPE', path, `each asset class must be an object, got ${JSON.stringify(ac)}`); return; }
        checkType(c, ac.id, `${path}.id`, (v) => typeof v === 'string' && v.length > 0, 'WRONG_TYPE', 'a non-empty string');
        checkType(c, ac.returnRate, `${path}.returnRate`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
        checkType(c, ac.volatility, `${path}.volatility`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
        /* S5AA R37 (SA32F-51): the engine blends class volatilities in pairs, so a negative one cancels risk; refused there. */
        if (isFiniteNumber(ac.volatility) && ac.volatility < 0) {
          c.error('NEGATIVE_VOLATILITY', `${path}.volatility`, `asset-class volatility is negative (${ac.volatility})`);
        }
      });
    }
  }
  if (advanced.debts !== undefined) {
    if (!Array.isArray(advanced.debts)) {
      c.error('WRONG_TYPE', 'advanced.debts', `"debts" must be an array, got ${JSON.stringify(advanced.debts)}`);
    } else {
      advanced.debts.forEach((d, i) => validateDebt(c, d, i));
    }
  }
  if (advanced.otherAssets !== undefined) {
    if (!Array.isArray(advanced.otherAssets)) {
      c.error('WRONG_TYPE', 'advanced.otherAssets', `"otherAssets" must be an array, got ${JSON.stringify(advanced.otherAssets)}`);
    } else {
      advanced.otherAssets.forEach((a, i) => validateOtherAsset(c, a, i));
    }
  }
}

function validateDebt(c, debt, index) {
  const path = `advanced.debts[${index}]`;
  if (!isPlainObject(debt)) {
    c.error('WRONG_TYPE', path, `each debt must be an object, got ${JSON.stringify(debt)}`);
    return;
  }
  checkType(c, debt.balance, `${path}.balance`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  if (isFiniteNumber(debt.balance) && debt.balance < 0) {
    c.warn('NEGATIVE_BALANCE', `${path}.balance`, `debt balance is negative (${debt.balance})`);
  }
  checkType(c, debt.rate, `${path}.rate`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  if (isFiniteNumber(debt.rate) && debt.rate < 0) {
    c.warn('NEGATIVE_RATE', `${path}.rate`, `debt rate is negative (${debt.rate})`);
  }
  checkEnum(c, debt.rateType, `${path}.rateType`, RATE_TYPES);
  if (debt.paymentMonthly !== undefined) {
    checkType(c, debt.paymentMonthly, `${path}.paymentMonthly`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
    if (isFiniteNumber(debt.paymentMonthly) && debt.paymentMonthly < 0) {
      c.warn('NEGATIVE_PAYMENT', `${path}.paymentMonthly`, `paymentMonthly is negative (${debt.paymentMonthly})`);
    }
  }
  /* S5AA R37 (SA32F-51): the engine made each of these zero when it was negative or not a number; it now refuses them. */
  ['extraPrincipalMonthly', 'pmiMonthly', 'annualPropertyTax', 'annualInsurance', 'hoaMonthly'].forEach((field) => {
    if (checkType(c, debt[field], `${path}.${field}`, isFiniteNumber, 'WRONG_TYPE', 'a finite number') && debt[field] < 0) {
      c.error('NEGATIVE_AMOUNT', `${path}.${field}`, `${field} is negative (${debt[field]})`);
    }
  });
  if (debt.payoffAge !== undefined) {
    checkType(c, debt.payoffAge, `${path}.payoffAge`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  }
  /* S5AA R40: runPlan() refuses an adjustable debt that resets its rate at an age but has no reset rate or no payoff age
     (SCENARIO_DEBT_RESET_TERMS_MISSING, R37 ad62460). This accepted it, so a valid plan came back as a calculation error. */
  /* S5AA R40 (the audit of PR #35): a present reset rate or reset age that is not a number is WRONG_TYPE -- the engine refuses both
     (NONFINITE_DEBT_RATE, NONFINITE_DEBT_RESET_AGE, or NONFINITE_LIST_VALUE for NaN and Infinity) -- and a reset rate or payoff age that
     is absent is DEBT_RESET_TERMS_MISSING, as the engine names it. */
  if (debt.rateType === 'adjustable') {
    if (debt.resetRate !== undefined) checkType(c, debt.resetRate, `${path}.resetRate`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
    if (debt.nextRateResetAge !== undefined && debt.nextRateResetAge !== null) {
      checkType(c, debt.nextRateResetAge, `${path}.nextRateResetAge`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
    }
  }
  if (debt.rateType === 'adjustable' && isFiniteNumber(debt.nextRateResetAge) && (debt.resetRate === undefined || debt.payoffAge === undefined || debt.payoffAge === null)) {
    c.error('DEBT_RESET_TERMS_MISSING', `${path}.${debt.resetRate === undefined ? 'resetRate' : 'payoffAge'}`,
      'an adjustable debt that resets its rate at an age needs a reset rate and a payoff age, or its payment after the reset cannot be projected');
  }
  /* Q43: A PAYMENT THAT DOES NOT COVER ITS OWN INTEREST WAS ACCEPTED IN SILENCE.
   *
   * `normalizeDebt()` defaults `paymentMonthly` to 0, which is the literal
   * out-of-the-box state of every debt added through the UI. Nothing here, in
   * the form, or in the calculation said anything about it: this function
   * warned only on a NEGATIVE payment, so zero -- the common case -- passed.
   *
   * `projectDebts()` then negative-amortizes correctly and deliberately (the
   * B-6 fix, covered by tests/debt-projection-divergence.test.js). Measured:
   * $20,000 at 20% with paymentMonthly 0 reaches $866,458 by age 74. With a
   * `payoffAge` the whole inflated balance is then forced out in one period.
   *
   * THIS WARNS; IT DOES NOT CAP. The round-6 auditor's constraint is explicit
   * that an uncapped scheduled balloon is not by itself proof the calculation
   * should be capped, and that the accepted debt contract has to be defined
   * before any refusal behaviour is. Capping would be a modelling decision
   * nobody has made. The defect being repaired here is the SILENCE.
   *
   * Deliberately a validator warning rather than anything in `runPlan()`:
   * validator output is not part of the captured result, so this cannot move
   * the reference baseline. Verified, not assumed -- see the witness. */
  /* SCOPED TO A PAYMENT EXPLICITLY SET TO ZERO, which is Q43's measured case
     and the UI's out-of-the-box default -- not to underpayment generally.
     The wider condition is real and much more common: 33 of 91 debts in a
     120-scenario generated corpus (36%) carry a payment below their own
     interest, because the generator draws paymentMonthly from a flat range
     independent of balance and rate. Warning on all of them would be correct
     about the arithmetic and would also fire on most of the reference corpus,
     which is a separate finding about the GENERATOR rather than a licence to
     widen this check until the tests that disagree go quiet.
     An ABSENT paymentMonthly is deliberately not warned on either: this
     validator runs before normalizeDebt() supplies the default, so absent
     means "not stated here", not "zero". */
  const bal = debt.balance;
  const rate = debt.rate;
  if (isFiniteNumber(bal) && bal > 0 && isFiniteNumber(rate) && rate > 0) {
    const pay = debt.paymentMonthly;
    if (isFiniteNumber(pay) && pay === 0) {
      const monthlyInterest = bal * (rate / 100) / 12;
      {
        c.warn('PAYMENT_BELOW_INTEREST', `${path}.paymentMonthly`,
          `monthly payment is 0, which does not cover this debt's own accruing interest ` +
          `(${monthlyInterest.toFixed(2)}/month at ${rate}% on ${bal}), so the balance grows ` +
          `every period` + (debt.payoffAge !== undefined
            ? `, and the whole grown balance is forced out at payoffAge ${debt.payoffAge}`
            : ''));
      }
    }
  }
  /* Q59 (b), decided 2026-09-13 (the owner): a debt whose payments are excluded from spending is paid from nothing the
     plan models -- there is no working-period budget (MODEL_ASSUMPTIONS.md section 7) -- so it is reported. A
     WARNING: the plan still runs. Only a debt with something left to pay is reported. */
  if (debt.includePayment === false && isFiniteNumber(debt.balance) && debt.balance > 0) {
    c.warn('DEBT_PAYMENT_OUTSIDE_SPENDING', `${path}.includePayment`,
      'this debt\'s payments are excluded from spending (includePayment is false), so nothing the plan models pays them');
  }
}

/* S5AA R49 (AA1-44; the owner's AA1 decision, 2026-10-03: "the residual shown beside a forced payoff date"): THE BALANCE LEFT AT A
 * DEBT'S PAYOFF AGE by its scheduled payments, which projectDebts() in engine.js forces out in one payment there. The engine's monthly
 * loop, from the plan's starting age: the entered payment plus extra principal; a credit card's revolving minimum (the greater of its
 * percent of the balance and its dollar floor, 2% and $25 unless the debt carries others) as a floor on the payment; an adjustable
 * rate's reset recasts the payment over the remaining term, which clears the balance by the payoff age. A payoff age at or before the
 * start runs the first projection year's payments, as the engine does. Returns 0 for a debt with no balance or no payoff age. */
function debtPayoffResidual(debt, startAge, endAge) {
  if (!isPlainObject(debt) || !isFiniteNumber(debt.balance) || !(debt.balance > 0) || !isFiniteNumber(debt.payoffAge) || !isFiniteNumber(startAge)) return 0;
  const firstRowEnd = Math.min(Math.floor(startAge + 1e-9) + 1, isFiniteNumber(endAge) ? endAge : Infinity);
  const months = Math.max(0, Math.round(((debt.payoffAge > startAge ? debt.payoffAge : firstRowEnd) - startAge) * 12));
  const resetMonth = debt.rateType === 'adjustable' && isFiniteNumber(debt.nextRateResetAge) && debt.nextRateResetAge < debt.payoffAge
    ? Math.round((debt.nextRateResetAge - startAge) * 12) : Infinity;
  const nonNegative = (v, d) => (isFiniteNumber(v) && v >= 0 ? v : d);
  const monthlyRate = Math.max(0, isFiniteNumber(debt.rate) ? debt.rate : 0) / 1200;
  const payment = Math.max(0, isFiniteNumber(debt.paymentMonthly) ? debt.paymentMonthly : 0);
  const extra = Math.max(0, isFiniteNumber(debt.extraPrincipalMonthly) ? debt.extraPrincipalMonthly : 0);
  let balance = debt.balance;
  for (let m = 0; m < months && balance > 1e-9; m++) {
    if (m >= resetMonth) return 0;
    const interest = balance * monthlyRate;
    let base = payment;
    if (debt.type === 'creditCard') {
      base = Math.max(base, Math.min(Math.max(balance * nonNegative(debt.minimumPercentOfBalance, 2) / 100, nonNegative(debt.minimumDollarFloor, 25)), balance + interest));
    }
    balance = Math.max(0, balance + interest - Math.min(base + extra, balance + interest));
  }
  return balance;
}

/* S5AA R49 (AA1-44): a WARNING when the scheduled payments leave a balance (50 cents or more) at a payoff age the plan reaches -- that
 * balance is paid in one sum at that age. The debt editor shows the same figure beside the payoff age. */
function validateDebtPayoffResiduals(c, plan) {
  const profile = isPlainObject(plan.profile) ? plan.profile : {};
  const debts = isPlainObject(plan.advanced) && Array.isArray(plan.advanced.debts) ? plan.advanced.debts : [];
  if (!isFiniteNumber(profile.age) || !isFiniteNumber(profile.endAge)) return;
  debts.forEach((debt, i) => {
    if (!isPlainObject(debt) || !isFiniteNumber(debt.payoffAge) || debt.payoffAge > profile.endAge) return;
    const left = debtPayoffResidual(debt, profile.age, profile.endAge);
    if (left >= 0.5) {
      c.warn('DEBT_PAYOFF_RESIDUAL', `advanced.debts[${i}].payoffAge`,
        `the scheduled payments leave about ${Math.round(left).toLocaleString('en-US')} owed at the payoff age ${debt.payoffAge}, ` +
        'and the plan pays it in one lump sum there; raise the payment or move the payoff age if that is not intended');
    }
  });
}

/* S5AA R49 (AA1-08; the owner's AA1 decision, 2026-10-03: "insurance as an estate measure"): with net worth on, the life insurance
 * death benefit counts in net worth from the primary's lifespan onward (engine.js). A plan that starts at or after that age counts it
 * from the first year, as though the benefit were already in hand. A WARNING. */
function validateInsuranceTiming(c, plan) {
  const a = isPlainObject(plan.advanced) ? plan.advanced : {}, r = isPlainObject(plan.retirement) ? plan.retirement : {}, pr = isPlainObject(plan.profile) ? plan.profile : {};
  if (a.networthOn === true && isFiniteNumber(a.insurance) && a.insurance > 0 && isFiniteNumber(r.selfLife) && isFiniteNumber(pr.age) && r.selfLife <= pr.age) {
    c.warn('INSURANCE_AFTER_INSURED_DEATH', 'advanced.insurance',
      `the life insurance benefit counts in net worth from your lifespan (${r.selfLife}), which is at or before the plan's starting age (${pr.age}), ` +
      'so it is counted from the first year; it is an estate measure, never paid into the portfolio');
  }
}

function validateOtherAsset(c, asset, index) {
  const path = `advanced.otherAssets[${index}]`;
  if (!isPlainObject(asset)) {
    c.error('WRONG_TYPE', path, `each other-asset must be an object, got ${JSON.stringify(asset)}`);
    return;
  }
  checkType(c, asset.value, `${path}.value`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  if (isFiniteNumber(asset.value) && asset.value < 0) {
    c.warn('NEGATIVE_VALUE', `${path}.value`, `asset value is negative (${asset.value})`);
  }
  checkEnum(c, asset.liquidity, `${path}.liquidity`, LIQUIDITY_TIERS);
  if (asset.accessPct !== undefined) {
    checkType(c, asset.accessPct, `${path}.accessPct`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
    checkRange(c, asset.accessPct, `${path}.accessPct`, 0, 100);
  }
  if (asset.availableAge !== undefined) {
    checkType(c, asset.availableAge, `${path}.availableAge`, isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  }
}

/**
 * Validates a plan/Scenario object against the calculator's existing shape.
 * Never throws and never mutates `plan`. Returns { valid, issues }, where
 * `valid` is false only if at least one ERROR-severity issue was found
 * (WARNING-only results are still `valid`).
 */
/* Q59 (b), decided 2026-09-13 (the owner): planned contributions above the household's earned income are funded by
   nothing the plan models -- there is no working-period budget (MODEL_ASSUMPTIONS.md section 7). At the starting
   age this mirrors the engine: an owner contributes only inside ownerContributionEligibility()'s window (a work
   window within contributionStop, and for a spouse only when a spouse is on); each such owner's accounts plan what
   accountPlannedContribution() gives at that age (a salary percentage of that owner's salary, otherwise the amount,
   with future changes already due, floored at zero); and earned income is those owners' salaries. "Earned income"
   is the household's, so a spousal IRA funded from the other spouse's pay is not reported (decided 2026-09-14).
   A WARNING: the plan still runs. */
function validatePlannedContributions(c, plan) {
  const accounts = Array.isArray(plan.accounts) ? plan.accounts : [];
  const profile = isPlainObject(plan.profile) ? plan.profile : {};
  const employment = isPlainObject(plan.employment) ? plan.employment : {};
  const num = (v) => (isFiniteNumber(v) ? v : NaN);
  /* S5AA R33 (decisions 5a and 5c): the stop age is read on each owner's own age, and on a joint return an owner not working can
     fund an IRA while the other spouse works (the engine's ownerContributionEligibility()). */
  const age = num(profile.age), retireAge = num(profile.retireAge), stopAge = num(employment.contributionStop), spouseAge = num(profile.spouseAge);
  /* S5AA R45: the spouse works to their own retirement age (profile.spouseRetireAge; absent, profile.retireAge), as the engine's
     householdWorkDurations() reads it. */
  const spouseRetireAge = isFiniteNumber(profile.spouseRetireAge) ? profile.spouseRetireAge : retireAge;
  const work = { self: Math.max(0, Math.min(1, retireAge - age)), spouse: profile.spouseOn === true ? Math.max(0, Math.min(1, spouseRetireAge - spouseAge)) : 0 };
  const eligible = { self: Math.max(0, Math.min(stopAge - age, work.self)) > 0, spouse: profile.spouseOn === true && Math.max(0, Math.min(stopAge - spouseAge, work.spouse)) > 0 };
  const joint = profile.spouseOn === true && profile.filing === 'mfj';
  const iraEligible = { self: eligible.self || (joint && stopAge - age > 0 && work.spouse > 0), spouse: eligible.spouse || (joint && stopAge - spouseAge > 0 && work.self > 0) };
  const startAgeOf = (owner) => (owner === 'spouse' && profile.spouseOn === true ? spouseAge : age);
  const salaryOf = (owner) => { const s = owner === 'spouse' ? employment.spouseSalary : employment.salary; return isFiniteNumber(s) ? s : 0; };
  let planned = 0, ownIraAbove = false;
  for (const a of accounts) {
    if (!isPlainObject(a)) continue;
    const owner = a.owner === 'spouse' ? 'spouse' : 'self';
    const isIra = a.type === 'traditionalIRA' || a.type === 'rothIRA';
    if (!(isIra ? iraEligible[owner] : eligible[owner])) continue;
    /* S5AA R37 (SA32F-45): a joint account reads the household's salary, as the engine and the form do. */
    const ownerSalary = a.owner === 'joint' ? salaryOf('self') + (profile.spouseOn === true ? salaryOf('spouse') : 0) : salaryOf(owner);
    const contribution = isFiniteNumber(a.contribution) ? a.contribution : 0;
    let amount = a.contributionMode === 'salaryPct' ? ownerSalary * contribution / 100 : contribution;
    const due = Array.isArray(a.futureChanges)
      ? a.futureChanges.filter((f) => isPlainObject(f) && isFiniteNumber(f.age) && isFiniteNumber(f.value) && startAgeOf(owner) >= f.age).sort((x, y) => x.age - y.age)
      : [];
    for (const f of due) {
      if (f.mode === 'set') amount = f.value;
      else if (f.mode === 'percent') amount *= 1 + f.value / 100;
      else amount += f.value;
    }
    planned += Math.max(0, amount);
  }
  /* S5AA R45 (the owner, 2026-10-03): earned income also counts employment and self-employment streams paying at the starting age, by
     owner (the engine's ownerCompensation() counts both). An amount entered as today's dollars is read at its face value here. */
  const streams = isPlainObject(plan.retirement) && Array.isArray(plan.retirement.otherIncomes) ? plan.retirement.otherIncomes : [];
  const streamPay = (owner) => streams.reduce((t, s) => {
    if (!isPlainObject(s) || (s.type !== 'employment' && s.type !== 'selfEmployment') || !isFiniteNumber(s.amount)) return t;
    const own = s.owner === 'spouse' && profile.spouseOn === true ? 'spouse' : 'self', start = startAgeOf(own);
    if (own !== owner) return t;
    if (isFiniteNumber(s.start) && s.start > start) return t;
    if (isFiniteNumber(s.end) && s.end <= start) return t;
    return t + Math.max(0, s.amount);
  }, 0);
  const earned = (eligible.self ? salaryOf('self') + streamPay('self') : 0) + (eligible.spouse ? salaryOf('spouse') + streamPay('spouse') : 0);
  if (planned > 0 && (planned > earned)) {
    c.warn('CONTRIBUTIONS_ABOVE_EARNED_INCOME', 'accounts',
      `planned contributions of ${Math.round(planned)} a year at the starting age exceed the earned income of ${Math.round(earned)} of the household members contributing, and nothing the plan models funds the difference`);
  }
}

/* S5AA R21 (R20-01, ChatGPT's R19/R20 audit, P2; the owner, 2026-09-23: reject it at validation): every allocation key must be
 * the id of one of advanced.assetClasses. accountGlideWeights() in engine.js divides the known classes' weights by the
 * sum of ALL keys, so a weight on a class the plan does not define skewed the glide off its target: {stocks:50, bonds:25,
 * ghost:25} gliding to 20% stock was held at one third stock, 6.33% where 20/80 is 5.6%. The app cannot make such a
 * key (Remove deletes it from every account, and no box shows it), so it can come only from a hand-edited or foreign
 * file. The key is the rule, whatever its weight and whether or not assetsOn is set, since the classes can be switched
 * on later. Ids are looked up in a Set, never through an object's prototype (Q67: "constructor" is an ordinary id).
 * With no class list to check against, the list's own problem is reported by validateAdvanced(). */
function validateAllocationClasses(c, plan) {
  const advanced = plan.advanced;
  if (!isPlainObject(advanced) || !Array.isArray(advanced.assetClasses) || !Array.isArray(plan.accounts)) return;
  const known = new Set(advanced.assetClasses.filter((ac) => isPlainObject(ac) && typeof ac.id === 'string').map((ac) => ac.id));
  plan.accounts.forEach((account, index) => {
    if (!isPlainObject(account) || !isPlainObject(account.allocation)) return;
    Object.keys(account.allocation).forEach((k) => {
      if (known.has(k)) return;
      c.error('UNKNOWN_ALLOCATION_CLASS', `accounts[${index}].allocation.${k}`,
        `account ${JSON.stringify(String(account.id))} allocates to ${JSON.stringify(k)}, which is not an asset class in this ` +
        'plan; a weight on a class the plan does not define cannot be priced, and it moves a glide path off its target');
    });
  });
}

/* S5AA R46 (the owner, 2026-10-03, MC-C: "impossible correlations refused"; the engine's infeasibleCorrelation()): one correlation shared by
 * every pair of m asset classes is possible only between -1/(m - 1) and 1; below it the classes' combined variance is negative, and the
 * engine read it as zero risk (five 20% classes at -0.5 gave every path the same result). Checked where Monte Carlo reads it (method
 * monteCarlo, asset classes on). m counts the ACTIVE classes: those some account, as entered, weights above zero at the start or the end
 * of its glide -- the engine's accountGlideWeights() at progress 0 and 1, mirrored here (an account holding only stocks glides into bonds;
 * every other class's weight scales with the non-stock share). A range WARNING already at the path is upgraded in place. */
function activeAssetClassCount(plan) {
  const adv = plan.advanced, pr = plan.profile;
  const classes = adv.assetClasses.filter((ac) => isPlainObject(ac));
  const ids = classes.map((ac) => ac.id), held = new Set();
  const glide = adv.glideOn === true && ids.includes('stocks') && isFiniteNumber(adv.retirementStock);
  (Array.isArray(plan.accounts) ? plan.accounts : []).forEach((a) => {
    if (!isPlainObject(a) || !isPlainObject(a.allocation)) return;
    const total = Object.keys(a.allocation).reduce((t, k) => t + Math.max(0, a.allocation[k] || 0), 0);
    if (!(total > 0)) return;
    const w = {};
    ids.forEach((id) => { w[id] = Math.max(0, (Object.prototype.hasOwnProperty.call(a.allocation, id) ? a.allocation[id] : 0) || 0) / total; });
    ids.forEach((id) => { if (w[id] > 0) held.add(id); });
    if (!glide) return;
    const target = w.stocks + (adv.retirementStock / 100 - w.stocks), nonStock = ids.reduce((t, id) => t + (id === 'stocks' ? 0 : w[id]), 0);
    if (nonStock > 0) {
      const scale = Math.max(0, 1 - target) / Math.max(0.0001, 1 - w.stocks);
      ids.forEach((id) => { if ((id === 'stocks' ? target : w[id] * scale) > 0) held.add(id); });
    } else if (ids.includes('bonds')) {
      if (target > 0) held.add('stocks');
      if (Math.max(0, 1 - target) > 0) held.add('bonds');
    }
  });
  return classes.filter((ac) => held.has(ac.id)).length;
}
function validateCorrelationFeasible(c, plan) {
  const a = plan.assumptions, adv = plan.advanced;
  if (!isPlainObject(a) || !isPlainObject(adv) || a.method !== 'monteCarlo' || adv.assetsOn !== true) return;
  if (!isFiniteNumber(adv.correlation) || !Array.isArray(adv.assetClasses)) return;
  const rho = adv.correlation, m = activeAssetClassCount(plan);
  if (rho <= 1 && rho >= -1 && !(m >= 2 && 1 + (m - 1) * rho < -1e-12)) return;
  const low = m >= 2 ? -1 / (m - 1) : -1, shown = String(Math.round(low * 10000) / 10000);
  const message = `"advanced.correlation" is ${rho}, which is not possible for the ${m} asset class${m === 1 ? '' : 'es'} the accounts hold: ` +
    `one correlation shared by every pair of classes must be at least ${shown}${m >= 2 ? ' (-1/(' + m + '-1))' : ''} and at most 1, or the ` +
    `classes' combined risk would be negative. Raise it to ${shown} or more, or hold fewer asset classes.`;
  const earlier = c.issues.find((i) => i.path === 'advanced.correlation' && i.severity === 'WARNING');
  if (earlier) { earlier.severity = 'ERROR'; earlier.code = 'INFEASIBLE_CORRELATION'; earlier.message = message; return; }
  c.error('INFEASIBLE_CORRELATION', 'advanced.correlation', message);
}

/* S5AA R29: a transfer into a workplace plan must be a same-character rollover or a pre-tax to Roth conversion. Only while the
   transfer is on, and only when both endpoints resolve (their ids are checked elsewhere). S5AA R32: a rollover between the named
   sheltered accounts stays with one owner (R30A-03), and a Roth IRA cannot roll into a 401(k) (R30A-02; Publication 590-A). */
function validateTransferEndpoints(c, plan) {
  const a = plan && plan.advanced;
  if (!a || a.transferOn !== true || !Array.isArray(plan.accounts)) return;
  const from = plan.accounts.find((x) => x && x.id === a.transferFrom), to = plan.accounts.find((x) => x && x.id === a.transferTo);
  if (!from || !to || from === to) return;
  if (from.taxClass === to.taxClass && ROLLOVER_OWNER_TYPES.includes(from.type) && ROLLOVER_OWNER_TYPES.includes(to.type) &&
    (from.owner === 'spouse') !== (to.owner === 'spouse')) {
    c.error('TRANSFER_BETWEEN_OWNERS', 'advanced.transferTo', 'A rollover between retirement or HSA accounts must stay with the same ' +
      'owner; one spouse\'s account cannot roll into the other\'s while both are living.');
  }
  if (!WORKPLACE_PLAN_TYPES.includes(to.type)) return;
  if (from.type === 'rothIRA') {
    c.error('TRANSFER_INTO_WORKPLACE_PLAN', 'advanced.transferTo', 'A Roth IRA cannot roll into a 401(k); only a 401(k)\'s Roth money can roll ' +
      'into a Roth IRA.');
    return;
  }
  if (from.taxClass === to.taxClass || (from.taxClass === 'preTax' && to.taxClass === 'roth')) return;
  c.error('TRANSFER_INTO_WORKPLACE_PLAN', 'advanced.transferTo', 'A 401(k) can only receive payroll contributions, a rollover of the ' +
    'same tax character, or a conversion to its owner\'s own Roth account. A transfer into it from a ' + from.taxClass + ' account is not allowed.');
}

/* S5AA R43 (SA42F-05, SA42F-06; Claude's R42F audit; the owner 2026-09-30): every value src/plan-value-contract.json names, held to its type,
 * presence, range or listed text -- the rules the engine's gate refuses, from the same file. A path an earlier check already reported as an
 * ERROR is not reported twice. */
function validatePlanValueContract(c, plan) {
  const C = VALIDATOR_VALUE_CONTRACT;
  const at = (o, dotted) => dotted.split('.').reduce((x, k) => (x == null || typeof x !== 'object' ? undefined : x[k]), o);
  const done = new Set(c.issues.filter((i) => i.severity === 'ERROR').map((i) => i.path));
  /* A path an earlier check reported only as a WARNING (an otherAsset's liquidity, a debt's rateType) is upgraded to the contract's ERROR in
     place, so it is reported once. */
  const report = (code, where, message) => {
    if (done.has(where)) return;
    done.add(where);
    const earlier = c.issues.find((i) => i.path === where && i.severity === 'WARNING');
    if (earlier) { earlier.severity = 'ERROR'; earlier.code = code; earlier.message = message; return; }
    c.error(code, where, message);
  };
  const check = (rule, v, where) => {
    if (v === undefined) return;
    if (rule.type === 'enum') { if (rule.values.indexOf(v) < 0) report('INVALID_ENUM', where, `"${where}" is ${JSON.stringify(v)}, expected one of ${rule.values.join(', ')}`); return; }
    if (v === null && rule.nullable) return;
    if (!isFiniteNumber(v)) { report('WRONG_TYPE', where, `expected a finite number at "${where}", got ${JSON.stringify(v)}`); return; }
    const low = rule.min !== undefined && (rule.minExclusive ? !(v > rule.min) : v < rule.min), high = rule.max !== undefined && v > rule.max;
    if (low || high) report('OUT_OF_RANGE', where, `"${where}" is ${v}, expected ${rule.min !== undefined ? (rule.minExclusive ? 'more than ' : 'at least ') + rule.min : ''}${rule.min !== undefined && rule.max !== undefined ? ' and ' : ''}${rule.max !== undefined ? 'at most ' + rule.max : ''}`);
  };
  C.scalars.forEach((rule) => {
    const v = at(plan, rule.path), when = rule.requiredWhen === undefined ? [] : [].concat(rule.requiredWhen);
    if (v === undefined) { if (when.some((w) => at(plan, w) === true)) report('MISSING_FIELD', rule.path, `"${rule.path}" is required while ${when.join(' or ')} is on`); return; }
    check(rule, v, rule.path);
  });
  C.lists.forEach((L) => {
    const list = at(plan, L.list);
    if (!Array.isArray(list)) return;
    list.forEach((rec, i) => {
      if (!isPlainObject(rec)) return;
      L.fields.forEach((f) => {
        const where = `${L.list}[${i}].${f.name}`, need = f.required || (f.requiredUnlessType && f.requiredUnlessType.indexOf(rec.type) < 0);
        if (rec[f.name] === undefined) { if (need) report('MISSING_FIELD', where, `"${L.list}[${i}]" is missing "${f.name}"`); return; }
        check(f, rec[f.name], where);
      });
    });
  });
}
/* S5AA R43 (SA42F-30, SA42F-32): the engine refuses a plan with nobody alive at the start (a lifespan at or below the starting age), and the
 * validator accepted it. */
/* S5AA R48 (AA1-11; the owner's AA1 decision of 2026-10-03: "The prior-income warning shown and prompted"): THE TWO RETURNS BEFORE THE PLAN.
   Medicare's income-related surcharge for a year reads the return from two years before it (20 CFR 418.1135(a)), so the plan's first two
   years read returns from before it starts. Blank, the engine assumes the lowest tier (no surcharge) and says so in
   IRMAA_PRE_PLAN_MAGI_ASSUMED. The prompt fires where that assumption is used: health costs on, someone alive and 65 or older at the
   opening of plan year 0 or 1 with the household retired inside that row -- the engine's own condition (simulatePlanRows()'s disclosure),
   mirrored here, with the household date read as householdRetireAge() reads it (R45: the first stop; an entered spending start replaces it)
   -- and either of the two incomes blank. A WARNING: the plan runs. */
function validateIrmaaPriorIncome(c, plan) {
  const profile = isPlainObject(plan.profile) ? plan.profile : {}, advanced = isPlainObject(plan.advanced) ? plan.advanced : {};
  const retirement = isPlainObject(plan.retirement) ? plan.retirement : {}, employment = isPlainObject(plan.employment) ? plan.employment : {};
  if (advanced.healthOn !== true) return;
  const blank = (v) => v === undefined || v === null;
  if (!blank(advanced.irmaaMagiTwoYearsBefore) && !blank(advanced.irmaaMagiOneYearBefore)) return;
  const start = profile.age, end = profile.endAge, retire = profile.retireAge;
  if (![start, end, retire].every(isFiniteNumber)) return;
  const couple = profile.spouseOn === true && isFiniteNumber(profile.spouseAge);
  const sa = couple ? profile.spouseAge : NaN, toSelf = (x) => start + (x - sa);
  const selfLife = isFiniteNumber(retirement.selfLife) ? retirement.selfLife : Infinity;
  const spouseLife = couple && isFiniteNumber(retirement.spouseLife) ? retirement.spouseLife : Infinity;
  // the household date (engine householdRetireAge())
  let household = retire;
  if (isFiniteNumber(retirement.spendingStartAge)) household = retirement.spendingStartAge;
  else if (couple) {
    const sRet = isFiniteNumber(profile.spouseRetireAge) ? profile.spouseRetireAge : retire, sd = toSelf(spouseLife), earning = (isFiniteNumber(employment.spouseSalary) ? employment.spouseSalary : 0) > 0;
    const stops = [retire];
    if (earning) stops.push(Math.max(start, toSelf(sRet)));
    if (selfLife > start && selfLife < retire && sd > selfLife) stops.push(selfLife);
    if (earning && sd > start && sd < toSelf(sRet) && selfLife > sd) stops.push(sd);
    household = Math.min(...stops);
  }
  // the engine's openings and its cut at the last death (lastDeathCutAge(), householdSurvivorship(): dead once the lifespan is below the age)
  const aliveAt = (a) => ({ self: !(selfLife < a), spouse: couple && !(spouseLife < sa + (a - start)) });
  let reaches = end;
  for (let b = start; b < end; b = Math.floor(b + 1e-9) + 1) { const w = aliveAt(b); if (!w.self && !w.spouse) { reaches = b; break; } }
  const openings = [start, Math.floor(start) + 1];
  for (let i = 0; i < openings.length; i++) {
    const opening = openings[i], rowEnds = i === 0 ? Math.min(Math.floor(start) + 1, reaches) : Math.min(Math.floor(start) + 2, reaches);
    if (!(rowEnds > opening) || !(household < rowEnds)) continue;
    const w = aliveAt(opening);
    if ((w.self && opening >= 65) || (w.spouse && sa + (opening - start) >= 65)) {
      c.warn('IRMAA_PRIOR_INCOME_BLANK', blank(advanced.irmaaMagiTwoYearsBefore) ? 'advanced.irmaaMagiTwoYearsBefore' : 'advanced.irmaaMagiOneYearBefore',
        'Health costs are on and someone is 65 or older and retired in the plan\'s first two years, but the income (MAGI) on ' +
        (blank(advanced.irmaaMagiTwoYearsBefore) && blank(advanced.irmaaMagiOneYearBefore) ? 'the two tax returns before the plan is' : blank(advanced.irmaaMagiTwoYearsBefore) ? 'the tax return two years ago is' : 'last year\'s tax return is') +
        ' blank. Medicare\'s income-related surcharge (IRMAA) reads the return from two years earlier; a blank year is assumed to be below the first surcharge tier.');
      return;
    }
  }
}

function validateSomeoneAlive(c, plan) {
  const pr = plan.profile, r = plan.retirement;
  if (!isPlainObject(pr) || !isPlainObject(r) || !isFiniteNumber(pr.age)) return;
  const selfGone = isFiniteNumber(r.selfLife) && r.selfLife <= pr.age;
  const spouseGone = pr.spouseOn !== true || (isFiniteNumber(r.spouseLife) && isFiniteNumber(pr.spouseAge) && r.spouseLife <= pr.spouseAge);
  if (selfGone && spouseGone) c.error('NOBODY_ALIVE_AT_START', 'retirement.selfLife', `nobody in the plan is alive at the start: a lifespan of ${r.selfLife} at a starting age of ${pr.age} ends before the first year`);
}
function validateScenario(plan) {
  const c = makeCollector();

  if (!isPlainObject(plan)) {
    c.error('WRONG_TYPE', '(root)', `scenario must be an object, got ${JSON.stringify(plan)}`);
    return { valid: false, issues: c.issues };
  }

  const profile = requireSection(c, plan, 'profile');
  const employment = requireSection(c, plan, 'employment');
  const assumptions = requireSection(c, plan, 'assumptions');
  const retirement = requireSection(c, plan, 'retirement');
  const advanced = requireSection(c, plan, 'advanced');

  if (plan.accounts === undefined) {
    c.error('MISSING_SECTION', 'accounts', 'required section "accounts" is missing');
  } else if (!Array.isArray(plan.accounts)) {
    c.error('WRONG_TYPE', 'accounts', `"accounts" must be an array, got ${JSON.stringify(plan.accounts)}`);
  } else {
    plan.accounts.forEach((a, i) => validateAccount(c, a, i));
    validateAccountIdentity(c, plan.accounts);
    // S5AA R43 (SA42F-04): with no spouse in the plan, the engine reads a "spouse" account as the only person's.
    if (!(isPlainObject(plan.profile) && plan.profile.spouseOn === true)) {
      plan.accounts.forEach((a, i) => {
        if (isPlainObject(a) && a.owner === 'spouse') c.warn('SPOUSE_ACCOUNT_WITHOUT_SPOUSE', `accounts[${i}].owner`, 'this account is marked as the spouse\'s, but the plan has no spouse; it is read as yours');
      });
    }
  }

  if (employment !== null) {
    checkType(c, employment.salary, 'employment.salary', isFiniteNumber, 'WRONG_TYPE', 'a finite number');
  }

  validateProfile(c, profile, employment);
  validateAssumptions(c, assumptions);
  validateRetirement(c, retirement);
  validateAdvanced(c, advanced);
  validateAllocationClasses(c, plan); // R20-01 (S5AA R21)
  validateCorrelationFeasible(c, plan); // S5AA R46 (MC-C)
  validateBooleanFlags(c, plan); // Q53 (S5 2l)
  validatePlannedContributions(c, plan); // Q59 (S5 2q)
  validateTransferEndpoints(c, plan); // S5AA R29
  validateNestedRecords(c, plan); // R2-006
  validatePlanValueContract(c, plan); // S5AA R43 (SA42F-05, -06)
  validateSomeoneAlive(c, plan); // S5AA R43 (SA42F-30, -32)
  validateDebtPayoffResiduals(c, plan); // S5AA R49 (AA1-44)
  validateInsuranceTiming(c, plan); // S5AA R49 (AA1-08)
  validateIrmaaPriorIncome(c, plan); // S5AA R48 (AA1-11)

  const valid = !c.issues.some((i) => i.severity === 'ERROR');
  return { valid, issues: c.issues };
}

/*
 * Audit finding AUD-004 (RETIREMENT_ENGINE_AUDIT_CLAUDE_QUEUE_2026-09-08.md,
 * task T01): app-shell.html's normalizedPlan() replaces a non-array
 * retirement.stages/expenses/otherIncomes -- or normalizeAccount()'s
 * futureChanges -- with [] via `Array.isArray(x) ? x : []`, unconditionally,
 * for ANY wrong type, not just an absent one. Because importSettings() used
 * to normalize before ever calling validateScenario(), a malformed value in
 * one of these four fields was silently discarded before validation could
 * see it: the import "succeeded" with the user's data quietly gone.
 *
 * validateScenario() itself can't be run on the raw pre-normalization
 * candidate to catch this, because it also requires whole top-level sections
 * (profile, employment, assumptions, retirement, advanced, accounts) to be
 * present -- which a legitimate legacy backup relies on normalizedPlan() to
 * backfill. This is a narrower, presence-tolerant check: it only flags the
 * four specific fields normalizedPlan()/normalizeAccount() silently coerce,
 * and only when they're actually present with the wrong type. It must run
 * on the candidate BEFORE normalizedPlan() touches it, since normalizedPlan()
 * mutates its argument in place.
 */
/*
 * R2-006 fix (R2-T05, RETIREMENT_ENGINE_ROUND2_AUDIT_CLAUDE_QUEUE_2026-09-08.md).
 * Both validators previously checked only that retirement.stages/expenses/
 * otherIncomes and accounts[].futureChanges were ARRAYS, and never looked
 * inside them. A default-shaped plan with `retirement.expenses = [null]`
 * therefore passed both, survived normalization untouched
 * (`Array.isArray(x) ? x : []` is satisfied), and reached importSettings()'s
 * apply phase -- which replaced the live app and only then crashed inside
 * renderRetirementLists() reading `item.name` off null.
 *
 * These rules are deliberately narrow, because the named fix risk is
 * rejecting legitimate legacy backups:
 *
 *   - an entry must be an OBJECT. This is the demonstrated crash and it is
 *     unambiguous: a null or primitive entry cannot be rendered, edited or
 *     projected, only thrown on.
 *   - a listed financial field must be a FINITE NUMBER IF PRESENT. Absent
 *     stays legal -- legacy migration depends on that, and an absent field
 *     is inert rather than unusable. A present-but-malformed one is the
 *     worse case: the engine coerces it and produces a silently wrong
 *     financial answer, which ARCH-02 ranks above a crash.
 *
 * Only fields the engine reads as money or as a timing boundary are listed.
 * Rate-style fields the engine already reads through a documented
 * `Number(x) || 0` fallback (stage annualChange, income growth) are
 * deliberately NOT listed -- they are inert when malformed, and flagging
 * them would reject legacy backups for no correctness gain. See
 * SPRINT_QUESTIONS.md Q4.
 */
/*
 * SA-01 fix (SPRINT_EXTERNAL_AUDIT_20260909.md), replacing the narrower rule
 * written for R2-006.
 *
 * The R2-006 rule required only that an entry be an object and that any
 * PRESENT financial field be finite. Its premise was that an absent field is
 * inert. The audit disproved that premise against the comparisons the engine
 * actually performs. For a stage:
 *
 *     if (age < s.start || age > s.end) return;
 *
 * with both boundaries absent, BOTH comparisons are false, so the stage is
 * applied rather than skipped. A missing `mode` takes the amount branch and a
 * missing `value` becomes zero via `Number(s.value) || 0`. The net effect is
 * that `retirement.stages = [{name: "Go-go"}]` -- accepted by both validators
 * -- silently zeroes ALL retirement spending, with no calculation error. That
 * makes a plan look better by deleting its lifestyle. The same shape lets a
 * recurring income with no `end` pay out forever.
 *
 * So the rule is now: a PRESENT record must be a COMPLETE financial
 * instruction. Absent containers still migrate to empty arrays, which is what
 * genuine legacy backups depend on; what is refused is a present record that
 * cannot be executed without the engine inventing part of it.
 *
 * `Number(x) || 0` is explicitly NOT treated as making malformed input
 * harmless -- it silently substitutes an assumption. It also does not catch
 * everything: the string "Infinity" is truthy after conversion and passes
 * straight through it. Rate-style fields (`annualChange`, `growth`) are
 * therefore validated when present, though they remain optional.
 *
 * Field sets are taken from the records the app itself writes, not invented:
 * see app-shell.html's #v2-add-stage / #v2-add-expense / #v2-add-income
 * handlers and the future-contribution-change editor.
 */
const INCOME_TYPES = ['pension', 'rental', 'employment', 'investment', 'socialSecurity', 'taxFree', 'other', 'oneTime'];
/* S5 task 7 (the owner's question 4, answer B): self-employment profit is an income type. It is kept out of INCOME_TYPES,
 * which tests/lib/scenario-generator.js draws from, so no corpus input moves; the otherIncomes enum accepts it. */
const SELF_EMPLOYMENT_INCOME_TYPES = ['selfEmployment'];
/* S5AA R9 round, the owner's decision Q5: a one-time income can be tax-free. Kept out of INCOME_TYPES for the same reason as
 * self-employment, so no corpus input moves. A one-time type needs no end age. */
const ONE_TIME_TAX_FREE_INCOME_TYPES = ['oneTimeTaxFree'];
const ONE_TIME_INCOME_TYPES = ['oneTime'].concat(ONE_TIME_TAX_FREE_INCOME_TYPES);

const NESTED_RECORD_SPECS = {
  stages: {
    // applyStage() needs both boundaries to bound anything, a recognized mode
    // to pick a branch, and a finite value to apply.
    required: ['start', 'end', 'mode', 'value'],
    numeric: ['start', 'end', 'value', 'annualChange'],
    enums: { mode: ['amount', 'percent'], growthMode: ['inflation', 'fixed', 'none'] },
  },
  expenses: {
    // eventAmount() needs an event age and an amount.
    required: ['age', 'amount'],
    numeric: ['age', 'amount'],
    enums: { kind: ['expense', 'withdrawal'] },
  },
  otherIncomes: {
    // otherIncomeFor() branches on type for taxability, and a recurring
    // income without an interval end never stops paying.
    required: ['type', 'amount', 'start'],
    requiredUnlessOneTime: ['end'],
    numeric: ['amount', 'start', 'end', 'growth'],
    enums: { type: INCOME_TYPES, owner: ['self', 'spouse', 'household'], growthMode: ['fixed', 'inflation', 'cola'] },
  },
};
/* S5 task 7: the otherIncomes enum also accepts SELF_EMPLOYMENT_INCOME_TYPES. It is widened here, after the literal,
 * because tests/lib/scenario-generator.js evaluates that literal with only INCOME_TYPES in scope. */
NESTED_RECORD_SPECS.otherIncomes.enums.type = INCOME_TYPES.concat(SELF_EMPLOYMENT_INCOME_TYPES, ONE_TIME_TAX_FREE_INCOME_TYPES);

const FUTURE_CHANGE_SPEC = {
  // accountPlannedContribution() needs the timing, the recognized mode, and
  // the value; its unrecognized-mode branch means "dollar", so an absent mode
  // silently picks a policy.
  required: ['age', 'mode', 'value'],
  numeric: ['age', 'value'],
  enums: { mode: ['set', 'percent', 'dollar'] },
};

function validateRecordEntry(c, entry, path, spec) {
  if (!isPlainObject(entry)) {
    c.error('WRONG_TYPE', path, `each entry at "${path}" must be an object, got ${JSON.stringify(entry)}`);
    return;
  }

  let required = spec.required;
  if (spec.requiredUnlessOneTime && ONE_TIME_INCOME_TYPES.indexOf(entry.type) < 0) {
    required = required.concat(spec.requiredUnlessOneTime);
  }
  required.forEach((key) => {
    if (entry[key] === undefined) {
      c.error('MISSING_FIELD', `${path}.${key}`,
        `"${path}" is missing "${key}"; an incomplete record cannot be executed without inventing part of it`);
    }
  });

  (spec.numeric || []).forEach((key) => {
    const v = entry[key];
    if (v !== undefined && !isFiniteNumber(v)) {
      c.error('WRONG_TYPE', `${path}.${key}`, `expected a finite number at "${path}.${key}", got ${JSON.stringify(v)}`);
    }
  });

  Object.keys(spec.enums || {}).forEach((key) => {
    const v = entry[key];
    if (v !== undefined && spec.enums[key].indexOf(v) === -1) {
      c.error('UNRECOGNIZED_VALUE', `${path}.${key}`,
        `"${path}.${key}" is ${JSON.stringify(v)}, which is not one of ${spec.enums[key].join(', ')}`);
    }
  });
}

/** Shared by validateScenario() and validateRawContainers() so the
 *  pre-normalization import gate and the general validator can never
 *  disagree about what a usable nested record looks like. Silent about a
 *  container that is not an array -- that is already both callers' own
 *  error, reported once, not twice. */
function validateNestedRecords(c, plan) {
  if (!isPlainObject(plan)) return;

  if (isPlainObject(plan.retirement)) {
    Object.keys(NESTED_RECORD_SPECS).forEach((key) => {
      const list = plan.retirement[key];
      if (!Array.isArray(list)) return;
      list.forEach((entry, i) => validateRecordEntry(c, entry, `retirement.${key}[${i}]`, NESTED_RECORD_SPECS[key]));
    });
  }

  if (Array.isArray(plan.accounts)) {
    plan.accounts.forEach((a, i) => {
      if (!isPlainObject(a) || !Array.isArray(a.futureChanges)) return;
      a.futureChanges.forEach((entry, j) => validateRecordEntry(c, entry, `accounts[${i}].futureChanges[${j}]`, FUTURE_CHANGE_SPEC));
    });
  }
}

const LOSSY_COERCED_ARRAY_FIELDS = ['stages', 'expenses', 'otherIncomes'];

function validateRawContainers(plan) {
  const c = makeCollector();
  if (!isPlainObject(plan)) return { valid: true, issues: c.issues };

  if (isPlainObject(plan.retirement)) {
    LOSSY_COERCED_ARRAY_FIELDS.forEach((key) => {
      const v = plan.retirement[key];
      const path = `retirement.${key}`;
      if (v !== undefined && !Array.isArray(v)) {
        c.error('WRONG_TYPE', path, `expected an array at "${path}", got ${JSON.stringify(v)}`);
      }
    });
  }

  if (Array.isArray(plan.accounts)) {
    plan.accounts.forEach((a, i) => {
      if (!isPlainObject(a)) return; // non-object entries are caught by the full post-normalize validator
      const v = a.futureChanges;
      const path = `accounts[${i}].futureChanges`;
      if (v !== undefined && !Array.isArray(v)) {
        c.error('WRONG_TYPE', path, `expected an array at "${path}", got ${JSON.stringify(v)}`);
      }
    });
  }

  validateNestedRecords(c, plan); // R2-006

  return { valid: !c.issues.some((i) => i.severity === 'ERROR'), issues: c.issues };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LAST_HISTORY_YEAR,
  ADVANCED_KNOWN_KEYS,
  ADVANCED_MIGRATION_KEYS,
    validateScenario, validateRawContainers, debtPayoffResidual,
    TAX_CLASSES, FILING_STATUSES, METHODS, WITHDRAWAL_ORDERS, RATE_TYPES, LIQUIDITY_TIERS, STRATEGIES,
  };
}

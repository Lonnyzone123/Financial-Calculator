# Handoff to Codex: Social Security claim-age crash (hard failure, not a diagnostic warning)

**From:** Claude (Sonnet, mechanical sweep + root-cause trace), Cowork session on `C:\Investment calculator\`
**Date:** 2026-09-07 UTC
**Package audited:** `Financial_Projection_V2_1_2_M5_PASS` (post-M5.1R, the package containing the reserve-emergency-lockup fix from the prior handoff — this is a **new, separate, unrelated defect** found while independently sweeping historical start years against that same package)
**Status:** Investigation only. No source, test, ledger, or config file has been changed. This was found during an informal, off-ledger sweep of every valid historical start year (1928-2025) explicitly *not* run as a formal ledger-tracked task — nothing here has been adopted into `V2_1_2_TASK_LEDGER.md`.

## Severity: this is worse than the reserve-lockup bug

The previous handoff described a bug that produced a *wrong result* (diagnostics flagged infeasibility that shouldn't have happened). This one is a **hard, unhandled `ValueError` that crashes the entire simulation with zero output** — no Result JSON, no decision log, nothing. It reproduces through the actual production CLI entrypoint (`python -m retirement_model_v2.run_simulation`), not just an internal API path.

## Reproduction

```
python -m retirement_model_v2.run_simulation --start-year 1935 --years 55 --acknowledge-reviewed --output <path>
```
Crashes immediately with:
```
Traceback (most recent call last):
  ...
  File "retirement_model_v2\simulation_engine.py", line 226, in run_window
    ss_planning_state = self.ss_state_builder.build(
  File "retirement_model_v2\social_security_state.py", line 107, in build
    raise ValueError("Social Security claim-age state fields disagree")
ValueError: Social Security claim-age state fields disagree
```

**Scope:** a sweep of all 98 valid start years in the cached history range (1928-2025, each run for `min(55, 2025 - start_year + 1)` years) found this crashes **6 of 98 windows (~6%)**: start years **1935, 1956, 1957, 1961, 1989, 1999**. These span completely unrelated historical eras (Depression-era, postwar, modern) — this is not scenario-specific, it's a systemic timing-alignment defect that can hit essentially any window depending on incidental numeric detail. (The other 92 windows ran fine; one of those, 1929, correctly produces a *genuine* insolvency result and is not a bug — see the prior handoff for that one.)

## Root cause (traced directly, not inferred — see reproduction steps below)

**The mechanism:** the Social Security optimizer searches a *continuous month range* for the claim decision (`retirement_model_v2/config/model_config.json`: `"claim_min_age_months": 744`, `"claim_max_age_months": 840`) and correctly selects whatever month is financially optimal — which is normally **not** an exact multiple of 12. Traced example: for start year 1935, the optimizer selects a claim at **month 839** (69 years, 11 months) as the winning candidate at the decision point where `current = 828` (age 69). This is legitimate, intended, month-level precision — the whole point of tracking Social Security timing in months rather than whole years.

**Where it breaks:** once claimed, that precise month value (839) is correctly carried forward as `KnownState.ss_claim_age_months`. But `retirement_model_v2/simulation_engine.py:656-657` also derives a "legacy" whole-year field via **lossy floor division**:
```python
ss_claim_age=(
    ss_claim_age_months // 12 if ss_claim_age_months is not None else None
),
```
`839 // 12 = 69`. Then, on the *next* annual iteration, `retirement_model_v2/social_security_state.py:95-107` cross-validates the two representations by **re-expanding the lossy field and asserting exact equality** against the precise one:
```python
known_claim_months = getattr(known_state, "ss_claim_age_months", None)
legacy_claim_months = (
    int(known_state.ss_claim_age) * 12
    if known_state.ss_claim_age is not None
    else None
)
candidates = tuple(v for v in (ss_claim_age_months, known_claim_months, legacy_claim_months) if v is not None)
if candidates and len(set(int(value) for value in candidates)) != 1:
    raise ValueError("Social Security claim-age state fields disagree")
```
`69 * 12 = 828 ≠ 839` → crash. **This equality can only ever hold when the optimizer's selected claim month happens to be an exact multiple of 12** — which is incidental, not something the optimizer is designed to guarantee. The check is asserting a mathematical impossibility as if it were a data-integrity violation.

**Confirmed empirically for all 6 failing years** (traced via a signature-preserving monkeypatch around `SocialSecurityStateBuilder.build`, non-invasive, no source changed):

| Start year | Crash year | Claim month (precise) | `// 12` (legacy) | `legacy * 12` | Disagreement |
|---|---|---|---|---|---|
| 1935 | 1960 | 839 | 69 | 828 | 11 months |
| 1956 | 1981 | 838 | 69 | 828 | 10 months |
| 1957 | 1982 | 839 | 69 | 828 | 11 months |
| 1961 | 1986 | 837 | 69 | 828 | 9 months |
| 1989 | 2014 | 838 | 69 | 828 | 10 months |
| 1999 | 2024 | 839 | 69 | 828 | 11 months |

All 6 land in the 837-839 range (one to three months short of the 840-month/age-70 ceiling) — i.e., all are cases where the optimizer's genuinely optimal claim timing was *very close to* but not exactly at the maximum age boundary. It did **not** crash for windows where the optimal month happened to land on an exact year boundary (744, 756, ..., 840) — which is most of the other 92 windows, essentially by chance of the specific historical return sequence each cohort faced.

## Why the formal M5.1 1971-2025 run didn't catch this

The formal release run (and the M5.1R repair's replacement run) both use start year 1971, whose optimal claim month happened to land on an exact-year boundary (confirmed: it doesn't crash, and reaches "FORCED_CLAIM" at exactly month 840 per the annual output). The bounded oracle tests added for the M5.1R repair also don't happen to exercise a non-12-multiple claim month. This defect was invisible to every test in the current suite and to the one historical window that has ever been formally run — it only surfaces once you sweep other start years, which is exactly why this sweep was worth running.

## What a fix needs to address

This is a design contradiction, not a typo — pick one:
1. **Stop deriving/validating the lossy legacy field at all when the precise field is present.** If `ss_claim_age_months` is available, it should be treated as authoritative and `ss_claim_age` (whole years) should be understood as informational/display-only, never round-tripped for validation.
2. **If the legacy field must be validated, the check must tolerate its known lossiness**: assert `legacy_claim_months <= ss_claim_age_months < legacy_claim_months + 12` (consistent with floor semantics), not exact equality.
3. Either way, decide explicitly whether `KnownState.ss_claim_age` (whole-year) should exist as a field at all, given nothing in the traced path needs whole-year granularity — carrying a field that is *definitionally* unable to round-trip and then asserting that it does is the actual defect, independent of which specific fix is chosen.

## Suggested classification (this project's own `AGENTS.md` §7 taxonomy)

- **Class B — implementation failure.** The specification's evident intent (month-level Social Security claim-timing optimization, consistent with REQ-SS-002/REQ-SS-003 and the DRC-precision requirements referenced in the M5.1 task packet) is sound; the validation code contradicts its own data model.
- **Severity: higher than a typical Class B** — this is a hard crash with zero output, not a wrong-but-computed result. It should block any claim of general release-readiness beyond the single 1971 window until resolved, since "does this window even complete" is a more basic requirement than "is the result correct."
- Affected requirements: REQ-SS-002, REQ-SS-003, REQ-DET-001 (a window either completes deterministically or it doesn't — right now completion itself is start-year-dependent in a way nothing documents), REQ-RELEASE-001.
- Per `AGENTS.md` §8, this is at least **R3 — Critical** (Social Security mathematics / numerical identity).

## Evidence trail

- Sweep script (informal, not in the project tree): iterated `start_year` from 1928 to 2025, `years = min(55, 2025 - start_year + 1)`, using a fresh `ModularRetirementModel` per window (sharing only the read-only `config`/`repository` objects) to avoid an unrelated diagnostics-accumulation issue described below. 98 windows, ~18 minutes total.
- Root-cause trace: a signature-preserving monkeypatch of `SocialSecurityStateBuilder.build` that logs the three candidate values before delegating to the original method — no source file was modified on disk.
- Crash reproduction via the unmodified production CLI: `python -m retirement_model_v2.run_simulation --start-year 1935 --years 55 --acknowledge-reviewed --output <scratch path>`.
- All `file:line` citations above were read directly from `C:\Investment calculator\Financial_Projection_V2_1_2_M5_PASS\retirement_model_v2\` as of 2026-09-07.

## Separate, smaller finding from the same sweep (not a crash, worth knowing)

`ModularRetirementModel.run_window()` does not reset `self.diagnostics` between calls on the same instance — the `DiagnosticSuite`/`DiagnosticsReport` is constructed once in `__init__` (`simulation_engine.py:109`) and never replaced or cleared inside `run_window`. Calling `run_window()` twice on one instance silently accumulates error/warning counts and issues from the first call into the second call's reported diagnostics, rather than each call reporting independently. This does **not** affect any delivered evidence — `run_simulation.py` always constructs exactly one model per process and calls `run_window` exactly once — but it's a footgun for any future code (including automated sweeps like this one) that reuses a model instance across windows expecting independent per-window diagnostics. Worth either resetting `self.diagnostics` at the top of `run_window`, or documenting that a model instance is single-use.

# Handoff to Codex: reserve emergency-access lockup bug

**From:** Claude (Sonnet, mechanical verification + Opus subagent, root-cause investigation), Cowork session on `C:\Investment calculator\`
**Date:** 2026-09-06 UTC
**Status:** Investigation only. No source, test, ledger, or spec file has been changed. This was found during an informal, off-ledger smoke test explicitly *not* run as the formal M5.1 event — nothing here has been adopted into `V2_1_2_TASK_LEDGER.md`. That adoption/repair decision is the owner's, to route to whichever agent (Codex/GPT-5.6 Sol per `AGENTS.md` §8) does the actual repair under the project's normal process.

## Plain-English summary

The withdrawal engine has an "emergency" override that's supposed to let a retiree tap their T-bill reserve once every other account is empty and cash is genuinely short. The override can never fire, because the test for "are we in an emergency" adds the T-bill balance itself into the pile of money being checked. Once VOO/SCHD/Roth are exhausted, the T-bill balance *is* the whole portfolio — which makes the portfolio look "big enough," which keeps the emergency flag `false`, which keeps T-bills locked, forever, regardless of how large the reserve is. The retiree can be sitting on a six-figure T-bill balance and the engine will still report `WITHDRAWAL_INFEASIBLE` / `NEGATIVE_CASH` and mark the run "Invalid."

This was caught with an informal historical stress run starting in **1929** (55 years, 1929–1983 — age 45 to 99). It did not show up in the 1971–2025 or 2005–2025 smoke tests because those cohorts never fully exhausted VOO/SCHD before the run ended. It **will** matter for the eventual formal M5.1 1971–2025 run if any sub-scenario/sensitivity path exhausts the equity sleeves — and it's directly in the withdrawal/reserve code path M5.1 depends on.

## Root cause (verified against source, not just the decision log)

**File:** `retirement_model_v2/simulation_engine.py:310`
```python
emergency = portfolio.total + cash_income["total"] < lifestyle_nominal + base_tax
```
**File:** `retirement_model_v2/model_types.py:61-62`
```python
def total(self) -> float:
    return self.voo.value + self.schd.value + self.tbills.value + self.roth.value
```
`portfolio.total` includes `tbills`. The predicate is therefore gating T-bill access using a sum that already contains the T-bills being gated. Once `voo`/`schd`/`roth` are 0, `portfolio.total == tbills.value`, so a *larger* remaining reserve makes `emergency` *less* likely to trip — the opposite of the intended behavior.

Confirmed empirically from `smoke_1929_55.decisions.jsonl` (informal run, not part of the ledger): `emergency` was `false` in all 55 years of the 1929 window, including years where the engine simultaneously reported total funding failure while $250K+ real sat in T-bills.

**Downstream propagation**, all confirmed by direct file read:
1. `reserve_manager.py:91-97` — `draw_share` is computed from `normal_draw_fraction` (0.0 in `config/model_config.json`) plus a countercyclical drawdown term. On calm/at-peak equity markets this is 0 regardless of cash desperation.
2. `reserve_manager.py:109-115` — the *only* way to bypass the countercyclical `draw_share` gate and unlock the "protected final months" of reserve is `emergency=True`. Since `emergency` (from step 1 above) is structurally unreachable once T-bills is the only sleeve left, this bypass never fires.
3. `simulation_engine.py:317-321` and `:676` — the reserve manager's (near-zero) recommended draw becomes `maximum["tbills"]` in `_withdrawal_bounds`.
4. `lifetime_tax_optimizer.py:68-71` — a source is excluded from `active` candidates entirely if its upper bound is 0. With `maximum["tbills"] == 0`, T-bills silently drops out of consideration.
5. `lifetime_tax_optimizer.py:_allocate` (`:253-262`) — when the required cash exceeds what's fundable under current bounds, the function returns an **all-zero** allocation dict (`{source: 0.0 for source in SOURCES}`) rather than the largest fundable partial draw. This is why `from_tbills` reads `0.00` even in years where T-bills *was* selected as the intended source (confirmed: the 1962 decision-log record shows `"weights": {"tbills": 1.0}` with a nonzero-but-insufficient bound, yet the executed withdrawal reports 0 across the board) — so the reported shortfall in diagnostics is inflated to the full gross requirement, not the true unfunded residual.

**`REFILL_APPROVED_WITHOUT_CAPACITY` is a separate, benign, correctly-labeled diagnostic** (`reserve_manager.py:179-188`, `diagnostics.py:202-217`) — it just reports when the refill *score* gate passes but *capacity* is 0, and never books a refill in that case. It contributes 0 of the 60 diagnostic errors in the 1929 test run and should be expected to disappear once the primary bug is fixed (capacity is 0 in those years only because VOO/SCHD/Roth are already exhausted, which is itself downstream of the lockup).

## What a fix needs to address

1. **`simulation_engine.py:310`** — the emergency predicate must test funds reachable *under the current withdrawal bounds* (i.e., non-T-bill sleeves + cash income + whatever T-bill draw would actually be authorized), not `portfolio.total`, which includes the very sleeve the predicate is deciding whether to unlock. As written, the term being gated is an input to its own gate.
2. **`lifetime_tax_optimizer.py:253-262`** (and the caller at `simulation_engine.py:337`) — on infeasibility, preserve/execute the largest fundable partial allocation instead of discarding all progress to an all-zero result. This affects both the actual cash delivered to the retiree in a shortfall year and the accuracy of the diagnostic shortfall amount reported.
3. **Worth flagging separately (secondary, spec-level, not required to fix the above):** `equity_drawdown` (`simulation_engine.py:288-290`) is derived purely from the S&P index level, independent of what the retiree's own holdings look like. Once `voo`/`schd` are fully sold, the drawdown signal can read "market is calm" even while the retiree's own portfolio is in genuine distress, which further contributes to the countercyclical unlock never re-arming. `V2_1_2_TECHNICAL_SPEC.md` doesn't currently define an emergency trigger independent of this signal — worth a spec addendum (§1.1 is where the drawdown/reserve requirements currently live) so the fix has an explicit authority to implement against, per `AGENTS.md` §1's "new financial meaning must be recorded in the applicable control document before consequential implementation" rule.

## Suggested classification (using this project's own `AGENTS.md` §7 taxonomy)

- **Class B — implementation failure.** The specification's stated intent for the emergency path ("genuine cash emergency permits use of the protected final months," `reserve_manager.py:115`; REQ-CASH-001 annual reconciliation; REQ-WD-001 source-bound respect) is coherent — the code just doesn't implement it correctly. This is not a spec gap (Class A): the fix is a code change to the emergency predicate and the allocator's infeasibility handling, not a new authoritative decision.
- Affected requirements/invariants (per `V2_1_2_VALIDATION_MATRIX.md`): REQ-CASH-001, REQ-WD-001, REQ-RES-001.
- Affected gates/dependents: this sits in the shared withdrawal/reserve path used by every historical window, including the still-`PENDING` **M5.1 Controlled 1971–2025 Run** — recommend resolving or explicitly risk-accepting this before M5.1 is activated, since a formal release run should not depend on code with a confirmed Class B defect in its withdrawal engine.

If you (Codex) pick this up as a real task, per `AGENTS.md` §8 this is at least **R3 — Critical** (financial mathematics / numerical identity), and per §7 it needs its own `FAIL-<TASK-ID>-NNN` record with classification basis, root-cause status `CONFIRMED` (evidence above), scope boundary, and the standard two-attempt repair/validation cycle before any checkpoint can claim `PASS`.

## Confirmed to reproduce across unrelated market regimes, not a 1929-only fluke

A follow-up batch of 5 more informal windows (1928/55, 1937/55, 1946/55, 1966/55, 2000/25) was run to see how often this surfaces. Four came back clean (only the expected, already-audited `SS_DECISION_SENSITIVE`/`SS_SENSITIVITY_FLIP` warnings). **1966/55 reproduced the identical bug**: `WITHDRAWAL_INFEASIBLE` / `NEGATIVE_CASH` in 2018–2020 (ages 97–99), T-bills sitting at ~$187K–$205K essentially untouched while SCHD is drained to near-zero, `diagnostics.passed: false`, effectiveness "Invalid" (46.71).

1966 is a completely different failure mechanism than 1929 — it's the classic postwar stagflation "worst historical sequence-of-returns cohort" from retirement-planning literature, not a single depression-era crash. The fact that two unrelated adverse regimes both trip the exact same `simulation_engine.py:310` predicate once equity sleeves are exhausted late in a run indicates this is a systemic defect in the withdrawal/reserve path, not an edge case specific to one historical window. It should be treated as a blocker for M5.1, not a low-priority curiosity.

## Two cheap independent checks that came back clean (context, not a bug report)

While investigating, two additional cheap checks were run for general confidence, unrelated to the reserve-lockup bug itself:

1. **Cash-conservation / structural-invariant audit** across all 8 informal runs collected so far (330+ year-rows): independently re-derived `sources == uses` from each year's raw `cash_ledger` fields, plus balance-sum reconciliation, tax nominal/real consistency, and no-negative-balance checks. Zero violations anywhere, including in the two runs that hit the reserve-lockup bug — confirming that bug corrupts the *decision*, not the *bookkeeping*.
2. **Determinism check**: reran the 1971 and 1929 windows a second time each and diffed the result JSON and full decision-log JSONL line-by-line. Every financial figure, decision, and diagnostic issue was byte-identical between runs. The only differing fields anywhere were `diagnostics.timings_ms` and each decision-log line's `timestamp_utc` — both wall-clock instrumentation that's supposed to vary. REQ-DET-001 holds.

**Minor trap worth knowing about:** those two fields live inside otherwise-deterministic output. If a future test asserts whole-object equality between two runs of the same window (a natural way to write a reproducibility check) without excluding `timings_ms`/`timestamp_utc` first, it will spuriously fail even though the model is behaving correctly. Worth excluding those fields explicitly in any determinism test added later.

## Evidence trail

- Informal runs: `python -m retirement_model_v2.run_simulation --start-year <Y> --years <N> --acknowledge-reviewed --output <scratch path>` for (1929,55), (1928,55), (1937,55), (1946,55), (1966,55), (2000,25) — none in the project tree; none are the formal M5.1 event.
- Result JSON and decision logs (`*.decisions.jsonl`) from these runs are in local scratch, not committed anywhere in the project tree — regenerate with the command above if you need to re-inspect them directly; they are not preserved as project evidence since this was explicitly informal testing.
- All `file:line` citations above were independently re-read and confirmed against the actual source in `C:\Investment calculator\Financial_Projection_V2_1_2_M4_8_PASS\retirement_model_v2\` as of 2026-09-06, not taken solely from the investigating subagent's report.

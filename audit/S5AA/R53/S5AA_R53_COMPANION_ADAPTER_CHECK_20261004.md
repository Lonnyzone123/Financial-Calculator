# S5AA R53: the companion adapter, checked

*Written by Claude (the coordinator), 2026-10-04, Arizona time (UTC−7).*

## Why there is an adapter

The owner's decision 3 (2026-10-04): an end age before the retirement age is refused everywhere. The validator raises
`END_AGE_BEFORE_RETIREMENT`, the engine raises `SCENARIO_END_AGE_BEFORE_RETIREMENT`, and the app refuses the import.

The auditor's companion scripts often entered "still working when the plan ends" that way, for example age 40, retirement 45, end 42.
At the R53 head, without help:

- the R51F probes pass 29 of 36: F06, F07, F19, F20, F21, F23 and F33 are refused;
- the R46–R51 simulations pass 13 of 20: S01, S02, S05–S08 and S20 are refused;
- the R52 boundary script stops at E01's validity assertion.

The owner was shown this, kept the refusal, and asked for an adapter so that the scripts can be rerun **unedited**. The adapter
is `audit/S5AA/R53/S5AA_R53_COMPANION_ADAPTER.js`, a `node -r` preload. Each such plan goes in the way the owner decided it may be
entered: the retirement age set to the end age, so every row still works in full. A spouse whose retirement date followed
`profile.retireAge` keeps that date as `profile.spouseRetireAge`.

```
node -r ./audit/S5AA/R53/S5AA_R53_COMPANION_ADAPTER.js <companion script> <root> <output>
```

The adapter reaches the engine as required (`runPlan`, `simulatePlan`, `runScenario`), the validator (`validateScenario`) and every
engine variant from `loadEngineVariant()`. It does **not** reach the app, on purpose: the R52 script's U01 imports exactly such a
plan, and refusing that import is the decision itself.

It rewrites each plan in place for the call and restores it afterwards. So a script that checks its input is not mutated (F20) still
sees its own object, and anything else the call does to that object stays visible.

## What was measured

Each script was run three ways. The verdicts were compared check by check: case, label, actual, expected and pass, plus each case's
error and the UI results. The comparator is `witness_runs/adapter/r53_verdicts.js`, and its output is
`witness_runs/adapter/r53_verdict_comparisons.txt`.

| Script | Calls rewritten | Without vs with the adapter, at `87bddba` (item 2, before the refusal) | With the adapter: `87bddba` vs the R53 head |
|---|---|---|---|
| R51F full-model probes | 19 | 175 of 175 identical | 175 of 175 identical |
| R52 boundary simulations | 33 (32 at the head) | 112 of 112 identical | 111 of 111 identical, U01 excluded |
| R46–R51 simulations | 20 | 176 of 176 identical | 176 of 176 identical |

- **The first column shows the adapter is output-neutral for these exact scripts.** At `87bddba` both ways of entering the plan are
  accepted, and every verdict is the same either way.
- **The second column shows the refusal is the only change between item 2 and the head**, as far as these scripts can see.
- **With the adapter at the head:** R51F passes 36 of 36 and R46–R51 passes 20 of 20. In the R52 script, the 20 boundary cases pass
  and U02 passes. H01 fails as it did before R53; the auditor classified it as the disclosed year-end Roth aggregation limit, not a
  finding. U01 is described next.
- **U01 at the head:** the app refuses the import and names the reason:

  > That backup was not restored because it contains a structural problem that would break the projection. Scenario 1: endAge (41)
  > is before retireAge (60): the plan must run at least to the retirement age. Your current scenarios were left unchanged.

  The script then reads the unchanged default scenario (end age 100), so it reports `pass: false`. That is the outcome the owner
  decided. U01's `valid: true` comes from the adapter rewriting the script's own validator call; without the adapter, the validator
  refuses the plan.
- **The one call fewer in the R52 script at the head** is U01's recheck. That recheck runs the scenario read back from the app; at
  `87bddba` that scenario still ended before retirement, and at the head it is the unchanged default scenario.

## Records

`witness_runs/adapter/`:

- `comp_i2/` and `comp_head/`: the scripts without the adapter, at `87bddba` and at the head;
- `adapt_i2/` and `adapt_head/`: the same scripts with the adapter;
- `*.log.jsonl`: every rewritten call, with the ages as entered;
- `*.err`: each run's adapter summary.

## For future probes

A household still working when the plan ends is entered with the retirement age equal to the end age. Measured on 238 test plans
and on these three scripts, that gives the same projection as the old entry did.

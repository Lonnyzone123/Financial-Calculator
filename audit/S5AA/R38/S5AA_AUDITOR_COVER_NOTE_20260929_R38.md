# Cover note — S5AA R38, vesting at separation, vesting at 65, and the default filing status

*Drafted by Claude for the owner to send. Nothing here has been sent.*

---

Hello,

Thank you for the R33–R37 change audit. **R38 repairs your R35-01** and makes two related changes the owner decided. It needs its own
change audit.

**Please audit the R38 change** from `main` at `80dd944` (R33–R37 and your report, #25) to **`s5aa-r38-source`** (`678c556`).

| where | what |
|---|---|
| tag `s5aa-r38-source` (`678c556`) | the source to audit |
| `audit/S5AA/R38/S5AA_R38_CHANGE_AUDIT_HANDOVER_20260929.md` | each change, the evidence, what moved, known limits |
| `audit/S5AA/R38/S5AA_R38_SELF_AUDIT_20260929.md` | Claude's check of the round |

**What changed:**
- **R35-01** (`be30de3`): the forfeiture at separation now runs after the row's own deferrals and match. Your witness now gives 3,600,
  8,400 and 12,600.
- **Full vesting at normal retirement age** (`cc3217f`), under IRC 411(a) and (a)(8): employer money is nonforfeitable at a separation
  at 65 or later. The plan's own normal retirement age is not an input and is taken as 65.
- **A new plan files single** (`678c556`). It filed jointly with no spouse. The tests' copy of the default plan keeps the joint return
  its corpus was written on, as it already keeps its own starting age. So the control, the golden fixtures and the expanded corpus do
  not move: the output and input hashes equal R37's.

**Before you run your own repros:** a plan built from the app's `defaultPlan` now files single, while `extractDefaultPlan()` in
`tests/lib/golden-scenario-defs.js` still gives `mfj` (and age 29.5).

Please number findings **R38-NN** and publish them in the usual report-only pull request, on a branch named like
`audit/chatgpt/r38-678c556`. This repository is public: please call me "the owner", and include no name, email address or personal
path.

Thank you,
the owner

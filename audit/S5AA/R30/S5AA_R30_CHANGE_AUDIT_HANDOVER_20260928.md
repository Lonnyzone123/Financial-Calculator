# S5AA R30 — change audit handover: R29-01, R29-02, and the decisions beside them

*Written by Claude, 2026-09-28 (local, UTC−7), for the owner to send to ChatGPT. Every figure was measured on Windows 11 /
Node 24.17.0 at the commits named.*

## 1. What to audit

- **The change:** from `main` at `df8f8b4` (your R29 report merged) to **`s5aa-r30-source`** at **`66c406c`**.
- **Three R30 commits**, each test-first and each its own task: `c9f6556`, `bf4d3d8`, `66c406c`.
- **One more commit sits between `df8f8b4` and them:** `03341c5`, eb's placement of R29 in `MODEL_ASSUMPTIONS.md`,
  `FEATURES.md` and `SPRINT_QUESTIONS.md`. It is documentation only and eb's own. It landed on this branch because the
  sessions share a working folder. Every R30 gate ran with it in place.
- **Please number findings R30-NN** and publish them in the usual report-only pull request, on a branch like
  `audit/chatgpt/r30-66c406c`, under `audit/S5AA/R30/`.

## 2. Your findings and the owner's decisions

| finding | what you found | decision (the owner, 2026-09-28) | commit |
|---|---|---|---|
| **R29-01** (P1) | A late transfer capped to $0 still left the source's dividend base: $3,750 of dividends where $5,000 is right. | "Repair in R30" | `66c406c` |
| **R29-02** (P1) | A qualified HSA funding distribution never used up IRA basis: AGI $29,000 where $31,000 is right. | "Repair in R30" | `bf4d3d8` |
| RMD note (not numbered) | A pre-tax transfer into another person's HSA got no RMD credit. | "Research, then repair in R30" | `c9f6556` |

The owner decided three more cases, found while repairing R29-01:

| case | decision | commit |
|---|---|---|
| **Found in passing (from R28.1):** a late transfer out of an IRA, HSA or Roth IRA into taxable paid the destination's dividends for the rest of the year out of the source, before the move. $50,000 of a $100,000 IRA at 60.75 left the IRA with $48,750. | "Repair in R30" | `66c406c` |
| **The mirror:** an early transfer that emptied a taxable account into an IRA, Roth IRA or HSA had the source's dividends before the date paid by the destination. All of a $50,000 taxable account moved into a traditional IRA at 60.25 left the IRA $1,250 short. | "Repair in R30" | `66c406c` |
| **The case the preview could not see:** a late transfer's source spent by the year's own spending draw, which comes first. | "Protect the transfer" | `66c406c` |

## 3. The rules, as built

### 3.1 RMD credit (`c9f6556`)

**The sources:**
- 26 CFR 1.408-8(g)(1): "all amounts distributed from an IRA are taken into account in determining whether section
  401(a)(9) is satisfied, regardless of whether the amount is includible in income".
- 26 CFR 1.401(a)(9)-5(g)(2)(i) says the same of an employer plan's individual account.

**As built:** `transferCountsTowardRmd(f, t)` is a pre-tax source into a taxable account (credited since R15) or into an
HSA. That covers a distribution then a contribution, and a qualified HSA funding distribution, which is excluded from
income but is still distributed.

**Unchanged:**
- Rollovers and conversions still stay above the reserve.
- A transfer dated after the year's draw is still neither held to the requirement nor credited toward it (R28.1).

**This removes a known limit from R29's handover** ("A funding distribution does not count toward the year's RMD").

### 3.2 Funding and basis (`bf4d3d8`)

**The sources:**
- IRC 408(d)(9)(A) excludes the funding "to the extent such distribution is otherwise includible".
- 408(d)(9)(E) treats the amount distributed as includible up to what a distribution of all the owner's IRAs would
  include.
- Notice 2008-51 applies this to the basis left behind. It says "the individual's basis in the excess amount ... does not
  carry over to the HSA". Its example: $200 of basis in a $2,000 IRA, $1,500 funded, and $200 of basis stays on $500.

**As built:** `settleIraYear()` takes the year's funding (`qhfd`). Like a QCD, the funding is not a Form 8606
distribution, and it counts in the total that would be includible. Its part within the taxable value spends no basis;
the rest spends basis dollar for dollar. The year's draws and conversions are then priced on the basis left.

A QCD in the same year is taken from the taxable value first. That order is the engine's; neither source orders the two.
`runTransfer()` tallies the funding and takes the basis it uses off at once, so a later draw in the same row is priced
on what is left.

### 3.3 Dividends follow what moves (`66c406c`)

- **One answer to "what may this transfer move":**
  - `transferAllowed()` gives nothing for a refused conversion, a refused move into a 401(k), or the same account on
    both sides.
  - It gives the room for a contribution (`transferRoom()`, R29's calculation, moved).
  - `runTransfer()` and the late preview both ask it.
- **A late transfer's destination is paid after the move, on what moved:**
  - The dividend base, figured before the draw, no longer includes the destination's share.
  - After the transfer, that share is figured on what moved, valued as the destination holds it, and paid from it.
  - Its cash arrives after the year's draw, so it is surplus, as outside income left over after spending is. It helps
    fund the year's tax, and is kept or spent under the dividends policy.
- **Each account pays its own dividends.** Before the draw, a taxable source moves only what its dividends leave.
  - The engine's dividend convention: yield × the dollars an account holds when the base is figured × the part of the
    year it holds them. A paid dividend does not shrink the base it was figured on; a $50,000 account at 10% pays
    $5,000 in a year.
  - A source holding B and moving m, with yield y over a paid span P of which b falls before the date, pays
    y((B − m)P + mb). So m ≤ B(1 − yP)/(1 − yP + yb).
  - The destination never pays the source's share.
- **Protect the transfer:**
  - A transfer dated after the draw holds its source's dollars only when the source is a taxable account whose dividends
    are figured on them. That is dividends on, a positive yield, and an eligible account.
  - It holds what `transferAllowed()` allows, at most what the source can hand over after its own dividends. The source
    pays y(BP − ha), where a is the paid part after the date, so h ≤ B(1 − yP)/(1 − ya).
  - The year's spending draw leaves those dollars (`withdrawFromAccountList()`'s `heldBack`).
  - Any other source has nothing figured on its dollars before the draw, so the draw sees it as it stands (R28.1). That
    is a Roth, pre-tax or HSA account, or a taxable account with no dividend. The owner's question was about the taxable
    case, and holding back a Roth IRA's dollars would have left a household that had the money $95,000 short in R28.1's
    own test. The owner confirmed this scope on 2026-09-28, over protecting every late transfer or every taxable one.

## 4. Evidence

**New tests.** 21 tests in 4 files, test-first, with hand arithmetic in each file's header or tests:

| file | tests |
|---|---|
| `tests/audit-s5aa-r30-transfer-to-hsa-counts-toward-rmd.test.js` | 5 |
| `tests/audit-s5aa-r30-hsa-funding-uses-ira-basis.test.js` | 4 |
| `tests/audit-s5aa-r30-hsa-funding-settlement.test.js` | 1 |
| `tests/audit-s5aa-r30-transfer-dividends-follow-the-move.test.js` | 11 |

**Your witnesses:**
- R29-01: $5,000 of dividends, $55,000 AGI, $4,792.50 tax, $195,207.50 net worth. The reinvested variant is taxed on
  $5,000.
- R29-02: AGI $31,000, tax $4,207.50, net worth $181,722. Your no-funding control is unchanged.
- Your repro script, run against `66c406c`: **0 mismatching witnesses**, and all seven controls pass.
- The settlement test holds the Notice's own example ($200 of basis stays on $500).

**Coverage you asked for on R29-01:**
- A zero move equals no transfer for every cause: no room, an empty source, a 401(k) refusal, an unlawful conversion.
  Each is checked paid and reinvested, monthly and quarterly.
- A partial-room hand ledger. $3,000 moves. The source's dividends are $4,925. The moved dollars realise a $327.79 loss:
  the paid dividends left $45,075 still holding $50,000 of basis.

**The settlement test is its own file** because it calls `settleIraYear()` directly. While it shared a file with the
plans, R29-02 was guarded only by an implementation-coupled file, and closeout refused `COUPLED-ONLY-R29-02`.

**Re-fixtured by intent:**
- `tests/audit-s5aa-r29-held-dollars-prototype-ids.test.js`: your test-gap note. The late taxable-source case asserted
  $22,500 under redirect with no compensation, where nothing can move. It now sends $200,000 of $300,000 under warn
  ($25,000), and a new control holds the redirect case at $30,000, $0 moved.
- `tests/audit-s5aa-r28-transfer-dividends-by-holder.test.js`: its taxable source sent all $300,000, and the Roth IRA
  paid the source's $15,000. That is the mirror leak. The source now holds $400,000 ($25,000), and the whole-balance case
  is in the new file ($48,648.65 moves in the $50,000 version).

**Gate at `66c406c`:** GATE PASSED, 2,947 tests, 2,938 passing, 0 failing, 9 authorised todo. Closeout accepted 12,
refused 0.

**The control (4.7):** nothing to declare. `tools/control-candidate-prediction.json` is unchanged.

**The expanded corpus at `66c406c`:**
- **70 plans, output hash `5a67d57e35136788bba4d96f4f24dcb721fbf4f70ab7fc3077021d7c6d122766`.** That is the hash you
  recorded at `aaff3f1`: R30 moves no corpus figure. As your report noted, every enabled corpus transfer is at a year's
  opening.
- Against `tools/baseline-20260926-s5aa-expanded-r17.json`: R29's 3 members and 33 fields, unchanged.
- The corpus invariant passes all 7 checks.

**Self-audit sweeps:**
- `audit/S5AA/R30/S5AA_R30_SELF_AUDIT_DIVIDEND_SWEEP.js`: 552 plans and 1,320 checks against expectations written from
  the rules above. **0 problems at `66c406c`; 344 at `bf4d3d8`**: 224 zero-move, 48 source-keeps, 48 destination-keeps,
  24 protected.
- R29's transfer sweep at `66c406c`: 1,512 plans, 4,476 checks, 0 problems.

## 5. Contracts

- `withdrawFromAccountList()` and `withdrawFromClass()` take an optional last argument, `heldBack`: account id → dollars
  to leave. Existing callers are unchanged.
- `settleIraYear()` reads an optional `qhfd` and returns `qhfdBasisUsed`. The row's IRA flow tally gains `qhfd`.
- New engine export, in the Worker's function list: `transferCountsTowardRmd`.

## 6. Known limits

- **A late destination's dividend cash is surplus, not spending money.** It arrives after the draw. A transfer just
  before the draw point pays the destination before the draw, and that cash funds spending. Just after, it is kept or
  spent under the dividends policy. That is the order events happen in the year, but it is a step at the draw point.
- **The protection is only for dividend-paying taxable sources** (§3.3). For a pre-tax source dated after the draw, the
  year's RMD, QCD and conversion come first and can leave less to move. Nothing is figured on those dollars, so no figure
  disagrees.
- **Under the engine's convention, the dollars a taxable source keeps back to pay its dividends earn for the rest of the
  year.** So a whole-balance move is B(1 − yP)/(1 − yP + yb), $48,648.65 of $50,000, not the $48,750 a day-by-day ledger
  would give. That is the same convention that pays a full year on a balance paying out through it.
- **A QCD and a funding distribution in the same year** take taxable value in that order.
- **R29's §6 limits stand:**
  - HSA eligibility, including Medicare (the RMD tests fund an HSA at 80, as R29's did);
  - custom accounts' limits;
  - Roth ordering and five-year rules;
  - warn's treatment of the excess;
  - no newly registered expanded baseline.
  - The one limit removed is the RMD credit.

## 7. Where I would look first

1. The protection's fixed point h ≤ B(1 − yP)/(1 − ya), with nonzero returns and a reinvest-then-pay year. Does the
   source always hold exactly h at the date?
2. The late destination's surplus cash through the tax quote and the surplus policy. Does the household identity hold
   when the destination pays and the year also has an RMD surplus?
3. The funding basis with a spouse's IRA, and in a year with conversions as well.
4. Any path into `withdrawFromAccountList()` other than the spending draw that should, or should not, see `heldBack`.

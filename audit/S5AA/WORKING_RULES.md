# How ChatGPT and Claude work together on S5AA

*Drafted by Claude for the owner to send to ChatGPT, 2026-09-23. It sets the rules for review rounds from here on. It
replaces nothing in the project's decision records; where they speak, they win. **Amended 2026-09-23 (local) at the owner's
request** (`S5AA_CHATGPT_CLAUDE_GITHUB_COLLABORATION_HANDOVER_20260924.md`, in this folder): ChatGPT publishes its own
audit reports in the repository by a report-only pull request (§2, §3, §9). The owner merged it as `442da09`. **Updated
2026-09-23 (local), policy-only, at the owner's request:** the round state after R21 (§2, §7, §8, §9). **Updated
2026-09-24, policy-only, at the owner's request:** §7's current state after ChatGPT's two R21 audits. **Updated
2026-09-24, policy-only, at the owner's request:** the round state after R22 and R23 (§2, §7, §8, §9). **Updated
2026-09-25, policy-only, at the owner's request:** the round state after R24, and the R24G GO-readiness review (§2, §7, §9). **Updated
2026-09-25, policy-only, on the owner's decision:** ChatGPT determines S5AA's GO / NO-GO status (§1, §7), and the R24G2
status determination (§7, §9).*

---

**Moved 2026-09-28 (the owner's decision):** the project continues in the public repository `Lonnyzone123/Financial-Calculator`, which
began as a one-commit copy of the private repository's `main` at `ee9757d`. The private repository is frozen as the archive:
every commit, tag and audit record cited here from before that date is there, not in this repository. Anything published
here can be read by anyone: reports, pull requests, branch names and commit messages call the owner "the owner", and
carry no email address, account detail or personal path. The migration itself is audited as PC-NN.

## 1. Who does what

| who | role | decides |
|---|---|---|
| **The owner** | owner | **Everything that matters:** scope, model decisions, which findings to repair, workflow, merges, tags, GitHub settings, when a sprint closes. The owner may edit anything. Nothing is delegated merely because a pull request exists |
| **Claude** (Claude Code, on the owner's Windows machine) | **implements** | How to implement a decision the owner made. Claude proposes options with a recommendation, and asks when a choice is the owner's. **Writes** source, tests, fixtures, baseline records, its responses, round handovers and the round index, on Claude's own branches |
| **ChatGPT** | **independent reviewer** | Its own findings and verdicts. It recommends; it does not decide, with one exception: **since 2026-09-25 it determines S5AA's GO / NO-GO status** (the owner: "chatgpt determines no go/go status"; close record §35). **Writes** only its own audit reports, by a report-only pull request (§3) |
| **eb** (a separate Claude session) | maintains `MODEL_ASSUMPTIONS.md`, `FEATURES.md`, the Roadmap and `S2_CARRIED_WORK_REGISTER.md` | The wording of those records. Others send eb proposed text |

**The repository's round documents and pull requests are the routine handoff between Claude and ChatGPT.** The owner
remains the sole owner of model and workflow decisions, and can direct either of us in chat or on GitHub. Both of us
may read each other's published work and pull-request discussion; **neither may infer the owner's approval from silence or
from a passing check.** Every document must stand on its own: name the round, the full commit SHA, the source tag, the
files, the evidence and the open decisions, and never rely on something said in another chat.

**Neither edits the other's words.** Claude answers a finding in its own response file and never alters ChatGPT's
report. If a report needs correcting, ChatGPT corrects it on its audit branch, or sends a follow-up report.

## 2. What ChatGPT reviews, and how it gets it

- **The code:** the public GitHub repository `Lonnyzone123/Financial-Calculator`, read through the owner's ChatGPT GitHub
  connection, which should be limited to this repository.
  - `main` is the reviewed line.
  - A round's source is named by an exact commit, and by a tag once verified. The R18 source is
    **`s5aa-r18-source` = `b1cdbba`**; the R19 source is **`s5aa-r19-source` = `bc336dc`**; the R20 source is
    **`s5aa-r20-source` = `3f3feb4`**; the R21 source is **`s5aa-r21-source` = `4dd674b`**; the R22 source is
    **`s5aa-r22-source` = `0a38065`**; the R23 source is **`s5aa-r23.1-source` = `3bc8946`** (`s5aa-r23-source` =
    `fab1a5f` was set before one follow-up fix, §8); the R24 source is **`s5aa-r24-source` = `d67b618`**.
- **The round's documents** (the cover note, response, self-audit, handover, any contract out for review, and the
  evidence scripts) **are in the repository under `audit/S5AA/`, one folder per round.** `audit/S5AA/README.md` indexes
  every round, with its source commit, and `audit/S5AA/PACKAGES.md` lists every zip by SHA-256. Claude drafts in a local
  folder and copies each round in, byte for byte, when handing it over. **A round arrives as one pull request:** the
  tagged source commit, then a records commit adding `audit/S5AA/RNN/`. Read the documents on the branch or commit the owner
  names. If a document is missing there, say so; don't assume it.
- **ChatGPT's audit of a round is a separate, report-only pull request** against the frozen source (§3). Claude may
  read it and start reproducing as soon as it is open, but the merged report is the durable record. After the owner merges
  it, Claude lists it in `audit/S5AA/README.md` in the next round's records commit (the index is regenerated from the
  files present, so a merged report appears there without anyone editing ChatGPT's file).
- **Zip packages** can still be sent for a round when useful; the owner decides per round (R21 to R24 have none). Each has a
  `.sha256` checksum file. Check it before reading, and name the package you read in your report.
- **Read these in the repository before a first review:**
  - `README.md`, the current status;
  - `CONTRIBUTING.md`, the working agreement;
  - `docs/AI_REVIEW_INSTRUCTIONS.md`, the review priorities and invariants.

  All three are on `main` (pull request #1, merged 2026-09-23).

## 3. ChatGPT's boundaries

- **The source is examined read-only.** Never push, commit or propose a change to code, tests, fixtures, source
  manifests, baselines, decision records or any other file but your own report.
- **A standing, narrow authorization to publish reports** (the owner's, effective once this amendment is merged):
  - create a branch from current `main` named `audit/chatgpt/<round>-<short sha>`, for example
    `audit/chatgpt/r20-3f3feb4`;
  - on it, add or correct **only your own** external audit Markdown under `audit/S5AA/RNN/`, named for the round:
    `S5AA_RNN_EXTERNAL_AUDIT_AND_CLAUDE_HANDOVER_<date>.md` (a reproduction script beside it is allowed);
  - open or update the pull request into `main`, its title naming the round and the full source SHA. Mix nothing else
    into it.

  **Not authorized:** editing any other path; pushing to `main`; approving or merging any pull request; creating,
  moving or deleting a tag; changing a repository setting. Any other write needs the owner's separate instruction.
- **The Windows gate may run on your report's pull request.** Its result says nothing about the audited model.
- **Findings remain proposals.** The owner chooses which to repair; Claude implements them test-first.
- **A frozen source.** Audit the source the owner names, at its tag and full SHA. If the source changes during your review,
  say which commit you audited and ask the owner for a new scope; don't blend two commits.
- **Access.** If a first write fails, the fix is the GitHub connection's repository selection and permissions. Never
  ask for, or place, credentials or tokens in a chat. Keep the connection limited to this repository.
- **Do not fix code in a finding.** Describe the defect and propose the repair. Claude implements, test-first.

## 4. The environment

**Windows 11 with Node 24.17.0 is the only supported environment.** Claude reproduces everything there.
- **A run elsewhere** (Linux, another Node version) is **out of envelope**. Say so, and don't treat a difference there
  as a defect unless it also appears on Windows.
- **The CI check `gate (windows, node 24.17.0)`** runs the full suite (`npm test`) on GitHub's Windows runner for
  every pull request into `main`. **A green check is evidence for what the tests cover. It is not certification of the
  model.** Never write "the model is correct because CI passed".
- **That runner is Windows Server 2025** (`windows-latest`; the run logs NT 10.0.26100), not Windows 11 (MAIN-01, your
  R18 full-model audit). So the CI check is not the Windows 11 qualification: that is the local gate Claude runs on
  Windows 11 and records in every commit and tag. A Windows 11 CI run would need a self-hosted runner on the owner's machine;
  that is the owner's choice and is not set up. Since `8fb51f0` a failing gate names its failed tests in the log.

## 5. What a finding must contain

Number findings by the round's source: findings on the R18 source are **R18-01, R18-02, …**. Claude's own
self-audits use **SA18-01** and so on, so the two never collide. **A second report on the same source takes a letter**,
so its numbers cannot repeat the first's: the R18 full-model audit's findings are **R18F-01** onward. A report that
covers several rounds is numbered by the latest source it audits.

Every finding states:
1. **Evidence:** what you observed, **at which commit**.
2. **Affected code:** file and line at that commit.
3. **Reproduction:** a plan or command, with the **expected figure worked out by hand** and the actual figure.
4. **Consequence:** which figures move, in which direction (tax over- or understated, cash created or destroyed), and
   how widely (corpus members reached, or "none reached").
5. **Proposed repair**, or the decision it needs from the owner.

**Severity:**

| severity | meaning |
|---|---|
| **P1** | a figure a household would rely on is wrong, or money is created or destroyed |
| **P2** | a figure is wrong in a narrower case, or a safeguard can be defeated |
| **P3** | wording, a record or a test that is weaker than it claims |

**Standards of evidence:**
- **Tax and legal claims are checked at the source:** the IRS publication, form instructions, statute or regulation,
  cited precisely. Do not state a rule from memory, and **do not declare a rule absent** without searching the source
  text itself. Claude's R18 self-audit got this wrong in the other direction: it called a real Publication 590-B note
  (date-of-death valuation for distributions made before death in the year of death) nonexistent, after reading only a
  summary of the page. ChatGPT's R18 audit found the note (R18-02).
- **A disclosed limitation is not a finding. An undisclosed one is.** Each round's handover lists what is knowingly
  unrepaired and which figures are therefore not reference values.
- **A test that compares the engine with itself proves consistency, not correctness.** Say when a financial assertion
  lacks an independent expectation.
- **Say plainly what you could not check, and why.**

## 6. What Claude does with ChatGPT's findings

1. **Reproduce every finding on Windows before repairing it.** A finding that does not reproduce is answered with the
   evidence, never silently dropped.
2. **Ask the owner** wherever the repair involves a model decision or a choice of scope. Claude brings the options, with a
   recommendation.
3. **Repair test-first,** with hand-computed expectations, one commit per finding, and the gate green at every commit.
   Tests are never weakened; a fixture whose premise changed is re-fixtured *by intent*, and the commit says why.
4. **Account for every moved figure:**
   - golden fixtures are regenerated only after review;
   - control movement is declared;
   - a new corpus baseline is registered;
   - the members that moved and their headline figures are named.
5. **Answer in a response document** for the round, finding by finding: reproduced or not, the commit, the test, and the
   movement. It travels with an updated handover and a cover note.
6. **Audit the round again before sending,** and disclose what that self-audit found.

## 7. Words with fixed meanings

Use these exactly. **Do not upgrade a word.**

| word | means | whose |
|---|---|---|
| reproduced | the defect was shown on Windows at a named commit | Claude's |
| repaired | a commit fixes it and a test guards it | Claude's |
| verified | a check was run and its output read, not assumed | whoever ran it |
| requalified / accepted | the reviewer re-checked the repair and agrees | ChatGPT's verdict |
| closed | the owner says the milestone is closed | the owner's alone |
| NO-GO / GO | the sprint's status | **ChatGPT's determination**, since 2026-09-25 (the owner's decision; before it, the owner's alone) |

**Current state:** S5AA is **NO-GO** (the owner, kept on 2026-09-24). R21 (`s5aa-r21-source` = `4dd674b`) has been audited
twice. The change audit (PR #9, merged as `fab88f0`) found no new findings and requalified R20-01 for import validation.
The GO-readiness audit (R21G, PR #10, merged as `b8b3265`) recommends NO-GO under the written exit gate. The owner's
dispositions are in `audit/S5AA/sprint/S5AA_CLOSE_RECORD_20260920.md` §30: E7 corrected to not met, with its corpus
boundary carried to S5b task 4; E2 accepted as residual uncertainty; E14 an explicit exception, with the warnings panel
carried to S5b.

R22 was your whole-model re-audit of `0a38065` (PR #15, merged as `f2fae8d`): NO-GO, with R22-01 (P2, the Roth
exclusion keyed on inputs, not on draws) and R22-02/R22-03 (P3, the plan owner's documents). R22-01 is repaired in
R23 (PR #16, merged as `132235d`): the exclusion is raised only when a Roth is drawn while its owner is under 59 1/2.
R22-02 and R22-03 were corrected by the plan owner (PR #17, merged as `da446bf`); placing them, it found a Rules-page
sentence R22-02 had made false, which R23 also removes.

Your R23 change audit (PR #20, merged as `1d31edc`) found R23-01 (P2, a transfer at exactly 59 1/2 judged at the
year's opening age). R24 repairs it, for the Roth flag and for the 10% on a pre-tax transfer, which had the same slip
(PR #21, merged as `698a88d`); the owner kept the year-opening age for pooled draws, disclosed. Your R24 change audit (PR #22,
merged as `01449e0`) found no new findings and requalified R23-01. The audits of R22, R23 and R24 are tagged
`s5aa-r22-audited`, `s5aa-r23-audited` and `s5aa-r24-audited`. Your GO-readiness review, R24G (PR #27, merged as
`665335f`), recommended NO-GO: R24G-01, E7 unmet without an exit-gate amendment. The owner amended the gate: **A-09**, at the
end of `S5AA_TASK_CHECKLIST.md` (E7's enforcement deferred to S5b task 4; the 10 flagged r16 entries unqualified; E2
accepted, E14 excepted; a close under it administrative). The owner set S5AA to **NO-GO** and ruled that **you now determine
the GO / NO-GO status**. **R24G2 awaits your determination** at `s5aa-r24-source` (`d67b618`) under A-09
(`audit/S5AA/R24/S5AA_R24G2_STATUS_DETERMINATION_HANDOVER_20260925.md`). Declaring the milestone closed, and the
`s5aa-closed` tag, stay the owner's.

## 8. Tags and branches

- **`main`** changes only through a pull request with the Windows check green, **and only the owner merges**, a report pull
  request included. The repository is public on GitHub's Free plan, where branch protection is available; **until the
  owner turns it on, this is a rule kept by agreement, not enforced by GitHub.** Claude and ChatGPT may act through the same GitHub account, so the
  path limits in §3 are a working rule that the owner checks in each diff before merging, not a permission GitHub enforces.
  If you see `main` change any other way, report it as a finding.
- **Branches:** Claude's are `sprint/`, `repair/`, `setup/`, `records/` and `policy/` (see `CONTRIBUTING.md`); ChatGPT's
  are `audit/chatgpt/...` only.
- **Tags record checked facts, never quality:**
  - `s5aa-rNN-source`: a round's verified source commit (the one its package was verified against, when it has one);
  - `s5aa-rNN.M-source`: a later source for the same round, when a fix lands after `s5aa-rNN-source` was published
    (the owner's choice in R23: `s5aa-r23.1-source`). The earlier tag stays where it was; the round's documents name the
    one to audit;
  - `s5aa-rNN-audited`: set only after your audit of that source is recorded;
  - `s5aa-closed`: set only on the owner's closeout.

  **Tags are the owner's responsibility.** Claude creates a source tag when the owner has asked for the round, and never moves a
  tag, least of all after an audit of it has started. ChatGPT never creates, moves or deletes one.

## 9. A standing review prompt

**For R24G2, the status determination the owner has asked for:**

> In the GitHub repository `Lonnyzone123/Financial-Calculator`, on `main`: first read
> `audit/S5AA/WORKING_RULES.md`, `docs/AI_REVIEW_INSTRUCTIONS.md`, `S5AA_TASK_CHECKLIST.md` (the exit gate, E1 to E18),
> `audit/S5AA/sprint/S5AA_CLOSE_RECORD_20260920.md` (§4, §30, §34, §35), your R24G report and
> `audit/S5AA/R24/S5AA_R24G2_STATUS_DETERMINATION_HANDOVER_20260925.md`. Before starting, quote the R24G2 cover note's
> first line, amendment A-09's first line, and the commit that tag `s5aa-r24-source` points to. Then determine S5AA's
> status at `d67b618`, GO or NO-GO, against every line of the exit gate as amended by A-01 to A-09; say whether A-09
> states what your R24G-01 said an amendment must, and, for any line that still blocks, what exactly is missing. Put
> GO or NO-GO on the report's first line: your determination sets the status (the owner, 2026-09-25). Report findings in the
> five-part format with R24G2-NN numbers, P1–P3 severities and exact file and line references at `d67b618`. Leave
> the source untouched: publish only through the report-only pull request §3 authorizes, on a branch named
> `audit/chatgpt/r24g2-d67b618`. A GO is not a release or household-reference qualification; declaring the
> milestone closed, and the `s5aa-closed` tag, stay the owner's.

**For a change audit** (last used for R24), filling in the round and the tags:

> In the GitHub repository `Lonnyzone123/Financial-Calculator`, on `main`: first read
> `audit/S5AA/WORKING_RULES.md`, `docs/AI_REVIEW_INSTRUCTIONS.md`, and the round's folder `audit/S5AA/R24/` (its cover
> note, response, self-audit and change handover). Before starting, quote the R24 cover note's first line and the
> commits that tags `s5aa-r23.1-source` and `s5aa-r24-source` point to. Then audit the S5AA change from the verified R23
> source (`s5aa-r23.1-source`, `3bc8946`) to the verified R24 source (`s5aa-r24-source`, `d67b618`). Review the complete
> changed source and tests; trace financial state transitions and numerical safety; check the Windows CI run. Report
> findings in the five-part format with R24-NN numbers (one sequence for the whole report), P1–P3 severities, exact
> file and line references at `d67b618`, and
> hand-worked reproductions. Check every tax claim at its source. Leave the audited source untouched: publish your
> report only through the report-only pull request `audit/S5AA/WORKING_RULES.md` §3 authorizes, on a branch named
> `audit/chatgpt/<round>-<short sha>`, and do not treat a passing check as certification of the model.

## 10. When these rules are wrong

If a rule here stops making sense, **say so in your report**, and the owner decides. Neither of us changes the rules on our own.
**A change to these rules is its own policy-only pull request**, never bundled with a model repair, and takes effect
only when the owner merges it. None of this weakens the Windows gate or changes the fixed meanings in §7.

# S5AA AA1 — assumptions and decisions audit: the brief

*Written by Claude on 2026-10-03 (Arizona, UTC−7), on the owner's request of that day: "audit our assumptions and the decisions I have
made ... compare it to tax law and personal finance standards." The cover note that goes with it is
`S5AA_AUDITOR_COVER_NOTE_20261003_AA1.md`.*

## 1. What this audit is, and what it is not

**This is not a change audit and not a code audit.** Earlier audits asked whether the code does what the model says. This one asks
whether **what the model says** — its stated assumptions, and the decisions the owner has made — is right:
- measured against **tax law** (federal and Arizona, at primary sources);
- measured against **personal-finance planning standards** (professional practice and published research);
- and, where the model deliberately departs from either, whether the departure is **reasonable, disclosed, and in a safe
  direction** for the households the model serves.

**The model** is a personal retirement-planning calculator for one household, a single person or a married couple, filing in
Arizona. It projects year by year, in three modes: a deterministic return, a historical replay, and Monte Carlo. It is a planning
tool: it does not file returns, and its results are not qualified for household reliance.

## 2. What to audit

**A. Every stated assumption:** all 26 sections of `MODEL_ASSUMPTIONS.md`, the model's statement of what it assumes and what it
leaves out. §7 ("What this document does not yet cover") and the not-modelled lists in `FEATURES.md` are in scope as omissions.

**B. Every owner decision** in `SPRINT_QUESTIONS.md`: 181 numbered questions, Q1 to Q181, plus ten review-board entries (RB-01 on). Each records a question, the
owner's decision and its status.
- **Group them** where several decisions implement one rule (for example the survivor rules, the IRMAA rules, the HSA rules), and
  give one verdict per rule, naming every Q it covers.
- **Skip purely procedural decisions** (who audits, how rounds run, tag names), listing their Q numbers in one line, and audit the
  modelling ones.

**C. The S2 closure decisions:** `S2_CLOSURE_REGISTER.md` (and `S2_CARRIED_WORK_REGISTER.md` for anything carried).

**D. The 2026 figures:** the rules package embedded in `src/app-shell.html` (`<script type="application/json"
id="v2b-rules-2026">`). Each figure carries a provision ID, value, status and source. Check a representative sample, at least
every bracket, threshold and limit the model uses, against the IRS revenue procedure, SSA or CMS announcement it cites. Say how
many you checked and which.

**E. The decisions planned for round R45:** each spouse gets their own retirement date
(`audit/S5AA/R45/S5AA_R45_OWNER_DECISIONS_20261003.md`). They are being built now, so a finding here can still change the build.
Pay particular attention to rule 2 (household costs start at the first person's stop, with the other's pay funding spending first)
and rule 4 (a death before retiring counts as a stop).

**Out of scope:**
- the S5AA process amendments A-01 to A-11 in `S5AA_TASK_CHECKLIST.md`, which govern how rounds are run, not what the model
  assumes;
- code defects, unless an assumption cannot be judged without one. If you meet a defect, note it in one line, outside the
  numbered findings.

## 3. What to compare against

Use the strongest authority available, cite it with a link, and say which kind of authority it is:

1. **Federal tax law, primary sources:**
   - the Internal Revenue Code;
   - Treasury regulations;
   - IRS revenue procedures, notices and publications (590-A, 590-B, 969, 915, 17, 505, and the Schedule SE and Form 8606
     instructions);
   - for Social Security, the Social Security Act, 20 CFR and SSA's POMS;
   - for Medicare and IRMAA, 42 USC 1395r and CMS's annual announcements.
2. **Arizona tax law:** A.R.S. Title 43 and the Arizona Department of Revenue's forms and instructions (Form 140 and its
   instructions, the standard deduction, the age-65 exemption, the Social Security subtraction, the flat rate).
3. **Personal-finance planning standards:**
   - the CFP Board's Code of Ethics and Standards of Conduct and its practice standards, especially on developing assumptions;
   - common professional conventions for inflation, return and volatility assumptions, longevity and planning horizons,
     withdrawal-rule design, sequence-of-returns risk, and how Monte Carlo results are presented. Say whose convention you cite.
4. **Published research,** where an assumption leans on it, for example:
   - safe-withdrawal-rate studies (Bengen, the Trinity study and their successors);
   - guardrail rules (Guyton and Klinger);
   - variable-percentage withdrawal, and Social Security claiming research.

   Cite the work. Say where the research is contested.

**Law and standards are different kinds of authority.** A tax rule is a fact that can be checked. A planning standard is
professional judgment, and reasonable planners can differ. Keep the two apart in every finding.

## 4. How to judge each item

Give each assumption, decision, or group one verdict:

| verdict | meaning |
|---|---|
| **CONSISTENT** | It matches the law or the standard. Cite the authority. |
| **ACCEPTABLE SIMPLIFICATION** | It departs from the law or the standard, but the departure is declared to the user, is conservative or immaterial for the households the model supports, and is reasonable for a planning tool. Say which way it biases results. |
| **SHOULD CHANGE** | It misstates the law, or departs from a standard in a way that could mislead a household materially, or the departure is not disclosed. |
| **JUDGMENT CALL** | Planning standards or research genuinely disagree, and the owner's choice is one defensible option. Name the alternatives and their trade-offs. |
| **UNVERIFIED** | You could not confirm the authority. Say what you looked for. |

**For every item that is not CONSISTENT, give:**
- **What the model does,** with the section or Q numbers, and where it is in the code if you checked.
- **The authority,** with a citation and a link, and what it says. Quote briefly.
- **The consequence:** which households it affects, in which direction, and an approximate size (dollars or percentage points in
  a typical case). Show the arithmetic for any figure.
- **A recommendation:** what to change, or what to disclose instead. The owner decides; nothing changes until he does.
- **The scope of the change, estimated:**

  | scope | meaning |
  |---|---|
  | **S** | wording or a disclosure only, with no figure moving |
  | **M** | one engine rule and its tests; a few corpus plans may move; one round |
  | **L** | a cross-cutting model change: many plans move, several engine areas, or a new input; one large round or more |
  | **XL** | a new capability the model does not have, such as a new tax, account type or filing status; a project of its own |

  Add a sentence on why, and which parts of the model it touches.
- **Your confidence:** high, medium or low.

**For CONSISTENT items, a table row is enough:** the item, the authority and a link.

## 5. The report

**First line:** a one-sentence summary, with how many items are in each verdict.

**Then:**
1. **The ten most important findings,** ranked by consequence for households, each with its verdict, scope and recommendation in
   two or three lines.
2. **The full findings,** numbered **AA1-NN**, grouped by area:
   - federal income tax;
   - capital gains and dividends;
   - Social Security;
   - Medicare and IRMAA;
   - retirement accounts (IRA, Roth, workplace plans, HSA, RMDs, QCDs);
   - survivors and estates;
   - Arizona tax;
   - spending and withdrawal strategy;
   - returns, inflation and Monte Carlo;
   - debt and housing;
   - R45 (spouse retirement dates);
   - the 2026 figures.
3. **A table of every item reviewed,** with its verdict, so the owner can see that nothing was skipped. Include the procedural Q
   numbers you skipped and why.
4. **Disagreements with earlier audits:** where your view differs from an earlier ChatGPT or Claude audit in this repository, say
   so and why.
5. **What you could not check,** and why.

**Evidence rules:**
- Cite primary sources wherever they exist.
- A secondary source (a planning blog, a vendor's page) may support a standards point, but never a tax-law point.
- Do not assert that a rule is absent from the law because one summary of the law does not mention it. Check the statute or
  regulation itself.

## 6. Publishing

- **Branch:** publish a report-only pull request on `audit/chatgpt/aa1-<the main commit you audited>`. Name that commit on the
  report's second line.
- **Files:** put the report in `audit/S5AA/AA1/` and change no other file.
- **Privacy:** this repository is public. Call the owner "the owner", and include no name, email address or personal path.

# S5AA R35 — self-audit

*Claude's check of the round before it goes to ChatGPT, 2026-09-29 (local, UTC−7), at `26ef26d`.*

## 1. What was checked, and how

**Every rule with a legal source, read at the source:**
- IRC 1014(a) and (b)(6); 2040(b);
- 26 CFR 1.401(a)(9)-5(c)(2) and 1.401(a)(9)-9(d), whose table was read from eCFR;
- IRC 401(a)(9)(C); 72(t)(2)(A)(v); 411(a)(2)(B); 417(b);
- 20 CFR 418.1135.

The items with no legal rule (SA32F-19, -20, -36, -37, -39, R32V-01, the pension share) are built on the owner's decisions or the
recommendations of record, and each says so in its code.

**Each defect test was run on the engine before its change,** and failed with the audit's figure, before any engine edit. Two figures
were derived independently:
- the Rule of 55 draw, from the 2026 single standard deduction, the 10% band and Arizona's 2.5%, matched the engine to the cent in both
  states;
- Table II's 25.3 at 75/64, which is R32V's figure.

**Each commit was gated at the commit,** in a separate worktree, while the next was written.

**Every moved control plan was traced** against the commit before it, first moved row by first moved row, before it was declared.
Every moved expansion member was traced against R34.

## 2. What the checks caught

- **Commit 8's comment was refused.** It cited an R32F area ID the register does not carry, and wrote "Q&A-9", which the closeout read
  as an open item. The gate caught it, and it was fixed in its own commit (`e779604`), not folded into a later one.
- **The first Rule of 55 build made the switch inert.** The law needs no election, but the boolean-flag contract and the corpus-path
  check both proved the switch no longer changed anything, and the corpus could no longer reach the rule. Rebuilt as R32V note H
  allows: the switch is the household's certification, and the separation year is enforced. The corpus-path record may only shrink, so
  the gap was not pinned; a member that reaches the rule lawfully was added instead.
- **Three test premises were my own errors, caught before commit:**
  - the basis test forgot the engine's imputed 1.5% dividend (Q105) and Arizona's tax on the gain;
  - the accessible-asset test counted its shortfall age by the row's opening, where the engine labels rows by their closing age;
  - the gate script resolved `HEAD` inside the worktree, and one gate was stopped and rerun on the right commit.
- **The Monte Carlo band member left its band twice across R34 and R35.** Each time it was re-chosen by its declared rule, and each
  move was attributed by measurement.
- **The R34 CI dispatch** failed once on `capture-boundary` 5.4. The same job's rerun of all 349 files found no failure, and a second
  dispatch passed. It is transient, and recorded in R34's pull request.

## 3. What remains

- The handover's §6 known limits.
- For the owner: MODEL_ASSUMPTIONS 11 (IRMAA's first years) and 18.1 (basis at a death) change meaning; the relay to eb gives the
  text.

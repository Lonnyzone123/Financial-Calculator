## Scope

<!-- What this changes, in one or two sentences. Setup, repair, feature, or record-keeping? -->

- Kind: setup / repair / feature / records
- Finding(s) or decision(s) addressed:

## Commits

- Base: <!-- commit this starts from -->
- Head: <!-- commit under review -->
- Round, if any: <!-- e.g. R19; the cover note and handover that go with it -->

## Financial behaviour

<!-- "None" is an answer: say how you know (golden fixtures and control unmoved). -->

- Figures that move, and in which direction:
- Corpus members reached (golden / control / expanded):
- Golden fixtures regenerated after review? Control movement declared? New capture registered?

## Invariants

<!-- Tick what you checked; explain anything left unticked. -->

- [ ] No cash, balance or basis created or destroyed
- [ ] Nonfinite values refused or handled on every new path
- [ ] Order of events within a row unchanged, or the change stated and tested
- [ ] Ages, eligibility and limits follow the recorded decisions
- [ ] Deterministic and seeded results still reproduce
- [ ] Each new financial assertion has an independent (hand-computed or oracle) expectation

## Tests

- Command: `npm test`
- Result (the last line and the counts):
- New or re-fixtured tests, and why:

## Platform

- [ ] `gate (windows, node 24.17.0)` green on this pull request
- Local run, if different (machine, Node version):

## Evidence

<!-- Links: audit record, measurements, scripts, artifacts. -->

## Unresolved risks

<!-- What this does not fix, what was not checked, and what is left to a decision. -->

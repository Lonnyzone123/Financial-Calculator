# Modular source (Phase 2)

`investment-calculator-v2c.html` at the project root is a **generated file** from Phase 2 onward. Do not hand-edit it directly -- edits will be silently lost the next time `build.js` runs, and `tests/lib/harness.js` hard-fails on an unexpected hash specifically to catch that.

## Layout

- **`app-shell.html`** -- everything except the calculation engine: markup, CSS, the embedded 2026 rules JSON, and the UI/persistence/worker-orchestration script. Contains one marker, `/* ENGINE_SOURCE */`, where the engine gets inlined.
- **`engine.js`** -- the calculation engine: the exact 44 functions + 4 data constants (`ACCOUNT_TYPES`, `HIST_RETURNS`, `HIST_INFLATION`, `HIST_COLA`) that the app's own `buildWorkerSource()` already serializes for its Web Worker -- i.e. code the app itself already proved is DOM-free. Extracted verbatim (byte-for-byte function bodies, no rewriting) by `tools/extract-engine.js`. Also loadable directly from Node via `require('./src/engine.js')` for unit/fixture testing with zero DOM -- see the smoke-test pattern in `MERGE_AUDIT_AND_PLAN.md`'s Phase 2 section for how to supply `RULES` (loaded separately from the embedded JSON, since it's data the app itself reads via the DOM at runtime, not part of the engine's own function set).

## Workflow

```bash
# after editing src/app-shell.html or src/engine.js:
npm run build   # regenerates investment-calculator-v2c.html
npm test        # must still pass all behavioral checks
```

`build.js` does a plain text substitution (no bundler, no dependencies) -- it strips `engine.js`'s Node-only header comment and `module.exports` footer, then inlines the remaining body at the shell's marker. This keeps the *shipped* artifact a single self-contained HTML file (a non-negotiable requirement per the handover's Section 21) while giving the calculation engine a real, independently testable source boundary during development.

## Why this split, and not more

Phase 2 deliberately extracted *only* the calculation engine, not the UI, persistence, or Web Worker orchestration (all of that stays in `app-shell.html`). A full modularization of the whole app was considered and rejected as disproportionate risk for the actual goal (see the plan doc's discussion) -- the engine boundary is where Phases 5-8 will graft in ported logic from the Python financial-projection engine, so that's the only piece that needed to become independently addressable and testable right now.

# Regression harness for investment-calculator-v2c.html

## Why this exists

The handover doc (`INVESTMENT_CALCULATOR_V2C_HANDOVER.md`, Section 3) references a `test-v2c.js` regression script as part of the development workspace. It could not be found anywhere in `C:\Investment calculator\` (checked recursively, including `Claude_Work/`). This suite was written from scratch to replace it, using Section 19 of the handover (the list of behaviors the original suite covered) as a guide -- adapted to match what the actual verified artifact does, not just what the handover claims.

## Important: which file this targets

This suite tests **`investment-calculator-v2c.html` only**, not `investment-calculator-v2c-mobile.html`. While auditing the project, `investment-calculator-v2c-mobile.html` was found to **not match its own documented SHA-256 hash** from the handover (220,798 actual bytes vs. 234,801 documented; hash `abdf8aef...` vs. documented `29a9ed25...`), and inspecting its code directly showed a materially different, apparently older feature set (7 pages instead of 8, a boolean Advanced toggle instead of a real Simple/Standard/Advanced three-way mode, missing several retirement-strategy fields present in the other file). `investment-calculator-v2c.html` matches its documented hash exactly and has the full feature set the handover describes, so it is the file this suite -- and the rest of this merge project -- treats as ground truth. `tests/lib/harness.js` hard-fails if that file's hash ever changes without this suite being re-verified against the new content.

## What's covered

Structural and behavioral checks driven purely through DOM events (clicks, input/change/blur), exactly as a real user or browser-level test would exercise the app -- the app's internals (`app`, `results`, etc.) are closed over by an IIFE and never exposed on `window`, so nothing here reaches into private state:

- No duplicate element ids anywhere in the document
- All eight pages exist; Standard is the default mode
- Simple/Standard/Advanced mode switching, including the Simple-mode redirect off pages that aren't available there
- Theme switching applies immediately (not gated behind the calculation debounce)
- Number inputs: blank-on-blur restores the last valid value; half-year step normalization; the ending-age 100 clamp
- The five stress and five favorable historical year presets, matched against the actual `STRESS_YEARS`/`FAVORABLE_YEARS` constants in the file (not just the handover's claimed values)
- Guided setup completes and navigates to Accounts
- A saved scenario survives a full reload into an independent window (persistence round-trip via `localStorage`)
- The calculation engine actually runs in the worker-less "compatibility mode" jsdom forces (no `window.Worker`) and populates the Results stat cards
- Monte Carlo determinism: identical inputs and seed produce a bit-for-bit identical rendered result across two independent runs
- The annual projection table's first row is the exact current-age opening snapshot (no growth/contributions applied to it)

## What's deliberately not covered yet

This is a first pass built to unblock Phase 2 of the merge plan (extracting the calculator's calculation-engine module boundary) with *some* safety net, not an exhaustive rebuild of whatever the original `test-v2c.js` covered. Not yet exercised: CSV export, JSON backup/restore file round-trip, four-scenario comparison mode, historical replay/rolling-history heat map, the Rules page content, PWA/service-worker behavior, and most Advanced-tier financial controls (Roth conversions, RMD, healthcare/LTC, debts, other assets). Extend this suite as those areas come under active work in later phases, rather than trying to backfill all of it up front.

## Running

```bash
npm install
npm test
```

Or directly: `node --test tests/regression-suite.js`. Each test loads its own fresh, fully isolated JSDOM window (own `localStorage`, own DOM) -- there is no shared state between tests.

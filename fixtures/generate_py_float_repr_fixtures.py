"""
Differential fixtures for pyFloatRepr() in src/ported/social-security-valuation.js.

WHY THIS EXISTS: planningStateFingerprint() reproduces Python's
`hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")))`
byte-for-byte, which means the JS port has to render every float exactly the
way CPython does. An adversarial pass measured that and found the port's
original implementation was wrong outside the ordinary decimal range:

  value    CPython      JS String(v)          agree?
  1e-7     1e-07        1e-7                  no  (exponent not zero-padded)
  1e-5     1e-05        0.00001               no  (different switch point)
  1e16     1e+16        10000000000000000     no  (different switch point)

CPython (format_float_short, 'r' mode) switches to exponential notation when
`decpt <= -4 or decpt > 16`, where decpt is the decimal point's position
relative to the shortest round-trip digit string, and pads the exponent to at
least two digits. JS switches at `n <= -6 || n >= 21` and never pads.

The values below are chosen to pin BOTH switch points from either side, plus
negative zero, denormals, the largest finite double, and 80 randoms spanning
30 orders of magnitude. Each carries `float.hex()` so the JS side can
reconstruct the exact same double rather than re-parsing a decimal string
(which would beg the very question under test).

Run from C:\\Calculator merge:
    python fixtures/generate_py_float_repr_fixtures.py
"""
import json
import random
from pathlib import Path

random.seed(20260908)


def main():
    values = []

    # Sweep both switch points from either side, at three mantissa shapes.
    for exponent in range(-12, 24):
        for mantissa in ("1", "1.5", "9.999"):
            values.append(float(f"{mantissa}e{exponent}"))

    # The exact boundary pairs, named in the module's own comment.
    values += [1e-4, 1e-5, 1e15, 1e16, 1e17, 1e21, 1e22]

    # Zero, signed zero, small integers, and integral floats (the case the
    # original implementation DID handle -- kept so a fix cannot regress it).
    values += [0.0, -0.0, 1.0, -1.0, 60000.0, 1250.0, -2.4, 0.5]

    # Extremes.
    values += [5e-324, 1.7976931348623157e308, -1.7976931348623157e308, 2.2250738585072014e-308]

    # Randoms across many magnitudes, including sub-unit fractions of the kind
    # a planning state's equity_drawdown / trend_15y_real actually hold.
    for _ in range(60):
        values.append(random.uniform(-1, 1) * (10 ** random.randint(-10, 20)))
    for _ in range(20):
        values.append(random.uniform(0, 1))

    seen = set()
    records = []
    for value in values:
        key = value.hex()
        if key in seen:
            continue
        seen.add(key)
        records.append({
            "hex": key,          # exact bit pattern, so JS reconstructs the same double
            "repr": repr(value),
            "json": json.dumps(value),
        })

    out_path = Path(__file__).resolve().parent / "py-float-repr.fixtures.json"
    out_path.write_text(json.dumps({"values": records}, indent=2))
    print(f"Wrote {out_path} ({len(records)} distinct doubles)")
    for probe in ("1e-05", "1e+16", "1000000000000000.0", "0.0001", "-0.0"):
        present = any(r["json"] == probe for r in records)
        print(f"  boundary {probe:22s} present={present}")


if __name__ == "__main__":
    main()

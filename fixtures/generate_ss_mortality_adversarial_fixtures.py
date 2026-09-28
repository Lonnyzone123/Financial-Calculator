"""
Adversarial/boundary-exact fixtures for the mortality port -- same audit-pass
pattern applied to Phases 5-8 and, in this phase, to the optimizer, bridge,
valuation engine, and longevity analyzer.

The headline check here is a genuine DIFFERENTIAL test between two
independent Python implementations of the same quantity, only one of which
was ported:

  - `mortality_data.py`'s CohortMortalitySeries.conditional_survival()
    computes annual survival directly as a running product of (1 - q(x)).
    This was deliberately NOT ported (see social-security-mortality.js's
    header -- the raw CSV/loader layer ships as a data table instead).
  - `social_security_mortality.py`'s MortalityTable.annual_survival()
    computes the same quantity by interpolating each attained-age year into
    twelve constant-force monthly steps and compounding those. This WAS
    ported.

Those two must agree, because ((1-q)^(1/12))^12 == (1-q) exactly in real
arithmetic -- so any drift beyond floating-point round-trip error means the
monthly interpolation is wrong. Neither implementation is a rewrite of the
other, which is what makes this a real oracle rather than a tautology.

Also covers:
  - The real q(x) == 1.0 values present in the SHIPPED SSA data (birth
    cohorts 1901-1903 at ages 118-119, where the tables close the cohort out
    at certain death). Survival must drop to EXACTLY 0 and stay there, with
    every later month's death probability then also exactly 0.
  - The manifest's own externally documented q(62) values for the 1997 male
    cohort across all three alternatives -- an independent check on the whole
    extraction pipeline, sourced from the SSA package's own metadata rather
    than from anything this project computed.

Run from C:\\Calculator merge:
    python fixtures/generate_ss_mortality_adversarial_fixtures.py
"""
import json
import sys
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.mortality_data import TrusteesMortalityData  # noqa: E402
from retirement_model_v2.social_security_mortality import MortalityTable  # noqa: E402

SOURCE_DIR = SNAPSHOT / "source_files" / "ssa_2026_mortality"
source = TrusteesMortalityData(SOURCE_DIR)


def compact_policy(birth_year, sex="male"):
    alternatives = {}
    for alternative in source.alternatives():
        series = source.load(alternative=alternative, birth_year=birth_year, sex=sex)
        alternatives[alternative] = {"source_sha256": series.source_sha256, "q_x": [p.death_probability for p in series.points]}
    return {
        "dataset_id": source.manifest["dataset_id"], "dataset_version": source.manifest["dataset_version"],
        "birth_year": birth_year, "sex": sex,
        "age_start": int(source.manifest["population"]["age_start"]), "age_end": int(source.manifest["population"]["age_end"]),
        "monthly_interpolation": "constant_force_within_attained_age", "alternatives": alternatives,
    }


def main():
    output = {}

    # --- The manifest's own documented spot-check values, lifted verbatim
    # from the SSA package metadata (validation.notes), NOT recomputed here.
    output["manifest_documented_q62_1997"] = {
        "note": source.manifest["validation"]["notes"][1],
        "values": {
            alt: source.load(alternative=alt, birth_year=1997, sex="male").point(62).death_probability
            for alt in ("I", "II", "III")
        },
    }

    # --- Differential test: annual_survival() (monthly constant-force
    # interpolation, PORTED) vs conditional_survival() (direct annual product
    # of 1-q(x), NOT ported) over several cohorts and windows.
    differential = []
    for birth_year, alternative, valuation_age, through_age in [
        (1960, "II", 65, 100),
        (1960, "I", 62, 120),
        (1997, "II", 62, 119),
        (1997, "III", 70, 110),
        (2005, "II", 65, 95),
    ]:
        table = MortalityTable(compact_policy(birth_year), alternative=alternative)
        interpolated = table.annual_survival(
            birth_year=birth_year, sex="male", valuation_age=valuation_age, through_age=through_age
        )
        series = source.load(alternative=alternative, birth_year=birth_year, sex="male")
        direct = series.conditional_survival(valuation_age=valuation_age, through_age=through_age)
        differential.append({
            "birth_year": birth_year, "alternative": alternative,
            "valuation_age": valuation_age, "through_age": through_age,
            "interpolated_annual_survival": list(interpolated),
            "direct_annual_survival": [value for _, value in direct],
            "max_abs_difference": max(abs(a - b) for a, b in zip(interpolated, [v for _, v in direct])),
        })
    output["differential_cases"] = differential

    # --- The real q(x) == 1.0 cohorts present in the shipped SSA data.
    certain_death = []
    for birth_year, alternative, age in [(1901, "II", 119), (1902, "I", 118), (1903, "III", 119)]:
        series = source.load(alternative=alternative, birth_year=birth_year, sex="male")
        assert series.point(age).death_probability == 1.0, f"expected q({age})==1 for {birth_year}/{alternative}"
        table = MortalityTable(compact_policy(birth_year), alternative=alternative)
        # Run a profile straddling that age: from five years before through
        # the terminal horizon, so the exactly-1.0 year sits mid-profile.
        profile = table.conditional_profile(
            birth_year=birth_year, sex="male",
            valuation_age_months=(age - 5) * 12, through_age_months=120 * 12,
        )
        points = [
            {"age_months": p.age_months, "survival": p.survival, "death_probability": p.death_probability}
            for p in profile.points
        ]
        certain_death.append({
            "birth_year": birth_year, "alternative": alternative, "certain_death_age": age,
            "q_at_age": series.point(age).death_probability,
            "valuation_age_months": (age - 5) * 12,
            "through_age_months": 120 * 12,
            "points": points,
            "terminal_survival": profile.terminal_survival,
            "cumulative_death_probability": profile.cumulative_death_probability,
        })
    output["certain_death_cases"] = certain_death

    out_path = Path(__file__).resolve().parent / "ss-mortality-adversarial.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path}")
    print(f"  manifest q(62) 1997: {output['manifest_documented_q62_1997']['values']}")
    for d in differential:
        print(f"  differential {d['birth_year']}/{d['alternative']} {d['valuation_age']}-{d['through_age']}: max diff {d['max_abs_difference']:.3e}")
    for c in certain_death:
        print(f"  certain death {c['birth_year']}/{c['alternative']} age {c['certain_death_age']}: terminal survival {c['terminal_survival']}")


if __name__ == "__main__":
    main()

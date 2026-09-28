"""
Generates fixtures/ss-mortality.fixtures.json by running the real Python
MortalityTable (retirement_model_v2/social_security_mortality.py) against a
compact per-birth-year mortality dict built the same way
build_data_cache.py's _mortality_cache() builds it -- via the real,
already-validated TrusteesMortalityData CSV loader, for several sample birth
years. The JS port in src/ported/social-security-mortality.js is verified
against this file (see tests/ported/social-security-mortality.test.js).

Run from C:\\Calculator merge:
    python fixtures/generate_ss_mortality_fixtures.py
"""
import json
import sys
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.mortality_data import TrusteesMortalityData  # noqa: E402
from retirement_model_v2.social_security_mortality import MortalityTable  # noqa: E402

SOURCE_DIR = SNAPSHOT / "source_files" / "ssa_2026_mortality"


def build_compact_policy(birth_year, sex="male"):
    source = TrusteesMortalityData(SOURCE_DIR)
    alternatives = {}
    for alternative in source.alternatives():
        series = source.load(alternative=alternative, birth_year=birth_year, sex=sex)
        metadata = source.source_metadata(alternative)
        alternatives[alternative] = {
            "source_sha256": series.source_sha256,
            "source_real_interest_rate": metadata["source_real_interest_rate"],
            "q_x": [point.death_probability for point in series.points],
        }
    return {
        "dataset_id": source.manifest["dataset_id"],
        "dataset_version": source.manifest["dataset_version"],
        "birth_year": birth_year,
        "sex": sex,
        "age_start": int(source.manifest["population"]["age_start"]),
        "age_end": int(source.manifest["population"]["age_end"]),
        "monthly_interpolation": "constant_force_within_attained_age",
        "alternatives": alternatives,
    }


def profile_to_dict(profile):
    return {
        "alternative": profile.alternative,
        "birth_year": profile.birth_year,
        "sex": profile.sex,
        "valuation_age_months": profile.valuation_age_months,
        "through_age_months": profile.through_age_months,
        "points": [
            {"age_months": p.age_months, "survival": p.survival, "death_probability": p.death_probability}
            for p in profile.points
        ],
        "source_id": profile.source_id,
        "data_version": profile.data_version,
        "source_sha256": profile.source_sha256,
        "interpolation": profile.interpolation,
        "terminal_survival": profile.terminal_survival,
        "cumulative_death_probability": profile.cumulative_death_probability,
    }


def run_profile_case(name, policy, alternative, birth_year, sex, valuation_age_months, through_age_months):
    table = MortalityTable(policy, alternative=alternative)
    try:
        profile = table.conditional_profile(
            birth_year=birth_year,
            sex=sex,
            valuation_age_months=valuation_age_months,
            through_age_months=through_age_months,
        )
        return {
            "name": name,
            "input": {
                "birth_year": birth_year, "sex": sex, "alternative": alternative,
                "valuation_age_months": valuation_age_months, "through_age_months": through_age_months,
            },
            "output": profile_to_dict(profile),
        }
    except ValueError as exc:
        return {
            "name": name,
            "input": {
                "birth_year": birth_year, "sex": sex, "alternative": alternative,
                "valuation_age_months": valuation_age_months, "through_age_months": through_age_months,
            },
            "expect_error": str(exc),
        }


def run_annual_survival_case(name, policy, alternative, birth_year, sex, valuation_age, through_age):
    table = MortalityTable(policy, alternative=alternative)
    survival = table.annual_survival(
        birth_year=birth_year, sex=sex, valuation_age=valuation_age, through_age=through_age
    )
    return {
        "name": name,
        "input": {"birth_year": birth_year, "sex": sex, "alternative": alternative, "valuation_age": valuation_age, "through_age": through_age},
        "output": list(survival),
    }


def main():
    cases = []
    policies = {}
    for birth_year in (1960, 1997, 2005):
        policies[birth_year] = build_compact_policy(birth_year)

    # Core scenarios: each alternative, spanning claim age (62) through age 120
    # (the terminal horizon), plus a short window and an exact single-month
    # window (valuation == through).
    for birth_year in (1960, 1997, 2005):
        for alt in ("I", "II", "III"):
            cases.append(run_profile_case(
                f"full_horizon_{birth_year}_{alt}", policies[birth_year], alt, birth_year, "male",
                62 * 12, 120 * 12,
            ))
        cases.append(run_profile_case(
            f"short_window_{birth_year}", policies[birth_year], "II", birth_year, "male",
            70 * 12, 75 * 12,
        ))
        cases.append(run_profile_case(
            f"single_month_{birth_year}", policies[birth_year], "II", birth_year, "male",
            65 * 12 + 3, 65 * 12 + 3,
        ))
        # Boundary: valuation exactly at the max representable month (age_end*12+11)
        cases.append(run_profile_case(
            f"valuation_at_max_month_{birth_year}", policies[birth_year], "II", birth_year, "male",
            119 * 12 + 11, 120 * 12,
        ))

    # Error cases.
    p1997 = policies[1997]
    cases.append(run_profile_case("error_bad_birth_year", p1997, "II", 1998, "male", 62 * 12, 70 * 12))
    cases.append(run_profile_case("error_bad_sex", p1997, "II", 1997, "female", 62 * 12, 70 * 12))
    cases.append(run_profile_case("error_valuation_below_range", p1997, "II", 1997, "male", -1, 70 * 12))
    cases.append(run_profile_case("error_valuation_above_range", p1997, "II", 1997, "male", 121 * 12, 121 * 12))
    cases.append(run_profile_case("error_through_before_valuation", p1997, "II", 1997, "male", 70 * 12, 69 * 12))
    cases.append(run_profile_case("error_through_beyond_terminal", p1997, "II", 1997, "male", 70 * 12, 121 * 12 + 1))
    try:
        MortalityTable(p1997, alternative="IV")
        raise SystemExit("expected MortalityTable to reject an uncached alternative")
    except ValueError as exc:
        cases.append({"name": "error_bad_alternative", "input": {"alternative": "IV"}, "expect_error": str(exc)})

    annual_cases = [
        run_annual_survival_case("annual_survival_1997_II", p1997, "II", 1997, "male", 62, 90),
        run_annual_survival_case("annual_survival_1960_III", policies[1960], "III", 1960, "male", 65, 100),
    ]

    output = {"cases": cases, "annual_survival_cases": annual_cases}
    out_path = Path(__file__).resolve().parent / "ss-mortality.fixtures.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote {out_path} ({len(cases)} profile cases, {len(annual_cases)} annual-survival cases)")


if __name__ == "__main__":
    main()

"""
Generates src/ported/ss-mortality-data.json by running the REAL Python
TrusteesMortalityData loader (validated file-hash checks, CSV parsing, birth-
cohort extraction) across every birth year (1900-2100) and all three SSA
Trustees alternatives, then keeping only death_probability (q(x)) per age --
the only field any downstream Social Security module actually consumes
(confirmed by grepping every retirement_model_v2/*.py for
.survivors/.deaths/.life_expectancy: only build_data_cache.py's own
diagnostic dump and a validation script read them, no live calculation path
does). This mirrors Phase 7's schd-history-data.json precedent: ship a
pre-validated static data table rather than reimplementing CSV/ETL parsing in
JS, where a parsing or hash-check bug would add real risk for zero
behavioral benefit on data that never changes at runtime.

Run from C:\\Calculator merge:
    python fixtures/generate_ss_mortality_data.py
"""
import json
import sys
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.mortality_data import TrusteesMortalityData  # noqa: E402

SOURCE_DIR = SNAPSHOT / "source_files" / "ssa_2026_mortality"


def main():
    data = TrusteesMortalityData(SOURCE_DIR)
    alternatives = data.alternatives()
    population = data.manifest["population"]
    birth_year_start = int(population["birth_year_start"])
    birth_year_end = int(population["birth_year_end"])

    table = {}
    for alt in alternatives:
        table[alt] = {}
        for birth_year in range(birth_year_start, birth_year_end + 1):
            series = data.load(alternative=alt, birth_year=birth_year, sex="male")
            assert series.min_age == int(population["age_start"])
            assert series.max_age == int(population["age_end"])
            table[alt][str(birth_year)] = [round(p.death_probability, 6) for p in series.points]

    output = {
        "sex": "male",
        "age_start": int(population["age_start"]),
        "age_end": int(population["age_end"]),
        "birth_year_start": birth_year_start,
        "birth_year_end": birth_year_end,
        "alternatives": list(alternatives),
        "dataset_id": data.manifest["dataset_id"],
        "dataset_version": data.manifest["dataset_version"],
        "source_metadata": {alt: data.source_metadata(alt) for alt in alternatives},
        # death_probability[alt][birth_year - birth_year_start] -> array of
        # 120 q(x) values indexed by age (age_start..age_end).
        "death_probability": table,
    }
    out_path = Path(__file__).resolve().parent.parent / "src" / "ported" / "ss-mortality-data.json"
    out_path.write_text(json.dumps(output))
    n_years = birth_year_end - birth_year_start + 1
    print(f"Wrote {out_path} ({len(alternatives)} alternatives x {n_years} birth years x 120 ages)")
    print(f"File size: {out_path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()

"""
Generates fixtures/decision-log.fixtures.json by running a range of
.record() calls through the real Python DecisionLog, focused on its two
genuinely subtle behaviors: the _jsonable() float-rounding/flattening
transform, and level-based detail filtering (candidate_summary vs
full_candidates vs triggered_detail). Timestamps are excluded from the
fixture (non-deterministic, real-clock-based in both languages) -- only
sequence numbers, module/event/decision_year/age, and the normalized
payload are compared.

Run from C:\\Calculator merge:
    python fixtures/generate_decision_log_fixtures.py
"""
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parent.parent / "engine-snapshot" / "financial-projection-v2_1_2-audit-repair-requalified"
sys.path.insert(0, str(SNAPSHOT))

from retirement_model_v2.decision_log import DecisionLog  # noqa: E402


@dataclass(frozen=True)
class SamplePlan:
    name: str
    amount: float
    tags: tuple


def event_to_dict(event):
    d = asdict(event)
    d.pop("timestamp_utc", None)
    return d


def main():
    cases = []

    # Case 1: default level (candidate_summary) -- detail=True payloads must be dropped.
    log1 = DecisionLog("run-a", level="candidate_summary")
    log1.record("tax_optimizer", "candidate_summary", {"count": 5}, decision_year=2040, age=65)
    log1.record("tax_optimizer", "candidate", {"weights": {"voo": 0.5}}, decision_year=2040, age=65, detail=True)
    log1.record("tax_optimizer", "selected", {"weights": {"voo": 1.0}}, decision_year=2040, age=65)
    cases.append({"name": "candidate_summary_level_drops_detail", "events": [event_to_dict(e) for e in log1.events], "summary": log1.summary()})

    # Case 2: full_candidates level -- detail=True payloads must be kept.
    log2 = DecisionLog("run-b", level="full_candidates")
    log2.record("tax_optimizer", "candidate_summary", {"count": 5}, decision_year=2040, age=65)
    log2.record("tax_optimizer", "candidate", {"weights": {"voo": 0.5}}, decision_year=2040, age=65, detail=True)
    cases.append({"name": "full_candidates_level_keeps_detail", "events": [event_to_dict(e) for e in log2.events], "summary": log2.summary()})

    # Case 3: triggered_detail bypasses the level gate even at candidate_summary.
    log3 = DecisionLog("run-c", level="candidate_summary")
    log3.record("reserve", "draw", {"amount": 100.0}, decision_year=2040, age=65, detail=True, triggered_detail=True)
    cases.append({"name": "triggered_detail_bypasses_level_gate", "events": [event_to_dict(e) for e in log3.events], "summary": log3.summary()})

    # Case 4: float rounding to 8 decimals, nested structures, dataclass flattening, tuples.
    log4 = DecisionLog("run-d", level="full_candidates")
    log4.record(
        "tax_optimizer",
        "selected",
        {
            "pi_like": 3.14159265358979323846,
            "nested": {"a": 1.0000000049, "b": [1.123456785, 2.987654321987]},
            "plan": SamplePlan("test", 1234.5678912345, ("x", "y", "z")),
            "tuple_field": (1.1, 2.2, 3.3),
            # A REAL Path object (not pre-stringified) -- exercises
            # _jsonable's isinstance(value, Path) branch, not just a string
            # that happens to look like a path.
            "path_like": Path("some") / "relative" / "path.json",
        },
        decision_year=2040,
        age=65,
    )
    cases.append({"name": "float_rounding_and_dataclass_flattening", "events": [event_to_dict(e) for e in log4.events], "summary": log4.summary()})

    # Case 5: no decision_year/age (both None), empty payload.
    log5 = DecisionLog("run-e")
    log5.record("misc", "note", None)
    cases.append({"name": "no_year_or_age_empty_payload", "events": [event_to_dict(e) for e in log5.events], "summary": log5.summary()})

    # Case 6: sequence numbering across many records, multiple modules, summary aggregation.
    log6 = DecisionLog("run-f", level="full_candidates")
    for i in range(5):
        log6.record("moduleA", "eventX", {"i": i}, decision_year=2040 + i, age=65 + i)
    for i in range(3):
        log6.record("moduleB", "eventY", {"i": i}, decision_year=2040 + i, age=65 + i)
    cases.append({"name": "sequence_and_summary_aggregation", "events": [event_to_dict(e) for e in log6.events], "summary": log6.summary()})

    out_path = Path(__file__).resolve().parent / "decision-log.fixtures.json"
    out_path.write_text(json.dumps({"cases": cases}, indent=2))
    print(f"Wrote {out_path} ({len(cases)} cases)")


if __name__ == "__main__":
    main()

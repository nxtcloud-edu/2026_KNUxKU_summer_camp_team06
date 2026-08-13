from datetime import date

from src.eligibility_agent import (
    UserProfileDraft,
    Verdict,
    determine_overall_verdict,
    evaluate_eligibility,
)
from src.normalization_agent import NormalizationResult


def _normalization(conditions, category="opportunity", status="ok"):
    return NormalizationResult.model_validate(
        {
            "opportunity_id": "test-1",
            "content_category": category,
            "conditions": conditions,
            "status": status,
        }
    )


def test_age_region_and_status_pass():
    result = _normalization(
        [
            {"type": "age", "operator": "between", "value": [19, 39], "raw_quote": "만 19~39세", "span": [0, 9]},
            {"type": "region", "operator": "equals", "value": "서울", "raw_quote": "서울 거주", "span": [10, 15]},
            {"type": "status", "operator": "in", "value": ["대학생", "미취업"], "raw_quote": "대학생", "span": [16, 19]},
        ]
    )
    verdict = evaluate_eligibility(
        UserProfileDraft(birth_year=2002, region="서울 관악구", status="대학생 · 미취업"),
        result,
        date(2026, 8, 13),
    )
    assert verdict.overall == Verdict.PASS
    assert all(item.verdict == Verdict.PASS for item in verdict.conditions)


def test_fail_has_priority_over_unknown():
    result = _normalization(
        [
            {"type": "age", "operator": "lte", "value": 20, "raw_quote": "만 20세 이하", "span": [0, 7]},
            {"type": "income", "operator": "unknown", "raw_quote": "소득 조건", "span": [8, 13]},
        ]
    )
    verdict = evaluate_eligibility(UserProfileDraft(birth_year=2000), result, date(2026, 8, 13))
    assert verdict.overall == Verdict.FAIL
    assert [item.verdict for item in verdict.conditions] == [Verdict.FAIL, Verdict.UNKNOWN]


def test_general_info_skips_eligibility():
    verdict = evaluate_eligibility(
        UserProfileDraft(), _normalization([], category="general_info")
    )
    assert verdict.overall == Verdict.NOT_APPLICABLE
    assert verdict.conditions == []


def test_failed_normalization_is_unknown():
    verdict = evaluate_eligibility(
        UserProfileDraft(), _normalization([], category=None, status="failed")
    )
    assert verdict.overall == Verdict.UNKNOWN


def test_empty_results_are_unknown():
    assert determine_overall_verdict([]) == Verdict.UNKNOWN

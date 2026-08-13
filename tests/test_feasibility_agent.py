from datetime import date

from src.eligibility_agent import UserProfileDraft
from src.feasibility_agent import (
    FeasibilityLevel,
    OpportunityEffort,
    evaluate_feasibility,
)


def test_high_feasibility_with_enough_resources():
    result = evaluate_feasibility(
        UserProfileDraft(weekly_available_hours=10, available_budget=100_000),
        OpportunityEffort(
            deadline=date(2026, 8, 27), preparation_hours=10, expected_cost=50_000
        ),
        date(2026, 8, 13),
    )
    assert result.level == FeasibilityLevel.HIGH
    assert result.days_remaining == 14


def test_expired_is_low():
    result = evaluate_feasibility(
        UserProfileDraft(),
        OpportunityEffort(deadline=date(2026, 8, 12)),
        date(2026, 8, 13),
    )
    assert result.level == FeasibilityLevel.LOW
    assert result.score == 0


def test_missing_estimates_are_unknown():
    result = evaluate_feasibility(UserProfileDraft(), OpportunityEffort())
    assert result.level == FeasibilityLevel.UNKNOWN
    assert result.score is None

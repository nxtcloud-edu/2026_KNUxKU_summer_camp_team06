from datetime import date

from src.decision_engine import DecisionInput, recommend_top3
from src.eligibility_agent import UserProfileDraft
from src.feasibility_agent import OpportunityEffort
from src.normalization_agent import NormalizationResult
from src.ranking_agent import OpportunitySignals, RecommendationLevel


def _item(identifier: str, max_age: int, keyword: str, deadline_day: int):
    return DecisionInput(
        normalization=NormalizationResult.model_validate(
            {
                "opportunity_id": identifier,
                "content_category": "opportunity",
                "conditions": [
                    {
                        "type": "age",
                        "operator": "lte",
                        "value": max_age,
                        "raw_quote": f"만 {max_age}세 이하",
                        "span": [0, 8],
                    }
                ],
                "status": "ok",
            }
        ),
        signals=OpportunitySignals(
            opportunity_id=identifier,
            title=identifier,
            keywords=[keyword],
            skills_gained=["프로젝트"],
        ),
        effort=OpportunityEffort(
            deadline=date(2026, 8, deadline_day), preparation_hours=5, expected_cost=0
        ),
    )


def test_top3_excludes_failed_and_orders_scores():
    profile = UserProfileDraft(
        birth_date=date(2002, 1, 1),
        interests=["AI", "마케팅"],
        weekly_available_hours=10,
        available_budget=10_000,
    )
    items = [
        _item("ai", 39, "AI", 30),
        _item("marketing", 39, "마케팅", 25),
        _item("other", 39, "법률", 20),
        _item("age-fail", 20, "AI", 30),
    ]
    results = recommend_top3(profile, items, date(2026, 8, 13))
    assert [item.ranking.rank for item in results] == [1, 2, 3]
    assert len(results) == 3
    assert all(item.ranking.recommendation != RecommendationLevel.EXCLUDED for item in results)
    assert "age-fail" not in [item.ranking.opportunity_id for item in results]

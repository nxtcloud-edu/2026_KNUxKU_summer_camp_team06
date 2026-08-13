from datetime import date

import pytest

from src.recommendation_service import ProfileSubmission, RecommendationService


def _service() -> RecommendationService:
    opportunities = [
        {"id": "ai", "title": "AI course", "category": "ai", "org": "academy", "url": "https://example.test/ai"},
        {"id": "ai-related", "title": "AI contest", "category": "ai", "org": "academy"},
        {"id": "design", "title": "Design course", "category": "design"},
    ]
    normalizations = [
        {
            "opportunity_id": "ai",
            "content_category": "opportunity",
            "conditions": [
                {"type": "status", "operator": "equals", "value": "student", "raw_quote": "student", "span": [0, 7]}
            ],
            "status": "ok",
        },
        {"opportunity_id": "ai-related", "content_category": "opportunity", "conditions": [], "status": "ok"},
        {"opportunity_id": "design", "content_category": "opportunity", "conditions": [], "status": "ok"},
    ]
    return RecommendationService.from_b_records(opportunities, normalizations)


def test_service_builds_dashboard_and_like_recommendations():
    service = _service()
    dashboard = service.dashboard(recent_ids=["ai"], popular_ids=["ai-related"])
    assert [item.signals.opportunity_id for item in dashboard] == ["ai", "ai-related", "design"]

    profile = ProfileSubmission(birth_date=date(2002, 1, 1), status="student", interests=["ai"])
    feed = service.recommend(profile, ["ai"], reference_date=date(2026, 8, 13))
    assert feed.recommendations[0].ranking.opportunity_id == "ai"
    assert feed.recommendations[0].ranking.liked is True
    execution_decision = service.execution_handoff(user_id="u1", feed=feed, opportunity_id="ai")
    assert execution_decision.eligible is True


def test_profile_requires_full_plausible_birth_date():
    with pytest.raises(ValueError):
        ProfileSubmission(birth_date=date.today().replace(year=date.today().year + 1))

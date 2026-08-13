from datetime import date

from src.decision_engine import (
    DecisionInput,
    create_chatbot_handoff,
    recommend_from_likes,
)
from src.eligibility_agent import UserProfileDraft, Verdict
from src.feasibility_agent import OpportunityEffort
from src.normalization_agent import NormalizationResult
from src.ranking_agent import (
    DashboardSource,
    OpportunitySignals,
    build_dashboard_items,
)


def _item(identifier: str, keyword: str, max_age: int = 39) -> DecisionInput:
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
                        "raw_quote": "age requirement",
                        "span": [0, 15],
                    }
                ],
                "status": "ok",
            }
        ),
        signals=OpportunitySignals(
            opportunity_id=identifier,
            title=identifier,
            keywords=[keyword],
            categories=["technology"],
            source_url=f"https://example.test/{identifier}",
        ),
        effort=OpportunityEffort(deadline=date(2026, 9, 1)),
    )


def test_like_based_feed_prefers_liked_and_related_items_and_excludes_failures():
    profile = UserProfileDraft(birth_date=date(2002, 1, 1), interests=["AI"])
    liked = _item("liked-ai", "AI")
    related = _item("related-ai", "AI")
    unrelated = _item("unrelated", "design")
    failed = _item("age-fail", "AI", max_age=20)

    feed = recommend_from_likes(
        profile,
        [liked, related, unrelated, failed],
        ["liked-ai"],
        limit=3,
        reference_date=date(2026, 8, 13),
    )

    ids = [result.ranking.opportunity_id for result in feed.recommendations]
    assert ids[0] == "liked-ai"
    assert "related-ai" in ids
    assert "age-fail" not in ids
    assert feed.excluded_count == 1
    assert feed.recommendations[0].ranking.liked is True


def test_unknown_eligibility_generates_chatbot_questions_and_handoff():
    item = _item("ai", "AI")
    feed = recommend_from_likes(
        UserProfileDraft(interests=["AI"]),
        [item],
        ["ai"],
        reference_date=date(2026, 8, 13),
    )

    assert feed.recommendations[0].eligibility.overall == Verdict.UNKNOWN
    assert "full date of birth" in feed.follow_up_questions[0]
    handoff = create_chatbot_handoff(feed, "ai")
    assert handoff.source_url == "https://example.test/ai"
    assert handoff.opportunity_id == "ai"


def test_dashboard_uses_recent_then_popular_then_ai_discovered_without_duplicates():
    recent = OpportunitySignals(opportunity_id="recent", title="recent")
    duplicate = OpportunitySignals(opportunity_id="recent", title="duplicate")
    popular = OpportunitySignals(opportunity_id="popular", title="popular")
    discovered = OpportunitySignals(opportunity_id="discovered", title="discovered")

    dashboard = build_dashboard_items(
        recent=[recent], popular=[duplicate, popular], ai_discovered=[discovered]
    )

    assert [item.signals.opportunity_id for item in dashboard] == ["recent", "popular", "discovered"]
    assert dashboard[-1].source == DashboardSource.AI_DISCOVERED

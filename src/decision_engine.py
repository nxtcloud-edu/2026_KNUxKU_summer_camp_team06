"""C-part integration entry points for eligibility and like-based recommendations."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

from src.eligibility_agent import EligibilityVerdict, UserProfileDraft, Verdict, evaluate_eligibility
from src.feasibility_agent import FeasibilityVerdict, OpportunityEffort, evaluate_feasibility
from src.normalization_agent import NormalizationResult
from src.ranking_agent import OpportunitySignals, RankingResult, rank_opportunity, preference_similarity, select_top


class DecisionInput(BaseModel):
    normalization: NormalizationResult
    signals: OpportunitySignals
    effort: OpportunityEffort = Field(default_factory=OpportunityEffort)


class DecisionResult(BaseModel):
    signals: OpportunitySignals
    eligibility: EligibilityVerdict
    feasibility: FeasibilityVerdict
    ranking: RankingResult


class RecommendationFeed(BaseModel):
    liked_opportunity_ids: list[str]
    recommendations: list[DecisionResult] = Field(default_factory=list)
    excluded_count: int = 0
    follow_up_questions: list[str] = Field(default_factory=list)


class ChatbotHandoff(BaseModel):
    opportunity_id: str
    title: str
    source_url: str | None = None
    eligibility: Verdict
    recommendation_score: int
    recommendation_reasons: list[str]
    eligibility_reason: str


def evaluate_opportunity(
    profile: UserProfileDraft,
    item: DecisionInput,
    reference_date: date | None = None,
    *,
    preference_score: int = 0,
    liked: bool = False,
) -> DecisionResult:
    eligibility = evaluate_eligibility(profile, item.normalization, reference_date)
    feasibility = evaluate_feasibility(profile, item.effort, reference_date)
    ranking = rank_opportunity(
        profile, item.signals, eligibility, feasibility,
        preference_score=preference_score, liked=liked,
    )
    return DecisionResult(
        signals=item.signals,
        eligibility=eligibility,
        feasibility=feasibility,
        ranking=ranking,
    )


def recommend_from_likes(
    profile: UserProfileDraft,
    items: list[DecisionInput],
    liked_opportunity_ids: list[str],
    *,
    limit: int = 5,
    reference_date: date | None = None,
) -> RecommendationFeed:
    """Build the recommendation-tab result after the user presses Like.

    Liked items remain candidates themselves; other candidates receive a score based on
    their similarity to any liked item. Items that fail eligibility are never surfaced.
    """

    liked_ids = list(dict.fromkeys(liked_opportunity_ids))
    by_id = {item.signals.opportunity_id: item for item in items}
    liked_signals = [by_id[item_id].signals for item_id in liked_ids if item_id in by_id]
    if not liked_signals:
        return RecommendationFeed(
            liked_opportunity_ids=liked_ids,
            follow_up_questions=["관심 있는 공고에 하트를 눌러 추천 기준을 만들어 주세요."],
        )

    evaluated: list[DecisionResult] = []
    for item in items:
        liked = item.signals.opportunity_id in liked_ids
        preference_score = 100 if liked else preference_similarity(item.signals, liked_signals)
        evaluated.append(evaluate_opportunity(
            profile, item, reference_date, preference_score=preference_score, liked=liked,
        ))

    ranked = select_top([result.ranking for result in evaluated], limit=limit)
    decisions_by_id = {result.ranking.opportunity_id: result for result in evaluated}
    recommendations = [
        decisions_by_id[ranking.opportunity_id].model_copy(update={"ranking": ranking})
        for ranking in ranked
    ]
    follow_up_questions = _profile_questions(profile, recommendations)
    return RecommendationFeed(
        liked_opportunity_ids=liked_ids,
        recommendations=recommendations,
        excluded_count=sum(1 for result in evaluated if result.ranking.eligibility == Verdict.FAIL),
        follow_up_questions=follow_up_questions,
    )


def _profile_questions(profile: UserProfileDraft, recommendations: list[DecisionResult]) -> list[str]:
    if not any(item.eligibility.overall == Verdict.UNKNOWN for item in recommendations):
        return []
    questions: list[str] = []
    if profile.birth_date is None:
        questions.append("생년월일을 입력하면 나이 조건까지 더 정확히 확인할 수 있어요.")
    if not profile.region:
        questions.append("거주 지역을 입력하면 지역 조건까지 더 정확히 확인할 수 있어요.")
    if not profile.status:
        questions.append("현재 상태를 입력하면 대상 조건까지 더 정확히 확인할 수 있어요.")
    return questions or ["남은 참여 조건은 원문과 AI 대화에서 함께 확인해 주세요."]


def create_chatbot_handoff(feed: RecommendationFeed, opportunity_id: str) -> ChatbotHandoff:
    """Create the minimal, explainable payload for the 'I will apply' button."""

    for decision in feed.recommendations:
        if decision.ranking.opportunity_id == opportunity_id:
            return ChatbotHandoff(
                opportunity_id=opportunity_id,
                title=decision.ranking.title,
                source_url=decision.signals.source_url,
                eligibility=decision.eligibility.overall,
                recommendation_score=decision.ranking.score,
                recommendation_reasons=decision.ranking.reasons,
                eligibility_reason=decision.eligibility.reason,
            )
    raise ValueError("The selected opportunity is not in this recommendation feed.")


def recommend_top3(profile: UserProfileDraft, items: list[DecisionInput], reference_date: date | None = None) -> list[DecisionResult]:
    """Backward-compatible generic ranking entry point."""

    evaluated = [evaluate_opportunity(profile, item, reference_date) for item in items]
    ranked = select_top([item.ranking for item in evaluated], limit=3)
    by_id = {item.ranking.opportunity_id: item for item in evaluated}
    return [by_id[result.opportunity_id].model_copy(update={"ranking": result}) for result in ranked]

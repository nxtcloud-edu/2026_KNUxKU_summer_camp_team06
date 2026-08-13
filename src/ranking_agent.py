"""Explainable scoring for a user's liked opportunities and related items."""

from __future__ import annotations

import re
from enum import Enum

from pydantic import BaseModel, Field

from src.eligibility_agent import EligibilityVerdict, UserProfileDraft, Verdict
from src.feasibility_agent import FeasibilityLevel, FeasibilityVerdict


class RecommendationLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    EXCLUDED = "excluded"


class DashboardSource(str, Enum):
    RECENT = "recent"
    POPULAR = "popular"
    AI_DISCOVERED = "ai_discovered"


class OpportunitySignals(BaseModel):
    """Display and similarity signals supplied by B or the dashboard service."""

    opportunity_id: str
    title: str
    keywords: list[str] = Field(default_factory=list)
    skills_gained: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    source_url: str | None = None


class DashboardItem(BaseModel):
    signals: OpportunitySignals
    source: DashboardSource


class RankingResult(BaseModel):
    opportunity_id: str
    title: str
    score: int = Field(ge=0, le=100)
    recommendation: RecommendationLevel
    eligibility: Verdict
    feasibility: FeasibilityLevel
    interest_score: int
    growth_score: int
    preference_score: int = Field(ge=0, le=100)
    liked: bool = False
    reasons: list[str] = Field(default_factory=list)
    rank: int | None = None


def _terms(values: list[str]) -> set[str]:
    terms: set[str] = set()
    for value in values:
        compact = re.sub(r"\s+", "", value).lower()
        if compact:
            terms.add(compact)
        terms.update(filter(None, re.split(r"[,/|()\s]+", value.lower())))
    return terms


def _match_score(left: list[str], right: list[str]) -> int:
    left_terms, right_terms = _terms(left), _terms(right)
    if not left_terms or not right_terms:
        return 0
    matched = sum(
        1 for right_term in right_terms
        if any(right_term in left_term or left_term in right_term for left_term in left_terms)
    )
    return round(min(matched / len(right_terms), 1.0) * 100)


def preference_similarity(signals: OpportunitySignals, liked_signals: list[OpportunitySignals]) -> int:
    """Return the best tag similarity to any liked opportunity, without using an LLM."""

    if not liked_signals:
        return 0
    candidate_terms = signals.keywords + signals.categories + signals.skills_gained
    return max(
        _match_score(candidate_terms, liked.keywords + liked.categories + liked.skills_gained)
        for liked in liked_signals
    )


def rank_opportunity(
    profile: UserProfileDraft,
    signals: OpportunitySignals,
    eligibility: EligibilityVerdict,
    feasibility: FeasibilityVerdict,
    *,
    preference_score: int = 0,
    liked: bool = False,
) -> RankingResult:
    """Score one item. Failed eligibility is always excluded from recommendations."""

    if eligibility.overall == Verdict.FAIL:
        return RankingResult(
            opportunity_id=signals.opportunity_id,
            title=signals.title,
            score=0,
            recommendation=RecommendationLevel.EXCLUDED,
            eligibility=eligibility.overall,
            feasibility=feasibility.level,
            interest_score=0,
            growth_score=0,
            preference_score=preference_score,
            liked=liked,
            reasons=["Excluded because the user does not meet the eligibility requirements."],
        )

    interest_score = _match_score(profile.interests, signals.keywords + signals.categories)
    experience_terms = [*profile.experiences, *([profile.major] if profile.major else [])]
    covered_score = _match_score(experience_terms, signals.skills_gained)
    growth_score = 100 - covered_score if signals.skills_gained else 50
    eligibility_score = {Verdict.PASS: 100, Verdict.UNKNOWN: 55, Verdict.NOT_APPLICABLE: 50}[eligibility.overall]
    feasibility_score = feasibility.score if feasibility.score is not None else 50
    score = round(
        eligibility_score * 0.35
        + feasibility_score * 0.20
        + interest_score * 0.15
        + growth_score * 0.10
        + preference_score * 0.20
    )
    recommendation = (
        RecommendationLevel.HIGH
        if score >= 75 and eligibility.overall == Verdict.PASS
        else RecommendationLevel.MEDIUM if score >= 50 else RecommendationLevel.LOW
    )
    reasons = [
        f"Preference similarity: {preference_score}/100.",
        f"Interest fit: {interest_score}/100.",
        f"Growth value: {growth_score}/100.",
        f"Feasibility: {feasibility.level.value}.",
    ]
    if liked:
        reasons.insert(0, "This opportunity was liked by the user.")
    if eligibility.overall == Verdict.UNKNOWN:
        reasons.append("Some eligibility details are missing; confirm them in the chatbot.")
    return RankingResult(
        opportunity_id=signals.opportunity_id,
        title=signals.title,
        score=score,
        recommendation=recommendation,
        eligibility=eligibility.overall,
        feasibility=feasibility.level,
        interest_score=interest_score,
        growth_score=growth_score,
        preference_score=preference_score,
        liked=liked,
        reasons=reasons,
    )


def select_top(results: list[RankingResult], limit: int = 3) -> list[RankingResult]:
    eligible = [result for result in results if result.recommendation != RecommendationLevel.EXCLUDED]
    ordered = sorted(eligible, key=lambda result: (-result.score, not result.liked, result.opportunity_id))[:limit]
    return [result.model_copy(update={"rank": index}) for index, result in enumerate(ordered, 1)]


def build_dashboard_items(
    *,
    recent: list[OpportunitySignals],
    popular: list[OpportunitySignals],
    ai_discovered: list[OpportunitySignals],
    limit: int = 12,
) -> list[DashboardItem]:
    """Assemble dashboard cards in product priority order and remove duplicates.

    The caller is responsible for ordering ``recent`` and ``popular`` from user events.
    """

    result: list[DashboardItem] = []
    seen: set[str] = set()
    for source, items in (
        (DashboardSource.RECENT, recent),
        (DashboardSource.POPULAR, popular),
        (DashboardSource.AI_DISCOVERED, ai_discovered),
    ):
        for signals in items:
            if signals.opportunity_id in seen:
                continue
            seen.add(signals.opportunity_id)
            result.append(DashboardItem(signals=signals, source=source))
            if len(result) >= limit:
                return result
    return result

"""Explainable recommendation scoring and Top-N selection (OWNER: C)."""

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


class OpportunitySignals(BaseModel):
    opportunity_id: str
    title: str
    keywords: list[str] = Field(default_factory=list)
    skills_gained: list[str] = Field(default_factory=list)


class RankingResult(BaseModel):
    opportunity_id: str
    title: str
    score: int = Field(ge=0, le=100)
    recommendation: RecommendationLevel
    eligibility: Verdict
    feasibility: FeasibilityLevel
    interest_score: int
    growth_score: int
    reasons: list[str] = Field(default_factory=list)
    rank: int | None = None


def _terms(values: list[str]) -> set[str]:
    result: set[str] = set()
    for value in values:
        compact = re.sub(r"\s+", "", value).lower()
        if compact:
            result.add(compact)
        result.update(filter(None, re.split(r"[·,/|()\s]+", value.lower())))
    return result


def _match_score(left: list[str], right: list[str]) -> int:
    a, b = _terms(left), _terms(right)
    if not a or not b:
        return 0
    matched = sum(1 for item in b if any(item in x or x in item for x in a))
    return round(min(matched / len(b), 1.0) * 100)


def rank_opportunity(
    profile: UserProfileDraft,
    signals: OpportunitySignals,
    eligibility: EligibilityVerdict,
    feasibility: FeasibilityVerdict,
) -> RankingResult:
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
            reasons=["지원 자격을 충족하지 못해 추천 대상에서 제외했습니다."],
        )

    interest_score = _match_score(profile.interests, signals.keywords)
    experience_terms = list(profile.experiences)
    if profile.major:
        experience_terms.append(profile.major)
    covered = _match_score(experience_terms, signals.skills_gained)
    growth_score = 100 - covered if signals.skills_gained else 50

    eligibility_score = {
        Verdict.PASS: 100,
        Verdict.UNKNOWN: 55,
        Verdict.NOT_APPLICABLE: 50,
        Verdict.FAIL: 0,
    }[eligibility.overall]
    feasibility_score = feasibility.score if feasibility.score is not None else 50
    score = round(
        eligibility_score * 0.40
        + feasibility_score * 0.25
        + interest_score * 0.20
        + growth_score * 0.15
    )
    recommendation = (
        RecommendationLevel.HIGH
        if score >= 75
        else RecommendationLevel.MEDIUM
        if score >= 50
        else RecommendationLevel.LOW
    )
    reasons = [
        f"관심 적합성 {interest_score}점",
        f"새로운 경험을 보완할 성장 가치 {growth_score}점",
        f"실행 가능성 {feasibility.level.value}",
    ]
    if eligibility.overall == Verdict.UNKNOWN:
        reasons.append("확인이 필요한 자격조건이 있어 추천 점수를 보수적으로 계산했습니다.")
    return RankingResult(
        opportunity_id=signals.opportunity_id,
        title=signals.title,
        score=score,
        recommendation=recommendation,
        eligibility=eligibility.overall,
        feasibility=feasibility.level,
        interest_score=interest_score,
        growth_score=growth_score,
        reasons=reasons,
    )


def select_top(results: list[RankingResult], limit: int = 3) -> list[RankingResult]:
    eligible = [r for r in results if r.recommendation != RecommendationLevel.EXCLUDED]
    ordered = sorted(eligible, key=lambda r: (-r.score, r.opportunity_id))[:limit]
    return [result.model_copy(update={"rank": index}) for index, result in enumerate(ordered, 1)]

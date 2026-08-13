"""Single integration entry point for C's Eligibility -> Feasibility -> Ranking."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from src.eligibility_agent import EligibilityVerdict, UserProfileDraft, evaluate_eligibility
from src.feasibility_agent import FeasibilityVerdict, OpportunityEffort, evaluate_feasibility
from src.normalization_agent import NormalizationResult
from src.ranking_agent import OpportunitySignals, RankingResult, rank_opportunity, select_top


class DecisionInput(BaseModel):
    normalization: NormalizationResult
    signals: OpportunitySignals
    effort: OpportunityEffort = OpportunityEffort()


class DecisionResult(BaseModel):
    eligibility: EligibilityVerdict
    feasibility: FeasibilityVerdict
    ranking: RankingResult


def evaluate_opportunity(
    profile: UserProfileDraft,
    item: DecisionInput,
    reference_date: date | None = None,
) -> DecisionResult:
    eligibility = evaluate_eligibility(profile, item.normalization, reference_date)
    feasibility = evaluate_feasibility(profile, item.effort, reference_date)
    ranking = rank_opportunity(profile, item.signals, eligibility, feasibility)
    return DecisionResult(
        eligibility=eligibility,
        feasibility=feasibility,
        ranking=ranking,
    )


def recommend_top3(
    profile: UserProfileDraft,
    items: list[DecisionInput],
    reference_date: date | None = None,
) -> list[DecisionResult]:
    evaluated = [evaluate_opportunity(profile, item, reference_date) for item in items]
    ranked = select_top([item.ranking for item in evaluated], limit=3)
    by_id = {item.ranking.opportunity_id: item for item in evaluated}
    return [
        by_id[result.opportunity_id].model_copy(update={"ranking": result})
        for result in ranked
    ]

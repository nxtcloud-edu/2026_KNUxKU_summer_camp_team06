"""Adapters between C recommendations and the currently merged B/D contracts.

These adapters intentionally do not guess eligibility facts. C owns profile
intake and collects a full ``birth_date`` for exact age decisions.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from src.decision_engine import ChatbotHandoff, DecisionInput, DecisionResult
from src.eligibility_agent import UserProfileDraft, Verdict
from src.execution.models import EligibilityDecision, Opportunity, UserProfile
from src.feasibility_agent import OpportunityEffort
from src.normalization_agent import NormalizationResult
from src.ranking_agent import OpportunitySignals


def profile_for_decision(profile: UserProfile) -> UserProfileDraft:
    """Map D's shared profile to C without treating a birth year as a DOB.

    A missing date stays ``None`` and yields C's normal ``UNKNOWN`` follow-up;
    a year-only value is never converted into an age decision.
    """

    return UserProfileDraft(
        birth_date=getattr(profile, "birth_date", None),
        region=profile.region,
        status=profile.status,
        interests=profile.interests,
        weekly_available_hours=profile.daily_capacity_hours * 7,
    )


def decision_input_from_opportunity(
    opportunity: Opportunity,
    normalization: NormalizationResult,
) -> DecisionInput:
    """Create C's input from B normalization plus D's display opportunity."""

    if normalization.opportunity_id != opportunity.id:
        raise ValueError("Normalization result and opportunity must have the same ID.")
    return DecisionInput(
        normalization=normalization,
        signals=OpportunitySignals(
            opportunity_id=opportunity.id,
            title=opportunity.title,
            keywords=[value for value in (opportunity.category, opportunity.org) if value],
            categories=[opportunity.category],
            source_url=opportunity.url,
        ),
        # deadline_text is unstructured text, so it is deliberately not parsed here.
        effort=OpportunityEffort(),
    )


def normalization_from_db_row(row: dict[str, Any]) -> NormalizationResult:
    """Read a B ``normalized_opportunities`` row for C evaluation.

    The caller should supply a stable opportunity identifier in ``id`` or
    ``opportunity_id``. JSONB conditions are passed through unchanged.
    """

    opportunity_id = row.get("opportunity_id") or row.get("id")
    if not opportunity_id:
        raise ValueError("A normalized opportunity row needs id or opportunity_id.")
    return NormalizationResult.model_validate(
        {
            "opportunity_id": str(opportunity_id),
            "content_category": row.get("content_category"),
            "conditions": row.get("conditions", []),
            "status": row.get("status", "failed"),
            "notes": row.get("notes"),
        }
    )


def execution_decision_for_selected(
    *,
    user_id: str,
    result: DecisionResult,
) -> EligibilityDecision:
    """Create D's execution contract only for a confirmed eligible selection."""

    if result.eligibility.overall != Verdict.PASS:
        raise ValueError("Only PASS opportunities can start the execution agent.")
    return EligibilityDecision(
        opportunity_id=result.ranking.opportunity_id,
        user_id=user_id,
        eligible=True,
        reason=result.eligibility.reason,
    )


def chatbot_context(handoff: ChatbotHandoff) -> dict[str, Any]:
    """Small serializable context that the UI can attach to a chatbot session."""

    return handoff.model_dump(mode="json")

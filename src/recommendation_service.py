"""C's UI-facing service: profile -> dashboard -> likes -> execution handoff.

The service bridges B's two stable JSON outputs using ``opportunity_id``.  A
frontend can keep user events (recent IDs, popular IDs, liked IDs) in its own
store and call these pure methods without duplicating eligibility logic.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, field_validator

from src.c_integration import execution_decision_for_selected
from src.decision_engine import DecisionInput, RecommendationFeed, recommend_from_likes
from src.eligibility_agent import UserProfileDraft
from src.feasibility_agent import OpportunityEffort
from src.normalization_agent import NormalizationResult
from src.ranking_agent import DashboardItem, OpportunitySignals, build_dashboard_items


class ProfileSubmission(BaseModel):
    """C-owned profile form payload. A full DOB is mandatory for age checks."""

    birth_date: date
    region: str | None = None
    status: str | None = None
    interests: list[str] = Field(default_factory=list)
    major: str | None = None
    experiences: list[str] = Field(default_factory=list)
    weekly_available_hours: float | None = Field(default=None, ge=0)
    available_budget: int | None = Field(default=None, ge=0)
    active_commitments: int = Field(default=0, ge=0)

    @field_validator("birth_date")
    @classmethod
    def birth_date_must_be_plausible(cls, value: date) -> date:
        if value > date.today() or value.year < date.today().year - 120:
            raise ValueError("birth_date must be a plausible past date")
        return value

    def to_decision_profile(self) -> UserProfileDraft:
        return UserProfileDraft(**self.model_dump())


class CatalogEntry(BaseModel):
    input: DecisionInput


class RecommendationService:
    """In-memory C catalog; instantiate once when the frontend starts."""

    def __init__(self, entries: list[CatalogEntry]):
        self._entries = entries
        self._by_id = {entry.input.signals.opportunity_id: entry for entry in entries}

    @classmethod
    def from_b_records(
        cls,
        opportunities: list[dict[str, Any]],
        normalizations: list[dict[str, Any]],
    ) -> "RecommendationService":
        normalized_by_id = {
            str(row["opportunity_id"]): NormalizationResult.model_validate(row)
            for row in normalizations
            if row.get("opportunity_id")
        }
        entries: list[CatalogEntry] = []
        for opportunity in opportunities:
            opportunity_id = str(opportunity.get("id", ""))
            normalization = normalized_by_id.get(opportunity_id)
            if not opportunity_id or normalization is None:
                continue
            category = str(opportunity.get("category") or "")
            organization = str(opportunity.get("org") or "")
            entries.append(
                CatalogEntry(
                    input=DecisionInput(
                        normalization=normalization,
                        signals=OpportunitySignals(
                            opportunity_id=opportunity_id,
                            title=str(opportunity.get("title") or opportunity_id),
                            keywords=[term for term in (category, organization) if term],
                            categories=[category] if category else [],
                            source_url=opportunity.get("url"),
                        ),
                        # B preserves deadline text but does not promise a parsed date.
                        effort=OpportunityEffort(),
                    )
                )
            )
        return cls(entries)

    @classmethod
    def from_b_files(
        cls,
        opportunities_path: str | Path = "data/opportunities.json",
        normalizations_path: str | Path = "data/normalization_results.json",
    ) -> "RecommendationService":
        opportunities_data = json.loads(Path(opportunities_path).read_text(encoding="utf-8"))
        normalizations_data = json.loads(Path(normalizations_path).read_text(encoding="utf-8"))
        return cls.from_b_records(opportunities_data.get("opportunities", []), normalizations_data)

    def dashboard(
        self,
        *,
        recent_ids: list[str] | None = None,
        popular_ids: list[str] | None = None,
        limit: int = 12,
    ) -> list[DashboardItem]:
        recent_ids = recent_ids or []
        popular_ids = popular_ids or []
        recent = self._signals_for_ids(recent_ids)
        popular = self._signals_for_ids(popular_ids)
        used = set(recent_ids) | set(popular_ids)
        discovered = [entry.input.signals for entry in self._entries if entry.input.signals.opportunity_id not in used]
        return build_dashboard_items(recent=recent, popular=popular, ai_discovered=discovered, limit=limit)

    def recommend(
        self,
        profile: ProfileSubmission,
        liked_opportunity_ids: list[str],
        *,
        limit: int = 5,
        reference_date: date | None = None,
    ) -> RecommendationFeed:
        return recommend_from_likes(
            profile.to_decision_profile(),
            [entry.input for entry in self._entries],
            liked_opportunity_ids,
            limit=limit,
            reference_date=reference_date,
        )

    def execution_handoff(self, *, user_id: str, feed: RecommendationFeed, opportunity_id: str):
        """Return D's EligibilityDecision after the user presses 'I will apply'."""

        for decision in feed.recommendations:
            if decision.ranking.opportunity_id == opportunity_id:
                return execution_decision_for_selected(user_id=user_id, result=decision)
        raise ValueError("The selected opportunity is not in this recommendation feed.")

    def _signals_for_ids(self, opportunity_ids: list[str]) -> list[OpportunitySignals]:
        return [self._by_id[item_id].input.signals for item_id in opportunity_ids if item_id in self._by_id]

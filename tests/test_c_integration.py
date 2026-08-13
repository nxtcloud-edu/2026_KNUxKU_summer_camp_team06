from datetime import date

import pytest

from src.c_integration import (
    decision_input_from_opportunity,
    execution_decision_for_selected,
    normalization_from_db_row,
    profile_for_decision,
)
from src.decision_engine import evaluate_opportunity
from src.execution.models import Opportunity, UserProfile
from src.normalization_agent import NormalizationResult


def _normalization(opportunity_id: str) -> NormalizationResult:
    return NormalizationResult.model_validate(
        {
            "opportunity_id": opportunity_id,
            "content_category": "opportunity",
            "conditions": [],
            "status": "ok",
        }
    )


def test_execution_profile_passes_full_birth_date_to_c():
    profile = profile_for_decision(UserProfile(user_id="u1", birth_date=date(2002, 1, 1), interests=["AI"]))

    assert profile.birth_date == date(2002, 1, 1)
    assert profile.weekly_available_hours == 14


def test_b_row_and_d_opportunity_connect_to_a_pass_execution_decision():
    row = {
        "id": "opp-1",
        "content_category": "opportunity",
        "conditions": [
            {"type": "status", "operator": "equals", "value": "student", "raw_quote": "student", "span": [0, 7]}
        ],
        "status": "ok",
    }
    normalization = normalization_from_db_row(row)
    opportunity = Opportunity(id="opp-1", title="AI camp", category="bootcamp", url="https://example.test")
    item = decision_input_from_opportunity(opportunity, normalization)
    result = evaluate_opportunity(
        profile_for_decision(UserProfile(user_id="u1", status="student")), item, date(2026, 8, 13)
    )

    decision = execution_decision_for_selected(user_id="u1", result=result)
    assert decision.opportunity_id == "opp-1"
    assert decision.eligible is True


def test_execution_agent_rejects_unknown_or_failed_eligibility():
    normalization = NormalizationResult.model_validate(
        {
            "opportunity_id": "opp-age",
            "content_category": "opportunity",
            "conditions": [
                {"type": "age", "operator": "lte", "value": 39, "raw_quote": "under 39", "span": [0, 8]}
            ],
            "status": "ok",
        }
    )
    opportunity = Opportunity(id="opp-age", title="AI camp", category="bootcamp")
    result = evaluate_opportunity(
        profile_for_decision(UserProfile(user_id="u1")),
        decision_input_from_opportunity(opportunity, normalization),
        date(2026, 8, 13),
    )

    with pytest.raises(ValueError, match="Only PASS"):
        execution_decision_for_selected(user_id="u1", result=result)

"""Deterministic eligibility evaluation for normalized opportunities.

OWNER: C (엄세연)

This module only judges conditions that B already structured. It never infers
missing values from ``raw_quote``. Unsupported or ambiguous conditions remain
``UNKNOWN`` so the UI can ask the user for more information (R1/R3/R4).
"""

from __future__ import annotations

import json
import re
from datetime import date
from enum import Enum
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from src.normalization_agent import (
    ConditionType,
    ContentCategory,
    EligibilityCondition,
    NormalizationResult,
    Operator,
)


class Verdict(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    UNKNOWN = "unknown"
    NOT_APPLICABLE = "not_applicable"


class UserProfileDraft(BaseModel):
    """Temporary C-side profile until A publishes the shared UserProfile."""

    birth_year: Optional[int] = None
    region: Optional[str] = None
    status: Optional[str] = None
    income_bracket: Optional[str] = None
    interests: list[str] = Field(default_factory=list)
    major: Optional[str] = None
    experiences: list[str] = Field(default_factory=list)
    weekly_available_hours: Optional[float] = None
    available_budget: Optional[int] = None
    active_commitments: int = 0


class ConditionVerdict(BaseModel):
    condition_type: ConditionType
    verdict: Verdict
    reason: str
    raw_quote: str


class EligibilityVerdict(BaseModel):
    opportunity_id: str
    content_category: Optional[ContentCategory]
    conditions: list[ConditionVerdict] = Field(default_factory=list)
    overall: Verdict
    reason: str
    normalization_status: str


def calculate_age(birth_year: int, reference_date: Optional[date] = None) -> int:
    """Return Korean international age using year-only onboarding data."""

    reference_date = reference_date or date.today()
    age = reference_date.year - birth_year
    if age < 0 or age > 120:
        raise ValueError("birth_year is outside a plausible range")
    return age


def _unknown(condition: EligibilityCondition, reason: str) -> ConditionVerdict:
    return ConditionVerdict(
        condition_type=condition.type,
        verdict=Verdict.UNKNOWN,
        reason=reason,
        raw_quote=condition.raw_quote,
    )


def _result(
    condition: EligibilityCondition, passed: bool, pass_reason: str, fail_reason: str
) -> ConditionVerdict:
    return ConditionVerdict(
        condition_type=condition.type,
        verdict=Verdict.PASS if passed else Verdict.FAIL,
        reason=pass_reason if passed else fail_reason,
        raw_quote=condition.raw_quote,
    )


def evaluate_age_condition(
    profile: UserProfileDraft,
    condition: EligibilityCondition,
    reference_date: Optional[date] = None,
) -> ConditionVerdict:
    if profile.birth_year is None:
        return _unknown(condition, "출생연도 정보가 없어 나이 조건을 확인할 수 없습니다.")

    try:
        user_age = calculate_age(profile.birth_year, reference_date)
    except ValueError as exc:
        return _unknown(condition, f"출생연도 값이 유효하지 않습니다: {exc}")

    value = condition.value
    if condition.operator == Operator.GTE and isinstance(value, (int, float)):
        return _result(
            condition,
            user_age >= value,
            f"사용자 나이 {user_age}세가 최소 연령 {value}세 이상입니다.",
            f"사용자 나이 {user_age}세가 최소 연령 {value}세보다 낮습니다.",
        )
    if condition.operator == Operator.LTE and isinstance(value, (int, float)):
        return _result(
            condition,
            user_age <= value,
            f"사용자 나이 {user_age}세가 최대 연령 {value}세 이하입니다.",
            f"사용자 나이 {user_age}세가 최대 연령 {value}세를 초과합니다.",
        )
    if (
        condition.operator == Operator.BETWEEN
        and isinstance(value, (list, tuple))
        and len(value) == 2
        and all(isinstance(item, (int, float)) for item in value)
    ):
        lower, upper = value
        return _result(
            condition,
            lower <= user_age <= upper,
            f"사용자 나이 {user_age}세가 허용 범위 {lower}~{upper}세에 포함됩니다.",
            f"사용자 나이 {user_age}세가 허용 범위 {lower}~{upper}세를 벗어납니다.",
        )
    return _unknown(condition, "나이 조건의 operator/value가 판정 가능한 형태가 아닙니다.")


def _normalized_tokens(value: str) -> set[str]:
    compact = re.sub(r"\s+", "", value).lower()
    return {compact, *filter(None, re.split(r"[·,/|()\s]+", value.lower()))}


def evaluate_region_condition(
    profile: UserProfileDraft, condition: EligibilityCondition
) -> ConditionVerdict:
    if not profile.region:
        return _unknown(condition, "거주 지역 정보가 없어 지역 조건을 확인할 수 없습니다.")
    if condition.operator not in (Operator.EQUALS, Operator.IN):
        return _unknown(condition, "지역 조건이 구조화되지 않아 자동 판정하지 않습니다.")

    required = condition.value if isinstance(condition.value, list) else [condition.value]
    required = [str(item).strip() for item in required if item]
    if not required:
        return _unknown(condition, "지역 조건의 value가 비어 있습니다.")
    if any(item in ("전국", "전국 지원 가능") for item in required):
        return _result(condition, True, "전국 지원 가능한 공고입니다.", "")

    profile_compact = re.sub(r"\s+", "", profile.region).lower()
    matched = any(re.sub(r"\s+", "", item).lower() in profile_compact for item in required)
    return _result(
        condition,
        matched,
        f"사용자 지역 '{profile.region}'이 지원 지역 {required}에 포함됩니다.",
        f"사용자 지역 '{profile.region}'이 지원 지역 {required}에 포함되지 않습니다.",
    )


def evaluate_status_condition(
    profile: UserProfileDraft, condition: EligibilityCondition
) -> ConditionVerdict:
    if not profile.status:
        return _unknown(condition, "학업·취업 상태 정보가 없어 상태 조건을 확인할 수 없습니다.")
    if condition.operator not in (Operator.EQUALS, Operator.IN):
        return _unknown(condition, "상태 조건이 구조화되지 않아 자동 판정하지 않습니다.")

    required = condition.value if isinstance(condition.value, list) else [condition.value]
    required = [str(item).strip() for item in required if item]
    if not required:
        return _unknown(condition, "상태 조건의 value가 비어 있습니다.")

    profile_tokens = _normalized_tokens(profile.status)
    matched = any(
        any(re.sub(r"\s+", "", item).lower() in token or token in re.sub(r"\s+", "", item).lower()
            for token in profile_tokens)
        for item in required
    )
    return _result(
        condition,
        matched,
        f"사용자 상태 '{profile.status}'가 지원 상태 {required}에 포함됩니다.",
        f"사용자 상태 '{profile.status}'가 지원 상태 {required}에 포함되지 않습니다.",
    )


def evaluate_condition(
    profile: UserProfileDraft,
    condition: EligibilityCondition,
    reference_date: Optional[date] = None,
) -> ConditionVerdict:
    if condition.type == ConditionType.AGE:
        return evaluate_age_condition(profile, condition, reference_date)
    if condition.type == ConditionType.REGION:
        return evaluate_region_condition(profile, condition)
    if condition.type == ConditionType.STATUS:
        return evaluate_status_condition(profile, condition)
    return _unknown(
        condition,
        f"{condition.type.value} 조건은 아직 안전하게 자동 판정할 수 없어 추가 확인이 필요합니다.",
    )


def determine_overall_verdict(results: list[ConditionVerdict]) -> Verdict:
    if not results:
        return Verdict.UNKNOWN
    if any(result.verdict == Verdict.FAIL for result in results):
        return Verdict.FAIL
    if any(result.verdict == Verdict.UNKNOWN for result in results):
        return Verdict.UNKNOWN
    return Verdict.PASS


def evaluate_eligibility(
    profile: UserProfileDraft,
    normalization_result: NormalizationResult,
    reference_date: Optional[date] = None,
) -> EligibilityVerdict:
    category = normalization_result.content_category
    if category in (ContentCategory.GENERAL_INFO, ContentCategory.TIME_SENSITIVE_INFO):
        return EligibilityVerdict(
            opportunity_id=normalization_result.opportunity_id,
            content_category=category,
            overall=Verdict.NOT_APPLICABLE,
            reason="개인 자격 판정 대상이 아닌 콘텐츠입니다.",
            normalization_status=normalization_result.status,
        )
    if normalization_result.status == "failed" or category is None:
        return EligibilityVerdict(
            opportunity_id=normalization_result.opportunity_id,
            content_category=category,
            overall=Verdict.UNKNOWN,
            reason="정규화가 실패했거나 콘텐츠 분류가 없어 판정할 수 없습니다.",
            normalization_status=normalization_result.status,
        )

    results = [
        evaluate_condition(profile, condition, reference_date)
        for condition in normalization_result.conditions
    ]
    overall = determine_overall_verdict(results)
    reason_by_verdict = {
        Verdict.PASS: "구조화된 모든 자격조건을 충족합니다.",
        Verdict.FAIL: "충족하지 못한 자격조건이 하나 이상 있습니다.",
        Verdict.UNKNOWN: "정보가 부족하거나 자동 판정할 수 없는 조건이 있어 추가 확인이 필요합니다.",
    }
    return EligibilityVerdict(
        opportunity_id=normalization_result.opportunity_id,
        content_category=category,
        conditions=results,
        overall=overall,
        reason=reason_by_verdict[overall],
        normalization_status=normalization_result.status,
    )


if __name__ == "__main__":
    data_path = Path("data/normalization_results.json")
    raw_results = json.loads(data_path.read_text(encoding="utf-8"))
    profile = UserProfileDraft(
        birth_year=2002,
        region="서울 관악구",
        status="대학 재학 · 미취업",
    )
    first = NormalizationResult.model_validate(raw_results[0])
    verdict = evaluate_eligibility(profile, first, reference_date=date(2026, 8, 13))
    print(verdict.model_dump_json(indent=2))

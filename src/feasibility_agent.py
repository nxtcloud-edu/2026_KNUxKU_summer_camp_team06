"""Rule-based time, budget and workload feasibility evaluation (OWNER: C)."""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from src.eligibility_agent import UserProfileDraft


class FeasibilityLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNKNOWN = "unknown"


class OpportunityEffort(BaseModel):
    """Explicit estimates supplied by B/A/UI; missing values are not guessed."""

    deadline: Optional[date] = None
    preparation_hours: Optional[float] = None
    weekly_hours: Optional[float] = None
    expected_cost: Optional[int] = None


class FeasibilityVerdict(BaseModel):
    level: FeasibilityLevel
    score: Optional[int] = Field(default=None, ge=0, le=100)
    reasons: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    days_remaining: Optional[int] = None


def evaluate_feasibility(
    profile: UserProfileDraft,
    effort: OpportunityEffort,
    reference_date: Optional[date] = None,
) -> FeasibilityVerdict:
    """Evaluate only explicit resource estimates, preserving uncertainty."""

    reference_date = reference_date or date.today()
    checks: list[float] = []
    reasons: list[str] = []
    warnings: list[str] = []
    days_remaining: Optional[int] = None

    if effort.deadline:
        days_remaining = (effort.deadline - reference_date).days
        if days_remaining < 0:
            return FeasibilityVerdict(
                level=FeasibilityLevel.LOW,
                score=0,
                reasons=["신청 마감일이 지났습니다."],
                days_remaining=days_remaining,
            )
        if days_remaining <= 3:
            checks.append(0.25)
            warnings.append(f"마감까지 {days_remaining}일밖에 남지 않았습니다.")
        elif days_remaining <= 7:
            checks.append(0.6)
            reasons.append(f"마감까지 {days_remaining}일 남았습니다.")
        else:
            checks.append(1.0)
            reasons.append(f"마감까지 {days_remaining}일의 준비 시간이 있습니다.")
    else:
        warnings.append("구조화된 마감일이 없어 남은 기간을 평가하지 못했습니다.")

    if effort.preparation_hours is not None and days_remaining is not None and days_remaining >= 0:
        available = (profile.weekly_available_hours or 0) * max(days_remaining, 1) / 7
        if profile.weekly_available_hours is None:
            warnings.append("주간 가용시간 정보가 없습니다.")
        else:
            ratio = available / max(effort.preparation_hours, 0.1)
            checks.append(min(ratio, 1.0))
            reasons.append(
                f"마감 전 가용시간 약 {available:.1f}시간 / 준비 예상 {effort.preparation_hours:.1f}시간입니다."
            )
    elif effort.weekly_hours is not None:
        if profile.weekly_available_hours is None:
            warnings.append("주간 가용시간 정보가 없어 활동시간을 비교하지 못했습니다.")
        else:
            ratio = profile.weekly_available_hours / max(effort.weekly_hours, 0.1)
            checks.append(min(ratio, 1.0))
            reasons.append(
                f"주간 가용 {profile.weekly_available_hours:.1f}시간 / 필요 {effort.weekly_hours:.1f}시간입니다."
            )

    if effort.expected_cost is not None:
        if profile.available_budget is None:
            warnings.append("가용 예산 정보가 없어 비용 부담을 평가하지 못했습니다.")
        else:
            affordable = profile.available_budget >= effort.expected_cost
            checks.append(1.0 if affordable else 0.0)
            reasons.append(
                f"가용 예산 {profile.available_budget:,}원 / 예상 비용 {effort.expected_cost:,}원입니다."
            )

    if profile.active_commitments >= 3:
        checks.append(0.4)
        warnings.append(f"현재 진행 중인 활동이 {profile.active_commitments}개라 일정 충돌 위험이 있습니다.")
    elif profile.active_commitments > 0:
        checks.append(0.8)
        reasons.append(f"현재 진행 중인 활동 {profile.active_commitments}개를 반영했습니다.")

    if not checks:
        return FeasibilityVerdict(
            level=FeasibilityLevel.UNKNOWN,
            reasons=reasons,
            warnings=warnings or ["실행 가능성 평가에 필요한 정보가 없습니다."],
        )

    score = round(sum(checks) / len(checks) * 100)
    level = (
        FeasibilityLevel.HIGH
        if score >= 75
        else FeasibilityLevel.MEDIUM
        if score >= 45
        else FeasibilityLevel.LOW
    )
    return FeasibilityVerdict(
        level=level,
        score=score,
        reasons=reasons,
        warnings=warnings,
        days_remaining=days_remaining,
    )

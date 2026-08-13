# OWNER: D (김나연)
# Execution Agent의 공용 데이터 모델.
#
# 이 모델들은 사용자의 설계(공고정보 + 사용자정보 + 판단결과 -> Goal -> Task -> Plan ->
# Calendar/Notification)를 그대로 코드로 옮긴 것이다. 팀 컨벤션(pydantic v2)을 따른다.
# Execution Agent가 다루는 상태(State) / DB(Goal, Plan, Task, Intervention, Memory) /
# 두 Tool(Calendar, Notification)의 산출물을 여기서 한 곳에 정의한다.
#
# 입력 계약(다른 팀원 파트와의 접점):
#   - Opportunity: B(신민서)의 data/opportunities.json 1건과 동일한 형태
#   - UserProfile: A(강옥일)의 온보딩 결과 (여기서는 실행에 필요한 최소 필드만 사용)
#   - EligibilityDecision: C(엄세연)의 판정 결과 {opportunity_id, user_id, eligible, reason}
#     -> 사용자가 "이거 할래"라고 확정(confirm)한 순간 Execution Agent의 입력이 된다.

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# --- 상태 enum ---------------------------------------------------------------


class GoalStatus(str, Enum):
    ACTIVE = "active"          # 실행 중
    AT_RISK = "at_risk"        # 정체 감지됨 (Stall Detector)
    COMPLETED = "completed"    # 완료 (Completion Verifier)
    ABANDONED = "abandoned"    # 포기/마감 초과


class TaskStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    OVERDUE = "overdue"        # 예정일이 지났는데 미완료
    BLOCKED = "blocked"        # 선행 Task 미완료 등으로 막힘


class NotificationType(str, Enum):
    REMINDER = "reminder"          # "마감 3일 전에 알려줘" 류의 예약 알림
    INTERVENTION = "intervention"  # 정체 감지 후 에이전트가 먼저 거는 개입
    INFO = "info"                  # 단순 정보 전달
    CELEBRATION = "celebration"    # 완료 축하


class InterventionType(str, Enum):
    REMINDER = "reminder"
    NUDGE = "nudge"                # 가벼운 넛지 ("오늘 이거 하나만 해볼까요?")
    REPLAN = "replan"             # 재계획 제안
    ENCOURAGE = "encourage"


# --- 입력 계약 (다른 파트 산출물) --------------------------------------------


class Opportunity(BaseModel):
    """B(신민서)의 data/opportunities.json 1건과 동일 형태."""

    id: str
    title: str
    org: Optional[str] = None
    category: str  # 공모전 | 지원사업 | 서포터즈 | 부트캠프 | 기타
    url: Optional[str] = None
    source: Optional[str] = None
    raw_text: str = ""
    deadline_text: Optional[str] = None
    collected_at: Optional[str] = None


class UserProfile(BaseModel):
    """A(강옥일) 온보딩 결과 중 실행에 필요한 최소 필드 (R7: 개인정보 최소 수집)."""

    user_id: str
    name: str = "사용자"
    region: Optional[str] = None
    # C owns profile intake. A full date is required for exact age eligibility.
    birth_date: Optional[date] = None
    status: Optional[str] = None       # 예: "대학 재학", "미취업"
    interests: list[str] = Field(default_factory=list)
    # 실행 계획 개인화용 (선택): 하루 가용 시간, 선호 알림 리드타임(일)
    daily_capacity_hours: float = 2.0
    default_reminder_lead_days: int = 3


class EligibilityDecision(BaseModel):
    """C(엄세연) 판정 결과. 사용자가 확정하면 Execution Agent의 트리거가 된다."""

    opportunity_id: str
    user_id: str
    eligible: bool = True
    reason: str = ""


# --- Execution Agent이 생성/관리하는 엔티티 (State / DB) ----------------------


class Task(BaseModel):
    id: str
    goal_id: str
    title: str
    description: str = ""
    status: TaskStatus = TaskStatus.TODO
    order: int = 0                       # 실행 순서 (0부터)
    estimated_hours: float = 1.0
    due_at: Optional[datetime] = None    # Planner가 마감 역산으로 배치
    depends_on: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    done_at: Optional[datetime] = None


class CalendarEvent(BaseModel):
    """Calendar Tool의 산출물. 웹 캘린더에 등록되는 1건."""

    id: str
    goal_id: str
    task_id: Optional[str] = None
    title: str
    start: datetime
    end: Optional[datetime] = None
    all_day: bool = True
    location: Optional[str] = None
    url: Optional[str] = None
    notes: str = ""
    source: str = "execution_agent"


class Notification(BaseModel):
    """Notification/Inbox Tool의 산출물. 예약 알림 + 개입 메시지 겸용."""

    id: str
    user_id: str
    goal_id: Optional[str] = None
    task_id: Optional[str] = None
    type: NotificationType = NotificationType.INFO
    title: str
    body: str = ""
    created_at: datetime = Field(default_factory=datetime.now)
    deliver_at: Optional[datetime] = None  # 이 시각이 되면 인박스로 '전달'된다 (예약 알림)
    delivered: bool = False                # Scheduler가 시간이 되면 True로 바꾼다
    read: bool = False


class Intervention(BaseModel):
    """정체 감지 후 어떤 개입을 왜 했는지 기록 (DB: Intervention)."""

    id: str
    goal_id: str
    type: InterventionType
    reason: str
    message: str
    created_at: datetime = Field(default_factory=datetime.now)


class ExecutionMemoryEntry(BaseModel):
    """과거 실행 과정+결과 로그 (Memory: Execution Memory)."""

    id: str
    user_id: str
    goal_id: Optional[str] = None
    event: str                # 예: "goal_created", "task_done", "replanned"
    detail: str = ""
    created_at: datetime = Field(default_factory=datetime.now)


class Plan(BaseModel):
    """목표별 실행 계획 + 버전 (DB: Plan). 재계획하면 version이 올라간다."""

    id: str
    goal_id: str
    version: int = 1
    task_ids: list[str] = Field(default_factory=list)
    rationale: str = ""
    created_at: datetime = Field(default_factory=datetime.now)


class Goal(BaseModel):
    """사용자가 실행하기로 확정한 목표 (DB: Goal). Execution 전체의 루트."""

    id: str
    user_id: str
    opportunity_id: str
    title: str
    category: str
    deadline: Optional[datetime] = None
    status: GoalStatus = GoalStatus.ACTIVE
    current_plan_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    meta: dict[str, Any] = Field(default_factory=dict)


class ExecutionContext(BaseModel):
    """현재 실행에 필요한 상황(사용자·목표·공고·기준시각)을 한 번에 들고 다니는 State."""

    user: UserProfile
    opportunity: Opportunity
    decision: EligibilityDecision
    now: datetime

# OWNER: D (김나연)
# Execution Agent 오케스트레이터.
#
# 역할: 모든 Module과 2개 Tool, State/DB, Scheduler를 한 데 묶어
#   Goal → Task → Plan → Execute → Detect → Intervene → Re-plan → Complete
# 전 과정을 실행한다.
#
# 두 가지 실행 경로 (B 파트의 provider 스위치와 동일한 철학):
#   - "local"   : modules.py의 결정론 코어로 실행. AWS/LLM 없이 항상 동작 — 기본 데모 경로.
#   - "bedrock" : strands-agents + Bedrock(Claude) 준비 시. 시스템 프롬프트(prompts.py)로
#                 LLM이 직접 도구(create_calendar_event 등)를 호출. 미설치면 자동 local 폴백.
#
# 스위치: 환경변수 EXECUTION_LLM_PROVIDER=bedrock 이고 strands/boto3가 import 되면 bedrock,
#         그 외에는 local.

from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from .models import ExecutionContext, Goal, Notification, Plan, Task
from .modules import (
    CompletionVerifier,
    GoalManager,
    InterventionManager,
    Planner,
    ProgressTracker,
    Replanner,
    StallDetector,
    TaskDecomposer,
)
from .store import ExecutionStore
from .tools import CalendarTool, NotificationTool


def _default_provider() -> str:
    """bedrock을 명시적으로 요청했고 실제로 import 가능할 때만 bedrock, 아니면 local."""
    if os.environ.get("EXECUTION_LLM_PROVIDER", "").lower() == "bedrock":
        try:
            import boto3  # noqa: F401
            import strands  # noqa: F401
            return "bedrock"
        except Exception:
            return "local"
    return "local"


class StartResult:
    """start()의 결과 묶음 (데모/프론트에서 그대로 렌더링하기 좋게)."""

    def __init__(self, goal: Goal, tasks: list[Task], plan: Plan,
                 progress: dict, events: list, reminders: list[Notification]):
        self.goal = goal
        self.tasks = tasks
        self.plan = plan
        self.progress = progress
        self.events = events
        self.reminders = reminders


class ExecutionAgent:
    def __init__(
        self,
        store: Optional[ExecutionStore] = None,
        provider: Optional[str] = None,
    ):
        self.store = store or ExecutionStore()
        self.calendar = CalendarTool(self.store)
        self.notifier = NotificationTool(self.store)

        self.goal_manager = GoalManager(self.store)
        self.decomposer = TaskDecomposer(self.store)
        self.planner = Planner(self.store, self.calendar)
        self.tracker = ProgressTracker(self.store)
        self.detector = StallDetector()
        self.intervener = InterventionManager(self.store, self.notifier)
        self.replanner = Replanner(self.store, self.calendar)
        self.verifier = CompletionVerifier(self.store, self.notifier)

        self.provider = provider or _default_provider()

    # --- Tool 1 + 마감 역산: 목표 시작 → Task 분해 → 캘린더 등록 ----------------

    def start(self, ctx: ExecutionContext, auto_reminder: bool = True) -> StartResult:
        """사용자가 '이거 할래'로 확정한 순간의 진입점.

        Goal 생성 → Task 분해 → 마감 역산 Plan → Calendar Tool로 전 일정 등록.
        auto_reminder=True면 마감 기본 리드타임(사용자 설정) 전에 리마인드도 예약한다.
        """
        goal = self.goal_manager.create_goal(ctx)
        tasks = self.decomposer.decompose(goal, ctx.opportunity)
        plan = self.planner.build_plan(goal, tasks, ctx.now)

        reminders: list[Notification] = []
        if auto_reminder and goal.deadline:
            r = self.notifier.schedule_lead_reminder(
                ctx.user.user_id, goal, ctx.user.default_reminder_lead_days
            )
            if r:
                reminders.append(r)

        progress = self.tracker.refresh(goal, ctx.now)
        events = self.store.events_for_goal(goal.id)

        # Bedrock 경로가 켜져 있으면 LLM이 사용자용 안내 멘트를 덧붙인다 (선택).
        if self.provider == "bedrock":
            self._bedrock_kickoff(ctx, goal)

        return StartResult(goal, tasks, plan, progress, events, reminders)

    # --- Tool 2: Notification / Inbox -------------------------------------------

    def add_deadline_reminder(self, goal: Goal, lead_days: int,
                              task: Optional[Task] = None) -> Optional[Notification]:
        """'마감 N일 전에 알려줘' 요청 처리."""
        return self.notifier.schedule_lead_reminder(
            goal.user_id, goal, lead_days, task=task
        )

    def run_scheduler(self, now: datetime) -> list[Notification]:
        """Scheduler: 예약 시간이 된 리마인드를 인박스로 전달한다."""
        return self.notifier.run_due(now)

    def inbox(self, user_id: str) -> list[Notification]:
        return self.notifier.inbox(user_id)

    # --- 진행 추적 / 정체 개입 / 재계획 / 완료 ---------------------------------

    def mark_task_done(self, task_id: str, now: datetime) -> dict:
        task = self.tracker.mark_done(task_id, now)
        goal = self.store.get_goal(task.goal_id) if task else None
        if goal:
            completed = self.verifier.verify(goal, now)
            progress = self.tracker.refresh(goal, now)
            return {"task": task, "progress": progress, "completed": completed}
        return {"task": task, "progress": None, "completed": False}

    def check_and_intervene(self, goal: Goal, now: datetime) -> Optional[str]:
        """정체 감지 → 필요 시 개입 알림 전송. 진단 메시지를 반환(없으면 None)."""
        progress = self.tracker.refresh(goal, now)
        diagnosis = self.detector.diagnose(goal, progress, now)
        if diagnosis:
            self.intervener.intervene(goal, diagnosis, now)
        return diagnosis

    def replan(self, goal: Goal, now: datetime, reason: str = "") -> Plan:
        return self.replanner.replan(goal, now, reason)

    # --- Bedrock 경로 (선택, 미설치 시 호출되지 않음) ---------------------------

    def _bedrock_kickoff(self, ctx: ExecutionContext, goal: Goal) -> Optional[str]:
        """strands + Bedrock이 있을 때, 시스템 프롬프트로 LLM이 안내 멘트를 생성/개입하게 한다.

        실패하면(자격증명/모델 접근 등) 조용히 로컬 결과만 사용한다 — 데모를 막지 않는다.
        """
        try:
            from strands import Agent
            from strands.models import BedrockModel

            from .prompts import EXECUTION_SYSTEM_PROMPT
            from .tools import build_strands_tools

            model = BedrockModel(
                model_id=os.environ.get(
                    "BEDROCK_MODEL_ID", "us.anthropic.claude-3-5-sonnet-20241022-v2:0"
                ),
                region_name=os.environ.get("AWS_REGION", "us-west-2"),
            )
            agent = Agent(
                model=model,
                system_prompt=EXECUTION_SYSTEM_PROMPT,
                tools=build_strands_tools(self.store, ctx.user.user_id, goal),
            )
            prompt = (
                f"공고: {ctx.opportunity.title} ({ctx.opportunity.category})\n"
                f"마감: {goal.deadline}\n"
                f"사용자: {ctx.user.name}, {ctx.user.region}, {ctx.user.status}\n"
                f"판정: {'지원 가능' if ctx.decision.eligible else '지원 불가'} — {ctx.decision.reason}\n\n"
                "위 기회를 실행하기로 했습니다. 사용자에게 첫 안내 멘트를 한국어로 해주세요."
            )
            result = agent(prompt)
            return str(result)
        except Exception:
            return None

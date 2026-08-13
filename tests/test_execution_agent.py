# OWNER: D (김나연)
# Execution Agent 핵심 동작 테스트.  실행:  pytest tests/test_execution_agent.py

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest

from src.execution.agent import ExecutionAgent
from src.execution.chat import ExecutionChat
from src.execution.models import (
    EligibilityDecision,
    ExecutionContext,
    GoalStatus,
    Opportunity,
    TaskStatus,
    UserProfile,
)
from src.execution.modules import parse_deadline
from src.execution.store import ExecutionStore

NOW = datetime(2026, 8, 13, 9, 0)


@pytest.fixture
def store(tmp_path):
    return ExecutionStore(db_path=tmp_path / "db.json", autosave=False)


@pytest.fixture
def opp():
    return Opportunity(
        id="opp-test", title="테스트 공모전", org="테스트", category="공모전",
        raw_text="개인 또는 단체 참가 가능. 접수기간: 2026. 8. 1. ~ 2026. 8. 28.(금)",
        deadline_text="2026. 8. 1. ~ 2026. 8. 28.(금)",
    )


@pytest.fixture
def ctx(opp):
    user = UserProfile(user_id="u1", name="테스트", default_reminder_lead_days=3)
    dec = EligibilityDecision(opportunity_id=opp.id, user_id="u1", eligible=True)
    return ExecutionContext(user=user, opportunity=opp, decision=dec, now=NOW)


# --- 마감 파서 (순수 함수) ---------------------------------------------------


@pytest.mark.parametrize("text,expected", [
    ("2026. 7. 13.(월) ~ 2026. 8. 28.(금)", (2026, 8, 28)),
    ("'26. 6. 1.(월) 09:00 ~ 6. 30.(화) 18:00", (2026, 6, 30)),
    ("2026년 2월 5일(목) ~ 3월 31일(화)", (2026, 3, 31)),
    ("4/3(수) 13시 ~ 4/10(수) 23시 59분", (2026, 4, 10)),
    ("마감 임박! 지금 바로", None),
])
def test_parse_deadline(text, expected):
    result = parse_deadline(text, text, NOW)
    if expected is None:
        assert result is None
    else:
        assert (result.year, result.month, result.day) == expected


# --- Tool 1: Goal → Task → Plan → 캘린더 등록 --------------------------------


def test_start_creates_tasks_and_calendar(store, ctx):
    result = ExecutionAgent(store=store).start(ctx)
    assert result.goal.deadline == datetime(2026, 8, 28, 23, 59)
    assert len(result.tasks) >= 4
    # '단체' 키워드 → 팀원 모집 Task가 끼워졌는지
    assert any("팀원" in t.title for t in result.tasks)
    # 모든 Task가 캘린더에 등록되고 due_at이 마감 이내인지 (마감 역산)
    assert len(result.events) == len(result.tasks)
    assert all(t.due_at is not None and t.due_at <= result.goal.deadline for t in result.tasks)
    # 마지막 Task = 제출, 마감일에 배치
    assert result.tasks[-1].due_at.date() == result.goal.deadline.date()


# --- Tool 2: 리마인드 예약 + Scheduler 전달 ---------------------------------


def test_reminder_scheduled_and_delivered(store, ctx):
    agent = ExecutionAgent(store=store)
    result = agent.start(ctx)
    chat = ExecutionChat(agent, ctx.user, result.goal, now=NOW)

    reply = chat.handle("마감 3일 전에 알려줘")
    assert "예약" in reply
    # 아직 전달 전 (deliver_at 미래)
    assert len(agent.inbox("u1")) == 0
    # 마감 3일 전으로 시간 진행 → Scheduler가 전달
    fired = agent.run_scheduler(datetime(2026, 8, 25, 9, 0))
    assert len(fired) >= 1
    assert len(agent.inbox("u1")) >= 1


# --- 진행 추적 / 완료 검증 ---------------------------------------------------


def test_completion(store, ctx):
    agent = ExecutionAgent(store=store)
    result = agent.start(ctx)
    for t in result.tasks:
        out = agent.mark_task_done(t.id, NOW)
    goal = store.get_goal(result.goal.id)
    assert goal.status == GoalStatus.COMPLETED
    assert all(t.status == TaskStatus.DONE for t in store.tasks_for_goal(goal.id))


# --- "못했어"는 완료가 아니라 재계획 -----------------------------------------


def test_negation_is_replan_not_done(store, ctx):
    agent = ExecutionAgent(store=store)
    result = agent.start(ctx)
    chat = ExecutionChat(agent, ctx.user, result.goal, now=NOW)
    reply = chat.handle("바빠서 못했어. 다시 계획해줘")
    assert "다시 배치" in reply
    # 완료 처리된 Task가 없어야 함
    assert all(t.status != TaskStatus.DONE for t in store.tasks_for_goal(result.goal.id))

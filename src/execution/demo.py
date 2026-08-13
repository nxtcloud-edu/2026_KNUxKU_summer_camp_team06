# OWNER: D (김나연)
# Execution Agent E2E 데모.
#
# 실행:  python -m src.execution.demo
#
# 시나리오(발표용): 사용자가 '김해 청년 로컬굿즈 공모전'을 실행하기로 확정한 순간부터
#   1) Goal 생성 → Task 분해 → 마감 역산 Plan → Calendar Tool로 전 일정 등록
#   2) "마감 3일 전에 알려줘" → Notification Tool로 리마인드 예약
#   3) 시간이 흐르면 Scheduler가 리마인드를 인박스로 전달
#   4) 진행 정체 감지 → 개입 알림 → 재계획
# 까지를 한 흐름으로 보여준다. AWS/LLM 없이 로컬 모드로 항상 동작한다.

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

from .agent import ExecutionAgent
from .chat import ExecutionChat
from .models import EligibilityDecision, ExecutionContext, Opportunity, UserProfile
from .store import ExecutionStore

_OPP_PATH = Path(__file__).resolve().parents[2] / "data" / "opportunities.json"
DEMO_OPP_ID = "opp-contest-02"          # 김해 청년 로컬굿즈 공모전 (마감 2026-08-28, 미래)
DEMO_NOW = datetime(2026, 8, 13, 9, 0)  # 데모 기준 '오늘' (재현성 위해 고정)


def load_opportunity(opp_id: str = DEMO_OPP_ID) -> Opportunity:
    data = json.loads(_OPP_PATH.read_text(encoding="utf-8"))
    for row in data["opportunities"]:
        if row["id"] == opp_id:
            return Opportunity(**row)
    raise KeyError(opp_id)


def demo_user() -> UserProfile:
    # Project.md의 타겟 페르소나(김서연, 24세, 서울 관악구, 대학 4학년, 미취업)
    return UserProfile(
        user_id="user-001",
        name="김서연",
        region="서울 관악구",
        birth_year=2002,
        status="대학 4학년(재학)",
        interests=["디자인", "공모전"],
        daily_capacity_hours=2.0,
        default_reminder_lead_days=3,
    )


def build_context(opp: Opportunity, user: UserProfile, now: datetime) -> ExecutionContext:
    # C(엄세연) 판정 결과를 확정(confirm)한 상태로 가정
    decision = EligibilityDecision(
        opportunity_id=opp.id,
        user_id=user.user_id,
        eligible=True,
        reason="만 19~45세 청년 조건 충족, 지역 제한 없음",
    )
    return ExecutionContext(user=user, opportunity=opp, decision=decision, now=now)


def _hr(title: str) -> None:
    print("\n" + "=" * 68)
    print(f"  {title}")
    print("=" * 68)


def run_demo(store: ExecutionStore | None = None) -> ExecutionStore:
    store = store or ExecutionStore()
    store.reset()  # 데모는 항상 깨끗한 상태에서 시작

    agent = ExecutionAgent(store=store)
    user = demo_user()
    opp = load_opportunity()
    now = DEMO_NOW
    ctx = build_context(opp, user, now)

    _hr("STEP 0 · 입력 (공고 + 사용자 + 판정결과)")
    print(f"공고   : {opp.title}  [{opp.category}]")
    print(f"주관   : {opp.org}")
    print(f"사용자 : {user.name} · {user.region} · {user.status}")
    print(f"판정   : {'지원 가능' if ctx.decision.eligible else '지원 불가'} — {ctx.decision.reason}")
    print(f"오늘   : {now.date()}   |   실행 모드: {agent.provider}")

    # --- STEP 1: Goal → Task → Plan → Calendar 등록 ---------------------------
    _hr("STEP 1 · Goal → Task 분해 → 마감 역산 Plan → 캘린더 등록 (Calendar Tool)")
    result = agent.start(ctx)
    goal = result.goal
    src = goal.meta.get("task_source", "template")
    src_label = "🤖 Gemini가 공고 원문을 읽고 분해" if src == "gemini" else "📑 카테고리 템플릿으로 분해 (LLM 키 없음/폴백)"
    print(f"🎯 Goal 생성: {goal.title}")
    print(f"   마감(원문 '{opp.deadline_text}' 파싱) → {goal.deadline}")
    print(f"   Task 분해 방식: {src_label}")
    print(f"   {result.plan.rationale}\n")
    print("📋 분해된 Task & 마감 역산 일정 (→ 캘린더 등록됨):")
    for t in result.tasks:
        due = t.due_at.strftime("%m/%d") if t.due_at else "미정"
        print(f"   {t.order + 1}. [{due}] {t.title}  ({t.estimated_hours}h)  · {t.description}")
    print(f"\n🗓  Calendar Tool → 웹 캘린더에 {len(result.events)}건 등록 완료")
    if result.reminders:
        r = result.reminders[0]
        print(f"🔔 기본 리마인드 자동 예약: {r.deliver_at.date()} ('{r.title}')")

    # --- STEP 2: 대화 — "마감 3일 전에 알려줘" (Notification Tool) --------------
    _hr("STEP 2 · 사용자 대화 → 리마인드 예약 (Notification/Inbox Tool)")
    chat = ExecutionChat(agent, user, goal, now=now)
    for msg in ["마감 5일 전에 알려줘", "1번 끝냈어"]:
        print(f"🧑 사용자: {msg}")
        print(f"🤖 에이전트: {chat.handle(msg)}\n")

    # --- STEP 3: 시간 경과 → Scheduler가 리마인드 전달 -------------------------
    _hr("STEP 3 · 시간 경과 → Scheduler가 예약 알림을 인박스로 전달")
    print(f"[{now.date()}] 현재 인박스(전달된 알림): {len(agent.inbox(user.user_id))}건 — 아직 예약만 된 상태\n")
    later = datetime(2026, 8, 25, 9, 0)  # 마감 3일 전
    fired = agent.run_scheduler(later)
    print(f"⏰ 시간을 {later.date()}(마감 3일 전)로 진행 → Scheduler 실행")
    for n in fired:
        print(f"   📬 인박스 도착: [{n.type.value}] {n.title} — {n.body}")

    # --- STEP 4: 정체 감지 → 개입 → 재계획 -----------------------------------
    _hr("STEP 4 · 정체 감지 → 개입 알림 → 재계획 (Replanner)")
    chat.set_now(later)
    diagnosis = agent.check_and_intervene(goal, later)
    print(f"🔎 Stall Detector: {diagnosis or '정체 없음'}")
    for n in agent.inbox(user.user_id):
        if n.type.value == "intervention":
            print(f"   📬 개입 알림: {n.title} — {n.body}")
    print("\n🧑 사용자: 바빠서 못했어. 다시 계획해줘")
    print(f"🤖 에이전트:\n{chat.handle('바빠서 못했어. 다시 계획해줘')}")

    # --- 최종 상태 요약 ------------------------------------------------------
    _hr("최종 상태 · State / DB 스냅샷")
    goal = store.get_goal(goal.id)
    print(f"Goal 상태: {goal.status.value}  ·  현재 Plan: {goal.current_plan_id}")
    print(f"캘린더 이벤트: {len(store.events_for_goal(goal.id))}건")
    print(f"인박스(전달된 알림): {len(agent.inbox(user.user_id))}건")
    print("Execution Memory(실행 로그):")
    for m in store.memory_for_user(user.user_id):
        print(f"   · [{m.event}] {m.detail}")

    print(f"\n💾 모든 상태가 저장됨: {store.db_path}")
    print("👉 시각화 캘린더/인박스 HTML 생성:  python -m src.execution.render")
    return store


if __name__ == "__main__":
    run_demo()

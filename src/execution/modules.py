# OWNER: D (김나연)
# Execution Agent의 Module 계층.
#
# 사용자 설계의 모듈들을 코드로 옮긴다:
#   Goal Manager / Task Decomposer / Planner / Progress Tracker /
#   Stall Detector / Intervention Manager / Replanner / Completion Verifier
#
# 여기 로직은 provider(로컬/Bedrock)와 무관하게 동작하는 "결정론 코어"다.
# Bedrock 경로(agent.py)는 시스템 프롬프트로 LLM에게 같은 일을 시키지만, LLM이 없어도
# 데모가 항상 돌도록 이 코어가 동일한 결과를 만든다. (B 파트의 mock 폴백과 같은 철학)
#
# R5(계산에 LLM을 쓰지 않는다): 마감 파싱·일정 역산·진행률은 전부 순수 함수다.

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta
from typing import Optional

from .models import (
    EligibilityDecision,
    ExecutionContext,
    ExecutionMemoryEntry,
    Goal,
    GoalStatus,
    Intervention,
    InterventionType,
    NotificationType,
    Opportunity,
    Plan,
    Task,
    TaskStatus,
    UserProfile,
)
from .store import ExecutionStore
from .tools import CalendarTool, NotificationTool, _new_id


# =============================================================================
# 마감 파서 (R5: 순수 함수, LLM 미사용)
# =============================================================================
# 실제 공고의 deadline_text는 표기가 다양하다:
#   "2026. 7. 13.(월) ~ 2026. 8. 28.(금)"   (점 표기, 시작~끝)
#   "2026. 5. 6.(수) 10:00 ~ 5. 19.(화) 18:00 (마감)"  (끝 날짜에 연도 생략)
#   "'26. 6. 1.(월) 09:00 ~ 6. 30.(화) 18:00"  (2자리 연도)
#   "10월 21일 - 11월 4일"  (한글, 연도 없음)
# 규칙: 문자열에서 날짜 후보를 모두 찾아 '가장 마지막'을 마감으로 본다(범위의 끝).
# 연도가 없으면 직전에 나온 연도를, 그것도 없으면 기준 시각(now)의 연도를 쓴다.

_DOT_DATE = re.compile(
    r"(?:'?(\d{2,4})\s*\.\s*)?(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?"
    r"(?:\s*\([^)]{1,4}\))?"           # (월),(금) 같은 요일 표기
    r"(?:\s*(\d{1,2}):(\d{2}))?"       # 09:00 같은 시각
)
_KOR_DATE = re.compile(
    r"(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일"
    r"(?:\s*\([^)]{1,4}\))?"
    r"(?:\s*(\d{1,2}):(\d{2}))?"
)
# 슬래시 표기 "4/3(수) ~ 4/10", "10/21 - 11/4" (연도 생략 흔함)
_SLASH_DATE = re.compile(
    r"(?:'?(\d{2,4})\s*/\s*)?(\d{1,2})\s*/\s*(\d{1,2})"
    r"(?:\s*\([^)]{1,4}\))?"
    r"(?:\s*(\d{1,2}):(\d{2}))?"
)


def _norm_year(y: Optional[str], fallback: int) -> int:
    if not y:
        return fallback
    yi = int(y)
    return yi + 2000 if yi < 100 else yi


def _candidates(text: str, now: datetime) -> list[datetime]:
    out: list[datetime] = []
    last_year = now.year
    for regex in (_DOT_DATE, _KOR_DATE, _SLASH_DATE):
        for m in regex.finditer(text):
            y, mo, d, hh, mm = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
            try:
                month, day = int(mo), int(d)
                if not (1 <= month <= 12 and 1 <= day <= 31):
                    continue
                year = _norm_year(y, last_year)
                last_year = year
                hour = int(hh) if hh else 23
                minute = int(mm) if mm else 59
                out.append((m.start(), datetime(year, month, day, hour, minute)))  # type: ignore[arg-type]
            except ValueError:
                continue
    # 문자열 등장 순서대로 정렬 후, 가장 마지막(범위의 끝)을 마감으로
    out.sort(key=lambda t: t[0])
    return [dt for _, dt in out]


def parse_deadline(
    deadline_text: Optional[str], raw_text: str, now: datetime
) -> Optional[datetime]:
    """마감(범위의 끝)을 datetime으로 파싱. 못 찾으면 None (추측하지 않는다, R2)."""
    for source in (deadline_text or "", raw_text or ""):
        cands = _candidates(source, now)
        if cands:
            return cands[-1]
    return None


# =============================================================================
# Goal Manager — 실행 목표 생성/관리
# =============================================================================


class GoalManager:
    def __init__(self, store: ExecutionStore):
        self.store = store

    def create_goal(self, ctx: ExecutionContext) -> Goal:
        """공고 + 사용자 + 판정결과(확정) → Goal 생성. Execution의 시작점."""
        deadline = parse_deadline(
            ctx.opportunity.deadline_text, ctx.opportunity.raw_text, ctx.now
        )
        goal = Goal(
            id=_new_id("goal"),
            user_id=ctx.user.user_id,
            opportunity_id=ctx.opportunity.id,
            title=ctx.opportunity.title,
            category=ctx.opportunity.category,
            deadline=deadline,
            status=GoalStatus.ACTIVE,
            meta={"url": ctx.opportunity.url, "org": ctx.opportunity.org},
        )
        # 입력 스냅샷도 DB에 남겨둔다 (재현/디버깅용)
        self.store.put_user(ctx.user)
        self.store.put_opportunity(ctx.opportunity)
        self.store.put_goal(goal)
        _remember(self.store, ctx.user.user_id, goal.id, "goal_created",
                  f"'{goal.title}' 실행 시작 (마감: {deadline})")
        return goal


# =============================================================================
# Task Decomposer — 공고 → Task 분해
# =============================================================================
# 카테고리별 기본 템플릿 + 원문 키워드 감지로 Task를 만든다.
# (title, description, estimated_hours, tags) 튜플의 리스트를 카테고리마다 정의한다.

_BASE_TEMPLATES: dict[str, list[tuple[str, str, float, list[str]]]] = {
    "공모전": [
        ("공고 요구사항 정독·분석", "제출물 형식, 심사 기준, 필수 서류를 표로 정리", 1.0, ["분석"]),
        ("아이디어 기획·컨셉 확정", "핵심 컨셉 1줄 + 근거 정리", 3.0, ["기획"]),
        ("작품/산출물 제작", "실제 결과물 제작", 6.0, ["제작"]),
        ("제출 서류·양식 준비", "신청서·참가동의서 등 양식 작성", 1.5, ["서류"]),
        ("최종 검토 후 제출", "제출 채널 확인 후 업로드", 1.0, ["제출"]),
    ],
    "지원사업": [
        ("자격요건 최종 확인", "연령·소득·중복수혜 조건 재확인", 0.5, ["확인"]),
        ("필요 서류 발급", "주민등록등본/초본, 소득 증빙 등 발급", 1.0, ["서류"]),
        ("신청서 작성", "지원 동기·계획 등 항목 작성", 1.5, ["작성"]),
        ("온라인 접수·제출", "신청 사이트에서 접수 완료", 0.5, ["제출"]),
    ],
    "서포터즈": [
        ("모집 요강 확인", "활동 기간·혜택·필수 참석일 확인", 0.5, ["확인"]),
        ("지원서·자기소개 작성", "지원 동기, 관련 경험 정리", 2.0, ["작성"]),
        ("지원서 제출", "이메일/폼으로 제출", 0.5, ["제출"]),
    ],
    "부트캠프": [
        ("지원 자격 확인", "내일배움카드/전공무관 등 조건 확인", 0.5, ["확인"]),
        ("사전 접수·지원서 제출", "지원서 작성 후 접수", 1.0, ["제출"]),
    ],
}
_DEFAULT_TEMPLATE = [
    ("공고 내용 확인", "핵심 요구사항 파악", 0.5, ["확인"]),
    ("필요 준비물 정리", "제출/준비 항목 리스트업", 1.0, ["준비"]),
    ("신청·제출", "접수 완료", 0.5, ["제출"]),
]

# 원문에 특정 키워드가 있으면 Task를 추가로 끼워 넣는다 (공고 요구사항 분석의 결과).
# (키워드들, 삽입 위치 인덱스, (title, desc, hours, tags))
_KEYWORD_TASKS: list[tuple[list[str], int, tuple[str, str, float, list[str]]]] = [
    (["팀", "단체", "팀원"], 1, ("팀원 모집·역할 분담", "필요 인원/역할 정의 후 모집", 2.0, ["팀"])),
    (["포트폴리오", "SNS", "블로그", "인스타"], 2, ("포트폴리오·SNS 링크 정리", "제출용 링크/샘플 정리", 1.0, ["자료"])),
    (["코딩테스트", "코테", "코딩 테스트"], 2, ("코딩테스트 준비", "기출 유형 연습", 4.0, ["시험"])),
    (["과제테스트", "과제 전형"], 3, ("과제테스트 준비", "예시 과제 연습", 3.0, ["시험"])),
    (["면접"], 4, ("면접 준비", "예상 질문 정리·모의 연습", 2.0, ["면접"])),
]


class TaskDecomposer:
    def __init__(self, store: ExecutionStore):
        self.store = store

    def decompose(self, goal: Goal, opportunity: Opportunity) -> list[Task]:
        rows = list(_BASE_TEMPLATES.get(goal.category, _DEFAULT_TEMPLATE))

        # 원문 키워드로 Task 추가 (뒤 인덱스부터 삽입해 위치가 밀리지 않게)
        raw = opportunity.raw_text or ""
        additions: list[tuple[int, tuple[str, str, float, list[str]]]] = []
        for keywords, pos, task_row in _KEYWORD_TASKS:
            if any(k in raw for k in keywords):
                additions.append((pos, task_row))
        for pos, task_row in sorted(additions, key=lambda x: x[0], reverse=True):
            rows.insert(min(pos, len(rows)), task_row)

        tasks: list[Task] = []
        for i, (title, desc, hours, tags) in enumerate(rows):
            task = Task(
                id=_new_id("task"),
                goal_id=goal.id,
                title=title,
                description=desc,
                estimated_hours=hours,
                order=i,
                tags=tags,
            )
            tasks.append(task)
            self.store.put_task(task)
        _remember(self.store, goal.user_id, goal.id, "tasks_created",
                  f"{len(tasks)}개 Task로 분해")
        return tasks


# =============================================================================
# Planner — Task → 일정 배치 (마감 역산) + 캘린더 등록
# =============================================================================


class Planner:
    def __init__(self, store: ExecutionStore, calendar: CalendarTool):
        self.store = store
        self.calendar = calendar

    def build_plan(self, goal: Goal, tasks: list[Task], now: datetime) -> Plan:
        """마감에서 거꾸로 계산해 각 Task의 due_at을 배치하고 캘린더에 등록한다."""
        self._assign_due_dates(goal, tasks, now)
        for t in tasks:
            self.store.put_task(t)
            if t.due_at:
                self.calendar.register_task(goal, t)  # Calendar Tool 호출

        plan = Plan(
            id=_new_id("plan"),
            goal_id=goal.id,
            version=1,
            task_ids=[t.id for t in tasks],
            rationale=self._rationale(goal, tasks, now),
        )
        self.store.put_plan(plan)
        goal.current_plan_id = plan.id
        self.store.put_goal(goal)
        _remember(self.store, goal.user_id, goal.id, "planned",
                  f"Plan v{plan.version} 생성 · {len(tasks)}개 일정 캘린더 등록")
        return plan

    def _assign_due_dates(self, goal: Goal, tasks: list[Task], now: datetime) -> None:
        tasks = sorted(tasks, key=lambda t: t.order)
        total = sum(max(t.estimated_hours, 0.5) for t in tasks) or 1.0

        if goal.deadline and goal.deadline > now:
            # 마감 역산: 누적 작업량 비율을 now→deadline 구간에 매핑. 마지막 Task = 마감일.
            window = goal.deadline - now
            cum = 0.0
            for t in tasks:
                cum += max(t.estimated_hours, 0.5)
                frac = cum / total
                t.due_at = now + window * frac
        else:
            # 마감이 없거나 이미 지난 경우: 내일부터 하루 간격으로 배치
            for i, t in enumerate(tasks, start=1):
                t.due_at = (now + timedelta(days=i)).replace(hour=18, minute=0, second=0, microsecond=0)

    def _rationale(self, goal: Goal, tasks: list[Task], now: datetime) -> str:
        if goal.deadline:
            days = (goal.deadline - now).days
            return (f"마감 {goal.deadline.date()}까지 {days}일. 총 {len(tasks)}개 Task를 "
                    f"작업량 비율로 역산 배치.")
        return f"마감 정보 없음 — {len(tasks)}개 Task를 내일부터 순차 배치."


# =============================================================================
# Progress Tracker — 진행률 계산 + 지연 Task 표시
# =============================================================================


class ProgressTracker:
    def __init__(self, store: ExecutionStore):
        self.store = store

    def refresh(self, goal: Goal, now: datetime) -> dict:
        tasks = self.store.tasks_for_goal(goal.id)
        for t in tasks:
            if t.status not in (TaskStatus.DONE,) and t.due_at and t.due_at < now:
                if t.status != TaskStatus.OVERDUE:
                    t.status = TaskStatus.OVERDUE
                    self.store.put_task(t)
        done = sum(1 for t in tasks if t.status == TaskStatus.DONE)
        overdue = [t for t in tasks if t.status == TaskStatus.OVERDUE]
        total = len(tasks) or 1
        return {
            "total": len(tasks),
            "done": done,
            "overdue": overdue,
            "progress": round(done / total * 100),
            "next_task": next((t for t in tasks if t.status in (TaskStatus.TODO, TaskStatus.OVERDUE, TaskStatus.IN_PROGRESS)), None),
        }

    def mark_done(self, task_id: str, now: datetime) -> Optional[Task]:
        t = self.store.get_task(task_id)
        if not t:
            return None
        t.status = TaskStatus.DONE
        t.done_at = now
        t.updated_at = now
        self.store.put_task(t)
        _remember(self.store, self.store.get_goal(t.goal_id).user_id, t.goal_id,  # type: ignore[union-attr]
                  "task_done", f"'{t.title}' 완료")
        return t


# =============================================================================
# Stall Detector + Intervention Manager — 정체 감지 & 개입
# =============================================================================


class StallDetector:
    """진행 상태로 정체 여부를 판단한다 (순수 함수 기반)."""

    def diagnose(self, goal: Goal, progress: dict, now: datetime) -> Optional[str]:
        if goal.deadline:
            days_left = (goal.deadline - now).days
        else:
            days_left = None
        if progress["overdue"]:
            titles = ", ".join(t.title for t in progress["overdue"])
            return f"지연된 Task {len(progress['overdue'])}개 발견: {titles}"
        if days_left is not None and days_left <= 3 and progress["progress"] < 70:
            return f"마감 {days_left}일 남았는데 진행률 {progress['progress']}% — 속도가 부족합니다"
        return None


class InterventionManager:
    def __init__(self, store: ExecutionStore, notifier: NotificationTool):
        self.store = store
        self.notifier = notifier

    def intervene(self, goal: Goal, diagnosis: str, now: datetime) -> Intervention:
        """정체 진단을 받아 개입 메시지를 만들고 사용자에게 알림으로 전달한다."""
        message = f"{diagnosis}. 남은 시간에 맞춰 계획을 다시 짜드릴까요?"
        interv = Intervention(
            id=_new_id("interv"),
            goal_id=goal.id,
            type=InterventionType.REPLAN,
            reason=diagnosis,
            message=message,
        )
        self.store.put_intervention(interv)
        self.notifier.notify(
            user_id=goal.user_id,
            title="⚠️ 실행 개입: 계획 점검이 필요해요",
            body=message,
            type=NotificationType.INTERVENTION,
            goal_id=goal.id,
            at=now,
        )
        goal.status = GoalStatus.AT_RISK
        self.store.put_goal(goal)
        _remember(self.store, goal.user_id, goal.id, "intervention", diagnosis)
        return interv


# =============================================================================
# Replanner — 상황 변화에 맞게 Plan 수정 (버전 업)
# =============================================================================


class Replanner:
    def __init__(self, store: ExecutionStore, calendar: CalendarTool):
        self.store = store
        self.calendar = calendar

    def replan(self, goal: Goal, now: datetime, reason: str = "") -> Plan:
        """미완료 Task들을 남은 기간(now→deadline)에 다시 압축 배치하고 캘린더를 갱신한다."""
        tasks = self.store.tasks_for_goal(goal.id)
        pending = [t for t in tasks if t.status != TaskStatus.DONE]

        # 남은 Task 재배치 (Planner와 동일한 역산 로직을 남은 구간에 적용)
        total = sum(max(t.estimated_hours, 0.5) for t in pending) or 1.0
        if goal.deadline and goal.deadline > now:
            window = goal.deadline - now
            cum = 0.0
            for t in sorted(pending, key=lambda t: t.order):
                cum += max(t.estimated_hours, 0.5)
                t.due_at = now + window * (cum / total)
                t.status = TaskStatus.TODO  # 지연 상태 해제
                self.store.put_task(t)
        else:
            for i, t in enumerate(sorted(pending, key=lambda t: t.order), start=1):
                t.due_at = (now + timedelta(days=i)).replace(hour=18, minute=0)
                t.status = TaskStatus.TODO
                self.store.put_task(t)

        # 캘린더 이벤트를 새 due_at으로 갱신 (해당 Task의 기존 이벤트를 옮긴다)
        events = {e.task_id: e for e in self.store.events_for_goal(goal.id)}
        for t in pending:
            ev = events.get(t.id)
            if ev and t.due_at:
                self.calendar.reschedule_event(ev.id, t.due_at)

        prev = self.store.get_plan(goal.current_plan_id) if goal.current_plan_id else None
        version = (prev.version + 1) if prev else 1
        plan = Plan(
            id=_new_id("plan"),
            goal_id=goal.id,
            version=version,
            task_ids=[t.id for t in tasks],
            rationale=f"재계획 v{version}: {reason or '상황 변화 반영'} — 미완료 {len(pending)}개 재배치",
        )
        self.store.put_plan(plan)
        goal.current_plan_id = plan.id
        goal.status = GoalStatus.ACTIVE
        self.store.put_goal(goal)
        _remember(self.store, goal.user_id, goal.id, "replanned", plan.rationale)
        return plan


# =============================================================================
# Completion Verifier — 완료 여부 확인
# =============================================================================


class CompletionVerifier:
    def __init__(self, store: ExecutionStore, notifier: NotificationTool):
        self.store = store
        self.notifier = notifier

    def verify(self, goal: Goal, now: datetime) -> bool:
        tasks = self.store.tasks_for_goal(goal.id)
        if tasks and all(t.status == TaskStatus.DONE for t in tasks):
            goal.status = GoalStatus.COMPLETED
            self.store.put_goal(goal)
            self.notifier.notify(
                user_id=goal.user_id,
                title="🎉 목표 완료!",
                body=f"'{goal.title}' 실행을 끝까지 완료했어요. 수고했어요!",
                type=NotificationType.CELEBRATION,
                goal_id=goal.id,
                at=now,
            )
            _remember(self.store, goal.user_id, goal.id, "completed", "모든 Task 완료")
            return True
        return False


# =============================================================================
# Memory helper
# =============================================================================


def _remember(store: ExecutionStore, user_id: str, goal_id: Optional[str],
              event: str, detail: str) -> None:
    store.put_memory(ExecutionMemoryEntry(
        id=_new_id("mem"), user_id=user_id, goal_id=goal_id, event=event, detail=detail,
    ))

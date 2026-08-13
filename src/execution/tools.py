# OWNER: D (김나연)
# Execution Agent의 2개 Tool.
#
#   1) Calendar Tool       : 생성/수정한 일정을 (웹) 캘린더에 등록·수정·삭제
#   2) Notification/Inbox Tool : 사용자에게 알림/개입 메시지를 예약·전달
#
# 설계 의도(사용자 요청):
#   - Calendar Tool은 "시스템 프롬프트 작업으로 처리" — 즉 LLM 에이전트가 시스템 프롬프트의
#     지시에 따라 이 함수들을 호출한다. 그래서 여기서는 부수효과(캘린더에 실제로 쓰기)만
#     책임지는 순수한 도구로 만들고, "언제/무엇을 등록할지"의 판단은 에이전트(agent.py)에 맡긴다.
#   - Notification Tool은 "사용자가 '며칠 전에 알려줘'라고 하면 실행" — 예약 알림(deliver_at)을
#     만들고, Scheduler가 시간이 되면 인박스로 전달한다.
#
# strands-agents가 설치돼 있으면 각 메서드를 @tool로 감싼 함수도 함께 노출한다(agent.py에서
# Bedrock 에이전트에 그대로 물릴 수 있게). 미설치 환경에서도 클래스는 그대로 동작한다.

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Optional

from .models import (
    CalendarEvent,
    Goal,
    Notification,
    NotificationType,
    Task,
)
from .store import ExecutionStore


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


# =============================================================================
# 1) Calendar Tool
# =============================================================================


class CalendarTool:
    """생성/수정된 일정을 웹 캘린더에 등록·수정·삭제한다.

    MVP에서 '웹 캘린더'의 백엔드는 ExecutionStore의 calendar_events 테이블이다.
    프론트엔드(E) 또는 render.py가 이 테이블을 읽어 달력 UI로 그린다. 실제 서비스에서는
    이 클래스 내부만 Google Calendar API 등으로 교체하면 되고, 시그니처는 유지된다.
    """

    def __init__(self, store: ExecutionStore):
        self.store = store

    def create_event(
        self,
        goal_id: str,
        title: str,
        start: datetime,
        *,
        end: Optional[datetime] = None,
        task_id: Optional[str] = None,
        all_day: bool = True,
        location: Optional[str] = None,
        url: Optional[str] = None,
        notes: str = "",
    ) -> CalendarEvent:
        event = CalendarEvent(
            id=_new_id("cal"),
            goal_id=goal_id,
            task_id=task_id,
            title=title,
            start=start,
            end=end,
            all_day=all_day,
            location=location,
            url=url,
            notes=notes,
        )
        self.store.put_event(event)
        return event

    def update_event(self, event_id: str, **changes) -> Optional[CalendarEvent]:
        event = self.store.get_event(event_id)
        if event is None:
            return None
        updated = event.model_copy(update=changes)
        self.store.put_event(updated)
        return updated

    def reschedule_event(self, event_id: str, new_start: datetime) -> Optional[CalendarEvent]:
        return self.update_event(event_id, start=new_start)

    def delete_event(self, event_id: str) -> bool:
        return self.store.delete_event(event_id)

    def list_events(self, goal_id: Optional[str] = None) -> list[CalendarEvent]:
        return self.store.events_for_goal(goal_id) if goal_id else self.store.all_events()

    def register_task(self, goal: Goal, task: Task) -> CalendarEvent:
        """Task 1건을 그대로 캘린더 일정으로 등록하는 편의 메서드 (Planner가 사용)."""
        assert task.due_at is not None, "due_at 없는 Task는 캘린더에 등록할 수 없다"
        return self.create_event(
            goal_id=goal.id,
            task_id=task.id,
            title=f"[{goal.category}] {task.title}",
            start=task.due_at,
            url=goal.meta.get("url"),
            notes=task.description,
        )


# =============================================================================
# 2) Notification / Inbox Tool
# =============================================================================


class NotificationTool:
    """사용자에게 알림/개입 메시지를 예약하고 전달한다.

    두 가지 쓰임:
      - schedule_reminder(): "마감 3일 전에 알려줘" 같은 예약 알림. deliver_at을 미래로 두면
        Scheduler(run_due)가 시간이 됐을 때 delivered=True로 바꿔 인박스로 보낸다.
      - notify(): 지금 즉시 전달되는 알림/개입 메시지(정체 감지 후 에이전트가 먼저 거는 등).
    """

    def __init__(self, store: ExecutionStore):
        self.store = store

    def notify(
        self,
        user_id: str,
        title: str,
        body: str = "",
        *,
        type: NotificationType = NotificationType.INFO,
        goal_id: Optional[str] = None,
        task_id: Optional[str] = None,
        at: Optional[datetime] = None,
    ) -> Notification:
        """즉시 전달되는 알림 1건 생성 (delivered=True)."""
        n = Notification(
            id=_new_id("noti"),
            user_id=user_id,
            goal_id=goal_id,
            task_id=task_id,
            type=type,
            title=title,
            body=body,
            deliver_at=at,
            delivered=True,
        )
        self.store.put_notification(n)
        return n

    def schedule_reminder(
        self,
        user_id: str,
        deliver_at: datetime,
        title: str,
        body: str = "",
        *,
        goal_id: Optional[str] = None,
        task_id: Optional[str] = None,
    ) -> Notification:
        """미래 시각에 전달될 예약 알림 1건 생성 (delivered=False, Scheduler가 나중에 전달)."""
        n = Notification(
            id=_new_id("noti"),
            user_id=user_id,
            goal_id=goal_id,
            task_id=task_id,
            type=NotificationType.REMINDER,
            title=title,
            body=body,
            deliver_at=deliver_at,
            delivered=False,
        )
        self.store.put_notification(n)
        return n

    def schedule_lead_reminder(
        self,
        user_id: str,
        goal: Goal,
        lead_days: int,
        *,
        task: Optional[Task] = None,
    ) -> Optional[Notification]:
        """'마감 N일 전에 알려줘' 요청을 처리한다.

        기준 시각은 task가 있으면 task.due_at, 없으면 goal.deadline이다.
        기준 - lead_days 시각에 전달될 예약 알림을 만든다.
        """
        anchor = (task.due_at if task else None) or goal.deadline
        if anchor is None:
            return None
        # 리드타임만큼 앞당긴 날의 오전 9시에 전달 (마감시각이 아니라 '그날 아침'에 알림)
        deliver_at = (anchor - timedelta(days=lead_days)).replace(
            hour=9, minute=0, second=0, microsecond=0
        )
        what = task.title if task else goal.title
        return self.schedule_reminder(
            user_id=user_id,
            deliver_at=deliver_at,
            title=f"🔔 마감 {lead_days}일 전 리마인드",
            body=f"'{what}' 마감이 {lead_days}일 남았어요. 지금 시작해볼까요?",
            goal_id=goal.id,
            task_id=task.id if task else None,
        )

    def run_due(self, now: datetime) -> list[Notification]:
        """Scheduler 역할: now 이전으로 예약된(delivered=False) 알림을 전달 상태로 바꾼다.

        반환값은 이번에 새로 '전달된' 알림들 — 데모에서 인박스에 뜬 알림을 보여주기 좋다.
        """
        fired: list[Notification] = []
        for n in self.store.pending_reminders():
            if n.deliver_at and n.deliver_at <= now:
                n.delivered = True
                self.store.put_notification(n)
                fired.append(n)
        return fired

    def inbox(self, user_id: str) -> list[Notification]:
        return self.store.inbox(user_id)


# =============================================================================
# strands-agents용 @tool 래퍼 (설치돼 있을 때만; Bedrock 에이전트에 물리는 용도)
# =============================================================================
#
# agent.py의 Bedrock 경로에서 아래 팩토리로 도구 함수를 만들어 Agent(tools=[...])에 넘긴다.
# strands가 없으면 이 함수는 호출되지 않으므로 import 실패가 데모를 막지 않는다.


def build_strands_tools(store: ExecutionStore, user_id: str, goal: Goal):
    """strands @tool로 감싼 (create_calendar_event, send_notification, schedule_reminder)를 반환.

    LLM(Bedrock)이 시스템 프롬프트의 지시에 따라 이 도구들을 호출하면, 그 부수효과가 그대로
    ExecutionStore(=웹 캘린더/인박스)에 반영된다.
    """
    from strands import tool  # 지연 import: 미설치 환경에서 이 함수만 실패

    cal = CalendarTool(store)
    noti = NotificationTool(store)

    @tool
    def create_calendar_event(title: str, date: str, notes: str = "") -> str:
        """웹 캘린더에 일정을 등록한다. date는 'YYYY-MM-DD' 또는 ISO8601."""
        start = datetime.fromisoformat(date)
        ev = cal.create_event(goal_id=goal.id, title=title, start=start, notes=notes)
        return f"등록됨: {ev.title} @ {ev.start.date()} (id={ev.id})"

    @tool
    def send_notification(title: str, body: str) -> str:
        """사용자에게 지금 즉시 알림/개입 메시지를 보낸다."""
        n = noti.notify(user_id=user_id, title=title, body=body, goal_id=goal.id)
        return f"알림 전송됨: {n.title}"

    @tool
    def schedule_reminder(deliver_date: str, title: str, body: str = "") -> str:
        """지정한 날짜(YYYY-MM-DD)에 전달될 예약 리마인드를 만든다. '며칠 전에 알려줘' 처리용."""
        n = noti.schedule_reminder(
            user_id=user_id,
            deliver_at=datetime.fromisoformat(deliver_date),
            title=title,
            body=body,
            goal_id=goal.id,
        )
        return f"리마인드 예약됨: {n.deliver_at.date()} — {n.title}"

    return [create_calendar_event, send_notification, schedule_reminder]

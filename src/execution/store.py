# OWNER: D (김나연)
# Execution Agent의 State/DB 계층.
#
# 팀 컨벤션(ARCHITECTURE.md 4절: "데이터는 로컬 JSON, DB 없음")을 따라 MVP에서는
# 로컬 JSON 파일 하나에 모든 테이블을 담는다. 실제 배포 시 이 클래스의 메서드 시그니처는
# 그대로 두고 내부만 RDS/DynamoDB로 교체하면 된다 (B의 provider 스위치와 같은 철학).
#
# 테이블(사용자 설계의 Database 절과 1:1 대응):
#   users, opportunities, goals, plans, tasks, calendar_events,
#   notifications(=Inbox), interventions, memory(=Execution Memory)

from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from .models import (
    CalendarEvent,
    ExecutionMemoryEntry,
    Goal,
    Intervention,
    Notification,
    Opportunity,
    Plan,
    Task,
    UserProfile,
)

_DEFAULT_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "execution" / "execution_db.json"

# (테이블명 -> pydantic 모델) 매핑. 저장/로드 시 이 매핑으로 직렬화한다.
_TABLES: dict[str, type[BaseModel]] = {
    "users": UserProfile,
    "opportunities": Opportunity,
    "goals": Goal,
    "plans": Plan,
    "tasks": Task,
    "calendar_events": CalendarEvent,
    "notifications": Notification,
    "interventions": Intervention,
    "memory": ExecutionMemoryEntry,
}


class ExecutionStore:
    """모든 실행 상태를 담는 단일 저장소. 스레드 안전(간단한 Lock)."""

    def __init__(self, db_path: Optional[Path] = None, autosave: bool = True):
        self.db_path = Path(db_path) if db_path else _DEFAULT_DB_PATH
        self.autosave = autosave
        self._lock = threading.RLock()
        self._data: dict[str, dict[str, dict]] = {t: {} for t in _TABLES}
        if self.db_path.exists():
            self.load()

    # --- 영속화 -------------------------------------------------------------

    def load(self) -> None:
        with self._lock:
            raw = json.loads(self.db_path.read_text(encoding="utf-8"))
            for table in _TABLES:
                self._data[table] = raw.get(table, {})

    def save(self) -> None:
        with self._lock:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            self.db_path.write_text(
                json.dumps(self._data, ensure_ascii=False, indent=2, default=str),
                encoding="utf-8",
            )

    def reset(self) -> None:
        """데모를 깨끗한 상태에서 다시 돌리기 위한 초기화."""
        with self._lock:
            self._data = {t: {} for t in _TABLES}
            if self.autosave:
                self.save()

    # --- 공통 upsert/get ----------------------------------------------------

    @staticmethod
    def _pk(obj: BaseModel) -> str:
        # 대부분 id를 PK로 쓰지만 UserProfile만 user_id를 쓴다.
        return getattr(obj, "id", None) or getattr(obj, "user_id")  # type: ignore[return-value]

    def _upsert(self, table: str, obj: BaseModel) -> None:
        with self._lock:
            self._data[table][self._pk(obj)] = json.loads(obj.model_dump_json())  # datetime -> ISO str
            if self.autosave:
                self.save()

    def _get(self, table: str, obj_id: str) -> Optional[BaseModel]:
        with self._lock:
            raw = self._data[table].get(obj_id)
            return _TABLES[table].model_validate(raw) if raw else None

    def _all(self, table: str) -> list[BaseModel]:
        with self._lock:
            model = _TABLES[table]
            return [model.model_validate(v) for v in self._data[table].values()]

    # --- 테이블별 얇은 래퍼 (가독성용) --------------------------------------

    def put_user(self, u: UserProfile) -> None: self._upsert("users", u)
    def get_user(self, uid: str) -> Optional[UserProfile]: return self._get("users", uid)  # type: ignore[return-value]

    def put_opportunity(self, o: Opportunity) -> None: self._upsert("opportunities", o)
    def get_opportunity(self, oid: str) -> Optional[Opportunity]: return self._get("opportunities", oid)  # type: ignore[return-value]

    def put_goal(self, g: Goal) -> None: self._upsert("goals", g)
    def get_goal(self, gid: str) -> Optional[Goal]: return self._get("goals", gid)  # type: ignore[return-value]
    def goals(self) -> list[Goal]: return self._all("goals")  # type: ignore[return-value]

    def put_plan(self, p: Plan) -> None: self._upsert("plans", p)
    def get_plan(self, pid: str) -> Optional[Plan]: return self._get("plans", pid)  # type: ignore[return-value]

    def put_task(self, t: Task) -> None: self._upsert("tasks", t)
    def get_task(self, tid: str) -> Optional[Task]: return self._get("tasks", tid)  # type: ignore[return-value]

    def tasks_for_goal(self, goal_id: str) -> list[Task]:
        ts = [t for t in self._all("tasks") if t.goal_id == goal_id]  # type: ignore[attr-defined]
        return sorted(ts, key=lambda t: t.order)

    def put_event(self, e: CalendarEvent) -> None: self._upsert("calendar_events", e)
    def get_event(self, eid: str) -> Optional[CalendarEvent]: return self._get("calendar_events", eid)  # type: ignore[return-value]
    def delete_event(self, eid: str) -> bool:
        with self._lock:
            existed = self._data["calendar_events"].pop(eid, None) is not None
            if existed and self.autosave:
                self.save()
            return existed

    def events_for_goal(self, goal_id: str) -> list[CalendarEvent]:
        es = [e for e in self._all("calendar_events") if e.goal_id == goal_id]  # type: ignore[attr-defined]
        return sorted(es, key=lambda e: e.start)

    def all_events(self) -> list[CalendarEvent]:
        return sorted(self._all("calendar_events"), key=lambda e: e.start)  # type: ignore[attr-defined,return-value]

    def put_notification(self, n: Notification) -> None: self._upsert("notifications", n)
    def get_notification(self, nid: str) -> Optional[Notification]: return self._get("notifications", nid)  # type: ignore[return-value]

    def notifications_for_user(self, user_id: str) -> list[Notification]:
        ns = [n for n in self._all("notifications") if n.user_id == user_id]  # type: ignore[attr-defined]
        return sorted(ns, key=lambda n: n.deliver_at or n.created_at)

    def pending_reminders(self) -> list[Notification]:
        """아직 전달되지 않은(delivered=False) 예약 알림."""
        return [n for n in self._all("notifications") if not n.delivered and n.deliver_at]  # type: ignore[attr-defined]

    def inbox(self, user_id: str) -> list[Notification]:
        """실제로 사용자에게 전달된(delivered=True) 알림만 — '받은 편지함'."""
        ns = [n for n in self.notifications_for_user(user_id) if n.delivered]
        return sorted(ns, key=lambda n: n.deliver_at or n.created_at, reverse=True)

    def put_intervention(self, i: Intervention) -> None: self._upsert("interventions", i)

    def put_memory(self, m: ExecutionMemoryEntry) -> None: self._upsert("memory", m)
    def memory_for_user(self, user_id: str) -> list[ExecutionMemoryEntry]:
        ms = [m for m in self._all("memory") if m.user_id == user_id]  # type: ignore[attr-defined]
        return sorted(ms, key=lambda m: m.created_at)

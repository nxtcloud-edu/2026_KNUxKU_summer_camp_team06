# OWNER: D (김나연)
# Execution Chat — 사용자와 계속 대화하며 실행을 조정하는 전용 챗 인터페이스.
#
# 사용자 설계의 "선택 → 전용 Chat Agent → ... → 사용자와 계속 대화 → 상황 바뀌면 재계획"에서
# '전용 Chat Agent' 부분. 로컬 모드에서는 규칙 기반 의도 파서로 처리하고(항상 동작),
# Bedrock 모드에서는 시스템 프롬프트로 LLM이 자유 대화로 처리한다(선택).
#
# 지원하는 의도:
#   - 리마인드 예약 : "마감 3일 전에 알려줘", "3일 전에 알림", "며칠 전에 알려줘"
#   - Task 완료     : "1번 끝냈어", "OO 완료", "이거 했어"
#   - 재계획        : "다시 계획해줘", "바빠서 못했어", "일정 다시"
#   - 진행 상태     : "진행률", "상태", "얼마나 남았어"

from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from .agent import ExecutionAgent
from .models import Goal, UserProfile


class ExecutionChat:
    """하나의 Goal에 묶인 실행 대화 세션."""

    def __init__(self, agent: ExecutionAgent, user: UserProfile, goal: Goal,
                 now: Optional[datetime] = None):
        self.agent = agent
        self.user = user
        self.goal = goal
        self.now = now or datetime.now()

    def set_now(self, now: datetime) -> None:
        self.now = now

    # --- 진입점 -------------------------------------------------------------

    def handle(self, message: str) -> str:
        msg = message.strip()

        # 1) "마감 N일 전에 알려줘"
        lead = self._parse_lead_days(msg)
        if lead is not None:
            noti = self.agent.add_deadline_reminder(self.goal, lead)
            if noti and noti.deliver_at:
                return (f"🔔 알겠어요. '{self.goal.title}' 마감 {lead}일 전인 "
                        f"{noti.deliver_at.date()}에 리마인드를 예약해뒀어요.")
            return "마감 정보가 없어서 리마인드 기준일을 잡을 수 없어요. 마감일을 알려주실래요?"

        # 2) 재계획 — "못했어"의 '했어'가 완료로 오인식되지 않게 완료보다 먼저 확인
        if re.search(r"(다시\s*계획|재계획|일정\s*다시|바빠|못\s*했|안\s*했|밀렸|미뤘)", msg):
            plan = self.agent.replan(self.goal, self.now, reason="사용자 요청(상황 변화)")
            events = self.agent.store.events_for_goal(self.goal.id)
            lines = [f"🔁 남은 일정을 마감까지 다시 배치했어요 (Plan v{plan.version}):"]
            for e in events:
                t = self.agent.store.get_task(e.task_id) if e.task_id else None
                if t and t.status.value != "done":
                    lines.append(f"  • {t.title} → {e.start.date()}")
            return "\n".join(lines)

        # 3) Task 완료
        task = self._match_done_task(msg)
        if task is not None:
            res = self.agent.mark_task_done(task.id, self.now)
            p = res["progress"]
            if res["completed"]:
                return f"✅ '{task.title}' 완료! 모든 Task를 끝냈어요. 🎉 목표 달성!"
            nxt = p["next_task"] if p else None
            tail = f" 다음은 '{nxt.title}'({nxt.due_at.date() if nxt.due_at else '미정'})이에요." if nxt else ""
            return f"✅ '{task.title}' 완료 처리했어요. 진행률 {p['progress']}%.{tail}"

        # 4) 진행 상태
        if re.search(r"(진행률|상태|얼마나|남았|어디까지)", msg):
            p = self.agent.tracker.refresh(self.goal, self.now)
            dleft = (self.goal.deadline - self.now).days if self.goal.deadline else None
            head = f"진행률 {p['progress']}% ({p['done']}/{p['total']})"
            if dleft is not None:
                head += f" · 마감까지 {dleft}일"
            nxt = p["next_task"]
            tail = f"\n다음 할 일: {nxt.title} ({nxt.due_at.date() if nxt.due_at else '미정'})" if nxt else ""
            return head + tail

        # 5) 규칙으로 못 잡은 자유 대화 → LLM에 위임
        #    - gemini: llm_client.chat_reply()  (기본, GEMINI_API_KEY 있을 때)
        #    - bedrock: strands 에이전트
        if getattr(self.agent, "llm_client", None) is not None:
            reply = self._llm_reply(msg)
            if reply:
                return reply
        if self.agent.provider == "bedrock":
            reply = self._bedrock_reply(msg)
            if reply:
                return reply

        return ("이렇게 말해보세요: '마감 3일 전에 알려줘', '1번 끝냈어', "
                "'다시 계획해줘', '진행률 알려줘'")

    # --- 의도 파서 ----------------------------------------------------------

    _LEAD_RE = re.compile(r"(\d+)\s*일\s*전")

    def _parse_lead_days(self, msg: str) -> Optional[int]:
        if not re.search(r"(알려|알림|리마인|noti|notify)", msg, re.IGNORECASE):
            return None
        m = self._LEAD_RE.search(msg)
        if m:
            return int(m.group(1))
        if "며칠 전" in msg or "미리" in msg:
            return self.user.default_reminder_lead_days  # 기본 리드타임
        return None

    def _match_done_task(self, msg: str):
        if re.search(r"(못\s*했|안\s*했|못\s*끝)", msg):  # "못했어"는 완료가 아니다
            return None
        if not re.search(r"(끝냈|끝냄|완료|했어|다\s*했|done)", msg, re.IGNORECASE):
            return None
        tasks = self.agent.store.tasks_for_goal(self.goal.id)
        pending = [t for t in tasks if t.status.value != "done"]
        # "N번" 형태
        m = re.search(r"(\d+)\s*번", msg)
        if m:
            idx = int(m.group(1)) - 1
            if 0 <= idx < len(tasks):
                return tasks[idx]
        # 제목 키워드 매칭
        for t in pending:
            key = t.title.split("·")[0][:4]
            if key and key in msg:
                return t
        # 아무 것도 특정 못하면 다음 할 일을 완료로 간주
        return pending[0] if pending else None

    def _llm_reply(self, msg: str) -> Optional[str]:
        """현재 실행 상황을 요약해 LLM에게 자유 대화 응답을 맡긴다 (Gemini)."""
        try:
            p = self.agent.tracker.refresh(self.goal, self.now)
            dleft = (self.goal.deadline - self.now).days if self.goal.deadline else None
            nxt = p["next_task"]
            context = (
                f"목표: {self.goal.title} ({self.goal.category})\n"
                f"마감: {self.goal.deadline} (남은 일수: {dleft})\n"
                f"진행률: {p['progress']}% ({p['done']}/{p['total']} 완료)\n"
                f"다음 할 일: {nxt.title if nxt else '없음'}"
                f"{(' · ' + str(nxt.due_at.date())) if nxt and nxt.due_at else ''}"
            )
            reply = self.agent.llm_client.chat_reply(context, msg)
            return reply or None
        except Exception:
            return None

    def _bedrock_reply(self, msg: str) -> Optional[str]:
        try:
            from strands import Agent
            from strands.models import BedrockModel

            from .prompts import EXECUTION_SYSTEM_PROMPT
            from .tools import build_strands_tools

            model = BedrockModel(region_name="us-west-2")
            agent = Agent(
                model=model,
                system_prompt=EXECUTION_SYSTEM_PROMPT,
                tools=build_strands_tools(self.agent.store, self.user.user_id, self.goal),
            )
            return str(agent(msg))
        except Exception:
            return None

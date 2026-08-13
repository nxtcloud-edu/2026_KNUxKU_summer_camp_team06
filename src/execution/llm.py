# OWNER: D (김나연)
# Execution Agent의 LLM 연동 계층.
#
# B(신민서) 파트와 동일한 철학: 인터페이스(Protocol) 고정 + provider는 환경변수로 스위치.
#   - GEMINI_API_KEY 가 있으면 Gemini(gemini-flash-latest)로 실제 LLM 호출 (기본)
#   - 없으면 None 을 반환해 modules.py의 결정론 템플릿으로 폴백 → AWS/키 없이도 데모가 돈다
#   - AWS 확정 시 BedrockExecutionLLMClient 를 추가하고 _default_execution_llm()만 바꾸면 됨
#
# LLM이 담당하는 것(이해/생성):
#   - decompose_tasks(): 공고 원문을 읽고 '실제로 해야 할 일'을 순서 있는 Task로 분해
#     → 이 결과가 Planner(마감 역산)를 거쳐 Calendar Tool로 캘린더에 등록된다.
#   - chat_reply(): 규칙으로 못 잡는 자유 대화에 자연스러운 한국어로 응답
# LLM이 담당하지 않는 것(R5, 순수 함수 유지): 마감 파싱, 날짜 배치, 진행률 계산.
# 날짜/수치는 코드가 계산하므로 LLM이 무엇을 반환하든 일정의 정확성은 코드가 보장한다.

from __future__ import annotations

import json
import os
from typing import Optional, Protocol

from dotenv import load_dotenv

from .models import Opportunity, UserProfile

load_dotenv()


class ExecutionLLMClient(Protocol):
    def decompose_tasks(
        self, opportunity: Opportunity, user: UserProfile, deadline_str: str
    ) -> list[dict]:
        """[{"title","description","estimated_hours","tags"}] 형태의 순서 있는 Task 리스트."""
        ...

    def chat_reply(self, context: str, message: str) -> str:
        """자유 대화 1턴 응답(한국어)."""
        ...


# --- 프롬프트 ----------------------------------------------------------------

_DECOMPOSE_PROMPT = """당신은 청년의 '기회 실행'을 돕는 에이전트입니다. 아래 공고를 실제로 지원/완료하려면
무엇을 순서대로 해야 하는지, 구체적이고 실행 가능한 Task로 쪼개세요.

공고 제목: {title}
카테고리: {category}
주관: {org}
마감: {deadline}
공고 원문:
---
{raw_text}
---
사용자: {user_name} ({user_status}, {user_region})

규칙:
- 4~8개의 Task로 나눕니다. 각 Task는 사용자가 "오늘 이걸 하면 된다"고 알 만큼 구체적으로.
- 순서대로 배열합니다(먼저 할 일이 앞). 마지막 Task는 반드시 '제출/신청' 성격이어야 합니다.
- 공고 원문에서 실제로 요구하는 것(팀 구성, 제출물, 필요 서류, 면접, 코딩테스트 등)을 반영합니다.
- estimated_hours 는 현실적인 소요 시간(0.5~12 사이의 숫자)입니다.
- 날짜/마감일은 쓰지 마세요. 일정 배치는 별도 로직이 담당합니다.
- 오직 JSON 배열만 출력합니다.

출력 형식:
[{{"title": "...", "description": "...", "estimated_hours": 2.0, "tags": ["..."]}}]
"""

_CHAT_PROMPT = """당신은 청년의 기회 실행을 끝까지 돕는 '실행 에이전트'입니다. 아래는 현재 실행 상황입니다.
{context}

사용자 메시지: "{message}"

위 상황을 바탕으로, 사용자가 실제로 다음 행동을 하도록 돕는 짧고 다정한 한국어 답변을 하세요.
1~3문장. 이미 처리된 일을 다시 시키지 말고, 다음에 할 일을 콕 집어 안내하세요."""


# --- Gemini 구현 -------------------------------------------------------------


class GeminiExecutionLLMClient:
    """Gemini(gemini-flash-latest) 기반 실제 LLM 연동. B 파트와 같은 SDK/설정."""

    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-flash-latest"):
        from google import genai  # 지연 import: 미설치 환경 보호

        api_key = api_key or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다 (.env 확인)")
        self._client = genai.Client(api_key=api_key)
        self._model = model

    def decompose_tasks(
        self, opportunity: Opportunity, user: UserProfile, deadline_str: str
    ) -> list[dict]:
        from google.genai import types as genai_types

        prompt = _DECOMPOSE_PROMPT.format(
            title=opportunity.title,
            category=opportunity.category,
            org=opportunity.org or "-",
            deadline=deadline_str,
            raw_text=(opportunity.raw_text or "")[:4000],
            user_name=user.name,
            user_status=user.status or "-",
            user_region=user.region or "-",
        )
        resp = self._client.models.generate_content(
            model=self._model,
            contents=prompt,
            config=genai_types.GenerateContentConfig(response_mime_type="application/json"),
        )
        data = json.loads(resp.text)
        return data if isinstance(data, list) else []

    def chat_reply(self, context: str, message: str) -> str:
        resp = self._client.models.generate_content(
            model=self._model,
            contents=_CHAT_PROMPT.format(context=context, message=message),
        )
        return (resp.text or "").strip()


def _default_execution_llm() -> Optional[ExecutionLLMClient]:
    """GEMINI_API_KEY가 있으면 Gemini 클라이언트, 없으면 None(→ 결정론 폴백)."""
    if os.environ.get("GEMINI_API_KEY"):
        try:
            return GeminiExecutionLLMClient()
        except Exception:
            return None
    return None

"""Small JSON boundary between the KEEP:ON web server and C/D Python agents."""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from src.execution.agent import ExecutionAgent
from src.execution.models import EligibilityDecision, ExecutionContext, Opportunity, UserProfile
from src.execution.store import ExecutionStore
from src.decision_engine import evaluate_opportunity
from src.c_integration import execution_decision_for_selected
from src.recommendation_service import ProfileSubmission, RecommendationService


def opportunity_record(row: dict) -> dict:
    """Adapt KEEP:ON public.opportunities to D's Opportunity input contract."""
    return {
        "id": str(row["id"]),
        "title": row.get("title") or "정리가 필요한 저장 항목",
        "org": row.get("author"),
        "category": row.get("category") or "기타",
        "url": row.get("source_url") or row.get("canonical_url"),
        "raw_text": row.get("body") or row.get("summary") or "",
        "deadline_text": row.get("deadline"),
        "collected_at": row.get("created_at"),
    }


def service(request: dict) -> RecommendationService:
    opportunities = request.get("opportunities")
    normalizations = request.get("normalizations")
    if isinstance(opportunities, list) and isinstance(normalizations, list):
        # 마이그레이션 이전에 저장된 항목은 normalized_opportunities 행이 없을 수 있다.
        # 그런 항목도 C의 선택/판정 대상에는 넣되, 조건이 없다는 사실을 명시한다.
        normalized_ids = {
            str(row.get("opportunity_id"))
            for row in normalizations
            if row.get("content_category")
        }
        missing_normalizations = [
            {
                "opportunity_id": str(row["id"]),
                "content_category": "general_info",
                "conditions": [],
                "status": "partial",
                "notes": "정규화 결과가 없는 기존 저장 항목",
            }
            for row in opportunities
            if row.get("id") and str(row["id"]) not in normalized_ids
        ]
        return RecommendationService.from_b_records(
            [opportunity_record(row) for row in opportunities], normalizations + missing_normalizations
        )
    return RecommendationService.from_b_files(
        ROOT / "data" / "opportunities.json",
        ROOT / "data" / "normalization_results.json",
    )


def profile_for_execution(user_id: str, payload: dict) -> UserProfile:
    weekly_hours = payload.get("weekly_available_hours")
    return UserProfile(
        user_id=user_id,
        region=payload.get("region"),
        birth_date=payload.get("birth_date"),
        status=payload.get("status"),
        interests=payload.get("interests", []),
        daily_capacity_hours=(float(weekly_hours) / 7) if weekly_hours else 2.0,
    )


def recommendation_card_feed(feed) -> dict:
    """Adapt C's decision result to the concise recommendation-card contract."""

    label_by_level = {
        "high": "추천",
        "medium": "검토 필요",
        "low": "지금 확인",
    }
    cards = []
    for decision in feed.recommendations:
        ranking = decision.ranking
        cards.append({
            "opportunity_id": ranking.opportunity_id,
            "score": ranking.score,
            "rank": ranking.rank or len(cards) + 1,
            "label": label_by_level.get(ranking.recommendation.value, "조건 확인 필요"),
            "rationale": decision.eligibility.reason,
            "factors": ranking.reasons[:4],
        })
    return {
        "liked_opportunity_ids": feed.liked_opportunity_ids,
        "recommendations": cards,
        "follow_up_questions": feed.follow_up_questions,
    }


def run(request: dict) -> dict:
    command = request["command"]
    if command == "normalize":
        # Recommendation and eligibility calls must not require Flask.
        from src.bridge_server import build_normalize_response
        # extraction/normalization은 B의 결정론적 정규식 파이프라인(src/bridge_server.py)을
        # 그대로 서브프로세스 경로로 태운다 — 별도 상태(opportunities/normalizations)가
        # 필요 없어서 다른 커맨드보다 앞에서 처리한다.
        return build_normalize_response(request.get("payload") or request)

    agent_service = service(request)
    if command == "dashboard":
        items = agent_service.dashboard(
            recent_ids=request.get("recent_ids"),
            popular_ids=request.get("popular_ids"),
        )
        return {"items": [item.model_dump(mode="json") for item in items]}

    if command in {"recommend", "evaluate"}:
        profile = ProfileSubmission.model_validate(request["profile"])
        likes = request.get("liked_opportunity_ids", [])
        feed = agent_service.recommend(profile, likes)
        if command == "recommend":
            return recommendation_card_feed(feed)
        opportunity_id = request["opportunity_id"]
        entry = agent_service._by_id.get(opportunity_id)
        if entry is None:
            raise ValueError("Selected opportunity ID is not available to the decision agent.")
        decision_result = evaluate_opportunity(profile.to_decision_profile(), entry.input)
        if command == "evaluate":
            return decision_result.model_dump(mode="json")

    if command == "execution":
        opportunity_id = request["opportunity_id"]
        # Planning은 자격 판정이 아니라 사용자가 저장한 정보를 실행 순서로 바꾸는 기능이다.
        # 캘린더 반영은 프론트의 명시적 승인 이후에만 이뤄진다.
        decision = EligibilityDecision(
            opportunity_id=opportunity_id,
            user_id=request["user_id"],
            eligible=True,
            reason="사용자가 요청한 계획 초안입니다.",
        )
        records = request.get("opportunities")
        if isinstance(records, list):
            records = [opportunity_record(row) for row in records]
        else:
            records = json.loads((ROOT / "data" / "opportunities.json").read_text(encoding="utf-8"))["opportunities"]
        record = next((item for item in records if item["id"] == decision.opportunity_id), None)
        if record is None:
            raise ValueError("Selected opportunity ID is not available to the execution agent.")
        context = ExecutionContext(
            user=profile_for_execution(request["user_id"], request.get("profile", {})),
            opportunity=Opportunity.model_validate(record),
            decision=decision,
            now=datetime.now(),
        )
        # Cloud Run의 서버 전용 GEMINI_API_KEY로 Planning Agent를 실행한다.
        # 키/응답 오류 때만 ExecutionAgent 내부의 안전한 템플릿 폴백이 사용된다.
        result = ExecutionAgent(store=ExecutionStore(autosave=False), provider="gemini").start(context)
        if result.goal.meta.get("task_source") != "gemini":
            raise ValueError("Gemini Planning Agent가 계획을 만들지 못했습니다. 템플릿 계획은 저장하지 않았습니다.")
        return {
            "decision": decision.model_dump(mode="json"),
            "goal": result.goal.model_dump(mode="json"),
            "tasks": [task.model_dump(mode="json") for task in result.tasks],
            "events": [event.model_dump(mode="json") for event in result.events],
            "reminders": [reminder.model_dump(mode="json") for reminder in result.reminders],
            "planning_source": result.goal.meta.get("task_source"),
        }
    raise ValueError("Unsupported agent command.")


if __name__ == "__main__":
    try:
        print(json.dumps(run(json.load(sys.stdin)), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        raise SystemExit(1)

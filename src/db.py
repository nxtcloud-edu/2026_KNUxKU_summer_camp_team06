"""
OWNER: B (신민서)

extract()/normalize()의 결과를 Supabase에 저장하는 얇은 레이어.

설계 원칙: extraction_agent.py의 extract()와 normalization_agent.py의 normalize()는
순수 함수로 유지한다(부수효과 없음, 입력→출력만). 저장(부수효과)은 이 모듈이 별도로
담당하며, Supervisor(A)가 "extract() -> save_saved_context() -> normalize() ->
save_normalization_result()" 순서로 조합해서 호출하는 구조를 가정한다.
자세한 스키마 설계는 docs/db_schema.md 참고.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Optional

from dotenv import load_dotenv
from supabase import Client, create_client

from src.extraction_agent import SavedContext
from src.normalization_agent import NormalizationResult

load_dotenv()


@lru_cache(maxsize=1)
def get_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_KEY"]
    return create_client(url, key)


def save_saved_context(context: SavedContext, user_id: Optional[str] = None) -> str:
    """SavedContext를 saved_items 테이블에 저장하고 새 row의 id를 반환한다."""
    payload = {
        "user_id": user_id,
        "source_type": context.source_type.value,
        "source_value": context.source_value,
        "title": context.title,
        "raw_text": context.raw_text,
        "status": context.status.value,
        "error_reason": context.error_reason,
        "fetched_at": context.fetched_at.isoformat(),
    }
    result = get_client().table("saved_items").insert(payload).execute()
    return result.data[0]["id"]


def save_normalization_result(result: NormalizationResult, saved_item_id: str) -> str:
    """NormalizationResult를 normalized_opportunities 테이블에 저장하고 새 row의 id를 반환한다."""
    payload = {
        "saved_item_id": saved_item_id,
        "source_opportunity_key": result.opportunity_id,
        "content_category": result.content_category.value if result.content_category else None,
        "conditions": [c.model_dump(mode="json") for c in result.conditions],
        "status": result.status,
        "notes": result.notes,
    }
    row = get_client().table("normalized_opportunities").insert(payload).execute()
    return row.data[0]["id"]


if __name__ == "__main__":
    from src.extraction_agent import extract_from_text
    from src.normalization_agent import normalize

    context = extract_from_text(
        "2026 청년 창업 지원사업 공고\n"
        "신청기간: 2026.8.1 ~ 8.22\n"
        "만 19~34세, 서울시 거주자만 지원 가능"
    )
    saved_id = save_saved_context(context)
    print(f"saved_items.id = {saved_id}")

    result = normalize(saved_id, context.raw_text)
    norm_id = save_normalization_result(result, saved_id)
    print(f"normalized_opportunities.id = {norm_id}")

    # 정리
    get_client().table("saved_items").delete().eq("id", saved_id).execute()
    print("테스트 데이터 정리 완료")

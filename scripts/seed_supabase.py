"""
OWNER: B (신민서)

data/opportunities.json(원문 20건) + data/normalization_results.json(정규화 결과)를
Supabase의 saved_items / normalized_opportunities 테이블에 적재한다.

이미 로컬에서 검증된 결과를 그대로 옮기는 것이라 API를 다시 호출하지 않는다
(빠르고, data/normalization_results.json과 DB 내용이 항상 일치함이 보장됨).

실행: python -m scripts.seed_supabase
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from src.db import get_client

REPO_ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    opportunities = json.loads((REPO_ROOT / "data" / "opportunities.json").read_text(encoding="utf-8"))["opportunities"]
    normalized = json.loads((REPO_ROOT / "data" / "normalization_results.json").read_text(encoding="utf-8"))
    normalized_by_id = {n["opportunity_id"]: n for n in normalized}

    client = get_client()
    inserted = 0
    for opp in opportunities:
        saved_row = client.table("saved_items").insert({
            "source_type": "link",
            "source_value": opp["url"],
            "title": opp["title"],
            "raw_text": opp["raw_text"],
            "status": "ok",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        saved_item_id = saved_row.data[0]["id"]

        norm = normalized_by_id.get(opp["id"])
        if norm is None:
            continue

        client.table("normalized_opportunities").insert({
            "saved_item_id": saved_item_id,
            "content_category": norm.get("content_category"),
            "conditions": norm.get("conditions", []),
            "status": norm["status"],
            "notes": norm.get("notes"),
        }).execute()
        inserted += 1

    print(f"{inserted}건 적재 완료 (saved_items + normalized_opportunities)")


if __name__ == "__main__":
    main()

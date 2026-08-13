"""
OWNER: B (신민서)

Node(A)의 server/workflow.js가 NORMALIZING 단계에서 호출하는 브릿지 서버.
extraction_agent.py/normalization_agent.py를 그대로 감싸고, A의 기존 카드 필드
(title/summary/category/deadline)도 함께 채워 workflow.js 쪽 변경을 한 줄로 줄인다.
자세한 설계 이유는 docs/merge_plan_a_b.md 참고.

계약: 입력은 Node의 `extracted` 객체(shared/contracts.js 기준 필드: canonical_url,
source_url, platform, title, body/body_text, author, published_at, links, evidence,
deadline_text)와 호환되는 JSON. 출력은 기존 normalization-agent.js가 반환하던 필드
(canonical_url~normalization_method)에 B의 구조화 결과(content_category, conditions,
status)를 얹은 것이다.

실행: python -m src.bridge_server (기본 포트 5001, BRIDGE_PORT 환경변수로 변경 가능)
"""

from __future__ import annotations

import os
import re
from datetime import date
from typing import Optional

from dotenv import load_dotenv
from flask import Flask, jsonify, request

from src.extraction_agent import extract_from_text
from src.normalization_agent import normalize

load_dotenv()

app = Flask(__name__)

# A의 3종 카드 분류(Competition/Support/Benefit)를 B의 구조화 결과에서 유도한다.
# 정밀한 분류가 목적이 아니라, 기존 Node UI 카드가 그대로 동작하도록 최소 매핑만 한다 —
# 정밀한 판정/분류는 여전히 C(eligibility_agent)의 몫이다 (R1).
_CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("Competition", ("공모전", "해커톤", "경진대회", "contest", "competition", "hackathon")),
    ("Support", ("지원사업", "정부지원", "정책", "지원금", "모집", "프로그램", "부트캠프", "서포터즈")),
    ("Benefit", ("할인", "무료", "혜택", "쿠폰", "benefit", "discount")),
]


def _derive_category(content_category: Optional[str], raw_text: str) -> Optional[str]:
    if content_category != "opportunity":
        return None
    lowered = raw_text.lower()
    for category, keywords in _CATEGORY_KEYWORDS:
        if any(kw.lower() in lowered for kw in keywords):
            return category
    return "Support"  # opportunity인데 키워드로 못 맞추면 가장 흔한 값으로 명시적 폴백


_DATE_WITH_YEAR = re.compile(r"(\d{4})[.\-년]\s*(\d{1,2})[.\-월]\s*(\d{1,2})")
_DATE_NO_YEAR = re.compile(r"(?<!\d)(\d{1,2})[.\-월]\s*(\d{1,2})")
_RANGE_SEP = re.compile(r"[~\-–]")


def _derive_deadline(conditions: list[dict]) -> Optional[str]:
    """period 타입 조건의 raw_quote에서 마감(종료)일 하나를 뽑는다. 확신 없으면 None (R4).

    "2026.8.1 ~ 8.22" 같은 범위는 구분자로 앞/뒤를 나눠 **뒷부분(마감)**을 우선 파싱한다.
    뒷부분에 연도 표기가 없는 관례적 표기(예: "~ 8.22")는 앞부분의 연도를 이어받는다.
    범위가 아니라 단일 마감일(operator=equals)이면 전체를 그대로 파싱한다."""
    for c in conditions:
        if c.get("type") != "period":
            continue
        quote = c.get("raw_quote", "")
        parts = _RANGE_SEP.split(quote, maxsplit=1)
        end_part = parts[1] if len(parts) == 2 else quote

        m = _DATE_WITH_YEAR.search(end_part)
        if m:
            y, mo, d = m.groups()
        else:
            m2 = _DATE_NO_YEAR.search(end_part)
            if not m2:
                continue
            mo, d = m2.groups()
            front_match = _DATE_WITH_YEAR.search(parts[0]) if len(parts) == 2 else None
            y = front_match.group(1) if front_match else str(date.today().year)

        try:
            return date(int(y), int(mo), int(d)).isoformat()
        except ValueError:
            continue
    return None


def _failed_response(payload: dict, body_text: str, reason: str) -> dict:
    return {
        "canonical_url": payload.get("canonical_url"),
        "source_url": payload.get("source_url"),
        "platform": payload.get("platform"),
        "title": payload.get("title"),
        "summary": None,
        "body": body_text,
        "author": payload.get("author"),
        "published_at": payload.get("published_at"),
        "category": None,
        "deadline": None,
        "links": payload.get("links", []),
        "evidence": payload.get("evidence", []),
        "confidence": 0.0,
        "normalization_method": "python_structured",
        "content_category": None,
        "conditions": [],
        "status": "failed",
        "notes": reason,
    }


@app.post("/normalize")
def normalize_endpoint():
    payload = request.get_json(force=True) or {}
    body_text = payload.get("body_text") or payload.get("body") or ""

    context = extract_from_text(body_text) if body_text.strip() else None
    if context is None or context.status.value == "failed":
        reason = context.error_reason if context else "body_text가 비어있음"
        return jsonify(_failed_response(payload, body_text, reason)), 200

    intake_id = payload.get("intake_id") or payload.get("canonical_url") or "unknown"
    result = normalize(intake_id, context.raw_text)
    conditions = [c.model_dump(mode="json") for c in result.conditions]
    content_category = result.content_category.value if result.content_category else None

    return jsonify({
        "canonical_url": payload.get("canonical_url"),
        "source_url": payload.get("source_url"),
        "platform": payload.get("platform"),
        "title": payload.get("title") or context.title,
        "summary": (context.raw_text or "")[:400],
        "body": context.raw_text,
        "author": payload.get("author"),
        "published_at": payload.get("published_at"),
        "category": _derive_category(content_category, context.raw_text or ""),
        "deadline": _derive_deadline(conditions),
        "links": payload.get("links", []),
        "evidence": payload.get("evidence", []),
        "confidence": 0.9 if result.status == "ok" else 0.5,
        "normalization_method": "python_structured",
        "content_category": content_category,
        "conditions": conditions,
        "status": result.status,
        "notes": result.notes,
    })


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("BRIDGE_PORT", "5001"))
    app.run(host="127.0.0.1", port=port)

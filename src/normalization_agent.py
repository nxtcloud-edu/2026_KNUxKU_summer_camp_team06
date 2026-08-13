"""
OWNER: B (신민서)

역할: 공고 원문(raw_text) -> 자격 조건 8종(NormalizationResult) 구조화

Project.md 규칙 준수 (특히 R2가 가장 중요):
- R1: 여기서는 "구조화"만 한다. 적격 여부 판정은 C(eligibility_agent.py)의 몫이다.
- R2: 조건 하나마다 원문 인용(raw_quote)과 원문 내 위치(span)를 반환한다.
      원문에 없는 내용은 절대 생성하지 않는다. 모르면 None.
      -> 이 파일의 `_verify_grounding()`이 이를 코드로 강제한다: raw_text에
         실제로 존재하지 않는 raw_quote는 결과에서 제거한다.
- R3: 실패는 실패로 표현한다 (ok/partial/failed).
- R4: "성실히 수행 가능한 자" 같은 모호한 조건은 type=etc, operator=unknown으로 두고
      임의 해석하지 않는다.
- R5: 나이/기간 계산 등은 LLM이 아닌 순수 함수(정규식 + 파이썬 로직)로 처리한다.

LLM 제공자: AWS 채택이 아직 불확실해서 Gemini API로 실제 LLM 연동을 붙였다 (extraction_agent.py와
동일한 이유). `.env`에 GEMINI_API_KEY가 없으면 자동으로 MockNormalizationLLMClient로 폴백한다.
Gemini가 뭘 반환하든 `_verify_grounding()`이 원문에 없는 raw_quote를 무조건 걸러내므로, LLM
제공자가 바뀌어도 R2 안전장치는 그대로 유지된다.

주의: 아래 스키마는 초안이다. A가 src/models.py로 통합하면 그쪽 import로 교체한다.
"""

from __future__ import annotations

import json
import os
import re
from enum import Enum
from typing import Any, Literal, Optional, Protocol

from dotenv import load_dotenv
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel

load_dotenv()


# --- 초안 스키마 (A의 models.py로 이관 예정) ---------------------------------


class ConditionType(str, Enum):
    AGE = "age"
    REGION = "region"
    STATUS = "status"
    INCOME = "income"
    DUPLICATE = "duplicate"
    MILITARY = "military"
    PERIOD = "period"
    ETC = "etc"


class Operator(str, Enum):
    GTE = "gte"
    LTE = "lte"
    BETWEEN = "between"
    EQUALS = "equals"
    IN = "in"
    UNKNOWN = "unknown"  # R4: 모호하면 항상 이 값


class EligibilityCondition(BaseModel):
    type: ConditionType
    operator: Operator
    value: Optional[Any] = None  # 모르면 None (R2)
    raw_quote: str  # 원문 인용 — 반드시 raw_text의 부분 문자열이어야 함 (R2)
    span: tuple[int, int]  # raw_text 내 (start, end) 문자 위치


class ContentCategory(str, Enum):
    """사용자가 저장하는 건 지원사업만이 아니다 (예: 인스타 정보성 게시물, 행사/티켓
    공지). 8종 조건 중 뭐가 뽑혔는지로 자동 분류한다 — 별도 분류기 없이, 이미 하는
    추출 작업의 부산물로 판단한다.

    - OPPORTUNITY: 개인 자격조건(나이/지역/신분/소득/중복/병역) 있음 → C의 적격 판정 필요
    - TIME_SENSITIVE_INFO: 자격조건은 없지만 마감/기간은 있음 (예: 행사 티켓 판매기간)
      → C의 판정은 불필요, D의 일정 알림 대상
    - GENERAL_INFO: 조건도 마감도 없음 (예: 툴 소개, 팁) → 그냥 저장, 판정/마감 없이
      "해볼래?" 형태의 제안 대상
    """

    OPPORTUNITY = "opportunity"
    TIME_SENSITIVE_INFO = "time_sensitive_info"
    GENERAL_INFO = "general_info"


_PERSONAL_ELIGIBILITY_TYPES = {
    ConditionType.AGE,
    ConditionType.REGION,
    ConditionType.STATUS,
    ConditionType.INCOME,
    ConditionType.DUPLICATE,
    ConditionType.MILITARY,
}


def _classify_content(conditions: list[EligibilityCondition]) -> ContentCategory:
    if any(c.type in _PERSONAL_ELIGIBILITY_TYPES for c in conditions):
        return ContentCategory.OPPORTUNITY
    if any(c.type == ConditionType.PERIOD for c in conditions):
        return ContentCategory.TIME_SENSITIVE_INFO
    return ContentCategory.GENERAL_INFO


class NormalizationResult(BaseModel):
    opportunity_id: str
    content_category: Optional[ContentCategory] = None  # status=failed면 분류 불가로 None
    conditions: list[EligibilityCondition] = []
    status: Literal["ok", "partial", "failed"]
    notes: Optional[str] = None


# --- R2 강제: 원문에 없는 인용은 결과에서 제거 --------------------------------


def _verify_grounding(
    raw_quote: str, raw_text: str
) -> Optional[tuple[int, int]]:
    """raw_quote가 raw_text에 실제로 존재하는지 확인하고 span을 반환한다.
    존재하지 않으면 None (해당 condition은 버려진다 — 절대 추측 span을 만들지 않는다)."""
    idx = raw_text.find(raw_quote)
    if idx == -1:
        return None
    return (idx, idx + len(raw_quote))


# --- R5: 나이 조건은 정규식 + 순수 함수로 처리 (LLM 미사용) ------------------
#
# 실제 20건 공고를 돌려본 결과 표기법이 예상보다 다양했다 (예: "만 19세~ 39세",
# "19세 이상 45세 이하", "만 28세 이하" 단일 상한, "만 30세(1996년생) ~ 만 39세(1987년생)"
# 처럼 괄호 부연 포함). 패턴을 여러 개 두고 우선순위대로 시도하되, 겹치는 span은
# 먼저 매칭된 것만 채택해 같은 문구가 두 조건으로 중복 추출되지 않게 한다.

_AGE_RANGE_PATTERN = re.compile(
    r"만?\s*(\d{1,2})\s*세?(?:\s*\([^)]{0,12}\))?\s*[~\-–]\s*(?:만\s*)?(\d{1,2})\s*세(?:\s*\([^)]{0,12}\))?"
)
_AGE_ISANG_IHA_PATTERN = re.compile(r"(\d{1,2})\s*세\s*이상\s*(\d{1,2})\s*세\s*이하")
_AGE_IHA_ONLY_PATTERN = re.compile(r"만\s*(\d{1,2})\s*세\s*이하")
_AGE_ISANG_ONLY_PATTERN = re.compile(r"만\s*(\d{1,2})\s*세\s*이상(?!\s*\d)")


def _extract_age_conditions(raw_text: str) -> list[EligibilityCondition]:
    conditions: list[EligibilityCondition] = []
    consumed: list[tuple[int, int]] = []

    def _overlaps(span: tuple[int, int]) -> bool:
        return any(span[0] < e and s < span[1] for s, e in consumed)

    def _try(pattern: re.Pattern, operator: Operator, value_fn) -> None:
        for m in pattern.finditer(raw_text):
            span = (m.start(), m.end())
            if _overlaps(span):
                continue
            verified = _verify_grounding(m.group(0), raw_text)
            if verified is None:
                continue
            consumed.append(span)
            conditions.append(
                EligibilityCondition(
                    type=ConditionType.AGE,
                    operator=operator,
                    value=value_fn(m),
                    raw_quote=m.group(0),
                    span=verified,
                )
            )

    # 우선순위: 범위(만~세, 이상~이하) 먼저, 그 다음 단일 상/하한
    _try(_AGE_RANGE_PATTERN, Operator.BETWEEN, lambda m: [int(m.group(1)), int(m.group(2))])
    _try(_AGE_ISANG_IHA_PATTERN, Operator.BETWEEN, lambda m: [int(m.group(1)), int(m.group(2))])
    _try(_AGE_IHA_ONLY_PATTERN, Operator.LTE, lambda m: int(m.group(1)))
    _try(_AGE_ISANG_ONLY_PATTERN, Operator.GTE, lambda m: int(m.group(1)))

    return conditions


# --- R5: 신청기간도 정규식 기반 (LLM 미사용) ---------------------------------
#
# 실제 공고는 "2026. 2. 3." (점 뒤 공백), "2026.03.06"(공백 없음), "2026년 02월 09일"
# (한글 년월일), "(월)/(화)" 요일 표기, "09:00" 시각 표기가 섞여 나타난다. 두 계열
# (점 표기 / 한글 표기)을 각각 지원한다. "상시모집"처럼 종료일이 없는 경우는
# 의도적으로 매칭하지 않는다 (없는 날짜를 추측하지 않음, R2).

_PERIOD_DOT_PATTERN = re.compile(
    r"\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?(?:\s*\([^)]{1,4}\))?(?:\s*\d{1,2}:\d{2})?"
    r"\s*[~\-–]\s*"
    r"(?:\d{4}\.\s*)?\d{1,2}\.\s*\d{1,2}\.?(?:\s*\([^)]{1,4}\))?(?:\s*\d{1,2}:\d{2})?"
)
_PERIOD_KOREAN_PATTERN = re.compile(
    r"\d{4}년\s*\d{1,2}월\s*\d{1,2}일(?:\s*\([^)]{1,4}\))?(?:\s*\d{1,2}:\d{2})?"
    r"\s*[~\-–]\s*"
    r"(?:\d{4}년\s*)?\d{1,2}월\s*\d{1,2}일(?:\s*\([^)]{1,4}\))?(?:\s*\d{1,2}:\d{2})?"
)
# 범위("A~B")가 아니라 "신청기한: 2026. 7. 17." 처럼 단일 마감일 하나만 있는 경우.
# 실제로 "2026 Summer Agentic AI 캠프" 공고문 테스트 중 발견 — 범위 패턴만으로는
# 이런 단일 날짜 마감을 아예 못 잡는 문제가 있었다. 범위 패턴이 이미 소비한 span과
# 겹치면 건너뛴다(같은 날짜가 두 조건으로 중복 추출되지 않도록).
_PERIOD_SINGLE_DOT_PATTERN = re.compile(
    r"\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?(?:\s*\([^)]{1,4}\))?(?:\s*\d{1,2}:\d{2})?"
)
_PERIOD_SINGLE_KOREAN_PATTERN = re.compile(
    r"\d{4}년\s*\d{1,2}월\s*\d{1,2}일(?:\s*\([^)]{1,4}\))?(?:\s*\d{1,2}:\d{2})?"
)


def _extract_period_conditions(raw_text: str) -> list[EligibilityCondition]:
    conditions: list[EligibilityCondition] = []
    consumed: list[tuple[int, int]] = []

    def _overlaps(span: tuple[int, int]) -> bool:
        return any(span[0] < e and s < span[1] for s, e in consumed)

    def _try(pattern: re.Pattern, operator: Operator) -> None:
        for m in pattern.finditer(raw_text):
            span = (m.start(), m.end())
            if _overlaps(span):
                continue
            verified = _verify_grounding(m.group(0), raw_text)
            if verified is None:
                continue
            consumed.append(span)
            conditions.append(
                EligibilityCondition(
                    type=ConditionType.PERIOD,
                    operator=operator,
                    value=None,  # 실제 날짜 파싱/검증은 C 또는 별도 유틸에서 (R5: 순수 함수로)
                    raw_quote=m.group(0),
                    span=verified,
                )
            )

    # 우선순위: 범위(A~B) 먼저, 그 다음 단일 마감일
    _try(_PERIOD_DOT_PATTERN, Operator.BETWEEN)
    _try(_PERIOD_KOREAN_PATTERN, Operator.BETWEEN)
    _try(_PERIOD_SINGLE_DOT_PATTERN, Operator.EQUALS)
    _try(_PERIOD_SINGLE_KOREAN_PATTERN, Operator.EQUALS)

    return conditions


# --- LLM 인터페이스 (지금은 mock, AWS 발급 후 Bedrock/Strands로 교체) ---------
# region/status/income/duplicate/military/etc 는 표현이 워낙 다양해 정규식만으로는
# 부족하다. 실제 서비스에서는 LLM이 후보 조건(raw_quote 포함)을 제안하고,
# 이 파일의 _verify_grounding()이 그 인용이 실재하는지 다시 한번 코드로 검증한다.


class NormalizationLLMClient(Protocol):
    def extract_conditions(self, raw_text: str) -> list[dict]:
        """[{"type": "...", "operator": "...", "value": ..., "raw_quote": "..."}] 형태로 반환.
        raw_quote는 반드시 raw_text의 부분 문자열이어야 한다 (아니면 이후 검증에서 버려짐)."""
        ...


# 키워드 -> 조건 타입 매핑. 실제 LLM 연동 전까지 mock이 사용하는 최소 신호.
# 실제 20건 공고를 돌려본 뒤 놓친 표현("주민등록", "유사 사업"(공백 포함), "수혜 중인",
# "성실한")을 보강했다. 그래도 놓치는 표현은 반드시 있다 — mock의 한계이며,
# AWS 연동 후 실제 LLM으로 교체하면 표현 다양성 문제가 근본적으로 개선된다.
_KEYWORD_HINTS: list[tuple[str, ConditionType]] = [
    ("거주", ConditionType.REGION),
    ("주민등록", ConditionType.REGION),
    ("재학생", ConditionType.STATUS),
    ("재학", ConditionType.STATUS),
    ("휴학", ConditionType.STATUS),
    ("미취업", ConditionType.STATUS),
    ("졸업", ConditionType.STATUS),
    ("재직", ConditionType.STATUS),
    ("중위소득", ConditionType.INCOME),
    ("기수혜자", ConditionType.DUPLICATE),
    ("유사사업", ConditionType.DUPLICATE),
    ("유사 사업", ConditionType.DUPLICATE),
    ("수혜 중인", ConditionType.DUPLICATE),
    ("중복 참여", ConditionType.DUPLICATE),
    ("병역", ConditionType.MILITARY),
    ("군필", ConditionType.MILITARY),
    ("군 복무", ConditionType.MILITARY),
    ("세대주", ConditionType.ETC),
    ("무주택", ConditionType.ETC),
    ("성실히", ConditionType.ETC),
    ("성실한", ConditionType.ETC),
    ("사업자등록", ConditionType.ETC),
]


class MockNormalizationLLMClient:
    """AWS 계정 발급 전까지 사용하는 목(mock) 구현.

    실제 LLM 추론 없이 키워드 힌트로 후보를 제안한다. operator/value는 항상
    "unknown"/None으로 두어 R4를 지킨다 — 실제 연동 후에는 Claude가 더 정교하게
    operator/value를 채우되, 여전히 모르면 unknown/None을 반환해야 한다.
    """

    def extract_conditions(self, raw_text: str) -> list[dict]:
        results = []
        for keyword, cond_type in _KEYWORD_HINTS:
            idx = raw_text.find(keyword)
            if idx == -1:
                continue
            # 문장 단위로 raw_quote를 잘라 인용 (키워드가 포함된 한 줄)
            line_start = raw_text.rfind("\n", 0, idx) + 1
            line_end = raw_text.find("\n", idx)
            if line_end == -1:
                line_end = len(raw_text)
            quote = raw_text[line_start:line_end].strip()
            if not quote:
                continue
            results.append(
                {
                    "type": cond_type.value,
                    "operator": Operator.UNKNOWN.value,
                    "value": None,
                    "raw_quote": quote,
                }
            )
        return results


_NORMALIZATION_PROMPT = """다음은 청년 대상 공고/게시물 원문입니다. 아래 6가지 자격조건 타입 중
실제로 원문에 언급된 것만 추출해서 JSON 배열로 반환하세요.

타입: region, status, income, duplicate, military, etc

주의: age(나이)와 period(신청기간)는 이 작업에서 절대 추출하지 마세요 — 별도의 정규식
로직이 전담합니다. age/period를 반환해도 무시되니 포함시키지 마세요.

규칙 (반드시 지킬 것):
- raw_quote는 원문에 있는 문장/구절을 "글자 그대로" 복사해야 합니다. 절대 바꿔쓰거나
  요약하거나 다른 표현으로 바꾸지 마세요 — 나중에 코드가 원문에 실제로 존재하는
  부분 문자열인지 검증하며, 조금이라도 다르면 그 조건은 통째로 버려집니다.
- 조건의 구체적인 수치나 범위를 원문만으로 확신할 수 없으면 operator를 "unknown"으로,
  value를 null로 두세요. 추측해서 채우지 마세요.
- 확실한 범위/값을 알 수 있으면 operator를 gte/lte/between/equals/in 중 하나로, value를 채우세요.
- 원문에 없는 조건은 절대 만들어내지 마세요.
- 자격조건이 전혀 없으면 빈 배열 []을 반환하세요.

원문:
---
{raw_text}
---

JSON 배열만 반환하세요: [{{"type": "...", "operator": "...", "value": ..., "raw_quote": "..."}}]
"""


class GeminiNormalizationLLMClient:
    """Gemini(gemini-flash-latest) 기반 실제 조건 후보 추출.

    여기서 뭘 반환하든 normalize()의 _verify_grounding()이 원문에 없는 raw_quote를
    무조건 걸러내므로, LLM이 규칙을 안 지켜도(요약/재작성해도) R2는 코드로 지켜진다.
    """

    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-flash-latest"):
        api_key = api_key or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다 (.env 파일 확인)")
        self._client = genai.Client(api_key=api_key)
        self._model = model

    def extract_conditions(self, raw_text: str) -> list[dict]:
        response = self._client.models.generate_content(
            model=self._model,
            contents=_NORMALIZATION_PROMPT.format(raw_text=raw_text),
            config=genai_types.GenerateContentConfig(response_mime_type="application/json"),
        )
        data = json.loads(response.text)
        if not isinstance(data, list):
            return []
        return data


def _default_llm_client() -> NormalizationLLMClient:
    if os.environ.get("GEMINI_API_KEY"):
        return GeminiNormalizationLLMClient()
    return MockNormalizationLLMClient()


# --- 메인 정규화 로직 ---------------------------------------------------------


def normalize(
    opportunity_id: str,
    raw_text: Optional[str],
    llm_client: Optional[NormalizationLLMClient] = None,
) -> NormalizationResult:
    """Supervisor(A)가 호출할 단일 진입점."""
    if not raw_text or not raw_text.strip():
        return NormalizationResult(
            opportunity_id=opportunity_id,
            conditions=[],
            status="failed",
            notes="raw_text가 비어있음",
        )

    llm_client = llm_client or _default_llm_client()
    conditions: list[EligibilityCondition] = []
    dropped_count = 0

    # 1) 순수 함수 기반 추출 (R5)
    conditions.extend(_extract_age_conditions(raw_text))
    conditions.extend(_extract_period_conditions(raw_text))

    # 2) LLM(Gemini, 키 없으면 mock) 후보 제안 + R2 근거 검증
    try:
        for candidate in llm_client.extract_conditions(raw_text):
            # R5 방어: 프롬프트로 age/period를 빼달라고 요청했지만, LLM이 지시를
            # 무시할 수도 있으므로 코드로도 한번 더 막는다 — 나이/기간은 정규식(순수
            # 함수)만 담당해야 하고, LLM이 중복으로 뽑으면 같은 조건이 서로 다른
            # raw_quote로 두 번 나타나는 문제가 생긴다 (실제로 겪음).
            if candidate.get("type") in ("age", "period"):
                continue
            span = _verify_grounding(candidate["raw_quote"], raw_text)
            if span is None:
                dropped_count += 1
                continue  # 원문에 없는 인용은 절대 채택하지 않는다 (R2)
            conditions.append(
                EligibilityCondition(
                    type=ConditionType(candidate["type"]),
                    operator=Operator(candidate.get("operator", "unknown")),
                    value=candidate.get("value"),
                    raw_quote=candidate["raw_quote"],
                    span=span,
                )
            )
    except Exception as e:  # noqa: BLE001 - 외부(LLM) 경계, 실패를 status로 표현 (R3)
        return NormalizationResult(
            opportunity_id=opportunity_id,
            content_category=_classify_content(conditions) if conditions else None,
            conditions=conditions,
            status="partial" if conditions else "failed",
            notes=f"LLM 추출 실패: {e}",
        )

    # 같은 줄에서 여러 키워드가 매칭되어 (type, raw_quote)가 동일한 중복 후보를 제거
    seen: set[tuple[ConditionType, str]] = set()
    deduped: list[EligibilityCondition] = []
    for c in conditions:
        key = (c.type, c.raw_quote)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(c)
    conditions = deduped

    category = _classify_content(conditions)

    # 개인 자격조건이 없으면(TIME_SENSITIVE_INFO/GENERAL_INFO) "조건을 못 찾음"이 아니라
    # "애초에 자격조건이 없는 콘텐츠로 정상 분류됨"이다 — status를 partial로 왜곡하지 않는다.
    if category == ContentCategory.GENERAL_INFO:
        return NormalizationResult(
            opportunity_id=opportunity_id,
            content_category=category,
            conditions=[],
            status="ok",
            notes="지원 자격이나 마감 조건이 없음 — 지원사업이 아닌 정보성 콘텐츠로 분류됨 (C의 적격 판정 불필요)",
        )
    if category == ContentCategory.TIME_SENSITIVE_INFO:
        return NormalizationResult(
            opportunity_id=opportunity_id,
            content_category=category,
            conditions=conditions,
            status="ok",
            notes="개인 자격조건은 없지만 마감/기간이 있음 — C의 판정은 불필요, D의 일정 알림 대상",
        )

    status: Literal["ok", "partial", "failed"] = "partial" if dropped_count else "ok"
    notes = f"근거 검증 실패로 {dropped_count}건 제외됨" if dropped_count else None
    return NormalizationResult(
        opportunity_id=opportunity_id,
        content_category=category,
        conditions=conditions,
        status=status,
        notes=notes,
    )


if __name__ == "__main__":
    sample = (
        "2026 청년 창업 지원사업 공고\n"
        "신청기간: 2026.8.1 ~ 8.22\n"
        "만 19~34세, 서울시 거주자만 지원 가능\n"
        "미취업 청년 대상, 유사사업 기수혜자 제외\n"
        "성실히 수행 가능한 자"
    )
    result = normalize("test-001", sample)
    print(result.model_dump_json(indent=2, exclude_none=True))

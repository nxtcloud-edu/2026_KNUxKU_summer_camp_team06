"""
OWNER: B (신민서)

역할: 사용자가 저장한 링크/파일/스크린샷/텍스트 -> SavedContext(정제된 원문 텍스트)

Project.md 규칙 준수:
- R3: 실패는 실패로 표현한다. status는 ok/partial/failed 3값. 그럴듯한 값으로 채우지 않는다.
- R6: 로그인이 필요한 사이트를 세션 위조/헤더 조작/비공개 엔드포인트로 우회하지 않는다.
      실패로 처리하고 스크린샷 업로드를 유도하는 것이 올바른 동작이다.
- R7: 개인정보(주민번호, 생년월일, 상세주소)를 수집하지 않는다.

FILE 지원 배경: data/opportunities.json 20건을 실제로 수집하면서 서울시 청년월세지원처럼
정부 공고가 PDF 첨부파일로만 제공되는 경우를 실제로 마주쳤다. 링크/텍스트/이미지만으로는
이런 입력을 못 받으므로 FILE(PDF) 경로를 추가한다. HWP는 파싱 라이브러리가 무겁고
신뢰도가 낮아 지금은 의도적으로 미지원 — 로그인 필요 페이지와 동일하게 "실패 처리 +
스크린샷 업로드 유도"로 우회한다 (R6와 동일한 원칙: 안 되는 건 억지로 파싱하지 않는다).

주의: 아래 SavedContext/SourceType/ExtractionStatus는 초안이다.
A가 src/models.py로 통합하면 그쪽 import로 교체한다.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional, Protocol

import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field
from pypdf import PdfReader
from pypdf.errors import PdfReadError


# --- 초안 스키마 (A의 models.py로 이관 예정) ---------------------------------


class SourceType(str, Enum):
    LINK = "link"
    IMAGE = "image"
    TEXT = "text"
    FILE = "file"


class ExtractionStatus(str, Enum):
    OK = "ok"
    PARTIAL = "partial"
    FAILED = "failed"


class SavedContext(BaseModel):
    source_type: SourceType
    source_value: str  # url / 이미지 경로 / 원본 텍스트
    title: Optional[str] = None
    raw_text: Optional[str] = None
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: ExtractionStatus
    error_reason: Optional[str] = None  # status != ok 면 반드시 채움 (R3)


# --- LLM 인터페이스 (지금은 mock, AWS 발급 후 Bedrock/Strands로 교체) ---------


class VisionLLMClient(Protocol):
    """스크린샷에서 텍스트를 읽어내는 LLM 클라이언트 인터페이스."""

    def extract_text_from_image(self, image_path: str) -> str:
        ...


class MockVisionLLMClient:
    """AWS 계정 발급 전까지 사용하는 목(mock) 구현.

    실제 이미지를 읽지 않고, 파이프라인(normalization 이후 단계)을 테스트할 수 있도록
    고정된 예시 텍스트를 반환한다. 대회 마지막 날 BedrockVisionLLMClient로 교체한다.
    """

    def extract_text_from_image(self, image_path: str) -> str:
        return (
            "[MOCK OCR 결과] 이 텍스트는 실제 이미지 인식 결과가 아닙니다. "
            "AWS Bedrock 연동 후 실제 Vision LLM 호출로 교체됩니다."
        )


# --- 추출 로직 ----------------------------------------------------------------


REQUEST_TIMEOUT_SEC = 10
_UNWANTED_TAGS = ("script", "style", "nav", "footer", "header", "noscript")


def _clean_html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(_UNWANTED_TAGS):
        tag.decompose()
    text = soup.get_text(separator="\n")
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def extract_from_link(url: str) -> SavedContext:
    try:
        resp = requests.get(
            url,
            timeout=REQUEST_TIMEOUT_SEC,
            headers={"User-Agent": "Mozilla/5.0 (compatible; YouthAgentBot/0.1)"},
        )
    except requests.RequestException as e:
        return SavedContext(
            source_type=SourceType.LINK,
            source_value=url,
            status=ExtractionStatus.FAILED,
            error_reason=f"요청 실패: {e}",
        )

    # 로그인/인증이 필요한 페이지는 우회하지 않고 실패로 처리한다 (R6).
    if resp.status_code in (401, 403):
        return SavedContext(
            source_type=SourceType.LINK,
            source_value=url,
            status=ExtractionStatus.FAILED,
            error_reason=(
                f"접근 제한(status={resp.status_code}) — 로그인이 필요한 페이지로 추정. "
                "스크린샷 업로드를 사용자에게 요청하세요."
            ),
        )
    if resp.status_code != 200:
        return SavedContext(
            source_type=SourceType.LINK,
            source_value=url,
            status=ExtractionStatus.FAILED,
            error_reason=f"HTTP {resp.status_code}",
        )

    text = _clean_html_to_text(resp.text)
    if not text:
        return SavedContext(
            source_type=SourceType.LINK,
            source_value=url,
            status=ExtractionStatus.FAILED,
            error_reason="본문 텍스트를 추출하지 못함 (JS 렌더링 페이지 가능성)",
        )

    soup = BeautifulSoup(resp.text, "html.parser")
    title = soup.title.string.strip() if soup.title and soup.title.string else None

    return SavedContext(
        source_type=SourceType.LINK,
        source_value=url,
        title=title,
        raw_text=text,
        status=ExtractionStatus.OK,
    )


def extract_from_text(raw_text: str) -> SavedContext:
    stripped = raw_text.strip()
    if not stripped:
        return SavedContext(
            source_type=SourceType.TEXT,
            source_value=raw_text,
            status=ExtractionStatus.FAILED,
            error_reason="빈 텍스트",
        )
    return SavedContext(
        source_type=SourceType.TEXT,
        source_value=raw_text,
        raw_text=stripped,
        status=ExtractionStatus.OK,
    )


def extract_from_image(
    image_path: str, llm_client: Optional[VisionLLMClient] = None
) -> SavedContext:
    llm_client = llm_client or MockVisionLLMClient()
    try:
        text = llm_client.extract_text_from_image(image_path)
    except Exception as e:  # noqa: BLE001 - 외부 I/O 경계, 실패를 status로 표현
        return SavedContext(
            source_type=SourceType.IMAGE,
            source_value=image_path,
            status=ExtractionStatus.FAILED,
            error_reason=f"이미지 인식 실패: {e}",
        )

    if not text or not text.strip():
        return SavedContext(
            source_type=SourceType.IMAGE,
            source_value=image_path,
            status=ExtractionStatus.FAILED,
            error_reason="이미지에서 텍스트를 찾지 못함",
        )

    return SavedContext(
        source_type=SourceType.IMAGE,
        source_value=image_path,
        raw_text=text.strip(),
        status=ExtractionStatus.PARTIAL if isinstance(llm_client, MockVisionLLMClient) else ExtractionStatus.OK,
        error_reason="mock 클라이언트 사용 중 — 실제 결과 아님" if isinstance(llm_client, MockVisionLLMClient) else None,
    )


_SUPPORTED_FILE_SUFFIXES = {".pdf"}
_KNOWN_UNSUPPORTED_SUFFIXES = {".hwp", ".hwpx", ".doc", ".docx"}


def extract_from_file(file_path: str) -> SavedContext:
    suffix = Path(file_path).suffix.lower()

    if suffix in _KNOWN_UNSUPPORTED_SUFFIXES:
        return SavedContext(
            source_type=SourceType.FILE,
            source_value=file_path,
            status=ExtractionStatus.FAILED,
            error_reason=(
                f"{suffix} 형식은 아직 지원하지 않음 — 스크린샷 업로드를 사용자에게 요청하세요."
            ),
        )
    if suffix not in _SUPPORTED_FILE_SUFFIXES:
        return SavedContext(
            source_type=SourceType.FILE,
            source_value=file_path,
            status=ExtractionStatus.FAILED,
            error_reason=f"지원하지 않는 파일 형식: {suffix or '(확장자 없음)'}",
        )

    try:
        reader = PdfReader(file_path)
        pages_text = [page.extract_text() or "" for page in reader.pages]
    except (PdfReadError, FileNotFoundError, OSError) as e:
        return SavedContext(
            source_type=SourceType.FILE,
            source_value=file_path,
            status=ExtractionStatus.FAILED,
            error_reason=f"PDF 파싱 실패: {e}",
        )

    text = "\n".join(p.strip() for p in pages_text if p.strip())
    if not text:
        return SavedContext(
            source_type=SourceType.FILE,
            source_value=file_path,
            status=ExtractionStatus.FAILED,
            error_reason="PDF에서 텍스트를 추출하지 못함 (스캔 이미지 PDF일 가능성)",
        )
    # 알려진 한계: PDF에 ToUnicode CMap이 없거나 잘못된 경우(일부 저품질 변환 도구로
    # 생성된 문서) pypdf가 빈 문자열 대신 깨진 문자를 반환할 수 있다 — 이 경우 이
    # 함수는 이를 감지하지 못하고 status="ok"를 반환한다. 실제 정부 공고 PDF
    # (서울시 청년월세지원 등)로 검증했을 때는 정상 추출되었으나, 모든 PDF에서
    # 보장되지는 않는다. 다운스트림의 _verify_grounding()이 깨진 텍스트에서 나온
    # raw_quote를 걸러내므로 최종 결과가 오염되지는 않지만, extraction 단계의
    # status만 보고 성공을 판단하지 않도록 주의.

    return SavedContext(
        source_type=SourceType.FILE,
        source_value=file_path,
        title=Path(file_path).stem,
        raw_text=text,
        status=ExtractionStatus.OK,
    )


def extract(
    source_type: SourceType, source_value: str, llm_client: Optional[VisionLLMClient] = None
) -> SavedContext:
    """Supervisor(A)가 호출할 단일 진입점."""
    if source_type == SourceType.LINK:
        return extract_from_link(source_value)
    if source_type == SourceType.TEXT:
        return extract_from_text(source_value)
    if source_type == SourceType.IMAGE:
        return extract_from_image(source_value, llm_client)
    if source_type == SourceType.FILE:
        return extract_from_file(source_value)
    raise ValueError(f"알 수 없는 source_type: {source_type}")


if __name__ == "__main__":
    result = extract_from_text("2026 청년 창업 지원사업 공고\n만 19~34세, 서울시 거주자 대상")
    print(result.model_dump_json(indent=2, exclude_none=True))

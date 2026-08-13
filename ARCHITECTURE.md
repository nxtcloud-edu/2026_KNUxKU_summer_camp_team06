# KEEP:ON — 실행 아키텍처

이 문서는 README와 Project.md의 제품 범위를 코드와 API 경계로 구체화합니다.
현재 기준의 새 실행 경로는 services/keep-web이며, 기존 Python 구현은 전환 기간 동안
보존합니다. main에 직접 병합하지 않고 작업 브랜치와 PR로 통합합니다.

## 1. 전체 흐름

~~~mermaid
flowchart TD
  U[사용자] --> E[Manifest V3 Chrome Extension]
  U --> L[웹 링크 입력 화면]
  E --> I[POST /v1/intakes]
  L --> I
  I --> W[server/workflow.js]
  W --> P[Platform Extraction Agent]
  P --> N[Normalization Agent]
  N --> V[Deterministic Validation]
  V --> S[Opportunity Store]
  S --> API[HTTP API]
  API --> F[Web Dashboard]
  F --> C{사용자 확인}
  C --> D[Planning / Calendar / Notification]
~~~

### 처리 원칙

1. 사용자가 Keep하거나 링크를 입력한 요청만 처리합니다.
2. Extension은 현재 탭의 페이지 증거를 수집하고, 서버는 원문 URL을 기준으로 처리합니다.
3. Extraction은 플랫폼 차이를 흡수하고, Normalization은 공통 카드 필드로 변환합니다.
4. 검증 실패는 버리지 않고 NEEDS_REVIEW 또는 명시적 실패 상태로 보존합니다.
5. 사용자가 확인하기 전에는 캘린더나 실행 계획에 자동 등록하지 않습니다.

## 2. Node 서비스 모듈

| 모듈 | 책임 |
|---|---|
| extension/ | activeTab 권한으로 제목·본문·링크·증거를 수집하고 Intake API 호출 |
| server/index.js | 정적 Web 제공, CORS, Intake·Opportunity HTTP API |
| server/workflow.js | Intake 상태 전이와 Agent 실행 순서 |
| server/agents/platform-agents.js | Instagram·Threads Extraction adapter |
| server/agents/normalization-agent.js | Competition·Support·Benefit·마감일 정규화 |
| server/validation.js | 저장 전 결정적 검증 |
| server/store.js | 현재 로컬 메모리 저장소와 canonical URL 중복 방지 |
| shared/contracts.js | PageEvidencePayload, 상태, 플랫폼, 분류 계약 |
| web/ | API 소비용 기본 대시보드 |

플랫폼별 구현이 늘어나면 server/agents/ 아래에 instagram-extraction/,
threads-extraction/처럼 Agent별 폴더를 추가합니다. Agent는 직접 DB나 UI를 수정하지 않고
workflow에 결과를 반환합니다.

## 3. 입력 계약

~~~text
PageEvidencePayload
  source_type: page_evidence
  page_evidence:
    source_url: http(s) 원문 게시물 URL
    canonical_url: metadata canonical 또는 source_url
    platform: instagram | threads
    page_title: 제목 후보
    body_text: 게시물 본문·캡션
    author: 작성자(확인된 경우)
    links: 본문에서 확인한 관련 링크
    published_at: 게시일
    deadline_text: 마감 문맥이 포함된 날짜 후보
    evidence: locator, source, text
    captured_at: ISO 시각
~~~

계약 검증의 핵심은 다음과 같습니다.

- 게시물 URL은 http(s) 절대 URL이어야 합니다.
- Instagram은 p, reel, reels, tv 게시물 URL을 지원합니다.
- Threads는 작성자 post와 짧은 t 게시물 URL을 지원합니다.
- evidence 항목의 text는 2,000자 이하입니다.
- 본문은 영상 자체가 아니라 캡션·게시글 텍스트입니다.
- 로그인 안내만 반환되면 PAGE_ACCESS_REQUIRED입니다.
- stale canonical이 현재 게시물과 다르면 현재 탭의 유효한 게시물 URL을 우선하고,
  게시물 식별이 불가능하면 CANONICAL_POST_MISMATCH입니다.

## 4. 정규화 결과 계약

Normalization Agent는 아래 필드를 반환합니다.

~~~text
{
  canonical_url,
  source_url,
  platform,
  title,
  summary,
  body,
  author,
  published_at,
  category: Competition | Support | Benefit | null,
  deadline: YYYY-MM-DD | null,
  links,
  evidence,
  confidence
}
~~~

게시일은 마감일로 사용하지 않습니다. deadline_text에 마감·접수기간·신청기간 같은
문맥이 있을 때만 날짜를 파싱하며, 확인하지 못하면 null입니다.

## 5. HTTP API

| 목적 | 메서드 | 경로 | 결과 |
|---|---|---|---|
| 저장 요청 | POST | /v1/intakes | 202와 intake_id |
| 처리 상태 | GET | /v1/intakes/:id | 상태·오류·opportunity_id |
| 저장 목록 | GET | /v1/opportunities | items 배열 |
| 저장 상세 | GET | /v1/opportunities/:id | Opportunity |
| 사용자 확인 | POST | /v1/opportunities/:id/confirm | CONFIRMED |
| 저장 삭제 | DELETE | /v1/opportunities/:id | 204 |

프론트엔드는 이 API만 사용합니다. server/store.js, Agent 모듈, Extension 메모리를
직접 참조하지 않습니다.

## 6. 상태와 실패

Intake는 QUEUED → RECEIVED → EXTRACTING → NORMALIZING → VALIDATING 순서로 진행합니다.
검증 결과에 따라 READY_FOR_REVIEW 또는 NEEDS_REVIEW가 됩니다. 지원하지 않는 플랫폼은
UNSUPPORTED, 접근 실패·계약 오류는 FAILED 또는 명시적 오류 코드로 반환합니다.

사용자 취소와 중복 URL은 별도 상태·갱신 규칙으로 처리하며, 같은 사용자와 canonical URL의
중복 카드를 만들지 않습니다.

## 7. 기존 Python과의 연결

기존 Python 파일은 현재 레포의 실제 구현이므로 수정하지 않습니다.

| 기존 Python | Node 전환 계약 |
|---|---|
| src/extraction_agent.py의 SavedContext | PageEvidencePayload와 입력 필드 매핑 |
| src/normalization_agent.py의 NormalizationResult | Node Normalization 결과 |
| src/models.py의 공용 모델 초안 | 최종 공용 계약 확정 시 참조 |
| data/opportunities.json | Node fixture·통합 테스트의 참고 데이터 |
| scripts/run_pipeline.py | Python 레거시 파이프라인 검증 |

공용 필드의 최종 기준은 팀 합의 후 한 곳으로 정합니다. 합의 전에는 두 런타임의 모델을
자동으로 섞거나 한쪽이 다른 쪽의 파일을 덮어쓰지 않습니다.

## 8. 저장소와 운영 단계

현재 로컬 저장소는 메모리 기반이며 서버 재시작 시 데이터가 사라집니다.
운영 단계에서 다음 순서로 교체합니다.

1. 사용자 인증과 user_id 전달
2. Supabase 또는 운영 DB의 Intake·Opportunity 테이블
3. 사용자별 RLS와 Extension 인증
4. 비동기 작업 큐와 Agent 실행 런타임
5. Planning·Calendar·Notification 연결

AI API 키 없이도 계약과 데이터 흐름을 검증할 수 있어야 하며, LLM은 근거 없는 값을
생성하는 데 사용하지 않습니다.

## 9. 테스트와 기여

~~~bash
cd services/keep-web
npm test
~~~

계약·Extension·HTTP 수직 통합 테스트를 함께 실행합니다. 변경은 feature/* 또는 codex/*
브랜치에서 수행하고, main에는 직접 병합하지 않습니다.

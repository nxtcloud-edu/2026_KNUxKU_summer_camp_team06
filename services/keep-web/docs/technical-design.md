<!-- /autoplan restore point: ~/.gstack/projects/keep/unknown-autoplan-restore-20260813-012320.md -->
# Opportunity Keeper 기술 설계서

문서 상태: 구현 전 확정안  
작성일: 2026-08-13  
대상: 기획·프론트엔드·백엔드·AI/Agent 공동 개발팀  
범위 모드: `HOLD_SCOPE` — 현재 범위 고정

## 1. 문서 목적

Opportunity Keeper는 Instagram과 Threads에서 발견한 공모전·지원정책·혜택 게시물을 사용자가 직접 `Keep`했을 때만 수집하고, 실행 가능한 정보 카드로 정리하는 서비스다. 이 문서는 구현 전에 확장프로그램, 웹 서비스, Agent, 데이터베이스와 내부 캘린더의 경계를 고정한다.

핵심 성공 경험은 다음 한 문장이다.

> SNS 게시물에서 Keep을 누르면 몇 초 안에 웹 대시보드에 근거가 포함된 행동 카드가 생기고, 사용자가 검토한 항목만 캘린더와 신청 계획으로 이어진다.

## 2. 해결할 문제와 제품 원칙

청년과 대학생은 Instagram과 Threads에서 공모전, 정부·청년지원, 취업·창업지원, 할인과 무료 혜택을 자주 발견한다. 그러나 SNS의 저장 기능은 링크를 보관할 뿐 마감일과 다음 행동을 관리하지 않아 저장한 정보를 잊거나 기한을 놓치게 된다.

제품 원칙은 다음과 같다.

1. 자동 수집하지 않는다. 사용자의 Keep 또는 직접 URL 제출만 처리한다.
2. 핵심 객체는 `Bookmark`가 아니라 행동 가능한 `Opportunity`다.
3. Agent의 결과를 바로 확정 사실로 사용하지 않는다. 원문 근거, 결정적 검증, 사용자 확인을 거친다.
4. 확장프로그램은 입력 채널이고 웹 서비스가 기준 저장소다.
5. 캘린더와 Planning Agent는 사용자의 명시적 요청으로만 실행한다.
6. 추출에 실패해도 사용자가 저장한 링크 자체는 잃지 않는다.

## 3. 현재 범위

### 포함

- Chrome Manifest V3 확장프로그램의 Keep 버튼
- 웹 서비스의 직접 URL 입력
- Instagram 단일 게시물과 Threads 단일 게시물
- 공개 일반 웹페이지 직접 URL
- `Competition`, `Support`, `Benefit` 분류
- 제목, 대상, 혜택, 마감일, 신청 방법, 신청 URL 정규화
- 필드별 원문 근거와 `unknown`, `conflicting` 상태
- 결과 수정, 재검증, 사용자 확인
- 확인한 항목의 내부 캘린더 추가
- 확인한 항목에 대한 Planning Agent의 준비 단계·체크리스트 생성
- 실패 시 URL·플랫폼·저장 시각을 가진 `정리 필요` 카드

### NOT in scope

- 자동 크롤링, 피드 감시, SNS 저장 목록 동기화 — 사용자 요청 기반 원칙 유지
- YouTube, X — 첫 구현의 플랫폼 변수를 줄임
- 이미지 OCR·Vision — 텍스트 근거가 없는 경우 추측하지 않음
- 알림과 푸시 — 캘린더 흐름 안정화 이후 진행
- Google/Apple 등 외부 캘린더 연동 — 내부 캘린더만 구현
- 자동 신청·서류 제출 — 사용자 통제와 보안 범위를 벗어남
- 개인별 지원 자격 확정 — Planning Agent도 참고 계획만 제시
- 공식 출처 자동 대조 — 후속 신뢰도 기능
- 외부 미디어 썸네일 표시 — 사용자 IP 노출과 추적 위험 회피

## 4. 분류 체계

| Type | 포함 항목 |
|---|---|
| `Competition` | 공모전, 해커톤, 경진대회 |
| `Support` | 정부지원, 청년정책, 취업지원, 창업지원 |
| `Benefit` | 할인, 무료 혜택, 쿠폰, 문화·생활 혜택 |

Agent가 분류할 근거가 없으면 Draft에서는 `null`을 허용한다. 사용자가 최종 확인할 때는 세 값 중 하나가 필수다.

## 5. 기술 스택 기본안

- 언어: TypeScript
- 웹/API: Next.js
- 인증·DB: Supabase Auth + PostgreSQL + Row Level Security
- 비동기 workflow: Inngest
- 확장프로그램: Chrome Manifest V3
- 배포: Vercel + Supabase + Inngest Cloud
- AI: 구조화 JSON 출력을 지원하는 단일 LLM 제공자

Inngest 함수는 재시도 가능한 단계를 durable workflow로 실행할 수 있다. 배포 시 앱의 serve endpoint와 Inngest를 동기화하는 구조를 사용한다. [Inngest durable functions](https://www.inngest.com/docs/learn/inngest-functions), [Inngest deployment](https://www.inngest.com/docs/platform/deployment)

## 6. 전체 아키텍처

```text
┌──────────────────────── Chrome Browser ────────────────────────┐
│ Instagram / Threads page                                       │
│        │ user clicks Keep                                      │
│        ▼                                                       │
│ Page Evidence Adapter ──▶ Extension UI                         │
│        │ PageEvidencePayload                                   │
└────────┼───────────────────────────────────────────────────────┘
         │ PKCE access token
         ▼
┌──────────────────────── Application ───────────────────────────┐
│ Intake API + RLS                                                │
│    │ DB transaction                                             │
│    ├──▶ Intake + minimal link card                             │
│    └──▶ Outbox(EVENT_PENDING)                                  │
│             │ relay with stable event_id                       │
│             ▼                                                  │
│       Inngest Orchestrator                                     │
│             │                                                  │
│       ┌─────┴───────────┐                                      │
│       ▼                 ▼                                      │
│ Instagram Agent     Threads Agent                              │
│       └─────┬───────────┘                                      │
│             │ EvidenceBundle                                  │
│             ▼                                                  │
│       Normalization Agent                                     │
│             │ OpportunityDraft                                │
│             ▼                                                  │
│       Deterministic Validator                                 │
│             │                                                  │
│       ┌─────┴──────────────┐                                   │
│       ▼                    ▼                                   │
│ Review Dashboard      NEEDS_REVIEW / 정리 필요                 │
│       │ user confirms                                          │
│       ├──▶ Internal Calendar Writer                           │
│       └──▶ Planning Agent                                     │
└────────────────────────────────────────────────────────────────┘
```

Chrome content script는 허용된 페이지 컨텍스트에서 DOM을 읽고 메시지로 확장프로그램의 다른 부분과 통신한다. `activeTab` 권한은 사용자가 확장프로그램을 실행한 탭에 임시 접근 권한을 부여하므로 Keep 클릭 기반 수집과 맞는다. 로컬 MV3 구현은 실제 Instagram/Threads 페이지에서의 안정적인 테스트를 위해 해당 두 호스트만 `host_permissions`에 명시하고, 전체 웹 권한은 요청하지 않는다. [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab?hl=en), [extension messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging?hl=en)

### 단일 장애점과 완화

| 장애점 | 영향 | 완화 |
|---|---|---|
| LLM 제공자 | 모든 의미 추출 지연 | concurrency 제한, timeout 1회 재시도, 최소 링크 카드 |
| Inngest | 비동기 처리 시작 지연 | transactional outbox, `EVENT_PENDING` 경보, 멱등 재전송 |
| Supabase | 저장·조회 중단 | 명시적 실패 UI, 연결 제한, 백업·복구 정책 |
| 플랫폼 DOM 변경 | 특정 플랫폼 추출 실패 | 플랫폼 adapter version, fixture, `PAGE_ACCESS_REQUIRED` |

## 7. 구성요소와 Agent 경계

| 구성요소 | 책임 | 금지사항 |
|---|---|---|
| Intake Orchestrator | 라우팅, 상태 전이, 재시도, 취소 검사 | 의미 추론 |
| Instagram Page Evidence Adapter | 현재 게시물의 허용 증거 수집 | 전체 DOM·쿠키·내부 상태 JSON 전송 |
| Threads Page Evidence Adapter | 현재 게시물·인용 구조의 허용 증거 수집 | 피드 탐색·자동 수집 |
| Instagram Extraction Agent | Instagram payload를 EvidenceBundle로 변환 | 직접 페이지 탐색·근거 생성 |
| Threads Extraction Agent | Threads payload를 EvidenceBundle로 변환 | 직접 페이지 탐색·근거 생성 |
| ExtractionAgentRunner | 공통 LLM 호출, timeout, JSON 파싱, schema 검증, 로그 | 플랫폼 의미 규칙 보유 |
| Generic Web Extraction Agent | 공개 일반 웹 URL을 EvidenceBundle로 변환 | 인증 우회·사설망 접근 |
| Normalization Agent | 분류와 핵심 필드 초안 작성, 근거 연결 | 일정 기록·자동 확정 |
| Validation Service | enum, 날짜, URL, 근거 substring 검증 | LLM 호출 |
| Planning Agent | 확인된 revision의 준비 단계와 체크리스트 생성 | 자동 신청·자격 확정 |
| Calendar Writer | 확인된 deadline을 내부 일정으로 멱등 기록 | 자동 일정 생성 |

Instagram과 Threads Agent는 별도 런타임 역할로 보이지만 공통 `ExtractionAgentRunner`를 사용한다. 플랫폼별로 profile, prompt, adapter, fixture만 분리한다.

## 8. 확장프로그램과 웹 서비스 연동

### 인증

1. 사용자가 확장프로그램에서 `계정 연결`을 누른다.
2. 확장프로그램이 웹 로그인과 PKCE 인증 흐름을 연다.
3. 인증 성공 후 확장프로그램 전용 최소 권한 token을 발급한다.
4. access token은 짧은 수명으로 사용하고 웹 세션 cookie를 공유하지 않는다.
5. 권한은 Intake 생성과 본인 Intake 상태 조회로 제한한다.

### Keep 흐름

```text
사용자 Keep
   │
   ├─ 권한 없음 ─▶ 계정 연결 안내
   ├─ 지원하지 않는 페이지 ─▶ 지원 범위 안내
   └─ 지원 페이지
          │
          ▼
     PageEvidencePayload 생성
          │ nil/empty/oversize/schema error
          ├─────────────────────▶ 확장프로그램 오류 + 링크 보존 안 함
          │ valid
          ▼
     POST /v1/intakes
          │
          ├─ duplicate ─▶ canonical URL 기준 기존 Opportunity 최신 증거로 갱신
          └─ accepted ──▶ 처리 상태 표시 ─▶ 웹 카드 열기
```

확장프로그램 popup에는 `저장됨`, `처리 중`, `정리 완료`, `정리 필요`, `실패`만 간결하게 보여준다. 상세 근거·수정·캘린더는 웹에서 제공한다.

## 9. 입력 데이터 계약

### PageEvidencePayload v1

필수 구조:

```json
{
  "schema_version": "page-evidence-payload.v1",
  "platform": "instagram|threads",
  "page_url": "https://...",
  "canonical_url": "https://...",
  "platform_post_id": "string|null",
  "page_title": "string|null",
  "author_handle": "string|null",
  "metadata": {
    "open_graph": {},
    "twitter_card": {},
    "json_ld": []
  },
  "dom_fragments": [
    {
      "node_id": "n1",
      "kind": "caption|body|timestamp|link|quoted_post",
      "locator": "adapter:caption",
      "text": "...",
      "links": [],
      "sanitized_html": "<div>...</div>"
    }
  ],
  "media": [
    {"kind": "image|video", "url": "https://...", "alt_text": "string|null"}
  ],
  "captured_at": "RFC3339",
  "adapter_version": "instagram.v1"
}
```

제한:

- payload 최대 256KB
- DOM 조각 최대 20개
- 조각별 text 최대 8KB
- JSON-LD 합계 최대 64KB
- `script`, `style`, 이벤트 속성, form 값, 숨김 노드, data URI 제거
- cookie, token, DM, 댓글, 전체 hydration JSON, 무관한 feed 제외
- 미디어 binary를 전송하지 않고 URL과 alt text만 전송
- 외부 미디어 URL을 웹 UI에서 직접 렌더링하지 않음

페이지의 텍스트·HTML·JSON은 모두 비신뢰 데이터다. system prompt나 도구 지시와 결합하지 않고 데이터 필드로만 전달한다.

### EvidenceBundle v1

플랫폼별 Agent가 반환하는 공통 계약이다. 각 content item은 고유 evidence ID와 원본 node ID를 갖는다.

```json
{
  "schema_version": "evidence-bundle.v1",
  "intake_id": "uuid",
  "platform": "instagram|threads|web",
  "canonical_url": "https://...",
  "platform_post_id": "string|null",
  "content_items": [
    {"id":"e1", "relation_type":"primary|quoted|linked", "text":"...", "source_node_ids":["n1"]}
  ],
  "outbound_links": ["https://..."],
  "captured_at": "RFC3339",
  "source_payload_version": "page-evidence-payload.v1"
}
```

### OpportunityDraft v1

핵심 필드는 `type`, `title`, `eligibility`, `benefit`, `deadline`, `application_method`, `application_url`이다. 각 필드는 하나 이상의 근거 또는 `unknown` 상태를 가진다. 사용자 수정값은 `mode: user_entered`로 구분하고 원문 substring 검사를 적용하지 않되, 수정자와 revision을 기록한다.

근거 mode:

- `extracted`: 원문에 직접 존재
- `inferred`: 여러 근거를 조합한 해석이며 경고 표시
- `unknown`: 근거 없음
- `conflicting`: 상충하는 근거가 있어 사용자 확인 필요
- `user_entered`: 사용자가 직접 수정

## 10. 데이터 모델

| 테이블 | 핵심 필드 | 설명 |
|---|---|---|
| `users` | `id` | Supabase Auth 사용자 |
| `extension_connections` | `user_id`, `client_id`, `scopes`, `revoked_at` | PKCE 연결 상태 |
| `intakes` | `id`, `user_id`, `source_type`, `platform`, `status`, `error_code` | Keep 요청 |
| `intake_payloads` | `intake_id`, `payload`, `schema_version` | 제한된 원문 증거 |
| `outbox_events` | `event_id`, `intake_id`, `status`, `attempts` | workflow 유실 방지 |
| `opportunities` | `id`, `user_id`, `current_revision`, `review_status` | 기준 객체 |
| `opportunity_revisions` | `opportunity_id`, `revision`, `normalized_fields` | 변경 이력 |
| `field_evidence` | `revision_id`, `field`, `mode`, `evidence_id`, `excerpt` | 필드 근거 |
| `plans` | `opportunity_id`, `opportunity_revision`, `status`, `result` | 신청 계획 |
| `calendar_entries` | `opportunity_id`, `opportunity_revision`, `event_date`, `status` | 내부 일정 |
| `cancellation_tombstones` | `intake_id`, `user_id`, `cancelled_at`, `expires_at` | 삭제 후 쓰기 방지, 콘텐츠 없음 |

모든 사용자 데이터 테이블은 `user_id = auth.uid()` RLS를 적용한다. API는 클라이언트가 보낸 user ID를 신뢰하지 않는다.

### 중복과 revision

- 우선 키: `(user_id, platform, platform_post_id)`
- fallback: `(user_id, normalized_url)`
- 진행 중 중복은 기존 Intake를 반환한다.
- 완료 중복은 기존 canonical URL의 Opportunity를 최신 증거로 갱신해 반환한다.
- `다시 분석`은 새 revision을 생성한다.
- 수정·확인·계획·캘린더 API는 `expected_revision`을 요구하며 불일치 시 `STALE_REVISION`을 반환한다.

## 11. 상태 모델

실행 상태와 UI 지연 표시는 분리한다. `is_delayed`는 10초가 지나면 true가 되는 표시 속성이지 실행 상태가 아니다.

```text
QUEUED
  │ concurrency slot
  ▼
RECEIVED ─▶ EVENT_PENDING ─▶ EVENT_SENT ─▶ EXTRACTING
                                               │
                                               ▼
                                         NORMALIZING
                                               │
                                               ▼
                                          VALIDATING
                                               │
                     ┌─────────────────────────┼──────────────┐
                     ▼                         ▼              ▼
             READY_FOR_REVIEW             NEEDS_REVIEW    UNSUPPORTED
                     │ user confirms
                     ▼
               USER_CONFIRMED
                  │        │
        plan click│        │calendar click
                  ▼        ▼
              PLANNING  CALENDAR_ADDING
                  │        │
          PLAN_READY/   CALENDAR_ADDED/
          PLAN_FAILED   CALENDAR_FAILED

각 실행 단계 ── timeout ─▶ RETRY_SCHEDULED ─▶ 동일 단계(최대 1회)
각 실행 단계 ── non-retryable ─▶ NEEDS_REVIEW 또는 FAILED
각 실행 단계 ── delete ─▶ CANCELLED
Opportunity 수정 ─▶ 새 revision + 기존 Plan/Calendar STALE
```

불가능한 전이:

- `READY_FOR_REVIEW` 이전의 confirm
- `USER_CONFIRMED` 이전의 Planning/Calendar 실행
- `unknown`, `conflicting`, `rolling`, `expired` deadline의 Calendar 추가
- stale revision으로 수정·확인·계획·캘린더 갱신
- `CANCELLED` 이후 DB 콘텐츠 쓰기

DB transaction, unique constraint, `expected_revision`, cancellation guard가 이를 차단한다.

## 12. 삭제와 비동기 작업 정합성

```text
DELETE 요청
   │
   ├─▶ cancellation_tombstone 기록
   ├─▶ Intake/Opportunity/Evidence/Plan/Calendar 콘텐츠 연쇄 삭제
   └─▶ 204 응답

실행 중 workflow
   │ 각 DB write 직전
   ▼
tombstone 확인 ── 있음 ─▶ write 중단 + CANCELLED 종료
               └─ 없음 ─▶ 정상 write
```

Tombstone에는 `intake_id`, `user_id`, 취소 시각만 저장하며 원문이나 결과를 포함하지 않는다. LLM 호출 중 삭제될 수 있으므로 호출 전뿐 아니라 반환 결과를 저장하기 직전에도 검사한다. 보존 기간 후 tombstone을 삭제한다.

## 13. Transactional Outbox

Intake와 outbox event를 하나의 DB transaction에서 저장한다.

```text
BEGIN
  INSERT intake
  INSERT minimal_link_card
  INSERT outbox(event_id, EVENT_PENDING)
COMMIT
       │
       ▼
Outbox Relay ──▶ Inngest(event_id, intake_id, schema_version)
       │ accepted
       ▼
EVENT_SENT
```

- `event_id`는 고정되어 재발송해도 같은 작업으로 처리한다.
- relay는 오래된 `EVENT_PENDING`을 멱등 재전송한다.
- handler는 `event_id`와 단계별 idempotency key를 사용한다.
- `EVENT_PENDING` 1분 초과 시 경보한다.
- event와 step 반환값에는 콘텐츠가 아닌 불투명 ID만 넣는다.

## 14. API 계약

| Method | Endpoint | 역할 | 주요 오류 |
|---|---|---|---|
| POST | `/v1/intakes` | PageEvidence 또는 공개 URL 접수 | `INVALID_URL`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_PLATFORM` |
| GET | `/v1/intakes/{id}` | 본인 처리 상태 조회 | `NOT_FOUND`, `FORBIDDEN` |
| GET | `/v1/opportunities` | 본인 카드 목록·필터·pagination | `FORBIDDEN` |
| GET | `/v1/opportunities/{id}` | 카드, revision, 근거 상세 조회 | `NOT_FOUND`, `FORBIDDEN` |
| PATCH | `/v1/opportunities/{id}` | 사용자 수정과 재검증 | `STALE_REVISION`, `VALIDATION_ERROR` |
| POST | `/v1/opportunities/{id}/confirm` | 명시적 검토 완료 | `STALE_REVISION`, `UNRESOLVED_DEADLINE` |
| POST | `/v1/opportunities/{id}/reanalyze` | 새 revision 분석 | `ALREADY_PROCESSING` |
| POST | `/v1/opportunities/{id}/plan` | Planning Agent 실행 | `NOT_CONFIRMED`, `STALE_REVISION` |
| GET | `/v1/opportunities/{id}/plan` | 계획 상태·결과 조회 | `NOT_FOUND`, `FORBIDDEN` |
| POST | `/v1/opportunities/{id}/calendar` | 내부 일정 생성 | `NOT_CONFIRMED`, `UNRESOLVED_DEADLINE` |
| PATCH | `/v1/calendar/{id}` | stale 일정을 새 revision로 명시적 갱신 | `STALE_REVISION`, `VALIDATION_ERROR` |
| GET | `/v1/calendar` | 본인 일정 범위 조회 | `FORBIDDEN` |
| DELETE | `/v1/opportunities/{id}` | 콘텐츠 삭제와 취소 표식 생성 | `NOT_FOUND`, `FORBIDDEN` |

모든 mutation은 idempotency key를 받는다. 수정·확인·plan·calendar 요청은 `expected_revision`을 포함한다.

## 15. 직접 URL 처리

- Instagram·Threads URL을 웹에 직접 입력하면 해당 게시물을 브라우저에서 열어 확장프로그램으로 Keep하도록 안내한다.
- 다른 공개 `https` 웹페이지는 Generic Web Extraction Agent가 처리한다.
- 연결 전과 redirect마다 DNS/IP를 검증한다.
- loopback, link-local, private, reserved 주소와 비표준 port를 차단한다.
- redirect 최대 3회, connect 3초, 전체 5초, 압축 해제 후 2MB로 제한한다.
- 허용 Content-Type은 `text/html`, `application/ld+json`이다.

## 16. 오류·복구 레지스트리

| Method/경로 | 오류 코드 | 복구 | 사용자에게 보이는 내용 |
|---|---|---|---|
| Extension capture | `PAGE_ACCESS_REQUIRED` | 페이지 재열기 안내 | “게시물을 연 뒤 다시 Keep해 주세요” |
| Payload validation | `PAYLOAD_TOO_LARGE` | 재시도하지 않음 | “현재 게시물에서 너무 많은 정보가 감지됐어요” |
| Platform extraction | `UNSUPPORTED_POST` | 최소 링크 카드 | “이 게시물 형식은 아직 정리할 수 없어요” |
| Evidence extraction | `INSUFFICIENT_EVIDENCE` | 부분/최소 카드 | “원문에서 충분한 정보를 찾지 못했어요” |
| Agent call | `MODEL_TIMEOUT` | backoff 후 1회 재시도 | 지연 상태 후 실패 안내 |
| Agent response | `MODEL_EMPTY_RESPONSE` | 재시도하지 않음 | “자동 정리에 실패했어요. 직접 입력할 수 있어요” |
| Agent response | `MODEL_MALFORMED_OUTPUT` | 재시도하지 않음 | 동일 |
| Agent response | `MODEL_SCHEMA_MISMATCH` | 재시도하지 않음 | 동일 |
| Agent response | `MODEL_REFUSAL` | 재시도하지 않음 | 동일 |
| Evidence validation | `MODEL_INVALID_OUTPUT` | 부분 카드, 검토 필요 | “근거와 일치하지 않는 값이 있어요” |
| User edit | `VALIDATION_ERROR` | 필드별 오류 | 잘못된 필드 옆 설명 |
| Revision mutation | `STALE_REVISION` | 최신 데이터 재조회 | “다른 변경이 있어 새로 불러왔어요” |
| Outbox relay | `EVENT_DELIVERY_FAILED` | 멱등 재전송 | 처리 중/지연 표시 |
| Calendar write | `CALENDAR_WRITE_FAILED` | 사용자 재시도 | “일정 추가에 실패했어요” |
| Planning | `PLANNING_FAILED` | 사용자 재시도 | “계획 생성에 실패했어요” |
| Cancellation guard | `INTAKE_CANCELLED` | 즉시 종료 | 삭제된 항목이므로 표시 없음 |

Catch-all로 오류를 삼키지 않는다. 로그에는 `request_id`, `intake_id`, `stage`, `error_code`, `attempt`, `duration_ms`, adapter·schema·model version만 남기고 원문·작성자·사용자 수정값은 남기지 않는다.

## 17. 실패 모드 레지스트리

| Codepath | Failure mode | Rescued? | Test? | User sees? | Logged? |
|---|---|---:|---:|---|---:|
| Intake transaction | DB commit 실패 | Y | Y | 저장 실패 | Y |
| Outbox relay | event 유실·중복 | Y | Y | 처리 지연 | Y |
| Extraction Agent | timeout | Y | Y | 지연/정리 필요 | Y |
| Extraction Agent | 빈 값·거부·잘못된 JSON | Y | Y | 정리 필요 | Y |
| Validator | 근거 불일치 | Y | Y | 필드 경고 | Y |
| Delete/workflow race | 삭제 후 결과 재생성 | Y | Y | 없음 | Y |
| Concurrent edit | 오래된 revision 덮어쓰기 | Y | Y | 최신값 재조회 | Y |
| Calendar | 오래된 날짜 유지 | Y | Y | STALE 일정 | Y |
| Platform DOM drift | adapter가 증거를 못 찾음 | Y | Y | 정리 필요 | Y |
| Generic URL fetch | SSRF·timeout·oversize | Y | Y | URL 처리 실패 | Y |

`RESCUED=N`, `TEST=N`, `USER SEES=Silent`인 CRITICAL GAP은 없어야 출시 가능하다.

## 18. UI와 상호작용 상태

### 정보 구조

1. 첫 화면: 새 URL 입력, 최근 Keep, 마감 임박 항목
2. 카드: 분류, 제목, 마감, 핵심 혜택, 상태
3. 상세: 필드별 근거, 수정, 확인
4. 확인 후: 캘린더 추가와 계획 만들기

| 화면/기능 | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Extension Keep | 처리 중 | 해당 없음 | 재시도 안내 | 저장 완료 | 정리 필요 |
| Dashboard | skeleton | 첫 Keep 안내 | 다시 불러오기 | 카드 목록 | 최소 링크 카드 |
| Opportunity detail | skeleton | 해당 없음 | 오류 코드별 안내 | 근거 포함 카드 | unknown/conflict 강조 |
| Calendar | loading | 추가한 일정 없음 | 재시도 | 월/목록 일정 | STALE badge |
| Planning | 생성 중 | 생성 전 CTA | 다시 시도 | 단계·준비물 | assumptions 강조 |

키보드만으로 Keep, 카드 열기, 수정, 확인, 일정 추가가 가능해야 한다. 상태는 색상만으로 구분하지 않고 text와 icon을 함께 사용한다. 모바일 웹에서는 카드 목록과 상세 편집을 지원하되 확장프로그램 Keep은 데스크톱 Chrome을 기준으로 한다.

## 19. 성능과 동시성

목표:

- 10초 이내 `READY_FOR_REVIEW` 또는 `is_delayed=true`
- 최종 처리 p95 30초 이내
- 사용자별 활성 Intake 최대 2개
- 초과 요청은 `QUEUED`, 버리지 않음
- 전체 Agent concurrency는 LLM quota와 비용 한도에 맞춤

예산:

```text
Evidence/API       1.0s
Extraction Agent  1.5s
Normalization     3.5s
Validation/DB     1.0s
UI slack          2.0s
Ready-or-delayed 10.0s
Final target     30.0s
```

Polling은 최초 10초 동안 1초 간격, 이후 3초, 5초로 backoff한다. 브라우저 탭이 숨겨지면 중지하고 다시 보일 때 즉시 한 번 조회한다.

10배 부하에서는 LLM concurrency와 비용이 먼저 제한되고, 100배에서는 queue 대기와 DB connection이 병목이 된다. 사용자별 제한, global concurrency, pagination, compound index로 완화한다.

필수 index:

- `intakes(user_id, created_at desc)`
- `intakes(user_id, platform, platform_post_id)` unique where post ID exists
- `intakes(user_id, normalized_url)` fallback unique
- `opportunities(user_id, review_status, created_at desc)`
- `calendar_entries(user_id, event_date)`
- `outbox_events(status, created_at)`

## 20. 관측성과 운영

### 구조화 로그

각 단계 진입·종료·오류에 `trace_id`, `request_id`, `intake_id`, `event_id`, `stage`, `attempt`, `duration_ms`, `error_code`, `schema_version`, `adapter_version`, `model_version`을 기록한다. 원문, author handle, URL query, 사용자 수정값은 기록하지 않는다.

### Day 1 대시보드

- 플랫폼·단계별 성공률과 오류 코드
- Agent 처리 p50/p95와 30초 초과율
- `QUEUED` 최대 대기 시간
- `EVENT_PENDING` 개수와 최고 대기 시간
- 모델 호출 수, token, 예상 비용
- 취소된 작업의 write 차단 횟수

### 경보

- `EVENT_PENDING` 1분 초과
- 최근 10분 파이프라인 실패율 20% 초과
- 최종 처리 p95 30초 초과
- queue 최고 대기 시간 2분 초과

## 21. 보안·개인정보 위협 모델

| Threat | 가능성 | 영향 | 대응 |
|---|---|---|---|
| 다른 사용자의 ID를 이용한 조회 | 중 | 높음 | RLS, server-side user scope, IDOR 테스트 |
| 확장프로그램 token 탈취 | 중 | 높음 | PKCE, 짧은 access token, 최소 scope, revoke |
| 페이지 prompt injection | 높음 | 중 | 페이지 데이터와 system instruction 분리, tool 미제공 |
| XSS payload | 중 | 높음 | 선택 DOM sanitize, UI text render, CSP |
| Generic URL SSRF | 중 | 높음 | scheme/IP/redirect/size/type/time 제한 |
| 외부 이미지 추적 | 중 | 중 | 웹 UI에서 외부 미디어 미표시 |
| 로그로 원문 유출 | 중 | 높음 | allowlist log fields, redaction test |
| 삭제 후 background write | 중 | 높음 | tombstone + 모든 write 직전 guard |

## 22. 테스트 전략

### 배포 차단 기준

- Instagram golden fixture 3개
- Threads golden fixture 3개
- 각 fixture의 예상 분류·필드·근거 mapping contract test
- Extension → Intake → Outbox → Extraction → Normalization → Validation → Dashboard 통합 테스트
- 수정 → 확인 → Calendar 추가 E2E
- duplicate Keep idempotency
- 삭제 도중 workflow write 차단
- stale revision과 stale calendar 차단
- RLS 사용자 격리, prompt/data 분리, payload limit, SSRF 결정적 보안 테스트

사용자 결정에 따라 광범위한 failure/adversarial fixture 묶음은 이번 배포 차단 기준에 포함하지 않는다. 다만 이번 설계의 핵심 불변조건과 보안 검사는 일반 단위·통합 테스트로 유지한다.

라이브 Instagram 1건과 Threads 1건은 DOM과 로그인 상태 때문에 CI 차단 조건이 아닌 배포 전 수동 smoke test로 실행한다.

## 23. 배포 순서

```text
1. 추가형 DB migration
        │
2. API + outbox relay 배포 (platform flag OFF)
        │
3. Inngest workflow 배포
        │
4. Web dashboard 배포
        │
5. 팀 계정 Instagram flag ON + smoke test
        │
6. 팀 계정 Threads flag ON + smoke test
        │
7. unpacked Chrome extension 배포
        │
8. 전체 사용자 순차 활성화
```

환경별 필수 설정은 Supabase project, Vercel project, Inngest app/signing key, LLM key·model, extension OAuth client·redirect URI, CORS allowlist다. secret은 환경 변수/secret store에 두고 저장소에 커밋하지 않는다.

## 24. 롤백 흐름

```text
장애 감지
   │
   ▼
영향 플랫폼 flag OFF
   │
   ├─ 신규 Intake 차단 및 사용자 안내
   ▼
진행 중 작업 drain 또는 CANCELLED
   │
   ▼
API/Web/Inngest 이전 호환 버전 배포
   │
   ├─ 추가형 DB schema 유지 가능 ─▶ 그대로 유지
   └─ 데이터 오류 발견 ───────────▶ 검증된 복구 script 실행
   ▼
golden fixture smoke test
   │
   ▼
팀 계정부터 재활성화
```

DB migration은 이전 코드와 공존 가능한 추가형 변경만 사용한다. destructive migration은 안정화 이후 별도 배포로 분리한다. 확장프로그램의 구버전 payload는 지원 버전 표에 따라 처리하고, 미지원 버전에는 업데이트 안내를 반환한다.

## 25. 협업 개발 계획

런타임 Agent 수와 개발자 수를 일치시키지 않는다. 공유 계약을 먼저 확정하고 네 워크스트림이 fixture를 기준으로 병렬 개발한다.

| Workstream | 담당 | 산출물 | 의존 계약 |
|---|---|---|---|
| A. Extension & Platform | Manifest V3, PKCE, Keep UX, Instagram/Threads adapters | PageEvidencePayload, 플랫폼 fixture | auth, payload v1 |
| B. Agent & Backend | Intake API, outbox, workflow, Extraction/Normalization/Planning Agents | EvidenceBundle, OpportunityDraft, error registry | payload v1 |
| C. Web & Calendar | dashboard, evidence, 수정·확인, calendar | 상태 UI, calendar API | opportunity, state enum |
| D. Evaluation & Integration | contract test, E2E, latency, demo rehearsal | 6 golden fixtures, verification report | 모든 계약 |

### 구현 순서

```text
Day 0
  ├─ 계약: schema, state, error, revision, auth
  ├─ 인프라: Supabase/Vercel/Inngest/LLM/OAuth
  └─ fixture: Instagram 3 + Threads 3

Day 1
  ├─ A: extension shell + fixture adapter
  ├─ B: intake/outbox + fixture workflow
  └─ C: dashboard/calendar fixture UI

Day 2
  ├─ 수직 통합: Keep → card → confirm → calendar
  ├─ 실제 Instagram/Threads adapter 연결
  └─ failure/minimal card + rollback rehearsal

Core 안정화 후
  └─ Planning Agent 연결
```

팀원은 다른 워크스트림의 내부 구현을 직접 import하지 않는다. 공유 package의 schema와 fixture만 의존한다. 계약 변경은 PR 하나에서 schema, consumer fixture, migration note를 함께 수정한다.

## 26. 구현 작업 목록

- [ ] **T1 (P1)** — 공유 schema package에 PageEvidencePayload, EvidenceBundle, OpportunityDraft, state/error enum을 정의한다.
- [ ] **T2 (P1)** — Supabase Auth/RLS와 확장프로그램 PKCE 연결을 구현한다.
- [ ] **T3 (P1)** — Intake transaction, 최소 링크 카드, transactional outbox와 relay를 구현한다.
- [ ] **T4 (P1)** — cancellation tombstone과 모든 background write의 공통 guard를 구현한다.
- [ ] **T5 (P1)** — 공통 ExtractionAgentRunner와 Instagram/Threads profile을 구현한다.
- [ ] **T6 (P1)** — Normalization Agent와 결정적 Validation Service를 구현한다.
- [ ] **T7 (P1)** — dashboard의 loading/partial/error/success/minimal-card 상태를 구현한다.
- [ ] **T8 (P1)** — revision 기반 수정·확인과 내부 Calendar Writer·STALE 갱신 흐름을 구현한다.
- [ ] **T9 (P1)** — golden fixture 6개와 계약·수직 통합 테스트를 작성한다.
- [ ] **T10 (P2)** — 사용자별·전체 concurrency와 polling backoff를 적용한다.
- [ ] **T11 (P2)** — 구조화 로그, Day 1 dashboard와 경보를 구성한다.
- [ ] **T12 (P2)** — 플랫폼 기능 flag, 단계 배포, rollback smoke test를 구성한다.
- [ ] **T13 (P2)** — core 통합 후 Planning Agent와 stale plan 처리를 구현한다.
- [ ] **T14 (P3)** — 광범위한 failure/adversarial fixture 묶음을 후속 테스트로 추가한다.

## 27. 성공 기준

- 실제 Instagram 1건과 Threads 1건을 확장프로그램으로 Keep해 카드로 만든다.
- 6개 golden fixture의 필드·근거 계약 테스트가 통과한다.
- 10초 안에 카드 또는 지연 상태가 보이고 최종 p95는 30초 이내다.
- 모든 핵심 필드는 근거, `unknown`, `conflicting`, `user_entered` 중 하나를 가진다.
- 세 분류 외 값은 최종 확인 상태로 저장되지 않는다.
- 중복 Keep이 Opportunity를 중복 생성하지 않는다.
- 분석 실패 후에도 최소 링크 카드가 남는다.
- 삭제와 workflow가 경합해도 삭제된 데이터가 재생성되지 않는다.
- 사용자 A가 사용자 B의 Intake, Opportunity, Plan, Calendar를 읽거나 수정할 수 없다.
- 사용자 확인 전에는 캘린더와 Planning Agent가 실행되지 않는다.
- Opportunity 수정 시 기존 Plan과 Calendar가 `STALE`이 된다.
- outbox 유실, LLM 오류, queue 지연을 dashboard와 경보에서 확인할 수 있다.

## 28. What already exists

현재 작업 공간에는 운영 서비스는 없지만, 로컬 수직 슬라이스 구현이 추가됐다. 재사용 대상은 승인된 제품 설계, 공유 계약(`shared/contracts.js`), Agent 경계, 테스트 fixture와 HTTP 통합 테스트다. Supabase·Inngest·실제 LLM provider는 아직 구현하지 않았으므로 production migration 때 이 계약을 유지한다.

참고 제품은 Raindrop의 확장프로그램 저장 UX와 Readwise Reader의 읽기·정리 흐름이다. 기능 복제나 차별화 주장은 하지 않고 입력 마찰을 줄이는 패턴만 참고한다. [Raindrop extension](https://help.raindrop.io/install-extension/), [Readwise Reader](https://docs.readwise.io/reader/docs)

## 29. Dream state delta

이 설계가 완성되면 사용자는 SNS 링크를 잊지 않고 근거가 있는 Opportunity와 내부 일정으로 바꿀 수 있다. 12개월 이상적인 상태까지 남은 간격은 Vision/OCR, 알림, 외부 캘린더, 공식 출처 재검증, 개인별 자격 판단, 중복 공고 병합과 자동 준비 문서 관리다. 현재 계약 중심 구조는 이 확장을 수용하지만, 후속 기능을 미리 구현하지 않는다.

장기 가역성은 4/5다. 플랫폼 adapter, Agent profile, workflow provider, LLM provider를 계약 뒤에서 교체할 수 있다. Supabase RLS와 Inngest 상태 모델에 대한 운영 지식이 주요 기술 부채가 된다.

## 30. Stale Diagram Audit

기존 운영 아키텍처 다이어그램은 없고, 현재는 로컬 Keep 수직 슬라이스가 추가됐다. 본 문서의 시스템 아키텍처, Keep 데이터 흐름, 상태 머신, 삭제 오류 흐름, 배포 순서, 롤백 흐름을 production 구현 기준으로 유지하며, 로컬 실행 경로는 `README.md`의 단순화된 흐름을 따른다.

## 31. Autoplan Review 결과와 구현 진입 기준

### 31.1 리뷰 범위와 자동 결정 원칙

이번 리뷰의 대상은 이 문서와 구현 전 현재 폴더의 상태다. 리뷰 시작 시점에는 구현 코드, package manifest, README, 테스트가 없었고 기술 설계 문서만 있었다. 사용자가 확정한 범위는 Instagram과 Threads에서 사용자가 직접 Keep하거나 URL을 입력한 경우뿐이며, 자동 수집과 프론트 디자인은 이번 구현에서 제외한다.

다음 원칙으로 리뷰 중간 결정을 자동 확정했다.

1. **사용자 결정 우선**: D11 범위 고정, 구조화된 하이브리드 증거, OCR 제외, Planning Agent 후순위를 유지한다.
2. **가역성 우선**: Supabase·Inngest·LLM을 바로 고정하지 않고 동일한 계약 뒤에 로컬 구현을 둔다.
3. **가장 짧은 검증 경로**: 확장프로그램 Keep → Intake API → Extraction Agent → Normalization Agent → Opportunity API → 테스트 웹 화면을 첫 shipping 기준으로 삼는다.
4. **실패도 보존**: 페이지에는 접근했지만 본문 근거가 부족한 분석 실패는 URL과 플랫폼을 가진 최소 카드로 보존한다. 로그인/홈 대체 페이지만 오염 방지를 위해 저장 전에 차단하고, SPA stale canonical은 현재 탭 게시물 URL로 정규화한다.
5. **보안 경계 명시**: 로컬 테스트 인증 우회는 `LOCAL_TEST_MODE`에서만 허용하고, 운영 인증 설계는 별도 단계에서 계약을 재사용한다.
6. **현재 요청에 없는 확장 금지**: 캘린더, 알림, 외부 캘린더, OCR, YouTube/X adapter, 고급 디자인은 수직 흐름을 막지 않는 후속 작업으로 둔다.

외부 Codex 검토는 이전 사용자 결정에 따라 실행하지 않았다. 따라서 아래 평가는 문서·런타임·로컬 계약을 기준으로 한 단일 리뷰이며, 구현 테스트가 끝난 뒤 별도 독립 검토가 가능한 상태로 남긴다.

### 31.2 CEO/제품 리뷰

**결론: HOLD_SCOPE, 구현으로 진행.** 제품의 첫 약속은 “저장한 정보가 실제 카드로 돌아온다”이며, 자동 수집이나 신청 자동화가 아니다. 현재 설계는 이 약속을 지키지만 운영 인프라가 앞서 있어 첫 증명까지의 거리가 길다.

자동 확정한 선택지는 다음과 같다.

- 로컬 수직 슬라이스를 먼저 만든다. Node 내장 HTTP 서버와 메모리 저장소를 사용하고, production provider는 인터페이스로 격리한다.
- 실제 Agent 경계를 유지한다. `InstagramExtractionAgent`, `ThreadsExtractionAgent`, `NormalizationAgent`, `ValidationService`를 별도 모듈로 둔다.
- 첫 카드에 `intake_id`와 처리 상태를 노출한다. 확장프로그램 팝업에서 이 ID로 테스트 웹 화면을 열 수 있어야 한다.
- 단일 사용자의 동시 Intake는 로컬에서도 2개로 제한하고 초과 요청은 `QUEUED`로 남긴다.
- 본문 근거 부족 시 `NEEDS_REVIEW` 최소 카드와 오류 코드, 다음 행동을 반환한다. 접근 대체 페이지만 `PAGE_ACCESS_REQUIRED`로 저장하지 않고 확장프로그램에서 재시도를 안내한다. Threads SPA의 stale `og:url`과 `/t/{id}` 짧은 주소는 현재 탭 URL과 게시물 ID를 우선해 정상 저장한다.

**제품 리스크**: 현재 구현이 없으므로 “확장프로그램과 웹서비스가 연동된다”는 주장은 아직 미검증이다. 이 문서의 성공 기준에 로컬 실행 명령과 자동 통합 테스트를 추가해 검증 가능한 주장으로 바꾼다.

### 31.3 Design 리뷰

사용자가 프론트 디자인을 마지막에 만들기로 했으므로 이번 Design 리뷰의 대상은 시각 디자인이 아니라 테스트 화면의 상태 전달이다.

- 테스트 화면은 사용자 확인에 필요한 제목, 내용, 기간/마감일, 원문·관련 링크만 카드로 보여준다. `intake_id`, `status`, `platform`, `author`, `category`, 근거와 오류 코드는 백엔드/개발 검증 데이터로 유지하고 사용자 카드에는 노출하지 않는다.
- 색상·브랜딩·반응형·모션·컴포넌트 라이브러리는 구현하지 않는다.
- 성공, 처리 중, 실패, 근거 부족의 네 상태를 같은 화면에서 재현할 수 있어야 한다.
- 확장프로그램 팝업은 Keep 버튼과 결과 링크, 실패 원인 한 줄만 둔다.

이 결정은 UI 품질을 낮추기 위한 것이 아니라, 디자인 작업 전에 데이터 계약과 상태 전이를 검증하기 위한 것이다. 최종 디자인 단계에서 동일한 API와 상태 모델을 그대로 재사용한다.

### 31.4 Eng 리뷰

#### 첫 구현 경계

```text
extension popup
    │ chrome.scripting.executeScript(activeTab)
    ▼
PageEvidencePayload
    │ POST /v1/intakes
    ▼
Intake Orchestrator
    ├─ InstagramExtractionAgent / ThreadsExtractionAgent
    ├─ NormalizationAgent
    └─ ValidationService
    ▼
OpportunityStore (local memory)
    │ GET /v1/opportunities
    ▼
test web frontend
```

로컬 서버는 이후 `IntakeStore`, `WorkflowProvider`, `AgentRunner` 구현으로 교체 가능하게 만든다. 첫 구현에서 DB, outbox, Inngest, LLM 호출을 흉내 내기 위한 임시 의존성은 추가하지 않는다. 서버가 수락한 payload와 최종 Opportunity를 같은 프로세스에서 추적하는 것이 첫 검증의 목적이다.

#### 테스트 계획

상세 계획은 `~/.gstack/projects/keep/test-plan-autoplan-20260813.md`에 기록한다. 배포 차단 기준은 정상 Instagram/Threads golden fixture와 핵심 보안·삭제 불변식 테스트다. 광범위한 adversarial fixture는 사용자가 선택한 대로 후속으로 분리한다.

최소 테스트 묶음은 다음이다.

- 계약 검증: URL, platform, body, evidence, payload size 제한
- Agent 분기: Instagram/Threads adapter가 동일한 정규화 입력을 만든다
- 분류: Competition, Support, Benefit 외 값은 저장하지 않는다
- 통합: Keep payload POST 후 GET 목록에 카드가 나타난다
- 실패: 증거 부족 시 URL 기반 최소 카드와 `NEEDS_REVIEW`가 남는다
- 중복: 같은 canonical URL은 하나의 Opportunity만 만든다
- 삭제 경합: 취소 뒤 비동기 완료가 데이터를 다시 만들지 않는다

#### 실행 병렬화

계약과 local API를 먼저 고정한 뒤, 서버 Agent 모듈·확장프로그램·테스트 웹 화면을 병렬로 만든다. 마지막에 Node 내장 `node:test` 통합 테스트로 실제 HTTP 경로를 닫는다. 이 순서는 팀원이 각자 작업해도 payload 이름과 상태 enum이 갈라지지 않게 한다.

### 31.5 DX 리뷰

#### 개발자 페르소나 카드

- **대상**: 협업 프로젝트에서 Agent 모듈을 구현하는 TypeScript/JavaScript 개발자
- **상황**: SNS Keep 입력과 웹 카드 출력이 연결됐는지 로컬에서 빠르게 확인해야 한다.
- **허용 시간**: 처음 실행까지 5분, 첫 성공 확인까지 10분
- **기대**: 한 명령으로 서버를 띄우고, fixture 페이지에서 Keep을 눌러 카드와 `intake_id`를 확인한다.

#### 개발자 관점

“처음 폴더를 열었는데 실행할 package.json과 README가 없다. 설계서에는 Inngest와 Supabase가 나오지만 지금 당장 어떤 서버를 켜야 하는지는 알 수 없다. 나는 외부 계정을 만들거나 API 키를 넣기 전에, 로컬 fixture 페이지를 열고 Keep을 눌러 웹 화면에 카드가 나타나는지 보고 싶다. 성공하면 Agent별 파일을 읽어보고, 실패하면 어느 단계에서 멈췄는지 `intake_id`로 추적하고 싶다. 이 경로가 5분 안에 닫히지 않으면 구현보다 인프라 설정을 먼저 디버깅하게 된다.”

#### 경쟁 기준과 magical moment

로컬 개발 도구의 기준은 `hello world`를 2~5분 안에 확인하는 Competitive tier다. 이 프로젝트의 magical moment는 “fixture Instagram/Threads 페이지에서 Keep 클릭 후 1~3초 내 테스트 웹 화면에 정규화된 카드가 나타나는 것”으로 정한다. 배포 방식은 설치가 필요한 브라우저 확장프로그램 + 복사 가능한 로컬 명령이며, 외부 계정과 결제 없이 실행한다.

#### 개발자 여정

| 단계 | 개발자 행동 | 해결 기준 |
|---|---|---|
| Discover | README에서 범위와 흐름 확인 | 지원 플랫폼과 제외 범위를 첫 화면에 명시 |
| Install | `npm install` 없이 Node만 확인 | Node 버전과 한 줄 실행 명령 제공 |
| Hello World | fixture 페이지에서 Keep | 예상 응답과 테스트 웹 URL 표시 |
| Real Usage | 실제 payload와 Agent 파일 확인 | 계약, 상태 enum, fixture 위치를 링크 |
| Debug | `intake_id`로 상태 조회 | 오류 코드·원인·다음 행동을 표시 |
| Upgrade | production provider로 교체 | local provider 경계와 교체 목록을 문서화 |

#### DX 점수표

| 항목 | 점수 | 근거와 10점 조건 |
|---|---:|---|
| Getting Started | 8/10 | 코드가 없던 상태에서 README·한 줄 실행·fixture를 추가한다. 10점은 확장프로그램 자동 설치까지 필요하다. |
| API/계약 | 8/10 | `POST /v1/intakes`와 `GET /v1/opportunities`가 목적에 맞다. 10점은 타입 패키지와 SDK가 필요하다. |
| 오류/디버깅 | 7/10 | 상태·오류 코드·intake ID를 노출한다. 10점은 문서 링크가 있는 구조화 오류다. |
| 문서/학습 | 7/10 | README와 기술문서가 분리된다. 10점은 실행 가능한 tutorial과 reference가 모두 필요하다. |
| 업그레이드 경로 | 6/10 | local provider 교체 경계를 문서화한다. production migration guide는 후속이다. |
| 개발 환경 | 8/10 | Node 내장 모듈과 `node:test`로 OS 의존성을 줄인다. |
| 커뮤니티/생태계 | 2/10 | 아직 저장소와 채널이 없다. 이번 범위에서는 만들지 않는다. |
| DX 측정 | 7/10 | TTHW와 통합 테스트를 기록한다. 실제 팀 사용 telemetry는 후속이다. |
| **전체** | **6.6/10** | 로컬 검증에는 충분하지만 production onboarding은 아직 아니다. |

#### 명시적 후속 DX 부채

- 확장프로그램 자동 패키징과 서명: 수동 unpacked 로딩으로 먼저 검증한다.
- 타입 공유 package와 generated API client: 로컬 payload가 고정된 뒤 추가한다.
- production 환경 변수 검사와 migration guide: Supabase/Inngest 도입 시 추가한다.
- 팀 피드백/telemetry: 개인정보 없는 TTHW 측정 설계 후 추가한다.

### 31.6 Autoplan 구현 작업

아래 작업은 이번 요청에서 바로 실행한다.

- [x] **AP-1 (P1)** 계약·상태 enum과 local HTTP API 구현 — `shared/contracts.js`, `server/` — `node --test tests/contracts.test.js`
- [x] **AP-2 (P1)** Instagram/Threads Extraction Agent와 Normalization Agent 구현 — `server/agents/` — fixture별 분류·마감일 검증
- [x] **AP-3 (P1)** 테스트 웹 화면과 fixture 페이지 구현 — `web/`, `fixtures/` — 브라우저에서 목록과 상태 확인
- [x] **AP-4 (P1)** MV3 확장프로그램 Keep 흐름 구현 — `extension/` — activeTab 증거 수집 후 Intake API 전송
- [x] **AP-5 (P1)** Keep → HTTP → Agent → Opportunity 통합 테스트 — `tests/integration/` — `npm test`
- [x] **AP-6 (P2)** README와 로컬 디버깅 안내 추가 — `README.md` — 5분 이내 첫 카드 재현

#### 31.7 구현 완료 증거

- `npm test`: 계약, MV3 확장프로그램 선언, Instagram/Threads 통합, 중복 갱신, 근거 부족, Threads OG 본문 회귀 테스트 **8개 통과**.
- `node --check extension/popup.js server/index.js server/workflow.js`: 문법 통과.
- 로컬 서버에서 `POST /v1/intakes` → `READY_FOR_REVIEW` → `GET /v1/opportunities`를 직접 확인했고, Competition 카드와 2026-10-01 마감일이 반환됐다.
- Playwright로 테스트 웹을 열어 카드, `intake_id`, `READY_FOR_REVIEW`, 콘솔 오류 없음까지 확인했다.
- Chromium에 MV3 확장프로그램을 실제 로드하고 팝업의 Keep을 클릭해 `http://localhost:4173/?intake_id=...`가 열리는 E2E를 통과시켰다. 화면에는 `READY_FOR_REVIEW`, `instagram`, `Competition`, 마감일이 표시됐다.
- 실제 Threads 게시물 `@choi.openai/DJWWfIDv2SN`을 Chromium에서 Keep해 본문 기반 제목·내용, 작성자, 게시일 `2025-05-07`, 마감일 `정보 없음`, Notion 링크 한 건, 짧은 canonical URL이 표시되는 E2E를 통과시켰다.
- 실제 Threads 게시물 `@choi.openai/DbWnfnGAGrg`를 Chromium에서 Keep해 본문 전체, `Support`, 작성자 `choi.openai`, canonical URL, `마감일 정보 없음`이 표시되는 E2E를 통과시켰다. 같은 URL을 Threads 홈/로그인 메타데이터로 캡처한 payload는 저장 전에 거부된다.
- Instagram 릴스 URL `/reels/{id}`와 canonical `/reel/{id}`를 계약 테스트로 검증했고, 영상 본문은 읽지 않고 캡션 텍스트와 캡션 내 링크만 Opportunity로 정규화한다. 일반 Instagram `/p/` 게시물도 같은 캡션 전용 경로를 사용한다.
- 실제 로그인된 Instagram 페이지와 플랫폼별 DOM 변형 대응은 후속 수동 검증이다. 본문이 없고 플랫폼 제목만 있는 입력은 `CONTENT_INSUFFICIENT`와 `NEEDS_REVIEW`로 보존한다.

#### 31.8 Threads 수집 오류 수정 기록

기존 결과가 `Threads의 CHOI(@choi.openai)님`을 제목으로 쓰고 게시일 `2025-05-07`을 마감일로 표시한 원인은 다음이었다.

1. `og:title`은 작성자 표기인데 이를 게시물 제목으로 사용했다.
2. 실제 게시물 내용이 들어 있는 `og:description`을 본문 후보에서 누락했다.
3. 본문에 있는 날짜를 마감 키워드 없이 deadline으로 추정했다.
4. 전체 페이지의 추천 링크를 수집했고, 같은 canonical URL 재저장 시 기존 Opportunity를 갱신하지 않았다.

현재 구현은 `og:description` 우선, `og:url` canonical 우선, `time[datetime]` 게시일 별도 저장, `마감/접수기간/신청기간/deadline` 키워드가 붙은 날짜만 deadline 후보 인정, 마감일 선택값, 본문 참조 링크만 저장, 짧은 로그인/홈 대체 페이지만 차단, SPA stale metadata에 대비한 현재 URL의 Instagram article·DOM 캡션 우선·최대 5회 캡처·rendered 게시물 ID 확인, 작성자명·팔로우·좋아요 UI 텍스트 제외, 현재 탭 게시물 URL 우선(`/t/{id}` 포함), Instagram `/p/`, `/reel/`, `/reels/`, `/tv/`는 영상이 아닌 캡션·본문만 추출, OG 로그인 안내와 충분한 DOM 본문이 함께 있으면 DOM 본문으로 대체, 중복 Keep 시 최신 증거로 upsert하는 규칙을 사용한다.

이번 구현에서 만들지 않는 작업은 알림, 캘린더 동기화, Planning Agent, OCR/Vision, YouTube/X adapter, Supabase RLS, Inngest outbox, 최종 UI 디자인이다. 이들은 AP-5가 통과한 뒤 계약을 유지한 채 별도 작업으로 진행한다.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | `/plan-ceo-review` | 범위·전략·제품 경계 | 2 | CLEAR | HOLD_SCOPE, 로컬 수직 슬라이스 우선, critical gap 0 |
| Codex Review | `/codex review` | 독립 2차 의견 | 0 | SKIPPED | 사용자 결정으로 외부 검토 생략 |
| Eng Review | `/plan-eng-review` | 아키텍처·테스트 shipping gate | 1 | CLEAR_WITH_CONCERNS | 구현 경계를 local provider로 고정하고 통합 테스트를 shipping gate로 추가 |
| Design Review | `/plan-design-review` | UI/UX 상세 검토 | 1 | CLEAR_WITH_CONCERNS | 최종 디자인은 보류, 테스트 화면 상태 전달만 확정 |
| DX Review | `/plan-devex-review` | 개발자 경험 | 1 | CLEAR_WITH_CONCERNS | README·fixture·intake_id·구조화 오류가 AP-1~AP-6에 반영됨 |

**VERDICT:** AUTOPLAN CLEAR_WITH_CONCERNS — AP-1부터 AP-6까지 구현하고 `npm test` 및 Keep 수동 검증을 통과하면 로컬 수직 슬라이스를 완료한다. 운영 인프라와 최종 UI 디자인은 그 이후 단계다.

NO UNRESOLVED DECISIONS

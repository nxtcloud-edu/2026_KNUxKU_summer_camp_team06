# KEEP:ON — 프로젝트 정의와 협업 기준

## 1. 한 줄 정의

SNS에서 사용자가 저장한 정보성 게시물을 다시 확인하고 실행할 수 있도록,
본문·기간·링크를 정리해 대시보드와 계획으로 연결하는 서비스입니다.

## 2. 해결하려는 문제

청년·대학생은 공모전, 정책, 취업·창업 지원, 할인·무료 혜택을 Instagram·Threads 등에서
발견하지만 저장 후 다시 열어보지 않아 마감과 기회를 놓칩니다. KEEP:ON은 정보를 대신
찾아오는 서비스가 아니라 사용자가 이미 발견해 Keep한 정보를 실행 가능한 형태로 바꿉니다.

## 3. 제품 범위

### 현재 범위

1. Chrome Extension의 Keep 버튼으로 현재 게시물 저장
2. 웹에서 링크를 직접 입력
3. 페이지 증거에서 제목·본문·관련 링크·게시일을 추출
4. Competition, Support, Benefit으로 정규화
5. 마감일은 확인 가능한 경우에만 저장하고 없으면 null
6. HTTP Web 대시보드에 카드로 표시
7. 사용자가 확인한 항목만 다음 단계로 넘김

### 후속 범위

- Planning Agent, Quest/Todo, Calendar
- 마감 알림과 반복 확인
- YouTube 자막, X 등 추가 플랫폼

자동 수집·대량 크롤링·사용자 승인 없는 캘린더 등록은 하지 않습니다.
Instagram 릴스와 동영상은 영상을 분석하지 않고 게시물 캡션·본문과 본문 링크만 수집합니다.

## 4. 입력과 결과 계약

Extension 또는 링크 입력은 Node 서비스의 PageEvidencePayload로 들어옵니다.

~~~text
PageEvidencePayload
  source_url       사용자가 연 원문 게시물 URL
  canonical_url    페이지에서 확인한 canonical URL
  platform         instagram | threads
  page_title       페이지 제목 후보
  body_text        게시물 본문·캡션
  links            본문에서 확인된 관련 링크
  published_at     게시일(마감일과 구분)
  evidence         출처와 본문 근거
~~~

대시보드 카드의 최소 필드는 다음과 같습니다.

~~~text
title, body/summary, deadline(nullable), canonical_url, source_url,
links, platform, category, status, needs_review
~~~

## 5. Agent 역할

| 담당 영역 | 책임 | 현재 위치 |
|---|---|---|
| 오케스트레이션·계약 | Intake 상태, 공용 모델, Agent 연결 | services/keep-web/server/workflow.js, shared/contracts.js |
| 플랫폼 수집 | Instagram·Threads의 페이지 증거를 추출 | services/keep-web/server/agents/ |
| 정규화 | 제목·본문·마감일·분류를 표준 필드로 변환 | services/keep-web/server/agents/normalization-agent.js |
| 적격성·우선순위 | 사용자 프로필과 조건을 비교 | src/eligibility_agent.py, src/feasibility_agent.py, src/ranking_agent.py |
| 계획·실행 | 확인된 항목의 Quest/Todo·캘린더 계획 | src/execution/, src/planning_agent.py, src/calendar_agent.py |
| Web·Extension | HTTP API 화면과 Keep 경험 | services/keep-web/web/, extension/ |

Node KEEP:ON은 사용자 Keep과 개인 저장소의 진입점이며, Python Agent는 정규화된 데이터의
추천·실행 흐름을 담당합니다. 두 런타임의 계약을 팀 합의 없이 따로 확장하지 않습니다.

## 6. 절대 규칙

### R1. 구조화와 판정을 분리한다

Extraction·Normalization은 원문을 구조화만 합니다. 사용자 적격 여부와 추천 판정은
별도 Agent가 담당합니다.

### R2. 모든 추출에는 근거가 있어야 한다

원문에 없는 내용을 생성하지 않습니다. Python 파이프라인은 raw_quote와 span을
반환하고, Node 서비스는 evidence[].text와 출처를 보존합니다.

### R3. 실패는 실패로 표현한다

로그인 안내, 게시물 URL 불일치, 본문 미확인, 지원하지 않는 플랫폼은 성공으로 저장하지
않습니다. PAGE_ACCESS_REQUIRED, CANONICAL_POST_MISMATCH, NEEDS_REVIEW 등 상태로
표현합니다.

### R4. 모호한 값은 미확정으로 둔다

분류나 기간을 근거 없이 추정하지 않습니다. 확인할 수 없으면 null 또는
NEEDS_REVIEW로 남깁니다. 마감일은 필수가 아닙니다.

### R5. 계산은 결정적으로 처리한다

날짜 차이·마감 역산·상태 전이는 LLM에 맡기지 않습니다.

### R6. 로그인과 접근 제한을 우회하지 않는다

세션 위조, 비공개 API, 헤더 조작으로 SNS 접근을 우회하지 않습니다.
사용자가 로그인한 브라우저에서 보이는 현재 페이지 증거만 사용합니다.

### R7. 개인정보를 최소화한다

주민번호·상세 주소·쿠키·토큰·DM·댓글을 수집하지 않습니다.

## 7. 협업·브랜치 규칙

- 각 작업은 feature/* 또는 codex/* 브랜치에서 수행합니다.
- main에는 직접 커밋하거나 병합하지 않습니다.
- Agent별 변경은 해당 폴더와 테스트를 함께 수정합니다.
- 공용 계약, workflow, API 변경은 PR 설명에 영향 범위를 적습니다.
- 새 코드는 services/keep-web 아래에 두고, 기존 Python 파일은 실제 구현 여부를 확인한 뒤
  담당자 합의 없이 수정하지 않습니다.
- 모든 Node 변경은 cd services/keep-web && npm test를 통과해야 합니다.

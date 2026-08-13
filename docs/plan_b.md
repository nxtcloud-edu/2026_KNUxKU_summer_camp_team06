# B(신민서) 실행 계획 — 데이터 · 링크 분석

> 산출물 3개: `data/opportunities.json`(실제 20건), `src/extraction_agent.py`,
> `src/normalization_agent.py`. 이미 실행 가능한 스켈레톤이 만들어져 있음
> (`.venv` 가상환경 + 의존성 설치 완료, 두 모듈 다 `python -m src.xxx`로 단독 테스트 가능).

## 현재 상태 (이미 완료됨)

- [x] `src/extraction_agent.py`: 링크(requests+bs4 실제 동작) / 텍스트(실제 동작) / **파일(PDF, pypdf 실제 동작)** / 이미지(mock, 인터페이스만) → `SavedContext`
- [x] `src/normalization_agent.py`: 나이·기간은 정규식(R5 준수, 실제 동작, 실제 20건으로 패턴 보강 완료) / 나머지 6종은 키워드 기반 mock LLM → `NormalizationResult`, `raw_quote`가 원문에 실재하는지 코드로 검증(`_verify_grounding`)해서 R2를 강제함
- [x] `data/opportunities.json`: 실제 공고 20건 (지원사업6·공모전5·서포터즈5·부트캠프4), 위비티/링커리어/온통청년/각 지자체 공식 페이지에서 직접 수집
- [x] `scripts/run_pipeline.py`: 20건 전체 검증 — extraction 20/20 ok, normalization 19/20 ok (1건은 원문 자체에 조건 없음이 명시된 정상 케이스)
- [x] `docs/personas.md`: 실제 데이터 기반 테스트 페르소나 5종
- [x] GitHub 공유 완료 (2026-08-13, `main` 브랜치)

## Day 1 — 로컬 파이프라인 완성 (AWS 없음)

### 1. 실제 공고 20건 수집 — ✅ 완료
- 위비티·링커리어·온통청년·강원일자리정보망·서울주거포털·bizinfo.go.kr 등에서 직접 수집
- 8종 조건 전 타입 실제 등장 확인됨 (age14·region4·status16·income3·duplicate3·military5·period16·etc4)

### 2. normalization_agent.py 정확도 보강 — ✅ 완료
- 실제 데이터로 나이(0→14건)/기간(1→16건) 정규식 패턴 대폭 보강, 키워드 힌트도 확장
- **알려진 한계**: `opp-grant-04`처럼 생년월일 구간으로 나이를 표현하는 경우는 여전히 못 잡음 → AWS 연동 후 LLM 교체로 해결 예정
- `_verify_grounding()` 검증은 그대로 유지 (R2 핵심 안전장치)

### 3. extraction_agent.py 견고화 — 진행 중
- [x] 실제 링크 20개 크롤링 테스트 통과
- [x] **FILE(PDF) 입력 경로 추가** — 실제 수집 중 서울시 청년월세지원 공고가 PDF 첨부파일로만 제공되는 걸 발견해서 추가. HWP는 의도적으로 미지원(파싱 신뢰도 낮음) → 실패 처리 + 스크린샷 유도 (R6와 동일 원칙)
  - 알려진 한계: PDF에 ToUnicode CMap이 없는 경우 pypdf가 깨진 텍스트를 반환할 수 있음(감지 못함) — 실제 정부 PDF로는 정상 동작 확인
- [ ] **크롬 익스텐션 입력 경로** — Raindrop.io 참고해 A가 만들 예정. 익스텐션은 사용자의 인증된 브라우저 세션에서 이미 렌더링된 콘텐츠를 캡처하므로, 서버가 재요청할 필요 없는 새 입력 경로(`SourceType.EXTENSION` 후보)가 필요함. A의 실제 구현을 보기 전까지 스키마 확정 보류
- [ ] 스크린샷 케이스는 아직 mock — D/E와 "이미지 업로드 → mock 텍스트 반환" 흐름이 UI 데모에 문제없는지 확인 필요

### 4. 최소 통합 테스트 — ✅ 완료
- `scripts/run_pipeline.py`로 20건 전체 검증, 결과 `data/normalization_results.json`으로 저장

### 5. content_category 분류 추가 — ✅ 완료
- 실제 테스트로 발견: 사용자가 저장하는 건 지원사업만이 아니다 (인스타 정보성 글, 행사 티켓 공지 등)
- `normalize()`가 `opportunity`/`time_sensitive_info`/`general_info` 3종으로 자동 분류 (별도 분류기 없이 8종 조건 추출의 부산물로 판단)
- Instagram/TikTok처럼 로그인 없인 본문을 못 주는 SPA를 감지해 실패 처리하는 로직도 `extraction_agent.py`에 추가 (겉보기엔 200 OK인데 실제로는 로그인 유도 문구만 있는 경우까지 커버)
- 상세 내용/라우팅 규칙: `ARCHITECTURE.md` 1-1절

## Day 1 저녁 / Day 2 오전 — C, D와 통합 (다음 작업)

- [ ] C에게 `NormalizationResult` 샘플 20개 전달, C의 `eligibility_agent.py`가 기대하는 입력과 실제 출력이 맞는지 맞춰보기 — **깃허브 공유는 됐지만 팀원 간 코드 리뷰/동기화는 아직 안 된 상태이므로 별도로 알려야 함**
- [ ] **A/D에게 content_category 라우팅 필요성 전달** (최우선) — Supervisor가 `opportunity`만 C로 보내고 나머지는 D로 바로 보내야 함. D의 planning_agent도 "마감 없는 실행 제안"을 다룰 수 있어야 함 — 지금 D 쪽 stub엔 이 개념이 전혀 없으므로 설계 논의 필요
- [ ] A와 `src/models.py`에 스키마 이관 논의 (지금 draft로 각 파일 상단에 있는 `SavedContext`, `NormalizationResult` 등을 공식 스키마로 확정) — FILE/EXTENSION source type, content_category 모두 포함해서 논의
- [ ] status가 `partial`/`failed`인 케이스를 C/D/E가 UI에서 어떻게 다뤄야 하는지 합의 (예: `failed`면 사용자에게 재입력 요청)
- [ ] `docs/personas.md`에서 발견한 온보딩 소득구간 설계 이슈(퍼센트 세분화 필요) A/C와 논의

## Day 2 — AWS 발급 후

- [ ] `MockVisionLLMClient` → 실제 Bedrock Claude(vision) 클라이언트로 교체 (`VisionLLMClient` 인터페이스는 이미 맞춰져 있어 구현체만 교체하면 됨)
- [ ] `MockNormalizationLLMClient` → 실제 Bedrock Claude 클라이언트로 교체, 단 `_verify_grounding()` 검증은 그대로 유지 (LLM이 헛소리해도 코드가 걸러냄)
- [ ] Strands `@tool`로 `extract()`, `normalize()`를 감싸서 A의 Supervisor에 연결
- [ ] 필요 시 AgentCore Runtime에 배포 (워크샵 022 문서 절차: Docker `--platform linux/arm64` 빌드 → ECR push → `create_agent_runtime`)

## 리스크 & 체크포인트

| 리스크 | 대응 |
|---|---|
| 실제 20건 수집이 예상보다 오래 걸림 | Day 1 오전에 최우선 처리, 오후엔 최소 10건이라도 확보해 파이프라인 검증 먼저 진행 |
| C가 기대하는 스키마와 어긋남 | Day 1 저녁에 반드시 실물 JSON으로 싱크, 말로만 합의하지 않기 |
| mock LLM 결과가 너무 빈약해 데모가 어색함 | `_KEYWORD_HINTS` 보강 + 정규식 패턴 확장으로 커버리지 높이기 (완벽한 정확도보다 "근거 인용이 항상 진짜"라는 R2 원칙을 데모 포인트로 삼기) |
| AWS 발급이 늦어짐 | mock 인터페이스가 이미 실제 인터페이스와 동일한 시그니처이므로 교체만 하면 됨 — 늦어져도 로컬 데모는 항상 가능 |

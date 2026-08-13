# B(신민서) 실행 계획 — 데이터 · 링크 분석

> 산출물 3개: `data/opportunities.json`(실제 20건), `src/extraction_agent.py`,
> `src/normalization_agent.py`. 이미 실행 가능한 스켈레톤이 만들어져 있음
> (`.venv` 가상환경 + 의존성 설치 완료, 두 모듈 다 `python -m src.xxx`로 단독 테스트 가능).

## 현재 상태 (이미 완료됨)

- [x] `src/extraction_agent.py`: 링크(requests+bs4 실제 동작) / 텍스트(실제 동작) / 이미지(mock, 인터페이스만) → `SavedContext`
- [x] `src/normalization_agent.py`: 나이·기간은 정규식(R5 준수, 실제 동작) / 나머지 6종은 키워드 기반 mock LLM → `NormalizationResult`, `raw_quote`가 원문에 실재하는지 코드로 검증(`_verify_grounding`)해서 R2를 강제함
- [x] `data/opportunities.json`: 스키마 + SAMPLE 2건 (실제 데이터 아님, 표시됨)

## Day 1 — 로컬 파이프라인 완성 (AWS 없음)

### 1. 실제 공고 20건 수집 (최우선, 병목 지점)
- 목표: 인스타그램/블로그/학교공지/온통청년(youthcenter.go.kr) 등에서 **실제** 청년 대상 공모전·지원사업·서포터즈·부트캠프 공고 20건
- 기준: `raw_text`에 **원문 그대로**(재작성 금지) 자격요건이 포함되어야 함 — normalization의 근거 인용이 여기서 나옴
- 카테고리 균형: 공모전/서포터즈/부트캠프/지원사업 각 4~6건 정도로 분산 (페르소나 김서연의 작년 이력과 맞추면 데모 설득력↑)
- 진행하면서 `_fields`에 정의된 필드 그대로 `data/opportunities.json`의 `opportunities` 배열에 추가, SAMPLE 2건은 데모 직전에 제거
- **8종 조건이 실제로 다양하게 나타나는 공고를 의도적으로 섞을 것** (특히 `income`, `duplicate`, `military`, `etc`처럼 mock 키워드 리스트에 없는 표현이 있는 공고 3~4건은 일부러 포함 — normalization의 "모르면 unknown" 동작을 데모에서 보여주기 좋음)

### 2. normalization_agent.py 정확도 보강
- 수집한 20건을 `normalize()`에 실제로 돌려보고, 정규식(`_AGE_PATTERN`, `_PERIOD_PATTERN`)이 놓치는 표기 패턴 발견 시 패턴 추가 (예: "1991년생 이후", "만 19세~34세" 등 변형)
- `_KEYWORD_HINTS`에 실제 공고에서 자주 보이는 표현 추가 (예: "중위소득", "차상위" 등)
- **주의**: 정규식/키워드를 아무리 늘려도 `_verify_grounding()` 검증은 절대 우회하지 말 것 — 이게 R2의 핵심 안전장치

### 3. extraction_agent.py 견고화
- 실제 링크 20개로 `extract_from_link()` 테스트 → JS 렌더링 페이지, 로그인 필요 페이지(R6: 우회 금지, failed 처리 확인), PDF 링크 등 예외 케이스 확인
- 스크린샷 케이스는 아직 mock 그대로 두되, 팀 회의에서 D/E와 "이미지 업로드 → mock 텍스트 반환" 흐름이 UI 데모에 문제없는지 확인

### 4. 최소 통합 테스트
- `data/opportunities.json`의 20건을 `extract → normalize` 파이프라인에 순서대로 태워 `NormalizationResult` 20개를 생성하는 스크립트 작성 (`tests/` 또는 `scripts/run_pipeline.py`)
- 결과를 JSON으로 저장해 C(엄세연)에게 전달 — **이게 B→C 인터페이스의 첫 실물 계약**

## Day 1 저녁 / Day 2 오전 — C, D와 통합

- [ ] C에게 `NormalizationResult` 샘플 20개 전달, C의 `eligibility_agent.py`가 기대하는 입력과 실제 출력이 맞는지 맞춰보기
- [ ] A와 `src/models.py`에 스키마 이관 논의 (지금 draft로 각 파일 상단에 있는 `SavedContext`, `NormalizationResult` 등을 공식 스키마로 확정)
- [ ] status가 `partial`/`failed`인 케이스를 C/D/E가 UI에서 어떻게 다뤄야 하는지 합의 (예: `failed`면 사용자에게 재입력 요청)

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

# A(Node/Extension) ↔ B(Python/정규화) 병합 계획

> 배경: A가 `codex/node-extension-http-web` 브랜치에서 Chrome 확장 + Node HTTP 서버 +
> 자체 Supabase 스키마로 된 "KEEP:ON" 수직 슬라이스를 독립적으로 만들었다. B(제) 작업과
> 겹치는 부분(정규화, Supabase)이 있지만, **입력(확장/서버)과 정규화(구조화)를 분리하면
> 충돌 없이 합칠 수 있다.** C(엄세연)가 이미 병합한 판정 로직이 8종 조건 구조에 의존하고
> 있어서, 그 계약을 절대 깨면 안 된다는 게 이 계획의 제약조건이다.

## 핵심 판단: 뭘 버리고 뭘 살릴까

| 영역 | A 것 | B(제) 것 | 결정 |
|---|---|---|---|
| Chrome 확장 | 있음, 동작함 | 없음 | **A 채택** |
| HTTP 서버/워크플로우 상태머신 | 있음 (QUEUED→...→READY_FOR_REVIEW) | 없음 | **A 채택** |
| 사용자 인증 | Supabase Auth (`auth.users`) 실제 연동됨 | 미정(문서에 "결정 필요"로 남겨둠) | **A 채택** — 제 열린 질문 하나가 이걸로 해결됨 |
| 입력 추출 개념 | `intakes.source_type` (extension/link/text/pdf/image) | `SavedContext.source_type` (동일 개념) | **거의 같음, A 테이블 그대로 확장** |
| **정규화(자격조건 구조화)** | 3종 카테고리(Competition/Support/Benefit) + 단일 deadline, raw_quote 없음 | **8종 조건 + raw_quote/span 근거 검증(R2)** | **B 채택** — C의 판정 로직이 이걸 직접 의존함 |
| DB 저장 테이블 | `intakes`/`opportunities` (flat) | `saved_items`/`normalized_opportunities` (별도) | **A 테이블에 B 필드를 얹는다** (테이블 중복 안 만듦) |

## 구체적 병합 단계

### 1단계 — Supabase 마이그레이션 추가 (충돌 없음, additive)

A의 `public.opportunities`에 제 구조화 결과를 담을 컬럼 2개만 추가한다:

```sql
-- 202608130004_add_structured_eligibility.sql
alter table public.opportunities
  add column if not exists content_category text
    check (content_category in ('opportunity', 'time_sensitive_info', 'general_info')),
  add column if not exists conditions jsonb not null default '[]'::jsonb;

create index if not exists opportunities_conditions_gin
  on public.opportunities using gin (conditions);
```

기존 A 컬럼(title/summary/category/deadline)은 그대로 둔다 — UI 카드뷰용으로 계속 쓰면 됨.
`category`(3종, A)와 `content_category`(3종, B)는 축이 다른 별개 필드라 헷갈리지 않게
이름을 다르게 유지한다.

### 2단계 — Python 정규화 브릿지 서버 추가 (B가 만듦, A 코드 안 건드림)

새 파일 `src/bridge_server.py` — 작은 Flask 앱, `extraction_agent.py`/
`normalization_agent.py`를 그대로 감싸기만 함:

```
POST /normalize
  입력: { intake_id, body_text, title, canonical_url, source_url, platform, deadline_text }
  처리: normalize(intake_id, body_text) 호출 (기존 함수 그대로, 수정 없음)
  출력: {
    content_category, conditions,           # B의 구조화 결과 (그대로)
    title, summary, category, deadline,     # A의 카드뷰용 필드 (조건에서 유도)
    confidence, normalization_method: "gemini_structured"
  }
```

`category`/`deadline`은 `conditions`에서 유도한다(예: period 조건 있으면 그 날짜를
deadline으로, content_category가 opportunity면 category는 별도 간단 분류 — 이 부분은
A의 기존 rule-based 분류 로직을 재사용해도 됨, 완전히 새로 안 짜도 됨).

### 3단계 — `workflow.js` 한 줄 교체 (A 코드, 최소 diff)

```diff
- const normalized = await new GeminiNormalizationAgent().normalize(extracted);
+ const normalized = await fetch('http://localhost:5001/normalize', {
+   method: 'POST', headers: {'content-type': 'application/json'},
+   body: JSON.stringify({ intake_id: intakeId, body_text: extracted.body, ...extracted })
+ }).then(r => r.json());
```

나머지 워크플로우(VALIDATING, opportunity 생성/업데이트, 상태 전이)는 전혀 안 바뀐다 —
`normalized`가 어디서 오는지만 바뀔 뿐, 받는 쪽 코드는 그대로 재사용된다.

### 4단계 — C 쪽 확인 (코드 변경 거의 없음)

C의 `eligibility_agent.py`/`feasibility_agent.py`/`ranking_agent.py`는 Python 객체
(`NormalizationResult`, `EligibilityCondition`)를 함수 인자로 받는 구조라 **DB 테이블이
뭐든 상관없다.** Supervisor(A) 쪽에서 `opportunities.conditions`(jsonb)를 읽어
`NormalizationResult`로 역직렬화해서 C 함수에 넘기기만 하면 됨 — 이건 A/C가 Supervisor
만들 때 처리할 부분이라 지금 당장 코드 변경 불필요.

### 5단계 — 제 `saved_items`/`normalized_opportunities` 테이블 처리

프로덕션 경로에서는 더 이상 안 쓴다(A의 `intakes`/`opportunities`가 그 역할을 흡수).
다만 **로컬 파이프라인 검증(`scripts/run_pipeline.py`, `seed_supabase.py`)용으로는
그대로 남겨둔다** — 20건 회귀 테스트가 이 테이블에 의존하고 있고, A 서버 없이도
독립적으로 정규화 로직을 검증할 수 있어야 하므로 삭제하지 않는다.

### 6단계 — 루트 문서(ARCHITECTURE.md/Project.md/README.md) 병합

A 브랜치가 이 세 문서를 대량으로 고쳐놔서 `git merge`를 그대로 하면 충돌납니다.
**자동 병합하지 말고 수동으로**: main의 현재 버전(제가 계속 갱신해온 최신 상태)을
베이스로 두고, A 브랜치에만 있는 새 내용(확장 프로그램 사용법, KEEP:ON 서비스 설명,
`services/keep-web/` 폴더 안내)만 섹션으로 추가한다.

## 실행 순서 제안

1. (B) `src/bridge_server.py` 작성 + 로컬 단독 테스트 — A 브랜치 건드리지 않고 지금 바로 가능
2. (A와 협의) A가 `202608130004` 마이그레이션 적용 + `workflow.js` 한 줄 교체
3. (같이) A 브랜치를 main에 merge — `services/keep-web/` 폴더는 충돌 없음, 루트 문서 3개만 수동 병합
4. (같이) 브릿지 서버까지 연결해서 확장 프로그램 → Supabase `opportunities.conditions`까지 실제로 한 번에 도는지 end-to-end 테스트

1번은 지금 바로 시작할 수 있습니다 — 진행할까요?

# 2026_KNUxKU_summer_camp_team06

강원대x고려대 Summer Agentic AI 심화 몰입 캠프 6팀 레포지토리입니다.

저장은 했는데 실행은 안 하는 청년을 위해, 저장한 순간부터 마감까지 끌고 가는 AI 에이전트를 만듭니다.

## 시작하기 전에 읽을 문서

| 문서 | 내용 |
|---|---|
| [`Project.md`](./Project.md) | 서비스 정의, 사용자 흐름, 팀 역할 분담, 절대 규칙(R1~R7) — **가장 먼저 읽을 문서** |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 전체 데이터 흐름도, 역할↔모듈 매핑, 공용 스키마 계약, 배포 단계 |
| [`docs/plan_b.md`](./docs/plan_b.md) | B(데이터·링크 분석) 파트 실행 계획 및 진행 상황 |
| [`docs/personas.md`](./docs/personas.md) | 수집 데이터 기반 테스트 페르소나 5종 — C의 판정 로직 테스트에 바로 사용 가능 |

## 폴더 구조 및 담당자

```
src/
  models.py            # A 소유 — 공용 스키마 (아직 draft 단계, 각 모듈 상단 참고)
  supervisor.py         # A — 전체 오케스트레이션
  profile_agent.py       # A — 온보딩 → UserProfile
  extraction_agent.py    # B — 링크/텍스트/이미지 → SavedContext (구현 완료)
  normalization_agent.py # B — 공고 원문 → 8종 자격조건 구조화 (구현 완료)
  eligibility_agent.py   # C — 적격 판정
  feasibility_agent.py   # C — 실행 가능성 평가
  ranking_agent.py       # C — 우선순위 정렬
  planning_agent.py      # D — Quest/Todo + 마감 역산
  execution_chat.py      # D — 대화형 일정 조정
  quest_todo.py          # D — Quest/Todo 상태 관리
  calendar_agent.py      # D — 캘린더 연동
app/
  streamlit_app.py       # E — Frontend
data/
  opportunities.json         # B — 실제 공고 20건 (자격요건 원문 포함)
  normalization_results.json # B — 위 20건을 normalize()에 돌린 결과 (재생성 가능)
scripts/
  run_pipeline.py         # B — extraction+normalization 파이프라인 검증 스크립트
```

각 파일 상단에 `OWNER:` 주석으로 담당자를 표시했습니다. `src/models.py`는 아직 A가 정식
스키마로 통합하기 전이라, 지금은 `extraction_agent.py`/`normalization_agent.py` 안에 draft
스키마(`SavedContext`, `NormalizationResult` 등)가 임시로 정의되어 있습니다.

## B(데이터·링크 분석) 파트 — 현재 상태

- `extraction_agent.py`: 링크(requests+bs4, 실제 크롤링 동작) / 텍스트(동작) / 파일(PDF, pypdf 실제 동작 — HWP는 의도적으로 미지원, 스크린샷 유도) / 이미지(**Gemini Vision 실제 동작**)
- `normalization_agent.py`: 나이·기간은 정규식(순수 함수, R5) / 나머지 6종 조건은 **Gemini API 실제 동작**. 모든 조건은 원문에 실재하는 인용(`raw_quote`)인지 코드로 검증(`_verify_grounding`)하여 R2("근거 없이 생성 금지")를 강제함 — LLM이 뭘 반환하든 이 검증은 그대로 유지됨
- **LLM 제공자**: AWS 채택이 팀 차원에서 아직 불확실해서 우선 **Gemini API**로 실연동함 (`.env`의 `GEMINI_API_KEY`, 키 없으면 자동으로 mock 폴백). AWS로 확정되면 구현체만 교체하면 됨 — 자세한 내용은 `docs/plan_b.md` 참고
- **content_category 자동 분류**: 사용자는 지원사업만 저장하지 않는다(인스타 정보성 글, 행사 티켓 공지 등도 저장함) — 8종 조건 중 뭐가 뽑혔는지로 `opportunity`/`time_sensitive_info`/`general_info`를 자동 분류해서, 지원사업이 아닌 콘텐츠가 C의 적격 판정으로 잘못 넘어가지 않도록 함. 자세한 라우팅 규칙은 `ARCHITECTURE.md` 1-1절 참고
- Instagram/TikTok처럼 로그인 없인 본문을 못 주는 SPA는 감지해서 실패 처리 + 스크린샷 유도 (겉보기엔 200 OK라도 실제로는 로그인월인 경우까지 커버)
- 실제 공고 20건(지원사업6·공모전5·서포터즈5·부트캠프4)으로 검증 완료: **20/20 정규화 성공**, 8종 조건 전 타입 실제 등장 확인

**실행 방법**
```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # GEMINI_API_KEY= 뒤에 본인 키 붙여넣기 (Google AI Studio에서 발급)

python -m src.extraction_agent       # 추출 데모
python -m src.normalization_agent    # 정규화 데모
python -m scripts.run_pipeline       # 20건 전체 파이프라인 검증
```

`.env`에 `GEMINI_API_KEY`가 없으면 코드가 자동으로 mock으로 폴백하니, 키가 당장 없어도
실행은 됩니다(단, 실제 LLM 결과는 아님). 인터페이스가 provider 무관하게 설계되어 있어서
AWS로 최종 확정되면 구현체만 교체하면 됩니다. 자세한 내용은 `docs/plan_b.md` 참고.

## D(실행 에이전트) 파트 — 현재 상태

사용자가 어떤 기회를 "이거 할래"라고 확정한 순간부터 마감까지 실제로 행동·완료하도록 관리하는
**Execution Agent**. 두 가지 Tool로 동작이 눈에 보인다:

1. **Calendar Tool** — 공고를 Task로 분해하고 마감에서 역산해 날짜에 배치, **웹 캘린더에 등록**
2. **Notification/Inbox Tool** — "마감 3일 전에 알려줘" → **예약 알림**, 시간이 되면 인박스로 전달.
   진행이 정체되면 에이전트가 먼저 **개입 알림**을 보냄

- 구현: `src/execution/` 패키지 (모듈 9종 + Tool 2개 + State/DB + Scheduler + Memory).
  기존 D 스텁 파일(`planning_agent.py` 등)은 이 패키지로 연결되는 얇은 진입점.
- **로컬 모드 기본** — AWS/LLM 없이 항상 동작. `EXECUTION_LLM_PROVIDER=bedrock` + strands/boto3
  설치 시 시스템 프롬프트로 Bedrock(Claude)이 직접 도구를 호출(B 파트와 동일한 provider 스위치).
- 실제 공고 20건 전부 크래시 없이 실행 검증, 핵심 동작 pytest 9종 통과.

**실행 방법**
```bash
python -m src.execution.demo             # 콘솔 E2E 데모 (Step 0~4)
python -m src.execution.render --run     # 데모 + 캘린더/인박스 HTML 생성 (data/execution/execution_view.html)
streamlit run app/execution_demo_app.py  # 인터랙티브 데모 (발표용)
pytest tests/test_execution_agent.py     # 테스트
```

자세한 내용·발표 시나리오는 `docs/plan_d.md` 참고.

# D(실행 에이전트) 파트 — Execution Agent

> 담당: D 김나연 · 상태: **first draft (MVP 데모 동작)**
>
> "저장은 했는데 실행은 안 하는 청년"을 위해, 사용자가 어떤 기회를 **"이거 할래"라고
> 확정한 순간부터 마감까지** 실제로 행동하고 완료하도록 관리하는 실행 시스템.

---

## 1. 한 줄 요약

```
공고 + 사용자 + 판정결과  →  Goal  →  Task 분해  →  마감 역산 Plan  →  캘린더 등록
                                                  ↘  진행 추적 → 정체 감지 → 개입 → 재계획 → 완료
```

Execution Agent가 하는 일은 크게 **두 가지 Tool**로 눈에 보인다:

1. **Calendar Tool** — 분해한 Task를 마감에서 역산해 날짜에 배치하고 **웹 캘린더에 등록**한다.
2. **Notification/Inbox Tool** — "마감 3일 전에 알려줘" 같은 요청을 받아 **예약 알림**을 만들고,
   시간이 되면 인박스로 전달한다. 진행이 정체되면 에이전트가 먼저 **개입 알림**을 보낸다.

---

## 2. 구조 (사용자 설계 그대로 코드화)

```
src/execution/
  models.py     # Goal, Task, Plan, CalendarEvent, Notification, Intervention, ExecutionMemory, State
  store.py      # State/DB (로컬 JSON — 팀 컨벤션. 실제 배포 시 내부만 RDS/DynamoDB로 교체)
  tools.py      # ① CalendarTool  ② NotificationTool  (+ strands @tool 래퍼)
  modules.py    # GoalManager / TaskDecomposer / Planner / ProgressTracker /
                #   StallDetector / InterventionManager / Replanner / CompletionVerifier
                #   + parse_deadline() (마감 파서, 순수 함수 R5)
  prompts.py    # Bedrock 경로용 시스템 프롬프트 ("Calendar Tool은 시스템 프롬프트로 처리")
  agent.py      # ExecutionAgent 오케스트레이터 (local / bedrock 스위치)
  chat.py       # ExecutionChat (대화형 조정: 리마인드/완료/재계획/진행률)
  demo.py       # E2E 데모 (python -m src.execution.demo)
  render.py     # 캘린더+인박스 → 발표용 HTML 1장
```

| 사용자 설계 요소 | 구현 위치 |
|---|---|
| Modules (9종) | `modules.py` |
| Tools (Calendar, Notification) | `tools.py` |
| State (Goal/Task/Plan/Context) | `models.py` + `store.py` |
| Memory (Execution Memory) | `store.py`(memory 테이블) + `modules._remember()` |
| Scheduler | `tools.NotificationTool.run_due()` / `agent.run_scheduler()` |
| Database (7 테이블) | `store.py` (users/opportunities/goals/plans/tasks/calendar_events/notifications/interventions/memory) |

기존 D 소유 스텁 파일(`planning_agent.py`, `calendar_agent.py`, `execution_chat.py`,
`quest_todo.py`)은 이 패키지로 연결되는 **얇은 진입점**으로 남겨, ARCHITECTURE.md의
역할↔모듈 매핑과 A(supervisor)의 import 경로를 유지한다.

---

## 3. 입력 계약 (다른 파트와의 접점)

Execution Agent의 입력은 3개다 (사용자가 확정(confirm)한 순간 트리거):

- **Opportunity** — B(신민서)의 `data/opportunities.json` 1건과 동일 형태
- **UserProfile** — A(강옥일) 온보딩 결과 (실행에 필요한 최소 필드; R7 개인정보 최소화)
- **EligibilityDecision** — C(엄세연) 판정 결과 `{opportunity_id, user_id, eligible, reason}`

```python
from src.execution import ExecutionAgent, ExecutionContext
result = ExecutionAgent().start(ctx)   # ctx = ExecutionContext(user, opportunity, decision, now)
# result.goal / result.tasks / result.plan / result.events / result.reminders
```

---

## 4. 실행 방법

```bash
pip install -r requirements.txt          # pydantic, python-dateutil (핵심)

python -m src.execution.demo             # ① 콘솔 E2E 데모 (Step 0~4)
python -m src.execution.render --run     # ② 데모 실행 + 캘린더/인박스 HTML 생성
streamlit run app/execution_demo_app.py  # ③ 인터랙티브 데모 (발표용, streamlit 필요)
```

`render`가 만든 `data/execution/execution_view.html`을 브라우저로 열면 **웹 캘린더에
Task가 마감 역산으로 박히고 인박스에 알림이 도착한 화면**을 그대로 볼 수 있다.

---

## 5. 데모 시나리오 (발표용)

대상: **김해 청년 로컬굿즈 공모전** (마감 2026-08-28), 사용자 김서연, 기준일 2026-08-13.

| Step | 보여주는 것 | 관련 Tool/Module |
|---|---|---|
| 0 | 공고 + 사용자 + 판정결과 입력 | 입력 계약 |
| 1 | Goal 생성 → 6개 Task로 분해 → 마감 역산 → **캘린더 6건 등록** | TaskDecomposer, Planner, **Calendar Tool** |
| 2 | "마감 5일 전에 알려줘" → **리마인드 예약** / "1번 끝냈어" → 완료 처리 | **Notification Tool**, ProgressTracker |
| 3 | 시간을 마감 3일 전으로 진행 → **Scheduler가 예약 알림을 인박스로 전달** | Scheduler |
| 4 | 지연 Task 정체 감지 → **개입 알림** → "다시 계획해줘" → **재계획(Plan v2)** | StallDetector, InterventionManager, Replanner |

**핵심 메시지 2개 (발표에서 강조):**
1. Execution Agent는 목표를 **Task/Plan으로 나눠 실제로 캘린더에 박는다** (계획을 말로만 하지 않음).
2. 사용자가 실제로 **실행하도록 알림으로 돕는다** — 예약 리마인드 + 정체 시 먼저 개입.

---

## 6. LLM 제공자 (Gemini / Bedrock / local)

B 파트와 동일한 철학: **인터페이스(`src/execution/llm.py`) 고정 + provider는 환경변수로 스위치.**
3가지 모드가 있고 자동 감지된다:

| provider | 조건 | LLM이 하는 일 |
|---|---|---|
| **gemini** (기본) | `.env`에 `GEMINI_API_KEY` 있음 | 공고 원문을 읽고 **Task 분해**, 자유 대화 응답 생성 |
| **bedrock** | `EXECUTION_LLM_PROVIDER=bedrock` + strands/boto3 설치 | 시스템 프롬프트로 Bedrock(Claude)이 도구 직접 호출 |
| **local** | 위 조건 모두 아님 | LLM 없이 카테고리 템플릿으로 분해 (항상 동작) |

- **어떤 모드든 데모는 항상 돈다.** Gemini 호출이 실패하면(키 오류/네트워크) 자동으로
  템플릿으로 폴백한다. 분해 방식은 `goal.meta["task_source"]`(`gemini`/`template`)로 확인 가능.
- **마감 파싱·일정 배치·진행률은 항상 순수 함수(R5).** LLM은 "무엇을 할지(Task 내용)"만
  제안하고, "언제 할지(날짜)"는 코드가 계산 → LLM이 바뀌어도 일정의 정확성은 코드가 보장.

```bash
# Gemini 모드 (기본, 권장) — .env에 키만 넣으면 됨
#  GEMINI_API_KEY=<본인 키>   (Google AI Studio 발급)
python -m src.execution.demo    # provider가 gemini로 뜨고, Gemini가 Task를 분해

# Bedrock 모드 (AWS 확정 후)
pip install strands-agents boto3
export EXECUTION_LLM_PROVIDER=bedrock
export BEDROCK_MODEL_ID=us.anthropic.claude-3-5-sonnet-20241022-v2:0 AWS_REGION=us-west-2
```

---

## 7. Supabase(DB) 연동 지점

MVP는 로컬 JSON(`src/execution/store.py`)에 저장한다. **E(프론트)·A(Supervisor)와 상태를
공유하려면** 아래 테이블을 팀 Supabase에 두어야 한다 (안 하면 각자 메모리에만 존재해서
프론트에서 캘린더/인박스가 안 보임):

- `goals`, `plans`, `tasks` — 실행 목표/계획/할 일 (E가 Quest·Todo 화면에 표시)
- `calendar_events` — **웹 캘린더의 데이터 소스** (E의 정책 캘린더 화면이 직접 읽음)
- `notifications` — **인박스/알림의 데이터 소스** (E의 알림 UI가 직접 읽음)
- `interventions`, `execution_memory` — 개입/실행 로그 (선택; 추적·분석용)
- `users`, `opportunities` — A/B가 이미 채우면 참조만; 없으면 실행 시 스냅샷 저장

연동 방법 (교체 지점은 `ExecutionStore` 내부뿐, 호출부는 그대로):
1. `docs/supabase_schema.sql`을 Supabase SQL Editor에서 실행해 테이블 생성.
2. `.env`에 접속 정보 추가:
   ```
   SUPABASE_URL=https://<프로젝트>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service_role 키>
   ```
3. `pip install supabase` 후 `ExecutionStore`와 같은 인터페이스의 `SupabaseExecutionStore`를
   추가하고 `ExecutionAgent(store=SupabaseExecutionStore())`로 주입 → 나머지 코드 수정 불필요.

> 발표(내일) 기준으로는 로컬 JSON으로 충분하다. Supabase는 **E의 화면과 실제로 연결하는
> 단계**에서 필요하다. 팀 계정 접속정보(URL/KEY)를 받으면 `SupabaseExecutionStore`까지 붙일 수 있다.

## 8. MVP 범위 / 남은 것 (first draft 기준)

- ✅ Goal→Task→Plan→Calendar 등록, 예약 리마인드+Scheduler 전달, 정체 감지·개입·재계획, 완료 검증
- ✅ **Gemini API 실연동** (공고 원문 기반 Task 분해 + 자유 대화), 실패 시 자동 폴백
- ✅ 실제 공고 20건 전부 크래시 없이 실행, pytest 11종 통과
- ✅ Supabase 스키마(`docs/supabase_schema.sql`) 준비
- ⬜ `SupabaseExecutionStore` 구현 (팀 Supabase 접속정보 확정 후)
- ⬜ Bedrock 실연동 스모크 테스트, E의 Streamlit 앱에 실행 화면 통합

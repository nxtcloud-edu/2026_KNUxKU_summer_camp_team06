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

## 6. LLM 제공자 (AWS Bedrock / Strands)

B 파트와 동일한 철학: **인터페이스 고정 + provider는 환경변수로 스위치.**

- 기본은 `local` 모드 — modules.py의 결정론 코어가 Task 분해/마감 역산/알림을 처리한다.
  AWS/LLM 없이도 데모가 **항상** 돌아간다.
- `EXECUTION_LLM_PROVIDER=bedrock`이고 `strands-agents`+`boto3`가 설치되면 `bedrock` 모드로,
  `prompts.py`의 시스템 프롬프트를 받은 **Bedrock(Claude) 에이전트가 직접 도구를 호출**한다
  (`create_calendar_event`, `send_notification`, `schedule_reminder`). 실패 시 조용히 local로 폴백.
- 마감 파싱·일정 계산·진행률은 항상 순수 함수(R5) — LLM이 바뀌어도 이 계산은 그대로다.

```bash
# AWS 확정 후
pip install strands-agents boto3
export EXECUTION_LLM_PROVIDER=bedrock
export BEDROCK_MODEL_ID=us.anthropic.claude-3-5-sonnet-20241022-v2:0
export AWS_REGION=us-west-2
```

---

## 7. MVP 범위 / 남은 것 (first draft 기준)

- ✅ Goal→Task→Plan→Calendar 등록, 예약 리마인드+Scheduler 전달, 정체 감지·개입·재계획, 완료 검증
- ✅ 실제 공고 20건 전부 크래시 없이 실행 (카테고리·날짜형식 다양성 검증)
- ⬜ Bedrock 실연동 스모크 테스트 (AWS 계정/모델 접근 확정 후)
- ⬜ 슬래시 이외 예외 날짜 표기 추가 보강, 실제 웹 캘린더(Google Calendar) 연동
- ⬜ E의 메인 Streamlit 앱에 실행 화면 통합

-- Execution Agent (D 파트) — Supabase(Postgres) 스키마
-- OWNER: D (김나연)
--
-- 목적: MVP는 로컬 JSON(src/execution/store.py)에 저장하지만, E(프론트)·A(Supervisor)와
--       상태를 공유하려면 아래 테이블을 Supabase에 두고 ExecutionStore 내부만 교체하면 된다.
--       (ExecutionStore의 메서드 시그니처는 그대로 유지 → 호출부 코드 변경 없음)
--
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
-- 각 테이블은 src/execution/models.py의 pydantic 모델과 1:1 대응한다.

-- 사용자 (A 온보딩 결과 중 실행에 필요한 최소 필드; R7 개인정보 최소화)
create table if not exists users (
  user_id                    text primary key,
  name                       text not null default '사용자',
  region                     text,
  birth_date                 date,
  status                     text,
  interests                  jsonb not null default '[]',
  daily_capacity_hours       real not null default 2.0,
  default_reminder_lead_days int  not null default 3
);

-- 공고/기회 (B의 opportunities.json 스냅샷)
create table if not exists opportunities (
  id            text primary key,
  title         text not null,
  org           text,
  category      text not null,
  url           text,
  source        text,
  raw_text      text not null default '',
  deadline_text text,
  collected_at  text
);

-- 목표 (사용자가 실행하기로 확정한 기회)
create table if not exists goals (
  id              text primary key,
  user_id         text references users(user_id),
  opportunity_id  text,
  title           text not null,
  category        text not null,
  deadline        timestamptz,
  status          text not null default 'active'
                    check (status in ('active','at_risk','completed','abandoned')),
  current_plan_id text,
  created_at      timestamptz not null default now(),
  meta            jsonb not null default '{}'
);

-- 실행 계획 + 버전 (재계획하면 version 증가)
create table if not exists plans (
  id         text primary key,
  goal_id    text references goals(id) on delete cascade,
  version    int  not null default 1,
  task_ids   jsonb not null default '[]',
  rationale  text not null default '',
  created_at timestamptz not null default now()
);

-- 할 일 (Quest/Todo 단위)
create table if not exists tasks (
  id              text primary key,
  goal_id         text references goals(id) on delete cascade,
  title           text not null,
  description     text not null default '',
  status          text not null default 'todo'
                    check (status in ('todo','in_progress','done','overdue','blocked')),
  "order"         int  not null default 0,
  estimated_hours real not null default 1.0,
  due_at          timestamptz,
  depends_on      jsonb not null default '[]',
  tags            jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  done_at         timestamptz
);

-- 캘린더 이벤트 (Calendar Tool 산출물; 웹 캘린더의 백엔드)
create table if not exists calendar_events (
  id       text primary key,
  goal_id  text references goals(id) on delete cascade,
  task_id  text,
  title    text not null,
  "start"  timestamptz not null,
  "end"    timestamptz,
  all_day  boolean not null default true,
  location text,
  url      text,
  notes    text not null default '',
  source   text not null default 'execution_agent'
);

-- 알림/인박스 (Notification Tool 산출물; 예약 알림 + 개입 메시지)
create table if not exists notifications (
  id         text primary key,
  user_id    text references users(user_id),
  goal_id    text,
  task_id    text,
  type       text not null default 'info'
               check (type in ('reminder','intervention','info','celebration')),
  title      text not null,
  body       text not null default '',
  created_at timestamptz not null default now(),
  deliver_at timestamptz,          -- 이 시각이 되면 delivered=true 로 전달 (Scheduler)
  delivered  boolean not null default false,
  read       boolean not null default false
);

-- 개입 기록 (정체 감지 후 어떤 개입을 왜 했는지)
create table if not exists interventions (
  id         text primary key,
  goal_id    text references goals(id) on delete cascade,
  type       text not null check (type in ('reminder','nudge','replan','encourage')),
  reason     text not null,
  message    text not null,
  created_at timestamptz not null default now()
);

-- 실행 메모리 (과거 실행 과정+결과 로그)
create table if not exists execution_memory (
  id         text primary key,
  user_id    text references users(user_id),
  goal_id    text,
  event      text not null,
  detail     text not null default '',
  created_at timestamptz not null default now()
);

-- 조회 성능용 인덱스
create index if not exists idx_tasks_goal          on tasks(goal_id);
create index if not exists idx_events_goal         on calendar_events(goal_id);
create index if not exists idx_noti_user           on notifications(user_id);
create index if not exists idx_noti_pending        on notifications(delivered, deliver_at);
create index if not exists idx_memory_user         on execution_memory(user_id);

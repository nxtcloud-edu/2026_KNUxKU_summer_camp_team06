-- B(신민서) 담당: saved_items, normalized_opportunities
-- docs/db_schema.md 계획을 그대로 옮김. user_id는 아직 FK 제약을 안 걸었음
-- (A의 users 테이블이 아직 없음 — 생성되면 별도 마이그레이션으로 FK 추가 예정).

create extension if not exists pgcrypto;

-- 1) saved_items: extraction_agent.py의 SavedContext
create table if not exists saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,  -- TODO: A의 users 테이블 생성 후 references users(id) 추가
  source_type text not null check (source_type in ('link', 'file', 'image', 'text', 'extension')),
  source_value text not null,
  title text,
  raw_text text,
  status text not null check (status in ('ok', 'partial', 'failed')),
  error_reason text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_saved_items_user_id on saved_items (user_id);

-- 2) normalized_opportunities: normalization_agent.py의 NormalizationResult
create table if not exists normalized_opportunities (
  id uuid primary key default gen_random_uuid(),
  saved_item_id uuid not null references saved_items (id) on delete cascade,
  content_category text check (content_category in ('opportunity', 'time_sensitive_info', 'general_info')),
  conditions jsonb not null default '[]'::jsonb,  -- [{type, operator, value, raw_quote, span}]
  status text not null check (status in ('ok', 'partial', 'failed')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_normalized_opportunities_saved_item_id on normalized_opportunities (saved_item_id);
create index if not exists idx_normalized_opportunities_conditions_gin on normalized_opportunities using gin (conditions);
create index if not exists idx_normalized_opportunities_content_category on normalized_opportunities (content_category);

-- RLS 활성화: secret 키(서버 코드)는 RLS를 우회하므로 영향 없음.
-- policy를 하나도 안 만들면 anon/authenticated 키는 기본적으로 전부 접근 차단됨
-- (deny-by-default) — 나중에 프론트에서 직접 접근이 필요해지면 그때 policy 추가.
alter table saved_items enable row level security;
alter table normalized_opportunities enable row level security;

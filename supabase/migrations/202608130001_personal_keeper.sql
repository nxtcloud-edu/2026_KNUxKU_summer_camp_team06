-- KEEP:ON personal storage. Run in the Supabase SQL Editor or via a linked CLI.
-- The service-role secret is never stored in this repository.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null check (status in (
    'QUEUED', 'RECEIVED', 'EXTRACTING', 'NORMALIZING', 'VALIDATING',
    'READY_FOR_REVIEW', 'NEEDS_REVIEW', 'UNSUPPORTED', 'CANCELLED', 'FAILED'
  )),
  page_evidence jsonb not null,
  opportunity_id uuid,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  intake_id uuid references public.intakes(id) on delete set null,
  canonical_url text not null,
  source_url text not null,
  platform text not null check (platform in ('instagram', 'threads')),
  title text not null,
  summary text,
  body text,
  author text,
  published_at timestamptz,
  category text check (category in ('Competition', 'Support', 'Benefit')),
  deadline date,
  links jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric,
  normalization_method text check (normalization_method in ('gemini', 'rules')),
  status text not null check (status in ('READY_FOR_REVIEW', 'NEEDS_REVIEW', 'CONFIRMED', 'DELETED')),
  needs_review boolean not null default false,
  error_codes jsonb not null default '[]'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, canonical_url)
);

create index if not exists intakes_user_created_idx on public.intakes (user_id, created_at desc);
create index if not exists opportunities_user_created_idx on public.opportunities (user_id, created_at desc);
create index if not exists opportunities_user_deadline_idx on public.opportunities (user_id, deadline);

alter table public.profiles enable row level security;
alter table public.intakes enable row level security;
alter table public.opportunities enable row level security;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.intakes to authenticated;
grant select, insert, update, delete on public.opportunities to authenticated;

create policy "profiles: user manages own row"
  on public.profiles for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "intakes: user manages own rows"
  on public.intakes for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "opportunities: user manages own rows"
  on public.opportunities for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

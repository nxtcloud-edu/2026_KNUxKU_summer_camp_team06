-- KEEP:ON 운영 공고와 B 정규화 결과를 동일 UUID로 연결한다.
-- `source_opportunity_key`는 로컬 샘플의 opp-* 식별자 보존용이며 운영 FK가 아니다.

alter table public.normalized_opportunities
  alter column saved_item_id drop not null,
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 이전 초안에서 `opportunity_id text`를 이미 실행한 DB도 안전하게 전환한다.
-- 그 값은 로컬 fixture용 `opp-*` 키이므로 별도 컬럼으로 보존한다.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'normalized_opportunities'
      and column_name = 'opportunity_id'
      and data_type = 'text'
  ) then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'normalized_opportunities'
        and column_name = 'source_opportunity_key'
    ) then
      alter table public.normalized_opportunities
        rename column opportunity_id to source_opportunity_key;
    else
      update public.normalized_opportunities
      set source_opportunity_key = coalesce(source_opportunity_key, opportunity_id);

      alter table public.normalized_opportunities
        drop column opportunity_id;
    end if;
  end if;
end $$;

alter table public.normalized_opportunities
  add column if not exists source_opportunity_key text,
  add column if not exists opportunity_id uuid references public.opportunities(id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'normalized_opportunities_user_opportunity_key'
      and conrelid = 'public.normalized_opportunities'::regclass
  ) then
    alter table public.normalized_opportunities
      add constraint normalized_opportunities_user_opportunity_key unique (user_id, opportunity_id);
  end if;
end $$;

create index if not exists normalized_opportunities_user_created_idx
  on public.normalized_opportunities (user_id, created_at desc);

grant select, insert, update, delete on public.normalized_opportunities to authenticated;

drop policy if exists "normalized opportunities: user manages own rows" on public.normalized_opportunities;
create policy "normalized opportunities: user manages own rows"
  on public.normalized_opportunities for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

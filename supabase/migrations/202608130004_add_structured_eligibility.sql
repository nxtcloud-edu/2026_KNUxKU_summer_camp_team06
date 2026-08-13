-- B(신민서) 담당. 실행 순서: 202608130001~003 다음에 적용.
-- A의 public.opportunities에 B의 8종 자격조건 구조화 결과를 담을 컬럼을 추가한다.
-- 기존 카드 필드(title/summary/category/deadline)는 그대로 두고 UI용으로 계속 쓴다.
-- category(Competition/Support/Benefit, A)와 content_category(opportunity/
-- time_sensitive_info/general_info, B)는 서로 다른 축이라 이름을 다르게 유지한다.
-- 자세한 이유는 docs/merge_plan_a_b.md 참고.

alter table public.opportunities
  add column if not exists content_category text
    check (content_category in ('opportunity', 'time_sensitive_info', 'general_info')),
  add column if not exists conditions jsonb not null default '[]'::jsonb;
  -- conditions: [{type, operator, value, raw_quote, span}] — normalization_agent.py의
  -- NormalizationResult.conditions를 그대로 직렬화한 것. raw_quote는 이미
  -- _verify_grounding()으로 원문 내 존재가 검증된 상태로 들어온다 (R2).

create index if not exists opportunities_content_category_idx
  on public.opportunities (content_category);
create index if not exists opportunities_conditions_gin
  on public.opportunities using gin (conditions);

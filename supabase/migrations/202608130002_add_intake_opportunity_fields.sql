-- Apply this after 202608130001_personal_keeper.sql.
-- Required by the Node workflow after an Opportunity has been created.

alter table public.intakes
  add column if not exists opportunity_id uuid references public.opportunities(id) on delete set null;

alter table public.opportunities
  add column if not exists deleted_at timestamptz;

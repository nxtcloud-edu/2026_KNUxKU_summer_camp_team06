-- Full date of birth is required for exact age eligibility checks.
alter table public.profiles
  add column if not exists birth_date date;

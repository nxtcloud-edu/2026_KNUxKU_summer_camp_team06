-- Direct image/PDF/text intake and source thumbnails for KEEP:ON cards.

alter table public.opportunities
  add column if not exists thumbnail_url text;

alter table public.opportunities
  add column if not exists thumbnail_kind text;

alter table public.opportunities
  drop constraint if exists opportunities_thumbnail_kind_check;

alter table public.opportunities
  add constraint opportunities_thumbnail_kind_check
  check (thumbnail_kind is null or thumbnail_kind in ('image', 'pdf'));

alter table public.opportunities
  drop constraint if exists opportunities_platform_check;

alter table public.opportunities
  add constraint opportunities_platform_check
  check (platform in ('instagram', 'threads', 'direct'));

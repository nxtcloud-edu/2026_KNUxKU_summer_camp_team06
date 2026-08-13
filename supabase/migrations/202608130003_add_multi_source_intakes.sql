-- KEEP:ON accepts one primary source per intake:
-- extension page evidence, pasted link, pasted text, PDF, or image.
-- Run after 202608130001 and 202608130002.

alter table public.intakes
  alter column page_evidence drop not null,
  add column if not exists source_type text not null default 'extension',
  add column if not exists source_url text,
  add column if not exists source_text text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb,
  add column if not exists extraction_status text,
  add column if not exists extracted_title text,
  add column if not exists extracted_text text,
  add column if not exists extraction_evidence jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'intakes_source_type_check'
  ) then
    alter table public.intakes add constraint intakes_source_type_check
      check (source_type in ('extension', 'link', 'text', 'pdf', 'image'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'intakes_extraction_status_check'
  ) then
    alter table public.intakes add constraint intakes_extraction_status_check
      check (extraction_status is null or extraction_status in ('PENDING', 'EXTRACTING', 'OK', 'PARTIAL', 'FAILED'));
  end if;
end $$;

create table if not exists public.intake_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  intake_id uuid not null references public.intakes(id) on delete cascade,
  file_kind text not null check (file_kind in ('pdf', 'image')),
  bucket_id text not null default 'keeper-uploads',
  object_path text not null,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 15728640),
  sha256 text,
  status text not null default 'UPLOADED'
    check (status in ('UPLOADED', 'EXTRACTING', 'EXTRACTED', 'FAILED')),
  extracted_text text,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);

create index if not exists intake_files_intake_idx on public.intake_files (intake_id);
create index if not exists intake_files_user_created_idx on public.intake_files (user_id, created_at desc);

alter table public.intake_files enable row level security;
grant select, insert, update, delete on public.intake_files to authenticated;

create policy "intake files: user manages own rows"
  on public.intake_files for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.opportunities
  add column if not exists content_category text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'opportunities_content_category_check'
  ) then
    alter table public.opportunities add constraint opportunities_content_category_check
      check (content_category is null or content_category in (
        'opportunity', 'time_sensitive_info', 'general_info'
      ));
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'keeper-uploads',
  'keeper-uploads',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "keeper uploads: user reads own objects" on storage.objects;
create policy "keeper uploads: user reads own objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'keeper-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "keeper uploads: user creates own objects" on storage.objects;
create policy "keeper uploads: user creates own objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'keeper-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "keeper uploads: user updates own objects" on storage.objects;
create policy "keeper uploads: user updates own objects"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'keeper-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'keeper-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "keeper uploads: user deletes own objects" on storage.objects;
create policy "keeper uploads: user deletes own objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'keeper-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

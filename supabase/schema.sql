-- SideQuest ATX — Supabase bootstrap (idempotent; safe to re-run).
--
-- SideQuest lives INSIDE a shared Supabase project (the free plan caps active
-- projects), so every object is namespaced `sq_` and nothing here touches any
-- other app's tables. Moving to a dedicated project later = run this file
-- there, copy the sq_* rows and the sidequest-photos bucket.
--
-- Run in the Supabase SQL editor. Clients talk through:
--   web    src/data/remote.ts   (SupabaseStore behind the ReportStore interface)
--   mobile mobile/src/data/sync.ts (local-first ledger pushed after capture)

-- ---------------------------------------------------------------- reports ---

create table if not exists public.sq_reports (
  id uuid primary key default gen_random_uuid(),
  -- The id the capturing device minted; makes retried uploads idempotent.
  client_id text unique,
  -- Human ref SQ-0042, assigned by the trigger below (phones show SQ-P0042
  -- until the row lands here and the server ref is echoed back).
  ref text unique,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  reporter text not null default '',
  type text not null check (type in ('crack','lifted','vegetation','missing-ramp','missing-sidewalk','debris','other')),
  severity text not null check (severity in ('low','moderate','severe')),
  status text not null default 'open' check (status in ('open','submitted-311','scheduled','resolved')),
  source text not null default 'walk' check (source in ('walk','drive','glasses')),
  lng double precision not null,
  lat double precision not null,
  -- Capture provenance (mobile CaptureFix)
  accuracy_m real,
  heading_deg real,
  fix_method text,
  taken_at timestamptz,
  place text not null default '',
  neighborhood text not null default '',
  description text not null default '',
  -- Object paths inside the sidequest-photos bucket (public read).
  photo_path text,
  thumb_path text,
  after_photo_path text,
  ai_label text,
  ai_severity text,
  ai_confidence real,
  ai_model text,
  -- Capture-session ids as minted on the device; sessions themselves stay
  -- device-local, so plain text and no FK.
  drive_id text,
  walk_id text,
  ticket_311 text,
  resolved_at timestamptz,
  resolved_by text,
  verified boolean not null default false,
  duplicate_of uuid references public.sq_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The rule both clients enforce, enforced again at the database:
  constraint sq_resolved_needs_after_photo check (status <> 'resolved' or after_photo_path is not null)
);

create index if not exists sq_reports_status_idx on public.sq_reports(status);
create index if not exists sq_reports_geo_idx on public.sq_reports(lat, lng);
create index if not exists sq_reports_user_idx on public.sq_reports(user_id);

-- Human ref counter
create sequence if not exists public.sq_report_ref_seq;
create or replace function public.sq_assign_ref() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ref is null or new.ref = '' then
    new.ref := 'SQ-' || lpad(nextval('public.sq_report_ref_seq')::text, 4, '0');
  end if;
  return new;
end $$;
drop trigger if exists sq_reports_assign_ref on public.sq_reports;
create trigger sq_reports_assign_ref before insert on public.sq_reports for each row execute function public.sq_assign_ref();

create or replace function public.sq_touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists sq_reports_touch on public.sq_reports;
create trigger sq_reports_touch before update on public.sq_reports for each row execute function public.sq_touch_updated_at();

-- ----------------------------------------------------------------- drives ---

create table if not exists public.sq_drives (
  id uuid primary key default gen_random_uuid(),
  client_id text unique,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  captain text not null default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  trail jsonb not null default '[]'::jsonb,        -- [[lng,lat], ...]
  frames integer not null default 0,
  reports integer not null default 0,
  miles real not null default 0
);

-- ----------------------------------------------------------------- config ---

-- Public runtime configuration (the Mapbox *public* token lives here so the
-- unsigned CI build needs no secrets and a token rotation needs no rebuild).
-- Optional AI knobs read by the sq-classify edge function:
--   ai_model              (default claude-haiku-4-5)
--   ai_monthly_budget_usd (default 90 — hard stop under the $100/mo ceiling)
--   ai_user_daily_calls   (default 500)
create table if not exists public.sq_config (
  key text primary key,
  value text not null
);

-- ------------------------------------------------------------ ai spending ---

-- The sq-classify edge function meters every Claude call here and refuses
-- once the month's budget is spent. Service-role only (RLS on, no policies).
create table if not exists public.sq_ai_usage (
  key text primary key,               -- 'm:2026-09' or 'u:<uid>:2026-09-02'
  calls integer not null default 0,
  cost_microusd bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.sq_ai_usage enable row level security;

create or replace function public.sq_ai_bump(p_key text, p_cost_microusd bigint)
returns table (calls integer, cost_microusd bigint)
language plpgsql security definer set search_path = public as $$
begin
  return query
  insert into public.sq_ai_usage as u (key, calls, cost_microusd)
    values (p_key, 1, p_cost_microusd)
    on conflict (key) do update
      set calls = u.calls + 1,
          cost_microusd = u.cost_microusd + excluded.cost_microusd,
          updated_at = now()
    returning u.calls, u.cost_microusd;
end $$;
revoke all on function public.sq_ai_bump(text, bigint) from public, anon, authenticated;

-- ------------------------------------------------------------------ roles ---

-- Moderator = JWT app_metadata.sq_role (namespaced so it can never collide
-- with anything else living in this shared project).
create or replace function public.sq_is_moderator() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'sq_role', '') = 'moderator'
$$;

-- James runs moderation; grant on signup so no dashboard step is needed.
-- The +sidequest alias exists because the bare Gmail may already be a
-- Google-identity user of this shared project (no password): signing up
-- in-app with the alias mints a fresh password account, same inbox.
create or replace function public.sq_grant_moderator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email in ('jamesjli2025@gmail.com', 'jamesjli2025+sidequest@gmail.com') then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || '{"sq_role":"moderator"}'::jsonb;
  end if;
  return new;
end $$;

-- Guarded like the storage section: if auth.users is off-limits to this role,
-- the rest of the file still commits and the NOTICE says what to do instead.
do $$
begin
  execute 'drop trigger if exists sq_grant_moderator on auth.users';
  execute 'create trigger sq_grant_moderator before insert on auth.users for each row execute function public.sq_grant_moderator()';
  -- ...and retroactively, in case the account already exists in this project.
  update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"sq_role":"moderator"}'::jsonb
    where email in ('jamesjli2025@gmail.com', 'jamesjli2025+sidequest@gmail.com');
exception when insufficient_privilege then
  raise notice 'moderator auto-grant needs the dashboard: after signing up, set app_metadata {"sq_role":"moderator"} on your user in Authentication -> Users';
end $$;

-- -------------------------------------------------------------------- RLS ---

alter table public.sq_reports enable row level security;
alter table public.sq_drives enable row level security;
alter table public.sq_config enable row level security;

-- Anyone can read the public map (site and app map tab use the anon key).
drop policy if exists "sq reports are publicly readable" on public.sq_reports;
create policy "sq reports are publicly readable" on public.sq_reports for select using (true);
drop policy if exists "sq drives are publicly readable" on public.sq_drives;
create policy "sq drives are publicly readable" on public.sq_drives for select using (true);
drop policy if exists "sq config is publicly readable" on public.sq_config;
create policy "sq config is publicly readable" on public.sq_config for select using (true);

-- Signed-in reporters submit their own rows.
drop policy if exists "sq reporters insert own reports" on public.sq_reports;
create policy "sq reporters insert own reports" on public.sq_reports
  for insert with check (auth.uid() is not null and user_id = auth.uid());
drop policy if exists "sq captains insert own drives" on public.sq_drives;
create policy "sq captains insert own drives" on public.sq_drives
  for insert with check (auth.uid() is not null and user_id = auth.uid());

-- Owners fix up their own records; moderators run the lifecycle.
drop policy if exists "sq owners and moderators update reports" on public.sq_reports;
create policy "sq owners and moderators update reports" on public.sq_reports
  for update using (user_id = auth.uid() or public.sq_is_moderator())
  with check (user_id = auth.uid() or public.sq_is_moderator());
drop policy if exists "sq owners and moderators delete reports" on public.sq_reports;
create policy "sq owners and moderators delete reports" on public.sq_reports
  for delete using (user_id = auth.uid() or public.sq_is_moderator());

-- ---------------------------------------------------------------- storage ---

-- Public-read bucket; uploads land under <auth.uid()>/<file>. 8 MB cap keeps
-- a runaway client from filling the shared project's free storage.
--
-- Guarded: on some hosted projects the SQL-editor role may not own
-- storage.objects, and the editor runs this whole file as one transaction —
-- an unguarded failure here would roll back all of the above. If you see the
-- NOTICE below, create the bucket + these four policies in Storage → Policies
-- instead (public read; insert/update where the first folder = auth.uid();
-- delete for owner or sq_is_moderator()).
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('sidequest-photos', 'sidequest-photos', true, 8388608, array['image/jpeg'])
    on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg'];

  execute 'drop policy if exists "sq photos are publicly readable" on storage.objects';
  execute $p$create policy "sq photos are publicly readable" on storage.objects
    for select using (bucket_id = 'sidequest-photos')$p$;
  execute 'drop policy if exists "sq reporters upload own photos" on storage.objects';
  execute $p$create policy "sq reporters upload own photos" on storage.objects
    for insert with check (bucket_id = 'sidequest-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute 'drop policy if exists "sq reporters replace own photos" on storage.objects';
  execute $p$create policy "sq reporters replace own photos" on storage.objects
    for update using (bucket_id = 'sidequest-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'sidequest-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute 'drop policy if exists "sq owners and moderators delete photos" on storage.objects';
  execute $p$create policy "sq owners and moderators delete photos" on storage.objects
    for delete using (bucket_id = 'sidequest-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.sq_is_moderator()))$p$;
exception when insufficient_privilege then
  raise notice 'storage bucket/policies need the dashboard: Storage -> New bucket "sidequest-photos" (public) + policies per the comment in schema.sql';
end $$;

-- --------------------------------------------------------------- realtime ---

-- The website map updates live as photos land. (Optional: the site also
-- refetches on tab focus, so losing this only costs instant updates.)
do $$
begin
  alter publication supabase_realtime add table public.sq_reports;
exception
  when duplicate_object then null;
  when insufficient_privilege then
    raise notice 'realtime skipped: enable it for sq_reports under Database -> Publications';
end $$;

-- ------------------------------------------------------- one manual value ---

-- The app's Map tab reads the Mapbox *public* token (pk.…) from here, so the
-- unsigned CI build carries no secrets and a rotation needs no rebuild.
-- Uncomment and paste the token from account.mapbox.com before running:
-- insert into public.sq_config (key, value) values ('mapbox_public_token', 'pk.PASTE-YOURS-HERE')
--   on conflict (key) do update set value = excluded.value;

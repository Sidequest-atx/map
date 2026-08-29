-- SideQuest ATX — Supabase schema for shared public reports.
-- Mirrors src/types.ts (HazardReport, DriveSession). Run in the Supabase SQL
-- editor, then implement a SupabaseStore behind the ReportStore interface in
-- src/data/store.ts. UI code does not change.

create table if not exists public.drives (
  id uuid primary key default gen_random_uuid(),
  captain text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  trail jsonb not null default '[]'::jsonb,        -- [[lng,lat], ...]
  frames integer not null default 0,
  reports integer not null default 0,
  miles real not null default 0
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  ref text unique not null,                         -- SQ-0001, assigned by trigger below
  type text not null check (type in ('crack','lifted','vegetation','missing-ramp','missing-sidewalk','debris','other')),
  severity text not null check (severity in ('low','moderate','severe')),
  status text not null default 'open' check (status in ('open','submitted-311','scheduled','resolved')),
  source text not null default 'walk' check (source in ('walk','drive','glasses')),
  lng double precision not null,
  lat double precision not null,
  place text not null,
  neighborhood text not null default '',
  description text not null default '',
  photo_url text,
  ai_label text,
  ai_severity text,
  ai_confidence real,
  ai_model text,
  reporter text,
  drive_id uuid references public.drives(id),
  ticket_311 text,
  after_photo_url text,
  resolved_at timestamptz,
  resolved_by text,
  verified boolean not null default false,
  duplicate_of uuid references public.reports(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The rule the store enforces locally, enforced again at the database:
  constraint resolved_needs_after_photo check (status <> 'resolved' or after_photo_url is not null)
);

create index if not exists reports_status_idx on public.reports(status);
create index if not exists reports_geo_idx on public.reports(lat, lng);

-- Human ref counter
create sequence if not exists public.report_ref_seq;
create or replace function public.assign_ref() returns trigger language plpgsql as $$
begin
  if new.ref is null or new.ref = '' then
    new.ref := 'SQ-' || lpad(nextval('public.report_ref_seq')::text, 4, '0');
  end if;
  return new;
end $$;
drop trigger if exists reports_assign_ref on public.reports;
create trigger reports_assign_ref before insert on public.reports for each row execute function public.assign_ref();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists reports_touch on public.reports;
create trigger reports_touch before update on public.reports for each row execute function public.touch_updated_at();

alter table public.reports enable row level security;
alter table public.drives enable row level security;

-- Anyone can read the public map.
create policy "reports are publicly readable" on public.reports for select using (true);
create policy "drives are publicly readable" on public.drives for select using (true);

-- Signed-in reporters submit; rate-limit at the edge.
create policy "reporters insert reports" on public.reports for insert with check (auth.role() = 'authenticated');
create policy "captains insert drives" on public.drives for insert with check (auth.role() = 'authenticated');

-- Only moderators (JWT claim role = 'moderator') change status / verify / merge.
create policy "moderators update reports" on public.reports for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator');

-- Photos: public bucket `hazard-photos`, authenticated upload, public read.
-- insert into storage.buckets (id, name, public) values ('hazard-photos','hazard-photos', true);

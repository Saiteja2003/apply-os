-- ApplyOS migration 007. Safe to run more than once.
-- Overhauls calendar_events: optional application link, ends_at timestamp,
-- and extended event types ('INTERVIEW', 'SCREENING', 'FOLLOW_UP', 'DEADLINE', 'OFFER_EXPIRY', 'NOTE').

-- Ensure table exists (if not created by migration 002 yet)
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  application_id uuid references public.applications (id) on delete cascade,
  event_type text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_events_type_valid
    check (event_type in ('INTERVIEW', 'SCREENING', 'FOLLOW_UP', 'DEADLINE', 'OFFER_EXPIRY', 'NOTE')),
  constraint calendar_events_title_not_blank
    check (length(btrim(title)) > 0)
);

-- If table already existed from migration 002, alter columns and constraints
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'calendar_events'
  ) then
    alter table public.calendar_events
      alter column application_id drop not null;

    alter table public.calendar_events
      add column if not exists ends_at timestamptz;

    alter table public.calendar_events
      drop constraint if exists calendar_events_type_valid;

    alter table public.calendar_events
      add constraint calendar_events_type_valid
      check (event_type in ('INTERVIEW', 'SCREENING', 'FOLLOW_UP', 'DEADLINE', 'OFFER_EXPIRY', 'NOTE'));
  end if;
end $$;

create index if not exists calendar_events_user_starts_idx
  on public.calendar_events (user_id, starts_at);

create index if not exists calendar_events_application_idx
  on public.calendar_events (application_id);

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

alter table public.calendar_events enable row level security;

drop policy if exists "calendar_events: read own" on public.calendar_events;
create policy "calendar_events: read own"
  on public.calendar_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "calendar_events: insert own" on public.calendar_events;
create policy "calendar_events: insert own"
  on public.calendar_events for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      application_id is null
      or exists (
        select 1 from public.applications a
        where a.id = application_id and a.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "calendar_events: update own" on public.calendar_events;
create policy "calendar_events: update own"
  on public.calendar_events for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      application_id is null
      or exists (
        select 1 from public.applications a
        where a.id = application_id and a.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "calendar_events: delete own" on public.calendar_events;
create policy "calendar_events: delete own"
  on public.calendar_events for delete
  to authenticated
  using ((select auth.uid()) = user_id);

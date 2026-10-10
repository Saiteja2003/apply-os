-- ApplyOS migration 002. Safe to run more than once.
-- Paste into the Supabase SQL editor and run.
--
--   1. Owner-only RLS policies on user_api_keys, so a signed-in session can
--      manage its own encrypted keys when no service-role key is configured.
--   2. calendar_events: interviews, screening calls and notes on the calendar.

-- ---------------------------------------------------------------------------
-- 1. user_api_keys: owner-only policies
-- ---------------------------------------------------------------------------

alter table public.user_api_keys enable row level security;

drop policy if exists "Users can select their own api keys" on public.user_api_keys;
create policy "Users can select their own api keys"
  on public.user_api_keys for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own api keys" on public.user_api_keys;
create policy "Users can insert their own api keys"
  on public.user_api_keys for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own api keys" on public.user_api_keys;
create policy "Users can update their own api keys"
  on public.user_api_keys for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own api keys" on public.user_api_keys;
create policy "Users can delete their own api keys"
  on public.user_api_keys for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. calendar_events
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  event_type text not null,
  title text not null,
  starts_at timestamptz not null,
  -- True when no time of day was given; starts_at is then local midnight.
  all_day boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_events_type_valid
    check (event_type in ('SCREENING', 'INTERVIEW', 'NOTE')),
  constraint calendar_events_title_not_blank
    check (length(btrim(title)) > 0)
);

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

-- An event may only be linked to an application the same user owns.
drop policy if exists "calendar_events: insert own" on public.calendar_events;
create policy "calendar_events: insert own"
  on public.calendar_events for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.applications a
      where a.id = application_id and a.user_id = (select auth.uid())
    )
  );

drop policy if exists "calendar_events: update own" on public.calendar_events;
create policy "calendar_events: update own"
  on public.calendar_events for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.applications a
      where a.id = application_id and a.user_id = (select auth.uid())
    )
  );

drop policy if exists "calendar_events: delete own" on public.calendar_events;
create policy "calendar_events: delete own"
  on public.calendar_events for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ApplyOS migration 006: Candidate Calibration & Strict Permission Protocol
-- Safe to run repeatedly.

-- ---------------------------------------------------------------------------
-- 1. candidate_preferences
-- ---------------------------------------------------------------------------

create table if not exists public.candidate_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  target_roles text[] not null default '{}',
  seniority_levels text[] not null default '{}',
  locations text[] not null default '{}',
  remote_only boolean not null default true,
  min_salary_floor integer default 0,
  work_authorization text not null default 'CITIZEN'
    check (work_authorization in ('CITIZEN', 'PERMANENT_RESIDENT', 'REQUIRES_SPONSORSHIP', 'OTHER')),
  company_blocklist text[] not null default '{}',
  standard_answers jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists candidate_preferences_set_updated_at on public.candidate_preferences;
create trigger candidate_preferences_set_updated_at
  before update on public.candidate_preferences
  for each row execute function public.set_updated_at();

alter table public.candidate_preferences enable row level security;

drop policy if exists "candidate_preferences: read own" on public.candidate_preferences;
create policy "candidate_preferences: read own"
  on public.candidate_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "candidate_preferences: insert own" on public.candidate_preferences;
create policy "candidate_preferences: insert own"
  on public.candidate_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "candidate_preferences: update own" on public.candidate_preferences;
create policy "candidate_preferences: update own"
  on public.candidate_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "candidate_preferences: delete own" on public.candidate_preferences;
create policy "candidate_preferences: delete own"
  on public.candidate_preferences for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. auto_apply_consent
-- ---------------------------------------------------------------------------

create table if not exists public.auto_apply_consent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  permission_tier text not null
    check (permission_tier in ('NOTIFY', 'STAGE_AND_CONFIRM', 'AUTONOMOUS')),
  consent_text text not null,
  signed_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists auto_apply_consent_user_signed_idx
  on public.auto_apply_consent (user_id, signed_at desc);

alter table public.auto_apply_consent enable row level security;

drop policy if exists "auto_apply_consent: read own" on public.auto_apply_consent;
create policy "auto_apply_consent: read own"
  on public.auto_apply_consent for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "auto_apply_consent: insert own" on public.auto_apply_consent;
create policy "auto_apply_consent: insert own"
  on public.auto_apply_consent for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "auto_apply_consent: update own" on public.auto_apply_consent;
create policy "auto_apply_consent: update own"
  on public.auto_apply_consent for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. auto_apply_audit_log
-- ---------------------------------------------------------------------------

create table if not exists public.auto_apply_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_name text not null,
  job_url text not null,
  match_score integer not null,
  dispatched_via text not null
    check (dispatched_via in ('REST_API', 'BROWSER_ASSIST', 'MANUAL')),
  status text not null
    check (status in ('SUCCESS', 'HALTED_UNKNOWN_QUESTION', 'FAILED')),
  halt_reason text,
  created_at timestamptz not null default now()
);

create index if not exists auto_apply_audit_log_user_created_idx
  on public.auto_apply_audit_log (user_id, created_at desc);

alter table public.auto_apply_audit_log enable row level security;

drop policy if exists "auto_apply_audit_log: read own" on public.auto_apply_audit_log;
create policy "auto_apply_audit_log: read own"
  on public.auto_apply_audit_log for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "auto_apply_audit_log: insert own" on public.auto_apply_audit_log;
create policy "auto_apply_audit_log: insert own"
  on public.auto_apply_audit_log for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

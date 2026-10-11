-- ApplyOS Idempotent Migration & Schema Update (Postgres 15+)
-- Safe to run repeatedly without 42P07 or trigger collision errors.

-- ---------------------------------------------------------------------------
-- 1. Shared Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  default_model_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- 3. master_resumes
-- ---------------------------------------------------------------------------

create table if not exists public.master_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  version integer not null,
  parent_id uuid references public.master_resumes (id),
  resume jsonb not null,
  created_at timestamptz not null default now(),

  constraint master_resumes_user_version_key unique (user_id, version),
  constraint master_resumes_version_positive check (version > 0),
  constraint master_resumes_resume_is_object check (jsonb_typeof(resume) = 'object')
);

create or replace function public.master_resumes_assign_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  latest_id uuid;
  latest_version integer;
begin
  select id, version into latest_id, latest_version
  from public.master_resumes
  where user_id = new.user_id
  order by version desc
  limit 1;

  new.version := coalesce(latest_version, 0) + 1;
  new.parent_id := latest_id;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists master_resumes_assign_version on public.master_resumes;
create trigger master_resumes_assign_version
  before insert on public.master_resumes
  for each row execute function public.master_resumes_assign_version();

create or replace function public.master_resumes_block_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'master_resumes is append-only: insert a new version instead'
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists master_resumes_block_update on public.master_resumes;
create trigger master_resumes_block_update
  before update on public.master_resumes
  for each row execute function public.master_resumes_block_update();

alter table public.master_resumes enable row level security;

drop policy if exists "master_resumes: read own" on public.master_resumes;
create policy "master_resumes: read own"
  on public.master_resumes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "master_resumes: insert own" on public.master_resumes;
create policy "master_resumes: insert own"
  on public.master_resumes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 4. applications
-- ---------------------------------------------------------------------------

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  company_name text not null,
  role_title text not null,
  location text,
  job_board_source text,
  job_url text,
  job_description text not null,

  status text not null default 'SAVED',
  applied_at timestamptz,

  match_score integer,
  ats_keywords jsonb not null default '{"matched": [], "missing": []}'::jsonb,

  patch_document jsonb,
  tailored_by_model text,
  interview_prep jsonb,
  -- { "content": string, "tailored_hook": string, "call_to_action": string }
  cover_letter jsonb,
  -- { "subject": string, "inmail_body": string, "short_hook": string }
  recruiter_outreach jsonb,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint applications_status_valid
    check (status in ('SAVED', 'APPLIED', 'INTERVIEWING', 'REJECTED', 'OFFER')),
  constraint applications_match_score_range
    check (match_score is null or match_score between 0 and 100),
  constraint applications_ats_keywords_is_object
    check (jsonb_typeof(ats_keywords) = 'object'),
  constraint applications_patch_document_is_object
    check (patch_document is null or jsonb_typeof(patch_document) = 'object'),
  constraint applications_interview_prep_is_object
    check (interview_prep is null or jsonb_typeof(interview_prep) = 'object'),
  constraint applications_patch_has_model
    check (patch_document is null or tailored_by_model is not null)
);

create index if not exists applications_user_status_idx
  on public.applications (user_id, status);

create index if not exists applications_user_created_idx
  on public.applications (user_id, created_at desc);

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

alter table public.applications enable row level security;

drop policy if exists "applications: read own" on public.applications;
create policy "applications: read own"
  on public.applications for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "applications: insert own" on public.applications;
create policy "applications: insert own"
  on public.applications for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "applications: update own" on public.applications;
create policy "applications: update own"
  on public.applications for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "applications: delete own" on public.applications;
create policy "applications: delete own"
  on public.applications for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 5. user_api_keys (Resolves the BYOK RLS Error)
-- ---------------------------------------------------------------------------

create table if not exists public.user_api_keys (
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  encrypted_key text not null,
  key_hint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, provider),
  constraint user_api_keys_provider_valid
    check (provider in ('anthropic', 'openai', 'google'))
);

drop trigger if exists user_api_keys_set_updated_at on public.user_api_keys;
create trigger user_api_keys_set_updated_at
  before update on public.user_api_keys
  for each row execute function public.set_updated_at();

alter table public.user_api_keys enable row level security;

-- Policies enabling authenticated users to write their encrypted credentials
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
-- 6. calendar_events
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  event_type text not null,
  title text not null,
  starts_at timestamptz not null,
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

-- ---------------------------------------------------------------------------
-- Application assets (cover letter, recruiter outreach). Written as ALTERs so
-- a database created from an earlier copy of this file picks them up too.
-- ---------------------------------------------------------------------------

alter table public.applications
  -- { "content": string, "tailored_hook": string, "call_to_action": string }
  add column if not exists cover_letter jsonb,
  -- { "subject": string, "inmail_body": string, "short_hook": string }
  add column if not exists recruiter_outreach jsonb;

alter table public.applications
  drop constraint if exists applications_cover_letter_is_object,
  drop constraint if exists applications_recruiter_outreach_is_object;

alter table public.applications
  add constraint applications_cover_letter_is_object
    check (cover_letter is null or jsonb_typeof(cover_letter) = 'object'),
  add constraint applications_recruiter_outreach_is_object
    check (recruiter_outreach is null or jsonb_typeof(recruiter_outreach) = 'object');

-- ---------------------------------------------------------------------------
-- 7. Credits and plans (migration 004)
-- ---------------------------------------------------------------------------
--
-- Credits for tailoring on ApplyOS's own model keys. One credit is one full
-- application (resume patch, cover letter, recruiter message). Runs on the
-- user's own API key are never charged.
--
--   user_credits   one row per user: the balance and the plan.
--   credit_ledger  append-only log of every change to a balance.
--
-- Balances change only inside the SECURITY DEFINER functions below. Users
-- can read their own rows and nothing else: there are no insert, update or
-- delete policies, and those privileges are revoked as well.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.user_credits (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  tier text not null default 'free'
    check (tier in ('free', 'byok', 'pro_credits', 'sprint_pass')),
  tier_expires_at timestamptz,
  -- UTC day the free allowance was last topped up.
  free_refilled_on date not null default ((now() at time zone 'utc')::date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_credits
  add column if not exists free_refilled_on date not null
    default ((now() at time zone 'utc')::date);

drop trigger if exists user_credits_set_updated_at on public.user_credits;
create trigger user_credits_set_updated_at
  before update on public.user_credits
  for each row execute function public.set_updated_at();

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Positive for a purchase, grant or refund; negative for usage.
  amount integer not null check (amount <> 0),
  balance_after integer not null check (balance_after >= 0),
  reference_type text not null
    check (reference_type in ('PURCHASE', 'TAILOR_APPLICATION', 'REFUND', 'GRANT')),
  -- Checkout session id, application id, or the id of the refunded entry.
  reference_id text,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);

-- A payment is credited once however often its webhook is delivered, and a
-- debit is refunded at most once.
create unique index if not exists credit_ledger_one_purchase_idx
  on public.credit_ledger (reference_id)
  where reference_type = 'PURCHASE';
create unique index if not exists credit_ledger_one_refund_idx
  on public.credit_ledger (reference_id)
  where reference_type = 'REFUND';

-- Entries are never edited, by anyone.
create or replace function public.credit_ledger_block_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'credit_ledger is append-only'
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists credit_ledger_append_only on public.credit_ledger;
create trigger credit_ledger_append_only
  before update on public.credit_ledger
  for each row execute function public.credit_ledger_block_update();

-- ---------------------------------------------------------------------------
-- 2. Row-level security: read your own rows, write nothing
-- ---------------------------------------------------------------------------

alter table public.user_credits enable row level security;
alter table public.credit_ledger enable row level security;

drop policy if exists "user_credits: read own" on public.user_credits;
create policy "user_credits: read own"
  on public.user_credits for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "credit_ledger: read own" on public.credit_ledger;
create policy "credit_ledger: read own"
  on public.credit_ledger for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete, truncate on public.user_credits from anon, authenticated;
revoke insert, update, delete, truncate on public.credit_ledger from anon, authenticated;
revoke select on public.user_credits from anon;
revoke select on public.credit_ledger from anon;

-- ---------------------------------------------------------------------------
-- 3. Functions
-- ---------------------------------------------------------------------------

-- Free applications a free-plan user starts each UTC day with.
create or replace function public.free_daily_credits()
returns integer
language sql
immutable
set search_path = ''
as $$ select 3 $$;

-- A signed-in user may act on their own balance only. The service role and
-- direct database sessions (the SQL editor, which carries no API role) may
-- act on anyone's.
create or replace function public.assert_credit_caller(p_user_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_role text := auth.role();
begin
  if v_role is null or v_role = 'service_role' then
    return;
  end if;
  if v_role = 'authenticated' and auth.uid() = p_user_id then
    return;
  end if;
  raise exception 'Not allowed to change these credits'
    using errcode = 'insufficient_privilege';
end;
$$;

-- Brings a balance up to date and returns it: creates the row for a user who
-- has none, ends an expired plan, and tops a free plan back up to the daily
-- allowance once per UTC day. Idempotent within a day.
create or replace function public.refresh_user_credits(p_user_id uuid)
returns public.user_credits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.user_credits;
  v_today date := (now() at time zone 'utc')::date;
  v_allowance integer := public.free_daily_credits();
  v_created boolean := false;
begin
  perform public.assert_credit_caller(p_user_id);

  insert into public.user_credits (user_id, balance, free_refilled_on)
  values (p_user_id, v_allowance, v_today)
  on conflict (user_id) do nothing
  returning true into v_created;

  if v_created then
    insert into public.credit_ledger
      (user_id, amount, balance_after, reference_type, reference_id, description)
    values
      (p_user_id, v_allowance, v_allowance, 'GRANT', null, 'Welcome applications');
  end if;

  select * into v_row
  from public.user_credits
  where user_id = p_user_id
  for update;

  if v_row.tier <> 'free'
     and v_row.tier_expires_at is not null
     and v_row.tier_expires_at <= now() then
    v_row.tier := 'free';
    v_row.tier_expires_at := null;
    -- The paid plan covered today; the free allowance starts tomorrow.
    v_row.free_refilled_on := v_today;
  end if;

  if v_row.tier = 'free' and v_row.free_refilled_on < v_today then
    if v_row.balance < v_allowance then
      insert into public.credit_ledger
        (user_id, amount, balance_after, reference_type, reference_id, description)
      values
        (p_user_id, v_allowance - v_row.balance, v_allowance, 'GRANT', null,
         'Daily free applications');
      v_row.balance := v_allowance;
    end if;
    v_row.free_refilled_on := v_today;
  end if;

  update public.user_credits
  set balance = v_row.balance,
      tier = v_row.tier,
      tier_expires_at = v_row.tier_expires_at,
      free_refilled_on = v_row.free_refilled_on
  where user_id = p_user_id
    and (balance, tier, tier_expires_at, free_refilled_on)
        is distinct from
        (v_row.balance, v_row.tier, v_row.tier_expires_at, v_row.free_refilled_on)
  returning * into v_row;

  if not found then
    select * into v_row from public.user_credits where user_id = p_user_id;
  end if;
  return v_row;
end;
$$;

-- Atomic debit. The balance row is locked for the length of the transaction,
-- so two concurrent calls cannot both spend the last credit: the second
-- waits, re-reads the balance and fails. Returns the new balance.
create or replace function public.debit_user_credits(
  p_user_id uuid,
  p_amount integer,
  p_reference_type text,
  p_reference_id text,
  p_description text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_balance integer;
  v_new_balance integer;
begin
  perform public.assert_credit_caller(p_user_id);

  if p_amount is null or p_amount <= 0 then
    raise exception 'Debit amount must be positive'
      using errcode = 'check_violation';
  end if;
  if p_reference_type is distinct from 'TAILOR_APPLICATION' then
    raise exception 'Unsupported debit type'
      using errcode = 'check_violation';
  end if;

  -- Applies today's free allowance first, and creates a missing row.
  perform public.refresh_user_credits(p_user_id);

  -- Lock the row for update.
  select balance into v_current_balance
  from public.user_credits
  where user_id = p_user_id
  for update;

  if not found or v_current_balance < p_amount then
    raise exception 'Insufficient credits'
      using errcode = 'integrity_constraint_violation';
  end if;

  v_new_balance := v_current_balance - p_amount;

  update public.user_credits
  set balance = v_new_balance
  where user_id = p_user_id;

  insert into public.credit_ledger
    (user_id, amount, balance_after, reference_type, reference_id, description)
  values
    (p_user_id, -p_amount, v_new_balance, p_reference_type, p_reference_id, p_description);

  return v_new_balance;
end;
$$;

-- Adds credits for a purchase or a grant, and optionally sets the plan.
-- Service role only (a payment webhook, or you in the SQL editor). A purchase
-- with a reference id already in the ledger is not credited twice.
create or replace function public.credit_user_credits(
  p_user_id uuid,
  p_amount integer,
  p_reference_type text,
  p_reference_id text,
  p_description text,
  p_tier text default null,
  p_tier_expires_at timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_balance integer;
  v_new_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Credit amount must be positive'
      using errcode = 'check_violation';
  end if;
  if p_reference_type not in ('PURCHASE', 'GRANT') then
    raise exception 'Unsupported credit type'
      using errcode = 'check_violation';
  end if;

  perform public.refresh_user_credits(p_user_id);

  select balance into v_current_balance
  from public.user_credits
  where user_id = p_user_id
  for update;

  if p_reference_type = 'PURCHASE' and p_reference_id is not null and exists (
    select 1 from public.credit_ledger
    where reference_type = 'PURCHASE' and reference_id = p_reference_id
  ) then
    return v_current_balance;
  end if;

  v_new_balance := v_current_balance + p_amount;

  update public.user_credits
  set balance = v_new_balance,
      tier = coalesce(p_tier, tier),
      tier_expires_at = case when p_tier is null then tier_expires_at else p_tier_expires_at end
  where user_id = p_user_id;

  insert into public.credit_ledger
    (user_id, amount, balance_after, reference_type, reference_id, description)
  values
    (p_user_id, p_amount, v_new_balance, p_reference_type, p_reference_id, p_description);

  return v_new_balance;
end;
$$;

-- Gives back the credit taken for a tailoring run that then failed. Service
-- role only: a user who could call this could refund runs that succeeded.
-- Refunds the latest unrefunded debit for the application, once. Returns the
-- new balance, or null when there was nothing to refund.
create or replace function public.refund_tailoring_credit(
  p_user_id uuid,
  p_application_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_debit public.credit_ledger;
  v_new_balance integer;
begin
  -- Lock the balance first so concurrent refunds queue up behind each other.
  perform 1 from public.user_credits where user_id = p_user_id for update;
  if not found then
    return null;
  end if;

  select d.* into v_debit
  from public.credit_ledger d
  where d.user_id = p_user_id
    and d.reference_type = 'TAILOR_APPLICATION'
    and d.reference_id = p_application_id
    and d.amount < 0
    and not exists (
      select 1 from public.credit_ledger r
      where r.reference_type = 'REFUND' and r.reference_id = d.id::text
    )
  order by d.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  update public.user_credits
  set balance = balance - v_debit.amount
  where user_id = p_user_id
  returning balance into v_new_balance;

  insert into public.credit_ledger
    (user_id, amount, balance_after, reference_type, reference_id, description)
  values
    (p_user_id, -v_debit.amount, v_new_balance, 'REFUND', v_debit.id::text,
     'Refund: ' || v_debit.description);

  return v_new_balance;
end;
$$;

-- Who may call what. New functions are executable by everyone by default.
revoke all on function public.free_daily_credits() from public, anon;
revoke all on function public.assert_credit_caller(uuid) from public, anon;
revoke all on function public.refresh_user_credits(uuid) from public, anon;
revoke all on function public.debit_user_credits(uuid, integer, text, text, text) from public, anon;
revoke all on function public.credit_user_credits(uuid, integer, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.refund_tailoring_credit(uuid, text)
  from public, anon, authenticated;

grant execute on function public.free_daily_credits() to authenticated, service_role;
grant execute on function public.assert_credit_caller(uuid) to authenticated, service_role;
grant execute on function public.refresh_user_credits(uuid) to authenticated, service_role;
grant execute on function public.debit_user_credits(uuid, integer, text, text, text)
  to authenticated, service_role;
grant execute on function public.credit_user_credits(uuid, integer, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.refund_tailoring_credit(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. New users start with the free allowance
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowance integer := public.free_daily_credits();
  v_created boolean := false;
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;

  -- Never let billing setup block a sign-up: refresh_user_credits creates
  -- the row later if this fails.
  begin
    insert into public.user_credits (user_id, balance, tier)
    values (new.id, v_allowance, 'free')
    on conflict (user_id) do nothing
    returning true into v_created;

    if v_created then
      insert into public.credit_ledger
        (user_id, amount, balance_after, reference_type, reference_id, description)
      values
        (new.id, v_allowance, v_allowance, 'GRANT', null, 'Welcome applications');
    end if;
  exception when others then
    raise warning 'Could not initialise credits for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Accounts that existed before this migration
-- ---------------------------------------------------------------------------

with created as (
  insert into public.user_credits (user_id, balance, tier)
  select p.id, public.free_daily_credits(), 'free'
  from public.profiles p
  on conflict (user_id) do nothing
  returning user_id, balance
)
insert into public.credit_ledger
  (user_id, amount, balance_after, reference_type, reference_id, description)
select user_id, balance, balance, 'GRANT', null, 'Welcome applications'
from created;

-- ---------------------------------------------------------------------------
-- 8. Email interactions (migration 005)
-- ---------------------------------------------------------------------------
--
-- Recruiter emails received for an application, with the reply ApplyOS
-- drafted for you to review. Drafts are only ever text in this table: nothing
-- in ApplyOS sends email.
--
-- The inbound-mail webhook writes rows with the service role (which bypasses
-- RLS). Signed-in users can read and delete their own rows and edit the
-- draft, and nothing else on a row, so a received message stays as it arrived.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

create table if not exists public.email_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  -- Sender address and display name, as received.
  sender text not null,
  sender_name text,
  subject text not null,
  body_text text not null,
  intent text not null,
  -- The reply for you to review and send yourself. `null` until drafted.
  draft_response text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint email_interactions_intent_valid
    check (intent in ('SCREENING', 'INTERVIEW', 'REJECTION', 'OTHER'))
);

create index if not exists email_interactions_user_application_idx
  on public.email_interactions (user_id, application_id);

create index if not exists email_interactions_application_received_idx
  on public.email_interactions (application_id, received_at desc);

-- ---------------------------------------------------------------------------
-- 2. Row-level security
-- ---------------------------------------------------------------------------

alter table public.email_interactions enable row level security;

drop policy if exists "email_interactions: read own" on public.email_interactions;
create policy "email_interactions: read own"
  on public.email_interactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No insert policy: rows arrive only through the webhook (service role).
-- Letting users create rows would let them spend platform model calls on
-- drafts for emails that never came.

drop policy if exists "email_interactions: update own" on public.email_interactions;
create policy "email_interactions: update own"
  on public.email_interactions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "email_interactions: delete own" on public.email_interactions;
create policy "email_interactions: delete own"
  on public.email_interactions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Editing is limited to the draft: who wrote what, and when, is a record.
revoke all on public.email_interactions from anon;
revoke insert, update on public.email_interactions from authenticated;
grant update (draft_response) on public.email_interactions to authenticated;

-- ===========================================================================
-- ApplyOS Migration 006: Candidate Calibration & Strict Permission Protocol
-- ===========================================================================

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

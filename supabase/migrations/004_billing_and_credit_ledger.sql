-- ApplyOS migration 004. Safe to run more than once.
-- Paste into the Supabase SQL editor and run.
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

-- ApplyOS migration 005. Safe to run more than once.
-- Paste into the Supabase SQL editor and run.
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

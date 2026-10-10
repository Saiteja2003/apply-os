-- ApplyOS migration 003. Safe to run more than once.
-- Paste into the Supabase SQL editor and run.
--
-- Adds the cover letter and recruiter outreach that tailoring now produces
-- alongside the resume patch.

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

-- ---------------------------------------------------------------------------
-- Dashboard user accounts.
--
-- Run this once in the Supabase SQL editor:
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run
--
-- PostgREST (the /rest/v1 API the server uses) cannot create tables, so this
-- step has to happen in the dashboard rather than from application code.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id            uuid        primary key default gen_random_uuid(),

  -- Stored already lower-cased by the application. The unique constraint is
  -- therefore case-insensitive in practice, and stops two accounts existing
  -- for the same person.
  email         text        not null unique,

  -- scrypt, in the form  scrypt$N$r$p$<salt-b64>$<hash-b64>
  -- Never a plaintext or reversibly-encoded password.
  password_hash text        not null,

  display_name  text,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- Row Level Security ON with NO policies is deliberate and is the main
-- protection here: it means the anon/publishable key cannot read this table at
-- all, not even to count rows. Only the secret key (which bypasses RLS, and
-- which lives solely in the server's environment) can touch it.
alter table public.app_users enable row level security;

-- Belt and braces: revoke the default grants PostgREST's roles get, so even a
-- future policy added by accident cannot expose password hashes.
revoke all on public.app_users from anon;
revoke all on public.app_users from authenticated;

create table public.desktop_login_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  state text not null,
  nonce_challenge text not null,
  clerk_user_id text,
  exchange_code text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  platform text,
  app_version text,
  app_channel text,
  constraint desktop_login_attempts_state_key unique (state),
  constraint desktop_login_attempts_exchange_code_key unique (exchange_code),
  constraint desktop_login_attempts_state_not_blank check (btrim(state) <> ''),
  constraint desktop_login_attempts_nonce_challenge_not_blank check (btrim(nonce_challenge) <> ''),
  constraint desktop_login_attempts_clerk_user_id_not_blank check (
    clerk_user_id is null or btrim(clerk_user_id) <> ''
  ),
  constraint desktop_login_attempts_exchange_code_not_blank check (
    exchange_code is null or btrim(exchange_code) <> ''
  )
);

comment on table public.desktop_login_attempts is
  'Pending desktop sign-in handoffs. The Mac app starts an attempt with a state + nonce_challenge (PKCE-style); the web /sign-in flow associates a Clerk user and an exchange_code after authentication; the Mac app then exchanges {state, code, nonce_verifier} for a desktop session token. RLS is enabled with no policies — access is server-only via service role.';

create index desktop_login_attempts_expires_at_idx on public.desktop_login_attempts (expires_at);
create index desktop_login_attempts_clerk_user_id_idx on public.desktop_login_attempts (clerk_user_id);

alter table public.desktop_login_attempts enable row level security;

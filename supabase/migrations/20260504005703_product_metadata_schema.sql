create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  clerk_user_id text not null,
  email text not null,
  created_at timestamptz not null default now(),
  terms_accepted_at timestamptz,
  is_blocked boolean not null default false,
  constraint profiles_clerk_user_id_key unique (clerk_user_id),
  constraint profiles_email_not_blank check (btrim(email) <> ''),
  constraint profiles_clerk_user_id_not_blank check (btrim(clerk_user_id) <> '')
);

comment on table public.profiles is
  'RubyWhisper product metadata only. RLS is enabled and no policies are created in this migration; access is intentionally limited to server-side service-role flows until the auth model is defined.';
comment on column public.profiles.clerk_user_id is
  'External Clerk user identifier. Do not store Supabase Auth user IDs here until a future auth migration explicitly changes the model.';

create table public.admin_roles (
  id uuid primary key default extensions.gen_random_uuid(),
  clerk_user_id text not null,
  role text not null,
  created_at timestamptz not null default now(),
  constraint admin_roles_clerk_user_id_key unique (clerk_user_id),
  constraint admin_roles_clerk_user_id_not_blank check (btrim(clerk_user_id) <> ''),
  constraint admin_roles_role_not_blank check (btrim(role) <> '')
);

comment on table public.admin_roles is
  'Admin role metadata only. RLS is enabled and no policies are created in this migration; reads and writes must remain server-side until admin access rules are defined.';

create table public.subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  clerk_user_id text not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null,
  plan text not null,
  current_period_end timestamptz,
  friend_of_ruby_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint subscriptions_clerk_user_id_key unique (clerk_user_id),
  constraint subscriptions_stripe_customer_id_key unique (stripe_customer_id),
  constraint subscriptions_stripe_subscription_id_key unique (stripe_subscription_id),
  constraint subscriptions_clerk_user_id_not_blank check (btrim(clerk_user_id) <> ''),
  constraint subscriptions_stripe_customer_id_not_blank check (
    stripe_customer_id is null or btrim(stripe_customer_id) <> ''
  ),
  constraint subscriptions_stripe_subscription_id_not_blank check (
    stripe_subscription_id is null or btrim(stripe_subscription_id) <> ''
  ),
  constraint subscriptions_status_not_blank check (btrim(status) <> ''),
  constraint subscriptions_plan_not_blank check (btrim(plan) <> '')
);

comment on table public.subscriptions is
  'Subscription cache metadata only. Stripe remains the billing source of truth; RLS is enabled with no policies until server-only billing access helpers are added.';

create table public.usage_counters (
  id uuid primary key default extensions.gen_random_uuid(),
  clerk_user_id text not null,
  trial_words_used integer not null default 0,
  lifetime_words_used bigint not null default 0,
  monthly_words_used integer not null default 0,
  monthly_period_start date not null,
  updated_at timestamptz not null default now(),
  constraint usage_counters_clerk_user_id_key unique (clerk_user_id),
  constraint usage_counters_clerk_user_id_not_blank check (btrim(clerk_user_id) <> ''),
  constraint usage_counters_trial_words_nonnegative check (trial_words_used >= 0),
  constraint usage_counters_lifetime_words_nonnegative check (lifetime_words_used >= 0),
  constraint usage_counters_monthly_words_nonnegative check (monthly_words_used >= 0)
);

comment on table public.usage_counters is
  'Usage aggregate metadata only. Word counts are numeric counters only; no transcript text is stored. RLS is enabled with no policies until server-only usage access helpers are added.';

create table public.transcription_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  clerk_user_id text not null,
  request_id text not null,
  status text not null,
  provider text not null,
  plan_state text not null,
  audio_duration_ms integer,
  cleaned_word_count integer,
  latency_ms integer,
  error_code text,
  app_version text,
  os_version text,
  created_at timestamptz not null default now(),
  constraint transcription_requests_request_id_key unique (request_id),
  constraint transcription_requests_clerk_user_id_not_blank check (btrim(clerk_user_id) <> ''),
  constraint transcription_requests_request_id_not_blank check (btrim(request_id) <> ''),
  constraint transcription_requests_status_not_blank check (btrim(status) <> ''),
  constraint transcription_requests_provider_not_blank check (btrim(provider) <> ''),
  constraint transcription_requests_plan_state_not_blank check (btrim(plan_state) <> ''),
  constraint transcription_requests_audio_duration_nonnegative check (
    audio_duration_ms is null or audio_duration_ms >= 0
  ),
  constraint transcription_requests_cleaned_word_count_nonnegative check (
    cleaned_word_count is null or cleaned_word_count >= 0
  ),
  constraint transcription_requests_latency_nonnegative check (
    latency_ms is null or latency_ms >= 0
  ),
  constraint transcription_requests_error_code_not_blank check (
    error_code is null or btrim(error_code) <> ''
  ),
  constraint transcription_requests_app_version_not_blank check (
    app_version is null or btrim(app_version) <> ''
  ),
  constraint transcription_requests_os_version_not_blank check (
    os_version is null or btrim(os_version) <> ''
  )
);

comment on table public.transcription_requests is
  'Provider request metadata only. This table must not contain recordings, transcript text, cleaned text, clipboard text, app context, local history, or dictionary content. RLS is enabled with no policies until request access rules are defined.';
comment on column public.transcription_requests.audio_duration_ms is
  'Duration metadata only; never store audio payloads or recording contents.';
comment on column public.transcription_requests.cleaned_word_count is
  'Numeric output-size metadata only; never store raw or cleaned transcript text.';

create table public.friend_of_ruby_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  created_by_clerk_user_id text not null,
  stripe_promotion_code_id text,
  code text not null,
  max_redemptions integer not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint friend_of_ruby_batches_code_key unique (code),
  constraint friend_of_ruby_batches_stripe_promotion_code_id_key unique (stripe_promotion_code_id),
  constraint friend_of_ruby_batches_created_by_not_blank check (
    btrim(created_by_clerk_user_id) <> ''
  ),
  constraint friend_of_ruby_batches_code_not_blank check (btrim(code) <> ''),
  constraint friend_of_ruby_batches_stripe_promotion_code_id_not_blank check (
    stripe_promotion_code_id is null or btrim(stripe_promotion_code_id) <> ''
  ),
  constraint friend_of_ruby_batches_max_redemptions_positive check (max_redemptions > 0)
);

comment on table public.friend_of_ruby_batches is
  'Friend of Ruby batch and promo lookup metadata only. RLS is enabled with no policies until admin and redemption access rules are defined.';

create index profiles_created_at_idx
  on public.profiles (created_at);

create index admin_roles_role_idx
  on public.admin_roles (role);

create index subscriptions_status_idx
  on public.subscriptions (status);

create index subscriptions_current_period_end_idx
  on public.subscriptions (current_period_end);

create index usage_counters_monthly_period_start_idx
  on public.usage_counters (monthly_period_start);

create index transcription_requests_clerk_user_id_created_at_idx
  on public.transcription_requests (clerk_user_id, created_at desc);

create index transcription_requests_status_created_at_idx
  on public.transcription_requests (status, created_at desc);

create index transcription_requests_provider_created_at_idx
  on public.transcription_requests (provider, created_at desc);

create index friend_of_ruby_batches_created_by_idx
  on public.friend_of_ruby_batches (created_by_clerk_user_id);

create index friend_of_ruby_batches_expires_at_idx
  on public.friend_of_ruby_batches (expires_at);

alter table public.profiles enable row level security;
alter table public.admin_roles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_counters enable row level security;
alter table public.transcription_requests enable row level security;
alter table public.friend_of_ruby_batches enable row level security;

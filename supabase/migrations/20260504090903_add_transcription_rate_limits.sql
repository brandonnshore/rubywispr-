create table public.transcription_rate_limits (
  id uuid primary key default extensions.gen_random_uuid(),
  clerk_user_id text not null,
  request_count integer not null default 0,
  window_start timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint transcription_rate_limits_clerk_user_id_key unique (clerk_user_id),
  constraint transcription_rate_limits_clerk_user_id_not_blank check (
    btrim(clerk_user_id) <> ''
  ),
  constraint transcription_rate_limits_request_count_nonnegative check (
    request_count >= 0
  )
);

comment on table public.transcription_rate_limits is
  'Transcription rate-limit metadata only. Stores per-user window counts and timestamps only; never store recordings, request bodies, transcripts, cleaned text, clipboard text, app context, local history, dictionary content, provider payloads, authorization material, private env values, or secrets. RLS is enabled with no policies; access is intentionally limited to server-side service-role flows.';
comment on column public.transcription_rate_limits.request_count is
  'Numeric request counter for the active per-user rate-limit window only.';
comment on column public.transcription_rate_limits.window_start is
  'Timestamp metadata for the active per-user rate-limit window only.';

create index transcription_rate_limits_window_start_idx
  on public.transcription_rate_limits (window_start);

create index transcription_rate_limits_updated_at_idx
  on public.transcription_rate_limits (updated_at);

alter table public.transcription_rate_limits enable row level security;

create table public.stripe_webhook_events (
  id uuid primary key default extensions.gen_random_uuid(),
  stripe_event_id text not null,
  event_type text not null,
  status text not null default 'processing',
  stripe_created_at timestamptz,
  processed_at timestamptz,
  failed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_webhook_events_stripe_event_id_key unique (stripe_event_id),
  constraint stripe_webhook_events_stripe_event_id_not_blank check (
    btrim(stripe_event_id) <> ''
  ),
  constraint stripe_webhook_events_event_type_not_blank check (
    btrim(event_type) <> ''
  ),
  constraint stripe_webhook_events_status_valid check (
    status in ('processing', 'processed', 'failed')
  ),
  constraint stripe_webhook_events_error_code_safe check (
    error_code is null or error_code ~ '^[a-z0-9_:-]{1,128}$'
  )
);

comment on table public.stripe_webhook_events is
  'Stripe webhook delivery metadata only. Stores event id, event type, status, timestamps, and sanitized error code only. RLS is enabled with no policies; access is intentionally limited to server-side service-role flows.';
comment on column public.stripe_webhook_events.stripe_event_id is
  'Stripe event identifier used only for webhook idempotency.';
comment on column public.stripe_webhook_events.event_type is
  'Stripe event type metadata used to route server-side billing work.';
comment on column public.stripe_webhook_events.error_code is
  'Sanitized processing error code only; never store provider payloads or customer content.';

create index stripe_webhook_events_status_created_at_idx
  on public.stripe_webhook_events (status, created_at desc);

create index stripe_webhook_events_event_type_created_at_idx
  on public.stripe_webhook_events (event_type, created_at desc);

alter table public.stripe_webhook_events enable row level security;

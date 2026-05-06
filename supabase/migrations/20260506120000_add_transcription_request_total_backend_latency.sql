alter table public.transcription_requests
  add column if not exists total_backend_latency_ms integer;

alter table public.transcription_requests
  add constraint transcription_requests_total_backend_latency_nonnegative check (
    total_backend_latency_ms is null or total_backend_latency_ms >= 0
  );

comment on column public.transcription_requests.latency_ms is
  'Provider latency metadata only. This value measures provider work and must never contain audio, transcript, cleanup context, dictionary terms, provider payloads, authorization material, private env values, or secrets.';

comment on column public.transcription_requests.total_backend_latency_ms is
  'Total backend route latency metadata only. This value measures backend request handling and must never contain audio, transcript, cleanup context, dictionary terms, provider payloads, authorization material, private env values, or secrets.';

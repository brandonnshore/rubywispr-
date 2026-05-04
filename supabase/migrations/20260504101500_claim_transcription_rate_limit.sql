create or replace function public.claim_transcription_rate_limit(
  p_clerk_user_id text,
  p_limit integer,
  p_window_seconds integer,
  p_now timestamptz default now()
)
returns table (
  status text,
  "limit" integer,
  request_count integer,
  retry_after_seconds integer,
  window_start timestamptz,
  window_end timestamptz
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_clerk_user_id text := btrim(coalesce(p_clerk_user_id, ''));
  v_limit integer := greatest(1, coalesce(p_limit, 0));
  v_now timestamptz := coalesce(p_now, now());
  v_retry_after_seconds integer;
  v_row public.transcription_rate_limits%rowtype;
  v_status text;
  v_window_end timestamptz;
  v_window_seconds integer := greatest(1, coalesce(p_window_seconds, 0));
begin
  if v_clerk_user_id = '' or length(v_clerk_user_id) > 128 then
    raise exception 'Invalid transcription rate-limit claim input.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_clerk_user_id, 155031));

  select *
    into v_row
    from public.transcription_rate_limits
   where clerk_user_id = v_clerk_user_id
   for update;

  if not found then
    insert into public.transcription_rate_limits (
      clerk_user_id,
      request_count,
      updated_at,
      window_start
    )
    values (
      v_clerk_user_id,
      1,
      v_now,
      v_now
    )
    returning * into v_row;

    v_status := 'allowed';
  elsif v_row.window_start + make_interval(secs => v_window_seconds) <= v_now then
    update public.transcription_rate_limits
       set request_count = 1,
           updated_at = v_now,
           window_start = v_now
     where clerk_user_id = v_clerk_user_id
     returning * into v_row;

    v_status := 'allowed';
  elsif v_row.request_count < v_limit then
    update public.transcription_rate_limits
       set request_count = v_row.request_count + 1,
           updated_at = v_now
     where clerk_user_id = v_clerk_user_id
     returning * into v_row;

    v_status := 'allowed';
  else
    update public.transcription_rate_limits
       set request_count = least(v_row.request_count, v_limit),
           updated_at = v_now
     where clerk_user_id = v_clerk_user_id
     returning * into v_row;

    v_status := 'rate_limited';
  end if;

  v_window_end := v_row.window_start + make_interval(secs => v_window_seconds);

  if v_status = 'rate_limited' then
    v_retry_after_seconds := greatest(
      1,
      ceiling(extract(epoch from (v_window_end - v_now)))::integer
    );
  end if;

  return query
  select
    v_status,
    v_limit,
    v_row.request_count,
    v_retry_after_seconds,
    v_row.window_start,
    v_window_end;
end;
$$;

comment on function public.claim_transcription_rate_limit(
  text,
  integer,
  integer,
  timestamptz
) is
  'Atomically claims per-user transcription rate-limit metadata through a service-role RPC. Returns only numeric and timestamp window metadata.';

revoke all on function public.claim_transcription_rate_limit(
  text,
  integer,
  integer,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.claim_transcription_rate_limit(
  text,
  integer,
  integer,
  timestamptz
) to service_role;

import "server-only";

import {
  createSupabaseServiceRoleClient,
  type SupabaseServiceRoleClientFactory,
} from "@/lib/supabase/server";

import {
  evaluateRubyWhisperTranscriptionRateLimit,
  type RubyWhisperTranscriptionRateLimitAllowedResult,
  type RubyWhisperTranscriptionRateLimitDeniedResult,
  type RubyWhisperTranscriptionRateLimitInput,
  type RubyWhisperTranscriptionRateLimitMetadata,
  type RubyWhisperTranscriptionRateLimitPolicy,
  type RubyWhisperTranscriptionRateLimitState,
} from "./transcription";

export const supabaseTranscriptionRateLimitsTableName =
  "transcription_rate_limits" as const;
export const supabaseTranscriptionRateLimitsColumns =
  "clerk_user_id,request_count,window_start,updated_at" as const;
export const supabaseTranscriptionRateLimitsUpsertConflictTarget =
  "clerk_user_id" as const;
export const supabaseClaimTranscriptionRateLimitRpcName =
  "claim_transcription_rate_limit" as const;

export type SupabaseTranscriptionRateLimitRow = Readonly<{
  clerk_user_id: string;
  request_count: number;
  updated_at: string | null;
  window_start: string;
}>;

export type SupabaseTranscriptionRateLimitUpsert = Readonly<{
  clerk_user_id: string;
  request_count: number;
  updated_at: string;
  window_start: string;
}>;

export type RubyWhisperPersistentTranscriptionRateLimitError = Readonly<{
  code:
    | "missing_clerk_user_id"
    | "supabase_transcription_rate_limit_read_failed"
    | "supabase_transcription_rate_limit_write_failed"
    | "supabase_transcription_rate_limit_claim_failed";
  message: string;
}>;

export type RubyWhisperPersistentTranscriptionRateLimitFailure = Readonly<{
  error: RubyWhisperPersistentTranscriptionRateLimitError;
  ok: false;
  status: "claim_failed" | "missing_user" | "read_failed" | "write_failed";
}>;

export type RubyWhisperPersistentTranscriptionRateLimitAllowedResult =
  Readonly<{
    action: "upserted";
    metadata: RubyWhisperTranscriptionRateLimitMetadata;
    ok: true;
    rateLimit: RubyWhisperTranscriptionRateLimitAllowedResult;
    rateLimitRow: SupabaseTranscriptionRateLimitUpsert;
    state: RubyWhisperTranscriptionRateLimitState;
    status: "allowed";
  }>;

export type RubyWhisperPersistentTranscriptionRateLimitDeniedResult =
  Readonly<{
    action: "rate_limited";
    apiErrorMetadata: RubyWhisperTranscriptionRateLimitMetadata;
    errorCode: "rate_limited";
    metadata: RubyWhisperTranscriptionRateLimitMetadata;
    ok: false;
    rateLimit: RubyWhisperTranscriptionRateLimitDeniedResult;
    state: RubyWhisperTranscriptionRateLimitState;
    status: "rate_limited";
  }>;

export type RubyWhisperPersistentTranscriptionRateLimitResult =
  | RubyWhisperPersistentTranscriptionRateLimitAllowedResult
  | RubyWhisperPersistentTranscriptionRateLimitDeniedResult
  | RubyWhisperPersistentTranscriptionRateLimitFailure;

export type RubyWhisperAtomicTranscriptionRateLimitAllowedResult = Readonly<{
  action: "claimed";
  metadata: RubyWhisperTranscriptionRateLimitMetadata;
  ok: true;
  status: "allowed";
}>;

export type RubyWhisperAtomicTranscriptionRateLimitDeniedResult = Readonly<{
  action: "rate_limited";
  apiErrorMetadata: RubyWhisperTranscriptionRateLimitMetadata;
  errorCode: "rate_limited";
  metadata: RubyWhisperTranscriptionRateLimitMetadata;
  ok: false;
  status: "rate_limited";
}>;

export type RubyWhisperAtomicTranscriptionRateLimitResult =
  | RubyWhisperAtomicTranscriptionRateLimitAllowedResult
  | RubyWhisperAtomicTranscriptionRateLimitDeniedResult
  | RubyWhisperPersistentTranscriptionRateLimitFailure;

export type EvaluateAndPersistRubyWhisperTranscriptionRateLimitInput =
  Readonly<{
    clerkUserId?: string | null;
    now?: RubyWhisperTranscriptionRateLimitInput["now"];
    planState?: RubyWhisperTranscriptionRateLimitInput["planState"];
    policy?: RubyWhisperTranscriptionRateLimitPolicy;
  }>;

export type SupabaseTranscriptionRateLimitsSingleResult = Readonly<{
  data: SupabaseTranscriptionRateLimitRow | null;
  error: unknown | null;
}>;

export type SupabaseTranscriptionRateLimitsSelectQuery = Readonly<{
  eq: (
    columnName: "clerk_user_id",
    clerkUserId: string,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseTranscriptionRateLimitsSingleResult>;
  }>;
}>;

export type SupabaseTranscriptionRateLimitsUpsertQuery = Readonly<{
  select: (
    columns: typeof supabaseTranscriptionRateLimitsColumns,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseTranscriptionRateLimitsSingleResult>;
  }>;
}>;

export type SupabaseTranscriptionRateLimitsTableQuery = Readonly<{
  select: (
    columns: typeof supabaseTranscriptionRateLimitsColumns,
  ) => SupabaseTranscriptionRateLimitsSelectQuery;
  upsert: (
    rateLimitRow: SupabaseTranscriptionRateLimitUpsert,
    options: Readonly<{
      onConflict: typeof supabaseTranscriptionRateLimitsUpsertConflictTarget;
    }>,
  ) => SupabaseTranscriptionRateLimitsUpsertQuery;
}>;

export type SupabaseTranscriptionRateLimitsClient = Readonly<{
  from: (
    tableName: typeof supabaseTranscriptionRateLimitsTableName,
  ) => SupabaseTranscriptionRateLimitsTableQuery;
}>;

export type ClaimRubyWhisperTranscriptionRateLimitInput =
  EvaluateAndPersistRubyWhisperTranscriptionRateLimitInput;

export type SupabaseClaimTranscriptionRateLimitRpcArgs = Readonly<{
  p_clerk_user_id: string;
  p_limit: number;
  p_now: string;
  p_window_seconds: number;
}>;

export type SupabaseClaimTranscriptionRateLimitRow = Readonly<{
  limit: number;
  request_count: number;
  retry_after_seconds: number | null;
  status: "allowed" | "rate_limited";
  window_end: string;
  window_start: string;
}>;

export type SupabaseClaimTranscriptionRateLimitSingleResult = Readonly<{
  data: SupabaseClaimTranscriptionRateLimitRow | null;
  error: unknown | null;
}>;

export type SupabaseClaimTranscriptionRateLimitRpcQuery = Readonly<{
  maybeSingle: () => PromiseLike<SupabaseClaimTranscriptionRateLimitSingleResult>;
}>;

export type SupabaseClaimTranscriptionRateLimitClient = Readonly<{
  rpc: (
    functionName: typeof supabaseClaimTranscriptionRateLimitRpcName,
    args: SupabaseClaimTranscriptionRateLimitRpcArgs,
  ) => SupabaseClaimTranscriptionRateLimitRpcQuery;
}>;

export async function claimRubyWhisperTranscriptionRateLimit<
  Client extends SupabaseClaimTranscriptionRateLimitClient,
>(
  input: ClaimRubyWhisperTranscriptionRateLimitInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<RubyWhisperAtomicTranscriptionRateLimitResult> {
  const clerkUserId = normalizeText(input.clerkUserId);

  if (!clerkUserId) {
    return missingUserResult();
  }

  const now = normalizeTimestamp(input.now);
  const claimPolicy = claimPolicyFromEvaluator({
    clerkUserId,
    now,
    planState: input.planState,
    policy: input.policy,
  });

  if (!claimPolicy) {
    return missingUserResult();
  }

  const client = createSupabaseServiceRoleClient(createClient);
  const { data, error } = await client
    .rpc(supabaseClaimTranscriptionRateLimitRpcName, {
      p_clerk_user_id: clerkUserId,
      p_limit: claimPolicy.limit,
      p_now: now,
      p_window_seconds: claimPolicy.windowSeconds,
    })
    .maybeSingle();

  if (error || !data) {
    return claimFailedResult();
  }

  return atomicClaimResultFromRow(data);
}

export async function evaluateAndPersistRubyWhisperTranscriptionRateLimit<
  Client extends SupabaseTranscriptionRateLimitsClient,
>(
  input: EvaluateAndPersistRubyWhisperTranscriptionRateLimitInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<RubyWhisperPersistentTranscriptionRateLimitResult> {
  const clerkUserId = normalizeText(input.clerkUserId);

  if (!clerkUserId) {
    return missingUserResult();
  }

  const client = createSupabaseServiceRoleClient(createClient);
  const { data, error } = await client
    .from(supabaseTranscriptionRateLimitsTableName)
    .select(supabaseTranscriptionRateLimitsColumns)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    return {
      error: {
        code: "supabase_transcription_rate_limit_read_failed",
        message: "Unable to read transcription rate-limit metadata.",
      },
      ok: false,
      status: "read_failed",
    };
  }

  const rateLimit = evaluateRubyWhisperTranscriptionRateLimit({
    clerkUserId,
    now: input.now,
    planState: input.planState,
    policy: input.policy,
    requestCount: data?.request_count,
    windowStart: data?.window_start,
  });

  if (rateLimit.status === "invalid_user") {
    return missingUserResult();
  }

  if (!rateLimit.ok) {
    return {
      action: "rate_limited",
      apiErrorMetadata: rateLimit.metadata,
      errorCode: "rate_limited",
      metadata: rateLimit.metadata,
      ok: false,
      rateLimit,
      state: rateLimit.state,
      status: "rate_limited",
    };
  }

  const rateLimitRow = createRateLimitUpsert(rateLimit.state, input.now);
  const { error: writeError } = await client
    .from(supabaseTranscriptionRateLimitsTableName)
    .upsert(rateLimitRow, {
      onConflict: supabaseTranscriptionRateLimitsUpsertConflictTarget,
    })
    .select(supabaseTranscriptionRateLimitsColumns)
    .maybeSingle();

  if (writeError) {
    return {
      error: {
        code: "supabase_transcription_rate_limit_write_failed",
        message: "Unable to write transcription rate-limit metadata.",
      },
      ok: false,
      status: "write_failed",
    };
  }

  return {
    action: "upserted",
    metadata: rateLimit.metadata,
    ok: true,
    rateLimit,
    rateLimitRow,
    state: rateLimit.state,
    status: "allowed",
  };
}

function createRateLimitUpsert(
  state: RubyWhisperTranscriptionRateLimitState,
  nowInput: RubyWhisperTranscriptionRateLimitInput["now"],
): SupabaseTranscriptionRateLimitUpsert {
  return {
    clerk_user_id: state.clerkUserId,
    request_count: state.requestCount,
    updated_at: normalizeTimestamp(nowInput),
    window_start: state.windowStart,
  };
}

function atomicClaimResultFromRow(
  row: SupabaseClaimTranscriptionRateLimitRow,
): RubyWhisperAtomicTranscriptionRateLimitResult {
  const metadata = rateLimitMetadataFromRpcRow(row);

  if (!metadata) {
    return claimFailedResult();
  }

  if (row.status === "allowed") {
    return {
      action: "claimed",
      metadata,
      ok: true,
      status: "allowed",
    };
  }

  if (row.status === "rate_limited") {
    return {
      action: "rate_limited",
      apiErrorMetadata: metadata,
      errorCode: "rate_limited",
      metadata,
      ok: false,
      status: "rate_limited",
    };
  }

  return claimFailedResult();
}

function rateLimitMetadataFromRpcRow(
  row: SupabaseClaimTranscriptionRateLimitRow,
): RubyWhisperTranscriptionRateLimitMetadata | undefined {
  const limit = normalizePositiveInteger(row.limit);
  const requestCount = normalizeNonnegativeInteger(row.request_count);
  const windowStart = normalizeRequiredTimestamp(row.window_start);
  const windowEnd = normalizeRequiredTimestamp(row.window_end);

  if (!limit || requestCount === undefined || !windowStart || !windowEnd) {
    return undefined;
  }

  return {
    limit,
    requestCount,
    ...(row.status === "rate_limited"
      ? { retryAfterSeconds: normalizeRetryAfter(row.retry_after_seconds) }
      : {}),
    windowEnd,
    windowStart,
  };
}

function claimPolicyFromEvaluator(input: {
  clerkUserId: string;
  now: string;
  planState: RubyWhisperTranscriptionRateLimitInput["planState"];
  policy: RubyWhisperTranscriptionRateLimitPolicy | undefined;
}) {
  const evaluation = evaluateRubyWhisperTranscriptionRateLimit({
    clerkUserId: input.clerkUserId,
    now: input.now,
    planState: input.planState,
    policy: input.policy,
    requestCount: 0,
    windowStart: input.now,
  });

  if (!evaluation.ok) {
    return undefined;
  }

  const windowStartMs = new Date(evaluation.metadata.windowStart).getTime();
  const windowEndMs = new Date(evaluation.metadata.windowEnd).getTime();
  const windowSeconds = Math.ceil((windowEndMs - windowStartMs) / 1_000);

  return {
    limit: evaluation.metadata.limit,
    windowSeconds: windowSeconds > 0 ? windowSeconds : 1,
  };
}

function claimFailedResult(): RubyWhisperPersistentTranscriptionRateLimitFailure {
  return {
    error: {
      code: "supabase_transcription_rate_limit_claim_failed",
      message: "Unable to claim transcription rate-limit metadata.",
    },
    ok: false,
    status: "claim_failed",
  };
}

function missingUserResult(): RubyWhisperPersistentTranscriptionRateLimitFailure {
  return {
    error: {
      code: "missing_clerk_user_id",
      message: "A Clerk user ID is required for transcription rate-limit metadata.",
    },
    ok: false,
    status: "missing_user",
  };
}

function normalizeText(value: string | null | undefined) {
  const trimmedValue = value?.trim() ?? "";

  if (trimmedValue.length > 128) {
    return "";
  }

  return trimmedValue;
}

function normalizePositiveInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeNonnegativeInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.floor(value);
}

function normalizeRetryAfter(value: unknown) {
  const retryAfterSeconds = normalizePositiveInteger(value);

  return retryAfterSeconds > 0 ? retryAfterSeconds : 1;
}

function normalizeRequiredTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const timestamp = new Date(value);

  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : undefined;
}

function normalizeTimestamp(nowInput: RubyWhisperTranscriptionRateLimitInput["now"]) {
  const now =
    nowInput instanceof Date
      ? nowInput
      : nowInput
        ? new Date(nowInput)
        : new Date();

  if (Number.isFinite(now.getTime())) {
    return now.toISOString();
  }

  return new Date().toISOString();
}

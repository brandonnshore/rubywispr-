import "server-only";

import type { RubyWhisperApiErrorMetadata } from "@/lib/api/errors";
import type { RubyWhisperUsagePlanState } from "@/lib/usage/quota";

export const rubyWhisperDefaultTranscriptionRateLimitPolicy: RubyWhisperTranscriptionRateLimitPolicy = {
  limit: 20,
  windowSeconds: 60,
} as const;

export type RubyWhisperTranscriptionRateLimitWindowPolicy = Readonly<{
  limit: number;
  windowSeconds: number;
}>;

export type RubyWhisperTranscriptionRateLimitPolicy =
  RubyWhisperTranscriptionRateLimitWindowPolicy &
    Readonly<{
      planOverrides?: Partial<
        Record<
          RubyWhisperUsagePlanState,
          RubyWhisperTranscriptionRateLimitWindowPolicy
        >
      >;
    }>;

export type RubyWhisperTranscriptionRateLimitInput = Readonly<{
  clerkUserId?: string | null;
  now?: Date | number | string;
  planState?: RubyWhisperUsagePlanState | string | null;
  policy?: RubyWhisperTranscriptionRateLimitPolicy;
  requestCount?: unknown;
  windowStart?: Date | number | string | null;
}>;

export type RubyWhisperTranscriptionRateLimitMetadata = Readonly<{
  limit: number;
  requestCount: number;
  retryAfterSeconds?: number;
  windowEnd: string;
  windowStart: string;
}>;

export type RubyWhisperTranscriptionRateLimitState = Readonly<{
  clerkUserId: string;
  requestCount: number;
  windowStart: string;
}>;

export type RubyWhisperTranscriptionRateLimitAllowedResult = Readonly<{
  apiErrorMetadata?: never;
  errorCode?: never;
  metadata: RubyWhisperTranscriptionRateLimitMetadata;
  ok: true;
  state: RubyWhisperTranscriptionRateLimitState;
  status: "allowed";
}>;

export type RubyWhisperTranscriptionRateLimitDeniedResult = Readonly<{
  apiErrorMetadata: RubyWhisperApiErrorMetadata;
  errorCode: "rate_limited";
  metadata: RubyWhisperTranscriptionRateLimitMetadata;
  ok: false;
  state: RubyWhisperTranscriptionRateLimitState;
  status: "rate_limited";
}>;

export type RubyWhisperTranscriptionRateLimitInvalidResult = Readonly<{
  apiErrorMetadata?: never;
  errorCode: "signed_out";
  metadata?: never;
  ok: false;
  state?: never;
  status: "invalid_user";
}>;

export type RubyWhisperTranscriptionRateLimitResult =
  | RubyWhisperTranscriptionRateLimitAllowedResult
  | RubyWhisperTranscriptionRateLimitDeniedResult
  | RubyWhisperTranscriptionRateLimitInvalidResult;

export function evaluateRubyWhisperTranscriptionRateLimit(
  input: RubyWhisperTranscriptionRateLimitInput,
): RubyWhisperTranscriptionRateLimitResult {
  const clerkUserId = normalizeClerkUserId(input.clerkUserId);

  if (!clerkUserId) {
    return {
      errorCode: "signed_out",
      ok: false,
      status: "invalid_user",
    };
  }

  const nowMs = normalizeTimestampMs(input.now, Date.now());
  const policy = policyForPlanState(input.policy, input.planState);
  const windowMs = policy.windowSeconds * 1_000;
  const requestedWindowStartMs = normalizeTimestampMs(input.windowStart, nowMs);
  const windowStartMs =
    nowMs >= requestedWindowStartMs + windowMs ? nowMs : requestedWindowStartMs;
  const requestCount =
    windowStartMs === nowMs ? 0 : normalizeRequestCount(input.requestCount);
  const windowEndMs = windowStartMs + windowMs;

  if (requestCount >= policy.limit) {
    const metadata = rateLimitMetadata({
      limit: policy.limit,
      requestCount,
      retryAfterSeconds: secondsUntil(windowEndMs, nowMs),
      windowEndMs,
      windowStartMs,
    });
    const state = rateLimitState(clerkUserId, requestCount, windowStartMs);

    return {
      apiErrorMetadata: metadata,
      errorCode: "rate_limited",
      metadata,
      ok: false,
      state,
      status: "rate_limited",
    };
  }

  const nextRequestCount = requestCount + 1;

  return {
    metadata: rateLimitMetadata({
      limit: policy.limit,
      requestCount: nextRequestCount,
      windowEndMs,
      windowStartMs,
    }),
    ok: true,
    state: rateLimitState(clerkUserId, nextRequestCount, windowStartMs),
    status: "allowed",
  };
}

function policyForPlanState(
  policyInput: RubyWhisperTranscriptionRateLimitPolicy | undefined,
  planState: RubyWhisperTranscriptionRateLimitInput["planState"],
): RubyWhisperTranscriptionRateLimitWindowPolicy {
  const policy = policyInput ?? rubyWhisperDefaultTranscriptionRateLimitPolicy;
  const override =
    planState && isRubyWhisperUsagePlanState(planState)
      ? policy.planOverrides?.[planState]
      : undefined;

  return normalizeWindowPolicy(override ?? policy);
}

function normalizeWindowPolicy(
  policy: RubyWhisperTranscriptionRateLimitWindowPolicy,
): RubyWhisperTranscriptionRateLimitWindowPolicy {
  const limit = normalizePositiveInteger(policy.limit);
  const windowSeconds = normalizePositiveInteger(policy.windowSeconds);

  return {
    limit: limit > 0 ? limit : rubyWhisperDefaultTranscriptionRateLimitPolicy.limit,
    windowSeconds:
      windowSeconds > 0
        ? windowSeconds
        : rubyWhisperDefaultTranscriptionRateLimitPolicy.windowSeconds,
  };
}

function normalizeClerkUserId(value: string | null | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0 || trimmedValue.length > 128) {
    return undefined;
  }

  return trimmedValue;
}

function normalizeRequestCount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function normalizePositiveInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeTimestampMs(
  value: Date | number | string | null | undefined,
  fallbackMs: number,
) {
  if (value instanceof Date) {
    const dateMs = value.getTime();

    return Number.isFinite(dateMs) ? dateMs : fallbackMs;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallbackMs;
  }

  if (typeof value === "string") {
    const dateMs = new Date(value).getTime();

    return Number.isFinite(dateMs) ? dateMs : fallbackMs;
  }

  return fallbackMs;
}

function rateLimitMetadata(input: {
  limit: number;
  requestCount: number;
  retryAfterSeconds?: number;
  windowEndMs: number;
  windowStartMs: number;
}): RubyWhisperTranscriptionRateLimitMetadata {
  return {
    limit: input.limit,
    requestCount: input.requestCount,
    ...(typeof input.retryAfterSeconds === "number"
      ? { retryAfterSeconds: input.retryAfterSeconds }
      : {}),
    windowEnd: new Date(input.windowEndMs).toISOString(),
    windowStart: new Date(input.windowStartMs).toISOString(),
  };
}

function rateLimitState(
  clerkUserId: string,
  requestCount: number,
  windowStartMs: number,
): RubyWhisperTranscriptionRateLimitState {
  return {
    clerkUserId,
    requestCount,
    windowStart: new Date(windowStartMs).toISOString(),
  };
}

function secondsUntil(windowEndMs: number, nowMs: number) {
  return Math.max(1, Math.ceil((windowEndMs - nowMs) / 1_000));
}

function isRubyWhisperUsagePlanState(
  value: string,
): value is RubyWhisperUsagePlanState {
  return (
    value === "trial_active" ||
    value === "trial_exhausted" ||
    value === "paid_active" ||
    value === "friend_of_ruby_active" ||
    value === "payment_failed" ||
    value === "blocked" ||
    value === "subscription_required"
  );
}

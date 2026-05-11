import "server-only";

export const rubyWhisperApiErrorCodes = [
  "signed_out",
  "admin_forbidden",
  "terms_required",
  "trial_exhausted",
  "subscription_required",
  "payment_failed",
  "account_blocked",
  "rate_limited",
  "duration_limit_reached",
  "invalid_audio",
  "provider_error",
  "network_error",
  "service_unavailable",
  "internal_error",
] as const;

export type RubyWhisperApiErrorCode = (typeof rubyWhisperApiErrorCodes)[number];

export const rubyWhisperApiErrorMetadataKeys = [
  "planState",
  "trialWordsRemaining",
  "trialWordsLimit",
  "monthlyWordsRemaining",
  "requestCount",
  "retryAfterSeconds",
  "windowStart",
  "windowEnd",
  "limit",
  "durationLimitMs",
  "audioDurationMs",
  "appVersion",
  "osVersion",
  "provider",
  "providerLatencyMs",
  "totalLatencyMs",
  "traceReason",
] as const;

export type RubyWhisperApiErrorMetadataKey =
  (typeof rubyWhisperApiErrorMetadataKeys)[number];

export type RubyWhisperApiErrorMetadata = Partial<
  Record<RubyWhisperApiErrorMetadataKey, string | number | boolean>
>;

export type RubyWhisperApiErrorRecovery =
  | "open_sign_in"
  | "open_terms_acceptance"
  | "open_checkout"
  | "open_billing"
  | "open_account"
  | "retry_after"
  | "start_new_whisper"
  | "record_again"
  | "retry"
  | "retry_or_contact_support";

export type RubyWhisperApiErrorDesktopState =
  | "signed_out"
  | "signed_in_terms_required"
  | "trial_exhausted"
  | "payment_failed"
  | "blocked"
  | "duration_limit_reached"
  | "provider_error"
  | "network_error"
  | "error";

export type RubyWhisperApiErrorDescriptor = {
  readonly code: RubyWhisperApiErrorCode;
  readonly desktopState: RubyWhisperApiErrorDesktopState;
  readonly httpStatus: number;
  readonly message: string;
  readonly recovery: RubyWhisperApiErrorRecovery;
  readonly retryable: boolean;
};

export type RubyWhisperApiErrorPayload = {
  ok: false;
  requestId?: string;
  error: {
    code: RubyWhisperApiErrorCode;
    desktopState: RubyWhisperApiErrorDesktopState;
    message: string;
    recovery: RubyWhisperApiErrorRecovery;
    retryable: boolean;
  };
  metadata?: RubyWhisperApiErrorMetadata;
};

export type RubyWhisperApiErrorOptions = {
  metadata?: Record<string, unknown>;
  requestId?: string;
};

export const rubyWhisperApiErrorDescriptors = {
  signed_out: {
    code: "signed_out",
    desktopState: "signed_out",
    httpStatus: 401,
    message: "Sign in to use RubyWhisper.",
    recovery: "open_sign_in",
    retryable: false,
  },
  terms_required: {
    code: "terms_required",
    desktopState: "signed_in_terms_required",
    httpStatus: 403,
    message: "Accept Terms and Privacy to start dictating.",
    recovery: "open_terms_acceptance",
    retryable: false,
  },
  admin_forbidden: {
    code: "admin_forbidden",
    desktopState: "blocked",
    httpStatus: 403,
    message: "This account is not a RubyWhisper admin.",
    recovery: "open_account",
    retryable: false,
  },
  trial_exhausted: {
    code: "trial_exhausted",
    desktopState: "trial_exhausted",
    httpStatus: 402,
    message: "Upgrade to keep using RubyWhisper.",
    recovery: "open_checkout",
    retryable: false,
  },
  subscription_required: {
    code: "subscription_required",
    desktopState: "trial_exhausted",
    httpStatus: 402,
    message: "Choose a plan to keep dictating.",
    recovery: "open_checkout",
    retryable: false,
  },
  payment_failed: {
    code: "payment_failed",
    desktopState: "payment_failed",
    httpStatus: 402,
    message: "Update billing to continue.",
    recovery: "open_billing",
    retryable: false,
  },
  account_blocked: {
    code: "account_blocked",
    desktopState: "blocked",
    httpStatus: 403,
    message: "This account cannot dictate right now.",
    recovery: "open_account",
    retryable: false,
  },
  rate_limited: {
    code: "rate_limited",
    desktopState: "error",
    httpStatus: 429,
    message: "Too many requests. Try again soon.",
    recovery: "retry_after",
    retryable: true,
  },
  duration_limit_reached: {
    code: "duration_limit_reached",
    desktopState: "duration_limit_reached",
    httpStatus: 413,
    message: "Recordings are limited to 10 minutes.",
    recovery: "start_new_whisper",
    retryable: false,
  },
  invalid_audio: {
    code: "invalid_audio",
    desktopState: "error",
    httpStatus: 422,
    message: "RubyWhisper could not read that audio.",
    recovery: "record_again",
    retryable: false,
  },
  provider_error: {
    code: "provider_error",
    desktopState: "provider_error",
    httpStatus: 503,
    message: "RubyWhisper could not transcribe right now.",
    recovery: "retry",
    retryable: true,
  },
  network_error: {
    code: "network_error",
    desktopState: "network_error",
    httpStatus: 503,
    message: "Check your internet connection and try again.",
    recovery: "retry",
    retryable: true,
  },
  service_unavailable: {
    code: "service_unavailable",
    desktopState: "error",
    httpStatus: 503,
    message: "RubyWhisper is temporarily unavailable.",
    recovery: "retry",
    retryable: true,
  },
  internal_error: {
    code: "internal_error",
    desktopState: "error",
    httpStatus: 500,
    message: "Something went wrong. Try again.",
    recovery: "retry_or_contact_support",
    retryable: true,
  },
} satisfies Record<RubyWhisperApiErrorCode, RubyWhisperApiErrorDescriptor>;

const metadataKeySet = new Set<string>(rubyWhisperApiErrorMetadataKeys);
const credentialLikeMetadataValuePatterns = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
  /\bwhsec_[A-Za-z0-9]{16,}\b/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /[?&](?:jwt|session|ticket|token)=/i,
];

export function createRubyWhisperApiErrorPayload(
  code: RubyWhisperApiErrorCode,
  options: RubyWhisperApiErrorOptions = {},
): RubyWhisperApiErrorPayload {
  const descriptor = rubyWhisperApiErrorDescriptors[code];
  const requestId = normalizeOptionalString(options.requestId);
  const metadata = sanitizeRubyWhisperApiErrorMetadata(options.metadata);

  return {
    ok: false,
    ...(requestId ? { requestId } : {}),
    error: {
      code: descriptor.code,
      desktopState: descriptor.desktopState,
      message: descriptor.message,
      recovery: descriptor.recovery,
      retryable: descriptor.retryable,
    },
    ...(metadata ? { metadata } : {}),
  };
}

export function rubyWhisperApiErrorResponse(
  code: RubyWhisperApiErrorCode,
  options: RubyWhisperApiErrorOptions = {},
): Response {
  const descriptor = rubyWhisperApiErrorDescriptors[code];
  console.error("API_ERROR_TRACE", {
    code,
    httpStatus: descriptor.httpStatus,
    stack: new Error().stack?.split("\n").slice(1, 6).join(" | "),
  });
  const payload = createRubyWhisperApiErrorPayload(code, options);
  const headers = new Headers({
    "Cache-Control": "no-store",
  });
  const retryAfterSeconds = payload.metadata?.retryAfterSeconds;

  if (typeof retryAfterSeconds === "number" && retryAfterSeconds > 0) {
    headers.set("Retry-After", String(Math.ceil(retryAfterSeconds)));
  }

  return Response.json(payload, {
    headers,
    status: descriptor.httpStatus,
  });
}

export function sanitizeRubyWhisperApiErrorMetadata(
  metadata: Record<string, unknown> | undefined,
): RubyWhisperApiErrorMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const sanitized: RubyWhisperApiErrorMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (!metadataKeySet.has(key)) {
      continue;
    }

    if (!isSafeMetadataValue(value)) {
      continue;
    }

    sanitized[key as RubyWhisperApiErrorMetadataKey] = value;
  }

  if (Object.keys(sanitized).length === 0) {
    return undefined;
  }

  return sanitized;
}

function normalizeOptionalString(value: string | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0 || trimmedValue.length > 128) {
    return undefined;
  }

  if (credentialLikeMetadataValuePatterns.some((pattern) => pattern.test(trimmedValue))) {
    return undefined;
  }

  return trimmedValue;
}

function isSafeMetadataValue(value: unknown): value is string | number | boolean {
  if (typeof value === "string") {
    return (
      value.length <= 256 &&
      !credentialLikeMetadataValuePatterns.some((pattern) => pattern.test(value))
    );
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return typeof value === "boolean";
}

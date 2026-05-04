import "server-only";

export const rubyWhisperPrivacyLogMetadataKeys = [
  "requestId",
  "accountId",
  "userId",
  "planState",
  "durationMs",
  "wordCount",
  "latencyMs",
  "provider",
  "appVersion",
  "osVersion",
  "route",
  "method",
  "status",
  "errorCode",
  "trialWordsRemaining",
  "trialWordsLimit",
  "monthlyWordsRemaining",
  "retryAfterSeconds",
  "durationLimitMs",
  "audioDurationMs",
  "providerLatencyMs",
  "totalLatencyMs",
] as const;

export type RubyWhisperPrivacyLogMetadataKey =
  (typeof rubyWhisperPrivacyLogMetadataKeys)[number];

export type RubyWhisperPrivacyLogMetadataValue = string | number;

export type RubyWhisperPrivacyLogMetadata = Partial<
  Record<RubyWhisperPrivacyLogMetadataKey, RubyWhisperPrivacyLogMetadataValue>
>;

export type RubyWhisperPrivacyLogMetadataInput =
  | Record<string, unknown>
  | null
  | undefined;

export const rubyWhisperPrivacyLogErrorCodes = [
  "signed_out",
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

const metadataKeySet = new Set<string>(rubyWhisperPrivacyLogMetadataKeys);
const stringMetadataKeys = new Set<string>([
  "requestId",
  "accountId",
  "userId",
  "planState",
  "provider",
  "appVersion",
  "osVersion",
  "route",
]);
const numberMetadataKeys = new Set<string>([
  "durationMs",
  "wordCount",
  "latencyMs",
  "status",
  "trialWordsRemaining",
  "trialWordsLimit",
  "monthlyWordsRemaining",
  "retryAfterSeconds",
  "durationLimitMs",
  "audioDurationMs",
  "providerLatencyMs",
  "totalLatencyMs",
]);
const methodValues = new Set(["DELETE", "GET", "PATCH", "POST", "PUT"]);
const errorCodeValues = new Set<string>(rubyWhisperPrivacyLogErrorCodes);

const maxStringMetadataLength = 128;
const credentialLikeMetadataValuePatterns = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
  /\bwhsec_[A-Za-z0-9]{16,}\b/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /[?&](?:auth|jwt|key|secret|session|ticket|token)=/i,
  /\b(?:api[_-]?key|authorization|password|secret|token)=\S{8,}/i,
];

export function createRubyWhisperPrivacyLogMetadata(
  input: RubyWhisperPrivacyLogMetadataInput,
): RubyWhisperPrivacyLogMetadata {
  return sanitizeRubyWhisperPrivacyLogMetadata(input) ?? {};
}

export function sanitizeRubyWhisperPrivacyLogMetadata(
  input: RubyWhisperPrivacyLogMetadataInput,
): RubyWhisperPrivacyLogMetadata | undefined {
  if (!input) {
    return undefined;
  }

  const sanitized: RubyWhisperPrivacyLogMetadata = {};

  for (const [key, value] of Object.entries(input)) {
    if (!metadataKeySet.has(key)) {
      continue;
    }

    const sanitizedValue = sanitizeMetadataValue(key, value);

    if (sanitizedValue === undefined) {
      continue;
    }

    sanitized[key as RubyWhisperPrivacyLogMetadataKey] = sanitizedValue;
  }

  if (Object.keys(sanitized).length === 0) {
    return undefined;
  }

  return sanitized;
}

function sanitizeMetadataValue(
  key: string,
  value: unknown,
): RubyWhisperPrivacyLogMetadataValue | undefined {
  if (key === "method") {
    return sanitizeMethod(value);
  }

  if (key === "errorCode") {
    return sanitizeErrorCode(value);
  }

  if (stringMetadataKeys.has(key)) {
    return sanitizeStringMetadataValue(key, value);
  }

  if (numberMetadataKeys.has(key)) {
    return sanitizeNumberMetadataValue(key, value);
  }

  return undefined;
}

function sanitizeMethod(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const method = value.trim().toUpperCase();

  if (!methodValues.has(method)) {
    return undefined;
  }

  return method;
}

function sanitizeErrorCode(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const errorCode = value.trim();

  if (!errorCodeValues.has(errorCode)) {
    return undefined;
  }

  return errorCode;
}

function sanitizeStringMetadataValue(key: string, value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0 || trimmedValue.length > maxStringMetadataLength) {
    return undefined;
  }

  if (credentialLikeMetadataValuePatterns.some((pattern) => pattern.test(trimmedValue))) {
    return undefined;
  }

  if (key === "route" && /[?#]/.test(trimmedValue)) {
    return undefined;
  }

  return trimmedValue;
}

function sanitizeNumberMetadataValue(key: string, value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  if (value < 0) {
    return undefined;
  }

  if (key === "status" && (!Number.isInteger(value) || value < 100 || value > 599)) {
    return undefined;
  }

  if (key === "wordCount" && !Number.isInteger(value)) {
    return undefined;
  }

  return value;
}

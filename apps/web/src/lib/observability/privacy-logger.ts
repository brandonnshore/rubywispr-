import "server-only";

export const rubyWhisperPrivacyLogMetadataKeys = [
  "requestId",
  "route",
  "method",
  "status",
  "accountId",
  "userId",
  "planState",
  "durationMs",
  "audioDurationMs",
  "wordCount",
  "cleanedWordCount",
  "latencyMs",
  "provider",
  "providerLatencyMs",
  "totalLatencyMs",
  "appVersion",
  "osVersion",
  "errorCode",
] as const;

export type RubyWhisperPrivacyLogMetadataKey =
  (typeof rubyWhisperPrivacyLogMetadataKeys)[number];

export type RubyWhisperPrivacyLogMetadata = Partial<
  Record<RubyWhisperPrivacyLogMetadataKey, string | number | boolean>
>;

export type RubyWhisperPrivacyLogEvent = {
  event: string;
  metadata?: RubyWhisperPrivacyLogMetadata;
};

export type RubyWhisperPrivacyLogEventOptions = {
  metadata?: Record<string, unknown>;
};

export const rubyWhisperBackendRequestLogEventNames = [
  "backend.request.started",
  "backend.request.succeeded",
  "backend.request.failed",
] as const;

export type RubyWhisperBackendRequestLogEventName =
  (typeof rubyWhisperBackendRequestLogEventNames)[number];

export type RubyWhisperBackendRequestLogInput = Partial<
  Record<RubyWhisperPrivacyLogMetadataKey, unknown>
> & {
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

const metadataKeySet = new Set<string>(rubyWhisperPrivacyLogMetadataKeys);
const maxEventNameLength = 80;
const maxMetadataStringLength = 128;
const credentialLikeValuePatterns = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{20,}\b/,
  /\bwhsec_[A-Za-z0-9_-]{16,}\b/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /[?&](?:jwt|session|ticket|token)=/i,
  /\b(?:CLERK_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|GROQ_API_KEY)\b/,
  /(?:^|[/\\])(?:\.env\.local|rubywhisper\.env)\b/i,
];

export function sanitizeRubyWhisperPrivacyLogMetadata(
  metadata: Record<string, unknown> | undefined,
): RubyWhisperPrivacyLogMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const sanitized: RubyWhisperPrivacyLogMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    const sanitizedValue = sanitizeMetadataValue(value);

    if (!metadataKeySet.has(key) || sanitizedValue === undefined) {
      continue;
    }

    sanitized[key as RubyWhisperPrivacyLogMetadataKey] = sanitizedValue;
  }

  if (Object.keys(sanitized).length === 0) {
    return undefined;
  }

  return sanitized;
}

export function createRubyWhisperPrivacyLogEvent(
  event: string,
  options: RubyWhisperPrivacyLogEventOptions = {},
): RubyWhisperPrivacyLogEvent | undefined {
  const eventName = normalizeLogEventName(event);

  if (!eventName) {
    return undefined;
  }

  const metadata = sanitizeRubyWhisperPrivacyLogMetadata(options.metadata);

  return {
    event: eventName,
    ...(metadata ? { metadata } : {}),
  };
}

export function createRubyWhisperBackendRequestStartedLogEvent(
  input: RubyWhisperBackendRequestLogInput = {},
) {
  return createBackendRequestLogEvent("backend.request.started", input);
}

export function createRubyWhisperBackendRequestSucceededLogEvent(
  input: RubyWhisperBackendRequestLogInput = {},
) {
  return createBackendRequestLogEvent("backend.request.succeeded", input);
}

export function createRubyWhisperBackendRequestFailedLogEvent(
  input: RubyWhisperBackendRequestLogInput = {},
) {
  return createBackendRequestLogEvent("backend.request.failed", input);
}

function createBackendRequestLogEvent(
  event: RubyWhisperBackendRequestLogEventName,
  input: RubyWhisperBackendRequestLogInput,
): RubyWhisperPrivacyLogEvent {
  const logEvent = createRubyWhisperPrivacyLogEvent(event, {
    metadata: collectBackendRequestMetadataInput(input),
  });

  return logEvent ?? { event };
}

function collectBackendRequestMetadataInput(
  input: RubyWhisperBackendRequestLogInput,
) {
  const metadataInput: Record<string, unknown> =
    isRecord(input.metadata) ? { ...input.metadata } : {};

  for (const key of rubyWhisperPrivacyLogMetadataKeys) {
    if (Object.hasOwn(input, key)) {
      metadataInput[key] = input[key];
    }
  }

  return metadataInput;
}

function normalizeLogEventName(event: string) {
  const trimmedEvent = event.trim();

  if (trimmedEvent.length === 0 || trimmedEvent.length > maxEventNameLength) {
    return undefined;
  }

  if (!/^[a-z][a-z0-9_.:-]*$/.test(trimmedEvent)) {
    return undefined;
  }

  if (credentialLikeValuePatterns.some((pattern) => pattern.test(trimmedEvent))) {
    return undefined;
  }

  return trimmedEvent;
}

function sanitizeMetadataValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (
      trimmedValue.length === 0 ||
      trimmedValue.length > maxMetadataStringLength ||
      credentialLikeValuePatterns.some((pattern) => pattern.test(trimmedValue))
    ) {
      return undefined;
    }

    return trimmedValue;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import "server-only";

import type { RubyWhisperApiErrorCode } from "@/lib/api/errors";

export const rubyWhisperProviderNames = ["groq", "mock_provider"] as const;

export type RubyWhisperProviderName = (typeof rubyWhisperProviderNames)[number];

export const rubyWhisperProviderOperations = [
  "cleanup",
  "transcription",
] as const;

export type RubyWhisperProviderOperation =
  (typeof rubyWhisperProviderOperations)[number];

export const rubyWhisperProviderErrorCodes = [
  "invalid_request",
  "missing_config",
  "network_error",
  "provider_auth_failed",
  "provider_invalid_response",
  "provider_rate_limited",
  "provider_timeout",
  "provider_unavailable",
  "unknown_provider_error",
] as const;

export type RubyWhisperProviderErrorCode =
  (typeof rubyWhisperProviderErrorCodes)[number];

export const rubyWhisperProviderErrorMetadataKeys = [
  "audioDurationMs",
  "provider",
  "providerLatencyMs",
  "retryAfterSeconds",
  "totalLatencyMs",
] as const;

export type RubyWhisperProviderErrorMetadataKey =
  (typeof rubyWhisperProviderErrorMetadataKeys)[number];

export type RubyWhisperProviderErrorMetadata = Partial<
  Record<RubyWhisperProviderErrorMetadataKey, string | number | boolean>
>;

export type RubyWhisperProviderErrorDescriptor = Readonly<{
  apiErrorCode: RubyWhisperApiErrorCode;
  code: RubyWhisperProviderErrorCode;
  message: string;
  retryable: boolean;
}>;

export type RubyWhisperProviderError = Readonly<{
  apiErrorCode: RubyWhisperApiErrorCode;
  code: RubyWhisperProviderErrorCode;
  message: string;
  retryable: boolean;
}>;

export type RubyWhisperProviderErrorOptions = Readonly<{
  metadata?: Record<string, unknown>;
  provider?: RubyWhisperProviderName;
}>;

export type RubyWhisperProviderFailure = Readonly<{
  error: RubyWhisperProviderError;
  metadata?: RubyWhisperProviderErrorMetadata;
  ok: false;
}>;

export type RubyWhisperProviderSuccess<T> = Readonly<{
  ok: true;
  result: T;
}>;

export type RubyWhisperProviderResult<T> =
  | RubyWhisperProviderSuccess<T>
  | RubyWhisperProviderFailure;

export type RubyWhisperProviderAudioInput =
  | ArrayBuffer
  | Blob
  | Uint8Array;

export type RubyWhisperProviderTranscriptionInput = Readonly<{
  audio: RubyWhisperProviderAudioInput;
  audioDurationMs?: number;
  audioMimeType: string;
  language?: string;
  model?: string;
  requestId?: string;
}>;

export type RubyWhisperProviderTranscriptionResult = Readonly<{
  audioDurationMs?: number;
  provider: RubyWhisperProviderName;
  providerLatencyMs?: number;
  text: string;
}>;

export type RubyWhisperProviderCleanupInput = Readonly<{
  cleanupEnabled: boolean;
  context?: string;
  contextAwareCleanupEnabled?: boolean;
  dictionaryTerms?: readonly string[];
  model?: string;
  requestId?: string;
  transcriptText: string;
}>;

export type RubyWhisperProviderCleanupResult = Readonly<{
  cleanedText: string;
  provider: RubyWhisperProviderName;
  providerLatencyMs?: number;
}>;

export type RubyWhisperProviderHandler<TInput, TResult> = (
  input: TInput,
) =>
  | Promise<RubyWhisperProviderResult<TResult>>
  | RubyWhisperProviderResult<TResult>;

export type RubyWhisperProviderClient = Readonly<{
  cleanup: RubyWhisperProviderHandler<
    RubyWhisperProviderCleanupInput,
    RubyWhisperProviderCleanupResult
  >;
  transcribe: RubyWhisperProviderHandler<
    RubyWhisperProviderTranscriptionInput,
    RubyWhisperProviderTranscriptionResult
  >;
}>;

export type RubyWhisperMockProviderHandlers = Readonly<{
  cleanup?: RubyWhisperProviderClient["cleanup"];
  transcribe?: RubyWhisperProviderClient["transcribe"];
}>;

export const rubyWhisperProviderErrorDescriptors = {
  invalid_request: {
    apiErrorCode: "invalid_audio",
    code: "invalid_request",
    message: "Provider request was invalid.",
    retryable: false,
  },
  missing_config: {
    apiErrorCode: "service_unavailable",
    code: "missing_config",
    message: "Provider configuration is unavailable.",
    retryable: false,
  },
  network_error: {
    apiErrorCode: "network_error",
    code: "network_error",
    message: "Provider network request failed.",
    retryable: true,
  },
  provider_auth_failed: {
    apiErrorCode: "service_unavailable",
    code: "provider_auth_failed",
    message: "Provider authentication failed.",
    retryable: false,
  },
  provider_invalid_response: {
    apiErrorCode: "provider_error",
    code: "provider_invalid_response",
    message: "Provider response was invalid.",
    retryable: true,
  },
  provider_rate_limited: {
    apiErrorCode: "rate_limited",
    code: "provider_rate_limited",
    message: "Provider rate limit was reached.",
    retryable: true,
  },
  provider_timeout: {
    apiErrorCode: "network_error",
    code: "provider_timeout",
    message: "Provider request timed out.",
    retryable: true,
  },
  provider_unavailable: {
    apiErrorCode: "provider_error",
    code: "provider_unavailable",
    message: "Provider is unavailable.",
    retryable: true,
  },
  unknown_provider_error: {
    apiErrorCode: "provider_error",
    code: "unknown_provider_error",
    message: "Provider request failed.",
    retryable: true,
  },
} satisfies Record<
  RubyWhisperProviderErrorCode,
  RubyWhisperProviderErrorDescriptor
>;

const metadataKeySet = new Set<string>(rubyWhisperProviderErrorMetadataKeys);
const credentialLikeProviderMetadataValuePatterns = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
  /\bwhsec_[A-Za-z0-9]{16,}\b/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /[?&](?:jwt|session|ticket|token)=/i,
];

export function createRubyWhisperProviderSuccess<T>(
  result: T,
): RubyWhisperProviderSuccess<T> {
  return {
    ok: true,
    result,
  };
}

export function createRubyWhisperProviderError(
  code: RubyWhisperProviderErrorCode,
  options: RubyWhisperProviderErrorOptions = {},
): RubyWhisperProviderFailure {
  const descriptor = rubyWhisperProviderErrorDescriptors[code];
  const metadata = sanitizeRubyWhisperProviderErrorMetadata({
    ...options.metadata,
    ...(options.provider ? { provider: options.provider } : {}),
  });

  return {
    error: {
      apiErrorCode: descriptor.apiErrorCode,
      code: descriptor.code,
      message: descriptor.message,
      retryable: descriptor.retryable,
    },
    ...(metadata ? { metadata } : {}),
    ok: false,
  };
}

export function sanitizeRubyWhisperProviderErrorMetadata(
  metadata: Record<string, unknown> | undefined,
): RubyWhisperProviderErrorMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const sanitized: RubyWhisperProviderErrorMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (!metadataKeySet.has(key) || !isSafeProviderMetadataValue(value)) {
      continue;
    }

    sanitized[key as RubyWhisperProviderErrorMetadataKey] = value;
  }

  if (Object.keys(sanitized).length === 0) {
    return undefined;
  }

  return sanitized;
}

export function createRubyWhisperMockProviderClient(
  handlers: RubyWhisperMockProviderHandlers = {},
): RubyWhisperProviderClient {
  return Object.freeze({
    cleanup: (input) =>
      invokeMockProviderHandler(
        handlers.cleanup,
        input,
      ),
    transcribe: (input) =>
      invokeMockProviderHandler(
        handlers.transcribe,
        input,
      ),
  });
}

function invokeMockProviderHandler<TInput, TResult>(
  handler: RubyWhisperProviderHandler<TInput, TResult> | undefined,
  input: TInput,
) {
  if (!handler) {
    return createRubyWhisperProviderError("provider_unavailable", {
      metadata: { provider: "mock_provider" },
      provider: "mock_provider",
    });
  }

  return handler(input);
}

function isSafeProviderMetadataValue(value: unknown): value is string | number | boolean {
  if (typeof value === "string") {
    return (
      value.length <= 256 &&
      !credentialLikeProviderMetadataValuePatterns.some((pattern) =>
        pattern.test(value),
      )
    );
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return typeof value === "boolean";
}

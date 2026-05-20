import "server-only";

import { serverEnv } from "@/config/server";
import {
  createRubyWhisperProviderError,
  createRubyWhisperProviderSuccess,
} from "@/lib/providers/client";
import type {
  RubyWhisperProviderErrorCode,
  RubyWhisperProviderFailure,
  RubyWhisperProviderResult,
} from "@/lib/providers/client";

export const rubyWhisperOpenAIRealtimeProviderName = "openai_realtime";
export const rubyWhisperOpenAIRealtimeTranscriptionModel =
  "gpt-realtime-whisper";
export const rubyWhisperOpenAIRealtimeClientSecretsEndpoint =
  "https://api.openai.com/v1/realtime/client_secrets";
export const rubyWhisperOpenAIRealtimeWebSocketURL =
  "wss://api.openai.com/v1/realtime?intent=transcription";

export type RubyWhisperOpenAIRealtimeFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type RubyWhisperOpenAIRealtimeClientSecretInput = Readonly<{
  language?: string;
  requestId?: string;
}>;

export type RubyWhisperOpenAIRealtimeClientSecretResult = Readonly<{
  clientSecret: string;
  expiresAt: number;
  provider: typeof rubyWhisperOpenAIRealtimeProviderName;
  providerLatencyMs?: number;
  webSocketURL: string;
}>;

export type RubyWhisperOpenAIRealtimeConfig = Readonly<{
  apiKey?: string;
  endpoint?: string;
  fetch?: RubyWhisperOpenAIRealtimeFetch;
  nowMs?: () => number;
  webSocketURL?: string;
}>;

type OpenAIRealtimeClientSecretResponse = Readonly<{
  value?: unknown;
  expires_at?: unknown;
}>;

export async function createRubyWhisperOpenAIRealtimeClientSecret(
  input: RubyWhisperOpenAIRealtimeClientSecretInput,
  config: RubyWhisperOpenAIRealtimeConfig = {},
): Promise<
  RubyWhisperProviderResult<RubyWhisperOpenAIRealtimeClientSecretResult>
> {
  const apiKey = normalizeOpenAIAPIKey(config.apiKey ?? serverEnv.openai.apiKey);

  if (!apiKey) {
    return createOpenAIRealtimeFailure("missing_config");
  }

  const fetchImplementation = config.fetch ?? fetch;
  const endpoint = config.endpoint ?? rubyWhisperOpenAIRealtimeClientSecretsEndpoint;
  const nowMs = config.nowMs ?? Date.now;
  const startedAtMs = nowMs();

  try {
    const response = await fetchImplementation(endpoint, {
      body: JSON.stringify(createOpenAIRealtimeClientSecretBody(input)),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const latencyMs = elapsedMs(nowMs, startedAtMs);

    if (!response.ok) {
      return createOpenAIRealtimeFailure(
        providerErrorCodeForOpenAIRealtimeStatus(response.status),
        {
          providerLatencyMs: latencyMs,
          retryAfterSeconds: retryAfterSecondsFromHeaders(response.headers),
          totalLatencyMs: latencyMs,
        },
      );
    }

    const payload = (await response.json()) as OpenAIRealtimeClientSecretResponse;
    const clientSecret = normalizeClientSecret(payload.value);
    const expiresAt = normalizeExpiresAt(payload.expires_at);

    if (!clientSecret || expiresAt === undefined) {
      return createOpenAIRealtimeFailure("provider_invalid_response", {
        providerLatencyMs: latencyMs,
        totalLatencyMs: latencyMs,
      });
    }

    return createRubyWhisperProviderSuccess({
      clientSecret,
      expiresAt,
      provider: rubyWhisperOpenAIRealtimeProviderName,
      ...(typeof latencyMs === "number" ? { providerLatencyMs: latencyMs } : {}),
      webSocketURL: config.webSocketURL ?? rubyWhisperOpenAIRealtimeWebSocketURL,
    });
  } catch {
    const latencyMs = elapsedMs(nowMs, startedAtMs);

    return createOpenAIRealtimeFailure("network_error", {
      providerLatencyMs: latencyMs,
      totalLatencyMs: latencyMs,
    });
  }
}

function createOpenAIRealtimeClientSecretBody(
  input: RubyWhisperOpenAIRealtimeClientSecretInput,
) {
  const language = normalizeLanguage(input.language);

  return {
    expires_after: {
      anchor: "created_at",
      seconds: 600,
    },
    session: {
      type: "transcription",
      audio: {
        input: {
          format: {
            type: "audio/pcm",
            rate: 24000,
          },
          transcription: {
            model: rubyWhisperOpenAIRealtimeTranscriptionModel,
            delay: "minimal",
            ...(language ? { language } : {}),
          },
          turn_detection: null,
        },
      },
    },
  };
}

function providerErrorCodeForOpenAIRealtimeStatus(
  status: number,
): RubyWhisperProviderErrorCode {
  if (status === 401 || status === 403) {
    return "provider_auth_failed";
  }

  if (status === 408 || status === 504) {
    return "provider_timeout";
  }

  if (status === 429) {
    return "provider_rate_limited";
  }

  if (status === 400 || status === 422) {
    return "invalid_request";
  }

  if (status >= 500) {
    return "provider_unavailable";
  }

  return "unknown_provider_error";
}

function createOpenAIRealtimeFailure(
  code: RubyWhisperProviderErrorCode,
  metadata: Record<string, unknown> = {},
): RubyWhisperProviderFailure {
  return createRubyWhisperProviderError(code, {
    metadata,
    provider: rubyWhisperOpenAIRealtimeProviderName,
  });
}

function normalizeOpenAIAPIKey(value: string | undefined) {
  const trimmedValue = value?.trim();

  return trimmedValue || undefined;
}

function normalizeClientSecret(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  return trimmedValue.startsWith("ek_") ? trimmedValue : undefined;
}

function normalizeExpiresAt(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.floor(value);
}

function normalizeLanguage(value: string | undefined) {
  const trimmedValue = value?.trim().toLowerCase();

  if (!trimmedValue) {
    return undefined;
  }

  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(trimmedValue)
    ? trimmedValue
    : undefined;
}

function retryAfterSecondsFromHeaders(headers: Headers) {
  const retryAfter = headers.get("Retry-After");

  if (!retryAfter) {
    return undefined;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds;
  }

  const retryDateMs = new Date(retryAfter).getTime();
  if (!Number.isFinite(retryDateMs)) {
    return undefined;
  }

  return Math.max(1, Math.ceil((retryDateMs - Date.now()) / 1_000));
}

function elapsedMs(nowMs: () => number, startedAtMs: number) {
  const elapsed = nowMs() - startedAtMs;

  return Number.isFinite(elapsed) && elapsed >= 0
    ? Math.floor(elapsed)
    : undefined;
}

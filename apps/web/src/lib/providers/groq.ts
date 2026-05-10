import "server-only";

import { serverEnv } from "@/config/server";
import {
  createRubyWhisperProviderError,
  createRubyWhisperProviderSuccess,
} from "@/lib/providers/client";
import type {
  RubyWhisperProviderClient,
  RubyWhisperProviderErrorCode,
  RubyWhisperProviderFailure,
  RubyWhisperProviderTranscriptionInput,
  RubyWhisperProviderTranscriptionResult,
} from "@/lib/providers/client";

export const rubyWhisperGroqProviderName = "groq";
export const rubyWhisperGroqTranscriptionModel = "whisper-large-v3-turbo";
export const rubyWhisperGroqTranscriptionEndpoint =
  "https://api.groq.com/openai/v1/audio/transcriptions";

export type RubyWhisperGroqFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type RubyWhisperGroqProviderConfig = Readonly<{
  apiKey?: string;
  endpoint?: string;
  fetch?: RubyWhisperGroqFetch;
  nowMs?: () => number;
}>;

type GroqTranscriptionResponse = Readonly<{
  text?: unknown;
}>;

export function createRubyWhisperGroqProviderClient(
  config: RubyWhisperGroqProviderConfig = {},
): RubyWhisperProviderClient {
  return Object.freeze({
    cleanup: () =>
      createRubyWhisperProviderError("provider_unavailable", {
        provider: rubyWhisperGroqProviderName,
      }),
    transcribe: (input) => transcribeWithGroq(input, config),
  });
}

async function transcribeWithGroq(
  input: RubyWhisperProviderTranscriptionInput,
  config: RubyWhisperGroqProviderConfig,
) {
  const apiKey = normalizeGroqApiKey(config.apiKey ?? serverEnv.groq.apiKey);

  if (!apiKey) {
    return createGroqTranscriptionFailure("missing_config", input);
  }

  const fetchImplementation = config.fetch ?? fetch;
  const endpoint = config.endpoint ?? rubyWhisperGroqTranscriptionEndpoint;
  const nowMs = config.nowMs ?? Date.now;
  const startedAtMs = nowMs();

  try {
    const response = await fetchImplementation(endpoint, {
      body: createGroqTranscriptionFormData(input),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      method: "POST",
    });
    const latencyMs = elapsedMs(nowMs, startedAtMs);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "(unreadable)");
      console.error("groq_transcription_failed", {
        status: response.status,
        statusText: response.statusText,
        body: errorBody.slice(0, 500),
        audioMimeType: input.audioMimeType,
        audioDurationMs: input.audioDurationMs,
        model: input.model,
      });
      return createGroqTranscriptionFailure(
        providerErrorCodeForGroqStatus(response.status),
        input,
        {
          providerLatencyMs: latencyMs,
          retryAfterSeconds: retryAfterSecondsFromHeaders(response.headers),
          totalLatencyMs: latencyMs,
        },
      );
    }

    const payload = (await response.json()) as GroqTranscriptionResponse;
    const text = normalizeGroqTranscriptionText(payload.text);

    if (!text) {
      return createGroqTranscriptionFailure(
        "provider_invalid_response",
        input,
        {
          providerLatencyMs: latencyMs,
          totalLatencyMs: latencyMs,
        },
      );
    }

    const result: RubyWhisperProviderTranscriptionResult = {
      ...(input.audioDurationMs ? { audioDurationMs: input.audioDurationMs } : {}),
      provider: rubyWhisperGroqProviderName,
      providerLatencyMs: latencyMs,
      text,
    };

    return createRubyWhisperProviderSuccess(result);
  } catch (error) {
    const latencyMs = elapsedMs(nowMs, startedAtMs);

    return createGroqTranscriptionFailure(
      error instanceof DOMException && error.name === "AbortError"
        ? "provider_timeout"
        : "network_error",
      input,
      {
        providerLatencyMs: latencyMs,
        totalLatencyMs: latencyMs,
      },
    );
  }
}

function createGroqTranscriptionFormData(
  input: RubyWhisperProviderTranscriptionInput,
) {
  const formData = new FormData();
  const audioBlob = normalizeGroqAudioBlob(input.audio, input.audioMimeType);

  formData.set("file", audioBlob, "rubywhisper-audio");
  formData.set("model", input.model ?? rubyWhisperGroqTranscriptionModel);
  formData.set("response_format", "json");

  if (input.language) {
    formData.set("language", input.language);
  }

  return formData;
}

function normalizeGroqAudioBlob(
  audio: RubyWhisperProviderTranscriptionInput["audio"],
  audioMimeType: string,
) {
  if (audio instanceof Blob) {
    return audio;
  }

  if (audio instanceof Uint8Array) {
    return new Blob([copyUint8ArrayToArrayBuffer(audio)], { type: audioMimeType });
  }

  return new Blob([audio], { type: audioMimeType });
}

function copyUint8ArrayToArrayBuffer(value: Uint8Array) {
  const buffer = new ArrayBuffer(value.byteLength);
  const bytes = new Uint8Array(buffer);

  bytes.set(value);

  return buffer;
}

function providerErrorCodeForGroqStatus(status: number): RubyWhisperProviderErrorCode {
  if (status === 401 || status === 403) {
    return "provider_auth_failed";
  }

  if (status === 408 || status === 504) {
    return "provider_timeout";
  }

  if (status === 429) {
    return "provider_rate_limited";
  }

  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return "invalid_request";
  }

  if (status >= 500) {
    return "provider_unavailable";
  }

  return "unknown_provider_error";
}

function createGroqTranscriptionFailure(
  code: RubyWhisperProviderErrorCode,
  input: RubyWhisperProviderTranscriptionInput,
  metadata: Record<string, unknown> = {},
): RubyWhisperProviderFailure {
  return createRubyWhisperProviderError(code, {
    metadata: {
      ...metadata,
      ...(input.audioDurationMs ? { audioDurationMs: input.audioDurationMs } : {}),
    },
    provider: rubyWhisperGroqProviderName,
  });
}

function normalizeGroqApiKey(value: string | undefined) {
  const trimmedValue = value?.trim();

  return trimmedValue || undefined;
}

function normalizeGroqTranscriptionText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();

  return text || undefined;
}

function retryAfterSecondsFromHeaders(headers: Headers) {
  const retryAfter = headers.get("Retry-After");

  if (!retryAfter) {
    return undefined;
  }

  const seconds = Number(retryAfter);

  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

function elapsedMs(nowMs: () => number, startedAtMs: number) {
  return Math.max(0, Math.round(nowMs() - startedAtMs));
}

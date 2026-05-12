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
  sleepMs?: (ms: number) => Promise<void>;
}>;

type GroqTranscriptionResponse = Readonly<{
  text?: unknown;
}>;

export function createRubyWhisperGroqProviderClient(
  config: RubyWhisperGroqProviderConfig = {},
): RubyWhisperProviderClient {
  return Object.freeze({
    cleanup: (input) =>
      createRubyWhisperProviderSuccess({
        cleanedText: input.transcriptText,
        provider: rubyWhisperGroqProviderName,
      }),
    transcribe: (input) => transcribeWithGroq(input, config),
  });
}

const GROQ_MAX_ATTEMPTS = 2;
const GROQ_ATTEMPT_TIMEOUT_MS = 12_000;
const GROQ_RETRY_BACKOFF_MS = 1_500;

async function transcribeWithGroq(
  input: RubyWhisperProviderTranscriptionInput,
  config: RubyWhisperGroqProviderConfig,
) {
  const apiKey = normalizeGroqApiKey(config.apiKey ?? serverEnv.groq.apiKey);
  console.error("GROQ_SENTINEL_2026_05_11_v2 groq_transcribe_entry", {
    apiKeyLength: apiKey ? apiKey.length : 0,
    apiKeyPrefix: apiKey ? apiKey.slice(0, 4) : "(empty)",
    audioMimeType: input.audioMimeType,
    audioDurationMs: input.audioDurationMs,
  });

  if (!apiKey) {
    return createGroqTranscriptionFailure("missing_config", input);
  }

  const fetchImplementation = config.fetch ?? fetch;
  const endpoint = config.endpoint ?? rubyWhisperGroqTranscriptionEndpoint;
  const nowMs = config.nowMs ?? Date.now;
  const sleep = config.sleepMs ?? sleepMs;
  const startedAtMs = nowMs();
  const formData = createGroqTranscriptionFormData(input);

  for (let attempt = 1; attempt <= GROQ_MAX_ATTEMPTS; attempt++) {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(
      () => abortController.abort(),
      GROQ_ATTEMPT_TIMEOUT_MS,
    );

    try {
      const response = await fetchImplementation(endpoint, {
        body: formData,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        method: "POST",
        signal: abortController.signal,
      });
      const latencyMs = elapsedMs(nowMs, startedAtMs);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "(unreadable)");
        console.error("groq_transcription_failed", {
          attempt,
          status: response.status,
          statusText: response.statusText,
          body: errorBody.slice(0, 500),
          audioMimeType: input.audioMimeType,
          audioDurationMs: input.audioDurationMs,
          model: input.model,
        });
        const failure = createGroqTranscriptionFailure(
          providerErrorCodeForGroqStatus(response.status),
          input,
          {
            providerLatencyMs: latencyMs,
            retryAfterSeconds: retryAfterSecondsFromHeaders(response.headers),
            totalLatencyMs: latencyMs,
          },
        );

        if (
          attempt < GROQ_MAX_ATTEMPTS &&
          isRetryableGroqStatus(response.status)
        ) {
          console.error("groq_retry_scheduled", {
            attempt,
            reason: `status_${response.status}`,
          });
          await sleep(GROQ_RETRY_BACKOFF_MS);
          continue;
        }

        return failure;
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

      if (attempt > 1) {
        console.error("groq_retry_succeeded", { attempt });
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
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      const errorCode = isAbort ? "provider_timeout" : "network_error";
      console.error("groq_transcription_threw", {
        attempt,
        name: error instanceof Error ? error.name : "unknown",
        message:
          error instanceof Error ? error.message.slice(0, 200) : "unknown",
        isAbort,
      });
      const failure = createGroqTranscriptionFailure(errorCode, input, {
        providerLatencyMs: latencyMs,
        totalLatencyMs: latencyMs,
      });

      if (attempt < GROQ_MAX_ATTEMPTS) {
        console.error("groq_retry_scheduled", { attempt, reason: errorCode });
        await sleepMs(GROQ_RETRY_BACKOFF_MS);
        continue;
      }

      return failure;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  throw new Error("transcribeWithGroq: exhausted retries without returning");
}

function isRetryableGroqStatus(status: number): boolean {
  if (status === 408) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const audioExtensionForMimeType: Record<string, string> = {
  "audio/flac": "flac",
  "audio/m4a": "m4a",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

function createGroqTranscriptionFormData(
  input: RubyWhisperProviderTranscriptionInput,
) {
  const formData = new FormData();
  const audioBlob = normalizeGroqAudioBlob(input.audio, input.audioMimeType);
  const extension = audioExtensionForMimeType[input.audioMimeType.toLowerCase()] ?? "wav";

  formData.set("file", audioBlob, `rubywhisper-audio.${extension}`);
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

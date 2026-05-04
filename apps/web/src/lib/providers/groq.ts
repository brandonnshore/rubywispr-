import "server-only";

import { serverEnv } from "@/config/server";

import {
  createRubyWhisperProviderError,
  createRubyWhisperProviderSuccess,
} from "./client";
import type {
  RubyWhisperProviderAudioInput,
  RubyWhisperProviderClient,
  RubyWhisperProviderErrorCode,
  RubyWhisperProviderErrorMetadata,
  RubyWhisperProviderResult,
  RubyWhisperProviderTranscriptionInput,
  RubyWhisperProviderTranscriptionResult,
} from "./client";

export const rubyWhisperGroqTranscriptionModelNames = [
  "whisper-large-v3-turbo",
] as const;

export type RubyWhisperGroqTranscriptionModelName =
  (typeof rubyWhisperGroqTranscriptionModelNames)[number];

type RubyWhisperGroqFetch = typeof fetch;

export type RubyWhisperGroqProviderClientOptions = Readonly<{
  apiKey?: string;
  baseUrl?: string;
  fetch?: RubyWhisperGroqFetch;
  now?: () => number;
  timeoutMs?: number;
}>;

type GroqTranscriptionResponse = Readonly<{
  text?: unknown;
}>;

const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_GROQ_TRANSCRIPTION_MODEL =
  "whisper-large-v3-turbo" satisfies RubyWhisperGroqTranscriptionModelName;
const DEFAULT_TIMEOUT_MS = 30_000;
const GROQ_TRANSCRIPTION_PATH = "/audio/transcriptions";
const GROQ_PROVIDER_NAME = "groq" as const;

const supportedGroqTranscriptionModelSet = new Set<string>(
  rubyWhisperGroqTranscriptionModelNames,
);

export function createRubyWhisperGroqProviderClient(
  options: RubyWhisperGroqProviderClientOptions = {},
): RubyWhisperProviderClient {
  return Object.freeze({
    cleanup: () =>
      createRubyWhisperProviderError("provider_unavailable", {
        provider: GROQ_PROVIDER_NAME,
      }),
    transcribe: (input) => transcribeWithGroq(input, options),
  });
}

async function transcribeWithGroq(
  input: RubyWhisperProviderTranscriptionInput,
  options: RubyWhisperGroqProviderClientOptions,
): Promise<RubyWhisperProviderResult<RubyWhisperProviderTranscriptionResult>> {
  const apiKey = options.apiKey ?? serverEnv.groq.apiKey;
  const now = options.now ?? Date.now;
  const startedAt = now();

  if (!apiKey) {
    return createGroqProviderError("missing_config");
  }

  const model = input.model ?? DEFAULT_GROQ_TRANSCRIPTION_MODEL;
  if (!supportedGroqTranscriptionModelSet.has(model)) {
    return createGroqProviderError("invalid_request", {
      audioDurationMs: input.audioDurationMs,
    });
  }

  const audio = createAudioBlob(input.audio, input.audioMimeType);
  if (!audio) {
    return createGroqProviderError("invalid_request", {
      audioDurationMs: input.audioDurationMs,
    });
  }

  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const abortController = new AbortController();
  let timeoutReached = false;
  const timeout = setTimeout(() => {
    timeoutReached = true;
    abortController.abort();
  }, timeoutMs);

  try {
    const formData = new FormData();
    formData.append("file", audio, createAudioFilename(input.audioMimeType));
    formData.append("model", model);
    formData.append("response_format", "json");

    if (input.language) {
      formData.append("language", input.language);
    }

    const response = await fetcher(createGroqTranscriptionUrl(options.baseUrl), {
      body: formData,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      method: "POST",
      signal: abortController.signal,
    });
    const providerLatencyMs = Math.max(0, now() - startedAt);

    if (!response.ok) {
      return createGroqProviderError(mapGroqStatusToProviderErrorCode(response.status), {
        audioDurationMs: input.audioDurationMs,
        providerLatencyMs,
        retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after")),
      });
    }

    const payload = await parseGroqTranscriptionResponse(response);
    if (!payload.ok) {
      return createGroqProviderError("provider_invalid_response", {
        audioDurationMs: input.audioDurationMs,
        providerLatencyMs,
      });
    }

    return createRubyWhisperProviderSuccess({
      ...(input.audioDurationMs === undefined
        ? {}
        : { audioDurationMs: input.audioDurationMs }),
      provider: GROQ_PROVIDER_NAME,
      providerLatencyMs,
      text: payload.text,
    });
  } catch (error) {
    const totalLatencyMs = Math.max(0, now() - startedAt);
    const code =
      timeoutReached || isAbortError(error) ? "provider_timeout" : "network_error";

    return createGroqProviderError(code, {
      audioDurationMs: input.audioDurationMs,
      totalLatencyMs,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function createGroqProviderError(
  code: RubyWhisperProviderErrorCode,
  metadata?: RubyWhisperProviderErrorMetadata,
) {
  return createRubyWhisperProviderError(code, {
    metadata,
    provider: GROQ_PROVIDER_NAME,
  });
}

function createAudioBlob(
  audio: RubyWhisperProviderAudioInput,
  audioMimeType: string,
): Blob | undefined {
  if (isBlob(audio)) {
    if (audio.size <= 0) {
      return undefined;
    }

    return audio.type ? audio : audio.slice(0, audio.size, audioMimeType);
  }

  if (audio.byteLength <= 0) {
    return undefined;
  }

  if (audio instanceof ArrayBuffer) {
    return new Blob([audio], { type: audioMimeType });
  }

  const audioCopy = new Uint8Array(audio.byteLength);
  audioCopy.set(audio);

  return new Blob([audioCopy.buffer], { type: audioMimeType });
}

function createAudioFilename(audioMimeType: string) {
  switch (audioMimeType.toLowerCase()) {
    case "audio/mp4":
    case "audio/m4a":
      return "rubywhisper-audio.m4a";
    case "audio/mpeg":
    case "audio/mp3":
      return "rubywhisper-audio.mp3";
    case "audio/webm":
      return "rubywhisper-audio.webm";
    case "audio/wav":
    case "audio/x-wav":
      return "rubywhisper-audio.wav";
    default:
      return "rubywhisper-audio";
  }
}

function createGroqTranscriptionUrl(baseUrl = DEFAULT_GROQ_BASE_URL) {
  return `${baseUrl.replace(/\/+$/, "")}${GROQ_TRANSCRIPTION_PATH}`;
}

function mapGroqStatusToProviderErrorCode(
  status: number,
): RubyWhisperProviderErrorCode {
  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return "invalid_request";
  }

  if (status === 401 || status === 403) {
    return "provider_auth_failed";
  }

  if (status === 408) {
    return "provider_timeout";
  }

  if (status === 429) {
    return "provider_rate_limited";
  }

  if (status >= 500 && status <= 599) {
    return "provider_unavailable";
  }

  return "unknown_provider_error";
}

async function parseGroqTranscriptionResponse(response: Response) {
  let payload: GroqTranscriptionResponse;

  try {
    payload = (await response.json()) as GroqTranscriptionResponse;
  } catch {
    return { ok: false } as const;
  }

  if (typeof payload?.text !== "string") {
    return { ok: false } as const;
  }

  return { ok: true, text: payload.text } as const;
}

function parseRetryAfterSeconds(retryAfter: string | null) {
  if (!retryAfter) {
    return undefined;
  }

  const numericRetryAfter = Number(retryAfter);
  if (Number.isFinite(numericRetryAfter) && numericRetryAfter >= 0) {
    return numericRetryAfter;
  }

  const retryAfterDate = Date.parse(retryAfter);
  if (!Number.isFinite(retryAfterDate)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((retryAfterDate - Date.now()) / 1000));
}

function isBlob(audio: RubyWhisperProviderAudioInput): audio is Blob {
  return typeof Blob !== "undefined" && audio instanceof Blob;
}

function isAbortError(error: unknown) {
  return (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "AbortError"
  );
}

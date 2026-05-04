import "server-only";

import type { RubyWhisperApiErrorCode } from "@/lib/api/errors";
import type { RubyWhisperProviderTranscriptionInput } from "@/lib/providers/client";

export const desktopTranscribeDurationLimitMs = 600_000;

export type DesktopTranscribeRequestMetadata = Readonly<{
  appVersion?: string;
  audioDurationMs: number;
  audioMimeType: string;
  cleanupEnabled: boolean;
  contextAwareCleanupEnabled: boolean;
  osVersion?: string;
}>;

export type DesktopTranscribeCleanupSettings = Readonly<{
  cleanupEnabled: boolean;
  context?: string;
  contextAwareCleanupEnabled: boolean;
  dictionaryTerms: readonly string[];
}>;

export type DesktopTranscribeRequestInput = Readonly<{
  cleanupSettings: DesktopTranscribeCleanupSettings;
  metadata: DesktopTranscribeRequestMetadata;
  providerInput: RubyWhisperProviderTranscriptionInput;
}>;

export type DesktopTranscribeRequestFailure = Readonly<{
  code: Extract<RubyWhisperApiErrorCode, "duration_limit_reached" | "invalid_audio">;
  metadata?: {
    audioDurationMs?: number;
    durationLimitMs?: number;
  };
  ok: false;
}>;

export type DesktopTranscribeRequestParseResult =
  | Readonly<{
      input: DesktopTranscribeRequestInput;
      ok: true;
    }>
  | DesktopTranscribeRequestFailure;

type RawDesktopTranscribeFields = {
  appVersion?: FormDataEntryValue | null;
  audioDurationMs?: FormDataEntryValue | null;
  audioMimeType?: FormDataEntryValue | null;
  cleanupEnabled?: FormDataEntryValue | null;
  context?: FormDataEntryValue | null;
  contextAwareCleanupEnabled?: FormDataEntryValue | null;
  dictionaryTerms?: FormDataEntryValue | null;
  repeatedDictionaryTerms?: FormDataEntryValue[];
  osVersion?: FormDataEntryValue | null;
};

const supportedBinaryContentTypes = new Set([
  "application/octet-stream",
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

const credentialLikeMetadataValuePatterns = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
  /\bwhsec_[A-Za-z0-9]{16,}\b/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /[?&](?:jwt|session|ticket|token)=/i,
];

export async function parseDesktopTranscribeRequest(
  request: Request,
): Promise<DesktopTranscribeRequestParseResult> {
  const contentType = normalizeMimeType(request.headers.get("content-type"));

  if (!contentType) {
    return invalidAudioFailure();
  }

  if (contentType === "multipart/form-data") {
    return parseMultipartDesktopTranscribeRequest(request);
  }

  if (isSupportedAudioMimeType(contentType)) {
    return parseBinaryDesktopTranscribeRequest(request, contentType);
  }

  return invalidAudioFailure();
}

async function parseMultipartDesktopTranscribeRequest(
  request: Request,
): Promise<DesktopTranscribeRequestParseResult> {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return invalidAudioFailure();
  }

  const audio = formData.get("audio");

  if (!(audio instanceof Blob) || audio.size <= 0) {
    return invalidAudioFailure();
  }

  const fields: RawDesktopTranscribeFields = {
    appVersion: formData.get("appVersion"),
    audioDurationMs: formData.get("audioDurationMs"),
    audioMimeType: formData.get("audioMimeType"),
    cleanupEnabled: formData.get("cleanupEnabled"),
    context: formData.get("context"),
    contextAwareCleanupEnabled: formData.get("contextAwareCleanupEnabled"),
    dictionaryTerms: formData.get("dictionaryTerms"),
    osVersion: formData.get("osVersion"),
    repeatedDictionaryTerms: formData.getAll("dictionaryTerms"),
  };
  const audioMimeType = normalizeMimeTypeEntry(fields.audioMimeType) ?? normalizeMimeType(audio.type);

  if (!audioMimeType || !isSupportedAudioMimeType(audioMimeType)) {
    return invalidAudioFailure();
  }

  return createDesktopTranscribeRequestInput({
    audio,
    audioMimeType,
    fields,
  });
}

async function parseBinaryDesktopTranscribeRequest(
  request: Request,
  audioMimeType: string,
): Promise<DesktopTranscribeRequestParseResult> {
  let audio: ArrayBuffer;

  try {
    audio = await request.arrayBuffer();
  } catch {
    return invalidAudioFailure();
  }

  if (audio.byteLength <= 0) {
    return invalidAudioFailure();
  }

  return createDesktopTranscribeRequestInput({
    audio,
    audioMimeType,
    fields: {
      appVersion: request.headers.get("x-rubywhisper-app-version"),
      audioDurationMs: request.headers.get("x-rubywhisper-audio-duration-ms"),
      cleanupEnabled: request.headers.get("x-rubywhisper-cleanup-enabled"),
      contextAwareCleanupEnabled: request.headers.get(
        "x-rubywhisper-context-aware-cleanup-enabled",
      ),
      osVersion: request.headers.get("x-rubywhisper-os-version"),
    },
  });
}

function createDesktopTranscribeRequestInput(options: {
  audio: Blob | ArrayBuffer;
  audioMimeType: string;
  fields: RawDesktopTranscribeFields;
}): DesktopTranscribeRequestParseResult {
  const audioDurationMs = normalizeDurationMs(options.fields.audioDurationMs);

  if (audioDurationMs === undefined) {
    return invalidAudioFailure();
  }

  if (audioDurationMs > desktopTranscribeDurationLimitMs) {
    return {
      code: "duration_limit_reached",
      metadata: {
        audioDurationMs,
        durationLimitMs: desktopTranscribeDurationLimitMs,
      },
      ok: false,
    };
  }

  const cleanupEnabled = normalizeBooleanEntry(
    options.fields.cleanupEnabled,
    true,
  );
  const contextAwareCleanupEnabled = normalizeBooleanEntry(
    options.fields.contextAwareCleanupEnabled,
    true,
  );
  const appVersion = normalizeSafeMetadataString(options.fields.appVersion);
  const context = normalizeTransientString(options.fields.context);
  const osVersion = normalizeSafeMetadataString(options.fields.osVersion);
  const metadata: DesktopTranscribeRequestMetadata = {
    ...(appVersion ? { appVersion } : {}),
    audioDurationMs,
    audioMimeType: options.audioMimeType,
    cleanupEnabled,
    contextAwareCleanupEnabled,
    ...(osVersion ? { osVersion } : {}),
  };
  const cleanupSettings: DesktopTranscribeCleanupSettings = {
    cleanupEnabled,
    ...(context ? { context } : {}),
    contextAwareCleanupEnabled,
    dictionaryTerms: normalizeDictionaryTerms(options.fields),
  };

  return {
    input: {
      cleanupSettings,
      metadata,
      providerInput: {
        audio: options.audio,
        audioDurationMs,
        audioMimeType: options.audioMimeType,
      },
    },
    ok: true,
  };
}

function invalidAudioFailure(metadata?: { audioDurationMs?: number }): DesktopTranscribeRequestFailure {
  return {
    code: "invalid_audio",
    ...(metadata ? { metadata } : {}),
    ok: false,
  };
}

function normalizeDurationMs(value: FormDataEntryValue | null | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (!/^\d+$/.test(trimmedValue)) {
    return undefined;
  }

  const durationMs = Number(trimmedValue);

  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    return undefined;
  }

  return durationMs;
}

function normalizeBooleanEntry(
  value: FormDataEntryValue | null | undefined,
  defaultValue = false,
) {
  if (typeof value !== "string") {
    return defaultValue;
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
      return true;
    case "0":
    case "false":
    case "no":
      return false;
    default:
      return defaultValue;
  }
}

function normalizeMimeTypeEntry(value: FormDataEntryValue | null | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  return normalizeMimeType(value);
}

function normalizeMimeType(value: string | null | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const [mimeType] = value.split(";");
  const normalizedMimeType = mimeType.trim().toLowerCase();

  return normalizedMimeType.length > 0 ? normalizedMimeType : undefined;
}

function isSupportedAudioMimeType(mimeType: string) {
  return mimeType.startsWith("audio/") || supportedBinaryContentTypes.has(mimeType);
}

function normalizeSafeMetadataString(value: FormDataEntryValue | null | undefined) {
  const normalizedValue = normalizeTransientString(value);

  if (!normalizedValue || normalizedValue.length > 128) {
    return undefined;
  }

  if (
    credentialLikeMetadataValuePatterns.some((pattern) =>
      pattern.test(normalizedValue),
    )
  ) {
    return undefined;
  }

  return normalizedValue;
}

function normalizeTransientString(value: FormDataEntryValue | null | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function normalizeDictionaryTerms(fields: RawDesktopTranscribeFields) {
  const repeatedTerms = fields.repeatedDictionaryTerms?.filter(
    (value) => typeof value === "string",
  ) as string[] | undefined;

  if (repeatedTerms && repeatedTerms.length > 1) {
    return normalizeDictionaryTermArray(repeatedTerms);
  }

  const dictionaryTerms = fields.dictionaryTerms;

  if (typeof dictionaryTerms !== "string") {
    return [];
  }

  const trimmedTerms = dictionaryTerms.trim();

  if (!trimmedTerms) {
    return [];
  }

  if (trimmedTerms.startsWith("[")) {
    try {
      const parsedTerms: unknown = JSON.parse(trimmedTerms);

      if (Array.isArray(parsedTerms)) {
        return normalizeDictionaryTermArray(parsedTerms);
      }
    } catch {
      return [];
    }
  }

  return normalizeDictionaryTermArray([trimmedTerms]);
}

function normalizeDictionaryTermArray(values: readonly unknown[]) {
  const terms: string[] = [];
  const seenTerms = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const term = value.trim();

    if (term.length === 0 || term.length > 80 || seenTerms.has(term)) {
      continue;
    }

    terms.push(term);
    seenTerms.add(term);

    if (terms.length >= 50) {
      break;
    }
  }

  return terms;
}

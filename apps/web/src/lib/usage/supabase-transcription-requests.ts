import "server-only";

import type { RubyWhisperApiErrorCode } from "@/lib/api/errors";
import type { RubyWhisperProviderName } from "@/lib/providers/client";
import {
  createSupabaseServiceRoleClient,
  type SupabaseServiceRoleClientFactory,
} from "@/lib/supabase/server";

import {
  normalizeRubyWhisperUsageWordCount,
  type RubyWhisperUsagePlanState,
} from "./quota";

export const supabaseTranscriptionRequestsTableName =
  "transcription_requests" as const;
export const supabaseTranscriptionRequestsColumns =
  "request_id,clerk_user_id,status,provider,plan_state,audio_duration_ms,cleaned_word_count,latency_ms,error_code,app_version,os_version,created_at" as const;

export type SupabaseTranscriptionRequestStatus = "success" | "failure";

export type SupabaseTranscriptionRequestInsert = Readonly<{
  clerk_user_id: string;
  created_at: string;
  plan_state: RubyWhisperUsagePlanState;
  provider: RubyWhisperProviderName;
  request_id: string;
  status: SupabaseTranscriptionRequestStatus;
  app_version?: string;
  audio_duration_ms?: number;
  cleaned_word_count?: number;
  error_code?: RubyWhisperApiErrorCode;
  latency_ms?: number;
  os_version?: string;
}>;

export type SupabaseTranscriptionRequestRow =
  SupabaseTranscriptionRequestInsert;

export type RubyWhisperTranscriptionRequestMetadataError = Readonly<{
  code:
    | "missing_transcription_request_metadata"
    | "supabase_transcription_request_write_failed";
  message: string;
}>;

export type RubyWhisperTranscriptionRequestMetadataFailure = Readonly<{
  error: RubyWhisperTranscriptionRequestMetadataError;
  ok: false;
  status: "missing_metadata" | "write_failed";
}>;

export type RubyWhisperTranscriptionRequestMetadataWriteResult =
  | Readonly<{
      action: "inserted";
      ok: true;
      request: SupabaseTranscriptionRequestInsert;
    }>
  | RubyWhisperTranscriptionRequestMetadataFailure;

export type WriteRubyWhisperTranscriptionRequestMetadataInput = Readonly<{
  clerkUserId?: string | null;
  planState?: RubyWhisperUsagePlanState | null;
  provider?: RubyWhisperProviderName | null;
  requestId?: string | null;
  status?: SupabaseTranscriptionRequestStatus | null;
  appVersion?: string | null;
  audioDurationMs?: unknown;
  cleanedWordCount?: unknown;
  errorCode?: RubyWhisperApiErrorCode | null;
  latencyMs?: unknown;
  now?: Date | string;
  osVersion?: string | null;
}>;

export type SupabaseTranscriptionRequestsInsertQuery = Readonly<{
  select: (
    columns: typeof supabaseTranscriptionRequestsColumns,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<Readonly<{
      data: SupabaseTranscriptionRequestRow | null;
      error: unknown | null;
    }>>;
  }>;
}>;

export type SupabaseTranscriptionRequestsTableQuery = Readonly<{
  insert: (
    requestMetadata: SupabaseTranscriptionRequestInsert,
  ) => SupabaseTranscriptionRequestsInsertQuery;
}>;

export type SupabaseTranscriptionRequestsClient = Readonly<{
  from: (
    tableName: typeof supabaseTranscriptionRequestsTableName,
  ) => SupabaseTranscriptionRequestsTableQuery;
}>;

export async function writeRubyWhisperTranscriptionRequestMetadata<
  Client extends SupabaseTranscriptionRequestsClient,
>(
  input: WriteRubyWhisperTranscriptionRequestMetadataInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<RubyWhisperTranscriptionRequestMetadataWriteResult> {
  const requestMetadata = prepareTranscriptionRequestMetadata(input);

  if (!requestMetadata) {
    return missingMetadataResult();
  }

  const client = createSupabaseServiceRoleClient(createClient);
  const { error } = await client
    .from(supabaseTranscriptionRequestsTableName)
    .insert(requestMetadata)
    .select(supabaseTranscriptionRequestsColumns)
    .maybeSingle();

  if (error) {
    return {
      error: {
        code: "supabase_transcription_request_write_failed",
        message: "Unable to write transcription request metadata.",
      },
      ok: false,
      status: "write_failed",
    };
  }

  return {
    action: "inserted",
    ok: true,
    request: requestMetadata,
  };
}

export function prepareTranscriptionRequestMetadata(
  input: WriteRubyWhisperTranscriptionRequestMetadataInput,
): SupabaseTranscriptionRequestInsert | undefined {
  const clerkUserId = normalizeText(input.clerkUserId);
  const provider = normalizeProvider(input.provider);
  const requestId = normalizeText(input.requestId);
  const status = normalizeStatus(input.status);

  if (!clerkUserId || !input.planState || !provider || !requestId || !status) {
    return undefined;
  }

  const appVersion = normalizeText(input.appVersion);
  const osVersion = normalizeText(input.osVersion);
  const errorCode =
    status === "failure" && input.errorCode ? input.errorCode : undefined;
  const latencyMs = normalizeOptionalCount(input.latencyMs);
  const audioDurationMs = normalizeOptionalCount(input.audioDurationMs);
  const cleanedWordCount = normalizeOptionalCount(input.cleanedWordCount);

  return {
    ...(appVersion ? { app_version: appVersion } : {}),
    ...(audioDurationMs !== undefined ? { audio_duration_ms: audioDurationMs } : {}),
    clerk_user_id: clerkUserId,
    ...(cleanedWordCount !== undefined
      ? { cleaned_word_count: cleanedWordCount }
      : {}),
    created_at: normalizeTimestamp(input.now),
    ...(errorCode ? { error_code: errorCode } : {}),
    ...(latencyMs !== undefined ? { latency_ms: latencyMs } : {}),
    ...(osVersion ? { os_version: osVersion } : {}),
    plan_state: input.planState,
    provider,
    request_id: requestId,
    status,
  };
}

function missingMetadataResult(): RubyWhisperTranscriptionRequestMetadataFailure {
  return {
    error: {
      code: "missing_transcription_request_metadata",
      message: "Required transcription request metadata is missing.",
    },
    ok: false,
    status: "missing_metadata",
  };
}

function normalizeOptionalCount(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }

  return normalizeRubyWhisperUsageWordCount(value);
}

function normalizeProvider(value: RubyWhisperProviderName | null | undefined) {
  return value === "groq" || value === "mock_provider" ? value : undefined;
}

function normalizeStatus(
  value: SupabaseTranscriptionRequestStatus | null | undefined,
) {
  return value === "success" || value === "failure" ? value : undefined;
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeTimestamp(nowInput?: Date | string) {
  const now = nowInput ? new Date(nowInput) : new Date();

  if (Number.isFinite(now.getTime())) {
    return now.toISOString();
  }

  return new Date().toISOString();
}

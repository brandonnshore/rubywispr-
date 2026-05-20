import { createClient } from "@supabase/supabase-js";

import {
  readRubyWhisperAccountProfileMetadata,
  type RubyWhisperAccountProfileMetadataReadResult,
  type SupabaseAccountProfileClient,
} from "@/lib/account/profile-metadata";
import {
  readRubyWhisperSubscriptionCache,
  type RubyWhisperSubscriptionCacheReadResult,
  type SupabaseSubscriptionCacheClient,
} from "@/lib/account/subscription-cache";
import { rubyWhisperApiErrorResponse } from "@/lib/api/errors";
import {
  requireDesktopUserId,
  type DesktopAuthState,
} from "@/lib/desktop/auth";
import { rubyWhisperOpenAIRealtimeProviderName } from "@/lib/providers/openai-realtime";
import type { SupabaseServiceRoleRuntimeConfig } from "@/lib/supabase/server";
import {
  evaluateRubyWhisperQuotaEntitlement,
  prepareRubyWhisperQuotaUsageIncrement,
  type RubyWhisperQuotaEntitlementInput,
  type RubyWhisperQuotaEntitlementResult,
  type RubyWhisperQuotaUsageIncrementInput,
  type RubyWhisperQuotaUsageIncrementResult,
} from "@/lib/usage/quota-service";
import {
  writeRubyWhisperTranscriptionRequestMetadata,
  type RubyWhisperTranscriptionRequestMetadataWriteResult,
  type SupabaseTranscriptionRequestsClient,
  type WriteRubyWhisperTranscriptionRequestMetadataInput,
} from "@/lib/usage/supabase-transcription-requests";
import {
  readRubyWhisperUsageCounters,
  upsertRubyWhisperUsageCounterIncrement,
  type RubyWhisperUsageCountersIncrementUpsertedResult,
  type RubyWhisperUsageCountersReadResult,
  type SupabaseUsageCountersClient,
} from "@/lib/usage/supabase-usage-counters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type DesktopRealtimeTranscriptionCompleteSuccessPayload = Readonly<{
  audioDurationMs: number;
  cleanedWordCount: number;
  ok: true;
  planState: Exclude<RubyWhisperQuotaEntitlementResult, { ok: false }>["planState"];
  provider: typeof rubyWhisperOpenAIRealtimeProviderName;
  requestId: string;
  trialWordsLimit: number;
  trialWordsRemaining: number;
  trialWordsUsed: number;
}>;

export type DesktopRealtimeTranscriptionCompleteDependencies = Readonly<{
  evaluateEntitlement: (
    input: RubyWhisperQuotaEntitlementInput,
  ) => RubyWhisperQuotaEntitlementResult;
  now: () => Date;
  parseRequest: (
    request: Request,
  ) => Promise<DesktopRealtimeTranscriptionCompleteRequestParseResult>;
  prepareUsageIncrement: (
    input: RubyWhisperQuotaUsageIncrementInput,
  ) => RubyWhisperQuotaUsageIncrementResult;
  readProfile: (
    clerkUserId: string,
  ) => Promise<RubyWhisperAccountProfileMetadataReadResult>;
  readSubscription: (
    clerkUserId: string,
  ) => Promise<RubyWhisperSubscriptionCacheReadResult>;
  readUsageCounters: (
    clerkUserId: string,
  ) => Promise<RubyWhisperUsageCountersReadResult>;
  requireAuth: (request: Pick<Request, "headers">) => DesktopAuthState;
  writeRequestMetadata: (
    input: WriteRubyWhisperTranscriptionRequestMetadataInput,
  ) => Promise<RubyWhisperTranscriptionRequestMetadataWriteResult>;
  writeUsageCounterIncrement: (
    input: RubyWhisperQuotaUsageIncrementInput,
  ) => Promise<RubyWhisperUsageCountersIncrementUpsertedResult>;
}>;

type DesktopRealtimeTranscriptionCompleteSupabaseClient =
  SupabaseAccountProfileClient &
    SupabaseSubscriptionCacheClient &
    SupabaseTranscriptionRequestsClient &
    SupabaseUsageCountersClient;

type DesktopRealtimeTranscriptionCompleteRequestInput = Readonly<{
  audioDurationMs: number;
  cleanedWordCount: number;
  requestId: string;
  appVersion?: string;
  osVersion?: string;
  providerLatencyMs?: number;
}>;

type DesktopRealtimeTranscriptionCompleteRequestParseResult =
  | Readonly<{
      input: DesktopRealtimeTranscriptionCompleteRequestInput;
      ok: true;
    }>
  | Readonly<{
      ok: false;
    }>;

export function createDesktopRealtimeTranscriptionCompleteRouteHandler(
  dependencies: DesktopRealtimeTranscriptionCompleteDependencies,
) {
  return async function POST(request: Request) {
    const authState = dependencies.requireAuth(request);

    if (!authState.ok) {
      return rubyWhisperApiErrorResponse("signed_out");
    }

    try {
      const parseResult = await dependencies.parseRequest(request);

      if (!parseResult.ok) {
        return rubyWhisperApiErrorResponse("invalid_audio", {
          metadata: { traceReason: "invalid_realtime_completion_metadata" },
        });
      }

      const profileResult = await dependencies.readProfile(authState.clerkUserId);

      if (!profileResult.ok) {
        return rubyWhisperApiErrorResponse("service_unavailable");
      }

      if (!profileResult.profile.termsAcceptedAt?.trim()) {
        return rubyWhisperApiErrorResponse("terms_required");
      }

      const [subscriptionResult, usageCountersResult] = await Promise.all([
        dependencies.readSubscription(authState.clerkUserId),
        dependencies.readUsageCounters(authState.clerkUserId),
      ]);

      if (!subscriptionResult.ok || !usageCountersResult.ok) {
        return rubyWhisperApiErrorResponse("service_unavailable");
      }

      const entitlement = dependencies.evaluateEntitlement({
        friendOfRubyUntil: subscriptionResult.subscription.friendOfRubyUntil,
        isBlocked: profileResult.profile.isBlocked,
        now: dependencies.now(),
        paymentFailed: subscriptionResult.subscription.paymentFailed,
        planState: subscriptionResult.subscription.planState,
        requiresSubscription: subscriptionResult.subscription.requiresSubscription,
        subscriptionStatus: subscriptionResult.subscription.subscriptionStatus,
        usageCounters: usageCountersResult.counters,
      });

      if (!entitlement.ok) {
        return rubyWhisperApiErrorResponse(entitlement.errorCode, {
          metadata: entitlement.metadata,
          requestId: parseResult.input.requestId,
        });
      }

      const usageIncrement = dependencies.prepareUsageIncrement({
        billableWordCount: parseResult.input.cleanedWordCount,
        entitlement,
        friendOfRubyUntil: subscriptionResult.subscription.friendOfRubyUntil,
        isBlocked: profileResult.profile.isBlocked,
        now: dependencies.now(),
        paymentFailed: subscriptionResult.subscription.paymentFailed,
        planState: subscriptionResult.subscription.planState,
        requiresSubscription: subscriptionResult.subscription.requiresSubscription,
        subscriptionStatus: subscriptionResult.subscription.subscriptionStatus,
        usageCounters: usageCountersResult.counters,
      });

      if (!usageIncrement.ok) {
        return rubyWhisperApiErrorResponse("service_unavailable", {
          requestId: parseResult.input.requestId,
        });
      }

      const [requestMetadataResult, usageWriteResult] = await Promise.all([
        dependencies.writeRequestMetadata({
          appVersion: parseResult.input.appVersion,
          audioDurationMs: parseResult.input.audioDurationMs,
          cleanedWordCount: parseResult.input.cleanedWordCount,
          clerkUserId: authState.clerkUserId,
          latencyMs: parseResult.input.providerLatencyMs,
          now: dependencies.now(),
          osVersion: parseResult.input.osVersion,
          planState: entitlement.planState,
          provider: rubyWhisperOpenAIRealtimeProviderName,
          requestId: parseResult.input.requestId,
          status: "success",
        }),
        dependencies.writeUsageCounterIncrement({
          billableWordCount: parseResult.input.cleanedWordCount,
          entitlement,
          friendOfRubyUntil: subscriptionResult.subscription.friendOfRubyUntil,
          isBlocked: profileResult.profile.isBlocked,
          now: dependencies.now(),
          paymentFailed: subscriptionResult.subscription.paymentFailed,
          planState: subscriptionResult.subscription.planState,
          requiresSubscription: subscriptionResult.subscription.requiresSubscription,
          subscriptionStatus: subscriptionResult.subscription.subscriptionStatus,
          usageCounters: usageCountersResult.counters,
        }),
      ]);

      if (!requestMetadataResult.ok || !usageWriteResult.ok) {
        return rubyWhisperApiErrorResponse("service_unavailable", {
          requestId: parseResult.input.requestId,
        });
      }

      return Response.json(
        {
          audioDurationMs: parseResult.input.audioDurationMs,
          cleanedWordCount: parseResult.input.cleanedWordCount,
          ok: true,
          planState: entitlement.planState,
          provider: rubyWhisperOpenAIRealtimeProviderName,
          requestId: parseResult.input.requestId,
          trialWordsLimit: entitlement.metadata.trialWordsLimit,
          trialWordsRemaining: usageWriteResult.counters.trialWordsRemaining,
          trialWordsUsed: usageWriteResult.counters.trialWordsUsed,
        } satisfies DesktopRealtimeTranscriptionCompleteSuccessPayload,
        {
          headers: {
            "Cache-Control": "no-store",
          },
          status: 200,
        },
      );
    } catch {
      return rubyWhisperApiErrorResponse("service_unavailable");
    }
  };
}

const defaultDesktopRealtimeTranscriptionCompleteRouteDependencies: DesktopRealtimeTranscriptionCompleteDependencies =
  {
    evaluateEntitlement: evaluateRubyWhisperQuotaEntitlement,
    now: () => new Date(),
    parseRequest: parseDesktopRealtimeTranscriptionCompleteRequest,
    prepareUsageIncrement: prepareRubyWhisperQuotaUsageIncrement,
    readProfile: (clerkUserId) =>
      readRubyWhisperAccountProfileMetadata(
        { clerkUserId },
        createDesktopRealtimeTranscriptionCompleteSupabaseClient,
      ),
    readSubscription: (clerkUserId) =>
      readRubyWhisperSubscriptionCache(
        { clerkUserId },
        createDesktopRealtimeTranscriptionCompleteSupabaseClient,
      ),
    readUsageCounters: (clerkUserId) =>
      readRubyWhisperUsageCounters(
        { clerkUserId },
        createDesktopRealtimeTranscriptionCompleteSupabaseClient,
      ),
    requireAuth: requireDesktopUserId,
    writeRequestMetadata: (input) =>
      writeRubyWhisperTranscriptionRequestMetadata(
        input,
        createDesktopRealtimeTranscriptionCompleteSupabaseClient,
      ),
    writeUsageCounterIncrement: (input) =>
      upsertRubyWhisperUsageCounterIncrement(
        {
          billableWordCount: input.billableWordCount,
          clerkUserId: input.usageCounters.clerkUserId,
          currentCounters: input.usageCounters,
          incrementTrialWords: input.entitlement?.planState === "trial_active",
          now: input.now,
        },
        createDesktopRealtimeTranscriptionCompleteSupabaseClient,
      ),
  };

export const POST = createDesktopRealtimeTranscriptionCompleteRouteHandler(
  defaultDesktopRealtimeTranscriptionCompleteRouteDependencies,
);

function createDesktopRealtimeTranscriptionCompleteSupabaseClient(
  config: SupabaseServiceRoleRuntimeConfig,
): DesktopRealtimeTranscriptionCompleteSupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as DesktopRealtimeTranscriptionCompleteSupabaseClient;
}

async function parseDesktopRealtimeTranscriptionCompleteRequest(
  request: Request,
): Promise<DesktopRealtimeTranscriptionCompleteRequestParseResult> {
  if (request.headers.get("content-type")?.includes("application/json") !== true) {
    return { ok: false };
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const requestId = normalizeText(body.requestId);
    const audioDurationMs = normalizeCount(body.audioDurationMs);
    const cleanedWordCount = normalizeCount(body.cleanedWordCount);
    const appVersion = normalizeText(body.appVersion);
    const osVersion = normalizeText(body.osVersion);
    const providerLatencyMs = normalizeLatency(body.providerLatencyMs);

    if (!requestId || audioDurationMs === undefined || cleanedWordCount === undefined) {
      return { ok: false };
    }

    return {
      input: {
        ...(appVersion ? { appVersion } : {}),
        audioDurationMs,
        cleanedWordCount,
        ...(osVersion ? { osVersion } : {}),
        ...(providerLatencyMs !== undefined ? { providerLatencyMs } : {}),
        requestId,
      },
      ok: true,
    };
  } catch {
    return { ok: false };
  }
}

function normalizeCount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.floor(value);
}

function normalizeLatency(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.floor(value);
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 && trimmedValue.length <= 256
    ? trimmedValue
    : undefined;
}

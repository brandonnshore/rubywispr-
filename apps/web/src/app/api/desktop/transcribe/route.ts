import { createClient } from "@supabase/supabase-js";

import {
  readRubyWhisperAccountProfileMetadata,
  type RubyWhisperAccountProfileMetadata,
  type RubyWhisperAccountProfileMetadataReadResult,
  type SupabaseAccountProfileClient,
} from "@/lib/account/profile-metadata";
import {
  readRubyWhisperSubscriptionCache,
  type RubyWhisperSubscriptionCache,
  type RubyWhisperSubscriptionCacheReadResult,
  type SupabaseSubscriptionCacheClient,
} from "@/lib/account/subscription-cache";
import {
  rubyWhisperApiErrorResponse,
  type RubyWhisperApiErrorCode,
  type RubyWhisperApiErrorMetadata,
} from "@/lib/api/errors";
import {
  requireClerkUserId,
  type ClerkRequiredAuthState,
} from "@/lib/auth/clerk";
import { runRubyWhisperConservativeCleanup } from "@/lib/cleanup/conservative-cleanup";
import {
  parseDesktopTranscribeRequest,
  type DesktopTranscribeRequestInput,
  type DesktopTranscribeRequestParseResult,
} from "@/lib/desktop-transcribe/request";
import {
  type RubyWhisperProviderClient,
  type RubyWhisperProviderErrorMetadata,
  type RubyWhisperProviderTranscriptionResult,
} from "@/lib/providers/client";
import { createRubyWhisperGroqProviderClient } from "@/lib/providers/groq";
import {
  type RubyWhisperTranscriptionRateLimitMetadata,
  type RubyWhisperTranscriptionRateLimitInput,
  type RubyWhisperTranscriptionRateLimitResult,
} from "@/lib/rate-limit/transcription";
import {
  claimRubyWhisperTranscriptionRateLimit,
  type RubyWhisperAtomicTranscriptionRateLimitResult,
  type SupabaseClaimTranscriptionRateLimitClient,
} from "@/lib/rate-limit/supabase-transcription-rate-limits";
import type { SupabaseServiceRoleRuntimeConfig } from "@/lib/supabase/server";
import { countRubyWhisperBillableOutputWords } from "@/lib/usage/quota";
import {
  evaluateRubyWhisperQuotaEntitlement,
  prepareRubyWhisperQuotaUsageIncrement,
  type RubyWhisperQuotaAllowedResult,
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
  type RubyWhisperUsageCounters,
  type RubyWhisperUsageCountersIncrementUpsertedResult,
  type RubyWhisperUsageCountersReadResult,
  type SupabaseUsageCountersClient,
} from "@/lib/usage/supabase-usage-counters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type DesktopTranscribePreflightContinuationInput = Readonly<{
  clerkUserId: string;
  entitlement: RubyWhisperQuotaAllowedResult;
  profile: RubyWhisperAccountProfileMetadata;
  requestInput: DesktopTranscribeRequestInput;
  subscription: RubyWhisperSubscriptionCache;
  usageCounters: RubyWhisperUsageCounters;
}>;

export type DesktopTranscribeProviderSuccessPayload = Readonly<{
  audioDurationMs: number;
  cleanedText: string;
  cleanedWordCount: number;
  ok: true;
  planState: RubyWhisperQuotaAllowedResult["planState"];
  provider: RubyWhisperProviderTranscriptionResult["provider"];
  requestId: string;
  trialWordsLimit: number;
  trialWordsRemaining: number;
  trialWordsUsed: number;
  appVersion?: string;
  osVersion?: string;
  providerLatencyMs?: number;
}>;

export type DesktopTranscribeRateLimitResult =
  | RubyWhisperTranscriptionRateLimitResult
  | RubyWhisperAtomicTranscriptionRateLimitResult;

export type DesktopTranscribeRouteDependencies = Readonly<{
  evaluateEntitlement: (
    input: RubyWhisperQuotaEntitlementInput,
  ) => RubyWhisperQuotaEntitlementResult;
  evaluateRateLimit: (
    input: RubyWhisperTranscriptionRateLimitInput,
  ) => DesktopTranscribeRateLimitResult | Promise<DesktopTranscribeRateLimitResult>;
  createRequestId: () => string;
  now: () => Date;
  parseRequest: (request: Request) => Promise<DesktopTranscribeRequestParseResult>;
  providerClient: RubyWhisperProviderClient;
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
  writeRequestMetadata: (
    input: WriteRubyWhisperTranscriptionRequestMetadataInput,
  ) => Promise<RubyWhisperTranscriptionRequestMetadataWriteResult>;
  writeUsageCounterIncrement: (
    input: RubyWhisperQuotaUsageIncrementInput,
  ) => Promise<RubyWhisperUsageCountersIncrementUpsertedResult>;
  requireAuth: () => Promise<ClerkRequiredAuthState>;
}>;

type DesktopTranscribeSupabaseClient = SupabaseAccountProfileClient &
  SupabaseClaimTranscriptionRateLimitClient &
  SupabaseSubscriptionCacheClient &
  SupabaseTranscriptionRequestsClient &
  SupabaseUsageCountersClient;

export function createDesktopTranscribeRouteHandler(
  dependencies: DesktopTranscribeRouteDependencies,
) {
  return async function POST(request: Request) {
    const authState = await dependencies.requireAuth();

    if (!authState.ok) {
      return rubyWhisperApiErrorResponse("signed_out");
    }

    try {
      const profileResult = await dependencies.readProfile(authState.userId);

      if (!profileResult.ok) {
        return rubyWhisperApiErrorResponse("service_unavailable");
      }

      if (!hasAcceptedTerms(profileResult.profile.termsAcceptedAt)) {
        return rubyWhisperApiErrorResponse("terms_required");
      }

      const [subscriptionResult, usageCountersResult] = await Promise.all([
        dependencies.readSubscription(authState.userId),
        dependencies.readUsageCounters(authState.userId),
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
        });
      }

      const rateLimitResult = await dependencies.evaluateRateLimit({
        clerkUserId: authState.userId,
        now: dependencies.now(),
        planState: entitlement.planState,
      });

      if (!rateLimitResult.ok) {
        if (rateLimitResult.status === "rate_limited") {
          return rubyWhisperApiErrorResponse("rate_limited", {
            metadata: createRateLimitApiErrorMetadata(
              rateLimitResult.apiErrorMetadata,
            ),
          });
        }

        if (
          "errorCode" in rateLimitResult &&
          rateLimitResult.errorCode === "signed_out"
        ) {
          return rubyWhisperApiErrorResponse("signed_out");
        }

        return rubyWhisperApiErrorResponse("service_unavailable");
      }

      const parseResult = await dependencies.parseRequest(request);

      if (!parseResult.ok) {
        return rubyWhisperApiErrorResponse(parseResult.code, {
          metadata: parseResult.metadata,
        });
      }

      return executeDesktopTranscribeProviderContinuation(
        {
          clerkUserId: authState.userId,
          entitlement,
          profile: profileResult.profile,
          requestInput: parseResult.input,
          subscription: subscriptionResult.subscription,
          usageCounters: usageCountersResult.counters,
        },
        dependencies.providerClient,
        dependencies,
      );
    } catch {
      return rubyWhisperApiErrorResponse("service_unavailable");
    }
  };
}

export async function executeDesktopTranscribeProviderContinuation(
  input: DesktopTranscribePreflightContinuationInput,
  providerClient: RubyWhisperProviderClient,
  dependencies: Pick<
    DesktopTranscribeRouteDependencies,
    | "createRequestId"
    | "now"
    | "prepareUsageIncrement"
    | "writeRequestMetadata"
    | "writeUsageCounterIncrement"
  > = defaultDesktopTranscribeRouteDependencies,
) {
  const requestId = dependencies.createRequestId();
  const transcriptionResult = await providerClient.transcribe(
    {
      ...input.requestInput.providerInput,
      requestId,
    },
  );

  if (!transcriptionResult.ok) {
    await dependencies.writeRequestMetadata({
      ...createRequestMetadataInput(input, requestId, {
        errorCode: transcriptionResult.error.apiErrorCode,
        provider:
          typeof transcriptionResult.metadata?.provider === "string"
            ? transcriptionResult.metadata.provider
            : "groq",
        providerLatencyMs: transcriptionResult.metadata?.providerLatencyMs,
        status: "failure",
        timestamp: dependencies.now(),
      }),
    });

    return rubyWhisperApiErrorResponse(transcriptionResult.error.apiErrorCode, {
      metadata: {
        ...createProviderRouteMetadata(input),
        ...transcriptionResult.metadata,
      },
      requestId,
    });
  }

  const cleanupResult = await runRubyWhisperConservativeCleanup({
    cleanupEnabled: input.requestInput.cleanupSettings.cleanupEnabled,
    context: input.requestInput.cleanupSettings.context,
    contextAwareCleanupEnabled:
      input.requestInput.cleanupSettings.contextAwareCleanupEnabled,
    dictionaryTerms: input.requestInput.cleanupSettings.dictionaryTerms,
    providerClient,
    requestId,
    transcriptText: transcriptionResult.result.text,
  });

  if (cleanupResult.cleanupAttempted && cleanupResult.fallbackUsed) {
    const errorCode = cleanupResult.error?.apiErrorCode ?? "provider_error";
    const provider =
      typeof cleanupResult.metadata?.provider === "string"
        ? cleanupResult.metadata.provider
        : transcriptionResult.result.provider;

    await dependencies.writeRequestMetadata({
      ...createRequestMetadataInput(input, requestId, {
        errorCode,
        provider,
        providerLatencyMs: cleanupResult.metadata?.providerLatencyMs,
        status: "failure",
        timestamp: dependencies.now(),
      }),
    });

    return rubyWhisperApiErrorResponse(errorCode, {
      metadata: {
        ...createProviderRouteMetadata(input),
        ...cleanupResult.metadata,
      },
      requestId,
    });
  }

  const finalText = cleanupResult.cleanedText;
  const cleanedWordCount = countRubyWhisperBillableOutputWords(
    finalText,
  );
  const usageIncrement = dependencies.prepareUsageIncrement({
    billableWordCount: cleanedWordCount,
    entitlement: input.entitlement,
    friendOfRubyUntil: input.subscription.friendOfRubyUntil,
    isBlocked: input.profile.isBlocked,
    now: dependencies.now(),
    paymentFailed: input.subscription.paymentFailed,
    planState: input.subscription.planState,
    requiresSubscription: input.subscription.requiresSubscription,
    subscriptionStatus: input.subscription.subscriptionStatus,
    usageCounters: input.usageCounters,
  });

  if (!usageIncrement.ok) {
    return rubyWhisperApiErrorResponse("service_unavailable", { requestId });
  }

  const requestMetadataResult = await dependencies.writeRequestMetadata(
    createRequestMetadataInput(input, requestId, {
      cleanedWordCount,
      provider: transcriptionResult.result.provider,
      providerLatencyMs: transcriptionResult.result.providerLatencyMs,
      status: "success",
      timestamp: dependencies.now(),
    }),
  );

  if (!requestMetadataResult.ok) {
    return rubyWhisperApiErrorResponse("service_unavailable", { requestId });
  }

  const usageWriteResult = await dependencies.writeUsageCounterIncrement({
    billableWordCount: cleanedWordCount,
    entitlement: input.entitlement,
    friendOfRubyUntil: input.subscription.friendOfRubyUntil,
    isBlocked: input.profile.isBlocked,
    now: dependencies.now(),
    paymentFailed: input.subscription.paymentFailed,
    planState: input.subscription.planState,
    requiresSubscription: input.subscription.requiresSubscription,
    subscriptionStatus: input.subscription.subscriptionStatus,
    usageCounters: input.usageCounters,
  });

  if (!usageWriteResult.ok) {
    return rubyWhisperApiErrorResponse("service_unavailable", { requestId });
  }

  return Response.json(
    createProviderSuccessPayload(input, transcriptionResult.result, {
      cleanedText: finalText,
      cleanedWordCount,
      requestId,
      usageCounters: usageWriteResult.counters,
    }),
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 200,
    },
  );
}

const defaultDesktopTranscribeRouteDependencies: DesktopTranscribeRouteDependencies = {
  createRequestId: () => globalThis.crypto.randomUUID(),
  evaluateEntitlement: evaluateRubyWhisperQuotaEntitlement,
  evaluateRateLimit: (input) =>
    claimRubyWhisperTranscriptionRateLimit(
      {
        clerkUserId: input.clerkUserId,
        now: input.now,
        planState: input.planState,
        policy: input.policy,
      },
      createDesktopTranscribeSupabaseClient,
    ),
  now: () => new Date(),
  parseRequest: parseDesktopTranscribeRequest,
  prepareUsageIncrement: prepareRubyWhisperQuotaUsageIncrement,
  providerClient: createRubyWhisperGroqProviderClient(),
  readProfile: (clerkUserId) =>
    readRubyWhisperAccountProfileMetadata(
      { clerkUserId },
      createDesktopTranscribeSupabaseClient,
    ),
  readSubscription: (clerkUserId) =>
    readRubyWhisperSubscriptionCache(
      { clerkUserId },
      createDesktopTranscribeSupabaseClient,
    ),
  readUsageCounters: (clerkUserId) =>
    readRubyWhisperUsageCounters(
      { clerkUserId },
      createDesktopTranscribeSupabaseClient,
    ),
  writeRequestMetadata: (input) =>
    writeRubyWhisperTranscriptionRequestMetadata(
      input,
      createDesktopTranscribeSupabaseClient,
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
      createDesktopTranscribeSupabaseClient,
    ),
  requireAuth: requireClerkUserId,
};

export const POST = createDesktopTranscribeRouteHandler(
  defaultDesktopTranscribeRouteDependencies,
);

function createDesktopTranscribeSupabaseClient(
  config: SupabaseServiceRoleRuntimeConfig,
): DesktopTranscribeSupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as DesktopTranscribeSupabaseClient;
}

function hasAcceptedTerms(value: string | undefined) {
  return Boolean(value?.trim());
}

function createRateLimitApiErrorMetadata(
  metadata: RubyWhisperApiErrorMetadata | RubyWhisperTranscriptionRateLimitMetadata,
): RubyWhisperApiErrorMetadata {
  return {
    ...(typeof metadata.limit === "number" ? { limit: metadata.limit } : {}),
    ...(typeof metadata.requestCount === "number"
      ? { requestCount: metadata.requestCount }
      : {}),
    ...(typeof metadata.retryAfterSeconds === "number"
      ? { retryAfterSeconds: metadata.retryAfterSeconds }
      : {}),
    ...(typeof metadata.windowEnd === "string"
      ? { windowEnd: metadata.windowEnd }
      : {}),
    ...(typeof metadata.windowStart === "string"
      ? { windowStart: metadata.windowStart }
      : {}),
  };
}

function createProviderSuccessPayload(
  input: DesktopTranscribePreflightContinuationInput,
  result: RubyWhisperProviderTranscriptionResult,
  success: Readonly<{
    cleanedText: string;
    cleanedWordCount: number;
    requestId: string;
    usageCounters: RubyWhisperUsageCounters;
  }>,
): DesktopTranscribeProviderSuccessPayload {
  const metadata = createProviderRouteMetadata(input);

  return {
    ...(typeof metadata.appVersion === "string"
      ? { appVersion: metadata.appVersion }
      : {}),
    audioDurationMs: input.requestInput.metadata.audioDurationMs,
    cleanedText: success.cleanedText,
    cleanedWordCount: success.cleanedWordCount,
    ok: true,
    ...(typeof metadata.osVersion === "string"
      ? { osVersion: metadata.osVersion }
      : {}),
    planState: input.entitlement.planState,
    provider: result.provider,
    ...(isFiniteLatencyMs(result.providerLatencyMs)
      ? { providerLatencyMs: result.providerLatencyMs }
      : {}),
    requestId: success.requestId,
    trialWordsLimit: input.entitlement.metadata.trialWordsLimit,
    trialWordsRemaining: success.usageCounters.trialWordsRemaining,
    trialWordsUsed: success.usageCounters.trialWordsUsed,
  };
}

function createRequestMetadataInput(
  input: DesktopTranscribePreflightContinuationInput,
  requestId: string,
  result: Readonly<{
    provider: RubyWhisperProviderTranscriptionResult["provider"] | string;
    status: "success" | "failure";
    cleanedWordCount?: number;
    errorCode?: RubyWhisperApiErrorCode;
    providerLatencyMs?: unknown;
    timestamp: Date;
  }>,
): WriteRubyWhisperTranscriptionRequestMetadataInput {
  const metadata = createProviderRouteMetadata(input);

  return {
    ...(typeof metadata.appVersion === "string"
      ? { appVersion: metadata.appVersion }
      : {}),
    audioDurationMs: input.requestInput.metadata.audioDurationMs,
    clerkUserId: input.clerkUserId,
    ...(typeof result.cleanedWordCount === "number"
      ? { cleanedWordCount: result.cleanedWordCount }
      : {}),
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    now: result.timestamp,
    ...(typeof metadata.osVersion === "string"
      ? { osVersion: metadata.osVersion }
      : {}),
    planState: input.entitlement.planState,
    provider:
      result.provider === "groq" || result.provider === "mock_provider"
        ? result.provider
        : "mock_provider",
    ...(isFiniteLatencyMs(result.providerLatencyMs)
      ? { latencyMs: result.providerLatencyMs }
      : {}),
    requestId,
    status: result.status,
  };
}

function createProviderRouteMetadata(
  input: DesktopTranscribePreflightContinuationInput,
): RubyWhisperProviderErrorMetadata &
  Readonly<{
    appVersion?: string;
    osVersion?: string;
    planState: RubyWhisperQuotaAllowedResult["planState"];
    trialWordsLimit: number;
    trialWordsRemaining: number;
  }> {
  return {
    ...(input.requestInput.metadata.appVersion
      ? { appVersion: input.requestInput.metadata.appVersion }
      : {}),
    audioDurationMs: input.requestInput.metadata.audioDurationMs,
    ...(input.requestInput.metadata.osVersion
      ? { osVersion: input.requestInput.metadata.osVersion }
      : {}),
    planState: input.entitlement.planState,
    trialWordsLimit: input.entitlement.metadata.trialWordsLimit,
    trialWordsRemaining: input.entitlement.metadata.trialWordsRemaining,
  };
}

function isFiniteLatencyMs(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

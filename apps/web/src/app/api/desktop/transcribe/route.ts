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
import { rubyWhisperApiErrorResponse } from "@/lib/api/errors";
import {
  requireClerkUserId,
  type ClerkRequiredAuthState,
} from "@/lib/auth/clerk";
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
import type { SupabaseServiceRoleRuntimeConfig } from "@/lib/supabase/server";
import { countRubyWhisperBillableOutputWords } from "@/lib/usage/quota";
import {
  evaluateRubyWhisperQuotaEntitlement,
  type RubyWhisperQuotaAllowedResult,
  type RubyWhisperQuotaEntitlementInput,
  type RubyWhisperQuotaEntitlementResult,
} from "@/lib/usage/quota-service";
import {
  readRubyWhisperUsageCounters,
  type RubyWhisperUsageCounters,
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
  trialWordsLimit: number;
  trialWordsRemaining: number;
  appVersion?: string;
  osVersion?: string;
  providerLatencyMs?: number;
}>;

export type DesktopTranscribeRouteDependencies = Readonly<{
  evaluateEntitlement: (
    input: RubyWhisperQuotaEntitlementInput,
  ) => RubyWhisperQuotaEntitlementResult;
  now: () => Date;
  parseRequest: (request: Request) => Promise<DesktopTranscribeRequestParseResult>;
  providerClient: RubyWhisperProviderClient;
  readProfile: (
    clerkUserId: string,
  ) => Promise<RubyWhisperAccountProfileMetadataReadResult>;
  readSubscription: (
    clerkUserId: string,
  ) => Promise<RubyWhisperSubscriptionCacheReadResult>;
  readUsageCounters: (
    clerkUserId: string,
  ) => Promise<RubyWhisperUsageCountersReadResult>;
  requireAuth: () => Promise<ClerkRequiredAuthState>;
}>;

type DesktopTranscribeSupabaseClient = SupabaseAccountProfileClient &
  SupabaseSubscriptionCacheClient &
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
      );
    } catch {
      return rubyWhisperApiErrorResponse("service_unavailable");
    }
  };
}

export async function executeDesktopTranscribeProviderContinuation(
  input: DesktopTranscribePreflightContinuationInput,
  providerClient: RubyWhisperProviderClient,
) {
  if (input.requestInput.cleanupSettings.cleanupEnabled) {
    return rubyWhisperApiErrorResponse("service_unavailable", {
      metadata: createProviderRouteMetadata(input),
    });
  }

  const transcriptionResult = await providerClient.transcribe(
    input.requestInput.providerInput,
  );

  if (!transcriptionResult.ok) {
    return rubyWhisperApiErrorResponse(transcriptionResult.error.apiErrorCode, {
      metadata: {
        ...createProviderRouteMetadata(input),
        ...transcriptionResult.metadata,
      },
    });
  }

  return Response.json(
    createProviderSuccessPayload(input, transcriptionResult.result),
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 200,
    },
  );
}

const defaultDesktopTranscribeRouteDependencies: DesktopTranscribeRouteDependencies = {
  evaluateEntitlement: evaluateRubyWhisperQuotaEntitlement,
  now: () => new Date(),
  parseRequest: parseDesktopTranscribeRequest,
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

function createProviderSuccessPayload(
  input: DesktopTranscribePreflightContinuationInput,
  result: RubyWhisperProviderTranscriptionResult,
): DesktopTranscribeProviderSuccessPayload {
  const metadata = createProviderRouteMetadata(input);

  return {
    ...(typeof metadata.appVersion === "string"
      ? { appVersion: metadata.appVersion }
      : {}),
    audioDurationMs: input.requestInput.metadata.audioDurationMs,
    cleanedText: result.text,
    cleanedWordCount: countRubyWhisperBillableOutputWords(result.text),
    ok: true,
    ...(typeof metadata.osVersion === "string"
      ? { osVersion: metadata.osVersion }
      : {}),
    planState: input.entitlement.planState,
    provider: result.provider,
    ...(typeof result.providerLatencyMs === "number"
      ? { providerLatencyMs: result.providerLatencyMs }
      : {}),
    trialWordsLimit: input.entitlement.metadata.trialWordsLimit,
    trialWordsRemaining: input.entitlement.metadata.trialWordsRemaining,
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

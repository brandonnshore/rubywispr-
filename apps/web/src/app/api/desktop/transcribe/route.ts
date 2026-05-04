import "server-only";

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
  type RubyWhisperApiErrorMetadata,
} from "@/lib/api/errors";
import {
  requireClerkUserId,
  type ClerkRequiredAuthState,
} from "@/lib/auth/clerk";
import {
  parseDesktopTranscribeRequest,
  type DesktopTranscribeRequestInput,
  type DesktopTranscribeRequestParseResult,
} from "@/lib/desktop-transcribe/request";
import type { SupabaseServiceRoleRuntimeConfig } from "@/lib/supabase/server";
import {
  evaluateRubyWhisperQuotaEntitlement,
  type RubyWhisperQuotaAllowedResult,
  type RubyWhisperQuotaEntitlementInput,
  type RubyWhisperQuotaEntitlementResult,
  type RubyWhisperQuotaMetadata,
} from "@/lib/usage/quota-service";
import {
  readRubyWhisperUsageCounters,
  type RubyWhisperUsageCounters,
  type RubyWhisperUsageCountersReadResult,
  type SupabaseUsageCountersClient,
} from "@/lib/usage/supabase-usage-counters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type DesktopTranscribePreflightContext = Readonly<{
  entitlement: RubyWhisperQuotaAllowedResult;
  input: DesktopTranscribeRequestInput;
  profile: RubyWhisperAccountProfileMetadata;
  subscription: RubyWhisperSubscriptionCache;
  usageCounters: RubyWhisperUsageCounters;
  userId: string;
}>;

export type DesktopTranscribeRouteDependencies = Readonly<{
  continueAfterPreflight: (
    context: DesktopTranscribePreflightContext,
  ) => Promise<Response> | Response;
  evaluateQuotaEntitlement: (
    input: RubyWhisperQuotaEntitlementInput,
  ) => RubyWhisperQuotaEntitlementResult;
  parseRequest: (request: Request) => Promise<DesktopTranscribeRequestParseResult>;
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
    let authState: ClerkRequiredAuthState;

    try {
      authState = await dependencies.requireAuth();
    } catch {
      return rubyWhisperApiErrorResponse("signed_out");
    }

    if (!authState.ok) {
      return rubyWhisperApiErrorResponse("signed_out");
    }

    try {
      const [profileResult, subscriptionResult, usageCountersResult] =
        await Promise.all([
          dependencies.readProfile(authState.userId),
          dependencies.readSubscription(authState.userId),
          dependencies.readUsageCounters(authState.userId),
        ]);

      if (
        !profileResult.ok ||
        !subscriptionResult.ok ||
        !usageCountersResult.ok
      ) {
        return rubyWhisperApiErrorResponse("service_unavailable");
      }

      if (!profileResult.profile.termsAcceptedAt) {
        return rubyWhisperApiErrorResponse("terms_required", {
          metadata: {
            planState: subscriptionResult.subscription.planState,
          },
        });
      }

      const entitlement = dependencies.evaluateQuotaEntitlement({
        friendOfRubyUntil: subscriptionResult.subscription.friendOfRubyUntil,
        isBlocked: profileResult.profile.isBlocked,
        paymentFailed: subscriptionResult.subscription.paymentFailed,
        planState: subscriptionResult.subscription.planState,
        requiresSubscription: subscriptionResult.subscription.requiresSubscription,
        subscriptionStatus: subscriptionResult.subscription.subscriptionStatus,
        usageCounters: usageCountersResult.counters,
      });

      if (!entitlement.ok) {
        return rubyWhisperApiErrorResponse(entitlement.errorCode, {
          metadata: quotaErrorMetadata(entitlement.metadata),
        });
      }

      const requestResult = await dependencies.parseRequest(request);

      if (!requestResult.ok) {
        return rubyWhisperApiErrorResponse(requestResult.code, {
          metadata: requestResult.metadata,
        });
      }

      return dependencies.continueAfterPreflight({
        entitlement,
        input: requestResult.input,
        profile: profileResult.profile,
        subscription: subscriptionResult.subscription,
        usageCounters: usageCountersResult.counters,
        userId: authState.userId,
      });
    } catch {
      return rubyWhisperApiErrorResponse("service_unavailable");
    }
  };
}

const defaultDesktopTranscribeRouteDependencies: DesktopTranscribeRouteDependencies =
  {
    continueAfterPreflight: () => rubyWhisperApiErrorResponse("service_unavailable"),
    evaluateQuotaEntitlement: evaluateRubyWhisperQuotaEntitlement,
    parseRequest: parseDesktopTranscribeRequest,
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

function quotaErrorMetadata(
  metadata: RubyWhisperQuotaMetadata,
): RubyWhisperApiErrorMetadata {
  return {
    planState: metadata.planState,
    trialWordsLimit: metadata.trialWordsLimit,
    trialWordsRemaining: metadata.trialWordsRemaining,
  };
}

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

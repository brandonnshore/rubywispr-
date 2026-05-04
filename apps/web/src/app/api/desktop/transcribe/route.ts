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
import type { SupabaseServiceRoleRuntimeConfig } from "@/lib/supabase/server";
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

export type DesktopTranscribeRouteDependencies = Readonly<{
  continuePreflight: (
    input: DesktopTranscribePreflightContinuationInput,
  ) => Promise<Response> | Response;
  evaluateEntitlement: (
    input: RubyWhisperQuotaEntitlementInput,
  ) => RubyWhisperQuotaEntitlementResult;
  now: () => Date;
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

      return dependencies.continuePreflight({
        clerkUserId: authState.userId,
        entitlement,
        profile: profileResult.profile,
        requestInput: parseResult.input,
        subscription: subscriptionResult.subscription,
        usageCounters: usageCountersResult.counters,
      });
    } catch {
      return rubyWhisperApiErrorResponse("service_unavailable");
    }
  };
}

const defaultDesktopTranscribeRouteDependencies: DesktopTranscribeRouteDependencies = {
  continuePreflight: () => rubyWhisperApiErrorResponse("service_unavailable"),
  evaluateEntitlement: evaluateRubyWhisperQuotaEntitlement,
  now: () => new Date(),
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

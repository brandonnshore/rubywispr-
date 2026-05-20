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
import {
  rubyWhisperApiErrorResponse,
  type RubyWhisperApiErrorMetadata,
} from "@/lib/api/errors";
import {
  requireDesktopUserId,
  type DesktopAuthState,
} from "@/lib/desktop/auth";
import {
  createRubyWhisperOpenAIRealtimeClientSecret,
  type RubyWhisperOpenAIRealtimeClientSecretInput,
  type RubyWhisperOpenAIRealtimeClientSecretResult,
} from "@/lib/providers/openai-realtime";
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
import { serverEnv } from "@/config/server";
import type { SupabaseServiceRoleRuntimeConfig } from "@/lib/supabase/server";
import {
  evaluateRubyWhisperQuotaEntitlement,
  type RubyWhisperQuotaEntitlementInput,
  type RubyWhisperQuotaEntitlementResult,
} from "@/lib/usage/quota-service";
import {
  readRubyWhisperUsageCounters,
  type RubyWhisperUsageCountersReadResult,
  type SupabaseUsageCountersClient,
} from "@/lib/usage/supabase-usage-counters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type DesktopRealtimeTranscriptionSessionSuccessPayload = Readonly<{
  clientSecret: string;
  expiresAt: number;
  ok: true;
  planState: Exclude<RubyWhisperQuotaEntitlementResult, { ok: false }>["planState"];
  provider: RubyWhisperOpenAIRealtimeClientSecretResult["provider"];
  requestId: string;
  trialWordsLimit: number;
  trialWordsRemaining: number;
  trialWordsUsed: number;
  webSocketURL: string;
  providerLatencyMs?: number;
}>;

export type DesktopRealtimeTranscriptionRateLimitResult =
  | RubyWhisperTranscriptionRateLimitResult
  | RubyWhisperAtomicTranscriptionRateLimitResult;

export type DesktopRealtimeTranscriptionSessionRouteDependencies = Readonly<{
  createClientSecret: (
    input: RubyWhisperOpenAIRealtimeClientSecretInput,
  ) => ReturnType<typeof createRubyWhisperOpenAIRealtimeClientSecret>;
  createRequestId: () => string;
  evaluateEntitlement: (
    input: RubyWhisperQuotaEntitlementInput,
  ) => RubyWhisperQuotaEntitlementResult;
  evaluateRateLimit: (
    input: RubyWhisperTranscriptionRateLimitInput,
  ) =>
    | DesktopRealtimeTranscriptionRateLimitResult
    | Promise<DesktopRealtimeTranscriptionRateLimitResult>;
  isEnabled: () => boolean;
  now: () => Date;
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
}>;

type DesktopRealtimeTranscriptionSessionSupabaseClient =
  SupabaseAccountProfileClient &
    SupabaseClaimTranscriptionRateLimitClient &
    SupabaseSubscriptionCacheClient &
    SupabaseUsageCountersClient;

export function createDesktopRealtimeTranscriptionSessionRouteHandler(
  dependencies: DesktopRealtimeTranscriptionSessionRouteDependencies,
) {
  return async function POST(request: Request) {
    const authState = dependencies.requireAuth(request);

    if (!authState.ok) {
      return rubyWhisperApiErrorResponse("signed_out");
    }

    if (!dependencies.isEnabled()) {
      return rubyWhisperApiErrorResponse("service_unavailable", {
        metadata: { traceReason: "realtime_disabled" },
      });
    }

    try {
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
        });
      }

      const rateLimitResult = await dependencies.evaluateRateLimit({
        clerkUserId: authState.clerkUserId,
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

        return rubyWhisperApiErrorResponse("service_unavailable");
      }

      const requestBody = await readSessionRequestBody(request);
      const requestId = dependencies.createRequestId();
      const clientSecretResult = await dependencies.createClientSecret({
        language: requestBody.language,
        requestId,
      });

      if (!clientSecretResult.ok) {
        return rubyWhisperApiErrorResponse(
          clientSecretResult.error.apiErrorCode,
          {
            metadata: {
              ...clientSecretResult.metadata,
              traceReason: clientSecretResult.error.code,
            },
            requestId,
          },
        );
      }

      return Response.json(
        {
          clientSecret: clientSecretResult.result.clientSecret,
          expiresAt: clientSecretResult.result.expiresAt,
          ok: true,
          planState: entitlement.planState,
          provider: clientSecretResult.result.provider,
          ...(typeof clientSecretResult.result.providerLatencyMs === "number"
            ? { providerLatencyMs: clientSecretResult.result.providerLatencyMs }
            : {}),
          requestId,
          trialWordsLimit: entitlement.metadata.trialWordsLimit,
          trialWordsRemaining: entitlement.metadata.trialWordsRemaining,
          trialWordsUsed: entitlement.metadata.trialWordsUsed,
          webSocketURL: clientSecretResult.result.webSocketURL,
        } satisfies DesktopRealtimeTranscriptionSessionSuccessPayload,
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

const defaultDesktopRealtimeTranscriptionSessionRouteDependencies: DesktopRealtimeTranscriptionSessionRouteDependencies =
  {
    createClientSecret: createRubyWhisperOpenAIRealtimeClientSecret,
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
        createDesktopRealtimeTranscriptionSessionSupabaseClient,
      ),
    isEnabled: () => serverEnv.realtimeTranscription.enabled,
    now: () => new Date(),
    readProfile: (clerkUserId) =>
      readRubyWhisperAccountProfileMetadata(
        { clerkUserId },
        createDesktopRealtimeTranscriptionSessionSupabaseClient,
      ),
    readSubscription: (clerkUserId) =>
      readRubyWhisperSubscriptionCache(
        { clerkUserId },
        createDesktopRealtimeTranscriptionSessionSupabaseClient,
      ),
    readUsageCounters: (clerkUserId) =>
      readRubyWhisperUsageCounters(
        { clerkUserId },
        createDesktopRealtimeTranscriptionSessionSupabaseClient,
      ),
    requireAuth: requireDesktopUserId,
  };

export const POST = createDesktopRealtimeTranscriptionSessionRouteHandler(
  defaultDesktopRealtimeTranscriptionSessionRouteDependencies,
);

function createDesktopRealtimeTranscriptionSessionSupabaseClient(
  config: SupabaseServiceRoleRuntimeConfig,
): DesktopRealtimeTranscriptionSessionSupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as DesktopRealtimeTranscriptionSessionSupabaseClient;
}

async function readSessionRequestBody(request: Request) {
  if (request.headers.get("content-type")?.includes("application/json") !== true) {
    return {};
  }

  try {
    const body = (await request.json()) as { language?: unknown };
    const language = normalizeLanguage(body.language);

    return language ? { language } : {};
  } catch {
    return {};
  }
}

function normalizeLanguage(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const language = value.trim().toLowerCase();

  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(language)
    ? language
    : undefined;
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

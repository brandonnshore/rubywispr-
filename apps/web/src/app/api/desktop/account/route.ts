import { createClient } from "@supabase/supabase-js";

import {
  createRubyWhisperDesktopAccountSnapshot,
  type RubyWhisperDesktopAccountSnapshotInput,
  type RubyWhisperDesktopAccountSnapshotResult,
} from "@/lib/account/desktop-account-snapshot";
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
import {
  readRubyWhisperUsageCounters,
  type RubyWhisperUsageCountersReadResult,
  type SupabaseUsageCountersClient,
} from "@/lib/usage/supabase-usage-counters";
import type { SupabaseServiceRoleRuntimeConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type DesktopAccountRouteDependencies = Readonly<{
  createSnapshot: (
    input: RubyWhisperDesktopAccountSnapshotInput,
  ) => RubyWhisperDesktopAccountSnapshotResult;
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

type DesktopAccountSupabaseClient = SupabaseAccountProfileClient &
  SupabaseSubscriptionCacheClient &
  SupabaseUsageCountersClient;

export function createDesktopAccountRouteHandler(
  dependencies: DesktopAccountRouteDependencies,
) {
  return async function GET(request: Request) {
    const authState = dependencies.requireAuth(request);

    if (!authState.ok) {
      return rubyWhisperApiErrorResponse("signed_out");
    }

    try {
      const [profileResult, subscriptionResult, usageCountersResult] =
        await Promise.all([
          dependencies.readProfile(authState.clerkUserId),
          dependencies.readSubscription(authState.clerkUserId),
          dependencies.readUsageCounters(authState.clerkUserId),
        ]);

      if (
        !profileResult.ok ||
        !subscriptionResult.ok ||
        !usageCountersResult.ok
      ) {
        return rubyWhisperApiErrorResponse("service_unavailable");
      }

      const snapshotResult = dependencies.createSnapshot({
        profile: profileResult.profile,
        subscription: subscriptionResult.subscription,
        usageCounters: usageCountersResult.counters,
      });

      if (!snapshotResult.ok) {
        return rubyWhisperApiErrorResponse("internal_error");
      }

      return Response.json(
        {
          ok: true,
          ...snapshotResult.snapshot,
        },
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

const defaultDesktopAccountRouteDependencies: DesktopAccountRouteDependencies = {
  createSnapshot: createRubyWhisperDesktopAccountSnapshot,
  readProfile: (clerkUserId) =>
    readRubyWhisperAccountProfileMetadata(
      { clerkUserId },
      createDesktopAccountSupabaseClient,
    ),
  readSubscription: (clerkUserId) =>
    readRubyWhisperSubscriptionCache(
      { clerkUserId },
      createDesktopAccountSupabaseClient,
    ),
  readUsageCounters: (clerkUserId) =>
    readRubyWhisperUsageCounters(
      { clerkUserId },
      createDesktopAccountSupabaseClient,
    ),
  requireAuth: requireDesktopUserId,
};

export const GET = createDesktopAccountRouteHandler(
  defaultDesktopAccountRouteDependencies,
);

function createDesktopAccountSupabaseClient(
  config: SupabaseServiceRoleRuntimeConfig,
): DesktopAccountSupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as DesktopAccountSupabaseClient;
}

import "server-only";

import { createClient } from "@supabase/supabase-js";

import {
  createRubyWhisperDesktopAccountSnapshot,
  type RubyWhisperDesktopAccountSnapshot,
} from "@/lib/account/desktop-account-snapshot";
import {
  readRubyWhisperAccountProfileMetadata,
  type RubyWhisperAccountProfileMetadata,
  type RubyWhisperAccountProfileMetadataFailure,
  type SupabaseAccountProfileClient,
} from "@/lib/account/profile-metadata";
import {
  readRubyWhisperSubscriptionCache,
  type RubyWhisperSubscriptionCache,
  type RubyWhisperSubscriptionCacheFailure,
  type SupabaseSubscriptionCacheClient,
} from "@/lib/account/subscription-cache";
import type { SupabaseServiceRoleRuntimeConfig } from "@/lib/supabase/server";
import {
  readRubyWhisperUsageCounters,
  type RubyWhisperUsageCounters,
  type RubyWhisperUsageCountersFailure,
  type SupabaseUsageCountersClient,
} from "@/lib/usage/supabase-usage-counters";

export type AccountMetadataUnavailableReason =
  | "invalid_input"
  | "missing_metadata"
  | "missing_user"
  | "service_unavailable";

export type AccountMetadataState<T> = Readonly<
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      reason: AccountMetadataUnavailableReason;
    }
>;

export type AccountPageMetadata = Readonly<{
  profile: AccountMetadataState<RubyWhisperAccountProfileMetadata>;
  snapshot: AccountMetadataState<RubyWhisperDesktopAccountSnapshot>;
  subscription: AccountMetadataState<RubyWhisperSubscriptionCache>;
  usageCounters: AccountMetadataState<RubyWhisperUsageCounters>;
}>;

type AccountPageSupabaseClient = SupabaseAccountProfileClient &
  SupabaseSubscriptionCacheClient &
  SupabaseUsageCountersClient;

export async function readAccountPageMetadata(
  clerkUserId: string,
): Promise<AccountPageMetadata> {
  const [profile, subscription, usageCounters] = await Promise.all([
    readProfileMetadata(clerkUserId),
    readSubscriptionMetadata(clerkUserId),
    readUsageCounterMetadata(clerkUserId),
  ]);

  return {
    profile,
    snapshot: createAccountSnapshotState({
      profile,
      subscription,
      usageCounters,
    }),
    subscription,
    usageCounters,
  };
}

async function readProfileMetadata(
  clerkUserId: string,
): Promise<AccountMetadataState<RubyWhisperAccountProfileMetadata>> {
  try {
    const result = await readRubyWhisperAccountProfileMetadata(
      { clerkUserId },
      createAccountPageSupabaseClient,
    );

    return result.ok
      ? { ok: true, value: result.profile }
      : toUnavailableMetadataState(result);
  } catch {
    return { ok: false, reason: "service_unavailable" };
  }
}

async function readSubscriptionMetadata(
  clerkUserId: string,
): Promise<AccountMetadataState<RubyWhisperSubscriptionCache>> {
  try {
    const result = await readRubyWhisperSubscriptionCache(
      { clerkUserId },
      createAccountPageSupabaseClient,
    );

    return result.ok
      ? { ok: true, value: result.subscription }
      : toUnavailableMetadataState(result);
  } catch {
    return { ok: false, reason: "service_unavailable" };
  }
}

async function readUsageCounterMetadata(
  clerkUserId: string,
): Promise<AccountMetadataState<RubyWhisperUsageCounters>> {
  try {
    const result = await readRubyWhisperUsageCounters(
      { clerkUserId },
      createAccountPageSupabaseClient,
    );

    return result.ok
      ? { ok: true, value: result.counters }
      : toUnavailableMetadataState(result);
  } catch {
    return { ok: false, reason: "service_unavailable" };
  }
}

function createAccountSnapshotState({
  profile,
  subscription,
  usageCounters,
}: Readonly<{
  profile: AccountMetadataState<RubyWhisperAccountProfileMetadata>;
  subscription: AccountMetadataState<RubyWhisperSubscriptionCache>;
  usageCounters: AccountMetadataState<RubyWhisperUsageCounters>;
}>): AccountMetadataState<RubyWhisperDesktopAccountSnapshot> {
  if (!profile.ok || !subscription.ok || !usageCounters.ok) {
    return { ok: false, reason: "missing_metadata" };
  }

  const snapshotResult = createRubyWhisperDesktopAccountSnapshot({
    profile: profile.value,
    subscription: subscription.value,
    usageCounters: usageCounters.value,
  });

  return snapshotResult.ok
    ? { ok: true, value: snapshotResult.snapshot }
    : { ok: false, reason: "invalid_input" };
}

function toUnavailableMetadataState(
  result:
    | RubyWhisperAccountProfileMetadataFailure
    | RubyWhisperSubscriptionCacheFailure
    | RubyWhisperUsageCountersFailure,
) {
  if (result.status === "missing_user") {
    return { ok: false, reason: "missing_user" } as const;
  }

  if (result.status === "missing_profile" || result.status === "missing_email") {
    return { ok: false, reason: "missing_metadata" } as const;
  }

  return { ok: false, reason: "service_unavailable" } as const;
}

function createAccountPageSupabaseClient(
  config: SupabaseServiceRoleRuntimeConfig,
): AccountPageSupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as AccountPageSupabaseClient;
}

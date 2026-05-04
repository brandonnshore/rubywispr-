import "server-only";

import type { RubyWhisperSubscriptionCache } from "@/lib/account/subscription-cache";
import {
  evaluateRubyWhisperQuotaEntitlement,
  rubyWhisperQuotaPreflightPolicy,
  type RubyWhisperQuotaErrorCode,
} from "@/lib/usage/quota-service";
import type { RubyWhisperUsagePlanState } from "@/lib/usage/quota";
import type { RubyWhisperUsageCounters } from "@/lib/usage/supabase-usage-counters";

export type RubyWhisperAccountProfileMetadata = Readonly<{
  clerkUserId?: string | null;
  email?: string | null;
  isBlocked?: boolean | null;
  termsAcceptedAt?: string | null;
}>;

export type RubyWhisperDesktopAccountSnapshotInput = Readonly<{
  now?: Date | string;
  profile: RubyWhisperAccountProfileMetadata;
  subscription: RubyWhisperSubscriptionCache;
  usageCounters: RubyWhisperUsageCounters;
}>;

export type RubyWhisperDesktopAccountSnapshotStatus =
  | "account_blocked"
  | "active"
  | "payment_failed"
  | "subscription_required"
  | "terms_required"
  | "trial_exhausted";

export type RubyWhisperDesktopAccountSnapshotFailureCode =
  | RubyWhisperQuotaErrorCode
  | "terms_required";

export type RubyWhisperDesktopAccountSnapshot = Readonly<{
  accountStatus: RubyWhisperDesktopAccountSnapshotStatus;
  billingPortalAvailable: false;
  billingPortalUrl: null;
  canTranscribe: boolean;
  email: string;
  isTrialExhausted: boolean;
  isTrialLow: boolean;
  lifetimeWordsUsed: number;
  monthlyPeriodStart: string;
  monthlyWordsUsed: number;
  planState: RubyWhisperUsagePlanState;
  preflightPolicy: typeof rubyWhisperQuotaPreflightPolicy;
  termsAccepted: boolean;
  trialWordsLimit: number;
  trialWordsRemaining: number;
  trialWordsUsed: number;
  failureCode?: RubyWhisperDesktopAccountSnapshotFailureCode;
}>;

export type RubyWhisperDesktopAccountSnapshotError = Readonly<{
  code:
    | "account_metadata_mismatch"
    | "missing_account_email"
    | "missing_clerk_user_id"
    | "missing_subscription_metadata"
    | "missing_usage_counters";
  message: string;
}>;

export type RubyWhisperDesktopAccountSnapshotResult =
  | Readonly<{
      action: "created";
      ok: true;
      snapshot: RubyWhisperDesktopAccountSnapshot;
    }>
  | Readonly<{
      error: RubyWhisperDesktopAccountSnapshotError;
      ok: false;
      status: "invalid_input";
    }>;

export function createRubyWhisperDesktopAccountSnapshot(
  input: RubyWhisperDesktopAccountSnapshotInput,
): RubyWhisperDesktopAccountSnapshotResult {
  const clerkUserId = normalizeAccountSnapshotText(input.profile.clerkUserId);

  if (!clerkUserId) {
    return invalidInputResult(
      "missing_clerk_user_id",
      "A Clerk user ID is required for account metadata.",
    );
  }

  const email = normalizeAccountSnapshotText(input.profile.email);

  if (!email) {
    return invalidInputResult(
      "missing_account_email",
      "An account email is required for account metadata.",
    );
  }

  if (!input.subscription?.clerkUserId) {
    return invalidInputResult(
      "missing_subscription_metadata",
      "Subscription metadata is required for account state.",
    );
  }

  if (!input.usageCounters?.clerkUserId) {
    return invalidInputResult(
      "missing_usage_counters",
      "Usage counter metadata is required for account state.",
    );
  }

  if (
    clerkUserId !== normalizeAccountSnapshotText(input.subscription.clerkUserId) ||
    clerkUserId !== normalizeAccountSnapshotText(input.usageCounters.clerkUserId)
  ) {
    return invalidInputResult(
      "account_metadata_mismatch",
      "Account metadata must belong to the same Clerk user.",
    );
  }

  const termsAccepted = Boolean(
    normalizeAccountSnapshotTimestamp(input.profile.termsAcceptedAt),
  );
  const entitlement = evaluateRubyWhisperQuotaEntitlement({
    friendOfRubyUntil: input.subscription.friendOfRubyUntil,
    isBlocked: input.profile.isBlocked === true,
    now: input.now,
    paymentFailed: input.subscription.paymentFailed,
    planState: input.subscription.planState,
    requiresSubscription: input.subscription.requiresSubscription,
    subscriptionStatus: input.subscription.subscriptionStatus,
    usageCounters: input.usageCounters,
  });
  const accountState = resolveAccountSnapshotState({
    entitlement,
    termsAccepted,
  });

  return {
    action: "created",
    ok: true,
    snapshot: {
      accountStatus: accountState.accountStatus,
      billingPortalAvailable: false,
      billingPortalUrl: null,
      canTranscribe: accountState.canTranscribe,
      email,
      isTrialExhausted: input.usageCounters.isTrialExhausted,
      isTrialLow: input.usageCounters.isTrialLow,
      lifetimeWordsUsed: input.usageCounters.lifetimeWordsUsed,
      monthlyPeriodStart: input.usageCounters.monthlyPeriodStart,
      monthlyWordsUsed: input.usageCounters.monthlyWordsUsed,
      planState: entitlement.planState,
      preflightPolicy: rubyWhisperQuotaPreflightPolicy,
      termsAccepted,
      trialWordsLimit: input.usageCounters.trialWordsLimit,
      trialWordsRemaining: input.usageCounters.trialWordsRemaining,
      trialWordsUsed: input.usageCounters.trialWordsUsed,
      ...(accountState.failureCode
        ? { failureCode: accountState.failureCode }
        : {}),
    },
  };
}

function resolveAccountSnapshotState({
  entitlement,
  termsAccepted,
}: Readonly<{
  entitlement: ReturnType<typeof evaluateRubyWhisperQuotaEntitlement>;
  termsAccepted: boolean;
}>): Readonly<{
  accountStatus: RubyWhisperDesktopAccountSnapshotStatus;
  canTranscribe: boolean;
  failureCode?: RubyWhisperDesktopAccountSnapshotFailureCode;
}> {
  if (!termsAccepted) {
    return {
      accountStatus: "terms_required",
      canTranscribe: false,
      failureCode: "terms_required",
    };
  }

  if (entitlement.ok) {
    return {
      accountStatus: "active",
      canTranscribe: true,
    };
  }

  return {
    accountStatus: entitlement.errorCode,
    canTranscribe: false,
    failureCode: entitlement.errorCode,
  };
}

function invalidInputResult(
  code: RubyWhisperDesktopAccountSnapshotError["code"],
  message: string,
): RubyWhisperDesktopAccountSnapshotResult {
  return {
    error: { code, message },
    ok: false,
    status: "invalid_input",
  };
}

function normalizeAccountSnapshotText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeAccountSnapshotTimestamp(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

import "server-only";

import {
  createRubyWhisperUsageQuotaState,
  normalizeRubyWhisperUsageWordCount,
  type RubyWhisperUsagePlanState,
} from "./quota";
import {
  prepareRubyWhisperUsageCounterIncrement,
  type RubyWhisperUsageCounters,
  type SupabaseUsageCounterUpsert,
} from "./supabase-usage-counters";

export const rubyWhisperQuotaPreflightPolicy =
  "allow_if_started_under_limit" as const;

export type RubyWhisperQuotaErrorCode =
  | "account_blocked"
  | "payment_failed"
  | "subscription_required"
  | "trial_exhausted";

export type RubyWhisperQuotaMetadata = Readonly<{
  isTrialLow: boolean;
  planState: RubyWhisperUsagePlanState;
  trialWordsLimit: number;
  trialWordsRemaining: number;
  trialWordsUsed: number;
}>;

export type RubyWhisperQuotaEntitlementInput = Readonly<{
  friendOfRubyUntil?: Date | string | null;
  isBlocked?: boolean;
  now?: Date | string;
  paymentFailed?: boolean;
  planState?: string | null;
  requiresSubscription?: boolean;
  subscriptionStatus?: string | null;
  usageCounters: RubyWhisperUsageCounters;
}>;

export type RubyWhisperQuotaAllowedResult = Readonly<{
  canTranscribe: true;
  metadata: RubyWhisperQuotaMetadata;
  ok: true;
  planState: RubyWhisperUsagePlanState;
  preflightPolicy: typeof rubyWhisperQuotaPreflightPolicy;
  status: "allowed";
}>;

export type RubyWhisperQuotaRejectedResult = Readonly<{
  canTranscribe: false;
  errorCode: RubyWhisperQuotaErrorCode;
  metadata: RubyWhisperQuotaMetadata;
  ok: false;
  planState: RubyWhisperUsagePlanState;
  preflightPolicy: typeof rubyWhisperQuotaPreflightPolicy;
  status:
    | "account_blocked"
    | "payment_failed"
    | "subscription_required"
    | "trial_exhausted";
}>;

export type RubyWhisperQuotaEntitlementResult =
  | RubyWhisperQuotaAllowedResult
  | RubyWhisperQuotaRejectedResult;

export type RubyWhisperQuotaUsageIncrementInput =
  RubyWhisperQuotaEntitlementInput &
    Readonly<{
      billableWordCount?: unknown;
      entitlement?: RubyWhisperQuotaEntitlementResult;
    }>;

export type RubyWhisperQuotaUsageIncrementResult =
  | Readonly<{
      billableWordCount: number;
      counters: RubyWhisperUsageCounters;
      ok: true;
      planState: RubyWhisperUsagePlanState;
      preflightPolicy: typeof rubyWhisperQuotaPreflightPolicy;
      usageCounter: SupabaseUsageCounterUpsert;
      willExhaustTrial: boolean;
    }>
  | RubyWhisperQuotaRejectedResult;

const activeSubscriptionStatuses = new Set(["active", "trialing"]);
const paymentFailureSubscriptionStatuses = new Set([
  "incomplete",
  "incomplete_expired",
  "past_due",
  "unpaid",
]);

export function evaluateRubyWhisperQuotaEntitlement(
  input: RubyWhisperQuotaEntitlementInput,
): RubyWhisperQuotaEntitlementResult {
  const subscriptionStatus = normalizeQuotaText(input.subscriptionStatus);
  const hasActiveSubscription =
    activeSubscriptionStatuses.has(subscriptionStatus);
  const paymentFailed =
    input.paymentFailed ||
    paymentFailureSubscriptionStatuses.has(subscriptionStatus) ||
    input.planState === "payment_failed";
  const requiresSubscription =
    input.requiresSubscription || input.planState === "subscription_required";

  if (input.isBlocked || input.planState === "blocked") {
    return rejectedQuotaResult("blocked", "account_blocked", input.usageCounters);
  }

  if (paymentFailed) {
    return rejectedQuotaResult(
      "payment_failed",
      "payment_failed",
      input.usageCounters,
    );
  }

  const quotaState = createRubyWhisperUsageQuotaState({
    friendOfRubyUntil: input.friendOfRubyUntil,
    hasActiveSubscription,
    now: input.now,
    planState: input.planState,
    trialWordsLimit: input.usageCounters.trialWordsLimit,
    trialWordsUsed: input.usageCounters.trialWordsUsed,
  });

  if (
    requiresSubscription &&
    !hasActiveSubscription &&
    quotaState.planState !== "friend_of_ruby_active"
  ) {
    return rejectedQuotaResult(
      "subscription_required",
      "subscription_required",
      input.usageCounters,
    );
  }

  if (!quotaState.canTranscribe) {
    return rejectedQuotaResult(
      quotaState.planState,
      quotaErrorCodeForPlanState(quotaState.planState),
      input.usageCounters,
    );
  }

  return {
    canTranscribe: true,
    metadata: quotaMetadata(quotaState.planState, input.usageCounters),
    ok: true,
    planState: quotaState.planState,
    preflightPolicy: rubyWhisperQuotaPreflightPolicy,
    status: "allowed",
  };
}

export function prepareRubyWhisperQuotaUsageIncrement(
  input: RubyWhisperQuotaUsageIncrementInput,
): RubyWhisperQuotaUsageIncrementResult {
  const entitlement =
    input.entitlement ?? evaluateRubyWhisperQuotaEntitlement(input);

  if (!entitlement.ok) {
    return entitlement;
  }

  const billableWordCount = normalizeRubyWhisperUsageWordCount(
    input.billableWordCount,
  );
  const incrementResult = prepareRubyWhisperUsageCounterIncrement({
    billableWordCount,
    clerkUserId: input.usageCounters.clerkUserId,
    currentCounters: input.usageCounters,
    incrementTrialWords: entitlement.planState === "trial_active",
    now: input.now,
  });

  if (!incrementResult.ok) {
    return rejectedQuotaResult(
      "subscription_required",
      "subscription_required",
      input.usageCounters,
    );
  }

  return {
    billableWordCount,
    counters: incrementResult.counters,
    ok: true,
    planState: entitlement.planState,
    preflightPolicy: rubyWhisperQuotaPreflightPolicy,
    usageCounter: incrementResult.usageCounter,
    willExhaustTrial:
      entitlement.planState === "trial_active" &&
      input.usageCounters.trialWordsRemaining > 0 &&
      incrementResult.counters.trialWordsRemaining === 0,
  };
}

function rejectedQuotaResult(
  planState: RubyWhisperUsagePlanState,
  errorCode: RubyWhisperQuotaErrorCode,
  counters: RubyWhisperUsageCounters,
): RubyWhisperQuotaRejectedResult {
  return {
    canTranscribe: false,
    errorCode,
    metadata: quotaMetadata(planState, counters),
    ok: false,
    planState,
    preflightPolicy: rubyWhisperQuotaPreflightPolicy,
    status: errorCode,
  };
}

function quotaMetadata(
  planState: RubyWhisperUsagePlanState,
  counters: RubyWhisperUsageCounters,
): RubyWhisperQuotaMetadata {
  return {
    isTrialLow: counters.isTrialLow,
    planState,
    trialWordsLimit: counters.trialWordsLimit,
    trialWordsRemaining: counters.trialWordsRemaining,
    trialWordsUsed: counters.trialWordsUsed,
  };
}

function quotaErrorCodeForPlanState(
  planState: RubyWhisperUsagePlanState,
): RubyWhisperQuotaErrorCode {
  switch (planState) {
    case "blocked":
      return "account_blocked";
    case "payment_failed":
      return "payment_failed";
    case "subscription_required":
      return "subscription_required";
    case "friend_of_ruby_active":
    case "paid_active":
    case "trial_active":
    case "trial_exhausted":
      return "trial_exhausted";
  }
}

function normalizeQuotaText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

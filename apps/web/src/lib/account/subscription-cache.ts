import "server-only";

import {
  createSupabaseServiceRoleClient,
  type SupabaseServiceRoleClientFactory,
} from "@/lib/supabase/server";
import type { RubyWhisperUsagePlanState } from "@/lib/usage/quota";

export const supabaseSubscriptionCacheTableName = "subscriptions" as const;
export const supabaseSubscriptionCacheColumns =
  "clerk_user_id,status,plan,current_period_end,friend_of_ruby_until,updated_at" as const;

export const stripeSubscriptionStatusesGrantingRubyWhisperAccess = [
  "active",
  "trialing",
] as const;
export const stripeSubscriptionStatusesRequiringBillingAttention = [
  "incomplete",
  "incomplete_expired",
  "past_due",
  "unpaid",
] as const;
export const stripeSubscriptionStatusesRequiringRubyWhisperSubscription = [
  "canceled",
  "paused",
] as const;

export type RubyWhisperSubscriptionPlan =
  | "annual"
  | "friend_of_ruby"
  | "monthly"
  | "trial"
  | "unknown";

export type SupabaseSubscriptionCacheRow = Readonly<{
  clerk_user_id: string;
  current_period_end: string | null;
  friend_of_ruby_until: string | null;
  plan: string;
  status: string;
  updated_at: string | null;
}>;

export type RubyWhisperSubscriptionCache = Readonly<{
  clerkUserId: string;
  hasActiveSubscription: boolean;
  isFriendOfRubyActive: boolean;
  paymentFailed: boolean;
  plan: RubyWhisperSubscriptionPlan;
  planState: RubyWhisperUsagePlanState;
  requiresSubscription: boolean;
  currentPeriodEnd?: string;
  friendOfRubyUntil?: string;
  subscriptionStatus?: string;
  updatedAt?: string;
}>;

export type RubyWhisperSubscriptionCacheError = Readonly<{
  code: "missing_clerk_user_id" | "supabase_subscription_cache_read_failed";
  message: string;
}>;

export type RubyWhisperSubscriptionCacheFailure = Readonly<{
  error: RubyWhisperSubscriptionCacheError;
  ok: false;
  status: "missing_user" | "read_failed";
}>;

export type RubyWhisperSubscriptionCacheReadResult =
  | Readonly<{
      action: "defaulted" | "found";
      ok: true;
      subscription: RubyWhisperSubscriptionCache;
    }>
  | RubyWhisperSubscriptionCacheFailure;

export type ReadRubyWhisperSubscriptionCacheInput = Readonly<{
  clerkUserId?: string | null;
  now?: Date | string;
}>;

export type SupabaseSubscriptionCacheSingleResult = Readonly<{
  data: SupabaseSubscriptionCacheRow | null;
  error: unknown | null;
}>;

export type SupabaseSubscriptionCacheSelectQuery = Readonly<{
  eq: (
    columnName: "clerk_user_id",
    clerkUserId: string,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseSubscriptionCacheSingleResult>;
  }>;
}>;

export type SupabaseSubscriptionCacheTableQuery = Readonly<{
  select: (
    columns: typeof supabaseSubscriptionCacheColumns,
  ) => SupabaseSubscriptionCacheSelectQuery;
}>;

export type SupabaseSubscriptionCacheClient = Readonly<{
  from: (
    tableName: typeof supabaseSubscriptionCacheTableName,
  ) => SupabaseSubscriptionCacheTableQuery;
}>;

const activeSubscriptionStatuses = new Set<string>(
  stripeSubscriptionStatusesGrantingRubyWhisperAccess,
);
const billingAttentionSubscriptionStatuses = new Set<string>(
  stripeSubscriptionStatusesRequiringBillingAttention,
);
const subscriptionRequiredStatuses = new Set<string>(
  stripeSubscriptionStatusesRequiringRubyWhisperSubscription,
);

export async function readRubyWhisperSubscriptionCache<
  Client extends SupabaseSubscriptionCacheClient,
>(
  input: ReadRubyWhisperSubscriptionCacheInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<RubyWhisperSubscriptionCacheReadResult> {
  const clerkUserId = normalizeSubscriptionText(input.clerkUserId);

  if (!clerkUserId) {
    return missingUserResult();
  }

  const client = createSupabaseServiceRoleClient(createClient);
  const { data, error } = await client
    .from(supabaseSubscriptionCacheTableName)
    .select(supabaseSubscriptionCacheColumns)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    return {
      error: {
        code: "supabase_subscription_cache_read_failed",
        message: "Unable to read subscription metadata.",
      },
      ok: false,
      status: "read_failed",
    };
  }

  if (!data) {
    return {
      action: "defaulted",
      ok: true,
      subscription: createDefaultSubscriptionCache(clerkUserId),
    };
  }

  return {
    action: "found",
    ok: true,
    subscription: normalizeSubscriptionCacheRow(data, input.now),
  };
}

function createDefaultSubscriptionCache(
  clerkUserId: string,
): RubyWhisperSubscriptionCache {
  return {
    clerkUserId,
    hasActiveSubscription: false,
    isFriendOfRubyActive: false,
    paymentFailed: false,
    plan: "trial",
    planState: "trial_active",
    requiresSubscription: false,
  };
}

function normalizeSubscriptionCacheRow(
  row: SupabaseSubscriptionCacheRow,
  nowInput?: Date | string,
): RubyWhisperSubscriptionCache {
  const clerkUserId = normalizeSubscriptionText(row.clerk_user_id);
  const subscriptionStatus = normalizeSubscriptionText(row.status).toLowerCase();
  const hasActiveSubscription =
    activeSubscriptionStatuses.has(subscriptionStatus);
  const paymentFailed =
    billingAttentionSubscriptionStatuses.has(subscriptionStatus);
  const friendOfRubyUntil = normalizeSubscriptionTimestamp(
    row.friend_of_ruby_until,
  );
  const isFriendOfRubyActive = isFutureDate(friendOfRubyUntil, nowInput);
  const requiresSubscription =
    subscriptionRequiredStatuses.has(subscriptionStatus) &&
    !isFriendOfRubyActive;
  const planState = normalizeSubscriptionPlanState({
    hasActiveSubscription,
    isFriendOfRubyActive,
    paymentFailed,
    requiresSubscription,
  });
  const currentPeriodEnd = normalizeSubscriptionTimestamp(
    row.current_period_end,
  );
  const updatedAt = normalizeSubscriptionTimestamp(row.updated_at);

  return {
    clerkUserId,
    hasActiveSubscription,
    isFriendOfRubyActive,
    paymentFailed,
    plan: normalizeSubscriptionPlan(row.plan),
    planState,
    requiresSubscription,
    ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
    ...(friendOfRubyUntil ? { friendOfRubyUntil } : {}),
    ...(subscriptionStatus ? { subscriptionStatus } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function normalizeSubscriptionPlanState({
  hasActiveSubscription,
  isFriendOfRubyActive,
  paymentFailed,
  requiresSubscription,
}: Readonly<{
  hasActiveSubscription: boolean;
  isFriendOfRubyActive: boolean;
  paymentFailed: boolean;
  requiresSubscription: boolean;
}>): RubyWhisperUsagePlanState {
  if (paymentFailed) {
    return "payment_failed";
  }

  if (isFriendOfRubyActive) {
    return "friend_of_ruby_active";
  }

  if (hasActiveSubscription) {
    return "paid_active";
  }

  if (requiresSubscription) {
    return "subscription_required";
  }

  return "trial_active";
}

function normalizeSubscriptionPlan(
  value: string | null | undefined,
): RubyWhisperSubscriptionPlan {
  const plan = normalizeSubscriptionText(value)
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

  switch (plan) {
    case "annual":
    case "friend_of_ruby":
    case "monthly":
    case "trial":
      return plan;
    default:
      return plan ? "unknown" : "trial";
  }
}

function missingUserResult(): RubyWhisperSubscriptionCacheFailure {
  return {
    error: {
      code: "missing_clerk_user_id",
      message: "A Clerk user ID is required for subscription metadata.",
    },
    ok: false,
    status: "missing_user",
  };
}

function normalizeSubscriptionText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeSubscriptionTimestamp(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function isFutureDate(
  value: string | undefined,
  nowInput: Date | string | undefined,
) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const now = nowInput ? new Date(nowInput) : new Date();

  return (
    Number.isFinite(date.getTime()) &&
    Number.isFinite(now.getTime()) &&
    date.getTime() > now.getTime()
  );
}

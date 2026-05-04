import "server-only";

import type Stripe from "stripe";

import type { SupabaseServiceRoleClientFactory } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { StripeBillingPriceIds, StripeBillingPlan } from "./stripe";

export const supabaseStripeSubscriptionCacheTableName =
  "subscriptions" as const;
export const supabaseStripeSubscriptionCacheColumns =
  "clerk_user_id,stripe_customer_id,stripe_subscription_id,status,plan,current_period_end,friend_of_ruby_until,updated_at" as const;
export const supabaseStripeSubscriptionCacheUpsertConflictTarget =
  "clerk_user_id" as const;

export const stripeSubscriptionCacheEventTypes = [
  "customer.subscription.created",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.updated",
] as const;

export type StripeSubscriptionCacheEventType =
  (typeof stripeSubscriptionCacheEventTypes)[number];

export type SupabaseStripeSubscriptionCacheWriteRow = Readonly<{
  clerk_user_id: string;
  current_period_end: string | null;
  friend_of_ruby_until: string | null;
  plan: StripeBillingPlan | "friend_of_ruby" | "unknown";
  status: Stripe.Subscription.Status | "canceled";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  updated_at: string;
}>;

export type StripeSubscriptionCacheError = Readonly<{
  code:
    | "missing_stripe_subscription_cache_metadata"
    | "supabase_subscription_cache_write_failed"
    | "unsupported_stripe_subscription_event";
  message: string;
}>;

export type StripeSubscriptionCacheEvent = Pick<
  Stripe.Event,
  "data" | "type"
>;
type StripeSubscriptionCustomer = Stripe.Subscription["customer"];
type StripeSubscriptionWithLegacyPeriod = Stripe.Subscription &
  Readonly<{
    current_period_end?: number | null;
  }>;

export type NormalizeStripeSubscriptionCacheEventInput = Readonly<{
  event: StripeSubscriptionCacheEvent;
  now?: Date | string;
  priceIds?: Partial<StripeBillingPriceIds>;
}>;

export type StripeSubscriptionCacheMapResult =
  | Readonly<{
      action: "mapped";
      ok: true;
      row: SupabaseStripeSubscriptionCacheWriteRow;
      status: "mapped";
    }>
  | Readonly<{
      action: "ignored";
      error: StripeSubscriptionCacheError;
      ok: false;
      status: "ignored" | "missing_metadata";
    }>;

export type StripeSubscriptionCacheUpsertResult =
  | Readonly<{
      action: "upserted";
      ok: true;
      row: SupabaseStripeSubscriptionCacheWriteRow;
      status: "written";
    }>
  | Readonly<{
      action: "ignored" | "upsert_failed";
      error: StripeSubscriptionCacheError;
      ok: false;
      status: "ignored" | "missing_metadata" | "write_failed";
    }>;

export type SupabaseStripeSubscriptionCacheSingleResult = Readonly<{
  data: SupabaseStripeSubscriptionCacheWriteRow | null;
  error: unknown | null;
}>;

export type SupabaseStripeSubscriptionCacheUpsertQuery = Readonly<{
  select: (
    columns: typeof supabaseStripeSubscriptionCacheColumns,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseStripeSubscriptionCacheSingleResult>;
  }>;
}>;

export type SupabaseStripeSubscriptionCacheTableQuery = Readonly<{
  upsert: (
    row: SupabaseStripeSubscriptionCacheWriteRow,
    options: Readonly<{
      onConflict: typeof supabaseStripeSubscriptionCacheUpsertConflictTarget;
    }>,
  ) => SupabaseStripeSubscriptionCacheUpsertQuery;
}>;

export type SupabaseStripeSubscriptionCacheClient = Readonly<{
  from: (
    tableName: typeof supabaseStripeSubscriptionCacheTableName,
  ) => SupabaseStripeSubscriptionCacheTableQuery;
}>;

const recognizedEventTypes = new Set<string>(stripeSubscriptionCacheEventTypes);
const stripeSubscriptionStatuses = new Set<string>([
  "active",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "past_due",
  "paused",
  "trialing",
  "unpaid",
]);
const entitlementGrantingStatuses = new Set<string>(["active", "trialing"]);

export function mapStripeSubscriptionEventToCacheRow(
  input: NormalizeStripeSubscriptionCacheEventInput,
): StripeSubscriptionCacheMapResult {
  const eventType = normalizeMetadataText(input.event.type);

  if (!recognizedEventTypes.has(eventType)) {
    return unsupportedEventResult();
  }

  const subscription = input.event.data.object;

  if (!isStripeSubscriptionObject(subscription)) {
    return missingMetadataResult();
  }

  const subscriptionMetadata = normalizeMetadata(subscription.metadata);
  const customer = subscription.customer;
  const customerMetadata = isStripeCustomerObject(customer)
    ? normalizeMetadata(customer.metadata)
    : {};
  const clerkUserId = normalizeMetadataText(
    firstMetadataValue([subscriptionMetadata, customerMetadata], [
      "clerkUserId",
      "rubyWhisperClerkUserId",
      "clerk_user_id",
      "ruby_whisper_clerk_user_id",
    ]),
  );

  if (!clerkUserId) {
    return missingMetadataResult();
  }

  const friendOfRubyUntil = normalizeMetadataTimestamp(
    firstMetadataValue([subscriptionMetadata, customerMetadata], [
      "friendOfRubyUntil",
      "rubyWhisperFriendOfRubyUntil",
      "friend_of_ruby_until",
      "ruby_whisper_friend_of_ruby_until",
    ]),
  );
  const isFriendOfRubyActive = isFutureDate(friendOfRubyUntil, input.now);
  const plan = normalizeRubyWhisperPlan({
    customerMetadata,
    friendOfRubyUntil,
    isFriendOfRubyActive,
    priceIds: input.priceIds,
    subscription,
    subscriptionMetadata,
  });
  const status = normalizeSafeStripeSubscriptionStatus({
    eventType,
    isFriendOfRubyActive,
    plan,
    status: subscription.status,
  });

  return {
    action: "mapped",
    ok: true,
    row: {
      clerk_user_id: clerkUserId,
      current_period_end: normalizeSubscriptionCurrentPeriodEnd(subscription),
      friend_of_ruby_until: friendOfRubyUntil ?? null,
      plan,
      status,
      stripe_customer_id: normalizeStripeCustomerId(customer),
      stripe_subscription_id: normalizeStripeSubscriptionId(subscription.id),
      updated_at: normalizeOutputTimestamp(input.now),
    },
    status: "mapped",
  };
}

export async function upsertStripeSubscriptionCacheFromEvent<
  Client extends SupabaseStripeSubscriptionCacheClient,
>(
  input: NormalizeStripeSubscriptionCacheEventInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<StripeSubscriptionCacheUpsertResult> {
  const mapped = mapStripeSubscriptionEventToCacheRow(input);

  if (!mapped.ok) {
    return mapped;
  }

  try {
    const client = createSupabaseServiceRoleClient(createClient);
    const { data, error } = await client
      .from(supabaseStripeSubscriptionCacheTableName)
      .upsert(mapped.row, {
        onConflict: supabaseStripeSubscriptionCacheUpsertConflictTarget,
      })
      .select(supabaseStripeSubscriptionCacheColumns)
      .maybeSingle();

    if (error || !data) {
      return writeFailedResult();
    }

    return {
      action: "upserted",
      ok: true,
      row: data,
      status: "written",
    };
  } catch {
    return writeFailedResult();
  }
}

function normalizeRubyWhisperPlan(
  input: Readonly<{
    customerMetadata: Stripe.Metadata;
    friendOfRubyUntil: string | undefined;
    isFriendOfRubyActive: boolean;
    priceIds: Partial<StripeBillingPriceIds> | undefined;
    subscription: Stripe.Subscription;
    subscriptionMetadata: Stripe.Metadata;
  }>,
): SupabaseStripeSubscriptionCacheWriteRow["plan"] {
  const metadataPlan = normalizePlanText(
    firstMetadataValue([input.subscriptionMetadata, input.customerMetadata], [
      "rubyWhisperPlan",
      "plan",
      "ruby_whisper_plan",
    ]),
  );

  if (metadataPlan === "monthly" || metadataPlan === "annual") {
    return metadataPlan;
  }

  if (metadataPlan === "friend_of_ruby" && input.isFriendOfRubyActive) {
    return "friend_of_ruby";
  }

  const pricePlan = normalizePlanFromPriceIds(input.subscription, input.priceIds);

  if (pricePlan) {
    return pricePlan;
  }

  return input.friendOfRubyUntil && input.isFriendOfRubyActive
    ? "friend_of_ruby"
    : "unknown";
}

function normalizePlanFromPriceIds(
  subscription: Stripe.Subscription,
  priceIds: Partial<StripeBillingPriceIds> | undefined,
): StripeBillingPlan | undefined {
  if (!priceIds) {
    return undefined;
  }

  const stripePriceIds = new Set<string>();

  for (const item of subscription.items?.data ?? []) {
    const priceId = normalizeMetadataText(item.price?.id);

    if (priceId) {
      stripePriceIds.add(priceId);
    }
  }

  if (priceIds.monthly && stripePriceIds.has(priceIds.monthly)) {
    return "monthly";
  }

  if (priceIds.annual && stripePriceIds.has(priceIds.annual)) {
    return "annual";
  }

  return undefined;
}

function normalizeSafeStripeSubscriptionStatus(
  input: Readonly<{
    eventType: string;
    isFriendOfRubyActive: boolean;
    plan: SupabaseStripeSubscriptionCacheWriteRow["plan"];
    status: string | null | undefined;
  }>,
): SupabaseStripeSubscriptionCacheWriteRow["status"] {
  if (input.eventType === "customer.subscription.deleted") {
    return "canceled";
  }

  const status = normalizeMetadataText(input.status).toLowerCase();
  const normalizedStatus = stripeSubscriptionStatuses.has(status)
    ? (status as Stripe.Subscription.Status)
    : "canceled";

  if (
    entitlementGrantingStatuses.has(normalizedStatus) &&
    input.plan === "unknown" &&
    !input.isFriendOfRubyActive
  ) {
    return "canceled";
  }

  return normalizedStatus;
}

function firstMetadataValue(
  metadataRecords: readonly Stripe.Metadata[],
  keys: readonly string[],
) {
  for (const metadata of metadataRecords) {
    for (const key of keys) {
      const value = metadata[key];

      if (normalizeMetadataText(value)) {
        return value;
      }
    }
  }

  return undefined;
}

function normalizeMetadata(
  value: Stripe.Metadata | null | undefined,
): Stripe.Metadata {
  return value ?? {};
}

function normalizePlanText(value: string | null | undefined) {
  return normalizeMetadataText(value).toLowerCase().replace(/[-\s]+/g, "_");
}

function normalizeMetadataText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeStripeCustomerId(value: StripeSubscriptionCustomer) {
  if (typeof value === "string") {
    return /^cus_[A-Za-z0-9_]+$/.test(value) ? value : null;
  }

  return isStripeCustomerObject(value) && /^cus_[A-Za-z0-9_]+$/.test(value.id)
    ? value.id
    : null;
}

function normalizeStripeSubscriptionId(value: string | null | undefined) {
  const subscriptionId = normalizeMetadataText(value);

  return /^sub_[A-Za-z0-9_]+$/.test(subscriptionId) ? subscriptionId : null;
}

function normalizeSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription) {
  const legacyCurrentPeriodEnd = (
    subscription as StripeSubscriptionWithLegacyPeriod
  ).current_period_end;

  if (Number.isFinite(legacyCurrentPeriodEnd)) {
    return normalizeStripeUnixTimestamp(legacyCurrentPeriodEnd);
  }

  const itemPeriodEnds = subscription.items.data
    .map((item) => item.current_period_end)
    .filter(Number.isFinite);

  return normalizeStripeUnixTimestamp(itemPeriodEnds[0]);
}

function normalizeStripeUnixTimestamp(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return new Date(Number(value) * 1000).toISOString();
}

function normalizeMetadataTimestamp(value: string | null | undefined) {
  const timestampValue = normalizeMetadataText(value);

  if (!timestampValue) {
    return undefined;
  }

  const numericTimestamp = Number(timestampValue);
  const date = Number.isFinite(numericTimestamp)
    ? new Date(numericTimestamp * 1000)
    : new Date(timestampValue);

  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function normalizeOutputTimestamp(value: Date | string | undefined) {
  const date = value ? new Date(value) : new Date();

  return Number.isFinite(date.getTime())
    ? date.toISOString()
    : new Date(0).toISOString();
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

function isStripeSubscriptionObject(
  value: Stripe.Event.Data.Object,
): value is Stripe.Subscription {
  return (
    !!value &&
    typeof value === "object" &&
    "object" in value &&
    value.object === "subscription"
  );
}

function isStripeCustomerObject(
  value: StripeSubscriptionCustomer,
): value is Stripe.Customer {
  return (
    !!value &&
    typeof value === "object" &&
    "object" in value &&
    value.object === "customer"
  );
}

function unsupportedEventResult(): StripeSubscriptionCacheMapResult {
  return {
    action: "ignored",
    error: {
      code: "unsupported_stripe_subscription_event",
      message: "Stripe event type is not handled by subscription cache sync.",
    },
    ok: false,
    status: "ignored",
  };
}

function missingMetadataResult(): StripeSubscriptionCacheMapResult {
  return {
    action: "ignored",
    error: {
      code: "missing_stripe_subscription_cache_metadata",
      message: "Required Stripe subscription metadata is missing.",
    },
    ok: false,
    status: "missing_metadata",
  };
}

function writeFailedResult(): StripeSubscriptionCacheUpsertResult {
  return {
    action: "upsert_failed",
    error: {
      code: "supabase_subscription_cache_write_failed",
      message: "Unable to write subscription cache metadata.",
    },
    ok: false,
    status: "write_failed",
  };
}

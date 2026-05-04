import "server-only";

import type Stripe from "stripe";

import {
  stripeBillingApiVersion,
  type StripeBillingContext,
} from "@/lib/billing/stripe";
import type { FriendOfRubyBatchMetadata } from "@/lib/friend-of-ruby/batches";

export const friendOfRubyStripeAccessMonths = 12 as const;
export const friendOfRubyStripePercentOff = 100 as const;

export type FriendOfRubyStripeClient = Readonly<{
  coupons: Readonly<{
    create: (
      params: Stripe.CouponCreateParams,
      options?: Stripe.RequestOptions,
    ) => PromiseLike<Stripe.Coupon>;
  }>;
  promotionCodes: Readonly<{
    create: (
      params: Stripe.PromotionCodeCreateParams,
      options?: Stripe.RequestOptions,
    ) => PromiseLike<Stripe.PromotionCode>;
  }>;
}>;

export type FriendOfRubyStripeErrorCode =
  | "invalid_friend_of_ruby_batch_code"
  | "invalid_friend_of_ruby_batch_id"
  | "invalid_friend_of_ruby_expiration"
  | "invalid_friend_of_ruby_max_redemptions"
  | "stripe_friend_of_ruby_coupon_create_failed"
  | "stripe_friend_of_ruby_promotion_code_create_failed";

export type FriendOfRubyStripeError = Readonly<{
  code: FriendOfRubyStripeErrorCode;
  message: string;
}>;

export type FriendOfRubyStripeFailure<
  Status extends
    | "coupon_create_failed"
    | "invalid_code"
    | "invalid_expiration"
    | "invalid_max_redemptions"
    | "invalid_metadata"
    | "promotion_code_create_failed",
> = Readonly<{
  error: FriendOfRubyStripeError;
  ok: false;
  status: Status;
}>;

export type CreateFriendOfRubyStripePromotionCodeInput<
  Client extends FriendOfRubyStripeClient,
> = Readonly<{
  batch: Pick<
    FriendOfRubyBatchMetadata,
    "code" | "expiresAt" | "id" | "maxRedemptions"
  >;
  context: Pick<StripeBillingContext<Client>, "apiVersion" | "client">;
  now?: Date | string;
}>;

export type FriendOfRubyStripeCreationRequest = Readonly<{
  coupon: Stripe.CouponCreateParams;
  couponOptions: Stripe.RequestOptions;
  promotionCode: Stripe.PromotionCodeCreateParams;
  promotionCodeOptions: Stripe.RequestOptions;
}>;

export type CreateFriendOfRubyStripePromotionCodeResult =
  | Readonly<{
      action: "created";
      couponId: string;
      ok: true;
      promotionCode: string;
      stripePromotionCodeId: string;
      status: "created";
    }>
  | FriendOfRubyStripeFailure<
      | "coupon_create_failed"
      | "invalid_code"
      | "invalid_expiration"
      | "invalid_max_redemptions"
      | "invalid_metadata"
      | "promotion_code_create_failed"
    >;

type NormalizedFriendOfRubyStripeBatch = Readonly<{
  code: string;
  expiresAt: number | null;
  id: string | null;
  maxRedemptions: number;
  metadata: Stripe.MetadataParam;
}>;

const friendOfRubyCodePattern = /^[A-Z0-9][A-Z0-9_-]{2,63}$/;
const maxFriendOfRubyRedemptions = 10_000;
const stripeCouponIdPattern = /^coupon_[A-Za-z0-9_]{3,255}$/;
const stripePromotionCodeIdPattern = /^promo_[A-Za-z0-9_]{3,255}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createFriendOfRubyStripeCreationRequest(
  batch: Pick<
    FriendOfRubyBatchMetadata,
    "code" | "expiresAt" | "id" | "maxRedemptions"
  >,
  now: Date | string = new Date(),
):
  | Readonly<{
      ok: true;
      request: FriendOfRubyStripeCreationRequest;
    }>
  | FriendOfRubyStripeFailure<
      | "invalid_code"
      | "invalid_expiration"
      | "invalid_max_redemptions"
      | "invalid_metadata"
    > {
  const normalizedBatch = normalizeFriendOfRubyStripeBatch(batch, now);

  if (!normalizedBatch.ok) {
    return normalizedBatch;
  }

  const coupon: Stripe.CouponCreateParams = {
    duration: "repeating",
    duration_in_months: friendOfRubyStripeAccessMonths,
    max_redemptions: normalizedBatch.batch.maxRedemptions,
    metadata: normalizedBatch.batch.metadata,
    name: `Friend of Ruby ${normalizedBatch.batch.code}`,
    percent_off: friendOfRubyStripePercentOff,
    ...(normalizedBatch.batch.expiresAt
      ? { redeem_by: normalizedBatch.batch.expiresAt }
      : {}),
  };
  const promotionCode: Stripe.PromotionCodeCreateParams = {
    active: true,
    code: normalizedBatch.batch.code,
    max_redemptions: normalizedBatch.batch.maxRedemptions,
    metadata: normalizedBatch.batch.metadata,
    promotion: {
      coupon: "",
      type: "coupon",
    },
    ...(normalizedBatch.batch.expiresAt
      ? { expires_at: normalizedBatch.batch.expiresAt }
      : {}),
  };

  return {
    ok: true,
    request: {
      coupon,
      couponOptions: {
        idempotencyKey: `friend-of-ruby-coupon-${normalizedBatch.batch.code}`,
      },
      promotionCode,
      promotionCodeOptions: {
        idempotencyKey: `friend-of-ruby-promotion-code-${normalizedBatch.batch.code}`,
      },
    },
  };
}

export async function createFriendOfRubyStripePromotionCode<
  Client extends FriendOfRubyStripeClient,
>(
  input: CreateFriendOfRubyStripePromotionCodeInput<Client>,
): Promise<CreateFriendOfRubyStripePromotionCodeResult> {
  const request = createFriendOfRubyStripeCreationRequest(
    input.batch,
    input.now,
  );

  if (!request.ok) {
    return request;
  }

  let couponId: string | null;

  try {
    const coupon = await input.context.client.coupons.create(
      request.request.coupon,
      request.request.couponOptions,
    );
    couponId = normalizeStripeCouponId(coupon.id);
  } catch {
    return couponCreateFailedResult();
  }

  if (!couponId) {
    return couponCreateFailedResult();
  }

  try {
    const promotionCode = await input.context.client.promotionCodes.create(
      {
        ...request.request.promotionCode,
        promotion: {
          coupon: couponId,
          type: "coupon",
        },
      },
      request.request.promotionCodeOptions,
    );
    const stripePromotionCodeId = normalizeStripePromotionCodeId(
      promotionCode.id,
    );

    if (!stripePromotionCodeId) {
      return promotionCodeCreateFailedResult();
    }

    return {
      action: "created",
      couponId,
      ok: true,
      promotionCode: request.request.promotionCode.code as string,
      status: "created",
      stripePromotionCodeId,
    };
  } catch {
    return promotionCodeCreateFailedResult();
  }
}

export function getFriendOfRubyStripeApiVersion() {
  return stripeBillingApiVersion;
}

function normalizeFriendOfRubyStripeBatch(
  batch: Pick<
    FriendOfRubyBatchMetadata,
    "code" | "expiresAt" | "id" | "maxRedemptions"
  >,
  now: Date | string,
):
  | Readonly<{
      batch: NormalizedFriendOfRubyStripeBatch;
      ok: true;
    }>
  | FriendOfRubyStripeFailure<
      | "invalid_code"
      | "invalid_expiration"
      | "invalid_max_redemptions"
      | "invalid_metadata"
    > {
  const code = normalizeFriendOfRubyCode(batch.code);

  if (!code) {
    return invalidCodeResult();
  }

  const maxRedemptions = normalizeMaxRedemptions(batch.maxRedemptions);

  if (!maxRedemptions) {
    return invalidMaxRedemptionsResult();
  }

  const expiresAt = normalizeOptionalFutureTimestamp(batch.expiresAt, now);

  if (expiresAt.status === "invalid") {
    return invalidExpirationResult();
  }

  const id = normalizeOptionalBatchId(batch.id);

  if (id.status === "invalid") {
    return invalidMetadataResult();
  }

  return {
    batch: {
      code,
      expiresAt: expiresAt.value,
      id: id.value,
      maxRedemptions,
      metadata: {
        friend_of_ruby_batch_code: code,
        ...(id.value ? { friend_of_ruby_batch_id: id.value } : {}),
      },
    },
    ok: true,
  };
}

function normalizeFriendOfRubyCode(value: string | null | undefined) {
  const code = normalizeText(value).toUpperCase();

  return friendOfRubyCodePattern.test(code) ? code : null;
}

function normalizeMaxRedemptions(value: number | null | undefined) {
  if (
    !Number.isInteger(value) ||
    !value ||
    value < 1 ||
    value > maxFriendOfRubyRedemptions
  ) {
    return null;
  }

  return value;
}

function normalizeOptionalFutureTimestamp(
  value: string | null | undefined,
  now: Date | string,
):
  | Readonly<{
      status: "valid";
      value: number | null;
    }>
  | Readonly<{
      status: "invalid";
    }> {
  if (value === null || value === undefined || value === "") {
    return { status: "valid", value: null };
  }

  const timestamp = new Date(value);
  const currentTimestamp = new Date(now);

  if (
    !Number.isFinite(timestamp.getTime()) ||
    !Number.isFinite(currentTimestamp.getTime())
  ) {
    return { status: "invalid" };
  }

  const expiresAt = Math.floor(timestamp.getTime() / 1000);
  const currentTime = Math.floor(currentTimestamp.getTime() / 1000);

  if (expiresAt <= currentTime) {
    return { status: "invalid" };
  }

  return { status: "valid", value: expiresAt };
}

function normalizeOptionalBatchId(value: string | null | undefined):
  | Readonly<{
      status: "valid";
      value: string | null;
    }>
  | Readonly<{
      status: "invalid";
    }> {
  const text = normalizeText(value);

  if (!text) {
    return { status: "valid", value: null };
  }

  if (!uuidPattern.test(text)) {
    return { status: "invalid" };
  }

  return { status: "valid", value: text };
}

function normalizeStripeCouponId(value: string | undefined) {
  const text = normalizeText(value);

  return stripeCouponIdPattern.test(text) && isSafeStripeIdentifier(text)
    ? text
    : null;
}

function normalizeStripePromotionCodeId(value: string | undefined) {
  const text = normalizeText(value);

  return stripePromotionCodeIdPattern.test(text) && isSafeStripeIdentifier(text)
    ? text
    : null;
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function isSafeStripeIdentifier(value: string) {
  return !/(?:payload|private|secret|sk_(?:test|live))/i.test(value);
}

function invalidCodeResult(): FriendOfRubyStripeFailure<"invalid_code"> {
  return {
    error: {
      code: "invalid_friend_of_ruby_batch_code",
      message: "Friend of Ruby Stripe promotion code metadata is not valid.",
    },
    ok: false,
    status: "invalid_code",
  };
}

function invalidMaxRedemptionsResult(): FriendOfRubyStripeFailure<"invalid_max_redemptions"> {
  return {
    error: {
      code: "invalid_friend_of_ruby_max_redemptions",
      message:
        "Friend of Ruby Stripe max redemptions must be a positive bounded integer.",
    },
    ok: false,
    status: "invalid_max_redemptions",
  };
}

function invalidExpirationResult(): FriendOfRubyStripeFailure<"invalid_expiration"> {
  return {
    error: {
      code: "invalid_friend_of_ruby_expiration",
      message: "Friend of Ruby Stripe expiration must be a future timestamp.",
    },
    ok: false,
    status: "invalid_expiration",
  };
}

function invalidMetadataResult(): FriendOfRubyStripeFailure<"invalid_metadata"> {
  return {
    error: {
      code: "invalid_friend_of_ruby_batch_id",
      message: "Friend of Ruby Stripe batch metadata is not valid.",
    },
    ok: false,
    status: "invalid_metadata",
  };
}

function couponCreateFailedResult(): FriendOfRubyStripeFailure<"coupon_create_failed"> {
  return {
    error: {
      code: "stripe_friend_of_ruby_coupon_create_failed",
      message: "Unable to create Friend of Ruby Stripe coupon.",
    },
    ok: false,
    status: "coupon_create_failed",
  };
}

function promotionCodeCreateFailedResult(): FriendOfRubyStripeFailure<"promotion_code_create_failed"> {
  return {
    error: {
      code: "stripe_friend_of_ruby_promotion_code_create_failed",
      message: "Unable to create Friend of Ruby Stripe promotion code.",
    },
    ok: false,
    status: "promotion_code_create_failed",
  };
}

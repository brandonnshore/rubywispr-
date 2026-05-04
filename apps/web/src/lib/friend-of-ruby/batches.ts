import "server-only";

import {
  createSupabaseServiceRoleClient,
  type SupabaseServiceRoleClientFactory,
} from "@/lib/supabase/server";

export const supabaseFriendOfRubyBatchesTableName =
  "friend_of_ruby_batches" as const;
export const supabaseFriendOfRubyBatchColumns =
  "id,created_by_clerk_user_id,stripe_promotion_code_id,code,max_redemptions,expires_at,created_at" as const;

export type SupabaseFriendOfRubyBatchRow = Readonly<{
  code: string;
  created_at: string | null;
  created_by_clerk_user_id: string;
  expires_at: string | null;
  id: string;
  max_redemptions: number;
  stripe_promotion_code_id: string | null;
}>;

export type SupabaseFriendOfRubyBatchInsert = Readonly<{
  code: string;
  created_by_clerk_user_id: string;
  expires_at: string | null;
  max_redemptions: number;
  stripe_promotion_code_id: string | null;
}>;

export type FriendOfRubyBatchMetadata = Readonly<{
  code: string;
  createdByClerkUserId: string;
  maxRedemptions: number;
  createdAt?: string;
  expiresAt?: string;
  id?: string;
  stripePromotionCodeId?: string;
}>;

export type FriendOfRubyBatchMetadataError = Readonly<{
  code:
    | "blank_friend_of_ruby_code"
    | "invalid_friend_of_ruby_expiration"
    | "invalid_friend_of_ruby_max_redemptions"
    | "invalid_friend_of_ruby_stripe_promotion_code_id"
    | "missing_clerk_user_id"
    | "supabase_friend_of_ruby_batch_create_failed"
    | "supabase_friend_of_ruby_batch_read_failed"
    | "unsafe_friend_of_ruby_batch_metadata";
  message: string;
}>;

export type FriendOfRubyBatchMetadataFailure<
  Status extends
    | "create_failed"
    | "invalid_code"
    | "invalid_expiration"
    | "invalid_max_redemptions"
    | "invalid_metadata"
    | "invalid_stripe_promotion_code"
    | "missing_creator"
    | "read_failed",
> = Readonly<{
  error: FriendOfRubyBatchMetadataError;
  ok: false;
  status: Status;
}>;

export type CreateFriendOfRubyBatchMetadataInput = Readonly<{
  code?: string | null;
  createdByClerkUserId?: string | null;
  expiresAt?: Date | string | null;
  maxRedemptions?: number | null;
  stripePromotionCodeId?: string | null;
}>;

export type FriendOfRubyBatchLookupByCodeInput = Readonly<{
  code?: string | null;
}>;

export type FriendOfRubyBatchLookupByStripePromotionCodeInput = Readonly<{
  stripePromotionCodeId?: string | null;
}>;

export type CreateFriendOfRubyBatchMetadataResult =
  | Readonly<{
      action: "created";
      batch: FriendOfRubyBatchMetadata;
      ok: true;
      status: "created";
    }>
  | FriendOfRubyBatchMetadataFailure<
      | "create_failed"
      | "invalid_code"
      | "invalid_expiration"
      | "invalid_max_redemptions"
      | "invalid_metadata"
      | "invalid_stripe_promotion_code"
      | "missing_creator"
    >;

export type ReadFriendOfRubyBatchMetadataResult =
  | Readonly<{
      action: "found";
      batch: FriendOfRubyBatchMetadata;
      ok: true;
      status: "found";
    }>
  | Readonly<{
      action: "missing";
      ok: true;
      status: "missing";
    }>
  | FriendOfRubyBatchMetadataFailure<
      | "invalid_code"
      | "invalid_metadata"
      | "invalid_stripe_promotion_code"
      | "read_failed"
    >;

export type SupabaseFriendOfRubyBatchSingleResult = Readonly<{
  data: SupabaseFriendOfRubyBatchRow | null;
  error: unknown | null;
}>;

export type SupabaseFriendOfRubyBatchInsertQuery = Readonly<{
  select: (
    columns: typeof supabaseFriendOfRubyBatchColumns,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseFriendOfRubyBatchSingleResult>;
  }>;
}>;

export type SupabaseFriendOfRubyBatchSelectQuery = Readonly<{
  eq: (
    columnName: "code" | "stripe_promotion_code_id",
    value: string,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseFriendOfRubyBatchSingleResult>;
  }>;
}>;

export type SupabaseFriendOfRubyBatchesTableQuery = Readonly<{
  insert: (
    batch: SupabaseFriendOfRubyBatchInsert,
  ) => SupabaseFriendOfRubyBatchInsertQuery;
  select: (
    columns: typeof supabaseFriendOfRubyBatchColumns,
  ) => SupabaseFriendOfRubyBatchSelectQuery;
}>;

export type SupabaseFriendOfRubyBatchClient = Readonly<{
  from: (
    tableName: typeof supabaseFriendOfRubyBatchesTableName,
  ) => SupabaseFriendOfRubyBatchesTableQuery;
}>;

type NormalizedFriendOfRubyBatchInput = Readonly<{
  code: string;
  createdByClerkUserId: string;
  expiresAt: string | null;
  maxRedemptions: number;
  stripePromotionCodeId: string | null;
}>;

const clerkUserIdPattern = /^user_[A-Za-z0-9_-]{3,127}$/;
const friendOfRubyCodePattern = /^[A-Z0-9][A-Z0-9_-]{2,63}$/;
const stripePromotionCodeIdPattern = /^promo_[A-Za-z0-9_]{3,255}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createFriendOfRubyBatchMetadata<
  Client extends SupabaseFriendOfRubyBatchClient,
>(
  input: CreateFriendOfRubyBatchMetadataInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<CreateFriendOfRubyBatchMetadataResult> {
  const normalizedInput = normalizeCreateFriendOfRubyBatchInput(input);

  if (!normalizedInput.ok) {
    return normalizedInput;
  }

  try {
    const client = createSupabaseServiceRoleClient(createClient);
    const { data, error } = await client
      .from(supabaseFriendOfRubyBatchesTableName)
      .insert({
        code: normalizedInput.batch.code,
        created_by_clerk_user_id: normalizedInput.batch.createdByClerkUserId,
        expires_at: normalizedInput.batch.expiresAt,
        max_redemptions: normalizedInput.batch.maxRedemptions,
        stripe_promotion_code_id: normalizedInput.batch.stripePromotionCodeId,
      })
      .select(supabaseFriendOfRubyBatchColumns)
      .maybeSingle();

    if (error || !data) {
      return createFailedResult();
    }

    const normalizedRow = normalizeFriendOfRubyBatchRow(data);

    if (!normalizedRow.ok) {
      return normalizedRow;
    }

    return {
      action: "created",
      batch: normalizedRow.batch,
      ok: true,
      status: "created",
    };
  } catch {
    return createFailedResult();
  }
}

export async function readFriendOfRubyBatchMetadataByCode<
  Client extends SupabaseFriendOfRubyBatchClient,
>(
  input: FriendOfRubyBatchLookupByCodeInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<ReadFriendOfRubyBatchMetadataResult> {
  const code = normalizeFriendOfRubyBatchCode(input.code);

  if (code.status === "blank") {
    return blankCodeResult();
  }

  if (code.status === "unsafe") {
    return unsafeMetadataResult();
  }

  return readFriendOfRubyBatchMetadata("code", code.value, createClient);
}

export async function readFriendOfRubyBatchMetadataByStripePromotionCodeId<
  Client extends SupabaseFriendOfRubyBatchClient,
>(
  input: FriendOfRubyBatchLookupByStripePromotionCodeInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<ReadFriendOfRubyBatchMetadataResult> {
  const stripePromotionCodeId = normalizeStripePromotionCodeId(
    input.stripePromotionCodeId,
  );

  if (stripePromotionCodeId.status === "blank") {
    return invalidStripePromotionCodeResult();
  }

  if (stripePromotionCodeId.status === "unsafe") {
    return unsafeMetadataResult();
  }

  return readFriendOfRubyBatchMetadata(
    "stripe_promotion_code_id",
    stripePromotionCodeId.value,
    createClient,
  );
}

export function normalizeFriendOfRubyBatchRow(
  row: SupabaseFriendOfRubyBatchRow,
):
  | Readonly<{
      batch: FriendOfRubyBatchMetadata;
      ok: true;
    }>
  | FriendOfRubyBatchMetadataFailure<"invalid_metadata"> {
  const createdByClerkUserId = normalizeClerkUserId(
    row.created_by_clerk_user_id,
  );
  const code = normalizeFriendOfRubyBatchCode(row.code);
  const maxRedemptions = normalizeMaxRedemptions(row.max_redemptions);
  const expiresAt = normalizeOptionalTimestamp(row.expires_at);
  const createdAt = normalizeOptionalTimestamp(row.created_at);
  const stripePromotionCodeId = normalizeStripePromotionCodeId(
    row.stripe_promotion_code_id,
  );
  const id = normalizeUuid(row.id);

  if (
    createdByClerkUserId.status !== "valid" ||
    code.status !== "valid" ||
    maxRedemptions.status !== "valid" ||
    expiresAt.status === "invalid" ||
    createdAt.status === "invalid" ||
    stripePromotionCodeId.status === "unsafe"
  ) {
    return unsafeStoredMetadataResult();
  }

  return {
    batch: {
      code: code.value,
      createdByClerkUserId: createdByClerkUserId.value,
      maxRedemptions: maxRedemptions.value,
      ...(createdAt.value ? { createdAt: createdAt.value } : {}),
      ...(expiresAt.value ? { expiresAt: expiresAt.value } : {}),
      ...(id ? { id } : {}),
      ...(stripePromotionCodeId.value
        ? { stripePromotionCodeId: stripePromotionCodeId.value }
        : {}),
    },
    ok: true,
  };
}

async function readFriendOfRubyBatchMetadata<
  Client extends SupabaseFriendOfRubyBatchClient,
>(
  columnName: "code" | "stripe_promotion_code_id",
  value: string,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<ReadFriendOfRubyBatchMetadataResult> {
  try {
    const client = createSupabaseServiceRoleClient(createClient);
    const { data, error } = await client
      .from(supabaseFriendOfRubyBatchesTableName)
      .select(supabaseFriendOfRubyBatchColumns)
      .eq(columnName, value)
      .maybeSingle();

    if (error) {
      return readFailedResult();
    }

    if (!data) {
      return {
        action: "missing",
        ok: true,
        status: "missing",
      };
    }

    const normalizedRow = normalizeFriendOfRubyBatchRow(data);

    if (!normalizedRow.ok) {
      return normalizedRow;
    }

    return {
      action: "found",
      batch: normalizedRow.batch,
      ok: true,
      status: "found",
    };
  } catch {
    return readFailedResult();
  }
}

function normalizeCreateFriendOfRubyBatchInput(
  input: CreateFriendOfRubyBatchMetadataInput,
):
  | Readonly<{
      batch: NormalizedFriendOfRubyBatchInput;
      ok: true;
    }>
  | FriendOfRubyBatchMetadataFailure<
      | "invalid_code"
      | "invalid_expiration"
      | "invalid_max_redemptions"
      | "invalid_metadata"
      | "invalid_stripe_promotion_code"
      | "missing_creator"
    > {
  const createdByClerkUserId = normalizeClerkUserId(input.createdByClerkUserId);

  if (createdByClerkUserId.status === "blank") {
    return missingCreatorResult();
  }

  if (createdByClerkUserId.status === "unsafe") {
    return unsafeMetadataResult();
  }

  const code = normalizeFriendOfRubyBatchCode(input.code);

  if (code.status === "blank") {
    return blankCodeResult();
  }

  if (code.status === "unsafe") {
    return unsafeMetadataResult();
  }

  const maxRedemptions = normalizeMaxRedemptions(input.maxRedemptions);

  if (maxRedemptions.status !== "valid") {
    return invalidMaxRedemptionsResult();
  }

  const expiresAt = normalizeOptionalTimestamp(input.expiresAt);

  if (expiresAt.status === "invalid") {
    return invalidExpirationResult();
  }

  const stripePromotionCodeId = normalizeStripePromotionCodeId(
    input.stripePromotionCodeId,
  );

  if (stripePromotionCodeId.status === "unsafe") {
    return invalidStripePromotionCodeResult();
  }

  return {
    batch: {
      code: code.value,
      createdByClerkUserId: createdByClerkUserId.value,
      expiresAt: expiresAt.value,
      maxRedemptions: maxRedemptions.value,
      stripePromotionCodeId: stripePromotionCodeId.value,
    },
    ok: true,
  };
}

function normalizeClerkUserId(value: string | null | undefined) {
  const text = normalizeText(value);

  if (!text) {
    return { status: "blank" as const };
  }

  if (!clerkUserIdPattern.test(text)) {
    return { status: "unsafe" as const };
  }

  return { status: "valid" as const, value: text };
}

function normalizeFriendOfRubyBatchCode(value: string | null | undefined) {
  const text = normalizeText(value).toUpperCase();

  if (!text) {
    return { status: "blank" as const };
  }

  if (!friendOfRubyCodePattern.test(text)) {
    return { status: "unsafe" as const };
  }

  return { status: "valid" as const, value: text };
}

function normalizeMaxRedemptions(value: number | null | undefined) {
  if (!Number.isInteger(value) || !value || value < 1) {
    return { status: "invalid" as const };
  }

  return { status: "valid" as const, value };
}

function normalizeOptionalTimestamp(
  value: Date | string | null | undefined,
):
  | Readonly<{
      status: "valid";
      value: string | null;
    }>
  | Readonly<{
      status: "invalid";
    }> {
  if (value === null || value === undefined || value === "") {
    return { status: "valid", value: null };
  }

  const timestamp = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(timestamp.getTime())) {
    return { status: "invalid" };
  }

  return { status: "valid", value: timestamp.toISOString() };
}

function normalizeStripePromotionCodeId(value: string | null | undefined) {
  const text = normalizeText(value);

  if (!text) {
    return { status: "blank" as const, value: null };
  }

  if (!stripePromotionCodeIdPattern.test(text)) {
    return { status: "unsafe" as const };
  }

  return { status: "valid" as const, value: text };
}

function normalizeUuid(value: string | null | undefined) {
  const text = normalizeText(value);

  return uuidPattern.test(text) ? text : undefined;
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function missingCreatorResult(): FriendOfRubyBatchMetadataFailure<"missing_creator"> {
  return {
    error: {
      code: "missing_clerk_user_id",
      message: "A Clerk user ID is required for Friend of Ruby batch metadata.",
    },
    ok: false,
    status: "missing_creator",
  };
}

function blankCodeResult(): FriendOfRubyBatchMetadataFailure<"invalid_code"> {
  return {
    error: {
      code: "blank_friend_of_ruby_code",
      message: "A Friend of Ruby batch code is required.",
    },
    ok: false,
    status: "invalid_code",
  };
}

function invalidMaxRedemptionsResult(): FriendOfRubyBatchMetadataFailure<"invalid_max_redemptions"> {
  return {
    error: {
      code: "invalid_friend_of_ruby_max_redemptions",
      message: "Friend of Ruby max redemptions must be a positive integer.",
    },
    ok: false,
    status: "invalid_max_redemptions",
  };
}

function invalidExpirationResult(): FriendOfRubyBatchMetadataFailure<"invalid_expiration"> {
  return {
    error: {
      code: "invalid_friend_of_ruby_expiration",
      message: "Friend of Ruby expiration must be a valid timestamp.",
    },
    ok: false,
    status: "invalid_expiration",
  };
}

function invalidStripePromotionCodeResult(): FriendOfRubyBatchMetadataFailure<"invalid_stripe_promotion_code"> {
  return {
    error: {
      code: "invalid_friend_of_ruby_stripe_promotion_code_id",
      message: "Stripe promotion code metadata is not valid.",
    },
    ok: false,
    status: "invalid_stripe_promotion_code",
  };
}

function unsafeMetadataResult(): FriendOfRubyBatchMetadataFailure<"invalid_metadata"> {
  return {
    error: {
      code: "unsafe_friend_of_ruby_batch_metadata",
      message: "Friend of Ruby batch metadata is not safe to store.",
    },
    ok: false,
    status: "invalid_metadata",
  };
}

function unsafeStoredMetadataResult(): FriendOfRubyBatchMetadataFailure<"invalid_metadata"> {
  return {
    error: {
      code: "unsafe_friend_of_ruby_batch_metadata",
      message: "Friend of Ruby batch metadata is not safe to return.",
    },
    ok: false,
    status: "invalid_metadata",
  };
}

function createFailedResult(): FriendOfRubyBatchMetadataFailure<"create_failed"> {
  return {
    error: {
      code: "supabase_friend_of_ruby_batch_create_failed",
      message: "Unable to create Friend of Ruby batch metadata.",
    },
    ok: false,
    status: "create_failed",
  };
}

function readFailedResult(): FriendOfRubyBatchMetadataFailure<"read_failed"> {
  return {
    error: {
      code: "supabase_friend_of_ruby_batch_read_failed",
      message: "Unable to read Friend of Ruby batch metadata.",
    },
    ok: false,
    status: "read_failed",
  };
}

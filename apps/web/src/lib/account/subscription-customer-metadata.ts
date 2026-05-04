import "server-only";

import {
  createSupabaseServiceRoleClient,
  type SupabaseServiceRoleClientFactory,
} from "@/lib/supabase/server";

export const supabaseSubscriptionCustomerMetadataTableName =
  "subscriptions" as const;
export const supabaseSubscriptionCustomerMetadataColumns =
  "clerk_user_id,stripe_customer_id" as const;

export type SupabaseSubscriptionCustomerMetadataRow = Readonly<{
  clerk_user_id: string;
  stripe_customer_id: string | null;
}>;

export type RubyWhisperSubscriptionCustomerMetadata = Readonly<{
  clerkUserId: string;
  stripeCustomerId?: string;
}>;

export type RubyWhisperSubscriptionCustomerMetadataError = Readonly<{
  code:
    | "missing_clerk_user_id"
    | "supabase_subscription_customer_metadata_read_failed";
  message: string;
}>;

export type RubyWhisperSubscriptionCustomerMetadataFailure = Readonly<{
  error: RubyWhisperSubscriptionCustomerMetadataError;
  ok: false;
  status: "missing_user" | "read_failed";
}>;

export type RubyWhisperSubscriptionCustomerMetadataReadResult =
  | Readonly<{
      action: "found" | "missing";
      customerMetadata: RubyWhisperSubscriptionCustomerMetadata;
      ok: true;
    }>
  | RubyWhisperSubscriptionCustomerMetadataFailure;

export type ReadRubyWhisperSubscriptionCustomerMetadataInput = Readonly<{
  clerkUserId?: string | null;
}>;

export type SupabaseSubscriptionCustomerMetadataSingleResult = Readonly<{
  data: SupabaseSubscriptionCustomerMetadataRow | null;
  error: unknown | null;
}>;

export type SupabaseSubscriptionCustomerMetadataSelectQuery = Readonly<{
  eq: (
    columnName: "clerk_user_id",
    clerkUserId: string,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseSubscriptionCustomerMetadataSingleResult>;
  }>;
}>;

export type SupabaseSubscriptionCustomerMetadataTableQuery = Readonly<{
  select: (
    columns: typeof supabaseSubscriptionCustomerMetadataColumns,
  ) => SupabaseSubscriptionCustomerMetadataSelectQuery;
}>;

export type SupabaseSubscriptionCustomerMetadataClient = Readonly<{
  from: (
    tableName: typeof supabaseSubscriptionCustomerMetadataTableName,
  ) => SupabaseSubscriptionCustomerMetadataTableQuery;
}>;

export async function readRubyWhisperSubscriptionCustomerMetadata<
  Client extends SupabaseSubscriptionCustomerMetadataClient,
>(
  input: ReadRubyWhisperSubscriptionCustomerMetadataInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<RubyWhisperSubscriptionCustomerMetadataReadResult> {
  const clerkUserId = normalizeSubscriptionCustomerText(input.clerkUserId);

  if (!clerkUserId) {
    return missingUserResult();
  }

  const client = createSupabaseServiceRoleClient(createClient);
  const { data, error } = await client
    .from(supabaseSubscriptionCustomerMetadataTableName)
    .select(supabaseSubscriptionCustomerMetadataColumns)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    return {
      error: {
        code: "supabase_subscription_customer_metadata_read_failed",
        message: "Unable to read billing customer metadata.",
      },
      ok: false,
      status: "read_failed",
    };
  }

  return normalizeSubscriptionCustomerMetadataResult(clerkUserId, data);
}

function normalizeSubscriptionCustomerMetadataResult(
  clerkUserId: string,
  row: SupabaseSubscriptionCustomerMetadataRow | null,
): RubyWhisperSubscriptionCustomerMetadataReadResult {
  const stripeCustomerId = normalizeStripeCustomerId(row?.stripe_customer_id);

  if (!row || !stripeCustomerId) {
    return {
      action: "missing",
      customerMetadata: {
        clerkUserId,
      },
      ok: true,
    };
  }

  return {
    action: "found",
    customerMetadata: {
      clerkUserId,
      stripeCustomerId,
    },
    ok: true,
  };
}

function normalizeStripeCustomerId(value: string | null | undefined) {
  const customerId = normalizeSubscriptionCustomerText(value);

  return customerId && /^cus_[A-Za-z0-9_]+$/.test(customerId)
    ? customerId
    : undefined;
}

function normalizeSubscriptionCustomerText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
}

function missingUserResult(): RubyWhisperSubscriptionCustomerMetadataFailure {
  return {
    error: {
      code: "missing_clerk_user_id",
      message: "A Clerk user ID is required for billing customer metadata.",
    },
    ok: false,
    status: "missing_user",
  };
}

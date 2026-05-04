import "server-only";

import {
  createSupabaseServiceRoleClient,
  type SupabaseServiceRoleClientFactory,
} from "@/lib/supabase/server";

export const supabaseAccountProfilesTableName = "profiles" as const;
export const supabaseAccountProfileColumns =
  "clerk_user_id,email,terms_accepted_at,is_blocked" as const;

export type SupabaseAccountProfileRow = Readonly<{
  clerk_user_id: string;
  email: string;
  is_blocked: boolean;
  terms_accepted_at: string | null;
}>;

export type RubyWhisperAccountProfileMetadata = Readonly<{
  clerkUserId: string;
  email: string;
  isBlocked: boolean;
  termsAcceptedAt?: string;
}>;

export type RubyWhisperAccountProfileMetadataError = Readonly<{
  code:
    | "missing_account_email"
    | "missing_clerk_user_id"
    | "supabase_account_profile_missing"
    | "supabase_account_profile_read_failed";
  message: string;
}>;

export type RubyWhisperAccountProfileMetadataFailure = Readonly<{
  clerkUserId?: string;
  error: RubyWhisperAccountProfileMetadataError;
  ok: false;
  status:
    | "missing_email"
    | "missing_profile"
    | "missing_user"
    | "read_failed";
}>;

export type RubyWhisperAccountProfileMetadataReadResult =
  | Readonly<{
      action: "found";
      ok: true;
      profile: RubyWhisperAccountProfileMetadata;
    }>
  | RubyWhisperAccountProfileMetadataFailure;

export type ReadRubyWhisperAccountProfileMetadataInput = Readonly<{
  clerkUserId?: string | null;
}>;

export type SupabaseAccountProfileSingleResult = Readonly<{
  data: SupabaseAccountProfileRow | null;
  error: unknown | null;
}>;

export type SupabaseAccountProfileSelectQuery = Readonly<{
  eq: (
    columnName: "clerk_user_id",
    clerkUserId: string,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseAccountProfileSingleResult>;
  }>;
}>;

export type SupabaseAccountProfilesQuery = Readonly<{
  select: (
    columns: typeof supabaseAccountProfileColumns,
  ) => SupabaseAccountProfileSelectQuery;
}>;

export type SupabaseAccountProfileClient = Readonly<{
  from: (
    tableName: typeof supabaseAccountProfilesTableName,
  ) => SupabaseAccountProfilesQuery;
}>;

export async function readRubyWhisperAccountProfileMetadata<
  Client extends SupabaseAccountProfileClient,
>(
  input: ReadRubyWhisperAccountProfileMetadataInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<RubyWhisperAccountProfileMetadataReadResult> {
  const clerkUserId = normalizeAccountProfileText(input.clerkUserId);

  if (!clerkUserId) {
    return missingUserResult();
  }

  const client = createSupabaseServiceRoleClient(createClient);
  const { data, error } = await client
    .from(supabaseAccountProfilesTableName)
    .select(supabaseAccountProfileColumns)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    return {
      clerkUserId,
      error: {
        code: "supabase_account_profile_read_failed",
        message: "Unable to read account profile metadata.",
      },
      ok: false,
      status: "read_failed",
    };
  }

  if (!data) {
    return {
      clerkUserId,
      error: {
        code: "supabase_account_profile_missing",
        message: "An account profile is required for account metadata.",
      },
      ok: false,
      status: "missing_profile",
    };
  }

  return normalizeAccountProfileRow(clerkUserId, data);
}

function normalizeAccountProfileRow(
  expectedClerkUserId: string,
  row: SupabaseAccountProfileRow,
): RubyWhisperAccountProfileMetadataReadResult {
  const clerkUserId = normalizeAccountProfileText(row.clerk_user_id);
  const email = normalizeAccountProfileText(row.email);
  const termsAcceptedAt = normalizeAccountProfileTimestamp(
    row.terms_accepted_at,
  );

  if (!email) {
    return {
      clerkUserId: clerkUserId || expectedClerkUserId,
      error: {
        code: "missing_account_email",
        message: "An account email is required for account metadata.",
      },
      ok: false,
      status: "missing_email",
    };
  }

  return {
    action: "found",
    ok: true,
    profile: {
      clerkUserId: clerkUserId || expectedClerkUserId,
      email,
      isBlocked: row.is_blocked === true,
      ...(termsAcceptedAt ? { termsAcceptedAt } : {}),
    },
  };
}

function missingUserResult(): RubyWhisperAccountProfileMetadataFailure {
  return {
    error: {
      code: "missing_clerk_user_id",
      message: "A Clerk user ID is required for account profile metadata.",
    },
    ok: false,
    status: "missing_user",
  };
}

function normalizeAccountProfileText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeAccountProfileTimestamp(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

import "server-only";

import {
  createSupabaseServiceRoleClient,
  type SupabaseServiceRoleClientFactory,
} from "@/lib/supabase/server";

export const supabaseProfilesTableName = "profiles" as const;
export const supabaseProfilesUpsertConflictTarget = "clerk_user_id" as const;

export type ClerkSupabaseProfileSyncInput = Readonly<{
  clerkUserId?: string | null;
  primaryEmail?: string | null;
}>;

export type SupabaseProfileMetadataUpsert = Readonly<{
  clerk_user_id: string;
  email: string;
}>;

export type ClerkSupabaseProfileSyncError = Readonly<{
  code:
    | "missing_clerk_user_id"
    | "missing_primary_email"
    | "supabase_profile_sync_failed";
  message: string;
}>;

export type ClerkSupabaseProfilePreparedResult = Readonly<{
  action: "prepared";
  ok: true;
  profile: SupabaseProfileMetadataUpsert;
}>;

export type ClerkSupabaseProfileUpsertedResult = Readonly<{
  action: "upserted";
  ok: true;
  profile: SupabaseProfileMetadataUpsert;
}>;

export type ClerkSupabaseProfileSyncFailure = Readonly<{
  error: ClerkSupabaseProfileSyncError;
  ok: false;
}>;

export type ClerkSupabaseProfilePrepareResult =
  | ClerkSupabaseProfilePreparedResult
  | ClerkSupabaseProfileSyncFailure;

export type ClerkSupabaseProfileSyncResult =
  | ClerkSupabaseProfileUpsertedResult
  | ClerkSupabaseProfileSyncFailure;

export type SupabaseProfileSyncUpsertResult = Readonly<{
  data: unknown;
  error: unknown | null;
}>;

export type SupabaseProfilesUpsertQuery = Readonly<{
  upsert: (
    profile: SupabaseProfileMetadataUpsert,
    options: Readonly<{ onConflict: typeof supabaseProfilesUpsertConflictTarget }>,
  ) => PromiseLike<SupabaseProfileSyncUpsertResult>;
}>;

export type SupabaseProfileSyncClient = Readonly<{
  from: (tableName: typeof supabaseProfilesTableName) => SupabaseProfilesUpsertQuery;
}>;

export function prepareClerkUserSupabaseProfile(
  input: ClerkSupabaseProfileSyncInput,
): ClerkSupabaseProfilePrepareResult {
  const clerkUserId = normalizeProfileMetadataValue(input.clerkUserId);

  if (!clerkUserId) {
    return {
      error: {
        code: "missing_clerk_user_id",
        message: "A Clerk user ID is required to sync a Supabase profile.",
      },
      ok: false,
    };
  }

  const primaryEmail = normalizeProfileMetadataValue(input.primaryEmail);

  if (!primaryEmail) {
    return {
      error: {
        code: "missing_primary_email",
        message: "A Clerk primary email is required to sync a Supabase profile.",
      },
      ok: false,
    };
  }

  return {
    action: "prepared",
    ok: true,
    profile: {
      clerk_user_id: clerkUserId,
      email: primaryEmail,
    },
  };
}

export async function syncClerkUserSupabaseProfile<
  Client extends SupabaseProfileSyncClient,
>(
  input: ClerkSupabaseProfileSyncInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<ClerkSupabaseProfileSyncResult> {
  const preparedProfile = prepareClerkUserSupabaseProfile(input);

  if (!preparedProfile.ok) {
    return preparedProfile;
  }

  const client = createSupabaseServiceRoleClient(createClient);
  const { error } = await client
    .from(supabaseProfilesTableName)
    .upsert(preparedProfile.profile, {
      onConflict: supabaseProfilesUpsertConflictTarget,
    });

  if (error) {
    return {
      error: {
        code: "supabase_profile_sync_failed",
        message: "Unable to sync the Clerk user profile metadata.",
      },
      ok: false,
    };
  }

  return {
    action: "upserted",
    ok: true,
    profile: preparedProfile.profile,
  };
}

function normalizeProfileMetadataValue(value: string | null | undefined) {
  return value?.trim() ?? "";
}

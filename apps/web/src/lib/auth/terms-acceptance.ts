import "server-only";

import {
  createSupabaseServiceRoleClient,
  type SupabaseServiceRoleClientFactory,
} from "@/lib/supabase/server";

export const supabaseTermsAcceptanceProfilesTableName = "profiles" as const;
export const supabaseTermsAcceptanceProfileColumns =
  "clerk_user_id,terms_accepted_at" as const;

export type TermsAcceptanceInput = Readonly<{
  clerkUserId?: string | null;
}>;

export type RecordTermsAcceptanceInput = TermsAcceptanceInput &
  Readonly<{
    acceptedAt?: Date | string | null;
  }>;

export type SupabaseProfileTermsAcceptanceRow = Readonly<{
  clerk_user_id: string;
  terms_accepted_at: string | null;
}>;

export type TermsAcceptanceError = Readonly<{
  code:
    | "missing_clerk_user_id"
    | "missing_terms_acceptance"
    | "supabase_profile_missing"
    | "supabase_terms_acceptance_read_failed"
    | "supabase_terms_acceptance_write_failed";
  message: string;
}>;

export type TermsAcceptanceAcceptedResult = Readonly<{
  clerkUserId: string;
  ok: true;
  status: "accepted";
  termsAcceptedAt: string;
}>;

export type TermsAcceptanceFailure = Readonly<{
  clerkUserId?: string;
  error: TermsAcceptanceError;
  ok: false;
  status:
    | "missing_acceptance"
    | "missing_profile"
    | "missing_user"
    | "read_failed"
    | "write_failed";
}>;

export type TermsAcceptanceStatusResult =
  | TermsAcceptanceAcceptedResult
  | TermsAcceptanceFailure;

export type SupabaseTermsAcceptanceSingleResult = Readonly<{
  data: SupabaseProfileTermsAcceptanceRow | null;
  error: unknown | null;
}>;

export type SupabaseTermsAcceptanceSelectQuery = Readonly<{
  eq: (
    columnName: "clerk_user_id",
    clerkUserId: string,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseTermsAcceptanceSingleResult>;
  }>;
}>;

export type SupabaseTermsAcceptanceUpdateQuery = Readonly<{
  eq: (
    columnName: "clerk_user_id",
    clerkUserId: string,
  ) => Readonly<{
    select: (
      columns: typeof supabaseTermsAcceptanceProfileColumns,
    ) => Readonly<{
      maybeSingle: () => PromiseLike<SupabaseTermsAcceptanceSingleResult>;
    }>;
  }>;
}>;

export type SupabaseTermsAcceptanceProfilesQuery = Readonly<{
  select: (
    columns: typeof supabaseTermsAcceptanceProfileColumns,
  ) => SupabaseTermsAcceptanceSelectQuery;
  update: (
    profile: Readonly<{ terms_accepted_at: string }>,
  ) => SupabaseTermsAcceptanceUpdateQuery;
}>;

export type SupabaseTermsAcceptanceClient = Readonly<{
  from: (
    tableName: typeof supabaseTermsAcceptanceProfilesTableName,
  ) => SupabaseTermsAcceptanceProfilesQuery;
}>;

export async function readClerkUserTermsAcceptance<
  Client extends SupabaseTermsAcceptanceClient,
>(
  input: TermsAcceptanceInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<TermsAcceptanceStatusResult> {
  const clerkUserId = normalizeTermsAcceptanceValue(input.clerkUserId);

  if (!clerkUserId) {
    return missingUserResult();
  }

  const client = createSupabaseServiceRoleClient(createClient);
  const { data, error } = await client
    .from(supabaseTermsAcceptanceProfilesTableName)
    .select(supabaseTermsAcceptanceProfileColumns)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    return {
      clerkUserId,
      error: {
        code: "supabase_terms_acceptance_read_failed",
        message: "Unable to read Terms acceptance metadata.",
      },
      ok: false,
      status: "read_failed",
    };
  }

  return resolveTermsAcceptanceRow(clerkUserId, data);
}

export async function recordClerkUserTermsAcceptance<
  Client extends SupabaseTermsAcceptanceClient,
>(
  input: RecordTermsAcceptanceInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<TermsAcceptanceStatusResult> {
  const clerkUserId = normalizeTermsAcceptanceValue(input.clerkUserId);

  if (!clerkUserId) {
    return missingUserResult();
  }

  const acceptedAt = normalizeAcceptanceTimestamp(input.acceptedAt ?? new Date());
  const client = createSupabaseServiceRoleClient(createClient);
  const { data, error } = await client
    .from(supabaseTermsAcceptanceProfilesTableName)
    .update({ terms_accepted_at: acceptedAt })
    .eq("clerk_user_id", clerkUserId)
    .select(supabaseTermsAcceptanceProfileColumns)
    .maybeSingle();

  if (error) {
    return {
      clerkUserId,
      error: {
        code: "supabase_terms_acceptance_write_failed",
        message: "Unable to record Terms acceptance metadata.",
      },
      ok: false,
      status: "write_failed",
    };
  }

  return resolveTermsAcceptanceRow(clerkUserId, data);
}

function resolveTermsAcceptanceRow(
  clerkUserId: string,
  row: SupabaseProfileTermsAcceptanceRow | null,
): TermsAcceptanceStatusResult {
  if (!row) {
    return {
      clerkUserId,
      error: {
        code: "supabase_profile_missing",
        message: "A Supabase profile is required for Terms acceptance metadata.",
      },
      ok: false,
      status: "missing_profile",
    };
  }

  const termsAcceptedAt = normalizeTermsAcceptanceValue(row.terms_accepted_at);

  if (!termsAcceptedAt) {
    return {
      clerkUserId,
      error: {
        code: "missing_terms_acceptance",
        message: "Terms acceptance has not been recorded for this profile.",
      },
      ok: false,
      status: "missing_acceptance",
    };
  }

  return {
    clerkUserId,
    ok: true,
    status: "accepted",
    termsAcceptedAt,
  };
}

function missingUserResult(): TermsAcceptanceFailure {
  return {
    error: {
      code: "missing_clerk_user_id",
      message: "A Clerk user ID is required for Terms acceptance metadata.",
    },
    ok: false,
    status: "missing_user",
  };
}

function normalizeAcceptanceTimestamp(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return normalizeTermsAcceptanceValue(value);
}

function normalizeTermsAcceptanceValue(value: string | null | undefined) {
  return value?.trim() ?? "";
}

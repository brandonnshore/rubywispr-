import "server-only";

import {
  createSupabaseServiceRoleClient,
  type SupabaseServiceRoleClientFactory,
} from "@/lib/supabase/server";

export const supabaseAdminRolesTableName = "admin_roles" as const;
export const supabaseAdminRoleColumns = "clerk_user_id,role" as const;
export const rubyWhisperActiveAdminRole = "admin" as const;

export type RubyWhisperKnownAdminRole =
  | typeof rubyWhisperActiveAdminRole
  | "inactive"
  | "revoked";

export type SupabaseAdminRoleRow = Readonly<{
  clerk_user_id: string;
  role: string;
}>;

export type RubyWhisperAdminRoleLookupError = Readonly<{
  code:
    | "missing_clerk_user_id"
    | "supabase_admin_role_inactive"
    | "supabase_admin_role_missing"
    | "supabase_admin_role_read_failed"
    | "supabase_admin_role_revoked"
    | "supabase_admin_role_unrecognized";
  message: string;
}>;

export type RubyWhisperAdminRoleAllowedResult = Readonly<{
  action: "allowed";
  allowed: true;
  clerkUserId: string;
  ok: true;
  role: typeof rubyWhisperActiveAdminRole;
  status: "active_admin";
}>;

export type RubyWhisperAdminRoleDeniedResult = Readonly<{
  action: "denied";
  allowed: false;
  clerkUserId?: string;
  error: RubyWhisperAdminRoleLookupError;
  ok: false;
  role?: Exclude<RubyWhisperKnownAdminRole, typeof rubyWhisperActiveAdminRole>;
  status:
    | "inactive_role"
    | "missing_role"
    | "missing_user"
    | "read_failed"
    | "revoked_role"
    | "unrecognized_role";
}>;

export type RubyWhisperAdminRoleLookupResult =
  | RubyWhisperAdminRoleAllowedResult
  | RubyWhisperAdminRoleDeniedResult;

export type ReadRubyWhisperAdminRoleInput = Readonly<{
  clerkUserId?: string | null;
}>;

export type SupabaseAdminRoleSingleResult = Readonly<{
  data: SupabaseAdminRoleRow | null;
  error: unknown | null;
}>;

export type SupabaseAdminRoleSelectQuery = Readonly<{
  eq: (
    columnName: "clerk_user_id",
    clerkUserId: string,
  ) => Readonly<{
    maybeSingle: () => PromiseLike<SupabaseAdminRoleSingleResult>;
  }>;
}>;

export type SupabaseAdminRolesTableQuery = Readonly<{
  select: (
    columns: typeof supabaseAdminRoleColumns,
  ) => SupabaseAdminRoleSelectQuery;
}>;

export type SupabaseAdminRoleClient = Readonly<{
  from: (
    tableName: typeof supabaseAdminRolesTableName,
  ) => SupabaseAdminRolesTableQuery;
}>;

export async function lookupRubyWhisperAdminRole<
  Client extends SupabaseAdminRoleClient,
>(
  input: ReadRubyWhisperAdminRoleInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<RubyWhisperAdminRoleLookupResult> {
  const clerkUserId = normalizeAdminRoleText(input.clerkUserId);

  if (!clerkUserId) {
    return deniedResult({
      error: {
        code: "missing_clerk_user_id",
        message: "A Clerk user ID is required for admin authorization.",
      },
      status: "missing_user",
    });
  }

  let roleResult: SupabaseAdminRoleSingleResult;

  try {
    const client = createSupabaseServiceRoleClient(createClient);
    roleResult = await client
      .from(supabaseAdminRolesTableName)
      .select(supabaseAdminRoleColumns)
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
  } catch {
    return adminRoleReadFailedResult(clerkUserId);
  }

  if (roleResult.error) {
    return adminRoleReadFailedResult(clerkUserId);
  }

  if (!roleResult.data) {
    return deniedResult({
      clerkUserId,
      error: {
        code: "supabase_admin_role_missing",
        message: "No active admin role metadata was found.",
      },
      status: "missing_role",
    });
  }

  return normalizeAdminRoleRow(clerkUserId, roleResult.data);
}

function adminRoleReadFailedResult(
  clerkUserId: string,
): RubyWhisperAdminRoleDeniedResult {
  return deniedResult({
    clerkUserId,
    error: {
      code: "supabase_admin_role_read_failed",
      message: "Unable to read admin role metadata.",
    },
    status: "read_failed",
  });
}

function normalizeAdminRoleRow(
  expectedClerkUserId: string,
  row: SupabaseAdminRoleRow,
): RubyWhisperAdminRoleLookupResult {
  const clerkUserId =
    normalizeAdminRoleText(row.clerk_user_id) || expectedClerkUserId;
  const role = normalizeAdminRoleValue(row.role);

  switch (role) {
    case "admin":
      return {
        action: "allowed",
        allowed: true,
        clerkUserId,
        ok: true,
        role,
        status: "active_admin",
      };
    case "inactive":
      return deniedResult({
        clerkUserId,
        error: {
          code: "supabase_admin_role_inactive",
          message: "Admin role metadata is inactive.",
        },
        role,
        status: "inactive_role",
      });
    case "revoked":
      return deniedResult({
        clerkUserId,
        error: {
          code: "supabase_admin_role_revoked",
          message: "Admin role metadata is revoked.",
        },
        role,
        status: "revoked_role",
      });
    default:
      return deniedResult({
        clerkUserId,
        error: {
          code: "supabase_admin_role_unrecognized",
          message: "Admin role metadata is not recognized as active.",
        },
        status: "unrecognized_role",
      });
  }
}

function deniedResult(
  result: Omit<RubyWhisperAdminRoleDeniedResult, "action" | "allowed" | "ok">,
): RubyWhisperAdminRoleDeniedResult {
  return {
    action: "denied",
    allowed: false,
    ok: false,
    ...result,
  };
}

function normalizeAdminRoleText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeAdminRoleValue(value: string | null | undefined) {
  const role = normalizeAdminRoleText(value)
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

  switch (role) {
    case "admin":
    case "inactive":
    case "revoked":
      return role;
    default:
      return "unknown";
  }
}

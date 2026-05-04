import "server-only";

import { serverEnv } from "@/config/server";
import {
  createSupabaseServiceRoleClient,
  type SupabaseServiceRoleClientFactory,
} from "@/lib/supabase/server";
import {
  rubyWhisperActiveAdminRole,
  supabaseAdminRoleColumns,
  supabaseAdminRolesTableName,
  type SupabaseAdminRoleRow,
} from "@/lib/admin/roles";

export const rubyWhisperAdminBootstrapEnvVariableName =
  "RUBYWHISPER_ADMIN_BOOTSTRAP_EMAILS" as const;
export const rubyWhisperDocumentedInitialBootstrapAdminEmail =
  "brandon@rubyadvisory.com" as const;

export type RubyWhisperAdminBootstrapAllowlistError = Readonly<{
  code: "invalid_bootstrap_admin_email";
  invalidEmailCount: number;
  message: string;
}>;

export type RubyWhisperAdminBootstrapAllowlistAllowedResult = Readonly<{
  emails: readonly string[];
  enabled: boolean;
  expectedInitialEmail: typeof rubyWhisperDocumentedInitialBootstrapAdminEmail;
  ok: true;
  sourceEnvName: typeof rubyWhisperAdminBootstrapEnvVariableName;
}>;

export type RubyWhisperAdminBootstrapAllowlistInvalidResult = Readonly<{
  emails: readonly [];
  enabled: false;
  error: RubyWhisperAdminBootstrapAllowlistError;
  expectedInitialEmail: typeof rubyWhisperDocumentedInitialBootstrapAdminEmail;
  ok: false;
  sourceEnvName: typeof rubyWhisperAdminBootstrapEnvVariableName;
}>;

export type RubyWhisperAdminBootstrapAllowlistResult =
  | RubyWhisperAdminBootstrapAllowlistAllowedResult
  | RubyWhisperAdminBootstrapAllowlistInvalidResult;

export type ReconcileRubyWhisperBootstrapAdminRoleInput = Readonly<{
  allowlist?: RubyWhisperAdminBootstrapAllowlistResult;
  verifiedClerkUserId?: string | null;
  verifiedEmail?: string | null;
}>;

export type SupabaseAdminRoleWriteRow = Readonly<{
  clerk_user_id: string;
  role: typeof rubyWhisperActiveAdminRole;
}>;

export type SupabaseAdminBootstrapRoleWriteResult = Readonly<{
  data: SupabaseAdminRoleRow | null;
  error: unknown | null;
}>;

export type SupabaseAdminBootstrapRoleSelectQuery = Readonly<{
  maybeSingle: () => PromiseLike<SupabaseAdminBootstrapRoleWriteResult>;
}>;

export type SupabaseAdminBootstrapRoleUpsertQuery = Readonly<{
  select: (
    columns: typeof supabaseAdminRoleColumns,
  ) => SupabaseAdminBootstrapRoleSelectQuery;
}>;

export type SupabaseAdminBootstrapRolesTableQuery = Readonly<{
  upsert: (
    row: SupabaseAdminRoleWriteRow,
    options: Readonly<{ onConflict: "clerk_user_id" }>,
  ) => SupabaseAdminBootstrapRoleUpsertQuery;
}>;

export type SupabaseAdminBootstrapRoleClient = Readonly<{
  from: (
    tableName: typeof supabaseAdminRolesTableName,
  ) => SupabaseAdminBootstrapRolesTableQuery;
}>;

export type RubyWhisperBootstrapAdminRoleSeededResult = Readonly<{
  action: "seeded";
  clerkUserId: string;
  ok: true;
  role: typeof rubyWhisperActiveAdminRole;
  status: "active_admin_seeded";
}>;

export type RubyWhisperBootstrapAdminRoleSkippedResult = Readonly<{
  action: "skipped";
  clerkUserId?: string;
  error: Readonly<{
    code:
      | "bootstrap_allowlist_disabled"
      | "bootstrap_email_not_allowed"
      | "invalid_allowlist_config"
      | "invalid_verified_clerk_user_id"
      | "invalid_verified_email"
      | "supabase_admin_role_write_failed";
    message: string;
  }>;
  ok: false;
  status:
    | "allowlist_disabled"
    | "email_not_allowed"
    | "invalid_allowlist"
    | "invalid_user"
    | "write_failed";
}>;

export type RubyWhisperBootstrapAdminRoleReconcileResult =
  | RubyWhisperBootstrapAdminRoleSeededResult
  | RubyWhisperBootstrapAdminRoleSkippedResult;

export function readRubyWhisperAdminBootstrapAllowlist(): RubyWhisperAdminBootstrapAllowlistResult {
  return parseRubyWhisperAdminBootstrapEmails(
    serverEnv.admin.bootstrapAllowedEmails,
  );
}

export function parseRubyWhisperAdminBootstrapEmails(
  value: string | null | undefined,
): RubyWhisperAdminBootstrapAllowlistResult {
  const rawEmails = splitBootstrapAdminEmailConfig(value);

  if (rawEmails.length === 0) {
    return allowlistResult([]);
  }

  const normalizedEmails = new Set<string>();
  let invalidEmailCount = 0;

  for (const rawEmail of rawEmails) {
    const normalizedEmail = normalizeRubyWhisperAdminBootstrapEmail(rawEmail);

    if (!normalizedEmail) {
      invalidEmailCount += 1;
      continue;
    }

    normalizedEmails.add(normalizedEmail);
  }

  if (invalidEmailCount > 0) {
    return {
      emails: [],
      enabled: false,
      error: {
        code: "invalid_bootstrap_admin_email",
        invalidEmailCount,
        message:
          "Admin bootstrap allowlist contains invalid email configuration.",
      },
      expectedInitialEmail: rubyWhisperDocumentedInitialBootstrapAdminEmail,
      ok: false,
      sourceEnvName: rubyWhisperAdminBootstrapEnvVariableName,
    };
  }

  return allowlistResult([...normalizedEmails].sort());
}

export function normalizeRubyWhisperAdminBootstrapEmail(
  value: string | null | undefined,
) {
  const email = value?.trim().toLowerCase() ?? "";

  if (!isValidBootstrapAdminEmail(email)) {
    return "";
  }

  return email;
}

export function isRubyWhisperBootstrapAdminEmailAllowed(
  verifiedEmail: string | null | undefined,
  allowlist: RubyWhisperAdminBootstrapAllowlistResult =
    readRubyWhisperAdminBootstrapAllowlist(),
) {
  const normalizedEmail =
    normalizeRubyWhisperAdminBootstrapEmail(verifiedEmail);

  return (
    allowlist.ok &&
    normalizedEmail.length > 0 &&
    allowlist.emails.includes(normalizedEmail)
  );
}

export async function reconcileRubyWhisperBootstrapAdminRole<
  Client extends SupabaseAdminBootstrapRoleClient,
>(
  input: ReconcileRubyWhisperBootstrapAdminRoleInput,
  createClient: SupabaseServiceRoleClientFactory<Client>,
): Promise<RubyWhisperBootstrapAdminRoleReconcileResult> {
  const allowlist =
    input.allowlist ?? readRubyWhisperAdminBootstrapAllowlist();
  const clerkUserId = normalizeBootstrapAdminText(input.verifiedClerkUserId);
  const verifiedEmail = normalizeRubyWhisperAdminBootstrapEmail(
    input.verifiedEmail,
  );

  if (!allowlist.ok) {
    return skippedResult({
      error: {
        code: "invalid_allowlist_config",
        message: "Admin bootstrap allowlist configuration is invalid.",
      },
      status: "invalid_allowlist",
    });
  }

  if (!allowlist.enabled) {
    return skippedResult({
      error: {
        code: "bootstrap_allowlist_disabled",
        message: "Admin bootstrap allowlist is not configured.",
      },
      status: "allowlist_disabled",
    });
  }

  if (!clerkUserId) {
    return skippedResult({
      error: {
        code: "invalid_verified_clerk_user_id",
        message: "A verified Clerk user ID is required for admin bootstrap.",
      },
      status: "invalid_user",
    });
  }

  if (!verifiedEmail) {
    return skippedResult({
      clerkUserId,
      error: {
        code: "invalid_verified_email",
        message: "A verified email address is required for admin bootstrap.",
      },
      status: "invalid_user",
    });
  }

  if (!allowlist.emails.includes(verifiedEmail)) {
    return skippedResult({
      clerkUserId,
      error: {
        code: "bootstrap_email_not_allowed",
        message: "Verified email is not allowed for admin bootstrap.",
      },
      status: "email_not_allowed",
    });
  }

  try {
    const client = createSupabaseServiceRoleClient(createClient);
    const writeResult = await client
      .from(supabaseAdminRolesTableName)
      .upsert(
        {
          clerk_user_id: clerkUserId,
          role: rubyWhisperActiveAdminRole,
        },
        { onConflict: "clerk_user_id" },
      )
      .select(supabaseAdminRoleColumns)
      .maybeSingle();

    if (writeResult.error || !writeResult.data) {
      return adminBootstrapWriteFailedResult(clerkUserId);
    }
  } catch {
    return adminBootstrapWriteFailedResult(clerkUserId);
  }

  return {
    action: "seeded",
    clerkUserId,
    ok: true,
    role: rubyWhisperActiveAdminRole,
    status: "active_admin_seeded",
  };
}

function splitBootstrapAdminEmailConfig(value: string | null | undefined) {
  return (value ?? "")
    .split(/[,\n;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function isValidBootstrapAdminEmail(email: string) {
  const [localPart, domain, ...extraParts] = email.split("@");

  if (
    !localPart ||
    !domain ||
    extraParts.length > 0 ||
    email.length > 254 ||
    localPart.length > 64 ||
    localPart.includes("..") ||
    domain.includes("..")
  ) {
    return false;
  }

  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)) {
    return false;
  }

  const labels = domain.split(".");

  return (
    labels.length >= 2 &&
    labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    )
  );
}

function allowlistResult(
  emails: readonly string[],
): RubyWhisperAdminBootstrapAllowlistAllowedResult {
  return {
    emails,
    enabled: emails.length > 0,
    expectedInitialEmail: rubyWhisperDocumentedInitialBootstrapAdminEmail,
    ok: true,
    sourceEnvName: rubyWhisperAdminBootstrapEnvVariableName,
  };
}

function adminBootstrapWriteFailedResult(
  clerkUserId: string,
): RubyWhisperBootstrapAdminRoleSkippedResult {
  return skippedResult({
    clerkUserId,
    error: {
      code: "supabase_admin_role_write_failed",
      message: "Unable to write admin role metadata.",
    },
    status: "write_failed",
  });
}

function skippedResult(
  result: Omit<RubyWhisperBootstrapAdminRoleSkippedResult, "action" | "ok">,
): RubyWhisperBootstrapAdminRoleSkippedResult {
  return {
    action: "skipped",
    ok: false,
    ...result,
  };
}

function normalizeBootstrapAdminText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

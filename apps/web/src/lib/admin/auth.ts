import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import {
  lookupRubyWhisperAdminRole,
  type ReadRubyWhisperAdminRoleInput,
  type RubyWhisperAdminRoleDeniedResult,
  type RubyWhisperAdminRoleLookupResult,
  type SupabaseAdminRoleClient,
} from "@/lib/admin/roles";
import { requireClerkUserIdForPage } from "@/lib/auth/clerk";
import type {
  SupabaseServiceRoleClientFactory,
  SupabaseServiceRoleRuntimeConfig,
} from "@/lib/supabase/server";

export type RequireRubyWhisperAdminForPageDependencies = Readonly<{
  createClient?: SupabaseServiceRoleClientFactory<SupabaseAdminRoleClient>;
  lookupAdminRole?: (
    input: ReadRubyWhisperAdminRoleInput,
    createClient: SupabaseServiceRoleClientFactory<SupabaseAdminRoleClient>,
  ) => Promise<RubyWhisperAdminRoleLookupResult>;
  requireUserIdForPage?: () => Promise<string>;
}>;

export async function requireRubyWhisperAdminForPage(
  dependencies: RequireRubyWhisperAdminForPageDependencies = {},
): Promise<RubyWhisperAdminRoleLookupResult> {
  const clerkUserId = await (
    dependencies.requireUserIdForPage ?? requireClerkUserIdForPage
  )();
  const lookupAdminRole =
    dependencies.lookupAdminRole ?? lookupRubyWhisperAdminRole;
  const createClient =
    dependencies.createClient ?? createAdminAuthorizationSupabaseClient;

  try {
    return await lookupAdminRole({ clerkUserId }, createClient);
  } catch {
    return adminAuthorizationReadFailedResult(clerkUserId);
  }
}

function adminAuthorizationReadFailedResult(
  clerkUserId: string,
): RubyWhisperAdminRoleDeniedResult {
  return {
    action: "denied",
    allowed: false,
    clerkUserId,
    error: {
      code: "supabase_admin_role_read_failed",
      message: "Unable to read admin role metadata.",
    },
    ok: false,
    status: "read_failed",
  };
}

function createAdminAuthorizationSupabaseClient(
  config: SupabaseServiceRoleRuntimeConfig,
): SupabaseAdminRoleClient {
  return createSupabaseClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as SupabaseAdminRoleClient;
}

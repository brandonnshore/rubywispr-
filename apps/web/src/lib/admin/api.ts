import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import {
  lookupRubyWhisperAdminRole,
  type ReadRubyWhisperAdminRoleInput,
  type RubyWhisperAdminRoleAllowedResult,
  type RubyWhisperAdminRoleDeniedResult,
  type RubyWhisperAdminRoleLookupResult,
  type SupabaseAdminRoleClient,
} from "@/lib/admin/roles";
import { rubyWhisperApiErrorResponse } from "@/lib/api/errors";
import {
  requireClerkUserId,
  type ClerkRequiredAuthState,
} from "@/lib/auth/clerk";
import {
  createRubyWhisperBackendRequestFailedLogEvent,
  type RubyWhisperPrivacyLogEvent,
} from "@/lib/observability/privacy-logger";
import type {
  SupabaseServiceRoleClientFactory,
  SupabaseServiceRoleRuntimeConfig,
} from "@/lib/supabase/server";

export type RubyWhisperAdminApiGuardAllowedResult = Readonly<{
  action: "allowed";
  authorization: RubyWhisperAdminRoleAllowedResult;
  ok: true;
}>;

export type RubyWhisperAdminApiGuardDeniedStatus =
  | "auth_unavailable"
  | "forbidden"
  | "read_failed"
  | "signed_out";

export type RubyWhisperAdminApiGuardDeniedResult = Readonly<{
  action: "denied";
  authorization?: RubyWhisperAdminRoleDeniedResult;
  logEvent?: RubyWhisperPrivacyLogEvent;
  ok: false;
  response: Response;
  status: RubyWhisperAdminApiGuardDeniedStatus;
}>;

export type RubyWhisperAdminApiGuardResult =
  | RubyWhisperAdminApiGuardAllowedResult
  | RubyWhisperAdminApiGuardDeniedResult;

export type RequireRubyWhisperAdminForApiDependencies = Readonly<{
  createClient?: SupabaseServiceRoleClientFactory<SupabaseAdminRoleClient>;
  lookupAdminRole?: (
    input: ReadRubyWhisperAdminRoleInput,
    createClient: SupabaseServiceRoleClientFactory<SupabaseAdminRoleClient>,
  ) => Promise<RubyWhisperAdminRoleLookupResult>;
  recordFailureLog?: (event: RubyWhisperPrivacyLogEvent) => void;
  requireUserId?: () => Promise<ClerkRequiredAuthState>;
}>;

export type RequireRubyWhisperAdminForApiInput = Readonly<{
  dependencies?: RequireRubyWhisperAdminForApiDependencies;
  method?: string;
  request?: Request;
  route?: string;
}>;

export async function requireRubyWhisperAdminForApi(
  input: RequireRubyWhisperAdminForApiInput = {},
): Promise<RubyWhisperAdminApiGuardResult> {
  const dependencies = input.dependencies ?? {};
  const requireUserId = dependencies.requireUserId ?? requireClerkUserId;
  let authState: ClerkRequiredAuthState;

  try {
    authState = await requireUserId();
  } catch {
    return deniedAdminApiGuardResult({
      errorCode: "admin_api_auth_failed",
      input,
      response: rubyWhisperApiErrorResponse("service_unavailable"),
      status: "auth_unavailable",
    });
  }

  if (!authState.ok) {
    return {
      action: "denied",
      ok: false,
      response: rubyWhisperApiErrorResponse("signed_out"),
      status: "signed_out",
    };
  }

  const clerkUserId = authState.userId;
  const lookupAdminRole =
    dependencies.lookupAdminRole ?? lookupRubyWhisperAdminRole;
  const createClient =
    dependencies.createClient ?? createAdminApiSupabaseClient;
  let authorization: RubyWhisperAdminRoleLookupResult;

  try {
    authorization = await lookupAdminRole({ clerkUserId }, createClient);
  } catch {
    authorization = adminApiReadFailedResult(clerkUserId);
  }

  if (authorization.ok) {
    return {
      action: "allowed",
      authorization,
      ok: true,
    };
  }

  if (authorization.status === "read_failed") {
    return deniedAdminApiGuardResult({
      authorization,
      clerkUserId,
      errorCode: authorization.error.code,
      input,
      recordFailureLog: dependencies.recordFailureLog,
      response: rubyWhisperApiErrorResponse("service_unavailable"),
      status: "read_failed",
    });
  }

  return {
    action: "denied",
    authorization,
    ok: false,
    response: rubyWhisperApiErrorResponse("admin_forbidden"),
    status: "forbidden",
  };
}

function deniedAdminApiGuardResult(
  input: Readonly<{
    authorization?: RubyWhisperAdminRoleDeniedResult;
    clerkUserId?: string;
    errorCode: string;
    input: RequireRubyWhisperAdminForApiInput;
    recordFailureLog?: (event: RubyWhisperPrivacyLogEvent) => void;
    response: Response;
    status: RubyWhisperAdminApiGuardDeniedStatus;
  }>,
): RubyWhisperAdminApiGuardDeniedResult {
  const logEvent = createAdminApiFailureLogEvent(input);

  if (logEvent && input.recordFailureLog) {
    try {
      input.recordFailureLog(logEvent);
    } catch {
      // Logging must not affect the authorization response.
    }
  }

  return {
    action: "denied",
    ...(input.authorization ? { authorization: input.authorization } : {}),
    ...(logEvent ? { logEvent } : {}),
    ok: false,
    response: input.response,
    status: input.status,
  };
}

function createAdminApiFailureLogEvent(
  input: Readonly<{
    clerkUserId?: string;
    errorCode: string;
    input: RequireRubyWhisperAdminForApiInput;
    status: RubyWhisperAdminApiGuardDeniedStatus;
  }>,
) {
  return createRubyWhisperBackendRequestFailedLogEvent({
    errorCode: input.errorCode,
    method: input.input.method ?? input.input.request?.method,
    route: input.input.route ?? normalizeRequestRoute(input.input.request),
    status: input.status,
    userId: input.clerkUserId,
  });
}

function normalizeRequestRoute(request: Request | undefined) {
  if (!request) {
    return undefined;
  }

  try {
    return new URL(request.url).pathname;
  } catch {
    return undefined;
  }
}

function adminApiReadFailedResult(
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

function createAdminApiSupabaseClient(
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

import "server-only";

import { createClient } from "@supabase/supabase-js";

import { requireClerkUserId } from "@/lib/auth/clerk";
import {
  readClerkUserTermsAcceptance,
  recordClerkUserTermsAcceptance,
  type SupabaseTermsAcceptanceClient,
  type TermsAcceptanceStatusResult,
} from "@/lib/auth/terms-acceptance";
import type { SupabaseServiceRoleRuntimeConfig } from "@/lib/supabase/server";

export type AccountTermsAcceptanceState = Readonly<
  | {
      status: "accepted";
      termsAcceptedAt: string;
    }
  | {
      status:
        | "profile_missing"
        | "required"
        | "service_unavailable"
        | "unauthenticated";
    }
>;

export async function readAccountTermsAcceptanceState(): Promise<AccountTermsAcceptanceState> {
  const authState = await requireClerkUserId();

  if (!authState.ok) {
    return { status: "unauthenticated" };
  }

  try {
    const result = await readClerkUserTermsAcceptance(
      { clerkUserId: authState.userId },
      createTermsAcceptanceSupabaseClient,
    );

    return toAccountTermsAcceptanceState(result);
  } catch {
    return { status: "service_unavailable" };
  }
}

export async function recordSignedInAccountTermsAcceptance(): Promise<AccountTermsAcceptanceState> {
  const authState = await requireClerkUserId();

  if (!authState.ok) {
    return { status: "unauthenticated" };
  }

  try {
    const result = await recordClerkUserTermsAcceptance(
      { clerkUserId: authState.userId },
      createTermsAcceptanceSupabaseClient,
    );

    return toAccountTermsAcceptanceState(result);
  } catch {
    return { status: "service_unavailable" };
  }
}

function toAccountTermsAcceptanceState(
  result: TermsAcceptanceStatusResult,
): AccountTermsAcceptanceState {
  if (result.ok) {
    return {
      status: "accepted",
      termsAcceptedAt: result.termsAcceptedAt,
    };
  }

  if (result.status === "missing_acceptance") {
    return { status: "required" };
  }

  if (result.status === "missing_profile") {
    return { status: "profile_missing" };
  }

  if (result.status === "missing_user") {
    return { status: "unauthenticated" };
  }

  return { status: "service_unavailable" };
}

function createTermsAcceptanceSupabaseClient(
  config: SupabaseServiceRoleRuntimeConfig,
): SupabaseTermsAcceptanceClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as SupabaseTermsAcceptanceClient;
}

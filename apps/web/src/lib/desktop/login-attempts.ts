import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/config/server";

const ATTEMPT_TTL_SECONDS = 5 * 60;
const TABLE = "desktop_login_attempts";

type AttemptRow = {
  id: string;
  state: string;
  nonce_challenge: string;
  clerk_user_id: string | null;
  exchange_code: string | null;
  claimed_at: string | null;
  created_at: string;
  expires_at: string;
  platform: string | null;
  app_version: string | null;
  app_channel: string | null;
};

export type DesktopLoginAttempt = Readonly<{
  id: string;
  state: string;
  nonceChallenge: string;
  clerkUserId: string | null;
  exchangeCode: string | null;
  claimedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  platform: string | null;
  appVersion: string | null;
  appChannel: string | null;
}>;

export type CreateAttemptInput = Readonly<{
  state: string;
  nonceChallenge: string;
  platform?: string | null;
  appVersion?: string | null;
  appChannel?: string | null;
}>;

const fromRow = (row: AttemptRow): DesktopLoginAttempt => ({
  id: row.id,
  state: row.state,
  nonceChallenge: row.nonce_challenge,
  clerkUserId: row.clerk_user_id,
  exchangeCode: row.exchange_code,
  claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
  createdAt: new Date(row.created_at),
  expiresAt: new Date(row.expires_at),
  platform: row.platform,
  appVersion: row.app_version,
  appChannel: row.app_channel,
});

const supabase = (): SupabaseClient => {
  const url = serverEnv.supabase.url;
  const serviceRoleKey = serverEnv.supabase.serviceRoleKey;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service-role configuration is missing.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
};

export async function recordDesktopLoginAttempt(
  input: CreateAttemptInput,
): Promise<DesktopLoginAttempt> {
  const expiresAt = new Date(Date.now() + ATTEMPT_TTL_SECONDS * 1000).toISOString();
  const { data, error } = await supabase()
    .from(TABLE)
    .upsert(
      {
        state: input.state,
        nonce_challenge: input.nonceChallenge,
        platform: input.platform ?? null,
        app_version: input.appVersion ?? null,
        app_channel: input.appChannel ?? null,
        expires_at: expiresAt,
        clerk_user_id: null,
        exchange_code: null,
        claimed_at: null,
      },
      { onConflict: "state" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to record desktop login attempt: ${error?.message ?? "unknown"}`);
  }
  return fromRow(data as AttemptRow);
}

export async function getDesktopLoginAttemptByState(
  state: string,
): Promise<DesktopLoginAttempt | null> {
  const { data, error } = await supabase()
    .from(TABLE)
    .select("*")
    .eq("state", state)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read desktop login attempt: ${error.message}`);
  }
  return data ? fromRow(data as AttemptRow) : null;
}

export async function attachClerkUserAndIssueExchangeCode(input: {
  state: string;
  clerkUserId: string;
}): Promise<{ exchangeCode: string }> {
  const exchangeCode = randomBytes(32).toString("base64url");
  const { error } = await supabase()
    .from(TABLE)
    .update({
      clerk_user_id: input.clerkUserId,
      exchange_code: exchangeCode,
    })
    .eq("state", input.state)
    .is("claimed_at", null);

  if (error) {
    throw new Error(`Failed to attach Clerk user to attempt: ${error.message}`);
  }
  return { exchangeCode };
}

export type ClaimAttemptResult =
  | Readonly<{ ok: true; clerkUserId: string }>
  | Readonly<{
      ok: false;
      reason:
        | "not_found"
        | "expired"
        | "already_claimed"
        | "no_code_yet"
        | "code_mismatch"
        | "nonce_mismatch"
        | "no_user_yet";
    }>;

export async function claimDesktopLoginAttempt(input: {
  state: string;
  exchangeCode: string;
  nonceVerifier: string;
}): Promise<ClaimAttemptResult> {
  const attempt = await getDesktopLoginAttemptByState(input.state);
  if (!attempt) return { ok: false, reason: "not_found" };
  if (attempt.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  if (attempt.claimedAt) return { ok: false, reason: "already_claimed" };
  if (!attempt.exchangeCode) return { ok: false, reason: "no_code_yet" };
  if (!attempt.clerkUserId) return { ok: false, reason: "no_user_yet" };
  if (attempt.exchangeCode !== input.exchangeCode) return { ok: false, reason: "code_mismatch" };

  const computedChallenge = createHash("sha256")
    .update(input.nonceVerifier)
    .digest("base64url");
  if (computedChallenge !== attempt.nonceChallenge) {
    return { ok: false, reason: "nonce_mismatch" };
  }

  const { error } = await supabase()
    .from(TABLE)
    .update({ claimed_at: new Date().toISOString() })
    .eq("state", input.state)
    .is("claimed_at", null);

  if (error) {
    throw new Error(`Failed to claim attempt: ${error.message}`);
  }
  return { ok: true, clerkUserId: attempt.clerkUserId };
}

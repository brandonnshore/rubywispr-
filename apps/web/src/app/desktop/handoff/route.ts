import { currentUser } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { syncClerkUserSupabaseProfile } from "@/lib/auth/profile-sync";
import {
  attachClerkUserAndIssueExchangeCode,
  getDesktopLoginAttemptByState,
} from "@/lib/desktop/login-attempts";
import type { SupabaseServiceRoleRuntimeConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CALLBACK_URL = "rubywhisper://auth/callback";

const failure = (request: NextRequest, code: string) => {
  const url = new URL("/sign-in", request.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url, { status: 302 });
};

const profileSyncSupabaseFactory = (config: SupabaseServiceRoleRuntimeConfig) =>
  createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state")?.trim();
  if (!state) {
    return failure(request, "missing_state");
  }

  const user = await currentUser();
  if (!user) {
    const signInUrl = new URL("/sign-in", request.url);
    request.nextUrl.searchParams.forEach((value, key) =>
      signInUrl.searchParams.set(key, value),
    );
    return NextResponse.redirect(signInUrl, { status: 302 });
  }

  const attempt = await getDesktopLoginAttemptByState(state);
  if (!attempt) return failure(request, "unknown_state");
  if (attempt.expiresAt.getTime() <= Date.now()) {
    return failure(request, "expired_state");
  }

  const primaryEmail =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null;
  await syncClerkUserSupabaseProfile(
    { clerkUserId: user.id, primaryEmail },
    profileSyncSupabaseFactory,
  );

  const { exchangeCode } = await attachClerkUserAndIssueExchangeCode({
    state,
    clerkUserId: user.id,
  });

  const callbackUrl = new URL(CALLBACK_URL);
  callbackUrl.searchParams.set("state", state);
  callbackUrl.searchParams.set("code", exchangeCode);
  return NextResponse.redirect(callbackUrl.toString(), { status: 302 });
}

import "server-only";

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { rubyWhisperApiErrorResponse } from "@/lib/api/errors";
import { createRubyWhisperDesktopSessionToken } from "@/lib/auth/desktop-session";
import { createDesktopLoginExchangeCode } from "@/lib/desktop-login/exchange-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state")?.trim();
  const nonceChallenge = request.nextUrl.searchParams
    .get("nonce_challenge")
    ?.trim();
  const callbackScheme =
    request.nextUrl.searchParams.get("callback_scheme")?.trim() ||
    "rubywhisper";

  if (!state || !nonceChallenge || callbackScheme !== "rubywhisper") {
    return rubyWhisperApiErrorResponse("signed_out");
  }

  const authState = await auth();

  if (!authState.userId) {
    return rubyWhisperApiErrorResponse("signed_out");
  }

  const desktopSession = createRubyWhisperDesktopSessionToken({
    accountId: authState.userId,
  });

  if (!desktopSession.ok) {
    return rubyWhisperApiErrorResponse("signed_out");
  }

  const code = createDesktopLoginExchangeCode({
    accountId: authState.userId,
    nonceChallenge,
    sessionExpiresAt: desktopSession.expiresAt,
    sessionToken: desktopSession.token,
    state,
  });

  if (!code) {
    return rubyWhisperApiErrorResponse("signed_out");
  }

  const callbackUrl = new URL(`${callbackScheme}://auth/callback`);
  callbackUrl.searchParams.set("state", state);
  callbackUrl.searchParams.set("code", code);

  return NextResponse.redirect(callbackUrl);
}

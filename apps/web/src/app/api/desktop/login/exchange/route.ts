import { NextResponse } from "next/server";

import { claimDesktopLoginAttempt } from "@/lib/desktop/login-attempts";
import { signDesktopToken } from "@/lib/desktop/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExchangeRequestBody = {
  state?: unknown;
  code?: unknown;
  nonce_verifier?: unknown;
};

const errorResponse = (status: number, code: string, message: string) =>
  NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );

const reasonToError: Record<
  Awaited<ReturnType<typeof claimDesktopLoginAttempt>> extends infer R
    ? R extends { ok: false; reason: infer X }
      ? X & string
      : never
    : never,
  { status: number; code: string; message: string }
> = {
  not_found: { status: 400, code: "invalid_state", message: "Unknown sign-in attempt." },
  expired: { status: 400, code: "expired_state", message: "Sign-in attempt expired." },
  already_claimed: {
    status: 400,
    code: "replayed_state",
    message: "Sign-in attempt was already used.",
  },
  no_code_yet: {
    status: 400,
    code: "exchange_not_ready",
    message: "Sign-in is not yet complete.",
  },
  no_user_yet: {
    status: 400,
    code: "exchange_not_ready",
    message: "Sign-in is not yet complete.",
  },
  code_mismatch: { status: 400, code: "invalid_code", message: "Invalid exchange code." },
  nonce_mismatch: { status: 400, code: "invalid_nonce", message: "Invalid nonce verifier." },
};

export async function POST(request: Request) {
  let body: ExchangeRequestBody;
  try {
    body = (await request.json()) as ExchangeRequestBody;
  } catch {
    return errorResponse(400, "invalid_request", "Request body must be JSON.");
  }

  const state = typeof body.state === "string" ? body.state.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const nonceVerifier =
    typeof body.nonce_verifier === "string" ? body.nonce_verifier.trim() : "";

  if (!state || !code || !nonceVerifier) {
    return errorResponse(
      400,
      "invalid_request",
      "state, code, and nonce_verifier are required.",
    );
  }

  let claim;
  try {
    claim = await claimDesktopLoginAttempt({
      state,
      exchangeCode: code,
      nonceVerifier,
    });
  } catch {
    return errorResponse(503, "service_unavailable", "Sign-in service is unavailable.");
  }

  if (!claim.ok) {
    const mapped = reasonToError[claim.reason];
    return errorResponse(mapped.status, mapped.code, mapped.message);
  }

  let token;
  try {
    token = signDesktopToken({ clerkUserId: claim.clerkUserId });
  } catch {
    return errorResponse(503, "service_unavailable", "Token signing is unavailable.");
  }

  return NextResponse.json(
    {
      ok: true,
      accessToken: token.accessToken,
      expiresAt: token.expiresAt.toISOString(),
      accountID: claim.clerkUserId,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

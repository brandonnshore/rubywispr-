import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/config/server";
import {
  clerkUnauthenticatedError,
  requireClerkUserId,
  type ClerkRequiredAuthState,
} from "@/lib/auth/clerk";

export const rubyWhisperDesktopSessionTokenPrefix = "rwds1";
export const rubyWhisperDesktopSessionTokenKind =
  "rubywhisper_desktop_session";
export const rubyWhisperDesktopSessionTokenTTLSeconds = 30 * 24 * 60 * 60;

type RubyWhisperDesktopSessionTokenClaims = Readonly<{
  exp: number;
  iat: number;
  sub: string;
  typ: typeof rubyWhisperDesktopSessionTokenKind;
}>;

export type RubyWhisperDesktopSessionTokenIssueResult =
  | Readonly<{
      accountId: string;
      expiresAt: string;
      ok: true;
      token: string;
    }>
  | Readonly<{
      ok: false;
      reason: "invalid_account" | "missing_secret";
    }>;

export type RubyWhisperDesktopSessionTokenVerifyResult =
  | Readonly<{
      accountId: string;
      expiresAt: string;
      ok: true;
    }>
  | Readonly<{
      ok: false;
      reason:
        | "expired"
        | "invalid_account"
        | "invalid_payload"
        | "invalid_signature"
        | "invalid_token"
        | "missing_secret";
    }>;

export function createRubyWhisperDesktopSessionToken(
  input: Readonly<{
    accountId: string;
    nowMs?: () => number;
    secret?: string;
    ttlSeconds?: number;
  }>,
): RubyWhisperDesktopSessionTokenIssueResult {
  const accountId = normalizeDesktopSessionAccountId(input.accountId);

  if (!accountId) {
    return { ok: false, reason: "invalid_account" };
  }

  const secret = normalizeDesktopSessionSecret(
    input.secret ?? readRubyWhisperDesktopSessionSigningSecret(),
  );

  if (!secret) {
    return { ok: false, reason: "missing_secret" };
  }

  const nowSeconds = currentUnixSeconds(input.nowMs);
  const ttlSeconds = normalizeDesktopSessionTTLSeconds(input.ttlSeconds);
  const expiresAtSeconds = nowSeconds + ttlSeconds;
  const claims: RubyWhisperDesktopSessionTokenClaims = {
    exp: expiresAtSeconds,
    iat: nowSeconds,
    sub: accountId,
    typ: rubyWhisperDesktopSessionTokenKind,
  };
  const payloadSegment = encodeDesktopSessionSegment(
    JSON.stringify(claims),
  );
  const signatureSegment = signDesktopSessionPayload(payloadSegment, secret);

  return {
    accountId,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    ok: true,
    token: `${rubyWhisperDesktopSessionTokenPrefix}.${payloadSegment}.${signatureSegment}`,
  };
}

export function verifyRubyWhisperDesktopSessionToken(
  token: string,
  input: Readonly<{
    nowMs?: () => number;
    secret?: string;
  }> = {},
): RubyWhisperDesktopSessionTokenVerifyResult {
  const secret = normalizeDesktopSessionSecret(
    input.secret ?? readRubyWhisperDesktopSessionSigningSecret(),
  );

  if (!secret) {
    return { ok: false, reason: "missing_secret" };
  }

  const tokenParts = token.trim().split(".");

  if (
    tokenParts.length !== 3 ||
    tokenParts[0] !== rubyWhisperDesktopSessionTokenPrefix
  ) {
    return { ok: false, reason: "invalid_token" };
  }

  const [, payloadSegment, signatureSegment] = tokenParts;
  const expectedSignature = signDesktopSessionPayload(payloadSegment, secret);

  if (!safeEqualDesktopSessionText(signatureSegment, expectedSignature)) {
    return { ok: false, reason: "invalid_signature" };
  }

  const payload = decodeDesktopSessionPayload(payloadSegment);

  if (!payload) {
    return { ok: false, reason: "invalid_payload" };
  }

  const accountId = normalizeDesktopSessionAccountId(payload.sub);

  if (!accountId) {
    return { ok: false, reason: "invalid_account" };
  }

  const nowSeconds = currentUnixSeconds(input.nowMs);

  if (payload.exp <= nowSeconds) {
    return { ok: false, reason: "expired" };
  }

  return {
    accountId,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    ok: true,
  };
}

export async function requireRubyWhisperDesktopUserId(
  request: Request,
): Promise<ClerkRequiredAuthState> {
  const token = bearerTokenFromAuthorizationHeader(
    request.headers.get("authorization"),
  );

  if (token) {
    const result = verifyRubyWhisperDesktopSessionToken(token);

    if (result.ok) {
      return {
        ok: true,
        userId: result.accountId,
      };
    }

    return {
      error: clerkUnauthenticatedError,
      ok: false,
    };
  }

  return requireClerkUserId();
}

function readRubyWhisperDesktopSessionSigningSecret() {
  return serverEnv.desktop.sessionSecret ?? serverEnv.clerk.secretKey;
}

function normalizeDesktopSessionAccountId(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();

  return /^[A-Za-z0-9_-]{8,256}$/.test(text) ? text : undefined;
}

function normalizeDesktopSessionSecret(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();

  return text.length >= 16 ? text : undefined;
}

function normalizeDesktopSessionTTLSeconds(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : rubyWhisperDesktopSessionTokenTTLSeconds;
}

function currentUnixSeconds(nowMs: (() => number) | undefined) {
  const timestamp = nowMs?.() ?? Date.now();

  return Math.floor(timestamp / 1000);
}

function encodeDesktopSessionSegment(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeDesktopSessionPayload(
  payloadSegment: string,
): RubyWhisperDesktopSessionTokenClaims | undefined {
  try {
    const payload = JSON.parse(
      Buffer.from(payloadSegment, "base64url").toString("utf8"),
    ) as Partial<RubyWhisperDesktopSessionTokenClaims>;

    if (
      payload.typ !== rubyWhisperDesktopSessionTokenKind ||
      typeof payload.sub !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.iat) ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= payload.iat
    ) {
      return undefined;
    }

    return {
      exp: Math.floor(payload.exp),
      iat: Math.floor(payload.iat),
      sub: payload.sub,
      typ: rubyWhisperDesktopSessionTokenKind,
    };
  } catch {
    return undefined;
  }
}

function signDesktopSessionPayload(payloadSegment: string, secret: string) {
  return createHmac("sha256", secret).update(payloadSegment).digest("base64url");
}

function safeEqualDesktopSessionText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function bearerTokenFromAuthorizationHeader(value: string | null) {
  const match = value?.trim().match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  return token || undefined;
}

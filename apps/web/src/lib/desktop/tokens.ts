import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/config/server";

const TOKEN_HEADER = { alg: "HS256", typ: "JWT" } as const;
const DEFAULT_EXPIRES_IN_SECONDS = 30 * 24 * 60 * 60;

type TokenPayload = {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
};

export type DesktopTokenSignInput = Readonly<{
  clerkUserId: string;
  expiresInSeconds?: number;
}>;

export type DesktopTokenSignResult = Readonly<{
  accessToken: string;
  expiresAt: Date;
  tokenId: string;
}>;

export type DesktopTokenVerifyResult =
  | Readonly<{ ok: true; clerkUserId: string; tokenId: string; expiresAt: Date }>
  | Readonly<{ ok: false; reason: "missing_secret" | "malformed" | "bad_signature" | "expired" }>;

const base64url = (input: Buffer | string): string => {
  const buffer = typeof input === "string" ? Buffer.from(input) : input;
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

const base64urlDecode = (input: string): Buffer =>
  Buffer.from(input.replaceAll("-", "+").replaceAll("_", "/"), "base64");

const readSecret = (): string | null => {
  return serverEnv.desktop.tokenSecret ?? null;
};

export function signDesktopToken({
  clerkUserId,
  expiresInSeconds = DEFAULT_EXPIRES_IN_SECONDS,
}: DesktopTokenSignInput): DesktopTokenSignResult {
  const secret = readSecret();
  if (!secret) {
    throw new Error("DESKTOP_TOKEN_SECRET is not configured.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + expiresInSeconds;
  const tokenId = randomBytes(16).toString("hex");

  const payload: TokenPayload = {
    sub: clerkUserId,
    iat: issuedAt,
    exp: expiresAt,
    jti: tokenId,
  };

  const headerSegment = base64url(JSON.stringify(TOKEN_HEADER));
  const payloadSegment = base64url(JSON.stringify(payload));
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = base64url(
    createHmac("sha256", secret).update(signingInput).digest(),
  );

  return {
    accessToken: `${signingInput}.${signature}`,
    expiresAt: new Date(expiresAt * 1000),
    tokenId,
  };
}

export function verifyDesktopToken(token: string): DesktopTokenVerifyResult {
  const secret = readSecret();
  if (!secret) {
    return { ok: false, reason: "missing_secret" };
  }

  const segments = token.split(".");
  if (segments.length !== 3) {
    return { ok: false, reason: "malformed" };
  }

  const [headerSegment, payloadSegment, signatureSegment] = segments;
  const expectedSignature = base64url(
    createHmac("sha256", secret)
      .update(`${headerSegment}.${payloadSegment}`)
      .digest(),
  );

  const provided = Buffer.from(signatureSegment);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadSegment).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    typeof payload.sub !== "string" ||
    typeof payload.exp !== "number" ||
    typeof payload.jti !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    clerkUserId: payload.sub,
    tokenId: payload.jti,
    expiresAt: new Date(payload.exp * 1000),
  };
}

export function readDesktopBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

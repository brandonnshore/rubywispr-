import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

type DesktopLoginExchangeRecord = Readonly<{
  accountId: string;
  code: string;
  expiresAtMs: number;
  nonceChallenge: string;
  sessionExpiresAt: string;
  sessionToken: string;
  state: string;
}>;

export type DesktopLoginExchangeCreateInput = Readonly<{
  accountId: string;
  nonceChallenge: string;
  sessionExpiresAt: string;
  sessionToken: string;
  state: string;
}>;

export type DesktopLoginExchangeConsumeInput = Readonly<{
  code: string;
  nonceVerifier: string;
  state: string;
}>;

export type DesktopLoginExchangeConsumeResult =
  | Readonly<{
      ok: true;
      accountId: string;
      sessionExpiresAt: string;
      sessionToken: string;
    }>
  | Readonly<{
      ok: false;
      reason:
        | "invalid_code"
        | "invalid_nonce"
        | "invalid_state"
        | "missing_input";
    }>;

const desktopLoginExchangeCodeTTL = 5 * 60 * 1000;
const desktopLoginTextPattern = /^[A-Za-z0-9_-]{16,512}$/;

const globalExchangeStore = globalThis as typeof globalThis & {
  rubyWhisperDesktopLoginExchangeCodes?: Map<string, DesktopLoginExchangeRecord>;
};

const exchangeCodes =
  globalExchangeStore.rubyWhisperDesktopLoginExchangeCodes ??
  new Map<string, DesktopLoginExchangeRecord>();

globalExchangeStore.rubyWhisperDesktopLoginExchangeCodes = exchangeCodes;

export function createDesktopLoginExchangeCode(
  input: DesktopLoginExchangeCreateInput,
) {
  cleanupExpiredDesktopLoginExchangeCodes();

  const accountId = normalizeDesktopLoginText(input.accountId);
  const nonceChallenge = normalizeDesktopLoginText(input.nonceChallenge);
  const sessionExpiresAt = normalizeDesktopLoginTimestamp(
    input.sessionExpiresAt,
  );
  const sessionToken = normalizeSessionToken(input.sessionToken);
  const state = normalizeDesktopLoginText(input.state);

  if (
    !accountId ||
    !nonceChallenge ||
    !sessionExpiresAt ||
    !sessionToken ||
    !state
  ) {
    return undefined;
  }

  const code = randomBytes(32).toString("base64url");
  exchangeCodes.set(code, {
    accountId,
    code,
    expiresAtMs: Date.now() + desktopLoginExchangeCodeTTL,
    nonceChallenge,
    sessionExpiresAt,
    sessionToken,
    state,
  });

  return code;
}

export function consumeDesktopLoginExchangeCode(
  input: DesktopLoginExchangeConsumeInput,
): DesktopLoginExchangeConsumeResult {
  cleanupExpiredDesktopLoginExchangeCodes();

  const code = normalizeDesktopLoginText(input.code);
  const nonceVerifier = normalizeDesktopLoginText(input.nonceVerifier);
  const state = normalizeDesktopLoginText(input.state);

  if (!code || !nonceVerifier || !state) {
    return { ok: false, reason: "missing_input" };
  }

  const record = exchangeCodes.get(code);
  exchangeCodes.delete(code);

  if (!record || record.expiresAtMs <= Date.now()) {
    return { ok: false, reason: "invalid_code" };
  }

  if (!safeEqual(record.state, state)) {
    return { ok: false, reason: "invalid_state" };
  }

  if (!safeEqual(record.nonceChallenge, nonceChallengeFor(nonceVerifier))) {
    return { ok: false, reason: "invalid_nonce" };
  }

  return {
    ok: true,
    accountId: record.accountId,
    sessionExpiresAt: record.sessionExpiresAt,
    sessionToken: record.sessionToken,
  };
}

export function nonceChallengeFor(nonceVerifier: string) {
  return createHash("sha256").update(nonceVerifier).digest("base64url");
}

function cleanupExpiredDesktopLoginExchangeCodes() {
  const now = Date.now();

  for (const [code, record] of exchangeCodes.entries()) {
    if (record.expiresAtMs <= now) {
      exchangeCodes.delete(code);
    }
  }
}

function normalizeDesktopLoginText(value: string) {
  const text = value.trim();
  return desktopLoginTextPattern.test(text) ? text : undefined;
}

function normalizeSessionToken(value: string) {
  const text = value.trim();
  return text.length >= 16 && text.length <= 8192 ? text : undefined;
}

function normalizeDesktopLoginTimestamp(value: string) {
  const text = value.trim();
  const timestampMs = Date.parse(text);

  return Number.isFinite(timestampMs)
    ? new Date(timestampMs).toISOString()
    : undefined;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

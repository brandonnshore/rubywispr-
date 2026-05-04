import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as ts from "typescript";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const apiErrorsPath = path.join(webRoot, "src", "lib", "api", "errors.ts");
const readmePath = path.join(webRoot, "README.md");
const acceptTermsRoutePath = path.join(
  webRoot,
  "src",
  "app",
  "api",
  "account",
  "accept-terms",
  "route.ts",
);

const expectedBackendErrorCodes = [
  "signed_out",
  "terms_required",
  "trial_exhausted",
  "subscription_required",
  "payment_failed",
  "account_blocked",
  "rate_limited",
  "duration_limit_reached",
  "invalid_audio",
  "provider_error",
  "network_error",
  "service_unavailable",
  "internal_error",
];

const expectedHttpStatuses = {
  signed_out: 401,
  terms_required: 403,
  trial_exhausted: 402,
  subscription_required: 402,
  payment_failed: 402,
  account_blocked: 403,
  rate_limited: 429,
  duration_limit_reached: 413,
  invalid_audio: 422,
  provider_error: 503,
  network_error: 503,
  service_unavailable: 503,
  internal_error: 500,
};

test("API error contract exposes the backend-originated RW-044A matrix", async () => {
  const apiErrors = await loadApiErrorsModule();

  assert.deepEqual(apiErrors.rubyWhisperApiErrorCodes, expectedBackendErrorCodes);

  for (const code of expectedBackendErrorCodes) {
    const descriptor = apiErrors.rubyWhisperApiErrorDescriptors[code];

    assert.equal(descriptor.code, code);
    assert.equal(descriptor.httpStatus, expectedHttpStatuses[code]);
    assert.equal(typeof descriptor.message, "string");
    assert.ok(descriptor.message.length > 0 && descriptor.message.length <= 80);
    assert.equal(typeof descriptor.retryable, "boolean");
    assert.equal(typeof descriptor.recovery, "string");
    assert.equal(typeof descriptor.desktopState, "string");
  }
});

test("API error payloads include stable metadata and filter private payload fields", async () => {
  const apiErrors = await loadApiErrorsModule();

  const payload = apiErrors.createRubyWhisperApiErrorPayload("trial_exhausted", {
    metadata: {
      Authorization: "Bearer rw_synthetic_placeholder",
      appVersion: "0.1.0-test",
      audio: "payload must not echo",
      audioDurationMs: 42_000,
      cleanedText: "payload must not echo",
      clipboard: "payload must not echo",
      context: "payload must not echo",
      localHistory: "payload must not echo",
      planState: "trial_exhausted",
      provider_request_body: "payload must not echo",
      provider_response_body: "payload must not echo",
      rawTranscript: "payload must not echo",
      secret: "payload must not echo",
      token: "payload must not echo",
      transcript: "payload must not echo",
      trialWordsRemaining: 0,
    },
    requestId: "  req_rw_synthetic_001  ",
  });

  assert.deepEqual(payload, {
    ok: false,
    requestId: "req_rw_synthetic_001",
    error: {
      code: "trial_exhausted",
      desktopState: "trial_exhausted",
      message: "Upgrade to keep using RubyWhisper.",
      recovery: "open_checkout",
      retryable: false,
    },
    metadata: {
      appVersion: "0.1.0-test",
      audioDurationMs: 42_000,
      planState: "trial_exhausted",
      trialWordsRemaining: 0,
    },
  });
});

test("API error response helper emits no-store JSON with retry metadata", async () => {
  const apiErrors = await loadApiErrorsModule();

  const response = apiErrors.rubyWhisperApiErrorResponse("rate_limited", {
    metadata: {
      providerLatencyMs: Number.NaN,
      retryAfterSeconds: 2.2,
      totalLatencyMs: 320,
    },
    requestId: "req_rw_synthetic_429",
  });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Retry-After"), "3");
  assert.deepEqual(await response.json(), {
    ok: false,
    requestId: "req_rw_synthetic_429",
    error: {
      code: "rate_limited",
      desktopState: "error",
      message: "Too many requests. Try again soon.",
      recovery: "retry_after",
      retryable: true,
    },
    metadata: {
      retryAfterSeconds: 2.2,
      totalLatencyMs: 320,
    },
  });
});

test("API error helper is server-only and framework-neutral", async () => {
  const source = await readFile(apiErrorsPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.doesNotMatch(source, /from\s+["']next\/server["']/);
  assert.doesNotMatch(source, /\bserverEnv\b|\bprocess\.env\b/);
  assert.doesNotMatch(source, /CLERK_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|GROQ_API_KEY/);
});

test("account Terms route has a documented migration path to the shared helper", async () => {
  const [readme, route] = await Promise.all([
    readFile(readmePath, "utf8"),
    readFile(acceptTermsRoutePath, "utf8"),
  ]);

  assert.match(readme, /## Shared API Error Contract/);
  assert.match(readme, /POST `\/api\/account\/accept-terms`/);
  assert.match(readme, /desktop-facing routes should use `rubyWhisperApiErrorResponse`/);
  assert.match(route, /terms_acknowledgement_required/);
  assert.match(route, /clerk_session_required/);
});

async function loadApiErrorsModule() {
  const source = await readFile(apiErrorsPath, "utf8");
  const executableSource = source.replace(/^import\s+["']server-only["'];\n?/, "");
  const { outputText } = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: apiErrorsPath,
  });
  const encodedSource = Buffer.from(outputText).toString("base64");

  return import(`data:text/javascript;base64,${encodedSource}`);
}

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as ts from "typescript";

import { invokeRouteHandler } from "./support/backend-integration.mjs";

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
  "admin_forbidden",
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
  admin_forbidden: 403,
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
const expectedRetryability = {
  signed_out: false,
  admin_forbidden: false,
  terms_required: false,
  trial_exhausted: false,
  subscription_required: false,
  payment_failed: false,
  account_blocked: false,
  rate_limited: true,
  duration_limit_reached: false,
  invalid_audio: false,
  provider_error: true,
  network_error: true,
  service_unavailable: true,
  internal_error: true,
};
const expectedMetadataKeys = [
  "planState",
  "trialWordsRemaining",
  "trialWordsLimit",
  "monthlyWordsRemaining",
  "requestCount",
  "retryAfterSeconds",
  "windowStart",
  "windowEnd",
  "limit",
  "durationLimitMs",
  "audioDurationMs",
  "appVersion",
  "osVersion",
  "provider",
  "providerLatencyMs",
  "totalLatencyMs",
  "traceReason",
];
const expectedPayloadKeys = ["error", "metadata", "ok", "requestId"];
const expectedErrorKeys = ["code", "desktopState", "message", "recovery", "retryable"];
const maxDesktopErrorPayloadBytes = 512;
const representativeRouteScenarios = [
  {
    code: "signed_out",
    metadata: { appVersion: "0.1.0-test", osVersion: "macOS test" },
    status: 401,
  },
  {
    code: "terms_required",
    metadata: { planState: "trial_active" },
    status: 403,
  },
  {
    code: "trial_exhausted",
    metadata: { planState: "trial_exhausted", trialWordsRemaining: 0 },
    status: 402,
  },
  {
    code: "duration_limit_reached",
    metadata: { audioDurationMs: 601_000, durationLimitMs: 600_000 },
    status: 413,
  },
  {
    code: "provider_error",
    metadata: { provider: "mock_provider", providerLatencyMs: 210 },
    status: 503,
  },
  {
    code: "network_error",
    metadata: { totalLatencyMs: 2_000 },
    status: 503,
  },
];
const privateSerializationPattern =
  /payload must not echo|Bearer rw_synthetic_placeholder|private prompt|private context|private transcript|private clipboard/i;

test("API error contract exposes the backend-originated RW-044A matrix", async () => {
  const apiErrors = await loadApiErrorsModule();

  assert.deepEqual(apiErrors.rubyWhisperApiErrorCodes, expectedBackendErrorCodes);

  for (const code of expectedBackendErrorCodes) {
    const descriptor = apiErrors.rubyWhisperApiErrorDescriptors[code];

    assert.equal(descriptor.code, code);
    assert.equal(descriptor.httpStatus, expectedHttpStatuses[code]);
    assert.equal(descriptor.retryable, expectedRetryability[code]);
    assert.equal(typeof descriptor.message, "string");
    assert.ok(descriptor.message.length > 0 && descriptor.message.length <= 80);
    assert.equal(typeof descriptor.recovery, "string");
    assert.equal(typeof descriptor.desktopState, "string");
  }
});

test("API error metadata stays on the explicit metadata-only allowlist", async () => {
  const apiErrors = await loadApiErrorsModule();

  assert.deepEqual(apiErrors.rubyWhisperApiErrorMetadataKeys, expectedMetadataKeys);

  for (const privateKey of [
    "audio",
    "cleanedText",
    "clipboard",
    "context",
    "localHistory",
    "providerRequestBody",
    "providerResponseBody",
    "rawTranscript",
    "transcript",
  ]) {
    assert.ok(!apiErrors.rubyWhisperApiErrorMetadataKeys.includes(privateKey));
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
      limit: 20,
      providerLatencyMs: Number.NaN,
      requestCount: 20,
      retryAfterSeconds: 2.2,
      totalLatencyMs: 320,
      windowEnd: "2026-05-04T12:01:00.000Z",
      windowStart: "2026-05-04T12:00:00.000Z",
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
      limit: 20,
      requestCount: 20,
      retryAfterSeconds: 2.2,
      totalLatencyMs: 320,
      windowEnd: "2026-05-04T12:01:00.000Z",
      windowStart: "2026-05-04T12:00:00.000Z",
    },
  });
});

test("synthetic route handlers serialize representative desktop API errors", async () => {
  const apiErrors = await loadApiErrorsModule();

  for (const scenario of representativeRouteScenarios) {
    const response = await invokeRouteHandler(
      {
        POST(request) {
          assert.equal(request.headers.get("x-rubywhisper-test-fixture"), "synthetic");

          return apiErrors.rubyWhisperApiErrorResponse(scenario.code, {
            metadata: {
              ...scenario.metadata,
              Authorization: "Bearer rw_synthetic_placeholder",
              cleanedText: "payload must not echo",
              clipboard: "private clipboard",
              context: "private context",
              provider_request_body: "private prompt",
              rawTranscript: "private transcript",
            },
            requestId: `req_rw_synthetic_${scenario.code}`,
          });
        },
      },
      {
        body: {
          scenario: scenario.code,
        },
        method: "POST",
        path: "/api/desktop/transcribe",
      },
    );
    const payload = await response.json();
    const serializedPayload = JSON.stringify(payload);

    assert.equal(response.status, scenario.status);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(payload.ok, false);
    assert.deepEqual(Object.keys(payload).sort(), expectedPayloadKeys);
    assert.deepEqual(Object.keys(payload.error).sort(), expectedErrorKeys);
    assert.equal(payload.requestId, `req_rw_synthetic_${scenario.code}`);
    assert.equal(payload.error.code, scenario.code);
    assert.equal(typeof payload.error.message, "string");
    assert.ok(payload.error.message.length > 0 && payload.error.message.length <= 80);
    assert.equal(typeof payload.error.retryable, "boolean");
    assert.ok(
      Buffer.byteLength(serializedPayload, "utf8") <= maxDesktopErrorPayloadBytes,
      `${scenario.code} payload should stay short for desktop mapping`,
    );
    assert.doesNotMatch(serializedPayload, privateSerializationPattern);
  }
});

test("synthetic preflight error routes do not invoke provider mocks", async () => {
  const apiErrors = await loadApiErrorsModule();
  let providerCalls = 0;

  for (const code of [
    "signed_out",
    "terms_required",
    "trial_exhausted",
    "duration_limit_reached",
  ]) {
    const response = await invokeRouteHandler(
      {
        POST() {
          return apiErrors.rubyWhisperApiErrorResponse(code, {
            requestId: `req_rw_preflight_${code}`,
          });
        },
      },
      {
        context: {
          providers: {
            groq: {
              createCompletion() {
                providerCalls += 1;
              },
            },
          },
        },
        method: "POST",
        path: "/api/desktop/transcribe",
      },
    );

    assert.equal(response.status, expectedHttpStatuses[code]);
  }

  assert.equal(providerCalls, 0);
});

test("API error helper is server-only and framework-neutral", async () => {
  const source = await readFile(apiErrorsPath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.doesNotMatch(source, /from\s+["']next\/server["']/);
  assert.doesNotMatch(source, /\bserverEnv\b|\bprocess\.env\b/);
  assert.doesNotMatch(source, /CLERK_SECRET_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|DESKTOP_TOKEN_SECRET|STRIPE_SECRET_KEY|GROQ_API_KEY|OPENAI_API_KEY/);
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as ts from "typescript";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const desktopTranscribeRoutePath = path.join(
  webRoot,
  "src",
  "app",
  "api",
  "desktop",
  "transcribe",
  "route.ts",
);
const syntheticOrigin = "https://rubywhisper-desktop.test";
const syntheticNow = new Date("2026-05-04T07:30:00.000Z");

test("desktop transcribe route returns signed_out before request parsing", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const { calls, dependencies } = createRouteDependencies({
    parseRequest: () => {
      throw new Error("Request parsing must not run for signed-out users.");
    },
    readProfile: () => {
      throw new Error("Profile must not be read for signed-out users.");
    },
    requireAuth: async () => ({
      error: {
        code: "clerk_session_required",
        message: "A Clerk user session is required.",
      },
      ok: false,
    }),
  });
  const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
  const response = await handler(syntheticAudioRequest());
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.error.code, "signed_out");
  assert.deepEqual(toPlainObject(calls), [{ operation: "requireAuth" }]);
});

test("desktop transcribe route returns terms_required before quota or parser work", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const { calls, dependencies } = createRouteDependencies({
    parseRequest: () => {
      throw new Error("Parser must not run when Terms are missing.");
    },
    readProfile: async (clerkUserId) => ({
      action: "found",
      ok: true,
      profile: accountProfile({
        clerkUserId,
        termsAcceptedAt: undefined,
      }),
    }),
    readSubscription: () => {
      throw new Error("Subscription must not be read when Terms are missing.");
    },
    readUsageCounters: () => {
      throw new Error("Usage counters must not be read when Terms are missing.");
    },
  });
  const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
  const response = await handler(syntheticAudioRequest());
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.error.code, "terms_required");
  assert.deepEqual(toPlainObject(calls), [
    { operation: "requireAuth" },
    {
      clerkUserId: "user_rw_synthetic_member_001",
      operation: "readProfile",
    },
  ]);
});

test("desktop transcribe route maps metadata read failures to service_unavailable", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const { dependencies } = createRouteDependencies({
    readProfile: async () => ({
      error: {
        code: "supabase_account_profile_read_failed",
        message: "Unable to read account profile metadata.",
      },
      ok: false,
      status: "read_failed",
    }),
  });
  const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
  const response = await handler(syntheticAudioRequest());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.error.code, "service_unavailable");
  assert.equal(body.error.retryable, true);
});

test("desktop transcribe route maps quota failures to shared metadata-only errors", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();

  for (const code of [
    "account_blocked",
    "payment_failed",
    "subscription_required",
    "trial_exhausted",
  ]) {
    const { calls, dependencies } = createRouteDependencies({
      evaluateEntitlement: () => entitlementRejected(code),
      parseRequest: () => {
        throw new Error(`Parser must not run for ${code}.`);
      },
    });
    const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
    const response = await handler(syntheticAudioRequest());
    const body = await response.json();

    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(body.error.code, code);
    assert.deepEqual(body.metadata, {
      planState: quotaPlanStateForError(code),
      trialWordsLimit: 5000,
      trialWordsRemaining: code === "trial_exhausted" ? 0 : 3900,
    });
    assert.deepEqual(
      toPlainObject(calls).map((call) => call.operation),
      [
        "requireAuth",
        "readProfile",
        "readSubscription",
        "readUsageCounters",
        "evaluateEntitlement",
      ],
    );
    assert.doesNotMatch(JSON.stringify(body), /audio|transcript|cleaned|context|dictionary/i);
  }
});

test("desktop transcribe route maps parser failures to shared no-store responses", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();

  for (const parseResult of [
    { code: "invalid_audio", ok: false },
    {
      code: "duration_limit_reached",
      metadata: {
        audioDurationMs: 600001,
        durationLimitMs: 600000,
      },
      ok: false,
    },
  ]) {
    const { calls, dependencies } = createRouteDependencies({
      parseRequest: async () => parseResult,
    });
    const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
    const response = await handler(syntheticAudioRequest());
    const body = await response.json();

    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(body.error.code, parseResult.code);
    assert.deepEqual(body.metadata, parseResult.metadata);
    assert.deepEqual(
      toPlainObject(calls).map((call) => call.operation),
      [
        "requireAuth",
        "readProfile",
        "readSubscription",
        "readUsageCounters",
        "evaluateEntitlement",
        "parseRequest",
      ],
    );
  }
});

test("desktop transcribe route returns cleanup-disabled provider output with metadata only", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const { calls, dependencies } = createRouteDependencies({
    parseRequest: async () => parseSuccess({ cleanupEnabled: false }),
  });
  const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
  const response = await handler(syntheticAudioRequest());
  const body = await response.json();
  const providerCall = calls.find(
    (call) => call.operation === "providerTranscribe",
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    account: {
      planState: "trial_active",
      preflightPolicy: "allow_if_started_under_limit",
    },
    finalText: "synthetic provider output",
    ok: true,
    quota: {
      isTrialLow: false,
      planState: "trial_active",
      trialWordsLimit: 5000,
      trialWordsRemaining: 3900,
      trialWordsUsed: 1100,
    },
    request: {
      appVersion: "0.1.0-test",
      audioDurationMs: 4200,
      audioMimeType: "audio/wav",
      cleanupEnabled: false,
      contextAwareCleanupEnabled: false,
      osVersion: "macOS synthetic",
    },
  });
  assert.ok(providerCall);
  assert.equal(providerCall.input.audioMimeType, "audio/wav");
  assert.equal(providerCall.input.audioDurationMs, 4200);
  assert.ok(providerCall.input.audio instanceof Blob);
  assert.deepEqual(Object.keys(providerCall.input).sort(), [
    "audio",
    "audioDurationMs",
    "audioMimeType",
  ]);
  assert.doesNotMatch(
    JSON.stringify(body.account),
    /member@example.com|user_rw_synthetic_member_001/,
  );
  assert.doesNotMatch(
    JSON.stringify(body),
    /"context":|"dictionaryTerms":|providerRequest|providerResponse/i,
  );
});

test("desktop transcribe route fails closed while cleanup is unimplemented", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const { calls, dependencies } = createRouteDependencies({
    parseRequest: async () => parseSuccess({ cleanupEnabled: true }),
  });
  const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
  const response = await handler(syntheticAudioRequest());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.error.code, "service_unavailable");
  assert.equal(
    calls.some((call) => call.operation === "providerTranscribe"),
    false,
  );
});

test("desktop transcribe route maps provider failures to shared desktop errors", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();

  for (const scenario of [
    {
      apiErrorCode: "rate_limited",
      code: "provider_rate_limited",
      expectedStatus: 429,
      metadata: {
        provider: "mock_provider",
        retryAfterSeconds: 3.2,
      },
    },
    {
      apiErrorCode: "network_error",
      code: "provider_timeout",
      expectedStatus: 503,
      metadata: {
        provider: "mock_provider",
        providerLatencyMs: 5000,
        totalLatencyMs: 5000,
      },
    },
    {
      apiErrorCode: "provider_error",
      code: "provider_invalid_response",
      expectedStatus: 503,
      metadata: {
        provider: "mock_provider",
      },
    },
    {
      apiErrorCode: "provider_error",
      code: "provider_unavailable",
      expectedStatus: 503,
      metadata: {
        provider: "mock_provider",
      },
    },
    {
      apiErrorCode: "network_error",
      code: "network_error",
      expectedStatus: 503,
      metadata: {
        provider: "mock_provider",
        totalLatencyMs: 900,
      },
    },
  ]) {
    const { dependencies } = createRouteDependencies({
      parseRequest: async () => parseSuccess({ cleanupEnabled: false }),
      providerClient: {
        cleanup: async () => providerFailure("provider_unavailable"),
        transcribe: async () => providerFailure(scenario.code, scenario.metadata),
      },
    });
    const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
    const response = await handler(syntheticAudioRequest());
    const body = await response.json();

    assert.equal(response.status, scenario.expectedStatus);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(body.error.code, scenario.apiErrorCode);
    assert.deepEqual(body.metadata, scenario.metadata);
    assert.doesNotMatch(
      JSON.stringify(body),
      /raw|providerRequest|providerResponse|payload|context|dictionary|Bearer/i,
    );
  }
});

test("desktop transcribe route stays server-only and provider-contract only", async () => {
  const source = await readFile(desktopTranscribeRoutePath, "utf8");

  assert.match(source, /export const runtime = ["']nodejs["'];/);
  assert.match(source, /export const dynamic = ["']force-dynamic["'];/);
  assert.match(source, /createDesktopTranscribeRouteHandler/);
  assert.match(source, /requireClerkUserId/);
  assert.match(source, /parseDesktopTranscribeRequest/);
  assert.match(source, /evaluateRubyWhisperQuotaEntitlement/);
  assert.match(source, /createRubyWhisperMockProviderClient/);
  assert.match(source, /providerClient\.transcribe\(/);
  assert.match(source, /rubyWhisperApiErrorResponse\(["']signed_out["']\)/);
  assert.match(source, /rubyWhisperApiErrorResponse\(["']terms_required["']\)/);
  assert.doesNotMatch(source, /from\s+["']@\/lib\/providers\/groq["']/);
  assert.doesNotMatch(source, /\bGROQ_API_KEY\b|\bCLERK_SECRET_KEY\b|\bSUPABASE_SERVICE_ROLE_KEY\b/);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bJSON\.stringify\s*\(/);
});

async function loadDesktopTranscribeRouteModule() {
  const source = await readFile(desktopTranscribeRoutePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: desktopTranscribeRoutePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      Date,
      Headers,
      Request,
      Response,
      exports: commonJsModule.exports,
      module: commonJsModule,
      require: createRouteModuleRequire(),
    },
    {
      filename: desktopTranscribeRoutePath,
    },
  );

  return commonJsModule.exports;
}

function createRouteModuleRequire() {
  return function requireRouteModule(specifier) {
    switch (specifier) {
      case "@supabase/supabase-js":
        return {
          createClient: () => {
            throw new Error("Live Supabase clients are outside this route test.");
          },
        };
      case "@/lib/account/profile-metadata":
        return {
          readRubyWhisperAccountProfileMetadata: async () => {
            throw new Error("Default profile dependency is outside this route test.");
          },
        };
      case "@/lib/account/subscription-cache":
        return {
          readRubyWhisperSubscriptionCache: async () => {
            throw new Error("Default subscription dependency is outside this route test.");
          },
        };
      case "@/lib/api/errors":
        return { rubyWhisperApiErrorResponse: createApiErrorResponse };
      case "@/lib/auth/clerk":
        return {
          requireClerkUserId: async () => ({
            error: {
              code: "clerk_session_required",
              message: "A Clerk user session is required.",
            },
            ok: false,
          }),
        };
      case "@/lib/desktop-transcribe/request":
        return {
          parseDesktopTranscribeRequest: async () => {
            throw new Error("Default parser dependency is outside this route test.");
          },
        };
      case "@/lib/providers/client":
        return {
          createRubyWhisperMockProviderClient: () => ({
            cleanup: async () => providerFailure("provider_unavailable"),
            transcribe: async () => providerFailure("provider_unavailable"),
          }),
        };
      case "@/lib/usage/quota-service":
        return {
          evaluateRubyWhisperQuotaEntitlement: () => {
            throw new Error("Default quota dependency is outside this route test.");
          },
        };
      case "@/lib/usage/supabase-usage-counters":
        return {
          readRubyWhisperUsageCounters: async () => {
            throw new Error("Default usage dependency is outside this route test.");
          },
        };
      default:
        throw new Error(`Unexpected route module import: ${specifier}`);
    }
  };
}

function createRouteDependencies(overrides = {}) {
  const calls = [];
  const dependencies = {
    evaluateEntitlement(input) {
      calls.push({ input, operation: "evaluateEntitlement" });

      return entitlementAllowed(input.usageCounters);
    },
    now() {
      return syntheticNow;
    },
    async parseRequest() {
      calls.push({ operation: "parseRequest" });

      return parseSuccess();
    },
    providerClient: {
      cleanup() {
        calls.push({ operation: "providerCleanup" });

        return providerFailure("provider_unavailable");
      },
      transcribe(input) {
        calls.push({ input, operation: "providerTranscribe" });

        return providerSuccess(input);
      },
    },
    async readProfile(clerkUserId) {
      calls.push({ clerkUserId, operation: "readProfile" });

      return {
        action: "found",
        ok: true,
        profile: accountProfile({ clerkUserId }),
      };
    },
    async readSubscription(clerkUserId) {
      calls.push({ clerkUserId, operation: "readSubscription" });

      return {
        action: "defaulted",
        ok: true,
        subscription: accountSubscription({ clerkUserId }),
      };
    },
    async readUsageCounters(clerkUserId) {
      calls.push({ clerkUserId, operation: "readUsageCounters" });

      return {
        action: "defaulted",
        counters: accountUsageCounters({ clerkUserId }),
        ok: true,
      };
    },
    async requireAuth() {
      calls.push({ operation: "requireAuth" });

      return {
        ok: true,
        userId: "user_rw_synthetic_member_001",
      };
    },
  };

  return {
    calls,
    dependencies: {
      ...dependencies,
      ...wrapOverridesWithCallTracking(calls, overrides),
    },
  };
}

function wrapOverridesWithCallTracking(calls, overrides) {
  const wrapped = {};

  for (const [operation, value] of Object.entries(overrides)) {
    if (typeof value !== "function") {
      wrapped[operation] = value;
      continue;
    }

    wrapped[operation] = (...args) => {
      calls.push({
        ...(args[0] && typeof args[0] !== "object" ? { clerkUserId: args[0] } : {}),
        operation,
      });

      return value(...args);
    };
  }

  return wrapped;
}

function syntheticAudioRequest() {
  return new Request(`${syntheticOrigin}/api/desktop/transcribe`, {
    body: new Uint8Array([1, 2, 3, 4]),
    headers: {
      "content-type": "audio/wav",
      "x-rubywhisper-audio-duration-ms": "4200",
    },
    method: "POST",
  });
}

function parseSuccess(options = {}) {
  const cleanupEnabled = options.cleanupEnabled ?? false;

  return {
    input: {
      cleanupSettings: {
        cleanupEnabled,
        contextAwareCleanupEnabled: false,
        dictionaryTerms: cleanupEnabled ? ["RubyWhisper"] : [],
      },
      metadata: {
        appVersion: "0.1.0-test",
        audioDurationMs: 4200,
        audioMimeType: "audio/wav",
        cleanupEnabled,
        contextAwareCleanupEnabled: false,
        osVersion: "macOS synthetic",
      },
      providerInput: {
        audio: new Blob([new Uint8Array([1, 2, 3, 4])], {
          type: "audio/wav",
        }),
        audioDurationMs: 4200,
        audioMimeType: "audio/wav",
      },
    },
    ok: true,
  };
}

function providerSuccess(input) {
  return {
    ok: true,
    result: {
      audioDurationMs: input.audioDurationMs,
      provider: "mock_provider",
      providerLatencyMs: 24,
      text: "synthetic provider output",
    },
  };
}

function providerFailure(code, metadata = { provider: "mock_provider" }) {
  const descriptor = providerErrorDescriptors[code];

  return {
    error: {
      apiErrorCode: descriptor.apiErrorCode,
      code,
      message: descriptor.message,
      retryable: descriptor.retryable,
    },
    metadata,
    ok: false,
  };
}

function accountProfile(overrides = {}) {
  return {
    clerkUserId: "user_rw_synthetic_member_001",
    email: "member@example.com",
    isBlocked: false,
    termsAcceptedAt: "2026-05-04T05:00:00.000Z",
    ...overrides,
  };
}

function accountSubscription(overrides = {}) {
  return {
    clerkUserId: "user_rw_synthetic_member_001",
    hasActiveSubscription: false,
    isFriendOfRubyActive: false,
    paymentFailed: false,
    plan: "trial",
    planState: "trial_active",
    requiresSubscription: false,
    ...overrides,
  };
}

function accountUsageCounters(overrides = {}) {
  return {
    clerkUserId: "user_rw_synthetic_member_001",
    isTrialExhausted: false,
    isTrialLow: false,
    lifetimeWordsUsed: 1100,
    monthlyPeriodStart: "2026-05-01",
    monthlyWordsUsed: 1100,
    trialWordsLimit: 5000,
    trialWordsRemaining: 3900,
    trialWordsUsed: 1100,
    ...overrides,
  };
}

function entitlementAllowed(usageCounters = accountUsageCounters()) {
  return {
    canTranscribe: true,
    metadata: quotaMetadata("trial_active", usageCounters),
    ok: true,
    planState: "trial_active",
    preflightPolicy: "allow_if_started_under_limit",
    status: "allowed",
  };
}

function entitlementRejected(errorCode) {
  const planState = quotaPlanStateForError(errorCode);
  const usageCounters = accountUsageCounters({
    trialWordsRemaining: errorCode === "trial_exhausted" ? 0 : 3900,
    trialWordsUsed: errorCode === "trial_exhausted" ? 5000 : 1100,
  });

  return {
    canTranscribe: false,
    errorCode,
    metadata: quotaMetadata(planState, usageCounters),
    ok: false,
    planState,
    preflightPolicy: "allow_if_started_under_limit",
    status: errorCode,
  };
}

function quotaPlanStateForError(errorCode) {
  switch (errorCode) {
    case "account_blocked":
      return "blocked";
    case "payment_failed":
      return "payment_failed";
    case "subscription_required":
      return "subscription_required";
    case "trial_exhausted":
      return "trial_exhausted";
    default:
      throw new Error(`Unsupported quota error code: ${errorCode}`);
  }
}

function quotaMetadata(planState, usageCounters) {
  return {
    isTrialLow: usageCounters.isTrialLow,
    planState,
    trialWordsLimit: usageCounters.trialWordsLimit,
    trialWordsRemaining: usageCounters.trialWordsRemaining,
    trialWordsUsed: usageCounters.trialWordsUsed,
  };
}

function createApiErrorResponse(code, options = {}) {
  const descriptor = apiErrorDescriptors[code];
  const headers = new Headers({
    "Cache-Control": "no-store",
  });
  const metadata = options.metadata
    ? sanitizeApiErrorMetadata(options.metadata)
    : undefined;

  if (typeof metadata?.retryAfterSeconds === "number") {
    headers.set("Retry-After", String(Math.ceil(metadata.retryAfterSeconds)));
  }

  return Response.json(
    {
      error: {
        code,
        desktopState: descriptor.desktopState,
        message: descriptor.message,
        recovery: descriptor.recovery,
        retryable: descriptor.retryable,
      },
      ...(metadata ? { metadata } : {}),
      ok: false,
    },
    {
      headers,
      status: descriptor.httpStatus,
    },
  );
}

const apiErrorDescriptors = {
  account_blocked: {
    desktopState: "blocked",
    httpStatus: 403,
    message: "This account cannot dictate right now.",
    recovery: "open_account",
    retryable: false,
  },
  duration_limit_reached: {
    desktopState: "duration_limit_reached",
    httpStatus: 413,
    message: "Recordings are limited to 10 minutes.",
    recovery: "start_new_whisper",
    retryable: false,
  },
  invalid_audio: {
    desktopState: "error",
    httpStatus: 422,
    message: "RubyWhisper could not read that audio.",
    recovery: "record_again",
    retryable: false,
  },
  network_error: {
    desktopState: "network_error",
    httpStatus: 503,
    message: "Check your internet connection and try again.",
    recovery: "retry",
    retryable: true,
  },
  payment_failed: {
    desktopState: "payment_failed",
    httpStatus: 402,
    message: "Update billing to continue.",
    recovery: "open_billing",
    retryable: false,
  },
  provider_error: {
    desktopState: "provider_error",
    httpStatus: 503,
    message: "RubyWhisper could not transcribe right now.",
    recovery: "retry",
    retryable: true,
  },
  rate_limited: {
    desktopState: "error",
    httpStatus: 429,
    message: "Too many requests. Try again soon.",
    recovery: "retry_after",
    retryable: true,
  },
  service_unavailable: {
    desktopState: "error",
    httpStatus: 503,
    message: "RubyWhisper is temporarily unavailable.",
    recovery: "retry",
    retryable: true,
  },
  signed_out: {
    desktopState: "signed_out",
    httpStatus: 401,
    message: "Sign in to use RubyWhisper.",
    recovery: "open_sign_in",
    retryable: false,
  },
  subscription_required: {
    desktopState: "trial_exhausted",
    httpStatus: 402,
    message: "Choose a plan to keep dictating.",
    recovery: "open_checkout",
    retryable: false,
  },
  terms_required: {
    desktopState: "signed_in_terms_required",
    httpStatus: 403,
    message: "Accept Terms and Privacy to start dictating.",
    recovery: "open_terms_acceptance",
    retryable: false,
  },
  trial_exhausted: {
    desktopState: "trial_exhausted",
    httpStatus: 402,
    message: "Upgrade to keep using RubyWhisper.",
    recovery: "open_checkout",
    retryable: false,
  },
};

const allowedMetadataKeys = new Set([
  "appVersion",
  "audioDurationMs",
  "durationLimitMs",
  "osVersion",
  "planState",
  "provider",
  "providerLatencyMs",
  "retryAfterSeconds",
  "totalLatencyMs",
  "trialWordsLimit",
  "trialWordsRemaining",
]);

const providerErrorDescriptors = {
  network_error: {
    apiErrorCode: "network_error",
    message: "Synthetic provider network request failed.",
    retryable: true,
  },
  provider_invalid_response: {
    apiErrorCode: "provider_error",
    message: "Synthetic provider response was invalid.",
    retryable: true,
  },
  provider_rate_limited: {
    apiErrorCode: "rate_limited",
    message: "Synthetic provider rate limit was reached.",
    retryable: true,
  },
  provider_timeout: {
    apiErrorCode: "network_error",
    message: "Synthetic provider request timed out.",
    retryable: true,
  },
  provider_unavailable: {
    apiErrorCode: "provider_error",
    message: "Synthetic provider is unavailable.",
    retryable: true,
  },
};

function sanitizeApiErrorMetadata(metadata) {
  const sanitized = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (allowedMetadataKeys.has(key)) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

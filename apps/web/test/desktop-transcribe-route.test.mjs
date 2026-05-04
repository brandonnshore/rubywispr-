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
    continuePreflight: () => {
      throw new Error("Continuation must not run for signed-out users.");
    },
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
    continuePreflight: () => {
      throw new Error("Continuation must not run when Terms are missing.");
    },
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
      continuePreflight: () => {
        throw new Error(`Continuation must not run for ${code}.`);
      },
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
      continuePreflight: () => {
        throw new Error(`${parseResult.code} must not reach continuation.`);
      },
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

test("desktop transcribe route reaches typed continuation after successful preflight", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const { calls, dependencies } = createRouteDependencies();
  const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
  const response = await handler(syntheticAudioRequest());
  const body = await response.json();
  const continuationCall = calls.find(
    (call) => call.operation === "continuePreflight",
  );

  assert.equal(response.status, 202);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    ok: true,
    preflightStatus: "ready_for_provider",
  });
  assert.equal(continuationCall.input.clerkUserId, "user_rw_synthetic_member_001");
  assert.equal(continuationCall.input.profile.email, "member@example.com");
  assert.equal(continuationCall.input.entitlement.status, "allowed");
  assert.deepEqual(continuationCall.input.requestInput.metadata, {
    appVersion: "0.1.0-test",
    audioDurationMs: 4200,
    audioMimeType: "audio/wav",
    cleanupEnabled: true,
    contextAwareCleanupEnabled: false,
    osVersion: "macOS synthetic",
  });
  assert.equal(
    continuationCall.input.requestInput.providerInput.audioMimeType,
    "audio/wav",
  );
});

test("desktop transcribe route stays server-only and provider-neutral", async () => {
  const source = await readFile(desktopTranscribeRoutePath, "utf8");

  assert.match(source, /export const runtime = ["']nodejs["'];/);
  assert.match(source, /export const dynamic = ["']force-dynamic["'];/);
  assert.match(source, /createDesktopTranscribeRouteHandler/);
  assert.match(source, /requireClerkUserId/);
  assert.match(source, /parseDesktopTranscribeRequest/);
  assert.match(source, /evaluateRubyWhisperQuotaEntitlement/);
  assert.match(source, /rubyWhisperApiErrorResponse\(["']signed_out["']\)/);
  assert.match(source, /rubyWhisperApiErrorResponse\(["']terms_required["']\)/);
  assert.doesNotMatch(source, /from\s+["']@\/lib\/providers\//);
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
    continuePreflight(input) {
      calls.push({ input, operation: "continuePreflight" });

      return Response.json(
        {
          ok: true,
          preflightStatus: "ready_for_provider",
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
          status: 202,
        },
      );
    },
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

function parseSuccess() {
  return {
    input: {
      cleanupSettings: {
        cleanupEnabled: true,
        contextAwareCleanupEnabled: false,
        dictionaryTerms: ["RubyWhisper"],
      },
      metadata: {
        appVersion: "0.1.0-test",
        audioDurationMs: 4200,
        audioMimeType: "audio/wav",
        cleanupEnabled: true,
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

  return Response.json(
    {
      error: {
        code,
        desktopState: descriptor.desktopState,
        message: descriptor.message,
        recovery: descriptor.recovery,
        retryable: descriptor.retryable,
      },
      ...(options.metadata
        ? { metadata: sanitizeApiErrorMetadata(options.metadata) }
        : {}),
      ok: false,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
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
  payment_failed: {
    desktopState: "payment_failed",
    httpStatus: 402,
    message: "Update billing to continue.",
    recovery: "open_billing",
    retryable: false,
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
  "trialWordsLimit",
  "trialWordsRemaining",
]);

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

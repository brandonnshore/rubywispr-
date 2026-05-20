import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
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
const sessionRoutePath = path.join(
  webRoot,
  "src",
  "app",
  "api",
  "desktop",
  "realtime-transcription",
  "session",
  "route.ts",
);
const completeRoutePath = path.join(
  webRoot,
  "src",
  "app",
  "api",
  "desktop",
  "realtime-transcription",
  "complete",
  "route.ts",
);
const syntheticOrigin = "https://rubywhisper-desktop.test";
const syntheticNow = new Date("2026-05-19T15:00:00.000Z");
const privatePayloadPattern =
  /private transcript|private audio|private provider payload|client_secret|Bearer|rw_synthetic_openai_key/i;

test("desktop realtime session route gates account state before minting a client secret", async () => {
  const routeModule = loadRouteModule(sessionRoutePath);
  const { calls, dependencies } = createSessionDependencies({
    createClientSecret: () => {
      throw new Error("Client secret minting must not run before terms are accepted.");
    },
    readProfile: async (clerkUserId) => ({
      action: "found",
      ok: true,
      profile: accountProfile({ clerkUserId, termsAcceptedAt: undefined }),
    }),
  });
  const handler = routeModule.createDesktopRealtimeTranscriptionSessionRouteHandler(
    dependencies,
  );
  const response = await handler(sessionRequest());
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

test("desktop realtime session route returns a short-lived OpenAI secret after quota and rate gates", async () => {
  const routeModule = loadRouteModule(sessionRoutePath);
  const { calls, dependencies } = createSessionDependencies({
    createClientSecret: async (input) => {
      assert.deepEqual(toPlainObject(input), {
        language: "en",
        requestId: "req_rw_synthetic_realtime_001",
      });

      return {
        ok: true,
        result: {
          clientSecret: "ek_synthetic_realtime_client_secret",
          expiresAt: 1779240000,
          provider: "openai_realtime",
          providerLatencyMs: 82,
          webSocketURL: "wss://openai-realtime-provider.test/realtime",
        },
      };
    },
  });
  const handler = routeModule.createDesktopRealtimeTranscriptionSessionRouteHandler(
    dependencies,
  );
  const response = await handler(sessionRequest({ language: "en" }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    clientSecret: "ek_synthetic_realtime_client_secret",
    expiresAt: 1779240000,
    ok: true,
    planState: "trial_active",
    provider: "openai_realtime",
    providerLatencyMs: 82,
    requestId: "req_rw_synthetic_realtime_001",
    trialWordsLimit: 5000,
    trialWordsRemaining: 3900,
    trialWordsUsed: 1100,
    webSocketURL: "wss://openai-realtime-provider.test/realtime",
  });
  assert.deepEqual(
    toPlainObject(calls).map((call) => call.operation),
    [
      "requireAuth",
      "readProfile",
      "readSubscription",
      "readUsageCounters",
      "evaluateEntitlement",
      "evaluateRateLimit",
      "createRequestId",
      "createClientSecret",
    ],
  );
  assert.doesNotMatch(JSON.stringify(body), /rw_synthetic_openai_key|private transcript|private audio/i);
});

test("desktop realtime session route can be disabled without touching account or provider work", async () => {
  const routeModule = loadRouteModule(sessionRoutePath);
  const { calls, dependencies } = createSessionDependencies({
    createClientSecret: () => {
      throw new Error("Client secret minting must not run when disabled.");
    },
    isEnabled: () => false,
    readProfile: () => {
      throw new Error("Profile must not be read when realtime is disabled.");
    },
  });
  const handler = routeModule.createDesktopRealtimeTranscriptionSessionRouteHandler(
    dependencies,
  );
  const response = await handler(sessionRequest());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "service_unavailable");
  assert.deepEqual(toPlainObject(calls), [
    { operation: "requireAuth" },
    { operation: "isEnabled" },
  ]);
});

test("desktop realtime completion route writes metadata-only provider usage", async () => {
  const routeModule = loadRouteModule(completeRoutePath);
  const { calls, dependencies } = createCompleteDependencies();
  const handler = routeModule.createDesktopRealtimeTranscriptionCompleteRouteHandler(
    dependencies,
  );
  const response = await handler(completeRequest());
  const body = await response.json();
  const metadataInput = calls.find(
    (call) => call.operation === "writeRequestMetadata",
  ).input;

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    audioDurationMs: 1234,
    cleanedWordCount: 3,
    ok: true,
    planState: "trial_active",
    provider: "openai_realtime",
    requestId: "req_rw_synthetic_realtime_001",
    trialWordsLimit: 5000,
    trialWordsRemaining: 3897,
    trialWordsUsed: 1103,
  });
  assert.deepEqual(toPlainObject(metadataInput), {
    appVersion: "0.1.0-test",
    audioDurationMs: 1234,
    cleanedWordCount: 3,
    clerkUserId: "user_rw_synthetic_member_001",
    latencyMs: 250,
    now: "2026-05-19T15:00:00.000Z",
    osVersion: "macOS synthetic",
    planState: "trial_active",
    provider: "openai_realtime",
    requestId: "req_rw_synthetic_realtime_001",
    status: "success",
  });
  assert.doesNotMatch(JSON.stringify(body), privatePayloadPattern);
  assert.doesNotMatch(JSON.stringify(metadataInput), privatePayloadPattern);
});

test("desktop realtime route source stays server-only and secret-name free", async () => {
  for (const routePath of [sessionRoutePath, completeRoutePath]) {
    const source = await readFileAsync(routePath, "utf8");

    assert.match(source, /export const runtime = ["']nodejs["'];/);
    assert.match(source, /export const dynamic = ["']force-dynamic["'];/);
    assert.match(source, /requireDesktopUserId/);
    assert.doesNotMatch(source, /\bOPENAI_API_KEY\b|\bGROQ_API_KEY\b|\bCLERK_SECRET_KEY\b|\bSUPABASE_SECRET_KEY\b|\bSUPABASE_SERVICE_ROLE_KEY\b|\bDESKTOP_TOKEN_SECRET\b/);
    assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  }
});

function sessionRequest(body = {}) {
  return new Request(
    `${syntheticOrigin}/api/desktop/realtime-transcription/session`,
    {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
}

function completeRequest() {
  return new Request(
    `${syntheticOrigin}/api/desktop/realtime-transcription/complete`,
    {
      body: JSON.stringify({
        appVersion: "0.1.0-test",
        audioDurationMs: 1234,
        cleanedWordCount: 3,
        osVersion: "macOS synthetic",
        privateAudio: "private audio",
        privateTranscript: "private transcript",
        providerLatencyMs: 250,
        providerPayload: "private provider payload",
        requestId: "req_rw_synthetic_realtime_001",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
}

function loadRouteModule(routePath) {
  const source = readFileSync(routePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: routePath,
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
      require: createRouteModuleRequire(routePath),
    },
    {
      filename: routePath,
    },
  );

  return commonJsModule.exports;
}

function createRouteModuleRequire(routePath) {
  return function requireRouteModule(specifier) {
    switch (specifier) {
      case "@supabase/supabase-js":
        return {
          createClient: () => {
            throw new Error("Live Supabase clients are outside this route test.");
          },
        };
      case "@/config/server":
        return {
          serverEnv: {
            realtimeTranscription: { enabled: true },
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
      case "@/lib/desktop/auth":
        return {
          requireDesktopUserId: () => {
            throw new Error("Default desktop auth dependency is outside this route test.");
          },
        };
      case "@/lib/providers/openai-realtime":
        return {
          createRubyWhisperOpenAIRealtimeClientSecret: async () => {
            throw new Error("Default OpenAI realtime dependency is outside this route test.");
          },
          rubyWhisperOpenAIRealtimeProviderName: "openai_realtime",
        };
      case "@/lib/rate-limit/supabase-transcription-rate-limits":
        return {
          claimRubyWhisperTranscriptionRateLimit: async () => {
            throw new Error("Default rate-limit dependency is outside this route test.");
          },
        };
      case "@/lib/usage/quota-service":
        return {
          evaluateRubyWhisperQuotaEntitlement: () => {
            throw new Error(`Default quota dependency is outside ${routePath}.`);
          },
          prepareRubyWhisperQuotaUsageIncrement: () => {
            throw new Error(`Default usage dependency is outside ${routePath}.`);
          },
        };
      case "@/lib/usage/supabase-transcription-requests":
        return {
          writeRubyWhisperTranscriptionRequestMetadata: async () => {
            throw new Error("Default request metadata dependency is outside this route test.");
          },
        };
      case "@/lib/usage/supabase-usage-counters":
        return {
          readRubyWhisperUsageCounters: async () => {
            throw new Error("Default usage read dependency is outside this route test.");
          },
          upsertRubyWhisperUsageCounterIncrement: async () => {
            throw new Error("Default usage write dependency is outside this route test.");
          },
        };
      default:
        if (
          specifier === "@/lib/rate-limit/transcription" ||
          specifier === "@/lib/supabase/server"
        ) {
          return {};
        }

        throw new Error(`Unexpected route module import: ${specifier}`);
    }
  };
}

function createSessionDependencies(overrides = {}) {
  const calls = [];
  const dependencies = {
    async createClientSecret(input) {
      calls.push({ input, operation: "createClientSecret" });

      return {
        ok: false,
        error: {
          apiErrorCode: "service_unavailable",
          code: "missing_config",
        },
        metadata: { provider: "openai_realtime" },
      };
    },
    createRequestId() {
      calls.push({ operation: "createRequestId" });

      return "req_rw_synthetic_realtime_001";
    },
    evaluateEntitlement(input) {
      calls.push({ input, operation: "evaluateEntitlement" });

      return entitlementAllowed(input.usageCounters);
    },
    evaluateRateLimit(input) {
      calls.push({ input, operation: "evaluateRateLimit" });

      return { ok: true, status: "allowed" };
    },
    isEnabled() {
      return true;
    },
    now() {
      return syntheticNow;
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
    requireAuth() {
      calls.push({ operation: "requireAuth" });

      return {
        clerkUserId: "user_rw_synthetic_member_001",
        ok: true,
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

function createCompleteDependencies(overrides = {}) {
  const calls = [];
  const dependencies = {
    evaluateEntitlement(input) {
      calls.push({ input, operation: "evaluateEntitlement" });

      return entitlementAllowed(input.usageCounters);
    },
    now() {
      return syntheticNow;
    },
    async parseRequest(request) {
      calls.push({ operation: "parseRequest" });
      const body = await request.json();

      return {
        input: {
          appVersion: body.appVersion,
          audioDurationMs: body.audioDurationMs,
          cleanedWordCount: body.cleanedWordCount,
          osVersion: body.osVersion,
          providerLatencyMs: body.providerLatencyMs,
          requestId: body.requestId,
        },
        ok: true,
      };
    },
    prepareUsageIncrement(input) {
      calls.push({ input, operation: "prepareUsageIncrement" });

      return { ok: true };
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
    requireAuth() {
      calls.push({ operation: "requireAuth" });

      return {
        clerkUserId: "user_rw_synthetic_member_001",
        ok: true,
      };
    },
    async writeRequestMetadata(input) {
      calls.push({ input, operation: "writeRequestMetadata" });

      return {
        action: "inserted",
        ok: true,
        request: input,
      };
    },
    async writeUsageCounterIncrement(input) {
      calls.push({ input, operation: "writeUsageCounterIncrement" });

      return {
        action: "upserted",
        counters: {
          ...input.usageCounters,
          trialWordsRemaining: 3897,
          trialWordsUsed: 1103,
        },
        ok: true,
        usageCounter: {},
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
        ...(args[0] && typeof args[0] === "object" ? { input: args[0] } : {}),
        operation,
      });

      return value(...args);
    };
  }

  return wrapped;
}

function accountProfile(overrides = {}) {
  return {
    clerkUserId: "user_rw_synthetic_member_001",
    isBlocked: false,
    termsAcceptedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function accountSubscription(overrides = {}) {
  return {
    clerkUserId: "user_rw_synthetic_member_001",
    friendOfRubyUntil: null,
    paymentFailed: false,
    planState: "trial_active",
    requiresSubscription: false,
    subscriptionStatus: null,
    ...overrides,
  };
}

function accountUsageCounters(overrides = {}) {
  return {
    clerkUserId: "user_rw_synthetic_member_001",
    trialWordsLimit: 5000,
    trialWordsRemaining: 3900,
    trialWordsUsed: 1100,
    ...overrides,
  };
}

function entitlementAllowed(counters) {
  return {
    ok: true,
    metadata: {
      planState: "trial_active",
      trialWordsLimit: counters.trialWordsLimit,
      trialWordsRemaining: counters.trialWordsRemaining,
      trialWordsUsed: counters.trialWordsUsed,
    },
    planState: "trial_active",
  };
}

function createApiErrorResponse(code, options = {}) {
  const statusByCode = {
    invalid_audio: 422,
    rate_limited: 429,
    service_unavailable: 503,
    signed_out: 401,
    terms_required: 403,
  };
  const retryable = code === "rate_limited" || code === "service_unavailable";

  return Response.json(
    {
      error: {
        code,
        desktopState: "error",
        message: code,
        recovery: "retry",
        retryable,
      },
      ...(options.metadata ? { metadata: options.metadata } : {}),
      ok: false,
      ...(options.requestId ? { requestId: options.requestId } : {}),
    },
    {
      headers: { "Cache-Control": "no-store" },
      status: statusByCode[code] ?? 500,
    },
  );
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

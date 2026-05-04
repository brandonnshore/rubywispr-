import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const conservativeCleanupPath = path.join(
  webRoot,
  "src",
  "lib",
  "cleanup",
  "conservative-cleanup.ts",
);
const syntheticOrigin = "https://rubywhisper-desktop.test";
const syntheticNow = new Date("2026-05-04T07:30:00.000Z");
const allowedTranscriptionRequestMetadataKeys = new Set([
  "appVersion",
  "audioDurationMs",
  "cleanedWordCount",
  "clerkUserId",
  "errorCode",
  "latencyMs",
  "now",
  "osVersion",
  "planState",
  "provider",
  "requestId",
  "status",
]);
const forbiddenTranscriptionRequestPayloadKeys = [
  "authorization",
  "audio",
  "cleanedText",
  "clipboard",
  "context",
  "dictionaryTerms",
  "prompt",
  "providerRequestBody",
  "providerResponseBody",
  "rawTranscript",
  "transcript",
  "transcriptText",
];
const forbiddenTranscriptionRequestPayloadContent =
  /uh schedule ruby whisper|Schedule RubyWhisper|Synthetic cleanup output|Synthetic provider output|Synthetic route context|Ruby Advisory|payload must not echo|Bearer /i;

test("desktop transcribe route returns signed_out before request parsing", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const { calls, dependencies } = createRouteDependencies({
    parseRequest: () => {
      throw new Error("Request parsing must not run for signed-out users.");
    },
    providerClient: providerClientThatMustNotRun("signed-out users"),
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
    providerClient: providerClientThatMustNotRun("missing Terms"),
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
      providerClient: providerClientThatMustNotRun(code),
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

test("desktop transcribe route returns rate_limited before parser or provider work", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const { calls, dependencies } = createRouteDependencies({
    evaluateRateLimit: () => rateLimitRejected(),
    parseRequest: () => {
      throw new Error("Parser must not run for rate-limited requests.");
    },
    providerClient: providerClientThatMustNotRun("route rate limit"),
  });
  const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
  const response = await handler(syntheticAudioRequest());
  const body = await response.json();

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Retry-After"), "30");
  assert.equal(body.error.code, "rate_limited");
  assert.deepEqual(body.metadata, {
    limit: 20,
    requestCount: 20,
    retryAfterSeconds: 30,
    windowEnd: "2026-05-04T07:31:00.000Z",
    windowStart: "2026-05-04T07:30:00.000Z",
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
    ],
  );
  assert.doesNotMatch(
    JSON.stringify(body),
    /audio|transcript|cleaned|context|dictionary|provider payload|user_rw_synthetic/i,
  );
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
      providerClient: providerClientThatMustNotRun(parseResult.code),
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
        "evaluateRateLimit",
        "parseRequest",
      ],
    );
  }
});

test("desktop transcribe route returns cleanup-disabled mocked provider success", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const { calls, dependencies } = createRouteDependencies();
  const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
  const response = await handler(syntheticAudioRequest());
  const body = await response.json();
  const providerCall = calls.find(
    (call) => call.operation === "providerClient.transcribe",
  );
  const rateLimitCall = calls.find(
    (call) => call.operation === "evaluateRateLimit",
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    appVersion: "0.1.0-test",
    audioDurationMs: 4200,
    cleanedText: "Synthetic provider output.",
    cleanedWordCount: 3,
    ok: true,
    osVersion: "macOS synthetic",
    planState: "trial_active",
    provider: "mock_provider",
    providerLatencyMs: 24,
    requestId: "req_rw_synthetic_route_001",
    trialWordsLimit: 5000,
    trialWordsRemaining: 3897,
    trialWordsUsed: 1103,
  });
  assert.deepEqual(
    toPlainObject(rateLimitCall.input),
    {
      clerkUserId: "user_rw_synthetic_member_001",
      now: "2026-05-04T07:30:00.000Z",
      planState: "trial_active",
    },
  );
  assert.deepEqual(
    {
      audioDurationMs: providerCall.input.audioDurationMs,
      audioMimeType: providerCall.input.audioMimeType,
      requestId: providerCall.input.requestId,
    },
    {
      audioDurationMs: 4200,
      audioMimeType: "audio/wav",
      requestId: "req_rw_synthetic_route_001",
    },
  );
  assert.ok(providerCall.input.audio instanceof Blob);
  assert.deepEqual(
    toPlainObject(calls).map((call) => call.operation),
    [
      "requireAuth",
      "readProfile",
      "readSubscription",
      "readUsageCounters",
      "evaluateEntitlement",
      "evaluateRateLimit",
      "parseRequest",
      "createRequestId",
      "providerClient.transcribe",
      "prepareUsageIncrement",
      "writeRequestMetadata",
      "writeUsageCounterIncrement",
    ],
  );
  assert.deepEqual(
    toPlainObject(calls.find((call) => call.operation === "writeRequestMetadata").input),
    {
      appVersion: "0.1.0-test",
      audioDurationMs: 4200,
      cleanedWordCount: 3,
      clerkUserId: "user_rw_synthetic_member_001",
      now: "2026-05-04T07:30:00.000Z",
      osVersion: "macOS synthetic",
      planState: "trial_active",
      provider: "mock_provider",
      latencyMs: 24,
      requestId: "req_rw_synthetic_route_001",
      status: "success",
    },
  );
  assertTranscriptionRequestMetadataOnly(
    calls.find((call) => call.operation === "writeRequestMetadata").input,
  );
  assert.doesNotMatch(JSON.stringify(body), /rawTranscript|providerRequestBody|context|dictionary/i);
});

test("desktop transcribe route increments paid and Friend metadata without trial spend", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();

  for (const scenario of [
    {
      planState: "paid_active",
      subscription: { planState: "paid_active", subscriptionStatus: "active" },
    },
    {
      planState: "friend_of_ruby_active",
      subscription: {
        friendOfRubyUntil: "2026-06-01T00:00:00.000Z",
        planState: "friend_of_ruby_active",
      },
    },
  ]) {
    const { dependencies } = createRouteDependencies({
      evaluateEntitlement: (input) =>
        entitlementAllowedForPlan(input.usageCounters, scenario.planState),
      readSubscription: async (clerkUserId) => ({
        action: "found",
        ok: true,
        subscription: accountSubscription({
          clerkUserId,
          ...scenario.subscription,
        }),
      }),
      readUsageCounters: async (clerkUserId) => ({
        action: "found",
        counters: accountUsageCounters({
          clerkUserId,
          trialWordsRemaining: 0,
          trialWordsUsed: 5000,
        }),
        ok: true,
      }),
    });
    const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
    const response = await handler(syntheticAudioRequest());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.planState, scenario.planState);
    assert.equal(body.cleanedWordCount, 3);
    assert.equal(body.trialWordsUsed, 5000);
    assert.equal(body.trialWordsRemaining, 0);
  }
});

test("desktop transcribe route sanitizes Supabase write failures after provider success", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();

  for (const override of [
    {
      writeRequestMetadata: async () => ({
        error: {
          code: "supabase_transcription_request_write_failed",
          message: "Unable to write transcription request metadata.",
        },
        ok: false,
        status: "write_failed",
      }),
    },
    {
      writeUsageCounterIncrement: async () => ({
        error: {
          code: "supabase_usage_counters_write_failed",
          message: "Unable to write usage counter metadata.",
        },
        ok: false,
        status: "write_failed",
      }),
    },
  ]) {
    const { dependencies } = createRouteDependencies(override);
    const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
    const response = await handler(syntheticAudioRequest());
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(body.error.code, "service_unavailable");
    assert.equal(body.requestId, "req_rw_synthetic_route_001");
    assert.doesNotMatch(
      JSON.stringify(body),
      /audio|transcript|cleaned|context|dictionary|provider payload|database detail/i,
    );
  }
});

test("desktop transcribe route maps provider failures to shared errors", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const scenarios = [
    {
      apiErrorCode: "rate_limited",
      code: "provider_rate_limited",
      retryAfterSeconds: 3,
      status: 429,
    },
    {
      apiErrorCode: "network_error",
      code: "provider_timeout",
      status: 503,
    },
    {
      apiErrorCode: "provider_error",
      code: "provider_invalid_response",
      status: 503,
    },
    {
      apiErrorCode: "provider_error",
      code: "provider_unavailable",
      status: 503,
    },
    {
      apiErrorCode: "network_error",
      code: "network_error",
      status: 503,
    },
  ];

  for (const scenario of scenarios) {
    const { calls, dependencies } = createRouteDependencies({
      providerClient: providerClientReturningFailure(scenario),
    });
    const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
    const response = await handler(syntheticAudioRequest());
    const body = await response.json();
    const requestMetadataInput = calls.find(
      (call) => call.operation === "writeRequestMetadata",
    ).input;

    assert.equal(response.status, scenario.status);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(body.error.code, scenario.apiErrorCode);
    assert.equal(body.requestId, "req_rw_synthetic_route_001");
    assert.deepEqual(body.metadata, {
      appVersion: "0.1.0-test",
      audioDurationMs: 4200,
      osVersion: "macOS synthetic",
      planState: "trial_active",
      provider: "mock_provider",
      providerLatencyMs: 32,
      ...(scenario.retryAfterSeconds
        ? { retryAfterSeconds: scenario.retryAfterSeconds }
        : {}),
      totalLatencyMs: 45,
      trialWordsLimit: 5000,
      trialWordsRemaining: 3900,
    });

    if (scenario.retryAfterSeconds) {
      assert.equal(response.headers.get("Retry-After"), "3");
    }

    assert.deepEqual(toPlainObject(requestMetadataInput), {
      appVersion: "0.1.0-test",
      audioDurationMs: 4200,
      clerkUserId: "user_rw_synthetic_member_001",
      errorCode: scenario.apiErrorCode,
      latencyMs: 32,
      now: "2026-05-04T07:30:00.000Z",
      osVersion: "macOS synthetic",
      planState: "trial_active",
      provider: "mock_provider",
      requestId: "req_rw_synthetic_route_001",
      status: "failure",
    });
    assertTranscriptionRequestMetadataOnly(requestMetadataInput);
  }
});

test("desktop transcribe route returns cleanup-enabled cleaned provider success", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const providerCalls = [];
  const { calls, dependencies } = createRouteDependencies({
    parseRequest: async () =>
      parseSuccess({
        cleanupSettings: {
          cleanupEnabled: true,
          context: "Synthetic route context.",
          contextAwareCleanupEnabled: true,
          dictionaryTerms: ["RubyWhisper", "Ruby Advisory"],
        },
        metadata: {
          cleanupEnabled: true,
          contextAwareCleanupEnabled: true,
        },
      }),
    providerClient: providerClientReturningCleanupSuccess(providerCalls, {
      cleanedText: "Schedule RubyWhisper follow-up for Monday.",
      transcriptionText: "uh schedule ruby whisper follow up for monday",
    }),
  });
  const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
  const response = await handler(syntheticAudioRequest());
  const body = await response.json();
  const requestMetadataInput = calls.find(
    (call) => call.operation === "writeRequestMetadata",
  ).input;
  const usageIncrementInput = calls.find(
    (call) => call.operation === "writeUsageCounterIncrement",
  ).input;

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    appVersion: "0.1.0-test",
    audioDurationMs: 4200,
    cleanedText: "Schedule RubyWhisper follow-up for Monday.",
    cleanedWordCount: 5,
    ok: true,
    osVersion: "macOS synthetic",
    planState: "trial_active",
    provider: "mock_provider",
    providerLatencyMs: 24,
    requestId: "req_rw_synthetic_route_001",
    trialWordsLimit: 5000,
    trialWordsRemaining: 3895,
    trialWordsUsed: 1105,
  });
  assert.deepEqual(
    toPlainObject(providerCalls).map((call) => call.operation),
    ["transcribe", "cleanup"],
  );
  assert.deepEqual(toPlainObject(providerCalls[1].input), {
    cleanupEnabled: true,
    context: "Synthetic route context.",
    contextAwareCleanupEnabled: true,
    dictionaryTerms: ["RubyWhisper", "Ruby Advisory"],
    requestId: "req_rw_synthetic_route_001",
    transcriptText: "uh schedule ruby whisper follow up for monday",
  });
  assert.equal(requestMetadataInput.cleanedWordCount, 5);
  assert.equal(usageIncrementInput.billableWordCount, 5);
  assertTranscriptionRequestMetadataOnly(requestMetadataInput);
  assertNoPrivateCleanupPayload(requestMetadataInput);
  assertNoPrivateCleanupPayload(usageIncrementInput);
});

test("desktop transcribe route omits cleanup context and dictionary when disabled", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const providerCalls = [];
  const { dependencies } = createRouteDependencies({
    parseRequest: async () =>
      parseSuccess({
        cleanupSettings: {
          cleanupEnabled: true,
          context: "Synthetic route context must not reach cleanup provider.",
          contextAwareCleanupEnabled: false,
          dictionaryTerms: [],
        },
        metadata: {
          cleanupEnabled: true,
          contextAwareCleanupEnabled: false,
        },
      }),
    providerClient: providerClientReturningCleanupSuccess(providerCalls),
  });
  const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
  const response = await handler(syntheticAudioRequest());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.cleanedText, "Synthetic cleanup output.");
  assert.deepEqual(toPlainObject(providerCalls[1].input), {
    cleanupEnabled: true,
    contextAwareCleanupEnabled: false,
    requestId: "req_rw_synthetic_route_001",
    transcriptText: "Synthetic provider output.",
  });
});

test("desktop transcribe route falls back to raw text when cleanup fails", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const providerCalls = [];
  const { calls, dependencies } = createRouteDependencies({
    parseRequest: async () =>
      parseSuccess({
        cleanupSettings: {
          cleanupEnabled: true,
          context: "Synthetic route context.",
          contextAwareCleanupEnabled: true,
          dictionaryTerms: ["RubyWhisper"],
        },
        metadata: {
          cleanupEnabled: true,
          contextAwareCleanupEnabled: true,
        },
      }),
    providerClient: providerClientReturningCleanupFailure(providerCalls),
  });
  const handler = routeModule.createDesktopTranscribeRouteHandler(dependencies);
  const response = await handler(syntheticAudioRequest());
  const body = await response.json();
  const requestMetadataInput = calls.find(
    (call) => call.operation === "writeRequestMetadata",
  ).input;

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.cleanedText, "Synthetic provider output.");
  assert.equal(body.cleanedWordCount, 3);
  assert.equal(body.trialWordsRemaining, 3897);
  assert.deepEqual(
    toPlainObject(providerCalls).map((call) => call.operation),
    ["transcribe", "cleanup"],
  );
  assert.equal(requestMetadataInput.cleanedWordCount, 3);
  assertTranscriptionRequestMetadataOnly(requestMetadataInput);
  assertNoPrivateCleanupPayload(requestMetadataInput);
});

test("desktop transcribe provider continuation can be invoked directly", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const response = await routeModule.executeDesktopTranscribeProviderContinuation(
    continuationInput(),
    providerClientReturningSuccess(),
    directContinuationDependencies(),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.cleanedText, "Synthetic provider output.");
  assert.equal(body.cleanedWordCount, 3);
  assert.equal(body.requestId, "req_rw_synthetic_route_001");
});

test("desktop transcribe route stays server-only and provider-safe", async () => {
  const source = await readFile(desktopTranscribeRoutePath, "utf8");

  assert.match(source, /export const runtime = ["']nodejs["'];/);
  assert.match(source, /export const dynamic = ["']force-dynamic["'];/);
  assert.match(source, /createDesktopTranscribeRouteHandler/);
  assert.match(source, /requireClerkUserId/);
  assert.match(source, /runRubyWhisperConservativeCleanup/);
  assert.match(source, /parseDesktopTranscribeRequest/);
  assert.match(source, /evaluateRubyWhisperQuotaEntitlement/);
  assert.match(source, /evaluateRubyWhisperTranscriptionRateLimit/);
  assert.match(source, /createRubyWhisperGroqProviderClient/);
  assert.match(source, /executeDesktopTranscribeProviderContinuation/);
  assert.match(source, /rubyWhisperApiErrorResponse\(["']signed_out["']\)/);
  assert.match(source, /rubyWhisperApiErrorResponse\(["']terms_required["']\)/);
  assert.match(source, /rubyWhisperApiErrorResponse\(["']rate_limited["']/);
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

let conservativeCleanupModule;

function loadConservativeCleanupModuleSync() {
  if (conservativeCleanupModule) {
    return conservativeCleanupModule;
  }

  const source = readFileSync(conservativeCleanupPath, "utf8");
  const executableSource = source.replace(/^import\s+["']server-only["'];\n?/, "");
  const compiled = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: conservativeCleanupPath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
    },
    {
      filename: conservativeCleanupPath,
    },
  );

  conservativeCleanupModule = commonJsModule.exports;

  return conservativeCleanupModule;
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
      case "@/lib/cleanup/conservative-cleanup":
        return loadConservativeCleanupModuleSync();
      case "@/lib/desktop-transcribe/request":
        return {
          parseDesktopTranscribeRequest: async () => {
            throw new Error("Default parser dependency is outside this route test.");
          },
        };
      case "@/lib/providers/groq":
        return {
          createRubyWhisperGroqProviderClient: () =>
            providerClientThatMustNotRun("default Groq provider"),
        };
      case "@/lib/rate-limit/transcription":
        return {
          evaluateRubyWhisperTranscriptionRateLimit: () => {
            throw new Error("Default rate-limit dependency is outside this route test.");
          },
        };
      case "@/lib/usage/quota":
        return {
          countRubyWhisperBillableOutputWords,
        };
      case "@/lib/usage/quota-service":
        return {
          evaluateRubyWhisperQuotaEntitlement: () => {
            throw new Error("Default quota dependency is outside this route test.");
          },
          prepareRubyWhisperQuotaUsageIncrement: () => {
            throw new Error("Default usage increment dependency is outside this route test.");
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
            throw new Error("Default usage dependency is outside this route test.");
          },
          upsertRubyWhisperUsageCounterIncrement: async () => {
            throw new Error("Default usage write dependency is outside this route test.");
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
    createRequestId() {
      calls.push({ operation: "createRequestId" });

      return "req_rw_synthetic_route_001";
    },
    evaluateEntitlement(input) {
      calls.push({ input, operation: "evaluateEntitlement" });

      return entitlementAllowed(input.usageCounters);
    },
    evaluateRateLimit(input) {
      calls.push({ input, operation: "evaluateRateLimit" });

      return rateLimitAllowed(input);
    },
    now() {
      return syntheticNow;
    },
    async parseRequest() {
      calls.push({ operation: "parseRequest" });

      return parseSuccess();
    },
    providerClient: providerClientReturningSuccess(calls),
    prepareUsageIncrement(input) {
      calls.push({ input, operation: "prepareUsageIncrement" });

      return preparedUsageIncrement(input);
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

      const increment = preparedUsageIncrement(input);

      return {
        action: "upserted",
        counters: increment.counters,
        ok: true,
        usageCounter: increment.usageCounter,
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
    if (operation === "providerClient") {
      wrapped.providerClient = value;
      continue;
    }

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

function parseSuccess(overrides = {}) {
  return {
    input: {
      cleanupSettings: {
        cleanupEnabled: false,
        contextAwareCleanupEnabled: false,
        dictionaryTerms: ["RubyWhisper"],
        ...overrides.cleanupSettings,
      },
      metadata: {
        appVersion: "0.1.0-test",
        audioDurationMs: 4200,
        audioMimeType: "audio/wav",
        cleanupEnabled: false,
        contextAwareCleanupEnabled: false,
        osVersion: "macOS synthetic",
        ...overrides.metadata,
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

function continuationInput(overrides = {}) {
  return {
    clerkUserId: "user_rw_synthetic_member_001",
    entitlement: entitlementAllowed(),
    profile: accountProfile(),
    requestInput: parseSuccess().input,
    subscription: accountSubscription(),
    usageCounters: accountUsageCounters(),
    ...overrides,
  };
}

function entitlementAllowed(usageCounters = accountUsageCounters()) {
  return entitlementAllowedForPlan(usageCounters, "trial_active");
}

function entitlementAllowedForPlan(usageCounters, planState) {
  return {
    canTranscribe: true,
    metadata: quotaMetadata(planState, usageCounters),
    ok: true,
    planState,
    preflightPolicy: "allow_if_started_under_limit",
    status: "allowed",
  };
}

function rateLimitAllowed(input = {}) {
  return {
    metadata: {
      limit: 20,
      requestCount: 4,
      windowEnd: "2026-05-04T07:31:00.000Z",
      windowStart: "2026-05-04T07:30:00.000Z",
    },
    ok: true,
    state: {
      clerkUserId: input.clerkUserId ?? "user_rw_synthetic_member_001",
      requestCount: 4,
      windowStart: "2026-05-04T07:30:00.000Z",
    },
    status: "allowed",
  };
}

function rateLimitRejected() {
  const metadata = {
    limit: 20,
    requestCount: 20,
    retryAfterSeconds: 30,
    windowEnd: "2026-05-04T07:31:00.000Z",
    windowStart: "2026-05-04T07:30:00.000Z",
  };

  return {
    apiErrorMetadata: metadata,
    errorCode: "rate_limited",
    metadata,
    ok: false,
    state: {
      clerkUserId: "user_rw_synthetic_member_001",
      requestCount: 20,
      windowStart: "2026-05-04T07:30:00.000Z",
    },
    status: "rate_limited",
  };
}

function preparedUsageIncrement(input) {
  const billableWordCount =
    typeof input.billableWordCount === "number" && Number.isFinite(input.billableWordCount)
      ? Math.max(0, Math.floor(input.billableWordCount))
      : 0;
  const usageCounters = input.usageCounters;
  const trialWordsIncrement =
    input.entitlement?.planState === "trial_active" ? billableWordCount : 0;
  const trialWordsUsed = Math.min(
    usageCounters.trialWordsLimit,
    usageCounters.trialWordsUsed + trialWordsIncrement,
  );
  const counters = accountUsageCounters({
    clerkUserId: usageCounters.clerkUserId,
    lifetimeWordsUsed: usageCounters.lifetimeWordsUsed + billableWordCount,
    monthlyPeriodStart: "2026-05-01",
    monthlyWordsUsed: usageCounters.monthlyWordsUsed + billableWordCount,
    trialWordsRemaining: Math.max(0, usageCounters.trialWordsLimit - trialWordsUsed),
    trialWordsUsed,
    updatedAt: syntheticNow.toISOString(),
  });

  return {
    billableWordCount,
    counters,
    ok: true,
    planState: input.entitlement?.planState ?? "trial_active",
    preflightPolicy: "allow_if_started_under_limit",
    usageCounter: {
      clerk_user_id: usageCounters.clerkUserId,
      lifetime_words_used: usageCounters.lifetimeWordsUsed + billableWordCount,
      monthly_period_start: "2026-05-01",
      monthly_words_used: usageCounters.monthlyWordsUsed + billableWordCount,
      trial_words_used: usageCounters.trialWordsUsed + trialWordsIncrement,
      updated_at: syntheticNow.toISOString(),
    },
    willExhaustTrial:
      usageCounters.trialWordsRemaining > 0 &&
      counters.trialWordsRemaining === 0 &&
      input.entitlement?.planState === "trial_active",
  };
}

function directContinuationDependencies() {
  return {
    createRequestId: () => "req_rw_synthetic_route_001",
    now: () => syntheticNow,
    prepareUsageIncrement: preparedUsageIncrement,
    writeRequestMetadata: async (input) => ({
      action: "inserted",
      ok: true,
      request: input,
    }),
    writeUsageCounterIncrement: async (input) => ({
      action: "upserted",
      counters: preparedUsageIncrement(input).counters,
      ok: true,
      usageCounter: preparedUsageIncrement(input).usageCounter,
    }),
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

function providerClientReturningSuccess(calls = []) {
  return {
    cleanup: async () => {
      throw new Error("Cleanup provider must not run in RUB-144.");
    },
    transcribe: async (input) => {
      calls.push({ input, operation: "providerClient.transcribe" });

      return {
        ok: true,
        result: {
          audioDurationMs: input.audioDurationMs,
          provider: "mock_provider",
          providerLatencyMs: 24,
          text: "Synthetic provider output.",
        },
      };
    },
  };
}

function providerClientReturningCleanupSuccess(calls = [], options = {}) {
  return {
    cleanup: async (input) => {
      calls.push({ input, operation: "cleanup" });

      return {
        ok: true,
        result: {
          cleanedText: options.cleanedText ?? "Synthetic cleanup output.",
          provider: "mock_provider",
          providerLatencyMs: 18,
        },
      };
    },
    transcribe: async (input) => {
      calls.push({ input, operation: "transcribe" });

      return {
        ok: true,
        result: {
          audioDurationMs: input.audioDurationMs,
          provider: "mock_provider",
          providerLatencyMs: 24,
          text: options.transcriptionText ?? "Synthetic provider output.",
        },
      };
    },
  };
}

function providerClientReturningCleanupFailure(calls = []) {
  return {
    cleanup: async (input) => {
      calls.push({ input, operation: "cleanup" });

      return {
        error: {
          apiErrorCode: "provider_error",
          code: "provider_unavailable",
          message: "Synthetic cleanup unavailable.",
          retryable: true,
        },
        metadata: { provider: "mock_provider" },
        ok: false,
      };
    },
    transcribe: async (input) => {
      calls.push({ input, operation: "transcribe" });

      return {
        ok: true,
        result: {
          audioDurationMs: input.audioDurationMs,
          provider: "mock_provider",
          providerLatencyMs: 24,
          text: "Synthetic provider output.",
        },
      };
    },
  };
}

function providerClientReturningFailure(scenario) {
  return {
    cleanup: async () => {
      throw new Error("Cleanup provider must not run in RUB-144.");
    },
    transcribe: async () => ({
      error: {
        apiErrorCode: scenario.apiErrorCode,
        code: scenario.code,
        message: "Synthetic provider failure.",
        retryable: true,
      },
      metadata: {
        provider: "mock_provider",
        providerLatencyMs: 32,
        ...(scenario.retryAfterSeconds
          ? { retryAfterSeconds: scenario.retryAfterSeconds }
          : {}),
        totalLatencyMs: 45,
      },
      ok: false,
    }),
  };
}

function providerClientThatMustNotRun(label) {
  return {
    cleanup: async () => {
      throw new Error(`Cleanup provider must not run for ${label}.`);
    },
    transcribe: async () => {
      throw new Error(`Transcription provider must not run for ${label}.`);
    },
  };
}

function countRubyWhisperBillableOutputWords(value) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function createApiErrorResponse(code, options = {}) {
  const descriptor = apiErrorDescriptors[code];
  const metadata = options.metadata
    ? sanitizeApiErrorMetadata(options.metadata)
    : undefined;
  const headers = new Headers({
    "Cache-Control": "no-store",
  });

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
      ...(options.requestId ? { requestId: options.requestId } : {}),
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
  payment_failed: {
    desktopState: "payment_failed",
    httpStatus: 402,
    message: "Update billing to continue.",
    recovery: "open_billing",
    retryable: false,
  },
  network_error: {
    desktopState: "network_error",
    httpStatus: 503,
    message: "Check your internet connection and try again.",
    recovery: "retry",
    retryable: true,
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
  "limit",
  "osVersion",
  "planState",
  "provider",
  "providerLatencyMs",
  "requestCount",
  "retryAfterSeconds",
  "totalLatencyMs",
  "trialWordsLimit",
  "trialWordsRemaining",
  "windowEnd",
  "windowStart",
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

function assertNoPrivateCleanupPayload(value) {
  assert.doesNotMatch(
    JSON.stringify(value),
    /uh schedule ruby whisper|Schedule RubyWhisper|Synthetic route context|Ruby Advisory/,
  );
}

function assertTranscriptionRequestMetadataOnly(input) {
  const keys = Object.keys(input);

  for (const key of keys) {
    assert.equal(
      allowedTranscriptionRequestMetadataKeys.has(key),
      true,
      `${key} is not an allowed transcription request metadata key`,
    );
  }

  for (const privateKey of forbiddenTranscriptionRequestPayloadKeys) {
    assert.equal(
      Object.hasOwn(input, privateKey),
      false,
      `${privateKey} must not be persisted in request metadata`,
    );
  }

  assert.doesNotMatch(
    JSON.stringify(input),
    forbiddenTranscriptionRequestPayloadContent,
  );
}

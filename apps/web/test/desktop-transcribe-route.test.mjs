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
const expectedHttpStatuses = {
  account_blocked: 403,
  duration_limit_reached: 413,
  invalid_audio: 422,
  payment_failed: 402,
  signed_out: 401,
  subscription_required: 402,
  terms_required: 403,
  trial_exhausted: 402,
};
const privatePayloadPattern =
  /member@example\.com|user_rw_synthetic|private transcript|private audio|private context|private prompt|cleanedText|rawTranscript|clipboard|authorization|secret|token/i;

test("desktop transcribe route returns signed_out before reads, parsing, or continuation", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const handler = routeModule.createDesktopTranscribeRouteHandler({
    continueAfterPreflight: () => {
      throw new Error("Continuation must not run for signed-out users.");
    },
    evaluateQuotaEntitlement: () => {
      throw new Error("Quota must not be checked for signed-out users.");
    },
    parseRequest: () => {
      throw new Error("Request must not be parsed for signed-out users.");
    },
    readProfile: () => {
      throw new Error("Profile must not be read for signed-out users.");
    },
    readSubscription: () => {
      throw new Error("Subscription must not be read for signed-out users.");
    },
    readUsageCounters: () => {
      throw new Error("Usage counters must not be read for signed-out users.");
    },
    requireAuth: async () => ({
      error: {
        code: "clerk_session_required",
        message: "A Clerk user session is required.",
      },
      ok: false,
    }),
  });

  const response = await handler(syntheticAudioRequest());
  const body = await response.json();

  assert.equal(response.status, expectedHttpStatuses.signed_out);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.error.code, "signed_out");
  assert.equal(body.error.desktopState, "signed_out");
  assert.equal(body.ok, false);
});

test("desktop transcribe route returns terms_required before quota, parsing, or continuation", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const calls = [];
  const handler = routeModule.createDesktopTranscribeRouteHandler({
    continueAfterPreflight: () => {
      throw new Error("Continuation must not run before Terms acceptance.");
    },
    evaluateQuotaEntitlement: () => {
      throw new Error("Quota must not be checked before Terms acceptance.");
    },
    parseRequest: () => {
      throw new Error("Request must not be parsed before Terms acceptance.");
    },
    readProfile: async (clerkUserId) => {
      calls.push({ clerkUserId, operation: "readProfile" });

      return {
        action: "found",
        ok: true,
        profile: accountProfile({ termsAcceptedAt: undefined }),
      };
    },
    readSubscription: async (clerkUserId) => {
      calls.push({ clerkUserId, operation: "readSubscription" });

      return {
        action: "defaulted",
        ok: true,
        subscription: accountSubscription(),
      };
    },
    readUsageCounters: async (clerkUserId) => {
      calls.push({ clerkUserId, operation: "readUsageCounters" });

      return {
        action: "defaulted",
        counters: accountUsageCounters(),
        ok: true,
      };
    },
    requireAuth: signedInAuth,
  });

  const response = await handler(syntheticAudioRequest());
  const body = await response.json();

  assert.equal(response.status, expectedHttpStatuses.terms_required);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.error.code, "terms_required");
  assert.deepEqual(body.metadata, { planState: "trial_active" });
  assert.deepEqual(calls.map((call) => call.operation).sort(), [
    "readProfile",
    "readSubscription",
    "readUsageCounters",
  ]);
});

test("desktop transcribe route maps entitlement failures to shared metadata-only errors", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();

  for (const scenario of [
    { code: "account_blocked", planState: "blocked" },
    { code: "payment_failed", planState: "payment_failed" },
    { code: "subscription_required", planState: "subscription_required" },
    { code: "trial_exhausted", planState: "trial_exhausted" },
  ]) {
    let parseCalls = 0;
    let continuationCalls = 0;
    const handler = routeModule.createDesktopTranscribeRouteHandler({
      continueAfterPreflight: () => {
        continuationCalls += 1;
        throw new Error("Continuation must not run after quota rejection.");
      },
      evaluateQuotaEntitlement: () => ({
        canTranscribe: false,
        errorCode: scenario.code,
        metadata: quotaMetadata(scenario.planState),
        ok: false,
        planState: scenario.planState,
        preflightPolicy: "allow_if_started_under_limit",
        status: scenario.code,
      }),
      parseRequest: () => {
        parseCalls += 1;
        throw new Error("Request must not be parsed after quota rejection.");
      },
      readProfile: async () => ({
        action: "found",
        ok: true,
        profile: accountProfile(),
      }),
      readSubscription: async () => ({
        action: "defaulted",
        ok: true,
        subscription: accountSubscription({ planState: scenario.planState }),
      }),
      readUsageCounters: async () => ({
        action: "defaulted",
        counters: accountUsageCounters(
          scenario.code === "trial_exhausted"
            ? { trialWordsRemaining: 0, trialWordsUsed: 5_000 }
            : {},
        ),
        ok: true,
      }),
      requireAuth: signedInAuth,
    });

    const response = await handler(syntheticAudioRequest());
    const body = await response.json();

    assert.equal(response.status, expectedHttpStatuses[scenario.code]);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(body.error.code, scenario.code);
    assert.deepEqual(body.metadata, {
      planState: scenario.planState,
      trialWordsLimit: 5_000,
      trialWordsRemaining: scenario.code === "trial_exhausted" ? 0 : 4_000,
    });
    assert.equal(parseCalls, 0);
    assert.equal(continuationCalls, 0);
    assert.doesNotMatch(JSON.stringify(body), privatePayloadPattern);
  }
});

test("desktop transcribe route maps parser failures with no-store shared errors", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();

  for (const scenario of [
    { code: "invalid_audio" },
    {
      code: "duration_limit_reached",
      metadata: {
        audioDurationMs: 600_001,
        durationLimitMs: 600_000,
      },
    },
  ]) {
    let continuationCalls = 0;
    const handler = routeModule.createDesktopTranscribeRouteHandler({
      continueAfterPreflight: () => {
        continuationCalls += 1;
        throw new Error("Continuation must not run after parser rejection.");
      },
      evaluateQuotaEntitlement: () => allowedEntitlement(),
      parseRequest: async () => ({
        code: scenario.code,
        ...(scenario.metadata ? { metadata: scenario.metadata } : {}),
        ok: false,
      }),
      readProfile: async () => ({
        action: "found",
        ok: true,
        profile: accountProfile(),
      }),
      readSubscription: async () => ({
        action: "defaulted",
        ok: true,
        subscription: accountSubscription(),
      }),
      readUsageCounters: async () => ({
        action: "defaulted",
        counters: accountUsageCounters(),
        ok: true,
      }),
      requireAuth: signedInAuth,
    });

    const response = await handler(syntheticAudioRequest());
    const body = await response.json();

    assert.equal(response.status, expectedHttpStatuses[scenario.code]);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(body.error.code, scenario.code);
    assert.deepEqual(body.metadata, scenario.metadata);
    assert.equal(continuationCalls, 0);
  }
});

test("desktop transcribe route reaches typed continuation after successful preflight", async () => {
  const routeModule = await loadDesktopTranscribeRouteModule();
  const contexts = [];
  const parsedInput = transcribeRequestInput();
  const handler = routeModule.createDesktopTranscribeRouteHandler({
    continueAfterPreflight: (context) => {
      contexts.push(context);

      return Response.json(
        {
          ok: true,
          planState: context.entitlement.planState,
          stage: "preflight_passed",
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
          status: 202,
        },
      );
    },
    evaluateQuotaEntitlement: () => allowedEntitlement(),
    parseRequest: async () => ({
      input: parsedInput,
      ok: true,
    }),
    readProfile: async () => ({
      action: "found",
      ok: true,
      profile: accountProfile(),
    }),
    readSubscription: async () => ({
      action: "defaulted",
      ok: true,
      subscription: accountSubscription(),
    }),
    readUsageCounters: async () => ({
      action: "defaulted",
      counters: accountUsageCounters(),
      ok: true,
    }),
    requireAuth: signedInAuth,
  });

  const response = await handler(syntheticAudioRequest());
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    ok: true,
    planState: "trial_active",
    stage: "preflight_passed",
  });
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].userId, "user_rw_synthetic_member_001");
  assert.equal(contexts[0].input, parsedInput);
  assert.equal(contexts[0].entitlement.ok, true);
  assert.equal(contexts[0].entitlement.canTranscribe, true);
  assert.ok(contexts[0].input.providerInput.audio instanceof Blob);
  assert.doesNotMatch(JSON.stringify(body), privatePayloadPattern);
});

test("desktop transcribe route shell remains server-only and avoids provider imports", async () => {
  const source = await readFile(desktopTranscribeRoutePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /export const dynamic = ["']force-dynamic["'];/);
  assert.match(source, /export const runtime = ["']nodejs["'];/);
  assert.match(source, /createDesktopTranscribeRouteHandler/);
  assert.match(source, /continueAfterPreflight/);
  assert.match(source, /requireClerkUserId/);
  assert.match(source, /parseDesktopTranscribeRequest/);
  assert.match(source, /rubyWhisperApiErrorResponse\(["']signed_out["']\)/);
  assert.match(source, /rubyWhisperApiErrorResponse\(["']terms_required["']/);
  assert.match(source, /rubyWhisperApiErrorResponse\(entitlement\.errorCode/);
  assert.match(source, /rubyWhisperApiErrorResponse\(requestResult\.code/);
  assert.doesNotMatch(source, /from\s+["']@\/lib\/providers\//);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
});

async function loadDesktopTranscribeRouteModule() {
  const source = await readFile(desktopTranscribeRoutePath, "utf8");
  const testableSource = source
    .replace(/^import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\s+createClient\s+\}\s+from\s+["']@supabase\/supabase-js["'];\n\n/,
      "const createClient = () => { throw new Error('Live Supabase clients are outside this route test.'); };\n\n",
    )
    .replace(
      /import\s+\{\n\s+readRubyWhisperAccountProfileMetadata,\n\s+type RubyWhisperAccountProfileMetadata,\n\s+type RubyWhisperAccountProfileMetadataReadResult,\n\s+type SupabaseAccountProfileClient,\n\}\s+from\s+["']@\/lib\/account\/profile-metadata["'];\n/,
      "const readRubyWhisperAccountProfileMetadata = async () => { throw new Error('Default profile dependency is outside this route test.'); };\n",
    )
    .replace(
      /import\s+\{\n\s+readRubyWhisperSubscriptionCache,\n\s+type RubyWhisperSubscriptionCache,\n\s+type RubyWhisperSubscriptionCacheReadResult,\n\s+type SupabaseSubscriptionCacheClient,\n\}\s+from\s+["']@\/lib\/account\/subscription-cache["'];\n/,
      "const readRubyWhisperSubscriptionCache = async () => { throw new Error('Default subscription dependency is outside this route test.'); };\n",
    )
    .replace(
      /import\s+\{\n\s+rubyWhisperApiErrorResponse,\n\s+type RubyWhisperApiErrorMetadata,\n\}\s+from\s+["']@\/lib\/api\/errors["'];\n/,
      "const rubyWhisperApiErrorResponse = createApiErrorResponse;\n",
    )
    .replace(
      /import\s+\{\n\s+requireClerkUserId,\n\s+type ClerkRequiredAuthState,\n\}\s+from\s+["']@\/lib\/auth\/clerk["'];\n/,
      "const requireClerkUserId = async () => ({ ok: false, error: { code: 'clerk_session_required', message: 'A Clerk user session is required.' } });\n",
    )
    .replace(
      /import\s+\{\n\s+parseDesktopTranscribeRequest,\n\s+type DesktopTranscribeRequestInput,\n\s+type DesktopTranscribeRequestParseResult,\n\}\s+from\s+["']@\/lib\/desktop-transcribe\/request["'];\n/,
      "const parseDesktopTranscribeRequest = async () => { throw new Error('Default parser dependency is outside this route test.'); };\n",
    )
    .replace(
      /import\s+type\s+\{\s+SupabaseServiceRoleRuntimeConfig\s+\}\s+from\s+["']@\/lib\/supabase\/server["'];\n/,
      "",
    )
    .replace(
      /import\s+\{\n\s+evaluateRubyWhisperQuotaEntitlement,\n\s+type RubyWhisperQuotaAllowedResult,\n\s+type RubyWhisperQuotaEntitlementInput,\n\s+type RubyWhisperQuotaEntitlementResult,\n\s+type RubyWhisperQuotaMetadata,\n\}\s+from\s+["']@\/lib\/usage\/quota-service["'];\n/,
      "const evaluateRubyWhisperQuotaEntitlement = () => { throw new Error('Default quota dependency is outside this route test.'); };\n",
    )
    .replace(
      /import\s+\{\n\s+readRubyWhisperUsageCounters,\n\s+type RubyWhisperUsageCounters,\n\s+type RubyWhisperUsageCountersReadResult,\n\s+type SupabaseUsageCountersClient,\n\}\s+from\s+["']@\/lib\/usage\/supabase-usage-counters["'];\n/,
      "const readRubyWhisperUsageCounters = async () => { throw new Error('Default usage dependency is outside this route test.'); };\n",
    );
  const compiled = ts.transpileModule(testableSource, {
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
      Blob,
      createApiErrorResponse,
      exports: commonJsModule.exports,
      module: commonJsModule,
      Response,
    },
    {
      filename: desktopTranscribeRoutePath,
    },
  );

  return commonJsModule.exports;
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

const safeMetadataKeys = new Set([
  "audioDurationMs",
  "durationLimitMs",
  "planState",
  "trialWordsLimit",
  "trialWordsRemaining",
]);

function sanitizeApiErrorMetadata(metadata) {
  const sanitized = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (safeMetadataKeys.has(key)) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function signedInAuth() {
  return Promise.resolve({
    ok: true,
    userId: "user_rw_synthetic_member_001",
  });
}

function syntheticAudioRequest() {
  return new Request(`${syntheticOrigin}/api/desktop/transcribe`, {
    body: new Uint8Array([1, 2, 3]),
    headers: {
      "content-type": "audio/wav",
      "x-rubywhisper-audio-duration-ms": "4200",
    },
    method: "POST",
  });
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
  const trialWordsLimit = overrides.trialWordsLimit ?? 5_000;
  const trialWordsUsed = overrides.trialWordsUsed ?? 1_000;

  return {
    clerkUserId: "user_rw_synthetic_member_001",
    isTrialExhausted: trialWordsUsed >= trialWordsLimit,
    isTrialLow: trialWordsLimit - trialWordsUsed <= 500,
    lifetimeWordsUsed: trialWordsUsed,
    monthlyPeriodStart: "2026-05-01",
    monthlyWordsUsed: trialWordsUsed,
    trialWordsLimit,
    trialWordsRemaining: Math.max(0, trialWordsLimit - trialWordsUsed),
    trialWordsUsed,
    ...overrides,
  };
}

function quotaMetadata(planState) {
  const counters = accountUsageCounters(
    planState === "trial_exhausted"
      ? { trialWordsRemaining: 0, trialWordsUsed: 5_000 }
      : {},
  );

  return {
    isTrialLow: counters.isTrialLow,
    planState,
    trialWordsLimit: counters.trialWordsLimit,
    trialWordsRemaining: counters.trialWordsRemaining,
    trialWordsUsed: counters.trialWordsUsed,
  };
}

function allowedEntitlement() {
  return {
    canTranscribe: true,
    metadata: quotaMetadata("trial_active"),
    ok: true,
    planState: "trial_active",
    preflightPolicy: "allow_if_started_under_limit",
    status: "allowed",
  };
}

function transcribeRequestInput() {
  return {
    cleanupSettings: {
      cleanupEnabled: false,
      contextAwareCleanupEnabled: false,
      dictionaryTerms: [],
    },
    metadata: {
      audioDurationMs: 4_200,
      audioMimeType: "audio/wav",
      cleanupEnabled: false,
      contextAwareCleanupEnabled: false,
    },
    providerInput: {
      audio: new Blob([new Uint8Array([1, 2, 3])], {
        type: "audio/wav",
      }),
      audioDurationMs: 4_200,
      audioMimeType: "audio/wav",
    },
  };
}

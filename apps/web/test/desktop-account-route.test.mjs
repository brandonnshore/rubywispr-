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
const desktopAccountRoutePath = path.join(
  webRoot,
  "src",
  "app",
  "api",
  "desktop",
  "account",
  "route.ts",
);
const accountProfileMetadataPath = path.join(
  webRoot,
  "src",
  "lib",
  "account",
  "profile-metadata.ts",
);

const forbiddenPrivateDesktopAccountFragments = [
  "audio",
  "rawTranscript",
  "transcript",
  "cleanedText",
  "context",
  "clipboard",
  "dictionaryTerms",
  "prompt",
  "providerRequestBody",
  "providerResponseBody",
  "authorization",
  "token",
  "secret",
];
const forbiddenPrivateFixturePattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|private prompt|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local/i;

test("desktop account route returns shared signed_out error", async () => {
  const routeModule = await loadDesktopAccountRouteModule();
  const handler = routeModule.createDesktopAccountRouteHandler({
    createSnapshot: () => {
      throw new Error("Snapshot must not be created for signed-out users.");
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

  const response = await handler();
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    error: {
      code: "signed_out",
      desktopState: "signed_out",
      message: "Sign in to use RubyWhisper.",
      recovery: "open_sign_in",
      retryable: false,
    },
    ok: false,
  });
});

test("desktop account route returns signed-in account snapshot metadata only", async () => {
  const routeModule = await loadDesktopAccountRouteModule();
  const calls = [];
  const snapshot = accountSnapshot();
  const handler = routeModule.createDesktopAccountRouteHandler({
    createSnapshot(input) {
      calls.push({ input, operation: "createSnapshot" });

      return {
        action: "created",
        ok: true,
        snapshot,
      };
    },
    readProfile: async (clerkUserId) => {
      calls.push({ clerkUserId, operation: "readProfile" });

      return {
        action: "found",
        ok: true,
        profile: accountProfile(),
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
    requireAuth: async () => ({
      ok: true,
      userId: "user_rw_synthetic_member_001",
    }),
  });

  const response = await handler();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    ok: true,
    ...snapshot,
  });
  assert.deepEqual(toPlainObject(calls), [
    {
      clerkUserId: "user_rw_synthetic_member_001",
      operation: "readProfile",
    },
    {
      clerkUserId: "user_rw_synthetic_member_001",
      operation: "readSubscription",
    },
    {
      clerkUserId: "user_rw_synthetic_member_001",
      operation: "readUsageCounters",
    },
    {
      input: {
        profile: accountProfile(),
        subscription: accountSubscription(),
        usageCounters: accountUsageCounters(),
      },
      operation: "createSnapshot",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(body), forbiddenPrivateFixturePattern);
  assert.doesNotMatch(JSON.stringify(body), /user_rw_synthetic|cus_|sub_|price_|sk_/);
});

test("desktop account route maps metadata read failures to service_unavailable", async () => {
  const routeModule = await loadDesktopAccountRouteModule();
  const handler = routeModule.createDesktopAccountRouteHandler({
    createSnapshot: () => {
      throw new Error("Snapshot must not be created when metadata read fails.");
    },
    readProfile: async () => ({
      error: {
        code: "supabase_account_profile_read_failed",
        message: "Unable to read account profile metadata.",
      },
      ok: false,
      status: "read_failed",
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
    requireAuth: async () => ({
      ok: true,
      userId: "user_rw_synthetic_member_001",
    }),
  });

  const response = await handler();
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.error.code, "service_unavailable");
  assert.equal(body.error.retryable, true);
});

test("desktop account route maps snapshot invalid input to internal_error", async () => {
  const routeModule = await loadDesktopAccountRouteModule();
  const handler = routeModule.createDesktopAccountRouteHandler({
    createSnapshot: () => ({
      error: {
        code: "account_metadata_mismatch",
        message: "Account metadata must belong to the same Clerk user.",
      },
      ok: false,
      status: "invalid_input",
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
    requireAuth: async () => ({
      ok: true,
      userId: "user_rw_synthetic_member_001",
    }),
  });

  const response = await handler();
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error.code, "internal_error");
});

test("account profile metadata helper reads only profile metadata", async () => {
  const helper = await loadAccountProfileMetadataHelper();
  const { calls, client } = createAccountProfileClient({
    row: {
      clerk_user_id: "user_rw_synthetic_member_001",
      email: " member@example.com ",
      is_blocked: true,
      terms_accepted_at: "2026-05-04T05:00:00.000Z",
    },
  });

  const result = await helper.readRubyWhisperAccountProfileMetadata(
    { clerkUserId: " user_rw_synthetic_member_001 " },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "found",
    ok: true,
    profile: {
      clerkUserId: "user_rw_synthetic_member_001",
      email: "member@example.com",
      isBlocked: true,
      termsAcceptedAt: "2026-05-04T05:00:00.000Z",
    },
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "profiles" },
    {
      columns: "clerk_user_id,email,terms_accepted_at,is_blocked",
      operation: "select",
    },
    {
      clerkUserId: "user_rw_synthetic_member_001",
      columnName: "clerk_user_id",
      operation: "eq",
    },
    { operation: "maybeSingle", phase: "read" },
  ]);
});

test("account profile metadata helper returns sanitized failures", async () => {
  const helper = await loadAccountProfileMetadataHelper();

  assert.deepEqual(
    toPlainObject(
      await helper.readRubyWhisperAccountProfileMetadata(
        { clerkUserId: " " },
        () => {
          throw new Error("Client factory must not be called for invalid input.");
        },
      ),
    ),
    {
      error: {
        code: "missing_clerk_user_id",
        message: "A Clerk user ID is required for account profile metadata.",
      },
      ok: false,
      status: "missing_user",
    },
  );

  const { client } = createAccountProfileClient({
    readError: { message: "database detail must not echo" },
  });

  assert.deepEqual(
    toPlainObject(
      await helper.readRubyWhisperAccountProfileMetadata(
        { clerkUserId: "user_rw_synthetic_member_001" },
        () => client,
      ),
    ),
    {
      clerkUserId: "user_rw_synthetic_member_001",
      error: {
        code: "supabase_account_profile_read_failed",
        message: "Unable to read account profile metadata.",
      },
      ok: false,
      status: "read_failed",
    },
  );
});

test("desktop account route and profile helper stay server-only and metadata-only", async () => {
  const [routeSource, profileSource] = await Promise.all([
    readFile(desktopAccountRoutePath, "utf8"),
    readFile(accountProfileMetadataPath, "utf8"),
  ]);

  assert.match(routeSource, /createDesktopAccountRouteHandler/);
  assert.match(routeSource, /requireClerkUserId/);
  assert.match(routeSource, /rubyWhisperApiErrorResponse\(["']signed_out["']\)/);
  assert.match(routeSource, /rubyWhisperApiErrorResponse\(["']service_unavailable["']\)/);
  assert.match(routeSource, /rubyWhisperApiErrorResponse\(["']internal_error["']\)/);
  assert.match(routeSource, /Cache-Control["']:\s*["']no-store/);
  assert.doesNotMatch(routeSource, /Response\.json\([^)]*userId/s);
  assert.doesNotMatch(routeSource, /Response\.json\([^)]*clerkUserId/s);

  assert.match(profileSource, /^import\s+["']server-only["'];/m);
  assert.match(profileSource, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.match(profileSource, /\bprofiles\b/);
  assert.match(profileSource, /clerk_user_id,email,terms_accepted_at,is_blocked/);

  for (const source of [routeSource, profileSource]) {
    assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
    assert.doesNotMatch(source, /\bstripe_customer_id\b/);
    assert.doesNotMatch(source, /\bstripe_subscription_id\b/);
    assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);

    for (const fragment of forbiddenPrivateDesktopAccountFragments) {
      assert.doesNotMatch(
        source,
        new RegExp(`\\b${fragment}\\b`),
        `desktop account route must not reference private content field "${fragment}"`,
      );
    }
  }
});

async function loadDesktopAccountRouteModule() {
  const source = await readFile(desktopAccountRoutePath, "utf8");
  const testableSource = source
    .replace(
      /import\s+\{\s+createClient\s+\}\s+from\s+["']@supabase\/supabase-js["'];\n\n/,
      "const createClient = () => { throw new Error('Live Supabase clients are outside this route test.'); };\n\n",
    )
    .replace(
      /import\s+\{\n\s+createRubyWhisperDesktopAccountSnapshot,\n\s+type RubyWhisperDesktopAccountSnapshotInput,\n\s+type RubyWhisperDesktopAccountSnapshotResult,\n\}\s+from\s+["']@\/lib\/account\/desktop-account-snapshot["'];\n/,
      "const createRubyWhisperDesktopAccountSnapshot = () => { throw new Error('Default snapshot dependency is outside this route test.'); };\n",
    )
    .replace(
      /import\s+\{\n\s+readRubyWhisperAccountProfileMetadata,\n\s+type RubyWhisperAccountProfileMetadataReadResult,\n\s+type SupabaseAccountProfileClient,\n\}\s+from\s+["']@\/lib\/account\/profile-metadata["'];\n/,
      "const readRubyWhisperAccountProfileMetadata = async () => { throw new Error('Default profile dependency is outside this route test.'); };\n",
    )
    .replace(
      /import\s+\{\n\s+readRubyWhisperSubscriptionCache,\n\s+type RubyWhisperSubscriptionCacheReadResult,\n\s+type SupabaseSubscriptionCacheClient,\n\}\s+from\s+["']@\/lib\/account\/subscription-cache["'];\n/,
      "const readRubyWhisperSubscriptionCache = async () => { throw new Error('Default subscription dependency is outside this route test.'); };\n",
    )
    .replace(
      /import\s+\{\s+rubyWhisperApiErrorResponse\s+\}\s+from\s+["']@\/lib\/api\/errors["'];\n/,
      "const rubyWhisperApiErrorResponse = createApiErrorResponse;\n",
    )
    .replace(
      /import\s+\{\n\s+requireClerkUserId,\n\s+type ClerkRequiredAuthState,\n\}\s+from\s+["']@\/lib\/auth\/clerk["'];\n/,
      "const requireClerkUserId = async () => ({ ok: false, error: { code: 'clerk_session_required', message: 'A Clerk user session is required.' } });\n",
    )
    .replace(
      /import\s+\{\n\s+readRubyWhisperUsageCounters,\n\s+type RubyWhisperUsageCountersReadResult,\n\s+type SupabaseUsageCountersClient,\n\}\s+from\s+["']@\/lib\/usage\/supabase-usage-counters["'];\n/,
      "const readRubyWhisperUsageCounters = async () => { throw new Error('Default usage dependency is outside this route test.'); };\n",
    )
    .replace(
      /import\s+type\s+\{\s+SupabaseServiceRoleRuntimeConfig\s+\}\s+from\s+["']@\/lib\/supabase\/server["'];\n\n/,
      "\n",
    );
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: desktopAccountRoutePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      createApiErrorResponse,
      exports: commonJsModule.exports,
      module: commonJsModule,
      Response,
    },
    {
      filename: desktopAccountRoutePath,
    },
  );

  return commonJsModule.exports;
}

async function loadAccountProfileMetadataHelper() {
  const source = await readFile(accountProfileMetadataPath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+createSupabaseServiceRoleClient,\n\s+type SupabaseServiceRoleClientFactory,\n\}\s+from\s+["']@\/lib\/supabase\/server["'];\n\n/,
      "const createSupabaseServiceRoleClient = (createClient) => createClient({ serviceRoleKey: 'test-service-role-key', url: 'https://example.supabase.co' });\n\n",
    );
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: accountProfileMetadataPath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
    },
    {
      filename: accountProfileMetadataPath,
    },
  );

  return commonJsModule.exports;
}

function createApiErrorResponse(code) {
  const descriptors = {
    internal_error: {
      desktopState: "error",
      httpStatus: 500,
      message: "Something went wrong. Try again.",
      recovery: "retry_or_contact_support",
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
  };
  const descriptor = descriptors[code];

  return Response.json(
    {
      error: {
        code,
        desktopState: descriptor.desktopState,
        message: descriptor.message,
        recovery: descriptor.recovery,
        retryable: descriptor.retryable,
      },
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

function createAccountProfileClient({ readError = null, row = null } = {}) {
  const calls = [];
  const client = {
    from(tableName) {
      calls.push({ tableName });

      return {
        select(columns) {
          calls.push({ columns, operation: "select" });

          return {
            eq(columnName, clerkUserId) {
              calls.push({ clerkUserId, columnName, operation: "eq" });

              return {
                maybeSingle() {
                  calls.push({ operation: "maybeSingle", phase: "read" });

                  return Promise.resolve({ data: row, error: readError });
                },
              };
            },
          };
        },
      };
    },
  };

  return { calls, client };
}

function accountProfile() {
  return {
    clerkUserId: "user_rw_synthetic_member_001",
    email: "member@example.com",
    isBlocked: false,
    termsAcceptedAt: "2026-05-04T05:00:00.000Z",
  };
}

function accountSubscription() {
  return {
    clerkUserId: "user_rw_synthetic_member_001",
    hasActiveSubscription: false,
    isFriendOfRubyActive: false,
    paymentFailed: false,
    plan: "trial",
    planState: "trial_active",
    requiresSubscription: false,
  };
}

function accountUsageCounters() {
  return {
    clerkUserId: "user_rw_synthetic_member_001",
    isTrialExhausted: false,
    isTrialLow: false,
    lifetimeWordsUsed: 1_000,
    monthlyPeriodStart: "2026-05-01",
    monthlyWordsUsed: 1_000,
    trialWordsLimit: 5_000,
    trialWordsRemaining: 4_000,
    trialWordsUsed: 1_000,
  };
}

function accountSnapshot() {
  return {
    accountStatus: "active",
    billingPortalAvailable: false,
    billingPortalUrl: null,
    canTranscribe: true,
    email: "member@example.com",
    isTrialExhausted: false,
    isTrialLow: false,
    lifetimeWordsUsed: 1_000,
    monthlyPeriodStart: "2026-05-01",
    monthlyWordsUsed: 1_000,
    planState: "trial_active",
    preflightPolicy: "allow_if_started_under_limit",
    termsAccepted: true,
    trialWordsLimit: 5_000,
    trialWordsRemaining: 4_000,
    trialWordsUsed: 1_000,
  };
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

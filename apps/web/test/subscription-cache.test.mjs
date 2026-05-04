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
const subscriptionCachePath = path.join(
  webRoot,
  "src",
  "lib",
  "account",
  "subscription-cache.ts",
);

const forbiddenPrivateSubscriptionFragments = [
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

test("subscription cache helper returns safe defaults for missing rows", async () => {
  const helper = await loadSubscriptionCacheHelper();
  const { calls, client } = createSubscriptionCacheClient({ row: null });

  const result = await helper.readRubyWhisperSubscriptionCache(
    {
      clerkUserId: " user_rw_synthetic_member_001 ",
      now: "2026-05-04T05:00:00.000Z",
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "defaulted",
    ok: true,
    subscription: {
      clerkUserId: "user_rw_synthetic_member_001",
      hasActiveSubscription: false,
      isFriendOfRubyActive: false,
      paymentFailed: false,
      plan: "trial",
      planState: "trial_active",
      requiresSubscription: false,
    },
  });
  assert.deepEqual(toPlainObject(calls), [
    { tableName: "subscriptions" },
    {
      columns:
        "clerk_user_id,status,plan,current_period_end,friend_of_ruby_until,updated_at",
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

test("subscription cache helper normalizes active paid metadata rows", async () => {
  const helper = await loadSubscriptionCacheHelper();
  const row = {
    clerk_user_id: "user_rw_synthetic_member_001",
    current_period_end: "2026-06-04T05:00:00.000Z",
    friend_of_ruby_until: null,
    plan: " Annual ",
    status: " ACTIVE ",
    updated_at: "2026-05-04T05:10:00.000Z",
  };
  const { client } = createSubscriptionCacheClient({ row });

  const result = await helper.readRubyWhisperSubscriptionCache(
    {
      clerkUserId: "user_rw_synthetic_member_001",
      now: "2026-05-04T05:00:00.000Z",
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "found",
    ok: true,
    subscription: {
      clerkUserId: "user_rw_synthetic_member_001",
      currentPeriodEnd: "2026-06-04T05:00:00.000Z",
      hasActiveSubscription: true,
      isFriendOfRubyActive: false,
      paymentFailed: false,
      plan: "annual",
      planState: "paid_active",
      requiresSubscription: false,
      subscriptionStatus: "active",
      updatedAt: "2026-05-04T05:10:00.000Z",
    },
  });
});

test("subscription cache helper preserves active Friend of Ruby entitlement dates", async () => {
  const helper = await loadSubscriptionCacheHelper();
  const row = {
    clerk_user_id: "user_rw_synthetic_friend_001",
    current_period_end: null,
    friend_of_ruby_until: "2027-05-04T05:00:00.000Z",
    plan: "friend-of-ruby",
    status: "canceled",
    updated_at: "2026-05-04T05:10:00.000Z",
  };
  const { client } = createSubscriptionCacheClient({ row });

  const result = await helper.readRubyWhisperSubscriptionCache(
    {
      clerkUserId: "user_rw_synthetic_friend_001",
      now: "2026-05-04T05:00:00.000Z",
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "found",
    ok: true,
    subscription: {
      clerkUserId: "user_rw_synthetic_friend_001",
      friendOfRubyUntil: "2027-05-04T05:00:00.000Z",
      hasActiveSubscription: false,
      isFriendOfRubyActive: true,
      paymentFailed: false,
      plan: "friend_of_ruby",
      planState: "friend_of_ruby_active",
      requiresSubscription: false,
      subscriptionStatus: "canceled",
      updatedAt: "2026-05-04T05:10:00.000Z",
    },
  });
});

test("subscription cache helper preserves expired Friend metadata without entitlement", async () => {
  const helper = await loadSubscriptionCacheHelper();
  const row = {
    clerk_user_id: "user_rw_synthetic_friend_expired_001",
    current_period_end: null,
    friend_of_ruby_until: "2026-04-04T05:00:00.000Z",
    plan: "friend_of_ruby",
    status: "canceled",
    updated_at: "2026-05-04T05:10:00.000Z",
  };
  const { client } = createSubscriptionCacheClient({ row });

  const result = await helper.readRubyWhisperSubscriptionCache(
    {
      clerkUserId: "user_rw_synthetic_friend_expired_001",
      now: "2026-05-04T05:00:00.000Z",
    },
    () => client,
  );

  assert.deepEqual(toPlainObject(result), {
    action: "found",
    ok: true,
    subscription: {
      clerkUserId: "user_rw_synthetic_friend_expired_001",
      friendOfRubyUntil: "2026-04-04T05:00:00.000Z",
      hasActiveSubscription: false,
      isFriendOfRubyActive: false,
      paymentFailed: false,
      plan: "friend_of_ruby",
      planState: "subscription_required",
      requiresSubscription: true,
      subscriptionStatus: "canceled",
      updatedAt: "2026-05-04T05:10:00.000Z",
    },
  });
  assert.doesNotMatch(JSON.stringify(result), forbiddenPrivateFixturePattern);
});

test("subscription cache helper maps billing attention statuses to payment_failed", async () => {
  const helper = await loadSubscriptionCacheHelper();

  for (const status of ["incomplete", "incomplete_expired", "past_due", "unpaid"]) {
    const { client } = createSubscriptionCacheClient({
      row: {
        clerk_user_id: "user_rw_synthetic_member_001",
        current_period_end: null,
        friend_of_ruby_until: null,
        plan: "monthly",
        status,
        updated_at: null,
      },
    });

    const result = await helper.readRubyWhisperSubscriptionCache(
      { clerkUserId: "user_rw_synthetic_member_001" },
      () => client,
    );

    assert.equal(result.ok, true);
    assert.equal(result.subscription.paymentFailed, true);
    assert.equal(result.subscription.planState, "payment_failed");
    assert.equal(result.subscription.requiresSubscription, false);
  }
});

test("subscription cache helper maps inactive statuses to subscription_required", async () => {
  const helper = await loadSubscriptionCacheHelper();

  for (const status of ["canceled", "paused"]) {
    const { client } = createSubscriptionCacheClient({
      row: {
        clerk_user_id: "user_rw_synthetic_member_001",
        current_period_end: null,
        friend_of_ruby_until: null,
        plan: "monthly",
        status,
        updated_at: null,
      },
    });

    const result = await helper.readRubyWhisperSubscriptionCache(
      { clerkUserId: "user_rw_synthetic_member_001" },
      () => client,
    );

    assert.equal(result.ok, true);
    assert.equal(result.subscription.paymentFailed, false);
    assert.equal(result.subscription.planState, "subscription_required");
    assert.equal(result.subscription.requiresSubscription, true);
  }
});

test("subscription cache helper returns sanitized failures and skips invalid clients", async () => {
  const helper = await loadSubscriptionCacheHelper();

  assert.deepEqual(
    toPlainObject(
      await helper.readRubyWhisperSubscriptionCache(
        { clerkUserId: " " },
        () => {
          throw new Error("Client factory must not be called for invalid input.");
        },
      ),
    ),
    {
      error: {
        code: "missing_clerk_user_id",
        message: "A Clerk user ID is required for subscription metadata.",
      },
      ok: false,
      status: "missing_user",
    },
  );

  const { client } = createSubscriptionCacheClient({
    readError: { message: "database detail must not echo" },
  });

  assert.deepEqual(
    toPlainObject(
      await helper.readRubyWhisperSubscriptionCache(
        { clerkUserId: "user_rw_synthetic_member_001" },
        () => client,
      ),
    ),
    {
      error: {
        code: "supabase_subscription_cache_read_failed",
        message: "Unable to read subscription metadata.",
      },
      ok: false,
      status: "read_failed",
    },
  );
});

test("subscription cache helper remains server-only and metadata-only", async () => {
  const source = await readFile(subscriptionCachePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /from\s+["']@\/lib\/supabase\/server["']/);
  assert.match(source, /\bcreateSupabaseServiceRoleClient\b/);
  assert.match(source, /\bsubscriptions\b/);
  assert.doesNotMatch(source, /\bNEXT_PUBLIC_/);
  assert.doesNotMatch(source, /@supabase\/supabase-js/);
  assert.doesNotMatch(source, /\bstripe_customer_id\b/);
  assert.doesNotMatch(source, /\bstripe_subscription_id\b/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);

  for (const fragment of forbiddenPrivateSubscriptionFragments) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${fragment}\\b`),
      `subscription cache helper must not reference private content field "${fragment}"`,
    );
  }
});

test("subscription cache fixture output stays metadata-only", async () => {
  const helper = await loadSubscriptionCacheHelper();
  const result = await helper.readRubyWhisperSubscriptionCache(
    { clerkUserId: "user_rw_synthetic_member_001" },
    () =>
      createSubscriptionCacheClient({
        row: {
          clerk_user_id: "user_rw_synthetic_member_001",
          current_period_end: "2026-06-04T05:00:00.000Z",
          friend_of_ruby_until: null,
          plan: "enterprise-price-name",
          status: "active",
          updated_at: null,
        },
      }).client,
  );

  assert.equal(result.ok, true);
  assert.equal(result.subscription.plan, "unknown");
  assert.doesNotMatch(JSON.stringify(result), forbiddenPrivateFixturePattern);
  assert.doesNotMatch(JSON.stringify(result), /cus_|sub_|price_/);
});

async function loadSubscriptionCacheHelper() {
  const source = await readFile(subscriptionCachePath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+createSupabaseServiceRoleClient,\n\s+type SupabaseServiceRoleClientFactory,\n\}\s+from\s+["']@\/lib\/supabase\/server["'];\n/,
      "const createSupabaseServiceRoleClient = (createClient) => createClient({ serviceRoleKey: 'test-service-role-key', url: 'https://example.supabase.co' });\n",
    )
    .replace(
      /import\s+type\s+\{\s+RubyWhisperUsagePlanState\s+\}\s+from\s+["']@\/lib\/usage\/quota["'];\n\n/,
      "\n",
    );
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: subscriptionCachePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
    },
    {
      filename: subscriptionCachePath,
    },
  );

  return commonJsModule.exports;
}

function createSubscriptionCacheClient({ readError = null, row = null } = {}) {
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

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

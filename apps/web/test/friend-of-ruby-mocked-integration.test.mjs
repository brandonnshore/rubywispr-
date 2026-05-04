import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as ts from "typescript";

import {
  assertNoLiveBackendIntegrationInput,
  assertNoPrivateProviderFixtureInput,
  createSyntheticBackendRequest,
  syntheticBackendFixtures,
} from "./support/backend-integration.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const srcRoot = path.join(webRoot, "src");
const webReadmePath = path.join(webRoot, "README.md");
const adminFriendOfRubyBatchRoutePath = path.join(
  srcRoot,
  "app",
  "api",
  "admin",
  "friend-of-ruby",
  "batches",
  "route.ts",
);
const friendOfRubyBatchModulePath = path.join(
  srcRoot,
  "lib",
  "friend-of-ruby",
  "batches.ts",
);
const friendOfRubyStripeModulePath = path.join(
  srcRoot,
  "lib",
  "friend-of-ruby",
  "stripe.ts",
);
const stripeSubscriptionCacheModulePath = path.join(
  srcRoot,
  "lib",
  "billing",
  "stripe-subscription-cache.ts",
);
const accountSubscriptionCacheModulePath = path.join(
  srcRoot,
  "lib",
  "account",
  "subscription-cache.ts",
);
const usageQuotaPath = path.join(srcRoot, "lib", "usage", "quota.ts");
const usageCountersPath = path.join(
  srcRoot,
  "lib",
  "usage",
  "supabase-usage-counters.ts",
);
const quotaServicePath = path.join(srcRoot, "lib", "usage", "quota-service.ts");

const frozenNow = "2026-05-04T12:00:00.000Z";
const friendUntil = "2027-05-04T12:00:00.000Z";
const expiredFriendUntil = "2026-04-04T12:00:00.000Z";
const validApiVersion = "2026-04-22.dahlia";
const syntheticPriceIds = {
  annual: "price_annual_synthetic",
  monthly: "price_monthly_synthetic",
};
const activeFriendUserId = "user_rw_synthetic_friend_001";
const expiredFriendUserId = "user_rw_synthetic_friend_expired_001";
const forbiddenFriendOfRubyOutputPattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|Bearer rw_synthetic_placeholder|rubywhisper\.env|\.env\.local|sk_(?:live|test)_|whsec_|payment_method|card|invoice|rawTranscript|cleanedText/i;

test("Friend of Ruby mocked workflow composes admin batch creation through entitlement state", async () => {
  const integration = await loadFriendOfRubyIntegration();
  const adminHandler =
    integration.adminRoute.createAdminFriendOfRubyBatchRouteHandler({
      createBatchClient: () =>
        createFriendOfRubyBatchClient(integration.store).client,
      createBatchMetadata:
        integration.batchHelper.createFriendOfRubyBatchMetadata,
      createStripeContext: () => ({
        context: {
          apiVersion: validApiVersion,
          client: integration.stripeClient,
          priceIds: syntheticPriceIds,
        },
        ok: true,
      }),
      createStripeCreationRequest:
        integration.stripeHelper.createFriendOfRubyStripeCreationRequest,
      createStripePromotionCode:
        integration.stripeHelper.createFriendOfRubyStripePromotionCode,
      now: frozenNow,
      requireAdmin: async () => ({
        action: "allowed",
        authorization: {
          action: "allowed",
          allowed: true,
          clerkUserId: syntheticBackendFixtures.clerk.adminUserId,
          ok: true,
          role: "admin",
          status: "active_admin",
        },
        ok: true,
      }),
    });

  const adminResponse = await adminHandler(
    createSyntheticBackendRequest({
      body: {
        codeLabel: " friends-2026 ",
        expiresAt: friendUntil,
        maxRedemptions: 7,
      },
      method: "POST",
      path: "/api/admin/friend-of-ruby/batches",
    }),
  );
  const adminBody = await adminResponse.json();

  assert.equal(adminResponse.status, 201);
  assert.equal(adminResponse.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(toPlainObject(adminBody), {
    ok: true,
    batch: {
      codeLabel: "FRIENDS-2026",
      expiresAt: friendUntil,
      id: "11111111-1111-4111-8111-111111111111",
      maxRedemptions: 7,
      stripePromotionCodeId: "promo_rw_synthetic_friend_001",
    },
  });
  assert.deepEqual(toPlainObject(integration.store.friendBatches), [
    {
      code: "FRIENDS-2026",
      created_at: frozenNow,
      created_by_clerk_user_id: syntheticBackendFixtures.clerk.adminUserId,
      expires_at: friendUntil,
      id: "11111111-1111-4111-8111-111111111111",
      max_redemptions: 7,
      stripe_promotion_code_id: "promo_rw_synthetic_friend_001",
    },
  ]);
  assert.deepEqual(
    toPlainObject(integration.stripeCalls.coupons).map((call) => ({
      metadata: call.params.metadata,
      options: call.options,
      percentOff: call.params.percent_off,
      redemptions: call.params.max_redemptions,
    })),
    [
      {
        metadata: {
          friend_of_ruby_batch_code: "FRIENDS-2026",
        },
        options: {
          idempotencyKey: "friend-of-ruby-coupon-FRIENDS-2026",
        },
        percentOff: 100,
        redemptions: 7,
      },
    ],
  );
  assert.deepEqual(
    toPlainObject(integration.stripeCalls.promotionCodes).map((call) => ({
      code: call.params.code,
      metadata: call.params.metadata,
      options: call.options,
      promotion: call.params.promotion,
      redemptions: call.params.max_redemptions,
    })),
    [
      {
        code: "FRIENDS-2026",
        metadata: {
          friend_of_ruby_batch_code: "FRIENDS-2026",
        },
        options: {
          idempotencyKey: "friend-of-ruby-promotion-code-FRIENDS-2026",
        },
        promotion: {
          coupon: "coupon_rw_synthetic_friend_001",
          type: "coupon",
        },
        redemptions: 7,
      },
    ],
  );
  assertFriendOfRubyFixtureIsSafe(integration.stripeCalls, "Stripe calls");
  assert.doesNotMatch(JSON.stringify(adminBody), forbiddenFriendOfRubyOutputPattern);

  const redeemedBatch =
    await integration.batchHelper.readFriendOfRubyBatchMetadataByStripePromotionCodeId(
      { stripePromotionCodeId: adminBody.batch.stripePromotionCodeId },
      () => createFriendOfRubyBatchClient(integration.store).client,
    );

  assert.equal(redeemedBatch.ok, true);
  assert.equal(redeemedBatch.batch.code, "FRIENDS-2026");
  assert.equal(redeemedBatch.batch.expiresAt, friendUntil);

  const activeCacheResult =
    await integration.stripeSubscriptionCache.upsertStripeSubscriptionCacheFromEvent(
      {
        event: stripeEvent(
          "customer.subscription.updated",
          stripeSubscription({
            clerkUserId: activeFriendUserId,
            friendOfRubyUntil: redeemedBatch.batch.expiresAt,
            status: "canceled",
          }),
        ),
        now: frozenNow,
        priceIds: syntheticPriceIds,
      },
      () => createSubscriptionCacheWriteClient(integration.store).client,
    );

  assert.deepEqual(toPlainObject(activeCacheResult), {
    action: "upserted",
    ok: true,
    row: {
      clerk_user_id: activeFriendUserId,
      current_period_end: "2026-06-04T12:00:00.000Z",
      friend_of_ruby_until: friendUntil,
      plan: "friend_of_ruby",
      status: "canceled",
      stripe_customer_id: "cus_rw_synthetic_friend_001",
      stripe_subscription_id: "sub_rw_synthetic_friend_001",
      updated_at: frozenNow,
    },
    status: "written",
  });

  const activeAccountSubscription =
    await integration.accountSubscriptionCache.readRubyWhisperSubscriptionCache(
      {
        clerkUserId: activeFriendUserId,
        now: frozenNow,
      },
      () => createSubscriptionCacheReadClient(integration.store).client,
    );

  assert.deepEqual(toPlainObject(activeAccountSubscription), {
    action: "found",
    ok: true,
    subscription: {
      clerkUserId: activeFriendUserId,
      currentPeriodEnd: "2026-06-04T12:00:00.000Z",
      friendOfRubyUntil: friendUntil,
      hasActiveSubscription: false,
      isFriendOfRubyActive: true,
      paymentFailed: false,
      plan: "friend_of_ruby",
      planState: "friend_of_ruby_active",
      requiresSubscription: false,
      subscriptionStatus: "canceled",
      updatedAt: frozenNow,
    },
  });

  const activeQuota =
    integration.quotaService.evaluateRubyWhisperQuotaEntitlement({
      friendOfRubyUntil:
        activeAccountSubscription.subscription.friendOfRubyUntil,
      now: frozenNow,
      planState: activeAccountSubscription.subscription.planState,
      requiresSubscription:
        activeAccountSubscription.subscription.requiresSubscription,
      subscriptionStatus:
        activeAccountSubscription.subscription.subscriptionStatus,
      usageCounters: usageCounters({
        clerkUserId: activeFriendUserId,
        trialWordsUsed: 5_000,
      }),
    });

  assert.deepEqual(toPlainObject(activeQuota), {
    canTranscribe: true,
    metadata: {
      isTrialLow: false,
      planState: "friend_of_ruby_active",
      trialWordsLimit: 5_000,
      trialWordsRemaining: 0,
      trialWordsUsed: 5_000,
    },
    ok: true,
    planState: "friend_of_ruby_active",
    preflightPolicy: "allow_if_started_under_limit",
    status: "allowed",
  });

  await writeSubscriptionCacheFromFriendMetadata({
    friendOfRubyUntil: expiredFriendUntil,
    integration,
    userId: expiredFriendUserId,
  });
  const expiredAccountSubscription =
    await integration.accountSubscriptionCache.readRubyWhisperSubscriptionCache(
      {
        clerkUserId: expiredFriendUserId,
        now: frozenNow,
      },
      () => createSubscriptionCacheReadClient(integration.store).client,
    );
  const expiredQuota =
    integration.quotaService.evaluateRubyWhisperQuotaEntitlement({
      friendOfRubyUntil:
        expiredAccountSubscription.subscription.friendOfRubyUntil,
      now: frozenNow,
      planState: expiredAccountSubscription.subscription.planState,
      requiresSubscription:
        expiredAccountSubscription.subscription.requiresSubscription,
      subscriptionStatus:
        expiredAccountSubscription.subscription.subscriptionStatus,
      usageCounters: usageCounters({
        clerkUserId: expiredFriendUserId,
        trialWordsUsed: 5_000,
      }),
    });

  assert.deepEqual(toPlainObject(expiredAccountSubscription), {
    action: "found",
    ok: true,
    subscription: {
      clerkUserId: expiredFriendUserId,
      currentPeriodEnd: "2026-06-04T12:00:00.000Z",
      friendOfRubyUntil: expiredFriendUntil,
      hasActiveSubscription: false,
      isFriendOfRubyActive: false,
      paymentFailed: false,
      plan: "unknown",
      planState: "subscription_required",
      requiresSubscription: true,
      subscriptionStatus: "canceled",
      updatedAt: frozenNow,
    },
  });
  assert.deepEqual(toPlainObject(expiredQuota), {
    canTranscribe: false,
    errorCode: "subscription_required",
    metadata: {
      isTrialLow: false,
      planState: "subscription_required",
      trialWordsLimit: 5_000,
      trialWordsRemaining: 0,
      trialWordsUsed: 5_000,
    },
    ok: false,
    planState: "subscription_required",
    preflightPolicy: "allow_if_started_under_limit",
    status: "subscription_required",
  });

  assertFriendOfRubyFixtureIsSafe(
    {
      activeAccountSubscription,
      activeCacheResult,
      activeQuota,
      expiredAccountSubscription,
      expiredQuota,
    },
    "Friend of Ruby integration output",
  );
  assert.doesNotMatch(
    JSON.stringify({
      activeAccountSubscription,
      activeCacheResult,
      activeQuota,
      expiredAccountSubscription,
      expiredQuota,
    }),
    forbiddenFriendOfRubyOutputPattern,
  );
});

test("Friend of Ruby integration fixture guardrails reject private fields and live-looking credentials", () => {
  for (const fixture of [
    { rawTranscript: "synthetic private payload" },
    { audio: "synthetic private payload" },
    { cleanedText: "synthetic private payload" },
    { payment_method: "pm_rw_synthetic_private" },
    { card: { brand: "synthetic" } },
    { metadata: { authorization: "Bearer rw_synthetic_placeholder" } },
    { stripeSecret: `sk_test_${"A".repeat(24)}` },
    { webhookSecret: `whsec_${"B".repeat(24)}` },
    { envSource: ".env.local" },
  ]) {
    assert.throws(
      () => assertFriendOfRubyFixtureIsSafe(fixture, "Friend of Ruby fixture"),
      /not Friend of Ruby fixture safe|not synthetic/,
    );
  }

  assert.throws(
    () =>
      assertNoPrivateProviderFixtureInput(
        { providerRequestBody: { prompt: "synthetic private payload" } },
        "provider fixture",
      ),
    /not provider-fixture safe/,
  );
});

test("Friend of Ruby mocked validation docs distinguish offline coverage from live smoke", async () => {
  const readme = await readFile(webReadmePath, "utf8");

  assert.match(readme, /Friend of Ruby mocked validation/i);
  assert.match(readme, /friend-of-ruby-mocked-integration\.test\.mjs/);
  assert.match(readme, /offline-only/i);
  assert.match(readme, /RUB-197/);
  assert.match(readme, /RUB-105/);
  assert.match(readme, /RW-029A-E/);
});

async function writeSubscriptionCacheFromFriendMetadata({
  friendOfRubyUntil,
  integration,
  userId,
}) {
  const result =
    await integration.stripeSubscriptionCache.upsertStripeSubscriptionCacheFromEvent(
      {
        event: stripeEvent(
          "customer.subscription.updated",
          stripeSubscription({
            clerkUserId: userId,
            friendOfRubyUntil,
            status: "active",
          }),
        ),
        now: frozenNow,
        priceIds: syntheticPriceIds,
      },
      () => createSubscriptionCacheWriteClient(integration.store).client,
    );

  assert.equal(result.ok, true);

  return result;
}

async function loadFriendOfRubyIntegration() {
  const [
    batchHelper,
    stripeHelper,
    adminRoute,
    stripeSubscriptionCache,
    accountSubscriptionCache,
    quotaService,
  ] = await Promise.all([
    loadFriendOfRubyBatchHelper(),
    loadFriendOfRubyStripeHelper(),
    loadAdminFriendOfRubyBatchRouteModule(),
    loadStripeSubscriptionCacheHelper(),
    loadAccountSubscriptionCacheHelper(),
    loadQuotaServiceModule(),
  ]);
  const stripeCalls = {
    coupons: [],
    promotionCodes: [],
  };

  return {
    accountSubscriptionCache,
    adminRoute,
    batchHelper,
    quotaService,
    store: {
      friendBatches: [],
      subscriptionRows: new Map(),
    },
    stripeCalls,
    stripeClient: createMockFriendOfRubyStripeClient(stripeCalls),
    stripeHelper,
    stripeSubscriptionCache,
  };
}

async function loadAdminFriendOfRubyBatchRouteModule() {
  const batchHelper = await loadFriendOfRubyBatchHelper();
  const stripeHelper = await loadFriendOfRubyStripeHelper();

  return loadCommonJsModule(
    adminFriendOfRubyBatchRoutePath,
    createAdminFriendOfRubyRouteRequire({ batchHelper, stripeHelper }),
  );
}

async function loadFriendOfRubyBatchHelper() {
  const source = await readFile(friendOfRubyBatchModulePath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+createSupabaseServiceRoleClient,\n\s+type SupabaseServiceRoleClientFactory,\n\}\s+from\s+["']@\/lib\/supabase\/server["'];\n\n/,
      "const createSupabaseServiceRoleClient = (createClient) => createClient({ serviceRoleKey: 'test-service-role-key', url: 'https://example.supabase.co' });\n\n",
    );

  return loadCommonJsModuleFromSource(testableSource, friendOfRubyBatchModulePath);
}

async function loadFriendOfRubyStripeHelper() {
  const source = await readFile(friendOfRubyStripeModulePath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(/import\s+type\s+Stripe\s+from\s+["']stripe["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+stripeBillingApiVersion,\n\s+type StripeBillingContext,\n\}\s+from\s+["']@\/lib\/billing\/stripe["'];\n/,
      `const stripeBillingApiVersion = "${validApiVersion}";\n`,
    )
    .replace(
      /import\s+type\s+\{\s+FriendOfRubyBatchMetadata\s+\}\s+from\s+["']@\/lib\/friend-of-ruby\/batches["'];\n\n/,
      "\n",
    );

  return loadCommonJsModuleFromSource(testableSource, friendOfRubyStripeModulePath);
}

async function loadStripeSubscriptionCacheHelper() {
  const source = await readFile(stripeSubscriptionCacheModulePath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(/import\s+type\s+Stripe\s+from\s+["']stripe["'];\n\n/, "")
    .replace(
      /import\s+type\s+\{\s+SupabaseServiceRoleClientFactory\s+\}\s+from\s+["']@\/lib\/supabase\/server["'];\n/,
      "",
    )
    .replace(
      /import\s+\{\s+createSupabaseServiceRoleClient\s+\}\s+from\s+["']@\/lib\/supabase\/server["'];\n/,
      "const createSupabaseServiceRoleClient = (createClient) => createClient({ serviceRoleKey: 'test-service-role-key', url: 'https://example.supabase.co' });\n",
    )
    .replace(
      /import\s+type\s+\{\s+StripeBillingPriceIds,\s+StripeBillingPlan\s+\}\s+from\s+["']\.\/stripe["'];\n\n/,
      "\n",
    );

  return loadCommonJsModuleFromSource(
    testableSource,
    stripeSubscriptionCacheModulePath,
  );
}

async function loadAccountSubscriptionCacheHelper() {
  const source = await readFile(accountSubscriptionCacheModulePath, "utf8");
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

  return loadCommonJsModuleFromSource(
    testableSource,
    accountSubscriptionCacheModulePath,
  );
}

async function loadQuotaServiceModule() {
  const quotaPrimitives = await loadUsageQuotaModule();
  const usageCountersHelper = await loadUsageCountersHelper(quotaPrimitives);
  const source = await readFile(quotaServicePath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+createRubyWhisperUsageQuotaState,\n\s+normalizeRubyWhisperUsageWordCount,\n\s+type RubyWhisperUsagePlanState,\n\}\s+from\s+["']\.\/quota["'];\n/,
      "const { createRubyWhisperUsageQuotaState, normalizeRubyWhisperUsageWordCount } = quotaPrimitives;\n",
    )
    .replace(
      /import\s+\{\n\s+prepareRubyWhisperUsageCounterIncrement,\n\s+type RubyWhisperUsageCounters,\n\s+type SupabaseUsageCounterUpsert,\n\}\s+from\s+["']\.\/supabase-usage-counters["'];\n\n/,
      "const { prepareRubyWhisperUsageCounterIncrement } = usageCountersHelper;\n\n",
    );

  return loadCommonJsModuleFromSource(testableSource, quotaServicePath, {
    quotaPrimitives,
    usageCountersHelper,
  });
}

async function loadUsageCountersHelper(quotaPrimitives) {
  const source = await readFile(usageCountersPath, "utf8");
  const testableSource = source
    .replace(/import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+createSupabaseServiceRoleClient,\n\s+type SupabaseServiceRoleClientFactory,\n\}\s+from\s+["']@\/lib\/supabase\/server["'];\n\n/,
      "const createSupabaseServiceRoleClient = (createClient) => createClient({ serviceRoleKey: 'test-service-role-key', url: 'https://example.supabase.co' });\n\n",
    )
    .replace(
      /import\s+\{\n\s+createRubyWhisperTrialQuotaState,\n\s+normalizeRubyWhisperUsageWordCount,\n\s+rubyWhisperDefaultTrialWordsLimit,\n\s+type RubyWhisperTrialQuotaState,\n\}\s+from\s+["']\.\/quota["'];\n\n/,
      "const { createRubyWhisperTrialQuotaState, normalizeRubyWhisperUsageWordCount, rubyWhisperDefaultTrialWordsLimit } = quotaPrimitives;\n\n",
    );

  return loadCommonJsModuleFromSource(testableSource, usageCountersPath, {
    quotaPrimitives,
  });
}

async function loadUsageQuotaModule() {
  const source = await readFile(usageQuotaPath, "utf8");
  const executableSource = source.replace(/^import\s+["']server-only["'];\n?/, "");
  const { outputText } = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: usageQuotaPath,
  });
  const encodedSource = Buffer.from(outputText).toString("base64");

  return import(`data:text/javascript;base64,${encodedSource}`);
}

async function loadCommonJsModule(filePath, requireModule, globals = {}) {
  const source = await readFile(filePath, "utf8");

  return loadCommonJsModuleFromSource(source, filePath, globals, requireModule);
}

function loadCommonJsModuleFromSource(
  source,
  filePath,
  globals = {},
  requireModule = undefined,
) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      Headers,
      Request,
      Response,
      URL,
      exports: commonJsModule.exports,
      module: commonJsModule,
      require:
        requireModule ??
        ((specifier) => {
          throw new Error(`Unexpected dependency ${specifier}`);
        }),
      ...globals,
    },
    {
      filename: filePath,
    },
  );

  return commonJsModule.exports;
}

function createAdminFriendOfRubyRouteRequire({ batchHelper, stripeHelper }) {
  return function requireAdminFriendOfRubyRouteModule(specifier) {
    switch (specifier) {
      case "server-only":
        return {};
      case "@supabase/supabase-js":
        return { createClient: () => ({}) };
      case "@/lib/admin/api":
        return {
          requireRubyWhisperAdminForApi: async () => {
            throw new Error("Synthetic integration must inject admin auth.");
          },
        };
      case "@/lib/billing/stripe":
        return {
          createStripeBillingContext: () => {
            throw new Error("Synthetic integration must inject Stripe context.");
          },
        };
      case "@/lib/friend-of-ruby/batches":
        return batchHelper;
      case "@/lib/friend-of-ruby/stripe":
        return stripeHelper;
      default:
        throw new Error(`Unexpected admin Friend of Ruby dependency ${specifier}`);
    }
  };
}

function createMockFriendOfRubyStripeClient(calls) {
  return {
    coupons: {
      create: async (params, options) => {
        assertFriendOfRubyFixtureIsSafe(
          { options, params },
          "Stripe coupon creation fixture",
        );
        calls.coupons.push({ options, params });

        return { id: "coupon_rw_synthetic_friend_001" };
      },
    },
    promotionCodes: {
      create: async (params, options) => {
        assertFriendOfRubyFixtureIsSafe(
          { options, params },
          "Stripe promotion code creation fixture",
        );
        calls.promotionCodes.push({ options, params });

        return { id: "promo_rw_synthetic_friend_001" };
      },
    },
  };
}

function createFriendOfRubyBatchClient(store) {
  const client = {
    from(tableName) {
      assert.equal(tableName, "friend_of_ruby_batches");

      return {
        insert(batch) {
          assertFriendOfRubyFixtureIsSafe(batch, "Friend of Ruby batch insert");
          const row = {
            ...batch,
            created_at: frozenNow,
            id: "11111111-1111-4111-8111-111111111111",
          };

          store.friendBatches.push(row);

          return {
            select(columns) {
              assert.equal(
                columns,
                "id,created_by_clerk_user_id,stripe_promotion_code_id,code,max_redemptions,expires_at,created_at",
              );

              return {
                maybeSingle: async () => ({ data: row, error: null }),
              };
            },
          };
        },
        select(columns) {
          assert.equal(
            columns,
            "id,created_by_clerk_user_id,stripe_promotion_code_id,code,max_redemptions,expires_at,created_at",
          );

          return {
            eq(columnName, value) {
              assert.ok(
                columnName === "code" ||
                  columnName === "stripe_promotion_code_id",
              );
              assertFriendOfRubyFixtureIsSafe(
                { columnName, value },
                "Friend of Ruby batch lookup",
              );

              return {
                maybeSingle: async () => ({
                  data:
                    store.friendBatches.find(
                      (row) => row[columnName] === value,
                    ) ?? null,
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };

  return { client };
}

function createSubscriptionCacheWriteClient(store) {
  const client = {
    from(tableName) {
      assert.equal(tableName, "subscriptions");

      return {
        upsert(row, options) {
          assert.deepEqual(toPlainObject(options), { onConflict: "clerk_user_id" });
          assertFriendOfRubyFixtureIsSafe(row, "subscription cache write row");
          store.subscriptionRows.set(row.clerk_user_id, row);

          return {
            select(columns) {
              assert.equal(
                columns,
                "clerk_user_id,stripe_customer_id,stripe_subscription_id,status,plan,current_period_end,friend_of_ruby_until,updated_at",
              );

              return {
                maybeSingle: async () => ({ data: row, error: null }),
              };
            },
          };
        },
      };
    },
  };

  return { client };
}

function createSubscriptionCacheReadClient(store) {
  const client = {
    from(tableName) {
      assert.equal(tableName, "subscriptions");

      return {
        select(columns) {
          assert.equal(
            columns,
            "clerk_user_id,status,plan,current_period_end,friend_of_ruby_until,updated_at",
          );

          return {
            eq(columnName, clerkUserId) {
              assert.equal(columnName, "clerk_user_id");
              assertFriendOfRubyFixtureIsSafe(
                { clerkUserId },
                "subscription cache read key",
              );

              return {
                maybeSingle: async () => ({
                  data: store.subscriptionRows.get(clerkUserId) ?? null,
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };

  return { client };
}

function stripeEvent(type, object) {
  return {
    data: { object },
    type,
  };
}

function stripeSubscription({
  clerkUserId,
  friendOfRubyUntil,
  status,
}) {
  const suffix =
    clerkUserId === expiredFriendUserId
      ? "friend_expired_001"
      : "friend_001";

  return {
    current_period_end: 1780574400,
    customer: `cus_rw_synthetic_${suffix}`,
    id: `sub_rw_synthetic_${suffix}`,
    items: {
      data: [
        {
          price: {
            id: "price_friend_unknown_synthetic",
          },
        },
      ],
    },
    metadata: {
      clerkUserId,
      friendOfRubyBatchCode: "FRIENDS-2026",
      rubyWhisperFriendOfRubyUntil: friendOfRubyUntil,
      rubyWhisperPlan: "friend_of_ruby",
    },
    object: "subscription",
    status,
  };
}

function usageCounters({ clerkUserId, trialWordsUsed }) {
  const trialWordsLimit = 5_000;
  const normalizedTrialWordsUsed = Math.min(
    Math.max(0, Math.floor(trialWordsUsed)),
    trialWordsLimit,
  );
  const trialWordsRemaining = Math.max(
    0,
    trialWordsLimit - normalizedTrialWordsUsed,
  );

  return {
    clerkUserId,
    isTrialExhausted: trialWordsRemaining === 0,
    isTrialLow: trialWordsRemaining > 0 && trialWordsRemaining <= 500,
    lifetimeWordsUsed: 12_000,
    monthlyPeriodStart: "2026-05-01",
    monthlyWordsUsed: 1_200,
    trialWordsLimit,
    trialWordsRemaining,
    trialWordsUsed: normalizedTrialWordsUsed,
  };
}

function assertFriendOfRubyFixtureIsSafe(value, label) {
  assertNoLiveBackendIntegrationInput(value, label);
  const violations = [];
  const visited = new WeakSet();

  visit(value, label);

  if (violations.length > 0) {
    throw new Error(
      `Backend integration ${label} is not Friend of Ruby fixture safe: ${violations.join(", ")}`,
    );
  }

  function visit(currentValue, currentPath) {
    if (currentValue === null || currentValue === undefined) {
      return;
    }

    if (
      typeof currentValue === "string" ||
      typeof currentValue === "number" ||
      typeof currentValue === "boolean" ||
      typeof currentValue === "function"
    ) {
      return;
    }

    if (currentValue instanceof Headers || currentValue instanceof URL) {
      return;
    }

    if (typeof currentValue !== "object") {
      return;
    }

    if (visited.has(currentValue)) {
      return;
    }

    visited.add(currentValue);

    for (const [key, childValue] of Object.entries(currentValue)) {
      const normalizedKey = normalizeFixtureKey(key);

      if (
        privateFriendOfRubyFixtureKeyPatterns.some((pattern) =>
          pattern.test(normalizedKey),
        )
      ) {
        violations.push(`${currentPath}.${key} uses private fixture field ${key}`);
      }

      visit(childValue, `${currentPath}.${key}`);
    }
  }
}

const privateFriendOfRubyFixtureKeyPatterns = [
  /^(?:raw_)?audio$/,
  /^audio_(?:blob|body|buffer|bytes|content|data|file|input|payload)$/,
  /^(?:raw_)?transcript(?:_text)?$/,
  /^cleaned_text$/,
  /^(?:app_)?context$/,
  /^dictionary(?:_terms?)?$/,
  /^(?:message|messages|prompt|text)$/,
  /^(?:clipboard|local_history)$/,
  /^(?:authorization|cookie|headers?)$/,
  /^(?:jwt|secret|session|token)$/,
  /^provider_(?:request|response)(?:_body|_data|_payload)?$/,
  /^(?:request|response)_(?:body|data|payload)$/,
  /^(?:payment_method|card|invoice)$/,
];

function normalizeFixtureKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

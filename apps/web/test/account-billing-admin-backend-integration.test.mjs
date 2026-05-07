import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as ts from "typescript";

import {
  createSyntheticBackendRequest,
  syntheticBackendFixtures,
} from "./support/backend-integration.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const srcRoot = path.join(webRoot, "src");
const desktopAccountRoutePath = path.join(
  srcRoot,
  "app",
  "api",
  "desktop",
  "account",
  "route.ts",
);
const accountSnapshotPath = path.join(
  srcRoot,
  "lib",
  "account",
  "desktop-account-snapshot.ts",
);
const accountSubscriptionCachePath = path.join(
  srcRoot,
  "lib",
  "account",
  "subscription-cache.ts",
);
const stripeSubscriptionCachePath = path.join(
  srcRoot,
  "lib",
  "billing",
  "stripe-subscription-cache.ts",
);
const friendOfRubyBatchPath = path.join(
  srcRoot,
  "lib",
  "friend-of-ruby",
  "batches.ts",
);
const adminApiGuardPath = path.join(srcRoot, "lib", "admin", "api.ts");
const usageQuotaPath = path.join(srcRoot, "lib", "usage", "quota.ts");
const quotaServicePath = path.join(srcRoot, "lib", "usage", "quota-service.ts");

const frozenNow = "2026-05-04T12:00:00.000Z";
const friendUntil = "2027-05-04T12:00:00.000Z";
const created = 1777896000;
const syntheticPriceIds = {
  annual: "price_annual_synthetic",
  monthly: "price_monthly_synthetic",
};
const privateOutputPattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|rawTranscript|cleanedText|providerRequestBody|providerResponseBody|payment_method|card|rubywhisper\.env|\.env\.local|sk_(?:live|test)_|whsec_|cus_|sub_|price_/i;
const privateContentPattern =
  /private transcript|private audio|private cleaned text|private context|private clipboard|rawTranscript|cleanedText|providerRequestBody|providerResponseBody|payment_method|card|rubywhisper\.env|\.env\.local|sk_(?:live|test)_|whsec_/i;

test("desktop account API composes synthetic billing states into metadata-only responses", async () => {
  const [routeModule, snapshotModule] = await Promise.all([
    loadDesktopAccountRouteModule(),
    loadDesktopAccountSnapshotModule(),
  ]);
  const scenarios = [
    {
      expected: {
        accountStatus: "active",
        canTranscribe: true,
        failureCode: undefined,
        planState: "paid_active",
      },
      name: "paid active",
      subscription: subscriptionMetadata({
        hasActiveSubscription: true,
        plan: "monthly",
        planState: "paid_active",
        subscriptionStatus: "active",
      }),
      usage: usageCounters({ trialWordsUsed: 5_000 }),
    },
    {
      expected: {
        accountStatus: "payment_failed",
        canTranscribe: false,
        failureCode: "payment_failed",
        planState: "payment_failed",
      },
      name: "payment failed",
      subscription: subscriptionMetadata({
        paymentFailed: true,
        plan: "annual",
        planState: "payment_failed",
        subscriptionStatus: "past_due",
      }),
      usage: usageCounters({ trialWordsUsed: 1_200 }),
    },
    {
      expected: {
        accountStatus: "subscription_required",
        canTranscribe: false,
        failureCode: "subscription_required",
        planState: "subscription_required",
      },
      name: "subscription required",
      subscription: subscriptionMetadata({
        plan: "monthly",
        planState: "subscription_required",
        requiresSubscription: true,
        subscriptionStatus: "canceled",
      }),
      usage: usageCounters({ trialWordsUsed: 5_000 }),
    },
    {
      expected: {
        accountStatus: "active",
        canTranscribe: true,
        failureCode: undefined,
        planState: "friend_of_ruby_active",
      },
      name: "Friend of Ruby active",
      subscription: subscriptionMetadata({
        friendOfRubyUntil: friendUntil,
        isFriendOfRubyActive: true,
        plan: "friend_of_ruby",
        planState: "friend_of_ruby_active",
        subscriptionStatus: "canceled",
      }),
      usage: usageCounters({ trialWordsUsed: 5_000 }),
    },
  ];

  for (const scenario of scenarios) {
    const calls = [];
    const handler = routeModule.createDesktopAccountRouteHandler({
      createSnapshot: (input) =>
        snapshotModule.createRubyWhisperDesktopAccountSnapshot({
          ...input,
          now: frozenNow,
        }),
      readProfile: async (clerkUserId) => {
        calls.push({ clerkUserId, operation: "readProfile" });

        return {
          action: "found",
          ok: true,
          profile: profileMetadata({ clerkUserId }),
        };
      },
      readSubscription: async (clerkUserId) => {
        calls.push({ clerkUserId, operation: "readSubscription" });

        return {
          action: "found",
          ok: true,
          subscription: {
            ...scenario.subscription,
            clerkUserId,
          },
        };
      },
      readUsageCounters: async (clerkUserId) => {
        calls.push({ clerkUserId, operation: "readUsageCounters" });

        return {
          action: "found",
          counters: {
            ...scenario.usage,
            clerkUserId,
          },
          ok: true,
        };
      },
      requireAuth: async () => ({
        ok: true,
        userId: syntheticBackendFixtures.clerk.memberUserId,
      }),
    });

    const response = await handler();
    const body = await response.json();

    assert.equal(response.status, 200, scenario.name);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(body.ok, true);
    assert.equal(body.email, syntheticBackendFixtures.clerk.memberEmail);
    assert.equal(body.billingPortalAvailable, false);
    assert.equal(body.billingPortalUrl, null);
    assert.equal(body.accountStatus, scenario.expected.accountStatus);
    assert.equal(body.canTranscribe, scenario.expected.canTranscribe);
    assert.equal(body.planState, scenario.expected.planState);
    assert.equal(body.failureCode, scenario.expected.failureCode);
    assert.deepEqual(calls.map((call) => call.operation), [
      "readProfile",
      "readSubscription",
      "readUsageCounters",
    ]);
    assert.doesNotMatch(JSON.stringify(body), privateOutputPattern);
    assert.deepEqual(
      Object.keys(body)
        .filter((key) => /stripe|customer|subscriptionStatus|friendOfRubyUntil/i.test(key))
        .sort(),
      [],
    );
  }
});

test("mocked Stripe subscription events update cache state without live calls", async () => {
  const [stripeCache, accountCache] = await Promise.all([
    loadStripeSubscriptionCacheModule(),
    loadAccountSubscriptionCacheModule(),
  ]);
  const store = createSubscriptionStore();

  const paidUpdate = await stripeCache.upsertStripeSubscriptionCacheFromEvent(
    {
      event: stripeEvent(
        "customer.subscription.updated",
        stripeSubscription({
          plan: "annual",
          status: "past_due",
          subscriptionId: "sub_rw_synthetic_attention_001",
        }),
      ),
      now: frozenNow,
      priceIds: syntheticPriceIds,
    },
    () => store.client,
  );
  const failedSubscription = await accountCache.readRubyWhisperSubscriptionCache(
    {
      clerkUserId: syntheticBackendFixtures.clerk.memberUserId,
      now: frozenNow,
    },
    () => store.client,
  );

  assert.equal(paidUpdate.ok, true);
  assert.equal(paidUpdate.row.plan, "annual");
  assert.equal(paidUpdate.row.status, "past_due");
  assert.equal(failedSubscription.ok, true);
  assert.equal(failedSubscription.subscription.planState, "payment_failed");
  assert.equal(failedSubscription.subscription.paymentFailed, true);

  const deletedUpdate = await stripeCache.upsertStripeSubscriptionCacheFromEvent(
    {
      event: stripeEvent(
        "customer.subscription.deleted",
        stripeSubscription({
          plan: "monthly",
          status: "active",
          subscriptionId: "sub_rw_synthetic_deleted_001",
        }),
      ),
      now: frozenNow,
      priceIds: syntheticPriceIds,
    },
    () => store.client,
  );
  const canceledSubscription = await accountCache.readRubyWhisperSubscriptionCache(
    {
      clerkUserId: syntheticBackendFixtures.clerk.memberUserId,
      now: frozenNow,
    },
    () => store.client,
  );

  assert.equal(deletedUpdate.ok, true);
  assert.equal(deletedUpdate.row.status, "canceled");
  assert.equal(canceledSubscription.ok, true);
  assert.equal(canceledSubscription.subscription.planState, "subscription_required");
  assert.equal(canceledSubscription.subscription.requiresSubscription, true);
  assert.deepEqual(
    store.calls.map((call) => call.operation),
    [
      "subscriptions.upsert",
      "subscriptions.select",
      "subscriptions.upsert",
      "subscriptions.select",
    ],
  );
  assert.doesNotMatch(JSON.stringify({ canceledSubscription, failedSubscription }), privateOutputPattern);
});

test("Friend of Ruby batch evidence flows into subscription cache and account metadata", async () => {
  const [batchModule, stripeCache, accountCache, snapshotModule] =
    await Promise.all([
      loadFriendOfRubyBatchModule(),
      loadStripeSubscriptionCacheModule(),
      loadAccountSubscriptionCacheModule(),
      loadDesktopAccountSnapshotModule(),
    ]);
  const batchStore = createFriendOfRubyBatchStore();
  const subscriptionStore = createSubscriptionStore();

  const createdBatch = await batchModule.createFriendOfRubyBatchMetadata(
    {
      code: " friends-2026 ",
      createdByClerkUserId: syntheticBackendFixtures.clerk.adminUserId,
      expiresAt: friendUntil,
      maxRedemptions: 10,
      stripePromotionCodeId: "promo_rw_synthetic_friend_001",
    },
    () => batchStore.client,
  );
  const redeemedBatch =
    await batchModule.readFriendOfRubyBatchMetadataByStripePromotionCodeId(
      {
        stripePromotionCodeId: createdBatch.batch.stripePromotionCodeId,
      },
      () => batchStore.client,
    );

  assert.equal(createdBatch.ok, true);
  assert.equal(redeemedBatch.ok, true);
  assert.deepEqual(toPlainObject(redeemedBatch.batch), {
    code: "FRIENDS-2026",
    createdAt: frozenNow,
    createdByClerkUserId: syntheticBackendFixtures.clerk.adminUserId,
    expiresAt: friendUntil,
    id: "11111111-1111-4111-8111-111111111111",
    maxRedemptions: 10,
    stripePromotionCodeId: "promo_rw_synthetic_friend_001",
  });

  const cacheWrite = await stripeCache.upsertStripeSubscriptionCacheFromEvent(
    {
      event: stripeEvent(
        "customer.subscription.updated",
        stripeSubscription({
          clerkUserId: "user_rw_synthetic_friend_001",
          customerId: "cus_rw_synthetic_friend_001",
          friendOfRubyUntil: redeemedBatch.batch.expiresAt,
          plan: "friend_of_ruby",
          status: "canceled",
          subscriptionId: "sub_rw_synthetic_friend_001",
        }),
      ),
      now: frozenNow,
      priceIds: syntheticPriceIds,
    },
    () => subscriptionStore.client,
  );
  const accountSubscription = await accountCache.readRubyWhisperSubscriptionCache(
    {
      clerkUserId: "user_rw_synthetic_friend_001",
      now: frozenNow,
    },
    () => subscriptionStore.client,
  );
  const snapshot = snapshotModule.createRubyWhisperDesktopAccountSnapshot({
    now: frozenNow,
    profile: profileMetadata({
      clerkUserId: "user_rw_synthetic_friend_001",
      email: "friend@example.com",
    }),
    subscription: accountSubscription.subscription,
    usageCounters: usageCounters({
      clerkUserId: "user_rw_synthetic_friend_001",
      trialWordsUsed: 5_000,
    }),
  });

  assert.equal(cacheWrite.ok, true);
  assert.equal(cacheWrite.row.friend_of_ruby_until, friendUntil);
  assert.equal(accountSubscription.ok, true);
  assert.equal(accountSubscription.subscription.isFriendOfRubyActive, true);
  assert.equal(accountSubscription.subscription.planState, "friend_of_ruby_active");
  assert.equal(accountSubscription.subscription.requiresSubscription, false);
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.snapshot.accountStatus, "active");
  assert.equal(snapshot.snapshot.canTranscribe, true);
  assert.equal(snapshot.snapshot.planState, "friend_of_ruby_active");
  assert.doesNotMatch(JSON.stringify(cacheWrite), privateContentPattern);
  assert.doesNotMatch(
    JSON.stringify({ accountSubscription, snapshot }),
    privateOutputPattern,
  );
});

test("admin API guard allows admins and denies members without protected payloads", async () => {
  const adminGuard = await loadAdminApiGuardModule();
  const request = createSyntheticBackendRequest({
    method: "GET",
    path: "/api/admin/status",
  });
  const allowed = await adminGuard.requireRubyWhisperAdminForApi({
    dependencies: {
      lookupAdminRole: async (input) => ({
        action: "allowed",
        allowed: true,
        clerkUserId: input.clerkUserId,
        ok: true,
        role: "admin",
        status: "active_admin",
      }),
      requireUserId: async () => ({
        ok: true,
        userId: syntheticBackendFixtures.clerk.adminUserId,
      }),
    },
    request,
    route: "/api/admin/status",
  });
  const denied = await adminGuard.requireRubyWhisperAdminForApi({
    dependencies: {
      lookupAdminRole: async (input) => ({
        action: "denied",
        allowed: false,
        clerkUserId: input.clerkUserId,
        error: {
          code: "supabase_admin_role_missing",
          message: "No active admin role metadata was found.",
        },
        ok: false,
        status: "missing_role",
      }),
      requireUserId: async () => ({
        ok: true,
        userId: syntheticBackendFixtures.clerk.memberUserId,
      }),
    },
    request,
    route: "/api/admin/status",
  });
  const deniedBody = await denied.response.json();

  assert.equal(allowed.ok, true);
  assert.equal(allowed.authorization.clerkUserId, syntheticBackendFixtures.clerk.adminUserId);
  assert.equal(allowed.authorization.role, "admin");
  assert.equal(denied.ok, false);
  assert.equal(denied.status, "forbidden");
  assert.equal(denied.response.status, 403);
  assert.deepEqual(deniedBody, {
    error: {
      code: "admin_forbidden",
      desktopState: "blocked",
      message: "This account is not a RubyWhisper admin.",
      recovery: "open_account",
      retryable: false,
    },
    ok: false,
  });
  assert.doesNotMatch(JSON.stringify({ allowed, deniedBody }), privateOutputPattern);
  assert.doesNotMatch(JSON.stringify({ allowed, deniedBody }), /audio|transcript|content/i);
});

async function loadDesktopAccountRouteModule() {
  return loadTypeScriptCommonJsModule(desktopAccountRoutePath, (specifier) => {
    switch (specifier) {
      case "@supabase/supabase-js":
        return {
          createClient() {
            throw new Error("Live Supabase clients are outside mocked tests.");
          },
        };
      case "@/lib/account/desktop-account-snapshot":
        return {
          createRubyWhisperDesktopAccountSnapshot() {
            throw new Error("The test injects the account snapshot dependency.");
          },
        };
      case "@/lib/account/profile-metadata":
        return {
          readRubyWhisperAccountProfileMetadata() {
            throw new Error("The test injects profile metadata.");
          },
        };
      case "@/lib/account/subscription-cache":
        return {
          readRubyWhisperSubscriptionCache() {
            throw new Error("The test injects subscription metadata.");
          },
        };
      case "@/lib/api/errors":
        return { rubyWhisperApiErrorResponse: createApiErrorResponse };
      case "@/lib/auth/clerk":
        return { ClerkRequiredAuthState: undefined };
      case "@/lib/auth/desktop-session":
        return {
          requireRubyWhisperDesktopUserId: async () => ({
            error: {
              code: "clerk_session_required",
              message: "A Clerk user session is required.",
            },
            ok: false,
          }),
        };
      case "@/lib/usage/supabase-usage-counters":
        return {
          readRubyWhisperUsageCounters() {
            throw new Error("The test injects usage metadata.");
          },
        };
      default:
        throw new Error(`Unexpected desktop account dependency ${specifier}`);
    }
  });
}

async function loadDesktopAccountSnapshotModule() {
  const quotaService = await loadQuotaServiceModule();

  return loadTypeScriptCommonJsModule(accountSnapshotPath, (specifier) => {
    switch (specifier) {
      case "server-only":
        return {};
      case "@/lib/usage/quota-service":
        return quotaService;
      default:
        throw new Error(`Unexpected account snapshot dependency ${specifier}`);
    }
  });
}

async function loadQuotaServiceModule() {
  const quota = await loadTypeScriptCommonJsModule(usageQuotaPath, (specifier) => {
    if (specifier === "server-only") {
      return {};
    }

    throw new Error(`Unexpected quota dependency ${specifier}`);
  });

  return loadTypeScriptCommonJsModule(quotaServicePath, (specifier) => {
    switch (specifier) {
      case "server-only":
        return {};
      case "./quota":
        return quota;
      case "./supabase-usage-counters":
        return {
          prepareRubyWhisperUsageCounterIncrement() {
            throw new Error("Usage increments are outside this integration test.");
          },
        };
      default:
        throw new Error(`Unexpected quota service dependency ${specifier}`);
    }
  });
}

async function loadStripeSubscriptionCacheModule() {
  return loadTypeScriptCommonJsModule(stripeSubscriptionCachePath, (specifier) => {
    switch (specifier) {
      case "server-only":
        return {};
      case "@/lib/supabase/server":
        return { createSupabaseServiceRoleClient };
      default:
        throw new Error(`Unexpected Stripe cache dependency ${specifier}`);
    }
  });
}

async function loadAccountSubscriptionCacheModule() {
  return loadTypeScriptCommonJsModule(accountSubscriptionCachePath, (specifier) => {
    switch (specifier) {
      case "server-only":
        return {};
      case "@/lib/supabase/server":
        return { createSupabaseServiceRoleClient };
      default:
        throw new Error(`Unexpected account cache dependency ${specifier}`);
    }
  });
}

async function loadFriendOfRubyBatchModule() {
  return loadTypeScriptCommonJsModule(friendOfRubyBatchPath, (specifier) => {
    switch (specifier) {
      case "server-only":
        return {};
      case "@/lib/supabase/server":
        return { createSupabaseServiceRoleClient };
      default:
        throw new Error(`Unexpected Friend of Ruby dependency ${specifier}`);
    }
  });
}

async function loadAdminApiGuardModule() {
  return loadTypeScriptCommonJsModule(adminApiGuardPath, (specifier) => {
    switch (specifier) {
      case "server-only":
        return {};
      case "@supabase/supabase-js":
        return {
          createClient() {
            throw new Error("Live Supabase clients are outside mocked tests.");
          },
        };
      case "@/lib/admin/roles":
        return {
          lookupRubyWhisperAdminRole() {
            throw new Error("The test injects admin role metadata.");
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
      case "@/lib/observability/privacy-logger":
        return {
          createRubyWhisperBackendRequestFailedLogEvent(input) {
            return {
              event: "backend.request.failed",
              metadata: {
                errorCode: input.errorCode,
                method: input.method,
                route: input.route,
                status: input.status,
                userId: input.userId,
              },
            };
          },
        };
      default:
        throw new Error(`Unexpected admin API dependency ${specifier}`);
    }
  });
}

async function loadTypeScriptCommonJsModule(filePath, requireModule) {
  const source = await readFile(filePath, "utf8");
  const commonJsModule = { exports: {} };
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  });

  vm.runInNewContext(
    compiled.outputText,
    {
      Headers,
      Request,
      Response,
      URL,
      exports: commonJsModule.exports,
      module: commonJsModule,
      require: requireModule,
    },
    {
      filename: filePath,
    },
  );

  return commonJsModule.exports;
}

function createSupabaseServiceRoleClient(createClient) {
  return createClient({
    serviceRoleKey: "rw_synthetic_service_role_key",
    url: "https://supabase.rubywhisper.test",
  });
}

function createApiErrorResponse(code) {
  const descriptors = {
    admin_forbidden: {
      desktopState: "blocked",
      httpStatus: 403,
      message: "This account is not a RubyWhisper admin.",
      recovery: "open_account",
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

function createSubscriptionStore() {
  const store = {
    calls: [],
    client: null,
    rows: new Map(),
  };

  store.client = {
    from(tableName) {
      assert.equal(tableName, "subscriptions");

      return {
        select() {
          return {
            eq(columnName, clerkUserId) {
              assert.equal(columnName, "clerk_user_id");

              return {
                async maybeSingle() {
                  store.calls.push({
                    clerkUserId,
                    operation: "subscriptions.select",
                  });

                  return {
                    data: clone(store.rows.get(clerkUserId) ?? null),
                    error: null,
                  };
                },
              };
            },
          };
        },
        upsert(row) {
          return {
            select() {
              return {
                async maybeSingle() {
                  store.calls.push({
                    clerkUserId: row.clerk_user_id,
                    operation: "subscriptions.upsert",
                  });
                  store.rows.set(row.clerk_user_id, clone(row));

                  return {
                    data: clone(row),
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return store;
}

function createFriendOfRubyBatchStore() {
  const store = {
    client: null,
    rows: [],
  };

  store.client = {
    from(tableName) {
      assert.equal(tableName, "friend_of_ruby_batches");

      return {
        insert(batch) {
          const row = {
            ...batch,
            created_at: frozenNow,
            id: "11111111-1111-4111-8111-111111111111",
          };
          store.rows.push(row);

          return {
            select() {
              return {
                async maybeSingle() {
                  return {
                    data: clone(row),
                    error: null,
                  };
                },
              };
            },
          };
        },
        select() {
          return {
            eq(columnName, value) {
              assert.ok(["code", "stripe_promotion_code_id"].includes(columnName));

              return {
                async maybeSingle() {
                  return {
                    data:
                      clone(
                        store.rows.find((row) => row[columnName] === value) ??
                          null,
                      ),
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return store;
}

function stripeEvent(type, object) {
  return {
    api_version: "2026-04-22.dahlia",
    created,
    data: {
      object,
    },
    id: `evt_rw_synthetic_${type.replaceAll(".", "_")}`,
    livemode: false,
    object: "event",
    pending_webhooks: 1,
    request: null,
    type,
  };
}

function stripeSubscription({
  clerkUserId = syntheticBackendFixtures.clerk.memberUserId,
  customerId = "cus_rw_synthetic_member_001",
  friendOfRubyUntil,
  plan = "monthly",
  status = "active",
  subscriptionId = "sub_rw_synthetic_member_001",
} = {}) {
  const priceId =
    plan === "annual"
      ? syntheticPriceIds.annual
      : plan === "monthly"
        ? syntheticPriceIds.monthly
        : "price_friend_synthetic";

  return {
    customer: {
      id: customerId,
      metadata: {
        clerkUserId,
      },
      object: "customer",
    },
    current_period_end: created + 30 * 24 * 60 * 60,
    id: subscriptionId,
    items: {
      data: [
        {
          current_period_end: created + 30 * 24 * 60 * 60,
          price: {
            id: priceId,
          },
        },
      ],
    },
    metadata: {
      clerkUserId,
      ...(friendOfRubyUntil ? { friend_of_ruby_until: friendOfRubyUntil } : {}),
      rubyWhisperPlan: plan,
    },
    object: "subscription",
    status,
  };
}

function profileMetadata(overrides = {}) {
  return {
    clerkUserId: syntheticBackendFixtures.clerk.memberUserId,
    email: syntheticBackendFixtures.clerk.memberEmail,
    isBlocked: false,
    termsAcceptedAt: "2026-05-04T05:00:00.000Z",
    ...overrides,
  };
}

function subscriptionMetadata(overrides = {}) {
  return {
    clerkUserId: syntheticBackendFixtures.clerk.memberUserId,
    hasActiveSubscription: false,
    isFriendOfRubyActive: false,
    paymentFailed: false,
    plan: "trial",
    planState: "trial_active",
    requiresSubscription: false,
    ...overrides,
  };
}

function usageCounters(overrides = {}) {
  const trialWordsLimit = overrides.trialWordsLimit ?? 5_000;
  const trialWordsUsed = Math.min(overrides.trialWordsUsed ?? 0, trialWordsLimit);
  const trialWordsRemaining = Math.max(0, trialWordsLimit - trialWordsUsed);
  const monthlyWordsUsed = overrides.monthlyWordsUsed ?? trialWordsUsed;

  return {
    clerkUserId: syntheticBackendFixtures.clerk.memberUserId,
    isTrialExhausted: trialWordsRemaining === 0,
    isTrialLow: trialWordsRemaining > 0 && trialWordsRemaining <= 500,
    lifetimeWordsUsed: overrides.lifetimeWordsUsed ?? monthlyWordsUsed,
    monthlyPeriodStart: overrides.monthlyPeriodStart ?? "2026-05-01",
    monthlyWordsUsed,
    trialWordsLimit,
    trialWordsRemaining,
    trialWordsUsed,
    ...overrides,
  };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import * as ts from "typescript";

import { createSyntheticBackendRequest } from "./support/backend-integration.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const srcRoot = path.join(webRoot, "src");
const stripeBillingPath = path.join(srcRoot, "lib", "billing", "stripe.ts");
const stripeWebhookIdempotencyPath = path.join(
  srcRoot,
  "lib",
  "billing",
  "stripe-webhook-idempotency.ts",
);
const stripeSubscriptionCachePath = path.join(
  srcRoot,
  "lib",
  "billing",
  "stripe-subscription-cache.ts",
);
const subscriptionCachePath = path.join(
  srcRoot,
  "lib",
  "account",
  "subscription-cache.ts",
);
const webhookRoutePath = path.join(
  srcRoot,
  "app",
  "api",
  "stripe",
  "webhook",
  "route.ts",
);

const created = 1777896000;
const now = "2026-05-04T12:00:00.000Z";
const activeFriendOfRubyUntil = "2027-05-04T12:00:00.000Z";
const expiredFriendOfRubyUntil = "2026-04-04T12:00:00.000Z";
const syntheticSecretKey = ["sk", "test", "rw_synthetic_secret"].join("_");
const syntheticWebhookSecret = ["whsec", "rw_synthetic_webhook_secret"].join("_");
const privateEnvFixture = "rw_private_env_fixture_value";
const privateContentFixtures = [
  "private audio fixture",
  "private transcript fixture",
  "private cleaned text fixture",
  "private clipboard fixture",
  "private prompt fixture",
  privateEnvFixture,
];
const validStripeEnv = {
  annualPriceId: "price_annual_synthetic",
  monthlyPriceId: "price_monthly_synthetic",
  secretKey: syntheticSecretKey,
  webhookSecret: syntheticWebhookSecret,
};

test("signed subscription webhooks update cache and account reads across plan states", async () => {
  const harness = await createWebhookIntegrationHarness();
  const scenarios = [
    {
      eventId: "evt_rw_synthetic_created_paid",
      eventType: "customer.subscription.created",
      expectedPlanState: "paid_active",
      expectedStatus: "active",
      plan: "monthly",
      status: "active",
      subscriptionId: "sub_rw_synthetic_created_paid",
    },
    {
      eventId: "evt_rw_synthetic_updated_attention",
      eventType: "customer.subscription.updated",
      expectedPlanState: "payment_failed",
      expectedStatus: "past_due",
      plan: "annual",
      status: "past_due",
      subscriptionId: "sub_rw_synthetic_updated_attention",
    },
    {
      eventId: "evt_rw_synthetic_deleted_required",
      eventType: "customer.subscription.deleted",
      expectedPlanState: "subscription_required",
      expectedStatus: "canceled",
      plan: "monthly",
      status: "active",
      subscriptionId: "sub_rw_synthetic_deleted_required",
    },
  ];

  for (const scenario of scenarios) {
    const response = await harness.postSignedEvent(
      stripeEvent({
        id: scenario.eventId,
        object: stripeSubscription({
          plan: scenario.plan,
          privateMetadata: privateWebhookMetadata(),
          status: scenario.status,
          subscriptionId: scenario.subscriptionId,
        }),
        type: scenario.eventType,
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      action: "processed",
      ok: true,
      received: true,
    });

    const subscription = await harness.readSubscription();

    assert.equal(subscription.ok, true);
    assert.equal(subscription.subscription.planState, scenario.expectedPlanState);
    assert.equal(subscription.subscription.subscriptionStatus, scenario.expectedStatus);
    assert.equal(subscription.subscription.clerkUserId, "user_rw_synthetic_member_001");
    assert.equal(
      harness.state.webhookEvents.get(scenario.eventId).status,
      "processed",
    );
  }

  assert.equal(harness.state.subscriptionUpserts, 3);
  assertNoPrivateWebhookLeak(harness.state);
});

test("signed Friend of Ruby webhooks update account state and expire safely", async () => {
  const harness = await createWebhookIntegrationHarness();
  const activeResponse = await harness.postSignedEvent(
    stripeEvent({
      id: "evt_rw_synthetic_friend_active",
      object: stripeSubscription({
        friendOfRubyUntil: activeFriendOfRubyUntil,
        plan: "friend_of_ruby",
        privateMetadata: privateWebhookMetadata(),
        priceId: "price_friend_unknown",
        status: "active",
        subscriptionId: "sub_rw_synthetic_friend_active",
      }),
      type: "customer.subscription.updated",
    }),
  );
  const activeSubscription = await harness.readSubscription();

  assert.equal(activeResponse.status, 200);
  assert.deepEqual(await activeResponse.json(), {
    action: "processed",
    ok: true,
    received: true,
  });
  assert.equal(activeSubscription.ok, true);
  assert.equal(activeSubscription.subscription.plan, "friend_of_ruby");
  assert.equal(activeSubscription.subscription.planState, "friend_of_ruby_active");
  assert.equal(activeSubscription.subscription.isFriendOfRubyActive, true);
  assert.equal(activeSubscription.subscription.requiresSubscription, false);
  assert.equal(
    activeSubscription.subscription.friendOfRubyUntil,
    activeFriendOfRubyUntil,
  );

  const expiredResponse = await harness.postSignedEvent(
    stripeEvent({
      id: "evt_rw_synthetic_friend_expired",
      object: stripeSubscription({
        clerkUserId: "user_rw_synthetic_friend_expired_001",
        customerId: "cus_rw_synthetic_friend_expired_001",
        friendOfRubyUntil: expiredFriendOfRubyUntil,
        plan: "friend_of_ruby",
        privateMetadata: privateWebhookMetadata(),
        priceId: "price_friend_unknown",
        status: "active",
        subscriptionId: "sub_rw_synthetic_friend_expired",
      }),
      type: "customer.subscription.updated",
    }),
  );
  const expiredSubscription = await harness.readSubscription(
    "user_rw_synthetic_friend_expired_001",
  );

  assert.equal(expiredResponse.status, 200);
  assert.deepEqual(await expiredResponse.json(), {
    action: "processed",
    ok: true,
    received: true,
  });
  assert.equal(expiredSubscription.ok, true);
  assert.equal(expiredSubscription.subscription.planState, "subscription_required");
  assert.equal(expiredSubscription.subscription.isFriendOfRubyActive, false);
  assert.equal(expiredSubscription.subscription.requiresSubscription, true);
  assert.equal(
    expiredSubscription.subscription.friendOfRubyUntil,
    expiredFriendOfRubyUntil,
  );
  assert.equal(harness.state.subscriptionUpserts, 2);
  assertNoPrivateWebhookLeak(harness.state);
});

test("signed duplicate webhook delivery is acknowledged without rewriting cache", async () => {
  const harness = await createWebhookIntegrationHarness();
  const event = stripeEvent({
    id: "evt_rw_synthetic_duplicate_delivery",
    object: stripeSubscription({
      privateMetadata: privateWebhookMetadata(),
      subscriptionId: "sub_rw_synthetic_duplicate_delivery",
    }),
    type: "customer.subscription.updated",
  });

  const firstResponse = await harness.postSignedEvent(event);
  const duplicateResponse = await harness.postSignedEvent(event);

  assert.equal(firstResponse.status, 200);
  assert.deepEqual(await firstResponse.json(), {
    action: "processed",
    ok: true,
    received: true,
  });
  assert.equal(duplicateResponse.status, 200);
  assert.deepEqual(await duplicateResponse.json(), {
    action: "duplicate",
    ok: true,
    received: true,
  });
  assert.equal(harness.state.webhookEvents.size, 1);
  assert.equal(harness.state.subscriptionUpserts, 1);
  assert.deepEqual(
    harness.state.calls.filter((call) => call.operation === "subscriptions.upsert"),
    [
      {
        clerkUserId: "user_rw_synthetic_member_001",
        operation: "subscriptions.upsert",
      },
    ],
  );
  assertNoPrivateWebhookLeak(harness.state);
});

test("checkout completed metadata and ignored event types stay metadata-only", async () => {
  const harness = await createWebhookIntegrationHarness();
  const checkoutResponse = await harness.postSignedEvent(
    stripeEvent({
      id: "evt_rw_synthetic_checkout_completed",
      object: {
        client_reference_id: "user_rw_synthetic_member_001",
        customer: "cus_rw_synthetic_member_001",
        id: "cs_rw_synthetic_completed",
        metadata: {
          clerkUserId: "user_rw_synthetic_member_001",
          rubyWhisperPlan: "monthly",
          ...privateWebhookMetadata(),
        },
        mode: "subscription",
        object: "checkout.session",
        subscription: "sub_rw_synthetic_checkout_completed",
      },
      type: "checkout.session.completed",
    }),
  );
  const productResponse = await harness.postSignedEvent(
    stripeEvent({
      id: "evt_rw_synthetic_product_ignored",
      object: {
        id: "prod_rw_synthetic",
        metadata: privateWebhookMetadata(),
        object: "product",
      },
      type: "product.updated",
    }),
  );

  assert.equal(checkoutResponse.status, 200);
  assert.equal(productResponse.status, 200);
  assert.deepEqual(await checkoutResponse.json(), {
    action: "ignored",
    ok: true,
    received: true,
  });
  assert.deepEqual(await productResponse.json(), {
    action: "ignored",
    ok: true,
    received: true,
  });
  assert.equal(harness.state.subscriptionUpserts, 0);
  assert.equal(
    harness.state.webhookEvents.get("evt_rw_synthetic_checkout_completed").event_type,
    "checkout.session.completed",
  );
  assert.equal(
    harness.state.webhookEvents.get("evt_rw_synthetic_checkout_completed").status,
    "processed",
  );
  assert.equal(
    harness.state.webhookEvents.get("evt_rw_synthetic_product_ignored").status,
    "processed",
  );
  assertNoPrivateWebhookLeak(harness.state);
});

test("signed webhook integration rejects bad signatures before persistence", async () => {
  const harness = await createWebhookIntegrationHarness();
  const event = stripeEvent({
    id: "evt_rw_synthetic_bad_signature",
    object: stripeSubscription(),
    type: "customer.subscription.updated",
  });
  const response = await harness.postSignedEvent(event, {
    signature: "t=1777896000,v1=bad_signature",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: {
      code: "stripe_webhook_signature_invalid",
      message: "Stripe webhook could not be verified.",
    },
  });
  assert.equal(harness.state.webhookEvents.size, 0);
  assert.equal(harness.state.subscriptionUpserts, 0);
});

async function createWebhookIntegrationHarness() {
  const [billing, idempotency, subscriptionCache, accountSubscriptionCache] =
    await Promise.all([
      loadStripeBillingModule(),
      loadStripeWebhookIdempotencyModule(),
      loadStripeSubscriptionCacheModule(),
      loadSubscriptionCacheModule(),
    ]);
  const routeModule = await loadStripeWebhookRouteModule({
    billing,
    idempotency,
    subscriptionCache,
  });
  const state = createInMemorySupabaseState();
  const createClient = () => state.client;
  const handler = routeModule.createStripeWebhookRouteHandler({
    claimEvent: (input) =>
      idempotency.claimStripeWebhookEvent({ ...input, now }, createClient),
    markEventFailed: (input) =>
      idempotency.markStripeWebhookEventFailed({ ...input, now }, createClient),
    markEventProcessed: (input) =>
      idempotency.markStripeWebhookEventProcessed({ ...input, now }, createClient),
    resolveBillingConfig: () => billing.normalizeStripeBillingConfig(validStripeEnv),
    upsertSubscriptionCache: (input) =>
      subscriptionCache.upsertStripeSubscriptionCacheFromEvent(
        { ...input, now },
        createClient,
      ),
    verifyEvent: (input) =>
      billing.verifyStripeWebhookEvent({
        ...input,
        createClient: createMockStripeWebhookClient,
        env: validStripeEnv,
      }),
  });

  return {
    async postSignedEvent(event, options = {}) {
      const body = JSON.stringify(event);
      const signature =
        options.signature ?? createStripeSignatureHeader(body, syntheticWebhookSecret);

      return handler(
        createSyntheticBackendRequest({
          body,
          headers: {
            "stripe-signature": signature,
          },
          method: "POST",
          origin: "https://backend.rubywhisper.test",
          path: "/api/stripe/webhook",
        }),
      );
    },
    readSubscription(clerkUserId = "user_rw_synthetic_member_001") {
      return accountSubscriptionCache.readRubyWhisperSubscriptionCache(
        { clerkUserId, now },
        createClient,
      );
    },
    state,
  };
}

async function loadStripeBillingModule() {
  const source = await readFile(stripeBillingPath, "utf8");
  const testableSource = source
    .replace(/^import\s+["']server-only["'];\n\n/, "")
    .replace(/import Stripe from "stripe";\n\n/, "")
    .replace(
      /import \{ serverEnv \} from "@\/config\/server";\n\n/,
      "const serverEnv = { stripe: __serverStripeEnv };\n\n",
    );

  return evaluateTypeScriptModule(testableSource, stripeBillingPath, {
    Buffer,
    Stripe: class Stripe {},
    SyntaxError,
    __serverStripeEnv: validStripeEnv,
  });
}

async function loadStripeWebhookIdempotencyModule() {
  const source = await readFile(stripeWebhookIdempotencyPath, "utf8");
  const testableSource = source
    .replace(/^import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+createSupabaseServiceRoleClient,\n\s+type SupabaseServiceRoleClientFactory,\n\}\s+from\s+["']@\/lib\/supabase\/server["'];\n\n/,
      `${createSupabaseServiceRoleClientStub()}\n\n`,
    );

  return evaluateTypeScriptModule(testableSource, stripeWebhookIdempotencyPath);
}

async function loadStripeSubscriptionCacheModule() {
  const source = await readFile(stripeSubscriptionCachePath, "utf8");
  const testableSource = source
    .replace(/^import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import type \{ SupabaseServiceRoleClientFactory \} from "@\/lib\/supabase\/server";\nimport \{ createSupabaseServiceRoleClient \} from "@\/lib\/supabase\/server";\n/,
      `${createSupabaseServiceRoleClientStub()}\n`,
    );

  return evaluateTypeScriptModule(testableSource, stripeSubscriptionCachePath);
}

async function loadSubscriptionCacheModule() {
  const source = await readFile(subscriptionCachePath, "utf8");
  const testableSource = source
    .replace(/^import\s+["']server-only["'];\n\n/, "")
    .replace(
      /import\s+\{\n\s+createSupabaseServiceRoleClient,\n\s+type SupabaseServiceRoleClientFactory,\n\}\s+from\s+["']@\/lib\/supabase\/server["'];\n/,
      `${createSupabaseServiceRoleClientStub()}\n`,
    );

  return evaluateTypeScriptModule(testableSource, subscriptionCachePath);
}

async function loadStripeWebhookRouteModule({
  billing,
  idempotency,
  subscriptionCache,
}) {
  const source = await readFile(webhookRoutePath, "utf8");

  return evaluateTypeScriptModule(source, webhookRoutePath, {
    Headers,
    Request,
    Response,
    Set,
    URL,
    require: (specifier) => {
      switch (specifier) {
        case "server-only":
          return {};
        case "@supabase/supabase-js":
          return {
            createClient() {
              throw new Error("Default Supabase client must not be used in tests.");
            },
          };
        case "@/lib/billing/stripe":
          return billing;
        case "@/lib/billing/stripe-subscription-cache":
          return subscriptionCache;
        case "@/lib/billing/stripe-webhook-idempotency":
          return idempotency;
        default:
          throw new Error(`Unexpected webhook route dependency ${specifier}`);
      }
    },
  });
}

function evaluateTypeScriptModule(source, fileName, sandboxOverrides = {}) {
  const commonJsModule = { exports: {} };
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  });

  vm.runInNewContext(
    compiled.outputText,
    {
      exports: commonJsModule.exports,
      module: commonJsModule,
      ...sandboxOverrides,
    },
    {
      filename: fileName,
    },
  );

  return commonJsModule.exports;
}

function createSupabaseServiceRoleClientStub() {
  return "const createSupabaseServiceRoleClient = (createClient) => createClient({ serviceRoleKey: 'rw_synthetic_service_role_key', url: 'https://supabase.rubywhisper.test' });";
}

function createInMemorySupabaseState() {
  const state = {
    calls: [],
    client: null,
    subscriptionUpserts: 0,
    subscriptions: new Map(),
    webhookEvents: new Map(),
  };
  state.client = {
    from(tableName) {
      if (tableName === "stripe_webhook_events") {
        return stripeWebhookEventsTable(state);
      }

      if (tableName === "subscriptions") {
        return subscriptionsTable(state);
      }

      throw new Error(`Unexpected Supabase table ${tableName}`);
    },
  };

  return state;
}

function stripeWebhookEventsTable(state) {
  return {
    insert(row) {
      return {
        select() {
          return {
            async maybeSingle() {
              state.calls.push({
                eventId: row.stripe_event_id,
                operation: "stripe_webhook_events.insert",
              });

              if (state.webhookEvents.has(row.stripe_event_id)) {
                return { data: null, error: { code: "23505" } };
              }

              state.webhookEvents.set(row.stripe_event_id, clone(row));

              return { data: clone(row), error: null };
            },
          };
        },
      };
    },
    select() {
      return {
        eq(columnName, eventId) {
          assert.equal(columnName, "stripe_event_id");

          return {
            async maybeSingle() {
              state.calls.push({
                eventId,
                operation: "stripe_webhook_events.select",
              });

              return {
                data: clone(state.webhookEvents.get(eventId) ?? null),
                error: null,
              };
            },
          };
        },
      };
    },
    update(update) {
      return {
        select() {
          return {
            eq(columnName, eventId) {
              assert.equal(columnName, "stripe_event_id");

              return {
                async maybeSingle() {
                  state.calls.push({
                    eventId,
                    operation: "stripe_webhook_events.update",
                    status: update.status,
                  });
                  const existing = state.webhookEvents.get(eventId);

                  if (!existing) {
                    return { data: null, error: { code: "PGRST116" } };
                  }

                  const updated = { ...existing, ...clone(update) };
                  state.webhookEvents.set(eventId, updated);

                  return { data: clone(updated), error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

function subscriptionsTable(state) {
  return {
    select() {
      return {
        eq(columnName, clerkUserId) {
          assert.equal(columnName, "clerk_user_id");

          return {
            async maybeSingle() {
              state.calls.push({
                clerkUserId,
                operation: "subscriptions.select",
              });

              return {
                data: clone(state.subscriptions.get(clerkUserId) ?? null),
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
              state.calls.push({
                clerkUserId: row.clerk_user_id,
                operation: "subscriptions.upsert",
              });
              state.subscriptionUpserts += 1;
              state.subscriptions.set(row.clerk_user_id, clone(row));

              return { data: clone(row), error: null };
            },
          };
        },
      };
    },
  };
}

function createMockStripeWebhookClient() {
  return {
    webhooks: {
      constructEvent(rawBody, signatureHeader, webhookSecret) {
        assertStripeSignature(rawBody, signatureHeader, webhookSecret);

        return JSON.parse(rawBody);
      },
    },
  };
}

function createStripeSignatureHeader(payload, secret) {
  const signature = createHmac("sha256", secret)
    .update(`${created}.${payload}`)
    .digest("hex");

  return `t=${created},v1=${signature}`;
}

function assertStripeSignature(rawBody, signatureHeader, webhookSecret) {
  const entries = Object.fromEntries(
    signatureHeader.split(",").map((entry) => entry.split("=", 2)),
  );
  const expectedSignature = createHmac("sha256", webhookSecret)
    .update(`${entries.t}.${rawBody}`)
    .digest("hex");

  if (entries.v1 !== expectedSignature) {
    throw new Error("Synthetic Stripe signature mismatch.");
  }
}

function stripeEvent({ id, object, type }) {
  return {
    api_version: "2026-04-22.dahlia",
    created,
    data: {
      object,
    },
    id,
    livemode: false,
    object: "event",
    pending_webhooks: 1,
    request: null,
    type,
  };
}

function stripeSubscription({
  customerId = "cus_rw_synthetic_member_001",
  clerkUserId = "user_rw_synthetic_member_001",
  friendOfRubyUntil,
  plan = "monthly",
  privateMetadata = {},
  priceId,
  status = "active",
  subscriptionId = "sub_rw_synthetic_member_001",
} = {}) {
  const resolvedPriceId =
    priceId ??
    (plan === "annual"
      ? validStripeEnv.annualPriceId
      : plan === "monthly"
        ? validStripeEnv.monthlyPriceId
        : "price_unknown_synthetic");

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
            id: resolvedPriceId,
          },
        },
      ],
    },
    metadata: {
      clerkUserId,
      ...(friendOfRubyUntil ? { friend_of_ruby_until: friendOfRubyUntil } : {}),
      rubyWhisperPlan: plan,
      ...privateMetadata,
    },
    object: "subscription",
    status,
  };
}

function privateWebhookMetadata() {
  return {
    audio: privateContentFixtures[0],
    clipboard: privateContentFixtures[3],
    cleanedText: privateContentFixtures[2],
    envFixture: privateEnvFixture,
    prompt: privateContentFixtures[4],
    transcript: privateContentFixtures[1],
  };
}

function assertNoPrivateWebhookLeak(state) {
  const persisted = JSON.stringify({
    subscriptions: [...state.subscriptions.values()],
    webhookEvents: [...state.webhookEvents.values()],
  });

  for (const privateFixture of privateContentFixtures) {
    assert.doesNotMatch(persisted, new RegExp(escapeRegExp(privateFixture)));
  }

  assert.doesNotMatch(persisted, new RegExp(escapeRegExp(syntheticWebhookSecret)));
  assert.doesNotMatch(persisted, new RegExp(escapeRegExp(syntheticSecretKey)));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clone(value) {
  return value === null || value === undefined
    ? value
    : JSON.parse(JSON.stringify(value));
}

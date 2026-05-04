import assert from "node:assert/strict";
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
const webhookRoutePath = path.join(
  webRoot,
  "src",
  "app",
  "api",
  "stripe",
  "webhook",
  "route.ts",
);
const created = 1777896000;
const eventId = "evt_rw_synthetic_webhook_001";
const supportedEventType = "customer.subscription.updated";
const validStripeConfig = {
  apiVersion: "2026-04-22.dahlia",
  priceIds: {
    annual: "price_annual_synthetic",
    monthly: "price_monthly_synthetic",
  },
};

test("Stripe webhook route verifies, claims, writes cache, and marks processed", async () => {
  const routeModule = await loadStripeWebhookRouteModule();
  const { calls, handler } = createWebhookHandler(routeModule);
  const response = await handler(
    webhookRequest({
      body: '{"id":"evt_rw_synthetic_webhook_001"}',
      signature: "t=1777896000,v1=rw_signature",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    action: "processed",
    ok: true,
    received: true,
  });
  assert.deepEqual(toPlainObject(calls), [
    {
      input: {
        rawBody: '{"id":"evt_rw_synthetic_webhook_001"}',
        signatureHeader: "t=1777896000,v1=rw_signature",
      },
      operation: "verify",
    },
    {
      input: {
        eventId,
        eventType: supportedEventType,
        stripeCreatedAt: created,
      },
      operation: "claim",
    },
    { operation: "resolve_billing_config" },
    {
      input: {
        event: stripeEvent(),
        priceIds: validStripeConfig.priceIds,
      },
      operation: "upsert_subscription_cache",
    },
    {
      input: { eventId },
      operation: "mark_processed",
    },
  ]);
});

test("Stripe webhook route acknowledges duplicate events without cache writes", async () => {
  const routeModule = await loadStripeWebhookRouteModule();
  const { calls, handler } = createWebhookHandler(routeModule, {
    claimEvent: async (input) => {
      calls.push({ input, operation: "claim" });

      return duplicateClaimResult();
    },
  });
  const response = await handler(webhookRequest());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    action: "duplicate",
    ok: true,
    received: true,
  });
  assert.equal(
    calls.some((call) => call.operation === "upsert_subscription_cache"),
    false,
  );
  assert.equal(calls.some((call) => call.operation === "mark_processed"), false);
});

test("Stripe webhook route ignores unsupported verified events safely", async () => {
  const routeModule = await loadStripeWebhookRouteModule();
  const { calls, handler } = createWebhookHandler(routeModule, {
    verifiedEvent: stripeEvent("product.updated", {
      id: "prod_rw_synthetic",
      object: "product",
    }),
  });
  const response = await handler(webhookRequest());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    action: "ignored",
    ok: true,
    received: true,
  });
  assert.deepEqual(
    calls.map((call) => call.operation),
    ["verify", "claim", "mark_processed"],
  );
});

test("Stripe webhook route rejects invalid signatures before processing", async () => {
  const routeModule = await loadStripeWebhookRouteModule();
  const { calls, handler } = createWebhookHandler(routeModule, {
    verifyEvent: (input) => {
      calls.push({ input, operation: "verify" });

      return {
        error: {
          code: "stripe_webhook_signature_invalid",
          httpStatus: 400,
          invalidFields: [],
          message: "Stripe webhook could not be verified.",
          missingFields: [],
        },
        ok: false,
      };
    },
  });
  const response = await handler(webhookRequest({ signature: "bad_signature" }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: "stripe_webhook_signature_invalid",
      message: "Stripe webhook could not be verified.",
    },
  });
  assert.deepEqual(
    calls.map((call) => call.operation),
    ["verify"],
  );
});

test("Stripe webhook route marks mapping failures without cache writes", async () => {
  const routeModule = await loadStripeWebhookRouteModule();
  const { calls, handler } = createWebhookHandler(routeModule, {
    upsertSubscriptionCache: async (input) => {
      calls.push({ input, operation: "upsert_subscription_cache" });

      return {
        action: "ignored",
        error: {
          code: "missing_stripe_subscription_cache_metadata",
          message: "Required Stripe subscription metadata is missing.",
        },
        ok: false,
        status: "missing_metadata",
      };
    },
  });
  const response = await handler(webhookRequest());
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: "stripe_webhook_event_mapping_failed",
      message: "Stripe webhook event could not be processed.",
    },
  });
  assert.deepEqual(
    calls.map((call) => call.operation),
    ["verify", "claim", "resolve_billing_config", "upsert_subscription_cache", "mark_failed"],
  );
  assert.deepEqual(toPlainObject(calls.at(-1).input), {
    errorCode: "missing_stripe_subscription_cache_metadata",
    eventId,
  });
});

test("Stripe webhook route marks cache write failures for retry", async () => {
  const routeModule = await loadStripeWebhookRouteModule();
  const { calls, handler } = createWebhookHandler(routeModule, {
    upsertSubscriptionCache: async (input) => {
      calls.push({ input, operation: "upsert_subscription_cache" });

      return {
        action: "upsert_failed",
        error: {
          code: "supabase_subscription_cache_write_failed",
          message: "Unable to write subscription cache metadata.",
        },
        ok: false,
        status: "write_failed",
      };
    },
  });
  const response = await handler(webhookRequest());
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: "stripe_webhook_cache_write_failed",
      message: "Stripe webhook event could not be processed.",
    },
  });
  assert.deepEqual(toPlainObject(calls.at(-1).input), {
    errorCode: "supabase_subscription_cache_write_failed",
    eventId,
  });
});

test("Stripe webhook route source stays server-only and metadata-only", async () => {
  const source = await readFile(webhookRoutePath, "utf8");

  assert.match(source, /^import\s+["']server-only["'];/m);
  assert.match(source, /export const runtime = ["']nodejs["'];/);
  assert.match(source, /export const dynamic = ["']force-dynamic["'];/);
  assert.match(source, /verifyStripeWebhookEvent/);
  assert.match(source, /claimStripeWebhookEvent/);
  assert.match(source, /markStripeWebhookEventProcessed/);
  assert.match(source, /markStripeWebhookEventFailed/);
  assert.match(source, /upsertStripeSubscriptionCacheFromEvent/);
  assert.match(source, /Cache-Control["']:\s*["']no-store/);
  assert.doesNotMatch(source, /\bSTRIPE_SECRET_KEY\b|\bSTRIPE_WEBHOOK_SECRET\b/);
  assert.doesNotMatch(source, /\bprocess\.env\b|\bserverEnv\b/);
  assert.doesNotMatch(source, /\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
  assert.doesNotMatch(source, /\bJSON\.stringify\s*\(/);

  for (const privateFragment of [
    "audio",
    "rawTranscript",
    "transcript",
    "cleanedText",
    "clipboard",
    "prompt",
    "payment_method",
    "card",
  ]) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${privateFragment}\\b`),
      `webhook route must not reference private/payment field "${privateFragment}"`,
    );
  }
});

async function loadStripeWebhookRouteModule() {
  const source = await readFile(webhookRoutePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: webhookRoutePath,
  });
  const commonJsModule = { exports: {} };

  vm.runInNewContext(
    compiled.outputText,
    {
      Headers,
      Request,
      Response,
      Set,
      URL,
      exports: commonJsModule.exports,
      module: commonJsModule,
      require: createRouteModuleRequire(),
    },
    {
      filename: webhookRoutePath,
    },
  );

  return commonJsModule.exports;
}

function createRouteModuleRequire() {
  return function requireRouteModule(specifier) {
    switch (specifier) {
      case "server-only":
        return {};
      case "@supabase/supabase-js":
        return {
          createClient() {
            return {
              kind: "mock-supabase-client",
            };
          },
        };
      case "@/lib/billing/stripe":
        return {
          createStripeBillingContext: () => ({
            context: {
              apiVersion: validStripeConfig.apiVersion,
              client: { kind: "mock-stripe-client" },
              priceIds: validStripeConfig.priceIds,
            },
            ok: true,
          }),
          normalizeStripeBillingConfig: () => ({
            config: validStripeConfig,
            ok: true,
          }),
          verifyStripeWebhookEvent: () => ({
            event: stripeEvent(),
            ok: true,
          }),
        };
      case "@/lib/billing/stripe-webhook-idempotency":
        return {
          claimStripeWebhookEvent: async () => claimedResult(),
          markStripeWebhookEventFailed: async () => markedFailedResult(),
          markStripeWebhookEventProcessed: async () => markedProcessedResult(),
        };
      case "@/lib/billing/stripe-subscription-cache":
        return {
          stripeSubscriptionCacheEventTypes: [
            "customer.subscription.created",
            "customer.subscription.deleted",
            "customer.subscription.paused",
            "customer.subscription.resumed",
            "customer.subscription.updated",
          ],
          upsertStripeSubscriptionCacheFromEvent: async () => upsertedResult(),
        };
      default:
        throw new Error(`Unexpected route dependency ${specifier}`);
    }
  };
}

function createWebhookHandler(routeModule, overrides = {}) {
  const calls = [];
  const verifiedEvent = overrides.verifiedEvent ?? stripeEvent();
  const handler = routeModule.createStripeWebhookRouteHandler({
    claimEvent:
      overrides.claimEvent ??
      (async (input) => {
        calls.push({ input, operation: "claim" });

        return claimedResult();
      }),
    markEventFailed:
      overrides.markEventFailed ??
      (async (input) => {
        calls.push({ input, operation: "mark_failed" });

        return markedFailedResult();
      }),
    markEventProcessed:
      overrides.markEventProcessed ??
      (async (input) => {
        calls.push({ input, operation: "mark_processed" });

        return markedProcessedResult();
      }),
    resolveBillingConfig:
      overrides.resolveBillingConfig ??
      (() => {
        calls.push({ operation: "resolve_billing_config" });

        return {
          config: validStripeConfig,
          ok: true,
        };
      }),
    upsertSubscriptionCache:
      overrides.upsertSubscriptionCache ??
      (async (input) => {
        calls.push({ input, operation: "upsert_subscription_cache" });

        return upsertedResult();
      }),
    verifyEvent:
      overrides.verifyEvent ??
      ((input) => {
        calls.push({ input, operation: "verify" });

        return {
          event: verifiedEvent,
          ok: true,
        };
      }),
  });

  return { calls, handler };
}

function webhookRequest(options = {}) {
  const headers = {};
  const signature = options.signature ?? "t=1777896000,v1=rw_signature";

  if (signature !== null) {
    headers["stripe-signature"] = signature;
  }

  return createSyntheticBackendRequest({
    body: options.body ?? '{"id":"evt_rw_synthetic_webhook_001"}',
    headers,
    method: "POST",
    origin: "https://backend.rubywhisper.test",
    path: "/api/stripe/webhook",
  });
}

function stripeEvent(type = supportedEventType, object = stripeSubscription()) {
  return {
    created,
    data: {
      object,
    },
    id: eventId,
    type,
  };
}

function stripeSubscription() {
  return {
    customer: {
      id: "cus_rw_synthetic_member_001",
      metadata: {
        clerkUserId: "user_rw_synthetic_member_001",
      },
      object: "customer",
    },
    current_period_end: created,
    id: "sub_rw_synthetic_member_001",
    items: {
      data: [
        {
          price: {
            id: validStripeConfig.priceIds.monthly,
          },
        },
      ],
    },
    metadata: {
      clerkUserId: "user_rw_synthetic_member_001",
      rubyWhisperPlan: "monthly",
    },
    object: "subscription",
    status: "active",
  };
}

function claimedResult() {
  return {
    action: "claimed",
    event: webhookEventRow({ status: "processing" }),
    ok: true,
    status: "claimed",
  };
}

function duplicateClaimResult() {
  return {
    action: "duplicate",
    event: webhookEventRow({ status: "processed" }),
    ok: false,
    status: "duplicate",
  };
}

function markedProcessedResult() {
  return {
    action: "marked_processed",
    event: webhookEventRow({ status: "processed" }),
    ok: true,
    status: "processed",
  };
}

function markedFailedResult() {
  return {
    action: "marked_failed",
    event: webhookEventRow({ status: "failed" }),
    ok: true,
    status: "failed",
  };
}

function upsertedResult() {
  return {
    action: "upserted",
    ok: true,
    row: {
      clerk_user_id: "user_rw_synthetic_member_001",
      current_period_end: "2026-05-04T12:00:00.000Z",
      friend_of_ruby_until: null,
      plan: "monthly",
      status: "active",
      stripe_customer_id: "cus_rw_synthetic_member_001",
      stripe_subscription_id: "sub_rw_synthetic_member_001",
      updated_at: "2026-05-04T12:00:00.000Z",
    },
    status: "written",
  };
}

function webhookEventRow(overrides = {}) {
  return {
    created_at: "2026-05-04T12:00:00.000Z",
    error_code: null,
    event_type: supportedEventType,
    failed_at: null,
    processed_at: null,
    status: "processing",
    stripe_created_at: "2026-05-04T12:00:00.000Z",
    stripe_event_id: eventId,
    updated_at: "2026-05-04T12:00:00.000Z",
    ...overrides,
  };
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
